// Gotham Mile (workstream H): the grand shopping avenue north of the Loop. A 30 m boulevard on
// x 150 with a planted, lit median; flagship stores with big lit windows and awnings; hotels with
// canopies and doormen; the Pumping Tower (a castellated limestone water tower, original design);
// the new Iceberg Lounge, a former cold store reborn as an ice-blue club (the core's old ICEBERG
// sign on Neon Row stays the Penguin's old dive); Diamond Row's jewellers; and an old church
// squeezed between two towers. Research 1.5 and 3.2; layout numbers in loopLayout.js.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, tiledBox, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, edgeGrapples, building, streetLamp, parkedCar } from '../cityBuilder.js';
import { hydrant, newsBoxes, trashCan, mailbox, manhole, puddle, trashBags, phoneBooth, bench } from '../streetDressing.js';
import { addGargoyle, plinth } from '../gargoyles.js';
import { addLadder, addZipline } from '../climbables.js';
import { MILE, MILE_COLUMNS, MILE_ROWS } from './loopLayout.js';
import { slab, lampAt, dashes, crosswalk, signPlane, flagpole, busShelter, newsstand, avenueTree, STONE, BRONZE } from './loopKit.js';

const D = 'gothamMile';
const col = (c) => MILE_COLUMNS.find((k) => k.c === c);
const row = (c) => MILE_ROWS.find((k) => k.c === c);
const ICE = 0x9ee8ff;

function rec(id, x, z, w, d, h, style, extra = {}) {
  return { id, x, z, w, d, h, style, roof: 'flat', parapet: true, cornice: style !== 'steel', storefront: false, tiers: [], props: 'auto', neon: [], district: D, ...extra };
}
function fp(c, r, { w = null, d = null, dx = 0, dz = 0 } = {}) {
  const C = col(c), R = row(r);
  const x0 = C.x0 + 3, x1 = C.x1 - 3, z0 = R.z0 + 3, z1 = R.z1 - 3;
  return { x: (x0 + x1) / 2 + dx, z: (z0 + z1) / 2 + dz, w: w ?? x1 - x0, d: d ?? z1 - z0 };
}

// A hotel canopy over the sidewalk from a face: lit underside, brass posts, a red carpet, and a
// doorman's spot (returned) at the door.
function canopy(ctx, x, z, nx, nz, width = 8, depth = 2.8) {
  const cx = x + nx * depth / 2, cz = z + nz * depth / 2;
  const w = Math.abs(nz) ? width : depth, d = Math.abs(nx) ? width : depth;
  solid(ctx, 'painted', box(w, 0.35, d, cx, 4.2, cz), { color: 0x5a1c22, tag: 'roof' });
  glow(ctx, box(w - 0.4, 0.05, d - 0.4, cx, 4.0, cz), 0xf2d89a);
  for (const s of [-1, 1]) {
    const px = x + nx * (depth - 0.3) + (nz ? s * (width / 2 - 0.3) : 0);
    const pz = z + nz * (depth - 0.3) + (nx ? s * (width / 2 - 0.3) : 0);
    solid(ctx, 'painted', cylinder(0.07, 0.07, 4.0, px, 2.15, pz, 6), { color: BRONZE, tag: 'post' });
  }
  ctx.buckets.add('painted', box(Math.abs(nz) ? 2 : depth, 0.02, Math.abs(nx) ? 2 : depth, cx, 0.16, cz), 0x8a2028);
  ctx.halos.add(cx, 3.9, cz, 0xf2d89a, 3.2);
  lightSpot(ctx, cx, 3.6, cz, 0xf2d89a, 20, 12);
  ctx.reflect.push({ x: cx, y: 0.16, z: cz, h: 4, color: 0xf2d89a, w: 1.5, len: 6, k: 0.3 });
  edgeGrapples(ctx, cx, cz, w, d, 4.38, 4);
  return { x: x + nx * 1.2, y: 0.15, z: z + nz * 1.2 };
}

// The Iceberg Lounge: a cold-store block (concrete, few windows) gone glamorous: an ice-blue
// canopy and lit door, a big neon name, and a rooftop "iceberg" of pale shards lit from inside.
function icebergLounge(ctx) {
  const f = fp(60, -623);
  const b = rec('icebergLounge', f.x, f.z, f.w, f.d, 22, 'warehouse', { props: 'none', cornice: true, neon: [{ text: 'THE ICEBERG LOUNGE', face: 's', y: 12, color: ICE, big: true, mode: 'flat' }] });
  building(ctx, b);
  const fz = b.z + b.d / 2;
  // Door: double doors in a lit ice-blue frame, velvet-rope posts, an ice-blue canopy.
  glow(ctx, box(5, 3.2, 0.12, b.x, 1.75, fz + 0.08), 0x6ad0f0);
  ctx.buckets.add('painted', box(5.6, 0.4, 0.3, b.x, 3.5, fz + 0.15), 0xd8f2ff);
  const cz = fz + 1.4;
  solid(ctx, 'painted', box(12, 0.4, 2.8, b.x, 4.4, cz), { color: 0x2a4a5e, tag: 'roof' });
  glow(ctx, box(11.6, 0.06, 2.4, b.x, 4.18, cz), ICE);
  for (let t = -3; t <= 3; t += 1.5) {
    ctx.buckets.add('painted', cylinder(0.05, 0.07, 0.95, b.x + t, 0.62, fz + 2.2, 6), BRONZE);
  }
  ctx.buckets.add('painted', box(6.2, 0.06, 0.06, b.x, 0.95, fz + 2.2), 0x8a1828);
  ctx.halos.add(b.x - 4, 4.0, cz, ICE, 3); ctx.halos.add(b.x + 4, 4.0, cz, ICE, 3);
  lightSpot(ctx, b.x, 3.5, cz + 1, ICE, 24, 14);
  ctx.reflect.push({ x: b.x, y: 0.16, z: cz + 1.5, h: 4, color: ICE, w: 2.5, len: 7, k: 0.4 });
  edgeGrapples(ctx, b.x, cz, 12, 2.8, 4.6, 4);
  // Rooftop iceberg: shards round a lit core (stand on the low shards, perch on the peak).
  const ry = 22;
  const shards = [[0, 0, 5.2, 9], [-4, 2, 3.2, 6], [4, -1, 3.6, 7], [1, 4, 2.8, 5], [-2, -4, 3, 5.5]];
  for (const [dx, dz, r, h] of shards) {
    const g = new THREE.ConeGeometry(r, h, 5).rotateY(dx * 0.7).translate(b.x + dx, ry + h / 2, b.z + dz);
    ctx.buckets.add('painted', g, 0xd8f2ff);
    ctx.collision.addBox(b.x + dx - r * 0.45, ry, b.z + dz - r * 0.45, b.x + dx + r * 0.45, ry + h * 0.45, b.z + dz + r * 0.45, 'roof');
  }
  glow(ctx, new THREE.IcosahedronGeometry(2.6, 0).translate(b.x, ry + 3, b.z), ICE);
  ctx.halos.add(b.x, ry + 4, b.z, ICE, 16);
  ctx.halos.add(b.x, ry + 9.5, b.z, 0xffffff, 4);
  ctx.blinkers.push({ i: ctx.halos.count - 1, size: 4, phase: 0.9 });
  ctx.grapple.push({ x: b.x, y: ry + 9 * 0.45, z: b.z, nx: 0, nz: 1, perch: true });
  return { door: { x: b.x, y: 0.15, z: fz + 1.2 }, roof: { x: b.x + 12, y: ry, z: b.z + 10 } };
}

// The Pumping Tower: a castellated limestone water tower (original): a square base with corner
// turrets, a tall shaft, a lantern and finial; beside it the old pumping station.
function pumpingTower(ctx) {
  const C = col(197.5), R = row(-683);
  const x = C.x0 + 22, z = R.c;
  const b = rec('pumpingTower', x, z, 10, 10, 12, 'stone', { props: 'none', landmark: true, cornice: true, tiers: [{ w: 5.5, d: 5.5, h: 22 }, { w: 3.6, d: 3.6, h: 4 }] });
  building(ctx, b);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + sx * 5.2, pz = z + sz * 5.2;
    solid(ctx, 'painted', cylinder(1.1, 1.2, 15, px, 7.5, pz, 10), { color: 0xcfc6b0, tag: 'turret' });
    ctx.buckets.add('painted', new THREE.ConeGeometry(1.4, 3, 10).translate(px, 16.5, pz), 0x6f6a5e);
    ctx.grapple.push({ x: px, y: 15, z: pz, nx: sx * 0.7, nz: sz * 0.7, perch: true });
    // Shaft corner turrets.
    const qx = x + sx * 2.9, qz = z + sz * 2.9;
    ctx.buckets.add('painted', cylinder(0.55, 0.6, 22, qx, 12 + 11, qz, 8), 0xcfc6b0);
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.7, 2, 8).translate(qx, 35, qz), 0x6f6a5e);
  }
  // Crenellations on the base and shaft tops.
  for (const [w, y] of [[10, 12], [5.5, 34]]) {
    for (let t = -w / 2 + 0.6; t < w / 2; t += 1.4) for (const s of [-1, 1]) {
      ctx.buckets.add('painted', box(0.7, 0.7, 0.4, x + t, y + 1.2, z + s * (w / 2 - 0.2)), 0xcfc6b0);
      ctx.buckets.add('painted', box(0.4, 0.7, 0.7, x + s * (w / 2 - 0.2), y + 1.2, z + t), 0xcfc6b0);
    }
  }
  ctx.buckets.add('painted', new THREE.ConeGeometry(1.2, 5, 8).translate(x, 38 + 2.5, z), 0x6f6a5e);
  ctx.halos.add(x, 37, z, 0xf2d89a, 6);
  for (const [sx, sz] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) glow(ctx, box(sz ? 1.2 : 0.1, 2.4, sx ? 1.2 : 0.1, x + sx * 2.8, 30, z + sz * 2.8), 0xf2d89a);
  // A lit clock-like rose on the south face of the base, a door, floodlights.
  glow(ctx, box(2, 3, 0.1, x, 1.65, z + 5.06), 0xc89a52);
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) ctx.halos.add(x + sx * 7, 1, z + sz * 7, 0xe8d8a8, 7);
  // The pumping station: a long crenellated stone hall (its works hide a downtown cave entrance).
  const ps = rec('pumpingStation', C.x1 - 13, z, 20, 30, 10, 'stone', { props: 'none', cornice: true });
  building(ctx, ps);
  for (let t = -14; t < 15; t += 1.6) for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.4, 0.8, 0.8, ps.x + s * 9.8, 11.2, z + t), 0xcfc6b0);
  glow(ctx, box(0.1, 2.6, 2.4, ps.x - 10.05, 1.5, z), 0x9a8a62);
  // Park: lawn, paths, benches, trees around the tower.
  slab(ctx, 'yard', C.x0 + 2, 0.15, R.z0 + 2, C.x0 + 42, 0.2, R.z1 - 2, { tag: 'lawn', collide: false });
  for (const [tx, tz] of [[-14, -16], [14, -16], [-14, 16], [14, 16], [-16, 0]]) avenueTree(ctx, x + tx, z + tz);
  bench(ctx, x - 9, z + 12, 0, 1); bench(ctx, x + 9, z + 12, 0, 1);
  return { top: { x, y: 34, z }, base: { x: x + 7, y: 0.15, z: z + 9 } };
}

// An old church squeezed between two towers: stone nave with a steep roof, a spire tower on the
// street front with gargoyles, a rose window.
function oldChurch(ctx) {
  const R = row(-743);
  const z0 = R.z0 + 3, z1 = R.z1 - 3;
  building(ctx, rec('mileTowerW', -15.5, (z0 + z1) / 2, 9, z1 - z0, 72, 'concrete', { props: 'none' }));
  building(ctx, rec('mileTowerE', 15.5, (z0 + z1) / 2, 9, z1 - z0, 84, 'steel', { props: 'none', cornice: false }));
  const nave = rec('oldChurch', 0, (z0 + z1) / 2 - 4, 16, z1 - z0 - 8, 14, 'stone', { props: 'none', roof: 'pitched', parapet: false, cornice: true });
  building(ctx, nave);
  // Spire tower on the street (south) end.
  const sz = z1 - 4;
  const t = rec('oldChurchSpire', 0, sz, 8, 8, 30, 'stone', { props: 'none', landmark: true });
  building(ctx, t);
  ctx.buckets.add('painted', new THREE.ConeGeometry(4.6, 16, 8).rotateY(Math.PI / 8).translate(0, 38, sz), 0x4a4e52);
  ctx.collision.addBox(-2.6, 30, sz - 2.6, 2.6, 36, sz + 2.6, 'roof');
  for (const [sx, sxz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    plinth(ctx, sx * 3.3, 30, sz + sxz * 3.3, 0.9, 0.7);
    addGargoyle(ctx, sx * 3.3, 30.7, sz + sxz * 3.3, Math.atan2(sx, sxz));
  }
  glow(ctx, new THREE.CylinderGeometry(2, 2, 0.1, 16).rotateX(Math.PI / 2).translate(0, 18, sz + 4.06), 0xb04a5a);
  glow(ctx, box(2.2, 3.6, 0.1, 0, 2, sz + 4.06), 0xc89a52);
  ctx.halos.add(0, 18, sz + 4.6, 0xb04a5a, 6);
  ctx.halos.add(0, 46, sz, PALETTE.crimson, 3);
  ctx.blinkers.push({ i: ctx.halos.count - 1, size: 3, phase: 2.2 });
  return { belfry: { x: 0, y: 30, z: sz }, door: { x: 0, y: 0.15, z: sz + 5.2 } };
}

// Diamond Row: four narrow jewellers on the south face of the block, a tower behind, and the alley
// between them (a fight space with one way in from each street).
function diamondRow(ctx) {
  const R = row(-683);
  const shops = [
    { name: 'KARAT TOP', h: 12, style: 'stone', color: 0xf2d06a },
    { name: 'ROCK STEADY GEMS', h: 15, style: 'brick', color: 0x9ee8ff },
    { name: 'THE GEM PIT', h: 13, style: 'stone', color: 0xff8ac8 },
    { name: 'CARAT & STICK', h: 16, style: 'brick', color: 0xb8f070 },
  ];
  const z1 = R.z1 - 3, d = 16, zc = z1 - d / 2;
  const spots = [];
  shops.forEach((s, i) => {
    const x = -14.25 + i * 9.5;
    building(ctx, rec(`jeweller${i}`, x, zc, 9, d, s.h, s.style, { props: 'auto', neon: [{ text: s.name, face: 's', y: 3.9, color: s.color, mode: 'flat' }] }));
    glow(ctx, box(6, 2.2, 0.1, x, 1.45, z1 + 0.06), 0xf8f0d8);           // display window
    ctx.buckets.add('painted', box(6.4, 0.25, 0.3, x, 2.7, z1 + 0.15), BRONZE);
    for (let k = -2; k <= 2; k++) ctx.buckets.add('painted', box(0.04, 2.2, 0.04, x + k * 1.2, 1.45, z1 + 0.14), 0x1a1c20); // security bars
    ctx.halos.add(x, 1.8, z1 + 0.6, 0xf8f0d8, 2.2);
    spots.push({ x, y: 0.15, z: z1 + 1.4 });
  });
  // Tower behind the alley.
  building(ctx, rec('diamondTower', 0, R.z0 + 3 + 10, 40, 20, 58, 'steel', { props: 'none', cornice: false }));
  return spots;
}

export function buildMile(ctx) {
  const { rng } = ctx;
  const X0 = MILE.minX, X1 = MILE.maxX, Z0 = MILE.minZ, Z1 = MILE.maxZ;
  const BX = MILE.boulevardX, BW = MILE.boulevardW, MW = MILE.medianW;
  ctx.buckets.add('asphalt', tiledBox(X1 - X0, 0.2, Z1 - Z0, (X0 + X1) / 2, -0.1, (Z0 + Z1) / 2, { uvScale: [17, 17], faces: [2] }));
  ctx.collision.addBox(X0, -1, Z0, X1, 0, Z1, 'road');
  const blocks = [];
  for (const R of MILE_ROWS) for (const C of MILE_COLUMNS) {
    const x1 = C.c === 197.5 ? X1 : C.x1;
    blocks.push({ x0: C.x0, x1, z0: R.z0, z1: R.z1, c: C.c, r: R.c });
    slab(ctx, 'sidewalk', C.x0, 0, R.z0, x1, 0.15, R.z1, { tag: 'sidewalk' });
  }
  // The west kerb strip along x -40..-37 (the x -30 street's far sidewalk is Bristol's).
  // Boulevard median: a kerbed planting strip with lit trees, open at the cross streets.
  const medianRuns = [];
  const crossZ = [...MILE.zLines].sort((p, q) => p - q); // north to south: -773 ... -593
  for (let i = 0; i + 1 < crossZ.length; i++) medianRuns.push([crossZ[i] + 8, Math.min(crossZ[i + 1] - 8, Z1 - 1)]);
  for (const [a, b] of medianRuns) {
    if (b - a < 4) continue;
    slab(ctx, 'concrete', BX - MW / 2, 0, a, BX + MW / 2, 0.2, b, { tag: 'median' });
    slab(ctx, 'yard', BX - MW / 2 + 0.3, 0.2, a + 0.3, BX + MW / 2 - 0.3, 0.24, b - 0.3, { collide: false });
    for (let z = a + 4; z < b - 2; z += 10) avenueTree(ctx, BX, z, { lights: true });
  }

  // ---- landmarks and buildings ----
  const sites = {};
  // Row M1 (z -646..-600)
  const hotel1 = fp(0, -623);
  building(ctx, rec('grandKaneHotel', hotel1.x, hotel1.z, hotel1.w, hotel1.d, 66, 'stone', { storefront: false, tiers: [{ w: 30, d: 30, h: 10 }], neon: [{ text: 'THE GRAND KANE', face: 's', y: 58, color: 0xf2d06a, big: true, mode: 'flat' }] }));
  sites.grandKaneDoorman = canopy(ctx, hotel1.x, hotel1.z + hotel1.d / 2, 0, 1, 9);
  for (const t of [-14, -7, 7, 14]) flagpole(ctx, hotel1.x + t, 9, hotel1.z + hotel1.d / 2, 0, 1, t < 0 ? 0x2c3f6e : 0x7a2430);
  for (const [sx, sz] of [[-1, 1], [1, 1]]) { plinth(ctx, hotel1.x + sx * (hotel1.w / 2 - 0.7), 66, hotel1.z + sz * (hotel1.d / 2 - 0.7)); addGargoyle(ctx, hotel1.x + sx * (hotel1.w / 2 - 0.7), 66.9, hotel1.z + sz * (hotel1.d / 2 - 0.7), Math.atan2(sx, sz)); }
  const ice = icebergLounge(ctx);
  sites.icebergDoor = ice.door; sites.icebergRoof = ice.roof;
  const dept = fp(116, -623);
  building(ctx, rec('kaneAndCo', dept.x, dept.z, dept.w, dept.d, 26, 'deco', { storefront: true, tiers: [{ w: 22, d: 30, h: 18 }], billboard: { face: 'e', text: 'KANE & CO.', sub: 'THE SALE ENDS WHEN WE SAY SO' } }));
  // The department-store clock on its boulevard corner.
  const ckx = dept.x + dept.w / 2 + 1.4, ckz = dept.z + dept.d / 2 - 2;
  ctx.buckets.add('painted', box(1.4, 0.2, 0.2, ckx - 0.7, 7.5, ckz), BRONZE);
  ctx.buckets.add('painted', new THREE.CylinderGeometry(1.25, 1.25, 0.5, 16).rotateZ(Math.PI / 2).translate(ckx, 6.6, ckz), BRONZE);
  glow(ctx, new THREE.CylinderGeometry(1.05, 1.05, 0.56, 16).rotateZ(Math.PI / 2).translate(ckx, 6.6, ckz), 0xf2e6c8);
  ctx.halos.add(ckx + 0.4, 6.6, ckz, 0xf2e6c8, 3);
  ctx.grapple.push({ x: ckx, y: 7.9, z: ckz, nx: 1, nz: 0, perch: true });
  signPlane(ctx, 'KANE & CO.', dept.x + dept.w / 2 + 0.25, 5.4, dept.z - 6, 1, 0, { height: 1.0, color: '#f2d06a', panel: 0x1c1a16 });
  const pin = fp(197.5, -623);
  building(ctx, rec('pinnacleHotel', pin.x, pin.z, pin.w, pin.d, 40, 'deco', { storefront: true, tiers: [{ w: 40, d: 30, h: 40 }, { w: 22, d: 18, h: 20 }], neon: [{ text: 'THE PINNACLE', face: 'w', y: 32, color: 0xf2d06a, big: true, mode: 'flat' }] }));
  sites.pinnacleDoorman = canopy(ctx, pin.x - pin.w / 2, pin.z, -1, 0, 10);
  for (const t of [-12, -4, 4, 12]) flagpole(ctx, pin.x - pin.w / 2, 10, pin.z + t, -1, 0, t < 0 ? 0x7a2430 : 0x2c3f6e);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.halos.add(pin.x + sx * 19, 81.2, pin.z + sz * 14, 0xf2e6c8, 8); }
  ctx.halos.add(pin.x, 102, pin.z, PALETTE.crimson, 3.5);
  ctx.blinkers.push({ i: ctx.halos.count - 1, size: 3.5, phase: 0.5 });
  sites.mileBatwingDrop = { x: pin.x, y: 100, z: pin.z, kind: 'fastTravel' };

  // Row M2 (z -706..-660)
  const jewels = diamondRow(ctx);
  jewels.forEach((s, i) => { sites[`diamondRow${i}`] = s; });
  const off2 = fp(60, -683);
  building(ctx, rec('mileOffice', off2.x, off2.z, off2.w, off2.d, 54, 'stone', { storefront: true }));
  const furs = fp(116, -683);
  building(ctx, rec('finesFurs', furs.x, furs.z, furs.w, furs.d, 30, 'stone', { storefront: true, neon: [{ text: 'FINE FURS & FEWER QUESTIONS', face: 'e', y: 6.2, color: 0xff8ac8, mode: 'flat' }], billboard: { face: 'n', text: 'VISIT AMUSEMENT MILE', sub: 'NOW WITH 40% FEWER CLOWNS' } }));
  const pump = pumpingTower(ctx);
  sites.pumpingTowerTop = pump.top; sites.pumpingTowerPark = pump.base;

  // Row M3 (z -766..-720)
  const church = oldChurch(ctx);
  sites.oldChurchBelfry = church.belfry; sites.oldChurchDoor = church.door;
  const essex = fp(60, -743);
  building(ctx, rec('hotelEssex', essex.x, essex.z, essex.w, essex.d, 50, 'brick', { fireEscape: 'w', neon: [{ text: 'HOTEL ESSEX', face: 's', y: 30, color: PALETTE.neonPink, vertical: true, mode: 'blade', offset: 12 }] }));
  sites.essexDoorman = canopy(ctx, essex.x, essex.z + essex.d / 2, 0, 1, 7);
  const goods = fp(116, -743);
  building(ctx, rec('gothamGoods', goods.x, goods.z, goods.w, goods.d, 46, 'deco', { storefront: true, tiers: [{ w: 24, d: 30, h: 24 }, { w: 14, d: 18, h: 16, spire: true }], neon: [{ text: 'GOTHAM GOODS', face: 'e', y: 8, color: 0xf2d06a, mode: 'flat' }] }));
  const lake = fp(197.5, -743);
  building(ctx, rec('lakeviewArms', lake.x - 15.5, lake.z, 28, lake.d, 64, 'stone', { storefront: true, neon: [{ text: 'THE LAKEVIEW ARMS', face: 'w', y: 7, color: 0xf2d06a, mode: 'flat' }] }));
  building(ctx, rec('lakeviewAnnex', lake.x + 16, lake.z, 26, lake.d, 40, 'brick', { fireEscape: 'n' }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { plinth(ctx, lake.x - 15.5 + sx * 13.3, 64, lake.z + sz * (lake.d / 2 - 0.7)); addGargoyle(ctx, lake.x - 15.5 + sx * 13.3, 64.9, lake.z + sz * (lake.d / 2 - 0.7), Math.atan2(sx, sz)); }

  // ---- streets ----
  for (const B of blocks) {
    const e = 0.8;
    for (const [lx, lz, nx, nz] of [[B.x0 + e, B.z0 + e, 0, -1], [B.x1 - e, B.z0 + e, 1, 0], [B.x1 - e, B.z1 - e, 0, 1], [B.x0 + e, B.z1 - e, -1, 0]]) {
      if (Math.abs(lx - BX) < BW / 2 + 2) continue; // the boulevard has its own lamps
      if (lx > X1 - 3) continue;
      streetLamp(ctx, lx, lz, nx, nz);
    }
    for (const [z, nz] of [[B.z0 + 0.8, -1], [B.z1 - 0.8, 1]]) {
      const px = rng.range(B.x0 + 4, B.x1 - 4);
      const rr = rng.next();
      if (rr < 0.3) hydrant(ctx, px, z);
      else if (rr < 0.55) trashCan(ctx, px, z);
      else if (rr < 0.7) mailbox(ctx, px, z, 0, nz);
      else if (rr < 0.9) newsBoxes(ctx, px, z, 0, nz);
      else trashBags(ctx, px, z - nz * 0.6);
    }
    if (rng.chance(0.4) && B.c !== 197.5) parkedCar(ctx, rng.range(B.x0 + 6, B.x1 - 6), B.z1 + 1.3, true);
  }
  // Double-globe lamps along both boulevard kerbs.
  for (let z = Z0 + 10; z < Z1 - 4; z += 20) {
    if (MILE.zLines.some((q) => Math.abs(z - q) < 9)) continue;
    lampAt(ctx, BX - BW / 2 - 1, 0.15, z, 1, 0, { globes: true });
    lampAt(ctx, BX + BW / 2 + 1, 0.15, z, -1, 0, { globes: true });
  }
  busShelter(ctx, BX - BW / 2 - 1.6, -690, 1, 0);
  busShelter(ctx, BX + BW / 2 + 1.6, -630, -1, 0);
  newsstand(ctx, BX - BW / 2 - 1.1, -632, 1, 0);
  newsstand(ctx, 6, -602, 0, 1);
  phoneBooth(ctx, BX + BW / 2 + 1.2, -700, -1, 0);
  phoneBooth(ctx, 25.5 + 13, -661.5, 0, 1);
  // Paint.
  for (const z of MILE.zLines.slice(1)) dashes(ctx, true, X0 + 4, X1 - 4, z, { skip: [...MILE.xLines, BX] });
  for (const x of MILE.xLines) dashes(ctx, false, Z0 + 2, Z1, x, { skip: MILE.zLines });
  for (const s of [-1, 1]) {
    dashes(ctx, false, Z0 + 2, Z1, BX + s * (MW / 2 + 6), { skip: MILE.zLines, gap: 12, len: 6 });
  }
  for (const z of MILE.zLines.slice(1)) {
    for (const x of MILE.xLines) { crosswalk(ctx, x, z + 8.6, false, 10); crosswalk(ctx, x - 8.6, z, true, 10); }
    crosswalk(ctx, BX, z + 8.6, false, 26);
    crosswalk(ctx, BX, z - 8.6, false, 26);
    manhole(ctx, BX + rng.range(-10, 10), z + rng.range(-3, 3));
  }
  for (let k = 0; k < 22; k++) puddle(ctx, rng.range(X0 + 4, X1 - 4), 0.018, rng.pick(MILE.zLines.slice(1)) + rng.range(-5, 5), rng.range(1.4, 3.4));
  for (const [x, z] of [[BX, -660], [BX, -720], [30, -690]]) ctx.steam.push({ x, y: 0.2, z, s: 1.2 });

  // ---- rooftop routes ----
  // A long glide line: off the Pinnacle's crown (100 m) south over the Loop toward Wayne Tower;
  // zip lines across the boulevard between the hotel roofs and down Diamond Row.
  addZipline(ctx.climbables, { x: 172, y: 41, z: -628 }, { x: 128, y: 27, z: -628 });
  addZipline(ctx.climbables, { x: 131, y: 31, z: -683 }, { x: 181.5, y: 13.2, z: -683 });
  addZipline(ctx.climbables, { x: -14, y: 58.6, z: -686 }, { x: -14, y: 13, z: -671 });
  return sites;
}
