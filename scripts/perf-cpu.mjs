// [perf3] Where the CPU goes at a fixed camera: a CDP CPU profile (self and inclusive time per
// function, as a share of the profiled main-thread time so the reading does not depend on how fast
// the machine is at that moment) plus a sampling heap profile (bytes allocated per call site per
// frame). Usage:
//   node scripts/perf-cpu.mjs <url> [--q low] [--site "gcpd roof"] [--ms 4000] [--top 40] [--cpu 1]
//        [--extra "&off=cape"] [--out f.json]
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';
import { SITES } from './perf-matrix-sites.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const base = argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5850/';
const q = opt('q', 'low');
const siteName = opt('site', 'gcpd roof').replace(/_/g, ' ');
const ms = +opt('ms', 4000);
const topN = +opt('top', 40);
const site = SITES.find((s) => s[0] === siteName);
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`${base}?at=${opt('at', 'toDocks')}&god=1&q=${q}&dynres=0${opt('extra', '')}`);
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 300000, polling: 500 });
const cdp = await p.context().newCDPSession(p);
if (+opt('cpu', 1) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +opt('cpu', 1) });
const place = () => p.evaluate(([pos, yaw, pitch]) => { const g = window.__game; g.teleport(pos); g.follow.snapBehind(yaw, pitch); }, [site[1], site[2], site[3]]);
if (!argv.includes('--fresh')) for (const s of SITES) { await p.evaluate(([pos, yaw, pitch]) => { const g = window.__game; g.teleport(pos); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]); await p.waitForTimeout(1500); }
await place();
await p.waitForTimeout(argv.includes('--fresh') ? 1200 : 2500); // --fresh: like scripts/perf.mjs, right after the load
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
await cdp.send('HeapProfiler.enable');
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048 });
const f0 = await p.evaluate(() => window.__game.state.frame);
await cdp.send('Profiler.start');
await p.waitForTimeout(ms);
const { profile } = await cdp.send('Profiler.stop');
const { profile: heap } = await cdp.send('HeapProfiler.stopSampling');
const frames = (await p.evaluate(() => window.__game.state.frame)) - f0;
await b.close();

// Self time per node from samples.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const selfUs = new Map();
const dts = profile.timeDeltas;
for (let i = 0; i < profile.samples.length; i++) selfUs.set(profile.samples[i], (selfUs.get(profile.samples[i]) ?? 0) + (dts[i + 1] ?? dts[i] ?? 0));
const key = (n) => { const f = n.callFrame; const file = f.url.split('/').pop().split('?')[0]; return `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`; };
const self = new Map(), incl = new Map();
let total = 0, idle = 0;
for (const [id, us] of selfUs) {
  const n = byId.get(id);
  const k = key(n);
  total += us;
  if (['(idle)', '(program)', '(garbage collector)'].includes(n.callFrame.functionName)) { if (n.callFrame.functionName === '(idle)') idle += us; }
  self.set(k, (self.get(k) ?? 0) + us);
  // inclusive: each distinct key once per stack
  const seen = new Set();
  for (let x = id; x != null; x = parent.get(x)) { const kk = key(byId.get(x)); if (seen.has(kk)) continue; seen.add(kk); incl.set(kk, (incl.get(kk) ?? 0) + us); }
}
const busy = total - idle;
const perFrame = (us) => (us / 1000 / frames).toFixed(3);
const fmt = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([k, us]) => `${(100 * us / busy).toFixed(1).padStart(5)}%  ${perFrame(us).padStart(7)} ms/f  ${k}`).join('\n');
console.log(`${q} ${siteName}: ${frames} frames in ${ms} ms (${(ms / frames).toFixed(2)} ms/frame), busy ${(busy / 1000 / frames).toFixed(2)} ms/frame`);
console.log('\n== self ==\n' + fmt(self));
console.log('\n== inclusive ==\n' + fmt(incl));
// Heap: bytes per call site (self) per frame.
const hself = new Map();
const walkH = (n) => { const k = key(n); hself.set(k, (hself.get(k) ?? 0) + n.selfSize); for (const c of n.children ?? []) walkH(c); };
walkH(heap.head);
console.log('\n== allocation (bytes/frame, sampled) ==\n' + [...hself].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, b]) => `${String(Math.round(b / frames)).padStart(8)}  ${k}`).join('\n'));
if (opt('out')) writeFileSync(opt('out'), JSON.stringify({ q, site: siteName, frames, ms, self: [...self], incl: [...incl], heap: [...hself] }));
