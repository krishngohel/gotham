// [onboard] Earned abilities and the HUD flow, end to end, on the real game (run it against a
// production build too: BASE_URL=http://localhost:5831 after `npm run build` + `vite preview`).
// No ?god=1 here: that sandbox opens every ability. These play the story's gates.
import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.state.frame > 30 && window.__game.abilities;
async function boot(page, query) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(ready, null, { timeout: 120000 });
  // Clear whatever comic, cinematic or line plays as the step begins.
  await page.evaluate(() => { const G = window.__game; G.cinematic?.skip?.(); G.comic?.skip?.(); G.radio?.skip?.(); });
  await page.mouse.click(640, 400);
  return errors;
}
// A squad round the hero, awake, and a big combo on the meter.
const brawl = (page) => page.evaluate(() => {
  const G = window.__game, h = G.hero.pos;
  G.combat.setEnemies([[-3, -3], [3, -3], [0, 4], [4, 2]].map(([dx, dz]) => G.spawn('grunt', { x: h.x + dx, y: h.y, z: h.z + dz })));
  for (const e of G.combat.enemies) e.wake();
  for (let i = 0; i < 14; i++) G.combat.combo.hit();
});
const has = (page, id) => page.evaluate((id) => window.__game.abilities.has(id), id);

test('a fresh save cannot chain, special or grapple until the story gives each', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page, '?at=f1&new=1');
  expect(await page.evaluate(() => window.__game.abilities.mode)).toBe('story');
  for (const id of ['grapple', 'punch', 'counter']) expect(await has(page, id), id).toBe(true);
  for (const id of ['chainTakedown', 'specialTakedown', 'batSwarm', 'grappleBoost', 'dodge', 'throw', 'detective', 'batwing']) expect(await has(page, id), id).toBe(false);
  await brawl(page);
  await page.waitForTimeout(300);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(120);
  await page.keyboard.press('KeyX');
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => ({ ctl: window.__game.hero.control?.name ?? null, chainsShown: !document.querySelector('.hud-chains')?.classList.contains('hidden') }));
  expect(st.ctl).not.toBe('chain');
  expect(st.ctl).not.toBe('special');
  expect(st.chainsShown).toBe(false);
  // Detective vision does not switch on either.
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => !!window.__game.state.detectiveOn)).toBe(false);
  expect(errors).toEqual([]);
});

test('the same squad with ?abilities=all: the chain fires', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, '?at=f1&new=1&abilities=all');
  await brawl(page);
  await page.waitForTimeout(400);
  let ctl = null;
  for (let i = 0; i < 6 && ctl !== 'chain'; i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(120); ctl = await page.evaluate(() => window.__game.hero.control?.name ?? null); }
  expect(ctl).toBe('chain');
});

test('the grapple: no marker or line before the Docks beat, a real grapple after it', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, '?at=courierIntro&new=1');
  expect(await has(page, 'grapple')).toBe(false);
  for (let i = 0; i < 10; i++) { await page.keyboard.press('KeyF'); await page.waitForTimeout(80); }
  expect(await page.evaluate(() => ({ t: window.__game.grapple.target, c: window.__game.hero.control?.name ?? null }))).toEqual({ t: null, c: null });
  // The story moves on to the glide to the Docks: the grapnel arrives, with its card.
  await page.evaluate(() => window.__game.jump('toDocks'));
  await page.waitForTimeout(500);
  expect(await has(page, 'grapple')).toBe(true);
  expect(await page.evaluate(() => window.__game.abilities.log)).toContain('grapple');
});

test('?at= grants what the story would have by that step', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, '?at=monarchBalcony&new=1');
  for (const id of ['grapple', 'dodge', 'throw', 'capeStun', 'diveBomb', 'wallRun', 'silentTakedown', 'detective']) expect(await has(page, id), id).toBe(true);
  for (const id of ['beatdown', 'batwing', 'fastTravel', 'specialTakedown', 'chainTakedown']) expect(await has(page, id), id).toBe(false);
  await page.goto('/?at=toPlaza&new=1');
  await page.waitForFunction(ready, null, { timeout: 120000 });
  expect(await has(page, 'batwing')).toBe(true);
  expect(await has(page, 'specialTakedown')).toBe(false);
});

test('a teaching beat completes when she performs the move (twice takes the card down)', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, '?at=f2&new=1');
  expect(await has(page, 'dodge')).toBe(true);
  await page.evaluate(() => { window.__learned = []; window.__game.events.on('abilityLearned', ({ id }) => window.__learned.push(id)); });
  // Roll, wait for it to finish (a loaded GPU stretches it), roll again.
  for (let i = 0; i < 6 && (await page.evaluate(() => window.__game.abilities.practised('dodge'))) < 2; i++) {
    await page.keyboard.press('KeyC');
    await page.waitForFunction(() => window.__game.hero.state !== 'roll' && !window.__game.hero.control, null, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  const r = await page.evaluate(() => ({ step: window.__game.flow.objectives.step.id, ctl: window.__game.hero.control?.name, learned: window.__learned, n: window.__game.abilities.practised('dodge'), saved: window.__game.progress.abilities.practised.dodge ?? 0 }));
  expect(r.learned, JSON.stringify(r)).toContain('dodge');
  expect(r.n).toBeGreaterThanOrEqual(2);
  expect(r.saved).toBeGreaterThanOrEqual(2);
  // The tick chip shows under the caption.
  await expect(page.locator('.hud-chip.practised')).toHaveCount(1, { timeout: 3000 });
});

test('the next goal eases in with distance as she approaches, then hands off a beat after reaching it', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, '?at=toYard&new=1');
  const site = await page.evaluate(() => { const t = window.__game.flow.target; return { x: t.x, y: t.y, z: t.z }; });
  const op = [];
  for (const d of [80, 40, 30, 22, 16]) {
    await page.evaluate(([s, d]) => window.__game.teleport({ x: s.x + d, y: s.y, z: s.z }), [site, d]);
    await page.waitForTimeout(450);
    op.push(await page.evaluate(() => Number(getComputedStyle(document.querySelector('.hud-arrive')).opacity)));
  }
  expect(op[0]).toBeLessThan(0.05);
  for (let i = 1; i < op.length; i++) expect(op[i], `ramp ${op.join(', ')}`).toBeGreaterThanOrEqual(op[i - 1]);
  expect(op.at(-1)).toBeGreaterThan(0.8);
  expect(await page.evaluate(() => document.querySelector('.hud-arrive .arrive-t').textContent)).toMatch(/container yard/i);
  // Reach it: the step changes at once, the new goal's banner waits for the hand-off beat.
  await page.evaluate((s) => window.__game.teleport({ x: s.x, y: s.y, z: s.z }), site);
  await page.waitForFunction(() => window.__game.flow.objectives.step.id === 'f2', null, { timeout: 5000 });
  const early = await page.evaluate(() => !!document.querySelector('.hud-banner.show'));
  expect(early).toBe(false);
});

test('one centre card at a time', async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, '?at=signal&new=1');
  await page.evaluate(() => { const h = window.__game.hud; h.banner('A NEW GOAL'); h.card('WAYNETECH DELIVERY', 'one'); h.card('LEVEL 2', 'two'); });
  let worst = 0, sawCard = false;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('.hud .hud-banner.show, .hud .hud-card.show').length);
    worst = Math.max(worst, n);
    sawCard ||= await page.evaluate(() => !!document.querySelector('.hud-card.show'));
    await page.waitForTimeout(150);
  }
  expect(worst).toBe(1);
  expect(sawCard).toBe(true);
});
