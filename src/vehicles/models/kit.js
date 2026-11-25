// Shared kit for every code-built vehicle: fleet-wide materials, geometry helpers, and the
// VehicleBuilder that turns a pile of tagged parts into a handful of draw calls.
//
// How a vehicle is drawn (the whole point of this file):
// - Every solid part goes into ONE body geometry with per-vertex colours (paint, trim, chrome,
//   tyre, interior...), so a car costs one fill draw however many panels it has.
// - Parts that move (wheels, doors, a turret, a canopy) are not split off into their own meshes:
//   each part is rigidly bound to a bone, and the body is a SkinnedMesh. Moving a bone (an ordinary
//   Object3D: `wheel.spin.rotation.x -= roll`) moves the part, still in one draw.
// - The ink outline is one more draw (an inverted hull built from a welded, smooth-normal copy of
//   the same parts, so it never cracks open at panel edges), glass one more, lamps one more.
// So a drivable car is 4 draws (5 with smoke), against ~17 for the old unmerged car.
//
// Materials are shared by the whole fleet (one toon program, one glass, one lamp material), so
// fifty cars of twenty types compile three programs, not sixty.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { toonMaterial, addHullOutline } from '../../render/toon.js';
import { addRim } from '../../actors/outfitParts.js';
import { LAYER_FX } from '../../render/layers.js';

// ---------------------------------------------------------------- shared materials

let mats = null;
// The fleet's materials, created once on first use (so importing this module in a DOM-free unit
// test never touches WebGL). `body` is the plain vertex-colour toon; `traffic` is its twin for
// InstancedMesh, where the instance colour repaints only the vertices marked as paint (aPaint).
export function fleetMaterials() {
  if (mats) return mats;
  const body = addRim(toonMaterial({ vertexColors: true }), 0x9fb8e0, 0.42, [0.72, 0.9], 0.26);
  const traffic = addRim(toonMaterial({ vertexColors: true }), 0x9fb8e0, 0.42, [0.72, 0.9], 0.26);
  paintMask(traffic);
  const glass = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.72 });
  const lamps = new THREE.MeshBasicMaterial({ vertexColors: true });
  lamps.userData.noShadow = true;
  const smoke = toonMaterial({ color: 0x7c8089 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  mats = { body, traffic, glass, lamps, smoke, flame };
  for (const [k, m] of Object.entries(mats)) m.name = `fleet-${k}`;
  return mats;
}

// InstancedMesh normally multiplies EVERY vertex colour by the instance colour, which would tint
// the tyres and chrome along with the paint. This swaps three's colour_vertex chunk for one that
// blends toward the instance colour only by the vertex's aPaint weight (1 = paint, 0 = fixed).
function paintMask(mat) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey?.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.vertexShader = 'attribute float aPaint;\n' + shader.vertexShader.replace('#include <color_vertex>', `
#if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
	vColor = vec4( 1.0 ); // three r186: vColor is a vec4 (was vec3, which failed to compile)
#endif
#ifdef USE_COLOR
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb = mix( vColor.rgb, instanceColor.rgb, aPaint );
#endif`);
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|paintmask`;
}

// An unlit glow (jet cores, beacons): additive so it reads as light, not a lit surface.
export function glowMaterial(color, strength = 1, additive = true) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: strength, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
}

// ---------------------------------------------------------------- colours

export const C = {
  ink: 0x0b0b12, tyre: 0x141519, tyreWall: 0x1d1e23, hub: 0x6b7079, chrome: 0xaab2bd, trim: 0x1b1c21,
  under: 0x0f1013, interior: 0x15161b, seat: 0x2a2730, grille: 0x0d0e11, rubber: 0x18191d,
  glass: 0x4d6b8e, glassDark: 0x26364a, glassLit: 0xf0cf86,
  head: 0xf6f3e4, headOff: 0x8b8a80, tail: 0xd8202e, tailOff: 0x5a1a20, brake: 0xff3442,
  amber: 0xffa22a, amberOff: 0x6a4a1c, reverse: 0xf4f6ff, reverseOff: 0x5c5e64,
  red: 0xff2a36, blue: 0x2f7dff, beaconOff: 0x2a2c34,
};

// ---------------------------------------------------------------- geometry helpers

// A closed loft through rings of 2D points (x, y) placed at successive z (stations). Every ring
// must have the same number of points, wound the same way (counter-clockwise seen from +z, i.e.
// starting bottom-left going around through the top). Caps both ends. Rings may collapse to a
// line or a point (a raked windscreen is a ring of zero height lofted to a full-height one).
export function loft(stations, { capStart = true, capEnd = true } = {}) {
  const n = stations[0].pts.length;
  const pos = [], idx = [];
  for (const s of stations) for (const [x, y] of s.pts) pos.push(x, y, s.z);
  for (let k = 0; k < stations.length - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = k * n + i, b = k * n + ((i + 1) % n), c = (k + 1) * n + i, d = (k + 1) * n + ((i + 1) % n);
      idx.push(a, b, c, b, d, c);
    }
  }
  const last = (stations.length - 1) * n;
  if (capStart) for (let i = 1; i < n - 1; i++) idx.push(0, i + 1, i);
  if (capEnd) for (let i = 1; i < n - 1; i++) idx.push(last, last + i, last + i + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  // Stations run nose (+z) to tail: flip so faces point outward whichever order the caller used.
  if (stations.length > 1 && stations[0].z < stations[stations.length - 1].z) flipWinding(g);
  return g;
}

function flipWinding(g) {
  const ix = g.index.array;
  for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
}

// A chamfered box section ring, 8 points: bottom width hb, side half width hw from y0 to y1, top
// half width ht at yt (ht < hw gives tumblehome). Counter-clockwise from bottom-left.
export function ring8(y0, hb, hw, ym, ht, yt) {
  return [[-hb, y0], [-hw, y0 + Math.min(0.12, (ym - y0) * 0.4)], [-hw, ym], [-ht, yt], [ht, yt], [hw, ym], [hw, y0 + Math.min(0.12, (ym - y0) * 0.4)], [hb, y0]];
}

// Extrudes a side profile (array of [z, y], nose at +z) across the car's width, bevelled, centred
// on x = 0. For flat-sided things (truck boxes, bus sides, train ends).
export function sideExtrude(profile, width, bevel = 0.03, curveSegments = 4) {
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, steps: 1, curveSegments });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // shape x -> +z (forward); extrude depth -> x
  return g;
}

// Box centred at (x, y, z).
export function boxAt(w, h, d, x = 0, y = 0, z = 0) { return new THREE.BoxGeometry(w, h, d).translate(x, y, z); }

// Cylinder along the x axis (axles, tyres, exhausts across the car).
export function cylX(r, len, x, y, z, seg = 12, r2 = r) { return new THREE.CylinderGeometry(r, r2, len, seg).rotateZ(Math.PI / 2).translate(x, y, z); }
// Cylinder along z (exhaust pipes, gun barrels, nozzles pointing forward).
export function cylZ(r, len, x, y, z, seg = 10, r2 = r) { return new THREE.CylinderGeometry(r2, r, len, seg).rotateX(Math.PI / 2).translate(x, y, z); }
export function cylY(r, h, x, y, z, seg = 10, r2 = r) { return new THREE.CylinderGeometry(r, r2, h, seg).translate(x, y, z); }

// A flat 2D shape (points [z, y]) laid on a car's flank at x, facing +x (or -x when side < 0):
// stripes, arch shadows, liveries, door seams. Sits `lift` proud of the flank.
export function flankDecal(pts, x, side, lift = 0.006) {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateY(-Math.PI / 2); // shape x -> +z, facing -x
  if (side > 0) { g.scale(-1, 1, 1); flipWinding(g); } // mirror to face +x, z still forward
  return g.translate(x + side * lift, 0, 0);
}

// A dark half-disc wheel-arch shadow on the flank, radius r around the wheel centre.
export function archDecal(r, cz, cy, x, side, seg = 10) {
  const pts = [];
  for (let i = 0; i <= seg; i++) { const a = Math.PI * (i / seg); pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  pts.push([cz - r, cy - r * 0.35], [cz + r, cy - r * 0.35]);
  return flankDecal(pts, x, side);
}

// A tyre with a rounded shoulder (a lathe, so it reads round at any angle, not as a drum) plus a
// hub disc on each face and a bright cap: returned as parts [geometry, colour]. Axis along x.
export function wheelParts(r, width, { seg = 12, hub = C.hub, cap = C.chrome, tyre = C.tyre, dish = 0.58 } = {}) {
  const hw = width / 2, sh = Math.min(r * 0.18, hw * 0.6);
  // Five profile points (four bands): sidewall, rounded shoulder, tread, shoulder, sidewall.
  const prof = [
    new THREE.Vector2(r * 0.62, -hw), new THREE.Vector2(r - sh, -hw), new THREE.Vector2(r, 0),
    new THREE.Vector2(r - sh, hw), new THREE.Vector2(r * 0.62, hw),
  ];
  const t = new THREE.LatheGeometry(prof, seg).rotateZ(Math.PI / 2);
  const hubG = new THREE.CylinderGeometry(r * dish, r * dish, width * 0.92, Math.max(8, seg - 2)).rotateZ(Math.PI / 2);
  const capG = new THREE.CylinderGeometry(r * 0.2, r * 0.24, width + 0.04, 6).rotateZ(Math.PI / 2);
  return [[t, tyre, true], [hubG, hub, true], [capG, cap, true]];
}

// ---------------------------------------------------------------- the builder

const ZERO = new THREE.Vector3();

// Collects parts, then finalises them into: a (skinned when there are bones) body mesh, its ink
// hull, a glass mesh and a lamp mesh. Parts are added in model space (local +z forward, y up,
// origin on the ground at the vehicle's centre) and bound rigidly to one bone each.
export class VehicleBuilder {
  constructor({ outline = 0.022, name = 'vehicle' } = {}) {
    this.outlineWidth = outline;
    this.name = name;
    this.lists = { body: [], glass: [], lamps: [] };
    this.ink = [];
    this.root = new THREE.Bone();
    this.root.name = 'root';
    this.bones = [this.root];
    this.boneByName = { root: this.root };
    this.lampRanges = []; // { group, start, count, on, off }
    this.lampCount = 0;
  }

  // Adds a bone at model-space position `pos` under `parent` (a bone name). Returns the bone.
  bone(name, parent = 'root', pos = ZERO) {
    const p = this.boneByName[parent];
    const b = new THREE.Bone();
    b.name = name;
    // Bone positions are relative to the parent; parents are positioned in model space too.
    const pw = this.worldOf(p);
    b.position.set(pos.x - pw.x, pos.y - pw.y, pos.z - pw.z);
    p.add(b);
    this.bones.push(b);
    this.boneByName[name] = b;
    return b;
  }

  worldOf(b) {
    const v = new THREE.Vector3();
    for (let o = b; o && o.isBone; o = o.parent) v.add(o.position);
    return v;
  }

  // to: 'body' | 'glass' | 'lamps'. color: hex. bone: name. ink: include in the outline hull.
  // paint: 1 for the primary paint (re-coloured per instance in traffic), 0 otherwise.
  // smooth: keep the geometry's own (smooth) normals instead of flat facets.
  // lamp: a lamp-group name ('head', 'tail', 'brake', 'left', 'right', 'reverse', 'beaconA'...)
  //   with on/off colours, so setLamps() can switch it.
  add(geo, { to = 'body', color = 0xffffff, bone = 'root', ink = to !== 'lamps', paint = 0, smooth = false, lamp = null, on = null, off = null } = {}) {
    // Smooth parts given as indexed geometry without normals get welded normals before they
    // are split into the flat triangle soup everything else uses.
    if (smooth && geo.index && !geo.attributes.normal) geo.computeVertexNormals();
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!smooth || !g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const c = new THREE.Color(lamp ? (off ?? color) : color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(n).fill(paint), 1));
    const bi = this.bones.indexOf(this.boneByName[bone]);
    if (bi < 0) throw new Error(`no bone ${bone}`);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    if (lamp) {
      this.lampRanges.push({ group: lamp, start: this.lampCount, count: n, on: new THREE.Color(on ?? color), off: new THREE.Color(off ?? color) });
      this.lampCount += n;
    }
    this.lists[to].push(g);
    if (ink && to !== 'lamps') {
      const w = new THREE.BufferGeometry();
      w.setAttribute('position', g.attributes.position.clone());
      const welded = mergeVertices(w, 1e-4);
      welded.computeVertexNormals();
      welded.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(welded.attributes.position.count * 4).map((_, i) => (i % 4 === 0 ? bi : 0)), 4));
      welded.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(welded.attributes.position.count * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
      this.ink.push(welded);
    }
    return g;
  }

  // Merges the parts into shareable geometry plus a recipe for the bones: build it once per
  // (type, palette, damage) and spawn as many cars from it as needed (spawnTemplate).
  template({ extraBounds = 0.4 } = {}) {
    const geos = {};
    for (const k of ['body', 'glass', 'lamps']) geos[k] = this.lists[k].length ? mergeGeometries(this.lists[k], false) : null;
    geos.ink = this.ink.length ? mergeGeometries(this.ink, false) : null;
    const skinned = this.bones.length > 1;
    for (const g of Object.values(geos)) if (g) { if (!skinned) strip(g); g.computeBoundingSphere(); }
    if (geos.ink) geos.ink.boundingSphere.radius += this.outlineWidth + 0.05;
    const boneDefs = this.bones.map((b) => ({ name: b.name, parent: b.parent?.isBone ? b.parent.name : null, pos: b.position.clone() }));
    return { name: this.name, geos, boneDefs, lampRanges: this.lampRanges, outlineWidth: this.outlineWidth, extraBounds, skinned };
  }

  // One-shot: template + spawn.
  build(opts = {}) { return spawnTemplate(this.template(opts), opts); }

  // Static (unskinned, unmerged-into-meshes) geometries: for instancing and for merging parked
  // cars into city chunks. Skin attributes stripped; aPaint kept on the body.
  geometries() {
    const out = {};
    for (const k of ['body', 'glass', 'lamps']) out[k] = this.lists[k].length ? strip(mergeGeometries(this.lists[k].map((g) => g.clone()), false)) : null;
    return out;
  }
}

// Instantiates a template: fresh bones and skeleton (so each car's wheels turn on their own),
// shared fill/ink/glass geometry, and a private copy of the lamp geometry (so each car's lamps
// switch on their own). Returns { group, body, outline, glass, lamps, bones, skeleton, lampRanges }.
export function spawnTemplate(tpl, { materials = fleetMaterials() } = {}) {
  const group = new THREE.Group();
  group.name = tpl.name;
  const skinned = tpl.skinned;
  const bones = {}, list = [];
  for (const d of tpl.boneDefs) {
    const b = new THREE.Bone();
    b.name = d.name;
    b.position.copy(d.pos);
    if (d.parent) bones[d.parent].add(b);
    bones[d.name] = b;
    list.push(b);
  }
  let skeleton = null;
  if (skinned) {
    group.add(bones.root);
    group.updateMatrixWorld(true);
    skeleton = new THREE.Skeleton(list);
  }
  const make = (geo, mat) => {
    const m = skinned ? new THREE.SkinnedMesh(geo, mat) : new THREE.Mesh(geo, mat);
    if (skinned) {
      m.bind(skeleton, new THREE.Matrix4());
      // A fixed, generous sphere: recomputing a skinned sphere walks every vertex, and parts only
      // ever move a little (wheels spin in place, a turret rises half a metre).
      m.boundingSphere = geo.boundingSphere.clone();
      m.boundingSphere.radius += tpl.extraBounds;
    }
    group.add(m);
    return m;
  };
  const g = tpl.geos;
  const body = g.body ? make(g.body, materials.body) : null;
  if (body) { body.castShadow = true; body.receiveShadow = true; body.name = 'body'; }
  let outline = null;
  if (g.ink && body) {
    const carrier = skinned ? new THREE.SkinnedMesh(g.ink, materials.body) : new THREE.Mesh(g.ink, materials.body);
    if (skinned) carrier.bind(skeleton, new THREE.Matrix4());
    outline = addHullOutline(carrier, tpl.outlineWidth);
    carrier.remove(outline);
    outline.frustumCulled = true;
    if (skinned) { outline.boundingSphere = g.ink.boundingSphere.clone(); outline.boundingSphere.radius += tpl.extraBounds; }
    outline.layers.set(LAYER_FX);
    outline.name = 'outline';
    group.add(outline);
  }
  const glass = g.glass ? make(g.glass, materials.glass) : null;
  if (glass) { glass.castShadow = false; glass.name = 'glass'; }
  const lamps = g.lamps ? make(g.lamps.clone(), materials.lamps) : null;
  if (lamps) { lamps.castShadow = false; lamps.name = 'lamps'; lamps.geometry.boundingSphere = g.lamps.boundingSphere; }
  return { group, body, outline, glass, lamps, bones, skeleton, lampRanges: tpl.lampRanges };
}

function strip(g) {
  if (g.attributes.skinIndex) g.deleteAttribute('skinIndex');
  if (g.attributes.skinWeight) g.deleteAttribute('skinWeight');
  return g;
}

// ---------------------------------------------------------------- lamps

// Switches named lamp groups on a built lamp mesh by rewriting the colour attribute in place
// (only when something changed: a toggle, not per frame). `state` maps group -> bool.
export function applyLamps(lampMesh, ranges, state, last) {
  if (!lampMesh) return;
  const col = lampMesh.geometry.attributes.color;
  let dirty = false;
  for (const r of ranges) {
    const on = !!state[r.group];
    if (last && last[r.group] === on) continue;
    const c = on ? r.on : r.off;
    for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, c.r, c.g, c.b);
    dirty = true;
  }
  if (dirty) col.needsUpdate = true;
  if (last) for (const r of ranges) last[r.group] = !!state[r.group];
}

// ---------------------------------------------------------------- measuring

// Draw calls and triangles a group costs as rendered in the colour pass (visible meshes only,
// outlines included; instanced meshes count instances x triangles but one draw).
export function measure(root) {
  let draws = 0, tris = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3;
    draws++;
    tris += t * (o.isInstancedMesh ? o.count : 1);
  });
  return { draws, tris: Math.round(tris) };
}

export function triangles(geo) {
  if (!geo) return 0;
  return Math.round((geo.index ? geo.index.count : geo.attributes.position.count) / 3);
}
