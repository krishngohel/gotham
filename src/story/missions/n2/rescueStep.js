// [m23] `type: 'rescue'`: people locked up at several places, a clock, and a crew guarding them.
// Work each lock (stand at it for a few seconds; a guard still on his feet beside it stops you),
// get everyone out before the clock runs down, then finish the crew. Two players can split up:
// one draws the guards, the other works the lock.
//
//   { id, type: 'rescue', text, checkpoint, retry: true, timer: 150, hold: 2.4,
//     captives: [{ id, site, label, lines }], guard: fightId, prop: 'crate' | 'lever',
//     workLabel, freedWord, freedSuffix, mopUpText, mopUpLines, failLines, doneLines }
// (The same rules serve for things to shut off against a clock: Night Two's coolant valves.)
//
// The guards are an ordinary night fight (the night's `fights[guard]`), started through the same
// encounter runner a puzzle's penalty squad uses; host-only online (a guest sees the host's goons
// as puppets and its own copy of the locks). The props are a few toon boxes built when the step
// begins and removed when it ends: no lights, no skinned meshes, nothing per frame but a meter.
import * as THREE from 'three';
import { toonMaterial, addHullOutline } from '../../../render/toon.js';
import { createRescue, captiveAt, RESCUE } from './rescueLogic.js';

const PROPS = {
  // a slatted transport crate with a brass padlock
  crate: { size: [1.5, 1.3, 1.1], color: 0x8a6a42, lock: 0xd9b24a },
  // a control box with a red release lever
  lever: { size: [0.7, 1.3, 0.5], color: 0x4a5560, lock: 0xc8323c },
};
const GOLD = 0xf2c94c;

export function createRescueStep(ctx) {
  const { markers, ui, radio, hud, events, standing, site, theGame } = ctx;
  const replica = () => !!ctx.isReplica?.();
  let step = null, rules = null, spots = [], marks = [], props = [], working = [], blocked = [], fightId = null, mopUp = false, told = -1;

  function buildProp(kind, at) {
    const sc = theGame()?.scene;
    if (!sc || typeof document === 'undefined') return null;
    const p = PROPS[kind] ?? PROPS.crate;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(...p.size), toonMaterial({ color: p.color }));
    box.position.y = p.size[1] / 2;
    addHullOutline(box, 0.02);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.12), toonMaterial({ color: p.lock }));
    lock.position.set(0, p.size[1] * 0.62, p.size[2] / 2 + 0.07);
    g.add(box, lock);
    g.position.set(at.x, at.y, at.z);
    g.rotation.y = at.yaw ?? 0;
    sc.add(g);
    return { g, lock };
  }
  function clearProps() {
    for (const p of props) if (p) { p.g.parent?.remove(p.g); p.g.traverse((o) => { o.geometry?.dispose?.(); }); }
    props = [];
  }
  function beginGuards(s) {
    fightId = null;
    if (!s.guard || replica() || !ctx.encounters || !ctx.fight) return;
    const def = ctx.fight(s.guard);
    if (!def) return;
    fightId = `${s.id}Guard`;
    ctx.encounters.begin(fightId, def);
  }
  function objective(s) {
    if (mopUp) return s.mopUpText ?? 'Everyone is out. Finish the crew.';
    return `${s.text} (${spots.length - rules.left}/${spots.length})`;
  }
  const guards = () => (fightId && ctx.encounters?.id === fightId ? ctx.encounters.enemies : []);
  const guardsUp = () => guards().some((e) => e.alive);

  function freed(s, i) {
    if (i < 0 || !marks[i]) return;
    markers.flash(marks[i]); markers.release(marks[i]); marks[i] = null;
    if (props[i]) props[i].lock.visible = false;
    const c = s.captives[i];
    events.emit('word', { text: s.freedWord ?? 'FREE!', pos: { x: spots[i].x, y: spots[i].y + 2.2, z: spots[i].z }, big: false });
    events.emit('collectible', { step: s.id, captive: c.id });
    if (c.lines?.length) radio?.say(c.lines);
    for (const h of hud.all?.() ?? [hud]) h.chip?.(`rescue:${s.id}:${c.id}`, c.label ? `${c.label}: ${s.freedSuffix ?? 'out'}` : 'Out', 'checkpoint');
  }

  return {
    enter(s) {
      step = s; mopUp = false; told = -1;
      spots = s.captives.map((c) => {
        const p = { ...site(c.site) };
        const y = ctx.collision?.groundBelow?.(p.x, p.y + 3, p.z, 0.3);
        if (y > -Infinity && Math.abs(y - p.y) < 3) p.y = y;
        return p;
      });
      rules = createRescue({ count: spots.length, hold: s.hold ?? RESCUE.hold, timer: s.timer ?? null });
      working = spots.map(() => false); blocked = spots.map(() => false);
      marks = spots.map((p) => markers.place('plate', p, { color: GOLD }));
      props = spots.map((p, i) => buildProp(s.prop ?? 'crate', { x: p.x + (s.captives[i].propDx ?? 0), y: p.y, z: p.z + (s.captives[i].propDz ?? -1.3), yaw: s.captives[i].propYaw ?? 0 }));
      beginGuards(s);
      hud.setObjective?.(objective(s));
    },
    update(dt, s) {
      if (!rules || s !== step) return;
      if (mopUp) {
        if (!guardsUp()) { const st = step; rules = null; if (s.doneLines?.length) radio?.say(s.doneLines); ctx.done(st); }
        return;
      }
      const heroes = standing();
      const foes = guards();
      let at = -1;
      for (let i = 0; i < spots.length; i++) {
        working[i] = false; blocked[i] = false;
        if (rules.isFree(i)) continue;
        const p = spots[i];
        for (const h of heroes) if (captiveAt(spots, h.pos) === i) { working[i] = true; at = i; break; }
        for (const e of foes) if (e.alive && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < RESCUE.guardReach) { blocked[i] = true; break; }
      }
      const r = rules.step(dt, working, blocked);
      ui.timer(rules.clock);
      if (at >= 0 && !rules.isFree(at)) {
        ui.meter(blocked[at] ? 'GUARDED' : (s.workLabel ?? 'BREAKING THE LOCK'), rules.fraction(at), blocked[at] ? '#c8323c' : '#f2c94c');
        if (blocked[at] && told !== at) { told = at; hud.hint?.('A guard is standing over it. Deal with him first.', 3000); }
      } else ui.meter(null);
      if (r === 'timeout') { ui.timer(null); ui.meter(null); ctx.fail(step, s.failLines); return; }
      if (r === 'allFree' || (r && typeof r === 'object')) { freed(s, rules.lastFreed); hud.setObjective?.(objective(s)); }
      if (r === 'allFree') {
        ui.timer(null); ui.meter(null);
        events.emit('caseSolved', { step: s.id });
        mopUp = true;
        hud.setObjective?.(objective(s));
        if (guardsUp() && s.mopUpLines?.length) radio?.say(s.mopUpLines);
      }
    },
    marker() {
      if (!rules || mopUp) return null;
      let best = null, bd = Infinity;
      const h = ctx.hero.pos;
      for (let i = 0; i < spots.length; i++) { if (rules.isFree(i)) continue; const d = Math.hypot(spots[i].x - h.x, spots[i].z - h.z); if (d < bd) { bd = d; best = spots[i]; } }
      return best;
    },
    exit() {
      for (const m of marks) if (m) markers.release(m);
      marks = [];
      clearProps();
      ui.timer(null); ui.meter(null);
      if (fightId && ctx.encounters?.id === fightId && !replica()) ctx.encounters.end();
      fightId = null; rules = null; step = null; spots = [];
    },
    onRespawn(s) {
      if (!rules) return;
      rules.reset(); mopUp = false; told = -1;
      for (let i = 0; i < spots.length; i++) { if (!marks[i]) marks[i] = markers.place('plate', spots[i], { color: GOLD }); if (props[i]) props[i].lock.visible = true; }
      beginGuards(s);
      hud.setObjective?.(objective(s));
    },
    // Dev, the playthrough and the night simulator: the locks still shut (stand at each; `clear`
    // asks the driver to deal with the guards first, the way it wins any fight).
    debugSolve() {
      if (!rules) return [];
      if (mopUp) return [{ at: null, hold: 0.5, clear: true }];
      const out = [];
      for (let i = 0; i < spots.length; i++) if (!rules.isFree(i)) out.push({ at: spots[i], hold: (step.hold ?? RESCUE.hold) + 0.8, clear: true });
      return out;
    },
    get rules() { return rules; },
    get mopUp() { return mopUp; },
  };
}
