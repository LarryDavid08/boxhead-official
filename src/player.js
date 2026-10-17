import * as THREE from '../vendor/three.module.min.js';
import { Humanoid, Horse, STRIKE_T } from './lowpoly.js';
import { angleDiff, approach, clamp, damp, lerp } from './util.js';

const HORSE_MAX = 14;
const FOOT_RUN = 5.6;
const SWING_TIME = 0.62;
const AUTO_ORDER = ['right', 'left'];

// Where each swing lands relative to the facing direction, and how it hits.
const HIT = {
  overhead: { off: 0, half: 0.75, reach: 0, dmg: 1.25 },
  left: { off: 0.8, half: 0.85, reach: 0, dmg: 1.0 },
  right: { off: -0.8, half: 0.85, reach: 0, dmg: 1.0 },
  thrust: { off: 0, half: 0.4, reach: 0.9, dmg: 1.1 },
};

export class Player {
  constructor(game) {
    this.game = game;
    const w = game.world;
    this.pos = new THREE.Vector3(w.spawn.x, 0, w.spawn.z);
    this.pos.y = w.heightAt(this.pos.x, this.pos.z);
    this.heading = 0;
    this.speed = 0;
    this.mounted = true;
    this.phase = 0;
    this.pitch = 0;

    this.maxHp = 100;
    this.hp = 100;
    this.gold = 0;
    this.kills = 0;
    this.alive = true;
    this.lastHurtT = -99;

    this.swing = null; // { dir, t, hit }
    this.autoIdx = 0;
    this.blocking = false;
    this.chargeCd = new Map();

    this.camYaw = 0;
    this.camPitch = 0.38;
    this.camDist = 8;
    this.lastCamInput = 0;

    this.rider = new Humanoid({ tunic: 0x2f5fa8, pants: 0x3d352e, helm: 0x9aa3ad, shield: 0x2f5fa8, hair: 0x4a3322 });
    this.horse = new Horse({ coat: 0x6e4528, blanket: 0x2f5fa8 });
    this.foot = new THREE.Group();
    game.scene.add(this.horse.root, this.foot);
    this.horsePos = new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
    this.horseHeading = 0;
    this.horse.root.add(this.rider.root);
    this.rider.root.position.set(0, 0.82, -0.05);
    this.syncMeshes(0.016, 0);
  }

  canMount() { return this.horsePos.distanceTo(this.pos) < 5; }

  toggleMount() {
    if (!this.alive) return;
    if (this.mounted) {
      this.mounted = false;
      this.horsePos.copy(this.pos);
      this.horseHeading = this.heading;
      const right = new THREE.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading));
      this.pos.addScaledVector(right, 2.1);
      this.pos.y = this.game.world.heightAt(this.pos.x, this.pos.z);
      this.speed = 0;
      this.foot.add(this.rider.root);
      this.rider.root.position.set(0, 0, 0);
      this.game.hud.toast('Dismounted');
    } else if (this.canMount()) {
      this.mounted = true;
      this.pos.copy(this.horsePos);
      this.heading = this.horseHeading;
      this.horse.root.add(this.rider.root);
      this.rider.root.position.set(0, 0.82, -0.05);
      this.speed = 0;
      this.game.hud.toast('Mounted');
    } else {
      this.game.hud.toast('Your horse is too far away');
    }
  }

  startSwing(dir) {
    if (this.swing || !this.alive) return;
    if (dir === 'auto') dir = AUTO_ORDER[this.autoIdx++ % 2];
    // Light aim assist: snap toward the nearest enemy roughly where the camera points.
    const e = this.game.nearestEnemy(this.pos, this.mounted ? 6 : 4.5, this.camYaw, 1.2);
    if (e && !this.mounted) {
      this.heading = Math.atan2(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
    }
    this.swing = { dir, t: 0, hit: false };
    this.game.sfx.swing();
  }

  resolveSwingHit() {
    const g = this.game;
    const spec = HIT[this.swing.dir];
    const reach = (this.mounted ? 3.2 : 2.6) + spec.reach;
    const centre = this.heading + spec.off;
    const speedBonus = this.mounted ? 1 + (Math.max(0, this.speed) / HORSE_MAX) * 0.9 : 1;
    let any = false;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + e.radius) continue;
      if (Math.abs(angleDiff(Math.atan2(dx, dz), centre)) > spec.half + (d < 1.4 ? 1 : 0)) continue;
      const dmg = 26 * spec.dmg * speedBonus * (0.9 + Math.random() * 0.3);
      e.takeHit(dmg, this.pos, 7 * speedBonus);
      any = true;
    }
    if (any) g.sfx.hit();
  }

  takeHit(dmg, from) {
    if (!this.alive) return false;
    const g = this.game;
    if (this.blocking && from) {
      const toSrc = Math.atan2(from.pos.x - this.pos.x, from.pos.z - this.pos.z);
      if (Math.abs(angleDiff(toSrc, this.heading)) < 1.2) {
        from.stagger(0.9);
        g.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), 0xffe9a0, 8, 5);
        g.sfx.block();
        g.hud.toast('Blocked!', 0.8);
        return true;
      }
    }
    this.hp -= dmg;
    this.lastHurtT = g.time;
    this.rider.flash(0.2);
    g.sfx.hurt();
    g.hud.hurtFlash();
    g.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), 0xd23a2a, 8, 4);
    if (this.hp <= 0) this.die();
    return false;
  }

  die() {
    this.alive = false;
    this.swing = null;
    this.blocking = false;
    this.game.hud.showDeath(true);
  }

  respawn() {
    const w = this.game.world;
    this.hp = this.maxHp;
    this.alive = true;
    this.mounted = true;
    this.pos.set(w.spawn.x, 0, w.spawn.z);
    this.pos.y = w.heightAt(this.pos.x, this.pos.z);
    this.horsePos.copy(this.pos);
    this.horse.root.add(this.rider.root);
    this.rider.root.position.set(0, 0.82, -0.05);
    this.speed = 0;
    this.heading = 0;
    this.camYaw = 0;
    this.game.hud.showDeath(false);
    this.game.hud.toast('You wake in Riverbend');
  }

  update(dt) {
    const g = this.game, input = g.input, world = g.world;
    const [cdx, cdy] = input.consumeCam();
    if (cdx || cdy) this.lastCamInput = g.time;
    this.camYaw -= cdx * 0.0042;
    this.camPitch = clamp(this.camPitch + cdy * 0.0035, -0.15, 1.25);

    if (input.mount) { input.mount = false; this.toggleMount(); }
    const atk = input.attack;
    input.attack = null;

    if (this.alive) {
      if (atk) this.startSwing(atk);
      this.blocking = input.block && !this.swing;
      this.move(dt, input.moveVec);
      if (this.swing) {
        this.swing.t += dt / SWING_TIME;
        if (!this.swing.hit && this.swing.t >= STRIKE_T) {
          this.swing.hit = true;
          this.resolveSwingHit();
        }
        if (this.swing.t >= 1) this.swing = null;
      }
      if (this.mounted) this.chargeDamage(dt);
      if (g.time - this.lastHurtT > 6 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 3 * dt);
    } else {
      this.speed = approach(this.speed, 0, 20 * dt);
    }

    this.syncMeshes(dt, g.time);
    this.updateCamera(dt);
  }

  move(dt, mv) {
    const world = this.game.world;
    const m = Math.min(1, Math.hypot(mv.x, mv.y));
    const f = [Math.sin(this.camYaw), Math.cos(this.camYaw)];
    const r = [-Math.cos(this.camYaw), Math.sin(this.camYaw)];
    const dirX = f[0] * mv.y + r[0] * mv.x, dirZ = f[1] * mv.y + r[1] * mv.x;
    const wet = world.inWater(this.pos.x, this.pos.z) ? 0.5 : 1;

    if (this.mounted) {
      let target = 0;
      if (m > 0.12) {
        const want = Math.atan2(dirX, dirZ);
        const diff = angleDiff(want, this.heading);
        const turn = lerp(3.6, 1.7, clamp(this.speed / HORSE_MAX, 0, 1));
        this.heading += clamp(diff, -turn * dt, turn * dt);
        target = HORSE_MAX * m * (Math.abs(diff) > 1.5 ? 0.35 : Math.abs(diff) > 0.7 ? 0.7 : 1);
      }
      target *= wet * (this.blocking ? 0.75 : 1);
      this.speed = approach(this.speed, target, (target > this.speed ? 7 : 12) * dt);
      // camera drifts behind the horse while galloping
      if (this.speed > 3 && this.game.time - this.lastCamInput > 1.2) {
        this.camYaw += angleDiff(this.heading, this.camYaw) * Math.min(1, 1.1 * dt);
      }
    } else {
      let target = 0;
      if (m > 0.12) {
        const want = Math.atan2(dirX, dirZ);
        const fighting = this.swing || this.blocking;
        if (!fighting) this.heading += clamp(angleDiff(want, this.heading), -11 * dt, 11 * dt);
        target = FOOT_RUN * (m > 0.55 ? 1 : 0.5) * (this.blocking ? 0.5 : 1) * wet;
      }
      if (this.swing || this.blocking) {
        this.heading += clamp(angleDiff(this.camYaw, this.heading), -5 * dt, 5 * dt);
      }
      this.speed = approach(this.speed, target, (target > this.speed ? 30 : 40) * dt);
    }

    const stepDirX = this.mounted || this.speed < 0.01 ? Math.sin(this.heading) : dirX / (Math.hypot(dirX, dirZ) || 1);
    const stepDirZ = this.mounted || this.speed < 0.01 ? Math.cos(this.heading) : dirZ / (Math.hypot(dirX, dirZ) || 1);
    this.pos.x += stepDirX * this.speed * dt;
    this.pos.z += stepDirZ * this.speed * dt;
    world.resolve(this.pos, this.mounted ? 0.9 : 0.5);
    this.pos.y = world.heightAt(this.pos.x, this.pos.z);
    this.phase += this.speed * dt * (this.mounted ? 1.25 : 1.9);
  }

  chargeDamage(dt) {
    if (this.speed < 7) return;
    const g = this.game;
    for (const e of g.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.9 + e.radius * 0.5) continue;
      if (dx * Math.sin(this.heading) + dz * Math.cos(this.heading) < 0.3 * d) continue;
      if ((this.chargeCd.get(e) ?? -9) > g.time - 0.9) continue;
      this.chargeCd.set(e, g.time);
      e.takeHit((this.speed - 4) * 4.2, this.pos, 11);
      this.speed *= 0.82;
      g.sfx.hit();
    }
  }

  syncMeshes(dt, t) {
    const world = this.game.world;
    const h = this.horse, rider = this.rider;
    if (this.mounted) {
      // tilt with the slope
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const front = world.heightAt(this.pos.x + fx * 1.3, this.pos.z + fz * 1.3);
      const back = world.heightAt(this.pos.x - fx * 1.3, this.pos.z - fz * 1.3);
      this.pitch = damp(this.pitch, Math.atan2(back - front, 2.6), 10, dt || 0.016);
      h.root.position.copy(this.pos);
      h.root.rotation.y = this.heading;
      h.animate(this.phase, clamp(this.speed / HORSE_MAX, 0, 1), t, this.pitch);
      this.foot.visible = false;
      rider.pose({ mounted: true, swingDir: this.swing?.dir, swingT: this.swing?.t ?? 0, block: this.blocking }, dt || 0.016);
    } else {
      h.root.position.copy(this.horsePos);
      this.horsePos.y = world.heightAt(this.horsePos.x, this.horsePos.z);
      h.root.rotation.y = this.horseHeading;
      h.animate(0, 0, t, 0);
      this.foot.visible = true;
      this.foot.position.copy(this.pos);
      this.foot.rotation.y = this.heading;
      rider.pose({
        phase: this.phase,
        moveAmt: clamp(this.speed / FOOT_RUN, 0, 1),
        swingDir: this.swing?.dir,
        swingT: this.swing?.t ?? 0,
        block: this.blocking,
      }, dt || 0.016);
    }
    if (!this.alive) {
      const root = this.mounted ? h.root : this.foot;
      root.rotation.z = damp(root.rotation.z, 1.35, 6, dt || 0.016);
    } else {
      h.root.rotation.z = 0;
      this.foot.rotation.z = 0;
    }
  }

  updateCamera(dt) {
    const cam = this.game.camera, world = this.game.world;
    const target = this.pos.clone();
    target.y += this.mounted ? 2.7 : 1.9;
    const dist = damp(this.camDist, this.mounted ? 8.8 : 6, 4, dt);
    this.camDist = dist;
    const cp = Math.cos(this.camPitch);
    const want = new THREE.Vector3(
      target.x - Math.sin(this.camYaw) * cp * dist,
      target.y + Math.sin(this.camPitch) * dist,
      target.z - Math.cos(this.camYaw) * cp * dist,
    );
    // Pull the camera in when a tree trunk or building sits on the boom.
    const bx = want.x - target.x, bz = want.z - target.z;
    const bl2 = bx * bx + bz * bz || 1;
    let shorten = 1;
    for (const c of world.colliders) {
      const cx = c.x - target.x, cz = c.z - target.z;
      if (cx * cx + cz * cz > (dist + c.r + 2) ** 2) continue;
      const k = (cx * bx + cz * bz) / bl2;
      if (k <= 0 || k >= 1) continue;
      const ox = cx - bx * k, oz = cz - bz * k;
      if (ox * ox + oz * oz < (c.r + 0.9) ** 2) shorten = Math.min(shorten, Math.max(0.25, k - 0.08));
    }
    if (shorten < 1) want.lerpVectors(target, want, shorten);
    const minY = world.heightAt(want.x, want.z) + 0.8;
    if (want.y < minY) want.y = minY;
    cam.position.lerp(want, 1 - Math.exp(-14 * dt));
    cam.lookAt(target);
  }
}
