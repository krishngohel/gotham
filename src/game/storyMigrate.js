// Places a loaded save on the story. A save's position comes only from its own stepId; nothing
// ever falls back to reading a numeric index against an old step list.
import { STEPS } from './story.js';
import { registerProgressField } from '../core/save.js';

const ID = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
registerProgressField('stepId', { sanitize: (v) => (typeof v === 'string' && ID.test(v) ? v : null), fresh: null });

// The saved step id, read against the current story; a save with no id (fresh, or one whose id no
// longer exists) starts over at the top.
// Steps taken out of the story, and where a save sitting on one carries on (the Batwing balloon
// run was cut on 2026-10-10).
export const RETIRED = { armadaRun: 'nightwingTagRadio' };

export function resolveStep(progress, steps = STEPS) {
  const id = RETIRED[progress?.stepId] ?? progress?.stepId;
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
