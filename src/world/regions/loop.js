// The Loop, rows 2-5 (workstream H): the dense downtown north of the proof region's first row, to
// the region's north edge at z -600. Square 60 m blocks on the core's street lines, no alleys
// (deliveries come up from Lower Gotham's lower deck), canyon streets 1:5-1:8.
//
// Landmarks (all original designs, research 3.2): Wayne Tower (a bundled-tube shaft with a gothic
// lantern crown and gargoyles, 184 m to the crown, mast above) on its plaza inside the El; the
// Gotham Exchange closing the x -150 canyon with Justice on top; City Hall's dome and colonnade;
// the County Courthouse; the Herald's neo-gothic tower; a 140 m stepped black tower; the Public
// Library; the Gazette's new offices; Marquee Row's theatres under the El's north leg; two diners.
// The El itself is built by el.js; the street graph lives in loopStreets.js.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, tiledBox, cylinder, prism, createBuckets } from '../buckets.js';
import { solid, glow, lightSpot, edgeGrapples, building, streetLamp, parkedCar } from '../cityBuilder.js';
import { hydrant, newsBoxes, trashCan, mailbox, manhole, puddle, trafficLight, trashBags, phoneBooth, bench } from '../streetDressing.js';
import { addGargoyle, plinth } from '../gargoyles.js';
import { addBeaconMesh } from '../beaconGlow.js';
import { addLadder, addZipline } from '../climbables.js';
import { LOOP, LOOP_COLUMNS, LOOP_ROWS, stairZones, inStairZone } from './loopLayout.js';
import { slab, railing, dashes, crosswalk, signPlane, colonnade, dome, statue, flagpole, busShelter, newsstand, avenueTree, STONE, BRONZE } from './loopKit.js';

const D = 'loop';
// A vertex colour on a loose geometry (the far scene's glow mesh reads it).
function tint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const col = (c) => LOOP_COLUMNS.find((k) => k.c === c);
const row = (c) => LOOP_ROWS.find((k) => k.c === c);

// A building record with the Loop's defaults (flat roof, parapet, cornice unless steel).
function rec(id, x, z, w, d, h, style, extra = {}) {
  return { id, x, z, w, d, h, style, roof: 'flat', parapet: true, cornice: style !== 'steel', storefront: false, tiers: [], props: 'auto', neon: [], district: D, ...extra };
}

// Chicago-school ledges: a projecting band every third floor on the long faces (stand on it, catch
// it), with grapple points along it (riverfront.js has the same for the first row).
function chicagoLedges(ctx, b, faces = ['n', 's']) {
  for (let y = 3.4 * 4; y < b.h - 6; y += 3.4 * 3) {
    for (const f of faces) {
      const nz = f === 'n' ? -1 : f === 's' ? 1 : 0, nx = f === 'e' ? 1 : f === 'w' ? -1 : 0;
      if (nz) {
        const z = b.z + nz * (b.d / 2 + 0.3);
        solid(ctx, 'trim', box(b.w + 0.8, 0.3, 0.6, b.x, y, z), { tag: 'ledge' });
        for (let t = -b.w / 2 + 4; t < b.w / 2; t += 8) ctx.grapple.push({ x: b.x + t, y: y + 0.15, z, nx: 0, nz });
      } else {
        const x = b.x + nx * (b.w / 2 + 0.3);
        solid(ctx, 'trim', box(0.6, 0.3, b.d + 0.8, x, y, b.z), { tag: 'ledge' });
        for (let t = -b.d / 2 + 4; t < b.d / 2; t += 8) ctx.grapple.push({ x, y: y + 0.15, z: b.z + t, nx, nz: 0 });
      }
    }
  }
}

// Gargoyles on plinths at the four corners of a footprint at height y, facing out.
function cornerGargoyles(ctx, x, z, w, d, y) {
  const hw = w / 2 - 0.7, hd = d / 2 - 0.7;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    plinth(ctx, x + sx * hw, y, z + sz * hd);
    addGargoyle(ctx, x + sx * hw, y + 0.9, z + sz * hd, Math.atan2(sx, sz));
  }
}

// Cool-white floodlights washing a setback from its corners (the money districts' look).
function floodlights(ctx, x, z, w, d, y, color = PALETTE.windowCool, size = 8) {
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = x + sx * (w / 2 - 1.2), pz = z + sz * (d / 2 - 1.2);
    ctx.halos.add(px, y + 1.2, pz, color, size);
    glow(ctx, box(0.5, 0.4, 0.5, px, y + 1.1, pz), color);
  }
}

// A tower made of a record plus the usual Loop extras.
function tower(ctx, b, { gargoyles = false, crown = false, ledges = false, beacon = false } = {}) {
  building(ctx, b);
  let top = b.h;
  for (const t of b.tiers) top += t.h;
  if (gargoyles) cornerGargoyles(ctx, b.x, b.z, b.w, b.d, b.h);
  if (crown) floodlights(ctx, b.x, b.z, b.w, b.d, b.h);
  if (ledges) chicagoLedges(ctx, b, typeof ledges === 'object' ? ledges : ['n', 's']);
  if (beacon) {
    ctx.halos.add(b.x, top + 3, b.z, PALETTE.crimson, 3.5);
    ctx.blinkers.push({ i: ctx.halos.count - 1, size: 3.5, phase: b.x * 0.013 + b.z * 0.007 });
  }
  return top;
}

// ---------------------------------------------------------------------------------------------
// Landmarks
// ---------------------------------------------------------------------------------------------

// Wayne Tower: nine 10 m tubes in a 3 x 3 bundle stepping up to the centre (104 / 120 / 134 /
// 168 m), dark glass with stone gargoyles at every setback, and a gothic lantern crown: four
// pinnacles, tracery fins round a lit glass lantern, a pyramid cap (184 m) and a 20 m mast. Its
// plaza has an original red steel sculpture, flagpoles, benches and trees; a lit glass lobby on
// the south face (the door site) and a roof site on the crown's lantern deck.
export const WAYNE = { x: 0, z: -449, tube: 10, heights: [[104, 134, 104], [120, 168, 120], [104, 134, 104]], crownTop: 198, mastTop: 216 };
const WAYNE_GOLD = 0xf6dfa0, WAYNE_COOL = 0xcfe2f2, VERDIGRIS = 0x6f978c;
// [polish] The crown and the lit signature (W monograms, setback bands, spire rings) also go to
// the far scene (farLandmarks.js extras), so Wayne Tower reads on the skyline from every district,
// and the crown's painted pieces are one detail mesh drawn to the full draw distance (a chunk's
// far LOD is plain boxes: without this the crown vanished between lodDistance and drawDistance).
function wayneTower(ctx) {
  const { x: X, z: Z, tube: T, heights } = WAYNE;
  const far = (ctx.world.farShapes ??= { solid: [], glow: [] });
  const crown = createBuckets(ctx.materials, { region: ctx.region });
  const beacon = [];
  const lit = (geo, color) => { far.glow.push(tint(geo.clone(), color)); beacon.push(tint(geo, color)); };
  const stone = (geo, color = STONE) => { far.solid.push(geo.clone()); crown.add('painted', geo, color); };
  const hAt = (i, j) => (i < 0 || i > 2 || j < 0 || j > 2 ? 0 : heights[j][i]);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const h = heights[j][i];
    const x = X + (i - 1) * T, z = Z + (j - 1) * T;
    building(ctx, rec(`wayneTube${i}${j}`, x, z, T, T, h, 'deco', { parapet: true, cornice: false, props: 'none', landmark: true }));
    // Bronze cap band at each tube top (catches the floodlight), and a lit seam up each outward
    // corner: the bundle's lines read from anywhere in the city at night.
    ctx.buckets.add('painted', box(T + 0.3, 0.8, T + 0.3, x, h - 0.4, z), BRONZE);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = x + sx * (T / 2 + 0.15), cz = z + sz * (T / 2 + 0.15);
      const outward = Math.abs(cx - X) > T * 0.9 || Math.abs(cz - Z) > T * 0.9;
      if (outward) lit(box(0.4, h - 6, 0.3, cx, 3 + (h - 6) / 2, cz), WAYNE_COOL);
    }
    // [polish] A lit band under the cap on every face that stands clear of its neighbour: each
    // setback is a bright step at night, so the stepped bundle reads as Wayne Tower's.
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (hAt(i + nx, j + nz) >= h) continue;
      const fx = x + nx * (T / 2 + 0.08), fz = z + nz * (T / 2 + 0.08);
      // Proud of the face by 0.35 m: at 300 m a thinner gap z-fights with the wall.
      lit(box(nx ? 0.3 : T + 0.6, 0.9, nz ? 0.3 : T + 0.6, fx + nx * 0.3, h - 1.8, fz + nz * 0.3), WAYNE_COOL);
    }
  }
  // Gargoyles on the setbacks: the four corner tubes' outer corners and the mid tubes' faces.
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const gx = X + sx * (1.5 * T - 0.8), gz = Z + sz * (1.5 * T - 0.8);
    plinth(ctx, gx, 104, gz);
    addGargoyle(ctx, gx, 104.9, gz, Math.atan2(sx, sz));
  }
  for (const [sx, sz, h] of [[0, -1, 134], [0, 1, 134], [-1, 0, 120], [1, 0, 120]]) {
    const gx = X + sx * (1.5 * T - 0.8), gz = Z + sz * (1.5 * T - 0.8);
    plinth(ctx, gx, h, gz);
    addGargoyle(ctx, gx, h + 0.9, gz, Math.atan2(sx, sz));
  }
  for (const [h, w, d, dx, dz] of [[104, 30, 30, 0, 0], [134, 10, 30, 0, 0], [120, 30, 10, 0, 0]]) floodlights(ctx, X + dx, Z + dz, w, d, h, PALETTE.windowCool, 9);
  // [polish] The signature: a lit W monogram on each face of the centre shaft above the
  // setbacks (148-157 m), between two gold crown bands.
  // The monogram stands 0.5 m proud of the face on a dark plate (readable, and no z-fighting at range).
  const off = T / 2 + 0.55;
  const W_PTS = [[-3.7, 157.4], [-1.85, 148.4], [0, 154.4], [1.85, 148.4], [3.7, 157.4]];
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    // Face-local u (left to right seen from outside) in world terms.
    const ux = nz ? nz : 0, uz = nx ? -nx : 0;
    const yaw = Math.atan2(nx, nz);
    for (let k = 0; k < 4; k++) {
      const [u0, y0] = W_PTS[k], [u1, y1] = W_PTS[k + 1];
      const len = Math.hypot(u1 - u0, y1 - y0) + 0.7;
      const um = (u0 + u1) / 2;
      const g = box(len, 1.0, 0.3, 0, 0, 0).rotateZ(Math.atan2(y1 - y0, u1 - u0)).rotateY(yaw)
        .translate(X + nx * off + ux * um, (y0 + y1) / 2, Z + nz * off + uz * um);
      lit(g, WAYNE_GOLD);
    }
    ctx.buckets.add('painted', box(nx ? 0.4 : T - 0.6, 12.4, nz ? 0.4 : T - 0.6, X + nx * (T / 2 + 0.2), 152.9, Z + nz * (T / 2 + 0.2)), 0x14171d);
    lit(box(nx ? 0.4 : T + 0.8, 0.9, nz ? 0.4 : T + 0.8, X + nx * (off - 0.1), 160.4, Z + nz * (off - 0.1)), WAYNE_GOLD);
    lit(box(nx ? 0.4 : T + 0.8, 0.5, nz ? 0.4 : T + 0.8, X + nx * (off - 0.1), 146.3, Z + nz * (off - 0.1)), WAYNE_GOLD);
  }
  ctx.halos.add(X, 153, Z + T / 2 + 1.5, WAYNE_GOLD, 10);
  ctx.halos.add(X, 153, Z - T / 2 - 1.5, WAYNE_GOLD, 10);
  // ---- the crown on the centre tube ----
  const y0 = 168, cx = X, cz = Z;
  // Stone collar.
  solid(ctx, 'painted', box(T + 1.2, 1.2, T + 1.2, cx, y0 + 0.6, cz), { color: STONE, tag: 'roof' });
  // Lantern: lit glass core with stone tracery fins (three per face), a deck round it.
  const LH = 11;
  lit(box(6, LH, 6, cx, y0 + 1.2 + LH / 2, cz), 0xd8e8f8);
  ctx.collision.addBox(cx - 3, y0 + 1.2, cz - 3, cx + 3, y0 + 1.2 + LH, cz + 3, 'building');
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (const t of [-2.2, 0, 2.2]) {
      const fx = cx + nx * 3.15 + (nz ? t : 0), fz = cz + nz * 3.15 + (nx ? t : 0);
      stone(box(nx ? 0.5 : 0.35, LH + 1.5, nz ? 0.5 : 0.35, fx, y0 + 1.2 + (LH + 1.5) / 2, fz));
    }
    // Pointed gables over each face.
    stone(prism(6.6, 3.6, 0.6, 0, 0, 0).rotateY(nz ? 0 : Math.PI / 2).translate(cx + nx * 3.2, y0 + 1.2 + LH + 0.2, cz + nz * 3.2));
  }
  // Four corner pinnacles on the collar (perches), each a buttress shaft with a tall spire, and a
  // flying buttress leaning in to the lantern's shoulder.
  const PH = 11;
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const px = cx + sx * (T / 2), pz = cz + sz * (T / 2);
    solid(ctx, 'painted', box(1.4, PH, 1.4, px, y0 + 1.2 + PH / 2, pz), { color: STONE, tag: 'pinnacle' });
    stone(new THREE.ConeGeometry(0.95, 8, 4).rotateY(Math.PI / 4).translate(px, y0 + 1.2 + PH + 4, pz));
    const by0 = y0 + 1.2 + PH - 1.5, bx1 = cx + sx * 3, bz1 = cz + sz * 3, by1 = y0 + 1.2 + LH - 0.5;
    dir.set(bx1 - px, by1 - by0, bz1 - pz);
    const blen = dir.length();
    q.setFromUnitVectors(up, dir.normalize());
    stone(box(0.5, blen, 0.5, 0, 0, 0).applyQuaternion(q).translate((px + bx1) / 2, (by0 + by1) / 2, (pz + bz1) / 2));
    ctx.grapple.push({ x: px, y: y0 + 1.2 + PH, z: pz, nx: sx * 0.7, nz: sz * 0.7, perch: true });
    ctx.halos.add(px, y0 + 1.5, pz, PALETTE.windowCool, 6);
  }
  // A tall verdigris spire over the lantern, ringed with three lit bands, and the mast.
  const capY = y0 + 1.2 + LH + 0.4, SH = WAYNE.crownTop - capY, R = 4.8;
  stone(new THREE.ConeGeometry(R, SH, 4).rotateY(Math.PI / 4).translate(cx, capY + SH / 2, cz), VERDIGRIS);
  for (const f of [0.12, 0.36, 0.6]) {
    const hw = R * Math.SQRT1_2 * (1 - f) + 0.12, y = capY + SH * f;
    for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lit(box(nx ? 0.2 : hw * 2, 0.45, nz ? 0.2 : hw * 2, cx + nx * hw, y, cz + nz * hw), WAYNE_GOLD);
  }
  ctx.halos.add(cx, capY + 2, cz, 0xd8e8f8, 9);
  ctx.collision.addBox(cx - 2.6, capY, cz - 2.6, cx + 2.6, capY + 6, cz + 2.6, 'roof');
  const mast = cylinder(0.25, 0.45, WAYNE.mastTop - WAYNE.crownTop + 2, cx, (WAYNE.crownTop + WAYNE.mastTop) / 2, cz, 8);
  far.solid.push(mast.clone());
  crown.add('steel', mast);
  ctx.halos.add(cx, WAYNE.mastTop + 0.5, cz, PALETTE.crimson, 6);
  ctx.blinkers.push({ i: ctx.halos.count - 1, size: 6, phase: 0.3 });
  ctx.halos.add(cx, y0 + 1.2 + LH / 2, cz, 0xd8e8f8, 16);
  // The lit signature through the fog, and the crown's painted pieces as their own mesh, both
  // drawn out to the full draw distance.
  addBeaconMesh(ctx, beacon, 'wayneBeacon');
  for (const m of crown.flush(ctx.scene)) {
    const bb = m.geometry.boundingBox;
    ctx.chunks.addDetail(m, { minX: bb.min.x, minY: bb.min.y, minZ: bb.min.z, maxX: bb.max.x, maxY: bb.max.y, maxZ: bb.max.z }, 'draw');
    m.userData.chunk = 'detail';
  }
  // ---- lobby (south face) ----
  const fz = Z + 1.5 * T; // south face z
  glow(ctx, box(12, 7, 0.2, X, 3.65, fz + 0.12), 0xe8d8a8);
  for (let t = -6; t <= 6; t += 2) ctx.buckets.add('painted', box(0.18, 7.2, 0.3, X + t, 3.75, fz + 0.22), BRONZE);
  ctx.buckets.add('painted', box(13, 0.6, 0.4, X, 7.55, fz + 0.25), BRONZE);
  ctx.buckets.add('painted', box(16, 0.35, 5, X, 8.4, fz + 2.5), 0x23262d); // canopy
  ctx.collision.addBox(X - 8, 8.2, fz, X + 8, 8.6, fz + 5, 'roof');
  signPlane(ctx, 'WAYNE TOWER', X, 9.4, fz + 0.3, 0, 1, { height: 1.1, color: '#f2e2b0', panel: 0x1a1c20 });
  lightSpot(ctx, X, 6, fz + 3, 0xe8d8a8, 26, 16);
  ctx.reflect.push({ x: X, y: 0.16, z: fz + 3, h: 7, color: 0xe8d8a8, w: 3, len: 7, k: 0.25 });
  // ---- plaza ----
  // Red steel sculpture: three leaning plates meeting in an arch (original), a perch on top.
  const sx0 = X + 18, sz0 = Z + 17;
  for (const [a, l] of [[0.5, 9], [-0.6, 8.5], [2.2, 7]]) {
    const g = box(0.5, l, 1.4, 0, 0, 0).rotateZ(0.42).rotateY(a).translate(sx0 + Math.sin(a) * 1.6, l / 2 * Math.cos(0.42), sz0 + Math.cos(a) * 1.6);
    ctx.buckets.add('painted', g, 0xb8342c);
  }
  ctx.collision.addBox(sx0 - 1.2, 0, sz0 - 1.2, sx0 + 1.2, 7.4, sz0 + 1.2, 'sculpture');
  ctx.grapple.push({ x: sx0, y: 7.4, z: sz0, nx: 0, nz: 1, perch: true });
  for (const t of [-9, 0, 9]) {
    solid(ctx, 'steel', cylinder(0.1, 0.14, 14, X + t, 7.15, fz + 6.5, 8), { tag: 'flagpole' });
    ctx.buckets.add('painted', box(0.04, 1.6, 2.6, X + t, 12.8, fz + 6.5 - 1.35), t ? 0x2c3f6e : 0x7a2430);
    ctx.grapple.push({ x: X + t, y: 14.2, z: fz + 6.5, nx: 0, nz: 1, perch: true });
  }
  for (const [bx, bz, nx, nz] of [[-18.5, 6, -1, 0], [-18.5, -6, -1, 0], [18.5, -6, 1, 0], [-6, -18.5, 0, -1], [6, -18.5, 0, -1]]) bench(ctx, X + bx, Z + bz, nx, nz);
  for (const [tx, tz] of [[-19, 19], [-19, -19], [19, -19], [19, 8]]) avenueTree(ctx, X + tx, Z + tz);
}

// Gotham Exchange: a deco setback tower closing the x -150 canyon, floodlit, a lit clock on its
// face, a stepped pyramid roof and a 12 m bronze Justice (original statue) on top.
function exchange(ctx) {
  const r = row(-566);
  const x = -150, z = (r.z0 + 3) + (r.z1 - 3.5 - (r.z0 + 3)) / 2, d = r.z1 - 3.5 - (r.z0 + 3);
  const b = rec('gothamExchange', x, z, 56, d, 56, 'deco', { landmark: true, props: 'none', tiers: [{ w: 40, d: d - 8, h: 22 }, { w: 26, d: 18, h: 14 }, { w: 14, d: 12, h: 8 }] });
  const top = tower(ctx, b, { gargoyles: true });
  floodlights(ctx, x, z, 40, d - 8, 56 + 22, PALETTE.windowCool, 9);
  floodlights(ctx, x, z, 26, 18, 56 + 22 + 14, 0xe8d8a8, 7);
  // Stepped pyramid and the statue.
  ctx.buckets.add('painted', new THREE.ConeGeometry(9.5, 6, 4).rotateY(Math.PI / 4).translate(x, top + 3, z), 0x6f8f86);
  ctx.collision.addBox(x - 3, top, z - 3, x + 3, top + 4.5, z + 3, 'roof');
  statue(ctx, x, top + 4.5, z, 6, 0, { color: 0x6a8a62, scales: true });
  ctx.halos.add(x, top + 10, z + 4, 0xe8d8a8, 12);
  // Clock face and the name over a tall lit entrance on the canyon side.
  const fz = z + d / 2;
  glow(ctx, new THREE.CylinderGeometry(3.2, 3.2, 0.2, 24).rotateX(Math.PI / 2).translate(x, 44, fz + 0.12), 0xf2e6c8);
  ctx.buckets.add('painted', box(0.3, 2.6, 0.12, x, 44.9, fz + 0.3), 0x1a1c20);
  ctx.buckets.add('painted', box(2.0, 0.3, 0.12, x + 0.8, 44, fz + 0.3), 0x1a1c20);
  ctx.halos.add(x, 44, fz + 0.8, 0xf2e6c8, 7);
  glow(ctx, box(8, 10, 0.2, x, 5.2, fz + 0.12), 0xe8d8a8);
  for (let t = -4; t <= 4; t += 2) ctx.buckets.add('painted', box(0.4, 10.4, 0.5, x + t, 5.3, fz + 0.3), STONE);
  signPlane(ctx, 'GOTHAM EXCHANGE', x, 12.2, fz + 0.3, 0, 1, { height: 1.4, color: '#f2e2b0', panel: 0x1c1a16 });
  lightSpot(ctx, x, 7, fz + 3, 0xe8d8a8, 26, 18);
  // A maintenance ladder up the east side to the first setback (the climb).
  addLadder(ctx.climbables, { x: x + 28.3, z: z + 4, nx: 1, nz: 0, bottom: 0.15, top: 56 });
  for (let k = 0; k < 56; k += 0.3) ctx.buckets.add('steel', box(0.04, 0.04, 0.5, x + 28.35, k + 0.3, z + 4));
  for (const s of [-1, 1]) ctx.buckets.add('steel', box(0.05, 56, 0.05, x + 28.35, 28, z + 4 + s * 0.25));
}

// City Hall: a stone block with a colonnade and steps facing the x 150 street, a pediment, and a
// green dome on a drum. The steps are a crime site (protests, a hostage stand-off).
function cityHall(ctx) {
  const c = col(180), r = row(-449);
  const x0 = c.x0 + 8, x1 = c.x1 - 3, z0 = r.z0 + 3, z1 = r.z1 - 3;
  const b = rec('cityHall', (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 26, 'stone', { props: 'none', landmark: true });
  tower(ctx, b);
  chicagoLedges(ctx, b, ['w']);
  // Podium and steps on the west, columns, entablature, pediment.
  const PY = 1.35;
  slab(ctx, 'painted', c.x0 + 2.6, 0, z0 + 4, x0, PY, z1 - 4, { tag: 'podium', color: 0xbdb6a6 });
  for (let k = 0; k < 4; k++) slab(ctx, 'painted', c.x0 + 0.6 + k * 0.5, 0, z0 + 6, c.x0 + 1.1 + k * 0.5, PY * (k + 1) / 5, z1 - 6, { tag: 'step', color: 0xbdb6a6 });
  const pts = [];
  for (let zz = z0 + 6; zz <= z1 - 6 + 1e-6; zz += (z1 - z0 - 12) / 7) pts.push([x0 - 2.2, zz]);
  colonnade(ctx, pts, PY, 14);
  slab(ctx, 'painted', x0 - 3.4, PY + 14, z0 + 4.5, x0 + 0.2, PY + 16.2, z1 - 4.5, { tag: 'roof', color: 0xcfc8b8 });
  ctx.buckets.add('painted', prism(z1 - z0 - 9, 4.2, 3.6, 0, 0, 0).rotateY(Math.PI / 2).translate(x0 - 1.6, PY + 16.2, (z0 + z1) / 2), 0xcfc8b8);
  signPlane(ctx, 'CITY HALL', x0 - 3.45, PY + 15.1, (z0 + z1) / 2, -1, 0, { height: 1.7, color: '#f2e2b0', panel: null });
  edgeGrapples(ctx, x0 - 1.6, (z0 + z1) / 2, 3.6, z1 - z0 - 9, PY + 16.2, 6);
  glow(ctx, box(0.2, 6, 5, x0 + 0.12, PY + 3, (z0 + z1) / 2), 0xe8d8a8);
  lightSpot(ctx, x0 - 4, 6, (z0 + z1) / 2, 0xe8d8a8, 22, 16);
  for (const zz of [z0 + 6, z1 - 6]) ctx.halos.add(x0 - 4, PY + 1, zz, PALETTE.windowCool, 7);
  // Dome.
  const top = dome(ctx, b.x, 26, b.z, 8, 6);
  ctx.halos.add(b.x, top + 0.5, b.z, PALETTE.crimson, 3);
  ctx.blinkers.push({ i: ctx.halos.count - 1, size: 3, phase: 1.7 });
  floodlights(ctx, b.x, b.z, b.w, b.d, 26, 0xe8d8a8, 7);
}

// County Courthouse: stone, six columns on the west front, a pediment; Justice's sister building.
function courthouse(ctx) {
  const c = col(180), r = row(-389);
  const x0 = c.x0 + 6, x1 = c.x1 - 3, z0 = r.z0 + 3, z1 = r.z1 - 3;
  const b = rec('courthouse', (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, 30, 'stone', { props: 'auto' });
  tower(ctx, b, { gargoyles: true });
  const pts = [];
  for (let zz = z0 + 8; zz <= z1 - 8 + 1e-6; zz += (z1 - z0 - 16) / 5) pts.push([x0 - 2, zz]);
  slab(ctx, 'painted', c.x0 + 1.5, 0, z0 + 6, x0, 0.9, z1 - 6, { tag: 'podium', color: 0xbdb6a6 });
  colonnade(ctx, pts, 0.9, 13, { r: 0.5 });
  slab(ctx, 'painted', x0 - 3, 13.9, z0 + 6.5, x0 + 0.2, 15.6, z1 - 6.5, { tag: 'roof', color: 0xcfc8b8 });
  ctx.buckets.add('painted', prism(z1 - z0 - 13, 3.4, 3.2, 0, 0, 0).rotateY(Math.PI / 2).translate(x0 - 1.4, 15.6, (z0 + z1) / 2), 0xcfc8b8);
  signPlane(ctx, 'GOTHAM COUNTY COURTHOUSE', x0 - 3.05, 14.75, (z0 + z1) / 2, -1, 0, { height: 0.8, color: '#f2e2b0', panel: null });
  glow(ctx, box(0.2, 5, 4, x0 + 0.12, 3.4, (z0 + z1) / 2), 0xe8d8a8);
}

// The Herald's tower (neo-gothic newspaper): a stone shaft with ledges, a setback, an octagonal
// glass lantern ringed by flying-buttress fins and pinnacles, and a spire.
function heraldTower(ctx) {
  const c = col(-60), r = row(-389);
  const x = c.c, z = r.c - 1;
  const b = rec('heraldTower', x, z, 34, 34, 66, 'stone', { props: 'none', landmark: true, storefront: true, tiers: [{ w: 24, d: 24, h: 14 }] });
  tower(ctx, b, { gargoyles: true, ledges: ['n', 's', 'e', 'w'] });
  const y0 = 80;
  glow(ctx, cylinder(6.2, 6.2, 10, x, y0 + 5, z, 8), 0xe8d8b0);
  ctx.collision.addBox(x - 4.5, y0, z - 4.5, x + 4.5, y0 + 10, z + 4.5, 'building');
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const fx = x + Math.cos(a) * 6.6, fz = z + Math.sin(a) * 6.6;
    ctx.buckets.add('painted', box(0.6, 12, 0.6, fx, y0 + 6, fz), STONE);
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.5, 3, 4).translate(fx, y0 + 13.5, fz), STONE);
    // Flying buttress from the tier's edge up to the lantern.
    const bx = x + Math.cos(a) * 10.5, bz = z + Math.sin(a) * 10.5;
    const g = box(0.5, 0.6, 5.2, 0, 0, 0).rotateX(-0.9).rotateY(Math.PI / 2 - a).translate((fx + bx) / 2, y0 + 2.4, (fz + bz) / 2);
    ctx.buckets.add('painted', g, STONE);
    ctx.grapple.push({ x: fx, y: y0 + 12, z: fz, nx: Math.cos(a), nz: Math.sin(a), perch: true });
  }
  ctx.buckets.add('painted', new THREE.ConeGeometry(6.4, 4, 8).translate(x, y0 + 12, z), 0x5a5650);
  ctx.collision.addBox(x - 3, y0 + 10, z - 3, x + 3, y0 + 12, z + 3, 'roof');
  ctx.buckets.add('painted', new THREE.ConeGeometry(1.4, 14, 8).translate(x, y0 + 21, z), STONE);
  ctx.halos.add(x, y0 + 5, z, 0xe8d8b0, 12);
  floodlights(ctx, x, z, 24, 24, 80, 0xe8d8a8, 6);
  signPlane(ctx, 'THE GOTHAM HERALD', x, 62, z + 17.4, 0, 1, { height: 1.8, color: '#f2e2b0', panel: 0x1c1a16 });
}

// The Public Library: red brick, tall arched windows, a green glass pitched roof, owls (gargoyles)
// on the corners.
function library(ctx) {
  const c = col(60), r = row(-509);
  const b = rec('library', c.c, r.c, 40, 40, 28, 'brick', { props: 'none', roof: 'pitched', parapet: false });
  building(ctx, b);
  cornerGargoyles(ctx, b.x, b.z, 40, 40, 28);
  for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (let t = -14; t <= 14; t += 7) {
      const wx = b.x + nx * 20.1 + (nz ? t : 0), wz = b.z + nz * 20.1 + (nx ? t : 0);
      glow(ctx, box(nz ? 3 : 0.1, 6, nx ? 3 : 0.1, wx, 7, wz), 0xc89a52);
      glow(ctx, cylinder(1.5, 1.5, 0.1, 0, 0, 0, 12, false).rotateX(Math.PI / 2).rotateY(nx ? Math.PI / 2 : 0).translate(wx, 10, wz), 0xc89a52);
      ctx.buckets.add('painted', box(nz ? 3.6 : 0.3, 0.3, nx ? 3.6 : 0.3, wx + nx * 0.1, 3.8, wz + nz * 0.1), STONE);
    }
  }
  signPlane(ctx, 'GOTHAM PUBLIC LIBRARY', b.x, 15, b.z + 20.2, 0, 1, { height: 1.2, color: '#f2e2b0', panel: 0x3a1c18 });
  signPlane(ctx, 'QUIET PLEASE. THE BAT IS READING.', b.x, 1.6, b.z - 20.2, 0, -1, { height: 0.5, color: '#e8ecef', panel: 0x1a1c20 });
}

// A theatre on Marquee Row: brick or deco hall, a lit marquee over the sidewalk (original show
// titles), a vertical blade with the house name, posters by the doors.
function theatre(ctx, cx, style, h, show, house, color) {
  const r = row(-566);
  const z0 = r.z0 + 3, z1 = r.z1 - 3.5;
  const b = rec(`theatre${cx}`, cx, (z0 + z1) / 2, 40, z1 - z0, h, style, {
    props: 'auto', neon: [
      { text: show, face: 's', y: 5.6, color: PALETTE.window, mode: 'marquee' },
      { text: house, face: 's', y: 8.5, color, vertical: true, mode: 'blade', offset: -14 },
    ],
  });
  building(ctx, b);
  // Poster cases either side, three lobby doors in brass frames under a lit transom.
  for (const t of [-8, 8]) glow(ctx, box(1.6, 2.4, 0.1, cx + t, 1.6, z1 + 0.08), 0x8a5a6a);
  for (const t of [-2.2, 0, 2.2]) {
    glow(ctx, box(1.6, 2.3, 0.1, cx + t, 1.3, z1 + 0.08), 0xb8864a);
    ctx.buckets.add('painted', box(0.12, 2.5, 0.16, cx + t - 0.86, 1.4, z1 + 0.1), BRONZE);
  }
  ctx.buckets.add('painted', box(0.12, 2.5, 0.16, cx + 3.16, 1.4, z1 + 0.1), BRONZE);
  glow(ctx, box(6.4, 0.5, 0.1, cx, 2.9, z1 + 0.08), 0xf2d89a);
}

// A diner: a one-storey box with a long lit window, a neon name, a chrome band.
function diner(ctx, x, z, w, d, face, name, color) {
  const b = rec(`diner${x}`, x, z, w, d, 5.5, 'brick', { props: 'none', cornice: false, neon: [{ text: name, face, y: 3.6, color, mode: 'flat' }] });
  building(ctx, b);
  const f = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] }[face];
  const fx = x + f[0] * (w / 2 + 0.06), fz = z + f[1] * (d / 2 + 0.06);
  glow(ctx, box(f[1] ? w - 2 : 0.1, 1.3, f[0] ? d - 2 : 0.1, fx, 1.9, fz), 0xf2d89a);
  ctx.buckets.add('painted', box(f[1] ? w + 0.2 : 0.14, 0.3, f[0] ? d + 0.2 : 0.14, fx, 3.0, fz), 0xc8ccd2);
  ctx.reflect.push({ x: fx + f[0] * 0.4, y: 0.16, z: fz + f[1] * 0.4, h: 2, color: 0xf2d89a, w: 2.4, len: 5, k: 0.3 });
  lightSpot(ctx, fx + f[0] * 2, 2.5, fz + f[1] * 2, 0xf2d89a, 16, 10);
}

// ---------------------------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------------------------

// Standard footprint: 3 m of sidewalk all round (the El stairs land on it).
function fp(c, r, { inset = 3, south = inset, north = inset } = {}) {
  const C = col(c), R = row(r);
  const x0 = C.x0 + inset, x1 = C.x1 - (c === 226 ? 2 : inset), z0 = R.z0 + north, z1 = R.z1 - south;
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
function std(ctx, c, r, h, style, extra = {}, opts = {}) {
  const f = fp(c, r, opts.fp);
  const b = rec(`loop${c}_${r}`, f.x, f.z, opts.w ?? f.w, opts.d ?? f.d, h, style, extra);
  return { b, top: tower(ctx, b, opts) };
}

export function buildLoop(ctx) {
  const { rng } = ctx;
  const X0 = LOOP.minX, X1 = LOOP.maxX, Z0 = LOOP.minZ, Z1 = LOOP.rowSouthZ;
  // Ground: asphalt over rows 2-5 (the proof row has its own), sidewalks per block.
  ctx.buckets.add('asphalt', tiledBox(X1 - X0, 0.2, Z1 - Z0, (X0 + X1) / 2, -0.1, (Z0 + Z1) / 2, { uvScale: [17, 17], faces: [2] }));
  ctx.collision.addBox(X0, -1, Z0, X1, 0, Z1, 'road');
  const blocks = [];
  for (const R of LOOP_ROWS) for (const C of LOOP_COLUMNS) {
    // The Exchange's block spans the canyon street's end.
    if (R.c === -566 && C.c === -120) continue;
    const x0 = C.x0, x1 = R.c === -566 && C.c === -180 ? col(-120).x1 : C.x1;
    blocks.push({ x0, x1, z0: R.z0, z1: R.z1, c: C.c, r: R.c });
    slab(ctx, 'sidewalk', x0, 0, R.z0, x1, 0.15, R.z1, { tag: 'sidewalk' });
  }
  // The canyon street's last stretch (between row 5's two halves) is paved over as the Exchange's
  // forecourt: no road to fall into there.

  // ---- row 2 (z -412..-366) ----
  // The west corner: a diner on the corner, a walk-up behind it across a 3 m gangway.
  diner(ctx, -253, -375, 14, 10, 's', 'NITE OWL DINER', 0xff6a5a);
  tower(ctx, rec('loopWalkup', -232, -392, 22, 34, 30, 'brick', { fireEscape: 'e', storefront: true }));
  std(ctx, -180, -389, 62, 'deco', { storefront: true, tiers: [{ w: 30, d: 30, h: 14 }, { w: 20, d: 20, h: 10 }] }, { gargoyles: true, crown: true });
  std(ctx, -120, -389, 58, 'stone', { storefront: true }, { ledges: true, beacon: true });
  heraldTower(ctx);
  std(ctx, 0, -389, 44, 'stone', { storefront: true }, { fp: { south: 6 }, ledges: true });
  std(ctx, 60, -389, 70, 'steel', { props: 'none', cornice: false }, { w: 32, d: 32, beacon: true });
  std(ctx, 120, -389, 48, 'deco', { storefront: true, tiers: [{ w: 28, d: 28, h: 16 }, { w: 16, d: 16, h: 10, spire: true }] }, { crown: true });
  courthouse(ctx);
  std(ctx, 226, -389, 36, 'stone', {}, {});

  // ---- row 3 (z -472..-426) ----
  // Two buildings with a 5 m alley between them (a fight space off the canal promenade).
  tower(ctx, rec('loopWarehouseW', -251, -449, 18, 40, 26, 'brick', { fireEscape: 'e' }));
  tower(ctx, rec('loopOfficeW', -229.5, -449, 15, 40, 40, 'concrete', {}));
  std(ctx, -180, -449, 76, 'deco', { storefront: true, tiers: [{ w: 30, d: 30, h: 16 }, { w: 18, d: 18, h: 12 }] }, { gargoyles: true, crown: true });
  std(ctx, -120, -449, 70, 'stone', { storefront: true }, { ledges: true });
  std(ctx, -60, -449, 54, 'concrete', { storefront: true }, {});
  wayneTower(ctx);
  std(ctx, 60, -449, 60, 'deco', { storefront: true, tiers: [{ w: 28, d: 28, h: 14 }, { w: 18, d: 18, h: 10 }] }, { crown: true });
  std(ctx, 120, -449, 46, 'stone', { storefront: true }, { ledges: true });
  cityHall(ctx);
  std(ctx, 226, -449, 44, 'deco', {}, {});

  // ---- row 4 (z -532..-486) ----
  const black = std(ctx, -240, -509, 70, 'steel', { props: 'none', cornice: false, landmark: true, tiers: [{ w: 28, d: 28, h: 40 }, { w: 16, d: 16, h: 30 }] }, { beacon: true });
  for (const s of [-1, 1]) ctx.buckets.add('steel', cylinder(0.3, 0.45, 18, black.b.x + s * 4, black.top + 9, black.b.z, 8));
  std(ctx, -180, -509, 84, 'stone', { storefront: true }, { ledges: true, beacon: true });
  std(ctx, -120, -509, 90, 'deco', { storefront: true, tiers: [{ w: 30, d: 30, h: 14 }, { w: 20, d: 20, h: 12 }, { w: 12, d: 12, h: 8, spire: true }] }, { gargoyles: true, crown: true });
  std(ctx, -60, -509, 40, 'stone', { storefront: true }, {});
  const gz = std(ctx, 0, -509, 48, 'concrete', { storefront: true, billboard: { face: 's', text: 'GOTHAM GAZETTE', sub: 'WE PRINT WHAT THE BAT LEAVES BEHIND' } }, { fp: { north: 3.5 } });
  signPlane(ctx, 'GOTHAM GAZETTE', gz.b.x, 6.2, gz.b.z + gz.b.d / 2 + 0.2, 0, 1, { height: 1.0, color: '#f2e2b0', panel: 0x1c1a16 });
  library(ctx);
  std(ctx, 120, -509, 64, 'steel', { props: 'none', cornice: false }, { w: 36, d: 36 });
  std(ctx, 180, -509, 46, 'stone', { storefront: true }, { ledges: true });
  std(ctx, 226, -509, 40, 'concrete', {}, {});

  // ---- row 5 (z -586..-546): Marquee Row and the Exchange ----
  std(ctx, -240, -566, 28, 'brick', { fireEscape: 's', billboard: { face: 'e', text: 'BLACKGATE', sub: "YOU'LL NEVER WANT TO LEAVE. (YOU CAN'T.)" } }, { fp: { south: 3.5 } });
  exchange(ctx);
  theatre(ctx, -60, 'brick', 24, 'GUYS & GOONS', 'NOCTURNE', PALETTE.neonPink);
  theatre(ctx, 0, 'deco', 30, 'LES MISERABATS', 'GRAND GOTHIC', 0xe8c070);
  theatre(ctx, 60, 'stone', 26, 'HAMLET II: STILL DANISH', 'ALCAZAR', PALETTE.neonCyan);
  diner(ctx, 106, -556, 14, 10, 's', 'DOGS - NO KETCHUP', 0xf2c04a);
  tower(ctx, rec('loopLofts', 131.5, -566.25, 17, 33.5, 22, 'brick', { fireEscape: 'e' }));
  std(ctx, 180, -566, 50, 'deco', { storefront: true, tiers: [{ w: 28, d: 24, h: 12 }] }, { crown: true, fp: { south: 3.5 } });
  std(ctx, 226, -566, 34, 'stone', {}, { fp: { south: 3.5 } });

  // ---- streets: lamps, paint, furniture ----
  const lights = [];
  const stairs = stairZones();
  for (const B of blocks) {
    const e = 0.8;
    for (const [lx, lz, nx, nz] of [[B.x0 + e, B.z0 + e, 0, -1], [B.x1 - e, B.z0 + e, 1, 0], [B.x1 - e, B.z1 - e, 0, 1], [B.x0 + e, B.z1 - e, -1, 0]]) {
      if (lx < X0 + 2 || lx > X1 - 1) continue;
      if (inStairZone(stairs, lx, lz)) continue;
      streetLamp(ctx, lx, lz, nx, nz);
    }
    // Kerbside furniture along the long faces.
    for (const [z, nz] of [[B.z0 + 0.8, -1], [B.z1 - 0.8, 1]]) {
      for (let k = 0; k < 2; k++) {
        const px = rng.range(B.x0 + 4, B.x1 - 4);
        const rr = rng.next();
        if (inStairZone(stairs, px, z)) continue;
        if (rr < 0.25) hydrant(ctx, px, z);
        else if (rr < 0.45) trashCan(ctx, px, z);
        else if (rr < 0.6) mailbox(ctx, px, z, 0, nz);
        else if (rr < 0.8) newsBoxes(ctx, px, z, 0, nz);
        else trashBags(ctx, px, z - nz * 0.6);
      }
    }
    if (rng.chance(0.5)) parkedCar(ctx, rng.range(B.x0 + 6, B.x1 - 6), B.z0 - 1.3, true);
  }
  // Bus shelters, newsstands and phone booths at the busy corners.
  // (Rows run south to north: a row's z0 edge is its north kerb, z1 its south kerb.)
  busShelter(ctx, -136, -410.6, 0, -1);
  busShelter(ctx, 46, -487.4, 0, 1);
  busShelter(ctx, -60, -530.4, 0, -1);
  newsstand(ctx, -50, -427.3, 0, 1);
  newsstand(ctx, -122, -530.7, 0, -1);
  newsstand(ctx, 170, -427.3, 0, 1);
  phoneBooth(ctx, 39, -470, -1, 0);
  phoneBooth(ctx, -100, -487.5, 0, 1);
  phoneBooth(ctx, -200, -410.5, 0, -1);
  // Lane paint and crossings.
  const zl = LOOP.zLines.slice(1);
  for (const z of zl) dashes(ctx, true, X0 + 4, X1 - 4, z, { skip: LOOP.xLines });
  for (const x of LOOP.xLines) {
    const endZ = x === LOOP.canyonX ? LOOP.canyonEndZ : LOOP.zLines[LOOP.zLines.length - 1];
    dashes(ctx, false, endZ, Z1, x, { skip: LOOP.zLines });
    for (const z of LOOP.zLines.slice(1)) {
      if (x === LOOP.canyonX && z < LOOP.canyonEndZ) continue;
      crosswalk(ctx, x, z + 8.6, false, 10);
      crosswalk(ctx, x - 8.6, z, true, 10);
      manhole(ctx, x + rng.range(-3, 3), z + rng.range(-3, 3));
    }
  }
  for (let k = 0; k < 40; k++) puddle(ctx, rng.range(X0 + 4, X1 - 4), 0.018, rng.pick(zl) + rng.range(-5, 5), rng.range(1.4, 3.6));
  // Traffic lights on the canyon and at City Hall.
  for (const [x, z] of [[-150, -419], [-150, -479], [150, -419], [150, -479], [-30, -539], [30, -539]]) lights.push(trafficLight(ctx, x + 6.8, z + 8.4, 0, -1, (x * 0.13 + z * 0.07) % 1));
  ctx.updaters.push((t) => {
    for (const L of lights) {
      const c = ((t / 12 + L.phase) % 1 + 1) % 1 * 12;
      const on = c < 5 ? 2 : c < 6.5 ? 1 : 0;
      L.ids.forEach((id, k) => ctx.halos.setSize(id, k === on ? 1.6 : 0.01));
      ctx.halos.setSize(L.walk, on === 0 && Math.floor(t * 2) % 2 ? 0.9 : 0.01);
    }
  });
  // The west edge: a promenade railing on the North Branch side, open where streets meet it.
  const openings = LOOP.zLines.slice(1).map((z) => [z - 7, z + 7]);
  let s0 = Z0;
  for (const [a, b] of openings.sort((p, q) => p[0] - q[0])) { railing(ctx, false, s0, Math.max(s0, a), X0 + 0.4, 0); s0 = b; }
  railing(ctx, false, s0, Z1, X0 + 0.4, 0);
  // Steam from the Lower Gotham vents under the canyon.
  for (const [x, z] of [[-150, -440], [-150, -500], [0, -479], [90, -400], [-90, -520]]) ctx.steam.push({ x, y: 0.2, z, s: 1.3 });

  // ---- rooftop routes: zip lines across the canyon and down Marquee Row ----
  addZipline(ctx.climbables, { x: -168, y: 63.2, z: -400 }, { x: -132, y: 58.6, z: -400 });
  addZipline(ctx.climbables, { x: -132, y: 70.6, z: -460 }, { x: -168, y: 76.4, z: -460 });
  addZipline(ctx.climbables, { x: -42, y: 25, z: -560 }, { x: -18, y: 30.4, z: -560 });
  addZipline(ctx.climbables, { x: 18, y: 30.4, z: -560 }, { x: 42, y: 26.4, z: -560 });
}
