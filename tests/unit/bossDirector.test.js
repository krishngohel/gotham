// [story2] The boss director's framework fixes: the boss stays in the combat list while his adds
// fight, a saved phase resumes, and snapshot()/apply() carry any boss to an online guest in the
// Joker's { on, phase, bar } shape plus pose and hazards.
import { describe, it, expect } from 'vitest';
import { createBossDirector } from '../../src/bosses/director.js';

function fakeWorld() {
  const combat = { enemies: [], setEnemies(l) { this.enemies = l; } };
  const goon = { id: 'g1', alive: true };
  const encounters = { begin() { combat.setEnemies([goon]); }, trigger() {}, end() {} };
  const hud = { bars: [], bossBar(...a) { this.bars.push(a); }, speech() {} };
  const events = { list: [], emit(n, d) { this.list.push([n, d]); }, on() {} };
  return { combat, encounters, hud, events, goon };
}

function fakeDef(id = 'test') {
  let ctx = null, phase = 0;
  const e = { pos: { x: 1, y: 2, z: 3 }, state: 'idle', glyph: null, vulnerable: 0, hits: 0, t: 0, attack: null };
  const actor = { pos: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, ch: { yaw: 0.5, root: { visible: true }, animator: { currentName: 'Idle_Loop', play() {}, update() {} }, face(y) { this.yaw = y; } }, show(v) { this.ch.root.visible = v; } };
  e.ch = actor.ch;
  const handle = { e, actor, done: false };
  return {
    id, name: 'TEST', villain: 'joker', site: { x: 0, y: 0, z: 0 }, colors: ['#fff', '#000'], gang: 'joker', act: 2,
    phases: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    sim: (b) => ({ goTo: b.actor.pos }),
    create(c) {
      ctx = c;
      return {
        begin(p) { phase = p; ctx.deps?.combat; c.combat?.setEnemies?.([e]); },
        update() {}, restart(p) { phase = p; }, hide() {},
        get phase() { return phase; }, get inPhase() { return 0.5; },
        get handle() { return handle; },
        hazards: () => ({ discs: [[1, 2, 0.5, 'x']] }),
        applyHazards(h) { handle.applied = h; },
        next() { phase += 1; ctx.phaseDone(phase); },
        ctx: () => ctx,
      };
    },
  };
}

describe('boss director', () => {
  it('keeps the boss in the combat list while his adds fight', async () => {
    const w = fakeWorld();
    const D = createBossDirector({ hud: w.hud, events: w.events, encounters: w.encounters, combat: w.combat, getPlayers: () => [], site: (s) => s });
    const def = D.register(fakeDef());
    await D.begin(def.id);
    const ctrl = D.controller;
    w.combat.setEnemies([ctrl.handle.e]);
    ctrl.ctx().adds(4);
    expect(w.combat.enemies).toContain(w.goon);
    expect(w.combat.enemies).toContain(ctrl.handle.e);
    // The encounter republishes (a goon died): the next tick puts him back.
    w.combat.setEnemies([w.goon]);
    D.update(0.016);
    expect(w.combat.enemies).toContain(ctrl.handle.e);
    // A new phase drops the pin (a phase may take him off the list on purpose).
    ctrl.next();
    w.combat.setEnemies([w.goon]);
    D.update(0.016);
    expect(w.combat.enemies).not.toContain(ctrl.handle.e);
  });
  it('resumes at a saved phase', async () => {
    const w = fakeWorld();
    const D = createBossDirector({ hud: w.hud, events: w.events, encounters: w.encounters, combat: w.combat, getPlayers: () => [], site: (s) => s });
    D.register(fakeDef('r'));
    D.resumeAt('r', 2);
    await D.begin('r');
    expect(D.controller.phase).toBe(2);
  });
  it('snapshot() and apply(): any boss, the Joker\'s shape plus pose and hazards', async () => {
    const w = fakeWorld();
    const host = createBossDirector({ hud: w.hud, events: w.events, encounters: w.encounters, combat: w.combat, getPlayers: () => [], site: (s) => s });
    host.register(fakeDef('s'));
    expect(host.snapshot()).toEqual({ on: false });
    await host.begin('s');
    const snap = host.snapshot();
    expect(snap).toMatchObject({ id: 's', on: true, phase: 0, phases: 3, name: 'TEST' });
    expect(typeof snap.bar).toBe('number');
    expect(snap.pos).toEqual([1, 2, 3]);
    expect(snap.hazards).toEqual({ discs: [[1, 2, 0.5, 'x']] });
    expect(host.simHint()).toEqual({ goTo: expect.any(Object) });
    const g = fakeWorld();
    const guest = createBossDirector({ hud: g.hud, events: g.events, encounters: g.encounters, combat: g.combat, getPlayers: () => [], site: (s) => s });
    guest.register(fakeDef('s'));
    await guest.apply(JSON.parse(JSON.stringify(snap)));
    expect(g.hud.bars.at(-1)[0]).toBe(true);
    await guest.apply({ on: false });
    expect(g.hud.bars.at(-1)[0]).toBe(false);
  });
});
