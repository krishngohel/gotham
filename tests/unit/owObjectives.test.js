import { describe, it, expect } from 'vitest';
import { createObjective, createFacts, pointAt, pathLength, LEAF_KINDS } from '../../src/openworld/objectives.js';
import { createRng } from '../../src/core/rng.js';

const facts = (heroes = [], extra = {}) => {
  const f = createFacts();
  heroes.forEach((h, i) => Object.assign(f.heroes[i], { y: 0, detective: false, crouched: false, dead: false }, h));
  f.nHeroes = heroes.length;
  return Object.assign(f, extra);
};
const run = (o, f, secs, dt = 0.1) => { let r = 'run'; for (let t = 0; t < secs && r === 'run'; t += dt) r = o.step(dt, f); return r; };
const line = (x0, x1, y = 0) => [{ x: x0, y, z: 0 }, { x: x1, y, z: 0 }];

describe('objective leaves', () => {
  it('lists every leaf kind', () => {
    expect(LEAF_KINDS).toEqual(expect.arrayContaining(['defeat', 'protect', 'defuse', 'chase', 'getaway', 'interrupt', 'war', 'hold', 'sniper', 'rescue', 'trail', 'tail', 'board', 'reach', 'clock']));
  });
  it('defeat waits for the squad and wins when it is down', () => {
    const o = createObjective({ kind: 'defeat' });
    const f = facts([{ x: 0, z: 0 }]);
    expect(o.step(0.1, f)).toBe('run');
    f.materialized = true; f.squad.total = 4; f.squad.alive = 2;
    expect(o.step(0.1, f)).toBe('run');
    f.squad.alive = 0;
    expect(o.step(0.1, f)).toBe('won');
  });
  it('defeat with a timer is lost when the crew finishes the job', () => {
    const o = createObjective({ kind: 'defeat', timer: 5 });
    const f = facts([{ x: 0, z: 0 }], { materialized: true, engaged: true });
    f.squad.total = 3; f.squad.alive = 3;
    expect(run(o, f, 10)).toBe('lost');
  });
  it('protect: panic climbs with the crew there and no hero, calms with a hero beside', () => {
    const o = createObjective({ kind: 'protect', at: { x: 0, y: 0, z: 0 }, civilians: [{ dx: 0, dz: 0, panic: 0.2 }], rise: 0.1 });
    const far = facts([{ x: 100, z: 0 }], { materialized: true });
    far.squad.total = 3; far.squad.alive = 3;
    o.step(1, far);
    const a = o.civilians[0].panic;
    expect(a).toBeGreaterThan(0.2);
    const near = facts([{ x: 1, z: 0 }], { materialized: true });
    near.squad.total = 3; near.squad.alive = 3;
    o.step(1, near);
    expect(o.civilians[0].panic).toBeLessThan(a);
    expect(o.hud().label).toBe('PANIC');
  });
  it('protect: a civilian left too long is hurt; everyone hurt loses', () => {
    const o = createObjective({ kind: 'protect', at: { x: 0, y: 0, z: 0 }, civilians: [{ dx: 0, dz: 0 }], rise: 0.5 });
    const f = facts([{ x: 100, z: 0 }], { materialized: true });
    f.squad.total = 3; f.squad.alive = 3;
    expect(run(o, f, 10)).toBe('lost');
    expect(o.outcome.hurt).toBe(1);
  });
  it('protect: the crew down with civilians standing is a save', () => {
    const o = createObjective({ kind: 'protect', at: { x: 0, y: 0, z: 0 }, civilians: [{ dx: 0, dz: 0 }, { dx: 2, dz: 0 }] });
    const f = facts([{ x: 1, z: 0 }], { materialized: true });
    f.squad.total = 3; f.squad.alive = 0;
    expect(o.step(0.1, f)).toBe('won');
    expect(o.outcome.saved).toBe(2);
  });
  it('protect with a dead-man trigger: an alarm spikes the panic', () => {
    const quiet = createObjective({ kind: 'protect', at: { x: 0, y: 0, z: 0 }, deadMan: true, civilians: [{ dx: 0, dz: 0, panic: 0.2 }] });
    const loud = createObjective({ kind: 'protect', at: { x: 0, y: 0, z: 0 }, deadMan: true, civilians: [{ dx: 0, dz: 0, panic: 0.2 }] });
    const f = facts([{ x: 30, z: 0 }], { materialized: true }); f.squad.total = 2; f.squad.alive = 2;
    quiet.step(0.5, f);
    f.squad.alarm = true;
    loud.step(0.5, f);
    expect(loud.civilians[0].panic).toBeGreaterThan(quiet.civilians[0].panic + 0.5);
  });
  it('defuse: presses inside the window count, misses cost time', () => {
    const o = createObjective({ kind: 'defuse', at: { x: 0, y: 0, z: 0 }, bombs: [{ dx: 0, dz: 0 }], timer: 60, need: 3, miss: 10 }, createRng(1));
    const b = o.bombs[0];
    b.phase = 0.5;
    expect(o.press(b)).toBe(true);
    b.phase = 0.05;
    const before = o.clock;
    expect(o.press(b)).toBe(false);
    expect(o.clock).toBe(before - 10);
    b.phase = 0.5; o.press(b); b.phase = 0.5; o.press(b);
    expect(b.done).toBe(true);
    expect(o.step(0.1, facts([{ x: 50, z: 0 }]))).toBe('won');
  });
  it('defuse: the interact press of the hero standing at the bomb drives the dial; the clock can run out', () => {
    const o = createObjective({ kind: 'defuse', at: { x: 0, y: 0, z: 0 }, bombs: [{ dx: 0, dz: 0 }], timer: 3, speed: 0 }, createRng(2));
    o.bombs[0].phase = 0.5;
    const f = facts([{ x: 0.5, z: 0 }]);
    f.press[0] = true;
    o.step(0.1, f);
    expect(o.bombs[0].hits).toBe(1);
    f.press[0] = false;
    expect(run(o, f, 5)).toBe('lost');
  });
  it('defuse: a decoy scanned in detective vision is cleared without the dial', () => {
    const o = createObjective({ kind: 'defuse', at: { x: 0, y: 0, z: 0 }, bombs: [{ dx: 0, dz: 0, decoy: true }, { dx: 20, dz: 0 }], timer: 60 }, createRng(3));
    o.step(0.1, facts([{ x: 0.5, z: 0, detective: true }]));
    expect(o.bombs[0].done).toBe(true);
    expect(o.bombs[1].done).toBe(false);
  });
  it('chase: a runner moves along its path; reaching it catches, losing it escapes', () => {
    const o = createObjective({ kind: 'chase', runners: [{ path: line(0, 60), speed: 6 }] });
    const f = facts([{ x: -5, z: 0 }]);
    o.step(1, f);
    expect(o.runners[0].x).toBeGreaterThan(4);
    f.heroes[0].x = o.runners[0].x + 1;
    expect(o.step(0.1, f)).toBe('won');
    const p = createObjective({ kind: 'chase', runners: [{ path: line(0, 30), speed: 6 }] });
    expect(run(p, facts([{ x: -200, z: 0 }]), 30)).toBe('lost');
  });
  it('chase: a strike (facts.hit) catches; `need` 2 of 3 carriers', () => {
    const o = createObjective({ kind: 'chase', need: 2, runners: [0, 1, 2].map((i) => ({ path: line(i * 100, i * 100 + 80), speed: 5 })) });
    const f = facts([{ x: -500, z: 0 }]);
    f.hit[0] = 1; f.hit[2] = 1;
    expect(o.step(0.1, f)).toBe('won');
    expect(o.outcome.caught).toBe(2);
  });
  it('chase: a sleeping runner waits until a hero is near', () => {
    const o = createObjective({ kind: 'chase', wake: 20, runners: [{ path: line(0, 60) }] });
    o.step(1, facts([{ x: 100, z: 0 }]));
    expect(o.runners[0].s).toBe(0);
    o.step(1, facts([{ x: 15, z: 0 }]));
    expect(o.runners[0].s).toBeGreaterThan(0);
  });
  it('getaway: the driver waits, then drives to the exit; standing alongside stops it', () => {
    const o = createObjective({ kind: 'getaway', path: line(0, 100), delay: 2, speed: 10, hold: 1 });
    const f = facts([{ x: -60, z: 0 }], { engaged: true });
    o.step(1, f);
    expect(o.car.moving).toBe(false);
    o.step(1.5, f);
    expect(o.car.moving).toBe(true);
    f.heroes[0].x = o.car.x + 1;
    o.step(0.6, f);
    f.heroes[0].x = o.car.x + 1;
    expect(o.step(0.6, f)).toBe('won');
    const lost = createObjective({ kind: 'getaway', path: line(0, 50), delay: 0, speed: 20 });
    expect(run(lost, facts([{ x: -300, z: 0 }]), 10)).toBe('lost');
    expect(lost.outcome.getaway).toBe(1);
  });
  it('getaway: the crew down before the car moves and the driver gives up', () => {
    const o = createObjective({ kind: 'getaway', path: line(0, 100), delay: 20 });
    const f = facts([{ x: -60, z: 0 }], { materialized: true, engaged: true });
    f.squad.total = 4; f.squad.alive = 1;
    expect(o.step(1, f)).toBe('run');
    f.squad.alive = 0;
    expect(o.step(0.1, f)).toBe('won');
  });
  it('getaway with a vehicle mirrors the chase adapter', () => {
    const o = createObjective({ kind: 'getaway', vehicle: true, path: line(0, 50) });
    expect(o.step(0.1, facts([], { chase: 'run' }))).toBe('run');
    expect(o.step(0.1, facts([], { chase: 'won' }))).toBe('won');
  });
  it('interrupt: silent win, or escalate on the alarm', () => {
    const o = createObjective({ kind: 'interrupt', onAlarm: 'escalate' });
    const f = facts([], { materialized: true }); f.squad.total = 4; f.squad.alive = 4;
    expect(o.step(0.1, f)).toBe('run');
    f.squad.alarm = true;
    expect(o.step(0.1, f)).toBe('escalate');
    expect(o.outcome.silent).toBe(0);
    const q = createObjective({ kind: 'interrupt' });
    const g = facts([], { materialized: true }); g.squad.total = 2; g.squad.alive = 0;
    expect(q.step(0.1, g)).toBe('won');
    expect(q.outcome.silent).toBe(1);
  });
  it('war: stop both, or a truce once one side is down (hit them and the truce is off)', () => {
    const both = createObjective({ kind: 'war', gangs: ['a', 'b'] });
    const f = facts([], { materialized: true, engaged: true, gangAlive: { a: 0, b: 0 } });
    expect(both.step(0.1, f)).toBe('won');
    const side = createObjective({ kind: 'war', gangs: ['a', 'b'], truce: 3 });
    const g = facts([], { materialized: true, engaged: true, gangAlive: { a: 0, b: 3 } });
    expect(run(side, g, 5)).toBe('won');
    expect(side.outcome.sided).toBe('b');
    const broken = createObjective({ kind: 'war', gangs: ['a', 'b'], truce: 3 });
    const h = facts([], { materialized: true, engaged: true, gangAlive: { a: 0, b: 3 } });
    broken.step(0.1, h);
    h.struckGang = 'b';
    expect(run(broken, h, 5)).toBe('run');
    expect(broken.outcome.sided).toBe(null);
  });
  it('hold: fills while a hero is in the zone, wins once full with the crew down', () => {
    const o = createObjective({ kind: 'hold', at: { x: 0, y: 0, z: 0 }, radius: 5, time: 4 });
    const f = facts([{ x: 1, z: 0 }], { materialized: true }); f.squad.total = 3; f.squad.alive = 1;
    run(o, f, 5);
    expect(o.meter).toBe(1);
    f.squad.alive = 0;
    expect(o.step(0.1, f)).toBe('won');
  });
  it('sniper: standing tall in a sightline gets the police shot (collateral); crouching does not', () => {
    const nest = { x: 0, y: 0, z: 0, yaw: 0, range: 40 };
    const o = createObjective({ kind: 'sniper', nests: [nest], spot: 1 });
    const f = facts([{ x: 0, z: 10 }]);
    run(o, f, 1.5);
    expect(o.outcome.collateral).toBe(1);
    const p = createObjective({ kind: 'sniper', nests: [nest], spot: 1 });
    run(p, facts([{ x: 0, z: 10, crouched: true }]), 3);
    expect(p.outcome.collateral).toBe(0);
    run(p, facts([{ x: 0, z: -10 }]), 3);
    expect(p.outcome.collateral).toBe(0); // behind the nest
  });
  it('rescue: reaching each person in time saves them; the fire takes the rest', () => {
    const o = createObjective({ kind: 'rescue', at: { x: 0, y: 0, z: 0 }, burn: 2, stagger: 0, people: [{ dx: 0, dz: 0 }, { dx: 50, dz: 0 }] });
    expect(run(o, facts([{ x: 0, z: 0.5 }]), 5)).toBe('won');
    expect(o.outcome.saved).toBe(1);
    expect(o.outcome.hurt).toBe(1);
  });
  it('trail: clues in order, only in detective vision', () => {
    const o = createObjective({ kind: 'trail', points: [{ x: 0, z: 0 }, { x: 20, z: 0 }], hold: 0.5 });
    run(o, facts([{ x: 0, z: 0 }]), 2);
    expect(o.index).toBe(0);
    run(o, facts([{ x: 0, z: 0, detective: true }]), 1);
    expect(o.index).toBe(1);
    expect(run(o, facts([{ x: 20, z: 0, detective: true }]), 1)).toBe('won');
  });
  it('tail: too close spooks the target (escalate), too far loses it, the band arrives', () => {
    const spook = createObjective({ kind: 'tail', path: line(0, 200), speed: 2, min: 10, max: 40, spook: 1 });
    expect(run(spook, facts([{ x: 2, z: 0 }]), 3)).toBe('escalate');
    const lose = createObjective({ kind: 'tail', path: line(0, 200), speed: 2, min: 10, max: 40, lose: 2 });
    lose.step(0.1, facts([{ x: -20, z: 0 }]));
    expect(run(lose, facts([{ x: -200, z: 0 }]), 5)).toBe('lost');
    const ok = createObjective({ kind: 'tail', path: line(0, 20), speed: 4, min: 5, max: 40 });
    const f = facts([{ x: -15, z: 0 }]);
    let r = 'run';
    for (let i = 0; i < 100 && r === 'run'; i++) { f.heroes[0].x = ok.target.x - 15; r = ok.step(0.1, f); }
    expect(r).toBe('won');
  });
  it('board: reach the train before it makes its stops', () => {
    const o = createObjective({ kind: 'board', stops: 2 });
    const train = { x: 0, y: 8, z: 0, stopped: false };
    expect(o.step(0.1, facts([{ x: 100, z: 0 }], { train }))).toBe('run');
    expect(o.step(0.1, facts([{ x: 5, y: 8.5, z: 0 }], { train }))).toBe('won');
    const late = createObjective({ kind: 'board', stops: 2 });
    for (const stopped of [true, false, true, false, true]) late.step(0.1, facts([{ x: 100, z: 0 }], { train: { ...train, stopped } }));
    expect(late.step(0.1, facts([{ x: 100, z: 0 }], { train: { ...train, stopped: true } }))).toBe('lost');
  });
});

describe('composites', () => {
  it('seq runs parts in order; all needs every part; any wins on the first', () => {
    const s = createObjective({ kind: 'seq', parts: [{ kind: 'reach', at: { x: 0, z: 0 } }, { kind: 'reach', at: { x: 50, z: 0 } }] });
    expect(s.step(0.1, facts([{ x: 0, z: 0 }]))).toBe('run');
    expect(s.index).toBe(1);
    expect(s.step(0.1, facts([{ x: 50, z: 0 }]))).toBe('won');
    const a = createObjective({ kind: 'all', parts: [{ kind: 'reach', at: { x: 0, z: 0 } }, { kind: 'reach', at: { x: 50, z: 0 } }] });
    expect(a.step(0.1, facts([{ x: 0, z: 0 }]))).toBe('run');
    expect(a.step(0.1, facts([{ x: 50, z: 0 }]))).toBe('won');
    const y = createObjective({ kind: 'any', parts: [{ kind: 'reach', at: { x: 0, z: 0 } }, { kind: 'clock', timer: 1 }] });
    expect(y.step(0.1, facts([{ x: 0, z: 0 }]))).toBe('won');
    const z = createObjective({ kind: 'any', parts: [{ kind: 'reach', at: { x: 0, z: 0 } }, { kind: 'clock', timer: 1 }] });
    expect(run(z, facts([{ x: 90, z: 0 }]), 3)).toBe('lost');
  });
  it('an optional part that fails does not fail the whole, but its outcome counts', () => {
    const o = createObjective({ kind: 'all', parts: [{ kind: 'reach', at: { x: 0, z: 0 } }, { kind: 'protect', optional: true, at: { x: 90, y: 0, z: 0 }, civilians: [{ dx: 0, dz: 0 }], rise: 1 }] });
    const f = facts([{ x: 0, z: 0 }], { materialized: true }); f.squad.total = 2; f.squad.alive = 2;
    run(o, f, 3);
    f.squad.alive = 0;
    expect(o.step(0.1, f)).toBe('won');
    expect(o.outcome().hurt).toBe(1);
  });
  it('escalation splices a new part in (the deal money runs)', () => {
    const o = createObjective({ kind: 'seq', parts: [{ kind: 'interrupt', onAlarm: 'escalate' }] });
    const f = facts([{ x: 0, z: 0 }], { materialized: true }); f.squad.total = 2; f.squad.alive = 2; f.squad.alarm = true;
    expect(o.step(0.1, f)).toBe('escalate');
    o.add({ kind: 'chase', runners: [{ path: line(0, 50) }] });
    f.squad.alive = 0;
    f.heroes[0].x = -100;
    expect(o.step(0.1, f)).toBe('run');
    expect(o.index).toBe(1);
  });
  it('the facts object and the steps allocate nothing new per step (same leaves, same state)', () => {
    const o = createObjective({ kind: 'all', parts: [{ kind: 'defeat' }, { kind: 'chase', runners: [{ path: line(0, 500) }] }] });
    const f = facts([{ x: -50, z: 0 }]);
    const r = o.leaves[1].runners[0];
    for (let i = 0; i < 50; i++) o.step(0.016, f);
    expect(o.leaves[1].runners[0]).toBe(r);
  });
});

describe('paths', () => {
  it('measures and samples, with hops arcing over gaps', () => {
    const pts = [{ x: 0, y: 10, z: 0 }, { x: 10, y: 10, z: 0, hop: true }];
    expect(pathLength(pts)).toBe(10);
    const out = {};
    pointAt(pts, 5, out);
    expect(out.y).toBeGreaterThan(10);
    expect(out.air).toBe(true);
    pointAt(pts, 50, out);
    expect(out.x).toBe(10);
  });
});
