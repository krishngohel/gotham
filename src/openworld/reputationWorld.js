// Fear and reputation out in the city (pure). The combat system keeps the city-wide reputation
// (src/enemies/fear.js createReputation: value + per-gang numbers); this reads it at the moment a
// crew sees the Bat coming, and shapes what a district's lieutenant brings to the next fight.
//
//   arrivalReaction({ fearBias 0..1, heat 0..5, cocky 0..1, n, rng }) -> { surrender, flee, trap }
//     A feared Bat (high gang reputation) walking into a quiet district: some of the crew give up
//     on the spot, a couple run. A hot district's cocky crew does the opposite: they were waiting.
//   lieutenantEntries(lt, look) -> wave entries: the lieutenant plus his counters for how he lost
//     last time (memory: 'gadgets' -> shields, 'counters' -> knives and a brute, 'stealth' -> a
//     lookout rifle, 'brawling' -> a medic).
//   styleOf({ gadgets, counters, stealth }) -> the counters a beaten lieutenant remembers.
export function arrivalReaction({ fearBias = 0, heat = 1, cocky = 0, n = 0, rng }) {
  const out = { surrender: 0, flee: 0, trap: false };
  if (n <= 0) return out;
  // Fear outweighs a hot street's nerve; heat 5 cancels most of it.
  const f = Math.max(0, fearBias - heat * 0.08);
  if (cocky > 0.4) { out.trap = rng.next() < cocky; return out; }
  if (f < 0.25) return out;
  const r = rng.next();
  const share = Math.min(0.6, f * 0.7);
  out.surrender = Math.min(n - 1, Math.floor(n * share * (0.6 + r * 0.6)));
  out.flee = f > 0.5 && n - out.surrender > 2 ? 1 + (r > 0.6 ? 1 : 0) : 0;
  return out;
}

const COUNTERS = {
  gadgets: [{ type: 'shield' }, { type: 'shield' }],
  counters: [{ type: 'knife' }, { type: 'brute' }],
  stealth: [{ type: 'rifle' }],
  brawling: [{ type: 'medic' }],
};
export function lieutenantEntries(lt, look) {
  const out = [{ type: 'lieutenant', dx: 0, dz: -4, gang: lt.gang, look, lt: true, elite: true }];
  let k = 0;
  for (const m of lt.memory ?? []) for (const e of COUNTERS[m] ?? []) { out.push({ ...e, dx: (k % 2 ? 1 : -1) * (3 + k), dz: -5, gang: lt.gang, look }); k++; }
  return out;
}

export function styleOf({ gadgets = 0, counters = 0, stealth = 0 } = {}) {
  const out = [];
  if (gadgets >= 3) out.push('gadgets');
  if (counters >= 4) out.push('counters');
  if (stealth >= 2) out.push('stealth');
  if (!out.length) out.push('brawling');
  return out;
}
