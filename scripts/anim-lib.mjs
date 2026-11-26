// Shared harness for the animation scripts (anim-audit, anim-film2, combat-tune): opens the game in
// a headless browser on a VIRTUAL CLOCK, so a run is the same frame for frame every time.
//
// - Every requestAnimationFrame tick advances game time by exactly 1/60 s (performance.now is the
//   virtual clock), however fast the GPU really draws; the game only steps while the script gives
//   it a frame budget (step(n)), so evaluations, input and setup land between two known frames.
// - Input goes in as DOM events dispatched on window between frames (no playwright timing): a
//   key held for 20 frames is held for exactly 20 frames.
// - Math.random and the game's own rng (combat.rng) are reseeded by seed(n) at the start of a
//   scenario, after the asset packs have landed (they load on real time).
// - Hooks run after every virtual frame (window.__v.after: [fn]) for samplers.
import { chromium } from 'playwright-core';
import { setPriority, constants as osConst } from 'node:os';

export const FPS = 60;
const ARGS = ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'];

// In the page, before any game code.
function virtualClock() {
  const realRaf = window.requestAnimationFrame.bind(window);
  const V = window.__v = { frame: 0, now: 1000, dt: 1000 / 60, budget: Infinity, cbs: [], after: [], done: null, seedState: 1 };
  // A seeded Math.random (mulberry32), reseeded by __v.seed(n).
  const rnd = () => { let t = (V.seedState = (V.seedState + 0x6d2b79f5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = rnd;
  // Reseeded from (seed, frame) at the start of every frame: a promise or an audio callback that
  // draws a random number between frames (they run on real time) cannot shift the game's draws.
  V.baseSeed = 1;
  V.seed = (s) => { V.baseSeed = s >>> 0; V.seedState = s >>> 0; };
  performance.now = () => V.now;
  // Audio stays suspended: the audio system runs on the AudioContext's own (real) clock while it
  // plays, and what it draws from Math.random mid-frame would shift the game's draws.
  const AC = window.AudioContext ?? window.webkitAudioContext;
  if (AC) {
    const Quiet = class extends AC { constructor(...a) { super(...a); try { super.suspend(); } catch { /* fine */ } } resume() { return Promise.resolve(); } get state() { return 'suspended'; } };
    window.AudioContext = Quiet; window.webkitAudioContext = Quiet;
  }
  window.requestAnimationFrame = (cb) => { V.cbs.push(cb); return V.cbs.length; };
  window.cancelAnimationFrame = () => {};
  // Timers with a delay run on the virtual clock too (the audio scheduler's interval, delayed
  // events): otherwise they fire at real moments and anything they draw from Math.random shifts
  // the game's sequence. Zero-delay ones (yields inside loaders) stay real.
  const realST = window.setTimeout.bind(window), realCT = window.clearTimeout.bind(window);
  const realSI = window.setInterval.bind(window), realCI = window.clearInterval.bind(window);
  const timers = new Map();
  let tid = 1e7;
  window.setTimeout = (fn, ms = 0, ...a) => { if (!(ms > 0) || typeof fn !== 'function') return realST(fn, ms, ...a); const id = tid++; timers.set(id, { due: V.now + ms, fn, a, every: 0 }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { if (!(ms > 0) || typeof fn !== 'function') return realSI(fn, ms, ...a); const id = tid++; timers.set(id, { due: V.now + ms, fn, a, every: ms }); return id; };
  window.clearTimeout = (id) => { if (!timers.delete(id)) realCT(id); };
  window.clearInterval = (id) => { if (!timers.delete(id)) realCI(id); };
  const runTimers = () => {
    for (let guard = 0; guard < 1000; guard++) {
      let best = null, bid = 0;
      for (const [id, t] of timers) if (t.due <= V.now && (!best || t.due < best.due || (t.due === best.due && id < bid))) { best = t; bid = id; }
      if (!best) return;
      if (best.every) best.due += best.every; else timers.delete(bid);
      try { best.fn(...best.a); } catch (e) { console.error(e); }
    }
  };
  const pump = () => {
    realRaf(pump);
    // Free-running (budget Infinity, during loads): time moves even before the game has asked
    // for a frame, so a loader's timer can fire. Stepping: only real game frames count.
    if (V.budget <= 0 || (!V.cbs.length && V.budget !== Infinity)) return;
    V.budget--;
    V.now += V.dt;
    V.frame++;
    V.seedState = (V.baseSeed ^ Math.imul(V.frame, 2654435761)) >>> 0;
    const list = V.cbs; V.cbs = [];
    for (const cb of list) { try { cb(V.now); } catch (e) { console.error(e); } }
    runTimers();
    for (const fn of V.after) { try { fn(); } catch (e) { V.err = String(e); } }
    if (V.budget <= 0 && V.done) { const d = V.done; V.done = null; d(); }
  };
  realRaf(pump);
}

// Opens a page on the game. q: the query string ('?at=f1&god=1'). Returns the harness.
export async function openGame(url, q, { headless = true, init = [] } = {}) {
  if (process.env.LOWPRI !== '0') { try { setPriority(osConst.priority.PRIORITY_BELOW_NORMAL); } catch { /* fine */ } } // [balance] children inherit it
  const browser = await chromium.launch({ args: ARGS, headless });
  // [balance] A shared machine: this script and its browser run below normal priority (LOW=1).
  if (process.env.LOWPRI !== '0') { try { setPriority(osConst.priority.PRIORITY_BELOW_NORMAL); const pid = browser.process?.()?.pid; if (pid) setPriority(pid, osConst.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed: fine */ } }
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.addInitScript(virtualClock);
  for (const [fn, arg] of init) await page.addInitScript(fn, arg);
  const h = {
    browser, page, errors,
    async goto(query) {
      await page.evaluate(() => { if (window.__v) window.__v.budget = Infinity; }).catch(() => {});
      await page.goto(url + query, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30, null, { timeout: 120000 });
    },
    // Runs exactly n game frames, then freezes the game.
    step: (n) => page.evaluate((n) => new Promise((res) => { const V = window.__v; if (n <= 0) { V.budget = 0; res(); return; } V.done = res; V.budget = n; }), Math.round(n)),
    seconds: (s) => h.step(Math.round(s * FPS)),
    freeze: () => page.evaluate(() => { window.__v.budget = 0; }),
    run: () => page.evaluate(() => { window.__v.budget = Infinity; }),
    frame: () => page.evaluate(() => window.__v.frame),
    // Input between frames: key(code, down), click(button) = a press held for one frame.
    key: (code, down = true) => page.evaluate(([code, down]) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true })), [code, down]),
    mouse: (button, down = true) => page.evaluate(([button, down]) => window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button, bubbles: true })), [button, down]),
    async tap(code, frames = 2) {
      if (code.startsWith('Mouse')) { const b = Number(code.slice(5)); await h.mouse(b, true); await h.step(frames); await h.mouse(b, false); return; }
      await h.key(code, true); await h.step(frames); await h.key(code, false);
    },
    async hold(codes, frames) { for (const c of codes) await h.key(c, true); await h.step(frames); for (const c of codes) await h.key(c, false); },
    // Waits (real time, game running) for the lazy packs: combat2 + enemies.
    async packs(timeout = 60000) {
      await h.run();
      await page.evaluate(() => { const G = window.__game, h = G.hero.pos; if (!G.hero.bat.animator.has('Knife_Slash')) { const e = G.spawn('knife', { x: h.x, y: h.y - 200, z: h.z }); window.__packProbe = e; } });
      await page.waitForFunction(() => { const a = window.__game.hero.bat.animator; return a.has('React_Light_Front') && a.has('Travel_FlyKick') && a.has('Knife_Slash'); }, null, { timeout });
      await page.evaluate(() => { const e = window.__packProbe; if (e) { window.__game.despawn(e); window.__packProbe = null; } });
      await h.freeze();
    },
    // Reseeds Math.random and the game's combat rng (enemies share it).
    seed: (s) => page.evaluate((s) => {
      window.__v.seed(s * 7919 + 1);
      const r = window.__game.combat?.rng;
      if (!r) return false;
      let a = s >>> 0;
      const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      Object.assign(r, { next, range: (min, max) => min + (max - min) * next(), int: (min, max) => Math.floor(min + (max - min + 1) * next()), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p });
      return true;
    }, s),
    // Skips whatever comic, cinematic or radio is playing, and hides nothing else.
    // Skips comics, cinematics and radio until the game is in plain play (or gives up).
    // settle: look this many times (10 frames apart) even when nothing is playing yet (a comic
    // that starts a moment after load).
    async skipStaged(maxTries = 40, settle = 0) {
      for (let i = 0; i < maxTries; i++) {
        const busy = await page.evaluate(() => { const G = window.__game; G.cinematic?.active && G.cinematic.skip?.(); G.comic?.playing && G.comic.skip?.(); G.radio?.playing && G.radio.skip?.(); return !!(G.comic?.playing || G.cinematic?.active || (G.flow && G.flow.mode !== 'play')); });
        if (!busy && i >= settle) return true;
        await h.step(10);
      }
      return false;
    },
    close: () => browser.close(),
  };
  return h;
}

// A squad on a flat, known spot, every goon placed facing the hero (the seeded fight's setup).
// Returns the ids. Runs in the page.
export function placeSquad(page, site, squad, { heroYaw = 0 } = {}) {
  return page.evaluate(([site, squad, heroYaw]) => {
    const G = window.__game;
    for (const e of [...G.combat.enemies]) G.despawn(e);
    G.combat.setEnemies([]);
    G.teleport(site);
    const h = G.hero;
    h.control = null; h.vel.set(0, 0, 0); h.bat.face(heroYaw); G.follow.snapBehind?.(heroYaw, 0.2);
    const list = squad.map(([type, dx, dz]) => G.spawn(type, { x: h.pos.x + dx, y: h.pos.y, z: h.pos.z + dz }));
    for (const e of list) e.place(e.pos, Math.atan2(h.pos.x - e.pos.x, h.pos.z - e.pos.z));
    G.combat.setEnemies(list);
    for (const e of list) e.wake();
    return list.map((e) => e.id + ':' + e.type);
  }, [site, squad, heroYaw]);
}

// The deterministic "competent player" fight driver used by the audit's seeded scenario and the
// difficulty tuner. Decides in the page between frames: counter a wind-up aimed at him (right
// mouse), dodge a red tell (C), cape-stun a brute or heavy, otherwise punch with every fifth
// press a kick. `style`: 'competent' | 'masher' (punch every press, never reads a tell).
export async function fightStep(h, style = 'competent', i = 0) {
  const act = await h.page.evaluate(([style, i]) => {
    const G = window.__game, hero = G.hero;
    const live = G.enemies.filter((e) => e.alive && e.aware);
    if (!live.length) return 'none';
    if (style === 'masher') return i % 4 === 3 ? 'KeyE' : 'Mouse0';
    const near = (e, r) => Math.hypot(e.pos.x - hero.pos.x, e.pos.z - hero.pos.z) < r;
    // Only tells aimed at me and close to landing (a real player waits for the glyph).
    const due = live.filter((e) => (e.state === 'windup' || e.state === 'attack') && near(e, 8));
    // A human's reaction time: the tell has to have been up a moment before he answers it.
    let blue = due.find((e) => e.def?.counterable && (e.glyph === 'blue' || e.tell === 'blue') && (e.state === 'attack' || e.t > 0.18));
    // ...and is not perfect: about one tell in seven he misses altogether (decided once per wind-up,
    // a seeded draw between frames that the next frame's reseed keeps out of the game's sequence).
    if (blue && window.__botSlip) {
      if (blue.__slipN !== blue.windupN) { blue.__slipN = blue.windupN; blue.__slipped = Math.random() < window.__botSlip; }
      if (blue.__slipped) blue = null;
    }
    if (blue) return 'Mouse2';
    const red = due.find((e) => e.state === 'windup' && (e.tell === 'red' || e.glyph === 'red') && !e.def?.ranged && e.t > e.windupDur * 0.45);
    if (red) return 'KeyC';
    const stunMe = live.find((e) => (e.type === 'brute' || e.type === 'heavy' || e.type === 'baton' || e.def?.frontBlock) && !e.stunned && !e.down && near(e, 3));
    if (stunMe && i % 3 === 0) return 'KeyQ';
    return i % 5 === 4 ? 'KeyE' : 'Mouse0';
  }, [style, i]);
  return act;
}
