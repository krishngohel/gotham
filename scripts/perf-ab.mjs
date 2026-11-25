// [perf3] Interleaved, same-moment A/B frame-time comparison of two servers (two builds, or before/
// after a change). On this laptop a single fps reading swings several-fold with machine state
// (thermal/power throttling, other programs), so the only numbers that mean anything are ratios
// taken close together in time. This script:
//   - measures side A and side B in alternation, one page at a time, order flipped every round,
//   - normalises every reading by a fixed JS calibration task timed in the same page and seconds
//     (cancels the CPU's clock-speed swings), then reports per site and tier pair the per-round ratio B/A of the median frame time and of the
//     median JS time (state.stepMs), with the median over rounds and the spread (min..max).
// Ratio < 1 means B is faster. fps columns are medians over rounds, for orientation only.
//
// Usage:
//   node scripts/perf-ab.mjs <urlA> <urlB> [--rounds 5] [--pairs low:low,low:potato,high:high]
//        [--sites "gcpd roof,docks"] [--measure 3000] [--cpu 4] [--weak swiftshader] [--out f.json]
//        [--labels old,new] [--prof] [--fresh]
// --pairs   "tierA:tierB" per comparison. The pre-overhaul build has no potato tier (it falls back
//           to high), so compare its `low` against the new `potato` with low:potato.
// --fresh   the owner's scripts/perf.mjs procedure, paired: a fresh page load per site (?at=<that
//           site's story step>, dynamic resolution left as it is), 1.2 s after the teleport, then
//           measure. Includes the first seconds after a load (lazy builds, uploads), which the
//           default steady-state mode tours away first. Ratios use mean fps (frames / time).
// --prof    adds ?prof=1 (only meaningful on builds that have src/dev/perfProbe.js).
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { SITES } from './perf-matrix-sites.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); if (i < 0) return d; const v = argv[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const urls = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && !['--prof', '--seq', '--fresh'].includes(argv[i - 1])));
if (urls.length < 2) { console.error('usage: node scripts/perf-ab.mjs <urlA> <urlB> [--rounds N] [--pairs a:b,...]'); process.exit(2); }
const [urlA, urlB] = urls;
const labels = String(opt('labels', 'A,B')).split(',');
const rounds = +opt('rounds', 5);
const pairs = String(opt('pairs', 'low:low,low:potato,high:high')).split(',').map((p) => p.split(':'));
const siteNames = opt('sites') ? String(opt('sites')).replace(/_/g, ' ').split(',') : SITES.map((s) => s[0]); // gcpd_roof = 'gcpd roof'
const measureMs = +opt('measure', 3000);
const cpu = opt('cpu') ? +opt('cpu') : 0;
const weak = opt('weak') === 'swiftshader';
const prof = !!opt('prof');
const fresh = !!opt('fresh');
const STEP = { 'gcpd roof': 'toDocks', docks: 'toYard', 'neon street': 'toStreet', 'ace chemicals': 'toFactory', 'clock plaza': 'toTower' };
const extra = opt('extra') ? String(opt('extra')) : '';
const W = +opt('w', 1920), H = +opt('h', 1080);
const args = ['--mute-audio', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
  ...(weak ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist'])];
const channel = process.env.CHANNEL ?? 'msedge'; // SwiftShader through Edge's ANGLE (--use-angle=swiftshader)
const list = SITES.filter((s) => siteNames.includes(s[0]));

async function openPage(browser, base, q) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  if (cpu) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  await page.goto(`${base}${base.includes('?') ? '&' : '?'}at=toDocks&god=1&q=${q}&dynres=0${prof ? '&prof=1' : ''}${extra}`);
  await page.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 600000, polling: 500 });
  return { page, errors };
}
const placeOn = (page, s) => page.evaluate(([p, yaw, pitch]) => { const g = window.__game; g.teleport(p); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]);
const measureOn = (page, ms) => page.evaluate(([ms, fresh]) => new Promise((res) => {
  const g = window.__game;
  window.__prof?.reset?.();
  const ft = [], js = [], cal = [];
  // CPU-speed calibration: a fixed piece of JS timed every 100 ms in its own task, in the same page
  // and the same seconds as the frames. Frame and JS times divided by it ("normalised") cancel
  // most of this laptop's clock-speed swings (throttling, power state) between two pages measured
  // a minute apart. The workload resembles the game's (typed arrays, float maths, calls).
  const calBuf = new Float32Array(4096);
  const calib = () => { const t = performance.now(); let x = 1; for (let k = 0; k < 60; k++) for (let i = 0; i < 4096; i++) { x = (x * 1.0001 + i) % 1013; calBuf[i] = Math.sqrt(calBuf[(i * 7) & 4095] + x); } cal.push(performance.now() - t); return x; };
  const calT = setInterval(calib, 100);
  let last = performance.now(); const t0 = last;
  const f = (n) => {
    ft.push(n - last); last = n; js.push(g.state.stepMs ?? NaN);
    if (n - t0 < ms) requestAnimationFrame(f);
    else {
      const med = (a) => { const s = a.filter((x) => x === x).sort((x, y) => x - y); return s.length ? +s[s.length >> 1].toFixed(3) : null; };
      const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length * 0.95)].toFixed(2); };
      let calls = null;
      const ps = g.ink?.stats?.passes;
      if (ps) { calls = 0; for (const v of Object.values(ps)) if (v.ran) calls += v.calls; }
      calls ??= g.renderer?.info?.render?.calls ?? null;
      // Trimmed means (the slowest 5 % dropped): rAF timestamps and performance.now() are 0.1 ms
      // steps here, too coarse for a median of 2-3 ms frames; a mean of many steps is not.
      const tmean = (a) => { const s = a.filter((x) => x === x).sort((x, y) => x - y); const k = Math.max(1, Math.floor(s.length * 0.95)); let t = 0; for (let i = 0; i < k; i++) t += s[i]; return +(t / k).toFixed(4); };
      clearInterval(calT);
      const calMs = med(cal);
      const frameMs = fresh ? (performance.now() - t0) / ft.length : tmean(ft), jsMs = tmean(js);
      res({ frameMs, medMs: med(ft), jsMs, calMs, frameN: frameMs / calMs, jsN: jsMs / calMs, p95Ms: p95(ft), frames: ft.length, calls, prof: window.__prof?.report?.() ?? null });
    }
  };
  requestAnimationFrame(f);
}), [ms, fresh]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const s = a.filter((x) => x != null && x === x).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ONE page open at a time (the owner's machine is shared, and two pages measured at once proved
// noisy too): each round opens side A, tours, measures every site and closes it, then the same
// for side B, with the order flipped every round (AB, BA, ...), so a drift of the machine's speed
// lands on both sides equally over a pair of rounds. Run the script at low priority
// (Start-Process -PriorityClass BelowNormal); the browser inherits it.
const browser = await chromium.launch({ channel, args });
const results = [];
const t0 = Date.now();
console.log(`A=${labels[0]} ${urlA}\nB=${labels[1]} ${urlB}\n${rounds} rounds, ${measureMs} ms per site, alternating one page at a time${fresh ? ', fresh load per site' : ''}${cpu ? `, CPU x${cpu}` : ''}${weak ? ', SwiftShader' : ''}`);
async function measureSide(base, q) {
  const out = {};
  if (fresh) {
    for (const s of list) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      if (cpu) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
      await page.goto(`${base}?at=${STEP[s[0]] ?? 'toDocks'}&god=1&q=${q}${extra}`);
      await page.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 600000, polling: 200 });
      await placeOn(page, s);
      await wait(1200);
      out[s[0]] = await measureOn(page, measureMs);
      await page.close();
    }
    return out;
  }
  const { page, errors } = await openPage(browser, base, q);
  // Warm tour: lazy builds (crowd figures, shader variants) happen here, not in the numbers.
  for (const s of list) { await placeOn(page, s); await wait(2000); }
  for (const s of list) {
    await placeOn(page, s);
    await wait(1500);
    out[s[0]] = await measureOn(page, measureMs);
  }
  if (errors.length) console.log(`page errors on ${base}: ${errors.length}`, errors[0]);
  await page.close();
  return out;
}
for (const [qa, qb] of pairs) {
  for (let r = 0; r < rounds; r++) {
    let A, B;
    if (r % 2) { B = await measureSide(urlB, qb); A = await measureSide(urlA, qa); }
    else { A = await measureSide(urlA, qa); B = await measureSide(urlB, qb); }
    for (const s of list) {
      const ra = A[s[0]], rb = B[s[0]];
      const row = { pair: `${qa}:${qb}`, site: s[0], round: r, order: r % 2 ? 'BA' : 'AB', a: ra, b: rb, frameRatio: rb.frameN / ra.frameN, jsRatio: rb.jsN / ra.jsN, rawFrameRatio: rb.frameMs / ra.frameMs, calRatio: rb.calMs / ra.calMs };
      results.push(row);
      console.log(`r${r} ${row.order} ${row.pair.padEnd(12)} ${s[0].padEnd(13)} ${labels[0]} ${ra.frameMs.toFixed(2).padStart(6)} ms (js ${ra.jsMs?.toFixed(2)}) ${labels[1]} ${rb.frameMs.toFixed(2).padStart(6)} ms (js ${rb.jsMs?.toFixed(2)})  frame x${row.frameRatio.toFixed(2)} js x${row.jsRatio.toFixed(2)} (normalised; raw frame x${row.rawFrameRatio.toFixed(2)}, cpu-speed x${(1 / row.calRatio).toFixed(2)})  calls ${ra.calls}/${rb.calls}`);
    }
  }
}
await browser.close();

console.log(`\nper site, ${labels[1]}/${labels[0]} (ratio < 1: ${labels[1]} faster), median over ${rounds} rounds [min..max]:`);
const summary = [];
for (const [qa, qb] of pairs) {
  const pair = `${qa}:${qb}`;
  const fr = [], jr = [];
  for (const s of list) {
    const rs = results.filter((x) => x.pair === pair && x.site === s[0]);
    const f = rs.map((x) => x.frameRatio), j = rs.map((x) => x.jsRatio);
    fr.push(...f); jr.push(...j);
    const row = { pair, site: s[0], frameRatio: med(f), frameMin: Math.min(...f), frameMax: Math.max(...f), jsRatio: med(j), jsMin: Math.min(...j), jsMax: Math.max(...j),
      fpsA: Math.round(1000 / med(rs.map((x) => x.a.frameMs))), fpsB: Math.round(1000 / med(rs.map((x) => x.b.frameMs))), callsA: med(rs.map((x) => x.a.calls)), callsB: med(rs.map((x) => x.b.calls)) };
    summary.push(row);
    console.log(`  ${pair.padEnd(12)} ${s[0].padEnd(13)} frame x${row.frameRatio.toFixed(2)} [${row.frameMin.toFixed(2)}..${row.frameMax.toFixed(2)}]  js x${row.jsRatio.toFixed(2)} [${row.jsMin.toFixed(2)}..${row.jsMax.toFixed(2)}]  fps ${row.fpsA} -> ${row.fpsB}  calls ${row.callsA} -> ${row.callsB}`);
  }
  console.log(`  ${pair.padEnd(12)} ${'ALL'.padEnd(13)} frame x${med(fr).toFixed(2)}  js x${med(jr).toFixed(2)}`);
}
console.log(`(${Math.round((Date.now() - t0) / 1000)} s)`);
const out = opt('out');
if (out) writeFileSync(String(out), JSON.stringify({ when: new Date().toISOString(), urlA, urlB, labels, rounds, measureMs, cpu, weak, pairs, summary, results }, null, 1));
