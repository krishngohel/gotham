import { test, expect } from '@playwright/test';

// Time of day, weather and civilians (Long Night 2, workstream M) end to end: skipping from night
// to day changes the lighting and the crowd; every weather state runs on Potato and Ultra without
// errors and with the tier's switches respected; pedestrians cross on the walk signal and flee a
// fight; with two players both surroundings are populated.
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 20;
async function boot(page, query) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/?${query}`);
  await page.waitForFunction(ready, null, { timeout: 90000 });
  // Clear the opening comic and any cutscene until play has run undisturbed for a moment.
  for (let i = 0, clear = 0; i < 300 && clear < 8; i++) {
    const busy = await page.evaluate(() => { const G = window.__game; G.cinematic?.active && G.cinematic.skip(); G.comic?.playing && G.comic.skip(); G.radio?.playing && G.radio.skip?.(); return !!(G.comic?.playing || G.cinematic?.active || G.flow?.mode !== 'play'); });
    clear = busy ? 0 : clear + 1;
    await page.waitForTimeout(200);
  }
  return errors;
}
// The hero held on a busy core street (the neon street) while the city runs.
const hold = (page, pos = { x: 150, y: 0, z: 10 }) => page.evaluate((p) => {
  const G = window.__game;
  cancelAnimationFrame(window.__hold ?? 0);
  const f = () => { G.hero.teleport(p, 0); window.__hold = requestAnimationFrame(f); };
  f();
}, pos);

test('time skip from night to day changes the lighting and the crowd', async ({ page }) => {
  const errors = await boot(page, 'at=start&god=1&new=1&time=3&weather=clear');
  await hold(page);
  await page.waitForTimeout(3000);
  const night = await page.evaluate(() => { const G = window.__game; return { h: G.world.clock.hour, hemi: (() => { const L = G.world.env.look, lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), c = L.hemiSky; const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); return L.hemiI * lum(c) + L.keyI * lum(L.key); })(), day: G.world.sky.uniforms.uDay.value, signal: G.world.signal.group.visible, crowd: G.civilians.sim.active, fog: G.scene.fog.color.getHex() }; });
  expect(night.h).toBeGreaterThan(2.9);
  expect(night.day).toBe(0);
  expect(night.signal).toBe(true);
  await page.evaluate(() => window.__game.world.clock.skipTo(12.5));
  await page.waitForTimeout(5000);
  const day = await page.evaluate(() => { const G = window.__game; return { h: G.world.clock.hour, hemi: (() => { const L = G.world.env.look, lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4), c = L.hemiSky; const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); return L.hemiI * lum(c) + L.keyI * lum(L.key); })(), day: G.world.sky.uniforms.uDay.value, signal: G.world.signal.group.visible, crowd: G.civilians.sim.active, fog: G.scene.fog.color.getHex() }; });
  expect(day.h).toBeGreaterThan(12.4);
  // The light a lit surface receives (fill + key, each intensity x its colour's luminance): the
  // readability floor lifts the night's fill against a dark navy sky colour, so the fill's intensity
  // number alone no longer orders night and day; the sun does.
  expect(day.hemi).toBeGreaterThan(night.hemi * 1.5);
  expect(day.day).toBe(1);
  expect(day.signal).toBe(false);
  expect(day.fog).not.toBe(night.fog);
  // 3 a.m. is nearly empty; noon is busy.
  expect(day.crowd).toBeGreaterThan(night.crowd * 2);
  expect(errors).toEqual([]);
});

for (const q of ['potato', 'ultra']) {
  test(`weather transitions run on ${q} and respect the tier`, async ({ page }) => {
    const errors = await boot(page, `at=start&god=1&new=1&q=${q}&time=22`);
    await hold(page);
    for (const s of ['clear', 'overcast', 'drizzle', 'rain', 'storm', 'fog', 'snow', 'clear']) {
      await page.evaluate((st) => { const w = window.__game.world.weather; w.unpin(); w.pin(st, { id: 'e2e' }); }, s);
      await page.waitForTimeout(700);
    }
    await page.evaluate(() => { const w = window.__game.world.weather; w.unpin(); w.pin('storm', { id: 'e2e', snap: true }); w.strikeNow(); });
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => { const G = window.__game; return { state: G.world.weather.state, splashes: G.world.rain.splashes, wet: G.world.weather.wetness, fx: G.ink.envEffects, fps: G.state.fps }; });
    expect(r.state).toBe('storm');
    if (q === 'potato') { expect(r.splashes).toBe(false); expect(r.fx).toEqual([]); } else { expect(r.fx).toEqual(['INK_AO', 'INK_CONTACT', 'INK_SSR']); }
    expect(errors).toEqual([]);
  });
}

test('pedestrians cross on the walk signal and flee a fight', async ({ page }) => {
  const errors = await boot(page, 'at=start&god=1&new=1&time=13&weather=clear');
  await hold(page);
  // Watch every crossing that starts for 25 s: it starts on the parallel green (or no signal).
  const watch = await page.evaluate(async () => {
    const G = window.__game, sim = G.civilians.sim, traffic = G.world.traffic.sim, net = traffic.net;
    const was = new Map();
    let started = 0, bad = 0;
    const t0 = performance.now();
    await new Promise((res) => {
      const tick = () => {
        for (const a of sim.agents) {
          if (!a.active) continue;
          if (a.mode === 'cross' && a.crossing && was.get(a.i) === 'wait') {
            started++;
            const j = net.junctionOf[a.node];
            if (j >= 0 && net.junctions[j].signal && traffic.signalState(net.junctions[j], a.axis, G.state.t) === 2 && a.t < 0.1) bad++;
          }
          was.set(a.i, a.mode);
        }
        if (performance.now() - t0 < 25000) requestAnimationFrame(tick); else res();
      };
      tick();
    });
    return { started, bad };
  });
  expect(watch.started).toBeGreaterThan(0);
  expect(watch.bad).toBe(0);
  // A fight breaks out next to a pedestrian: people around run or cower; nobody is hurt.
  const fled = await page.evaluate(async () => {
    const G = window.__game, sim = G.civilians.sim;
    const a = sim.agents.filter((q) => q.active && q.mode !== 'respond').sort((p, q) => Math.hypot(p.x - 150, p.z - 10) - Math.hypot(q.x - 150, q.z - 10))[0];
    G.events.emit('impact', { pos: { x: a.x + 2, y: a.y + 1, z: a.z }, outcome: 'hit', move: 'punch' });
    await new Promise((r) => setTimeout(r, 300));
    return sim.agents.filter((q) => q.active && (q.reaction === 'flee' || q.reaction === 'cower' || q.reaction === 'callPolice' || q.reaction === 'stare')).length;
  });
  expect(fled).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('two players far apart: both surroundings are populated', async ({ page }) => {
  const errors = await boot(page, 'at=start&god=1&new=1&p2=bot&time=12&weather=overcast');
  await page.waitForFunction(() => window.__game.players?.length === 2, null, { timeout: 60000 });
  await page.evaluate(() => {
    const G = window.__game, [a, b] = G.players;
    const f = () => { a.hero.teleport({ x: 150, y: 0, z: 10 }, 0); b.hero.teleport({ x: -30, y: 0, z: -470 }, 0); window.__hold2 = requestAnimationFrame(f); };
    f();
  });
  await page.waitForTimeout(6000);
  const near = await page.evaluate(() => {
    const G = window.__game, ag = G.civilians.sim.agents.filter((q) => q.active);
    const n = (x, z) => ag.filter((q) => Math.hypot(q.x - x, q.z - z) < 90).length;
    return { a: n(150, 10), b: n(-30, -470), views: G.split?.views?.length ?? 1 };
  });
  expect(near.a).toBeGreaterThan(8);
  expect(near.b).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});
