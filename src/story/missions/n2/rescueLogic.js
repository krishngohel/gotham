// [m23] Pure rules of a `rescue` step (src/story/missions/n2/rescueStep.js): people locked up at
// several places, a clock, and guards who have to be dealt with before a lock can be worked.
//
//   const r = createRescue({ count, hold, timer, decay })
//   r.step(dt, working, blocked) -> null | { freed: i } | 'allFree' | 'timeout'
//     working[i]  a hero is at captive i's lock
//     blocked[i]  a guard who is still up stands over it (the lock cannot be worked)
// The clock stops when the last captive is out. No DOM, no three.js, nothing allocated per step.
export const RESCUE = { hold: 2.4, decay: 0.6, reach: 2.6, guardReach: 4.5 };

export function createRescue({ count, hold = RESCUE.hold, timer = null, decay = RESCUE.decay } = {}) {
  const progress = new Array(count).fill(0);
  const freed = new Array(count).fill(false);
  let clock = timer, left = count, over = false;
  const hit = { freed: 0 };
  return {
    step(dt, working, blocked) {
      if (over) return null;
      if (clock != null && left > 0) {
        clock -= dt;
        if (clock <= 0) { clock = 0; over = true; return 'timeout'; }
      }
      for (let i = 0; i < count; i++) {
        if (freed[i]) continue;
        if (working[i] && !blocked[i]) progress[i] = Math.min(hold, progress[i] + dt);
        else progress[i] = Math.max(0, progress[i] - dt * decay);
        if (progress[i] >= hold) {
          freed[i] = true;
          left -= 1;
          hit.freed = i;
          if (left === 0) { over = true; return 'allFree'; }
          return hit;
        }
      }
      return null;
    },
    reset() { progress.fill(0); freed.fill(false); clock = timer; left = count; over = false; },
    fraction: (i) => progress[i] / hold,
    isFree: (i) => freed[i],
    get lastFreed() { return hit.freed; },
    get left() { return left; },
    get clock() { return clock; },
    get done() { return left === 0; },
  };
}

// Which captive a point is at (within reach, about the same height), or -1.
export function captiveAt(spots, p, reach = RESCUE.reach) {
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i];
    if (s && Math.hypot(p.x - s.x, p.z - s.z) < reach && Math.abs(p.y - s.y) < 3) return i;
  }
  return -1;
}
