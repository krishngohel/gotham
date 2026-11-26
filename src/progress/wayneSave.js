// The saved WayneTech state (progress.wayne): XP, owned skill nodes, and the best medal already
// paid for per challenge. Registers itself at load (import before loadProgress). Pure.
//
// [prog] Wave 3: `owned` may hold any skill-tree node id (src/progress/skillTree.js); the 20 old
// ids keep their place. The shape stays { xp, owned, medals } so every old save and old test
// reads the same; the tree's own bookkeeping lives in progress.skills (below).
import { registerProgressField, MEDALS } from '../core/save.js';
import { tracker } from '../game/progressTracker.js';
import { UPGRADE_IDS } from './upgrades.js';
import { NODES, nodeById, closeOwned, xpSpent } from './skillTree.js';
import { XP_PER_LEVEL, pointsEarned } from './xp.js';

const ID = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
const NODE_SET = new Set(NODES.map((x) => x.id));

// The most points a save can have paid for: the old flat curve or the new one, whichever is more
// (an old save's extra points become progress.skills.bonusPoints at load; see migrateSkills).
const pointsCap = (xp, bonus = 0) => Math.max(Math.floor(xp / XP_PER_LEVEL), pointsEarned(xp)) + bonus;

export function sanitizeWayneSave(raw, bonus = 0) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const xp = typeof r.xp === 'number' && Number.isFinite(r.xp) && r.xp > 0 ? Math.floor(Math.min(r.xp, 1e7)) : 0;
  const want = Array.isArray(r.owned) ? r.owned.filter((id, i, a) => typeof id === 'string' && NODE_SET.has(id) && a.indexOf(id) === i).slice(0, 256) : [];
  // Prerequisites first, then never more XP nodes than the XP paid for: drop from the end of the
  // purchase order, then close again so nothing is left without its prerequisite.
  let keep = closeOwned(want);
  keep = want.filter((id) => keep.includes(id));
  const cap = pointsCap(xp, typeof bonus === 'number' ? bonus : 0);
  while (xpSpent(keep) > cap) {
    let i = keep.length - 1;
    while (i >= 0 && nodeById(keep[i]).currency !== 'xp') i--;
    if (i < 0) break;
    keep.splice(i, 1);
    const closed = closeOwned(keep);
    keep = keep.filter((id) => closed.includes(id));
  }
  const owned = closeOwned(keep);
  const medals = {};
  if (r.medals && typeof r.medals === 'object' && !Array.isArray(r.medals)) {
    for (const [id, m] of Object.entries(r.medals).slice(0, 32)) if (ID.test(id) && MEDALS.includes(m)) medals[id] = m;
  }
  return { xp, owned, medals };
}

registerProgressField('wayne', { sanitize: (raw) => sanitizeWayneSave(raw) });

// progress.skills: the tree's bookkeeping.
//   curve        2 once the save has been moved onto the wave 3 XP curve (0: not yet)
//   bonusPoints  free points: an old save's difference between the flat and new curves, and
//                'skillPoint' campaign rewards
//   respecAct    the act in which the free Batcave respec was last used (0: never)
//   rewards      campaign reward ids already paid (so a replayed reward never pays twice)
export function sanitizeSkills(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const int = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);
  const rewards = Array.isArray(r.rewards) ? [...new Set(r.rewards.filter((s) => typeof s === 'string' && /^[a-zA-Z][a-zA-Z0-9.:-]{0,47}$/.test(s)))].slice(0, 256) : [];
  return { curve: r.curve === 2 ? 2 : 0, bonusPoints: int(r.bonusPoints, 1000), respecAct: int(r.respecAct, 99), rewards };
}
registerProgressField('skills', { sanitize: sanitizeSkills });

tracker.register({
  id: 'wayneTech', label: 'WayneTech upgrades', weight: 5,
  count: (p) => ({ done: p.wayne.owned.filter((id) => UPGRADE_IDS.includes(id)).length, total: UPGRADE_IDS.length }),
  detail: (p) => `Level ${pointsEarned(p.wayne.xp) + 1}, ${p.wayne.owned.length} skills built`,
});
