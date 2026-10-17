import * as THREE from '../vendor/three.module.min.js';
import { createWorld } from './world.js';
import { createInput, isTouchDevice } from './input.js';
import { createHud } from './hud.js';
import { createFx } from './fx.js';
import { sfx } from './sfx.js';
import { Player } from './player.js';
import { createCamps } from './enemy.js';
import { angleDiff } from './util.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouchDevice ? 2 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 1400);

const game = {
  scene, camera, renderer, sfx,
  enemies: [],
  camps: [],
  time: 0,
  running: false,
  world: createWorld(scene, { mobile: isTouchDevice }),
  input: createInput(canvas),
  fx: createFx(scene),
};
game.hud = createHud(game);
game.player = new Player(game);
game.camps = createCamps(game);
window.game = game; // handy for debugging in the console

game.nearestEnemy = (pos, range, yaw, halfAngle) => {
  let best = null, bd = range;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > bd) continue;
    if (Math.abs(angleDiff(Math.atan2(dx, dz), yaw)) > halfAngle) continue;
    best = e; bd = d;
  }
  return best;
};

game.alertCamp = (camp, source) => {
  for (const b of camp.bandits) {
    if (b !== source && !b.dead && b.state === 'idle') b.state = 'chase';
  }
};

game.onBanditDied = (b) => {
  const camp = b.camp;
  if (camp.bandits.every((x) => x.dead)) {
    camp.cleared = true;
    camp.respawnT = 120;
    game.player.gold += 50;
    game.hud.toast(`${camp.zone.name} cleared! +50 denars`, 2.6);
    sfx.coin();
    updateObjective();
  }
};

function updateObjective() {
  const left = game.camps.filter((c) => !c.cleared).length;
  game.hud.setObjective(left ? `Clear the bandit camps (${left} remaining) — follow the red markers` : 'All camps cleared. They will return — stay sharp.');
}
updateObjective();

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---- Title / pause handling -------------------------------------------------------------------
const title = document.getElementById('title');
function start() {
  sfx.unlock();
  title.hidden = true;
  game.running = true;
  if (!isTouchDevice) canvas.requestPointerLock?.();
}
title.addEventListener('pointerdown', start);
document.getElementById('death').addEventListener('pointerdown', () => game.player.respawn());
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !game.player.alive) game.player.respawn();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.running) {
    game.running = false;
    title.hidden = false;
    document.getElementById('title-cta').textContent = 'Paused — tap to resume';
  }
});
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && game.running && !isTouchDevice) {
    game.running = false;
    title.hidden = false;
    document.getElementById('title-cta').textContent = 'Paused — click to resume';
  }
});

// ---- Main loop --------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.running) {
    game.time += dt;
    game.player.update(dt);
    for (const e of game.enemies) e.update(dt);
    for (const c of game.camps) {
      if (c.cleared && (c.respawnT -= dt) <= 0) {
        c.cleared = false;
        for (const b of c.bandits) b.reset();
        game.hud.toast(`Bandits have returned to ${c.zone.name}`, 2.2);
        updateObjective();
      }
    }
    game.fx.update(dt);
    game.hud.update(dt);
  } else {
    game.player.updateCamera(dt);
  }
  game.world.update(dt, game.time, game.player.pos, camera);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
