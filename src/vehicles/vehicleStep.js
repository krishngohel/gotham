// One vehicle's physics step in the world (workstream L3, `[move]`): the drive model for its mode
// (src/vehicles/driveModel.js), walls, real ground under four wheels, the region bounds, water and
// the wheel/lamp visuals. Shared by vehicles.js (the Batmobile, borrowed cars) and bikes.js.
//
// A vehicle instance here is the model API (src/vehicles/models/*: group, wheels, wheelRadius,
// radius, halfLength, update, setLamps, ...) plus driving state the caller adds:
//   v        { speed, yaw, drift, steer, lat }  (vehiclePhysics.js / driveModel.js)
//   tuning   mergeTuning(...)
//   gs       ground state for followGround (created here on first use)
//   battle   true while in battle mode (strafing physics)
//   geo      { wheelbase, track } (derived from the wheels' rest positions when missing)
import { stepDrive, wetTuning } from './vehiclePhysics.js'; // [verify] wetTuning
import { stepPursuit, stepBattle, modeVelocity, followGround, STEP_UP } from './driveModel.js';
import { bounceOffWall } from './vehiclePhysics.js';
import { WORLD_BOUNDS } from '../world/regions/data.js';

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

// The world's real extent: every region's bounds (the old core-only clamp held cars to z < 205,
// which kept them off the Blackgate causeway). Water and the edge walls are the real limits.
export const DRIVE_BOUNDS = { minX: WORLD_BOUNDS.minX + 3, maxX: WORLD_BOUNDS.maxX - 3, minZ: WORLD_BOUNDS.minZ + 3, maxZ: WORLD_BOUNDS.maxZ - 3 };

export function createVehicleStepper({ collision, events, belowWater = null, bounds = DRIVE_BOUNDS, traction = () => 1 }) { // [verify] traction: the weather's street surface
  const vel = { x: 0, z: 0 }, wallVel = { x: 0, z: 0 };
  const resolveOut = { grounded: false, groundY: 0, hitWall: false, ceiling: false };
  const resolveOpts = { prevY: 0, stepUp: 0.6 };
  const heights = [0, 0, 0, 0];

  function geoOf(inst) {
    if (inst.geo) return inst.geo;
    let zf = 1.6, zr = -1.6, x = 0.8;
    for (const w of inst.wheels ?? []) {
      const p = w.rest ?? w.pivot?.position;
      if (!p) continue;
      if (w.front) zf = p.z; else zr = p.z;
      x = Math.max(x, Math.abs(p.x));
    }
    inst.geo = { wheelbase: Math.max(1, zf - zr), track: Math.max(0.3, 2 * x), zf, zr, x };
    return inst.geo;
  }

  // Ground under the four wheel contact points, probed from no higher than STEP_UP above the
  // body (a deck overhead is never the ground).
  function probe(inst) {
    const g = geoOf(inst), p = inst.group.position, yaw = inst.v.yaw, top = inst.gs.y + STEP_UP;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    const pts = [[g.zf, -g.x], [g.zf, g.x], [g.zr, -g.x], [g.zr, g.x]]; // fl, fr, rl, rr (left: -right)
    for (let i = 0; i < 4; i++) {
      const [zz, xx] = pts[i];
      const x = p.x + fx * zz - rx * xx, z = p.z + fz * zz - rz * xx;
      heights[i] = collision.groundBelow(x, top, z, 0.25);
    }
    return heights;
  }

  // input: { throttle, brake, steer, handbrake, boost } or, in battle mode, { moveX, moveY, aimYaw, dodge }.
  // Returns this step's facts: { wallSpeed (impact speed into a wall, 0 if none), landed (landing
  // vertical speed, 0 if none), recovered (pulled out of water) }.
  const facts = { wallSpeed: 0, landed: 0, recovered: false };
  function step(inst, input, dt, { pursuit = true } = {}) {
    facts.wallSpeed = 0; facts.landed = 0; facts.recovered = false;
    const v = inst.v;
    // [verify] Wet or snowy streets (world.weather.traction), cached per 0.02 step: no per-frame allocation.
    let tun = inst.tuning;
    const tr = Math.round((traction() ?? 1) * 50) / 50;
    if (tr < 1) { if (inst.wetK !== tr || inst.wetBase !== inst.tuning) { inst.wet = wetTuning(inst.tuning, tr, inst.wet ?? {}); inst.wetK = tr; inst.wetBase = inst.tuning; } tun = inst.wet; }
    if (inst.battle) stepBattle(v, input, dt);
    else if (pursuit && !(inst.gs?.air)) stepPursuit(v, input, dt, tun);
    else if (!(inst.gs?.air)) stepDrive(v, input, dt, tun);
    modeVelocity(v, inst.tuning, !!inst.battle, vel);
    // In the air there is no grip: the heading still turns a little (style), speed holds.
    const pos = inst.group.position;
    // Placed somewhere else since the last step (a summon, a park, a story teleport): start the
    // ground state over from where it stands now.
    const gs0 = inst.gs;
    if (!gs0 || Math.abs(pos.y - gs0.y) > 1e-3 || Math.abs(pos.x - gs0.lx) > 0.01 || Math.abs(pos.z - gs0.lz) > 0.01) {
      inst.gs = { y: pos.y, vy: 0, air: false, airT: 0, pitch: 0, roll: 0, lx: pos.x, lz: pos.z, fresh: true };
    }
    const bx = pos.x + vel.x * dt, bz = pos.z + vel.z * dt;
    pos.x = bx; pos.z = bz;
    pos.y = inst.gs.y;
    resolveOpts.prevY = inst.gs.y;
    const r = collision.resolveCylinder(pos, inst.radius, 1.6, resolveOpts, resolveOut);
    if (r.hitWall) {
      const pushX = pos.x - bx, pushZ = pos.z - bz, pl = Math.hypot(pushX, pushZ);
      if (pl > 1e-5) {
        const nx = pushX / pl, nz = pushZ / pl;
        facts.wallSpeed = Math.max(0, -(vel.x * nx + vel.z * nz));
        wallVel.x = vel.x; wallVel.z = vel.z;
        bounceOffWall(wallVel, nx, nz, inst.tuning.wallRestitution);
        const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw), rx = -Math.cos(v.yaw), rz = Math.sin(v.yaw);
        v.speed = wallVel.x * fx + wallVel.z * fz;
        const side = wallVel.x * rx + wallVel.z * rz;
        if (inst.battle) v.lat = side;
        else v.drift = clamp(side / (Math.max(0.01, Math.abs(v.speed)) * inst.tuning.driftLateralMul), -1, 1);
      }
    }
    // Ground: the four wheels, skipped for a parked car that is not moving (a cheap rest).
    const moving = Math.abs(v.speed) > 0.05 || Math.abs(v.lat ?? 0) > 0.05 || inst.gs.air || inst.gs.fresh !== false;
    if (moving) {
      inst.gs.fresh = false;
      facts.landed = followGround(inst.gs, probe(inst), dt, geoOf(inst));
      if (inst.suspension) for (let i = 0; i < 4; i++) inst.suspension[i] = heights[i] > -Infinity && !inst.gs.air ? clamp(heights[i] - inst.gs.y, -0.2, 0.2) : -0.12;
    }
    pos.y = inst.gs.y;
    pos.x = clamp(pos.x, bounds.minX, bounds.maxX);
    pos.z = clamp(pos.z, bounds.minZ, bounds.maxZ);
    // Into the river or the lake: back to the last road it was safely on.
    if (moving && belowWater && belowWater(pos)) {
      const s = inst.safe;
      if (s) { pos.set(s.x, s.y, s.z); v.yaw = s.yaw; }
      v.speed = 0; v.drift = 0; v.lat = 0;
      inst.gs.y = pos.y; inst.gs.vy = 0; inst.gs.air = false; inst.gs.fresh = true;
      facts.recovered = true;
      events?.emit('vehicleRecovered', { kind: inst.kind });
    } else if (!inst.gs.air && moving) {
      inst.safeT = (inst.safeT ?? 0) - dt;
      if (inst.safeT <= 0) { inst.safeT = 0.5; (inst.safe ??= { x: 0, y: 0, z: 0, yaw: 0 }); inst.safe.x = pos.x; inst.safe.y = pos.y; inst.safe.z = pos.z; inst.safe.yaw = v.yaw; }
    }
    inst.gs.lx = pos.x; inst.gs.lz = pos.z;
    inst.group.rotation.order = 'YXZ';
    inst.group.rotation.set(-inst.gs.pitch, v.yaw, inst.gs.roll);
    return facts;
  }

  // The wheels: steer, swivel (battle strafing) and roll, using the model's own wheel radius.
  function wheels(inst, steer, dt, maxSteer = 0.55) {
    if (!inst.wheels) return;
    const R = inst.wheelRadius ?? 0.46;
    const v = inst.v;
    const ground = Math.hypot(v.speed, v.lat ?? 0) * (v.speed < 0 ? -1 : 1);
    const roll = (ground / R) * dt;
    const s = clamp(steer * maxSteer, -maxSteer, maxSteer);
    for (const w of inst.wheels) {
      if (w.front) w.pivot.rotation.y = inst.battle ? 0 : s;
      w.spin.rotation.x -= roll;
    }
  }

  return { step, wheels, geoOf, probe };
}
