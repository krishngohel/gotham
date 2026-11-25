// [prog] Sonic batarang: thrown at the wall or floor you aim at (up to 30 m). It lands and whines
// for 6 s: every goon within 14 m turns to the noise and loses track of you (e.lose toward it; in
// a predator room the stealth system's noise sends them over to look). With the Sonic Stun skill
// (effects.sonicStun) a second press while it whines bursts it: goons within 5 m of it are
// stunned for 2.5 s. Cooldown 6 s, spent on the throw (the burst is free).
// Counters: snipers and riflemen leave their angles to look; shields and heavies are only lured
// (the burst stuns them too: a stun gets past a shield and armor). Never the Joker.
import * as THREE from 'three';
import { aimPoint, affectable, emit, fx2, gadgetHit, within } from './common.js';

export const LURE_R = 14, STUN_R = 5, LIFE = 6, FLIGHT = 0.35, STUN_S = 2.5;

export function createSonicHandler() {
  const at = new THREE.Vector3();
  let live = false, t = 0, flight = -1, pulse = 0;

  function land(sys) {
    flight = -1;
    live = true;
    t = 0;
    pulse = 0;
    sys.events.emit('word', { text: 'WHEEEE!', pos: at.clone().setY(at.y + 1.2), big: false });
    emit(sys, 'sonicLand', { pos: at.clone() });
    lure(sys);
  }
  // Each pulse (once a second) pulls everyone in reach toward the noise.
  function lure(sys) {
    fx2(sys).ring(at, LURE_R, 0xffd23f, 0.9);
    sys.stealth?.noise?.(at, LURE_R, 'sonic');
    let n = 0;
    for (const e of sys.combat.enemies) {
      if (!affectable(e) || e.down || !within(at, e.pos, LURE_R, 5)) continue;
      e.lose?.(1.6, at);
      n += 1;
    }
    emit(sys, 'sonicPulse', { pos: at, count: n });
  }
  function burst(sys) {
    live = false;
    fx2(sys).ring(at, STUN_R, 0xffffff, 0.35);
    sys.gfx?.sparks?.burst?.(at, fx2(sys).sparkCount(120));
    let n = 0;
    for (const e of sys.combat.enemies) {
      if (!affectable(e) || e.down || !within(at, e.pos, STUN_R)) continue;
      if (e.dazzle?.(STUN_S)) sys.api.director?.release(e.id);
      gadgetHit(sys, 'sonic', e);
      n += 1;
    }
    emit(sys, 'sonicStun', { pos: at.clone(), count: n });
    sys.events.emit('word', { text: 'SKREEEE!', pos: at.clone().setY(at.y + 1.4), big: true });
  }

  return {
    id: 'sonic',
    // The throw spends the cooldown; the burst is a second press while it whines.
    manualSpend: true,
    get live() { return live; },
    get position() { return at; },
    fire(sys) {
      if (live && sys.effects.sonicStun) { burst(sys); return true; }
      if (!sys.state.ready('sonic')) { sys.hint('gadget-cooldown', 'Sonic Batarang'); return true; }
      aimPoint(sys, 30, at);
      sys.pose?.('OverhandThrow', 0.3, 1.9);
      flight = FLIGHT;
      live = false;
      sys.state.use('sonic');
      emit(sys, 'gadgetUse', { id: 'sonic' });
      emit(sys, 'sonicThrow', { pos: at.clone() });
      return true;
    },
    update(sys, real, dt) {
      if (flight >= 0) { flight -= dt; if (flight < 0) land(sys); return; }
      if (!live) return;
      t += dt;
      pulse += dt;
      if (pulse >= 1) { pulse -= 1; lure(sys); }
      if (t >= LIFE) { live = false; emit(sys, 'sonicEnd', { pos: at }); }
    },
    cancel() { live = false; flight = -1; },
  };
}
