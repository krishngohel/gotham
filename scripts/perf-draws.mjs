// [perf3] Draw-call inventory of one frame at a fixed camera: every renderBufferDirect grouped by
// a label (the nearest named ancestor) and material, with distinct material and program counts.
// Usage: node scripts/perf-draws.mjs <url> [--q low] [--site "gcpd roof"] [--top 60] [--extra ""]
import { chromium } from 'playwright-core';
import { SITES } from './perf-matrix-sites.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const base = argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5850/';
const q = opt('q', 'low');
const site = SITES.find((s) => s[0] === opt('site', 'gcpd roof').replace(/_/g, ' '));
const b = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`${base}?at=toDocks&god=1&q=${q}&dynres=0${opt('extra', '')}`);
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 30, null, { timeout: 300000, polling: 500 });
await p.evaluate(([pos, yaw, pitch]) => { const g = window.__game; g.teleport(pos); g.follow.snapBehind(yaw, pitch); }, [site[1], site[2], site[3]]);
await p.waitForTimeout(4000);
const r = await p.evaluate(() => new Promise((res) => {
  const g = window.__game;
  const R = g.renderer;
  const orig = R.renderBufferDirect;
  const rows = [];
  const label = (o) => { let x = o, path = []; while (x && x !== g.scene && path.length < 6) { path.push(x.name || '_'); x = x.parent; } return path.join('<'); };
  let on = false;
  R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const ix = geometry.index, cnt = group ? group.count : (ix ? ix.count : geometry.attributes.position?.count ?? 0), inst = object.isInstancedMesh ? object.count : (geometry.isInstancedBufferGeometry ? geometry.instanceCount : 1);
    const tris = Math.round(Math.min(cnt, geometry.drawRange.count) / 3) * (inst === Infinity ? 1 : inst);
    if (on) rows.push({ tris, l: label(object), m: (material.name || material.type) + (material.color ? '#' + material.color.getHexString() : ''), mid: material.id, t: object.isSkinnedMesh ? 'skin' : object.isInstancedMesh ? 'inst' : object.isBatchedMesh ? 'batch' : 'mesh', target: R.getRenderTarget() ? 'rt' : 'screen', shadow: !!camera.isOrthographicCamera && camera !== g.camera });
    return orig.apply(this, arguments);
  };
  requestAnimationFrame(() => { on = true; requestAnimationFrame(() => { on = false; R.renderBufferDirect = orig; res(rows); }); });
}));
await b.close();
const by = new Map();
for (const x of r) { const k = `${x.t.padEnd(5)} ${x.l} | ${x.m}`; by.set(k, (by.get(k) ?? 0) + 1); }
const byLabel = new Map();
for (const x of r) { const k = x.l.split('<').pop().replace(/[-_:]?\d+.*$/, ''); byLabel.set(k, (byLabel.get(k) ?? 0) + 1); }
console.log(`${q} ${site[0]}: ${r.length} draws, ${new Set(r.map((x) => x.mid)).size} distinct materials`);
console.log('\n== by group ==');
for (const [k, n] of [...byLabel].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(n).padStart(5), k);
console.log('\n== by object | material ==');
for (const [k, n] of [...by].sort((a, b) => b[1] - a[1]).slice(0, +opt('top', 60))) console.log(String(n).padStart(5), k);

// [perf3] --tris: triangles per object | material, for diffing two builds.
if (process.argv.includes('--tris')) {
  const t = new Map();
  for (const x of r) { const k = x.l.split('<').slice(0, 3).join('<') + ' | ' + x.m; const e = t.get(k) ?? [0, 0]; e[0]++; e[1] += x.tris; t.set(k, e); }
  console.log('\n== triangles by object | material ==  total ' + r.reduce((a, x) => a + x.tris, 0));
  for (const [k, [n, tr]] of [...t].sort((a, b) => b[1][1] - a[1][1]).slice(0, 40)) console.log(String(tr).padStart(8), String(n).padStart(4), k);
}
