// The botanist in the conservatory garden (Night Six): a CROWD CONTROL, NON-LETHAL boss (research
// doc 6.2). No earlier boss tests holding back.
//   Her thralls are spore-dazed civilians: joggers, commuters, a man still holding his dog lead.
//   Cape-stun or batarang them and the spores shake loose (FREED). Punch them and you hurt someone
//   who did nothing wrong: she drinks it in and a root node she has lost grows back.
//   Her vine shield is fed by root nodes around the lawn: stand on a node to cut it (1.5 s). With
//   every node cut the shield falls: a window, five strikes.
//   Pollen discs (phase 2+) fill a spore meter on your own view; full, it dazes you (real damage).
//   1 'Green Thumb'    three nodes, four thralls; one window
//   2 'Bloom'          five nodes, pollen, more thralls; two windows
//   3 'Overgrowth'     nodes regrow unless she is open; in co-op two nodes must be cut within three
//                      seconds of each other or both regrow; two windows
import { makeVillainBoss } from './brawler.js';
import { bossKit, windowsDone, dist2 } from './kit.js';

const Y = 0;
const ARENA = { x: 294, y: Y, z: -712, r: 15 };
const NODES = [[288, -706], [300, -706], [294, -721], [286, -716], [302, -716]].map(([x, z]) => ({ x, y: Y, z }));
const EDGE = [[280, -699], [308, -699], [281, -725], [307, -725], [294, -697]].map(([x, z]) => ({ x, y: Y, z }));
const WINDOWS = [1, 2, 2];
const NODE_COUNT = [3, 5, 5];
const THRALLS = [4, 6, 6];
const CUT_T = 1.5;

const LINES = {
  guard: ['The roots hold me up. Cut them, if you can bear to hurt a garden.', 'Thorns, darling. All the way down.', 'You cannot punch photosynthesis.'],
  open: ['Every lawn in this city is a cage. Tonight I opened one.', 'They came for a jog. They stayed for the roses.', 'Shall we see whether you can hold back, Batman? You so rarely do.'],
  harm: ['Ooh. Did that one have a family? They all do, you know.', 'Hurt them for me. It is so much more convincing when you do it.', 'There. Now who is the monster in the park?', 'Every bruise you leave, the garden remembers.'],
  freed: ['Wake up, then. Go back to your little desk.', 'Fine. Keep him. I have hundreds.', 'You cannot free them all.'],
  cut: ['My roots!', 'That was three hundred years old. Give or take two hundred and ninety.', 'Careful with the shears.'],
  bloom: ['Breathe deep. The pollen does the rest.', 'Spring has sprung. It will not let go.'],
  over: ['Everything you cut grows back. That is what nature does.', 'You are a gardener now. Weed faster.'],
  stun: ['Toys.', 'A bat with a boomerang. How very suburban.'],
  regrow: ['Grow.', 'Again, my darlings.'],
};

export const ivyDef = makeVillainBoss({
  id: 'ivy', name: 'POISON IVY', villain: 'poisonIvy', model: 'ivy',
  site: 'n6IvyArena', start: 'n6IvyStart', arena: ARENA, gang: 'ivy', act: 4,
  colors: ['#5aa83a', '#2a4a22'],
  intro: 'ivyIntro', outro: 'ivyOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 14, kiteT: 5, swapEvery: 8 },
  phases: [{ id: 'greenThumb', name: 'Green Thumb' }, { id: 'bloom', name: 'Bloom' }, { id: 'overgrowth', name: 'Overgrowth' }],
  setup(ctx, b) {
    const D = b.deps;
    b.data.kit = bossKit(ctx, b);
    b.data.thralls = new Set();
    b.data.spore = new Map();
    b.data.harmT = new Map();
    b.data.harm = 0; b.data.freed = 0;
    b.e.onStun = () => b.say(b.actor.pick(LINES.stun), 1.8);
    b.e.onWindowMissed = () => { regrowAll(b); b.say(b.actor.pick(LINES.regrow), 1.6); };
    // The garden, the pollen and her thralls run every frame, whatever state she is in.
    const orig = b.e.update;
    b.e.update = (dt, ectx) => { env(dt, b); orig(dt, ectx); };
    // Strikes on a thrall: a stun frees them, anything else hurts them.
    D.events.on('impact', ({ target, outcome, move }) => {
      if (!target?.thrall || b.done || !b.data.nodes) return;
      if (outcome === 'stun' || move === 'cape' || move === 'batarang' || move === 'counter') { free(b, target); return; }
      const last = b.data.harmT.get(target) ?? -9;
      if (b.t - last < 2) return;
      b.data.harmT.set(target, b.t);
      b.data.harm += 1;
      D.events.emit('storyHarm', { boss: 'ivy', harm: b.data.harm });
      b.say(b.actor.pick(LINES.harm), 2.4);
      // She feeds on it: one cut node grows back.
      const cut = b.data.nodes.find((n) => n.cut);
      if (cut) { cut.cut = false; cut.t = 0; paintNode(b, cut); }
    });
  },
  sim(b) {
    const me = b.heroes[0];
    if (!me || !b.data.nodes) return null;
    for (const e of b.data.thralls) if (e.alive && !e.down && dist2(e.pos, me.pos) < 2.6) return { action: 'cape' };
    if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.8, action: 'punch' };
    const left = b.data.nodes.filter((n) => n.on && !n.cut);
    if (left.length) { let best = left[0]; for (const n of left) if (dist2(n, me.pos) < dist2(best, me.pos)) best = n; return { goTo: best, stop: 0.6, hold: true }; }
    return null;
  },
  hazards: (b) => ({ nodes: b.data.nodes?.map((n) => (n.on ? (n.cut ? 2 : 1) : 0)) ?? [], discs: b.data.kit.netHazards(), harm: b.data.harm, freed: b.data.freed }),
  phase: {
    greenThumb: {
      enter(b) { start(b); b.deps.hud.setObjective?.('Stand on her root nodes to cut them. Cape-stun the dazed civilians: never punch them.'); b.say(b.actor.pick(LINES.open), 3.4); },
      idle: (dt, b) => env(dt, b),
      update: (dt, b) => think(dt, b),
      windowClosed: (b) => closed(b),
      exit: (b) => stop(b),
    },
    bloom: {
      enter(b) { start(b); b.deps.hud.setObjective?.('Pollen in the air: keep moving out of the yellow. Cut five nodes, free the thralls.'); b.say(b.actor.pick(LINES.bloom), 3); },
      idle: (dt, b) => env(dt, b),
      update: (dt, b) => think(dt, b),
      windowClosed: (b) => closed(b),
      exit: (b) => stop(b),
    },
    overgrowth: {
      enter(b) { start(b); b.deps.hud.setObjective?.(b.players > 1 ? 'Nodes grow back now. Cut two at once, within three seconds of each other.' : 'Nodes grow back now. Cut them all fast, then strike while she is open.'); b.say(b.actor.pick(LINES.over), 3); },
      idle: (dt, b) => env(dt, b),
      update: (dt, b) => think(dt, b),
      windowClosed: (b) => closed(b),
      exit: (b) => stop(b),
    },
  },
});

function start(b) {
  const K = b.data.kit;
  K.clear();
  b.data.windows = 0;
  b.data.aimCool = 3; b.data.pollenCool = 5; b.data.spawnCool = 0;
  b.data.nodes = NODES.map((p, i) => ({ ...p, on: i < NODE_COUNT[b.phase], cut: false, t: 0, held: 0, armedAt: -99, m: null }));
  for (const n of b.data.nodes) paintNode(b, n);
  b.actor.e.vulnerable = 0;
  // Her first thralls come at once.
  for (let i = 0; i < Math.min(3, THRALLS[b.phase]); i++) spawnThrall(b, i);
}

function stop(b) {
  b.data.kit.clear();
  for (const e of b.data.thralls) { if (e.alive) b.deps.despawn?.(e); }
  b.data.thralls.clear();
  b.data.nodes = null;
}

function paintNode(b, n) {
  const K = b.data.kit;
  K.markers.release(n.m); n.m = null;
  if (!n.on) return;
  n.m = K.markers.place('plate', n, { color: n.cut ? 0x3a3a30 : 0x5aa83a, scale: 1.1 });
}

function regrowAll(b) {
  for (const n of b.data.nodes ?? []) if (n.on && n.cut) { n.cut = false; n.held = 0; paintNode(b, n); }
}

function spawnThrall(b, k = 0) {
  const D = b.deps;
  if (!D.spawn) return null;
  const p = EDGE[(k + Math.floor(b.t)) % EDGE.length];
  const e = D.spawn('grunt', { x: p.x + (k % 2), y: p.y, z: p.z, gang: 'ivy' });
  if (!e) return null;
  e.thrall = true;
  b.data.thralls.add(e);
  const C = D.combat;
  C.setEnemies([...C.enemies.filter((x) => x !== e), e]);
  e.wake?.();
  return e;
}

function free(b, e) {
  if (!b.data.thralls.has(e)) return;
  b.data.thralls.delete(e);
  e.thrall = false;
  b.data.freed += 1;
  const D = b.deps;
  D.events.emit('word', { text: 'FREED', pos: e.pos.clone?.().setY?.(e.pos.y + 2) ?? e.pos, big: false });
  D.events.emit('storyFreed', { boss: 'ivy', freed: b.data.freed });
  if (b.rng.chance?.(0.3)) b.say(b.actor.pick(LINES.freed), 1.8);
  setTimeout(() => { D.despawn?.(e); D.combat.setEnemies(D.combat.enemies.filter((x) => x !== e)); }, 400);
}

function closed(b) {
  regrowAll(b);
  if (!windowsDone(b, WINDOWS[b.phase])) b.say('You will not get that close twice.', 2.2);
}

function think(dt, b) {
  if (b.done || !b.data.nodes) return;
  const K = b.data.kit;
  // Keep her on the lawn, a few metres from whoever she is after (she is no brawler).
  const tgt = b.target;
  if (tgt && b.e.state !== 'open' && b.e.state !== 'aim' && b.e.state !== 'knocked') {
    const d = dist2(tgt.pos, b.actor.pos);
    if (d < 6) { const away = { x: b.actor.pos.x * 2 - tgt.pos.x, z: b.actor.pos.z * 2 - tgt.pos.z }; b.actor.moveTo(away, dt, { speed: 2.6, stop: 0.5 }); }
    else b.actor.ch.animator.play('Idle_Loop', { fade: 0.25 });
    b.actor.face(tgt.pos, 5, dt);
    if (d < 2.4 && (b.data.slapCool = (b.data.slapCool ?? 2) - dt) <= 0) { b.data.slapCool = 2.6; b.actor.melee({ kind: 'joker', windup: 0.7 * b.tier.tell, counter: true, clip: 'Melee_Hook' }); }
  }
  // Vine lash at range (red: dodge or get behind a hedge).
  b.data.aimCool -= dt;
  if (b.data.aimCool <= 0 && tgt && b.e.state !== 'open' && b.e.state !== 'aim') {
    b.data.aimCool = (b.phase === 0 ? 4.2 : 3.4) + b.rng.next() * 1.4;
    const at = b.punish ?? tgt;
    b.actor.aim(at, { windup: 1 * b.tier.tell, clip: 'OverhandThrow', fire: (h) => {
      if (!h) return;
      const p = b.actor.pos;
      for (let k = 1; k <= 3; k++) {
        const f = k / 3;
        K.disc({ x: p.x + (h.pos.x - p.x) * f, y: Y, z: p.z + (h.pos.z - p.z) * f }, { r: 2.2, grow: 0.5, color: 0x3a7a2a, tag: 'vine', onBite: (hh) => K.dose(hh, 7, 'buzzer') });
      }
    } });
  }
}

function env(dt, b) {
  if (b.done || !b.data.nodes) return;
  const K = b.data.kit, D = b.deps;
  const heroes = b.heroes;
  K.tick(dt);
  // Nodes: stand on one to cut it.
  const dual = b.phase === 2 && b.players > 1;
  for (const n of b.data.nodes) {
    if (!n.on || n.cut) continue;
    const on = heroes.some((h) => Math.hypot(h.pos.x - n.x, h.pos.z - n.z) < 1.7 && Math.abs(h.pos.y - n.y) < 2);
    n.held = on ? n.held + dt : Math.max(0, n.held - dt * 2);
    if (n.held < CUT_T) continue;
    n.held = 0;
    n.cut = true; n.t = 0; n.armedAt = b.t;
    paintNode(b, n);
    D.events.emit('word', { text: 'SNIP', pos: { x: n.x, y: n.y + 1.5, z: n.z }, big: false });
    if (b.rng.chance?.(0.5)) b.say(b.actor.pick(LINES.cut), 1.6);
    if (dual) {
      const partner = b.data.nodes.find((o) => o !== n && o.on && o.cut && b.t - o.armedAt < 3 && !o.paired);
      if (partner) { partner.paired = true; n.paired = true; }
    }
  }
  if (dual) {
    // Unpaired cuts older than three seconds grow back.
    for (const n of b.data.nodes) if (n.on && n.cut && !n.paired && b.t - n.armedAt > 3) { n.cut = false; paintNode(b, n); }
  } else if (b.phase === 2) {
    for (const n of b.data.nodes) if (n.on && n.cut) { n.t += dt; if (n.t > 12 && b.e.vulnerable <= 0) { n.cut = false; n.t = 0; paintNode(b, n); } }
  }
  // Every node cut: the shield falls.
  if (b.e.vulnerable <= 0 && b.e.state !== 'open' && b.data.nodes.filter((n) => n.on).every((n) => n.cut)) {
    for (const n of b.data.nodes) n.paired = false;
    b.say('No! The roots!', 2);
    b.actor.open(7 * b.tier.window);
    D.events.emit('bossStaggered', { id: 'ivy' });
  }
  // Pollen (phase 2+): a disc under a hero; inside, the spore meter climbs.
  if (b.phase >= 1) {
    b.data.pollenCool -= dt;
    if (b.data.pollenCool <= 0 && heroes.length) {
      b.data.pollenCool = 4.5 * b.tier.tell + 1;
      const h = heroes[Math.floor(b.rng.next() * heroes.length)];
      K.disc({ x: h.pos.x, y: Y, z: h.pos.z }, { r: 3.2, grow: 1.4, color: 0xd8c84a, tag: 'pollen', onBite: (hh) => spore(b, hh, 45) });
    }
  }
  for (const p of b.ctx.players()) {
    const h = p.hero;
    const v = Math.max(0, (b.data.spore.get(h) ?? 0) - 6 * dt);
    b.data.spore.set(h, v);
    K.fx.meter(p, v > 1 ? 'SPORES' : null, v / 100, v > 70 ? '#f2d24b' : '#9ac85a');
    K.fx.distort(p, v / 100, 'spore');
  }
  // More thralls wander in while she has fewer than her phase's share.
  b.data.spawnCool -= dt;
  const live = [...b.data.thralls].filter((e) => e.alive && !e.down).length;
  if (b.data.spawnCool <= 0 && live < THRALLS[b.phase]) { b.data.spawnCool = 9; spawnThrall(b, live); }
  // She stays in the combat list beside her thralls (the director pins her too).
  const C = D.combat;
  if (!C.enemies.includes(b.e)) C.setEnemies([...C.enemies, b.e]);
}


function spore(b, h, amount) {
  const v = Math.min(100, (b.data.spore.get(h) ?? 0) + amount * b.tier.damage);
  b.data.spore.set(h, v);
  if (v >= 100) { b.data.spore.set(h, 40); b.data.kit.dose(h, 16, 'gas'); b.say('Sleep, little bat.', 1.8); }
}
