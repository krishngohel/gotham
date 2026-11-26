import { test, expect } from '@playwright/test';

// Photo mode (workstream L1, item 7): camera, filter, bubbles, a logo-free PNG export through the
// ink pipeline, the local gallery, and closing back into play; then player 2 in split screen.
// SHOTS=1 saves screenshots to docs/design/shots/prog/.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
const SHOTS = process.env.SHOTS === '1';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `docs/design/shots/prog/${name}.jpg`, type: 'jpeg', quality: 70 }); };

async function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  return errors;
}

// The canvas and the ink view sizes, to prove an export puts everything back.
const sizes = () => {
  const G = window.__game;
  return { cw: G.renderer.domElement.width, ch: G.renderer.domElement.height, pr: G.renderer.getPixelRatio(), views: G.ink.views.map((v) => [...v.px]), aspect: G.camera.aspect };
};
// Decodes the exported PNG and returns its pixel size.
const decode = async (url) => { const img = new Image(); img.src = url; await img.decode(); return { w: img.naturalWidth, h: img.naturalHeight }; };

test('photo mode: camera, filter, bubble, 4K-capped PNG export, gallery, back to play', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await collectErrors(page);
  await page.goto('/?at=f1&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.flow?.mode === 'play' && !window.__game.state.paused, null, { timeout: 60000 });
  await page.evaluate(() => { try { localStorage.removeItem('gotham-photos-v1'); } catch { /* */ } });
  await page.waitForTimeout(500);

  // Open with the photo key (O): one player, so the world freezes.
  await page.keyboard.press('KeyO');
  await page.waitForFunction(() => window.__game.photo.active, null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.photo.freezesWorld)).toBe(true);
  await expect(page.locator('.photo-panel')).toBeVisible();
  const t0 = await page.evaluate(() => window.__game.state.t);

  // Fly forward and orbit-look; the camera moves, time does not.
  const c0 = await page.evaluate(() => window.__game.photo.state.cam);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(450);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ArrowLeft');
  const c1 = await page.evaluate(() => window.__game.photo.state.cam);
  expect(Math.hypot(c1.x - c0.x, c1.z - c0.z, c1.y - c0.y)).toBeGreaterThan(0.3);
  expect(c1.yaw).not.toBeCloseTo(c0.yaw, 2);
  expect(await page.evaluate(() => window.__game.state.t)).toBe(t0);

  // Filters (1 cycles: ink -> noir), focus, a pose, a speech bubble (B) and a sticker button.
  await page.keyboard.press('Digit1');
  expect(await page.evaluate(() => window.__game.photo.state.filter)).toBe('noir');
  await page.keyboard.press('KeyV');
  expect(await page.evaluate(() => window.__game.photo.state.focusMode)).toBe('auto');
  await page.keyboard.press('KeyB');
  await page.locator('.photo-panel .ph-add[data-kind="burst"]').click();
  expect(await page.evaluate(() => window.__game.photo.state.items.length)).toBe(2);
  await page.locator('.photo-panel .ph-item input').fill('Hold still. This is art.');
  await page.locator('.photo-panel .ph-item input').press('Enter'); // Enter leaves the text box
  expect(await page.evaluate(() => window.__game.photo.state.items[1].text)).toBe('Hold still. This is art.');
  const poses = await page.evaluate(() => window.__game.photo.poses());
  expect(poses.length).toBeGreaterThan(3);
  await page.keyboard.press('Digit4');
  expect(await page.evaluate(() => window.__game.photo.state.pose)).toBe(poses[0]);
  await page.keyboard.press('BracketRight');
  for (const f of ['golden', 'blueprint', 'neon']) {
    await page.evaluate((x) => window.__game.photo.setFilter(x), f);
    await page.waitForTimeout(120);
    if (f === 'golden') await shot(page, 'photo-golden-bubbles');
  }
  await page.evaluate(() => window.__game.photo.setFilter('noir'));
  await page.waitForTimeout(150);
  await shot(page, 'photo-noir-panel');

  // Export at 4K (capped by the tier and the GPU) through the ink pipeline; the canvas comes back
  // exactly as it was and the shot lands in the gallery.
  const before = await page.evaluate(sizes);
  await page.evaluate(() => window.__game.photo.setExportSize('4k'));
  const cap = await page.evaluate(() => window.__game.photo.state.exportCap);
  const download = page.waitForEvent('download', { timeout: 20000 });
  const ex = await page.evaluate(() => window.__game.photo.save());
  expect(ex).not.toBeNull();
  console.log(`photo export ${ex.width}x${ex.height} (tier cap ${cap}), ${ex.bytes} bytes`);
  expect((await download).suggestedFilename()).toMatch(/^gotham-\d{8}-\d{6}\.png$/);
  expect(Math.max(ex.width, ex.height)).toBeLessThanOrEqual(cap);
  expect(Math.max(ex.width, ex.height)).toBeGreaterThanOrEqual(Math.min(cap, 2048));
  expect(ex.type).toBe('image/png');
  expect(ex.bytes).toBeGreaterThan(10000);
  const px = await page.evaluate(decode, ex.url);
  expect(px).toEqual({ w: ex.width, h: ex.height });
  await page.waitForTimeout(200);
  expect(await page.evaluate(sizes)).toEqual(before);
  expect(ex.gallery).toBe(true);
  expect(await page.evaluate(() => window.__game.photo.gallery.count)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gotham-photos-v1')).length)).toBe(1);

  // A second, screen-size shot; then the gallery shows both.
  await page.evaluate(() => window.__game.photo.setExportSize('screen'));
  const ex2 = await page.evaluate(() => window.__game.photo.save());
  expect(ex2.width).toBe(before.cw);
  await page.keyboard.press('KeyI');
  await expect(page.locator('.photo-gallery .ph-cell')).toHaveCount(2);
  await shot(page, 'photo-gallery');
  await page.keyboard.press('Escape');
  await expect(page.locator('.photo-gallery')).toHaveCount(0);
  expect(await page.evaluate(() => window.__game.progress.stats.photos)).toBeGreaterThanOrEqual(2);

  // Esc closes: play resumes, time runs, the pose and filter are gone, the hero is drawn.
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.photo.active, null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.state.paused)).toBe(false);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.state.t)).toBeGreaterThan(t0);
  expect(await page.evaluate(() => window.__game.hero.bat.root.visible && window.__game.ink.uniforms.uFilter.value === 0)).toBe(true);
  await expect(page.locator('.photo-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('split screen: player 2 opens photo mode on its own view while the world keeps running', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await collectErrors(page);
  await page.goto('/?at=f1&p2=bot&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.players?.length === 2 && window.__game.flow.mode === 'play' && window.__game.split.split, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  const opened = await page.evaluate(() => window.__game.photo.open(window.__game.players[1]));
  expect(opened).toBe(true);
  const st = await page.evaluate(() => window.__game.photo.state);
  expect(st).toMatchObject({ active: true, live: true, slot: 1, clock: false, weather: false });
  expect(await page.evaluate(() => window.__game.photo.freezesWorld)).toBe(false);
  // Still split: player 1's view keeps playing and time runs.
  expect(await page.evaluate(() => window.__game.split.split && !window.__game.state.paused)).toBe(true);
  const t0 = await page.evaluate(() => window.__game.state.t);
  // Player 2's camera is the photo camera: move it and check that view's camera follows.
  await page.evaluate(() => window.__game.photo.nudge({ moveY: 1, up: 0.5 }, 0.6));
  await page.waitForTimeout(100);
  const camOk = await page.evaluate(() => {
    const G = window.__game, c = G.players[1].view.camera, s = G.photo.state.cam;
    return Math.hypot(c.position.x - s.x, c.position.y - s.y, c.position.z - s.z) < 0.05;
  });
  expect(camOk).toBe(true);
  // Player 2's HUD panel is hidden, player 1's isn't.
  expect(await page.evaluate(() => document.querySelector('.hud[data-player="1"]')?.style.visibility)).toBe('hidden');
  expect(await page.evaluate(() => document.querySelector('.hud[data-player="0"]')?.style.visibility ?? '')).not.toBe('hidden');
  await page.evaluate(() => { const P = window.__game.photo; P.setFilter('neon'); P.setFocus('auto', 0, 0.8); P.addItem('thought'); P.setHide('me'); });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.state.t)).toBeGreaterThan(t0);
  expect(await page.evaluate(() => window.__game.players[1].hero.bat.root.visible)).toBe(true); // hidden only while its own camera draws
  await shot(page, 'photo-split-p2');
  const before = await page.evaluate(sizes);
  const ex = await page.evaluate(() => window.__game.photo.save());
  expect(ex.width).toBeGreaterThan(100);
  expect(await page.evaluate(decode, ex.url)).toEqual({ w: ex.width, h: ex.height });
  await page.waitForTimeout(200);
  expect(await page.evaluate(sizes)).toEqual(before);
  await page.evaluate(() => window.__game.photo.close());
  expect(await page.evaluate(() => window.__game.photo.active)).toBe(false);
  expect(await page.evaluate(() => document.querySelector('.hud[data-player="1"]')?.style.visibility)).not.toBe('hidden');
  // Player 2's input works again (the mute was taken off).
  expect(await page.evaluate(() => { const i = window.__game.players[1].input; return i.pressed.toString().includes('=> false') === false; })).toBe(true);
  expect(errors).toEqual([]);
});
