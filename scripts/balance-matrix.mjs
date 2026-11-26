// [balance] The difficulty matrix: a fixed set of story fights (Night One and later nights, with the
// new roles), each fought by the scripted player (scripts/lib/player-bot.mjs) at several skills on
// each difficulty tier, on the virtual clock (scripts/anim-lib.mjs: deterministic per seed).
//
// Staging (not an assist, and the same for every run): the page opens at the fight's step, comics
// are skipped, and the hero is placed 5 m outside the squad's centre facing it, so every run starts
// the same fight from the same spot. From then on everything is real input: no winFight, no god
// mode, no teleport. A run ends at fightDone (win), the first heroDown (a loss: a person would
// retry from the checkpoint) or LIMIT game seconds (timeout, counted as a loss).
//
//   node scripts/balance-matrix.mjs [url] [--tiers story,normal] [--skills novice,average]
//        [--fights f1,n5:n5FurnaceFight] [--seeds 2] [--workers 3] [--out file.json]
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGame } from './anim-lib.mjs';
import { installBot, setMode, botStats } from './lib/player-bot.mjs';

const args = process.argv.slice(2);
const url = args[0] && !args[0].startsWith('--') ? args.shift() : 'http://localhost:5880/';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
// The fixed set (docs/design/balance.md 2): eight Night One fights, eight from later nights.
export const FIGHT_SET = [
  'f1', 'f2', 'n2', 'a1', 'harleyFight', 'a3', 'plazaFight', 'funhouseFight',
  'n2:heistFight', 'n3:bankFight', 'n4:n4GymFight', 'n5:n5FurnaceFight', 'n5:n5WorkersFight', 'n6:n6FountainFight', 'n7:n7LowerFight', 'n8:n8Market',
];
// Which skills matter on which tier (the targets in the brief).
const PLAN = { story: ['novice', 'average', 'masher'], normal: ['novice', 'average', 'skilled', 'masher'], hard: ['average', 'skilled', 'masher'], knightmare: ['average', 'skilled', 'masher'] };
const tiers = opt('tiers', 'story,normal,hard,knightmare').split(',');
const skillsArg = opt('skills', null)?.split(',');
const fights = opt('fights', null)?.split(',') ?? FIGHT_SET;
const seeds = Number(opt('seeds', 1));
const workers = Number(opt('workers', 1)); // one browser at a time (shared machine)
const LIMIT = Number(process.env.LIMIT ?? 180);
const out = opt('out', join(tmpdir(), 'balance-matrix.json'));

const jobs = [];
const combos = opt('combos', null)?.split(',').map((c) => c.split(':')) ?? tiers.flatMap((t) => (skillsArg ?? PLAN[t]).map((k) => [t, k]));
for (const f of fights) for (const [tier, skill] of combos) for (let s = 1; s <= seeds; s++) jobs.push({ tier, skill, f, seed: s * 101 + 7 });
// Grouped by night (one page load per night per worker).
jobs.sort((a, b) => (a.f.includes(':') ? a.f.split(':')[0] : 'n1').localeCompare(b.f.includes(':') ? b.f.split(':')[0] : 'n1'));

export async function runFight(h, { tier, skill, f, seed, limit = LIMIT }) {
  const [night, at] = f.includes(':') ? f.split(':') : ['n1', f];
  const q = night === 'n1' ? `?at=${at}&quality=potato` : `?new=1&night=${night}&at=${at}&bruceDays=0&quality=potato`;
  const T0 = Date.now(), lap = (w) => process.env.PROFILE && console.log('  ', f, w, ((Date.now() - T0) / 1000).toFixed(1));
  // One page load per night: later fights of the same night jump the story back to their step
  // (flow.jumpTo, the dev path that resets the step and its fight exactly as a load would).
  if (h.night !== night || h.runs >= 12 || process.env.JUMP !== '1') {
    await h.page.evaluate((d) => { try { const k = 'gotham-settings-v1'; const s = JSON.parse(localStorage.getItem(k) ?? '{}'); s.difficulty = d; localStorage.setItem(k, JSON.stringify(s)); } catch { /* fresh */ } }, tier).catch(() => {});
    await h.goto(q);
    h.night = night; h.runs = 0;
    lap('loaded');
    await h.skipStaged(60, 3);
    await h.packs();
  } else {
    await h.run();
    await h.page.evaluate((at) => { const G = window.__game; G.combat.enemies.forEach((e) => { e.alive && (e.alive = e.alive); }); window.__bot && (window.__bot.mode = 'off'); G.jump(at); }, at);
    await h.page.waitForTimeout(400);
    await h.freeze();
  }
  h.runs += 1;
  await h.page.evaluate((d) => { const G = window.__game; G.settings.difficulty = d; G.combat.setDifficulty(d); const m = d === 'story' ? 150 : 100; G.hero.maxHealth = m; G.hero.health = m; G.hero.dead = false; }, tier);
  await h.skipStaged(60, 3);
  lap('packs');
  await h.seed(seed);
  let started = false;
  for (let k = 0; k < 60 && !started; k++) { await h.step(15); await h.skipStaged(5); started = await h.page.evaluate(() => window.__game.enemies.some((e) => e.alive)); }
  if (!started) return { tier, skill, f, seed, error: 'no fight' };
  await h.page.evaluate(() => {
    const G = window.__game, live = G.enemies.filter((e) => e.alive);
    let x = 0, z = 0; for (const e of live) { x += e.pos.x; z += e.pos.z; }
    x /= live.length; z /= live.length;
    const e0 = live[0], dx = G.hero.pos.x - x, dz = G.hero.pos.z - z, d = Math.hypot(dx, dz) || 1;
    G.hero.teleport({ x: x + (dx / d) * 5, y: e0.pos.y, z: z + (dz / d) * 5 }, Math.atan2(-dx, -dz));
    G.follow.snapBehind?.(Math.atan2(-dx, -dz), 0.2);
    window.__fd = { done: false, deaths: 0, start: window.__v.frame, n: live.length };
    G.events.on('fightDone', () => { window.__fd.done = true; });
  });
  lap('staged');
  await h.page.evaluate(observeSquad);
  await installBot(h.page, { skill, seed, reuse: true });
  await setMode(h.page, 'fight');
  let s;
  while (true) {
    await h.step(30);
    await h.skipStaged(2);
    s = await h.page.evaluate(() => { const G = window.__game, F = window.__fd, B = window.__bot; return { done: F.done, dead: G.hero.dead || B.stats.deaths > 0, t: (window.__v.frame - F.start) / 60, hp: G.hero.health, max: G.hero.maxHealth }; });
    if (s.done || s.dead || s.t > limit) break;
  }
  lap('fought ' + s.t.toFixed(0) + ' game s');
  // A death leaves the story on its retry screen: the next run loads the page fresh.
  if (s.dead || !s.done) h.night = null;
  const st = await botStats(h.page);
  const ob = await h.page.evaluate(() => window.__obs?.report?.() ?? null);
  return { tier, skill, f, seed, won: s.done && !s.dead, died: s.dead, timeout: !s.done && !s.dead, secs: +s.t.toFixed(1), hpLost: Math.round(st.hpLost), hpLostPct: Math.round((st.hpLost / s.max) * 100), counters: st.counters, missed: st.counterMiss, dodges: st.dodges, capes: st.capes, presses: st.presses, hits: st.hits, byKind: st.byKind, obs: ob };
}

async function worker(id, queue, results) {
  let h = await openGame(url, '', {});
  await h.page.setViewportSize({ width: 640, height: 360 });
  while (queue.length) {
    const job = queue.shift();
    let r;
    // A real-time watchdog: a run that hangs (a frame budget that never drains) is an error, and
    // the browser is restarted for the next run.
    let timer;
    const dog = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('watchdog: run hung')), Number(process.env.WATCHDOG ?? 420) * 1000); });
    try { r = await Promise.race([runFight(h, job), dog]); } catch (e) { r = { ...job, error: String(e.message ?? e).split('\n')[0].slice(0, 120) }; }
    clearTimeout(timer);
    if (r.error) {
      if (h.errors.length) console.log(`[w${id}] page errors:`, [...new Set(h.errors)].slice(-3).join(' | '));
      try { await h.close(); } catch { /* gone */ }
      h = await openGame(url, ''); await h.page.setViewportSize({ width: 640, height: 360 });
    }
    results.push(r);
    console.log(`[w${id}] ${r.tier.padEnd(10)} ${r.skill.padEnd(8)} ${r.f.padEnd(18)} ${r.error ? 'ERROR ' + r.error : `${r.won ? 'won ' : r.died ? 'DIED' : 'TIME'} ${String(r.secs).padStart(6)} s  hp lost ${String(r.hpLostPct).padStart(3)} %  c${r.counters}/m${r.missed} d${r.dodges} cape${r.capes}`}`);
  }
  if (h.errors.length) console.log(`[w${id}] page errors:`, [...new Set(h.errors)].slice(0, 5).join(' | '));
  await h.close();
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const queue = [...jobs], results = [];
  await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, (_, i) => worker(i, queue, results)));
  const med = (a) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
  console.log('\ntier       skill     fights  win%  median hp lost %  deaths  median secs (won)');
  for (const [tier, skill] of combos) {
    const rs = results.filter((r) => r.tier === tier && r.skill === skill && !r.error);
    if (!rs.length) continue;
    const won = rs.filter((r) => r.won);
    console.log(`${tier.padEnd(10)} ${skill.padEnd(9)} ${String(rs.length).padStart(6)} ${String(Math.round((won.length / rs.length) * 100)).padStart(5)} ${String(med(rs.map((r) => r.hpLostPct))).padStart(17)} ${String(rs.filter((r) => r.died).length).padStart(7)} ${String(med(won.map((r) => r.secs))).padStart(12)}`);
  }
  writeFileSync(out, JSON.stringify(results, null, 1));
  console.log('wrote', out);
}

// [balance] Goon behaviour, observed in play (docs/design/balance.md 4): event counts and, every
// ten frames, each goon's state, so a goon stuck in one state (stunned, idle while aware, a flee
// that stopped moving) shows up as the longest run in that state.
export function observeSquad() {
  const G = window.__game;
  if (!window.__obs) {
    const O = window.__obs = { ev: {}, runs: new Map(), longest: {}, reset() { this.ev = {}; this.runs.clear(); this.longest = {}; } };
    for (const k of ['callReinforcements', 'weaponDrop', 'weaponPickup', 'revived', 'fled', 'riposte', 'grab', 'takedown', 'zipTie', 'bark', 'counter', 'tokenSteal', 'backoff', 'surrender']) G.events.on(k, () => { O.ev[k] = (O.ev[k] ?? 0) + 1; });
    let n = 0;
    window.__v.after.push(() => {
      if (++n % 10) return;
      for (const e of G.combat.enemies) {
        if (!e.alive || e.def?.boss) continue;
        let r = O.runs.get(e);
        const st = e.state + (e.mood && e.mood !== 'calm' ? ':' + e.mood : '');
        if (!r || r.st !== st) { r = { st, t: 0, x: e.pos.x, z: e.pos.z, moved: 0 }; O.runs.set(e, r); }
        r.t += 10 / 60;
        r.moved += Math.hypot(e.pos.x - r.x, e.pos.z - r.z); r.x = e.pos.x; r.z = e.pos.z;
        const key = e.type + '/' + st;
        if (!O.longest[key] || O.longest[key].t < r.t) O.longest[key] = { t: +r.t.toFixed(1), moved: +r.moved.toFixed(1) };
        O.ev['state:' + st] = (O.ev['state:' + st] ?? 0) + 1;
        if (e.def?.revive && e.reviving) O.ev.reviving = (O.ev.reviving ?? 0) + 1;
        if (e.backoffT > 0) O.ev.backingOff = (O.ev.backingOff ?? 0) + 1;
        if (e.weapon && !e.def?.ranged && e.type === 'grunt') O.ev.armedGrunt = (O.ev.armedGrunt ?? 0) + 1;
        if (e.nextInLine) O.ev.nextInLine = (O.ev.nextInLine ?? 0) + 1;
      }
    });
    O.report = () => ({ ev: O.ev, longest: Object.fromEntries(Object.entries(O.longest).filter(([k, v]) => v.t > 6 && !/engage|idle|patrol|look|ko|down/.test(k))) });
  }
  window.__obs.reset();
}
