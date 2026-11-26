// Places a loaded save on the story. A save's position comes from its own stepId. The numeric
// index is never read against the *current* step list (inserting a step would shift every save);
// a save that has only an index is read against the frozen list it was written for (LEGACY_STEP_IDS).
import { STEPS } from './story.js';
import { registerProgressField } from '../core/save.js';

const ID = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
registerProgressField('stepId', { sanitize: (v) => (typeof v === 'string' && ID.test(v) ? v : null), fresh: null });

// The saved step id, read against the current story; a save with no id (fresh, or one whose id no
// longer exists) starts over at the top.
// Steps taken out of the story, and where a save sitting on one carries on (the Batwing balloon
// run was cut on 2026-10-10).
// [story] Plus every id the J1 pacing pass folded into the step after it (storyAliases.js).
import { ALIASES } from './storyAliases.js';
export const RETIRED = { armadaRun: 'nightwingTagRadio', ...ALIASES };

// [m1] The step list of the original game (the pre-overhaul build, commit 5fe2c7f), frozen. A save
// that carries only `step` (no stepId) can only have come from a build with this list, so its index
// means the id at that place here; the id then resolves like any saved id (retired ones through
// RETIRED). Never edit this list: new steps go in the story, not here.
export const LEGACY_STEP_IDS = Object.freeze([
  'intro', 'signal', 'card', 'gordonRadio', 'courierIntro', 'actOneTitle', 'toDocks', 'alfredRadio', 'boardBatmobile', 'batmobileChase',
  'toRoofAfterChase', 'f1', 'toYard', 'f2', 'toShip', 'f3', 'crates', 'rewardCrates', 'toNeon', 'n1', 'toStreet', 'n2', 'toMonarch', 'n3',
  'courierRooftop', 'monarchBalcony', 'rig', 'rewardRig', 'aceClueRadio', 'actTwoTitle', 'toAce', 'boardBatmobileAce', 'aceBattle',
  'toBruteFight', 'a1', 'toFactory', 'a2', 'aceVanRadio', 'boardBatmobileAce2', 'aceVanChase', 'harleyRadio', 'toHarleyDoor', 'harleyFight',
  'toVat', 'a3', 'toCatwalks', 'aceCatwalks', 'antidote', 'rewardAntidote', 'courierReveal', 'actThreeTitle', 'nightwingTagRadio',
  'nightwingAlly', 'toPlaza', 'plazaFight', 'toFunhouse', 'funhouseFight', 'rescueGuestsRadio', 'toTower', 'boss', 'finale', 'credits',
]);

// The step id an index-only save stands on: its index in the legacy list (past the end: the
// credits). null when the save has an id of its own, or no usable index.
export function legacyStepId(progress) {
  if (progress?.stepId != null) return null;
  const i = progress?.step;
  if (!Number.isInteger(i) || i <= 0) return null;
  return LEGACY_STEP_IDS[Math.min(i, LEGACY_STEP_IDS.length - 1)];
}

export function resolveStep(progress, steps = STEPS) {
  const saved = progress?.stepId ?? legacyStepId(progress);
  const id = RETIRED[saved] ?? saved;
  if (id) {
    const i = steps.findIndex((s) => s.id === id);
    if (i >= 0) return i;
  }
  return 0;
}

// Stamps the resolved position back onto progress (both the index and the id), so a save that
// lands on 'reset' by falling through the case above is written back with a real id, not saved
// again with no id at all.
export function migrateProgress(progress, steps = STEPS) {
  const step = resolveStep(progress, steps);
  return { ...progress, step, stepId: steps[step]?.id ?? null };
}
