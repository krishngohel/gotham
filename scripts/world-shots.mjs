// Fixed-camera screenshots of the city, for proving that render-side work (chunking, LOD, the
// region framework) leaves the core city looking the same. Time is frozen (traffic, rain, steam,
// blinking halos, lightning and the ink's boiling line all hold still), so two runs of the same
// build differ only by GPU noise.
//
//   node scripts/world-shots.mjs shoot <baseUrl> <outDir> [high|low]
//        writes <outDir>/<shot>.png and <outDir>/stats.json (draw calls and triangles per
//        renderer.render call = per pass, plus a median frame time with vsync off)
//   node scripts/world-shots.mjs diff <beforeDir> <afterDir> [diffDir]
//        per shot: % of pixels whose largest channel difference is over 24/255, and the mean
//        absolute difference; writes red-on-grey diff images to diffDir when given
//
// The committed reference set (docs/design/shots/world/before) is WebP quality 85 to keep the
// repo small (FORMAT=webp when shooting). When one side is WebP and the other PNG, the diff
// re-encodes the PNG the same way first: the encoder is deterministic, so identical renders still
// diff to exactly zero. Two shoots of the same build diff to 0.00 % (verified).
//
// Env: ONLY=<comma list of shot names>; FRAMES=<n> frames timed per shot (default 90);
//      HEADED=1 opens a visible window.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

// [name, camera position, look-at target]. Every district at street level and from a roof, the
// whole city from above, two interiors, and the north edge (where the river and the new strip
// start: this one is expected to change once the proof region exists).
export const SHOTS = [
  ['gcpd-roof', [6, 44.5, 14], [-30, 38, -60]],
  ['gcpd-street', [-8, 1.7, 40], [0, 8, 0]],
  ['neon-street', [150, 1.7, 75], [150, 6, 0]],
  ['neon-roof', [120, 32, 10], [180, 18, 90]],
  ['docks-yard', [0, 1.7, 178], [-80, 6, 175]],
  ['docks-roof', [-60, 18, 182], [40, 8, 120]],
  ['ace-yard', [95, 1.7, -135], [160, 10, -175]],
  ['clock-plaza', [-62, 1.7, -108], [-62, 30, -160]],
  ['clock-arena', [-62, 60, -150], [60, 30, -40]],
  ['city-street', [-30, 1.7, 30], [-200, 5, 30]],
  ['overview-south', [0, 140, 300], [0, 0, -40]],
  ['overview-nw', [-260, 110, -260], [40, 0, 40]],
  ['interior-funhouse', [-120, 2.2, -128], [-120, 3, -170]],
  ['interior-acehall', [120, 2.2, -172], [160, 4, -172]],
  ['north-edge-roof', [0, 50, -200], [0, 15, -420]],
  ['north-edge-street', [-30, 1.7, -215], [-30, 4, -330]],
  // The proof region (river, bridges, Lower Gotham's two decks, the first Loop row, the El).
  ['river-bridge', [-30, 1.7, -228], [-30, 14, -330]],
  ['river-walk', [-110, -2.8, -270], [40, -4, -262]],
  ['river-aerial', [150, 55, -205], [-40, -2, -275]],
  ['lower-deck', [-20, -3.9, -288], [90, -4.6, -292]],
  ['upper-deck', [70, 1.7, -296], [-110, 4, -292]],
  ['loop-el-street', [-130, 1.7, -357], [40, 7, -358]],
  ['loop-roof', [-60, 76, -325], [120, 52, -335]],
  ['overview-north', [10, 150, -80], [0, 10, -330]],
  // t 32: the east bridge (x -30) stands fully raised (regions/bascules.js schedule).
  ['bridge-raised', [-62, 9, -226], [-30, 6, -262], { t: 32 }],
  // Workstream H: the Loop rows 2-5, the El, Gotham Mile (3 street, 2 roof views per district).
  ['loop-canyon', [-150, 1.7, -412], [-150, 45, -560]],
  ['loop-wayne-plaza', [28, 1.7, -414], [0, 70, -449]],
  ['loop-marquee', [-22, 1.9, -534], [8, 6.5, -552]],
  ['loop-el-platform', [-95, 10.3, -474], [-91, 9.5, -425]],
  ['loop-tower-roof', [-125, 98, -505], [60, 80, -420]],
  ['loop-wayne-crown', [45, 150, -395], [0, 172, -449]],
  ['mile-boulevard', [150, 1.7, -604], [150, 12, -720]],
  ['mile-iceberg', [78, 1.7, -593], [60, 12, -616]],
  ['mile-diamond', [12, 1.7, -652], [-6, 5, -664]],
  ['mile-roof', [215, 106, -598], [100, 30, -720]],
  ['mile-pumping', [150, 26, -655], [187, 22, -683]],
  ['mile-church', [2, 1.8, -704], [0, 26, -735]],
  ['loop-overview', [140, 190, -300], [-40, 20, -520]],
  // t 40: an outer-loop train stands at Lafayette (the El's north leg) beside Marquee Row.
  ['loop-el-train', [45, 13, -524], [5, 9, -541], { t: 40 }],
  ['loop-cityhall', [149, 2, -463], [178, 16, -449]],
  // The east side (workstream H2): Robinson Park, Lakeshore Drive, Museum Campus, the pier, Arkham.
  ['east-fountain', [294, 1.7, -420], [294, 6, -470]],
  ['east-park-roof', [250, 40, -330], [300, 0, -560]],
  ['east-lsd', [345, 1.7, -560], [350, 3, -380]],
  ['east-viaduct', [420, 25, -200], [370, 0, -300]],
  ['east-mirror', [262, 1.7, -560], [290, 5, -580]],
  ['east-conservatory', [294, 1.7, -705], [294, 12, -752]],
  ['east-museum', [300, 1.7, 75], [294, 10, 125]],
  ['east-campus-roof', [250, 45, 60], [330, 0, 220]],
  ['east-pier', [392, 4.7, -452], [520, 15, -450]],
  ['east-pier-aerial', [340, 70, -380], [520, 10, -460]],
  ['east-undercroft', [420, 1.6, -467], [520, 1, -467]],
  ['east-arkham', [440, 30, -60], [650, 15, -80]],
  ['east-arkham-yard', [640, 7, -60], [700, 10, -100]],
  ['east-lake-horizon', [366, 6, -450], [900, 0, -450]],
  ['east-shell', [300, 1.7, -612], [300, 8, -660]],
  ['east-avenue', [246, 1.7, -500], [246, 5, -650]],
  ['east-fountain-aerial', [330, 30, -425], [294, 0, -470]],
  ['east-lsd-south', [345, 1.7, -60], [345, 3, 60]],
  ['east-statue-garden', [266, 1.7, -98], [294, 3, -130]],
  ['east-aquarium', [294, 1.7, 132], [294, 8, 162]],
  ['east-planetarium', [318, 1.7, 214], [336, 8, 258]],
  ['east-marina', [250, 3, 203], [280, 0, 240]],
  ['east-penny-dino', [300, 1.7, 76], [275, 3, 88]],
  ['east-wheel-up', [446, 7, -441], [446, 40, -450]],
  ['east-funhouse', [522, 4.7, -440], [536, 8, -454]],
  ['east-pavilion', [568, 4.7, -440], [611, 8, -450]],
  ['east-coaster', [470, 26.5, -460], [560, 10, -466]],
  ['east-arkham-gate', [560, 6, -80], [620, 12, -80]],
  ['east-arkham-roof', [640, 24, -130], [700, 10, -40]],
  ['east-arkham-tower', [600, 20, -40], [622, 30, -80]],
  ['east-greenhouse', [690, 6.7, -8], [712, 8, -28]],
  ['east-lighthouse', [600, 8, -560], [712, 15, -600]],
  ['east-lock', [340, 3, -250], [380, 1, -255]],
  ['east-lake-arkham', [420, 10, -200], [650, 5, -80]],
  // Workstream H3, the west side: river branches + quay, the Narrows, Park Row, Chinatown + Little
  // Odessa, the Yards (3 street-level and 2 roof/aerial cameras per district at least).
  ['west-quay-street', [-262, 1.7, -60], [-250, 6, -140]],
  ['west-quay-walk', [-269.5, -2.8, 20], [-270, -3, -80]],
  ['west-branch-aerial', [-236, 46, -190], [-283, -2, -330]],
  ['west-locks', [-246, 14, 222], [-283, -2, 172]],
  ['west-fork', [-250, 2, -232], [-300, 6, -300]],
  ['narrows-street', [-370, 1.7, -300], [-370, 8, -360]],
  ['narrows-alley', [-340, 1.7, -432], [-340, 6, -470]],
  ['narrows-riverside', [-308, 1.7, -470], [-320, 8, -540]],
  ['narrows-roof', [-345, 24, -540], [-397, 26, -445]],
  ['narrows-aerial', [-250, 80, -380], [-370, 0, -420]],
  ['narrows-wolfpoint', [-286, 3, -228], [-334, 30, -270]],
  ['narrows-glide', [-334, 62, -250], [-370, 10, -400]],
  ['parkrow-street', [-460, 1.7, -312], [-460, 6, -400]],
  ['parkrow-orpheum', [-472, 1.7, -287], [-480, 8, -318]],
  ['parkrow-crimealley', [-490, 1.7, -302], [-490, 3, -345]],
  ['parkrow-viaduct', [-536, 1.7, -296], [-546, 6, -340]],
  ['parkrow-roof', [-478, 19, -328], [-540, 8, -420]],
  ['parkrow-aerial', [-430, 70, -250], [-520, 0, -420]],
  ['chinatown-gate', [-300, 1.7, -146], [-345, 7, -150]],
  ['chinatown-jade', [-347, 1.7, -153], [-440, 6, -150]],
  ['chinatown-market', [-449, 1.7, -120], [-380, 3, -120]],
  ['chinatown-roof', [-340, 18, -80], [-420, 8, -170]],
  ['chinatown-aerial', [-300, 70, -20], [-440, 0, -140]],
  ['odessa-street', [-520, 1.7, -40], [-520, 6, -130]],
  ['odessa-church', [-462, 1.7, -146], [-490, 12, -182]],
  ['yards-gate', [-520, 1.7, -48], [-520, 6, -20]],
  ['yards-steel', [-385, 1.7, 5], [-418, 20, 30]],
  ['yards-rail', [-470, 1.7, 124], [-540, 4, 124]],
  ['yards-silos', [-308, 1.7, 100], [-340, 25, 30]],
  ['yards-roundhouse', [-500, 6, 180], [-545, 4, 168]],
  ['yards-aerial', [-290, 90, 240], [-450, 0, 60]],
  // Workstream H (city north): Bristol and Wayne Manor, Blackgate, traffic.
  ['bristol-manor-drive', [-318, 20.2, -752], [-395, 26, -746]],
  ['bristol-manor-aerial', [-310, 62, -665], [-400, 22, -742]],
  ['bristol-cliff-lake', [-372, 1.9, -646], [-395, 9, -697]],
  ['bristol-village', [-52, 2.6, -680], [-160, 7, -676]],
  ['bristol-overlook', [-216, 17.5, -768], [-20, 0, -330]],
  ['bristol-cemetery', [-506, 19.9, -737], [-550, 19, -757]],
  ['bristol-lane', [-300, 2.6, -621], [-200, 3, -617]],
  ['bristol-glide', [-150, 45, -620], [-330, 15, -720]],
  ['blackgate-from-docks', [92, 1.8, 194], [140, 9, 380]],
  ['blackgate-causeway', [84, 2.1, 282], [121, 7, 352]],
  ['blackgate-aerial', [236, 58, 306], [140, 4, 382]],
  ['blackgate-yard', [172, 3.9, 381], [118, 9, 381]],
  ['blackgate-wall', [106, 11.9, 357], [178, 9, 404]],
  ['blackgate-landing', [212, 3.2, 392], [180, 6, 378]],
  ['traffic-core-street', [-27, 1.7, 60], [-30, 3, -120]],
  ['traffic-loop-signals', [-36, 2.2, -440], [-30, 5, -500]],
  ['blimp', [190, 108, -95], [248, 118, -151]],
  // [polish] worldfix: the causeway mouth, the West Line beyond the Loop, rooftop camera checks.
  ['causeway-mouth', [90, 1.7, 178], [89, 0.5, 215]],
  ['causeway-mouth-high', [104, 14, 186], [88, 0, 206]],
  ['westline-street', [-382, 1.7, -476], [-300, 9, -481]],
  ['westline-narrows-stn', [-342, 1.8, -466], [-372, 9, -477]],
  ['westline-parkrow-stn', [-496, 1.8, -492], [-522, 9, -480]],
  ['westline-aerial', [-330, 70, -400], [-450, 4, -485]],
  ['westline-aerial-west', [-600, 60, -420], [-420, 4, -485]],
  ['pier-foot', [352, 1.8, -447], [386, 2.5, -451]],
  ['ramp-turn-east', [372, 9, -312], [356, 0, -288]],
  ['westline-platform', [-395, 10.3, -483], [-340, 9.5, -483]],
  // [polish] city landmarks: Wayne Tower from other districts (far silhouette + crown), the
  // Iceberg Lounge entrance, Odessa's domes, Bristol's gorge, the river walk at the water.
  ['wayne-from-gcpd', [6, 44.5, 14], [0, 120, -449]],
  ['wayne-from-bristol', [-216, 17.5, -768], [0, 110, -449]],
  ['wayne-from-park', [300, 40, -520], [0, 120, -449]],
  ['wayne-from-narrows', [-334, 62, -250], [0, 110, -449]],
  ['wayne-crown-close', [40, 175, -410], [0, 176, -449]],
  ['wayne-monogram', [34, 150, -402], [0, 153, -449]],
];

const FIXED_T = 12.3;
const WEBP_Q = 85;

async function shoot(base, out, q = 'high') {
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const frames = Number(process.env.FRAMES ?? 90);
  const b = await chromium.launch({
    channel: 'msedge', headless: !process.env.HEADED,
    args: ['--mute-audio', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
  });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // [polish] TIME=<0-24> and WEATHER=<state> pin the clock and weather (day/night pairs).
  const extra = (process.env.TIME ? `&time=${process.env.TIME}` : '') + (process.env.WEATHER ? `&weather=${process.env.WEATHER}` : '');
  await page.goto(`${base.replace(/\/$/, '')}/?q=${q}&dynres=0${extra}`);
  await page.waitForFunction(() => window.__game?.state?.ready, null, { timeout: 180000 });
  await page.addStyleTag({ content: 'body > *:not(canvas){display:none!important} canvas{cursor:none}' });
  const gpu = await page.evaluate((FIXED_T) => {
    const G = window.__game;
    const r = G.renderer;
    // Freeze the world: fixed time, no lightning, and dt 0 except one "kick" frame per shot so
    // the light pool re-sorts to the new camera (traffic moves the same amount every run).
    const up = G.world.update;
    G.world.update = (t, dt, focus, camera, hero) => {
      const s = window.__shotPose;
      if (s) { camera.position.set(...s.pos); camera.lookAt(...s.at); camera.updateMatrixWorld(); }
      const kick = window.__shotKick; window.__shotKick = false;
      const r = up(window.__shotT ?? FIXED_T, kick ? 0.21 : 0, camera.position, camera, hero);
      // Rain drops are seeded with Math.random (and the world shows rain again when the camera
      // leaves a covered deck): keep them hidden, they are not city geometry.
      if (G.world.rain?.mesh) G.world.rain.mesh.visible = false;
      return r;
    };
    // Rain drops are seeded with Math.random: hide them, they are not city geometry.
    if (G.world.rain?.mesh) G.world.rain.mesh.visible = false;
    const setFlash = G.world.setFlash;
    G.world.setFlash = () => setFlash(0);
    const render = r.render.bind(r);
    r.render = (s, c) => {
      render(s, c);
      window.__passLog?.push({ target: r.getRenderTarget() ? 'rt' : 'screen', calls: r.info.render.calls, tris: r.info.render.triangles });
    };
    const inkRender = G.ink.render;
    G.ink.render = (s, c) => {
      G.ink.uniforms.uFlash.value = 0;
      window.__passLog = [];
      inkRender(s, c, window.__shotT ?? FIXED_T);
      window.__lastPasses = window.__passLog;
      window.__passLog = null;
    };
    const gl = r.getContext();
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : '?';
  }, FIXED_T);
  // PRE=<js>: run in the page before shooting (A/B experiments, e.g. hiding one system).
  if (process.env.PRE) await page.evaluate(process.env.PRE);
  const stats = { gpu, q, shots: {} };
  const frameTimes = (n) => page.evaluate((n) => new Promise((res) => {
    const dts = []; let last = performance.now();
    const f = (now) => { dts.push(now - last); last = now; if (dts.length < n) requestAnimationFrame(f); else res(dts.slice(3)); };
    requestAnimationFrame(f);
  }), n);
  for (const [name, pos, at, opt = {}] of SHOTS) {
    if (only && !only.includes(name)) continue;
    await page.evaluate(([pos, at, t]) => { window.__shotPose = { pos, at }; window.__shotKick = true; window.__shotT = t; }, [pos, at, opt.t ?? null]);
    await frameTimes(8);
    await page.waitForTimeout(400);
    await frameTimes(4);
    const png = await page.locator('canvas').screenshot();
    if (process.env.FORMAT === 'webp') await sharp(png).webp({ quality: WEBP_Q }).toFile(join(out, `${name}.webp`));
    else writeFileSync(join(out, `${name}.png`), png);
    const passes = await page.evaluate(() => window.__lastPasses);
    const dts = frames ? await frameTimes(frames) : [];
    const sorted = [...dts].sort((a, b) => a - b);
    stats.shots[name] = {
      passes,
      calls: passes.reduce((s, p) => s + p.calls, 0),
      tris: passes.reduce((s, p) => s + p.tris, 0),
      medianMs: sorted.length ? +sorted[sorted.length >> 1].toFixed(2) : null,
      p95Ms: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(2) : null,
    };
    console.log(name.padEnd(20), `calls ${String(stats.shots[name].calls).padStart(5)}`, `tris ${String(stats.shots[name].tris).padStart(8)}`,
      `passes [${passes.map((p) => `${p.calls}/${p.tris}`).join(' ')}]`, `median ${stats.shots[name].medianMs} ms`);
  }
  stats.errors = errors;
  writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 1));
  if (errors.length) console.log('page errors:', errors.slice(0, 10));
  console.log('gpu:', gpu);
  await b.close();
}

async function raw(file, asWebp = false) {
  let input = file;
  if (asWebp && file.endsWith('.png')) input = await sharp(file).webp({ quality: WEBP_Q }).toBuffer();
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

async function diff(beforeDir, afterDir, diffDir) {
  if (diffDir) mkdirSync(diffDir, { recursive: true });
  const find = (dir, name) => ['.png', '.webp'].map((e) => join(dir, name + e)).find((p) => existsSync(p));
  const names = readdirSync(beforeDir).filter((f) => /\.(png|webp)$/.test(f)).map((f) => f.replace(/\.(png|webp)$/, ''));
  const rows = [];
  for (const name of names) {
    const f = name + '.png';
    const fa = find(beforeDir, name), fc = find(afterDir, name);
    if (!fc) { rows.push([f, 'missing']); continue; }
    const mixed = fa.endsWith('.webp') !== fc.endsWith('.webp');
    const a = await raw(fa, mixed), c = await raw(fc, mixed);
    if (a.w !== c.w || a.h !== c.h) { rows.push([f, 'size differs']); continue; }
    const n = a.w * a.h;
    let over = 0, sum = 0;
    const img = diffDir ? Buffer.alloc(n * 3) : null;
    for (let i = 0; i < n; i++) {
      const d = Math.max(Math.abs(a.data[i * 3] - c.data[i * 3]), Math.abs(a.data[i * 3 + 1] - c.data[i * 3 + 1]), Math.abs(a.data[i * 3 + 2] - c.data[i * 3 + 2]));
      sum += d;
      if (d > 24) over++;
      if (img) {
        const g = (a.data[i * 3] + a.data[i * 3 + 1] + a.data[i * 3 + 2]) / 9;
        img[i * 3] = d > 24 ? 255 : g; img[i * 3 + 1] = d > 24 ? 40 : g; img[i * 3 + 2] = d > 24 ? 40 : g;
      }
    }
    if (img) await sharp(img, { raw: { width: a.w, height: a.h, channels: 3 } }).png().toFile(join(diffDir, f));
    rows.push([f, `${((over / n) * 100).toFixed(2)}% px over 24/255`, `mean |d| ${(sum / n).toFixed(2)}`]);
  }
  for (const r of rows) console.log(r[0].padEnd(28), ...r.slice(1));
  const statsA = join(beforeDir, 'stats.json'), statsB = join(afterDir, 'stats.json');
  if (existsSync(statsA) && existsSync(statsB)) {
    const A = JSON.parse(readFileSync(statsA, 'utf8')).shots, B = JSON.parse(readFileSync(statsB, 'utf8')).shots;
    console.log('\nshot                   calls before→after   tris before→after        median ms before→after');
    for (const k of Object.keys(A)) {
      if (!B[k]) continue;
      console.log(k.padEnd(22), `${A[k].calls}→${B[k].calls}`.padEnd(20), `${A[k].tris}→${B[k].tris}`.padEnd(24), `${A[k].medianMs}→${B[k].medianMs}`);
    }
  }
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'shoot') await shoot(rest[0] ?? 'http://localhost:5330', rest[1] ?? 'docs/design/shots/world/after', rest[2]);
else if (mode === 'diff') await diff(rest[0], rest[1], rest[2]);
else console.log('usage: node scripts/world-shots.mjs shoot <baseUrl> <outDir> [high|low] | diff <beforeDir> <afterDir> [diffDir]');
