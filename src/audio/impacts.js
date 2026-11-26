import { tone, noise, metal, drive, filter, noiseSource } from './synth.js';
import { playSlice } from './samples.js';

// Layered combat impacts. Every hit is three or four layers, each with its own job:
//   transient  - the first 10-20 ms: a bright click that says "contact" (and cuts through music)
//   body       - the weight: a pitched thump plus band-limited noise for flesh/cloth
//   sweetener  - what makes the kind recognisable: a bone-crack for a counter, metal partials for
//                armour, a ring for a blade, a sub boom for heavies and criticals
//   sample     - a CC0 recording layered on top when its bank has loaded (src/audio/samples.js)
//
// impactSpec() is pure: kind + power + variant in, a list of layer parameters out. Round-robin
// variants change filter centres, body pitch and which recording is used, and the engine adds a
// small random detune on top, so twenty punches in a row are twenty different sounds.

export const IMPACT_KINDS = ['jab', 'cross', 'hook', 'kick', 'heavy', 'counter', 'takedown', 'blocked', 'armour', 'shield', 'blade', 'stun', 'bodyFall', 'critLayer'];
export const VARIANTS = 5;

// Per-variant offsets: [transient freq, body pitch, crunch freq].
const VAR = [[1, 1, 1], [1.09, 0.97, 1.12], [0.92, 1.03, 0.9], [1.16, 0.95, 1.05], [0.97, 1.05, 0.94]];

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function impactSpec(kind, { power = 1, variant = 0, ko = false } = {}) {
  const pw = clamp(Number(power) || 1, 0.3, 3);
  const v = VAR[((variant | 0) % VARIANTS + VARIANTS) % VARIANTS];
  const [tf, bp, cf] = v;
  const heavier = clamp(pw - 1, 0, 2); // 0 for a normal blow, up to 2 for a finisher
  const L = [];
  let dur = 0.2;
  // Louder with power, but compressed: a 3x blow is not 3x louder, it is bigger and lower.
  const gain = clamp(0.78 + 0.16 * Math.log2(pw + 0.0001) + 0.1, 0.55, 1.05);
  const sample = (group, rate, g, extra = {}) => L.push({ type: 'sample', group, index: variant, rate: rate * (1 - 0.05 * heavier), gain: g, ...extra });

  switch (kind) {
    case 'jab':
      L.push({ type: 'transient', freq: 4200 * tf, d: 0.012, gain: 0.32 });
      L.push({ type: 'body', from: 210 * bp, to: 80 * bp, d: 0.085, gain: 0.5 });
      L.push({ type: 'crunch', filter: 'bandpass', freq: 1700 * cf, Q: 1, d: 0.045, gain: 0.45 });
      sample('punchMedium', 1.18, 0.5, { highpass: 180 });
      dur = 0.14;
      break;
    case 'cross':
      L.push({ type: 'transient', freq: 3600 * tf, d: 0.014, gain: 0.34 });
      L.push({ type: 'body', from: 180 * bp, to: 62 * bp, d: 0.12, gain: 0.62 });
      L.push({ type: 'crunch', filter: 'bandpass', freq: 1300 * cf, Q: 0.9, d: 0.06, gain: 0.5 });
      sample('punchMedium', 1, 0.58);
      dur = 0.18;
      break;
    case 'hook':
      L.push({ type: 'transient', freq: 3000 * tf, d: 0.016, gain: 0.3 });
      L.push({ type: 'body', from: 160 * bp, to: 50 * bp, d: 0.15, gain: 0.66 });
      L.push({ type: 'crunch', filter: 'lowpass', freq: 1100 * cf, Q: 0.8, d: 0.09, gain: 0.5 });
      L.push({ type: 'crack', freq: 2400 * cf, d: 0.02, gain: 0.18 });
      sample('punchHeavy', 1.08, 0.6);
      dur = 0.22;
      break;
    case 'kick':
      L.push({ type: 'transient', freq: 2600 * tf, d: 0.018, gain: 0.3 });
      L.push({ type: 'body', from: 130 * bp, to: 40 * bp, d: 0.2, gain: 0.74 });
      L.push({ type: 'crunch', filter: 'lowpass', freq: 850 * cf, Q: 0.8, d: 0.11, gain: 0.55 });
      sample('punchHeavy', 0.86, 0.62);
      sample('bodyMedium', 1.1, 0.28, { maxDur: 0.2 });
      dur = 0.26;
      break;
    case 'heavy':
      L.push({ type: 'transient', freq: 2200 * tf, d: 0.02, gain: 0.3 });
      L.push({ type: 'body', from: 140 * bp, to: 32 * bp, d: 0.45, gain: 0.55, drive: 5 });
      L.push({ type: 'crunch', filter: 'lowpass', freq: 700 * cf, to: 150, Q: 0.8, d: 0.4, gain: 0.42, drive: 5 });
      L.push({ type: 'sub', freq: 50 * bp, to: 28, d: 0.6, gain: 0.3 });
      sample('punchHeavy', 0.78, 0.62);
      sample('bodyHeavy', 1, 0.32, { maxDur: 0.3 });
      dur = 0.65;
      break;
    case 'counter':
      // a snap: fast and bright, the sound of a timed reversal rather than a blow traded
      L.push({ type: 'transient', freq: 5200 * tf, d: 0.01, gain: 0.4 });
      L.push({ type: 'snap', freq: 950 * tf, to: 300, d: 0.03, gain: 0.16 });
      L.push({ type: 'body', from: 220 * bp, to: 70 * bp, d: 0.12, gain: 0.55 });
      L.push({ type: 'crack', freq: 3000 * cf, d: 0.025, gain: 0.22 });
      sample('punchHeavy', 1.14, 0.55);
      sample('wood', 1.35, 0.16, { highpass: 900, maxDur: 0.12 });
      dur = 0.2;
      break;
    case 'takedown':
      L.push({ type: 'transient', freq: 2400 * tf, d: 0.02, gain: 0.34 });
      L.push({ type: 'body', from: 120 * bp, to: 26 * bp, d: 0.6, gain: 0.58, drive: 6 });
      L.push({ type: 'crunch', filter: 'lowpass', freq: 900 * cf, to: 90, Q: 0.7, d: 0.6, gain: 0.4, drive: 6 });
      L.push({ type: 'sub', freq: 62 * bp, to: 24, d: 1.1, gain: 0.42 });
      sample('punchHeavy', 0.72, 0.6);
      sample('bodyHeavy', 0.9, 0.42, { at: 0.04 });
      dur = 1.15;
      break;
    case 'blocked':
      // forearm on forearm: no crack, all thud and cloth
      L.push({ type: 'body', from: 105 * bp, to: 64 * bp, d: 0.12, gain: 0.6 });
      L.push({ type: 'crunch', filter: 'lowpass', freq: 420 * cf, Q: 0.7, d: 0.09, gain: 0.7 });
      L.push({ type: 'transient', freq: 1800 * tf, d: 0.01, gain: 0.12 });
      sample('bodyMedium', 1.25, 0.42, { lowpass: 1800, maxDur: 0.18 });
      sample('cloth', 1.3, 0.18, { maxDur: 0.15 });
      dur = 0.18;
      break;
    case 'armour':
      L.push({ type: 'transient', freq: 3800 * tf, d: 0.012, gain: 0.28 });
      L.push({ type: 'metal', base: 360 * bp, ratios: [1, 1.59, 2.37, 3.31, 4.2], d: 0.5, gain: 0.2 });
      L.push({ type: 'body', from: 150 * bp, to: 60 * bp, d: 0.14, gain: 0.42 });
      sample('metalHeavy', 0.9, 0.55);
      dur = 0.55;
      break;
    case 'shield':
      L.push({ type: 'transient', freq: 2600 * tf, d: 0.015, gain: 0.25 });
      L.push({ type: 'metal', base: 230 * bp, ratios: [1, 1.41, 2.13, 2.9], d: 0.75, gain: 0.2 });
      L.push({ type: 'body', from: 120 * bp, to: 50 * bp, d: 0.2, gain: 0.5 });
      sample('plate', 0.85, 0.6);
      dur = 0.8;
      break;
    case 'blade':
      L.push({ type: 'transient', freq: 6500 * tf, d: 0.008, gain: 0.3 });
      L.push({ type: 'metal', base: 1850 * bp, ratios: [1, 1.48, 2.27, 2.95], d: 0.6, gain: 0.21 });
      L.push({ type: 'scrape', freq: 4200 * cf, d: 0.16, gain: 0.3 });
      L.push({ type: 'body', from: 260 * bp, to: 140 * bp, d: 0.05, gain: 0.25 });
      sample('blade', 1.05, 0.5, { highpass: 500 });
      dur = 0.65;
      break;
    case 'stun':
      L.push({ type: 'transient', freq: 4800 * tf, d: 0.01, gain: 0.25 });
      L.push({ type: 'metal', base: 1500 * bp, ratios: [1, 1.63, 2.47], d: 0.22, gain: 0.16 });
      L.push({ type: 'body', from: 240 * bp, to: 120 * bp, d: 0.06, gain: 0.4 });
      dur = 0.25;
      break;
    case 'bodyFall':
      // a body meeting pavement: low thud, cloth slap, a little bounce
      L.push({ type: 'body', from: 95 * bp, to: 38 * bp, d: 0.28, gain: 0.62 });
      L.push({ type: 'crunch', filter: 'lowpass', freq: 520 * cf, Q: 0.7, d: 0.2, gain: 0.55 });
      L.push({ type: 'body', from: 80 * bp, to: 40 * bp, d: 0.12, gain: 0.25, at: 0.16 });
      sample('bodyHeavy', 0.92, 0.6);
      sample('cloth', 1, 0.2, { maxDur: 0.25 });
      dur = 0.5;
      break;
    case 'critLayer':
      // Rides on top of the strike during hit-stop: a short reversed swell sucks in, a sub boom
      // blooms over the freeze, and a high ring sits on the tail. Nothing in it is a transient,
      // so it never doubles the strike's own attack.
      L.push({ type: 'swell', from: 300, to: 2600, d: 0.12, gain: 0.32 });
      L.push({ type: 'sub', freq: 75, to: 30, d: 0.9, gain: 0.48, at: 0.1 });
      L.push({ type: 'crunch', filter: 'lowpass', freq: 600, to: 80, Q: 0.7, d: 0.7, gain: 0.3, at: 0.1 });
      L.push({ type: 'ring', freq: 2950, d: 0.9, gain: 0.05, at: 0.1 });
      dur = 1.05;
      break;
    default:
      return impactSpec('cross', { power, variant, ko });
  }
  if (ko && kind !== 'bodyFall' && kind !== 'critLayer') {
    // A knockout lands harder and is followed by the body hitting the floor.
    L.push({ type: 'sub', freq: 58 * bp, to: 30, d: 0.45, gain: 0.26 });
    L.push({ type: 'fall', at: 0.32 + 0.04 * (variant % 3) });
    dur = Math.max(dur, 0.85);
  }
  return { kind, gain, layers: L, duration: dur };
}

// Event payload -> impact description. Reads the fields combat emits today
// ({ move, outcome, target, crit }) and the richer ones other workstreams may add
// ({ strike: 'jab'|'cross'|'hook'|..., power, material: 'armour'|'shield'|'blade' }).
// `seq` is a running counter used to alternate jab/cross/hook when the strike is unknown.
const STRIKES = new Set(['jab', 'cross', 'hook', 'kick', 'heavy', 'counter', 'takedown']);
const KICKS = new Set(['kick', 'jumpKick', 'diveBomb', 'stomp']);
const HEAVIES = new Set(['heavy', 'spinKick', 'slam', 'thrownInto', 'throw', 'gel']);
const TAKEDOWNS = new Set(['special', 'shatter', 'takedown', 'beatdownFinish']);
const STUNS = new Set(['cape', 'batarang', 'remote', 'claw', 'smoke', 'flashbang']);
const PUNCH_CYCLE = ['jab', 'cross', 'jab', 'hook', 'cross'];

export function classifyImpact(ev = {}, seq = 0) {
  const e = ev && typeof ev === 'object' ? ev : {};
  const move = typeof e.move === 'string' ? e.move : '';
  const outcome = e.outcome;
  const t = e.target && typeof e.target === 'object' ? e.target : null;
  const ttype = typeof t?.type === 'string' ? t.type : '';
  const material = e.material ?? t?.material ?? (t?.shield ? 'shield' : null);
  let power = Number.isFinite(e.power) ? e.power : null;
  let kind;
  if (outcome === 'parried' || outcome === 'immune' || outcome === 'blocked') {
    if (material === 'shield') kind = 'shield';
    else if (material === 'blade' || ttype === 'knife') kind = 'blade';
    else if (material === 'armour' || material === 'armor' || ttype === 'brute' || ttype === 'harley' || t?.def?.armored) kind = 'armour';
    else kind = 'blocked';
  } else if (outcome === 'stun' || STUNS.has(move)) kind = 'stun';
  else if (STRIKES.has(e.strike)) kind = e.strike;
  else if (move === 'counter') kind = 'counter';
  else if (TAKEDOWNS.has(move)) kind = 'takedown';
  else if (KICKS.has(move)) kind = 'kick';
  else if (HEAVIES.has(move)) kind = 'heavy';
  else kind = PUNCH_CYCLE[((seq | 0) % PUNCH_CYCLE.length + PUNCH_CYCLE.length) % PUNCH_CYCLE.length];
  if (power === null) power = kind === 'heavy' || kind === 'takedown' ? 1.8 : kind === 'kick' ? 1.5 : kind === 'hook' ? 1.25 : 1;
  const ko = outcome === 'ko';
  const crit = !!e.crit || kind === 'takedown';
  return { kind, power, ko, crit, knockdown: outcome === 'knockdown' };
}

// ---- rendering ----

// Builds one impact spec into `out` at time t. `samples` is a sample bank (or null) and `pitch`
// a global multiplier the engine sets per play (round-robin detune). Returns the end time.
export function renderImpact(ctx, out, t, spec, { samples = null, pitch = 1 } = {}) {
  const p = pitch;
  const bus = ctx.createGain();
  bus.gain.value = spec.gain;
  bus.connect(out);
  let end = t + spec.duration;
  for (const l of spec.layers) {
    const at = t + (l.at ?? 0);
    switch (l.type) {
      case 'transient':
        noise(ctx, bus, at, { type: 'highpass', freq: Math.min(12000, l.freq * p), Q: 0.7, a: 0.001, d: l.d, gain: l.gain });
        break;
      case 'body': {
        let dest = bus;
        if (l.drive) { const post = ctx.createGain(); post.gain.value = 0.55; post.connect(bus); dest = drive(ctx, post, l.drive); }
        tone(ctx, dest, at, { freq: l.from * p, to: l.to * p, glide: l.d * 0.7, a: 0.002, d: l.d, gain: l.gain });
        break;
      }
      case 'crunch': {
        let dest = bus;
        if (l.drive) { const post = ctx.createGain(); post.gain.value = 0.6; post.connect(bus); dest = drive(ctx, post, l.drive); }
        noise(ctx, dest, at, { type: l.filter, freq: l.freq * p, to: l.to ? l.to * p : null, Q: l.Q ?? 0.8, a: 0.002, d: l.d, gain: l.gain });
        break;
      }
      case 'crack':
        noise(ctx, bus, at + 0.004, { type: 'bandpass', freq: l.freq * p, Q: 4, a: 0.001, d: l.d, gain: l.gain });
        break;
      case 'snap':
        tone(ctx, bus, at, { type: 'square', freq: l.freq * p, to: l.to * p, d: l.d, gain: l.gain });
        break;
      case 'metal':
        metal(ctx, bus, at, { base: l.base * p, ratios: l.ratios, d: l.d, gain: l.gain });
        break;
      case 'scrape': {
        const g = ctx.createGain();
        g.gain.value = 0; // silent before the first event, whatever the rounding of t
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(l.gain, at + 0.01);
        g.gain.exponentialRampToValueAtTime(1e-4, at + l.d);
        g.connect(bus);
        const f = filter(ctx, g, 'bandpass', l.freq * p, 6);
        f.frequency.setValueAtTime(l.freq * p, at);
        f.frequency.exponentialRampToValueAtTime(l.freq * p * 0.6, at + l.d);
        noiseSource(ctx, at, l.d).connect(f);
        break;
      }
      case 'sub':
        tone(ctx, bus, at, { freq: l.freq * p, to: l.to, glide: l.d * 0.8, a: 0.006, d: l.d, gain: l.gain });
        break;
      case 'swell': {
        const g = ctx.createGain();
        g.gain.value = 0; // silent before the first event, whatever the rounding of t
        g.gain.setValueAtTime(1e-4, at);
        g.gain.exponentialRampToValueAtTime(l.gain, at + l.d);
        g.gain.setValueAtTime(0, at + l.d + 0.004);
        g.connect(bus);
        const f = filter(ctx, g, 'bandpass', l.from, 1.1);
        f.frequency.setValueAtTime(l.from, at);
        f.frequency.exponentialRampToValueAtTime(l.to, at + l.d);
        noiseSource(ctx, at, l.d + 0.01).connect(f);
        break;
      }
      case 'ring':
        tone(ctx, bus, at, { type: 'sine', freq: l.freq * p, d: l.d, a: 0.01, gain: l.gain });
        tone(ctx, bus, at, { type: 'sine', freq: l.freq * p * 1.006, d: l.d * 0.8, a: 0.01, gain: l.gain * 0.7 });
        break;
      case 'fall': {
        const fall = impactSpec('bodyFall', { variant: (spec.layers.length + 1) % VARIANTS });
        const e2 = renderImpact(ctx, bus, at, { ...fall, gain: 0.9 }, { samples, pitch: p * 0.98 });
        end = Math.max(end, e2);
        break;
      }
      case 'sample': {
        const slice = samples?.get(l.group, l.index);
        if (slice) {
          const e2 = playSlice(ctx, bus, at, slice, { gain: l.gain, rate: l.rate * p, lowpass: l.lowpass ?? 0, highpass: l.highpass ?? 0, maxDur: l.maxDur ?? 0 });
          end = Math.max(end, e2);
        }
        break;
      }
      default:
        break;
    }
  }
  return end + 0.02;
}
