import { test, expect } from '@playwright/test';

// Workstream K: Wayne Manor, the Batcave, playing as Bruce and the double life, end to end.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
async function boot(page, q = '?at=start&god=1&new=1') {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${q}`);
  await page.waitForFunction(ready, null, { timeout: 120000 });
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
// Stand a hero at a site or a pocket point (local), facing yaw.
const standAt = (page, where) => page.evaluate((w) => {
  const G = window.__game, B = G.bruce;
  const p = w.site ? { ...B.sites[w.site] } : B.pockets.toWorld(w.pocket, w);
  const g = G.world.collision.groundBelow(p.x, p.y + 2, p.z, 0.3);
  G.hero.teleport({ x: p.x, y: g > -Infinity ? g : p.y, z: p.z }, w.yaw ?? 0);
}, where);
const skipRadio = (page) => page.evaluate(() => window.__game.radio?.skip?.());

test('Bristol -> the Manor -> the clock passage -> every cave station -> suit up -> out through the waterfall', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  // Walk up to the Manor's front door in Bristol and press the interact key.
  await standAt(page, { site: 'wayneManorFront', yaw: -Math.PI / 2 });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.bruce.state.inside === 'wayneManor', null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__game.bruce.pockets.record('wayneManor').ms)).toBeLessThan(4000);
  // Indoors for audio, the environment object and the rain.
  expect(await page.evaluate(() => ({ inside: window.__game.interiors.inside, rain: window.__game.world.rain.mesh.visible }))).toEqual({ inside: 'bruce:wayneManor', rain: false });
  // Change into Bruce at the wardrobe, then the clock passage in the study (by the key, standing at it).
  await page.evaluate(() => window.__game.bruce.becomeBruce('casual'));
  await standAt(page, { pocket: 'wayneManor', x: 20.8, y: 0, z: -4, yaw: Math.PI / 2 });
  await page.waitForTimeout(500);
  await skipRadio(page);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.bruce.state.inside === 'batcave', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__game.bruce.state.area)).toBe('ledge');
  // Every station answers. Overlays and the real station screens pause the game and close with Esc
  // (back to live play in the cave: no pause menu, nothing left on screen). [fix1] The benches and
  // the vault open the real screens: the gadget loadout, the skill tree and the wardrobe.
  const stations = ['batcomputer', 'suitVault', 'lockers', 'workbench', 'skillBench', 'medbay', 'trophyCoin', 'trophyDino', 'trophyCard', 'batcycle', 'simConsole', 'waterfall'];
  const REAL = { workbench: ['gadgets', '.gloadout'], skillBench: ['skillTree', '.st-menu'], suitVault: ['suits', '.wardrobe-layer'] };
  for (const id of stations) {
    const r = await page.evaluate(async (sid) => {
      const B = window.__game.bruce;
      const ok = await B.use(sid);
      return { ok, busy: B.ui.busy, system: B.ui.systemOpen, paused: window.__game.state.paused };
    }, id);
    expect(r.ok, id).toBe(true);
    if (REAL[id]) {
      expect(r.system, `${id} opens the real screen`).toBe(REAL[id][0]);
      await expect(page.locator(REAL[id][1]), `${id} screen`).toHaveCount(1);
    }
    if (r.busy) {
      expect(r.paused, `${id} pauses`).toBe(true);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.__game.bruce.ui.busy && !window.__game.state.paused && !window.__game.state.pauseMenu, null, { timeout: 5000 });
      expect(await page.locator('.menu-layer.show, .gloadout, .wardrobe-layer').count(), `${id} leaves nothing on screen`).toBe(0);
      expect(await page.evaluate(() => window.__game.bruce.state.inside), `${id} back in the cave`).toBe('batcave');
    }
    await skipRadio(page);
  }
  // [fix1] The benches also close from their own Back / Done buttons.
  for (const [id, label] of [['workbench', 'Done'], ['skillBench', 'Back']]) {
    await page.evaluate((sid) => window.__game.bruce.use(sid), id);
    await page.locator('.menu-layer.show button', { hasText: new RegExp(`^${label}$`) }).first().click();
    await page.waitForFunction(() => !window.__game.bruce.ui.busy && !window.__game.state.paused && !window.__game.state.pauseMenu, null, { timeout: 5000 });
  }
  // The Batcomputer's tabs all render.
  for (const tab of ['city', 'calendar', 'cases', 'villains', 'missions', 'news']) {
    const html = await page.evaluate((t) => { const B = window.__game.bruce; B.openBatcomputer(t); return document.querySelector('.bw-panel')?.textContent ?? ''; }, tab);
    expect(html, tab).toContain('BATCOMPUTER');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__game.bruce.ui.overlayOpen, null, { timeout: 5000 });
  }
  // The training simulator: a drill spawns holographic goons on the ring; clearing them earns a medal.
  const sim = await page.evaluate(() => { const B = window.__game.bruce; const ok = B.startSim('simBasics'); return { ok, n: window.__game.enemies.length }; });
  expect(sim.ok).toBe(true);
  expect(sim.n).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__game.winFight());
  await page.waitForFunction(() => !window.__game.bruce.state.sim, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__game.progress.batcave.medals.simBasics)).toBeTruthy();
  // Suit up (Bruce -> Batman) at the vault.
  await page.evaluate(() => window.__game.bruce.becomeBruce('casual'));
  expect(await page.evaluate(() => ({ id: window.__game.bruce.state.identity, ctl: window.__game.hero.control?.name, bat: window.__game.hero.bat.root.visible }))).toEqual({ id: 'bruce', ctl: 'civilian', bat: false });
  await page.evaluate(() => window.__game.bruce.use('suitUp'));
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => ({ id: window.__game.bruce.state.identity, bat: window.__game.hero.bat.root.visible }))).toEqual({ id: 'batman', bat: true });
  // Drive out: the Batmobile leaves the turntable through the waterfall into Bristol.
  await page.evaluate(() => window.__game.bruce.use('vehicleBay'));
  await page.waitForFunction(() => !window.__game.bruce.state.inside && window.__game.vehicles.active === window.__game.vehicles.batmobile, null, { timeout: 15000 });
  const out = await page.evaluate(() => { const G = window.__game, s = G.bruce.sites.batcaveMouth; return { d: Math.hypot(G.hero.pos.x - s.x, G.hero.pos.z - s.z), y: G.hero.pos.y, district: G.world.districtAt(G.hero.pos.x, G.hero.pos.z) }; });
  expect(out.d).toBeLessThan(20);
  expect(out.y).toBeGreaterThan(-1);
  // Drive back in: the mouth takes the car into the cave.
  await page.evaluate(() => window.__game.vehicles.exit());
  await standAt(page, { site: 'batcaveMouth', yaw: Math.PI });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => window.__game.bruce.state.inside === 'batcave', null, { timeout: 15000 });
  expect(errors).toEqual([]);
});

// Plays the gala to the end, answering with `pick` at each decision. Returns the scene result.
async function playGala(page, stance) {
  await page.evaluate(() => { window.__bruceResult = null; window.__game.bruce.playScene('gala').then((r) => { window.__bruceResult = r; }); });
  await page.waitForFunction(() => !!window.__game.bruce.scene, null, { timeout: 20000 });
  for (let guard = 0; guard < 400; guard++) {
    const st = await page.evaluate(() => {
      const G = window.__game, B = G.bruce, sc = B.scene;
      if (window.__bruceResult) return { done: true };
      if (B.ui.overlayOpen) return { overlay: true };
      if (!sc) return { wait: true };
      if (G.radio?.playing) { G.radio.skip(); return { wait: true }; }
      const m = sc.machine;
      return { type: m.node.type, id: m.nodeId, target: m.node.target?.station ?? null, choices: B.ui.choicesOpen };
    });
    if (st.done) break;
    if (st.overlay) { await page.keyboard.press('Escape'); await page.waitForTimeout(200); continue; }
    if (st.type === 'choice' && st.choices) { await page.keyboard.press('Digit1'); await page.waitForTimeout(150); continue; }
    if (st.type === 'pressure' && st.choices) {
      if (stance === 'slip') { await page.keyboard.press('Digit3'); await page.waitForTimeout(100); await page.keyboard.press('Digit2'); }
      else await page.keyboard.press('Digit1');
      await page.waitForTimeout(150);
      continue;
    }
    if (st.type === 'goto' && st.target) {
      // Walk there: stand on the mark (the runtime checks arrival itself).
      const s = await page.evaluate((id) => window.__game.bruce.POCKETS.wayneManor.stations[id], st.target);
      await standAt(page, { pocket: 'wayneManor', x: s.x, y: s.y ?? 0, z: s.z, yaw: 0 });
      await page.waitForTimeout(200);
      continue;
    }
    await page.waitForTimeout(120);
  }
  return page.evaluate(() => window.__bruceResult);
}

test('the gala: the signal mid-toast, played to stay and to slip away; the meters and the next night carry it', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  // A rough night first: the injuries show on Bruce at the gala.
  const inj = await page.evaluate(async () => {
    const B = window.__game.bruce;
    B.reset();
    return B.skipDay('day1', { report: { endHour: 4.5, hits: 9, finishers: 3, crimesStopped: 2 } }).nightStart;
  });
  expect(inj.staminaRegenK).toBeLessThanOrEqual(1);
  const before = await page.evaluate(() => ({ ...window.__game.bruce.life, suspicion: { ...window.__game.bruce.life.suspicion } }));
  const stay = await playGala(page, 'stay');
  expect(stay.outcome).toBe('stay');
  const afterStay = await page.evaluate(() => { const B = window.__game.bruce; return { standing: B.life.standing, city: B.life.city, escalated: B.life.flags.escalated, lip: B.civ.of(window.__game.players[0])?.figure.injuries.lip, scenes: B.life.scenes }; });
  expect(afterStay.standing).toBeGreaterThan(before.standing);
  expect(afterStay.city).toBeLessThan(before.city);
  expect(afterStay.escalated).toBe(true);
  expect(afterStay.lip).toBe(true); // the split lip from the night was on Bruce at the gala
  expect(afterStay.scenes.gala).toBe('stay');
  // Again, slipping away with Alfred's cover.
  await page.evaluate(() => { const B = window.__game.bruce; B.reset(); });
  const p0 = await page.evaluate(() => window.__game.bruce.life.patience);
  const slip = await playGala(page, 'slip');
  expect(slip.outcome).toBe('slip');
  const afterSlip = await page.evaluate(() => { const B = window.__game.bruce; return { patience: B.life.patience, early: B.life.flags.earlyStart, city: B.life.city, ns: B.nightStart() }; });
  expect(afterSlip.patience).toBeLessThan(p0);
  expect(afterSlip.early).toBe(true);
  expect(afterSlip.city).toBeGreaterThan(50);
  expect(afterSlip.ns.notes).toBeTruthy();
  // The save carries it.
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gotham-progress-v1') ?? '{}').bruce?.scenes?.gala);
  expect(saved).toBe('slip');
  expect(errors).toEqual([]);
});

test('a Bruce day: breakfast with a split lip and the reporter at the table, the 9 a.m. vote, the night starts in the cave', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page);
  // A Bruce day after a hard night: breakfast with a split lip and the reporter at the table, the
  // excuse remembered; then the day's commitment (the 9 a.m. vote) and the night starts in the cave.
  await page.evaluate(() => { const B = window.__game.bruce; B.reset(); window.__dayResult = null; B.playDay('day2', { report: { endHour: 5.2, hits: 10, finishers: 4, crimesStopped: 1 } }).then((r) => { window.__dayResult = r; }); });
  await page.waitForFunction(() => { const G = window.__game; if (G.radio.playing) G.radio.skip(); return G.bruce.ui.choicesOpen; }, null, { timeout: 40000, polling: 200 });
  const morning = await page.evaluate(() => { const B = window.__game.bruce; return { inside: B.state.inside, room: B.state.room, id: B.state.identity, reporter: !!B.cast.byId('reporter'), lip: B.civ.of(window.__game.players[0]).figure.injuries.lip }; });
  expect(morning).toEqual({ inside: 'wayneManor', room: 'dining', id: 'bruce', reporter: true, lip: true });
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__game.bruce.life.excuses.sailing?.who)).toEqual(['reporter']);
  await page.evaluate(() => { window.__game.bruce.startDayScene(); });
  for (let i = 0; i < 400; i++) {
    const done = await page.evaluate(() => {
      const G = window.__game, B = G.bruce;
      if (window.__dayResult) return true;
      if (G.radio.playing) G.radio.skip();
      if (B.ui.overlayOpen) { B.ui.closeOverlay(); return false; }
      const m = B.scene?.machine;
      if (!m || m.done) return false;
      if (m.node.type === 'choice') { const o = m.options().find((x) => x.ok); if (o) m.choose(o.id); }
      else if (m.node.type === 'inspect') for (const s of m.node.spots) m.inspect(s.id);
      else if (m.node.type === 'pressure') m.stay();
      return false;
    });
    if (done) break;
    await page.waitForTimeout(150);
  }
  const day = await page.evaluate(() => ({ r: window.__dayResult, inside: window.__game.bruce.state.inside, scenes: window.__game.bruce.life.scenes }));
  expect(day.r.slot).toBe('day2');
  expect(day.r.scene).toBe('boardVote');
  expect(day.r.nightStart.staminaRegenK).toBeLessThanOrEqual(1);
  expect(day.inside).toBe('batcave');
  expect(day.scenes.boardVote).toBe('stay');
  expect(errors).toEqual([]);
});

test('co-op: two players go through the cave together; the partner is the ward in a Bruce scene', async ({ page }) => {
  test.setTimeout(240000);
  const errors = await boot(page, '?at=start&god=1&new=1&p2=bot');
  await page.waitForFunction(() => window.__game.players.length === 2, null, { timeout: 60000 });
  await page.evaluate(() => window.__game.bruce.enterSite('batcaveDowntown'));
  await page.waitForFunction(() => window.__game.bruce.state.inside === 'batcave', null, { timeout: 15000 });
  const both = await page.evaluate(() => window.__game.players.map((p) => !!window.__game.bruce.pockets.at(p.hero.pos)));
  expect(both).toEqual([true, true]);
  await page.evaluate(() => window.__game.bruce.becomeBruce('suit'));
  const kinds = await page.evaluate(() => window.__game.players.map((p) => window.__game.bruce.civ.of(p)?.kind));
  expect(kinds).toEqual(['bruce', 'ward']);
  // The partner buys time in a stay-or-slip decision (once).
  const assist = await page.evaluate(async () => {
    const B = window.__game.bruce;
    B.playScene('detectiveCalls');
    await new Promise((r) => setTimeout(r, 1500));
    const m = B.scene.machine;
    while (m.node.type !== 'pressure') { if (m.node.type === 'choice') m.choose(m.options().find((o) => o.ok).id); else if (m.node.type === 'line' || m.node.type === 'event') m.next(); }
    const t0 = m.timer;
    return { first: m.assist(), second: m.assist(), gained: m.timer - t0 };
  });
  expect(assist).toEqual({ first: true, second: false, gained: 10 });
  await page.evaluate(() => { const m = window.__game.bruce.scene.machine; m.stay(); });
  await page.waitForFunction(() => { window.__game.radio.skip(); return window.__game.bruce.ui.overlayOpen || !window.__game.bruce.scene; }, null, { timeout: 30000, polling: 200 });
  await page.evaluate(() => { window.__game.radio.skip(); window.__game.bruce.ui.closeOverlay(); });
  // Out through the tunnel together.
  await page.evaluate(() => window.__game.bruce.becomeBatman());
  await page.evaluate(() => window.__game.bruce.use('tunnel'));
  await page.waitForFunction(() => !window.__game.bruce.state.inside, null, { timeout: 15000 });
  const outside = await page.evaluate(() => window.__game.players.map((p) => window.__game.bruce.pockets.at(p.hero.pos) === null && p.hero.bat.root.visible));
  expect(outside).toEqual([true, true]);
  expect(errors).toEqual([]);
});
