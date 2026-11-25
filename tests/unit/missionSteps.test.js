// [m67] The mission step types added for Nights Six and Seven (src/story/missions/**): their pure
// rules, their runtime shape against a fake story context, and the step graphs of the eight
// missions that use them (ids, order, save compatibility, sites, the brief's rules).
import { describe, it, expect } from 'vitest';
import { createHoldPoints, createEscape, createDeduction, validateDeduction } from '../../src/story/missions/logic.js';
import { buildMissionSteps, missionStepNames } from '../../src/story/missions/stepRegistry.js';
import { STEP_TYPES, nightById, stepsOf, canFinish } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { createRunner } from '../../src/story/runner.js';
import { pacingReport } from '../../src/story/pacing.js';
import { SITES } from '../../src/world/mapData.js';
import { REGION_SITES } from '../../src/world/regions/data.js';

describe('hold points (rescue, hack)', () => {
  it('a point needs a hero for the whole hold; passing through does not finish it', () => {
    const r = createHoldPoints(2, { hold: 2 });
    r.tick(1, [0]);
    expect(r.isDone(0)).toBe(false);
    r.tick(1, []); // walked off: drains at half speed
    expect(r.fraction(0)).toBeCloseTo(0.25);
    r.tick(1.6, [0]);
    expect(r.isDone(0)).toBe(true);
    expect(r.state).toBe('run');
    expect(r.left).toBe(1);
  });
  it('two heroes can work two points at once; all done ends it', () => {
    const r = createHoldPoints(2, { hold: 1 });
    const out = r.tick(1.1, [0, 1]);
    expect([...out.finished]).toEqual([0, 1]);
    expect(out.state).toBe('done');
  });
  it('the clock fails the run, each point finished buys time, reset starts over', () => {
    const r = createHoldPoints(2, { hold: 1, timer: 3, bonus: 5 });
    r.tick(1.1, [0]);
    expect(r.clock).toBeGreaterThan(6);
    expect(r.tick(10, []).state).toBe('fail');
    r.reset();
    expect(r.state).toBe('run');
    expect(r.clock).toBe(3);
    expect(r.left).toBe(2);
  });
  it('ordered: only the next point counts; finish() is the gadget path', () => {
    const r = createHoldPoints(3, { hold: 1, ordered: true });
    r.tick(2, [2]);
    expect(r.isDone(2)).toBe(false);
    expect(r.next).toBe(0);
    expect(r.finish(0)).toBe(true);
    expect(r.finish(0)).toBe(false);
    expect(r.next).toBe(1);
    expect(r.active()).toBe(-1);
  });
});

describe('escape', () => {
  it('lasts until the level has been up and is clear again', () => {
    const e = createEscape({ mercy: 100 });
    expect(e.tick(0.5, { level: 0 })).toBe('run'); // the scripted set has not landed yet
    expect(e.tick(1, { level: 2 })).toBe('run');
    expect(e.tick(30, { level: 2 })).toBe('run');
    expect(e.tick(0.5, { level: 0 })).toBe('run'); // one quiet frame is not an escape (cell to breakout)
    expect(e.tick(0.5, { level: 2 })).toBe('run');
    expect(e.tick(1, { level: 0 })).toBe('run');
    expect(e.tick(0.5, { level: 0 })).toBe('clear');
  });
  it('mercy: the chase is called off; never a wall', () => {
    const e = createEscape({ mercy: 60 });
    e.tick(1, { level: 3 });
    expect(e.tick(60, { level: 3 })).toBe('mercy');
  });
  it('no police system at all: ends on its own', () => {
    const e = createEscape({ fallback: 3 });
    expect(e.tick(1, { present: false })).toBe('run');
    expect(e.tick(2.5, { present: false })).toBe('clear');
  });
  it('a level that never rises still ends', () => {
    const e = createEscape({});
    expect(e.tick(4, { level: 0 })).toBe('run');
    expect(e.tick(5, { level: 0 })).toBe('clear');
  });
});

describe('case board deduction', () => {
  const def = { id: 'c', evidence: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], cards: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }, { id: 'z', text: 'Z' }], order: ['y', 'z', 'x'] };
  it('the board waits for the evidence; the right order solves it', () => {
    const d = createDeduction(def);
    expect(d.active.stage).toBe('scene');
    expect(d.answer(['y', 'z', 'x']).ok).toBe(false);
    d.find(0); d.find(1);
    expect(d.find(1)).toBe(false);
    expect(d.active.stage).toBe('reconstruct');
    expect(d.run.foundCount).toBe(2);
    expect(d.answer(['y', 'z', 'x'])).toMatchObject({ ok: true });
    expect(d.solved).toBe(true);
    expect(d.active.stage).toBe('solved');
  });
  it('two wrong orders mark the first card (the assist)', () => {
    const d = createDeduction(def);
    d.find(0); d.find(1);
    expect(d.answer(['x', 'y', 'z'])).toMatchObject({ ok: false, revealed: false });
    expect(d.answer(['x', 'z', 'y'])).toMatchObject({ ok: false, revealed: true });
    expect(d.run.revealed).toBe('y');
  });
  it('validates a step: every card once, not pre-solved, at most five', () => {
    expect(validateDeduction(def)).toEqual([]);
    expect(validateDeduction({ ...def, order: ['x', 'y', 'z'] }).length).toBe(1);
    expect(validateDeduction({ ...def, order: ['x', 'y'] }).length).toBeGreaterThan(0);
  });
});

// A fake story context: what src/story/storyRuntime.js hands every step type.
function fakeCtx(heroes) {
  const said = [], done = [], failed = [], emitted = [];
  const ctx = {
    markers: { place: (kind, p) => ({ kind, p }), color() {}, flash() {}, release() {} },
    ui: { timer() {}, meter() {} },
    radio: { say: (l) => { said.push(...l); return Promise.resolve(); } },
    hud: { card() {}, chip() {}, hint() {}, setObjective() {} },
    events: { emit: (type, d) => emitted.push({ type, ...d }), on: () => () => {} },
    standing: () => heroes, site: (id) => (typeof id === 'object' ? id : null), theGame: () => game,
    hero: heroes[0], prompts: null,
    done: (s, branch) => done.push(s.id), fail: (s) => failed.push(s.id),
    players: () => heroes.map((hero) => ({ hero })), nightId: () => 'n6', camp: () => ({}), replaying: () => false,
  };
  const game = { state: { detectiveOn: true }, wanted: null, vehicles: null };
  return { ctx, said, done, failed, emitted, game };
}
const hero = (x, z, y = 0) => ({ pos: { x, y, z } });

describe('the step types against a story context', () => {
  it('registers freeing, hack, escape, caseboard and tail, and the campaign accepts them', () => {
    for (const t of ['freeing', 'hack', 'escape', 'caseboard', 'tail']) { expect(missionStepNames()).toContain(t); expect(STEP_TYPES).toContain(t); }
  });
  it('freeing: either hero frees a point; done when all are free; the clock fails the mission', () => {
    const a = hero(0, 0), b = hero(50, 0);
    const k = fakeCtx([a, b]);
    const types = buildMissionSteps(k.ctx);
    const s = { id: 'r', type: 'freeing', hold: 1, timer: 30, points: [{ site: { x: 0, y: 0, z: 0 }, label: 'One', lines: [{ speaker: 'x', text: 'thanks' }] }, { site: { x: 50, y: 0, z: 0 }, label: 'Two' }] };
    types.freeing.enter(s);
    expect(types.freeing.debugSolve(s)).toHaveLength(2);
    types.freeing.update(0.6, s); types.freeing.update(0.6, s);
    expect(k.done).toEqual(['r']);
    expect(k.said.map((l) => l.text)).toContain('thanks');
    types.freeing.exit();
    const s2 = { ...s, id: 'r2', timer: 1 };
    a.pos.x = 200; b.pos.x = 200;
    types.freeing.enter(s2);
    types.freeing.update(2, s2);
    expect(k.failed).toEqual(['r2']);
    types.freeing.exit();
  });
  it('freeing: a hero on another floor does not count', () => {
    const k = fakeCtx([hero(0, 0, 12)]);
    const types = buildMissionSteps(k.ctx);
    const s = { id: 'r', type: 'freeing', hold: 0.5, points: [{ site: { x: 0, y: 0, z: 0 } }] };
    types.freeing.enter(s);
    types.freeing.update(1, s);
    expect(k.done).toEqual([]);
  });
  it('escape: raises the scripted level where the step says, ends when it clears, mercy clears it', () => {
    const k = fakeCtx([hero(0, 0)]);
    const calls = [];
    k.game.wanted = { level: 0, set(l, o) { this.level = l; calls.push(['set', l, o]); }, clear(r) { this.level = 0; calls.push(['clear', r]); } };
    const types = buildMissionSteps(k.ctx);
    const s = { id: 'e', type: 'escape', level: 3, at: { x: 5, y: 0, z: 6 }, mercy: 20, mercyLines: [{ speaker: 'gordon', text: 'called off' }] };
    types.escape.enter(s);
    expect(calls[0]).toEqual(['set', 3, { scripted: true, reason: 'n6:e', at: { x: 5, z: 6 } }]);
    types.escape.update(3, s);
    expect(k.done).toEqual([]);
    k.game.wanted.level = 0;
    types.escape.update(0.7, s); types.escape.update(0.7, s);
    expect(k.done).toEqual(['e']);
    types.escape.exit();
    types.escape.enter(s);
    types.escape.update(1, s); types.escape.update(25, s);
    expect(calls.at(-1)).toEqual(['clear', 'n6:e']);
    expect(k.said.map((l) => l.text)).toContain('called off');
    expect(k.done).toEqual(['e', 'e']);
  });
  it('escape: still surrounded when the struggle window is nearly up is a retry, not the holding cell', () => {
    const k = fakeCtx([hero(0, 0)]);
    const calls = [];
    k.game.wanted = { level: 0, caughtHero: null, custody: null, set(l) { this.level = l; }, clear(r) { this.level = 0; this.caughtHero = null; calls.push(r); } };
    const types = buildMissionSteps(k.ctx);
    const s = { id: 'e', type: 'escape', level: 2, mercy: 100, mercyLines: [{ speaker: 'g', text: 'x' }] };
    types.escape.enter(s);
    types.escape.update(1, s);
    k.game.wanted.caughtHero = {};
    types.escape.update(0.1, s); types.escape.update(1, s);
    expect(k.failed).toEqual([]);
    k.game.wanted.caughtHero = null; // struggled free
    types.escape.update(1, s);
    k.game.wanted.caughtHero = {};
    types.escape.update(0.1, s); types.escape.update(1.3, s); types.escape.update(1.3, s);
    expect(k.failed).toEqual(['e']);
    expect(calls).toEqual(['n6:e']);
    types.escape.update(5, s); // cleared for the retry: not an escape
    expect(k.done).toEqual([]);
    types.escape.onRespawn(s);
    expect(k.game.wanted.level).toBe(2);
    // the retry re-enters the step: the mercy call still counts the seconds already spent
    types.escape.exit(); types.escape.enter(s);
    expect(types.escape.escape.tick(0, { level: 2 })).toBe('run');
    types.escape.update(1, s);
    types.escape.update(96, s); // short of the full 100 s: not yet
    expect(k.done).toEqual([]);
    types.escape.update(2.5, s); // 100 s of mercy less the 2 s spent before the retry
    expect(k.done).toEqual(['e']);
  });
  it('caseboard: evidence needs detective vision; no board without a document (the answer is data)', () => {
    const h = hero(0, 0);
    const k = fakeCtx([h]);
    const types = buildMissionSteps(k.ctx);
    const s = { id: 'c', type: 'caseboard', hold: 0.5, evidence: [{ id: 'a', site: { x: 0, y: 0, z: 0 }, label: 'A' }, { id: 'b', site: { x: 30, y: 0, z: 0 }, label: 'B' }], cards: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }, { id: 'z', text: 'Z' }], order: ['z', 'x', 'y'] };
    types.caseboard.enter(s);
    k.game.state.detectiveOn = false;
    types.caseboard.update(1, s);
    expect(types.caseboard.deduction.run.foundCount).toBe(0);
    k.game.state.detectiveOn = true;
    types.caseboard.update(0.3, s); types.caseboard.update(0.3, s);
    expect(types.caseboard.deduction.run.foundCount).toBe(1);
    h.pos.x = 30;
    types.caseboard.update(0.3, s); types.caseboard.update(0.3, s);
    expect(types.caseboard.deduction.ready).toBe(true);
    expect(types.caseboard.debugOrder(s)).toEqual([3, 1, 2]);
    expect(k.emitted.filter((e) => e.type === 'caseClue')).toHaveLength(2);
    types.caseboard.exit();
  });
  it('tail: with no vehicle system it ends on its own', () => {
    const k = fakeCtx([hero(0, 0)]);
    const types = buildMissionSteps(k.ctx);
    const s = { id: 't', type: 'tail' };
    types.tail.enter(s);
    types.tail.update(1, s);
    expect(k.done).toEqual([]);
    types.tail.update(1.5, s);
    expect(k.done).toEqual(['t']);
  });
  it('tail: starts once she is at the wheel; spotted restarts it near the car, arriving ends it', () => {
    const k = fakeCtx([hero(0, 0)]);
    const started = [];
    const bm = {};
    k.game.vehicles = { batmobile: bm, active: null, chases: { startTail(o) { started.push(o); return { id: started.length }; }, stop() {} } };
    const types = buildMissionSteps(k.ctx);
    const s = { id: 't', type: 'tail', from: { x: 1, y: 0, z: 2 }, spottedLines: [{ speaker: 'oracle', text: 'made' }] };
    types.tail.enter(s);
    types.tail.update(5, s);
    expect(started).toHaveLength(0);
    k.game.vehicles.active = bm;
    types.tail.update(2, s);
    expect(started[0].from).toEqual({ x: 1, y: 0, z: 2 });
    started[0].onDone({ ok: false, why: 'spotted' });
    expect(k.said.map((l) => l.text)).toContain('made');
    types.tail.update(4, s);
    expect(started).toHaveLength(2);
    expect(started[1].from).toBeUndefined();
    started[1].onDone({ ok: true, why: 'arrived' });
    expect(k.done).toEqual(['t']);
  });
});

// [m67] Firefly's swoop (src/bosses/defs/firefly.js): the ring is always on his low run.
describe('Firefly: the swoop reaches its ring', () => {
  it('he stays low until he is past the ring, never less than before, never across the whole park', async () => {
    const { SWOOP, swoopLow } = await import('../../src/bosses/defs/firefly.js');
    expect(swoopLow(10)).toBe(SWOOP.low);
    expect(swoopLow(0)).toBe(SWOOP.low);
    for (const reach of [30, 44, 55, 65, 80]) expect(swoopLow(reach) * SWOOP.speed, `ring at ${reach} m`).toBeGreaterThan(reach);
    expect(swoopLow(400)).toBe(SWOOP.maxLow);
    // the rules a ram is judged by did not move
    expect(SWOOP.ramSpeed).toBe(8);
    expect(SWOOP.reach).toBe(4.6);
  });
});

// ---------------------------------------------------------------- the missions' step graphs
const NEW = {
  n6: { m6Tower: 'm6Sleepwalkers', m6Press: 'm6Tower', m6Case: 'm6Detective', m6Marina: 'm6Truck' },
  n7: { m7Case: 'm7Dock', m7Hall: 'm7Case', m7El: 'm7Hall', m7Lounge: 'm7Bridges' },
};
// The step ids each night had before this round, in order: saves park on these.
const OLD = {
  n6: ['n6Recap', 'n6Party', 'n6Garden', 'n6Toast', 'n6GreenhouseFight', 'n6ToPark', 'n6FountainFight', 'n6Roots', 'n6ToMirror', 'n6Commuters', 'n6Canopy', 'n6ShellRoom', 'n6ToBoathouse', 'n6Ostrow', 'n6Board', 'n6Chase', 'n6Twist', 'n6ToRoof', 'n6Count', 'n6Boss', 'n6Home', 'n6IfLeft', 'n6ManorVines', 'n6ManorQuiet', 'n6Orchids', 'n6End'],
  n7: ['n7Recap', 'n7Party', 'n7Signal', 'n7ToLower', 'n7IfLate', 'n7LowerBig', 'n7LowerFight', 'n7Tankers', 'n7DockRoom', 'n7Filing', 'n7Twist', 'n7Bridges', 'n7Board', 'n7Convoy', 'n7Chase', 'n7ToDrive', 'n7Boss', 'n7Hydrant', 'n7End'],
};
const BRAWL = (n, s) => s.type === 'fight' && !n.fights[s.fight].stealth && !s.thralls && !s.boss && !s.locks && !s.calls;

for (const id of ['n6', 'n7']) {
  describe(`${id}: the four added missions`, () => {
    const n = nightById(id);
    const steps = stepsOf(n);
    const siteOf = (x) => (typeof x === 'object' ? x : n.sites?.[x] ?? SITES[x] ?? REGION_SITES[x]);
    it('are in the night, each right after the mission its story follows', () => {
      const order = n.missions.map((m) => m.id);
      for (const [m, after] of Object.entries(NEW[id])) expect(order.indexOf(m), m).toBe(order.indexOf(after) + 1);
    });
    it('old saves resume: every earlier step id is still there, in the same order', () => {
      const ids = steps.map((s) => s.id);
      const kept = ids.filter((x) => OLD[id].includes(x));
      expect(kept).toEqual(OLD[id]);
      for (const old of OLD[id]) expect(createRunner(steps, ids.indexOf(old)).step.id).toBe(old);
    });
    it('each has 4 to 9 steps, mixes at least three kinds of play, and can finish', () => {
      for (const m of Object.keys(NEW[id])) {
        const ms = steps.filter((s) => s.mission === m);
        expect(ms.length, m).toBeGreaterThanOrEqual(4);
        expect(ms.length, m).toBeLessThanOrEqual(9);
        expect(new Set(ms.map((s) => (s.type === 'fight' && n.fights[s.fight].stealth ? 'stealth' : s.type ?? 'reach'))).size, m).toBeGreaterThanOrEqual(3);
        for (const s of ms) expect(canFinish(s), s.id).toBe(true);
      }
    });
    it('at most one plain brawl among them, and no extra optional skirmishes', () => {
      const added = steps.filter((s) => s.mission in NEW[id]);
      expect(added.filter((s) => BRAWL(n, s)).length).toBeLessThanOrEqual(1);
      expect(added.flatMap((s) => s.interrupts ?? [])).toEqual([]);
    });
    it('every place the new step types name is a real site', () => {
      for (const s of steps.filter((x) => missionStepNames().includes(x.type))) {
        expect(s.site, `${s.id}: these types take no site`).toBeUndefined();
        for (const p of [...(s.points ?? []), ...(s.terminals ?? []), ...(s.evidence ?? [])]) expect(Number.isFinite(siteOf(p.site)?.x), `${s.id} ${p.site}`).toBe(true);
        for (const k of ['at', 'hide', 'from']) if (s[k]) expect(Number.isFinite(siteOf(s[k])?.x), `${s.id}.${k}`).toBe(true);
        if (s.type === 'caseboard') expect(validateDeduction(s), s.id).toEqual([]);
        if (s.type === 'escape') { expect(s.level).toBeGreaterThanOrEqual(1); expect(s.level).toBeLessThanOrEqual(4); expect(s.mercy ?? 150).toBeLessThanOrEqual(180); expect(s.mercyLines?.length).toBeGreaterThan(0); }
        if (s.type === 'freeing') expect(s.timer, s.id).toBeGreaterThan(0);
        for (const l of [...(s.doneLines ?? []), ...(s.failLines ?? []), ...(s.mercyLines ?? []), ...(s.readyLines ?? []), ...(s.solvedLines ?? [])]) expect(typeof l.text).toBe('string');
      }
    });
    it('every added step is quiet: no open-world predator encounter may start under it', () => {
      for (const s of steps) expect(!!s.quiet, s.id).toBe(s.mission in NEW[id]);
    });
    it('a tail is always behind a board step (the hero is at the wheel)', () => {
      steps.forEach((s, i) => { if (s.type === 'tail') expect(steps[i - 1].type, s.id).toBe('board'); });
    });
    it('the reward schedule did not move: the added missions pay XP only', () => {
      for (const m of n.missions.filter((x) => x.id in NEW[id])) for (const r of m.rewards ?? []) expect(r.startsWith('xp:'), `${m.id} ${r}`).toBe(true);
    });
    it('hard stops stay within the night budget', () => {
      expect(pacingReport(steps).hardStops).toBeLessThanOrEqual(4);
    });
  });
}
