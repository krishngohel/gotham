// The El timetable as a pure function of time: where a train's head is along its track, how fast
// it goes and whether it stands at a station. Deterministic (no dt), so every client, every test
// and a paused or photo-mode world agree, and two trains on one track half a cycle apart can
// never meet (they follow the same timetable shifted in time).
//
// Each leg between stops is a trapezoid: accelerate at `acc`, cruise at `vmax`, brake at `acc` to
// stand `dwell` seconds at the stop. Research 1.2: 12 m/s, slowing through stations; we stop.
//   closed: the track is a loop; stops are distances along it (any order), the train runs on.
//   open:   the train shuttles end to end (stops at both ends are added), reversing at each.
export const EL_TIMING = { vmax: 12, acc: 1.1, dwell: 9 };

function legTime(d, vmax, acc) {
  const dAcc = (vmax * vmax) / acc; // accelerate + brake distance at full speed
  if (d >= dAcc) return 2 * (vmax / acc) + (d - dAcc) / vmax;
  return 2 * Math.sqrt(d / acc);
}
// Distance covered and speed `t` seconds into a leg of length d.
function legAt(d, t, vmax, acc, out) {
  const dAcc = (vmax * vmax) / acc;
  if (d >= dAcc) {
    const ta = vmax / acc, tc = (d - dAcc) / vmax;
    if (t < ta) { out.s = 0.5 * acc * t * t; out.v = acc * t; }
    else if (t < ta + tc) { out.s = 0.5 * acc * ta * ta + vmax * (t - ta); out.v = vmax; }
    else { const r = Math.max(0, 2 * ta + tc - t); out.s = d - 0.5 * acc * r * r; out.v = acc * r; }
  } else {
    const th = Math.sqrt(d / acc);
    if (t < th) { out.s = 0.5 * acc * t * t; out.v = acc * t; }
    else { const r = Math.max(0, 2 * th - t); out.s = d - 0.5 * acc * r * r; out.v = acc * r; }
  }
  return out;
}

// length: track length (m). stops: distances along the track where the train head halts.
export function createSchedule({ length, stops = [], closed = true, vmax = EL_TIMING.vmax, acc = EL_TIMING.acc, dwell = EL_TIMING.dwell }) {
  const legs = [];
  if (closed) {
    const st = [...new Set(stops.map((s) => ((s % length) + length) % length))].sort((a, b) => a - b);
    if (!st.length) st.push(0);
    for (let i = 0; i < st.length; i++) {
      const from = st[i], to = i + 1 < st.length ? st[i + 1] : st[0] + length;
      legs.push({ from, d: to - from, dir: 1, stop: i });
    }
  } else {
    // Out and back: 0 -> length (dir +1), then length -> 0 (dir -1), with any inner stops.
    const inner = [...new Set(stops.filter((s) => s > 1 && s < length - 1))].sort((a, b) => a - b);
    const out = [0, ...inner, length];
    for (let i = 0; i + 1 < out.length; i++) legs.push({ from: out[i], d: out[i + 1] - out[i], dir: 1 });
    for (let i = out.length - 1; i > 0; i--) legs.push({ from: out[i], d: out[i] - out[i - 1], dir: -1 });
  }
  let T = 0;
  for (const L of legs) { L.t0 = T; L.run = legTime(L.d, vmax, acc); T += dwell + L.run; }
  const tmp = { s: 0, v: 0 };

  // State at time t: { s (head distance along the track), v (m/s, >= 0), dir (+1 | -1),
  // stopped, leg }. Writes into `out` (allocation-free).
  function at(t, out = {}) {
    const c = ((t % T) + T) % T;
    let lo = 0, hi = legs.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (legs[m].t0 <= c) lo = m; else hi = m - 1; }
    const L = legs[lo];
    const k = c - L.t0;
    out.leg = lo;
    out.dir = L.dir;
    if (k < dwell) { out.s = L.from; out.v = 0; out.stopped = true; }
    else {
      legAt(L.d, k - dwell, vmax, acc, tmp);
      out.s = L.from + L.dir * tmp.s;
      out.v = tmp.v;
      out.stopped = tmp.v < 0.05;
    }
    if (closed) out.s = ((out.s % length) + length) % length;
    return out;
  }
  return { at, cycle: T, legs, length, closed };
}
