// [perf2] Performance regression gate that does not depend on how fast (or how busy) the GPU is.
//
// At fixed cameras (the seven perf-matrix sites) and fixed tiers it reads structural budgets from
// the game's own probe (?prof=1, src/dev/perfProbe.js): draw calls per frame (every pass),
// triangles, visible skinned meshes, lit point lights, objects the matrix walk visits, shader
// programs, and JS milliseconds per big system with the page's CPU throttled (CPU=, default 2) so
// that the JS numbers are comparable from run to run and machine to machine within generous
// bounds. Each value is compared with docs/perf2/perf-budget.json:
//   counts (calls, tris, skinnedVis, lights, matrixWalk, programs): fail above budget * 1.15
//   JS ms (game, world, render, total js): fail above budget * JS_TOL (default 2.5: shared and
//   slower machines are fine; a system that suddenly costs several times more is not)
// Usage:
//   BASE=http://localhost:5820/ node scripts/perf-gate.mjs            check, exit 1 on a breach
//   UPDATE=1 BASE=... node scripts/perf-gate.mjs                      re-record the budget file
//   Q=low,potato SITES="gcpd roof,narrows" ...                        a subset
// Point it at a server whose files do not change while it runs (a dev server reloads the page on
// an edit, and the run dies), e.g. `npm run build && npx vite preview --port 5830`.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SITES } from './perf-matrix-sites.mjs';

const base = process.env.BASE ?? 'http://localhost:5820/';
const tiers = (process.env.Q ?? 'potato,low,high').split(',');
const siteNames = process.env.SITES ? process.env.SITES.split(',') : SITES.map((s) => s[0]);
const cpu = +(process.env.CPU ?? 2);
const file = process.env.BUDGET ?? new URL('../docs/perf3/perf-budget.json', import.meta.url); // [perf3] round-2 budget (docs/perf2/ kept as the round-1 record)
const COUNT_TOL = +(process.env.COUNT_TOL ?? 1.15), JS_TOL = +(process.env.JS_TOL ?? 2.5);
// [perf3] Triangles follow how many crowd figures and cars happen to be in view after the tour
// (+-15 % between two runs of the same build at the same camera), so they get more room.
const TRIS_TOL = +(process.env.TRIS_TOL ?? 1.3);
const COUNTS = ['calls', 'tris', 'skinnedVis', 'lights', 'matrixWalk', 'programs'];
const SYSTEMS = ['game', 'world', 'render', 'hero.cape', 'civilians', 'wanted', 'sandbox']; // [perf3] + cape, crowd, police, sandbox

const browser = await chromium.launch({ channel: process.env.CHANNEL ?? 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const measured = {};
for (const q of tiers) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  if (cpu > 1) await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto(`${base}?at=toDocks&god=1&q=${q}&dynres=0&prof=1`);
  await page.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30 && window.__prof, null, { timeout: 300000 });
  const list = SITES.filter((s) => siteNames.includes(s[0]));
  const place = (s) => page.evaluate(([p, yaw, pitch]) => { const g = window.__game; g.teleport(p); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]);
  for (const s of list) { await place(s); await page.waitForTimeout(2500); } // the tour: lazy builds happen here
  measured[q] = {};
  for (const s of list) {
    await place(s);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => new Promise((res) => { window.__prof.reset(); setTimeout(() => res(window.__prof.report()), 2500); }));
    const row = {};
    for (const k of COUNTS) row[k] = r.counts[k]?.med ?? null;
    for (const k of SYSTEMS) row[`${k}Ms`] = r.systems[k]?.med ?? null;
    row.jsMs = r.counts.stepMs?.med ?? null;
    measured[q][s[0]] = row;
    console.log(`${q.padEnd(6)} ${s[0].padEnd(13)} ${Object.entries(row).map(([k, v]) => `${k} ${v}`).join('  ')}`);
  }
  if (errors.length) console.log(`${q}: ${errors.length} page errors`, errors.slice(0, 2));
  await page.close();
}
await browser.close();

if (process.env.UPDATE || !existsSync(file)) {
  const old = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { budgets: {} };
  for (const [q, sites] of Object.entries(measured)) old.budgets[q] = { ...(old.budgets[q] ?? {}), ...sites };
  old.note = 'Written by scripts/perf-gate.mjs UPDATE=1. Counts fail above x' + COUNT_TOL + ' (triangles x' + TRIS_TOL + '), JS ms above x' + JS_TOL + ` (CPU throttle ${cpu}x). matrixWalk counts a parked hidden subtree once (perf3 probe).`;
  old.recorded = new Date().toISOString();
  writeFileSync(file, JSON.stringify(old, null, 1));
  console.log(`budget written: ${file}`);
  process.exit(0);
}
const budget = JSON.parse(readFileSync(file, 'utf8')).budgets;
const breaches = [];
for (const [q, sites] of Object.entries(measured)) {
  for (const [site, row] of Object.entries(sites)) {
    const b = budget[q]?.[site];
    if (!b) { console.log(`(no budget for ${q} ${site})`); continue; }
    for (const k of COUNTS) { const tol = k === 'tris' ? TRIS_TOL : COUNT_TOL; if (b[k] != null && row[k] != null && row[k] > Math.ceil(b[k] * tol)) breaches.push(`${q} ${site} ${k} ${row[k]} > ${b[k]} x${tol}`); }
    for (const k of [...SYSTEMS.map((x) => `${x}Ms`), 'jsMs']) if (b[k] != null && row[k] != null && row[k] > Math.max(0.5, b[k] * JS_TOL)) breaches.push(`${q} ${site} ${k} ${row[k]} > ${b[k]} x${JS_TOL}`);
  }
}
if (breaches.length) { console.log(`\nPERF GATE FAILED (${breaches.length}):`); for (const b of breaches) console.log('  ' + b); process.exit(1); }
console.log('\nperf gate: all within budget');
