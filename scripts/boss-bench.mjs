// [balance] Every boss fought by the scripted player (scripts/lib/player-bot.mjs) on the virtual
// clock, without cheats: no debugWin, no winFight, no god mode. A death restarts the phase reached
// (the boss director's checkpoint), as it does for a person; the run goes on until the boss is
// beaten, MAX_DEATHS deaths, or LIMIT game seconds.
//
// Staging (the same every run, not an assist): campaign bosses open at their story step; the four
// side-chain bosses are started directly through the boss director at their arena (their chain's
// earlier steps are not part of the boss), the hero placed at the arena edge. Firefly is fought
// from the Batmobile: the bot drives it with the vehicle API's own pilot (counted, see below).
//
//   node scripts/boss-bench.mjs [url] [--bosses joker,penguin] [--skill average] [--tier normal]
//        [--p2 bot] [--workers 2] [--out file.json]
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGame } from './anim-lib.mjs';
import { installBot, setMode, botStats } from './lib/player-bot.mjs';

const args = process.argv.slice(2);
const url = args[0] && !args[0].startsWith('--') ? args.shift() : 'http://localhost:5880/';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
export const BOSSES = {
  joker: { q: '?at=boss' },
  harley: { q: '?at=harleyFight', fight: true },
  penguin: { q: '?new=1&night=n2&at=penguinBoss' },
  riddler: { q: '?new=1&night=n3&at=riddlerBoss' },
  scarecrow: { q: '?new=1&night=n4&at=n4Boss' },
  freeze: { q: '?new=1&night=n5&at=n5Boss' },
  ivy: { q: '?new=1&night=n6&at=n6Boss' },
  firefly: { q: '?new=1&night=n7&at=n7Boss', vehicle: true },
  blackMask: { q: '?new=1&night=n8&at=n8Boss' },
  doubleAct: { q: '?new=1&night=n9&at=n9Boss' },
  owCatBurglar: { q: '?new=1&night=n5&at=n5Boss', side: true },
  owClayBrute: { q: '?new=1&night=n5&at=n5Boss', side: true },
  owTwoFace: { q: '?new=1&night=n5&at=n5Boss', side: true },
  owMercenary: { q: '?new=1&night=n6&at=n6Boss', side: true },
};
const LIMIT = Number(process.env.LIMIT ?? 720), MAX_DEATHS = Number(process.env.MAX_DEATHS ?? 6);

export async function runBoss(h, id, { skill = 'average', tier = 'normal', p2 = null, seed = 11 } = {}) {
  const B = BOSSES[id];
  const extra = `&quality=potato&bruceDays=0${p2 ? '&p2=bot&p2kit=robin' : ''}`;
  await h.page.evaluate((d) => { try { const k = 'gotham-settings-v1'; const s = JSON.parse(localStorage.getItem(k) ?? '{}'); s.difficulty = d; localStorage.setItem(k, JSON.stringify(s)); } catch { /* fresh */ } }, tier).catch(() => {});
  await h.goto(B.q + extra);
  await h.page.evaluate((d) => { const G = window.__game; G.settings.difficulty = d; G.combat.setDifficulty(d); }, tier);
  await h.skipStaged(60, 3);
  await h.packs();
  await h.seed(seed);
  const rec = { id, skill, tier, coop: !!p2, won: false, secs: 0, deaths: 0, phase: 0, assists: [] };
  await h.page.evaluate(([id, side]) => {
    const G = window.__game;
    window.__bb = { defeated: false, phase: 0, deaths: 0, t0: window.__v.frame, phases: [] };
    G.events.on('bossDefeated', (e) => { if (e.id === id || !side) window.__bb.defeated = true; });
    G.events.on('bossPhase', (e) => { window.__bb.phase = Math.max(window.__bb.phase, e.phase - 1); window.__bb.phases.push([e.phase, (window.__v.frame - window.__bb.t0) / 60]); });
    G.events.on('heroDown', () => { window.__bb.deaths += 1; });
    G.events.on('fightDone', (e) => { if (id === 'harley' && e.id === 'harleyHall') window.__bb.defeated = true; });
    // The story moving past the boss step (the outro, the next step, the credits) is a win too: the
    // Night One Joker (boss.js) finishes through the flow, not through the director's event.
    const step0 = G.flow?.objectives?.step?.id ?? null;
    window.__v.after.push(() => { const W = window.__bb; if (W.defeated || side) return; const now = G.flow?.objectives?.step?.id ?? null; if (step0 && now !== step0 && !G.hero.dead) { W.defeated = true; W.tWin = (window.__v.frame - W.t0) / 60; } });
  }, [id, !!B.side]);
  if (B.side) {
    // Straight into the boss: the director starts it at its arena; the hero at its edge.
    const ok = await h.page.evaluate(async (id) => {
      const G = window.__game;
      if (!G.bosses.has(id)) G.sideChains?.registerBosses?.();
      if (!G.bosses.has(id)) return false;
      const at = G.bosses.siteOf(id);
      G.flow?.objectives && (G.flow.paused = true);
      G.hero.teleport({ x: at.x + 3, y: (at.y ?? 0) + 0.3, z: at.z + 3 }, 0);
      G.bosses.begin(id, { playScene: null });
      return true;
    }, id);
    if (!ok) return { ...rec, error: 'side boss not registered' };
  }
  // ?at= opens a boss step wherever that step's start is; the story's previous step leaves the hero
  // at the arena. Staging (recorded): a hero more than 25 m from the arena is placed 8 m from it.
  if (!B.side && !B.vehicle && !B.fight) {
    const moved = await h.page.evaluate((id) => { const G = window.__game; const at = G.bosses.siteOf(id) ?? G.bosses.siteOf(G.bosses.current?.id); if (!at) return false; const d = Math.hypot(G.hero.pos.x - at.x, G.hero.pos.z - at.z); if (d < 25) return false; G.teleport({ x: at.x + 6, y: at.y + 0.5, z: at.z + 6 }); return true; }, id);
    if (moved) rec.assists.push('placed-at-arena');
  }
  // The vehicle boss starts with the hero in the Batmobile, as the story's board step leaves him
  // (?at= opens on foot): an assist, counted.
  if (B.vehicle) { const ok = await h.page.evaluate(() => { const V = window.__game.vehicles; if (!V || V.active) return !!V?.active; const car = V.batmobile; if (!car) return false; const p = window.__game.hero.pos; car.group.position.set(p.x + 3, p.y, p.z); car.group.visible = true; car.arriving = false; car.auto = null; V.enter(car); return !!V.active; }); rec.assists.push(ok ? 'board' : 'board-failed'); }
  await installBot(h.page, { skill, seed });
  if (process.env.SKIP_PHASES) { await h.step(60); await h.page.evaluate((n) => { for (let i = 0; i < n; i++) window.__game.bosses.debugPhase(); }, Number(process.env.SKIP_PHASES)); rec.assists.push('skipped-phases(diagnosis)'); }
  await setMode(h.page, 'boss');
  let s;
  while (true) {
    await h.step(30);
    await h.skipStaged(2);
    s = await h.page.evaluate(() => { const G = window.__game, W = window.__bb; return { won: W.defeated, deaths: W.deaths, phase: Math.max(W.phase, G.bosses.phase ?? 0), t: (window.__v.frame - W.t0) / 60, step: G.flow?.objectives?.step?.type ?? null, battle: !!G.vehicles?.battle?.active, inCar: !!G.vehicles?.active }; });
    if (process.env.TRACE && Math.round(s.t * 2) % Number(process.env.TRACE_EVERY ?? 20) === 0) console.log('   trace', id, Math.round(s.t), JSON.stringify(await h.page.evaluate(() => { const G = window.__game, c = G.bosses.controller, e = c?.handle?.e; return { phase: G.bosses.phase, state: e?.state ?? null, vul: e?.vulnerable ? +e.vulnerable.toFixed(1) : 0, rid: G.bosses.controller?.handle?.data ? { solved: G.bosses.controller.handle.data.solved, ans: G.bosses.controller.handle.data.answered?.id ?? null, clock: Math.round(G.bosses.controller.handle.data.clock ?? -1), reopen: G.bosses.controller.handle.data.reopenT } : null, hint: ((x) => x && { a: x.action ?? null, to: x.goTo ? [Math.round(x.goTo.x), Math.round(x.goTo.z)] : null })(G.bosses.simHint?.()), held: c?.handle ? (c.handle.data?.nodes ?? []).filter((n) => n.on).map((n) => (n.cut ? 'X' : (n.held ?? 0).toFixed(1))).join(',') : null, me: [Math.round(G.hero.pos.x), +G.hero.pos.y.toFixed(1), Math.round(G.hero.pos.z)], ctl: G.hero.control?.name ?? null, hs: G.hero.state, hp: Math.round(G.hero.health), mode: G.flow?.mode, err: window.__v.err ?? null, bot: { m: window.__bot?.mode, t: Math.round(window.__bot?.t ?? -1), mv: window.__bot?.mv, p: window.__bot?.stats?.presses, list: G.combat.enemies.filter((x) => x.alive && !x.hallucination).map((x) => x.type ?? x.id + ':' + (x.ch?.root?.visible)).join(',') }, enemies: G.combat.enemies.filter((x) => x.alive).length }; })));
    if (s.won || s.deaths >= MAX_DEATHS || s.t > LIMIT) break;
  }
  const st = await botStats(h.page);
  const phases = await h.page.evaluate(() => window.__bb.phases);
  return { ...rec, won: s.won, secs: Math.round(await h.page.evaluate(() => window.__bb.tWin ?? null) ?? s.t), deaths: s.deaths, phase: s.phase + 1, phases, hpLost: Math.round(st.hpLost), counters: st.counters, tells: st.tells ?? 0, missed: st.counterMiss, dodges: st.dodges, piloted: st.piloted ?? 0, assists: rec.assists };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const ids = opt('bosses', Object.keys(BOSSES).join(',')).split(',');
  const skill = opt('skill', 'average'), tier = opt('tier', 'normal'), p2 = opt('p2', null);
  const workers = Number(opt('workers', 1)); // one browser at a time (shared machine)
  const out = opt('out', join(tmpdir(), 'boss-bench.json'));
  const queue = [...ids], results = [];
  await Promise.all(Array.from({ length: Math.min(workers, ids.length) }, async (_, w) => {
    const h = await openGame(url, '');
    await h.page.setViewportSize({ width: 640, height: 360 });
    while (queue.length) {
      const id = queue.shift();
      let r;
      try { r = await runBoss(h, id, { skill, tier, p2 }); } catch (e) { r = { id, error: String(e.message ?? e).split('\n')[0].slice(0, 140) }; }
      results.push(r);
      console.log(`[w${w}] ${id.padEnd(13)} ${r.error ? 'ERROR ' + r.error : `${r.won ? 'BEATEN' : 'not beaten'} in ${r.secs} s, deaths ${r.deaths}, phase reached ${r.phase}, hp lost ${r.hpLost}, counters ${r.counters}/${r.tells} tells (missed ${r.missed}) dodges ${r.dodges}${r.piloted ? ' piloted ' + r.piloted : ''}  ${JSON.stringify(r.phases)}`}`);
    }
    if (h.errors.length) console.log(`[w${w}] page errors:`, [...new Set(h.errors)].slice(0, 5).join(' | '));
    await h.close();
  }));
  writeFileSync(out, JSON.stringify(results, null, 1));
  console.log('wrote', out);
}
