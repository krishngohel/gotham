// [perf3] WebGL calls per frame by name at a fixed camera (what three.js actually sends).
// Usage: node scripts/perf-glcalls.mjs <url> [--q low] [--site "gcpd roof"]
import { chromium } from 'playwright-core';
import { SITES } from './perf-matrix-sites.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const base = argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5850/';
const site = SITES.find((s) => s[0] === opt('site', 'gcpd roof').replace(/_/g, ' '));
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`${base}?at=toDocks&god=1&q=${opt('q', 'low')}&dynres=0${opt('extra', '')}`);
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 300000, polling: 500 });
await p.evaluate(([pos, yaw, pitch]) => { const g = window.__game; g.teleport(pos); g.follow.snapBehind(yaw, pitch); }, [site[1], site[2], site[3]]);
await p.waitForTimeout(4000);
const r = await p.evaluate(() => new Promise((res) => {
  const gl = window.__game.renderer.getContext();
  const proto = Object.getPrototypeOf(gl);
  const counts = {}; const saved = {};
  let on = false;
  for (const k of Object.getOwnPropertyNames(proto)) {
    let d; try { d = Object.getOwnPropertyDescriptor(proto, k); } catch { continue; }
    if (!d || typeof d.value !== 'function') continue;
    saved[k] = d.value;
    gl[k] = function (...a) { if (on) counts[k] = (counts[k] ?? 0) + 1; return saved[k].apply(gl, a); };
  }
  requestAnimationFrame(() => { on = true; requestAnimationFrame(() => { on = false; for (const k in saved) delete gl[k]; res(counts); }); });
}));
await b.close();
const tot = Object.values(r).reduce((a, b) => a + b, 0);
console.log(`total gl calls in one frame: ${tot}`);
for (const [k, n] of Object.entries(r).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(String(n).padStart(6), k);
