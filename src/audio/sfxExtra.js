import { tone, noise, metal, env, filter, noiseSource, bell, brass, drum, mtof, rand } from './synth.js';
import { playSlice } from './samples.js';
import { impactSpec, renderImpact, IMPACT_KINDS } from './impacts.js';
import { footstepSpec, renderFootstep, SURFACES } from './footsteps.js';

// Sounds added in Long Night 2. Same contract as sfx.js: fn(ctx, out, t, p, o) returns its end
// time; `o` carries { samples, power, variant, ko, gait, who } for the recipes that use them.
// `bus` picks the mixer bus (default sfx) and `priority` feeds voice stealing (voicePool.js).

const slice = (o, group, i) => o?.samples?.get?.(group, i ?? o?.variant ?? 0) ?? null;

// Noise through a band-pass whose centre sweeps: the shared core of every whoosh.
function sweep(ctx, out, t, { from, peak, to, dur, gain, Q = 1.4, att = 0.45 }) {
  const g = env(ctx, out, t, { a: dur * att, d: dur * (1 - att), peak: gain });
  const f = filter(ctx, g, 'bandpass', from, Q);
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(peak, t + dur * att);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  noiseSource(ctx, t, dur).connect(f);
  return t + dur + 0.02;
}

export const SFX_EXTRA = {
  // ---- whooshes per limb and speed (played on `swing`, keyed to the strike's kind) ----
  whooshFist: { wet: 0.06, max: 3, priority: 1, fn(ctx, out, t, p) {
    return sweep(ctx, out, t, { from: 700 * p, peak: 3200 * p, to: 1400 * p, dur: 0.13, gain: 0.32, Q: 1.8, att: 0.55 });
  } },
  whooshKick: { wet: 0.08, max: 3, priority: 1, fn(ctx, out, t, p) {
    sweep(ctx, out, t, { from: 260 * p, peak: 1500 * p, to: 420 * p, dur: 0.24, gain: 0.42, Q: 1.3 });
    return sweep(ctx, out, t + 0.03, { from: 1200 * p, peak: 3600 * p, to: 1800 * p, dur: 0.16, gain: 0.12, Q: 2 });
  } },
  whooshHeavy: { wet: 0.12, max: 2, priority: 1, fn(ctx, out, t, p) {
    sweep(ctx, out, t, { from: 160 * p, peak: 900 * p, to: 220 * p, dur: 0.42, gain: 0.5, Q: 1.1, att: 0.6 });
    return tone(ctx, out, t + 0.1, { freq: 70 * p, to: 50 * p, a: 0.15, d: 0.2, gain: 0.12 });
  } },
  whooshSpin: { wet: 0.1, max: 2, priority: 1, fn(ctx, out, t, p) {
    sweep(ctx, out, t, { from: 300 * p, peak: 1700 * p, to: 500 * p, dur: 0.2, gain: 0.36 });
    return sweep(ctx, out, t + 0.17, { from: 400 * p, peak: 2300 * p, to: 700 * p, dur: 0.2, gain: 0.4 });
  } },
  cloth: { wet: 0.05, max: 3, priority: 1, fn(ctx, out, t, p, o) {
    const s = slice(o, 'cloth');
    const e = s ? playSlice(ctx, out, t, s, { gain: 0.5, rate: p, maxDur: 0.35 }) : 0;
    const e2 = sweep(ctx, out, t, { from: 900 * p, peak: 2600 * p, to: 1200 * p, dur: 0.18, gain: 0.18, Q: 0.8 });
    return Math.max(e, e2);
  } },

  // ---- props that used to borrow `block` ----
  ventOpen: { wet: 0.2, max: 2, fn(ctx, out, t, p, o) {
    // latch click, a tinny grate lifting, a short hinge squeal
    const s = slice(o, 'latch', 0);
    if (s) playSlice(ctx, out, t, s, { gain: 0.5, rate: p });
    noise(ctx, out, t, { type: 'highpass', freq: 3500 * p, d: 0.012, gain: 0.35 });
    metal(ctx, out, t + 0.04, { base: 820 * p, ratios: [1, 1.71, 2.62, 3.9], d: 0.3, gain: 0.12 });
    const tin = slice(o, 'tin');
    if (tin) playSlice(ctx, out, t + 0.05, tin, { gain: 0.45, rate: 1.1 * p });
    tone(ctx, out, t + 0.12, { type: 'sawtooth', freq: 1450 * p, to: 1900 * p, a: 0.03, d: 0.16, gain: 0.025 });
    return t + 0.45;
  } },
  railingDown: { wet: 0.3, max: 2, fn(ctx, out, t, p, o) {
    // a groan of bending steel, then the rail hitting the deck and rattling
    const g = env(ctx, out, t, { a: 0.08, hold: 0.15, d: 0.25, peak: 0.08 });
    const bp = filter(ctx, g, 'bandpass', 300 * p, 6);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.setValueAtTime(95 * p, t);
    o1.frequency.exponentialRampToValueAtTime(62 * p, t + 0.45);
    o1.connect(bp);
    o1.start(t); o1.stop(t + 0.5);
    const h = t + 0.42;
    metal(ctx, out, h, { base: 310 * p, ratios: [1, 1.63, 2.41, 3.7], d: 0.6, gain: 0.18 });
    tone(ctx, out, h, { freq: 120 * p, to: 45 * p, d: 0.25, gain: 0.5 });
    const s = slice(o, 'metalHeavy');
    if (s) playSlice(ctx, out, h, s, { gain: 0.5, rate: 0.8 * p });
    for (let k = 1; k < 4; k++) metal(ctx, out, h + 0.12 * k + rand(0, 0.04), { base: 700 * p * rand(0.9, 1.2), ratios: [1, 2.3], d: 0.12, gain: 0.06 / k });
    return h + 0.7;
  } },
  clawRip: { wet: 0.2, max: 2, fn(ctx, out, t, p, o) {
    // the claw tearing a shield or a door off: a rising ripping AM noise, then a clank
    const dur = 0.38;
    const g = env(ctx, out, t, { a: 0.02, d: dur, peak: 0.5 });
    const am = ctx.createGain();
    am.connect(g);
    am.gain.setValueAtTime(0.2, t);
    for (let x = 0.01; x < dur; x += rand(0.008, 0.02)) am.gain.setValueAtTime(rand(0.15, 1), t + x);
    const bp = filter(ctx, am, 'bandpass', 900 * p, 1.6);
    bp.frequency.setValueAtTime(900 * p, t);
    bp.frequency.exponentialRampToValueAtTime(3400 * p, t + dur);
    noiseSource(ctx, t, dur).connect(bp);
    const c = slice(o, 'cloth');
    if (c) playSlice(ctx, out, t, c, { gain: 0.4, rate: 1.3 * p });
    const h = t + dur;
    metal(ctx, out, h, { base: 520 * p, ratios: [1, 1.5, 2.6], d: 0.35, gain: 0.16 });
    tone(ctx, out, h, { freq: 140 * p, to: 55 * p, d: 0.18, gain: 0.45 });
    return h + 0.4;
  } },
  glassBreak: { wet: 0.3, max: 2, fn(ctx, out, t, p, o) {
    const s = slice(o, 'glassHeavy');
    if (s) playSlice(ctx, out, t, s, { gain: 0.6, rate: p });
    noise(ctx, out, t, { type: 'highpass', freq: 5000, d: 0.02, gain: 0.4 });
    for (let k = 0; k < 7; k++) {
      const f = rand(2600, 7000) * p;
      tone(ctx, out, t + 0.02 + Math.pow(Math.random(), 1.5) * 0.45, { type: 'triangle', freq: f, to: f * 0.8, d: rand(0.04, 0.12), gain: 0.07 });
    }
    return t + 0.6;
  } },
  zipLine: { wet: 0.1, max: 1, priority: 1, fn(ctx, out, t, p) {
    // the trolley running down the line: a rising whirr with a metallic edge
    const dur = 1.1;
    const g = env(ctx, out, t, { a: 0.15, hold: 0.6, d: 0.35, peak: 0.25 });
    const bp = filter(ctx, g, 'bandpass', 1200 * p, 4);
    bp.frequency.setValueAtTime(900 * p, t);
    bp.frequency.exponentialRampToValueAtTime(2200 * p, t + dur);
    noiseSource(ctx, t, dur).connect(bp);
    tone(ctx, out, t, { type: 'sawtooth', freq: 180 * p, to: 360 * p, glide: dur, a: 0.2, hold: 0.5, d: 0.4, gain: 0.03 });
    return t + dur + 0.05;
  } },

  // ---- interface (ui bus: always heard over the game, never reverberated) ----
  uiHover: { wet: 0, max: 2, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    return tone(ctx, out, t, { type: 'sine', freq: 2400 * p, d: 0.025, gain: 0.12 });
  } },
  uiConfirm: { wet: 0, max: 2, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    tone(ctx, out, t, { type: 'triangle', freq: 660 * p, d: 0.06, gain: 0.26 });
    tone(ctx, out, t + 0.05, { type: 'triangle', freq: 990 * p, d: 0.08, gain: 0.26 });
    return bell(ctx, out, t + 0.1, 88 + 12 * Math.log2(p), { gain: 0.08, d: 0.4, ratio: 2, index: 1 });
  } },
  uiError: { wet: 0, max: 2, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    tone(ctx, out, t, { type: 'square', freq: 220 * p, d: 0.07, gain: 0.1 });
    return tone(ctx, out, t + 0.09, { type: 'square', freq: 185 * p, d: 0.11, gain: 0.1 });
  } },
  uiTab: { wet: 0, max: 2, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    noise(ctx, out, t, { type: 'bandpass', freq: 3000 * p, Q: 1.5, d: 0.03, gain: 0.3 });
    return tone(ctx, out, t, { type: 'triangle', freq: 1200 * p, d: 0.035, gain: 0.15 });
  } },
  uiSlider: { wet: 0, max: 3, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    return tone(ctx, out, t, { type: 'sine', freq: 1800 * p, d: 0.018, gain: 0.14 });
  } },

  // ---- new systems' stingers (short, on the ui bus so they read over combat) ----
  waypointSet: { wet: 0.25, max: 1, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    const s = 12 * Math.log2(p);
    bell(ctx, out, t, 81 + s, { gain: 0.14, d: 0.5, ratio: 2.01, index: 0.9 });
    bell(ctx, out, t + 0.09, 88 + s, { gain: 0.12, d: 0.9, ratio: 2.01, index: 0.9 });
    // a soft sonar ping trailing off
    return tone(ctx, out, t + 0.09, { type: 'sine', freq: 1320 * p, to: 1250 * p, a: 0.005, d: 0.9, gain: 0.05 });
  } },
  caseSolved: { wet: 0.35, max: 1, bus: 'ui', priority: 4, fn(ctx, out, t, p) {
    // the detective motif resolving: D F A then the D an octave up, bell over low brass
    const s = 12 * Math.log2(p);
    [62, 65, 69].forEach((m, i) => bell(ctx, out, t + i * 0.11, m + 12 + s, { gain: 0.11, d: 0.9, ratio: 3.5, index: 1.3 }));
    brass(ctx, out, t + 0.33, 50 + s, 0.9, { gain: 0.07, a: 0.06, r: 0.6, bright: 0.5 });
    brass(ctx, out, t + 0.33, 57 + s, 0.9, { gain: 0.05, a: 0.06, r: 0.6, bright: 0.5 });
    bell(ctx, out, t + 0.33, 86 + s, { gain: 0.14, d: 1.4, ratio: 3.5, index: 1.4 });
    return t + 1.9;
  } },
  missionComplete: { wet: 0.35, max: 1, bus: 'ui', priority: 4, fn(ctx, out, t, p) {
    const s = 12 * Math.log2(p);
    drum(ctx, out, t, { freq: mtof(38), d: 0.9, gain: 0.3, skin: 0.08 });
    [50, 57, 62, 66].forEach((m) => brass(ctx, out, t, m + s, 0.18, { gain: 0.045, a: 0.02, r: 0.12, bright: 1 }));
    const h = t + 0.3;
    [50, 57, 62, 66, 69].forEach((m) => brass(ctx, out, h, m + s, 1.1, { gain: 0.05, a: 0.04, r: 0.8, bright: 0.9 }));
    bell(ctx, out, h, 90 + s, { gain: 0.1, d: 1.5 });
    return h + 2;
  } },
  fearRising: { wet: 0.3, max: 1, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    // a low swell and two heartbeats: the city is getting scared of you
    const g = ctx.createGain();
    g.gain.value = 0; // silent before the first event, whatever the rounding of t
    g.gain.setValueAtTime(1e-4, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.9);
    g.gain.exponentialRampToValueAtTime(1e-4, t + 1.5);
    g.connect(out);
    const lp = filter(ctx, g, 'lowpass', 300, 2);
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + 0.9);
    [mtof(38) * p, mtof(39) * p * 1.003].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t); o.stop(t + 1.55);
    });
    [0.55, 0.78, 1.25, 1.48].forEach((d, k) => tone(ctx, out, t + d, { freq: 62 * p, to: 40 * p, d: 0.14, gain: k % 2 ? 0.3 : 0.45 }));
    return t + 1.7;
  } },
  collectible: { wet: 0.25, max: 2, bus: 'ui', priority: 3, fn(ctx, out, t, p) {
    const s = 12 * Math.log2(p);
    [84, 88, 91].forEach((m, i) => bell(ctx, out, t + i * 0.045, m + s, { gain: 0.1, d: 0.45, ratio: 2.01, index: 0.8 }));
    return t + 0.6;
  } },
  dispatchTone: { wet: 0, max: 1, bus: 'dialogue', priority: 4, fn(ctx, out, t, p) {
    // a dispatch alert: two-tone beep through a radio band
    const bp = filter(ctx, out, 'bandpass', 1500, 0.9);
    tone(ctx, bp, t, { type: 'square', freq: 853 * p, hold: 0.16, d: 0.02, gain: 0.08 });
    tone(ctx, bp, t + 0.2, { type: 'square', freq: 960 * p, hold: 0.16, d: 0.02, gain: 0.08 });
    return t + 0.42;
  } },
  squelch: { wet: 0, max: 2, bus: 'dialogue', priority: 4, fn(ctx, out, t, p) {
    noise(ctx, out, t, { type: 'bandpass', freq: 2200 * p, Q: 0.6, a: 0.002, d: 0.09, gain: 0.16 });
    return tone(ctx, out, t, { type: 'square', freq: 1100 * p, d: 0.02, gain: 0.04 });
  } },
  skid: { wet: 0.15, max: 2, fn(ctx, out, t, p) {
    // tyre screech: a narrow band of noise wobbling, plus the squeal partial
    const dur = 0.7;
    const g = env(ctx, out, t, { a: 0.03, hold: 0.35, d: 0.3, peak: 0.22 });
    const bp = filter(ctx, g, 'bandpass', 2100 * p, 9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg); lg.connect(bp.frequency);
    noiseSource(ctx, t, dur).connect(bp);
    lfo.start(t); lfo.stop(t + dur);
    tone(ctx, out, t, { type: 'sine', freq: 1650 * p, to: 1500 * p, a: 0.05, hold: 0.3, d: 0.3, gain: 0.03 });
    return t + dur + 0.02;
  } },
  afterburner: { wet: 0.2, max: 1, fn(ctx, out, t, p) {
    // the Batmobile's afterburner lighting: a gas whoomph and a rising roar
    const g = env(ctx, out, t, { a: 0.08, hold: 0.2, d: 0.5, peak: 0.5 });
    const lp = filter(ctx, g, 'lowpass', 300 * p, 0.7);
    lp.frequency.setValueAtTime(300 * p, t);
    lp.frequency.exponentialRampToValueAtTime(2600 * p, t + 0.3);
    noiseSource(ctx, t, 0.8).connect(lp);
    tone(ctx, out, t, { freq: 55 * p, to: 38 * p, d: 0.5, gain: 0.35 });
    return t + 0.82;
  } },
  modeShift: { wet: 0.15, max: 1, fn(ctx, out, t, p) {
    // pursuit <-> battle mode: servo whine down, a heavy latch
    tone(ctx, out, t, { type: 'sawtooth', freq: 900 * p, to: 300 * p, a: 0.02, d: 0.45, gain: 0.05 });
    noise(ctx, out, t, { type: 'bandpass', freq: 1800 * p, to: 700 * p, Q: 3, d: 0.4, gain: 0.12 });
    const h = t + 0.45;
    metal(ctx, out, h, { base: 260 * p, ratios: [1, 1.7, 2.9], d: 0.3, gain: 0.14 });
    tone(ctx, out, h, { freq: 110 * p, to: 50 * p, d: 0.2, gain: 0.55 });
    return h + 0.35;
  } },
};

// One recipe per impact kind (hit_jab, hit_armour, ...) and per surface (step_metal, ...), so the
// lab and the self-check can audition and measure them like any other sound.
for (const k of IMPACT_KINDS) {
  SFX_EXTRA[`hit_${k}`] = {
    wet: k === 'critLayer' || k === 'takedown' ? 0.4 : k === 'armour' || k === 'shield' || k === 'blade' ? 0.22 : 0.1,
    max: k === 'critLayer' || k === 'takedown' ? 1 : 4,
    priority: k === 'critLayer' || k === 'takedown' ? 4 : 3,
    fn(ctx, out, t, p, o = {}) {
      return renderImpact(ctx, out, t, impactSpec(k, { power: o.power ?? 1, variant: o.variant ?? 0, ko: !!o.ko }), { samples: o.samples, pitch: p });
    },
  };
}
for (const s of SURFACES) {
  SFX_EXTRA[`step_${s}`] = {
    wet: 0.03, max: 3, priority: 1,
    fn(ctx, out, t, p, o = {}) {
      return renderFootstep(ctx, out, t, footstepSpec(s, o.gait ?? 'run', o.who ?? 'hero', o.variant ?? 0), { samples: o.samples, pitch: p });
    },
  };
}
