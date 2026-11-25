// Screenshots for workstream M (time of day, weather, civilians): the same street under each
// condition. Usage: node scripts/env-shots.mjs [baseUrl] [outDir] [set]
//   set: 'times' (dawn, noon, dusk, night), 'weather' (clear, storm, fog, snow), 'loop6pm',
//        'tiers' (potato vs ultra), 'all' (default). Env: Q=<tier> (default high), SIZE=1280x720.
// Each shot: ?time=&weather= pin the clock and weather, the hero stands at a fixed spot, the
// follow camera snaps behind him, the world runs a few seconds (crowds and traffic fill), shoot.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5650/';
const out = process.argv[3] ?? 'docs/design/shots/env';
const set = process.argv[4] ?? 'all';
const [w, h] = (process.env.SIZE ?? '1280x720').split('x').map(Number);
mkdirSync(out, { recursive: true });

const STREET = { pos: { x: 150, y: 0, z: 10 }, yaw: 0, pitch: 0.12 }; // the neon street (core)
const LOOP = { pos: { x: -30, y: 0, z: -470 }, yaw: 0, pitch: 0.15 }; // a Loop avenue
const SHOTS = {
  times: [['dawn', 6.4, 'overcast'], ['noon', 12.5, 'overcast'], ['dusk', 18.6, 'overcast'], ['night', 23, 'storm']].map(([n, t, wx]) => ({ name: `time-${n}`, t, wx, ...STREET })),
  weather: [['clear', 'clear'], ['storm', 'storm'], ['fog', 'fog'], ['snow', 'snow']].map(([n, wx]) => ({ name: `weather-${n}`, t: 22, wx, ...STREET })),
  loop6pm: [{ name: 'loop-6pm', t: 18, wx: 'overcast', ...LOOP }],
  ultra: [{ name: 'tier-ultra-night-rain', t: 22.5, wx: 'rain', q: 'ultra', ...STREET }],
  far: ['potato', 'high'].map((q) => ({ name: `far-landmarks-${q}`, t: 21, wx: 'clear', q, pos: { x: -170, y: 125, z: 190 }, yaw: 2.88, pitch: 0.12 })),
  tiers: ['potato', 'ultra'].map((q) => ({ name: `tier-${q}-night-rain`, t: 22.5, wx: 'rain', q, ...STREET })),
};
const list = set === 'all' ? Object.values(SHOTS).flat() : SHOTS[set] ?? [];

const b = await chromium.launch({ channel: process.env.CHANNEL ?? 'msedge', headless: !process.env.HEADED, args: ['--mute-audio', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
for (const s of list) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  const q = s.q ?? process.env.Q ?? 'high';
  await p.goto(`${base}?at=start&god=1&dynres=0&q=${q}&time=${s.t}&weather=${s.wx}${process.env.P2 === 'bot' ? '&p2=bot' : ''}`);
  await p.waitForFunction(() => window.__game?.hero && window.__game.state?.phase === 'play', null, { timeout: 180000, polling: 500 });
  // Clear the opening comic / cutscene, then hold the hero on the spot with the camera behind him.
  for (let i = 0, clear = 0; i < 200 && clear < 8; i++) {
    const busy = await p.evaluate(() => { const G = window.__game; G.cinematic?.active && G.cinematic.skip(); G.comic?.playing && G.comic.skip(); G.radio?.playing && G.radio.skip?.(); return !!(G.comic?.playing || G.cinematic?.active || G.flow?.mode !== 'play'); });
    clear = busy ? 0 : clear + 1;
    await p.waitForTimeout(200);
  }
  await p.evaluate((s) => {
    const G = window.__game;
    G.world.clock.pin(s.t, { id: 'shot' });
    const hold = () => { G.hero.teleport(s.pos, s.yaw); window.__shotHold = requestAnimationFrame(hold); };
    hold();
    G.follow.snapBehind(s.yaw, s.pitch);
  }, s);
  await p.waitForTimeout(Number(process.env.SETTLE ?? 6000));
  const info = await p.evaluate(() => { const G = window.__game; const e = G.environment; return { hour: G.world.clock.hour, weather: G.world.weather.state, vis: e.visibility, fps: G.state.fps, civ: G.civilians?.stats ?? null }; });
  await p.screenshot({ path: `${out}/${s.name}.png` });
  console.log(s.name, q, JSON.stringify(info), errors.length ? `errors: ${errors.slice(0, 3)}` : '');
  await p.close();
}
await b.close();
