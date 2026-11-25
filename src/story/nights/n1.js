// Night One, "The Long Night": the original story (src/game/story.js STEPS) as the campaign's first
// night. The step objects are Night One's own (flatSteps), untouched; this file only groups them
// into missions for mission select and the missionComplete beat. Its saved place stays in
// progress.step / progress.stepId as it always was.
import { STEPS } from '../../game/story.js';

// Each mission starts at its step id and runs to the next one's.
const MISSIONS = [
  { id: 'm1Signal', title: 'The Signal', from: 'intro' },
  { id: 'm1Docks', title: 'The Stolen Shipment', from: 'toDocks' },
  { id: 'm1Neon', title: 'Dead Air', from: 'toNeon' },
  { id: 'm1Ace', title: 'Ace Chemicals', from: 'toAce' },
  { id: 'm1Clock', title: 'The Clock Plaza', from: 'nightwingTagRadio' },
  { id: 'm1Tower', title: 'Midnight', from: 'toTower' },
];

const starts = MISSIONS.map((m) => STEPS.findIndex((s) => s.id === m.from));
const missionAt = (i) => {
  let k = 0;
  for (let j = 0; j < starts.length; j++) if (starts[j] >= 0 && i >= starts[j]) k = j;
  return MISSIONS[k].id;
};
// Steps are shared objects (the rest of the game holds references to STEPS); the mission tag is
// written onto them once, the only field this file adds.
STEPS.forEach((s, i) => { if (!s.mission) s.mission = missionAt(i); });

export default {
  id: 'n1', act: 'act1', number: 1,
  title: 'Night One: The Long Night',
  blurb: 'The Joker has stolen a Wayne Tech shipment, the airwaves and enough Smilex for midnight.',
  villain: 'joker',
  districts: ['gcpd', 'docks', 'neon', 'ace', 'clock'],
  // Pinned for the whole night (released at the credits): night in a storm is the original look.
  timeOfDay: 23, weather: 'storm',
  start: 'start',
  flatSteps: STEPS,
  missions: MISSIONS.map((m) => ({ id: m.id, title: m.title, steps: STEPS.filter((s) => s.mission === m.id) })),
};
