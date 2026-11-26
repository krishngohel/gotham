// Grapple pull (workstream L3, `[move]`; the grapplePull upgrade): the grapple fired at a goon or a
// registered pullable object instead of a ledge. The line flies out, then the role decides
// (src/traversal/grappleRules.js pullOutcome): a light goon is yanked off his feet to the hero, an
// armed one loses the weapon on the way, a shield bearer's guard is broken, a heavy plants his feet.
// An object (src/traversal/pullables.js: a vent cover, a crate, a mission's door) gets its onPull.
import * as THREE from 'three';
import { pullOutcome } from '../../traversal/grappleRules.js';

const LINE_T = 0.22, HOLD_T = 0.28;

export function createPullControl(h, { events, cable, cableGeo }, target) {
  const hand = new THREE.Vector3(), to = new THREE.Vector3(), tip = new THREE.Vector3();
  const goon = target.kind === 'enemy' ? target.e : null;
  let t = 0, done = false;
  h.vel.x = 0; h.vel.z = 0;
  const p = goon ? goon.pos : target.obj;
  h.faceTowards(p.x - h.pos.x, p.z - h.pos.z, 0, 0);
  h.bat.animator.play(h.bat.animator.has('Gadget_Aim') ? 'Gadget_Aim' : 'Spell_Simple_Shoot', { once: true, timeScale: 1.6, fade: 0.06 });
  events.emit('grapple', { pull: true });
  return {
    name: 'grapplePull',
    update(dt) {
      t += dt;
      h.bat.bone('hand_r').getWorldPosition(hand);
      const k = Math.min(1, t / LINE_T);
      tip.set(p.x, p.y + (goon ? 1.2 : 0), p.z);
      if (done) tip.lerpVectors(tip, hand, Math.min(1, (t - LINE_T) / HOLD_T));
      cable.visible = true;
      cableGeo.attributes.position.setXYZ(0, hand.x, hand.y, hand.z);
      cableGeo.attributes.position.setXYZ(1, hand.x + (tip.x - hand.x) * k, hand.y + (tip.y - hand.y) * k, hand.z + (tip.z - hand.z) * k);
      cableGeo.attributes.position.needsUpdate = true;
      if (h.state === 'air') { h.vel.y -= h.GRAVITY * dt; const r = h.integrate(dt); if (r.grounded) { h.vel.y = 0; h.grounded = true; h.setState('ground'); } }
      if (!done && t >= LINE_T) { done = true; apply(); }
      if (t >= LINE_T + HOLD_T) { cable.visible = false; return true; }
      return false;
    },
  };

  function apply() {
    if (!goon) {
      target.obj.onPull?.({ by: h, player: h.player });
      events.emit('grapplePull', { outcome: 'object', id: target.obj.id ?? null });
      return;
    }
    const e = goon;
    const outcome = pullOutcome(e);
    const director = h.combat?.director;
    const dx = e.pos.x - h.pos.x, dz = e.pos.z - h.pos.z, d = Math.hypot(dx, dz) || 1;
    to.set(h.pos.x + (dx / d) * 1.3, h.pos.y, h.pos.z + (dz / d) * 1.3);
    let word = 'YOINK!';
    if (outcome === 'disarm' || outcome === 'yank') {
      if (outcome === 'disarm') { e.dropWeapon?.(); e.disarmed = true; word = 'SNATCH!'; }
      if (e.yank?.(to)) director?.release(e.id);
    } else if (outcome === 'stripShield') {
      e.shieldLost = true;
      if (e.applyHit?.({ outcome: 'stun', damage: 0, stun: 2.5 }, h.pos, { power: 0.6 })) director?.release(e.id);
      word = 'CLANG!';
    } else if (outcome === 'resist') {
      e.applyHit?.({ outcome: 'chip', damage: 0, stun: 0 }, h.pos, { power: 0.4 });
      word = 'HNNGH!';
    } else return;
    events.emit('grapplePull', { outcome, target: e });
    events.emit('word', { text: word, pos: e.pos.clone().setY(e.pos.y + 1.8), big: false });
  }
}
