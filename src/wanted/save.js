// [wanted] What police attention remembers in the save (progress.wanted, a registered field):
//   taught    first-time teaching cards already shown: level numbers and 'caught' / 'restrain'
//   menace    a story beat branded Batman a menace (plot state; the city keeps looking)
//   record    crimes stopped since the last time the police were after you (a clean record)
//   nights    { peak, caught, escapes } this night, read by the Bruce side the next day
//   level     the level when the game was saved (a chase does not resume; a manhunt does as Noticed)
//   tickets   traffic tickets Bruce has collected (comedy, and the detective reads them)
// An old save has no `wanted`: it loads the defaults.
import { registerProgressField } from '../core/save.js';

const int = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
const TAUGHT = new Set(['1', '2', '3', '4', '5', 'caught', 'restrain', 'jack', 'radio', 'stop']);

export const DEFAULT_WANTED_SAVE = Object.freeze({ taught: [], menace: false, record: 0, nights: { peak: 0, caught: 0, escapes: 0 }, level: 0, tickets: 0 });

export function sanitizeWantedSave(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const n = r.nights && typeof r.nights === 'object' ? r.nights : {};
  return {
    taught: Array.isArray(r.taught) ? [...new Set(r.taught.map(String).filter((s) => TAUGHT.has(s)))] : [],
    menace: r.menace === true,
    record: int(r.record, 1e6),
    nights: { peak: int(n.peak, 5), caught: int(n.caught, 999), escapes: int(n.escapes, 999) },
    level: int(r.level, 5),
    tickets: int(r.tickets, 1e6),
  };
}

registerProgressField('wanted', { sanitize: sanitizeWantedSave, fresh: sanitizeWantedSave({}) });
