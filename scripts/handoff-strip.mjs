// [onboard] A frame strip of an objective hand-off: the hero runs (real input) up to a reach step's
// site and on into the next step; frames every 0.25 s of game time on the virtual clock, joined into
// one image. usage: node scripts/handoff-strip.mjs <url> <out.jpg> [stepId=toYard] [from=30]
import { openGame } from './anim-lib.mjs';
import sharp from 'sharp';

const [url = 'http://localhost:5830/', out = 'strip.jpg', stepId = 'toYard', fromArg = '30'] = process.argv.slice(2);
const from = Number(fromArg);
const h = await openGame(url, '');
await h.goto(`?at=${stepId}&new=1&abilities=story`);
await h.run();
await h.page.waitForTimeout(2500);
await h.freeze();
await h.page.evaluate(() => { const G = window.__game; G.radio?.skip?.(); G.cinematic?.skip?.(); });
// Stand `from` m short of the site on its +x side, facing it, then run in.
const site = await h.page.evaluate(() => { const t = window.__game.flow.target; return { x: t.x, y: t.y, z: t.z }; });
await h.page.evaluate(([s, d]) => {
  const G = window.__game;
  G.teleport({ x: s.x + d, y: s.y, z: s.z });
  const yaw = Math.atan2(s.x - G.hero.pos.x, s.z - G.hero.pos.z);
  G.follow.snapBehind(yaw, 0.18);
}, [site, from]);
await h.step(40);
await h.key('KeyW', true);
const frames = [];
let reachedAt = -1;
for (let i = 0; i < 24; i++) {
  await h.step(15);
  const st = await h.page.evaluate((id) => window.__game.flow.objectives.step.id !== id, stepId);
  if (st && reachedAt < 0) reachedAt = i;
  if (reachedAt >= 0 && i - reachedAt === 2) await h.key('KeyW', false);
  frames.push(await h.page.screenshot({ type: 'jpeg', quality: 70 }));
}
await h.close();
// Every other frame, 12 tiles in a 4 x 3 grid at 320 x 180.
const pick = frames.filter((_, i) => i % 2 === 0).slice(0, 12);
const tiles = await Promise.all(pick.map((b) => sharp(b).resize(320, 180).toBuffer()));
await sharp({ create: { width: 1280, height: 540, channels: 3, background: '#111' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % 4) * 320, top: Math.floor(i / 4) * 180 })))
  .jpeg({ quality: 72 }).toFile(out);
console.log('reached at frame', reachedAt, '->', out);
