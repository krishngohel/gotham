// [m23] Night Two's mission step types (docs/design/briefs/missions-round.md): a detective case
// with a case board, and a rescue against a clock. Night Three uses both too.
import { createCaseStep } from './caseStep.js';
import { createRescueStep } from './rescueStep.js';
import { createTailStep } from './tailStep.js';
import { registerNightFills } from './fills.js';
import { nightById } from '../../campaign.js';

export const N2_STEP_TYPES = ['case', 'rescue', 'carTail'];
export function createN2Steps(ctx) {
  // A night's fill lights join the light pool the first time one of its steps begins.
  ctx.events?.on?.('step', () => registerNightFills(nightById(ctx.nightId?.()), ctx.theGame?.()?.world));
  return { case: createCaseStep(ctx), rescue: createRescueStep(ctx), carTail: createTailStep(ctx) };
}
