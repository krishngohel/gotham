// Navigation (workstream L2): the city map model, fog of war, per-player minimaps, waypoints,
// the GPS route on the roads (or a rooftop hint on foot and in the air), tracked marks, the
// full-screen city map and fast travel. One createNav() per run; game.js calls update() once a
// frame. Everything here is per player (two players always; remote players get routes computed
// on their own machine, and see marks through the ping events).
//
// Public API (other workstreams):
//   nav.placeWaypoint(player, { x, y?, z }, { color, forPartner })   a custom mark
//   nav.removeWaypoint(player, id) / nav.clearWaypoints(player)
//   nav.setRoute(player, { x, y, z, label } | null)                  "set route" (pin a target)
//   nav.flags                     minimap flags (src/nav/minimapRules.js DEFAULT_FLAGS)
//   nav.fastTravel.addVeto(fn)    fn(player) -> reason string to refuse fast travel, or null
//   nav.canFastTravel(player)     { ok, reason }
//   nav.travel(player, pointId)   fast travel (both heroes go)
//   nav.addTargets(fn)            fn() -> [{ id, label, kind, x, y, z }] for the map's list
//   nav.addDistrictStat(fn)       fn(districtId) -> a line of text (or null) for the district panel
//   nav.openMap(player)           the full-screen map (also UI station 'cityMap')
//   events: listens for `mapMark` { id, kind, pos | target, ttl, player, label, remove }
//           emits `waypointSet` { x, y, z } (+player), `fastTravel` { id, kind } (+player)
import { buildCityMap, footprintsFromWorld, districtOfModel, CITY_BOUNDS } from './cityMapData.js';
import { createDiscovery, revealRadius, REVEAL } from './discovery.js';
import { createWaypointBook, PLAYER_ROUTE_COLORS, WAYPOINT_COLORS } from './waypoints.js';
import { createGps } from './gps.js';
import { createFastTravel, arrivalSpots, travelMinutes } from './fastTravel.js';
import { zoomRadius, moveMode, enemyVisible, DEFAULT_FLAGS, MINIMAP } from './minimapRules.js';
import { perchChain, trailMarkers } from './airHint.js';
import { createRouteRibbon } from './routeRibbon.js';
import { createStaticLayer } from '../ui/minimap/mapPainter.js';
import { createMinimap } from '../ui/minimap/minimap.js';
import { registerFloorPlan, floorPlanFor, planFromRoom, planBounds } from '../ui/minimap/floorPlans.js';
import { createCityMap } from '../ui/cityMap/cityMap.js';
import { registerStation } from '../ui/stations.js';
import { createWaypoint, createBeacon } from '../ui/waypoint.js';
import { setProgressCity } from '../ui/progressMap.js';
import { DISTRICT_LABEL } from '../world/regions/data.js';
import { SITES } from '../world/mapData.js';
import { withPlayer } from '../core/events.js';
import { DEFAULT_MAP_SETTINGS } from './mapSettings.js';
import './navSave.js';

const NO_TRAINS = [];
const FORBID_STEPS = new Set(['battle', 'board', 'boss', 'chase', 'courier', 'cutscene', 'fight', 'interior', 'ally']);

export function createNav(d) {
  const { scene, world, quality = {}, events, progress } = d;
  const players = () => d.players();
  // The settings object itself (no copy per frame): sanitizeSettings always fills `map`.
  const mapSettings = () => d.settings?.()?.map ?? DEFAULT_MAP_SETTINGS;
  const flags = { ...DEFAULT_FLAGS };

  // ---------------- the model (built once) ----------------
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const footprints = footprintsFromWorld({ roofs: world.roofs ?? [], boxes: world.collision?.boxes ?? [] });
  const groundTop = (x, z) => world.collision.groundBelow(x, 120, z, 0);
  const coreLandmarks = [{ id: 'gcpdHQ', label: 'GCPD', x: 0, z: 0 }, { id: 'batsignalRoof', label: 'The Batsignal', x: SITES.signal.x, z: SITES.signal.z, icon: 'bat' }];
  const model = buildCityMap({ graph: world.streetGraph, footprints, groundAt: groundTop, coreLandmarks });
  const buildMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  const pxPerM = (quality.drawDistance ?? 420) <= 200 ? 1 : 1.5;
  let layer = null, layerHc = null;
  const staticLayer = () => {
    const hc = !!mapSettings().highContrast;
    if (!layer || layerHc !== hc) { layer = createStaticLayer(model, { pxPerM, highContrast: hc }); layerHc = hc; }
    return layer;
  };

  // ---------------- discovery (fog of war) ----------------
  const save = progress.map ?? (progress.map = { cells: '', vistas: [], ft: [], wps: [], crimes: {} });
  save.crimes ??= {};
  const coreB = world.regions?.find?.((r) => r.id === 'core')?.bounds ?? { minX: -236, maxX: 236, minZ: -236, maxZ: 205 };
  const discovery = createDiscovery({ bounds: CITY_BOUNDS, cells: save.cells, alwaysAt: (x, z) => x >= coreB.minX && x <= coreB.maxX && z >= coreB.minZ && z <= coreB.maxZ });
  const vistaSites = Object.entries(world.regions ? Object.assign({}, ...world.regions.map((r) => r.sites ?? {})) : {}).filter(([, s]) => s.kind === 'vista').map(([id, s]) => ({ id, ...s }));
  const visitedDistricts = () => progress.districts ?? [];
  const districtKnown = (id) => visitedDistricts().includes(id) || model.districts.find((q) => q.id === id)?.region === 'core';
  let fogCanvas = null, fogVersion = -1, fogDistricts = -1;
  const cellDistrict = new Array(discovery.nx * discovery.nz);
  for (let j = 0; j < discovery.nz; j++) for (let i = 0; i < discovery.nx; i++) {
    const dd = districtOfModel(model, CITY_BOUNDS.minX + (i + 0.5) * discovery.cell, CITY_BOUNDS.minZ + (j + 0.5) * discovery.cell);
    cellDistrict[j * discovery.nx + i] = dd?.id ?? null;
  }
  function fogLayer() {
    if (typeof document === 'undefined') return null;
    const visited = visitedDistricts();
    if (fogCanvas && fogVersion === discovery.version && fogDistricts === visited.length) return fogCanvas;
    fogVersion = discovery.version; fogDistricts = visited.length;
    if (!fogCanvas) {
      const c = document.createElement('canvas');
      c.width = discovery.nx; c.height = discovery.nz;
      fogCanvas = { canvas: c, cell: discovery.cell, ox: CITY_BOUNDS.minX, oz: CITY_BOUNDS.minZ, g: c.getContext('2d') };
    }
    const img = fogCanvas.g.createImageData(discovery.nx, discovery.nz);
    for (let k = 0; k < discovery.nx * discovery.nz; k++) {
      const dId = cellDistrict[k];
      const lv = discovery.revealedIndex(k) ? 0 : dId && (visited.includes(dId) || districtKnown(dId)) ? 1 : 2;
      img.data[k * 4] = 14; img.data[k * 4 + 1] = 15; img.data[k * 4 + 2] = 24;
      img.data[k * 4 + 3] = lv === 0 ? 0 : lv === 1 ? 96 : 212;
    }
    fogCanvas.g.putImageData(img, 0, 0);
    return fogCanvas;
  }
  const revealed = (x, z) => discovery.isRevealed(x, z);
  const elRegion = world.regions?.find?.((q) => q.id === 'loop') ?? null;
  const elState = () => elRegion?.el?.state ?? null;

  // ---------------- waypoints, GPS, fast travel ----------------
  const book = createWaypointBook();
  const blocked = (e) => !!(e.bridge && world.bridges && !world.bridges.isDown(e.bridge));
  const gps = createGps({ graph: world.streetGraph, blocked });
  const fastTravel = createFastTravel({ points: model.fastTravel, unlocked: save.ft });
  const targetProviders = new Set();
  const statProviders = new Set();
  const roomProviders = new Set();
  if (save.wps?.length) book.load(players()[0]?.id ?? 0, save.wps);

  // Default floor plans for the core's interiors (any agent can register better ones).
  for (const room of Object.values(d.interiors?.rooms ?? {})) if (!floorPlanFor(room.id)) registerFloorPlan(room.id, planFromRoom(room), { label: room.name });

  // Minimap redraws a second: the low tiers redraw less (the static layer is never redrawn).
  const dd0 = quality.drawDistance ?? 420;
  const MINIMAP_HZ = quality.minimapHz ?? (dd0 <= 200 ? 8 : dd0 <= 260 ? 12 : 24);

  // ---------------- per player ----------------
  const per = new Map();
  const colorOf = (p) => PLAYER_ROUTE_COLORS[p.slot] ?? PLAYER_ROUTE_COLORS[0];
  const camOf = (p) => d.cameraOf?.(p) ?? null;
  function R(p) {
    let r = per.get(p.id);
    if (r) return r;
    const hud = p.local !== false ? d.hudFor?.(p) ?? null : null;
    r = {
      p, hud,
      minimap: null,
      ribbon: createRouteRibbon(scene, { color: colorOf(p), quality, ownerCamera: () => camOf(p), groundAt: (x, y, z) => world.collision.groundBelow(x, y, z, 0.2) }),
      markEl: null, beacon: null,
      last: { x: p.hero.pos.x, y: p.hero.pos.y, z: p.hero.pos.z }, speed: 0, radius: MINIMAP.radius.foot,
      air: new Float32Array(72), airN: 0, airKey: '', airT: 0,
      mmT: 0, frame: makeFrame(), routes: [], visitT: Math.random() * 0.5,
    };
    per.set(p.id, r);
    return r;
  }
  const minimapLayers = []; // [wanted] extra live layers (addMinimapLayer)
  function makeFrame() {
    return { layers: minimapLayers, x: 0, y: 0, z: 0, yaw: 0, rot: 0, radius: 80, R: 80, color: '#49b4ff', tint: null, name: '', extra: '', layer: null, fog: null,
      routes: [], partner: null, objective: null, marks: [], tracked: [], pings: [], crimes: [], icons: [], trains: [], bridges: [], enemies: [], crumbs: null, plan: null, planRadius: 30 };
  }
  function dropPlayer(id) { const r = per.get(id); if (!r) return; r.ribbon.dispose(); r.minimap?.destroy(); r.markEl?.el?.remove?.(); per.delete(id); }

  // ---------------- helpers ----------------
  const objective = () => { const t = d.flow?.()?.markerTarget; return t ? { x: t.x, y: t.y ?? 0, z: t.z, label: 'Objective' } : null; };
  const driving = (p) => p.hero.control?.name === 'drive' || (p.hero.control?.name === 'ride' && p.hero.control.camera === 'drive');
  const flying = (p) => p.hero.control?.name === 'fly' || (p.hero.control?.name === 'ride' && p.hero.control.camera === 'fly');
  const altitude = (p) => { const h = p.hero; const g = world.collision.groundBelow(h.pos.x, h.pos.y + 0.2, h.pos.z, 0.3); return g > -Infinity ? h.pos.y - g : 0; };
  const lists = { routes: [], targets: [] };
  function listTargets() {
    const out = lists.targets;
    out.length = 0;
    const o = objective();
    if (o) out.push({ id: 'objective', label: 'Story: the current objective', kind: 'mission', x: o.x, y: o.y, z: o.z });
    const c = d.side?.()?.crimes?.marker?.();
    if (c) out.push({ id: 'crime', label: `Crime in progress, ${DISTRICT_LABEL[world.districtAt(c.x, c.z)] ?? 'somewhere'}`, kind: 'crime', x: c.x, y: c.y ?? 0, z: c.z });
    for (const fn of targetProviders) { try { for (const t of fn() ?? []) if (t && Number.isFinite(t.x)) out.push(t); } catch { /* a provider failing never breaks the map */ } }
    return out;
  }
  function travelState(p) {
    const h = p.hero;
    const flow = d.flow?.();
    const step = d.currentStep?.() ?? null;
    const enemies = d.combat?.enemies ?? [];
    const inCombat = !!d.combat?.fighterFor?.(h)?.api?.active || enemies.some((e) => e.alive && e.aware && !e.room && Math.hypot(e.pos.x - h.pos.x, e.pos.z - h.pos.z) < 30);
    return {
      dead: !!h.dead, playing: !flow || flow.mode === 'play',
      inCombat, stealthRoom: !!d.stealth?.inRoom?.(h.pos),
      stepForbids: !!step && (FORBID_STEPS.has(step.type) || !!step.noFastTravel),
      crimeEngaged: !!d.side?.()?.crimes?.holdStory?.(), challenge: !!d.side?.()?.challenges?.active,
      inVehicle: driving(p) || flying(p),
      chase: !!(d.vehicles?.chase?.active || d.vehicles?.battle?.active || d.vehicles?.sideChase?.active),
      heat: typeof d.heat === 'function' ? d.heat(p) : undefined,
    };
  }
  const canFastTravel = (p) => fastTravel.canFastTravel(p, travelState(p));

  // ---------------- waypoints (and their replication) ----------------
  function placeWaypoint(p, pos, { color = null, forPartner = false, quiet = false } = {}) {
    const y = Number.isFinite(pos.y) ? pos.y : (() => { const g = world.collision.groundBelow(pos.x, 400, pos.z, 0.3); return g > -Infinity ? g : 0; })();
    const partner = forPartner ? players().find((o) => o !== p) : null;
    const m = book.add(p.id, { x: pos.x, y, z: pos.z }, { color, forPlayer: partner ? partner.id : null });
    persist();
    if (!quiet) {
      events?.emit('waypointSet', withPlayer({ x: m.x, y: m.y, z: m.z }, p));
      // Online: the partner sees it (src/net/game/netGame.js forwards ping events with a pos).
      if (p.local !== false) events?.emit('ping', withPlayer({ id: forPartner ? 'wpFor' : 'wpSet', pos: { x: m.x, y: m.y, z: m.z } }, p));
    }
    return m;
  }
  function removeWaypoint(p, id, { quiet = false } = {}) {
    const m = book.marksOf(p.id).find((k) => k.id === id);
    const ok = book.remove(p.id, id);
    if (ok) { persist(); if (!quiet && m && p.local !== false) events?.emit('ping', withPlayer({ id: 'wpClear', pos: { x: m.x, y: m.y, z: m.z } }, p)); }
    return ok;
  }
  function clearWaypoints(p) { book.clear(p.id); persist(); }
  function setRoute(p, t) { book.pin(p.id, t ? { x: t.x, y: t.y ?? 0, z: t.z, label: t.label ?? null } : null); }
  function persist() { const p0 = players()[0]; if (p0) save.wps = book.save(p0.id); }

  // The waypoint key (N): toggle a mark where the player looks (ground, roof, a goon, a car).
  function markAtLook(p) {
    const cam = camOf(p);
    if (!cam) return null;
    const dir = d.lookDir?.(cam);
    if (!dir) return null;
    const from = cam.position;
    const enemies = d.combat?.enemies ?? [];
    // A goon in the crosshair becomes a tracked mark (it follows him).
    let best = null, bs = 0.04;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.pos.x - from.x, dy = e.pos.y + 1 - from.y, dz = e.pos.z - from.z, L = Math.hypot(dx, dy, dz);
      if (L > 60) continue;
      const s = 1 - (dx * dir.x + dy * dir.y + dz * dir.z) / L;
      if (s < bs) { bs = s; best = e; }
    }
    if (best) { book.track({ id: `mark:${p.id}:enemy`, kind: 'enemy', target: best, ttl: 20, player: p.id, label: 'Marked' }); events?.emit('ping', withPlayer({ id: 'enemy' }, p)); return { tracked: best }; }
    const hit = world.collision.raycast(from, dir, 400);
    const at = hit ? { x: from.x + dir.x * hit.t, y: from.y + dir.y * hit.t, z: from.z + dir.z * hit.t } : null;
    if (!at) return null;
    const removed = book.removeNear(p.id, at.x, at.z, 10);
    if (removed) { persist(); events?.emit('ping', withPlayer({ id: 'wpClear', pos: { x: removed.x, y: removed.y, z: removed.z } }, p)); return { removed }; }
    return { placed: placeWaypoint(p, at) };
  }

  // Pings: the comms wheel's "Go here" sets that player's waypoint too (one hold, one mark); a
  // remote player's waypoint pings arrive here with their position.
  const remoteSlot = (dt) => players().find((o) => o.local === false && (dt?.from === undefined || o.netSlot === dt.from)) ?? null;
  events?.on?.('ping', (dt) => {
    if (!dt) return;
    if (dt.remote) {
      const rp = remoteSlot(dt);
      if (!rp || !dt.pos) return;
      if (dt.id === 'wpSet' || dt.id === 'wpFor') book.add(rp.id, dt.pos, { forPlayer: dt.id === 'wpFor' ? players()[0]?.id : null });
      else if (dt.id === 'wpClear') book.removeNear(rp.id, dt.pos.x, dt.pos.z, 3);
      return;
    }
    if (dt.id === 'here' && dt.player && mapSettings().pingSetsWaypoint !== false) {
      const glue = d.glue?.();
      const m = glue?.pings?.marks?.filter((x) => x.by === dt.player.id && x.id === 'here').pop();
      if (m?.pos) placeWaypoint(dt.player, { x: m.pos.x, y: m.pos.y, z: m.pos.z }, { quiet: true });
    }
  });
  events?.on?.('mapMark', (ev) => book.track(ev));
  // Crimes stopped per district (the Progress page): the district of the crime last on the board.
  let lastCrime = null;
  events?.on?.('crimeEnd', (ev) => {
    if (ev?.outcome !== 'stopped') return;
    const dId = lastCrime?.district ?? (lastCrime ? world.districtAt(lastCrime.x, lastCrime.z) : null);
    if (dId) save.crimes[dId] = (save.crimes[dId] ?? 0) + 1;
  });

  // ---------------- fast travel ----------------
  let travelling = null;
  function travel(p, pointId) {
    const point = fastTravel.points.find((q) => q.id === pointId);
    if (!point) return { ok: false, reason: 'Unknown point.' };
    if (!fastTravel.isUnlocked(pointId)) return { ok: false, reason: 'Not unlocked yet: get there once first.' };
    const locals = players().filter((o) => o.local !== false);
    for (const o of locals) { const c = canFastTravel(o); if (!c.ok) return { ok: false, reason: o === p ? c.reason : `Player ${o.slot + 1}: ${c.reason}` }; }
    const from = { x: p.hero.pos.x, z: p.hero.pos.z };
    const spots = arrivalSpots(point, locals.length, { groundAt: (x, y, z) => world.collision.groundBelow(x, y, z, 0.3), yaw: point.yaw ?? 0 });
    travelling = { point, t: 0, dur: point.kind === 'el' ? 2.6 : point.kind === 'batwing' ? 2.2 : 1.6, done: false };
    d.transition?.({ point, from, minutes: travelMinutes(from, point) }, () => {
      locals.forEach((o, i) => {
        const s = spots[i];
        // The Batwing drop lands you on the roof under the drop point (a glide-in from above).
        o.hero.teleport({ x: s.x, y: s.y + 0.05, z: s.z }, point.yaw ?? o.hero.bat?.yaw ?? 0);
        d.followOf?.(o)?.snapBehind?.(point.yaw ?? o.hero.bat?.yaw ?? 0);
        const rr = per.get(o.id); if (rr) { rr.last.x = s.x; rr.last.y = s.y; rr.last.z = s.z; }
      });
      world.clock?.advance?.(travelMinutes(from, point));
      for (const o of locals) events?.emit('fastTravel', withPlayer({ id: point.id, kind: point.kind }, o));
      // Online: the partner on the other machine is brought along (it checks its own rules).
      events?.emit('ping', withPlayer({ id: 'ftBring', pos: { x: spots[0].x, y: spots[0].y, z: spots[0].z } }, p));
      travelling = null;
    });
    return { ok: true, reason: null };
  }
  // A remote partner fast travelled: bring our local heroes (when they may travel).
  events?.on?.('ping', (dt) => {
    if (!dt?.remote || dt.id !== 'ftBring' || !dt.pos) return;
    const locals = players().filter((o) => o.local !== false);
    if (!locals.every((o) => canFastTravel(o).ok)) return;
    const spots = arrivalSpots(dt.pos, locals.length + 1, { groundAt: (x, y, z) => world.collision.groundBelow(x, y, z, 0.3) });
    locals.forEach((o, i) => { const s = spots[i + 1]; o.hero.teleport({ x: s.x, y: s.y + 0.05, z: s.z }); d.followOf?.(o)?.snapBehind?.(o.hero.bat?.yaw ?? 0); });
  });

  // ---------------- the full map ----------------
  let cityMap = null;
  const mapApi = {
    model,
    flags,
    get fastTravel() { return fastTravel; },
    waypoints: book,
    players,
    settings: mapSettings,
    fogLayer,
    revealed,
    districtKnown,
    listTargets,
    canFastTravel,
    travel,
    placeWaypoint,
    removeWaypoint,
    clearWaypoints,
    setRoute,
    objective,
    playerPos: (p) => ({ x: p.hero.pos.x, z: p.hero.pos.z }),
    playerMarkers: () => players().map((o) => ({ id: o.id, x: o.hero.pos.x, z: o.hero.pos.z, yaw: o.hero.bat?.yaw ?? 0, color: colorOf(o) })),
    trackedNow: () => book.tracked.map((m) => book.trackedPos(m)).filter(Boolean),
    bridgeStates: () => model.bridges.map((b) => ({ ...b, up: !!world.bridges && !world.bridges.isDown(b.id) })),
    routesFor: (p) => players().map((o) => { const st = gps.stateOf(o.id); return { own: o === p, color: colorOf(o), pts: st.route?.points ?? null }; }),
    districtInfo(x, z) {
      const dd = districtOfModel(model, x, z);
      if (!dd) return null;
      const known = districtKnown(dd.id);
      const lines = [`<b>${known ? dd.label : 'Unexplored district'}</b>`];
      if (known) {
        lines.push(`Explored: ${Math.round(discovery.fractionIn(dd.rects) * 100)}%`);
        const ft = fastTravel.points.filter((q) => q.district === dd.id);
        if (ft.length) lines.push(`Fast travel: ${ft.filter((q) => fastTravel.isUnlocked(q.id)).length}/${ft.length}`);
        for (const fn of statProviders) { try { const l = fn(dd.id); if (l) lines.push(l); } catch { /* skip */ } }
      } else lines.push('Go there to put it on the map.');
      return { id: dd.id, lines };
    },
  };
  function openMap(p = players()[0], opts = {}) {
    if (typeof document === 'undefined') return false;
    cityMap ??= createCityMap({ nav: mapApi });
    if (cityMap.isOpen) return true;
    d.pauseForMap?.();
    // [verify] The caller's onClose (a Batcave bench's) used to replace the resume: closing the map
    // from the Batcomputer left the game paused. Both run now.
    const own = opts.onClose;
    cityMap.open({ player: p, ...opts, onClose: () => { d.resumeFromMap?.(); own?.(); } });
    return true;
  }
  // [verify] A station returns a handle { close() } (src/ui/stations.js); openMap's `true` was not one.
  const unStation = registerStation('cityMap', (opts = {}) => (openMap(opts.player ?? players()[0], opts) ? { close: () => cityMap?.close() } : undefined));
  setProgressCity({ model, fogLayer });
  // The district panel's own lines: crimes stopped there and the story trophies found there.
  statProviders.add((id) => { const n = save.crimes?.[id] ?? 0; return n ? `Crimes stopped here: ${n}` : null; });

  // ---------------- per frame ----------------
  let saveT = 0;
  function update(real, { playing = true, visible = true, t = 0 } = {}) {
    book.update(real);
    const ac = d.side?.()?.crimes?.active;
    if (ac?.spot) lastCrime = ac.spot;
    const list = players();
    const settings = mapSettings();
    // Players who left lose their ribbons and minimaps.
    for (const id of [...per.keys()]) if (!list.some((p) => p.id === id)) dropPlayer(id);
    const obj = objective();
    for (const p of list) {
      const r = R(p);
      const h = p.hero;
      // Speed (any mode: on foot, gliding, driving, flying), smoothed.
      const dx = h.pos.x - r.last.x, dz = h.pos.z - r.last.z, dy = h.pos.y - r.last.y;
      const inst = real > 0 ? Math.hypot(dx, dz) / real : 0;
      r.speed += (Math.min(inst, 120) - r.speed) * Math.min(1, real * 3);
      r.last.x = h.pos.x; r.last.y = h.pos.y; r.last.z = h.pos.z;
      void dy;
      // Discovery and unlocks, twice a second.
      if ((r.visitT -= real) <= 0 && p.local !== false && playing) {
        r.visitT = 0.5;
        const alt = altitude(p);
        if (discovery.reveal(h.pos.x, h.pos.z, revealRadius(alt))) save.cells = discovery.toBase64();
        for (const v of vistaSites) {
          if (save.vistas.includes(v.id)) continue;
          if (Math.hypot(v.x - h.pos.x, v.z - h.pos.z) < REVEAL.vistaReach && Math.abs((v.y ?? 0) - h.pos.y) < REVEAL.vistaReach) {
            save.vistas.push(v.id);
            discovery.reveal(v.x, v.z, REVEAL.vista);
            save.cells = discovery.toBase64();
            d.hint?.(p, 'Vista: the district around you is on the map now.');
          }
        }
        for (const q of fastTravel.visit(h.pos.x, h.pos.y, h.pos.z)) {
          save.ft = fastTravel.unlockedIds();
          d.hint?.(p, `Fast travel unlocked: ${q.label}. Open the map (${d.keyFor?.(p, 'map') ?? 'M'}) to travel.`);
        }
        if (settings.breadcrumbs) book.crumb(p.id, h.pos.x, h.pos.z);
      }
      // Keys: the map, and the waypoint where you look.
      if (playing && p.local !== false && p.input) {
        if (p.input.pressed?.('map')) openMap(p);
        else if (p.input.pressed?.('waypoint')) markAtLook(p);
      }
      // GPS: route to this player's target.
      const target = book.routeTarget(p.id, obj);
      const st = gps.update(p.id, h.pos, target, real);
      const drive = driving(p), fly = flying(p);
      const wantRibbon = !!st.route && (drive || (settings.footRoute && !fly && h.state !== 'glide'));
      if (st.route) r.ribbon.setRoute(st.route, st.cum, st.turns, st.version, (i) => world.streetGraph.edges[st.route.edges[Math.min(i, st.route.edges.length - 1)]]?.width ?? 14);
      else r.ribbon.setRoute(null, null, null, st.version);
      r.ribbon.update(t, st.s, wantRibbon && visible);
      // On foot / gliding: the perch trail toward the target (recomputed every 1.5 s or on a new target).
      const wantAir = !!target && !drive && !fly && visible && Math.hypot(target.x - h.pos.x, target.z - h.pos.z) > 60 && !(settings.footRoute && st.route);
      if (wantAir) {
        r.airT -= real;
        const key = `${Math.round(target.x)}:${Math.round(target.z)}`;
        if (r.airT <= 0 || key !== r.airKey) {
          r.airT = 1.5; r.airKey = key;
          const perches = perchChain({ x: h.pos.x, y: h.pos.y, z: h.pos.z }, target, world.grapplePoints ?? []);
          r.airN = trailMarkers({ x: h.pos.x, y: h.pos.y, z: h.pos.z }, perches, { x: target.x, y: (target.y ?? 0) + 2, z: target.z }, r.air);
        }
        r.ribbon.setAir(r.air, r.airN, t);
      } else if (r.ribbon.air.visible) r.ribbon.setAir(r.air, 0, t);
      // Minimap zoom follows how you move.
      const mode = moveMode({ driving: drive, flying: fly, gliding: h.state === 'glide' });
      const want = zoomRadius({ mode, speed: r.speed, altitude: mode === 'foot' ? 0 : altitude(p) });
      r.radius += (want - r.radius) * Math.min(1, real * 1.5);
      // Custom waypoint beacon and edge marker in this player's own view.
      if (p.local !== false && r.hud) { customMarker(p, r, target !== obj ? target : null, playing && visible, t); trackedMarkers(p, r, playing && visible); }
    }
    // Minimaps (throttled inside; frames built only when due).
    for (const p of list) {
      const r = per.get(p.id);
      // A partner's HUD may come a frame after the player (coopRuntime builds the rig).
      if (r && !r.hud && p.local !== false) r.hud = d.hudFor?.(p) ?? null;
      if (!r?.hud) continue;
      const show = visible && settings.minimap && playing;
      if (!show) { r.minimap?.hide(); continue; }
      r.minimap ??= createMinimap(r.hud.el, { hz: MINIMAP_HZ });
      r.mmT -= real;
      if (r.mmT > 0) continue;
      r.mmT = 1 / MINIMAP_HZ;
      const vs = r.hud.viewSize?.() ?? { w: innerWidth, h: innerHeight };
      const px = Math.round(Math.max(110, Math.min(200, Math.min(vs.w, vs.h) * 0.27)));
      r.minimap.update(buildFrame(p, r, obj, settings), px, t);
    }
    saveT += real;
    if (saveT > 5) { saveT = 0; save.cells = discovery.toBase64(); }
  }

  function customMarker(p, r, target, show, t) {
    if (!r.markEl) {
      r.markEl = createWaypoint(r.hud.el, () => r.hud.viewSize?.() ?? { w: innerWidth, h: innerHeight });
      r.markEl.el?.classList?.add('wp-custom');
      r.beacon = createBeacon(scene, { color: WAYPOINT_COLORS[0], owner: () => camOf(p) });
    }
    const cam = camOf(p);
    const near = target && Math.hypot(p.hero.pos.x - target.x, p.hero.pos.z - target.z) < 6;
    if (!show || !target || near || !cam) { r.markEl.update(null); r.beacon.set(null); return; }
    const col = WAYPOINT_COLORS[target.c ?? 0] ?? WAYPOINT_COLORS[0];
    r.markEl.setColor?.(col);
    r.markEl.update(target, cam, p.hero.pos);
    r.beacon.set(target, col);
    r.beacon.update(t, p.hero.pos);
  }

  // Tracked marks (a tracker dart, a scripted mark) on this player's screen edge: up to three.
  const TRACK_COLOR = '#58e0ff';
  function trackedMarkers(p, r, show) {
    r.trackEls ??= [];
    const cam = camOf(p);
    let k = 0;
    if (show && cam) {
      for (const m of book.tracked) {
        if (k >= 3) break;
        if (m.player != null && m.player !== p.id && m.kind !== 'shared') continue;
        const q = book.trackedPos(m);
        if (!q) continue;
        const el = (r.trackEls[k] ??= (() => { const w = createWaypoint(r.hud.el, () => r.hud.viewSize?.() ?? { w: innerWidth, h: innerHeight }); w.el?.classList?.add('wp-custom'); w.setColor?.(TRACK_COLOR); return w; })());
        el.update(q, cam, p.hero.pos);
        k++;
      }
    }
    for (let i = k; i < r.trackEls.length; i++) r.trackEls[i].update(null);
  }

  // Pooled marker records per frame list (the minimap redraws many times a second): pool(f, key, i)
  // is the i-th reusable object of that list, filled in place, so redraws allocate nothing new.
  function pool(f, key, i) { const P = (f.pools ??= {}); const a = (P[key] ??= []); return (a[i] ??= {}); }

  // The minimap frame for one player (reusing its arrays).
  function buildFrame(p, r, obj, settings) {
    const f = r.frame, h = p.hero;
    f.x = h.pos.x; f.y = h.pos.y; f.z = h.pos.z;
    f.yaw = h.bat?.yaw ?? 0;
    // Rotating map: the player's heading points up (see minimapRules.worldToMinimap).
    f.rot = settings.rotate ? -(Math.PI - f.yaw) : 0;
    f.radius = r.radius;
    f.color = colorOf(p);
    f.layer = staticLayer();
    f.fog = fogLayer();
    const dd = districtOfModel(model, h.pos.x, h.pos.z);
    f.tint = dd?.tint ?? '#d8cfb8';
    f.name = dd ? (districtKnown(dd.id) ? dd.label : '???') : '';
    f.extra = '';
    // Interiors: a floor plan when the room has one.
    let room = d.interiors?.inside ?? null;
    for (const fn of roomProviders) { const id = fn(p); if (id) room = id; }
    f.plan = floorPlanFor(room);
    if (f.plan) { const b = planBounds(f.plan); f.planRadius = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * 0.62; f.name = f.plan.label ?? f.name; }
    // Routes.
    f.routes.length = 0;
    for (const o of players()) {
      const st = gps.stateOf(o.id);
      if (!st.route) continue;
      { const rec = pool(f, 'routes', f.routes.length); rec.own = o === p; rec.color = colorOf(o); rec.pts = st.route.points; rec.from = o === p ? Math.max(0, st.hint) : 0; f.routes.push(rec); }
    }
    const partner = players().find((o) => o !== p);
    f.partner = partner ? (f.partnerObj ??= { x: 0, z: 0, yaw: 0, color: '' }) : null;
    if (partner) { f.partner.x = partner.hero.pos.x; f.partner.z = partner.hero.pos.z; f.partner.yaw = partner.hero.bat?.yaw ?? 0; f.partner.color = colorOf(partner); }
    f.objective = obj;
    // Marks: this player's own (and ones left for them), the partner's smaller.
    f.marks.length = 0;
    for (const o of players()) for (const m of book.marksOf(o.id)) { const rec = pool(f, 'marks', f.marks.length); rec.x = m.x; rec.y = m.y; rec.z = m.z; rec.c = m.c; rec.own = m.by === p.id || m.forPlayer === p.id; f.marks.push(rec); }
    f.tracked.length = 0;
    for (const m of book.tracked) { const q = book.trackedPos(m); if (q) f.tracked.push(q); }
    f.pings.length = 0;
    const glue = d.glue?.();
    for (const m of glue?.pings?.marks ?? []) {
      const q = m.pos ?? m.target?.pos ?? m.follow?.pos;
      if (q) { const rec = pool(f, 'pings', f.pings.length); rec.x = q.x; rec.y = q.y; rec.z = q.z; rec.color = m.by === p.id ? '#ffffff' : colorOf(players().find((o) => o.id === m.by) ?? p); f.pings.push(rec); }
    }
    f.crimes.length = 0;
    if (flags.crimes) { const c = d.side?.()?.crimes?.marker?.(); if (c) f.crimes.push(c); }
    if (flags.sideContent) { const m = d.side?.()?.challenges?.active ? d.side?.()?.challenges?.nextMarker?.() : null; if (m) f.crimes.push(m); }
    // Icons: fast-travel points and landmarks in revealed ground, collectible hints by flag.
    f.icons.length = 0;
    const R2 = (r.radius * 1.5) ** 2;
    for (const q of fastTravel.points) {
      if ((q.x - f.x) ** 2 + (q.z - f.z) ** 2 > R2) continue;
      const on = fastTravel.isUnlocked(q.id);
      if (!on && !revealed(q.x, q.z)) continue;
      { const rec = pool(f, 'icons', f.icons.length); rec.x = q.x; rec.y = q.y; rec.z = q.z; rec.icon = q.kind === 'el' ? 'el' : q.kind === 'batcave' ? 'batcave' : 'batwing'; rec.color = on ? '#f2d24b' : '#8a8f9c'; rec.r = 6; f.icons.push(rec); }
    }
    // Vehicles you own: the Batmobile where it is parked (not while someone drives it).
    const bm = d.vehicles?.batmobile?.group;
    if (bm?.visible && d.vehicles.active?.group !== bm) { const rec = pool(f, 'icons', f.icons.length); rec.x = bm.position.x; rec.y = bm.position.y; rec.z = bm.position.z; rec.icon = 'car'; rec.color = '#49b4ff'; rec.r = 5.5; f.icons.push(rec); }
    for (const l of model.landmarks) {
      if ((l.x - f.x) ** 2 + (l.z - f.z) ** 2 > R2) continue;
      if (l.kind === 'collectible' && !(flags.collectibleHints && (l.x - f.x) ** 2 + (l.z - f.z) ** 2 < MINIMAP.hintRadius ** 2)) continue;
      if (!revealed(l.x, l.z)) continue;
      { const rec = pool(f, 'icons', f.icons.length); rec.x = l.x; rec.y = l.y; rec.z = l.z; rec.icon = l.icon; rec.color = '#efe6cf'; rec.r = 4.5; f.icons.push(rec); }
    }
    // El trains and raised bridges, live.
    f.trains = elState() ?? NO_TRAINS;
    f.bridges.length = 0;
    for (const b of model.bridges) { const rec = pool(f, 'bridges', f.bridges.length); rec.x = b.x; rec.z = b.z; rec.up = !!world.bridges && !world.bridges.isDown(b.id); f.bridges.push(rec); }
    // Enemies: only when detected (detective vision, marked, a drone).
    f.enemies.length = 0;
    const det = !!d.detectiveOf?.(p);
    for (const e of d.combat?.enemies ?? []) {
      const dist = Math.hypot(e.pos.x - f.x, e.pos.z - f.z);
      if (dist > r.radius * 1.2) continue;
      const marked = book.tracked.some((m) => m.target === e) || (glue?.pings?.marks ?? []).some((m) => m.target === e);
      if (enemyVisible(e, { detective: det, dist, marked, drone: !!e.spotted, flags })) { const rec = pool(f, 'enemies', f.enemies.length); rec.x = e.pos.x; rec.z = e.pos.z; f.enemies.push(rec); }
    }
    f.crumbs = settings.breadcrumbs ? (fn) => book.eachCrumb(p.id, fn) : null;
    return f;
  }

  return {
    model, discovery, waypoints: book, gps, fastTravel, flags, buildMs,
    update, openMap, placeWaypoint, removeWaypoint, clearWaypoints, setRoute, markAtLook, travel, canFastTravel, listTargets,
    addTargets(fn) { targetProviders.add(fn); return () => targetProviders.delete(fn); },
    // [wanted] fn(g, frame, at) draws into each minimap after the live layers (at(f, x, z) -> {x, y} px from the centre).
    addMinimapLayer(fn) { minimapLayers.push(fn); return () => { const i = minimapLayers.indexOf(fn); if (i >= 0) minimapLayers.splice(i, 1); }; },
    addDistrictStat(fn) { statProviders.add(fn); return () => statProviders.delete(fn); },
    // fn(player) -> a room id the player is inside (for floor plans), or null.
    addRoomProvider(fn) { roomProviders.add(fn); return () => roomProviders.delete(fn); },
    registerFloorPlan,
    get cityMap() { return cityMap; },
    get travelling() { return travelling; },
    routeOf: (p) => gps.stateOf(p.id),
    ribbonOf: (p) => per.get(p.id)?.ribbon ?? null,
    minimapOf: (p) => per.get(p.id)?.minimap ?? null,
    mapApi,
    dispose() { unStation(); setProgressCity(null); for (const id of [...per.keys()]) dropPlayer(id); },
  };
}
