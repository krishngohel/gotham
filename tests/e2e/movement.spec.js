// [move] Workstream L3: traversal upgrades and vehicles, end to end. Each test drives the real game
// (real input where a player would press keys, the in-game scripted pilot for long drives) and
// saves a frame to docs/design/shots/move/.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { DRIVE_LEGS, startLeg } from './driveLegs.js';

const SHOTS = 'docs/design/shots/move';
mkdirSync(SHOTS, { recursive: true });
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 30;
async function boot(page, extra = '') {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?at=toNeon&god=1&new=1${extra}`);
  await page.waitForFunction(ready, null, { timeout: 90000 });
  await page.mouse.click(640, 400);
  return errors;
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.jpg`, type: 'jpeg', quality: 60 });

test('wingsuit: a dive builds speed and pulling up climbs back', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page, '&moves=all');
  await page.evaluate(() => { const h = window.__game.hero; h.teleport({ x: 0, y: 130, z: 0 }); h.vel.set(0, 0, 18); h.grounded = false; h.setState('air'); h.airT = 0.5; });
  await page.keyboard.down('Space');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.hero.state === 'glide' && window.__game.hero.glide.wingsuit)).toBe(true);
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(2200);
  const dive = await page.evaluate(() => ({ y: window.__game.hero.pos.y, v: window.__game.hero.glide.speed }));
  await shot(page, 'wingsuit-dive');
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.down('KeyS');
  let top = dive.y;
  for (let i = 0; i < 12; i++) { await page.waitForTimeout(200); top = Math.max(top, await page.evaluate(() => window.__game.hero.pos.y)); }
  await page.keyboard.up('KeyS');
  await page.keyboard.up('Space');
  expect(dive.v).toBeGreaterThan(30);
  expect(top - dive.y).toBeGreaterThan(12);
  expect(errors).toEqual([]);
});

test('grapple-boost chaining crosses the Loop without touching the street', async ({ page }) => {
  test.setTimeout(300000);
  // [verify] Clear weather: the wingsuit drifts with the wind and its gusts, so a tailwind could carry
  // a glide past a link (2-4 lines on the same build); the chain is judged in still air.
  const errors = await boot(page, '&moves=all&weather=clear');
  // A roof on the Loop's west side, looking east along it. [verify] A mid-height one (under 80 m):
  // the box also holds the 140 m stepped tower, and from up there the wingsuit glides most of the
  // Loop above every roof, where the grapple (which only aims up, src/world/grapple.js minRise)
  // rightly offers nothing; the run then had 3-4 lines depending on machine load and the "> 3
  // lines" check flaked. From a mid roof the chain itself has to carry her across.
  const start = await page.evaluate(() => {
    const g = window.__game, pts = g.world.grapplePoints.filter((p) => !p.perch && p.x > -260 && p.x < -200 && p.z < -380 && p.z > -560 && p.y > 20 && p.y < 80);
    pts.sort((a, b) => b.y - a.y);
    const p = pts[0];
    g.hero.teleport({ x: p.x - (p.nx ?? 0) * 1.5, y: p.y + 0.2, z: p.z - (p.nz ?? 0) * 1.5 }, Math.PI / 2);
    g.follow.snapBehind(Math.PI / 2, 0.05);
    return { x: p.x, y: p.y, z: p.z };
  });
  // The pilot: aim east, grapple the target the game offers when it is ahead, jump in the reel's
  // last third (the perfect boost) and hold it to glide, and again from the air.
  let minY = Infinity, links = 0, perfect = 0, street = 0, space = false;
  await page.evaluate(() => { window.__perfect = 0; window.__game.events.on('grappleBoost', (d) => { if (d?.perfect) window.__perfect++; }); });
  for (let i = 0; i < 700; i++) {
    const s = await page.evaluate(() => {
      const g = window.__game, h = g.hero;
      g.follow.state.yaw = Math.PI / 2; g.follow.state.pitch = h.state === 'glide' ? 0.12 : 0.05;
      const c = h.control;
      return { x: h.pos.x, y: h.pos.y, state: h.state, ctl: c?.name ?? null, k: c?.k ?? 0, tx: g.grapple.target?.x ?? null, ground: h.groundY ?? 0 };
    });
    minY = Math.min(minY, s.y);
    if (s.state === 'ground' && s.y < 2) street++;
    if (s.x > 236) break; // the Loop's east edge
    if (!s.ctl && s.tx !== null && s.tx > s.x + 12) { await page.keyboard.press('KeyF'); links++; }
    else if (s.ctl === 'grapple' && s.k < 0.6 && space) { await page.keyboard.up('Space'); space = false; } // let go, to press again in the window
    else if (s.ctl === 'grapple' && s.k > 0.74 && !space) { await page.keyboard.down('Space'); space = true; }
    else if (!s.ctl && s.state === 'ground') { space = false; await page.keyboard.up('Space'); await page.keyboard.down('KeyW'); await page.waitForTimeout(150); await page.keyboard.down('Space'); await page.waitForTimeout(120); await page.keyboard.up('KeyW'); }
    if (i === 40) await shot(page, 'grapple-chain');
    await page.waitForTimeout(90);
  }
  await page.keyboard.up('Space');
  const end = await page.evaluate(() => ({ x: window.__game.hero.pos.x, perfect: window.__perfect }));
  perfect = end.perfect;
  console.log(`grapple chain: ${(end.x - start.x).toFixed(0)} m, ${links} lines, ${perfect} perfect boosts, ${street} street touchdowns`);
  expect(end.x).toBeGreaterThan(200);
  expect(links).toBeGreaterThan(3);
  expect(perfect).toBeGreaterThan(1);
  expect(street).toBe(0);
  expect(errors).toEqual([]);
});

test('drives core -> Lower Gotham upper deck, ramp, lower deck -> Lakeshore Drive -> Arkham causeway -> Blackgate causeway', async ({ page }) => {
  test.setTimeout(600000);
  const errors = await boot(page);
  await page.evaluate(() => { const g = window.__game; g.teleport({ x: -30, y: 0, z: -150 }); g.vehicles.summon('batmobile', { instant: true }); g.vehicles.enter(g.vehicles.batmobile); });
  for (const leg of DRIVE_LEGS) {
    expect(await page.evaluate(startLeg, leg), `${leg.id} has a route`).toBe(true);
    const r = await page.waitForFunction(() => window.__leg.done && { ok: window.__leg.ok, below: window.__leg.worstBelow, t: window.__leg.t }, null, { timeout: 200000, polling: 500 }).then((h) => h.jsonValue());
    const at = await page.evaluate(() => window.__game.vehicles.active.group.position.toArray());
    expect(r.ok, `${leg.id} reached`).toBe(true);
    expect(r.below, `${leg.id}: never under the road`).toBeLessThan(2);
    expect(Math.abs(at[1] - leg.y), `${leg.id}: on the right deck`).toBeLessThan(1.5);
    if (leg.y < -3) {
      // Under the upper deck: the chase camera stays below its slab (it used to sit inside it).
      const camY = await page.evaluate(() => window.__game.camera.position.y);
      expect(camY, `${leg.id}: camera under the upper deck`).toBeLessThan(-1);
    }
    await shot(page, `drive-${leg.id}`);
  }
  expect(errors).toEqual([]);
});

test('battle mode: strafes sideways and the turret takes out drones', async ({ page }) => {
  test.setTimeout(150000);
  const errors = await boot(page);
  await page.evaluate(() => { const g = window.__game; g.teleport({ x: 150, y: 0, z: -14 }); g.vehicles.startBattle({ site: { x: 150, y: 0, z: -14 }, drones: 3 }); });
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__game.vehicles.mode)).toBe('battle');
  const before = await page.evaluate(() => ({ x: window.__game.vehicles.batmobile.group.position.x, z: window.__game.vehicles.batmobile.group.position.z, yaw: window.__game.vehicles.batmobile.v.yaw }));
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(900);
  const lat = await page.evaluate(() => window.__game.vehicles.batmobile.v.lat);
  await shot(page, 'battle-strafe');
  await page.keyboard.up('KeyD');
  const after = await page.evaluate(() => ({ x: window.__game.vehicles.batmobile.group.position.x, z: window.__game.vehicles.batmobile.group.position.z }));
  // Moved mostly sideways relative to its own facing.
  const dx = after.x - before.x, dz = after.z - before.z;
  const side = Math.abs(dx * -Math.cos(before.yaw) + dz * Math.sin(before.yaw)), fwd = Math.abs(dx * Math.sin(before.yaw) + dz * Math.cos(before.yaw));
  expect(Math.abs(lat)).toBeGreaterThan(5);
  expect(side).toBeGreaterThan(fwd);
  // Aim at each drone in turn and hold fire.
  for (let k = 0; k < 40; k++) {
    const left = await page.evaluate(() => {
      const g = window.__game, v = g.vehicles, b = v.battle;
      if (!b) return 0;
      const d = b.drones.find((x) => !x.dead);
      if (!d) return 0;
      const p = v.batmobile.group.position;
      g.follow.state.yaw = Math.atan2(d.group.position.x - p.x, d.group.position.z - p.z);
      v.fireTurret({ yaw: g.follow.state.yaw, pitch: 0 });
      return b.drones.filter((x) => !x.dead).length;
    });
    if (!left) break;
    await page.waitForTimeout(400);
  }
  await shot(page, 'battle-turret');
  expect(await page.evaluate(() => window.__game.vehicles.battle)).toBe(null);
  expect(errors).toEqual([]);
});

test('eject at speed launches into a glide; remote call drives the car to her', async ({ page }) => {
  test.setTimeout(150000);
  const errors = await boot(page);
  await page.evaluate(() => { const g = window.__game; g.teleport({ x: 150, y: 0, z: -14 }); g.vehicles.summon('batmobile', { instant: true }); g.vehicles.enter(g.vehicles.batmobile); g.vehicles.batmobile.v.yaw = 0; });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1600);
  await page.keyboard.down('Space'); // held: the glide opens out of the eject
  await page.keyboard.up('KeyW');
  // Eject needs 14 m/s: make sure of it whatever was in the way of the run-up.
  await page.evaluate(() => { const v = window.__game.vehicles.batmobile.v; v.speed = Math.max(v.speed, 24); });
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(500);
  const ej = await page.evaluate(() => ({ state: window.__game.hero.state, y: window.__game.hero.pos.y, v: Math.hypot(window.__game.hero.vel.x, window.__game.hero.vel.z), active: !!window.__game.vehicles.active }));
  await shot(page, 'eject-glide');
  await page.keyboard.up('Space');
  expect(ej.active).toBe(false);
  expect(['glide', 'air']).toContain(ej.state);
  expect(ej.v).toBeGreaterThan(8);
  // Remote call: walk her 150 m away down the street and press the vehicle key.
  await page.waitForFunction(() => window.__game.hero.state === 'ground', null, { timeout: 15000 });
  await page.evaluate(() => window.__game.teleport({ x: 150, y: 0, z: 150 }));
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__arrived = false; window.__game.events.on('vehicleArrived', () => { window.__arrived = true; }); });
  await page.keyboard.press('KeyT');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.vehicles.calling)).toBe(true);
  await page.waitForFunction(() => window.__arrived, null, { timeout: 40000 });
  const d = await page.evaluate(() => { const g = window.__game, p = g.vehicles.batmobile.group.position; return Math.hypot(p.x - g.hero.pos.x, p.z - g.hero.pos.z); });
  await shot(page, 'remote-call');
  expect(d).toBeLessThan(15);
  expect(errors).toEqual([]);
});

test('two players: driver and gunner stop a getaway car', async ({ page }) => {
  test.setTimeout(150000);
  const errors = await boot(page, '&p2=bot');
  await page.waitForFunction(() => window.__game.players?.length === 2, null, { timeout: 20000 });
  const seated = await page.evaluate(() => {
    const g = window.__game, p2 = g.players[1];
    g.teleport({ x: 150, y: 0, z: -14 });
    g.vehicles.summon('batmobile', { instant: true });
    g.vehicles.enter(g.vehicles.batmobile);
    p2.hero.teleport({ x: g.hero.pos.x + 2, y: g.hero.pos.y, z: g.hero.pos.z });
    g.coop.seats.vehicleKey(p2);
    return g.coop.seats.seated(p2);
  });
  expect(seated).toBe(true);
  const id = await page.evaluate(() => { window.__chase = null; window.__game.events.on('chaseEnd', (d) => { window.__chase = d; }); return window.__game.vehicles.chases.startPursuit({ outcome: 'immobilise', stop: 100, speed: 12 })?.id ?? null; });
  expect(id).not.toBe(null);
  // Battle mode (the driver holds it); the gunner fires the immobiliser where their camera looks.
  await page.mouse.down({ button: 'right' });
  for (let k = 0; k < 60; k++) {
    const done = await page.evaluate(() => {
      const g = window.__game, v = g.vehicles, p2 = g.players[1];
      if (window.__chase) return true;
      const c = [...v.chases.running.values()][0];
      if (!c || v.mode !== 'battle') return false;
      const t = c.units[0].m.group.position, p = v.batmobile.group.position;
      const f = p2.rig.follow;
      f.state.yaw = Math.atan2(t.x - p.x, t.z - p.z); f.state.pitch = 0.1;
      v.fireCannon(f);
      return false;
    });
    if (done) break;
    await page.waitForTimeout(500);
  }
  await page.mouse.up({ button: 'right' });
  await shot(page, 'coop-gunner');
  const end = await page.evaluate(() => window.__chase);
  expect(end?.ok).toBe(true);
  expect(errors).toEqual([]);
});

test('the Batwing drops her over a far district into a glide (fast-travel hook)', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  const target = { x: 345, y: 0, z: -450 };
  const ok = await page.evaluate((t) => { window.__dropped = false; window.__game.events.on('wingDropDone', () => { window.__dropped = true; }); return window.__game.batwing.dropAt(t); }, target);
  expect(ok).toBe(true);
  await page.waitForTimeout(2500);
  await shot(page, 'batwing-drop');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__dropped, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  const h = await page.evaluate(() => ({ x: window.__game.hero.pos.x, y: window.__game.hero.pos.y, z: window.__game.hero.pos.z, state: window.__game.hero.state, vis: window.__game.hero.bat.root.visible }));
  await page.keyboard.up('Space');
  expect(Math.hypot(h.x - target.x, h.z - target.z)).toBeLessThan(40);
  expect(h.y).toBeGreaterThan(30);
  expect(h.vis).toBe(true);
  expect(['glide', 'air']).toContain(h.state);
  expect(errors).toEqual([]);
});

test('on foot on the lower deck and the river walk nothing pulls her back (fall rescue, bounds)', async ({ page }) => {
  test.setTimeout(120000);
  const errors = await boot(page);
  for (const p of [{ x: 0, y: -5.5, z: -291 }, { x: 100, y: -4.5, z: -271 }]) {
    await page.evaluate((q) => window.__game.teleport(q), p);
    await page.keyboard.down('KeyW');
    let worst = 0;
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(300);
      const h = await page.evaluate(() => window.__game.hero.pos.toArray());
      worst = Math.max(worst, Math.abs(h[1] - p.y), Math.hypot(h[0] - p.x, h[2] - p.z) > 40 ? 99 : 0);
    }
    await page.keyboard.up('KeyW');
    expect(worst, `stays down at ${JSON.stringify(p)}`).toBeLessThan(1.5);
  }
  await shot(page, 'lower-deck-on-foot');
  expect(errors).toEqual([]);
});
