// Difficulty sanity on the virtual clock (scripts/anim-lib.mjs): scripted players fight the Night
// One story fights on each difficulty and report the health they lost.
//   competent  counters every blue tell aimed near him, dodges red ones late in the wind-up,
//              cape-stuns brutes / batons / shields up close, otherwise punches (every 5th a kick)
//   masher     punch, punch, punch, kick ... never reads a tell
// Targets (docs/design brief I2 item 9): Normal + competent loses little; Hard + competent is
// tense; Story + masher wins; Knightmare + masher loses fast.
//
//   node scripts/combat-tune.mjs <url> [difficulty:style ...] [--fights f1,f2,...]
//   e.g. node scripts/combat-tune.mjs http://localhost:5620/ normal:competent story:masher
// Prints a table and writes the results to $OUT (default: combat-tune.json in the temp folder).
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openGame, fightStep } from './anim-lib.mjs';

const args = process.argv.slice(2);
const url = args.shift() ?? 'http://localhost:5620/';
const fi = args.indexOf('--fights');
const FIGHTS = fi >= 0 ? args.splice(fi, 2)[1].split(',') : ['f1', 'f2', 'f3', 'n1', 'n2', 'n3', 'a1', 'a2'];
const RUNS = args.length ? args.map((a) => a.split(':')) : [['story', 'masher'], ['normal', 'competent'], ['normal', 'masher'], ['hard', 'competent'], ['knightmare', 'masher']];
const LIMIT = Number(process.env.LIMIT ?? 150); // game seconds per fight
const STEP = Number(process.env.STEP ?? 20); // frames between presses (plus the 2-frame press)

const h = await openGame(url, '');
const { page } = h;
const results = [];
for (const [difficulty, style] of RUNS) {
  for (const id of FIGHTS) {
    try {
      await h.goto(`?at=${id}`);
      await h.skipStaged(40, 3);
      await h.packs();
      await h.skipStaged(40, 3);
      // The difficulty from the settings object the game reads every frame; full health for it.
      await page.evaluate(([d]) => {
        const G = window.__game;
        G.settings.difficulty = d;
        G.combat.setDifficulty(d);
        const max = d === 'story' ? 150 : 100;
        G.hero.maxHealth = max; G.hero.health = max;
        window.__tune = { lost: 0, hits: 0, deaths: 0, done: false, start: window.__v.frame };
        window.__botSlip = 0.15; // the competent player misses about one counter in seven
        G.events.on('heroHurt', (e) => { window.__tune.lost += e.damage ?? 0; window.__tune.hits++; });
        window.__tune.windups = 0;
        const sw = G.combat.director;
        for (const e of G.enemies) void e;
        G.events.on('rifleAim', () => { window.__tune.windups++; });
        G.events.on('heroDown', () => { window.__tune.deaths++; });
        G.events.on('fightDone', () => { window.__tune.done = true; });
      }, [difficulty]);
      await h.seed(21);
      let started = false;
      for (let k = 0; k < 40 && !started; k++) { await h.step(15); started = await page.evaluate(() => window.__game.enemies.some((e) => e.alive)); }
      if (!started) { results.push({ difficulty, style, id, error: 'no fight' }); continue; }
      // Into the fight: beside the squad (the encounter starts when he is inside its radius).
      await page.evaluate(() => {
        const G = window.__game, live = G.enemies.filter((e) => e.alive);
        let x = 0, z = 0; for (const e of live) { x += e.pos.x; z += e.pos.z; }
        x /= live.length; z /= live.length;
        const e0 = live[0], dx = G.hero.pos.x - x, dz = G.hero.pos.z - z, d = Math.hypot(dx, dz) || 1;
        G.hero.teleport({ x: x + (dx / d) * 4, y: e0.pos.y, z: z + (dz / d) * 4 }, Math.atan2(-dx, -dz));
        G.follow.snapBehind?.(Math.atan2(-dx, -dz), 0.2);
      });
      await h.step(30);
      let i = 0, out = null;
      while (true) {
        const s = await page.evaluate(() => { const G = window.__game, T = window.__tune; return { dead: G.hero.dead || T.deaths > 0, done: T.done, t: (window.__v.frame - T.start) / 60, hp: G.hero.health }; });
        if (s.dead || s.done || s.t > LIMIT) { out = s; break; }
        const a = await fightStep(h, style, i++);
        if (a !== 'none') await h.tap(a, 2);
        // About 2.7 presses a second: a busy human, not a macro.
        await h.step(STEP);
      }
      const t = await page.evaluate(() => window.__tune);
      results.push({ difficulty, style, id, lost: Math.round(t.lost), hits: t.hits, died: out.dead, won: out.done && !out.dead, secs: +out.t.toFixed(1), hpLeft: Math.round(out.hp) });
      const r = results[results.length - 1];
      console.log(`${difficulty.padEnd(10)} ${style.padEnd(9)} ${id.padEnd(4)} lost ${String(r.lost).padStart(4)} hp in ${String(r.hits).padStart(2)} hits, ${r.died ? 'DIED' : r.won ? 'won ' : 'timeout'} in ${r.secs} s`);
    } catch (e) {
      results.push({ difficulty, style, id, error: e.message.split(String.fromCharCode(10))[0] });
      console.log(difficulty, style, id, 'error', e.message.split(String.fromCharCode(10))[0]);
    }
  }
}
// Summary per difficulty x style.
console.log('\nsummary');
for (const [difficulty, style] of RUNS) {
  const rs = results.filter((r) => r.difficulty === difficulty && r.style === style && !r.error);
  if (!rs.length) continue;
  const lost = rs.reduce((s, r) => s + r.lost, 0);
  console.log(`${difficulty.padEnd(10)} ${style.padEnd(9)} fights ${rs.length}, won ${rs.filter((r) => r.won).length}, died ${rs.filter((r) => r.died).length}, hp lost per fight: mean ${(lost / rs.length).toFixed(0)}, max ${Math.max(...rs.map((r) => r.lost))}`);
}
writeFileSync(process.env.OUT ?? join(tmpdir(), 'combat-tune.json'), JSON.stringify(results, null, 1));
console.log(h.errors.length ? h.errors.join('\n') : 'no page errors');
await h.close();
