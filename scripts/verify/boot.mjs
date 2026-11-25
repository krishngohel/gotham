// [verify] Boots one URL headless, waits for the game to be ready, optionally runs a JS snippet in
// the page (EVAL), and prints console errors / page errors and the snippet's JSON result.
// usage: EVAL='return window.__game.wanted.level' node scripts/verify/boot.mjs <url> [waitMs]
import { chromium } from 'playwright-core';

const url = process.argv[2];
const wait = +(process.argv[3] ?? 1500);
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(url);
let ready = true;
try { await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30, null, { timeout: 120000 }); } catch { ready = false; }
await page.waitForTimeout(wait);
let result = null;
if (process.env.EVAL) {
  try { result = await page.evaluate(new Function(process.env.EVAL)); } catch (e) { result = `EVAL threw: ${e.message}`; }
}
console.log(JSON.stringify({ url, ready, errors, result }, null, 1));
await browser.close();
