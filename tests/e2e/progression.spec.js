// Wave 3 progression (workstream L1): the skill tree page, save slots with export/import, and the
// new-game difficulty row.
import { test, expect } from '@playwright/test';

async function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
async function boot(page, query) {
  await page.goto(`/?${query}`);
  await page.waitForFunction(() => window.__game?.wayne, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.cinematic?.skip());
  await page.evaluate(() => window.__game.comic.playing && window.__game.comic.skip());
  await page.waitForTimeout(600);
}
async function title(page) {
  await page.goto('/');
  await page.waitForSelector('.title-menu', { timeout: 90000 });
}

test('skill tree: buy nodes on the page, see their effects, respec at the bench', async ({ page }) => {
  const errors = await collectErrors(page);
  await boot(page, 'at=toNeon&god=1&new=1');
  await page.evaluate(() => window.__game.wayne.award(3000, 'test'));
  await page.keyboard.press('Escape');
  await page.locator('.pause-menu .mbtn', { hasText: 'WayneTech' }).click();
  await expect(page.locator('.st-menu')).toBeVisible();
  // A node's detail shows what it changes and a demo line.
  await page.locator('.st-node', { hasText: 'Double Counter' }).hover();
  await expect(page.locator('.st-detail')).toContainText('Counter two attackers');
  await expect(page.locator('.st-ddemo')).toContainText('Picture it');
  await page.locator('.st-node.buyable', { hasText: 'Quick Reflexes' }).click();
  await page.locator('.st-node.buyable', { hasText: 'Double Counter' }).click();
  await expect(page.locator('.st-node.owned', { hasText: 'Double Counter' })).toBeVisible();
  // Act-gated nodes stay shut in Night One.
  await expect(page.locator('.st-node.act', { hasText: 'Triple Counter' })).toBeVisible();
  // Arrow keys move focus between nodes.
  await page.locator('.st-node', { hasText: 'Double Counter' }).focus();
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => document.activeElement?.dataset.id)).toBe('reflexes');
  expect(await page.evaluate(() => [window.__game.wayne.effects.multiCounter, window.__game.wayne.effects.counterWindow, window.__game.wayne.free])).toEqual([2, 0.15, 1]);
  await page.locator('.st-menu .mbtn', { hasText: 'Back' }).click();
  await expect(page.locator('.pause-menu')).toBeVisible();
  await page.locator('.pause-menu .mbtn', { hasText: 'Resume' }).click();
  // The Batcave bench (station 'skillTree') can respec once per act.
  await page.evaluate(() => import('/src/ui/stations.js').then((m) => m.openStation('skillTree', { onClose: () => { window.__benchClosed = true; } })));
  await page.locator('.st-respec').click();
  expect(await page.evaluate(() => [window.__game.progress.wayne.owned.length, window.__game.wayne.free])).toEqual([0, 3]);
  await page.locator('.st-menu .mbtn', { hasText: 'Back' }).click();
  expect(await page.evaluate(() => window.__benchClosed)).toBe(true);
  expect(errors).toEqual([]);
});

test('save slots: copy, delete with confirmation, export and import round trip', async ({ page }) => {
  const errors = await collectErrors(page);
  // Seed slot 1 with a save in progress. [verify] With its stepId: a save's place comes only from its id
  // (src/game/storyMigrate.js), so an index-only seed was a fresh save; the old title showed the slot
  // line regardless, polish's shows it on Continue (.tm-sub), which a fresh save does not have.
  await page.goto('/?new=1');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('gotham-progress-v1', JSON.stringify({ step: 9, stepId: 'toYard', trophies: [2], seenIntro: true, stats: { playTime: 900 }, wayne: { xp: 2300, owned: ['plating1'], medals: {} } }));
  });
  await title(page);
  await expect(page.locator('.title-menu .tm-primary .tm-sub')).toContainText('Slot 1');
  await page.locator('.mbtn.slots').click();
  const s1 = page.locator('.slot-card[data-slot="1"]');
  await expect(s1).toContainText('Level 3');
  await s1.locator('.slot-copy-2').click();
  await expect(page.locator('.slot-card[data-slot="2"]')).toContainText('Level 3');
  // Copy over a used slot asks first.
  await page.locator('.slot-card[data-slot="1"] .slot-copy-2').click();
  await expect(page.locator('.slot-panel.confirm')).toBeVisible();
  await page.locator('.slot-no').click();
  // Export slot 2 as a code.
  await page.locator('.slot-card[data-slot="2"] .slot-export').click();
  const code = await page.locator('.slot-panel textarea.slot-code').inputValue();
  expect(code).toMatch(/^GOTHAM1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  // Delete slot 2 (confirm), it is empty.
  await page.locator('.slot-card[data-slot="2"] .slot-delete').click();
  await page.locator('.slot-yes').click();
  await expect(page.locator('.slot-card[data-slot="2"]')).toContainText('Empty');
  // A damaged code is refused with a message.
  await page.locator('.slot-card[data-slot="3"] .slot-import').click();
  await page.locator('.slot-paste').fill(code.slice(0, -2) + 'zz');
  await page.locator('.slot-doimport').click();
  await expect(page.locator('.slot-panel.bad')).toContainText('damaged');
  // The good code imports into slot 3.
  await page.locator('.slot-card[data-slot="3"] .slot-import').click();
  await page.locator('.slot-paste').fill(code);
  await page.locator('.slot-doimport').click();
  await expect(page.locator('.slot-card[data-slot="3"]')).toContainText('Level 3');
  // Play slot 3: the page reloads on that slot, and the original key still holds slot 1.
  await page.locator('.slot-card[data-slot="3"] .slot-play').click();
  await page.waitForSelector('.title-menu', { timeout: 90000 });
  await expect(page.locator('.title-menu .tm-primary .tm-sub')).toContainText('Slot 3');
  expect(await page.evaluate(() => [window.__game.progress.wayne.xp, JSON.parse(localStorage.getItem('gotham-progress-v1')).step, localStorage.getItem('gotham-slot-v1')])).toEqual([2300, 9, '3']);
  await page.evaluate(() => localStorage.removeItem('gotham-slot-v1'));
  expect(errors).toEqual([]);
});

test('new game: the difficulty row sets the run difficulty (Knightmare surfaced)', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/?new=1');
  await page.evaluate(() => { localStorage.clear(); });
  await title(page);
  await page.locator('.title-menu .mbtn.primary').click();
  await page.locator('.diff-card.diff-knightmare').click();
  await expect(page.locator('.diff-desc')).toContainText('No counter warnings');
  await page.locator('.mod-limit').click();
  await page.locator('.suit-card.suit-m').click();
  await page.waitForFunction(() => window.__game?.wayne, null, { timeout: 90000 });
  expect(await page.evaluate(() => [window.__game.settings.difficulty, window.__game.progress.mode.difficulty, window.__game.progress.mode.modifiers.checkpointLimit])).toEqual(['knightmare', 'knightmare', 3]);
  // Put the setting back for other specs.
  await page.evaluate(() => { localStorage.clear(); });
  expect(errors).toEqual([]);
});
