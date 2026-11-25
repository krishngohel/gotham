// The mission state machine (pure). A superset of src/game/objectives.js's linear walk: with no
// `next` / `branches` on any step it behaves exactly like createObjectives (Night One relies on
// that), and it adds what the campaign's nights need:
//
//   next: 'stepId'              after this step, carry on at that step instead of the one below
//   branches: { key: 'stepId' }  a step finished with { branch: key } carries on there (a 'fork'
//                                step's options, a "save the cash or the hostage" choice)
//   optional: [{ id, ... }]      objectives that run alongside the step and never block it
//   retry: true                  a step a failed mission restarts from (else the mission's first)
//
// Failing (a timer runs out, a puzzle is botched three times, the fear meter fills) never ends
// the run: fail() hands back the index of the mission's retry step and the caller re-enters it.
import { matches } from '../game/objectives.js';

export function createRunner(steps, startIndex = 0) {
  let index = clamp(startIndex);
  const ids = new Map(steps.map((s, i) => [s.id, i]));
  const optionalDone = new Set();
  function clamp(i) { return Math.max(0, Math.min(steps.length, Number.isInteger(i) ? i : 0)); }
  const api = {
    get index() { return index; },
    get step() { return steps[index] ?? null; },
    get done() { return index >= steps.length; },
    get steps() { return steps; },
    indexOf: (id) => (ids.has(id) ? ids.get(id) : -1),
    // The step after `i` once it is done (its `next`, a branch, or simply the one below).
    nextIndex(i = index, branch = null) {
      const s = steps[i];
      if (!s) return steps.length;
      const to = (branch != null && s.branches?.[branch]) || s.next;
      if (to && ids.has(to)) return ids.get(to);
      return i + 1;
    },
    // The step that will most likely follow the current one (for the "next objective" preview).
    peek() { return steps[api.nextIndex()] ?? null; },
    handle(ev) {
      const s = steps[index];
      if (!s || !matches(s, ev)) return false;
      index = api.nextIndex(index, ev.branch ?? null);
      return true;
    },
    jump(i) { index = clamp(i); },
    // The mission the step at `i` belongs to (steps carry `mission` once a night is flattened).
    missionOf(i = index) { return steps[i]?.mission ?? null; },
    // Where a failed attempt restarts: the last `retry` step of this mission at or before `i`,
    // else the mission's first step. Steps without a mission retry themselves.
    retryIndex(i = index) {
      const m = steps[i]?.mission;
      if (!m) return clamp(i);
      let first = i;
      for (let k = Math.min(i, steps.length - 1); k >= 0 && steps[k].mission === m; k--) {
        if (steps[k].retry) return k;
        first = k;
      }
      return first;
    },
    fail() { index = api.retryIndex(index); return index; },
    // Optional objectives on the current step (each { id, ... }); done ones drop out.
    optionals(i = index) { return (steps[i]?.optional ?? []).filter((o) => !optionalDone.has(o.id)); },
    completeOptional(id) { if (optionalDone.has(id)) return false; optionalDone.add(id); return true; },
    get optionalDone() { return [...optionalDone]; },
    restoreOptional(list = []) { for (const id of list) optionalDone.add(id); },
    // The first step of a mission (mission select, a replay).
    missionStart(missionId) { return steps.findIndex((s) => s.mission === missionId); },
  };
  return api;
}

// The respawn point for a step: its own checkpoint, or the nearest earlier one (same as
// objectives.js checkpointFor, re-exported so night code needs one import).
export { checkpointFor } from '../game/objectives.js';
