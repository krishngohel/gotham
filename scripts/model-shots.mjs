// Photographs the code-built models (Batmobile, Batwing, Joker van, drone tank, street car) from
// six angles each, on a clear street, with the HUD and Batman hidden, into <outDir>/<model>-<view>.png
// plus one contact sheet per model (<model>.png, if Python with Pillow is around to tile them).
// usage: node scripts/model-shots.mjs <url> <outDir> [model ...]   (muted)
//
// Characters: node scripts/model-shots.mjs --roster <url> <outDir> [id|group ...] [--q low]
// photographs every entry of the character catalog (src/heroes/models/catalog.js) through
// tools/roster.html under the game's toon + ink pipeline: front, three-quarter, side and back
// close up on the idle, a strike, a walk seen from the follow camera at 8 m and a goon's-eye
// 20 m view at night, then 3/4, back, walk and face again under the noon light, tiled into one contact sheet per character (<id>.png, via sharp) plus stats.json
// (draw calls, triangles and bones per character).
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

if (process.argv[2] === '--roster') { await rosterShots(process.argv.slice(3)); process.exit(0); }

const [url, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(url + (url.includes('?') ? '&' : '?') + 'at=toDocks&god=1');
await p.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30, null, { timeout: 90000 });
for (let i = 0; i < 25; i++) { await p.evaluate(() => { const G = window.__game; G.cinematic?.active && G.cinematic.skip(); G.comic.playing && G.comic.skip(); G.radio?.playing && G.radio.skip(); }); await p.waitForTimeout(150); }

// Each model is placed on the dock road at (-90, ground, 120), facing +z, sized by `span` (how
// far the camera stands back).
const MODELS = {
  batmobile: { span: 1, build: () => { const G = window.__game; G.vehicles.summon('batmobile', { instant: true }); return G.vehicles.batmobile.group; } },
  batwing: { span: 2.6, lift: 6, build: async () => { const m = (await import('/src/vehicles/wingModel.js')).buildBatwingMesh().mesh; m.visible = true; return m; } },
  jokerVan: { span: 0.9, build: async () => (await import('/src/vehicles/vehicleModels.js')).createJokerVan().group },
  droneTank: { span: 0.8, build: async () => (await import('/src/vehicles/vehicleModels.js')).createDroneTank().group },
  streetCar: { span: 0.8, build: async () => (await import('/src/vehicles/vehicleModels.js')).createStreetCar(0x2f3f5a, 'sedan').group },
  // [polish2] the hero bikes and the deco sedan (fenders)
  wingbike: { span: 0.42, build: async () => (await import('/src/vehicles/models/heroBikes.js')).createWingBike().group },
  batcycle: { span: 0.46, build: async () => (await import('/src/vehicles/models/heroBikes.js')).createBatcycle().group },
  decoSedan: { span: 0.8, build: async () => (await import('/src/vehicles/vehicleModels.js')).createStreetVehicle('sedan_deco', { color: 0x6a1f2a }).group },
  taxi: { span: 0.8, build: async () => (await import('/src/vehicles/vehicleModels.js')).createStreetVehicle('taxi', {}).group },
};
await p.evaluate(() => {
  const G = window.__game;
  G.hero.teleport({ x: -80, y: 0.2, z: 90 }, 0);
  G.hero.bat.root.visible = false; G.hero.cape.mesh.visible = false;
  for (const el of document.querySelectorAll('.hud, .waypoint, .fps')) el.style.display = 'none';
  const cam = G.camera, render = G.renderer.render.bind(G.renderer);
  window.__shot = null;
  G.renderer.render = (s, c) => {
    if (c === cam && window.__shot) { cam.position.set(...window.__shot.p); cam.lookAt(...window.__shot.l); cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); }
    return render(s, c);
  };
});
const views = (k, y) => ({
  front34: [[-90 + 6 * k, y + 2.4 * k, 120 + 7 * k]], side: [[-90 + 8.5 * k, y + 1.3 * k, 120]], rear34: [[-90 - 5 * k, y + 2.6 * k, 120 - 7 * k]],
  top: [[-90, y + 13 * k, 120.1]], front: [[-90, y + 0.9 * k, 120 + 8 * k]], rear: [[-90, y + 1.6 * k, 120 - 9 * k]],
});
for (const [name, m] of Object.entries(MODELS)) {
  if (only.length && !only.includes(name)) continue;
  const y = m.lift ?? 0;
  // Dev builds can import the source modules; a built bundle cannot, so those models are skipped there.
  const ok = await p.evaluate(async ([name, src, y]) => {
    try {
      window.__model?.parent?.remove(window.__model);
      const G = window.__game, build = eval(`(${src})`);
      const g = await build();
      if (name !== 'batmobile') { G.scene.add(g); G.vehicles.batmobile.group.visible = false; } else g.visible = true;
      g.position.set(-90, y, 120); g.rotation.set(0, 0, 0);
      window.__model = name === 'batmobile' ? null : g;
      if (name === 'batmobile') { g.position.set(-90, 0, 120); }
      return true;
    } catch (e) { return String(e); }
  }, [name, m.build.toString(), y]);
  if (ok !== true) { console.log(name, 'skipped:', ok); continue; }
  const files = [];
  for (const [view, [pos]] of Object.entries(views(m.span, y))) {
    await p.evaluate(([pos, look]) => { window.__shot = { p: pos, l: look }; }, [pos, [-90, y + 0.8, 120]]);
    await p.waitForTimeout(450);
    const f = `${out}/${name}-${view}.png`;
    await p.screenshot({ path: f, clip: { x: 240, y: 110, width: 800, height: 500 } });
    files.push(f);
  }
  try {
    execFileSync('python', ['-c', `
import sys
from PIL import Image
fs=sys.argv[2:]; ims=[Image.open(f) for f in fs]
m=Image.new('RGB',(800*3,500*2))
for i,im in enumerate(ims): m.paste(im,((i%3)*800,(i//3)*500))
m.resize((1800,750)).save(sys.argv[1])`, `${out}/${name}.png`, ...files]);
  } catch { /* no Python/Pillow: the single shots are still there */ }
  console.log(name, 'done');
}
await b.close();

async function rosterShots(argv) {
  const opt = (name, dflt) => { const i = argv.indexOf(name); if (i < 0) return dflt; const v = argv[i + 1]; argv.splice(i, 2); return v; };
  const q = opt('--q', 'high');
  const W = Number(opt('--w', 420)), H = Number(opt('--h', 560));
  const [url, outDir, ...only] = argv;
  mkdirSync(outDir, { recursive: true });
  const sharp = (await import('sharp')).default;
  const browser = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('page error:', e.message));
  await page.goto(`${url.replace(/\/$/, '')}/tools/roster.html?ui=0&freeze=1&pr=1&q=${q}`);
  await page.waitForFunction(() => window.__roster?.ready, null, { timeout: 120000 });
  const catalog = await page.evaluate(() => window.__roster.catalog);
  const pick = catalog.filter((e) => !only.length || only.includes(e.id) || only.includes(e.group));
  // [view, clip, clip time, label]
  const SHOTS = [
    ['front', 'Idle_Loop', 0.4, 'front'], ['quarter', 'Idle_Loop', 0.4, '3/4'], ['side', 'Idle_Loop', 0.4, 'side'], ['back', 'Idle_Loop', 0.4, 'back'],
    ['quarter', 'Punch_Cross', 0.35, 'strike'], ['game8m', 'Walk_Loop', 0.3, 'walk @8m'], ['far20m', 'Idle_Loop', 0.4, '@20m'], ['face', 'Idle_Loop', 0.4, 'face'],
    // The game has days now: the same character under the noon look (src/env/look.js).
    ['quarter', 'Idle_Loop', 0.4, '3/4 noon', 12.5], ['back', 'Idle_Loop', 0.4, 'back noon', 12.5], ['game8m', 'Walk_Loop', 0.3, 'walk @8m noon', 12.5], ['face', 'Idle_Loop', 0.4, 'face noon', 12.5],
  ];
  const stats = {};
  // One character's tiles. A dev server reloads the page when a source file changes under it
  // (another edit landing mid-run): then wait for the roster again and redo that character.
  async function shoot(e) {
    stats[e.id] = await page.evaluate((id) => window.__roster.show(id), e.id);
    const tiles = [];
    for (const [view, clip, t, label, hour = 23] of SHOTS) {
      await page.evaluate(([view, clip, t, hour]) => { const r = window.__roster; r.setHour?.(hour); r.pose(clip, t); r.setView(view); r.render(); r.render(); }, [view, clip, t, hour]);
      const png = await page.screenshot({ type: 'png' });
      const tag = Buffer.from(`<svg width="${W}" height="26"><rect width="100%" height="100%" fill="#0b0b12"/><text x="8" y="18" font-family="monospace" font-size="15" fill="#efe6cf">${e.name.replace(/&/g, '&amp;')} - ${label}</text></svg>`);
      tiles.push(await sharp(png).composite([{ input: tag, top: 0, left: 0 }]).png().toBuffer());
    }
    return tiles;
  }
  for (const e of pick) {
    let tiles;
    for (let attempt = 0; ; attempt++) {
      try { tiles = await shoot(e); break; } catch (err) {
        if (attempt >= 2) throw err;
        console.log(`${e.id}: retrying after ${String(err.message).split('\n')[0]}`);
        await page.waitForFunction(() => window.__roster?.ready, null, { timeout: 120000 });
      }
    }
    const cols = 4, rows = Math.ceil(tiles.length / cols);
    const sheet = sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#0b0b12' } })
      .composite(tiles.map((input, i) => ({ input, left: (i % cols) * W, top: Math.floor(i / cols) * H })));
    // Sheets are for eyes, not pixels: half size JPEG keeps a full roster under a few MB.
    await sharp(await sheet.png().toBuffer()).resize(Math.round(W * cols * 0.5)).jpeg({ quality: 80 }).toFile(`${outDir}/${e.id}.jpg`);
    const s = stats[e.id];
    console.log(`${e.id.padEnd(22)} calls ${String(s.calls).padStart(3)} (colour ${s.colorCalls}, normal ${s.normalCalls})  tris ${s.triangles}`);
  }
  writeFileSync(`${outDir}/stats.json`, JSON.stringify(stats, null, 1));
  await browser.close();
}
