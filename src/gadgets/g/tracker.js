// [prog] Tracker dart: tags the goon you aim at (up to 35 m), or else the street car you aim at,
// and the map follows it: 'mapMark' { id, kind: 'tracker', target, pos, ttl, player } (pos is the
// live position object; ttl 90 s, or 0 = until unmarked with the Tracker Network skill,
// effects.trackerPersist), 'mapUnmark' { id } when it ends: knocked out, gone, timed out, or the
// oldest tag dropped for a new one. effects.trackerTags tags at once (1, 3 with Tracker Multi).
// A tagged goon carries a yellow pip over his head. Three charges, one back every 10 s.
// Detective use: tag a runner or a courier car and follow it home. No effect on any role's fight.
import * as THREE from 'three';
import { aimGoons, affectable, emit, fx2, playerId, mark, unmark } from './common.js';
import { gadgetConfig } from '../config.js';

export const RANGE = 35, TTL = 90;

export function createTrackerHandler() {
  const tags = [];
  const eye = new THREE.Vector3(), dir = new THREE.Vector3(), hand = new THREE.Vector3(), tip = new THREE.Vector3();
  let n = 0, checkT = 0;

  function aimCar(sys) {
    const cars = gadgetConfig.getVehicles?.();
    if (!cars?.length) return null;
    eye.set(sys.hero.pos.x, sys.hero.pos.y + 1.4, sys.hero.pos.z);
    sys.follow?.lookDir?.(dir);
    let best = null, bestScore = Infinity;
    for (const c of cars) {
      const p = c?.group?.position ?? c?.pos;
      if (!p || tags.some((t) => t.target === c)) continue;
      const dx = p.x - eye.x, dy = p.y + 0.8 - eye.y, dz = p.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > RANGE || d < 1) continue;
      const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      if (cos < 0.93) continue;
      const score = (1 - cos) * 40 + d * 0.05;
      if (score < bestScore) { best = c; bestScore = score; }
    }
    return best;
  }

  function untag(sys, i) {
    const t = tags[i];
    tags.splice(i, 1);
    fx2(sys).pip.release(t.pip);
    unmark(sys, t.id);
  }

  return {
    id: 'tracker',
    get tags() { return tags; },
    fire(sys, ctx) {
      const [goon] = aimGoons(sys, ctx, { range: RANGE, maxAngle: 0.3, filter: (e) => affectable(e) && !tags.some((t) => t.target === e) });
      const car = goon ? null : aimCar(sys);
      const target = goon ?? car;
      if (!target) { sys.hint('tracker-none'); return false; }
      const max = Math.max(1, sys.effects.trackerTags ?? 1);
      while (tags.length >= max) untag(sys, 0);
      n += 1;
      const kind = goon ? 'goon' : 'vehicle';
      const pos = goon ? goon.pos : (car.group?.position ?? car.pos);
      const ttl = sys.effects.trackerPersist ? 0 : TTL;
      const id = `tracker:${playerId(sys)}:${n}`;
      tags.push({ id, target, kind, pos, t: ttl, pip: fx2(sys).pip.follow(goon ?? pos, 0xffd23f, goon ? 2.3 : 2) });
      sys.pose?.('Gadget_Aim', 0.25, 1.8);
      sys.hero.bat?.bone?.('hand_r')?.getWorldPosition?.(hand);
      tip.set(pos.x, pos.y + 1.2, pos.z);
      fx2(sys).zap(hand.lengthSq() ? hand : sys.hero.pos, tip, 0xffd23f, 0.15);
      emit(sys, 'trackerTag', { id, kind, target });
      mark(sys, { id, kind: 'tracker', target, pos, ttl, player: playerId(sys) });
      sys.events.emit('word', { text: 'TIK!', pos: tip.clone(), big: false });
      return true;
    },
    update(sys, real, dt) {
      if (!tags.length) return;
      for (const t of tags) if (t.t > 0) t.t -= dt;
      checkT -= dt;
      if (checkT > 0) return;
      checkT = 0.5;
      for (let i = tags.length - 1; i >= 0; i--) {
        const t = tags[i];
        const lost = t.kind === 'goon' ? (!t.target.alive || !sys.combat.enemies.includes(t.target)) : t.target.active === false;
        if (lost || (t.t <= 0 && !sys.effects.trackerPersist)) untag(sys, i);
      }
    },
    cancel(sys) { while (tags.length) untag(sys, tags.length - 1); },
  };
}
