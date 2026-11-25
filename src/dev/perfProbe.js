// [perf2] Measurement-only frame profiler and ablation switches. Nothing here loads unless the URL
// asks for it (game.js imports this module only for ?prof=1 or ?off=...).
//
// ?prof=1  wraps the update method of every big system (the game's, the world's, the renderer's)
//          in a performance.now() scope, and per frame records: JS ms per system, draw calls and
//          triangles per pass, visible skinned meshes, DOM mutations, long tasks (> 50 ms, from
//          idle callbacks and timers too), heap growth. Read with window.__prof.report() (medians,
//          means, p95 over the frames since the last window.__prof.reset()).
// ?off=a,b disables one system each, for A/B measurement only (never a player setting): see OFF.
//
// It wraps methods from the outside (obj[method] = timed(obj[method])) so the frame loop and the
// systems themselves are untouched; with neither flag it is never even imported.

const now = () => performance.now();

// name -> [path from window.__game, method]. Paths that do not resolve are skipped (a system
// that is not built this run, an older build).
const SCOPES = [
  ['game', '@run', 'update'],
  ['hero', 'hero', 'update'], ['hero.cape', 'hero', 'updateCape'],
  ['combat', 'combat', 'update'], ['civilians', 'civilians', 'update'],
  ['vehicles', 'vehicles', 'update'], ['batwing', 'batwing', 'update'], ['nightwing', 'nightwing', 'update'],
  ['gadgets', 'gadgets', 'update'], ['stealth', 'stealth', 'update'], ['stealthFx', 'stealthFx', 'update'],
  ['interiors', 'interiors', 'update'], ['side', 'side', 'update'], ['bruce', 'bruce', 'update'],
  ['follow', 'follow', 'update'], ['cinematic', 'cinematic', 'update'], ['chainFx', 'chainFx', 'update'],
  ['comicFx', 'comicFx', 'update'], ['boss', 'boss', 'update'], ['bosses', 'bosses', 'update'],
  ['gfx', 'gfx', 'update'], ['swarmFx', 'swarmFx', 'update'], ['wayne', 'wayne', 'update'],
  ['breakables', 'breakables', 'update'], ['nav', 'nav', 'update'], ['finale', 'finale', 'update'],
  ['roof', 'roof', 'update'], ['flow', 'flow', 'update'],
  ['coop', 'coop', 'lateUpdate'], ['coop.pre', 'coop', 'beforeCombat'], ['coop.post', 'coop', 'afterCombat'],
  ['world', 'world', 'update'], ['world.env', 'world.env', 'update'], ['world.traffic', 'world.traffic', 'update'],
  ['world.chunks', 'world.chunks', 'cull'], ['world.halos', 'world.halos', 'update'], ['world.sky', 'world.sky', 'update'],
  ['world.rain', 'world.rain', 'update'], ['world.lights', 'world.lightPool', 'update'], ['world.shadows', 'world.shadows', 'update'],
  ['world.signal', 'world.signal', 'update'],
  ['render', 'ink', 'render'], ['render.matrices', 'scene', 'updateMatrixWorld'],
  ['audio', 'audio', 'update'],
  // [perf3] systems merged since round 1
  ['wanted', 'wanted', 'update'], ['sandbox', 'sandbox', 'update'], ['moves', 'moves', 'update'],
  ['abilities', 'abilities', 'update'], ['radio', 'radio', 'update'], ['encounters', 'encounters', 'update'],
  ['trophies', 'trophies', 'update'], ['photo', 'photo', 'update'], ['prompts', 'prompts', 'update'],
];
// Objects whose every method counts as one system (the HUD's many small per-frame writes).
const WHOLE = [['hud', 'hud'], ['hud', 'stealthHud'], ['hud', 'wheelUi']];

// ?off= switches. Each takes (g) and turns one system off for measurement: its update becomes a
// no-op and/or its drawn objects hide. 'hide' lists scene-object name prefixes to hide every frame.
const OFF = {
  traffic: { noop: [['world.traffic', 'update']], hide: ['traffic-', 'signalHeads', 'signalLenses'] },
  civilians: { noop: [['civilians', 'update']], hide: ['civilian:', 'crowdImpostors'] },
  el: { hide: ['elCar', 'elTrain'] },
  weather: { noop: [['world.rain', 'update']], hide: ['rain'], run: (g) => { g.world.rain.mesh.visible = false; } },
  sky: { noop: [['world.sky', 'update']] },
  shadows: { run: (g) => { g.ink.debug.cachedShadows = true; } },
  mrt: { run: (g) => { g.ink.debug.depthNormals = true; } },
  inkfx: { run: (g) => { g.ink.setComic({ wobble: 0, hatch: 0, midDots: 0, skyDots: 0, colorEdges: 0, misreg: 0, palette: 0, paper: 0 }); } },
  minimap: { noop: [['nav', 'update']], css: '.minimap,.mm,[class*="minimap"]{display:none!important}' },
  nav: { noop: [['nav', 'update']] },
  openworld: { noop: [['side', 'update']] },
  crimes: { noop: [['side', 'update']] },
  hud: { css: '#hud,.hud{display:none!important}', whole: ['hud', 'stealthHud'] },
  halos: { noop: [['world.halos', 'update']], hideType: 'Points' },
  audio: { noop: [['audio', 'update']] },
  cape: { noop: [['hero', 'updateCape']] },
  vehicles: { noop: [['vehicles', 'update']] },
  farlod: { run: (g) => { if (g.scene.userData.farScene) g.scene.userData.farScene.visible = false; } },
  bruce: { noop: [['bruce', 'update']] },
  lobby: { hide: ['gcpdLobby'] },
  hulls: { pred: (o) => !!o.material?.userData?.outline },
  skinned: { pred: (o) => o.isSkinnedMesh },
  xray: { run: (g) => { setInterval(() => { g.state.detectiveOn = false; }, 100); } },
  boats: { hide: ['police_launch', 'speedboat', 'quayTug', 'tour_boat'] },
};

function resolve(g, path, run = null) {
  if (path === '@run') return run;
  if (!path) return g;
  let o = g;
  for (const k of path.split('.')) { o = o?.[k]; if (o == null) return null; }
  return o;
}

export function createPerfProbe({ params, getGame, getRun = () => null }) {
  const profOn = params.get('prof') === '1';
  const offList = (params.get('off') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const acc = Object.create(null);    // name -> ms accumulated this frame
  const frames = [];                  // records: { ms: {name: ms}, c: {counter: n} }
  let depth = Object.create(null);    // name -> re-entrancy depth (only the outermost call counts)
  let domWrites = 0, longTasks = [], attachedTo = null, lastHeap = 0, heapUp = 0;
  const counters = Object.create(null);

  function timed(fn, name) {
    if (fn.__perfProbe) return fn;
    const w = function (...a) {
      if (depth[name]) return fn.apply(this, a);
      depth[name] = 1;
      const t0 = now();
      try { return fn.apply(this, a); } finally { depth[name] = 0; acc[name] = (acc[name] ?? 0) + (now() - t0); }
    };
    w.__perfProbe = true;
    return w;
  }

  // Counters sampled at most every 10th frame (a scene walk is not free).
  let sampleN = 0;
  function sample(g) {
    const passes = g.ink?.stats?.passes;
    if (passes) {
      let calls = 0, tris = 0;
      for (const [k, v] of Object.entries(passes)) { if (!v.ran) continue; counters[`calls.${k}`] = v.calls; counters[`tris.${k}`] = v.tris; calls += v.calls; tris += v.tris; }
      counters.calls = calls; counters.tris = tris;
    }
    counters.gpuMs = g.ink?.gpuMs ?? null;
    counters.stepMs = g.state?.stepMs ?? null;
    if (sampleN++ % 10 === 0) {
      let objects = 0, autoMat = 0, skinned = 0, skinnedVis = 0, meshesVis = 0, lights = 0, matrixWalk = 0;
      const walk = (o, vis, parked = false) => {
        objects++;
        if (o.matrixAutoUpdate) autoMat++;
        const v = vis && o.visible;
        // [perf3] What inkPipeline's updateMatrices visits: it skips a hidden parkHidden subtree
        // whole (the count used to keep counting the children of one).
        parked = parked || (!o.visible && !!o.userData.parkHidden);
        if (!parked) matrixWalk++;
        if (v && o.isPointLight && o.intensity > 0) lights++;
        if (o.isSkinnedMesh) { skinned++; if (v) skinnedVis++; }
        else if (o.isMesh && v) meshesVis++;
        for (const c of o.children) walk(c, v, parked);
      };
      walk(g.scene, true);
      Object.assign(counters, { objects, autoMat, skinned, skinnedVis, meshesVis, lights, matrixWalk, programs: g.renderer?.info.programs?.length ?? 0, geometries: g.renderer?.info.memory.geometries ?? 0, textures: g.renderer?.info.memory.textures ?? 0 });
    }
    const mem = performance.memory?.usedJSHeapSize;
    if (mem) { if (mem > lastHeap) heapUp += mem - lastHeap; lastHeap = mem; }
  }

  function commit(g) {
    sample(g);
    const ms = Object.create(null);
    for (const k in acc) { ms[k] = acc[k]; acc[k] = 0; }
    frames.push({ ms, c: { ...counters, dom: domWrites, heapUp } });
    domWrites = 0; heapUp = 0;
    if (frames.length > 20000) frames.splice(0, 10000);
  }

  function hideByName(g, prefixes, type, pred) {
    const list = [];
    g.scene.traverse((o) => { if ((prefixes && prefixes.some((p) => o.name?.startsWith(p))) || (type && o[`is${type}`]) || (pred && pred(o))) list.push(o); });
    return list;
  }

  function attach(g) {
    if (attachedTo === g) return;
    attachedTo = g;
    if (profOn) {
      for (const [name, path, method] of SCOPES) {
        const o = resolve(g, path, getRun());
        if (o && typeof o[method] === 'function') o[method] = timed(o[method], name);
      }
      for (const [name, path] of WHOLE) {
        const o = resolve(g, path);
        if (!o) continue;
        for (const k of Object.keys(o)) if (typeof o[k] === 'function') o[k] = timed(o[k], name);
      }
      // Each partner's hero (co-op) counts under hero too.
      for (const pl of g.players ?? []) if (pl.hero && pl.hero !== g.hero && typeof pl.hero.update === 'function') pl.hero.update = timed(pl.hero.update, 'hero');
      const render = g.ink.render;
      g.ink.render = function (...a) { const r = render.apply(this, a); commit(g); return r; };
    }
    const hidden = [];
    for (const key of offList) {
      const o = OFF[key];
      if (!o) { console.warn(`[perf] unknown ?off=${key}`); continue; }
      for (const [path, method] of o.noop ?? []) { const t = resolve(g, path); if (t && typeof t[method] === 'function') t[method] = () => {}; }
      for (const path of o.whole ?? []) { const t = resolve(g, path); if (t) for (const k of Object.keys(t)) if (typeof t[k] === 'function') t[k] = () => {}; }
      if (o.hide || o.hideType || o.pred) hidden.push(() => hideByName(g, o.hide, o.hideType, o.pred));
      if (o.css) document.head.appendChild(Object.assign(document.createElement('style'), { textContent: o.css }));
      o.run?.(g);
    }
    if (hidden.length) {
      // Systems re-show their objects as they update: hide again each frame, after the update.
      let lists = [];
      const refresh = () => { lists = hidden.map((f) => f()).flat(); };
      refresh();
      setInterval(refresh, 1000);
      const render = g.ink.render;
      g.ink.render = function (...a) { for (const x of lists) x.visible = false; return render.apply(this, a); };
    }
    console.info(`[perf] probe attached${profOn ? ' (prof)' : ''}${offList.length ? ` off=${offList.join(',')}` : ''}`);
  }

  if (profOn) {
    try { new MutationObserver((recs) => { domWrites += recs.length; }).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); } catch { /* fine */ }
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longTasks.push({ t: e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: false }); } catch { /* not supported */ }
  }
  // Attach once a run exists (the game object gets its systems when a run begins).
  const poll = () => { const g = getGame(); if (g?.hero && g.ink && g.world) attach(g); if (attachedTo !== g || !g?.hero) requestAnimationFrame(poll); else setTimeout(poll, 500); };
  requestAnimationFrame(poll);

  const stat = (a) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    const mean = a.reduce((x, y) => x + y, 0) / a.length;
    return { med: +s[s.length >> 1].toFixed(3), mean: +mean.toFixed(3), p95: +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(3) };
  };
  const api = {
    get on() { return profOn; },
    off: offList,
    reset() { frames.length = 0; longTasks = []; },
    // Summary over the frames since the last reset.
    report() {
      const names = new Set(), cnames = new Set();
      for (const f of frames) { for (const k in f.ms) names.add(k); for (const k in f.c) cnames.add(k); }
      const systems = {}, counts = {};
      for (const n of names) systems[n] = stat(frames.map((f) => f.ms[n] ?? 0));
      for (const n of cnames) { const v = frames.map((f) => f.c[n]).filter((x) => typeof x === 'number'); if (v.length) counts[n] = stat(v); }
      return { frames: frames.length, systems, counts, longTasks: longTasks.map((t) => +t.ms.toFixed(1)) };
    },
  };
  window.__prof = api;
  return api;
}
