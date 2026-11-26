// [onboard] The HUD director: who gets the middle of the screen, when, and how things arrive.
//
// Pure scheduling (no DOM; the clock is passed in, so it is unit-tested) plus the small numeric
// helpers the HUD uses for anticipatory reveals. src/ui/hud.js owns the DOM and asks it each frame.
//
// Rules:
//   - One centre card at a time (the goal banner, a WayneTech delivery, a level-up, a case-file
//     tick, a mission card). Higher priority first, then first come first served. A gap of GAP_MS
//     between two, so one never pops on the heels of another.
//   - Not over combat: while a fight is close (`combat`), a non-critical item waits for a lull. One
//     that has waited COLLAPSE_MS (or is marked `collapse: 'now'`) is collapsed to a compact chip
//     instead, so it is never lost and never covers the action. A goal banner in combat collapses at
//     once: the corner caption already carries the goal.
//   - Nothing new over a comic or a cinematic (`blocked`); what is up stays up (the HUD is hidden
//     under a comic anyway).
//   - A `critical` item (mission failed, a boss) shows even in combat and cuts the current one short.
//   - Compact HUD (setting): every non-critical centre item becomes a chip.
//   - Chips: up to MAX_CHIPS at once in a column under the objective caption, CHIP_MS each.
export const PRIORITY = Object.freeze({ critical: 100, banner: 60, mission: 50, card: 40, tip: 20, news: 10 });
export const GAP_MS = 260;
export const COLLAPSE_MS = 6000;
export const CHIP_MS = 2800;
export const MAX_CHIPS = 3;
// Enter / exit timing shared by every animated HUD element (style.css uses the same numbers).
export const ENTER_MS = 260;
export const EXIT_MS = 200;
// Reaching a goal: the world gets this long to acknowledge it (marker burst, stinger) before the
// next goal's banner and lines come in. Control never leaves the player.
export const HANDOFF_MS = 900;
export const HANDOFF_REDUCED_MS = 500;

export function createHudDirector({ compact = () => false } = {}) {
  const queue = []; // { id, kind, priority, ms, critical, payload, at, collapse }
  const chips = []; // { id, text, until, kind }
  let current = null; // { item, until }
  let freeAt = 0;
  let seq = 0;
  const ops = [];

  const better = (a, b) => (a.priority !== b.priority ? a.priority > b.priority : a.seq < b.seq);
  function pickNext() {
    let best = -1;
    for (let i = 0; i < queue.length; i++) if (best < 0 || better(queue[i], queue[best])) best = i;
    return best;
  }
  function toChip(item, t, why) {
    const text = item.chip ?? item.payload?.chip ?? item.payload?.title ?? item.payload?.text ?? item.id;
    // A goal banner collapses into the corner caption that already carries it: no chip.
    if (item.kind !== 'banner') chips.push({ id: item.id, text, kind: item.kind, until: t + CHIP_MS, from: why });
    ops.push({ op: 'collapse', item, why });
  }

  return {
    // item: { id, kind, priority?, ms, critical?, payload, chip?, collapse?: 'combat'|'now' }
    request(item, t) {
      const it = { priority: PRIORITY[item.kind] ?? PRIORITY.card, ms: 3000, ...item, seq: seq++, at: t };
      if (it.critical) it.priority = Math.max(it.priority, PRIORITY.critical);
      // The same card twice (a repeated delivery) is one card.
      if (queue.some((q) => q.id === it.id) || current?.item.id === it.id) return it;
      queue.push(it);
      return it;
    },
    chip(id, text, t, kind = 'chip') {
      const old = chips.findIndex((c) => c.id === id);
      if (old >= 0) chips.splice(old, 1);
      chips.push({ id, text, kind, until: t + CHIP_MS });
      ops.push({ op: 'chip', id });
    },
    // The action is starting: the card on screen comes down once it has had minMs; queued cards stay.
    dismiss(t, minMs = 1500) {
      if (current && !current.item.critical) current.until = Math.min(current.until, Math.max(t, current.shown + minMs));
    },
    drop(id) {
      const i = queue.findIndex((q) => q.id === id);
      if (i >= 0) queue.splice(i, 1);
    },
    // Advances to time t (ms). ctx: { combat, blocked }. Returns the ops for the DOM:
    // { op: 'show' | 'hide' | 'collapse' | 'chip' | 'chipsChanged', item }.
    tick(t, { combat = false, blocked = false } = {}) {
      ops.length = 0;
      // Chips age out.
      for (let i = chips.length - 1; i >= 0; i--) if (chips[i].until <= t) { chips.splice(i, 1); ops.push({ op: 'chipsChanged' }); }
      while (chips.length > MAX_CHIPS) { chips.shift(); ops.push({ op: 'chipsChanged' }); }
      if (current && t >= current.until) { ops.push({ op: 'hide', item: current.item }); current = null; freeAt = t + GAP_MS; }
      // Combat and compact mode: what can't wait collapses to a chip.
      for (let i = queue.length - 1; i >= 0; i--) {
        const q = queue[i];
        if (q.critical) continue;
        const waited = t - q.at;
        if (compact() || q.collapse === 'now' || (combat && (q.kind === 'banner' || waited >= COLLAPSE_MS))) { queue.splice(i, 1); toChip(q, t, compact() ? 'compact' : 'combat'); }
      }
      if (blocked) return ops;
      const i = pickNext();
      if (i < 0) return ops;
      const next = queue[i];
      // A critical item takes the slot now; anything else waits for it to be free and a lull.
      if (current) {
        if (!next.critical || current.item.critical) return ops;
        ops.push({ op: 'hide', item: current.item });
        current = null;
      } else if (t < freeAt && !next.critical) return ops;
      if (combat && !next.critical) return ops;
      queue.splice(i, 1);
      current = { item: next, shown: t, until: t + next.ms };
      ops.push({ op: 'show', item: next });
      return ops;
    },
    get current() { return current?.item ?? null; },
    get waiting() { return queue.length; },
    get chips() { return chips; },
    reset() { queue.length = 0; chips.length = 0; current = null; freeAt = 0; },
  };
}

// ---------------------------------------------------------------- anticipatory reveal

// How far into the reveal a goal is: 0 at `outer` meters and beyond, 1 at `radius` (the trigger)
// and inside, smoothstepped between. outer defaults to radius + 28 m (a few seconds at a run).
export function approachLevel(dist, radius, outer = radius + 28) {
  if (!Number.isFinite(dist)) return 0;
  if (dist <= radius) return 1;
  if (dist >= outer) return 0;
  const x = (outer - dist) / (outer - radius);
  return x * x * (3 - 2 * x);
}

// The reveal pose for level k (0..1): fade, a small rise and a slight scale. Reduced motion: a
// plain fade.
export function revealStyle(k, reduced = false) {
  const a = Math.min(1, Math.max(0, k));
  if (reduced) return { opacity: a, y: 0, scale: 1 };
  return { opacity: a, y: (1 - a) * 10, scale: 0.96 + 0.04 * a };
}

// Quantised so the DOM is only written when what shows actually changes (about 30 steps).
export const quantise = (k, steps = 32) => Math.round(Math.min(1, Math.max(0, k)) * steps) / steps;

export const handoffMs = (reduced = false) => (reduced ? HANDOFF_REDUCED_MS : HANDOFF_MS);
