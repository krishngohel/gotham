// On foot or gliding (workstream L2): instead of a road ribbon, a rooftop-aware hint. A short
// chain of perches (grapple points on tall buildings) toward the target, each one reachable by a
// glide from the last (height to spare) or a grapple, and a soft trail of markers along it. Pure.
export const AIR = { reachMin: 25, reachMax: 120, cone: 0.55, glideRatio: 3.2, grappleUp: 35, steps: 4, markerGap: 12, maxMarkers: 24, arrive: 90 };

// from, to: { x, y, z }. points: grapple points [{ x, y, z }]. Returns [{ x, y, z }] (perches).
export function perchChain(from, to, points, A = AIR) {
  const out = [];
  let cur = from;
  for (let step = 0; step < A.steps; step++) {
    const tx = to.x - cur.x, tz = to.z - cur.z, td = Math.hypot(tx, tz);
    if (td < A.arrive) break;
    const ux = tx / td, uz = tz / td;
    let best = null, bs = -Infinity;
    for (const p of points) {
      const dx = p.x - cur.x, dz = p.z - cur.z, d = Math.hypot(dx, dz);
      if (d < A.reachMin || d > A.reachMax) continue;
      const along = (dx * ux + dz * uz) / d;
      if (along < Math.cos(A.cone)) continue;
      // Reachable: a glide from here loses d / glideRatio; a grapple climbs up to grappleUp.
      if (p.y > cur.y + A.grappleUp || p.y < cur.y - d / A.glideRatio - 4) continue;
      const progress = (dx * ux + dz * uz) / Math.max(1, td);
      const score = progress * 100 + p.y * 0.6 - Math.abs(dx * uz - dz * ux) * 0.2;
      if (score > bs) { bs = score; best = p; }
    }
    if (!best) break;
    out.push({ x: best.x, y: best.y, z: best.z });
    cur = best;
  }
  return out;
}

// Markers along from -> perches -> to: every `gap` metres, each leg a shallow arc (a glide sags).
// Writes into `out` (Float32Array of x, y, z triples); returns the count.
export function trailMarkers(from, perches, to, out, A = AIR) {
  const legs = [from, ...perches, to];
  let n = 0;
  const max = Math.min(A.maxMarkers, Math.floor(out.length / 3));
  for (let i = 0; i + 1 < legs.length && n < max; i++) {
    const a = legs[i], b = legs[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    const k = Math.max(1, Math.round(L / A.markerGap));
    for (let j = 1; j <= k && n < max; j++) {
      const t = j / k;
      const sag = Math.sin(Math.PI * t) * Math.min(6, L / 14);
      out[n * 3] = a.x + (b.x - a.x) * t;
      out[n * 3 + 1] = a.y + (b.y - a.y) * t + 1.5 - sag;
      out[n * 3 + 2] = a.z + (b.z - a.z) * t;
      n++;
    }
  }
  return n;
}
