// Two pages of one browser playing online co-op over the BroadcastChannel transport (workstream
// D2), for looking at it by hand or from other scripts: the host starts a fight (?fight=test),
// invites, the guest joins with the code, both pick heroes. Prints what each side sees.
//   BASE=http://localhost:5610/ node scripts/net-pair.mjs     (SHOTS=dir to save screenshots)
import { chromium } from 'playwright-core';

const base = process.env.BASE ?? 'http://localhost:5610/';
// NET=trystero tries the real matchmaking path (public Nostr relays; needs the internet).
const net = process.env.NET ?? 'broadcast';
const shots = process.env.SHOTS ?? null;
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const errors = { host: [], guest: [] };
const host = await ctx.newPage(), guest = await ctx.newPage();
for (const [name, p] of [['host', host], ['guest', guest]]) {
  p.on('console', (m) => { if (m.type() === 'error') errors[name].push(m.text()); });
  p.on('pageerror', (e) => errors[name].push(e.message));
}
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
await host.goto(base + `?fight=test&net=${net}&god=1`);
await guest.goto(base + `?net=${net}&god=1`);
await host.waitForFunction(ready, null, { timeout: 120000 });
await guest.waitForFunction(ready, null, { timeout: 120000 });
await host.evaluate(() => window.__game.cinematic?.skip?.());
await host.evaluate(() => window.__game.openNet((n) => n.inviteFromRun()));
await host.waitForSelector('.net-host-panel .net-code');
const code = await host.$eval('.net-host-panel .net-code', (e) => e.dataset.code);
console.log('room code', code);
await guest.evaluate(() => window.__game.openNet((n) => n.openJoin()));
await guest.waitForSelector('.net-join-panel input.code');
await guest.fill('.net-join-panel input.code', code);
await guest.click('.net-join-panel .mbtn.primary');
await guest.waitForSelector('.hero-select.show [data-act="ok"][data-col="0"]', { timeout: 90000 });
await guest.click('.hero-select.show [data-act="ok"][data-col="0"]');
await guest.waitForFunction(() => window.__game.net?.runStarted && window.__game.players?.length === 2, null, { timeout: 60000 });
await host.waitForFunction(() => window.__game.players.length === 2, null, { timeout: 30000 });
await guest.waitForFunction(() => window.__game.enemies.length > 0, null, { timeout: 30000 });
const look = (p) => p.evaluate(() => {
  const g = window.__game;
  return {
    role: g.net?.role, players: g.players.map((p) => `${p.kit.id}${p.remote ? '(remote)' : ''}@${p.hero.pos.x.toFixed(1)},${p.hero.pos.z.toFixed(1)} hp${Math.round(p.hero.health)}`),
    enemies: g.enemies.map((e) => `${e.id}:${e.state}:${e.health}${e.alive ? '' : 'KO'}`).join(' '),
    step: g.flow.objectives.step?.id, mode: g.flow.mode,
    stats: g.net?.rep?.stats, badge: document.querySelector('.net-badge')?.textContent,
  };
});
for (let i = 0; i < 10; i++) {
  await guest.waitForTimeout(1500);
  for (const p of [host, guest]) await p.evaluate(() => { const g = window.__game; if (g.comic.playing) g.comic.skip(); g.cinematic?.skip?.(); g.radio?.skip?.(); });
  // The guest fights from the keyboard.
  await guest.keyboard.press('KeyE');
  console.log('host ', JSON.stringify(await look(host)));
  console.log('guest', JSON.stringify(await look(guest)));
}
if (shots) { await host.screenshot({ path: `${shots}/host.png` }); await guest.screenshot({ path: `${shots}/guest.png` }); }
console.log('errors', JSON.stringify(errors, null, 1));
await browser.close();
