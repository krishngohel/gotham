// Picks what a grapple pull would grab (workstream L3, `[move]`): the goon nearest the aim line
// within the pull range, or a registered pullable object (src/traversal/pullables.js). Pure apart
// from the injected `visible(x, y, z)` line-of-sight test. Each picker owns its result objects, so
// a 10 Hz pick allocates nothing.
import { PULL_RANGE, pullOutcome } from './grappleRules.js';

export function createPullPicker() {
  const enemyHit = { kind: 'enemy', e: null };
  const objectHit = { kind: 'object', obj: null };
  return {
    pick(enemies, pullables, eye, dir, { range = PULL_RANGE, maxAngle = 0.16, visible = () => true } = {}) {
      let best = null, bestA = maxAngle;
      for (const e of enemies) {
        if (!pullOutcome(e) || e.room || e.state === 'grabbed' || e.state === 'tied' || e.state === 'frozen') continue;
        const dx = e.pos.x - eye.x, dy = e.pos.y + 1.1 - eye.y, dz = e.pos.z - eye.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > range || d < 2.5) continue;
        const a = Math.acos(Math.min(1, (dx * dir.x + dy * dir.y + dz * dir.z) / d));
        if (a < bestA && visible(e.pos.x, e.pos.y + 1.1, e.pos.z)) { bestA = a; best = e; }
      }
      if (best) { enemyHit.e = best; return enemyHit; }
      const o = pullables?.aimed(eye, dir, { range, maxAngle: maxAngle + 0.06 });
      if (o && visible(o.x, o.y, o.z)) { objectHit.obj = o; return objectHit; }
      return null;
    },
  };
}
