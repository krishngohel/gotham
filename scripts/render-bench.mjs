// Fixed-camera render benchmark per district (src/dev/perfBench.js, ?bench=districts): frame time
// and, per pass (shadow, colour, normal, ink, x-ray), draw calls, triangles and GPU ms from timer
// queries. Uncapped (vsync off), dynamic resolution off, headless Edge on the real GPU.
//
// Usage: node scripts/render-bench.mjs [baseUrl] [tier] [runs]
// Env:   OUT=<file.json>  write the raw rows of every run
//        WEAK=swiftshader render in software (SwiftShader). A stress proxy only: it is a CPU
//                         rasteriser, nothing like an Intel UHD 620's real balance of costs.
//        CPU=4            Chrome DevTools CPU throttling (4x slower JavaScript and driver work).
//                         Also only a proxy for a weak laptop CPU.
//        SIZE=1280x720    viewport (default 1280x720, the potato target resolution)
//        DPR=2            device pixel ratio (high/ultra render at up to 2x: makes a fast GPU fragment-bound)
//        VIEWS=a,b        only these district names
//        CHANNEL=msedge   browser channel ('chromium' for Playwright's own build)
//        SHOTS=<dir>      screenshot every pinned view (<tier>-<view>.png)
//        P2=bot           split screen: a second local player (the scripted bot) beside player 1,
//                         both views drawn every frame (workstream D1; compare against no P2)
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5310/';
const tier = process.argv[3] ?? 'high';
const runs = Number(process.argv[4] ?? 1);
const [w, h] = (process.env.SIZE ?? '1280x720').split('x').map(Number);
const weak = process.env.WEAK ?? '';
const cpu = Number(process.env.CPU ?? 1);
const angle = weak === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--ignore-gpu-blocklist'];
const channel = process.env.CHANNEL ?? 'msedge';
const b = await chromium.launch({ channel: channel === 'chromium' ? undefined : channel, headless: !process.env.HEADED, args: ['--mute-audio', `--window-size=${w},${h}`, ...angle, '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const all = [];
for (let r = 0; r < runs; r++) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: Number(process.env.DPR ?? 1) });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  if (cpu > 1) { const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  if (process.env.SHOTS) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(process.env.SHOTS, { recursive: true });
    await p.exposeFunction('__benchShot', async (name) => { await p.screenshot({ path: `${process.env.SHOTS}/${tier}-${name.replace(/ /g, '-')}.png` }); });
  }
  if (process.env.VIEWS) await p.addInitScript((v) => { window.__benchViews = v; }, process.env.VIEWS.split(','));
  await p.goto(`${base}?at=start&god=1&dynres=0&gputime=1&bench=districts&q=${tier}${process.env.P2 === 'bot' ? '&p2=bot' : ''}${process.env.EXTRA ?? ''}`);
  await p.waitForFunction(() => window.__bench, null, { timeout: (weak || cpu > 1 ? 900 : 300) * 1000, polling: 1000 });
  const res = await p.evaluate(() => window.__bench);
  res.errors = errors;
  all.push(res);
  if (r === 0) console.log(JSON.stringify({ tier, run: r, weak, cpu, ...res.meta, ua: undefined }));
  for (const row of res.rows) {
    const ps = Object.entries(row.passes).map(([k, v]) => `${k} ${v.calls}/${(v.tris / 1000).toFixed(0)}k${v.gpuMs != null ? `/${v.gpuMs.toFixed(2)}ms` : ''}`).join('  ');
    console.log(`${String(r).padEnd(2)} ${row.name.padEnd(12)} frame ${String(row.frameMs).padStart(6)} mean ${String(row.meanMs).padStart(6)} p95 ${String(row.p95Ms).padStart(6)} js ${String(row.scriptMs).padStart(5)} gpu ${row.gpuMs ?? '-'}  | ${ps}`);
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  await ctx.close();
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(all, null, 1));
await b.close();
