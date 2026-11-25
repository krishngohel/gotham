// [wanted] Frames of each police level and the sandbox for docs/design/shots/wanted/ (JPEG, small).
//   BASE=http://localhost:5840/ node scripts/wanted-shots.mjs [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:5840/';
const out = process.argv[2] ?? 'docs/design/shots/wanted';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?night=n2&god=1&new=1&time=23&weather=rain`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 120000 });
for (let i = 0; i < 40; i++) {
  const busy = await page.evaluate(() => { const G = window.__game; if (G.cinematic?.active) { G.cinematic.skip(); return true; } if (G.comic?.playing) { G.comic.skip(); return true; } if (G.radio?.playing) { G.radio.skip(); return true; } return G.flow.mode !== 'play'; });
  if (!busy && i > 3) break;
  await page.waitForTimeout(250);
}
await page.mouse.click(640, 400);
const shot = (name) => page.screenshot({ path: `${out}/${name}.jpg`, type: 'jpeg', quality: 72 });
const gameWait = (sec) => page.waitForFunction((t) => window.__game.state.t > t, null, { timeout: 120000 }).catch(() => {});
const tNow = () => page.evaluate(() => window.__game.state.t);
async function level(n, { pos = { x: 30, y: 0.2, z: -420 }, yaw = Math.PI, secs = 9 } = {}) {
  await page.evaluate(([p, y, lv]) => { const G = window.__game; G.wanted.clear('shots'); G.wanted.units.clearAll(); G.hero.teleport(p, y); G.follow.snapBehind?.(y); G.wanted.set(lv, { scripted: false }); }, [pos, yaw, n]);
  const t = await tNow();
  await gameWait(t + secs);
}
for (const [n, secs] of [[1, 10], [2, 9], [3, 10], [4, 12], [5, 12]]) {
  await level(n, { secs });
  // Face the nearest unit so the frame shows the response.
  await page.evaluate(() => {
    const G = window.__game, U = G.wanted.units, h = G.hero.pos;
    const near = [...U.officers.filter((o) => o.active), ...U.cruisers.filter((c) => c.active)].sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z))[0];
    if (near) { const yaw = Math.atan2(near.x - h.x, near.z - h.z); G.hero.bat?.face?.(yaw); G.follow.snapBehind?.(yaw); }
  });
  await page.waitForTimeout(700);
  await shot(`level${n}`);
}
// The search: up on a roof, the ring draining, the ghost on the minimap.
await page.evaluate(() => {
  const G = window.__game, W = G.wanted, h = G.hero.pos;
  const roof = G.world.grapplePoints.filter((q) => q.y > 18 && q.y < 50 && Math.hypot(q.x - h.x, q.z - h.z) > 90 && Math.hypot(q.x - h.x, q.z - h.z) < 220).sort((a, b) => a.y - b.y)[0];
  W.set(3, { scripted: false });
  W.units.clearAll();
  G.hero.teleport({ x: roof.x - (roof.nx ?? 0) * 1.5, y: roof.y + 0.2, z: roof.z - (roof.nz ?? 0) * 1.5 });
});
await page.waitForFunction(() => window.__game.wanted.stateName === 'search', null, { timeout: 120000 }).catch(() => {});
await gameWait((await tNow()) + 4);
await shot('search');
// The helicopter's light from the street.
await level(4, { secs: 14 });
await page.evaluate(() => { const G = window.__game, H = G.wanted.units.heli, h = G.hero.pos; const yaw = Math.atan2(H.x - h.x, H.z - h.z); G.follow.snapBehind?.(yaw + Math.PI * 0.15); });
await page.waitForTimeout(600);
await shot('helicopter');
// A roadblock ahead of a car.
await page.evaluate(() => {
  const G = window.__game, V = G.vehicles, W = G.wanted;
  W.clear('shots'); W.units.clearAll(); W.set(3, { scripted: false });
  const car = V.lendCar('sedan', { x: 30, y: 0, z: -430, yaw: Math.PI });
  V.enter(car);
  W.units.placeRoadblocks({ x: 30, y: 0, z: -430 }, { x: 0, z: -1 }, 1);
  const rb = W.units.roadblocks[0];
  if (rb) { V.exit(); G.hero.teleport({ x: rb.x - Math.sin(rb.yaw) * -16, y: rb.y + 0.2, z: rb.z - Math.cos(rb.yaw) * -16 }); G.follow.snapBehind?.(rb.yaw + Math.PI); }
});
await page.waitForTimeout(1500);
await shot('roadblock');
// The radio dial in a taken car.
await page.evaluate(() => { const G = window.__game, V = G.vehicles; G.wanted.clear('shots'); G.wanted.units.clearAll(); if (!V.active) V.enter(V.streetCars[V.streetCars.length - 1]); });
await page.waitForTimeout(800);
await page.evaluate(() => window.__game.sandbox.radio.next(window.__game.players[0]));
await page.waitForTimeout(400);
await shot('radio');
await browser.close();
console.log('shots in', out);
