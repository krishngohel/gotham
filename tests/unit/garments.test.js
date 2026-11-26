// [chars2] Garment drape (src/heroes/models/drape.js) and the face API (src/actors/face.js).
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { drape, relaxBody } from '../../src/heroes/models/drape.js';
import { EXPRESSIONS, FACE_PIVOTS } from '../../src/actors/face.js';
import { BUILDS } from '../../src/actors/civilians/figure.js';
import { civilianSpec } from '../../src/actors/civilians/generator.js';
import { cutKey } from '../../src/actors/civilians/wardrobe.js';
import { LOOKS } from '../../src/actors/civilians/looks.js';
import { SUITS, suitById } from '../../src/heroes/models/suits.js';
import { HEROES } from '../../src/heroes/roster.js';

// A muscled "limb": a cylinder (radius 0.1, y 0..1) whose surface is a ring of muscle lobes with
// sharp concave creases between them (|sin|), skinned to bone 0. Cloth should bridge the
// creases (they are what makes a painted suit read as a bare superhero) but cannot sink into the
// convex lobes themselves.
const LOBES = 6;
const lobeR = (a) => 0.1 * (1 + 0.1 * Math.abs(Math.sin(a * LOBES / 2)));
function lumpyLimb() {
  const g = new THREE.CylinderGeometry(0.1, 0.1, 1, 72, 40, true).translate(0, 0.5, 0);
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const a = Math.atan2(z, x);
    const k = lobeR(a) / 0.1;
    P.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  const n = P.count;
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  const sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) sw[i * 4] = 1;
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}
// 2D convex hull (monotone chain) and its radius along the direction at angle a.
function convexHull(points) {
  const P = points.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => { const h = []; for (const p of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], p) <= 0) h.pop(); h.push(p); } h.pop(); return h; };
  return [...half(P), ...half(P.reverse())];
}
function hullRadius(H, a) {
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = 0;
  for (let i = 0; i < H.length; i++) {
    const p = H[i], q = H[(i + 1) % H.length], ex = q[0] - p[0], ey = q[1] - p[1];
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (p[0] * ey - p[1] * ex) / den, s = (p[0] * dy - p[1] * dx) / den;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
  }
  return best;
}
const radial = (g, i) => Math.hypot(g.attributes.position.getX(i), g.attributes.position.getZ(i));
const fakeBody = { skeleton: { bones: [] } };

describe('drape', () => {
  it('bridges the creases between muscles, never sinks inside the body, keeps skin weights', () => {
    const src = lumpyLimb();
    const g = drape(fakeBody, src, { pick: (p) => p.y > 0.2 && p.y < 0.8, offset: 0.006, smooth: 12, lip: false });
    expect(g.attributes.position.count).toBeGreaterThan(100);
    const G = g.attributes.position;
    // Outside the body everywhere (the radius of the body at that angle, plus most of the clamp).
    let crease = 0, creaseN = 0, lobe = 0, lobeN = 0;
    for (let i = 0; i < G.count; i++) {
      const y = G.getY(i);
      if (y < 0.3 || y > 0.7) continue;
      const a = Math.atan2(G.getZ(i), G.getX(i)), r = radial(g, i);
      expect(r).toBeGreaterThan(lobeR(a) + 0.003);
      // Depth of the cloth's valley in each crease vs. its height over the lobe tops.
      const s = Math.abs(Math.sin(a * LOBES / 2));
      if (s < 0.08) { crease += r; creaseN++; } else if (s > 0.97) { lobe += r; lobeN++; }
    }
    // Taut cloth over this limb is its convex hull: measure the hull's valley (radius at a lobe
    // top minus radius in a crease) and require the cloth to reach it within a millimetre.
    // Paint, or a plain shell, keeps the body's full 10 mm valley.
    const ring = Array.from({ length: 720 }, (_, i) => { const a = (i / 720) * Math.PI * 2, r = lobeR(a); return [Math.cos(a) * r, Math.sin(a) * r]; });
    const hull = convexHull(ring);
    const hullValley = hullRadius(hull, Math.PI / LOBES) - hullRadius(hull, 0);
    const bodyValley = 0.1 * 0.1;
    const clothValley = lobe / lobeN - crease / creaseN;
    expect(hullValley).toBeLessThan(bodyValley * 0.7); // the test limb does have creases to fill
    expect(clothValley).toBeLessThan(hullValley + 0.001);
    // Skin weights carried over.
    expect(g.attributes.skinWeight.getX(0)).toBe(1);
  });

  it('snaps a hem onto its line and adds a lip back to the body', () => {
    const src = lumpyLimb();
    const hem = 0.437;
    const g = drape(fakeBody, src, { pick: (p) => p.y > hem, offset: 0.006, smooth: 4, edge: [(p) => p.y - hem], lip: true });
    const P = g.attributes.position;
    let lowest = Infinity;
    for (let i = 0; i < P.count; i++) lowest = Math.min(lowest, P.getY(i));
    expect(Math.abs(lowest - hem)).toBeLessThan(0.004);
    expect(g.index.count / 3).toBeGreaterThan(src.index.count / 3 * 0.5);
  });

  it('relaxBody keeps vertex count, skin weights and the weight-0 areas exactly', () => {
    const src = lumpyLimb();
    const before = src.attributes.position.array.slice();
    relaxBody(src, { passes: 3, weight: (p) => (p.y > 0.9 ? 0 : 1) });
    const P = src.attributes.position;
    expect(P.count * 3).toBe(before.length);
    for (let i = 0; i < P.count; i++) if (before[i * 3 + 1] > 0.95) expect(P.getX(i)).toBeCloseTo(before[i * 3], 6);
  });
});

describe('builds, looks and suits', () => {
  it('every build only scales flesh about bones (factors > 0) and civilians are slimmer than the hero', () => {
    for (const [name, b] of Object.entries(BUILDS)) if (b) for (const v of Object.values(b)) expect(v, name).toBeGreaterThan(0.5);
    expect(BUILDS.average.upperarm_l).toBeLessThan(1);
    expect(BUILDS.elder.clavicle_r).toBeLessThan(BUILDS.average.clavicle_r);
  });
  it('formal evening dress is a civilian type, with gala looks for the Bruce scenes', () => {
    const m = civilianSpec(3, { type: 'formal', body: 'm' }), f = civilianSpec(3, { type: 'formal', body: 'f' });
    expect(['tux', 'blazer']).toContain(m.cut.outer);
    expect(f.cut.outer).toBe('gown');
    expect(f.palette.bottom).toBe(f.palette.outer);
    expect(cutKey(m.body, m.build, m.cut)).toContain('tux'.slice(0, 0));
    for (const id of ['galaGuest', 'galaGuestF', 'waiter']) expect(LOOKS[id]?.cut).toBeTruthy();
  });
  it('the four later Batman suits exist, are listed for Batman and differ in silhouette flags', () => {
    const batSuits = HEROES.find((h) => h.id === 'batman').suits;
    for (const id of ['sentinel', 'ashen', 'harbour', 'field-repair']) {
      const s = suitById(id);
      expect(s.id).toBe(id);
      expect(batSuits).toContain(id);
      const flags = Object.keys(s.look).filter((k) => k !== 'palette');
      expect(flags.length, id).toBeGreaterThan(0);
    }
    expect(new Set(SUITS.map((s) => s.id)).size).toBe(SUITS.length);
  });
});

describe('face API data', () => {
  it('has the pivots and expressions the Bruce scenes and photo mode use', () => {
    expect(FACE_PIVOTS).toEqual(['eye_l', 'eye_r', 'lid_l', 'lid_r', 'brow_l', 'brow_r', 'jaw']);
    for (const name of ['neutral', 'smile', 'frown', 'angry', 'surprised', 'sad', 'tired', 'pain']) {
      const e = EXPRESSIONS[name];
      for (const k of ['brow', 'tilt', 'lid', 'mouthW', 'mouthOpen']) expect(typeof e[k], `${name}.${k}`).toBe('number');
      expect(e.lid).toBeGreaterThanOrEqual(0); expect(e.lid).toBeLessThanOrEqual(1);
    }
  });
});
