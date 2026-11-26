import { SPACES } from './spaces.js';

// Shared hall reverb: a ConvolverNode fed by a generated stereo noise impulse whose
// tail decays exponentially and darkens over time (a one-pole lowpass that closes).
export function createReverb(ctx, { seconds = 2.4, decay = 3, predelay = 0.018, taps = [], bright = 0.85 } = {}) {
  const conv = ctx.createConvolver();
  conv.buffer = impulse(ctx, { seconds, decay, predelay, taps, bright });
  return conv;
}

const irCache = new WeakMap();

// One stereo impulse per (context, space), generated once and reused by every convolver.
export function spaceImpulse(ctx, name) {
  let byName = irCache.get(ctx);
  if (!byName) irCache.set(ctx, (byName = new Map()));
  let ir = byName.get(name);
  if (!ir) {
    ir = impulse(ctx, SPACES[name] ?? SPACES.street);
    byName.set(name, ir);
  }
  return ir;
}

function impulse(ctx, { seconds, decay, predelay, taps = [], bright = 0.85 }) {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const ir = ctx.createBuffer(2, len, rate);
  const pre = Math.floor(rate * predelay);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      const k = bright - (bright - 0.05) * x; // filter coefficient: bright early, dark late
      lp += k * (Math.random() * 2 - 1 - lp);
      d[i] = lp * Math.pow(1 - x, decay);
    }
    // Early reflections: short decaying clicks, alternated a little between ears for width.
    taps.forEach((tap, k) => {
      const at = Math.floor(rate * (tap + (ch ? 0.0013 * (k + 1) : 0)));
      const amp = 0.55 / (1 + k * 0.6);
      for (let j = 0; j < 96 && at + j < len; j++) d[at + j] += amp * (Math.random() * 2 - 1) * Math.exp(-j / 18);
    });
  }
  return ir;
}

// Cheap algorithmic reverb for the low-spec tier: two cross-fed feedback delays through a
// low-pass, no convolution. setSpace() moves delay times and feedback toward a space's character.
export function createAlgoReverb(ctx) {
  const input = ctx.createGain();
  const output = ctx.createGain();
  output.gain.value = 0.6;
  const merger = ctx.createChannelMerger ? ctx.createChannelMerger(2) : null;
  const lines = [0.037, 0.053].map((t, i) => {
    const d = ctx.createDelay(0.5);
    d.delayTime.value = t;
    const fb = ctx.createGain();
    fb.gain.value = 0.45;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    input.connect(d);
    d.connect(lp);
    lp.connect(fb);
    if (merger) lp.connect(merger, 0, i); else lp.connect(output);
    return { d, fb, lp };
  });
  // cross-feed: each line feeds the other, which smears the echoes into a tail
  lines[0].fb.connect(lines[1].d);
  lines[1].fb.connect(lines[0].d);
  if (merger) merger.connect(output);
  return {
    input,
    output,
    setSpace(name, time = 0.4) {
      const s = SPACES[name] ?? SPACES.street;
      const now = ctx.currentTime;
      const fb = Math.min(0.62, 0.22 + s.seconds * 0.15);
      lines.forEach((l, i) => {
        l.d.delayTime.setTargetAtTime((s.taps[i] ?? 0.03 + i * 0.017) + 0.02, now, time / 3);
        l.fb.gain.setTargetAtTime(fb, now, time / 3);
        l.lp.frequency.setTargetAtTime(1400 + 3000 * s.bright, now, time / 3);
      });
    },
  };
}
