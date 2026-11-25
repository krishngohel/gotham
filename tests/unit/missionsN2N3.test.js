// [m23] Nights Two and Three: the four missions added to each (docs/design/briefs/missions-round.md).
// The step graphs (old ids keep their order, the new missions sit where the story needs them and
// only ask for what has been taught), the three mission step types' pure rules, and each step type
// driven end to end with a fake story context.
import { describe, it, expect, vi } from 'vitest';
import { nightById, stepsOf, STEP_TYPES } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { createRunner } from '../../src/story/runner.js';
import { buildFight } from '../../src/story/fightBuilder.js';
import { SITES } from '../../src/world/mapData.js';
import { REGION_SITES } from '../../src/world/regions/data.js';
import { ABILITIES } from '../../src/abilities/abilityDefs.js';
import { createRescue, captiveAt, RESCUE } from '../../src/story/missions/n2/rescueLogic.js';
import { createEvade } from '../../src/story/missions/n3/evadeLogic.js';
import { caseDefOf, validateCaseStep, caseSites, createCaseStep } from '../../src/story/missions/n2/caseStep.js';
import { createRescueStep } from '../../src/story/missions/n2/rescueStep.js';
import { createTailStep } from '../../src/story/missions/n2/tailStep.js';
import { createEvadeStep } from '../../src/story/missions/n3/evadeStep.js';
import { createCaseRun } from '../../src/openworld/cases/engine.js';
import { N2_STEP_TYPES } from '../../src/story/missions/n2/index.js';
import { N3_STEP_TYPES } from '../../src/story/missions/n3/index.js';
import { fillSpot, registerNightFills } from '../../src/story/missions/n2/fills.js';
import { governor, storyHold, STORY_NEAR } from '../../src/openworld/director.js';
import { allNights } from '../../src/story/campaign.js';
import { riddleTick, keepListed } from '../../src/bosses/defs/riddler.js';
import { STEALTH_ENCOUNTERS as ENCOUNTERS } from '../../src/openworld/stealth/encounters.js';

const n2 = nightById('n2'), n3 = nightById('n3');
const siteOf = (n) => (id) => (typeof id === 'object' ? id : n.sites?.[id] ?? SITES[id] ?? REGION_SITES[id] ?? null);
const finite = (p) => !!p && [p.x, p.y, p.z].every(Number.isFinite);
const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

// The step ids each night had before this round, in order: a save parked on any of them resumes.
const OLD = {
  n2: ['n2Recap', 'n2Start', 'heistFight', 'heistScan', 'n2Board', 'n2Chase', 'droneRun', 'n2Fork', 'diveFight', 'diveClue', 'toRiverWalk', 'riverFight', 'undercroft', 'ledger', 'n2Twist', 'n2GuestIn', 'toLounge', 'loungeDoor', 'toLoungeRoof', 'penguinBoss', 'n2Wrap', 'n2End'],
  n3: ['n3Recap', 'n3Start', 'bankFight', 'bankScan', 'elRun', 'n3Dilemma', 'n3Gala', 'n3BombFight', 'n3Defuse', 'toCityHall', 'cityHallPuzzle', 'toAlley', 'deliveryAlley', 'cipher', 'toWayneTower', 'plazaTrap', 'lobbyScan', 'n3Twist', 'toExchange', 'n3IfBomb', 'exchangeBig', 'exchangeFight', 'toGazette', 'riddlerBoss', 'n3Wrap', 'n3End'],
};
const OLD_MISSIONS = {
  n2: ['m2Opening', 'm2Heist', 'm2Pursuit', 'm2Drone', 'm2Smugglers', 'm2Undercroft', 'm2Guest', 'm2Lounge', 'm2Penguin'],
  n3: ['m3Opening', 'm3Bank', 'm3El', 'm3Gala', 'm3CityHall', 'm3Alley', 'm3Tower', 'm3Exchange', 'm3Riddler'],
};
const NEW_MISSIONS = {
  n2: { m2Nest: 'm2Drone', m2Aquarium: 'm2Nest', m2Holdout: 'm2Guest', m2IceHouse: 'm2Holdout' },
  n3: { m3Wheel: 'm3El', m3Van: 'm3Alley', m3Frame: 'm3Tower', m3Nest: 'm3Frame' },
};

describe('the step graphs', () => {
  for (const n of [n2, n3]) {
    const steps = stepsOf(n);
    const ids = steps.map((s) => s.id);
    const missions = n.missions.map((m) => m.id);
    it(`${n.id}: every old step and mission is still there, in the same order`, () => {
      expect(ids.filter((id) => OLD[n.id].includes(id))).toEqual(OLD[n.id]);
      expect(missions.filter((id) => OLD_MISSIONS[n.id].includes(id))).toEqual(OLD_MISSIONS[n.id]);
      expect(new Set(ids).size).toBe(ids.length);
    });
    it(`${n.id}: four new missions, each straight after the one the story hangs it on`, () => {
      const added = missions.filter((id) => !OLD_MISSIONS[n.id].includes(id));
      expect(added.sort()).toEqual(Object.keys(NEW_MISSIONS[n.id]).sort());
      for (const [id, after] of Object.entries(NEW_MISSIONS[n.id])) expect(missions[missions.indexOf(id) - 1], id).toBe(after);
      for (const id of added) {
        const m = n.missions.find((x) => x.id === id);
        expect(m.checkpoint, `${id} checkpoint`).toBeTruthy();
        expect(m.steps.length, id).toBeGreaterThanOrEqual(1);
        // the reward schedule is not this round's to change: XP only
        for (const r of m.rewards ?? []) expect(r.startsWith('xp:'), `${id} ${r}`).toBe(true);
      }
    });
    it(`${n.id}: the new missions vary (no more than one plain brawl among them)`, () => {
      const added = n.missions.filter((m) => !OLD_MISSIONS[n.id].includes(m.id));
      const kinds = new Set(added.flatMap((m) => m.steps.map((s) => s.type ?? 'reach')));
      expect(kinds.size).toBeGreaterThanOrEqual(5);
      // A "plain brawl" mission would be fights and travel only.
      const plain = added.filter((m) => m.steps.every((s) => ['fight', 'reach', undefined, 'wait'].includes(s.type) && !n.fights[s.fight]?.stealth));
      expect(plain.length).toBeLessThanOrEqual(1);
    });
    it(`${n.id}: the runner walks every new step on its own finishing event`, () => {
      const r = createRunner(steps, 0);
      const seen = new Set();
      for (let guard = 0; guard < steps.length * 3 && r.step?.type !== 'nightEnd'; guard++) {
        const s = r.step;
        seen.add(s.id);
        const ev = { cutscene: { type: 'cutsceneDone', scene: s.scene }, fight: { type: 'fightDone', id: s.fight }, collect: { type: 'collected', item: s.item }, boss: { type: 'bossDone' }, chase: { type: 'chaseDone' }, battle: { type: 'battleDone' }, board: { type: 'boardDone', id: s.id } }[s.type]
          ?? ([undefined, 'reach'].includes(s.type) ? { type: 'reached', step: s.id } : { type: 'stepDone', id: s.id });
        if (s.type === 'fork') ev.branch = s.options[0].id;
        if (s.type === 'dilemma') ev.branch = 'batman';
        expect(r.handle(ev), s.id).toBe(true);
      }
      for (const m of n.missions.filter((x) => !OLD_MISSIONS[n.id].includes(x.id))) for (const s of m.steps) expect(seen.has(s.id), `${s.id} is on the main path`).toBe(true);
    });
    it(`${n.id}: mission step types are registered, take no site of their own, and their places resolve`, () => {
      const site = siteOf(n);
      for (const t of [...N2_STEP_TYPES, ...N3_STEP_TYPES]) expect(STEP_TYPES).toContain(t);
      for (const s of steps) {
        if (!['case', 'rescue', 'evade'].includes(s.type)) continue;
        // flow.js finishes any step that has a site when a hero reaches it
        expect(s.site, `${s.id} site`).toBeUndefined();
        expect(finite(site(s.checkpoint)), `${s.id} checkpoint`).toBe(true);
        if (s.type === 'case') {
          expect(validateCaseStep(s, site), s.id).toEqual([]);
          for (const id of caseSites(s)) expect(finite(site(id)), `${s.id} ${id}`).toBe(true);
          for (const t of [s.case.title, s.case.blurb, s.case.reconstruct.prompt, s.case.trail.text, ...s.case.evidence.flatMap((e) => [e.label, e.text]), ...s.case.reconstruct.cards.map((c) => c.text)]) expect(t, s.id).not.toMatch(DASH);
        }
        if (s.type === 'rescue') {
          expect(s.retry, `${s.id} retries itself`).toBe(true);
          expect(s.captives.length).toBeGreaterThanOrEqual(2);
          for (const c of s.captives) expect(finite(site(c.site)), `${s.id} ${c.id}`).toBe(true);
          const f = n.fights[s.guard];
          expect(f, `${s.id} guard fight`).toBeDefined();
          const at = site(f.site);
          // every lock is inside the guards' fight (walking up to one starts it)
          for (const c of s.captives) { const p = site(c.site); expect(Math.hypot(p.x - at.x, p.z - at.z), `${s.id} ${c.id}`).toBeLessThan(f.radius + 6); }
          // a human pace: each lock's hold plus the walk between them fits the clock three times over
          expect(s.timer).toBeGreaterThanOrEqual(s.captives.length * ((s.hold ?? RESCUE.hold) + 10) * 2);
          for (const d of ['story', 'normal', 'hard', 'knightmare']) expect(buildFight(s.guard, f, { difficulty: d }).waves[0].length).toBeGreaterThan(2);
        }
        if (s.type === 'evade') {
          expect(s.level).toBeGreaterThanOrEqual(2);
          expect(s.level).toBeLessThanOrEqual(3); // a helicopter night is not Night Three's
          for (const id of s.ground ?? []) expect(finite(site(id)), `${s.id} ${id}`).toBe(true);
        }
      }
    });
  }

  it('a new mission only asks for what the story has already taught', () => {
    const granted = (night, missionId) => {
      const order = night.missions.map((m) => m.id);
      const at = order.indexOf(missionId);
      return (id) => {
        const g = ABILITIES.find((a) => a.id === id).grant;
        if (g.step) return true; // Night One
        if (Number(g.night.slice(1)) < Number(night.id.slice(1))) return true;
        if (g.night !== night.id) return false;
        return !g.after || order.indexOf(g.after) < at;
      };
    };
    const has = (night, missionId, reward) => { const order = night.missions; const at = order.findIndex((m) => m.id === missionId); return order.slice(0, at).some((m) => (m.rewards ?? []).includes(reward)); };
    // Night Two: battle mode before the drone nest; the boost before the Pinnacle; the gadgets before the ice house
    expect(granted(n2, 'm2Nest')('battleMode')).toBe(true);
    expect(granted(n2, 'm2Holdout')('grappleBoost')).toBe(true);
    expect(has(n2, 'm2IceHouse', 'gadget:sonic')).toBe(true);
    expect(has(n2, 'm2IceHouse', 'gadget:disruptor')).toBe(true);
    // Night Three: the wingsuit is granted before the run to the pier (and the run does not need it)
    expect(granted(n3, 'm3Wheel')('wingsuit')).toBe(true);
    expect(granted(n3, 'm3Frame')('policeAttention')).toBe(true);
    // every tutorial prompt a new step shows belongs to something already granted there
    const PROMPT_ABILITY = { battleMode: 'battleMode', grappleBoost: 'grappleBoost', reGrapple: 'reGrapple' };
    for (const n of [n2, n3]) for (const m of n.missions.filter((x) => !OLD_MISSIONS[n.id].includes(x.id))) for (const s of m.steps) for (const t of s.tutorial ?? []) if (PROMPT_ABILITY[t]) expect(granted(n, m.id)(PROMPT_ABILITY[t]), `${s.id} ${t}`).toBe(true);
    for (const t of nightById('n2').missions.find((m) => m.id === 'm2IceHouse').steps.flatMap((s) => s.tutorial ?? [])) if (t.startsWith('gadget')) expect(['gadgetDisruptor', 'gadgetSonic']).toContain(t);
  });

  it('traversal gates are places to stand (no ring hangs in mid-air), and the clocks are generous', () => {
    for (const n of [n2, n3]) for (const s of stepsOf(n)) {
      if (s.type !== 'traverse' || !['pinnacleClimb', 'wheelRun'].includes(s.id)) continue;
      const site = siteOf(n);
      let d = 0, last = site(s.checkpoint) ?? site(n.missions.find((m) => m.id === s.mission).checkpoint);
      for (const g of s.gates) { const p = site(g); expect(finite(p), `${s.id} ${g}`).toBe(true); d += Math.hypot(p.x - last.x, p.z - last.z) + Math.max(0, p.y - last.y); last = p; }
      // a slow player on foot and grapple (6 m/s over the ground and up) still makes it with the bonuses
      expect(s.timer + s.bonus * (s.gates.length - 1)).toBeGreaterThan(d / 6);
    }
  });
});

describe('rescue rules', () => {
  const step = (r, secs, working, blocked, dt = 0.1) => { let out = null; for (let t = 0; t < secs - 1e-9; t += dt) { const x = r.step(dt, working, blocked); if (x) out = typeof x === 'object' ? { ...x } : x; } return out; };
  it('a lock opens after its hold, and only while a hero works it', () => {
    const r = createRescue({ count: 2, hold: 2, timer: 60 });
    expect(step(r, 1.5, [true, false], [false, false])).toBe(null);
    expect(r.fraction(0)).toBeCloseTo(0.75, 1);
    expect(step(r, 0.6, [true, false], [false, false])).toEqual({ freed: 0 });
    expect(r.isFree(0)).toBe(true);
    expect(r.left).toBe(1);
  });
  it('a guard standing over it stops the work, and progress slips back', () => {
    const r = createRescue({ count: 1, hold: 2, timer: 60 });
    step(r, 1, [true], [false]);
    const before = r.fraction(0);
    step(r, 1, [true], [true]);
    expect(r.fraction(0)).toBeLessThan(before);
    expect(r.isFree(0)).toBe(false);
  });
  it('the last one out stops the clock; running out first is a failure', () => {
    const r = createRescue({ count: 2, hold: 1, timer: 10 });
    step(r, 1.1, [true, false], [false, false]);
    expect(step(r, 1.1, [false, true], [false, false])).toBe('allFree');
    const c = r.clock;
    step(r, 5, [false, false], [false, false]);
    expect(r.clock).toBe(c);
    expect(r.done).toBe(true);
    const late = createRescue({ count: 1, hold: 1, timer: 3 });
    expect(step(late, 3.2, [false], [false])).toBe('timeout');
    expect(late.step(1, [true], [false])).toBe(null);
    late.reset();
    expect(late.clock).toBe(3);
    expect(step(late, 1.1, [true], [false])).toBe('allFree');
  });
  it('captiveAt finds the lock a hero is standing at, on the same level', () => {
    const spots = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }];
    expect(captiveAt(spots, { x: 9, y: 0.2, z: 1 })).toBe(1);
    expect(captiveAt(spots, { x: 5, y: 0, z: 0 })).toBe(-1);
    expect(captiveAt(spots, { x: 0, y: 8, z: 0 })).toBe(-1);
  });
});

describe('evade rules', () => {
  it('is over only once the level has been at zero for a while, and never at once', () => {
    const e = createEvade({ settle: 2, minSeconds: 6 });
    for (let i = 0; i < 50; i++) expect(e.step(0.1, { level: 3 })).toBe(null);
    for (let i = 0; i < 15; i++) expect(e.step(0.1, { level: 0 })).toBe(null);
    expect(e.step(0.1, { level: 2 })).toBe(null); // seen again: the quiet starts over
    let out = null, n = 0;
    while (!out && n++ < 100) out = e.step(0.1, { level: 0 });
    expect(out).toBe('clear');
    expect(n).toBeGreaterThanOrEqual(20);
    expect(e.peak).toBe(3);
  });
  it('a cell is not an escape: custody holds it open; a headless run ends after the minimum', () => {
    const e = createEvade({ settle: 1, minSeconds: 3 });
    for (let i = 0; i < 100; i++) expect(e.step(0.1, { level: 0, busy: true })).toBe(null);
    const f = createEvade({ settle: 1, minSeconds: 3 });
    let t = 0;
    while (f.step(0.1, { level: 0 }) !== 'clear') t += 0.1;
    expect(t).toBeGreaterThanOrEqual(2.8);
    expect(t).toBeLessThan(3.3);
  });
});

// ---------------------------------------------------------------- the step types, end to end
function fakeCtx(night, extra = {}) {
  const hero = { pos: { x: 0, y: 0, z: 0 }, dead: false };
  const doneIds = [], failedIds = [], said = [], emitted = [];
  const mark = () => ({ mesh: { visible: true } });
  const ctx = {
    hero, doneIds, failedIds, said, emitted,
    markers: { place: mark, color() {}, flash() {}, release() {} },
    ui: { timer() {}, meter() {} },
    radio: { say: (l) => { said.push(...l); } },
    hud: { card() {}, hint() {}, chip() {}, setObjective() {} },
    events: { emit: (name, d) => emitted.push([name, d]), on() {} },
    standing: () => [hero],
    players: () => [{ hero, slot: 0 }],
    site: siteOf(night),
    theGame: () => extra.game ?? { state: { detectiveOn: true } },
    done: (s) => doneIds.push(s.id),
    fail: (s) => failedIds.push(s.id),
    isReplica: () => false,
    ...extra,
  };
  return ctx;
}
const run = (type, s, secs, dt = 0.1) => { for (let t = 0; t < secs; t += dt) type.update(dt, s); };

describe('the case step', () => {
  for (const [n, id] of [[n2, 'aquariumCase'], [n3, 'nestCase']]) {
    const s = stepsOf(n).find((x) => x.id === id);
    it(`${id}: evidence, the board's answer and the trail finish the step`, () => {
      vi.useFakeTimers();
      const ctx = fakeCtx(n);
      const type = createCaseStep(ctx);
      type.enter(s);
      expect(type.debugSolve().length).toBe(s.case.evidence.length);
      // stand at each piece of evidence with detective vision on
      for (let guard = 0; guard < 12 && type.run?.stageName === 'scene'; guard++) { const p = type.debugSolve()[0]; Object.assign(ctx.hero.pos, p.at); run(type, s, p.hold); }
      expect(type.run.stageName).toBe('reconstruct');
      expect(ctx.emitted.filter(([e]) => e === 'caseClue').length).toBe(s.case.evidence.length);
      // a wrong order costs a line, not the step
      const wrong = s.case.reconstruct.order.slice().reverse();
      type.run.answer(wrong);
      expect(type.run.stageName).toBe('reconstruct');
      expect(type.debugAct()).toBe(true);
      run(type, s, 0.3);
      expect(type.run.stageName).toBe('trail');
      for (let guard = 0; guard < 12 && type.run; guard++) { const p = type.debugSolve()[0]; if (!p) break; Object.assign(ctx.hero.pos, p.at); run(type, s, p.hold + 0.4); }
      expect(ctx.doneIds).toEqual([id]);
      expect(ctx.emitted.some(([e, d]) => e === 'caseSolved' && d.step === id)).toBe(true);
      expect(ctx.emitted.some(([e]) => e === 'caseStage')).toBe(false); // the open world's board listens to that name
      type.exit();
      vi.useRealTimers();
    });
    it(`${id}: nothing is tagged without detective vision`, () => {
      const ctx = fakeCtx(n, { game: { state: { detectiveOn: false } } });
      const type = createCaseStep(ctx);
      type.enter(s);
      const p = type.debugSolve()[0];
      Object.assign(ctx.hero.pos, p.at);
      run(type, s, 4);
      expect(type.run.foundCount).toBe(0);
      type.exit();
    });
    it(`${id}: the engine's own walk solves the same definition`, () => {
      const r = createCaseRun(caseDefOf(s), { site: siteOf(n) });
      for (let k = 0; k < 4; k++) r.skipStage();
      expect(r.solved).toBe(true);
    });
  }
});

describe('the rescue step', () => {
  for (const [n, id] of [[n2, 'quayRescue'], [n3, 'wheelRescue']]) {
    const s = stepsOf(n).find((x) => x.id === id);
    const fakeEncounters = () => { const E = { id: null, enemies: [], begin(fid, def) { E.id = fid; E.def = def; E.enemies = [{ alive: true, pos: { ...siteOf(n)(s.captives[0].site) } }]; }, end() { E.id = null; E.enemies = []; E.ended = true; } }; return E; };
    it(`${id}: guards block a lock; with them down every lock opens and the step ends`, () => {
      const E = fakeEncounters();
      const ctx = fakeCtx(n, { encounters: E, fight: (fid) => n.fights[fid] });
      const type = createRescueStep(ctx);
      type.enter(s);
      expect(E.id).toBe(`${id}Guard`);
      Object.assign(ctx.hero.pos, siteOf(n)(s.captives[0].site));
      run(type, s, 4);
      expect(type.rules.isFree(0)).toBe(false); // a guard is standing over it
      E.enemies[0].alive = false;
      for (let guard = 0; guard < 6 && !type.mopUp; guard++) { const p = type.debugSolve()[0]; Object.assign(ctx.hero.pos, p.at); run(type, s, p.hold); }
      expect(type.mopUp).toBe(true);
      run(type, s, 0.2);
      expect(ctx.doneIds).toEqual([id]);
      expect(ctx.failedIds).toEqual([]);
      type.exit();
    });
    it(`${id}: the clock running out fails the step (the mission retries from it)`, () => {
      const ctx = fakeCtx(n, { encounters: fakeEncounters(), fight: (fid) => n.fights[fid] });
      const type = createRescueStep(ctx);
      type.enter(s);
      ctx.hero.pos.x = 9999;
      run(type, s, s.timer + 1, 0.5);
      expect(ctx.failedIds).toEqual([id]);
      expect(ctx.doneIds).toEqual([]);
      const steps = stepsOf(n);
      expect(createRunner(steps, steps.indexOf(s)).retryIndex()).toBe(steps.indexOf(s));
      type.exit();
    });
    it(`${id}: an online guest never starts the guards`, () => {
      const E = fakeEncounters();
      const type = createRescueStep(fakeCtx(n, { encounters: E, fight: (fid) => n.fights[fid], isReplica: () => true }));
      type.enter(s);
      expect(E.id).toBe(null);
      type.exit();
      expect(E.ended).toBeUndefined();
    });
  }
});

describe('the evade step', () => {
  const s = stepsOf(n3).find((x) => x.id === 'n3Framed');
  const fakeWanted = () => { const W = { level: 0, custody: null, caughtHero: null, calls: [], set(l, o) { W.level = l; W.calls.push(['set', l, o]); }, clear(r) { W.level = 0; W.calls.push(['clear', r]); } }; return W; };
  it('sets the level through the wanted story API and ends when the search does', () => {
    const W = fakeWanted();
    const ctx = fakeCtx(n3, { game: { wanted: W, state: {} } });
    const type = createEvadeStep(ctx);
    type.enter(s);
    expect(W.calls).toEqual([]); // a head start: the warning plays first
    run(type, s, s.delay + 0.2);
    expect(W.calls[0][0]).toBe('set');
    expect(W.calls[0][1]).toBe(s.level);
    expect(W.calls[0][2].scripted).toBe(true);
    run(type, s, 30);
    expect(ctx.doneIds).toEqual([]);
    expect(type.debugSolve()[0].at).toEqual(siteOf(n3)('batcaveDowntown'));
    W.level = 0;
    run(type, s, 1);
    expect(ctx.doneIds).toEqual([]);
    run(type, s, 2);
    expect(ctx.doneIds).toEqual(['n3Framed']);
    expect(ctx.said.length).toBe(s.clearLines.length);
  });
  it('a guest does not set the level; with no wanted system the step still ends', () => {
    const W = fakeWanted();
    const guest = createEvadeStep(fakeCtx(n3, { game: { wanted: W, state: {} }, isReplica: () => true }));
    guest.enter(s);
    expect(W.calls).toEqual([]);
    const ctx = fakeCtx(n3, { game: { state: {} } });
    const type = createEvadeStep(ctx);
    type.enter(s);
    run(type, s, s.delay + 8);
    expect(ctx.doneIds).toEqual(['n3Framed']);
  });
  it('never touches an officer: the only calls it makes are set and (dev) clear', () => {
    const W = fakeWanted();
    const type = createEvadeStep(fakeCtx(n3, { game: { wanted: W, state: {} } }));
    type.enter(s);
    run(type, s, s.delay + 0.2);
    expect(type.debugAct()).toBe(true);
    expect(W.calls.map((c) => c[0])).toEqual(['set', 'clear']);
  });
});

describe('side content keeps off a mission set piece', () => {
  it('the city director starts nothing during a case, a rescue or an escape', () => {
    for (const stepType of ['case', 'rescue', 'evade', 'traverse']) expect(governor({ stepType, sinceStep: 999 }).spawn, stepType).toBe(false);
    expect(governor({ stepType: 'reach', sinceStep: 999 }).spawn).toBe(true);
  });
  it('no travel step of a new mission ends inside an open-world stealth encounter doorway', () => {
    // An unplayed encounter engages when a hero comes within 14 m of its entry (src/openworld/index.js).
    for (const n of [n2, n3]) for (const m of n.missions.filter((x) => !OLD_MISSIONS[n.id].includes(x.id))) for (const s of m.steps) {
      if (![undefined, 'reach', 'collect'].includes(s.type)) continue;
      const p = siteOf(n)(s.site);
      for (const e of ENCOUNTERS) expect(Math.hypot(p.x - e.entry.x, p.z - e.entry.z) > 20 || Math.abs(p.y - e.entry.y) > 12, `${s.id} vs ${e.id}`).toBe(true);
    }
    // ...and no lock of a rescue stands in one (the player finishes the rescue standing at a lock)
    for (const n of [n2, n3]) for (const s of stepsOf(n)) for (const c of s.captives ?? []) {
      const p = siteOf(n)(c.site);
      for (const e of ENCOUNTERS) expect(Math.hypot(p.x - e.entry.x, p.z - e.entry.z), `${s.id} ${c.id} vs ${e.id}`).toBeGreaterThan(20);
    }
  });
});

describe('the Riddler stays hittable once his shield is down', () => {
  // The stall: his crew (an encounter squad) is still up at the final answer; the next knockout
  // makes encounters.publish() replace the combat list, he drops off it, and no strike can land.
  const fakeBoss = () => {
    const C = { enemies: [], setEnemies(list) { C.enemies = list; } };
    const e = { state: 'open', vulnerable: 4 };
    const opened = [];
    return { C, e, opened, b: { e, done: false, deps: { combat: C }, tier: { window: 1 }, data: { solved: true, reopenT: 0, markers: { update() {} } }, actor: { open: (s) => opened.push(s), ch: { animator: { play() {} } } } } };
  };
  it('a crew knockout after the final answer does not take him off the combat list', () => {
    const { C, e, b } = fakeBoss();
    const goon = { alive: true };
    C.setEnemies([goon, e]); // the final answer: he joins the list beside his crew
    riddleTick(0.016, b, 2);
    expect(C.enemies).toContain(e);
    C.setEnemies([goon]); // encounters.publish() after a knockout: the squad only
    riddleTick(0.016, b, 2);
    expect(C.enemies).toEqual([goon, e]);
    C.setEnemies([]); // the last of the crew goes down and the bodies are cleaned up
    riddleTick(0.016, b, 2);
    expect(C.enemies).toEqual([e]);
  });
  it('a missed window still reopens with him listed; a beaten Riddler is left alone', () => {
    const { C, e, opened, b } = fakeBoss();
    e.state = 'recover'; e.vulnerable = 0; b.data.reopenT = 0.01; b.data.zapT = 99;
    riddleTick(0.016, b, 2);
    expect(opened.length).toBe(1);
    expect(C.enemies).toContain(e);
    b.done = true;
    C.setEnemies([]);
    keepListed(b);
    expect(C.enemies).toEqual([]);
  });
});

describe('fill light over the new set pieces (no scene too dark)', () => {
  it('every new fight, room, rescue and case stands inside a fill', () => {
    for (const n of [n2, n3]) {
      const site = siteOf(n);
      const lit = (p) => n.fills.some((f) => { const b = fillSpot(f).room; return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ && p.y >= b.minY && p.y <= b.maxY; });
      for (const m of n.missions.filter((x) => !OLD_MISSIONS[n.id].includes(x.id))) for (const s of m.steps) {
        const at = s.type === 'fight' ? site(n.fights[s.fight].site ?? n.rooms[n.fights[s.fight].stealth].site) : s.type === 'rescue' ? site(n.fights[s.guard].site) : s.type === 'case' ? site(s.case.scene) : null;
        if (!at || s.id === 'aquariumCase') continue; // the Aquarium door stands under the campus lamps (screenshot)
        expect(lit(at), `${n.id} ${s.id}`).toBe(true);
      }
    }
  });
  it('fills are spots for the shared pool (no new lights), added once per night', () => {
    const calls = [];
    const world = { lightPool: { addSpots: (l) => calls.push(l) } };
    expect(registerNightFills({ id: 'nX' }, world)).toBe(0);
    expect(registerNightFills({ id: 'nTestFill', fills: [{ id: 'a', x: 0, y: 10, z: 0, r: 10 }] }, null)).toBe(0);
    expect(registerNightFills({ id: 'nTestFill', fills: [{ id: 'a', x: 0, y: 10, z: 0, r: 10 }] }, world)).toBe(1);
    expect(registerNightFills({ id: 'nTestFill', fills: [{ id: 'a', x: 0, y: 10, z: 0, r: 10 }] }, world)).toBe(0);
    expect(calls.length).toBe(1);
    const s = calls[0][0];
    expect(s.y).toBeGreaterThan(10);
    expect(s.intensity).toBeGreaterThan(0);
    expect(s.room.minX).toBe(-10);
  });
});

describe('the open world holds off during every main story beat, in every night', () => {
  it('any typed step of any night is a beat; a travel step is one once a hero is arriving', () => {
    const types = new Set();
    for (const n of allNights()) for (const s of stepsOf(n)) types.add(s.type ?? 'reach');
    for (const t of types) {
      if (t === 'reach' || t === 'credits' || t === 'nightEnd') continue;
      expect(storyHold({ hasStep: true, stepType: t, targetDist: 9999 }), t).toBe(true);
    }
    expect(storyHold({ hasStep: true, stepType: 'reach', targetDist: STORY_NEAR - 1 })).toBe(true);
    expect(storyHold({ hasStep: true, stepType: 'reach', targetDist: STORY_NEAR + 200 })).toBe(false); // a travel leg: free roam between beats
    expect(storyHold({ hasStep: true, stepType: 'someFutureType' })).toBe(true); // not a list: a new step type is held too
  });
  it('free roam (no step, the credits, a night just ended) is never held; a cutscene always is', () => {
    expect(storyHold({ hasStep: false })).toBe(false);
    expect(storyHold({ hasStep: true, stepType: 'credits' })).toBe(false);
    expect(storyHold({ hasStep: true, stepType: 'nightEnd' })).toBe(false);
    expect(storyHold({ mode: 'cutscene', hasStep: false })).toBe(true);
  });
  it('a held story spawns and engages nothing, but what is live still ages away (and a forced crime still runs)', () => {
    const g = governor({ stepType: 'reach', sinceStep: 999, story: true });
    expect(g.spawn).toBe(false);
    expect(g.cap).toBe(0);
    expect(g.age).toBe(true);
    expect(governor({ stepType: 'scan', sinceStep: 999, story: true }).spawn).toBe(false);
    expect(governor({ freeRoam: true, story: false }).spawn).toBe(true);
  });
});

describe('second pass: every new mission has real stages', () => {
  const added = (n) => n.missions.filter((m) => !OLD_MISSIONS[n.id].includes(m.id));
  it('each of the eight has at least two set pieces of different kinds, and at least four steps', () => {
    const SET = new Set(['fight', 'case', 'rescue', 'evade', 'carTail', 'tail', 'battle', 'chase', 'traverse', 'scan']);
    for (const n of [n2, n3]) for (const m of added(n)) {
      const kinds = new Set(m.steps.filter((s) => SET.has(s.type)).map((s) => (s.type === 'fight' && n.fights[s.fight].stealth ? 'predator' : s.type)));
      expect(kinds.size, `${m.id}: ${[...kinds]}`).toBeGreaterThanOrEqual(2);
      expect(m.steps.length >= 4, m.id).toBe(true);
    }
  });
  it('still at most one plain brawl mission a night, and no night leans on one kind of stage', () => {
    for (const n of [n2, n3]) {
      const brawls = added(n).flatMap((m) => m.steps).filter((s) => s.type === 'fight' && !n.fights[s.fight].stealth);
      // open fights among the additions are small (a terrace, a roof, a deck): one wave or two, never the mission
      for (const s of brawls) expect(n.fights[s.fight].waves.length, s.id).toBeLessThanOrEqual(2);
      const rooms = added(n).flatMap((m) => m.steps).filter((s) => s.type === 'fight' && n.fights[s.fight].stealth);
      expect(rooms.length).toBeLessThanOrEqual(4);
    }
  });
  it('every new predator room: routes and cover inside its bounds, squad sized for the tier, entry outside the lamps', () => {
    for (const n of [n2, n3]) for (const id of ['iceHouse', 'bandShell', 'skyRoom', 'ballroomDeck', 'riverArch', 'clearingRoof', 'darkroom']) {
      const r = n.rooms[id];
      if (!r) continue;
      const b = r.bounds, site = siteOf(n);
      const inside = (p) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ && p.y >= b.minY && p.y <= b.maxY;
      for (const g of r.squad) for (const p of g.route.points) expect(inside(p), `${id} route ${p.x},${p.z}`).toBe(true);
      for (const c of r.cover) expect(inside(c), `${id} cover`).toBe(true);
      expect(r.squad.length).toBeGreaterThanOrEqual(4);
      expect(r.squad.length).toBeLessThanOrEqual(6); // skinned meshes: the perf budget
      expect(r.lights.length, `${id} lamps`).toBeGreaterThanOrEqual(2);
      const e = site(r.entry);
      for (const l of r.lights) expect(Math.hypot(e.x - l.x, e.z - l.z), `${id} entry in a lamp`).toBeGreaterThan(l.r);
      // nobody starts inside a crate
      for (const g of r.squad) for (const p of g.route.points) for (const c of r.cover) expect(Math.abs(p.x - c.x) > 1.2 || Math.abs(p.z - c.z) > 1.2, `${id} ${p.x},${p.z} in cover`).toBe(true);
    }
  });
  it('roles in the new squads are ones the act has introduced (the baton is new in Night Three)', () => {
    for (const r of Object.values(n2.rooms)) for (const g of r.squad) expect(['grunt', 'knife', 'rifle', 'shield', 'brute'], `${r.id} ${g.type}`).toContain(g.type);
    for (const f of ['hallRoof', 'pinnacleTop']) for (const e of n2.fights[f].waves.flat()) expect(['grunt', 'knife', 'rifle', 'shield', 'brute']).toContain(e.type);
    for (const r of Object.values(n3.rooms)) for (const g of r.squad) expect(['grunt', 'knife', 'rifle', 'shield', 'brute', 'baton'], `${r.id} ${g.type}`).toContain(g.type);
  });
});

describe('the tail step', () => {
  const s = stepsOf(n2).find((x) => x.id === 'n2Tail');
  const fakeVehicles = () => { const V = { active: { kind: 'batmobile' }, calls: [], chases: { startTail(o) { V.calls.push(o); V.onDone = o.onDone; return { units: [{ t: { x: 1, y: 0, z: 2 } }] }; } }, debugWin() { V.onDone?.({ ok: true, why: 'debug' }); return true; } }; return V; };
  it('follows a board step, starts the vehicle system tail and ends when the quarry arrives', () => {
    const steps = stepsOf(n2);
    expect(steps[steps.indexOf(s) - 1].type).toBe('board');
    expect(s.site).toBeUndefined();
    const V = fakeVehicles();
    const ctx = fakeCtx(n2, { game: { vehicles: V, state: {} } });
    const type = createTailStep(ctx);
    type.enter(s);
    expect(V.calls.length).toBe(1);
    expect(V.calls[0].nodes).toBe(s.nodes);
    expect(type.marker()).toEqual({ x: 1, y: 0, z: 2 });
    V.onDone({ ok: true, why: 'arrived' });
    expect(ctx.doneIds).toEqual(['n2Tail']);
  });
  it('spotted or lost starts the tail again after a beat, never a failure', () => {
    const V = fakeVehicles();
    const ctx = fakeCtx(n2, { game: { vehicles: V, state: {} } });
    const type = createTailStep(ctx);
    type.enter(s);
    V.onDone({ ok: false, why: 'spotted' });
    expect(ctx.doneIds).toEqual([]);
    expect(ctx.failedIds).toEqual([]);
    expect(ctx.said.length).toBe(1);
    run(type, s, 3.2);
    expect(V.calls.length).toBe(2);
    V.onDone({ ok: false, why: 'lost' });
    run(type, s, 3.2);
    expect(V.calls.length).toBe(3);
    expect(type.debugAct()).toBe(true);
    expect(ctx.doneIds).toEqual(['n2Tail']);
  });
  it('a guest starts nothing; with no vehicle system the step ends on its own', () => {
    const V = fakeVehicles();
    const guest = createTailStep(fakeCtx(n2, { game: { vehicles: V, state: {} }, isReplica: () => true }));
    guest.enter(s);
    expect(V.calls.length).toBe(0);
    const ctx = fakeCtx(n2, { game: { state: {} } });
    const type = createTailStep(ctx);
    type.enter(s);
    run(type, s, 2.5);
    expect(ctx.doneIds).toEqual(['n2Tail']);
  });
});

describe('going to ground ends the police escape (and online, only when both heroes are there)', () => {
  const s = stepsOf(n3).find((x) => x.id === 'n3Framed');
  const door = siteOf(n3)('batcaveDowntown');
  const setup = (heroes) => {
    const W = { level: 0, custody: null, caughtHero: null, calls: [], set(l) { W.level = l; W.calls.push('set'); }, clear() { W.level = 0; W.calls.push('clear'); } };
    const ctx = fakeCtx(n3, { game: { wanted: W, state: {} }, standing: () => heroes });
    ctx.hero.pos = heroes[0].pos;
    const type = createEvadeStep(ctx);
    type.enter(s);
    run(type, s, s.delay + 0.2);
    return { W, ctx, type };
  };
  it('one hero at the cave door: the search is over a few seconds later, with no stand-down from outside', () => {
    const h = { pos: { x: 0, y: 0, z: -420 }, dead: false };
    const { W, ctx, type } = setup([h]);
    run(type, s, 20);
    expect(W.level).toBe(3);
    Object.assign(h.pos, door);
    run(type, s, 2);
    expect(W.level).toBe(3); // not at once: they have to get inside
    run(type, s, 1);
    expect(W.calls).toEqual(['set', 'clear']);
    run(type, s, 2.5);
    expect(ctx.doneIds).toEqual(['n3Framed']);
  });
  it('two heroes: one at the door is not enough; both is', () => {
    const a = { pos: { ...door }, dead: false }, b = { pos: { x: 0, y: 0, z: -420 }, dead: false };
    const { W, ctx, type } = setup([a, b]);
    run(type, s, 30);
    expect(W.level).toBe(3);
    expect(ctx.doneIds).toEqual([]);
    Object.assign(b.pos, { x: door.x + 2, y: door.y, z: door.z });
    run(type, s, 6);
    expect(W.calls).toEqual(['set', 'clear']);
    expect(ctx.doneIds).toEqual(['n3Framed']);
  });
  it('a guest never clears it; a hero in the cell is not "gone to ground"', () => {
    const h = { pos: { ...door }, dead: false };
    const W = { level: 3, custody: {}, caughtHero: null, calls: [], set() {}, clear() { W.calls.push('clear'); } };
    const ctx = fakeCtx(n3, { game: { wanted: W, state: {} }, standing: () => [h] });
    ctx.hero.pos = h.pos;
    const type = createEvadeStep(ctx);
    type.enter(s);
    run(type, s, s.delay + 10);
    expect(W.calls).toEqual([]);
    const G = { level: 3, custody: null, caughtHero: null, calls: [], set() {}, clear() { G.calls.push('clear'); } };
    const gctx = fakeCtx(n3, { game: { wanted: G, state: {} }, standing: () => [h], isReplica: () => true });
    gctx.hero.pos = h.pos;
    const guest = createEvadeStep(gctx);
    guest.enter(s);
    run(guest, s, s.delay + 10);
    expect(G.calls).toEqual([]);
  });
});
