// [balance] Night lengths n1-n9 for an average player (docs/design/balance.md 5), built from parts
// that were MEASURED where the scripted player can measure them and modelled where it cannot:
//   fights   the median win time of the average bot on Normal for that fight
//            (scripts/balance-matrix.mjs JSON, --matrix); unmeasured fights: seconds per goon from
//            the measured ones, by role mix
//   bosses   the average bot's time from scripts/boss-bench.mjs (--bosses JSON), else 240 s
//   rooms    predator rooms: 30 s per goon (the bot's stealth runs; a careful human is slower)
//   travel   the distance between consecutive objective sites x 1.35 (streets and roofs are not a
//            straight line) at TRAVEL_MPS, the bot's measured mixed run/glide/grapple speed
//   vehicles chases 75 s, battles 110 s (their dev timings; the bot drives Firefly only)
//   story    comics and cinematics from src/story/pacing.js; stand-alone radio at its own pace;
//            talk-over lines overlap travel and are not added
//   other    scans 4 s per point, puzzles 40 s, civvy beats 12 s per beat, collect 8 s per item
//            [m45] armada 100 s (vehicles), hunted 75 s
//   [m23] n2, n3: a case = 10 s per piece of evidence + 40 s at the board + its trail walked at the
//            travel pace + 5 s a trail point; a rescue = its guard fight (as any fight) + per lock
//            its hold + 8 s; an escape from the police 75 s (scripts/wanted-sim.mjs: level 3 clears
//            37 s after they lose you on Standard, plus getting out of sight). All modelled.
// Bot-to-human factor HUMAN_K (fights and bosses only): a person reads the screen, retries, misses
// more than the average profile in a long session; 1.25 from the onboarding playtests' ratio of
// human to scripted fight time (docs/design/balance.md 1). Travel is already a human pace.
//
//   node scripts/night-length.mjs [--matrix file.json] [--bosses file.json] [--json]
import { readFileSync, existsSync } from 'node:fs';
import { allNights, stepsOf } from '../src/story/campaign.js';
import '../src/story/nights/index.js';
import { buildFight } from '../src/story/fightBuilder.js';
import { FIGHTS } from '../src/game/fights.js';
import { SITES } from '../src/world/mapData.js';
import { REGION_SITES } from '../src/world/regions/data.js';
import { pacingReport } from '../src/story/pacing.js';
import { typeDuration, holdDuration } from '../src/ui/radioQueue.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
export const TRAVEL_MPS = Number(process.env.TRAVEL_MPS ?? 9);
export const HUMAN_K = 1.25;
const SEC_PER_GOON = { grunt: 3.2, knife: 4, brute: 9, rifle: 5, shield: 6, baton: 6, pistol: 5, sniper: 8, ninja: 7, heavy: 10, medic: 4, lieutenant: 6, harley: 25 };
const BOSS_FALLBACK = 240;
// [m67] see the mission step types below
const MISSION_PTS = { freeing: (s) => s.points.map((p) => p.site), hack: (s) => s.terminals.map((p) => p.site), caseboard: (s) => s.evidence.map((p) => p.site), escape: (s) => (s.hide ? [s.hide] : []) };
const MISSION_S = { board: 60, escape: { 2: 60, 3: 90 }, tail: 85 };

const load = (f) => (f && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []);
const matrix = load(opt('matrix', null)).filter((r) => r.tier === 'normal' && r.skill === 'average' && r.won);
const bossRuns = load(opt('bosses', null)).filter((r) => r.won && !r.coop);
const fightSecs = new Map();
for (const r of matrix) { const k = r.f.includes(':') ? r.f.split(':')[1] : r.f; fightSecs.set(k, [...(fightSecs.get(k) ?? []), r.secs]); }
const median = (a) => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const BOSS_OF = { n1: 'joker', n2: 'penguin', n3: 'riddler', n4: 'scarecrow', n5: 'freeze', n6: 'ivy', n7: 'firefly', n8: 'blackMask', n9: 'doubleAct' };

export function nightLength(night) {
  const steps = stepsOf(night);
  const named = (id) => (typeof id === 'object' ? id : night.sites?.[id] ?? SITES[id] ?? REGION_SITES[id] ?? null);
  // [m23] a case starts at its scene, a rescue at its first lock (they take no site of their own)
  const site = (s) => { const id = s?.site ?? (s?.type === 'case' ? s.case.scene : s?.type === 'rescue' ? s.captives[0].site : null) ?? s?.checkpoint; if (!id) return null; return named(id); };
  const t = { travel: 0, fight: 0, stealth: 0, vehicle: 0, boss: 0, story: 0, other: 0 };
  let last = site({ site: night.start }) ?? null;
  for (const s of steps) {
    const at = site(s);
    if (at && last && s.type !== 'cutscene') t.travel += (Math.hypot(at.x - last.x, at.z - last.z) * 1.35) / TRAVEL_MPS;
    if (at) last = at;
    // Optional interrupts on the way: an average player takes about 70 % of them (+ 10 s detour).
    for (const it of s.interrupts ?? []) {
      const def = night.fights?.[it.fight];
      if (!def) continue;
      const f = buildFight(it.fight, def, { difficulty: 'normal' });
      t.fight += 0.7 * (10 + f.waves.flat().reduce((a, e) => a + (SEC_PER_GOON[e.type] ?? 4), 0) * HUMAN_K);
    }
    if (s.type === 'fight') {
      const def = night.id === 'n1' ? FIGHTS[s.fight] : night.fights?.[s.fight];
      if (!def) continue;
      const room = def.stealth ? (night.rooms?.[def.stealth] ?? null) : null;
      if (def.stealth || def.squad) { t.stealth += ((room?.squad ?? def.squad ?? def.waves?.[0] ?? []).length || 4) * 30; continue; }
      const m = fightSecs.get(s.id) ?? fightSecs.get(s.fight);
      if (m) { t.fight += median(m) * HUMAN_K; continue; }
      const f = buildFight(s.fight, def, { difficulty: 'normal' });
      t.fight += f.waves.flat().reduce((a, e) => a + (SEC_PER_GOON[e.type] ?? 4), 0) * HUMAN_K;
    } else if (s.type === 'boss') {
      const r = bossRuns.find((b) => b.id === (s.boss ?? BOSS_OF[night.id]));
      t.boss += (r ? r.secs : BOSS_FALLBACK) * HUMAN_K;
    } else if (s.type === 'chase') t.vehicle += 75;
    else if (s.type === 'battle') t.vehicle += 110;
    else if (s.type === 'armada') t.vehicle += 100; // [m45] n4: twelve balloons from the Batwing (its dev timing, like the two above)
    else if (s.type === 'hunted') t.other += 75; // [m45] n4: a level 3 search, about 37 s once lost (docs/design/balance.md 6) plus getting lost
    else if (s.type === 'scan') t.other += 4 * (s.points?.length ?? 1);
    else if (s.type === 'puzzle') t.other += 40;
    else if (s.type === 'civvy') t.other += 12 * (s.beats?.length ?? 3);
    else if (s.type === 'collect') t.other += 8 * (s.items?.length ?? s.points?.length ?? 3);
    else if (s.type === 'fear') t.other += 45;
    else if (s.type === 'traverse') t.other += 10 * (s.gates?.length ?? 2);
    else if (s.type === 'case') {
      // [m23]
      const tr = s.case.trail, pts = [...(tr.points ?? tr.receivers ?? []), ...(tr.target ? [tr.target] : [])].map((q) => named(q.site ?? q)).filter(Boolean);
      let from = at, d = 0;
      for (const q of pts) { d += Math.hypot(q.x - from.x, q.z - from.z); from = q; }
      t.other += 10 * s.case.evidence.length + 40 + 5 * pts.length;
      t.travel += (d * 1.35) / TRAVEL_MPS;
      last = from;
    } else if (s.type === 'rescue') {
      const def = night.fights?.[s.guard];
      if (def) t.fight += buildFight(s.guard, def, { difficulty: 'normal' }).waves.flat().reduce((a, e) => a + (SEC_PER_GOON[e.type] ?? 4), 0) * HUMAN_K;
      t.other += s.captives.length * ((s.hold ?? 2.4) + 8);
    } else if (s.type === 'evade') t.other += 75;
    // [m67] Mission step types (src/story/missions/**), Nights Six and Seven. All MODELLED, from
    // their own rules: the walk between their points at the travel pace, plus
    //   freeing    the hold at each point + 8 s to read the card and pick a route
    //   hack       6 s a terminal (aim, the two-round timing game; by hand it is the 5 s hold)
    //   caseboard  the scan's 4 s a clue + MISSION_S.board on the board (four clue texts, four cards)
    //   escape     MISSION_S.escape[level]: timed by hand in the browser going straight to cover
    //              (docs/design/shots/missions/README.md); a player who runs in the open takes
    //              until the mercy call (130-140 s)
    //   tail       MISSION_S.tail: ten junctions at the sedan's 14 m/s on ~90 m blocks, one retry in three
    // [m67] (the chain continues from the types above)
    else if (MISSION_PTS[s.type]) {
      let at0 = last, walk = 0;
      const pts = (MISSION_PTS[s.type](s) ?? []).map((id) => site({ site: id })).filter(Boolean);
      for (const q of pts) { if (at0) walk += Math.hypot(q.x - at0.x, q.z - at0.z); at0 = q; }
      if (pts.length) last = pts.at(-1);
      t.travel += (walk * 1.35) / TRAVEL_MPS;
      if (s.type === 'freeing') t.other += 8 + pts.length * (s.hold ?? 2.5);
      else if (s.type === 'hack') t.other += 6 * pts.length;
      else if (s.type === 'caseboard') t.other += 4 * pts.length + MISSION_S.board;
      else if (s.type === 'escape') t.other += MISSION_S.escape[s.level ?? 2] ?? 90;
    } else if (s.type === 'tail') t.vehicle += MISSION_S.tail;
    else if (s.type === 'carTail') t.vehicle += 90; // [m23] six junctions at the quarry's 14 m/s, as a chase is 75 s
  }
  const p = pacingReport(steps);
  t.story = p.noAgencySeconds;
  // Talk-over radio while standing still at a beat (fork, dilemma, wait): half its length.
  for (const s of steps) if ((s.type === 'fork' || s.type === 'dilemma' || s.type === 'wait') && s.lines) t.story += s.lines.reduce((a, l) => a + typeDuration(l.text ?? '') + holdDuration(l.text ?? ''), 0) * 0.5;
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  return { id: night.id, steps: steps.length, ...Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)])), total: Math.round(total) };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const rows = allNights().map(nightLength);
  if (args.includes('--json')) { console.log(JSON.stringify(rows, null, 1)); process.exit(0); }
  const m = (s) => (s / 60).toFixed(1);
  console.log('night steps | travel fight stealth vehicle boss story other | total min');
  for (const r of rows) console.log(`${r.id.padEnd(3)} ${String(r.steps).padStart(5)} | ${[r.travel, r.fight, r.stealth, r.vehicle, r.boss, r.story, r.other].map(m).map((x) => x.padStart(5)).join(' ')} | ${m(r.total)}`);
  console.log(`all nights: ${m(rows.reduce((a, r) => a + r.total, 0))} min`);
}
