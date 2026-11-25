// [story2] Checks candidate story sites against the live collision: for each { id, x, y, z } prints
// the ground under it from its own height (+3 m) and the highest surface (a roof) from 220 m, so a
// night's own sites can be written with a real walkable y. Usage:
//   BASE=http://localhost:5720/ node scripts/site-probe.mjs points.json
//   BASE=... NIGHT=n6 node scripts/site-probe.mjs        (every site a night uses)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5720/';
const file = process.argv[2];
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`${base}?new=1&night=${process.env.NIGHT ?? 'n2'}&god=1&q=potato`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 10, null, { timeout: 120000 });
const points = file ? JSON.parse(readFileSync(file, 'utf8')) : null;
const out = await page.evaluate(async (pts) => {
  const G = window.__game;
  const C = G.world?.collision ?? G.collision;
  // Wait for every district chunk under the points to be built.
  const list = pts ?? (() => {
    const n = G.flow.story.night, seen = new Map();
    for (const [id, s] of Object.entries(n.sites ?? {})) seen.set(id, { id, ...s });
    for (const s of G.flow.steps) for (const k of ['site', 'checkpoint']) { const v = s[k]; if (typeof v === 'string' && !seen.has(v)) { const p = G.flow.story.site(v); if (p) seen.set(v, { id: v, ...p }); } }
    return [...seen.values()];
  })();
  const res = [];
  for (const p of list) {
    G.teleport?.({ x: p.x, y: (p.y ?? 0) + 2, z: p.z });
    await new Promise((r) => setTimeout(r, 350));
    const own = C.groundBelow(p.x, (p.y ?? 0) + 3, p.z, 0.3);
    const top = C.groundBelow(p.x, 220, p.z, 0.3);
    res.push({ id: p.id, x: p.x, y: p.y ?? null, z: p.z, own: Number.isFinite(own) ? Math.round(own * 100) / 100 : null, top: Number.isFinite(top) ? Math.round(top * 100) / 100 : null });
  }
  return res;
}, points);
for (const r of out) console.log(`${String(r.id).padEnd(22)} (${r.x}, ${r.y}, ${r.z})  ground ${r.own}  roof ${r.top}${r.y != null && r.own != null && Math.abs(r.own - r.y) > 1.5 ? '   <-- MISMATCH' : ''}`);
await browser.close();
