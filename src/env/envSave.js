// What the clock and the weather keep in the save (workstream M): the clock's number (game hours
// since day 0, see clock.js) and the weather seed. Registered through registerProgressField
// (design rule 2): an old save without it loads with the defaults; a new game resets it, so Night
// One always starts an hour before midnight in a storm.
import { registerProgressField } from '../core/save.js';

export const ENV_DEFAULTS = Object.freeze({ abs: null, seed: 7 });

export function sanitizeEnv(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const abs = typeof r.abs === 'number' && Number.isFinite(r.abs) && r.abs >= 0 && r.abs < 24 * 100000 ? r.abs : null;
  const seed = Number.isInteger(r.seed) && r.seed >= 0 && r.seed < 2 ** 32 ? r.seed : ENV_DEFAULTS.seed;
  return { abs, seed };
}

// Idempotent: game.js and the tests both import this module.
let registered = false;
export function registerEnvSave() {
  if (registered) return;
  registered = true;
  registerProgressField('env', { sanitize: sanitizeEnv, fresh: { ...ENV_DEFAULTS } });
}
registerEnvSave();
