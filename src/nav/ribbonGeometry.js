// Route ribbon geometry (workstream L2): a window of a GPS route turned into a flat strip on the
// road surface, plus turn chevrons, written into preallocated arrays (no allocation per update).
// Pure: src/nav/routeRibbon.js uploads these arrays to one three.js mesh per player.
//
// The strip runs in the lane of travel (traffic keeps LEFT in this city), samples the route every
// `step` metres plus at every corner, and takes its height from the route (the street graph's
// nodes sit on the road surface: decks, ramps and bridges included), snapped to the real surface
// with `groundAt` when one is given, then lifted `lift` metres against z-fighting.
//
// Vertex layout: non-indexed triangles. position (x, y, z); info (along s, across -1..1, kind:
// 0 strip, 1 chevron).
export const RIBBON = { step: 4, width: 2.2, lift: 0.12, ahead: 360, behind: 16, maxSamples: 128, maxTurns: 8, chevronGap: 7, snap: 1.6 };

export function createRibbonBuffers({ maxSamples = RIBBON.maxSamples, maxTurns = RIBBON.maxTurns } = {}) {
  const maxVerts = (maxSamples - 1) * 6 + maxTurns * 4 * 6;
  return {
    maxSamples, maxTurns, maxVerts,
    position: new Float32Array(maxVerts * 3),
    info: new Float32Array(maxVerts * 3),
    count: 0,
    // Scratch for the samples (centre line), reused.
    sx: new Float32Array(maxSamples), sy: new Float32Array(maxSamples), sz: new Float32Array(maxSamples),
    ss: new Float32Array(maxSamples), nx: new Float32Array(maxSamples), nz: new Float32Array(maxSamples),
    lane: new Float32Array(maxSamples),
    samples: 0,
  };
}

// Lane offset for a street of `width` (kerb to kerb): the middle of the left half.
export const laneFor = (width = 14) => Math.max(1.2, Math.min(4.5, width / 4));

// Fills `buf` with the part of the route between s0 and s1 (metres along it).
//   pts, cum     route polyline and cumulative lengths (src/nav/gps.js cumulative)
//   widthOf(i)   the road width of segment i (for the lane offset; 14 by default)
//   groundAt(x, y, z)  surface height at or just below y (or -Infinity), optional
//   turns        [{ s, x, y, z, yaw, dir }] (src/nav/gps.js routeTurns), optional
// Returns the vertex count written (also buf.count).
export function fillRibbon(buf, pts, cum, s0, s1, { widthOf = null, groundAt = null, turns = null, width = RIBBON.width, step = RIBBON.step, lift = RIBBON.lift, keepLeft = true } = {}) {
  buf.count = 0; buf.samples = 0;
  if (!pts || pts.length < 2) return 0;
  const total = cum[cum.length - 1];
  s0 = Math.max(0, s0); s1 = Math.min(total, s1);
  if (s1 - s0 < 0.5) return 0;
  // --- centre-line samples: every `step` metres and at each polyline corner in [s0, s1] ---
  let n = 0;
  let seg = 0;
  while (seg + 1 < pts.length - 1 && cum[seg + 1] <= s0) seg++;
  let s = s0;
  const max = buf.maxSamples;
  while (n < max) {
    // Next stop: the next step, or the next corner if it comes first.
    while (seg + 1 < pts.length - 1 && cum[seg + 1] <= s + 1e-6) seg++;
    const a = pts[seg], b = pts[seg + 1];
    const L = cum[seg + 1] - cum[seg];
    const t = L > 0 ? (s - cum[seg]) / L : 0;
    const dx = b.x - a.x, dz = b.z - a.z, dl = Math.hypot(dx, dz) || 1;
    // Left of travel (heading (dx, dz), x east, z south): (dz, -dx); right is (-dz, dx).
    let nx = (keepLeft ? dz : -dz) / dl, nz = (keepLeft ? -dx : dx) / dl;
    // At a corner, mitre with the previous segment.
    if (t < 1e-4 && seg > 0) {
      const p = pts[seg - 1], px = a.x - p.x, pz = a.z - p.z, pl = Math.hypot(px, pz) || 1;
      const qx = (keepLeft ? pz : -pz) / pl, qz = (keepLeft ? -px : px) / pl;
      let mx = nx + qx, mz = nz + qz;
      const ml = Math.hypot(mx, mz);
      if (ml > 1e-3) { mx /= ml; mz /= ml; const k = Math.max(0.5, mx * nx + mz * nz); nx = mx / k; nz = mz / k; }
    }
    const x = a.x + dx * t, z = a.z + dz * t;
    let y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
    const laneW = laneFor(widthOf ? widthOf(seg) : 14);
    let lx = x + nx * laneW, lz = z + nz * laneW;
    if (groundAt) {
      // Snap to the surface; where the lane hangs past a deck's end (a mitred corner at a ramp
      // foot), pull in toward the centre line until there is road underneath.
      for (let k = 0; k < 3; k++) {
        const f = k === 0 ? 1 : k === 1 ? 0.5 : 0;
        const tx = x + nx * laneW * f, tz = z + nz * laneW * f;
        const g = groundAt(tx, y + 0.9, tz);
        if (g > -Infinity && Math.abs(g - y) < RIBBON.snap) { y = g; lx = tx; lz = tz; break; }
      }
    }
    buf.sx[n] = lx; buf.sy[n] = y + lift; buf.sz[n] = lz; buf.ss[n] = s;
    // Unit normal for the strip's width (the mitred one is longer at corners: keep its length).
    buf.nx[n] = nx; buf.nz[n] = nz;
    n++;
    if (s >= s1 - 1e-6) break;
    const nextCorner = seg + 1 < pts.length - 1 ? cum[seg + 1] : Infinity;
    s = Math.min(s1, s + step, nextCorner > s + 1e-6 ? nextCorner : s + step);
  }
  buf.samples = n;
  // --- strip quads ---
  const P = buf.position, I = buf.info, hw = width / 2;
  let v = 0;
  const put = (x, y, z, along, side, kind) => { P[v * 3] = x; P[v * 3 + 1] = y; P[v * 3 + 2] = z; I[v * 3] = along; I[v * 3 + 1] = side; I[v * 3 + 2] = kind; v++; };
  for (let k = 0; k + 1 < n; k++) {
    const ax = buf.sx[k], ay = buf.sy[k], az = buf.sz[k], bx = buf.sx[k + 1], by = buf.sy[k + 1], bz = buf.sz[k + 1];
    const anx = buf.nx[k] * hw, anz = buf.nz[k] * hw, bnx = buf.nx[k + 1] * hw, bnz = buf.nz[k + 1] * hw;
    const sa = buf.ss[k], sb = buf.ss[k + 1];
    // Two triangles: (aL, aR, bR), (aL, bR, bL). Left = +n.
    put(ax + anx, ay, az + anz, sa, 1, 0); put(ax - anx, ay, az - anz, sa, -1, 0); put(bx - bnx, by, bz - bnz, sb, -1, 0);
    put(ax + anx, ay, az + anz, sa, 1, 0); put(bx - bnx, by, bz - bnz, sb, -1, 0); put(bx + bnx, by, bz + bnz, sb, 1, 0);
  }
  // --- turn chevrons: two '>' marks on the new heading just past each junction in the window ---
  if (turns) {
    let made = 0;
    for (const tr of turns) {
      if (made >= buf.maxTurns) break;
      if (tr.s < s0 || tr.s > s1) continue;
      const fx = Math.sin(tr.yaw), fz = Math.cos(tr.yaw);
      const lx = keepLeft ? fz : -fz, lz = keepLeft ? -fx : fx; // left of the new heading
      const w = laneFor(widthOf ? widthOf(Math.min(tr.i, pts.length - 2)) : 14);
      let y = (tr.y ?? 0);
      for (let c = 0; c < 2; c++) {
        const d = RIBBON.chevronGap + c * 3;
        const cx = tr.x + fx * d + lx * w, cz = tr.z + fz * d + lz * w;
        if (groundAt && c === 0) { const g = groundAt(cx, y + 0.9, cz); if (g > -Infinity && Math.abs(g - y) < RIBBON.snap) y = g; }
        const cy = y + lift + 0.02;
        // Apex ahead, two bars sweeping back to either side.
        for (const side of [1, -1]) {
          const ax = cx + fx * 0.9, az = cz + fz * 0.9;
          const ex = cx - fx * 0.9 + lx * side * 1.5, ez = cz - fz * 0.9 + lz * side * 1.5;
          // Bar thickness along the heading.
          const tx = fx * 0.55, tz = fz * 0.55;
          put(ax, cy, az, tr.s, 0, 1); put(ex, cy, ez, tr.s, 1, 1); put(ex - tx, cy, ez - tz, tr.s, 1, 1);
          put(ax, cy, az, tr.s, 0, 1); put(ex - tx, cy, ez - tz, tr.s, 1, 1); put(ax - tx, cy, az - tz, tr.s, 0, 1);
        }
      }
      made++;
    }
  }
  buf.count = v;
  return v;
}

// The window of a route to draw for a player at distance `s` along it.
export function ribbonWindow(s, total, { ahead = RIBBON.ahead, behind = RIBBON.behind } = {}) {
  return [Math.max(0, s - behind), Math.min(total, s + ahead)];
}
