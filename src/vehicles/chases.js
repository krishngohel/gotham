// Chases and vehicle combat as building blocks (workstream L3, `[move]`). Mission and crime
// agents call these through `vehicles.chases` (documented in docs/design/vehicles.md); each one
// ends through `onDone({ ok, why })` and the matching event, and `vehicles.debugWin()` wins
// whichever is running.
//
//   startPursuit(opts)   a getaway on the street graph (src/vehicles/chaseAI.js): escape logic,
//                        rubber band, outcome by rams and/or the immobiliser (battle mode turret)
//   startConvoy(opts)    an armoured convoy: a lead truck on a calm route with trucks in line
//                        behind; stop every truck (rams or immobiliser) before it gets away
//   startTail(opts)      "follow without being seen": stay close enough, never too close in view
//   startTimeTrial(id)   checkpoint runs on the new roads (TIME_TRIALS below)
//   raiseBridge(id) / lowerBridge(id), setPiece(kind, data): set-piece hooks (bridge raise, the El
//                        pillar crash); a raised bridge is never routed over by chase AI
// Events: chaseStart { kind, id }, chaseHit { id, hits, stop }, chaseEnd { kind, id, ok, why },
// timeTrialCheckpoint { id, index, of }, timeTrialEnd { id, ok, time, par }, vehicleSetPiece.
import * as THREE from 'three';
import { createPursuitTarget, stepPursuitTarget, createTail, stepTail } from './chaseAI.js';
import { createRamCounter } from './vehiclePhysics.js';
import { createJokerVan, createStreetVehicle } from './vehicleModels.js';
import { LAYER_FX } from '../render/layers.js';
import { RIVERFRONT } from '../world/regions/streets.js';
import { EAST } from '../world/regions/eastLayout.js';
import { LEVELS } from '../world/regions/data.js';

// Checkpoint runs: waypoints (each leg routed on the street graph), a par time (seconds) for the
// win and a start heading. y picks the deck where two roads stack.
export const TIME_TRIALS = {
  lakeshoreSprint: { name: 'Lakeshore Sprint', par: 75, pts: [{ x: EAST.lsd.x, z: -719 }, { x: EAST.lsd.x, z: -450 }, { x: EAST.lsd.viaductX, z: -260 }, { x: EAST.lsd.x, z: -30 }, { x: EAST.lsd.x, z: 150 }] },
  lowerGothamDecks: { name: 'Lower Gotham Decks', par: 70, pts: [
    { x: RIVERFRONT.plazaW + 4, y: 0, z: RIVERFRONT.northHalfZ }, { x: 0, y: 0, z: RIVERFRONT.upperZ }, { x: RIVERFRONT.plazaE - 4, y: 0, z: RIVERFRONT.northHalfZ },
    { x: RIVERFRONT.covered[1] - 10, y: LEVELS.lowerDeck, z: RIVERFRONT.upperZ }, { x: 0, y: LEVELS.lowerDeck, z: RIVERFRONT.upperZ }, { x: RIVERFRONT.covered[0] + 10, y: LEVELS.lowerDeck, z: RIVERFRONT.upperZ },
  ] },
  bristolHill: { name: 'Bristol Hill Climb', par: 80, graphRoad: 'bristol' },
};

const drivable = (e) => e.lanes > 0 && e.deck !== 'walk' && e.kind !== 'walk';

export function createChases({ scene, collision, events, graph, rng, bridges = null, getCar, meter, toast }) {
  const running = new Map();
  let nextId = 1;
  const blocked = (e) => !!(e.bridge && bridges && bridges.isDown(e.bridge) === false);

  function groundSnap(m, y) {
    const g = collision.groundBelow(m.group.position.x, y + 1.5, m.group.position.z, 0.3);
    m.group.position.y = g > -Infinity ? g : y;
  }
  function spawnModel(model) {
    const m = model === 'gangVan' || !model ? createJokerVan() : createStreetVehicle(model);
    m.radius = m.radius ?? 2.2;
    m.v = { speed: 0, yaw: 0, drift: 0 };
    m.tuning = { maxSpeed: 30, wallRestitution: 0.2, driftLateralMul: 0.9 };
    scene.add(m.group);
    return m;
  }
  function place(m, t) {
    m.group.position.x = t.x; m.group.position.z = t.z;
    groundSnap(m, t.y);
    const dy = Math.atan2(Math.sin(t.yaw - m.v.yaw), Math.cos(t.yaw - m.v.yaw));
    m.v.yaw += dy * 0.25;
    m.v.speed = t.speed;
    m.group.rotation.set(0, m.v.yaw, 0);
    if (m.wheels) for (const w of m.wheels) w.spin.rotation.x -= (t.speed / (m.wheelRadius ?? 0.4)) * (1 / 60);
    m.update?.(1 / 60);
  }

  function finish(c, ok, why) {
    if (!running.has(c.id)) return;
    running.delete(c.id);
    for (const u of c.units) scene.remove(u.m.group);
    if (c.ring) scene.remove(c.ring);
    meter?.hide();
    events.emit('chaseEnd', { kind: c.kind, id: c.id, ok, why });
    if (c.kind === 'timeTrial') events.emit('timeTrialEnd', { id: c.trial, ok, time: c.t, par: c.par });
    c.onDone?.({ ok, why, time: c.t });
  }

  // opts: { from {x,y,z}, model ('gangVan' | any fleet type), outcome 'ram' | 'immobilise' |
  //   'either', hits (rams to win, 3), stop (immobiliser hp, 100), speed, escapeDist (220 m),
  //   escapeT (8 s), timeLimit (120 s), label, onDone }
  function startPursuit(opts = {}) {
    const car = getCar();
    const from = opts.from ?? (car ? { x: car.x + 40, y: car.y, z: car.z } : { x: 30, y: 0, z: 30 });
    const t = createPursuitTarget(graph, from, rng, { speed: opts.speed ?? 21, awayFrom: car, mode: 'flee' });
    if (!t) { opts.onDone?.({ ok: false, why: 'noRoad' }); return null; }
    const m = spawnModel(opts.model);
    m.v.yaw = t.yaw;
    const c = {
      id: nextId++, kind: 'pursuit', units: [{ m, t, ram: createRamCounter(opts.hits ?? 3, 0.6), need: opts.hits ?? 3, stop: opts.stop ?? 100, out: false }],
      outcome: opts.outcome ?? 'either', escapeDist: opts.escapeDist ?? 220, escapeT: opts.escapeT ?? 8, farT: 0, t: 0,
      timeLimit: opts.timeLimit ?? 120, onDone: opts.onDone, label: opts.label ?? 'GETAWAY',
    };
    running.set(c.id, c);
    meter?.show(`${c.label}  0/${opts.hits ?? 3}`);
    events.emit('chaseStart', { kind: c.kind, id: c.id });
    return c;
  }

  // opts: { from, trucks (3), spacing (14 m), model ('box_truck'), speed (15), onDone }
  function startConvoy(opts = {}) {
    const car = getCar();
    const from = opts.from ?? (car ? { x: car.x + 60, y: car.y, z: car.z } : { x: 30, y: 0, z: 30 });
    const lead = createPursuitTarget(graph, from, rng, { speed: opts.speed ?? 15, maxSpeed: 24, mode: 'tail', awayFrom: car });
    if (!lead) { opts.onDone?.({ ok: false, why: 'noRoad' }); return null; }
    const n = opts.trucks ?? 3, spacing = opts.spacing ?? 14;
    const units = [];
    for (let i = 0; i < n; i++) {
      const m = spawnModel(opts.model ?? 'box_truck');
      m.armoured = true;
      units.push({ m, t: i === 0 ? lead : { x: lead.x, y: lead.y, z: lead.z, yaw: lead.yaw, speed: 0 }, ram: createRamCounter(opts.hits ?? 4, 0.6), stop: opts.stop ?? 140, out: false, lag: i * spacing });
    }
    const c = { id: nextId++, kind: 'convoy', units, trail: [], t: 0, timeLimit: opts.timeLimit ?? 180, onDone: opts.onDone, label: 'CONVOY', outcome: 'either', escapeDist: 400, escapeT: 10, farT: 0 };
    running.set(c.id, c);
    meter?.show(`CONVOY  ${n} left`);
    events.emit('chaseStart', { kind: c.kind, id: c.id });
    return c;
  }

  // opts: { from, model, nodes (how many junctions until it arrives: 12), onDone }
  function startTail(opts = {}) {
    const car = getCar();
    const from = opts.from ?? (car ? { x: car.x + 50, y: car.y, z: car.z } : { x: 30, y: 0, z: 30 });
    const t = createPursuitTarget(graph, from, rng, { speed: opts.speed ?? 14, mode: 'tail' });
    if (!t) { opts.onDone?.({ ok: false, why: 'noRoad' }); return null; }
    const m = spawnModel(opts.model ?? 'sedan_deco');
    m.v.yaw = t.yaw;
    const c = { id: nextId++, kind: 'tail', units: [{ m, t, ram: createRamCounter(99, 0.6), stop: 100, out: false }], tail: createTail(), nodes: opts.nodes ?? 12, t: 0, timeLimit: opts.timeLimit ?? 240, onDone: opts.onDone, label: 'TAIL' };
    running.set(c.id, c);
    meter?.show('TAIL  hang back');
    events.emit('chaseStart', { kind: c.kind, id: c.id });
    return c;
  }

  // ---- time trials ----
  const ringGeo = new THREE.TorusGeometry(5.5, 0.35, 6, 24);
  function trialPoints(def) {
    if (def.graphRoad) {
      // The longest run of one region's road: the hill road's own nodes, south to north.
      const nodes = graph.nodes.filter((n) => n.region === def.graphRoad && n.deck !== 'walk');
      nodes.sort((a, b) => a.z - b.z);
      const step = Math.max(1, Math.floor(nodes.length / 6));
      const pick = [];
      for (let i = 0; i < nodes.length; i += step) pick.push(nodes[i]);
      const out = [];
      for (let i = 0; i + 1 < pick.length; i++) {
        const r = graph.routeBetween(pick[i], pick[i + 1]);
        if (r) for (const p of r.points) out.push(p);
      }
      return thin(out, 60);
    }
    const out = [];
    for (let i = 0; i + 1 < def.pts.length; i++) {
      const r = graph.routeBetween(def.pts[i], def.pts[i + 1]);
      if (r) for (const p of r.points) out.push(p);
    }
    return thin(out, 55);
  }
  // Checkpoints every `gap` metres along the route.
  function thin(pts, gap) {
    const out = [];
    let acc = gap;
    for (let i = 0; i < pts.length; i++) {
      if (i > 0) acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      if (acc >= gap || i === pts.length - 1) { out.push({ ...pts[i] }); acc = 0; }
    }
    return out;
  }
  function startTimeTrial(id, { onDone } = {}) {
    const def = TIME_TRIALS[id];
    if (!def) { onDone?.({ ok: false, why: 'unknown' }); return null; }
    const cps = trialPoints(def);
    if (cps.length < 2) { onDone?.({ ok: false, why: 'noRoad' }); return null; }
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a }));
    ring.layers.set(LAYER_FX);
    scene.add(ring);
    const c = { id: nextId++, kind: 'timeTrial', trial: id, units: [], cps, idx: 1, t: 0, par: def.par, timeLimit: def.par * 2, ring, onDone, label: def.name, start: cps[0] };
    running.set(c.id, c);
    showRing(c);
    meter?.show(`${def.name.toUpperCase()}  0:00`);
    events.emit('chaseStart', { kind: c.kind, id: c.id, trial: id });
    return c;
  }
  function showRing(c) {
    const p = c.cps[c.idx], q = c.cps[Math.min(c.cps.length - 1, c.idx + 1)];
    const g = collision.groundBelow(p.x, (p.y ?? 0) + 1.5, p.z, 0.3);
    c.ring.position.set(p.x, (g > -Infinity ? g : p.y ?? 0) + 4, p.z);
    c.ring.rotation.set(0, Math.atan2(q.x - p.x, q.z - p.z) || 0, 0);
  }

  function update(dt) {
    if (!running.size) return;
    const car = getCar();
    for (const c of [...running.values()]) {
      c.t += dt;
      if (c.kind === 'timeTrial') {
        if (car) {
          const p = c.cps[c.idx];
          if (Math.hypot(car.x - p.x, car.z - p.z) < 9 && Math.abs(car.y - (p.y ?? car.y)) < 4) {
            events.emit('timeTrialCheckpoint', { id: c.trial, index: c.idx, of: c.cps.length - 1 });
            c.idx++;
            if (c.idx >= c.cps.length) { finish(c, c.t <= c.par, c.t <= c.par ? 'par' : 'slow'); continue; }
            showRing(c);
          }
        }
        c.ring.rotation.z += dt;
        meter?.set(`${c.label.toUpperCase()}  ${Math.floor(c.t / 60)}:${String(Math.floor(c.t % 60)).padStart(2, '0')}  ${c.idx}/${c.cps.length - 1}`);
        if (c.t > c.timeLimit) finish(c, false, 'time');
        continue;
      }
      const lead = c.units[0].t;
      if (c.kind === 'convoy') {
        stepPursuitTarget(graph, lead, dt, car, rng, blocked);
        c.trail.push(lead.x, lead.y, lead.z, lead.yaw);
        if (c.trail.length > 4 * 400) c.trail.splice(0, 4);
        for (let i = 0; i < c.units.length; i++) {
          const u = c.units[i];
          if (u.out) continue;
          if (i > 0) trailAt(c.trail, u.lag, u.t, lead.speed);
          place(u.m, u.t);
        }
      } else {
        const u = c.units[0];
        if (!u.out) { stepPursuitTarget(graph, u.t, dt, car, rng, blocked); place(u.m, u.t); }
      }
      if (c.kind === 'tail') {
        const d = car ? Math.hypot(car.x - lead.x, car.z - lead.z) : 999;
        stepTail(c.tail, d, d < 60, dt);
        meter?.set(`TAIL  ${c.tail.suspicion > 0.6 ? 'TOO CLOSE!' : d > 110 ? 'falling behind' : 'hang back'}`);
        if (c.tail.status === 'spotted') finish(c, false, 'spotted');
        else if (c.tail.status === 'lost') finish(c, false, 'lost');
        else if (lead.nodesVisited >= c.nodes) finish(c, true, 'arrived');
        continue;
      }
      // Escape: too far for too long, or out of time.
      const live = c.units.filter((u) => !u.out);
      if (!live.length) { finish(c, true, 'stopped'); continue; }
      const nearest = car ? Math.min(...live.map((u) => Math.hypot(car.x - u.m.group.position.x, car.z - u.m.group.position.z))) : 0;
      c.farT = nearest > c.escapeDist ? c.farT + dt : 0;
      if (c.farT > c.escapeT) finish(c, false, 'escaped');
      else if (c.t > c.timeLimit) finish(c, false, 'time');
    }
  }
  // A follower's pose `lag` metres back along the leader's recorded trail.
  function trailAt(trail, lag, out, speed) {
    let acc = 0;
    for (let i = trail.length - 4; i >= 4; i -= 4) {
      acc += Math.hypot(trail[i] - trail[i - 4], trail[i + 2] - trail[i - 2]);
      if (acc >= lag) { out.x = trail[i]; out.y = trail[i + 1]; out.z = trail[i + 2]; out.yaw = trail[i + 3]; out.speed = speed; return; }
    }
    out.x = trail[0]; out.y = trail[1]; out.z = trail[2]; out.yaw = trail[3]; out.speed = 0;
  }

  // ---- the player's car meets a chase unit ----
  function unitHit(c, u, kind, amount = 1) {
    if (u.out) return;
    if (kind === 'ram') { if (!u.ram.ram()) return; }
    else u.stop -= amount;
    const done = (c.outcome !== 'immobilise' && u.ram.done) || (c.outcome !== 'ram' && u.stop <= 0);
    events.emit('chaseHit', { id: c.id, hits: u.ram.hits, stop: Math.max(0, u.stop) });
    if (done) {
      u.out = true;
      u.m.v.speed = 0;
      u.m.setDamage?.(2);
      events.emit('word', { text: 'KRUNCH!', pos: u.m.group.position.clone().setY(u.m.group.position.y + 1.4), big: true });
    }
    if (c.kind === 'convoy') meter?.set(`CONVOY  ${c.units.filter((x) => !x.out).length} left`);
    else meter?.set(`${c.label}  ${u.ram.hits}/${u.need ?? 3}`);
    if (c.units.every((x) => x.out)) finish(c, true, 'stopped');
  }
  // Every live unit as a ram target ({ group, radius, v, chase, unit }), reused.
  const ramList = [];
  function rammables() {
    ramList.length = 0;
    for (const c of running.values()) for (const u of c.units) if (!u.out && c.kind !== 'tail') { u.m.chaseRef = c; u.m.unitRef = u; ramList.push(u.m); }
    return ramList;
  }
  // Turret targets: manned vehicles (the immobiliser round), as { x, y, z, vehicle: true, m }.
  const targetList = [];
  function turretTargets() {
    targetList.length = 0;
    for (const c of running.values()) for (const u of c.units) if (!u.out && c.kind !== 'tail') {
      u.m.chaseRef = c; u.m.unitRef = u;
      u.tgt ??= { x: 0, y: 0, z: 0, vehicle: true, unmanned: false, m: u.m };
      u.tgt.x = u.m.group.position.x; u.tgt.y = u.m.group.position.y + 1; u.tgt.z = u.m.group.position.z;
      targetList.push(u.tgt);
    }
    return targetList;
  }

  function raiseBridge(id) { bridges?.hold(id, 'up'); events.emit('vehicleSetPiece', { kind: 'bridgeRaise', id }); }
  function lowerBridge(id) { bridges?.hold(id, null); events.emit('vehicleSetPiece', { kind: 'bridgeLower', id }); }
  function setPiece(kind, data = {}) { events.emit('vehicleSetPiece', { kind, ...data }); }

  return {
    startPursuit, startConvoy, startTail, startTimeTrial, update, raiseBridge, lowerBridge, setPiece,
    // mul: the ram damage multiplier (carRamDamage): a harder ram also drains the stop meter.
    rammed(m, mul = 1) { if (!m.chaseRef) return; if (mul > 1) unitHit(m.chaseRef, m.unitRef, 'stop', 20 * (mul - 1)); unitHit(m.chaseRef, m.unitRef, 'ram'); },
    immobilise(m, amount = 25) { if (m.chaseRef) unitHit(m.chaseRef, m.unitRef, 'stop', amount); },
    rammables, turretTargets,
    get running() { return running; },
    get active() { return running.size > 0; },
    stop(id, ok = false) { const c = running.get(id); if (c) finish(c, ok, 'stopped'); },
    debugWin() { for (const c of [...running.values()]) { finish(c, true, 'debug'); return true; } return false; },
    trialPoints: (id) => trialPoints(TIME_TRIALS[id]),
  };
}
