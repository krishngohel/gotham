// Ground vehicles: the Batmobile, street cars you can commandeer, a Joker chase van and drone
// tanks for the Ace Chemicals battle. Contract (see src/game/story.js
// -design.md): createVehicles(deps) -> { summon, enter, exit, active, update, startChase,
// startBattle, park }. Events: vehicleEnter{kind}, vehicleExit{kind}, chaseDone{ok}, battleDone{ok}.
// The hero's control name while driving is 'drive'.
// park(spot, opts): parks the Batmobile at an exact { x, y, z, yaw } (a story 'board' step's own
// site, src/game/story.js), unlike summon() which always places it relative to wherever Batman is
// currently standing. Added alongside the rest of this file's driving/physics work without
// touching it (see the note on park() itself).
import * as THREE from 'three';
import { createRng } from '../core/rng.js';
import { WORLD } from '../world/mapData.js';
import { WORLD_BOUNDS, regionDataAt } from '../world/regions/data.js';
import { buildStreetGraph, coreTrafficLines } from '../world/regions/streets.js';
import { stepDrive, driveVelocity, bounceOffWall, createRamCounter, mergeTuning, findClearGroundSpot, damageArmor, stepArmor, stepLane } from './vehiclePhysics.js';
import { createBatmobile, createJokerVan, createDroneTank, createTracer, createShell, createStreetVehicle, createBatcycle, createWingBike, PARKED_TYPES } from './vehicleModels.js';
// [move] Workstream L3: the drive model, ground following, battle mode, remote call, chases, VFX.
import { createVehicleStepper } from './vehicleStep.js';
import { stepHeat, stepMode, bikeLean } from './driveModel.js';
import { createAutopilot, stepAutopilot } from './autopilot.js';
import { roundFor, pickLock, fillMeter, canBarrage, salvoTargets, TURRET } from './battleMode.js';
import { createChases } from './chases.js';
import { createVehicleFx } from './vehicleFx.js';
import { BASE_MOVES } from '../traversal/moves.js';
import { can } from '../abilities/gate.js'; // [onboard] ability gates

// The same street centrelines cityLife.js drives its ambient traffic on (60 m block grid, 14 m
// wide streets): known-safe points to spawn a stationary car on. Read from the street graph
// (src/world/regions/streets.js) rather than a copy. Street cars still use their own seeded rng
// (see the module rule below), never the city's.
const STREETS = buildStreetGraph();
export const LINES = coreTrafficLines(STREETS);

// ---------------- free-roam side van chase: route picking (pure) ----------------
// Picks a short there-and-back route along whichever real street line (see LINES above) is
// nearest `near`, a few hundred metres off in a random direction, and confirms every point on it
// is real, walkable-for-a-van ground (never inside a merged compound or off the world). Pure given
// an injected rng (createRng's shape: .chance/.range) and groundOk(x, z) predicate, so it's
// testable without a live scene or collision world. Exported for src/game/sideVanChase.js's tests.
export const SIDE_VAN_MIN = 110, SIDE_VAN_MAX = 320; // metres from `near`
export function pickSideVanRoute(near, rng, groundOk, bounds = WORLD, tries = 4) {
  let axisIsX = true, line = LINES[0], bestD = Infinity;
  for (const L of LINES) {
    const dx = Math.abs(near.x - L);
    if (dx < bestD) { bestD = dx; line = L; axisIsX = true; }
    const dz = Math.abs(near.z - L);
    if (dz < bestD) { bestD = dz; line = L; axisIsX = false; }
  }
  const span = SIDE_VAN_MAX - SIDE_VAN_MIN;
  for (let t = 0; t < tries; t++) {
    const dir = rng.chance(0.5) ? 1 : -1;
    const base = axisIsX ? near.z : near.x;
    const nearT = base + dir * (SIDE_VAN_MIN + rng.range(0, span * 0.5));
    const farT = base + dir * (SIDE_VAN_MIN + span * 0.5 + rng.range(0, span * 0.5));
    const lo = axisIsX ? bounds.minZ + 12 : bounds.minX + 12;
    const hi = axisIsX ? bounds.waterZ - 12 : bounds.maxX - 12;
    const clampT = (v) => Math.max(lo, Math.min(hi, v));
    const mk = (v) => (axisIsX ? { x: line, z: clampT(v) } : { x: clampT(v), z: line });
    const path = [mk(nearT), mk(farT), mk(nearT)];
    if (path.every((p) => groundOk(p.x, p.z))) return { path, spot: path[0] };
  }
  return null;
}

const BATMOBILE_TUNING = mergeTuning({});
const STREET_CAR_TUNING = mergeTuning({
  accel: 9, boostAccel: 12, brakeDecel: 14, maxSpeed: 17, maxBoostSpeed: 21, maxReverse: 7,
  turnRate: 1.7, driftAmount: 0.5, driftTurnMul: 1.25, wallRestitution: 0.2,
});
const JOKER_TUNING = mergeTuning({ maxSpeed: 15, accel: 7 });
// [move] The bikes: quick, light, a tight turn; narrow enough for an alley.
const BIKE_TUNING = mergeTuning({ accel: 16, boostAccel: 24, maxSpeed: 30, maxBoostSpeed: 41, maxReverse: 6, turnRate: 2.9, driftAmount: 0.6, wallRestitution: 0.25 });
// [move] Street cars you can borrow: the fleet's ordinary cars (src/vehicles/models/fleet.js).
const BORROW_TYPES = PARKED_TYPES.filter((t) => t !== 'box_truck' && t !== 'limousine');

const RAM_MIN_SPEED = 4.5;    // m/s: below this, touching a goon or a car is just a nudge
const ENTER_RANGE = 6;        // meters, from the car's centre (a car is about 4.5 m long)
// Her own car answers from farther: T near the parked Batmobile should always mean "get in",
// never "call it again" (which slid it over to her and made her press T twice).
const BATMOBILE_ENTER_RANGE = 10;
const CANNON_RANGE = 34;
const CANNON_HALF_WIDTH = 2.2;
const WHEEL_RADIUS = 0.46;
const MAX_STEER = 0.55;       // radians, front wheel visual steer cap

function tinyToast(hudRoot) {
  const el = document.createElement('div');
  // The class is how hud.js's comic words find it while it shows (.show), and land elsewhere:
  // SCREEECH! used to cover "The Batmobile is on its way." as the car pulled up.
  el.className = 'vehicle-toast';
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  el.style.cssText = 'position:absolute;left:50%;bottom:22%;transform:translateX(-50%);'
    + 'max-width:min(560px,80vw);padding:10px 18px;background:#fffdf5;border:3px solid #0b0b12;'
    + 'box-shadow:3px 3px 0 #0b0b12;color:#0b0b12;font:calc(20px * var(--a11y-text, 1)) "Patrick Hand SC",cursive;text-align:center;'
    + 'opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:20;';
  hudRoot.appendChild(el);
  let timer = null;
  return {
    show(text, ms = 3200) {
      el.textContent = text;
      el.style.opacity = '1';
      el.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => { el.style.opacity = '0'; el.classList.remove('show'); }, ms);
    },
  };
}

// A small ink-styled meter for the chase and battle set pieces (its own DOM, so Part V1 never
// has to touch src/ui/hud.js or style.css).
function missionMeter(hudRoot) {
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:50%;top:86px;transform:translateX(-50%);'
    + 'padding:8px 22px;background:#fffdf5;border:3px solid #0b0b12;box-shadow:3px 3px 0 #0b0b12;'
    + 'color:#0b0b12;font:calc(26px * var(--a11y-text, 1)) Bangers,cursive;letter-spacing:1px;text-align:center;display:none;z-index:20;';
  hudRoot.appendChild(el);
  return {
    show(text) { el.textContent = text; el.style.display = ''; },
    set(text) { el.textContent = text; },
    hide() { el.style.display = 'none'; },
  };
}

// A HUD-style armour bar for the drone battle, its own DOM (same self-contained approach as
// missionMeter and tinyToast above: Part V1 never touches src/ui/hud.js or style.css).
function armorBar(hudRoot) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:50%;top:130px;transform:translateX(-50%);'
    + 'width:min(360px,70vw);padding:7px 16px 9px;background:#fffdf5;border:3px solid #0b0b12;'
    + 'box-shadow:3px 3px 0 #0b0b12;display:none;z-index:20;';
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  el.innerHTML = '<div style="font:calc(16px * var(--a11y-text, 1)) Bangers,cursive;letter-spacing:1.5px;color:#0b0b12;margin-bottom:4px;">BATMOBILE ARMOUR</div>'
    + '<div style="height:13px;background:#d8cfa8;border:2px solid #0b0b12;">'
    + '<div class="fill" style="height:100%;width:100%;background:#c8323c;transition:width 0.12s linear;"></div></div>';
  hudRoot.appendChild(el);
  const fill = el.querySelector('.fill');
  return {
    show() { el.style.display = ''; },
    hide() { el.style.display = 'none'; },
    set(frac) {
      const f = Math.max(0, Math.min(1, frac));
      fill.style.width = `${f * 100}%`;
      fill.style.background = f < 0.3 ? '#7a1c1c' : '#c8323c';
    },
  };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function createVehicles(deps) {
  const { scene, collision, events, combat, fx, hudRoot, audio } = deps;
  // [move] Optional deps from game.js: world (belowWater, streetGraph, bridges, traffic), quality,
  // getMoves() (the driver's upgrades), settings.
  const world = deps.world ?? null;
  const movesOf = () => deps.getMoves?.() ?? hero?.moves ?? BASE_MOVES;
  const stepper = createVehicleStepper({ collision, events, belowWater: world?.belowWater ?? null, traction: () => world?.weather?.traction ?? 1 }); // [verify] wet streets
  const vfx = createVehicleFx(scene, deps.quality ?? {});
  // The driver (workstream D1): player 0 unless a co-op partner took the wheel (setDriver). Every
  // use below reads these at call time, so a swap between drives is all it takes.
  let { hero, input, follow } = deps;
  const rng = createRng(7331); // own rng: never draws from ctx.rng (the city's seed)

  const toast = tinyToast(hudRoot);
  const meter = missionMeter(hudRoot);
  const armorHud = armorBar(hudRoot);
  // [move] Chases and vehicle combat as building blocks (src/vehicles/chases.js).
  const chases = createChases({
    scene, collision, events, graph: STREETS, rng: createRng(4242), bridges: world?.bridges ?? null, meter, toast,
    getCar: () => (active ? active.group.position : hero?.pos ?? null),
  });

  // ---- scratch (no per-frame allocation) ----
  const velScratch = { x: 0, z: 0 };
  const wallVel = { x: 0, z: 0 };
  const tracerA = new THREE.Vector3(), tracerB = new THREE.Vector3();

  let active = null;      // the instance currently being driven, or null
  let lastSteer = 0;      // this frame's steer input, for the driven car's front-wheel visual
  let wasBoosting = false; // last frame's boost state, so 'vehicleBoost' fires once per press

  // ---------------- the Batmobile ----------------
  const bm = createBatmobile();
  bm.group.visible = false;
  bm.kind = 'batmobile';
  bm.v = { speed: 0, yaw: 0, drift: 0 };
  bm.tuning = BATMOBILE_TUNING;
  bm.summoned = false;
  bm.arriving = null; // set while summon() is sliding it in; see updateSummonArrival
  bm.maxArmor = 100;
  bm.armor = { hp: bm.maxArmor, sinceHit: 999 }; // battle armour (src/vehicles/vehiclePhysics.js stepArmor)
  // [move] Pursuit/battle state: heat, the transform (0 pursuit .. 1 battle), wheel travel, the
  // barrage meter, the turret's lock and which driving camera is chosen.
  bm.v.lat = 0;
  bm.heat = { heat: 0, locked: false, boosting: false };
  bm.modeT = 0;
  bm.battle = false;
  bm.suspension = [0, 0, 0, 0];
  bm.barrage = { value: 0 };
  bm.lock = null;
  bm.unmanned = false;
  scene.add(bm.group);
  const DRIVE_CAMS = ['drive', 'driveClose', 'driveHood'];
  let driveCam = 0;
  // [move] The bikes (Batcycle, Nightwing's bike): enterable like a car, and a co-op partner can
  // call their own and ride it alongside the Batmobile (riders below).
  const bikes = [];
  function makeBike(kind) {
    const b = kind === 'wingbike' ? createWingBike() : createBatcycle();
    b.kind = 'bike';
    b.bikeKind = kind;
    b.v = { speed: 0, yaw: 0, drift: 0, lat: 0 };
    b.tuning = BIKE_TUNING;
    b.radius = 0.8;
    b.group.visible = false;
    b.heat = { heat: 0, locked: false, boosting: false };
    scene.add(b.group);
    bikes.push(b);
    return b;
  }

  // ---------------- street cars (commandeerable, some of them moving traffic) ----------------
  const streetCars = [];
  // Perf audit (2026-09-30): each street car is ~17 unmerged draw calls (a real extruded body,
  // not city-bucket geometry), and from an elevated vantage several are in view at once. Eight
  // in all (down from 12), five of them moving traffic and the rest parked.
  const TRAFFIC_COUNT = 5;
  function spawnStreetCars(count = 8) {
    for (let i = 0; i < count; i++) {
      const alongX = rng.chance(0.5);
      const line = rng.pick(LINES);
      const dir = rng.chance(0.5) ? 1 : -1;
      const lane = 3.4 * dir;
      const min = alongX ? WORLD.minX + 20 : WORLD.minZ + 20;
      const max = alongX ? WORLD.maxX - 20 : WORLD.waterZ - 30;
      const t = rng.range(min, max);
      const x = alongX ? t : line + lane;
      const z = alongX ? line - lane : t;
      // [move] The fleet's own cars (wheel radius, lamps, damage states), not two generic shapes.
      const car = createStreetVehicle(rng.pick(BORROW_TYPES), { palette: rng.int(0, 5) });
      car.kind = 'car';
      // forward = (sin(yaw), cos(yaw)): along x needs yaw = +-90deg, along z needs yaw = 0 or 180.
      car.v = { speed: 0, yaw: alongX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), drift: 0 };
      car.tuning = STREET_CAR_TUNING;
      const groundY = collision.groundBelow(x, 2, z, 0.3);
      car.group.position.set(x, groundY > -Infinity ? groundY : 0, z);
      car.group.rotation.y = car.v.yaw;
      car.borrowed = false;
      car.traffic = i < TRAFFIC_COUNT;
      car.knockT = 0; // >0 while a ram is carrying it off its lane; see updateTrafficCar
      if (car.traffic) car.lane = { alongX, line, dir, t, speed: rng.range(8, 11), stopT: 0 };
      scene.add(car.group);
      streetCars.push(car);
    }
  }
  spawnStreetCars();

  // One moving traffic car's frame step: cheap lane-following (stepLane, pure) instead of the
  // full drive-physics pipeline, and no allocation (car.lane and car.group.position are mutated
  // in place). Ramming it (tryRamOther) sets car.knockT, which switches it briefly onto the same
  // simple ballistic-ish slide integrateVehicle would give it, then it rejoins its lane.
  function updateTrafficCar(car, dt) {
    if (car.knockT > 0) {
      car.knockT -= dt;
      driveVelocity(car.v, car.tuning, velScratch);
      car.group.position.x += velScratch.x * dt;
      car.group.position.z += velScratch.z * dt;
      car.v.speed *= Math.max(0, 1 - dt * 1.5);
      car.group.rotation.y = car.v.yaw;
      if (car.knockT <= 0) {
        // Rejoin the lane from wherever the knock left it, instead of snapping back.
        car.lane.t = car.lane.alongX ? car.group.position.x : car.group.position.z;
        car.lane.stopT = 0;
      }
      return;
    }
    const lane = car.lane;
    stepLane(lane, dt, LINES, 1.1);
    // Streets are flat (world.js's floor is a constant 0 short of the waterline, which traffic
    // never reaches): no per-frame ground query needed here, just the one done once at spawn.
    car.group.position.x = lane.alongX ? lane.t : lane.line;
    car.group.position.z = lane.alongX ? lane.line : lane.t;
    const yaw = lane.alongX ? (lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (lane.dir > 0 ? 0 : Math.PI);
    car.v.yaw = yaw;
    car.v.speed = lane.stopT > 0 ? 0 : lane.speed;
    car.group.rotation.y = yaw;
    // [move] Brake lamps at the stop line, and the model's own per-frame bits (blinkers, smoke).
    const braking = lane.stopT > 0;
    if (braking !== car.braking) { car.braking = braking; car.setLamps?.({ brake: braking }); }
    if (car.wheels && !braking) { const roll = (lane.speed / (car.wheelRadius ?? WHEEL_RADIUS)) * dt; for (const w of car.wheels) w.spin.rotation.x -= roll; }
    car.update?.(dt);
  }

  function enterables() { return [bm, ...streetCars, ...bikes]; }

  // ---------------- nearest street point (for summoning near Batman) ----------------
  // Picks whichever grid line (an x-street or a z-street) is closest to `near` and returns a
  // point `dist` meters along it from `near` (clamped inside the world). Called twice per summon
  // with two different distances, so both points always land on the same street line.
  function nearestStreetSpawn(near, dist) {
    // Outside the original city: the nearest driveable street of the street graph on Batman's own
    // level (Lower Gotham has one drive above the other), `dist` metres back along it. Inside the
    // core nothing changes.
    const region = regionDataAt(near.x, near.z);
    if (region && region.id !== 'core') {
      const e = STREETS.nearestEdge(near.x, near.z, { y: near.y ?? null, filter: (ed) => ed.lanes > 0 && !ed.bridge });
      if (e) {
        const E = STREETS.edges[e.edge], A = STREETS.nodes[E.a], B = STREETS.nodes[E.b];
        const t = Math.max(0, Math.min(1, e.t - dist / (Math.hypot(B.x - A.x, B.z - A.z) || 1)));
        return { x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t };
      }
    }
    let best = null, bestD = Infinity;
    for (const line of LINES) {
      const dx = Math.abs(near.x - line);
      if (dx < bestD) { bestD = dx; best = { alongX: false, line }; }
      const dz = Math.abs(near.z - line);
      if (dz < bestD) { bestD = dz; best = { alongX: true, line }; }
    }
    if (best.alongX) return { x: clamp(near.x - dist, WORLD.minX + 5, WORLD.maxX - 5), z: best.line };
    return { x: best.line, z: clamp(near.z - dist, WORLD.minZ + 5, WORLD.waterZ - 10) };
  }

  const SUMMON_FAR = 8;   // meters: where the Batmobile first appears, out of Batman's way
  const SUMMON_NEAR = 2.6; // meters: where it parks, safely inside ENTER_RANGE
  const SUMMON_DUR = 0.85; // seconds: the slide-in
  // Above this straight-line distance, the nearest street line isn't actually near Batman (a big
  // open yard or plaza, mid-block): nearestStreetSpawn only ever checks one axis, so a spot on a
  // "nearest" line can still be tens of meters away across the other axis. Past this, fall back
  // to a clear-ground search centered on him instead.
  const STREET_SPOT_MAX = 14;
  const CLEAR_SPOT_RADII = [3, 4.5, 6, 8, 11, 15]; // meters, rings tried around Batman in the fallback

  // ---------------- summon / enter / exit ----------------
  // Appears on a real street point 6 to 10 m from Batman, facing along the street toward him,
  // then slides in over SUMMON_DUR and parks a few meters away (inside ENTER_RANGE) with a
  // screech. { instant: true } (used by startBattle, so it can chain straight into enter()) skips
  // the slide and places it parked immediately.
  // A spot's ground is real and the Batmobile's own footprint fits there without a wall pushing
  // it away: the collision-aware half of findClearGroundSpot's isClear(x, y, z) contract.
  function clearBatmobileSpot(x, y, z) {
    const gy = collision.groundBelow(x, y + 4, z, 0.3);
    if (gy <= -Infinity) return null;
    const probe = { x, y: gy, z };
    const r = collision.resolveCylinder(probe, bm.radius, 1.6, { prevY: gy });
    if (r.hitWall) return null;
    // resolveCylinder nudges an embedded cylinder out the nearest side; a big nudge means the
    // footprint didn't really fit at (x, z) at all, so this candidate isn't the clear spot it
    // looked like.
    if (Math.hypot(probe.x - x, probe.z - z) > 0.4) return null;
    return { x: probe.x, y: gy, z: probe.z };
  }

  function summon(kind = 'batmobile', { instant = false, remote = true } = {}) {
    if (kind !== 'batmobile') return; // only the Batmobile is summonable; street cars are found, not called
    if (bm.arriving || bm.auto) return; // already on the way
    // [move] Remote call: with a road near her, the car drives itself there along the street
    // graph (src/vehicles/autopilot.js). Off the roads (a plaza, a yard), the old slide-in below.
    if (!instant && remote && remoteCall()) return;
    const spot = nearestStreetSpawn(hero.pos, SUMMON_FAR);
    const spotDist = Math.hypot(spot.x - hero.pos.x, spot.z - hero.pos.z);
    if (spotDist > STREET_SPOT_MAX) {
      // Batman is too far from any street line for a street-side summon to make sense (a big
      // open yard, a plaza, deep mid-block): find the nearest spot the car actually fits instead
      // of snapping to a street tile that could be tens of meters away across the block.
      const clear = findClearGroundSpot(hero.pos, clearBatmobileSpot, CLEAR_SPOT_RADII);
      if (!clear) { toast.show('No room for the Batmobile here.', 2500); return; }
      const yaw = hero.bat.yaw;
      bm.v.speed = 0; bm.v.drift = 0; bm.v.yaw = yaw;
      bm.group.rotation.y = yaw;
      bm.group.position.set(clear.x, clear.y, clear.z);
      bm.group.visible = true;
      bm.summoned = true;
      bm.arriving = null;
      // The message first, so the word (placed on emit) can see it and land elsewhere.
      toast.show('The Batmobile screeches in.', 2200);
      events.emit('word', { text: 'SCREEECH!', pos: bm.group.position.clone().setY(clear.y + 1), big: true });
      return;
    }
    const park = nearestStreetSpawn(hero.pos, SUMMON_NEAR);
    const yaw = Math.atan2(park.x - spot.x, park.z - spot.z);
    bm.v.speed = 0; bm.v.drift = 0; bm.v.yaw = yaw;
    bm.group.rotation.y = yaw;
    bm.group.visible = true;
    bm.summoned = true;
    if (instant) {
      const groundY = collision.groundBelow(park.x, hero.pos.y + 4, park.z, 0.3);
      bm.group.position.set(park.x, groundY > -Infinity ? groundY : hero.pos.y, park.z);
      // The message first, so the word (placed on emit) can see it and land elsewhere.
      toast.show('The Batmobile screeches in.', 2200);
      events.emit('word', { text: 'SCREEECH!', pos: bm.group.position.clone().setY(bm.group.position.y + 1), big: true });
      return;
    }
    const groundY = collision.groundBelow(spot.x, hero.pos.y + 4, spot.z, 0.3);
    bm.group.position.set(spot.x, groundY > -Infinity ? groundY : hero.pos.y, spot.z);
    bm.arriving = { t: 0, dur: SUMMON_DUR, fromX: spot.x, fromZ: spot.z, toX: park.x, toZ: park.z, yaw };
    toast.show('The Batmobile is on its way.', 2200);
  }

  // ---- [move] remote call ----
  const drivableEdge = (e) => e.lanes > 0 && e.deck !== 'walk' && e.kind !== 'walk';
  const bridgeBlocked = (e) => !!(e.bridge && world?.bridges && world.bridges.isDown(e.bridge) === false);
  const REMOTE_NEAR = 22, REMOTE_FAR = 700, REMOTE_RING = [70, 130];
  function remoteCall() {
    const hp = hero.pos;
    const target = STREETS.nearestEdge(hp.x, hp.z, { y: hp.y, filter: drivableEdge });
    if (!target || target.dist > 30) return false;
    const bp = bm.group.position;
    const dHere = bm.group.visible ? Math.hypot(bp.x - hp.x, bp.z - hp.z) : Infinity;
    if (dHere < REMOTE_NEAR) return false; // close by: the quick slide-in
    let from = null;
    if (bm.group.visible && !bm.driven && dHere < REMOTE_FAR) from = { x: bp.x, y: bp.y, z: bp.z };
    else {
      // Out of sight around a corner: a junction 70-130 m away on her own level.
      let best = null, bestD = Infinity;
      for (const n of STREETS.nodes) {
        if (n.deck === 'walk' || Math.abs(n.y - target.y) > 2) continue;
        const d = Math.hypot(n.x - target.x, n.z - target.z);
        if (d < REMOTE_RING[0] || d > REMOTE_RING[1]) continue;
        const k = Math.abs(d - 95);
        if (k < bestD && STREETS.adj[n.id].some((e) => drivableEdge(STREETS.edges[e]))) { bestD = k; best = n; }
      }
      if (!best) return false;
      from = { x: best.x, y: best.y, z: best.z };
    }
    const r = STREETS.routeBetween(from, { x: target.x, y: target.y, z: target.z }, { blocked: bridgeBlocked });
    if (!r || r.points.length < 2 || r.length > REMOTE_FAR * 1.6) return false;
    bm.auto = createAutopilot(r.points);
    const p0 = r.points[0];
    const gy = collision.groundBelow(p0.x, p0.y + 2, p0.z, 0.3);
    bm.group.position.set(p0.x, gy > -Infinity ? gy : p0.y, p0.z);
    bm.v.speed = 0; bm.v.drift = 0; bm.v.lat = 0;
    bm.v.yaw = Math.atan2(r.points[1].x - p0.x, r.points[1].z - p0.z);
    bm.group.rotation.set(0, bm.v.yaw, 0);
    bm.group.visible = true;
    bm.summoned = true;
    toast.show(hp.y - target.y > 4 ? 'The Batmobile is on its way. It will wait on the street below.' : 'The Batmobile is on its way.', 2400);
    events.emit('vehicleCalled', { kind: 'batmobile', eta: r.length / 20, length: r.length });
    return true;
  }
  function updateAutopilot(dt) {
    const ap = bm.auto;
    stepAutopilot(ap, dt);
    const p = bm.group.position;
    p.x = ap.at.x; p.z = ap.at.z;
    const gy = collision.groundBelow(p.x, ap.at.y + 2, p.z, 0.3);
    p.y = gy > -Infinity ? gy : ap.at.y;
    const dy = Math.atan2(Math.sin(ap.at.yaw - bm.v.yaw), Math.cos(ap.at.yaw - bm.v.yaw));
    bm.v.yaw += dy * Math.min(1, dt * 6);
    bm.v.speed = ap.speed;
    bm.group.rotation.set(0, bm.v.yaw, 0);
    stepper.wheels(bm, Math.max(-1, Math.min(1, dy * 2)), dt);
    ramGoons(bm);
    if (ap.done) {
      bm.auto = null;
      bm.v.speed = 0;
      events.emit('word', { text: 'SCREEECH!', pos: bm.group.position.clone().setY(bm.group.position.y + 1), big: true });
      events.emit('vehicleArrived', { kind: 'batmobile' });
    }
  }

  // Slides the Batmobile from its summon point to its park point while summon() is arriving:
  // called every frame from update() instead of integrateVehicle (it has its own, scripted move).
  function updateSummonArrival(dt) {
    const a = bm.arriving;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    const e = k * k * (3 - 2 * k); // smoothstep
    bm.group.position.x = a.fromX + (a.toX - a.fromX) * e;
    bm.group.position.z = a.fromZ + (a.toZ - a.fromZ) * e;
    const groundY = collision.groundBelow(bm.group.position.x, bm.group.position.y + 2, bm.group.position.z, 0.4);
    if (groundY > -Infinity) bm.group.position.y = groundY;
    bm.group.rotation.y = a.yaw;
    const dist = Math.hypot(a.toX - a.fromX, a.toZ - a.fromZ);
    const roll = (dist / a.dur / (bm.wheelRadius ?? WHEEL_RADIUS)) * dt;
    for (const w of bm.wheels) w.spin.rotation.x -= roll;
    if (k >= 1) {
      bm.arriving = null;
      events.emit('word', { text: 'SCREEECH!', pos: bm.group.position.clone().setY(bm.group.position.y + 1), big: true });
    }
  }

  // Parks the Batmobile at an exact spot (a story 'board' step's own site, not wherever Batman
  // happens to be standing): a small, self-contained addition next to summon() that reuses its
  // slide-in (bm.arriving, updateSummonArrival above) rather than touching any driving/physics
  // code. { slide: false } places it immediately (used by the dev fast path); the default slides
  // it in from SUMMON_FAR back along its own facing, the same distance and duration summon() uses.
  function park(spot, { slide = true } = {}) {
    if (bm.arriving) return; // already on its way somewhere
    const yaw = spot.yaw ?? 0;
    if (!slide) {
      const groundY = collision.groundBelow(spot.x, (spot.y ?? 0) + 4, spot.z, 0.3);
      bm.v.speed = 0; bm.v.drift = 0; bm.v.yaw = yaw;
      bm.group.rotation.y = yaw;
      bm.group.position.set(spot.x, groundY > -Infinity ? groundY : (spot.y ?? 0), spot.z);
      bm.group.visible = true;
      bm.summoned = true;
      // The message first, so the word (placed on emit) can see it and land elsewhere.
      toast.show('The Batmobile screeches in.', 2200);
      events.emit('word', { text: 'SCREEECH!', pos: bm.group.position.clone().setY(bm.group.position.y + 1), big: true });
      return;
    }
    const fromX = spot.x - Math.sin(yaw) * SUMMON_FAR, fromZ = spot.z - Math.cos(yaw) * SUMMON_FAR;
    const groundY = collision.groundBelow(fromX, (spot.y ?? 0) + 4, fromZ, 0.3);
    bm.v.speed = 0; bm.v.drift = 0; bm.v.yaw = yaw;
    bm.group.rotation.y = yaw;
    bm.group.visible = true;
    bm.summoned = true;
    bm.group.position.set(fromX, groundY > -Infinity ? groundY : (spot.y ?? 0), fromZ);
    bm.arriving = { t: 0, dur: SUMMON_DUR, fromX, fromZ, toX: spot.x, toZ: spot.z, yaw };
    toast.show('The Batmobile is on its way.', 2200);
  }

  // A little code figure that hops out and dashes off: enter()'s carjack flourish. Only one ever
  // needed at a time in practice, but kept as a small pool-free list since it's an event (a
  // carjack), not a per-frame cost.
  const fleeingFigures = [];
  function spawnFleeingDriver(car) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.9, 0.26), new THREE.MeshBasicMaterial({ color: 0x3a3a44 }));
    body.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xc99a7c }));
    head.position.y = 1.28;
    g.add(body, head);
    const away = rng.chance(0.5) ? 1 : -1;
    const yaw = car.v.yaw + (Math.PI / 2) * away;
    g.position.copy(car.group.position);
    g.rotation.y = yaw;
    scene.add(g);
    fleeingFigures.push({ g, dx: Math.sin(yaw), dz: Math.cos(yaw), t: 0 });
  }
  function updateFleeingFigures(dt) {
    for (let i = fleeingFigures.length - 1; i >= 0; i--) {
      const f = fleeingFigures[i];
      f.t += dt;
      f.g.position.x += f.dx * 5.5 * dt;
      f.g.position.z += f.dz * 5.5 * dt;
      if (f.t > 1.8) { scene.remove(f.g); fleeingFigures.splice(i, 1); }
    }
  }

  function enter(v) {
    if (!v || active || !v.group.visible || v.arriving) return;
    if (v.auto) { v.auto = null; v.v.speed = 0; } // [move] she reached it before it reached her
    // A carjack: the car was actually moving under its own lane logic, not parked or already
    // knocked around. Stop it dead, and send its driver running.
    const carjack = v.traffic && v.knockT <= 0 && v.lane && v.lane.stopT <= 0 && Math.abs(v.v.speed) > 1;
    active = v;
    v.driven = true;
    lastSteer = 0;
    hero.control = { name: 'drive', camera: DRIVE_CAMS[driveCam], update: () => false };
    hero.bat.root.visible = false;
    hero.cape.mesh.visible = false;
    hero.vel.set(0, 0, 0);
    if (carjack) {
      spawnFleeingDriver(v);
      v.v.speed = 0;
      v.v.drift = 0;
      toast.show('Carjacked! Gordon will REALLY have questions.', 3200);
      events.emit('carTaken', { pos: { x: v.group.position.x, y: v.group.position.y, z: v.group.position.z }, type: 'car' }); // [sandbox] police attention (the driver calls it in)
    } else if (v.kind === 'car') {
      toast.show('Borrowed for the night. Gordon will explain.', 3200);
    }
    events.emit('vehicleEnter', { kind: v.kind });
  }

  // Getting in by the vehicle key: a short leap from where she stands up and over into the seat
  // (it used to be an instant vanish), then the real enter(). The story and the scripts still call
  // enter() directly, which stays instant. Returns false if a leap is already under way.
  const VAULT_T = 0.42;
  let vault = null;
  function vaultIn(v) {
    if (!v || active || vault || !v.group.visible || v.arriving) return false;
    const from = hero.pos.clone();
    vault = { v, t: 0, from };
    hero.vel.set(0, 0, 0);
    hero.bat.face(Math.atan2(v.group.position.x - from.x, v.group.position.z - from.z));
    hero.bat.animator.play('Jump_Start', { once: true, timeScale: 1.3, fade: 0.06 });
    hero.control = {
      name: 'boardCar', camera: 'ground', keepCrouch: false,
      update(dt) {
        if (!vault) return true;
        vault.t += dt;
        const k = Math.min(1, vault.t / VAULT_T), e = k * k * (3 - 2 * k);
        const to = vault.v.group.position;
        hero.pos.set(from.x + (to.x - from.x) * e, from.y + (to.y + 0.9 - from.y) * e + Math.sin(Math.PI * k) * 1.6, from.z + (to.z - from.z) * e);
        if (k >= 1) { const car = vault.v; vault = null; hero.control = null; enter(car); }
        return false;
      },
    };
    return true;
  }

  function exit() {
    if (!active) return;
    const v = active;
    const fx2 = -Math.cos(v.v.yaw), fz2 = Math.sin(v.v.yaw); // right vector of the car
    const ex = v.group.position.x + fx2 * (v.radius + 1.4);
    const ez = v.group.position.z + fz2 * (v.radius + 1.4);
    const groundY = collision.groundBelow(ex, v.group.position.y + 3, ez, 0.3);
    hero.bat.root.visible = true;
    hero.cape.mesh.visible = true;
    hero.control = null;
    // Out of the seat and over the side in a hop (it used to be a teleport to the kerb): she starts
    // at the seat and the jump carries her clear, landing about where the old teleport put her.
    const gy = groundY > -Infinity ? groundY : v.group.position.y;
    hero.teleport({ x: v.group.position.x + fx2 * (v.radius - 0.6), y: v.group.position.y + 1.1, z: v.group.position.z + fz2 * (v.radius - 0.6) }, v.v.yaw);
    hero.vel.set(fx2 * 3.6, 4.6, fz2 * 3.6);
    hero.grounded = false;
    hero.setState('air');
    hero.airT = 0.36;
    hero.bat.face(Math.atan2(fx2, fz2));
    hero.bat.animator.play('Jump_Start', { once: true, timeScale: 1.4, fade: 0.06 });
    if (gy > v.group.position.y + 1) hero.teleport({ x: ex, y: gy, z: ez }, v.v.yaw); // a kerb higher than the seat: just step out
    v.driven = false;
    // Once commandeered, a traffic car stays exactly where it's left, like any other borrowed
    // car; without this its stale lane.t (frozen since the moment it was entered) would snap it
    // back to wherever its route was when the player drives or ejects out of it somewhere else.
    if (v.traffic) v.traffic = false;
    if (v.kind === 'car') v.borrowed = true;
    events.emit('vehicleExit', { kind: v.kind });
    audio?.setEngine(null);
    wasBoosting = false;
    active = null;
  }

  // Ejects Batman up and out of the car into a glide (only while moving fast). Reuses the hero's
  // own glide entry (hero.js's startGlide reads velocity to set the glide heading and speed).
  function eject() {
    if (!active) return;
    const v = active;
    const speed = Math.abs(v.v.speed);
    if (speed < 10) { exit(); return; }
    const fxh = Math.sin(v.v.yaw), fzh = Math.cos(v.v.yaw);
    const upY = v.group.position.y + 1.6;
    hero.bat.root.visible = true;
    hero.cape.mesh.visible = true;
    hero.control = null;
    hero.pos.set(v.group.position.x, upY, v.group.position.z);
    // [move] Up and forward out of the open canopy, the car's speed carried into the glide (or
    // the wingsuit). A passenger goes too (src/coop/passenger.js reads lastEject).
    const up = 13 + Math.min(6, speed * 0.15), fwd = speed * 0.72;
    hero.vel.set(fxh * fwd, up, fzh * fwd);
    lastEject.frames = 2; lastEject.vx = fxh * fwd; lastEject.vy = up; lastEject.vz = fzh * fwd;
    if (v === bm) { bm.setCanopy(1); canopyT = 1.4; }
    if (v.battle) v.battle = false;
    hero.grounded = false;
    hero.setState('air');
    hero.airT = 0.25;
    hero.bat.face(v.v.yaw);
    hero.startGlide();
    events.emit('vehicleEject', { kind: v.kind, speed });
    v.driven = false;
    if (v.traffic) v.traffic = false; // see the same note in exit()
    if (v.kind === 'car') v.borrowed = true;
    events.emit('vehicleExit', { kind: v.kind });
    audio?.setEngine(null);
    wasBoosting = false;
    active = null;
  }

  // ---------------- one vehicle's physics step ----------------
  // [move] src/vehicles/vehicleStep.js: the mode's drive model, walls, real ground under four
  // wheels (ramps, decks, the Bristol hills; no tunnelling at speed), region bounds and water.
  const lastEject = { frames: 0, vx: 0, vy: 0, vz: 0 };
  let canopyT = 0;
  function integrateVehicle(inst, input2, dt) {
    inst.wallCd = Math.max(0, (inst.wallCd ?? 0) - dt); // cooldown: see the crash event below
    const f = stepper.step(inst, input2, dt, { pursuit: inst === bm || inst.kind === 'bike' });
    if (f.wallSpeed > 6 && inst.wallCd <= 0) {
      // A fresh, fast hit: a crash sound for the player's car, sparks, and dents on a borrowed one
      // (a cooldown so being pinned against a wall does not retrigger it every frame).
      if (inst === active) events.emit('vehicleImpact', { speed: f.wallSpeed });
      if (f.wallSpeed > 12) fx?.impact(inst.group.position.clone().setY(inst.group.position.y + 0.6), 0.7);
      if (inst.kind === 'car' && f.wallSpeed > 14) inst.setDamage?.(Math.min(3, (inst.damage ?? 0) + 1));
      inst.wallCd = 0.5;
    }
    if (f.landed < -7 && inst === active) {
      events.emit('vehicleLand', { speed: -f.landed });
      follow.addShake?.(Math.min(5, -f.landed * 0.25));
    }
    stepper.wheels(inst, inst === active ? lastSteer : 0, dt);
    if (inst.kind === 'bike') {
      // Lean into the turn; a wheelie in the air off a ramp.
      const lean = bikeLean(inst.v.speed, inst === active ? lastSteer : (inst.riderSteer ?? 0));
      inst.group.rotation.z = (inst.gs?.roll ?? 0) - lean;
      if (inst.gs?.air) inst.group.rotation.x = -(inst.gs.pitch + 0.25);
    }
    inst.update?.(dt);
  }

  const NEUTRAL_INPUT = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };

  // ---------------- ramming ----------------
  function ramGoons(inst) {
    if (Math.abs(inst.v.speed) < RAM_MIN_SPEED || !combat) return;
    const pos = inst.group.position;
    for (const e of combat.enemies) {
      if (!e.alive || e.down || e.air) continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
      if (Math.abs(e.pos.y - pos.y) > 2.5) continue;
      const d = Math.hypot(dx, dz);
      if (d < inst.radius + e.radius + 0.4) {
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        e.launch?.(nx * 3, 4, nz * 3);
        e.applyHit?.({ outcome: 'knockdown', damage: 0, stun: 0 }, pos, { power: 1, launch: 4 });
        fx?.impact(e.pos.clone(), 0.9);
      }
    }
  }

  // One potential ram target: no allocation, so the call sites below can run every frame without
  // building a temporary list. `tracked` (the story chase, or the free-roam side chase below) is
  // whichever of the two `other` belongs to, or null for an ordinary street car.
  function tryRamOther(inst, other, dt, tracked = null) {
    if (!other || other === inst || other.driven) return;
    other.ramCd = Math.max(0, (other.ramCd ?? 0) - dt);
    const pos = inst.group.position;
    const dx = other.group.position.x - pos.x, dz = other.group.position.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d < inst.radius + other.radius + 0.3 && other.ramCd <= 0) {
      events.emit('vehicleImpact', { speed: Math.abs(inst.v.speed) });
      // A parked or borrowed car spins off however it was hit: fun, arcade, doesn't matter where
      // it ends up. A tracked chase van keeps its own path-following yaw instead: a full
      // contact-normal spin can knock it sideways off a narrow street and out of its own steering
      // range, turning one lucky ram into an unwinnable (or just tedious) game of catch-up.
      if (!tracked) {
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        other.v.yaw = Math.atan2(nx, nz);
      }
      other.v.speed = Math.min(other.tuning.maxSpeed * 0.6, Math.abs(inst.v.speed) * 0.5 + 3);
      other.v.drift = 0;
      other.ramCd = 0.6;
      // A shove off its lane, not a takeover: moving traffic rides the knock out (see
      // updateTrafficCar) and rejoins its lane afterward, same as real comic-book traffic.
      if (other.traffic) other.knockT = 1.2;
      if (tracked && tracked.ramCounter.ram()) {
        fx?.impact(other.group.position.clone(), 1.1);
        events.emit('word', { text: 'KRUNCH!', pos: other.group.position.clone().setY(other.group.position.y + 1.2), big: true });
        if (tracked === chase) {
          meter.set(`${chase.label ?? 'CHASE'}  ${chase.ramCounter.hits}/${chase.hitsNeeded}`);
          if (chase.ramCounter.done) endChase(true);
        } else {
          events.emit('sideChaseHit', { hits: tracked.ramCounter.hits, hitsNeeded: tracked.hitsNeeded });
          if (tracked.ramCounter.done) endSideChase(true);
        }
      }
    }
  }
  function ramVehicles(inst, dt) {
    if (Math.abs(inst.v.speed) < RAM_MIN_SPEED) return;
    for (const other of streetCars) tryRamOther(inst, other, dt);
    if (chase?.active) tryRamOther(inst, chase.van, dt, chase);
    if (sideVan?.active) tryRamOther(inst, sideVan.van, dt, sideVan);
    // [move] Chase building blocks (src/vehicles/chases.js): a ram counts on the unit it hit.
    if (chases.active) for (const m of chases.rammables()) {
      const before = m.ramCd ?? 0;
      tryRamOther(inst, m, dt, null);
      if (before <= 0 && (m.ramCd ?? 0) > 0.5) chases.rammed(m, movesOf().ramDamage ?? 1);
    }
  }

  // ---------------- the Joker chase ----------------
  let chase = null;
  // [story2] look: { type (a fleet type), color, toast, label, hits } gives a night its own quarry;
  // without it, the Joker's van as always.
  function startChase({ path, onDone, look = null } = {}) {
    if (!Array.isArray(path) || path.length < 2) {
      console.warn('startChase: needs at least two path points; skipping the chase.');
      onDone?.({ ok: false });
      return;
    }
    // Normal play: the story's 'board' step (flow.js) already had her walk up and get in the
    // Batmobile herself before this ever runs, so this branch never fires. It stays only as a
    // last-resort fallback for a state the board step couldn't have covered (an old save resumed
    // mid-chase, say) so the mission is never unwinnable, not as the everyday path in.
    if (!active || active.kind !== 'batmobile') {
      const groundY = collision.groundBelow(path[0].x, path[0].y ?? 40, path[0].z, 0.3);
      hero.teleport({ x: path[0].x, y: groundY > -Infinity ? groundY : (path[0].y ?? 0), z: path[0].z });
      summon('batmobile', { instant: true });
      enter(bm);
    }
    let van = null;
    if (look?.type) { try { van = createStreetVehicle(look.type, look.color != null ? { color: look.color } : {}); van.radius = Math.min(2.3, van.radius ?? 2.1); } catch { van = null; } }
    van ??= createJokerVan();
    van.kind = look?.type ? 'storyChase' : 'jokerVan';
    van.radius = 1.9;
    // Face the second path point from the start, not a fixed yaw: otherwise a path that doesn't
    // happen to run toward +z has the van pull away and turn around before it even gets moving.
    const startYaw = Math.atan2(path[1].x - path[0].x, path[1].z - path[0].z);
    van.v = { speed: JOKER_TUNING.maxSpeed * 0.7, yaw: startYaw, drift: 0 };
    van.tuning = JOKER_TUNING;
    const groundY0 = collision.groundBelow(path[0].x, 3, path[0].z, 0.3);
    van.group.position.set(path[0].x, groundY0 > -Infinity ? groundY0 : 0, path[0].z);
    van.group.rotation.y = startYaw;
    scene.add(van.group);
    chase = { van, path, idx: 1, onDone, active: true, ramCounter: createRamCounter(3, 0.6), hitsNeeded: 3, t: 0 };
    meter.show('CHASE  0/3');
    toast.show('Stop the Joker\'s van. Ram it three times!', 3200);
  }
  function endChase(ok) {
    if (!chase) return;
    scene.remove(chase.van.group);
    meter.hide();
    events.emit('chaseDone', { ok });
    chase.onDone?.({ ok });
    chase.active = false;
    chase = null;
  }
  // Shared by the story chase and the free-roam side chase below: steers `c.van` toward
  // `c.path[c.idx]`, advances to the next point within 3 m of it (wrapping, so a short there-and-
  // back route just loops), and snaps it to the ground. Pure movement; `c` is mutated in place.
  function advanceOnPath(c, dt) {
    const van = c.van, path = c.path;
    const target = path[c.idx];
    const dx = target.x - van.group.position.x, dz = target.z - van.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 3) c.idx = (c.idx + 1) % path.length;
    else {
      const wantYaw = Math.atan2(dx, dz);
      const delta = Math.atan2(Math.sin(wantYaw - van.v.yaw), Math.cos(wantYaw - van.v.yaw));
      van.v.yaw += clamp(delta, -1, 1) * Math.min(1, dt * 3);
    }
    driveVelocity(van.v, van.tuning, velScratch);
    van.group.position.x += velScratch.x * dt;
    van.group.position.z += velScratch.z * dt;
    const groundY = collision.groundBelow(van.group.position.x, van.group.position.y + 2, van.group.position.z, 0.4);
    if (groundY > -Infinity) van.group.position.y = groundY;
    van.group.rotation.y = van.v.yaw;
    if (van.beacon) van.beacon.rotation.y += dt * 6;
  }
  function updateChase(dt) {
    if (!chase?.active) return;
    chase.t += dt;
    if (chase.t > 90) { endChase(false); return; } // a safety timeout so a missed chase can't hang the story
    advanceOnPath(chase, dt);
    chase.ramCounter.update(dt);
  }

  // ---------------- free-roam side van chase (optional, repeatable, never during a story mission)
  // A lighter-weight sibling of the story chase above: the same "ram it 3 times" rule and the same
  // van, but she finds it herself out in the city, nothing forces her into the Batmobile, and
  // ignoring it just lets it drive off (it despawns after `expiry` seconds). src/game/sideVanChase.js
  // decides *when* to try (pure timing); trySpawnSideChase below decides *where* (a real nearby
  // street, via pickSideVanRoute above) and does the actual spawning. Only one at a time.
  const SIDE_CHASE_EXPIRY = 65; // seconds: "drives off and despawns after a while"
  let sideVan = null;
  function startSideChase({ spot, path, hitsNeeded = 3, expiry = SIDE_CHASE_EXPIRY } = {}) {
    if (sideVan?.active || !Array.isArray(path) || path.length < 2) return false;
    const van = createJokerVan();
    van.kind = 'sideVan';
    van.radius = 1.9;
    const startYaw = Math.atan2(path[1].x - path[0].x, path[1].z - path[0].z);
    van.v = { speed: JOKER_TUNING.maxSpeed * 0.6, yaw: startYaw, drift: 0 };
    van.tuning = JOKER_TUNING;
    const groundY0 = collision.groundBelow(path[0].x, (spot?.y ?? 3) + 3, path[0].z, 0.3);
    van.group.position.set(path[0].x, groundY0 > -Infinity ? groundY0 : 0, path[0].z);
    van.group.rotation.y = startYaw;
    scene.add(van.group);
    sideVan = { van, path, idx: 1, active: true, ramCounter: createRamCounter(hitsNeeded, 0.6), hitsNeeded, t: 0, expiry };
    events.emit('sideChaseStart', { x: path[0].x, z: path[0].z });
    return true;
  }
  // `silent`: true for a cancellation (a story mission needs the Batmobile, say) that shouldn't
  // read as a result at all, false for a real outcome (won, or drove off unchallenged).
  function endSideChase(ok, { silent = false } = {}) {
    if (!sideVan) return;
    scene.remove(sideVan.van.group);
    sideVan.active = false;
    sideVan = null;
    if (!silent) events.emit('sideChaseDone', { ok });
  }
  function updateSideChase(dt) {
    if (!sideVan?.active) return;
    sideVan.t += dt;
    if (sideVan.t > sideVan.expiry) { endSideChase(false); return; }
    advanceOnPath(sideVan, dt);
    sideVan.ramCounter.update(dt);
  }
  // Tries to spawn a side chase on a real street a few hundred metres from `near` (own rng, own
  // street-picking: never touches the city's build-time rng). False (nothing spawned, caller
  // retries soon) when one's already running or no clear nearby street was found in a few tries.
  function trySpawnSideChase(near, opts = {}) {
    if (sideVan?.active) return false;
    const groundOk = (x, z) => collision.groundBelow(x, (near.y ?? 0) + 4, z, 0.3) > -Infinity;
    const route = pickSideVanRoute(near, rng, groundOk);
    if (!route) return false;
    return startSideChase({ spot: route.spot, path: route.path, ...opts });
  }
  function cancelSideChase() { if (sideVan?.active) endSideChase(false, { silent: true }); }

  // ---------------- the Ace Chemicals battle ----------------
  const SHELL_DAMAGE = 16;    // armour hp lost per shell that connects: about 7 hits to destroy
  const SHELL_SPEED = 8;      // m/s: slow and dodgeable, especially boosting away from one
  const SHELL_HIT_RADIUS = 2.1;
  let battle = null;
  function startBattle({ site, drones, onDone } = {}) {
    if (!site) { console.warn('startBattle: no site given; skipping the battle.'); onDone?.({ ok: false }); return; }
    if (!active || active.kind !== 'batmobile') {
      // Same fallback as startChase above: the 'board' step ahead of this one already parked the
      // Batmobile at the Ace Chemicals gate and got her into it, so this never fires in normal
      // play. Kept only so an old save resumed mid-battle still has somewhere to stand.
      hero.teleport(site);
      summon('batmobile', { instant: true });
      enter(bm);
    }
    const count = Array.isArray(drones) ? drones.length : (drones ?? 3);
    const list = [];
    for (let i = 0; i < count; i++) {
      const spec = Array.isArray(drones) ? drones[i] : null;
      const tank = createDroneTank();
      const angle = (i / count) * Math.PI * 2;
      const x = spec?.x ?? site.x + Math.cos(angle) * 10;
      const z = spec?.z ?? site.z + Math.sin(angle) * 10;
      const groundY = collision.groundBelow(x, site.y + 3, z, 0.3);
      tank.group.position.set(x, groundY > -Infinity ? groundY : site.y, z);
      tank.fireT = 1.5 + rng.range(0, 2);
      tank.shells = [];
      tank.tgt = { x: 0, y: 0, z: 0, unmanned: true, drone: tank }; // [move] the turret's lock target
      scene.add(tank.group);
      list.push(tank);
    }
    battle = { site, drones: list, droneCount: count, onDone, active: true, tracer: createTracer(), flash: null, cannonCdT: 0, debris: [] };
    scene.add(battle.tracer);
    bm.maxArmor = 100;
    bm.armor.hp = bm.maxArmor;
    bm.armor.sinceHit = 999;
    armorHud.set(1);
    armorHud.show();
    meter.show(`DRONES  ${list.length}`);
    // [move] Drone battle v2: the car goes straight into battle mode (strafe, dodge, the turret).
    toast.show('Battle mode: strafe with the stick, JUMP to dodge, PUNCH to fire the turret.', 3600);
  }
  function clearBattleScene() {
    for (const d of battle.drones) { scene.remove(d.group); for (const s of d.shells) scene.remove(s); }
    for (const m of battle.debris) scene.remove(m);
    scene.remove(battle.tracer);
    if (battle.flash) scene.remove(battle.flash);
    meter.hide();
    armorHud.hide();
  }
  function endBattle(ok) {
    if (!battle) return;
    clearBattleScene();
    events.emit('battleDone', { ok });
    battle.onDone?.({ ok });
    battle.active = false;
    battle = null;
  }
  // The Batmobile's armour hit zero: Batman is knocked out of it and the battle resets clean, so a
  // casual player always gets a fair retry instead of a hard fail state.
  function disableBatmobile() {
    if (!battle?.active) return;
    const site = battle.site, count = battle.droneCount, onDone = battle.onDone;
    events.emit('word', { text: 'KRAKOOM!', pos: bm.group.position.clone().setY(bm.group.position.y + 1.4), big: true });
    fx?.impact(bm.group.position.clone().setY(bm.group.position.y + 0.6), 1.6);
    follow.addShake?.(6);
    clearBattleScene();
    battle.active = false;
    battle = null;
    if (active === bm) exit();
    bm.group.visible = false;
    toast.show('Batmobile disabled! Resetting the battle.', 2800);
    setTimeout(() => {
      bm.armor.hp = bm.maxArmor;
      bm.armor.sinceHit = 999;
      startBattle({ site, drones: count, onDone });
    }, 1700);
  }
  function spawnDebris(pos) {
    if (!battle) return;
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshBasicMaterial({ color: 0x1c1c1c }));
      m.position.copy(pos).setY(pos.y + 0.6);
      const a = rng.range(0, Math.PI * 2), s = rng.range(3, 7);
      m.userData.vx = Math.cos(a) * s;
      m.userData.vz = Math.sin(a) * s;
      m.userData.vy = rng.range(4, 7);
      m.userData.life = 0.9;
      scene.add(m);
      battle.debris.push(m);
    }
  }
  // [move] A drone takes `dmg` hits (the heavy cannon, a missile).
  function hitDrone(d, dmg = 1) {
    if (d.dead) return;
    d.health -= dmg;
    fx?.impact(d.group.position.clone().setY(d.group.position.y + 0.8), 1.1);
    events.emit('word', { text: dmg > 1 ? 'KA-BLAM!' : 'BAZZAP!', pos: d.group.position.clone().setY(d.group.position.y + 1.4), big: true });
    if (d.health <= 0) {
      d.dead = true;
      d.group.visible = false;
      fx?.impact(d.group.position.clone().setY(d.group.position.y + 0.9), 1.8);
      events.emit('word', { text: 'KRAKOOM!', pos: d.group.position.clone().setY(d.group.position.y + 1.7), big: true });
      events.emit('droneDestroyed');
      spawnDebris(d.group.position);
      const remaining = battle.drones.filter((x) => !x.dead).length;
      meter.set(`DRONES  ${remaining}`);
      if (remaining <= 0) endBattle(true);
    }
  }

  // ---- [move] the battle-mode turret (src/vehicles/battleMode.js) ----
  // Targets: drones (unmanned: the heavy cannon), chase vehicles (manned: the immobiliser) and
  // goons (the riot round). Never allocates: the lists and target records are reused.
  const turretList = [];
  const muzzleW = new THREE.Vector3(), aimV = new THREE.Vector3();
  let turretCd = 0, fireFlashT = 0, gunnerAimT = 0;
  const gunnerAim = { yaw: 0, pitch: 0 };
  function turretTargets() {
    turretList.length = 0;
    if (battle?.active) for (const d of battle.drones) if (!d.dead) { d.tgt.x = d.group.position.x; d.tgt.y = d.group.position.y + 0.9; d.tgt.z = d.group.position.z; turretList.push(d.tgt); }
    for (const t of chases.turretTargets()) turretList.push(t);
    if (combat) for (const e of combat.enemies) {
      if (!e.alive || e.down || e.def?.boss || e.room) continue;
      e.turretTgt ??= { x: 0, y: 0, z: 0, person: true, e };
      e.turretTgt.x = e.pos.x; e.turretTgt.y = e.pos.y + 1; e.turretTgt.z = e.pos.z;
      turretList.push(e.turretTgt);
    }
    return turretList;
  }
  // aim: { yaw, pitch } in world terms (the driver's or the gunner's camera).
  function fireTurret(aim) {
    if (turretCd > 0) return false;
    bm.turret.muzzles[0].getWorldPosition(muzzleW);
    const lock = pickLock(turretTargets(), muzzleW, aim.yaw, aim.pitch);
    bm.lock = lock;
    const round = roundFor(lock);
    turretCd = round === 'cannon' ? TURRET.cannonCd : round === 'riot' ? TURRET.riotCd : TURRET.immobCd;
    fireFlashT = 0.25;
    events.emit('cannonFire', { round });
    if (!battle) battle_tracer();
    const tracer = battle?.tracer ?? spareTracer;
    let hx, hy, hz;
    if (lock) { hx = lock.x; hy = lock.y; hz = lock.z; }
    else { hx = muzzleW.x + Math.sin(aim.yaw) * 50; hy = muzzleW.y + Math.sin(aim.pitch) * 50; hz = muzzleW.z + Math.cos(aim.yaw) * 50; }
    const posAttr = tracer.geometry.attributes.position;
    posAttr.setXYZ(0, muzzleW.x, muzzleW.y, muzzleW.z);
    posAttr.setXYZ(1, hx, hy, hz);
    posAttr.needsUpdate = true;
    tracer.visible = true;
    tracer.userData.fadeT = 0.14;
    tracer.material.color.setHex(round === 'riot' ? 0xffd23a : round === 'immobiliser' ? 0x6dffb0 : 0x7fd6ff);
    follow.hitKick?.(2);
    if (!lock) {
      // No lock: the cannon still hits a drone straight down the barrel; never a person.
      if (battle?.active) {
        aimV.set(Math.sin(aim.yaw), 0, Math.cos(aim.yaw));
        for (const d of battle.drones) {
          if (d.dead) continue;
          const dx = d.group.position.x - muzzleW.x, dz = d.group.position.z - muzzleW.z;
          const fwd = dx * aimV.x + dz * aimV.z, lat = Math.abs(-dx * aimV.z + dz * aimV.x);
          if (fwd > 0 && fwd < CANNON_RANGE && lat < CANNON_HALF_WIDTH) { hitDrone(d); fillMeter(bm.barrage, { hits: 1 }); break; }
        }
      }
      return true;
    }
    if (round === 'cannon' && lock.drone) { hitDrone(lock.drone); fillMeter(bm.barrage, { hits: 1 }); }
    else if (round === 'immobiliser') {
      chases.immobilise(lock.m, 25);
      events.emit('word', { text: 'ZZZAP!', pos: lock.m.group.position.clone().setY(lock.y + 1), big: false });
    } else if (round === 'riot' && lock.e) {
      const e = lock.e;
      const wasAttacking = e.applyHit?.({ outcome: 'knockdown', damage: 6, stun: 0 }, muzzleW, { power: 1.2, launch: 2 });
      if (wasAttacking) combat.director?.release(e.id);
      events.emit('word', { text: 'THWUMP!', pos: e.pos.clone().setY(e.pos.y + 1.7), big: false });
    }
    return true;
  }
  // Outside the drone battle there is no battle tracer: one spare, made on first use.
  let spareTracer = null;
  function battle_tracer() { if (!spareTracer) { spareTracer = createTracer(); scene.add(spareTracer); } }
  // The missile barrage (bmBarrage): every unmanned target nearby, one missile each.
  function fireBarrage() {
    if (!canBarrage(bm.barrage, movesOf().barrage)) return false;
    bm.barrage.value = 0;
    const salvo = salvoTargets(turretTargets(), bm.group.position);
    events.emit('vehicleBarrage', { count: salvo.length });
    events.emit('word', { text: 'BARRAGE!', pos: bm.group.position.clone().setY(bm.group.position.y + 2.5), big: true });
    for (const t of salvo) if (t.drone) hitDrone(t.drone, 3);
    return true;
  }

  function fireCannon(aimFollow = null) {
    // [move] In battle mode (the drone battle always is) the turret fires where the shooter looks:
    // the driver, or a co-op gunner passing their own camera.
    if (active === bm && bm.battle) {
      const f = aimFollow ?? follow;
      if (aimFollow) { gunnerAim.yaw = f.state?.yaw ?? bm.v.yaw; gunnerAim.pitch = -(f.state?.pitch ?? 0) * 0.5; gunnerAimT = 1.5; }
      return fireTurret(aimFollow ? gunnerAim : driverAim());
    }
    if (!battle?.active || active !== bm || battle.cannonCdT > 0) return;
    battle.cannonCdT = 0.35;
    events.emit('cannonFire');
    const yaw = bm.v.yaw;
    const fxh = Math.sin(yaw), fzh = Math.cos(yaw);
    const ox = bm.group.position.x + fxh * 2.6, oz = bm.group.position.z + fzh * 2.6;
    let hitDrone = null, hitDist = CANNON_RANGE;
    for (const d of battle.drones) {
      if (d.dead) continue;
      const dx = d.group.position.x - ox, dz = d.group.position.z - oz;
      const forward = dx * fxh + dz * fzh;
      const lateralDist = Math.abs(-dx * fzh + dz * fxh);
      if (forward > 0 && forward < CANNON_RANGE && lateralDist < CANNON_HALF_WIDTH && forward < hitDist) { hitDist = forward; hitDrone = d; }
    }
    tracerA.set(ox, bm.group.position.y + 0.65, oz);
    tracerB.set(ox + fxh * hitDist, bm.group.position.y + 0.65, oz + fzh * hitDist);
    const posAttr = battle.tracer.geometry.attributes.position;
    posAttr.setXYZ(0, tracerA.x, tracerA.y, tracerA.z);
    posAttr.setXYZ(1, tracerB.x, tracerB.y, tracerB.z);
    posAttr.needsUpdate = true;
    battle.tracer.visible = true;
    battle.tracer.userData.fadeT = 0.14;
    // Muzzle flash (a reused, repositioned glow sphere) and a little recoil kick.
    if (!battle.flash) { battle.flash = createShell(0xeaf2ff); battle.flash.scale.setScalar(2.1); scene.add(battle.flash); }
    battle.flash.position.set(ox, bm.group.position.y + 0.65, oz);
    battle.flash.visible = true;
    battle.flash.material.opacity = 1;
    battle.flash.userData.fadeT = 0.1;
    bm.v.speed -= 1.6;
    follow.hitKick?.(4);
    if (hitDrone) {
      hitDrone.health -= 1;
      fx?.impact(hitDrone.group.position.clone().setY(hitDrone.group.position.y + 0.8), 1.1);
      events.emit('word', { text: 'BAZZAP!', pos: hitDrone.group.position.clone().setY(hitDrone.group.position.y + 1.4), big: true });
      if (hitDrone.health <= 0 && !hitDrone.dead) {
        hitDrone.dead = true;
        hitDrone.group.visible = false;
        fx?.impact(hitDrone.group.position.clone().setY(hitDrone.group.position.y + 0.9), 1.8);
        events.emit('word', { text: 'KRAKOOM!', pos: hitDrone.group.position.clone().setY(hitDrone.group.position.y + 1.7), big: true });
        events.emit('droneDestroyed');
        spawnDebris(hitDrone.group.position);
        const remaining = battle.drones.filter((d) => !d.dead).length;
        meter.set(`DRONES  ${remaining}`);
        if (remaining <= 0) endBattle(true);
      }
    }
  }
  function updateBattle(dt) {
    if (spareTracer?.visible) { spareTracer.userData.fadeT -= dt; spareTracer.material.opacity = Math.max(0, spareTracer.userData.fadeT / 0.14) * 0.95; if (spareTracer.userData.fadeT <= 0) spareTracer.visible = false; }
    if (!battle?.active) return;
    battle.cannonCdT = Math.max(0, battle.cannonCdT - dt);
    if (active === bm) {
      stepArmor(bm.armor, dt, { max: bm.maxArmor, regenDelay: 3, regenRate: bm.maxArmor / 16 });
      armorHud.set(bm.armor.hp / bm.maxArmor);
    }
    if (battle.tracer.visible) {
      battle.tracer.userData.fadeT -= dt;
      battle.tracer.material.opacity = Math.max(0, battle.tracer.userData.fadeT / 0.14) * 0.95;
      if (battle.tracer.userData.fadeT <= 0) battle.tracer.visible = false;
    }
    if (battle.flash?.visible) {
      battle.flash.userData.fadeT -= dt;
      if (battle.flash.userData.fadeT <= 0) battle.flash.visible = false;
      else battle.flash.material.opacity = battle.flash.userData.fadeT / 0.1;
    }
    for (let i = battle.debris.length - 1; i >= 0; i--) {
      const m = battle.debris[i];
      m.userData.vy -= 18 * dt;
      m.position.x += m.userData.vx * dt;
      m.position.y += m.userData.vy * dt;
      m.position.z += m.userData.vz * dt;
      m.userData.life -= dt;
      if (m.userData.life <= 0 || m.position.y < -2) { scene.remove(m); battle.debris.splice(i, 1); }
    }
    const targetPos = active ? active.group.position : bm.group.position;
    for (const d of battle.drones) {
      if (d.dead) continue;
      const dx = targetPos.x - d.group.position.x, dz = targetPos.z - d.group.position.z;
      const worldAngle = Math.atan2(dx, dz);
      d.turretPivot.rotation.y = worldAngle;
      d.fireT -= dt;
      if (d.fireT <= 0) {
        d.fireT = 2.6 + rng.range(0, 2.2);
        events.emit('droneShot');
        const shell = createShell(0x8a2fbf);
        shell.position.set(d.group.position.x, d.group.position.y + 0.95, d.group.position.z);
        const dist = Math.hypot(dx, dz) || 1;
        shell.userData.vx = (dx / dist) * SHELL_SPEED;
        shell.userData.vz = (dz / dist) * SHELL_SPEED;
        shell.userData.life = 5;
        shell.visible = true;
        scene.add(shell);
        d.shells.push(shell);
      }
      for (let i = d.shells.length - 1; i >= 0; i--) {
        const s = d.shells[i];
        s.position.x += s.userData.vx * dt;
        s.position.z += s.userData.vz * dt;
        s.userData.life -= dt;
        const hitDx = s.position.x - targetPos.x, hitDz = s.position.z - targetPos.z;
        const hit = Math.hypot(hitDx, hitDz) < SHELL_HIT_RADIUS;
        if (hit || s.userData.life <= 0) {
          if (hit) {
            events.emit('shellHit');
            follow.addShake?.(4);
            if (active === bm) {
              damageArmor(bm.armor, SHELL_DAMAGE * (movesOf().armorMul ?? 1)); // [move] carArmor
              armorHud.set(bm.armor.hp / bm.maxArmor);
              events.emit('armorHit');
              if (bm.armor.hp <= 0) { scene.remove(s); d.shells.splice(i, 1); disableBatmobile(); return; }
            }
          }
          scene.remove(s);
          d.shells.splice(i, 1);
        }
      }
    }
  }

  // ---------------- per-frame driving key + input ----------------
  let keyHook = null; // [sandbox] fn(hero) -> a car to vault into, 'handled', or null (then the Batmobile is called)
  function handleVehicleKey() {
    if (vault) return; // mid-leap into a seat
    // At speed the same key ejects Batman up into a glide (the Arkham exit); slower, she steps out.
    if (active) { if (Math.abs(active.v.speed) >= EJECT_MIN_SPEED && can(hero, 'eject')) eject(); else exit(); return; } // [onboard] eject once taught
    let nearest = null, nearestD = Infinity;
    for (const v of enterables()) {
      if (v.driven || v.arriving || !v.group.visible) continue;
      const d = Math.hypot(hero.pos.x - v.group.position.x, hero.pos.z - v.group.position.z);
      if (d < (v === bm ? BATMOBILE_ENTER_RANGE : ENTER_RANGE) && d < nearestD) { nearestD = d; nearest = v; }
    }
    let hooked = null; // [sandbox] take a traffic car / hail a taxi (src/sandbox/index.js setKeyHook)
    if (nearest) { if (nearest !== bm || can(hero, 'batmobile')) vaultIn(nearest); } // [onboard] the Batmobile once the story brings it
    else if (keyHook && (hooked = keyHook(hero))) { if (hooked !== 'handled') vaultIn(hooked); }
    // [move] An acrobat (Nightwing's kit) calls the bike; everyone else the Batmobile.
    // [onboard] Calling a ride from anywhere is the story's to give (batmobileCall).
    else if (!can(hero, 'batmobileCall')) return;
    else if (hero.trav?.style === 'acrobat') { const b = callBike(hero, 'wingbike'); if (b) vaultIn(b); }
    else summon('batmobile');
  }

  // ---- [move] bikes: call one beside a hero ----
  function callBike(h, kind = 'batcycle') {
    let b = bikes.find((x) => x.bikeKind === kind && !x.driven && !riders.has(x));
    if (!b) b = makeBike(kind);
    const yaw = h.bat.yaw;
    const x = h.pos.x + Math.sin(yaw + Math.PI / 2) * 1.6, z = h.pos.z + Math.cos(yaw + Math.PI / 2) * 1.6;
    const gy = collision.groundBelow(x, h.pos.y + 1.5, z, 0.3);
    b.group.position.set(x, gy > -Infinity ? gy : h.pos.y, z);
    b.v.yaw = yaw; b.v.speed = 0; b.v.drift = 0;
    b.group.rotation.set(0, yaw, 0);
    b.group.visible = true;
    events.emit('vehicleCalled', { kind: 'bike', bike: kind });
    return b;
  }
  // A second rider (a co-op partner on their own bike while player 0 drives): its own input,
  // camera and hero, the same physics.
  const riders = new Map(); // bike -> { hero, input, follow }
  function mountRider(b, who) {
    riders.set(b, who);
    b.driven = true;
    const h = who.hero;
    h.control = { name: 'drive', camera: 'drive', update: () => false };
    h.bat.root.visible = false;
    h.cape.mesh.visible = false;
    h.vel.set(0, 0, 0);
    events.emit('vehicleEnter', { kind: 'bike', rider: true });
  }
  function dismountRider(b) {
    const who = riders.get(b);
    if (!who) return;
    riders.delete(b);
    b.driven = false;
    const h = who.hero;
    h.bat.root.visible = true;
    h.cape.mesh.visible = true;
    h.control = null;
    const rx = -Math.cos(b.v.yaw), rz = Math.sin(b.v.yaw);
    h.teleport({ x: b.group.position.x + rx * 1.3, y: b.group.position.y + 0.2, z: b.group.position.z + rz * 1.3 }, b.v.yaw);
    events.emit('vehicleExit', { kind: 'bike', rider: true });
  }
  const riderInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  function updateRiders(dt) {
    for (const [b, who] of riders) {
      const inp = who.input;
      riderInput.throttle = Math.max(0, inp.move.y);
      riderInput.brake = Math.max(0, -inp.move.y);
      riderInput.steer = -inp.move.x;
      riderInput.handbrake = inp.down('jump');
      riderInput.boost = stepHeat(b.heat, inp.down('sprint') && riderInput.throttle > 0, dt, 1);
      b.riderSteer = b.v.steer ?? 0;
      integrateVehicle(b, riderInput, dt);
      who.hero.pos.copy(b.group.position);
      who.hero.speed = Math.abs(b.v.speed);
      who.follow?.setHeading?.(b.v.yaw, Math.abs(b.v.speed));
      b.setBoost?.(riderInput.boost);
      ramGoons(b);
      who.hero.invulnerable = Math.max(who.hero.invulnerable, 0.2);
    }
  }
  // The vehicle key for a rider (player p): off the bike (or, at speed, a leap into a glide).
  function riderKey(p) {
    for (const [b, who] of riders) if (who.hero === p.hero) { dismountRider(b); return true; }
    return false;
  }
  // A partner who is not driving and not near the Batmobile calls their own bike and gets on.
  function summonBikeFor(p) {
    if ([...riders.values()].some((w) => w.hero === p.hero)) return false;
    const kind = p.hero.trav?.style === 'acrobat' ? 'wingbike' : 'batcycle';
    const b = callBike(p.hero, kind);
    mountRider(b, { hero: p.hero, input: p.input, follow: p.rig?.follow ?? null });
    return true;
  }

  // ---------------- the frame update (called from game.js's vehicles hook) ----------------
  // m/s: at or above this the vehicle key ejects into a glide instead of stepping out. Jump is only
  // ever the handbrake: a tap of it to tighten a corner must never throw Batman out of the car.
  const EJECT_MIN_SPEED = 14;

  // [move] Per-frame scratch for the two input shapes.
  const pursuitInput = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
  const battleInput = { moveX: 0, moveY: 0, aimYaw: 0, dodge: false };
  const driverAimRec = { yaw: 0, pitch: 0 };
  function driverAim() { driverAimRec.yaw = follow.state?.yaw ?? bm.v.yaw; driverAimRec.pitch = -(follow.state?.pitch ?? 0.2) * 0.5 + 0.1; return driverAimRec; }
  let wasSliding = false, wasBattle = false, dangerT = 0, bmBoostShown = false, lastMode = -1, strafeShown = 0;
  const danger = { x: 0, y: 0, z: 0, fx: 0, fz: 0, speed: 0, r: 0, kind: '' };
  const wheelW = new THREE.Vector3();

  let topApplied = 1;
  function update(dt, real = dt) {
    if (input.pressed('vehicle')) handleVehicleKey();
    // [move] carTopSpeed (skill tree): the Batmobile's top speeds scale with it.
    const top = movesOf().topSpeed ?? 1;
    if (top !== topApplied) { topApplied = top; bm.tuning = mergeTuning({ ...BATMOBILE_TUNING, maxSpeed: BATMOBILE_TUNING.maxSpeed * top, maxBoostSpeed: BATMOBILE_TUNING.maxBoostSpeed * top }); }
    if (lastEject.frames > 0) lastEject.frames--;
    turretCd = Math.max(0, turretCd - dt);
    if (active) {
      const isBm = active === bm;
      // [move] BATTLE mode: hold block (right mouse / the pad's block) in the Batmobile; the drone
      // battle keeps it in battle mode. The transform takes 0.7 s; the physics switch halfway.
      if (isBm) {
        const want = (input.down('block') && can(hero, 'battleMode')) || !!battle?.active; // [onboard] gate the player's own toggle
        bm.modeT = stepMode(bm.modeT, want, dt);
        bm.battle = bm.modeT > 0.5;
        if (bm.battle !== wasBattle) {
          wasBattle = bm.battle;
          if (!bm.battle) { bm.v.speed = Math.max(0, bm.v.speed); bm.v.lat = 0; }
          events.emit('vehicleMode', { mode: bm.battle ? 'battle' : 'pursuit' });
        }
      }
      // The camera: Q cycles chase / close / roof while driving; battle mode looks over the turret.
      if (input.pressed('cape') && !(isBm && bm.battle)) driveCam = (driveCam + 1) % DRIVE_CAMS.length;
      if (hero.control) hero.control.camera = isBm && bm.battle ? 'battle' : DRIVE_CAMS[driveCam];
      let driveIn, boosting = false;
      if (active.battle) {
        battleInput.moveX = input.move.x; battleInput.moveY = input.move.y;
        battleInput.aimYaw = follow.state?.yaw ?? active.v.yaw;
        battleInput.dodge = input.pressed('jump');
        driveIn = battleInput;
      } else {
        // Physics steer is +1 = yaw up = a LEFT turn (vehiclePhysics.js); the D key is move.x +1,
        // a right turn, so it goes in negated.
        pursuitInput.throttle = Math.max(0, input.move.y);
        pursuitInput.brake = Math.max(0, -input.move.y);
        pursuitInput.steer = -input.move.x;
        pursuitInput.handbrake = input.down('jump');
        let sprint = input.down('sprint');
        if (pilot) sprint = pilotStep(dt); // [move] dev/test scripted driver (startPilot)
        const wantBoost = (active.kind === 'batmobile' || active.kind === 'bike') && sprint && pursuitInput.throttle > 0;
        // Afterburner heat (src/vehicles/driveModel.js stepHeat): a full gauge locks the boost.
        boosting = active.heat ? stepHeat(active.heat, wantBoost, dt, movesOf().heatCap ?? 1) : wantBoost;
        pursuitInput.boost = boosting;
        driveIn = pursuitInput;
      }
      if (boosting !== bmBoostShown) { bmBoostShown = boosting; active.setBoost?.(boosting); }
      if (boosting && !wasBoosting) events.emit('vehicleBoost');
      wasBoosting = boosting;
      integrateVehicle(active, driveIn, dt);
      if (active.v.dodged) events.emit('vehicleDodge', { dir: Math.sign(active.v.lat) });
      lastSteer = active.v.steer ?? 0; // the eased steer (vehiclePhysics.js), for the front wheels
      // The chase camera swings in behind the car's own heading (src/game/camera.js).
      follow.setHeading?.(active.v.yaw, Math.abs(active.v.speed));
      hero.pos.copy(active.group.position);
      hero.speed = Math.hypot(active.v.speed, active.v.lat ?? 0);
      // Engine loop: speed normalized 0..1 by this vehicle's own top speed; throttle, the mode and
      // the skid for the turbine's character (src/audio).
      const engineMax = (boosting ? active.tuning.maxBoostSpeed : active.tuning.maxSpeed) || 1;
      const sliding = !!active.v.sliding && !active.gs?.air;
      audio?.setEngine(active.kind === 'batmobile' ? 'batmobile' : 'car', 1, hero.speed / engineMax, { boost: boosting, throttle: active.battle ? Math.min(1, Math.hypot(input.move.x, input.move.y)) : pursuitInput.throttle, mode: active.battle ? 'battle' : 'pursuit', skid: sliding ? 1 : 0 });
      if (sliding !== wasSliding) { wasSliding = sliding; events.emit('vehicleSkid', { amount: sliding ? 1 : 0 }); }
      if (active.setLamps && !active.battle) { const br = pursuitInput.brake > 0 && active.v.speed > 0.5; if (br !== active.braking) { active.braking = br; active.setLamps({ brake: br }); } }
      skidMarks(active, sliding, dt);
      ramGoons(active);
      ramVehicles(active, dt);
      shoveTraffic(active, dt);
      warnRoad(active, dt);
      holdBridges(active.group.position, dt);
      if (isBm && bm.battle) {
        // The turret: PUNCH fires (held: it keeps firing), SPECIAL the missile barrage.
        fillMeter(bm.barrage, { dt });
        if (input.down('punch') || input.pressed('punch')) fireTurret(driverAim());
        if (input.pressed('special')) fireBarrage();
      } else if (battle?.active && isBm && input.pressed('punch')) fireCannon();
    }
    if (bm.arriving) updateSummonArrival(dt);
    else if (bm.auto) updateAutopilot(dt);
    else if (bm !== active) integrateVehicle(bm, NEUTRAL_INPUT, dt);
    bmVisuals(dt);
    for (const v of streetCars) {
      if (v === active) continue;
      if (v.traffic) updateTrafficCar(v, dt);
      else integrateVehicle(v, NEUTRAL_INPUT, dt);
    }
    for (const b of bikes) if (b !== active && !riders.has(b) && b.group.visible) integrateVehicle(b, NEUTRAL_INPUT, dt);
    updateRiders(dt);
    updateKnocked(dt);
    chases.update(dt);
    updateChase(dt);
    updateSideChase(dt);
    updateBattle(dt);
    updateFleeingFigures(dt);
    vfx.update(dt);
  }

  // [move] A scripted driver for tests and tuning (scripts, tests/e2e/driving.spec.js): it drives
  // the real car with the real physics along a polyline of points, by steering toward a point
  // ahead and holding a target speed. It records the worst height below the road (a fall through
  // a deck would show here) and ends when the last point is reached or `timeout` runs out.
  let pilot = null;
  function startPilot(points, { speed = 24, timeout = 240, boost = false } = {}) {
    pilot = { pts: points, i: 0, speed, boost, t: 0, timeout, done: false, ok: false, worstBelow: 0, maxAir: 0, dist: 0, lx: null, lz: null };
    return pilot;
  }
  function pilotStep(dt) {
    const P = pilot, p = active.group.position;
    P.t += dt;
    if (P.lx !== null) P.dist += Math.hypot(p.x - P.lx, p.z - P.lz);
    P.lx = p.x; P.lz = p.z;
    // Advance past points already reached (within 9 m), then aim 10 m on.
    while (P.i < P.pts.length - 1 && Math.hypot(P.pts[P.i].x - p.x, P.pts[P.i].z - p.z) < 5.5) P.i++;
    const q0 = P.pts[P.i];
    // After backing off an obstacle, aim a few metres to one side of the line for a while.
    P.dodgeT = Math.max(0, (P.dodgeT ?? 0) - dt);
    const off = P.dodgeT > 0 ? P.dodge : 0;
    const q = off ? { x: q0.x - Math.cos(active.v.yaw) * off, y: q0.y, z: q0.z + Math.sin(active.v.yaw) * off } : q0;
    // How far under the route's own road surface the car is (on the segment it is driving): a
    // fall through a deck shows here as metres.
    const a0 = P.pts[Math.max(0, P.i - 1)];
    if (q0.y !== undefined && a0.y !== undefined && !active.gs?.air) {
      const sx = q0.x - a0.x, sz = q0.z - a0.z, L2 = sx * sx + sz * sz || 1;
      const tt = Math.max(0, Math.min(1, ((p.x - a0.x) * sx + (p.z - a0.z) * sz) / L2));
      if (Math.hypot(a0.x + sx * tt - p.x, a0.z + sz * tt - p.z) < 10) P.worstBelow = Math.max(P.worstBelow, a0.y + (q0.y - a0.y) * tt - p.y);
    }
    if (active.gs?.air) P.maxAir = Math.max(P.maxAir, active.gs.airT);
    const want = Math.atan2(q.x - p.x, q.z - p.z);
    const delta = Math.atan2(Math.sin(want - active.v.yaw), Math.cos(want - active.v.yaw));
    pursuitInput.steer = Math.max(-1, Math.min(1, delta * 2.2));
    const sharp = Math.abs(delta) > 0.7;
    // A corner coming up at the next vertex: brake for it before turning in, not in it.
    let cornerSlow = false;
    if (P.i + 1 < P.pts.length) {
      const n = P.pts[P.i + 1], a1 = Math.atan2(q0.x - p.x, q0.z - p.z), a2 = Math.atan2(n.x - q0.x, n.z - q0.z);
      cornerSlow = Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) > 0.6 && Math.hypot(q0.x - p.x, q0.z - p.z) < 22;
    }
    const target = sharp ? 9 : cornerSlow ? 11 : P.speed;
    pursuitInput.throttle = active.v.speed < target ? 1 : 0;
    pursuitInput.brake = active.v.speed > target + 4 ? 1 : 0;
    pursuitInput.handbrake = sharp && active.v.speed > 14;
    // Wedged against something (a kerb, a barrier the graph's straight line cuts across): back off
    // with the wheel the other way for a second, then carry on.
    if (P.reverseT > 0) {
      P.reverseT -= dt;
      pursuitInput.throttle = 0; pursuitInput.brake = 1; pursuitInput.steer = -pursuitInput.steer; pursuitInput.handbrake = false;
    } else if (Math.abs(active.v.speed) < 1.5 && P.t > 1) {
      P.stuckT = (P.stuckT ?? 0) + dt;
      if (P.stuckT > 1.2) { P.stuckT = 0; P.reverseT = 1.5; P.unstuck = (P.unstuck ?? 0) + 1; P.dodge = (P.unstuck % 2 ? 3.5 : -3.5); P.dodgeT = 3; }
    } else P.stuckT = 0;
    if (P.i >= P.pts.length - 1 && Math.hypot(q.x - p.x, q.z - p.z) < 8) { P.done = true; P.ok = true; pilot = null; }
    else if (P.t > P.timeout) { P.done = true; P.ok = false; pilot = null; }
    return P.boost && !sharp;
  }

  // [move] The Batmobile's moving parts follow its state: the transform, wheel swivel for a
  // strafe, wheel travel over the ground, the turret's aim, the canopy, and the model's own
  // per-frame bits (vulcan spin, afterburner flicker).
  function bmVisuals(dt) {
    if (!bm.group.visible) return;
    if (bm.modeT !== lastMode) { lastMode = bm.modeT; bm.setMode(bm.modeT); }
    const strafe = bm.battle ? Math.min(1, Math.atan2(Math.abs(bm.v.lat ?? 0), Math.abs(bm.v.speed) + 0.5) / (Math.PI / 2) * 1.15) : 0;
    strafeShown += (strafe - strafeShown) * Math.min(1, dt * 8);
    bm.setStrafe(strafeShown);
    bm.setSuspension(bm.suspension);
    if (bm.battle && active === bm) {
      gunnerAimT = Math.max(0, gunnerAimT - dt);
      const a = gunnerAimT > 0 ? gunnerAim : driverAim();
      bm.aimTurret(Math.atan2(Math.sin(a.yaw - bm.v.yaw), Math.cos(a.yaw - bm.v.yaw)), a.pitch);
    } else bm.aimTurret(0, 0);
    fireFlashT = Math.max(0, fireFlashT - dt);
    bm.setFiring(fireFlashT > 0);
    if (canopyT > 0) { canopyT -= dt; bm.setCanopy(Math.min(1, canopyT / 0.5)); }
    bm.update(dt);
  }

  // [move] Skid marks under the rear wheels while sliding (pooled, src/vehicles/vehicleFx.js).
  let puffT = 0;
  function skidMarks(inst, sliding, dt) {
    if (!inst.wheels) return;
    const base = inst === bm ? 0 : 8;
    for (let i = 0; i < inst.wheels.length; i++) {
      const w = inst.wheels[i];
      if (w.front && inst.kind !== 'bike') continue;
      if (!sliding) { vfx.lift(base + i); continue; }
      w.pivot.getWorldPosition(wheelW);
      vfx.skid(base + i, wheelW.x, inst.group.position.y, wheelW.z, inst.v.yaw);
    }
    if (sliding) { puffT -= dt; if (puffT <= 0) { puffT = 0.12; vfx.puff(inst.group.position.x, inst.group.position.y, inst.group.position.z); } }
  }

  // [move] Ambient traffic (src/world/trafficSim.js) in the player's way at speed: the sim car is
  // retired and a stand-in (pooled, at most three) spins off kinematically, then settles. No
  // physics sim, nobody hurt. Traffic itself still brakes for the car as an obstacle.
  const knocked = [];
  function shoveTraffic(inst, dt) {
    const sim = world?.traffic?.sim;
    const sp = Math.abs(inst.v.speed);
    if (!sim || sp < RAM_MIN_SPEED + 2) return;
    const p = inst.group.position;
    for (const tv of sim.vehicles) {
      if (!tv.active || Math.abs(tv.y - p.y) > 2.5) continue;
      const dx = tv.x - p.x, dz = tv.z - p.z, d = Math.hypot(dx, dz);
      if (d > inst.radius + (tv.length ?? 4.8) * 0.4) continue;
      const nx = d > 1e-3 ? dx / d : Math.sin(inst.v.yaw), nz = d > 1e-3 ? dz / d : Math.cos(inst.v.yaw);
      let k = knocked.find((q) => q.type === tv.type && q.t <= 0) ?? (knocked.length < 3 ? null : knocked.reduce((a, b) => (a.t < b.t ? a : b)));
      if (!k) { const m = createStreetVehicle(tv.type in TYPE_OK ? tv.type : 'sedan', { palette: tv.palette ?? 0 }); scene.add(m.group); k = { m, type: tv.type, t: 0, vx: 0, vz: 0, spin: 0 }; knocked.push(k); }
      k.m.group.visible = true;
      k.m.group.position.set(tv.x, tv.y, tv.z);
      k.m.group.rotation.set(0, Math.atan2(tv.fx, tv.fz), 0);
      k.vx = nx * (sp * 0.55 + 3); k.vz = nz * (sp * 0.55 + 3);
      k.spin = (rng.chance(0.5) ? 1 : -1) * (2 + sp * 0.1);
      k.t = 2.2;
      k.m.setDamage?.(1);
      sim.despawn(tv);
      events.emit('vehicleImpact', { speed: sp });
      events.emit('trafficShoved', { type: tv.type, speed: sp });
      inst.v.speed *= 0.85;
    }
  }
  const TYPE_OK = Object.fromEntries(['sedan', 'suv', 'taxi', 'box_truck', 'bus', 'police', 'sedan_compact', 'coupe', 'hatchback', 'wagon', 'pickup', 'van_delivery', 'sedan_deco'].map((t) => [t, 1]));
  function updateKnocked(dt) {
    for (const k of knocked) {
      if (k.t <= 0) continue;
      k.t -= dt;
      const g = k.m.group;
      g.position.x += k.vx * dt; g.position.z += k.vz * dt;
      const damp = Math.max(0, 1 - dt * 1.6);
      k.vx *= damp; k.vz *= damp; k.spin *= damp;
      g.rotation.y += k.spin * dt;
      const gy = collision.groundBelow(g.position.x, g.position.y + 0.9, g.position.z, 0.3);
      if (gy > -Infinity) g.position.y = gy;
      if (k.t <= 0) g.visible = false; // the sim refills the street out of sight
    }
  }

  // [move] A bascule bridge's deck stops being solid the moment its gates start to close (the
  // leaves are still down): a car already on it fell into the river. The bridge keeper now waits
  // while the player's car is on or just short of a span that is down or only closing.
  const heldBridges = new Set();
  let bridgeT = 0;
  function holdBridges(p, dt) {
    const br = world?.bridges;
    if (!br?.list || (bridgeT -= dt) > 0) return;
    bridgeT = 0.25;
    for (const b of br.list) {
      if (b.z0 === undefined || b.x === undefined) continue;
      const inside = Math.abs(p.x - b.x) < 12 && p.z > Math.min(b.z0, b.z1) - 30 && p.z < Math.max(b.z0, b.z1) + 30;
      if (inside && !heldBridges.has(b.id) && (b.phase === 'down' || b.phase === 'closing')) { br.hold(b.id, 'down'); heldBridges.add(b.id); }
      else if (!inside && heldBridges.has(b.id)) { br.hold(b.id, null); heldBridges.delete(b.id); }
    }
  }

  // [move] Civilians-in-road safety: four times a second at speed the car announces where it is
  // heading ('vehicleDanger': { x, y, z, fx, fz, speed, r, kind }, a reused object) so pedestrians
  // can dive clear (workstream M's civilians listen). Traffic brakes for it already.
  function warnRoad(inst, dt) {
    dangerT -= dt;
    const sp = Math.hypot(inst.v.speed, inst.v.lat ?? 0);
    if (dangerT > 0 || sp < 6) return;
    dangerT = 0.25;
    const p = inst.group.position;
    danger.x = p.x; danger.y = p.y; danger.z = p.z;
    danger.fx = Math.sin(inst.v.yaw); danger.fz = Math.cos(inst.v.yaw);
    danger.speed = sp; danger.r = inst.radius; danger.kind = inst.kind;
    events.emit('vehicleDanger', danger);
  }

  // Dev/QA fast path (scripts/playthrough.mjs, the same way it force-wins a fight): completes
  // whichever mission is running right now as a win, through the exact same onDone path a real
  // 3rd ram or a real last drone would take, so the story advances exactly as it would live.
  function debugWin() {
    if (chase?.active) { endChase(true); return true; }
    if (battle?.active) { endBattle(true); return true; }
    if (sideVan?.active) { endSideChase(true); return true; }
    if (chases.debugWin()) return true; // [move] pursuits, convoys, tails, time trials
    return false;
  }

  return {
    summon, enter, exit, eject, park,
    get active() { return active; },
    // Co-op (workstream D1): who drives next (only while nobody is driving), the vehicle key for
    // that driver, the battle cannon for a gunner in the passenger seat.
    setDriver(d) { if (active || vault) return false; hero = d.hero; input = d.input; follow = d.follow; return true; },
    get driver() { return hero; },
    useKey: () => handleVehicleKey(),
    // [move] With a follow camera (a co-op gunner's), the battle-mode turret aims where they look.
    fireCannon: (aimFollow = null) => (active === bm && (bm.battle || battle?.active) ? fireCannon(aimFollow) : false),
    update,
    startChase, startBattle, debugWin,
    // Free-roam side content (src/game/sideVanChase.js decides *when*; this decides *where* and
    // does the spawning/ramming/despawning, same rules as the story chase above).
    trySpawnSideChase, cancelSideChase,
    get sideChase() { return sideVan; },
    // Dev/story helpers, not part of the frozen contract above.
    get batmobile() { return bm; },
    get streetCars() { return streetCars; },
    setKeyHook(fn) { keyHook = typeof fn === 'function' ? fn : null; }, // [sandbox]
    get chase() { return chase; },
    get battle() { return battle; },
    // [move] Workstream L3 (docs/design/vehicles.md): battle mode, remote call, bikes, chases.
    get mode() { return bm.battle ? 'battle' : 'pursuit'; },
    setBattle(on) { bm.modeT = on ? 1 : 0; bm.battle = !!on; },
    remoteCall: () => { if (bm.arriving || bm.auto) return true; return remoteCall(); },
    get calling() { return !!bm.auto; },
    get lastEject() { return lastEject; },
    get bikes() { return bikes; },
    callBike, summonBikeFor, riderKey, isRider: (h) => [...riders.values()].some((w) => w.hero === h),
    get riders() { return riders; },
    chases,
    fireTurret: (aim) => (active === bm && bm.battle ? fireTurret(aim ?? driverAim()) : false),
    fireBarrage,
    // A hook for missions: the nose winch (bmWinch) pulls a heavy pullable (src/traversal/pullables.js)
    // within 30 m ahead of the car; returns the object pulled or null.
    winch(pullables) {
      if (active !== bm || !movesOf().winch || !pullables) return null;
      bm.grapplePoint.getWorldPosition(muzzleW);
      aimV.set(Math.sin(bm.v.yaw), 0, Math.cos(bm.v.yaw));
      const o = pullables.aimed(muzzleW, aimV, { range: 30, maxAngle: 0.35, heavy: true });
      if (!o) return null;
      o.onPull?.({ by: hero, vehicle: bm });
      events.emit('vehicleWinch', { id: o.id ?? null });
      return o;
    },
    // Lend the player a car (a GCPD cruiser the story hands over: siren on), parked at spot.
    lendCar(type = 'police', spot, { siren = type === 'police' } = {}) {
      const car = createStreetVehicle(type);
      car.kind = 'car';
      car.v = { speed: 0, yaw: spot.yaw ?? 0, drift: 0 };
      car.tuning = mergeTuning({ ...STREET_CAR_TUNING, maxSpeed: 24, maxBoostSpeed: 28 });
      const gy = collision.groundBelow(spot.x, (spot.y ?? 0) + 2, spot.z, 0.3);
      car.group.position.set(spot.x, gy > -Infinity ? gy : (spot.y ?? 0), spot.z);
      car.group.rotation.y = car.v.yaw;
      car.borrowed = true; car.traffic = false; car.knockT = 0;
      car.setSiren?.(siren);
      scene.add(car.group);
      streetCars.push(car);
      return car;
    },
    get vfx() { return vfx; },
    startPilot, get pilot() { return pilot; }, stopPilot() { pilot = null; },
    // Dev: a route on the street graph between world points, as road-surface points.
    routePoints(from, to, { lane = 0 } = {}) { return STREETS.routeBetween(from, to, { blocked: bridgeBlocked, lane })?.points ?? null; },
  };
}
