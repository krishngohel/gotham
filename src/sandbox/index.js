// [sandbox] The open-world sandbox (workstream W, `[sandbox]`): the small reactions that make the
// city feel like a place you can mess with, each budgeted and idle-cheap.
//
//   take any car      the vehicle key beside a moving or parked street car (traffic) takes it: the
//                     owner gets out, shouts, runs and phones it in (police attention: carTaken);
//                     Batman taking a civilian's car costs reputation. Hook: vehicles.setKeyHook.
//   car radio         src/sandbox/radio/radio.js
//   street furniture  src/sandbox/furniture.js (bins, cones, hydrants... collateral)
//   stunts            drift chains and jumps scored (src/sandbox/stunts.js), best scores saved;
//                     a jump near a bascule bridge or a ramp marks that spot on the map (found)
//   taxi              as Bruce, the vehicle key away from any car hails a cab to the waypoint (or
//                     Wayne Tower): the ride drives itself on the street graph; jump skips it
//   pedestrians       dive clear of a car on the pavement (vehicleDanger); never run over
//   arguments         a driver whose car you shoved at low speed gets out and argues
//
// PUBLIC (window.__game.sandbox): radio, furniture, stats, jackNear(player), hailTaxi(player, dest),
//   score { drift, jump }, update(dt, real)
// Events: carTaken { pos, type }, stuntScore { kind, pts, best }, stuntSpotFound { id, label },
//   taxiStart { dest }, taxiArrive { dest, skipped }, radioStation { id, name }, streetDamage.
// Ability ids for the onboarding layer (docs/design/wanted.md): takeCar, carRadio, hailTaxi.
import { withPlayer } from '../core/events.js';
import { createRadio } from './radio/radio.js';
import { createStreetFurniture } from './furniture.js';
import { createDrift, driftStep, jumpScore, fmt } from './stunts.js';
import { createCivilian } from '../actors/civilians/generator.js';
import { loadCivAnims } from '../actors/animPacks.js';
import { REGION_SITES } from '../world/regions/data.js';
import { capsFor } from '../wanted/caps.js';
import './save.js';

const OWNER_LINES = ['Hey! HEY! That\'s my car!', 'I just paid that off!', 'Is this a bit? Is somebody filming this?', 'Bring it back with a full tank!', 'Wait, was that... nah.'];
const ARGUE_LINES = ['Watch it, pal! I just had it washed!', 'Do you know how much a bumper costs?!', 'Insurance is going to LOVE this.', 'Learn to drive! Or fly! Whatever you do!'];
const DEST_DEFAULT = REGION_SITES.wayneTowerLobby ?? { x: 0, y: 0, z: -432 };
const TAXI_RANGE = 7;

export function createSandbox({ scene, world, events, players, vehicles, civilians = null, combat = null, quality, assets = null, progress, hud = null, nav = () => null, bruce = () => null, wanted = () => null, settings = () => ({}), isReplica = () => false, cameras = () => [], can = () => true }) { // [verify] can: the abilities layer (takeCar, carRadio, hailTaxi)
  const save = progress.sandbox;
  const caps = capsFor(quality);
  const list = () => players?.list ?? players ?? [];
  const radio = createRadio({ events, vehicles, players, hud, world, wanted, reducedMotion: () => !!settings().access?.reducedMotion, save, can }); // [verify] can
  const furniture = createStreetFurniture({ scene, world, events, caps, players });
  const stats = { ms: 0 };
  let simT = 0;

  // ---------------------------------------------------------------- the owner (one pooled figure)
  const clips = new Map(assets?.clips ?? []);
  if (assets) loadCivAnims({ base: assets.base ?? './assets/' }).then((pack) => { for (const [k, c] of pack.clips) clips.set(k, c); }).catch(() => {});
  const owner = { ch: null, t: 0, mode: null, x: 0, y: 0, z: 0, yaw: 0, fx: 0, fz: 0, clip: null };
  function ensureOwner() {
    if (owner.ch || !assets) return !!owner.ch;
    try {
      owner.ch = createCivilian({ ...assets, clips }, 4242, { type: 'office' });
      owner.ch.root.visible = false;
      owner.ch.root.traverse((m) => { if (m.isMesh) m.frustumCulled = false; });
      scene.add(owner.ch.root);
    } catch (err) { console.warn('[sandbox] owner figure failed', err); }
    return !!owner.ch;
  }
  function ownerPlay(name, once = false) { if (!owner.ch || owner.clip === name || !clips.has(name)) return; owner.clip = name; try { owner.ch.animator.play(name, { fade: 0.15, once }); } catch { /* missing */ } }
  function ownerOut(x, y, z, awayYaw, mode, line) {
    if (!ensureOwner()) return;
    owner.x = x; owner.y = y; owner.z = z; owner.yaw = awayYaw + Math.PI; owner.t = 0; owner.mode = mode; owner.clip = null;
    owner.fx = Math.sin(awayYaw); owner.fz = Math.cos(awayYaw);
    owner.ch.root.visible = true;
    events.emit('bark', { text: line, speaker: 'civilianOwner', pos: { x, y: y + 1.7, z }, channel: 'world' });
  }
  function stepOwner(dt) {
    if (!owner.mode || !owner.ch) return;
    owner.t += dt;
    if (owner.mode === 'jack') {
      if (owner.t < 1.4) ownerPlay('Civ_Argue');
      else { ownerPlay('Civ_PanicRun'); owner.x += owner.fx * 4.5 * dt; owner.z += owner.fz * 4.5 * dt; owner.yaw = Math.atan2(owner.fx, owner.fz); }
      if (owner.t > 1.4 && owner.t - dt <= 1.4) ownerPlay('Civ_PanicRun');
      if (owner.t > 2.2 && owner.t - dt <= 2.2) events.emit('bark', { text: 'Police? Somebody just took my car!', speaker: 'civilianOwner', pos: { x: owner.x, y: owner.y + 1.7, z: owner.z }, channel: 'world' });
      if (owner.t > 4.5) hideOwner();
    } else if (owner.mode === 'argue') {
      ownerPlay('Civ_Argue');
      if (owner.t > 4) hideOwner();
    }
    if (owner.ch && owner.mode) {
      const g = world.collision.groundBelow(owner.x, owner.y + 0.6, owner.z, 0.3);
      if (g > -Infinity) owner.y = g;
      owner.ch.root.position.set(owner.x, owner.y, owner.z);
      owner.ch.face(owner.yaw);
      owner.ch.animator.update(dt);
    }
  }
  function hideOwner() { owner.mode = null; if (owner.ch) owner.ch.root.visible = false; }

  // ---------------------------------------------------------------- take any car
  const jacked = []; // cars made from traffic (at most 2 kept; the oldest goes)
  // The vehicle key with no enterable car in reach: a street car from the traffic pool within a few
  // metres becomes a drivable one where it stood. Returns that car (vehicles.js vaults in) or null.
  function jackNear(p) {
    const h = p?.hero;
    const sim = world.traffic?.sim;
    if (!h || !sim || isReplica() || !can('takeCar')) return null; // [verify] gate
    let best = null, bd = 6.5;
    for (const v of sim.vehicles) {
      if (!v.active || v.speed > 10 || Math.abs(v.y - h.pos.y) > 2) continue;
      const d = Math.hypot(v.x - h.pos.x, v.z - h.pos.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return null;
    const type = best.type === 'bus' || best.type === 'garbage_truck' ? 'box_truck' : best.type;
    const yaw = Math.atan2(best.fx, best.fz);
    let car;
    try { car = vehicles.lendCar(type, { x: best.x, y: best.y, z: best.z, yaw }, { siren: false }); } catch { car = null; }
    if (!car) return null;
    car.borrowed = true; car.jacked = true;
    const x = best.x, y = best.y, z = best.z;
    sim.despawn(best);
    jacked.push(car);
    // Keep the pool small: the oldest one nobody is in leaves the scene.
    while (jacked.length > 2) {
      const old = jacked.find((c) => !c.driven && c !== vehicles.active);
      if (!old) break;
      jacked.splice(jacked.indexOf(old), 1);
      scene.remove(old.group);
      const i = vehicles.streetCars.indexOf(old);
      if (i >= 0) vehicles.streetCars.splice(i, 1);
    }
    // The owner gets out on the kerb side, shouts, runs and calls the police.
    const sx = Math.cos(yaw) * 1.6, sz = -Math.sin(yaw) * 1.6;
    ownerOut(x + sx, y, z + sz, Math.atan2(sx, sz), 'jack', OWNER_LINES[(save.jacked ?? 0) % OWNER_LINES.length]);
    save.jacked = (save.jacked ?? 0) + 1;
    if ((bruce()?.state?.identity ?? 'batman') === 'batman') combat?.reputation?.add?.('points', -1.5);
    events.emit('carTaken', withPlayer({ pos: { x, y, z }, type }, p));
    return car;
  }
  vehicles?.setKeyHook?.((hero) => {
    const p = list().find((q) => q.hero === hero) ?? list()[0];
    // Bruce away from any car hails a taxi; anyone beside traffic takes it.
    const car = jackNear(p);
    if (car) return car;
    if ((bruce()?.state?.identity ?? 'batman') === 'bruce' && !bruce()?.state?.inside) return hailTaxi(p) ? 'handled' : null;
    return null;
  });

  // Low-speed shoves: the other driver gets out and argues (cheap: the pooled owner figure).
  events.on('trafficShoved', (e) => {
    if (isReplica() || owner.mode || (e?.speed ?? 99) > 14) return;
    const p = list()[0];
    const h = vehicles?.active?.group?.position ?? p?.hero?.pos;
    if (!h) return;
    ownerOut(h.x + 3, h.y, h.z + 3, Math.random() * 6.28, 'argue', ARGUE_LINES[Math.floor(Math.random() * ARGUE_LINES.length)]);
  });

  // ---------------------------------------------------------------- pedestrians dive clear
  events.on('vehicleDanger', (d) => {
    if (!civilians?.sim || !d || d.speed < 6) return;
    const ax = d.x + d.fx * (4 + d.speed * 0.4), az = d.z + d.fz * (4 + d.speed * 0.4);
    civilians.sim.heroPass(ax, az, 3.2);
    civilians.sim.heroPass(d.x + d.fx * 2, d.z + d.fz * 2, 2.6);
    // Off the carriageway: people scatter (they flee or cower; they are never hit).
    civilians.stimulus?.('fight', ax, az, { radius: 7 });
  });

  // ---------------------------------------------------------------- stunts
  const drift = createDrift();
  const air = { on: false, t: 0, x: 0, z: 0 };
  const spots = []; // stunt spots: bascule bridges and ramp tops
  for (const b of world.bridges?.list ?? []) if (b.x !== undefined) spots.push({ id: `bridge:${b.id}`, label: `Bridge jump (${b.name ?? b.id})`, x: b.x, z: ((b.z0 ?? 0) + (b.z1 ?? 0)) / 2 });
  const rampTops = new Set();
  for (const e of world.streetGraph.edges) {
    if (e.deck !== 'ramp' || rampTops.size > 12) continue;
    const A = world.streetGraph.nodes[e.a], B = world.streetGraph.nodes[e.b];
    const top = A.y > B.y ? A : B;
    const key = `ramp:${Math.round(top.x)}:${Math.round(top.z)}`;
    if (!rampTops.has(key)) { rampTops.add(key); spots.push({ id: key.replace(/[^a-zA-Z0-9_:-]/g, ''), label: 'Ramp jump', x: top.x, z: top.z }); }
  }
  function stunt(kind, pts, p) {
    const bestKey = kind === 'drift' ? 'drift' : 'jump';
    const best = pts > (save[bestKey] ?? 0);
    if (best) save[bestKey] = pts;
    events.emit('stuntScore', withPlayer({ kind, pts, best }, p));
    const h = vehicles?.active?.group?.position ?? p?.hero?.pos;
    if (h) events.emit('word', { text: `${kind === 'drift' ? 'DRIFT' : 'AIR'} ${fmt(pts)}${best ? ' BEST!' : ''}`, pos: { x: h.x, y: h.y + 3, z: h.z }, big: best });
  }
  function stepStunts(dt) {
    const a = vehicles?.active;
    if (!a || !a.v || !a.group) { drift.on = false; air.on = false; return; }
    const p = list().find((q) => q.hero === vehicles.driver) ?? list()[0];
    const speed = Math.abs(a.v.speed ?? 0);
    const slip = a.v.lat ?? (a.v.drift ?? 0) * speed;
    const r = driftStep(drift, { dt, speed, slip: Number.isFinite(slip) ? slip : 0 });
    if (r?.banked) stunt('drift', r.banked, p);
    const inAir = !!a.gs?.air;
    if (inAir && !air.on) { air.on = true; air.t = 0; air.x = a.group.position.x; air.z = a.group.position.z; }
    if (inAir) air.t += dt;
    if (!inAir && air.on) {
      air.on = false;
      const dist = Math.hypot(a.group.position.x - air.x, a.group.position.z - air.z);
      const pts = jumpScore({ air: air.t, dist, land: speed });
      if (pts > 0) {
        stunt('jump', pts, p);
        if (air.t > (save.air ?? 0)) save.air = Math.round(air.t * 100) / 100;
        for (const s of spots) {
          if (save.found.includes(s.id) || Math.hypot(s.x - air.x, s.z - air.z) > 45) continue;
          save.found.push(s.id);
          events.emit('stuntSpotFound', withPlayer({ id: s.id, label: s.label }, p));
          events.emit('mapMark', { id: `stunt:${s.id}`, kind: 'activity', pos: { x: s.x, y: 0, z: s.z }, label: s.label, ttl: 0 });
        }
      }
    }
  }
  // Spots already found come back on the map.
  for (const s of spots) if (save.found.includes(s.id)) events.emit('mapMark', { id: `stunt:${s.id}`, kind: 'activity', pos: { x: s.x, y: 0, z: s.z }, label: s.label, ttl: 0 });

  // ---------------------------------------------------------------- taxi (as Bruce)
  let taxi = null;
  function destinationFor(p) {
    const n = nav();
    const marks = n?.waypoints?.marksOf?.(p.id) ?? [];
    const m = marks[marks.length - 1];
    if (m) return { x: m.x, y: m.y ?? 0, z: m.z, label: 'your waypoint' };
    return { x: DEST_DEFAULT.x, y: DEST_DEFAULT.y ?? 0, z: DEST_DEFAULT.z + 8, label: 'Wayne Tower' };
  }
  function hailTaxi(p, dest = null) {
    if (taxi || !p?.hero || !vehicles || isReplica() || !can('hailTaxi')) return false; // [verify] gate
    const h = p.hero;
    const to = dest ?? destinationFor(p);
    const pts = vehicles.routePoints?.({ x: h.pos.x, y: h.pos.y, z: h.pos.z }, to, { lane: 2.5 });
    if (!pts || pts.length < 2) { hud?.forPlayer?.(p)?.hint?.('No cab will come out here.', 2500); return false; }
    const a = pts[0], b = pts[1];
    if (Math.hypot(a.x - h.pos.x, a.z - h.pos.z) > 30) { hud?.forPlayer?.(p)?.hint?.('Get nearer a road to hail a cab.', 2500); return false; }
    const car = vehicles.lendCar('taxi', { x: a.x, y: a.y, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) }, { siren: false });
    if (!car) return false;
    car.taxi = true;
    taxi = { car, p, to, pts, t: 0, started: false, skip: false };
    vehicles.enter(car);
    vehicles.startPilot(pts, { speed: 17, timeout: 200 });
    save.rides = (save.rides ?? 0) + 1;
    events.emit('taxiStart', withPlayer({ dest: to.label }, p));
    hud?.forPlayer?.(p)?.hint?.(`Taxi to ${to.label}. <kbd>Jump</kbd> skips the ride.`, 5000);
    return true;
  }
  function stepTaxi(dt) {
    const T = taxi;
    T.t += dt;
    const pilot = vehicles.pilot;
    const skip = T.t > 0.6 && !!T.p.input?.pressed?.('jump');
    const done = !pilot || pilot.done || T.t > 200;
    if (skip || done) {
      vehicles.stopPilot?.();
      if (vehicles.active === T.car) vehicles.exit();
      if (skip || !pilot?.ok) {
        const g = world.collision.groundBelow(T.to.x, (T.to.y ?? 0) + 3, T.to.z, 0.3);
        T.p.hero.teleport({ x: T.to.x, y: g > -Infinity ? g : T.to.y, z: T.to.z });
        world.clock?.advance?.(Math.min(40, Math.hypot(T.pts[0].x - T.to.x, T.pts[0].z - T.to.z) / 250 * 10 + 4));
      }
      // The cab drives off (gone from the scene).
      scene.remove(T.car.group);
      const i = vehicles.streetCars.indexOf(T.car);
      if (i >= 0) vehicles.streetCars.splice(i, 1);
      events.emit('taxiArrive', withPlayer({ dest: T.to.label, skipped: skip }, T.p));
      taxi = null;
    }
  }

  // ---------------------------------------------------------------- per frame
  const cars = [{ x: 0, y: 0, z: 0, speed: 0, radius: 2, player: null }];
  const carList = [];
  const api = {
    radio, furniture, stats, jackNear, hailTaxi, spots,
    get taxi() { return taxi; },
    get score() { return { drift: save.drift, jump: save.jump, air: save.air, found: save.found.length }; },
    get save() { return save; },
    update(dt, real = dt) {
      const t0 = performance.now();
      simT += dt;
      radio.update(real);
      carList.length = 0;
      const a = vehicles?.active;
      if (a?.group) {
        const c = cars[0];
        c.x = a.group.position.x; c.y = a.group.position.y; c.z = a.group.position.z; c.speed = Math.abs(a.v?.speed ?? 0); c.radius = (a.radius ?? 2) * 0.8; c.player = list().find((q) => q.hero === vehicles.driver) ?? null;
        carList.push(c);
      }
      if (!isReplica()) furniture.update(dt, carList);
      stepStunts(dt);
      stepOwner(dt);
      if (taxi) stepTaxi(dt);
      stats.ms = stats.ms * 0.95 + (performance.now() - t0) * 0.05;
    },
    dispose() { radio.dispose(); },
  };
  return api;
}
