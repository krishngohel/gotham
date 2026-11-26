// [prog] Glue grenade: lobbed where you aim (up to 15 m), it bursts into quick-set foam
// effects.glueRadius across (3 m, more with Glue Spread). Every goon inside is pinned where he
// stands for 6 s (enemy.tie with only himself: down, helpless, and one hit knocks him out, as a
// Rope-a-Dope's tie). Brutes, heavies and Harley are too strong to pin: their boots stick and they
// stagger for 1.5 s. Floor vents inside the foam are sealed shut ('glueSeal'). Three charges,
// one back every 8 s.
// Counters: ninjas and runners (they can't dodge foam), shields (no guard against the floor),
// knife and baton goons. Heavies only stagger.
import * as THREE from 'three';
import { aimPoint, affectable, emit, fx2, gadgetHit, within } from './common.js';

export const PIN_S = 6, STAGGER_S = 1.5, FLIGHT = 0.4;

export function createGlueHandler() {
  const at = new THREE.Vector3();
  const pinned = [];
  let flight = -1, S = null;
  const seal = (b) => emit(S, 'glueSeal', { id: b.id, pos: b.center ?? at });

  function burst(sys) {
    flight = -1;
    const r = sys.effects.glueRadius ?? 3;
    fx2(sys).ring(at, r, 0xe9f2c4, 0.5);
    let n = 0;
    for (const e of sys.combat.enemies) {
      if (!affectable(e) || e.down || e.air || e.state === 'chained' || e.state === 'frozen' || !within(at, e.pos, r)) continue;
      if (e.def.armored || e.def.chip) {
        if (e.dazzle?.(STAGGER_S)) sys.api.director?.release(e.id);
      } else {
        if (e.tie?.([e], PIN_S)) sys.api.director?.release(e.id);
        const slot = fx2(sys).foam.attach(e);
        pinned.push({ e, slot });
      }
      gadgetHit(sys, 'glue', e);
      n += 1;
    }
    S = sys;
    sys.breakables?.forNear?.(at, r, 'vent', seal);
    emit(sys, 'glueBurst', { pos: at.clone(), radius: r, count: n });
    sys.events.emit('word', { text: 'SPLOOSH!', pos: at.clone().setY(at.y + 1), big: false });
  }

  return {
    id: 'glue',
    get pinned() { return pinned; },
    get position() { return at; },
    fire(sys) {
      aimPoint(sys, 15, at);
      sys.pose?.('OverhandThrow', 0.3, 1.8);
      flight = FLIGHT;
      emit(sys, 'glueThrow', { pos: at.clone() });
      return true;
    },
    update(sys, real, dt) {
      if (flight >= 0) { flight -= dt; if (flight < 0) burst(sys); }
      for (let i = pinned.length - 1; i >= 0; i--) {
        const p = pinned[i];
        if (p.e.state === 'tied' && p.e.alive && sys.combat.enemies.includes(p.e)) continue;
        fx2(sys).foam.release(p.slot);
        pinned.splice(i, 1);
      }
    },
    cancel(sys) {
      flight = -1;
      for (const p of pinned) fx2(sys).foam.release(p.slot);
      pinned.length = 0;
    },
  };
}
