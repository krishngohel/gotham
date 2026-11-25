// What co-op keeps in the save (workstream D1): each local player's last hero pick (a kit id from
// src/heroes/roster.js, so the hero select opens on it) and the split-screen layout. Registered
// through registerProgressField (design rule 2): an old save without it loads with the defaults,
// and a new game keeps it (a pick is a preference, not story progress).
import { registerProgressField } from '../core/save.js';
import { isKitId } from '../heroes/roster.js';
import { SPLIT_LAYOUTS } from './viewLayout.js';

export const COOP_DEFAULTS = Object.freeze({ picks: Object.freeze([null, null]), split: 'vertical' });

export function sanitizeCoop(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const picks = Array.isArray(r.picks) ? r.picks : [];
  return {
    picks: [0, 1].map((i) => (isKitId(picks[i]) ? picks[i] : null)),
    split: SPLIT_LAYOUTS.includes(r.split) ? r.split : COOP_DEFAULTS.split,
  };
}

// Idempotent: game.js and the tests both import this module.
let registered = false;
export function registerCoopSave() {
  if (registered) return;
  registered = true;
  registerProgressField('coop', { sanitize: sanitizeCoop });
}
registerCoopSave();

// The kit a slot last picked, else null.
export const lastPick = (progress, slot) => progress?.coop?.picks?.[slot] ?? null;
export function rememberPick(progress, slot, kitId) {
  if (!progress.coop) progress.coop = sanitizeCoop({});
  if (isKitId(kitId)) progress.coop.picks[slot] = kitId;
}
