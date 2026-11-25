// The Progress page's "Gotham collectibles" category: riddles, hides, city stories and photo spots
// across the new districts. Registered once at import (like src/game/vanChaseSave.js). It only
// counts for saves that have reached the city beyond Night One, so an old in-progress Night One
// save's percentage does not move.
import { tracker } from '../../game/progressTracker.js';
import { COLLECTIBLES, KINDS, placeOf } from './data.js';
import { districtAt, DISTRICT_LABEL } from '../../world/regions/data.js';
import '../save.js';

const STORE = { riddles: 'riddles', hides: 'hides', logs: 'logs', photos: 'photos' };
export const cityReached = (p) => !!p?.finished || (p?.campaign?.nightsDone ?? []).includes('n1');

export function collectCount(p) {
  const c = p?.openworld?.collect ?? {};
  let done = 0, total = 0;
  for (const k of KINDS) {
    const got = new Set(c[STORE[k]] ?? []);
    for (const item of COLLECTIBLES[k]) { total += 1; if (got.has(item.id)) done += 1; }
  }
  return { done, total };
}

// The district with the most still to find.
export function mostIncomplete(p) {
  const c = p?.openworld?.collect ?? {};
  const left = {};
  for (const k of KINDS) {
    const got = new Set(c[STORE[k]] ?? []);
    for (const item of COLLECTIBLES[k]) {
      if (got.has(item.id)) continue;
      const pos = placeOf(k, item);
      const d = item.district ?? districtAt(pos.x, pos.z);
      left[d] = (left[d] ?? 0) + 1;
    }
  }
  let best = null, n = 0;
  for (const [d, v] of Object.entries(left)) if (v > n) { n = v; best = d; }
  return best ? { district: best, left: n } : null;
}

export const CITY_COLLECT_CATEGORY = {
  id: 'cityCollect', label: 'Gotham collectibles', weight: 10,
  active: (p) => cityReached(p),
  count: (p) => collectCount(p),
  detail: (p) => {
    const m = mostIncomplete(p);
    return m ? `Most left in ${DISTRICT_LABEL[m.district] ?? m.district}: ${m.left}` : 'Every riddle, cache, story and photo found';
  },
};
tracker.register(CITY_COLLECT_CATEGORY);
