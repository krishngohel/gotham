// Clock sync and the interpolation delay (workstream D2; research decisions 10 and 11).
//
// NTP-style: the guest stamps a ping (t0), the host answers with its receive and send times (t1, t2),
// the guest notes the arrival (t3). offset = ((t1 - t0) + (t2 - t3)) / 2, rtt = (t3 - t0) - (t2 - t1).
// The minimum-RTT sample of the last 8 is the truth; the applied offset slews toward it by at most
// `slew` ms per call to tick(), never stepping (a step would make every puppet jump), except for
// the very first sample.
//
// Host time is the host's performance.now(); every snapshot and event carries it. Everything on the
// guest that needs host time asks clock.hostNow().

export function createClockSync({ now = () => performance.now(), window = 8, slew = 1 } = {}) {
  const samples = [];
  let target = 0, offset = 0, have = false, rtt = 0;
  return {
    // One pong: t0 our send, t1 host receive, t2 host send, t3 our receive (all ms).
    sample(t0, t1, t2, t3 = now()) {
      const r = (t3 - t0) - (t2 - t1);
      if (!(r >= 0) || r > 10000) return;
      const o = ((t1 - t0) + (t2 - t3)) / 2;
      samples.push({ r, o });
      if (samples.length > window) samples.shift();
      let best = samples[0];
      for (const s of samples) if (s.r < best.r) best = s;
      target = best.o;
      rtt = best.r;
      if (!have) { offset = target; have = true; }
    },
    // Once a frame: move the applied offset toward the best estimate.
    tick() {
      if (!have) return;
      const d = target - offset;
      offset += Math.max(-slew, Math.min(slew, d));
    },
    hostNow() { return now() + offset; },
    toLocal(hostT) { return hostT - offset; },
    get offset() { return offset; },
    get rtt() { return rtt; },
    get synced() { return have; },
    // A test or a fresh connection: start over.
    reset() { samples.length = 0; have = false; offset = 0; target = 0; rtt = 0; },
  };
}

// How far behind the host's clock the guest draws the world: the median one-way lag of snapshots
// (arrival on the synced host clock minus send time) plus an interpolation buffer of 2 send
// intervals plus the spread of arrival jitter (p95 - p50), clamped to [min, max] (start 125 ms at
// 20 Hz; research decision 10). Without the lag term a far peer would draw past its newest data
// and spend its life extrapolating.
export function createInterpDelay({ start = 125, min = 100, max = 250, interval = 50 } = {}) {
  const lags = [];
  let buffer = start, lag = 0;
  const sorted = [];
  return {
    note(arrivalHostClock, sendHost) {
      lags.push(arrivalHostClock - sendHost);
      if (lags.length > 40) lags.shift();
      if (lags.length < 8) return;
      sorted.length = 0;
      for (const l of lags) sorted.push(l);
      sorted.sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)], p95 = sorted[Math.floor(sorted.length * 0.95)];
      const want = Math.max(min, Math.min(max, 2 * interval + (p95 - p50)));
      // Ease toward it (no visible jumps in where puppets are drawn).
      buffer += (want - buffer) * 0.1;
      lag += (Math.max(0, p50) - lag) * 0.1;
    },
    // Total delay behind host time; the buffer part alone (what the research's 100-250 ms means).
    get value() { return lag + buffer; },
    get buffer() { return buffer; },
    get lag() { return lag; },
  };
}

// A per-entity ring of timestamped samples, sampled at render time with linear interpolation
// between the two bracketing samples, extrapolation for at most `maxExtrap` ms past the newest
// (then the newest is held). Positions only; the caller handles angles and discrete fields.
export function createSampleBuffer(size = 12) {
  const t = new Float64Array(size);
  const v = new Float32Array(size * 4); // x, y, z, yaw
  let n = 0, head = 0;
  const out = { x: 0, y: 0, z: 0, yaw: 0, extrapolated: false, newest: 0 };
  return {
    push(time, x, y, z, yaw) {
      // Out of order (unordered channel): drop anything older than the newest.
      if (n && time <= t[(head - 1 + size) % size]) return false;
      t[head] = time;
      v[head * 4] = x; v[head * 4 + 1] = y; v[head * 4 + 2] = z; v[head * 4 + 3] = yaw;
      head = (head + 1) % size;
      n = Math.min(n + 1, size);
      return true;
    },
    clear() { n = 0; head = 0; },
    get count() { return n; },
    get newestTime() { return n ? t[(head - 1 + size) % size] : -Infinity; },
    sample(at, maxExtrap = 100) {
      if (!n) return null;
      const idx = (k) => (head - n + k + size * 2) % size; // k-th oldest
      const newest = idx(n - 1);
      out.newest = t[newest];
      if (at >= t[newest] || n === 1) {
        const i1 = newest;
        if (n >= 2 && at > t[newest]) {
          const i0 = idx(n - 2);
          const span = t[i1] - t[i0];
          const ex = Math.min(at - t[i1], maxExtrap);
          const k = span > 0 ? ex / span : 0;
          out.x = v[i1 * 4] + (v[i1 * 4] - v[i0 * 4]) * k;
          out.y = v[i1 * 4 + 1] + (v[i1 * 4 + 1] - v[i0 * 4 + 1]) * k;
          out.z = v[i1 * 4 + 2] + (v[i1 * 4 + 2] - v[i0 * 4 + 2]) * k;
          out.yaw = v[i1 * 4 + 3];
          out.extrapolated = true;
          return out;
        }
        out.x = v[i1 * 4]; out.y = v[i1 * 4 + 1]; out.z = v[i1 * 4 + 2]; out.yaw = v[i1 * 4 + 3];
        out.extrapolated = false;
        return out;
      }
      const oldest = idx(0);
      if (at <= t[oldest]) {
        out.x = v[oldest * 4]; out.y = v[oldest * 4 + 1]; out.z = v[oldest * 4 + 2]; out.yaw = v[oldest * 4 + 3];
        out.extrapolated = false;
        return out;
      }
      for (let k = n - 2; k >= 0; k--) {
        const i0 = idx(k), i1 = idx(k + 1);
        if (t[i0] <= at && at <= t[i1]) {
          const f = (at - t[i0]) / Math.max(1e-6, t[i1] - t[i0]);
          out.x = v[i0 * 4] + (v[i1 * 4] - v[i0 * 4]) * f;
          out.y = v[i0 * 4 + 1] + (v[i1 * 4 + 1] - v[i0 * 4 + 1]) * f;
          out.z = v[i0 * 4 + 2] + (v[i1 * 4 + 2] - v[i0 * 4 + 2]) * f;
          const a0 = v[i0 * 4 + 3], a1 = v[i1 * 4 + 3];
          out.yaw = a0 + Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)) * f;
          out.extrapolated = false;
          return out;
        }
      }
      return null;
    },
  };
}
