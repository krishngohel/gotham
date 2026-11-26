// [perf3] ?prof=1 per-system JS ms and structural counters at the fixed cameras, one tier.
// Usage: node scripts/perf-sys.mjs <url> [--q low] [--sites gcpd_roof,docks] [--ms 3000] [--cpu 4] [--extra ""]
import { chromium } from 'playwright-core';
import { SITES } from './perf-matrix-sites.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const base = argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5850/';
const names = opt('sites') ? opt('sites').replace(/_/g, ' ').split(',') : SITES.map((s) => s[0]);
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
if (+opt('cpu', 1) > 1) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +opt('cpu', 1) }); } // [perf3] --cpu 4: CDP CPU throttle
await p.goto(`${base}?at=toDocks&god=1&q=${opt('q', 'low')}&dynres=0&prof=1${opt('extra', '')}`);
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30 && window.__prof, null, { timeout: 300000, polling: 500 });
const place = (s) => p.evaluate(([pos, yaw, pitch]) => { const g = window.__game; g.teleport(pos); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]);
for (const s of SITES) { await place(s); await p.waitForTimeout(1500); }
for (const s of SITES.filter((x) => names.includes(x[0]))) {
  await place(s); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__prof.reset());
  await p.waitForTimeout(+opt('ms', 3000));
  const r = await p.evaluate(() => window.__prof.report());
  const sys = Object.entries(r.systems).sort((a, b) => b[1].mean - a[1].mean).filter(([, v]) => v.mean >= 0.02).map(([k, v]) => `${k} ${v.mean.toFixed(2)}`).join(' | ');
  const c = r.counts; const g = (k) => c[k]?.med ?? '-';
  console.log(`${s[0].padEnd(13)} gpu ${g('gpuMs')} step ${g('stepMs')} calls ${g('calls')} tris ${g('tris')} obj ${g('objects')} walk ${g('matrixWalk')} autoMat ${g('autoMat')} meshVis ${g('meshesVis')} skinVis ${g('skinnedVis')} prog ${g('programs')} dom ${c.dom?.mean?.toFixed(1)} heapUp ${Math.round(c.heapUp?.mean ?? 0)} B/f long ${r.longTasks.length}\n   ${sys}`);
}
await b.close();
