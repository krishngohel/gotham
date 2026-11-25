// Difficulty, New Game Plus and run modifiers (wave 3, workstream L1). Pure.
//
// progress.mode (registered field; kept by a new game, which is how NG+ carries over):
//   difficulty   the difficulty chosen when this save's run began (shown on the slot; the live
//                setting stays global in settings.difficulty)
//   ngPlus       how many times this save has started New Game Plus (0: never)
//   modifiers    { noHud, checkpointLimit } optional run modifiers
//   checkpoints  checkpoint restarts used this run (for checkpointLimit)
// progress.reputation: the city's fear/reputation (src/enemies/fear.js createReputation), saved.
import { registerProgressField } from '../core/save.js';
import { DIFFICULTIES } from '../combat/rules.js';

export const CHECKPOINT_LIMITS = [0, 3, 5, 10]; // 0 = unlimited

export const DIFFICULTY_INFO = {
  story: { name: 'Story', text: 'Goons hit for half and wind up longer; you start with 150 health and heal fully after every fight. For the story and the city.' },
  normal: { name: 'Normal', text: 'The intended fight: counter the blue bolts, dodge the red ones. Partial healing after a fight.' },
  hard: { name: 'Hard', text: 'Smarter, faster squads with more attackers at once and more guns. Little healing between fights.' },
  knightmare: { name: 'Knightmare', text: 'No counter warnings at all, the most aggressive squads, no healing between fights and no regeneration. Read the body language.' },
};

export function sanitizeMode(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const m = r.modifiers && typeof r.modifiers === 'object' && !Array.isArray(r.modifiers) ? r.modifiers : {};
  const int = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
  return {
    difficulty: DIFFICULTIES.includes(r.difficulty) ? r.difficulty : null,
    ngPlus: int(r.ngPlus, 99),
    modifiers: {
      noHud: m.noHud === true,
      checkpointLimit: CHECKPOINT_LIMITS.includes(m.checkpointLimit) ? m.checkpointLimit : 0,
    },
    checkpoints: int(r.checkpoints, 9999),
  };
}
registerProgressField('mode', { sanitize: sanitizeMode });

export function sanitizeReputation(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const clamp = (v) => Math.min(100, Math.max(0, v));
  const value = typeof r.value === 'number' && Number.isFinite(r.value) ? clamp(r.value) : 50;
  const gangs = {};
  const g = r.gangs && typeof r.gangs === 'object' && !Array.isArray(r.gangs) ? r.gangs : {};
  for (const [k, v] of Object.entries(g).slice(0, 32)) if (/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) gangs[k] = clamp(v);
  return { value, gangs };
}
registerProgressField('reputation', { sanitize: sanitizeReputation });

// A finished save can start New Game Plus.
export const canNgPlus = (progress) => progress?.finished === true;

// Starting a run: a new game records its difficulty and resets the checkpoint count; NG+ also bumps
// the counter. Skills, gadgets, suits, trophies and XP are kept by newGameProgress already (only
// the story fields reset), so NG+ needs nothing else carried.
export function startRunMode(mode, { difficulty, ngPlus = false, modifiers = null }) {
  const m = sanitizeMode(mode);
  m.difficulty = DIFFICULTIES.includes(difficulty) ? difficulty : m.difficulty;
  if (ngPlus) m.ngPlus += 1;
  if (modifiers) m.modifiers = sanitizeMode({ modifiers }).modifiers;
  m.checkpoints = 0;
  return m;
}

// NG+ remix for the wave composer (src/enemies/compose.js composeWave's inputs, owned by J/I): a
// bigger budget per NG+ level (capped), the act's new roles a little earlier, and the next
// difficulty's special mix. Returns a new inputs object; with ngPlus 0 it returns them unchanged.
const NEXT = { story: 'normal', normal: 'hard', hard: 'knightmare', knightmare: 'knightmare' };
export function remixWaveInputs(inputs, ngPlus) {
  if (!(ngPlus > 0)) return inputs;
  const lvl = Math.min(3, ngPlus);
  return {
    ...inputs,
    budget: Math.round((Number(inputs.budget) || 0) * (1 + 0.25 * lvl)),
    act: Math.min(5, (inputs.act ?? 1) + 1),
    difficulty: NEXT[inputs.difficulty ?? 'normal'] ?? 'hard',
  };
}

// Permadeath-lite: may the player restart from a checkpoint? Returns { ok, left }.
export function checkpointAllowed(mode) {
  const lim = mode?.modifiers?.checkpointLimit ?? 0;
  if (!lim) return { ok: true, left: Infinity };
  const left = Math.max(0, lim - (mode.checkpoints ?? 0));
  return { ok: left > 0, left };
}
