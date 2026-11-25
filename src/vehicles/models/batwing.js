// The Batwing, rebuilt: the same bat-emblem planform as before (so its size, WING_RADIUS and feel
// are unchanged) but now a real aircraft: a thinner bevelled wing with a darker leading edge and
// panel lines, a lofted fuselage running through it to a pointed nose between the "ears", a
// faceted glass canopy, two engine nacelles under the wing with their exhaust glows, twin canted
// fins and nav lights. One merged body + ink + glass + lamps, plus the two engine glow groups.
// Returns { group, mesh (=== group), engines: [left, right] } — the shape batwing.js already uses
// via wingModel.buildBatwingMesh ({ mesh, engines }, engines pulse with scale.setScalar).
import * as THREE from 'three';
import { batOutline } from '../../config/batShape.js';
import { VehicleBuilder, spawnTemplate, fleetMaterials, applyLamps, loft, ring8, boxAt, cylZ, C } from './kit.js';
import { addRim } from '../../actors/outfitParts.js';
import { toonMaterial, hullMaterial } from '../../render/toon.js';
import { LAYER_FX } from '../../render/layers.js';

const SX = 0.145, SZ = 0.205, THICK = 0.5;
let tpl = null;

function buildTemplate() {
  const b = new VehicleBuilder({ outline: 0.06, name: 'batwing' });
  const body = 0x1d212b, dark = 0x101218, edge = 0x2c3442, panel = 0x0c0d12;
  // Wing: the emblem outline extruded thin, bevelled, centred on y = 0.
  const shape = new THREE.Shape(batOutline().map(([x, y]) => new THREE.Vector2(x * SX, -y * SZ)));
  const wing = new THREE.ExtrudeGeometry(shape, { depth: THICK, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 }).rotateX(-Math.PI / 2);
  wing.translate(0, -THICK / 2, 0);
  b.add(wing, { color: body });
  // Leading-edge strips along the wing's front sweep (the edge from each ear out to the tip) and
  // spanwise panel lines on top: flat comic detail.
  for (const s of [-1, 1]) {
    for (const [x0, z0, x1, z1] of [[1.9, 2.26, 2.9, 3.1], [2.9, 3.1, 4.5, 4.3], [4.5, 4.3, 7.0, 4.68]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const g = boxAt(len, 0.05, 0.24, 0, 0, 0).rotateY(Math.atan2(-(z1 - z0), s * (x1 - x0)));
      b.add(g.translate(s * (x0 + x1) / 2, THICK / 2 + 0.06, (z0 + z1) / 2 - 0.14), { color: edge, ink: false });
    }
    for (const x of [2.4, 3.6, 4.8]) b.add(boxAt(0.04, 0.02, 3.2, s * x, THICK / 2 + 0.09, 0.2), { color: panel, ink: false });
  }
  // Fuselage: a lofted spine through the wing, pointed nose between the ears, tapering tail.
  b.add(loft([
    { z: 4.1, pts: ring8(-0.05, 0.04, 0.08, 0.05, 0.04, 0.12) },
    { z: 3.0, pts: ring8(-0.32, 0.3, 0.46, 0.15, 0.3, 0.42) },
    { z: 1.0, pts: ring8(-0.42, 0.46, 0.66, 0.2, 0.44, 0.56) },
    { z: -2.0, pts: ring8(-0.4, 0.44, 0.62, 0.2, 0.42, 0.5) },
    { z: -4.4, pts: ring8(-0.2, 0.16, 0.26, 0.1, 0.16, 0.26) },
  ]), { color: dark });
  // Canopy: faceted glass set into the spine, with a frame rib.
  b.add(loft([
    { z: 3.0, pts: [[-0.3, 0.4], [-0.28, 0.42], [-0.18, 0.44], [0.18, 0.44], [0.28, 0.42], [0.3, 0.4]] },
    { z: 2.3, pts: [[-0.42, 0.5], [-0.38, 0.74], [-0.2, 0.86], [0.2, 0.86], [0.38, 0.74], [0.42, 0.5]] },
    { z: 1.0, pts: [[-0.44, 0.54], [-0.38, 0.76], [-0.2, 0.86], [0.2, 0.86], [0.38, 0.76], [0.44, 0.54]] },
    { z: 0.2, pts: [[-0.4, 0.54], [-0.34, 0.6], [-0.2, 0.62], [0.2, 0.62], [0.34, 0.6], [0.4, 0.54]] },
  ]), { to: 'glass', color: 0x355a7c });
  b.add(boxAt(0.06, 0.05, 2.4, 0, 0.87, 1.6), { color: dark });
  // Engine nacelles under the wing, intakes at the front.
  for (const s of [-1, 1]) {
    b.add(cylZ(0.42, 2.6, s * 1.9, -0.45, -1.6, 12, 0.34), { color: dark, smooth: true });
    b.add(cylZ(0.3, 0.06, s * 1.9, -0.45, -0.28, 12), { color: 0x050507, ink: false });
    // Twin canted fins.
    const fin = new THREE.Shape([[0, 0], [0.15, 1.45], [1.25, 0.2], [1.1, 0]].map(([x, y]) => new THREE.Vector2(x, y)));
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: false }).translate(0, 0, -0.04).rotateY(Math.PI / 2);
    fg.rotateZ(-s * 0.2).translate(s * 2.6, THICK * 0.4, -2.95);
    b.add(fg, { color: dark });
    // Nav lights: red on the left (+x is left when facing +z... the pilot's left is +x), green right.
    b.add(new THREE.SphereGeometry(0.16, 8, 6).translate(s * 49 * SX * 0.98, 0.08, 23 * SZ * 0.82), { to: 'lamps', lamp: 'nav', on: s > 0 ? 0xff3b3b : 0x3bff6a, off: 0x2a2c34 });
  }
  b.add(new THREE.SphereGeometry(0.14, 8, 6).translate(0, 0.1, -4.5), { to: 'lamps', lamp: 'nav', on: 0xf2f2f2, off: 0x2a2c34 });
  b.add(boxAt(0.5, 0.04, 0.06, 0, -0.38, 3.0), { to: 'lamps', lamp: 'head', on: C.head, off: C.headOff });
  return b.template({ extraBounds: 0.2 });
}

function buildEngine(side) {
  const g = new THREE.Group();
  g.position.set(side * 1.9, -0.45, -2.95);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: 0xd8f2ff }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshBasicMaterial({ color: 0x4fb4ff, transparent: true, opacity: 0.45, depthWrite: false }));
  halo.layers.set(LAYER_FX);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 2.0, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x6fd4ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  flame.rotation.x = -Math.PI / 2;
  flame.position.z = -1.05;
  flame.layers.set(LAYER_FX);
  g.add(core, halo, flame);
  return g;
}

export function createBatwingModel() {
  tpl ??= buildTemplate();
  const body = addRim(toonMaterial({ vertexColors: true }), 0x8fb0e8, 0.6, [0.72, 0.9], 0.24);
  body.name = 'batwing-body';
  const s = spawnTemplate(tpl, { materials: { ...fleetMaterials(), body } });
  const group = s.group;
  group.name = 'batwing';
  if (s.outline) s.outline.material = hullMaterial(s.outline.material.userData.outline.value, 0x4b586e, !!s.outline.isSkinnedMesh); // [perf2] hull materials are shared (toon.js): a slate rim of its own, as before, so it pops on the sky
  applyLamps(s.lamps, s.lampRanges, { nav: true, head: true }, {});
  const engines = [buildEngine(-1), buildEngine(1)];
  group.add(...engines);
  group.visible = false;
  return { group, mesh: group, engines };
}
