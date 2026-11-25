// [m45] Night Four's own step types (docs/design/briefs/missions-round.md): one line in
// src/story/storyRuntime.js adds them to the campaign's. `armada` stays the flow's own step type
// (src/game/flow.js); the entry here only rides along with it (wingPickup.js).
import { createHuntedStep } from './hunted.js';
import { createWingPickup } from './wingPickup.js';

export const N4_STEP_TYPES = ['hunted'];
export const n4StepTypes = (ctx) => ({ hunted: createHuntedStep(ctx), armada: createWingPickup(ctx) });
