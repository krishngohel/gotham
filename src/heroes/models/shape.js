// Measuring the body's bind pose so parts sit on it: the waist outline for belts, a height field
// of the front of the torso for decals that follow the chest's curve (emblems, ovals, badges).
import * as THREE from 'three';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';

// Radius of the body's cross-section at height y around (0, cz), as a function of direction
// (dx, dz) (any length). 48 angular bins, max radius per bin, gaps filled from neighbours.
export function waistProfile(geo, y, cz, band = 0.02) {
  const P = geo.attributes.position;
  const BINS = 48;
  const r = new Float32Array(BINS);
  for (let i = 0; i < P.count; i++) {
    if (Math.abs(P.getY(i) - y) > band) continue;
    const x = P.getX(i), z = P.getZ(i) - cz;
    if (Math.abs(x) > 0.3) continue; // arms
    const a = Math.atan2(x, z);
    const b = ((Math.round((a / (Math.PI * 2)) * BINS) % BINS) + BINS) % BINS;
    r[b] = Math.max(r[b], Math.hypot(x, z));
  }
  for (let pass = 0; pass < 3; pass++) for (let b = 0; b < BINS; b++) if (!r[b]) r[b] = Math.max(r[(b + 1) % BINS], r[(b + BINS - 1) % BINS]);
  return (dx, dz) => {
    const f = ((Math.atan2(dx, dz) / (Math.PI * 2)) * BINS + BINS) % BINS;
    const i = Math.floor(f), t = f - i;
    return r[i % BINS] * (1 - t) + r[(i + 1) % BINS] * t;
  };
}

// Front surface z (bind space) of the body over x in [-0.26, 0.26], y in [y0 - 0.3, y0 + 0.3]
// on a 6 mm grid, from front-facing vertices; sample(x, y) interpolates.
export function frontHeightField(geo, lm, y0, fwd) {
  const P = geo.attributes.position, N = geo.attributes.normal;
  const CELL = 0.006, X0 = -0.26, Y0 = y0 - 0.3, NX = Math.ceil(0.52 / CELL) + 1, NY = Math.ceil(0.6 / CELL) + 1;
  const h = new Float32Array(NX * NY).fill(-Infinity);
  for (let i = 0; i < P.count; i++) {
    if (N.getZ(i) * fwd < 0.05) continue;
    const ix = Math.round((P.getX(i) - X0) / CELL), iy = Math.round((P.getY(i) - Y0) / CELL);
    if (ix < 0 || iy < 0 || ix >= NX || iy >= NY) continue;
    // Arms in the T-pose are not chest; the head is in front of nothing we decal.
    if (Math.abs(P.getX(i)) > lm.shoulderX + 0.02) continue;
    h[iy * NX + ix] = Math.max(h[iy * NX + ix], P.getZ(i) * fwd);
  }
  // Fill holes from the nearest filled neighbours, ring by ring.
  for (let pass = 0; pass < 12; pass++) {
    let missing = 0;
    const next = h.slice();
    for (let iy = 0; iy < NY; iy++) for (let ix = 0; ix < NX; ix++) {
      const k = iy * NX + ix;
      if (h[k] > -Infinity) continue;
      let s = 0, c = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const jx = ix + dx, jy = iy + dy;
        if (jx < 0 || jy < 0 || jx >= NX || jy >= NY) continue;
        const v = h[jy * NX + jx];
        if (v > -Infinity) { s += v; c++; }
      }
      if (c) next[k] = s / c; else missing++;
    }
    h.set(next);
    if (!missing) break;
  }
  const at = (ix, iy) => h[Math.max(0, Math.min(NY - 1, iy)) * NX + Math.max(0, Math.min(NX - 1, ix))];
  return (x, y) => {
    const fx = (x - X0) / CELL, fy = (y - Y0) / CELL;
    const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
    return v * fwd;
  };
}

// A flat 2D outline (metres, centred on 0,0) wrapped onto the height field at height y, lifted
// `lift` off the surface. Tessellated finely so it follows the curve instead of sinking.
export function decal(points, hf, { y, x = 0, lift = 0.004, fwd = 1, maxEdge = 0.008 }) {
  const shape = new THREE.Shape(points.map(([u, v]) => new THREE.Vector2(u, v)));
  let g = new THREE.ShapeGeometry(shape);
  g = new TessellateModifier(maxEdge, 8).modify(g);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const px = x + P.getX(i) * fwd, py = y + P.getY(i);
    P.setXYZ(i, px, py, hf(px, py) + lift * fwd);
  }
  // Face the decal the way the body faces: swap two corners of every triangle.
  if (fwd < 0) {
    for (let t = 0; t < P.count; t += 3) {
      const ax = P.getX(t + 1), ay = P.getY(t + 1), az = P.getZ(t + 1);
      P.setXYZ(t + 1, P.getX(t + 2), P.getY(t + 2), P.getZ(t + 2));
      P.setXYZ(t + 2, ax, ay, az);
    }
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}
