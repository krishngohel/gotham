// The street fleet's public API: drivable individual vehicles (skinned, 4-5 draws), instanced
// ambient traffic (3 draws per type: body, glass, lamps), a one-draw LOD1, and parked variants as
// plain geometry the city builder merges into its static chunks. Specs live in fleet.js.
import * as THREE from 'three';
import { VehicleBuilder, spawnTemplate, fleetMaterials, applyLamps, boxAt, cylX, sideExtrude, triangles, C } from './kit.js';
import { FLEET, FLEET_TYPES, buildFleetVehicle } from './fleet.js';

export { FLEET, FLEET_TYPES };

// Lamp groups every road vehicle understands (a vehicle simply lacks the ones it doesn't have).
export const LAMP_GROUPS = ['head', 'tail', 'brake', 'left', 'right', 'reverse', 'beaconA', 'beaconB', 'sign'];
export const DAMAGE = { clean: 0, dented: 1, smoking: 2, wrecked: 3 };

const cache = new Map(); // `${type}|${pal}|${damage}` -> { tpl, info, stat }

function key(type, pal, dmg) { return `${type}|${pal}|${dmg}`; }

// Builds (once) the template for a type/palette/damage combination. `pal` is a palette index, or
// a string 'c<hex>' for an exact primary paint (the old createStreetCar(color) contract): that
// reuses palette 0's geometry with the paint vertices recoloured.
function template(type, pal = 0, damage = 0) {
  const k = key(type, pal, damage);
  let c = cache.get(k);
  if (c) return c;
  if (typeof pal === 'string') {
    const base = template(type, 0, 0);
    const hex = parseInt(pal.slice(1), 16);
    const geos = { ...base.tpl.geos, body: base.tpl.geos.body.clone() };
    const stat = { ...base.stat, body: base.stat.body.clone() };
    repaint(geos.body, hex);
    repaint(stat.body, hex);
    if (damage > 0) dent(geos, stat, base.info, damage);
    c = { tpl: { ...base.tpl, geos }, info: { ...base.info, pal: [hex, base.info.pal[1]] }, stat };
  } else {
    const b = new VehicleBuilder({ outline: type === 'bus' || FLEET[type].category === 'emergency' ? 0.026 : 0.022, name: type });
    const info = buildFleetVehicle(b, type, pal);
    const stat = b.geometries(); // static copies (before template() merges): instancing + parking
    const tpl = b.template();
    if (damage > 0) dent(tpl.geos, stat, info, damage);
    c = { tpl, info, stat };
  }
  cache.set(k, c);
  return c;
}

// Dents and scorches a copy of the body: the nose crumples back, one flank is pushed in, and paint
// near the damage darkens; `wrecked` burns the whole paint job. Displacement is a pure function of
// the rest position, so a vertex shared by several faces moves as one and the hull stays closed.
function dent(geos, stat, info, level) {
  const L2 = info.L / 2;
  const fn = (x, y, z) => {
    let dx = 0, dy = 0, dz = 0, scorch = 0;
    const front = (z - (L2 - 0.55)) / 0.55;
    if (front > 0) { const k = front * front; dz -= 0.16 * k * (0.7 + 0.3 * Math.sin(x * 9)); dy -= 0.05 * k * Math.cos(x * 5); scorch = Math.max(scorch, front); }
    const side = Math.exp(-(((z + 0.4) / 0.6) ** 2) - (((y - 0.7) / 0.3) ** 2));
    if (x > info.bh * 0.6 && side > 0.05) { dx -= 0.09 * side; scorch = Math.max(scorch, side * 0.8); }
    return [dx, dy, dz, scorch];
  };
  const burn = level >= 3;
  const apply = (g, colours) => {
    if (!g) return;
    const pos = g.attributes.position, col = colours ? g.attributes.color : null, si = g.attributes.skinIndex;
    const out = g.clone();
    const p2 = out.attributes.position, c2 = col ? out.attributes.color : null;
    for (let i = 0; i < pos.count; i++) {
      if (si && si.getX(i) !== 0) continue; // only the hull: wheels on their bones stay round
      const [dx, dy, dz, s] = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
      p2.setXYZ(i, pos.getX(i) + dx, pos.getY(i) + dy, pos.getZ(i) + dz);
      if (c2) {
        const k = burn ? 0.3 : 1 - 0.45 * s;
        c2.setXYZ(i, c2.getX(i) * k + (burn ? 0.04 : 0), c2.getY(i) * k + (burn ? 0.035 : 0), c2.getZ(i) * k + (burn ? 0.03 : 0));
      }
    }
    out.computeVertexNormals();
    out.computeBoundingSphere();
    return out;
  };
  if (geos.ink) { const r = geos.ink.boundingSphere.radius; geos.ink = apply(geos.ink, false); geos.ink.computeVertexNormals(); geos.ink.boundingSphere.radius = r; }
  geos.body = apply(geos.body, true);
  // The static copies (parked wrecks) get the same treatment.
  if (stat.body) stat.body = apply(stat.body, true);
}

// ---------------------------------------------------------------- individual vehicles

// A drivable (or just individually animated) fleet vehicle.
// opts: { palette: index, color: hex override for the primary paint, damage: 0..3 }
// Returns {
//   group, type, kind: 'car', label, category,
//   wheels: [{ pivot, spin, front }]   pivot.rotation.y steers, spin.rotation.x rolls (vehicles.js)
//   wheelRadius, radius, halfLength, halfWidth, height,
//   lampAnchors: { head: Vector3[], tail: Vector3[] }  (model space, for glow sprites)
//   seat: Object3D (driver's seat), smokeAnchor: Object3D,
//   setLamps({ head, tail, brake, left, right, reverse, beaconA, beaconB, sign }),
//   setDamage(level 0..3), damage, setLod(0|1), lod1: Mesh, update(dt) (blinkers, beacons, smoke),
//   setSiren(on), indicate(-1|0|1)  (-1 = right, 1 = left)
// }
export function createStreetVehicle(type, { palette = 0, color = null, damage = 0 } = {}) {
  const spec = FLEET[type];
  if (!spec) throw new Error(`unknown fleet type ${type}`);
  const mats = fleetMaterials();
  if (color != null) palette = `c${color.toString(16).padStart(6, '0')}`;
  let t = template(type, palette, damage);
  const s = spawnTemplate(t.tpl, { materials: mats });
  const info = t.info;
  const group = s.group;
  const wheels = info.wheels.map((w) => ({ pivot: s.bones[w.pivotName], spin: s.bones[w.spinName], front: w.front }));
  const seat = new THREE.Object3D(); seat.name = 'seat'; seat.position.copy(info.seat); group.add(seat);
  const smokeAnchor = new THREE.Object3D(); smokeAnchor.name = 'smoke'; smokeAnchor.position.copy(info.smoke); group.add(smokeAnchor);
  // The smoke puffs and the LOD1 body are made on first use, so a clean car at LOD0 is exactly
  // body + ink + glass + lamps (and no two of its fill meshes share a material).
  let smoke = null, lod1 = null;
  const ensureSmoke = () => { if (!smoke) { smoke = smokeMesh(); smoke.visible = false; smokeAnchor.add(smoke); } return smoke; };
  const ensureLod = () => {
    if (!lod1) { lod1 = new THREE.Mesh(lodGeometry(type, palette), mats.traffic); lod1.name = 'lod1'; lod1.visible = false; group.add(lod1); }
    return lod1;
  };
  const lampState = { head: true, tail: true }, lastLamps = {};
  applyLamps(s.lamps, s.lampRanges, lampState, lastLamps);
  let blink = 0, indicate = 0, siren = false, sirenT = 0, smokeT = 0;
  let cur = { body: s.body, outline: s.outline, glass: s.glass };
  const radius = type === 'bus' ? 2.6 : Math.max(info.W / 2 + 0.1, Math.min(info.L / 2 - 0.2, 2.3));

  const api = {
    group, type, kind: 'car', label: spec.label, category: spec.category,
    wheels, wheelRadius: info.wheelR, radius, halfLength: info.L / 2, halfWidth: info.W / 2, height: info.H,
    lampAnchors: info.anchors, seat, smokeAnchor, damage,
    get lod1() { return ensureLod(); },
    bones: s.bones,
    setLamps(state) { Object.assign(lampState, state); applyLamps(s.lamps, s.lampRanges, lampState, lastLamps); },
    indicate(dir) { indicate = dir; if (!dir) api.setLamps({ left: false, right: false }); },
    setSiren(on) { siren = on; if (!on) api.setLamps({ beaconA: false, beaconB: false }); },
    // Swaps the body (and its ink) for a dented/scorched copy; smoke from level 2 up.
    setDamage(level) {
      level = Math.max(0, Math.min(3, level | 0));
      if (level === api.damage) return;
      api.damage = level;
      t = template(type, palette, level);
      for (const k of ['body', 'outline']) {
        const m = cur[k];
        if (!m) continue;
        m.geometry = k === 'body' ? t.tpl.geos.body : t.tpl.geos.ink;
      }
      if (level >= 2 || smoke) ensureSmoke().visible = level >= 2;
      if (cur.glass) cur.glass.visible = level < 3;
    },
    setLod(level) {
      const far = level >= 1;
      for (const m of [s.body, s.outline, s.glass, s.lamps]) if (m) m.visible = !far && (m !== s.glass || api.damage < 3);
      if (far || lod1) ensureLod().visible = far;
    },
    update(dt) {
      blink += dt;
      if (indicate) {
        const on = blink % 0.7 < 0.38;
        api.setLamps({ left: indicate > 0 && on, right: indicate < 0 && on });
      }
      if (siren) {
        sirenT += dt;
        const ph = Math.floor(sirenT * 6) % 4;
        api.setLamps({ beaconA: ph === 0 || ph === 1, beaconB: ph === 2 || ph === 3 });
      }
      if (smoke?.visible) {
        smokeT += dt;
        smoke.rotation.y = smokeT * 0.8;
        const k = 1 + 0.12 * Math.sin(smokeT * 5);
        smoke.scale.set(k, 1 + 0.2 * Math.sin(smokeT * 3.1), k);
      }
    },
  };
  if (damage >= 2) ensureSmoke().visible = true;
  if (damage >= 3 && s.glass) s.glass.visible = false;
  return api;
}

// Recolours the primary paint (aPaint = 1) of a body geometry to `hex`, in place.
export function repaint(geo, hex) {
  const c = new THREE.Color(hex);
  const col = geo.attributes.color, paint = geo.attributes.aPaint;
  for (let i = 0; i < col.count; i++) if (paint.getX(i) > 0.5) col.setXYZ(i, c.r, c.g, c.b);
  col.needsUpdate = true;
}

let smokeGeo = null;
function smokeMesh() {
  if (!smokeGeo) {
    const parts = [];
    const puffs = [[0, 0.15, 0, 0.22], [0.12, 0.45, -0.1, 0.3], [-0.08, 0.8, -0.25, 0.38], [0.1, 1.2, -0.45, 0.46]];
    for (const [x, y, z, r] of puffs) parts.push(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z).toNonIndexed());
    smokeGeo = mergeAll(parts);
    // Smooth normals per puff (normal = direction from its centre): round, cartoon cloud balls.
    const pos = smokeGeo.attributes.position, nrm = new Float32Array(pos.count * 3);
    let o = 0;
    for (const [x, y, z] of puffs) {
      const n = parts[puffs.findIndex((q) => q[0] === x && q[1] === y)].attributes.position.count;
      for (let i = 0; i < n; i++, o++) {
        const v = new THREE.Vector3(pos.getX(o) - x, pos.getY(o) - y, pos.getZ(o) - z).normalize();
        nrm[o * 3] = v.x; nrm[o * 3 + 1] = v.y; nrm[o * 3 + 2] = v.z;
      }
    }
    smokeGeo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  }
  const m = new THREE.Mesh(smokeGeo, fleetMaterials().smoke);
  m.castShadow = false;
  m.name = 'smokePuffs';
  return m;
}

function mergeAll(list) {
  let n = 0;
  for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o); o += g.attributes.position.array.length; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return out;
}

// ---------------------------------------------------------------- LOD1 (one draw, <= 300 tris)

const lodCache = new Map();
// The far LOD: the side silhouette extruded flat, a proud glass band, four hexagonal wheels and
// lamp dots, all one vertex-coloured geometry (with aPaint, so the traffic instancer can use it).
export function lodGeometry(type, palette = 0) {
  const k = `${type}|${palette}`;
  if (lodCache.has(k)) return lodCache.get(k);
  const { info } = template(type, palette, 0);
  const b = new VehicleBuilder({ name: `${type}-lod1` });
  const w = info.bh * 2;
  b.add(sideExtrude(info.silhouette, w, 0), { color: info.pal[0], paint: 1, ink: false });
  if (info.glassBand) b.add(sideExtrude(info.glassBand, w - 0.12 * 2 + 0.24, 0).scale(1.0, 1, 1), { color: C.glassDark, ink: false });
  for (const wl of info.wheels) b.add(cylX(info.wheelR, 0.22, wl.x, info.wheelR, wl.z, 6), { color: C.tyre, ink: false });
  for (const a of info.anchors.head) b.add(boxAt(0.2, 0.1, 0.04, a.x, a.y, a.z), { color: C.head, ink: false });
  for (const a of info.anchors.tail) b.add(boxAt(0.2, 0.1, 0.04, a.x, a.y, a.z), { color: C.tail, ink: false });
  const g = b.geometries().body;
  g.computeBoundingSphere();
  lodCache.set(k, g);
  return g;
}

// ---------------------------------------------------------------- instanced ambient traffic

// Three InstancedMeshes (body, glass, lamps) for `count` cars of one type, sharing the fleet's
// materials. The body uses the paint-mask material: setInstance(i, matrix, colour) repaints only
// that car's primary paint. lod: 1 swaps in the one-draw silhouette body and drops glass/lamps
// (so a LOD1 traffic set is a single draw). `noseX`: rotate the geometry so the nose faces +x
// (cityLife.js's convention) instead of +z.
export function createTrafficInstances(type, count, { palette = 0, lod = 0, noseX = false } = {}) {
  const m = fleetMaterials();
  const t = template(type, palette, 0);
  const rot = noseX ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : null;
  const prep = (g) => { if (!g) return null; const c = g.clone(); if (rot) c.applyMatrix4(rot); c.computeBoundingSphere(); return c; };
  const body = new THREE.InstancedMesh(prep(lod ? lodGeometry(type, palette) : t.stat.body), m.traffic, count);
  const meshes = [body];
  let glass = null, lamps = null;
  if (!lod) {
    if (t.stat.glass) { glass = new THREE.InstancedMesh(prep(t.stat.glass), m.glass, count); meshes.push(glass); }
    if (t.stat.lamps) { lamps = new THREE.InstancedMesh(prep(lampsOn(t)), m.lamps, count); meshes.push(lamps); }
  }
  body.castShadow = true;
  const c = new THREE.Color(t.info.pal[0]);
  for (let i = 0; i < count; i++) body.setColorAt(i, c);
  for (const im of meshes) { im.frustumCulled = false; im.name = `traffic-${type}`; }
  return {
    body, glass, lamps, meshes, type, halfLength: t.info.L / 2, lampAnchors: t.info.anchors,
    setInstance(i, matrix, colorHex = null) {
      for (const im of meshes) im.setMatrixAt(i, matrix);
      if (colorHex != null) { c.set(colorHex); body.setColorAt(i, c); body.instanceColor.needsUpdate = true; }
    },
    commit() { for (const im of meshes) im.instanceMatrix.needsUpdate = true; },
  };
}

// Static lamp colours for traffic and parked cars: heads and tails lit, everything else off.
function lampsOn(t) {
  const g = t.stat.lamps.clone();
  const col = g.attributes.color;
  for (const r of t.tpl.lampRanges) {
    const c = r.group === 'head' || r.group === 'tail' || r.group === 'sign' ? r.on : r.off;
    for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

// ---------------------------------------------------------------- parked cars (static chunks)

// World-space geometry for a parked car, ready for the city builder's buckets:
//   ctx.buckets.add('painted', parts.painted); ctx.buckets.add('glass', parts.glass);
//   ctx.buckets.add('glow', parts.glow)
// (all non-indexed with position/normal, painted and glow with colour). Parked cars have their
// lamps dark except a dim tail, and no ink hull (the city's edge pass inks them).
export const PARKED_TYPES = ['sedan', 'sedan_deco', 'sedan_compact', 'coupe', 'hatchback', 'wagon', 'suv', 'pickup', 'van_delivery', 'taxi', 'limousine', 'box_truck'];
export function parkedVehicleParts(type, { palette = 0, damage = 0, matrix = new THREE.Matrix4(), lit = false } = {}) {
  const t = template(type, palette, damage);
  const out = {};
  const prep = (g) => {
    if (!g) return null;
    const c = g.clone();
    if (c.attributes.aPaint) c.deleteAttribute('aPaint');
    c.applyMatrix4(matrix);
    return c;
  };
  out.painted = prep(t.stat.body);
  out.glass = damage >= 3 ? null : prep(t.stat.glass);
  const lamps = t.stat.lamps.clone();
  const col = lamps.attributes.color;
  for (const r of t.tpl.lampRanges) {
    const c = lit && (r.group === 'head' || r.group === 'tail') ? r.on : r.off;
    for (let i = r.start; i < r.start + r.count; i++) col.setXYZ(i, c.r, c.g, c.b);
  }
  out.glow = prep(lamps);
  return out;
}

// ---------------------------------------------------------------- budgets (for tests/garage)

export function fleetStats(type, palette = 0) {
  const t = template(type, palette, 0);
  const g = t.tpl.geos;
  const lod0 = triangles(g.body) + triangles(g.glass) + triangles(g.lamps);
  return {
    type, lod0Tris: lod0, inkTris: triangles(g.ink), lod1Tris: triangles(lodGeometry(type, palette)),
    trafficDraws: 3, individualDraws: [g.body, g.ink, g.glass, g.lamps].filter(Boolean).length,
  };
}
