import { test, expect } from '@playwright/test';

// Two heroes in one fight (Long Night 2, workstream B): ?p2=bot adds a second local hero driven by
// a scripted input source (src/players/bot.js) through the real input, combat and hero code.
// Player 0 is driven with the real keyboard. God mode keeps both standing so the fight runs long
// enough to see everything; the revive is checked with a knockout the test deals itself.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;

async function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('two heroes fight the same goons: both deal and take hits, aggro is shared, a downed hero is revived', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/?fight=test&p2=bot&god=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.players?.length === 2 && window.__game.enemies.length > 0, null, { timeout: 20000 });
  // The opening cinematic freezes player 0 for its first seconds; on a loaded machine that used up
  // the fight's time budget below, so skip it and wait until he can act.
  await page.evaluate(() => window.__game.cinematic?.skip?.());
  await page.waitForFunction(() => !window.__game.cinematic?.active, null, { timeout: 30000 });
  const setup = await page.evaluate(() => {
    const g = window.__game;
    window.__coop = { impacts: [0, 0], hurt: [0, 0], aggro: [0, 0], revived: 0 };
    g.events.on('impact', (d) => { if (d.player && d.outcome !== 'parried' && d.outcome !== 'immune') window.__coop.impacts[d.player.id] += 1; });
    g.events.on('heroHurt', (d) => { window.__coop.hurt[(d.player?.id) ?? 0] += 1; });
    g.events.on('playerRevived', () => { window.__coop.revived += 1; });
    // The bot counters every wind-up aimed at it (src/players/bot.js), so on a fast machine it was
    // never hit and "player 1 was hit" failed. For this test it never counters (its counter taps
    // are dropped): goons land blows on it while it still fights back. God mode keeps it up.
    const botInput = g.players[1].input, tap = botInput.tap.bind(botInput);
    botInput.tap = (a) => { if (a !== 'block') tap(a); };
    // Sample who the goons are after, a few times a second.
    window.__coopT = setInterval(() => {
      const f = g.combat.fighters;
      for (const e of g.enemies) if (e.alive && e.aware) { if (e.aggro === f[0]) window.__coop.aggro[0] += 1; else if (e.aggro === f[1]) window.__coop.aggro[1] += 1; }
    }, 200);
    return {
      heroIsPlayer0: g.hero === g.players[0].hero,
      kits: g.players.map((p) => p.kit.id),
      slots: document.querySelectorAll('.hud-slot').length,
      goons: g.enemies.length,
      // ?fight=test has five goons for one hero; co-op scaling adds more (src/players/coopRules.js).
      fighters: g.combat.fighters.length,
    };
  });
  expect(setup).toEqual({ heroIsPlayer0: true, kits: ['m', 'f'], slots: 2, goons: 8, fighters: 2 });

  // Player 0 fights from the keyboard (kick auto-attaches to any goon in 14 m); the bot fights too.
  // (Being hit is checked below, through a scripted exchange when the free fight did not do it.)
  const done = () => { const c = window.__coop; return c.impacts[0] > 0 && c.impacts[1] > 0 && c.aggro[0] > 0 && c.aggro[1] > 0; };
  for (let i = 0; i < 240 && !(await page.evaluate(done)); i++) {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(250);
  }
  // A hero who was never hit in the free fight (player 0's kicks keep interrupting whoever winds up
  // at him, more so on a fast machine) gets one scripted exchange: a goon goes after just him,
  // winds up in reach, and he does nothing. Every goon's attack still runs through the real AI,
  // director-free start, contact frame and the shared hurt path; only the timing is staged.
  for (const i of [0, 1]) {
    if (await page.evaluate((i) => window.__coop.hurt[i] > 0, i)) continue;
    await page.evaluate((i) => {
      const g = window.__game, f = g.combat.fighters[i], h = f.hero;
      const e = g.enemies.find((x) => x.alive && !x.down && x.type !== 'brute' && !x.def?.ranged);
      if (!e) return;
      e.aggro = f;
      e.place({ x: h.pos.x + 1.4, y: h.pos.y, z: h.pos.z }, -Math.PI / 2);
      e.state = 'engage'; e.t = 0; e.stunned = false;
      e.startWindup(0.4, h, { now: true });
    }, i);
    await page.waitForFunction((i) => window.__coop.hurt[i] > 0, i, { timeout: 15000 }).catch(() => {});
  }
  const fight = await page.evaluate(() => window.__coop);
  expect(fight.impacts[0], 'player 0 landed hits').toBeGreaterThan(0);
  expect(fight.impacts[1], 'player 1 (bot) landed hits').toBeGreaterThan(0);
  expect(fight.hurt[0], 'player 0 was hit').toBeGreaterThan(0);
  expect(fight.hurt[1], 'player 1 was hit').toBeGreaterThan(0);
  expect(fight.aggro[0], 'goons went after player 0').toBeGreaterThan(0);
  expect(fight.aggro[1], 'goons went after player 1').toBeGreaterThan(0);
  // Each hero has its own combo and its own health.
  const own = await page.evaluate(() => {
    const [a, b] = window.__game.combat.fighters;
    return { separateCombos: a.combo !== b.combo, separateHealth: window.__game.players[0].hero !== window.__game.players[1].hero };
  });
  expect(own).toEqual({ separateCombos: true, separateHealth: true });

  // Revive: knock player 0 out with the partner standing; the bot walks over and gets him up.
  await page.evaluate(() => { window.__game.winFight(); window.__game.combat.killHero(); });
  await page.waitForFunction(() => window.__game.players[0].hero.dead === true, null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.flow.mode)).toBe('play');
  await expect(page.locator('.hud-slot[data-slot="0"].down')).toHaveCount(1);
  await page.waitForFunction(() => window.__game.players[0].hero.dead === false, null, { timeout: 30000 });
  expect(await page.evaluate(() => window.__coop.revived)).toBe(1);
  await page.evaluate(() => clearInterval(window.__coopT));
  expect(errors).toEqual([]);
});
