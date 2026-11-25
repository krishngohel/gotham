// Workstream I's combat proof shots: a filmed 10-hit freeflow chain against a ring of goons, the
// hero's strikes and the goons' directional reactions on their contact frames (hit-stop
// stretched so the screenshot lands inside the freeze), and the enemy roles' tells and answers.
// Sheets are tiled with Python + Pillow and saved as JPEG (the frames stay as PNG in a scratch dir).
//   node scripts/combat-shots.mjs <base url> <outDir> [scratchDir] [only...]
//   only: film | reactions | roles
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const [base = 'http://localhost:5420/', out = 'docs/design/shots/combat', scratch = 'combat-shots-frames', ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
mkdirSync(scratch, { recursive: true });
const want = (k) => !only.length || only.includes(k);
const b = await chromium.launch({ args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function boot(q) {
  await p.goto(base + q);
  await p.waitForFunction(() => window.__game?.state?.ready && window.__game.state.frame > 30, null, { timeout: 90000 });
  await p.evaluate(() => {
    const G = window.__game;
    setInterval(() => { if (G.comic?.playing) G.comic.skip?.(); if (G.cinematic?.active) G.cinematic.skip?.(); }, 100);
    // Only the 3D view: every HUD layer, prompt and comic word is DOM over the canvas.
    const hide = () => { for (const el of document.body.children) if (el.tagName !== 'CANVAS' && !el.querySelector?.('canvas')) el.style.visibility = 'hidden'; };
    hide(); setInterval(hide, 250);
    // A camera that tracks the hero from the side (window.__cam = { side, up, back, look }).
    const cam = G.camera, render = G.renderer.render.bind(G.renderer);
    G.renderer.render = (s, c) => {
      const k = window.__cam;
      if (c === cam && k) {
        const h = k.anchor ?? G.hero.pos, yaw = k.yaw ?? G.hero.bat.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
        cam.position.set(h.x + rx * k.side - fx * k.back, h.y + k.up, h.z + rz * k.side - fz * k.back);
        cam.lookAt(h.x + fx * (k.ahead ?? 0), h.y + (k.look ?? 1), h.z + fz * (k.ahead ?? 0)); cam.fov = 45; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      }
      return render(s, c);
    };
  });
  await p.waitForTimeout(2500);
}
const tile = (sheet, files, cols = 5, size = 300) => {
  try {
    execFileSync('python', ['-c', `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[3:]; s=int(sys.argv[2]); ims=[Image.open(f).convert('RGB') for f in fs]
ims=[im.crop(((im.width-im.height)//2,0,(im.width+im.height)//2,im.height)).resize((s,s)) for im in ims]
cols=min(int(sys.argv[4]) if False else ${cols},len(ims)); rows=(len(ims)+cols-1)//cols
m=Image.new('RGB',(s*cols,s*rows),'white'); d=ImageDraw.Draw(m)
for i,im in enumerate(ims):
  m.paste(im,((i%cols)*s,(i//cols)*s)); d.rectangle([(i%cols)*s,(i//cols)*s,(i%cols)*s+s-1,(i//cols)*s+18],fill='black'); d.text(((i%cols)*s+4,(i//cols)*s+3),fs[i].replace('\\\\','/').split('/')[-1][:-4],fill='yellow')
m.save(sys.argv[1], quality=72)`, sheet, String(size), ...files]);
  } catch (err) { console.log('tile failed', err.message); }
};
// Clears the fight and puts `types` around the hero at `spots` ([dx, dz] in the hero's frame).
const stage = (types, spots, { yaw = 0, hp = 40 } = {}) => p.evaluate(({ types, spots, yaw, hp }) => {
  const G = window.__game, h = G.hero;
  for (const e of [...G.combat.enemies]) G.despawn(e);
  h.control = null; h.vel.set(0, 0, 0); h.bat.face(yaw); h.invulnerable = 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
  const list = types.map((t, i) => { const [a, f] = spots[i]; const e = G.spawn(t, { x: h.pos.x + rx * a + fx * f, y: h.pos.y, z: h.pos.z + rz * a + fz * f }); e.health = hp; return e; });
  G.combat.setEnemies(list);
  for (const e of list) { e.wake(); e.ch.face(Math.atan2(h.pos.x - e.pos.x, h.pos.z - e.pos.z)); }
  window.__stage = list;
  return list.length;
}, { types, spots, yaw, hp });
const shot = async (name) => { const f = join(scratch, name + '.png'); await p.screenshot({ path: f }); return f; };
const impacts = () => p.evaluate(() => window.__impacts ?? 0);
const waitImpact = async (n0, timeout = 2500) => { try { await p.waitForFunction((n0) => (window.__impacts ?? 0) > n0, n0, { timeout, polling: 'raf' }); return true; } catch { return false; } };

// ---- 1. A 10-hit freeflow chain, filmed ----
if (want('film')) {
  await boot('?fight=test&god=1&suit=m');
  await p.waitForFunction(() => window.__game.hero.bat.animator.has('Cape_Swirl'), null, { timeout: 30000 }).catch(() => {});
  await stage(['grunt', 'grunt', 'grunt', 'grunt'], [[-2.4, 1.6], [2.4, 1.8], [0.2, 3.2], [-1.2, -2.6]], { hp: 3 });
  await p.evaluate(() => { const G = window.__game; for (const e of G.combat.enemies) G.combat.director.hold(e.id, 30); window.__cam = { side: 4.6, up: 2.2, back: 2.2, look: 0.9, yaw: G.hero.bat.yaw - 0.6 }; });
  const files = [];
  let hits0 = await impacts();
  const t0 = Date.now();
  // Fresh goons stand in for the ones knocked out, so the chain keeps going for ten blows.
  for (let i = 0, f = 0; i < 24 && f < 60 && (await impacts()) - hits0 < 10; i++) {
    await p.evaluate(() => { for (const e of window.__game.combat.enemies) if (e.alive) e.health = Math.max(e.health, 3); });
    if (i % 3 === 2) await p.keyboard.press('KeyE'); else await p.mouse.click(640, 360);
    for (let k = 0; k < 2; k++) { await p.waitForTimeout(110); files.push(await shot(`film-${String(f++).padStart(2, '0')}`)); }
  }
  console.log('film: hits', (await impacts()) - hits0, 'frames', files.length, 'in', Date.now() - t0, 'ms');
  tile(join(out, 'freeflow-10hit-film.jpg'), files.slice(0, 36), 6, 240);
}

// ---- 2. Strikes and reactions on their contact frames ----
if (want('reactions')) {
  await boot('?fight=test&god=1&suit=m&hitstop=0.5');
  await p.waitForFunction(() => window.__game.hero.bat.animator.has('React_Light_Front'), null, { timeout: 30000 }).catch(() => {});
  const files = [];
  const cases = [
    ['react-front-light-jab', 'grunt', [0, 2.0], 0, 'punch'],
    ['react-front-heavy-kick', 'grunt', [0, 2.3], 0, 'kick'],
    ['react-left-hook', 'grunt', [1.6, 1.4], 0, 'punch'],
    ['react-right-kick', 'grunt', [-1.6, 1.6], 0, 'kick'],
    ['react-back-strike', 'grunt', [0, 2.0], Math.PI, 'punch'],
    ['shield-blocks-front', 'shield', [0, 2.0], 0, 'punch'],
    ['brute-armour-flinch', 'brute', [0, 2.1], 0, 'punch'],
    ['ko-flyback', 'grunt', [0, 2.2], 0, 'kick'],
  ];
  for (const [name, type, spot, faceAway, action] of cases) {
    await stage([type], [spot], { hp: name.startsWith('ko') ? 1 : 30 });
    await p.evaluate(({ faceAway }) => { const G = window.__game, e = window.__stage[0]; G.combat.director.hold(e.id, 30); if (faceAway) e.ch.face(Math.atan2(e.pos.x - G.hero.pos.x, e.pos.z - G.hero.pos.z)); window.__cam = { side: 4.4, up: 1.3, back: 0, look: 0.9, anchor: G.hero.pos.clone().lerp(e.pos, 0.5), yaw: G.hero.bat.yaw }; }, { faceAway });
    await p.waitForTimeout(300);
    const n0 = await impacts();
    if (action === 'kick') await p.keyboard.press('KeyE'); else await p.mouse.click(640, 360);
    if (await waitImpact(n0)) { files.push(await shot(name + '-contact')); await p.waitForTimeout(650); files.push(await shot(name + '-after')); }
    else console.log(name, 'no impact');
    await p.waitForTimeout(900);
  }
  // A counter and the cape stun.
  await stage(['grunt'], [[0, 2.4]]);
  await p.evaluate(() => { const G = window.__game, e = window.__stage[0]; e.startWindup(1.2, G.hero, { now: true }); window.__cam = { side: 4.4, up: 1.3, back: 0, look: 0.9, anchor: G.hero.pos.clone().lerp(e.pos, 0.5), yaw: G.hero.bat.yaw }; });
  await p.waitForTimeout(250);
  files.push(await shot('counter-tell'));
  let n0 = await impacts();
  await p.mouse.click(640, 360, { button: 'right' });
  if (await waitImpact(n0)) files.push(await shot('counter-contact'));
  await p.waitForTimeout(1200);
  await stage(['grunt', 'grunt'], [[-0.8, 2.0], [0.9, 2.2]]);
  await p.evaluate(() => { const G = window.__game; window.__cam = { side: 4.6, up: 1.4, back: 0, look: 0.9, anchor: G.hero.pos.clone().lerp(window.__stage[0].pos, 0.5), yaw: G.hero.bat.yaw }; });
  n0 = await impacts();
  await p.keyboard.press('KeyQ');
  if (await waitImpact(n0)) files.push(await shot('cape-swirl-stun'));
  await p.waitForTimeout(700);
  files.push(await shot('cape-stun-dizzy'));
  tile(join(out, 'contact-strikes-and-reactions.jpg'), files, 5, 300);
}

// ---- 3. Roles: tells and answers ----
if (want('roles')) {
  await boot('?fight=test&god=1&suit=m');
  const files = [];
  await stage(['shield', 'baton', 'knife', 'heavy', 'ninja', 'medic', 'pistol', 'lieutenant'], [[-3, 3], [-1, 4], [1, 4], [3, 3.5], [-3, 6], [-1, 7], [1, 9], [3, 6]]);
  await p.waitForFunction(() => window.__game.hero.bat.animator.has('Shield_Bash'), null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const G = window.__game; window.__cam = { side: 0.01, up: 2.2, back: 4.5, look: 1.0, ahead: 4, anchor: G.hero.pos.clone(), yaw: G.hero.bat.yaw }; });
  files.push(await shot('roles-lineup'));
  for (let i = 0; i < 8; i++) { await p.waitForTimeout(700); files.push(await shot(`roles-fight-${i}`)); }
  tile(join(out, 'roles-lineup-and-fight.jpg'), files, 3, 400);
}

console.log(errors.length ? errors.slice(0, 8).join('\n') : 'no errors');
await b.close();
