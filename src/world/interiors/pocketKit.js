// Shared kit for the lazily built interiors (workstream K): Wayne Manor, the Batcave, Wayne Tower.
//
// WHY POCKETS. The Manor exterior in Bristol (regions/wayneManor.js) is solid and the city's map
// data is frozen, so these interiors are built on demand, the first time a player goes in, in their
// own "pocket" of the world far outside the playable city (x > 1800), and entered through the
// Bristol door sites by a short fade and teleport. Nothing is built at boot, so a player who never
// goes in pays nothing; the city's chunks all cull while a player is inside, so a pocket costs about
// what its own few draws cost (they run on Potato).
//
// A pocket module exports pure data (rooms, stations, entries, exits: tests read it without three.js
// work) and build(ctx) for the geometry. createPocketCtx() gives build() the same helpers the city
// builders use (buckets, solid, collision) with its own small material set; finishPocket() merges
// the buckets into one group and returns the light spots for the shared light pool (no PointLights).
// Everything here takes LOCAL coordinates (metres from the pocket's origin, floor at y 0).
import * as THREE from 'three';
import { createBuckets, box, cylinder } from '../buckets.js';
import { toonMaterial } from '../../render/toon.js';
import { LAYER_FX } from '../../render/layers.js';

export const WOOD = 0x4a2e1e, WOOD_DARK = 0x2c1a12, WOOD_LIGHT = 0x7a5232, PANEL = 0x5a3a26, PLASTER = 0x8a7a64;
export const STONE_W = 0x7a756c, STONE_D = 0x4a4640, BRASS = 0xc8a050, RED = 0x7a1e22, GREEN = 0x2a4a34, CREAM = 0xe8dcc0;
export const FIRE = 0xffa040, WARM = 0xffc070, ROCK = 0x3a3c40, ROCK_D = 0x26282c, STEEL = 0x5a6068, CYAN = 0x4fe3ff;

const DOC = typeof document !== 'undefined';

// The pocket's materials, made once per page and shared by every pocket (same shader programs as
// the city's: toonMaterial / MeshBasicMaterial, so nothing new compiles).
let MATS = null;
export function pocketMaterials() {
  if (MATS) return MATS;
  const m = {
    painted: toonMaterial({ vertexColors: true }),
    wall: toonMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glass: new THREE.MeshBasicMaterial({ color: 0x9ab8d0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    rain: new THREE.MeshBasicMaterial({ color: 0xc8d8f0, transparent: true, opacity: 0.4, depthWrite: false, map: DOC ? rainStreakTexture() : null }),
    water: new THREE.MeshBasicMaterial({ color: 0xbfe0f0, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide, map: DOC ? waterfallTexture() : null }),
    holo: new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    // [polish] Flames: their own bucket so one colour change flickers every fire in a pocket.
    fire: new THREE.MeshBasicMaterial({ vertexColors: true }),
    // [polish] Soft additive glow cards (light pools, lamp and chandelier glows, mist, window
    // shafts): a radial falloff tinted by vertex colour, colour pass only (no ink edges).
    soft: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, map: DOC ? softTexture() : null, fog: false }),
    // [polish] The painted art in its frames: every picture in a pocket is a cell of one atlas.
    art: new THREE.MeshBasicMaterial({ map: DOC ? artAtlas() : null }),
  };
  m.glow.userData.noShadow = true;
  for (const k of ['glass', 'rain', 'water', 'holo', 'fire', 'soft', 'art']) m[k].userData.noShadow = true;
  for (const k of ['soft', 'rain', 'water']) m[k].userData.layer = LAYER_FX;
  MATS = m;
  return m;
}

// ctx for a pocket build. scene: where the finished group goes; collision: the shared world
// collision (boxes added at runtime go to its per-cell lists; nothing is frozen again).
export function createPocketCtx({ collision, quality = {}, origin, materials = null }) {
  const mats = materials ?? (DOC ? pocketMaterials() : stubMaterials());
  const O = { x: origin.x, y: origin.y ?? 0, z: origin.z };
  const ctx = {
    O, quality, collision, materials: mats,
    buckets: createBuckets(mats),
    group: DOC ? new THREE.Group() : null,
    lights: [], updaters: [], extras: [], boxes: [], halos: [],
    // A light spot for the shared pool (world coordinates).
    spot(x, y, z, color, intensity = 18, distance = 16) { ctx.lights.push({ x: O.x + x, y: O.y + y, z: O.z + z, color, intensity, distance, decay: 1.6 }); },
    // [polish] A halo sprite (the city's shared halo Points: no new draw call), local coordinates.
    halo(x, y, z, color, size = 2) { ctx.halos.push([O.x + x, O.y + y, O.z + z, color, size]); },
    // Adds a mesh that is not merged (a canvas texture, a moving part).
    add(o) { if (ctx.group && o) ctx.group.add(o); return o; },
  };
  return ctx;
}

// Headless builds (unit tests): every material key exists; nothing is drawn.
function stubMaterials() {
  const base = { userData: {}, vertexColors: true, color: new THREE.Color(1, 1, 1) };
  const plain = { userData: {}, vertexColors: false, color: new THREE.Color(1, 1, 1) };
  return { painted: base, wall: base, glow: base, glass: plain, rain: plain, water: plain, holo: plain, fire: base, soft: base, art: plain };
}

export function finishPocket(ctx, name) {
  if (ctx.group) {
    const meshes = ctx.buckets.flush(ctx.group, { castShadow: false, receiveShadow: true });
    for (const m of meshes) m.userData.pocket = name;
    ctx.group.name = `pocket:${name}`;
    ctx.group.updateMatrixWorld(true);
  }
  // [polish] Every fire in the pocket flickers together (one material colour, no geometry work).
  if (ctx.group && ctx.materials.fire?.color) {
    const fc = ctx.materials.fire.color;
    ctx.updaters.push((t) => { const k = 0.82 + 0.1 * Math.sin(t * 11.3) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.04 * Math.sin(t * 5.1); fc.setRGB(k, k * 0.96, k * 0.9); });
  }
  return { group: ctx.group, lights: ctx.lights, updaters: ctx.updaters, boxes: ctx.boxes, halos: ctx.halos };
}

// ---- geometry in local coordinates ----
const tr = (ctx, g) => g.translate(ctx.O.x, ctx.O.y, ctx.O.z);
export function add(ctx, key, g, color = null) { ctx.buckets.add(key, tr(ctx, g), color); }
export function addBox(ctx, x0, y0, z0, x1, y1, z1, tag = 'building') {
  const O = ctx.O;
  ctx.boxes.push(ctx.collision.addBox(O.x + Math.min(x0, x1), O.y + Math.min(y0, y1), O.z + Math.min(z0, z1), O.x + Math.max(x0, x1), O.y + Math.max(y0, y1), O.z + Math.max(z0, z1), tag));
}
// A coloured block, optionally solid.
export function block(ctx, x0, y0, z0, x1, y1, z1, color, { key = 'painted', collide = true, tag = 'furniture' } = {}) {
  const w = Math.abs(x1 - x0), h = Math.abs(y1 - y0), d = Math.abs(z1 - z0);
  add(ctx, key, box(w, h, d, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), color);
  if (collide) addBox(ctx, x0, y0, z0, x1, y1, z1, tag);
}
export function glowBox(ctx, x0, y0, z0, x1, y1, z1, color) { block(ctx, x0, y0, z0, x1, y1, z1, color, { key: 'glow', collide: false }); }

// A wall along one axis with door gaps. axis 'x': runs along x at z = at; 'z': along z at x = at.
// gaps: [{ at (centre along the run), w, y0 = 0, y1 }]. Double-sided (seen from both rooms).
export function wall(ctx, axis, at, s0, s1, y, h, color, gaps = [], t = 0.4) {
  // Split the run at every gap edge; each piece is solid except where gaps open it (gaps may
  // overlap along the run: a ground-floor door under an upstairs one).
  const open = gaps.map((g) => ({ a: g.at - g.w / 2, b: g.at + g.w / 2, ya: y + (g.y0 ?? 0), yb: y + (g.y1 ?? Math.min(h, 3)) }));
  const cuts = [...new Set([s0, s1, ...open.flatMap((g) => [g.a, g.b])])].filter((v) => v >= s0 && v <= s1).sort((p, q) => p - q);
  const runs = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], mid = (a + b) / 2;
    const holes = open.filter((g) => g.a <= mid && g.b >= mid).map((g) => [g.ya, g.yb]).sort((p, q) => p[0] - q[0]);
    let cy = y;
    for (const [ha, hb] of holes) { if (ha > cy) runs.push([a, b, cy, ha]); cy = Math.max(cy, hb); }
    if (cy < y + h) runs.push([a, b, cy, y + h]);
  }
  for (const [a, b, ya, yb] of runs) {
    if (b - a < 0.02 || yb - ya < 0.02) continue;
    if (axis === 'x') block(ctx, a, ya, at - t / 2, b, yb, at + t / 2, color, { key: 'wall', tag: 'building' });
    else block(ctx, at - t / 2, ya, a, at + t / 2, yb, b, color, { key: 'wall', tag: 'building' });
  }
}
// A plain filler wall (no gaps) where a room's own wall was skipped as shared.
export const filler = (ctx, axis, at, s0, s1, y, h, color) => wall(ctx, axis, at, s0, s1, y, h, color);

// A room shell: floor, four walls with door gaps, ceiling. doors: [{ side: 'n'|'s'|'e'|'w', at, w, h }]
// (n = -z, s = +z, w = -x, e = +x). Floor at y; a raised floor gets its own slab collision.
export function shell(ctx, r) {
  const { x0, x1, z0, z1, y = 0, h, wall: wc = PANEL, floor = WOOD, ceil = PLASTER, doors = [], noCeil = false, skip = [] } = r;
  const gaps = (side) => doors.filter((d) => d.side === side).map((d) => ({ at: d.at, w: d.w ?? 2.2, y1: d.h ?? 2.9, y0: d.y0 ?? 0 }));
  // Floor slab: drawn just under y; solid only when raised (the world floor is y 0 out here).
  block(ctx, x0, y - 0.3, z0, x1, y + 0.02, z1, floor, { collide: y > 0.01, tag: 'floor' });
  if (!skip.includes('n')) wall(ctx, 'x', z0, x0 - 0.2, x1 + 0.2, y, h, wc, gaps('n'));
  if (!skip.includes('s')) wall(ctx, 'x', z1, x0 - 0.2, x1 + 0.2, y, h, wc, gaps('s'));
  if (!skip.includes('w')) wall(ctx, 'z', x0, z0, z1, y, h, wc, gaps('w'));
  if (!skip.includes('e')) wall(ctx, 'z', x1, z0, z1, y, h, wc, gaps('e'));
  if (!noCeil) block(ctx, x0 - 0.2, y + h, z0 - 0.2, x1 + 0.2, y + h + 0.3, z1 + 0.2, ceil, { key: 'wall', tag: 'ceiling' });
}

// Wood panelling to dado height and a cornice, inset on the room's inside faces (visual only).
export function panelling(ctx, r, { dado = 1.2, color = WOOD_DARK, cornice = CREAM, skip = [] } = {}) {
  const { x0, x1, z0, z1, y = 0, h } = r;
  const i = 0.22;
  const band = (yb, hh, c) => {
    if (!skip.includes('n')) add(ctx, 'painted', box(x1 - x0 - 0.1, hh, 0.06, (x0 + x1) / 2, yb, z0 + i), c);
    if (!skip.includes('s')) add(ctx, 'painted', box(x1 - x0 - 0.1, hh, 0.06, (x0 + x1) / 2, yb, z1 - i), c);
    if (!skip.includes('w')) add(ctx, 'painted', box(0.06, hh, z1 - z0 - 0.1, x0 + i, yb, (z0 + z1) / 2), c);
    if (!skip.includes('e')) add(ctx, 'painted', box(0.06, hh, z1 - z0 - 0.1, x1 - i, yb, (z0 + z1) / 2), c);
  };
  band(y + dado / 2, dado, color);
  band(y + dado + 0.05, 0.1, WOOD_LIGHT);
  band(y + h - 0.2, 0.3, cornice);
}

// A tall window on a wall (axis/at as wall()); face = +1 or -1 (which side is the room). The pane
// is dark night glass, with a rain streak layer just inside it that runs (shared material).
export function windowPane(ctx, axis, at, s, y, w, h, face = 1, { night = 0x1a2434, clear = false } = {}) {
  const o = 0.25 * face;
  if (axis === 'x') {
    if (clear) add(ctx, 'glass', box(w, h, 0.05, s, y + h / 2, at + o * 0.5)); else add(ctx, 'glow', box(w, h, 0.05, s, y + h / 2, at + o * 0.5), night);
    add(ctx, 'rain', new THREE.PlaneGeometry(w, h).rotateY(face > 0 ? 0 : Math.PI).translate(s, y + h / 2, at + o));
    for (const k of [-1, 0, 1]) add(ctx, 'painted', box(0.08, h, 0.1, s + k * w / 2 * (k ? 0.98 : 0), y + h / 2, at + o * 0.8), WOOD_DARK);
    add(ctx, 'painted', box(w, 0.08, 0.1, s, y + h * 0.62, at + o * 0.8), WOOD_DARK);
    add(ctx, 'painted', box(w + 0.3, 0.12, 0.3, s, y - 0.06, at + o), CREAM);
  } else {
    add(ctx, 'glow', box(0.05, h, w, at + o * 0.5, y + h / 2, s), night);
    add(ctx, 'rain', new THREE.PlaneGeometry(w, h).rotateY(face > 0 ? Math.PI / 2 : -Math.PI / 2).translate(at + o, y + h / 2, s));
    for (const k of [-1, 0, 1]) add(ctx, 'painted', box(0.1, h, 0.08, at + o * 0.8, y + h / 2, s + k * w / 2 * (k ? 0.98 : 0)), WOOD_DARK);
    add(ctx, 'painted', box(0.1, 0.08, w, at + o * 0.8, y + h * 0.62, s), WOOD_DARK);
    add(ctx, 'painted', box(0.3, 0.12, w + 0.3, at + o, y - 0.06, s), CREAM);
  }
}

// A fireplace against a wall: stone surround, an emissive fire that flickers (one shared updater
// moves its halo-free glow), a warm pool on the floor and a light spot. yaw: the way it faces.
export function fireplace(ctx, x, z, yaw, y = 0, { w = 2.4 } = {}) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const rot = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', rot(box(w + 0.8, 0.25, 0.5, 0, 1.55, 0.05)), STONE_W);
  add(ctx, 'painted', rot(box(0.35, 1.5, 0.45, -w / 2 - 0.15, 0.75, 0)), STONE_W);
  add(ctx, 'painted', rot(box(0.35, 1.5, 0.45, w / 2 + 0.15, 0.75, 0)), STONE_W);
  add(ctx, 'painted', rot(box(w, 1.3, 0.1, 0, 0.65, -0.22)), 0x140c08);
  add(ctx, 'painted', rot(box(w + 1.2, 0.08, 1.1, 0, 0.04, 0.5)), STONE_D);
  // [polish] Flames in the 'fire' bucket (every fire in the pocket flickers together), inner
  // yellow tongues, logs on a grate, embers, a mantel shelf, glow cards and a halo.
  for (const [u, r, h, col] of [[-0.45, 0.3, 0.75, 0xff7a20], [-0.1, 0.42, 1.05, 0xff9a30], [0.3, 0.36, 0.9, 0xff8424], [0.62, 0.24, 0.55, 0xff6a18]]) {
    add(ctx, 'fire', rot(new THREE.ConeGeometry(r, h, 6).translate(u, 0.22 + h / 2, -0.05)), col);
    add(ctx, 'fire', rot(new THREE.ConeGeometry(r * 0.5, h * 0.6, 5).translate(u, 0.22 + h * 0.3, 0.06)), 0xffe070);
  }
  add(ctx, 'painted', rot(box(1.6, 0.06, 0.5, 0, 0.1, -0.05)), 0x1a1a1a);
  for (const [u, a] of [[-0.25, 0.25], [0.25, -0.2]]) add(ctx, 'painted', rot(cylinder(0.09, 0.1, 1.0, 0, 0, 0, 6).rotateZ(Math.PI / 2).rotateY(a).translate(u, 0.2, -0.05)), 0x3a2414);
  add(ctx, 'glow', rot(box(1.3, 0.05, 0.4, 0, 0.15, -0.05)), 0xc83a10);
  add(ctx, 'painted', rot(box(w + 1.1, 0.12, 0.62, 0, 1.68, 0.1)), STONE_W);
  add(ctx, 'painted', rot(box(w + 0.6, 0.08, 0.06, 0, 1.45, 0.29)), STONE_D);
  add(ctx, 'soft', rot(new THREE.PlaneGeometry(w * 1.3, 1.6).translate(0, 0.8, 0.25)), 0x7a3a10);
  add(ctx, 'soft', new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2).translate(x + s * 1.5, y + 0.05, z + c * 1.5), 0x5a2a08);
  ctx.halo(x + s * 0.2, y + 0.6, z + c * 0.2, 0xff9a40, 1.4);
  ctx.spot(x + s * 1.2, y + 1.2, z + c * 1.2, FIRE, 14, 12);
  addBox(ctx, x - (Math.abs(c) * (w / 2 + 0.4) + Math.abs(s) * 0.3), y, z - (Math.abs(s) * (w / 2 + 0.4) + Math.abs(c) * 0.3), x + (Math.abs(c) * (w / 2 + 0.4) + Math.abs(s) * 0.3), y + 1.6, z + (Math.abs(s) * (w / 2 + 0.4) + Math.abs(c) * 0.3), 'furniture');
}

export function chandelier(ctx, x, y, z, { r = 1.2, spot = true } = {}) {
  add(ctx, 'painted', cylinder(0.03, 0.03, 1.2, x, y + 0.6, z, 6), BRASS);
  add(ctx, 'painted', new THREE.TorusGeometry(r, 0.05, 6, 16).rotateX(Math.PI / 2).translate(x, y, z), BRASS);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    add(ctx, 'glow', new THREE.SphereGeometry(0.1, 6, 4).translate(x + Math.cos(a) * r, y + 0.15, z + Math.sin(a) * r), 0xfff0c8);
  }
  add(ctx, 'glow', new THREE.SphereGeometry(0.22, 8, 6).translate(x, y - 0.2, z), 0xffe8b0);
  if (spot) ctx.spot(x, y - 0.5, z, WARM, 16, 18);
}

export function rug(ctx, x, z, w, d, color, border = BRASS, y = 0) {
  add(ctx, 'painted', box(w, 0.03, d, x, y + 0.035, z), border);
  add(ctx, 'painted', box(w - 0.4, 0.035, d - 0.4, x, y + 0.04, z), color);
}

// Rows of books on a shelf unit against a wall (yaw: facing direction of the shelf front).
export function bookshelf(ctx, x, z, yaw, w = 3, h = 3, y = 0, seed = 1) {
  let s = seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const rot = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', rot(box(w, h, 0.06, 0, h / 2, -0.2)), 0x1e120c);
  for (const sx of [-1, 1]) add(ctx, 'painted', rot(box(0.08, h, 0.46, sx * (w / 2 - 0.04), h / 2, 0)), WOOD_DARK);
  add(ctx, 'painted', rot(box(w + 0.16, 0.14, 0.54, 0, h + 0.07, 0.02)), WOOD_DARK);
  add(ctx, 'painted', rot(box(w + 0.24, 0.05, 0.58, 0, h + 0.16, 0.02)), WOOD_LIGHT);
  add(ctx, 'painted', rot(box(w, 0.22, 0.46, 0, 0.11, 0)), WOOD_DARK);
  const cols = [0x7a1e22, 0x1e3a5a, 0x2a4a34, 0x6a5a2a, 0x3a2a4a, 0xa8865a, 0x1a1a1a, 0x8a3a1a, 0x2a5a5a, 0xc8b890];
  const rows = Math.floor((h - 0.25) / 0.5);
  for (let row = 0; row < rows; row++) {
    const y0 = 0.22 + row * 0.5;
    add(ctx, 'painted', rot(box(w - 0.1, 0.035, 0.42, 0, y0, 0.01)), WOOD_LIGHT);
    let u = -w / 2 + 0.1;
    while (u < w / 2 - 0.15) {
      const roll = rnd();
      if (roll < 0.06) { // a stack lying flat
        for (let k = 0; k < 3; k++) add(ctx, 'painted', rot(box(0.26, 0.05, 0.22, u + 0.13, y0 + 0.045 + k * 0.05, 0.02)), cols[Math.floor(rnd() * cols.length)]);
        u += 0.3; continue;
      }
      if (roll < 0.09) { // an ornament: a small urn or a brass box
        add(ctx, 'painted', rot(cylinder(0.06, 0.04, 0.2, u + 0.08, y0 + 0.12, 0.02, 8)), rnd() < 0.5 ? BRASS : 0x2a4a5a);
        u += 0.2; continue;
      }
      const bw = 0.04 + rnd() * 0.07, bh = 0.28 + rnd() * 0.16;
      const c = cols[Math.floor(rnd() * cols.length)];
      const lean = rnd() < 0.08 ? 0.25 : 0;
      add(ctx, 'painted', rot(box(bw, bh, 0.26, 0, 0, 0).rotateZ(lean).translate(u + bw / 2 + lean * 0.06, y0 + 0.02 + bh / 2, 0.03)), c);
      if (bw > 0.07) add(ctx, 'painted', rot(box(bw + 0.004, 0.025, 0.004, u + bw / 2, y0 + 0.02 + bh * 0.8, 0.162)), BRASS);
      u += bw + 0.006 + (lean ? 0.1 : 0);
    }
  }
  const c = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
  addBox(ctx, x - (c * w / 2 + sn * 0.25), y, z - (sn * w / 2 + c * 0.25), x + (c * w / 2 + sn * 0.25), y + h, z + (sn * w / 2 + c * 0.25), 'furniture');
}

export function table(ctx, x, z, w, d, { y = 0, h = 0.78, color = WOOD, cloth = null } = {}) {
  block(ctx, x - w / 2, y + h - 0.06, z - d / 2, x + w / 2, y + h, z + d / 2, cloth ?? color);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(ctx, 'painted', box(0.08, h, 0.08, x + sx * (w / 2 - 0.15), y + h / 2, z + sz * (d / 2 - 0.15)), WOOD_DARK);
  addBox(ctx, x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, 'furniture');
}
export function chair(ctx, x, z, yaw, { y = 0, color = RED } = {}) {
  const rot = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', rot(box(0.5, 0.08, 0.5, 0, 0.46, 0)), color);
  add(ctx, 'painted', rot(box(0.5, 0.6, 0.06, 0, 0.8, -0.22)), WOOD_DARK);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(ctx, 'painted', rot(box(0.05, 0.46, 0.05, sx * 0.2, 0.23, sz * 0.2)), WOOD_DARK);
}
export function armchair(ctx, x, z, yaw, { y = 0, color = GREEN } = {}) {
  const rot = (g) => g.rotateY(yaw).translate(x, y, z);
  const dk = new THREE.Color(color).multiplyScalar(0.7).getHex(), lt = new THREE.Color(color).multiplyScalar(1.2).getHex();
  add(ctx, 'painted', rot(box(0.95, 0.3, 0.9, 0, 0.25, 0)), dk);
  add(ctx, 'painted', rot(box(0.62, 0.14, 0.72, 0, 0.45, 0.05)), lt);
  add(ctx, 'painted', rot(box(0.95, 0.72, 0.2, 0, 0.76, -0.38)), color);
  add(ctx, 'painted', rot(cylinder(0.12, 0.12, 0.95, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(0, 1.1, -0.36)), color);
  for (const sx of [-1, 1]) {
    add(ctx, 'painted', rot(box(0.16, 0.3, 0.9, sx * 0.4, 0.5, 0)), color);
    add(ctx, 'painted', rot(cylinder(0.1, 0.1, 0.9, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(sx * 0.42, 0.68, 0)), lt);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(ctx, 'painted', rot(cylinder(0.04, 0.03, 0.1, sx * 0.4, 0.05, sz * 0.38, 5)), WOOD_DARK);
  addBox(ctx, x - 0.5, y, z - 0.5, x + 0.5, y + 0.6, z + 0.5, 'furniture');
}
export function sofa(ctx, x, z, yaw, w = 2.2, { y = 0, color = GREEN } = {}) {
  const rot = (g) => g.rotateY(yaw).translate(x, y, z);
  const dk = new THREE.Color(color).multiplyScalar(0.7).getHex(), lt = new THREE.Color(color).multiplyScalar(1.2).getHex();
  add(ctx, 'painted', rot(box(w, 0.3, 0.9, 0, 0.25, 0)), dk);
  const nc = Math.max(2, Math.round((w - 0.4) / 0.7));
  for (let k = 0; k < nc; k++) {
    const u = -w / 2 + 0.2 + ((w - 0.4) * (k + 0.5)) / nc;
    add(ctx, 'painted', rot(box((w - 0.4) / nc - 0.03, 0.14, 0.7, u, 0.45, 0.06)), lt);
    add(ctx, 'painted', rot(box((w - 0.4) / nc - 0.06, 0.45, 0.16, u, 0.74, -0.24).rotateX(-0.12)), lt);
  }
  add(ctx, 'painted', rot(box(w, 0.62, 0.22, 0, 0.72, -0.36)), color);
  add(ctx, 'painted', rot(cylinder(0.11, 0.11, w, 0, 0, 0, 8).rotateZ(Math.PI / 2).translate(0, 1.03, -0.36)), color);
  for (const sx of [-1, 1]) {
    add(ctx, 'painted', rot(box(0.2, 0.3, 0.9, sx * (w / 2 - 0.1), 0.5, 0)), color);
    add(ctx, 'painted', rot(cylinder(0.12, 0.12, 0.9, 0, 0, 0, 8).rotateX(Math.PI / 2).translate(sx * (w / 2 - 0.1), 0.68, 0)), lt);
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(ctx, 'painted', rot(cylinder(0.04, 0.03, 0.1, sx * (w / 2 - 0.1), 0.05, sz * 0.38, 5)), WOOD_DARK);
  const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
  addBox(ctx, x - (c * w / 2 + s * 0.45), y, z - (s * w / 2 + c * 0.45), x + (c * w / 2 + s * 0.45), y + 0.6, z + (s * w / 2 + c * 0.45), 'furniture');
}
// A straight stair from (x, z0) at y0 to z1 at y1 (rises along z), width w; or along x.
export function stair(ctx, { axis = 'z', at, from, to, y0, y1, w = 2.6, color = WOOD, rail = true }) {
  const n = Math.max(1, Math.round(Math.abs(y1 - y0) / 0.28));
  const rise = (y1 - y0) / n, run = (to - from) / n;
  for (let i = 0; i < n; i++) {
    const a = from + run * i, b = from + run * (i + 1), top = y0 + rise * (i + 1);
    if (axis === 'z') block(ctx, at - w / 2, y0, Math.min(a, b), at + w / 2, top, Math.max(a, b), color, { tag: 'step' });
    else block(ctx, Math.min(a, b), y0, at - w / 2, Math.max(a, b), top, at + w / 2, color, { tag: 'step' });
  }
  if (rail) {
    const L = Math.hypot(to - from, y1 - y0), ang = Math.atan2(y1 - y0, to - from);
    const g = box(L, 0.08, 0.08, 0, 0, 0);
    if (axis === 'z') add(ctx, 'painted', g.rotateZ(ang).rotateY(-Math.PI / 2).translate(at + w / 2, (y0 + y1) / 2 + 1, (from + to) / 2), WOOD_DARK);
    else add(ctx, 'painted', g.rotateZ(ang).translate((from + to) / 2, (y0 + y1) / 2 + 1, at + w / 2), WOOD_DARK);
  }
}

// A canvas-painted picture in a gilt frame on a wall (browser only: a mesh of its own).
// [polish] kind: an ART_CELLS name (a cell of the one art atlas: no mesh of its own); a legacy
// paint() function still gets its own mesh.
export function picture(ctx, x, y, z, yaw, w, h, kind, { light = true } = {}) {
  const R = (g) => g.rotateY(yaw).translate(x, y, z);
  add(ctx, 'painted', R(box(w + 0.36, h + 0.36, 0.06, 0, 0, 0)), 0x8a6a30);
  for (const [bw, bh, by, bx] of [[w + 0.3, 0.1, h / 2 + 0.06, 0], [w + 0.3, 0.1, -h / 2 - 0.06, 0], [0.1, h + 0.1, 0, w / 2 + 0.06], [0.1, h + 0.1, 0, -w / 2 - 0.06]]) add(ctx, 'painted', R(box(bw, bh, 0.1, bx, by, 0.04)), BRASS);
  if (light) { // a brass picture light over the frame
    add(ctx, 'painted', R(box(0.5, 0.06, 0.12, 0, h / 2 + 0.3, 0.12)), BRASS);
    add(ctx, 'soft', R(new THREE.PlaneGeometry(w * 1.3, h * 0.9).translate(0, h * 0.25, 0.09)), 0x2a1e0c);
  }
  if (typeof kind === 'string') { add(ctx, 'art', R(artPlane(kind, w, h).translate(0, 0, 0.05))); return; }
  if (!DOC || !ctx.group) return;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: kind() }));
  mesh.position.set(ctx.O.x + x + Math.sin(yaw) * 0.05, ctx.O.y + y, ctx.O.z + z + Math.cos(yaw) * 0.05);
  mesh.rotation.y = yaw;
  ctx.add(mesh);
}

// ---- canvas textures (browser only) ----
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, repeat = false) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// A soft round falloff (for the additive glow cards).
function softTexture() {
  const [c, g] = canvas(64, 64);
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return tex(c);
}
// The art atlas: a 4 x 2 grid of 256 x 320 cells, painted once per page (see ART_CELLS).
export const ART_CELLS = ['father', 'mother', 'founder', 'children', 'house', 'hound', 'landscape', 'ship'];
let ATLAS = null;
function artAtlas() {
  if (ATLAS) return ATLAS;
  const [c, g] = canvas(1024, 640);
  ART_CELLS.forEach((k, i) => { const cell = portraitCanvas(k); g.drawImage(cell, (i % 4) * 256, Math.floor(i / 4) * 320); });
  ATLAS = tex(c);
  return ATLAS;
}
// A plane showing one atlas cell (local geometry, centred; caller places it).
export function artPlane(kind, w, h) {
  const i = Math.max(0, ART_CELLS.indexOf(kind));
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  const u0 = (i % 4) / 4, v0 = 1 - (Math.floor(i / 4) + 1) / 2;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) / 4, v0 + uv.getY(k) / 2);
  return g;
}
function rainStreakTexture() {
  const [c, g] = canvas(128, 256);
  g.clearRect(0, 0, 128, 256);
  let s = 7;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  g.strokeStyle = 'rgba(230,240,255,0.7)';
  for (let i = 0; i < 70; i++) {
    const x = r() * 128, y = r() * 256, l = 8 + r() * 26;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 2 - 1, y + l); g.stroke();
    if (r() < 0.3) { g.beginPath(); g.arc(x, y + l, 1.6, 0, Math.PI * 2); g.fillStyle = 'rgba(230,240,255,0.6)'; g.fill(); }
  }
  return tex(c, true);
}
function waterfallTexture() {
  const [c, g] = canvas(128, 256);
  g.fillStyle = 'rgba(160,200,220,0.4)';
  g.fillRect(0, 0, 128, 256);
  let s = 3;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(240,250,255,${0.3 + r() * 0.6})`;
    g.lineWidth = 1 + r() * 4;
    const x = r() * 128;
    g.beginPath(); g.moveTo(x, r() * 256); g.lineTo(x + r() * 4 - 2, r() * 256 + 60); g.stroke();
  }
  return tex(c, true);
}
// Shared animation of the running rain and the falling water (one updater per page).
export function scrollTextures(t) {
  if (!MATS) return;
  if (MATS.rain.map) MATS.rain.map.offset.y = (t * 0.35) % 1;
  if (MATS.water.map) MATS.water.map.offset.y = (t * 1.6) % 1;
}

// Original painted portraits for the Manor's gallery (procedural brushwork on canvas, comic-ink
// palette). kind: 'father' | 'mother' | 'founder' | 'children' | 'house' | 'hound'.
export function portraitTexture(kind) { return tex(portraitCanvas(kind)); }
function portraitCanvas(kind) {
  const [c, g] = canvas(256, 320);
  let s = kind.length * 977 + 13;
  const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const bg = { father: ['#2a1e18', '#5a3a26'], mother: ['#24302a', '#6a7a4a'], founder: ['#1a1a22', '#4a3a2a'], children: ['#302420', '#7a5a3a'], house: ['#1a2230', '#3a4a5a'], hound: ['#2a2018', '#6a4a2a'] }[kind] ?? ['#222', '#555'];
  const grd = g.createLinearGradient(0, 0, 0, 320); grd.addColorStop(0, bg[1]); grd.addColorStop(1, bg[0]);
  g.fillStyle = grd; g.fillRect(0, 0, 256, 320);
  // Brushy background strokes.
  for (let i = 0; i < 140; i++) { g.strokeStyle = `rgba(${200 + r() * 55},${160 + r() * 60},${100 + r() * 60},${0.05 + r() * 0.08})`; g.lineWidth = 4 + r() * 10; const x = r() * 256, y = r() * 320; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 40 - 20, y + r() * 30 - 15); g.stroke(); }
  const ink = '#0b0b12';
  if (kind === 'landscape') {
    // Rolling hills under a stormy sky, a ruined abbey on the ridge.
    g.fillStyle = '#4a5a6a'; g.fillRect(0, 0, 256, 180);
    for (let i = 0; i < 12; i++) { g.fillStyle = `rgba(${170 + r() * 60},${170 + r() * 50},${150 + r() * 40},0.35)`; g.beginPath(); g.ellipse(r() * 256, 40 + r() * 100, 50 + r() * 40, 14 + r() * 10, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#3a4a2a'; g.beginPath(); g.moveTo(0, 200); g.quadraticCurveTo(80, 150, 160, 190); g.quadraticCurveTo(210, 210, 256, 170); g.lineTo(256, 320); g.lineTo(0, 320); g.fill();
    g.fillStyle = '#2a3a1e'; g.beginPath(); g.moveTo(0, 260); g.quadraticCurveTo(120, 210, 256, 250); g.lineTo(256, 320); g.lineTo(0, 320); g.fill();
    g.fillStyle = '#5a564e'; g.fillRect(150, 150, 30, 36); g.fillRect(160, 128, 10, 22);
    g.fillStyle = '#2a2a2a'; g.fillRect(158, 160, 6, 14); g.fillRect(168, 160, 6, 14);
  } else if (kind === 'ship') {
    // A three-master on a dark sea (the founder's ship).
    const sky = g.createLinearGradient(0, 0, 0, 200); sky.addColorStop(0, '#2a3040'); sky.addColorStop(1, '#8a7a5a');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 200);
    g.fillStyle = '#1a2a34'; g.fillRect(0, 200, 256, 120);
    for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(220,230,230,0.35)'; g.lineWidth = 1.5; const x = r() * 256, y = 205 + r() * 110; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 5, x + 16, y); g.stroke(); }
    g.fillStyle = '#3a2418'; g.beginPath(); g.moveTo(60, 200); g.lineTo(200, 200); g.lineTo(186, 222); g.lineTo(74, 222); g.fill();
    g.fillStyle = '#e8dcc0';
    for (const [x, h] of [[96, 90], [130, 110], [164, 80]]) { g.fillRect(x - 1, 200 - h, 3, h); g.fillRect(x - 18, 200 - h + 10, 36, h * 0.35); g.fillRect(x - 15, 200 - h * 0.5, 30, h * 0.3); }
  } else if (kind === 'house') {
    g.fillStyle = '#c8b890'; g.fillRect(40, 150, 176, 100);
    g.fillStyle = '#3a4048'; g.beginPath(); g.moveTo(30, 152); g.lineTo(128, 80); g.lineTo(226, 152); g.fill();
    g.fillStyle = '#e0a850'; for (let i = 0; i < 5; i++) g.fillRect(55 + i * 32, 175, 14, 22);
    g.fillStyle = '#2a3a2a'; g.fillRect(0, 250, 256, 70);
  } else if (kind === 'hound') {
    g.fillStyle = '#6a4a2a'; g.beginPath(); g.ellipse(128, 210, 70, 50, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(150, 140, 36, 40, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a2a18'; g.beginPath(); g.ellipse(125, 120, 14, 30, -0.4, 0, Math.PI * 2); g.fill();
    g.fillStyle = ink; g.beginPath(); g.arc(165, 135, 4, 0, Math.PI * 2); g.fill();
  } else {
    const figures = kind === 'children' ? [[90, 0.8], [170, 0.7]] : [[128, 1]];
    for (const [cx, k] of figures) {
      const coat = { father: '#1a1a22', mother: '#5a2a3a', founder: '#2a2a2a', children: r() < 0.5 ? '#2a3a5a' : '#6a2a2a' }[kind];
      g.fillStyle = coat; g.beginPath(); g.moveTo(cx - 80 * k, 320); g.quadraticCurveTo(cx, 180 * (2 - k), cx + 80 * k, 320); g.fill();
      g.fillStyle = '#d8a882'; g.beginPath(); g.ellipse(cx, 150 + (1 - k) * 60, 36 * k, 46 * k, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = kind === 'founder' ? '#c8c4bc' : kind === 'mother' ? '#3a2418' : '#1a1410';
      g.beginPath(); g.ellipse(cx, 125 + (1 - k) * 60, 38 * k, 26 * k, 0, Math.PI, 0); g.fill();
      if (kind === 'mother') { g.beginPath(); g.ellipse(cx + 26 * k, 160, 14, 40, 0.2, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = ink; g.lineWidth = 2.5;
      g.beginPath(); g.ellipse(cx, 150 + (1 - k) * 60, 36 * k, 46 * k, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = ink; for (const sx of [-12, 12]) { g.beginPath(); g.arc(cx + sx * k, 145 + (1 - k) * 60, 2.6, 0, Math.PI * 2); g.fill(); }
      g.beginPath(); g.arc(cx, 165 + (1 - k) * 60, 12 * k, 0.15 * Math.PI, (kind === 'father' ? 0.85 : 0.75) * Math.PI); g.stroke();
      if (kind === 'founder') { g.fillStyle = '#c8c4bc'; g.beginPath(); g.ellipse(cx, 190, 22, 16, 0, 0, Math.PI); g.fill(); }
    }
    if (kind === 'mother') { for (let i = 0; i < 26; i++) { g.fillStyle = ['#c84a5a', '#e8c84a', '#f0f0e0'][i % 3]; g.beginPath(); g.arc(r() * 256, 250 + r() * 70, 5 + r() * 6, 0, Math.PI * 2); g.fill(); } }
    if (kind === 'founder') { g.fillStyle = '#5a6a7a'; g.beginPath(); g.moveTo(10, 90); g.lineTo(60, 90); g.lineTo(52, 104); g.lineTo(18, 104); g.fill(); g.fillRect(33, 50, 3, 40); }
  }
  // Craquelure and a varnish vignette.
  const v = g.createRadialGradient(128, 160, 60, 128, 160, 200); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v; g.fillRect(0, 0, 256, 320);
  g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.6;
  for (let i = 0; i < 40; i++) { const x = r() * 256, y = r() * 320; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r() * 20 - 10, y + r() * 20 - 10); g.stroke(); }
  return c;
}

// A flat sign or screen texture: lines of text on a colour (browser only).
export function textTexture(lines, { w = 512, h = 256, bg = '#0b1420', fg = '#4fe3ff', font = 'Bangers, Impact, sans-serif', size = 48 } = {}) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `${size}px ${font}`;
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.15));
  return tex(c);
}
export { DOC as HAS_DOM };
