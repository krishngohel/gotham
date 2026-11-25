// [perf3] Scene-graph inventory: objects per top-level subtree (visible / parked / matrixAutoUpdate),
// i.e. who the per-frame matrix walk and three's projectObject visit. Usage: node scripts/perf-objects.mjs <url> [--q low]
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
await p.waitForTimeout(3000);
const r = await p.evaluate(() => {
  const g = window.__game; const rows = {};
  for (const top of g.scene.children) {
    const k = (top.name || top.type).replace(/[:\-_]?[\d,.-]+$/, '');
    const row = rows[k] ??= { tops: 0, all: 0, walked: 0, auto: 0, visible: 0, autoVisibleWalk: 0 };
    row.tops++;
    const walk = (o, vis, parked) => {
      row.all++;
      const v = vis && o.visible;
      const pk = parked || (!o.visible && o.userData.parkHidden);
      if (!pk) { row.walked++; if (o.matrixAutoUpdate) row.autoVisibleWalk++; }
      if (o.matrixAutoUpdate) row.auto++;
      if (v) row.visible++;
      for (const c of o.children) walk(c, v, pk);
    };
    walk(top, true, false);
  }
  const detail = [];
  for (const top of g.scene.children) {
    if ((top.name || top.type) !== 'Group' && top.name !== '' ) continue;
    let n = 0; top.traverse(() => n++);
    const names = top.children.slice(0, 4).map((c) => c.name || c.type).join(',');
    detail.push(`${top.type} vis=${top.visible} park=${!!top.userData.parkHidden} n=${n} kids=[${names}]`);
  }
  rows.__detail = detail;
  return rows;
});
const det = r.__detail; delete r.__detail;
await b.close();
if (process.argv.includes('--detail')) console.log(det.filter((x) => +x.match(/n=(\d+)/)[1] > 3).join('\n'));
const list = Object.entries(r).sort((a, b) => b[1].walked - a[1].walked);
let tot = { all: 0, walked: 0, auto: 0, visible: 0, autoVisibleWalk: 0 };
for (const [, v] of list) for (const k in tot) tot[k] += v[k];
console.log('total', JSON.stringify(tot));
console.log('subtree'.padEnd(28), 'tops all walked autoWalked visible');
for (const [k, v] of list.slice(0, 45)) console.log(k.slice(0, 27).padEnd(28), v.tops, v.all, v.walked, v.autoVisibleWalk, v.visible);
