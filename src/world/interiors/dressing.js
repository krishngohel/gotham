// [polish] Set dressing for the lazily built interiors: the pieces that make a room read as lived
// in (drapes, raised panelling, lamps, rugs with borders, grand chandeliers, place settings,
// flowers, candelabras). Everything is merged into the pocket's buckets (vertex-coloured, one draw
// per material per pocket), lit by emissive glow, additive soft cards and the city's halo sprites:
// no new lights, no per-frame work. LOCAL coordinates, like the rest of ./pocketKit.js.
import * as THREE from 'three';
import { box, cylinder } from '../buckets.js';
import { add, addBox, BRASS, WOOD_DARK, WOOD_LIGHT, CREAM, WARM } from './pocketKit.js';

const rotAt = (yaw, x, y, z) => (g) => g.rotateY(yaw).translate(x, y, z);
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };

// A seeded random (pieces vary but every build is the same).
export function seeded(seed) { let s = seed % 2147483647 || 1; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// Segments of [s0, s1] outside the gaps ({ at, w }).
export function spans(s0, s1, gaps = []) {
  const out = [];
  let a = s0;
  for (const g of [...gaps].sort((p, q) => p.at - q.at)) {
    const ga = g.at - g.w / 2, gb = g.at + g.w / 2;
    if (gb <= a || ga >= s1) continue;
    if (ga > a) out.push([a, ga]);
    a = Math.max(a, gb);
  }
  if (a < s1) out.push([a, s1]);
  return out;
}

// A soft additive glow card (crossed quads when `cross`), centred at (x, y, z), radius r.
export function softGlow(ctx, x, y, z, r, color, { cross = true, flat = false } = {}) {
  if (flat) { add(ctx, 'soft', new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2).translate(x, y, z), color); return; }
  const n = cross ? 3 : 1;
  for (let i = 0; i < n; i++) add(ctx, 'soft', new THREE.PlaneGeometry(r * 2, r * 2).rotateY((i / n) * Math.PI).translate(x, y, z), color);
}
// A pool of light on the floor (soft, flat): under lamps, before fires and windows.
export function lightPool(ctx, x, y, z, w, d, color) {
  add(ctx, 'soft', new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, y + 0.06, z), color);
}

// Raised wood panelling: the dado with stiles, a chair rail, a skirting, a picture rail and a
// two-step cornice, broken at the doors. doors: [{ side, at, w, h }] as shell().
export function panelling(ctx, r, { dado = 1.2, color = WOOD_DARK, cornice = CREAM, skip = [], doors = [], pilasters = 0, rail = WOOD_LIGHT } = {}) {
  const { x0, x1, z0, z1, y = 0, h } = r;
  const i = 0.22;
  const sides = { n: ['x', z0 + i, x0, x1, 1], s: ['x', z1 - i, x0, x1, -1], w: ['z', x0 + i, z0, z1, 1], e: ['z', x1 - i, z0, z1, -1] };
  const stileC = shade(color, 1.35), fieldC = shade(color, 0.85);
  for (const [side, [axis, at, s0, s1, f]] of Object.entries(sides)) {
    if (skip.includes(side)) continue;
    const gaps = doors.filter((d) => d.side === side).map((d) => ({ at: d.at, w: (d.w ?? 2.2) + 0.1, top: y + (d.h ?? 2.9), y0: y + (d.y0 ?? 0) }));
    const low = gaps.filter((g) => g.y0 < y + dado + 0.2);
    const put = (a, b, yc, hh, depth, c, off = 0) => {
      const L = b - a, m = (a + b) / 2;
      if (L < 0.05) return;
      if (axis === 'x') add(ctx, 'painted', box(L, hh, depth, m, yc, at + f * off), c);
      else add(ctx, 'painted', box(depth, hh, L, at + f * off, yc, m), c);
    };
    for (const [a, b] of spans(s0 + 0.05, s1 - 0.05, low)) {
      put(a, b, y + dado / 2, dado, 0.06, fieldC);
      put(a, b, y + 0.1, 0.2, 0.1, shade(color, 0.6), 0.02);               // skirting
      put(a, b, y + dado, 0.09, 0.12, rail, 0.03);                         // chair rail
      put(a, b, y + dado - 0.1, 0.04, 0.08, stileC, 0.01);                 // the panels' top rail
      put(a, b, y + 0.26, 0.04, 0.08, stileC, 0.01);                       // and bottom rail
      const n = Math.max(1, Math.round((b - a) / 1.3));
      for (let k = 0; k <= n; k++) {
        const u = a + ((b - a) * k) / n;
        put(u - 0.05, u + 0.05, y + dado / 2 + 0.07, dado - 0.3, 0.08, stileC, 0.01);
      }
    }
    // Picture rail and cornice run the whole wall above the doors' tops.
    const high = gaps.filter((g) => g.top > y + h - 1.2);
    for (const [a, b] of spans(s0 + 0.05, s1 - 0.05, high)) {
      put(a, b, y + h - 1.05, 0.06, 0.08, rail, 0.02);
      put(a, b, y + h - 0.15, 0.3, 0.1, cornice);
      put(a, b, y + h - 0.36, 0.1, 0.2, cornice, 0.05);
      put(a, b, y + h - 0.05, 0.1, 0.26, shade(cornice, 0.9), 0.08);
    }
    // Pilasters up the wall between the panels (grand rooms).
    if (pilasters) {
      for (let u = s0 + pilasters; u < s1 - pilasters * 0.5; u += pilasters) {
        if (gaps.some((g) => Math.abs(g.at - u) < g.w / 2 + 0.6)) continue;
        put(u - 0.22, u + 0.22, y + dado + (h - dado - 0.4) / 2, h - dado - 0.4, 0.14, shade(cornice, 0.92), 0.04);
        put(u - 0.3, u + 0.3, y + h - 0.55, 0.22, 0.2, BRASS, 0.06);
      }
    }
  }
}

// Pleated drapes either side of a window, a pelmet and a rod. Arguments as windowPane():
// axis 'x' (wall along x at z = at) or 'z'; s: the window's centre along the wall; face: the side
// the room is on. Tied back at two thirds of the way down.
export function drapes(ctx, axis, at, s, y, w, h, face = 1, color = 0x6a1a22, { dw = 1.1, gold = BRASS } = {}) {
  const yaw = axis === 'x' ? (face > 0 ? 0 : Math.PI) : (face > 0 ? Math.PI / 2 : -Math.PI / 2);
  const top = y + h + 0.4, H = top - Math.max(0.02, y - 1.4 > 0 ? y - 1.4 : 0.02);
  const inset = 0.34;
  const place = (u, off) => (axis === 'x' ? [u, at + face * off] : [at + face * off, u]);
  const dark = shade(color, 0.62), light = shade(color, 1.12);
  for (const side of [-1, 1]) {
    const cu = s + side * (w / 2 + dw / 2 - 0.15);
    const n = 6;
    for (let k = 0; k < n; k++) {
      const u = cu + (k / (n - 1) - 0.5) * (dw - dw / n);
      const [px, pz] = place(u, inset + (k % 2 ? 0.05 : 0));
      const pleat = new THREE.CylinderGeometry(dw / n * 0.62, dw / n * 0.74, H, 6, 1, true);
      add(ctx, 'painted', rotAt(yaw, px, top - H / 2, pz)(pleat), k % 2 ? dark : light);
    }
    // The tie-back: a brass band round the gathered drape.
    const [tx, tz] = place(cu, inset + 0.02);
    add(ctx, 'painted', rotAt(yaw, tx, top - H * 0.62, tz)(box(dw * 0.9, 0.08, 0.2, 0, 0, 0)), gold);
  }
  // Pelmet with a brass fringe, and the rod.
  const [mx, mz] = place(s, inset + 0.06);
  add(ctx, 'painted', rotAt(yaw, mx, top + 0.15, mz)(box(w + dw * 2 + 0.2, 0.5, 0.16, 0, 0, 0)), color);
  add(ctx, 'painted', rotAt(yaw, mx, top - 0.12, mz)(box(w + dw * 2 + 0.2, 0.06, 0.18, 0, 0, 0)), gold);
}

// A table lamp: a turned base, a glowing shade, a halo and a warm pool (table top at y).
export function tableLamp(ctx, x, y, z, { shadeC = 0xf0d8a0, base = BRASS, glow = true, h = 0.55 } = {}) {
  add(ctx, 'painted', cylinder(0.09, 0.13, 0.05, x, y + 0.025, z, 10), base);
  add(ctx, 'painted', new THREE.SphereGeometry(0.1, 8, 6).scale(1, 1.3, 1).translate(x, y + 0.16, z), base);
  add(ctx, 'painted', cylinder(0.02, 0.02, h * 0.45, x, y + 0.25 + h * 0.2, z, 6), base);
  add(ctx, 'glow', cylinder(0.11, 0.2, h * 0.42, x, y + h * 0.78, z, 12, true), shadeC);
  if (glow) {
    softGlow(ctx, x, y + h * 0.75, z, 0.55, 0x5a3c18, { cross: true });
    ctx.halo(x, y + h * 0.78, z, 0xffd890, 0.5);
  }
}
// A floor lamp (standard lamp) with its shade at ~1.6 m.
export function floorLamp(ctx, x, z, { y = 0, shadeC = 0xf0d8a0 } = {}) {
  add(ctx, 'painted', cylinder(0.18, 0.22, 0.05, x, y + 0.03, z, 10), BRASS);
  add(ctx, 'painted', cylinder(0.025, 0.025, 1.45, x, y + 0.75, z, 6), BRASS);
  add(ctx, 'glow', cylinder(0.16, 0.26, 0.34, x, y + 1.55, z, 12, true), shadeC);
  softGlow(ctx, x, y + 1.5, z, 0.8, 0x5a3c18);
  lightPool(ctx, x, y, z, 2.2, 2.2, 0x2a1a08);
  ctx.halo(x, y + 1.52, z, 0xffd890, 0.6);
}
// A side table (round, on a pedestal), optionally with a lamp.
export function sideTable(ctx, x, z, { y = 0, lamp = true, r = 0.32, h = 0.62, color = WOOD_DARK, collide = true } = {}) {
  add(ctx, 'painted', cylinder(r, r, 0.04, x, y + h, z, 14), color);
  add(ctx, 'painted', cylinder(0.04, 0.06, h - 0.05, x, y + h / 2, z, 8), color);
  add(ctx, 'painted', cylinder(0.18, 0.2, 0.04, x, y + 0.02, z, 10), color);
  if (lamp) tableLamp(ctx, x, y + h + 0.02, z);
  if (collide) addBox(ctx, x - r, y, z - r, x + r, y + h, z + r, 'furniture');
}

// A rug with a border, an inner line, a medallion and fringes (lies flat on the floor at y).
export function rug(ctx, x, z, w, d, field, { border = BRASS, y = 0, medallion = null, yaw = 0 } = {}) {
  const R = rotAt(yaw, x, y, z);
  add(ctx, 'painted', R(box(w, 0.025, d, 0, 0.03, 0)), border);
  add(ctx, 'painted', R(box(w - 0.5, 0.03, d - 0.5, 0, 0.034, 0)), field);
  add(ctx, 'painted', R(box(w - 0.8, 0.032, d - 0.8, 0, 0.037, 0)), shade(border, 0.8));
  add(ctx, 'painted', R(box(w - 0.9, 0.034, d - 0.9, 0, 0.04, 0)), field);
  const m = medallion ?? shade(field, 1.5);
  const rr = Math.min(w, d) * 0.22;
  add(ctx, 'painted', R(new THREE.CircleGeometry(rr, 16).rotateX(-Math.PI / 2).translate(0, 0.043, 0)), border);
  add(ctx, 'painted', R(new THREE.CircleGeometry(rr * 0.78, 16).rotateX(-Math.PI / 2).translate(0, 0.046, 0)), m);
  add(ctx, 'painted', R(new THREE.CircleGeometry(rr * 0.3, 4).rotateX(-Math.PI / 2).translate(0, 0.049, 0)), border);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(ctx, 'painted', R(new THREE.CircleGeometry(0.22, 4).rotateX(-Math.PI / 2).translate(sx * (w / 2 - 0.65), 0.043, sz * (d / 2 - 0.65))), m);
  for (const s of [-1, 1]) add(ctx, 'painted', R(box(w - 0.1, 0.012, 0.12, 0, 0.026, s * (d / 2 + 0.06))), CREAM);
}

// A grand chandelier: a chain, a turned column, two tiers of arms with candles, crystal drops, a
// warm glow card and halos (no light of its own unless `spot`).
export function chandelier(ctx, x, y, z, { r = 1.4, spot = true, drop = 1.4, tiers = 2 } = {}) {
  add(ctx, 'painted', cylinder(0.025, 0.025, drop, x, y + 0.6 + drop / 2, z, 5), BRASS);
  add(ctx, 'painted', new THREE.SphereGeometry(0.18, 8, 6).scale(1, 1.6, 1).translate(x, y + 0.35, z), BRASS);
  add(ctx, 'painted', cylinder(0.06, 0.12, 0.8, x, y - 0.05, z, 8), BRASS);
  add(ctx, 'glow', new THREE.OctahedronGeometry(0.16, 0).scale(1, 2, 1).translate(x, y - 0.65, z), 0xfff4d8);
  for (let t = 0; t < tiers; t++) {
    const rr = r * (t ? 0.6 : 1), yy = y + (t ? 0.45 : 0), n = t ? 6 : 10;
    add(ctx, 'painted', new THREE.TorusGeometry(rr, 0.04, 5, 20).rotateX(Math.PI / 2).translate(x, yy, z), BRASS);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + t * 0.3, cx = x + Math.cos(a) * rr, cz = z + Math.sin(a) * rr;
      add(ctx, 'painted', cylinder(0.05, 0.03, 0.06, cx, yy + 0.05, cz, 6), BRASS);
      add(ctx, 'painted', cylinder(0.025, 0.025, 0.18, cx, yy + 0.17, cz, 5), CREAM);
      add(ctx, 'glow', new THREE.ConeGeometry(0.035, 0.1, 5).translate(cx, yy + 0.31, cz), 0xffe2a0);
      // Crystal drops between the candles.
      const b = a + Math.PI / n;
      add(ctx, 'glow', new THREE.OctahedronGeometry(0.05, 0).scale(1, 2.2, 1).translate(x + Math.cos(b) * rr, yy - 0.16, z + Math.sin(b) * rr), 0xe8f0ff);
    }
    ctx.halo(x, yy + 0.3, z, 0xffe0a0, rr * 1.6);
  }
  softGlow(ctx, x, y + 0.2, z, r * 1.9, 0x4a3418);
  if (spot) ctx.spot(x, y - 0.6, z, WARM, 18, 20);
}

// Wall sconce: a brass backplate, two candle bulbs, a glow card and a halo; yaw faces the room.
export function sconce(ctx, x, y, z, yaw) {
  const R = rotAt(yaw, x, y, z);
  add(ctx, 'painted', R(box(0.16, 0.36, 0.04, 0, 0, 0.02)), BRASS);
  for (const s of [-1, 1]) {
    add(ctx, 'painted', R(box(0.22, 0.03, 0.03, s * 0.1, -0.05, 0.12)), BRASS);
    add(ctx, 'painted', R(cylinder(0.025, 0.025, 0.14, s * 0.18, 0.04, 0.2, 5)), CREAM);
    add(ctx, 'glow', R(new THREE.ConeGeometry(0.03, 0.08, 5).translate(s * 0.18, 0.15, 0.2)), 0xffe2a0);
  }
  add(ctx, 'soft', R(new THREE.PlaneGeometry(1.6, 1.6).translate(0, 0.1, 0.06)), 0x3a2a12);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  ctx.halo(x + s * 0.2, y + 0.12, z + c * 0.2, 0xffd890, 0.45);
}

// Flowers in an urn (a floral piece): an urn, a mound of blooms and leaves. y: what it stands on.
export function flowers(ctx, x, y, z, { s = 1, colors = [0xe8e0d0, 0xc83a4a, 0xf0c0c8, 0xe8c84a], urn = BRASS, seed = 7 } = {}) {
  const r = seeded(seed * 131 + 17);
  add(ctx, 'painted', cylinder(0.16 * s, 0.1 * s, 0.32 * s, x, y + 0.16 * s, z, 10), urn);
  add(ctx, 'painted', cylinder(0.2 * s, 0.17 * s, 0.05 * s, x, y + 0.32 * s, z, 10), urn);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = r() * 0.25 * s;
    add(ctx, 'painted', new THREE.ConeGeometry(0.09 * s, 0.4 * s, 4).rotateZ((r() - 0.5) * 1.4).translate(x + Math.cos(a) * d, y + 0.45 * s, z + Math.sin(a) * d), 0x2f5a2a);
  }
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.3 * s;
    add(ctx, 'painted', new THREE.IcosahedronGeometry((0.06 + r() * 0.05) * s, 0).translate(x + Math.cos(a) * d, y + (0.5 + r() * 0.28 - d * 0.6) * s, z + Math.sin(a) * d), colors[Math.floor(r() * colors.length)]);
  }
}

// A silver candelabra with three lit candles (y: the table top).
export function candelabra(ctx, x, y, z, { yaw = 0, halo = true } = {}) {
  const R = rotAt(yaw, x, y, z);
  add(ctx, 'painted', R(cylinder(0.08, 0.1, 0.03, 0, 0.015, 0, 8)), 0xc8ccd4);
  add(ctx, 'painted', R(cylinder(0.018, 0.025, 0.32, 0, 0.18, 0, 6)), 0xc8ccd4);
  add(ctx, 'painted', R(box(0.36, 0.025, 0.025, 0, 0.3, 0)), 0xc8ccd4);
  for (const u of [-0.17, 0, 0.17]) {
    add(ctx, 'painted', R(cylinder(0.016, 0.016, 0.16, u, 0.4 + (u ? 0 : 0.06), 0, 5)), CREAM);
    add(ctx, 'glow', R(new THREE.ConeGeometry(0.022, 0.06, 5).translate(u, 0.51 + (u ? 0 : 0.06), 0)), 0xffd890);
  }
  if (halo) ctx.halo(x, y + 0.5, z, 0xffd890, 0.35);
}

// A place setting at a table edge: a charger and plate, cutlery, a wine glass (y: table top;
// yaw: towards the diner).
export function placeSetting(ctx, x, y, z, yaw) {
  const R = rotAt(yaw, x, y, z);
  add(ctx, 'painted', R(cylinder(0.15, 0.15, 0.01, 0, 0.006, 0, 12)), BRASS);
  add(ctx, 'painted', R(cylinder(0.12, 0.11, 0.015, 0, 0.014, 0, 12)), 0xf4f2ec);
  for (const u of [-0.19, -0.22, 0.19, 0.22]) add(ctx, 'painted', R(box(0.015, 0.008, 0.2, u, 0.008, 0)), 0xc8ccd4);
  add(ctx, 'painted', R(cylinder(0.035, 0.002, 0.08, 0.2, 0.13, -0.15, 6)), 0xd8e4ec);
  add(ctx, 'painted', R(cylinder(0.004, 0.004, 0.08, 0.2, 0.05, -0.15, 4)), 0xd8e4ec);
  add(ctx, 'painted', R(cylinder(0.03, 0.03, 0.005, 0.2, 0.005, -0.15, 6)), 0xd8e4ec);
}

// A gilt ballroom chair (chiavari), yaw: the way it faces.
export function giltChair(ctx, x, z, yaw, { y = 0, seat = 0x8a2230, gilt = 0xc8a050 } = {}) {
  const R = rotAt(yaw, x, y, z);
  add(ctx, 'painted', R(box(0.42, 0.06, 0.42, 0, 0.46, 0)), seat);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(ctx, 'painted', R(box(0.035, sz < 0 ? 0.98 : 0.46, 0.035, sx * 0.18, sz < 0 ? 0.49 : 0.23, sz * 0.18)), gilt);
  for (const yy of [0.66, 0.8, 0.94]) add(ctx, 'painted', R(box(0.36, 0.025, 0.025, 0, yy, -0.18)), gilt);
}

// A round banquet table: a floor-length cloth, settings, a centrepiece and gilt chairs.
export function roundTable(ctx, x, z, { r = 0.85, y = 0, cloth = 0xf2ece0, seats = 6, seed = 1, centre = 'flowers', skipSeats = [] } = {}) {
  const h = 0.76;
  add(ctx, 'painted', cylinder(r + 0.02, r + 0.12, h - 0.02, x, y + (h - 0.02) / 2, z, 18), shade(cloth, 0.92));
  add(ctx, 'painted', cylinder(r + 0.05, r + 0.05, 0.04, x, y + h, z, 18), cloth);
  for (let k = 0; k < seats; k++) {
    if (skipSeats.includes(k)) continue;
    const a = (k / seats) * Math.PI * 2 + 0.3;
    const c = Math.cos(a), s = Math.sin(a);
    placeSetting(ctx, x + c * (r - 0.22), y + h + 0.02, z + s * (r - 0.22), Math.atan2(c, s));
    giltChair(ctx, x + c * (r + 0.42), z + s * (r + 0.42), Math.atan2(-c, -s), { y });
  }
  if (centre === 'flowers') flowers(ctx, x, y + h + 0.02, z, { s: 0.8, seed });
  else candelabra(ctx, x, y + h + 0.02, z);
  for (const a of [0.8, 3.9]) add(ctx, 'glow', cylinder(0.03, 0.03, 0.06, x + Math.cos(a) * 0.35, y + h + 0.06, z + Math.sin(a) * 0.35, 6), 0xffd890);
  ctx.halo(x, y + h + 0.3, z, 0xffcf80, 0.6);
  lightPool(ctx, x, y, z, r * 3.2, r * 3.2, 0x1e1408);
  addBox(ctx, x - r - 0.15, y, z - r - 0.15, x + r + 0.15, y + h + 0.05, z + r + 0.15, 'furniture');
}

// A long banquet table: cloth to the floor, silver domes, candelabras, flowers, place settings on
// one side (a buffet) or both. Runs along `axis` ('x' or 'z') centred at (x, z).
export function banquetTable(ctx, x, z, len, { axis = 'z', w = 1.2, y = 0, cloth = 0xf2ece0, settings = 'buffet', seed = 3 } = {}) {
  const h = 0.78, along = (u, v) => (axis === 'z' ? [x + v, z + u] : [x + u, z + v]);
  const [bw, bd] = axis === 'z' ? [w, len] : [len, w];
  add(ctx, 'painted', box(bw + 0.06, h - 0.02, bd + 0.06, x, y + (h - 0.02) / 2, z), shade(cloth, 0.9));
  add(ctx, 'painted', box(bw + 0.1, 0.04, bd + 0.1, x, y + h, z), cloth);
  // A swag of cloth along the front edge in a deeper colour.
  add(ctx, 'painted', box(axis === 'z' ? 0.04 : len + 0.1, 0.16, axis === 'z' ? len + 0.1 : 0.04, ...(axis === 'z' ? [x + w / 2 + 0.07, y + h - 0.12, z] : [x, y + h - 0.12, z + w / 2 + 0.07])), 0x7a1e2a);
  const n = Math.floor(len / 1.4);
  for (let k = 0; k < n; k++) {
    const u = -len / 2 + 0.7 + k * (len - 1.4) / Math.max(1, n - 1);
    const kind = k % 3;
    const [px, pz] = along(u, 0);
    if (kind === 0) candelabra(ctx, px, y + h + 0.02, pz, { yaw: axis === 'z' ? Math.PI / 2 : 0 });
    else if (kind === 1) { add(ctx, 'painted', new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(px, y + h + 0.03, pz), 0xc8ccd4); add(ctx, 'painted', cylinder(0.03, 0.03, 0.05, px, y + h + 0.26, pz, 6), 0xc8ccd4); }
    else flowers(ctx, px, y + h + 0.02, pz, { s: 0.7, seed: seed + k });
    if (settings === 'both') for (const v of [-1, 1]) { const [qx, qz] = along(u + 0.35, v * (w / 2 - 0.2)); placeSetting(ctx, qx, y + h + 0.02, qz, axis === 'z' ? (v > 0 ? -Math.PI / 2 : Math.PI / 2) : (v > 0 ? Math.PI : 0)); }
    else { const [qx, qz] = along(u + 0.6, 0.25); add(ctx, 'painted', cylinder(0.16, 0.12, 0.05, qx, y + h + 0.045, qz, 10), 0xf4f2ec); }
  }
  ctx.halo(x, y + h + 0.5, z, 0xffcf80, 0.9);
  lightPool(ctx, x, y, z, bw + 1.6, bd + 1.6, 0x1a1208);
  addBox(ctx, x - bw / 2 - 0.05, y, z - bd / 2 - 0.05, x + bw / 2 + 0.05, y + h + 0.05, z + bd / 2 + 0.05, 'furniture');
}

// Coffered ceiling: a grid of beams under the ceiling of a room.
export function coffers(ctx, r, { step = 3, color = CREAM, depth = 0.35, inset = 0.25 } = {}) {
  const { x0, x1, z0, z1, y = 0, h } = r;
  const yc = y + h - depth / 2;
  for (let x = x0 + step; x < x1 - 0.5; x += step) add(ctx, 'painted', box(0.3, depth, z1 - z0 - inset * 2, x, yc, (z0 + z1) / 2), color);
  for (let z = z0 + step; z < z1 - 0.5; z += step) add(ctx, 'painted', box(x1 - x0 - inset * 2, depth, 0.3, (x0 + x1) / 2, yc, z), color);
  for (let x = x0 + step; x < x1 - 0.5; x += step) for (let z = z0 + step; z < z1 - 0.5; z += step) add(ctx, 'painted', box(0.42, depth + 0.06, 0.42, x, yc - 0.03, z), BRASS);
}

// A moonlit window's light on the floor (pale, soft), cast into the room from a window.
export function moonlight(ctx, axis, at, s, w, face = 1, { len = 3.2, y = 0, color = 0x1a2434 } = {}) {
  if (axis === 'z') lightPool(ctx, at + face * (len / 2 + 0.3), y, s, len, w * 1.1, color);
  else lightPool(ctx, s, y, at + face * (len / 2 + 0.3), w * 1.1, len, color);
}

// A bust on a pedestal (gallery, hall).
export function bust(ctx, x, z, { y = 0, stone = 0xd8d4c8, yaw = 0 } = {}) {
  const R = rotAt(yaw, x, y, z);
  add(ctx, 'painted', R(box(0.5, 1.1, 0.5, 0, 0.55, 0)), 0x3a3434);
  add(ctx, 'painted', R(box(0.6, 0.08, 0.6, 0, 1.12, 0)), 0x2a2424);
  add(ctx, 'painted', R(box(0.42, 0.25, 0.24, 0, 1.3, 0)), stone);
  add(ctx, 'painted', R(cylinder(0.07, 0.08, 0.14, 0, 1.47, 0, 6)), stone);
  add(ctx, 'painted', R(new THREE.SphereGeometry(0.13, 8, 6).scale(0.9, 1.15, 1).translate(0, 1.66, 0.01)), stone);
  addBox(ctx, x - 0.3, y, z - 0.3, x + 0.3, y + 1.8, z + 0.3, 'furniture');
}

// A globe on a stand (study, library).
export function globe(ctx, x, z, { y = 0 } = {}) {
  for (const a of [0, 2.1, 4.2]) add(ctx, 'painted', box(0.04, 0.7, 0.04, x + Math.cos(a) * 0.18, y + 0.35, z + Math.sin(a) * 0.18), WOOD_DARK);
  add(ctx, 'painted', new THREE.TorusGeometry(0.36, 0.02, 4, 18).translate(x, y + 0.98, z), BRASS);
  add(ctx, 'painted', new THREE.SphereGeometry(0.32, 12, 8).translate(x, y + 0.98, z), 0x5a7a8a);
  for (const [a, b, s] of [[0.4, 0.2, 0.14], [2.3, -0.1, 0.17], [4.2, 0.4, 0.12]]) add(ctx, 'painted', new THREE.SphereGeometry(s, 6, 4).scale(1, 0.8, 0.5).translate(x + Math.cos(a) * 0.24, y + 0.98 + b * 0.5, z + Math.sin(a) * 0.24), 0xb8a870);
  addBox(ctx, x - 0.35, y, z - 0.35, x + 0.35, y + 1.3, z + 0.35, 'furniture');
}

// A grandfather-style tall clock or a cabinet against a wall is the caller's; this is a potted palm.
export function palm(ctx, x, z, { y = 0, s = 1 } = {}) {
  add(ctx, 'painted', cylinder(0.32 * s, 0.24 * s, 0.55 * s, x, y + 0.27 * s, z, 10), 0x2a3a4a);
  add(ctx, 'painted', cylinder(0.05, 0.07, 1.3 * s, x, y + 1.1 * s, z, 6), 0x4a3a24);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    add(ctx, 'painted', new THREE.ConeGeometry(0.16 * s, 1.1 * s, 3).rotateZ(Math.PI / 2 + 0.5).rotateY(a).translate(x + Math.cos(a) * 0.4 * s, y + 1.65 * s, z - Math.sin(a) * 0.4 * s), 0x2f5a2a);
  }
  addBox(ctx, x - 0.32 * s, y, z - 0.32 * s, x + 0.32 * s, y + 1.4 * s, z + 0.32 * s, 'furniture');
}
