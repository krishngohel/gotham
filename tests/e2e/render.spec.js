import { test, expect } from '@playwright/test';
import sharp from 'sharp';

const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;

async function collectErrors(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// The multi-view ink pipeline (contract 4.4): ?views=2 draws the same scene from two cameras into
// the two halves of the canvas. Both halves must show a real picture, and not the same one.
test('two views render side by side, both non-blank and different', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.goto('/?new=1&views=2&q=high');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.waitForFunction(() => window.__game.state.frame > 60, null, { timeout: 30000 });
  const png = await page.screenshot();
  const { width, height } = await sharp(png).metadata();
  const half = Math.floor(width / 2) - 4;
  // A band near the top only: the title menu sits over the middle of the screen.
  const box = (left) => ({ left, top: Math.floor(height * 0.08), width: half, height: Math.floor(height * 0.22) });
  const L = await sharp(png).extract(box(0)).raw().toBuffer();
  const R = await sharp(png).extract(box(width - half)).raw().toBuffer();
  const stdev = async (left) => (await sharp(png).extract(box(left)).stats()).channels[0].stdev;
  expect(await stdev(0)).toBeGreaterThan(6);
  expect(await stdev(width - half)).toBeGreaterThan(6);
  let diff = 0;
  for (let i = 0; i < L.length; i++) diff += Math.abs(L[i] - R[i]);
  expect(diff / L.length).toBeGreaterThan(8);
  // The gutter between the panels is inked: in most rows the darkest pixel near the middle is ink
  // (the title logo crosses the middle in a few rows, so take the median row).
  const gw = 16, gy = Math.floor(height * 0.3), gh = Math.floor(height * 0.6);
  const G = await sharp(png).extract({ left: Math.floor(width / 2) - gw / 2, top: gy, width: gw, height: gh }).removeAlpha().raw().toBuffer();
  const rowMin = [];
  for (let y = 0; y < gh; y++) {
    let m = 255;
    for (let x = 0; x < gw; x++) m = Math.min(m, G[(y * gw + x) * 3]);
    rowMin.push(m);
  }
  rowMin.sort((a, b) => a - b);
  const darkest = rowMin[rowMin.length >> 1];
  expect(darkest).toBeLessThan(30);
  expect(errors).toEqual([]);
});

// Software rendering (faked: the renderer string reads as SwiftShader) gets the comic-styled
// hardware-acceleration dialog with this browser's steps, a working "Check again" and
// "Play anyway (Potato)". Auto quality seeds Potato for a software renderer.
test('a software renderer gets the hardware-acceleration dialog', async ({ page }) => {
  const errors = await collectErrors(page);
  await page.addInitScript(() => {
    const fake = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)';
    for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) {
      const orig = C.prototype.getParameter;
      C.prototype.getParameter = function getParameter(p) { return p === 0x9246 || p === 0x1F01 ? fake : orig.call(this, p); };
    }
  });
  // ?hwcheck=1: automated browsers only get the dialog when asked, so other tests never see it.
  await page.goto('/?new=1&hwcheck=1');
  await page.waitForFunction(ready, null, { timeout: 120000 });
  const dialog = page.locator('.hwaccel');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-browser', 'chrome');
  await expect(dialog).toContainText('hardware acceleration is off');
  await expect(dialog.locator('code').first()).toHaveText('chrome://settings/system');
  await expect(dialog).toContainText('Use graphics acceleration when available');
  // Really readable, not just in the DOM (the comic page CSS once hid a `.panel`'s children).
  expect(await dialog.locator('ol').evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  expect(await page.evaluate(() => window.__game.ink.normals)).toBe('depth');
  await dialog.locator('button.check').click();
  await expect(dialog.locator('.status')).toContainText('Still drawing in software');
  await dialog.locator('button.anyway').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.title-menu')).toBeVisible();
  expect(errors).toEqual([]);
});
