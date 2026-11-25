// Hand props: built once per kind from toon primitives and merged, so a prop is one mesh plus one
// ink hull. Gameplay parents them with attachProp(ch, prop, 'r' | 'l'): the prop's origin sits
// in the closed fist, +z pointing out past the thumb (the way a stick, a staff or an umbrella
// shaft runs through a grip), +y along the back of the hand.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, addHullOutline } from '../../render/toon.js';
import { PALETTE } from '../../config/palette.js';
import { attachRigid, bindPosition } from '../../actors/rig.js';
import { addRim } from '../../actors/outfitParts.js';
import { linear } from './kit.js';

// [geometry, hex] pairs -> one vertex-coloured mesh with a hull.
function merged(pieces, outline = 0.004) {
  const geos = pieces.map(([g, hex]) => {
    const geo = (g.index ? g.toNonIndexed() : g);
    geo.deleteAttribute('uv');
    const c = linear(hex);
    const col = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), propMaterial());
  mesh.castShadow = true;
  if (outline) addHullOutline(mesh, outline);
  return mesh;
}
let mat = null;
const propMaterial = () => (mat ??= addRim(toonMaterial({ vertexColors: true }), 0x9fc3ff, 0.7));

const C = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const along = (g) => g.rotateX(Math.PI / 2); // a y-up primitive turned to run along +z

export const PROPS = {
  // A silver butler's tray, held flat on the palm (centre a hand's width past the fingers).
  tray: () => merged([[C(0.2, 0.2, 0.012, 24).translate(0, -0.04, 0.12), 0xc8ccd4], [C(0.205, 0.205, 0.02, 24).translate(0, -0.033, 0.12).scale(1, 1, 1), 0xa8acb4]]),
  // A first-aid case with a white cross, by its handle.
  medkit: () => merged([[B(0.3, 0.2, 0.09).translate(0, -0.13, 0), 0x8c2a2a], [B(0.08, 0.025, 0.095).translate(0, -0.125, 0), 0xf2f0e8], [B(0.025, 0.08, 0.095).translate(0, -0.125, 0), 0xf2f0e8], [B(0.1, 0.02, 0.02).translate(0, -0.02, 0), 0x1a1a1f]]),
  // A closed or open umbrella, shaft through the fist.
  umbrella: ({ open = true, color = 0x1a1a22 } = {}) => {
    const pieces = [[along(C(0.008, 0.008, 0.85, 6)).translate(0, 0, 0.3), 0x2a2a30], [along(C(0.016, 0.016, 0.1, 6)).translate(0, 0, -0.06), 0x5a3a24]];
    if (open) pieces.push([new THREE.ConeGeometry(0.55, 0.22, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.62), color]);
    else pieces.push([along(new THREE.ConeGeometry(0.035, 0.6, 8)).rotateX(Math.PI).translate(0, 0, 0.35), color]);
    return merged(pieces);
  },
  // Escrima stick: grip in the fist, a coloured tip at each end.
  stick: ({ tip = 0x49b4ff } = {}) => merged([[along(C(0.014, 0.014, 0.52, 8)).translate(0, 0, 0.08), 0x2c3040], [along(C(0.016, 0.016, 0.05, 8)).translate(0, 0, 0.32), tip], [along(C(0.016, 0.016, 0.05, 8)).translate(0, 0, -0.16), tip]]),
  // A fighting staff, held near its middle.
  staff: ({ color = 0x2a2a30, band = 0xd9a92c } = {}) => merged([[along(C(0.016, 0.016, 1.7, 8)).translate(0, 0, 0.15), color], [along(C(0.019, 0.019, 0.08, 8)).translate(0, 0, 0.95), band], [along(C(0.019, 0.019, 0.08, 8)).translate(0, 0, -0.65), band]]),
  // A riot shield, strapped to the forearm side of the fist.
  // Tall enough to hide the man from knee to chin: the shield goon's silhouette at any range.
  shield: ({ color = 0x2a3346 } = {}) => merged([
    [B(0.58, 1.02, 0.03).translate(0, 0.08, 0.0), color],
    [B(0.62, 0.05, 0.05).translate(0, 0.6, 0), 0x16161a], [B(0.62, 0.05, 0.05).translate(0, -0.44, 0), 0x16161a],
    [B(0.36, 0.09, 0.034).translate(0, 0.34, 0), 0x8fa6bf], [B(0.34, 0.07, 0.036).translate(0, 0.0, 0), 0xe8e8e0],
  ]),
  baton: () => merged([[along(C(0.016, 0.014, 0.6, 8)).translate(0, 0, 0.2), 0x1a1a1f], [along(C(0.02, 0.02, 0.1, 8)).translate(0, 0, -0.06), 0x3a3a40]]),
  // A long scoped rifle, stock against the wrist.
  sniper: () => merged([[B(0.045, 0.07, 0.5).translate(0, 0, 0.15), 0x1a1a1f], [along(C(0.012, 0.012, 0.6, 8)).translate(0, 0.02, 0.68), 0x3a3f48], [B(0.04, 0.1, 0.25).translate(0, -0.03, -0.18), 0x4a3424], [along(C(0.022, 0.022, 0.22, 10)).translate(0, 0.075, 0.18), 0x1a1a1f]]),
  // A short carbine (the gunner's): body, barrel, a curved magazine, a stock.
  carbine: () => merged([[B(0.05, 0.08, 0.36).translate(0, 0, 0.1), 0x1a1a1f], [along(C(0.014, 0.014, 0.42, 8)).translate(0, 0.015, 0.48), 0x3a3f48], [B(0.045, 0.05, 0.16).translate(0, 0.0, 0.34), 0x2a2a30], [B(0.035, 0.13, 0.05).translate(0, -0.09, 0.16).rotateX(-0.2), 0x2a2a30], [B(0.04, 0.08, 0.2).translate(0, -0.01, -0.15), 0x2a2a30], [B(0.03, 0.04, 0.12).translate(0, 0.06, 0.1), 0x1a1a1f]]),
  // A clipboard or notepad (reporter, doctor).
  notepad: () => merged([[B(0.16, 0.22, 0.012).translate(0, 0.06, 0.05), 0xefe6cf], [B(0.17, 0.03, 0.014).translate(0, 0.17, 0.05), 0x3a3a40]]),
  // An open umbrella with a crook handle and a point: the crime boss's.
  bossUmbrella: () => merged([[along(C(0.009, 0.009, 0.8, 6)).translate(0, 0, 0.28), 0x1a1a1f], [new THREE.TorusGeometry(0.035, 0.009, 5, 10, Math.PI).translate(0, 0.035, -0.12), 0x1a1a1f], [along(new THREE.ConeGeometry(0.04, 0.5, 8)).rotateX(Math.PI).translate(0, 0, 0.42), 0x2a2a34]]),
  // A cane with a question-mark crook (the riddler's).
  cane: ({ color = 0x3f9e34 } = {}) => merged([[along(C(0.01, 0.01, 0.85, 6)).translate(0, 0, 0.3), color], [new THREE.TorusGeometry(0.04, 0.01, 5, 12, Math.PI * 1.4).translate(0, 0.04, -0.14), color]]),
  // A mallet (the jester's).
  mallet: () => merged([[along(C(0.026, 0.026, 0.78, 8)).translate(0, 0, 0.2), PALETTE.wood], [C(0.165, 0.165, 0.36, 10).rotateZ(Math.PI / 2).translate(0, 0, 0.62), PALETTE.wood], [C(0.168, 0.168, 0.05, 10).rotateZ(Math.PI / 2).translate(0, 0, 0.62), PALETTE.crimson]]),
  sword: () => merged([[along(B(0.012, 0.04, 0.8)).translate(0, 0, 0.45), 0xd8dde6], [B(0.12, 0.02, 0.02).translate(0, 0, 0.05), 0x2a2a30], [along(C(0.016, 0.016, 0.14, 8)).translate(0, 0, -0.03), 0x1a1a1f]]),
};

export function createProp(kind, opts) {
  const make = PROPS[kind];
  if (!make) throw new Error(`Unknown prop ${kind}`);
  const p = make(opts);
  p.name = `prop-${kind}`;
  return p;
}

// Parents a prop into a character's fist. The grip point is a little past the hand bone toward
// the fingers and under the knuckles; +z runs past the thumb whichever way the body faces.
export function attachProp(ch, prop, hand = 'r') {
  const bone = hand === 'l' ? 'hand_l' : 'hand_r';
  const h = bindPosition(ch.body, bone);
  const side = Math.sign(h.x) || 1;
  prop.position.set(h.x + side * 0.075, h.y - 0.012, h.z + 0.01 * ch.lm.fwd);
  if (ch.lm.fwd < 0) prop.rotation.y = Math.PI;
  attachRigid(ch.body, bone, prop);
  return prop;
}
