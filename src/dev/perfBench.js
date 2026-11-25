// A one-link benchmark for the player's own machine (?bench=1): stands Batman on the GCPD roof,
// then measures a few seconds of frames in each of several setups, dropping one piece of the
// frame at a time (shadow map redraws, normal-based creases, the comic effects, resolution),
// and shows a table to screenshot. Frame time against JavaScript time tells a GPU-bound machine
// (frame much longer than the script) from a CPU-bound one; draw calls show Safari's per-call
// overhead. Nothing here runs unless the URL asks for it.

const SETTLE = 1500, MEASURE = 4000;

// Fixed views for ?bench=districts: the hero is stood at each spot, the follow camera snaps behind
// him, and that camera pose is then pinned for the whole measurement, so runs compare like for
// like. New districts join this list as workstream H builds them.
export const DISTRICT_VIEWS = [
  ['gcpd roof', { x: 6, y: 42, z: 10 }, 2.6, 0.15],
  ['docks yard', { x: 0, y: 0.15, z: 178 }, 0.2, 0.15],
  ['neon street', { x: 150, y: 0, z: 10 }, 0, 0.1],
  ['ace yard', { x: 95, y: 0, z: -140 }, Math.PI, 0.15],
  ['clock plaza', { x: -62, y: 58, z: -148 }, Math.PI, 0.1],
  ['high vista', { x: -170, y: 125, z: 190 }, 2.4, 0.25],
  ['gcpd lobby', { x: 0, y: 0.2, z: 8 }, Math.PI, 0.05],
  ['funhouse', { x: -120, y: 0.2, z: -128 }, 0, 0.1],
  ['ace hall', { x: 124, y: 0.2, z: -172 }, Math.PI / 2, 0.1],
];

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const pct = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// Per district: frame time, script time, and per pass (shadow, colour, normal, ink, x-ray) the
// draw calls, triangles and GPU ms (GPU ms needs ?gputime=1 and EXT_disjoint_timer_query_webgl2).
// Results land in window.__bench ({ meta, rows }); scripts/render-bench.mjs drives this.
export async function runDistrictBench({ renderer, ink, dynRes, quality, applyResolution, state, getGame, gpuName, measureMs = 3000, settleMs = 1200, views = DISTRICT_VIEWS.filter(([n]) => !window.__benchViews || window.__benchViews.includes(n)) }) {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0, clear = 0; i < 400 && clear < 7; i++) {
    const G = getGame();
    const busy = !G || state.phase !== 'play' || G.flow.mode !== 'play' || G.comic?.playing || G.cinematic?.active;
    if (G) { G.cinematic?.active && G.cinematic.skip(); G.comic?.playing && G.comic.skip(); G.radio?.playing && G.radio.skip?.(); }
    clear = busy ? 0 : clear + 1;
    await wait(150);
  }
  const G = getGame();
  dynRes.setEnabled(false);
  applyResolution();
  const origRender = ink.render;
  let pin = null;
  // Re-apply the pinned pose right before every draw (the follow camera moves it during update).
  ink.render = function (scene, camera, ...rest) {
    // Split screen (workstream D1, P2=bot): the view list; player 1's view is the pinned one.
    const pc = Array.isArray(camera) ? camera[0]?.camera : camera;
    if (pin && pc?.isCamera) { pc.position.copy(pin.p); pc.quaternion.copy(pin.q); pc.updateMatrixWorld(); }
    return origRender.call(this, scene, camera, ...rest);
  };
  const rows = [];
  for (const [name, pos, yaw, pitch] of views) {
    pin = null;
    let hold = true;
    const keep = () => { if (!hold) return; G.hero.teleport(pos, yaw); if (G.players?.length > 1) G.flow.bringAlong({ onlyFar: 4 }); requestAnimationFrame(keep); };
    keep();
    G.follow.snapBehind(yaw, pitch);
    await wait(settleMs);
    if (G.comic?.playing) G.comic.skip();
    const cam = window.__game.camera;
    pin = { p: cam.position.clone(), q: cam.quaternion.clone() };
    await wait(300);
    const ft = [], js = [], per = {};
    for (const k of Object.keys(ink.stats.passes)) per[k] = { calls: [], tris: [], gpu: [] };
    await new Promise((resolve) => {
      let last = performance.now();
      const end = last + measureMs;
      const tick = (now) => {
        ft.push(now - last); js.push(state.stepMs ?? 0); last = now;
        for (const [k, v] of Object.entries(ink.stats.passes)) {
          if (!v.ran) continue;
          per[k].calls.push(v.calls); per[k].tris.push(v.tris);
          if (ink.stats.timing) per[k].gpu.push(v.gpu);
        }
        if (now < end) requestAnimationFrame(tick); else resolve();
      };
      requestAnimationFrame(tick);
    });
    // scripts/render-bench.mjs SHOTS=<dir> screenshots each pinned view (a Node-side binding).
    // The ink pass's boiling line and paper grain are time-keyed: hold them still for the shot.
    if (window.__benchShot) {
      ink.debug.fixedTime = 1;
      // Not mid-lightning: wait for the flash (a quarter second) to pass.
      for (let i = 0; i < 20 && ink.uniforms.uFlash.value > 0; i++) await wait(50);
      await wait(150);
      await window.__benchShot(name);
      ink.debug.fixedTime = null;
    }
    hold = false;
    const passes = {};
    let gpuSum = 0;
    for (const [k, v] of Object.entries(per)) {
      if (!v.calls.length) continue;
      passes[k] = { calls: median(v.calls), tris: median(v.tris), gpuMs: v.gpu.length ? +median(v.gpu).toFixed(3) : null };
      gpuSum += passes[k].gpuMs ?? 0;
    }
    rows.push({ name, frameMs: +median(ft).toFixed(2), meanMs: +(ft.reduce((a, b) => a + b, 0) / ft.length).toFixed(2), p95Ms: +pct(ft, 0.95).toFixed(2), scriptMs: +median(js).toFixed(2), gpuMs: ink.stats.timing ? +gpuSum.toFixed(3) : null, passes });
  }
  pin = null;
  ink.render = origRender;
  dynRes.setEnabled(true);
  applyResolution();
  const meta = { quality: quality.name, gpu: gpuName, px: [renderer.domElement.width, renderer.domElement.height], timing: ink.stats.timing, ua: navigator.userAgent };
  window.__bench = { meta, rows };
  console.log('[bench districts]', JSON.stringify(window.__bench));
  return window.__bench;
}

export function runPerfBench({ renderer, ink, dynRes, quality, applyResolution, state, getGame, gpuName }) {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:99;background:#f4ecd8;color:#0b0b12;border:3px solid #0b0b12;box-shadow:4px 4px 0 #0b0b12;padding:16px 20px;font:15px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre;max-width:92vw;overflow:auto';
  panel.textContent = 'Benchmark: getting ready...';
  document.body.appendChild(panel);

  const comicOn = { ...quality.comic };
  const comicOff = Object.fromEntries(Object.keys(quality.comic).map((k) => [k, 0]));
  const dpr = window.devicePixelRatio || 1;
  const setRes = (cap) => { quality.pixelRatioCap = cap; applyResolution(); };
  const baseCap = quality.pixelRatioCap;
  const reset = () => { ink.debug.cachedShadows = false; ink.debug.depthNormals = false; ink.setComic(comicOn); setRes(baseCap); };
  const configs = [
    ['As shipped', () => {}],
    ['Shadows cached', () => { ink.debug.cachedShadows = true; }],
    ['No outline pass', () => { ink.debug.skipNormals = true; }],
    ['Comic effects off', () => { ink.setComic(comicOff); }],
    ['Resolution 1x', () => { setRes(1); }],
    ['Resolution 1.5x', () => { setRes(1.5); }],
    ['1x + frozen + depth creases', () => { setRes(1); ink.debug.cachedShadows = true; ink.debug.depthNormals = true; }],
  ];

  // Draw calls and triangles summed over every pass of a frame.
  let calls = 0, tris = 0;
  const orig = renderer.render.bind(renderer);
  renderer.render = (s, c) => { orig(s, c); calls += renderer.info.render.calls; tris += renderer.info.render.triangles; };

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (ms) => new Promise((resolve) => {
    const ft = [], js = [], dc = [], tr = [];
    let last = performance.now(), end = last + ms;
    const tick = (now) => {
      ft.push(now - last); js.push(state.stepMs ?? 0); dc.push(calls); tr.push(tris);
      calls = 0; tris = 0; last = now;
      if (now < end) requestAnimationFrame(tick); else resolve({ ft, js, dc, tr });
    };
    calls = 0; tris = 0;
    requestAnimationFrame(tick);
  });
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1] ?? 0; };
  const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * 0.95)] ?? 0; };

  async function run() {
    // Into play, past every comic, cinematic and radio line: a comic can start a moment after a
    // cinematic ends, so play has to stay clear for a full second before measuring starts.
    for (let i = 0, clear = 0; i < 400 && clear < 7; i++) {
      const G = getGame();
      const busy = !G || state.phase !== 'play' || G.flow.mode !== 'play' || G.comic?.playing || G.cinematic?.active;
      if (G) { G.cinematic?.active && G.cinematic.skip(); G.comic?.playing && G.comic.skip(); G.radio?.playing && G.radio.skip?.(); }
      clear = busy ? 0 : clear + 1;
      await wait(150);
    }
    const G = getGame();
    const place = () => { G.hero.teleport({ x: 6, y: 42, z: 10 }, 2.6); G.follow.snapBehind(2.6, 0.15); };
    const wasDyn = dynRes.enabled;
    dynRes.setEnabled(false);
    applyResolution();
    const rows = [];
    for (const [name, apply] of configs) {
      reset();
      apply();
      place();
      panel.textContent = `Benchmark running (${rows.length + 1} of ${configs.length}): ${name}\nKeep this tab in front and don't touch anything.`;
      await wait(SETTLE);
      if (G.comic?.playing) G.comic.skip();
      const r = await frames(MEASURE);
      const fm = med(r.ft);
      rows.push({ name, fps: Math.round(1000 / fm), frame: fm, p95: p95(r.ft), js: med(r.js), calls: med(r.dc), tris: med(r.tr), px: `${renderer.domElement.width}x${renderer.domElement.height}` });
    }
    reset();
    renderer.render = orig;
    dynRes.setEnabled(wasDyn);
    applyResolution();

    const pad = (s, n) => String(s).padEnd(n);
    const lines = [
      'GOTHAM BENCHMARK  (screenshot this and send it)',
      `${navigator.userAgent.match(/(Version\/[\d.]+ Safari|Chrome\/[\d.]+|Firefox\/[\d.]+|Edg\/[\d.]+)/)?.[0] ?? 'browser?'}  GPU: ${gpuName || '?'}`,
      `screen ${innerWidth}x${innerHeight} at ${dpr}x, refresh about ${dynRes.refreshHz} Hz, quality ${quality.name}`,
      '',
      `${pad('setup', 27)}${pad('fps', 6)}${pad('frame ms', 10)}${pad('p95 ms', 9)}${pad('script ms', 11)}${pad('draws', 7)}pixels`,
      ...rows.map((r) => `${pad(r.name, 27)}${pad(r.fps, 6)}${pad(r.frame.toFixed(1), 10)}${pad(r.p95.toFixed(1), 9)}${pad(r.js.toFixed(1), 11)}${pad(r.calls, 7)}${r.px}`),
      '',
      'Click anywhere to close.',
    ];
    panel.textContent = lines.join('\n');
    console.log(lines.join('\n'));
    window.__bench = rows;
    panel.addEventListener('click', () => panel.remove());
  }
  run().catch((err) => { panel.textContent = 'Benchmark failed: ' + err.message; console.error(err); });
}
