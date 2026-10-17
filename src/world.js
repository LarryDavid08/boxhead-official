import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, smoothstep, mulberry32 } from './util.js';

export const WORLD_SIZE = 440;
export const WORLD_LIMIT = 198;
export const WATER_LEVEL = -5;
const CELL = 4;
const N = WORLD_SIZE / CELL;
const HALF = WORLD_SIZE / 2;

function hash(ix, iz) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return lerp(lerp(hash(ix, iz), hash(ix + 1, iz), u), lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}
function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f + i * 17.3, z * f - i * 9.1);
    f *= 2;
    a *= 0.5;
  }
  return s;
}

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export function createWorld(scene, { mobile = false } = {}) {
  const rand = mulberry32(1337);

  // Flat building areas the terrain is blended into.
  const zones = [
    { name: 'Riverbend', x: 0, z: 0, r: 34 },
    { name: 'Camp 1', x: 95, z: 70, r: 20 },
    { name: 'Camp 2', x: -115, z: -45, r: 20 },
    { name: 'Camp 3', x: 40, z: -135, r: 20 },
  ];
  const raw = (x, z) => (fbm(x / 110 + 3.1, z / 110 - 7.7) - 0.47) * 58 + (fbm(x / 28, z / 28, 2) - 0.47) * 3.5;
  for (const zn of zones) zn.h = Math.max(raw(zn.x, zn.z), 1.0);

  const terrainFn = (x, z) => {
    let h = raw(x, z);
    for (const zn of zones) {
      const w = smoothstep(zn.r * 1.9, zn.r * 0.9, Math.hypot(x - zn.x, z - zn.z));
      if (w > 0) h = lerp(h, zn.h, w);
    }
    return h + smoothstep(165, 215, Math.hypot(x, z)) * 34;
  };

  const heights = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) heights[j * (N + 1) + i] = terrainFn(-HALF + i * CELL, -HALF + j * CELL);
  }
  const H = (i, j) => heights[j * (N + 1) + i];

  // Height lookup that matches the rendered triangles exactly, so feet never float or sink.
  function heightAt(x, z) {
    const gx = clamp((x + HALF) / CELL, 0, N - 0.001);
    const gz = clamp((z + HALF) / CELL, 0, N - 0.001);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1);
    return fx + fz <= 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
  }
  function normalY(x, z) {
    const e = 1.5;
    const dx = heightAt(x + e, z) - heightAt(x - e, z);
    const dz = heightAt(x, z + e) - heightAt(x, z - e);
    return 1 / Math.sqrt(1 + (dx / (2 * e)) ** 2 + (dz / (2 * e)) ** 2);
  }
  const forestAt = (x, z) => fbm(x / 55 + 40, z / 55 + 11, 3);

  // ---- Terrain mesh: flat-shaded triangles with a colour per face ----------------------------
  {
    const pos = [], col = [];
    const color = new THREE.Color();
    const palette = {
      sand: new THREE.Color(0xcdb97f),
      grass: new THREE.Color(0x66a03f),
      forest: new THREE.Color(0x4b7f35),
      high: new THREE.Color(0x86a85a),
      rock: new THREE.Color(0x857d70),
      snow: new THREE.Color(0xe8ecee),
      dirt: new THREE.Color(0x8d7550),
    };
    const tri = (p0, p1, p2) => {
      pos.push(...p0, ...p1, ...p2);
      const cx = (p0[0] + p1[0] + p2[0]) / 3, cz = (p0[2] + p1[2] + p2[2]) / 3;
      const ch = (p0[1] + p1[1] + p2[1]) / 3;
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz);
      const up = ny / nl;
      if (ch < WATER_LEVEL + 1.4) color.copy(palette.sand);
      else if (up < 0.8) color.copy(palette.rock);
      else if (ch > 38) color.copy(palette.snow);
      else if (ch > 24) color.copy(palette.rock).lerp(palette.high, 0.4);
      else {
        color.copy(palette.grass).lerp(palette.forest, smoothstep(0.44, 0.58, forestAt(cx, cz)));
        color.lerp(palette.high, smoothstep(10, 22, ch) * 0.7);
        if (up < 0.88) color.lerp(palette.dirt, 0.5);
      }
      for (const z of zones) if (Math.hypot(cx - z.x, cz - z.z) < z.r * (z.name === 'Riverbend' ? 0.5 : 0.8)) color.lerp(palette.dirt, 0.35);
      color.multiplyScalar(0.9 + rand() * 0.2);
      for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
    };
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x0 = -HALF + i * CELL, z0 = -HALF + j * CELL;
        const a = [x0, H(i, j), z0], b = [x0 + CELL, H(i + 1, j), z0];
        const c = [x0, H(i, j + 1), z0 + CELL], d = [x0 + CELL, H(i + 1, j + 1), z0 + CELL];
        tri(a, c, b);
        tri(b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const terrain = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    terrain.receiveShadow = true;
    scene.add(terrain);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(WORLD_SIZE * 1.8, WORLD_SIZE * 1.8),
      new THREE.MeshLambertMaterial({ color: 0x3f86bd, transparent: true, opacity: 0.82, flatShading: true }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_LEVEL;
    scene.add(water);
  }

  // ---- Colliders (circles on the ground plane) ------------------------------------------------
  const colliders = [];
  const nearZone = (x, z, pad) => zones.some((zn) => Math.hypot(x - zn.x, z - zn.z) < zn.r + pad);

  // ---- Trees and rocks (instanced) -----------------------------------------------------------
  {
    const pines = [], oaks = [], rocks = [];
    for (let tries = 0; tries < 30000 && pines.length + oaks.length < (mobile ? 700 : 1100); tries++) {
      const x = (rand() - 0.5) * 2 * WORLD_LIMIT * 1.1, z = (rand() - 0.5) * 2 * WORLD_LIMIT * 1.1;
      const h = heightAt(x, z);
      if (h < WATER_LEVEL + 1.8 || h > 30 || nearZone(x, z, 5) || normalY(x, z) < 0.86) continue;
      if (rand() > smoothstep(0.42, 0.6, forestAt(x, z)) * 0.92 + 0.012) continue;
      const s = 0.8 + rand() * 0.8;
      (h > 12 || rand() < 0.55 ? pines : oaks).push({ x, y: h, z, s, rot: rand() * 6.28 });
      colliders.push({ x, z, r: 0.55 * s });
    }
    for (let tries = 0; tries < 4000 && rocks.length < 160; tries++) {
      const x = (rand() - 0.5) * 2 * WORLD_LIMIT * 1.1, z = (rand() - 0.5) * 2 * WORLD_LIMIT * 1.1;
      const h = heightAt(x, z);
      if (h < WATER_LEVEL + 0.5 || nearZone(x, z, 4)) continue;
      const s = 0.6 + rand() * 1.8;
      rocks.push({ x, y: h, z, s, rot: rand() * 6.28, sy: 0.5 + rand() * 0.7 });
      if (s > 1.2) colliders.push({ x, z, r: s * 0.85 });
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    const make = (geo, material, list, tint, sy = () => 1) => {
      const im = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
      list.forEach((t, i) => {
        q.setFromAxisAngle(up, t.rot);
        p.set(t.x, t.y - 0.1, t.z);
        sc.set(t.s, t.s * sy(t), t.s);
        m4.compose(p, q, sc);
        im.setMatrixAt(i, m4);
        c.set(tint(t, i));
        im.setColorAt(i, c);
      });
      im.count = list.length;
      im.castShadow = true;
      im.receiveShadow = true;
      scene.add(im);
      return im;
    };
    const white = (extra) => new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, ...extra });
    const trunk = new THREE.CylinderGeometry(0.2, 0.34, 2.4, 5); trunk.translate(0, 1.2, 0);
    const pine1 = new THREE.ConeGeometry(2.1, 3.4, 6); pine1.translate(0, 3.3, 0);
    const pine2 = new THREE.ConeGeometry(1.5, 2.8, 6); pine2.translate(0, 5.1, 0);
    const oak = new THREE.IcosahedronGeometry(2.0, 0); oak.scale(1, 0.85, 1); oak.translate(0, 3.9, 0);
    const brown = () => 0x6b4a2b;
    const pineGreen = () => new THREE.Color().setHSL(0.36 + rand() * 0.04, 0.45, 0.22 + rand() * 0.08).getHex();
    const oakGreen = () => new THREE.Color().setHSL(0.25 + rand() * 0.06, 0.5, 0.3 + rand() * 0.08).getHex();
    make(trunk, white(), pines, brown);
    make(pine1, white(), pines, pineGreen);
    make(pine2, white(), pines, pineGreen);
    make(trunk, white(), oaks, brown);
    make(oak, white(), oaks, oakGreen);
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    make(rockGeo, white(), rocks, () => new THREE.Color().setHSL(0.09, 0.06, 0.38 + rand() * 0.14).getHex(), (t) => t.sy);
  }

  // ---- Settlement and camps ----------------------------------------------------------------
  const flags = [];
  const fires = [];
  const add = (obj) => { scene.add(obj); return obj; };
  const boxMesh = (w, h, d, color, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    return add(m);
  };
  const coneMesh = (r, h, seg, color, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat(color));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = true;
    return add(m);
  };
  const cylMesh = (rt, rb, h, seg, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    return add(m);
  };
  function banner(x, z, y, color, height = 5) {
    cylMesh(0.08, 0.1, height, 5, 0x4a3524, x, y + height / 2, z);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 0.04), mat(color, { side: THREE.DoubleSide }));
    flag.position.set(x + 0.8, y + height - 0.6, z);
    flag.castShadow = true;
    flag.userData.base = flag.position.x;
    add(flag);
    flags.push(flag);
  }
  function house(x, z, y, ry, wall, roof) {
    const w = 6.4, d = 5, hgt = 3.2;
    boxMesh(w, hgt, d, wall, x, y + hgt / 2, z, ry);
    const r = coneMesh(4.9, 2.6, 4, roof, x, y + hgt + 1.3, z, ry + Math.PI / 4);
    r.scale.set(1.12, 1, 0.92);
    const dx = Math.sin(ry) * (d / 2 + 0.02), dz = Math.cos(ry) * (d / 2 + 0.02);
    boxMesh(1.1, 2.0, 0.1, 0x4d3420, x + dx, y + 1.0, z + dz, ry);
    colliders.push({ x, z, r: 3.5 });
  }

  const village = zones[0];
  {
    const wallColors = [0xd9c9a2, 0xcdb88a, 0xe0d2b0, 0xbfae86];
    const roofColors = [0x9a3d2b, 0x7e4a2e, 0xa3502f];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const rr = 19 + (i % 2) * 4;
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      house(x, z, village.h, Math.atan2(-x, -z), wallColors[i % 4], roofColors[i % 3]);
    }
    cylMesh(1.5, 1.7, 1.0, 8, 0x8b887f, 0, village.h + 0.5, 0);
    cylMesh(1.2, 1.2, 0.1, 8, 0x2f6fa3, 0, village.h + 0.9, 0);
    colliders.push({ x: 0, z: 0, r: 1.8 });
    for (const a of [0.8, 2.4, 4.0, 5.6]) banner(Math.sin(a) * 9, Math.cos(a) * 9, village.h, 0x2a5fb0, 5.5);
    for (let i = 0; i < 6; i++) {
      const a = rand() * 6.28, rr = 8 + rand() * 6;
      boxMesh(1.2, 0.8, 0.9, 0xc9a24a, Math.sin(a) * rr, village.h + 0.4, Math.cos(a) * rr, rand() * 3);
    }
  }
  for (const zn of zones.slice(1)) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6, rr = 11;
      const x = zn.x + Math.sin(a) * rr, z = zn.z + Math.cos(a) * rr;
      const tent = coneMesh(2.9, 3.2, 5, i % 2 ? 0x7a6a4f : 0x5e4a38, x, zn.h + 1.6, z, rand() * 3);
      tent.scale.set(1, 1, 1);
      colliders.push({ x, z, r: 2.5 });
    }
    cylMesh(0.9, 1.1, 0.35, 7, 0x5b5a56, zn.x, zn.h + 0.17, zn.z);
    const fire = coneMesh(0.55, 1.3, 5, 0xff8a1f, zn.x, zn.h + 0.9, zn.z);
    fire.material = new THREE.MeshBasicMaterial({ color: 0xff9a2a });
    fire.castShadow = false;
    fires.push(fire);
    colliders.push({ x: zn.x, z: zn.z, r: 1.2 });
    banner(zn.x + 4, zn.z + 5, zn.h, 0xa61e1e, 6);
    for (let i = 0; i < 4; i++) {
      const a = rand() * 6.28, rr = 5 + rand() * 6;
      boxMesh(1.0, 1.0, 1.0, 0x8a6a3c, zn.x + Math.sin(a) * rr, zn.h + 0.5, zn.z + Math.cos(a) * rr, rand() * 3);
    }
  }

  // ---- Sky -------------------------------------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(600, 24, 12);
  {
    const top = new THREE.Color(0x5e9ad6), mid = new THREE.Color(0xa9d2ee), hor = new THREE.Color(0xe6f0e8);
    const colors = [];
    const posA = skyGeo.attributes.position;
    const c = new THREE.Color();
    for (let i = 0; i < posA.count; i++) {
      const t = clamp(posA.getY(i) / 600, 0, 1);
      c.copy(hor).lerp(mid, smoothstep(0, 0.25, t)).lerp(top, smoothstep(0.25, 0.9, t));
      colors.push(c.r, c.g, c.b);
    }
    skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  }
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xe0ece6, 110, 330);
  scene.background = new THREE.Color(0xe0ece6);

  const sun = new THREE.Mesh(new THREE.IcosahedronGeometry(14, 0), new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  sun.position.set(-260, 280, -330);
  scene.add(sun);

  const clouds = [];
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const parts = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < parts; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(10 + rand() * 8, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, fog: false }));
      m.scale.y = 0.45;
      m.position.set(k * 14 - parts * 7, rand() * 4, rand() * 8);
      g.add(m);
    }
    g.position.set((rand() - 0.5) * 700, 95 + rand() * 40, (rand() - 0.5) * 700);
    scene.add(g);
    clouds.push(g);
  }

  // ---- Lighting --------------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x6f7f4a, 1.35);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight(0xfff0d2, 2.4);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  const sc = sunLight.shadow.camera;
  sc.left = sc.bottom = -48;
  sc.right = sc.top = 48;
  sc.near = 10;
  sc.far = 400;
  sunLight.shadow.bias = -0.0008;
  sunLight.shadow.normalBias = 0.5;
  scene.add(sunLight, sunLight.target);
  const sunOffset = new THREE.Vector3(70, 120, 50);

  return {
    zones,
    colliders,
    heightAt,
    normalY,
    spawn: { x: 0, z: -8 },
    /** Push a circle out of any colliders and keep it inside the world. */
    resolve(pos, radius) {
      for (const c of colliders) {
        const dx = pos.x - c.x;
        if (dx > c.r + radius || dx < -c.r - radius) continue;
        const dz = pos.z - c.z;
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 0.0001;
          pos.x = c.x + (dx / d) * min;
          pos.z = c.z + (dz / d) * min;
        }
      }
      const rd = Math.hypot(pos.x, pos.z);
      if (rd > WORLD_LIMIT) {
        pos.x *= WORLD_LIMIT / rd;
        pos.z *= WORLD_LIMIT / rd;
      }
    },
    inWater: (x, z) => heightAt(x, z) < WATER_LEVEL + 0.3,
    update(dt, t, focus, camera) {
      sky.position.copy(camera.position);
      sunLight.position.copy(focus).add(sunOffset);
      sunLight.target.position.copy(focus);
      for (const f of flags) f.rotation.y = Math.sin(t * 3 + f.position.z) * 0.25;
      fires.forEach((f, i) => {
        f.scale.set(1 + Math.sin(t * 11 + i) * 0.12, 1 + Math.sin(t * 17 + i * 2) * 0.2, 1);
      });
      for (const c of clouds) {
        c.position.x += dt * 2.2;
        if (c.position.x > 400) c.position.x = -400;
      }
    },
  };
}
