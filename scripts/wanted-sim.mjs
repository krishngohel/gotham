// [balance] Wanted rise and decay on the three "Police pressure" settings (docs/design/balance.md 6),
// from the pure rules (src/wanted/rules.js): how many offences of a kind reach each level, and how
// long a player who breaks line of sight takes to get clear (seen for 3 s, then hidden).
import { createWantedState, stepWanted, addOffence, modifiers, levelForPoints } from '../src/wanted/rules.js';

export function escapeTime(level, difficulty) {
  const mods = modifiers({ difficulty });
  const s = createWantedState();
  const pts = [0, 1, 3, 6, 10, 15][level] + 0.01;
  s.points = pts; s.level = levelForPoints(pts); s.state = level >= 2 ? 'pursuit' : 'noticed';
  const out = [];
  let t = 0;
  for (; t < 3; t += 0.1) stepWanted(s, { dt: 0.1, seen: true, seenAt: { x: 0, z: 0 }, mods }, out);
  let clearAt = null;
  for (let k = 0; k < 3000 && clearAt === null; k++, t += 0.1) { stepWanted(s, { dt: 0.1, seen: false, mods }, out); if (s.state === 'clear') clearAt = t - 3; }
  return clearAt === null ? null : Math.round(clearAt);
}
export function offencesTo(level, offence, difficulty) {
  const mods = modifiers({ difficulty });
  let p = 0, n = 0;
  const target = [0, 1, 3, 6, 10, 15][level];
  while (p < target && n < 100) { p = addOffence(p, offence, { mods }); n++; }
  return n >= 100 ? null : n;
}
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  console.log('pressure    | escape (s) from level 1..5 after 3 s seen | stunned officers to reach 2..5 | public brawls to reach 1');
  for (const d of ['relaxed', 'standard', 'relentless']) console.log(`${d.padEnd(11)} | ${[1, 2, 3, 4, 5].map((l) => escapeTime(l, d)).join(' / ')} | ${[2, 3, 4, 5].map((l) => offencesTo(l, 'stunOfficer', d)).join(' / ')} | ${offencesTo(1, 'publicFight', d)}`);
}
