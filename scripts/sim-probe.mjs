// [story2] Debug aid for the night simulator: start a night at a step, arm the scripted player in a
// mode and print what it sees every second.  BASE=... NIGHT=n6 AT=n6GreenhouseFight MODE=fight node scripts/sim-probe.mjs
import { chromium } from 'playwright-core';
import { installSim } from './simPlayer.mjs';

const base = process.env.BASE ?? 'http://localhost:5720/';
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${base}?new=1&night=${process.env.NIGHT ?? 'n6'}&at=${process.env.AT ?? 'n6GreenhouseFight'}&bruceDays=0&q=potato`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 120000 });
await page.evaluate(installSim);
await page.evaluate(() => { window.__imp = []; window.__game.events.on('impact', (d) => window.__imp.push([d.move, d.outcome, !!d.target?.thrall, d.target?.type])); window.__game.events.on('storyFreed', () => window.__imp.push(['FREED'])); });
const at = await page.evaluate(() => { const G = window.__game; const s = G.flow.objectives.step; const f = s.fight ? G.flow.story.fight(s.fight) : null; const p = f ? (f.entry ? G.flow.story.site(f.entry) : f.site) : G.flow.target; return p ? { x: p.x, y: p.y, z: p.z + (f?.entry ? 0 : 8) } : null; });
if (at && process.env.MODE !== 'boss') await page.evaluate((p) => window.__game.teleport(p), at);
await page.waitForTimeout(1500);
await page.evaluate(({ m, t }) => { window.__sim.mode = m; window.__sim.thralls = t; }, { m: process.env.MODE ?? 'fight', t: !!process.env.THRALLS });
for (let i = 0; i < Number(process.env.SECS ?? 30); i++) {
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__game.comic?.skip?.());
  console.log(JSON.stringify(await page.evaluate(() => {
    const G = window.__game, h = G.hero, P = G.players[0];
    const en = G.combat.enemies.filter((e) => e.alive && !e.down);
    return { step: G.flow.objectives.step?.id, mode: G.flow.mode, hp: Math.round(h.health), pos: [Math.round(h.pos.x), Math.round(h.pos.z)], heroState: h.state, mv: window.__sim.mv && [+window.__sim.mv.x.toFixed(2), +window.__sim.mv.y.toFixed(2)], inMove: P.input.move && [P.input.move.x, P.input.move.y], enemies: en.length, aware: en.filter((e) => e.aware).length, en: en.slice(0, 3).map((e) => [e.type, Math.round(e.pos.x), +e.pos.y.toFixed(1), Math.round(e.pos.z), e.state]), hy: +h.pos.y.toFixed(1), near: en.length ? Math.round(Math.min(...en.map((e) => Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z)))) : null, imp: window.__imp.splice(0), deaths: window.__sim.deaths, boss: G.bosses?.snapshot?.().phase, hz: G.bosses?.snapshot?.().hazards?.nodes, hint: (() => { const k = G.bosses?.simHint?.(); return k ? { ...k, goTo: k.goTo ? [Math.round(k.goTo.x), Math.round(k.goTo.z)] : null } : null; })(), held: G.bosses?.controller?.handle?.data?.nodes?.map((n) => +n.held.toFixed(1)) };
  })));
}
await browser.close();
