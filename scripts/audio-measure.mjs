// Offline audio measurement: opens audio-lab.html in headless Chromium, runs __audioCheck()
// (every recipe rendered through an OfflineAudioContext with the real mixer and synth code),
// prints the table, writes the JSON report and spectrogram PNGs of the key combat sounds.
//
//   node scripts/audio-measure.mjs [baseUrl] [--only name,name] [--no-shots]
//
// Writes docs/design/shots/audio/report.json and docs/design/shots/audio/*.png. Exit code 1 if
// any recipe is silent, clips, sits outside its category's loudness band, or a relation check
// fails. This is measurement, not listening: it proves levels, lengths and spectra, not taste.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? process.env.BASE_URL ?? 'http://localhost:5340').replace(/\/$/, '');
const onlyArg = args.indexOf('--only');
const only = onlyArg >= 0 ? args[onlyArg + 1].split(',') : null;
const shots = !args.includes('--no-shots');
const OUT = resolve('docs/design/shots/audio');
mkdirSync(OUT, { recursive: true });

const SPECTROGRAMS = [
  ['hit_jab', {}], ['hit_cross', {}], ['hit_hook', {}], ['hit_kick', {}], ['hit_heavy', { power: 2 }], ['hit_counter', {}],
  ['hit_takedown', {}], ['hit_blocked', {}], ['hit_armour', {}], ['hit_shield', {}], ['hit_blade', {}], ['hit_bodyFall', {}],
  ['hit_critLayer', {}], ['hit_cross', { ko: true }], ['step_concrete', {}], ['step_metal', {}], ['step_water', {}], ['ventOpen', {}], ['railingDown', {}], ['clawRip', {}],
];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}/audio-lab.html`);
await page.waitForFunction(() => typeof window.__audioCheck === 'function');
const t0 = Date.now();
const report = await page.evaluate((o) => window.__audioCheck({ only: o }), only);
const secs = ((Date.now() - t0) / 1000).toFixed(0);

const pad = (s, n) => String(s).padEnd(n);
for (const r of report.results) {
  console.log(`${r.flag ? '!!' : 'ok'} ${pad(r.category, 9)} ${pad(r.name, 30)} peak ${r.peak.toFixed(3)}  rms ${r.rmsDb.toFixed(1).padStart(6)} dB  centroid ${String(Math.round(r.centroid)).padStart(5)} Hz  ${r.durationSec.toFixed(2)} s${r.why.length ? `  <- ${r.why.join('; ')}` : ''}`);
}
for (const c of report.checks) console.log(`${c.ok ? 'ok' : '!!'} check: ${c.name} (${c.detail})`);
console.log(`\n${report.results.length} renders, ${report.checks.length} relation checks in ${secs} s: ${report.ok ? 'ALL OK' : `${report.failures.length} failing`}`);
if (!report.ok) console.log(report.failures.map((f) => `  - ${f}`).join('\n'));
if (!only) writeFileSync(resolve(OUT, 'report.json'), JSON.stringify({ date: new Date().toISOString(), ...report }, null, 1));

if (shots && !only) {
  for (const [name, o] of SPECTROGRAMS) {
    const url = await page.evaluate(([n, oo]) => window.__audioSpectrogram(n, { o: oo }), [name, o]);
    const file = `${name}${o.ko ? '-ko' : ''}.png`;
    writeFileSync(resolve(OUT, file), Buffer.from(url.split(',')[1], 'base64'));
  }
  console.log(`spectrograms: ${SPECTROGRAMS.length} PNGs in docs/design/shots/audio/`);
}
if (errors.length) console.log(`page errors:\n${errors.join('\n')}`);
await browser.close();
process.exit(report.ok && !errors.length ? 0 : 1);
