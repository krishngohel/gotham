// Decides which enemies may start an attack wind-up, so fights stay readable: a cap on
// simultaneous wind-ups, a cooldown per enemy after it attacks, and spacing between starts. Pure.
//
// Attack tokens are per target player (Long Night 2, workstream B): a candidate may name the
// player it is going for (`target`, any key), and the wind-up cap and the start spacing then apply
// to each target separately, so two heroes each face up to `maxWindups` attackers. Candidates
// without a target all share one pool, which is exactly the single-player director.
//
// Director v2 (workstream I; research doc 3.1, "tokens fix timing; slots fix space"):
// - a candidate may carry a `cost` (light melee 1, heavy/unblockable 2, grab 2; default 1) and
//   `ranged: true`. With a `budget` configured, the summed cost of the melee wind-ups on one
//   target may not exceed it (all or nothing per attack; a single attack dearer than the whole
//   budget may still go alone). Without a budget the director behaves exactly as before.
// - ranged candidates draw from their own per-target pool (`rangedBudget` tokens, default 1 when a
//   budget is set) and never count against the melee cap or spacing, so a gunner holding an angle
//   does not stop the melee rhythm, and vice versa.
// - pressure valve: a target nobody has started a melee attack on for PRESSURE_AFTER seconds gets
//   one extra token until the next start on it (a hero who keeps clear is pushed, not left alone).
// - steal(from, to): an enemy already in the inner ring takes over the token of one still on its
//   way (the "attack job" hand-off); the giver gets no cooldown, it never attacked.
export const PRESSURE_AFTER = 2.5;
const NONE = Object.freeze([]);

export function createDirector({ maxWindups = 2, gap = [2.2, 4], minSpacing = 0.35, budget, rangedBudget, rng }) {
  const active = new Set();
  // Which target each active wind-up is on (undefined: the shared pool), its cost, and whether
  // it is a ranged token.
  const activeOn = new Map();
  const costOf = new Map();
  const rangedOf = new Map();
  const cooldown = new Map();
  // Seconds since the last melee / ranged start, per target (spacing).
  const since = new Map();
  const sinceRanged = new Map();
  // Seconds since a melee start on a target, counted from when it was first seen (pressure valve).
  const quiet = new Map();
  const rand = () => (rng ? rng.next() : Math.random());
  // Melee wind-ups on one target (the old cap counts these only).
  const onTarget = (k) => {
    let n = 0;
    for (const [id, v] of activeOn) if (v === k && !rangedOf.get(id)) n++;
    return n;
  };
  const spent = (k, ranged) => {
    let n = 0;
    for (const [id, v] of activeOn) if (v === k && !!rangedOf.get(id) === ranged) n += costOf.get(id) ?? 1;
    return n;
  };
  const budgetFor = (k) => {
    if (budget === undefined) return Infinity;
    const q = quiet.get(k) ?? 0;
    return budget + (q >= PRESSURE_AFTER || q === -1 ? 1 : 0);
  };
  const rangedCap = () => rangedBudget ?? (budget === undefined ? Infinity : 1);
  const take = (c, cost, ranged) => {
    active.add(c.id); activeOn.set(c.id, c.target); costOf.set(c.id, cost); rangedOf.set(c.id, ranged);
    started.push(c.id);
  };
  // Scratch lists reused between ticks (no allocation once warmed up).
  const order = [];
  const started = [];

  return {
    get active() { return active; },
    configure(o) {
      if (o.maxWindups) maxWindups = o.maxWindups;
      if (o.gap) gap = o.gap;
      if (o.budget !== undefined) budget = o.budget;
      if (o.rangedBudget !== undefined) rangedBudget = o.rangedBudget;
    },
    // How many melee wind-ups are going for one target right now.
    activeOn: onTarget,
    // Tokens (summed costs) held on a target: melee and ranged together.
    tokensOn(k) { return spent(k, false) + spent(k, true); },
    // Whether this enemy holds a token now.
    held(id) { return active.has(id); },
    // The melee budget on a target this instant (Infinity without a configured budget).
    budgetFor,
    // candidates: [{ id, ready, target?, cost?, ranged? }]. Returns ids that should begin winding up
    // now (a fresh array when anything started; a shared empty one otherwise).
    tick(dt, candidates) {
      for (const [k, t] of since) since.set(k, t + dt);
      for (const [k, t] of sinceRanged) sinceRanged.set(k, t + dt);
      for (const [k, t] of quiet) quiet.set(k, t + dt);
      for (const [id, t] of cooldown) cooldown.set(id, t - dt);
      started.length = 0;
      order.length = 0;
      for (const c of candidates) {
        if (!c.ranged && !quiet.has(c.target)) quiet.set(c.target, 0);
        if (c.ready && !active.has(c.id) && (cooldown.get(c.id) ?? 0) <= 0) order.push(c);
      }
      // Shuffle so the same enemy doesn't always go first.
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
      for (const c of order) {
        const k = c.target;
        const cost = c.cost ?? 1;
        if (c.ranged) {
          const used = spent(k, true);
          if ((used > 0 && used + cost > rangedCap()) || (sinceRanged.get(k) ?? Infinity) < minSpacing) continue;
          take(c, cost, true);
          sinceRanged.set(k, 0);
          continue;
        }
        // A full target, or one whose last start was too recent, is skipped; other targets still
        // get theirs. (With one pool this is the old "stop at the cap / one start per spacing".)
        if (onTarget(k) >= maxWindups || (since.get(k) ?? Infinity) < minSpacing) continue;
        const used = spent(k, false);
        if (used > 0 && used + cost > budgetFor(k)) continue;
        take(c, cost, false);
        since.set(k, 0);
        // The pressure clock restarts after this tick (-1: started under pressure, so the rest of
        // this tick keeps the extra token; -2: started without it).
        quiet.set(k, budgetFor(k) > budget ? -1 : -2);
      }
      for (const [k, t] of quiet) if (t < 0) quiet.set(k, 0);
      return started.length ? started.slice() : NONE;
    },
    // Called when the attack lands, whiffs, is countered or the enemy is interrupted.
    release(id) {
      if (!active.delete(id)) return;
      activeOn.delete(id); costOf.delete(id); rangedOf.delete(id);
      cooldown.set(id, gap[0] + rand() * (gap[1] - gap[0]));
    },
    // Hands an active token from `fromId` to `toId` (same target, cost and pool); the giver gets
    // no cooldown. Returns whether it happened.
    steal(fromId, toId) {
      if (!active.has(fromId) || active.has(toId)) return false;
      const k = activeOn.get(fromId), cost = costOf.get(fromId), ranged = rangedOf.get(fromId);
      active.delete(fromId); activeOn.delete(fromId); costOf.delete(fromId); rangedOf.delete(fromId);
      active.add(toId); activeOn.set(toId, k); costOf.set(toId, cost); rangedOf.set(toId, ranged);
      return true;
    },
    // Keep an enemy from attacking for a while (fresh arrivals get a grace period).
    hold(id, seconds) { cooldown.set(id, Math.max(cooldown.get(id) ?? 0, seconds)); },
    remove(id) { active.delete(id); activeOn.delete(id); costOf.delete(id); rangedOf.delete(id); cooldown.delete(id); },
    clear() { active.clear(); activeOn.clear(); costOf.clear(); rangedOf.clear(); cooldown.clear(); since.clear(); sinceRanged.clear(); quiet.clear(); },
  };
}
