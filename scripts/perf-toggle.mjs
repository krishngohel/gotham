// [perf3] Before/after of one optimisation in the SAME page: flips its runtime switch
// (src/dev/perfToggles.js) on and off every half second for a while and compares the JS time per
// frame (state.stepMs) and the frame time of the two states. The machine's state (clock speed,
// other programs) is the same on both sides to within half a second, which page-against-page runs
// on this laptop cannot give (+-30 % between rounds).
// Usage: node scripts/perf-toggle.mjs <url> --features clothSqrt,programSort [--q low]
//        [--sites gcpd_roof,docks] [--secs 20] [--period 500] [--extra "&p2=bot"]
// --features all = every registered switch at once.
import { chromium } from 'playwright-core';
import { SITES } from './perf-matrix-sites.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const base = argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5850/';
const q = opt('q', 'low');
const names = opt('sites', 'gcpd_roof,docks,neon_street,ace_chemicals,clock_plaza').replace(/_/g, ' ').split(',');
const secs = +opt('secs', 20), period = +opt('period', 500);
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
await p.goto(`${base}?at=toDocks&god=1&q=${q}&dynres=0${opt('extra', '')}`);
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30 && window.__perfToggles, null, { timeout: 300000, polling: 500 });
let features = opt('features', 'all');
if (features === 'all') features = (await p.evaluate(() => window.__perfToggles.names())).join(',');
features = features.split(',');
console.log(`${q}: toggling ${features.join(', ')} every ${period} ms for ${secs} s per site`);
const place = (s) => p.evaluate(([pos, yaw, pitch]) => { const g = window.__game; g.teleport(pos); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]);
for (const s of SITES) { await place(s); await p.waitForTimeout(1500); }
const all = [];
for (const s of SITES.filter((x) => names.includes(x[0]))) {
  await place(s);
  await p.waitForTimeout(1500);
  const r = await p.evaluate(([features, secs, period]) => new Promise((res) => {
    const g = window.__game, T = window.__perfToggles;
    const set = (on) => { for (const f of features) T.set(f, on); };
    const bins = { on: { js: [], ft: [] }, off: { js: [], ft: [] } };
    const halves = { on: [[], []], off: [[], []] };
    let on = true, skip = 2, flipAt = performance.now() + period, last = performance.now();
    const t0 = last;
    set(true);
    const f = (n) => {
      const dt = n - last; last = n;
      if (skip > 0) skip--;
      else {
        const k = on ? 'on' : 'off';
        bins[k].js.push(g.state.stepMs); bins[k].ft.push(dt);
        halves[k][n - t0 < secs * 500 ? 0 : 1].push(g.state.stepMs);
      }
      if (n >= flipAt) { on = !on; set(on); skip = 2; flipAt = n + period; }
      if (n - t0 < secs * 1000) requestAnimationFrame(f);
      else {
        set(true);
        const tmean = (a) => { const s = a.filter((x) => x === x).sort((x, y) => x - y); const k = Math.max(1, Math.floor(s.length * 0.95)); let t = 0; for (let i = 0; i < k; i++) t += s[i]; return t / k; };
        res({ jsOn: tmean(bins.on.js), jsOff: tmean(bins.off.js), ftOn: tmean(bins.on.ft), ftOff: tmean(bins.off.ft), n: [bins.on.js.length, bins.off.js.length],
          half: [tmean(halves.on[0]) / tmean(halves.off[0]), tmean(halves.on[1]) / tmean(halves.off[1])] });
      }
    };
    requestAnimationFrame(f);
  }), [features, secs, period]);
  r.site = s[0];
  all.push(r);
  console.log(`${s[0].padEnd(13)} js ${r.jsOff.toFixed(3)} -> ${r.jsOn.toFixed(3)} ms (x${(r.jsOn / r.jsOff).toFixed(3)}, halves x${r.half.map((x) => x.toFixed(3)).join('/')})  frame ${r.ftOff.toFixed(3)} -> ${r.ftOn.toFixed(3)} ms (x${(r.ftOn / r.ftOff).toFixed(3)})  frames ${r.n.join('/')}`);
}
await b.close();
const g = (a) => Math.exp(a.reduce((x, y) => x + Math.log(y), 0) / a.length);
console.log(`geomean: js x${g(all.map((r) => r.jsOn / r.jsOff)).toFixed(3)}  frame x${g(all.map((r) => r.ftOn / r.ftOff)).toFixed(3)}${errors.length ? `  page errors ${errors.length}: ${errors[0]}` : ''}`);
