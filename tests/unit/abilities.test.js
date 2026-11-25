// [onboard] The ability layer: data, derivation from old saves, modes, gates, the runtime's grants.
import { describe, it, expect } from 'vitest';
import { ABILITIES, ABILITY_IDS, START_KIT, PROMPT_ABILITY, abilityById } from '../../src/abilities/abilityDefs.js';
import { createAbilityState, deriveUnlocked, abilityModeFromParams, grantsForStep, sanitizeAbilitySave, ALL_ABILITIES } from '../../src/abilities/abilities.js';
import { createAbilities } from '../../src/abilities/runtime.js';
import { can } from '../../src/abilities/gate.js';
import { STEPS } from '../../src/game/story.js';
import { PROMPT_IDS } from '../../src/ui/prompts.js';
import { createEvents } from '../../src/core/events.js';
import { missionsOf } from '../../src/story/campaign.js';
import '../../src/story/nights/index.js';

const idx = (id) => STEPS.findIndex((s) => s.id === id);
const at = (id, extra = {}) => ({ step: idx(id), stepId: id, finished: false, ...extra });
const missions = (n) => missionsOf(n).map((m) => ({ id: m.id, steps: (m.steps ?? []).map((s) => s.id) }));

describe('ability data', () => {
  it('ids are unique and every grant points at something real', () => {
    expect(new Set(ABILITY_IDS).size).toBe(ABILITY_IDS.length);
    for (const a of ABILITIES) {
      const g = a.grant;
      if (g?.step) expect(idx(g.step), `${a.id} ${g.step}`).toBeGreaterThanOrEqual(0);
      if (g?.night && g.after) expect(missionsOf(g.night).some((m) => m.id === g.after), `${a.id} ${g.night}.${g.after}`).toBe(true);
      if (a.teach?.prompt) expect(PROMPT_IDS, a.id).toContain(a.teach.prompt);
    }
    for (const [p, id] of Object.entries(PROMPT_ABILITY)) { expect(PROMPT_IDS, p).toContain(p); expect(abilityById(id), id).toBeTruthy(); }
  });
  it('the starting kit is the bare minimum: no grapple, chains, specials, gadgets beyond the batarang', () => {
    expect(START_KIT).toEqual(expect.arrayContaining(['move', 'glide', 'punch', 'kick', 'counter']));
    for (const id of ['grapple', 'chainTakedown', 'specialTakedown', 'batSwarm', 'grappleBoost', 'wingsuit', 'battleMode', 'detective', 'batwing', 'fastTravel']) expect(START_KIT).not.toContain(id);
  });
  it('every Night One step that needs the grapple comes after the grapple beat', () => {
    const g = idx('toDocks');
    for (const id of ['toRoofAfterChase', 'toShip', 'toFactory', 'monarchBalcony']) expect(idx(id)).toBeGreaterThan(g);
  });
  it('no Night One step teaches a card for an ability it has not been given', () => {
    for (let i = 0; i < STEPS.length; i++) {
      const have = deriveUnlocked({ step: i, stepId: STEPS[i].id }, { steps: STEPS });
      for (const p of STEPS[i].tutorial ?? []) {
        const need = PROMPT_ABILITY[p];
        if (need) expect(have.has(need), `${STEPS[i].id} teaches ${p} before ${need}`).toBe(true);
      }
    }
  });
});

describe('deriveUnlocked (old saves)', () => {
  it('a brand-new save has the start kit only', () => {
    expect([...deriveUnlocked({ step: 0, stepId: 'intro' }, { steps: STEPS })].sort()).toEqual([...START_KIT].sort());
  });
  it('a save past a teaching beat has that ability', () => {
    expect(deriveUnlocked(at('toDocks'), { steps: STEPS }).has('grapple')).toBe(true);
    expect(deriveUnlocked(at('courierIntro'), { steps: STEPS }).has('grapple')).toBe(false);
    const mid = deriveUnlocked(at('aceBattle'), { steps: STEPS });
    for (const id of ['grapple', 'dodge', 'throw', 'capeStun', 'silentTakedown', 'detective', 'diveBomb', 'wallRun']) expect(mid.has(id), id).toBe(true);
    for (const id of ['beatdown', 'batwing', 'fastTravel', 'specialTakedown', 'chainTakedown']) expect(mid.has(id), id).toBe(false);
  });
  it('the step id wins over a stale index', () => {
    expect(deriveUnlocked({ step: 0, stepId: 'f2' }, { steps: STEPS }).has('dodge')).toBe(true);
  });
  it('an index-only save (no stepId) still derives', () => {
    expect(deriveUnlocked({ step: idx('n1') }, { steps: STEPS }).has('capeStun')).toBe(true);
  });
  it('a finished save has everything from Night One, nothing from Night Two until it starts', () => {
    const d = deriveUnlocked({ step: idx('credits'), stepId: 'credits', finished: true, campaign: { night: 'n1' } }, { steps: STEPS });
    for (const a of ABILITIES) if (a.grant?.step || a.grant === 'start') expect(d.has(a.id), a.id).toBe(true);
    expect(d.has('specialTakedown')).toBe(false);
  });
  it('a finished save opening Night Two has its start grant; missions done add theirs', () => {
    const base = { step: idx('credits'), stepId: 'credits', finished: true };
    expect(deriveUnlocked({ ...base, campaign: { night: 'n2', nightsDone: ['n1'] } }, { steps: STEPS }).has('specialTakedown')).toBe(true);
    const d = deriveUnlocked({ ...base, campaign: { night: 'n2', nightsDone: ['n1'], missionsDone: ['n2.m2Heist'] } }, { steps: STEPS });
    expect(d.has('grappleBoost')).toBe(true);
    expect(d.has('battleMode')).toBe(false);
  });
  it('a save in Night Four has everything from Nights Two and Three; Night Five brings the pull', () => {
    const d = deriveUnlocked({ step: idx('credits'), stepId: 'credits', finished: true, campaign: { night: 'n4', nightsDone: ['n1'] } }, { steps: STEPS });
    for (const id of ['specialTakedown', 'battleMode', 'grappleBoost', 'chainTakedown', 'reGrapple', 'wingsuit', 'batSwarm']) expect(d.has(id), id).toBe(true);
    expect(d.has('grapplePull')).toBe(false);
    const n9 = deriveUnlocked({ step: idx('credits'), stepId: 'credits', finished: true, campaign: { night: 'n9', nightsDone: ['n1'] } }, { steps: STEPS });
    for (const a of ABILITIES) if (!a.gadget && a.grant && a.grant !== 'start' && !a.grant.reward) expect(n9.has(a.id), a.id).toBe(true);
  });
  it('every beat the later nights lean on comes after the ability it needs', () => {
    // [step id that assumes it, ability, night]: from the story agent's hand-back.
    const need = [['droneRun', 'grappleBoost', 'n2'], ['toLoungeRoof', 'grappleBoost', 'n2'], ['elRun', 'reGrapple', 'n3'], ['n3Twist', 'wingsuit', 'n3'],
      ['n7Convoy', 'battleMode', 'n7'], ['n6Canopy', 'wingsuit', 'n6'], ['n8Up', 'grapple', 'n8']];
    for (const [stepId, ab, night] of need) {
      const ms = missions(night);
      const k = ms.findIndex((m) => m.steps.includes(stepId));
      expect(k, stepId).toBeGreaterThanOrEqual(0);
      const d = deriveUnlocked({ step: idx('credits'), stepId: 'credits', finished: true, campaign: { night, stepId, nightsDone: ['n1'] } }, { steps: STEPS, missionsOf: missions });
      expect(d.has(ab), `${stepId} needs ${ab}`).toBe(true);
    }
  });
  it('?night=n2&at=<a later step> counts the missions before that step as done', () => {
    const m = missions('n2');
    const late = m.find((x) => x.id === 'm2Undercroft').steps[0];
    const d = deriveUnlocked({ step: idx('credits'), stepId: 'credits', finished: true, campaign: { night: 'n2', stepId: late, nightsDone: ['n1'] } }, { steps: STEPS, missionsOf: missions });
    for (const id of ['battleMode', 'grappleBoost', 'chainTakedown']) expect(d.has(id), id).toBe(true);
  });
  it('ability rewards a night emitted count', () => {
    expect(deriveUnlocked({ campaign: { rewards: ['ability:batSwarm', 'xp:100'] } }, { steps: STEPS }).has('batSwarm')).toBe(true);
  });
  it('the persisted field sanitizes junk and old saves load with the default', () => {
    expect(sanitizeAbilitySave(undefined)).toEqual({ unlocked: [], practised: {} });
    expect(sanitizeAbilitySave({ unlocked: ['grapple', 'nope', 3], practised: { grapple: 2, bad: 1, dodge: -1 } })).toEqual({ unlocked: ['grapple'], practised: { grapple: 2 } });
  });
});

describe('modes and gates', () => {
  it('URL modes: explicit wins, sandboxes are all, everything else is the story', () => {
    expect(abilityModeFromParams('?abilities=none&god=1')).toBe('none');
    expect(abilityModeFromParams('?god=1')).toBe('all');
    expect(abilityModeFromParams('?fight=test')).toBe('all');
    expect(abilityModeFromParams('?at=f1')).toBe('story');
    expect(abilityModeFromParams('')).toBe('story');
    expect(abilityModeFromParams('?abilities=story&god=1')).toBe('story');
  });
  it('a hero with no ability state can do everything (tests, tools)', () => {
    expect(can({}, 'grapple')).toBe(true);
    expect(can(null, 'chainTakedown')).toBe(true);
    expect(can({ abilities: ALL_ABILITIES }, 'batSwarm')).toBe(true);
  });
  it('story state gates; none keeps bare movement; kit-only ids pass', () => {
    const s = createAbilityState({ unlocked: START_KIT });
    const hero = { abilities: s };
    expect(can(hero, 'punch')).toBe(true);
    expect(can(hero, 'grapple')).toBe(false);
    expect(can(hero, 'airFlip')).toBe(true);
    expect(s.unlock(['grapple', 'grapple', 'bogus'])).toEqual(['grapple']);
    expect(can(hero, 'grapple')).toBe(true);
    s.mode = 'none';
    expect(can(hero, 'punch')).toBe(false);
    expect(can(hero, 'move')).toBe(true);
  });
  it('snapshot/apply replicates the host gates to a guest', () => {
    const host = createAbilityState({ unlocked: [...START_KIT, 'grapple', 'dodge'] });
    const guest = createAbilityState({ unlocked: START_KIT });
    const seen = [];
    guest.onChange(({ ids }) => seen.push(...ids));
    guest.apply(JSON.parse(JSON.stringify(host.snapshot())));
    expect(guest.has('grapple') && guest.has('dodge')).toBe(true);
    expect(seen).toEqual(expect.arrayContaining(['grapple', 'dodge']));
  });
  it('gadgets are asked of the gadget system', () => {
    const s = createAbilityState();
    s.setGadgetSource((g) => g === 'batarang');
    expect(s.has('gadget.batarang')).toBe(true);
    expect(s.has('gadget.gel')).toBe(false);
  });
});

describe('runtime grants and teaching beats', () => {
  const make = (progress = { step: 0, stepId: 'intro' }, params = '', settings = {}) => {
    const events = createEvents();
    const said = [], shown = [], done = [], chips = [];
    const rt = createAbilities({
      events, progress, steps: STEPS, params: new URLSearchParams(params), settings,
      radio: { say: (l) => said.push(...l) }, prompts: { show: (ids) => shown.push(...ids), done: (id) => done.push(id) },
      hud: { chip: (id, text, kind) => chips.push({ id, kind }) }, missionsOf: missions,
    });
    return { events, rt, said, shown, done, chips, progress };
  };
  it('a step grants and teaches its ability; doing it twice takes the card down', () => {
    const t = make();
    expect(t.rt.has('grapple')).toBe(false);
    t.events.emit('step', { step: STEPS[idx('toDocks')], index: idx('toDocks') });
    expect(t.rt.has('grapple')).toBe(true);
    expect(t.shown).toContain('grapple');
    expect(t.said.length).toBeGreaterThan(0);
    expect(t.chips.some((c) => c.kind === 'ability')).toBe(true);
    t.events.emit('grapple');
    expect(t.chips.some((c) => c.kind === 'practised')).toBe(true);
    expect(t.done).not.toContain('grapple');
    t.events.emit('grapple');
    expect(t.done).toContain('grapple');
    expect(t.progress.abilities.unlocked).toContain('grapple');
  });
  it('a jump (?at=, a guest joining) gets every earlier grant, teaching only its own', () => {
    const t = make();
    t.events.emit('step', { step: STEPS[idx('n1')], index: idx('n1') });
    for (const id of ['grapple', 'dodge', 'throw', 'diveBomb', 'wallRun', 'capeStun']) expect(t.rt.has(id), id).toBe(true);
    expect(t.shown).toEqual(['cape']);
  });
  it('skip tutorials keeps the gates but drops the lines and cards', () => {
    const t = make(undefined, '', { access: { tutorials: 'skip' } });
    t.events.emit('step', { step: STEPS[idx('toDocks')], index: idx('toDocks') });
    expect(t.rt.has('grapple')).toBe(true);
    expect(t.said).toEqual([]);
    expect(t.shown).toEqual([]);
  });
  it('campaign events grant the later abilities', () => {
    const t = make({ step: idx('credits'), stepId: 'credits', finished: true });
    t.events.emit('nightStart', { night: 'n2' });
    expect(t.rt.has('specialTakedown')).toBe(true);
    t.events.emit('missionComplete', { night: 'n2', mission: 'm2Smugglers' });
    expect(t.rt.has('chainTakedown')).toBe(true);
    t.events.emit('missionComplete', { night: 'n2', mission: 'm2Heist', replay: true });
    expect(t.rt.has('battleMode')).toBe(false);
    t.events.emit('storyReward', { id: 'ability:batSwarm' });
    expect(t.rt.has('batSwarm')).toBe(true);
  });
  it('sandbox params open everything; ?moves=all opens traversal', () => {
    expect(make(undefined, '?god=1').rt.has('chainTakedown')).toBe(true);
    const m = make(undefined, '?moves=all');
    expect(m.rt.has('grappleBoost') && m.rt.has('wingsuit')).toBe(true);
    expect(m.rt.has('chainTakedown')).toBe(false);
  });
  it('grants are logged in order (the playthrough asserts it)', () => {
    const t = make();
    for (const id of ['toDocks', 'boardBatmobile', 'f2']) t.events.emit('step', { step: STEPS[idx(id)], index: idx(id) });
    expect(t.rt.log.slice(0, 3)).toEqual(['grapple', 'zipline', 'batmobile']);
    expect(grantsForStep('f2')).toEqual(['dodge', 'throw', 'moveStrikes']);
  });
});

describe('scripted locks (Night Eight)', () => {
  it('a step with locks switches them off with a standing note; the next step gives them back', () => {
    const events = createEvents();
    const notes = [];
    const rt = createAbilities({ events, progress: { step: idx('credits'), stepId: 'credits', finished: true }, steps: STEPS, params: new URLSearchParams('?god=1'), hud: { setLocks: (t) => notes.push(t) } });
    const n8 = missions('n8').flatMap((m) => m.steps);
    expect(n8).toContain('n8NoGrapple');
    events.emit('step', { step: { id: 'n8Dark', locks: ['detective'], lockText: 'A jammer.' } });
    expect(rt.has('detective')).toBe(false);
    expect(rt.has('grapple')).toBe(true);
    events.emit('step', { step: { id: 'n8NoGrapple', locks: ['grapple', 'gadgets'], lockText: 'No grapple.' } });
    expect(rt.has('detective')).toBe(true);
    expect(rt.has('grapple') || rt.has('grappleBoost') || rt.has('gadgets') || rt.has('gadget.batarang')).toBe(false);
    expect(rt.snapshot().suspended).toContain('grapple');
    events.emit('step', { step: { id: 'n8Up' } });
    expect(rt.has('grapple') && rt.has('gadgets')).toBe(true);
    expect(notes).toEqual(['A jammer.', 'No grapple.', null]);
  });
  it('the night data names the locks the layer knows', async () => {
    const { LOCK_GROUPS } = await import('../../src/abilities/abilityDefs.js');
    const { nightById } = await import('../../src/story/campaign.js');
    for (const m of nightById('n8').missions) for (const st of m.steps) for (const g of st.locks ?? []) expect(Object.keys(LOCK_GROUPS), `${st.id} ${g}`).toContain(g);
  });
});
