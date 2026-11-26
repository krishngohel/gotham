// The open world on the Progress page: one category for the side operations (chain missions,
// predator encounters, detective cases), weighted like the old street crimes. It only counts once
// Night One is done, so a save still in Night One keeps exactly the percentage it had; the old
// 'crimes' category (10 stopped) is unchanged, so a finished old save keeps its 100% until it
// reaches content that did not exist when it was made.
import { tracker } from '../game/progressTracker.js';
import { ALL_MISSIONS } from './chains/data.js';
import { STEALTH_ENCOUNTERS } from './stealth/encounters.js';
import { CASES } from './cases/data.js';

const nightOneDone = (p) => !!p.finished || (p.campaign?.nightsDone ?? []).includes('n1');
export const opsCount = (p) => {
  const o = p.openworld ?? {};
  const missions = ALL_MISSIONS.filter((m) => (o.chains?.[m.chain] ?? 0) > m.index).length;
  const stealth = STEALTH_ENCOUNTERS.filter((e) => o.stealth?.[e.id]).length;
  const cases = CASES.filter((c) => o.cases?.[c.id]?.solved).length;
  return { missions, stealth, cases, done: missions + stealth + cases, total: ALL_MISSIONS.length + STEALTH_ENCOUNTERS.length + CASES.length };
};

tracker.register({
  id: 'cityOps', label: 'Side missions, cases and predator ops', weight: 10,
  active: (p) => nightOneDone(p),
  count: (p) => { const c = opsCount(p); return { done: c.done, total: c.total }; },
  detail: (p) => { const c = opsCount(p); return `${c.missions}/${ALL_MISSIONS.length} missions, ${c.cases}/${CASES.length} cases, ${c.stealth}/${STEALTH_ENCOUNTERS.length} predator ops`; },
});
