// [wanted] Dev probe: boots the game, runs a snippet (env SNIP, a JS file) in the page and saves
// screenshots. BASE=http://localhost:5840/ node scripts/wanted-probe.mjs <snippet.js> [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:5840/';
const snip = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : 'return window.__game.wanted.stats';
const out = process.argv[3] ?? '.';
const params = process.env.PARAMS ?? 'at=start&god=1&new=1';
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); if (m.text().startsWith('[probe]')) console.log(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
await page.goto(`${base}?${params}`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 120000 });
for (let i = 0; i < 30; i++) {
  const busy = await page.evaluate(() => { const G = window.__game; if (G.cinematic?.active) { G.cinematic.skip(); return true; } if (G.comic?.playing) { G.comic.skip(); return true; } if (G.radio?.playing) { G.radio.skip(); return true; } return false; });
  if (!busy && i > 3) break;
  await page.waitForTimeout(250);
}
await page.mouse.click(640, 400);
const shot = async (name) => { await page.screenshot({ path: `${out}/${name}.png` }); return name; };
await page.exposeFunction('probeShot', shot);
const fn = new Function('page', `return (async () => { ${snip} })()`);
let result;
try { result = await page.evaluate(`(async () => { ${snip} })()`); } catch (e) { result = `ERR ${e.message}`; }
console.log(JSON.stringify(result, null, 1));
console.log('errors:', errors.slice(0, 12).join('\n'));
await browser.close();
