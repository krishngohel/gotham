// The open world (workstream J3): crime system v2, stealth encounters, a side chain with its boss,
// a detective case and a director soak. Each scenario runs solo and with a bot partner (?p2=bot).
import { test, expect } from '@playwright/test';

const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
async function boot(page, extra = '') {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?night=n2&god=1&new=1${extra}`);
  await page.waitForFunction(ready, null, { timeout: 90000 });
  // [verify] Night Two now opens on its recap comic (n2Recap, J2), a cutscene step that holds the open
  // world (crimes cancel under STORY_STOP); this spec predates it. Read past it into free play.
  await page.waitForFunction(() => { const G = window.__game; if (G.comic?.playing) G.comic.skip?.(); return G.flow?.mode === 'play' && G.flow.objectives?.step?.type !== 'cutscene'; }, null, { timeout: 60000, polling: 300 });
  // A clean slate: nothing else from the director in the way.
  await page.evaluate(() => { const o = window.__game.side.openworld; o.crimes.cancelAll(); });
  return errors;
}
// Spawns a crime of `type` at a crime spot (or site) and puts the hero 12 m from it.
async function crimeAt(page, type, spotId, twists = []) {
  return page.evaluate(({ type, spotId, twists }) => {
    const G = window.__game, O = G.side.openworld;
    O.crimes.cancelAll();
    const spot = O.ow.spotById(spotId);
    G.teleport({ x: spot.x + 10, y: spot.y, z: spot.z + 6 });
    const c = O.crimes.spawnNow({ type, spot, twists, life: 1e6 });
    c.forcedFocus = true;
    return c.id;
  }, { type, spotId, twists });
}
const crime = (page, id) => page.evaluate((id) => { const c = window.__game.side.openworld.crimes.live.find((x) => x.id === id); return c ? { mat: c.materialized, squad: c.squadUp, eng: c.engaged, pos: { ...c.pos }, hud: c.obj.hud?.()?.text ?? null } : null; }, id);
const ended = (page, id) => page.waitForFunction((id) => !window.__game.side.openworld.crimes.live.some((x) => x.id === id), id, { timeout: 30000, polling: 250 });

for (const p2 of ['', '&p2=bot']) {
  const tag = p2 ? ' (with a bot partner)' : '';

  test(`protect: hostages in a store are saved when the crew goes down${tag}`, async ({ page }) => {
    const errors = await boot(page, p2);
    const id = await crimeAt(page, 'hostageStore', 'mileDiamondRow0', []);
    await page.waitForFunction((id) => window.__game.side.openworld.crimes.live.find((x) => x.id === id)?.squadUp, id, { timeout: 15000 });
    await expect(page.locator('.ow-panel .ow-job.show').first()).toContainText('hostages');
    const before = await page.evaluate(() => window.__game.progress.openworld.saved);
    await page.waitForFunction(() => { window.__game.winFight(); return window.__game.progress.crimes.stopped >= 1; }, null, { timeout: 20000, polling: 400 });
    await ended(page, id);
    expect(await page.evaluate(() => window.__game.progress.openworld.saved)).toBeGreaterThan(before);
    expect(await page.evaluate(() => window.__game.progress.openworld.types.hostageStore)).toBe(1);
    expect(errors).toEqual([]);
  });

  test(`defuse: the bomb's dial takes three strikes in the window${tag}`, async ({ page }) => {
    const errors = await boot(page, p2);
    const id = await crimeAt(page, 'bomb', 'loopMarqueeRow', []);
    await page.waitForFunction((id) => window.__game.side.openworld.crimes.live.find((x) => x.id === id)?.materialized, id, { timeout: 15000 });
    // Walk up to each bomb and strike only when the cursor is in the window (the skill interaction).
    await page.waitForFunction((id) => {
      const G = window.__game, c = G.side.openworld.crimes.live.find((x) => x.id === id);
      if (!c) return true;
      const L = c.obj.leaves.find((l) => l.kind === 'defuse');
      const b = L.bombs.find((x) => !x.done && !x.decoy);
      if (!b) { G.winFight(); return false; }
      if (Math.hypot(G.hero.pos.x - b.x, G.hero.pos.z - b.z) > 1.5) G.hero.teleport({ x: b.x + 0.8, y: b.y, z: b.z });
      if (L.inWindow(b)) L.press(b);
      return false;
    }, id, { timeout: 40000, polling: 50 });
    expect(await page.evaluate(() => window.__game.progress.openworld.types.bomb)).toBe(1);
    expect(errors).toEqual([]);
  });

  test(`rooftop chase: the free-runner hops the roofs until a hero catches him${tag}`, async ({ page }) => {
    const errors = await boot(page, p2);
    const id = await crimeAt(page, 'rooftopChase', 'parkRowMugging', []);
    await page.waitForFunction((id) => window.__game.side.openworld.crimes.live.find((x) => x.id === id)?.materialized, id, { timeout: 15000 });
    const start = await crime(page, id);
    await page.waitForTimeout(2500);
    const moved = await page.evaluate((id) => { const c = window.__game.side.openworld.crimes.live.find((x) => x.id === id); const r = c.obj.leaves[0].runners[0]; return { s: r.s, y: r.y }; }, id);
    expect(moved.s).toBeGreaterThan(3);
    expect(moved.y).toBeGreaterThan(6); // on the roofs
    void start;
    // Catch him: put the hero on his roof beside him.
    await page.waitForFunction((id) => {
      const G = window.__game, c = G.side.openworld.crimes.live.find((x) => x.id === id);
      if (!c) return true;
      const r = c.obj.leaves[0].runners[0];
      if (!r.air) G.hero.teleport({ x: r.x + 0.6, y: r.y, z: r.z });
      return false;
    }, id, { timeout: 20000, polling: 100 });
    expect(await page.evaluate(() => window.__game.progress.openworld.types.rooftopChase)).toBe(1);
    expect(errors).toEqual([]);
  });

  test(`vehicle getaway: the car is stopped before it reaches the exit${tag}`, async ({ page }) => {
    const errors = await boot(page, p2);
    const id = await crimeAt(page, 'vehicleGetaway', 'loopCanyon', []);
    await page.waitForFunction((id) => window.__game.side.openworld.crimes.live.find((x) => x.id === id)?.materialized, id, { timeout: 15000 });
    // Either the vehicle chase took it (ram it: the adapter mirrors sideChaseDone) or the kinematic
    // car is running its route (stand alongside it to pull the driver out).
    await page.waitForFunction((id) => {
      const G = window.__game, c = G.side.openworld.crimes.live.find((x) => x.id === id);
      if (!c) return true;
      if (c.chase) { G.events.emit('sideChaseDone', { ok: true }); return false; }
      const car = c.obj.leaves[0].car;
      if (car.moving) G.hero.teleport({ x: car.x + 1.5, y: car.y, z: car.z });
      return false;
    }, id, { timeout: 25000, polling: 100 });
    const r = await page.evaluate(() => window.__game.progress.openworld.types.vehicleGetaway);
    expect(r).toBe(1);
    expect(errors).toEqual([]);
  });

  test(`gang war: take one crew down, leave the other be, and the street is theirs${tag}`, async ({ page }) => {
    const errors = await boot(page, p2);
    const id = await crimeAt(page, 'gangWar', 'parkRowUnderViaduct', []);
    await page.waitForFunction((id) => window.__game.side.openworld.crimes.live.find((x) => x.id === id)?.squadUp, id, { timeout: 15000 });
    await page.waitForFunction(() => window.__game.enemies.some((e) => e.aware), null, { timeout: 10000 });
    const gangs = await page.evaluate((id) => window.__game.side.openworld.crimes.live.find((x) => x.id === id).plan.gangs, id);
    // Knock out only the first crew.
    await page.waitForFunction(({ id, g }) => {
      const G = window.__game, c = G.side.openworld.crimes.live.find((x) => x.id === id);
      if (!c) return true;
      let left = 0;
      for (const [e, gang] of c.tagged) if (gang === g && e.alive) { left++; e.health = 0; e.applyHit({ outcome: 'ko' }, G.hero.pos); }
      return left === 0 && c.obj.truce > 0;
    }, { id, g: gangs[0] }, { timeout: 20000, polling: 300 });
    // The truce: hands off the other crew and they leave with the street (a bot partner may break
    // it by hitting them: then it's a fight to the finish and both crews lose ground).
    const before = await page.evaluate(({ g }) => window.__game.side.openworld.director.district('parkRow').control[g] ?? 0, { g: gangs[1] });
    await page.evaluate(() => { window.__owEnd = null; window.__game.events.on('crimeEnd', (d) => { window.__owEnd = d; }); });
    await page.waitForFunction((id) => { const G = window.__game, c = G.side.openworld.crimes.live.find((x) => x.id === id); if (c && c.obj.truce === -2) G.winFight(); return !c; }, id, { timeout: 40000, polling: 300 });
    const end = await page.evaluate(() => window.__owEnd);
    expect(end.outcome).toBe('stopped');
    const after = await page.evaluate(({ g }) => window.__game.side.openworld.director.district('parkRow').control[g] ?? 0, { g: gangs[1] });
    if (end.sided) expect(after).toBeGreaterThan(before);
    else expect(after).toBeLessThan(before);
    if (!p2) expect(end.sided).toBe(gangs[1]);
    expect(errors).toEqual([]);
  });

  test(`El hijack: board the running train, then clear its roof${tag}`, async ({ page }) => {
    const errors = await boot(page, p2);
    const id = await crimeAt(page, 'elHijack', 'loopElPlatform', []);
    await page.waitForFunction((id) => window.__game.side.openworld.crimes.live.find((x) => x.id === id)?.materialized, id, { timeout: 15000 });
    // Ride along: stand on the hijacked train (its live record from the El).
    await page.waitForFunction((id) => {
      const G = window.__game, O = G.side.openworld, c = O.crimes.live.find((x) => x.id === id);
      if (!c) return true;
      if (c.squadUp) return true;
      const T = O.geo.trainState(c.plan.train);
      G.hero.teleport({ x: T.x, y: T.y + 3.4, z: T.z });
      return false;
    }, id, { timeout: 20000, polling: 200 });
    await page.waitForFunction(() => { window.__game.winFight(); return window.__game.progress.openworld.types.elHijack === 1; }, null, { timeout: 25000, polling: 400 });
    expect(errors).toEqual([]);
  });

  test(`stealth encounters: the counting house and the Herald nests, cleared and recorded${tag}`, async ({ page }) => {
    const errors = await boot(page, p2);
    for (const id of ['countingHouse', 'heraldNests']) {
      expect(await page.evaluate((id) => window.__game.side.openworld.stealthEnc.start(id), id)).toBe(true);
      await page.waitForFunction(() => window.__game.stealth.active, null, { timeout: 10000 });
      expect(await page.evaluate(() => window.__game.enemies.length)).toBeGreaterThanOrEqual(4);
      await page.evaluate(() => window.__game.side.openworld.stealthEnc.debugWin());
      await page.waitForFunction((id) => !!window.__game.progress.openworld.stealth[id], id, { timeout: 15000 });
    }
    expect(await page.evaluate(() => window.__game.side.openworld.stealthEnc.list().filter((e) => e.played).length)).toBe(2);
    expect(errors).toEqual([]);
  });

  test(`side chain: Heads or Tails, all four missions and the two-faced DA${tag}`, async ({ page }) => {
    test.setTimeout(240000);
    const errors = await boot(page, p2);
    await page.evaluate(() => { const c = window.__game.side.openworld.chains; c.debugUnlock(); c.fast = true; });
    for (const id of ['headsOrTails1', 'headsOrTails2', 'headsOrTails3', 'headsOrTails4']) {
      expect(await page.evaluate((id) => window.__game.side.openworld.chains.start(id), id)).toBe(true);
      await page.waitForFunction((id) => {
        const G = window.__game, ch = G.side.openworld.chains;
        if (G.comic.playing) { G.comic.skip(); return false; }
        if (!ch.active) return true;
        if (ch.active.id === id) ch.debugStep();
        return false;
      }, id, { timeout: 60000, polling: 1200 });
    }
    expect(await page.evaluate(() => window.__game.progress.openworld.chains.headsOrTails)).toBe(4);
    expect(await page.evaluate(() => window.__game.bosses.active)).toBe(false);
    expect(errors).toEqual([]);
  });

  test(`detective case: The Bell That Rang Twice, scanned, reconstructed on the board, triangulated${tag}`, async ({ page }) => {
    test.setTimeout(150000);
    const errors = await boot(page, p2);
    await page.evaluate(() => { const o = window.__game.side.openworld; o.cases.start('caseBellTwice'); o.ow.teleport(o.cases.scenePos('caseBellTwice')); window.__game.state.detectiveOn = true; });
    // Scan every piece of evidence in detective vision.
    await page.waitForFunction(() => {
      const o = window.__game.side.openworld, a = o.cases.active;
      if (a.stage !== 'scene') return true;
      const e = a.run.evidence.find((x) => !x.found);
      window.__game.hero.teleport({ x: e.pos.x + 0.5, y: e.pos.y, z: e.pos.z });
      return false;
    }, null, { timeout: 40000, polling: 600 });
    // The board opens itself: click the cards in the right order and submit.
    await expect(page.locator('.case-board')).toBeVisible();
    const order = await page.evaluate(() => window.__game.side.openworld.cases.active.def.reconstruct.order);
    for (const card of order) await page.locator(`.case-board [data-card="${card}"]`).click();
    await page.locator('.case-board [data-act="submit"]').click();
    await page.waitForFunction(() => window.__game.side.openworld.cases.active?.stage === 'trail', null, { timeout: 10000 });
    await page.evaluate(() => { const b = window.__game.side.openworld.board; if (b.isOpen) b.close(); });
    // Radio triangulation: visit the receivers, then the transmitter.
    await page.waitForFunction(() => {
      const G = window.__game, a = G.side.openworld.cases.active;
      if (!a || a.stage === 'solved') return true;
      if (a.stage === 'confront') return false;
      const r = a.run.trail.find((x) => !x.done);
      const p = r ? r.pos : a.run.target.pos;
      G.hero.teleport({ x: p.x + 0.5, y: p.y, z: p.z });
      return false;
    }, null, { timeout: 60000, polling: 700 });
    await page.waitForFunction(() => window.__game.progress.openworld.cases.caseBellTwice?.solved === true, null, { timeout: 40000, polling: 500 });
    expect(errors).toEqual([]);
  });
}

test('soak: 20 simulated minutes of the director with no input stays bounded and clean', async ({ page }) => {
  test.setTimeout(180000);
  const errors = await boot(page, '');
  const r = await page.evaluate(() => {
    const G = window.__game, o = G.side.openworld;
    G.progress.districts.push('loop', 'gothamMile', 'river', 'lowerGotham', 'narrows', 'parkRow', 'chinatown', 'yards');
    G.hero.teleport({ x: 0, y: 0, z: -420 });
    return o.soak(1200, 0.25);
  });
  expect(r.errors).toBe(0);
  expect(r.spawned).toBeGreaterThan(10);
  expect(r.maxLive).toBeLessThanOrEqual(r.cap);
  expect(r.enemies).toBeLessThan(40);
  expect(r.props.visible).toBeLessThanOrEqual(20);
  // Nothing stuck: every live crime is either waiting its life out or in play near the hero.
  const stuck = await page.evaluate(() => window.__game.side.openworld.crimes.live.filter((c) => !c.materialized && c.age > c.life + 5).length);
  expect(stuck).toBe(0);
  expect(errors).toEqual([]);
});
