// Darkness audit: finds scenes that are too dark to read.
//
// For every scene it can reach it captures the frame twice (HUD hidden, HUD shown) and measures
//   mean / median luminance (sRGB-encoded luma, 0..100), the share of near-black pixels
//   (luma < 8 %), and a readability number for the hero and for each enemy or boss in view
//   (how far the character's screen region separates from the ring of background around it).
// Limits and how they were calibrated: docs/design/lighting.md. Numbers are a filter, not the
// verdict: look at every flagged frame (OUT/frames) and at a sample of the passing ones.
//
// Scenes are discovered from the game's own data wherever there is data, so a new mission's
// places are audited without touching this file: every named site (mapData SITES, the regions'
// sites, each night's sites, fights and predator rooms), every district (street, rooftop, covered
// deck), every interior room and pocket (Manor, Batcave, Wayne Tower), every registered boss and
// each of its phases, every per-view screen effect in src/story/viewFx.js, detective vision,
// cinematics, driving, gliding and split screen; across the clock's key hours and every weather.
//
//   npm run test:darkness     build, then the fast set on High, Low and Potato; exit 1 under a limit
//   npm run audit:darkness    build, then the full audit
//   node scripts/darkness-audit.mjs --dist=dist [--fast] [--check] [--tiers=high,low] [--out=dir]
//
// Env: BASE (default http://localhost:5960/: a vite dev or preview server) or DIST=<build folder>
//      (served from disk, no server; `npm run build` first), OUT (default tmp/darkness), Q=high,low,potato,
//      SET=full|fast, GROUP=city,sites,fights,interiors,bosses,views,split,story (default all),
//      ONLY=<substring of a scene name>, CHECK=1 (exit 1 when a scene is under the limits),
//      FRAMES=all|flagged|none (which JPEGs to keep, default all), TAG=<label in the report>,
//      BRIGHT=<0.5..1.5> (run with the Brightness setting at this value; default: the default),
//      HEADED=1, CHANNEL=msedge. One browser and one page at a time, always.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, extname, normalize } from 'node:path';
import sharp from 'sharp';
import os from 'node:os';

// Below-normal priority for this process and the browsers it starts (they inherit it on Windows),
// so an audit never starves whatever else the machine is doing.
try { os.setPriority(os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not permitted: run as is */ }

// ---------------------------------------------------------------------------------- limits
// Calibrated by eye on the frames of the first full run (docs/design/lighting.md, "Limits").
const LIMITS = {
  // Whole frame, HUD hidden, sRGB-encoded luma 0..100. A night street that reads has its median
  // near 10 or above and less than a third of its pixels near black; under that the road, the
  // walls and a dark cape all sit in the same black.
  meanMin: 12,
  medianMin: 9.5,
  blackMax: 0.35, // share of pixels under 8 % luma
  // Characters: separation of the figure from the ring around it (see readability()).
  heroMin: 5,
  enemyMin: 5,
  // Deliberately dark beats (a boss arena, fear gas, a blackout): the frame may be moodier, the
  // hero and the threats may not (heroMin and enemyMin apply unchanged).
  moodyMeanMin: 8,
  moodyMedianMin: 5,
  moodyBlackMax: 0.6,
};
const NEAR_BLACK = 0.08 * 255;

// Flags (npm scripts cannot set env vars portably): --fast, --check, --dist=<dir>, --tiers=a,b.
for (const a of process.argv.slice(2)) {
  if (a === '--fast') process.env.SET = 'fast';
  else if (a === '--check') process.env.CHECK = '1';
  else if (a.startsWith('--dist=')) process.env.DIST = a.slice(7);
  else if (a.startsWith('--tiers=')) process.env.Q = a.slice(8);
  else if (a.startsWith('--out=')) process.env.OUT = a.slice(6);
}
// DIST=<folder of a production build>: the pages are served straight from disk through the
// browser's request interception, so no server and no port are needed and the files cannot change
// under a running audit (a dev server reloads the page on every source edit).
const DIST = process.env.DIST ? resolve(process.env.DIST) : null;
const base = DIST ? 'http://gotham.audit/' : (process.env.BASE ?? 'http://localhost:5960/').replace(/\/?$/, '/');
const out = process.env.OUT ?? 'tmp/darkness';
const tiers = (process.env.Q ?? 'high,low,potato').split(',');
const SET = process.env.SET ?? 'full';
const GROUPS = process.env.GROUP ? process.env.GROUP.split(',') : null;
const ONLY = process.env.ONLY ?? null;
const KEEP = process.env.FRAMES ?? 'all';
const W = 1280, H = 720;
const want = (g) => !GROUPS || GROUPS.includes(g);
const BRIGHT = process.env.BRIGHT ? `&brightness=${process.env.BRIGHT}` : '';

// ---------------------------------------------------------------------------------- conditions
// The clock's key hours (src/env/look.js KEYFRAMES: the night holds 21:00-04:30, so 23:00 and
// 02:00 differ only by where the moon stands; 19:00 and 05:30 are the frames with the weakest key
// light, when the sun is gone and the moon is not yet up) and every weather (src/env/weather.js).
const WEATHERS = ['clear', 'overcast', 'drizzle', 'rain', 'storm', 'fog', 'snow'];
const NIGHT_T = 2; // the dead of night
// The darkest condition the cycle reaches, by measurement (docs/design/lighting.md): a night
// storm. Cloud hides the moon's extra clear-sky light and wet streets darken; fog and snow pale
// the air instead.
const DARKEST = { t: NIGHT_T, wx: 'storm' };
// Every district under the three night skies that differ most...
const NIGHTS = SET === 'fast' ? [DARKEST] : [DARKEST, { t: NIGHT_T, wx: 'clear' }, { t: NIGHT_T, wx: 'fog' }];
// ...and a handful of places under every weather at night and four weathers at six more hours.
const MATRIX = SET === 'fast'
  ? [{ t: NIGHT_T, wx: 'fog' }, { t: NIGHT_T, wx: 'snow' }, { t: 5.5, wx: 'storm' }, { t: 19, wx: 'storm' }, { t: 12, wx: 'storm' }]
  : [
    ...WEATHERS.filter((wx) => !NIGHTS.some((n) => n.wx === wx)).map((wx) => ({ t: NIGHT_T, wx })),
    ...[23, 5, 5.5, 6.5, 12, 18.5, 19, 20].flatMap((t) => ['clear', 'storm', 'fog', 'snow'].map((wx) => ({ t, wx }))),
  ];
const condName = (c) => `${String(c.t).replace('.', 'h')}-${c.wx}`;

// ---------------------------------------------------------------------------------- pixels
const luma = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

async function decode(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

// Frame statistics over a rect of the image (fractions; default the whole frame).
function frameStats(img, rect = [0, 0, 1, 1]) {
  const x0 = Math.floor(rect[0] * img.w), y0 = Math.floor(rect[1] * img.h);
  const x1 = Math.ceil((rect[0] + rect[2]) * img.w), y1 = Math.ceil((rect[1] + rect[3]) * img.h);
  const hist = new Uint32Array(256);
  let sum = 0, n = 0, black = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const L = luma(img.data, (y * img.w + x) * 3);
    hist[Math.round(L)]++; sum += L; n++;
    if (L < NEAR_BLACK) black++;
  }
  const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= n * p) return i; } return 255; };
  const r = (v) => +((v / 255) * 100).toFixed(1);
  return { mean: r(sum / n), median: r(pct(0.5)), p10: r(pct(0.1)), p90: r(pct(0.9)), black: +(black / n).toFixed(3) };
}

// How well a character separates from what is behind it. box: [x0, y0, x1, y1] in pixels.
// The figure is the middle of the box (a body fills its centre, not its corners); the background
// is a ring around the box. Two things make a figure readable in this game: a tone different from
// the ground behind it, and light on the figure itself (rim light, an inked outline, a face). So
// the number is the larger of
//   sep     |mean luma of the figure - mean luma of the ring|
//   detail  half the figure's own p95 - p10 range (a rim-lit black suit on a black wall)
// in luma points (0..100). Null when the box is off screen or tiny (too far to matter).
function readability(img, box) {
  let [bx0, by0, bx1, by1] = box;
  const bw = bx1 - bx0, bh = by1 - by0;
  if (bw < 6 || bh < 14) return null;
  const cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  if (cx < 0 || cx >= img.w || cy < 0 || cy >= img.h) return null;
  const clampX = (v) => Math.max(0, Math.min(img.w - 1, Math.round(v)));
  const clampY = (v) => Math.max(0, Math.min(img.h - 1, Math.round(v)));
  const inner = [clampX(cx - bw * 0.28), clampY(cy - bh * 0.42), clampX(cx + bw * 0.28), clampY(cy + bh * 0.42)];
  const ring0 = [bx0 - bw * 0.15, by0 - bh * 0.08, bx1 + bw * 0.15, by1 + bh * 0.02];
  const ring1 = [clampX(bx0 - bw * 0.9), clampY(by0 - bh * 0.35), clampX(bx1 + bw * 0.9), clampY(by1 + bh * 0.1)];
  const hist = new Uint32Array(256);
  let sumIn = 0, nIn = 0, sumRing = 0, nRing = 0;
  for (let y = inner[1]; y <= inner[3]; y++) for (let x = inner[0]; x <= inner[2]; x++) {
    const L = luma(img.data, (y * img.w + x) * 3);
    sumIn += L; nIn++; hist[Math.round(L)]++;
  }
  for (let y = ring1[1]; y <= ring1[3]; y++) for (let x = ring1[0]; x <= ring1[2]; x++) {
    if (x > ring0[0] && x < ring0[2] && y > ring0[1] && y < ring0[3]) continue;
    sumRing += luma(img.data, (y * img.w + x) * 3); nRing++;
  }
  if (nIn < 40 || nRing < 40) return null;
  const pct = (p) => { let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= nIn * p) return i; } return 255; };
  const s = 100 / 255;
  const sep = Math.abs(sumIn / nIn - sumRing / nRing) * s;
  const detail = ((pct(0.95) - pct(0.1)) / 2) * s;
  return { score: +Math.max(sep, detail).toFixed(1), sep: +sep.toFixed(1), detail: +detail.toFixed(1), fig: +((sumIn / nIn) * s).toFixed(1), ring: +((sumRing / nRing) * s).toFixed(1) };
}

// ---------------------------------------------------------------------------------- the page
// Everything that runs inside the game. Installed once per page as window.__da.
function installPageHelpers() {
  const G = window.__game;
  const da = (window.__da = { hold: null, spawned: [], mods: null });
  // No lightning while measuring (a flash frame is white paper and ink): the weather's own switch
  // for "strikes come from elsewhere" (an online guest's) stops it making any.
  try { G.world.weather.remoteStrikes = true; } catch { /* an older build */ }
  const css = document.createElement('style');
  // HUD hidden: everything but the canvas goes, except the per-view screen effects (viewFx.js
  // veils are part of the picture, not of the HUD) and the cinematic's letterbox.
  css.textContent = `
    html.da-nohud body > *:not(canvas):not(.hud):not(.coop-huds) { display: none !important; }
    html.da-nohud .hud > *:not(.story-veil):not(.hud), html.da-nohud .hud .hud > *:not(.story-veil) { visibility: hidden !important; }
    html.da-nohud .story-veil { visibility: visible !important; }
    canvas { cursor: none; }`;
  document.head.appendChild(css);

  // The game's own data, read off the running game (dev tools: ?god=1), so the audit also works
  // on a production build where /src is not served.
  da.data = () => {
    const regions = G.world.regions ?? [];
    return {
      sites: G.sites ?? {},
      regionSites: Object.assign({}, ...regions.map((r) => r.sites ?? {})),
      districts: regions.flatMap((r) => (r.districts ?? []).map((d) => ({ ...d, region: r.id }))),
      rooms: G.interiors?.rooms ?? {},
      pockets: G.bruce?.POCKETS ?? {},
      nights: G.campaign?.allNights() ?? [],
      stepsOf: G.campaign?.stepsOf ?? (() => []),
    };
  };
  da.load = () => { const d = da.data(); return { sites: Object.keys(d.sites).length, regionSites: Object.keys(d.regionSites).length, districts: d.districts.length, rooms: Object.keys(d.rooms).length, pockets: Object.keys(d.pockets).length, nights: d.nights.length }; };

  const P = (p) => (p && Number.isFinite(p.x) && Number.isFinite(p.z) ? { x: p.x, y: p.y ?? 0, z: p.z, yaw: p.yaw } : null);
  const ground = (p, up = 4) => { const g = G.world.collision.groundBelow(p.x, p.y + up, p.z, 0.3); return Number.isFinite(g) ? g : p.y; };

  // The scene list, from data. Each: { name, group, kind, pos, yaw?, ... }.
  da.discover = () => {
    const M = da.data(), scenes = [];
    const seen = new Set();
    const add = (s) => {
      if (!s.pos) return;
      // Two sites a few metres apart are one picture.
      const key = `${s.group}:${Math.round(s.pos.x / 6)}:${Math.round(s.pos.y / 4)}:${Math.round(s.pos.z / 6)}`;
      if (seen.has(key)) return;
      seen.add(key);
      scenes.push(s);
    };
    const pocketSpan = (p) => Object.values(M.pockets).some((k) => Math.abs(p.x - k.origin.x) < 160 && Math.abs(p.z - k.origin.z) < 160);
    // Districts: a street corner, the nearest rooftop, and (where the data has one) a covered deck.
    const sg = G.world.streetGraph;
    for (const d of M.districts) {
      const c = d.palette?.center;
      if (!c) continue;
      let best = null, bd = Infinity;
      for (const n of sg.nodes) { if (G.world.districtAt(n.x, n.z) !== d.id) continue; const dd = (n.x - c.x) ** 2 + (n.z - c.z) ** 2; if (dd < bd) { bd = dd; best = n; } }
      const st = best ? { x: best.x + 3, y: best.y ?? 0, z: best.z + 3 } : { x: c.x, y: 0, z: c.z };
      st.y = ground({ ...st, y: st.y + 1 });
      add({ name: `district-${d.id}-street`, group: 'city', kind: 'street', district: d.id, pos: st, enemies: true });
      let roof = null; bd = Infinity;
      for (const r of G.world.roofs ?? []) { if (r.district !== d.id && G.world.districtAt(r.x, r.z) !== d.id) continue; if (r.y < 8) continue; const dd = (r.x - c.x) ** 2 + (r.z - c.z) ** 2; if (dd < bd) { bd = dd; roof = r; } }
      if (roof) add({ name: `district-${d.id}-roof`, group: 'city', kind: 'roof', district: d.id, pos: { x: roof.x, y: roof.y, z: roof.z }, enemies: true });
      // An alley: the midpoint of the district's shortest street edge is as tight as its streets get.
      let glidePos = { x: c.x, y: (roof?.y ?? 20) + 45, z: c.z };
      add({ name: `district-${d.id}-glide`, group: 'views', kind: 'glide', district: d.id, pos: glidePos, air: true });
    }
    // Covered volumes (decks you can walk under: no rain, no sky light).
    (G.world.covers ?? []).forEach((c, i) => {
      const p = { x: (c.minX + c.maxX) / 2, y: c.minY + 1, z: (c.minZ + c.maxZ) / 2 };
      for (const f of [0.2, 0.5, 0.8]) { const q = { x: c.minX + (c.maxX - c.minX) * f, y: c.maxY - 1.5, z: p.z }; q.y = ground(q, 0); add({ name: `cover-${i}-${Math.round(f * 100)}`, group: 'city', kind: 'covered', pos: q, enemies: f === 0.5 }); }
    });
    // Every named site.
    const named = { ...M.sites, ...M.regionSites };
    for (const [id, s] of Object.entries(named)) { const p = P(s); if (p && !pocketSpan(p)) add({ name: `site-${id}`, group: 'sites', kind: s.kind ?? 'site', pos: p, yaw: s.yaw }); }
    // Every night: its sites, the middle of each fight (with its squad's first wave), its rooms.
    for (const n of M.nights) {
      const site = (id) => (typeof id === 'object' ? id : n.sites?.[id] ?? named[id] ?? null);
      for (const [id, s] of Object.entries(n.sites ?? {})) { const p = P(s); if (p && !pocketSpan(p)) add({ name: `${n.id}-site-${id}`, group: 'sites', kind: 'story', night: n.id, pos: p, yaw: s.yaw }); }
      for (const [id, f] of Object.entries(n.fights ?? {})) { const p = P(site(f.site)); if (p && !pocketSpan(p)) add({ name: `${n.id}-fight-${id}`, group: 'fights', kind: 'fight', night: n.id, pos: p, enemies: true }); }
      for (const [id, r] of Object.entries(n.rooms ?? {})) {
        const p = P(site(r.entry)) ?? P(site(r.site));
        const squad = (r.squad ?? []).map((g) => ({ type: g.type, ...g.route.points[0] }));
        if (p) add({ name: `${n.id}-stealth-${id}`, group: 'fights', kind: 'stealth', night: n.id, pos: p, look: P(site(r.site)), squad });
      }
    }
    // Interior rooms of the core city (walk in through a door).
    for (const [id, r] of Object.entries(M.rooms)) {
      const b = r.bounds;
      add({ name: `interior-${id}`, group: 'interiors', kind: 'room', indoors: true, pos: { x: r.fight.x, y: r.fight.y, z: r.fight.z }, enemies: true });
      add({ name: `interior-${id}-corner`, group: 'interiors', kind: 'room', indoors: true, pos: { x: b.minX + 3, y: b.minY + 0.15, z: b.minZ + 3 }, yaw: Math.atan2(b.maxX - b.minX, b.maxZ - b.minZ) + Math.PI });
    }
    // Pockets (Manor, Batcave, Wayne Tower): the middle of every room and area.
    for (const [id, p] of Object.entries(M.pockets)) {
      const o = p.origin;
      for (const r of Object.values(p.rooms ?? {})) add({ name: `pocket-${id}-${r.id}`, group: 'interiors', kind: 'pocket', pocket: id, indoors: true, pos: { x: o.x + (r.x0 + r.x1) / 2, y: o.y + (r.y ?? 0) + 0.2, z: o.z + (r.z0 + r.z1) / 2 } });
      for (const [aid, a] of Object.entries(p.areas ?? {})) add({ name: `pocket-${id}-area-${aid}`, group: 'interiors', kind: 'pocket', pocket: id, indoors: true, pos: { x: o.x + (a.x0 + a.x1) / 2, y: o.y + a.y + 0.2, z: o.z + (a.z0 + a.z1) / 2 } });
      if (p.spawn) add({ name: `pocket-${id}-spawn`, group: 'interiors', kind: 'pocket', pocket: id, indoors: true, pos: { x: o.x + p.spawn.x, y: o.y + (p.spawn.y ?? 0) + 0.2, z: o.z + p.spawn.z }, yaw: p.spawn.yaw });
    }
    // Bosses: every def the director knows (campaign and open world), every phase.
    for (const d of G.bosses.defs) {
      const p = P(G.bosses.siteOf(d.id));
      if (p) scenes.push({ name: `boss-${d.id}`, group: 'bosses', kind: 'boss', boss: d.id, phases: d.phases.map((x) => x.id), pos: p });
    }
    return scenes;
  };

  // ---- conditions and posing ----
  da.cond = (c) => {
    G.world.clock.pin(c.t, { id: 'audit' });
    G.world.weather.pin(c.wx, { id: 'audit', snap: true });
    // The street's steady state under this weather (wet or dry, snowed in or melted), so one
    // condition's snow cover never lingers into the next: four minutes of weather, no clock.
    if (!window.__daNoFF) for (let i = 0; i < 240; i++) G.world.weather.update(1);
  };
  da.release = () => { if (da.hold) cancelAnimationFrame(da.hold); da.hold = null; };
  // Hero on the spot (held there every frame so nothing walks, falls or gets pushed), camera
  // behind. yaw null: face the most open direction (the longest free line at chest height).
  da.place = (s) => {
    da.release();
    const p = { ...s.pos };
    if (!s.air) p.y = ground(p);
    let yaw = s.yaw;
    const col = G.world.collision;
    if (s.look) yaw = Math.atan2(s.look.x - p.x, s.look.z - p.z);
    if (yaw == null) {
      // The most open direction: longest free line ahead at chest height, with room behind for
      // the camera (collision.raycast; directions are unit vectors). A site on a door sill or
      // against a wall has no such direction: step 3 m out along the best one and look again.
      const open = () => {
        let best = 0, bd = -1;
        const o = { x: p.x, y: p.y + 1.3, z: p.z };
        for (let k = 0; k < 12; k++) {
          const a = (k * Math.PI) / 6, dx = Math.sin(a), dz = Math.cos(a);
          const ahead = col.raycast(o, { x: dx, y: 0, z: dz }, 40)?.t ?? 40;
          const back = col.raycast(o, { x: -dx, y: 0, z: -dz }, 6)?.t ?? 6;
          const free = Math.min(ahead, 40) * (back < 5.5 ? 0.2 : 1);
          if (free > bd + 0.5) { bd = free; best = a; }
        }
        return { best, bd };
      };
      let o1 = open();
      if (o1.bd < 8 && !s.air) {
        const q = { x: p.x + Math.sin(o1.best) * 3, y: p.y, z: p.z + Math.cos(o1.best) * 3 };
        const g = col.groundBelow(q.x, q.y + 1.5, q.z, 0.3);
        if (Number.isFinite(g) && Math.abs(g - p.y) < 1.2) { p.x = q.x; p.z = q.z; p.y = g; o1 = open(); }
      }
      yaw = o1.best;
    }
    const pitch = s.air ? 0.45 : s.pitch ?? 0.16;
    da.pose = { p, yaw };
    const hold = () => { G.hero.teleport(p, yaw); if (s.air) G.hero.vel?.set?.(0, 0, 0); da.hold = requestAnimationFrame(hold); };
    hold();
    G.follow.snapBehind(yaw, pitch);
    return { p, yaw };
  };
  da.clearEnemies = () => {
    for (const e of da.spawned) { try { G.despawn ? G.despawn(e) : e.remove(); } catch { /* gone */ } }
    da.spawned = [];
    try { G.combat.setEnemies([]); } catch { /* none */ }
  };
  // Goons in front of the hero (or a room's squad on its own marks), asleep: they stand, they do
  // not swing, so the frame is the same every run.
  da.spawnEnemies = (s) => {
    da.clearEnemies();
    const { p, yaw } = da.pose;
    const list = s.squad?.length ? s.squad.map((g) => ({ type: g.type, x: g.x, y: g.y, z: g.z }))
      : [['grunt', -1.6, 5.5], ['knife', 1.8, 6.5], ['brute', 0.2, 9]].map(([type, sx, f]) => ({ type, x: p.x + Math.sin(yaw) * f + Math.cos(yaw) * sx, y: p.y, z: p.z + Math.cos(yaw) * f - Math.sin(yaw) * sx }));
    for (const g of list) {
      try {
        const q = { x: g.x, y: g.y, z: g.z };
        if (!s.squad?.length) q.y = ground({ ...q, y: p.y + 0.5 }, 1);
        if (Math.abs(q.y - p.y) > 3 && !s.squad?.length) continue;
        const e = G.spawn(g.type, q);
        e.aware = false;
        da.spawned.push(e);
      } catch { /* a type this build does not have */ }
    }
    try { G.combat.setEnemies(da.spawned); } catch { /* none */ }
    return da.spawned.length;
  };
  // Keep goons asleep and on their marks while the shot settles.
  da.freezeEnemies = () => { for (const e of da.spawned) { e.aware = false; e.state = 'idle'; e.t = 0; } };

  // ---- screen boxes ----
  const V = G.camera.position.clone();
  const boxOf = (cam, rect, pos, height, radius) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
    for (let i = 0; i < 8; i++) {
      V.set(pos.x + (i & 1 ? radius : -radius), pos.y + (i & 2 ? height : 0), pos.z + (i & 4 ? radius : -radius));
      V.applyMatrix4(cam.matrixWorldInverse);
      if (V.z > -0.1) { behind = true; break; }
      V.applyMatrix4(cam.projectionMatrix);
      const sx = (rect[0] + (V.x * 0.5 + 0.5) * rect[2]) * innerWidth, sy = (1 - (rect[1] + (V.y * 0.5 + 0.5) * rect[3])) * innerHeight;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    if (behind) return null;
    // Behind a wall, a post or a parapet from this camera: not a figure the player is asked to read.
    const c = cam.position, tx = pos.x - c.x, ty = pos.y + height * 0.6 - c.y, tz = pos.z - c.z;
    const d = Math.hypot(tx, ty, tz);
    if (d > 1.2 && G.world.collision.raycast({ x: c.x, y: c.y, z: c.z }, { x: tx / d, y: ty / d, z: tz / d }, d - 0.6)) return null;
    return { box: [x0, y0, x1, y1], dist: +d.toFixed(1) };
  };
  // Every character worth reading in the current frame, per view.
  da.boxes = () => {
    const views = G.split?.split ? G.split.views.map((v) => ({ cam: v.camera, rect: v.rect ?? v.ink?.rect ?? [0, 0, 1, 1] })) : [{ cam: G.camera, rect: [0, 0, 1, 1] }];
    const outB = [];
    views.forEach((v, vi) => {
      v.cam.updateMatrixWorld();
      for (const pl of G.players ?? [{ hero: G.hero }]) {
        const h = pl.hero;
        if (!h?.pos) continue;
        const b = boxOf(v.cam, v.rect, h.pos, h.HEIGHT ?? 1.85, 0.42);
        if (b) outB.push({ kind: 'hero', view: vi, id: pl.kit?.id ?? 'hero', ...b });
      }
      for (const e of G.enemies ?? []) {
        if (!e.alive || e.ch?.root?.visible === false) continue;
        const b = boxOf(v.cam, v.rect, e.pos, 1.85 * (e.scale ?? 1), 0.45 * (e.scale ?? 1));
        if (b && b.dist < 30) outB.push({ kind: e.type === 'boss' || e.type === 'joker' ? 'boss' : 'enemy', view: vi, id: e.type, ...b });
      }
      const head = G.bosses.active ? G.bosses.controller?.handle?.actor : null;
      if (head?.pos && !(G.enemies ?? []).some((e) => e === head.e)) { const b = boxOf(v.cam, v.rect, head.pos, 2, 0.5); if (b && b.dist < 40) outB.push({ kind: 'boss', view: vi, id: G.bosses.current?.id, ...b }); }
    });
    return outB;
  };
  // The camera cannot see the hero it follows (it is inside a wall, or a pillar stands between):
  // such a frame says nothing about the lighting and is reported as not measured.
  da.camBlocked = () => {
    if (G.split?.split || G.vehicles?.active || G.cinematic?.active) return false;
    const c = G.camera.position, h = G.hero.pos, col = G.world.collision;
    // Both the line to the chest and the line to the head are cut, well short of the hero (a hit
    // at the hero's own feet is the roof or the step they stand on).
    const cut = (up) => {
      const tx = h.x - c.x, ty = h.y + up - c.y, tz = h.z - c.z, d = Math.hypot(tx, ty, tz);
      if (d < 2.5) return false;
      const hit = col.raycast({ x: c.x, y: c.y, z: c.z }, { x: tx / d, y: ty / d, z: tz / d }, d - 0.5);
      if (hit && hit.t < d - 1.5) return true;
      // A camera inside a solid box sees no hit on the way out: look back from the hero as well.
      const back = col.raycast({ x: h.x, y: h.y + up, z: h.z }, { x: -tx / d, y: -ty / d, z: -tz / d }, d - 0.2);
      return !!back && back.t > 1.5;
    };
    return cut(1.1) && cut(1.75);
  };
  da.viewRects = () => (G.split?.split ? G.split.views.map((v) => { const r = v.rect ?? [0, 0, 1, 1]; return [r[0], 1 - r[1] - r[3], r[2], r[3]]; }) : [[0, 0, 1, 1]]);
  da.clearTalk = () => { G.cinematic?.active && G.cinematic.skip(); G.comic?.playing && G.comic.skip(); G.radio?.playing && G.radio.skip?.(); return !!(G.comic?.playing || G.cinematic?.active || G.flow?.mode !== 'play'); };
  da.info = () => ({ hour: +G.world.clock.hour.toFixed(2), weather: G.world.weather.state, flash: G.world.flash, indoors: !!G.interiors?.inside, lights: G.world.lightPool?.active ?? null, fps: G.state.fps });
  return true;
}

// ---------------------------------------------------------------------------------- capture
// A screenshot, tried again when a busy machine times one out.
async function snap(page) {
  for (let i = 0; ; i++) {
    try { return await page.screenshot({ type: 'png', timeout: 60000 }); } catch (e) { if (i >= 2) throw e; await page.waitForTimeout(1500); }
  }
}
async function shoot(page, { hud = false } = {}) {
  // No lightning in the measured frame (it only ever brightens).
  for (let i = 0, clear = 0; i < 40 && clear < 3; i++) { clear = (await page.evaluate(() => window.__game.world.flash > 0 || window.__game.ink.uniforms.uFlash.value > 0)) ? 0 : clear + 1; if (clear < 3) await page.waitForTimeout(120); }
  const boxes = await page.evaluate(() => { window.__da.freezeEnemies(); return { boxes: window.__da.boxes(), rects: window.__da.viewRects(), info: window.__da.info(), blocked: window.__da.camBlocked() }; });
  // EVAL=<js expression>: evaluated in the page before each shot and printed (debugging a scene).
  if (process.env.EVAL) console.log('  eval:', JSON.stringify(await page.evaluate(process.env.EVAL)));
  const res = { ...boxes };
  await page.evaluate(() => document.documentElement.classList.add('da-nohud'));
  res.clean = await snap(page);
  await page.evaluate(() => document.documentElement.classList.remove('da-nohud'));
  if (hud) res.hud = await snap(page);
  return res;
}

async function measure(shot, scene, tier, cond, rows, extra = {}) {
  const img = await decode(shot.clean);
  const name = `${scene.name}${extra.suffix ?? ''}`;
  const row = { name, group: scene.group, kind: scene.kind, tier, cond: cond ? condName(cond) : extra.cond ?? '-', moody: !!(scene.moody || extra.moody), ...extra.fields };
  const sx = img.w / W, sy = img.h / H;
  shot.rects.forEach((rect, vi) => {
    const fs = frameStats(img, rect);
    const tag = shot.rects.length > 1 ? `v${vi}` : '';
    const chars = shot.boxes.filter((b) => b.view === vi).map((b) => ({ kind: b.kind, id: b.id, dist: b.dist, r: readability(img, [b.box[0] * sx, b.box[1] * sy, b.box[2] * sx, b.box[3] * sy]) })).filter((c) => c.r);
    const hero = chars.filter((c) => c.kind === 'hero').sort((a, b) => a.dist - b.dist)[0] ?? null;
    const foes = chars.filter((c) => c.kind !== 'hero');
    // Real fights and bosses: the worst figure counts (with three or more in view the second
    // worst: one goon half behind a prop with no collision box is not a lighting problem). Goons
    // the audit itself stood in front of the hero answer a different question, "does a goon read
    // in this light here", so the best lit of them counts.
    const ranked = [...foes].sort((a, b) => a.r.score - b.r.score);
    const foeMin = !ranked.length ? null : scene.enemies && !scene.squad ? ranked[ranked.length - 1] : ranked[ranked.length >= 3 ? 1 : 0];
    Object.assign(row, {
      [`mean${tag}`]: fs.mean, [`median${tag}`]: fs.median, [`black${tag}`]: fs.black, [`p10${tag}`]: fs.p10, [`p90${tag}`]: fs.p90,
      [`hero${tag}`]: hero ? hero.r.score : null, [`heroParts${tag}`]: hero ? hero.r : null,
      [`enemy${tag}`]: foeMin ? foeMin.r.score : null, [`enemyWorst${tag}`]: foeMin ? { id: foeMin.id, dist: foeMin.dist, ...foeMin.r } : null, [`enemies${tag}`]: foes.length,
    });
  });
  if (shot.hud) { const h = frameStats(await decode(shot.hud)); row.hudMean = h.mean; row.hudMedian = h.median; row.hudBlack = h.black; }
  row.info = shot.info;
  // Also not a measurement: a single follow view in which the hero cannot be seen at all and most
  // of the frame is one flat shape (the hero stands inside a wall's thickness, or the camera does).
  const lost = shot.rects.length === 1 && !row.noHero && scene.kind !== 'title' && scene.kind !== 'cinematic' && scene.kind !== 'drive' && row.hero == null && (row.black > 0.6 || row.p90 - row.p10 < 6);
  row.blocked = !!shot.blocked || lost;
  row.fail = verdict(row, shot.rects.length);
  rows.push(row);
  const keep = KEEP === 'all' || (KEEP === 'flagged' && row.fail.length);
  if (keep) {
    const dir = join(out, 'frames', tier);
    mkdirSync(dir, { recursive: true });
    row.frame = `frames/${tier}/${name}${cond ? `@${condName(cond)}` : ''}.jpg`;
    await sharp(shot.clean).resize(960).jpeg({ quality: 78 }).toFile(join(out, row.frame));
    if (shot.hud && extra.keepHud) await sharp(shot.hud).resize(960).jpeg({ quality: 78 }).toFile(join(out, row.frame.replace(/\.jpg$/, '.hud.jpg')));
  }
  return row;
}

function verdict(row, views = 1) {
  const f = [];
  if (row.blocked) return f; // the camera is inside geometry: not a lighting measurement
  for (let vi = 0; vi < views; vi++) {
    const t = views > 1 ? `v${vi}` : '';
    const L = row.moody ? { mean: LIMITS.moodyMeanMin, median: LIMITS.moodyMedianMin, black: LIMITS.moodyBlackMax } : { mean: LIMITS.meanMin, median: LIMITS.medianMin, black: LIMITS.blackMax };
    if (row[`mean${t}`] < L.mean) f.push(`mean${t} ${row[`mean${t}`]} < ${L.mean}`);
    if (row[`median${t}`] < L.median) f.push(`median${t} ${row[`median${t}`]} < ${L.median}`);
    if (row[`black${t}`] > L.black) f.push(`black${t} ${row[`black${t}`]} > ${L.black}`);
    if (!row.noHero && row[`hero${t}`] != null && row[`hero${t}`] < LIMITS.heroMin) f.push(`hero${t} ${row[`hero${t}`]} < ${LIMITS.heroMin}`);
    if (row[`enemy${t}`] != null && row[`enemy${t}`] < LIMITS.enemyMin) f.push(`enemy${t} ${row[`enemy${t}`]} < ${LIMITS.enemyMin}`);
  }
  return f;
}

// ---------------------------------------------------------------------------------- a page
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webm': 'audio/webm', '.opus': 'audio/ogg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.ktx2': 'image/ktx2', '.bin': 'application/octet-stream' };
async function newPage(browser) {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  if (DIST) {
    await page.route((url) => url.origin === 'http://gotham.audit', (route) => {
      const rel = decodeURIComponent(new URL(route.request().url()).pathname);
      let file = normalize(join(DIST, rel));
      if (!file.startsWith(DIST)) return route.abort();
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    });
  }
  return page;
}
async function openPage(browser, tier, { extra = '', errors } = {}) {
  const page = await newPage(browser);
  page.on('pageerror', (e) => errors.push(`${tier}: ${String(e).slice(0, 200)}`));
  await page.goto(`${base}?at=start&god=1&dynres=0&q=${tier}&time=${NIGHT_T}&weather=storm${BRIGHT}${extra}`);
  await page.waitForFunction(() => window.__game?.hero && window.__game.state?.phase === 'play', null, { timeout: 240000, polling: 500 });
  await page.evaluate(installPageHelpers);
  for (let i = 0, clear = 0; i < 150 && clear < 6; i++) { clear = (await page.evaluate(() => window.__da.clearTalk())) ? 0 : clear + 1; await page.waitForTimeout(200); }
  const counts = await page.evaluate(() => window.__da.load());
  if (Object.values(counts).some((v) => !v)) console.log(`  (missing game data: ${JSON.stringify(counts)}; the page must run with dev tools, ?god=1)`);
  return page;
}

const settle = (page, ms = 650) => page.waitForTimeout(ms);

async function runPlaced(page, tier, scenes, conds, rows, { hud = false, log = true } = {}) {
  for (const cond of conds) {
    await page.evaluate((c) => window.__da.cond(c), cond);
    await settle(page, 500);
    for (const s of scenes) {
      await page.evaluate((s) => { window.__da.clearEnemies(); window.__da.place(s); }, s);
      await settle(page, s.indoors ? 900 : 650);
      if (s.enemies || s.squad) { await page.evaluate((s) => { window.__da.place(s); return window.__da.spawnEnemies(s); }, s); await settle(page, 700); }
      const shot = await shoot(page, { hud });
      const row = await measure(shot, s, tier, cond, rows, { keepHud: hud });
      if (log) logRow(row);
    }
  }
  await page.evaluate(() => { window.__da.clearEnemies(); window.__da.release(); });
}

// ---------------------------------------------------------------------------------- groups
const pick = (row, k) => row[k] ?? row[`${k}v0`] ?? '-';
const logRow = (row) => console.log(`${row.tier.padEnd(6)} ${String(row.cond).padEnd(11)} ${row.name.padEnd(40)} mean ${String(pick(row, 'mean')).padStart(5)} med ${String(pick(row, 'median')).padStart(5)} black ${String(pick(row, 'black')).padStart(5)} hero ${String(pick(row, 'hero')).padStart(5)} enemy ${String(pick(row, 'enemy')).padStart(5)} ${row.blocked ? '(camera blocked: not measured)' : row.fail.length ? 'FLAG ' + row.fail.join('; ') : ''}`);

// Pockets (Manor, Batcave, Wayne Tower): entered the way the game enters them, then every room.
async function runPockets(page, tier, scenes, rows) {
  const ids = [...new Set(scenes.map((s) => s.pocket))];
  for (const id of ids) {
    const ok = await page.evaluate(async (id) => {
      const G = window.__game;
      try { await G.bruce.enter(id, G.bruce.POCKETS[id].spawn, { instant: true }); return true; } catch (e) { return String(e); }
    }, id);
    if (ok !== true) { console.log(`  pocket ${id}: ${ok}`); continue; }
    await settle(page, 2500);
    for (const s of scenes.filter((x) => x.pocket === id)) {
      await page.evaluate((s) => window.__da.place(s), s);
      await settle(page, 900);
      logRow(await measure(await shoot(page, { hud: true }), s, tier, null, rows, { cond: 'indoors' }));
    }
    await page.evaluate(() => window.__da.release());
  }
}

// Bosses: each def the director has, started the way a story step starts it (minus the comic),
// then pushed through its phases with the director's own debugPhase().
async function runBosses(page, tier, scenes, rows) {
  for (const s of scenes) {
    const started = await page.evaluate(async (s) => {
      const G = window.__game;
      window.__da.release(); window.__da.clearEnemies();
      try { G.vehicles?.active && G.vehicles.exit(); } catch { /* on foot */ }
      const g = G.world.collision.groundBelow(s.pos.x + 4, s.pos.y + 3, s.pos.z + 4, 0.3);
      G.hero.teleport({ x: s.pos.x + 4, y: Number.isFinite(g) ? g : s.pos.y, z: s.pos.z + 4 });
      try { await Promise.race([G.bosses.begin(s.boss, {}), new Promise((r) => setTimeout(r, 8000))]); return G.bosses.active; } catch (e) { return String(e); }
    }, s);
    if (started !== true) { console.log(`  boss ${s.boss}: did not start (${started})`); await page.evaluate(() => { try { window.__game.bosses.abort(); } catch { /* none */ } }); continue; }
    for (let ph = 0; ph < s.phases.length; ph++) {
      if (ph > 0) await page.evaluate(() => window.__game.bosses.debugPhase());
      await settle(page, 2600);
      // Camera toward the boss when it has a body in the world.
      await page.evaluate(() => {
        const G = window.__game, h = G.hero.pos;
        const foe = G.bosses.controller?.handle?.actor?.pos ?? (G.enemies ?? []).filter((e) => e.alive).sort((a, b) => Math.hypot(a.pos.x - h.x, a.pos.z - h.z) - Math.hypot(b.pos.x - h.x, b.pos.z - h.z))[0]?.pos;
        if (foe) G.follow.snapBehind(Math.atan2(foe.x - h.x, foe.z - h.z), 0.14);
        window.__da.clearTalk();
      });
      await settle(page, 500);
      logRow(await measure(await shoot(page, { hud: true }), s, tier, null, rows, { suffix: `-p${ph + 1}-${s.phases[ph]}`, cond: 'story', moody: true, keepHud: true }));
    }
    await page.evaluate(() => { try { window.__game.bosses.abort(); } catch { /* none */ } window.__da.clearEnemies(); try { window.__game.flow.story?.viewFx?.clear(); } catch { /* none */ } });
    await settle(page, 400);
  }
}

// Per-view screen effects (viewFx.js: fear, cold, spores, heat) at full strength, detective
// vision, an in-engine cinematic, driving and gliding.
async function runViews(page, tier, scenes, rows) {
  const streets = scenes.filter((s) => s.kind === 'street');
  const spots = streets.filter((_, i, a) => (SET !== 'fast' ? i % 4 === 0 : i === a.length - 1));
  await page.evaluate((c) => window.__da.cond(c), DARKEST);
  for (const s of spots) {
    await page.evaluate((s) => { window.__da.clearEnemies(); window.__da.place(s); }, s);
    await settle(page, 700);
    await page.evaluate((s) => { window.__da.place(s); window.__da.spawnEnemies(s); }, s);
    await settle(page, 700);
    for (const kind of ['fear', 'cold', 'spore', 'heat']) {
      const ok = await page.evaluate((kind) => { const G = window.__game, fx = G.flow.story?.viewFx; if (!fx) return false; fx.distort(G.players[0], 1, kind); return true; }, kind);
      if (!ok) break;
      await settle(page, 350);
      logRow(await measure(await shoot(page, { hud: true }), { ...s, name: `fx-${kind}-${s.district}`, group: 'fx', kind: 'viewFx' }, tier, DARKEST, rows, { moody: true, keepHud: true }));
    }
    await page.evaluate(() => window.__game.flow.story?.viewFx?.clear());
    // Detective vision.
    await page.evaluate(() => { window.__game.state.detectiveOn = true; });
    await settle(page, 900);
    logRow(await measure(await shoot(page, { hud: true }), { ...s, name: `detective-${s.district}`, group: 'fx', kind: 'detective' }, tier, DARKEST, rows, {}));
    await page.evaluate(() => { window.__game.state.detectiveOn = false; window.__da.clearEnemies(); });
    await settle(page, 500);
    // A cinematic orbit around the spot (the letterboxed in-engine camera).
    const cin = await page.evaluate(() => { const G = window.__game, p = G.hero.pos; return G.cinematic.orbit({ x: p.x, y: p.y + 1.2, z: p.z }, 9, 3.2, 8, {}); });
    if (cin !== false) {
      await settle(page, 1800);
      logRow(await measure(await shoot(page), { ...s, name: `cinematic-${s.district}`, group: 'views', kind: 'cinematic' }, tier, DARKEST, rows, {}));
      await page.evaluate(() => window.__game.cinematic.skip());
      await settle(page, 300);
    }
    // Driving: the Batmobile parked here, hero inside (the chase camera).
    const drove = await page.evaluate((s) => {
      const G = window.__game, v = G.vehicles;
      window.__da.release();
      try { v.park({ x: s.pos.x, y: s.pos.y, z: s.pos.z, yaw: window.__da.pose.yaw }, { slide: false }); v.enter(v.batmobile); return !!v.active; } catch (e) { return String(e); }
    }, s);
    if (drove === true) { await settle(page, 1600); logRow(await measure(await shoot(page, { hud: true }), { ...s, name: `drive-${s.district}`, group: 'views', kind: 'drive' }, tier, DARKEST, rows, { fields: { noHero: true } })); }
    await page.evaluate(() => { try { window.__game.vehicles.exit(); } catch { /* on foot */ } });
    await settle(page, 400);
  }
  // Gliding: high over each district, camera pitched down at the streets.
  const glides = scenes.filter((s) => s.kind === 'glide').filter((_, i) => (SET !== 'fast' ? true : i % 8 === 0));
  await runPlaced(page, tier, glides, [DARKEST], rows);
}

// The campaign itself: every step of every night that has a place, entered through the flow's own
// jump (dev tools), so each beat's pinned hour and weather, its enemies, its boss and whatever a
// step type puts on screen (fear gas, cold, a blackout) are what the player gets. One page per
// night. New nights and new steps are picked up from the campaign's registry.
const TALK_ONLY = ['cutscene', 'credits', 'radio', 'life', 'wait', 'nightEnd'];
async function runStory(browser, tier, rows, errors) {
  const probe = await openPage(browser, tier, { errors });
  const nights = await probe.evaluate(() => (window.__da.data().nights).map((n) => ({ id: n.id, steps: window.__da.data().stepsOf(n).map((s) => ({ id: s.id, type: s.type ?? 'reach' })) })));
  await probe.close();
  for (const n of nights) {
    const full = (st) => `${n.id}-step-${st.id}`;
    let steps = n.steps.filter((s) => !TALK_ONLY.includes(s.type));
    if (SET === 'fast') steps = steps.filter((s) => ['boss', 'fear'].includes(s.type));
    if (ONLY && !n.id.includes(ONLY)) steps = steps.filter((s) => full(s).includes(ONLY));
    if (!steps.length) continue;
    const page = await newPage(browser);
    page.on('pageerror', (e) => errors.push(`${tier} ${n.id}: ${String(e).slice(0, 200)}`));
    try {
      await page.goto(`${base}?new=1&night=${n.id}&god=1&dynres=0&q=${tier}${BRIGHT}`);
      await page.waitForFunction(() => window.__game?.hero && window.__game.state?.phase === 'play' && window.__game.gadgets, null, { timeout: 240000, polling: 500 });
      await page.evaluate(installPageHelpers);
      for (const st of steps) {
        const ok = await page.evaluate((id) => {
          const G = window.__game;
          try { G.vehicles?.active && G.vehicles.exit(); G.batwing?.active && G.batwing.exit(); G.bosses.active && G.bosses.abort(); G.jump(id); return true; } catch (e) { return String(e).slice(0, 120); }
        }, st.id);
        if (ok !== true) { console.log(`  ${n.id} ${st.id}: ${ok}`); continue; }
        // Read past the step's comic, radio and cinematic; then stand by its marker.
        for (let i = 0, clear = 0; i < 40 && clear < 4; i++) { clear = (await page.evaluate(() => window.__da.clearTalk())) ? 0 : clear + 1; await page.waitForTimeout(150); }
        await page.evaluate(() => {
          const G = window.__game, s = G.flow.objectives.step, t = G.flow.target ?? (s?.site ? G.flow.story?.site?.(s.site) : null);
          if (t && Number.isFinite(t.x) && !G.vehicles?.active && Math.hypot(t.x - G.hero.pos.x, t.z - G.hero.pos.z) > 6) { try { G.teleport({ x: t.x + 2.5, y: t.y ?? 0, z: t.z + 2.5 }); } catch { /* no ground there */ } }
        });
        await settle(page, st.type === 'boss' ? 4200 : 2200);
        await page.evaluate(() => {
          window.__da.clearTalk();
          const G = window.__game, h = G.hero.pos;
          const near = (G.enemies ?? []).filter((e) => e.alive).sort((a, b) => Math.hypot(a.pos.x - h.x, a.pos.z - h.z) - Math.hypot(b.pos.x - h.x, b.pos.z - h.z))[0]?.pos;
          const foe = (G.bosses.active ? G.bosses.controller?.handle?.actor?.pos : null) ?? near ?? G.flow.target;
          if (foe && Number.isFinite(foe.x) && Math.hypot(foe.x - h.x, foe.z - h.z) > 1.5) G.follow.snapBehind(Math.atan2(foe.x - h.x, foe.z - h.z), 0.14);
        });
        await settle(page, 600);
        const moody = ['boss', 'fear'].includes(st.type);
        logRow(await measure(await shoot(page, { hud: true }), { name: full(st), group: 'story', kind: st.type }, tier, null, rows, { cond: 'story', moody, keepHud: moody }));
      }
    } catch (e) { errors.push(`${tier} ${n.id}: story walk stopped: ${String(e).slice(0, 200)}`); console.log(String(e).slice(0, 300)); }
    await page.close();
  }
}

// Split screen: a second local hero (a scripted bot) and the same streets, each half measured.
async function runSplit(browser, tier, rows, errors) {
  const page = await openPage(browser, tier, { extra: '&p2=bot&p2kit=robin', errors });
  await page.waitForFunction(() => window.__game.players?.length === 2 && window.__game.split?.split, null, { timeout: 30000 }).catch(() => console.log('  split: no second view'));
  let scenes = (await page.evaluate(() => window.__da.discover())).filter((s) => s.kind === 'street' || s.kind === 'covered');
  scenes = scenes.filter((_, i) => (SET === 'fast' ? i % 9 === 0 : i % 3 === 0)).map((s) => ({ ...s, name: `split-${s.name}`, group: 'split', enemies: false }));
  if (ONLY) scenes = scenes.filter((s) => s.name.includes(ONLY));
  for (const cond of SET === 'fast' ? [DARKEST] : [DARKEST, { t: NIGHT_T, wx: 'storm' }]) {
    await page.evaluate((c) => window.__da.cond(c), cond);
    for (const s of scenes) {
      await page.evaluate((s) => { window.__da.place(s); try { window.__game.flow.bringAlong(); } catch { /* alone */ } }, s);
      await settle(page, 1500);
      logRow(await measure(await shoot(page, { hud: true }), s, tier, cond, rows, {}));
    }
  }
  await page.close();
}

// The title screen (the orbiting camera behind the main menu).
async function runTitle(browser, tier, rows, errors) {
  const page = await newPage(browser);
  page.on('pageerror', (e) => errors.push(`${tier} title: ${String(e).slice(0, 200)}`));
  await page.goto(`${base}?new=1&dynres=0&q=${tier}${BRIGHT}`);
  await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 60, null, { timeout: 240000, polling: 500 });
  await page.waitForTimeout(1500);
  const hud = await snap(page);
  await page.addStyleTag({ content: 'body > *:not(canvas){display:none!important}' });
  const clean = await snap(page);
  logRow(await measure({ clean, hud, boxes: [], rects: [[0, 0, 1, 1]], info: {} }, { name: 'title-screen', group: 'views', kind: 'title' }, tier, null, rows, { cond: 'title' }));
  await page.close();
}

async function auditTier(browser, tier, rows, errors) {
  const page = await openPage(browser, tier, { errors });
  let scenes = await page.evaluate(() => window.__da.discover());
  if (ONLY) scenes = scenes.filter((s) => s.name.includes(ONLY));
  const by = (g) => scenes.filter((s) => s.group === g);
  const thin = (list, n) => (SET === 'fast' ? list.filter((_, i) => i % n === 0) : list);
  console.log(`${tier}: ${scenes.length} scenes discovered (${[...new Set(scenes.map((s) => s.group))].map((g) => `${g} ${by(g).length}`).join(', ')})`);
  // A group that stops (a page error, a timeout) is reported and the others still run.
  const group = async (name, fn) => { if (!want(name)) return; try { await fn(); } catch (e) { errors.push(`${tier} ${name}: stopped: ${String(e).slice(0, 240)}`); console.log(`${tier} ${name}: ${String(e).slice(0, 240)}`); } };
  await group('city', async () => {
    await runPlaced(page, tier, thin(by('city'), 3), NIGHTS, rows);
    // The time-and-weather matrix on a spread of places: streets, roofs and a covered deck.
    const c = by('city'), pickN = (kind, n) => c.filter((s) => s.kind === kind).filter((_, i, a) => i % Math.max(1, Math.floor(a.length / n)) === 0).slice(0, n);
    await runPlaced(page, tier, SET === 'fast' ? [...pickN('street', 2), ...pickN('roof', 1)] : [...pickN('street', 4), ...pickN('roof', 2), ...pickN('covered', 1)], MATRIX, rows);
  });
  // Every named site on the first tier listed; every third on the others (the tiers differ by
  // lighting model, not by place).
  await group('sites', () => runPlaced(page, tier, SET === 'fast' ? thin(by('sites'), 20) : by('sites').filter((_, i) => tier === tiers[0] || i % 3 === 0), [DARKEST], rows));
  await group('fights', () => runPlaced(page, tier, thin(by('fights'), 12), [DARKEST], rows));
  await group('views', () => runViews(page, tier, [...by('city'), ...by('views')], rows));
  await group('bosses', () => runBosses(page, tier, thin(by('bosses'), 4), rows));
  await group('interiors', async () => {
    await runPlaced(page, tier, by('interiors').filter((s) => s.kind === 'room'), [DARKEST], rows, { hud: true });
    await runPockets(page, tier, thin(by('interiors').filter((s) => s.kind === 'pocket'), 3), rows);
  });
  await page.close().catch(() => {});
  if (!ONLY) await group('views', () => runTitle(browser, tier, rows, errors));
  await group('split', () => runSplit(browser, tier, rows, errors));
  // The story walk boots a page per night: the full audit only (the fast set has the bosses above).
  if (SET !== 'fast' || GROUPS?.includes('story')) await group('story', () => runStory(browser, tier, rows, errors));
}

// ---------------------------------------------------------------------------------- main
async function main() {
  mkdirSync(out, { recursive: true });
  // One browser, one page at a time, the tiers one after another: a game page costs about 2 GB of
  // memory, and the machine is shared. Never parallel.
  const browser = await chromium.launch({ channel: process.env.CHANNEL, headless: !process.env.HEADED, args: ['--mute-audio', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const rows = [], errors = [];
  const t0 = Date.now();
  try {
    for (const t of tiers) {
      try { await auditTier(browser, t, rows, errors); } catch (e) { errors.push(`${t}: audit stopped: ${String(e).slice(0, 300)}`); console.log(String(e)); }
      for (const c of browser.contexts()) for (const pg of c.pages()) await pg.close().catch(() => {}); // nothing left open between tiers
    }
  } finally { await browser.close(); }
  report(rows, errors, Date.now() - t0);
  const bad = rows.filter((r) => r.fail.length);
  if (process.env.CHECK && (bad.length || errors.length)) process.exit(1);
}

function report(rows, errors, ms) {
  rows.sort((a, b) => a.mean - b.mean);
  writeFileSync(join(out, 'audit.json'), JSON.stringify({ limits: LIMITS, tag: process.env.TAG ?? null, set: SET, tiers, seconds: Math.round(ms / 1000), errors, rows }, null, 1));
  const bad = rows.filter((r) => r.fail.length);
  const blocked = rows.filter((r) => r.blocked);
  const f = (v) => (v == null ? '-' : String(v));
  const line = (r) => `| ${r.name} | ${r.tier} | ${r.cond} | ${f(r.mean)} | ${f(r.median)} | ${f(r.black)} | ${f(r.hero)} | ${f(r.enemy)} | ${f(r.hudMean)} | ${r.fail.join('; ')} |`;
  const head = '| scene | tier | time-weather | mean | median | near-black | hero | enemy | mean with HUD | under the limit |\n|---|---|---|---|---|---|---|---|---|---|';
  const md = [
    `# Darkness audit${process.env.TAG ? ` (${process.env.TAG})` : ''}`,
    '',
    `${rows.length} frames, ${bad.length} under the limits, ${errors.length} page errors, ${Math.round(ms / 1000)} s. Set: ${SET}; tiers: ${tiers.join(', ')}.`,
    `Limits: ${JSON.stringify(LIMITS)}. Luma is sRGB-encoded, 0..100; near-black is the share of pixels under 8 %.`,
    '',
    '## Under the limits', '', head, ...bad.map(line), '',
    '## Not measured (the follow camera was inside or behind geometry at this spot)', '', blocked.map((r) => `${r.name} (${r.tier})`).join(', ') || 'none', '',
    '## Every frame, darkest first', '', head, ...rows.filter((r) => !r.blocked).map(line), '',
    errors.length ? `## Page errors\n\n${errors.map((e) => `- ${e}`).join('\n')}\n` : '',
  ].join('\n');
  writeFileSync(join(out, 'audit.md'), md);
  console.log(`\n${rows.length} frames, ${bad.length} under the limits, ${errors.length} page errors -> ${join(out, 'audit.md')}`);
  for (const r of bad.slice(0, 40)) console.log(`  ${r.tier.padEnd(6)} ${r.cond.padEnd(11)} ${r.name.padEnd(40)} ${r.fail.join('; ')}`);
}

await main();
