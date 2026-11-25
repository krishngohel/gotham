// Voice budget with priority-based stealing. Pure bookkeeping: the engine asks admit() before it
// builds a sound and fades out whatever victim comes back.
//
// A voice is { name, priority, start, end, max }. Rules, in order:
//   1. finished voices are dropped;
//   2. a sound already at its own `max` steals its oldest copy (20 punches never pile up);
//   3. under the global cap, it just plays;
//   4. at the cap it steals the lowest-priority, oldest voice, but only if that voice's priority
//      is not higher than the newcomer's. Otherwise the newcomer is rejected: a footstep never
//      cuts off a KO.
export const PRIORITY = Object.freeze({
  ambient: 0, // drips, distant one-shots, footsteps of goons
  movement: 1, // the player's footsteps, cloth, whooshes
  normal: 2, // most effects
  ui: 3, // menu sounds must always answer a click
  combat: 3, // impacts
  critical: 4, // KO, takedown, crit layer, stingers-as-effects
  story: 5, // anything the story depends on hearing
});

export function createVoicePool({ cap = 24 } = {}) {
  let voices = [];
  let limit = Math.max(1, cap | 0);

  function prune(now) {
    if (voices.some((v) => v.end <= now)) voices = voices.filter((v) => v.end > now);
  }

  return {
    get cap() { return limit; },
    setCap(n) { limit = Math.max(1, n | 0); },
    get size() { return voices.length; },
    active(now) { prune(now); return voices.slice(); },
    // Returns { ok, victim }. When ok is true the caller must call add() with the new voice
    // (after building it) and fade out `victim` if there is one.
    admit({ name, priority = PRIORITY.normal, max = Infinity }, now) {
      prune(now);
      let same = null, sameCount = 0;
      for (const v of voices) if (v.name === name) { sameCount++; if (!same || v.start < same.start) same = v; }
      if (sameCount >= max && same) { this.remove(same); return { ok: true, victim: same }; }
      if (voices.length < limit) return { ok: true, victim: null };
      let low = null;
      for (const v of voices) {
        if (!low || v.priority < low.priority || (v.priority === low.priority && v.start < low.start)) low = v;
      }
      if (!low || low.priority > priority) return { ok: false, victim: null };
      this.remove(low);
      return { ok: true, victim: low };
    },
    add(v) { voices.push(v); return v; },
    remove(v) { const i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); },
    clear() { voices = []; },
  };
}
