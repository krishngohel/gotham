// [prog] EMP mine: dropped at Batman's feet (two down at once). It arms after 1 s and goes off when
// a goon steps within 2.5 m (or after 45 s). The pulse, effects.empRadius across (6 m, more with
// EMP Wide), jams every gun and stun baton in reach for 6 s (combat's gadgetApi.jam, as the
// disruptor) and jolts every goon there into a 1 s stagger. Vehicles hear it too: 'empPulse'
// { pos, radius, time } is the seam for the traffic and the Batmobile's foes (workstream L3) to
// stall their electronics. Two charges, one back every 15 s.
// Counters: rifle, pistol and sniper (no shots), baton (no shock), everyone briefly staggers.
import * as THREE from 'three';
import { affectable, emit, fx2, gadgetHit, within } from './common.js';

export const ARM_S = 1, TRIGGER_R = 2.5, JAM_S = 6, JOLT_S = 1, LIFE = 45, MAX = 2;

export function createEmpHandler() {
  const mines = [];
  // Batons jammed by a pulse get their charge back when the jam ends (guns clear on their own).
  const jammed = [];
  for (let i = 0; i < MAX; i++) mines.push({ live: false, pos: new THREE.Vector3(), t: 0 });

  function blast(sys, m, i) {
    m.live = false;
    fx2(sys).mine.clear(i + (sys.who ? MAX : 0));
    const r = sys.effects.empRadius ?? 6;
    fx2(sys).ring(m.pos, r, 0x56c8ff, 0.6);
    sys.gfx?.sparks?.burst?.(m.pos, fx2(sys).sparkCount(160));
    let n = 0;
    for (const e of sys.combat.enemies) {
      if (!affectable(e) || !within(m.pos, e.pos, r)) continue;
      if (sys.api.jam?.(e, JAM_S) && !jammed.some((j) => j.e === e)) jammed.push({ e, t: JAM_S });
      if (!e.down && e.dazzle?.(JOLT_S)) sys.api.director?.release(e.id);
      gadgetHit(sys, 'emp', e);
      n += 1;
    }
    emit(sys, 'empPulse', { pos: m.pos.clone(), radius: r, time: 4, count: n });
    sys.events.emit('word', { text: 'VWOMMM!', pos: m.pos.clone().setY(m.pos.y + 1.2), big: true });
  }

  return {
    id: 'emp',
    get mines() { return mines; },
    fire(sys) {
      const i = mines.findIndex((m) => !m.live);
      if (i < 0) { sys.hint('emp-full'); return false; }
      const m = mines[i];
      m.live = true;
      m.t = 0;
      m.pos.copy(sys.hero.pos);
      const g = sys.collision?.groundBelow ? sys.collision.groundBelow(m.pos.x, m.pos.y + 0.5, m.pos.z, 0.2) : -Infinity;
      if (g > -Infinity) m.pos.y = g;
      fx2(sys).mine.place(i + (sys.who ? MAX : 0), m.pos);
      sys.pose?.('Gadget_Toss', 0.3, 1.6);
      emit(sys, 'empPlace', { pos: m.pos.clone() });
      return true;
    },
    update(sys, real, dt) {
      for (let i = jammed.length - 1; i >= 0; i--) {
        const j = jammed[i];
        j.t -= dt;
        if (j.t > 0 && j.e.alive) continue;
        if (j.e.alive) sys.api.jam?.(j.e, 0);
        jammed.splice(i, 1);
      }
      for (let i = 0; i < MAX; i++) {
        const m = mines[i];
        if (!m.live) continue;
        const was = m.t;
        m.t += dt;
        if (was < ARM_S && m.t >= ARM_S) { fx2(sys).mine.arm(i + (sys.who ? MAX : 0)); emit(sys, 'empArmed', { pos: m.pos }); }
        if (m.t < ARM_S) continue;
        if (m.t >= LIFE) { blast(sys, m, i); continue; }
        for (const e of sys.combat.enemies) {
          if (affectable(e) && !e.down && within(m.pos, e.pos, TRIGGER_R)) { blast(sys, m, i); break; }
        }
      }
    },
    cancel(sys) {
      for (const j of jammed) if (j.e.alive) sys.api.jam?.(j.e, 0);
      jammed.length = 0;
      for (let i = 0; i < MAX; i++) if (mines[i].live) { mines[i].live = false; fx2(sys).mine.clear(i + (sys.who ? MAX : 0)); }
    },
  };
}
