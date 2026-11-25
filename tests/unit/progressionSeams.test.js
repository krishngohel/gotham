// [verify] Progression seams: the story's XP and gear reaching wayneTech, Bruce's tiredness factor
// (staminaRegenK) slowing recovery, and the skill tree saying when a node's ability arrives.
import { describe, it, expect, vi } from 'vitest';
import '../../src/story/nights/index.js';
import { createEvents } from '../../src/core/events.js';
import { sanitizeProgress } from '../../src/core/save.js';
import { upgradeEffects } from '../../src/progress/upgrades.js';
import { createWayneTech, staminaRegenScale } from '../../src/progress/wayneTech.js';
import { bridgeStoryRewards } from '../../src/progress/storyRewards.js';
import { regenStamina } from '../../src/heroes/traversal.js';
import { NODE_ABILITY, arrivalOf, withArrivals } from '../../src/abilities/arrival.js';
import { nodeById } from '../../src/progress/skillTree.js';
import { abilityById } from '../../src/abilities/abilityDefs.js';
import '../../src/story/campaignSave.js';

function setup() {
  const events = createEvents();
  const progress = sanitizeProgress({});
  const hero = { health: 50, maxHealth: 100, dead: false, invulnerable: 0 };
  const combat = { combo: { value: 0 }, active: false, applyEffects: vi.fn() };
  const effects = upgradeEffects(progress.wayne.owned);
  const w = createWayneTech({ events, progress, save: vi.fn(), hero, combat, hud: { setHealth() {}, card() {} }, effects, baseHealth: () => 100 });
  bridgeStoryRewards(events, { getProgress: () => progress });
  return { events, progress, hero, effects, w };
}

describe('[verify] story rewards reach wayneTech', () => {
  it("a night's 'xp:N' and an optional objective's xpGain land on the XP bar", () => {
    const { events, w } = setup();
    events.emit('storyReward', { id: 'xp:150', night: 'n2' });
    expect(w.xp).toBe(150);
    events.emit('xpGain', { amount: 60, reason: 'n2Belfry' });
    expect(w.xp).toBe(210);
    events.emit('storyReward', { id: 'xp:99999', night: 'side' });
    expect(w.xp).toBe(5210); // capped at 5,000 a reward
  });

  it("'skill:' pays one free point, once per save", () => {
    const { events, w } = setup();
    events.emit('storyReward', { id: 'skill:readTheRoom' });
    events.emit('storyReward', { id: 'skill:readTheRoom' });
    expect(w.bonusPoints).toBe(1);
  });

  it('story gear changes the live effects as it arrives', () => {
    const { events, effects } = setup();
    expect(effects.coldMult).toBe(1);
    events.emit('storyReward', { id: 'upgrade:thermalLining' });
    expect(effects.coldMult).toBeCloseTo(0.85);
  });
});

describe("[verify] Bruce's staminaRegenK is read", () => {
  it('staminaRegenScale clamps and defaults', () => {
    expect(staminaRegenScale({})).toBe(1);
    expect(staminaRegenScale(null)).toBe(1);
    expect(staminaRegenScale({ staminaRegenK: 0.55 })).toBe(0.55);
    expect(staminaRegenScale({ staminaRegenK: 0 })).toBe(0.25);
    expect(staminaRegenScale({ staminaRegenK: 3 })).toBe(1);
  });

  it('a tired hero regains health more slowly between fights', () => {
    const rested = setup(), tired = setup();
    tired.hero.staminaRegenK = 0.55;
    for (const s of [rested, tired]) for (let i = 0; i < 100; i++) s.w.update(0.1);
    expect(rested.hero.health).toBeGreaterThan(tired.hero.health);
    expect(tired.hero.health).toBeGreaterThan(50);
  });

  it('flight stamina comes back more slowly too', () => {
    const f = { stamina: 12, regen: 3 };
    expect(regenStamina(f, 0, 1, true)).toBe(3);
    expect(regenStamina(f, 0, 1, true, 0.5)).toBe(1.5);
    expect(regenStamina(f, 0, 1, true, NaN)).toBe(3);
  });
});

describe('[verify] skill nodes say when their ability arrives', () => {
  it('every mapped node and ability is real', () => {
    for (const [node, ab] of Object.entries(NODE_ABILITY)) {
      expect(nodeById(node), node).toBeTruthy();
      expect(abilityById(ab), ab).toBeTruthy();
      expect(arrivalOf(ab)?.text, ab).toMatch(/^(Arrives|From the start)/);
    }
  });

  it('reads the story: Night One steps, campaign nights and missions, gadget rewards', () => {
    expect(arrivalOf('grapple')).toMatchObject({ night: 'n1', text: 'Arrives in Night One' });
    expect(arrivalOf('batSwarm')).toMatchObject({ night: 'n4', text: 'Arrives in Night 4' });
    expect(arrivalOf('wingsuit')).toMatchObject({ night: 'n3', mission: 'm3El', text: 'Arrives in Night 3, after Express Service' });
    expect(arrivalOf('gadget.disruptor')).toMatchObject({ night: 'n2', mission: 'm2Undercroft' });
    expect(arrivalOf('gadget.hack').night).toBe('n3');
    expect(arrivalOf('gadget.claw').text).toBe('Arrives in Night One');
    expect(arrivalOf('gadget.flashbang').text).toBe('Arrives after Night One');
    expect(arrivalOf('nope')).toBe(null);
    expect(arrivalOf('batSwarm', { nights: [] }).text).toBe('Arrives later in the story');
  });

  it('withArrivals marks only unbuilt nodes whose ability is missing', () => {
    const tree = { level: 3, branches: [{ id: 'traversal', nodes: [
      { id: 'wingsuit1', state: 'buyable' }, { id: 'wingsuit2', state: 'owned' }, { id: 'grip', state: 'buyable' }, { id: 'aero', state: 'buyable' },
    ] }] };
    const out = withArrivals(tree, (id) => id === 'wallRun');
    const by = Object.fromEntries(out.branches[0].nodes.map((n) => [n.id, n.arrives]));
    expect(by).toEqual({ wingsuit1: 'Arrives in Night 3, after Express Service', wingsuit2: undefined, grip: undefined, aero: undefined });
    expect(tree.branches[0].nodes[0].arrives).toBeUndefined(); // the input is not touched
    expect(withArrivals(tree, null)).toBe(tree);
  });
});

describe('[verify] skill effects that had no reader', () => {
  it('fearGain (Dread) scales what scares a squad, not what steadies it', async () => {
    const { createFear } = await import('../../src/enemies/fear.js');
    const a = createFear({}), b = createFear({ gain: () => 1.5 });
    for (const f of [a, b]) { f.join('g1'); f.note('silentTakedown', { id: 'g1' }); }
    expect(b.squad).toBeCloseTo(a.squad * 1.5);
    expect(b.fearOf('g1')).toBeGreaterThan(a.fearOf('g1'));
    const c = createFear({}), d = createFear({ gain: () => 1.5 });
    for (const f of [c, d]) { f.join('g1'); f.note('silentTakedown', { id: 'g1' }); f.note('reinforcements'); }
    expect(d.squad - b.squad).toBeCloseTo(c.squad - a.squad); // the drop is not scaled
    expect(createFear({ gain: () => NaN }).squad).toBe(0);
  });

  it("suspicionMult (Alfred's Alibis) and fatigueRecovery (Night Nurse) reach the double life", async () => {
    const { createDoubleLife, applyEffects, setLifeModifiers, sleep } = await import('../../src/bruce/doubleLife.js');
    const plain = createDoubleLife({ fatigue: 80 });
    applyEffects(plain, { suspicion: { reporter: 10, detective: -2 } });
    sleep(plain, 4);
    const mods = { suspicionMult: 0.8, fatigueRecovery: 1.5 };
    const off = setLifeModifiers(() => mods);
    const tuned = createDoubleLife({ fatigue: 80 });
    applyEffects(tuned, { suspicion: { reporter: 10, detective: -2 } });
    sleep(tuned, 4);
    off();
    expect(tuned.suspicion.reporter - 5).toBeCloseTo((plain.suspicion.reporter - 5) * 0.8);
    expect(tuned.suspicion.detective).toBe(plain.suspicion.detective); // a fall is not scaled
    expect(80 - tuned.fatigue).toBeCloseTo((80 - plain.fatigue) * 1.5);
    // Rises in fatigue are not scaled; no provider means no change.
    const again = createDoubleLife({ fatigue: 20 });
    applyEffects(again, { fatigue: 10 });
    expect(again.fatigue).toBe(30);
  });
});
