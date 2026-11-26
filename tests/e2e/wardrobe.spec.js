// [prog] suits: the Batcave suit vault (station 'suits', src/ui/wardrobe.js) and new-suit toasts.
import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('the suit vault picks a suit and it persists across a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?new=1&god=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(async () => {
    const { openStation } = await import('/src/ui/stations.js');
    window.__closed = false;
    window.__vault = openStation('suits', { onClose: () => { window.__closed = true; } });
  });
  const vault = page.locator('.wardrobe-layer');
  await expect(vault).toBeVisible();
  // Every roster hero has a tab; a fresh save shows locked suits with their unlock text.
  expect(await vault.locator('.wd-tab').count()).toBeGreaterThanOrEqual(10);
  await expect(vault.locator('.wd-card[data-id="stealth"]')).toHaveAttribute('data-state', 'locked');
  await expect(vault.locator('.wd-card[data-id="stealth"] .sdesc')).toContainText('Stop five street crimes');
  await expect(vault.locator('.wd-card[data-id="stealth"] .wd-perk')).toContainText('Perk off');
  await expect(vault.locator('.wd-card[data-id="m"]')).toHaveClass(/wearing/);
  // Keyboard: the focused card moves with the arrows; Enter wears it.
  await page.keyboard.press('ArrowRight');
  const focused = await page.evaluate(() => document.activeElement?.dataset?.id);
  expect(focused).toBe('year-one');
  await page.keyboard.press('Enter');
  await expect(vault.locator('.wd-card[data-id="year-one"]')).toHaveClass(/wearing/);
  expect(await page.evaluate(() => window.__game.progress.suit)).toBe('year-one');
  // A locked suit refuses.
  await vault.locator('.wd-card[data-id="noir"]').click({ force: true });
  expect(await page.evaluate(() => window.__game.progress.suit)).toBe('year-one');
  // Hero tabs: Nightwing's looks.
  await page.keyboard.press('KeyE');
  await page.keyboard.press('KeyE');
  await expect(vault.locator('.wd-card[data-id="nightwing"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(vault).toHaveCount(0);
  expect(await page.evaluate(() => window.__closed)).toBe(true);

  await page.goto('/?god=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  expect(await page.evaluate(() => window.__game.progress.suit)).toBe('year-one');
  await page.evaluate(async () => { const { openStation } = await import('/src/ui/stations.js'); openStation('suits', {}); });
  await expect(page.locator('.wd-card[data-id="year-one"]')).toHaveClass(/wearing/);
  await page.screenshot({ path: 'docs/design/shots/prog/wardrobe.png' });
  expect(errors).toEqual([]);
});

test('a campaign reward unlocks a suit with a toast, once', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?fight=test&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => !!window.__game.hud && !!window.__wardrobe, null, { timeout: 30000 });
  const got = await page.evaluate(() => {
    const ids = [];
    window.__game.events.on('suitUnlocked', ({ id }) => ids.push(id));
    window.__game.events.emit('campaignReward', { id: 'suit.noir' });
    window.__game.events.emit('campaignReward', { id: 'suit.noir' });
    return { ids, rewarded: window.__game.progress.wardrobe.rewarded };
  });
  expect(got.ids).toEqual(['noir']);
  expect(got.rewarded).toEqual(['noir']);
  // [onboard] ?fight=test keeps a squad on her: the HUD director (src/ui/hudDirector.js) holds the
  // card over a fight and, after a while, collapses it to a chip under the caption. Either form counts.
  await page.waitForFunction(() => /NOIR/.test(document.querySelector('.hud-card.show .card-title')?.textContent ?? '') || [...document.querySelectorAll('.hud-chip')].some((c) => /NOIR/.test(c.textContent)), null, { timeout: 20000 });
  // The vault now offers it.
  await page.evaluate(async () => { const { openStation } = await import('/src/ui/stations.js'); openStation('suits', {}); });
  await expect(page.locator('.wd-card[data-id="noir"]')).toHaveAttribute('data-state', 'open');
  await expect(page.locator('.wd-note').last()).toContainText('next run');
  await page.screenshot({ path: 'docs/design/shots/prog/wardrobe-run.png' });
  expect(errors).toEqual([]);
});
