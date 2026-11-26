// Workstream L2: the city map model, discovery and its save, waypoints, minimap rules, the air
// hint, fast-travel rules, map settings, the UI station registry and floor plans. Pure modules.
import { describe, it, expect } from 'vitest';
import { buildStreetGraph } from '../../src/world/regions/streets.js';
import { DISTRICTS, REGION_SITES } from '../../src/world/regions/data.js';
import { buildCityMap, streetClass, footprintsFromWorld, fastTravelPoints, waterKindAt, districtOfModel, CITY_BOUNDS } from '../../src/nav/cityMapData.js';
import { createDiscovery, bitsToBase64, base64ToBits, revealRadius, fogLevel, REVEAL } from '../../src/nav/discovery.js';
import { sanitizeMapSave } from '../../src/nav/navSave.js';
import { sanitizeProgress, saveProgress, loadProgress } from '../../src/core/save.js';
import { createWaypointBook, MAX_MARKS, BREADCRUMB } from '../../src/nav/waypoints.js';
import { zoomRadius, enemyVisible, heightCue, clampToRim, worldToMinimap, moveMode, MINIMAP, DEFAULT_FLAGS } from '../../src/nav/minimapRules.js';
import { perchChain, trailMarkers, AIR } from '../../src/nav/airHint.js';
import { createFastTravel, travelRules, arrivalSpots, travelMinutes, FAST_TRAVEL } from '../../src/nav/fastTravel.js';
import { sanitizeMapSettings, DEFAULT_MAP_SETTINGS } from '../../src/nav/mapSettings.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../../src/core/settings.js';
import { registerStation, openStation, hasStation } from '../../src/ui/stations.js';
import { registerFloorPlan, floorPlanFor, planFromRoom, planBounds } from '../../src/ui/minimap/floorPlans.js';
import { INTERIOR_ROOMS } from '../../src/world/interiors.js';

const graph = buildStreetGraph();
const model = buildCityMap({ graph, footprints: [{ x: 0, z: 0, w: 40, d: 40, h: 42 }] });

describe('city map model', () => {
  it('covers the whole city: every street edge, every district, the El and its stations', () => {
    expect(model.bounds).toEqual(CITY_BOUNDS);
    expect(model.streets).toHaveLength(graph.edges.length);
    for (const d of DISTRICTS) {
      const md = model.districts.find((q) => q.id === d.id);
      expect(md, d.id).toBeTruthy();
      expect(md.area, d.id).toBeGreaterThan(0);
      // The label sits inside the district's own area.
      expect(md.rects.some((r) => md.cx >= r.minX && md.cx <= r.maxX && md.cz >= r.minZ && md.cz <= r.maxZ), d.id).toBe(true);
    }
    expect(model.el.tracks).toHaveLength(2);
    expect(model.el.stations.map((s) => s.id)).toEqual(['elRiverside', 'elLafayette', 'elKane', 'elCityHall', 'elWestJunction', 'elCanal', 'elNarrows', 'elParkRow']); // [polish2] the West Line's stations beyond the Loop are built
    expect(model.buildings[0]).toMatchObject({ x: 0, z: 0, district: 'gcpd' });
  });
  it('classes the streets: avenue, street, alley, bridge, ramp, lower deck, highway, paths', () => {
    const classes = new Set(model.streets.map((s) => s.cls));
    for (const c of ['avenue', 'street', 'alley', 'bridge', 'ramp', 'lower', 'highway', 'path']) expect(classes.has(c), c).toBe(true);
    expect(streetClass({ deck: 'lower', lanes: 4, width: 20 })).toBe('lower');
    expect(streetClass({ bridge: 'bridgeW', deck: 'bridge', lanes: 2, width: 14 })).toBe('bridge');
    expect(streetClass({ deck: 'walk', lanes: 0, width: 4 })).toBe('path');
    expect(streetClass({ kind: 'drive', lanes: 4, width: 22 })).toBe('highway');
    expect(streetClass({ kind: 'street', lanes: 4, width: 20 })).toBe('avenue');
    expect(streetClass({ kind: 'street', lanes: 2, width: 8 })).toBe('alley');
    expect(streetClass({ kind: 'street', lanes: 2, width: 14 })).toBe('street');
    // The lower deck runs under the upper one: both are in the model, on their own heights.
    const lower = model.streets.filter((s) => s.cls === 'lower');
    expect(lower.every((s) => s.y0 < -5 && s.y1 < -5)).toBe(true);
  });
  it('has water where the region data says, and land where something stands in it', () => {
    const kinds = new Set(model.water.map((w) => w.kind));
    for (const k of ['river', 'lake', 'harbour']) expect(kinds.has(k)).toBe(true);
    expect(waterKindAt(0, -250)).toBe('river');
    expect(waterKindAt(600, -80)).toBe('lake');
    expect(waterKindAt(0, 0)).toBe(null);
    // An island (ground at 5 m in the lake) is land; a river under a bridge stays a river.
    expect(waterKindAt(600, -80, () => 5)).toBe(null);
    expect(waterKindAt(0, -250, () => 1)).toBe('river');
  });
  it('lists the movable bridges and the fast-travel points (El stations, Batwing drops, Batcave doors)', () => {
    expect(model.bridges.map((b) => b.id)).toEqual(expect.arrayContaining(['bridgeW', 'bridgeE']));
    const ft = fastTravelPoints(REGION_SITES);
    expect(ft.filter((p) => p.kind === 'el')).toHaveLength(8); // [polish2] + Narrows and Park Row
    const ids = ft.map((p) => p.id);
    for (const id of ['mileBatwingDrop', 'bristolOverlook', 'blackgateDock', 'batcaveDowntown', 'batcaveMouth']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ft) { expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true); expect(p.label.length).toBeGreaterThan(2); }
  });
  it('turns the built roofs and tall boxes into footprints', () => {
    const f = footprintsFromWorld({
      roofs: [{ x: 10, z: 10, w: 20, d: 20, y: 30 }],
      boxes: [
        { minX: 0, maxX: 20, minY: 0, maxY: 30, minZ: 0, maxZ: 20, tag: 'building' }, // under the roof: skipped
        { minX: 100, maxX: 112, minY: 0, maxY: 40, minZ: 100, maxZ: 112, tag: 'spire' }, // a tower: kept
        { minX: 200, maxX: 260, minY: 0, maxY: 1, minZ: 0, maxZ: 60, tag: 'road' }, // flat: skipped
        { minX: 300, maxX: 320, minY: 0, maxY: 12, minZ: 0, maxZ: 20, tag: 'railing' }, // tagged out
      ],
    });
    expect(f).toHaveLength(2);
    expect(f[1]).toMatchObject({ x: 106, z: 106, h: 40 });
  });
  it('finds the district under a point', () => {
    expect(districtOfModel(model, 0, -400)?.id).toBe('loop');
    expect(districtOfModel(model, 300, -600)?.id).toBe('robinsonPark');
    expect(districtOfModel(model, -2000, 0)).toBe(null);
  });
});

describe('discovery (fog of war)', () => {
  const B = CITY_BOUNDS;
  it('reveals cells around a point and round-trips through base64', () => {
    const d = createDiscovery({ bounds: B });
    expect(d.isRevealed(0, -400)).toBe(false);
    const n = d.reveal(0, -400, 60);
    expect(n).toBeGreaterThan(20);
    expect(d.isRevealed(0, -400)).toBe(true);
    expect(d.isRevealed(0, -470)).toBe(false);
    const again = createDiscovery({ bounds: B, cells: d.toBase64() });
    expect(again.isRevealed(0, -400)).toBe(true);
    expect(again.isRevealed(0, -470)).toBe(false);
    expect(d.reveal(0, -400, 60)).toBe(0); // nothing new
  });
  it('keeps the old city revealed and measures how much of a district is seen', () => {
    const d = createDiscovery({ bounds: B, alwaysAt: (x, z) => x >= -236 && x <= 236 && z >= -236 && z <= 205 });
    expect(d.isRevealed(0, 0)).toBe(true);
    expect(d.fractionIn([{ minX: -200, maxX: 200, minZ: -200, maxZ: 200 }])).toBe(1);
    expect(d.fractionIn([{ minX: 300, maxX: 360, minZ: -700, maxZ: -600 }])).toBe(0);
  });
  it('encodes any byte pattern', () => {
    const bytes = new Uint8Array([0, 255, 1, 128, 77, 3, 200]);
    expect([...base64ToBits(bitsToBase64(bytes), bytes.length)]).toEqual([...bytes]);
    expect([...base64ToBits('not base64 !!', 3)]).toHaveLength(3);
  });
  it('sees farther from up high, and fog has three levels', () => {
    expect(revealRadius(0)).toBe(REVEAL.base);
    expect(revealRadius(50)).toBeGreaterThan(revealRadius(10));
    expect(revealRadius(1000)).toBe(REVEAL.max);
    expect([fogLevel(true, false), fogLevel(false, true), fogLevel(false, false)]).toEqual([0, 1, 2]);
  });
  it('saves under progress.map; an old save without it loads with nothing discovered', () => {
    const old = sanitizeProgress({ step: 12, trophies: [1, 2], districts: ['gcpd', 'docks'] });
    expect(old.map).toEqual({ cells: '', vistas: [], ft: [], wps: [], crimes: {} });
    expect(old.step).toBe(12);
    const m = new Map();
    const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
    saveProgress(st, { ...old, map: { cells: 'AAAA', vistas: ['exchangeTop'], ft: ['elKane'], wps: [{ x: 1, y: 2, z: 3, c: 2 }] } });
    expect(loadProgress(st).map).toEqual({ cells: 'AAAA', vistas: ['exchangeTop'], ft: ['elKane'], wps: [{ x: 1, y: 2, z: 3, c: 2 }], crimes: {} });
  });
  it('sanitises a damaged map save', () => {
    expect(sanitizeMapSave(null)).toEqual({ cells: '', vistas: [], ft: [], wps: [], crimes: {} });
    const s = sanitizeMapSave({ cells: '<script>', vistas: ['ok', 3, 'bad id!'], ft: 'x', wps: [{ x: 'a' }, { x: 1, z: 2, c: 99 }, ...Array(10).fill({ x: 0, z: 0 })] });
    expect(s.cells).toBe('');
    expect(s.vistas).toEqual(['ok']);
    expect(s.ft).toEqual([]);
    expect(s.wps).toHaveLength(6);
    expect(s.wps[0]).toEqual({ x: 1, y: 0, z: 2, c: 0 });
  });
});

describe('waypoints', () => {
  it('places coloured marks per player, caps them, removes and toggles', () => {
    const b = createWaypointBook();
    const a = b.add(0, { x: 10, z: 10 });
    const c = b.add(0, { x: 50, z: 10 });
    expect(a.c).not.toBe(c.c);
    expect(b.add(0, { x: 0, z: 0 }, { color: 4 }).c).toBe(4);
    for (let i = 0; i < 10; i++) b.add(0, { x: i * 100, z: 0 });
    expect(b.marksOf(0)).toHaveLength(MAX_MARKS);
    expect(b.marksOf(1)).toHaveLength(0);
    const before = b.marksOf(0).length;
    expect(b.removeNear(0, 500, 2, 5)).toBeTruthy();
    expect(b.marksOf(0)).toHaveLength(before - 1);
    expect(b.toggle(0, { x: 600, z: 0 }, 10)).toBe(null); // there was one: removed
    expect(b.toggle(0, { x: 4000, z: 0 }, 10)).toBeTruthy(); // none: placed
  });
  it('routes to a pinned target, else the newest own mark, else a mark left for you, else the objective', () => {
    const b = createWaypointBook();
    const obj = { x: 1, y: 0, z: 1 };
    expect(b.routeTarget(0, obj)).toBe(obj);
    b.add(1, { x: 5, z: 5 }, { forPlayer: 0 });
    expect(b.routeTarget(0, obj)).toMatchObject({ x: 5, z: 5 });
    expect(b.routeTarget(1, obj)).toBe(obj); // a mark for the partner is not your own route
    const m = b.add(0, { x: 9, z: 9 });
    expect(b.routeTarget(0, obj)).toBe(m);
    b.pin(0, { x: -3, y: 0, z: -3, label: 'Crime' });
    expect(b.routeTarget(0, obj)).toMatchObject({ x: -3, label: 'Crime' });
    b.pin(0, null);
    b.remove(0, m.id);
    expect(b.routeTarget(0, obj)).toMatchObject({ x: 5, z: 5 });
  });
  it('tracks mapMark events: moving targets, ttl, removal, and a downed target', () => {
    const b = createWaypointBook();
    const goon = { pos: { x: 1, y: 0, z: 2 }, alive: true };
    b.track({ id: 'dart1', kind: 'tracker', target: goon, ttl: 5, player: 0 });
    b.track({ id: 'van', kind: 'vehicle', pos: { x: 9, y: 0, z: 9 } });
    expect(b.tracked).toHaveLength(2);
    goon.pos.x = 7;
    expect(b.trackedPos(b.tracked[0]).x).toBe(7);
    b.update(6);
    expect(b.tracked.map((m) => m.id)).toEqual(['van']);
    b.track({ id: 'g2', target: goon, ttl: 30 });
    goon.alive = false;
    b.update(0.1);
    expect(b.tracked.map((m) => m.id)).toEqual(['van']);
    b.track({ id: 'van', remove: true });
    expect(b.tracked).toHaveLength(0);
    expect(b.track({ kind: 'nope' })).toBe(null);
  });
  it('keeps a fixed ring of breadcrumbs', () => {
    const b = createWaypointBook();
    expect(b.crumb(0, 0, 0)).toBe(true);
    expect(b.crumb(0, 1, 0)).toBe(false); // too close
    for (let i = 1; i < BREADCRUMB.count + 20; i++) b.crumb(0, i * 20, 0);
    const xs = [];
    b.eachCrumb(0, (x) => xs.push(x));
    expect(xs).toHaveLength(BREADCRUMB.count);
    expect(xs[xs.length - 1]).toBe((BREADCRUMB.count + 19) * 20);
  });
  it('saves and loads player 1 marks', () => {
    const b = createWaypointBook();
    b.add(0, { x: 1, y: 2, z: 3 }, { color: 3 });
    const saved = b.save(0);
    const c = createWaypointBook();
    c.load(0, saved);
    expect(c.marksOf(0)[0]).toMatchObject({ x: 1, y: 2, z: 3, c: 3 });
  });
});

describe('minimap rules', () => {
  it('widens with speed, altitude and the way you move', () => {
    expect(zoomRadius({ mode: 'foot' })).toBe(MINIMAP.radius.foot);
    expect(zoomRadius({ mode: 'drive', speed: 20 })).toBeGreaterThan(zoomRadius({ mode: 'drive', speed: 5 }));
    expect(zoomRadius({ mode: 'glide', altitude: 60 })).toBeGreaterThan(zoomRadius({ mode: 'glide', altitude: 5 }));
    expect(zoomRadius({ mode: 'fly' })).toBeGreaterThan(zoomRadius({ mode: 'drive' }));
    expect(zoomRadius({ mode: 'fly', speed: 500, altitude: 500 })).toBe(MINIMAP.max);
    expect(moveMode({ driving: true })).toBe('drive');
    expect(moveMode({ gliding: true })).toBe('glide');
    expect(moveMode({ flying: true, driving: true })).toBe('fly');
  });
  it('shows enemies only when detected', () => {
    const e = { alive: true };
    expect(enemyVisible(e)).toBe(false);
    expect(enemyVisible(e, { detective: true, dist: 20 })).toBe(true);
    expect(enemyVisible(e, { detective: true, dist: 200 })).toBe(false);
    expect(enemyVisible(e, { marked: true })).toBe(true);
    expect(enemyVisible(e, { drone: true })).toBe(true);
    expect(enemyVisible({ alive: false }, { marked: true })).toBe(false);
    expect(enemyVisible(e, { flags: { ...DEFAULT_FLAGS, enemiesAlways: true } })).toBe(true);
  });
  it('cues height, clamps to the rim, and turns the map with the player', () => {
    expect(heightCue(30)).toBe('up');
    expect(heightCue(-6)).toBe('down');
    expect(heightCue(2)).toBe(null);
    expect(clampToRim(3, 4, 10)).toMatchObject({ x: 3, y: 4, edge: false });
    const r = clampToRim(30, 40, 10);
    expect(r.edge).toBe(true);
    expect(Math.hypot(r.x, r.y)).toBeCloseTo(10, 6);
    // North-up: a point 10 m north is straight up.
    const n = worldToMinimap(0, -10, 0, 0, 100, 100, 0);
    expect(n.x).toBeCloseTo(0, 6); expect(n.y).toBeCloseTo(-10, 6);
    // Rotating map (rot = yaw - PI): what is ahead of a player facing east (yaw PI/2) is up.
    const yaw = Math.PI / 2;
    const a = worldToMinimap(10, 0, 0, 0, 100, 100, -(Math.PI - yaw));
    expect(a.x).toBeCloseTo(0, 6); expect(a.y).toBeCloseTo(-10, 6);
  });
});

describe('air hint (on foot and gliding)', () => {
  const pts = [
    { x: 0, y: 40, z: -60 },   // ahead, high: a good perch
    { x: 0, y: 5, z: -60 },    // ahead but too low to glide to from 40 m? no: low is fine to glide down to
    { x: 60, y: 40, z: 0 },    // off to the side: outside the cone
    { x: 0, y: 200, z: -60 },  // far too high to grapple
    { x: 0, y: 45, z: -140 },  // the next hop
  ];
  it('chains reachable perches toward the target', () => {
    const chain = perchChain({ x: 0, y: 30, z: 0 }, { x: 0, y: 0, z: -400 }, pts);
    expect(chain.length).toBeGreaterThanOrEqual(2);
    expect(chain[0]).toMatchObject({ x: 0, y: 40, z: -60 });
    expect(chain[1]).toMatchObject({ z: -140 });
    expect(perchChain({ x: 0, y: 30, z: 0 }, { x: 0, y: 0, z: -50 }, pts)).toEqual([]); // close: none needed
  });
  it('lays a capped trail of markers along the chain', () => {
    const out = new Float32Array(AIR.maxMarkers * 3);
    const n = trailMarkers({ x: 0, y: 30, z: 0 }, [{ x: 0, y: 40, z: -60 }], { x: 0, y: 0, z: -2000 }, out);
    expect(n).toBe(AIR.maxMarkers);
    expect(out[2]).toBeLessThan(0);
  });
});

describe('fast travel', () => {
  const points = [
    { id: 'elKane', kind: 'el', x: -90, y: 8.55, z: -449 },
    { id: 'mileBatwingDrop', kind: 'batwing', x: 197, y: 100, z: -623 },
    { id: 'batcaveDowntown', kind: 'batcave', x: -137, y: -5.5, z: -305 },
  ];
  it('unlocks by a first visit; the Batcave is always known; saved ids load', () => {
    const ft = createFastTravel({ points });
    expect(ft.isUnlocked('elKane')).toBe(false);
    expect(ft.isUnlocked('batcaveDowntown')).toBe(true);
    expect(ft.visit(-90, 0, -449 + FAST_TRAVEL.unlockRadius.el + 5)).toEqual([]);
    expect(ft.visit(-95, 0.2, -440).map((p) => p.id)).toEqual(['elKane']);
    expect(ft.isUnlocked('elKane')).toBe(true);
    const again = createFastTravel({ points, unlocked: ['mileBatwingDrop', 'unknownPoint'] });
    expect(again.isUnlocked('mileBatwingDrop')).toBe(true);
    expect(again.unlockedIds()).toEqual(['mileBatwingDrop']);
  });
  it('refuses in a fight, a scene, a chase, a vehicle, under high heat, and when another system vetoes', () => {
    expect(travelRules({})).toBe(null);
    for (const s of [{ dead: true }, { playing: false }, { inCombat: true }, { stealthRoom: true }, { stepForbids: true }, { crimeEngaged: true }, { challenge: true }, { chase: true }, { inVehicle: true }, { heat: 5 }]) {
      expect(travelRules(s), JSON.stringify(s)).toBeTruthy();
    }
    expect(travelRules({ heat: 1 })).toBe(null);
    const ft = createFastTravel({ points });
    expect(ft.canFastTravel({ id: 0 }, {}).ok).toBe(true);
    const off = ft.addVeto((p) => (p.id === 1 ? 'Player 2 is in the Batcave.' : null));
    expect(ft.canFastTravel({ id: 0 }, {}).ok).toBe(true);
    expect(ft.canFastTravel({ id: 1 }, {})).toEqual({ ok: false, reason: 'Player 2 is in the Batcave.' });
    off();
    expect(ft.canFastTravel({ id: 1 }, {}).ok).toBe(true);
    expect(ft.canFastTravel({ id: 0 }, { inCombat: true }).ok).toBe(false);
  });
  it('places both heroes on ground near the point, never inside a wall, and in the air for a drop', () => {
    const ground = (x, y, z) => (x > 2 && x < 4 ? 30 : 8.55); // a wall-top strip east of the point
    const spots = arrivalSpots({ x: 0, y: 8.55, z: 0 }, 2, { groundAt: ground, free: (x) => x < 6 });
    expect(spots).toHaveLength(2);
    expect(spots[0]).toEqual({ x: 0, y: 8.55, z: 0 });
    expect(spots[1].y).toBe(8.55);
    expect(Math.hypot(spots[1].x, spots[1].z)).toBeGreaterThan(2);
    const air = arrivalSpots({ x: 197, y: 100, z: -623 }, 2, { groundAt: () => 40 });
    expect(air[0].y).toBe(100);
    expect(air[1].y).toBe(100);
    expect(Math.hypot(air[1].x - 197, air[1].z + 623)).toBeGreaterThan(1);
  });
  it('advances the clock by the trip', () => {
    expect(travelMinutes({ x: 0, z: 0 }, { kind: 'el', x: 0, z: -900 })).toBeGreaterThan(travelMinutes({ x: 0, z: 0 }, { kind: 'el', x: 0, z: -100 }));
    expect(travelMinutes({ x: 0, z: 0 }, { kind: 'batwing', x: 0, z: 0 })).toBe(FAST_TRAVEL.batwingMinutes);
  });
});

describe('map settings, stations, floor plans', () => {
  it('sanitises the map settings; old settings without them load the defaults', () => {
    expect(sanitizeMapSettings(undefined)).toEqual({ ...DEFAULT_MAP_SETTINGS });
    expect(sanitizeMapSettings({ rotate: true, minimap: 'no' })).toMatchObject({ rotate: true, minimap: true });
    const s = sanitizeSettings({ sensitivity: 1.2 });
    expect(s.map).toEqual({ ...DEFAULT_MAP_SETTINGS });
    expect(DEFAULT_SETTINGS.bindings.map).toEqual(['KeyM']);
    expect(DEFAULT_SETTINGS.bindings.waypoint).toEqual(['KeyN']);
  });
  it('opens stations by id and is safe for unknown ones', () => {
    let opened = null;
    const off = registerStation('testStation', (o) => { opened = o; });
    expect(hasStation('testStation')).toBe(true);
    expect(openStation('testStation', { a: 1 })).toBeTruthy(); // merged registry returns a handle
    expect(opened).toEqual({ a: 1 });
    off();
    expect(hasStation('testStation')).toBe(false);
    expect(hasStation('nothingHere')).toBe(false);
  });
  it('registers floor plans, and makes one from a room record', () => {
    const shapes = planFromRoom(INTERIOR_ROOMS.funhouse);
    expect(shapes.some((s) => s.kind === 'door')).toBe(true);
    const off = registerFloorPlan('testRoom', shapes, { label: 'Funhouse' });
    expect(floorPlanFor('testRoom').label).toBe('Funhouse');
    const b = planBounds(floorPlanFor('testRoom'));
    expect(b.minX).toBeLessThanOrEqual(INTERIOR_ROOMS.funhouse.bounds.minX);
    off();
    expect(floorPlanFor('testRoom')).toBe(null);
    expect(floorPlanFor(null)).toBe(null);
  });
});

describe('progress page, city-wide', () => {
  it('keeps the core MAP_BOUNDS and adds the whole city; counts progress per district', async () => {
    const { MAP_BOUNDS, CITY_MAP_BOUNDS, districtProgress, mapModel } = await import('../../src/game/mapModel.js');
    const { districtLines, districtFraction } = await import('../../src/ui/progressMap.js');
    const { TROPHIES } = await import('../../src/config/trophySpots.js');
    expect(MAP_BOUNDS).toEqual({ minX: -236, maxX: 236, minZ: -236, maxZ: 280 });
    expect(CITY_MAP_BOUNDS).toEqual(CITY_BOUNDS);
    const progress = sanitizeProgress({ trophies: [0, 1], districts: ['gcpd', 'loop'], challenges: { a: { best: 1, medal: 'gold' } }, map: { crimes: { loop: 3 } } });
    const rows = districtProgress({ trophies: TROPHIES, challenges: [{ id: 'a', x: 0, z: -400 }, { id: 'b', x: 0, z: -420 }], progress });
    const loop = rows.find((r) => r.id === 'loop');
    expect(loop).toMatchObject({ visited: true, medals: { won: 1, gold: 1, total: 2 }, crimes: { stopped: 3 } });
    expect(loop.crimes.spots).toBeGreaterThan(0);
    expect(rows.reduce((a, r) => a + r.trophies.total, 0)).toBeLessThanOrEqual(TROPHIES.length);
    expect(districtFraction(loop)).toBeCloseTo(0.5, 6);
    const m = mapModel({ buildings: [], trophies: TROPHIES, challenges: [{ id: 'a', x: 0, z: -400 }], progress });
    expect(m.trophies.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z))).toBe(true);
    const lines = districtLines(m);
    expect(lines.some((l) => l.startsWith('The Loop:') && l.includes('crimes stopped 3'))).toBe(true);
    expect(lines.some((l) => l.startsWith('Bristol'))).toBe(false); // not visited
  });
});
