const $ = (id) => document.getElementById(id);

export function createHud(game) {
  const hpFill = $('hp-fill'), hpText = $('hp-text');
  const gold = $('gold'), kills = $('kills'), toastEl = $('toast'), hurt = $('hurt');
  const death = $('death'), objective = $('objective'), mount = $('btn-mount');
  const mm = $('minimap'), mctx = mm.getContext('2d');
  let toastT = 0, lastHp = -1;

  return {
    toast(msg, secs = 1.6) {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      toastT = secs;
    },
    hurtFlash() {
      hurt.classList.remove('flash');
      void hurt.offsetWidth;
      hurt.classList.add('flash');
    },
    showDeath(v) { death.hidden = !v; },
    setObjective(t) { objective.textContent = t; },
    update(dt) {
      const p = game.player;
      if (Math.round(p.hp) !== lastHp) {
        lastHp = Math.round(p.hp);
        hpFill.style.width = `${Math.max(0, p.hp)}%`;
        hpText.textContent = `${Math.max(0, lastHp)}`;
      }
      gold.textContent = p.gold;
      kills.textContent = p.kills;
      mount.textContent = p.mounted ? 'Dismount' : 'Mount';
      mount.classList.toggle('dim', !p.mounted && !p.canMount());
      if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('show');
      this.drawMinimap();
    },
    drawMinimap() {
      const p = game.player, W = mm.width, c = W / 2, range = 140, s = c / range;
      mctx.clearRect(0, 0, W, W);
      mctx.save();
      mctx.beginPath();
      mctx.arc(c, c, c - 1, 0, Math.PI * 2);
      mctx.clip();
      mctx.fillStyle = 'rgba(30,45,30,0.75)';
      mctx.fillRect(0, 0, W, W);
      const yaw = p.camYaw;
      const f = [Math.sin(yaw), Math.cos(yaw)], r = [-Math.cos(yaw), Math.sin(yaw)];
      const toScreen = (x, z) => {
        const dx = x - p.pos.x, dz = z - p.pos.z;
        return [c + (dx * r[0] + dz * r[1]) * s, c - (dx * f[0] + dz * f[1]) * s];
      };
      for (const z of game.world.zones) {
        const [x, y] = toScreen(z.x, z.z);
        mctx.fillStyle = z.name === 'Riverbend' ? '#4a86d8' : '#d94a3a';
        mctx.beginPath();
        mctx.arc(x, y, z.name === 'Riverbend' ? 6 : 5, 0, Math.PI * 2);
        mctx.fill();
      }
      mctx.fillStyle = '#ff7a5c';
      for (const e of game.enemies) {
        if (e.dead) continue;
        const [x, y] = toScreen(e.pos.x, e.pos.z);
        mctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      if (!p.mounted) {
        const [hx, hy] = toScreen(p.horsePos.x, p.horsePos.z);
        mctx.fillStyle = '#e0b060';
        mctx.fillRect(hx - 2, hy - 2, 4, 4);
      }
      // Player arrow
      const a = p.heading - yaw;
      mctx.translate(c, c);
      mctx.rotate(-a);
      mctx.fillStyle = '#fff';
      mctx.beginPath();
      mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5, 6); mctx.closePath();
      mctx.fill();
      mctx.restore();
    },
  };
}
