// Animation audit on a virtual clock (scripts/anim-lib.mjs): every frame is exactly 1/60 s and every
// input lands on a known frame, so two runs of the same build give the same numbers and a
// before/after comparison means something.
//
// Samples the hero's and nearby enemies' hands, feet, head and pelvis after every frame, as world
// offsets from the character's root position (walking doesn't count; turning does, so a facing
// snap counts), and flags any frame where a bone leaves its smooth path: the distance from where
// constant velocity would have put it. A snap between clips, a loop seam, an IK jump, a facing
// snap shows up as one big error frame.
//
// Not counted (listed separately): frames under a comic, a cinematic or any non-play flow mode
// (staged poses), and a character's first frames after a teleport (hero.teleport, e.place, the
// harness's own placement) or after a root jump of more than 1.2 m in one frame.
//
//   node scripts/anim-audit.mjs <url> <outDir> [seeded|moves|traverse|fight|extras|all]
// Prints per scenario x who (hero / enemy) the counts over 0.25 / 0.5 / 1 m and the worst
// events by clip pair with their frame numbers; writes <outDir>/audit.json. SHOTS=1 screenshots
// each event over 0.25 m (the frame it happened).
import { mkdirSync, writeFileSync } from 'node:fs';
import { openGame, placeSquad, fightStep } from './anim-lib.mjs';

const [url = 'http://localhost:5620/', out = 'anim-audit', which = 'all'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const POP = Number(process.env.POP ?? 0.08);
const SHOTS = !!process.env.SHOTS;

// In the page: the sampler, run after every virtual frame.
const sampler = ({ POP }) => {
  const A = window.__audit = { slide: {}, perLabel: {}, events: [], skipped: { staged: 0, teleport: 0 }, label: '', frames: 0, prev: new Map(), chars: new Map(), shot: [] };
  const BONES = ['hand_l', 'hand_r', 'foot_l', 'foot_r', 'Head', 'pelvis'];
  const FEET = ['foot_l', 'foot_r'];
  const wv = { x: 0, y: 0, z: 0 };
  // Teleports reset a character's history: hero.teleport, e.place, G.teleport are wrapped once
  // the game exists.
  A.mark = (id) => { const c = A.chars.get(id); if (c) c.reset = true; };
  let wrapped = false;
  const wrap = (G) => {
    wrapped = true;
    const ht = G.hero.teleport?.bind(G.hero);
    if (ht) G.hero.teleport = (...a) => { A.mark('hero'); return ht(...a); };
    const sp = G.spawn;
    G.spawn = (...a) => { const e = sp(...a); const pl = e.place; e.place = (...b) => { A.mark(e.id); return pl(...b); }; return e; };
    for (const e of G.enemies ?? []) { const pl = e.place; e.place = (...b) => { A.mark(e.id); return pl(...b); }; }
  };
  const sample = () => {
    const G = window.__game;
    if (!G?.hero?.bat) return;
    if (!wrapped && G.spawn) wrap(G);
    if (!A.label) return;
    // Staged: comics, cinematics, cutscene flow modes pose characters by hand.
    if (G.comic?.playing || G.cinematic?.active || (G.flow && G.flow.mode !== 'play' && G.flow.mode !== 'dead')) { A.skipped.staged++; A.prev.clear(); A.chars.clear(); return; }
    A.frames++;
    A.perLabel[A.label] = (A.perLabel[A.label] ?? 0) + 1;
    const frame = window.__v.frame - (A.labelAt ?? 0);
    const who = [['hero', G.hero.bat, G.hero]];
    for (const e of G.enemies ?? []) if (e.ch?.bone && e.ch.root.visible && (e.alive || e.state === 'ko') && e.pos.distanceTo(G.hero.pos) < 20) who.push([e.id, e.ch, e]);
    for (const [id, ch, owner] of who) {
      const root = ch.root ?? ch.model?.parent?.parent;
      if (!root || !ch.animator?.mixer) continue;
      const clip = ch.animator.currentName ?? null;
      const mt = ch.animator.mixer.time, act = ch.animator.currentAction;
      root.updateMatrixWorld(true);
      wv.x = root.position.x; wv.y = root.position.y; wv.z = root.position.z;
      let c = A.chars.get(id);
      const fresh = !c || c.frame !== A.frames - 1 || c.reset;
      const jump = c && Math.hypot(wv.x - c.rx, wv.y - c.ry, wv.z - c.rz) > 1.2;
      if (fresh || jump) {
        if (c && (c.reset || jump)) A.skipped.teleport++;
        c = { mt, clip, actT: act?.time ?? 0, changedAt: -1, skip: 2 };
        for (const n of BONES) { A.prev.delete(id + '/' + n); A.prev.delete(id + '/slide/' + n); }
      }
      c.reset = false; c.frame = A.frames; c.rx = wv.x; c.ry = wv.y; c.rz = wv.z;
      const gdt = mt - c.mt;
      const actT = act?.time ?? 0;
      if (clip !== c.clip || actT + 1e-4 < c.actT) { c.changedAt = mt; c.prevClip = c.clip; }
      c.mt = mt; c.clip = clip; c.actT = actT;
      A.chars.set(id, c);
      if (c.skip > 0) { c.skip--; }
      if (gdt < 0.002) { for (const n of BONES) { A.prev.delete(id + '/' + n); A.prev.delete(id + '/slide/' + n); } continue; }
      const transition = c.changedAt >= 0 && mt - c.changedAt < 0.2;
      // Foot slide: a foot the animation holds still on the floor (low, barely moving in root
      // space) that moves across the world anyway (the root warped or slid under it).
      for (const n of FEET) {
        const bone = ch.bone(n);
        if (!bone) continue;
        const wp = bone.getWorldPosition(bone.position.clone());
        const lp = root.worldToLocal(wp.clone());
        const key = id + '/slide/' + n;
        const f = A.prev.get(key);
        if (f && !c.skip) {
          const lv = Math.hypot(lp.x - f.l.x, lp.z - f.l.z) / gdt;
          if (lp.y < 0.2 && lv < 0.6) {
            const k = A.label.split(':')[0] + ' | ' + (id === 'hero' ? 'hero' : 'enemy') + (window.__slideBy ? ' | ' + (ch.graph?.state ?? '-') : '');
            const r = A.slide[k] ?? (A.slide[k] = { m: 0, frames: 0 });
            r.m += Math.hypot(wp.x - f.w.x, wp.z - f.w.z); r.frames++;
          }
        }
        A.prev.set(key, { w: wp, l: lp });
      }
      for (const n of BONES) {
        const bone = ch.bone(n);
        if (!bone) continue;
        // World offset from the root's position: walking doesn't count, turning does (a facing
        // snap is a pop on screen), and a root re-placed under a running blend (an aligned
        // get-up, a paired grab) does not, as long as nothing moves in the world.
        const p = bone.getWorldPosition(bone.position.clone()).sub(root.position);
        const key = id + '/' + n;
        const hst = A.prev.get(key);
        if (hst && hst.p1 && hst.p0) {
          const k = gdt / hst.dt1;
          const px = hst.p1.x + (hst.p1.x - hst.p0.x) * k, py = hst.p1.y + (hst.p1.y - hst.p0.y) * k, pz = hst.p1.z + (hst.p1.z - hst.p0.z) * k;
          const err = Math.hypot(p.x - px, p.y - py, p.z - pz);
          if (err > POP) {
            const ev = { frame, label: A.label, who: id === 'hero' ? 'hero' : 'enemy', id, type: id === 'hero' ? 'hero' : owner.type, bone: n, err: +err.toFixed(3), clip, prevClip: transition ? (c.prevClip ?? clip) : clip, ct: +(actT).toFixed(3), transition, state: owner.state ?? null, gstate: ch.graph?.state ?? null, control: owner.control?.name ?? null, blending: !!ch.animator.blending, dead: owner.alive === false };
            A.events.push(ev);
            if (err > 0.25) A.shot.push(ev);
          }
        }
        A.prev.set(key, { p0: hst?.p1 ?? null, p1: p, dt1: gdt, clip });
      }
    }
  };
  (window.__v.after ??= []).push(sample);
};

const h = await openGame(url, '', { init: [[sampler, { POP }]] });
const { page } = h;
let shots = 0;
const label = (l) => page.evaluate((l) => { window.__audit.label = l; window.__audit.labelAt = window.__v.frame; window.__audit.prev.clear(); window.__audit.chars.clear(); }, l);
const reset = () => page.evaluate(() => { window.__audit.prev.clear(); window.__audit.chars.clear(); });
// Steps n frames; with SHOTS, screenshots every big event as it happens (one per frame step).
const step = async (n) => {
  if (!SHOTS) return h.step(n);
  for (let i = 0; i < n; i++) {
    await h.step(1);
    const s = await page.evaluate(() => { const A = window.__audit; const s = A.shot[0]; A.shot.length = 0; return s ?? null; });
    if (s && shots < 60) await page.screenshot({ path: `${out}/${String(shots++).padStart(2, '0')}-f${s.frame}-${s.label.replace(/\W+/g, '_')}-${s.type}-${s.bone}-${(s.prevClip ?? '')}_${s.clip}.jpg`.slice(0, 220), quality: 70 });
  }
};
const ms = (x) => Math.round(x * 60 / 1000);
const boot = async (q, seed = 7) => {
  await h.goto(q);
  if (process.env.SLIDE_BY) await page.evaluate(() => { window.__slideBy = true; });
  await h.skipStaged(40, 3);
  await h.packs();
  await h.skipStaged(40, 3);
  // FOOTLOCK=1 / 0 overrides the tier's foot locking (src/anim/quality.js window.__animFlags).
  if (process.env.FOOTLOCK !== undefined) await page.evaluate((on) => window.__animFlags.setFootLockEnabled(on), process.env.FOOTLOCK === '1');
  await h.seed(seed);
  await label('');
};

// --- The seeded fight: three fixed waves on the GCPD roof (every melee role), a scripted
// competent player (scripts/anim-lib.mjs fightStep). Each wave runs until it is down or 40 s.
export const WAVES = [
  [['grunt', -3, 4], ['grunt', 3, 4.5], ['knife', 0, 6], ['grunt', -5, 1], ['brute', 5, 7]],
  [['shield', -3, 4], ['baton', 3, 4.5], ['grunt', 0, 6], ['knife', -5, 1], ['medic', 5, 7]],
  [['ninja', -3, 4], ['heavy', 3, 5], ['grunt', 0, 6], ['grunt', -5, 1], ['knife', 5, 6]],
];
async function seeded() {
  // The GCPD roof under ?fight=test: no story fight there to start mid-run and replace the squad.
  await boot('?fight=test&god=1');
  let w = 0;
  for (const wave of WAVES) {
    // Seeded before the squad is made: spawning and setEnemies draw from the rng (idle poses,
    // the director's opening holds, fear).
    await h.seed(11 + w);
    await placeSquad(page, 'start', wave);
    await h.seed(11 + w);
    await h.step(30);
    await label('seeded: wave ' + (++w));
    for (let i = 0; i < 160; i++) {
      const a = await fightStep(h, 'competent', i);
      if (a === 'none') break;
      await h.tap(a, 2);
      await step(13);
    }
    await step(60);
  }
}

// --- Combat moves: every movement combo and the rotations, one goon pinned on the roof.
async function moves() {
  // The GCPD roof under ?fight=test with one fresh grunt (the story fight f1's goons had been
  // running about for however long the packs took to load: not repeatable).
  await boot('?fight=test&god=1');
  await h.seed(7);
  await placeSquad(page, 'start', [['grunt', 0, 3]]);
  await h.seed(7);
  await h.step(30);
  await page.evaluate(() => { const h = window.__game.hero; window.__roof = { x: h.pos.x, y: h.pos.y, z: h.pos.z }; });
  const setup = (d = 2.5, down = false) => page.evaluate(([d, down]) => {
    const G = window.__game, h = G.hero, c = window.__roof;
    let live = G.enemies.filter((e) => e.alive && e.type !== 'joker');
    if (!live.length) { const g = G.spawn('grunt', { x: c.x, y: c.y, z: c.z + 3 }); G.combat.setEnemies([...G.enemies.filter((x) => x.alive), g]); g.wake?.(); live = [g]; }
    const e = live[0];
    for (const o of live.slice(1)) { o.place({ x: c.x + 8, y: c.y, z: c.z - 8 }, 0); o.state = 'idle'; o.aware = false; }
    e.health = 99; e.down = false; e.air = false; e.stunned = false;
    e.vel?.set(0, 0, 0); e.knock?.set(0, 0, 0);
    e.place({ x: c.x, y: c.y, z: c.z + 3 }, Math.PI);
    e.state = 'engage';
    h.control = null; h.state = 'ground'; h.vel.set(0, 0, 0);
    h.pos.set(c.x, c.y, c.z + 3 - d);
    h.bat.face(0);
    if (down) e.applyHit({ outcome: 'knockdown' }, h.pos, { power: 0.2 });
    window.__audit.mark('hero');
  }, [d, down]).then(() => h.step(down ? 72 : 15)).then(reset);
  const keyFor = (want) => page.evaluate((want) => {
    const G = window.__game, h = G.hero;
    const e = G.enemies.find((x) => x.alive && x.type !== 'joker' && x.pos.distanceTo(h.pos) < 15);
    const f = G.follow.forward(h.pos.clone()), r = G.follow.right(h.pos.clone());
    const dirs = { KeyW: [f.x, f.z], KeyS: [-f.x, -f.z], KeyD: [r.x, r.z], KeyA: [-r.x, -r.z] };
    const tx = e.pos.x - h.pos.x, tz = e.pos.z - h.pos.z, tl = Math.hypot(tx, tz);
    let best = null, bestScore = -9;
    for (const [k, [x, z]] of Object.entries(dirs)) {
      const l = Math.hypot(x, z), dot = (x * tx + z * tz) / (l * tl), side = tz * x - tx * z;
      const score = want === 'away' ? -dot : (1 - Math.abs(dot)) + (want === 'right' ? (side < 0 ? 1 : -1) : (side > 0 ? 1 : -1));
      if (score > bestScore) { best = k; bestScore = score; }
    }
    return best;
  }, want);
  const withKey = async (k, code) => { await h.key(k, true); await h.step(2); await h.tap(code); await step(12); await h.key(k, false); };
  const rows = [
    ['punch x8', async () => { for (let i = 0; i < 8; i++) { await setup(); await h.tap('Mouse0'); await step(ms(450)); } }],
    ['kick x7', async () => { for (let i = 0; i < 7; i++) { await setup(); await h.tap('KeyE'); await step(ms(550)); } }],
    ['flying knee', async () => { await setup(4); await withKey('ShiftLeft', 'KeyE'); }],
    ['running uppercut', async () => { await setup(4); await withKey('ShiftLeft', 'Mouse0'); }],
    ['spin back kick', async () => { await setup(); await withKey(await keyFor('away'), 'KeyE'); }],
    ['spin backfist', async () => { await setup(); await withKey(await keyFor('away'), 'Mouse0'); }],
    ['side roundhouse L', async () => { await setup(); await withKey(await keyFor('left'), 'KeyE'); }],
    ['side roundhouse R', async () => { await setup(); await withKey(await keyFor('right'), 'KeyE'); }],
    ['side hook L', async () => { await setup(); await withKey(await keyFor('left'), 'Mouse0'); }],
    ['side hook R', async () => { await setup(); await withKey(await keyFor('right'), 'Mouse0'); }],
    ['axe kick', async () => { await setup(4); await h.tap('Space'); await step(12); await h.tap('KeyE'); }],
    ['backflip kick', async () => { await setup(4); await h.tap('Space'); await step(12); await withKey(await keyFor('away'), 'KeyE'); }],
    ['hurricane', async () => { await setup(12); await page.evaluate(() => { window.__game.hero.speed = 11; }); await h.key('ShiftLeft', true); await h.tap('Space'); await step(9); await h.tap('KeyE'); await step(12); await h.key('ShiftLeft', false); }],
    ['leaping smash', async () => { await setup(12); await page.evaluate(() => { window.__game.hero.speed = 11; }); await h.key('ShiftLeft', true); await h.tap('Space'); await step(9); await h.tap('Mouse0'); await step(12); await h.key('ShiftLeft', false); }],
    ['stomp', async () => { await setup(2, true); await step(9); await h.tap('KeyE'); }],
    ['hammer', async () => { await setup(2, true); await step(9); await h.tap('Mouse0'); }],
    // Travel strikes: the gap is wider than any warp, the stick held at the goon.
    ['travel punch', async () => { await setup(7); await h.tap('Mouse0'); }],
    ['travel kick', async () => { await setup(7.5); await h.tap('KeyE'); }],
    ['travel far', async () => { await setup(10); await h.tap('KeyE'); }],
    ['throw', async () => { await setup(1.6); await h.tap('KeyG'); }],
    ['counter', async () => { await setup(2.5); await page.evaluate(() => { const G = window.__game, e = G.enemies.find((x) => x.alive && x.type !== 'joker'); if (!e) return; e.state = 'engage'; e.t = 0; e.startWindup(0.5, G.hero, { now: true }); }); await step(12); await h.tap('Mouse2'); }],
  ];
  for (const [name, act] of rows) { await label('move: ' + name); try { await act(); } catch (err) { console.log('row failed', name, err.message.split(String.fromCharCode(10))[0]); } await step(84); }
}

// --- Traversal: walk, sprint, stop, jump, fall, glide, dive, land, from the GCPD roof.
async function traverse() {
  await boot('?at=signal&god=1');
  await h.step(60);
  await reset();
  await h.skipStaged(); await label('trav: idle');
  await step(90);
  await h.skipStaged(); await label('trav: walk + stop');
  await h.hold(['KeyW'], 90); await step(48);
  await h.skipStaged(); await label('trav: sprint + stop');
  await h.hold(['KeyW', 'ShiftLeft'], 108); await step(54);
  await h.skipStaged(); await label('trav: turn on the spot');
  await h.hold(['KeyA'], 42); await h.hold(['KeyD'], 42); await step(36);
  await h.skipStaged(); await label('trav: walk turn 180');
  await h.hold(['KeyW'], 40); await h.hold(['KeyS'], 50); await step(36);
  await h.skipStaged(); await label('trav: jump in place');
  await h.tap('Space'); await step(84);
  await h.skipStaged(); await label('trav: running jump');
  await h.key('KeyW', true); await step(24); await h.tap('Space'); await step(72); await h.key('KeyW', false); await step(36);
  await h.skipStaged(); await label('trav: fall + glide + dive + land');
  await page.evaluate(() => { const h = window.__game.hero; h.pos.y += 45; window.__audit.mark('hero'); });
  await step(30);
  await h.key('Space', true); await step(150);
  await h.key('ShiftLeft', true); await step(72); await h.key('ShiftLeft', false);
  await step(72); await h.key('Space', false);
  await step(240);
  await h.skipStaged(); await label('trav: short drop');
  await page.evaluate(() => { const h = window.__game.hero; h.pos.y += 6; window.__audit.mark('hero'); });
  await step(150);
  await h.skipStaged(); await label('trav: long drop no glide');
  await page.evaluate(() => { const h = window.__game.hero; h.pos.y += 30; window.__audit.mark('hero'); });
  await step(270);
  await h.skipStaged(); await label('trav: crouch walk');
  await h.tap('KeyZ'); await h.hold(['KeyW'], 90); await h.tap('KeyZ'); await step(48);
  await h.skipStaged(); await label('trav: dodge roll');
  await h.tap('KeyC'); await step(72);
  await h.skipStaged(); await label('trav: run + dodge');
  await h.key('KeyW', true); await step(30); await h.tap('KeyC'); await step(60); await h.key('KeyW', false); await step(40);
  const lad = await page.evaluate(() => {
    const G = window.__game, l = [...G.climbables.ladders].sort((a, b) => (b.top - b.bottom) - (a.top - a.bottom)).find((x) => x.top - x.bottom > 4 && x.top - x.bottom < 14);
    if (!l) return null;
    G.hero.teleport({ x: l.x + l.nx * 1.4, y: l.bottom, z: l.z + l.nz * 1.4 }, Math.atan2(-l.nx, -l.nz));
    G.follow.snapBehind?.(Math.atan2(-l.nx, -l.nz), 0.2);
    return l.top - l.bottom;
  });
  if (lad) {
    await h.step(36);
    await h.skipStaged(); await label('trav: ladder');
    await h.hold(['KeyW'], Math.round((lad / 1.9 + 2.5) * 60));
    await step(90);
  }
}

// --- The old random fight (kept for comparison): mash, counter on a bolt, kicks mixed in.
async function fight() {
  await boot('?at=f2&god=1');
  await page.evaluate(() => { const G = window.__game; const e = G.enemies.find((x) => x.alive); if (e) G.hero.teleport?.({ x: e.pos.x, y: e.pos.y, z: e.pos.z - 4 }, 0); });
  await h.step(10);
  await label('fight: yard');
  for (let i = 0; i < 120; i++) {
    const bolt = await page.evaluate(() => window.__game.enemies.some((e) => e.alive && e.state === 'windup' && e.def?.counterable && e.pos.distanceTo(window.__game.hero.pos) < 7));
    await h.tap(bolt ? 'Mouse2' : i % 5 === 4 ? 'KeyE' : 'Mouse0');
    await step(13);
    if (i % 30 === 29) await page.evaluate(() => { for (const e of window.__game.enemies) if (e.alive) e.health = Math.max(e.health, 3); });
  }
}

// --- Takedowns and the car.
async function extras() {
  await boot('?at=monarchBalcony&god=1');
  await page.waitForFunction(() => window.__game.stealth?.active, null, { timeout: 30000 }).catch(() => {});
  await h.skipStaged();
  await h.step(90);
  for (let i = 0; i < 40; i++) { const ok = await page.evaluate(() => { const e = window.__game.stealth?.goons?.[0]?.e; return !!e && e.alive && e.state !== 'idle' && Math.abs(Math.sin(e.yaw)) < 0.05; }); if (ok) break; await h.step(30); }
  await page.evaluate(() => { const G = window.__game, e = G.stealth.goons[0].e; G.hero.teleport({ x: e.pos.x - Math.sin(e.yaw) * 0.8, y: e.pos.y, z: e.pos.z - Math.cos(e.yaw) * 0.8 }, e.yaw); });
  await h.step(9);
  await h.skipStaged();
  await label('extra: silent takedown');
  await h.tap('Mouse0');
  await step(210);

  // Chain takedowns on the GCPD roof: three fresh grunts in a row in front of him each time.
  await boot('?fight=test&god=1');
  for (const [key, name] of [['Digit1', 'chain 1'], ['Digit2', 'chain 2'], ['Digit3', 'chain 3']]) {
    await h.seed(17);
    await placeSquad(page, 'start', [['grunt', -1.6, 2.4], ['grunt', 0, 2.4], ['grunt', 1.6, 2.4]]);
    await h.seed(17);
    await page.evaluate(() => { const G = window.__game; for (let i = 0; i < 14; i++) G.combat.combo.hit(); for (const e of G.enemies) { e.health = 99; e.ready = () => false; } });
    await h.step(18);
    await h.skipStaged();
    await reset();
    await label('extra: ' + name);
    await h.tap(key);
    await step(270);
  }

  await boot('?at=toNeon&god=1');
  await page.evaluate(() => window.__game.teleport({ x: 150, y: 0, z: -14 }));
  await page.evaluate(() => window.__game.vehicles.summon('batmobile', { instant: true }));
  await h.step(48);
  await page.evaluate(() => { const G = window.__game, v = G.vehicles.batmobile; const p = v.pos ?? v.root?.position ?? v.group?.position; if (p) G.hero.teleport({ x: p.x + 3, y: p.y, z: p.z }, -Math.PI / 2); });
  await h.step(24);
  await h.skipStaged();
  await label('extra: into the Batmobile');
  await h.tap('KeyT');
  await step(90);
  await label('extra: out of the Batmobile');
  await h.tap('KeyT');
  await step(120);
}

const ALL = { seeded, moves, traverse, fight, extras };
for (const w of which === 'all' ? ['seeded', 'moves', 'traverse', 'extras'] : which.split(',')) {
  if (process.env.SLIDE_BY) await page.evaluate(() => { window.__slideBy = true; }).catch(() => {});
  const kept = await page.evaluate(() => window.__audit ? { events: window.__audit.events, frames: window.__audit.frames, skipped: window.__audit.skipped, perLabel: window.__audit.perLabel, slide: window.__audit.slide } : null).catch(() => null);
  if (kept) (globalThis.__kept ??= []).push(kept);
  await ALL[w]();
}
const last = await page.evaluate(() => ({ events: window.__audit.events, frames: window.__audit.frames, skipped: window.__audit.skipped, perLabel: window.__audit.perLabel, slide: window.__audit.slide, err: window.__v.err ?? null }));
const runs = [...(globalThis.__kept ?? []), last];
const A = { events: runs.flatMap((r) => r.events), frames: runs.reduce((s, r) => s + r.frames, 0), skipped: runs.reduce((s, r) => ({ staged: s.staged + r.skipped.staged, teleport: s.teleport + r.skipped.teleport }), { staged: 0, teleport: 0 }), err: last.err };
A.perLabel = Object.assign({}, ...runs.map((r) => r.perLabel ?? {}));
A.slide = {};
for (const r of runs) for (const [k, v] of Object.entries(r.slide ?? {})) { const t = A.slide[k] ?? (A.slide[k] = { m: 0, frames: 0 }); t.m += v.m; t.frames += v.frames; }
writeFileSync(`${out}/audit.json`, JSON.stringify(A, null, 1));

// Summary: per scenario x who, events over each threshold.
const scen = (l) => l.split(':')[0];
const table = new Map();
for (const e of A.events) {
  const k = scen(e.label) + ' | ' + e.who;
  const r = table.get(k) ?? { n25: 0, n50: 0, n100: 0 };
  if (e.err > 0.25) r.n25++;
  if (e.err > 0.5) r.n50++;
  if (e.err > 1) r.n100++;
  table.set(k, r);
}
const tot = { n25: 0, n50: 0, n100: 0 };
console.log(`frames sampled ${A.frames} (skipped: staged ${A.skipped.staged}, teleports ${A.skipped.teleport})${A.err ? ', sampler error ' + A.err : ''}`);
console.log('scenario | who            >0.25  >0.5  >1 m');
for (const [k, r] of [...table].sort()) { console.log(`${k.padEnd(24)} ${String(r.n25).padStart(5)} ${String(r.n50).padStart(5)} ${String(r.n100).padStart(4)}`); tot.n25 += r.n25; tot.n50 += r.n50; tot.n100 += r.n100; }
console.log(`${'TOTAL'.padEnd(24)} ${String(tot.n25).padStart(5)} ${String(tot.n50).padStart(5)} ${String(tot.n100).padStart(4)}`);
console.log('foot slide (planted feet moving in the world): ' + Object.entries(A.slide).sort().map(([k, v]) => `${k} ${v.m.toFixed(2)} m / ${v.frames} f (${(1000 * v.m / Math.max(1, v.frames)).toFixed(1)} mm/f)`).join('; '));
// Worst per (label, who type, clip pair), over 0.25 m.
const groups = new Map();
for (const e of A.events) {
  if (e.err <= 0.25) continue;
  const k = `${e.label} | ${e.type} | ${e.prevClip === e.clip ? e.clip : e.prevClip + ' > ' + e.clip}`;
  const g = groups.get(k) ?? { n: 0, max: 0, bones: new Set(), frames: [], states: new Set() };
  g.n++; g.max = Math.max(g.max, e.err); g.bones.add(e.bone); if (g.frames.length < 4 && !g.frames.includes(e.frame)) g.frames.push(e.frame); g.states.add(`${e.state}/${e.gstate}@${e.ct}`);
  groups.set(k, g);
}
for (const [k, g] of [...groups].sort((a, b) => b[1].max - a[1].max).slice(0, 70)) console.log(`${g.max.toFixed(2)} m  x${String(g.n).padEnd(3)} ${k}  [${[...g.bones].join(' ')}] f${g.frames.join(',')} ${[...g.states].slice(0, 2).join(' ')}`);
console.log(h.errors.length ? h.errors.join('\n') : 'no page errors');
await h.close();
