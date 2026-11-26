// [m67] The rules behind the mission step types (src/story/missions/n6/steps.js, n7/steps.js).
// Pure: no DOM, no three.js, no game objects. Unit-tested in tests/unit/missionSteps.test.js.

// ---------------------------------------------------------------- rescue / hack: hold points
// Several places that each need someone standing at them for `hold` seconds, in any order (or in
// the listed order with `ordered`). Progress at a point nobody is at drains (at half speed) so a
// point cannot be finished in passing. An optional clock: 'fail' when it runs out; each point
// finished adds `bonus` seconds.
//   const run = createHoldPoints(n, { hold, timer, bonus, ordered });
//   run.tick(dt, occupied /* indices with a hero at them */) -> { finished: [i...], state: 'run' | 'done' | 'fail' }
export function createHoldPoints(n, { hold = 2.5, timer = null, bonus = 0, ordered = false } = {}) {
  const progress = new Array(n).fill(0);
  const done = new Array(n).fill(false);
  let clock = timer, state = n > 0 ? 'run' : 'done';
  const out = { finished: [], state };
  return {
    get clock() { return clock; },
    get state() { return state; },
    get left() { return done.filter((d) => !d).length; },
    get next() { return done.indexOf(false); },
    isDone: (i) => !!done[i],
    fraction: (i) => (done[i] ? 1 : Math.min(1, progress[i] / hold)),
    // The point a hero is working on right now (the furthest along), or -1.
    active() { let best = -1; for (let i = 0; i < n; i++) if (!done[i] && progress[i] > 0 && (best < 0 || progress[i] > progress[best])) best = i; return best; },
    finish(i) { if (state !== 'run' || done[i] || i < 0 || i >= n) return false; done[i] = true; progress[i] = hold; if (clock != null) clock += bonus; if (done.every(Boolean)) state = 'done'; return true; },
    tick(dt, occupied = []) {
      out.finished.length = 0;
      if (state !== 'run') { out.state = state; return out; }
      const open = ordered ? done.indexOf(false) : -1;
      for (let i = 0; i < n; i++) {
        if (done[i]) continue;
        const on = occupied.includes(i) && (!ordered || i === open);
        if (on) progress[i] += dt; else progress[i] = Math.max(0, progress[i] - dt * 0.5);
        if (progress[i] >= hold) { done[i] = true; out.finished.push(i); if (clock != null) clock += bonus; }
      }
      if (done.every(Boolean)) state = 'done';
      else if (clock != null) { clock -= dt; if (clock <= 0) { clock = 0; state = 'fail'; } }
      out.state = state;
      return out;
    },
    reset() { progress.fill(0); done.fill(false); clock = timer; state = n > 0 ? 'run' : 'done'; },
  };
}

// ---------------------------------------------------------------- escape: lose the police
// The story raises the police attention level and the step lasts until it is clear again (and has
// stayed clear for `settle` seconds: the level reads 0 for a frame between a holding cell and the
// breakout pursuit). `mercy` seconds in, somebody calls the chase off (a step must never be a
// wall). With no wanted system at all (a headless run) the step ends after `fallback` seconds.
//   const e = createEscape({ mercy, fallback, grace, settle });
//   e.tick(dt, { present, level }) -> 'run' | 'clear' | 'mercy'
export function createEscape({ mercy = 150, fallback = 3, grace = 2, settle = 1.2 } = {}) {
  let t = 0, armed = false, result = 'run', calm = 0;
  return {
    get t() { return t; },
    get result() { return result; },
    get armed() { return armed; },
    tick(dt, { present = true, level = 0 } = {}) {
      if (result !== 'run') return result;
      t += dt;
      if (!present) { if (t >= fallback) result = 'clear'; return result; }
      if (level > 0) { armed = true; calm = 0; }
      else calm += dt;
      // Clear once the level has been up and has stayed down; a set that never lands (no police
      // system answering) ends it too, a little later.
      if (level === 0 && t >= grace && ((armed && calm >= settle) || (!armed && t >= grace + 6))) { result = 'clear'; return result; }
      if (t >= mercy) result = 'mercy';
      return result;
    },
    reset() { t = 0; armed = false; result = 'run'; calm = 0; },
  };
}

// ---------------------------------------------------------------- case board: ordered deduction
// Evidence is found in the world (any order); once it is all in, the event cards go on the board
// in the order they happened. A wrong order costs a line; after `assistAfter` wrong tries the first
// card is marked. Shaped so src/openworld/cases/board.js can draw it (the same board the open
// world's cases use): active = { def, run, stage }.
export function createDeduction(def, { assistAfter = 2 } = {}) {
  const evidence = (def.evidence ?? []).map((e) => ({ id: e.id, glyph: e.glyph ?? 'object', label: e.label ?? e.id, text: e.text ?? '', found: false, hinted: true }));
  let wrong = 0, solved = false, revealed = null;
  const run = {
    evidence,
    get foundCount() { return evidence.filter((e) => e.found).length; },
    get revealed() { return revealed; },
    get stage() { return solved ? 2 : evidence.every((e) => e.found) ? 1 : 0; },
  };
  const boardDef = { id: def.id, title: def.caseTitle ?? 'CASE', blurb: def.blurb ?? '', reconstruct: { prompt: def.prompt ?? 'Put the events in the order they happened.', cards: def.cards, order: def.order } };
  return {
    run, def: boardDef,
    get solved() { return solved; },
    get wrong() { return wrong; },
    get ready() { return evidence.every((e) => e.found); },
    find(i) { const e = evidence[i]; if (!e || e.found) return false; e.found = true; return true; },
    // What the board reads.
    get active() { return { def: boardDef, run, stage: solved ? 'solved' : run.stage === 1 ? 'reconstruct' : 'scene' }; },
    hud() { return { text: solved ? 'Solved.' : run.stage === 1 ? 'Put the events in order.' : `Evidence ${run.foundCount}/${evidence.length}` }; },
    answer(order) {
      if (solved) return { ok: true, wrong, revealed: false };
      if (!this.ready) return { ok: false, wrong, revealed: false };
      const ok = Array.isArray(order) && order.length === def.order.length && order.every((id, i) => id === def.order[i]);
      if (ok) { solved = true; return { ok: true, wrong, revealed: false }; }
      wrong += 1;
      const now = wrong >= assistAfter && !revealed;
      if (wrong >= assistAfter) revealed = def.order[0];
      return { ok: false, wrong, revealed: now };
    },
  };
}
// Problems with a caseboard step's data ([] when fine).
export function validateDeduction(def) {
  const out = [];
  const ids = (def.cards ?? []).map((c) => c.id);
  if (!def.evidence?.length) out.push('no evidence');
  if (ids.length < 3 || ids.length > 5) out.push('needs 3 to 5 cards (the board has keys 1-5)');
  if (new Set(ids).size !== ids.length) out.push('duplicate card ids');
  if (!Array.isArray(def.order) || def.order.length !== ids.length || [...def.order].sort().join() !== [...ids].sort().join()) out.push('order must list every card once');
  // The cards must not already be listed in the answer's order: that would solve itself.
  if (ids.join() === (def.order ?? []).join()) out.push('cards are listed in the solved order');
  return out;
}
