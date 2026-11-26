// Body generators shared by the street fleet: a lofted car body (one closed hull with real wheel
// arches cut into it, a greenhouse on top, pillars, a roof panel, a cabin silhouette inside), the
// 1930s "deco" variant (narrow hood, separate pontoon fenders and running boards), a cab for
// trucks, slab-sided boxes for vans/buses/trucks, plus the small parts every vehicle shares
// (wheels on bones, lamps by group, bumpers, mirrors). Everything goes through VehicleBuilder.
import * as THREE from 'three';
import { C, loft, ring8, boxAt, cylX, cylZ, wheelParts, flankDecal } from './kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;

// Body profile keys, nose (+z) first: { z, y0 bottom, hw side half-width, ym shoulder crease,
// yt top surface, ht top half-width }. sampleKeys linearly interpolates every field at z.
export function sampleKeys(keys, z) {
  if (z >= keys[0].z) return { ...keys[0], z };
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (z <= a.z && z >= b.z) {
      const t = a.z === b.z ? 0 : (a.z - z) / (a.z - b.z);
      const o = { z };
      for (const k of ['y0', 'hw', 'ym', 'yt', 'ht']) o[k] = lerp(a[k], b[k], t);
      return o;
    }
  }
  return { ...keys[keys.length - 1], z };
}

// Lofts the lower body through `keys`, adding stations around each wheel so the bottom edge
// rises over it in an arch (r: arch radius, cy: wheel centre height). The arch runs right across
// the hull; archTubs() fills the middle with a dark wheel-well so it never reads as a tunnel.
export function bodyLoft(keys, arches = []) {
  const zs = new Set(keys.map((k) => +k.z.toFixed(4)));
  for (const a of arches) for (const f of [-1.12, -0.92, -0.6, -0.25, 0.25, 0.6, 0.92, 1.12]) zs.add(+(a.z + f * a.r).toFixed(4));
  const list = [...zs].sort((p, q) => q - p);
  const stations = list.map((z) => {
    const s = sampleKeys(keys, z);
    let y0 = s.y0;
    for (const a of arches) {
      const dz = Math.abs(z - a.z);
      if (dz < a.r) y0 = Math.max(y0, a.cy + Math.sqrt(a.r * a.r - dz * dz) * (dz < a.r * 0.95 ? 1 : 0.6));
    }
    const ym = Math.max(s.ym, y0 + 0.08);
    const yt = Math.max(s.yt, ym + 0.02);
    return { z, pts: ring8(y0, Math.max(0.05, s.hw - 0.12), s.hw, ym, Math.min(s.ht, s.hw - 0.02), yt) };
  });
  return loft(stations);
}

export function archTubs(b, arches, keys, wheelW) {
  for (const a of arches) {
    const s = sampleKeys(keys, a.z);
    const inner = s.hw - wheelW - 0.04;
    const top = a.cy + a.r - 0.02;
    b.add(boxAt(inner * 2, top - 0.16, a.r * 2.05, 0, (top + 0.16) / 2, a.z), { color: C.under, ink: false });
    // The arch's lip: a slightly darker band around the opening reads as a rolled edge.
  }
}

// A greenhouse ring: base half-width gwb at yb, top half-width gwt at yr.
function ring6(yb, gwb, yr, gwt) {
  const c = Math.min(0.06, (yr - yb) * 0.3);
  return [[-gwb, yb], [-gwt, yr - c], [-gwt + c, yr], [gwt - c, yr], [gwt, yr - c], [gwb, yb]];
}

// Thin bar between two points (pillars, rails, ladder stiles).
export function strut(p0, p1, w = 0.08, t = 0.05) {
  const d = new THREE.Vector3().subVectors(p1, p0);
  const len = d.length();
  const g = new THREE.BoxGeometry(w, len, t);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()));
  return g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
}

// Adds a car's greenhouse: glass loft, roof panel, A/B/C pillars, and returns the roof box.
// g = { front: z windscreen base, roofF, roofR, rear: z rear-glass base, roofY, tumble, bPillars,
//       pillarColor, roofColor, roofPaint }
export function greenhouse(b, keys, g, pal) {
  const base = (z) => sampleKeys(keys, z);
  const gw = (z) => base(z).hw - 0.08;
  const gwt = (z) => gw(z) - g.tumble;
  const st = [
    { z: g.front, pts: ring6(base(g.front).yt - 0.02, gw(g.front) - 0.04, base(g.front).yt - 0.02, gwt(g.front)) },
    { z: g.roofF, pts: ring6(base(g.roofF).yt - 0.02, gw(g.roofF), g.roofY, gwt(g.roofF)) },
    { z: g.roofR, pts: ring6(base(g.roofR).yt - 0.02, gw(g.roofR), g.roofY, gwt(g.roofR)) },
  ];
  if (g.rear < g.roofR - 0.02) st.push({ z: g.rear, pts: ring6(base(g.rear).yt - 0.02, gw(g.rear) - 0.04, base(g.rear).yt - 0.02 + (g.rearH ?? 0), gwt(g.rear)) });
  b.add(loft(st), { to: 'glass', color: g.glassColor ?? C.glass });
  // Roof panel: overhangs the top of the glass a little all round, so the windows read as set in.
  const rw = gwt((g.roofF + g.roofR) / 2) + 0.03;
  const roofSt = [
    { z: g.roofF + 0.05, pts: [[-rw + 0.02, g.roofY - 0.05], [-rw + 0.1, g.roofY + 0.035], [rw - 0.1, g.roofY + 0.035], [rw - 0.02, g.roofY - 0.05]] },
    { z: g.roofR - 0.04, pts: [[-rw + 0.02, g.roofY - 0.05], [-rw + 0.1, g.roofY + 0.035], [rw - 0.1, g.roofY + 0.035], [rw - 0.02, g.roofY - 0.05]] },
  ];
  b.add(loft(roofSt), { color: g.roofColor ?? pal[0], paint: g.roofPaint ?? 1 });
  const pc = g.pillarColor ?? pal[0], pp = g.pillarColor ? 0 : 1;
  for (const s of [-1, 1]) {
    // A pillar along each windscreen edge, B pillars upright, C pillar down the rear glass edge.
    b.add(strut(V(s * (gw(g.front) - 0.02), base(g.front).yt, g.front), V(s * gwt(g.roofF), g.roofY, g.roofF), 0.09, 0.06), { color: pc, paint: pp });
    for (const z of g.bPillars ?? []) b.add(strut(V(s * gw(z), base(z).yt - 0.02, z), V(s * gwt(z), g.roofY, z), 0.08, 0.09), { color: pc, paint: pp });
    const rz = Math.max(g.rear, g.roofR - 0.6);
    b.add(strut(V(s * gwt(g.roofR), g.roofY, g.roofR), V(s * (gw(rz) - 0.03), base(rz).yt - 0.02 + (g.rearH ?? 0) * 0.5, rz), g.cWidth ?? 0.16, 0.08), { color: pc, paint: pp });
  }
  return { rw, roofY: g.roofY + 0.035 };
}

// Seats, headrests and a steering wheel inside the greenhouse: a dark silhouette so the windows
// are never empty. rows: z of each seat row; hw: cabin half width; floor/seatY heights.
export function cabin(b, { rows, hw, seatY, belt, wheelZ = null, driverX = 0.38 }) {
  for (const z of rows) {
    b.add(boxAt(hw * 2 - 0.2, 0.18, 0.55, 0, seatY, z), { color: C.seat, ink: false });
    for (const s of [-1, 1]) {
      b.add(boxAt(hw * 0.78, 0.62, 0.12, s * hw * 0.48, seatY + 0.38, z - 0.25), { color: C.seat, ink: false });
      b.add(boxAt(0.22, 0.17, 0.12, s * hw * 0.48, belt + 0.34, z - 0.27), { color: C.interior, ink: false });
    }
  }
  if (wheelZ != null) {
    const w = new THREE.TorusGeometry(0.17, 0.025, 4, 10).rotateX(-0.35).translate(driverX, belt + 0.1, wheelZ);
    b.add(w, { color: C.interior, ink: false });
    b.add(boxAt(hw * 2 - 0.15, 0.12, 0.3, 0, belt - 0.02, wheelZ + 0.18), { color: C.interior, ink: false }); // dash
  }
}

// Four (or more) wheels, each on a pivot bone (steer) with a spin bone child. Returns the wheel
// handles in the shape vehicles.js already drives: { pivot, spin, front }.
export function addWheels(b, positions, r, w, { frontCount = 2, hubColor = C.hub, capColor = C.chrome, seg = 12, dish } = {}) {
  const wheels = [];
  positions.forEach(([x, z], i) => {
    const front = i < frontCount;
    const pn = `wheel${i}`, sn = `spin${i}`;
    b.bone(pn, 'root', V(x, r, z));
    b.bone(sn, pn, V(x, r, z));
    for (const [g, color] of wheelParts(r, w, { hub: hubColor, cap: capColor, seg, dish })) {
      b.add(g.translate(x, r, z), { color, bone: sn, smooth: true });
    }
    wheels.push({ pivotName: pn, spinName: sn, front, x, z });
  });
  return wheels;
}

// Head, tail/brake, indicators and reverse at the given anchor points. `face`: lamps face +z
// (front) or -z (rear). Each lamp is a short box proud of the body surface. Returns anchors.
export function addLamps(b, spec) {
  const anchors = { head: [], tail: [] };
  const lamp = (geo, group, on, off) => b.add(geo, { to: 'lamps', lamp: group, on, off });
  for (const s of [-1, 1]) {
    const h = spec.head;
    if (h.round) lamp(cylZ(h.r, 0.06, s * h.x, h.y, h.z, 12), 'head', C.head, C.headOff);
    else lamp(boxAt(h.w, h.h, 0.05, s * h.x, h.y, h.z), 'head', C.head, C.headOff);
    anchors.head.push(V(s * h.x, h.y, h.z + 0.05));
    const t = spec.tail;
    lamp(boxAt(t.w, t.h * 0.5, 0.05, s * t.x, t.y + t.h * 0.25, t.z), 'brake', C.brake, C.tailOff);
    lamp(boxAt(t.w, t.h * 0.5, 0.05, s * t.x, t.y - t.h * 0.25, t.z), 'tail', C.tail, C.tailOff);
    anchors.tail.push(V(s * t.x, t.y, t.z - 0.05));
    const side = s > 0 ? 'left' : 'right'; // +x is the car's left (it faces +z)
    if (spec.ind !== false) {
      lamp(boxAt(0.12, 0.06, 0.04, s * (h.x + (h.round ? h.r : h.w / 2) + 0.06), h.y - 0.1, h.z - 0.01), side, C.amber, C.amberOff);
      lamp(boxAt(0.1, 0.06, 0.04, s * (t.x - t.w / 2 - 0.06), t.y - 0.02, t.z), side, C.amber, C.amberOff);
    }
    if (spec.reverse !== false) lamp(boxAt(0.1, 0.06, 0.04, s * (t.x - t.w / 2 - 0.18), t.y - 0.02, t.z), 'reverse', C.reverse, C.reverseOff);
  }
  return anchors;
}

// A police/ambulance light bar across the roof: chrome base, red half, blue half (or both red).
export function lightBar(b, y, z, w = 1.2, colors = [C.red, C.blue]) {
  b.add(boxAt(w, 0.07, 0.26, 0, y + 0.035, z), { color: C.trim });
  for (let i = 0; i < 4; i++) {
    const x = -w / 2 + w * (i + 0.5) / 4;
    const grp = i < 2 ? 'beaconA' : 'beaconB';
    const col = i < 2 ? colors[0] : colors[1];
    b.add(boxAt(w / 4 - 0.03, 0.11, 0.22, x, y + 0.125, z), { to: 'lamps', lamp: grp, on: col, off: dim(col) });
  }
}

export function dim(hex, k = 0.32) { return new THREE.Color(hex).multiplyScalar(k).getHex(); }

// Bumper bar (front or rear), grille block, licence plates, door mirrors, door seams.
export function bumper(b, z, hw, y, { color = C.chrome, depth = 0.16, h = 0.16, wrap = 0.12 } = {}) {
  b.add(boxAt(hw * 2 + 0.04, h, depth, 0, y, z), { color });
  for (const s of [-1, 1]) b.add(boxAt(0.08, h, wrap + 0.1, s * (hw + 0.0), y, z - Math.sign(z) * (wrap / 2 + 0.03)), { color });
}

export function plate(b, z, y) { b.add(boxAt(0.42, 0.12, 0.02, 0, y, z), { color: 0xd9d2b8, ink: false }); }

export function mirrors(b, z, x, y) {
  for (const s of [-1, 1]) {
    b.add(boxAt(0.05, 0.04, 0.06, s * (x + 0.04), y, z), { color: C.trim, ink: false });
    b.add(boxAt(0.06, 0.1, 0.14, s * (x + 0.1), y + 0.02, z), { color: C.trim });
  }
}

// Door seams and handles drawn on the flank: thin dark lines (vertical at each z in `cuts`,
// from y0 to y1) and small chrome handles. Comic panel lines, not modelled gaps.
export function doorLines(b, keys, cuts, y0, y1, handles = true) {
  for (const z of cuts) {
    const hw = sampleKeys(keys, z).hw;
    for (const s of [-1, 1]) {
      b.add(flankDecal([[z - 0.012, y0], [z + 0.012, y0], [z + 0.012, y1], [z - 0.012, y1]], s * hw, s, 0.004), { color: C.ink, ink: false });
      if (handles) b.add(boxAt(0.03, 0.035, 0.14, s * (hw + 0.012), y1 - 0.1, z - 0.2), { color: C.chrome, ink: false });
    }
  }
}

// A horizontal stripe along both flanks between z0..z1 at y0..y1 (liveries, checker bands). Cut
// into short segments that follow the hull's plan taper, and dropped wherever the flank is lower
// than the stripe (over the hood or the tail), so a band never floats off the body.
export function stripe(b, keys, z0, z1, y0, y1, color, { checker = 0, alt = 0xf0ece0, lift = 0.006 } = {}) {
  const seg = checker || 0.45;
  const n = Math.max(1, Math.round(Math.abs(z0 - z1) / seg));
  for (let i = 0; i < n; i++) {
    const za = lerp(z0, z1, i / n), zb = lerp(z0, z1, (i + 1) / n);
    const zm = (za + zb) / 2;
    const s0 = sampleKeys(keys, zm);
    if (y1 > s0.ym + 0.01 || y0 < s0.y0 + 0.1) continue;
    if ((keys.arches ?? []).some((a) => Math.abs(zm - a.z) < a.r + seg / 2 && y0 < a.cy + a.r + 0.02)) continue;
    const rows = checker ? 2 : 1;
    for (let r = 0; r < rows; r++) {
      const ya = lerp(y0, y1, r / rows), yb = lerp(y0, y1, (r + 1) / rows);
      const col = checker ? ((i + r) % 2 ? alt : color) : color;
      for (const s of [-1, 1]) b.add(flankDecal([[za, ya], [zb, ya], [zb, yb], [za, yb]], s * s0.hw, s, lift), { color: col, ink: false });
    }
  }
}
