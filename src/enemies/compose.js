// Encounter composition: which enemies make up a wave. Pure and deterministic given the rng, so a
// content workstream (story, crimes, side missions) can ask for "a fight worth 8 in the Narrows in
// act 3" and get the same squad every time for the same seed.
//
//   composeWave({ budget, district = 'core', act = 1, players = 1, difficulty = 'normal', rng, gang })
//     -> { gang, list: [{ type }] }
//
// Rules (research doc 3.2 and 3.5: introduce a role, test it alone, then combine; difficulty from
// the mix, never from health):
// - each type costs ROLE_COST; the list's summed cost never exceeds the budget;
// - act 1 uses only the story's original types (grunt, knife, brute, rifle); each later act unlocks
//   two roles (ACT_ROLES), and a wave uses at most one of the roles new to its act;
// - at most 2 ranged enemies; a medic only with at least 3 others; a lieutenant only with 4 or more
//   others, and at most one;
// - co-op: budget x1.5 for two players (the count grows, not the health) and one more special;
// - harder difficulty leans the mix toward specials.
// The types are the enemy.js / rules.js ENEMY names, so the result can go straight to spawn().
export const ROLE_COST = {
  grunt: 1, knife: 1.5, shield: 2, baton: 2, pistol: 2, rifle: 2.5, sniper: 3, ninja: 3, heavy: 3.5, brute: 3.5, medic: 2, lieutenant: 3,
};
export const BASE_ROLES = ['grunt', 'knife', 'brute', 'rifle'];
export const ACT_ROLES = { 2: ['shield', 'baton'], 3: ['pistol', 'medic'], 4: ['ninja', 'sniper'], 5: ['heavy', 'lieutenant'] };
export const RANGED = new Set(['rifle', 'pistol', 'sniper']);
// How often a slot goes to a special (anything but a grunt), by difficulty.
const SPECIAL_BIAS = { story: 0.2, normal: 0.4, hard: 0.6, knightmare: 0.75 };
// District -> gang (ids from src/heroes/models/enemies.js GANGS; workstream H may extend this).
export const DISTRICT_GANG = {
  core: 'joker', river: 'penguin', lowerGotham: 'blackMask', loop: 'twoFace', gothamMile: 'penguin',
  park: 'ivy', lakefront: 'ivy', museum: 'riddler', amusement: 'joker', narrows: 'scarecrow', parkRow: 'blackMask',
  chinatown: 'blackMask', yards: 'firefly', bristol: 'riddler', arkham: 'joker',
};

// Every role a wave in `act` may draw from.
export function rolesForAct(act = 1) {
  const out = [...BASE_ROLES];
  for (let a = 2; a <= Math.min(5, act); a++) out.push(...ACT_ROLES[a]);
  return out;
}

export function composeWave({ budget, district = 'core', act = 1, players = 1, difficulty = 'normal', rng, gang = null } = {}) {
  const rand = () => (rng ? rng.next() : Math.random());
  const pickFrom = (a) => a[Math.floor(rand() * a.length)];
  const coop = players > 1;
  let left = Math.max(0, (Number(budget) || 0) * (coop ? 1.5 : 1));
  const bias = SPECIAL_BIAS[difficulty] ?? SPECIAL_BIAS.normal;
  // At most one of this act's new roles appears in a wave (chosen up front).
  const fresh = act >= 2 && act <= 5 ? pickFrom(ACT_ROLES[act]) : null;
  const older = rolesForAct(act > 5 ? 5 : act - 1).filter((r) => r !== 'grunt');
  const specials = act >= 2 ? (fresh ? [...older, fresh] : older) : BASE_ROLES.filter((r) => r !== 'grunt');
  const maxSpecials = Math.floor((Number(budget) || 0) / 3) + 1 + (coop ? 1 : 0);
  const list = [];
  let nSpecial = 0, nRanged = 0, nBrute = 0;
  const allowed = (r) => {
    if (ROLE_COST[r] > left) return false;
    if (RANGED.has(r) && nRanged >= 2) return false;
    if ((r === 'brute' || r === 'heavy') && nBrute >= 2) return false;
    if (r === 'lieutenant' && list.some((x) => x.type === 'lieutenant')) return false;
    if (r === 'medic' && list.some((x) => x.type === 'medic')) return false;
    return true;
  };
  for (let guard = 0; guard < 64 && left >= ROLE_COST.grunt; guard++) {
    let type = 'grunt';
    if (nSpecial < maxSpecials && rand() < bias) {
      const ok = specials.filter(allowed);
      if (ok.length) type = pickFrom(ok);
    }
    list.push({ type });
    left -= ROLE_COST[type];
    if (type !== 'grunt') nSpecial += 1;
    if (RANGED.has(type)) nRanged += 1;
    if (type === 'brute' || type === 'heavy') nBrute += 1;
  }
  // Support roles need a squad to support: a medic with fewer than 3 others, or a lieutenant with
  // fewer than 4, becomes a grunt (cheaper, so the budget still holds).
  for (const e of list) {
    if (e.type === 'medic' && list.length - 1 < 3) e.type = 'grunt';
    if (e.type === 'lieutenant' && list.length - 1 < 4) e.type = 'grunt';
  }
  return { gang: gang ?? DISTRICT_GANG[district] ?? 'joker', list };
}

// The summed cost of a composed list (for tests and debugging).
export const waveCost = (list) => list.reduce((s, e) => s + (ROLE_COST[e.type] ?? 1), 0);
