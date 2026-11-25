import { test, expect } from '@playwright/test';

// Police attention and the GCPD (workstream W, docs/design/wanted.md), end to end on the real game:
// the levels rise from offences in the Loop, cruisers pursue on the street graph, a roadblock ahead
// is hit, a rooftop breaks the line of sight and the search runs out; the helicopter's light at
// night; caught -> struggle -> holding cell -> breakout; Bruce's traffic stop; two players with one
// hidden; the "off" setting; and a soak at levels 4-5 with time accelerated.
// Night 2 is used for free roam (Night One caps the system at Pursuit while its goals wait).
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
async function boot(page, extra = '') {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?night=n2&god=1&new=1&time=23${extra}`);
  await page.waitForFunction(ready, null, { timeout: 120000 });
  for (let i = 0; i < 40; i++) {
    const busy = await page.evaluate(() => {
      const G = window.__game;
      if (G.cinematic?.active) { G.cinematic.skip(); return true; }
      if (G.comic?.playing) { G.comic.skip(); return true; }
      if (G.radio?.playing) { G.radio.skip(); return true; }
      return G.flow.mode !== 'play';
    });
    if (!busy && i > 3) break;
    await page.waitForTimeout(250);
  }
  await page.mouse.click(640, 400);
  // Record every level change and the events the tests look for.
  await page.evaluate(() => {
    const G = window.__game;
    window.__w = { levels: [], states: [], ev: [] };
    G.events.on('wantedLevel', (e) => window.__w.levels.push(e.level));
    G.events.on('wantedState', (e) => window.__w.states.push(e.state));
    for (const n of ['roadblockHit', 'wantedCaught', 'wantedEscaped', 'wantedTicket', 'carTaken', 'spikeStrip']) G.events.on(n, (e) => window.__w.ev.push([n, e?.outcome ?? e?.how ?? null]));
  });
  return errors;
}
// Waits for a condition in game time (the machine may be busy; game time is what the rules use).
async function until(page, fn, arg, timeout = 90000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 250 });
}
const LOOP = { x: 30, y: 0.2, z: -420 };

test('Loop: provoked from Noticed to Coordinated, chased by cruisers, a roadblock, lost on the rooftops', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await boot(page);
  await page.evaluate((p) => { const G = window.__game; G.hero.teleport(p, Math.PI); G.follow.snapBehind?.(Math.PI); }, LOOP);
  await page.waitForTimeout(800);
  // Level 1: property damage in front of an officer (the witness is given; the rules are unit-tested).
  await page.evaluate(() => { const W = window.__game.wanted; W.offence('collateral', { wit: 'police' }); W.offence('collateral', { wit: 'police' }); W.offence('collateral', { wit: 'police' }); });
  await until(page, () => window.__game.wanted.level === 1);
  // Level 2: ramming a police car; level 3: two more.
  await page.evaluate(() => window.__game.wanted.offence('ramPolice', { wit: 'police' }));
  await until(page, () => window.__game.wanted.level === 2);
  await page.evaluate(() => { const W = window.__game.wanted; W.offence('ramPolice', { wit: 'police' }); });
  await until(page, () => window.__game.wanted.level === 3);
  const levels = await page.evaluate(() => window.__w.levels);
  expect(levels.slice(0, 3)).toEqual([1, 2, 3]);
  // Cruisers converge (they spawn out of sight 95-175 m away and drive the street graph).
  await until(page, () => { const W = window.__game.wanted, h = window.__game.hero.pos; return W.units.cruisers.some((c) => c.active && Math.hypot(c.x - h.x, c.z - h.z) < 45); }, null, 120000);
  // A roadblock on the route ahead of a car, then drive into it.
  const hit = await page.evaluate(async () => {
    const G = window.__game, V = G.vehicles, W = G.wanted;
    const car = V.lendCar('sedan', { x: 30, y: 0, z: -430, yaw: Math.PI });
    V.enter(car);
    const p = car.group.position;
    const n = W.units.placeRoadblocks({ x: p.x, y: p.y, z: p.z }, { x: 0, z: -1 }, 1);
    const rb = W.units.roadblocks[0];
    if (!n || !rb) return { n };
    const pts = V.routePoints({ x: p.x, y: p.y, z: p.z }, { x: rb.x + Math.sin(rb.yaw) * -12, y: rb.y, z: rb.z + Math.cos(rb.yaw) * -12 });
    V.startPilot(pts, { speed: 18 });
    return { n, rb: [rb.x, rb.z] };
  });
  expect(hit.n).toBeGreaterThan(0);
  await until(page, () => window.__w.ev.some((e) => e[0] === 'roadblockHit'), null, 120000);
  // Out of the car, up on a roof well away from the units: the search starts, drains, they stand down.
  await page.evaluate(() => {
    const G = window.__game, W = G.wanted, V = G.vehicles;
    V.stopPilot?.();
    if (V.active) V.exit();
    const h = G.hero.pos;
    const roof = G.world.grapplePoints.filter((q) => q.y > 18 && q.y < 60 && Math.hypot(q.x - h.x, q.z - h.z) > 160 && Math.hypot(q.x - h.x, q.z - h.z) < 400)
      .sort((a, b) => a.y - b.y)[0];
    G.hero.teleport({ x: roof.x - (roof.nx ?? 0) * 1.5, y: roof.y + 0.2, z: roof.z - (roof.nz ?? 0) * 1.5 });
    W.units.clearAll(); // nobody followed him up: the ones in view lose him
  });
  await until(page, () => window.__w.states.includes('search'), null, 120000);
  const searching = await page.evaluate(() => ({ s: window.__game.wanted.stateName, ring: document.querySelector('.wanted-readout')?.className }));
  expect(searching.ring).toContain('show');
  await until(page, () => window.__w.states.includes('cooldown'), null, 200000);
  await until(page, () => window.__game.wanted.level === 0, null, 60000);
  expect(errors).toEqual([]);
});

test('the helicopter\'s searchlight finds him in the open at night, not under the lower deck', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await page.evaluate((p) => { const G = window.__game; G.hero.teleport(p, Math.PI); }, LOOP);
  await page.evaluate(() => window.__game.wanted.set(4, { scripted: false }));
  await until(page, () => window.__game.wanted.units.heli.mode === 'track', null, 120000);
  // Keep the units on foot and in cars away: only the light can see him now.
  await page.evaluate(() => { const U = window.__game.wanted.units; for (const o of U.officers) o.stun = 999; for (const c of U.cruisers) c.stun = 999; });
  await until(page, () => window.__game.wanted.heroes[0].seenT < 0.5, null, 60000);
  const lit = await page.evaluate(() => { const U = window.__game.wanted.units; return { cone: !!U.heli.beam?.visible, pool: U.heli.pool.visible }; });
  expect(lit.pool).toBe(true);
  // Under Lower Gotham's upper deck the light can sit right on him and still not see him.
  await page.evaluate(() => { const G = window.__game; G.hero.teleport({ x: 0, y: -5.3, z: -291 }); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__pin = setInterval(() => { const G = window.__game, H = G.wanted.units.heli; H.light.x = G.hero.pos.x; H.light.z = G.hero.pos.z; }, 16); });
  await until(page, () => window.__game.wanted.heroes[0].overhead === true && window.__game.wanted.heroes[0].seenT > 2, null, 60000);
  await page.evaluate(() => clearInterval(window.__pin));
  expect(errors).toEqual([]);
});

test('caught: a struggle chance, then a holding cell to break out of, then the chase resumes', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await page.evaluate((p) => { const G = window.__game; G.hero.teleport(p, Math.PI); }, LOOP);
  await page.evaluate(() => window.__game.wanted.set(2, { scripted: false }));
  await until(page, () => window.__game.wanted.units.officers.some((o) => o.active), null, 120000);
  // Officers on him, a net on him: the caught meter fills.
  await page.evaluate(() => {
    window.__ring = setInterval(() => {
      const G = window.__game, W = G.wanted, h = G.hero.pos;
      if (W.caughtHero || W.custody) return;
      W.units.officers.filter((o) => o.active).slice(0, 3).forEach((o, i) => { o.x = h.x + Math.cos(i * 2.1) * 1.1; o.z = h.z + Math.sin(i * 2.1) * 1.1; o.stun = 0; o.restrained = false; });
      W.heroes[0].held = 2;
    }, 50);
  });
  await until(page, () => !!window.__game.wanted.caughtHero, null, 60000);
  await page.evaluate(() => clearInterval(window.__ring));
  // No struggle: custody, in a holding cell.
  await until(page, () => !!window.__game.wanted.custody, null, 30000);
  expect(await page.evaluate(() => window.__game.hero.control?.name)).toBe('wantedCell');
  // Pick the lock (punch a few times).
  for (let i = 0; i < 6; i++) { await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); await page.waitForTimeout(200); }
  await until(page, () => !window.__game.wanted.custody, null, 60000);
  const after = await page.evaluate(() => ({ ctl: window.__game.hero.control?.name ?? null, lock: window.__game.hero.gadgetLock, level: window.__game.wanted.level, ev: window.__w.ev }));
  expect(after.ctl).toBe(null);
  expect(after.lock).toBeGreaterThan(0); // gadgets confiscated, coming back
  expect(after.level).toBeGreaterThanOrEqual(2); // a breakout is a fresh chase
  expect(after.ev.map((e) => e[0])).toContain('wantedCaught');
  expect(after.ev).toContainEqual(['wantedEscaped', 'cell']);
  expect(errors).toEqual([]);
});

test('Bruce gets pulled over for speeding and takes the ticket', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  await page.evaluate(() => {
    const G = window.__game, V = G.vehicles;
    G.bruce.becomeBruce('casual');
    G.hero.teleport({ x: 30, y: 0.2, z: -380 });
    const car = V.lendCar('coupe', { x: 30, y: 0, z: -380, yaw: Math.PI });
    V.enter(car);
    const p = car.group.position;
    V.startPilot(V.routePoints({ x: p.x, y: p.y, z: p.z }, { x: 30, y: 0, z: -640 }), { speed: 30, boost: true });
  });
  await until(page, () => !!window.__game.wanted.trafficStop, null, 90000);
  // Pull over.
  await page.evaluate(() => { const V = window.__game.vehicles; V.stopPilot(); window.__brake = setInterval(() => { if (V.active?.v) V.active.v.speed *= 0.8; }, 30); });
  await until(page, () => window.__w.ev.some((e) => e[0] === 'wantedTicket'), null, 150000);
  await page.evaluate(() => clearInterval(window.__brake));
  const r = await page.evaluate(() => ({ level: window.__game.wanted.level, tickets: window.__game.wanted.save.tickets }));
  expect(r.level).toBe(0);
  expect(r.tickets).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('two players: one hidden indoors and one seen is still wanted; the off setting holds the city back', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page, '&p2=bot');
  await until(page, () => window.__game.players.length === 2, null, 60000);
  await page.evaluate((p) => {
    const G = window.__game;
    G.players[1].hero.teleport({ x: p.x + 3, y: p.y, z: p.z });
    G.wanted.set(2, { scripted: false });
  }, LOOP);
  // Player 1 goes inside the GCPD lobby (hidden); player 2 stays in the street outside its door with an
  // officer (close enough that the co-op tether does not pull them together).
  await until(page, () => window.__game.wanted.units.officers.some((o) => o.active), null, 120000);
  await page.evaluate(() => {
    const G = window.__game;
    G.interiors.enter('gcpd');
    window.__keep = setInterval(() => {
      const W = G.wanted, h = G.players[1].hero.pos;
      // The bot follows player 1 about: keep it out in the street.
      const out = G.interiors.rooms.gcpd.outside;
      if (Math.hypot(h.x - out.x, h.z - out.z) > 2) G.players[1].hero.teleport({ x: out.x, y: out.y + 0.2, z: out.z });
      const o = W.units.officers.find((q) => q.active && !q.spotter);
      if (o) { o.x = h.x; o.z = h.z + 5; o.yaw = Math.PI; o.stun = 0; }
    }, 50);
  });
  await page.waitForTimeout(6000);
  const both = await page.evaluate(() => { const W = window.__game.wanted; return { hidden0: W.heroes[0].hidden, seen1: W.heroes[1].seenT < 1, state: W.stateName, level: W.level }; });
  expect(both.hidden0).toBe(true);
  expect(both.seen1).toBe(true);
  expect(both.state).toBe('pursuit');
  expect(both.level).toBe(2);
  await page.evaluate(() => clearInterval(window.__keep));
  // The setting: off clears it and offences no longer count; a scripted story level still plays.
  await page.evaluate(() => { window.__game.settings.police = 'off'; });
  await until(page, () => window.__game.wanted.level === 0, null, 30000);
  await page.evaluate(() => window.__game.wanted.offence('ramPolice', { wit: 'police' }));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__game.wanted.level)).toBe(0);
  await page.evaluate(() => window.__game.wanted.set(3, { scripted: true }));
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__game.wanted.level)).toBe(3);
  await page.evaluate(() => { window.__game.settings.police = 'on'; window.__game.wanted.clear('test'); });
  expect(errors).toEqual([]);
});

test('soak: 15 game-minutes at levels 4-5 with time accelerated: bounded units, no errors, flat cost', async ({ page }) => {
  test.setTimeout(420000);
  const errors = await boot(page);
  await page.evaluate((p) => { const G = window.__game; G.hero.teleport(p, Math.PI); G.wanted.set(4, { scripted: false }); }, LOOP);
  // Each real frame runs extra wanted ticks (4x), and the hero hops round the Loop every few seconds
  // so units keep spawning, chasing, losing him and leaving.
  const res = await page.evaluate(async () => {
    const G = window.__game, W = G.wanted;
    const caps = W.stats.caps;
    const spots = [[30, -420], [-90, -480], [150, -540], [90, -360], [-30, -540], [150, -420]];
    let maxV = 0, maxO = 0, maxRB = 0, k = 0;
    const costs = [];
    let gameT = 0;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const t0 = performance.now();
    while (gameT < 15 * 60 && performance.now() - t0 < 330000) {
      const f0 = performance.now();
      for (let i = 0; i < 4; i++) { W.update(0.05, 0.05); gameT += 0.05; }
      costs.push((performance.now() - f0) / 4);
      const s = W.stats;
      maxV = Math.max(maxV, s.cruisers + s.vans); maxO = Math.max(maxO, s.officers); maxRB = Math.max(maxRB, s.roadblocks);
      if (++k % 120 === 0) { const [x, z] = spots[(k / 120) % spots.length]; G.hero.teleport({ x, y: 0.2, z }); if (W.level < 4) W.set(4 + (k / 120) % 2, { scripted: false }); }
      await wait(0);
    }
    const third = Math.floor(costs.length / 3);
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    return { gameT, maxV, maxO, maxRB, caps, early: med(costs.slice(0, third)), late: med(costs.slice(-third)), n: costs.length };
  });
  expect(res.gameT).toBeGreaterThan(600);
  expect(res.maxV).toBeLessThanOrEqual(res.caps.vehicles);
  expect(res.maxO).toBeLessThanOrEqual(res.caps.officers);
  expect(res.maxRB).toBeLessThanOrEqual(res.caps.roadblocks);
  // Flat: the late per-tick cost is not growing (within 2x of the early median, plus jitter room).
  expect(res.late).toBeLessThan(res.early * 2 + 0.5);
  console.log('[wanted soak]', JSON.stringify(res));
  expect(errors).toEqual([]);
});
