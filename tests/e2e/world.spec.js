import { test, expect } from '@playwright/test';

// The region framework end to end (Long Night 2, workstream C): the proof region north of the
// old city is reachable on foot, by glide and by car, its districts count as visited, and a
// raised bascule bridge closes its road.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
async function boot(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?at=start&god=1&new=1');
  await page.waitForFunction(ready, null, { timeout: 90000 });
  // Past any opening comic or radio, into free play.
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
const hero = (page) => page.evaluate(() => { const h = window.__game.hero; return { x: h.pos.x, y: h.pos.y, z: h.pos.z, state: h.state }; });

test('walk from the old city over a bascule bridge to the Loop', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    G.world.bridges.hold('bridgeW', 'down');
    G.hero.teleport({ x: -146, y: 0.2, z: -222 }, Math.PI);
    G.follow.snapBehind?.(Math.PI);
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.hero.pos.z < -320, null, { timeout: 30000 });
  await page.keyboard.up('KeyW');
  const h = await hero(page);
  expect(h.y).toBeGreaterThan(-0.5);
  const visited = await page.evaluate(() => window.__game.progress.districts);
  for (const d of ['river', 'lowerGotham', 'loop']) expect(visited).toContain(d);
  expect(errors).toEqual([]);
});

test('glide from the clock tower across the river', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    G.hero.teleport({ x: -62, y: 58.2, z: -176 }, Math.PI);
    G.follow.snapBehind?.(Math.PI);
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__game.hero.pos.z < -262, null, { timeout: 30000 });
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  expect(errors).toEqual([]);
});

test('drive the Batmobile north over a bridge onto Lower Gotham\'s upper deck; a raised bridge closes the road', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    G.world.bridges.hold('bridgeE', 'down');
    G.hero.teleport({ x: -24, y: 0.2, z: -200 }, Math.PI);
    G.follow.snapBehind?.(Math.PI);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const v = window.__game.vehicles;
    v.summon('batmobile', { instant: true });
    const bm = v.batmobile;
    bm.group.position.set(-27, 0, -205);
    bm.v.yaw = Math.PI; bm.group.rotation.y = Math.PI;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); });
  await page.waitForFunction(() => window.__game.vehicles.active?.kind === 'batmobile', null, { timeout: 5000 });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.vehicles.batmobile.group.position.z < -285, null, { timeout: 20000 });
  await page.keyboard.up('KeyW');
  const car = await page.evaluate(() => { const p = window.__game.vehicles.batmobile.group.position; return { x: p.x, y: p.y, z: p.z }; });
  expect(car.y).toBeGreaterThan(-0.5);
  expect(car.y).toBeLessThan(1);
  // Raise the bridge behind: its road is gated, and the street graph routes round it.
  const closed = await page.evaluate(() => {
    const G = window.__game;
    G.world.bridges.hold('bridgeE', 'up');
    return new Promise((r) => setTimeout(() => {
      const b = G.world.bridges.list.find((x) => x.id === 'bridgeE');
      const g = G.world.streetGraph;
      const route = g.routeBetween({ x: -30, y: 0, z: -200 }, { x: -30, y: 0, z: -291 }, { blocked: (e) => e.bridge && !G.world.bridges.isDown(e.bridge) });
      r({ down: b.down, gates: b.gateBoxes.length, deck: b.boxes.length, viaWest: route.edges.some((e) => g.edges[e].bridge === 'bridgeW') });
    }, 300));
  });
  expect(closed).toEqual({ down: false, gates: 2, deck: 0, viaWest: true });
  expect(errors).toEqual([]);
});
