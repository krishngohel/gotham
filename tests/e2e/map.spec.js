import { test, expect } from '@playwright/test';

// Workstream L2: the city map, minimap, waypoints, GPS ribbon and fast travel, end to end.
// SHOTS=1 writes screenshots to docs/design/shots/map/.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
const SHOTS = process.env.SHOTS === '1';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `docs/design/shots/map/${name}.jpg`, type: 'jpeg', quality: 78 }); };

async function boot(page, url = '/?at=start&god=1&new=1') {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url);
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

// Into the Batmobile at a spot, facing `yaw`.
async function drive(page, at, yaw) {
  await page.evaluate(([at, yaw]) => {
    const G = window.__game;
    G.hero.teleport({ x: at.x, y: at.y + 0.2, z: at.z + 4 }, yaw);
    const v = G.vehicles;
    v.summon('batmobile', { instant: true });
    const bm = v.batmobile;
    bm.group.position.set(at.x, at.y, at.z);
    bm.v.yaw = yaw; bm.group.rotation.y = yaw;
  }, [at, yaw]);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); });
  await page.waitForFunction(() => window.__game.vehicles.active?.kind === 'batmobile', null, { timeout: 5000 });
}

test('a waypoint set on the city map shows on the minimap and as a ribbon on the road; leaving the route reroutes', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  await drive(page, { x: -147, y: 0, z: -372 }, Math.PI);
  await page.waitForTimeout(1500); // the district and the fog around the car register
  // Open the map (M), then click on the Loop's north-east: a waypoint there.
  await page.keyboard.press('KeyM');
  await page.waitForFunction(() => window.__game.nav.cityMap?.isOpen === true, null, { timeout: 5000 });
  const at = await page.evaluate(() => {
    const m = window.__game.nav.cityMap, v = m.view;
    const W = innerWidth, H = innerHeight;
    // A street point in the Loop, on screen.
    const x = 30, z = -500;
    return { sx: W / 2 + (x - v.cx) * v.s, sy: H / 2 + (z - v.cz) * v.s };
  });
  await page.mouse.click(at.sx, at.sy);
  await page.waitForTimeout(200);
  const marks = await page.evaluate(() => window.__game.nav.waypoints.marksOf(0).map((m) => ({ x: Math.round(m.x), z: Math.round(m.z) })));
  expect(marks).toHaveLength(1);
  expect(Math.abs(marks[0].x - 30)).toBeLessThan(6);
  expect(Math.abs(marks[0].z + 500)).toBeLessThan(6);
  await shot(page, 'full-map');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.nav.cityMap.isOpen && !window.__game.state.paused, null, { timeout: 5000 });
  await page.waitForTimeout(1200);
  const s = await page.evaluate(() => {
    const G = window.__game, p = G.players[0], st = G.nav.routeOf(p), rb = G.nav.ribbonOf(p), mm = G.nav.minimapOf(p);
    return { route: !!st.route, reason: st.reason, version: st.version, ribbon: rb.mesh.visible, verts: rb.buf.count, minimap: !!mm && mm.el.style.display !== 'none', drawn: mm?.drawn ?? -1 };
  });
  expect(s.route).toBe(true);
  expect(s.ribbon).toBe(true);
  expect(s.verts).toBeGreaterThan(30);
  expect(s.minimap).toBe(true);
  expect(s.drawn).toBeGreaterThan(0);
  await expect(page.locator('.minimap canvas')).toHaveCount(1);
  await shot(page, 'ribbon-loop-night');
  // Drive off the route: put the car a block away; within a few seconds the GPS reroutes.
  await page.evaluate(() => { const bm = window.__game.vehicles.batmobile; bm.group.position.set(-210, 0, -330); });
  await page.waitForFunction((v) => { const st = window.__game.nav.routeOf(window.__game.players[0]); return st.version > v && st.reason === 'offRoute'; }, s.version, { timeout: 8000 });
  const after = await page.evaluate(() => { const st = window.__game.nav.routeOf(window.__game.players[0]); const p = st.route.points[0]; return { x: p.x, z: p.z }; });
  expect(Math.hypot(after.x + 210, after.z + 330)).toBeLessThan(40);
  expect(errors).toEqual([]);
});

test('a raised bridge on the route makes the GPS go round', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  await page.evaluate(() => { const b = window.__game.world.bridges; b.hold('bridgeE', 'down'); b.hold('bridgeW', 'down'); });
  await drive(page, { x: -30, y: 0, z: -180 }, Math.PI);
  await page.evaluate(() => { const G = window.__game; G.nav.placeWaypoint(G.players[0], { x: -30, y: 0, z: -340 }); });
  await page.waitForTimeout(600);
  const before = await page.evaluate(() => { const G = window.__game, st = G.nav.routeOf(G.players[0]); return { v: st.version, bridges: st.route.edges.map((id) => G.world.streetGraph.edges[id].bridge).filter(Boolean) }; });
  expect(before.bridges).toContain('bridgeE');
  await page.evaluate(() => window.__game.world.bridges.hold('bridgeE', 'up'));
  await page.waitForFunction((v) => { const st = window.__game.nav.routeOf(window.__game.players[0]); return st.version > v && st.reason === 'blocked'; }, before.v, { timeout: 8000 });
  const after = await page.evaluate(() => { const G = window.__game, st = G.nav.routeOf(G.players[0]); return st.route.edges.map((id) => G.world.streetGraph.edges[id].bridge).filter(Boolean); });
  expect(after).not.toContain('bridgeE');
  expect(errors).toEqual([]);
});

test('fast travel between two El stations', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  // Visit Kane Street (unlocks it), then walk to City Hall (unlocks that too).
  await page.evaluate(() => window.__game.hero.teleport({ x: -90, y: 8.7, z: -440 }, 0));
  await page.waitForFunction(() => window.__game.nav.fastTravel.isUnlocked('elKane'), null, { timeout: 5000 });
  await page.evaluate(() => window.__game.hero.teleport({ x: 90, y: 8.7, z: -440 }, 0));
  await page.waitForFunction(() => window.__game.nav.fastTravel.isUnlocked('elCityHall'), null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.progress.map.ft)).toEqual(expect.arrayContaining(['elKane', 'elCityHall']));
  // Open the map, pick Kane Street, travel.
  await page.evaluate(() => { const G = window.__game; G.nav.openMap(G.players[0]); G.nav.cityMap.select('elKane'); });
  await expect(page.locator('.city-map .cm-go')).toBeEnabled();
  await page.locator('.city-map .cm-go').click();
  await expect(page.locator('.travel-panel.show')).toBeVisible();
  await page.waitForFunction(() => { const h = window.__game.hero.pos; return Math.hypot(h.x + 90, h.z + 449) < 8; }, null, { timeout: 6000 });
  await page.waitForFunction(() => !document.querySelector('.travel-panel.show'), null, { timeout: 8000 });
  const h = await page.evaluate(() => { const p = window.__game.hero.pos; return { x: p.x, y: p.y, z: p.z, paused: window.__game.state.paused }; });
  expect(h.y).toBeGreaterThan(7.5); // on the platform, not under it
  expect(h.paused).toBe(false);
  // In a fight it refuses.
  const refused = await page.evaluate(() => { const G = window.__game; const v = G.nav.fastTravel.addVeto(() => 'Busy.'); const r = G.nav.travel(G.players[0], 'elCityHall'); v(); return r; });
  expect(refused).toEqual({ ok: false, reason: 'Busy.' });
  expect(errors).toEqual([]);
});

test('split screen: each player has a minimap and a route to their own waypoint', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page, '/?at=start&p2=bot&god=1&new=1');
  await page.waitForFunction(() => window.__game.players?.length === 2 && window.__game.split.split, null, { timeout: 60000 });
  await page.evaluate(() => {
    const G = window.__game, [a, b] = G.players;
    a.hero.teleport({ x: -150, y: 0, z: -330 }, Math.PI);
    b.hero.teleport({ x: -140, y: 0, z: -330 }, Math.PI);
    G.nav.placeWaypoint(a, { x: 90, y: 0, z: -420 });
    G.nav.placeWaypoint(b, { x: -200, y: 0, z: -560 });
  });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const G = window.__game, [a, b] = G.players;
    const ra = G.nav.routeOf(a), rb = G.nav.routeOf(b);
    const end = (st) => st.route.points[st.route.points.length - 1];
    return { a: end(ra), b: end(rb), minimaps: document.querySelectorAll('.minimap').length, visible: [...document.querySelectorAll('.minimap')].filter((e) => e.style.display !== 'none').length };
  });
  expect(Math.hypot(r.a.x - 90, r.a.z + 420)).toBeLessThan(20);
  expect(Math.hypot(r.b.x + 200, r.b.z + 560)).toBeLessThan(20);
  expect(r.minimaps).toBe(2);
  expect(r.visible).toBe(2);
  await shot(page, 'minimap-split');
  expect(errors).toEqual([]);
});

test('tracked marks from mapMark events, and the minimap in an interior', async ({ page }) => {
  test.setTimeout(90000);
  const errors = await boot(page);
  const n = await page.evaluate(() => {
    const G = window.__game;
    const target = { pos: { x: 20, y: 0, z: 20 }, alive: true };
    G.events.emit('mapMark', { id: 'dart', kind: 'tracker', target, ttl: 30, player: 0 });
    return G.nav.waypoints.tracked.length;
  });
  expect(n).toBe(1);
  await page.evaluate(() => window.__game.events.emit('mapMark', { id: 'dart', remove: true }));
  expect(await page.evaluate(() => window.__game.nav.waypoints.tracked.length)).toBe(0);
  // The UI station opens the city map (the Batcave's computer calls it).
  // [verify] It returns a station handle { close() } (src/ui/stations.js; it returned `true`), and a
  // caller's onClose no longer replaces the map's resume: from the Batcave the game stayed paused.
  const opened = await page.evaluate(async () => { const m = await import('/src/ui/stations.js'); window.__mapClosed = 0; window.__mapH = m.openStation('cityMap', { onClose: () => { window.__mapClosed++; } }); return typeof window.__mapH?.close; });
  expect(opened).toBe('function');
  await page.waitForFunction(() => window.__game.nav.cityMap?.isOpen, null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.state.paused)).toBe(true);
  await page.evaluate(() => window.__mapH.close());
  expect(await page.evaluate(() => ({ open: window.__game.nav.cityMap.isOpen, paused: window.__game.state.paused, closed: window.__mapClosed }))).toEqual({ open: false, paused: false, closed: 1 });
  // And by the player's key, from a bench (onClose given).
  await page.evaluate(async () => { const m = await import('/src/ui/stations.js'); m.openStation('cityMap', { onClose: () => { window.__mapClosed++; } }); });
  await page.waitForFunction(() => window.__game.nav.cityMap?.isOpen, null, { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !window.__game.nav.cityMap.isOpen && !window.__game.state.paused && window.__mapClosed === 2, null, { timeout: 5000 });
  expect(errors).toEqual([]);
});
