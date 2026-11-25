// [perf2] Frame budget matrix: per site and tier, the median frame time, JS time (state.stepMs),
// GPU ms (timer queries), draw calls and triangles, and with ?prof=1 (src/dev/perfProbe.js) JS ms
// per system, visible skinned meshes, DOM mutations, heap growth and long tasks.
//
// Usage:
//   BASE=http://localhost:5820/ node scripts/perf-matrix.mjs
// Env:
//   BASES   comma list of label=url to A/B several servers, interleaved round by round
//   Q       tiers (default high,low,potato)       SITES  site names (default all seven)
//   OFF     ';'-separated ?off= configs to ablate, '' is the base (e.g. "OFF=;traffic;civilians")
//   ROUNDS  repeats (default 1; medians across rounds)   MEASURE  ms per site (default 3000)
//   OUT     write the raw JSON here              PROF=0  skip the per-system scopes
//   VSYNC=1 keep vsync (default: uncapped, like scripts/perf.mjs)  CPU=4  CDP CPU throttle
//   WEAK=swiftshader  software rendering (a low-spec stress proxy, not a real weak GPU)
//   PAIRED=1 open every server's page at once and measure them side by side (robust to load bursts
//           from other programs on a shared machine; each page then has the CPU to itself less)
// One page per (server, tier, config); it tours every site once before measuring, so lazy builds
// (civilian figures, shader variants) happen in the tour, not in the numbers. Dynamic resolution is
// off (?dynres=0) so the pixel count is fixed.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

import { SITES } from './perf-matrix-sites.mjs';

const bases = (process.env.BASES ?? `cur=${process.env.BASE ?? 'http://localhost:5820/'}`).split(',').map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; });
const tiers = (process.env.Q ?? 'high,low,potato').split(',');
const siteNames = process.env.SITES ? process.env.SITES.split(',') : SITES.map((s) => s[0]);
const offs = (process.env.OFF ?? '').split(';');
const rounds = +(process.env.ROUNDS ?? 1);
const measureMs = +(process.env.MEASURE ?? 3000);
const prof = process.env.PROF !== '0';
const args = ['--mute-audio', ...(process.env.WEAK === 'swiftshader' ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist']), ...(process.env.VSYNC ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit'])];
const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'msedge', args });
const results = [];

async function openPage(base, q, off) {
  const page = await browser.newPage({ viewport: { width: +(process.env.W ?? 1920), height: +(process.env.H ?? 1080) } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  if (process.env.CPU) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU }); }
  await page.goto(`${base}?at=toDocks&god=1&q=${q}&gputime=1&dynres=0${prof ? '&prof=1' : ''}${off ? `&off=${off}` : ''}${process.env.EXTRA ?? ''}`);
  await page.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 240000 });
  return { page, errors };
}
const placeOn = (page, s) => page.evaluate(([p, yaw, pitch]) => { const g = window.__game; g.teleport(p); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]);
const measureOn = (page, ms) => page.evaluate((ms) => new Promise((res) => {
  const g = window.__game;
  window.__prof?.reset();
  const ft = [], js = [], gpu = [], calls = [], tris = [];
  let last = performance.now(); const t0 = last;
  const f = (n) => {
    ft.push(n - last); last = n; js.push(g.state.stepMs ?? NaN);
    if (g.ink?.gpuMs != null) gpu.push(g.ink.gpuMs);
    const ps = g.ink?.stats?.passes;
    if (ps) { let c = 0, t = 0; for (const v of Object.values(ps)) if (v.ran) { c += v.calls; t += v.tris; } calls.push(c); tris.push(t); }
    if (n - t0 < ms) requestAnimationFrame(f);
    else {
      const med = (a) => { const s = a.filter((x) => x === x).sort((x, y) => x - y); return s.length ? +s[s.length >> 1].toFixed(2) : null; };
      const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length * 0.95)].toFixed(2); };
      res({ frameMs: med(ft), p95Ms: p95(ft), maxMs: +Math.max(...ft).toFixed(1), jsMs: med(js), gpuMs: med(gpu), calls: med(calls), tris: med(tris), frames: ft.length, prof: window.__prof?.report() ?? null, px: [g.renderer.domElement.width, g.renderer.domElement.height] });
    }
  };
  requestAnimationFrame(f);
}), ms);

// PAIRED=1: every server's page open at once, placed at the same site and measured at the same
// time, so a burst of load from another program lands on both sides of the comparison.
async function runPaired(q, off) {
  const pages = await Promise.all(bases.map(([, base]) => openPage(base, q, off)));
  const list = SITES.filter((s) => siteNames.includes(s[0]));
  for (const s of list) { await Promise.all(pages.map((p) => placeOn(p.page, s))); await new Promise((r) => setTimeout(r, 2500)); }
  for (const s of list) {
    await Promise.all(pages.map((p) => placeOn(p.page, s)));
    await new Promise((r) => setTimeout(r, 1500));
    const rs = await Promise.all(pages.map((p) => measureOn(p.page, measureMs)));
    rs.forEach((r, i) => {
      const label = bases[i][0];
      results.push({ label, q, off, site: s[0], ...r, errors: pages[i].errors.length });
      console.log(`${label.padEnd(6)} ${q.padEnd(6)} ${(off || '-').padEnd(12)} ${s[0].padEnd(13)} frame ${String(r.frameMs).padStart(6)} (${Math.round(1000 / r.frameMs)} fps) js ${String(r.jsMs).padStart(6)} gpu ${String(r.gpuMs).padStart(6)} calls ${r.calls} tris ${r.tris}`);
    });
  }
  await Promise.all(pages.map((p) => p.page.close()));
}

async function runPage(label, base, q, off) {
  const page = await browser.newPage({ viewport: { width: +(process.env.W ?? 1920), height: +(process.env.H ?? 1080) } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  if (process.env.CPU) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU }); }
  await page.goto(`${base}?at=toDocks&god=1&q=${q}&gputime=1&dynres=0${prof ? '&prof=1' : ''}${off ? `&off=${off}` : ''}${process.env.EXTRA ?? ''}`);
  await page.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 180000 });
  const place = (s) => page.evaluate(([p, yaw, pitch]) => { const g = window.__game; g.teleport(p); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]);
  const list = SITES.filter((s) => siteNames.includes(s[0]));
  for (const s of list) { await place(s); await page.waitForTimeout(2500); }
  for (const s of list) {
    await place(s);
    await page.waitForTimeout(1500);
    const r = await page.evaluate((ms) => new Promise((res) => {
      const g = window.__game;
      window.__prof?.reset();
      const ft = [], js = [], gpu = [], calls = [], tris = [];
      let last = performance.now(); const t0 = last;
      const f = (n) => {
        ft.push(n - last); last = n; js.push(g.state.stepMs ?? NaN);
        if (g.ink?.gpuMs != null) gpu.push(g.ink.gpuMs);
        const ps = g.ink?.stats?.passes;
        if (ps) { let c = 0, t = 0; for (const v of Object.values(ps)) if (v.ran) { c += v.calls; t += v.tris; } calls.push(c); tris.push(t); }
        if (n - t0 < ms) requestAnimationFrame(f);
        else {
          const med = (a) => { const s = a.filter((x) => x === x).sort((x, y) => x - y); return s.length ? +s[s.length >> 1].toFixed(2) : null; };
          const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length * 0.95)].toFixed(2); };
          res({ frameMs: med(ft), p95Ms: p95(ft), maxMs: +Math.max(...ft).toFixed(1), jsMs: med(js), gpuMs: med(gpu), calls: med(calls), tris: med(tris), frames: ft.length, prof: window.__prof?.report() ?? null, px: [g.renderer.domElement.width, g.renderer.domElement.height] });
        }
      };
      requestAnimationFrame(f);
    }), measureMs);
    results.push({ label, q, off, site: s[0], ...r, errors: errors.length });
    const top = r.prof ? Object.entries(r.prof.systems).filter(([k]) => !k.includes('.') || k.startsWith('world.') || k.startsWith('render.')).sort((a, b) => b[1].mean - a[1].mean).slice(0, 8).map(([k, v]) => `${k} ${v.mean}`).join(' | ') : '';
    console.log(`${label.padEnd(5)} ${q.padEnd(6)} ${(off || '-').padEnd(12)} ${s[0].padEnd(13)} frame ${String(r.frameMs).padStart(6)} (${Math.round(1000 / r.frameMs)} fps) js ${String(r.jsMs).padStart(6)} gpu ${String(r.gpuMs).padStart(6)} calls ${r.calls} tris ${r.tris}  ${top}`);
  }
  await page.close();
}

for (let round = 0; round < rounds; round++) {
  for (const q of tiers) for (const off of offs) {
    if (process.env.PAIRED) await runPaired(q, off);
    else for (const [label, base] of bases) await runPage(label, base, q, off);
  }
}
await browser.close();

// Medians across rounds.
const groups = new Map();
for (const r of results) { const k = `${r.label}|${r.q}|${r.off}|${r.site}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
console.log('\nmedians over rounds:');
const summary = [];
for (const [k, rs] of groups) {
  const [label, q, off, site] = k.split('|');
  const row = { label, q, off, site, frameMs: med(rs.map((r) => r.frameMs)), jsMs: med(rs.map((r) => r.jsMs)), gpuMs: med(rs.map((r) => r.gpuMs)), calls: med(rs.map((r) => r.calls)), tris: med(rs.map((r) => r.tris)) };
  row.fps = Math.round(1000 / row.frameMs);
  summary.push(row);
  console.log(`${label.padEnd(5)} ${q.padEnd(6)} ${(off || '-').padEnd(12)} ${site.padEnd(13)} ${String(row.fps).padStart(4)} fps  frame ${row.frameMs}  js ${row.jsMs}  gpu ${row.gpuMs}  calls ${row.calls}  tris ${row.tris}`);
}
if (bases.length === 2) {
  // Per-site ratio of the second server's JS and frame time to the first's (medians over rounds).
  console.log(`
${bases[1][0]} / ${bases[0][0]}:`);
  for (const a of summary.filter((r) => r.label === bases[0][0])) {
    const b = summary.find((r) => r.label === bases[1][0] && r.q === a.q && r.off === a.off && r.site === a.site);
    if (b) console.log(`  ${a.q.padEnd(6)} ${(a.off || '-').padEnd(10)} ${a.site.padEnd(13)} js x${(b.jsMs / a.jsMs).toFixed(2)}  frame x${(b.frameMs / a.frameMs).toFixed(2)}  calls ${a.calls} -> ${b.calls}`);
  }
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ when: new Date().toISOString(), env: { Q: tiers, OFF: offs, rounds, CPU: process.env.CPU ?? null }, summary, results }, null, 1));
