// [story] Night One step ids retired by the J1 pacing pass (each folded into the step that follows
// it) -> the step that absorbed it. Pure. Read by storyMigrate.js (old saves), game.js's ?at= and
// window.__game.jump(), roofStory.js / caseFile.js (their beats moved with the lines), the scripts.
export const ALIASES = {
  gordonRadio: 'courierIntro', actOneTitle: 'toDocks', alfredRadio: 'boardBatmobile', aceClueRadio: 'toAce', actTwoTitle: 'toAce',
  toBruteFight: 'a1', aceVanRadio: 'boardBatmobileAce2', harleyRadio: 'toHarleyDoor', actThreeTitle: 'nightwingTagRadio',
  nightwingAlly: 'nightwingTagRadio', rescueGuestsRadio: 'toTower',
};

// The index of step `id` in `steps`, following one alias hop when the id itself is gone.
export function stepIndexOf(steps, id) {
  const i = steps.findIndex((s) => s.id === id);
  if (i >= 0 || !ALIASES[id]) return i;
  return steps.findIndex((s) => s.id === ALIASES[id]);
}
