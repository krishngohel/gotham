// Hero bikes: the Batcycle (a long, low armoured cruiser with an angular fairing, slit lamps and a
// small afterburner, our own design) and Nightwing's sport bike (black with his blue stripe).
// Both are built on the street motorcycle's skeleton (fleet.js buildBike): wheel0 steers the fork
// and front wheel, spinN roll the wheels. 3-4 draws each (body, ink, lamps, + glass screen).
import * as THREE from 'three';
import { VehicleBuilder, spawnTemplate, fleetMaterials, applyLamps, glowMaterial, loft, ring8, boxAt, cylZ, C } from './kit.js';
import { buildBike } from './fleet.js';
import { LAYER_FX } from '../../render/layers.js';

const templates = {};

function mirrorX(g) {
  g.scale(-1, 1, 1);
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
  return g;
}

function batcycleTemplate() {
  const b = new VehicleBuilder({ outline: 0.022, name: 'batcycle' });
  const pal = [0x343a44, 0x17181d];
  const r = 0.36, wb = 1.7, fz = wb / 2, rz = -wb / 2;
  const info = buildBike(b, { wheelR: r, wb, tyreW: 0.2, hub: 0x3a3e46, seat: 0x17181d }, pal);
  // Angular armour fairing over the fork (steers with it) with twin slit headlamps.
  b.add(loft([
    { z: fz + 0.06, pts: ring8(r + 0.36, 0.04, 0.08, r + 0.48, 0.05, r + 0.56) },
    { z: fz - 0.18, pts: ring8(r + 0.3, 0.12, 0.19, r + 0.52, 0.12, r + 0.72) },
    { z: fz - 0.4, pts: ring8(r + 0.34, 0.12, 0.18, r + 0.54, 0.1, r + 0.7) },
  ]), { color: pal[0], bone: 'wheel0' });
  for (const s of [-1, 1]) b.add(boxAt(0.12, 0.03, 0.04, 0, 0, 0).rotateY(s * 0.3).translate(s * 0.08, r + 0.5, fz + 0.06), { to: 'lamps', lamp: 'head', on: C.head, off: C.headOff, bone: 'wheel0' });
  // Side armour over the engine, a long tail cowl and the nozzle.
  for (const s of [-1, 1]) {
    const plate = loft([
      { z: 0.45, pts: [[0, r - 0.05], [0, r + 0.42], [0.05, r + 0.46], [0.07, r - 0.02]] },
      { z: -0.45, pts: [[0, r], [0, r + 0.4], [0.05, r + 0.44], [0.07, r + 0.04]] },
    ]);
    b.add((s < 0 ? mirrorX(plate) : plate).translate(s * 0.17, 0, 0), { color: pal[1] });
    b.add(boxAt(0.02, 0.02, 0.9, s * 0.245, r + 0.3, 0.0), { to: 'lamps', lamp: 'pursuit', on: 0x7fd6ff, off: 0x1a2a33 });
  }
  b.add(loft([
    { z: -0.4, pts: ring8(r + 0.42, 0.1, 0.14, r + 0.56, 0.08, r + 0.62) },
    { z: rz - 0.25, pts: ring8(r + 0.4, 0.08, 0.12, r + 0.54, 0.06, r + 0.6) },
  ]), { color: pal[0] });
  b.add(cylZ(0.11, 0.3, 0, r + 0.28, rz - 0.2, 10, 0.08), { color: 0x101114 });
  info.nozzle = new THREE.Vector3(0, r + 0.28, rz - 0.36);
  return { tpl: b.template(), info };
}

function wingBikeTemplate() {
  const b = new VehicleBuilder({ outline: 0.02, name: 'wingbike' });
  const pal = [0x15161b, 0x1f6fd6];
  const r = 0.31;
  const info = buildBike(b, { wheelR: r, wb: 1.4, tyreW: 0.15, hub: 0x1f6fd6, fairing: true, seat: 0x101114 }, pal);
  // His stripe: a blue chevron along the tank and fairing.
  for (const s of [-1, 1]) {
    b.add(boxAt(0.02, 0.04, 0.6, s * 0.175, r + 0.6, -0.25), { color: pal[1], ink: false });
    b.add(boxAt(0.02, 0.05, 0.36, s * 0.225, r + 0.62, 0.42), { color: pal[1], ink: false, bone: 'wheel0' });
  }
  return { tpl: b.template(), info };
}

function bikeApi(T, name) {
  const s = spawnTemplate(T.tpl, { materials: fleetMaterials() });
  s.group.name = name;
  const info = T.info;
  const wheels = info.wheels.map((w) => ({ pivot: s.bones[w.pivotName], spin: s.bones[w.spinName], front: w.front }));
  const seat = new THREE.Object3D();
  seat.name = 'seat';
  seat.position.copy(info.seat);
  s.group.add(seat);
  const state = { head: true, tail: true, pursuit: true }, last = {};
  applyLamps(s.lamps, s.lampRanges, state, last);
  return {
    group: s.group, kind: name, wheels, seat, wheelRadius: info.wheelR, radius: 1.1, halfLength: info.L / 2, halfWidth: 0.35, bones: s.bones,
    setLamps(st) { Object.assign(state, st); applyLamps(s.lamps, s.lampRanges, state, last); },
    // Lean into a turn: the bike rolls about its contact line (radians, + = lean toward +x).
    setLean(a) { s.group.rotation.z = -a; },
  };
}

// The Batcycle. Extra handles: jetGlow (afterburner disc), setBoost(on).
export function createBatcycle() {
  templates.batcycle ??= batcycleTemplate();
  const api = bikeApi(templates.batcycle, 'batcycle');
  const jetGlow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 14), glowMaterial(0xffb020, 0.8));
  jetGlow.position.copy(templates.batcycle.info.nozzle);
  jetGlow.rotation.y = Math.PI;
  jetGlow.layers.set(LAYER_FX);
  api.group.add(jetGlow);
  api.jetGlow = jetGlow;
  api.setBoost = (on) => { jetGlow.scale.setScalar(on ? 1.8 : 1); jetGlow.material.color.setHex(on ? 0xfff2c0 : 0xffb020); };
  return api;
}

// Nightwing's bike (also fine for a Robin: pass it through the roster's vehicle field).
export function createWingBike() {
  templates.wing ??= wingBikeTemplate();
  return bikeApi(templates.wing, 'wingbike');
}
