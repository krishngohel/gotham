// Contact sheets for the lazy animation packs, one PNG per category: each clip is a row of
// evenly spaced frames on the hero body (tools/pose-viewer.html?packs=...), so twisted arms,
// flipped knees, feet through the floor and frozen limbs are visible at a glance.
//   DEV_URL=http://localhost:5370 node tools/pack-sheets.mjs <outDir> [--packs=combat2,...]
//        [--cats=react_light,...] [--clips=A,B] [--frames=8] [--view=quarter] [--scale=0.6] [--per=6]
// Needs a vite dev server of this repo at DEV_URL. Renders on SwiftShader (CPU), one at a time.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { PACKS, PACK_CLIPS, DROPPED } from '../scripts/anim-packs.mjs';

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true]; }));
const outDir = args.find((a) => !a.startsWith('--')) ?? 'pack-sheets';
const packs = flags.packs ? flags.packs.split(',') : PACKS;
const cats = flags.cats ? new Set(flags.cats.split(',')) : null;
const only = flags.clips ? new Set(flags.clips.split(',')) : null;
const frames = Number(flags.frames ?? 8), scale = Number(flags.scale ?? 0.6), per = Number(flags.per ?? 6);
const view = flags.view ?? 'quarter';
mkdirSync(outDir, { recursive: true });

const base = process.env.DEV_URL ?? 'http://localhost:5370';
const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(`${base}/tools/pose-viewer.html?packs=${packs.join(',')}`);
  await page.waitForFunction(() => window.__viewer?.ready, null, { timeout: 180000 });
  const have = new Set(await page.evaluate(() => window.__viewer.clips));
  const groups = new Map();
  for (const [k, c] of Object.entries(PACK_CLIPS)) {
    if (!packs.includes(c.pack) || DROPPED[k] || (cats && !cats.has(c.cat)) || (only && !only.has(k))) continue;
    for (const name of c.mirror ? [k, k + '_M'] : [k]) {
      if (!have.has(name)) continue;
      const g = `${c.pack}-${c.cat}`;
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(name);
    }
  }
  for (const [g, names] of groups) {
    for (let part = 0; part * per < names.length; part++) {
      const rows = [];
      for (const clip of names.slice(part * per, part * per + per)) {
        const url = await page.evaluate((o) => window.__viewer.sheet(o), { clip, suit: 'm', views: [view], frames, from: 1e-3 });
        rows.push(await sharp(Buffer.from(url.split(',')[1], 'base64')).resize({ width: Math.round(190 * frames * scale) }).png().toBuffer());
      }
      const metas = await Promise.all(rows.map((r) => sharp(r).metadata()));
      const width = Math.max(...metas.map((m) => m.width)), height = metas.reduce((s, m) => s + m.height, 0);
      let y = 0;
      const composite = rows.map((input, i) => { const o = { input, top: y, left: 0 }; y += metas[i].height; return o; });
      const file = join(outDir, `${g}${names.length > per ? '-' + (part + 1) : ''}.png`);
      writeFileSync(file, await sharp({ create: { width, height, channels: 3, background: '#dfe3ea' } }).composite(composite).png().toBuffer());
      console.log('wrote', file, names.slice(part * per, part * per + per).join(' '));
    }
  }
} finally {
  if (errors.length) console.log('page errors:\n' + errors.join('\n'));
  await browser.close();
}
