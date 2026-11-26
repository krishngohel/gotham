import { describe, it, expect } from 'vitest';
import '../../src/gadgets/gadgetSave.js'; // registers progress.gadgets, as game.js does before loading
import { STEPS, tutorialFor, CATCH_UP } from '../../src/game/story.js';
import { PROMPT_IDS } from '../../src/ui/prompts.js';
import { resolveStep, migrateProgress, legacyStepId, LEGACY_STEP_IDS, RETIRED } from '../../src/game/storyMigrate.js';
import { readFileSync } from 'node:fs';
import { sanitizeProgress, loadProgress, saveProgress, newGameProgress, registerProgressField } from '../../src/core/save.js';
import { GADGETS, isUnlocked } from '../../src/gadgets/gadgetDefs.js';
import { tracker } from '../../src/game/progressTracker.js';

const idx = (id) => STEPS.findIndex((s) => s.id === id);
const KEY = 'gotham-progress-v1';
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
// What the game does on start: read localStorage, then place the save on the story.
const loadRaw = (raw) => migrateProgress(loadProgress(memStorage({ [KEY]: JSON.stringify(raw) })));

// A save's place in the story comes from its own stepId; an id that no longer exists (say after
// some future step is renamed) starts over at the top. The numeric index is never read against the
// current step list. [m1] A save with only an index is read against the original game's frozen
// list (LEGACY_STEP_IDS): see the index-only block below.
describe('resolveStep: stepId first, never the index against the current list', () => {
  it('uses the saved step id when there is one', () => {
    expect(resolveStep({ step: 3, stepId: 'rig' })).toBe(idx('rig'));
    expect(resolveStep({ step: 0, stepId: 'aceCatwalks' })).toBe(idx('aceCatwalks'));
  });
  it('an id that no longer exists starts over, whatever the numeric step says', () => {
    expect(resolveStep({ step: 17, stepId: 'gone' })).toBe(0);
    expect(resolveStep({ step: 999, stepId: 'gone' })).toBe(0);
  });
  it('a save on a retired step lands on the step that replaced it', () => {
    expect(resolveStep({ stepId: 'armadaRun' })).toBe(idx('nightwingTagRadio'));
  });
  it('no id and no index starts over', () => {
    expect(resolveStep({})).toBe(0);
    expect(resolveStep({ step: 0 })).toBe(0);
    expect(resolveStep({ step: -3 })).toBe(0);
    expect(resolveStep({ step: 2.5 })).toBe(0);
  });
  it('stepId is a saved field that survives sanitizing and rejects junk', () => {
    expect(sanitizeProgress({ stepId: 'rig' }).stepId).toBe('rig');
    expect(sanitizeProgress({ stepId: 42 }).stepId).toBe(null);
    expect(sanitizeProgress({ stepId: '<script>' }).stepId).toBe(null);
    expect(sanitizeProgress({}).stepId).toBe(null);
  });
});

describe('migrateProgress under the new key', () => {
  it('a fresh save starts at the intro', () => {
    expect(loadRaw({})).toMatchObject({ step: 0, stepId: 'intro' });
    expect(migrateProgress(loadProgress(memStorage()))).toMatchObject({ step: 0, stepId: 'intro' });
  });
  it('a save mid-story resumes on the same step id, and stays stable across save and reload', () => {
    for (const id of ['toDocks', 'rig', 'monarchBalcony', 'aceCatwalks', 'antidote', 'boss', 'credits']) {
      const once = loadRaw({ stepId: id, trophies: [1] });
      expect(once, id).toMatchObject({ step: idx(id), stepId: id });
      const storage = memStorage();
      saveProgress(storage, once);
      expect(migrateProgress(loadProgress(storage)), id).toEqual(once);
    }
  });
  it('a finished save stays finished with everything it found', () => {
    const raw = {
      stepId: 'credits', finished: true, seenIntro: true, suit: 'gold', goldUnlocked: true,
      trophies: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], unlocks: ['goldStandard', 'commendation'], moves: ['ladder'],
      districts: ['docks'], milestone: 100, challenges: { rooftop: { best: 12, medal: 'gold' } },
      gadgets: { equipped: 'gel', unlocked: ['remote', 'gel'], broken: [], caches: [] },
    };
    const p = loadRaw(raw);
    expect(p).toMatchObject({
      step: idx('credits'), stepId: 'credits', finished: true, seenIntro: true, suit: 'gold', goldUnlocked: true,
      trophies: raw.trophies, unlocks: raw.unlocks, milestone: 100, challenges: raw.challenges,
    });
    expect(p.gadgets.unlocked).toEqual(['remote', 'gel']);
    expect(tracker.categories.find((c) => c.id === 'story').count(p)).toEqual({ done: STEPS.length - 1, total: STEPS.length - 1 });
    for (const g of GADGETS) expect(isUnlocked(g, p, STEPS), g.id).toBe(true);
  });
  it('a save past the end (objectives done) stays past the end', () => {
    expect(loadRaw({ stepId: 'gone', finished: true, step: STEPS.length })).toMatchObject({ step: 0, stepId: 'intro', finished: true });
  });
  it('newGameProgress clears the step id, keeping what was found, and resets cleanly into the new game', () => {
    const done = loadRaw({
      stepId: 'credits', finished: true, trophies: [0, 5],
      gadgets: { equipped: 'gel', unlocked: ['remote', 'gel'], broken: [], caches: [] },
    });
    expect(done.stepId).toBe('credits');
    const fresh = newGameProgress(done);
    expect(fresh).toMatchObject({ step: 0, stepId: null, finished: false, suit: null, trophies: [0, 5] });
    expect(fresh.gadgets.unlocked).toEqual(['remote', 'gel']);
    expect(migrateProgress(fresh)).toMatchObject({ step: 0, stepId: 'intro' });
    const storage = memStorage();
    saveProgress(storage, fresh);
    expect(migrateProgress(loadProgress(storage))).toMatchObject({ step: 0, stepId: 'intro', finished: false });
  });
  it('a registered field with no fresh value survives a new game, one with a fresh value resets', () => {
    const undoKeep = registerProgressField('testKeep', { sanitize: (v) => (typeof v === 'number' ? v : 0) });
    const undoReset = registerProgressField('testReset', { sanitize: (v) => (typeof v === 'number' ? v : 0), fresh: 7 });
    try {
      expect(newGameProgress({ testKeep: 3, testReset: 3 })).toMatchObject({ testKeep: 3, testReset: 7 });
    } finally { undoKeep(); undoReset(); }
    expect(newGameProgress({ testReset: 3 })).not.toHaveProperty('testReset');
  });
  it('malformed saves fall back safely to the intro', () => {
    for (const stepId of [undefined, null, -1, 1.5, NaN, 17, true, [], {}, '<script>']) {
      expect(loadRaw({ stepId }), String(stepId)).toMatchObject({ step: 0, stepId: 'intro' });
    }
    expect(migrateProgress(loadProgress(memStorage({ [KEY]: '{not json' })))).toMatchObject({ step: 0, stepId: 'intro' });
    expect(resolveStep({})).toBe(0);
  });
  it('the old v1 key is never read: a save there has no effect on a v2 load', () => {
    const storage = memStorage({ 'gotham-old-progress-v0': JSON.stringify({ step: 25, stepId: 'antidote', finished: true }) });
    expect(migrateProgress(loadProgress(storage))).toMatchObject({ step: 0, stepId: 'intro', finished: false });
  });
});

describe('tutorialFor and CATCH_UP', () => {
  it('the catwalks teach the basics first to a save that skipped the balcony', () => {
    const cat = STEPS[idx('aceCatwalks')];
    expect(tutorialFor(cat, [])).toEqual(['crouch', 'silent', 'perch', 'perchDrop', 'distract', 'vent', 'ledgeStealth']);
    expect(tutorialFor(cat, ['perchDrop'])).toEqual(['crouch', 'silent', 'distract', 'vent', 'ledgeStealth']);
    expect(tutorialFor(cat, ['silentTakedown'])).toEqual(['perch', 'perchDrop', 'distract', 'vent', 'ledgeStealth']);
    expect(tutorialFor(cat, ['silentTakedown', 'perchDrop', 'ladder'])).toEqual(['distract', 'vent', 'ledgeStealth']);
    expect(tutorialFor(STEPS[idx('monarchBalcony')], [])).toEqual(['crouch', 'silent', 'perch', 'perchDrop']);
    expect(tutorialFor(STEPS[idx('boss')], [])).toBe(null);
    for (const tips of Object.values(CATCH_UP)) for (const c of tips) for (const id of c.tips) expect(PROMPT_IDS).toContain(id);
  });
});

// [m1] Night One grew by four missions, so every index moved. Saves resolve by step id; a save with
// only an index (the original game wrote the index alone) is read against that game's frozen list.
describe('index-only saves (the original game) after steps were inserted', () => {
  const fixture = (name) => JSON.parse(readFileSync(new URL(`../../docs/verification/saves/${name}.json`, import.meta.url), 'utf8')).progress;
  const indexOnly = (p) => { const q = { ...p }; delete q.stepId; return q; };
  it('the frozen list is the pre-overhaul story: 62 steps, the three real saves sit where they say', () => {
    expect(LEGACY_STEP_IDS).toHaveLength(62);
    expect(Object.isFrozen(LEGACY_STEP_IDS)).toBe(true);
    for (const name of ['early', 'mid', 'finished']) { const p = fixture(name); expect(LEGACY_STEP_IDS[p.step], name).toBe(p.stepId); }
  });
  it('every legacy id still resolves to a step of the story (itself, or the step that absorbed it)', () => {
    for (const id of LEGACY_STEP_IDS) expect(STEPS.some((s) => s.id === (RETIRED[id] ?? id)), id).toBe(true);
  });
  it('the three real pre-overhaul saves resume on their own step, with or without a step id', () => {
    for (const [name, id] of [['early', 'toYard'], ['mid', 'toAce'], ['finished', 'credits']]) {
      const p = fixture(name);
      expect(loadRaw(p), name).toMatchObject({ step: idx(id), stepId: id, finished: p.finished });
      expect(loadRaw(indexOnly(p)), `${name} index only`).toMatchObject({ step: idx(id), stepId: id, finished: p.finished });
      // The index alone would now land somewhere else: that is what the migration is for.
      if (name !== 'early') expect(STEPS[p.step]?.id, name).not.toBe(id);
    }
  });
  it('an index means the legacy step at that place, then resolves like any id', () => {
    for (let i = 1; i < LEGACY_STEP_IDS.length; i++) {
      const id = LEGACY_STEP_IDS[i];
      expect(legacyStepId({ step: i })).toBe(id);
      expect(resolveStep({ step: i }), id).toBe(idx(RETIRED[id] ?? id));
    }
    expect(resolveStep({ step: 3 })).toBe(idx('courierIntro')); // gordonRadio, folded into the courier chase
    expect(resolveStep({ step: 57 })).toBe(idx('toTower')); // rescueGuestsRadio
    expect(resolveStep({ step: 999 })).toBe(idx('credits')); // past the end: the credits
  });
  it('a saved id always wins over the index, and a migrated save is stable on reload', () => {
    expect(legacyStepId({ step: 12, stepId: 'rig' })).toBe(null);
    expect(resolveStep({ step: 12, stepId: 'rig' })).toBe(idx('rig'));
    const once = loadRaw({ step: 30 });
    expect(once).toMatchObject({ step: idx('toAce'), stepId: 'toAce' });
    const storage = memStorage();
    saveProgress(storage, once);
    expect(migrateProgress(loadProgress(storage))).toEqual(once);
  });
  it('an index-only save never lands inside a mission that did not exist when it was written', () => {
    const added = new Set(STEPS.filter((s) => /^m1(Short|Booth|Encore|Clocks)$/.test(s.mission)).map((s) => s.id));
    expect(added.size).toBeGreaterThan(15);
    for (let i = 0; i < LEGACY_STEP_IDS.length + 5; i++) expect(added.has(STEPS[resolveStep({ step: i })].id), String(i)).toBe(false);
  });
});
