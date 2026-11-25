// Converts real frame time into game time, applying hit-stop freezes, slow motion and holds.
// A hold is a sustained slow-down that lasts until released (the gadget wheel, remote batarang
// steering). Several holds at once: the slowest wins. Holds stack with slow motion.
//
// Per-actor time (Long Night 2, workstream B; docs/design/research/coop-netcode.md, "Time
// scaling"). Every effect says what it scales:
// - hitStop(sec, actors): freezes the fighters in `actors` (attacker and victim). Without
//   `actors` it is a world freeze (old callers).
// - slowMo(sec, scale, scope) and hold(id, scale, scope): `scope` is 'world' (the default; rare
//   cinematic beats like the boss finisher) or a player (anything with an `id`, or the id itself):
//   player-local (a counter's or a critical's slow motion, the gadget wheel, remote steering, the
//   impact frame).
// With ONE player every effect lands on the world clock exactly as before (pinned by
// tests/unit/timeCharacterisation.test.js against a frozen copy of the old engine). With more
// than one, hit-stop freezes only the actors involved, and player-local slow motion and holds no
// longer slow the world: they only change that player's localScale() (its own view and HUD
// effects may read it), so one player opening the gadget wheel never slows the other's fight.
//
// Reading time, once per frame: scale(real) returns the world's dt; dtFor(actor) returns that
// actor's dt this frame (the world's, unless the actor is frozen by a hit-stop).
export const WORLD = 'world';

export function createTimeControl() {
  let stop = 0;
  let slow = 0;
  let slowScale = 1;
  const holds = new Map();
  let holdScale = 1;
  let players = 1;
  // Per-actor hit-stop (several players): remaining real seconds of freeze per actor, and the dt
  // each frozen actor gets this frame (actors not in the map get the world's dt).
  const freeze = new Map();
  const actorDts = new Map();
  let worldDt = 0;
  // Player-local slow motion and holds (several players): key -> { slow, slowScale, holds, holdScale }.
  const local = new Map();
  const refresh = () => {
    holdScale = 1;
    for (const s of holds.values()) holdScale = Math.min(holdScale, s);
  };
  const keyOf = (scope) => (scope && typeof scope === 'object' ? scope.id : scope);
  const isWorld = (scope) => scope === undefined || scope === null || scope === WORLD || players <= 1;
  function localFor(scope) {
    const k = keyOf(scope);
    let l = local.get(k);
    if (!l) { l = { slow: 0, slowScale: 1, holds: new Map(), holdScale: 1 }; local.set(k, l); }
    return l;
  }
  const refreshLocal = (l) => {
    l.holdScale = 1;
    for (const s of l.holds.values()) l.holdScale = Math.min(l.holdScale, s);
  };

  return {
    // How many players share this world. 1: every effect is a world effect, as before co-op.
    setPlayerCount(n) { players = Math.max(1, n | 0); },
    get playerCount() { return players; },
    hitStop(sec, actors = null) {
      if (!actors || players <= 1) { stop = Math.max(stop, sec); return; }
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i];
        if (a) freeze.set(a, Math.max(freeze.get(a) ?? 0, sec));
      }
    },
    slowMo(sec, scale, scope = WORLD) {
      if (isWorld(scope)) { slow = Math.max(slow, sec); slowScale = scale; return; }
      const l = localFor(scope);
      l.slow = Math.max(l.slow, sec);
      l.slowScale = scale;
    },
    // Re-asserting an unchanged hold (the remote does every steering frame) is a no-op: no refresh.
    hold(id, scale, scope = WORLD) {
      const s = Math.min(1, Math.max(0.01, scale));
      if (isWorld(scope)) {
        if (holds.get(id) === s) return;
        holds.set(id, s);
        refresh();
        return;
      }
      const l = localFor(scope);
      if (l.holds.get(id) === s) return;
      l.holds.set(id, s);
      refreshLocal(l);
    },
    release(id) {
      if (holds.delete(id)) refresh();
      if (local.size) for (const l of local.values()) if (l.holds.delete(id)) refreshLocal(l);
    },
    // Drops every hold at once: a pause, a death, a cutscene or a new run never inherits one.
    releaseAll() {
      if (holds.size) { holds.clear(); refresh(); }
      if (local.size) for (const l of local.values()) if (l.holds.size) { l.holds.clear(); l.holdScale = 1; }
    },
    scale(dt) {
      const real = dt;
      // Player-local slow motion runs out on real time.
      if (local.size) for (const l of local.values()) if (l.slow > 0) l.slow -= real;
      let out, gone = false;
      if (stop > 0) {
        const used = Math.min(stop, dt);
        stop -= used;
        dt -= used;
        if (dt <= 1e-9) gone = true;
      }
      if (gone) out = 0;
      else {
        out = dt;
        if (slow > 0) { slow -= dt; out = dt * slowScale; }
        out *= holdScale;
      }
      worldDt = out;
      // Per-actor freezes: the frozen part of this frame comes out of that actor's dt only.
      actorDts.clear();
      if (freeze.size) {
        const k = real > 0 ? out / real : 0;
        for (const [a, rem] of freeze) {
          const used = Math.min(rem, real);
          actorDts.set(a, Math.max(0, real - used) * k);
          if (rem - used <= 1e-9) freeze.delete(a); else freeze.set(a, rem - used);
        }
      }
      return out;
    },
    // This frame's dt for one actor (a hero, a goon): the world's, less any hit-stop on it.
    // `fallback` is the dt the caller already holds for the world (defaults to scale()'s last).
    dtFor(actor, fallback = worldDt) { const d = actorDts.get(actor); return d === undefined ? fallback : d; },
    // Whether an actor is frozen by a hit-stop right now (several players only).
    frozen(actor) { return freeze.has(actor); },
    // A player's own time scale (player-local slow motion and holds, several players only). The
    // world does not run at it; that player's view or HUD effects may.
    localScale(player) {
      const l = local.get(keyOf(player));
      if (!l) return 1;
      return (l.slow > 0 ? l.slowScale : 1) * l.holdScale;
    },
    get held() { return holdScale; },
    heldFor(player) { return local.get(keyOf(player))?.holdScale ?? 1; },
    get stopped() { return stop > 0; },
    get debug() { return { stop, slow, slowScale, holdScale, players, frozen: freeze.size }; },
  };
}
