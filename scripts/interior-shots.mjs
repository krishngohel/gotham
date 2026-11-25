// [polish] Fixed-camera screenshots of the lazily built interiors (Wayne Manor, the gala, the
// Batcave), with draw calls / triangles per shot, so the dressing can be judged and budgeted.
//
//   node scripts/interior-shots.mjs <baseUrl> <outDir> [high|low|potato]
//        writes <outDir>/<shot>.png and <outDir>/stats.json (calls/tris summed over the frame's
//        renderer.render passes, like world-shots.mjs)
//
// Each shot names a setup ('manor' | 'cave' | 'gala'), a camera position and a look-at target in
// the pocket's LOCAL coordinates, and optionally an hour (time=). Env: ONLY=<names>, HEADED=1.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const UP = 5.4, DECK = 4;
export const INTERIOR_SHOTS = [
  // Wayne Manor (origin 2000, 0, -2000)
  ['manor-hall', 'manor', [7.6, 2.0, 9.2], [-6, 3.2, -3]],
  ['manor-hall-landing', 'manor', [6.5, UP + 1.8, -8.6], [-3, 1.5, 6]],
  ['manor-study', 'manor', [21.5, 1.8, 1.2], [12, 1.4, -8]],
  ['manor-library', 'manor', [10.2, 2.0, 3.0], [20, 1.4, 11]],
  ['manor-dining', 'manor', [-10.5, 2.2, 2.2], [-20, 1.2, -7]],
  ['manor-gallery', 'manor', [0, UP + 1.8, -11], [0, UP + 2, -27]],
  ['manor-ballroom', 'manor', [0, 3.2, 11.2], [0, 2.2, 30]],
  // The gala (the cast and guests are placed by bruce.playScene('gala'))
  ['gala-ballroom', 'gala', [6.5, 3.4, 12.0], [-2, 1.2, 26]],
  ['gala-window', 'gala', [-6.5, 2.2, 18], [2, 3.5, 36]],
  ['gala-close', 'gala', [-2.5, 1.7, 13.2], [1, 1.3, 19.5]],
  ['gala-band', 'gala', [1.5, 2.0, 28.0], [-1.5, 1.2, 34.5]],
  // The Batcave (origin 2000, 0, -2400)
  ['cave-overview', 'cave', [-33, 17.5, -25], [6, 1, 18]],
  ['cave-batcomputer', 'cave', [0, DECK + 2.0, -5.5], [0, DECK + 2.6, -15]],
  ['cave-bay', 'cave', [-6, DECK + 2.6, 6.8], [1, 0.5, 26]],
  ['cave-vault', 'cave', [-18.5, DECK + 1.9, -6.5], [-25, DECK + 1.4, -7]],
  ['cave-trophies', 'cave', [-28, 3.0, -6], [-41, 2, -12]],
  ['cave-medbay', 'cave', [-24, 2.6, 10], [-35, 1, 17]],
  ['cave-sim', 'cave', [16, 5, -2], [31, 0, 18]],
];

async function main(base, out, q = 'high') {
  mkdirSync(out, { recursive: true });
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const b = await chromium.launch({
    headless: !process.env.HEADED,
    args: ['--mute-audio', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--enable-gpu'],
  });
  const stats = { q, shots: {} };
  const errors = [];
  // One page per setup, so a setup's lazily built pocket is exactly what that setup builds.
  const groups = {};
  for (const s of INTERIOR_SHOTS) if (!only || only.includes(s[0])) (groups[s[1]] ??= []).push(s);
  for (const [setup, shots] of Object.entries(groups)) {
    const page = await b.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    const url = `${base.replace(/\/$/, '')}/?new=1&god=1&q=${q}&dynres=0&weather=clear&time=${process.env.TIME ?? 21}${process.env.EXTRA ?? ''}`;
    for (let attempt = 0; ; attempt++) {
      await page.goto(url);
      try { await page.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 20, null, { timeout: 240000 }); break; } catch (e) { if (attempt >= 2) throw e; console.log('retry load', setup); }
    }
    await page.evaluate(() => { document.querySelector('.mbtn.primary').click(); document.querySelector('.suit-card.suit-m').click(); });
    await page.waitForFunction(() => window.__game?.bruce, null, { timeout: 120000 });
    await page.addStyleTag({ content: 'body > *:not(canvas){display:none!important} canvas{cursor:none}' });
    await page.evaluate(async (setup) => {
      const G = window.__game;
      const br = G.bruce;
      G.progress.batcave ??= { medals: {}, tutorial: [], trophies: [], suit: null };
      G.progress.batcave.trophies = ['coin', 'dinosaur', 'card'];
      if (setup === 'manor') br.start('manor');
      else if (setup === 'cave') br.start('cave');
      else if (setup === 'gala') br.playScene('gala');
      const r = G.renderer;
      const up = G.world.update;
      G.world.update = (t, dt, focus, camera, hero) => {
        const s = window.__shotPose;
        if (s) { camera.position.set(...s.pos); camera.lookAt(...s.at); camera.updateMatrixWorld(); }
        return up(t, dt, s ? camera.position : focus, camera, hero);
      };
      const render = r.render.bind(r);
      r.render = (s, c) => { render(s, c); window.__passLog?.push({ calls: r.info.render.calls, tris: r.info.render.triangles }); };
      const inkRender = G.ink.render;
      G.ink.render = (...a) => { window.__passLog = []; inkRender(...a); window.__lastPasses = window.__passLog; window.__passLog = null; };
    }, setup);
    await page.waitForTimeout(setup === 'gala' ? 6000 : 3500);
    const origin = await page.evaluate((setup) => window.__game.bruce.POCKETS[setup === 'cave' ? 'batcave' : 'wayneManor'].origin, setup);
    for (const [name, , pos, at] of shots) {
      const w = (p) => [p[0] + origin.x, p[1] + origin.y, p[2] + origin.z];
      await page.evaluate(([pos, at]) => { window.__shotPose = { pos, at }; }, [w(pos), w(at)]);
      await page.waitForTimeout(900);
      const png = await page.locator('#game').screenshot();
      writeFileSync(join(out, `${name}.png`), png);
      const passes = await page.evaluate(() => window.__lastPasses ?? []);
      stats.shots[name] = { calls: passes.reduce((s, p) => s + p.calls, 0), tris: passes.reduce((s, p) => s + p.tris, 0), passes: passes.length };
      console.log(name.padEnd(22), `calls ${String(stats.shots[name].calls).padStart(5)}`, `tris ${String(stats.shots[name].tris).padStart(8)}`, `passes ${passes.length}`);
    }
    await page.close();
  }
  stats.errors = errors;
  writeFileSync(join(out, 'stats.json'), JSON.stringify(stats, null, 1));
  if (errors.length) console.log('page errors:', errors.slice(0, 10));
  await b.close();
}

const [base, out, q] = process.argv.slice(2);
await main(base ?? 'http://localhost:5872', out ?? 'tmp/interiors', q ?? 'high');
