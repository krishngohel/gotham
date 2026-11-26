// [polish] The Batcave's set dressing: scale and depth (rock ribs and stalagmites stepping back
// into the dark, clusters of stalactites, sleeping bats), a real waterfall (a curved fall of
// staggered sheets, a rock lip, a churning foot, mist and a dark pool with ripple rings), railed
// walkways with lit edges, the Batcomputer as a set piece (a wall of screens with painted live
// content, a console with keys, a holo ring), floodlit vehicle bay and Batwing pad, the suit vault
// lit like a museum, the medical bay and the trophy hall.
//
// Merged into the pocket's buckets like the rest (one draw per material for the cave); light from
// emissive glow, soft additive cards and halos, plus the pocket's existing light spots. The
// screens are one canvas atlas (one extra draw) that an updater repaints a cell of a few times a
// second. LOCAL coordinates (the cave's origin). rich: false on Potato (fewer rocks, no bats on
// the roof, no small props, the screen atlas painted once and never again).
import * as THREE from 'three';
import { box, cylinder } from '../buckets.js';
import { add, addBox, ROCK, ROCK_D, STEEL, CYAN, BRASS } from './pocketKit.js';
import { softGlow, lightPool, seeded } from './dressing.js';
import { caveDepth, rockTone } from './caveRock.js'; // [polish2] strata, recesses, columns, pooled light

const DECK = 4;
const DARK = 0x16181c, EDGE = 0x5ad8ff, AMBER = 0xd9a92c;

// A walkway railing: collision as one thin box (like the old solid rail), drawn as posts, a top
// and a mid rail, with a lit strip along the walkway's edge. From (x0, z0) to (x1, z1) at y.
export function rail(ctx, x0, z0, x1, z1, y, { h = 1.0, lit = true, tag = 'balustrade' } = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const ax = (x1 - x0) / len, az = (z1 - z0) / len;
  const yaw = Math.atan2(ax, az);
  addBox(ctx, Math.min(x0, x1) - 0.1, y, Math.min(z0, z1) - 0.1, Math.max(x0, x1) + 0.1, y + h, Math.max(z0, z1) + 0.1, tag);
  const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  const along = (g) => g.rotateY(yaw).translate(mx, y, mz);
  add(ctx, 'painted', along(box(0.07, 0.07, len, 0, h, 0)), STEEL);
  add(ctx, 'painted', along(box(0.05, 0.05, len, 0, h * 0.5, 0)), STEEL);
  if (lit) add(ctx, 'glow', along(box(0.06, 0.04, len, 0, 0.04, 0)), EDGE);
  const n = Math.max(1, Math.round(len / 1.6));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    add(ctx, 'painted', box(0.08, h, 0.08, x0 + (x1 - x0) * t, y + h / 2, z0 + (z1 - z0) * t), 0x2a2e34);
  }
}

// A rock rib: a tall faceted column of stacked, shrinking chunks (a cave wall's buttress).
function rib(ctx, x, z, h, r, rnd, color) {
  let y = 0, rr = r;
  while (y < h) {
    const seg = 3 + rnd() * 4;
    // [polish2] each chunk takes its tone from where it sits (caveRock.js rockTone); `color` (the
    // old flat grey or dark grey) only nudges it lighter or darker.
    const tone = rockTone(x, y + seg * 0.45, z, color === ROCK ? 0.85 : 0.25);
    add(ctx, 'painted', new THREE.DodecahedronGeometry(rr, 0).scale(1, seg / rr * 0.7, 1).rotateY(rnd() * 3).translate(x + (rnd() - 0.5) * 0.8, y + seg * 0.45, z + (rnd() - 0.5) * 0.8), tone);
    y += seg * 0.8;
    rr *= 0.86 + rnd() * 0.1;
  }
}

// A stalagmite (from the floor) or stalactite (from the roof): two cones, a stub and a point.
function spike(ctx, x, y, z, L, r, down, color) {
  const s = down ? -1 : 1;
  add(ctx, 'painted', new THREE.ConeGeometry(r, L, 6).rotateX(down ? Math.PI : 0).translate(x, y + s * L / 2, z), color);
  add(ctx, 'painted', new THREE.ConeGeometry(r * 0.55, L * 0.5, 5).rotateX(down ? Math.PI : 0).translate(x + r * 0.7, y + s * L * 0.25, z + r * 0.3), color);
}

// A hanging cluster of sleeping bats under a ledge of the roof.
function batCluster(ctx, x, y, z, n, rnd) {
  for (let i = 0; i < n; i++) {
    const bx = x + (rnd() - 0.5) * 1.6, bz = z + (rnd() - 0.5) * 1.6, by = y - 0.2 - rnd() * 0.4;
    add(ctx, 'painted', new THREE.ConeGeometry(0.09, 0.32, 4).rotateX(Math.PI).translate(bx, by, bz), 0x0b0b12);
    add(ctx, 'painted', box(0.02, 0.12, 0.02, bx, by + 0.2, bz), 0x0b0b12);
  }
}

// The waterfall: a curved fall of staggered sheets from a rock lip, a churning foot, mist and the
// pool. Centred on x 0, falling at z ~34 from the lip at y `top`.
function waterfall(ctx, rich) {
  const top = 26, zf = 34.0;
  // The lip: a ledge of rock the water pours over, and the dark notch it has cut.
  for (let k = -3; k <= 3; k++) add(ctx, 'painted', new THREE.DodecahedronGeometry(1.6 + (k % 2) * 0.4, 0).scale(1.2, 0.7, 1).translate(k * 2.1, top + 0.6, zf + 1.2), ROCK_D);
  add(ctx, 'painted', box(14, 1.2, 3, 0, top + 0.2, zf + 1.6), ROCK_D);
  // Sheets: narrow strips on a curve, each a little in front of or behind its neighbours, so the
  // fall has body and edges instead of one flat card. The texture scrolls (scrollTextures).
  // Ropes of water of different widths on a deep arc, with gaps of dark rock between some of them,
  // each starting a little lower on the lip and widening as it falls (a trapezoid, not a card).
  const strips = rich ? 11 : 6;
  for (let i = 0; i < strips; i++) {
    const t = i / (strips - 1), u = (t - 0.5) * 12;
    if (rich && (i === 2 || i === 8)) continue; // the gaps
    const w0 = 0.7 + ((i * 7) % 4) * 0.25, w1 = w0 * 1.7;
    const bulge = Math.cos((t - 0.5) * Math.PI) * 2.6;
    const zz = zf - bulge - (i % 2) * 0.35;
    const h = top - 0.4 - ((i * 5) % 3) * 0.6;
    const g = new THREE.PlaneGeometry(1, h, 1, 1);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setX(k, pos.getX(k) * (pos.getY(k) > 0 ? w0 : w1));
    add(ctx, 'water', g.rotateY(Math.PI + (t - 0.5) * 0.9).translate(u, h / 2, zz));
  }
  // A brighter inner veil and thin white edge threads.
  add(ctx, 'water', new THREE.PlaneGeometry(5, top - 2).rotateY(Math.PI).translate(0.4, (top - 2) / 2 + 1, zf - 1.2));
  for (const u of [-5.6, 5.5]) add(ctx, 'glow', box(0.12, top - 1, 0.12, u, (top - 1) / 2, zf - 0.2), 0xbfe0f0);
  // The foot: churning white water, spray stones, mist cards rising off it.
  const r = seeded(77);
  for (let k = 0; k < (rich ? 18 : 8); k++) add(ctx, 'glow', new THREE.IcosahedronGeometry(0.4 + r() * 0.5, 0).scale(1.3, 0.35, 1).translate(-6.5 + r() * 13, 0.12 + r() * 0.15, zf - 3.4 + r() * 2.2), r() < 0.5 ? 0x9cc4d4 : 0x7aa4b8);
  for (let k = 0; k < (rich ? 7 : 3); k++) softGlow(ctx, -5 + k * (10 / 6), 1.4 + (k % 3) * 1.3, zf - 2.2 - (k % 2), 2.4 + (k % 2), 0x3a5a6a);
  softGlow(ctx, 0, 6, zf - 3, 6, 0x1a3040);
  // The pool: dark water with lit ripple rings and a pale lip of wet stone round it.
  add(ctx, 'glow', new THREE.CircleGeometry(9, 28).scale(1.25, 1, 0.5).rotateX(-Math.PI / 2).translate(0, 0.04, zf - 3.2), 0x0e2230);
  for (const [rr, a] of [[2.2, 0], [3.8, 0], [5.6, 0], [7.2, 0]]) add(ctx, 'glow', new THREE.TorusGeometry(rr, 0.035, 3, 40).scale(1.25, 0.5, 1).rotateX(Math.PI / 2).translate(0, 0.06, zf - 3.2 + a), 0x3a7a96);
  for (let k = 0; k < 16; k++) { const a = Math.PI + (k / 15) * Math.PI; add(ctx, 'painted', new THREE.DodecahedronGeometry(0.5 + (k % 3) * 0.25, 0).scale(1, 0.5, 1).translate(Math.cos(a) * 11.4, 0.15, zf - 3.2 + Math.sin(a) * 4.6), 0x3a3e44); }
  ctx.halo(0, 2, zf - 2.4, 0x9ac8e8, 4);
}

// The screen wall: one canvas atlas of four live cells (city map grid, villain files, a radar
// sweep, a waveform). Returns the mesh (or null headless) and its painter.
function screenAtlas(ctx, rich) {
  if (!ctx.group || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const files = ['THE JOKER', 'THE PENGUIN', 'THE RIDDLER', 'SCARECROW', 'MR. FREEZE', 'POISON IVY', 'FIREFLY', 'BLACK MASK'];
  const paint = (t) => {
    g.fillStyle = '#04090d'; g.fillRect(0, 0, 1024, 256);
    // Cell 0: the city as a lit grid with a route and a blinking mark.
    g.strokeStyle = 'rgba(79,227,255,0.35)'; g.lineWidth = 1;
    for (let x = 8; x < 248; x += 16) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x, 248); g.stroke(); }
    for (let y = 8; y < 248; y += 16) { g.beginPath(); g.moveTo(8, y); g.lineTo(248, y); g.stroke(); }
    g.strokeStyle = '#f2d24b'; g.lineWidth = 3; g.beginPath(); g.moveTo(40, 210); g.lineTo(40, 120); g.lineTo(150, 120); g.lineTo(150, 56); g.lineTo(210, 56); g.stroke();
    if (Math.floor(t * 2) % 2) { g.fillStyle = '#ff4a4a'; g.beginPath(); g.arc(210, 56, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#4fe3ff'; g.font = '16px monospace'; g.fillText('GOTHAM / LIVE', 14, 24);
    // Cell 1: a villain file, cycling.
    const k = Math.floor(t / 3) % files.length;
    g.fillStyle = '#0a1a22'; g.fillRect(264, 8, 240, 240);
    g.fillStyle = '#1e3a46'; g.beginPath(); g.arc(330, 92, 40, 0, Math.PI * 2); g.fill(); g.fillRect(292, 132, 76, 80);
    g.fillStyle = '#4fe3ff'; g.font = 'bold 18px monospace'; g.fillText(files[k], 384, 40);
    g.font = '13px monospace';
    for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(79,227,255,${0.35 + (i % 3) * 0.2})`; g.fillRect(384, 58 + i * 18, 40 + ((i * 37 + k * 13) % 80), 8); }
    g.fillStyle = '#ff4a4a'; g.fillText('AT LARGE', 384, 236);
    // Cell 2: a radar sweep with contacts.
    const cx = 640, cy = 128;
    g.strokeStyle = 'rgba(90,255,140,0.4)'; for (const rr of [40, 80, 116]) { g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.stroke(); }
    const a = t * 1.6;
    g.fillStyle = 'rgba(90,255,140,0.25)'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 116, a - 0.6, a); g.fill();
    g.fillStyle = '#7aff9a'; for (const [r0, a0] of [[60, 1], [95, 2.6], [30, 4.2], [104, 5.4]]) g.fillRect(cx + Math.cos(a0) * r0 - 3, cy + Math.sin(a0) * r0 - 3, 6, 6);
    // Cell 3: a waveform (the police band) and a clock line.
    g.strokeStyle = '#f2d24b'; g.lineWidth = 2; g.beginPath();
    for (let x = 0; x < 240; x += 3) { const y = 128 + Math.sin(x * 0.08 + t * 6) * 30 * Math.sin(x * 0.013 + t) + Math.sin(x * 0.31 + t * 11) * 6; if (x) g.lineTo(776 + x, y); else g.moveTo(776, y); }
    g.stroke();
    g.fillStyle = '#4fe3ff'; g.font = '16px monospace'; g.fillText('GCPD BAND 7', 784, 30);
    tex.needsUpdate = true;
  };
  paint(0);
  // Four screens round the central one (which the runtime draws on), each showing its cell.
  const geo = new THREE.BufferGeometry();
  const pos = [], uv = [], idx = [];
  const place = [[-2, 0.64], [-1, 0.32], [1, -0.32], [2, -0.64]];
  place.forEach(([i, a], cell) => {
    const cxw = Math.sin(i * 0.32) * 11, cz = -15.0 - (1 - Math.cos(i * 0.32)) * 11 * 0.4 + 0.02;
    const w = 3.5, h = 2.3, ca = Math.cos(-i * 0.32), sa = Math.sin(-i * 0.32);
    const base = pos.length / 3;
    for (const [px, py] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
      pos.push(ctx.O.x + cxw + px * ca, ctx.O.y + DECK + 3.2 + py, ctx.O.z + cz - px * sa);
    }
    const u0 = cell / 4, u1 = (cell + 1) / 4;
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    void a;
  });
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex }));
  mesh.name = 'batcomputerWall';
  mesh.userData.noShadow = true;
  ctx.add(mesh);
  if (rich) {
    let acc = 0, last = -1;
    ctx.updaters.push((t) => { acc = t; if (acc - last > 0.25) { last = acc; paint(acc); } });
  }
  return mesh;
}

export function dressCave(ctx, rich) {
  const rnd = seeded(5150);
  // ---- depth: ribs round the walls, stepping darker toward the back; stalagmites mid-floor ----
  const ribs = rich ? 26 : 12;
  for (let i = 0; i < ribs; i++) {
    const t = (i + 0.5) / ribs;
    // Round the walls clockwise from the north-west, skipping the waterfall, the mouth and the tunnel.
    let x, z;
    if (t < 0.3) { x = -44 + (t / 0.3) * 88; z = -34.5; }
    else if (t < 0.5) { x = 44.5; z = -34 + ((t - 0.3) / 0.2) * 68; if (z > -12 && z < 0) continue; }
    else if (t < 0.8) { x = 44 - ((t - 0.5) / 0.3) * 88; z = 34.5; if (Math.abs(x) < 10) continue; }
    else { x = -44.5; z = 34 - ((t - 0.8) / 0.2) * 68; }
    rib(ctx, x, z, 30, 2.6 + rnd() * 1.6, rnd, i % 3 ? ROCK_D : ROCK);
  }
  const spires = [[-30, 28, 7], [26, 31, 9], [40, 26, 6], [-42, 22, 8], [-8, -32, 5], [40, -32, 7], [-24, -33, 6], [16, -33, 8]];
  for (const [x, z, L] of spires) spike(ctx, x, 0, z, L, 1.2, false, rockTone(x, L * 0.4, z, 0.7));
  // Stalactites in clusters (not scattered singly), long ones over the open floor.
  for (const [cx, cz, n] of [[-20, 20, 7], [18, 24, 6], [0, -2, 5], [30, -2, 6], [-34, -6, 5], [-8, 30, 6], [14, -28, 5], [36, 14, 4]]) {
    for (let k = 0; k < (rich ? n : Math.ceil(n / 2)); k++) {
      const L = 3 + rnd() * 9;
      spike(ctx, cx + (rnd() - 0.5) * 7, 32, cz + (rnd() - 0.5) * 7, L, 0.4 + rnd() * 0.9, true, rnd() < 0.6 ? 0x0c0d11 : 0x15171c); // [polish2] the roof's teeth are silhouettes
    }
    if (rich) batCluster(ctx, cx + 1, 31.6, cz - 1, 6 + Math.floor(rnd() * 6), rnd);
  }
  // A cool haze toward the roof and the far walls (additive, very faint): the dark has depth.
  for (const [x, y, z, r] of [[0, 20, 30, 18], [-38, 18, 0, 16], [38, 18, 10, 16], [0, 22, -30, 20]]) softGlow(ctx, x, y, z, r, 0x0a1620, { cross: false });

  // The floor: flat slabs of rock, wet patches catching the light, cable runs to the deck.
  for (let k = 0; k < (rich ? 26 : 10); k++) {
    const x = -42 + rnd() * 84, z = -30 + rnd() * 58;
    if (Math.abs(x) < 9 && z > 14) continue; // the turntable and the pool
    if (x > -27 && x < 15 && z > -17 && z < 9) continue; // under the deck
    add(ctx, 'painted', new THREE.DodecahedronGeometry(0.8 + rnd() * 1.4, 0).scale(1, 0.18, 1).rotateY(rnd() * 3).translate(x, 0.05, z), rnd() < 0.5 ? 0x34383e : 0x2a2d32);
  }
  for (const [x, z, w, d] of [[-18, 14, 4, 2.4], [14, 12, 3, 2], [-30, -26, 5, 3], [32, 4, 3.4, 2]]) add(ctx, 'glow', new THREE.CircleGeometry(1, 16).scale(w / 2, d / 2, 1).rotateX(-Math.PI / 2).translate(x, 0.03, z), 0x101c26);
  for (const x of [-4.6, -4.2]) add(ctx, 'painted', box(0.12, 0.08, 7, x, 0.04, 11.5), 0x101114);

  // ---- [polish2] depth: strata, recesses, columns and an arch, pooled light (caveRock.js) ----
  caveDepth(ctx, rich);

  // ---- the waterfall ----
  waterfall(ctx, rich);

  // ---- walkways: lit deck edges and rails (the old solid rails' collision boxes are kept by
  // batcave.js; these draw over them) ----
  add(ctx, 'glow', box(40, 0.05, 0.08, -6, DECK + 0.02, 8.05), EDGE);
  add(ctx, 'glow', box(0.08, 0.05, 24, 14.05, DECK + 0.02, -4), EDGE);
  add(ctx, 'glow', box(0.08, 0.05, 24, -26.05, DECK + 0.02, -4), EDGE);
  add(ctx, 'glow', box(16, 0.05, 0.08, 30, DECK + 0.02, -9.95), EDGE);
  // Under-deck light: a cold wash on the cave floor under the deck's edge.
  lightPool(ctx, -6, 0, 10, 40, 5, 0x0a1a24);
  // Deck plates: a grid of seams across the deck.
  for (let x = -24; x < 14; x += 4) add(ctx, 'painted', box(0.05, 0.01, 23.6, x, DECK + 0.012, -4), 0x22262c);
  for (let z = -14; z < 8; z += 4) add(ctx, 'painted', box(39.6, 0.01, 0.05, -6, DECK + 0.012, z), 0x22262c);

  // ---- the Batcomputer: a console with keys, a holo ring, cable runs, the screen wall ----
  add(ctx, 'painted', box(7, 0.12, 1.4, 0, DECK + 1.0, -13.6).rotateX(0.18), 0x1a1c22);
  for (let k = 0; k < 24; k++) add(ctx, 'glow', box(0.18, 0.03, 0.14, -2.6 + (k % 12) * 0.46, DECK + 1.1 + Math.floor(k / 12) * 0.04, -13.8 + Math.floor(k / 12) * 0.22), k % 5 ? 0x2a6a7a : AMBER);
  add(ctx, 'glow', new THREE.TorusGeometry(1.1, 0.03, 4, 32).rotateX(Math.PI / 2).translate(4.6, DECK + 1.6, -12.8), CYAN);
  for (const [rr, yy] of [[0.7, 2.0], [0.5, 2.35]]) add(ctx, 'glow', new THREE.TorusGeometry(rr, 0.015, 3, 28).rotateX(Math.PI / 2).translate(4.6, DECK + yy, -12.8), CYAN);
  add(ctx, 'holo', new THREE.ConeGeometry(1.1, 1.0, 16, 1, true).rotateX(Math.PI).translate(4.6, DECK + 2.1, -12.8));
  for (const x of [-8, 8]) add(ctx, 'painted', cylinder(0.12, 0.12, 6, x, DECK + 3, -15.6, 6), 0x1a1c22);
  add(ctx, 'painted', box(18, 0.4, 0.4, 0, DECK + 5.2, -15.6), 0x1a1c22);
  for (let k = 0; k < 6; k++) add(ctx, 'glow', box(0.5, 0.05, 0.05, -7 + k * 2.8, DECK + 5.0, -15.35), 0x4fe3ff);
  softGlow(ctx, 0, DECK + 3.2, -14.4, 6.5, 0x0a2a36, { cross: false });
  lightPool(ctx, 0, DECK, -11.5, 9, 6, 0x0a2028);
  screenAtlas(ctx, rich);

  // ---- the suit vault: lit plinths, a top light and a back panel in each case ----
  for (let k = 0; k < 4; k++) {
    const z = -13 + k * 4;
    add(ctx, 'glow', box(1.8, 0.05, 1.8, -24.6, DECK + 0.32, z), 0x3a5a7a);
    add(ctx, 'painted', box(0.08, 2.9, 1.9, -25.55, DECK + 1.6, z), 0x101216);
    add(ctx, 'glow', box(0.04, 2.6, 0.06, -25.5, DECK + 1.6, z - 0.85), 0x8ab8e0);
    add(ctx, 'glow', box(0.04, 2.6, 0.06, -25.5, DECK + 1.6, z + 0.85), 0x8ab8e0);
    softGlow(ctx, -24.6, DECK + 1.6, z, 1.5, 0x1a2a3a);
    add(ctx, 'glow', box(0.06, 0.18, 0.9, -23.68, DECK + 0.5, z), AMBER); // the name plate
  }
  lightPool(ctx, -23, DECK, -7, 4, 16, 0x101a26);

  // ---- the vehicle bay: a floodlight truss over the turntable, a lit floor ring, tool carts ----
  add(ctx, 'painted', box(18, 0.4, 0.4, 0, 12, 18), 0x1a1c22);
  add(ctx, 'painted', box(18, 0.4, 0.4, 0, 12, 30), 0x1a1c22);
  for (const x of [-9, 9]) add(ctx, 'painted', box(0.4, 0.4, 12.4, x, 12, 24), 0x1a1c22);
  for (const [x, z] of [[-6, 18], [6, 18], [-6, 30], [6, 30]]) {
    add(ctx, 'painted', box(1, 0.5, 0.7, x, 11.6, z), 0x24282e);
    add(ctx, 'glow', box(0.8, 0.05, 0.5, x, 11.33, z), 0xf0f4ff);
    ctx.halo(x, 11.2, z, 0xe8f0ff, 1.2);
  }
  softGlow(ctx, 0, 6, 24, 8, 0x16222e);
  lightPool(ctx, 0, 0, 24, 15, 15, 0x14202a);
  lightPool(ctx, -11, 0, 22, 4, 4, 0x14202a);
  // The Batwing pad: corner lamps and a lit H-ring.
  for (const [x, z] of [[23, -29], [37, -29], [23, -11], [37, -11]]) { add(ctx, 'glow', cylinder(0.18, 0.22, 0.25, x, DECK + 0.12, z, 8), AMBER); ctx.halo(x, DECK + 0.4, z, 0xffd080, 0.6); }
  lightPool(ctx, 30, DECK, -20, 14, 14, 0x141e28);
  if (rich) for (const [x, z] of [[-14, 27], [12, 28]]) {
    add(ctx, 'painted', box(1.2, 0.9, 0.7, x, 0.55, z), 0x8a1a22);
    add(ctx, 'painted', box(1.25, 0.05, 0.75, x, 1.02, z), 0x2a2a2a);
    for (let k = 0; k < 4; k++) add(ctx, 'painted', box(0.1, 0.08, 0.5, x - 0.45 + k * 0.3, 1.1, z), [0x8a9098, AMBER][k % 2]);
    addBox(ctx, x - 0.6, 0, z - 0.35, x + 0.6, 1.05, z + 0.35, 'furniture');
  }

  // ---- the medical bay: a surgical lamp, an IV stand, a cabinet, a privacy screen ----
  add(ctx, 'painted', cylinder(0.05, 0.05, 2.0, -34, 4.4, 15, 6), STEEL);
  add(ctx, 'painted', new THREE.CylinderGeometry(0.3, 0.6, 0.35, 12, 1, true).translate(-34, 3.3, 15), 0xd8dce0);
  add(ctx, 'glow', new THREE.CircleGeometry(0.55, 14).rotateX(Math.PI / 2).translate(-34, 3.12, 15), 0xffffff);
  lightPool(ctx, -34, 0, 15, 6, 6, 0x1a2228);
  add(ctx, 'painted', cylinder(0.02, 0.02, 2.0, -31.4, 1.0, 13.4, 5), STEEL);
  add(ctx, 'painted', box(0.22, 0.3, 0.06, -31.4, 1.9, 13.4), 0xd0e8f0);
  add(ctx, 'painted', box(0.8, 2, 0.5, -37.8, 1, 11.4), 0xd8dce0);
  add(ctx, 'glow', box(0.6, 0.06, 0.04, -37.8, 1.6, 11.66), 0xc8323c);
  for (let k = 0; k < 3; k++) add(ctx, 'painted', box(0.04, 1.8, 1.0, -30.6, 0.95, 18.2 + k * 0.9).rotateY(0), k % 2 ? 0xc8d4d8 : 0xb0bcc0);
  addBox(ctx, -38.2, 0, 11.1, -37.4, 2, 11.7, 'furniture');

  // ---- the trophy hall: spot pools on each plinth, a gallery rail, name plates ----
  for (const [x, z, w] of [[-41, -12, 3], [-38.5, -2, 6], [-41, -18, 2.5]]) {
    lightPool(ctx, x, 0.53, z, w + 1.6, w + 1.6, 0x2a2010);
    softGlow(ctx, x, 3, z, 2.4, 0x1e180c, { cross: false });
    add(ctx, 'glow', box(0.06, 0.16, 0.8, x + w / 2 + 0.03, 0.3, z), AMBER);
  }
  add(ctx, 'painted', box(0.2, 7, 0.2, -36, 3.5, -22), 0x1a1c22);
  for (const [x, z] of [[-41, -12], [-38.5, -2], [-41, -18]]) { add(ctx, 'glow', box(0.6, 0.12, 0.3, x + 1.5, 7.6, z), 0xffe8c0); ctx.halo(x + 1.5, 7.4, z, 0xffe0a0, 0.8); }
  void BRASS; void DARK; void rail;
}
