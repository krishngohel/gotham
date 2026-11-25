import { tone, noise, metal, filter, noiseSource, rand } from './synth.js';
import { playSlice } from './samples.js';

// Footsteps by surface, gait and who is walking. Pure spec + a renderer, same shape as
// impacts.js. Surfaces come from the event payload when the world can tell (`surface`), else
// from the environment (rain makes concrete splash), else concrete.

export const SURFACES = ['concrete', 'metal', 'wood', 'gravel', 'water', 'carpet', 'glass', 'grass', 'snow'];
export const GAITS = ['walk', 'run', 'sprint', 'land', 'crouch'];
export const WALKERS = ['hero', 'goon', 'civilian'];

const GAIT = {
  walk: { gain: 0.55, pitch: 1, len: 1 },
  run: { gain: 0.75, pitch: 1.04, len: 0.9 },
  sprint: { gain: 0.9, pitch: 1.08, len: 0.85 },
  land: { gain: 1.1, pitch: 0.92, len: 1.3 },
  crouch: { gain: 0.3, pitch: 0.95, len: 1.1 },
};
const WHO = {
  hero: { gain: 1, pitch: 0.93 }, // armoured boots: heavier and lower
  goon: { gain: 0.9, pitch: 1 },
  civilian: { gain: 0.75, pitch: 1.1 },
};

// Aliases other workstreams might use for the same surface.
const ALIAS = { asphalt: 'concrete', stone: 'concrete', pavement: 'concrete', tile: 'concrete', roof: 'gravel', grate: 'metal', steel: 'metal', puddle: 'water', wet: 'water', rug: 'carpet', dirt: 'grass', park: 'grass', ice: 'glass' };

export function normalizeSurface(s) {
  if (typeof s !== 'string') return 'concrete';
  const k = ALIAS[s] ?? s;
  return SURFACES.includes(k) ? k : 'concrete';
}
export function normalizeGait(g, { sprint = false, speed = null } = {}) {
  if (GAITS.includes(g)) return g;
  if (sprint) return 'sprint';
  if (Number.isFinite(speed)) return speed > 8 ? 'sprint' : speed > 4.5 ? 'run' : 'walk';
  return 'run';
}

export function footstepSpec(surface = 'concrete', gait = 'run', who = 'hero', variant = 0) {
  const s = normalizeSurface(surface);
  const g = GAIT[gait] ?? GAIT.run;
  const w = WHO[who] ?? WHO.goon;
  const L = [];
  const v = variant | 0;
  const crouch = gait === 'crouch';
  switch (s) {
    case 'concrete':
      L.push({ type: 'heel', freq: 1900, to: 600, Q: 0.9, d: 0.06 * g.len, gain: 0.32 });
      L.push({ type: 'thud', freq: 140, to: 70, d: 0.05, gain: 0.18 });
      L.push({ type: 'sample', group: 'concrete', index: v, rate: 1, gain: 0.5 });
      break;
    case 'metal':
      L.push({ type: 'heel', freq: 2400, to: 1200, Q: 1.2, d: 0.04, gain: 0.22 });
      L.push({ type: 'ring', base: 520 + 40 * (v % 3), ratios: [1, 2.76, 5.4], d: 0.2, gain: 0.07 });
      L.push({ type: 'grit', count: 5, freq: 3800, d: 0.06, gain: 0.12 });
      L.push({ type: 'sample', group: 'metal', index: v, rate: 1.25, gain: 0.26 });
      L.push({ type: 'sample', group: 'concrete', index: v + 1, rate: 1.05, gain: 0.25 });
      break;
    case 'wood':
      L.push({ type: 'knock', freq: 210, to: 150, d: 0.06, gain: 0.3 });
      L.push({ type: 'heel', freq: 950, to: 500, Q: 1.1, d: 0.05, gain: 0.24 });
      L.push({ type: 'sample', group: 'wood', index: v, rate: 1, gain: 0.5 });
      break;
    case 'gravel':
      L.push({ type: 'grit', count: 12, freq: 2600, d: 0.1 * g.len, gain: 0.28 });
      L.push({ type: 'heel', freq: 700, to: 350, Q: 0.7, d: 0.08, gain: 0.25 });
      L.push({ type: 'sample', group: 'snow', index: v, rate: 1.3, gain: 0.45 });
      break;
    case 'water':
      L.push({ type: 'splash', from: 900, to: 2800, d: 0.14 * g.len, gain: 0.34 });
      L.push({ type: 'drops', count: 3, gain: 0.05 });
      L.push({ type: 'sample', group: 'concrete', index: v, rate: 0.95, gain: 0.25, lowpass: 2000 });
      break;
    case 'carpet':
      L.push({ type: 'heel', freq: 520, to: 260, Q: 0.7, d: 0.06, gain: 0.3 });
      L.push({ type: 'sample', group: 'carpet', index: v, rate: 1, gain: 0.5 });
      break;
    case 'glass':
      L.push({ type: 'grit', count: 14, freq: 4200, d: 0.12, gain: 0.2 });
      L.push({ type: 'thud', freq: 130, to: 70, d: 0.05, gain: 0.16 });
      L.push({ type: 'sample', group: 'glass', index: v, rate: 1.2, gain: 0.3 });
      L.push({ type: 'sample', group: 'concrete', index: v, rate: 1, gain: 0.3 });
      break;
    case 'grass':
      L.push({ type: 'heel', freq: 1100, to: 500, Q: 0.6, d: 0.09, gain: 0.22 });
      L.push({ type: 'sample', group: 'grass', index: v, rate: 1, gain: 0.5 });
      break;
    case 'snow':
      L.push({ type: 'grit', count: 8, freq: 1800, d: 0.12, gain: 0.18 });
      L.push({ type: 'sample', group: 'snow', index: v, rate: 1, gain: 0.5 });
      break;
    default:
      break;
  }
  if (gait === 'land') L.push({ type: 'thud', freq: 110, to: 36, d: 0.22, gain: 0.5 });
  return {
    surface: s,
    gain: g.gain * w.gain,
    pitch: g.pitch * w.pitch,
    lowpass: crouch ? 1400 : 0,
    layers: L,
    duration: 0.12 * g.len + (gait === 'land' ? 0.15 : 0) + (s === 'metal' ? 0.12 : 0),
  };
}

export function renderFootstep(ctx, out, t, spec, { samples = null, pitch = 1 } = {}) {
  const p = spec.pitch * pitch;
  const bus = ctx.createGain();
  bus.gain.value = spec.gain;
  if (spec.lowpass) bus.connect(filter(ctx, out, 'lowpass', spec.lowpass, 0.7)); else bus.connect(out);
  let end = t + spec.duration;
  for (const l of spec.layers) {
    switch (l.type) {
      case 'heel':
        noise(ctx, bus, t, { type: 'bandpass', freq: l.freq * p * rand(0.9, 1.1), to: l.to * p, Q: l.Q, a: 0.002, d: l.d, gain: l.gain });
        break;
      case 'thud':
      case 'knock':
        tone(ctx, bus, t, { type: l.type === 'knock' ? 'triangle' : 'sine', freq: l.freq * p, to: l.to * p, d: l.d, gain: l.gain });
        break;
      case 'ring':
        metal(ctx, bus, t + 0.005, { base: l.base * p, ratios: l.ratios, d: l.d, gain: l.gain });
        break;
      case 'grit': {
        // a handful of tiny clicks: gravel, grit, broken glass
        const g = ctx.createGain();
        g.gain.value = 0; // silent before the first event, whatever the rounding of t
        g.gain.setValueAtTime(0, t);
        for (let i = 0; i < l.count; i++) {
          const ct = t + Math.pow(Math.random(), 1.6) * l.d;
          g.gain.setValueAtTime(l.gain * rand(0.3, 1), ct);
          g.gain.setValueAtTime(0, ct + rand(0.001, 0.003));
        }
        g.connect(bus);
        noiseSource(ctx, t, l.d + 0.01).connect(filter(ctx, g, 'highpass', l.freq * p, 0.7));
        break;
      }
      case 'splash': {
        const g = ctx.createGain();
        g.gain.value = 0; // silent before the first event, whatever the rounding of t
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(l.gain, t + 0.012);
        g.gain.exponentialRampToValueAtTime(1e-4, t + l.d);
        g.connect(bus);
        const f = filter(ctx, g, 'bandpass', l.from * p, 1.4);
        f.frequency.setValueAtTime(l.from * p, t);
        f.frequency.exponentialRampToValueAtTime(l.to * p, t + l.d * 0.6);
        noiseSource(ctx, t, l.d).connect(f);
        break;
      }
      case 'drops':
        for (let i = 0; i < l.count; i++) {
          const f = rand(1400, 3200);
          tone(ctx, bus, t + 0.03 + i * rand(0.02, 0.05), { freq: f, to: f * 1.6, glide: 0.02, d: 0.03, gain: l.gain });
        }
        break;
      case 'sample': {
        const slice = samples?.get(l.group, l.index);
        if (slice) end = Math.max(end, playSlice(ctx, bus, t, slice, { gain: l.gain, rate: l.rate * p, lowpass: l.lowpass ?? 0, maxDur: 0.35 }));
        break;
      }
      default:
        break;
    }
  }
  return end + 0.02;
}
