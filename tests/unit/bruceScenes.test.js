// Workstream K: Bruce-day scenes (src/bruce/scenes.js) through the interpreter
// (src/bruce/sceneMachine.js): every scene's data is consistent, and every scene plays to each of
// its main outcomes headlessly, feeding the meters and the next night's start.
import { describe, it, expect } from 'vitest';
import { SCENES, SCENE_IDS, CAST, SPEAKERS } from '../../src/bruce/scenes.js';
import { createSceneMachine, validateScene, testCond } from '../../src/bruce/sceneMachine.js';
import { createDoubleLife, nightStart, applyNight } from '../../src/bruce/doubleLife.js';
import { BRUCE_DAY_SLOTS, SLOT_IDS, planDay, sceneFor } from '../../src/bruce/days.js';
import { COMMITMENT_TYPES } from '../../src/bruce/calendar.js';
import { MANOR_STATIONS, MANOR_ROOMS } from '../../src/world/interiors/manor.js';
import { TOWER_STATIONS, TOWER_ROOMS } from '../../src/world/interiors/wayneTower.js';

const STATIONS = { wayneManor: MANOR_STATIONS, wayneTower: TOWER_STATIONS };
const ROOMS = { wayneManor: MANOR_ROOMS, wayneTower: TOWER_ROOMS };

// Plays a scene: `pick(m)` decides at choice/pressure/inspect/goto nodes. Returns the machine.
function play(id, life, pick, { coop = false } = {}) {
  const m = createSceneMachine(SCENES[id], { life, coop }).start();
  for (let guard = 0; guard < 200 && !m.done; guard++) {
    const t = m.node.type;
    if (t === 'line' || t === 'event') { m.next(); continue; }
    const r = pick(m);
    if (r === 'tick') m.tick(999);
  }
  expect(m.done).toBe(true);
  return m;
}
// A default chooser: the first available option, stay at pressure, reach/inspect everything.
const first = (stance) => (m) => {
  const n = m.node;
  if (n.type === 'choice') { const o = m.options().find((x) => x.ok); m.choose(o.id); }
  else if (n.type === 'pressure') { if (stance === 'slip') m.slip(); else m.stay(); }
  else if (n.type === 'goto') m.reach(n.target.id);
  else if (n.type === 'inspect') for (const s of n.spots) m.inspect(s.id);
};

describe('scene data', () => {
  it('every scene validates: nexts resolve, nodes reachable, speakers cast, two outcomes, a pressure node', () => {
    for (const id of SCENE_IDS) expect(validateScene(SCENES[id], { speakers: SPEAKERS }), id).toEqual([]);
  });
  it('cast, venues, stations and commitments resolve', () => {
    for (const s of Object.values(SCENES)) {
      for (const c of s.cast) expect(CAST[c.id], `${s.id} cast ${c.id}`).toBeTruthy();
      expect(ROOMS[s.venue.pocket]?.[s.venue.room], `${s.id} venue`).toBeTruthy();
      for (const c of s.cast) expect(STATIONS[s.venue.pocket][c.at], `${s.id} ${c.at}`).toBeTruthy();
      for (const n of Object.values(s.nodes)) if (n.type === 'goto') expect(STATIONS[s.venue.pocket][n.target.station], `${s.id} goto ${n.target.station}`).toBeTruthy();
      expect(COMMITMENT_TYPES[s.commitment].scene).toBe(s.id);
    }
  });
  it('the validator catches broken data', () => {
    const bad = { id: 'x', title: 'X', start: 'a', cast: [], nodes: {
      a: { type: 'choice', options: [{ id: 'o', tag: 'nope', text: 't', req: { flag: 'f' }, next: 'zz' }] },
      b: { type: 'end', outcome: 'stay' },
    } };
    const p = validateScene(bad).join('\n');
    for (const want of ['next zz missing', 'unknown tag', 'every option is gated', 'b: unreachable', 'two outcomes', 'pressure']) expect(p).toContain(want);
  });
  it('day slots name real scenes and plan without touching the state', () => {
    for (const id of SLOT_IDS) {
      const slot = BRUCE_DAY_SLOTS[id];
      for (const s of [slot.scene, ...slot.alternates]) expect(SCENES[s], `${id} ${s}`).toBeTruthy();
    }
    const life = createDoubleLife();
    const snap = JSON.stringify(life);
    const plan = planDay('day2', { life, report: { endHour: 5.1, hits: 10, crimesStopped: 2 } });
    expect(plan.scene.id).toBe('boardVote');
    expect(plan.preview.staminaRegenK).toBeLessThan(1);
    expect(plan.calendar.collisions.length).toBe(1);
    expect(JSON.stringify(life)).toBe(snap);
    // A played primary falls to the alternate; an unknown slot finds an unplayed one.
    life.scenes.boardVote = 'stay';
    expect(sceneFor(BRUCE_DAY_SLOTS.day2, life).id).toBe('luciusBriefing');
    expect(planDay('night9', { life }).slot.id).toBe('day1');
  });
});

describe('the gala (signal mid-toast)', () => {
  it('stay: the toast is finished, standing up, city down, tonight the crime has escalated', () => {
    const life = createDoubleLife();
    const m = play('gala', life, first('stay'));
    expect(m.outcome).toBe('stay');
    expect(life.standing).toBeGreaterThan(60);
    expect(life.city).toBeLessThan(50);
    expect(nightStart(life).escalated).toBe(true);
    expect(life.scenes.gala).toBe('stay');
  });
  it('slip with Alfred covering: patience pays, the night starts early; caught slipping raises the reporter', () => {
    const life = createDoubleLife();
    const m = play('gala', life, (mm) => {
      if (mm.node.type === 'pressure') { expect(mm.cover()).toBe(true); expect(mm.timer).toBe(50); mm.slip(); return; }
      first('slip')(mm);
    });
    expect(m.outcome).toBe('slip');
    expect(m.nodeId).toBe('slipCovered');
    expect(life.patience).toBeLessThan(80 - 15);
    expect(life.flags.earlyStart).toBe(true);
    expect(life.city).toBeGreaterThan(50);
    const life2 = createDoubleLife();
    const r0 = life2.suspicion.reporter;
    const m2 = play('gala', life2, (mm) => { if (mm.node.type === 'goto' && mm.node.target.id === 'service') return 'tick'; first('slip')(mm); });
    expect(m2.nodeId).toBe('slipSeenEnd');
    expect(life2.suspicion.reporter).toBeGreaterThan(r0 + 7);
  });
  it('a bruised Bruce is asked about it; the excuse is remembered', () => {
    const life = createDoubleLife();
    applyNight(life, { endHour: 3, hits: 6 });
    play('gala', life, (mm) => { if (mm.node.type === 'choice' && mm.node.who === 'reporter') { mm.choose('sailing'); return; } first('stay')(mm); });
    expect(life.excuses.sailing.who).toEqual(['reporter']);
  });
});

describe('the 9 a.m. vote', () => {
  it('rested and sharp: the forged survey wins the vote and gives a lead for tonight', () => {
    const life = createDoubleLife({ fatigue: 20 });
    const m = play('boardVote', life, (mm) => {
      if (mm.node.type === 'choice') { mm.choose('survey'); return; }
      first('stay')(mm);
    });
    expect(m.nodeId).toBe('stayWon');
    expect(life.doors.opened).toContain('narrowsLand');
    expect(nightStart(life).leads).toContain('arkwright');
  });
  it('after no sleep: the sharp option is greyed, Bruce dozes, and leaving mid-vote freezes R&D', () => {
    const life = createDoubleLife({ fatigue: 90 });
    const m = createSceneMachine(SCENES.boardVote, { life }).start();
    expect(m.nodeId).toBe('dozing');
    m.next(); m.next();
    for (const s of m.node.spots) m.inspect(s.id);
    const opts = m.options();
    expect(opts.find((o) => o.id === 'survey').ok).toBe(false);
    m.choose('honest');
    m.next();
    m.slip();
    expect(m.outcome).toBe('slip');
    expect(life.rnd.frozen).toBe('prototype');
    expect(nightStart(life).rndFrozen).toBe('prototype');
  });
});

describe('the clinic', () => {
  it('a light hand last night earns the nurse\'s trust and a lead; staying means an officer is hurt', () => {
    const life = createDoubleLife();
    applyNight(life, { endHour: 2, finishers: 2 });
    const m = play('clinic', life, (mm) => { if (mm.node.type === 'choice') { mm.choose('honest'); return; } first('stay')(mm); });
    expect(m.chosen).toContain('honest');
    expect(life.flags['lead.barroTrust']).toBe(true);
    expect(m.outcome).toBe('stay');
    expect(life.flags.officerHurt).toBe(true);
  });
  it('slipping out to Park Row: city up, standing down, early start', () => {
    const life = createDoubleLife();
    applyNight(life, { endHour: 2, finishers: 10 });
    const m = play('clinic', life, first('slip'));
    expect(m.outcome).toBe('slip');
    expect(life.city).toBeGreaterThan(50);
    expect(life.flags.earlyStart).toBe(true);
  });
});

describe('the press conference (knuckles)', () => {
  it('the same excuse to the same reporter twice costs suspicion; the third time is a running joke', () => {
    const life = createDoubleLife();
    for (let i = 0; i < 3; i++) {
      life.injuries.lip = 20;
      play('pressConference', life, (mm) => { if (mm.node.type === 'choice' && mm.node.who === 'reporter' && mm.options().some((o) => o.id === 'sailing')) { mm.choose('sailing'); return; } first('stay')(mm); });
    }
    expect(life.excuses.sailing.n).toBe(3);
    expect(life.flags['excuseJoke.sailing']).toBe(true);
  });
  it('wrapping up early raises the reporter and starts the night early', () => {
    const life = createDoubleLife();
    const r0 = life.suspicion.reporter;
    const m = play('pressConference', life, (mm) => { if (mm.node.type === 'choice') { mm.choose(mm.options().find((o) => o.ok && o.id === 'deflect')?.id ?? mm.options().find((o) => o.ok).id); return; } first('slip')(mm); });
    expect(m.outcome).toBe('slip');
    expect(life.suspicion.reporter).toBeGreaterThan(r0);
  });
});

describe('the detective at the door', () => {
  it('slip out, silence the alarm at the clock, and get back before the tea cools', () => {
    const life = createDoubleLife();
    const m = play('detectiveCalls', life, first('slip'));
    expect(m.nodeId).toBe('inTime');
    expect(m.outcome).toBe('slip');
  });
  it('too slow back: the tea goes cold and there is a tail on the car tonight', () => {
    const life = createDoubleLife();
    const m = play('detectiveCalls', life, (mm) => { if (mm.node.type === 'goto' && mm.node.target.id === 'seat') return 'tick'; first('slip')(mm); });
    expect(m.nodeId).toBe('teaCold');
    expect(nightStart(life).tail).toBe(true);
  });
  it('sitting tight: suspicion climbs; a co-op partner can buy time once', () => {
    const life = createDoubleLife();
    const d0 = life.suspicion.detective;
    const m = play('detectiveCalls', life, (mm) => {
      if (mm.node.type === 'pressure') { expect(mm.assist()).toBe(true); expect(mm.assist()).toBe(false); }
      first('stay')(mm);
    }, { coop: true });
    expect(m.outcome).toBe('stay');
    expect(life.suspicion.detective).toBeGreaterThan(d0 + 7);
    expect(life.threads.ward).toBeGreaterThan(2);
  });
});

describe('the R&D hearing', () => {
  it('a good pitch ships the chosen prototype', () => {
    const life = createDoubleLife({ standing: 60 });
    const m = play('luciusBriefing', life, (mm) => { if (mm.node.type === 'choice' && mm.nodeId === 'pick') { mm.choose('grapple'); return; } first('stay')(mm); });
    expect(m.outcome).toBe('shipped');
    expect(life.rnd.shipped).toContain('grapplePrototype');
  });
  it('the shiny pitch shelves both', () => {
    const life = createDoubleLife({ standing: 60 });
    const m = play('luciusBriefing', life, (mm) => { if (mm.node.type === 'choice' && mm.nodeId === 'speech') { mm.choose('act'); return; } first('stay')(mm); });
    expect(m.outcome).toBe('shelved');
    expect(life.rnd.frozen).toBe('prototype');
  });
});

describe('conditions', () => {
  it('testCond reads every field', () => {
    const s = createDoubleLife({ fatigue: 70 });
    expect(testCond({ fatigueAbove: 60 }, s)).toBe(true);
    expect(testCond({ fatigueBelow: 60 }, s)).toBe(false);
    expect(testCond({ outfit: ['tux'] }, s, { outfit: 'tux' })).toBe(true);
    expect(testCond({ suspicionAbove: { reporter: 50 } }, s)).toBe(false);
  });
});
