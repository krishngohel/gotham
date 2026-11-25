// Experience points: what play pays, levels and upgrade points. Pure.
export const XP_PER_LEVEL = 1000;

// Flat amounts per event. Part H events (crateOpened, missionDone) are listed now so its modules
// only emit them.
export const XP = {
  ko: 10, takedown: 40, special: 25, counter: 5, fightDone: 100, objectiveDone: 25,
  trophy: 150, crimeStopped: 200, glassBroken: 50, wallBroken: 50,
  chainPerGoon: 50, swarmPerGoon: 60, crateOpened: 200, missionDone: 500,
  vanChaseStopped: 200, // a free-roam side chase won: the same payout as a street crime stopped
  campaignMission: 300, // [balance] a story mission finished (scripts/economy-sim.mjs)
};
// A medal's worth; a better medal pays the difference.
export const MEDAL_XP = { bronze: 150, silver: 300, gold: 500 };

// [prog] The curve for a much longer campaign (docs/design/progression.md "Pacing"): 1,000 XP per
// level for the first ten levels (Night One plays exactly as before), then +50 per level up to
// 1,400 from level 18 on. An old save keeps every point it had: see legacyBonus() and wayneSave.js.
export const FLAT_LEVELS = 10;
export const XP_STEP = 50;
export const XP_CAP = 1400;
// XP it takes to go from `level` to `level + 1`.
export function xpForLevel(level) {
  if (level <= FLAT_LEVELS) return XP_PER_LEVEL;
  return Math.min(XP_CAP, XP_PER_LEVEL + XP_STEP * (level - FLAT_LEVELS));
}
const RAMP_END = FLAT_LEVELS + (XP_CAP - XP_PER_LEVEL) / XP_STEP; // the first level that costs the cap
const startOf = (() => {
  const t = [0, 0];
  for (let l = 1; l <= RAMP_END; l++) t[l + 1] = t[l] + xpForLevel(l);
  return t; // t[l] = XP at which level l starts, for l <= RAMP_END + 1
})();
// Total XP at which `level` starts (level 1 starts at 0).
export function levelStart(level) {
  if (level <= RAMP_END + 1) return startOf[Math.max(1, level)];
  return startOf[RAMP_END + 1] + (level - RAMP_END - 1) * XP_CAP;
}
export function levelOf(xp) {
  const x = Math.max(0, xp);
  const top = startOf[RAMP_END + 1];
  if (x >= top) return RAMP_END + 1 + Math.floor((x - top) / XP_CAP);
  let l = 1;
  while (startOf[l + 1] <= x) l++;
  return l;
}
export const pointsEarned = (xp) => levelOf(xp) - 1;
export const pointsFree = (xp, spent, bonus = 0) => Math.max(0, pointsEarned(xp) + bonus - spent);
// Points an old save (flat 1,000 XP per point) had that the new curve would not give it.
export const legacyBonus = (xp) => Math.max(0, Math.floor(Math.max(0, xp) / XP_PER_LEVEL) - pointsEarned(xp));

export function toNext(xp) {
  const l = levelOf(xp);
  const into = Math.max(0, xp) - levelStart(l);
  const size = xpForLevel(l);
  return { into, need: size - into, fraction: into / size };
}

// A finished combo: 4 per hit from 5 hits up, plus 20 per different move beyond two.
export function comboXp(peak, variety) {
  if (peak < 5) return 0;
  return 4 * peak + 20 * Math.max(0, variety - 2);
}

export function chainXp(count, stealth) {
  return Math.round(XP.chainPerGoon * count * (stealth ? 1.5 : 1));
}

export function medalXp(prev, next) {
  return Math.max(0, (MEDAL_XP[next] ?? 0) - (MEDAL_XP[prev] ?? 0));
}

export function levelsCrossed(before, after) {
  const a = levelOf(before), b = levelOf(after);
  const out = [];
  for (let l = a + 1; l <= b; l++) out.push(l);
  return out;
}

// One combo run: the highest count and the set of moves used, closed when the combo ends.
export function createComboRun() {
  let peak = 0;
  const moves = new Set();
  return {
    get peak() { return peak; },
    note(move, value) { if (value > peak) peak = value; if (move) moves.add(move); },
    close() {
      const r = { peak, variety: moves.size };
      peak = 0;
      moves.clear();
      return r;
    },
  };
}
