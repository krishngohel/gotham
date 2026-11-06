// Flashbang (unlocked after the credits): a stun grenade thrown 5 m ahead. Every goon within 6 m
// is blinded and staggering for 3 s, and a burst of white sparks lights the street.
import * as THREE from 'three';
import { freeForGadget } from '../gadgetDefs.js';

const R = 6, DELAY = 0.35;

export function createFlashbangHandler() {
  const at = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let pending = -1;

  function bang(sys) {
    const { api } = sys;
    sys.gfx.sparks.burst(at, 360);
    let n = 0;
    for (const e of sys.combat.enemies) {
      // A chain begun after the throw (the pose is chainable before the bang) keeps its goons.
      if (!e.alive || e.def.boss || e.down || e.state === 'chained' || Math.hypot(e.pos.x - at.x, e.pos.z - at.z) > R || Math.abs(e.pos.y - at.y) > 3) continue;
      api.landHit('flashbang', e);
      if (e.dazzle(3)) api.director.release(e.id);
      n += 1;
    }
    sys.fx.impact(at, 1.8);
    sys.events.emit('flashbang', { pos: at.clone(), count: n });
    sys.events.emit('word', { text: 'BANG!', pos: at.clone().setY(at.y + 1.5), big: true });
  }

  return {
    id: 'flashbang',
    fire(sys) {
      const { hero } = sys;
      // Mid-combo counts as free: a strike in its chain window is replaced by the throw.
      if (hero.state !== 'ground' || !freeForGadget(hero)) { sys.hint('flashbang-ground'); return false; }
      sys.follow.forward(fwd);
      sys.follow.right(right);
      at.copy(hero.pos).addScaledVector(fwd, 5);
      const g = sys.collision.groundBelow(at.x, hero.pos.y + 2, at.z, 0.3);
      at.y = g > -Infinity ? g : hero.pos.y;
      sys.pose('OverhandThrow', 0.4, 1.6);
      pending = DELAY;
      return true;
    },
    update(sys, real, dt) {
      if (pending < 0) return;
      pending -= dt;
      if (pending < 0) bang(sys);
    },
    cancel() { pending = -1; },
  };
}
