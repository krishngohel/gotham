// Films combat on the virtual clock (scripts/anim-lib.mjs) into contact sheets, so a "before" and
// an "after" build show the same frames of the same fight. Scenes:
//   seeded   the audit's seeded fight (wave 1), a frame every 6 game frames
//   chain10  a 10-hit freeflow chain on a ring of goons, pressed in rhythm (each press as soon as
//            the move can chain); prints how many of the 10 landed
//   shield   a shield goon's bash, blocked        baton   cape stun, then the strike that disarms
//   brute    a brute's charge, dodged              ninja   a counter he turns aside, countered again
//   medic    a medic kneeling to revive a goon, hit off it
//   throw    the shoulder throw (paired)           getup   a launch, the fall, the floor, the get-up
//   react    four quick punches on one goon (a beating, not a strobe)
// usage: node scripts/anim-film2.mjs <url> <outDir> [scene ...]   (needs Python + Pillow for sheets)
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openGame, placeSquad, fightStep } from './anim-lib.mjs';

const [url = 'http://localhost:5620/', out = 'film2', ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const h = await openGame(url, '');
const { page } = h;
const log = [];

async function boot() {
  await h.goto('?fight=test&god=1');
  await h.skipStaged(40, 3);
  await h.packs();
  await h.skipStaged(40, 3);
  await page.evaluate(() => {
    const G = window.__game;
    for (const el of document.querySelectorAll('.hud, .waypoint, .fps, .prompt, .hint')) el.style.display = 'none';
    const cam = G.camera, render = G.renderer.render.bind(G.renderer);
    window.__cam = null;
    // A camera framing the hero and his target side-on (window.__cam = { side, up, back, mid }).
    G.renderer.render = (s, c) => {
      const k = window.__cam;
      if (c === cam && k) {
        const hp = G.hero.pos, t = window.__focus && window.__focus.alive !== undefined ? window.__focus.pos : null;
        // on 'target': centred on the goon (falls, get-ups, revives); else between the two.
        const onT = k.on === 'target' && t;
        const cx = onT ? t.x : t ? (hp.x + t.x) / 2 : hp.x, cz = onT ? t.z : t ? (hp.z + t.z) / 2 : hp.z;
        const yaw = window.__camYaw ?? (t ? Math.atan2(t.x - hp.x, t.z - hp.z) : G.hero.bat.yaw);
        window.__camYaw = yaw; // fixed for the scene once chosen: the shot does not swing round
        const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
        const span = t && !onT ? Math.hypot(t.x - hp.x, t.z - hp.z) : 0;
        const side = k.side + span * 0.45;
        cam.position.set(cx + rx * side - fx * k.back, hp.y + k.up, cz + rz * side - fz * k.back);
        cam.lookAt(cx, hp.y + 0.9, cz); cam.fov = 45; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      }
      return render(s, c);
    };
    window.__impactsN = 0;
    G.events.on('impact', (d) => { if (d.outcome !== 'parried' && d.outcome !== 'immune' && d.outcome !== 'blocked') window.__impactsN++; });
  });
}
const cam = (c) => page.evaluate((c) => { window.__cam = c; window.__camYaw = undefined; }, c);
const focus = (i) => page.evaluate((i) => { window.__focus = i === null ? null : window.__game.enemies[i]; }, i);

// Steps `n` shots `every` frames apart, running `act(i)` before shot i (if given), then tiles them.
async function film(name, n, every, act = null) {
  const files = [];
  for (let i = 0; i < n; i++) {
    if (act) await act(i);
    await h.step(every);
    const f = `${out}/${name}-${String(i).padStart(2, '0')}.jpg`;
    await page.screenshot({ path: f, type: 'jpeg', quality: 70, clip: { x: 240, y: 40, width: 800, height: 640 } });
    files.push(f);
  }
  try {
    execFileSync('python', ['-c', `
import sys
from PIL import Image, ImageDraw
fs=sys.argv[3:]; W=int(sys.argv[2]); ims=[Image.open(f).resize((W, W*640//800)) for f in fs]
cols=min(6,len(ims)); rows=(len(ims)+cols-1)//cols; H=W*640//800
m=Image.new('RGB',(W*cols,H*rows),'white'); d=ImageDraw.Draw(m)
for i,im in enumerate(ims): m.paste(im,((i%cols)*W,(i//cols)*H)); d.text(((i%cols)*W+6,(i//cols)*H+4),str(i),fill='yellow')
m.save(sys.argv[1], quality=72)`, `${out}/${name}.jpg`, '240', ...files]);
    for (const f of files) rmSync(f);
  } catch { /* the single frames stay */ }
}

const SCENES = {
  async seeded() {
    await placeSquad(page, 'start', [['grunt', -3, 4], ['grunt', 3, 4.5], ['knife', 0, 6], ['grunt', -5, 1], ['brute', 5, 7]]);
    await h.seed(11); await h.step(30);
    await focus(0); await cam({ side: 5, up: 2.4, back: 2.5 });
    let i = 0;
    await film('seeded-fight', 36, 4, async () => { if (i % 3 === 0) { const a = await fightStep(h, 'competent', i / 3); if (a !== 'none') await h.tap(a, 2); } i++; });
  },
  async chain10() {
    await placeSquad(page, 'start', [['grunt', -2.2, 2], ['grunt', 2.2, 2], ['grunt', 0, 3.2], ['grunt', -2.5, -1], ['grunt', 2.5, -1]]);
    await h.seed(5);
    // A ring that never fights back: the chain is about the hero's moves.
    await page.evaluate(() => { for (const e of window.__game.enemies) { e.health = 99; e.ready = () => false; } window.__impactsN = 0; });
    await h.step(20);
    await focus(2); await cam({ side: 4.5, up: 2.4, back: 2.5 });
    // A player in rhythm: the next press goes in as soon as the move can chain (every fourth a
    // kick), checked every 2 frames between the shots.
    let pressed = 0;
    const press = async () => {
      if (pressed >= 10) return;
      const ok = await page.evaluate(() => { const c = window.__game.hero.control; return !c || (c.combat && c.canChain()); });
      if (ok) { pressed++; await h.tap(pressed % 4 === 0 ? 'KeyE' : 'Mouse0', 2); }
    };
    await film('chain10', 30, 2, async () => { await press(); await h.step(2); await press(); await h.step(2); });
    for (let k = 0; k < 60 && pressed < 10; k++) { await press(); await h.step(2); }
    await h.step(60);
    const landed = await page.evaluate(() => window.__impactsN);
    log.push(`chain10: ${landed} of 10 landed`);
  },
  async shield() {
    await placeSquad(page, 'start', [['shield', 0, 2.6]]);
    await h.seed(3); await h.step(20);
    await focus(0); await cam({ side: 3.4, up: 1.5, back: 0.3 });
    await page.evaluate(() => { const G = window.__game, e = G.enemies[0]; e.state = 'engage'; e.startWindup(0.5, G.hero, { now: true }); });
    await h.key('Mouse2', true);
    await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousedown', { button: 2 })));
    await film('shield-bash-blocked', 12, 5);
    await page.evaluate(() => window.dispatchEvent(new MouseEvent('mouseup', { button: 2 })));
  },
  async baton() {
    await placeSquad(page, 'start', [['baton', 0, 2.2]]);
    await h.seed(4); await h.step(20);
    await focus(0); await cam({ side: 3.4, up: 1.5, back: 0.3 });
    await film('baton-cape-disarm', 18, 5, async (i) => { if (i === 0) await h.tap('KeyQ'); if (i === 7) await h.tap('Mouse0'); });
    log.push('baton: weapon after = ' + await page.evaluate(() => window.__game.enemies[0].weapon));
  },
  async brute() {
    await placeSquad(page, 'start', [['brute', 0, 7]]);
    await h.seed(6); await h.step(20);
    await focus(0); await cam({ side: 4.5, up: 1.8, back: 1.5 });
    // A seed whose wind-up is the charge (the role picks charge or swing at random).
    for (let s = 6; s < 40; s++) {
      await h.seed(s);
      const kind = await page.evaluate(() => { const G = window.__game, e = G.enemies[0]; e.state = 'engage'; e.t = 0; e.startWindup(0.6, G.hero, { now: true }); return e.attackKind; });
      if (kind === 'charge') break;
    }
    let dodged = false;
    await film('brute-charge-dodge', 18, 4, async () => {
      if (dodged) return;
      const s = await page.evaluate(() => { const e = window.__game.enemies[0]; return e.state + ':' + e.attackKind + ':' + e.t.toFixed(2) + ':' + e.windupDur.toFixed(2); });
      const [st, , t, wd] = s.split(':');
      if (st === 'windup' && +t > +wd - 0.2) { dodged = true; await h.key('KeyD', true); await h.tap('KeyC'); await h.key('KeyD', false); }
    });
  },
  async ninja() {
    await placeSquad(page, 'start', [['ninja', 0, 2.6]]);
    await h.seed(8); await h.step(20);
    await focus(0); await cam({ side: 3.4, up: 1.5, back: 0.3 });
    await page.evaluate(() => { const G = window.__game, e = G.enemies[0]; e.def = { ...e.def, counterCounter: true }; e.reversed = false; e.state = 'engage'; e.startWindup(0.5, G.hero, { now: true }); });
    let n = 0;
    await film('ninja-counter-counter', 24, 4, async () => {
      const st = await page.evaluate(() => { const e = window.__game.enemies[0]; return e.state === 'windup' && e.t > 0.25; });
      if (st && n < 3) { n++; await h.tap('Mouse2'); }
    });
  },
  async medic() {
    await placeSquad(page, 'start', [['medic', 2, 3.5], ['grunt', -0.5, 2.4]]);
    await h.seed(9); await h.step(20);
    await page.evaluate(() => { const G = window.__game, [m, g] = G.enemies; g.health = 0; g.applyHit({ outcome: 'ko', damage: 0, stun: 0 }, G.hero.pos, { power: 1 }); m.state = 'engage'; });
    await h.step(90);
    await page.evaluate(() => { const [m, g] = window.__game.enemies; m.startRevive(g); });
    await focus(1); await cam({ side: 3.8, up: 1.6, back: 0.5, on: 'target' });
    await film('medic-revive-interrupted', 18, 6, async (i) => { if (i === 10) await page.evaluate(() => { const G = window.__game, m = G.enemies[0]; G.hero.teleport({ x: m.pos.x - 1.6, y: m.pos.y, z: m.pos.z }, Math.PI / 2); }); if (i === 11) await h.tap('Mouse0'); });
    log.push('medic: reviving after hit = ' + await page.evaluate(() => !!window.__game.enemies[0].reviving));
  },
  async throw() {
    await placeSquad(page, 'start', [['grunt', 0, 1.6], ['grunt', 4, 6]]);
    await h.seed(10); await h.step(20);
    await page.evaluate(() => { window.__game.enemies[1].ready = () => false; window.__game.enemies[0].ready = () => false; });
    await focus(0); await cam({ side: 3.2, up: 1.5, back: 0.3 });
    await film('throw-paired', 24, 3, async (i) => { if (i === 0) await h.tap('KeyG'); });
  },
  async getup() {
    await placeSquad(page, 'start', [['grunt', 0, 2.2]]);
    await h.seed(12); await h.step(20);
    await focus(0); await cam({ side: 3.6, up: 1.4, back: 0.3, on: 'target' });
    await page.evaluate(() => { const G = window.__game, e = G.enemies[0]; e.ready = () => false; e.applyHit({ outcome: 'knockdown', damage: 0, stun: 0 }, G.hero.pos, { power: 1.6, launch: 6 }); });
    await film('launch-fall-getup', 36, 6);
  },
  async react() {
    await placeSquad(page, 'start', [['grunt', 0, 2.2]]);
    await h.seed(13); await h.step(20);
    await page.evaluate(() => { const e = window.__game.enemies[0]; e.ready = () => false; e.health = 99; });
    await focus(0); await cam({ side: 3.2, up: 1.5, back: 0.3 });
    await film('beating', 24, 4, async (i) => { if (i % 4 === 0 && i < 16) await h.tap('Mouse0'); });
  },
};

for (const [name, fn] of Object.entries(SCENES)) {
  if (only.length && !only.includes(name)) continue;
  try { await boot(); await fn(); console.log(name, 'filmed'); } catch (e) { console.log(name, 'failed:', e.message.split(String.fromCharCode(10))[0]); }
}
if (log.length) { console.log(log.join('\n')); writeFileSync(`${out}/log.txt`, log.join('\n') + '\n'); }
console.log(h.errors.length ? h.errors.join('\n') : 'no page errors');
await h.close();
