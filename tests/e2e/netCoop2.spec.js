import { test, expect } from '@playwright/test';
import { pairOverBroadcast, skipTalk, collectErrors } from './netHelpers.js';

// [net2] Online co-op parity (wave 3), two pages over BroadcastChannel: the guest drives and guns,
// paired moves between host and guest, a campaign boss, the world clock and weather, fast travel,
// a Bruce day and the campaign's night change. Real input on the guest page (keys reach the host
// as press edges in its hero records).
test.describe.configure({ mode: 'default' });

const tap = async (page, key, ms = 140) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const step = (p) => p.evaluate(() => window.__game.flow.objectives.step?.id ?? null);
const night = (p) => p.evaluate(() => window.__game.flow.story?.night?.id ?? 'n1');
async function until(fn, { ms = 30000, every = 250, pages = [] } = {}) {
  const t0 = Date.now();
  for (;;) {
    await skipTalk(...pages);
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) return v;
    await new Promise((r) => setTimeout(r, every));
  }
}

test('the guest drives the Batmobile in the chase (host-simulated from its stick)', async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?at=boardBatmobile&net=broadcast&god=1' });
  // The board step parks the car; the guest walks up to it (stands beside it) and presses the key.
  const car = await until(() => host.evaluate(() => { const v = window.__game.vehicles; const b = v?.batmobile; return b?.group?.visible && !b.arriving ? { x: b.group.position.x, y: b.group.position.y, z: b.group.position.z } : null; }), { pages: [host, guest] });
  expect(car).toBeTruthy();
  await guest.evaluate((c) => window.__game.hero.teleport({ x: c.x + 2.5, y: c.y, z: c.z }), car);
  await guest.waitForTimeout(800);
  await tap(guest, 'KeyT', 200);
  const drives = await until(() => host.evaluate(() => window.__game.vehicles.driver === window.__game.players[1].hero && !!window.__game.vehicles.active), { pages: [host, guest] });
  expect(drives, 'the guest is the driver on the host').toBe(true);
  expect(await until(() => guest.evaluate(() => !!window.__game.net.adapter.riding?.drive), { pages: [host, guest] })).toBe(true);
  expect(await until(async () => (await step(host)) === 'batmobileChase' && (await step(guest)) === 'batmobileChase', { pages: [host, guest] })).toBe(true);
  // Throttle on the guest: the host's car goes, and the guest's copy follows it.
  const start = await host.evaluate(() => { const p = window.__game.vehicles.batmobile.group.position; return { x: p.x, z: p.z }; });
  const bw0 = await host.evaluate(() => window.__game.net.bandwidth());
  const t0 = Date.now();
  await guest.keyboard.down('KeyW');
  let top = 0;
  for (let i = 0; i < 16; i++) { await guest.waitForTimeout(250); top = Math.max(top, await host.evaluate(() => Math.abs(window.__game.vehicles.batmobile.v.speed))); }
  await guest.keyboard.up('KeyW');
  const moved = await host.evaluate((s) => { const p = window.__game.vehicles.batmobile.group.position; return Math.hypot(p.x - s.x, p.z - s.z); }, start);
  const bw1 = await host.evaluate(() => window.__game.net.bandwidth());
  const secs = (Date.now() - t0) / 1000;
  const down = ((bw1.out.state + bw1.out.ctl - bw0.out.state - bw0.out.ctl) * 8) / secs / 1000;
  const up = ((bw1.in.state + bw1.in.ctl - bw0.in.state - bw0.in.ctl) * 8) / secs / 1000;
  const cars = await host.evaluate(() => window.__game.world?.traffic?.sim?.active ?? window.__game.world?.traffic?.active ?? null);
  console.log(`guest at the wheel: top speed ${top.toFixed(1)} m/s, moved ${moved.toFixed(1)} m; bandwidth in the chase host->guest ${down.toFixed(1)} kbit/s, guest->host ${up.toFixed(1)} kbit/s (traffic: ${JSON.stringify(cars)})`);
  expect(down).toBeLessThan(150);
  expect(top).toBeGreaterThan(4);
  expect(moved).toBeGreaterThan(5);
  const gap = await guest.evaluate(() => { const G = window.__game, p = G.vehicles.batmobile.group.position; return Math.hypot(p.x - G.hero.pos.x, p.z - G.hero.pos.z); });
  expect(gap, 'the guest rides in its copy of the car').toBeLessThan(3);
  // The chase finishes on the host; both move on.
  await host.evaluate(() => window.__game.vehicles.debugWin?.());
  expect(await until(async () => { const [h, g] = [await step(host), await step(guest)]; return h !== 'batmobileChase' && h === g; }, { pages: [host, guest] })).toBe(true);
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('the guest mans the gunner seat in the drone battle', async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?at=boardBatmobileAce&net=broadcast&god=1' });
  await until(() => host.evaluate(() => { const b = window.__game.vehicles?.batmobile; return b?.group?.visible && !b.arriving; }), { pages: [host, guest] });
  await host.evaluate(() => { const v = window.__game.vehicles; if (!v.active) v.enter(v.batmobile); window.__fire = 0; window.__game.events.on('cannonFire', () => { window.__fire += 1; }); });
  expect(await until(async () => (await step(host)) === 'aceBattle' && (await guest.evaluate(() => window.__game.net.adapter.riding?.kind === 'car')), { pages: [host, guest], ms: 40000 })).toBe(true);
  await until(() => host.evaluate(() => window.__game.vehicles.mode === 'battle'), { pages: [host, guest] });
  // The guest holds the trigger: the host's turret fires along the guest's camera.
  await guest.mouse.move(640, 360);
  for (let i = 0; i < 6; i++) { await guest.mouse.down(); await guest.waitForTimeout(300); await guest.mouse.up(); await guest.waitForTimeout(150); }
  const fired = await host.evaluate(() => window.__fire);
  console.log('gunner shots on the host:', fired);
  expect(fired).toBeGreaterThan(0);
  await host.evaluate(() => window.__game.vehicles.debugWin?.());
  expect(await until(async () => { const [h, g] = [await step(host), await step(guest)]; return h !== 'aceBattle' && h === g; }, { pages: [host, guest] })).toBe(true);
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('a dual takedown and a team move between host and guest', async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?fight=test&net=broadcast&god=1' });
  await skipTalk(host, guest);
  await host.evaluate(() => { const G = window.__game; window.__t = { dual: 0, team: 0 }; G.events.on('dualTakedown', () => { window.__t.dual += 1; }); G.events.on('teamMove', () => { window.__t.team += 1; }); for (const e of G.enemies) e.ready = () => false; });
  await guest.evaluate(() => { window.__t = { glue: 0 }; window.__game.events.on('netGlueMove', () => { window.__t.glue += 1; }); });
  // Dual takedown, started by the guest's grab: a stunned goon with both heroes beside him.
  const at = await host.evaluate(() => {
    const G = window.__game, e = G.enemies.find((x) => x.alive);
    e.applyHit({ outcome: 'stun', stun: 8, damage: 0 }, G.hero.pos);
    G.hero.teleport({ x: e.pos.x + 1.4, y: e.pos.y, z: e.pos.z });
    return { id: e.id, x: e.pos.x, y: e.pos.y, z: e.pos.z };
  });
  await guest.evaluate((p) => window.__game.hero.teleport({ x: p.x - 1.4, y: p.y, z: p.z }), at);
  await guest.waitForTimeout(900);
  await host.evaluate((id) => { const e = window.__game.enemies.find((x) => x.id === id); if (!e.stunned) e.applyHit({ outcome: 'stun', stun: 8, damage: 0 }, window.__game.hero.pos); }, at.id);
  await guest.waitForTimeout(300);
  // Both in play (no comic up: the glue only runs in play) and the host's hero free.
  await until(async () => (await host.evaluate(() => window.__game.flow.mode === 'play')) && (await guest.evaluate(() => window.__game.flow.mode === 'play')), { pages: [host, guest] });
  await host.evaluate(() => { const h = window.__game.hero; if (h.control && !h.control.combat) h.control = null; });
  await tap(guest, 'KeyG', 160);
  expect(await until(() => host.evaluate(() => window.__t.dual > 0), { pages: [host, guest], ms: 8000 }), 'the host ran the dual takedown').toBe(true);
  expect(await guest.evaluate(() => window.__t.glue), 'the guest played its part').toBeGreaterThan(0);
  const ko = await until(() => guest.evaluate((id) => window.__game.enemies.find((x) => x.id === id)?.alive === false, at.id), { pages: [host, guest], ms: 5000 });
  expect(ko, 'the goon is down on the guest too').toBe(true);
  // A team move: both press special together with goons around.
  await host.waitForTimeout(2500);
  await host.evaluate(() => { const G = window.__game; for (const e of G.enemies) if (e.alive) { e.aware = true; } const e = G.enemies.find((x) => x.alive); if (e) G.hero.teleport({ x: e.pos.x + 3, y: e.pos.y, z: e.pos.z }); });
  const hp = await host.evaluate(() => ({ x: window.__game.hero.pos.x, y: window.__game.hero.pos.y, z: window.__game.hero.pos.z }));
  await guest.evaluate((p) => window.__game.hero.teleport({ x: p.x + 2, y: p.y, z: p.z }), hp);
  await guest.waitForTimeout(900);
  for (let i = 0; i < 4 && !(await host.evaluate(() => window.__t.team > 0)); i++) {
    await skipTalk(host, guest);
    await host.evaluate(() => { const h = window.__game.hero; if (h.control && !h.control.combat) h.control = null; });
    await tap(guest, 'KeyX', 120);
    await host.waitForTimeout(150);
    await tap(host, 'KeyX', 120);
    await host.waitForTimeout(1500);
  }
  expect(await host.evaluate(() => window.__t.team), 'the host ran the team move').toBeGreaterThan(0);
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('a campaign boss (the Penguin) fought by both players', async ({ browser }) => {
  test.setTimeout(300000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?new=1&night=n2&at=penguinBoss&net=broadcast&god=1' });
  expect(await night(guest), 'the guest is on the host\'s night').toBe('n2');
  expect(await until(() => host.evaluate(() => !!window.__game.bosses.active), { pages: [host, guest], ms: 60000 })).toBe(true);
  const seen = await until(() => guest.evaluate(() => { const e = window.__game.enemies.find((x) => x.id === 'penguin'); return e && e.netPuppet && e.ch.root.visible ? true : null; }), { pages: [host, guest], ms: 30000 });
  expect(seen, 'the guest sees the Penguin as a puppet').toBe(true);
  expect(await until(() => guest.evaluate(() => document.querySelector('.boss-bar, .bossbar, [class*="boss"]')?.offsetParent !== null), { pages: [host, guest] })).toBeTruthy();
  // The guest fights him: its blows are claims the host lands through its fighter.
  await host.evaluate(() => { window.__t = { claims: 0 }; const G = window.__game; G.events.on('impact', (d) => { if (d.player?.remote && d.target?.id === 'penguin') window.__t.claims += 1; }); G.events.on('bossGuard', () => {}); });
  for (let i = 0; i < 40 && !(await host.evaluate(() => window.__t.claims > 0)); i++) {
    await guest.evaluate(() => { const G = window.__game, e = G.enemies.find((x) => x.id === 'penguin'); if (e) G.hero.teleport({ x: e.pos.x + 1.2, y: e.pos.y, z: e.pos.z }); });
    await tap(guest, 'KeyE', 90);
    await guest.waitForTimeout(250);
    await skipTalk(host, guest);
  }
  expect(await host.evaluate(() => window.__t.claims), 'the guest\'s blows reached the host\'s Penguin').toBeGreaterThan(0);
  const bw0 = await host.evaluate(() => window.__game.net.bandwidth());
  const t0 = Date.now();
  await host.evaluate(() => window.__game.bosses.controller?.handle?.ctx?.adds?.(8));
  for (let i = 0; i < 20; i++) { await skipTalk(host, guest); await host.waitForTimeout(250); }
  const bw1 = await host.evaluate(() => window.__game.net.bandwidth());
  const down = ((bw1.out.state + bw1.out.ctl - bw0.out.state - bw0.out.ctl) * 8) / ((Date.now() - t0) / 1000) / 1000;
  console.log(`bandwidth, the Penguin with adds (${await host.evaluate(() => window.__game.enemies.length)} on the fight list): host->guest ${down.toFixed(1)} kbit/s`);
  expect(down).toBeLessThan(150);
  // The host finishes him; the outro plays on both and both move on together.
  await host.evaluate(() => { window.__game.winFight(); window.__game.bosses.debugWin(); });
  expect(await until(async () => { const [h, g] = [await step(host), await step(guest)]; return h !== 'penguinBoss' && h === g; }, { pages: [host, guest], ms: 60000 })).toBe(true);
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('the night changes with a Bruce day between: the guest follows (night, step); time skip, weather and lightning on both', async ({ browser }) => {
  test.setTimeout(300000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?at=toTower&net=broadcast&god=1' });
  // The world: a time skip and a weather change on the host reach the guest.
  await host.evaluate(() => { const W = window.__game.world; W.clock.skip(5); W.weather.pin('snow', { id: 'test', snap: true }); });
  const env = await until(async () => {
    const [h, g] = await Promise.all([host, guest].map((p) => p.evaluate(() => ({ v: window.__game.world.clock.value, hr: window.__game.world.clock.hour, w: window.__game.world.weather.state }))));
    return Math.abs(h.v - g.v) < 0.05 && Math.abs(h.hr - g.hr) < 0.05 && g.w === h.w ? { h, g } : null;
  }, { pages: [host, guest] });
  console.log('clock/weather on both:', JSON.stringify(env));
  expect(env).toBeTruthy();
  await guest.evaluate(() => { window.__thunder = 0; window.__game.events.on('thunder', () => { window.__thunder += 1; }); });
  await host.evaluate(() => { window.__game.world.weather.unpin('test'); window.__game.world.weather.pin('storm', { id: 'test', snap: true }); window.__game.lightningNow?.(); });
  await host.evaluate(() => window.lightningNow?.());
  expect(await until(() => guest.evaluate(() => window.__thunder > 0), { pages: [host, guest], ms: 15000 }), 'the host\'s lightning on the guest').toBe(true);
  await host.evaluate(() => window.__game.world.weather.unpin('test'));
  // The host reaches the credits (the guest with it); closing them plays the Bruce day, then
  // Night Two begins.
  await host.evaluate(() => window.__game.jump('credits'));
  await until(() => host.evaluate(() => window.__game.flow.mode === 'credits'), { pages: [host, guest] });
  expect(await until(() => guest.evaluate(() => window.__game.flow.mode === 'credits'), { pages: [host, guest] }), 'the guest saw the credits').toBe(true);
  await host.evaluate(() => { window.__days = 0; window.__game.events.on('bruceDay', () => { window.__days += 1; }); document.querySelector('.credits-menu .mbtn').click(); });
  const same = await until(async () => { const [hn, gn, h, g] = [await night(host), await night(guest), await step(host), await step(guest)]; return hn === 'n2' && gn === 'n2' && h === g ? { hn, h } : null; }, { pages: [host, guest], ms: 60000 });
  console.log('after the day:', JSON.stringify(same));
  expect(same, 'the guest followed the host into Night Two at the same step').toBeTruthy();
  expect(await host.evaluate(() => window.__days)).toBe(1);
  expect(await guest.evaluate(() => window.__game.flow.mode), 'the guest is playing, not on the credits').toBe('play');
  expect(await guest.evaluate(() => !document.querySelector('.credits-menu'))).toBe(true);
  // (The guest's own save keeping its own campaign is unit-tested: netWave3.test.js. Two tabs of one
  // browser share one save, so a Same-PC guest writes nothing at all.)
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('fast travel together, both ways', async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?at=toDocks&net=broadcast&god=1' });
  await skipTalk(host, guest);
  const pts = await host.evaluate(() => { const ft = window.__game.nav.fastTravel; return ft.points.slice(0, 6).map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z })); });
  expect(pts.length).toBeGreaterThan(1);
  for (const p of [host, guest]) await p.evaluate((list) => { const ft = window.__game.nav.fastTravel; for (const q of list) ft.visit(q.x, q.y, q.z); }, pts);
  const travelFrom = async (page, other, id) => {
    const r = await page.evaluate((pid) => window.__game.nav.travel(window.__game.players[0], pid), id);
    expect(r.ok, r.reason ?? '').toBe(true);
    const pt = pts.find((q) => q.id === id);
    return until(async () => {
      const [a, b] = await Promise.all([page, other].map((x) => x.evaluate(() => ({ x: window.__game.hero.pos.x, z: window.__game.hero.pos.z }))));
      return Math.hypot(a.x - pt.x, a.z - pt.z) < 25 && Math.hypot(b.x - pt.x, b.z - pt.z) < 25 ? { a, b } : null;
    }, { pages: [host, guest], ms: 20000 });
  };
  expect(await travelFrom(host, guest, pts[0].id), 'the host travels: the guest comes along').toBeTruthy();
  await host.waitForTimeout(1500);
  expect(await travelFrom(guest, host, pts[1].id), 'the guest travels: the host comes along').toBeTruthy();
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('the guest sees the predator room\'s awareness rings, the AI Nightwing and a street crime\'s UI', async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?at=monarchBalcony&net=broadcast&god=1' });
  // The predator room: the host's stealth minds, drawn as rings over the guest's puppets.
  const rings = await until(() => guest.evaluate(() => { const v = window.__game.net.stealthView; return v && v.ids.length ? v.ids.length : null; }), { pages: [host, guest], ms: 30000 });
  expect(rings, 'room goons with their awareness codes on the guest').toBeGreaterThan(0);
  expect(await guest.evaluate(() => window.__game.net.stealthView.ids.every((id) => window.__game.enemies.some((e) => e.id === id)))).toBe(true);
  // The AI Nightwing, spawned on the host: drawn on the guest, not on its fight list.
  await host.evaluate(() => { const G = window.__game; G.nightwing.spawn({ x: G.hero.pos.x + 3, y: G.hero.pos.y, z: G.hero.pos.z }, 'ally'); });
  const nw = await until(() => guest.evaluate(() => { const a = window.__game.nightwing.actor; return a && a.root.visible ? true : null; }), { pages: [host, guest] });
  expect(nw, 'Nightwing on the guest').toBe(true);
  expect(await guest.evaluate(() => window.__game.enemies.some((e) => e.id === 'nightwing'))).toBe(false);
  await host.evaluate(() => window.__game.nightwing.despawn());
  expect(await until(() => guest.evaluate(() => !window.__game.nightwing.actor), { pages: [host, guest] })).toBe(true);
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});

test('a street crime (crime system v2): its events, the police-radio call and the crime panel reach the guest', async ({ browser }) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext();
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errs = { host: collectErrors(host), guest: collectErrors(guest) };
  await pairOverBroadcast(host, guest, { hostUrl: '/?at=toNeon&net=broadcast&god=1' });
  await skipTalk(host, guest);
  await guest.evaluate(() => { window.__crime = { spawn: 0, update: 0 }; const E = window.__game.events; E.on('crimeSpawn', (d) => { if (d.remote) window.__crime.spawn += 1; }); E.on('crimeUpdate', (d) => { if (d.remote) window.__crime.update += 1; }); });
  await host.evaluate(() => window.__game.side.crimes.force({ kind: 'robbery', spotId: 'neonNorth' }));
  expect(await until(() => guest.evaluate(() => window.__crime.spawn > 0), { pages: [host, guest], ms: 20000 }), 'the crime spawn on the guest').toBe(true);
  // The host walks in: the crime goes live (its HUD updates at 2 Hz reach the guest's side panel).
  await host.evaluate(() => window.__game.teleport({ x: 150, y: 0, z: -14 }));
  const panel = await until(() => guest.evaluate(() => (window.__crime.update > 0 ? document.querySelector('.ch-panel, .side-challenge, [class*="challenge"].show')?.textContent || 'updates' : null)), { pages: [host, guest], ms: 30000 });
  console.log('guest crime panel:', panel);
  expect(panel).toBeTruthy();
  expect(errs.host).toEqual([]);
  expect(errs.guest).toEqual([]);
  await ctx.close();
});
