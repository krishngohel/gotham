// Park Row / Crime Alley (workstream H3): the once-grand, now decayed quarter west of the
// Narrows channel. Chicago 2:1 blocks with a 5 m alley down the long axis; greystones, brick
// two- and three-flats and workers' cottages with stacked back porches and alley garages; pawn
// shops along the channel street. Landmarks: the Orpheum (a shuttered Aragon-style theatre on
// Park Row with its marquee still up), Crime Alley beside it (a dead-end alley kept deliberately
// still: one lamp, no clutter), the Lantern Arms hotel, the Last Resort mission, the boarded-up
// Foundling Home, and a freight viaduct striding down the west blocks' alley from the Yards. The
// El West Line corridor (z -479) crosses with a station plot at x -520 left clear for workstream H1.
import { roofVariety } from './westDressing.js'; // [polish2]
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, building, edgeGrapples, streetLamp, graffiti } from '../cityBuilder.js';
import { trashBags, puddle, streetTree } from '../streetDressing.js';
import { addLadder } from '../climbables.js';
import { addGargoyle, plinth } from '../gargoyles.js';
import { bareTree } from '../trees.js';
import { WEST, RECTS, LANDMARKS as L } from './westLayout.js';
import { slab, railing, ground, paveStreets, block, kerb, parkCars, dressAlley, around, signPlane, grille, lampAt, chainFence, zip } from './westKit.js';
import { fillSub, rooftopLinks, fireEscapeLite, cottage, rearPorch, garage } from './westBlocks.js';

export const PARKROW_COLS = [[-566, -527], [-513, -467]];
export const PARKROW_ROWS = [[-291, -226], [-412, -305], [-469, -426], [-532, -489], [-573, -546]];
const PAWN = ['PAWN', 'PAWN & LOAN', 'WE BUY GOLD', 'BUY SELL TRADE', 'LOANS', 'CHECKS CASHED', 'GUITARS & WATCHES'];
const SIGN_COLS = [0xe8962f, PALETTE.neonPink, PALETTE.neonCyan, 0xe0b84a];

export function buildParkRow(ctx) {
  const { rng } = ctx;
  const R = RECTS.parkRow;
  ground(ctx, R);
  // Sidewalk strips: along the channel (east of the -460 street) and the Bristol edge.
  const zCross = [-298, -419, -479, -539, -580].map((z) => [z - 7, z + 7]);
  for (const [a, b] of around(-600, -226, zCross)) slab(ctx, 'sidewalk', -453, 0, a, -450, 0.15, b, { tag: 'sidewalk' });
  slab(ctx, 'sidewalk', -580, 0, -600, -467, 0.15, -587, { tag: 'sidewalk' });

  const corridor = L.viaduct.corridor;
  const avoid = [
    { ...corridor, minZ: -600, maxZ: -226 },
    rectOf(L.orpheum, 0.3), rectOf(L.hotel, 0.3), rectOf(L.mission, 0.3),
    { minX: -513, maxX: -467, minZ: -532, maxZ: -489 }, // the Foundling Home's grounds
  ];
  for (const [x0, x1] of PARKROW_COLS) {
    for (const [z0, z1] of PARKROW_ROWS) {
      const b = { minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
      const orphanage = x0 === -513 && z0 === -532;
      const { subs, alleys } = block(ctx, b, { alleysX: orphanage ? [] : [(x0 + x1) / 2], lampEvery: 40 });
      if (orphanage) { foundlingHome(ctx, b); continue; }
      if (z0 === -573) {
        // The thin north row: workers' cottages facing the -580 street (low cover, short grapples).
        const xs = x0 === -566 ? [-560.5, -538, -531.4] : [-507, -500, -482, -475];
        for (const cx of xs) cottage(ctx, cx, -564.5, 'n');
        for (const a of alleys) dressAlley(ctx, a, { bulbs: false });
        kerb(ctx, b, 0, -1, 2, { trees: true });
        continue;
      }
      const list = [];
      for (const sub of subs) {
        const faces = [];
        // Lots face the x streets (the long sides); the block ends get corner buildings.
        if (sub.minX === b.minX) faces.push('w');
        if (sub.maxX === b.maxX) faces.push('e');
        if (sub.minZ === b.minZ) faces.push('n');
        if (sub.maxZ === b.maxZ) faces.push('s');
        const pawnRow = x1 === -467;
        list.push(...fillSub(ctx, sub, faces, {
          depth: x0 === -566 ? [9, 11] : [10, 12.5], lot: [9, 6.5], floors: [2, 4], styles: ['stone', 'stone', 'brick', 'brick'],
          storefront: pawnRow ? 0.5 : 0.25, fireEscape: 0.5, parapet: true, props: 'none', district: 'parkRow', tag: 'pr', avoid,
          onBuilt: (bb) => { dressFlat(ctx, bb, pawnRow); roofVariety(ctx, bb); }, // [polish2] roofs differ from the air
        }));
      }
      for (const a of alleys) {
        // Crime Alley is the south end of this block's alley: dressed by crimeAlley() instead.
        if (x0 === -513 && z0 === -412) { dressAlley(ctx, { ...a, minZ: a.minZ, maxZ: L.crimeAlley.minZ - 0.2 }, {}); continue; }
        dressAlley(ctx, a, { bulbs: !(x0 === -566), fence: rng.chance(0.2) ? rng.range(10, 30) : null });
      }
      // Back porches and garages on the alley side of the flats, cottages where a lot is wide.
      for (const bb of list) {
        const toAlley = bb.face === 'w' ? 'e' : bb.face === 'e' ? 'w' : null;
        if (toAlley && bb.h >= 6.8 && rng.chance(0.6)) rearPorch(ctx, bb, toAlley);
        if (toAlley && x0 === -513) {
          const back = toAlley === 'e' ? bb.x + bb.w / 2 : bb.x - bb.w / 2;
          const alleyEdge = toAlley === 'e' ? -492.5 : -487.5;
          const yard = Math.abs(alleyEdge - back);
          if (yard >= 6.5 && bb.d >= 6 && rng.chance(0.55)) garage(ctx, alleyEdge + (toAlley === 'e' ? -3 : 3), bb.z, toAlley, Math.min(5.5, bb.d - 0.5), 5.2);
        }
      }
      rooftopLinks(ctx, list, { planks: 0.35, lines: 0.35, tanks: 0.2, coops: 0.12, gapMax: 7 });
      for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        kerb(ctx, b, nx, nz, nz ? 1 : 3, { trees: true });
        if (rng.chance(0.5)) parkCars(ctx, b, nx, nz, nz ? 1 : 2);
      }
    }
  }
  paveStreets(ctx, { minX: R.minX, maxX: R.maxX, minZ: R.minZ, maxZ: R.maxZ });
  orpheum(ctx);
  crimeAlley(ctx);
  hotel(ctx);
  mission(ctx);
  viaductSegment(ctx, L.viaduct.z0, R.maxZ);
}

const rectOf = (b, pad = 0) => ({ minX: b.x - b.w / 2 - pad, maxX: b.x + b.w / 2 + pad, minZ: b.z - b.d / 2 - pad, maxZ: b.z + b.d / 2 + pad });

function dressFlat(ctx, b, pawnRow) {
  const { rng } = ctx;
  const f = b.face;
  const nx = f === 'e' ? 1 : f === 'w' ? -1 : 0, nz = f === 's' ? 1 : f === 'n' ? -1 : 0;
  const px = b.x + nx * b.w / 2, pz = b.z + nz * b.d / 2;
  const width = nz ? b.w : b.d;
  if (b.storefront) {
    if (pawnRow && rng.chance(0.6)) signPlane(ctx, rng.pick(PAWN), rng.pick(SIGN_COLS), px + nx * 0.3, 5.2, pz + nz * 0.3, nx, nz, 1.0);
    if (rng.chance(0.35)) grille(ctx, px, pz, nx, nz, Math.min(4, width - 1.5), { tag: rng.chance(0.3) ? 'PARK ROW' : null });
  } else if (b.style === 'stone' && b.h < 11) {
    // A greystone's front steps up to the parlour floor.
    for (let k = 0; k < 4; k++) {
      const out = 2.2 - k * 0.55, top = 0.15 + (k + 1) * 0.3;
      solid(ctx, 'concrete', box(nz ? 1.8 : out, top, nx ? 1.8 : out, px + nx * out / 2, top / 2, pz + nz * out / 2), { tag: 'step' });
    }
  }
  if (rng.chance(0.12)) graffiti(ctx, px + nx * 0.02, 1.8, pz + nz * 0.02, nx, nz, Math.min(3.5, width - 1), rng.pick(['PARK ROW', 'REMEMBER', 'NO HEROES', 'WHO WATCHES']));
}

// The Orpheum: a Spanish-baroque movie palace gone dark, its marquee still on Park Row, a tall
// blade sign on the corner, twin domed turrets on the front, gargoyle-free (it is stucco, not
// stone). The roof is a vista over Crime Alley.
function orpheum(ctx) {
  const O = L.orpheum;
  const b = {
    id: 'orpheum', x: O.x, z: O.z, w: O.w, d: O.d, h: O.h, style: 'stone', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'none',
    neon: [{ text: 'ORPHEUM', face: 's', y: 5.2, color: PALETTE.neonPink, big: true, mode: 'marquee' }, { text: 'ORPHEUM', face: 'e', y: 6, color: 0xe8962f, vertical: true }],
    district: 'parkRow',
  };
  building(ctx, b);
  const fz = O.z + O.d / 2;
  for (const sx of [-1, 1]) {
    const tx = O.x + sx * (O.w / 2 - 1.6), tz = fz - 1.6;
    solid(ctx, 'painted', box(3.2, 6, 3.2, tx, O.h + 3, tz), { color: 0xcdb89a, tag: 'turret' });
    ctx.buckets.add('painted', new THREE.SphereGeometry(1.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(tx, O.h + 6, tz), 0x3f6b5c);
    ctx.buckets.add('painted', cylinder(0.08, 0.08, 1.6, tx, O.h + 8.6, tz, 5), 0xc8a24a);
    ctx.grapple.push({ x: tx, y: O.h + 6, z: tz, nx: 0, nz: 1, perch: true });
  }
  // Boarded doors under the marquee and peeling posters.
  for (const dx of [-4, 0, 4]) ctx.buckets.add('wood', box(2.6, 2.8, 0.12, O.x + dx, 1.55, fz + 0.08));
  signPlane(ctx, 'CLOSED UNTIL FURTHER NOTICE', 0xcdbb8a, O.x, 3.6, fz + 0.2, 0, 1, 0.45, { back: false });
  for (const dz of [-8, -16]) signPlane(ctx, 'COMING SOON', 0xd8c48a, O.x + O.w / 2 + 0.1, 2.4, O.z + O.d / 2 + dz, 1, 0, 0.6, { back: false });
}

// Crime Alley: the south end of the block's alley beside the Orpheum, closed at its far end by a
// fence. One lamp, wet cobbles, nothing else. A registered story site (data: sites.crimeAlley).
function crimeAlley(ctx) {
  const A = L.crimeAlley;
  const a = { ...A, alongX: false };
  chainFence(ctx, a, 0); // across its north end (z -350): a dead end
  const x = A.minX + 0.5, z = -318;
  lampAt(ctx, x, 0, z, 1, 0, 0xe8b45a, { pole: 4.6, halo: 3 });
  ctx.buckets.add('painted', box(A.maxX - A.minX, 0.03, A.maxZ - A.minZ, (A.minX + A.maxX) / 2, 0.012, (A.minZ + A.maxZ) / 2), 0x23211f); // darker cobbles
  for (const [px, pz, s] of [[-490.5, -326, 2.2], [-489.2, -339, 1.6], [-490, -310, 1.4]]) puddle(ctx, px, 0.03, pz, s);
  // A drainpipe and a fire door; the back wall of the theatre's stage house.
  ctx.buckets.add('steel', cylinder(0.12, 0.12, 14, A.maxX + 0.15, 7, -330, 6));
  ctx.buckets.add('painted', box(0.1, 2.4, 1.4, A.maxX + 0.05, 1.3, -341), 0x2a1c14);
}

// The Lantern Arms: a rundown residential hotel on the -520 street, vertical blade sign with a
// failing VACANCY, a fire escape up its street face.
function hotel(ctx) {
  const H = L.hotel;
  const b = {
    id: 'lanternArms', x: H.x, z: H.z, w: H.w, d: H.d, h: H.h, style: 'brick', roof: 'flat', parapet: true, cornice: true, storefront: true, tiers: [], props: 'auto',
    neon: [{ text: 'HOTEL', face: 'e', y: 8, color: PALETTE.neonPink, vertical: true }], district: 'parkRow',
  };
  building(ctx, b);
  fireEscapeLite(ctx, b, 's', { drop: true });
  signPlane(ctx, 'LANTERN ARMS', 0xe8962f, H.x + H.w / 2 + 0.2, 4.8, H.z - 6, 1, 0, 0.9);
  signPlane(ctx, 'VACANCY', 0xff4a4a, H.x + H.w / 2 + 0.2, 4.0, H.z + 6, 1, 0, 0.7);
}

function mission(ctx) {
  const M = L.mission;
  building(ctx, { id: 'mission', x: M.x, z: M.z, w: M.w, d: M.d, h: M.h, style: 'brick', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'auto', neon: [], district: 'parkRow' });
  const fx = M.x + M.w / 2;
  ctx.buckets.add('painted', box(0.1, 2.6, 2.2, fx + 0.05, 1.45, M.z), 0x2a1c14);
  signPlane(ctx, 'LAST RESORT MISSION', 0xe8d08a, fx + 0.15, 5.4, M.z, 1, 0, 0.9);
  signPlane(ctx, 'HOT SOUP 6 PM', 0xe8962f, fx + 0.15, 3.6, M.z - 5, 1, 0, 0.6, { back: false });
  // A cross of bulbs over the door.
  ctx.buckets.add('glow', box(0.06, 1.8, 0.3, fx + 0.12, 7.5, M.z), 0xf0e0a0);
  ctx.buckets.add('glow', box(0.06, 0.3, 1.2, fx + 0.12, 7.9, M.z), 0xf0e0a0);
  ctx.halos.add(fx + 0.4, 7.6, M.z, 0xf0e0a0, 3);
}

// The Gotham Foundling Home: a boarded-up stone orphanage in its own fenced grounds, a cupola,
// dead trees, a CONDEMNED notice on the gate.
function foundlingHome(ctx, blk) {
  const { rng } = ctx;
  const O = L.orphanage;
  const b = { id: 'foundlingHome', x: O.x, z: O.z, w: O.w, d: O.d, h: O.h, style: 'stone', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'none', neon: [], district: 'parkRow' };
  building(ctx, b);
  // Boarded windows: plank crosses on the lower two floors.
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const span = nz ? O.w : O.d;
    for (let t = -span / 2 + 2.5; t < span / 2 - 1; t += 3.4) {
      for (const y of [5.1, 8.5]) {
        if (rng.chance(0.3)) continue;
        const px = O.x + nx * (O.w / 2 + 0.08) + (nz ? t : 0), pz = O.z + nz * (O.d / 2 + 0.08) + (nx ? t : 0);
        ctx.buckets.add('wood', box(nz ? 1.4 : 0.06, 1.8, nx ? 1.4 : 0.06, px, y, pz));
      }
    }
  }
  // Cupola with a bell, the roof's perch.
  solid(ctx, 'painted', box(4, 3.4, 4, O.x, O.h + 1.7, O.z), { color: 0x8c877d, tag: 'cupola' });
  ctx.buckets.add('painted', new THREE.ConeGeometry(3.2, 4.2, 4).rotateY(Math.PI / 4).translate(O.x, O.h + 5.5, O.z), 0x3f4a44);
  ctx.collision.addBox(O.x - 1.2, O.h + 3.4, O.z - 1.2, O.x + 1.2, O.h + 5.5, O.z + 1.2, 'cupola');
  ctx.grapple.push({ x: O.x, y: O.h + 5.5, z: O.z, nx: 0, nz: 1, perch: true });
  for (const [sx, sz] of [[-1, 1], [1, 1]]) {
    const gx = O.x + sx * (O.w / 2 - 0.8), gz = O.z + sz * (O.d / 2 - 0.8);
    plinth(ctx, gx, O.h, gz);
    addGargoyle(ctx, gx, O.h + 0.9, gz, Math.atan2(sx, sz));
  }
  // Iron fence round the grounds with a gate on the south (the El corridor runs past the north side).
  const fy = 2.2;
  const inset = 1;
  const fx0 = blk.minX + inset, fx1 = blk.maxX - inset, fz0 = blk.minZ + inset, fz1 = blk.maxZ - inset;
  for (const [ax, a, c, at] of [[true, fx0, fx1, fz0], [false, fz0, fz1, fx0], [false, fz0, fz1, fx1]]) {
    railing(ctx, ax, a, c, at, 0.15, { color: 0x1d2024, post: 1.2 });
    ctx.collision.addBox(ax ? a : at - 0.15, 1.25, ax ? at - 0.15 : a, ax ? c : at + 0.15, fy, ax ? at + 0.15 : c, 'fence');
  }
  for (const [a, c] of around(fx0, fx1, [[O.x - 2.5, O.x + 2.5]])) {
    railing(ctx, true, a, c, fz1, 0.15, { color: 0x1d2024, post: 1.2 });
    ctx.collision.addBox(a, 1.25, fz1 - 0.15, c, fy, fz1 + 0.15, 'fence');
  }
  signPlane(ctx, 'GOTHAM FOUNDLING HOME', 0xbfae86, O.x, 3.4, fz1 + 0.2, 0, 1, 0.55, { back: true });
  signPlane(ctx, 'CONDEMNED', 0xff5a3a, O.x + 3.4, 1.6, fz1 + 0.25, 0, 1, 0.4, { back: false });
  for (let k = 0; k < 7; k++) {
    const tx = rng.pick([blk.minX + 4, blk.maxX - 4]), tz = rng.range(blk.minZ + 5, blk.maxZ - 5);
    for (const g of bareTree(rng, tx, 0.15, tz, rng.range(1.1, 1.5), 3)) ctx.buckets.add('painted', g, 0x201c1c);
    ctx.collision.addBox(tx - 0.3, 0.15, tz - 0.3, tx + 0.3, 3, tz + 0.3, 'tree');
  }
  for (let k = 0; k < 6; k++) trashBags(ctx, rng.range(blk.minX + 3, blk.maxX - 3), rng.pick([blk.minZ + 3, blk.maxZ - 3]));
}

// The freight viaduct: a single-track steel deck (top y 6.2) on bents every 12 m down the west
// blocks' alley, girders spanning the streets with posted clearance, a buffer stop at its north
// end, maintenance ladders. Built per region (each region draws its own stretch).
export function viaductSegment(ctx, z0, z1, { endStop = false, startStop = true } = {}) {
  const V = L.viaduct;
  const x = V.x, hw = V.half, top = V.deck, gTop = top - 0.2, gBot = top - 1.4;
  const streetsZ = [...WEST.zNorth, ...WEST.zSouth];
  const inStreet = (z) => streetsZ.some((s) => Math.abs(z - s) < 8);
  // Deck, girders, ballast, ties and the rail.
  slab(ctx, 'painted', x - hw, gTop, z0, x + hw, top, z1, { tag: 'viaduct', color: 0x2a2724 });
  for (const s of [-1, 1]) {
    ctx.buckets.add('painted', box(0.4, gTop - gBot, z1 - z0, x + s * (hw - 0.2), (gTop + gBot) / 2, (z0 + z1) / 2), 0x2f3a36);
    for (let z = z0 + 1.5; z < z1; z += 3) ctx.buckets.add('painted', box(0.5, gTop - gBot, 0.12, x + s * (hw - 0.2), (gTop + gBot) / 2, z), 0x253029);
    ctx.collision.addBox(x + s * hw - (s > 0 ? 0.25 : -0.25) - 0.25, top, z0, x + s * hw - (s > 0 ? 0.25 : -0.25) + 0.25, top + 0.5, z1, 'viaductRail');
  }
  for (let z = z0 + 0.5; z < z1; z += 1.1) ctx.buckets.add('wood', box(2.4, 0.14, 0.24, x, top + 0.07, z));
  for (const s of [-0.72, 0.72]) ctx.buckets.add('painted', box(0.1, 0.2, z1 - z0, x + s, top + 0.24, (z0 + z1) / 2), 0x6e6a62);
  edgeGrapples(ctx, x, (z0 + z1) / 2, 2 * hw, z1 - z0, top + 0.5, 9);
  // Bents: two columns and a cap beam every 12 m, none standing in a street.
  let n = 0;
  for (let z = z0 + 3; z < z1 - 1; z += 12) {
    if (inStreet(z)) continue;
    for (const s of [-1, 1]) solid(ctx, 'painted', box(0.5, gBot, 0.5, x + s * 2.1, gBot / 2, z), { color: 0x2f3a36, tag: 'viaductColumn' });
    ctx.buckets.add('painted', box(2 * hw, 0.6, 0.7, x, gBot - 0.3, z), 0x2f3a36);
    for (const s of [-1, 1]) ctx.buckets.add('painted', box(0.08, 3.6, 0.08, 0, 0, 0).rotateZ(s * 0.5).translate(x + s * 1.05, gBot - 2, z), 0x2f3a36);
    if (n++ % 5 === 0) {
      addLadder(ctx.climbables, { x: x + 2.36, z, nx: 1, nz: 0, bottom: 0, top: top + 0.2 });
      for (let k = 0.4; k < top; k += 0.6) ctx.buckets.add('steel', box(0.05, 0.05, 0.5, x + 2.38, k, z));
    }
  }
  // Clearance signs on the girders over each street.
  for (const s of streetsZ) {
    if (s < z0 || s > z1) continue;
    const hwS = 7;
    for (const side of [-1, 1]) signPlane(ctx, 'CLEARANCE 4.6 M', 0xe8d24a, x, gBot + 0.55, s + side * (hwS + 0.2) + (side < 0 ? 0 : 0), 0, side, 0.45, { back: false });
  }
  if (startStop) {
    // Buffer stop at the north end, red lamp.
    solid(ctx, 'painted', box(3, 1.2, 0.8, x, top + 0.6, z0 + 0.6), { color: 0x7a2e2e, tag: 'bufferStop' });
    ctx.halos.add(x, top + 1.6, z0 + 0.6, PALETTE.crimson, 2.2);
  }
  void endStop;
  ctx.facades?.push({ minX: x - hw, minY: gBot, minZ: z0, maxX: x + hw, maxY: top, maxZ: z1, style: 'steel' });
}
