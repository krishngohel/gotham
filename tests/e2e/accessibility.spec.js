import { test, expect } from '@playwright/test';

// [prog] a11y (wave 3 L1 item 6): subtitles from the audio hook, telegraph glyphs that differ by
// shape (not only colour), and the Accessibility tab persisting across a reload.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;

function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('a spoken line shows as a subtitle with its speaker', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.audio.say('Do mind the gargoyles, sir.', 'alfred'));
  const line = page.locator('.subtitles .sub-line').first();
  await expect(line).toBeVisible();
  await expect(line).toContainText('Do mind the gargoyles, sir.');
  await expect(line.locator('.sub-name')).toHaveText(/\w+:/);
  // Off in Settings > Audio (the audio pref): no caption.
  await page.evaluate(async () => {
    const { setAudioPrefs } = await import('/src/audio/prefs.js');
    setAudioPrefs({ subtitles: false });
    window.__game.audio.say('This one stays quiet.', 'alfred');
  });
  await page.waitForTimeout(300);
  await expect(page.locator('.subtitles')).not.toContainText('This one stays quiet.');
  await page.evaluate(async () => { const { setAudioPrefs } = await import('/src/audio/prefs.js'); setAudioPrefs({ subtitles: true }); });
  expect(errors).toEqual([]);
});

test('counter, unblockable and ranged tells have different shapes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?fight=test&god=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.enemies.length > 0, null, { timeout: 20000 });
  const tells = await page.evaluate(() => {
    const G = window.__game;
    setInterval(() => { if (G.comic?.playing) G.comic.skip?.(); }, 100);
    for (const e of [...G.combat.enemies]) G.despawn(e);
    const h = G.hero;
    const grunt = G.spawn('grunt', { x: h.pos.x + 8, y: h.pos.y, z: h.pos.z });
    const brute = G.spawn('brute', { x: h.pos.x - 8, y: h.pos.y, z: h.pos.z });
    const rifle = G.spawn('rifle', { x: h.pos.x, y: h.pos.y, z: h.pos.z + 8 });
    G.combat.setEnemies([grunt, brute, rifle]);
    // The HUD draws the glyph each goon's wind-up would show (src/enemies/roleKit.js colours).
    const hud = G.hud.primary ?? G.hud;
    hud.glyph(grunt.id, 300, 300, true, 'blue');
    hud.glyph(brute.id, 500, 300, true, 'red');
    hud.glyph(rifle.id, 700, 300, true, 'red');
    return [grunt, brute, rifle].map((e) => {
      const g = [...document.querySelectorAll('.glyph')].find((x) => x.style.left === `${e.id === grunt.id ? 300 : e.id === brute.id ? 500 : 700}px`);
      const pat = g?.querySelector('path.pat');
      // Read in the same task: the game's next frame prunes glyphs no goon is winding up.
      return { tell: g?.dataset.tell, color: g?.dataset.color, d: g?.querySelector('path.shape')?.getAttribute('d'), pat: !!pat, patDisplay: pat ? getComputedStyle(pat).display : null };
    });
  });
  expect(tells.map((t) => t.tell)).toEqual(['counter', 'unblockable', 'ranged']);
  expect(new Set(tells.map((t) => t.d)).size).toBe(3);
  // The two red tells share a colour but not a shape or a pattern.
  expect(tells[1].color).toBe(tells[2].color);
  expect(tells[1].pat && tells[2].pat).toBe(true);
  expect(tells[1].patDisplay).not.toBe('none');
  expect(errors).toEqual([]);
});

test('the Accessibility tab saves its options across a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.locator('.title-menu .mbtn', { hasText: 'Settings' }).click();
  await page.locator('.settings-menu .tab', { hasText: 'Accessibility' }).click();
  const row = (label) => page.locator('.settings-menu .set-row', { hasText: label });
  await row('Reduce flashing').locator('button').click();
  await row('Reduce motion').locator('button').click();
  await row('Sprint').locator('button', { hasText: 'Toggle' }).click();
  await row('Subtitle size').locator('button', { hasText: 'Large' }).click();
  await expect(page.locator('body')).toHaveClass(/a11y-flash-reduce/);
  // Text size slider.
  await row('Text size').locator('input[type=range]').evaluate((r) => { r.value = '1.3'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.reload();
  await page.waitForFunction(ready, null, { timeout: 90000 });
  const a = await page.evaluate(() => ({ ...window.__game.settings.access, cls: document.body.className, text: getComputedStyle(document.documentElement).getPropertyValue('--a11y-text').trim(), sprintMode: window.__game.input.holdModes.sprint }));
  expect(a).toMatchObject({ flashReduce: true, reducedMotion: true, sprint: 'toggle', subtitleSize: 'large', textSize: 1.3, text: '1.3', sprintMode: 'toggle' });
  expect(a.cls).toContain('a11y-flash-reduce');
  expect(a.cls).toContain('a11y-reduced-motion');
  // The pad section and the per-player pad look are there too.
  await page.locator('.title-menu .mbtn', { hasText: 'Settings' }).click();
  await expect(page.locator('.settings-menu .pad-rebind').first()).toBeVisible();
  await page.locator('.settings-menu .tab', { hasText: 'Camera' }).click();
  await expect(page.locator('.settings-menu .set-row', { hasText: 'Pad 2 look sensitivity' })).toBeVisible();
  expect(errors).toEqual([]);
});
