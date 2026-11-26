// The street fleet as data plus four generators (car, deco car, truck, bus) and a motorcycle.
// Gotham is 1930s-meets-modern with Chicago cues: pontoon-fendered deco sedans and checker-style
// cabs share the street with modern sedans, SUVs and box trucks; GCPD and city liveries are our
// own designs. Every spec builds into a VehicleBuilder (see kit.js) and returns the handles the
// game needs (wheels, lamp anchors, seat, smoke point) plus a side silhouette for the 1-draw LOD.
import * as THREE from 'three';
import { C, loft, ring8, boxAt, cylX, cylY, cylZ, flankDecal } from './kit.js';
import {
  sampleKeys, bodyLoft, archTubs, greenhouse, cabin, addWheels, addLamps, lightBar, bumper, plate, mirrors,
  doorLines, stripe, strut, dim,
} from './bodies.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- palettes
// [primary, secondary]. Primary is the paint the traffic instancer can repaint per car.
const P = {
  maroon: [0x5e2328, 0xd9cfb4], bottle: [0x1f3d2e, 0xd9cfb4], navy: [0x1e2b44, 0xc9c2ad], cream: [0xd8ccaa, 0x3a2f2a],
  black: [0x16171b, 0x8c8676], gunmetal: [0x3b414b, 0x16171b], mustard: [0xb88a2a, 0x2a241c], oxblood: [0x4a1c22, 0x16171b],
  slate: [0x46566e, 0xd4ccb4], teal: [0x1f5560, 0xd8d0b8], plum: [0x4a2d4a, 0xc9c0a8], tan: [0x8a7454, 0x2b2620],
  silver: [0x8e949c, 0x23252a], white: [0xd6d3c8, 0x2a2c33], red: [0x8f2027, 0xe6dfcc], sky: [0x5d7fa3, 0xe0d8c2],
};
const CIVIL = [P.maroon, P.bottle, P.navy, P.cream, P.black, P.gunmetal, P.slate, P.oxblood, P.tan, P.silver];

// ---------------------------------------------------------------- generator: lofted car

// Builds a car (sedan/coupe/hatch/wagon/SUV/pickup/limo/van) from a parameter set p.
function buildCar(b, p, pal, o = {}) {
  const L2 = p.L / 2, h = p.W / 2;
  const deco = !!p.deco;
  const bh = deco ? h - p.fenderW : h; // main hull half width (deco: narrow, fenders outside)
  const keys = [];
  keys.push({ z: L2, y0: p.y0 + 0.14, hw: bh - (p.flatNose ? 0.06 : 0.16), ym: p.noseY - 0.1, yt: p.noseY, ht: bh - (p.flatNose ? 0.14 : 0.42) });
  keys.push({ z: L2 - (p.flatNose ? 0.08 : 0.22), y0: p.y0, hw: bh - 0.02, ym: p.noseY + 0.02, yt: p.noseY + 0.07, ht: bh - 0.2 });
  keys.push({ z: p.hoodZ, y0: p.y0, hw: bh, ym: p.belt, yt: Math.max(p.hoodY, p.belt + 0.02), ht: bh - 0.12 });
  if (p.boxFrom != null) {
    keys.push({ z: p.boxFrom + 0.01, y0: p.y0, hw: bh, ym: p.belt, yt: p.belt + 0.03, ht: bh - 0.12 });
    keys.push({ z: p.boxFrom, y0: p.y0, hw: bh, ym: p.boxY - 0.12, yt: p.boxY, ht: bh - 0.08 });
    keys.push({ z: -L2 + 0.06, y0: p.y0, hw: bh, ym: p.boxY - 0.12, yt: p.boxY, ht: bh - 0.08 });
    keys.push({ z: -L2, y0: p.y0 + 0.06, hw: bh - 0.04, ym: p.boxY - 0.16, yt: p.boxY - 0.04, ht: bh - 0.14 });
  } else if (p.cabBack != null) {
    // A truck cab: the hull stops square behind the cab; the box/bed is built separately.
    keys.push({ z: p.cabBack + 0.02, y0: p.y0, hw: bh, ym: p.belt, yt: p.belt + 0.03, ht: bh - 0.12 });
    keys.push({ z: p.cabBack, y0: p.y0 + 0.02, hw: bh - 0.03, ym: p.belt - 0.04, yt: p.belt, ht: bh - 0.16 });
  } else {
    keys.push({ z: p.deckZ ?? p.rear, y0: p.y0, hw: bh, ym: p.belt, yt: Math.max(p.deckY, p.belt + 0.02), ht: bh - 0.12 });
    keys.push({ z: -L2 + 0.22, y0: p.y0, hw: bh - 0.02, ym: p.tailY - 0.06, yt: p.tailY, ht: bh - 0.18 });
    keys.push({ z: -L2, y0: p.y0 + 0.12, hw: bh - 0.1, ym: p.tailY - 0.16, yt: p.tailY - 0.05, ht: bh - 0.36 });
  }
  const r = p.wheelR, ww = p.wheelW;
  const axles = p.axles;
  const arches = deco ? [] : axles.map((z) => ({ z, r: r + 0.07, cy: r }));
  keys.arches = arches;
  b.add(bodyLoft(keys, arches), { color: pal[0], paint: 1 });
  if (!deco) archTubs(b, arches, keys, ww);
  else {
    // A narrow belly pan between the fenders so nothing reads as hollow from low angles.
    b.add(boxAt(bh * 2 - 0.1, 0.12, p.L - 0.6, 0, p.y0 + 0.02, 0), { color: C.under, ink: false });
  }

  // Greenhouse.
  let roof = null;
  if (p.roofY) {
    roof = greenhouse(b, keys, {
      front: p.hoodZ - 0.02, roofF: p.roofF, roofR: p.roofR, rear: p.rear, roofY: p.roofY, tumble: p.tumble ?? 0.17,
      bPillars: p.bPillars ?? [], pillarColor: p.pillarColor, roofColor: p.roofColor === 2 ? pal[1] : undefined,
      roofPaint: p.roofColor === 2 ? 0 : 1, rearH: p.rearH, cWidth: p.cWidth, glassColor: p.glassColor,
    }, pal);
    cabin(b, { rows: p.rows ?? [p.roofF - 0.3], hw: bh - 0.2, seatY: p.belt - 0.38, belt: p.belt, wheelZ: p.roofF + 0.15 });
  }

  // Deco: pontoon fenders front and rear, running boards between, upright chrome grille.
  if (deco) decoFenders(b, p, pal, h, bh);

  const wheelPos = [];
  const wx = h - ww / 2 + (deco ? -0.02 : 0.03);
  for (const z of axles) for (const s of [-1, 1]) wheelPos.push([s * wx, z]);
  // Rear twin-wheel trucks would add more positions; the car generator keeps four.
  const wheels = addWheels(b, wheelPos, r, ww, { hubColor: p.hub ?? C.hub, capColor: C.chrome, dish: deco ? 0.66 : 0.58 });

  // Nose and tail furniture.
  const noseZ = L2 + 0.02, tailZ = -L2 - 0.02;
  if (!p.noBumpers) {
    bumper(b, noseZ + 0.04, bh - 0.08, p.y0 + 0.1, { color: p.bumper ?? (deco ? C.chrome : C.trim) });
    bumper(b, tailZ - 0.04, bh - 0.06, p.y0 + 0.12, { color: p.bumper ?? (deco ? C.chrome : C.trim) });
  }
  plate(b, noseZ + 0.13, p.y0 + 0.11);
  plate(b, tailZ - 0.03, p.y0 + 0.34);
  if (deco) {
    const gh = p.noseY - p.y0 - 0.12;
    b.add(boxAt(0.42, gh, 0.06, 0, p.y0 + 0.16 + gh / 2, noseZ - 0.01), { color: C.chrome });
    for (let i = -2; i <= 2; i++) b.add(boxAt(0.03, gh - 0.08, 0.02, i * 0.07, p.y0 + 0.16 + gh / 2, noseZ + 0.025), { color: C.grille, ink: false });
    b.add(boxAt(0.05, 0.04, p.hoodZ - 0.1 - (p.roofF - 0.5), 0, p.hoodY + 0.02, (noseZ + p.hoodZ) / 2 - 0.05), { color: C.chrome, ink: false }); // hood strip
  } else {
    const gw = p.grilleW ?? (bh - 0.42);
    b.add(boxAt(gw * 2, p.grilleH ?? 0.16, 0.04, 0, p.noseY - 0.2, noseZ - 0.005), { color: C.grille, ink: false });
    if (p.grilleChrome) b.add(boxAt(gw * 2 + 0.06, 0.03, 0.05, 0, p.noseY - 0.2 + (p.grilleH ?? 0.16) / 2, noseZ), { color: C.chrome, ink: false });
  }
  const headX = deco ? h - p.fenderW * 0.62 : bh - 0.27;
  const lampSpec = {
    head: deco ? { round: true, r: 0.12, x: headX, y: p.noseY + 0.02, z: axles[0] + r + 0.08 } : { w: p.headW ?? 0.3, h: p.headH ?? 0.1, x: headX, y: p.noseY - 0.17, z: noseZ },
    tail: { w: p.tailW ?? 0.22, h: p.tailH ?? 0.14, x: bh - 0.2, y: (p.tailY == null || p.boxY ? p.y0 + 0.6 : p.tailY - 0.17), z: tailZ },
  };
  if (deco) {
    // Round lamps on short stalks between hood and fender, facing forward.
    for (const s of [-1, 1]) b.add(cylZ(0.13, 0.22, s * headX, p.noseY + 0.02, lampSpec.head.z - 0.12, 12, 0.1), { color: C.chrome, smooth: true });
    lampSpec.head.z += 0.0;
  }
  const anchors = addLamps(b, lampSpec);
  if (p.roofY) mirrors(b, p.hoodZ - 0.2, sampleKeys(keys, p.hoodZ - 0.2).hw, p.belt + 0.1);
  if (p.doors) doorLines(b, keys, p.doors, p.y0 + 0.2, p.belt - 0.02);

  // Pickup bed: a dark liner set into the deck with paint rails along it and a tailgate seam.
  if (p.bed) {
    const [z0, z1] = p.bed;
    b.add(boxAt(bh * 2 - 0.2, 0.03, z0 - z1, 0, p.tailY + 0.005, (z0 + z1) / 2), { color: C.under, ink: false });
    for (const s of [-1, 1]) b.add(boxAt(0.08, 0.05, z0 - z1, s * (bh - 0.06), p.tailY + 0.03, (z0 + z1) / 2), { color: pal[0], paint: 1 });
  }

  const H = Math.max(p.roofY ?? 0, p.boxY ?? 0, p.noseY) + 0.04;
  const top = (z) => sampleKeys(keys, z).yt;
  const silhouette = [[L2, p.y0 + 0.14], [L2, p.noseY], [p.hoodZ, top(p.hoodZ)]];
  if (p.roofY) silhouette.push([p.roofF, p.roofY], [p.roofR, p.roofY], [Math.min(p.rear, p.roofR - 0.01), top(p.rear) + (p.rearH ?? 0)]);
  if (p.boxFrom != null) silhouette.push([p.boxFrom - 0.01, p.boxY], [-L2, p.boxY]);
  else if (p.cabBack != null) silhouette.push([p.cabBack, p.belt]);
  else silhouette.push([-L2 + 0.22, p.tailY], [-L2, p.tailY - 0.05]);
  silhouette.push([p.cabBack ?? -L2, p.y0 + 0.1]);
  return {
    keys, wheels, anchors, wheelR: r, W: p.W, L: p.L, H, bh, roof,
    seat: V(0.38, p.belt - 0.2, p.roofF - 0.3),
    smoke: V(0, (p.hoodY ?? p.noseY) + 0.05, (L2 + p.hoodZ) / 2),
    silhouette, glassBand: p.roofY ? [[p.hoodZ, top(p.hoodZ)], [p.roofF, p.roofY - 0.05], [p.roofR, p.roofY - 0.05], [p.rear, top(p.rear)]] : null,
  };
}

function decoFenders(b, p, pal, h, bh) {
  const r = p.wheelR, fw = p.fenderW / 2 + 0.03, fx = bh + fw - 0.07;
  const [fz, rz] = [p.axles[0], p.axles[p.axles.length - 1]];
  const crest = 2 * r + 0.1, board = 0.44;
  // A pontoon fender's cross-section: tucked against the hull on the inside, a rounded crown,
  // falling away to a skirt on the outside. Same winding as ring8 (bottom-left, up, over, down).
  const section = (yt, skirt) => {
    const y0 = Math.min(skirt, yt - 0.08);
    return [[-fw, y0], [-fw, yt - 0.04], [-fw * 0.45, yt], [fw * 0.25, yt - 0.02], [fw * 0.8, yt - 0.1], [fw, yt - 0.24], [fw, y0], [fw * 0.5, y0 - 0.01]];
  };
  // Crown height along the fender, sampled on a smooth curve so the hump reads round, not boxy.
  const sweep = (z0, z1, peakZ, yStart, yEnd, n = 8) => {
    const st = [];
    for (let i = 0; i < n; i++) {
      const z = z0 + (z1 - z0) * (i / (n - 1));
      const ref = z > peakZ ? yStart : yEnd;
      const span = z > peakZ ? z0 - peakZ : peakZ - z1;
      const u = Math.min(1, Math.abs(z - peakZ) / span);
      const yt = ref + (crest - ref) * Math.cos(u * Math.PI / 2) ** 0.7;
      // [polish2] The skirt keeps real depth to both ends (polish list: "deco fenders read as
      // flaps"): it used to rise to meet the crown, so each fender thinned to a blade at its tip
      // and where it met the running board. Now the free end stays a rounded pontoon nose that
      // drops past the tyre's shoulder, and the board end is a solid shoulder the board runs into.
      const boardEnd = ref < board + 0.2;
      const skirt = z > peakZ - r && z < peakZ + r ? r * 0.98 : boardEnd ? Math.max(board - 0.12, yt - 0.4) : Math.max(0.24, yt - 0.42);
      st.push({ z, pts: section(yt, skirt) });
    }
    return st;
  };
  const col = { color: pal[p.fenderColor === 2 ? 1 : 0], paint: p.fenderColor === 2 ? 0 : 1 };
  for (const s of [-1, 1]) {
    const mirror = (g) => (s < 0 ? g.scale(-1, 1, 1) : g).translate(s * fx, 0, 0);
    // Front: low at the nose, cresting over the wheel, sweeping down to the running board.
    const front = loft(sweep(p.L / 2 - 0.08, fz - r - 0.7, fz + 0.05, r + 0.24, board + 0.15));
    const rear = loft(sweep(rz + r + 0.55, -p.L / 2 + 0.15, rz - 0.05, board + 0.15, r + 0.34, 7));
    for (const g of [front, rear]) {
      if (s < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
      b.add(mirror(g), { ...col, smooth: true }); // smooth-shaded: a rounded pontoon, not facets
    }
    // Running board, rubber-topped, from fender to fender.
    const z0 = fz - r - 0.6, z1 = rz + r + 0.45;
    b.add(boxAt(fw * 2 - 0.04, 0.06, z0 - z1, s * fx, board - 0.03, (z0 + z1) / 2), { color: C.rubber });
    // A dark inner fender face so the wheel sits in shadow.
    for (const z of [fz, rz]) b.add(boxAt(0.04, crest - r, 2 * r + 0.2, s * (bh + 0.02), (crest + r) / 2 - 0.02, z), { color: C.under, ink: false });
  }
}

// ---------------------------------------------------------------- generator: truck body behind a cab

// A box (cargo, ambulance module, armoured body, garbage compactor) on chassis rails behind a cab.
function cargoBox(b, { z0, z1, y0, y1, hw, color, paint = 1, ribs = 0, rearDoors = true, roll = false }) {
  b.add(boxAt(hw * 2, y1 - y0, z0 - z1, 0, (y0 + y1) / 2, (z0 + z1) / 2), { color, paint });
  // Top and bottom rails in trim: the box reads as a framed panel body.
  // (kept just below the box's top and above its bottom, never coplanar with them: no z-fight)
  for (const y of [y0 + 0.06, y1 - 0.07]) b.add(boxAt(hw * 2 + 0.03, 0.08, z0 - z1 - 0.04, 0, y, (z0 + z1) / 2), { color: C.trim });
  for (let i = 1; i <= ribs; i++) {
    const z = z0 - (z0 - z1) * (i / (ribs + 1));
    for (const s of [-1, 1]) b.add(boxAt(0.03, y1 - y0 - 0.1, 0.06, s * (hw + 0.015), (y0 + y1) / 2, z), { color: C.trim, ink: false });
  }
  if (rearDoors) {
    b.add(boxAt(0.03, y1 - y0 - 0.16, 0.02, 0, (y0 + y1) / 2, z1 - 0.01), { color: C.ink, ink: false });
    for (const s of [-1, 1]) b.add(boxAt(0.04, y1 - y0 - 0.3, 0.04, s * 0.12, (y0 + y1) / 2, z1 - 0.03), { color: C.chrome, ink: false });
  }
  if (roll) for (let i = 1; i < 8; i++) b.add(boxAt(hw * 2 - 0.1, 0.015, 0.02, 0, y0 + (y1 - y0) * (i / 8), z1 - 0.01), { color: C.trim, ink: false });
}

function chassis(b, z0, z1, y, hw) {
  for (const s of [-1, 1]) b.add(boxAt(0.14, 0.2, z0 - z1, s * (hw - 0.35), y, (z0 + z1) / 2), { color: C.under, ink: false });
}

// Dual rear wheels for trucks: extra wheel bones inboard of the outer pair.
function truckWheels(b, axles, r, w, hw, { dualFrom = 1 } = {}) {
  const pos = [];
  axles.forEach((z, i) => {
    for (const s of [-1, 1]) pos.push([s * (hw - w / 2 + 0.03), z]);
  });
  const wheels = addWheels(b, pos, r, w, { frontCount: 2 });
  // Inner duals ride on the outer wheel's spin bone, so they turn with it, one bone pair each.
  for (let i = dualFrom * 2; i < pos.length; i++) {
    const [x, z] = pos[i];
    const ix = x - Math.sign(x) * (w + 0.02);
    b.add(cylX(r * 0.98, w, ix, r, z, 12), { color: C.tyre, bone: `spin${i}`, smooth: true });
  }
  return wheels;
}

// ---------------------------------------------------------------- generator: bus

function buildBus(b, p, pal) {
  const L2 = p.L / 2, h = p.W / 2, roofY = p.H;
  const keys = [
    { z: L2, y0: 0.32, hw: h - 0.06, ym: roofY - 0.25, yt: roofY - 0.08, ht: h - 0.2 },
    { z: L2 - 0.12, y0: 0.3, hw: h, ym: roofY - 0.18, yt: roofY, ht: h - 0.1 },
    { z: -L2 + 0.12, y0: 0.3, hw: h, ym: roofY - 0.18, yt: roofY, ht: h - 0.1 },
    { z: -L2, y0: 0.34, hw: h - 0.05, ym: roofY - 0.25, yt: roofY - 0.08, ht: h - 0.2 },
  ];
  const r = 0.5, ww = 0.3;
  const arches = p.axles.map((z) => ({ z, r: r + 0.08, cy: r }));
  keys.arches = arches;
  b.add(bodyLoft(keys, arches), { color: pal[0], paint: 1 });
  archTubs(b, arches, keys, ww);
  // Lower skirt band and a roof band in the secondary colour (a CTA-like two-tone of our own).
  stripe(b, keys, L2 - 0.15, -L2 + 0.15, 0.62, 1.0, pal[1]);
  stripe(b, keys, L2 - 0.15, -L2 + 0.15, 1.12, 1.2, C.trim, { lift: 0.007 });
  // Side windows: a band of panes with pillars showing between (glass boxes proud of the flank).
  const wy0 = 1.3, wy1 = roofY - 0.42;
  const nWin = Math.floor((p.L - 3.2) / 1.25);
  for (const s of [-1, 1]) {
    for (let i = 0; i < nWin; i++) {
      const z = L2 - 2.3 - i * 1.25;
      if (s < 0 && Math.abs(z - p.midDoor) < 0.8) continue;
      b.add(boxAt(0.04, wy1 - wy0, 1.12, s * (h + 0.005), (wy0 + wy1) / 2, z - 0.55), { to: 'glass', color: C.glass });
    }
    // Driver's side window.
    b.add(boxAt(0.04, wy1 - wy0 + 0.25, 0.9, s * (h + 0.005), (wy0 + wy1) / 2 - 0.1, L2 - 0.75), { to: 'glass', color: C.glass });
  }
  // Doors on the kerb side (-x is kerb when driving on the right... the car's right is -x).
  for (const z of [L2 - 1.35, p.midDoor]) {
    b.add(boxAt(0.04, roofY - 0.75, 1.0, -(h + 0.006), 0.32 + (roofY - 0.75) / 2, z), { to: 'glass', color: C.glassDark });
    b.add(boxAt(0.05, roofY - 0.7, 0.03, -(h + 0.01), 0.32 + (roofY - 0.7) / 2, z), { color: C.ink, ink: false });
  }
  // Windscreen (two panes), destination sign, rear window.
  b.add(boxAt(p.W - 0.3, 1.25, 0.04, 0, 1.75, L2 + 0.005), { to: 'glass', color: C.glass });
  b.add(boxAt(0.05, 1.25, 0.05, 0, 1.75, L2 + 0.02), { color: C.trim, ink: false });
  b.add(boxAt(p.W - 0.7, 0.24, 0.04, 0, roofY - 0.2, L2 + 0.01), { to: 'lamps', lamp: 'sign', on: 0xffc24a, off: 0x4a3a1a });
  b.add(boxAt(p.W - 0.8, 0.7, 0.04, 0, roofY - 0.7, -L2 - 0.005), { to: 'glass', color: C.glassDark });
  // Roof pods (HVAC) and the interior: rows of seat backs seen through the windows.
  b.add(boxAt(1.4, 0.22, 2.6, 0, roofY + 0.11, -1.2), { color: pal[1] });
  for (let i = 0; i < nWin; i++) {
    const z = L2 - 2.6 - i * 1.25;
    for (const s of [-1, 1]) b.add(boxAt(0.8, 0.6, 0.1, s * 0.75, 1.35, z), { color: C.seat, ink: false });
  }
  b.add(boxAt(p.W - 0.25, 0.2, p.L - 0.4, 0, 1.0, 0), { color: C.interior, ink: false }); // floor
  bumper(b, L2 + 0.06, h - 0.05, 0.42, { color: C.trim, h: 0.22 });
  bumper(b, -L2 - 0.06, h - 0.05, 0.42, { color: C.trim, h: 0.22 });
  const wheels = addWheels(b, [[-(h - ww / 2), p.axles[0]], [h - ww / 2, p.axles[0]], [-(h - ww / 2), p.axles[1]], [h - ww / 2, p.axles[1]]], r, ww);
  const anchors = addLamps(b, { head: { w: 0.32, h: 0.14, x: h - 0.35, y: 0.75, z: L2 + 0.03 }, tail: { w: 0.18, h: 0.4, x: h - 0.2, y: 1.0, z: -L2 - 0.03 } });
  mirrors(b, L2 - 0.1, h, 2.1);
  return {
    keys, wheels, anchors, wheelR: r, W: p.W, L: p.L, H: roofY + 0.22, bh: h, seat: V(0.6, 1.3, L2 - 0.9), smoke: V(0, roofY, -L2 + 1),
    silhouette: [[L2, 0.32], [L2, roofY - 0.08], [-L2, roofY - 0.08], [-L2, 0.34]], glassBand: [[L2 - 0.3, wy0], [L2 - 0.3, wy1], [-L2 + 0.6, wy1], [-L2 + 0.6, wy0]],
  };
}

// ---------------------------------------------------------------- generator: motorcycle

export function buildBike(b, p, pal) {
  const r = p.wheelR ?? 0.32, wb = p.wb ?? 1.42;
  const fz = wb / 2, rz = -wb / 2;
  // Front wheel on a steer bone at the head of the fork; the rear on its own spin bone.
  b.bone('wheel0', 'root', V(0, r, fz));
  b.bone('spin0', 'wheel0', V(0, r, fz));
  b.bone('wheel1', 'root', V(0, r, rz));
  b.bone('spin1', 'wheel1', V(0, r, rz));
  const wheel = (bone, z, w) => {
    const t = new THREE.TorusGeometry(r - w / 2, w / 2, 6, 16).rotateY(Math.PI / 2).translate(0, r, z);
    b.add(t, { color: C.tyre, bone, smooth: true });
    b.add(cylX(r * 0.55, w * 0.7, 0, r, z, 12), { color: p.hub ?? C.hub, bone, smooth: true });
    b.add(cylX(r * 0.18, w + 0.06, 0, r, z, 8), { color: C.chrome, bone, smooth: true });
  };
  wheel('spin0', fz, p.tyreW ?? 0.12);
  wheel('spin1', rz, (p.tyreW ?? 0.12) * 1.3);
  // Forks + handlebars ride the steer bone; frame, tank, seat, engine on the root.
  for (const s of [-1, 1]) b.add(strut(V(s * 0.09, r, fz), V(s * 0.09, r + 0.62, fz - 0.24), 0.05, 0.05), { color: C.chrome, bone: 'wheel0' });
  b.add(boxAt(0.62, 0.04, 0.05, 0, r + 0.72, fz - 0.3), { color: C.trim, bone: 'wheel0' });
  b.add(boxAt(0.14, 0.14, 0.12, 0, r + 0.55, fz - 0.16), { color: pal[0], paint: 1, bone: 'wheel0' }); // headlamp nacelle
  b.add(loft([
    { z: fz - 0.2, pts: ring8(r + 0.4, 0.08, 0.12, r + 0.55, 0.08, r + 0.66) },
    { z: fz - 0.5, pts: ring8(r + 0.32, 0.12, 0.17, r + 0.55, 0.12, r + 0.7) },
    { z: 0.0, pts: ring8(r + 0.36, 0.12, 0.16, r + 0.52, 0.1, r + 0.64) },
  ]), { color: pal[0], paint: 1 }); // tank
  b.add(loft([
    { z: 0.0, pts: ring8(r + 0.48, 0.1, 0.13, r + 0.56, 0.1, r + 0.6) },
    { z: -0.6, pts: ring8(r + 0.5, 0.08, 0.12, r + 0.6, 0.08, r + 0.64) },
    { z: rz + 0.05, pts: ring8(r + 0.52, 0.05, 0.08, r + 0.6, 0.05, r + 0.62) },
  ]), { color: p.seat ?? C.seat }); // seat and tail
  b.add(boxAt(0.3, 0.3, 0.42, 0, r + 0.12, 0.05), { color: 0x3c4048 }); // engine block
  b.add(strut(V(0, r + 0.1, 0.25), V(0, r + 0.5, fz - 0.25), 0.07, 0.07), { color: C.trim });
  b.add(strut(V(0, r + 0.05, -0.2), V(0, r, rz), 0.06, 0.12), { color: C.trim }); // swing arm
  b.add(cylZ(0.04, 0.7, 0.16, r + 0.02, -0.35, 8), { color: C.chrome, smooth: true }); // exhaust
  if (p.fairing) {
    // A sport fairing: a sloped nose that widens back over the fork, the screen leaning back on top.
    b.add(loft([
      { z: fz + 0.06, pts: ring8(r + 0.36, 0.04, 0.08, r + 0.48, 0.05, r + 0.56) },
      { z: fz - 0.22, pts: ring8(r + 0.2, 0.15, 0.22, r + 0.54, 0.14, r + 0.72) },
      { z: fz - 0.48, pts: ring8(r + 0.28, 0.17, 0.2, r + 0.58, 0.14, r + 0.68) },
    ]), { color: pal[0], paint: 1, bone: 'wheel0' });
    b.add(boxAt(0.26, 0.2, 0.03).rotateX(-0.95).translate(0, r + 0.8, fz - 0.3), { to: 'glass', color: C.glass, bone: 'wheel0' });
  }
  b.add(boxAt(0.08, 0.06, 0.05, 0, r + 0.08, rz - 0.04), { color: C.trim, ink: false });
  b.add(cylZ(0.07, 0.04, 0, r + 0.55, fz - 0.08, 10), { to: 'lamps', lamp: 'head', on: C.head, off: C.headOff, bone: 'wheel0' });
  b.add(boxAt(0.14, 0.06, 0.03, 0, r + 0.55, rz - 0.12), { to: 'lamps', lamp: 'tail', on: C.tail, off: C.tailOff });
  b.add(boxAt(0.14, 0.04, 0.03, 0, r + 0.5, rz - 0.12), { to: 'lamps', lamp: 'brake', on: C.brake, off: C.tailOff });
  for (const s of [-1, 1]) {
    b.add(boxAt(0.04, 0.04, 0.04, s * 0.32, r + 0.7, fz - 0.3), { to: 'lamps', lamp: s > 0 ? 'left' : 'right', on: C.amber, off: C.amberOff, bone: 'wheel0' });
    b.add(boxAt(0.04, 0.04, 0.04, s * 0.12, r + 0.5, rz - 0.1), { to: 'lamps', lamp: s > 0 ? 'left' : 'right', on: C.amber, off: C.amberOff });
  }
  // Fenders: front on the fork, rear on the frame.
  b.add(new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.14, 10, 1, true, -0.3, 1.6).rotateZ(Math.PI / 2).translate(0, r, fz), { color: pal[0], paint: 1, bone: 'wheel0' });
  b.add(new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.18, 10, 1, true, Math.PI - 0.2, 1.4).rotateZ(Math.PI / 2).translate(0, r, rz), { color: pal[0], paint: 1 });
  const wheels = [{ pivotName: 'wheel0', spinName: 'spin0', front: true, x: 0, z: fz }, { pivotName: 'wheel1', spinName: 'spin1', front: false, x: 0, z: rz }];
  const L = wb + 2 * r + 0.1;
  return {
    wheels, anchors: { head: [V(0, r + 0.55, fz)], tail: [V(0, r + 0.55, rz - 0.14)] }, wheelR: r, W: 0.7, L, H: r + 0.9, bh: 0.35,
    seat: V(0, r + 0.62, -0.3), smoke: V(0, r + 0.3, 0.1),
    silhouette: [[fz + r, r], [fz - 0.2, r + 0.75], [rz, r + 0.62], [rz - r, r], [rz, 0.02], [fz, 0.02]], glassBand: null,
  };
}

// ---------------------------------------------------------------- the fleet

const sedan = { L: 4.7, W: 1.82, y0: 0.3, noseY: 0.74, hoodY: 0.93, belt: 0.92, hoodZ: 0.85, roofF: 0.22, roofR: -0.92, rear: -1.45, deckY: 0.97, tailY: 0.95, roofY: 1.45, wheelR: 0.33, wheelW: 0.22, axles: [1.42, -1.38], bPillars: [-0.36], rows: [-0.05, -0.92], doors: [0.78, -0.36, -1.3], grilleChrome: true };
const decoBase = { L: 4.95, W: 1.88, deco: true, fenderW: 0.24, y0: 0.4, noseY: 1.0, hoodY: 1.08, belt: 1.06, hoodZ: 0.7, roofF: 0.28, roofR: -1.0, rear: -1.62, deckY: 1.0, tailY: 0.82, roofY: 1.7, tumble: 0.12, wheelR: 0.37, wheelW: 0.2, axles: [1.55, -1.42], bPillars: [-0.38], rows: [-0.05, -0.95], doors: [0.66, -0.38, -1.25], cWidth: 0.26 };

export const FLEET = {
  sedan: { label: 'Sedan', category: 'car', gen: 'car', p: sedan, palettes: CIVIL },
  sedan_deco: { label: 'Deco sedan (1930s)', category: 'car', gen: 'car', p: { ...decoBase }, palettes: [P.maroon, P.bottle, P.black, P.navy, P.cream, P.plum].map(([a, b]) => [a, b]), fenderColor: 1 },
  sedan_compact: { label: 'Compact sedan', category: 'car', gen: 'car', p: { L: 4.25, W: 1.74, y0: 0.3, noseY: 0.72, hoodY: 0.9, belt: 0.9, hoodZ: 0.85, roofF: 0.28, roofR: -0.78, rear: -1.3, deckY: 0.93, tailY: 0.92, roofY: 1.46, tumble: 0.2, wheelR: 0.31, wheelW: 0.2, axles: [1.3, -1.25], bPillars: [-0.3], rows: [0, -0.8], doors: [0.8, -0.3, -1.1] }, palettes: [P.teal, P.mustard, P.sky, P.silver, P.red, P.cream] },
  coupe: { label: 'Coupe', category: 'car', gen: 'car', p: { L: 4.55, W: 1.84, y0: 0.27, noseY: 0.66, hoodY: 0.86, belt: 0.86, hoodZ: 0.62, roofF: -0.02, roofR: -0.72, rear: -1.62, deckY: 0.9, tailY: 0.9, roofY: 1.3, tumble: 0.2, wheelR: 0.33, wheelW: 0.24, axles: [1.38, -1.4], rows: [-0.25], doors: [0.6, -0.75], cWidth: 0.22, pillarColor: C.trim }, palettes: [P.red, P.black, P.silver, P.oxblood, P.teal] },
  hatchback: { label: 'Hatchback', category: 'car', gen: 'car', p: { L: 3.95, W: 1.74, y0: 0.3, noseY: 0.74, hoodY: 0.92, belt: 0.92, hoodZ: 0.95, roofF: 0.42, roofR: -1.45, rear: -1.86, rearH: 0.0, deckY: 0.96, tailY: 0.96, roofY: 1.48, tumble: 0.19, wheelR: 0.31, wheelW: 0.2, axles: [1.25, -1.25], bPillars: [-0.35], rows: [0.1, -0.85], doors: [0.9, -0.35] }, palettes: [P.mustard, P.sky, P.red, P.white, P.teal, P.slate] },
  wagon: { label: 'Station wagon', category: 'car', gen: 'car', p: { ...sedan, L: 4.85, roofR: -2.12, rear: -2.32, deckY: 0.96, tailY: 0.96, bPillars: [-0.36, -1.3], rows: [-0.05, -0.92], doors: [0.78, -0.36, -1.3], roofColor: 2 }, palettes: [P.tan, P.bottle, P.cream, P.maroon, P.slate] },
  suv: { label: 'SUV', category: 'car', gen: 'car', p: { L: 4.8, W: 1.96, y0: 0.44, noseY: 0.98, hoodY: 1.14, belt: 1.12, hoodZ: 1.02, roofF: 0.5, roofR: -2.02, rear: -2.26, deckY: 1.14, tailY: 1.14, roofY: 1.84, tumble: 0.15, wheelR: 0.4, wheelW: 0.27, axles: [1.48, -1.45], bPillars: [-0.3, -1.25], rows: [0.1, -0.85], doors: [0.95, -0.3, -1.25], grilleH: 0.26, grilleW: 0.5, headH: 0.12, bumper: C.trim, pillarColor: C.trim }, palettes: [P.black, P.gunmetal, P.silver, P.navy, P.bottle] },
  pickup: { label: 'Pickup', category: 'truck', gen: 'car', p: { L: 5.4, W: 1.98, y0: 0.46, noseY: 1.02, hoodY: 1.16, belt: 1.14, hoodZ: 1.15, roofF: 0.66, roofR: -0.42, rear: -0.58, rearH: 0.55, deckZ: -0.62, deckY: 1.14, tailY: 1.12, roofY: 1.86, tumble: 0.14, wheelR: 0.4, wheelW: 0.27, axles: [1.78, -1.75], rows: [0.25], doors: [1.08, -0.58], bed: [-0.7, -2.58], grilleH: 0.3, grilleW: 0.56, grilleChrome: true, bumper: C.chrome }, palettes: [P.red, P.tan, P.white, P.bottle, P.navy] },
  van_delivery: { label: 'Delivery van', category: 'van', gen: 'car', p: { L: 5.3, W: 2.0, y0: 0.38, noseY: 0.96, hoodY: 1.14, belt: 1.16, hoodZ: 1.9, roofF: 1.25, roofR: 0.62, rear: 0.62, boxFrom: 0.58, boxY: 2.36, roofY: 2.32, tumble: 0.1, wheelR: 0.36, wheelW: 0.24, axles: [1.82, -1.82], rows: [1.0], doors: [1.78, 0.6, -0.2], grilleH: 0.24, grilleW: 0.5 }, palettes: [P.white, P.mustard, P.bottle, P.sky, P.tan], livery: 'band' },
  box_truck: { label: 'Box truck', category: 'truck', gen: 'truck', p: { L: 7.4, W: 2.3, y0: 0.5, noseY: 1.22, hoodY: 1.36, belt: 1.36, hoodZ: 2.55, roofF: 2.1, roofR: 1.45, rear: 1.4, cabBack: 1.32, roofY: 2.42, tumble: 0.1, wheelR: 0.46, wheelW: 0.28, axles: [2.75, -2.25], rows: [1.75], doors: [2.45, 1.4], grilleH: 0.4, grilleW: 0.6, box: { z0: 1.2, y0: 0.95, y1: 3.35, ribs: 4, roll: true } }, palettes: [P.white, P.mustard, P.bottle, P.maroon], livery: 'boxband' },
  taxi: { label: 'Checker cab', category: 'service', gen: 'car', p: { ...decoBase, roofColor: 1 }, palettes: [[0xe0b52a, 0x16171b], [0xd9a821, 0x16171b]], livery: 'taxi' },
  bus: { label: 'City bus', category: 'service', gen: 'bus', p: { L: 11.6, W: 2.55, H: 3.05, axles: [3.55, -2.95], midDoor: -0.6 }, palettes: [[0x2c5a8f, 0xd8d2bf], [0x7a2430, 0xd8d2bf], [0x2f5a3c, 0xd8d2bf]] },
  police: { label: 'GCPD cruiser', category: 'emergency', gen: 'car', p: { ...sedan, bumper: C.trim, pushBar: true, glassColor: C.glassDark }, palettes: [[0x18213a, 0xdcd8cc]], livery: 'police' },
  police_van: { label: 'GCPD tactical van', category: 'emergency', gen: 'car', p: { L: 5.9, W: 2.2, y0: 0.45, noseY: 1.08, hoodY: 1.28, belt: 1.32, hoodZ: 2.1, roofF: 1.5, roofR: 0.82, rear: 0.82, boxFrom: 0.78, boxY: 2.6, roofY: 2.56, tumble: 0.12, wheelR: 0.43, wheelW: 0.3, axles: [2.02, -1.95], rows: [1.2], doors: [2.0, 0.8, -0.2], grilleH: 0.34, grilleW: 0.6, glassColor: C.glassDark, pushBar: true, bumper: C.trim }, palettes: [[0x1a2033, 0x3a4256], [0x262a30, 0x16171b]], livery: 'swat' },
  ambulance: { label: 'Ambulance', category: 'emergency', gen: 'truck', p: { L: 6.3, W: 2.2, y0: 0.42, noseY: 1.04, hoodY: 1.2, belt: 1.22, hoodZ: 2.35, roofF: 1.85, roofR: 1.18, rear: 1.15, cabBack: 1.08, roofY: 2.3, tumble: 0.1, wheelR: 0.4, wheelW: 0.26, axles: [2.3, -1.85], rows: [1.5], doors: [2.25, 1.15], grilleH: 0.3, grilleW: 0.56, box: { z0: 1.06, y0: 0.82, y1: 2.85, ribs: 0 } }, palettes: [[0xdedad0, 0xb3202a]], livery: 'ambulance' },
  fire_engine: { label: 'Fire engine', category: 'emergency', gen: 'truck', p: { L: 9.6, W: 2.5, y0: 0.55, noseY: 1.45, hoodY: 1.5, belt: 1.5, hoodZ: 4.62, flatNose: true, roofF: 4.35, roofR: 2.55, rear: 2.5, cabBack: 2.45, roofY: 2.95, tumble: 0.08, wheelR: 0.5, wheelW: 0.32, axles: [3.4, -2.6], rows: [3.9, 3.0], bPillars: [3.45], doors: [4.4, 3.45, 2.5], grilleH: 0.5, grilleW: 0.7, grilleChrome: true, bumper: C.chrome, box: { z0: 2.35, y0: 0.9, y1: 2.55, ribs: 5, rearDoors: false } }, palettes: [[0x9c1b22, 0xe3ddcc]], livery: 'fire' },
  garbage_truck: { label: 'Garbage truck', category: 'service', gen: 'truck', p: { L: 8.4, W: 2.5, y0: 0.55, noseY: 1.4, hoodY: 1.46, belt: 1.48, hoodZ: 3.98, flatNose: true, roofF: 3.72, roofR: 2.75, rear: 2.7, cabBack: 2.62, roofY: 2.8, tumble: 0.08, wheelR: 0.5, wheelW: 0.32, axles: [3.0, -2.4], rows: [3.25], doors: [3.9, 2.7], grilleH: 0.5, grilleW: 0.7, box: { z0: 2.5, y0: 0.95, y1: 3.3, ribs: 3, rearDoors: false, hopper: true } }, palettes: [[0x2f5a3c, 0x8c9096], [0x5a5d63, 0xd8b23a]], livery: 'garbage' },
  limousine: { label: 'Wayne limousine', category: 'car', gen: 'car', p: { L: 6.6, W: 1.96, y0: 0.3, noseY: 0.8, hoodY: 0.99, belt: 0.98, hoodZ: 1.55, roofF: 0.95, roofR: -1.98, rear: -2.5, deckY: 1.0, tailY: 0.97, roofY: 1.47, tumble: 0.17, wheelR: 0.35, wheelW: 0.24, axles: [2.3, -2.15], bPillars: [0.2, -0.95], rows: [0.55, -0.45, -1.55], doors: [1.48, 0.2, -0.95, -2.1], grilleChrome: true, grilleH: 0.24, grilleW: 0.36, glassColor: C.glassDark, bumper: C.chrome, cWidth: 0.3 }, palettes: [[0x101114, 0x8c8676], [0x2a1a22, 0x8c8676]], livery: 'wayne' },
  motorcycle: { label: 'Motorcycle', category: 'bike', gen: 'bike', p: { wheelR: 0.32, wb: 1.42 }, palettes: [P.red, P.black, P.navy, P.cream, P.bottle] },
  gang_van: { label: 'Gang van (Joker)', category: 'villain', gen: 'car', p: { L: 5.3, W: 2.0, y0: 0.38, noseY: 0.96, hoodY: 1.14, belt: 1.16, hoodZ: 1.9, roofF: 1.25, roofR: 0.62, rear: 0.62, boxFrom: 0.58, boxY: 2.36, roofY: 2.32, tumble: 0.1, wheelR: 0.38, wheelW: 0.28, axles: [1.82, -1.82], rows: [1.0], doors: [1.78, 0.6], grilleH: 0.24, grilleW: 0.5, pushBar: true, bumper: C.trim }, palettes: [[0x6b2f8f, 0x3fae4a]], livery: 'joker' },
  armored_truck: { label: 'Armoured money truck', category: 'service', gen: 'car', p: { L: 6.4, W: 2.36, y0: 0.5, noseY: 1.16, hoodY: 1.36, belt: 1.42, hoodZ: 2.35, roofF: 1.9, roofR: 1.3, rear: 1.3, boxFrom: 1.26, boxY: 2.82, roofY: 2.62, tumble: 0.1, wheelR: 0.46, wheelW: 0.32, axles: [2.25, -2.1], rows: [1.6], doors: [2.25, 1.28], grilleH: 0.36, grilleW: 0.62, glassColor: C.glassDark, bumper: C.trim, pushBar: true }, palettes: [[0x5c6152, 0x2a2c26], [0x4f5866, 0x23262c]], livery: 'armored' },
};

export const FLEET_TYPES = Object.keys(FLEET);

// Builds one fleet vehicle's parts into `b`. Returns the info object described in buildCar.
export function buildFleetVehicle(b, type, palIndex = 0) {
  const spec = FLEET[type];
  if (!spec) throw new Error(`unknown fleet type ${type}`);
  const pal = spec.palettes[((palIndex % spec.palettes.length) + spec.palettes.length) % spec.palettes.length];
  const p = { ...spec.p };
  if (spec.fenderColor === 1) p.fenderColor = 1;
  let info;
  if (spec.gen === 'bike') info = buildBike(b, p, pal);
  else if (spec.gen === 'bus') info = buildBus(b, p, pal);
  else {
    info = buildCar(b, p, pal);
    if (spec.gen === 'truck') truckBody(b, p, pal, info);
  }
  livery(b, spec.livery, p, pal, info);
  if (p.pushBar) pushBar(b, p, info);
  info.pal = pal;
  return info;
}

function truckBody(b, p, pal, info) {
  const bx = p.box, hw = p.W / 2;
  const z1 = -p.L / 2;
  chassis(b, p.cabBack, z1, p.y0 + 0.05, hw);
  cargoBox(b, { z0: bx.z0, z1, y0: bx.y0, y1: bx.y1, hw: hw - 0.02, color: pal[0], ribs: bx.ribs, rearDoors: bx.rearDoors !== false, roll: bx.roll });
  // Rear wheel arches as dark tubs under the box; mudflaps behind the rear wheels.
  const rz = p.axles[p.axles.length - 1];
  b.add(boxAt(p.W - 0.1, bx.y0 - 0.2, 1.3, 0, (bx.y0 + 0.2) / 2 + 0.05, rz), { color: C.under, ink: false });
  for (const s of [-1, 1]) b.add(boxAt(0.3, 0.4, 0.03, s * (hw - 0.18), 0.35, rz - p.wheelR - 0.12), { color: C.rubber, ink: false });
  b.add(boxAt(p.W, 0.14, 0.14, 0, bx.y0 - 0.05, z1 - 0.06), { color: C.trim }); // rear underride bar
  info.H = Math.max(info.H, bx.y1);
  info.silhouette = [...info.silhouette.slice(0, -1), [bx.z0, bx.y1], [z1, bx.y1], [z1, bx.y0], [p.cabBack, p.y0 + 0.1]];
  if (bx.hopper) {
    // Garbage compactor: a slanted rear hopper hanging off the box.
    b.add(loft([
      { z: z1 - 0.02, pts: ring8(0.75, hw - 0.12, hw - 0.06, bx.y1 - 0.35, hw - 0.12, bx.y1 - 0.1) },
      { z: z1 - 0.75, pts: ring8(0.9, hw - 0.14, hw - 0.08, 1.7, hw - 0.16, 2.3) },
    ]), { color: pal[0], paint: 1 });
    b.add(boxAt(p.W - 0.6, 0.5, 0.05, 0, 1.25, z1 - 0.7), { color: C.under, ink: false });
  }
}

function pushBar(b, p, info) {
  const z = p.L / 2 + 0.18, y = p.y0 + 0.25;
  b.add(boxAt(0.9, 0.08, 0.08, 0, y + 0.3, z), { color: C.trim });
  b.add(boxAt(0.9, 0.08, 0.08, 0, y, z), { color: C.trim });
  for (const s of [-1, 1]) b.add(boxAt(0.08, 0.45, 0.08, s * 0.42, y + 0.15, z), { color: C.trim });
}

// Liveries and type-specific dressing.
function livery(b, kind, p, pal, info) {
  const k = info.keys;
  const L2 = p.L / 2;
  const roofY = info.roof?.roofY ?? p.boxY ?? p.roofY;
  switch (kind) {
    case 'taxi': {
      // A black-and-white checker band along the waist and a lit roof sign.
      stripe(b, k, L2 - 1.2, -L2 + 0.7, p.belt - 0.2, p.belt - 0.08, C.ink, { checker: 0.15, alt: 0xf0ece0 });
      b.add(boxAt(0.62, 0.2, 0.26, 0, roofY + 0.1, (p.roofF + p.roofR) / 2), { to: 'lamps', lamp: 'sign', on: 0xffd75a, off: 0x5a4a20 });
      b.add(boxAt(0.66, 0.04, 0.3, 0, roofY + 0.02, (p.roofF + p.roofR) / 2), { color: C.trim });
      break;
    }
    case 'police': {
      // GCPD: navy body, cream doors, a blue-and-cream checker band, light bar, spotlight.
      for (const [z0, z1] of [[0.74, -0.34], [-0.38, -1.28]]) stripe(b, k, z0, z1, p.y0 + 0.2, p.belt - 0.03, pal[1]);
      stripe(b, k, L2 - 0.4, -L2 + 0.35, p.belt - 0.15, p.belt - 0.05, 0x2a4d8f, { checker: 0.1, alt: 0xf0ece0, lift: 0.009 });
      lightBar(b, roofY, (p.roofF + p.roofR) / 2 + 0.1, 1.2);
      b.add(cylZ(0.07, 0.14, 0.75, p.belt + 0.25, p.hoodZ - 0.35, 8), { color: C.chrome, smooth: true });
      break;
    }
    case 'swat': {
      lightBar(b, roofY, p.roofF - 0.15, 1.3);
      stripe(b, k, L2 - 0.2, -L2 + 0.2, p.belt - 0.12, p.belt - 0.02, 0x2a4d8f, { checker: 0.1, alt: 0xd8d2bf, lift: 0.009 });
      // Window grilles over the cab glass and armour plates on the flanks.
      for (const s of [-1, 1]) {
        const x = s * (info.bh - 0.02);
        for (let i = 0; i < 4; i++) b.add(boxAt(0.03, 0.03, 0.55, x - s * 0.09, p.belt + 0.2 + i * 0.18, (p.roofF + p.roofR) / 2), { color: C.trim, ink: false });
        b.add(boxAt(0.04, 1.0, p.L * 0.5, s * (info.bh + 0.02), p.belt + 0.55, -L2 * 0.42), { color: pal[1] });
        b.add(boxAt(0.12, 0.05, 1.0, s * (info.bh + 0.06), p.y0 + 0.05, p.boxFrom + 0.2), { color: C.trim }); // step
      }
      b.add(boxAt(1.2, 0.08, 1.6, 0, roofY + 0.05, -1.2), { color: C.trim }); // roof rack
      break;
    }
    case 'ambulance': {
      stripe(b, k, L2 - 0.2, p.cabBack + 0.05, p.belt - 0.14, p.belt - 0.02, pal[1]);
      const hw = p.W / 2;
      for (const s of [-1, 1]) {
        b.add(boxAt(0.02, 0.22, p.box.z0 + L2 - 0.2, s * (hw + 0.005), 1.35, (p.box.z0 - L2) / 2), { color: pal[1], ink: false });
        // A block-check band round the module (no protected emblems such as the red cross).
        for (let i = 0; i < 12; i++) b.add(boxAt(0.02, 0.26, 0.3, s * (hw + 0.006), 1.95 + (i % 2) * 0.26, p.box.z0 - 0.35 - i * 0.34), { color: i % 4 < 2 ? pal[1] : 0x2a4d8f, ink: false });
        b.add(boxAt(0.04, 0.5, 0.5, s * (hw + 0.002), 1.95, -2.1), { to: 'glass', color: C.glassDark });
        b.add(boxAt(0.12, 0.12, 0.12, s * (hw - 0.1), p.box.y1 + 0.06, -L2 + 0.12), { to: 'lamps', lamp: 'beaconA', on: C.red, off: dim(C.red) });
        b.add(boxAt(0.12, 0.12, 0.12, s * (hw - 0.1), p.box.y1 + 0.06, p.box.z0 - 0.1), { to: 'lamps', lamp: 'beaconB', on: C.red, off: dim(C.red) });
      }
      lightBar(b, roofY, p.roofF - 0.25, 1.1, [C.red, C.red]);
      break;
    }
    case 'fire': {
      const hw = p.W / 2;
      stripe(b, k, L2 - 0.1, p.cabBack + 0.05, p.belt - 0.14, p.belt - 0.04, pal[1]);
      for (const s of [-1, 1]) b.add(boxAt(0.02, 0.14, p.box.z0 + L2 - 0.3, s * (hw + 0.005), 1.3, (p.box.z0 - L2) / 2), { color: pal[1], ink: false });
      lightBar(b, roofY, p.roofF - 0.25, 1.5, [C.red, C.red]);
      // The ladder: two stiles and rungs along the roof, on a turntable at the rear.
      const y = p.box.y1 + 0.3, za = p.cabBack + 1.4, zb = -L2 - 0.4;
      b.add(cylY(0.45, 0.2, 0, p.box.y1 + 0.1, -L2 + 1.2, 12), { color: C.trim });
      for (const s of [-1, 1]) b.add(boxAt(0.08, 0.14, za - zb, s * 0.35, y, (za + zb) / 2), { color: C.chrome });
      for (let z = zb + 0.2; z < za; z += 0.5) b.add(boxAt(0.7, 0.04, 0.04, 0, y, z), { color: C.chrome, ink: false });
      b.add(cylX(0.32, 0.7, 0, p.box.y1 - 0.3, p.cabBack - 0.35, 12), { color: pal[1] }); // hose reel
      b.add(boxAt(p.W - 0.2, 0.08, 0.5, 0, p.box.y0 - 0.06, -L2 - 0.2), { color: C.chrome }); // tail step
      break;
    }
    case 'garbage': {
      const hw = p.W / 2;
      stripe(b, k, L2 - 0.1, p.cabBack + 0.05, p.belt - 0.12, p.belt - 0.04, 0xd8d2bf);
      for (const s of [-1, 1]) b.add(boxAt(0.02, 0.2, 2.0, s * (hw + 0.005), 2.0, -1.0), { color: pal[1], ink: false });
      lightBar(b, roofY, p.roofF - 0.25, 0.6, [C.amber, C.amber]);
      for (const s of [-1, 1]) b.add(boxAt(0.1, 0.06, 0.6, s * (hw - 0.3), 0.6, -L2 - 0.6), { color: C.chrome }); // riding steps
      break;
    }
    case 'joker': {
      // A bold green band, a painted grin across each flank, a spinning beacon is added by the
      // createJokerVan wrapper (kept separate so it can turn).
      stripe(b, k, L2 - 0.2, -L2 + 0.2, p.belt - 0.2, p.belt + 0.05, pal[1]);
      for (const s of [-1, 1]) {
        const x = s * (info.bh + 0.009);
        const pts = [];
        for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); pts.push([-0.7 - Math.cos(a) * 1.0, 1.75 - Math.sin(a) * 0.4]); }
        for (let i = 12; i >= 0; i--) { const a = Math.PI * (i / 12); pts.push([-0.7 - Math.cos(a) * 1.0, 1.75 - Math.sin(a) * 0.22]); }
        b.add(flankDecal(pts, x, s), { color: 0xe8e2d4, ink: false });
        for (let i = -3; i <= 3; i++) b.add(flankDecal([[-0.7 + i * 0.25 - 0.012, 1.4], [-0.7 + i * 0.25 + 0.012, 1.4], [-0.7 + i * 0.25 + 0.012, 1.6], [-0.7 + i * 0.25 - 0.012, 1.6]], x + s * 0.002, s), { color: C.ink, ink: false });
      }
      b.add(boxAt(1.2, 0.06, 1.4, 0, roofY + 0.03, -0.8), { color: C.trim }); // roof rack
      break;
    }
    case 'armored': {
      const hw = info.bh;
      // Reinforcing bands round the body, rivet strips, gun ports, a roof vent.
      for (const z of [0.6, -0.6, -1.8]) {
        b.add(boxAt(p.W + 0.03, 0.06, 0.08, 0, p.boxY - 0.15, z), { color: pal[1] });
        for (const s of [-1, 1]) b.add(boxAt(0.03, p.boxY - p.y0 - 0.3, 0.08, s * (hw + 0.012), (p.boxY + p.y0) / 2, z), { color: pal[1], ink: false });
      }
      for (const s of [-1, 1]) {
        b.add(boxAt(0.03, 0.14, 0.22, s * (hw + 0.01), 1.9, -0.0), { color: C.ink, ink: false });
        b.add(boxAt(0.03, 0.14, 0.22, s * (hw + 0.01), 1.9, -1.2), { color: C.ink, ink: false });
        b.add(boxAt(0.04, 0.3, 0.4, s * (hw + 0.002), p.belt + 0.4, (p.roofF + p.roofR) / 2), { to: 'glass', color: C.glassDark });
      }
      b.add(boxAt(0.7, 0.18, 0.5, 0, p.boxY + 0.09, -0.9), { color: pal[1] });
      lightBar(b, roofY, p.roofF - 0.2, 0.5, [C.amber, C.amber]);
      break;
    }
    case 'band': {
      stripe(b, k, (p.boxFrom ?? L2) - 0.05, -L2 + 0.15, p.belt + 0.25, p.belt + 0.42, pal[1]);
      stripe(b, k, L2 - 0.3, -L2 + 0.15, p.belt - 0.16, p.belt - 0.06, pal[1]);
      break;
    }
    case 'boxband': {
      const hw = p.W / 2 - 0.02;
      for (const s of [-1, 1]) b.add(boxAt(0.02, 0.36, p.box.z0 + L2 - 0.5, s * (hw + 0.005), 2.35, (p.box.z0 - L2) / 2), { color: pal[1], ink: false });
      break;
    }
    case 'wayne': {
      // A thin coachline and a W crest plate on the rear doors.
      stripe(b, k, L2 - 0.3, -L2 + 0.3, p.belt - 0.08, p.belt - 0.06, 0xb89a52, { lift: 0.008 });
      for (const s of [-1, 1]) b.add(boxAt(0.02, 0.1, 0.1, s * (info.bh + 0.01), p.belt - 0.25, -0.6), { color: 0xb89a52, ink: false });
      b.add(cylZ(0.03, 0.12, 0, p.noseY + 0.08, L2 - 0.08, 6), { color: C.chrome }); // hood ornament
      break;
    }
    default: break;
  }
}
