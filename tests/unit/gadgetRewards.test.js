// [fix1] Which gadgets a fresh normal save holds after Night One and after each later night. The
// new gadgets come only from the campaign's rewards (storyReward 'gadget:x' -> campaignReward
// 'gadget.x', src/progress/storyRewards.js); Night One's credits hand out the original eight and
// nothing else (they used to hand out all ten new ones through the "finished" fallback).
import { describe, it, expect } from 'vitest';
import '../../src/story/nights/index.js';
import { nightOrder, nightById, stepsOf, REWARD_EVENT } from '../../src/story/campaign.js';
import { STEPS } from '../../src/game/story.js';
import { GADGET_IDS, NEW_GADGET_IDS, unlockedIds, unlockedNewIds, rewardGadgetId } from '../../src/gadgets/gadgetDefs.js';
import { campaignRewardFor, bridgeStoryRewards, STORY_GEAR_REWARDS } from '../../src/progress/storyRewards.js';
import { createEvents } from '../../src/core/events.js';
import { sanitizeProgress } from '../../src/core/save.js';
import '../../src/gadgets/gadgetSave.js';
import '../../src/story/campaignSave.js';

// Every reward id a night pays when played start to end (storyRuntime: mission rewards, step
// `reward`, optional rewards, nightEnd `rewards`).
function nightRewards(id) {
  const night = nightById(id);
  const out = [];
  for (const m of night.missions ?? []) out.push(...(m.rewards ?? []));
  for (const s of stepsOf(night)) {
    if (s.reward) out.push(s.reward);
    out.push(...(s.rewards ?? []));
    for (const o of s.optional ?? []) if (o.reward) out.push(o.reward);
  }
  return out;
}

// What the gadget system unlocks for a save: the story's eight by step, plus the new ones paid.
const owned = (p) => [...unlockedIds(p, STEPS, p.gadgets.unlocked), ...unlockedNewIds(p, p.gadgets.unlocked)].sort();

// A fresh save played to Night One's credits, the way flow.js leaves it.
function afterNightOne() {
  const p = sanitizeProgress({});
  const credits = STEPS.findIndex((s) => s.type === 'credits');
  return { ...p, step: credits, stepId: STEPS[credits].id, finished: true, campaign: { ...p.campaign, nightsDone: ['n1'] } };
}

// One schedule, agreed at integration between the onboarding work (which teaches each gadget in
// the mission that grants it) and the reward wiring: two gadgets a night from Night Two to Six.
const EXPECTED = {
  n2: ['sonic', 'disruptor'],
  n3: ['tracker', 'hack'],
  n4: ['glue', 'bolas'],
  n5: ['shock', 'emp'],
  n6: ['decoy', 'drone'],
};

describe('[fix1] campaign gadget rewards', () => {
  it('every gadget reward in the nights names a real gadget', () => {
    for (const id of nightOrder()) {
      for (const r of nightRewards(id).filter((x) => x.startsWith('gadget:') && !STORY_GEAR_REWARDS.includes(x.slice(7)))) expect(rewardGadgetId(r), `${id} ${r}`).not.toBe(null);
    }
  });

  it('each new gadget is paid by exactly one later night, never by Night One', () => {
    const by = {};
    for (const id of nightOrder()) {
      for (const g of new Set(nightRewards(id).map(rewardGadgetId).filter(Boolean))) (by[g] ??= []).push(id);
    }
    for (const g of NEW_GADGET_IDS) {
      expect(by[g], g).toHaveLength(1);
      expect(by[g][0], g).not.toBe('n1');
    }
  });

  it('a fresh save after Night One has the original eight only', () => {
    expect(owned(sanitizeProgress({}))).toEqual(['batarang']);
    expect(owned(afterNightOne())).toEqual([...GADGET_IDS].sort());
  });

  it('each later night adds its own gadgets, through the reward bridge', () => {
    const p = afterNightOne();
    const events = createEvents();
    bridgeStoryRewards(events);
    // The gadget system's campaignReward handler, reduced to its save write.
    events.on('campaignReward', ({ id }) => { const g = rewardGadgetId(id); if (g && !p.gadgets.unlocked.includes(g)) p.gadgets.unlocked.push(g); });
    let have = [...GADGET_IDS];
    for (const night of nightOrder().filter((n) => n !== 'n1')) {
      for (const r of nightRewards(night)) {
        if (p.campaign.rewards.includes(r)) continue;
        p.campaign.rewards.push(r);
        events.emit(REWARD_EVENT, { id: r, night });
      }
      have = [...have, ...(EXPECTED[night] ?? [])];
      expect(owned(p), `after ${night}`).toEqual([...have].sort());
      // The story's own record alone (a save whose sticky list was lost) gives the same set.
      expect(owned({ ...p, gadgets: { ...p.gadgets, unlocked: [] } }), `after ${night}, from campaign.rewards`).toEqual([...have].sort());
    }
    expect(have.sort()).toEqual([...GADGET_IDS, ...NEW_GADGET_IDS].sort());
  });

  it('maps story ids to progression ids', () => {
    expect(campaignRewardFor('gadget:disruptor')).toBe('gadget.disruptor');
    expect(campaignRewardFor('gadget:cryptographicSequencer')).toBe('gadget.hack');
    expect(campaignRewardFor('gadget:thermalCharge')).toBe('gadget.emp');
    expect(campaignRewardFor('gadget:nope')).toBe(null);
    expect(campaignRewardFor('suit:arctic')).toBe('suit.arctic');
    expect(campaignRewardFor('xp:150')).toBe(null);
    expect(campaignRewardFor('lore:penguinFile')).toBe(null);
  });
});
