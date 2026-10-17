import * as THREE from '../vendor/three.module.min.js';
import { Humanoid, STRIKE_T } from './lowpoly.js';
import { angleDiff, approach, clamp, damp } from './util.js';

const ATTACK_DIRS = ['overhead', 'left', 'right'];

export class Bandit {
  constructor(game, camp, brute = false) {
    this.game = game;
    this.camp = camp;
    this.brute = brute;
    this.radius = brute ? 0.65 : 0.5;
    this.h = new Humanoid(brute
      ? { tunic: 0x6b2a22, pants: 0x2c2723, skin: 0xc79a74, hair: 0x1a1410, helm: 0x5d5a55, shield: 0x5a2a20, blade: 0x9aa0a6, scale: 1.18 }
      : { tunic: 0x7a5a38, pants: 0x3b332c, skin: 0xe0b48c, hair: 0x2a1c12, headband: 0xa61e1e, shield: 0x6b4a2b, blade: 0xa9aeb5 });
    this.root = new THREE.Group();
    this.root.add(this.h.root);
    game.scene.add(this.root);
    this.maxHp = brute ? 130 : 70;
    this.damage = brute ? 20 : 13;
    this.speedMax = brute ? 3.9 : 4.6;
    this.pos = new THREE.Vector3();
    this.reset();
  }

  reset() {
    const w = this.game.world, c = this.camp.zone;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 7;
    this.pos.set(c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r);
    this.pos.y = w.heightAt(this.pos.x, this.pos.z);
    this.home = this.pos.clone();
    this.heading = Math.random() * 6.28;
    this.hp = this.maxHp;
    this.dead = false;
    this.deadT = 0;
    this.state = 'idle';
    this.swing = null;
    this.attackCd = 1;
    this.staggerT = 0;
    this.kb = new THREE.Vector3();
    this.phase = Math.random() * 6;
    this.speed = 0;
    this.wanderT = 0;
    this.wanderTo = this.home.clone();
    this.h.root.rotation.x = 0;
    this.h.root.position.y = 0;
    this.root.visible = true;
    this.sync(0);
  }

  stagger(t) {
    this.staggerT = Math.max(this.staggerT, t);
    this.swing = null;
    if (this.state === 'attack') this.state = 'chase';
  }

  takeHit(dmg, fromPos, knock) {
    if (this.dead) return;
    const g = this.game;
    this.hp -= dmg;
    this.h.flash(0.2);
    g.fx.burst(this.pos.clone().add(new THREE.Vector3(0, 1.3, 0)), 0xc92a2a, 7, 4);
    const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.kb.set((dx / d) * knock, 0, (dz / d) * knock);
    this.stagger(0.45);
    if (this.state === 'idle') this.state = 'chase';
    if (this.hp <= 0) this.die();
  }

  die() {
    this.dead = true;
    this.deadT = 0;
    this.swing = null;
    const g = this.game, p = g.player;
    p.kills++;
    const loot = this.brute ? 25 : 10;
    p.gold += loot;
    g.sfx.kill();
    g.sfx.coin();
    g.hud.toast(`+${loot} denars`, 1.0);
    g.onBanditDied(this);
  }

  update(dt) {
    if (this.dead) {
      this.deadT += dt;
      this.h.root.rotation.x = damp(this.h.root.rotation.x, -Math.PI / 2, 9, dt);
      this.h.root.position.y = damp(this.h.root.position.y, 0.22, 9, dt);
      if (this.deadT > 12) this.root.visible = false;
      return;
    }
    const g = this.game, p = g.player, world = g.world;
    this.attackCd -= dt;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const toPlayer = Math.atan2(dx, dz);
    let moveSpeed = 0;
    let moveDir = this.heading;

    // knockback glides out
    this.pos.x += this.kb.x * dt;
    this.pos.z += this.kb.z * dt;
    this.kb.multiplyScalar(Math.exp(-7 * dt));

    if (this.staggerT > 0) {
      this.staggerT -= dt;
    } else if (this.state === 'idle') {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 4;
        const a = Math.random() * 6.28, r = Math.random() * 6;
        this.wanderTo.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r);
      }
      const wx = this.wanderTo.x - this.pos.x, wz = this.wanderTo.z - this.pos.z;
      if (Math.hypot(wx, wz) > 0.8) {
        moveDir = Math.atan2(wx, wz);
        moveSpeed = 1.3;
      }
      const aggro = p.mounted ? 42 : 30;
      if (p.alive && dist < aggro) {
        this.state = 'chase';
        g.alertCamp(this.camp, this);
      }
    } else if (this.state === 'chase') {
      if (!p.alive || dist > 70) {
        this.state = 'idle';
      } else {
        moveDir = toPlayer;
        // Only two bandits press the attack at once; the rest circle just out of reach.
        const attackers = g.enemies.reduce((n, o) => n + (o !== this && !o.dead && o.state === 'attack' ? 1 : 0), 0);
        const holding = attackers >= 2 && dist < 5;
        moveSpeed = holding ? (dist < 3.6 ? -1.2 : 0) : dist > 2.1 ? this.speedMax : 0;
        this.heading += clamp(angleDiff(toPlayer, this.heading), -9 * dt, 9 * dt);
        if (!holding && dist < 2.5 && this.attackCd <= 0) {
          this.state = 'attack';
          this.swing = { dir: ATTACK_DIRS[Math.floor(Math.random() * 3)], t: 0, hit: false };
        }
      }
    } else if (this.state === 'attack') {
      const s = this.swing;
      s.t += dt / (this.brute ? 1.3 : 1.1);
      if (s.t < 0.5) this.heading += clamp(angleDiff(toPlayer, this.heading), -3.5 * dt, 3.5 * dt);
      if (!s.hit && s.t >= STRIKE_T) {
        s.hit = true;
        const inFront = Math.abs(angleDiff(toPlayer, this.heading)) < 0.9;
        if (p.alive && inFront && dist < 3.0 + (p.mounted ? 0.5 : 0)) p.takeHit(this.damage * (0.9 + Math.random() * 0.2), this);
      }
      if (s.t >= 1) {
        this.swing = null;
        this.state = 'chase';
        this.attackCd = 0.7 + Math.random() * 0.8;
      }
    }

    this.speed = approach(this.speed, moveSpeed, 25 * dt);
    if (Math.abs(this.speed) > 0.05 && this.state !== 'attack') {
      if (this.state === 'idle') this.heading += clamp(angleDiff(moveDir, this.heading), -5 * dt, 5 * dt);
      this.pos.x += Math.sin(moveDir) * this.speed * dt;
      this.pos.z += Math.cos(moveDir) * this.speed * dt;
    }
    // don't stack on each other
    for (const o of g.enemies) {
      if (o === this || o.dead) continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const d = Math.hypot(ox, oz);
      const min = this.radius + o.radius + 0.2;
      if (d < min && d > 0.001) {
        this.pos.x += (ox / d) * (min - d) * 0.5;
        this.pos.z += (oz / d) * (min - d) * 0.5;
      }
    }
    // keep out of the player's body
    if (p.alive && dist < this.radius + 0.7) {
      this.pos.x -= (dx / (dist || 1)) * (this.radius + 0.7 - dist);
      this.pos.z -= (dz / (dist || 1)) * (this.radius + 0.7 - dist);
    }
    world.resolve(this.pos, this.radius);
    this.pos.y = world.heightAt(this.pos.x, this.pos.z);
    this.phase += this.speed * dt * 1.9;
    this.sync(dt);
  }

  sync(dt) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    const winding = this.swing && !this.swing.hit;
    this.h.pose({
      phase: this.phase,
      moveAmt: clamp(this.speed / 4.6, 0, 1),
      swingDir: this.swing?.dir,
      swingT: this.swing?.t ?? 0,
      block: this.state === 'chase' && this.attackCd > 0.4 && this.speed < 0.5 && !winding,
    }, dt || 0.016);
  }
}

/** Builds the bandit camps and handles respawns. */
export function createCamps(game) {
  const camps = [];
  for (const zone of game.world.zones.slice(1)) {
    const camp = { zone, bandits: [], respawnT: 0, cleared: false };
    for (let i = 0; i < 5; i++) {
      const b = new Bandit(game, camp, i === 0);
      camp.bandits.push(b);
      game.enemies.push(b);
    }
    camps.push(camp);
  }
  return camps;
}
