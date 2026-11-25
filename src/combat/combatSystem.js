// Freeflow combat: turns each hero's input into moves against enemies and resolves enemy attacks
// on whichever hero they go after.
//
// Players (Long Night 2, workstream B; contract: docs/design/long-night-2.md 4.1). Combat has two
// halves:
// - shared: the enemy list, the attack director (tokens per target player), enemy AI and which
//   hero each enemy goes after (src/players/targeting.js pickTarget), difficulty;
// - per hero, a *fighter* (makeFighter below): its combo, input buffer, punch/kick chain counters,
//   focus target, chain takedown in progress, current control and camera mode, and every move.
//   A hit, a knockback, a hit-stop or an action shot belongs to the fighter that threw it.
// createCombat({ hero }) is still the one-hero combat every caller and test built before: it makes
// one player around that hero. createCombat({ players }) takes several; addPlayer adds one later.
// The combat object itself answers for player 0's fighter (combo, chains, gadgetApi, ...), so old
// call sites keep working; fighterFor(heroOrPlayer) reaches the others.
import * as THREE from 'three';
import { resolveHit, DIFFICULTY, inShockwave, shouldDiveBomb } from './rules.js';
import { selectTarget, selectAttackTarget } from './targeting.js';
import { createCombo } from './combo.js';
import { createDirector } from './director.js';
import { createInputBuffer } from './inputBuffer.js';
import { MOCAP_SPEED, MOCAP_START, MOCAP_BEATS } from '../config/mocap.js';
import { rootMotionAt } from './reach.js';
import { graphFor } from '../anim/graph.js';
import { clipInfo, deriveStrikeEvents } from '../anim/clips.js';
import { createStrikeWarp, turnToward, MAX_WARP } from '../anim/warp.js';
import { pairRel, pairYawFor, pairX, pairZ, moveRootUnderBlend } from '../anim/paired.js';
import { loadCombatPack, primeStep } from '../anim/packs.js';
import { movesFor, firstHad } from './kitMoves.js';
import { CHAIN_RULES, chainForAction, chainAvailability, selectChainTargets, chainCost, tiedGroup, chainOutcome } from './chains.js';
import { SWARM, swarmTargets, swarmAvailability, swarmTimeline, createSwarmControl } from './batSwarm.js';
import { buildChainTimeline } from './chainTimeline.js';
import { createStrikeChooser } from './strikeChoice.js';
import { classifyDir, selectMove } from './moveSelect.js';
import { createChainControl, CHAIN_SHOTS } from './chainControl.js';
import { BASE_EFFECTS, hurtDamage } from '../progress/upgrades.js';
import { pickTarget } from '../players/targeting.js';
import { withPlayer } from '../core/events.js';
import { createSquadPlanner, shouldSteal } from '../enemies/squad.js';
import { createFear, createReputation } from '../enemies/fear.js';
import { regenStep } from './rules.js';
import { can } from '../abilities/gate.js'; // [onboard] ability gates at each trigger

export { withPlayer };

const PUNCHES = ['Punch_Jab', 'Punch_Cross', 'Punch_Jab'];
// The hero's combat-pack clips, primed (mixer actions built) as soon as the pack lands.
const COMBAT2_HERO_CLIPS = ['Cape_Swirl', 'Throw_Shoulder', 'Hammer_Down', 'Ground_Stomp', 'Dodge_Roll', 'Dodge_Roll_Run', 'Dodge_Backflip', 'Block_React',
  'Travel_FlyKick', 'Travel_ButterflyKick', 'Travel_SlideTackle', 'Finisher_ElbowUp', 'Finisher_ElbowUpper', 'Finisher_Quad', 'Finisher_Four', 'Kick_SideRound',
  'React_Light_Front', 'React_Light_Front2', 'React_Light_Back', 'React_Light_Left', 'React_Light_Right', 'React_Heavy_Front', 'React_Heavy_Back', 'React_Heavy_Right', 'React_Heavy_Right_M'];
// What an impact or a swing sounds and looks like (audio's `strike` field, src/audio/impacts.js).
export function strikeKindOf(clip = '', move = '') {
  if (move === 'counter') return 'counter';
  if (move === 'special' || move === 'beatdown' && /Finisher/.test(clip)) return 'takedown';
  if (move === 'heavy' || move === 'spinKick' || /Hammer|Finisher|Smash|Elbow_Strike/.test(clip)) return 'heavy';
  if (/Kick|Knee|Stomp|Sweep|Travel/.test(clip)) return 'kick';
  if (/Hook|Backfist/.test(clip)) return 'hook';
  if (/Cross|Uppercut|Elbow/.test(clip)) return 'cross';
  if (/Jab/.test(clip)) return 'jab';
  return move === 'kick' ? 'kick' : 'jab';
}
// Which way a blow comes from relative to whom it hits ('front' | 'back' | 'left' | 'right').
export function hitSide(victimYaw, fromX, fromZ, atX, atZ) {
  const a = Math.atan2(fromX - atX, fromZ - atZ);
  const d = Math.atan2(Math.sin(a - victimYaw), Math.cos(a - victimYaw));
  if (Math.abs(d) < Math.PI / 4) return 'front';
  if (Math.abs(d) > (3 * Math.PI) / 4) return 'back';
  return d > 0 ? 'left' : 'right';
}
// What a hit lands on, for the audio layer and the impact VFX.
const materialOf = (target, outcome) => (outcome === 'blocked' && target.def?.frontBlock ? 'shield' : target.def?.armored || target.def?.chip ? 'armour' : outcome === 'parried' ? 'blade' : 'flesh');
// Which punch or kick plays next (variety, finishers): src/combat/strikeChoice.js. The
// code-authored strikes themselves live in src/actors/strikes.js.
// Playback speed for the code-authored strikes (authored at real time; freeflow wants them snappy).
// Where each strike lands, for the goon's reaction (src/actors/reactions.js).
const REACT = {
  Punch_Jab: 'head', Punch_Cross: 'head', Elbow_Strike: 'head', Punch_Uppercut: 'head',
  Punch_Hook_L: 'spin', Melee_Hook: 'spin', Kick_Round: 'spin', Kick_Side: 'gut', Kick_Low: 'sweep',
  Kick_Front: 'gut', Knee_Strike: 'gut',
  Punch_BodyJab: 'gut', Punch_BodyHook: 'gut', Punch_ShortHook: 'spin', Punch_LeadUppercut: 'head', Elbow_Head: 'head',
  Kick_Push: 'gut', Knee_Muay: 'gut',
};
const STRIKE_SPEED = { Punch_Uppercut: 1.45, Punch_Hook_L: 1.4, Elbow_Strike: 1.45, Punch_Backfist: 1.35, Punch_Hammer: 1.3, Kick_Side: 1.35, Kick_Axe: 1.3, Kick_Low: 1.4 };
// Regular kicks alternate the front push kick and the roundhouse (the front kick alone at
// point-blank range, where the roundhouse's step would only slide); the chain finisher is
// the lunge spin kick. All are mocap clips from public/assets/anims_mocap.glb.

const KICK_SPEED = MOCAP_SPEED;
// A mocap clip's own playback speed wins over the code-posed clip's of the same name.
const strikeSpeed = (clip, fallback) => MOCAP_SPEED[clip] ?? STRIKE_SPEED[clip] ?? fallback;
// Hit-stop per kind of blow (seconds of frozen time for both fighters).
const STOP = { punch: 0.05, kick: 0.065, heavy: 0.11, finisher: 0.13, counter: 0.1 };
const WORDS = {
  counter: ['KRAK!', 'WHAM!'], kick: ['THWACK!', 'WHUMP!'], ko: ['POW!', 'BLAM!', 'KAPOW!'], special: ['THWAMP!'],
  dive: ['KRUNCH!'], uppercut: ['UPPERCUT!', 'KA-POW!'], heavy: ['KA-BOOM!', 'WHAMMO!'], spin: ['SWOOSH-THWACK!', 'KRAKOOM!'], slam: ['BADOOM!'], throw: ['WHEEE-CRASH!', 'YOINK!'],
};
// Strikes in a row on the same chain before the finisher lands.
const CHAIN = 4;
// Clip beats the chain timelines don't carry themselves: the mocap kicks (Kick_Front, Kick_Flying).
const BEATS = MOCAP_BEATS;
const ACTIONS = ['block', 'punch', 'kick', 'throw', 'cape', 'batarang', 'dodge', 'special', 'chain1', 'chain2', 'chain3', 'chain4'];
// States in which an enemy keeps its attack token (walking in, winding up, striking, coming back
// at a counter).
const TOKEN_STATES = new Set(['approach', 'windup', 'attack', 'riposte']);
// The attack's land time after the wind-up (enemy.js STRIKE_LAND): the tell is wind-up + this.
const STRIKE_LAND_TIME = 0.17;
// Attack tokens an enemy's attack costs (director v2): heavies and unblockables cost two.
const tokenCost = (e) => e.kit?.cost ?? (e.def.armored ? 2 : 1);
// Traversal controls an enemy never starts an attack on (the hero is out of its reach).
const UNREACHABLE = ['ladder', 'ledge', 'zip', 'wallrun'];
// A camera for a fighter with no view of its own: it reads the shared camera's directions (so its
// stick still steers relative to what the screen shows) but never shakes or cuts it.
const quietView = (follow) => ({
  forward: (o) => follow.forward(o), right: (o) => follow.right(o), lookDir: (o) => follow.lookDir?.(o),
  addShake() {}, hitKick() {}, actionShot() {}, dropShot() {},
});

// reputation: the city-wide number (src/enemies/fear.js createReputation); other workstreams read
// combat.reputation and (wave 3) save reputation.toJSON().
export function createCombat({ hero = null, players = null, follow, time, events, rng, getDifficulty, reach = {}, effects = BASE_EFFECTS, getChainDiscount = () => effects.chainDiscount, useGadget = null, stealthStart = null, stealthHold = null, reputation = createReputation() }) {
  let difficulty = getDifficulty();
  const director = createDirector({ ...DIFFICULTY[difficulty], rng });
  let enemies = [];
  const pick = (a) => a[Math.floor(rng.next() * a.length)];
  const word = (kind) => pick(WORDS[kind] ?? WORDS.ko);
  const alive = () => enemies.filter((e) => e.alive);
  const engaged = () => enemies.filter((e) => e.alive && e.aware);
  const fighters = [];

  // ---------------- the per-hero half ----------------
  function makeFighter(player) {
    const hero = player.hero;
    // A fighter's own camera: its player's view, else (a second hero sharing the screen for now)
    // a quiet one that never moves player 0's camera.
    const follow0 = follow;
    const cam = player.view?.follow ?? (player.slot > 0 ? quietView(follow0) : follow0);
    // Gadgets and predator stealth are player 0's systems today; other heroes throw plain
    // batarangs and never start a stealth takedown.
    const gadgetHook = player.useGadget ?? (player.slot > 0 ? null : useGadget);
    const stealthStartHook = player.stealthStart ?? (player.slot > 0 ? null : stealthStart);
    const stealthHoldHook = player.stealthHold ?? (player.slot > 0 ? null : stealthHold);
    // Combos are easy to keep (owner, 2026-10-08): 3 s between hits, and one hit taken is free
    // (WayneTech Steady Flow adds another).
    const combo = createCombo({ timeout: 3.0, ready: effects.specialAt, shield: effects.comboShield + 1 });
    const inputBuffer = createInputBuffer(0.45);
    let punchChain = 0, kickChain = 0, chainT = 0;
    // The goon being fought: attacks stay on him unless the stick points at another goon.
    let focus = null;
    // Which regular kick and which beatdown strike comes next (variety only; not chain state).
    let beatIdx = 0, counterIdx = 0, specialIdx = 0;
    // This hero's strike tables (its kit's, Batman's by default: src/combat/kitMoves.js).
    const moves = movesFor(player.kit);
    const choose = createStrikeChooser({ has: (c) => !!reach[c], random: () => rng.next(), tables: moves });
    // Seconds since this hero last took a hit (regen, difficulty rules).
    let sinceHurt = 99;
    const tmp = new THREE.Vector3(), dir = new THREE.Vector3(), chest = new THREE.Vector3();
    const push = new THREE.Vector3();
    // What the chain icons show; refreshed every 0.1 s of game time or when the combo changes.
    let chainAvail = chainAvailability({ combo: 0, origin: hero.pos, enemies: [] });
    const chainsLocked = chainAvail; // [onboard] what the HUD shows before the story gives chains: nothing
    // The Bat Swarm icon (chain 4, WayneTech): refreshed with chainAvail.
    let swarmAvail = { show: false, affordable: false, cost: SWARM.cost };
    let availT = 0, availCombo = -1;
    // The chain in progress: its control, its targets, and whether it finished on its own.
    let chainRun = null;
    // Hit-stop freezes these two (one array reused: src/core/time.js copies what it needs).
    const pair = [hero, null];
    const stopOn = (sec, target) => { pair[1] = target; time.hitStop(sec, pair); };
    let self = null; // this fighter (the record other code holds), set below
    // Every event this fighter emits carries its player (non-enumerable: see withPlayer).
    const emit = (name, data) => events.emit(name, withPlayer(data, player));

    // Stick direction relative to the camera; without input, melee uses the hero's facing and
    // ranged throws use where the camera looks.
    function inputDir(ctx, ranged = false) {
      const f = cam.forward(tmp), r = cam.right(new THREE.Vector3());
      const m = ctx.input.move;
      dir.set(f.x * m.y + r.x * m.x, 0, f.z * m.y + r.z * m.x);
      if (dir.lengthSq() < 0.04) {
        if (ranged) dir.set(f.x, 0, f.z);
        else dir.set(Math.sin(hero.bat.yaw), 0, Math.cos(hero.bat.yaw)).multiplyScalar(0.5);
      }
      return dir;
    }

    // Line of sight from Batman's chest to the target's: no hitting through walls and containers.
    const eye = new THREE.Vector3(), aim = new THREE.Vector3();
    function canSee(e) {
      eye.set(hero.pos.x, hero.pos.y + 1.2, hero.pos.z);
      aim.set(e.pos.x - eye.x, e.pos.y + 1.1 - eye.y, e.pos.z - eye.z);
      const d = aim.length();
      if (d < 0.8) return true;
      const hit = hero.collision.raycast(eye, aim.divideScalar(d), d);
      return !hit || hit.t > d - 0.45;
    }

    function faceTo(target) {
      hero.bat.face(Math.atan2(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z));
    }

    // A critical hit: slow motion, a big word, and an action camera shot from the side. `shot`
    // frames the camera (see follow.actionShot); `variant` picks the speed lines. The slow motion
    // is this player's (src/core/time.js: the world's with one player).
    function critical(target, { slow = 0.55, scale = 0.28, shot, variant, impact } = {}) {
      time.slowMo(slow, scale, player);
      target.ch.headWorld(chest, -0.4);
      cam.actionShot?.(chest.clone(), hero.pos.clone(), slow + 0.35, shot);
      emit('critical', { target, variant, impact });
    }

    // assist: an ally's blow (Nightwing). It adds to a combo she has going but never starts one,
    // and the hit-stop, shake and last-goon action shot are hers: his get them only close to her.
    const ASSIST_FEEL = 9;
    // Moves that land from above: a shield can't stop them.
    const AERIAL = new Set(['jumpKick', 'diveBomb', 'slam', 'aerial']);
    const hitDir = { x: 0, z: 0 };
    function landHit(move, target, { word: w, power = 1, stopTime = 0.06, launch = 0, crit = false, react = null, assist = false, clip = null, aerial = false } = {}) {
      if (target.state === 'tied') return breakTied(target);
      if (target.state === 'frozen') return shatter(target);
      const fromBehind = target.ch?.yaw !== undefined && hitSide(target.ch.yaw, hero.pos.x, hero.pos.z, target.pos.x, target.pos.z) === 'back';
      let result = resolveHit(move, target, { fromBehind, aerial: aerial || AERIAL.has(move) });
      // Story's armour break (rules.js DIFFICULTY.story.armorBreak): a run of shrugged-off blows
      // stuns an armoured goon as a cape would.
      const armorBreak = DIFFICULTY[difficulty]?.armorBreak;
      if (armorBreak && result.outcome === 'immune') {
        target.armorHits = (target.armorHits ?? 0) + 1;
        if (target.armorHits >= armorBreak) { target.armorHits = 0; result = { outcome: 'stun', damage: 0, stun: 1.6 }; }
      } else if (result.outcome !== 'immune') target.armorHits = 0;
      const wasAttacking = target.applyHit(result, hero.pos, { power, launch, react, move, aerial: aerial || AERIAL.has(move) });
      if (wasAttacking) director.release(target.id);
      // Aggro: it turns on whoever hit it (src/players/targeting.js).
      if (!assist) target.lastHitBy = self;
      target.ch.headWorld(chest, -0.3);
      const dl = Math.hypot(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z) || 1;
      hitDir.x = (target.pos.x - hero.pos.x) / dl; hitDir.z = (target.pos.z - hero.pos.z) / dl;
      // The payload audio and the impact VFX read: what struck (strike kind, power), what it hit
      // (material), where and which way, and (non-enumerable) the player.
      emit('impact', { pos: chest.clone(), move, outcome: result.outcome, target, crit, strike: strikeKindOf(clip ?? '', move), power, material: materialOf(target, result.outcome), dir: { x: hitDir.x, z: hitDir.z }, clip });
      if (result.outcome === 'parried' || result.outcome === 'immune' || result.outcome === 'blocked' || result.outcome === 'shocked') {
        stopOn(0.04, target);
        cam.addShake(0.05);
        emit('blocked', { move, target, outcome: result.outcome });
        // A charged baton bites back: the hand that hit it gets the shock.
        if (result.outcome === 'shocked' && !assist) shock(target);
        return result;
      }
      if (!assist || combo.value > 0) combo.hit();
      if (result.outcome === 'chip') { stopOn(0.03, target); cam.addShake(0.04); return result; }
      const felt = !assist || target.pos.distanceTo(hero.pos) < ASSIST_FEEL;
      const big = result.outcome === 'ko' || result.outcome === 'knockdown';
      // Freeze both fighters on the contact frame, longer for a knockdown or a critical.
      if (felt) {
        if (assist) { pair[0] = null; stopOn(Math.max(stopTime, big ? 0.12 : 0, crit ? 0.14 : 0), target); pair[0] = hero; }
        else stopOn(Math.max(stopTime, big ? 0.12 : 0, crit ? 0.14 : 0), target);
        cam.addShake(result.outcome === 'hit' ? 0.07 : 0.16);
        cam.hitKick?.(big || crit ? 5 : 2.5);
        if (!assist) emit('rumble', { strength: big || crit ? 0.55 : 0.25, duration: big || crit ? 0.14 : 0.07 });
      }
      if (w || result.outcome === 'ko') emit('word', { text: w ?? word('ko'), pos: chest.clone(), big: crit });
      const lastOne = felt && result.outcome === 'ko' && engaged().length === 0;
      if (result.outcome === 'ko') { emit('ko', { target, pos: target.pos.clone(), power, dir: { x: hitDir.x, z: hitDir.z }, move }); squadNote.ko(target); }
      if (!assist && combo.value >= 6 && combo.value % 3 === 0) squadNote.combo(combo.value);
      if (lastOne) { emit('lastHit', { target }); critical(target, { slow: 0.9, scale: 0.22 }); }
      else if (crit && result.outcome !== 'hit') critical(target);
      else if (crit) critical(target, { slow: 0.35, scale: 0.4 });
      return result;
    }
    // Striking a charged stun baton barehanded: a jolt through the arm (a light hit on the hero
    // even mid-move; the answer is to dodge him, hit him from behind or batarang him first).
    function shock(e) {
      const inv = hero.invulnerable;
      hero.invulnerable = 0;
      onAttackLand(e, 'shock');
      hero.invulnerable = Math.max(hero.invulnerable, Math.min(inv, 0.3));
      emit('shocked', { target: e });
    }

    // One goon's part in a chain (or a tied bundle) ends: knocked out, or only knocked down for a
    // brute. Same bookkeeping as landHit: director slot, combo, impact and ko events.
    function finishTarget(e, { power = 1, launch = 0 } = {}) {
      if (!e.alive) return null;
      const outcome = chainOutcome(e);
      if (outcome === 'ko') e.health = 0;
      e.tiedWith = null;
      e.applyHit({ outcome, damage: 0, stun: 0 }, hero.pos, { power, launch });
      director.release(e.id);
      e.lastHitBy = self;
      combo.hit();
      e.ch.headWorld(chest, -0.3);
      emit('impact', { pos: chest.clone(), move: 'chain', outcome, target: e, crit: false });
      if (outcome === 'ko') emit('ko', { target: e });
      return outcome;
    }

    // Any hit on a tied goon knocks the whole bundle out (brutes only go down).
    function breakTied(target) {
      const group = tiedGroup(target);
      let kos = 0;
      for (const e of group) if (finishTarget(e, { power: 1.4, launch: 2.5 }) === 'ko') kos += 1;
      time.hitStop(0.12, [hero, ...group]);
      cam.addShake(0.18);
      target.ch.headWorld(chest, 0.2);
      emit('word', { text: 'KAPOW!', pos: chest.clone(), big: true });
      emit('tiedBreak', { count: group.length });
      critical(target, { slow: 0.6, scale: 0.3, variant: 'rope', shot: CHAIN_SHOTS.kapow, impact: 2 });
      if (kos && engaged().length === 0) emit('lastHit', { target });
      return { outcome: kos ? 'ko' : 'knockdown', damage: 0, stun: 0 };
    }

    // Freeze blast: any hit on the ice knocks the goon out (enemy.applyHit does the same for hits
    // that don't come through landHit, like the dive-bomb shockwave).
    function shatter(target) {
      target.applyHit({ outcome: 'ko', damage: 0, stun: 0 }, hero.pos, { power: 1.2, launch: 2 });
      director.release(target.id);
      combo.hit();
      stopOn(0.12, target);
      cam.addShake(0.16);
      target.ch.headWorld(chest, -0.3);
      emit('impact', { pos: chest.clone(), move: 'shatter', outcome: 'ko', target, crit: true });
      emit('iceShatter', { target, pos: chest.clone() });
      emit('word', { text: 'KRSSSH!', pos: chest.clone(), big: true });
      emit('ko', { target });
      if (engaged().length === 0) { emit('lastHit', { target }); critical(target, { slow: 0.9, scale: 0.22 }); }
      return { outcome: 'ko', damage: 0, stun: 0 };
    }

    // Knocks down every goon in reach of `center` with `move` (explosive gel). Brutes shrug it off
    // unless stunned (resolveHit), the Joker is never touched, ice shatters, and a goon held in a
    // chain takedown stays in the chain's hands. Returns how many went down.
    function areaBlast(center, radius, move, { power = 1.6, launch = 6, dy = 2.5 } = {}) {
      let n = 0;
      for (const e of enemies) {
        if (!e.alive || e.def.boss || e.state === 'chained') continue;
        if (Math.hypot(e.pos.x - center.x, e.pos.z - center.z) > radius || Math.abs(e.pos.y - center.y) > dy) continue;
        if (e.state === 'frozen') { shatter(e); n += 1; continue; }
        if (e.down) continue;
        const r = landHit(move, e, { power, launch });
        if (r.outcome !== 'immune' && r.outcome !== 'parried') n += 1;
      }
      return n;
    }

    // ---- moves (hero.control objects) ----
    //
    // Every move plays through the hero's animation graph (src/anim/graph.js): the blow lands when
    // the clip reaches its `contact` event, strike -> strike opens at `cancel`, the move hands back
    // at `recover`. The body gets to the target by motion warping (src/anim/warp.js): the clip's own
    // root motion, stretched (at most 2.5 m) and turned so the limb arrives on the target at
    // contact. A longer gap picks a travel strike whose own motion covers it, or a dash at running
    // pace (the loop playing at the speed the body moves) into the strike. No facing snaps.
    const graph = () => graphFor(hero.bat, { events, actor: hero, who: 'hero' });
    const hasClip = (c) => !!hero.bat.animator.has?.(c);
    const pickHad = (list) => firstHad(list, hasClip);
    const warpOut = { dx: 0, dz: 0, yaw: 0 };
    const tgtView = { x: 0, z: 0, radius: 0.42, scale: 1 };
    const prevPos = new THREE.Vector3();
    const rmA0 = [0, 0], rmA1 = [0, 0];
    // A clip's data for the warp: the reach table's entry (limb reach, root motion) plus its events.
    function warpEntry(clip) {
      const r = reach[clip], info = clipInfo(clip);
      if (!r && !info) return null;
      return { contact: info?.events?.contact ?? r?.contact, reach: r?.reach ?? info?.reach ?? null, root: r?.root ?? info?.root ?? null, fps: r?.fps || info?.fps || 30, events: info?.events ?? null };
    }
    // The body follows the warp; walls push out, and a step that would leave the roof is refused
    // (same guard as the dodge roll).
    function moveBy(dx, dz, y0) {
      prevPos.copy(hero.pos);
      hero.pos.x += dx; hero.pos.z += dz; hero.pos.y = y0;
      const r = hero.collision.resolveCylinder(hero.pos, 0.35, 1.8, { prevY: y0 });
      if (r && r.groundY < y0 - 0.5) hero.pos.copy(prevPos);
    }
    const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    // How far the warp would stretch to land `clip` (from `start`) on a target this far away.
    function stretch(clip, start, target) {
      const entry = warpEntry(clip);
      if (!entry) return 0;
      return createStrikeWarp(entry, { startAt: start }).stretchFor(hdist(hero.pos, target.pos), target.radius ?? 0.42 * target.scale, target.scale);
    }
    // The strike to throw at this range: the chosen clip if the warp covers the gap, else a travel
    // strike whose motion does, else the chosen clip after a dash.
    function planReach(kind, clip, speed, start, target) {
      if (stretch(clip, start, target) <= MAX_WARP) return { clip, speed, start, dash: false };
      for (const c of moves.travel[kind === 'kick' ? 'kick' : 'punch'] ?? []) {
        if (!hasClip(c)) continue;
        const s0 = Math.max(0, (clipInfo(c)?.events?.warpStart ?? 0) - 0.3);
        if (stretch(c, s0, target) <= MAX_WARP) return { clip: c, speed: 1.2, start: s0, dash: false, travel: true };
      }
      return { clip, speed, start, dash: true };
    }

    // A strike in flight: plays `clip` through the graph and warps the body onto `target`. Returns
    // a small runner the controls drive: step(dt) advances one frame; `hit` once contact fired.
    // dash: run in first (Sprint_Loop at the body's own pace) until the warp covers the rest.
    function strikeRunner(target, plan, { state = 'strike', fallbackReach = 0.9, fallbackContact = 0.11, onContact, dashSpeed = 13, maxDash = 1.4 }) {
      const g = graph();
      const y0 = hero.pos.y;
      let warp = null, dashing = plan.dash, dashT = 0, frozen = false, due = false;
      // The dash asks every frame whether the strike's warp now covers the gap: one probe warp,
      // made once (no allocation per frame).
      const probeEntry = plan.dash ? warpEntry(plan.clip) : null;
      const probe = probeEntry ? createStrikeWarp(probeEntry, { startAt: plan.start }) : null;
      const run = { hit: false, started: false, warp: null, plan };
      const begin = () => {
        dashing = false;
        const entry = warpEntry(plan.clip);
        warp = run.warp = entry ? createStrikeWarp(entry, { startAt: plan.start, fallbackReach }) : null;
        // A clip with no event data (an old fallback) lands where the old timer did.
        const evs = clipInfo(plan.clip)?.events?.contact === undefined ? deriveStrikeEvents(Math.max(1, plan.start + 1), plan.start + fallbackContact * plan.speed) : null;
        // Contact is marked due and resolved after this frame's warp step, so the blow is judged
        // with the body where the clip put it on the contact frame.
        g.play(plan.clip, { state, timeScale: plan.speed, startAt: plan.start, fade: 0.1, blend: 'inertial', events: evs, on: { contact: () => { due = true; } } });
        run.started = true;
      };
      if (dashing) g.play('Sprint_Loop', { state: 'loco', once: false, timeScale: dashSpeed / 11.5, fade: 0.12, blend: 'inertial' });
      else begin();
      run.step = (dt) => {
        if (dashing) {
          dashT += dt;
          g.advance(dt);
          const dx = target.pos.x - hero.pos.x, dz = target.pos.z - hero.pos.z, d = Math.hypot(dx, dz) || 1;
          hero.bat.face(turnToward(hero.bat.yaw, Math.atan2(dx, dz), 16, dt));
          const step = Math.min(dashSpeed * dt, Math.max(0, d - 1.2));
          moveBy((dx / d) * step, (dz / d) * step, y0);
          const left = probe ? probe.stretchFor(d, target.radius ?? 0.42 * target.scale, target.scale) : 0;
          if (left <= MAX_WARP * 0.8 || dashT > maxDash || d < 1.6) begin();
          return;
        }
        const c0 = g.time;
        g.advance(dt);
        const c1 = g.time;
        if (warp && g.clip === plan.clip) {
          // Track the target until contact; from contact on only the authored motion plays.
          if (!frozen) { tgtView.x = target.pos.x; tgtView.z = target.pos.z; tgtView.radius = target.radius ?? 0.42 * target.scale; tgtView.scale = target.scale ?? 1; }
          warp.step(c0, c1, hero.pos.x, hero.pos.z, hero.bat.yaw, tgtView, warpOut);
          moveBy(warpOut.dx, warpOut.dz, y0);
          hero.bat.face(warpOut.yaw);
        }
        if (due) { due = false; frozen = true; run.hit = true; onContact(); }
      };
      return run;
    }

    // Seconds of this hero's time from now to an event of the playing clip.
    const timeTo = (ev) => graph().timeTo(ev);

    // The first time each movement move lands, its name is the comic word ("FLYING KNEE!").
    const movesSeen = new Set();
    function landMove(mv, target, clip) {
      const first = !movesSeen.has(mv.id);
      movesSeen.add(mv.id);
      landHit(mv.kind, target, { word: first ? mv.name.toUpperCase() + '!' : mv.word, power: mv.power, launch: mv.launch, crit: mv.crit, stopTime: STOP[mv.stop] ?? STOP.kick, react: mv.react, clip });
      emit('moveLanded', { id: mv.id, name: mv.name });
    }
    // The held direction (relative to the target), sprint and airborne state pick a movement move.
    function pickMove(action, target, ctx, air) {
      if (!can(hero, air ? 'aerialAttacks' : 'moveStrikes')) return null; // [onboard] gate
      const m = ctx.input.move;
      const held = Math.hypot(m.x, m.y) > 0.2;
      const to = { x: target.pos.x - hero.pos.x, z: target.pos.z - hero.pos.z };
      return selectMove({
        action, air,
        dir: held ? classifyDir(inputDir(ctx), to) : 'none',
        airFromSprint: !!hero.airFromSprint,
        sprint: !air && (!!ctx.input.down?.('sprint') || hero.speed > 8),
        targetDown: !air && target.down && target.alive && !target.air,
        has: (c) => !!hero.bat.animator.has?.(c),
      });
    }
    const stickHeld = (ctx) => !!ctx?.input?.move && Math.hypot(ctx.input.move.x, ctx.input.move.y) > 0.5;
    // mv: a movement move from src/combat/moveSelect.js (sprint, away, side, stomp), or null for
    // the punch / kick rotation.
    function strike(kind, target, mv = null) {
      const isKick = kind === 'kick';
      const ground = target.down && target.alive && !target.air;
      const beatdown = (target.type === 'brute' || !!target.def?.chip) && target.stunned && can(hero, 'beatdown'); // [onboard] gate
      const juggle = !!target.air;
      // Chains: the fourth punch is a heavy haymaker, the third kick the lunge spin kick.
      chainT = 2.0;
      focus = target;
      let finisher = null;
      if (!ground && !beatdown && !juggle) {
        if (isKick) { kickChain += 1; punchChain = 0; if (kickChain >= 3) { finisher = 'spinKick'; kickChain = 0; } }
        else { punchChain += 1; kickChain = 0; if (punchChain >= CHAIN) { finisher = 'heavy'; punchChain = 0; } }
      }
      // A movement move counts toward the chain but replaces the finisher it would have been.
      if (mv) finisher = null;
      if (finisher && !can(hero, 'comboFinisher')) finisher = null; // [onboard] gate
      const move = mv ? mv.kind : ground ? 'punch' : beatdown ? 'beatdown' : finisher ?? kind;
      const range = hdist(target.pos, hero.pos);
      let clip, speed;
      // A goon on the floor: a two-fisted hammer straight down onto him; a stunned brute or heavy
      // takes a flurry.
      if (mv) { clip = mv.clip; speed = strikeSpeed(clip, 1.3); }
      else if (ground) { clip = pickHad(moves.ground) ?? (reach.Punch_Hammer ? 'Punch_Hammer' : 'Sword_Attack'); speed = clip === 'Hammer_Down' ? 1.7 : clip === 'Punch_Hammer' ? 1.5 : 1.8; }
      else if (move === 'heavy') { clip = choose.punchFinisher(); speed = strikeSpeed(clip, 1.35); }
      else if (move === 'spinKick') { clip = choose.kickFinisher(); speed = strikeSpeed(clip, 1.3); }
      else if (isKick) { clip = choose.kick(range); speed = strikeSpeed(clip, 1.3); }
      else if (beatdown) { const list = moves.beatdown.filter(hasClip); clip = list.length ? list[beatIdx++ % list.length] : PUNCHES[beatIdx++ % PUNCHES.length]; speed = clip.startsWith('Finisher') ? 1.5 : clip === 'Knee_Strike' ? KICK_SPEED.Knee_Strike : 2.2; }
      else { clip = choose.punch(punchChain, range); speed = strikeSpeed(clip, 1.8); }
      const start = MOCAP_START[clip] ?? 0;
      const spin = !mv && move === 'spinKick';
      // Zero the run-up: a strike's motion is the clip's, not the leftover jog (finding 11).
      hero.vel.set(0, 0, 0);
      const plan = (mv || ground || beatdown) ? { clip, speed, start, dash: stretch(clip, start, target) > MAX_WARP } : planReach(kind, clip, speed, start, target);
      // (Travel strikes and dashes stay hittable: closing a gap is not a free pass.)
      const big = !!mv || spin || move === 'heavy';
      // A ninja may slip a plain strike (vary the rhythm, or stun him first).
      const evaded = !mv && !ground && !beatdown && !juggle && !!target.tryEvade?.(hero.pos, DIFFICULTY[difficulty]?.dodgeMul ?? 1);
      const onContact = () => {
        if (!target.alive) return;
        if (evaded || target.state === 'evade') { emit('evaded', { e: target, by: 'enemy' }); target.ch.headWorld(chest, -0.2); emit('word', { text: 'MISS!', pos: chest.clone(), big: false }); return; }
        const c = plan.clip;
        // A travel strike closes the gap and staggers; it is not a free knockdown.
        if (plan.travel) { landHit('travel', target, { word: rng.chance(0.5) ? word('kick') : null, power: 1.6, launch: 0, stopTime: STOP.kick, clip: c }); return; }
        if (mv) { landMove(mv, target, c); return; }
        // Each finisher lands its own way: the hammer and the axe kick drive the goon straight
        // down, the backfist and the spin kick send him flying, the haymaker lifts him.
        if (move === 'heavy') {
          const f = c === 'Punch_Hammer' ? { word: 'BADOOM!', launch: 0.4 } : c === 'Punch_Backfist' ? { word: word('spin'), launch: 4.5 } : { word: word('heavy'), launch: 3 };
          landHit('heavy', target, { ...f, power: 1.8, crit: true, stopTime: STOP.heavy, clip: c });
        }
        // The flip kick comes down from the top of a front flip: the biggest launch of all.
        else if (spin) landHit('spinKick', target, c === 'Kick_Axe'
          ? { word: 'KRUNCH!', power: 2.2, launch: 0.5, crit: true, stopTime: STOP.finisher, clip: c }
          : c === 'Kick_Flip' ? { word: 'WHAM!', power: 2.4, launch: 8, crit: true, stopTime: STOP.finisher, clip: c }
          : { word: word('spin'), power: 2.2, launch: 6.5, crit: true, stopTime: STOP.finisher, clip: c });
        else if (juggle) landHit(isKick ? 'kick' : 'punch', target, { word: rng.chance(0.4) ? 'JUGGLE!' : null, power: 1.2, stopTime: isKick ? STOP.kick : STOP.punch, clip: c });
        // The uppercut pops the goon up off his feet, ready for a juggle; an elbow hits a bit harder.
        else if (c === 'Punch_Uppercut') landHit(move, target, { word: rng.chance(0.6) ? word('uppercut') : null, power: 1.3, launch: 3.4, stopTime: STOP.kick, react: 'head', clip: c });
        else landHit(move, target, { word: isKick && rng.chance(0.4) ? word('kick') : c === 'Elbow_Strike' && rng.chance(0.5) ? 'KRAK!' : null, power: c === 'Kick_Push' ? 2.4 : isKick ? 1.6 : c === 'Elbow_Strike' || c === 'Elbow_Head' ? 1.2 : move === 'beatdown' ? 1.1 : 1, launch: isKick ? (c === 'Kick_Low' ? 1 : c === 'Kick_Side' ? 3 : 2) : 0, stopTime: isKick ? STOP.kick : STOP.punch, react: REACT[c] ?? null, clip: c });
      };
      const runner = strikeRunner(target, plan, { fallbackReach: 1.0 * target.scale, onContact });
      // Big moves can't be interrupted (Arkham style): a goon's blow landing mid spin or mid flip
      // would have to blend her from upside down to a flinch, which has no clean path.
      if (big) hero.invulnerable = Math.max(hero.invulnerable, (plan.dash ? 0.6 : 0) + Math.min(1.6, timeTo('recover')) + 0.05);
      emit('swing', { kind, finisher: mv ? mv.crit : move === 'heavy' || spin, clip: plan.clip, speed: plan.speed, pos: hero.pos.clone(), strike: strikeKindOf(plan.clip, move) });
      const g = graph();
      let t = 0, hitT = 0;
      return {
        name: 'strike', combat: true,
        get hit() { return runner.hit; },
        // Strike -> strike from the clip's cancel point (about contact + hit-stop + 0.08 s). A travel
        // strike's cancel comes late (the slide tackle's ~0.35 s after contact) and the next press
        // aged out of the input buffer meanwhile (anim2: the 9-of-10 freeflow chain): it opens
        // 0.15 s after its blow lands instead.
        canChain: () => runner.started && (runner.hit || !target.alive) && (g.passed('cancel') || (!!plan.travel && hitT > 0.15)),
        // A buffered block may cut in before contact to counter an incoming attack.
        interruptible: () => !runner.hit && (!runner.started || !g.passed('contactSoon')),
        update(dt, ctx) {
          t += dt;
          runner.step(dt);
          if (runner.hit) hitT += dt;
          if (!runner.started) return t > 2.5;
          // Hands back at recover, or at cancel when the stick asks to move.
          return g.passed('recover') || g.ended || (runner.hit && g.passed('cancel') && stickHeld(ctx)) || t > 4;
        },
      };
    }

    function whiff() {
      let t = 0;
      const g = graph();
      g.play('Punch_Jab', { state: 'strike', timeScale: 1.8, startAt: MOCAP_START.Punch_Jab ?? 0, fade: 0.1, blend: 'inertial' });
      // A swing at nothing no longer costs the combo (owner: combos way easier to keep).
      punchChain = kickChain = 0;
      emit('whiff', {});
      emit('swing', { kind: 'punch', clip: 'Punch_Jab', speed: 1.8, pos: hero.pos.clone(), strike: 'jab' });
      return { name: 'whiff', combat: true, canChain: () => g.passed('cancel') || t > 0.25, update(dt) { t += dt; g.advance(dt); return g.passed('recover') || t > 0.45; } };
    }

    function counter(targets) {
      let i = 0, runner = null, hitT = 0;
      const g = graph();
      const bigCounter = combo.value >= 5 || targets.length > 1;
      const setup = () => {
        const target = targets[i];
        // Rotate through the kit's counters (a fresh one each counter), each warped so it connects
        // on its contact frame; a far one (up to 7.5 m) dashes in first.
        const usable = moves.counters.filter((c) => !!reach[c] || (hasClip(c) && !!warpEntry(c)?.reach));
        const clip = usable.length ? usable[counterIdx++ % usable.length] : 'Melee_Hook';
        // Counters are quicker than the same blow in freeflow, and start past the wind-up (mocap).
        const speed = clip === 'Kick_Front' ? 2.2 : strikeSpeed(clip, 1.6) * 1.35;
        const start = clip === 'Kick_Front' ? 0.3 : MOCAP_START[clip] ?? Math.max(0, (clipInfo(clip)?.events?.warpStart ?? 0) - 0.1);
        const plan = { clip, speed, start, dash: stretch(clip, start, target) > MAX_WARP };
        hitT = 0;
        runner = strikeRunner(target, plan, { state: 'counter', fallbackReach: 1.1 * target.scale, dashSpeed: 18, maxDash: 0.5,
          onContact: () => {
            const last = i === targets.length - 1;
            // A knife chain or a ninja turns the counter aside and comes straight back: counter again.
            if (target.alive && target.riposte?.(hero, DIFFICULTY[difficulty]?.smart ?? 0.6)) {
              stopOn(0.05, target);
              target.ch.headWorld(chest, -0.2);
              emit('word', { text: 'PARRY!', pos: chest.clone(), big: false });
              emit('riposte', { target });
              return;
            }
            if (target.alive) landHit('counter', target, { word: word('counter'), power: 1.3, stopTime: STOP.counter, launch: 2.5, crit: bigCounter && last, clip });
          } });
        hero.invulnerable = Math.max(hero.invulnerable, (plan.dash ? 0.5 : 0) + timeTo('contact') + 0.15);
      };
      // Countered attackers freeze mid-windup until the counter lands, and Batman can't be hit
      // while he works through them.
      for (const target of targets) { target.glyph = null; target.countered = true; target.counterT = 0; director.release(target.id); }
      hero.invulnerable = Math.max(hero.invulnerable, 0.32 * targets.length + 0.15);
      hero.vel.set(0, 0, 0);
      time.slowMo(0.18, 0.35, player);
      emit('counter', { count: targets.length });
      setup();
      let t = 0;
      return {
        name: 'counter', combat: true,
        canChain: () => i === targets.length - 1 && runner.hit && (g.passed('cancel') || hitT > 0.2),
        update(dt, ctx) {
          t += dt;
          runner.step(dt);
          if (runner.hit) hitT += dt;
          // The next attacker once this blow has followed through a little (cancel); the move
          // ends at recover (or once the stick asks to move).
          if (runner.hit && (g.passed('cancel') || hitT > 0.3)) {
            if (i < targets.length - 1) { i += 1; setup(); return false; }
            return g.passed('recover') || g.ended || stickHeld(ctx) || hitT > 0.5;
          }
          return t > 3;
        },
      };
    }

    function capeStun() {
      let t = 0, done = false;
      const g = graph();
      const clip = pickHad(moves.cape) ?? 'Sword_Regular_B';
      // Cape_Swirl: the swirl itself is its first blow (`hits[0]`, ~0.97 s). It is one ~330 degree
      // spin that ends facing forward; anim2 plays it from 0.15 s, where the body still faces
      // about forward, at 2.4x (the swirl lands ~0.34 s after the press). Starting just before
      // the swirl (0.72 s) began the move with the body turned ~150 degrees away from where it
      // stood: no blend can turn that round without a pop (the 1.2-1.5 m cape pops).
      const info = clipInfo(clip);
      const swirlAt = info?.events?.hits?.[0]?.[0] ?? null;
      const start = swirlAt !== null ? Math.min(0.15, Math.max(0, swirlAt - 0.8)) : 0;
      const speed = swirlAt !== null ? 2.4 : 1.7;
      const stunAt = swirlAt ?? start + 0.12 * speed;
      hero.vel.set(0, 0, 0);
      g.play(clip, { state: 'strike', timeScale: speed, startAt: start, fade: 0.08, blend: 'inertial' });
      emit('cape', {});
      emit('swing', { kind: 'cape', clip, speed, pos: hero.pos.clone(), strike: 'cape' });
      return {
        name: 'cape', combat: true,
        canChain: () => done && (g.time - stunAt) / speed > 0.15,
        update(dt, ctx) {
          t += dt;
          g.advance(dt);
          if (!done && (g.time >= stunAt || t > 0.4)) {
            done = true;
            const fx = Math.sin(hero.bat.yaw), fz = Math.cos(hero.bat.yaw);
            let n = 0;
            for (const e of alive()) {
              const dx = e.pos.x - hero.pos.x, dz = e.pos.z - hero.pos.z;
              const d = Math.hypot(dx, dz);
              if (d > 3.8 || (dx * fx + dz * fz) / (d || 1) < 0.2) continue;
              landHit('cape', e, { clip });
              if (e.state === 'windup' || e.state === 'attack') director.release(e.id);
              n++;
            }
            if (!n) emit('whiff', {});
          }
          const after = done ? (g.time - stunAt) / speed : 0;
          return done && after > 0.3 && (stickHeld(ctx) || g.passed('recover') || after > 0.45 || t > 0.9);
        },
      };
    }

    function batarang(targets, fx) {
      let t = 0, thrown = 0;
      const g = graph();
      const aimYaw = Math.atan2(targets[0].pos.x - hero.pos.x, targets[0].pos.z - hero.pos.z);
      g.play('OverhandThrow', { state: 'action', timeScale: 1.9, fade: 0.08, blend: 'inertial' });
      const end = 0.35 + (targets.length - 1) * 0.05;
      return {
        name: 'batarang', combat: true,
        canChain: () => t > 0.25 + (targets.length - 1) * 0.05,
        update(dt) {
          t += dt;
          g.advance(dt);
          // Turns into the throw over its wind-up instead of snapping (finding 2).
          hero.bat.face(turnToward(hero.bat.yaw, aimYaw, 22, dt));
          while (thrown < targets.length && t > 0.14 + thrown * 0.05) {
            const target = targets[thrown++];
            hero.bat.bone('hand_r').getWorldPosition(chest);
            if (thrown === 1) emit('batarangThrow', { count: targets.length });
            fx.batarang(chest.clone(), (out) => target.ch.headWorld(out, -0.25), () => {
              if (!target.alive) return;
              const r = landHit('batarang', target);
              if (target.state === 'windup' || target.state === 'attack') director.release(target.id);
              emit('batarangHit', { target, result: r });
            });
          }
          return t > end;
        },
      };
    }

    // The dodge: a roll toward the stick (turning into it over the first beat), a backflip away,
    // or a vault over a goon in the way. The roll covers its distance with its own root motion
    // (scaled, never re-timed against a timer), so the feet match the travel.
    function dodge(ctx) {
      const d = inputDir(ctx).clone().normalize();
      const from = hero.pos.clone();
      const g = graph();
      let t = 0;
      const over = alive().some((e) => {
        const ex = e.pos.x - from.x, ez = e.pos.z - from.z;
        const along = ex * d.x + ez * d.z;
        return along > 0 && along < 3 && Math.abs(ex * d.z - ez * d.x) < 0.9;
      });
      const want = Math.atan2(d.x, d.z);
      const rel = Math.atan2(Math.sin(want - hero.bat.yaw), Math.cos(want - hero.bat.yaw));
      // Toward or away from where she faces: a roll or a backflip; across it: a quick side step
      // (shorter, and she keeps facing the fight).
      const side = over ? 'over' : Math.abs(rel) > 2.4 ? 'back' : Math.abs(rel) > 0.9 ? (rel > 0 ? 'left' : 'right') : 'forward';
      const list = side === 'back' ? moves.dodge.back : side === 'left' ? moves.dodge.left : side === 'right' ? moves.dodge.right : ['Dodge_Roll_Run', ...moves.dodge.forward];
      const clip = side === 'over' ? 'NinjaJump_Start' : pickHad(list) ?? 'Roll';
      const stepping = clip.startsWith('Dodge_Step');
      const info = clipInfo(clip);
      const rm = info?.root && info.root.length > 4 ? info : null;
      const total = rm ? rootMotionAt(rm, info.duration, [0, 0])[1] : 0;
      // Distance: 4.5 m as before. A clip whose root carries the travel is scaled to it and played
      // to take ~0.75 s; others keep the old ease-out.
      const DIST = stepping ? 2.2 : 4.5;
      // A side step's root travels sideways: its own lateral motion carries it (scaled).
      const lateral = stepping && rm ? Math.abs(rootMotionAt(rm, info.duration, [0, 0])[0]) : 0;
      const k = stepping && lateral > 0.2 ? DIST / lateral : rm && total > 1 ? DIST / total : 0;
      const speed = side === 'over' ? 1.4 : k > 0 ? Math.max(1.4, (info.events.recover ?? info.duration) / 0.75) : clip === 'Dodge_Backflip' ? 1.6 : 1.5;
      const faceYaw = side === 'back' || stepping ? hero.bat.yaw : want;
      g.play(clip, { state: 'dodge', timeScale: speed, fade: 0.08, blend: 'inertial' });
      hero.vel.set(0, 0, 0);
      hero.invulnerable = 0.45;
      emit('dodge', { dir: side });
      const rm0 = [0, 0], rm1 = [0, 0];
      let moved = 0;
      return {
        name: 'dodge', combat: true,
        canChain: () => t > 0.35,
        update(dt) {
          t += dt;
          const c0 = g.time;
          g.advance(dt);
          const c1 = g.time;
          hero.bat.face(turnToward(hero.bat.yaw, faceYaw, 18, dt));
          let step;
          if (k > 0 && stepping) { rootMotionAt(rm, c0, rm0); rootMotionAt(rm, c1, rm1); step = Math.abs(rm1[0] - rm0[0]) * k; }
          else if (k > 0) { rootMotionAt(rm, c0, rm0); rootMotionAt(rm, c1, rm1); step = Math.max(0, rm1[1] - rm0[1]) * k; }
          else { const e0 = Math.min(1, (t - dt) / 0.42), e1 = Math.min(1, t / 0.42); step = DIST * ((1 - (1 - e1) * (1 - e1)) - (1 - (1 - e0) * (1 - e0))); }
          step = Math.min(step, DIST - moved);
          moved += step;
          prevPos.copy(hero.pos);
          hero.pos.x += d.x * step; hero.pos.z += d.z * step;
          hero.pos.y = from.y + (over ? Math.sin(Math.min(1, t / 0.42) * Math.PI) * 1.6 : 0);
          const r = hero.collision.resolveCylinder(hero.pos, 0.35, 1.8);
          if (!over && r.groundY < from.y - 0.5) { hero.pos.copy(prevPos); return true; }
          const done = over ? t >= 0.42 : moved >= DIST - 1e-3 || g.passed('recover') || t > 1;
          if (done) { hero.pos.y = Math.max(r.groundY, from.y); return true; }
          return false;
        },
      };
    }

    function special(target) {
      let t = 0;
      if (!target.finishable) combo.spend();
      hero.invulnerable = 1;
      // A different takedown each time (the kit's specials that the build has).
      const usable = (moves.specials ?? [moves.special]).filter((c) => typeof c === 'string' && hasClip(c) && (reach[c] || warpEntry(c)?.reach));
      const clip = usable.length ? usable[specialIdx++ % usable.length] : 'Kick_Round';
      const start = MOCAP_START[clip] ?? Math.max(0, (clipInfo(clip)?.events?.warpStart ?? 0) - 0.35), speed = clip === 'Kick_Round' ? 1.3 : 1.25;
      hero.vel.set(0, 0, 0);
      const runner = strikeRunner(target, { clip, speed, start, dash: false }, { fallbackReach: 1.1, onContact: () => {
        if (target.alive) landHit('special', target, { word: word('special'), power: 2.2, stopTime: 0.15, launch: 5, crit: true, clip });
      } });
      emit('special', { target });
      for (const e of alive()) { if (e.state === 'windup') { director.release(e.id); e.glyph = null; e.state = 'engage'; } }
      // Slow the run-up; the critical (stinger, action shot) fires once, on the contact frame.
      time.slowMo(0.8, 0.28, player);
      let hitT = 0;
      return {
        name: 'special', combat: true,
        canChain: () => runner.hit && hitT > 0.3,
        update(dt) {
          t += dt;
          runner.step(dt);
          if (runner.hit) hitT += dt;
          return (runner.hit && hitT > 0.45) || t > 3;
        },
      };
    }

    // A kick from the air: a short arc onto the target timed by the clip, so the foot's extension
    // frame (contact) lands exactly as the flight ends (finding 6: no clamped re-timing against a
    // separate timer, no straight-line lerp).
    function airKick(target, kind, mv = null) {
      const from = hero.pos.clone();
      const d = from.distanceTo(target.pos);
      focus = target;
      const clip = mv ? mv.clip : typeof moves.air === 'string' && hasClip(moves.air) ? moves.air : 'Kick_Flying';
      const fly = reach[clip];
      const stop = fly ? 0.15 * target.scale + fly.reach.z + 0.25 : 1.0;
      const to = new THREE.Vector3().lerpVectors(from, target.pos, Math.max(0, (d - stop) / (d || 1)));
      to.y = target.pos.y;
      const start = MOCAP_START[clip] ?? 0;
      const contact = clipInfo(clip)?.events?.contact ?? fly?.contact ?? 0.3;
      const want = kind === 'diveBomb' ? Math.max(0.25, d / 30) : Math.max(0.28, d / 22);
      const speed = THREE.MathUtils.clamp((contact - start) / want, 0.7, 2.5);
      // The flight lasts exactly as long as the clip takes to reach contact at that speed.
      const dur = Math.max(0.12, (contact - start) / speed);
      const arc = kind === 'diveBomb' ? 0 : Math.min(1.2, 0.15 * d);
      let t = 0, hit = false;
      const g = graph();
      hero.invulnerable = Math.max(hero.invulnerable, dur + 0.3);
      const baseYaw = Math.atan2(target.pos.x - from.x, target.pos.z - from.z);
      const aimYaw = fly ? baseYaw - Math.atan2(fly.reach.x, fly.reach.z) : baseYaw;
      hero.cape.setWings(false);
      hero.bat.tilt.rotation.set(0, 0, 0);
      const land = () => {
        if (hit) return;
        hit = true;
        hero.pos.copy(to);
        if (target.alive && mv) landMove(mv, target, clip);
        else if (target.alive) landHit(kind, target, { word: kind === 'diveBomb' ? word('dive') : word('kick'), power: 1.8, stopTime: 0.1, launch: 4.5, crit: kind === 'diveBomb', clip, aerial: true });
        if (kind === 'diveBomb') for (const e of alive()) if (e !== target && e.pos.distanceTo(hero.pos) < 3) landHit('diveBomb', e, { power: 1.3, launch: 3, aerial: true });
        hero.vel.set(0, 0, 0);
        hero.grounded = true;
        hero.state = 'ground';
      };
      g.play(clip, { state: 'strike', timeScale: speed, fade: 0.1, startAt: start, blend: 'inertial', on: { contact: land } });
      emit(kind === 'diveBomb' ? 'diveBomb' : 'jumpKick', {});
      emit('swing', { kind: 'kick', clip, speed, pos: hero.pos.clone(), strike: 'kick' });
      return {
        name: kind, combat: true,
        canChain: () => hit && t > dur + 0.15,
        update(dt) {
          t += dt;
          hero.bat.face(turnToward(hero.bat.yaw, aimYaw, 20, dt));
          if (!hit) {
            const k = Math.min(1, t / dur);
            hero.pos.lerpVectors(from, to, k);
            hero.pos.y += Math.sin(k * Math.PI) * arc;
          }
          g.advance(dt);
          // The clip should reach contact as the flight ends; a missing event still lands.
          if (!hit && t > dur + 0.05) land();
          return t > dur + 0.3;
        },
      };
    }

    // Punch in the air: drop like a hammer and knock down everyone around the landing point.
    function airSlam() {
      const from = hero.pos.clone();
      const ground = hero.collision.groundBelow(from.x, from.y, from.z, 0.3);
      const floorY = ground > -Infinity ? ground : from.y;
      const fall = Math.max(0, from.y - floorY);
      const dur = THREE.MathUtils.clamp(fall / 26, 0.12, 0.5);
      let t = 0, hit = false;
      const g = graph();
      hero.cape.setWings(false);
      hero.bat.tilt.rotation.set(0, 0, 0);
      g.play('NinjaJump_Land', { state: 'action', timeScale: 0.9, fade: 0.06, blend: 'inertial' });
      emit('slamStart', {});
      return {
        name: 'slam', combat: true,
        canChain: () => hit && t > dur + 0.25,
        update(dt) {
          t += dt;
          g.advance(dt);
          const k = Math.min(1, t / dur);
          hero.pos.set(from.x, from.y + (floorY - from.y) * k * k, from.z);
          if (!hit && k >= 1) {
            hit = true;
            hero.vel.set(0, 0, 0);
            hero.grounded = true;
            hero.state = 'ground';
            cam.addShake(0.3);
            emit('slam', { pos: hero.pos.clone() });
            emit('rumble', { strength: 0.8, duration: 0.25 });
            let n = 0;
            for (const e of alive()) {
              if (e.pos.distanceTo(hero.pos) > 3.6 || Math.abs(e.pos.y - hero.pos.y) > 1.5) continue;
              landHit('slam', e, { power: 1.6, launch: 4, word: n === 0 ? word('slam') : null, crit: n === 1, aerial: true });
              n++;
            }
            if (!n) stopOn(0.06, null);
          }
          return t > dur + 0.4;
        },
      };
    }

    // Grab the nearest goon and throw him in the stick direction: a shoulder throw (the combat
    // pack's throw, replacing a sword combo) with Batman turning into the throw over the grab
    // instead of spinning on the spot; the goon is carried at arm's length and let go on the
    // throw's contact frame. He bowls over anyone he hits.
    function grabThrow(target, ctx) {
      const result = resolveHit('throw', target);
      if (result.outcome === 'immune') {
        target.applyHit(result, hero.pos);
        emit('blocked', { move: 'throw', target, outcome: 'immune' });
        return null;
      }
      // Undo the damage for now; it lands when they hit the ground.
      target.health += result.damage;
      director.release(target.id);
      target.glyph = null;
      target.state = 'grabbed';
      const aim = inputDir(ctx, true).clone().setY(0).normalize();
      const aimYaw = Math.atan2(aim.x, aim.z);
      const g = graph();
      const clip = pickHad(moves.throw) ?? 'Sword_Heavy_Combo';
      const attInfo = clipInfo(clip), vicName = clip === 'Throw_Shoulder' ? 'Thrown_Shoulder' : null;
      const vicInfo = vicName ? clipInfo(vicName) : null;
      // anim2: the shoulder throw is a paired take (Throw_Shoulder + Thrown_Shoulder): both play on
      // the hero's clock from the grab (2.35 s), the goon held exactly where the take has him
      // relative to Batman (src/anim/paired.js), the pair turning from the goon toward the
      // stick over the grab so the throw goes where it is aimed; he is let go between the
      // shoulder hit and the slam (3.15 s) and flies, his clip carrying on as the fall.
      // (It used to play the clip from 3.95 s, after the take's slam, with the goon carried at
      // arm's length on a stand-in clip.)
      const paired = !!vicInfo?.pair && !!attInfo?.root && !!target.pairedStart?.(vicName, 2.35);
      const start = paired ? 2.35 : clip === 'Throw_Shoulder' ? 3.95 : 0;
      const speed = paired ? 1.7 : clip === 'Throw_Shoulder' ? 1.45 : 1.6;
      const releaseAt = paired ? 3.15 : clip === 'Throw_Shoulder' ? (attInfo?.events?.contact ?? 4.47) : 0.38 * speed;
      let t = 0, thrown = false;
      const startYaw = Math.atan2(target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
      hero.vel.set(0, 0, 0);
      g.play(clip, { state: 'strike', timeScale: speed, startAt: start, fade: 0.12, blend: 'inertial' });
      // The pair's yaw: at the grab, the one that puts the goon where he stands; at the release,
      // the one that sends the take's throw (the goon's path from grab to slam) along the stick.
      const rel = [0, 0], relEnd = [0, 0];
      let yaw0 = startYaw, yaw1 = aimYaw;
      if (paired) {
        pairRel(attInfo, vicInfo, start, rel);
        yaw0 = pairYawFor(rel, target.pos.x - hero.pos.x, target.pos.z - hero.pos.z);
        pairRel(attInfo, vicInfo, vicInfo.events?.down ?? 3.43, relEnd);
        yaw1 = aimYaw - Math.atan2(relEnd[0] - rel[0], relEnd[1] - rel[1]);
        moveRootUnderBlend(hero.bat, yaw0);
        moveRootUnderBlend(target.ch, yaw0, hero.pos.x + pairX(yaw0, rel[0], rel[1]), hero.pos.z + pairZ(yaw0, rel[0], rel[1]));
      } else if (target.ch.animator.has?.('Getting_Thrown')) target.ch.animator.play('Getting_Thrown', { once: true, timeScale: 1.2, fade: 0.08 });
      emit('grab', { target });
      const release = () => {
        thrown = true;
        target.state = 'down';
        target.down = true;
        target.downT = 2.4;
        if (paired) target.pairedRelease(aim.x * 12, 5.5, aim.z * 12, { thrown: true });
        else target.launch(aim.x * 12, 5.5, aim.z * 12, { thrown: true });
        target.thrownHits = new Set();
        target.pendingThrow = true;
        // Whoever threw him gets the hits he lands in flight and on landing.
        target.thrownBy = self;
        target.lastHitBy = self;
        combo.hit();
        stopOn(0.08, target);
        cam.addShake(0.12);
        emit('throwRelease', { target });
        emit('rumble', { strength: 0.5, duration: 0.15 });
        target.ch.headWorld(chest, -0.3);
        emit('word', { text: word('throw'), pos: chest.clone(), big: true });
      };
      const y0 = hero.pos.y;
      let c0 = start, releasedAt = 0;
      return {
        name: 'throw', combat: true, target, // [net2] target: an online guest locks him first
        canChain: () => thrown && (paired ? t - releasedAt > 0.15 : t > 0.7),
        update(dt) {
          t += dt;
          g.advance(dt);
          if (!thrown) {
            // From facing the goon to facing the throw, eased over the grab.
            const s = Math.min(1, Math.max(0, (g.time - start) / Math.max(0.05, releaseAt - start)));
            const e = s * s * (3 - 2 * s);
            if (paired) {
              const yaw = yaw0 + Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0)) * e;
              hero.bat.face(yaw);
              // Batman's own root motion in the take, then the goon where the take has him.
              rootMotionAt(attInfo, c0, rmA0); rootMotionAt(attInfo, g.time, rmA1);
              moveBy(pairX(yaw, rmA1[0] - rmA0[0], rmA1[1] - rmA0[1]), pairZ(yaw, rmA1[0] - rmA0[0], rmA1[1] - rmA0[1]), y0);
              pairRel(attInfo, vicInfo, g.time, rel);
              target.pos.set(hero.pos.x + pairX(yaw, rel[0], rel[1]), hero.pos.y, hero.pos.z + pairZ(yaw, rel[0], rel[1]));
              target.ch.face(yaw);
              target.pairedSeek(g.time);
            } else {
              const yaw = startYaw + Math.atan2(Math.sin(aimYaw - startYaw), Math.cos(aimYaw - startYaw)) * e;
              hero.bat.face(yaw);
              target.pos.set(hero.pos.x + Math.sin(yaw) * 0.9, hero.pos.y + Math.sin(s * Math.PI) * 0.6, hero.pos.z + Math.cos(yaw) * 0.9);
              target.ch.face(yaw + Math.PI);
            }
            if (g.time >= releaseAt || t > 1.2) release();
          }
          c0 = g.time;
          if (thrown && !releasedAt) releasedAt = t;
          // The paired take goes on into a ground-and-pound on a goon who has flown away: hand back
          // a beat after the release and let him rise out of it.
          return thrown && (paired ? t - releasedAt > 0.28 : t > 0.85);
        },
      };
    }

    // The hero's own hit reaction: chosen by where the blow came from and how hard, turned toward
    // the attacker for a front hit (over the first beat, not a snap), held until the clip's
    // `recover` (finding 9: it used to cut a 1.2-1.6 s clip at 0.38 s).
    function react(from, heavy, name = 'stagger') {
      let t = 0;
      const g = graph();
      const side = from ? hitSide(hero.bat.yaw, from.x, from.z, hero.pos.x, hero.pos.z) : 'front';
      const table = heavy ? moves.reactHeavy : moves.reactLight;
      const clip = pickHad(table[side]) ?? (heavy ? 'Hit_Knockback' : rng.chance(0.5) ? 'Hit_Chest' : 'Hit_Head');
      const pack = clip.startsWith('React_');
      const faceYaw = from && side === 'front' ? Math.atan2(from.x - hero.pos.x, from.z - hero.pos.z) : hero.bat.yaw;
      g.play(clip, { state: 'react', timeScale: pack ? 1.1 : 1.3, startAt: clip === 'Hit_Knockback' ? 0.15 : 0, fade: 0.12, blend: 'inertial' });
      // Old clips without a baked recover still hand back about where the old timer did.
      const cap = pack ? 1.2 : heavy ? 0.9 : 0.38;
      hero.vel.set(0, 0, 0);
      const recoverAt = clipInfo(clip)?.events?.recover ?? null;
      return { name, combat: true, flinches: 0, canChain: () => false,
        // Early in the reaction: a further light blow flinches on top of it (onAttackLand).
        early: () => pack && recoverAt !== null && g.clip === clip && g.time < recoverAt * 0.5,
        update(dt) {
          t += dt;
          g.advance(dt);
          hero.bat.face(turnToward(hero.bat.yaw, faceYaw, 14, dt));
          return (pack && g.passed('recover')) || t > cap;
        } };
    }
    function stagger(anim, dur, name = 'stagger') {
      let t = 0;
      const g = graph();
      g.play(anim, { state: 'react', timeScale: 1.3, fade: 0.12, blend: 'inertial' });
      return { name, combat: true, canChain: () => false, update(dt) { t += dt; g.advance(dt); return t > dur; } };
    }

    // The one way a hero goes down, whatever did it. With others still standing it is only this
    // player down (they can be revived: src/players/coopRules.js); the last one down is the old
    // heroDown (flow.js: the death comic and the checkpoint).
    function killHero() {
      if (hero.dead) return;
      hero.dead = true;
      hero.health = 0;
      hero.control = stagger('Death01', 99);
      if (fighters.some((f) => !f.hero.dead)) emit('playerDown', {});
      else emit('heroDown', {});
    }

    // ---- enemy attacks landing on this hero ----
    const HEAVY_ATTACKS = new Set(['brute', 'heavy', 'baton', 'sword', 'shieldBash', 'harleySlam', 'shock']);
    function onAttackLand(e, kind) {
      if (hero.dead) return;
      if (hero.invulnerable > 0) { emit('evaded', { e }); return; }
      const blocking = hero.blocking && kind !== 'charge' && kind !== 'grab';
      const dmg = hurtDamage(kind, { difficulty, blocking }, effects);
      hero.health = Math.max(0, hero.health - dmg);
      sinceHurt = 0;
      combo.damaged();
      punchChain = kickChain = 0;
      cam.addShake(blocking ? 0.08 : 0.2);
      emit('rumble', { strength: blocking ? 0.25 : 0.6, duration: blocking ? 0.08 : 0.18 });
      if (hero.control?.knockOff) { hero.control.knockOff(); hero.control = null; }
      emit('heroHurt', { kind, blocking, damage: dmg, from: e, pos: hero.pos.clone() });
      fear.note('heroHurt');
      if (hero.health <= 0) { killHero(); return; }
      if (blocking) {
        const g = graph();
        g.play(hasClip('Block_React') ? 'Block_React' : 'Idle_Shield_Break', { state: 'react', timeScale: 1.6, fade: 0.06, blend: 'inertial' });
        let t = 0;
        hero.control = { name: 'blockStagger', combat: true, canChain: () => false, update(dt) { t += dt; g.advance(dt); return t > 0.28; } };
        return;
      }
      if (kind === 'charge' || kind === 'grab') {
        hero.invulnerable = 1.6;
        const s = stagger('Hit_Knockback', 1.1);
        const origUpdate = s.update;
        let t = 0;
        s.update = (dt) => { t += dt; if (t > 0.9 && t - dt <= 0.9) graph().play('LayToIdle', { state: 'getup', timeScale: 1.6, fade: 0.15, blend: 'inertial' }); return origUpdate(dt) && t > 1.6; };
        hero.control = s;
      } else if (hero.control?.name === 'stagger' && hero.control.early?.() && !HEAVY_ATTACKS.has(kind) && (hero.control.flinches ?? 0) < 2) {
        // Still reeling early in the last reaction (anim2: one beating, not a strobe): the blow
        // lands as an additive flinch on the reaction already playing.
        const side = e?.pos ? hitSide(hero.bat.yaw, e.pos.x, e.pos.z, hero.pos.x, hero.pos.z) : 'front';
        if (hero.bat.animator.overlay?.('add', side === 'left' ? 'React_Flinch_L' : 'React_Flinch_R', { weight: 0.85, duration: 0.3 })) hero.control.flinches = (hero.control.flinches ?? 0) + 1;
        else hero.control = react(e?.pos ?? null, false);
      } else if (!hero.control || hero.control.combat) {
        hero.control = react(e?.pos ?? null, HEAVY_ATTACKS.has(kind));
      } else {
        // Mid-traversal (a ladder, a zip line): a flinch layered on top instead of a full reaction.
        const side = e?.pos ? hitSide(hero.bat.yaw, e.pos.x, e.pos.z, hero.pos.x, hero.pos.z) : 'front';
        hero.bat.animator.overlay?.('add', side === 'left' ? 'React_Flinch_L' : 'React_Flinch_R', { weight: 0.8, duration: 0.3 });
      }
    }

    // A rifle goon aiming at this hero fires (enemy.js): muzzle and aim point for the tracer and
    // the crack. The vectors are reused on every shot, so listeners copy them. `lands` is
    // enemy.js's own gate (it sees the hero and he is within 32 m): hit is true exactly when
    // onAttackLand will deal damage.
    const shotFrom = new THREE.Vector3(), shotTo = new THREE.Vector3();
    const shot = withPlayer({ from: shotFrom, to: shotTo, target: null, hit: false }, player);
    function onRifleFire(e, lands = true) {
      // The hero is down: the squad holds its fire (no tracer, no crack) until he is back up.
      if (hero.dead) return;
      if (e.ch.muzzle) e.ch.muzzle.getWorldPosition(shotFrom);
      else e.ch.headWorld(shotFrom, -0.2);
      shotTo.set(hero.pos.x, hero.pos.y + (hero.crouched ? 0.7 : 1.1), hero.pos.z);
      shot.target = e;
      shot.hit = lands && !hero.dead && hero.invulnerable <= 0;
      // A miss (a warning shot, or out of range) goes wide: past his shoulder, not through him.
      if (!lands) {
        const dx = shotTo.x - shotFrom.x, dz = shotTo.z - shotFrom.z, d = Math.hypot(dx, dz) || 1;
        shotTo.x += (-dz / d) * 0.8;
        shotTo.z += (dx / d) * 0.8;
        shotTo.y += 0.35;
      }
      emit('rifleShot', shot);
    }

    function tryStart(action, ctx) {
      const chain = chainForAction(action);
      // [onboard] A capability the story hasn't given yet simply doesn't fire (no hint spam).
      if (chain) return can(hero, 'chainTakedown') ? startChain(chain, ctx) : false;
      if (action === 'chain4') return can(hero, 'batSwarm') ? startSwarm(ctx) : false;
      // The fire key uses whatever gadget is equipped (src/gadgets/gadgetSystem.js).
      if (action === 'batarang' && gadgetHook) return can(hero, 'gadgets') ? gadgetHook(ctx, { inAir: hero.state === 'air' || hero.state === 'glide' }) : false; // [onboard] a locked belt
      // Predator stealth (src/stealth/stealthSystem.js): a silent takedown from behind, or a perch drop.
      if (stealthStartHook && (action === 'punch' || action === 'kick') && can(hero, 'silentTakedown') && stealthStartHook(action, ctx)) return true;
      const inAir = hero.state === 'air' || hero.state === 'glide';
      const all = alive().filter((e) => e.state !== 'grabbed');
      const list = action === 'block' ? all : all.filter(canSee);
      if (action === 'block') {
        // Counters answer the wind-ups coming at this hero (in single player: every wind-up).
        const windups = list.filter((e) => e.state === 'windup' && e.def.counterable && e.pos.distanceTo(hero.pos) < 7.5 && aimedAtMe(e))
          .sort((a, b) => a.pos.distanceTo(hero.pos) - b.pos.distanceTo(hero.pos)).slice(0, 2);
        if (windups.length && !inAir && can(hero, 'counter')) { hero.control = counter(windups); return true; }
        const brute = list.find((e) => e.state === 'windup' && !e.def.counterable && e.pos.distanceTo(hero.pos) < 7.5);
        if (brute) emit('hint', { id: 'brute-counter' });
        return false;
      }
      if (action === 'punch' || action === 'kick') {
        if (inAir) {
          const target = selectAttackTarget(hero.pos, inputDir(ctx), list, { range: 16, focus });
          if (target && target.pos.y <= hero.pos.y + 1 && (hero.state === 'glide' ? can(hero, 'diveBomb') : can(hero, 'aerialAttacks'))) { // [onboard] gate
            const mv = hero.state === 'air' ? pickMove(action, target, ctx, true) : null;
            if (mv?.air) { hero.control = airKick(target, 'jumpKick', mv); return true; }
            if (hero.state === 'glide' || action === 'kick') {
              hero.control = airKick(target, hero.state === 'glide' ? 'diveBomb' : 'jumpKick');
              return true;
            }
          }
          // Punch in the air with nobody to kick: hammer down.
          if (action === 'punch' && hero.state === 'air' && engaged().length && can(hero, 'groundPound')) { hero.control = airSlam(); return true; }
          return false;
        }
        // Auto-attach: any goon within 14 m is fair game, so a press never whiffs in a fight.
        const target = selectAttackTarget(hero.pos, inputDir(ctx), list, { range: 14, focus, allowDown: true });
        if (!target) { if (engaged().length) { hero.control = whiff(); return true; } return false; }
        // Predator stealth: in a quiet room, a punch on a goon who hasn't noticed Batman is swallowed.
        if (stealthHoldHook && stealthHoldHook(action, target)) return true;
        if (target.down && target.alive && !target.air && action === 'punch') emit('groundTakedown', { target });
        hero.control = strike(action, target, pickMove(action, target, ctx, false));
        return true;
      }
      if (action === 'throw' && !inAir && can(hero, 'throw')) {
        const target = selectTarget(hero.pos, inputDir(ctx), list.filter((e) => !e.down), { range: 3.2, maxAngle: 1.6 });
        if (!target) return false;
        const ctl = grabThrow(target, ctx);
        if (ctl) { hero.control = ctl; return true; }
        return false;
      }
      if (action === 'cape' && !inAir && can(hero, 'capeStun')) { hero.control = capeStun(); return true; }
      if (action === 'batarang') {
        const target = selectTarget(hero.pos, inputDir(ctx, true), list, { range: 26, maxAngle: 1.2 });
        if (target) { hero.control = batarang([target], ctx.fx); return true; }
        return false;
      }
      if (action === 'dodge' && !inAir && can(hero, 'dodge')) { hero.control = dodge(ctx); return true; }
      if (action === 'special') {
        const finisher = list.find((e) => e.finishable && e.pos.distanceTo(hero.pos) < 9);
        if (finisher) { hero.control = special(finisher); return true; }
        if (!can(hero, 'specialTakedown')) return false; // [onboard] a staggered boss above still takes the finish
        if (!combo.ready) { emit('hint', { id: 'special-locked' }); return false; }
        const target = selectTarget(hero.pos, inputDir(ctx), list.filter((e) => !e.def.boss), { range: 9 });
        if (target) { hero.control = special(target); return true; }
      }
      return false;
    }
    // Whether a wind-up is coming at this hero. One fighter: every wind-up is (aggro is always it).
    const aimedAtMe = (e) => fighters.length === 1 || !e.aggro || e.aggro === self;
    const inAirNow = () => hero.state === 'air' || hero.state === 'glide';

    // A dive-bomb impact: knocks down every downable goon in range. Armored enemies (brutes)
    // shrug it off via the same immunity resolveHit already gives them (unless stunned), and
    // the boss is excluded outright so neither can be one-shot by it.
    function shockwave(center, radius = 4, { crit = true, word } = {}) {
      let n = 0;
      let first = null;
      for (const e of enemies) {
        if (!e.alive || e.down || e.def.boss || !inShockwave(center, e.pos, radius)) continue;
        const result = resolveHit('diveBomb', e);
        const wasAttacking = e.applyHit(result, center, { power: 1.6, launch: 6 });
        if (wasAttacking) director.release(e.id);
        if (result.outcome === 'immune' || result.outcome === 'parried') continue;
        e.lastHitBy = self;
        if (!first) first = e;
        n += 1;
      }
      emit('diveImpact', { pos: center.clone(), count: n, word });
      if (first && crit) critical(first);
      return n;
    }

    // An instant KO from a ledge, drop, perch or silent takedown: no fight, just (unless it is a
    // quiet one) an action shot. Same wasAttacking/director.release bookkeeping as landHit, so a
    // takedown on a goon that was mid-windup or mid-attack still frees its director slot.
    function takedown(e, kind, { crit = true } = {}) {
      if (!e?.alive) return false;
      squadNote.takedown(e, kind);
      e.health = 0;
      const wasAttacking = e.applyHit({ outcome: 'ko' }, hero.pos);
      if (wasAttacking) director.release(e.id);
      if (crit) critical(e, { slow: 0.7 });
      emit('takedown', { kind, pos: e.pos.clone(), target: e });
      return true;
    }

    // ---- chain takedowns ----

    // The hooks a chain lands its steps through (chainControl.js), so chains share this file's hit
    // bookkeeping: director slots, combo, impact events, hit-stop, critical and shockwave.
    // `run` is optional: a caller with no run of its own gets a no-op for the run bookkeeping below
    // rather than a throw. startChain and startSwarm (the Bat Swarm, Plan 5FG) both pass theirs, so
    // checkChainDropped can tell a finished run from one cut short.
    function chainApi(ctx, run = null) {
      // A chain's hit-stops freeze the hero and the goons in the chain (src/core/time.js).
      const chainTime = { hitStop: (sec) => time.hitStop(sec, run ? [hero, ...run.targets] : [hero]) };
      return {
        events: { emit, on: events.on }, time: chainTime, collision: hero.collision, fx: ctx.chainFx ?? null, player,
        enemies: () => enemies,
        hold(e) { e.chainHold(); director.release(e.id); },
        // Only a chain that plays to its end releases its targets itself.
        release(e) { if (run) run.over = true; e.chainRelease(); },
        stagger(e) {
          push.set(e.pos.x - hero.pos.x, 0, e.pos.z - hero.pos.z);
          if (push.lengthSq() > 1e-6) e.pos.addScaledVector(push.normalize(), 0.25);
          hero.collision.resolveCylinder(e.pos, e.radius, 1.8 * e.scale);
          e.ch.animator.play(rng.chance(0.5) ? 'Hit_Chest' : 'Hit_Head', { once: true, timeScale: 1.4, fade: 0.05 });
          combo.hit();
          cam.addShake(0.08);
          e.ch.headWorld(chest, -0.3);
          emit('impact', { pos: chest.clone(), move: 'chain', outcome: 'hit', target: e, crit: false });
        },
        finish: finishTarget,
        tie(list) {
          // No combo.hit() here: the stagger hits already paid for landing the chain, and a tie
          // that refunded its own cost too made Rope-a-Dope net free (ruling: chains always cost
          // something).
          for (const e of list) { e.tie(list, CHAIN_RULES.tiedTime); director.release(e.id); }
          emit('chainTied', { count: list.length });
        },
        critical,
        shockwave,
        // chainControl passes a vector it reuses: the event gets its own copy.
        word(text, pos, big = false) { emit('word', { text, pos: pos.clone(), big }); },
      };
    }

    // Returns true when the press is used up: a chain started, or a hint said why not.
    function startChain(chain, ctx) {
      if (hero.state !== 'ground' || !hero.grounded) return false;
      const discount = getChainDiscount();
      const k = chain.n - 1;
      const avail = chainAvailability({ combo: combo.value, origin: hero.pos, enemies, discount });
      if (!avail.affordable[k]) {
        const why = !avail.show ? 'chain-locked' : !avail.stealth && combo.value < avail.costs[k] ? 'chain-cost' : 'chain-targets';
        // The costs behind the hint, so a future discount doesn't leave the copy hardcoded (5FG).
        emit('hint', { id: why, arg: avail.costs });
        return true;
      }
      const targets = selectChainTargets(hero.pos, inputDir(ctx), enemies, { canSee, onlyUnaware: avail.stealth });
      if (!targets) { emit('hint', { id: 'chain-targets' }); return true; }
      if (!avail.stealth) combo.take(chainCost(chain, discount));
      const timeline = buildChainTimeline(chain.id, targets.length, BEATS);
      // Everyone else waits: wind-ups in progress are called off and nobody starts one mid-chain.
      // A boss never shares `enemies` with goons today, but skip it on principle: its state is its
      // own fight's, never the chain's to rewrite.
      for (const e of alive()) {
        if (targets.includes(e) || e.def?.boss) continue;
        if (e.state === 'windup') { director.release(e.id); e.glyph = null; e.state = 'engage'; }
        director.hold(e.id, timeline.duration + 0.6);
      }
      // `prior`: Batman's invulnerability before the chain raised it; `t`: game time since the start.
      const run = { ctl: null, chain: chain.id, targets, over: false, prior: hero.invulnerable, t: 0 };
      run.ctl = createChainControl(hero, chainApi(ctx, run), { chain, targets, stealth: avail.stealth, timeline });
      hero.control = run.ctl;
      chainRun = run;
      emit('chainStart', { chain: chain.id, count: targets.length, stealth: avail.stealth, ids: targets.map((e) => e.id) });
      return true;
    }

    // The Bat Swarm (chain 4, WayneTech). Returns true when the press is used up. It runs as a chain
    // run too, so a swarm cut short (a teleport, a respawn) lets its goons go like any chain.
    function startSwarm(ctx) {
      if (!effects.batSwarm) { emit('hint', { id: 'swarm-locked' }); return true; }
      if (hero.state !== 'ground' || !hero.grounded) return false;
      const cost = chainCost(SWARM, getChainDiscount());
      if (combo.value < cost) { emit('hint', { id: 'swarm-cost', arg: cost }); return true; }
      const targets = swarmTargets(hero.pos, enemies, { canSee });
      if (!targets) { emit('hint', { id: 'swarm-targets' }); return true; }
      combo.take(cost);
      const timeline = swarmTimeline(targets.length);
      // As in startChain: a boss's state is its own fight's, never the swarm's to rewrite.
      for (const e of alive()) {
        if (targets.includes(e) || e.def?.boss) continue;
        if (e.state === 'windup') { director.release(e.id); e.glyph = null; e.state = 'engage'; }
        director.hold(e.id, timeline.duration + 0.6);
      }
      const run = { ctl: null, chain: SWARM.id, targets, over: false, prior: hero.invulnerable, t: 0 };
      hero.invulnerable = Math.max(hero.invulnerable, timeline.duration + 0.2);
      run.ctl = createSwarmControl(hero, chainApi(ctx, run), { targets, timeline, fx: ctx.swarmFx ?? null });
      hero.control = run.ctl;
      chainRun = run;
      emit('swarmStart', { count: targets.length });
      return true;
    }

    // Something took hero.control away from a chain before it finished (a teleport after a fall
    // into the water, a respawn, the finale): let go of every goon still held, rather than leave
    // them frozen until enemy.js's 5 s failsafe.
    function checkChainDropped() {
      if (!chainRun || hero.control === chainRun.ctl) return;
      const run = chainRun;
      chainRun = null;
      // A swarm's bats leave with it, however it ended.
      run.ctl.fx?.stop();
      if (run.over) return;
      for (const e of run.targets) e.chainRelease();
      // Give back only what the chain added (what he had before, less the time since, or the usual
      // 0.3 s grace). A control that took over owns its own invulnerability: leave it alone.
      if (!hero.control) hero.invulnerable = Math.min(hero.invulnerable, Math.max(run.prior - run.t, 0.3));
      emit('chainBroken', { chain: run.chain });
    }

    // The per-hero half of a combat frame: combo and chain timers, the input buffer, starting a
    // move, holding block. `dt` is this hero's own (a hit-stop on him freezes only him in co-op).
    let bufferHeld = 0;
    function update(dt, ctx) {
      sinceHurt += dt;
      // Out-of-combat regeneration by difficulty (story: quick and full; knightmare: none).
      if (!hero.dead && hero.health < hero.maxHealth) hero.health = regenStep(difficulty, { health: hero.health, max: hero.maxHealth, sinceHurt, inCombat: engaged().length > 0 }, dt);
      checkChainDropped();
      if (chainRun) chainRun.t += dt;
      // Spec Part E1: a chain spends that much combo and keeps the rest. The 1.5 s window on its
      // own can't tell "the player stopped hitting things" from "a Rope-a-Dope's tether-and-yank
      // lead-in is playing", so pausing the timeout for the length of the chain control (name
      // 'chain') is what actually keeps the rest, rather than relying on every chain's contact
      // hits to happen to land inside 1.5 s of each other. It resumes the moment the chain ends
      // or is dropped, since hero.control stops being 'chain' either way before this runs.
      // The Bat Swarm (control name 'swarm', Plan 5FG) is a chain run too and keeps the rest the
      // same way.
      const ctlName = hero.control?.name;
      if (ctlName !== 'chain' && ctlName !== 'swarm') combo.tick(dt);
      availT -= dt;
      if (availT <= 0 || combo.value !== availCombo) {
        availT = 0.1;
        availCombo = combo.value;
        chainAvail = can(hero, 'chainTakedown') ? chainAvailability({ combo: combo.value, origin: hero.pos, enemies, discount: getChainDiscount() }) : chainsLocked; // [onboard]
        swarmAvail = swarmAvailability({ owned: effects.batSwarm && can(hero, 'batSwarm'), combo: combo.value, origin: hero.pos, enemies, discount: getChainDiscount() });
      }
      chainT -= dt;
      if (chainT <= 0) { punchChain = 0; kickChain = 0; }
      if (!ctx) return;
      // Buffer the latest press so freeflow chains feel responsive, e.g. a block/counter tap
      // or an attack press during a grapple, ladder, zip or wall run fires the moment that
      // control lets go. A press a traversal control acts on itself (the ledge takedown's own
      // punch, the glide dive-bomb's kick) is cleared via consumeInput() right where that
      // control consumes it, so it can't also fire a real move later.
      // Nothing is buffered while the gadget wheel is open (ctx.lockInput).
      if (!ctx.lockInput) for (const a of ACTIONS) if (ctx.input.pressed(a)) inputBuffer.press(a);
      // A press made during a strike that cannot chain yet waits for it (up to 0.5 s) instead of
      // aging out: a travel strike's approach outlasted the 0.3 s buffer and the press was lost
      // (anim2: the 10-press freeflow chain landed 9).
      const strikeBusy = hero.control?.name === 'strike' && !hero.control.canChain();
      bufferHeld = inputBuffer.value && strikeBusy ? bufferHeld + dt : 0;
      inputBuffer.tick(strikeBusy && bufferHeld <= 0.5 ? 0 : dt);
      const buffer = inputBuffer.value;
      const ctl = hero.control;
      // A block tapped during a strike's wind-up counters an incoming attack instead of
      // waiting for the strike to finish: the strike is dropped before its contact frame.
      const counterCut = buffer === 'block' && ctl?.name === 'strike' && ctl.interruptible?.() && !inAirNow()
        && alive().some((e) => e.state === 'windup' && e.def.counterable && e.pos.distanceTo(hero.pos) < 7.5 && aimedAtMe(e));
      const free = !hero.dead && (!ctl || (ctl.combat && ctl.canChain()) || counterCut);
      // A buffered kick belongs to hero.js's own dive trigger (not the old target-seeking
      // jump-kick/diveBomb here) only when the dive will actually fire this frame, or while
      // one is already in progress. Below the height threshold the old air kick still runs.
      const glideKick = buffer === 'kick' && (shouldDiveBomb(hero.state, hero.heightAboveGround()) || ctl?.name === 'dive');
      if (!ctx.lockInput && buffer && free && hero.state !== 'roll' && ctl?.name !== 'grapple' && !glideKick) {
        if (tryStart(buffer, ctx)) inputBuffer.consume(buffer);
      }
      // Hold block to guard when nothing else is going on (not under the open gadget wheel).
      hero.blocking = !ctx.lockInput && (!hero.control || hero.control.name === 'blockStagger') && hero.grounded && ctx.input.down('block') && engaged().length > 0;
    }

    // What hero.combat is for this hero (hero.js, the traversal controls, gadgets): the same
    // shape as the combat object, answering for this fighter.
    const gadgetApi = { landHit, areaBlast, canSee, inputDir, alive, director, critical, batarang, faceTo };
    // [prog] gadgets: the disruptor and the EMP mine jam a goon's weapon for `sec` (sec <= 0 ends
    // it). A gun can't be fired (no attack token: he backs off fiddling with it; an aim in progress
    // is called off), a stun baton loses its charge until the jam ends. Returns whether it took.
    gadgetApi.jam = (e, sec) => {
      if (!e?.alive || e.def?.boss) return false;
      if (!(sec > 0)) { e.jamT = 0; if (e.weapon === 'baton' && e.def.shock) e.charged = true; return true; }
      if (!e.def.ranged && !e.charged) return false;
      e.jamT = sec;
      if (e.def.ranged) {
        if (e.state === 'windup') { director.release(e.id); e.glyph = null; e.state = 'engage'; }
        e.backoffT = Math.max(e.backoffT ?? 0, sec);
      }
      e.charged = false;
      return true;
    };
    const api = {
      combo, director, shockwave, takedown, killHero, gadgetApi, player,
      consumeInput(action) { inputBuffer.consume(action); },
      get enemies() { return enemies; },
      get active() { return engaged().length > 0; },
      get cameraMode() { return hero.control?.camera ?? (engaged().some((e) => e.pos.distanceTo(hero.pos) < 14) ? 'combat' : null); },
      get chains() { return chainAvail; },
      get swarm() { return swarmAvail; },
    };
    self = {
      player, hero, combo, inputBuffer, api, gadgetApi,
      update, onAttackLand, onRifleFire, killHero, landHit, takedown, shockwave, critical,
      applyEffects() { combo.setReady(effects.specialAt); combo.setShield(effects.comboShield + 1); },
      // Read by tests and the HUD: the chain counters, the focus target, the chain in progress.
      get punchChain() { return punchChain; },
      get kickChain() { return kickChain; },
      get focus() { return focus; },
      get chainRun() { return chainRun; },
      get chains() { return chainAvail; },
      get swarm() { return swarmAvail; },
      get cameraMode() { return api.cameraMode; },
    };
    return self;
  }

  // ---------------- the shared half ----------------
  // Squad AI (workstream I): rings and slots around each hero, fear and morale, medics,
  // lieutenants, weapons on the floor. src/enemies/squad.js and fear.js are the pure parts.
  const planner = createSquadPlanner();
  let fear = createFear({ rng, bias: reputation.fearBias(), gain: () => effects.fearGain ?? 1 }); // [verify] fearGain
  const planPlayers = [];
  const squadBuf = [];
  const drops = [];
  let planT = 0, moodT = 0, reinforced = false, lastStandingNoted = false;
  const bark = (table, e, chance = 1) => { if (chance >= 1 || rng.chance(chance)) events.emit('bark', { table, pos: e?.pos ?? null, speaker: `goon${e?.id ?? ''}` }); };
  // What the fighters tell the squad (KOs, takedowns, combos): fear, reputation, hesitation.
  const squadNote = {
    ko(target) {
      const wit = [];
      for (const o of enemies) if (o !== target && o.alive && o.pos.distanceTo(target.pos) < 15) { wit.push(o.id); if (o.pos.distanceTo(target.pos) < 6 && o.state === 'engage') o.backoffT = 0.8 + rng.next() * 0.8; }
      fear.note('ko', { witnesses: wit });
      fear.leave(target.id);
      reputation.add('ko', 1, target.gang ?? null);
      if (target.type === 'lieutenant') { fear.note('lieutenantDown'); bark('goon.squad.lieutenantDown', enemies.find((o) => o.alive && o !== target)); }
      else if (wit.length) bark('goon.down', enemies.find((o) => o.alive && o.id === wit[0]), 0.35);
    },
    takedown(e, kind) {
      fear.note(kind === 'silent' || kind === 'ledge' || kind === 'perch' || kind === 'drop' ? 'silentTakedown' : 'ko', { id: e.id });
      reputation.add(kind === 'silent' ? 'silentTakedown' : 'ko', 1);
    },
    combo(n) { fear.note('combo', { n }); if (n >= 15) reputation.add('comboBig', 1); },
  };
  events.on?.('batarangHit', (d) => { if (d?.target && !d.target.aware) fear.note('gadgetFromDark', { id: d.target.id }); });
  events.on?.('weaponDrop', (d) => {
    if (!d?.pos || drops.length > 8) return;
    drops.push({ kind: d.kind, x: d.pos.x, y: d.pos.y, z: d.pos.z, taken: false, t: 0, onTaken: d.onTaken ?? null });
  });
  events.on?.('revived', (d) => { fear.note('revive'); if (d?.target) fear.join(d.target.id, { base: 0.4 }); });

  // The squad pass, ten times a second: slots, next in line, medics, pickups, lieutenants.
  function planSquad() {
    planPlayers.length = 0;
    for (let i = 0; i < fighters.length; i++) {
      const h = fighters[i].hero;
      let p = planCache[i];
      if (!p) { p = { key: 0, x: 0, z: 0, yaw: 0 }; planCache[i] = p; }
      p.key = fighters[i].player?.id ?? i; p.x = h.pos.x; p.z = h.pos.z; p.yaw = h.bat?.yaw ?? 0;
      planPlayers.push(p);
    }
    squadBuf.length = 0;
    let alive = 0, lieutenant = null;
    for (const e of enemies) {
      if (!e.alive || !e.aware || e.down || e.def?.boss || e.type === 'harley') continue;
      alive += 1;
      if (e.type === 'lieutenant') lieutenant = e;
      e.targetKey = aggroOf(e).player?.id ?? 0;
      e.holdsToken = director.active.has(e.id);
      e.nextInLine = false;
      squadBuf.push(e);
    }
    // The next in line for each hero: the nearest melee goon without a token (he flanks).
    for (const p of planPlayers) {
      let best = null, bd = Infinity;
      for (const e of squadBuf) {
        if (e.holdsToken || e.ranged || e.targetKey !== p.key) continue;
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        if (d < bd) { bd = d; best = e; }
      }
      if (best) best.nextInLine = true;
    }
    planner.plan(planPlayers, squadBuf);
    // Steal: a goon already in the inner ring takes the token of one still walking in from far.
    for (const holder of squadBuf) {
      if (!holder.holdsToken || holder.state !== 'approach') continue;
      const hp = planPlayers.find((p) => p.key === holder.targetKey) ?? planPlayers[0];
      const hd = Math.hypot(holder.pos.x - hp.x, holder.pos.z - hp.z);
      for (const c of squadBuf) {
        if (c === holder || c.holdsToken || c.state !== 'engage' || c.targetKey !== holder.targetKey || c.ranged) continue;
        const cd = Math.hypot(c.pos.x - hp.x, c.pos.z - hp.z);
        if (shouldSteal({ holdsToken: true, dist: hd }, { holdsToken: false, ring: c.ring, dist: cd }) && director.steal?.(holder.id, c.id)) {
          holder.state = 'engage'; holder.t = 0;
          const f = aggroOf(c);
          const dd = DIFFICULTY[difficulty];
          c.startWindup(Math.max(dd.windup, (dd.tellMin ?? 0) - STRIKE_LAND_TIME) + (c.def.counterable ? effects.counterWindow : 0), f.hero, { warn: dd.counterWarnings !== false });
          break;
        }
      }
    }
    const smart = DIFFICULTY[difficulty]?.smart ?? 0.6;
    // Medics: to the nearest knocked-out goon (a priority target while they work).
    for (const m of squadBuf) {
      if (m.type !== 'medic' || m.state !== 'engage' || m.holdsToken) continue;
      let body = null, bd = 12;
      for (const o of enemies) {
        if (o.alive || o.state !== 'ko' || o.fled || o.shattered || o.air || o.def?.boss || o.koT > 25) continue;
        if (enemies.some((x) => x.reviving === o)) continue;
        const d = o.pos.distanceTo(m.pos);
        if (d < bd) { bd = d; body = o; }
      }
      if (body && rng.chance(0.3 + 0.5 * smart) && m.startRevive(body)) bark('goon.squad.medic', m);
    }
    // Weapons on the floor: an unarmed goon in the outer ring goes for one.
    for (const d of drops) {
      if (d.taken) continue;
      let pick = null, pd = 9;
      for (const e of squadBuf) {
        if (e.weapon || e.ranged || e.holdsToken || e.state !== 'engage' || e.ring === 'inner' || e.type === 'brute' || e.type === 'heavy' || e.type === 'shield') continue;
        const dd = Math.hypot(e.pos.x - d.x, e.pos.z - d.z);
        if (dd < pd) { pd = dd; pick = e; }
      }
      if (pick && rng.chance(smart) && pick.startPickup(d)) bark('goon.squad.pickup', pick, 0.5);
    }
    // The lieutenant calls for backup once, when the squad is down to its last few.
    if (lieutenant && !reinforced && alive <= 3 && enemies.length >= 4) {
      reinforced = true;
      bark('goon.squad.backup', lieutenant);
      fear.note('reinforcements');
      events.emit('callReinforcements', { pos: lieutenant.pos.clone(), count: difficulty === 'story' ? 1 : difficulty === 'normal' ? 2 : 3, type: 'grunt' });
    }
    // The last one standing.
    if (alive === 1 && !lastStandingNoted && enemies.length > 1) { lastStandingNoted = true; fear.note('lastStanding'); }
  }
  const planCache = [];
  // Morale, a few times a second: each goon free to choose reads its fear (src/enemies/fear.js).
  function moods() {
    let alive = 0, lieutenant = false;
    for (const e of enemies) if (e.alive && e.aware && !e.def?.boss) { alive += 1; if (e.type === 'lieutenant' && !e.down) lieutenant = true; }
    for (const e of enemies) {
      if (!e.alive || !e.aware || e.def?.boss || e.type === 'harley' || e.down || e.air) continue;
      if (e.state !== 'engage' && e.state !== 'surrender') continue;
      if (e.state === 'surrender') continue;
      const mood = fear.decide(e.id, { alone: alive === 1, armed: !!e.weapon, lieutenant: lieutenant && e.type !== 'lieutenant' });
      const before = e.mood;
      e.setMood?.(mood, fear.effects(mood));
      if (mood !== before) {
        if (mood === 'surrender') { bark('goon.afraid', e); reputation.add('surrender', 1); }
        else if (mood === 'flee') { bark('goon.squad.flee', e); reputation.add('flee', 1); }
        else if (mood === 'dropWeapon') bark('goon.afraid', e, 0.5);
      }
    }
  }
  // A surrendered goon is zip-tied when a hero walks up to him (or punches him).
  function zipTies() {
    for (const e of enemies) {
      if (!e.alive || e.state !== 'surrender') continue;
      for (const f of fighters) {
        if (f.hero.dead || f.hero.pos.distanceTo(e.pos) > 1.7) continue;
        f.takedown(e, 'zipTie', { crit: false });
        events.emit('word', { text: 'ZIP!', pos: e.pos.clone().setY(e.pos.y + 1.4) });
        events.emit('zipTie', withPlayer({ target: e }, f.player));
        break;
      }
    }
  }
  // Thrown goons hurt whoever they fly into, and themselves on landing: credited to the thrower.
  const throwerOf = (e) => e.thrownBy ?? fighters[0];
  function onThrownFly(e) {
    for (const o of alive()) {
      // Horizontal reach, with some vertical slack: a body in flight is above the other's feet.
      if (o === e || e.thrownHits?.has(o.id) || Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z) > 1.4 || Math.abs(o.pos.y - e.pos.y) > 2.2) continue;
      e.thrownHits.add(o.id);
      throwerOf(e).landHit('thrownInto', o, { power: 1.5, launch: 3.5, crit: e.thrownHits.size === 2 });
    }
  }
  function onLanded(e, drop) {
    if (e.pendingThrow) {
      e.pendingThrow = false;
      if (e.alive) throwerOf(e).landHit('throw', e, { power: 0.5 });
    }
    if (drop > 4 && e.alive) {
      // Knocked off a roof: out of the fight.
      e.health = 0;
      e.applyHit({ outcome: 'ko' }, e.pos);
      const by = e.lastHitBy ?? fighters[0];
      events.emit('ko', withPlayer({ target: e }, by.player));
      events.emit('word', { text: 'WHUMP!', pos: e.pos.clone().setY(e.pos.y + 1) });
      if (engaged().length === 0) events.emit('lastHit', withPlayer({ target: e }, by.player));
    }
  }
  // An enemy's blow resolves against the hero it went after (its aggro, fixed for the attack).
  const aggroOf = (e) => (fighters.length === 1 ? fighters[0] : e.aggro ?? fighters[0]);
  function onAttackLand(e, kind) { aggroOf(e).onAttackLand(e, kind); }
  function onAttackEnd(e) { director.release(e.id); }
  function onRifleFire(e, lands) { aggroOf(e).onRifleFire(e, lands); }

  // How many enemies are on each fighter (spreading attackers: src/players/targeting.js).
  const load = new Map();
  const loadOf = (f) => load.get(f) ?? 0;
  function retarget(e) {
    if (fighters.length === 1) { e.aggro = fighters[0]; return; }
    // The target stays fixed from the wind-up until recovery (and while held or down).
    if (e.aggro && (e.state === 'windup' || e.state === 'attack' || e.countered)) return;
    const next = pickTarget(e, fighters, { current: e.aggro ?? null, lastHitBy: e.lastHitBy ?? null, load: loadOf });
    if (next !== e.aggro) {
      if (e.aggro) load.set(e.aggro, loadOf(e.aggro) - 1);
      load.set(next, loadOf(next) + 1);
      e.aggro = next;
    }
  }

  // One context object handed to every enemy's update, re-pointed at the hero that enemy is on.
  const ectx = { hero: null, target: null, others: enemies, onAttackLand, onAttackEnd, onThrownFly, onLanded, onRifleFire };
  const ready = [], readyPool = [];
  function updateEnemies(dt) {
    ectx.others = enemies;
    fear.tick(dt);
    for (const e of enemies) if (!e.alive && e.state === 'ko') e.koT = (e.koT ?? 0) + dt;
    for (const d of drops) d.t += dt;
    planT -= dt;
    if (planT <= 0) { planT = 0.1; planSquad(); }
    moodT -= dt;
    if (moodT <= 0) { moodT = 0.5; moods(); }
    zipTies();
    load.clear();
    if (fighters.length > 1) for (const e of enemies) if (e.alive && e.aggro) load.set(e.aggro, loadOf(e.aggro) + 1);
    ready.length = 0;
    for (const e of enemies) {
      if (e.alive) retarget(e);
      const f = aggroOf(e);
      ectx.hero = f.hero;
      ectx.target = f.player;
      e.update(time.dtFor ? time.dtFor(e, dt) : dt, ectx);
      if (e.aware) {
        const h = f.hero;
        // Pooled entries (no allocation per enemy per frame).
        let r = readyPool[ready.length];
        if (!r) { r = { id: '', ready: false, target: undefined, cost: 1, ranged: false }; readyPool.push(r); }
        r.id = e.id; r.ready = e.ready(h) && !h.dead && !UNREACHABLE.includes(h.control?.name); r.target = fighters.length > 1 ? f : undefined; r.cost = tokenCost(e); r.ranged = !!e.def.ranged;
        ready.push(r);
      }
    }
    for (const id of director.tick(dt, ready)) {
      const e = enemies.find((x) => x.id === id);
      if (e) {
        // The tell: the tier's wind-up, never shorter than its minimum telegraph (fairness rule),
        // longer with WayneTech's Quick Reflexes; knightmare hides the glyph, not the motion.
        const dd = DIFFICULTY[difficulty];
        const windup = Math.max(dd.windup, (dd.tellMin ?? 0) - STRIKE_LAND_TIME) + (e.def.counterable ? effects.counterWindow : 0);
        e.startWindup(windup, aggroOf(e).hero, { warn: dd.counterWarnings !== false });
        // An attack from behind the hero is called out (the glyph still shows it: fair, not cheap).
        const h = aggroOf(e).hero;
        if (h && !e.def.ranged && hitSide(h.bat?.yaw ?? 0, e.pos.x, e.pos.z, h.pos.x, h.pos.z) === 'back') bark('goon.squad.flank', e, 0.3);
        if (e.def.ranged) events.emit('rifleAim', withPlayer({ target: e }, aggroOf(e).player));
      }
    }
    for (const e of enemies) if (!e.alive || !TOKEN_STATES.has(e.state)) { if (director.active.has(e.id) && e.state !== 'attack') director.release(e.id); }
  }

  function addPlayer(player) {
    // The hero's graph from the start, so dead blending records its pose before the first move
    // (traversal transitions use it too).
    if (player.hero?.bat?.animator) graphFor(player.hero.bat, { events, actor: player.hero, who: 'hero' });
    const f = makeFighter(player);
    fighters.push(f);
    // hero.combat is what hero.js and the traversal controls call (takedowns, dive-bombs): player
    // 0 keeps the combat object itself, every other hero its own fighter's api.
    if (fighters.length > 1) player.hero.combat = f.api;
    return f;
  }
  function removePlayer(player) {
    const i = fighters.findIndex((f) => f.player === player);
    if (i <= 0) return; // player 0 is the combat object's own
    const f = fighters[i];
    fighters.splice(i, 1);
    for (const e of enemies) {
      if (e.aggro === f) e.aggro = null;
      if (e.lastHitBy === f) e.lastHitBy = null;
      if (e.thrownBy === f) e.thrownBy = null;
    }
  }
  for (const p of players ?? [{ id: 0, slot: 0, local: true, hero }]) addPlayer(p);
  const f0 = fighters[0];
  // The combat pack (evades, travel strikes, finishers, the directional reaction table) loads
  // now, into the clip map every character shares; moves fall back to the preloaded clips until
  // it lands (browser only).
  // A few seconds after boot, so the download and parse don't compete with the first frames.
  const loadPack = () => loadCombatPack(f0.hero.bat?.animator?.clips ?? null, reach).then((ok) => {
    if (!ok) return;
    for (const f of fighters) f.hero.bat.animator.prime?.(COMBAT2_HERO_CLIPS.filter((c) => f.hero.bat.animator.has(c)));
  });
  if (typeof window !== 'undefined' && typeof setTimeout === 'function') setTimeout(loadPack, 2500);

  return {
    get combo() { return f0.combo; },
    director,
    // The fight's rng (enemies share it): scripts/anim-lib.mjs reseeds it for a repeatable run.
    get rng() { return rng; },
    shockwave: (...a) => f0.shockwave(...a),
    takedown: (...a) => f0.takedown(...a),
    // Clears a buffered press early when a traversal control (ledge takedown, glide dive-bomb)
    // already acted on it itself, so it can't also fire a real strike/kick once that control
    // hands hero.control back.
    consumeInput(action) { f0.inputBuffer.consume(action); },
    // What gadgets land their hits through: the same bookkeeping as every other move.
    get gadgetApi() { return f0.gadgetApi; },
    // Re-read the WayneTech effects after a purchase.
    applyEffects() { for (const f of fighters) f.applyEffects(); },
    get enemies() { return enemies; },
    setEnemies(list) {
      const fresh = list.some((e) => !enemies.includes(e)) || list.length === 0;
      enemies = list;
      director.clear();
      // A new fight: a new squad's fear (biased by the city's reputation), new floor weapons.
      if (fresh) {
        fear = createFear({ rng, bias: reputation.fearBias(), gain: () => effects.fearGain ?? 1 }); // [verify] fearGain
        for (const e of list) if (e.alive) fear.join(e.id, { base: e.type === 'lieutenant' || e.type === 'brute' || e.type === 'heavy' ? 0.8 : 0.35 + rng.next() * 0.35 });
        drops.length = 0; reinforced = false; lastStandingNoted = false;
      }
      // The squad's opening beat before the first attack, by tier (rules.js DIFFICULTY openHold).
      const oh = DIFFICULTY[difficulty]?.openHold ?? [1, 2.6];
      for (const e of list) director.hold(e.id, oh[0] + rng.next() * (oh[1] - oh[0]));
    },
    setDifficulty(d) { difficulty = d; director.configure(DIFFICULTY[d]); },
    killHero: () => f0.killHero(),
    get active() { return engaged().length > 0; },
    get cameraMode() { return f0.cameraMode; },
    get chains() { return f0.chains; },
    get swarm() { return f0.swarm; },
    // ---- squad AI (workstream I) ----
    // The city-wide reputation (read by other systems; persisted in wave 3) and this fight's fear.
    get reputation() { return reputation; },
    get fear() { return fear; },
    // ---- players ----
    get fighters() { return fighters; },
    addPlayer,
    removePlayer,
    // The fighter for a hero or a player (or null).
    fighterFor(x) { return fighters.find((f) => f.hero === x || f.player === x) ?? null; },
    // `ctx` is player 0's frame context (input, camera, fx); every other player brings its own
    // as player.ctx. Each hero runs on its own dt (time.dtFor: a hit-stop freezes only it in
    // co-op; with one player it is the world's dt).
    update(dt, ctx) {
      for (let i = 0; i < fighters.length; i++) {
        const f = fighters[i];
        f.update(time.dtFor ? time.dtFor(f.hero, dt) : dt, i === 0 ? ctx : f.player.ctx);
      }
      const d = getDifficulty();
      if (d !== difficulty) { difficulty = d; director.configure(DIFFICULTY[d]); }
      // One actor's late clip priming per frame (src/anim/packs.js).
      primeStep();
      // Enemy AI and the attack director.
      updateEnemies(dt);
    },
  };
}
