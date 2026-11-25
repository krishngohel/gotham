// [balance] Campaign economy over the nine nights (docs/design/balance.md 6): XP and skill points
// per night from what each night actually contains (its fights' squads as buildFight composes them
// on Normal, its steps, missions, bosses, optional objectives), the fight-side numbers a scripted
// average player produces (counters, combos, specials per goon, measured by
// scripts/balance-matrix.mjs), side content at a typical rate, and Wayne credit from the double
// life's banking rule. Pure: no browser.
//
//   node scripts/economy-sim.mjs [--json]
import { allNights, stepsOf } from '../src/story/campaign.js';
import '../src/story/nights/index.js';
import { buildFight } from '../src/story/fightBuilder.js';
import { FIGHTS } from '../src/game/fights.js';
import { XP, levelOf, comboXp } from '../src/progress/xp.js';
import { NODES } from '../src/progress/skillTree.js';
import { WAYNE_BANK_PER } from '../src/bruce/doubleLife.js';

// Per goon / per fight, from the average bot on Normal (balance-matrix runs, median): about one
// counter per 1.6 goons, one combo of ~8 hits with 3-4 different moves per fight wave, one special
// every two fights. Side content a typical player does per night between story steps.
export const PLAY = { countersPerGoon: 0.6, combosPerWave: 1, comboPeak: 8, comboVariety: 4, specialsPerFight: 0.5, stealthTakedownShare: 0.8 };
export const SIDE_PER_NIGHT = { crimes: 2, caches: 1, medals: 0.6 };

export function nightXp(night) {
  const steps = stepsOf(night);
  let goons = 0, fights = 0, waves = 0, stealthGoons = 0, bosses = 0;
  const missions = new Set();
  for (const s of steps) {
    if (s.mission) missions.add(s.mission);
    if (s.type === 'boss') bosses += 1;
    if (s.type !== 'fight') continue;
    const def = night.id === 'n1' ? FIGHTS[s.fight] : night.fights?.[s.fight];
    if (!def) continue;
    fights += 1;
    if (def.stealth || def.squad) { const n = (night.rooms?.[def.stealth]?.squad ?? def.squad ?? def.waves?.[0] ?? []).length || 4; stealthGoons += n; continue; }
    const f = buildFight(s.fight, def, { difficulty: 'normal' });
    for (const w of f.waves) { waves += 1; goons += w.length; }
  }
  const optional = steps.filter((s) => s.optional).length;
  const xp = {
    kos: goons * XP.ko,
    counters: Math.round(goons * PLAY.countersPerGoon) * XP.counter,
    combos: waves * PLAY.combosPerWave * comboXp(PLAY.comboPeak, PLAY.comboVariety),
    specials: Math.round(fights * PLAY.specialsPerFight) * XP.special,
    stealth: Math.round(stealthGoons * PLAY.stealthTakedownShare) * XP.takedown + Math.round(stealthGoons * (1 - PLAY.stealthTakedownShare)) * XP.ko,
    fightsDone: fights * XP.fightDone,
    objectives: steps.length * XP.objectiveDone,
    missions: missions.size * XP.campaignMission,
    optional: optional * 150,
    side: SIDE_PER_NIGHT.crimes * XP.crimeStopped + SIDE_PER_NIGHT.caches * 200 + Math.round(SIDE_PER_NIGHT.medals * 300),
  };
  const total = Object.values(xp).reduce((a, b) => a + b, 0);
  return { id: night.id, steps: steps.length, fights, goons, stealthGoons, bosses, missions: missions.size, xp, total };
}

export function campaign() {
  let cum = 0;
  const rows = [];
  for (const n of allNights()) {
    const r = nightXp(n);
    cum += r.total;
    rows.push({ ...r, cumXp: cum, points: levelOf(cum) - 1 });
  }
  const shared = NODES.filter((n) => !n.heroes && n.currency === 'xp');
  const xpCost = shared.reduce((s, n) => s + n.cost, 0);
  const actCost = [1, 2, 3, 4, 5].map((a) => shared.filter((n) => n.act <= a).reduce((s, n) => s + n.cost, 0));
  const wayne = NODES.filter((n) => n.currency === 'standing');
  // Wayne credit: one day between each pair of nights (8 days); Standing typically 55-75.
  const credit = [55, 60, 62, 65, 68, 70, 72, 74].map((st) => Math.floor(st / WAYNE_BANK_PER));
  return { rows, xpCost, actCost, wayneCost: wayne.reduce((s, n) => s + n.cost, 0), wayneNodes: wayne.map((n) => `${n.id}:${n.cost}`), credit, creditTotal: credit.reduce((a, b) => a + b, 0) };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const c = campaign();
  if (process.argv.includes('--json')) { console.log(JSON.stringify(c, null, 1)); process.exit(0); }
  console.log('night | steps fights goons stealth bosses missions | XP night | XP total | points');
  for (const r of c.rows) console.log(`${r.id.padEnd(3)} | ${String(r.steps).padStart(3)} ${String(r.fights).padStart(3)} ${String(r.goons).padStart(4)} ${String(r.stealthGoons).padStart(3)} ${r.bosses} ${r.missions} | ${String(r.total).padStart(6)} | ${String(r.cumXp).padStart(6)} | ${r.points}`);
  console.log(`skill tree (shared XP nodes): ${c.xpCost} points; affordable by act gate: ${c.actCost.join(' / ')}`);
  console.log(`Wayne branch: ${c.wayneCost} credit (${c.wayneNodes.join(' ')}); banked over 8 days: ${c.credit.join('+')} = ${c.creditTotal}`);
}
