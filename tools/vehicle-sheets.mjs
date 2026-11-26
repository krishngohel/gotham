// Contact sheets of every vehicle in the garage (tools/garage.html), rendered through the game's
// toon + ink pipeline: per vehicle one row of views (front 3/4, side, rear 3/4, high 3/4 and a
// street-distance shot ~25 m out), one JPEG sheet per catalog group, plus a JSON of draw calls and
// triangles per vehicle.
// usage: node tools/vehicle-sheets.mjs <baseUrl> <outDir> [id|group ...] [--state=<name>]
//   e.g. node tools/vehicle-sheets.mjs http://localhost:5360 docs/design/shots/vehicles
// --state=batmobile-modes shoots the Batmobile at pursuit, mid and battle, with strafe and canopy.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const [base, out] = args;
const state = (args.find((a) => a.startsWith('--state=')) ?? '').slice(8);
const only = args.slice(2).filter((a) => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const W = 480, H = 300;
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(`${base}/tools/garage.html`);
await page.waitForFunction(() => window.__garage, null, { timeout: 60000 });
const catalog = await page.evaluate(() => window.__garage.ids());
const groups = await page.evaluate(async () => {
  const { CATALOG } = await import('/src/vehicles/models/catalog.js');
  return Object.fromEntries(CATALOG.map((e) => [e.id, e.group]));
});

const VIEWS = [
  { name: 'front34', az: 0.75, el: 0.22, dist: 0.62 },
  { name: 'side', az: Math.PI / 2, el: 0.06, dist: 0.62 },
  { name: 'rear34', az: Math.PI - 0.7, el: 0.28, dist: 0.62 },
  { name: 'high', az: -0.6, el: 0.75, dist: 0.7 },
  { name: 'street', az: 0.5, el: 0.1, dist: 2.6 },
];

async function shoot(id, opts, views = VIEWS, steer = 0.3) {
  await page.evaluate(([id, o]) => window.__garage.show(id, o), [id, opts]);
  const tiles = [];
  let stats = null;
  for (const v of views) {
    stats = await page.evaluate(([v, steer]) => window.__garage.shot({ ...v, steer }), [v, steer]);
    tiles.push(await sharp(await page.screenshot({ type: 'png' })).resize(W, H).png().toBuffer());
  }
  return { tiles, stats };
}

async function sheet(rows, file, cols = VIEWS.length) {
  const comps = [];
  rows.forEach((tiles, r) => tiles.forEach((buf, c) => comps.push({ input: buf, left: c * W, top: r * H })));
  // (sharp resizes before it composites within one pipeline, so compose first, then shrink.)
  const full = await sharp({ create: { width: cols * W, height: rows.length * H, channels: 3, background: '#000' } }).composite(comps).png().toBuffer();
  await sharp(full).resize(Math.round(cols * W * 0.75)).jpeg({ quality: 78 }).toFile(file);
  console.log('wrote', file);
}

const allStats = {};
if (state === 'batmobile-modes') {
  const rows = [];
  for (const [label, c] of [
    ['pursuit', { mode: 0 }], ['half', { mode: 0.5 }], ['battle', { mode: 1, tyaw: 0.5, tpitch: 0.15 }],
    ['battle-strafe', { mode: 1, swivel: 1, tyaw: -1.2 }], ['eject', { mode: 0, canopy: 1, boost: true }],
  ]) {
    const { tiles } = await shoot('batmobile', { controls: { ...{ mode: 0, swivel: 0, tyaw: 0, tpitch: 0, canopy: 0, boost: false }, ...c } }, VIEWS.slice(0, 4).map((v) => ({ ...v, dist: v.dist * 0.72 })), 0);
    rows.push(tiles);
    console.log('batmobile', label);
  }
  await sheet(rows, `${out}/batmobile-modes.jpg`, 4);
} else if (state === 'damage') {
  const rows = [];
  for (const id of only.length ? only : ['sedan', 'taxi', 'police']) {
    const tiles = [];
    for (const d of [0, 1, 2, 3]) tiles.push(...(await shoot(id, { damage: d }, [VIEWS[0]])).tiles);
    rows.push(tiles);
  }
  await sheet(rows, `${out}/damage.jpg`, 4);
} else {
  const byGroup = {};
  for (const id of catalog) {
    if (only.length && !only.includes(id) && !only.includes(groups[id])) continue;
    const { tiles, stats } = await shoot(id, {});
    allStats[id] = stats;
    (byGroup[groups[id]] ??= []).push(tiles);
    console.log(id, JSON.stringify(stats));
  }
  for (const [g, rows] of Object.entries(byGroup)) {
    // Long groups split into sheets of 6 rows so each stays readable.
    for (let i = 0; i < rows.length; i += 6) await sheet(rows.slice(i, i + 6), `${out}/${g}${rows.length > 6 ? `-${i / 6 + 1}` : ''}.jpg`);
  }
  writeFileSync(`${out}/stats.json`, JSON.stringify(allStats, null, 1));
}
await browser.close();
