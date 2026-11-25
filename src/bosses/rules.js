// Boss rules (pure, unit-tested): difficulty tiers, two-player targeting that no one can trivialise
// by kiting, and the phase/progress maths the HUD bar shows. Research doc 6.5: hard means mix, not
// health; co-op gives a boss one extra mechanic, not extra health.

// Per difficulty: how long a tell lasts (x the base), how long a vulnerability window stays open,
// how much the adds budget grows, and whether the boss gets its late extra mechanic early.
export const BOSS_TIERS = {
  story: { tell: 1.35, window: 1.5, adds: 0.6, damage: 0.5, early: false, hint: true },
  normal: { tell: 1, window: 1, adds: 1, damage: 1, early: false, hint: true },
  hard: { tell: 0.85, window: 0.8, adds: 1.25, damage: 1.25, early: true, hint: true },
  knightmare: { tell: 0.75, window: 0.7, adds: 1.4, damage: 1.4, early: true, hint: false },
};
export const bossTier = (difficulty) => BOSS_TIERS[difficulty] ?? BOSS_TIERS.normal;

// The bar: phases each worth the same slice; `inPhase` 0..1 is how far through the current one.
export function barFraction(phaseIndex, phaseCount, inPhase) {
  if (phaseCount <= 0) return 0;
  const done = Math.max(0, Math.min(phaseCount, phaseIndex + Math.max(0, Math.min(1, inPhase))));
  return 1 - done / phaseCount;
}

// Two-player targeting with an anti-kite rule. state = { target, swapT, far: Map(hero -> s) } is
// the boss's own memory. Each call:
//   - a hero more than `leash` metres away accrues "kite" time; within it, the time drains;
//   - the boss keeps its target, but swaps to the other standing hero every `swapEvery` seconds
//     (both players matter), or at once when the target has kited for `kiteT` seconds and the
//     other hero is closer (one player cannot run circles while the other hits);
//   - `punish` names a hero that has kited for `kiteT`: the boss's ranged attack goes to them, so
//     staying out of reach is never free (with one player it reads: stop running, come and fight).
export function createTargeting({ leash = 14, kiteT = 4, swapEvery = 9 } = {}) {
  const far = new Map();
  const st = { target: null, swapT: swapEvery, punish: null };
  return {
    get target() { return st.target; },
    get punish() { return st.punish; },
    update(dt, bossPos, heroes) {
      const up = heroes.filter((h) => h && !h.dead);
      if (!up.length) { st.target = null; st.punish = null; return null; }
      const dist = (h) => Math.hypot(h.pos.x - bossPos.x, h.pos.z - bossPos.z);
      st.punish = null;
      for (const h of up) {
        const t = far.get(h) ?? 0;
        const nt = dist(h) > leash ? t + dt : Math.max(0, t - dt * 2);
        far.set(h, nt);
        if (nt >= kiteT) st.punish = h;
      }
      if (!st.target || st.target.dead || !up.includes(st.target)) st.target = up.reduce((a, b) => (dist(a) <= dist(b) ? a : b));
      if (up.length > 1) {
        st.swapT -= dt;
        const other = up.find((h) => h !== st.target);
        const kited = (far.get(st.target) ?? 0) >= kiteT && dist(other) < dist(st.target);
        if (st.swapT <= 0 || kited) { st.target = other; st.swapT = swapEvery; }
      }
      return st.target;
    },
    kiteTime: (h) => far.get(h) ?? 0,
    reset() { far.clear(); st.target = null; st.swapT = swapEvery; st.punish = null; },
  };
}

// How many players' worth of mechanics a boss runs (1 or 2): co-op adds one mechanic per boss.
export const coopExtra = (players) => (players > 1 ? 1 : 0);

// Hits a vulnerability window takes to close a phase: the same on every tier (no sponges).
export const HITS_PER_WINDOW = 5;
