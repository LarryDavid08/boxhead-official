import * as THREE from '../vendor/three.module.min.js';
import { damp, lerp } from './util.js';

const lambert = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function part(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d, material, x, y, z) => part(new THREE.BoxGeometry(w, h, d), material, x, y, z);

// Right-arm keyframes as [rotation.x, rotation.z]. Arm hangs along -Y; -x raises it forward,
// +z swings it toward the model's left.
const REST = [-0.25, -0.15];
const SWINGS = {
  overhead: { wind: [-3.05, -0.1], strike: [-0.1, -0.05], twist: 0 },
  left: { wind: [-1.25, -0.45], strike: [-1.25, 1.95], twist: 0.5 },
  right: { wind: [-1.25, 0.85], strike: [-1.25, -1.95], twist: -0.5 },
  thrust: { wind: [0.55, -0.3], strike: [-1.55, -0.05], twist: 0 },
};
export const SWING_DIRS = Object.keys(SWINGS);
const ease = (k) => k * k * (3 - 2 * k);
const mix2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

export const STRIKE_T = 0.6;

function swingPose(dir, t) {
  const s = SWINGS[dir];
  if (t < 0.5) return { arm: mix2(REST, s.wind, ease(t / 0.5)), twist: s.twist * -0.5 * ease(t / 0.5) };
  if (t < STRIKE_T) return { arm: mix2(s.wind, s.strike, ease((t - 0.5) / (STRIKE_T - 0.5))), twist: s.twist * lerp(-0.5, 1, ease((t - 0.5) / (STRIKE_T - 0.5))) };
  return { arm: mix2(s.strike, REST, ease((t - STRIKE_T) / (1 - STRIKE_T))), twist: s.twist * (1 - ease((t - STRIKE_T) / (1 - STRIKE_T))) };
}

/** Blocky low-poly person. Origin at the feet, facing +Z. */
export class Humanoid {
  constructor({ tunic = 0x2f5fa8, pants = 0x4a3f36, skin = 0xe0b48c, hair = 0x3a2a1c, helm = null, shield = 0x2f5fa8, blade = 0xc8ced6, headband = null, scale = 1 } = {}) {
    this.root = new THREE.Group();
    this.mats = [];
    const M = (c) => { const m = lambert(c); this.mats.push(m); return m; };
    const mTunic = M(tunic), mPants = M(pants), mSkin = M(skin), mBoot = M(0x2a1f18);

    this.legL = new THREE.Group(); this.legL.position.set(0.15, 0.92, 0);
    this.legR = new THREE.Group(); this.legR.position.set(-0.15, 0.92, 0);
    for (const leg of [this.legL, this.legR]) {
      leg.add(box(0.22, 0.6, 0.25, mPants, 0, -0.3, 0));
      leg.add(box(0.24, 0.34, 0.3, mBoot, 0, -0.75, 0.02));
      this.root.add(leg);
    }

    this.body = new THREE.Group();
    this.body.position.set(0, 0.92, 0);
    this.root.add(this.body);
    this.body.add(box(0.56, 0.68, 0.32, mTunic, 0, 0.36, 0));
    this.body.add(box(0.6, 0.1, 0.34, M(0x3b2a1d), 0, 0.04, 0));
    const head = new THREE.Group();
    head.position.set(0, 0.9, 0);
    head.add(box(0.28, 0.3, 0.28, mSkin, 0, 0.14, 0));
    head.add(box(0.3, 0.12, 0.3, M(hair), 0, 0.3, -0.02));
    if (helm != null) {
      const dome = part(new THREE.SphereGeometry(0.2, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2), M(helm), 0, 0.26, 0);
      head.add(dome);
      head.add(box(0.05, 0.2, 0.05, M(helm), 0, 0.15, 0.17));
    }
    if (headband != null) head.add(box(0.31, 0.07, 0.31, M(headband), 0, 0.23, 0));
    this.body.add(head);
    this.head = head;

    // Sword arm (model right = -X)
    this.armR = new THREE.Group();
    this.armR.position.set(-0.37, 0.68, 0);
    this.armR.add(box(0.16, 0.62, 0.16, mTunic, 0, -0.29, 0));
    this.armR.add(box(0.14, 0.14, 0.14, mSkin, 0, -0.65, 0));
    const sword = new THREE.Group();
    sword.position.set(0, -0.68, 0);
    sword.add(box(0.05, 0.12, 0.05, M(0x3b2a1d), 0, 0, 0));
    sword.add(box(0.3, 0.05, 0.06, M(0x8c7a3c), 0, -0.07, 0));
    sword.add(box(0.07, 0.95, 0.02, M(blade), 0, -0.56, 0));
    sword.add(box(0.03, 0.1, 0.03, M(blade), 0, -1.08, 0));
    this.armR.add(sword);
    this.body.add(this.armR);

    this.armL = new THREE.Group();
    this.armL.position.set(0.37, 0.68, 0);
    this.armL.add(box(0.16, 0.62, 0.16, mTunic, 0, -0.29, 0));
    this.armL.add(box(0.14, 0.14, 0.14, mSkin, 0, -0.65, 0));
    this.body.add(this.armL);

    // Round shield hangs at the hip and comes up to guard the front.
    this.shield = new THREE.Group();
    const disc = part(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 8), M(shield));
    disc.rotation.x = Math.PI / 2;
    this.shield.add(disc);
    const boss = part(new THREE.ConeGeometry(0.1, 0.1, 6), M(0xbfc4cc), 0, 0, 0.08);
    boss.rotation.x = Math.PI / 2;
    this.shield.add(boss);
    this.body.add(this.shield);

    this.root.scale.setScalar(scale);
    this.blockBlend = 0;
    this.flashT = 0;
  }

  flash(t = 0.18) { this.flashT = t; }

  /** state: { phase, moveAmt, swingDir, swingT, block, mounted } */
  pose(s, dt) {
    const { phase = 0, moveAmt = 0, swingDir = null, swingT = 0, block = false, mounted = false } = s;
    this.blockBlend = damp(this.blockBlend, block ? 1 : 0, 16, dt);
    const b = this.blockBlend;

    if (mounted) {
      this.legL.rotation.set(-0.55, 0, 0.42);
      this.legR.rotation.set(-0.55, 0, -0.42);
    } else {
      const sw = Math.sin(phase) * 0.85 * moveAmt;
      this.legL.rotation.set(sw, 0, 0);
      this.legR.rotation.set(-sw, 0, 0);
    }
    this.body.position.y = 0.92 + (mounted ? 0 : Math.abs(Math.sin(phase)) * 0.05 * moveAmt);
    this.body.rotation.x = mounted ? 0.06 : moveAmt * 0.1;

    let twist = 0;
    if (swingDir) {
      const p = swingPose(swingDir, swingT);
      this.armR.rotation.set(p.arm[0], 0, p.arm[1]);
      twist = p.twist;
    } else {
      const swing = Math.sin(phase + Math.PI) * 0.55 * moveAmt;
      this.armR.rotation.set(REST[0] + swing - b * 0.4, 0, REST[1]);
    }
    this.body.rotation.y = twist;

    const lSwing = Math.sin(phase) * 0.55 * moveAmt;
    this.armL.rotation.set(lerp(0.0 + lSwing, -1.35, b), 0, lerp(0.15, -0.35, b));
    // shield: rest at the left hip, edge-on; block = face forward in front of the chest
    this.shield.position.set(lerp(0.42, 0.1, b), lerp(0.22, 0.52, b), lerp(-0.05, 0.42, b));
    this.shield.rotation.set(0, lerp(Math.PI / 2, 0, b), 0);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const e = this.flashT > 0 ? 0.7 : 0;
      for (const m of this.mats) m.emissive.setRGB(e, e * 0.15, e * 0.1);
    }
  }
}

/** Blocky low-poly horse. Origin at the ground, facing +Z, saddle at y ~1.7. */
export class Horse {
  constructor({ coat = 0x6b4226, mane = 0x1f140d, blanket = 0x2f5fa8 } = {}) {
    this.root = new THREE.Group();
    this.pivot = new THREE.Group(); // pitch/bob
    this.root.add(this.pivot);
    const mCoat = lambert(coat), mMane = lambert(mane), mHoof = lambert(0x1b1410);
    this.pivot.add(box(0.82, 0.85, 1.95, mCoat, 0, 1.25, 0));
    this.pivot.add(box(0.7, 0.7, 0.5, mCoat, 0, 1.3, 0.85));
    this.pivot.add(box(0.7, 0.72, 0.5, mCoat, 0, 1.28, -0.8));

    const neck = new THREE.Group();
    neck.position.set(0, 1.55, 0.95);
    neck.rotation.x = 0.62;
    neck.add(box(0.3, 0.95, 0.4, mCoat, 0, 0.4, 0));
    neck.add(box(0.1, 0.95, 0.2, mMane, 0, 0.42, -0.24));
    const head = new THREE.Group();
    head.position.set(0, 0.9, 0);
    head.rotation.x = 1.55;
    head.add(box(0.26, 0.62, 0.3, mCoat, 0, 0.22, 0));
    head.add(box(0.22, 0.2, 0.26, mCoat, 0, 0.58, 0.02));
    head.add(box(0.04, 0.18, 0.06, mCoat, 0.1, -0.1, -0.12));
    head.add(box(0.04, 0.18, 0.06, mCoat, -0.1, -0.1, -0.12));
    neck.add(head);
    this.pivot.add(neck);
    this.neck = neck;
    this.head = head;

    this.tail = new THREE.Group();
    this.tail.position.set(0, 1.55, -0.98);
    this.tail.rotation.x = 0.45;
    this.tail.add(box(0.12, 0.85, 0.14, mMane, 0, -0.42, 0));
    this.pivot.add(this.tail);

    this.pivot.add(box(0.86, 0.06, 0.72, lambert(blanket), 0, 1.68, -0.05));
    this.pivot.add(box(0.5, 0.1, 0.5, lambert(0x5a3820), 0, 1.74, -0.05));

    this.legs = [];
    const legDefs = [[0.27, 0.68, 0], [-0.27, 0.68, Math.PI], [0.27, -0.72, Math.PI], [-0.27, -0.72, 0]];
    for (const [x, z, off] of legDefs) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.92, z);
      leg.add(box(0.2, 0.55, 0.22, mCoat, 0, -0.27, 0));
      leg.add(box(0.15, 0.4, 0.17, mCoat, 0, -0.72, 0));
      leg.add(box(0.19, 0.12, 0.23, mHoof, 0, -0.95, 0.01));
      leg.userData.off = off;
      this.pivot.add(leg);
      this.legs.push(leg);
    }
  }

  /** speedNorm 0..1 */
  animate(phase, speedNorm, t, pitch) {
    const amp = 0.35 + speedNorm * 0.6;
    for (const leg of this.legs) {
      leg.rotation.x = speedNorm > 0.02 ? Math.sin(phase + leg.userData.off) * amp : 0;
    }
    this.pivot.position.y = Math.abs(Math.sin(phase)) * 0.08 * speedNorm;
    this.pivot.rotation.x = pitch;
    this.neck.rotation.x = 0.62 + Math.sin(phase * 2) * 0.05 * speedNorm + Math.sin(t * 1.3) * 0.02;
    this.tail.rotation.x = 0.45 + Math.sin(phase * 2 + 1) * 0.15 * speedNorm + Math.sin(t * 2) * 0.04;
  }
}
