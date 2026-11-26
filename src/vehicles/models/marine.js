// River, harbour and lake craft: an architecture tour boat (Chicago river style: long, low, an open
// upper deck), a GCPD police launch, a harbour tug and a small speedboat. Origin on the waterline
// at the hull's centre, +z the bow. Each is one skinned body (propeller bone) + ink + glass +
// lamps; update(dt) spins the prop. Hulls are lofted V-sections with a raked bow and flat transom.
import * as THREE from 'three';
import { VehicleBuilder, spawnTemplate, fleetMaterials, applyLamps, loft, boxAt, cylY, cylZ, C } from './kit.js';
import { lightBar } from './bodies.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const BOAT_TYPES = ['tour_boat', 'police_launch', 'tug', 'speedboat'];

// A hull section, 8 points in the kit's ring order: keel, bilge, waterline, sheer.
function hullRing(hw, draft, free, keel = 0.3) {
  return [[-hw * keel, -draft], [-hw * 0.82, -draft * 0.4], [-hw, free * 0.35], [-hw * 0.97, free], [hw * 0.97, free], [hw, free * 0.35], [hw * 0.82, -draft * 0.4], [hw * keel, -draft]];
}

// A full hull from L, W, draft, freeboard; bowRise lifts the sheer at the bow.
function hull(b, { L, W, draft, free, bowRise = 0.4, color, boot = 0x16171b, stripe = null }) {
  const hl = L / 2, hw = W / 2;
  const st = [
    { z: hl, pts: hullRing(0.04, draft * 0.2, free + bowRise, 0.9) },
    { z: hl - L * 0.12, pts: hullRing(hw * 0.62, draft * 0.75, free + bowRise * 0.55, 0.15) },
    { z: hl - L * 0.3, pts: hullRing(hw * 0.95, draft, free + bowRise * 0.15) },
    { z: -hl + L * 0.15, pts: hullRing(hw, draft * 0.9, free) },
    { z: -hl, pts: hullRing(hw * 0.92, draft * 0.6, free, 0.5) },
  ];
  b.add(loft(st), { color, paint: 1 });
  // Boot-top: a dark band at the waterline, and an optional stripe below the sheer.
  for (const s of [-1, 1]) {
    b.add(boxAt(0.02, 0.18, L * 0.62, s * (hw + 0.005), 0.05, -L * 0.08), { color: boot, ink: false });
    if (stripe) b.add(boxAt(0.02, 0.12, L * 0.6, s * (hw * 0.985 + 0.01), free * 0.72, -L * 0.08), { color: stripe, ink: false });
  }
  // Deck.
  b.add(boxAt(W * 0.9, 0.05, L * 0.82, 0, free - 0.02, -L * 0.06), { color: 0x6a5a48, ink: false });
}

function prop(b, z, y, r = 0.35) {
  b.bone('prop', 'root', V(0, y, z));
  for (let k = 0; k < 3; k++) b.add(boxAt(0.06, r * 2, 0.04, 0, 0, 0).rotateZ((k / 3) * Math.PI).translate(0, y, z), { color: 0x8a7a4a, bone: 'prop', ink: false });
  b.add(cylZ(0.08, 0.3, 0, y, z + 0.15, 8), { color: C.hub, bone: 'prop', ink: false });
}

function navLights(b, L, W, mastY, mastZ) {
  b.add(boxAt(0.08, 0.08, 0.12, W / 2 - 0.05, 0.9, L * 0.15), { to: 'lamps', lamp: 'nav', on: 0x3bff6a, off: 0x1a3a22 });
  b.add(boxAt(0.08, 0.08, 0.12, -W / 2 + 0.05, 0.9, L * 0.15), { to: 'lamps', lamp: 'nav', on: 0xff3b3b, off: 0x3a1a1a });
  b.add(new THREE.SphereGeometry(0.08, 6, 5).translate(0, mastY, mastZ), { to: 'lamps', lamp: 'nav', on: 0xf6f3e4, off: 0x3a3a3a });
}

function windowsBand(b, x, y0, y1, z0, z1, n, lit = true) {
  const pitch = (z0 - z1) / n;
  for (let i = 0; i < n; i++) {
    const z = z0 - pitch * (i + 0.5);
    for (const s of [-1, 1]) b.add(boxAt(0.03, y1 - y0, pitch * 0.72, s * x, (y0 + y1) / 2, z), lit ? { to: 'lamps', lamp: 'cabin', on: C.glassLit, off: 0x2a2c30 } : { to: 'glass', color: C.glass });
  }
}

const BUILD = {
  tour_boat(b) {
    const L = 20, W = 5.2, free = 0.9;
    hull(b, { L, W, draft: 0.8, free, bowRise: 0.3, color: 0x1e2b44, stripe: 0xd9cfb4 });
    // Lower saloon: a long low cabin with a band of lit windows, roof is the open upper deck.
    b.add(boxAt(W - 0.6, 1.5, L - 5.5, 0, free + 0.75, -1.2), { color: 0xd8ccaa });
    windowsBand(b, W / 2 - 0.29, free + 0.55, free + 1.3, L / 2 - 3.0, -L / 2 + 2.8, 9);
    b.add(boxAt(W - 0.4, 0.1, L - 5.0, 0, free + 1.55, -1.2), { color: 0x2a2f3a });
    // Upper deck: benches, a rail all round, a canvas awning over the forward half.
    for (let z = 5.0; z > -9; z -= 1.4) for (const s of [-1, 1]) b.add(boxAt(1.3, 0.45, 0.35, s * 1.0, free + 1.85, z), { color: 0x5a4636, ink: false });
    for (const s of [-1, 1]) {
      b.add(boxAt(0.05, 0.05, L - 5.2, s * (W / 2 - 0.25), free + 2.5, -1.2), { color: C.chrome, ink: false });
      for (let z = 6.8; z > -9.6; z -= 1.6) b.add(boxAt(0.04, 0.9, 0.04, s * (W / 2 - 0.25), free + 2.05, z), { color: C.chrome, ink: false });
      for (const z of [6.6, 1.0]) b.add(boxAt(0.06, 1.8, 0.06, s * (W / 2 - 0.35), free + 2.5, z), { color: 0x2a2f3a });
    }
    b.add(boxAt(W - 0.5, 0.08, 6.2, 0, free + 3.42, 3.8), { color: 0x7a2430 });
    // Wheelhouse at the bow end of the upper deck.
    b.add(boxAt(2.2, 1.2, 1.6, 0, free + 2.2, 7.2), { color: 0xd8ccaa });
    b.add(boxAt(2.0, 0.5, 0.04, 0, free + 2.45, 8.01), { to: 'glass', color: C.glass });
    b.add(cylY(0.05, 1.2, 0, free + 3.4, 7.2, 6), { color: C.trim, ink: false });
    navLights(b, L, W, free + 4.0, 7.2);
    prop(b, -L / 2 + 0.6, -0.5);
  },
  police_launch(b) {
    const L = 11, W = 3.4, free = 0.95;
    hull(b, { L, W, draft: 0.7, free, bowRise: 0.55, color: 0xdcd8cc, stripe: 0x1e2b44 });
    b.add(boxAt(2.6, 1.3, 4.0, 0, free + 0.65, -0.6), { color: 0x1e2b44 });
    b.add(boxAt(2.4, 0.6, 0.04).rotateX(-0.3).translate(0, free + 0.95, 1.42), { to: 'glass', color: C.glassDark });
    windowsBand(b, 1.31, free + 0.6, free + 1.1, 1.0, -2.4, 3, false);
    b.add(boxAt(2.8, 0.08, 4.4, 0, free + 1.34, -0.6), { color: 0xdcd8cc });
    lightBar(b, free + 1.38, 0.2, 1.4);
    b.add(cylY(0.05, 1.4, 0, free + 2.1, -1.6, 6), { color: C.trim, ink: false });
    b.add(cylZ(0.12, 0.25, 1.0, free + 1.5, 1.0, 10), { color: C.chrome }); // searchlight
    for (const s of [-1, 1]) b.add(boxAt(0.12, 0.3, 6.5, s * (W / 2 + 0.03), free * 0.55, -0.3), { color: 0x16171b, ink: false }); // rub rail
    navLights(b, L, W, free + 2.8, -1.6);
    prop(b, -L / 2 + 0.4, -0.45, 0.3);
  },
  tug(b) {
    const L = 14, W = 5.0, free = 1.3;
    hull(b, { L, W, draft: 1.6, free, bowRise: 0.9, color: 0x16171b, boot: 0x7a2430, stripe: 0xd9cfb4 });
    // Fendering: a fat rubber rope round the bow and tyres along the sides.
    b.add(new THREE.TorusGeometry(0.9, 0.22, 6, 10, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2 * 0).translate(0, free + 0.3, L / 2 - 0.9), { color: 0x1a1a1a, ink: false });
    for (let z = 3; z > -6; z -= 1.8) for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.28, 0.1, 5, 8).rotateY(Math.PI / 2).translate(s * (W / 2 + 0.05), free * 0.6, z), { color: 0x101010, ink: false });
    // Superstructure: deckhouse, tall wheelhouse with windows all round, the stack.
    b.add(boxAt(3.6, 1.6, 5.0, 0, free + 0.8, -0.5), { color: 0x8f2027 });
    b.add(boxAt(3.0, 1.5, 2.6, 0, free + 2.35, 0.7), { color: 0xd9cfb4 });
    b.add(boxAt(3.4, 0.12, 3.0, 0, free + 3.16, 0.7), { color: 0x16171b });
    b.add(boxAt(2.7, 0.6, 0.04, 0, free + 2.6, 2.01), { to: 'lamps', lamp: 'cabin', on: C.glassLit, off: 0x2a2c30 });
    windowsBand(b, 1.51, free + 2.3, free + 2.9, 1.8, -0.4, 2);
    b.add(cylY(0.55, 2.2, 0, free + 2.6, -2.2, 12, 0.6), { color: 0x16171b, smooth: true });
    b.add(cylY(0.6, 0.4, 0, free + 3.1, -2.2, 12), { color: 0x8f2027, ink: false });
    b.add(boxAt(0.5, 0.5, 0.5, 0, free + 0.25, -5.2), { color: 0x2a2c33 }); // towing bitt
    b.add(cylY(0.06, 2.0, 0, free + 4.2, 0.7, 6), { color: C.trim, ink: false });
    navLights(b, L, W, free + 5.2, 0.7);
    prop(b, -L / 2 + 0.9, -1.0, 0.6);
  },
  speedboat(b) {
    const L = 6.5, W = 2.2, free = 0.7;
    hull(b, { L, W, draft: 0.45, free, bowRise: 0.35, color: 0xd9cfb4, stripe: 0x8f2027 });
    b.add(boxAt(W * 0.86, 0.06, 2.4, 0, free + 0.03, 1.4), { color: 0xd9cfb4 }); // foredeck
    b.add(boxAt(1.8, 0.4, 0.04).rotateX(-0.5).translate(0, free + 0.22, 0.2), { to: 'glass', color: C.glass });
    for (const z of [-0.4, -1.4]) b.add(boxAt(1.6, 0.45, 0.6, 0, free + 0.05, z), { color: 0x8f2027, ink: false });
    b.add(boxAt(0.6, 0.7, 0.5, 0, free - 0.0, -2.85), { color: 0x2a2c33 }); // outboard
    b.add(boxAt(0.12, 0.08, 0.06, 0.95, free + 0.1, 2.8), { to: 'lamps', lamp: 'nav', on: 0x3bff6a, off: 0x1a3a22 });
    b.add(boxAt(0.12, 0.08, 0.06, -0.95, free + 0.1, 2.8), { to: 'lamps', lamp: 'nav', on: 0xff3b3b, off: 0x3a1a1a });
    prop(b, -3.15, -0.3, 0.22);
  },
};

const templates = {};
// opts: none yet. Returns { group, kind: 'boat', type, prop (bone: rotation.z spins), length,
//   width, setLamps({ nav, cabin, beaconA, beaconB }), update(dt) }
export function createBoat(type = 'tour_boat') {
  if (!BUILD[type]) throw new Error(`unknown boat ${type}`);
  if (!templates[type]) {
    const b = new VehicleBuilder({ outline: type === 'speedboat' ? 0.02 : 0.03, name: type });
    BUILD[type](b);
    templates[type] = b.template({ extraBounds: 0.2 });
  }
  const s = spawnTemplate(templates[type], { materials: fleetMaterials() });
  const state = { nav: true, cabin: true }, last = {};
  applyLamps(s.lamps, s.lampRanges, state, last);
  const box = new THREE.Box3().setFromBufferAttribute(templates[type].geos.body.attributes.position);
  let t = 0, siren = false;
  return {
    group: s.group, kind: 'boat', type, prop: s.bones.prop, bones: s.bones,
    length: box.max.z - box.min.z, width: box.max.x - box.min.x,
    setLamps(st) { Object.assign(state, st); applyLamps(s.lamps, s.lampRanges, state, last); },
    setSiren(on) { siren = on; if (!on) this.setLamps({ beaconA: false, beaconB: false }); },
    update(dt, throttle = 1) {
      t += dt;
      if (s.bones.prop) s.bones.prop.rotation.z += dt * 20 * throttle;
      if (siren) { const ph = Math.floor(t * 6) % 2; this.setLamps({ beaconA: ph === 0, beaconB: ph === 1 }); }
    },
  };
}
