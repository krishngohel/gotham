// Chinatown + Little Odessa (workstream H3), between the South Branch and the city's west edge,
// north of the Yards. Two clear visual languages for two crews:
//   Chinatown (east of x -460, the Triad's): red, jade and gold; shophouses with tiled pent eaves
//   and balconies, lantern strings across Jade Street (z -150) and the side streets, blade signs,
//   an original ceremonial gate (no inscription), a temple courtyard, a night-market lane.
//   Little Odessa (west of x -460, the mob's): teal and cream; onion domes on the church and the
//   bathhouse, social clubs and a deli with striped awnings, black sedans at the kerb, a velvet
//   rope at the members-only club. The freight viaduct runs down Odessa's west blocks' alley.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder } from '../buckets.js';
import { solid, glow, lightSpot, building, edgeGrapples, parkedCar } from '../cityBuilder.js';
import { trashBags } from '../streetDressing.js';
import { WEST, RECTS, LANDMARKS as L } from './westLayout.js';
import { slab, ground, paveStreets, block, kerb, parkCars, dressAlley, around, signPlane, grille, washingLine, lampAt } from './westKit.js';
import { fillSub, rooftopLinks, fireEscapeLite } from './westBlocks.js';
import { viaductSegment } from './parkRow.js';

export const CHINA_COLS = [[-566, -527], [-513, -467], [-453, -377], [-363, -317]];
export const CHINA_ROWS = [[-203, -157], [-143, -97], [-83, -37]];
const RED = 0xa8262e, JADE = 0x2e7a5e, GOLD = 0xe8c04a, TILE = 0x24493c, TEAL = 0x2f7f7a, CREAM = 0xe6dcc4;
const CN_SIGNS = ['WOK THIS WAY', 'PHO SHO', 'DIM SUM DIM SUM', 'LUCKY DUMPLING', 'JADE PALACE', 'NOODLE AROUND', 'HERBS & ROOTS', 'GOLDEN TEAPOT', 'KARAOKE', 'TEA HOUSE', 'BAO WOW', 'FORTUNE FAVOURS'];
const OD_SIGNS = ['BABUSHKA DELI', 'SAMOVAR TEA ROOM', 'BLACK SEA IMPORTS', 'TAILOR', 'PIROGI', 'BALALAIKA LOUNGE', 'BORSCHT BELT', 'NEVA BAKERY'];

export function buildChinatown(ctx) {
  const { rng } = ctx;
  const R = RECTS.chinatown;
  ground(ctx, R);
  slab(ctx, 'sidewalk', R.minX, 0, R.minZ, R.maxX, 0.15, -217, { tag: 'sidewalk' });
  const zCross = WEST.zSouth.map((z) => [z - 7, z + 7]);
  for (const [a, b] of around(-217, -37, zCross)) slab(ctx, 'sidewalk', -303, 0, a, -300, 0.15, b, { tag: 'sidewalk' });
  for (let x = -560; x < -305; x += 40) lampAt(ctx, x, 0.15, -224.6, 0, 1, PALETTE.sodium, { pole: 5.5 });

  const corridor = { ...L.viaduct.corridor, minZ: R.minZ, maxZ: R.maxZ };
  const special = [
    rectOf(L.church, 1), rectOf(L.bathhouse, 1), rectOf(L.temple, 0.5),
    { minX: L.temple.x - 13, maxX: L.temple.x + 13, minZ: L.temple.z + L.temple.d / 2, maxZ: -157 }, // the temple court
    { minX: -331, maxX: -319, minZ: -119, maxZ: -101 }, // the mahjong parlour
  ];
  for (const [x0, x1] of CHINA_COLS) {
    for (const [z0, z1] of CHINA_ROWS) {
      const b = { minX: x0, maxX: x1, minZ: z0, maxZ: z1 };
      const odessa = x1 < -460;
      const isTemple = x0 === -453 && z0 === -203, isMarket = x0 === -453 && z0 === -143;
      const isChurch = x0 === -513 && z0 === -203, isBaths = x0 === -513 && z0 === -143;
      const alleysX = isTemple || isMarket || isChurch || isBaths ? [] : [(x0 + x1) / 2];
      const alleysZ = isMarket ? [L.nightMarket.z] : [];
      const { subs, alleys } = block(ctx, b, { alleysX, alleysZ });
      const list = [];
      for (const sub of subs) {
        const faces = [];
        if (sub.minZ === b.minZ) faces.push('n');
        if (sub.maxZ === b.maxZ) faces.push('s');
        if (sub.minX === b.minX) faces.push('w');
        if (sub.maxX === b.maxX) faces.push('e');
        if (rng.chance(0.5)) faces.reverse();
        list.push(...fillSub(ctx, sub, faces, {
          depth: [11, 16], lot: odessa ? [11, 7] : [8, 5.5], floors: odessa ? [2, 4] : [3, 5],
          styles: odessa ? ['stone', 'brick', 'concrete'] : ['brick', 'brick', 'stone'],
          storefront: odessa ? 0.6 : 0.8, fireEscape: odessa ? 0.25 : 0.55, parapet: odessa, props: 'none',
          district: odessa ? 'littleOdessa' : 'chinatown', tag: odessa ? 'od' : 'ct', avoid: [corridor, ...special],
          onBuilt: (bb) => (odessa ? dressOdessa(ctx, bb) : dressShophouse(ctx, bb)),
        }));
      }
      if (isMarket) nightMarket(ctx, alleys[0]);
      else for (const a of alleys) dressAlley(ctx, a, { fence: rng.chance(0.15) ? rng.range(8, 20) : null });
      rooftopLinks(ctx, list, { planks: 0.45, lines: odessa ? 0.25 : 0.6, tanks: 0.3, coops: 0.1 });
      for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        kerb(ctx, b, nx, nz, 2, { trees: odessa });
        if (rng.chance(odessa ? 0.6 : 0.4)) parkCars(ctx, b, nx, nz, 1);
      }
      if (odessa && rng.chance(0.6)) blackSedan(ctx, b);
    }
  }
  paveStreets(ctx, { ...R, maxZ: R.maxZ - 1 }); // the -30 street is painted by the Yards
  gate(ctx);
  temple(ctx);
  mahjong(ctx);
  church(ctx);
  bathhouse(ctx);
  socialClub(ctx);
  lanternStrings(ctx);
  viaductSegment(ctx, R.minZ, R.maxZ, { startStop: false });
}

const rectOf = (b, pad = 0) => ({ minX: b.x - b.w / 2 - pad, maxX: b.x + b.w / 2 + pad, minZ: b.z - b.d / 2 - pad, maxZ: b.z + b.d / 2 + pad });
const faceOf = (b) => {
  const f = b.face;
  const nx = f === 'e' ? 1 : f === 'w' ? -1 : 0, nz = f === 's' ? 1 : f === 'n' ? -1 : 0;
  return { nx, nz, px: b.x + nx * b.w / 2, pz: b.z + nz * b.d / 2, width: nz ? b.w : b.d };
};

// A shophouse front: a tiled pent eave over the shops, a jade or red balcony rail on the first
// floor, a blade sign; now and then a tiled hip roof.
function dressShophouse(ctx, b) {
  const { rng } = ctx;
  const { nx, nz, px, pz, width } = faceOf(b);
  const along = { x: -nz, z: nx };
  const W = width - 0.6;
  const pent = box(nz ? W : 1.6, 0.18, nx ? W : 1.6, 0, 0, 0).rotateX(nz * 0.35).rotateZ(-nx * 0.35).translate(px + nx * 0.8, 5.0, pz + nz * 0.8);
  ctx.buckets.add('painted', pent, TILE);
  ctx.buckets.add('painted', box(nz ? W : 0.12, 0.14, nx ? W : 0.12, px + nx * 1.55, 4.72, pz + nz * 1.55), GOLD);
  if (b.h > 9) {
    const col = rng.pick([RED, JADE]);
    ctx.buckets.add('painted', box(nz ? W - 1 : 0.06, 0.9, nx ? W - 1 : 0.06, px + nx * 1.0, 7.75, pz + nz * 1.0), col);
    solid(ctx, 'painted', box(nz ? W - 1 : 1, 0.12, nx ? W - 1 : 1, px + nx * 0.5, 7.25, pz + nz * 0.5), { color: 0x3a2e24, tag: 'balcony' });
  }
  if (rng.chance(0.55)) {
    const text = rng.pick(CN_SIGNS);
    const t = rng.range(-W / 2 + 1, W / 2 - 1);
    signPlane(ctx, text, rng.pick([RED, GOLD, PALETTE.neonPink, 0x5fe0b0]), px + nx * 1.2 + along.x * t, 6.4 + rng.range(0, 3), pz + nz * 1.2 + along.z * t, nx, nz, 0.9, { vertical: rng.chance(0.4) });
  }
  if (rng.chance(0.25) && b.w > 7 && b.d > 7) hipRoof(ctx, b.x, b.z, b.w, b.d, b.h, rng.chance(0.5) ? TILE : 0x6e2a22);
  if (rng.chance(0.2)) trashBags(ctx, px + nx * 1.2, pz + nz * 1.2);
}

// A tiled hip roof with flared eaves (a low pyramid plus an eave skirt), walkable in steps.
export function hipRoof(ctx, x, z, w, d, y, color, rise = 2.4) {
  const g = new THREE.CylinderGeometry(0.4, Math.SQRT1_2 * 1.0, 1, 4, 1).rotateY(Math.PI / 4);
  g.scale(w + 1.2, rise, d + 1.2).translate(x, y + rise / 2 + 0.15, z);
  ctx.buckets.add('painted', g, color);
  ctx.buckets.add('painted', box(w + 1.6, 0.2, d + 1.6, x, y + 0.15, z), color);
  for (let k = 0; k < 3; k++) {
    const s = 1 - (k + 0.5) / 3.6;
    ctx.collision.addBox(x - w / 2 * s, y, z - d / 2 * s, x + w / 2 * s, y + 0.2 + rise * ((k + 1) / 3) * 0.85, z + d / 2 * s, 'roof');
  }
  ctx.buckets.add('painted', box(0.3, 0.3, d * 0.3, x, y + rise + 0.2, z), GOLD);
  ctx.grapple.push({ x, y: y + rise * 0.85 + 0.2, z, nx: 0, nz: 1, perch: true });
}

function dressOdessa(ctx, b) {
  const { rng } = ctx;
  const { nx, nz, px, pz, width } = faceOf(b);
  const along = { x: -nz, z: nx };
  if (b.storefront && rng.chance(0.5)) {
    const text = rng.pick(OD_SIGNS);
    signPlane(ctx, text, rng.pick([0x5fe0d0, GOLD, CREAM, PALETTE.neonPink]), px + nx * 0.3, 5.3, pz + nz * 0.3, nx, nz, 0.9);
    // Striped teal/cream awning.
    for (let k = 0; k < 4; k++) {
      const t = -1.5 + k;
      ctx.buckets.add('painted', box(nz ? 1 : 1.4, 0.08, nx ? 1 : 1.4, px + nx * 0.8 + along.x * t, 3.4, pz + nz * 0.8 + along.z * t), k % 2 ? CREAM : TEAL);
    }
  } else if (b.storefront && rng.chance(0.3)) grille(ctx, px, pz, nx, nz, Math.min(4, width - 1.5));
}

// Black sedans at the kerb of a mob block.
function blackSedan(ctx, b) {
  const { rng } = ctx;
  const x = rng.range(b.minX + 6, b.maxX - 6);
  const z = rng.chance(0.5) ? b.minZ - 2.2 : b.maxZ + 2.2;
  parkedCar(ctx, x, z, true);
  // Paint over it: parkedCar picks from the city's car colours; a second, black one behind.
  solid(ctx, 'painted', box(4.4, 0.8, 1.9, x + 5.4, 0.7, z), { color: 0x0e0f12 });
  ctx.buckets.add('painted', box(2.3, 0.65, 1.7, x + 5.4, 1.42, z), 0x0e0f12);
  ctx.buckets.add('glass', box(2.35, 0.45, 1.5, x + 5.4, 1.45, z));
}

// The ceremonial gate over Jade Street: two red columns on stone bases, beams, a gold board
// without an inscription, two tiers of green-tiled roofs with upturned ends. Its roof is a perch.
function gate(ctx) {
  const G = L.gate;
  const x = G.x, z0 = G.z - 8.6, z1 = G.z + 8.6, span = z1 - z0;
  for (const z of [z0, z1]) {
    solid(ctx, 'painted', box(1.4, 0.9, 1.4, x, 0.6, z), { color: 0x8c877d, tag: 'gateBase' });
    solid(ctx, 'painted', cylinder(0.42, 0.45, 8.2, x, 4.9, z, 10), { color: RED, tag: 'gateColumn' });
  }
  for (const [y, h] of [[7.2, 0.5], [8.6, 0.6]]) ctx.buckets.add('painted', box(0.7, h, span + 1.6, x, y, G.z), RED);
  ctx.buckets.add('painted', box(0.3, 1.2, 5, x, 7.9, G.z), GOLD);
  ctx.buckets.add('painted', box(0.34, 0.9, 4.4, x, 7.9, G.z), RED);
  // Two roof tiers with upturned ends.
  for (const [y, len, dep] of [[9.4, span + 4, 3.2], [10.8, span - 2, 2.6]]) {
    const roof = new THREE.CylinderGeometry(0.2, 1, 1, 4, 1).rotateY(Math.PI / 4).scale(dep / Math.SQRT2, 1.1, len / Math.SQRT2).translate(x, y + 0.55, G.z);
    ctx.buckets.add('painted', roof, TILE);
    ctx.buckets.add('painted', box(dep + 0.4, 0.25, len, x, y, G.z), TILE);
    for (const s of [-1, 1]) ctx.buckets.add('painted', new THREE.ConeGeometry(0.35, 1.3, 4).rotateX(s * 1.0).translate(x, y + 0.5, G.z + s * (len / 2 + 0.2)), GOLD);
  }
  ctx.collision.addBox(x - 1.6, 9.2, z0 - 2, x + 1.6, 11.6, z1 + 2, 'gateRoof');
  edgeGrapples(ctx, x, G.z, 3.2, span + 4, 11.6, 4);
  for (const z of [z0, z1]) {
    ctx.halos.add(x + 0.9, 6.4, z, 0xff5a3a, 3.2);
    glow(ctx, cylinder(0.32, 0.32, 0.6, x + 0.9, 6.4, z, 8), 0xd83a2a);
  }
  lightSpot(ctx, x, 6, G.z, 0xff7a4a, 24, 18);
}

// The temple: a hall with a two-tier hip roof and red porch columns behind a walled courtyard on
// Jade Street (incense burner, lanterns, a pair of stone lions as blocks).
function temple(ctx) {
  const T = L.temple;
  building(ctx, { id: 'temple', x: T.x, z: T.z, w: T.w, d: T.d, h: 6.8, style: 'stone', roof: 'flat', parapet: false, cornice: false, storefront: false, tiers: [], props: 'none', neon: [], district: 'chinatown' });
  hipRoof(ctx, T.x, T.z, T.w, T.d, 6.8, TILE, 1.6);
  solid(ctx, 'painted', box(T.w * 0.6, 2.2, T.d * 0.6, T.x, 9.6, T.z), { color: RED, tag: 'templeUpper' });
  hipRoof(ctx, T.x, T.z, T.w * 0.6, T.d * 0.6, 10.7, TILE, 2.2);
  const fz = T.z + T.d / 2;
  for (let k = -3; k <= 3; k++) solid(ctx, 'painted', cylinder(0.3, 0.3, 4.8, T.x + k * 4, 2.55, fz + 1.4, 8), { color: RED, tag: 'column' });
  ctx.buckets.add('painted', box(T.w, 0.4, 3, T.x, 5.1, fz + 1.4), TILE);
  glow(ctx, box(6, 2.4, 0.1, T.x, 2.2, fz + 0.06), 0xd89a4a);
  // Courtyard walls (2.4 m) with a gap onto Jade Street.
  const cz0 = fz + 3, cz1 = -158.5, cx0 = T.x - 13, cx1 = T.x + 13;
  for (const x of [cx0, cx1]) solid(ctx, 'painted', box(0.5, 2.4, cz1 - cz0, x, 1.35, (cz0 + cz1) / 2), { color: 0x8a3a30, tag: 'wall' });
  for (const [a, b] of around(cx0, cx1, [[T.x - 3, T.x + 3]])) solid(ctx, 'painted', box(b - a, 2.4, 0.5, (a + b) / 2, 1.35, cz1), { color: 0x8a3a30, tag: 'wall' });
  for (const s of [-1, 1]) {
    solid(ctx, 'painted', box(1, 1.4, 1.4, T.x + s * 4, 0.85, cz1 - 1.2), { color: 0x8c877d, tag: 'lion' });
    ctx.buckets.add('painted', box(0.7, 0.8, 0.9, T.x + s * 4, 1.9, cz1 - 1.3), 0x8c877d);
  }
  solid(ctx, 'painted', cylinder(0.8, 0.6, 1.2, T.x, 0.75, (cz0 + cz1) / 2, 10), { color: 0x6a5a3a, tag: 'burner' });
  ctx.steam.push({ x: T.x, y: 1.5, z: (cz0 + cz1) / 2, s: 0.7 });
  for (const s of [-1, 1]) {
    glow(ctx, cylinder(0.35, 0.35, 0.7, T.x + s * 9, 3.6, fz + 2.6, 8), 0xd83a2a);
    ctx.halos.add(T.x + s * 9, 3.6, fz + 2.6, 0xff5a3a, 2.6);
  }
  signPlane(ctx, 'TEMPLE OF THE QUIET HOUR', GOLD, T.x, 3.2, cz1 + 0.3, 0, 1, 0.5, { back: true });
}

// The night-market lane through the big block: stalls both sides, lanterns overhead.
function nightMarket(ctx, a) {
  const { rng } = ctx;
  const cols = [RED, JADE, GOLD, 0x8a3e6e, 0x3a6a9a];
  for (let x = a.minX + 4; x < a.maxX - 3; x += 4.2) {
    for (const s of [-1, 1]) {
      if (rng.chance(0.2)) continue;
      const z = s < 0 ? a.minZ - 1.2 : a.maxZ + 1.2;
      solid(ctx, 'wood', box(2.6, 0.9, 1.4, x, 0.6, z), { tag: 'stall' });
      ctx.buckets.add('painted', box(3, 0.08, 2, x, 2.5, z - s * 0.2).rotateX(0), rng.pick(cols));
      for (const dx of [-1.3, 1.3]) ctx.buckets.add('wood', box(0.07, 2.3, 0.07, x + dx, 1.3, z - s * 0.9));
      if (rng.chance(0.5)) ctx.steam.push({ x, y: 1.3, z, s: 0.5 });
    }
  }
  for (let x = a.minX + 3; x < a.maxX - 3; x += 7) {
    washingLine(ctx, { x, y: 5.4, z: a.minZ - 2 }, { x: x + 2, y: 5.6, z: a.maxZ + 2 }, { items: 0 });
    glow(ctx, cylinder(0.25, 0.25, 0.45, x + 1, 5.0, (a.minZ + a.maxZ) / 2, 8), 0xd83a2a);
  }
  for (const x of [a.minX + 12, (a.minX + a.maxX) / 2, a.maxX - 12]) ctx.halos.add(x, 4.6, (a.minZ + a.maxZ) / 2, 0xff6a3a, 6);
  lightSpot(ctx, (a.minX + a.maxX) / 2, 4, (a.minZ + a.maxZ) / 2, 0xff7a4a, 24, 20);
  signPlane(ctx, 'NIGHT MARKET', GOLD, a.maxX - 0.4, 6.2, (a.minZ + a.maxZ) / 2 + 3.5, 1, 0, 1.1);
}

// The mahjong parlour (the Triad's front): a narrow shophouse with frosted windows and a jade sign.
function mahjong(ctx) {
  const b = { id: 'mahjong', x: -325, z: -110, w: 10, d: 16, h: 13.6, style: 'brick', roof: 'flat', parapet: false, cornice: true, storefront: false, tiers: [], props: 'none', neon: [], district: 'chinatown', face: 'e' };
  building(ctx, b);
  fireEscapeLite(ctx, b, 'n', { drop: true });
  ctx.buckets.add('painted', box(0.1, 2.5, 1.6, -319.95, 1.4, -110), 0x1a1210);
  ctx.buckets.add('glow', box(0.08, 1.6, 4, -319.97, 1.8, -105), 0x3a6a5a);
  signPlane(ctx, 'MAHJONG', 0x5fe0b0, -319.8, 5.4, -110, 1, 0, 1.2, { vertical: true });
  hipRoof(ctx, b.x, b.z, b.w, b.d, b.h, 0x6e2a22);
}

// The onion-dome church: a cream nave, a drum and a big teal dome, two smaller domes, gold tips.
function church(ctx) {
  const C = L.church;
  building(ctx, { id: 'odessaChurch', x: C.x, z: C.z, w: C.w, d: C.d, h: C.h, style: 'stone', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'none', neon: [], district: 'littleOdessa' });
  const dome = (x, z, y, r, drumH) => {
    solid(ctx, 'painted', cylinder(r * 0.75, r * 0.75, drumH, x, y + drumH / 2, z, 12), { color: CREAM, tag: 'drum' });
    const g = new THREE.SphereGeometry(r, 12, 8).scale(1, 1.25, 1).translate(x, y + drumH + r * 0.9, z);
    ctx.buckets.add('painted', g, TEAL);
    ctx.buckets.add('painted', new THREE.ConeGeometry(r * 0.35, r * 1.4, 8).translate(x, y + drumH + r * 2.4, z), TEAL);
    ctx.buckets.add('painted', cylinder(0.06, 0.06, 1.8, x, y + drumH + r * 3.4, z, 4), GOLD);
    // [polish2] A gold collar where the dome sits on its drum, a gold orb under the spike, and
    // dark arched lights round the drum.
    ctx.buckets.add('painted', cylinder(r * 0.82, r * 0.82, 0.28, x, y + drumH + 0.06, z, 12), GOLD);
    ctx.buckets.add('painted', new THREE.SphereGeometry(r * 0.13, 8, 6).translate(x, y + drumH + r * 3.12, z), GOLD);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
      ctx.buckets.add('painted', box(r * 0.2, drumH * 0.55, 0.1, 0, 0, 0).rotateY(a).translate(x + Math.sin(a) * r * 0.75, y + drumH * 0.5, z + Math.cos(a) * r * 0.75), 0x2a2620);
    }
    ctx.collision.addBox(x - r * 0.7, y, z - r * 0.7, x + r * 0.7, y + drumH + r * 1.8, z + r * 0.7, 'dome');
    ctx.grapple.push({ x, y: y + drumH + r * 1.8, z, nx: 0, nz: 1, perch: true });
    ctx.halos.add(x, y + drumH + r * 3.4 + 1, z, GOLD, 2.2);
    ctx.facades.push({ minX: x - r, minY: y, minZ: z - r, maxX: x + r, maxY: y + drumH + r * 2.6, maxZ: z + r, style: 'stone' });
  };
  // [polish2] The domes own the district's skyline now (polish list: "Odessa domes small"): the
  // great dome half as big again on a taller drum, and four lesser ones at the corners (there
  // were two, at the front, 1.8 m in radius).
  dome(C.x, C.z, C.h, 6.3, 5.5);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) dome(C.x + sx * (C.w / 2 - 3.4), C.z + sz * (C.d / 2 - 3.4), C.h, 2.9, 2.6);
  const fz = C.z + C.d / 2;
  ctx.buckets.add('painted', box(3, 4, 0.12, C.x, 2.15, fz + 0.06), 0x3a2a1c);
  glow(ctx, box(1.6, 1.6, 0.08, C.x, 8.5, fz + 0.06), 0xd8b46a);
  lightSpot(ctx, C.x, 6, fz + 3, 0xe8c48a, 20, 16);
}

// The Odessa baths: a low cream bathhouse with two small onion domes, steam from roof vents.
function bathhouse(ctx) {
  const B = L.bathhouse;
  building(ctx, { id: 'odessaBaths', x: B.x, z: B.z, w: B.w, d: B.d, h: B.h, style: 'stone', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'none', neon: [], district: 'littleOdessa' });
  for (const s of [-1, 1]) {
    const x = B.x + s * (B.w / 2 - 3), z = B.z + B.d / 2 - 3;
    // [polish2] the baths' pair, half as big again, with gold collars and tips
    solid(ctx, 'painted', cylinder(2.1, 2.1, 2.2, x, B.h + 1.1, z, 10), { color: CREAM, tag: 'drum' });
    ctx.buckets.add('painted', cylinder(2.3, 2.3, 0.22, x, B.h + 2.2, z, 10), GOLD);
    ctx.buckets.add('painted', new THREE.SphereGeometry(2.9, 10, 7).scale(1, 1.3, 1).translate(x, B.h + 4.9, z), TEAL);
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.9, 2.8, 8).translate(x, B.h + 9.2, z), TEAL);
    ctx.buckets.add('painted', cylinder(0.05, 0.05, 1.4, x, B.h + 11.2, z, 4), GOLD);
    ctx.grapple.push({ x, y: B.h + 2.2, z, nx: 0, nz: 1, perch: true });
  }
  for (let k = 0; k < 4; k++) ctx.steam.push({ x: B.x - 9 + k * 6, y: B.h + 0.5, z: B.z - 5, s: 1.2 });
  for (let k = 0; k < 4; k++) solid(ctx, 'steel', cylinder(0.3, 0.3, 1.2, B.x - 9 + k * 6, B.h + 0.6, B.z - 5, 8));
  const fz = B.z + B.d / 2;
  ctx.buckets.add('painted', box(2.6, 2.8, 0.12, B.x, 1.55, fz + 0.06), 0x2a3a3a);
  signPlane(ctx, 'ODESSA BATHS', 0x5fe0d0, B.x, 5.2, fz + 0.2, 0, 1, 1.1);
  signPlane(ctx, 'SCHVITZ 24 HRS', CREAM, B.x + 9, 3.2, fz + 0.2, 0, 1, 0.5, { back: false });
}

// The members-only social club on the -520 street (the mob's front): a canopy, a velvet rope.
function socialClub(ctx) {
  const x = -535, z = -60;
  building(ctx, { id: 'volgaClub', x, z, w: 10, d: 18, h: 10.2, style: 'stone', roof: 'flat', parapet: true, cornice: true, storefront: false, tiers: [], props: 'auto', neon: [], district: 'littleOdessa' });
  const fx = x + 5;
  ctx.buckets.add('painted', box(0.1, 2.5, 1.6, fx + 0.05, 1.4, z), 0x1a1214);
  ctx.buckets.add('painted', box(2.4, 0.2, 3.6, fx + 1.2, 3.1, z), 0x1d2a2a);
  for (const dz of [-1.2, 1.2]) ctx.buckets.add('steel', cylinder(0.05, 0.08, 1, fx + 1.5, 0.65, z + dz, 6));
  ctx.buckets.add('painted', box(0.08, 0.08, 2.4, fx + 1.5, 1, z), 0x8a1a2a);
  signPlane(ctx, 'VOLGA SOCIAL CLUB', GOLD, fx + 0.15, 4.4, z, 1, 0, 0.7);
  signPlane(ctx, 'MEMBERS ONLY', CREAM, fx + 0.15, 2.0, z + 2.6, 1, 0, 0.35, { back: false });
}

// Lantern strings across Jade Street and the side streets: ink lines with red lanterns.
function lanternStrings(ctx) {
  const { rng } = ctx;
  for (let x = -450; x < -318; x += 9) {
    const y = 6.5 + rng.range(-0.4, 0.4);
    washingLine(ctx, { x, y, z: -160 }, { x: x + rng.range(-2, 2), y, z: -140 }, { items: 0 });
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      glow(ctx, cylinder(0.24, 0.24, 0.42, x, y - 0.4 - Math.sin(t * Math.PI) * 1.0, -160 + 20 * t, 8), k % 2 ? 0xd83a2a : 0xe8a03a);
    }
    if ((x + 450) % 27 === 0) ctx.halos.add(x, y - 1, -150, 0xff5a3a, 5);
  }
  for (const zc of [-90, -210]) {
    for (let x = -448; x < -320; x += 14) {
      const y = 6.8;
      washingLine(ctx, { x, y, z: zc - 10 }, { x, y, z: zc + 10 }, { items: 0 });
      for (let k = 1; k < 4; k++) glow(ctx, cylinder(0.22, 0.22, 0.4, x, y - 0.4 - Math.sin((k / 4) * Math.PI) * 0.9, zc - 10 + 20 * (k / 4), 8), 0xd83a2a);
    }
  }
}
