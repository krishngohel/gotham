// Draws the pedestrian simulation (pedSim.js) with a level-of-detail pyramid (workstream M):
//
//   near   full skinned figures (src/actors/civilians/figure.js: one skinned mesh + an ink hull,
//          two draws) for the closest people, up to the tier's budget (potato 12 .. ultra 64);
//          hull outlines only within quality.hullDistance; animation every frame within
//          quality.animFullRate, every 2nd / 4th frame further out (accumulated dt), skipped
//          off screen. Shared skeleton and clip set, so one clip binds to everyone.
//   far    one instanced billboard per person in the impostor crowd (impostors.js: ONE draw for
//          the whole far crowd), painted from the same palette so a person keeps their colours.
//   beyond nothing drawn (they still walk, so the streets are right when you get there).
// Figures are cached by "cast member" (type + one of a dozen faces per type), built at most one
// per frame, and reused as people come and go; the frame cost stays flat however busy the street.
import * as THREE from 'three';
import { civilianSpec, figureFromSpec, prepareFromSpec } from '../actors/civilians/generator.js';
import { createImpostorCrowd } from '../actors/civilians/impostors.js';
import { loadCivAnims } from '../actors/animPacks.js';
import { createProp } from '../heroes/models/props.js';
import { ARCHETYPES, CROWD_TIERS } from './archetypes.js';
import { REACTION_CLIP } from './reactions.js';

const CAST = 12; // faces per figure type
const CUTS = 3; // cuts of clothes per figure type (each cut is one geometry template, ~50 ms to make)
const BASE_WALK = 'Walk_Loop';

// Strips the forward drift from a loco clip's pelvis track so it walks in place, and returns the
// clip's natural ground speed (m/s) so the simulation moves the body at exactly that speed (no
// foot sliding). Pure apart from the clip it rewrites.
export function inPlace(clip) {
  const tr = clip.tracks.find((t) => t.name === 'pelvis.position');
  if (!tr || tr.values.length < 6) return 0;
  const v = tr.values, n = v.length / 3, dur = clip.duration || tr.times[n - 1] || 1;
  const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
  for (let i = 0; i < n; i++) {
    const k = (tr.times[i] - tr.times[0]) / Math.max(1e-6, tr.times[n - 1] - tr.times[0]);
    v[i * 3] -= dx * k; v[i * 3 + 2] -= dz * k;
  }
  // The skeleton's units: the shared bodies are in metres with a 1 m hip height (characters.js).
  return Math.hypot(dx, dz) / dur;
}

// A cast member: one of CUTS cuts (shape) with its own face, colours and height (palette).
// Faces sharing a cut share the cached geometry, so a new face costs a skeleton and a colour buffer.
const specFor = (key) => {
  const [type, k] = key.split(':');
  const th = type.length * 17 + type.charCodeAt(0);
  const face = Number(k);
  const base = civilianSpec(9000 + (face % CUTS) * 131 + th, { type });
  const look = civilianSpec(20000 + face * 977 + th, { type, body: base.body });
  return { ...base, palette: { ...look.palette }, height: look.height, width: look.width };
};
// The cast warmed first, most common types first: every cut of every type once, within the
// tier's figure budget.
const TYPES = ['casual', 'office', 'coat', 'hoodie', 'tourist', 'worker', 'police', 'vendor', 'nurse', 'chef'];
function warmList(budget) {
  const out = [];
  for (let c = 0; c < CUTS; c++) for (const t of TYPES) if (out.length < budget) out.push(`${t}:${c}`);
  return out;
}

// [perf2] The figure templates (the expensive part of a crowd figure: draped clothes, the painted
// body, ~50 ms each here and several times that on a weak CPU) for the tier's warm cast, built on
// the title screen, where a long idle callback costs nothing anyone sees: one whole template per
// idle callback while busy() is false (the title, the menus). Whatever is not done when play
// starts, the run's crowd builds in small slices (createCrowd's pump). Templates are a module
// cache, so this only fills it.
export function warmCrowdTemplates({ assets, tierName, busy = () => false }) {
  const keys = warmList((CROWD_TIERS[tierName] ?? CROWD_TIERS.high).full + 8);
  if (typeof requestIdleCallback !== 'function') return;
  const next = (deadline) => {
    if (!keys.length || busy()) return;
    if (deadline.timeRemaining() > 4 || deadline.didTimeout) {
      try { for (const _ of prepareFromSpec(assets, specFor(keys.shift()))) { /* whole template */ } } catch (err) { console.warn('[civilians] warm', err); return; }
    }
    requestIdleCallback(next, { timeout: 500 });
  };
  requestIdleCallback(next, { timeout: 500 });
}

export function createCrowd({ scene, assets, quality, sim, tier, cameras }) {
  const impostors = createImpostorCrowd({ capacity: Math.max(64, tier.impostors) });
  impostors.mesh.name = 'crowdImpostors';
  scene.add(impostors.mesh);
  const clipSpeed = new Map();
  const clips = new Map(assets.clips);
  let ready = false;
  const civAssets = { ...assets, clips };
  loadCivAnims({ base: assets.base ?? './assets/' }).then((pack) => {
    for (const [name, clip] of pack.clips) {
      const c = clip.clone();
      const d = pack.data?.[name];
      if (d?.kind === 'loco') clipSpeed.set(name, inPlace(c) || 1.2);
      clips.set(name, c);
    }
    ready = true;
  }).catch((err) => { console.warn('[civilians] anims_civ failed; base clips only', err); ready = true; });

  // Figures: cast key -> { ch, key, agent, umbrella }.
  const cache = new Map();
  const free = [];
  const live = new Array(sim.agents.length).fill(null); // agent index -> figure
  const imp = new Int32Array(sim.agents.length).fill(-1);
  const order = [];
  const dist = new Float32Array(sim.agents.length);
  const camPos = [new THREE.Vector3(), new THREE.Vector3()];
  const frustum = new THREE.Frustum(), m4 = new THREE.Matrix4(), sphere = new THREE.Sphere(new THREE.Vector3(), 1.2);
  const frusta = [new THREE.Frustum(), new THREE.Frustum()];
  let nCams = 0, frame = 0, built = 0, builtNow = false;
  const stats = { active: 0, full: 0, impostors: 0, built: 0, ms: 0, animated: 0, stepMaxMs: 0 };

  const typeOf = (a) => { const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker; return A.types[a.seed % A.types.length]; };
  const castKey = (a) => `${typeOf(a)}:${(a.seed * 7) % CAST}`;
  const specs = new Map(); // cast key -> spec (pure data, cheap)
  const spec = (key) => { let s = specs.get(key); if (!s) specs.set(key, s = specFor(key)); return s; };

  function build(key) {
    const tb = performance.now();
    const sp = spec(key);
    const ch = figureFromSpec(civAssets, sp);
    ch.root.name = `civilian:${key}`;
    ch.root.userData.parkHidden = true; // [perf2] pooled while hidden: no matrix updates (inkPipeline)
    ch.civilian = true;
    // An umbrella, held overhead (a stand-in: there is no umbrella walk clip; see anim-manifest).
    const um = createProp('umbrella', { open: true, color: [0x1a1a22, 0x6a1a2a, 0x22344e, 0x2e3b33][key.length % 4] });
    um.rotation.x = -Math.PI / 2;
    um.position.set(0.12, 1.58, 0.12);
    um.visible = false;
    ch.root.add(um);
    scene.add(ch.root);
    stats.built = ++built;
    stats.buildMs = performance.now() - tb;
    return { ch, key, umbrella: um, clip: null, acc: 0, agent: -1 };
  }
  function release(i) {
    const f = live[i];
    if (!f) return;
    live[i] = null;
    f.agent = -1;
    f.ch.root.visible = false;
    free.push(f);
  }
  // A figure for agent i: its own cast member if free, else build one (budgeted), else recycle.
  // Never builds during a frame: a missing figure is queued for the idle-time builder and the
  // person stays a billboard until it exists.
  function acquire(i, a) {
    const key = castKey(a);
    for (let k = free.length - 1; k >= 0; k--) {
      if (free[k].key === key) { const f = free[k]; free.splice(k, 1); return f; }
    }
    if (cache.size + wanted.length < budget && !wanted.includes(key)) { wanted.push(key); pump(); }
    // A free figure of the same type takes this person's colours (same cut family, new face).
    const type = key.slice(0, key.indexOf(':'));
    for (let k = free.length - 1; k >= 0; k--) {
      const f = free[k];
      if (f.key.startsWith(type + ':') && cache.size + wanted.length >= budget) {
        free.splice(k, 1);
        f.ch.setPalette(spec(key).palette);
        f.key = key;
        return f;
      }
    }
    return null;
  }
  // Idle-time builder, never inside a frame. [perf2] A figure used to be built whole in one idle
  // callback (25-55 ms; and with no idle time the 400 ms timeout ran it anyway, a visible hitch
  // every 0.4 s until the cast was complete). Now its template is built a slice at a time
  // (figure.js prepareFigure: one draped garment, the body paint, one part per step), a few
  // milliseconds per callback, and the figure itself (a skeleton clone and a colour buffer) in a
  // callback of its own.
  const budget = tier.full + 8;
  const wanted = [];
  let pumping = false, job = null;
  const idle = typeof requestIdleCallback === 'function' ? (fn) => requestIdleCallback(fn, { timeout: 150 }) : (fn) => setTimeout(() => fn({ timeRemaining: () => 16, didTimeout: true }), 30);
  // [perf3] A share-of-time cap on top of the idle callbacks: building may take at most DUTY of
  // the wall clock (a token bucket, at most BURST ms in one go). With no frame cap there is no
  // real idle time between frames, and the builder took 20 % of the CPU for the first 15-30 s of
  // a session that skipped the title (scripts/perf.mjs, ?at=): the whole frame-rate gap to the old
  // build in the first seconds. Templates warmed on the title screen are not affected.
  const DUTY = 0.08, BURST = 8;
  let tokens = BURST, tokenT = performance.now();
  const refill = () => { const n = performance.now(); tokens = Math.min(BURST, tokens + (n - tokenT) * DUTY); tokenT = n; };
  function pump() {
    if (pumping || (!wanted.length && !job)) return;
    pumping = true;
    refill();
    if (tokens < 2) { setTimeout(() => { pumping = false; pump(); }, Math.ceil((2 - tokens) / DUTY)); return; }
    idle((deadline) => {
      pumping = false;
      refill();
      if (!job) {
        if (!wanted.length || cache.size >= budget) { wanted.length = 0; return; }
        if (deadline.timeRemaining() < 2 && !deadline.didTimeout) { pump(); return; }
        const key = wanted.shift();
        job = { key, gen: prepareFromSpec(civAssets, spec(key)), ready: false };
      }
      const t0 = performance.now();
      const slice = Math.min(tokens, deadline.didTimeout ? 3 : Math.max(2, Math.min(8, deadline.timeRemaining() - 1)));
      if (!job.ready) {
        while (performance.now() - t0 < slice) {
          const s0 = performance.now();
          const done = job.gen.next().done;
          stats.stepMaxMs = Math.max(stats.stepMaxMs, performance.now() - s0);
          if (done) { job.ready = true; break; }
        }
      } else {
        const f = build(job.key);
        job = null;
        f.ch.root.visible = false;
        cache.set(`${f.key}#${cache.size}`, f);
        free.push(f);
      }
      tokens -= performance.now() - t0;
      pump();
    });
  }
  // Warm the cast from the start: every cut of every type once, most common types first, within
  // the tier's budget (templates warmCrowdTemplates already built on the title are reused).
  wanted.push(...warmList(budget));
  pump();

  function clipFor(a) {
    const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker;
    const r = a.reaction;
    if (a.mode === 'flee' || (r === 'flee' && (a.mode === 'cross'))) return ok('Civ_PanicRun', BASE_WALK);
    if (a.mode === 'respond') return ok('Civ_Jog', BASE_WALK);
    if (a.mode === 'walk' || a.mode === 'cross' || (a.mode === 'spot' && a.legT < a.legLen)) {
      if (a.umbrella) return ok('Civ_Walk_Carry', BASE_WALK);
      return ok(A.walks[a.walkClip % A.walks.length], BASE_WALK);
    }
    if (a.mode === 'react' && REACTION_CLIP[r]) return ok(REACTION_CLIP[r], 'Idle_Loop');
    if (a.mode === 'act' || a.mode === 'spot') {
      const act = a.act;
      if (act === 'phone') return ok(a.seed % 2 ? 'Civ_Phone_M' : 'Civ_Phone_F', 'Idle_Loop');
      if (act === 'talk') return ok(a.seed % 3 ? 'Civ_Idle_Happy' : 'Civ_Argue', 'Idle_Loop'); // [polish] Civ_Chat leans over a water cooler: people bent double in the street
      if (act === 'photo') return ok('Civ_Texting', 'Idle_Loop');
      if (act === 'window') return ok('Civ_Idle_Look', 'Idle_Loop');
      if (act === 'sit') return ok('Civ_Sit', 'Idle_Loop');
      if (act === 'loiter') return ok(a.seed % 2 ? 'Civ_Lean_Wall' : A.idles[a.idleClip % A.idles.length], 'Idle_Loop');
    }
    return ok(A.idles[a.idleClip % A.idles.length], 'Idle_Loop');
  }
  const ok = (name, fallback) => (clips.has(name) ? name : fallback);

  // Natural speed for a fresh agent's walk (the sim moves it at exactly that speed).
  function speedOf(a) {
    const A = ARCHETYPES[a.arch] ?? ARCHETYPES.walker;
    const name = a.umbrella ? 'Civ_Walk_Carry' : A.walks[a.walkClip % A.walks.length];
    return (clipSpeed.get(name) ?? 1.15) * (0.94 + 0.12 * ((a.seed * 0.618) % 1));
  }

  const api = {
    stats,
    impostors,
    get ready() { return ready; },
    update(dt) {
      const t0 = performance.now();
      frame++;
      // Views: cameras (one per local player's view, or the main camera).
      const cams = cameras();
      nCams = Math.min(2, cams.length);
      for (let c = 0; c < nCams; c++) {
        const cam = cams[c];
        camPos[c].copy(cam.position);
        m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
        frusta[c].setFromProjectionMatrix(m4);
      }
      // Distances, and the near candidates sorted by distance.
      order.length = 0;
      const agents = sim.agents;
      let act = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.active) { if (live[i]) release(i); if (imp[i] >= 0) { impostors.remove(imp[i]); imp[i] = -1; } continue; }
        act++;
        if (a.fresh || a.speedSet !== a.seed) { a.speedSet = a.seed; sim.setSpeed(a, speedOf(a)); }
        let d = Infinity;
        for (let c = 0; c < nCams; c++) { const p = camPos[c]; const q = Math.hypot(p.x - a.x, (p.y - a.y) * 0.5, p.z - a.z); if (q < d) d = q; }
        dist[i] = d;
        if (d < tier.fullRadius) order.push(i);
        else if (live[i]) release(i);
      }
      order.sort((p, q) => dist[p] - dist[q]);
      let full = 0, builds = 0;
      for (let k = 0; k < order.length; k++) {
        const i = order[k];
        if (full >= tier.full) { if (live[i]) release(i); continue; }
        if (!live[i] && ready) {
          const f = acquire(i, agents[i]);
          builtNow = false;
          if (f) { live[i] = f; f.agent = i; f.clip = null; f.acc = 0; f.ch.root.visible = true; if (builtNow) builds++; }
        }
        if (live[i]) full++;
      }
      // Pose the full figures.
      let animated = 0;
      const hullD = quality.hullDistance ?? 40, fullRate = quality.animFullRate ?? 35;
      for (let i = 0; i < agents.length; i++) {
        const f = live[i];
        if (!f) continue;
        const a = agents[i];
        const ch = f.ch;
        ch.root.position.set(a.x, a.y, a.z);
        ch.face(a.yaw);
        f.umbrella.visible = a.umbrella && a.mode !== 'flee' && a.mode !== 'respond' && a.reaction !== 'cower';
        ch.setOutline(dist[i] < hullD);
        const want = clipFor(a);
        if (want !== f.clip) {
          const loop = !['Civ_Point', 'Civ_Cheer', 'Civ_Wave', 'Civ_Scared'].includes(want);
          try { ch.animator.play(want, { fade: f.clip ? 0.25 : 0, once: !loop }); } catch { /* clip missing: keep the last */ }
          f.clip = want;
        }
        // Walk clips play at the speed the sim moves them; panic and jog a bit faster.
        const sp = clipSpeed.get(want);
        if (sp && (a.mode === 'walk' || a.mode === 'cross' || a.mode === 'flee' || a.mode === 'respond')) ch.animator.mixer.timeScale = Math.min(2.2, a.speed / sp);
        else ch.animator.mixer.timeScale = 1;
        // Animation LOD: every frame near, then every 2nd / 4th frame; off screen not at all.
        f.acc += dt;
        sphere.center.set(a.x, a.y + 1, a.z);
        let onScreen = false;
        for (let c = 0; c < nCams; c++) if (frusta[c].intersectsSphere(sphere)) onScreen = true;
        const every = dist[i] < fullRate ? 1 : dist[i] < fullRate * 1.6 ? 2 : 4;
        if (onScreen && (frame + i) % every === 0) {
          if (dist[i] < 12) ch.animator.update(f.acc); else ch.animator.mixer.update(f.acc);
          f.acc = 0;
          animated++;
        }
      }
      // Impostors for everyone visible past the full figures, within the draw radius.
      let nImp = 0;
      for (let i = 0; i < agents.length; i++) {
        const a = agents[i];
        if (!a.active) continue;
        const show = !live[i] && dist[i] < tier.drawRadius && nImp < tier.impostors;
        if (show) {
          if (imp[i] < 0) { const s = spec(castKey(a)); imp[i] = impostors.add(s.palette, s.cut); }
          const s = spec(castKey(a));
          impostors.set(imp[i], a.x, a.y, a.z, 1.78 * (s.height ?? 1), 0.85);
          nImp++;
        } else if (imp[i] >= 0) { impostors.remove(imp[i]); imp[i] = -1; }
      }
      stats.active = act; stats.full = full; stats.impostors = nImp; stats.animated = animated;
      stats.ms = stats.ms * 0.9 + (performance.now() - t0) * 0.1;
    },
    // Hides everything (indoors scenes, cutscenes that own the street).
    setVisible(on) {
      impostors.mesh.visible = on;
      for (const f of cache.values()) if (f.agent >= 0) f.ch.root.visible = on;
    },
    // The full figure drawing agent i (tests, the photo mode), or null.
    figureOf(i) { return live[i]?.ch ?? null; },
  };
  return api;
}
