import { test, expect } from '@playwright/test';

// Workstream H (city north): Bristol and Wayne Manor, Blackgate, and the street fleet's traffic,
// end to end. Each district is reachable from the old city through the street graph on foot and
// by car without falling through, a glide across Bristol finds grapple points, and the traffic
// drives, stops for a hero in the road and reports pass-bys for the audio.
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

// Follows a street-graph route on foot: the hero is placed every 12 m along the route (a few
// metres off the centre line) and must stand on the ground there: never below the road surface,
// never in the water. Returns the districts passed and the worst drop below the road.
async function walkRoute(page, from, to, lane = 3) {
  return page.evaluate(async ([from, to, lane]) => {
    const G = window.__game;
    G.world.bridges.hold('bridgeW', 'down'); G.world.bridges.hold('bridgeE', 'down');
    const r = G.world.streetGraph.routeBetween(from, to, { lane });
    if (!r) return { ok: false };
    const pts = [];
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i], b = r.points[i + 1], L = Math.hypot(b.x - a.x, b.z - a.z);
      for (let s = 0; s < L; s += 12) { const t = s / L; pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }); }
    }
    let drop = -Infinity, worst = null;
    const districts = new Set();
    for (const p of pts) {
      G.hero.teleport({ x: p.x, y: p.y + 0.6, z: p.z }, 0);
      await new Promise((res) => setTimeout(res, 60));
      const h = G.hero.pos;
      districts.add(G.world.districtAt(h.x, h.z));
      if (p.y - h.y > drop) { drop = p.y - h.y; worst = { x: h.x, y: h.y, z: h.z, road: p.y }; }
    }
    return { ok: true, n: pts.length, drop, worst, districts: [...districts], visited: G.progress.districts };
  }, [from, to, lane]);
}

test('on foot from the old city to Wayne Manor, the village and the cemetery; and out to Blackgate', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page);
  for (const [to, expectDistrict] of [[{ x: -351, y: 18, z: -745 }, 'wayneManor'], [{ x: -112, y: 2, z: -672 }, 'bristol'], [{ x: -500, y: 18, z: -730 }, 'bristol']]) {
    const r = await walkRoute(page, { x: -146, y: 0, z: -222 }, to);
    expect(r.ok).toBe(true);
    expect(r.drop, JSON.stringify(r.worst)).toBeLessThan(0.6);
    expect(r.districts).toContain(expectDistrict);
  }
  const bg = await walkRoute(page, { x: 0, y: 0, z: 150 }, { x: 118, y: 2.2, z: 343 }, 0);
  expect(bg.ok).toBe(true);
  expect(bg.drop, JSON.stringify(bg.worst)).toBeLessThan(0.6);
  expect(bg.districts).toContain('blackgate');
  // Stand on the gate plaza a moment (the progress tracker samples the district every so often).
  await page.evaluate(() => window.__game.hero.teleport({ x: 110, y: 2.6, z: 343 }, 0));
  await page.waitForTimeout(1500);
  const visited = await page.evaluate(() => window.__game.progress.districts);
  for (const d of ['bristol', 'wayneManor', 'blackgate']) expect(visited).toContain(d);
  expect(errors).toEqual([]);
});

test('drive the Batmobile from the Loop up into Bristol; walk the Blackgate causeway', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const drive = async (start, yaw, done) => {
    await page.evaluate(([start, yaw]) => {
      const G = window.__game;
      const v = G.vehicles;
      if (v.active) v.exit?.();
      G.hero.teleport({ x: start.x + 2, y: start.y + 0.3, z: start.z }, yaw);
      v.summon('batmobile', { instant: true });
      const bm = v.batmobile;
      bm.group.position.set(start.x, start.y, start.z);
      bm.v.yaw = yaw; bm.v.speed = 0; bm.group.rotation.y = yaw;
      G.follow.snapBehind?.(yaw);
    }, [start, yaw]);
    await page.waitForTimeout(300);
    await page.evaluate(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); });
    await page.waitForFunction(() => window.__game.vehicles.active?.kind === 'batmobile', null, { timeout: 5000 });
    await page.keyboard.down('KeyW');
    await page.waitForFunction(done, null, { timeout: 25000 });
    await page.keyboard.up('KeyW');
    return page.evaluate(() => {
      const G = window.__game;
      const p = G.vehicles.batmobile.group.position;
      return { x: p.x, y: p.y, z: p.z, ground: G.world.collision.groundBelow(p.x, p.y + 1, p.z, 0.3), district: G.world.districtAt(p.x, p.z) };
    });
  };
  // North up the Loop's x -210 stub onto Bristol Road (forward is (sin yaw, cos yaw): yaw pi is north).
  const a = await drive({ x: -210, y: 0, z: -585 }, Math.PI, () => window.__game.vehicles.batmobile.group.position.z < -612);
  expect(a.district).toBe('bristol');
  expect(a.y).toBeGreaterThan(-0.3);
  expect(Math.abs(a.y - a.ground)).toBeLessThan(0.4);
  // The causeway on foot (the player's cars are held north of the seawall by vehicles.js; the
  // traffic drives it): south from the docks end, up the ramp onto the rock.
  await page.evaluate(() => {
    const G = window.__game;
    if (G.vehicles.active) G.vehicles.exit?.();
    G.hero.teleport({ x: 84, y: 0.6, z: 222 }, 0);
    G.follow.snapBehind?.(0);
  });
  await page.waitForTimeout(400);
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => window.__game.hero.pos.z > 334, null, { timeout: 40000 });
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  const b = await page.evaluate(() => { const h = window.__game.hero.pos; return { x: h.x, y: h.y, z: h.z }; });
  expect(b.y).toBeGreaterThan(1.8); // up on the rock
  expect(Math.abs(b.x - 84)).toBeLessThan(6); // between the parapets
  expect(errors).toEqual([]);
});

test('a glide off the overlook west over the woods finds grapple points ahead', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game;
    // Off the overlook knoll, west over the woods along the ridge (treetop perches).
    const yaw = -Math.PI / 2;
    G.hero.teleport({ x: -222, y: 17.2, z: -766 }, yaw);
    G.follow.snapBehind?.(yaw);
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
      if (pickGrapplePoint(G.world.grapplePoints, cam.position, dir, G.hero.pos)) hits++;
      samples++;
    }
    return { hits, samples, end: { x: G.hero.pos.x, y: G.hero.pos.y, z: G.hero.pos.z } };
  });
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  expect(found.samples).toBeGreaterThan(20);
  expect(found.hits / found.samples).toBeGreaterThan(0.3);
  expect(found.end.x).toBeLessThan(-240); // it glided west
  expect(errors).toEqual([]);
});

test('traffic: the fleet drives the streets, stops for a hero in the road, honks, and reports pass-bys', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const res = await page.evaluate(async () => {
    const G = window.__game;
    const tr = G.world.traffic;
    const heard = { passBy: [], honk: 0 };
    G.events.on('trafficPassBy', (e) => heard.passBy.push(e.kind));
    G.events.on('trafficHonk', () => { heard.honk++; });
    // Stand on the sidewalk of a core street for a while, then step into the road in front of a car.
    G.hero.teleport({ x: -21.8, y: 0.4, z: 60 }, Math.PI);
    const t0 = performance.now();
    while (performance.now() - t0 < 16000 && (performance.now() - t0 < 6000 || !heard.passBy.length)) await new Promise((r) => requestAnimationFrame(r));
    const active = tr.active;
    const moving = tr.sim.vehicles.filter((v) => v.active && v.speed > 2).length;
    const types = [...new Set(tr.sim.vehicles.filter((v) => v.active).map((v) => v.type))];
    // The nearest car approaching along its lane: stand 25 m ahead of it.
    let target = null;
    for (let tries = 0; tries < 40 && !target; tries++) {
      target = tr.sim.vehicles.find((v) => v.active && !v.onTurn && v.speed > 4 && tr.sim.lanes[v.lane].s1 - v.s > 26 && Math.hypot(v.x - G.hero.pos.x, v.z - G.hero.pos.z) < 150);
      if (!target) await new Promise((r) => setTimeout(r, 250));
    }
    if (!target) return { active, moving, types, heard, stopped: null };
    const ax = target.x + target.fx * 22, az = target.z + target.fz * 22;
    G.hero.teleport({ x: ax, y: target.y + 0.2, z: az }, 0);
    const t1 = performance.now();
    let minGap = Infinity;
    while (performance.now() - t1 < 6000) {
      await new Promise((r) => requestAnimationFrame(r));
      minGap = Math.min(minGap, Math.hypot(target.x - G.hero.pos.x, target.z - G.hero.pos.z));
    }
    return { active, moving, types, heard, stopped: target.active ? target.speed : 0, minGap };
  });
  expect(res.active).toBeGreaterThan(8);
  expect(res.moving).toBeGreaterThan(0);
  expect(res.types.length).toBeGreaterThan(2);
  expect(res.stopped).not.toBe(null);
  expect(res.stopped).toBeLessThan(1);
  expect(res.minGap).toBeGreaterThan(2);
  expect(res.heard.honk).toBeGreaterThan(0);
  expect(res.heard.passBy.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
