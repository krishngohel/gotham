// Turns a night's fight definition into the plain encounter shape src/game/encounters.js runs
// ({ site, radius, waves: [[{ type, dx, dz }]], gang }). Pure and deterministic: the same fight,
// difficulty and seed always give the same squad, so tests and the playthrough see one fight.
//
// A night fight (docs/design/story-format.md 4):
//   { site: 'siteId' | { x, y, z }, radius, gang, act, district,
//     waves: [ { budget, ring = 6, arc = 2*PI, spots: [[dx, dz], ...], add: [{ type, dx, dz }] }
//              | [{ type, dx, dz }, ...] (an explicit wave, as Night One writes them) ],
//     entry, stealth, tutorial }
// A budgeted wave asks composeWave (src/enemies/compose.js) for its squad: difficulty from the
// mix, never from health. Co-op scaling is NOT applied here: encounters.js scales every wave by
// the player count (scaleWave), the same rule Night One's fights follow.
import { composeWave } from '../enemies/compose.js';
import { createRng } from '../core/rng.js';

// A small stable hash of a string, for per-fight seeds.
export function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Positions for n enemies: the wave's own spots (cycled, nudged outward on reuse), else a ring.
export function placeRing(n, { ring = 6, arc = Math.PI * 2, start = 0, spots = null } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (spots?.length) {
      const [dx, dz] = spots[i % spots.length];
      const lap = Math.floor(i / spots.length);
      const k = 1 + lap * 0.25;
      out.push([dx * k + lap * 0.8, dz * k]);
      continue;
    }
    const a = start + (arc >= Math.PI * 2 - 1e-6 ? (i / n) * arc : n > 1 ? (i / (n - 1)) * arc - arc / 2 : 0);
    out.push([Math.round(Math.sin(a) * ring * 100) / 100, Math.round(Math.cos(a) * ring * 100) / 100]);
  }
  return out;
}

export function buildFight(id, def, { difficulty = 'normal', act = 2, district = 'core', seed = 0 } = {}) {
  const rng = createRng(seedOf(`${id}:${difficulty}:${seed}`));
  const waves = (def.waves ?? []).map((w, wi) => {
    if (Array.isArray(w)) return w.map((e) => ({ ...e }));
    const extra = (w.add ?? []).map((e) => ({ ...e }));
    let list = [];
    if (w.budget > 0) {
      list = composeWave({ budget: w.budget, district: def.district ?? district, act: def.act ?? act, players: 1, difficulty, rng, gang: def.gang ?? null }).list;
      // A wave may pin its lead role (the night's tutorial beat): swap the first special for it.
      if (w.lead) {
        const i = list.findIndex((e) => e.type !== 'grunt');
        if (i >= 0) list[i] = { type: w.lead }; else if (list.length) list[0] = { type: w.lead }; else list.push({ type: w.lead });
      }
    }
    const pos = placeRing(list.length, { ring: w.ring ?? 6, arc: w.arc ?? Math.PI * 2, start: (w.start ?? 0) + wi * 0.7, spots: w.spots ?? null });
    return [...list.map((e, i) => ({ type: e.type, dx: pos[i][0], dz: pos[i][1] })), ...extra];
  });
  return { ...def, waves };
}

// Budget guide per act (research doc 6.5: sawtooth, rising per act; never health sponges).
export const ACT_BUDGET = { 1: [3, 6], 2: [5, 9], 3: [6, 11], 4: [7, 12], 5: [8, 14] };
