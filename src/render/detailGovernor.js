// [perf3] Adaptive detail: the second line of defence after dynamic resolution on a weak machine.
// Dynamic resolution only buys back GPU time; on a slow CPU (the usual weak laptop) a lower
// resolution does nothing for a frame that is late because of JavaScript. When dynamic resolution
// is already at its floor and frames still miss the display's refresh, this steps a few
// CPU-side budgets down, one small level at a time, and back up after a long calm spell:
//
//   level            0      1      2      3
//   crowd hulls/anim x1     x0.8   x0.65  x0.5   (quality.hullDistance, quality.animFullRate:
//                                                 read every frame by src/civilians/crowd.js)
//   traffic spawns   x1     x0.85  x0.7   x0.55  (soft cap: no new cars past it, none removed)
//   pedestrians      x1     x0.85  x0.7   x0.55  (soft cap, the same)
//
// No pops: nothing visible is removed. Fewer new cars and walkers spawn out of sight, distant
// figures lose their ink line and animate at a lower rate a few metres sooner.
// Pure logic (unit-tested); the game wires apply(level) to the systems.
export const LEVELS = [
  { crowd: 1, spawn: 1 },
  { crowd: 0.8, spawn: 0.85 },
  { crowd: 0.65, spawn: 0.7 },
  { crowd: 0.5, spawn: 0.55 },
];

// window: ms per judgement; downMisses: share of frames late (over 1.5 refresh periods) that,
// two windows running with dynamic resolution at its floor, steps a level down; upQuiet: ms of
// windows with under 1 % late frames before stepping back up.
export function createDetailGovernor({ apply = () => {}, window = 2000, downMisses = 0.1, upQuiet = 20000 } = {}) {
  let level = 0, t = 0, frames = 0, misses = 0, bad = 0, quiet = 0, enabled = true;
  function set(next) {
    next = Math.max(0, Math.min(LEVELS.length - 1, next));
    if (next === level) return;
    level = next;
    apply(LEVELS[level], level);
  }
  return {
    get level() { return level; },
    setEnabled(on) { enabled = on; if (!on) set(0); },
    // dt: ms since the last frame; periodMs: the display's refresh period; atFloor: dynamic
    // resolution cannot go lower (or is off).
    update(dt, periodMs, atFloor) {
      if (!enabled || !(dt > 0) || dt > 250) return;
      t += dt; frames += 1;
      if (dt > periodMs * 1.5) misses += 1;
      if (t < window) return;
      const ratio = misses / frames;
      t = 0; frames = 0; misses = 0;
      if (ratio > downMisses && atFloor) {
        quiet = 0;
        if (++bad >= 2) { bad = 0; set(level + 1); }
        return;
      }
      bad = 0;
      if (ratio < 0.01 && level > 0) { quiet += window; if (quiet >= upQuiet) { quiet = 0; set(level - 1); } }
      else quiet = 0;
    },
  };
}
