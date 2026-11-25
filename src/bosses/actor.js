// A villain's body in a boss fight: the model (createVillain, loaded lazily), the combat-enemy
// interface the combat system drives (the same fields the Joker's object in src/game/boss.js has,
// so targeting, counters, hit reactions and the action camera all work on it), movement held inside
// the arena, speech, and the two attacks every boss shares:
//   melee(kind)   a telegraphed swing (blue glyph: counter it, red: dodge it) that lands through
//                 the combat system on the hero it targets (block, dodge and difficulty apply)
//   aimAt(hero)   a telegraphed ranged shot (red glyph) for umbrella fire, freeze beams, gas lobs
// Vulnerability is explicit: the controller opens a window (open(seconds)); only then do strikes
// count (`hits`), and HITS_PER_WINDOW closes it. Outside a window a strike is 'immune' and the
// boss says why. No health sponge: a phase is a number of windows, the same on every tier.
import * as THREE from 'three';
import { ENEMY } from '../combat/rules.js';
import { HITS_PER_WINDOW } from './rules.js';

let villainsMod = null;
export async function loadVillain(assets, id) {
  villainsMod ??= await import('../heroes/models/villains.js');
  return villainsMod.createVillain(assets, id);
}

export function createBossActor({ ch, id, scene, arena, events, hud, combat, rng, onWindowClosed = null, lines = {} }) {
  scene.add(ch.root);
  ch.root.visible = false;
  const pos = ch.root.position;
  const tmp = new THREE.Vector3();
  const knock = new THREE.Vector3();
  let speech = null;
  const pick = (a) => (a?.length ? a[Math.floor(rng.next() * a.length)] : null);
  const base = { ...ENEMY.joker, health: 30, boss: true };

  const e = {
    id, type: 'boss', ch, pos, scale: 1, radius: 0.5,
    health: 999, alive: true, down: false, stunned: false, aware: true,
    state: 'idle', t: 0, glyph: null, windupDur: 0.6, finishable: false,
    // controller-owned
    vulnerable: 0, hits: 0, target: null, attack: null, guardLine: lines.guard ?? null,
    get def() { return { ...base, armored: !(e.vulnerable > 0) && !e.finishable, parry: false, counterable: e.state === 'windup' && e.attack?.counter !== false }; },
    get x() { return pos.x; },
    get z() { return pos.z; },
    wake() {}, ready: () => false, startWindup() {}, remove() {},
    applyHit(result, from, opts = {}) {
      e.countered = false;
      tmp.set(pos.x - from.x, 0, pos.z - from.z).normalize();
      // A countered swing (blue tell): the swing is cancelled and he staggers back. [story2] The combat
      // code resolves any strike on an armoured boss as 'immune', counters included, so before this a
      // counter never registered and no brawling boss could ever be opened by countering.
      if (e.state === 'windup' && e.attack?.counter !== false && (result.outcome !== 'immune' || opts?.move === 'counter')) {
        e.state = 'flinch'; e.t = 0; e.glyph = null; e.attack = null;
        ch.animator.play('Hit_Chest', { once: true, timeScale: 1.6, fade: 0.05 });
        knock.copy(tmp).multiplyScalar(2);
        events.emit('bossCountered', { id });
        e.onCountered?.();
        return true;
      }
      if (e.vulnerable > 0 && result.outcome !== 'immune') {
        e.hits += 1;
        ch.animator.play(rng.chance(0.5) ? 'Hit_Chest' : 'Hit_Head', { once: true, timeScale: 1.5, fade: 0.05 });
        knock.copy(tmp).multiplyScalar(1.2);
        events.emit('bossHit', { id, hits: e.hits });
        if (e.hits >= (e.hitsNeeded ?? HITS_PER_WINDOW)) {
          e.vulnerable = 0; e.hits = 0;
          e.state = 'knocked'; e.t = 0;
          knock.copy(tmp).multiplyScalar(6);
          ch.animator.play('Hit_Knockback', { once: true, fade: 0.05 });
          onWindowClosed?.();
        }
        return false;
      }
      if (result.outcome === 'stun') { e.onStun?.(result); return false; }
      if (e.guardLine && rng.chance(0.5)) say(pick(e.guardLine), 1.6);
      events.emit('bossGuard', { id });
      return false;
    },
  };

  function say(text, secs = 2.4) {
    if (!text) return;
    speech = { text, t: secs };
    hud.speech?.(text);
  }

  const api = {
    e, ch, pos, say, pick,
    get speech() { return speech; },
    headWorld: (out) => ch.headWorld(out, 0.5),
    show(on = true) { ch.root.visible = on; },
    place(p, yaw = 0) { pos.set(p.x, p.y, p.z); ch.face(yaw); },
    face(target, rate = 0, dt = 0) {
      if (!target) return;
      const yaw = Math.atan2(target.x - pos.x, target.z - pos.z);
      const d = Math.atan2(Math.sin(yaw - ch.yaw), Math.cos(yaw - ch.yaw));
      ch.face(ch.yaw + (rate ? d * Math.min(1, rate * dt) : d));
    },
    clamp() {
      if (!arena) return;
      if (arena.r) {
        const dx = pos.x - arena.x, dz = pos.z - arena.z, d = Math.hypot(dx, dz);
        if (d > arena.r) { pos.x = arena.x + (dx / d) * arena.r; pos.z = arena.z + (dz / d) * arena.r; }
      } else {
        pos.x = Math.max(arena.minX + 1, Math.min(arena.maxX - 1, pos.x));
        pos.z = Math.max(arena.minZ + 1, Math.min(arena.maxZ - 1, pos.z));
      }
      if (arena.y != null) pos.y = arena.y;
    },
    // Walk or jog toward a point (stops at `stop` metres). Returns the remaining distance.
    moveTo(p, dt, { speed = 3.2, stop = 2 } = {}) {
      const dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
      if (d > stop) {
        pos.x += (dx / d) * speed * dt; pos.z += (dz / d) * speed * dt;
        ch.animator.play(speed > 3.5 ? 'Jog_Fwd_Loop' : 'Walk_Loop', { fade: 0.2 });
      } else ch.animator.play('Idle_Loop', { fade: 0.25 });
      api.clamp();
      return d;
    },
    // A telegraphed swing at the current target. counter: true (blue, counter it) or false (red).
    melee({ kind = 'joker', windup = 0.6, counter = true, clip = null } = {}) {
      e.attack = { kind, counter, melee: true };
      e.state = 'windup'; e.t = 0; e.windupDur = windup;
      e.glyph = counter ? 'blue' : 'red';
      ch.animator.play(clip ?? pick(['Punch_Jab', 'Punch_Cross', 'Melee_Hook']), { once: true, timeScale: 0.3, fade: 0.08 });
    },
    // A telegraphed ranged attack: aim for `windup` seconds (red glyph), then fire(hero).
    aim(hero, { windup = 0.9, fire, clip = 'OverhandThrow' } = {}) {
      e.attack = { ranged: true, fire, hero, counter: false };
      e.state = 'aim'; e.t = 0; e.windupDur = windup;
      e.glyph = 'red';
      ch.animator.play(clip, { once: true, timeScale: 0.55, fade: 0.1 });
    },
    // Opens a vulnerability window (strikes count) for `secs`.
    open(secs, { hitsNeeded = HITS_PER_WINDOW, clip = 'Idle_Shield_Break' } = {}) {
      e.vulnerable = secs; e.hits = 0; e.hitsNeeded = hitsNeeded;
      e.state = 'open'; e.t = 0; e.glyph = null; e.attack = null;
      ch.animator.play(clip, { once: true, timeScale: 0.6, fade: 0.1 });
    },
    // Ticks the shared states; returns true while a shared state owns him this frame.
    tick(dt, ectx, target) {
      e.t += dt;
      if (speech) { speech.t -= dt; if (speech.t <= 0) { speech = null; hud.speech?.(null); } }
      if (knock.lengthSq() > 0.001) { pos.addScaledVector(knock, dt); knock.multiplyScalar(Math.max(0, 1 - dt * 4)); }
      if (e.vulnerable > 0) {
        e.vulnerable -= dt;
        if (e.vulnerable <= 0) { e.vulnerable = 0; e.hits = 0; e.state = 'recover'; e.t = 0; e.onWindowMissed?.(); }
      }
      switch (e.state) {
        case 'windup':
          if (target) api.face(target.pos, 12, dt);
          if (e.t >= e.windupDur) { e.state = 'swing'; e.t = 0; e.glyph = null; ch.animator.play(ch.animator.currentName, { once: true, timeScale: 1.8 }); }
          return true;
        case 'swing':
          if (e.t > 0.14 && e.t - dt <= 0.14 && target && Math.hypot(target.pos.x - pos.x, target.pos.z - pos.z) < 2.6) ectx?.onAttackLand?.(e, e.attack?.kind ?? 'joker');
          if (e.t > 0.45) { e.state = 'recover'; e.t = 0; e.attack = null; }
          return true;
        case 'aim':
          if (e.attack?.hero) api.face(e.attack.hero.pos, 10, dt);
          if (e.t >= e.windupDur) { const a = e.attack; e.state = 'recover'; e.t = 0; e.glyph = null; e.attack = null; a?.fire?.(a.hero); }
          return true;
        case 'flinch':
          if (e.t > 0.6) { e.state = 'recover'; e.t = 0; }
          return true;
        case 'knocked':
          if (e.t > 1.2) { e.state = 'recover'; e.t = 0; ch.animator.play('LayToIdle', { once: true, timeScale: 1.6, fade: 0.1 }); }
          return true;
        case 'open':
          return true;
        default:
          return false;
      }
    },
    hide() { ch.root.visible = false; e.alive = true; e.state = 'idle'; e.vulnerable = 0; e.glyph = null; if (speech) { speech = null; hud.speech?.(null); } },
  };
  return api;
}

// Fires a straight shot from `from` to a hero: lands unless the hero is dodging (invulnerable),
// blocked by cover between them (a collision ray), or far off. The hit goes through the hero's own
// fighter so block, armour and difficulty apply.
export function shotLands(collision, from, hero, range = 40) {
  if (!hero || hero.dead) return false;
  const dx = hero.pos.x - from.x, dz = hero.pos.z - from.z, d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (collision?.raycast) {
    const hit = collision.raycast({ x: from.x, y: from.y + 1.4, z: from.z }, { x: dx / d, y: (hero.pos.y + 1.2 - from.y - 1.4) / d, z: dz / d }, d - 0.6);
    if (hit) return false;
  }
  return true;
}
