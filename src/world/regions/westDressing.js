// [polish2] West-side touch-ups (polish list: "Park Row repetitive from the air; the Yards sparse
// and dark between landmarks").
//
//   roofVariety   what a Park Row flat's roof carries, chosen from a hash of where it stands: a
//                 roof field in one of five tar and gravel tones, and some of a stair bulkhead, a
//                 skylight (lit or dark), a row of chimney pots, a run of duct. From the air the
//                 blocks stop being one dark tone with the same tank on every third roof.
//   yardsFill     the Yards' open ground between its landmarks: the steelworks' stock yard (coil
//                 pyramids, slab stacks with a hot slab on top, beam bundles under a gantry crane,
//                 a ladle car), its raw-material heaps in their bays, more freight on the two
//                 empty tracks, and three floodlight masts over the dark stretches.
//
// Nothing here draws from a region's rng (a position hash picks the variants), so each seed
// builds exactly the streets and buildings it built before. Everything is merged into the
// region's buckets (its 128 m chunks and their far LOD).
import * as THREE from 'three';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot } from '../cityBuilder.js';

// A stable 0..1 number from a position and a salt.
function hash(x, z, k = 0) { const v = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); }

const ROOF_TONES = [0x5a3229, 0x33493f, 0x6a675f, 0x262a36, 0x6a4f33];

export function roofVariety(ctx, b) {
  const H = (k) => hash(b.x, b.z, k);
  const y = b.h;
  const inset = 0.9;
  if (b.w < 5 || b.d < 5) return;
  // The roof field, inside the parapet.
  ctx.buckets.add('painted', box(b.w - inset * 2, 0.05, b.d - inset * 2, b.x, y + 0.035, b.z), ROOF_TONES[Math.floor(H(1) * ROOF_TONES.length)]);
  // Potato keeps the coloured field and nothing else (hard rule 5: cheap on the low tiers).
  if ((ctx.quality?.crowdDensity ?? 1) < 0.5) return;
  // The long axis of the roof, and which end is the back (away from the street face).
  const back = b.face === 'w' ? [1, 0] : b.face === 'e' ? [-1, 0] : b.face === 'n' ? [0, 1] : [0, -1];
  const side = [back[1], back[0]];
  const hw = b.w / 2 - 1.9, hd = b.d / 2 - 1.9;
  const at = (u, v) => [b.x + back[0] * u * hw + side[0] * v * hw, b.z + back[1] * u * hd + side[1] * v * hd];
  if (H(2) < 0.5 && Math.min(b.w, b.d) > 6.5) {
    // Stair bulkhead at a back corner: a brick hut with a tin roof and a door.
    const [x, z] = at(0.75, H(3) < 0.5 ? -0.7 : 0.7);
    solid(ctx, 'painted', box(2.4, 2.3, 2.4, x, y + 1.15, z), { color: H(4) < 0.5 ? 0x5a3a2e : 0x55514a, tag: 'bulkhead' });
    ctx.buckets.add('painted', box(2.7, 0.12, 2.7, x, y + 2.36, z), 0x2a2c30);
    ctx.buckets.add('painted', box(Math.abs(back[0]) ? 0.06 : 0.9, 1.8, Math.abs(back[1]) ? 0.06 : 0.9, x - back[0] * 1.22, y + 0.95, z - back[1] * 1.22), 0x1c1e22);
  }
  if (H(5) < 0.38) {
    // A skylight toward the front: a raised frame, the glass lit from the flat below on some.
    const [x, z] = at(-0.45, (H(6) - 0.5) * 0.8);
    const lw = Math.abs(back[0]) ? 2.6 : 1.7, ld = Math.abs(back[0]) ? 1.7 : 2.6;
    ctx.buckets.add('painted', box(lw + 0.3, 0.4, ld + 0.3, x, y + 0.2, z), 0x24262b);
    glow(ctx, box(lw, 0.06, ld, x, y + 0.42, z), H(7) < 0.45 ? 0xd8a860 : 0x2a3a48);
    ctx.buckets.add('painted', box(Math.abs(back[0]) ? lw : 0.06, 0.08, Math.abs(back[0]) ? 0.06 : ld, x, y + 0.46, z), 0x24262b);
  }
  if (H(8) < 0.42) {
    // Chimney pots in a row on one party wall.
    const s = H(9) < 0.5 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      const [x, z] = at(-0.5 + k * 0.5, s * 0.96);
      ctx.buckets.add('painted', box(0.6, 1.3, 0.6, x, y + 0.65, z), 0x5a3a2e);
      ctx.buckets.add('painted', box(0.36, 0.3, 0.36, x, y + 1.45, z), 0x2a2420);
    }
  }
  if (H(10) < 0.3 && Math.max(b.w, b.d) > 8) {
    // A run of duct across the middle with a fan box.
    const [x, z] = at(0.05, 0);
    const L = Math.min(b.w, b.d) - 4.5;
    ctx.buckets.add('painted', box(Math.abs(back[0]) ? 0.5 : L, 0.45, Math.abs(back[0]) ? L : 0.5, x, y + 0.42, z), 0x6a6e74);
    ctx.buckets.add('painted', box(1.1, 0.9, 1.1, x, y + 0.5, z), 0x565a60);
  }
}

// ---------------------------------------------------------------- the Yards

const RUST = [0x7a3e22, 0x6a3020, 0x5a4a3c, 0x4a3a30];

// A pyramid of steel coils lying on their sides (3-2-1), axis along z. Collides as two steps.
function coils(ctx, x, z, color) {
  const r = 0.95, L = 1.5;
  const coil = (cx, cy) => {
    ctx.buckets.add('painted', new THREE.CylinderGeometry(r, r, L, 10).rotateX(Math.PI / 2).translate(cx, cy, z), color);
    ctx.buckets.add('painted', new THREE.CylinderGeometry(r * 0.42, r * 0.42, L + 0.04, 8).rotateX(Math.PI / 2).translate(cx, cy, z), 0x16181c);
  };
  for (let k = -1; k <= 1; k++) coil(x + k * 1.95, 0.15 + r);
  for (const k of [-0.5, 0.5]) coil(x + k * 1.95, 0.15 + r + 1.66);
  coil(x, 0.15 + r + 3.32);
  ctx.collision.addBox(x - 2.9, 0.15, z - L / 2, x + 2.9, 2.0, z + L / 2, 'stock');
  ctx.collision.addBox(x - 1.9, 2.0, z - L / 2, x + 1.9, 3.7, z + L / 2, 'stock');
}

// A stack of rolled slabs on timber bolsters; `hot`: the top one still glows.
function slabStack(ctx, x, z, n, hot) {
  for (const s of [-2, 2]) ctx.buckets.add('wood', box(0.3, 0.3, 1.9, x + s, 0.3, z));
  for (let k = 0; k < n; k++) ctx.buckets.add('painted', box(6.2 - (k % 2) * 0.3, 0.36, 1.7, x + ((k * 7) % 3 - 1) * 0.12, 0.63 + k * 0.4, z), k % 2 ? 0x4a4e56 : 0x3d4148);
  const top = 0.45 + n * 0.4;
  if (hot) {
    glow(ctx, box(6.0, 0.3, 1.6, x, top + 0.18, z), 0xe8621c);
    ctx.halos.add(x, top + 0.6, z, 0xff8a3a, 7);
    ctx.buckets.add('pool', new THREE.PlaneGeometry(11, 7).rotateX(-Math.PI / 2).translate(x, 0.2, z), 0x5a2a10);
  }
  ctx.collision.addBox(x - 3.1, 0.15, z - 0.9, x + 3.1, top + (hot ? 0.35 : 0), z + 0.9, 'stock');
}

// A raw-material heap in a three-sided concrete bay open to the west.
function heap(ctx, x, z, r, h, color) {
  ctx.buckets.add('painted', new THREE.ConeGeometry(r, h, 9).rotateY(hash(x, z) * 3).translate(x, 0.15 + h / 2, z), color);
  ctx.buckets.add('painted', new THREE.ConeGeometry(r * 0.55, h * 0.55, 7).translate(x - r * 0.55, 0.15 + h * 0.27, z + r * 0.35), color);
  for (const [bx, bz, bw, bd] of [[x + r + 0.3, z, 0.5, 2 * r + 1.6], [x, z - r - 0.6, 2 * r + 0.6, 0.5], [x, z + r + 0.6, 2 * r + 0.6, 0.5]]) {
    solid(ctx, 'concrete', box(bw, 2.2, bd, bx, 1.25, bz), { tag: 'bay' });
  }
  ctx.collision.addBox(x - r * 0.62, 0.15, z - r * 0.62, x + r * 0.62, 0.15 + h * 0.5, z + r * 0.62, 'heap');
  ctx.collision.addBox(x - r * 0.3, 0.15 + h * 0.5, z - r * 0.3, x + r * 0.3, 0.15 + h * 0.85, z + r * 0.3, 'heap');
}

// kit: { boxcar, tankCar, flatCar, floodMast, tracksZ } from yards.js (its own builders).
export function yardsFill(ctx, kit) {
  const y0 = 0.15;
  // ---- the steelworks' stock yard (x -412..-382, z 36..80) ----
  coils(ctx, -407, 43, RUST[0]);
  coils(ctx, -407, 46.4, 0x565a60);
  coils(ctx, -399.5, 43, 0x565a60);
  slabStack(ctx, -390, 42, 5, true);
  slabStack(ctx, -390, 46, 4, false);
  slabStack(ctx, -390, 50, 6, false);
  slabStack(ctx, -399, 52, 3, true);
  // Beam bundles on bolsters, under the gantry.
  for (const [bx, bz, n] of [[-397, 66, 4], [-397, 70.5, 3]]) {
    for (const s of [-4.5, 0, 4.5]) ctx.buckets.add('wood', box(0.3, 0.3, 3.2, bx + s, 0.3, bz));
    for (let k = 0; k < n; k++) for (let j = -2; j <= 2; j++) ctx.buckets.add('painted', box(13, 0.34, 0.5, bx + ((k + j) % 2) * 0.3, 0.62 + k * 0.38, bz + j * 0.6), (k + j) % 2 ? RUST[1] : RUST[3]);
    ctx.collision.addBox(bx - 6.6, y0, bz - 1.6, bx + 6.6, 0.45 + n * 0.38, bz + 1.6, 'stock');
  }
  // The gantry crane over them: two A-frame legs, a box girder (a walk and perches), a trolley
  // with its hook hanging over the bundles.
  const gz0 = 62.5, gz1 = 74, gy = 11;
  for (const gx of [-409, -385]) {
    for (const z of [gz0, gz1]) solid(ctx, 'painted', box(0.7, gy, 0.7, gx, gy / 2 + y0, z), { color: 0xb8892a, tag: 'gantry' });
    ctx.buckets.add('painted', box(0.5, 0.5, gz1 - gz0, gx, gy * 0.55, (gz0 + gz1) / 2), 0xb8892a);
    ctx.buckets.add('painted', box(0.9, 0.7, gz1 - gz0 + 1.4, gx, gy + y0, (gz0 + gz1) / 2), 0x8a6a22);
  }
  solid(ctx, 'painted', box(26, 1.2, 1.6, -397, gy + 1.2, 68.2), { color: 0xb8892a, tag: 'gantry' });
  for (let k = -5; k <= 5; k++) ctx.buckets.add('painted', box(0.12, 1.2, 1.7, -397 + k * 2.3, gy + 1.2, 68.2), 0x16181c);
  ctx.buckets.add('painted', box(2.4, 1.0, 2.2, -393, gy + 0.3, 68.2), 0x2a2d33);
  ctx.buckets.add('painted', box(0.08, 5.6, 0.08, -393, gy - 3.0, 68.2), 0x16181c);
  ctx.buckets.add('painted', new THREE.TorusGeometry(0.4, 0.1, 5, 10, Math.PI * 1.4).translate(-393, gy - 6.1, 68.2), 0x16181c);
  for (const gx of [-405, -397, -389]) ctx.grapple.push({ x: gx, y: gy + 1.8, z: 68.2, nx: 0, nz: 1, perch: gx === -397 });
  glow(ctx, box(0.5, 0.3, 0.3, -393, gy - 0.3, 69.4), 0xf0e0b0);
  ctx.halos.add(-393, gy - 0.5, 69.6, 0xf0e0b0, 4);
  // A ladle car on a short spur by the slab stacks, its ladle still warm.
  for (const s of [-0.72, 0.72]) ctx.buckets.add('painted', box(16, 0.16, 0.1, -397, y0 + 0.08, 36.5 + s), 0x6e6a62);
  solid(ctx, 'painted', box(5.4, 0.6, 2.6, -401, 1.0, 36.5), { color: 0x2a2d33, tag: 'ladleCar' });
  solid(ctx, 'painted', cylinder(1.5, 1.2, 2.4, -401, 2.5, 36.5, 10), { color: 0x3a3532, tag: 'ladleCar' });
  glow(ctx, new THREE.CircleGeometry(1.25, 10).rotateX(-Math.PI / 2).translate(-401, 3.72, 36.5), 0xe8621c);
  ctx.halos.add(-401, 4.1, 36.5, 0xff8a3a, 6);
  // ---- raw materials in their bays north of it (x -412..-382, z 2..30) ----
  heap(ctx, -390, 8, 5.2, 4.6, 0x2a2624);  // coke
  heap(ctx, -390, 22, 5.2, 5.2, 0x6a3a2a); // ore
  heap(ctx, -404, 6, 4.2, 3.6, 0x77736a);  // limestone
  // ---- more freight on the two empty tracks ----
  const T = kit.tracksZ;
  kit.boxcar(ctx, -548, T[0], RUST[0]); kit.boxcar(ctx, -531, T[0], RUST[2]); kit.tankCar(ctx, -514, T[0]);
  kit.flatCar(ctx, -441, T[0]); kit.boxcar(ctx, -424, T[0], RUST[1]); kit.boxcar(ctx, -407, T[0], RUST[3]);
  kit.tankCar(ctx, -551, T[3]); kit.boxcar(ctx, -534, T[3], RUST[3]);
  kit.boxcar(ctx, -432, T[3], RUST[0]); kit.flatCar(ctx, -415, T[3]); kit.tankCar(ctx, -398, T[3]);
  // ---- light over the dark stretches ----
  kit.floodMast(ctx, -383, 56);
  kit.floodMast(ctx, -446, 44);
  kit.floodMast(ctx, -359, 79, 14);
  lightSpot(ctx, -390, 3.5, 44, 0xff8a3a, 20, 14);
}
