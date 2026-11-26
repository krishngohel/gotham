// Civilians and the living street (workstream M): the pedestrian simulation (pedSim.js) drawn by
// the crowd LOD (crowd.js), wired to the game: every player's surroundings are populated, people
// react to heroes, fights, gunfire, gadgets and rescues (reactions.js), call the police (an event
// the crime/dispatch side hears), police officers run to crimes, and the traffic brakes for anyone
// on a crossing. Pigeons scatter from heroes (ambient.js).
//
//   const civ = createCivilians({ scene, assets, quality, world, events, players, cameras, combat });
//   civ.update(dt, t)   once per frame after the world (game.js)
//   civ.registerSpot({ kind, x, y, z, yaw, cap })   benches, carts, platforms (data hook)
//
// Events emitted: 'civilianCall' { pos, district, kind } (someone phoned it in; throttled),
// 'dispatch' { kind, district } (the radio line for it), 'bark' { text, speaker: 'civilian', pos }
// (thank-you, cheers and boos). Events heard: 'impact', 'rifleShot', 'crimeSpawn' / 'crimeActive'
// (with pos or x/z), 'crimeEnd' (outcome 'stopped' near a hero is a rescue).
// Net (workstream D2): the simulation is seeded (one number) and runs locally on every machine;
// only reactions are worth sending as events (stimulus kind + position).
import { createRng } from '../core/rng.js';
import { REGION_DATA, regionDataAt } from '../world/regions/data.js';
import { createPedSim } from './pedSim.js';
import { createCrowd } from './crowd.js';
import { crowdTier, districtTable } from './archetypes.js';
import { THANKS, CHEERS, BOOS } from './reactions.js';
import { createAmbientLife } from './ambient.js';
import { pickHeadline } from './headlines.js';

// Spots the city already has: the Loop's newsstands (src/world/regions/loop.js) draw a reader or two.
const BUILTIN_SPOTS = [[-50, -427.3, 0], [-122, -530.7, Math.PI], [170, -427.3, 0]].map(([x, z, yaw]) => ({ kind: 'newspaper', x, y: 0, z: z + (yaw ? -1.6 : 1.6), yaw, cap: 2 }));

const tableOf = new Map(REGION_DATA.map((r) => [r.id, r.spawnTables?.civilians ?? null]));

export function createCivilians({ scene, assets, quality, world, events, players = null, cameras, combat = null, seed = 2024 }) {
  const tier = crowdTier(quality);
  // [world-content] Districts the heroes keep safe fill up at night; neglected ones empty
  // (src/openworld/director.js densityScale, set through setDensityScale). Cached per district.
  let densityScale = null;
  const moodCache = new Map();
  const moodTable = (d, t) => {
    if (!densityScale || !t) return t;
    const k = densityScale(d, world.clock?.hour ?? 23);
    if (k === 1) return t;
    let c = moodCache.get(d);
    if (!c || c.base !== t) { c = { base: t, table: { ...t } }; moodCache.set(d, c); }
    c.table.density = t.density * k;
    return c.table;
  };
  // Split screen drops one step (rendering research section 7): fewer full figures per view.
  const rng = createRng(seed);
  const traffic = world.traffic?.sim ?? null;
  const net = traffic?.net ?? null;
  const graph = world.streetGraph;
  let simT = 0;
  const sim = createPedSim({
    graph, cap: tier.cap, rng,
    districtAt: (x, z) => world.districtAt(x, z),
    tableAt: (x, z, d) => moodTable(d ?? world.districtAt(x, z), districtTable(d ?? world.districtAt(x, z), tableOf.get(regionDataAt(x, z)?.id) ?? null)),
    signalAt: (node, axis, t) => {
      const j = net && node >= 0 ? net.junctionOf[node] : -1;
      if (j < 0) return -1;
      const J = net.junctions[j];
      return J.signal ? traffic.signalState(J, axis, t) : -1;
    },
    carNear: (x, z, r) => {
      if (!traffic) return false;
      const vs = traffic.vehicles;
      for (let k = 0; k < vs.length; k++) { const v = vs[k]; if (v.active && Math.abs(v.x - x) < r && Math.abs(v.z - z) < r && v.speed > 0.5) return true; }
      return false;
    },
    hour: () => world.clock.hour,
    weather: () => world.weather.params,
    spawn: { min: Math.min(45, tier.fullRadius * 0.9), max: tier.drawRadius * 0.75, despawn: tier.drawRadius * 0.95 },
    visible: (x, y, z) => inView(x, y, z),
    routeTo: (a, x, z) => graph.routeBetween(a, { x, z }, { lane: 8.5 })?.points ?? null,
  });
  const crowd = createCrowd({ scene, assets, quality, sim, tier, cameras });
  for (const s of BUILTIN_SPOTS) sim.registerSpot(s);
  const recent = []; // crime outcomes for the headlines
  const ambient = createAmbientLife({ scene, quality, world });

  // Anchors: every player's hero, plus the camera when it is away from all of them.
  const anchors = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0 }));
  const heroes = () => {
    const list = players?.list ?? players ?? [];
    return Array.isArray(list) ? list : [];
  };
  function gather() {
    let n = 0;
    for (const p of heroes()) { const h = p?.hero ?? p; if (h?.pos && n < 3) { anchors[n].x = h.pos.x; anchors[n].y = h.pos.y; anchors[n].z = h.pos.z; n++; } }
    const cams = cameras();
    for (const c of cams) {
      if (n >= anchors.length) break;
      let far = true;
      for (let k = 0; k < n; k++) if (Math.hypot(anchors[k].x - c.position.x, anchors[k].z - c.position.z) < 60) far = false;
      if (far) { anchors[n].x = c.position.x; anchors[n].y = Math.min(c.position.y, 2); anchors[n].z = c.position.z; n++; }
    }
    return n;
  }
  const camDir = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1 };
  function inView(x, y, z) {
    const cams = cameras();
    for (const c of cams) {
      const e = c.matrixWorld.elements;
      const dx = x - c.position.x, dy = y + 1 - c.position.y, dz = z - c.position.z, L = Math.hypot(dx, dy, dz) || 1;
      if ((dx * -e[8] + dy * -e[9] + dz * -e[10]) / L > 0.55 && L < 140) return true;
    }
    return false;
  }

  // ---- stimuli from the game ----
  let callT = -999, fightT = -999, rescueT = -999;
  const rep = () => combat?.reputation?.value ?? 50;
  const onCall = (a) => {
    if (simT - callT < 45) return;
    callT = simT;
    const district = world.districtAt(a.x, a.z);
    events?.emit('civilianCall', { pos: { x: a.x, y: a.y, z: a.z }, district, kind: 'assault' });
    events?.emit('dispatch', { kind: 'assault', district });
  };
  const posOf = (e) => (e?.pos && Number.isFinite(e.pos.x) ? e.pos : Number.isFinite(e?.x) ? e : null);
  events?.on('impact', (e) => {
    const p = posOf(e);
    if (!p) return;
    sim.stimulus('gadget', p.x, p.z, { radius: 4, y: p.y });
    if (simT - fightT < 0.8) return; // a brawl is a lot of impacts: once a second is plenty
    fightT = simT;
    sim.stimulus('fight', p.x, p.z, { rep: rep(), radius: 28, y: p.y, onCall });
    ambient.scare(p.x, p.y, p.z);
  });
  events?.on('rifleShot', (e) => {
    const p = e?.from ?? posOf(e);
    if (!p) return;
    sim.stimulus('gunfire', p.x, p.z, { rep: rep(), radius: 45, onCall });
    ambient.scare(p.x, p.y ?? 0, p.z, 30);
  });
  const crimeAt = (e) => {
    const p = posOf(e);
    if (!p) return;
    sim.respond(p.x, p.z);
    world.traffic?.dispatchSiren?.(p.x, p.z);
  };
  events?.on('crimeSpawn', crimeAt);
  events?.on('crimeActive', crimeAt);
  events?.on('crimeEnd', (e) => {
    recent.push({ kind: e?.kind ?? 'generic', district: e?.districtLabel ?? e?.district ?? null, outcome: e?.outcome }); // [world-content] the label reads better in a headline
    if (recent.length > 5) recent.shift();
    if (e?.outcome !== 'stopped' || simT - rescueT < 5) return;
    rescueT = simT;
    for (const p of heroes()) {
      const h = p?.hero ?? p;
      if (!h?.pos) continue;
      const n = sim.stimulus('rescue', h.pos.x, h.pos.z, { rep: rep(), radius: 30 });
      if (n > 0) events?.emit('bark', { text: THANKS[Math.floor(rng.next() * THANKS.length)], speaker: 'civilian', pos: { x: h.pos.x, y: h.pos.y, z: h.pos.z } });
    }
  });

  let seenT = 0, barkT = 0, totalMs = 0;
  const api = {
    sim, crowd, ambient,
    get stats() { return { ...crowd.stats, simActive: sim.active, cap: sim.cap, tier: tier.full, totalMs }; },
    registerSpot: (s) => sim.registerSpot(s),
    setDensityScale: (fn) => { densityScale = typeof fn === 'function' ? fn : null; }, // [world-content]
    // The Gazette's headline now (newsstands, billboards, radio: a data hook).
    headline: () => pickHeadline({ rep: rep(), recent, weather: world.weather.state }, rng.next()),
    // Something happened (other systems, net replay): kind per reactions.js.
    stimulus: (kind, x, z, opts = {}) => sim.stimulus(kind, x, z, { rep: rep(), onCall, ...opts }),
    // Traffic yield hook (cityLife.js): pedestrians on a crossing are obstacles.
    obstacles(put) {
      const ag = sim.agents;
      for (let k = 0; k < ag.length; k++) { const a = ag[k]; if (a.active && a.mode === 'cross' && a.crossing) put(a, 0.6); }
    },
    update(dt, t) {
      const t0 = performance.now();
      simT = t;
      const n = gather();
      sim.update(dt, t, anchors, n);
      // Heroes: people step aside as one walks through, and (now and then) notice one standing near.
      seenT -= dt;
      const look = seenT <= 0;
      if (look) seenT = 2.5;
      for (const p of heroes()) {
        const h = p?.hero ?? p;
        if (!h?.pos) continue;
        sim.heroPass(h.pos.x, h.pos.z, 2.4);
        ambient.near(h.pos.x, h.pos.y, h.pos.z);
        if (look && Math.hypot(h.vel?.x ?? 0, h.vel?.z ?? 0) < 4 && h.state !== 'glide') {
          const k = sim.stimulus('heroSeen', h.pos.x, h.pos.z, { rep: rep(), radius: 12, y: h.pos.y });
          barkT -= 2.5;
          if (k > 2 && barkT <= 0 && rng.next() < 0.35) {
            barkT = 20;
            const love = rep() >= 50;
            const lines = love ? CHEERS : BOOS;
            events?.emit('bark', { text: lines[Math.floor(rng.next() * lines.length)], speaker: 'civilian', pos: { x: h.pos.x + 4, y: h.pos.y, z: h.pos.z } });
          }
        }
      }
      crowd.update(dt);
      ambient.update(dt, t);
      totalMs = totalMs * 0.95 + (performance.now() - t0) * 0.05;
    },
    setVisible(on) { crowd.setVisible(on); },
  };
  return api;
}
