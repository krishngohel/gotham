// [sandbox] What the open-world sandbox remembers (progress.sandbox, a registered field):
//   station   the last car-radio station
//   drift     best banked drift score; jump: best jump score; air: longest air time (s)
//   found     activity spots discovered in the world (stunt jumps, taxi ranks): ids
//   rides     taxi rides taken as Bruce; jacked: cars taken
// An old save has no `sandbox`: it loads the defaults.
import { registerProgressField } from '../core/save.js';

const ID = /^[a-zA-Z][a-zA-Z0-9_:-]{0,47}$/;
const n = (v, max = 1e9) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0);

export function sanitizeSandboxSave(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    station: typeof r.station === 'string' && ID.test(r.station) ? r.station : 'nightOwl',
    drift: Math.round(n(r.drift)), jump: Math.round(n(r.jump)), air: n(r.air, 60),
    found: Array.isArray(r.found) ? [...new Set(r.found.filter((s) => typeof s === 'string' && ID.test(s)))].slice(0, 64) : [],
    rides: Math.round(n(r.rides, 1e6)), jacked: Math.round(n(r.jacked, 1e6)),
  };
}

registerProgressField('sandbox', { sanitize: sanitizeSandboxSave, fresh: sanitizeSandboxSave({}) });
