// [perf3] The cost of one dynamic-resolution step: changes the scale the way the game does
// (window.__game.dynRes's onChange -> applyResolution) every 600 ms and records the longest frame
// in the four frames after each change, against the median frame. Usage:
//   node scripts/dynres-hitch.mjs <url> [--q low] [--steps 10]
import { chromium } from 'playwright-core';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const base = argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5850/';
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`${base}?at=toDocks&god=1&q=${opt('q', 'low')}`);
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 300000, polling: 500 });
await p.evaluate(() => { const g = window.__game; g.teleport({ x: 150, y: 0, z: 10 }); g.follow.snapBehind(0, 0.1); });
await p.waitForTimeout(3000);
const r = await p.evaluate((steps) => new Promise((res) => {
  const g = window.__game;
  // Drive the same path a real step takes: the dynRes onChange hook. dynRes.setEnabled(false/true)
  // flips between full scale and the current scale, so force a scale first via capTo/enabled.
  const d = g.dynRes;
  const scales = [];
  const ft = []; let last = performance.now(), k = 0, nextAt = last + 600, after = -1, worst = [];
  const apply = (s) => d.forceScale(s);
  const f = (n) => {
    const dt = n - last; last = n; ft.push(dt);
    if (after >= 0) { worst[worst.length - 1] = Math.max(worst[worst.length - 1], dt); if (++after > 4) after = -1; }
    if (n >= nextAt && k < steps) {
      k++; nextAt = n + 600;
      const s = k % 2 ? 0.9 : 0.95;
      scales.push(s);
      const t0 = performance.now();
      apply(s);
      worst.push(performance.now() - t0); after = 0;
    }
    if (k < steps || after >= 0) requestAnimationFrame(f);
    else { const s = [...ft].sort((a, b) => a - b); res({ median: s[s.length >> 1], worst, scales }); }
  };
  requestAnimationFrame(f);
}), +opt('steps', 10));
await b.close();
console.log(`median frame ${r.median.toFixed(2)} ms; longest frame after each step (incl. the step's own JS): ${r.worst.map((x) => x.toFixed(1)).join(', ')} ms`);
