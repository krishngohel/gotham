// [verify] Old-save compatibility (item 1). Step 1 (`make`): real saves written by the pre-overhaul
// build (commit 5fe2c7f, served by its dev server) at three points: early Night One, mid game, and
// finished with trophies, medals, WayneTech upgrades and stats. Step 2 (`check`): load each into the
// new build, press Continue, and report what the player gets.
//   OLD=http://localhost:5201/ node scripts/verify/saves.mjs make docs/verification/saves
//   NEW=http://localhost:5860/ node scripts/verify/saves.mjs check docs/verification/saves
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';

const [mode = 'check', dir = 'docs/verification/saves'] = process.argv.slice(2);
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 30;
const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });

async function page(url, init = null) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  if (init) await ctx.addInitScript(init.fn, init.arg);
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
  await p.goto(url);
  await p.waitForFunction(ready, null, { timeout: 150000 });
  await p.waitForTimeout(2500);
  return { p, ctx, errors };
}

if (mode === 'make') {
  const base = process.env.OLD ?? 'http://localhost:5201/';
  mkdirSync(dir, { recursive: true });
  const points = [['early', 'toYard'], ['mid', 'toAce'], ['finished', 'credits']];
  for (const [name, at] of points) {
    const { p, ctx, errors } = await page(`${base}?at=${at}&god=1`);
    await p.waitForTimeout(3000);
    const save = await p.evaluate(async (name) => {
      const g = window.__game;
      g.progress.stats.playTime += name === 'finished' ? 5400 : name === 'mid' ? 1800 : 400;
      g.progress.stats.kos += name === 'finished' ? 240 : 60;
      g.progress.stats.longestCombo = Math.max(g.progress.stats.longestCombo, 23);
      if (name === 'finished') {
        const { TROPHIES } = await import('/src/config/trophySpots.js');
        const { CHALLENGES } = await import('/src/game/challenges.js');
        g.progress.trophies = TROPHIES.slice(0, 8).map((t, i) => i); // saved as indices (src/core/save.js)
        for (const [i, c] of CHALLENGES.slice(0, 3).entries()) g.progress.challenges[c.id] = { best: 30 + i, medal: ['gold', 'silver', 'bronze'][i] };
        g.wayne.award(4000);
        for (const id of ['plating1', 'reflexes', 'kevlar', 'flow']) g.wayne.buy(id);
        g.progress.suit = 'f';
        g.progress.finished = true; // the credits screen sets it (flow.js); ?at=credits jumps past that
      }
      localStorage.setItem('gotham-progress-v1', JSON.stringify(g.progress));
      return JSON.parse(localStorage.getItem('gotham-progress-v1'));
    }, name);
    const settings = await p.evaluate(() => localStorage.getItem('gotham-settings-v1'));
    writeFileSync(`${dir}/${name}.json`, JSON.stringify({ made: `5fe2c7f ?at=${at}`, progress: save, settings: settings ? JSON.parse(settings) : null }, null, 1));
    console.log(name, 'stepId', save.stepId, 'step', save.step, 'finished', save.finished, 'trophies', save.trophies.length, 'wayne', JSON.stringify(save.wayne), 'errors', errors.length);
    await ctx.close();
  }
} else {
  const base = process.env.NEW ?? 'http://localhost:5860/';
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const s = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
    const { p, ctx, errors } = await page(`${base}?god=1&abilities=story`, { fn: (s) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('gotham-progress-v1', JSON.stringify(s.progress)); if (s.settings) localStorage.setItem('gotham-settings-v1', JSON.stringify(s.settings)); } }, arg: s });
    const title = await p.evaluate(() => [...document.querySelectorAll('.mbtn')].map((b) => b.textContent.trim()).slice(0, 8));
    const slotText = await p.evaluate(() => [...document.querySelectorAll('.slot, .save-slot, .slot-card, [class*="slot"]')].map((e) => e.textContent.trim().replace(/\s+/g, ' ')).filter(Boolean).slice(0, 4));
    // Continue (the primary button on a title with a save), then a suit card if the old flow asks.
    await p.evaluate(() => { const b = [...document.querySelectorAll('.mbtn')].find((x) => /continue|resume/i.test(x.textContent)) ?? document.querySelector('.mbtn.primary'); b?.click(); });
    await p.waitForTimeout(1500);
    await p.evaluate(() => document.querySelector('.suit-card.suit-m')?.click());
    try { await p.waitForFunction(() => window.__game?.flow, null, { timeout: 90000 }); } catch { /* reported below */ }
    await p.waitForTimeout(4000);
    const r = await p.evaluate(() => {
      const g = window.__game, pr = g.progress;
      return {
        step: g.flow?.objectives?.step?.id ?? null, mode: g.flow?.mode ?? null, night: pr.campaign?.night ?? null,
        finished: pr.finished, trophies: pr.trophies?.length, challenges: Object.fromEntries(Object.entries(pr.challenges ?? {}).map(([k, v]) => [k, v.medal])),
        wayneOwned: pr.wayne?.owned ?? null, wayneXp: pr.wayne?.xp ?? null, stats: pr.stats, suit: pr.suit,
        abilities: g.abilities?.state?.unlocked ?? null, mode2: g.abilities?.mode,
        gadgets: pr.gadgets?.unlocked ?? null,
      };
    });
    console.log(JSON.stringify({ save: f, made: s.made, saved: { stepId: s.progress.stepId, finished: s.progress.finished, trophies: s.progress.trophies.length, wayne: s.progress.wayne }, title, slotText, loaded: r, errors }, null, 1));
    await p.screenshot({ path: `${dir}/${f.replace('.json', '')}-new.jpg`, type: 'jpeg', quality: 50 });
    await ctx.close();
  }
}
await browser.close();
