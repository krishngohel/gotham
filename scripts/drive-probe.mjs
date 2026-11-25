// [move] Drives the Batmobile with the in-game scripted pilot (vehicles.startPilot) over the
// cross-city legs in tests/e2e/driveLegs.js (core, the Lower Gotham upper deck, the ramp and the
// lower deck, Lakeshore Drive, the Arkham causeway, the Blackgate causeway). Prints each leg's
// result (reached, time, worst height under the road, longest air time, final height).
// SHOTS=<dir> saves a frame at the end of each leg.  usage: node scripts/drive-probe.mjs [baseUrl]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { DRIVE_LEGS, startLeg } from '../tests/e2e/driveLegs.js';
const base = process.argv[2] ?? 'http://localhost:5680/';
const shots = process.env.SHOTS ?? '';
if (shots) mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}?at=toNeon&god=1&new=1`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30, null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game; g.teleport({ x: -30, y: 0, z: -150 }); g.vehicles.summon('batmobile', { instant: true }); g.vehicles.enter(g.vehicles.batmobile); });
for (const leg of DRIVE_LEGS) {
  if (!(await page.evaluate(startLeg, leg))) { console.log(leg.id, 'NO ROUTE'); continue; }
  const r = await page.waitForFunction(() => window.__leg.done && window.__leg, null, { timeout: 200000, polling: 500 }).then((h) => h.jsonValue());
  const pos = await page.evaluate(() => window.__game.vehicles.active.group.position.toArray().map((n) => +n.toFixed(1)));
  console.log(leg.id.padEnd(20), r.ok ? 'OK  ' : 'FAIL', `t=${r.t.toFixed(1)}s dist=${r.dist.toFixed(0)}m below=${r.worstBelow.toFixed(2)} air=${r.maxAir.toFixed(2)} unstuck=${r.unstuck ?? 0} at`, pos.join(','));
  if (shots) await page.screenshot({ path: `${shots}/drive-${leg.id}.jpg`, type: 'jpeg', quality: 60 });
}
console.log('errors', errors.slice(0, 5));
await browser.close();
