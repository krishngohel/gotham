import { test, expect } from '@playwright/test';

// Workstream H (city agent H1): the Loop rows 2-5, the El and Gotham Mile end to end. Each
// district is reachable from the old city through the street graph on foot and by car without
// falling through, a glide across the Loop finds grapple points, and the El's trains run, stop at
// stations and carry a hero standing on a roof.
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

// Follows a street-graph route from the old city on foot: the hero is placed every 12 m along
// the route's sidewalk-side line and must stand on ground there (never under the street, never
// in the water). Returns the districts the route passed through and the lowest height seen.
async function walkRoute(page, from, to) {
  return page.evaluate(async ([from, to]) => {
    const G = window.__game;
    G.world.bridges.hold('bridgeW', 'down'); G.world.bridges.hold('bridgeE', 'down');
    const r = G.world.streetGraph.routeBetween(from, to, { lane: 5 });
    if (!r) return { ok: false };
    const pts = [];
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i], b = r.points[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s < L; s += 12) pts.push({ x: a.x + (b.x - a.x) * (s / L), y: a.y, z: a.z + (b.z - a.z) * (s / L) });
    }
    let minY = Infinity, worst = null;
    const districts = new Set();
    for (const p of pts) {
      G.hero.teleport({ x: p.x, y: p.y + 0.6, z: p.z }, 0);
      await new Promise((res) => setTimeout(res, 60));
      const h = G.hero.pos;
      districts.add(G.world.districtAt(h.x, h.z));
      if (h.y < minY) { minY = h.y; worst = { x: h.x, y: h.y, z: h.z }; }
    }
    return { ok: true, n: pts.length, minY, worst, districts: [...districts], length: r.length };
  }, [from, to]);
}

test('on foot from the old city to Wayne Tower, the Exchange and up Gotham Mile', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  for (const to of [{ x: 0, y: 0, z: -426 }, { x: -150, y: 0, z: -545 }, { x: 150, y: 0, z: -770 }]) {
    const r = await walkRoute(page, { x: -146, y: 0, z: -222 }, to);
    expect(r.ok).toBe(true);
    expect(r.minY, JSON.stringify(r.worst)).toBeGreaterThan(-0.5);
    expect(r.districts).toContain('loop');
    if (to.z < -600) expect(r.districts).toContain('gothamMile');
  }
  const visited = await page.evaluate(() => window.__game.progress.districts);
  expect(visited).toContain('loop');
  expect(visited).toContain('gothamMile');
  expect(errors).toEqual([]);
});

test('drive the Batmobile up the canyon to the Exchange and along under the El', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    G.hero.teleport({ x: -148, y: 0.2, z: -368 }, Math.PI);
    const v = G.vehicles;
    v.summon('batmobile', { instant: true });
    const bm = v.batmobile;
    bm.group.position.set(-147, 0, -372);
    bm.v.yaw = Math.PI; bm.group.rotation.y = Math.PI;
    G.follow.snapBehind?.(Math.PI);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); });
  await page.waitForFunction(() => window.__game.vehicles.active?.kind === 'batmobile', null, { timeout: 5000 });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.vehicles.batmobile.group.position.z < -505, null, { timeout: 25000 });
  await page.keyboard.up('KeyW');
  const car = await page.evaluate(() => { const p = window.__game.vehicles.batmobile.group.position; return { x: p.x, y: p.y, z: p.z }; });
  expect(car.y).toBeGreaterThan(-0.5);
  expect(car.y).toBeLessThan(1);
  expect(Math.abs(car.x + 147)).toBeLessThan(6); // stayed in the canyon street
  expect(errors).toEqual([]);
});

test('a glide across the Loop from the Herald finds grapple points ahead', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    // The Herald's 66 m roof, facing east toward Wayne Tower.
    G.hero.teleport({ x: -60, y: 66.3, z: -392 }, Math.PI / 2);
    G.follow.snapBehind?.(Math.PI / 2);
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  const found = await page.evaluate(async () => {
    const { pickGrapplePoint } = await import('/src/world/grapple.js');
    const G = window.__game;
    const cam = G.camera;
    let hits = 0, samples = 0;
    const dir = { x: 0, y: 0, z: 0 };
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      await new Promise((r) => requestAnimationFrame(r));
      const e = cam.matrixWorld.elements;
      dir.x = -e[8]; dir.y = -e[9]; dir.z = -e[10];
      const p = pickGrapplePoint(G.world.grapplePoints, cam.position, dir, G.hero.pos);
      samples++;
      if (p) hits++;
    }
    return { hits, samples, end: { x: G.hero.pos.x, y: G.hero.pos.y, z: G.hero.pos.z } };
  });
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  expect(found.samples).toBeGreaterThan(20);
  expect(found.hits / found.samples).toBeGreaterThan(0.3);
  expect(found.end.x).toBeGreaterThan(-50); // it glided east
  expect(errors).toEqual([]);
});

test('El trains run, stop at stations and carry a hero on the roof', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const G = window.__game;
    const el = G.world.regions.find((r) => r.id === 'loop').el;
    const T = el.trains.find((t) => t.def.id === 'loopOuter0');
    // Wait until the train is moving, then drop the hero onto its second car's roof.
    const t0 = performance.now();
    while (T.state.speed < 3 && performance.now() - t0 < 30000) await new Promise((r) => requestAnimationFrame(r));
    const car = T.cars[1];
    G.hero.teleport({ x: car.x, y: car.y + 3.9, z: car.z }, car.yaw);
    await new Promise((r) => setTimeout(r, 300));
    const start = { hx: G.hero.pos.x, hz: G.hero.pos.z, cx: car.x, cz: car.z };
    const off0 = Math.hypot(G.hero.pos.x - car.x, G.hero.pos.z - car.z);
    await new Promise((r) => setTimeout(r, 2500));
    const off1 = Math.hypot(G.hero.pos.x - car.x, G.hero.pos.z - car.z);
    const moved = Math.hypot(G.hero.pos.x - start.hx, G.hero.pos.z - start.hz);
    const carMoved = Math.hypot(car.x - start.cx, car.z - start.cz);
    return { y: G.hero.pos.y - car.y, off0, off1, moved, carMoved, states: el.state.map((s) => s.speed) };
  });
  expect(res.carMoved).toBeGreaterThan(5);
  expect(res.moved).toBeGreaterThan(res.carMoved * 0.7); // rode along
  expect(res.off1).toBeLessThan(res.off0 + 2.5);          // still on the car
  expect(res.y).toBeGreaterThan(3.0);                      // on the roof, not on the track bed
  expect(errors).toEqual([]);
});
