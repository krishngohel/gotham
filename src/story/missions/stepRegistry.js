// [m67] Mission step types that live beside the missions that use them (src/story/missions/n<N>/).
// A night file imports its mission module for the side effect; the module registers its step
// types here, the story runtime builds them with the same context the built-in types get
// (src/story/storyRuntime.js), and the name joins STEP_TYPES so the campaign's data checks accept
// it. Pure: no DOM, no three.js.
import { STEP_TYPES } from '../campaign.js';

const MAKERS = new Map();

// make(ctx) -> { enter(step), update(dt, step), exit(), marker(), onRespawn(step), debugSolve?(step) }
export function registerMissionStep(name, make) {
  if (typeof name !== 'string' || typeof make !== 'function') throw new Error(`registerMissionStep(${name})`);
  if (MAKERS.has(name)) return;
  MAKERS.set(name, make);
  if (!STEP_TYPES.includes(name)) STEP_TYPES.push(name);
}
export function buildMissionSteps(ctx) {
  const out = {};
  for (const [name, make] of MAKERS) out[name] = make(ctx);
  return out;
}
export const missionStepNames = () => [...MAKERS.keys()];
