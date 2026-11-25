// The side chains' four bosses on the boss framework (src/bosses: makeVillainBoss, windows not
// health). Each tests something the campaign bosses do not:
//   catBurglar  rhythm and pursuit: dodge her pounce (red) to counter the whip that follows
//               (blue); then she runs the roofs and the window opens only when you catch her.
//   clayBrute   the environment, in three places across the Yards: he is armoured until he stands
//               in a hazard's sweep while a hero holds its lever (co-op: one baits, one pulls).
//   twoFace     hostage dilemmas: a coin flip puts the hostage on one of two plates; he calls it,
//               and from the second phase his call can be a lie that detective vision exposes.
//   mercenary   hunter becomes hunted: inside his sight cone he shoots; the window opens only when
//               a hero gets in behind him unseen. Then smoke and adds, then a sword duel.
// Registered at run time into the game's boss director (bosses.register(def(deps))).
import { makeVillainBoss, brawl } from '../../bosses/defs/brawler.js';
import { shotLands } from '../../bosses/actor.js';
import { pointAt, pathLength } from '../objectives.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const angTo = (from, yaw, to) => { const a = Math.atan2(to.x - from.x, to.z - from.z); return Math.abs(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw))); };

// --------------------------------------------------------------- the cat burglar
export const catBurglarDef = (opts) => makeVillainBoss({
  id: 'owCatBurglar', name: 'THE CAT BURGLAR', villain: 'catBurglar', model: 'catBurglar', gang: 'penguin', act: 3,
  site: opts.sites.cat, arena: { ...opts.sites.cat, r: 13 }, colors: ['#2a2232', '#b08ad8'],
  phases: [{ id: 'rhythm', name: 'The Rhythm' }, { id: 'rooftops', name: 'Over the Roofs' }, { id: 'lives', name: 'Nine Lives' }],
  intro: 'owCatIntro', outro: 'owCatOutro',
  lines: { guard: ['Too slow, darling.', 'Missed me. Again.', 'You will have to be quicker than that.'] },
  targeting: { leash: 18, kiteT: 6, swapEvery: 7 },
  // [balance] The scripted player's hint (scripts/lib/player-bot.mjs): the tells are read by the
  // bot itself (red pounce: dodge; blue whip: counter); over the roofs, run her down.
  sim: (b) => (b.phase === 1 ? { goTo: b.actor.pos, stop: 1.2, action: b.e.vulnerable > 0 ? 'punch' : null } : b.e.vulnerable > 0 ? { goTo: b.actor.pos, stop: 1.6, action: 'punch' } : null),
  phase: {
    rhythm: { enter: (b) => { b.data.windows = 0; b.say('Every roof in this city has a way down, Bat. I know all of them.'); }, update: (dt, b) => pounceWhip(dt, b, 1), windowClosed: (b) => { if (++b.data.windows >= 2) b.next(); else b.inPhase = 0.5; } },
    rooftops: {
      enter(b) {
        b.say('Catch me if you can. You can\'t.');
        b.data.path = opts.roofPath(b.arena, 5);
        b.data.len = pathLength(b.data.path);
        b.data.s = 0;
        b.deps.combat.setEnemies([]);
        b.arena.saved ??= { x: b.arena.x, z: b.arena.z, r: b.arena.r };
        b.arena.r = 400;
      },
      idle(dt, b) {
        const caught = b.heroes.some((h) => dist(h.pos, b.actor.pos) < 2.8 && Math.abs(h.pos.y - b.actor.pos.y) < 2.5);
        if (caught) {
          b.deps.combat.setEnemies([b.e]);
          b.actor.open(4.5 * b.tier.window);
          b.say('Hey! Paws off!');
          return;
        }
        // She waits for a hero who has fallen behind (a chase, not an escape).
        const lag = Math.min(...b.heroes.map((h) => dist(h.pos, b.actor.pos)));
        b.data.s = (b.data.s + (lag > 30 ? 2 : 6.5) * dt) % b.data.len;
        const p = pointAt(b.data.path, b.data.s, b.data.tmp ??= {});
        b.actor.pos.set(p.x, p.y, p.z);
        b.actor.ch.face(p.yaw ?? 0);
        b.actor.ch.animator.play(p.air ? 'Jump_Loop' : 'Jog_Fwd_Loop', { fade: 0.15 });
      },
      // A window she slipped out of: back over the roofs.
      update(dt, b) { if (!(b.e.vulnerable > 0) && b.e.state !== 'open' && b.e.state !== 'knocked') b.deps.combat.setEnemies([]); },
      windowClosed(b) { b.next(); },
      exit(b) { if (b.arena.saved) { Object.assign(b.arena, b.arena.saved); b.arena.saved = null; } b.actor.place({ x: b.arena.x, y: b.arena.y, z: b.arena.z }); },
    },
    // [balance] Back on the combat list: the roof chase took her off it, and a whip nobody can counter
    // was a soft-lock (the scripted player waited seven minutes in this phase).
    lives: { enter: (b) => { b.data.windows = 0; b.deps.combat.setEnemies([b.e]); b.say('Fine. No more games.'); }, update: (dt, b) => pounceWhip(dt, b, 1.35), windowClosed: (b) => { if (++b.data.windows >= 2) b.win(); else b.inPhase = 0.5; } },
  },
});
// Pounce (red: dodge it), then the whip (blue: counter it). Countering the whip opens her up;
// countering anything else does nothing (she was feinting).
function pounceWhip(dt, b, speed) {
  const { actor, e } = b;
  const tgt = b.target;
  if (!tgt) return;
  b.data.cool = (b.data.cool ?? 1) - dt * speed;
  const d = actor.moveTo(tgt.pos, dt, { speed: 4.2 * speed, stop: 2 });
  actor.face(tgt.pos, 10, dt);
  if (d > 2.6 || b.data.cool > 0) return;
  if (b.data.next === 'whip') {
    actor.melee({ kind: 'joker', windup: 0.5 * b.tier.tell / speed, counter: true });
    b.data.next = null;
    b.data.cool = 1.3;
    e.onCountered = () => { actor.open(3.5 * b.tier.window); };
  } else {
    actor.melee({ kind: 'joker', windup: 0.55 * b.tier.tell / speed, counter: false });
    b.data.next = 'whip';
    b.data.cool = 0.25;
    e.onCountered = null;
  }
}

// --------------------------------------------------------------- the clay brute
export const clayBruteDef = (opts) => makeVillainBoss({
  id: 'owClayBrute', name: 'THE CLAY MAN', villain: 'clayBrute', model: 'clayBrute', gang: 'firefly', act: 3,
  site: opts.sites.clay[0].at, arena: { ...opts.sites.clay[0].at, r: 16 }, colors: ['#3a2f22', '#c9a66a'],
  phases: opts.sites.clay.map((s, i) => ({ id: `stage${i}`, name: s.name })),
  intro: 'owClayIntro', outro: 'owClayOutro',
  lines: { guard: ['Punch the mud. Go on. See what happens.', 'I am the ground you stand on.', 'You cannot break what has no shape.'] },
  targeting: { leash: 20, kiteT: 8, swapEvery: 8 },
  // [balance] Hold the lever while he follows you into the sweep; strike when he is open.
  sim: (b) => { const st = opts.sites.clay[b.phase]; if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.6, action: 'punch' }; return st ? { goTo: st.lever, stop: 1.2 } : null; },
  phase: Object.fromEntries(opts.sites.clay.map((s, i) => [`stage${i}`, {
    enter(b) {
      b.data.windows = 0; b.data.hold = 0; b.data.cool = 0;
      Object.assign(b.arena, { x: s.at.x, y: s.at.y, z: s.at.z });
      b.actor.place({ x: s.at.x + 6, y: s.at.y, z: s.at.z + 6 });
      b.data.marks = [opts.markers.place('hazard', s.hazard), opts.markers.place('valve', s.lever)];
      b.say(s.taunt);
      if (i === 2) b.ctx.adds(4, { at: s.at, gang: 'firefly', act: 3 });
    },
    update(dt, b) {
      brawl(dt, b, { counters: 99, windup: 0.8, every: [1.4, 2.4], redChance: 0.5, kind: 'joker', openFor: 0 });
      b.data.cool -= dt;
      const atLever = b.heroes.some((h) => dist(h.pos, s.lever) < 2.6);
      const inSweep = dist(b.actor.pos, s.hazard) < 6.5;
      b.data.hold = atLever && inSweep && b.data.cool <= 0 ? b.data.hold + dt : Math.max(0, b.data.hold - dt * 2);
      if (b.data.hold > 0.9) {
        b.data.hold = 0; b.data.cool = 6;
        opts.markers.flash(b.data.marks[0]);
        b.deps.events.emit('word', { text: s.sound, pos: b.actor.pos.clone().setY(b.actor.pos.y + 2.4), big: true });
        b.say(s.hurt);
        b.actor.open(5 * b.tier.window);
      }
    },
    windowClosed(b) { if (++b.data.windows >= 2) b.next(); else b.inPhase = 0.5; },
    exit(b) { for (const m of b.data.marks ?? []) opts.markers.release(m); b.data.marks = null; },
  }])),
});

// --------------------------------------------------------------- the two-faced DA
export const twoFaceDef = (opts) => makeVillainBoss({
  id: 'owTwoFace', name: 'THE TWO-FACED DA', villain: 'twoFace', model: 'twoFace', gang: 'twoFace', act: 3,
  site: opts.sites.twoFace, arena: { ...opts.sites.twoFace, r: 15 }, colors: ['#16171c', '#e8e2d6'],
  phases: [{ id: 'heads', name: 'Heads' }, { id: 'tails', name: 'Tails' }, { id: 'edge', name: 'On Its Edge' }],
  intro: 'owTwoFaceIntro', outro: 'owTwoFaceOutro',
  lines: { guard: ['The coin has not decided you get to hit me.', 'Not your turn.', 'Fifty-fifty. Always.'] },
  targeting: { leash: 22, kiteT: 7, swapEvery: 6 },
  // [balance] Heads: his call is the truth. From Tails on it may be a lie: a player with the cowl's
  // detective vision on sees the real plate light up within 7 m (opts.detectiveNear), so the bot
  // walks to the plate between the two, looks, then stands on the lit one.
  sim: (b) => {
    if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.6, action: 'punch', detective: false };
    const R = b.data.round, A = b.arena;
    if (!R) return null;
    const pts = [{ x: A.x - 7, y: A.y, z: A.z + 4 }, { x: A.x + 7, y: A.y, z: A.z + 4 }];
    if (b.phase === 0) return { goTo: pts[R.said], stop: 0.8 };
    const me = b.heroes[0];
    const near = me && Math.hypot(me.pos.x - pts[R.said].x, me.pos.z - pts[R.said].z) < 6.5;
    return near || R.looked ? ((R.looked = true), { goTo: pts[R.truth], stop: 0.8, detective: true }) : { goTo: pts[R.said], stop: 0.8, detective: true };
  },
  phase: Object.fromEntries(['heads', 'tails', 'edge'].map((id, pi) => [id, {
    enter(b) { b.data.windows = 0; flip(b, pi); },
    update(dt, b) { coinRound(dt, b, pi, opts); },
    windowClosed(b) { if (++b.data.windows >= (pi === 2 ? 2 : 1)) b.next(); else flip(b, pi); },
    exit(b) { clearPlates(b, opts); },
  }])),
});
function flip(b, pi) {
  const heads = b.rng.next() < 0.5;
  const lie = pi >= 1 && b.rng.next() < 0.4;
  b.data.round = { truth: heads ? 0 : 1, said: lie ? (heads ? 1 : 0) : heads ? 0 : 1, t: 11 * b.tier.window + (b.players > 1 ? 0 : 2), hold: 0, freed: 0, both: pi === 2 && b.players > 1 };
  b.say(`${heads ? 'Heads' : 'Tails'}. The hostage is on the ${b.data.round.said === 0 ? 'left' : 'right'}. ${lie ? 'Probably.' : 'Trust me.'}`, 3.5);
  b.data.needPlates = true;
}
function clearPlates(b, opts) { for (const m of b.data.plates ?? []) opts.markers.release(m); b.data.plates = null; opts.hostages?.(null); }
function coinRound(dt, b, pi, opts) {
  const R = b.data.round;
  if (!R) return;
  const A = b.arena;
  const pts = [{ x: A.x - 7, y: A.y, z: A.z + 4 }, { x: A.x + 7, y: A.y, z: A.z + 4 }];
  if (b.data.needPlates) {
    clearPlates(b, opts);
    b.data.plates = pts.map((p) => opts.markers.place('plate', p));
    opts.hostages?.(pts, R.truth);
    b.data.needPlates = false;
  }
  // Detective vision near a plate shows the truth (the real hostage's plate lights up).
  for (let i = 0; i < 2; i++) if (opts.detectiveNear(pts[i], 7)) opts.markers.color(b.data.plates[i], i === R.truth ? 'plateLit' : 'plateWrong');
  R.t -= dt;
  const onTruth = b.heroes.some((h) => dist(h.pos, pts[R.truth]) < 1.8);
  const onLie = b.heroes.some((h) => dist(h.pos, pts[1 - R.truth]) < 1.8);
  R.hold = onTruth ? R.hold + dt : 0;
  if (R.hold > 0.8) {
    R.hold = 0;
    b.say(['No! That was not the call!', 'You cheated the coin!', 'Luck. Pure luck.'][pi]);
    b.data.round = null;
    b.actor.open(4.5 * b.tier.window);
    opts.hostages?.(null);
    return;
  }
  if (onLie && !R.punished) {
    R.punished = true;
    b.say('Wrong side. The coin says I shoot.');
    for (const h of b.heroes) b.actor.aim(h, { windup: 0.8 * b.tier.tell, fire: (hero) => { if (shotLands(b.deps.collision, b.actor.pos, hero)) b.ctx.hurt(hero, 'rifle', b.e); } });
    b.ctx.adds(3, { at: A, gang: 'twoFace', act: 3 });
  }
  if (R.t <= 0) { b.say('Too slow. The coin flips again.'); flip(b, pi); return; }
  // Between calls he keeps the heroes honest from range.
  b.data.cool = (b.data.cool ?? 2) - dt;
  const tgt = b.target;
  if (tgt && b.data.cool <= 0) { b.data.cool = 2.6; b.actor.aim(tgt, { windup: 0.9 * b.tier.tell, fire: (hero) => { if (shotLands(b.deps.collision, b.actor.pos, hero)) b.ctx.hurt(hero, 'rifle', b.e); } }); }
  else if (tgt) { b.actor.face(tgt.pos, 6, dt); b.actor.moveTo({ x: A.x, z: A.z - 4 }, dt, { speed: 2, stop: 1 }); }
}

// --------------------------------------------------------------- the masked mercenary
export const mercenaryDef = (opts) => makeVillainBoss({
  id: 'owMercenary', name: 'THE MASKED MERCENARY', villain: 'mercenary', model: 'mercenary', gang: 'blackMask', act: 4,
  site: opts.sites.merc, arena: { ...opts.sites.merc, r: 22 }, colors: ['#1a1a1f', '#d06a2c'],
  phases: [{ id: 'hunt', name: 'The Hunt' }, { id: 'smoke', name: 'Smoke' }, { id: 'blade', name: 'Steel' }],
  intro: 'owMercIntro', outro: 'owMercOutro',
  lines: { guard: ['You are not the hunter tonight.', 'Paid in advance. Nothing personal.', 'Try that from behind. Oh, wait.'] },
  targeting: { leash: 30, kiteT: 12, swapEvery: 9 },
  // [balance] Hunt the hunter: crouched, out of his cone (0.7 rad either side of where he walks),
  // round to his back, then in. Steel: the tells are the bot's own (counter three, strike).
  sim: (b) => {
    if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.6, action: 'punch', crouch: false };
    if (b.phase === 2 || !b.actor.ch.root.visible) return { crouch: false };
    const me = b.heroes[0];
    if (!me) return null;
    const yaw = b.actor.ch.yaw, p = b.actor.pos, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ahead = ((me.pos.x - p.x) * fx + (me.pos.z - p.z) * fz) > -1;
    // In front: swing wide to his side first; behind: close in.
    const side = ((me.pos.x - p.x) * fz - (me.pos.z - p.z) * fx) >= 0 ? 1 : -1;
    const goal = ahead ? { x: p.x + fz * side * 7 - fx * 2, y: p.y, z: p.z - fx * side * 7 - fz * 2 } : { x: p.x - fx * 1.4, y: p.y, z: p.z - fz * 1.4 };
    return { goTo: goal, stop: 0.6, crouch: true };
  },
  phase: {
    hunt: { enter: (b) => { b.data.windows = 0; b.data.wp = 0; b.say('I was paid to bring back a cape. I prefer it with you in it.'); }, update: (dt, b) => hunt(dt, b, 1), windowClosed: (b) => { if (++b.data.windows >= 3) b.next(); else b.inPhase = b.data.windows / 3; } }, // [balance] 3 windows (was 2)
    smoke: {
      enter(b) { b.data.windows = 0; b.data.hidden = 6; b.deps.events.emit('smoke', { pos: b.actor.pos.clone() }); b.actor.show(false); b.deps.combat.setEnemies([]); b.ctx.adds(5, { at: b.arena, gang: 'blackMask', act: 4 }); b.say('Smoke. Then knives. Then me.'); },
      idle(dt, b) { b.data.hidden -= dt; if (b.data.hidden <= 0) { b.actor.show(true); b.deps.combat.setEnemies([b.e]); b.data.hidden = Infinity; } },
      update: (dt, b) => hunt(dt, b, 1.35),
      windowClosed(b) { b.next(); },
    },
    blade: { enter: (b) => { b.data.windows = 0; b.say('Enough hide and seek. Steel.'); }, update: (dt, b) => brawl(dt, b, { counters: 3, windup: 0.55, every: [0.9, 1.7], redChance: 0.35, kind: 'joker', openFor: 4 }), windowClosed: (b) => { if (++b.data.windows >= 3) b.win(); else b.inPhase = b.data.windows / 3; } }, // [balance] 3 windows (was 2; beaten in 74 s)
  },
});
function hunt(dt, b, k) {
  const { actor } = b;
  const A = b.arena;
  const wps = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, z]) => ({ x: A.x + x * A.r * 0.6, z: A.z + z * A.r * 0.6 }));
  const goal = wps[b.data.wp % 4];
  if (actor.moveTo(goal, dt, { speed: 2.6 * k, stop: 1.5 }) <= 1.6) b.data.wp += 1;
  const yaw = Math.atan2(goal.x - actor.pos.x, goal.z - actor.pos.z);
  actor.ch.face(yaw);
  b.data.cool = (b.data.cool ?? 1) - dt;
  for (const h of b.heroes) {
    const d = dist(h.pos, actor.pos);
    const behind = angTo(actor.pos, yaw, h.pos) > 1.9;
    // In behind him, close, unseen: the hunter becomes the hunted.
    if (behind && d < 3.2 && (b.data.seenT ?? 99) > 1.5) { b.say('What?!'); actor.open(4 * b.tier.window); b.data.seenT = 0; return; }
    const seen = d < 26 * k && angTo(actor.pos, yaw, h.pos) < 0.7 && !h.crouched;
    if (seen) {
      b.data.seenT = 0;
      if (b.data.cool <= 0) { b.data.cool = 2.2 / k; actor.aim(h, { windup: 0.85 * b.tier.tell, fire: (hero) => { if (shotLands(b.deps.collision, actor.pos, hero)) b.ctx.hurt(hero, 'rifle', b.e); } }); }
      return;
    }
  }
  b.data.seenT = (b.data.seenT ?? 0) + dt;
}

export const CHAIN_BOSS_IDS = ['owCatBurglar', 'owClayBrute', 'owTwoFace', 'owMercenary'];
