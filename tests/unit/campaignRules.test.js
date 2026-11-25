// The campaign's pure rules: the mission runner, the save field, start params, step logic, the
// boss rules and the pacing report (the before/after numbers of the Night One pacing pass).
import { describe, it, expect } from 'vitest';
import { createRunner } from '../../src/story/runner.js';
import { createObjectives } from '../../src/game/objectives.js';
import { sanitizeCampaign, applyStartParams, CAMPAIGN_DEFAULT } from '../../src/story/campaignSave.js';
import { sanitizeProgress, loadProgress, saveProgress } from '../../src/core/save.js';
import { migrateProgress, resolveStep } from '../../src/game/storyMigrate.js';
import { STEPS } from '../../src/game/story.js';
import { ALIASES, stepIndexOf } from '../../src/game/storyAliases.js';
import { stepsOf, registerNight, unregisterNight, registerDayHook, dayHook, registerSideMission, sideMissionsAvailable, isRewardId } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';
import { createSequence, createGates, fearStep, inCone, FEAR } from '../../src/story/stepLogic.js';
import { createTargeting, barFraction, bossTier, BOSS_TIERS, HITS_PER_WINDOW } from '../../src/bosses/rules.js';
import { buildFight, placeRing } from '../../src/story/fightBuilder.js';
import { pacingReport } from '../../src/story/pacing.js';

const steps = [
  { id: 'a', type: 'reach', mission: 'm1' },
  { id: 'b', type: 'fork', mission: 'm1', options: [{ id: 'left' }, { id: 'right' }], branches: { left: 'c', right: 'd' } },
  { id: 'c', type: 'reach', mission: 'm2', next: 'e' },
  { id: 'd', type: 'fight', fight: 'f', mission: 'm2', retry: true },
  { id: 'e', type: 'puzzle', mission: 'm2' },
  { id: 'f', type: 'nightEnd', mission: 'm3' },
];

describe('mission runner', () => {
  it('walks a linear list exactly like the old objectives runner', () => {
    const lin = STEPS.slice(0, 12);
    const a = createRunner(lin), b = createObjectives(lin);
    for (const s of lin) {
      const ev = s.type === 'cutscene' ? { type: 'cutsceneDone', scene: s.scene } : s.type === 'fight' ? { type: 'fightDone', id: s.fight } : s.type === 'collect' ? { type: 'collected', item: s.item } : ['courier', 'board', 'ally', 'radio'].includes(s.type) ? { type: `${s.type}Done`, id: s.id } : ['chase', 'battle'].includes(s.type) ? { type: `${s.type}Done` } : { type: 'reached', step: s.id };
      expect(a.handle({ type: 'reached', step: 'nope' })).toBe(b.handle({ type: 'reached', step: 'nope' }));
      expect(a.handle(ev)).toBe(b.handle(ev));
      expect(a.index).toBe(b.index);
    }
  });
  it('branches, next, retry and generic stepDone', () => {
    const r = createRunner(steps);
    expect(r.handle({ type: 'reached', step: 'a' })).toBe(true);
    expect(r.peek().id).toBe('c');
    expect(r.handle({ type: 'stepDone', id: 'b', branch: 'right' })).toBe(true);
    expect(r.step.id).toBe('d');
    expect(r.retryIndex()).toBe(3); // d is the mission's retry step
    r.jump(4);
    expect(r.fail()).toBe(3);
    const r2 = createRunner(steps, 1);
    r2.handle({ type: 'stepDone', id: 'b', branch: 'left' });
    expect(r2.step.id).toBe('c');
    r2.handle({ type: 'reached', step: 'c' });
    expect(r2.step.id).toBe('e'); // next skips d
    expect(createRunner(steps, 2).retryIndex()).toBe(2); // no retry step at or before: mission start
  });
  it('tracks optional objectives and mission starts', () => {
    const r = createRunner([{ id: 'x', optional: [{ id: 'o1' }, { id: 'o2' }], mission: 'm' }]);
    expect(r.optionals().map((o) => o.id)).toEqual(['o1', 'o2']);
    expect(r.completeOptional('o1')).toBe(true);
    expect(r.completeOptional('o1')).toBe(false);
    expect(r.optionals().map((o) => o.id)).toEqual(['o2']);
    expect(createRunner(steps).missionStart('m2')).toBe(2);
  });
});

describe('the campaign save field', () => {
  const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
  it('an old save with no campaign field loads with the default and resumes Night One where it was', () => {
    const storage = mem({ 'gotham-progress-v1': JSON.stringify({ stepId: 'toNeon', trophies: [2], suit: 'm' }) });
    const p = migrateProgress(loadProgress(storage));
    expect(p.campaign).toEqual({ ...CAMPAIGN_DEFAULT });
    expect(p.stepId).toBe('toNeon');
  });
  it('a save sitting on a retired Night One step lands on the step that absorbed it', () => {
    for (const [old, now] of Object.entries(ALIASES)) expect(resolveStep({ stepId: old }), old).toBe(STEPS.findIndex((s) => s.id === now));
    expect(stepIndexOf(STEPS, 'aceClueRadio')).toBe(STEPS.findIndex((s) => s.id === 'toAce'));
  });
  it('round-trips a mid-campaign save and rejects junk', () => {
    const c = { night: 'n3', stepId: 'someStep', nightsDone: ['n1', 'n2'], missionsDone: ['n2.m2Lounge'], optionalDone: ['n2.lookout'], rewards: ['gadget:disruptor', 'xp:300'], daysSeen: ['day.n2'] };
    // [story2] a save from before the double-life fields loads with their defaults, nothing else changes
    expect(sanitizeCampaign(c)).toEqual({ ...CAMPAIGN_DEFAULT, ...c });
    const storage = mem();
    saveProgress(storage, sanitizeProgress({ campaign: c }));
    expect(loadProgress(storage).campaign).toEqual({ ...CAMPAIGN_DEFAULT, ...c });
    const later = { ...c, night: 'n7', stepId: 'n7Board', choices: { 'n6.party': 'batman', 'n6.cover': 'dog' }, boss: { id: 'firefly', phase: 1 }, ending: null };
    expect(sanitizeCampaign(later)).toEqual(later);
    saveProgress(storage, sanitizeProgress({ campaign: later }));
    expect(loadProgress(storage).campaign).toEqual(later);
    expect(sanitizeCampaign({ ...later, choices: { 'bad key!': 'x', 'n6.ok': '<script>' }, boss: { id: 'x', phase: 99 } })).toEqual({ ...later, choices: {}, boss: null });
    expect(sanitizeCampaign({ night: '<x>', stepId: 5, nightsDone: 'n1', rewards: ['nope', 'gadget:ok'] })).toEqual({ ...CAMPAIGN_DEFAULT, rewards: ['gadget:ok'] });
    expect(sanitizeCampaign(null)).toEqual({ ...CAMPAIGN_DEFAULT });
  });
  it('?night= and ?at= start params', () => {
    const base = sanitizeProgress({});
    const n2 = applyStartParams(base, new URLSearchParams('night=n2'), { nightSteps: stepsOf, nightOneSteps: STEPS, aliases: ALIASES });
    expect(n2.campaign.night).toBe('n2');
    expect(n2.campaign.stepId).toBe(stepsOf('n2')[0].id);
    expect(n2.stepId).toBe('credits');
    expect(n2.campaign.nightsDone).toContain('n1');
    const at = applyStartParams(n2, new URLSearchParams('at=harleyRadio'), { nightSteps: stepsOf, nightOneSteps: STEPS, aliases: ALIASES });
    expect(at.stepId).toBe('toHarleyDoor');
    expect(at.campaign.night).toBe('n1');
  });
});

describe('registries', () => {
  it('a night registers into its act and can be found and removed', () => {
    registerNight({ id: 'zTest', act: 'act4', number: 6, missions: [{ id: 'm', steps: [{ id: 's', type: 'nightEnd' }] }] });
    expect(stepsOf('zTest')[0]).toMatchObject({ id: 's', mission: 'm' });
    unregisterNight('zTest');
    expect(stepsOf('zTest')).toEqual([]);
    expect(() => registerNight({ id: 'zBad', act: 'act9', missions: [] })).toThrow();
  });
  it('day hooks and side missions', () => {
    const off = registerDayHook('day.test', async () => {});
    expect(typeof dayHook('day.test')).toBe('function');
    off();
    expect(dayHook('day.test')).toBe(null);
    const off2 = registerSideMission({ id: 'sTest', after: 'n2' });
    expect(sideMissionsAvailable({ nightsDone: ['n1'] }).some((m) => m.id === 'sTest')).toBe(false);
    expect(sideMissionsAvailable({ nightsDone: ['n1', 'n2'] }).some((m) => m.id === 'sTest')).toBe(true);
    off2();
    expect(isRewardId('gadget:disruptor')).toBe(true);
    expect(isRewardId('cash:5')).toBe(false);
  });
});

describe('step logic', () => {
  it('puzzle sequences reset on a wrong plate', () => {
    const q = createSequence(['a', 'b', 'c']);
    expect(q.press('a')).toBe('ok');
    expect(q.press('a')).toBe('same');
    expect(q.press('c')).toBe('wrong');
    expect(q.progress).toBe(0);
    expect(['a', 'b', 'c'].map((x) => q.press(x))).toEqual(['ok', 'ok', 'done']);
  });
  it('gates only count in order', () => {
    const g = createGates(3);
    expect(g.pass(1)).toBe(null);
    expect([g.pass(0), g.pass(1), g.pass(2)]).toEqual(['next', 'next', 'done']);
  });
  it('the fear meter rises in gas, faster when seen, jumps on a phantom hit, drains outside', () => {
    expect(fearStep(0, { inGas: true }, 1)).toBeCloseTo(FEAR.gas);
    expect(fearStep(0, { inGas: true, seen: true }, 1)).toBeCloseTo(FEAR.gas + FEAR.seen);
    expect(fearStep(10, { hits: 1 }, 0)).toBe(10 + FEAR.hitPhantom);
    expect(fearStep(50, {}, 1)).toBe(50 - FEAR.drain);
    expect(fearStep(99, { hits: 3 }, 0)).toBe(100);
  });
  it('watcher cones', () => {
    expect(inCone({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 5 })).toBe(true);
    expect(inCone({ x: 0, z: 0, yaw: 0 }, { x: 0, z: -5 })).toBe(false);
    expect(inCone({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 20 })).toBe(false);
  });
});

describe('boss rules', () => {
  const H = (x, z) => ({ pos: { x, z }, dead: false });
  it('tiers never add health: windows and tells change, hits per window do not', () => {
    expect(bossTier('nope')).toBe(BOSS_TIERS.normal);
    expect(BOSS_TIERS.knightmare.tell).toBeLessThan(BOSS_TIERS.story.tell);
    expect(HITS_PER_WINDOW).toBe(5);
    for (const t of Object.values(BOSS_TIERS)) expect(t).not.toHaveProperty('health');
  });
  it('the bar fills by phase', () => {
    expect(barFraction(0, 3, 0)).toBe(1);
    expect(barFraction(1, 3, 0.5)).toBeCloseTo(0.5);
    expect(barFraction(3, 3, 0)).toBe(0);
  });
  it('targets the nearest, swaps between two heroes, and punishes a kiter', () => {
    const t = createTargeting({ leash: 10, kiteT: 3, swapEvery: 5 });
    const a = H(2, 0), b = H(6, 0);
    expect(t.update(0.1, { x: 0, z: 0 }, [a, b])).toBe(a);
    for (let i = 0; i < 50; i++) t.update(0.1, { x: 0, z: 0 }, [a, b]);
    expect(t.target).toBe(b); // swapped after 5 s: both players matter
    // One player kites far away: after kiteT the boss punishes him and turns to the one in reach.
    const kiter = H(40, 0), near = H(3, 0);
    const k = createTargeting({ leash: 10, kiteT: 3, swapEvery: 99 });
    k.update(0.1, { x: 30, z: 0 }, [kiter, near]);
    for (let i = 0; i < 40; i++) k.update(0.1, { x: 0, z: 0 }, [kiter, near]);
    expect(k.punish).toBe(kiter);
    expect(k.target).toBe(near);
    // Alone and kiting: still punished (shot at), never ignored.
    const solo = createTargeting({ leash: 10, kiteT: 2 });
    const runner = H(30, 0);
    for (let i = 0; i < 30; i++) solo.update(0.1, { x: 0, z: 0 }, [runner]);
    expect(solo.punish).toBe(runner);
  });
});

describe('fight builder', () => {
  it('is deterministic, budgeted and pins the lead role', () => {
    const def = { site: { x: 0, y: 0, z: 0 }, gang: 'penguin', waves: [{ budget: 6, lead: 'shield' }, [{ type: 'brute', dx: 0, dz: 3 }]] };
    const a = buildFight('f', def, { difficulty: 'normal', act: 2 });
    expect(buildFight('f', def, { difficulty: 'normal', act: 2 })).toEqual(a);
    expect(a.waves[0].some((e) => e.type === 'shield')).toBe(true);
    expect(a.waves[1]).toEqual([{ type: 'brute', dx: 0, dz: 3 }]);
    expect(placeRing(4, { ring: 5 })).toHaveLength(4);
    const hard = buildFight('f', { ...def, waves: [{ budget: 8 }] }, { difficulty: 'knightmare', act: 3 });
    expect(hard.waves[0].filter((e) => e.type !== 'grunt').length).toBeGreaterThan(0);
  });
});

describe('the Night One pacing pass (before -> after)', () => {
  it('has no stand-alone radio steps left and far fewer hard stops', () => {
    const r = pacingReport(STEPS);
    expect(r.radioSteps).toBe(0);
    // Measured on the story before the pass (scripts/pacing.mjs on f84225a's story.js):
    // 18 hard stops, 16 camera cuts, 286 s with no agency.
    expect(r.hardStops).toBeLessThanOrEqual(8);
    expect(r.cuts).toBeLessThanOrEqual(10);
    expect(r.noAgencySeconds).toBeLessThan(120);
  });
  it('every retired id is aliased to a step that still exists', () => {
    for (const [old, now] of Object.entries(ALIASES)) {
      expect(STEPS.some((s) => s.id === old), old).toBe(false);
      expect(STEPS.some((s) => s.id === now), now).toBe(true);
    }
  });
});
