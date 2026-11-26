// [prog] Scout drone: Batman stands still on the ground and flies a little camera with the move
// keys or the left stick (the camera follows it), for effects.droneTime seconds (20, longer with
// Drone Long). It holds 4 m over the ground, never strays more than 60 m, and every goon it sees
// within 16 m is marked: a red pip over him and 'mapMark' { kind: 'drone', ttl 30 } for the map.
// The fire key again brings it home. Cooldown 25 s. In split screen each player has their own
// (the partner's gadget system flies the partner's drone on the partner's view).
// Detective and stealth use: scout a predator room before going in. No effect on a fight.
import * as THREE from 'three';
import { affectable, emit, fx2, playerId, mark, unmark } from './common.js';

export const SPEED = 9, HEIGHT = 4, LEASH = 60, SEE_R = 16, MARK_S = 30, SCAN = 0.3;

export function createDroneHandler() {
  const pos = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), step = new THREE.Vector3(), aim = new THREE.Vector3();
  const marked = [];
  let flying = false, t = 0, scanT = 0, n = 0, yaw = 0;

  function end(sys, why) {
    flying = false;
    fx2(sys).drone.hide(slotOf(sys));
    sys.cameraFocus = null;
    sys.cameraMode = null;
    if (sys.hero.control?.name === 'droneSteer') sys.hero.control = null;
    emit(sys, 'droneEnd', { why, marked: marked.length });
  }
  const slotOf = (sys) => (sys.who ? 1 : 0);

  function scan(sys) {
    for (const e of sys.combat.enemies) {
      if (!affectable(e) || e.down || marked.some((m) => m.e === e)) continue;
      if (Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) > SEE_R) continue;
      aim.set(e.pos.x - pos.x, e.pos.y + 1.2 - pos.y, e.pos.z - pos.z);
      const d = aim.length();
      if (d > 0.5 && sys.collision?.raycast) {
        const hit = sys.collision.raycast(pos, aim.divideScalar(d), d);
        if (hit && hit.t < d - 0.5) continue;
      }
      n += 1;
      const id = `drone:${playerId(sys)}:${n}`;
      marked.push({ e, id, t: MARK_S, pip: fx2(sys).pip.follow(e, 0xff5a4a, 2.3) });
      mark(sys, { id, kind: 'drone', target: e, pos: e.pos, ttl: MARK_S, player: playerId(sys) });
      emit(sys, 'droneMark', { target: e, id });
    }
  }

  return {
    id: 'drone',
    manualSpend: true,
    get flying() { return flying; },
    get position() { return pos; },
    get marked() { return marked; },
    fire(sys) {
      const { hero } = sys;
      if (flying) { end(sys, 'recall'); return true; }
      if (!sys.state.ready('drone')) { sys.hint('gadget-cooldown', 'Scout Drone'); return true; }
      if (hero.control) { sys.hint('drone-busy'); return false; }
      if (hero.state !== 'ground' || hero.grounded === false) { sys.hint('drone-ground'); return false; }
      flying = true;
      t = 0;
      scanT = 0;
      pos.set(hero.pos.x, hero.pos.y + 2.2, hero.pos.z);
      yaw = hero.bat?.yaw ?? 0;
      hero.control = { name: 'droneSteer', combat: false, canChain: () => false, update: () => !flying };
      fx2(sys).drone.show(slotOf(sys), pos, yaw);
      sys.cameraFocus = pos;
      sys.cameraMode = 'remote';
      sys.state.use('drone');
      emit(sys, 'gadgetUse', { id: 'drone' });
      emit(sys, 'droneLaunch', { pos: pos.clone() });
      sys.events.emit('word', { text: 'BZZZZ!', pos: pos.clone(), big: false });
      return true;
    },
    update(sys, real, dt, ctx) {
      for (let i = marked.length - 1; i >= 0; i--) {
        const m = marked[i];
        m.t -= dt;
        if (m.t > 0 && m.e.alive && !m.e.down) continue;
        fx2(sys).pip.release(m.pip);
        if (m.t > 0) unmark(sys, m.id);
        marked.splice(i, 1);
      }
      if (!flying) return;
      if (sys.hero.dead || sys.hero.control?.name !== 'droneSteer') { end(sys, 'interrupted'); return; }
      t += dt;
      // Batman's hands are on the controls (not a combat move): the fire key is read here.
      if (t > 0.15 && ctx?.input?.pressed?.('batarang')) { sys.combat.consumeInput?.('batarang'); end(sys, 'recall'); return; }
      const mv = ctx?.input?.move ?? sys.input?.move ?? { x: 0, y: 0 };
      sys.follow?.forward?.(fwd);
      sys.follow?.right?.(right);
      fwd.y = 0; right.y = 0;
      if (fwd.lengthSq() > 1e-6) fwd.normalize();
      if (right.lengthSq() > 1e-6) right.normalize();
      step.set(0, 0, 0).addScaledVector(fwd, mv.y || 0).addScaledVector(right, mv.x || 0);
      const len = step.length();
      if (len > 0.05) {
        step.multiplyScalar((SPEED * dt) / Math.max(1, len));
        yaw = Math.atan2(step.x, step.z);
        const sl = step.length();
        const wall = sys.collision?.raycast ? sys.collision.raycast(pos, step.divideScalar(sl), sl + 0.4) : null;
        if (!wall) pos.addScaledVector(step, sl);
      }
      // Hold over the ground, on a leash.
      const g = sys.collision?.groundBelow ? sys.collision.groundBelow(pos.x, pos.y + 1, pos.z, 0.2) : -Infinity;
      const want = (g > -Infinity ? g : sys.hero.pos.y) + HEIGHT;
      pos.y += (want - pos.y) * Math.min(1, dt * 3);
      const dx = pos.x - sys.hero.pos.x, dz = pos.z - sys.hero.pos.z, d = Math.hypot(dx, dz);
      if (d > LEASH) { pos.x = sys.hero.pos.x + (dx / d) * LEASH; pos.z = sys.hero.pos.z + (dz / d) * LEASH; }
      fx2(sys).drone.move(slotOf(sys), pos, yaw, len > 0.05 ? 0.2 : 0);
      scanT -= dt;
      if (scanT <= 0) { scanT = SCAN; scan(sys); }
      if (t >= (sys.effects.droneTime ?? 20)) end(sys, 'time');
    },
    cancel(sys) { if (flying) end(sys, 'cancel'); },
  };
}
