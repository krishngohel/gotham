// [m45] The missions added to Nights Four and Five (docs/design/briefs/missions-round.md): the
// step graphs (old ids keep their order, every new branch comes back onto the night), the data the
// new beats need, and the `hunted` step type (its pure rules and its runtime against a fake police
// system).
import { describe, it, expect, vi } from 'vitest';
import { nightById, stepsOf, STEP_TYPES } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { createRunner } from '../../src/story/runner.js';
import { buildFight } from '../../src/story/fightBuilder.js';
import { HUNTED, huntedRules, huntedLevel, huntedVerdict } from '../../src/story/missions/n4/huntedLogic.js';
import { createHuntedStep } from '../../src/story/missions/n4/hunted.js';
import { N4_STEP_TYPES } from '../../src/story/missions/n4/index.js';
import { huntedRules as evadeRulesOf } from '../../src/story/missions/n4/huntedLogic.js';
import { pickupDue, createWingPickup, PICKUP_EVERY, PICKUP_FOR } from '../../src/story/missions/n4/wingPickup.js';

// The step ids each night had before this round, in order: saves name them, so they stay, in order.
const BEFORE = {
  n4: ['n4Recap', 'n4Start', 'n4Scan', 'n4MarketFight', 'n4Highway', 'n4RookeryRoom', 'n4Canister', 'n4Board', 'n4Chase', 'n4Dilemma', 'n4ClinicVisit', 'n4GymFight', 'n4Ostrow', 'n4Twist', 'n4ToAlley', 'n4Fear', 'n4AlleyFight', 'n4ToStack', 'n4IfHurt', 'n4StackGuard', 'n4Climb', 'n4Boss', 'n4Sample', 'n4End'],
  n5: ['n5Recap', 'n5Start', 'n5Scan', 'n5ToFurnace', 'n5FurnaceFight', 'n5Silos', 'n5Vista', 'n5Board', 'n5Chase', 'n5Dilemma', 'n5Ribbon', 'n5CrusherFight', 'n5ToRoundhouse', 'n5RoundhouseRoom', 'n5Ledger', 'n5Twist', 'n5Choice', 'n5WorkersFight', 'n5CoresFight', 'n5ToPlant', 'n5IfCold', 'n5PlantGuard', 'n5Roof', 'n5Boss', 'n5Core', 'n5End'],
};
const ADDED = {
  n4: { m4Case: ['n4ToChinatown', 'n4CaseScan', 'n4Deduce', 'n4WrongFireworks', 'n4WrongTemple', 'n4BackToKettle', 'n4KettleYard', 'n4Runner', 'n4Satchel', 'n4KettleDoor'], m4Broker: ['n4Kettle', 'n4ToQuay', 'n4QuayRoom', 'n4Stabiliser', 'n4Cranes', 'n4CranesDone', 'n4DockRoom', 'n4Book'], m4Cordon: ['n4ToCordon', 'n4Hunted', 'n4Strays', 'n4ElRescue', 'n4HuntedAgain', 'n4Doses'], m4Balloons: ['n4ToWingRoof', 'n4BalloonsUp', 'n4LaunchFight', 'n4Manifest', 'n4BalloonsEast', 'n4HeliumBoard', 'n4HeliumChase'] },
  n5: { m5Pressure: ['n5ToCabin', 'n5Valves', 'n5Gantry', 'n5CapShut', 'n5Hatch'], m5Odessa: ['n5ToOdessa', 'n5TruckScan', 'n5Bearings', 'n5ToClub', 'n5Club', 'n5ToBathRoof', 'n5BathRoom', 'n5Codes'], m5Freight: ['n5ViaductRun', 'n5PensRoom', 'n5Reefer', 'n5PensHold'], m5Ice: ['n5Board2', 'n5IceBattle', 'n5ControlChase'] },
};
const finish = (s, branch) => {
  const ev = { type: 'stepDone', id: s.id };
  if (branch) ev.branch = branch;
  return ev;
};
// Walks from a step to the night's end, taking `pick(step)` at every branching step.
function walk(steps, from, pick = () => null) {
  const r = createRunner(steps, steps.findIndex((s) => s.id === from));
  const seen = [];
  for (let guard = 0; guard < steps.length * 3 && r.step && r.step.type !== 'nightEnd'; guard++) {
    seen.push(r.step.id);
    const s = r.step;
    const branch = pick(s) ?? (s.type === 'fork' ? s.options[0].id : s.branches ? Object.keys(s.branches)[0] : null);
    expect(r.handle(finish(s, branch)), s.id).toBe(true);
  }
  expect(r.step?.type).toBe('nightEnd');
  return seen;
}

describe('[m45] Nights Four and Five: the step graphs', () => {
  for (const id of ['n4', 'n5']) {
    const night = nightById(id);
    const steps = stepsOf(night);
    const ids = steps.map((s) => s.id);
    it(`${id}: every step id it had before is still there, in the same order`, () => {
      expect(ids.filter((x) => BEFORE[id].includes(x))).toEqual(BEFORE[id]);
      expect(steps[0].id).toBe(BEFORE[id][0]);
      expect(steps.at(-1).id).toBe(BEFORE[id].at(-1));
    });
    it(`${id}: four new missions, their steps in order, none reusing an old id`, () => {
      expect(Object.keys(ADDED[id])).toHaveLength(4);
      for (const [mission, list] of Object.entries(ADDED[id])) {
        const m = night.missions.find((x) => x.id === mission);
        expect(m, mission).toBeDefined();
        expect(m.steps.map((s) => s.id)).toEqual(list);
        for (const s of list) expect(BEFORE[id]).not.toContain(s);
        expect(m.title.length).toBeGreaterThan(3);
      }
      expect(night.missions).toHaveLength(id === 'n4' ? 13 : 13);
    });
    it(`${id}: a save parked on any old step still walks to the night's end`, () => {
      for (const from of BEFORE[id].slice(0, -1)) walk(steps, from);
    });
    it(`${id}: the new missions pay through the mission path only (xp ids, no gadget, no ability)`, () => {
      for (const mission of Object.keys(ADDED[id])) {
        const m = night.missions.find((x) => x.id === mission);
        for (const r of m.rewards ?? []) expect(r, mission).toMatch(/^xp:\d+$/);
        for (const s of m.steps) { expect(s.reward, s.id).toBeUndefined(); expect(s.rewards, s.id).toBeUndefined(); }
      }
    });
    it(`${id}: every step type is one the campaign knows, and no new mission is only a brawl`, () => {
      let brawls = 0;
      for (const mission of Object.keys(ADDED[id])) {
        const m = night.missions.find((x) => x.id === mission);
        const kinds = new Set(m.steps.map((s) => s.type ?? 'reach'));
        for (const k of kinds) expect(STEP_TYPES).toContain(k);
        const fights = m.steps.filter((s) => s.type === 'fight' && !night.fights[s.fight].stealth);
        brawls += fights.length;
        expect([...kinds].some((k) => k !== 'fight' && k !== 'reach'), mission).toBe(true);
      }
      expect(brawls).toBeLessThanOrEqual(1);
    });
  }

  it('n4: the deduction has one right door; a wrong one costs a walk and comes back to the tea house', () => {
    const steps = stepsOf('n4');
    const fork = steps.find((s) => s.id === 'n4Deduce');
    expect(fork.options.map((o) => o.id).sort()).toEqual(['fireworks', 'kettle', 'temple']);
    expect(fork.branches.kettle).toBe('n4KettleYard');
    for (const wrong of ['fireworks', 'temple']) {
      const seen = walk(steps, 'n4Deduce', (s) => (s.id === 'n4Deduce' ? wrong : null));
      expect(seen.slice(0, 4)).toEqual(['n4Deduce', fork.branches[wrong], 'n4BackToKettle', 'n4KettleYard']);
    }
    const right = walk(steps, 'n4Deduce', (s) => (s.id === 'n4Deduce' ? 'kettle' : null));
    expect(right.slice(0, 6)).toEqual(['n4Deduce', 'n4KettleYard', 'n4Runner', 'n4Satchel', 'n4KettleDoor', 'n4Kettle']);
    expect(right).not.toContain('n4BackToKettle');
    // Each clue rules a suspect out in words the player hears.
    const clues = steps.find((s) => s.id === 'n4CaseScan').points.flatMap((p) => p.lines.map((l) => l.text)).join(' ');
    for (const word of ['west', 'cash', 'Jasmine']) expect(clues).toContain(word);
  });
  it('n4: the Batwing is boarded from a roof, so the balloons start on one', () => {
    const night = nightById('n4');
    const steps = stepsOf(night);
    const i = steps.findIndex((s) => s.id === 'n4BalloonsUp');
    expect(steps[i].type).toBe('armada');
    expect(steps[i].talk).toBe('over');
    expect(night.sites[steps[i - 1].site].y).toBeGreaterThan(5); // batwing.js canCall: on a roof
    expect(night.sites[steps[i].site].y).toBeGreaterThan(40);
  });
  it('n4: the new missions sit where the plot needs them', () => {
    const order = nightById('n4').missions.map((m) => m.id);
    expect(order).toEqual(['m4Fog', 'm4Market', 'm4Highway', 'm4Rookery', 'm4Case', 'm4Broker', 'm4Ambulance', 'm4Cordon', 'm4Clinic', 'm4Alley', 'm4Balloons', 'm4Stack', 'm4After']);
  });
  it('n4: the hunt is an hunted step with a place to hide, a retry and every line it can say', () => {
    const night = nightById('n4');
    const s = stepsOf(night).find((x) => x.id === 'n4Hunted');
    expect(s.type).toBe('hunted');
    expect(N4_STEP_TYPES).toContain('hunted');
    expect(s.retry).toBe(true);
    expect(s.site).toBeUndefined(); // no reach radius: only losing them ends it
    for (const k of ['at', 'hide', 'checkpoint']) expect(night.sites[s[k]], k).toBeDefined();
    for (const k of ['lines', 'escapedLines', 'calledOffLines', 'failLines']) expect(s[k].length, k).toBeGreaterThan(0);
    expect(night.sites[s.hide].y).toBeGreaterThan(15); // a roof
    expect(huntedRules(s).level).toBe(3);
    // the dilemma after it starts where the last step ends: both of its sides are close
    const back = night.sites[stepsOf(night).find((x) => x.id === 'n4Doses').site];
    const d = stepsOf(night).find((x) => x.id === 'n4Dilemma');
    for (const side of ['bruce', 'batman']) { const p = night.sites[d[side].site]; expect(Math.hypot(p.x - back.x, p.z - back.z), side).toBeLessThan(150); }
  });
  it('n4 and n5: the hired guards are not the villain\'s own gang, and the rooms have lamps', () => {
    for (const [id, room] of [['n4', 'quayRoom'], ['n5', 'pensRoom'], ['n4', 'dockRoom'], ['n5', 'bathRoom']]) {
      const r = nightById(id).rooms[room];
      expect(r.gang).toBe('blackMask');
      expect(r.squad.length).toBeGreaterThanOrEqual(4);
      expect(r.lights.filter((l) => l.post && l.fill).length).toBeGreaterThanOrEqual(3); // lit: no scene too dark
      expect(r.cover.length).toBeGreaterThanOrEqual(3);
      // Every patrol point is inside the room's radius.
      const c = nightById(id).sites[r.site];
      for (const g of r.squad) for (const p of g.route.points) expect(Math.hypot(p.x - c.x, p.z - c.z), `${room} ${g.type}`).toBeLessThan(r.radius);
    }
  });
  it('n5: the valves are four plates turned in the order the foreman gives', () => {
    const night = nightById('n5');
    const s = stepsOf(night).find((x) => x.id === 'n5Valves');
    expect(s.order).toEqual(['N', 'S', 'E', 'W']);
    expect(s.plates.map((p) => p.id).sort()).toEqual(['E', 'N', 'S', 'W']);
    const f = night.sites.n5Furnace.x, plate = (id) => night.sites[s.plates.find((p) => p.id === id).site];
    // The riddle's compass is true: north is -z, east is +x.
    expect(plate('N').z).toBeLessThan(plate('S').z);
    expect(plate('E').x).toBeGreaterThan(plate('W').x);
    expect(Math.abs(plate('N').x - f)).toBeLessThan(2);
    const at = (w) => s.riddle.toLowerCase().indexOf(w);
    expect(at('north')).toBeGreaterThan(-1);
    expect(at('north') < at('south') && at('south') < at('east') && at('east') < at('west')).toBe(true);
    expect(s.timer).toBeGreaterThanOrEqual(60);
  });
  it('n5: the steps that used to jump ahead now lead into the missions put in their way', () => {
    const steps = stepsOf('n5');
    expect(steps.find((s) => s.id === 'n5Ribbon').next).toBe('n5ToOdessa');
    expect(steps.find((s) => s.id === 'n5WorkersFight').next).toBe('n5Board2');
    // Either side of the shelter dilemma plays the Odessa missions; either side of the fork plays Black Ice.
    for (const side of ['bruce', 'batman']) expect(walk(steps, 'n5Dilemma', (s) => (s.id === 'n5Dilemma' ? side : null))).toEqual(expect.arrayContaining(['n5ToOdessa', 'n5PensRoom', 'n5ToRoundhouse']));
    for (const opt of ['workers', 'cores']) expect(walk(steps, 'n5Choice', (s) => (s.id === 'n5Choice' ? opt : null))).toEqual(expect.arrayContaining(['n5Board2', 'n5IceBattle', 'n5ToPlant']));
    expect(nightById('n5').missions.map((m) => m.id)).toEqual(['m5Frost', 'm5Steel', 'm5Pressure', 'm5Silos', 'm5Reefer', 'm5Shelter', 'm5Odessa', 'm5Freight', 'm5Roundhouse', 'm5Choice', 'm5Ice', 'm5Plant', 'm5After']);
  });
  it('n5: the viaduct run goes one way, south, along the deck', () => {
    const night = nightById('n5');
    const s = stepsOf(night).find((x) => x.id === 'n5ViaductRun');
    const gates = s.gates.map((g) => night.sites[g]);
    for (let i = 1; i < gates.length; i++) { expect(gates[i].z).toBeGreaterThan(gates[i - 1].z); expect(gates[i].x).toBe(gates[0].x); expect(gates[i].y).toBe(gates[0].y); }
    expect(s.gates.at(-1)).toBe(night.rooms.pensRoom.entry);
  });
  it('n5: the furnace fight on Hard is three different answers, not two shields and a brute', () => {
    const night = nightById('n5');
    const hard = buildFight('furnaceCrew', night.fights.furnaceCrew, { difficulty: 'hard', act: 3 });
    expect(hard.waves[1].filter((e) => e.type === 'shield').length).toBeLessThanOrEqual(1);
    expect(new Set(hard.waves[1].map((e) => e.type)).size).toBe(hard.waves[1].length);
    // The pistol still leads the first wave on every tier (the night's tutorial beat).
    for (const difficulty of ['story', 'normal', 'hard', 'knightmare']) expect(buildFight('furnaceCrew', night.fights.furnaceCrew, { difficulty, act: 3 }).waves[0].some((e) => e.type === 'pistol'), difficulty).toBe(true);
  });
});

describe('[m45] hunted: the rules', () => {
  const on = (level, state = 'pursuit') => ({ present: true, level, state });
  it('runs while they hunt, ends when the level is back to nothing', () => {
    expect(huntedVerdict({ t: 5, fails: 0, armed: true }, on(3))).toBe('run');
    expect(huntedVerdict({ t: 30, fails: 0, armed: true }, on(3, 'search'))).toBe('run');
    expect(huntedVerdict({ t: 60, fails: 0, armed: true }, on(0, 'clear'))).toBe('escaped');
  });
  it('does not end before the level was raised', () => {
    expect(huntedVerdict({ t: 1, fails: 0, armed: false }, on(0, 'clear'))).toBe('run');
  });
  it('caught (or the cell) is a failed attempt', () => {
    expect(huntedVerdict({ t: 20, fails: 0, armed: true }, on(3, 'caught'))).toBe('caught');
    expect(huntedVerdict({ t: 20, fails: 0, armed: true }, on(3, 'custody'))).toBe('caught');
  });
  it('never stalls the night: called off after too long or too many failures', () => {
    expect(huntedVerdict({ t: HUNTED.maxTime, fails: 0, armed: true }, on(4))).toBe('calledOff');
    expect(huntedVerdict({ t: 0, fails: HUNTED.callOffAfter, armed: false }, on(0, 'clear'))).toBe('calledOff');
  });
  it('with no police system at all it is a short beat', () => {
    expect(huntedVerdict({ t: 0.5, fails: 0, armed: false }, { present: false })).toBe('run');
    expect(huntedVerdict({ t: HUNTED.degrade, fails: 0, armed: false }, null)).toBe('escaped');
  });
  it('a failed attempt starts the next one a level lower, never higher', () => {
    expect(huntedLevel(0)).toBe(3);
    expect(huntedLevel(1)).toBe(2);
    expect(huntedLevel(2)).toBe(2);
    expect(huntedLevel(1, huntedRules({ level: 1 }))).toBe(1);
    expect(huntedRules({ level: 4, maxTime: 90 })).toMatchObject({ level: 4, maxTime: 90, softLevel: 2 });
  });
});

describe('[m45] hunted: the step type against a fake police system', () => {
  function rig({ police = true } = {}) {
    const W = { level: 0, stateName: 'clear', sets: [], clears: [], set(level, opts) { this.level = level; this.stateName = 'pursuit'; this.sets.push({ level, ...opts }); }, clear(reason) { this.level = 0; this.stateName = 'clear'; this.clears.push(reason); } };
    const ctx = {
      markers: { place: vi.fn(() => ({})), release: vi.fn() }, radio: { say: vi.fn() }, hud: { card: vi.fn() }, events: { emit: vi.fn() },
      site: (id) => ({ bridge: { x: 1, y: 0, z: 2 }, roof: { x: 50, y: 26, z: 2 } })[id] ?? null, theGame: () => (police ? { wanted: W } : {}), hero: { pos: { x: 0, y: 0, z: 0 } },
      nightId: () => 'n4', done: vi.fn(), fail: vi.fn(),
    };
    const step = { id: 'hunted', type: 'hunted', at: 'bridge', hide: 'roof', rules: 'r', escapedLines: [{ text: 'e' }], calledOffLines: [{ text: 'c' }], failLines: [{ text: 'f' }] };
    return { W, ctx, step, type: createHuntedStep(ctx) };
  }
  it('raises a scripted level where they were seen, marks the hiding place, ends when they are lost', () => {
    const { W, ctx, step, type } = rig();
    type.enter(step);
    expect(W.sets).toEqual([{ level: 3, scripted: true, reason: 'n4:hunted', at: { x: 1, y: 0, z: 2 } }]);
    expect(type.marker()).toEqual({ x: 50, y: 26, z: 2 });
    expect(type.debugSolve(step)).toEqual([{ at: { x: 50, y: 26, z: 2 }, hold: 1 }]);
    type.update(1, step);
    expect(ctx.done).not.toHaveBeenCalled();
    W.level = 0; W.stateName = 'clear';
    type.update(1, step);
    expect(ctx.done).toHaveBeenCalledWith(step);
    expect(ctx.radio.say).toHaveBeenCalledWith(step.escapedLines);
    type.update(1, step);
    expect(ctx.done).toHaveBeenCalledTimes(1);
    type.exit();
    expect(W.clears).toEqual([]); // nothing left to clear
  });
  it('caught: the response is cleared before the cell and the mission retries, softer each time, then called off', () => {
    const { W, ctx, step, type } = rig();
    type.enter(step);
    W.stateName = 'caught';
    type.update(0.1, step);
    expect(ctx.fail).toHaveBeenCalledWith(step, step.failLines);
    expect(W.clears).toEqual(['n4:hunted:retry']);
    type.exit();
    type.enter(step); // the retry
    expect(W.sets.at(-1).level).toBe(2);
    for (let i = 0; i < 2; i++) { W.stateName = 'caught'; type.update(0.1, step); type.exit(); type.enter(step); }
    expect(ctx.fail).toHaveBeenCalledTimes(3);
    expect(W.sets).toHaveLength(3); // the fourth attempt is not raised at all
    type.update(0.1, step);
    expect(ctx.done).toHaveBeenCalledWith(step);
    expect(ctx.radio.say).toHaveBeenLastCalledWith(step.calledOffLines);
  });
  it('leaving the step another way takes the scripted hunt with it', () => {
    const { W, step, type } = rig();
    type.enter(step);
    type.exit();
    expect(W.clears).toEqual(['story:huntedExit']);
    expect(W.level).toBe(0);
  });
  it('with no police system the step ends on its own', () => {
    const { ctx, step, type } = rig({ police: false });
    type.enter(step);
    type.update(HUNTED.degrade + 0.1, step);
    expect(ctx.done).toHaveBeenCalledWith(step);
  });
});

describe('[m45] the Batwing pickup that rides along with an armada step', () => {
  it('asks a few times a second until she is aboard, never on a guest, and gives up after a while', () => {
    const st = { age: 0, wait: PICKUP_EVERY };
    expect(pickupDue(st, {}, 0.1)).toBe(false);
    expect(pickupDue(st, {}, PICKUP_EVERY)).toBe(true);
    expect(pickupDue(st, {}, 0.1)).toBe(false);
    expect(pickupDue({ age: 0, wait: 0 }, { aboard: true }, 1)).toBe(false);
    expect(pickupDue({ age: 0, wait: 0 }, { replica: true }, 1)).toBe(false);
    expect(pickupDue({ age: PICKUP_FOR, wait: 0 }, {}, 1)).toBe(false);
  });
  it('calls the plane through its public call() only while it is not flying', () => {
    const wing = { active: false, call: vi.fn() };
    const type = createWingPickup({ theGame: () => ({ batwing: wing }) });
    type.enter({});
    type.update(PICKUP_EVERY + 0.01);
    expect(wing.call).toHaveBeenCalledTimes(1);
    wing.active = true;
    for (let i = 0; i < 10; i++) type.update(1);
    expect(wing.call).toHaveBeenCalledTimes(1);
    expect(type.marker()).toBe(null);
  });
});

describe('[m45] second pass: the deeper stages', () => {
  const site = (night, id) => night.sites[id];
  it('n4: the runner goes over real roofs to the temple, the cranes are locked south to north, the El rescue ends over the water', () => {
    const night = nightById('n4');
    const steps = stepsOf(night);
    const run = steps.find((s) => s.id === 'n4Runner');
    expect(run.gates.at(-1)).toBe(steps.find((s) => s.id === 'n4Satchel').site);
    for (const g of run.gates) expect(site(night, g).y).toBeGreaterThanOrEqual(10);
    const cranes = steps.find((s) => s.id === 'n4Cranes').gates.map((g) => site(night, g));
    expect(cranes.map((c) => c.z)).toEqual([...cranes.map((c) => c.z)].sort((a, b) => b - a)); // south (z+) first
    for (const c of cranes) expect(c.y).toBeCloseTo(18.65);
    expect(night.rooms.dockRoom.entry).toBe(steps.find((s) => s.id === 'n4Cranes').gates.at(-1)); // the run ends on the next room's perch
    const el = steps.find((s) => s.id === 'n4ElRescue').gates.map((g) => site(night, g));
    expect(el.at(-1).x).toBeGreaterThan(-300); expect(el.at(-1).x).toBeLessThan(-266); // over the North Branch
  });
  it('n4: the second hunt is thinner than the first and hides on the island; both keep a retry and a way out', () => {
    const night = nightById('n4');
    const [a, b] = ['n4Hunted', 'n4HuntedAgain'].map((id) => stepsOf(night).find((s) => s.id === id));
    expect(evadeRulesOf(b).level).toBeLessThan(evadeRulesOf(a).level);
    expect(site(night, b.hide).x).toBeLessThan(-300);
    for (const s of [a, b]) { expect(s.retry).toBe(true); expect(s.calledOffLines.length).toBeGreaterThan(0); expect(s.site).toBeUndefined(); }
  });
  it('n4: both balloon flights start from a roof, and each chase follows a board or a vehicle step', () => {
    for (const id of ['n4', 'n5']) {
      const night = nightById(id);
      const steps = stepsOf(night);
      steps.forEach((s, i) => {
        if (s.type === 'chase') expect(['board', 'battle'], s.id).toContain(steps[i - 1].type);
        if (s.type === 'armada') { const prev = steps[i - 1]; expect(site(night, prev.site).y, s.id).toBeGreaterThan(5); }
        if (s.type === 'chase' && s.van) expect(s.path.length, s.id).toBeGreaterThanOrEqual(4);
      });
    }
  });
  it('n5: the climb goes up, the club is two beats with a choice whose every answer names the pens', () => {
    const night = nightById('n5');
    const steps = stepsOf(night);
    const ys = steps.find((s) => s.id === 'n5Gantry').gates.map((g) => site(night, g).y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(steps.find((s) => s.id === 'n5CapShut').site).toBe('n5Cap');
    const club = steps.find((s) => s.id === 'n5Club');
    expect(club.beats).toHaveLength(2);
    for (const o of club.beats[1].choice.options) expect(o.lines.map((l) => l.text).join(' ')).toMatch(/stock pens/);
  });
  it('n5: the relief shift is the only plain brawl added, in other masks, along the lanes', () => {
    const night = nightById('n5');
    expect(night.fights.pensHold.gang).toBe('blackMask');
    for (const w of night.fights.pensHold.waves) for (const [, dz] of w.spots) expect(Math.abs(dz)).toBeLessThanOrEqual(6); // inside the open lane
  });
});
