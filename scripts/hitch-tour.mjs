// [perf2] Hitch tour: carries the hero along a fixed route across district boundaries for about a
// minute (street-level "drive" legs at 18 m/s and rooftop "glide" legs at 28 m/s, 22 m up), the
// follow camera behind, and lists every frame over 25 ms with where it happened and what the frame
// was doing (draw calls, programs compiled so far, textures, geometries), so streaming and LOD
// pops, lazy builds, shader compiles and texture uploads at boundaries show up by place.
//
// Usage: BASE=http://localhost:5820/ Q=high node scripts/hitch-tour.mjs
// Env: CPU=4 (CDP CPU throttle), WEAK=swiftshader, VSYNC=1, OUT=<json>, ROUNDS=n (repeat the tour
// on the same page: the second pass shows what is left once everything has been seen once).
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const base = process.env.BASE ?? 'http://localhost:5820/';
const q = process.env.Q ?? 'high';
const rounds = +(process.env.ROUNDS ?? 1);
// [x, z, mode] waypoints: core -> Loop (under the El) -> the Narrows -> river walk -> core -> docks.
export const ROUTE = [
  [0, 30, 'drive'], [0, -120, 'drive'], [10, -230, 'drive'], [60, -359, 'drive'], [-150, -330, 'drive'],
  [-250, -330, 'glide'], [-370, -330, 'glide'], [-370, -500, 'glide'], [-300, -560, 'glide'], [-150, -480, 'glide'],
  [0, -420, 'glide'], [120, -300, 'glide'], [150, -150, 'drive'], [150, 10, 'drive'], [40, 120, 'drive'], [-40, 180, 'drive'],
];
// [perf3] ROUTE=core: only the original city's streets and roofs (the pre-overhaul build has
// nothing past them), for an old-vs-new comparison of the same tour.
const CORE_ROUTE = [
  [0, 30, 'drive'], [0, -120, 'drive'], [-60, -150, 'drive'], [-150, -100, 'glide'], [-170, 60, 'glide'], [-60, 175, 'glide'],
  [60, 120, 'drive'], [150, 10, 'drive'], [150, -150, 'drive'], [40, -200, 'glide'], [0, 30, 'glide'],
];
const route = process.env.ROUTE === 'core' ? CORE_ROUTE : ROUTE;
const SPEED = { drive: 18, glide: 28 };

const weak = process.env.WEAK === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist'];
const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', ...weak, ...(process.env.VSYNC ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'])] });
const page = await browser.newPage({ viewport: { width: +(process.env.W ?? 1600), height: +(process.env.H ?? 900) } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
if (process.env.CPU) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
await page.goto(`${base}?at=toDocks&god=1&q=${q}&dynres=0${process.env.EXTRA ?? ''}`);
await page.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 240000 });
await page.waitForTimeout(3000);
const out = [];
for (let r = 0; r < rounds; r++) {
  const res = await page.evaluate(([route, speed]) => new Promise((resolve) => {
    const g = window.__game;
    // Leg lengths and the total route length.
    const legs = [];
    for (let i = 0; i < route.length - 1; i++) { const [x0, z0] = route[i], [x1, z1, m] = route[i + 1]; legs.push({ x0, z0, x1, z1, mode: m, len: Math.hypot(x1 - x0, z1 - z0) }); }
    let leg = 0, s = 0, last = performance.now();
    const frames = [], hitches = [];
    const t0 = last;
    // [perf3] Long tasks (> 50 ms main-thread tasks, idle callbacks and timers included) and frames
    // whose own JS took over 25 ms: the hitches the game causes, as against a frame the machine was
    // late with (on this laptop most > 25 ms frames under load are the latter).
    const longTasks = [];
    let lto = null;
    try { lto = new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push(+e.duration.toFixed(1)); }); lto.observe({ type: 'longtask', buffered: false }); } catch { /* unsupported */ }
    let jsHitches = 0, jsMax = 0;
    const tick = (now) => {
      const dt = now - last; last = now;
      const L = legs[leg];
      s += speed[L.mode] * Math.min(dt, 50) / 1000;
      while (leg < legs.length && s > legs[leg].len) { s -= legs[leg].len; leg++; }
      if (leg >= legs.length) {
        const sorted = frames.map((f) => f.dt).sort((a, b) => a - b);
        lto?.disconnect();
        resolve({ longTasks, jsHitches, jsMax: +jsMax.toFixed(1), seconds: +((now - t0) / 1000).toFixed(1), frames: frames.length, medMs: +sorted[sorted.length >> 1].toFixed(2), p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2), maxMs: +sorted[sorted.length - 1].toFixed(1), hitches });
        return;
      }
      const C = legs[leg], k = s / C.len;
      const x = C.x0 + (C.x1 - C.x0) * k, z = C.z0 + (C.z1 - C.z0) * k;
      const ground = g.world.collision.groundBelow(x, 200, z, 0.3);
      const y = (ground > -Infinity ? ground : 0) + (C.mode === 'glide' ? 22 : 0.1);
      const yaw = Math.atan2(C.x1 - C.x0, C.z1 - C.z0) + Math.PI;
      g.hero.teleport({ x, y, z }, yaw);
      g.follow.snapBehind(yaw, C.mode === 'glide' ? 0.3 : 0.12);
      if (frames.length > 10) {
        frames.push({ dt });
        const js = g.state.stepMs ?? 0;
        if (js > 25) jsHitches++;
        if (js > jsMax) jsMax = js;
        if (dt > 25) {
          const info = g.renderer.info;
          hitches.push({ ms: +dt.toFixed(1), x: Math.round(x), z: Math.round(z), mode: C.mode, district: g.world.districtAt?.(x, z) ?? null, js: +(g.state.stepMs ?? 0).toFixed(1), programs: info.programs?.length ?? 0, textures: info.memory.textures, geometries: info.memory.geometries });
        }
      } else frames.push({ dt: 0 });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), [route, SPEED]);
  console.log(`round ${r + 1}: ${res.seconds}s ${res.frames} frames, median ${res.medMs} ms, p95 ${res.p95Ms} ms, max ${res.maxMs} ms, ${res.hitches.length} frames > 25 ms; frames with JS > 25 ms: ${res.jsHitches} (max JS ${res.jsMax} ms); long tasks: ${res.longTasks.length} [${res.longTasks.slice(0, 12).join(', ')}]`);
  for (const h of res.hitches) console.log(`   ${String(h.ms).padStart(6)} ms  ${h.mode.padEnd(5)} ${String(h.district).padEnd(12)} (${h.x}, ${h.z})  js ${h.js}  programs ${h.programs}  tex ${h.textures}  geo ${h.geometries}`);
  out.push(res);
}
console.log('errors', errors.length, errors.slice(0, 3));
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ q, base, rounds: out, errors }, null, 1));
await browser.close();
