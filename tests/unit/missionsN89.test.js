// [missions] Nights Eight and Nine, the missions round (docs/design/briefs/missions-round.md): the
// new missions' step graphs, that the steps a save may be parked on kept their ids and order, the
// rooms' geometry and light. The police escape in Night Eight is Night Three's `evade` step type
// (src/story/missions/n3), reused: its rules are tested with that night.
import { describe, it, expect } from 'vitest';
import { nightById, stepsOf, STEP_TYPES } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { createRunner } from '../../src/story/runner.js';
import { SITES } from '../../src/world/mapData.js';
import { REGION_SITES } from '../../src/world/regions/data.js';
import { LEVELS } from '../../src/wanted/rules.js';

// The steps each night had before this round, in order: a save parked on any of them must resume.
const BEFORE = {
  n8: 'n8Recap n8Choice n8Vote n8GateLate n8GateFight n8Market n8Ledger n8ToTower n8Dark n8File n8NoGadgets n8NoGrapple n8Up n8ToBlackgate n8Boss n8Breakout n8Statement n8End'.split(' '),
  n9: 'n9Recap n9ToPier n9PierFight n9WheelRun n9Jokes n9Gone n9Board n9Chase n9ToGate n9IfFell n9GateFallen n9GateFight n9Intensive n9Greenhouse n9Chapel n9Clock n9Look n9Boss n9Walk n9End'.split(' '),
};
const BEFORE_MISSIONS = {
  n8: ['m8Vote', 'm8Market', 'm8Gauntlet', 'm8Mask', 'm8Breakout'],
  n9: ['m9Pier', 'm9Wheel', 'm9Funhouse', 'm9Van', 'm9Gate', 'm9Wings', 'm9Yard', 'm9Dawn'],
};
const NEW = {
  n8: ['m8Paper', 'm8Routes', 'm8Laundry', 'm8Copies'],
  n9: ['m9Date', 'm9Air', 'm9Parade', 'm9Breach'],
};
const ORDER = {
  n8: ['m8Vote', 'm8Market', 'm8Paper', 'm8Routes', 'm8Gauntlet', 'm8Laundry', 'm8Mask', 'm8Copies', 'm8Breakout'],
  n9: ['m9Pier', 'm9Wheel', 'm9Date', 'm9Air', 'm9Funhouse', 'm9Van', 'm9Parade', 'm9Gate', 'm9Breach', 'm9Wings', 'm9Yard', 'm9Dawn'],
};
const siteOf = (n, id) => (typeof id === 'object' ? id : n.sites?.[id] ?? SITES[id] ?? REGION_SITES[id]);
const finish = (s) => {
  switch (s.type ?? 'reach') {
    case 'cutscene': return { type: 'cutsceneDone', scene: s.scene };
    case 'fight': return { type: 'fightDone', id: s.fight };
    case 'collect': return { type: 'collected', item: s.item };
    case 'boss': return { type: 'bossDone' };
    case 'chase': case 'battle': return { type: `${s.type}Done` };
    case 'board': return { type: 'boardDone', id: s.id };
    case 'reach': return { type: 'reached', step: s.id };
    default: return { type: 'stepDone', id: s.id };
  }
};
// Walks a night from a step, answering each branching step from `pick` (id -> branch key).
function walk(night, from, pick = {}) {
  const steps = stepsOf(night);
  const r = createRunner(steps, steps.findIndex((s) => s.id === from));
  const seen = [];
  for (let guard = 0; guard < 400 && !r.done; guard++) {
    const s = r.step;
    seen.push(s.id);
    if (s.type === 'nightEnd') break;
    expect(r.handle({ ...finish(s), branch: pick[s.id] ?? (s.branches ? Object.keys(s.branches)[0] : null) }), s.id).toBe(true);
  }
  return seen;
}

describe.each(['n8', 'n9'])('%s: the missions round', (id) => {
  const night = nightById(id);
  const steps = stepsOf(night);
  const ids = steps.map((s) => s.id);

  it('adds four missions, in their places, each with its own steps and a checkpoint that resolves', () => {
    expect(night.missions.map((m) => m.id)).toEqual(ORDER[id]);
    for (const mid of NEW[id]) {
      const m = night.missions.find((x) => x.id === mid);
      expect(m.steps.length, mid).toBeGreaterThanOrEqual(3);
      expect(siteOf(night, m.checkpoint), `${mid} checkpoint`).toBeTruthy();
      expect(m.rewards.every((r) => r.startsWith('xp:')), `${mid} pays XP only through the mission path`).toBe(true);
    }
  });

  it('keeps every earlier step id, in the same order and in the same mission', () => {
    expect(ids.filter((x) => BEFORE[id].includes(x))).toEqual(BEFORE[id]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const mid of BEFORE_MISSIONS[id]) expect(night.missions.some((m) => m.id === mid), mid).toBe(true);
    // New steps sit only in the new missions: no old mission gained or lost a step.
    for (const m of night.missions.filter((x) => !NEW[id].includes(x.id))) expect(m.steps.every((s) => BEFORE[id].includes(s.id)), m.id).toBe(true);
    for (const m of night.missions.filter((x) => NEW[id].includes(x.id))) expect(m.steps.some((s) => BEFORE[id].includes(s.id)), m.id).toBe(false);
  });

  it('every step type is known, every site of the new steps resolves, travel steps talk', () => {
    for (const m of night.missions.filter((x) => NEW[id].includes(x.id))) {
      for (const s of m.steps) {
        expect(STEP_TYPES, s.id).toContain(s.type ?? 'reach');
        for (const g of s.ground ?? []) expect(siteOf(night, g), `${s.id} ground ${g}`).toBeTruthy();
        for (const k of ['site']) if (s[k]) expect(siteOf(night, s[k]), `${s.id}.${k}`).toBeTruthy();
        for (const g of s.gates ?? []) expect(siteOf(night, g), `${s.id} gate ${g}`).toBeTruthy();
        for (const p of [...(s.points ?? []), ...(s.plates ?? []), ...(s.options ?? []), ...(s.optional ?? [])]) expect(siteOf(night, p.site), `${s.id} point`).toBeTruthy();
        if ((s.type ?? 'reach') === 'reach') expect(s.lines?.length || s.banter?.length, `${s.id} is silent`).toBeTruthy();
        if (s.type === 'puzzle') expect([...s.order].sort()).toEqual(s.plates.map((p) => p.id).sort());
      }
    }
  });

  it('an old save parked on any earlier step still reaches the end of the night', () => {
    for (const from of BEFORE[id]) expect(walk(night, from).at(-1), from).toBe(BEFORE[id].at(-1));
  });

  it('at most one plain brawl among the additions on any one path', () => {
    const added = night.missions.filter((x) => NEW[id].includes(x.id)).flatMap((m) => m.steps);
    const plain = (s) => s.type === 'fight' && !night.fights[s.fight].stealth && !s.locks?.length && !s.thralls;
    const path = walk(night, ids[0]).map((x) => steps.find((s) => s.id === x)).filter((s) => added.includes(s));
    expect(path.filter(plain).length).toBeLessThanOrEqual(1);
  });

  it('the new predator rooms keep their patrols inside the room, and every room location has a fill light', () => {
    const lit = new Set(Object.values(night.rooms).filter((r) => r.fill?.length).map((r) => r.site));
    const added = night.missions.filter((x) => NEW[id].includes(x.id)).flatMap((m) => m.steps).filter((s) => s.type === 'fight' && night.fights[s.fight].stealth);
    expect(added.length).toBeGreaterThanOrEqual(3);
    for (const s of added) {
      const room = night.rooms[night.fights[s.fight].stealth];
      const at = siteOf(night, room.site);
      expect(siteOf(night, room.entry), `${room.id} entry`).toBeTruthy();
      expect(lit.has(room.site), `${room.id}: no fill light at ${room.site} (too dark)`).toBe(true);
      expect(room.squad.length).toBeGreaterThanOrEqual(5);
      for (const g of room.squad) for (const p of g.route.points) expect(Math.hypot(p.x - at.x, p.z - at.z), `${room.id} ${g.type}`).toBeLessThanOrEqual(room.radius + 4);
      for (const f of room.fill ?? []) expect(Math.hypot(f.x - at.x, f.z - at.z)).toBeLessThan(room.radius);
    }
  });
});

describe('n8: the new missions', () => {
  const night = nightById('n8');
  it('the deduction: the right answer goes to the quiet room, the wrong one warns them', () => {
    expect(walk(night, 'n8Deduce', { n8Deduce: 'locks' }).slice(0, 3)).toEqual(['n8Deduce', 'n8Lock', 'n8Sluice']);
    expect(walk(night, 'n8Deduce', { n8Deduce: 'crane' }).slice(0, 4)).toEqual(['n8Deduce', 'n8Decoy', 'n8LockAlert', 'n8Sluice']);
    expect(night.rooms.lockRoomAlert.squad.length).toBeGreaterThan(night.rooms.lockRoom.squad.length);
  });
  it('the route mission starts with the wanted escape and ends at the gauntlet whichever way Ostrow goes', () => {
    const tip = stepsOf(night).find((s) => s.id === 'n8Tip');
    expect(tip.type).toBe('evade');
    expect(tip.level).toBe(3);
    expect(LEVELS[tip.level].heli, 'a level with no helicopter: a roof is a fair place to hide').toBe(false);
    expect(tip.ground.map((g) => siteOf(night, g)).every(Boolean), 'a place to go to ground that resolves').toBe(true);
    expect(tip.delay, 'a head start while the warning plays').toBeGreaterThan(0);
    expect(tip.clearLines.length).toBeGreaterThan(0);
    for (const k of ['bruce', 'batman']) expect(walk(night, 'n8Ostrow', { n8Ostrow: k })[1]).toBe('n8ToTower');
  });
  it('the vote still matters at the locks, either way', () => {
    for (const k of ['yes', 'no']) expect(walk(night, 'n8StoneVote', { n8StoneVote: k })[1]).toBe('n8Tip');
  });
  it('the Blackgate missions bracket the duel; the copies lead into the breakout', () => {
    const ids = stepsOf(night).map((s) => s.id);
    expect(ids[ids.indexOf('n8Boss') - 1]).toBe('n8Riot');
    expect(ids[ids.indexOf('n8Boss') + 1]).toBe('n8CopiesBoard');
    expect(ids[ids.indexOf('n8Breakout') - 1]).toBe('n8Delivered');
    const chase = stepsOf(night).find((s) => s.id === 'n8Trucks');
    expect(chase.path.length).toBeGreaterThanOrEqual(2);
    // The chase runs on the causeway (x 84 to 90) and the core's street lines (30, 90, 150).
    for (const p of chase.path) expect([30, 84, 90, 150]).toContain(p.x);
  });
  it('locks only what the story has already locked before (the gauntlet\'s own vocabulary)', () => {
    for (const s of stepsOf(night)) for (const l of s.locks ?? []) expect(['detective', 'gadgets', 'grapple']).toContain(l);
  });
});

describe('n9: the new missions', () => {
  const night = nightById('n9');
  const steps = stepsOf(night);
  it('the endgame is untouched: the yard, the walk out and the last beat are the last three steps', () => {
    expect(steps.slice(-3).map((s) => s.id)).toEqual(['n9Boss', 'n9Walk', 'n9End']);
    expect(night.missions.slice(-2).map((m) => m.id)).toEqual(['m9Yard', 'm9Dawn']);
    expect(steps.at(-1).type).toBe('nightEnd');
    expect(night.finale).toBe(true);
    expect(Object.keys(night.endings)).toEqual(['family', 'partners', 'exposed', 'alone']);
  });
  it('the date: Bruce walks in and the room is the easier one; Batman gets the lit one; both ways rejoin', () => {
    expect(walk(night, 'n9DateChoice', { n9DateChoice: 'bruce' }).slice(0, 5)).toEqual(['n9DateChoice', 'n9Ballroom', 'n9Room', 'n9DateAfter', 'n9Static']);
    expect(walk(night, 'n9DateChoice', { n9DateChoice: 'both' })[1]).toBe('n9Ballroom');
    expect(walk(night, 'n9DateChoice', { n9DateChoice: 'batman' }).slice(0, 4)).toEqual(['n9DateChoice', 'n9RoomHard', 'n9DateAfter', 'n9Static']);
    expect(night.rooms.ballRoomHard.squad.length).toBeGreaterThan(night.rooms.ballRoom.squad.length);
    const civvy = steps.find((s) => s.id === 'n9Ballroom');
    expect(civvy.beats.map((b) => b.id)).toEqual(['door', 'mara', 'fuse']);
    for (const b of civvy.beats.filter((x) => x.choice)) expect(b.choice.options.map((o) => o.id)).toContain(b.choice.default);
  });
  it('the ballroom cover stays clear of the funhouse plates on the same deck', () => {
    const plates = ['n9PlateA', 'n9PlateB', 'n9PlateC', 'n9PlateD'].map((p) => night.sites[p]);
    for (const room of [night.rooms.ballRoom, night.rooms.ballRoomHard]) {
      for (const c of room.cover) for (const p of plates) expect(Math.hypot(c.x - p.x, c.z - p.z)).toBeGreaterThan(4);
    }
  });
  it('the breach is two waves with the ward at your side and three without', () => {
    expect(walk(night, 'n9WardTest', { n9WardTest: 'yes' }).slice(0, 3)).toEqual(['n9WardTest', 'n9BreachFight', 'n9Roofs']);
    expect(walk(night, 'n9WardTest', { n9WardTest: 'no' }).slice(0, 3)).toEqual(['n9WardTest', 'n9BreachAlone', 'n9Roofs']);
    expect(night.fights.breachAlone.waves.length).toBe(night.fights.breach.waves.length + 1);
  });
  it('the jammed fight says what is offline', () => {
    const s = steps.find((x) => x.id === 'n9Static');
    expect(s.locks).toEqual(['detective', 'gadgets']);
    expect(s.lockText.length).toBeGreaterThan(20);
  });
});

describe.each(['n8', 'n9'])('%s: no new set piece is left dark', (id) => {
  const night = nightById(id);
  it('every new open-air fight has a fill light on its ground (night.lit), every lit entry is in reach of one', () => {
    const added = night.missions.filter((x) => NEW[id].includes(x.id)).flatMap((m) => m.steps).filter((s) => s.type === 'fight' && !night.fights[s.fight].stealth);
    expect(added.length).toBeGreaterThanOrEqual(2);
    const fills = night.lit.flatMap((l) => l.fill);
    for (const s of added) {
      const f = night.fights[s.fight];
      const at = siteOf(night, f.site);
      const near = fills.filter((q) => Math.hypot(q.x - at.x, q.z - at.z) < (q.reach ?? 26));
      expect(near.length, `${s.id}: no fill light`).toBeGreaterThanOrEqual(1);
      expect(Math.abs(near[0].ground - at.y), `${s.id}: light pool not on the ground`).toBeLessThan(0.5);
    }
    expect(new Set(night.lit.map((l) => l.id)).size).toBe(night.lit.length);
    for (const l of night.lit) expect(Object.keys(night.rooms)).not.toContain(l.id);
  });
});

describe.each(['n8', 'n9'])('%s: the new steps are quiet', (id) => {
  it('no open-world predator encounter may start under a new mission step; the old steps are as they were', () => {
    for (const m of nightById(id).missions) for (const s of m.steps) expect(!!s.quiet, s.id).toBe(NEW[id].includes(m.id));
  });
});
