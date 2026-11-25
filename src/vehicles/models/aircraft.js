// Aircraft over the city: a light helicopter in GCPD or news livery (main and tail rotors on
// bones, a searchlight lamp), and a better GCPD blimp than cityLife's scaled sphere: a lathed
// envelope, cruciform tail fins, a gondola with lit windows, engine pods with props, and anchors
// for its name boards and searchlight beam. Origin: helicopter on its skids; blimp at the
// envelope's centre line (the game flies it at y ~118).
import * as THREE from 'three';
import { VehicleBuilder, spawnTemplate, fleetMaterials, applyLamps, loft, ring8, boxAt, cylY, cylZ, C } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const HELI_LIVERY = {
  gcpd: { body: 0x1e2b44, band: 0xdcd8cc, accent: 0x2a4d8f },
  news: { body: 0xd9d4c6, band: 0x8f2027, accent: 0x16171b },
};

function heliTemplate(kind) {
  const L = HELI_LIVERY[kind] ?? HELI_LIVERY.gcpd;
  const b = new VehicleBuilder({ outline: 0.025, name: `heli-${kind}` });
  // Cabin pod: a rounded loft, glazed nose, tapering into the tail boom.
  b.add(loft([
    { z: 2.0, pts: ring8(0.95, 0.15, 0.25, 1.3, 0.18, 1.5) },
    { z: 1.6, pts: ring8(0.65, 0.5, 0.7, 1.45, 0.5, 2.05) },
    { z: 0.2, pts: ring8(0.6, 0.66, 0.82, 1.5, 0.6, 2.25) },
    { z: -1.3, pts: ring8(0.7, 0.55, 0.72, 1.55, 0.5, 2.15) },
    { z: -2.0, pts: ring8(1.25, 0.22, 0.3, 1.7, 0.2, 1.95) },
  ]), { color: L.body });
  b.add(loft([
    { z: 2.04, pts: ring8(1.0, 0.12, 0.22, 1.3, 0.16, 1.48) },
    { z: 1.25, pts: ring8(0.7, 0.5, 0.72, 1.5, 0.52, 2.06) },
    { z: 0.95, pts: ring8(0.72, 0.52, 0.74, 1.52, 0.54, 2.1) },
  ]).scale(1.01, 1, 1), { to: 'glass', color: C.glass });
  for (const s of [-1, 1]) {
    b.add(boxAt(0.03, 0.55, 1.0, s * 0.83, 1.65, 0.1), { to: 'glass', color: C.glass }); // door windows
    b.add(boxAt(0.02, 0.16, 3.3, s * 0.83, 1.12, -0.1), { color: L.band, ink: false });
    // Skids on struts.
    b.add(cylZ(0.05, 3.2, s * 0.9, 0.06, 0.1, 6), { color: C.trim });
    for (const z of [0.9, -0.8]) b.add(boxAt(0.06, 0.62, 0.08).rotateZ(s * 0.25).translate(s * 0.8, 0.36, z), { color: C.trim, ink: false });
  }
  // Tail boom, fin, stabiliser, engine hump.
  b.add(cylZ(0.16, 4.4, 0, 1.75, -4.1, 8, 0.32), { color: L.body });
  b.add(boxAt(0.08, 1.1, 0.8).rotateX(-0.3).translate(0, 2.2, -6.1), { color: L.accent });
  b.add(boxAt(1.4, 0.06, 0.45, 0, 1.75, -5.4), { color: L.accent });
  b.add(boxAt(1.0, 0.45, 1.8, 0, 2.38, -0.4), { color: L.body });
  b.add(cylY(0.12, 0.4, 0, 2.75, 0, 8), { color: C.trim, ink: false });
  // Main rotor (bone 'rotor', spins about y) and tail rotor (bone 'tailRotor', spins about x).
  b.bone('rotor', 'root', V(0, 2.95, 0));
  b.add(cylY(0.2, 0.15, 0, 2.95, 0, 8), { color: C.trim, bone: 'rotor' });
  for (let k = 0; k < 4; k++) b.add(boxAt(0.28, 0.04, 4.6, 0, 0, 2.3).rotateY((k / 4) * Math.PI * 2).translate(0, 3.0, 0), { color: 0x23252b, bone: 'rotor', ink: k % 2 === 0 });
  b.bone('tailRotor', 'root', V(0.12, 2.3, -6.2));
  for (let k = 0; k < 2; k++) b.add(boxAt(0.03, 1.1, 0.12, 0, 0, 0).rotateX(k * Math.PI / 2).translate(0.14, 2.3, -6.2), { color: 0x23252b, bone: 'tailRotor', ink: false });
  // Lamps: searchlight under the nose, beacons, nav.
  b.add(cylY(0.16, 0.12, 0.3, 0.6, 1.5, 10), { to: 'lamps', lamp: 'search', on: 0xf6f3e4, off: 0x3a3a3a });
  b.add(new THREE.SphereGeometry(0.08, 6, 5).translate(0, 2.65, -1.2), { to: 'lamps', lamp: 'beaconA', on: C.red, off: 0x3a1015 });
  b.add(new THREE.SphereGeometry(0.06, 6, 5).translate(0.7, 1.1, -5.4), { to: 'lamps', lamp: 'nav', on: 0x3bff6a, off: 0x1a3a22 });
  b.add(new THREE.SphereGeometry(0.06, 6, 5).translate(-0.7, 1.1, -5.4), { to: 'lamps', lamp: 'nav', on: 0xff3b3b, off: 0x3a1a1a });
  if (kind === 'news') b.add(cylY(0.3, 0.06, 0.4, 2.75, -1.0, 10), { color: 0xd9d4c6 }); // dish
  return b.template({ extraBounds: 0.3 });
}

const templates = {};

// kind: 'gcpd' | 'news'. Returns { group, kind: 'helicopter', livery, rotor, tailRotor (bones),
//   searchlight (Object3D under the nose, aim a beam from it), setLamps(), update(dt) }
export function createHelicopter(kind = 'gcpd') {
  templates[kind] ??= heliTemplate(kind);
  const s = spawnTemplate(templates[kind], { materials: fleetMaterials() });
  s.group.name = `helicopter-${kind}`;
  const state = { nav: true, search: kind === 'gcpd', beaconA: true }, last = {};
  applyLamps(s.lamps, s.lampRanges, state, last);
  const searchlight = new THREE.Object3D();
  searchlight.position.set(0.3, 0.5, 1.5);
  s.group.add(searchlight);
  let t = 0;
  return {
    group: s.group, kind: 'helicopter', livery: kind, rotor: s.bones.rotor, tailRotor: s.bones.tailRotor, searchlight, bones: s.bones,
    setLamps(st) { Object.assign(state, st); applyLamps(s.lamps, s.lampRanges, state, last); },
    update(dt) {
      t += dt;
      s.bones.rotor.rotation.y += dt * 28;
      s.bones.tailRotor.rotation.x += dt * 40;
      const blink = t % 1.2 < 0.15;
      if (blink !== last.beaconA) this.setLamps({ beaconA: blink });
    },
  };
}

function blimpTemplate() {
  const b = new VehicleBuilder({ outline: 0.12, name: 'blimp' });
  const body = 0x6a7489, fin = 0x4a5264, dark = 0x2f3440;
  // Envelope: a lathe of a teardrop profile, 32 m long, 10 m across, axis along z.
  const prof = [];
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const z = -16 + 32 * u;
    const r = 5 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.05)), 0.62) * (u > 0.8 ? 1 - (u - 0.8) * 0.4 : 1);
    prof.push(new THREE.Vector2(Math.max(0.01, r), z));
  }
  b.add(new THREE.LatheGeometry(prof, 18).rotateX(Math.PI / 2).rotateZ(Math.PI / 18), { color: body, smooth: true });
  // Panel seams: a few rings round the envelope.
  for (const z of [-9, -3, 3, 9]) {
    const r = 5 * Math.pow(Math.sin(Math.PI * Math.min(1, ((z + 16) / 32) * 1.05)), 0.62) + 0.03;
    b.add(new THREE.TorusGeometry(r, 0.05, 3, 24).translate(0, 0, z), { color: dark, ink: false });
  }
  // Cruciform tail fins.
  for (let k = 0; k < 4; k++) {
    const shape = new THREE.Shape([[0, 0], [-4.5, 0], [-5.2, 3.2], [-2.6, 3.2]].map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false }).translate(0, 2.1, -0.125).rotateY(-Math.PI / 2);
    g.rotateZ((k / 4) * Math.PI * 2 + Math.PI / 4).translate(0, 0, -11.5);
    b.add(g, { color: fin });
  }
  // Gondola with lit windows, engine pods on outriggers with propellers on bones.
  b.add(loft([
    { z: 3.2, pts: ring8(-6.0, 0.4, 0.8, -5.3, 0.6, -5.0) },
    { z: 2.2, pts: ring8(-6.3, 0.7, 1.0, -5.3, 0.8, -4.7) },
    { z: -2.4, pts: ring8(-6.3, 0.7, 1.0, -5.3, 0.8, -4.7) },
    { z: -3.2, pts: ring8(-6.0, 0.4, 0.7, -5.3, 0.5, -4.9) },
  ]), { color: dark });
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) b.add(boxAt(0.04, 0.45, 0.6, s * 1.01, -5.55, 1.8 - i * 0.9), { to: 'lamps', lamp: 'cabin', on: C.glassLit, off: 0x2a2c30 });
  for (const s of [-1, 1]) {
    b.add(boxAt(1.8, 0.12, 0.3, s * 1.8, -5.0, 0.4), { color: dark, ink: false });
    b.add(cylZ(0.42, 1.6, s * 2.8, -5.0, 0.4, 10, 0.3), { color: fin, smooth: true });
    const pn = `prop${s > 0 ? 'L' : 'R'}`;
    b.bone(pn, 'root', V(s * 2.8, -5.0, -0.5));
    for (let k = 0; k < 3; k++) b.add(boxAt(0.12, 1.6, 0.05, 0, 0, 0).rotateZ((k / 3) * Math.PI).translate(s * 2.8, -5.0, -0.5), { color: 0x23252b, bone: pn, ink: false });
  }
  b.add(cylY(0.3, 0.4, 0, -6.4, 2.4, 10), { to: 'lamps', lamp: 'search', on: 0xf6f3e4, off: 0x3a3a3a });
  b.add(new THREE.SphereGeometry(0.25, 6, 5).translate(0, 5.05, 0), { to: 'lamps', lamp: 'beaconA', on: C.red, off: 0x3a1015 });
  return b.template({ extraBounds: 0.5 });
}

// Returns { group, kind: 'blimp', props: [L, R] (bones, rotation.z), searchlight (Object3D at the
//   gondola nose: hang the beam cone from it), signAnchors: [left, right] (Object3Ds on each flank
//   where cityLife's GCPD name board planes go, facing out), setLamps(), update(dt) }
export function createBlimpModel() {
  templates.blimp ??= blimpTemplate();
  const s = spawnTemplate(templates.blimp, { materials: fleetMaterials() });
  s.group.name = 'blimp';
  const state = { cabin: true, search: true, beaconA: true }, last = {};
  applyLamps(s.lamps, s.lampRanges, state, last);
  const searchlight = new THREE.Object3D();
  searchlight.position.set(0, -6.6, 2.4);
  s.group.add(searchlight);
  const signAnchors = [-1, 1].map((side) => {
    const o = new THREE.Object3D();
    o.position.set(side * 5.05, 0.5, 0);
    o.rotation.y = side * Math.PI / 2;
    s.group.add(o);
    return o;
  });
  let t = 0;
  return {
    group: s.group, kind: 'blimp', props: [s.bones.propL, s.bones.propR], searchlight, signAnchors, bones: s.bones,
    setLamps(st) { Object.assign(state, st); applyLamps(s.lamps, s.lampRanges, state, last); },
    update(dt) {
      t += dt;
      s.bones.propL.rotation.z += dt * 18;
      s.bones.propR.rotation.z -= dt * 18;
      const blink = Math.sin(t * 3) > 0;
      if (blink !== last.beaconA) this.setLamps({ beaconA: blink });
    },
  };
}

