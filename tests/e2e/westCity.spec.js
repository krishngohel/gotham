import { test, expect } from '@playwright/test';

// The west side end to end (Long Night 2, workstream H3): reachable on foot over a South Branch
// bascule, by car over another into the Yards' edge, by glide across the Narrows' roofs (which
// carry grapple points), and a raised North Branch bascule closes its road for the street graph.
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
const hero = (page) => page.evaluate(() => { const h = window.__game.hero; return { x: h.pos.x, y: h.pos.y, z: h.pos.z, state: h.state }; });

test('walk from the old city over the -150 South Branch bascule into Chinatown', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  // The route the street graph gives exists and crosses the bascule.
  const route = await page.evaluate(() => {
    const g = window.__game.world.streetGraph;
    const r = g.routeBetween({ x: -200, y: 0, z: -150 }, { x: -415, y: 0, z: -150 });
    return { ok: !!r, bridge: r.edges.some((e) => g.edges[e].bridge === 'sbr150') };
  });
  expect(route).toEqual({ ok: true, bridge: true });
  await page.evaluate(() => {
    const G = window.__game;
    G.world.bridges.hold('sbr150', 'down');
    G.hero.teleport({ x: -222, y: 0.2, z: -150 }, -Math.PI / 2);
    G.follow.snapBehind?.(-Math.PI / 2);
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.hero.pos.x < -330, null, { timeout: 40000 });
  await page.keyboard.up('KeyW');
  const h = await hero(page);
  expect(h.y).toBeGreaterThan(-0.5);
  await page.waitForTimeout(800);
  const visited = await page.evaluate(() => window.__game.progress.districts);
  for (const d of ['quay', 'chinatown']) expect(visited).toContain(d);
  expect(errors).toEqual([]);
});

test('drive the Batmobile west over the -30 bascule to the Yards gate street', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    G.world.bridges.hold('sbr30', 'down');
    G.hero.teleport({ x: -200, y: 0.2, z: -26 }, -Math.PI / 2);
    G.follow.snapBehind?.(-Math.PI / 2);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const v = window.__game.vehicles;
    v.summon('batmobile', { instant: true });
    const bm = v.batmobile;
    bm.group.position.set(-205, 0, -27);
    bm.v.yaw = -Math.PI / 2; bm.group.rotation.y = -Math.PI / 2;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); });
  await page.waitForFunction(() => window.__game.vehicles.active?.kind === 'batmobile', null, { timeout: 5000 });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.vehicles.batmobile.group.position.x < -340, null, { timeout: 25000 });
  await page.keyboard.up('KeyW');
  const car = await page.evaluate(() => { const p = window.__game.vehicles.batmobile.group.position; return { x: p.x, y: p.y, z: p.z }; });
  expect(car.y).toBeGreaterThan(-0.5);
  expect(car.y).toBeLessThan(1);
  expect(errors).toEqual([]);
});

test('glide off Wolf Point across the Narrows: grapple points under the whole flight', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    // Just off the tower's north face at its roof height (stepping off the stepped crown lands on
    // its own setbacks first).
    G.hero.teleport({ x: -334, y: 58.4, z: -287 }, Math.PI);
    G.follow.snapBehind?.(Math.PI);
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__game.hero.pos.z < -340, null, { timeout: 30000 });
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  const { near, h } = await page.evaluate(() => {
    const G = window.__game;
    const p = G.hero.pos;
    const near = G.world.grapplePoints.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 40 && q.y < p.y + 10).length;
    return { near, h: { x: p.x, y: p.y, z: p.z } };
  });
  expect(near).toBeGreaterThan(20);
  expect(h.y).toBeGreaterThan(-0.5);
  expect(errors).toEqual([]);
});

test('a raised North Branch bascule closes its road and the route goes round', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  const closed = await page.evaluate(() => {
    const G = window.__game;
    G.world.bridges.hold('nbr359', 'up');
    return new Promise((r) => setTimeout(() => {
      const b = G.world.bridges.list.find((x) => x.id === 'nbr359');
      const g = G.world.streetGraph;
      const route = g.routeBetween({ x: -262, y: 0, z: -359 }, { x: -320, y: 0, z: -359 }, { blocked: (e) => e.bridge && !G.world.bridges.isDown(e.bridge) });
      r({ down: b.down, gates: b.gateBoxes.length, deck: b.boxes.length, round: !route.edges.some((e) => g.edges[e].bridge === 'nbr359') });
    }, 400));
  });
  expect(closed).toEqual({ down: false, gates: 2, deck: 0, round: true });
  expect(errors).toEqual([]);
});
