// [prog] Bolas: wraps the legs of the goon you aim at (effects.bolasTargets of them: 1, 2 with
// Double Bolas, up to 20 m) and drops him on the spot, down for a free knockout and his gun on
// the floor (enemy.yank to where he already stands). Runners first: a goon fleeing or a ninja in
// the cone is picked before anyone else. Brutes, heavies and Harley keep their feet: the cords
// only trip them into a 1.2 s stagger. Three charges, one back every 6 s.
// Counters: ninjas (no dodge for a thrown cord), runners and fleeing goons, shields (the cord goes
// under the shield), riflemen and snipers (they drop the gun). Heavies only stagger.
import * as THREE from 'three';
import { aimGoons, affectable, emit, fx2, gadgetHit } from './common.js';

export const RANGE = 20, STAGGER_S = 1.2, FLIGHT = 0.25;
const HELD = ['grabbed', 'chained', 'tied', 'frozen'];
export const bolasable = (e) => affectable(e) && !e.down && !e.air && !HELD.includes(e.state);
const runner = (e) => e.state === 'flee' || e.type === 'ninja';

export function createBolasHandler() {
  const flying = [];
  const hand = new THREE.Vector3(), knee = new THREE.Vector3();

  function wrap(sys, e) {
    if (!bolasable(e)) return;
    if (e.def.armored || e.def.chip) {
      if (e.dazzle?.(STAGGER_S)) sys.api.director?.release(e.id);
    } else if (e.yank?.(e.pos)) sys.api.director?.release(e.id);
    fx2(sys).ring(e.pos, 0.9, 0xd9b26a, 0.3);
    gadgetHit(sys, 'bolas', e);
    emit(sys, 'bolasWrap', { target: e });
    sys.events.emit('word', { text: 'WHAP-THUD!', pos: e.pos.clone().setY(e.pos.y + 1.4), big: false });
  }

  return {
    id: 'bolas',
    fire(sys, ctx) {
      const n = Math.max(1, sys.effects.bolasTargets ?? 1);
      const pool = aimGoons(sys, ctx, { range: RANGE, n: n + 2, maxAngle: 0.45, filter: bolasable });
      if (!pool.length) { sys.hint('bolas-none'); return false; }
      pool.sort((a, b) => (runner(b) ? 1 : 0) - (runner(a) ? 1 : 0));
      const targets = pool.slice(0, n);
      sys.api.faceTo?.(targets[0]);
      sys.pose?.('OverhandThrow', 0.3, 2);
      sys.hero.bat?.bone?.('hand_r')?.getWorldPosition?.(hand);
      for (const e of targets) {
        knee.set(e.pos.x, e.pos.y + 0.5, e.pos.z);
        fx2(sys).zap(hand.lengthSq() ? hand : sys.hero.pos, knee, 0xd9b26a, 0.3);
        flying.push({ e, t: FLIGHT });
      }
      emit(sys, 'bolasThrow', { count: targets.length });
      return true;
    },
    update(sys, real, dt) {
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i];
        f.t -= dt;
        if (f.t > 0) continue;
        flying.splice(i, 1);
        wrap(sys, f.e);
      }
    },
    cancel() { flying.length = 0; },
  };
}
