// The tether (workstream D1): two players on one story never drift so far apart that a beat
// strands one of them. Pure.
//
// During a mission step, past `warn` metres apart (or `dy` metres of height: one on a roof, one in
// the street far below) a regroup prompt shows in both views with a countdown; past `hard` metres
// the countdown is short. When it runs out the straggler is brought to the partner (game side:
// coopRuntime.regroup()). Coming back together clears it. Free roam (no step, after the credits),
// cutscenes, a vehicle ride together and a downed player (revive first) never count.
export const TETHER = Object.freeze({ warn: 75, hard: 150, dy: 45, warnTime: 12, hardTime: 4 });

export function createTether(opts = {}) {
  const o = { ...TETHER, ...opts };
  let t = 0;
  const out = { warn: false, regroup: false, dist: 0, left: 0 };
  return {
    options: o,
    reset() { t = 0; },
    // { mission, dist, dy, anyDown } -> { warn, regroup, dist, left (seconds to the regroup) }
    update(dt, { mission, dist, dy = 0, anyDown = false }) {
      out.warn = false; out.regroup = false; out.dist = dist; out.left = 0;
      if (!mission || anyDown) { t = 0; return out; }
      const far = dist > o.warn || dy > o.dy;
      if (!far) { t = Math.max(0, t - dt * 2); return out; }
      t += dt;
      const limit = dist > o.hard ? o.hardTime : o.warnTime;
      out.left = Math.max(0, limit - t);
      out.warn = true;
      if (t >= limit) { out.regroup = true; t = 0; }
      return out;
    },
  };
}
