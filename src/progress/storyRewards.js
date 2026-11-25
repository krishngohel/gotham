// [fix1] The story's rewards, paid. The campaign (src/story/storyRuntime.js) only emits
// `storyReward { id: 'kind:name' }` (docs/design/story-format.md 7); progression listens for
// `campaignReward { id: 'kind.name' }` (docs/design/progression.md 3). Nothing joined the two, so
// a gadget or suit a night handed out never arrived. This turns one into the other:
//   'gadget:disruptor'             -> campaignReward { id: 'gadget.disruptor' }
//   'gadget:cryptographicSequencer' -> 'gadget.hack' (STORY_GADGET_ALIASES)
//   'suit:arctic'                  -> campaignReward { id: 'suit.arctic' }
// [verify] Every other kind lands too (storyRewardTarget; tests/unit/rewardIds.test.js walks the data):
//   'xp:150'                       -> campaignReward { id: 'xp', amount: 150 }  (wayneTech awards it)
//   'skill:fearResistance'         -> campaignReward { id: 'skillPoint', key, hint } (one point, once)
//   'upgrade:thermalLining', 'gadget:sporeFilter' -> stored story gear (./storyLocker.js), then
//                                     campaignReward { id: 'gear.<id>' } (wayneTech re-applies effects)
//   'lore:penguinFile'             -> stored archive page (./storyLocker.js), campaignReward { id: 'lore.<id>' }
//   'ability:<id>'                 -> the abilities layer listens to storyReward itself (src/abilities/runtime.js)
import { rewardGadgetId } from '../gadgets/gadgetDefs.js';
import { STORY_GEAR, gearForReward, grantGear, grantLore, loreById, STORY_SKILL_REWARDS, archiveHtml } from './storyLocker.js'; // [verify]
import { registerBatcomputerTab } from '../bruce/registry.js'; // [verify] the Archive tab

// 'gadget:' story rewards that are gear, not wheel gadgets (Night Six's spore filter goes with the
// suit, like n4's 'upgrade:rebreatherFilters'): nothing to unlock on the wheel, so no campaignReward.
// Listed so the consistency test can tell them from a typo; L1 owns what they grant.
// [verify] Derived from the gear data (./storyLocker.js STORY_GEAR), which now grants them.
export const STORY_GEAR_REWARDS = Object.freeze(STORY_GEAR.filter((g) => g.reward.startsWith('gadget:')).map((g) => g.reward.slice(7)));

// [verify] Story suit names that are not wardrobe ids (written in the night files before the suit
// list was settled): the look each one stands for. 'questionMarkCowl' is the new 'question-mark'
// suit (src/heroes/models/suits.js); 'arkhamKnight' (the finale's reward) is Field Repair, the one
// look whose unlock text already promised "a campaign reward" and that no night gave.
export const STORY_SUIT_ALIASES = Object.freeze({ questionMarkCowl: 'question-mark', arkhamKnight: 'field-repair' });

export function campaignRewardFor(storyId) {
  if (typeof storyId !== 'string') return null;
  const gadget = rewardGadgetId(storyId);
  if (gadget) return `gadget.${gadget}`;
  if (storyId.startsWith('suit:') && storyId.length > 5) return `suit.${STORY_SUIT_ALIASES[storyId.slice(5)] ?? storyId.slice(5)}`; // [verify] aliases
  return null;
}

// [verify] Where any story reward id goes: { kind, ... } or null for an id nothing can grant.
//   { kind: 'campaign', id }                 a gadget or suit (campaignRewardFor)
//   { kind: 'xp', amount }                   XP (1..5000)
//   { kind: 'skillPoint', key, hint }        one free point, keyed so it pays once; hint = a node id
//   { kind: 'gear', id } / { kind: 'lore', id }   ./storyLocker.js entries
//   { kind: 'ability', id }                  the abilities layer's own grant
export function storyRewardTarget(storyId) {
  if (typeof storyId !== 'string') return null;
  const camp = campaignRewardFor(storyId);
  if (camp) return { kind: 'campaign', id: camp };
  const gear = gearForReward(storyId);
  if (gear) return { kind: 'gear', id: gear.id };
  const i = storyId.indexOf(':');
  const kind = storyId.slice(0, i), name = storyId.slice(i + 1);
  if (i < 1 || !name) return null;
  if (kind === 'xp') { const n = Number(name); return Number.isFinite(n) && n > 0 ? { kind: 'xp', amount: Math.min(5000, Math.round(n)) } : null; }
  if (kind === 'skill') return STORY_SKILL_REWARDS[name] ? { kind: 'skillPoint', key: storyId, hint: STORY_SKILL_REWARDS[name] } : null;
  if (kind === 'lore') return loreById(name) ? { kind: 'lore', id: name } : null;
  if (kind === 'ability') return { kind: 'ability', id: name };
  return null;
}

// Wires the bridge on an event bus; returns the unsubscribe.
// [verify] With { getProgress, save, getHud } it also stores gear and lore pages in the save (and
// registers the Batcomputer's Archive tab); without them only the bus events go out (tests, tools).
export function bridgeStoryRewards(events, { getProgress = null, save = () => {}, getHud = () => null } = {}) {
  const off = events.on('storyReward', (d = {}) => {
    const t = storyRewardTarget(d.id); // [verify] every kind, not only gadgets and suits
    if (!t) return;
    const meta = { source: d.id, night: d.night ?? null };
    if (t.kind === 'campaign') events.emit('campaignReward', { id: t.id, ...meta });
    else if (t.kind === 'xp') events.emit('campaignReward', { id: 'xp', amount: t.amount, ...meta });
    else if (t.kind === 'skillPoint') events.emit('campaignReward', { id: 'skillPoint', key: t.key, hint: t.hint, ...meta });
    else if (t.kind === 'gear' || t.kind === 'lore') {
      const p = getProgress?.();
      const fresh = p ? (t.kind === 'gear' ? grantGear(p, t.id) : grantLore(p, t.id)) : null;
      if (fresh) {
        save();
        getHud?.()?.card?.(t.kind === 'gear' ? `NEW GEAR: ${fresh.name.toUpperCase()}` : 'FILED IN THE ARCHIVE', t.kind === 'gear' ? `${fresh.text} Listed in the suit vault.` : `${fresh.title}. On the Batcomputer.`, 5000);
      }
      events.emit('campaignReward', { id: `${t.kind}.${t.id}`, ...meta });
    }
  });
  const offTab = getProgress ? registerBatcomputerTab('archive', { label: 'Archive', render: () => archiveHtml(getProgress() ?? {}) }) : null; // [verify]
  return () => { off?.(); offTab?.(); };
}
