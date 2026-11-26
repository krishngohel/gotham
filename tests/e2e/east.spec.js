import { test, expect } from '@playwright/test';

// The east side (workstream H2) end to end: Robinson Park, Lakeshore Drive, the Amusement Mile
// pier, the Museum Campus and Arkham Island are reachable on foot and by car from the old city,
// count as visited, the lake rescues a hero who falls in, and a glide over the park finds perches.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
async function boot(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?at=start&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  for (let i = 0; i < 30; i++) {
    const busy = await page.evaluate(() => {
      const G = window.__game;
      if (G.cinematic?.active) { G.cinematic.skip(); return true; }
      if (G.comic?.playing) { G.comic.skip(); return true; }
      if (G.radio?.playing) { G.radio.skip(); return true; }
      return false;
    });
    if (!busy && i > 3) break;
    await page.waitForTimeout(250);
  }
  await page.mouse.click(640, 400);
  return errors;
}
const hero = (page) => page.evaluate(() => { const h = window.__game.hero; return { x: h.pos.x, y: h.pos.y, z: h.pos.z }; });
async function place(page, p, yaw) {
  await page.evaluate(([p, yaw]) => { const G = window.__game; G.hero.teleport(p, yaw); G.follow.snapBehind?.(yaw); }, [p, yaw]);
  await page.waitForTimeout(400);
}

test('walk from the old city east across Robinson Avenue into the park, then along the pier', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await place(page, { x: 226, y: 0.2, z: -30 }, Math.PI / 2);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.hero.pos.x > 290, null, { timeout: 30000 });
  await page.keyboard.up('KeyW');
  expect((await hero(page)).y).toBeGreaterThan(-0.3);
  await place(page, { x: 392, y: 3.2, z: -442 }, Math.PI / 2);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.hero.pos.x > 470, null, { timeout: 30000 });
  await page.keyboard.up('KeyW');
  expect((await hero(page)).y).toBeGreaterThan(2.8);
  const visited = await page.evaluate(() => window.__game.progress.districts);
  for (const d of ['robinsonPark', 'amusementMile']) expect(visited).toContain(d);
  expect(errors).toEqual([]);
});

test('walk the Arkham causeway up onto the island', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await place(page, { x: 372, y: 0.7, z: -80 }, Math.PI / 2);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.hero.pos.x > 598, null, { timeout: 60000 });
  await page.keyboard.up('KeyW');
  const h = await hero(page);
  expect(h.y).toBeGreaterThan(4.5);
  expect(await page.evaluate(() => window.__game.progress.districts)).toContain('arkham');
  expect(errors).toEqual([]);
});

test('drive the Batmobile down Lakeshore Drive and over the river-mouth viaduct', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  for (const [x, z0, z1] of [[345, -700, -430], [391, -312, -235]]) {
    await place(page, { x: x - 4, y: 0.2, z: z0 }, 0);
    await page.evaluate(([x, z]) => {
      const v = window.__game.vehicles;
      v.summon('batmobile', { instant: true });
      const bm = v.batmobile;
      bm.group.position.set(x - 4, 0, z);
      bm.v.yaw = 0; bm.group.rotation.y = 0;
      if (!v.active) v.enter(bm);
    }, [x, z0]);
    await page.waitForFunction(() => window.__game.vehicles.active?.kind === 'batmobile', null, { timeout: 5000 });
    await page.keyboard.down('KeyW');
    await page.waitForFunction((z1) => window.__game.vehicles.batmobile.group.position.z > z1, z1, { timeout: 30000 });
    await page.keyboard.up('KeyW');
    const car = await page.evaluate(() => { const p = window.__game.vehicles.batmobile.group.position; return { y: p.y }; });
    expect(car.y).toBeGreaterThan(-0.5);
    expect(car.y).toBeLessThan(1);
    await page.evaluate(() => { const v = window.__game.vehicles; if (v.active) v.exit?.(); });
    await page.waitForTimeout(300);
  }
  // The graph routes the same way for traffic and the GPS.
  const ok = await page.evaluate(() => !!window.__game.world.streetGraph.routeBetween({ x: 150, y: 0, z: 30 }, { x: 600, y: 5, z: -80 }));
  expect(ok).toBe(true);
  expect(errors).toEqual([]);
});

test('glide off the Conservatory dome over the park; the lake rescues a fall', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await place(page, { x: 294, y: 26.3, z: -752 }, 0);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__game.hero.pos.z > -700, null, { timeout: 30000 });
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  const near = await page.evaluate(() => { const h = window.__game.hero.pos; return window.__game.world.grapplePoints.filter((p) => Math.hypot(p.x - h.x, p.z - h.z) < 45 && p.y > h.y - 30).length; });
  expect(near).toBeGreaterThan(5);
  // Into the lake off the seawall promenade: back on dry ground.
  await place(page, { x: 361, y: 0.3, z: -700 }, Math.PI / 2);
  await page.evaluate(() => window.__game.hero.teleport({ x: 420, y: 1, z: -700 }));
  await page.waitForTimeout(2500);
  const h = await hero(page);
  expect(h.y).toBeGreaterThan(-0.8);
  expect(h.x).toBeLessThan(400);
  expect(errors).toEqual([]);
});
