// [prog] Shared bits for the wave 3 gadget handlers: aiming, the ground ahead, player-scoped
// events, map marks, fear and a no-op stand-in for the visuals (unit tests' fake sys has no gfx).
import * as THREE from 'three';
import { pickAimedMany } from '../aim.js';
import { selectTarget } from '../../combat/targeting.js';

const eye = new THREE.Vector3(), dir = new THREE.Vector3(), fwd = new THREE.Vector3();
const noop = () => {};
const NO_FX2 = Object.freeze({
  ring: noop, zap: noop, sparkCount: (n) => n, cheap: true,
  foam: { attach: () => -1, release: noop }, holo: { show: noop, hide: noop },
  drone: { show: noop, move: noop, hide: noop }, mine: { place: noop, arm: noop, clear: noop },
  pip: { follow: () => -1, release: noop },
});

// The wave 3 visuals (gadgetFx2.js through gfx.extra), or no-ops.
export const fx2 = (sys) => sys.gfx?.extra ?? NO_FX2;

// An event carrying this system's player (withPlayer, non-enumerable), as the system's own are.
export function emit(sys, name, data) {
  if (sys.emit) sys.emit(name, data);
  else sys.events.emit(name, data);
}

// Map marks for L2 (docs/design/progression.md section 4): `player` is the player's id in the
// payload itself, so these go out plain (withPlayer would replace it with the record).
export const mark = (sys, data) => sys.events.emit('mapMark', data);
export const unmark = (sys, id) => sys.events.emit('mapUnmark', { id, player: playerId(sys) });

// The player's id for map marks (0 for player 0).
export const playerId = (sys) => sys.who?.id ?? 0;

// Whether a combat event (impact, blocked: withPlayer) came from this system's own hero.
export const mine = (sys, d) => !d?.player || !d.player.hero || d.player.hero === sys.hero;

// A goon a gadget can affect at all.
export const affectable = (e) => !!e && e.alive && !e.def?.boss;

// Fear (src/enemies/fear.js 'gadgetFromDark' when the goon never saw it coming): game.js feeds
// 'gadgetHit' into the squad's fear. Also what audio and the HUD can listen for.
export function gadgetHit(sys, id, target) {
  emit(sys, 'gadgetHit', { id, target, dark: !target.aware });
}

// Up to `n` goons under the crosshair (within `maxAngle` of the camera's aim), else the one the
// stick or camera points toward (as the batarang picks). `filter` decides who can be picked.
export function aimGoons(sys, ctx, { range = 20, n = 1, maxAngle = 0.35, filter = affectable, sight = true } = {}) {
  const { hero, api } = sys;
  const list = sys.combat.enemies ?? [];
  const ok = (e) => filter(e) && (!sight || !api?.canSee || api.canSee(e));
  eye.set(hero.pos.x, hero.pos.y + 1.4, hero.pos.z);
  if (sys.follow?.lookDir) sys.follow.lookDir(dir); else dir.set(0, 0, 1);
  const picked = pickAimedMany(list, eye, dir, n, { range, maxAngle, filter: ok });
  if (picked.length || !api?.inputDir) return picked;
  const t = selectTarget(hero.pos, api.inputDir(ctx, true), list.filter(ok), { range, maxAngle: 1 });
  return t ? [t] : [];
}

// A point on the ground `dist` metres ahead of the camera's heading (or at the hero's feet).
export function groundAhead(sys, dist, out) {
  const { hero } = sys;
  if (sys.follow?.forward) sys.follow.forward(fwd); else fwd.set(0, 0, 1);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
  fwd.normalize();
  out.set(hero.pos.x + fwd.x * dist, hero.pos.y, hero.pos.z + fwd.z * dist);
  const g = sys.collision?.groundBelow ? sys.collision.groundBelow(out.x, hero.pos.y + 2, out.z, 0.3) : -Infinity;
  out.y = g > -Infinity ? g : hero.pos.y;
  return out;
}

// Where the aim ray meets a wall or the floor (up to `range`), else the ground ahead.
export function aimPoint(sys, range, out) {
  const { hero } = sys;
  eye.set(hero.pos.x, hero.pos.y + 1.5, hero.pos.z);
  if (sys.follow?.lookDir) sys.follow.lookDir(dir); else dir.set(0, 0, 1);
  const hit = sys.collision?.raycast ? sys.collision.raycast(eye, dir, range) : null;
  if (hit && hit.t > 1) {
    out.copy(eye).addScaledVector(dir, hit.t - 0.2);
    const g = sys.collision.groundBelow ? sys.collision.groundBelow(out.x, out.y + 0.5, out.z, 0.3) : -Infinity;
    if (g > -Infinity && out.y - g < 3) out.y = g;
    return out;
  }
  return groundAhead(sys, Math.min(range, 12), out);
}

export const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const within = (c, p, r, dy = 3) => Math.hypot(p.x - c.x, p.z - c.z) <= r && Math.abs(p.y - c.y) <= dy;
