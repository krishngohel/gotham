// [perf3] Whole-frame render time with the GPU forced to finish (a 1-pixel readback after each
// batch), the same method as the first-boot benchmark (src/render/tierDetect.js measurePipeline).
// Needed for SwiftShader, where requestAnimationFrame keeps running while the software GPU falls
// behind (rAF frame times there say nothing about the picture). Pages one at a time, alternating.
// Usage: node scripts/pipeline-sync.mjs <urlA> <urlB> [--pairs low:low,low:potato] [--sites gcpd_roof]
//        [--weak swiftshader] [--w 1280 --h 720] [--labels old,new] [--rounds 2]
import { chromium } from 'playwright-core';
import { SITES } from './perf-matrix-sites.mjs';
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const [urlA, urlB] = argv.filter((a) => a.startsWith('http'));
const labels = opt('labels', 'A,B').split(',');
const pairs = opt('pairs', 'low:low,low:potato').split(',').map((p) => p.split(':'));
const list = SITES.filter((s) => opt('sites', 'gcpd_roof,neon_street').replace(/_/g, ' ').split(',').includes(s[0]));
const rounds = +opt('rounds', 2);
const weak = opt('weak') === 'swiftshader';
const W = +opt('w', 1280), H = +opt('h', 720);
const browser = await chromium.launch({ channel: 'msedge', args: ['--mute-audio', ...(weak ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--ignore-gpu-blocklist'])] });
async function side(base, q) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`${base}?at=toDocks&god=1&q=${q}&dynres=0&civ=0`);
  await page.waitForFunction(() => window.__game?.state?.ready && window.__game.teleport && window.__game.state.frame > 10, null, { timeout: 1800000, polling: 2000 });
  const out = {};
  for (const s of list) {
    await page.evaluate(([p, yaw, pitch]) => { const g = window.__game; g.teleport(p); g.follow.snapBehind(yaw, pitch); }, [s[1], s[2], s[3]]);
    await page.waitForTimeout(8000);
    out[s[0]] = await page.evaluate(() => {
      const g = window.__game, gl = g.renderer.getContext(), px = new Uint8Array(4), t = [];
      for (let b = -1; b < 5; b++) {
        const t0 = performance.now();
        for (let i = 0; i < 3; i++) g.ink.render(g.scene, g.camera, g.state.t);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        if (b >= 0) t.push((performance.now() - t0) / 3);
      }
      t.sort((a, b) => a - b);
      return { ms: t[t.length >> 1], renderer: (() => { const e = gl.getExtension('WEBGL_debug_renderer_info'); return String(gl.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 60); })() };
    });
  }
  await page.close();
  return out;
}
const rows = [];
for (const [qa, qb] of pairs) for (let r = 0; r < rounds; r++) {
  let A, B;
  if (r % 2) { B = await side(urlB, qb); A = await side(urlA, qa); } else { A = await side(urlA, qa); B = await side(urlB, qb); }
  for (const s of list) {
    const row = { pair: `${qa}:${qb}`, site: s[0], round: r, a: A[s[0]].ms, b: B[s[0]].ms };
    rows.push(row);
    console.log(`r${r} ${row.pair.padEnd(11)} ${s[0].padEnd(12)} ${labels[0]} ${row.a.toFixed(1)} ms  ${labels[1]} ${row.b.toFixed(1)} ms  x${(row.b / row.a).toFixed(2)}  (${A[s[0]].renderer})`);
  }
}
await browser.close();
