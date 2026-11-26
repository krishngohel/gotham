// [net2] Every boss online, through one generic pair (the director's state, src/bosses/director.js):
//   host:  the boss's body is an enemy like any other on the wire (its id rides on a hashed wire
//          number, snapshot.js BOSS_NUM): spawn/despawn while it is on stage, its pose, clip, AI state
//          (windup / aim / open / flinch / knocked...), tell glyph and role in the snapshot. The bar
//          ({ id, name, phases, phase, inPhase, colors }) goes as a 'boss' event when it changes, and
//          the boss's speech line as 'ev' bossSay. The Joker keeps boss.js's own bar (legacyBar).
//   guest: the director builds the def's body without its phase logic (bosses.puppet(id)), the net
//          layer turns it into a puppet; the guest's blows, counters and gadgets on it are claims the
//          host lands through the guest's own fighter (the same vulnerability windows apply).
// Per-boss extras (a def's own hazards: Freeze's ice, Scarecrow's gas, Penguin's umbrella fire,
// Riddler's plates) hurt the guest through the host's 'hurt' events; their visuals are optional
// and not sent yet (docs/design/online-coop.md "Known limits").
import { barFraction } from '../../bosses/rules.js';
import { isBossId } from '../codec/snapshot.js';

export function createBossHost({ bosses, rep }) {
  let last = '', t = 0, lastSay = null;
  return {
    frame(real) {
      const s = bosses?.barState ?? null;
      t -= real;
      const key = s ? `${s.id}|${s.phase}|${s.inPhase.toFixed(2)}` : '';
      if (key !== last || (s && t <= 0)) {
        if (key !== last || t <= 0) { t = 0.5; last = key; rep.event({ t: 'boss', data: s ? { on: true, id: s.id, name: s.name, phases: s.phases, phase: s.phase, inPhase: +s.inPhase.toFixed(3), colors: s.colors } : { on: false, gen: true } }); }
      }
      const say = bosses?.speech?.text ?? null;
      if (say !== lastSay) { lastSay = say; rep.event({ t: 'ev', name: 'bossSay', data: { text: say ? String(say).slice(0, 140) : '' } }); }
    },
    // The bodies on stage (the director's current boss) for the spawn list and the welcome.
    bodies(out) {
      const e = bosses?.controller?.handle?.actor?.e;
      if (e && e.ch?.root?.visible && isBossId(e.id)) out.push(e);
      return out;
    },
  };
}

export function createBossGuest({ bosses, hud }) {
  const loading = new Map(); // id -> Promise
  let bar = false;
  return {
    // A boss body for a spawn message: the puppet-ready enemy, or null while its model loads (then
    // `onReady(e)` runs once it is there).
    body(id, onReady) {
      const cur = bosses?.controller?.handle?.actor?.e;
      if (cur && cur.id === id) return cur;
      if (!loading.has(id)) {
        const p = Promise.resolve(bosses?.puppet?.(id)).then((e) => { loading.delete(id); if (e) onReady(e); return e; }).catch((err) => { loading.delete(id); console.error('boss puppet', id, err); });
        loading.set(id, p);
      }
      return null;
    },
    show(e, on) { if (e?.ch?.root) e.ch.root.visible = on; },
    bar(d) {
      if (!d || !d.gen && !d.id) return false;
      if (d.on) { bar = true; hud.bossBar(true, barFraction(d.phase ?? 0, d.phases ?? 1, d.inPhase ?? 0), (d.phase ?? 0) + 1, { name: d.name, phases: d.phases, colors: d.colors }); }
      else if (bar) { bar = false; hud.bossBar(false); }
      return true;
    },
    say(d) { hud.speech?.(d?.text ? d.text : null); },
  };
}
