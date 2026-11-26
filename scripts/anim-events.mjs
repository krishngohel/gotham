// Per-clip animation events derived from the motion itself (research doc decision 2): the
// single source of timing for hits, cancels, recovery, knockdowns and footsteps. Pure and
// DOM-free; scripts/clip-events.mjs feeds it joint positions sampled from a baked GLB.
//
// Input frames are joint positions in the clip's root space (metres, y up, root motion NOT
// included), one per 1/fps, for at least pelvis, Head, hand_l/r, foot_l/r, ball_l/r (plus the
// striking limb). `root` is the clip's root motion as flat [x, z, ...] per frame (mocapData).
//
//   strike    warpStart, contact, cancel, recover, end, hits (multi-hit only) (+ footL/footR)
//   react / action   recover, end (+ feet)
//   knockdown down, getUpStart (null when the clip ends on the floor), recover, end (+ feet)
//   getup     getUpStart, recover, end (+ feet)
//   loco      end, footL, footR (loop-aware)
//   loop      end

const KEY = ['pelvis', 'Head', 'hand_l', 'hand_r', 'foot_l', 'foot_r'];
const r4 = (t) => Math.round(t * 1e4) / 1e4;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// Speed of a series of [x, y, z] (central differences, m/s).
export function speeds(series, fps) {
  const n = series.length;
  return series.map((_, i) => {
    const a = series[Math.max(0, i - 1)], b = series[Math.min(n - 1, i + 1)];
    const span = Math.min(n - 1, i + 1) - Math.max(0, i - 1);
    return span ? (dist(a, b) * fps) / span : 0;
  });
}

// Mean distance of the key joints between two frames.
export function poseDistance(fa, fb) {
  let s = 0, c = 0;
  for (const k of KEY) if (fa[k] && fb[k]) { s += dist(fa[k], fb[k]); c++; }
  return c ? s / c : 0;
}

// Whole-body motion per frame: summed speed of the key joints.
function energy(frames, fps) {
  const out = new Array(frames.length).fill(0);
  for (const k of KEY) {
    if (!frames[0][k]) continue;
    speeds(frames.map((f) => f[k]), fps).forEach((v, i) => { out[i] += v; });
  }
  return out;
}

// First frame at or after `from` where the body has settled: motion below `frac` of its peak and
// the pose within `tol` metres of the settled pose (frame `ref`), for two frames running.
function settledFrom(frames, fps, from, ref, { frac = 0.2, tol = 0.12 } = {}) {
  const e = energy(frames, fps), peak = Math.max(...e.slice(from, ref + 1), 1e-6);
  const ok = (k) => e[k] <= frac * peak && poseDistance(frames[k], frames[ref]) <= tol;
  for (let k = Math.max(0, from); k < ref; k++) if (ok(k) && ok(k + 1)) return k;
  return ref;
}

// Foot plants: the frame a foot comes to rest near its lowest height. World position = root space
// + root motion, so a planted foot under a walking clip really is still. Loops wrap around.
export function footPlants(frames, root, fps, { loop = false, foot = 'foot_l' } = {}) {
  const n = frames.length;
  if (!frames[0][foot]) return [];
  const world = frames.map((f, i) => [f[foot][0] + (root?.[2 * i] ?? 0), f[foot][1], f[foot][2] + (root?.[2 * i + 1] ?? 0)]);
  const v = speeds(world, fps);
  const ys = world.map((p) => p[1]), ymin = Math.min(...ys), ymax = Math.max(...ys);
  if (ymax - ymin < 0.04) return []; // the foot never lifts: no steps to mark
  const planted = world.map((p, i) => p[1] < ymin + Math.max(0.035, 0.2 * (ymax - ymin)) && v[i] < 0.7);
  const out = [];
  for (let i = 0; i < n; i++) {
    const prev = i > 0 ? planted[i - 1] : loop ? planted[n - 1] : false;
    if (planted[i] && !prev && (!out.length || i - out[out.length - 1] >= Math.round(0.2 * fps))) out.push(i);
  }
  return out.map((i) => r4(i / fps));
}

// `ease` = { lead, tail } frames that scripts/retarget-mocap.mjs blended into Idle_Loop at the
// clip's ends (the shipped anims_mocap.glb clips have them; the packs bake with --no-ease). Those
// frames are ignored when measuring speeds, and the settled pose is the one just before the tail.
// Multi-hit strikes (combos, flurries): every clear reach peak of either hand (or either foot,
// for kicks), as [t, limb]. Reach is measured from the hips, horizontally for hands; for feet the
// height above the floor counts too, so a step is not a kick. A peak must rise most of the way
// from the limb's usual (median) reach to the clip's farthest, stand out from its neighbourhood,
// and be at least 0.2 s from a bigger one.
export function strikePeaks(frames, fps, limb) {
  const hands = /^(hand|lowerarm|upperarm)_/.test(limb);
  const pair = hands ? ['hand_l', 'hand_r'] : ['ball_l', 'ball_r'];
  const n = frames.length, gap = Math.round(0.2 * fps), w = Math.round(0.15 * fps);
  const reach = (k, j) => {
    const p = frames[k][j], q = frames[k].pelvis, hz = Math.hypot(p[0] - q[0], p[2] - q[2]);
    return hands ? hz : hz + Math.max(0, p[1] - 0.1);
  };
  const series = pair.filter((j) => frames[0][j]).map((j) => ({ j, r: frames.map((_, k) => reach(k, j)) }));
  const all = series.flatMap((x) => x.r).sort((a, b) => a - b);
  if (!all.length) return [];
  const base = all[Math.floor(all.length / 2)], top = all[all.length - 1], span = top - base;
  if (span < 0.15) return [];
  const peaks = [];
  for (const { j, r } of series) {
    for (let k = 1; k < n - 1; k++) {
      if (r[k] < base + 0.7 * span) continue;
      let isPeak = true, lo = Infinity, loL = Infinity, loR = Infinity;
      for (let o = -w; o <= w; o++) {
        const i = k + o;
        if (!o || i < 0 || i >= n) continue;
        if (r[i] > r[k]) { isPeak = false; break; }
        lo = Math.min(lo, r[i]);
        if (o < 0) loL = Math.min(loL, r[i]); else loR = Math.min(loR, r[i]);
      }
      // Must rise out of something on at least one side (clip ends count as open).
      const prominent = Math.max(r[k] - (k - w < 0 ? -Infinity : loL), r[k] - (k + w >= n ? -Infinity : loR)) >= 0.25 * span;
      if (isPeak && prominent && Number.isFinite(lo)) peaks.push({ k, j, r: r[k] });
    }
  }
  peaks.sort((a, b) => b.r - a.r);
  const kept = [];
  for (const p of peaks) if (kept.every((q) => Math.abs(q.k - p.k) >= gap)) kept.push(p);
  return kept.sort((a, b) => a.k - b.k).map((p) => [r4(p.k / fps), p.j]);
}

export function deriveEvents({ kind, fps, duration, contact = 0, limb = null, frames, root = null, ease = { lead: 0, tail: 0 } }) {
  const n = frames.length, dt = 1 / fps;
  const lead = Math.min(ease.lead ?? 0, n - 1), ref = Math.max(lead, n - 1 - (ease.tail ?? 0));
  const end = r4(duration ?? (n - 1) * dt);
  const ev = { end };
  if (kind === 'loop') return ev;
  const isLoop = kind === 'loco';
  ev.footL = footPlants(frames, root, fps, { loop: isLoop, foot: 'foot_l' });
  ev.footR = footPlants(frames, root, fps, { loop: isLoop, foot: 'foot_r' });
  if (kind === 'loco') return ev;

  if (kind === 'strike' && limb && frames[0][limb]) {
    const c = Math.max(0, Math.min(n - 1, Math.round(contact * fps)));
    const series = frames.map((f) => f[limb]);
    const v = speeds(series, fps);
    const vPeak = Math.max(...v.slice(lead, c + 1), 1e-6);
    // Warp opens where the striking limb starts its acceleration toward contact.
    let w = lead;
    for (let k = c - 1; k >= lead; k--) if (v[k] < 0.2 * vPeak) { w = k; break; }
    w = Math.min(w, Math.max(0, c - 2));
    // Recover: limb slow again and the pose close to the settled pose the clip ends in.
    const vAll = Math.max(...v.slice(lead, ref + 1), 1e-6);
    let rec = Math.max(c, ref);
    for (let k = c + 1; k < ref; k++) {
      if (v[k] < 0.2 * vAll && v[k + 1] < 0.2 * vAll && poseDistance(frames[k], frames[ref]) < 0.12) { rec = k; break; }
    }
    // Cancel: the limb has pulled back a quarter of the way from full reach toward its end
    // position, at least two frames after contact and never after recover.
    const reach = (k) => dist(series[k], frames[k].pelvis);
    const dC = reach(c), dE = reach(rec);
    let can = Math.min(rec, c + Math.round(0.1 * fps));
    if (dC > dE + 0.02) {
      for (let k = c + 1; k <= rec; k++) if (reach(k) <= dC - 0.25 * (dC - dE)) { can = k; break; }
    }
    can = Math.max(Math.min(c + 2, rec), Math.min(can, rec));
    Object.assign(ev, { warpStart: r4(w * dt), contact: r4(c * dt), cancel: r4(can * dt), recover: r4(rec * dt) });
    const hits = strikePeaks(frames, fps, limb);
    if (hits.length > 1) ev.hits = hits;
    return ev;
  }

  const h = frames.map((f) => f.pelvis[1]);
  if (kind === 'knockdown') {
    const lo = Math.min(...h);
    const vh = speeds(h.map((y) => [0, y, 0]), fps);
    let down = n - 1;
    for (let k = 0; k < n; k++) if (h[k] < lo + 0.08 && vh[k] < 0.4 && h[0] - h[k] > 0.25) { down = k; break; }
    let getUp = null;
    if (h[n - 1] > lo + 0.3) {
      // The clip stands back up: the get-up starts at the last low frame before the final rise.
      let k = n - 1;
      while (k > down && h[k] > lo + 0.06) k--;
      getUp = r4(k * dt);
    }
    ev.down = r4(down * dt);
    ev.getUpStart = getUp;
    ev.recover = getUp === null ? end : r4(settledFrom(frames, fps, Math.round(getUp * fps), ref) * dt);
    return ev;
  }
  if (kind === 'getup') {
    let s = 0;
    for (let k = 0; k < n; k++) if (h[k] > h[0] + 0.05) { s = Math.max(0, k - 1); break; }
    ev.getUpStart = r4(s * dt);
    const hEnd = h[n - 1];
    let rise = n - 1;
    for (let k = s; k < n; k++) if (h[k] >= hEnd - 0.05) { rise = k; break; }
    ev.recover = r4(settledFrom(frames, fps, rise, ref) * dt);
    return ev;
  }
  // react / action: settle after the biggest motion.
  const e = energy(frames, fps).slice(lead, ref + 1);
  const peak = lead + e.indexOf(Math.max(...e));
  ev.recover = r4(settledFrom(frames, fps, peak, ref) * dt);
  return ev;
}
