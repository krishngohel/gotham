// [polish2] The Batcave's rock, given depth (polish list: "it still reads as flat grey"). No new
// lights and nothing that updates per frame: every tone here is baked into vertex colour, and the
// light is additive 'soft' cards merged into the pocket's one soft bucket.
//
//   rockTone   a rock's colour from where it sits: near-black toward the roof and away from the
//              work lamps, lifted and tinted in each lamp's pool, stepped by its stratum.
//   strata     dipping bands of flat ledges round the walls in alternating values: beds of rock
//              whose ink edges draw the bedding lines.
//   recesses   black openings between the ribs with a pale lip and a faint glow far inside: the
//              cave goes on.
//   columns    floor-to-roof pillars and a natural arch, near-black, standing in front of the
//              lit waterfall, the screens and the far haze: silhouette.
//   pools      shafts under the floodlights, a cold wash up the wall behind the fall, a dark
//              skirt round the foot of the walls.
// LOCAL coordinates (the cave's origin), like the rest of the pocket.
import * as THREE from 'three';
import { box } from '../buckets.js';
import { add, addBox } from './pocketKit.js';
import { softGlow, seeded } from './dressing.js';

// The work lamps the cave already has (batcave.js ctx.spot calls): position, colour, reach.
const LAMPS = [
  [0, 7, -12, 0x4fe3ff, 16], [-22, 6.5, -7, 0xd8e8ff, 11], [11, 6.4, -2, 0xf0f0e0, 10],
  [30, 8, -20, 0xd8e8ff, 15], [0, 8, 23, 0xd8e8ff, 20], [0, 4, 31, 0x7ac0f0, 18],
  [-33, 3, 15, 0xf0f8ff, 12], [-38, 6, -10, 0xffd8a0, 14], [30, 6, 16, 0x4fe3ff, 16],
  [42, 3, -6, 0xd9a92c, 9], [-40, 16.5, -29, 0xffc070, 11],
];
// The beds, bottom to top: [top of the bed (m), base colour]. Warm umber low, slate, basalt.
const BEDS = [[4, 0x3d3a37], [9, 0x2f3238], [15, 0x3a352f], [21, 0x25282e], [27, 0x2c2a2a], [99, 0x15161a]];
const DEEP = new THREE.Color(0x07080b);
const tmp = new THREE.Color(), lampC = new THREE.Color();

// Colour of a rock at (x, y, z). k: a per-rock jitter (0..1). Returns a hex number.
export function rockTone(x, y, z, k = 0.5) {
  let lit = 0, best = 0, bi = -1;
  for (let i = 0; i < LAMPS.length; i++) {
    const L = LAMPS[i];
    const d = Math.hypot(x - L[0], (y - L[1]) * 1.2, z - L[2]) / L[4];
    const w = 1 / (1 + d * d * 2.2);
    lit += w;
    if (w > best) { best = w; bi = i; }
  }
  lit = Math.min(1, lit);
  const bed = BEDS.find((b) => y < b[0]) ?? BEDS[BEDS.length - 1];
  // The dark gathers under the roof: full value on the floor, a quarter of it by 26 m.
  const high = Math.max(0.22, Math.min(1, 1.12 - y / 30));
  const v = (0.32 + 0.8 * lit) * high * (0.86 + 0.28 * k);
  tmp.setHex(bed[1]);
  tmp.lerpColors(DEEP, tmp, Math.min(1.25, v));
  if (bi >= 0 && best > 0.12) { lampC.setHex(LAMPS[bi][3]); tmp.lerp(lampC, Math.min(0.09, best * 0.12)); }
  return tmp.getHex();
}

// One bed's ledge: a flat faceted slab against a wall, tilted along the bed's dip.
function ledge(ctx, x, y, z, r, th, yaw, dip, color) {
  const g = new THREE.DodecahedronGeometry(r, 0).scale(1.9, th / r, 0.6).rotateZ(dip).rotateY(yaw);
  add(ctx, 'painted', g.translate(x, y, z), color);
}

// Round the four walls at each bed's height. `skip(side, s, y)` keeps the entrances clear.
function strata(ctx, rich, rnd) {
  const walls = [
    { side: 'n', a: -44, b: 44, at: -35.2, alongX: true, yaw: 0 },
    { side: 's', a: -44, b: 44, at: 35.2, alongX: true, yaw: Math.PI },
    { side: 'w', a: -34, b: 34, at: -45.2, alongX: false, yaw: Math.PI / 2 },
    { side: 'e', a: -34, b: 34, at: 45.2, alongX: false, yaw: -Math.PI / 2 },
  ];
  const levels = rich ? [5.2, 9.6, 14.2, 19.4, 24.6, 29] : [5.2, 12, 19.4, 27];
  for (const W of walls) {
    const dipDir = W.side === 'n' || W.side === 'e' ? 1 : -1;
    for (let li = 0; li < levels.length; li++) {
      const step = 5.2 + (li % 2) * 1.1;
      for (let s = W.a + 2 + (li % 3) * 1.4; s < W.b - 1; s += step) {
        const y = levels[li] + dipDir * (s - W.a) * 0.035 + (rnd() - 0.5) * 0.6;
        // Keep clear: the waterfall and the mouth, the tunnel door, the lift ledge's headroom.
        if (W.side === 's' && Math.abs(s) < 13) { rnd(); rnd(); continue; }
        if (W.side === 'e' && s > -12 && s < 0 && y < 8) { rnd(); rnd(); continue; }
        if ((W.side === 'n' || W.side === 'w') && y > 12.5 && y < 19 && (W.side === 'n' ? s < -30 : s < -22)) { rnd(); rnd(); continue; }
        const r = 2.3 + rnd() * 1.5, out = 0.1 + rnd() * 0.7 + (li === 0 ? 0.4 : 0);
        const x = W.alongX ? s : W.at - Math.sign(W.at) * out, z = W.alongX ? W.at - Math.sign(W.at) * out : s;
        ledge(ctx, x, y, z, r, 1.5 + (li % 2) * 0.6 + rnd() * 0.5, W.yaw, dipDir * 0.06, rockTone(x, y, z, (li % 2) * 0.7 + rnd() * 0.3));
      }
    }
  }
}

// A black opening in a wall. yaw faces into the cave; w, h its size.
function recess(ctx, x, y, z, w, h, yaw, rnd, glow = 0x0a1c2a) {
  const nx = Math.sin(yaw), nz = Math.cos(yaw);
  add(ctx, 'painted', new THREE.IcosahedronGeometry(1, 1).scale(w / 2, h / 2, 0.5).rotateY(yaw).translate(x, y, z), 0x040507);
  // The lip: a broken ring of paler rock round the mouth, heavier at its foot.
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.3;
    const u = Math.cos(a) * (w / 2 + 0.5), v = Math.sin(a) * (h / 2 + 0.3);
    const r = (v < 0 ? 1.5 : 1.0) + rnd() * 0.7;
    const px = x + nz * u + nx * 0.6, py = y + v, pz = z - nx * u + nz * 0.6;
    add(ctx, 'painted', new THREE.DodecahedronGeometry(r, 0).scale(1, 0.8, 0.8).rotateY(rnd() * 3).translate(px, py, pz), rockTone(px, py * 0.6, pz, 0.9));
  }
  softGlow(ctx, x + nx * 0.7, y - h * 0.1, z + nz * 0.7, Math.min(w, h) * 0.45, glow, { cross: false });
}

// A floor-to-roof column: a broad stalagmite meeting a long stalactite at a narrow waist.
function column(ctx, x, z, r, waist, rnd, solid = true) {
  const H = 32, dark = 0x0b0c10;
  const lo = new THREE.CylinderGeometry(r * 0.34, r, waist, 7, 1).rotateY(rnd() * 3).translate(x, waist / 2, z);
  const hi = new THREE.CylinderGeometry(r * 1.25, r * 0.3, H - waist, 7, 1).rotateY(rnd() * 3).translate(x, waist + (H - waist) / 2, z);
  add(ctx, 'painted', lo, rockTone(x, 2, z, 0.2));
  add(ctx, 'painted', hi, dark);
  // Flowstone skirts at the foot and drips beside the waist.
  for (let k = 0; k < 4; k++) {
    const a = rnd() * Math.PI * 2, d = r * (0.7 + rnd() * 0.5);
    add(ctx, 'painted', new THREE.ConeGeometry(r * 0.45, 1.6 + rnd() * 2.4, 5).translate(x + Math.cos(a) * d, 0.9, z + Math.sin(a) * d), rockTone(x, 1, z, 0.6));
    const L = 3 + rnd() * 5;
    add(ctx, 'painted', new THREE.ConeGeometry(0.35 + rnd() * 0.4, L, 5).rotateX(Math.PI).translate(x + Math.cos(a + 1) * r * 1.3, H - L / 2, z + Math.sin(a + 1) * r * 1.3), dark);
  }
  if (solid) addBox(ctx, x - r * 0.7, 0, z - r * 0.7, x + r * 0.7, 9, z + r * 0.7, 'pillar');
}

// A natural arch high across a corner of the cavern: a chain of dark blocks on a sagging curve.
function arch(ctx, x0, z0, x1, z1, y, sag, rnd) {
  const n = 9;
  for (let k = 0; k <= n; k++) {
    const t = k / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    const yy = y - sag * 4 * Math.pow(2 * t - 1, 2);
    const r = 2.0 + Math.abs(2 * t - 1) * 1.6 + rnd() * 0.6;
    add(ctx, 'painted', new THREE.DodecahedronGeometry(r, 0).scale(1.25, 0.8, 1).rotateY(rnd() * 3).translate(x, yy, z), 0x0c0d11);
    if (k % 2) { const L = 1.5 + rnd() * 3.5; add(ctx, 'painted', new THREE.ConeGeometry(0.3 + rnd() * 0.3, L, 5).rotateX(Math.PI).translate(x, yy - r * 0.6 - L / 2, z), 0x0c0d11); }
  }
}

// A shaft of light under a lamp: two crossed additive cards, narrow at the lamp.
function shaft(ctx, x, yTop, z, yBot, w, color) {
  const h = yTop - yBot;
  for (const a of [0, Math.PI / 2]) {
    const g = new THREE.PlaneGeometry(1, h, 1, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) * (p.getY(k) > 0 ? w * 0.3 : w));
    add(ctx, 'soft', g.rotateY(a).translate(x, yBot + h / 2, z), color);
  }
}

export function caveDepth(ctx, rich) {
  const rnd = seeded(8128);
  strata(ctx, rich, rnd);
  // Openings: two in the back (north) wall either side of the screens, one high on the west wall
  // over the trophy hall, one on the east wall beyond the simulator, a low one by the pool.
  recess(ctx, -24, 9, -35.4, 9, 11, 0, rnd);
  recess(ctx, 20, 12, -35.4, 11, 9, 0, rnd, 0x081a22);
  recess(ctx, -45.4, 15, 12, 9, 8, Math.PI / 2, rnd, 0x14100a);
  recess(ctx, 45.4, 9, 22, 10, 10, -Math.PI / 2, rnd);
  if (rich) recess(ctx, 27, 5, 35.4, 8, 7, Math.PI, rnd, 0x0a2230);
  // Columns: behind the screen wall, by the pool's west bank, in the south-east corner, and one
  // in the north-east under the pad's far side. Clear of the walkways, the bay and the arena.
  column(ctx, -8, -27, 2.4, 11, rnd);
  column(ctx, -19, 29, 2.8, 9, rnd);
  column(ctx, 40, 32, 2.6, 12, rnd);
  if (rich) column(ctx, 17, -32, 2.0, 13, rnd);
  // The arch: from the west wall across to the roof over the stair's foot, in front of the fall
  // as seen from the lift ledge and the deck.
  arch(ctx, -44, 24, -16, 33, 25, 2.2, rnd);
  if (rich) arch(ctx, 44, -30, 18, -34, 26, 1.8, rnd);

  // ---- pooled light ----
  // Shafts under the bay's four floodlights and the trophy and medical lamps.
  for (const [x, z] of [[-6, 18], [6, 18], [-6, 30], [6, 30]]) shaft(ctx, x, 11.3, z, 0.1, 5.5, 0x0c141c);
  for (const [x, z] of [[-39.5, -12], [-37, -2], [-39.5, -18]]) shaft(ctx, x, 7.5, z, 0.6, 3.4, 0x1a1408);
  shaft(ctx, -34, 3.1, 15, 0.9, 3.2, 0x121a1e);
  shaft(ctx, 30, 13, -20, 4.1, 9, 0x0a1218);
  // The fall lights the rock round it: a cold wash climbing the south wall, a glow at its head.
  softGlow(ctx, -11, 9, 34.2, 9, 0x0c2230, { cross: false });
  softGlow(ctx, 11, 9, 34.2, 9, 0x0c2230, { cross: false });
  softGlow(ctx, 0, 25, 33.5, 7, 0x12303e, { cross: false });
  // Screen light spilling up the back wall, a warm bloom at the lift, amber at the tunnel.
  softGlow(ctx, 0, 13, -34.6, 12, 0x06202a, { cross: false });
  softGlow(ctx, -40, 17, -33.8, 6, 0x241808, { cross: false });
  softGlow(ctx, 45.2, 3, -6, 5, 0x1c1404, { cross: true });
  // The dark gathers at the foot of the walls: a skirt of near-black on the floor all round, and
  // deeper pockets in the corners.
  const skirt = (x, z, w, d) => add(ctx, 'painted', box(w, 0.02, d, x, 0.012, z), 0x15161a);
  skirt(0, -33, 92, 6); skirt(-43, 0, 6, 60); skirt(43, 8, 6, 44);
  skirt(-27, 33, 34, 6); skirt(27, 33, 34, 6);
  for (const [x, z, r] of [[-41, -31, 9], [41, -31, 9], [-41, 31, 9], [41, 31, 8], [-4, -24, 7], [26, -4, 6]]) {
    add(ctx, 'painted', new THREE.CircleGeometry(r, 9).rotateX(-Math.PI / 2).rotateY(rnd() * 3).translate(x, 0.022, z), 0x0f1013);
  }
}
