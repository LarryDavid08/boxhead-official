// Tiny synthesized sound effects (no audio files to ship).
let ctx = null;
let master = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function noise(dur) {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

function env(gain, t0, attack, dur, peak) {
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function whoosh(from, to, dur, peak) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const src = noise(dur);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  env(g, t, dur * 0.4, dur, peak);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

function tone(type, freq, endFreq, dur, peak) {
  if (!ensure()) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  env(g, t, 0.01, dur, peak);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  unlock: ensure,
  swing: () => whoosh(500, 1800, 0.22, 0.35),
  hit: () => { tone('sine', 160, 50, 0.18, 0.7); whoosh(900, 200, 0.12, 0.5); },
  block: () => { tone('square', 1500, 900, 0.12, 0.25); tone('triangle', 2400, 1800, 0.1, 0.2); },
  hurt: () => { tone('sawtooth', 220, 70, 0.25, 0.35); },
  kill: () => { tone('sine', 120, 40, 0.35, 0.7); },
  coin: () => { tone('triangle', 880, 1320, 0.12, 0.25); },
  hoof: () => { tone('sine', 90, 60, 0.06, 0.25); },
};
