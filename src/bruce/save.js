// The Bruce Wayne side's saved state (workstream K), through registerProgressField so old saves
// load with defaults and nothing existing is renamed. Import this before loadProgress (game.js
// imports it with the other save modules).
//   progress.bruce    the double-life state (doubleLife.js sanitizeDoubleLife). A new game starts
//                     a fresh double life (fresh: null), the same as the story.
//   progress.batcave  { medals: { [challengeId]: medal }, tutorial: [moveIds], trophies: [ids],
//                     suit: suitId | null (the vault's pick for the next suit-up) }. Kept across a
//                     new game, like the challenge medals.
import { registerProgressField, MEDALS } from '../core/save.js';
import { sanitizeDoubleLife } from './doubleLife.js';

const ID = /^[a-zA-Z][a-zA-Z0-9._-]{0,47}$/;

export function sanitizeBatcave(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const medals = {};
  if (r.medals && typeof r.medals === 'object' && !Array.isArray(r.medals)) {
    for (const [id, m] of Object.entries(r.medals).slice(0, 32)) if (ID.test(id) && MEDALS.includes(m)) medals[id] = m;
  }
  const ids = (v, max = 64) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && ID.test(x)))].slice(0, max) : []);
  return { medals, tutorial: ids(r.tutorial), trophies: ids(r.trophies), suit: typeof r.suit === 'string' && ID.test(r.suit) ? r.suit : null };
}

registerProgressField('bruce', { sanitize: sanitizeDoubleLife, fresh: null });
registerProgressField('batcave', { sanitize: sanitizeBatcave });
