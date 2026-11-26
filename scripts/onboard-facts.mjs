// [onboard] What a brand-new save can do in its first minute: prints the gadgets, skill effects,
// traversal moves, the ability layer's state and a few live probes (does the grapple fire, does the
// Batwing come, is the chain HUD up at a big combo) for one URL.
// usage: node scripts/onboard-facts.mjs http://localhost:5830/ ['?new=1&skip=1']
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5830/';
const q = process.argv[3] ?? '?new=1&skip=1';
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => { try { localStorage.clear(); } catch { /* fine */ } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + q, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.flow, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const facts = await page.evaluate(() => {
  const G = window.__game;
  const h = G.hero;
  const ab = G.abilities;
  return {
    dev: !!G.reach,
    step: G.flow.objectives.step?.id,
    gadgetsUnlocked: [...(G.gadgets?.state?.unlocked ?? [])],
    moves: h.moves,
    swarmOwned: !!G.combat?.effects?.batSwarm,
    abilities: ab ? ab.list().filter((a) => ab.has(a)) : 'no ability layer',
    abilitiesLocked: ab ? ab.list().filter((a) => !ab.has(a)) : [],
    progressMoves: G.progress.moves,
  };
});
console.log(JSON.stringify(facts, null, 1));
if (errors.length) console.log('page errors:', errors.slice(0, 5));
await browser.close();
