// [onboard] Plays Night One through REAL inputs on the deterministic virtual clock
// (scripts/anim-lib.mjs) and logs every moment the game takes something away from the player:
// control lost (a comic, a cinematic, a frozen hero, a non-play flow mode), a story teleport or
// re-pose, a camera snap, a comic page, the HUD hidden (a fade), and each objective change with how
// it was bridged (a goal revealed on the approach, lines over play, a banner) or not.
//
// The scripted player: steers the camera toward the marker and runs (W + sprint), grapples (F)
// when the goal is above and a grapple point is lit, walks off edges and holds jump to glide when it
// is below, fights by counters (right mouse on a windup), punches and kicks, walks up to the
// Batmobile and presses T, reads comic pages for 2.5 s each and turns them with Space. Chases and
// the drone battle are finished through vehicles.debugWin() after a short real drive (logged as an
// assist), and if the player is stuck for 25 s it is nudged toward the goal (logged as an assist:
// the bot's, not the game's).
//
// usage: node scripts/onboard-sim.mjs [url] [minutes=20] [out.json]
//   e.g. node scripts/onboard-sim.mjs http://localhost:5830/ 20 docs/design/shots/onboard/sim-after.json
import { openGame } from './anim-lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5830/';
const minutes = Number(process.argv[3] ?? 20);
const outFile = process.argv[4] ?? null;
const q = process.env.Q ?? '?new=1&skip=1&abilities=story';

function installBot() {
  const V = window.__v, G = window.__game;
  const B = window.__bot = { keys: new Set(), release: [], log: [], steps: [], lost: [], readT: 0, stuckT: 0, best: Infinity, lastStep: null, assists: 0, frame: 0, chaseT: 0, attackT: 0, lostOpen: null, hudHidden: false };
  const now = () => V.frame / 60;
  const ev = (type, data = {}) => B.log.push({ t: +now().toFixed(2), type, ...data });
  const key = (code, down) => {
    if (down === B.keys.has(code)) return;
    if (down) B.keys.add(code); else B.keys.delete(code);
    if (code.startsWith('Mouse')) window.dispatchEvent(new MouseEvent(down ? 'mousedown' : 'mouseup', { button: Number(code.slice(5)), bubbles: true }));
    else window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  };
  const tap = (code) => { key(code, true); B.release.push([code, V.frame + 2]); };
  const releaseAll = () => { for (const c of [...B.keys]) key(c, false); };
  // ---- instrumentation (what the GAME does) ----
  let botTp = false;
  const tp = G.hero.teleport.bind(G.hero);
  G.hero.teleport = (...a) => { if (!botTp) ev(G.vehicles?.active || G.batwing?.active ? 'vehicleExitPlace' : 'teleport', { step: G.flow.objectives.step?.id }); return tp(...a); };
  const snap = G.follow.snapBehind.bind(G.follow);
  G.follow.snapBehind = (...a) => { ev('cameraSnap', { step: G.flow.objectives.step?.id }); return snap(...a); };
  const setVis = G.hud.setVisible;
  G.hud.setVisible = (v) => { if (!v !== B.hudHidden) { B.hudHidden = !v; ev(v ? 'hudShown' : 'hudHidden', { step: G.flow.objectives.step?.id }); } return setVis(v); };
  G.events.on('step', ({ step }) => {
    // revealed: how far the goal after the step just left had been revealed on the approach (the
    // highest .hud-arrive opacity seen during it; 0 on a build without it).
    const prev = B.steps.at(-1);
    if (prev) prev.revealedNext = +(B.maxArrive ?? 0).toFixed(2);
    B.maxArrive = 0;
    B.steps.push({ t: +now().toFixed(2), id: step.id, type: step.type ?? 'reach', lines: step.lines?.length ?? 0, talkOver: !!step.talk, title: !!step.title, revealed: 0 });
  });
  G.events.on('cutscene', ({ name, on }) => ev(on ? 'comicOn' : 'comicOff', { name }));
  G.events.on('objectiveReveal', ({ text }) => ev('banner', { text: text.slice(0, 40) }));
  G.events.on('abilityUnlocked', ({ id }) => ev('ability', { id }));
  G.events.on('abilityLearned', ({ id }) => ev('learned', { id }));
  // ---- the player ----
  const fwd = new (G.hero.pos.constructor)();
  const steerTo = (x, z, rate = 0.25) => {
    const want = Math.atan2(x - G.hero.pos.x, z - G.hero.pos.z);
    const s = G.follow.state;
    const d = Math.atan2(Math.sin(want - s.yaw), Math.cos(want - s.yaw));
    s.yaw += Math.max(-rate, Math.min(rate, d));
    return Math.abs(d);
  };
  const lostNow = () => {
    if (G.comic?.playing) return 'comic';
    if (G.cinematic?.active) return 'cinematic';
    if (G.flow.mode !== 'play' && G.flow.mode !== 'dead') return `mode:${G.flow.mode}`;
    if (G.hero.frozen) return 'frozen';
    return null;
  };
  V.after.push(() => {
    B.frame++;
    for (let i = B.release.length - 1; i >= 0; i--) if (B.release[i][1] <= V.frame) { key(B.release[i][0], false); B.release.splice(i, 1); }
    // Control-loss segments.
    const lost = lostNow();
    if (lost && !B.lostOpen) B.lostOpen = { t0: now(), why: lost, step: G.flow.objectives.step?.id };
    if (!lost && B.lostOpen) { B.lost.push({ ...B.lostOpen, secs: +(now() - B.lostOpen.t0).toFixed(2) }); B.lostOpen = null; }
    if (B.frame % 4) return;
    { const el = document.querySelector('.hud-arrive'); if (el) B.maxArrive = Math.max(B.maxArrive ?? 0, Number(el.style.opacity || 0)); }
    const s = G.flow.objectives.step;
    if (!s) return;
    if (s.id !== B.lastStep) { B.lastStep = s.id; B.best = Infinity; B.stuckT = 0; B.chaseT = 0; }
    // A comic page: read it, then turn it.
    if (G.comic?.playing) { releaseAll(); B.readT += 4 / 60; if (B.readT > 2.5) { B.readT = 0; tap('Space'); } return; }
    B.readT = 0;
    if (lost) { releaseAll(); return; }
    const veh = G.vehicles;
    // Chases and the drone battle: drive a little for real, then finish (assist).
    if (s.type === 'chase' || s.type === 'battle' || s.type === 'armada') {
      B.chaseT += 4 / 60;
      key('KeyW', true);
      if (B.chaseT > 8 && (veh?.debugWin?.() || G.batwing?.debugWin?.())) { B.assists++; ev('assist', { what: 'vehicle debugWin', step: s.id }); B.chaseT = -999; }
      return;
    }
    const enemies = G.combat.enemies.filter((e) => e.alive && !e.down && e.pos.distanceTo(G.hero.pos) < 30 && Math.abs(e.pos.y - G.hero.pos.y) < 6);
    if (s.type === 'fight' && !enemies.length && G.combat.enemies.some((e) => e.alive)) { B.quietT = (B.quietT ?? 0) + 4 / 60; if (B.quietT > 40) { B.quietT = 0; B.assists++; ev('assist', { what: 'winFight (stealth)', step: s.id }); G.winFight(); } }
    if (enemies.length && !veh?.active) {
      // Fight: counter a windup, else close in and swing.
      key('KeyW', false); key('ShiftLeft', false); key('Space', false);
      const near = enemies.reduce((a, e) => (e.pos.distanceTo(G.hero.pos) < a.pos.distanceTo(G.hero.pos) ? e : a));
      steerTo(near.pos.x, near.pos.z, 0.5);
      if (enemies.some((e) => e.state === 'windup' && e.def.counterable && e.pos.distanceTo(G.hero.pos) < 7)) { tap('Mouse2'); return; }
      const d = near.pos.distanceTo(G.hero.pos);
      key('KeyW', d > 6);
      B.attackT++;
      // A fight the scripted player can't crack in 75 s (a brute, a stealth room): finished as an assist.
      B.fightT = (B.fightStep === s.id ? B.fightT : 0) + 4 / 60; B.fightStep = s.id;
      if (B.fightT > 75) { B.fightT = 0; B.assists++; ev('assist', { what: 'winFight', step: s.id }); G.winFight(); }
      if (B.attackT % 3 === 0) tap(B.attackT % 9 === 0 ? 'KeyE' : 'Mouse0');
      return;
    }
    // Travel: the marker (or the step's site).
    const tgt = G.flow.markerTarget ?? G.flow.target;
    if (!tgt) { releaseAll(); return; }
    // Board: walk to the car, press T beside it.
    if (s.type === 'board' && veh?.batmobile && !veh.active) {
      const c = veh.batmobile.group.position;
      steerTo(c.x, c.z);
      const d = Math.hypot(c.x - G.hero.pos.x, c.z - G.hero.pos.z);
      key('KeyW', d > 3); key('ShiftLeft', d > 8);
      if (d < 4.5 && !veh.batmobile.arriving) tap('KeyT');
      if (d < B.best - 1) { B.best = d; B.stuckT = 0; } else B.stuckT += 4 / 60;
    } else {
      if (veh?.active) { tap('KeyT'); return; }
      const dx = tgt.x - G.hero.pos.x, dz = tgt.z - G.hero.pos.z, dxz = Math.hypot(dx, dz), dy = tgt.y - G.hero.pos.y;
      steerTo(tgt.x, tgt.z);
      const close = dxz < 2.5;
      key('KeyW', !close); key('ShiftLeft', dxz > 12 && G.hero.state !== 'glide');
      // Look up at a goal above, level otherwise.
      G.follow.state.pitch = dy > 4 ? -0.25 : 0.12;
      if (dy > 3 && G.hero.grounded && G.grapple?.target && G.hero.state !== 'roll') tap('KeyF');
      // Gliding toward a goal below: hold jump in the air while there is height to spend.
      const air = G.hero.state === 'air' || G.hero.state === 'glide';
      key('Space', air && dy < -2 && dxz > 6);
      if (G.hero.state === 'glide' && dxz < 18 && dy < -7) tap('KeyE'); // a dive bomb onto the goal
      const d = Math.hypot(dxz, dy);
      if (d < B.best - 1) { B.best = d; B.stuckT = 0; } else B.stuckT += 4 / 60;
    }
    if (B.stuckT > 25) {
      B.stuckT = 0; B.best = Infinity; B.assists++;
      ev('assist', { what: 'nudge toward goal', step: s.id });
      botTp = true;
      B.nudges = B.lastNudgeStep === s.id ? (B.nudges ?? 0) + 1 : 1; B.lastNudgeStep = s.id;
      const p = G.hero.pos, f = B.nudges >= 2 ? 1 : Math.min(1, 25 / Math.max(1, Math.hypot(tgt.x - p.x, tgt.z - p.z)));
      G.teleport({ x: p.x + (tgt.x - p.x) * f, y: tgt.y + 2, z: p.z + (tgt.z - p.z) * f });
      botTp = false;
    }
  });
  void fwd;
}

const h = await openGame(url, '');
await h.goto(q);
await h.run();
await h.page.waitForTimeout(3000);
await h.freeze();
await h.seed(7);
// The title is skipped by ?new=1&skip=1; the intro comic starts on its own.
await h.page.evaluate(installBot);
const total = Math.round(minutes * 60 * 60);
let done = 0;
const t0 = Date.now();
while (done < total) {
  await h.step(600);
  done += 600;
  const st = await h.page.evaluate(() => ({ id: window.__game.flow.objectives.step?.id, mode: window.__game.flow.mode }));
  process.stdout.write(`\r${(done / 3600).toFixed(1)} min  step ${st.id} (${st.mode})   real ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
  if (st.mode === 'credits') break;
}
const res = await h.page.evaluate(() => { const B = window.__bot; if (B.lostOpen) B.lost.push({ ...B.lostOpen, secs: +((window.__v.frame / 60) - B.lostOpen.t0).toFixed(2), open: true }); return { steps: B.steps, log: B.log, lost: B.lost, assists: B.assists, frames: window.__v.frame }; });
await h.close();
console.log();
const count = (type) => res.log.filter((e) => e.type === type).length;
const lostSecs = res.lost.reduce((a, l) => a + l.secs, 0);
const byWhy = {};
for (const l of res.lost) byWhy[l.why] = +((byWhy[l.why] ?? 0) + l.secs).toFixed(1);
const unbridged = res.steps.filter((s, i) => i > 0 && s.type !== 'cutscene' && !s.lines && !s.title && !(res.steps[i - 1].revealedNext >= 0.5) && !['fight', 'boss', 'credits'].includes(s.type));
const summary = {
  minutes: +(res.frames / 3600).toFixed(1), stepsReached: res.steps.length, lastStep: res.steps.at(-1)?.id,
  controlLostSeconds: +lostSecs.toFixed(1), controlLostByReason: byWhy, controlLostSegments: res.lost.length,
  storyTeleports: count('teleport'), cameraSnaps: count('cameraSnap'), comicsShown: count('comicOn'), hudHidden: count('hudHidden'),
  objectiveChanges: res.steps.length - 1, unbridgedObjectiveChanges: unbridged.map((s) => s.id), revealedOnApproach: res.steps.filter((s) => s.revealedNext >= 0.5).map((s) => s.id),
  abilitiesInOrder: res.log.filter((e) => e.type === 'ability').map((e) => e.id), learned: res.log.filter((e) => e.type === 'learned').map((e) => e.id),
  botAssists: res.assists,
};
console.log(JSON.stringify(summary, null, 1));
for (const l of res.lost) console.log(`  lost ${String(l.secs).padStart(6)} s  ${l.why.padEnd(16)} at ${l.step}`);
for (const e of res.log.filter((x) => x.type === 'teleport' || x.type === 'cameraSnap')) console.log(`  ${e.type.padEnd(10)} t=${e.t} at ${e.step}`);
if (outFile) { mkdirSync(dirname(outFile), { recursive: true }); writeFileSync(outFile, JSON.stringify({ summary, ...res }, null, 1)); }
