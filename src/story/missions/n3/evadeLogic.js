// [m23] Pure rule of an `evade` step (src/story/missions/n3/evadeStep.js): the police are after
// Batman by plot; the step is over once they have lost him and stood down for good.
//
//   const e = createEvade({ settle, minSeconds })
//   e.step(dt, { level, busy }) -> null | 'clear'
//     level  the police attention level now (0 = nobody is looking)
//     busy   a hero is surrounded or in the holding cell (a breakout pursuit follows: not clear yet)
// "Clear" needs the level at 0 for `settle` seconds in a row, and never before `minSeconds`.
export const EVADE = { settle: 2, minSeconds: 6 };

export function createEvade({ settle = EVADE.settle, minSeconds = EVADE.minSeconds } = {}) {
  let t = 0, quiet = 0, peak = 0, done = false;
  return {
    step(dt, { level = 0, busy = false } = {}) {
      if (done) return null;
      t += dt;
      peak = Math.max(peak, level);
      if (level > 0 || busy) { quiet = 0; return null; }
      quiet += dt;
      if (quiet >= settle && t >= minSeconds) { done = true; return 'clear'; }
      return null;
    },
    reset() { t = 0; quiet = 0; peak = 0; done = false; },
    get time() { return t; },
    get peak() { return peak; },
    get done() { return done; },
  };
}
