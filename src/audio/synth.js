// Web Audio building blocks. Every function takes a (Base)AudioContext, a destination
// node and a start time, so the same code renders live or into an OfflineAudioContext.

const noiseCache = new WeakMap();
const curveCache = new WeakMap();

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const rand = (a, b) => a + (b - a) * Math.random();

// 2 s of white noise per context, shared by every noise voice.
export function noiseBuffer(ctx) {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    const len = Math.floor(ctx.sampleRate * 2);
    buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

export function noiseSource(ctx, t, dur) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 1.9);
  s.stop(t + dur + 0.05);
  return s;
}

// Soft-clip curve for crunchy impacts and electric buzz.
export function driveCurve(ctx, amount = 4) {
  let byAmt = curveCache.get(ctx);
  if (!byAmt) curveCache.set(ctx, (byAmt = new Map()));
  let c = byAmt.get(amount);
  if (!c) {
    c = new Float32Array(1024);
    const norm = Math.tanh(amount);
    for (let i = 0; i < 1024; i++) c[i] = Math.tanh(((i / 1023) * 2 - 1) * amount) / norm;
    byAmt.set(amount, c);
  }
  return c;
}

export function drive(ctx, out, amount = 4) {
  const ws = ctx.createWaveShaper();
  ws.curve = driveCurve(ctx, amount);
  ws.connect(out);
  return ws;
}

// Gain envelope: silent at t, linear attack to peak, optional hold, exponential decay.
export function env(ctx, out, t, { a = 0.004, peak = 1, hold = 0, d = 0.2 } = {}) {
  const g = ctx.createGain();
  // Silent before the first event: a GainNode starts at 1, and when t falls between two sample
  // frames the source can get one frame ahead of the automation (a full-scale click, measured).
  g.gain.value = 0;
  const p = Math.max(peak, 1e-4);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  if (hold > 0) g.gain.setValueAtTime(p, t + a + hold);
  g.gain.exponentialRampToValueAtTime(1e-4, t + a + hold + d);
  g.gain.setValueAtTime(0, t + a + hold + d + 0.002);
  g.connect(out);
  return g;
}

export function filter(ctx, out, type, freq, Q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  f.connect(out);
  return f;
}

// One oscillator with an envelope and an optional pitch glide. Returns its end time.
export function tone(ctx, out, t, {
  type = 'sine', freq = 440, to = null, glide = null, a = 0.004, hold = 0, d = 0.2, gain = 0.5, detune = 0,
} = {}) {
  const g = env(ctx, out, t, { a, hold, d, peak: gain });
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + (glide ?? a + hold + d));
  if (detune) o.detune.value = detune;
  o.connect(g);
  const end = t + a + hold + d + 0.01;
  o.start(t);
  o.stop(end);
  return end;
}

// Filtered noise burst with an envelope and an optional filter sweep.
export function noise(ctx, out, t, {
  type = 'bandpass', freq = 1000, to = null, sweep = null, Q = 1, a = 0.002, hold = 0, d = 0.1, gain = 0.5,
} = {}) {
  const g = env(ctx, out, t, { a, hold, d, peak: gain });
  const f = filter(ctx, g, type, freq, Q);
  if (to) {
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(to, t + (sweep ?? a + hold + d));
  }
  const len = a + hold + d;
  noiseSource(ctx, t, len).connect(f);
  return t + len + 0.01;
}

// Inharmonic partials for metal hits and lamp clanks.
export function metal(ctx, out, t, { base = 800, ratios = [1, 1.47, 2.09, 2.83], d = 0.4, gain = 0.2 } = {}) {
  ratios.forEach((r, i) => tone(ctx, out, t, { freq: base * r, d: d / (1 + i * 0.4), gain: gain / (1 + i * 0.5) }));
  return t + d + 0.02;
}

// ---- orchestral voices ----

// Detuned saws through a lowpass: the string section.
export function strings(ctx, out, t, midi, dur, {
  gain = 0.06, cutoff = 1200, a = 0.08, r = 0.3, detune = 9, voices = 2, type = 'sawtooth',
} = {}) {
  const f = mtof(midi);
  const g = ctx.createGain();
  g.gain.value = 0; // silent before the first event, whatever the rounding of t
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.setValueAtTime(gain, t + Math.max(a, dur));
  g.gain.exponentialRampToValueAtTime(1e-4, t + Math.max(a, dur) + r);
  g.connect(out);
  const lp = filter(ctx, g, 'lowpass', Math.min(cutoff, 16000), 0.5);
  const end = t + Math.max(a, dur) + r + 0.02;
  for (let i = 0; i < voices; i++) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = voices === 1 ? 0 : detune * (i / (voices - 1) * 2 - 1);
    o.connect(lp);
    o.start(t);
    o.stop(end);
  }
  return end;
}

// Saw + square with a filter that opens on the attack: brass swells and stabs.
export function brass(ctx, out, t, midi, dur, { gain = 0.05, a = 0.05, r = 0.25, bright = 1 } = {}) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const top = t + Math.max(a, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.setValueAtTime(gain, top);
  g.gain.exponentialRampToValueAtTime(1e-4, top + r);
  g.connect(out);
  const lp = filter(ctx, g, 'lowpass', f * 1.5, 0.9);
  lp.frequency.setValueAtTime(f * 1.2, t);
  lp.frequency.linearRampToValueAtTime(Math.min(f * (3 + 5 * bright), 9000), t + a * 1.2);
  lp.frequency.setTargetAtTime(f * (2 + 2 * bright), t + a * 1.2, Math.max(0.05, dur * 0.4));
  const end = top + r + 0.02;
  [['sawtooth', -6], ['square', 5]].forEach(([type, det]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(lp);
    o.start(t);
    o.stop(end);
  });
  return end;
}

// Sine with a pitch drop plus a noise skin: timpani and taiko.
export function drum(ctx, out, t, { freq = 70, drop = 0.55, d = 0.7, gain = 0.4, skin = 0.25, skinFreq = 900 } = {}) {
  tone(ctx, out, t, { freq: freq * 1.6, to: freq, glide: 0.04, d, gain });
  tone(ctx, out, t, { freq: freq * 1.5 * 1.6, to: freq * 1.5, glide: 0.04, d: d * 0.5, gain: gain * 0.3 });
  if (drop < 1) tone(ctx, out, t, { freq, to: freq * drop, glide: d, d, gain: gain * 0.4 });
  noise(ctx, out, t, { type: 'bandpass', freq: skinFreq, Q: 0.8, d: 0.06, gain: skin });
  return t + d + 0.02;
}

export function snare(ctx, out, t, { gain = 0.12, d = 0.14 } = {}) {
  noise(ctx, out, t, { type: 'highpass', freq: 1800, d, gain });
  tone(ctx, out, t, { type: 'triangle', freq: 220, to: 160, d: 0.06, gain: gain * 0.6 });
  return t + d + 0.02;
}

export function cymbal(ctx, out, t, { gain = 0.08, d = 1.6, a = 0.002 } = {}) {
  noise(ctx, out, t, { type: 'highpass', freq: 5000, a, d, gain });
  noise(ctx, out, t, { type: 'bandpass', freq: 3200, Q: 0.6, a, d: d * 0.5, gain: gain * 0.6 });
  return t + d + 0.02;
}

// Two-operator FM bell / celesta.
export function bell(ctx, out, t, midi, { gain = 0.08, d = 1.4, ratio = 3.5, index = 2.2 } = {}) {
  const f = mtof(midi);
  const g = env(ctx, out, t, { a: 0.003, d, peak: gain });
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f * ratio;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.05, t + d * 0.6);
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(g);
  const end = t + d + 0.02;
  car.start(t); mod.start(t);
  car.stop(end); mod.stop(end);
  return end;
}

// Calliope / circus organ: square + octave triangle with a wobbly vibrato.
export function organ(ctx, out, t, midi, dur, { gain = 0.04, vib = 7 } = {}) {
  const f = mtof(midi);
  const g = ctx.createGain();
  g.gain.value = 0; // silent before the first event, whatever the rounding of t
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.015);
  g.gain.setValueAtTime(gain, t + dur);
  g.gain.exponentialRampToValueAtTime(1e-4, t + dur + 0.08);
  g.connect(out);
  const lp = filter(ctx, g, 'lowpass', 3200, 0.7);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 6.2;
  const lg = ctx.createGain();
  lg.gain.value = vib;
  lfo.connect(lg);
  const end = t + dur + 0.1;
  [['square', 1, 1], ['triangle', 2, 0.8]].forEach(([type, mult, lvl]) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f * mult;
    lg.connect(o.detune);
    const og = ctx.createGain();
    og.gain.value = lvl;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(end);
  });
  lfo.start(t);
  lfo.stop(end);
  return end;
}

// ---- Long Night 2 instruments ----

// Warm pad: three detuned saws, a slow filter swell and a slower filter wobble (cheap chorus).
export function pad(ctx, out, t, midi, dur, { gain = 0.03, cutoff = 900, a = 0.6, r = 1.2, detune = 11, wobble = 0.25 } = {}) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const top = t + Math.max(a, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + a);
  g.gain.setValueAtTime(gain, top);
  g.gain.exponentialRampToValueAtTime(1e-4, top + r);
  g.connect(out);
  const lp = filter(ctx, g, 'lowpass', cutoff * 0.6, 0.7);
  lp.frequency.setValueAtTime(cutoff * 0.5, t);
  lp.frequency.linearRampToValueAtTime(cutoff, t + a);
  const end = top + r + 0.02;
  if (wobble > 0) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = wobble;
    const lg = ctx.createGain();
    lg.gain.value = cutoff * 0.25;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start(t);
    lfo.stop(end);
  }
  [-detune, 0, detune].forEach((d) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.detune.value = d;
    o.connect(lp);
    o.start(t);
    o.stop(end);
  });
  return end;
}

// Plucked string / pizzicato: a bright saw whose filter closes fast.
export function pluck(ctx, out, t, midi, { gain = 0.06, d = 0.35, bright = 1, type = 'sawtooth' } = {}) {
  const f = mtof(midi);
  const g = env(ctx, out, t, { a: 0.003, d, peak: gain });
  const lp = filter(ctx, g, 'lowpass', f * (6 + 10 * bright), 1.2);
  lp.frequency.setValueAtTime(Math.min(16000, f * (6 + 10 * bright)), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(80, f * 1.2), t + d * 0.7);
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.connect(lp);
  const end = t + d + 0.02;
  o.start(t);
  o.stop(end);
  return end;
}

// Bass: a sine sub under a filtered saw with a little bite on the attack.
export function bass(ctx, out, t, midi, dur, { gain = 0.08, cutoff = 420, bite = 1.6 } = {}) {
  const f = mtof(midi);
  const g = ctx.createGain();
  const top = t + Math.max(0.02, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.setValueAtTime(gain * 0.8, top);
  g.gain.exponentialRampToValueAtTime(1e-4, top + 0.08);
  g.connect(out);
  const lp = filter(ctx, g, 'lowpass', cutoff * bite, 1);
  lp.frequency.setValueAtTime(cutoff * bite, t);
  lp.frequency.exponentialRampToValueAtTime(cutoff, t + 0.08);
  const end = top + 0.1;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  const sg = ctx.createGain();
  sg.gain.value = 0.6;
  saw.connect(sg);
  sg.connect(lp);
  const sub = ctx.createOscillator();
  sub.frequency.value = f;
  sub.connect(g);
  [saw, sub].forEach((o) => { o.start(t); o.stop(end); });
  return end;
}

// Electric piano: FM with a decaying index plus a short high tine.
export function epiano(ctx, out, t, midi, dur, { gain = 0.05, bright = 1 } = {}) {
  const f = mtof(midi);
  const d = Math.max(0.3, dur);
  const g = env(ctx, out, t, { a: 0.004, hold: d * 0.2, d: d * 0.9, peak: gain });
  const car = ctx.createOscillator();
  car.frequency.value = f;
  const mod = ctx.createOscillator();
  mod.frequency.value = f;
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.8 * bright, t);
  mg.gain.exponentialRampToValueAtTime(f * 0.1, t + d * 0.6);
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(g);
  const end = t + d * 1.1 + 0.03;
  [car, mod].forEach((o) => { o.start(t); o.stop(end); });
  tone(ctx, out, t, { freq: f * 14, d: 0.05, gain: gain * 0.12 * bright });
  return end;
}

// Closed / open hi-hat and a ride tick from filtered noise.
export function hat(ctx, out, t, { gain = 0.03, open = false } = {}) {
  return noise(ctx, out, t, { type: 'highpass', freq: open ? 6500 : 8000, a: 0.001, d: open ? 0.28 : 0.045, gain });
}

// Kick drum: a short sine drop with a click.
export function kickDrum(ctx, out, t, { gain = 0.25, freq = 55, d = 0.35 } = {}) {
  tone(ctx, out, t, { freq: freq * 3, to: freq, glide: 0.05, a: 0.001, d, gain });
  noise(ctx, out, t, { type: 'highpass', freq: 3000, d: 0.006, gain: gain * 0.25 });
  return t + d + 0.02;
}

// Clock tick / woodblock.
export function tick(ctx, out, t, { gain = 0.05, freq = 2400 } = {}) {
  tone(ctx, out, t, { type: 'triangle', freq, to: freq * 0.85, d: 0.03, gain });
  return noise(ctx, out, t, { type: 'bandpass', freq: freq * 1.3, Q: 5, d: 0.02, gain: gain * 0.8 });
}

// Anvil / metal percussion for the industrial themes.
export function anvil(ctx, out, t, { gain = 0.05, base = 520 } = {}) {
  return metal(ctx, out, t, { base, ratios: [1, 2.76, 5.4, 8.93], d: 0.5, gain });
}
