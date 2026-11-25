// Wayne Manor, exterior only (Long Night 2, workstream H): a gothic-revival house of our own
// design on the highest ground in Bristol. A long gravel drive from crested gates (no letter on
// the crest: a tower between two stars) to a forecourt with a fountain; the main block with its
// gabled east front and porch, a tall north-east tower, north and south wings, a conservatory
// and a terrace over the cliff, clustered chimneys; gardens with hedges and statues to the west,
// a garage block, a greenhouse, and the boathouse on the lake below. The doors, the study window,
// the grandfather-clock passage and the cave mouth are registered sites (regions/data.js) for the
// interior workstream; nothing here is hollow.
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';
import { box, cylinder, tiledBox } from '../buckets.js';
import { solid, glow, lightSpot, edgeGrapples } from '../cityBuilder.js';
import { addLadder } from '../climbables.js';
import { createBoat } from '../../vehicles/vehicleModels.js';
import { parkedFleetCar } from '../parkedCars.js';
import { BRISTOL, bristolHeight } from './bristolLayout.js';
import { block, house, pitchedRoof, chimneyStack, stoneWall, gatePiers, lampPost, lantern, STONE, DARK_STONE, IRON, LIME, SLATE } from './hillBuild.js';

const ground = bristolHeight;
const F = BRISTOL.plateau + 0.6; // the ground floor, three steps above the lawn
const HEDGE = 0x24331f, GOLD = 0xb89a52, GLASS = 0x8fb2c8, WARM = PALETTE.window;

export function buildWayneManor(ctx, keepOut) {
  keepOut.push({ minX: -472, maxX: -334, minZ: -780, maxZ: -704 });
  house_(ctx);
  forecourt(ctx);
  gates(ctx);
  garageBlock(ctx);
  gardens(ctx);
  boathouse(ctx);
}

const md = { district: 'wayneManor' };

function house_(ctx) {
  // Main block: three storeys, a steep slate roof, ridge north-south.
  house(ctx, ground, { ...md, x: -400, z: -745, w: 22, d: 42, h: 13, y: F, style: 'stone', ridge: 'z', rise: 9, chimneys: [[-6, -14], [6, -14], [-6, 12], [6, 12]], id: 'manorMain', plinth: DARK_STONE });
  // Wings: north and south, two storeys, ridges east-west.
  house(ctx, ground, { ...md, x: -422, z: -769, w: 22, d: 18, h: 9, y: F, style: 'stone', ridge: 'x', rise: 6.5, chimneys: [[-8, 0]], id: 'manorNorth' });
  house(ctx, ground, { ...md, x: -422, z: -723, w: 22, d: 14, h: 9, y: F, style: 'stone', ridge: 'x', rise: 6, chimneys: [[-8, 0]], id: 'manorSouth' });
  // String courses at the floor lines and pale quoins at the main block's corners.
  for (const yy of [F + 4.3, F + 8.6]) ctx.buckets.add('painted', box(22.5, 0.3, 42.5, -400, yy, -745), LIME);
  for (const [qx, qz] of [[-411, -766], [-389, -766], [-411, -724], [-389, -724]]) {
    for (let k = 0; k < 9; k++) ctx.buckets.add('painted', box(k % 2 ? 0.9 : 1.3, 0.7, k % 2 ? 1.3 : 0.9, qx, F + 0.6 + k * 1.45, qz), LIME);
  }
  // The east front: three gabled bays, the middle one the porch.
  for (const bz of [-758, -732]) gableBay(ctx, -389, bz, 7, 13, 5);
  gableBay(ctx, -389, -745, 8, 15, 5.5);
  // Porch: a pointed arch over the front door, a crest, lanterns, steps down to the gravel.
  block(ctx, -387.6, F - 0.6, -749, -383.2, F + 7, -741, STONE, { tag: 'building' });
  ctx.facades.push({ minX: -387.6, minY: F, minZ: -749, maxX: -383.2, maxY: F + 7, maxZ: -741, style: 'stone' });
  pitchedRoof(ctx, -385.4, F + 7, -745, 4.4, 8, 3.2, { alongX: true, color: SLATE });
  ctx.buckets.add('painted', box(0.12, 4.2, 2.6, -383.12, F + 2.1, -745), 0x120c0a);
  ctx.buckets.add('painted', new THREE.CylinderGeometry(1.3, 1.3, 0.14, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(-383.12, F + 4.2, -745), 0x120c0a);
  ctx.buckets.add('painted', box(0.1, 3.2, 1.5, -383.05, F + 1.6, -745), 0x3a2416); // the door
  crest(ctx, -383.0, F + 5.6, -745, Math.PI / 2, 0.9);
  for (const s of [-1, 1]) lantern(ctx, -382.9, F + 3.1, -745 + s * 1.9, WARM, 2.4);
  for (let k = 0; k < 3; k++) block(ctx, -383.2 + k * 0.6, F - 0.6 - (k + 1) * 0.2 + 0.2, -747.5, -382.6 + k * 0.6, F - k * 0.2, -742.5, LIME, { tag: 'step' });
  lightSpot(ctx, -381, F + 2.5, -745, WARM, 22, 14);
  // The north-east tower: 26 m of stone, crenellations, corner pinnacles and a lead spire.
  const tx = -388.5, tz = -766.5, tw = 7.5, th = 26;
  block(ctx, tx - tw / 2, F - 0.6, tz - tw / 2, tx + tw / 2, F + th, tz + tw / 2, STONE, { tag: 'building' });
  ctx.buckets.add('facade_stone', tiledBox(tw + 0.02, th, tw + 0.02, tx, F + th / 2, tz, { uvScale: [24, 54.4], uOffset: 0.3, faces: [0, 1, 4, 5] }));
  ctx.facades.push({ minX: tx - tw / 2, minY: F, minZ: tz - tw / 2, maxX: tx + tw / 2, maxY: F + th, maxZ: tz + tw / 2, style: 'stone' });
  for (const yy of [F + 9, F + 17.5]) ctx.buckets.add('painted', box(tw + 0.5, 0.4, tw + 0.5, tx, yy, tz), LIME);
  const top = F + th;
  for (let k = 0; k < 4; k++) {
    for (let m = 0; m < 4; m++) {
      const t = -tw / 2 + 0.6 + m * ((tw - 1.2) / 3);
      const [mx, mz] = [[t, -tw / 2 + 0.3], [t, tw / 2 - 0.3], [-tw / 2 + 0.3, t], [tw / 2 - 0.3, t]][k];
      solid(ctx, 'painted', box(0.7, 1.1, 0.7, tx + mx, top + 0.55, tz + mz), { color: STONE, tag: 'parapet' });
    }
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    ctx.buckets.add('painted', new THREE.ConeGeometry(0.45, 2.6, 4).rotateY(Math.PI / 4).translate(tx + sx * (tw / 2 - 0.3), top + 2.4, tz + sz * (tw / 2 - 0.3)), STONE);
  }
  solid(ctx, 'painted', new THREE.ConeGeometry(tw * 0.42, 9, 8).translate(tx, top + 4.5, tz), { color: 0x3c4448, tag: 'roof' });
  ctx.buckets.add('painted', cylinder(0.06, 0.06, 2.4, tx, top + 10, tz, 6), IRON);
  edgeGrapples(ctx, tx, tz, tw - 0.6, tw - 0.6, top, 2.4);
  // Lit windows: the tower's top room, the study (main block, upper floor, east), the hall.
  for (const [nx, nz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
    glow(ctx, box(Math.abs(nz) ? 1.2 : 0.08, 2.4, Math.abs(nx) ? 1.2 : 0.08, tx + nx * (tw / 2 + 0.04), F + 21, tz + nz * (tw / 2 + 0.04)), 0xd89a48);
    ctx.halos.add(tx + nx * (tw / 2 + 0.4), F + 21, tz + nz * (tw / 2 + 0.4), WARM, 2.6);
  }
  glow(ctx, box(0.08, 2.2, 1.6, -388.92, F + 4.4 + 2.2, -757), 0xe0a850);
  ctx.halos.add(-388.4, F + 6.6, -757, WARM, 2.4);
  for (const wz of [-737, -753]) { glow(ctx, box(0.08, 2.2, 1.4, -388.92, F + 2.0, wz), 0xd8983e); ctx.halos.add(-388.5, F + 2, wz, WARM, 2); }
  // Gargoyles watching the drive from the main block's east eaves.
  // (Perches; the cornice is wide enough to land on.)
  for (const gz of [-764, -726]) ctx.grapple.push({ x: -388.6, y: F + 13, z: gz, nx: 1, nz: 0, perch: true });
  // The conservatory: iron and glass on a stone base, lit from inside, against the south wing.
  const cx = -422, cz = -711.5, cw = 16, cd = 9;
  block(ctx, cx - cw / 2, F - 0.6, cz - cd / 2, cx + cw / 2, F + 0.8, cz + cd / 2, STONE, { tag: 'building' });
  ctx.collision.addBox(cx - cw / 2, F + 0.8, cz - cd / 2, cx + cw / 2, F + 5, cz + cd / 2, 'building');
  ctx.facades.push({ minX: cx - cw / 2, minY: F, minZ: cz - cd / 2, maxX: cx + cw / 2, maxY: F + 5, maxZ: cz + cd / 2, style: 'steel' });
  ctx.buckets.add('glass', box(cw - 0.2, 4.2, cd - 0.2, cx, F + 2.9, cz));
  for (let x = cx - cw / 2; x <= cx + cw / 2 + 0.01; x += 1.6) ctx.buckets.add('painted', box(0.08, 4.3, cd + 0.05, x, F + 2.95, cz), 0xd8d4c8);
  ctx.buckets.add('painted', box(cw + 0.05, 0.1, cd + 0.05, cx, F + 5.05, cz), 0xd8d4c8);
  const roofG = new THREE.Shape();
  roofG.moveTo(-cd / 2, 0); roofG.lineTo(cd / 2, 0); roofG.lineTo(0, 2.4); roofG.lineTo(-cd / 2, 0);
  ctx.buckets.add('glass', new THREE.ExtrudeGeometry(roofG, { depth: cw, bevelEnabled: false }).translate(0, 0, -cw / 2).rotateY(Math.PI / 2).translate(cx, F + 5.1, cz));
  ctx.collision.addBox(cx - cw / 2, F + 5, cz - cd * 0.3, cx + cw / 2, F + 6.6, cz + cd * 0.3, 'roof');
  ctx.grapple.push({ x: cx, y: F + 6.6, z: cz, nx: 0, nz: 1, perch: true });
  glow(ctx, box(cw - 1, 0.1, cd - 1, cx, F + 4.9, cz), 0x6a7a4a);
  for (let k = 0; k < 6; k++) ctx.buckets.add('painted', new THREE.IcosahedronGeometry(0.8, 0).translate(cx - 6 + k * 2.4, F + 1.6, cz + (k % 2 ? 2 : -2)), 0x3a5a2a);
  ctx.halos.add(cx, F + 3, cz, 0xd8e8b0, 6);
  lightSpot(ctx, cx, F + 3, cz + 6, 0xd8e8b0, 18, 14);
  // The terrace over the cliff: a stone deck at floor height with a balustrade, terrace doors,
  // steps down to the east lawn, urns. The ivy-covered trellis on the south wing is a climb.
  const t0 = -411, t1 = -372, z0 = -724, z1 = -707;
  block(ctx, t0, BRISTOL.plateau - 1, z0, t1, F, z1, 0x5e5a53, { tag: 'sidewalk' });
  for (const [ax, az, bx, bz] of [[t0, z1, t1, z1], [t1, z0 + 4, t1, z1]]) {
    const minX = Math.min(ax, bx) - 0.25, maxX = Math.max(ax, bx) + 0.25, minZ = Math.min(az, bz) - 0.25, maxZ = Math.max(az, bz) + 0.25;
    ctx.buckets.add('painted', box(maxX - minX, 0.22, maxZ - minZ, (minX + maxX) / 2, F + 1.05, (minZ + maxZ) / 2), LIME);
    const L = Math.hypot(bx - ax, bz - az);
    for (let k = 0; k <= L / 0.6; k++) { const t = k / (L / 0.6); ctx.buckets.add('painted', cylinder(0.09, 0.13, 0.9, ax + (bx - ax) * t, F + 0.45, az + (bz - az) * t, 6), LIME); }
    ctx.collision.addBox(minX, F, minZ, maxX, F + 1.16, maxZ, 'balustrade');
  }
  for (let k = 0; k < 3; k++) block(ctx, t1 - 0.01, BRISTOL.plateau - 0.2, z0, t1 + 1.5 - k * 0.5, F - 0.45 + k * 0.15, z0 + 4, LIME, { tag: 'step' });
  for (let x = t0 + 4; x < t1; x += 8) urn(ctx, x, F + 1.16, z1);
  ctx.buckets.add('painted', box(2.2, 3, 0.12, -399, F + 1.5, -724.06), 0x2a1c14); // terrace doors
  glow(ctx, box(1.8, 2.4, 0.06, -399, F + 1.6, -724.13), 0xc89048);
  for (const s of [-1, 1]) lantern(ctx, -399 + s * 1.8, F + 2.6, -723.7, WARM, 1.8);
  addLadder(ctx.climbables, { x: -410.65, z: -719, nx: 1, nz: 0, bottom: F, top: F + 9 });
  for (let y = F + 0.3; y < F + 9; y += 0.45) ctx.buckets.add('painted', box(0.06, 0.06, 1.4, -410.7, y, -719), 0x5a4a30);
  for (let k = 0; k < 14; k++) ctx.buckets.add('painted', new THREE.IcosahedronGeometry(ctx.rng.range(0.35, 0.6), 0).translate(-410.6, F + 0.5 + ctx.rng.range(0, 8.5), -719 + ctx.rng.range(-0.9, 0.9)), 0x2f4a26);
  // Statues on the cliff edge either side of the terrace, facing the city.
  for (const sx of [-440, -366]) statue(ctx, sx, -704.5, 0);
}

// A projecting gabled bay on the east front: width along z, wall height h, gable rise.
function gableBay(ctx, x, z, width, h, rise) {
  const out = 1.4;
  block(ctx, x, F - 0.6, z - width / 2, x + out, F + h, z + width / 2, STONE, { tag: 'building' });
  ctx.buckets.add('facade_stone', tiledBox(0.02, h, width, x + out + 0.01, F + h / 2, z, { uvScale: [24, 54.4], uOffset: 0.15, faces: [0, 1] }));
  // The gable's triangle (a prism with its ridge along x), its roof, a finial.
  const sh = new THREE.Shape();
  sh.moveTo(-width / 2, 0); sh.lineTo(width / 2, 0); sh.lineTo(0, rise); sh.lineTo(-width / 2, 0);
  ctx.buckets.add('painted', new THREE.ExtrudeGeometry(sh, { depth: out + 3, bevelEnabled: false }).rotateY(Math.PI / 2).translate(x - 3, F + h, z), STONE);
  pitchedRoof(ctx, x - 1.2, F + h, z, out + 3.6, width, rise + 0.3, { alongX: true, color: SLATE, over: 0.3 });
  ctx.buckets.add('painted', new THREE.ConeGeometry(0.22, 1.4, 4).translate(x + out, F + h + rise + 0.8, z), LIME);
  // A tall pointed window in the gable, lit.
  glow(ctx, box(0.06, 3.2, 1.2, x + out + 0.04, F + h - 1.2, z), 0xd09040);
  ctx.buckets.add('painted', new THREE.ConeGeometry(0.62, 0.9, 3).rotateX(0).translate(x + out + 0.05, F + h + 0.75, z), LIME);
}

function urn(ctx, x, y, z) {
  ctx.buckets.add('painted', cylinder(0.2, 0.28, 0.3, x, y + 0.15, z, 8), LIME);
  ctx.buckets.add('painted', cylinder(0.42, 0.18, 0.6, x, y + 0.6, z, 8), LIME);
  ctx.buckets.add('painted', new THREE.IcosahedronGeometry(0.4, 0).translate(x, y + 1.1, z), 0x2f4a26);
}

// A robed stone figure on a plinth (a perch).
function statue(ctx, x, z, yaw) {
  const y = ground(x, z);
  block(ctx, x - 0.8, y - 0.3, z - 0.8, x + 0.8, y + 1.6, z + 0.8, STONE, { tag: 'plinth' });
  const turn = new THREE.Matrix4().makeRotationY(yaw);
  const parts = [
    new THREE.CylinderGeometry(0.32, 0.52, 1.7, 7).translate(0, 2.45, 0),
    new THREE.SphereGeometry(0.24, 8, 6).translate(0, 3.5, 0),
    new THREE.BoxGeometry(0.16, 0.9, 0.16).rotateZ(-0.6).translate(0.4, 2.9, 0.15),
    new THREE.BoxGeometry(0.9, 0.05, 0.05).translate(0.75, 3.35, 0.2), // a lantern held out
  ];
  for (const p of parts) ctx.buckets.add('painted', p.applyMatrix4(turn).translate(x, y, z), 0xa8a39a);
  ctx.grapple.push({ x, y: y + 1.6, z, nx: Math.sin(yaw), nz: Math.cos(yaw), perch: true });
}

// The crest: a shield with a tower between two stars, in gold on dark blue (no letter).
function crest(ctx, x, y, z, yaw, s = 1) {
  const sh = new THREE.Shape();
  sh.moveTo(-0.7, 0.6); sh.lineTo(0.7, 0.6); sh.lineTo(0.7, -0.1); sh.quadraticCurveTo(0.6, -0.7, 0, -0.95); sh.quadraticCurveTo(-0.6, -0.7, -0.7, -0.1); sh.lineTo(-0.7, 0.6);
  const turn = new THREE.Matrix4().makeRotationY(yaw);
  const add = (g, c) => ctx.buckets.add('painted', g.scale(s, s, s).applyMatrix4(turn).translate(x, y, z), c);
  add(new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false }), 0x1e2b44);
  add(new THREE.BoxGeometry(0.3, 0.6, 0.06).translate(0, -0.05, 0.14), GOLD);
  for (let k = -1; k <= 1; k++) add(new THREE.BoxGeometry(0.08, 0.12, 0.06).translate(k * 0.11, 0.3, 0.14), GOLD);
  for (const sx of [-0.42, 0.42]) add(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 5).rotateX(Math.PI / 2).translate(sx, 0.25, 0.14), GOLD);
  add(new THREE.BoxGeometry(1.6, 0.08, 0.1).translate(0, 0.66, 0.06), GOLD);
}

function forecourt(ctx) {
  const f = BRISTOL.forecourt, y = ground(f.x, f.z);
  // A lawn disc inside the gravel ring and the fountain: a stone basin, two tiers, a glowing jet.
  ctx.buckets.add('painted', new THREE.CylinderGeometry(7.5, 7.5, 0.08, 24).translate(f.x, y + 0.06, f.z), 0x46582f);
  const r = 3.6;
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ctx.buckets.add('painted', box(1.5, 0.7, 0.45, 0, 0, 0).rotateY(-a).translate(f.x + Math.cos(a) * r, y + 0.35, f.z + Math.sin(a) * r), LIME);
  }
  ctx.collision.addBox(f.x - r - 0.2, y, f.z - r - 0.2, f.x + r + 0.2, y + 0.7, f.z + r + 0.2, 'prop');
  ctx.buckets.add('painted', new THREE.CylinderGeometry(r - 0.2, r - 0.2, 0.06, 20).translate(f.x, y + 0.5, f.z), 0x1d2a33);
  ctx.buckets.add('painted', cylinder(0.35, 0.5, 1.8, f.x, y + 1.3, f.z, 10), STONE);
  ctx.buckets.add('painted', cylinder(1.5, 0.9, 0.3, f.x, y + 2.2, f.z, 16), LIME);
  ctx.buckets.add('painted', cylinder(0.2, 0.3, 1.0, f.x, y + 2.8, f.z, 8), STONE);
  ctx.buckets.add('painted', cylinder(0.75, 0.5, 0.22, f.x, y + 3.35, f.z, 12), LIME);
  glow(ctx, cylinder(0.08, 0.2, 1.4, f.x, y + 4.1, f.z, 8), 0xa8c8dc);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; ctx.halos.add(f.x + Math.cos(a) * 1.4, y + 2.1, f.z + Math.sin(a) * 1.4, 0xbcd6e8, 1.4); }
  ctx.halos.add(f.x, y + 4.6, f.z, 0xcfe0ff, 2.4);
  ctx.grapple.push({ x: f.x, y: y + 3.46, z: f.z, nx: 1, nz: 0, perch: true });
  // Lamps round the forecourt and the Wayne car at the porch.
  for (const [lx, lz] of [[-346, -733], [-346, -757], [-378, -733], [-378, -757]]) lampPost(ctx, ground, lx, lz, { spot: lx === -378 });
  const cy = ground(-377, -745);
  parkedFleetCar(ctx, -377.5, -738.5, false, null, { y: cy, types: ['limousine'], yaw: Math.PI });
  ctx.collision.addBox(-378.5, cy + 0.3, -742, -376.5, cy + 1.1, -735, 'car');
}

function gates(ctx) {
  const g = BRISTOL.gates;
  const y = ground(g.x, g.z);
  // Piers, an iron arch with the crest over the drive, the gates standing open, walls either side.
  gatePiers(ctx, ground, g.x, g.z, 7, false, { h: 4.2, w: 1.4 });
  const archY = y + 5.4;
  ctx.buckets.add('painted', box(0.18, 0.18, 8.4, g.x, archY, g.z), IRON);
  for (let k = 0; k <= 12; k++) {
    const t = k / 12 - 0.5, h = Math.cos(t * Math.PI) * 1.2;
    ctx.buckets.add('painted', box(0.08, h + 0.1, 0.08, g.x, archY + h / 2, g.z + t * 7.6), IRON);
  }
  crest(ctx, g.x + 0.12, archY + 1.0, g.z, Math.PI / 2, 0.75);
  crest(ctx, g.x - 0.12, archY + 1.0, g.z, -Math.PI / 2, 0.75);
  for (const s of [-1, 1]) {
    // Each leaf swung back inward against the pier line.
    const hx = g.x - 0.2, hz = g.z + s * 3.5;
    for (let k = 0; k < 14; k++) ctx.buckets.add('painted', box(0.05, 3.2, 0.05, hx - k * 0.24, y + 1.6, hz - s * 0.15), IRON);
    ctx.buckets.add('painted', box(3.4, 0.08, 0.08, hx - 1.7, y + 3.1, hz - s * 0.15), IRON);
    ctx.buckets.add('painted', box(3.4, 0.08, 0.08, hx - 1.7, y + 0.4, hz - s * 0.15), IRON);
    for (const yy of [y + 4.6]) lantern(ctx, g.x + 0.9, yy, g.z + s * 4.6, WARM, 2.6);
    stoneWall(ctx, ground, g.x, g.z + s * 4.9, g.x, s < 0 ? -778 : g.z + 36, { h: 2.2, color: LIME });
  }
  lightSpot(ctx, g.x + 2, y + 3.5, g.z, WARM, 20, 14);
  // The gatehouse lodge, south of the gates, a lit window toward the road.
  house(ctx, ground, { ...md, x: g.x - 6, z: g.z + 9, w: 7, d: 6, h: 4.5, style: 'stone', ridge: 'z', rise: 3.4, door: 'e', chimneys: [[0, -1.8]], id: 'manorLodge' });
}

function garageBlock(ctx) {
  const x = -358, z = -773.5, w = 28, d = 11, h = 5.2;
  const y = house(ctx, ground, { ...md, x, z, w, d, h, y: BRISTOL.plateau + 0.1, style: 'stone', roof: 'flat', id: 'manorGarage' });
  ctx.buckets.add('painted', box(w + 0.4, 0.6, d + 0.4, x, y + h + 0.3, z), LIME);
  for (let k = 0; k < 4; k++) {
    const dx = x - w / 2 + 3.5 + k * 7;
    ctx.buckets.add('painted', box(4.4, 3.6, 0.12, dx, y + 1.8, z + d / 2 + 0.06), k === 1 ? 0x2a2d33 : 0x3a2a1c);
    for (let r = 0; r < 4; r++) ctx.buckets.add('painted', box(4.4, 0.05, 0.14, dx, y + 0.6 + r * 0.9, z + d / 2 + 0.07), 0x1a1410);
    lantern(ctx, dx, y + 4.3, z + d / 2 + 0.35, WARM, 1.6);
  }
}

function gardens(ctx) {
  // Box-hedge parterre west of the house, gravel between, statues at the crossings, a sundial.
  const x0 = -468, x1 = -436, z0 = -774, z1 = -726;
  const y = BRISTOL.plateau;
  for (let zz = z0 + 3; zz < z1 - 2; zz += 8) {
    for (let xx = x0 + 3; xx < x1 - 2; xx += 10) {
      if (Math.abs(zz - -746) < 4 && Math.abs(xx - -451) < 6) continue;
      for (const [ax, az, bx, bz] of [[0, 0, 7, 0], [0, 5, 7, 5], [0, 0, 0, 5], [7, 0, 7, 5]]) {
        const minX = xx + Math.min(ax, bx) - 0.4, maxX = xx + Math.max(ax, bx) + 0.4, minZ = zz + Math.min(az, bz) - 0.4, maxZ = zz + Math.max(az, bz) + 0.4;
        block(ctx, minX, y - 0.2, minZ, maxX, y + 1.1, maxZ, HEDGE, { tag: 'prop' });
      }
    }
  }
  const sx = -451, sz = -746;
  block(ctx, sx - 0.5, y - 0.2, sz - 0.5, sx + 0.5, y + 1.1, sz + 0.5, STONE, { tag: 'plinth' });
  ctx.buckets.add('painted', cylinder(0.6, 0.6, 0.06, sx, y + 1.13, sz, 16), 0x8a7a4a);
  ctx.buckets.add('painted', box(0.04, 0.4, 0.5, sx, y + 1.35, sz), 0x8a7a4a);
  for (const [px, pz] of [[-466, -730], [-438, -730], [-466, -770], [-438, -770]]) statue(ctx, px, pz, Math.atan2(-451 - px, -746 - pz));
  // The greenhouse: whitewashed frame, glass, lit.
  const gx = -455, gz = -778 + 3.6, gw = 13, gd = 6;
  block(ctx, gx - gw / 2, y - 0.3, gz - gd / 2, gx + gw / 2, y + 0.6, gz + gd / 2, LIME, { tag: 'building' });
  ctx.collision.addBox(gx - gw / 2, y + 0.6, gz - gd / 2, gx + gw / 2, y + 3.2, gz + gd / 2, 'building');
  ctx.buckets.add('glass', box(gw - 0.2, 2.6, gd - 0.2, gx, y + 1.9, gz));
  const sh = new THREE.Shape();
  sh.moveTo(-gd / 2, 0); sh.lineTo(gd / 2, 0); sh.lineTo(0, 1.8); sh.lineTo(-gd / 2, 0);
  ctx.buckets.add('glass', new THREE.ExtrudeGeometry(sh, { depth: gw, bevelEnabled: false }).translate(0, 0, -gw / 2).rotateY(Math.PI / 2).translate(gx, y + 3.2, gz));
  for (let k = 0; k <= gw; k += 1.3) ctx.buckets.add('painted', box(0.07, 2.7, gd + 0.04, gx - gw / 2 + k, y + 1.95, gz), 0xe8e4d8);
  glow(ctx, box(gw - 1, 0.08, gd - 1, gx, y + 3.1, gz), 0x5a6a3a);
  ctx.halos.add(gx, y + 2, gz, 0xd8e8b0, 4.5);
  ctx.grapple.push({ x: gx, y: y + 5, z: gz, nx: 0, nz: 1, perch: true });
  ctx.collision.addBox(gx - gw / 2, y + 3.2, gz - 0.6, gx + gw / 2, y + 5, gz + 0.6, 'roof');
  // A gravel path from the garden gate to the cemetery footpath, and the back gate in the wall.
  stoneWall(ctx, ground, -472, -776, -472, -712, { h: 1.8, color: LIME, gaps: [[-472, -745, 1.8]] });
  gatePiers(ctx, ground, -472, -745, 2.6, false, { h: 2.4, w: 0.8 });
}

// The boathouse on the lake's west shore: a timber house on piles over the water with a slipway,
// a launch moored inside, a lamp at the door (the collectible hide is under its boards).
function boathouse(ctx) {
  const b = BRISTOL.boathouse;
  const x0 = b.x - 6, x1 = b.x + 6, z0 = b.z - 6, z1 = b.z + 6, fy = 0.8;
  for (let x = x0; x <= x1; x += 3) for (const z of [z0, z1]) ctx.buckets.add('wood', cylinder(0.18, 0.18, 2.6, x, fy - 1.3, z, 6));
  // Deck around three sides (the water bay in the middle opens east onto the lake).
  block(ctx, x0, fy - 0.25, z0, x1, fy, z0 + 2.2, 0x5a4232, { tag: 'pier', key: 'wood' });
  block(ctx, x0, fy - 0.25, z1 - 2.2, x1, fy, z1, 0x5a4232, { tag: 'pier', key: 'wood' });
  block(ctx, x0, fy - 0.25, z0, x0 + 3, fy, z1, 0x5a4232, { tag: 'pier', key: 'wood' });
  // Walls (west, north, south) and a steep roof; the east end is open over the water.
  for (const [a, c, d, e] of [[x0, z0, x0 + 0.25, b.z - 1], [x0, b.z + 1, x0 + 0.25, z1], [x0, z0, x1, z0 + 0.25], [x0, z1 - 0.25, x1, z1]]) block(ctx, a, fy, c, d, fy + 3.4, e, 0x4a3628, { tag: 'building', key: 'wood' });
  block(ctx, x0, fy + 2.4, b.z - 1, x0 + 0.25, fy + 3.4, b.z + 1, 0x4a3628, { tag: 'building', key: 'wood' });
  ctx.facades.push({ minX: x0, minY: fy, minZ: z0, maxX: x1, maxY: fy + 3.4, maxZ: z1, style: 'warehouse' });
  pitchedRoof(ctx, b.x, fy + 3.4, b.z, 12, 12, 4.5, { alongX: true, color: 0x3a3028 });
  lantern(ctx, x0 - 0.4, fy + 2.6, b.z + 1.3, WARM, 2.2);
  lightSpot(ctx, x0 - 1, fy + 2.4, b.z, WARM, 14, 10);
  const boat = createBoat('speedboat');
  boat.group.position.set(b.x + 1.5, BRISTOL.lake.level, b.z);
  boat.group.rotation.y = Math.PI / 2;
  ctx.scene.add(boat.group);
  // A plank walk from the shore path to the door.
  block(ctx, x0 - 5, fy - 0.9, b.z - 1, x0, 0.4, b.z + 1, 0x5a4232, { tag: 'pier', key: 'wood' }); // a low step up to the deck
}
