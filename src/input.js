import { clamp } from './util.js';

const params = new URLSearchParams(location.search);
export const isTouchDevice = params.has('touch') || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/**
 * Unified input: keyboard + mouse on desktop, virtual stick / swipe-look / buttons on touch.
 * Gameplay code reads `move`, `block`, and consumes `attack`, `mount`, and camera deltas.
 */
export function createInput(canvas) {
  const input = {
    move: { x: 0, y: 0 },
    block: false,
    attack: null,
    mount: false,
    camDX: 0,
    camDY: 0,
    locked: false,
    consumeCam() {
      const r = [this.camDX, this.camDY];
      this.camDX = this.camDY = 0;
      return r;
    },
  };

  // ---- Keyboard ---------------------------------------------------------------------------
  const keys = new Set();
  const keyAttack = { Digit1: 'overhead', Digit2: 'left', Digit3: 'right', Digit4: 'thrust', Space: 'auto' };
  addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    if (keyAttack[e.code]) input.attack = keyAttack[e.code];
    if (e.code === 'KeyF' || e.code === 'KeyE') input.mount = true;
    if (e.code === 'ShiftLeft' || e.code === 'KeyQ') input.block = true;
  });
  addEventListener('keyup', (e) => {
    keys.delete(e.code);
    if (e.code === 'ShiftLeft' || e.code === 'KeyQ') input.block = false;
  });
  const kbMove = () => {
    const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const y = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  };

  // ---- Mouse (pointer lock) ---------------------------------------------------------------
  let mouseDX = 0, mouseDY = 0, lastMouseT = 0;
  canvas.addEventListener('mousedown', (e) => {
    if (isTouchDevice && !params.has('mouse')) return;
    if (document.pointerLockElement !== canvas) {
      canvas.requestPointerLock?.();
      return;
    }
    if (e.button === 0) {
      const recent = performance.now() - lastMouseT < 180;
      const ax = Math.abs(mouseDX), ay = Math.abs(mouseDY);
      let dir = 'auto';
      if (recent && Math.max(ax, ay) > 6) dir = ax > ay ? (mouseDX > 0 ? 'right' : 'left') : mouseDY < 0 ? 'overhead' : 'thrust';
      input.attack = dir;
    }
    if (e.button === 2) input.block = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 2) input.block = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    input.camDX += e.movementX;
    input.camDY += e.movementY;
    mouseDX = mouseDX * 0.5 + e.movementX;
    mouseDY = mouseDY * 0.5 + e.movementY;
    lastMouseT = performance.now();
  });
  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; });

  // ---- Touch ------------------------------------------------------------------------------
  const ui = document.getElementById('touch-ui');
  if (isTouchDevice) {
    ui.hidden = false;
    document.body.classList.add('touch');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    const R = 56;
    let stickId = null, sx = 0, sy = 0;
    let lookId = null, lx = 0, ly = 0;
    let atkId = null, ax0 = 0, ay0 = 0;
    const atkBtn = document.getElementById('btn-attack');

    const stickMove = (x, y) => {
      let dx = x - sx, dy = y - sy;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.touchMove = { x: dx / R, y: -dy / R };
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && !params.has('touch')) return;
      canvas.setPointerCapture(e.pointerId);
      if (e.clientX < innerWidth * 0.42 && stickId === null) {
        stickId = e.pointerId;
        sx = e.clientX; sy = e.clientY;
        stick.style.left = `${sx}px`;
        stick.style.top = `${sy}px`;
        stick.classList.add('active');
        stickMove(sx, sy);
      } else if (lookId === null) {
        lookId = e.pointerId;
        lx = e.clientX; ly = e.clientY;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === stickId) stickMove(e.clientX, e.clientY);
      else if (e.pointerId === lookId) {
        input.camDX += (e.clientX - lx) * 0.9;
        input.camDY += (e.clientY - ly) * 0.9;
        lx = e.clientX; ly = e.clientY;
      }
    });
    const end = (e) => {
      if (e.pointerId === stickId) {
        stickId = null;
        input.touchMove = null;
        stick.classList.remove('active');
        knob.style.transform = '';
      } else if (e.pointerId === lookId) lookId = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    // Attack button: tap = auto swing, drag up/left/right/down = overhead/left/right/thrust.
    atkBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      atkBtn.setPointerCapture(e.pointerId);
      atkId = e.pointerId;
      ax0 = e.clientX; ay0 = e.clientY;
      atkBtn.classList.add('down');
    });
    const atkEnd = (e) => {
      if (e.pointerId !== atkId) return;
      atkId = null;
      atkBtn.classList.remove('down');
      const dx = e.clientX - ax0, dy = e.clientY - ay0;
      let dir = 'auto';
      if (Math.hypot(dx, dy) > 26) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy < 0 ? 'overhead' : 'thrust';
      input.attack = dir;
    };
    atkBtn.addEventListener('pointerup', atkEnd);
    atkBtn.addEventListener('pointercancel', () => { atkId = null; atkBtn.classList.remove('down'); });

    const blockBtn = document.getElementById('btn-block');
    blockBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); blockBtn.setPointerCapture(e.pointerId); input.block = true; blockBtn.classList.add('down'); });
    const blockEnd = () => { input.block = false; blockBtn.classList.remove('down'); };
    blockBtn.addEventListener('pointerup', blockEnd);
    blockBtn.addEventListener('pointercancel', blockEnd);

    document.getElementById('btn-mount').addEventListener('pointerdown', (e) => { e.preventDefault(); input.mount = true; });

    // Stop iOS from scrolling / zooming / bouncing the page.
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault());
  }

  Object.defineProperty(input, 'moveVec', {
    get() {
      if (input.touchMove) return input.touchMove;
      return kbMove();
    },
  });
  input.touchMove = null;
  input.clampLook = (v) => clamp(v, -1.4, 1.4);
  return input;
}
