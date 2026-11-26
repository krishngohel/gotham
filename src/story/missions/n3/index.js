// [m23] Night Three's mission step type: losing the police when the plot sets them on Batman.
import { createEvadeStep } from './evadeStep.js';

export const N3_STEP_TYPES = ['evade'];
export function createN3Steps(ctx) {
  return { evade: createEvadeStep(ctx) };
}
