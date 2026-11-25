// The El: elevated-train cars for the Loop and the West Line. Dimensions follow
// docs/design/research/city-and-content.md (1.2): trains of 4 cars x 15 m, 3.4 m from rail top to
// roof, running with the rail top at y 7.5. Under the scale rule anything a body touches stays true
// size, so the car keeps a real width (2.84 m), floor height (1.1 m above the rail), door size and
// a flat, walkable roof the player can run and fight on.
//
// Car-local frame: origin on the rail top at the car's centre, +z forward (cab end), y up.
// Each car is one skinned body (bogies pivot, axles spin) + ink + glass + lamps = 4 draws; its lit
// windows are part of the lamp mesh (interior light) with seat and passenger silhouettes in front.
// Collision boxes come back as plain data (elCarColliders / car.colliders / train.colliders) for
// the world workstream, which owns the track and the movement.
import * as THREE from 'three';
import { VehicleBuilder, spawnTemplate, fleetMaterials, applyLamps, loft, boxAt, cylX, cylZ, flankDecal, C } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const EL_CAR = Object.freeze({
  length: 15.0, width: 2.84, height: 3.4, floorY: 1.1, roofY: 3.4,
  gauge: 1.435, wheelR: 0.42, bogieZ: 5.0, axleSpacing: 2.1,
  coupleGap: 0.7, // gap between car bodies in a consist (the gangway diaphragms span it)
  doorWidth: 1.3, doorHeight: 1.95, doorZ: Object.freeze([3.4, -3.4]), // two doors per side
  railTopY: 7.5, // world height of the rail top on the Loop structure (research doc 1.2)
});

// Collision boxes in car-local metres: { kind, min: [x, y, z], max: [x, y, z], walkable? }.
// 'roof' is the surface the player stands on; 'shell' blocks from outside (walls, ends); 'floor'
// is the walkable inside; 'vent' are the low roof humps (a 0.16 m step); 'door' are the openings
// (side +1 = +x), usable as triggers for boarding.
export function elCarColliders() {
  const hl = EL_CAR.length / 2, hw = EL_CAR.width / 2;
  return [
    { kind: 'roof', min: [-hw + 0.08, EL_CAR.roofY - 0.12, -hl + 0.15], max: [hw - 0.08, EL_CAR.roofY, hl - 0.15], walkable: true },
    { kind: 'shell', min: [-hw, 0.95, -hl], max: [hw, EL_CAR.roofY - 0.12, hl] },
    { kind: 'floor', min: [-hw + 0.1, 0.95, -hl + 0.3], max: [hw - 0.1, EL_CAR.floorY, hl - 0.3], walkable: true, interior: true },
    { kind: 'underframe', min: [-1.2, 0.15, -hl + 0.6], max: [1.2, 0.95, hl - 0.6] },
    { kind: 'vent', min: [-0.45, EL_CAR.roofY - 0.02, 2.6], max: [0.45, EL_CAR.roofY + 0.14, 4.2] },
    { kind: 'vent', min: [-0.45, EL_CAR.roofY - 0.02, -4.2], max: [0.45, EL_CAR.roofY + 0.14, -2.6] },
    ...EL_CAR.doorZ.flatMap((z) => [-1, 1].map((s) => ({
      kind: 'door', side: s,
      min: [s > 0 ? hw - 0.1 : -hw, EL_CAR.floorY, z - EL_CAR.doorWidth / 2],
      max: [s > 0 ? hw : -hw + 0.1, EL_CAR.floorY + EL_CAR.doorHeight, z + EL_CAR.doorWidth / 2],
    }))),
  ];
}

// Our own transit livery: brushed-steel body, darker skirt, an oxblood belt stripe, teal doors.
const LIVERY = { body: 0x8d939c, lower: 0x5f656e, band: 0x7a2430, door: 0x2f5560, roof: 0x4a4f57, frame: 0x1a1b20 };
const templates = {};

function buildTemplate(cab) {
  const E = EL_CAR, L = LIVERY;
  const hl = E.length / 2, hw = E.width / 2;
  const b = new VehicleBuilder({ outline: 0.028, name: `el-car-${cab}` });
  const flo = E.floorY, roofY = E.roofY, eave = roofY - 0.2;
  const lit = (geo, group = 'interior') => b.add(geo, { to: 'lamps', lamp: group, on: C.glassLit, off: 0x2a2c30 });

  // ---- bogies (pivot for curves) with two axles each (spin)
  for (const [name, z] of [['bogieF', E.bogieZ], ['bogieR', -E.bogieZ]]) {
    b.bone(name, 'root', V(0, 0.5, z));
    b.add(boxAt(2.2, 0.32, 2.9, 0, 0.62, z), { color: L.frame, bone: name });
    for (const s of [-1, 1]) {
      b.add(boxAt(0.12, 0.4, 2.7, s * 1.05, 0.5, z), { color: 0x2a2c33, bone: name });
      b.add(cylZ(0.09, 0.5, s * 1.13, 0.55, z, 6), { color: C.hub, bone: name, ink: false });
    }
    for (const dz of [E.axleSpacing / 2, -E.axleSpacing / 2]) {
      const an = `${name}_axle${dz > 0 ? 'F' : 'R'}`;
      b.bone(an, name, V(0, E.wheelR, z + dz));
      b.add(cylX(0.08, E.gauge + 0.3, 0, E.wheelR, z + dz, 6), { color: C.hub, bone: an, ink: false });
      for (const s of [-1, 1]) {
        b.add(cylX(E.wheelR, 0.14, s * (E.gauge / 2 + 0.04), E.wheelR, z + dz, 12), { color: 0x2f3138, bone: an, smooth: true });
        b.add(cylX(E.wheelR + 0.04, 0.03, s * (E.gauge / 2 - 0.04), E.wheelR, z + dz, 12), { color: 0x2f3138, bone: an, ink: false });
      }
    }
  }

  // ---- underframe and equipment boxes between the bogies
  b.add(boxAt(E.width - 0.12, 0.22, E.length - 0.4, 0, 0.92, 0), { color: L.frame });
  for (const z of [-2.2, 0, 2.2]) b.add(boxAt(1.9, 0.42, 1.5, 0, 0.6, z), { color: 0x24262c, ink: false });

  // ---- body shell: lower panels and upper band either side of the door bays
  const wy0 = 1.95, wy1 = 2.78; // the window band
  const doorEdges = E.doorZ.flatMap((z) => [z + E.doorWidth / 2, z - E.doorWidth / 2]).sort((a, c) => c - a);
  const segs = [[hl, doorEdges[0]], [doorEdges[1], doorEdges[2]], [doorEdges[3], -hl]];
  for (const [z0, z1] of segs) {
    b.add(boxAt(E.width, wy0 - 0.95, z0 - z1, 0, (wy0 + 0.95) / 2, (z0 + z1) / 2), { color: L.lower });
    b.add(boxAt(E.width, eave - wy1, z0 - z1, 0, (wy1 + eave) / 2, (z0 + z1) / 2), { color: L.body });
  }
  for (const z of E.doorZ) {
    // A door bay: dark recessed frame, two leaves with tall lit windows, the band above.
    b.add(boxAt(E.width - 0.12, eave - 0.95, E.doorWidth, 0, (eave + 0.95) / 2, z), { color: L.frame });
    b.add(boxAt(E.width, eave - (flo + E.doorHeight), E.doorWidth, 0, (eave + flo + E.doorHeight) / 2, z), { color: L.body });
    for (const s of [-1, 1]) {
      for (const leaf of [-1, 1]) {
        const lz = z + leaf * E.doorWidth / 4;
        b.add(boxAt(0.04, E.doorHeight, E.doorWidth / 2 - 0.04, s * (hw - 0.05), flo + E.doorHeight / 2, lz), { color: L.door });
        lit(boxAt(0.02, 0.8, E.doorWidth / 2 - 0.28, s * (hw - 0.02), flo + 1.35, lz));
      }
    }
  }
  // Window band: piers between the windows, lit panes set in behind, silhouettes in front of them.
  const wins = [];
  for (const [z0, z1] of segs) {
    const len = z0 - z1 - 0.3;
    const n = Math.max(1, Math.round(len / 1.45));
    for (let i = 0; i < n; i++) wins.push({ z: z0 - 0.15 - (len / n) * (i + 0.5), w: len / n - 0.32 });
    for (let i = 0; i <= n; i++) b.add(boxAt(E.width, wy1 - wy0, 0.32, 0, (wy0 + wy1) / 2, z0 - 0.15 - (len / n) * i), { color: L.body });
  }
  for (const { z, w } of wins) {
    for (const s of [-1, 1]) {
      lit(boxAt(0.02, wy1 - wy0, w + 0.04, s * (hw - 0.07), (wy0 + wy1) / 2, z));
      b.add(boxAt(0.03, 0.22, w, s * (hw - 0.045), wy0 + 0.11, z), { color: C.seat, ink: false });
      b.add(boxAt(0.03, wy1 - wy0, 0.04, s * (hw - 0.045), (wy0 + wy1) / 2, z + w * 0.3), { color: 0x3a3c44, ink: false });
      // Passengers in some windows: head-and-shoulders silhouettes (deterministic per window).
      if (Math.abs(Math.sin(z * 3.1 + s)) > 0.45) {
        const pz = z - w * 0.15;
        b.add(flankDecal([[pz - 0.17, wy0], [pz + 0.17, wy0], [pz + 0.14, wy0 + 0.4], [pz + 0.07, wy0 + 0.45], [pz - 0.07, wy0 + 0.45], [pz - 0.14, wy0 + 0.4]], s * (hw - 0.05), s, 0), { color: 0x1c1d24, ink: false });
        b.add(cylX(0.1, 0.02, s * (hw - 0.05), wy0 + 0.58, pz, 10), { color: 0x1c1d24, ink: false });
      }
    }
  }
  for (const s of [-1, 1]) {
    b.add(boxAt(0.02, 0.14, E.length - 0.2, s * (hw + 0.01), wy0 - 0.12, 0), { color: L.band, ink: false });
    b.add(boxAt(0.02, 0.05, E.length - 0.2, s * (hw + 0.01), wy1 + 0.1, 0), { color: L.band, ink: false });
  }

  // ---- roof: a low arch down to the eaves, flat on top to walk on, ribs and two low vents
  const arch = [[-hw, eave], [-hw + 0.12, eave + 0.14], [-hw + 0.45, roofY - 0.01], [hw - 0.45, roofY - 0.01], [hw - 0.12, eave + 0.14], [hw, eave]];
  b.add(loft([{ z: hl, pts: arch }, { z: -hl, pts: arch }]), { color: L.roof });
  for (let z = -hl + 1.0; z < hl - 0.5; z += 1.5) b.add(boxAt(E.width - 0.95, 0.025, 0.06, 0, roofY, z), { color: 0x3c4048, ink: false });
  for (const z of [3.4, -3.4]) {
    const vent = [[-0.45, roofY - 0.02], [-0.38, roofY + 0.12], [0.38, roofY + 0.12], [0.45, roofY - 0.02]];
    b.add(loft([{ z: z + 0.8, pts: vent }, { z: z - 0.8, pts: vent }]), { color: 0x6c727c });
    for (let k = -2; k <= 2; k++) b.add(boxAt(0.6, 0.02, 0.04, 0, roofY + 0.13, z + k * 0.25), { color: 0x2a2c33, ink: false });
  }
  for (const s of [-1, 1]) b.add(boxAt(0.04, 0.04, E.length - 0.1, s * (hw - 0.02), eave + 0.04, 0), { color: L.frame, ink: false });

  // ---- ends
  for (const end of [1, -1]) {
    const z = end * hl;
    const isCab = (cab === 'front' && end > 0) || cab === 'both';
    b.add(boxAt(E.width, eave - 0.95, 0.08, 0, (eave + 0.95) / 2, z - end * 0.04), { color: L.body });
    b.add(boxAt(E.width + 0.04, 0.2, 0.14, 0, 1.05, z), { color: L.frame }); // anticlimber
    b.add(boxAt(0.3, 0.25, 0.5, 0, 0.82, z + end * 0.15), { color: 0x24262c }); // coupler
    if (isCab) {
      for (const s of [-1, 1]) {
        b.add(boxAt(0.95, 0.95, 0.03, s * 0.82, 2.35, z + end * 0.01), { to: 'glass', color: C.glass });
        b.add(cylZ(0.13, 0.06, s * 0.95, 1.4, z + end * 0.02, 12), { to: 'lamps', lamp: 'head', on: C.head, off: C.headOff });
        b.add(boxAt(0.1, 0.1, 0.04, s * 1.25, 1.4, z + end * 0.02), { to: 'lamps', lamp: 'marker', on: 0xffc24a, off: 0x4a3a1a });
        b.add(boxAt(0.1, 0.1, 0.04, s * 1.25, 1.22, z + end * 0.02), { to: 'lamps', lamp: 'tail', on: C.tail, off: C.tailOff });
      }
      b.add(boxAt(0.6, 1.8, 0.03, 0, flo + 0.95, z + end * 0.01), { color: L.door });
      b.add(boxAt(0.4, 0.7, 0.02, 0, 2.35, z + end * 0.02), { to: 'glass', color: C.glass });
      b.add(boxAt(1.2, 0.22, 0.04, 0, roofY - 0.42, z + end * 0.02), { to: 'lamps', lamp: 'sign', on: 0xffc24a, off: 0x4a3a1a });
      b.add(boxAt(0.9, 0.5, 0.4, 0.82, 1.6, z - end * 0.35), { color: C.interior, ink: false }); // console
    } else {
      // Gangway end: a door with a small lit window and a rubber diaphragm frame.
      b.add(boxAt(0.8, 1.95, 0.05, 0, flo + 0.98, z + end * 0.01), { color: L.door });
      lit(boxAt(0.4, 0.6, 0.02, 0, 2.4, z + end * 0.04));
      for (const s of [-1, 1]) b.add(boxAt(0.12, 2.2, 0.32, s * 0.55, flo + 1.1, z + end * 0.16), { color: C.rubber });
      b.add(boxAt(1.22, 0.12, 0.32, 0, flo + 2.2, z + end * 0.16), { color: C.rubber });
    }
  }
  return b.template({ extraBounds: 0.3 });
}

// One El car. opts.cab: 'front' (driving cab at +z), 'none' (gangways at both ends), 'both'.
// Returns { group, kind: 'elCar', cab, bogies: [front, rear] (bones: rotation.y for curves),
//   axles: Bone[4] (rotation.x rolls), colliders (car-local, see elCarColliders), length, width,
//   height, setLamps({ head, marker, sign, interior, tail }), roll(distance) }
export function createElCar({ cab = 'front' } = {}) {
  templates[cab] ??= buildTemplate(cab);
  const s = spawnTemplate(templates[cab], { materials: fleetMaterials() });
  s.group.name = `elCar-${cab}`;
  const axles = ['bogieF_axleF', 'bogieF_axleR', 'bogieR_axleF', 'bogieR_axleR'].map((n) => s.bones[n]);
  const lampState = { interior: true, head: cab !== 'none', marker: cab !== 'none', sign: cab !== 'none', tail: false }, last = {};
  applyLamps(s.lamps, s.lampRanges, lampState, last);
  return {
    group: s.group, kind: 'elCar', cab, bogies: [s.bones.bogieF, s.bones.bogieR], axles, bones: s.bones,
    colliders: elCarColliders(), length: EL_CAR.length, width: EL_CAR.width, height: EL_CAR.height,
    setLamps(state) { Object.assign(lampState, state); applyLamps(s.lamps, s.lampRanges, lampState, last); },
    // Turns the axles for `distance` metres travelled (the train moves; the wheels follow).
    roll(distance) { const a = distance / EL_CAR.wheelR; for (const ax of axles) ax.rotation.x -= a; },
  };
}

// A consist of 2..4 cars coupled along -z behind the lead cab, with a cab at each end (the rear
// one turned round, its tail lamps lit) so it can run both ways. The consist's origin is on the
// rail top at the lead car's front face; car i's centre is at z = -(i + 0.5) * pitch + gap / 2.
// Returns { group, cars, pitch, length, colliders: [{ car, kind, min, max, ... }] in consist-local
// coordinates, roll(distance), setLamps(state) }.
export function createElTrain(count = 4) {
  const n = Math.max(2, Math.min(4, count | 0));
  const group = new THREE.Group();
  group.name = 'elTrain';
  const pitch = EL_CAR.length + EL_CAR.coupleGap;
  const cars = [];
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    const car = createElCar({ cab: i === 0 || last ? 'front' : 'none' });
    car.group.position.z = -(i + 0.5) * pitch + EL_CAR.coupleGap / 2;
    if (last) { car.group.rotation.y = Math.PI; car.setLamps({ head: false, tail: true }); }
    group.add(car.group);
    cars.push(car);
  }
  const colliders = [];
  cars.forEach((car, i) => {
    const cz = car.group.position.z, flip = car.group.rotation.y !== 0;
    for (const c of car.colliders) {
      const z0 = flip ? -c.max[2] : c.min[2], z1 = flip ? -c.min[2] : c.max[2];
      const x0 = flip ? -c.max[0] : c.min[0], x1 = flip ? -c.min[0] : c.max[0];
      colliders.push({ ...c, car: i, min: [x0, c.min[1], cz + z0], max: [x1, c.max[1], cz + z1], ...(c.side != null ? { side: flip ? -c.side : c.side } : {}) });
    }
  });
  return {
    group, cars, pitch, length: n * pitch - EL_CAR.coupleGap, colliders,
    roll(distance) { for (const c of cars) c.roll(distance); },
    setLamps(state) { for (const c of cars) c.setLamps(state); },
  };
}
