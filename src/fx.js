import * as THREE from '../vendor/three.module.min.js';

/** Pooled chunky "voxel" sparks for hits. */
export function createFx(scene) {
  const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
  const pool = [];
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.visible = false;
    m.userData = { vel: new THREE.Vector3(), life: 0 };
    scene.add(m);
    pool.push(m);
  }
  let next = 0;
  return {
    burst(pos, color, n = 8, speed = 4) {
      for (let i = 0; i < n; i++) {
        const m = pool[next++ % pool.length];
        m.position.copy(pos);
        m.material.color.set(color);
        m.userData.vel.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8 + 1, (Math.random() - 0.5) * speed);
        m.userData.life = 0.5 + Math.random() * 0.3;
        m.visible = true;
      }
    },
    update(dt) {
      for (const m of pool) {
        if (!m.visible) continue;
        const u = m.userData;
        u.life -= dt;
        if (u.life <= 0) { m.visible = false; continue; }
        u.vel.y -= 14 * dt;
        m.position.addScaledVector(u.vel, dt);
        m.rotation.x += dt * 8;
        m.rotation.z += dt * 6;
      }
    },
  };
}
