// [move] Dev probe for workstream L3: loads the game with ?moves=all and flies the wingsuit with a
// scripted pilot (dive, then pull up), printing the height and speed trace. usage:
//   node scripts/move-probe.mjs [baseUrl]
import { chromium } from 'playwright-core';
const base = process.argv[2] ?? 'http://localhost:5680/';
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}?at=toNeon&god=1&new=1&moves=all`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30, null, { timeout: 90000 });
await page.mouse.click(640, 400);
const out = await page.evaluate(() => { const h = window.__game.hero; return { moves: h.moves, pos: h.pos.toArray() }; });
console.log('moves', JSON.stringify(out.moves));
await page.evaluate(() => { const h = window.__game.hero; h.teleport({ x: 0, y: 120, z: 0 }); h.vel.set(0, 0, 18); h.grounded = false; h.setState('air'); h.airT = 0.5; });
await page.keyboard.down('Space');
const trace = [];
for (let i = 0; i < 24; i++) {
  if (i === 2) await page.keyboard.down('ShiftLeft');
  if (i === 10) { await page.keyboard.up('ShiftLeft'); await page.keyboard.down('KeyS'); }
  if (i === 18) await page.keyboard.up('KeyS');
  await page.waitForTimeout(250);
  trace.push(await page.evaluate(() => { const h = window.__game.hero; return [h.state, h.glide.wingsuit, +h.pos.y.toFixed(1), +h.glide.speed.toFixed(1), h.glide.stalled]; }));
}
console.log(trace.map((t) => t.join(' ')).join('\n'));
console.log('errors', errors);
await browser.close();
