// [prog] Shock gloves: press to charge them (2 s, faster with Shock Overcharge: effects.shockChargeRate),
// then they are live for 10 s or 5 electrified blows. While live, a bare-handed blow that a role
// would stop lands as an electrified strike instead: through a shield's guard, past a charged
// baton (he drops it), and into a heavy's or a brute's armor (stunned for 2 s, so the beatdown
// lands). Next to a registered generator (registerPowerTarget) a press powers it instead.
// Cooldown 4 s from the press. The strike goes through combat's gadgetApi.landHit ('disarm':
// a stun that gets past a shield and drops a weapon), one frame after the blow it answers.
// Counters: shield, baton, heavy, brute. A charged baton still bites the hand that hit it that
// one time (combat's own rule); the gloves take the baton away for the next blow.
import * as THREE from 'three';
import { affectable, emit, fx2, gadgetHit, mine, within } from './common.js';

export const CHARGE_S = 2, LIVE_S = 10, STRIKES = 5, STUN_HEAVY = 2;
const BARE = new Set(['punch', 'kick', 'counter', 'beatdown', 'heavy', 'spinKick']);
const STOPPED = new Set(['blocked', 'shocked', 'chip', 'immune']);

const powers = new Map();
// Things the gloves can power: { id, pos, onPower(sys) } (a generator, a dead lift). None in the city yet.
export function registerPowerTarget(t) {
  if (!t?.id || !t.pos || typeof t.onPower !== 'function') throw new Error('registerPowerTarget({ id, pos, onPower })');
  powers.set(t.id, t);
  return () => { if (powers.get(t.id) === t) powers.delete(t.id); };
}

export function createShockHandler() {
  const hand = new THREE.Vector3();
  const pending = [];
  let mode = 'off', charge = 0, liveT = 0, strikes = 0, off = null, sparkT = 0;

  function stop() {
    mode = 'off';
    off?.();
    off = null;
    pending.length = 0;
  }
  function goLive(sys) {
    mode = 'live';
    liveT = LIVE_S;
    strikes = STRIKES;
    off = sys.events.on('impact', (d) => {
      if (mode !== 'live' || !mine(sys, d) || !BARE.has(d.move) || !STOPPED.has(d.outcome)) return;
      const e = d.target;
      if (!affectable(e) || pending.includes(e)) return;
      pending.push(e);
    });
    emit(sys, 'shockReady', {});
    sys.hint('shock-ready');
  }

  return {
    id: 'shock',
    manualSpend: true,
    get mode() { return mode; },
    get charge() { return charge; },
    get strikes() { return strikes; },
    fire(sys) {
      if (mode !== 'off') return true;
      if (!sys.state.ready('shock')) { sys.hint('gadget-cooldown', 'Shock Gloves'); return true; }
      for (const p of powers.values()) {
        if (!within(sys.hero.pos, p.pos, 2.5)) continue;
        try { p.onPower(sys); } catch (err) { console.error('power target', p.id, err); }
        sys.state.use('shock');
        emit(sys, 'gadgetUse', { id: 'shock' });
        emit(sys, 'shockPower', { id: p.id });
        return true;
      }
      mode = 'charging';
      charge = 0;
      sys.state.use('shock');
      emit(sys, 'gadgetUse', { id: 'shock' });
      emit(sys, 'shockCharge', {});
      return true;
    },
    update(sys, real, dt) {
      if (mode === 'off') return;
      if (sys.hero.dead) { stop(); return; }
      sparkT -= dt;
      if (sparkT <= 0) {
        sparkT = mode === 'live' ? 0.35 : 0.2;
        sys.hero.bat?.bone?.('hand_r')?.getWorldPosition?.(hand);
        if (hand.lengthSq()) sys.gfx?.sparks?.burst?.(hand, fx2(sys).sparkCount(mode === 'live' ? 10 : 6));
      }
      if (mode === 'charging') {
        charge = Math.min(1, charge + (dt / CHARGE_S) * (sys.effects.shockChargeRate ?? 1));
        if (charge >= 1) goLive(sys);
        return;
      }
      for (const e of pending) {
        if (strikes <= 0 || !affectable(e)) continue;
        strikes -= 1;
        sys.api.landHit('disarm', e, { power: 1.4 });
        if ((e.def.armored || e.def.chip) && e.dazzle?.(STUN_HEAVY)) sys.api.director?.release(e.id);
        fx2(sys).ring(e.pos, 1.4, 0x9fe3ff, 0.3);
        sys.gfx?.sparks?.burst?.(e.pos, fx2(sys).sparkCount(40));
        gadgetHit(sys, 'shock', e);
        emit(sys, 'shockStrike', { target: e });
        sys.events.emit('word', { text: 'ZZZAP!', pos: e.pos.clone().setY(e.pos.y + 1.7), big: true });
      }
      pending.length = 0;
      liveT -= dt;
      if (liveT <= 0 || strikes <= 0) { stop(); emit(sys, 'shockEnd', {}); }
    },
    cancel() { if (mode !== 'off') stop(); },
  };
}
