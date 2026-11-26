import { test, expect } from '@playwright/test';

// Local co-op and split screen (workstream D1). Gamepads are faked through navigator.getGamepads
// (an init script), so joining, the hero select, a lost controller and its reassignment all go
// through the game's real device path (src/coop/deviceWatch.js, joinFlow.js). Player 1 plays on the
// real keyboard. Screenshots of both halves go to docs/design/shots/coop/ when SHOTS=1.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
const SHOTS = process.env.SHOTS === '1';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `docs/design/shots/coop/${name}.jpg`, type: 'jpeg', quality: 72 }); };

async function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// Fake pads: window.__pads[i] = { pressed: Set<button>, axes: [..4] } or null (disconnected).
async function fakePads(page) {
  await page.addInitScript(() => {
    window.__pads = [];
    const make = (i, s) => ({ index: i, id: 'Fake pad', connected: true, mapping: 'standard', axes: s.axes, buttons: Array.from({ length: 17 }, (_, b) => ({ pressed: s.pressed.has(b), value: s.pressed.has(b) ? 1 : 0 })) });
    navigator.getGamepads = () => window.__pads.map((s, i) => (s ? make(i, s) : null));
    window.__padPlug = (i) => { window.__pads[i] = { pressed: new Set(), axes: [0, 0, 0, 0] }; };
    window.__padUnplug = (i) => { window.__pads[i] = null; };
    window.__padDown = (i, b) => window.__pads[i]?.pressed.add(b);
    window.__padUp = (i, b) => window.__pads[i]?.pressed.delete(b);
  });
}
// A button tap held over a few frames (the game polls once a frame).
async function tap(page, pad, button) {
  await page.evaluate(([i, b]) => window.__padDown(i, b), [pad, button]);
  await page.waitForTimeout(120);
  await page.evaluate(([i, b]) => window.__padUp(i, b), [pad, button]);
  await page.waitForTimeout(120);
}

test('lobby: two players join, pick heroes and start the story in split screen', async ({ page }) => {
  const errors = await collectErrors(page);
  await fakePads(page);
  await page.goto('/?new=1&god=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(() => window.__padPlug(1));
  await page.locator('.mbtn.coop').click();
  await expect(page.locator('.hero-select.show')).toBeVisible();
  await expect(page.locator('.hs-col.waiting')).toHaveCount(1);
  // Player 2 presses Start on its controller: its column opens.
  await tap(page, 1, 9);
  await expect(page.locator('.hs-col.waiting')).toHaveCount(0);
  // Player 2 browses to a different hero (D-pad right) and readies (A).
  const before = await page.locator('.hs-col[data-slot="1"] .hs-name').textContent();
  await tap(page, 1, 15);
  await expect(page.locator('.hs-col[data-slot="1"] .hs-name')).not.toHaveText(before);
  const p2Hero = await page.locator('.hs-col[data-slot="1"] .hs-name').textContent();
  await tap(page, 1, 0);
  await expect(page.locator('.hs-col[data-slot="1"].ready')).toHaveCount(1);
  await page.waitForTimeout(1500); // the preview models load
  await shot(page, '01-lobby');
  // Player 1 readies on the keyboard: the run starts with both.
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__game.players?.length === 2, null, { timeout: 60000 });
  const s = await page.evaluate(() => {
    const g = window.__game;
    return { split: g.split.split || g.split.fullscreen, p0kbm: g.players[0].input.hasKbm, p1pad: g.players[1].input.padIndex, p1kbm: g.players[1].input.hasKbm, saved: g.progress.coop.picks[1] };
  });
  expect(s.split).toBe(true);
  expect(s.p0kbm).toBe(true);
  expect(s.p1pad).toBe(1);
  expect(s.p1kbm).toBe(false);
  expect(s.saved).toBeTruthy();
  expect(p2Hero.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('drop in mid-fight, a lost controller pauses and is reassigned, drop out', async ({ page }) => {
  const errors = await collectErrors(page);
  await fakePads(page);
  await page.goto('/?at=f1&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.flow.mode === 'play', null, { timeout: 30000 });
  await page.evaluate(() => { const G = window.__game, s = G.flow.target; G.teleport({ x: s.x, y: s.y, z: s.z }); });
  await page.waitForFunction(() => window.__game.enemies.some((e) => e.alive && e.aware), null, { timeout: 20000 });
  // Player 2 plugs in and presses Start mid-fight: both pause, player 2 picks a hero.
  await page.evaluate(() => window.__padPlug(0));
  await page.waitForTimeout(200);
  await tap(page, 0, 9);
  await expect(page.locator('.hero-select.show')).toBeVisible();
  expect(await page.evaluate(() => window.__game.state.paused)).toBe(true);
  await tap(page, 0, 0);
  await page.waitForFunction(() => window.__game.players.length === 2 && !window.__game.state.paused, null, { timeout: 60000 });
  expect(await page.evaluate(() => window.__game.split.split)).toBe(true);
  // Both fight: player 2 punches with its own pad (X).
  for (let i = 0; i < 6; i++) { await tap(page, 0, 2); await page.keyboard.press('KeyE'); }
  await shot(page, '02-drop-in-fight');
  // The controller goes: everyone pauses with the prompt; a new pad index carries on as player 2.
  await page.evaluate(() => window.__padUnplug(0));
  await expect(page.locator('.coop-prompt.show')).toBeVisible();
  expect(await page.evaluate(() => window.__game.state.paused)).toBe(true);
  await shot(page, '03-controller-lost');
  await page.evaluate(() => window.__padPlug(2));
  await page.waitForTimeout(200);
  await tap(page, 2, 0);
  await expect(page.locator('.coop-prompt.show')).toHaveCount(0);
  await page.waitForFunction(() => !window.__game.state.paused, null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.players[1].input.padIndex)).toBe(2);
  // Drop out from the pause menu: back to one full-screen player, the fight still running.
  await page.keyboard.press('Escape');
  await page.locator('.pause-menu .mbtn', { hasText: 'Player 2: drop out' }).click();
  await page.waitForFunction(() => window.__game.players.length === 1 && !window.__game.split.split, null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.flow.mode)).toBe('play');
  expect(errors).toEqual([]);
});

test('two players: grapple, gadgets, detective and stealth are each player\'s own; hold to revive', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/?at=aceCatwalks&p2=bot&p2kit=nightwing&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.players?.length === 2 && window.__game.flow.mode === 'play', null, { timeout: 60000 });
  const own = await page.evaluate(() => {
    const G = window.__game, [a, b] = G.players;
    return {
      kit: b.kit.id, hasCape: b.hero.hasCape, style: b.hero.trav.style,
      gadgets: !!b.gadgets && b.gadgets !== G.gadgets, cameras: a.view.camera !== b.view.camera,
      stealthRoom: G.stealth.active, splitViews: G.split.views.length, huds: document.querySelectorAll('.hud').length,
    };
  });
  expect(own).toEqual({ kit: 'nightwing', hasCape: false, style: 'acrobat', gadgets: true, cameras: true, stealthRoom: true, splitViews: 2, huds: 2 });
  // Player 2 toggles detective vision: only its own view turns blue.
  await page.evaluate(() => window.__game.players[1].input.tap('detective'));
  await page.waitForTimeout(800);
  const det = await page.evaluate(() => window.__game.split.views.map((v) => Math.round(v.overrides.detective * 10) / 10));
  expect(det[0]).toBe(0);
  expect(det[1]).toBeGreaterThan(0.5);
  await shot(page, '04-predator-detective');
  // The goons watch both heroes: put player 2 in plain sight in front of one.
  const seen = await page.evaluate(async () => {
    const G = window.__game, b = G.players[1].hero;
    const g = G.stealth.goons.find((x) => x.e.alive);
    const f = { x: Math.sin(g.e.yaw), z: Math.cos(g.e.yaw) };
    b.teleport({ x: g.e.pos.x + f.x * 4, y: g.e.pos.y, z: g.e.pos.z + f.z * 4 });
    for (let i = 0; i < 40; i++) { await new Promise((r) => setTimeout(r, 50)); if (g.seen?.hero === b) return true; }
    return g.seen?.hero === b;
  });
  expect(seen).toBe(true);
  // Revive: knock player 1 out; the bot (brought back beside them) holds the revive button.
  await page.evaluate(() => { const G = window.__game; G.winFight(); G.flow.bringAlong(); G.combat.killHero(); });
  await page.waitForFunction(() => window.__game.players[0].hero.dead === true, null, { timeout: 5000 });
  await expect(page.locator('.revive-ring')).not.toHaveCount(0);
  await page.waitForFunction(() => window.__game.players[0].hero.dead === false, null, { timeout: 40000 });
  expect(errors).toEqual([]);
});

test('two-player story slice: brawl, Batmobile chase with a passenger, Harley, the boss to the end', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await collectErrors(page);
  await page.goto('/?at=f1&p2=bot&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.players?.length === 2 && window.__game.flow.mode === 'play', null, { timeout: 60000 });
  const step = () => page.evaluate(() => window.__game.flow.objectives.step?.id ?? null);
  // A brawl, really fought for a while by both heroes, then finished.
  await page.evaluate(() => { const G = window.__game, s = G.flow.target; G.teleport({ x: s.x, y: s.y, z: s.z }); });
  await page.waitForFunction(() => window.__game.enemies.some((e) => e.alive && e.aware), null, { timeout: 20000 });
  for (let i = 0; i < 20; i++) { await page.keyboard.press('KeyE'); await page.waitForTimeout(150); }
  await shot(page, '05-brawl');
  for (let k = 0; k < 4 && (await step()) === 'f1'; k++) { await page.evaluate(() => window.__game.winFight()); await page.waitForTimeout(1800); }
  expect(await step()).not.toBe('f1');
  // Story placements bring the partner along.
  await page.evaluate(() => window.__game.jump('boardBatmobile'));
  await page.waitForTimeout(800);
  const apart = await page.evaluate(() => { const [a, b] = window.__game.players; return Math.hypot(a.hero.pos.x - b.hero.pos.x, a.hero.pos.z - b.hero.pos.z); });
  expect(apart).toBeLessThan(6);
  // Board: player 1 gets in; the chase seats player 2 as the passenger.
  await page.waitForFunction(() => !window.__game.vehicles?.batmobile?.arriving, null, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); });
  await page.waitForFunction(() => window.__game.flow.objectives.step?.type === 'chase', null, { timeout: 20000 });
  await page.waitForFunction(() => window.__game.coop.seats.seated(window.__game.players[1]), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot(page, '06-chase-passenger');
  // [verify] The chase starts once the beat's radio lines end (flow.js startAsync), and the radio now
  // waits by line length: with the brawl's lines still queued that is past 30 s. Skip the dialogue
  // the way the playthrough does; the chase itself still has to start and be won.
  await page.waitForFunction(() => { window.__game.radio?.skip?.(); return window.__game.vehicles.debugWin(); }, null, { timeout: 30000, polling: 400 });
  await page.waitForFunction(() => window.__game.flow.objectives.step?.type !== 'chase', null, { timeout: 20000 });
  // Harley.
  await page.evaluate(() => window.__game.jump('harleyFight'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const G = window.__game, s = G.flow.target; if (s) G.teleport({ x: s.x, y: s.y, z: s.z }); });
  await page.waitForTimeout(1500);
  await shot(page, '07-harley');
  for (let k = 0; k < 6 && (await step()) === 'harleyFight'; k++) { await page.evaluate(() => window.__game.winFight()); await page.waitForTimeout(1500); }
  expect(await step()).not.toBe('harleyFight');
  // The boss with two targets, to the end.
  await page.evaluate(() => window.__game.jump('boss'));
  await page.waitForFunction(() => window.__game.boss?.phase >= 1, null, { timeout: 30000, polling: 300 }).catch(() => {});
  for (let i = 0; i < 160 && (await step()) === 'boss'; i++) {
    await page.evaluate(() => {
      const G = window.__game, B = G.boss;
      if (G.comic.playing) G.comic.skip?.();
      G.winFight();
      if (B.phase === 2 && B.joker.state === 'roam') { B.joker.state = 'throw'; B.joker.t = 0; B.joker.applyHit({ outcome: 'stun' }, B.joker.pos); for (let k = 0; k < 5; k++) B.joker.applyHit({ outcome: 'hit' }, G.hero.pos); }
      if (B.phase === 3 && ['approach', 'windup', 'backoff'].includes(B.joker.state)) { B.joker.state = 'staggered'; B.joker.finishable = true; B.joker.applyHit({ outcome: 'hit' }, G.hero.pos); }
    });
    if (i === 6) await shot(page, '08-boss');
    for (let j = 0; j < 4; j++) await page.keyboard.press('Space');
    await page.waitForTimeout(700);
  }
  expect(await step()).not.toBe('boss');
  expect(await page.evaluate(() => window.__game.players.length)).toBe(2);
  expect(errors).toEqual([]);
});
