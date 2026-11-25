// [prog] Disruptor: jams the weapon of the goon you aim at, up to 30 m away and through the dark
// (no line of sight needed: it rides the gun's own radio chip). For 10 s a rifle, pistol or sniper
// cannot fire (he backs off fiddling with it) and a stun baton loses its charge, so bare fists
// get through. Charges: effects.disruptorCharges (2, more with the skill), one back every 15 s.
// Counters: rifle, pistol, sniper (no shot), baton (no shock). Not shields, heavies or brutes.
// Through combat's gadgetApi.jam (combatSystem.js), so the host can own it online.
import * as THREE from 'three';
import { aimGoons, affectable, emit, fx2, gadgetHit } from './common.js';

export const JAM_S = 10, RANGE = 30;
// Armed with something the disruptor can kill: a gun, or a baton that still has its charge.
export const jammable = (e) => affectable(e) && !e.down && !(e.jamT > 0) && (!!e.def?.ranged || !!e.charged);

export function createDisruptorHandler() {
  const jammed = [];
  const hand = new THREE.Vector3(), head = new THREE.Vector3();
  return {
    id: 'disruptor',
    get jammed() { return jammed; },
    fire(sys, ctx) {
      const { api } = sys;
      const [target] = aimGoons(sys, ctx, { range: RANGE, maxAngle: 0.4, filter: jammable, sight: false });
      if (!target) { sys.hint('disruptor-none'); return false; }
      if (!api.jam?.(target, JAM_S)) { sys.hint('disruptor-none'); return false; }
      jammed.push({ e: target, t: JAM_S });
      sys.pose?.('Gadget_Aim', 0.25, 1.8);
      sys.hero.bat?.bone?.('hand_r')?.getWorldPosition?.(hand);
      head.set(target.pos.x, target.pos.y + 1.4, target.pos.z);
      fx2(sys).zap(hand.lengthSq() ? hand : head, head, 0x9fe3ff, 0.25);
      fx2(sys).ring(target.pos, 1.2, 0x9fe3ff, 0.4);
      gadgetHit(sys, 'disruptor', target);
      emit(sys, 'disruptorJam', { target, weapon: target.def.ranged ? 'gun' : 'baton', time: JAM_S });
      sys.events.emit('word', { text: 'BZZRT!', pos: head.clone(), big: false });
      return true;
    },
    update(sys, real, dt) {
      for (let i = jammed.length - 1; i >= 0; i--) {
        const j = jammed[i];
        j.t -= dt;
        const gone = !j.e.alive || !sys.combat.enemies.includes(j.e);
        if (j.t > 0 && !gone) continue;
        if (!gone) sys.api.jam?.(j.e, 0);
        jammed.splice(i, 1);
      }
    },
    cancel(sys) {
      for (const j of jammed) if (j.e.alive) sys.api.jam?.(j.e, 0);
      jammed.length = 0;
    },
  };
}
