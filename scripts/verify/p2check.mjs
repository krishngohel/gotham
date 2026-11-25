// [verify] Split screen across the newer systems (item 2d): with ?p2=bot, checks per-view facts for
// the HUD director, the wanted readout, the minimap, the boss bar, photo mode and the stations, and
// that nothing leaves the game paused or held. One page; prints JSON and saves two screenshots.
// usage: BASE=http://localhost:5860/ OUT=<dir> node scripts/verify/p2check.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5860/';
const out = process.env.OUT ?? 'p2check';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
await page.goto(`${base}?at=toNeon&god=1&new=1&p2=bot&p2kit=robin&q=low`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30 && window.__game.players?.length === 2, null, { timeout: 150000 });
await page.waitForTimeout(3000);
const r = {};
const rectOf = (sel, i) => page.evaluate(([s, i]) => { const e = document.querySelectorAll(s)[i]; if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }, [sel, i]);

r.views = await page.evaluate(() => window.__game.split?.views?.map((v) => v.rect ?? v.viewport ?? null) ?? null);
r.huds = await page.evaluate(() => window.__game.hud.all().map((h) => { const b = h.el.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.width)]; }));
// HUD director: one card request reaches each view's centre.
r.directorCard = await page.evaluate(async () => {
  const g = window.__game;
  g.hud.card('VERIFY CARD', 'Both views should show this.', 4000);
  await new Promise((res) => setTimeout(res, 900));
  return g.hud.all().map((h) => h.el.querySelector('.hud-card')?.classList.contains('show') ?? null);
});
// The wanted readout: one per local view.
r.wanted = await page.evaluate(async () => {
  const g = window.__game;
  g.wanted.set(2, { scripted: true, reason: 'verify' });
  await new Promise((res) => setTimeout(res, 1500));
  const n = g.wanted.readouts.size;
  const vis = [...g.wanted.readouts.values()].map((x) => x.ui.visible ?? null);
  g.wanted.clear('verify');
  return { readouts: n, visible: vis };
});
// Minimaps: one canvas per view.
r.minimaps = await page.evaluate(() => document.querySelectorAll('canvas.minimap, .minimap canvas, .hud-minimap canvas').length);
// Boss bar: shared to both views.
r.bossBar = await page.evaluate(() => { const g = window.__game; g.hud.bossBar(true, 0.6, 1, { name: 'VERIFY' }); const v = g.hud.all().map((h) => h.el.querySelector('.boss')?.classList.contains('show') ?? h.el.querySelector('[class*="boss"]')?.classList.contains('show') ?? null); g.hud.bossBar(false); return v; });
await page.screenshot({ path: `${out}/p2-hud.jpg`, type: 'jpeg', quality: 55 });
// Photo mode opened by player 2: the world keeps running (split), it closes, nothing stays held.
r.photo = await page.evaluate(async () => {
  const g = window.__game, p1 = g.players[1];
  g.photo.open(p1);
  await new Promise((res) => setTimeout(res, 800));
  const s = { active: g.photo.active, player: g.photo.player === p1, freezesWorld: g.photo.freezesWorld, paused: g.state.paused };
  const f0 = g.state.frame;
  await new Promise((res) => setTimeout(res, 600));
  s.worldRuns = g.state.frame > f0;
  document.querySelector('.ph-exit')?.click();
  await new Promise((res) => setTimeout(res, 600));
  s.closed = !g.photo.active; s.p0control = g.hero.control?.name ?? null; s.p1control = p1.hero.control?.name ?? null;
  return s;
});
// Stations (skill tree, loadout, suits, map): open, then close; the game must not stay paused.
r.stations = [];
for (const id of ['skillTree', 'gadgets', 'suits', 'cityMap']) {
  r.stations.push(await page.evaluate(async (id) => {
    const g = window.__game;
    const m = await import('/src/ui/stations.js');
    let closed = false;
    const h = m.openStation(id, { onClose: () => { closed = true; } });
    await new Promise((res) => setTimeout(res, 700));
    const open = { id, pausedOpen: g.state.paused };
    h?.close?.();
    await new Promise((res) => setTimeout(res, 500));
    const f0 = g.state.frame;
    await new Promise((res) => setTimeout(res, 500));
    return { ...open, closedCb: closed, pausedAfter: g.state.paused, runsAfter: g.state.frame > f0, leftovers: document.querySelectorAll('.station, .menu-page.show').length };
  }, id));
}
// The pause menu opened while player 2 is the one with a pad: Escape closes it (player 1's keys).
r.pause = await page.evaluate(async () => {
  const g = window.__game;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  await new Promise((res) => setTimeout(res, 400));
  const opened = g.state.paused;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' }));
  await new Promise((res) => setTimeout(res, 400));
  return { opened, closed: !g.state.paused };
});
await page.screenshot({ path: `${out}/p2-after.jpg`, type: 'jpeg', quality: 55 });
console.log(JSON.stringify({ ...r, errors }, null, 1));
await browser.close();
