// Goon AI: idle, alert, circle the hero, wind up (glyph), attack, react to hits; one body for every
// role (src/enemies/roleKit.js: grunt, knife, brute, rifle and the Long Night 2 roles shield,
// baton, heavy, pistol, sniper, ninja, medic, lieutenant).
//
// Animation (workstream I): everything plays through the goon's animation graph
// (src/anim/graph.js). A melee blow resolves when the strike clip reaches its `contact` event,
// against where the hero is THEN (he can dodge out of the warp window); the lunge is the clip's own
// root motion warped onto him (at most 2.5 m), never a separate 0.16 s slide. Hit reactions come
// from the shared directional table (front / back / left / right x light / heavy, knockdowns by
// direction, an air loop while launched, get-ups) and hold until the clip's `recover`; a front hit
// turns him toward the attacker over a beat. Armoured and shielded goons flinch additively.
// Until the lazy packs arrive (and always in unit tests) the preloaded clips stand in.
import * as THREE from 'three';
import { createGoon, footGround, enemyPlantsFeet } from './characters.js';
import { createHarleyCharacter } from './harleyChar.js';
import { ENEMY } from '../combat/rules.js';
import { yankVelocity } from '../gadgets/aim.js';
import { chooseHarleyMove, shouldCartwheel, harleyGlyph, harleyWindup, HARLEY_COOLDOWN, HARLEY_TAUNTS } from '../combat/harleyLogic.js';
import { MOCAP_DATA } from '../config/mocapData.js';
import { graphFor } from '../anim/graph.js';
import { clipInfo, hasPackClip } from '../anim/clips.js';
import { createStrikeWarp, angleDiff } from '../anim/warp.js';
import { rootMotionAt } from '../combat/reach.js';
import { carryPelvis } from '../anim/paired.js';
import { loadEnemyPack, primeLater } from '../anim/packs.js';
import { roleKit, roleClips, REACT_TABLE, REACT_CLIPS } from '../enemies/roleKit.js';
import { createProp, attachProp } from '../heroes/models/props.js';

const IDLE_POSES = ['Idle_Talking_Loop', 'Idle_TalkingPhone_Loop', 'Idle_FoldArms_Loop', 'Idle_Loop'];
// How long a melee blow takes from the end of the wind-up to landing (the clip is sped up so its
// contact frame arrives about this long after the wind-up ends).
const STRIKE_LAND = 0.17;
// Fight stances and taunts, while circling Batman.
const GUARDS = ['Goon_Fight_Idle', 'Goon_Bounce_Idle'];
const TAUNTS = ['Goon_Taunt_A', 'Goon_Taunt_B'];
// The get-up from the back: the clip lies still for its first 2.6 s.
const GETUP = { clip: 'Goon_GetUp', from: 2.55, speed: 2.6, length: 1.2 };
// Hit reactions by where the blow landed (src/actors/reactions.js): the fallback table.
const REACTIONS = { head: 'Hit_Head_Snap', gut: 'Hit_Gut_Fold', spin: 'Hit_Spin', sweep: 'Sweep_Fall' };
// Where each KO clip starts going over. Both open on their feet (Death01 sags for 0.8 s), and a
// critical KO plays in slow motion, so from frame 0 a knocked-out goon stood for over a second.
export const KO_FALL = {
  Death01: { startAt: 0.6, timeScale: 1.3 },
  Hit_Knockback: { startAt: 0.3, timeScale: 1.2 },
};
// Clips a chain takedown plays straight onto a held goon's mixer (chainControl.js: the daze while
// waiting for a turn, the head grab, the yank, and enemy.tie's knockback into the tied pose).
// Primed here, at spawn, so the first chain of a fight doesn't build an action mid-chain.
export const CHAIN_HOLD_CLIPS = ['Idle_Shield_Break', 'Hit_Head', 'Hit_Chest', 'Hit_Knockback'];
// States wake() lets finish on their own instead of jumping straight to 'alert' (see e.wake below).
const WAKE_HOLD_STATES = ['tied', 'down', 'getup', 'chained', 'grabbed'];
// The melee strike's reach for damage on its contact frame: from the root, limb reach plus this.
const HIT_SLACK = 0.75;
// Melee wind-ups start only this close (the goon walks in first, without a tell): within what
// the strike's warped lunge (2.5 m at most) plus its reach can cover.
const ATTACK_RANGE = 3.4;

export function createEnemy({ id, type, assets, scene, collision, rng, events = null, gang = undefined }) {
  const kit = roleKit(type);
  // [story] gang: a district gang's colours for the role figures (src/heroes/models/enemies.js GANGS).
  const ch = type === 'harley' ? createHarleyCharacter(assets) : createGoon(assets, { type: kit.look ?? type, rng, gang });
  ch.animator.prime(CHAIN_HOLD_CLIPS);
  const groundUnderFoot = footGround(collision);
  scene.add(ch.root);
  const def = ENEMY[type] ?? ENEMY.grunt;
  const scale = def.scale;
  const pos = ch.root.position;
  const tmp = new THREE.Vector3();
  const e = {
    id, type, def, ch, pos, scale, kit,
    health: def.health, alive: true, down: false, stunned: false,
    state: 'idle', t: 0, stunT: 0, downT: 0, aware: false,
    ringAngle: rng.range(0, Math.PI * 2), ringDist: rng.range(3.6, 5.8), strafe: rng.chance(0.5) ? 1 : -1, strafeT: rng.range(1, 3),
    attackKind: null, windupDur: 0.6, hitDone: false,
    lungeFrom: new THREE.Vector3(), lungeTo: new THREE.Vector3(), chargeDir: new THREE.Vector3(),
    knock: new THREE.Vector3(),
    vel: new THREE.Vector3(), air: false, airFrom: 0, thrown: false,
    idlePose: rng.pick(IDLE_POSES),
    guard: rng.pick(GUARDS), tauntT: 0, tauntCd: rng.range(3, 8), locoName: null, locoT: 0,
    glyph: null, tell: null,
    tiedWith: null, tiedT: 0,
    frozenT: 0, lostT: 0, shattered: false,
    // Harley Quinn only (type 'harley'): per-move cooldowns and her cartwheel dodge tic.
    harleyCd: { slam: 0, sweep: 0, throw: 0 }, cartwheelCd: rng.range(0.6, 1.6), harleySlammed: false,
    // Predator stealth (src/stealth/stealthSystem.js): where the goon walks or looks, which room it
    // belongs to, and whether it can see Batman right now (a rifle only fires when it can).
    nav: { x: 0, y: 0, z: 0, speed: 0, face: null, lookX: 0, lookZ: 0, arrived: false, px: 0, pz: 0, stuckT: 0 },
    room: null, seesHero: undefined,
    // Roles: a charged stun baton, the knife's parry chain, the ninja's reversal, the medic's
    // revive, morale (fear state), the squad's slot for him (src/enemies/squad.js), and what the
    // AI was told by the squad director this frame (hesitation, wild swings).
    charged: !!def.shock, parryLeft: kit.parryChain ?? 0, reversed: false, evadeCd: 0,
    reviving: null, reviveT: 0, mood: 'steady', moodT: 0, windupDelay: 0, tellScale: 1, missChance: 0,
    slotX: undefined, slotZ: undefined, ring: null, backoffT: 0, weapon: def.shock ? 'baton' : type === 'knife' ? 'knife' : null,
    get yaw() { return ch.yaw; },
    get ranged() { return !!e.def.ranged; },
    // For the squad planner (src/enemies/squad.js): who he is after and his place in the queue.
    targetKey: 0, holdsToken: false, nextInLine: false, role: type, koT: 0, pickup: null,
    get aiming() { return e.state === 'windup' && (e.attackKind === 'rifle' || e.attackKind === 'pistol' || e.attackKind === 'sniper'); },
    radius: 0.42 * scale,
    get x() { return pos.x; },
    get z() { return pos.z; },
  };
  const g = graphFor(ch, { events, actor: e, who: 'goon' });
  const has = (name) => ch.animator.has?.(name) ?? false;
  // A pack clip that has actually arrived (in unit tests no pack is registered: old clips play).
  const packed = (name) => !!name && hasPackClip(name) && has(name);
  const firstPacked = (list) => (list ?? []).find(packed) ?? null;
  if (kit.pack && assets?.clips) loadEnemyPack(assets.clips).then((ok) => { if (ok) primeLater(ch.animator, roleClips(type)); });
  if (assets?.clips) primeLater(ch.animator, REACT_CLIPS);

  // Rifle goons fight from range and carry their rifle in every pose.
  const RIFLE = type === 'rifle';
  const RANGED = !!def.ranged;
  const WALK = RIFLE ? 'Rifle_Walk' : 'Walk_Loop', IDLE = RIFLE ? 'Rifle_Idle' : 'Idle_Loop', LOOK = RIFLE ? 'Rifle_Search' : 'Idle_No_Loop';
  if (RANGED) { e.ringDist = type === 'sniper' ? rng.range(16, 24) : rng.range(9, 14); if (RIFLE) e.idlePose = 'Rifle_Idle'; }

  const faceHero = (hero, rate, dt) => {
    const dx = hero.pos.x - pos.x, dz = hero.pos.z - pos.z;
    turnTo(Math.atan2(dx, dz), rate, dt);
  };
  // Turning (anim2): the turn rate eases in and out (a little angular momentum, capped at
  // TURN_MAX rad/s) instead of jumping to rate x angle the frame a goal appears: a goon that
  // switched from facing Batman to facing where he walks, or back, spun round in a frame or two.
  let turnV = 0;
  const TURN_MAX = 11;
  const turnTo = (yaw, rate, dt) => {
    if (dt <= 0) return;
    const d = Math.atan2(Math.sin(yaw - ch.yaw), Math.cos(yaw - ch.yaw));
    const want = Math.max(-TURN_MAX, Math.min(TURN_MAX, d * rate));
    turnV += (want - turnV) * Math.min(1, dt * 22);
    let step = turnV * dt;
    if (Math.abs(step) > Math.abs(d)) { step = d; turnV = 0; }
    ch.face(ch.yaw + step);
  };
  // States the stealth runtime may steer a goon out of.
  const NAV = new Set(['idle', 'alert', 'patrol', 'search', 'hunt', 'suspicious', 'look', 'engage', 'recover']);
  const WALKING = new Set(['patrol', 'search', 'hunt']);
  const MELEE_DY = 2.5; // metres up or down a punch, knife or charge can still reach
  const play = (name, opts) => ch.animator.play(name, opts);
  // One options object for the per-frame locomotion calls (no allocation per goon per frame):
  // the animator and the graph read it and keep nothing.
  const loOpts = { fade: 0.2, timeScale: 1 };
  const lo = (fade, timeScale = 1) => { loOpts.fade = fade; loOpts.timeScale = timeScale; return loOpts; };
  // Through the graph: combat clips (strikes, reactions, falls) switch with dead blending.
  const gplay = (name, opts) => g.play(name, { blend: 'inertial', ...opts });
  // Locomotion clips (guard, strafe, walk, jog) hold for at least LOCO_HOLD seconds once picked:
  // a goon whose speed flickers round zero (crowding round Batman, circling) used to swap clips
  // every few frames, and each swap back cut off a clip that was still fading out (a pop).
  const LOCO_HOLD = 0.35;
  const loco = (name, opts) => {
    const cur = ch.animator.currentName;
    if (cur !== name && cur === e.locoName && e.locoT > 0) return;
    if (cur !== name) { e.locoName = name; e.locoT = LOCO_HOLD; }
    play(name, opts);
  };

  // ---- attacks ----
  let warp = null;
  const warpOut = { dx: 0, dz: 0, yaw: 0 };
  const heroView = { x: 0, z: 0, radius: 0.35, scale: 1 };
  let strikeName = null, strikeStart = 0;
  // A strike clip winds up over `dur` seconds to its cocked pose (a beat before contact); at the
  // end of the wind-up strikeFire() speeds it up so contact lands STRIKE_LAND later. Clips without
  // data keep the old slow-motion wind-up with a derived contact.
  const strikeClip = (name, dur, fallback, fallbackScale) => {
    const info = clipInfo(name);
    if (!info?.events?.contact || !has(name)) {
      strikeName = fallback; strikeStart = 0;
      gplay(fallback, { state: 'strike', timeScale: fallbackScale, fade: 0.1, blend: 'fade', on: { contact: onContact } });
      return;
    }
    const c = info.events.contact;
    const cocked = Math.max(0.05, c - 0.14);
    // Clips with a long lead-in before the wind-up start near it.
    const start = Math.max(0, Math.min(cocked - 0.3, (info.events.warpStart ?? 0) - 0.35));
    strikeName = name; strikeStart = start;
    // A long blend: the guard stance is a crouch and the clip starts upright, and the wind-up is
    // slow anyway (0.6 s or more).
    gplay(name, { state: 'strike', timeScale: (cocked - start) / Math.max(0.2, dur), startAt: start, fade: 0.25, on: { contact: onContact } });
  };
  const strikeFire = () => {
    const info = clipInfo(g.clip);
    const c = info?.events?.contact;
    if (typeof c === 'number' && g.clip === strikeName) {
      g.setSpeed(Math.min(2.6, Math.max(1, (c - g.time) / STRIKE_LAND)));
      const entry = info.reach ? info : null;
      warp = entry ? createStrikeWarp(entry, { startAt: g.time, warpStart: g.time, maxWarp: 2.5, inside: 0.1 }) : null;
      return;
    }
    // Old clips: restart at speed (the slow wind-up was the clip's opening).
    warp = null;
    gplay(g.clip ?? ch.animator.currentName, { state: 'strike', timeScale: 1.7, fade: 0.06, blend: 'fade', on: { contact: onContact } });
  };
  // The blow lands (or misses) on the clip's contact frame, against where the hero is then: the
  // event marks it due, and it resolves after this frame's lunge step (resolveContact).
  let ctxNow = null, contactDue = false;
  function onContact() { if (e.state === 'attack' && !e.hitDone) contactDue = true; }
  function resolveContact() {
    contactDue = false;
    if (e.state !== 'attack' || e.hitDone || !ctxNow) return;
    if (e.attackKind === 'charge' || RANGED || e.attackKind?.startsWith?.('harley')) return;
    e.hitDone = true;
    const hero = ctxNow.hero;
    const info = clipInfo(g.clip);
    const limb = info?.reach?.z ?? 0.7;
    const d = Math.hypot(hero.pos.x - pos.x, hero.pos.z - pos.z);
    const level = Math.abs(hero.pos.y - pos.y) < MELEE_DY;
    // A wild swing (fear) may go wide.
    if (e.missChance > 0 && rng.chance(e.missChance)) return;
    if (d < (limb + HIT_SLACK) * scale && level) ctxNow.onAttackLand(e, e.attackKind);
  }

  // ---- falls (anim2): knocked down or launched -> (air loop) -> floor -> lying -> get-up, as one
  // continuous chain. The fall clip is timed so its `down` event (floor contact) comes as the body
  // lands; a long flight switches to the air loop before the clip would hit the floor in mid-air;
  // on the floor the clip's own root motion carries the body (no skating on a knock slide); a
  // clip with its own get-up (KD_Launch) holds lying and carries on into it; the others hand over
  // to the get-up clip turned and moved so its lying pose sits where the body lies, dead-blended.
  const fallInfo = { clip: null, down: null, getUpStart: null, held: false, rm: null, flew: false, speed: 1 };
  const rmA = [0, 0], rmB = [0, 0];
  const airTimeFor = (vy) => Math.max(0.15, (2 * Math.max(0, vy)) / 24);
  function setFall(clip, info) {
    fallInfo.clip = clip; fallInfo.down = info?.events?.down ?? null; fallInfo.getUpStart = info?.events?.getUpStart ?? null;
    fallInfo.held = false; fallInfo.flew = false; fallInfo.rm = info?.root?.length > 4 ? info : null;
  }
  function fall(clip, { startAt = 0, timeScale = 1.15, fade = 0.15, airTime = 0 } = {}) {
    const info = clipInfo(clip);
    const down = info?.events?.down ?? null;
    let s0 = startAt, ts = timeScale;
    if (airTime > 0 && down !== null && down > s0) {
      const need = (down - s0) / airTime;
      // Never faster than 1.6x (a flip at 2.4x read as a jerk): a short flight starts later in.
      if (need > 1.6) { s0 = Math.max(0, down - airTime * 1.6); ts = 1.6; } else ts = Math.max(0.75, need);
    }
    gplay(clip, { state: 'knockdown', timeScale: ts, startAt: s0, fade });
    setFall(clip, info);
    fallInfo.flew = airTime > 0;
    fallInfo.speed = ts;
  }
  function airLoop() {
    e.airPose = true;
    if (g.clip !== 'Air_Flail') gplay('Air_Flail', { state: 'air', once: false, timeScale: 0.5, fade: 0.25 });
  }
  // One frame of the chain (c0: the clip time before this frame's step).
  function fallStep(c0) {
    if (!fallInfo.clip || g.clip !== fallInfo.clip || (g.state !== 'knockdown' && g.state !== 'getup')) return;
    if (e.air) {
      if (g.state === 'knockdown' && fallInfo.down !== null && g.time > fallInfo.down - 0.15 && e.vel.y < 1 && packed('Air_Flail')) {
        const gy = collision.groundBelow(pos.x, pos.y + 0.2, pos.z, 0.3);
        if (pos.y - gy > 0.7) airLoop();
      }
      return;
    }
    if (g.state === 'knockdown' && fallInfo.down !== null) {
      // Landed before the clip reached the floor (a short hop): hurry it there.
      if (g.time < fallInfo.down - 0.02) { if (fallInfo.flew && g.speed < 2.2) g.setSpeed(2.2); }
      else if (!fallInfo.held && fallInfo.getUpStart !== null && g.time >= Math.min(fallInfo.getUpStart - 0.08, fallInfo.down + 0.45)) { fallInfo.held = true; g.setSpeed(0); }
      else if (!fallInfo.held && fallInfo.flew && g.speed > 1.3) g.setSpeed(1.15);
    }
    // The clip's own root motion along the floor (rotated into his facing).
    if (fallInfo.rm && g.speed > 0 && g.time > c0) {
      rootMotionAt(fallInfo.rm, c0, rmA); rootMotionAt(fallInfo.rm, g.time, rmB);
      const dx = rmB[0] - rmA[0], dz = rmB[1] - rmA[1], c = Math.cos(ch.yaw), sn = Math.sin(ch.yaw);
      pos.x += c * dx + sn * dz; pos.z += -sn * dx + c * dz;
    }
  }
  // Plays a get-up turned and moved so its first (lying) pose lies where the body lies now: the
  // heading (hips to head) and the hips' spot match, and the held old pose is carried along so
  // the dead blend starts from exactly what was on screen.
  const allBones = [];
  ch.model?.traverse?.((o) => { if (o.isBone) allBones.push(o); });
  const saved = new Float32Array(allBones.length * 4);
  const hipsAt = new THREE.Vector3(), headAt = new THREE.Vector3(), savedHips = new THREE.Vector3();
  const Mp = new THREE.Matrix4(), Mrel = new THREE.Matrix4();
  function alignedPlay(clip, opts) {
    const pelvis = ch.bone('pelvis'), head = ch.bone('Head');
    if (!pelvis || !head || !pelvis.parent) { gplay(clip, opts); return; }
    ch.root.updateMatrixWorld(true);
    pelvis.getWorldPosition(hipsAt); head.getWorldPosition(headAt);
    const ax = hipsAt.x, az = hipsAt.z, curYaw = Math.atan2(headAt.x - ax, headAt.z - az);
    Mp.copy(pelvis.parent.matrixWorld);
    for (let i = 0; i < allBones.length; i++) allBones[i].quaternion.toArray(saved, i * 4);
    savedHips.copy(pelvis.position);
    gplay(clip, opts);
    // Without a dead blend (the low tiers) moving the root would jump the old pose: play as is.
    if (!ch.animator.blending || !ch.animator.mixer) return;
    ch.animator.mixer.update(0);
    ch.root.updateMatrixWorld(true);
    pelvis.getWorldPosition(hipsAt); head.getWorldPosition(headAt);
    const d = angleDiff(curYaw, Math.atan2(headAt.x - hipsAt.x, headAt.z - hipsAt.z));
    ch.face(ch.yaw + d);
    ch.root.updateMatrixWorld(true);
    pelvis.getWorldPosition(hipsAt);
    pos.x += ax - hipsAt.x; pos.z += az - hipsAt.z;
    ch.root.updateMatrixWorld(true);
    Mrel.copy(pelvis.parent.matrixWorld).invert().multiply(Mp);
    ch.animator.rebaseBlend(Mrel);
    // Back to what is on screen, carried to the new root (if this frame was already posed).
    for (let i = 0; i < allBones.length; i++) allBones[i].quaternion.fromArray(saved, i * 4);
    pelvis.position.copy(savedHips);
    carryPelvis(pelvis, Mrel);
  }

  const getUp = (lying = 'back') => {
    // A fall clip with its own get-up, held lying: carry on into it (no transition at all).
    if (g.clip === fallInfo.clip && fallInfo.held && fallInfo.getUpStart !== null) { g.relabel('getup'); g.setSpeed(1.5); fallInfo.held = false; return; }
    const pack = REACT_TABLE.getup[lying];
    const kip = type === 'ninja' && packed('GetUp_KipUp');
    if (kip || packed(pack)) {
      const clip = kip ? 'GetUp_KipUp' : pack;
      const info = clipInfo(clip);
      const from = info?.events?.getUpStart ?? 0;
      // From a beat before he starts to rise: the blend settles while he still lies.
      alignedPlay(clip, { state: 'getup', timeScale: kip ? 1.5 : 2.4, startAt: Math.max(0, from - (kip ? 0.2 : 0.3)), fade: 0.2 });
      setFall(clip, info);
      return;
    }
    if (has(GETUP.clip)) gplay(GETUP.clip, { state: 'getup', timeScale: GETUP.speed, startAt: GETUP.from, fade: 0.15 });
    else gplay('LayToIdle', { state: 'getup', timeScale: 1.4, fade: 0.1 });
  };
  function setState(s) { e.state = s; e.t = 0; }
  // [fix1] Where a goon goes when a reaction (a flinch, a stun, getting up) ends: back to the fight,
  // or, scared off (fear's 'flee' mood, set once), back to running. It used to be 'engage' always,
  // so a fleeing goon who took one blow stood on his ring for good with a mood that keeps him from
  // attacking: a knife goon there parried every punch for the rest of the fight (combatRoles.spec).
  const fightOn = () => (e.mood === 'flee' ? 'flee' : 'engage');

  e.place = (p, yaw = 0) => { pos.set(p.x, p.y, p.z); ch.face(yaw); };

  e.wake = () => {
    if (e.aware || !e.alive) return;
    e.aware = true;
    if (type === 'harley') events?.emit('harleyTaunt', { text: HARLEY_TAUNTS[0] });
    // Held, tied or on the floor: aware from now on, but let that state finish on its own.
    // getup and tie expiry (below) and chainRelease already send an aware goon on to 'engage'.
    if (WAKE_HOLD_STATES.includes(e.state)) return;
    setState('alert');
    play(rng.chance(0.5) ? 'Idle_No_Loop' : 'Yes', { once: true, timeScale: 1.3, fade: 0.15 });
  };

  // Chain takedowns (src/combat/chainControl.js) hold a goon in place: no AI, no physics; the
  // chain moves and animates it. Returns whether it was mid-attack (the caller frees its
  // director slot).
  e.chainHold = () => {
    const was = e.state === 'windup' || e.state === 'attack';
    e.glyph = null;
    e.countered = false;
    e.knock.set(0, 0, 0);
    e.vel.set(0, 0, 0);
    setState('chained');
    return was;
  };
  e.chainRelease = () => { if (e.state === 'chained') setState(e.aware ? 'engage' : 'idle'); };

  // Rope-a-Dope: tied up with `partners` for `seconds`. Down and helpless; any hit on one of
  // them knocks the whole bundle out (combatSystem's landHit). Returns whether it was mid-attack.
  e.tie = (partners, seconds = 6) => {
    if (!e.alive) return false;
    const was = e.state === 'windup' || e.state === 'attack';
    e.glyph = null;
    e.countered = false;
    e.stunned = false;
    e.down = true;
    e.tiedWith = partners.filter((p) => p !== e);
    e.tiedT = seconds;
    setState('tied');
    play('Hit_Knockback', { once: true, timeScale: 1.3, fade: 0.05 });
    return was;
  };

  // Freeze blast: stuck in ice for `sec`. No AI and no animation (the pose stays in the ice).
  // Any hit shatters it (applyHit). Returns whether it was mid-attack.
  e.freeze = (sec) => {
    if (!e.alive || e.def.boss || e.down || e.air || e.state === 'tied' || e.state === 'chained') return false;
    const was = e.state === 'windup' || e.state === 'attack';
    e.glyph = null;
    e.countered = false;
    e.knock.set(0, 0, 0);
    e.frozenT = sec;
    e.shattered = false;
    setState('frozen');
    return was;
  };
  e.thaw = () => {
    if (e.state !== 'frozen') return;
    e.frozenT = 0;
    setState(e.aware ? 'engage' : 'idle');
  };

  // Flashbang: blinded and staggering for `sec` (the stun state; a hit ends it early).
  e.dazzle = (sec) => {
    if (!e.alive || e.down || e.air || e.def.boss) return false;
    const was = e.state === 'windup' || e.state === 'attack';
    e.glyph = null;
    e.stunned = true;
    e.stunT = Math.max(e.stunT, sec);
    setState('stunned');
    playStun(0.8);
    return was;
  };
  const playStun = (ts = 0.8) => {
    if (packed('Stun_Dizzy')) gplay('Stun_Dizzy', { state: 'react', once: false, timeScale: 1.2, fade: 0.12 });
    else play('Idle_Shield_Break', { once: true, timeScale: ts, fade: 0.15 });
  };

  // Smoke: loses track of Batman for `sec`: no wind-ups, and the goon drifts off its ring.
  // Part D's stealth can define e.search(from) to send it looking instead.
  e.lose = (sec, from) => {
    if (e.lostT <= 0) e.ringDist += 3;
    e.lostT = Math.max(e.lostT, sec);
    e.ringAngle += Math.PI * (0.5 + rng.next());
    e.search?.(from);
  };

  // Batclaw: yanked on an arc to `to` (in front of Batman). It lands down, so the next punch is a
  // free knockout; yanked off a ledge, it falls and onLanded knocks it out.
  e.yank = (to) => {
    if (!e.alive || e.def.boss || e.state === 'frozen') return false;
    const was = e.state === 'windup' || e.state === 'attack';
    e.glyph = null;
    e.countered = false;
    const v = yankVelocity(pos, to);
    e.launch(v.vx, v.vy, v.vz);
    e.down = true;
    e.downT = Math.max(e.downT, 1.8);
    setState('down');
    if (e.weapon && e.weapon !== 'baton') dropWeapon();
    play('Hit_Knockback', { once: true, timeScale: 1.3, fade: 0.05 });
    return was;
  };

  // Stealth steering. The runtime calls these every frame; they only change state when the state
  // changes, so the state timer and animations don't restart.
  e.canNav = () => e.alive && !e.down && !e.air && !e.countered && NAV.has(e.state);
  e.goTo = (x, y, z, speed, state = 'patrol', face = null) => {
    if (Math.hypot(x - e.nav.x, z - e.nav.z) > 0.3) { e.nav.arrived = false; e.nav.stuckT = 0; }
    e.nav.x = x; e.nav.y = y; e.nav.z = z; e.nav.speed = speed; e.nav.face = face;
    if (e.state !== state) { setState(state); e.nav.arrived = false; }
  };
  e.lookAt = (x, z, state = 'suspicious') => {
    e.nav.lookX = x; e.nav.lookZ = z;
    if (e.state !== state) setState(state);
  };
  // Hostile and seen: the fight AI takes over.
  e.engageNow = () => {
    e.aware = true;
    if (e.state !== 'engage' && NAV.has(e.state)) setState('engage');
  };
  // The squad lost Batman: back under stealth control.
  e.calm = () => {
    e.aware = false;
    e.glyph = null;
    if (NAV.has(e.state) || e.state === 'windup' || e.state === 'attack' || e.state === 'approach') setState('look');
  };

  // Whether the goon may be given an attack token now (the director asks).
  e.ready = (hero) => {
    if (e.state !== 'engage' || !e.alive || e.down || e.lostT > 0 || e.backoffT > 0) return false;
    if (e.mood === 'hesitant' && e.moodT < 0.6) return false;
    const d = tmp.set(hero.pos.x - pos.x, 0, hero.pos.z - pos.z).length();
    // Fists and knives only reach Batman on the goon's own level (not up on a gargoyle).
    if (type === 'harley') return d < 14 && Math.abs(hero.pos.y - pos.y) < MELEE_DY;
    return RANGED ? e.seesHero !== false && d < (def.range ?? 30) : d < 6.5 && Math.abs(hero.pos.y - pos.y) < MELEE_DY;
  };

  // The token was granted: melee goons walk in first (no tell yet), then wind up in reach.
  // `opts.warn` false (knightmare) hides the glyph; the tell is still in the animation.
  e.startWindup = (windup, hero, opts = {}) => {
    e.hitDone = false;
    e.windupBase = windup * (e.tellScale || 1);
    e.warn = opts.warn !== false;
    const dist = Math.hypot(hero.pos.x - pos.x, hero.pos.z - pos.z);
    // Far off (past where a wind-up's walk-in can close), he runs in first without a tell.
    if (!RANGED && type !== 'harley' && !opts.now && dist > 5.2 * scale) { setState('approach'); return; }
    beginWindup(e.windupBase, hero);
  };
  function chooseMelee() {
    const k = kit;
    if (k.grab && rng.chance(k.grab) && packed('Grab_Slam')) return { kind: 'grab', clip: 'Grab_Slam' };
    if (k.charge && rng.chance(k.charge)) return { kind: 'charge', clip: null };
    const c = firstPacked(shuffled(k.attacks)) ?? rng.pick(k.fallback.filter(has).length ? k.fallback.filter(has) : ['Punch_Cross']);
    return { kind: k.kind, clip: c };
  }
  const shuffleBuf = [];
  function shuffled(list) {
    shuffleBuf.length = 0;
    for (const x of list ?? []) shuffleBuf.push(x);
    for (let i = shuffleBuf.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = shuffleBuf[i]; shuffleBuf[i] = shuffleBuf[j]; shuffleBuf[j] = t; }
    return shuffleBuf;
  }
  function beginWindup(windup, hero) {
    setState('windup');
    e.hitDone = false;
    e.windupN = (e.windupN ?? 0) + 1;
    warp = null;
    const show = (c) => { e.tell = c; e.glyph = e.warn === false ? null : c; };
    if (type === 'brute' || type === 'heavy') {
      const m = chooseMelee();
      e.attackKind = m.kind;
      e.windupDur = windup + 0.35;
      show('red');
      if (m.kind === 'charge') {
        if (packed('Brute_Roar')) gplay('Brute_Roar', { state: 'action', timeScale: 1.23 / e.windupDur, fade: 0.15 });
        else play('Shield_Dash', { once: true, timeScale: 0.22, fade: 0.1 });
      } else strikeClip(m.clip, e.windupDur, 'Sword_Heavy_Combo', 0.22);
    } else if (RANGED) {
      // A long, readable aim: the red laser holds on Batman, then one shot.
      e.attackKind = type === 'sniper' ? 'sniper' : type === 'pistol' ? 'pistol' : 'rifle';
      e.windupDur = windup + (type === 'sniper' ? 1.1 : type === 'pistol' ? 0.4 : 0.55);
      show('red');
      const aim = packed(kit.aim) ? kit.aim : 'Rifle_Aim';
      if (has(aim)) play(aim, { fade: 0.12 });
    } else if (type === 'harley') {
      // Mallet slam and sweep at melee range, an occasional pie/gag throw at a distance;
      // src/combat/harleyLogic.js picks which and gates it on her own per-move cooldowns.
      const dx0 = hero.pos.x - pos.x, dz0 = hero.pos.z - pos.z;
      const dist0 = Math.hypot(dx0, dz0);
      const move = chooseHarleyMove(dist0, e.harleyCd, rng.next()) ?? 'slam';
      e.harleyCd[move] = HARLEY_COOLDOWN[move];
      e.attackKind = move === 'slam' ? 'harleySlam' : move === 'sweep' ? 'harleySweep' : 'harleyThrow';
      e.windupDur = windup + harleyWindup(move);
      show(harleyGlyph(move));
      if (move === 'slam') {
        if (!e.harleySlammed) { e.harleySlammed = true; events?.emit('harleyTaunt', { text: HARLEY_TAUNTS[1] }); }
        gplay('Sword_Heavy_Combo', { state: 'strike', timeScale: 0.22, fade: 0.12 });
      } else if (move === 'sweep') {
        gplay('Sword_Regular_A', { state: 'strike', timeScale: 0.28, fade: 0.12 });
      } else {
        gplay('OverhandThrow', { state: 'strike', timeScale: 0.45, fade: 0.12 });
      }
    } else {
      const m = chooseMelee();
      e.attackKind = type === 'joker' ? 'joker' : m.kind;
      e.windupDur = windup + (type === 'knife' ? 0.1 : 0);
      show(kit.glyph ?? 'blue');
      strikeClip(m.clip, e.windupDur, 'Punch_Cross', 0.25);
    }
    // (No snap to face him here: the wind-up turns him at its own rate, from the first frame.)
  }

  // A counter landing on a knife chain or a ninja: he may turn it aside and come straight back
  // with another blow (a fresh, short tell): the player counters again. Returns true when he did.
  e.riposte = (hero, smart = 0.6) => {
    if (!e.alive || e.down || e.stunned) return false;
    const knife = e.parryLeft > 0;
    const ninja = def.counterCounter && !e.reversed && rng.chance(0.35 + 0.4 * smart);
    if (!knife && !ninja) return false;
    if (knife) e.parryLeft -= 1; else e.reversed = true;
    e.countered = false;
    const parry = packed('Block_Outward') ? 'Block_Outward' : 'Sword_Block';
    if (has(parry)) gplay(parry, { state: 'react', timeScale: 2, fade: 0.06 });
    e.ripostePending = 0.18;
    e.riposteHero = hero;
    setState('riposte');
    return true;
  };
  // A plain strike on a ninja: he may slip it (a cartwheel or a side step) — vary the rhythm.
  e.tryEvade = (from, dodgeMul = 1) => {
    if (!def.dodge || !e.alive || e.down || e.stunned || e.state === 'attack' || e.state === 'windup' || e.evadeCd > 0) return false;
    if (!rng.chance(def.dodge * dodgeMul)) return false;
    e.evadeCd = 1.6;
    const clip = firstPacked(kit.evade);
    if (clip) gplay(clip, { state: 'dodge', timeScale: 1.7, fade: 0.06 });
    const ax = pos.x - from.x, az = pos.z - from.z, al = Math.hypot(ax, az) || 1;
    const side = rng.chance(0.5) ? 1 : -1;
    e.knock.set((az / al) * side * 6 + (ax / al) * 2, 0, (-ax / al) * side * 6 + (az / al) * 2);
    setState('evade');
    return true;
  };

  // A dropped weapon, for an outer-ring goon to pick up (combat collects these).
  // The prop that falls (a baton, or a pipe standing in for the knife) lies on the floor until a
  // goon picks it up (onTaken removes it).
  const floorProp = (kind) => (kind === 'baton' ? 'baton' : 'stick');
  const ownWeapon = e.weapon;
  function dropWeapon() {
    if (!e.weapon) return;
    let floor = null;
    try {
      if (ch.prop) ch.prop.visible = false;
      if (e.armProp) e.armProp.visible = false;
      floor = createProp(floorProp(e.weapon));
      floor.position.set(pos.x + 0.35, pos.y + 0.04, pos.z);
      floor.rotation.set(0, rng.next() * Math.PI * 2, Math.PI / 2);
      scene.add(floor);
    } catch { floor = null; }
    events?.emit('weaponDrop', { kind: e.weapon, pos: pos.clone(), from: e, onTaken: () => { if (floor) scene.remove(floor); } });
    e.weapon = null;
    if (def.shock) { e.charged = false; e.def = { ...def, shock: false }; }
  }
  e.dropWeapon = dropWeapon;
  // Picks a weapon up: a knife makes him a knife fighter (parries plain punches), a baton a
  // charged baton (shock) — his look gets the prop only on the role figures.
  e.arm = (kind) => {
    e.weapon = kind;
    // In his hand where everyone can see it (a picked-up weapon must read before it is used).
    // His own weapon back (the knife goon's modelled knife, a baton man's baton): that model again.
    if (kind === ownWeapon && ch.prop) ch.prop.visible = true;
    else try { if (ch.body && !e.armProp) e.armProp = attachProp(ch, createProp(floorProp(kind)), 'r'); else if (e.armProp) e.armProp.visible = true; } catch { /* a body with no hand bone: no prop */ }
    if (kind === 'knife') { e.def = { ...ENEMY.knife, scale: def.scale }; e.parryLeft = 1; e.kitOverride = roleKit('knife'); }
    if (kind === 'baton') { e.def = { ...ENEMY.baton, scale: def.scale }; e.charged = true; e.kitOverride = roleKit('baton'); }
  };

  // Paired moves (src/anim/paired.js): the attacker's control plays this goon's victim clip on
  // the attacker's clock. pairedStart plays it held (speed 0) at time t; pairedSeek follows the
  // attacker every frame; pairedRelease lets go (a throw): he flies, and the same clip carries on
  // as his fall, timed so it reaches the floor as he lands (the fall chain above).
  e.pairedStart = (clip, t) => {
    if (!has(clip)) return false;
    gplay(clip, { state: 'knockdown', timeScale: 0, startAt: t, fade: 0.2 });
    setFall(clip, clipInfo(clip));
    return true;
  };
  e.pairedSeek = (t) => { if (g.clip === fallInfo.clip) g.seek(t); };
  e.pairedRelease = (vx, vy, vz, opts) => {
    e.launch(vx, vy, vz, opts);
    const down = fallInfo.down;
    if (g.clip === fallInfo.clip && down !== null && down > g.time) {
      g.setSpeed(Math.min(2.4, Math.max(0.75, (down - g.time) / airTimeFor(vy))));
      fallInfo.flew = true;
    } else g.setSpeed(1);
  };

  // Sends the goon flying (knockdown launches, throws, juggles).
  e.launch = (vx, vy, vz, { thrown = false } = {}) => {
    if (!e.air) e.airFrom = pos.y;
    e.air = true;
    e.thrown = thrown;
    e.vel.set(vx, vy, vz);
    e.knock.set(0, 0, 0);
  };

  // Which side a blow came from, relative to his facing.
  const sideFrom = (from) => {
    const a = Math.atan2(from.x - pos.x, from.z - pos.z);
    const d = angleDiff(a, ch.yaw);
    if (Math.abs(d) < Math.PI * 0.55) return 'front';
    if (Math.abs(d) > Math.PI * 0.75) return 'back';
    return d > 0 ? 'left' : 'right';
  };
  let turnGoal = null, lying = 'back';
  // Called by the combat system with the result of resolveHit.
  // launch: vertical launch speed for knockdowns/KOs (0 = slide along the ground).
  // react: which reaction a plain hit plays ('head', 'gut' or 'spin', from the strike that
  // landed); without one, the library's small flinches. power picks light vs heavy.
  e.applyHit = (result, from, { power = 1, launch = 0, react = null, move = null } = {}) => {
    if (!e.alive) return;
    // A hit on ice shatters it: out cold, whatever the move was.
    if (e.state === 'frozen') { e.shattered = true; e.frozenT = 0; e.health = 0; result = { outcome: 'ko', damage: 0, stun: 0 }; }
    e.countered = false;
    const wasWindup = e.state === 'windup' || e.state === 'attack' || e.state === 'approach';
    // A medic kneeling over a body is interrupted by any blow.
    if (e.reviving) { e.reviving = null; e.reviveT = 0; }
    e.glyph = null;
    if (e.legsWalking) { e.legsWalking = false; ch.animator.overlays?.stop('lower'); }
    tmp.set(pos.x - from.x, 0, pos.z - from.z).normalize();
    const side = sideFrom(from);
    const usePack = packed('React_Light_Front');
    // Already lying on the floor: a blow keeps him there. Replaying a fall or a flinch would stand
    // him up for a frame first (every such clip starts on its feet).
    const lyingNow = e.down && !e.air && (e.state === 'down' || e.state === 'ko');
    if (lyingNow && (result.outcome === 'hit' || result.outcome === 'knockdown')) {
      setState('down');
      e.downT = Math.max(e.downT, 1.6);
      e.knock.copy(tmp).multiplyScalar(0.6 * power);
      return wasWindup;
    }
    // [fix1] A stun (cape, batarang) on a goon lying there leaves him lying there: it used to stand
    // his state up ('stunned', then 'engage') with `down` still set, and a goon flagged down never
    // gets an attack token, is never cape-stunned again and dies to any punch: a fighter frozen
    // out of the fight (tests/e2e/combatRoles.spec.js left him standing at the end).
    if (lyingNow && result.outcome === 'stun') { e.knock.set(0, 0, 0); return wasWindup; }
    // [fix1] Caught getting up by a blow that does not floor him again: he is on his feet now.
    if (e.down && !e.air && !lyingNow && (result.outcome === 'hit' || result.outcome === 'stun' || result.outcome === 'parried' || result.outcome === 'blocked')) e.down = false;
    if (result.disarm || (e.stunned && e.weapon === 'baton' && result.outcome === 'hit')) dropWeapon();
    switch (result.outcome) {
      case 'hit': {
        // A low sweep takes a grunt's feet out: a short spell on the floor (brutes and bosses
        // only flinch).
        if (react === 'sweep' && !e.air && type !== 'brute' && !def.boss && has('Sweep_Fall')) {
          setState('down');
          e.down = true;
          e.downT = 1.3;
          lying = 'back';
          e.knock.copy(tmp).multiplyScalar(1.5 * power);
          gplay('Sweep_Fall', { state: 'knockdown', timeScale: 1.25, fade: 0.1 });
          if (result.stun) { e.stunned = true; e.stunT = result.stun; }
          break;
        }
        // Already reeling from the last blow, early in that reaction (anim2: one beating, not a
        // strobe): a light blow lands as an additive flinch toward it on the reaction already
        // playing, which slows a little to take it; every third blow, a heavy one or a late one
        // plays a fresh reaction, dead-blended from the pose he is in.
        const reeling = e.state === 'hit' && g.state === 'react' && !e.air && !launch && power < 1.5 && (e.beatRun ?? 0) < 2
          && g.time < (clipInfo(g.clip)?.events?.recover ?? 1) * 0.55;
        setState('hit');
        e.knock.copy(tmp).multiplyScalar(2.2 * power);
        if (reeling && ch.animator.overlay?.('add', side === 'left' ? 'React_Flinch_L' : 'React_Flinch_R', { weight: 0.85, duration: 0.3 })) {
          e.beatRun = (e.beatRun ?? 0) + 1;
          g.setSpeed(Math.max(0.7, g.speed * 0.88));
          if (side === 'front') turnGoal = Math.atan2(from.x - pos.x, from.z - pos.z);
          if (result.stun) { e.stunned = true; e.stunT = result.stun; }
          break;
        }
        e.beatRun = 0;
        if (e.air) { e.vel.y = Math.max(e.vel.y, 4.5); e.vel.x = tmp.x * 2; e.vel.z = tmp.z * 2; }
        else if (launch) e.launch(tmp.x * 2.5 * power, launch, tmp.z * 2.5 * power);
        // Juggled: the air loop, not a standing flinch played in the air (finding 7).
        if (e.air) { if (packed('Air_Flail')) airLoop(); break; }
        if (usePack) {
          const heavy = power >= 1.5;
          const list = REACT_TABLE[heavy ? 'heavy' : 'light'][side];
          const clip = firstPacked(list.length > 1 ? shuffled(list) : list) ?? 'React_Light_Front';
          // A front hit turns him to face the blow over its first beat.
          turnGoal = side === 'front' ? Math.atan2(from.x - pos.x, from.z - pos.z) : null;
          gplay(clip, { state: 'react', timeScale: heavy ? 1.1 : 1.05, fade: 0.12 });
        } else {
          gplay(REACTIONS[react] && react !== 'sweep' ? REACTIONS[react] : (rng.chance(0.5) ? 'Hit_Chest' : 'Hit_Head'), { state: 'react', timeScale: react ? 1.15 : 1.4, fade: 0.1 });
        }
        if (result.stun) { e.stunned = true; e.stunT = result.stun; }
        break;
      }
      case 'knockdown': {
        setState('down');
        e.down = true;
        e.downT = 2.6;
        e.knock.copy(tmp).multiplyScalar(4.5 * power);
        if (launch || e.air) e.launch(tmp.x * 4.5 * power, Math.max(launch, e.air ? 5 : 0), tmp.z * 4.5 * power);
        const kd = REACT_TABLE.knockdown[side];
        e.airPose = false;
        if (usePack && e.air && packed('KD_Launch')) {
          // A short hop is blown back onto his back (KD_FlyBack); only a long flight has time for
          // KD_Launch's backflip.
          const air = airTimeFor(e.vel.y), clip = air < 0.65 && packed('KD_FlyBack') ? 'KD_FlyBack' : 'KD_Launch';
          lying = 'back';
          fall(clip, { airTime: air, fade: 0.18 });
        }
        else if (usePack && packed(kd)) {
          lying = REACT_TABLE.lies[kd] ?? 'back';
          fall(kd, { timeScale: 1.2, startAt: 0.1, fade: 0.15 });
          // The fall's own root motion carries him now; the knock is only the blow's shove.
          e.knock.multiplyScalar(0.3);
        } else { lying = 'back'; fallInfo.clip = null; gplay('Hit_Knockback', { state: 'knockdown', timeScale: 1.2, fade: 0.05 }); }
        break;
      }
      case 'ko': {
        setState('ko');
        e.alive = false;
        e.down = true;
        e.knock.copy(tmp).multiplyScalar(3.5 * power);
        if (launch || e.air) e.launch(tmp.x * 4 * power, Math.max(launch, e.air ? 4 : 0), tmp.z * 4 * power);
        if (!lyingNow) {
          // The fall by where the blow came from and how hard it was.
          const kd = power >= 2 || launch >= 5 ? 'KD_FlyBack' : REACT_TABLE.knockdown[side];
          e.airPose = false;
          if (usePack && packed(kd)) {
            lying = REACT_TABLE.lies[kd] ?? 'back';
            const info = clipInfo(kd);
            const down = info?.events?.down ?? 1.2;
            fall(kd, { timeScale: 1.15, startAt: Math.min(0.35, down * 0.25), fade: 0.15, airTime: e.air ? airTimeFor(e.vel.y) : 0 });
            if (!e.air) e.knock.multiplyScalar(0.3);
          } else {
            fallInfo.clip = null;
            const clip = rng.chance(0.5) ? 'Death01' : 'Hit_Knockback';
            play(clip, { once: true, fade: 0.1, ...KO_FALL[clip] });
          }
        }
        if (type === 'harley') events?.emit('harleyDown', { target: e });
        break;
      }
      case 'stun':
        setState('stunned');
        e.stunned = true;
        e.stunT = result.stun * (type === 'brute' || type === 'heavy' ? 1.8 : 1);
        if (def.frontBlock && packed('Shield_GuardBreak')) gplay('Shield_GuardBreak', { state: 'react', timeScale: 1, fade: 0.06 });
        else playStun(0.8);
        break;
      case 'parried':
        // A parry costs the knife goon nothing: an attack in progress carries on.
        e.knock.set(0, 0, 0);
        if (wasWindup) return false;
        // [fix1] ...nor his footing: the parry is layered on top and he carries on with what he was
        // doing, as armour's 'chip' does (no stun-lock by spamming punches). It used to put him in
        // 'hit' every time, so a knife goon under a stream of plain punches could never wind up
        // again: a stalemate that never ended the fight (combatRoles.spec: one knife goon parried
        // 197 punches in 90 s and never attacked). A parry that is already playing is left alone.
        if (e.state === 'hit' && g.state === 'react') return false;
        if (!ch.animator.overlay?.('add', packed('Block_Outward') ? 'Block_Outward' : side === 'left' ? 'React_Flinch_L' : 'React_Flinch_R', { weight: 0.8, duration: 0.35 })) {
          setState('hit');
          gplay(packed('Block_Outward') ? 'Block_Outward' : 'Sword_Block', { state: 'react', timeScale: 1.8, fade: 0.1 });
        }
        return false;
      case 'blocked':
        // The shield takes it: a jolt on the shield, nothing else (the attack carries on).
        e.knock.copy(tmp).multiplyScalar(0.8);
        if (wasWindup) return false;
        setState('hit');
        if (packed('Shield_BlockHit')) gplay('Shield_BlockHit', { state: 'react', timeScale: 1.3, fade: 0.1 });
        else ch.animator.overlay?.('add', 'Hit_Chest', { weight: 0.6, duration: 0.25 });
        break;
      case 'shocked':
        e.knock.set(0, 0, 0);
        return false;
      case 'chip':
        // Armour: a flinch layered on top, no change of state (no stun-lock by spamming punches).
        e.knock.copy(tmp).multiplyScalar(0.4);
        ch.animator.overlay?.('add', side === 'left' ? 'React_Flinch_L' : 'React_Flinch_R', { weight: 0.75, duration: 0.3 });
        return false;
      case 'immune':
        // Brutes shrug it off without breaking stride (no stun-lock by spamming punches).
        e.knock.copy(tmp).multiplyScalar(0.4);
        if (packed('React_Flinch_R')) ch.animator.overlay?.('add', side === 'left' ? 'React_Flinch_L' : 'React_Flinch_R', { weight: 0.7, duration: 0.3 });
        else if (!wasWindup && e.state !== 'recover' && e.state !== 'engage') play('Yes', { once: true, timeScale: 2, fade: 0.1 });
        return false;
      default:
        break;
    }
    return wasWindup;
  };

  // A medic gets a knocked-out goon back on his feet (combat's squad pass picks who and when).
  e.revive = () => {
    if (e.alive || e.state !== 'ko' || e.air || e.shattered) return false;
    e.alive = true;
    e.health = Math.max(1, Math.ceil(def.health / 2));
    e.down = true;
    setState('getup');
    getUp(lying);
    events?.emit('revived', { target: e });
    return true;
  };

  // A medic goes to a knocked-out body (combat's squad pass picks it).
  e.startRevive = (body) => {
    if (!e.alive || e.down || e.air || e.state !== 'engage') return false;
    e.reviving = body; e.reviveT = 0;
    setState('revive');
    return true;
  };
  // An unarmed goon goes for a weapon on the floor (combat's squad pass picks it).
  e.startPickup = (drop) => {
    if (!e.alive || e.down || e.air || e.state !== 'engage' || e.weapon) return false;
    e.pickup = drop;
    setState('pickup');
    return true;
  };

  // Fear (src/enemies/fear.js): the squad's choice for him, applied by combat a few times a second.
  e.setMood = (mood, fx) => {
    if (mood === e.mood) return;
    e.mood = mood; e.moodT = 0;
    e.windupDelay = fx?.windupDelay ?? 0;
    e.tellScale = fx?.tellScale ?? 1;
    e.missChance = fx?.missChance ?? 0;
    if (!e.alive || e.down || e.air) return;
    if (mood === 'dropWeapon') { dropWeapon(); if (packed('Fear_Hide')) gplay('Fear_Hide', { state: 'action', timeScale: 1.2, fade: 0.12 }); }
    else if (mood === 'surrender') { e.glyph = null; setState('surrender'); }
    else if (mood === 'flee') { e.glyph = null; setState('flee'); }
  };

  e.update = (dt, ctx) => {
    const { hero, others } = ctx;
    ctxNow = ctx;
    // The walk-in layer belongs to the wind-up only (a chain, a freeze or a stun ends it too).
    if (e.legsWalking && e.state !== 'windup') { e.legsWalking = false; ch.animator.overlays?.stop('lower'); }
    if (e.locoT > 0) e.locoT -= dt;
    ch.groundAt = enemyPlantsFeet(e) ? groundUnderFoot : null;
    // Frozen by a counter until its blow lands (with a failsafe).
    if (e.countered) {
      e.counterT += dt;
      if (e.counterT < 1.2) { ch.animator.update(dt * 0.2); return; }
      e.countered = false;
    }
    e.t += dt;
    e.moodT += dt;
    if (e.backoffT > 0) e.backoffT -= dt;
    if (e.evadeCd > 0) e.evadeCd -= dt;
    if (e.stunT > 0) { e.stunT -= dt; if (e.stunT <= 0) e.stunned = false; }
    if (type === 'harley') {
      if (e.harleyCd.slam > 0) e.harleyCd.slam -= dt;
      if (e.harleyCd.sweep > 0) e.harleyCd.sweep -= dt;
      if (e.harleyCd.throw > 0) e.harleyCd.throw -= dt;
      if (e.cartwheelCd > 0) e.cartwheelCd -= dt;
    }
    const dx = hero.pos.x - pos.x, dz = hero.pos.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const level = Math.abs(hero.pos.y - pos.y) < MELEE_DY;
    let speed = 0;
    let moveX = 0, moveZ = 0;

    if (e.state === 'grabbed' || e.state === 'chained') {
      // Failsafe: a chain that never finished (a teleport, a restart) lets go after 5 s.
      if (e.state === 'chained' && e.t > 5) e.chainRelease();
      ch.animator.update(dt);
      return;
    }
    if (e.state === 'frozen') {
      e.frozenT -= dt;
      if (e.frozenT <= 0) e.thaw();
      return;
    }
    // The graph's clock (events: contact, recover...) for this frame.
    const fallC0 = g.clip === fallInfo.clip ? g.time : 0;
    g.advance(dt);
    if (e.lostT > 0) { e.lostT -= dt; if (e.lostT <= 0) e.ringDist = Math.max(3.6, e.ringDist - 3); }
    switch (e.state) {
      case 'idle':
        play(e.idlePose, lo(0.3));
        break;
      case 'alert':
        faceHero(hero, 6, dt);
        if (e.t > 0.8) setState('engage');
        break;
      case 'engage':
      case 'recover': {
        if (type === 'harley' && e.state === 'engage' && shouldCartwheel(true, e.cartwheelCd, rng.next())) {
          e.cartwheelCd = rng.range(1.8, 2.8);
          setState('cartwheel');
          gplay('Roll', { state: 'dodge', timeScale: 1.3, fade: 0.08 });
          break;
        }
        if (e.state === 'recover' && e.t > 0.55) setState('engage');
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = rng.range(1.2, 3); }
        e.ringAngle += e.strafe * dt * 0.35;
        // Where to stand: the squad planner's slot when it has one (rings, flanks), else the
        // goon's own circle. Backing off (after a takedown, low morale) widens it.
        let tx, tz;
        if (e.slotX !== undefined && e.lostT <= 0) {
          tx = e.slotX; tz = e.slotZ;
          if (e.backoffT > 0) { const ox = tx - hero.pos.x, oz = tz - hero.pos.z, ol = Math.hypot(ox, oz) || 1; tx = hero.pos.x + (ox / ol) * Math.max(ol, 6); tz = hero.pos.z + (oz / ol) * Math.max(ol, 6); }
          // Strafe around the slot so a standing squad still moves.
          tx += Math.cos(e.ringAngle) * 0.6; tz += Math.sin(e.ringAngle) * 0.6;
        } else {
          const rd = e.ringDist + (e.backoffT > 0 ? 2.5 : 0);
          tx = hero.pos.x + Math.sin(e.ringAngle) * rd; tz = hero.pos.z + Math.cos(e.ringAngle) * rd;
        }
        // A sniper holds his nest: he never walks to a slot.
        if (def.nest) { tx = pos.x; tz = pos.z; }
        const gx = tx - pos.x, gz = tz - pos.z;
        const gd = Math.hypot(gx, gz);
        if (gd > 0.4) {
          speed = gd > 4 ? def.speed : 1.4;
          moveX = gx / gd; moveZ = gz / gd;
        }
        if ((dist < 8 || RANGED) && e.lostT <= 0) faceHero(hero, 8, dt);
        else if (speed) turnTo(Math.atan2(moveX, moveZ), 8, dt);
        // Squared up to Batman, a goon circles in a fight stance: a sideways step strafes, a
        // stand is its guard, and now and then, out of reach, it taunts.
        const squared = (dist < 8 || RANGED) && e.lostT <= 0;
        const fwdX = Math.sin(ch.yaw), fwdZ = Math.cos(ch.yaw);
        const lateral = moveX * -fwdZ + moveZ * fwdX; // + = a step to its right (facing +z, right is -x)
        const melee = !RANGED && type !== 'harley';
        if (e.tauntCd > 0) e.tauntCd -= dt;
        if (e.tauntT > 0) { e.tauntT -= dt; if (e.state !== 'engage') e.tauntT = 0; }
        else if (melee && e.state === 'engage' && !speed && dist > 4.2 && e.tauntCd <= 0 && has(TAUNTS[0])) {
          e.tauntCd = rng.range(7, 14);
          if (rng.chance(0.35)) { e.tauntT = 1.6; play(rng.pick(TAUNTS), { once: true, timeScale: 1.35, fade: 0.2 }); }
        }
        if (e.tauntT > 0) speed = 0;
        else if (speed > 2) loco(packed(kit.run) ? kit.run : packed(kit.walk) ? kit.walk : 'Jog_Fwd_Loop', lo(0.2));
        else if (speed > 0 && squared && Math.abs(lateral) > 0.55 && packed(kit.strafeL)) loco(lateral > 0 ? kit.strafeR : kit.strafeL, lo(0.2, Math.max(0.5, speed / 1.1)));
        else if (speed > 0 && melee && squared && Math.abs(lateral) > 0.55 && has('Goon_Strafe_L')) loco(lateral > 0 ? 'Goon_Strafe_R' : 'Goon_Strafe_L', lo(0.2, Math.max(0.5, speed / 1.65)));
        else if (speed > 0) loco(packed(kit.walk) ? kit.walk : (type === 'brute' || type === 'heavy') ? 'Zombie_Walk_Fwd_Loop' : has(WALK) ? WALK : 'Walk_Loop', lo(0.2));
        else if (e.mood === 'hesitant' && packed('Thug_Nervous')) loco('Thug_Nervous', lo(0.25));
        else if (packed(kit.guard)) loco(kit.guard, lo(0.25));
        else if (RANGED && def.cover && packed(kit.cover)) loco(kit.cover, lo(0.3));
        else if (RANGED && def.nest && packed(kit.idle)) loco(kit.idle, lo(0.3));
        else if (RANGED && packed(kit.aim)) loco(kit.aim, lo(0.25));
        else if (type === 'knife') loco(has('Goon_Knife_Idle') ? 'Goon_Knife_Idle' : 'Sword_Idle', lo(0.25));
        else if (melee && has(e.guard)) loco(e.guard, lo(0.25));
        else loco(type === 'brute' ? 'Idle_FoldArms_Loop' : has(IDLE) ? IDLE : 'Idle_Loop', lo(0.25));
        break;
      }
      case 'approach': {
        // Holding a token, walking into reach (no tell yet). Gives up after a while.
        faceHero(hero, 8, dt);
        if (dist > ATTACK_RANGE * scale) {
          speed = Math.min(def.speed + 0.6, 4.2);
          moveX = dx / (dist || 1); moveZ = dz / (dist || 1);
          loco(packed(kit.run) ? kit.run : 'Jog_Fwd_Loop', lo(0.15, speed / 3.6));
        } else if (e.windupDelay > 0 && e.t < e.windupDelay) loco(packed(kit.guard) ? kit.guard : has(e.guard) ? e.guard : 'Idle_Loop', lo(0.2));
        else beginWindup(e.windupBase ?? 0.6, hero);
        if (e.state === 'approach' && (e.t > 4 || !level)) { setState('engage'); ctx.onAttackEnd(e); }
        break;
      }
      case 'windup': {
        faceHero(hero, 10, dt);
        // Out of reach: he walks in while winding up — the legs walk (a lower-body layer at the
        // walk's own pace) under the strike's wind-up, so nothing slides (finding 8).
        const far = !RANGED && type !== 'harley' && e.attackKind !== 'charge' && dist > ATTACK_RANGE * scale && e.t < e.windupDur;
        if (far) {
          speed = 2.2; moveX = dx / (dist || 1); moveZ = dz / (dist || 1);
          if (!e.legsWalking) { e.legsWalking = true; ch.animator.overlay?.('lower', has('Walk_Loop') ? 'Walk_Loop' : WALK, { loop: true, weight: 1, timeScale: 2.2 / 1.7, fadeIn: 0.15 }); }
        } else if (e.legsWalking) { e.legsWalking = false; ch.animator.overlays?.stop('lower'); }
        if (e.t >= e.windupDur) {
          if (e.legsWalking) { e.legsWalking = false; ch.animator.overlays?.stop('lower'); }
          setState('attack');
          e.glyph = null;
          contactDue = false;
          if (RANGED) break;
          e.lungeFrom.copy(pos);
          const reach = (e.attackKind === 'charge' || e.attackKind === 'harleyThrow') ? 0 : Math.max(0, dist - 1.1);
          e.lungeTo.set(pos.x + (dx / (dist || 1)) * reach, pos.y, pos.z + (dz / (dist || 1)) * reach);
          e.chargeDir.set(dx / (dist || 1), 0, dz / (dist || 1));
          ch.animator.mixer && (ch.animator.mixer.timeScale = 1);
          // (A charge has no contact frame to protect: the roar blends into the run at its own pace.)
          if (e.attackKind === 'charge') gplay('Sprint_Loop', { state: 'strike', once: false, timeScale: 12 / (11.5 * scale), fade: 0.12, maxBlend: 0.38 });
          // Harley's blow: the wind-up clip carries on at speed from where it is (anim2: it was
          // restarted from its first frame, a snap back to the start of the swing).
          else if (e.attackKind?.startsWith('harley')) g.setSpeed(1.7);
          else strikeFire();
        }
        break;
      }
      case 'attack': {
        if (RANGED) {
          faceHero(hero, 10, dt);
          if (!e.hitDone) {
            e.hitDone = true;
            // One gate for the tracer and the damage: a shot that "hits" always lands. A rifle
            // marked warnShot (every rifle in a predator room, when the alarm goes up) misses on
            // purpose with the first shot that would have hit: a moment to react.
            const onTarget = e.seesHero !== false && dist < (type === 'sniper' ? def.range : 32);
            const lands = onTarget && !e.warnShot && !(e.missChance > 0 && rng.chance(e.missChance));
            if (onTarget) e.warnShot = false;
            const fire = packed(kit.fire) ? kit.fire : has('Rifle_Fire') && hasPackClip('Rifle_Fire') ? 'Rifle_Fire' : null;
            if (fire) gplay(fire, { state: 'strike', timeScale: 1, fade: 0.05 });
            ctx.onRifleFire?.(e, lands);
            if (lands) ctx.onAttackLand(e, e.attackKind);
          }
          if (e.t > 0.45) { setState('recover'); ctx.onAttackEnd(e); }
          break;
        }
        if (e.attackKind === 'charge') {
          speed = 12;
          moveX = e.chargeDir.x; moveZ = e.chargeDir.z;
          if (!e.hitDone && dist < 1.5 * scale && level) { e.hitDone = true; ctx.onAttackLand(e, 'charge'); }
          if (e.t > 0.75) { setState('recover'); ctx.onAttackEnd(e); }
        } else if (e.attackKind === 'harleyThrow') {
          // A thrown pie/gag bomb: stands her ground and tosses it, no lunge.
          faceHero(hero, 10, dt);
          if (!e.hitDone && e.t > 0.22) {
            e.hitDone = true;
            if (dist < 16 && level) ctx.onAttackLand(e, 'harleyThrow');
          }
          if (e.t > 0.5) { setState('recover'); ctx.onAttackEnd(e); }
        } else if (e.attackKind?.startsWith('harley')) {
          const k = Math.min(1, e.t / 0.16);
          pos.x = e.lungeFrom.x + (e.lungeTo.x - e.lungeFrom.x) * k;
          pos.z = e.lungeFrom.z + (e.lungeTo.z - e.lungeFrom.z) * k;
          if (!e.hitDone && e.t >= STRIKE_LAND) {
            e.hitDone = true;
            if (dist < 2 * scale && level) ctx.onAttackLand(e, e.attackKind);
          }
          if (e.t > 0.5) { setState('recover'); ctx.onAttackEnd(e); }
        } else {
          // The lunge is the strike's own root motion, warped onto the hero (finding 8). The blow
          // itself resolves in onContact on the clip's contact frame.
          if (warp && g.clip === strikeName && !e.hitDone) {
            heroView.x = hero.pos.x; heroView.z = hero.pos.z;
            const c1 = g.time, c0 = Math.max(warp.warpStart, c1 - dt * g.speed);
            warp.step(c0, c1, pos.x, pos.z, ch.yaw, heroView, warpOut);
            pos.x += warpOut.dx; pos.z += warpOut.dz;
            ch.face(warpOut.yaw);
          } else if (!warp && !e.hitDone) {
            // An old clip with no data: the short slide as before, capped by the strike's reach.
            const k = Math.min(1, e.t / 0.2);
            pos.x = e.lungeFrom.x + (e.lungeTo.x - e.lungeFrom.x) * k;
            pos.z = e.lungeFrom.z + (e.lungeTo.z - e.lungeFrom.z) * k;
          }
          // Contact this frame (or a missing contact event: land where the old timer did).
          if (!e.hitDone && (contactDue || e.t >= STRIKE_LAND + 0.15)) resolveContact();
          if (e.hitDone && (g.passed('recover') || e.t > 0.9)) { setState('recover'); ctx.onAttackEnd(e); }
        }
        break;
      }
      case 'riposte':
        // Turned the counter aside: straight back in with a short tell.
        faceHero(hero, 12, dt);
        if (e.t > (e.ripostePending ?? 0.18)) { e.ripostePending = 0; beginWindup(0.38, hero); }
        break;
      case 'evade':
        if (e.t > 0.5 || g.passed('recover')) setState('engage');
        break;
      case 'hit':
        if (turnGoal !== null) { turnTo(turnGoal, 12, dt); if (Math.abs(angleDiff(turnGoal, ch.yaw)) < 0.02) turnGoal = null; }
        // Held to the reaction's recover event (finding 7: it used to leave at 0.5 s while the
        // clip ran for 1.2-1.6 s); old clips without one leave at 0.5 s as before.
        if ((g.state === 'react' && g.passed('recover')) || (g.state !== 'react' && e.t > 0.5) || e.t > 1.6) { turnGoal = null; setState(e.stunned ? 'stunned' : fightOn()); if (e.stunned) playStun(); }
        break;
      case 'stunned':
        if (!e.stunned) setState(fightOn()); // [fix1]
        break;
      case 'down':
        e.downT -= dt;
        if (e.downT <= 0) { setState('getup'); getUp(lying); }
        break;
      case 'getup':
        // Unaware: stand, then wake. A predator room's wake() only sends it looking, so it must not
        // be left in getup (unsteerable, and waking again every frame).
        if ((g.state === 'getup' && g.passed('recover')) || (g.state !== 'getup' && e.t > (has(GETUP.clip) ? GETUP.length : 1.0)) || e.t > 3.5) {
          e.down = false; lying = 'back';
          if (e.aware) setState(fightOn()); else { setState('idle'); e.wake(); } // [fix1] fightOn
        }
        break;
      case 'tied':
        e.tiedT -= dt;
        if (e.tiedT <= 0) { e.tiedWith = null; setState('getup'); getUp(); }
        break;
      case 'cartwheel': {
        // Harley Quinn only: a quick hop-roll away from Batman. Flavor, not a hard i-frame.
        const cx = pos.x - hero.pos.x, cz = pos.z - hero.pos.z;
        const cd = Math.hypot(cx, cz) || 1;
        speed = 5;
        moveX = cx / cd; moveZ = cz / cd;
        ch.face(Math.atan2(moveX, moveZ));
        if (e.t > 0.45) setState('engage');
        break;
      }
      case 'revive': {
        // A medic over a knocked-out goon: kneel, work, and get him up (combat picked the body).
        const b = e.reviving;
        if (!b || b.alive) { e.reviving = null; setState('engage'); break; }
        const bx = b.pos.x - pos.x, bz = b.pos.z - pos.z, bd = Math.hypot(bx, bz);
        if (bd > 0.9) {
          speed = def.speed; moveX = bx / bd; moveZ = bz / bd;
          turnTo(Math.atan2(bx, bz), 10, dt);
          loco('Jog_Fwd_Loop', lo(0.15));
          e.reviveT = 0;
        } else {
          if (e.reviveT === 0) gplay(packed('Medic_Kneel') ? 'Medic_Kneel' : 'Crouch_Idle_Loop', { state: 'action', once: packed('Medic_Kneel'), timeScale: 1.3, fade: 0.2 });
          e.reviveT += dt;
          if (e.reviveT > 0.9 && packed('Medic_Revive') && g.clip !== 'Medic_Revive') gplay('Medic_Revive', { state: 'action', once: false, timeScale: 1.2, fade: 0.2 });
          if (e.reviveT > 3.2) { b.revive?.(); e.reviving = null; e.reviveT = 0; setState('engage'); }
        }
        if (e.t > 8) { e.reviving = null; setState('engage'); }
        break;
      }
      case 'pickup': {
        const d0 = e.pickup;
        if (!d0 || d0.taken) { e.pickup = null; setState('engage'); break; }
        const px = d0.x - pos.x, pz = d0.z - pos.z, pd = Math.hypot(px, pz);
        if (pd > 0.6) {
          speed = def.speed; moveX = px / pd; moveZ = pz / pd;
          turnTo(Math.atan2(px, pz), 10, dt);
          loco('Jog_Fwd_Loop', lo(0.15));
        } else {
          if (e.reviveT === 0) gplay(packed('Fear_Hide') ? 'Fear_Hide' : 'Crouch_Idle_Loop', { state: 'action', timeScale: 1.6, fade: 0.15 });
          e.reviveT += dt;
          if (e.reviveT > 0.5) { d0.taken = true; e.arm(d0.kind); d0.onTaken?.(e); e.pickup = null; e.reviveT = 0; setState('engage'); events?.emit('weaponPickup', { target: e, kind: d0.kind }); }
        }
        if (e.t > 6) { e.pickup = null; setState('engage'); }
        break;
      }
      case 'surrender':
        // Hands up, on his knees: zip-tie him (walk up, or punch).
        faceHero(hero, 4, dt);
        if (packed('Fear_Kneel')) loco('Fear_Kneel', lo(0.3));
        else loco('Crouch_Idle_Loop', lo(0.3));
        break;
      case 'flee': {
        // Runs for it; once far enough away he is out of the fight.
        const ax = pos.x - hero.pos.x, az = pos.z - hero.pos.z, al = Math.hypot(ax, az) || 1;
        speed = 5.2; moveX = ax / al; moveZ = az / al;
        turnTo(Math.atan2(moveX, moveZ), 8, dt);
        loco(packed('Fear_Flee') ? 'Fear_Flee' : 'Jog_Fwd_Loop', lo(0.2, packed('Fear_Flee') ? 5.2 / 1.57 : 1.3));
        if (e.t > 3.5 || al > 30) { e.alive = false; e.fled = true; setState('fled'); events?.emit('fled', { target: e }); }
        break;
      }
      case 'fled': {
        // Out of the fight (not alive any more as far as the encounter goes): keeps running off.
        const ax = pos.x - hero.pos.x, az = pos.z - hero.pos.z, al = Math.hypot(ax, az) || 1;
        speed = 5.2; moveX = ax / al; moveZ = az / al;
        if (e.t > 3) ch.root.visible = false;
        break;
      }
      case 'patrol':
      case 'search':
      case 'hunt': {
        e.nav.px = pos.x; e.nav.pz = pos.z;
        const gx = e.nav.x - pos.x, gz = e.nav.z - pos.z, gd = Math.hypot(gx, gz);
        if (gd < 0.35) e.nav.arrived = true;
        if (!e.nav.arrived) {
          speed = e.nav.speed;
          moveX = gx / gd; moveZ = gz / gd;
          turnTo(Math.atan2(moveX, moveZ), 8, dt);
        } else if (e.nav.face !== null) turnTo(e.nav.face, 4, dt);
        if (speed > 2.6) play('Jog_Fwd_Loop', lo(0.2));
        else if (speed > 0) play(WALK, lo(0.2, Math.max(0.8, speed / 1.7)));
        else play(IDLE, lo(0.25));
        break;
      }
      case 'suspicious':
      case 'look':
        turnTo(Math.atan2(e.nav.lookX - pos.x, e.nav.lookZ - pos.z), e.state === 'look' ? 2.5 : 5, dt);
        play(e.state === 'look' ? LOOK : IDLE, lo(0.25));
        break;
      case 'ko':
        break;
      default:
        break;
    }

    // Falls and get-ups: timing against the flight, the air loop, the floor's root motion.
    if (e.state === 'down' || e.state === 'ko' || e.state === 'getup') fallStep(fallC0);
    if (e.air) {
      // Ballistic flight: gravity, walls, landing. Thrown goons bowl over whoever they hit.
      e.vel.y -= 24 * dt;
      const prevY = pos.y;
      pos.addScaledVector(e.vel, dt);
      const r = collision.resolveCylinder(pos, e.radius, 1.8 * scale, { stepUp: 0.45, prevY });
      if (r.grounded && e.vel.y > 0) pos.y = Math.max(pos.y, r.groundY);
      if (r.hitWall) { e.vel.x *= -0.25; e.vel.z *= -0.25; }
      if (e.thrown) ctx.onThrownFly?.(e);
      const ground = collision.groundBelow(pos.x, pos.y + 0.4, pos.z, 0.3);
      if (e.vel.y <= 0 && ground > -Infinity && pos.y <= ground) {
        pos.y = ground;
        const drop = e.airFrom - ground;
        e.air = false;
        e.thrown = false;
        e.vel.set(0, 0, 0);
        ctx.onLanded?.(e, drop);
        // Landing out of the air pose: straight into the floor part of a fall.
        if (e.airPose) {
          e.airPose = false;
          // Into the floor half of a plain knock-over (the flying-back clip slams the legs).
          const kd = packed('KD_Over') ? 'KD_Over' : null;
          if (kd) { lying = 'back'; fall(kd, { timeScale: 1, startAt: Math.max(0, (clipInfo(kd)?.events?.down ?? 0.67) - 0.25), fade: 0.22 }); }
        }
        if (e.alive && e.state !== 'ko' && e.state !== 'tied') { e.down = true; e.downT = Math.max(e.downT, 1.6); setState('down'); }
      } else if (ground === -Infinity && pos.y < -5) {
        pos.y = -5; e.air = false; e.alive = false; e.state = 'ko';
      }
      ch.animator.update(dt);
      return;
    }

    // Knockback slide.
    if (e.knock.lengthSq() > 0.0001) {
      pos.addScaledVector(e.knock, dt);
      e.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
    }
    // Room goons never walk off a catwalk or the balcony: they stop at the edge instead.
    if (speed && e.room && !e.air) {
      const ahead = collision.groundBelow(pos.x + moveX * 0.6, pos.y + 0.5, pos.z + moveZ * 0.6, 0.15);
      if (ahead < pos.y - 0.6) { speed = 0; e.nav.arrived = true; }
    }
    if (speed) { pos.x += moveX * speed * dt; pos.z += moveZ * speed * dt; }
    // Keep apart from other goons and from the hero.
    if (e.alive && !e.down) {
      for (const o of others) {
        if (o === e || !o.alive || o.down) continue;
        const ox = pos.x - o.pos.x, oz = pos.z - o.pos.z;
        const od = Math.hypot(ox, oz);
        const min = e.radius + o.radius + 0.5;
        if (od < min && od > 1e-4) { pos.x += (ox / od) * (min - od) * 0.5; pos.z += (oz / od) * (min - od) * 0.5; }
      }
      if (dist < 0.9 && e.state !== 'attack') { pos.x -= (dx / (dist || 1)) * (0.9 - dist); pos.z -= (dz / (dist || 1)) * (0.9 - dist); }
    }
    const r = collision.resolveCylinder(pos, e.radius, 1.8 * scale);
    // Walking into a wall or a crate: count it as arrived after a second, so the runtime moves on.
    if (WALKING.has(e.state)) {
      const moved = Math.hypot(pos.x - e.nav.px, pos.z - e.nav.pz);
      e.nav.stuckT = !e.nav.arrived && e.nav.speed > 0 && moved < e.nav.speed * dt * 0.25 ? e.nav.stuckT + dt : 0;
      if (e.nav.stuckT > 1) { e.nav.arrived = true; e.nav.stuckT = 0; }
    }
    // Walked or slid off an edge: fall instead of teleporting down.
    if (r.groundY < pos.y - 0.6) e.launch(e.knock.x * 0.5, 0, e.knock.z * 0.5);
    else if (r.groundY > -Infinity) pos.y = r.groundY;
    ch.animator.update(dt);
  };

  e.remove = () => { scene.remove(ch.root); };
  return e;
}

void MOCAP_DATA;
