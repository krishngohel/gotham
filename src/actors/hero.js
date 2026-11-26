// The player character: locomotion, jumping, gliding and grappling. Combat moves take over
// through `hero.control` (an object with update(dt) -> true when finished).
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { LAYER_FX } from '../render/layers.js';
import { createBat, footGround, heroPlantsFeet } from './characters.js';
import { createCape } from './cape.js';
import { ladderGrab, ladderTopGrab, zipClosest } from '../world/climbables.js';
import { createLadderControl } from './traverse/ladder.js';
import { findLedge, findRunWall } from './traverse/probes.js';
import { createLedgeControl } from './traverse/ledge.js';
import { createZipControl } from './traverse/zipline.js';
import { createWallRunControl } from './traverse/wallrun.js';
import { createDiveControl } from './traverse/divebomb.js';
import { shouldDiveBomb, canDropTakedown } from '../combat/rules.js';
import { buildKitModel, kitById, kitInfo } from '../heroes/roster.js';
import { airJumpAction, canGlide, flightStep, regenStamina } from '../heroes/traversal.js';
import { withPlayer } from '../core/events.js';
// [move] Grapple and wingsuit upgrades (workstream L3): pure rules in src/traversal/.
import { BASE_MOVES } from '../traversal/moves.js';
import { zipSpeed, zipDuration, boostKind, boostLaunch, createChain, canChain, spendChain, tickChain, landChain } from '../traversal/grappleRules.js';
import { landingKind } from '../traversal/flightModel.js';
import { createWingsuit } from './traverse/wingsuit.js';
import { createPullControl } from './traverse/grapplePull.js';
import { can } from '../abilities/gate.js'; // [onboard] ability gates at each trigger

const GRAVITY = 26;
const JUMP_V = 9.4;
const RUN = 6.8;
const SPRINT = 11.5;
const CROUCH = 3.2;       // m/s crouched
const RADIUS = 0.35;
const HEIGHT = 1.8;
const GLIDE_G = 20;       // how hard gravity pulls along a dive
const GLIDE_MAX = 48;     // m/s
const GLIDE_CRUISE = 17;  // m/s

// kit: a hero kit (src/heroes/roster.js); without one, `suit` picks the kit (any suit id in
// src/heroes/models/suits.js builds its own look; an unknown suit is the default Batman).
// Co-op kits (src/heroes/kitModels.js prepareKit first) bring their own body, traversal profile
// and stats (src/heroes/traversal.js); Batman's profile is today's hero, number for number.
export function createHero({ assets, suit, kit = null, scene, collision, events, climbables = { ladders: [], ziplines: [] }, settings = { autoLedge: true } }) {
  kit = kit ?? kitById(suit ?? 'm');
  const bat = buildKitModel(kit, assets, { createBat });
  scene.add(bat.root);
  const groundUnderFoot = footGround(collision);
  // A body without a cape (Nightwing, Red Hood, the future Batman's wings: meta.cape === null)
  // still gets the cloth object every caller expects, never drawn or simulated.
  const hasCape = bat.meta?.cape !== null;
  const cape = createCape(bat, bat.colors?.cape ?? 0x17181e);
  if (!hasCape) cape.mesh.material.visible = false;
  scene.add(cape.mesh);
  const info = kitInfo(kit);
  const trav = info.traversal;
  const runK = (trav.run ?? 1) * (info.stats?.speed ?? 1), jumpK = trav.jump ?? 1;

  // Grapple cable.
  const cableGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const cable = new THREE.Line(cableGeo, new THREE.LineBasicMaterial({ color: PALETTE.ink }));
  cable.layers.set(LAYER_FX);
  cable.frustumCulled = false;
  cable.visible = false;
  scene.add(cable);

  const pos = bat.root.position;
  const vel = new THREE.Vector3();
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), wish = new THREE.Vector3();
  const before = new THREE.Vector3();
  const zipProbe = { x: 0, y: 0, z: 0 }; // reused each frame for the nearest-zipline check while airborne
  const zipHit = { s: 0, dist: 0 }; // reused result for zipClosest, likewise
  const ladderOpts = { reach: 0.7, facingX: undefined, facingZ: undefined }; // reused options for ladderGrab

  const h = {
    bat, cape, cable, pos, vel, collision, dead: false, kit,
    // The Player this hero belongs to (src/players/players.js sets it); events carry it.
    player: null,
    state: 'ground', stateT: 0, grounded: true, airT: 0, coyote: 0, jumpBuffer: 0,
    health: 100, maxHealth: 100,
    glide: { speed: 0, heading: 0 },
    control: null, // combat or scripted move in progress
    blocking: false,
    invulnerable: 0,
    groundY: 0,
    lastSafe: new THREE.Vector3(),
    stride: 0,
    speed: 0,
    frozen: false,
    airRuns: 0,      // wall runs used since last touching the ground
    lastClimbT: 99,  // seconds since leaving a ladder, ledge or zipline
    airFromSprint: false, // left the ground at sprint speed (a sprint jump: movement combos)
    crouched: false, // crouch toggle: slow, silent, harder to see (Part D)
    perched: false,  // standing on a gargoyle or other perch (set by src/stealth/stealthSystem.js)
    // Traversal numbers WayneTech upgrades (game.js points this at the live effects object).
    tuning: { boostUp: 15, boostOut: 9, diveGain: 1, glideMax: 48, wallRunTime: 1.2, ladderSlide: 9, diveRadius: 4 },
    // The kit's traversal profile (src/heroes/roster.js TRAVERSAL_PROFILES) and its live state:
    // mid-air flips used, flight stamina (seconds), and whether flight is allowed here (the co-op
    // layer turns it off in predator rooms and running fights).
    trav, flipsUsed: 0, stamina: trav.flight?.stamina ?? 0, canFly: () => true, hasCape,
    // [move] Owned traversal upgrades (src/traversal/moves.js; game.js and the co-op layer set it
    // per player), re-grapple charges, rising air (an updraft field) and the weather's wind.
    moves: BASE_MOVES, chain: createChain(), updrafts: null, wind: null, lastLanding: null,
  };
  const wing = createWingsuit(h); // [move]
  h.wingsuit = wing;

  function setState(s) {
    if (s === 'air' && h.state === 'ground') h.airFromSprint = h.speed > 9;
    h.state = s; h.stateT = 0;
  }

  // The body's lean (bat.tilt: a glide's dive angle, a wall run's bank, a dive-bomb) goes back to
  // upright on a critically damped spring instead of snapping (anim2: the glide -> fall and
  // landing pops). untilt() starts it; a state that leans on its own (glide, fly) or a control
  // that writes the tilt every frame simply overrides it.
  let tiltEase = false, tiltVX = 0, tiltVZ = 0;
  const TILT_W = 14;
  function untilt() { if (!tiltEase) { tiltVX = 0; tiltVZ = 0; } tiltEase = true; }
  function easeTilt(dt) {
    if (!tiltEase || dt <= 0) return;
    if (h.state === 'glide' || h.state === 'fly') { tiltEase = false; return; }
    const r = bat.tilt.rotation, own = !!h.control?.ownsTilt;
    tiltVX += (-TILT_W * TILT_W * r.x - 2 * TILT_W * tiltVX) * dt; r.x += tiltVX * dt;
    if (!own) { tiltVZ += (-TILT_W * TILT_W * r.z - 2 * TILT_W * tiltVZ) * dt; r.z += tiltVZ * dt; }
    if (Math.abs(r.x) < 1e-3 && Math.abs(tiltVX) < 1e-2 && (own || (Math.abs(r.z) < 1e-3 && Math.abs(tiltVZ) < 1e-2))) {
      r.x = 0; if (!own) r.z = 0;
      tiltEase = false;
    }
  }
  h.untilt = untilt;

  function setCrouch(v) {
    if (h.crouched === v) return;
    h.crouched = v;
    events.emit(v ? 'crouchOn' : 'crouchOff');
  }
  // A perch drop in a predator room lands Batman in a crouch (src/stealth/takedowns.js).
  h.setCrouch = setCrouch;

  // Turning toward a direction at `rate` (1/s), never faster than TURN_MAX (anim2: a half turn on
  // the spot swung 40 degrees in its first frame and the arms whipped round); rate 0 snaps.
  const TURN_MAX = 13;
  function faceTowards(dx, dz, rate, dt) {
    const target = Math.atan2(dx, dz);
    const delta = Math.atan2(Math.sin(target - bat.yaw), Math.cos(target - bat.yaw));
    if (!rate) { bat.face(bat.yaw + delta); return; }
    const step = delta * Math.min(1, rate * dt), cap = TURN_MAX * dt;
    bat.face(bat.yaw + Math.max(-cap, Math.min(cap, step)));
  }

  function heightAboveGround() {
    const g = collision.groundBelow(pos.x, pos.y, pos.z, RADIUS * 0.6);
    return g === -Infinity ? 999 : pos.y - g;
  }

  // Move with collision; strip velocity going into whatever pushed us back.
  function integrate(dt) {
    before.copy(pos);
    pos.addScaledVector(vel, dt);
    const r = collision.resolveCylinder(pos, RADIUS, HEIGHT, { prevY: before.y });
    const pushX = pos.x - (before.x + vel.x * dt), pushZ = pos.z - (before.z + vel.z * dt);
    const pl = Math.hypot(pushX, pushZ);
    if (pl > 1e-5) {
      const nx = pushX / pl, nz = pushZ / pl;
      const into = vel.x * nx + vel.z * nz;
      if (into < 0) { vel.x -= into * nx; vel.z -= into * nz; }
    }
    if (r.ceiling && vel.y > 0) vel.y = 0;
    h.groundY = r.groundY;
    return r;
  }

  // Glider wings cruise faster and dive to a higher top speed (0 for the cape: today's glide).
  const glideCruise = trav.glideCruise ?? GLIDE_CRUISE;
  const glideMaxBonus = (trav.glideMax ?? 48) - 48;

  // An acrobat's mid-air flip: a second, slightly smaller jump, once per time off the ground.
  function airFlip() {
    h.flipsUsed += 1;
    h.jumpBuffer = 0;
    vel.y = JUMP_V * jumpK * 0.85;
    const clip = bat.animator.has('Acro_FlipRun') ? 'Acro_FlipRun' : 'NinjaJump_Start';
    bat.animator.play(clip, { once: true, timeScale: 1.35, fade: 0.06 });
    events.emit('airFlip', withPlayer({}, h.player));
  }

  // Flight (src/heroes/traversal.js): take off, then flyStep() every frame until he lands, runs
  // out of stamina, drops (crouch) or flies somewhere flight is not allowed.
  function startFly() {
    setState('fly');
    h.jumpBuffer = 0;
    vel.y = Math.max(vel.y, 3);
    cape.setWings(false);
    untilt();
    if (bat.animator.has('Fly_Takeoff')) bat.animator.play('Fly_Takeoff', { once: true, timeScale: 1.2, fade: 0.08 });
    events.emit('flyStart', withPlayer({}, h.player));
  }
  function endFly() {
    setState('air');
    h.airT = 0.5;
    untilt();
    bat.animator.play('Fall_Loop', { fade: 0.25 });
    events.emit('flyEnd', withPlayer({}, h.player));
  }
  function flyStep(dt, input, wish, mag) {
    const f = trav.flight;
    const r = flightStep(f, { wishX: wish.x, wishZ: wish.z, mag, climb: input.down('jump'), fast: input.down('sprint'), height: heightAboveGround(), stamina: h.stamina, dt });
    h.stamina = r.stamina;
    const k = Math.min(1, dt * 4);
    vel.x += (r.vx - vel.x) * k;
    vel.z += (r.vz - vel.z) * k;
    vel.y += (r.vy - vel.y) * Math.min(1, dt * 5);
    if (mag > 0.05) faceTowards(wish.x, wish.z, 8, dt);
    const fast = Math.hypot(vel.x, vel.z) > 7;
    const clip = fast ? (bat.animator.has('Fly_Forward') ? 'Fly_Forward' : 'A_TPose') : 'Idle_Loop';
    if (bat.animator.currentName !== clip && bat.animator.currentName !== 'Fly_Takeoff') bat.animator.play(clip, { fade: 0.3 });
    // Without the flying clip the T-pose leans into the flight like the glide.
    const lean = fast && clip === 'A_TPose' ? 1.1 : 0;
    bat.tilt.rotation.x += (lean * bat.lm.fwd - bat.tilt.rotation.x) * Math.min(1, dt * 5);
    if (r.done || !h.canFly() || input.pressed('crouch')) endFly();
  }

  function land(impact) {
    h.flipsUsed = 0;
    landChain(h.chain); // [move] re-grapple charges refill on the ground
    // [move] A wingsuit touchdown reads by speed: a fast shallow one rolls out keeping some speed,
    // a fast steep one is a heavy landing. Without the wingsuit nothing changes.
    if (h.state === 'glide' && h.glide.wingsuit) {
      const kind = landingKind(vel.x, impact, vel.z);
      h.lastLanding = kind;
      if (kind === 'roll') {
        h.airRuns = 0; h.airFromSprint = false; h.grounded = true; h.airT = 0;
        cape.setWings(false); bat.tilt.rotation.set(0, 0, 0);
        vel.x *= 0.55; vel.z *= 0.55;
        setState('roll');
        bat.animator.play('Roll', { once: true, timeScale: 1.2, fade: 0.08 });
        events.emit('land', withPlayer({ hard: false, roll: true, who: 'hero' }, h.player));
        return;
      }
      if (kind === 'hard') {
        // A heavy three-point landing: stopped dead, a beat to stand up.
        h.airRuns = 0; h.airFromSprint = false; h.grounded = true; h.airT = 0;
        cape.setWings(false); bat.tilt.rotation.set(0, 0, 0);
        vel.set(0, 0, 0);
        setState('ground');
        bat.animator.play('Jump_Land', { once: true, timeScale: 0.7, fade: 0.05 });
        h.landT = 0.5;
        events.emit('land', withPlayer({ hard: true, heavy: true, who: 'hero' }, h.player));
        return;
      }
    }
    if (impact < -8 && h.combat && h.control?.name !== 'dive') {
      const e = h.combat.enemies.find((g) => canDropTakedown(g, pos));
      if (e) h.combat.takedown(e, 'drop');
    }
    h.airRuns = 0;
    h.airFromSprint = false;
    h.grounded = true;
    h.airT = 0;
    cape.setWings(false);
    untilt();
    if (impact < -15) {
      setState('roll');
      bat.animator.play('Roll', { once: true, timeScale: 1.35, fade: 0.08 });
      events.emit('land', withPlayer({ hard: true, who: 'hero' }, h.player));
    } else {
      setState('ground');
      if (impact < -6) { bat.animator.play('Jump_Land', { once: true, timeScale: 1.5, fade: 0.06 }); h.landT = 0.18; }
      events.emit('land', withPlayer({ hard: false, who: 'hero' }, h.player));
    }
  }

  // [move] A goon within reach ahead and below: knocked down, and the glide flies on, slower.
  function glideKick() {
    const fx = Math.sin(h.glide.heading), fz = Math.cos(h.glide.heading);
    for (const e of h.combat.enemies) {
      if (!e.alive || e.down || e.def?.boss || e.state === 'grabbed') continue;
      const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, dy = pos.y - e.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > 3.4 || dy < -0.5 || dy > 3 || (dx * fx + dz * fz) < d * 0.3) continue;
      const wasAttacking = e.applyHit({ outcome: 'knockdown', damage: 10, stun: 0 }, pos, { power: 1.4, launch: 3 });
      if (wasAttacking) h.combat.director?.release(e.id);
      wing.state.speed *= 0.8;
      events.emit('glideKick', withPlayer({ target: e }, h.player));
      events.emit('word', { text: 'WHAM!', pos: e.pos.clone().setY(e.pos.y + 1.6), big: false });
      return true;
    }
    return false;
  }

  function startGlide() {
    setState('glide');
    tiltEase = false;
    const hs = Math.hypot(vel.x, vel.z);
    h.glide.speed = Math.max(14, hs);
    h.glide.heading = hs > 1 ? Math.atan2(vel.x, vel.z) : bat.yaw;
    h.glide.wingsuit = h.moves.wingsuit > 0 && can(h, 'wingsuit'); // [move] the wingsuit flies the flight model; [onboard] once the story has given it
    if (h.glide.wingsuit) wing.enter(bat.yaw);
    cape.setWings(true);
    // Arms straight out in a T, the cape spread between them as wings (the owner's pick over a
    // swept-back pose).
    // Dead-blended (workstream I): the arms swing out from where they were instead of averaging two poses.
    bat.animator.play('A_TPose', { fade: 0.35, blend: 'inertial' });
    events.emit('glideStart');
  }

  function tryAutoVault(dirX, dirZ) {
    // Hop over waist-high obstacles (parapets, crates) when running into them.
    const probeX = pos.x + dirX * 0.75, probeZ = pos.z + dirZ * 0.75;
    const top = collision.groundBelow(probeX, pos.y + 1.6, probeZ, 0.1);
    const rise = top - pos.y;
    if (rise > 0.45 && rise < 1.55) {
      vel.y = Math.sqrt(2 * GRAVITY * (rise + 0.45));
      vel.x = dirX * 5;
      vel.z = dirZ * 5;
      h.grounded = false;
      setState('air');
      bat.animator.play('Jump_Start', { once: true, timeScale: 1.6, fade: 0.14, blend: 'inertial' });
      events.emit('vault');
      return true;
    }
    return false;
  }

  function locomotion(dt, ctx) {
    const { input, cam } = ctx;
    const f = cam.forward(tmp), side = cam.right(tmp2);
    wish.set(f.x * input.move.y + side.x * input.move.x, 0, f.z * input.move.y + side.z * input.move.x);
    const mag = Math.min(1, wish.length());
    if (mag > 0) wish.divideScalar(wish.length());
    if (h.state === 'ground' && input.pressed('crouch')) setCrouch(!h.crouched);
    const sprint = input.down('sprint') && mag > 0.5 && !h.blocking;
    if (h.crouched && (sprint || h.blocking)) setCrouch(false);
    const max = h.blocking ? 2.2 : sprint ? SPRINT * runK : h.crouched ? CROUCH : RUN * runK;

    if (input.pressed('jump')) h.jumpBuffer = 0.14;
    h.jumpBuffer = Math.max(0, h.jumpBuffer - dt);

    if (h.state === 'ground' || h.state === 'roll') {
      const accel = h.state === 'roll' ? 4 : 50;
      vel.x += (wish.x * max * mag - vel.x) * Math.min(1, accel * dt / Math.max(1, max));
      vel.z += (wish.z * max * mag - vel.z) * Math.min(1, accel * dt / Math.max(1, max));
      if (h.state === 'roll') {
        if (h.stateT > 0.55) setState('ground');
      }
      if (mag > 0.05 && !h.blocking) faceTowards(wish.x, wish.z, 14, dt);
      vel.y = -2;
      if (h.jumpBuffer > 0 && h.state === 'ground') {
        setCrouch(false);
        const wall = input.down('sprint') && h.airRuns < 1 && can(h, 'wallRun') ? findRunWall(collision, pos, vel.x, vel.z) : null; // [onboard] gate
        if (wall) { h.jumpBuffer = 0; h.control = createWallRunControl(h, { collision, events }, { wall, speed: h.speed }); return; }
        h.jumpBuffer = 0;
        vel.y = JUMP_V * jumpK;
        h.grounded = false;
        setState('air');
        bat.animator.play('Jump_Start', { once: true, timeScale: 1.4, fade: 0.14, blend: 'inertial' });
        events.emit('jump');
      }
    } else if (h.state === 'air') {
      vel.x += (wish.x * max * mag - vel.x) * Math.min(1, 3 * dt);
      vel.z += (wish.z * max * mag - vel.z) * Math.min(1, 3 * dt);
      vel.y = Math.max(-48, vel.y - GRAVITY * dt);
      h.airT += dt;
      if (input.down('sprint') && h.airRuns < 1 && h.jumpBuffer > 0 && can(h, 'wallRun')) { // [onboard] gate
        const wall = findRunWall(collision, pos, vel.x, vel.z);
        if (wall) { h.jumpBuffer = 0; h.control = createWallRunControl(h, { collision, events }, { wall, speed: h.speed }); return; }
      }
      if (h.coyote > 0 && h.jumpBuffer > 0) { vel.y = JUMP_V * jumpK; h.coyote = 0; h.jumpBuffer = 0; events.emit('jump'); }
      else if (input.pressed('jump') && (trav.airFlips || trav.flight)) {
        // A second jump in the air: an acrobat's flip, or Superman taking off.
        const a = airJumpAction(trav, { airT: h.airT, flipsUsed: h.flipsUsed, stamina: h.stamina, canFly: h.canFly(), heightAboveGround: trav.flight ? heightAboveGround() : 0 });
        if (a === 'flip') airFlip();
        else if (a === 'fly') { startFly(); return; }
      }
      h.coyote = Math.max(0, h.coyote - dt);
      if (mag > 0.05) faceTowards(wish.x, wish.z, 6, dt);
      if (canGlide(trav) && can(h, 'glide') && h.airT > 0.2 && vel.y < 3 && input.down('jump') && heightAboveGround() > 2.2) startGlide(); // [onboard] gate
      // A long drop (falling fast) gets the fall pose; a hop keeps the jump loop.
      else if (h.airT > 0.35 && vel.y < -9) { if (bat.animator.currentName !== 'Fall_Loop') bat.animator.play('Fall_Loop', { fade: 0.3 }); }
      else if (h.airT > 0.35 && bat.animator.currentName !== 'Jump_Loop' && bat.animator.currentName !== 'Jump_Start' && bat.animator.currentName !== 'Fall_Loop') bat.animator.play('Jump_Loop', { fade: 0.2 });
    } else if (h.state === 'fly') {
      flyStep(dt, input, wish, mag);
    } else if (h.state === 'glide') {
      const g = h.glide;
      // Pitch control: sprint key or looking down dives, back key or looking up pulls up.
      let ctrl = THREE.MathUtils.clamp((cam.state.pitch - 0.25) / 0.45, -1, 1);
      if (input.down('sprint')) ctrl = 1;
      else if (input.move.y < -0.3) ctrl = -1;
      else if (Math.abs(ctrl) < 0.12) ctrl = 0;
      g.ctrl = ctrl;
      // [move] The wingsuit flies the pure flight model (src/actors/traverse/wingsuit.js): the
      // same controls, crouch for the air brake. The cape glide below is untouched.
      if (g.wingsuit) {
        wing.step(dt, ctrl, Math.atan2(f.x, f.z) - input.move.x * 0.9, input.down('crouch'));
      } else {
      let vyTarget;
      if (ctrl > 0) {
        // Dive: gravity turns height into speed.
        // Arcade physics: a dive buys more speed per meter than real gravity would.
        const angle = ctrl * 0.75;
        g.speed = Math.min(h.tuning.glideMax + glideMaxBonus, g.speed + (GLIDE_G * 1.35 * h.tuning.diveGain * Math.sin(angle) - g.speed * 0.02) * dt);
        vyTarget = -g.speed * Math.sin(angle) * 0.55;
      } else if (ctrl < 0 && g.speed > GLIDE_CRUISE - 2) {
        // Swoop: spend speed to climb. v^2 = 2gh, with some loss.
        const climb = Math.min(20, (g.speed - GLIDE_CRUISE + 6) * 0.85) * -ctrl;
        vyTarget = climb;
        g.speed = Math.max(GLIDE_CRUISE - 4, g.speed - ((climb * GLIDE_G * 1.25) / Math.max(8, g.speed) + 2.5) * dt);
      } else {
        // Level: a slow bleed toward cruising speed and a gentle sink; faster sink when stalling.
        g.speed += (glideCruise - g.speed) * Math.min(1, dt * (g.speed > glideCruise ? 0.25 : 0.8));
        vyTarget = g.speed < 11 ? -7 : -2.4 + Math.max(0, g.speed - 22) * 0.12;
      }
      const sink = -vyTarget;
      // Steer toward where the camera faces, plus left/right input.
      const camYaw = Math.atan2(f.x, f.z);
      const want = camYaw - input.move.x * 0.9;
      const delta = Math.atan2(Math.sin(want - g.heading), Math.cos(want - g.heading));
      const turn = THREE.MathUtils.clamp(delta, -1, 1) * 2.1 * dt;
      g.heading += turn;
      vel.x = Math.sin(g.heading) * g.speed;
      vel.z = Math.cos(g.heading) * g.speed;
      vel.y += (-sink - vel.y) * Math.min(1, dt * 4);
      bat.face(g.heading);
      const lean = 1.0 + ctrl * 0.45;
      bat.tilt.rotation.x += (lean * bat.lm.fwd - bat.tilt.rotation.x) * Math.min(1, dt * 5);
      bat.tilt.rotation.z += (-turn / dt * 0.12 - bat.tilt.rotation.z) * Math.min(1, dt * 4);
      } // [move] end of the cape glide
      if (input.pressed('kick') && shouldDiveBomb(h.state, heightAboveGround()) && h.combat && can(h, 'diveBomb')) { // [onboard] gate
        h.control = createDiveControl(h, { events, combat: h.combat });
        h.combat.consumeInput('kick');
        return;
      }
      // [move] Glide kick: low over a goon, the wingsuit's kick knocks him flat on the way past.
      if (g.wingsuit && input.pressed('kick') && h.combat && glideKick()) h.combat.consumeInput('kick');
      if (!input.down('jump')) {
        setState('air');
        h.airT = 0.5;
        cape.setWings(false);
        untilt();
        bat.animator.play('Jump_Loop', { fade: 0.2 });
      }
    }

    const vy = vel.y;
    const r = integrate(dt);
    // Ladders: walk into the foot, walk off the top toward one, or drift into one falling.
    if (!h.control && h.lastClimbT > 0.4 && climbables.ladders.length) {
      let g = null, fromTop = false;
      if (h.state === 'ground' && mag > 0.3) {
        ladderOpts.reach = 0.7; ladderOpts.facingX = wish.x; ladderOpts.facingZ = wish.z;
        g = ladderGrab(climbables.ladders, pos, ladderOpts);
        if (!g) { const top = ladderTopGrab(climbables.ladders, pos, wish.x, wish.z); if (top) { g = { ladder: top, y: top.top - 1 }; fromTop = true; } }
      } else if ((h.state === 'air' || h.state === 'glide') && vel.y < 0) {
        ladderOpts.reach = 0.55; ladderOpts.facingX = undefined; ladderOpts.facingZ = undefined;
        g = ladderGrab(climbables.ladders, pos, ladderOpts);
      }
      if (g) { h.control = createLadderControl(h, { collision, events }, { ...g, fromTop }); return; }
    }
    // Ledges: falling (or gliding slowly) with an edge in reach.
    if (!h.control && settings.autoLedge && h.lastClimbT > 0.35 && vel.y < 0 &&
        (h.state === 'air' || (h.state === 'glide' && h.glide.speed < 16))) {
      const fx = Math.sin(bat.yaw), fz = Math.cos(bat.yaw);
      const ledge = findLedge(collision, pos, fx, fz);
      if (ledge) { h.control = createLedgeControl(h, { collision, events }, { ledge }); return; }
    }
    // Ziplines: jumping or gliding into a cable catches it, riding from the closest point.
    if (!h.control && h.lastClimbT > 0.5 && (h.state === 'air' || h.state === 'glide') && climbables.ziplines.length) {
      zipProbe.x = pos.x; zipProbe.y = pos.y + 2.05; zipProbe.z = pos.z;
      for (const line of climbables.ziplines) {
        zipClosest(line, zipProbe, zipHit);
        if (zipHit.dist < 0.9 && zipHit.s < line.length - 3) { h.control = createZipControl(h, { events }, { line, s: zipHit.s }); return; }
      }
    }
    const wasGrounded = h.grounded;
    if (r.grounded && vy <= 0.01) {
      if (h.state === 'air' || h.state === 'glide' || h.state === 'fly') land(vy);
      h.grounded = true;
      vel.y = 0;
    } else if (!r.grounded && wasGrounded && (h.state === 'ground' || h.state === 'roll')) {
      h.grounded = false;
      h.coyote = 0.12;
      h.airT = 0;
      setState('air');
    }
    if (h.state === 'glide' && r.hitWall && Math.hypot(vel.x, vel.z) < 4) {
      setState('air'); cape.setWings(false); untilt();
    }
    if (h.state === 'ground' && r.hitWall && mag > 0.5) tryAutoVault(wish.x, wish.z);

    h.speed = Math.hypot(vel.x, vel.z);
    if (h.state === 'ground') {
      if (h.landT > 0) h.landT -= dt;
      else if (h.blocking) bat.animator.play('Idle_Shield_Loop', { fade: 0.1 });
      else if (h.crouched || h.perched) bat.animator.play(h.speed < 0.3 ? 'Crouch_Idle_Loop' : 'Crouch_Fwd_Loop', { fade: 0.2, timeScale: h.speed < 0.3 ? 1 : Math.max(0.7, h.speed / 2.4) });
      else if (h.speed < 0.4) bat.animator.play('Idle_Loop', { fade: 0.2 });
      else if (h.speed < 8) bat.animator.play('Jog_Fwd_Loop', { fade: 0.15 });
      else bat.animator.play('Sprint_Loop', { fade: 0.15 });
      h.stride += h.speed * dt;
      if (!h.crouched && h.speed > 0.5 && h.stride > (h.speed > 8 ? 2.3 : 1.7)) { h.stride = 0; events.emit('footstep', withPlayer({ sprint: h.speed > 8 }, h.player)); }
      if (r.groundY > -Infinity && h.speed < 20) h.lastSafe.copy(pos);
    }
  }

  // ---- grapple ----
  const hand = new THREE.Vector3();
  function grappleControl(point, events) {
    const start = pos.clone();
    const n = new THREE.Vector3(point.nx ?? 0, 0, point.nz ?? 0);
    const hang = new THREE.Vector3(point.x, point.y - 1.3, point.z).addScaledVector(n, 0.55);
    const landing = new THREE.Vector3(point.x, point.y, point.z).addScaledVector(n, point.perch ? 0 : -1.1);
    let phase = 'fire', t = 0, boost = false;
    const total = start.distanceTo(hang);
    // [move] Reel speed (src/traversal/grappleRules.js): an acrobat's line is quicker (the
    // profile's grappleSpeed), the reel upgrade quicker still, and a re-grapple fired from a glide
    // with a chain charge left keeps the flight's speed (one charge spent, refilled on landing).
    const airborne = h.state === 'glide' || h.state === 'air';
    const chained = canChain(h.chain, h.moves, airborne) && can(h, 'reGrapple'); // [onboard] gate
    const entrySpeed = vel.length();
    if (chained) spendChain(h.chain);
    const link = chained ? h.chain.link : 0;
    const reel = zipSpeed(trav, h.moves, { entrySpeed, chained });
    const zipDur = zipDuration(total, reel);
    let pressK = null; // how far through the reel the first jump press came (the boost timing)
    // An acrobat swings under the line (a sagging arc) instead of the cape's straight reel.
    const swing = trav.style === 'acrobat';
    cape.setWings(false);
    untilt();
    faceTowards(point.x - pos.x, point.z - pos.z, 0, 0);
    bat.animator.play('Spell_Simple_Shoot', { once: true, timeScale: 2.4, fade: 0.05 });
    events.emit('grapple', chained ? { chained: true, link } : undefined);
    return {
      name: 'grapple',
      // [move] For a pilot or a HUD: the reel's phase and progress (the boost window is k >= 0.7).
      get phase() { return phase; },
      get k() { return phase === 'zip' ? Math.min(1, t / zipDur) : phase === 'fire' ? 0 : 1; },
      chained,
      update(dt, ctx) {
        t += dt;
        cable.visible = phase !== 'vault';
        bat.bone('hand_r').getWorldPosition(hand);
        cableGeo.attributes.position.setXYZ(0, hand.x, hand.y, hand.z);
        cableGeo.attributes.position.setXYZ(1, point.x, point.y, point.z);
        cableGeo.attributes.position.needsUpdate = true;
        if (ctx.input.pressed('jump')) {
          boost = true;
          if (pressK === null) pressK = phase === 'zip' ? Math.min(1, t / zipDur) : 0;
        }
        if (phase === 'fire') {
          // A chained line fires quicker: the hero is already moving.
          if (t > (chained ? 0.1 : 0.2)) { phase = 'zip'; t = 0; bat.animator.play('NinjaJump_Idle_Loop', { fade: 0.1 }); }
          return false;
        }
        if (phase === 'zip') {
          const dur = zipDur;
          const k = Math.min(1, t / dur);
          // A chained reel does not start from rest: a linear ramp keeps the flight's speed.
          const e = chained ? k * (1.4 - 0.4 * k) : k * k * (3 - 2 * k);
          pos.lerpVectors(start, hang, e);
          pos.y += swing ? -Math.sin(k * Math.PI) * Math.min(4, total * 0.12) : Math.sin(k * Math.PI) * Math.min(3, total * 0.05);
          vel.set(0, 0, 0);
          if (k >= 1) {
            if (point.zip) { cable.visible = false; h.control = createZipControl(h, { events }, { line: point.zip, s: 0.5 }); return false; }
            if (boost && can(h, 'grappleBoost')) { // [onboard] gate: without it the line vaults her up as before
              // Grapple boost: fling up over the ledge and straight into a glide if jump is held.
              // [move] A perfect boost (timed press, grappleBoost owned) carries the reel's speed.
              const kind = boostKind(pressK, h.moves);
              const launch = boostLaunch(kind, h.tuning, { reel, link });
              pos.copy(hang);
              // A point with no wall normal (a perch, a pole): out along the line of travel.
              let ox = -n.x, oz = -n.z;
              if (kind === 'perfect' && Math.hypot(ox, oz) < 0.5) { ox = hang.x - start.x; oz = hang.z - start.z; const L = Math.hypot(ox, oz) || 1; ox /= L; oz /= L; }
              vel.set(ox * launch.out, launch.up, oz * launch.out);
              h.grounded = false;
              setState('air');
              h.airT = 0.3;
              bat.face(Math.atan2(ox, oz));
              bat.animator.play(swing && bat.animator.has('Acro_FlipRun') ? 'Acro_FlipRun' : 'NinjaJump_Start', { once: true, fade: 0.05 });
              events.emit('grappleBoost', kind === 'perfect' ? withPlayer({ perfect: true, link }, h.player) : undefined);
              cable.visible = false;
              return true;
            }
            if (point.ledge) {
              const l = findLedge(collision, hang, -n.x, -n.z, { minRise: 0.6, maxRise: 2.6, reach: 0.9 });
              if (l) { cable.visible = false; h.control = createLedgeControl(h, { collision, events }, { ledge: l }); return false; }
            }
            phase = 'vault'; t = 0;
            bat.face(Math.atan2(-n.x || point.x - pos.x, -n.z || point.z - pos.z));
            bat.animator.play('ClimbUp_1m', { once: true, timeScale: 1.5, fade: 0.08 });
            events.emit('grappleLand');
          }
          return false;
        }
        // vault
        const k = Math.min(1, t / 0.6);
        pos.lerpVectors(hang, landing, k);
        pos.y = hang.y + (landing.y - hang.y) * Math.min(1, k * 1.6);
        if (k >= 1) {
          pos.copy(landing);
          vel.set(0, 0, 0);
          h.grounded = true;
          setState('ground');
          cable.visible = false;
          return true;
        }
        return false;
      },
    };
  }

  h.update = (dt, ctx) => {
    h.stateT += dt;
    h.lastClimbT += dt;
    tickChain(h.chain, dt); // [move]
    // Leaving the ground (or starting a move that isn't a quiet takedown) stands Batman up.
    if (h.crouched && (h.state !== 'ground' || (h.control && !h.control.keepCrouch))) setCrouch(false);
    h.invulnerable = Math.max(0, h.invulnerable - dt);
    if (trav.flight && h.state !== 'fly') h.stamina = regenStamina(trav.flight, h.stamina, dt, h.grounded, h.staminaRegenK ?? 1); // [verify] a tired Bruce's slower stamina
    bat.groundAt = heroPlantsFeet(h) ? groundUnderFoot : null;
    if (h.frozen) { bat.animator.update(dt); return; }
    easeTilt(dt);
    if (h.control) {
      const ctl = h.control;
      if (ctl.update(dt, ctx) && h.control === ctl) { h.control = null; cable.visible = false; }
    } else {
      // [move] Grapple pull (grapplePull upgrade): an aimed goon or pullable object, picked by
      // game.js / the co-op layer into ctx.pullTarget, wins over a ledge.
      if (ctx.input.pressed('grapple') && ctx.pullTarget && h.moves.pull && can(h, 'grapplePull') && (h.state === 'ground' || h.state === 'air')) { // [onboard] gate
        h.control = createPullControl(h, { events, cable, cableGeo }, ctx.pullTarget);
      } else if (ctx.input.pressed('grapple') && ctx.grappleTarget && h.state !== 'roll' && can(h, 'grapple')) { // [onboard] gate
        h.control = grappleControl(ctx.grappleTarget, events);
      } else {
        locomotion(dt, ctx);
      }
    }
    bat.animator.update(dt);
  };
  // A control that poses limbs itself (the ladder's IK) does it on top of the animation, inside
  // the animator's post-mix pass: dead blending then records the posed limbs, so the next clip
  // blends out of where the hands and feet really were (anim2: the ladder pops).
  bat.animator.after?.((dt) => h.control?.pose?.(h.frozen ? 0 : dt));

  const groundUnderHem = (x, z) => collision.groundBelow(x, pos.y + 0.3, z, 0.02);
  // Hidden (in the Batmobile, in the Batwing), the cloth was still simulated, dragged along behind
  // her position at driving and flying speed, and an eject or a bail-out showed it in whatever
  // state that left it: streaming, bunched, snapping back. Skip it while hidden and hang it fresh
  // the frame it is seen again.
  let capeHidden = false, capeFoldT = 0;
  const CAPE_FOLDED = 0.6, CAPE_BUNCHED = 1.1; // hem height above her feet (m); it rests near 0.25
  h.updateCape = (dt) => {
    if (!hasCape) return;
    if (!cape.mesh.visible) { capeHidden = true; return; }
    if (capeHidden) { capeHidden = false; cape.reset(); }
    // Air rushing past the cape.
    const ew = h.envWind; // [env] the weather's wind (world.windVec, set by game.js)
    const wind = [-vel.x * 0.8 + 0.6 + (ew ? ew[0] : 0), -vel.y * 0.5 + (h.state === 'glide' ? 6 : 0), -vel.z * 0.8 + 0.3 + (ew ? ew[1] : 0)];
    // While the hero stands, the hem rests on whatever is within a step of the feet under each of
    // its points (a roof, a parapet) and hangs free past an edge; hanging, climbing or airborne
    // the whole cloth falls free.
    const standing = !h.control && h.grounded && (h.state === 'ground' || h.state === 'roll');
    cape.update(dt, wind, standing ? groundUnderHem : null);
    // A jump or a drop (out of the Batmobile, off a ledge) can leave the cape folded up on her
    // back, and it stayed that way, piling higher with every jump. Standing still with the hem
    // held up above her hips for a second means it is stuck: hang it fresh. Up at her shoulders
    // it can only be a fold, so that is caught sooner, before she sees it crumpled there.
    const still = standing && h.state === 'ground' && Math.hypot(vel.x, vel.z) < 0.5;
    const hem = cape.hemY() - pos.y;
    if (still && hem > CAPE_FOLDED) capeFoldT += dt; else capeFoldT = 0;
    if (capeFoldT > (hem > CAPE_BUNCHED ? 0.35 : 1)) { capeFoldT = 0; cape.reset(); }
  };

  h.teleport = (p, yaw = bat.yaw) => {
    pos.set(p.x, p.y, p.z);
    vel.set(0, 0, 0);
    bat.face(yaw);
    h.control = null;
    h.crouched = false; h.perched = false;
    h.grounded = true;
    setState('ground');
    cape.setWings(false);
    bat.tilt.rotation.set(0, 0, 0);
    cape.reset();
    bat.animator.play('Idle_Loop', { fade: 0 });
  };

  h.cameraMode = () => {
    if (h.control?.camera) return h.control.camera;
    if (h.control?.name === 'grapple') return 'zip';
    if (h.state === 'glide' && h.glide.wingsuit) return 'wingsuit'; // [move] its own speed FOV
    if (h.state === 'glide' || h.state === 'fly') return 'glide';
    if (h.speed > 8.5 && h.state === 'ground') return 'sprint';
    return 'ground';
  };

  // Used by the traversal controls in src/actors/traverse/.
  Object.assign(h, { setState, faceTowards, integrate, startGlide, land, heightAboveGround, RADIUS, HEIGHT, GRAVITY });

  return h;
}
