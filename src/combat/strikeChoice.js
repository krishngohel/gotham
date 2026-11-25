// Which strike plays next in freeflow: pure, so the variety rules are unit-testable.
//
// Punches: each place in a chain draws from its own set (openers, then hooks and crosses, then
// uppercuts), never the same clip twice running, an elbow instead of a cross when she's close.
// The chain's fourth blow is a finisher, rotating through three big ones. Kicks cycle front,
// roundhouse, side and low (a knee or a front kick at point-blank range), and the kick chain's
// third blow rotates through the spinning heel kick, the axe kick and the front flip kick. A clip the build doesn't
// have (`has(clip)` false) is skipped for one that it does.

export const PUNCH_TIERS = [
  ['Punch_Jab', 'Punch_Cross', 'Punch_BodyJab'],
  ['Punch_Cross', 'Punch_Hook_L', 'Punch_Jab', 'Punch_ShortHook', 'Punch_BodyHook'],
  ['Punch_Uppercut', 'Punch_Hook_L', 'Punch_Cross', 'Punch_LeadUppercut', 'Elbow_Head'],
];
export const PUNCH_FINISHERS = ['Melee_Hook', 'Punch_Backfist', 'Punch_Hammer'];
export const KICKS = ['Kick_Front', 'Kick_Push', 'Kick_Round', 'Kick_Low', 'Kick_Side', 'Knee_Muay'];
export const KICK_FINISHERS = ['Kick_Spin', 'Kick_Axe', 'Kick_Flip'];
export const CLOSE = 1.2;       // closer than this, an elbow instead of a cross
export const POINT_BLANK = 1.3; // closer than this, no stepping kicks

// tables: a kit's strike tables (src/combat/kitMoves.js); defaults are the lists above.
export function createStrikeChooser({ has = () => true, random = Math.random, tables = null } = {}) {
  let last = '', kickIdx = 0, finIdx = 0, kickFinIdx = 0, closeIdx = 0;
  const TIERS = tables?.punchTiers ?? PUNCH_TIERS, KICK_LIST = tables?.kicks ?? KICKS;
  const PFIN = tables?.finishers?.punch ?? PUNCH_FINISHERS, KFIN = tables?.finishers?.kick ?? KICK_FINISHERS;
  const firstHad = (list, fallback) => list.find(has) ?? fallback;
  return {
    // n: this punch's place in the chain (1, 2, 3); range: metres to the target.
    punch(n, range) {
      const tier = TIERS[Math.min(TIERS.length, Math.max(1, n)) - 1]
        .map((c) => (c === 'Punch_Cross' && range < CLOSE && n > 1 ? 'Elbow_Strike' : c))
        .filter(has);
      const options = tier.filter((c) => c !== last);
      const pool = options.length ? options : tier;
      last = pool.length ? pool[Math.floor(random() * pool.length)] : 'Punch_Jab';
      return last;
    },
    punchFinisher() {
      for (let i = 0; i < PFIN.length; i++) {
        const c = PFIN[finIdx++ % PFIN.length];
        if (has(c)) return c;
      }
      return 'Melee_Hook';
    },
    kick(range) {
      if (range < POINT_BLANK) return closeIdx++ % 2 ? firstHad(['Knee_Strike'], 'Kick_Front') : 'Kick_Front';
      for (let i = 0; i < KICK_LIST.length; i++) {
        const c = KICK_LIST[kickIdx++ % KICK_LIST.length];
        if (has(c)) return c;
      }
      return 'Kick_Front';
    },
    kickFinisher() {
      for (let i = 0; i < KFIN.length; i++) {
        const c = KFIN[kickFinIdx++ % KFIN.length];
        if (has(c)) return c;
      }
      return 'Kick_Spin';
    },
  };
}
