// Bruce days: what fills the campaign's "Bruce day" slots between nights (workstream K).
//
// THE INTERFACE (for the campaign, src/story/campaign.js, workstream J1)
//   The campaign names a slot between two nights with a hook id. This module answers for it:
//
//   BRUCE_DAY_SLOTS[slotId] = { id, after (night number), act, scene (primary scene id),
//                               alternates: [sceneId], morning: 'manor' | 'cave', title }
//   planDay(slotId, { life, report, campaign }) -> DayPlan     pure: no side effects on `life`
//     DayPlan = { slot, scene (scene data), calendar (calendar.js Day), headlines, preview }
//     `report` is the night that just ended ({ endHour, hits, finishers, crimesStopped,
//     crimesIgnored, district, storyWon }); `campaign` is { night, villain } (both optional).
//   The runtime plays it: game.bruce.playDay(slotId, { report, campaign }) -> Promise<DayResult>
//     DayResult = { slot, scene, outcome, changes, nightStart }
//     nightStart (doubleLife.js) is how the NEXT night starts: { backup, tail, rndFrozen,
//     staminaRegenK, healthK, alfredOnComms, escalated, leads, notes }. The campaign applies what
//     it wants of it; the day never blocks the story (every scene ends, every outcome is valid).
//   Skipping a day is allowed: game.bruce.skipDay(slotId, { report }) applies the night and a
//   "missed" commitment, and returns the same DayResult shape with outcome 'skipped'.
//
// Slot ids are 'day1' .. 'day7' (the day after night N). Unknown ids fall back to the first slot
// whose scene has not been played, so a campaign that names its own ids still gets a day.
import { SCENES, sceneById } from './scenes.js';
import { fixedDay } from './calendar.js';
import { headlines } from './newspaper.js';
import { nightStart, createDoubleLife, applyNight } from './doubleLife.js';

export const BRUCE_DAY_SLOTS = Object.freeze({
  day1: { id: 'day1', after: 1, act: 2, title: 'The morning after the Long Night', scene: 'gala', alternates: ['pressConference'], morning: 'manor' },
  day2: { id: 'day2', after: 2, act: 2, title: 'The vote', scene: 'boardVote', alternates: ['luciusBriefing'], morning: 'manor' },
  day3: { id: 'day3', after: 3, act: 2, title: 'Knuckles', scene: 'pressConference', alternates: ['clinic'], morning: 'manor' },
  day4: { id: 'day4', after: 4, act: 3, title: 'The Narrows clinic', scene: 'clinic', alternates: ['pressConference'], morning: 'manor' },
  day5: { id: 'day5', after: 5, act: 3, title: 'Prototypes', scene: 'luciusBriefing', alternates: ['boardVote'], morning: 'cave' },
  day6: { id: 'day6', after: 6, act: 4, title: 'A detective calls', scene: 'detectiveCalls', alternates: ['gala'], morning: 'manor' },
  day7: { id: 'day7', after: 7, act: 4, title: 'The last gala', scene: 'gala', alternates: ['detectiveCalls'], morning: 'manor' },
});
export const SLOT_IDS = Object.keys(BRUCE_DAY_SLOTS);

export function slotFor(slotId, life = null) {
  if (BRUCE_DAY_SLOTS[slotId]) return BRUCE_DAY_SLOTS[slotId];
  const played = life?.scenes ?? {};
  return Object.values(BRUCE_DAY_SLOTS).find((s) => !played[s.scene]) ?? BRUCE_DAY_SLOTS.day1;
}

// The scene for a slot: the primary, unless it was already played this save (then an alternate).
export function sceneFor(slot, life = null) {
  const played = life?.scenes ?? {};
  const id = [slot.scene, ...slot.alternates].find((s) => !played[s]) ?? slot.scene;
  return sceneById(id);
}

export function planDay(slotId, { life = createDoubleLife(), report = null, campaign = {} } = {}) {
  const slot = slotFor(slotId, life);
  const scene = sceneFor(slot, life);
  // Preview on a copy: the plan never changes the real state.
  const preview = JSON.parse(JSON.stringify(life));
  if (report) applyNight(preview, report);
  const calendar = fixedDay(life.day ?? 0, scene.commitment, { kind: 'signal', villain: campaign.villain ?? null });
  return { slot, scene, calendar, headlines: headlines(preview, { villain: campaign.villain ?? null }), preview: nightStart(preview) };
}

export const DAY_SCENES = SCENES; // every scene the slots can name, keyed by id
