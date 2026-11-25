// [verify] Every reward id the content emits lands somewhere real. The nights (src/story/nights),
// the open world (cases, chains, collectibles, crimes), the bosses and the wanted system emit
// `storyReward { id: 'kind:name' }`; src/progress/storyRewards.js storyRewardTarget says where each
// goes, and this walks all of them and checks the target exists (a real gadget, a wearable suit,
// a real skill node, a stored gear or lore entry, a real ability). Also: the bridge's bus events,
// the story XP reaching wayneTech, gear on the effects, the saved field and an old save.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import '../../src/story/nights/index.js';
import { nightOrder, nightById, missionsOf, stepsOf, isRewardId, REWARD_KINDS } from '../../src/story/campaign.js';
import { CASES } from '../../src/openworld/cases/data.js';
import { ALL_MISSIONS } from '../../src/openworld/chains/data.js';
import { ALL_GADGET_IDS, rewardGadgetId } from '../../src/gadgets/gadgetDefs.js';
import { isSuitId } from '../../src/heroes/models/suits.js';
import { wardrobeEntry, isSuitUnlocked } from '../../src/progress/suitData.js';
import { nodeById } from '../../src/progress/skillTree.js';
import { abilityById } from '../../src/abilities/abilityDefs.js';
import { storyRewardTarget, campaignRewardFor, bridgeStoryRewards, STORY_SUIT_ALIASES, STORY_GEAR_REWARDS } from '../../src/progress/storyRewards.js';
import {
  STORY_GEAR, LORE, gearById, loreById, STORY_SKILL_REWARDS, sanitizeStoryLocker, ownedGear, ownedLore, gearOps,
  gearListHtml, archiveHtml,
} from '../../src/progress/storyLocker.js';
import { BASE_EFFECTS, upgradeEffects } from '../../src/progress/upgrades.js';
import { createEvents } from '../../src/core/events.js';
import { sanitizeProgress, loadProgress, newGameProgress } from '../../src/core/save.js';
import '../../src/story/campaignSave.js';
import '../../src/openworld/save.js';
import { batcomputerTabs } from '../../src/bruce/registry.js';

// ---- every reward id in the data
function nightRewards(night) {
  const out = [];
  for (const m of missionsOf(night)) out.push(...(m.rewards ?? []));
  for (const s of stepsOf(night)) {
    if (s.reward) out.push(s.reward);
    out.push(...(s.rewards ?? []));
    for (const o of s.optional ?? []) if (o.reward) out.push(o.reward);
  }
  return out;
}
const structured = () => [
  ...nightOrder().flatMap((id) => nightRewards(nightById(id)).map((r) => [`${id}`, r])),
  ...CASES.flatMap((c) => (c.reward ?? []).map((r) => [`case ${c.id}`, r])),
  ...ALL_MISSIONS.flatMap((m) => (m.reward ?? []).map((r) => [`chain ${m.id}`, r])),
];
// A text sweep of the content folders, so an id written outside those shapes (the collectibles'
// hard-coded payouts, a boss def, a wanted payout) is caught too.
const ROOTS = ['src/story', 'src/openworld', 'src/bosses', 'src/wanted'];
const LITERAL = new RegExp(`['"\`]((?:${REWARD_KINDS.join('|')}):[A-Za-z0-9_.-]+)['"\`]`, 'g');
function swept() {
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) walk(p);
      else if (p.endsWith('.js')) {
        fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
          if (line.trim().startsWith('//')) return;
          for (const m of line.matchAll(LITERAL)) out.push([`${p}:${i + 1}`, m[1]]);
        });
      }
    }
  };
  for (const r of ROOTS) walk(r);
  return out;
}

function resolves(id) {
  const t = storyRewardTarget(id);
  if (!t) return 'no target';
  if (t.kind === 'campaign') {
    if (t.id.startsWith('gadget.')) return ALL_GADGET_IDS.includes(rewardGadgetId(t.id)) ? null : 'not a gadget';
    if (t.id.startsWith('suit.')) {
      const s = t.id.slice(5);
      return wardrobeEntry(s) && isSuitId(s) && !wardrobeEntry(s).tailored ? null : `suit ${s} not wearable`;
    }
    return 'unknown campaign id';
  }
  if (t.kind === 'xp') return t.amount > 0 ? null : 'bad amount';
  if (t.kind === 'skillPoint') return nodeById(t.hint) ? null : `hint ${t.hint} not a node`;
  if (t.kind === 'gear') return gearById(t.id) ? null : 'no gear';
  if (t.kind === 'lore') return loreById(t.id) ? null : 'no lore';
  if (t.kind === 'ability') return abilityById(t.id) ? null : 'no ability';
  return 'unknown kind';
}

describe('[verify] every reward id lands somewhere real', () => {
  it('finds the reward ids (the walk is not empty)', () => {
    const all = structured();
    expect(all.length).toBeGreaterThan(100);
    expect(swept().length).toBeGreaterThan(20);
  });

  it('every structured reward id resolves to a real target', () => {
    for (const [where, id] of structured()) {
      expect(isRewardId(id), `${where} ${id}`).toBe(true);
      expect(resolves(id), `${where} ${id}`).toBe(null);
    }
  });

  it('every reward literal in the content folders resolves too', () => {
    const literals = swept().filter(([, id]) => !/^xp:[A-Za-z]$/.test(id)); // 'xp:N' in a comment-free doc string
    for (const [where, id] of literals) expect(resolves(id), `${where} ${id}`).toBe(null);
  });

  it('the questionMarkCowl, gardener and arkhamKnight suits are wearable looks; aliases name real suits', () => {
    expect(campaignRewardFor('suit:questionMarkCowl')).toBe('suit.question-mark');
    expect(campaignRewardFor('suit:gardener')).toBe('suit.gardener');
    expect(campaignRewardFor('suit:arkhamKnight')).toBe('suit.field-repair');
    for (const s of Object.values(STORY_SUIT_ALIASES)) expect(isSuitId(s), s).toBe(true);
    // A save the campaign already paid (before this mapping existed) has them open.
    const paid = { campaign: { rewards: ['suit:questionMarkCowl', 'suit:gardener', 'suit:arkhamKnight'] } };
    for (const s of ['question-mark', 'gardener', 'field-repair']) {
      expect(isSuitUnlocked(s, {}), s).toBe(false);
      expect(isSuitUnlocked(s, paid), s).toBe(true);
    }
  });

  it('data tables are consistent: gear, lore, skill hints', () => {
    expect(new Set(STORY_GEAR.map((g) => g.id)).size).toBe(STORY_GEAR.length);
    expect(new Set(LORE.map((e) => e.id)).size).toBe(LORE.length);
    for (const g of STORY_GEAR) {
      expect(storyRewardTarget(g.reward)).toEqual({ kind: 'gear', id: g.id });
      for (const [k, op, v] of g.ops) { expect(typeof BASE_EFFECTS[k], `${g.id} ${k}`).toBe('number'); expect(op).toBe('mul'); expect(v).toBeGreaterThan(0.8); }
      expect(g.text.length).toBeGreaterThan(10);
    }
    for (const e of LORE) { expect(e.title.length).toBeGreaterThan(3); expect(e.text.length).toBeGreaterThan(10); }
    for (const n of Object.values(STORY_SKILL_REWARDS)) expect(nodeById(n), n).toBeTruthy();
    expect(STORY_GEAR_REWARDS).toEqual(['sporeFilter']);
    // Typos stay unresolved.
    for (const bad of ['lore:nope', 'skill:nope', 'upgrade:nope', 'xp:-5', 'xp:abc', 'medal:gold', 'gadget:nope', 42, null]) expect(storyRewardTarget(bad), String(bad)).toBe(null);
  });
});

describe('[verify] the bridge pays every kind', () => {
  const run = (ids, progress = sanitizeProgress({})) => {
    const events = createEvents();
    const out = [], cards = [];
    let saves = 0;
    const off = bridgeStoryRewards(events, { getProgress: () => progress, save: () => { saves++; }, getHud: () => ({ card: (t) => cards.push(t) }) });
    events.on('campaignReward', (d) => out.push(d));
    for (const id of ids) events.emit('storyReward', { id, night: 'n4' });
    off();
    return { out, cards, saves, progress };
  };

  it('xp, skill, gear and lore reach the bus (and the save)', () => {
    const r = run(['xp:150', 'skill:fearResistance', 'upgrade:rebreatherFilters', 'gadget:sporeFilter', 'lore:hollowMen', 'gadget:disruptor', 'suit:gardener']);
    expect(r.out.map((d) => d.id)).toEqual(['xp', 'skillPoint', 'gear.rebreatherFilters', 'gear.sporeFilter', 'lore.hollowMen', 'gadget.disruptor', 'suit.gardener']);
    expect(r.out[0].amount).toBe(150);
    expect(r.out[1]).toMatchObject({ key: 'skill:fearResistance', hint: 'rebreather' });
    expect(r.progress.storyLocker).toEqual({ gear: ['rebreatherFilters', 'sporeFilter'], lore: ['hollowMen'] });
    expect(r.saves).toBe(3);
    expect(r.cards).toEqual(['NEW GEAR: REBREATHER FILTERS', 'NEW GEAR: SPORE FILTER', 'FILED IN THE ARCHIVE']);
    // A repeat is stored once and shows no second card.
    const again = run(['lore:hollowMen'], r.progress);
    expect(again.cards).toEqual([]);
    expect(again.progress.storyLocker.lore).toEqual(['hollowMen']);
  });

  it('without a save (tests, tools) only the bus events go out; the Archive tab registers with one', () => {
    const events = createEvents();
    const out = [];
    events.on('campaignReward', (d) => out.push(d.id));
    const off = bridgeStoryRewards(events);
    events.emit('storyReward', { id: 'lore:ivyFile' });
    expect(out).toEqual(['lore.ivyFile']);
    off();
    const p = sanitizeProgress({});
    const off2 = bridgeStoryRewards(createEvents(), { getProgress: () => p });
    const tab = new Map(batcomputerTabs()).get('archive');
    expect(tab.label).toBe('Archive');
    expect(tab.render()).toMatch(/empty/);
    off2();
    expect(new Map(batcomputerTabs()).has('archive')).toBe(false);
  });
});

describe('[verify] story gear and lore in the save', () => {
  it('an old save (no storyLocker field) loads with empty lists, and earlier campaign rewards still count', () => {
    const m = new Map();
    const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) };
    st.setItem('gotham-progress-v1', JSON.stringify({ step: 3, campaign: { night: 'n7', rewards: ['upgrade:rebreatherFilters', 'lore:penguinFile', 'xp:150'] }, openworld: { rewards: ['lore.catBurglarFile'] } }));
    const p = loadProgress(st);
    expect(p.storyLocker).toEqual({ gear: [], lore: [] });
    expect(ownedGear(p)).toEqual(['rebreatherFilters']);
    expect(ownedLore(p)).toEqual(['penguinFile', 'catBurglarFile']);
    expect(gearListHtml(p)).toMatch(/Rebreather filters/);
    expect(archiveHtml(p)).toMatch(/2 of \d+ pages filed/);
    // Kept across a new game, like the gadget unlocks.
    p.storyLocker.gear.push('thermalLining');
    expect(newGameProgress(p).storyLocker.gear).toEqual(['thermalLining']);
  });

  it('sanitises junk', () => {
    expect(sanitizeStoryLocker(undefined)).toEqual({ gear: [], lore: [] });
    expect(sanitizeStoryLocker({ gear: ['sporeFilter', 'sporeFilter', 'nope', 3], lore: ['ivyFile', '<b>'] })).toEqual({ gear: ['sporeFilter'], lore: ['ivyFile'] });
  });

  it('gear lowers its resistances on the effects object', () => {
    const p = { storyLocker: { gear: ['rebreatherFilters', 'sporeFilter', 'thermalLining', 'fireproofLining'], lore: [] } };
    const e = upgradeEffects([], {}, { extra: gearOps(p) });
    expect(e.gasMult).toBeCloseTo(0.85 * 0.9);
    expect(e.coldMult).toBeCloseTo(0.85);
    expect(e.fireMult).toBeCloseTo(0.85);
    expect(upgradeEffects([], {}, { extra: gearOps({}) }).gasMult).toBe(1);
  });
});
