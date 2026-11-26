// The open world (workstream J3, [world-content]): the city director, crime system v2, fear and
// reputation in the street, open-world stealth, side chains, detective cases, collectibles,
// trials and the post-game contracts, behind one factory. Side content (src/game/sideContent.js)
// creates it and calls update() once a frame on the host. See docs/design/openworld.md.
import './save.js';
import './collect/tracker.js';
import './tracker.js';
import { SITES } from '../world/mapData.js';
import { REGION_SITES, REGION_CRIME_SPOTS, districtAt as districtAtData } from '../world/regions/data.js';
import { SCENES } from '../game/scenes.js';
import { CRIME_SPOTS } from '../game/crimes.js';
import { createCityDirector, governor, storyHold } from './director.js';
import { createGeo } from './geo.js';
import { createCrimeRuntime } from './crimeRuntime.js';
import { createChaseAdapter } from './chaseAdapter.js';
import { createStealthEncounters } from './stealth/runtime.js';
import { encounterById } from './stealth/encounters.js';
import { createCases } from './cases/runtime.js';
import { createCaseBoard } from './cases/board.js';
import { createCollectibles } from './collect/runtime.js';
import { createChains } from './chains/runtime.js';
import { createMarkers } from '../story/markers.js';
import { createOwPanel } from './ui/owHud.js';
import { registerOpenWorldTabs } from './ui/batcomputer.js';
import { MOOD_BARKS } from './lines.js';
import { typeDuration, holdDuration } from '../ui/radioQueue.js';
import { createGoon } from '../actors/characters.js';
import { readyObjects } from '../render/prewarm.js';
import { DISTRICT_LABEL } from '../world/regions/data.js';

export const ALL_SPOTS = [...CRIME_SPOTS, ...REGION_CRIME_SPOTS];
const spotIndex = new Map(ALL_SPOTS.map((s) => [s.id, s]));

export function createOpenWorld(deps) {
  const { events, rng, progress, flow, encounters, combat, world, players, hud, ui: sideUi, state = {}, quality = { name: 'high' } } = deps;
  const store = progress.openworld;
  const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const markers = deps.markers ?? (deps.scene ? createMarkers(deps.scene) : { place: () => null, color() {}, flash() {}, release() {} });
  const list = () => players?.list ?? [deps.hero ? { id: 0, slot: 0, hero: deps.hero, input: deps.input } : null].filter(Boolean);
  const site = (id) => {
    if (!id) return null;
    if (typeof id === 'object') return id;
    return REGION_SITES[id] ?? SITES[id] ?? spotIndex.get(id) ?? null;
  };
  let missionHold = false;

  // ---------------------------------------------------------------- the context (context.js)
  const ow = {
    events, rng, progress, store, save: deps.save, quality,
    scene: deps.scene, assets: deps.assets, collision: deps.collision, world, encounters, combat, stealth: deps.stealth, bosses: deps.bosses, flow, hud, markers,
    players: list,
    heroes: () => list().map((p) => p.hero).filter((h) => h && !h.dead),
    detective: (p) => (p.slot === 0 ? !!state.detectiveOn : !!p.rig?.detectiveOn),
    pressed: (p, a) => !!p.input?.pressed?.(a),
    site, spotById: (id) => spotIndex.get(id) ?? (site(id) ? { id, district: districtAtData(site(id).x, site(id).z), yaw: 0, ...site(id) } : null),
    districtAt: (x, z) => world?.districtAt?.(x, z) ?? districtAtData(x, z),
    hour: () => world?.clock?.hour ?? 23,
    weather: () => world?.weather?.state ?? 'clear',
    difficulty: () => deps.getDifficulty?.() ?? 'normal',
    ui: {
      radio: (t, x, ms) => sideUi?.radio(t, x, ms),
      toast: (t, x, ms) => sideUi?.toast(t, x, ms),
      hint: (x, ms) => sideUi?.hint(x, ms),
      hintFor: (p, x, ms) => hud?.forPlayer?.(p)?.hint?.(x, ms) ?? sideUi?.hint(x, ms),
    },
    // Radio lines; the promise resolves when these lines have had their time (the radio's own
    // promise waits for the whole queue, which other systems may keep topping up).
    say: (lines) => {
      const q = deps.radio?.say?.(lines) ?? Promise.resolve();
      const ms = 400 + (lines ?? []).reduce((n, l) => n + (typeDuration(l.text ?? '') + holdDuration(l.text ?? '')) * 1000, 0);
      return Promise.race([q, new Promise((r) => setTimeout(r, ms))]);
    },
    bark: (text, pos, speaker = 'goon') => events.emit('bark', { text, speaker, pos: pos ? { x: pos.x, y: pos.y, z: pos.z } : null, channel: 'world' }),
    dispatch: (text, district) => events.emit('dispatch', { kind: 'generic', district: DISTRICT_LABEL[district] ?? district, text }),
    // Rewards (L1 grants them): 'kind:name' ids through the story's reward event, each unlock
    // once per save (store.rewards); xp ids repeat.
    reward(ids, meta = {}) {
      for (const id of ids ?? []) {
        const key = id.replace(':', '.');
        const once = !id.startsWith('xp:');
        if (once && store.rewards.includes(key)) continue;
        if (once) store.rewards.push(key);
        events.emit('storyReward', { id, night: 'side', mission: meta.id ?? null, source: meta.source ?? 'openworld' });
      }
    },
    xp: (amount, source = 'openworld') => { if (amount > 0) events.emit('storyReward', { id: `xp:${Math.round(amount)}`, night: 'side', source }); },
    busy: () => storyBusy(),
    storyHeld: () => storyHeld(), // [m23]
    teleport: (p) => { const h = deps.hero; if (!h) return; const g = deps.collision?.groundBelow?.(p.x, (p.y ?? 0) + 4, p.z, 0.3); h.teleport({ x: p.x, y: g > -Infinity ? g : p.y ?? 0, z: p.z }, p.yaw ?? h.bat?.yaw ?? 0); if (list().length > 1) flow?.bringAlong?.(); },
    registerScenes: (map) => { for (const [k, fn] of Object.entries(map)) if (!SCENES[k]) SCENES[k] = () => fn(); },
    playScene: (name) => flow?.playScene?.(name) ?? Promise.resolve(),
    comic: (pages) => deps.comic?.play?.(pages) ?? Promise.resolve(),
    winFight: deps.winFight,
  };
  const geo = createGeo({ graph: world?.streetGraph, roofs: world?.roofs ?? [], el: world?.el ?? world?.regions?.find?.((r) => r.id === 'loop')?.el ?? null, bridges: world?.bridges, rng });
  ow.geo = geo;

  // ---------------------------------------------------------------- systems
  const director = createCityDirector({ store, rng, spots: ALL_SPOTS });
  const chase = createChaseAdapter({ vehicles: deps.vehicles, events });
  const stepType = () => flow?.objectives?.step?.type ?? null;
  const crimes = createCrimeRuntime(ow, {
    director, geo, chase, quality: quality.name, avoid: () => flow?.target ?? null, stepType,
    extraBlocked: () => !!(stealthEnc.active || collect.busy),
  });
  const stealthEnc = createStealthEncounters(ow);
  const cases = createCases(ow);
  const collect = createCollectibles(ow, { devContracts: params.get('contracts') === '1' });
  const chains = createChains(ow, { crimes, stealthEnc, cases, bossDeps: deps.bossDeps ?? null });
  const board = typeof document !== 'undefined' ? createCaseBoard({ root: document.body, cases, onClose: () => deps.modal?.close?.() }) : null;

  // A case reaching its reconstruction opens the board (the game pauses while it is up).
  events.on('caseStage', ({ stage }) => { if (stage === 'reconstruct' && board && !board.isOpen) { deps.modal?.open?.(); board.open(); } });
  // A case's confrontation: a fight at its place, or a crime of its type (a chain's is the chain's).
  events.on('caseConfront', ({ id, spec, pos }) => {
    if (spec?.kind === 'fight') {
      const fid = `case:${id}`;
      const n = Math.max(3, Math.round(spec.budget ?? 4));
      const waves = [Array.from({ length: n }, (_, i) => ({ type: i === 0 ? 'knife' : 'grunt', dx: Math.sin(i * 1.9) * 5, dz: Math.cos(i * 1.9) * 5 }))];
      const off = events.on('fightDone', (d) => { if (d.id === fid) { off(); cases.confrontDone(true); } });
      encounters.begin(fid, { site: pos, radius: 16, gang: spec.gang ?? 'joker', waves });
    } else if (spec?.kind === 'crime') {
      const c = crimes.spawnNow({ type: spec.type ?? 'dealBust', spot: { id: `case:${id}`, district: ow.districtAt(pos.x, pos.z), yaw: 0, ...pos }, life: 1e6 });
      if (!c) { cases.confrontDone(true); return; }
      c.forcedFocus = true;
      const off = events.on('crimeEnd', (d) => { if (d.id === c.id) { off(); cases.confrontDone(d.outcome === 'stopped'); } });
    }
  });

  // ---------------------------------------------------------------- reputation persistence
  const rep = combat?.reputation;
  if (rep && store.rep) {
    rep.add('points', store.rep.value - rep.value);
    Object.assign(rep.gangs, store.rep.gangs);
  }
  // ---------------------------------------------------------------- civilians follow the mood
  deps.civilians?.setDensityScale?.((d, hour) => ((hour >= 19 || hour < 6) ? director.densityScale(d) : 1));

  // ---------------------------------------------------------------- hostages for boss beats
  const hostagePool = [];
  ow.hostages = (pts, truth) => {
    if (!deps.assets) return;
    while (pts && hostagePool.length < pts.length) { const g = createGoon(deps.assets, { type: 'civilian', rng }); readyObjects(g.root); deps.scene.add(g.root); g.root.visible = false; hostagePool.push(g); }
    hostagePool.forEach((g, i) => {
      const p = pts?.[i];
      g.root.visible = !!p;
      if (p) { g.root.position.set(p.x, p.y, p.z); g.animator.play(truth === 'all' || i === truth ? 'Crouch_Idle_Loop' : 'Idle_Loop', { fade: 0.2 }); }
    });
  };
  // A hostage room's hostages (the Narrows clinic) kneel in the yard while the encounter runs.
  events.on('stealthEncounterStart', ({ id }) => { const e = encounterById(id); if (e?.hostages?.length) ow.hostages(e.hostages, 'all'); });
  for (const ev of ['stealthEncounterDone', 'stealthEncounterFailed']) events.on(ev, () => ow.hostages(null));

  // ---------------------------------------------------------------- the story's say
  function storyBusy() {
    const mode = flow?.mode ?? 'play';
    if (mode !== 'play') return true;
    const st = stepType();
    return ['fight', 'boss', 'cutscene'].includes(st) || !!deps.challengeActive?.() || !!deps.bosses?.active && !chains.active;
  }
  // [m23] A main story beat is in play (director.js storyHold): nothing of the open world's starts
  // or announces itself on top of it. One check, used by the governor (crimes, walking into a
  // predator encounter), the predator encounters' "nearby" hint and the side chains' start markers.
  function storyHeld() {
    const step = flow?.objectives?.step ?? null;
    const target = flow?.target ?? null;
    let d = Infinity;
    if (target) for (const h of ow.heroes()) d = Math.min(d, Math.hypot(h.pos.x - target.x, h.pos.z - target.z));
    return storyHold({ mode: flow?.mode ?? 'play', hasStep: !!step && !flow?.objectives?.done, stepType: step ? (step.type ?? 'reach') : null, targetDist: d });
  }
  function gov() {
    const st = stepType();
    const target = flow?.target ?? null;
    return governor({
      mode: flow?.mode ?? 'play', stepType: st, freeRoam: !target || st === 'credits' || st === 'nightEnd',
      challenge: !!deps.challengeActive?.(), photo: !!deps.photoActive?.(),
      mission: !!(chains.active || stealthEnc.active || collect.busy || cases.active?.stage === 'confront'),
      sinceStep: crimes.sinceStep, quality: quality.name, story: storyHeld(),
    });
  }

  // ---------------------------------------------------------------- HUD (per local player)
  const panels = new Map();
  let hudT = 0, barkT = 30, repT = 0, nearT = 1;
  function panelFor(p) {
    if (!p.local && p.local !== undefined) return null;
    let pn = panels.get(p);
    const root = hud?.forPlayer?.(p)?.el ?? hud?.el;
    if (!root) return null;
    if (!pn || pn.root !== root) { pn?.panel.remove(); pn = { root, panel: createOwPanel(root) }; panels.set(p, pn); }
    return pn.panel;
  }
  function jobFor(p) {
    const h = p.hero.pos;
    const t = collect.trial;
    if (t) return { title: t.name, text: t.kind === 'arena' ? `Score ${t.score ?? 0}  x${t.multiplier ?? 1}` : `Checkpoint ${(t.next ?? 0) + 1} of ${t.total ?? '?'}`, timer: `${t.t.toFixed(1)}s`, meter: t.total ? (t.next ?? 0) / t.total : null, tone: 'ok' };
    const s = stealthEnc.active;
    if (s) { const hh = stealthEnc.hud?.() ?? {}; return { title: s.title, text: hh.text ?? (s.seen ? 'They know you are here.' : 'Unseen. Keep it that way.'), timer: `${s.t.toFixed(0)}s`, meter: null, tone: s.seen ? 'bad' : 'ok' }; }
    const cs = cases.active;
    if (cs && cs.stage !== 'solved') { const hh = cases.hud(); return { title: hh.title, text: hh.text, meter: hh.meter ?? null, label: (hh.stage ?? '').toUpperCase(), tone: 'ok' }; }
    const c = crimes.nearest(h, 140);
    if (c?.materialized && c.obj.hud) {
      const hh = c.obj.hud();
      if (hh) return { title: c.title, text: hh.text, meter: hh.meter ?? null, label: hh.label ?? '', tone: hh.tone ?? 'ok', timer: hh.timer ?? null, dial: hh.dial ?? null };
    }
    const m = chains.active;
    if (m) return { title: m.title, text: 'Side mission', meter: null, tone: 'ok' };
    return null;
  }
  function drawHud() {
    for (const p of list()) {
      const pn = panelFor(p);
      if (!pn) continue;
      const job = jobFor(p);
      pn.job(job);
      const h = p.hero.pos;
      const rows = [];
      for (const c of crimes.live) {
        if (!c.discovered) continue;
        const d = Math.hypot(c.pos.x - h.x, c.pos.z - h.z);
        if (d > 450) continue;
        rows.push({ title: c.title.split(' ')[0] === 'Civilian' ? 'Civilian cornered' : c.title.replace(/ (in|on|at|down|outside|up) .*$/, ''), where: DISTRICT_LABEL[c.district] ?? c.district, dist: d });
      }
      rows.sort((a, b) => a.dist - b.dist);
      pn.list(rows.slice(0, 3));
    }
  }

  // ---------------------------------------------------------------- per frame (host)
  let lastDistrict = null;
  function update(dt) {
    const g = gov();
    crimes.update(dt, g);
    stealthEnc.update(dt);
    cases.update(dt);
    if (!storyBusy()) collect.update(dt);
    chains.update(dt);
    for (const g of hostagePool) if (g.root.visible) g.animator.update(dt);
    markers.update?.(dt);
    hudT -= dt;
    const dial = crimes.focus?.obj?.leaves?.some((l) => l.kind === 'defuse' && l.active);
    if (hudT <= 0) { hudT = dial ? 0.06 : 0.25; drawHud(); }
    // The city talks: a bark now and then from the district's mood, a thank-you where it's safe.
    barkT -= dt;
    if (barkT <= 0) {
      barkT = 35 + rng.next() * 30;
      const p0 = list()[0]?.hero;
      if (p0 && !p0.dead && g.spawn) {
        const d = ow.districtAt(p0.pos.x, p0.pos.z);
        const mood = director.mood(d);
        const lines = MOOD_BARKS[mood];
        if (lines && (mood !== 'calm' || rng.next() < 0.3)) ow.bark(lines[Math.floor(rng.next() * lines.length)], { x: p0.pos.x + 6, y: p0.pos.y, z: p0.pos.z + 4 }, 'civilian');
        if (d !== lastDistrict) { lastDistrict = d; events.emit('districtEnter', { district: d, mood, heat: director.heat(d) }); }
      }
    }
    repT -= dt;
    if (repT <= 0 && rep) { repT = 10; store.rep = rep.toJSON(); }
    // Walking into an unplayed predator encounter's yard in free roam starts it there (2 Hz).
    nearT -= dt;
    if (nearT <= 0) { nearT = 0.5; if (g.spawn && !storyBusy() && !flow?.objectives?.step?.quiet /* [m67] a story step marked quiet: no open-world predator encounter starts under it */ && !chains.active && !cases.active && !collect.busy && !stealthEnc.active && !crimes.focus) stealthEnc.engageNear(14); }
  }

  // ---------------------------------------------------------------- Batcomputer
  const api = {
    ow, director, crimes, stealthEnc, cases, collect, chains, board, geo, store, progress,
    modal: deps.modal ?? null, // [m67] the pause-for-an-overlay pair the case board uses (story caseboard steps)
    update,
    get governor() { return gov(); },
    headline: () => deps.civilians?.headline?.() ?? '',
    completion() {
      const out = collect.districtCompletion();
      for (const e of stealthEnc.list()) { const r = (out[e.district] ??= { done: 0, total: 0, parts: {} }); r.total += 1; if (e.played) r.done += 1; }
      for (const c of cases.list()) { const r = (out[c.district] ??= { done: 0, total: 0, parts: {} }); r.total += 1; if (c.solved) r.done += 1; }
      return out;
    },
    async startFromComputer(kind, id) {
      const b = typeof window !== 'undefined' ? window.__game?.bruce : null;
      if (b?.indoors) { if (b.state?.identity === 'bruce') b.becomeBatman?.(); await b.leaveTo?.('batcaveMouth'); }
      if (kind === 'chain') chains.start(id);
      else if (kind === 'stealth') stealthEnc.start(id);
      else if (kind === 'case') { cases.start(id); const p = cases.scenePos?.(id); if (p) ow.teleport(p); }
      else if (kind === 'trial') collect.startTrial(id);
      else if (kind === 'contract') collect.startContract();
    },
    // The story's side hooks.
    holdStory: () => crimes.holdStory() || chains.holdStory() || !!stealthEnc.active,
    marker: () => chains.marker() ?? (cases.active ? cases.marker() : null) ?? crimes.marker(),
    onRespawn(opts) { const p = chains.onRespawn(); if (!chains.active) crimes.onRespawn(opts); return p; },
    // Dev / soak: run the director and every live crime for `seconds` of game time, no player input.
    soak(seconds = 1200, dt = 0.25) {
      const stats = { spawned: 0, maxLive: 0, ended: 0, errors: 0 };
      const offA = events.on('crimeSpawn', () => { stats.spawned += 1; });
      const offB = events.on('crimeEnd', () => { stats.ended += 1; });
      for (let t = 0; t < seconds; t += dt) {
        try { update(dt); } catch (e) { stats.errors += 1; console.error(e); }
        stats.maxLive = Math.max(stats.maxLive, crimes.live.length);
      }
      offA(); offB();
      return { ...stats, live: crimes.live.length, props: crimes.propStats(), enemies: combat?.enemies?.length ?? 0, cap: gov().cap };
    },
  };
  ow.startFromComputer = api.startFromComputer;
  registerOpenWorldTabs(api);
  if (params.get('crime')) crimes.force({ type: params.get('crime'), spotId: params.get('spot') });
  return api;
}
