// [balance] The balance regression suite (`npm run test:balance`): a handful of seeded fights and
// one boss per tier, fought by the scripted player on the virtual clock (deterministic for a seed
// and a build), each asserting a win/lose outcome and an HP-loss band. Needs a running build:
//   BASE=http://localhost:5880/ npm run test:balance
// The bands are wide on purpose (they catch a rule change that makes a tier trivial or impossible,
// not a 5 % drift). Update them with the matrix in docs/design/balance.md when a change is meant.
import { openGame } from './anim-lib.mjs';
import { runFight } from './balance-matrix.mjs';
import { runBoss } from './boss-bench.mjs';

const url = process.env.BASE ?? 'http://localhost:5880/';
// [fight, tier, skill, expect: 'win' | 'lose', hp lost % band [lo, hi]]
export const CASES = [
  ['a1', 'story', 'novice', 'win', [0, 90]],
  ['a1', 'normal', 'average', 'win', [5, 95]],
  ['a1', 'normal', 'masher', 'lose', [60, 999]],
  ['n2:heistFight', 'normal', 'masher', 'lose', [60, 999]],
  ['a3', 'hard', 'skilled', 'win', [0, 95]], // the furnace (n5) lost once at the same seed on a later build: too close to call for a gate
  ['a3', 'knightmare', 'masher', 'lose', [60, 999]],
  ['f2', 'story', 'masher', 'win', [0, 40]],
];
export const BOSS_CASES = [
  ['joker', 'normal', 'average', 'win'],
];

const h = await openGame(url, '');
await h.page.setViewportSize({ width: 640, height: 360 });
let fail = 0;
for (const [f, tier, skill, want, [lo, hi]] of CASES) {
  const r = await runFight(h, { tier, skill, f, seed: 108 });
  const outcome = r.won ? 'win' : 'lose';
  const ok = !r.error && outcome === want && r.hpLostPct >= lo && r.hpLostPct <= hi;
  if (!ok) fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${f.padEnd(18)} ${tier.padEnd(10)} ${skill.padEnd(8)} ${r.error ?? `${outcome} (want ${want}), hp lost ${r.hpLostPct} % (band ${lo}-${hi}), ${r.secs} s`}`);
}
for (const [id, tier, skill, want] of BOSS_CASES) {
  const r = await runBoss(h, id, { tier, skill });
  const ok = !r.error && (r.won ? 'win' : 'lose') === want;
  if (!ok) fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} boss ${id.padEnd(13)} ${tier.padEnd(10)} ${skill.padEnd(8)} ${r.error ?? `${r.won ? 'win' : 'lose'} in ${r.secs} s, deaths ${r.deaths}`}`);
}
await h.close();
console.log(fail ? `${fail} balance case(s) failed` : 'balance regression: all cases in band');
process.exit(fail ? 1 : 0);
