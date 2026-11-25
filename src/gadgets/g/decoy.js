// [prog] Decoy hologram: a Batman made of light, projected 4 m ahead for effects.decoyTime seconds
// (8, longer with Decoy Long). Every goon within 18 m keeps losing you to it (e.lose toward it,
// refreshed twice a second): no wind-ups at the real Batman, and in a predator room the noise
// sends them over to it. Gunmen in reach open fire on it (a tracer and a shot sound each 1.2 s:
// cosmetic, the shots hit nothing). Cooldown 20 s.
// Counters: rifle, pistol and sniper (they waste their fire on it), lieutenants and medics (the
// squad loses its focus). Stealth: walk round behind the crowd it draws.
import * as THREE from 'three';
import { affectable, emit, fx2, groundAhead, within } from './common.js';

export const AHEAD = 4, PULL_R = 18, REFRESH = 0.5, SHOT = 1.2, NOISE = 2;

export function createDecoyHandler() {
  const at = new THREE.Vector3(), muzzle = new THREE.Vector3(), chest = new THREE.Vector3();
  let live = false, t = 0, refresh = 0, shot = 0, noise = 0, life = 8;
  const slotOf = (sys) => (sys.who ? 1 : 0);

  function end(sys, why) {
    live = false;
    fx2(sys).holo.hide(slotOf(sys));
    emit(sys, 'decoyEnd', { why, pos: at });
  }

  return {
    id: 'decoy',
    get live() { return live; },
    get position() { return at; },
    fire(sys) {
      groundAhead(sys, AHEAD, at);
      live = true;
      t = 0; refresh = 0; shot = SHOT * 0.5; noise = 0;
      life = sys.effects.decoyTime ?? 8;
      fx2(sys).holo.show(slotOf(sys), at, sys.hero.bat?.yaw ?? 0);
      fx2(sys).ring(at, 1.5, 0x7fe8ff, 0.5);
      sys.pose?.('Gadget_Toss', 0.3, 1.6);
      emit(sys, 'decoyOn', { pos: at.clone(), time: life });
      sys.events.emit('word', { text: 'FZZT!', pos: at.clone().setY(at.y + 2.2), big: false });
      return true;
    },
    update(sys, real, dt) {
      if (!live) return;
      t += dt;
      refresh -= dt;
      if (refresh <= 0) {
        refresh = REFRESH;
        for (const e of sys.combat.enemies) {
          if (!affectable(e) || e.down || !within(at, e.pos, PULL_R, 6)) continue;
          e.lose?.(REFRESH + 0.4, at);
        }
      }
      noise -= dt;
      if (noise <= 0) { noise = NOISE; sys.stealth?.noise?.(at, PULL_R * 0.7, 'decoy'); }
      shot -= dt;
      if (shot <= 0) {
        shot = SHOT;
        // The nearest gunman with it in reach takes a shot at it.
        let best = null, bestD = Infinity;
        for (const e of sys.combat.enemies) {
          if (!affectable(e) || e.down || !e.def?.ranged || e.jamT > 0) continue;
          const d = Math.hypot(e.pos.x - at.x, e.pos.z - at.z);
          if (d < PULL_R * 1.5 && d < bestD) { best = e; bestD = d; }
        }
        if (best) {
          muzzle.set(best.pos.x, best.pos.y + 1.4, best.pos.z);
          chest.set(at.x + (Math.random() - 0.5) * 0.3, at.y + 1.2, at.z);
          fx2(sys).zap(muzzle, chest, 0xffe08a, 0.12);
          emit(sys, 'decoyShot', { from: best.pos, pos: at, target: best });
        }
      }
      if (t >= life) end(sys, 'time');
    },
    cancel(sys) { if (live) end(sys, 'cancel'); },
  };
}
