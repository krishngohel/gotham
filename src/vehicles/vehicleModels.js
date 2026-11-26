// Code-built vehicle meshes, the module the game imports. The models themselves now live in
// src/vehicles/models/ (one file per family: batmobile, fleet + street, heroBikes, batwing, elTrain,
// marine, aircraft); this file keeps the original exports and their contracts (createBatmobile,
// createStreetCar, createJokerVan, createDroneTank, createTracer, createShell) and re-exports the
// new builders beside them. No asset files, no textures beyond the shared toon gradient.
import * as THREE from 'three';
import { createBatmobileModel, BATMOBILE } from './models/batmobile.js';
import { createStreetVehicle, createTrafficInstances, parkedVehicleParts, lodGeometry, fleetStats, FLEET, FLEET_TYPES, PARKED_TYPES, LAMP_GROUPS, DAMAGE } from './models/street.js';
import { glowMaterial as kitGlow } from './models/kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, addHullOutline } from '../render/toon.js';
import { LAYER_FX } from '../render/layers.js';

export { createBatmobileModel, BATMOBILE, createStreetVehicle, createTrafficInstances, parkedVehicleParts, lodGeometry, fleetStats, FLEET, FLEET_TYPES, PARKED_TYPES, LAMP_GROUPS, DAMAGE };
export { createBatcycle, createWingBike } from './models/heroBikes.js';
export { createBatwingModel } from './models/batwing.js';
export { createElCar, createElTrain, EL_CAR } from './models/elTrain.js';
export { createBoat, BOAT_TYPES } from './models/marine.js';
export { createHelicopter, createBlimpModel } from './models/aircraft.js';
export { CATALOG } from './models/catalog.js';

// A glowing disc used for the rear jet, headlights, cannon tracer and shell bursts: unlit,
// additive, so it reads as light rather than a lit toon surface. `strength` is the base opacity.
function glowMaterial(color, strength = 1, additive = true) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: strength, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
}

// Lofts a closed, faceted solid through cross-sections along local Z (forward). Each station is
// { z, y0, hw, ym, yt, tw }: the bottom at y0 (half width hw - 0.1), the widest point hw at ym,
// and a flat top of half width tw at yt, so every section is an octagon-ish armour profile and
// the body can taper in plan and in height from station to station (an extrusion can't).
// Returns { fill, line }: flat-shaded geometry for the hard armour facets, and a welded, smooth
// copy for the ink outline shell (a shell built from split normals cracks open at every edge).
function loftGeometry(stations) {
  const ring = (s) => {
    const b = Math.max(0.05, s.hw - 0.12);
    return [[-b, s.y0], [-s.hw, s.y0 + 0.12], [-s.hw, s.ym], [-s.tw, s.yt], [s.tw, s.yt], [s.hw, s.ym], [s.hw, s.y0 + 0.12], [b, s.y0]];
  };
  const pos = [], idx = [];
  const n = 8;
  stations.forEach((s) => { for (const [x, y] of ring(s)) pos.push(x, y, s.z); });
  for (let k = 0; k < stations.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n), c = (k + 1) * n + i, d = (k + 1) * n + ((i + 1) % n);
      // Wound so the faces point outward (stations run from nose, +z, to tail).
      idx.push(a, b, c, b, d, c);
    }
  }
  // End caps (fans), facing out of each end.
  const last = (stations.length - 1) * n;
  for (let i = 1; i < n - 1; i++) { idx.push(0, i + 1, i); idx.push(last, last + i, last + i + 1); }
  const line = new THREE.BufferGeometry();
  line.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  line.setIndex(idx);
  line.computeVertexNormals();
  const fill = line.toNonIndexed();
  fill.computeVertexNormals();
  return { fill, line };
}

// A lofted armour part: flat-shaded fill plus an ink shell from its smooth twin.
function loftPart(stations, material, outline) {
  const { fill, line } = loftGeometry(stations);
  const mesh = new THREE.Mesh(fill, material);
  if (outline) {
    const carrier = new THREE.Mesh(line, material);
    const hull = addHullOutline(carrier, outline);
    carrier.remove(hull);
    mesh.add(hull);
  }
  return mesh;
}

// The Batmobile (src/vehicles/models/batmobile.js): the original contract { group, wheels
// [{ pivot, spin, front }], jetGlow, jetHalo, radius, halfLength, halfWidth, setBoost(on) } plus
// the articulation API for the two modes (setMode, setStrafe, aimTurret, setCanopy, ...).
export function createBatmobile(opts) {
  return createBatmobileModel(opts);
}

// Bakes a static model (nothing inside it animates on its own) into one mesh per fill material
// plus one ink outline per outline width, all relative to `group`, and swaps them in for the
// original parts. A street car goes from 34 draw calls to about 11, and its outlines become
// frustum-culled (addHullOutline turns culling off, since it can't know a mesh's final bounds).
function mergeStaticParts(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const fills = new Map(), hulls = new Map();
  const m = new THREE.Matrix4();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const outline = o.material.userData.outline;
    const buckets = outline ? hulls : fills;
    const key = outline ? outline.value : o.material;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { material: o.material, layers: o.layers.mask, geos: [] }));
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
    b.geos.push(g);
  });
  while (group.children.length) group.remove(group.children[0]);
  for (const buckets of [fills, hulls]) {
    for (const b of buckets.values()) {
      const geo = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      geo.computeBoundingSphere();
      if (buckets === hulls) geo.boundingSphere.radius += 0.05; // the outline pushes out past the hull
      const mesh = new THREE.Mesh(geo, b.material);
      mesh.layers.mask = b.layers;
      group.add(mesh);
    }
  }
}

// A civilian sedan or van in an exact paint colour (the original contract: { group, radius }),
// now a full fleet vehicle (wheels that spin and steer, lamps, damage; see models/street.js).
// `kind` is 'sedan' or 'van' (the delivery van).
export function createStreetCar(color = 0x2f3f5a, kind = 'sedan') {
  const car = createStreetVehicle(kind === 'van' ? 'van_delivery' : 'sedan', { color });
  car.radius = kind === 'van' ? 2.3 : 2.1;
  return car;
}

// The Joker's getaway van: the gang van (purple, green band, painted grin, push bar, roof rack)
// with a spinning purple beacon on the roof so it reads as his at a glance.
export function createJokerVan() {
  const car = createStreetVehicle('gang_van');
  car.radius = 2.3;
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.22, 10), kitGlow(0x8a2fbf, 1));
  beacon.position.set(0, 2.5, 1.0);
  beacon.layers.set(LAYER_FX);
  car.group.add(beacon);
  car.beacon = beacon;
  return car;
}

// A Joker drone tank: an unmanned, armoured little tank in the Joker's purple and green. A sloped
// hull (lofted, like the Batmobile's body), tracks with road wheels and a track guard, a faceted
// turret with a glowing red sensor eye where a crew hatch would be, a long barrel with a muzzle
// brake, an antenna with a blinking tip, and a painted grin on the glacis. The hull and the turret
// are each merged (mergeStaticParts) so a squad of six stays cheap; the turret keeps its own
// pivot so it can still turn to aim at Batman. Returns { group, turretPivot, barrel, radius, ... }.
export function createDroneTank() {
  const group = new THREE.Group();
  const hullMat = toonMaterial({ color: 0x4f2a66 });
  const trackMat = toonMaterial({ color: 0x15161b });
  const wheelMat = toonMaterial({ color: 0x3a3d45 });
  const turretMat = toonMaterial({ color: 0x3fae4a });
  const trim = toonMaterial({ color: 0x24262c });
  const grinMat = toonMaterial({ color: 0xe8e2d4 });
  const eyeMat = glowMaterial(0xff3040, 1, false);

  const hullParts = new THREE.Group();
  // Hull: a sloped glacis at the front, flat deck, a short sloped rear.
  hullParts.add(loftPart([
    { z: 1.7, y0: 0.35, hw: 0.8, ym: 0.5, yt: 0.58, tw: 0.62 },
    { z: 1.1, y0: 0.3, hw: 0.98, ym: 0.72, yt: 0.95, tw: 0.82 },
    { z: -1.2, y0: 0.3, hw: 0.98, ym: 0.72, yt: 0.95, tw: 0.82 },
    { z: -1.65, y0: 0.35, hw: 0.86, ym: 0.62, yt: 0.78, tw: 0.66 },
  ], hullMat, 0.026));
  for (const sx of [-1, 1]) {
    // Track: a dark belt with a guard over it and five road wheels showing on the outside.
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.5, 3.5), trackMat);
    track.position.set(sx * 1.12, 0.3, 0);
    addHullOutline(track, 0.02);
    hullParts.add(track);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 3.6), trim);
    guard.position.set(sx * 1.12, 0.6, 0);
    hullParts.add(guard);
    for (let k = 0; k < 5; k++) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12).rotateZ(Math.PI / 2), wheelMat);
      wheel.position.set(sx * 1.36, 0.27, -1.3 + k * 0.65);
      hullParts.add(wheel);
    }
  }
  // A painted grin across the glacis: a white crescent with teeth lines, the Joker's calling card.
  const grin = new THREE.Shape();
  grin.moveTo(-0.55, 0.08); grin.quadraticCurveTo(0, -0.32, 0.55, 0.08); grin.quadraticCurveTo(0, -0.12, -0.55, 0.08);
  const grinGeo = new THREE.ShapeGeometry(grin);
  grinGeo.rotateX(-0.62).translate(0, 0.78, 1.42);
  hullParts.add(new THREE.Mesh(grinGeo, grinMat));
  mergeStaticParts(hullParts);
  group.add(hullParts);

  const turretPivot = new THREE.Group();
  turretPivot.position.set(0, 0.95, -0.15);
  const turretParts = new THREE.Group();
  turretParts.add(loftPart([
    { z: 0.75, y0: 0, hw: 0.45, ym: 0.18, yt: 0.32, tw: 0.32 },
    { z: 0.3, y0: 0, hw: 0.7, ym: 0.3, yt: 0.5, tw: 0.5 },
    { z: -0.75, y0: 0, hw: 0.72, ym: 0.3, yt: 0.48, tw: 0.52 },
    { z: -0.95, y0: 0, hw: 0.55, ym: 0.22, yt: 0.36, tw: 0.4 },
  ], turretMat, 0.02));
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.7, 12).rotateX(Math.PI / 2), trim);
  barrel.position.set(0, 0.28, 1.5);
  addHullOutline(barrel, 0.014);
  turretParts.add(barrel);
  const brake = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.22), trim);
  brake.position.set(0, 0.28, 2.38);
  addHullOutline(brake, 0.012);
  turretParts.add(brake);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.9, 6), trim);
  mast.position.set(-0.42, 0.9, -0.6);
  turretParts.add(mast);
  mergeStaticParts(turretParts);
  turretPivot.add(turretParts);
  // The sensor eye and the antenna tip glow on their own (unmerged, unlit).
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.11, 16), eyeMat);
  eye.position.set(0.22, 0.36, 0.62);
  eye.rotation.x = -0.35;
  turretPivot.add(eye);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glowMaterial(0x6dff7a, 1, false));
  tip.position.set(-0.42, 1.36, -0.6);
  turretPivot.add(tip);
  group.add(turretPivot);
  return { group, turretPivot, barrel, radius: 1.9, health: 3, dead: false };
}

// A thin glowing tracer line, reused each shot (position updated, not recreated).
export function createTracer(color = 0x7fd6ff) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat);
  line.layers.set(LAYER_FX);
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

// A slow, dodgeable shell: a small glowing sphere.
export function createShell(color = 0x8a2fbf) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), glowMaterial(color, 1));
  mesh.layers.set(LAYER_FX);
  mesh.visible = false;
  return mesh;
}
