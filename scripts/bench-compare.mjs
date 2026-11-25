// Compares render-bench.mjs OUT files: per view, the median over runs of total GPU ms, the colour
// pass's GPU ms, frame ms and draw calls, and the relative change of B against A.
// Usage: node scripts/bench-compare.mjs a.json b.json [more.json...]   (MEAN=1: frame = mean, for SwiftShader runs)
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
const med = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
const load = (f) => {
  const runs = JSON.parse(readFileSync(f, 'utf8'));
  const by = {};
  for (const r of runs) for (const row of r.rows) {
    const e = (by[row.name] ??= { gpu: [], frame: [], calls: [], color: [] });
    e.gpu.push(row.gpuMs); e.frame.push(process.env.MEAN ? row.meanMs : row.frameMs);
    e.calls.push(Object.values(row.passes).reduce((s, p) => s + p.calls, 0));
    e.color.push(row.passes.color?.gpuMs ?? null);
  }
  const out = {};
  for (const [k, e] of Object.entries(by)) out[k] = { gpu: med(e.gpu), frame: med(e.frame), calls: med(e.calls), color: med(e.color), runs: e.gpu.length };
  return out;
};
const sets = files.map(load);
const pct = (a, b) => (a && b != null ? `${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(0)}%` : '');
const f2 = (v) => (v == null ? '-' : v.toFixed(2));
console.log(`${'view'.padEnd(13)}${files.map((f, i) => `| ${String.fromCharCode(65 + i)}: gpu  color frame calls `).join('')}| B vs A gpu / frame`);
for (const name of Object.keys(sets[0])) {
  const cells = sets.map((s) => { const r = s[name]; return r ? `| ${f2(r.gpu).padStart(5)} ${f2(r.color).padStart(5)} ${f2(r.frame).padStart(5)} ${String(r.calls).padStart(5)} ` : '| (none)                 '; });
  const a = sets[0][name], b = sets[1]?.[name];
  console.log(`${name.padEnd(13)}${cells.join('')}| ${b ? `${pct(a.gpu, b.gpu)} / ${pct(a.frame, b.frame)}` : ''}`);
}
const tot = (s, k) => Object.values(s).reduce((acc, r) => acc + (r[k] ?? 0), 0);
console.log('sum over views:', sets.map((s, i) => `${String.fromCharCode(65 + i)} gpu ${tot(s, 'gpu').toFixed(2)} frame ${tot(s, 'frame').toFixed(2)}`).join('  '), sets[1] ? `B vs A gpu ${pct(tot(sets[0], 'gpu'), tot(sets[1], 'gpu'))} frame ${pct(tot(sets[0], 'frame'), tot(sets[1], 'frame'))}` : '');
