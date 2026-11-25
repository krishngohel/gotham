// [prog] Remote hacking device: aim at something hackable within effects.hackRange (12 m, more
// with the Hack Range skill) and crack its signal in a short timing minigame (hackRules.js,
// src/ui/hackGame.js; its window scales with effects.hackWindow and settings.access.qteAssist).
// The world runs at 35% while you hack (player-local in co-op).
//   - Anything registered with registerHackTarget (a door, a camera, a traffic light, an El
//     signal: none are in the city yet, the registry is the seam for them) gets its onHack(sys).
//   - Otherwise a goon's radio: the squad around him (15 m) hears fake orders and runs off toward
//     a spot 14 m past him, losing you for 7 s, and every one of them is marked on the map
//     (mapMark kind 'hack'). A failed crack squeals: goons within 6 m of you hear it.
// Counters: lieutenants and medics (the squad leaves them), snipers (they leave the nest).
import * as THREE from 'three';
import { aimGoons, affectable, emit, fx2, gadgetHit, playerId, flat, mark } from './common.js';
import { createHackRound } from '../hackRules.js';
import { gadgetConfig } from '../config.js';
import { createHackGame } from '../../ui/hackGame.js';
import { bindingLabel } from '../../core/bindings.js';

export const SQUAD_R = 15, LOSE_S = 7, DECOY_D = 14, MARK_S = 12, SLOW = 0.35;

// The registry other systems put hackable things in: { id, kind, label, pos, canHack?(), onHack(sys) }.
const targets = new Map();
export function registerHackTarget(t) {
  if (!t?.id || !t.pos || typeof t.onHack !== 'function') throw new Error('registerHackTarget({ id, pos, onHack })');
  targets.set(t.id, t);
  return () => { if (targets.get(t.id) === t) targets.delete(t.id); };
}
export const hackTargets = () => [...targets.values()];

let sharedUi = null;
function ui() {
  if (sharedUi) return sharedUi;
  const root = gadgetConfig.uiRoot ?? (typeof document !== 'undefined' ? document.body : null);
  sharedUi = createHackGame(root);
  return sharedUi;
}

export function createHackHandler({ rng } = {}) {
  const decoy = new THREE.Vector3(), dir = new THREE.Vector3(), eye = new THREE.Vector3();
  let run = null, n = 0, endT = -1;

  function pickRegistered(sys, range) {
    let best = null, bestD = Infinity;
    sys.follow?.lookDir?.(dir);
    eye.set(sys.hero.pos.x, sys.hero.pos.y + 1.4, sys.hero.pos.z);
    for (const t of targets.values()) {
      if (t.canHack && !t.canHack()) continue;
      const dx = t.pos.x - eye.x, dy = t.pos.y - eye.y, dz = t.pos.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range || d < 0.1) continue;
      const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      if (cos < 0.85) continue;
      if (d < bestD) { best = t; bestD = d; }
    }
    return best;
  }

  function finish(sys, ok) {
    const r = run;
    run = null;
    sys.time.release(holdName(sys));
    ui().done(ok);
    endT = 0.7;
    if (!ok) {
      sys.stealth?.noise?.(sys.hero.pos, 6, 'hack');
      emit(sys, 'hackFail', { kind: r.kind });
      sys.hint('hack-fail');
      return;
    }
    if (r.kind === 'radio') radio(sys, r.target);
    else {
      try { r.target.onHack(sys); } catch (err) { console.error('hack target', r.target.id, err); }
      emit(sys, 'hackDone', { kind: r.target.kind ?? 'device', id: r.target.id, count: 1 });
    }
  }

  // Fake orders on the squad's radio.
  function radio(sys, target) {
    const { hero } = sys;
    const d = flat(target.pos, hero.pos) || 1;
    decoy.set(target.pos.x + ((target.pos.x - hero.pos.x) / d) * DECOY_D, target.pos.y, target.pos.z + ((target.pos.z - hero.pos.z) / d) * DECOY_D);
    let count = 0;
    for (const e of sys.combat.enemies) {
      if (!affectable(e) || e.down || flat(e.pos, target.pos) > SQUAD_R) continue;
      e.lose?.(LOSE_S, decoy);
      n += 1;
      mark(sys, { id: `hack:${playerId(sys)}:${n}`, kind: 'hack', target: e, pos: e.pos, ttl: MARK_S, player: playerId(sys) });
      count += 1;
    }
    sys.stealth?.noise?.(decoy, 18, 'radio');
    fx2(sys).ring(target.pos, SQUAD_R, 0x7cff9a, 0.8);
    gadgetHit(sys, 'hack', target);
    emit(sys, 'hackDone', { kind: 'radio', target, count, pos: decoy.clone() });
    sys.events.emit('word', { text: 'KSSHK! "FALL BACK!"', pos: target.pos.clone().setY(target.pos.y + 2), big: false });
  }

  const holdName = (sys) => (sys.who ? `hack:${sys.who.id}` : 'hack');

  return {
    id: 'hack',
    // The cooldown is spent when a crack starts; a press during the minigame is the minigame's.
    manualSpend: true,
    get active() { return !!run; },
    get round() { return run?.round ?? null; },
    fire(sys, ctx) {
      if (run) return true;
      if (!sys.state.ready('hack')) { sys.hint('gadget-cooldown', 'Remote Hacking Device'); return true; }
      const range = sys.effects.hackRange ?? 12;
      const reg = pickRegistered(sys, range);
      let target = reg, kind = reg ? (reg.kind ?? 'device') : null;
      if (!target) {
        [target] = aimGoons(sys, ctx, { range, maxAngle: 0.5, filter: (e) => affectable(e) && !e.down, sight: false });
        kind = target ? 'radio' : null;
      }
      if (!target) { sys.hint('hack-none'); return false; }
      const assist = gadgetConfig.getSettings?.()?.access?.qteAssist ?? 'off';
      run = { target, kind, round: createHackRound({ hackWindow: sys.effects.hackWindow ?? 1, assist, rng }), t: 0 };
      endT = -1;
      sys.time.hold(holdName(sys), SLOW, sys.player);
      const label = kind === 'radio' ? `Goon radio, ${target.type ?? 'goon'}` : (target.label ?? kind);
      ui().show(label, bindingLabel(sys.getBindings?.() ?? gadgetConfig.getSettings?.()?.bindings ?? {}, 'batarang'), run.round.auto);
      sys.pose?.('Gadget_Aim', 0.3, 1.4);
      sys.state.use('hack');
      emit(sys, 'gadgetUse', { id: 'hack' });
      emit(sys, 'hackStart', { kind, target });
      return true;
    },
    update(sys, real, dt, ctx) {
      if (endT >= 0) { endT -= real; if (endT < 0 && !run) ui().hide(); }
      if (!run) return;
      if (sys.hero.dead || sys.wheelOpen || (run.kind === 'radio' && !run.target.alive)) { finish(sys, false); return; }
      sys.time.hold(holdName(sys), SLOW, sys.player);
      run.t += real;
      let res = run.round.tick(real);
      if (!res && run.t > 0.12 && ctx?.input?.pressed?.('batarang')) {
        sys.combat.consumeInput?.('batarang');
        res = run.round.press();
      }
      ui().set(run.round);
      if (res) finish(sys, res === 'win');
    },
    cancel(sys) {
      if (run) { run = null; sys.time.release(holdName(sys)); }
      if (endT >= 0 || ui().shown) { endT = -1; ui().hide(); }
    },
  };
}
