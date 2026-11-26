// [polish] Fixed-camera shots of the title screen: the menu over the title camera's path.
//   node scripts/title-shots.mjs <baseUrl> <outDir> [q] [t1,t2,...]
// Sets window.__titleT (dev builds only) so the camera stands at fixed points of its path.
// CAMS='x,y,z,lx,ly,lz;...' instead photographs arbitrary cameras (for choosing the path).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
const [base, out, q = 'high', ts = '0,20,40'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: +(process.env.W ?? 1280), height: +(process.env.H ?? 720) } });
const errors = [];
// SAVE=1: a save part-way through Night One, so the title offers Continue.
if (process.env.SAVE) await page.addInitScript(() => { try { localStorage.setItem('gotham-progress-v1', JSON.stringify({ step: 14, stepId: 'rewardCrates', suit: 'm' })); } catch {} });
page.on('pageerror', (e) => errors.push(String(e)));
// LOADING=1: hold the models back for a few seconds and photograph the loading screen first.
if (process.env.LOADING) {
  await page.route('**/assets/anims_mocap.glb', async (r) => { await new Promise((ok) => setTimeout(ok, 6000)); r.continue().catch(() => {}); });
  page.goto(`${base.replace(/\/$/, '')}/?q=${q}&dynres=0`).catch(() => {});
  await page.waitForSelector('.loading .tip.in', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/loading.png` });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
}
await page.goto(`${base.replace(/\/$/, '')}/?q=${q}&dynres=0${process.env.EXTRA ?? ''}`);
await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 180000 });
if (process.env.HIDEUI) await page.addStyleTag({ content: '.menu-layer{display:none!important}' });
const cams = process.env.CAMS ? process.env.CAMS.split(';').map((s) => s.split(',').map(Number)) : null;
const list = cams ?? ts.split(',').map(Number);
for (let i = 0; i < list.length; i++) {
  const v = list[i];
  await page.evaluate((v) => { if (Array.isArray(v)) window.__titleCam = v; else window.__titleT = v; }, v);
  await page.waitForTimeout(+(process.env.WAIT ?? 1500));
  const name = Array.isArray(v) ? `cam${i}` : `t${v}`;
  await page.screenshot({ path: `${out}/${q}-${name}.png` });
  console.log('shot', name);
}
// PAGE=<button text>: open a title sub-page and photograph it.
if (process.env.PAGE) {
  await page.locator('.title-menu .mbtn', { hasText: process.env.PAGE }).first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${q}-page.png` });
}
if (process.env.PAD) {
  // keyboard focus state: tab to the second button
  await page.keyboard.press('Tab');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/${q}-focus.png` });
}
console.log(errors.slice(0, 10).join('\n') || 'no page errors');
await b.close();
