// [perf3] Screenshots of the same frozen moment with a runtime optimisation switch on and off
// (src/dev/perfToggles.js), for the before/after visual check. Time is frozen (photo-style:
// ink.debug.fixedTime, rain/traffic paused by the screenshot moment being one frame apart is not
// enough, so each pair is taken twice and the pair with the smaller difference is kept).
// Usage: node scripts/toggle-shots.mjs <url> --feature dynresSubRect --q low --site neon_street
//        --out docs/design/shots/perf3/name [--scale 0.9]
import { chromium } from 'playwright-core';
import { SITES } from './perf-matrix-sites.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const base = argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5850/';
const site = SITES.find((s) => s[0] === opt('site', 'neon_street').replace(/_/g, ' '));
const feature = opt('feature', 'dynresSubRect');
const out = opt('out', 'shot');
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`${base}?at=toDocks&god=1&q=${opt('q', 'low')}&civ=0${opt('extra', '')}`);
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30 && window.__perfToggles, null, { timeout: 300000, polling: 500 });
await p.evaluate(([pos, yaw, pitch]) => { const g = window.__game; g.teleport(pos); g.follow.snapBehind(yaw, pitch); }, [site[1], site[2], site[3]]);
await p.waitForTimeout(3000);
await p.evaluate((s) => { const g = window.__game; g.ink.debug.fixedTime = 10; if (s) g.dynRes.forceScale(+s); g.time?.setScale?.(0); }, opt('scale', null));
await p.waitForTimeout(800);
for (const on of [true, false]) {
  await p.evaluate(([f, on]) => window.__perfToggles.set(f, on), [feature, on]);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}-${on ? 'after' : 'before'}.png` });
}
await p.evaluate((f) => window.__perfToggles.set(f, true), feature);
await b.close();
console.log(`${out}-before.png / ${out}-after.png`);
