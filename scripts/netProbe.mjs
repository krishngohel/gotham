// [net2] Dev probe: a host and a guest page over BroadcastChannel at a host URL, then a JS snippet
// per page (PROBE_HOST / PROBE_GUEST files) to poke at. Not part of the test suite.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
const base = process.env.BASE ?? 'http://localhost:5740';
const hostUrl = process.env.HOST_URL ?? '/?fight=test&net=broadcast&god=1';
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const host = await ctx.newPage(), guest = await ctx.newPage();
for (const [n, p] of [['host', host], ['guest', guest]]) { p.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('PROBE')) console.log(n, m.type(), m.text()); }); p.on('pageerror', (e) => console.log(n, 'pageerror', e.message)); }
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
await host.goto(base + hostUrl); await guest.goto(base + '/?net=broadcast&god=1');
await host.waitForFunction(ready, null, { timeout: 120000 }); await guest.waitForFunction(ready, null, { timeout: 120000 });
await host.waitForFunction(() => !!window.__game.flow, null, { timeout: 60000 });
await host.evaluate(() => window.__game.openNet((n) => n.inviteFromRun()));
await host.waitForSelector('.net-host-panel .net-code');
const code = await host.$eval('.net-host-panel .net-code', (e) => e.dataset.code);
await guest.evaluate(() => window.__game.openNet((n) => n.openJoin()));
await guest.fill('.net-join-panel input.code', code);
await guest.click('.net-join-panel .mbtn.primary');
await guest.waitForSelector('.hero-select.show [data-act="ok"][data-col="0"]', { timeout: 30000 });
await guest.click('.hero-select.show [data-act="ok"][data-col="0"]');
await guest.waitForFunction(() => window.__game.net?.runStarted && window.__game.players?.length === 2, null, { timeout: 90000 });
await host.waitForFunction(() => window.__game.players.length === 2 && window.__game.net?.rep?.ready, null, { timeout: 30000 });
await host.evaluate(() => document.querySelector('.net-host-panel')?.remove());
console.log('paired');
const script = process.env.PROBE ? (await import(new URL(`file:///${process.env.PROBE.replace(/\\/g, '/')}`))).default : null;
if (script) await script({ host, guest });
await browser.close();
void readFileSync;
