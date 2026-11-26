import { test, expect } from '@playwright/test';

// [prog] Wave 3 gadgets: each new gadget equipped through window.__game.gadgets.equip(id), fired
// with the real fire key (R) through combat's input buffer, against goons spawned in front of the
// camera on the GCPD-roof sandbox (?fight=test, its own squad cleared). No console errors.
async function boot(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?fight=test&god=1&gadgets=all&at=signal');
  await page.waitForFunction(() => window.__game?.gadgets && window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 90000 });
  await page.evaluate(() => window.__game.cinematic?.skip());
  await page.evaluate(() => {
    const G = window.__game;
    setInterval(() => { if (G.comic?.playing) G.comic.skip?.(); }, 100);
    window.__log = [];
    for (const n of ['mapMark', 'mapUnmark', 'gadgetUse', 'gadgetHit', 'disruptorJam', 'sonicLand', 'sonicStun', 'hackStart', 'hackDone', 'shockReady', 'shockStrike',
      'glueBurst', 'trackerTag', 'droneLaunch', 'droneMark', 'bolasWrap', 'empPlace', 'empPulse', 'decoyOn', 'decoyShot', 'wheelPage']) {
      G.events.on(n, (d) => window.__log.push({ n, id: d?.id ?? null, kind: d?.kind ?? null }));
    }
    // Stage: clear the roof, then put goons of these types ahead of the camera at these distances.
    window.__stage = (list) => {
      for (const e of [...G.combat.enemies]) G.despawn(e);
      const h = G.hero;
      h.control = null;
      const f = h.pos.clone();
      G.follow.forward(f);
      f.y = 0; f.normalize();
      const out = list.map(([type, d, side = 0]) => G.spawn(type, { x: h.pos.x + f.x * d - f.z * side, y: h.pos.y, z: h.pos.z + f.z * d + f.x * side }));
      G.combat.setEnemies(out);
      window.__log.length = 0;
      return out;
    };
  });
  await page.waitForTimeout(800);
  return errors;
}
const fire = async (page) => { await page.keyboard.press('KeyR'); await page.waitForTimeout(150); };
const equip = (page, id) => page.evaluate((id) => window.__game.gadgets.equip(id), id);
const until = (page, n, timeout = 10000) => page.waitForFunction((n) => window.__log.some((l) => l.n === n), n, { timeout });
const logged = (page, n) => page.evaluate((n) => window.__log.filter((l) => l.n === n), n);

test('?gadgets=all unlocks all eighteen; the wheel turns to page 2 and the loadout station opens', async ({ page }) => {
  const errors = await boot(page);
  const ids = await page.evaluate(() => window.__game.gadgets.debug.unlocked);
  expect(ids).toHaveLength(18);
  await page.keyboard.down('Tab');
  await page.waitForTimeout(250);
  await expect(page.locator('.gwheel.show .gw-page.on')).toContainText('Page 1 of 3');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(150);
  await expect(page.locator('.gwheel.show .gw-page.on')).toContainText('Page 2 of 3');
  await page.keyboard.press('Digit2');
  await page.keyboard.up('Tab');
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__game.gadgets.state.equipped)).toBe('sonic');
  await expect(page.locator('.ghud .gh-name')).toHaveText(/Sonic Batarang/i);
  // The Batcave's station id, through the registry.
  await page.evaluate(async () => { const m = await import('/src/ui/stations.js'); window.__station = m.openStation('gadgets', {}); });
  await expect(page.locator('.gloadout .gl-slot')).toHaveCount(24);
  await page.locator('.gloadout .gl-slot[data-p="0"][data-s="1"]').click();
  await page.locator('.gloadout .gl-slot[data-p="2"][data-s="0"]').click();
  expect(await page.evaluate(() => window.__game.gadgets.loadout[0][1])).toBe('emp');
  await page.locator('.gloadout .gl-done').click();
  await expect(page.locator('.gloadout')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('disruptor, sonic, bolas and glue act on goons', async ({ page }) => {
  const errors = await boot(page);
  // Disruptor: the rifleman's gun jams.
  await page.evaluate(() => window.__stage([['rifle', 10]]));
  await equip(page, 'disruptor');
  await fire(page);
  expect(await page.evaluate(() => window.__game.combat.enemies[0].jamT)).toBeGreaterThan(5);
  expect((await logged(page, 'disruptorJam')).length).toBe(1);
  // Sonic: lands and lures.
  await page.evaluate(() => window.__stage([['grunt', 9], ['grunt', 11, 2]]));
  await equip(page, 'sonic');
  await fire(page);
  await page.waitForTimeout(700);
  expect((await logged(page, 'sonicLand')).length).toBe(1);
  expect(await page.evaluate(() => window.__game.combat.enemies.every((e) => e.lostT > 0))).toBe(true);
  // Bolas: drops a ninja on the spot.
  await page.evaluate(() => window.__stage([['ninja', 8]]));
  await equip(page, 'bolas');
  await fire(page);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__game.combat.enemies[0].down)).toBe(true);
  expect((await logged(page, 'bolasWrap')).length).toBe(1);
  // Glue: pins the goon standing where it bursts.
  await page.evaluate(() => window.__stage([['grunt', 10]]));
  await equip(page, 'glue');
  await page.keyboard.press('KeyR');
  await page.waitForFunction(() => window.__log.some((l) => l.n === 'gadgetUse' && l.id === 'glue'), null, { timeout: 3000 });
  await page.evaluate(() => { const G = window.__game, p = G.gadgets.handler('glue').position; G.combat.enemies[0].pos.set(p.x + 0.5, p.y, p.z); });
  await page.waitForTimeout(700);
  expect((await logged(page, 'glueBurst')).length).toBe(1);
  expect(await page.evaluate(() => window.__game.combat.enemies[0].state)).toBe('tied');
  expect(errors).toEqual([]);
});

test('tracker, decoy, EMP and drone', async ({ page }) => {
  const errors = await boot(page);
  // Tracker: tags the goon and marks him for the map.
  await page.evaluate(() => window.__stage([['grunt', 12]]));
  await equip(page, 'tracker');
  await fire(page);
  const marks = await logged(page, 'mapMark');
  expect(marks).toEqual([expect.objectContaining({ kind: 'tracker' })]);
  // Decoy: a gunman takes shots at it and the goons lose Batman.
  await page.evaluate(() => window.__stage([['rifle', 9], ['grunt', 6, 2]]));
  await equip(page, 'decoy');
  await fire(page);
  await until(page, 'decoyShot');
  expect((await logged(page, 'decoyOn')).length).toBe(1);
  expect(await page.evaluate(() => window.__game.combat.enemies[1].lostT)).toBeGreaterThan(0);
  // EMP: dropped at the feet, a goon walks into it.
  await page.evaluate(() => window.__stage([['baton', 10]]));
  await equip(page, 'emp');
  await fire(page);
  await page.waitForFunction(() => window.__game.gadgets.handler('emp').mines.some((m) => m.live && m.t > 1.05), null, { timeout: 10000 });
  await page.evaluate(() => { const G = window.__game, e = G.combat.enemies[0]; e.pos.set(G.hero.pos.x + 1, G.hero.pos.y, G.hero.pos.z); });
  await until(page, 'empPulse');
  expect(await page.evaluate(() => window.__game.combat.enemies[0].charged)).toBe(false);
  // Drone: flies forward with W and marks the goons it sees; R brings it home.
  await page.evaluate(() => window.__stage([['grunt', 14], ['grunt', 16, 3]]));
  await equip(page, 'drone');
  await fire(page);
  expect(await page.evaluate(() => window.__game.hero.control?.name)).toBe('droneSteer');
  await page.keyboard.down('KeyW');
  await until(page, 'droneMark');
  await page.keyboard.up('KeyW');
  await fire(page);
  await page.waitForFunction(() => !window.__game.gadgets.handler('drone').flying, null, { timeout: 5000 });
  expect(await page.evaluate(() => window.__game.hero.control?.name ?? null)).not.toBe('droneSteer');
  expect(errors).toEqual([]);
});

test('hack (QTE assist auto) and shock gloves', async ({ page }) => {
  const errors = await boot(page);
  await page.evaluate(() => { window.__game.settings.access.qteAssist = 'auto'; });
  await page.evaluate(() => window.__stage([['lieutenant', 8], ['grunt', 10, 3]]));
  await equip(page, 'hack');
  await fire(page);
  await expect(page.locator('.hackgame.show')).toBeVisible();
  await until(page, 'hackDone');
  expect((await logged(page, 'hackDone')).length).toBe(1);
  expect(await page.evaluate(() => window.__game.combat.enemies.every((e) => e.lostT > 0))).toBe(true);
  expect((await logged(page, 'mapMark')).every((m) => m.kind === 'hack')).toBe(true);
  // Shock: charge, then a blow a shield stopped is answered by an electrified strike.
  await page.evaluate(() => window.__stage([['shield', 1.6]]));
  await equip(page, 'shock');
  await fire(page);
  await until(page, 'shockReady');
  await page.evaluate(() => { const G = window.__game; const t = G.combat.enemies[0]; G.events.emit('impact', { move: 'punch', outcome: 'blocked', target: t, pos: t.pos.clone().setY(t.pos.y + 1.3), power: 1, strike: 'jab', material: 'shield', dir: { x: 0, z: 1 } }); });
  await until(page, 'shockStrike');
  expect(await page.evaluate(() => window.__game.combat.enemies[0].stunned)).toBe(true);
  expect(errors).toEqual([]);
});
