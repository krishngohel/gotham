// [polish] HUD clutter shots: reproduces the busiest real situations (driving with everything up,
// a bomb crime, a boss fight, split screen, a Bruce scene, compact HUD), forcing the panels through
// window.__game, and saves one frame each. Also prints every pair of visible HUD panels that
// overlap (the layout check).
// usage: node scripts/hud-shots.mjs <base url> <out dir> [only,names]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const [base = 'http://localhost:5871/', out = 'shots-hud', only = ''] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const want = only ? new Set(only.split(',')) : null;
const ready = () => window.__game?.state?.ready && window.__game.state.frame > 30;

// Everything a busy drive can put up at once.
const clutter = () => {
  const G = window.__game;
  const H = G.hud.forPlayer ? G.hud.forPlayer(G.players[0]) : G.hud;
  G.hud.card('WAYNETECH DELIVERY!', 'Lucius sent new toys: Explosive Gel and Batclaw. Hold Tab for the gadget wheel.', 20000);
  G.prompts?.show?.(['drive'], { first: true });
  const drive = 'Driving: <kbd>W</kbd> gas, <kbd>S</kbd> brake and reverse, <kbd>A</kbd> <kbd>D</kbd> steer. Hold <kbd>Space</kbd> to drift round corners, <kbd>Shift</kbd> to boost. <kbd>T</kbd> gets out, and at speed it launches you into a glide.';
  for (const h of G.hud.all ? G.hud.all() : [G.hud]) h.hint(drive, 20000);
  G.radio.say([{ speaker: 'Gordon', portrait: 'gordon', text: "Cargo is safe. Now the airwaves. A truck full of transmitter gear went east into Neon Row, and that's where his broadcast is coming from." }]);
  G.side.ui.radio('POLICE RADIO', 'Bomb threat in the Loop', 20000);
  G.side.ui.toast('Getaway car: stopped', 'Lower Gotham is a little safer. Grade B. Crimes stopped: 6.', 20000);
  G.wanted?.set?.(2);
  void H;
};
const words = () => {
  const G = window.__game;
  const H = G.hud.forPlayer ? G.hud.forPlayer(G.players[0]) : G.hud;
  H.sfx('BAZZAP!', innerWidth * 0.48, innerHeight * 0.4, true);
  H.sfx('BAZZAP!', innerWidth * 0.82, innerHeight * 0.52, true);
  H.sfx('KRAKOOM!', innerWidth * 0.5, innerHeight * 0.18, true);
  H.sfx('POW!', innerWidth * 0.2, innerHeight * 0.5);
};

async function boot(page, q) {
  await page.goto(base + q);
  await page.waitForFunction(ready, null, { timeout: 120000 });
  for (let i = 0; i < 20; i++) {
    const busy = await page.evaluate(() => {
      const G = window.__game;
      if (G.cinematic?.active) { G.cinematic.skip(); return true; }
      if (G.comic?.playing) { G.comic.skip(); return true; }
      if (G.radio?.playing) { G.radio.skip(); return true; }
      return false;
    });
    if (!busy && i > 3) break;
    await page.waitForTimeout(250);
  }
  await page.mouse.click(640, 400);
}

// Visible HUD panels and their rects; pairs that overlap.
const overlaps = () => {
  const sel = ['.hud-caption', '.hud-card.show', '.hud-hint.show', '.hud-banner.show', '.hud-boss.show', '.hud-chips .hud-chip', '.hud-health', '.ghud',
    '.minimap', '.wanted-readout.show', '.side-hud .radio.show', '.side-hud .side-toast.show', '.ch-panel.show', '.dlg-panel.show', '.ow-panel .ow-job.show',
    '.autosave-mark.show', '.bw-meters.show', '.bw-goal.show', '.bw-choices.show', '.vehicle-toast', '.radio-dial.show', '.fps', '.bw-ticker > div', '.hud-under .ow-list'];
  const vis = (e) => { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; let p = e.parentElement; while (p) { const ps = getComputedStyle(p); if (ps.display === 'none' || +ps.opacity < 0.05) return false; p = p.parentElement; } const r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2; };
  const boxes = [];
  for (const s of sel) for (const e of document.querySelectorAll(s)) if (vis(e)) { const r = e.getBoundingClientRect(); boxes.push({ s, r: [r.left, r.top, r.right, r.bottom].map(Math.round) }); }
  const hits = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r;
    if (a[0] < b[2] - 2 && b[0] < a[2] - 2 && a[1] < b[3] - 2 && b[1] < a[3] - 2) hits.push(`${boxes[i].s} x ${boxes[j].s}`);
  }
  return { boxes: boxes.map((b) => `${b.s} ${b.r.join(',')}`), hits };
};

const SCENES = {
  async drive(page, extra = '') {
    await boot(page, `?at=toNeon&god=1&new=1&weather=clear${extra}`);
    await page.evaluate(() => { const g = window.__game; g.teleport({ x: -30, y: 0, z: -150 }); g.vehicles.summon('batmobile', { instant: true }); g.vehicles.enter(g.vehicles.batmobile); });
    await page.waitForTimeout(1500);
    await page.evaluate(clutter);
    await page.waitForTimeout(900);
    await page.evaluate(words);
    await page.waitForTimeout(350);
  },
  async compact(page) {
    await SCENES.drive(page, '');
    await page.evaluate(() => { const G = window.__game; G.settings.access.compactHud = true; for (const h of G.hud.all()) h.setCompact(true); G.hud.card('WAYNETECH DELIVERY!', 'Lucius sent new toys: Explosive Gel and Batclaw.', 20000); G.side.ui.radio('POLICE RADIO', 'Bomb threat in the Loop', 20000); });
    await page.waitForTimeout(700);
  },
  async bomb(page) {
    await boot(page, '?night=n2&god=1&new=1&weather=clear');
    await page.evaluate(() => {
      const G = window.__game, O = G.side.openworld;
      O.crimes.cancelAll();
      const spot = O.ow.spotById('loopMarqueeRow');
      G.teleport({ x: spot.x + 10, y: spot.y, z: spot.z + 6 });
      const c = O.crimes.spawnNow({ type: 'bomb', spot, twists: [], life: 1e6 });
      c.forcedFocus = true;
    });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const G = window.__game;
      G.side.ui.radio('POLICE RADIO', 'Bomb threat in the Loop', 20000);
      G.side.ui.toast('Getaway car: stopped', 'Lower Gotham is a little safer. Grade B. Crimes stopped: 6.', 20000);
      G.radio.say([{ speaker: 'GOON', portrait: 'goon', text: 'Mr. Cobblepot said nobody comes to Diamond Row at night. Mr. Cobblepot is wrong a lot lately.' }]);
      G.wanted?.set?.(1);
    });
    await page.waitForTimeout(1500);
    await page.evaluate(words);
    await page.waitForTimeout(350);
  },
  async boss(page) {
    await boot(page, '?new=1&night=n8&at=n8Boss&bruceDays=0&god=1');
    for (let k = 0; k < 20 && !(await page.evaluate(() => window.__game.bosses?.active)); k++) {
      await page.evaluate(() => window.__game.comic?.skip?.());
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
    }
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      const G = window.__game;
      G.radio.say([{ speaker: 'Alfred', portrait: 'alfred', text: 'His armour takes everything from the front, sir. Get behind him.' }]);
      G.hud.card('LEVEL UP!', 'Press Esc and open WayneTech to spend your upgrade point.', 20000);
      G.hud.hint('Brutes can\'t be countered: their bolt is red. Dodge with <kbd>Ctrl</kbd>.', 20000);
    });
    await page.waitForTimeout(900);
    await page.evaluate(words);
    await page.waitForTimeout(350);
  },
  async split(page) {
    await boot(page, '?at=toNeon&god=1&new=1&weather=clear&p2=bot');
    await page.waitForFunction(() => window.__game.players.length > 1, null, { timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.evaluate(clutter);
    await page.waitForTimeout(900);
    await page.evaluate(() => { const G = window.__game; for (const p of G.players) { const H = G.hud.forPlayer(p); const v = H.viewSize(); H.sfx('BAZZAP!', v.w * 0.5, v.h * 0.4, true); H.sfx('POW!', v.w * 0.8, v.h * 0.6); } });
    await page.waitForTimeout(350);
  },
  async gala(page) {
    await boot(page, '?at=start&god=1&new=1&weather=clear&bruceScene=gala');
    await page.waitForFunction(() => !!window.__game.bruce.scene, null, { timeout: 20000 });
    for (let guard = 0; guard < 300; guard++) {
      const st = await page.evaluate(() => {
        const G = window.__game, B = G.bruce, sc = B.scene;
        if (!sc) return { wait: true };
        if (G.radio?.playing) { G.radio.skip(); return { wait: true }; }
        const m = sc.machine;
        return { type: m.node.type, target: m.node.target?.station ?? null, choices: B.ui.choicesOpen };
      });
      if (st.type === 'pressure' && st.choices) break;
      if (st.type === 'choice' && st.choices) { await page.keyboard.press('Digit1'); await page.waitForTimeout(150); continue; }
      if (st.type === 'goto' && st.target) {
        await page.evaluate((id) => {
          const G = window.__game, B = G.bruce, s = B.POCKETS.wayneManor.stations[id];
          const p = B.pockets.toWorld('wayneManor', { x: s.x, y: s.y ?? 0, z: s.z });
          const g = G.world.collision.groundBelow(p.x, p.y + 2, p.z, 0.3);
          G.hero.teleport({ x: p.x, y: g > -Infinity ? g : p.y, z: p.z }, 0);
        }, st.target);
        await page.waitForTimeout(200);
        continue;
      }
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => { const G = window.__game; G.bruce.ui?.changes?.([{ what: 'standing', delta: -6, reason: 'left the gala mid-toast' }, { what: 'patience', delta: -4, reason: 'Alfred covered' }]); });
    await page.waitForTimeout(600);
  },
  async galawalk(page) {
    await boot(page, '?at=start&god=1&new=1&weather=clear&bruceScene=gala');
    await page.waitForTimeout(4500);
    await page.evaluate(() => window.__game.radio?.skip?.());
    await page.waitForTimeout(600);
  },
};

const browser = await chromium.launch({ headless: true, args: ['--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-gpu'] });
for (const [name, fn] of Object.entries(SCENES)) {
  if (want && !want.has(name)) continue;
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  try {
    await fn(page);
    await page.screenshot({ path: `${out}/${name}.png` });
    const o = await page.evaluate(overlaps);
    console.log(`== ${name}: ${o.hits.length} overlaps`);
    for (const h of o.hits) console.log('   ', h);
    if (process.env.BOXES) for (const b of o.boxes) console.log('     ', b);
  } catch (e) { console.log(`== ${name}: FAILED ${e.message.split('\n')[0]}`); }
  if (errs.length) console.log('   errors:', errs.slice(0, 3).join(' | '));
  await page.close();
}
await browser.close();
