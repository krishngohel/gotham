// The finale's dual boss in the Arkham yard (Night Nine): the Joker and Harley, a CO-OP boss
// (research doc 6.2: two threats that must be handled in sync; solo, the partner is the story's
// ally). It remixes Night One: counters open them, the buzzer tiles come back, so does the gas.
//   Together (closer than five metres) they cover for each other: nothing lands. Pull them apart.
//   Each opens after two countered swings. Land your strikes and that one is DAZED for a few
//   seconds; daze the other inside that time and the act lands (a window for the phase). Miss the
//   timing and the first one shakes it off, laughing.
//   Solo, the ally (Nightwing, or Robin) keeps Harley busy: daze the Joker while she is more than
//   eight metres from him and the ally finishes her in time.
//   1 'Double Act'     one synced daze
//   2 'Punchline'      his gas pies (red: dodge the green), a crew of clowns; two synced dazes
//   3 'Curtain Call'   the buzzer floor from Night One, in waves; two synced dazes
import { makeVillainBoss, brawl } from './brawler.js';
import { createBossActor } from '../actor.js';
import { createTargeting } from '../rules.js';
import { bossKit, windowsDone, dist2 } from './kit.js';

const Y = 5;
const ARENA = { x: 702, y: Y, z: -80, r: 14 };
const WINDOWS = [1, 2, 2];
const LINK = 5, SOLO_APART = 8;
const SYNC = 4.5;

const LINES = {
  guard: ['Ah ah ah. Two of us, one of you. Do the maths.', 'Puddin\', he is tickling me!', 'We are a package deal, Bats.'],
  open: ['Ladies and gentlemen, the main event! Again!', 'You put me away. I put on a show. Everybody wins!', 'Harley, darling, the stage is ours.'],
  harleyOpen: ['Two on two! Finally, a fair fight!', 'Hiya, B! Miss me? Do not answer that.', 'Mallet says hello!'],
  dazedJ: ['Ooh, stars! Pretty!', 'Hold that thought!'],
  dazedH: ['Whoa, the room is spinning. Is the room spinning?', 'I am fine! I am great! Who are you?'],
  recover: ['Too slow! Comedy is timing, Bats!', 'Ta-da! Back again!', 'Not quite in sync, are we?'],
  sync: ['That was rude. Coordinated, but rude.', 'Ow, in stereo!', 'Okay, that one was funny.'],
  pies: ['Pie for you! Lemon meringue, extra laughing gas!', 'Dessert is served!'],
  tiles: ['Remember the floor? I kept the receipt!', 'Dance with me, Bats! Left, right, ZAP!'],
  ally: ['I have got Harley! Go!', 'She is pinned. Your turn.', 'Got her! Hit him now!'],
};

export const doubleActDef = makeVillainBoss({
  id: 'doubleAct', name: 'THE JOKER AND HARLEY', villain: 'joker', model: 'jester', extraModels: ['harlequin'],
  site: 'n9YardArena', start: 'n9JokerStart', arena: ARENA, gang: 'joker', act: 5,
  colors: ['#62c141', '#c8323c'],
  intro: 'doubleIntro', outro: 'doubleOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 12, kiteT: 4, swapEvery: 8 },
  phases: [{ id: 'doubleAct', name: 'Double Act' }, { id: 'punchline', name: 'Punchline' }, { id: 'curtainCall', name: 'Curtain Call' }],
  setup(ctx, b) {
    const D = b.deps;
    b.data.kit = bossKit(ctx, b);
    // Harley: her own body, combat enemy and targeting (she goes after whoever the Joker is not).
    const H = createBossActor({ ch: b.extras.harlequin, id: 'harleyAct', scene: D.scene, arena: ARENA, events: D.events, hud: D.hud, combat: D.combat, rng: D.rng, lines: { guard: LINES.guard }, onWindowClosed: () => daze(b, 'h') });
    b.data.H = H;
    b.data.hTarget = createTargeting({ leash: 12, kiteT: 4, swapEvery: 6 });
    b.data.hData = { cool: 1 };
    H.e.update = (dt, ectx) => {
      if (b.done || !b.data.on) return;
      const tgt = harleyTarget(b, dt);
      if (!H.tick(dt, ectx, tgt)) harleyBrain(dt, b, tgt);
      H.ch.animator.update(dt);
    };
    b.data.dazed = { j: -99, h: -99 };
    const origJ = b.e.update;
    b.e.update = (dt, ectx) => { env(dt, b); origJ(dt, ectx); };
  },
  hide(b) { b.data.H?.hide(); b.data.on = false; b.data.kit.clear(); allyOff(b); },
  onWin(b) { b.data.H?.ch.animator.play('Death01', { once: true, fade: 0.1 }); allyOff(b); },
  sim(b) {
    const me = b.heroes[0];
    const J = b.actor, H = b.data.H;
    if (!me || !H) return null;
    for (const a of [J, H]) if (a.e.state === 'windup' && dist2(a.pos, me.pos) < 4) return { action: a.e.glyph === 'red' ? 'dodge' : 'block' };
    if (J.e.state === 'aim' || H.e.state === 'aim') return { action: 'dodge' };
    if (dist2(J.pos, H.pos) < LINK + 1) {
      // Drag him away from her: stand on his far side.
      const dx = J.pos.x - H.pos.x, dz = J.pos.z - H.pos.z, d = Math.hypot(dx, dz) || 1;
      return { goTo: { x: J.pos.x + (dx / d) * 4, z: J.pos.z + (dz / d) * 4 }, stop: 1 };
    }
    // Strike whichever is open; otherwise the one not dazed.
    const open = [J, H].find((a) => a.e.vulnerable > 0);
    if (open) return { goTo: open.pos, stop: 1.8, action: 'punch' };
    return { goTo: b.t - b.data.dazed.j < SYNC ? H.pos : J.pos, stop: 2, action: 'punch' };
  },
  hazards: (b) => ({ harley: b.data.H ? [b.data.H.pos.x, b.data.H.pos.y, b.data.H.pos.z, b.data.H.ch.yaw, b.data.H.e.state] : null, dazed: { j: Math.round((b.t - b.data.dazed.j) * 10) / 10, h: Math.round((b.t - b.data.dazed.h) * 10) / 10 }, discs: b.data.kit.netHazards() }),
  applyHazards(b, hz) {
    const H = b.data.H;
    if (!H || !hz?.harley) return;
    H.show(true);
    H.pos.set(hz.harley[0], hz.harley[1], hz.harley[2]);
    H.ch.face(hz.harley[3] ?? 0);
  },
  phase: {
    doubleAct: phaseHooks(0, 'Pull them apart (together they cover each other). Counter each twice, then daze both within a few seconds.'),
    punchline: phaseHooks(1, 'Gas pies (red): dodge the green. Clowns on the yard. Daze them both, in sync, twice.'),
    curtainCall: phaseHooks(2, 'The buzzer floor is back. Keep moving. Two more synced dazes.'),
  },
});

function phaseHooks(i, objective) {
  return {
    enter(b) {
      const D = b.deps, H = b.data.H;
      b.data.on = true; b.data.windows = 0;
      b.data.dazed = { j: -99, h: -99 };
      b.data.pieCool = 4; b.data.tileCool = 3;
      if (i === 0) {
        const s = b.ctx.site('n9HarleyStart') ?? { x: ARENA.x - 6, y: Y, z: ARENA.z + 4 };
        H.place(s, 0);
        b.say(b.actor.pick(LINES.open), 3.2);
        setTimeout(() => H.say(H.pick(LINES.harleyOpen), 2.4), 1600);
      }
      H.show(true);
      const C = D.combat;
      if (!C.enemies.includes(H.e)) C.setEnemies([...C.enemies.filter((x) => x !== H.e), H.e]);
      D.hud.setObjective?.(b.players > 1 ? objective : `${objective} Solo: your ally pins Harley while she is away from him.`);
      if (i === 1) { b.ctx.adds(6, { at: 'n9YardArena', ring: 10, gang: 'joker', act: 5, id: 'actClowns' }); b.say(b.actor.pick(LINES.pies), 2.6); }
      if (i === 2) b.say(b.actor.pick(LINES.tiles), 2.6);
      if (b.players < 2) allyOn(b);
    },
    update: (dt, b) => jokerBrain(dt, b),
    idle: (dt, b) => { env(dt, b); keep(b); },
    windowClosed: (b) => daze(b, 'j'),
    exit: (b) => { b.data.kit.clear(); },
  };
}

function keep(b) {
  const C = b.deps.combat;
  for (const e of [b.e, b.data.H?.e]) if (e && !b.done && !C.enemies.includes(e)) C.setEnemies([...C.enemies, e]);
}

function allyOn(b) {
  const NW = typeof window !== 'undefined' ? window.__game?.nightwing : null;
  if (!NW?.spawn || b.data.ally) return;
  if (window.__game?.humanNightwing?.()) return;
  const H = b.data.H;
  try { NW.spawn({ x: H.pos.x + 2, y: Y, z: H.pos.z + 2 }, 'ally'); b.data.ally = true; } catch { b.data.ally = false; }
}
function allyOff(b) { if (b.data.ally) { try { window.__game?.nightwing?.despawn?.(); } catch { /* gone */ } b.data.ally = false; } }

function linked(b) { return dist2(b.actor.pos, b.data.H.pos) < LINK; }

// Who Harley goes after: the hero the Joker is not after (co-op), or the ally's spot (solo), unless
// the hero comes within reach.
function harleyTarget(b, dt) {
  const heroes = b.heroes;
  const t = b.data.hTarget.update(dt, b.data.H.pos, heroes.filter((h) => h !== b.target).length ? heroes.filter((h) => h !== b.target) : heroes);
  return t;
}

function harleyBrain(dt, b, tgt) {
  const H = b.data.H;
  if (!tgt) return;
  const solo = b.players < 2;
  const near = dist2(tgt.pos, H.pos) < 3.2;
  if (solo && !near) {
    // Solo: she is busy with the ally, circling away from the Joker.
    const J = b.actor.pos;
    const away = { x: ARENA.x + (ARENA.x - J.x) * 0.6, z: ARENA.z + (ARENA.z - J.z) * 0.6 };
    H.moveTo(away, dt, { speed: 3.6, stop: 1.5 });
    H.face(away, 6, dt);
    if (b.rng.next() < dt * 0.4) H.ch.animator.play('Punch_Jab', { once: true, fade: 0.08 });
    return;
  }
  const hb = { actor: H, e: H.e, target: tgt, rng: b.rng, tier: b.tier, data: b.data.hData };
  brawl(dt, hb, { counters: 2, windup: 0.5, every: [0.8, 1.5], redChance: 0.35, kind: 'joker', openFor: 4 });
  if (linked(b)) H.e.onCountered = () => H.say('Puddin\' has my back!', 1.2);
}

function jokerBrain(dt, b) {
  const { actor } = b;
  // Gas pies (phase 2+): a red tell, then a green cloud where you were.
  if (b.phase >= 1) {
    b.data.pieCool -= dt;
    const tgt = b.punish ?? b.target;
    if (b.data.pieCool <= 0 && tgt && actor.e.state !== 'open') {
      b.data.pieCool = 5.5 + b.rng.next() * 2;
      actor.aim(tgt, { windup: 0.9 * b.tier.tell, clip: 'OverhandThrow', fire: (h) => { if (h) b.data.kit.disc({ x: h.pos.x, y: Y, z: h.pos.z }, { r: 3, grow: 0.7, color: 0x62c141, tag: 'pie', onBite: (hh) => b.data.kit.dose(hh, 12, 'gas') }); } });
      return;
    }
  }
  brawl(dt, b, { counters: 2, windup: 0.6, every: [1.1, 2], redChance: 0.25, kind: 'joker', openFor: 4 });
  if (linked(b)) b.e.onCountered = () => b.say('Harley, sweetie, a little help?', 1.2);
}

function daze(b, who) {
  const D = b.deps;
  b.data.dazed[who] = b.t;
  const A = who === 'j' ? b.actor : b.data.H;
  A.say(A.pick(who === 'j' ? LINES.dazedJ : LINES.dazedH), 1.8);
  D.events.emit('word', { text: 'DAZED', pos: A.pos.clone().setY(A.pos.y + 2.4), big: false });
  // Solo: the ally finishes Harley when she is far enough from him.
  if (b.players < 2 && who === 'j' && dist2(b.actor.pos, b.data.H.pos) > SOLO_APART) {
    b.data.dazed.h = b.t;
    radioAlly(b);
  }
  const other = who === 'j' ? 'h' : 'j';
  const win = SYNC * b.tier.window;
  if (b.t - b.data.dazed[other] < win) {
    b.data.dazed = { j: -99, h: -99 };
    b.say(b.actor.pick(LINES.sync), 2);
    D.events.emit('bossSynced', { id: 'doubleAct' });
    windowsDone(b, WINDOWS[b.phase]);
  }
}

function radioAlly(b) {
  const r = typeof window !== 'undefined' ? window.__game?.radio : null;
  const kit = window.__game?.players?.[0]?.kit?.id === 'nightwing' ? 'robin' : 'nightwing';
  r?.say?.([{ speaker: kit, portrait: kit === 'robin' ? 'nightwing' : kit, text: b.actor.pick(LINES.ally) }]);
}

function env(dt, b) {
  if (b.done || !b.data.on) return;
  const K = b.data.kit, D = b.deps;
  K.tick(dt);
  // Shaking it off: a daze that was never matched wears off, with a laugh.
  for (const who of ['j', 'h']) {
    const t = b.data.dazed[who];
    if (t > 0 && b.t - t > SYNC * b.tier.window) {
      b.data.dazed[who] = -99;
      const A = who === 'j' ? b.actor : b.data.H;
      A.say(A.pick(LINES.recover), 1.8);
    }
  }
  // Linked: a thin green line between them, and strikes do nothing.
  const lk = linked(b);
  for (const A of [b.actor, b.data.H]) if (lk && A.e.vulnerable > 0) { A.e.vulnerable = 0; A.e.state = 'recover'; }
  // The buzzer floor (phase 3): a wave of discs in a row across the yard.
  if (b.phase === 2) {
    b.data.tileCool -= dt;
    if (b.data.tileCool <= 0) {
      b.data.tileCool = 3.6 * b.tier.tell;
      const across = b.rng.next() < 0.5;
      const off = (b.rng.next() * 2 - 1) * 9;
      for (let k = -12; k <= 12; k += 4) {
        const p = across ? { x: ARENA.x + k, y: Y, z: ARENA.z + off } : { x: ARENA.x + off, y: Y, z: ARENA.z + k };
        K.disc(p, { r: 2.2, grow: 1.3, color: 0x8a2fbf, tag: 'tile', onBite: (h) => K.dose(h, 9, 'buzzer') });
      }
      D.events.emit('word', { text: 'BZZZT', pos: { x: ARENA.x, y: Y + 3, z: ARENA.z }, big: false });
    }
  }
}
