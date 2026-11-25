// The masked strategist in the Blackgate yard (Night Eight): a COMBAT MASTERY boss (research doc
// 6.2). He has studied Batman from the outside and fights to expose habits.
//   He reads you. Counter his blue swings (two in a row opens him), but counter three times running
//   and he has your rhythm: his next swing is a feint that turns red (dodge it, or eat it).
//   His lieutenant and the False Faces come in mixed squads: shields, knives, a brute, a medic,
//   gunmen. Each needs its own answer (cape the shield, dodge the knife, beat the medic first,
//   close on the gunmen). He waits for you to make the wrong one.
//   1 'The Interview'     a brawl; counters open him; two windows
//   2 'Hostile Takeover'  he draws twin pistols (red: dodge, then close); a mixed squad with his
//                         lieutenant; he only opens after you dodge a volley and then counter him
//                         twice; two windows
//   3 'The Mask Slips'    everything at once: feints, volleys, a last squad; two windows
// No tools are taken here (the gauntlet below did that): it is just you, your hands and your timing.
import { makeVillainBoss, brawl } from './brawler.js';
import { bossKit, windowsDone, dist2 } from './kit.js';
import { shotLands } from '../actor.js';

const WINDOWS = [2, 2, 2];
const LINES = {
  guard: ['I have watched every tape of you. Every one.', 'Predictable.', 'You hit like a man with a schedule.', 'That is not how you beat a shield. I know. I read your file.'],
  open: ['Let us talk business, Batman. Your methods, my margins.', 'I bought the toxin. I bought the frost. I bought the fire. I can buy you.', 'I switched your toys back on so you could not blame them. Generous, no?'],
  read: ['I know that move.', 'Again? Really?', 'Three counters. Like clockwork. Clocks break.', 'You always do that.'],
  feint: ['Gotcha.', 'Changed my mind.', 'Not that one.'],
  guns: ['Corporate restructuring.', 'Let us cut costs.', 'Severance package!'],
  slip: ['You think I need the mask? I AM the mask!', 'Everybody wears one. Mine is just honest.', 'Enough. No more meetings.'],
  hurt: ['That will cost you.', 'I will have that tooth gilded.', 'Lawyers. I want lawyers.'],
  lieut: ['Mr. Haddox. Take care of this.', 'Gentlemen. Earn your bonus.'],
};

export const blackMaskDef = makeVillainBoss({
  id: 'blackMask', name: 'BLACK MASK', villain: 'blackMask', model: 'blackMask',
  site: 'n8MaskArena', start: 'n8MaskStart', arena: { x: 165, y: 2.2, z: 385, r: 11 }, gang: 'blackMask', act: 5,
  colors: ['#c8c8c8', '#8a1a1a'],
  intro: 'maskIntro', outro: 'maskOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 11, kiteT: 3.5, swapEvery: 7 },
  phases: [{ id: 'interview', name: 'The Interview' }, { id: 'takeover', name: 'Hostile Takeover' }, { id: 'maskSlips', name: 'The Mask Slips' }],
  setup(ctx, b) {
    b.data.kit = bossKit(ctx, b);
    b.data.streak = 0;
    b.data.dodged = false;
    b.e.onStun = () => b.say(b.actor.pick(LINES.guard), 1.6);
    // A clean dodge of a volley counts toward opening him in the gun phases.
    b.deps.events.on('dodge', () => { b.data.streak = 0; if (b.data.volleyT > 0) b.data.dodged = true; });
    b.deps.events.on('bossCountered', ({ id }) => {
      if (id !== 'blackMask') return;
      b.data.streak += 1;
      if (b.data.streak >= 3) { b.data.feintNext = true; b.data.streak = 0; b.say(b.actor.pick(LINES.read), 1.6); }
    });
    b.deps.events.on('bossHit', ({ id }) => { if (id === 'blackMask' && b.rng.next() < 0.25) b.say(b.actor.pick(LINES.hurt), 1.4); });
  },
  sim(b) {
    const e = b.e;
    if (e.state === 'windup') return { action: e.glyph === 'red' ? 'dodge' : 'block' };
    if (e.state === 'aim') return { action: 'dodge' };
    return null;
  },
  hazards: (b) => ({ streak: b.data.streak, volley: Math.max(0, Math.round((b.data.volleyT ?? 0) * 100) / 100), dodged: !!b.data.dodged }),
  phase: {
    interview: {
      enter(b) { reset(b); b.deps.hud.setObjective?.('Counter his blue swings. Do not counter three times in a row: he reads you.'); b.say(b.actor.pick(LINES.open), 3.4); },
      update: (dt, b) => fight(dt, b, { guns: false }),
      idle: (dt, b) => keep(b),
      windowClosed: (b) => { if (!windowsDone(b, WINDOWS[0])) b.say('Again, then.', 1.6); },
      exit: (b) => b.data.kit.clear(),
    },
    takeover: {
      enter(b) { reset(b); b.deps.hud.setObjective?.('Pistols (red): dodge the volley, then counter him twice. Each of his men needs his own answer.'); b.say(b.actor.pick(LINES.guns), 2.6); b.ctx.adds(8, { at: 'n8MaskArena', ring: 7, gang: 'blackMask', act: 5, id: 'maskSquad1', lead: 'lieutenant' }); b.say(b.actor.pick(LINES.lieut), 2.4); },
      update: (dt, b) => fight(dt, b, { guns: true }),
      idle: (dt, b) => keep(b),
      windowClosed: (b) => { b.data.dodged = false; if (!windowsDone(b, WINDOWS[1])) b.say('You are costing me money.', 1.8); },
      exit: (b) => b.data.kit.clear(),
    },
    maskSlips: {
      enter(b) { reset(b); b.deps.hud.setObjective?.('Everything at once. Read him: blue, counter. Red, dodge. Guns, dodge then close.'); b.say(b.actor.pick(LINES.slip), 3); b.ctx.adds(10, { at: 'n8MaskArena', ring: 8, gang: 'blackMask', act: 5, id: 'maskSquad2', lead: 'heavy' }); },
      update: (dt, b) => fight(dt, b, { guns: true, feints: true }),
      idle: (dt, b) => keep(b),
      windowClosed: (b) => { b.data.dodged = false; windowsDone(b, WINDOWS[2]); },
      exit: (b) => b.data.kit.clear(),
    },
  },
});

function reset(b) {
  b.data.windows = 0; b.data.streak = 0; b.data.feintNext = false; b.data.gunCool = 3; b.data.volleyT = 0; b.data.dodged = false; b.data.countered = 0;
}

function keep(b) {
  const C = b.deps.combat;
  if (!b.done && !C.enemies.includes(b.e)) C.setEnemies([...C.enemies, b.e]);
}

function fight(dt, b, { guns = false, feints = false } = {}) {
  const { actor, e } = b;
  b.data.volleyT = Math.max(0, (b.data.volleyT ?? 0) - dt);
  // The feint: his rhythm read, the next swing is red (dodge).
  if (b.data.feintNext && b.target && dist2(b.target.pos, actor.pos) < 2.6) {
    b.data.feintNext = false;
    actor.melee({ kind: 'heavy', windup: 0.55 * b.tier.tell, counter: false, clip: 'Melee_Hook' });
    b.say(b.actor.pick(LINES.feint), 1.2);
    return;
  }
  if (guns) {
    b.data.gunCool -= dt;
    const tgt = b.punish ?? b.target;
    if (b.data.gunCool <= 0 && tgt) {
      b.data.gunCool = (feints ? 4.5 : 5.5) + b.rng.next() * 1.5;
      b.data.volleyT = 2.2;
      actor.aim(tgt, { windup: 0.9 * b.tier.tell, clip: 'OverhandThrow', fire: (h) => {
        if (!h) return;
        if (shotLands(b.deps.collision, actor.pos, h, 30)) b.data.kit.dose(h, 14, 'shot');
        b.deps.events.emit('shot', { pos: actor.pos, from: 'blackMask' });
      } });
      return;
    }
  }
  // The brawl: two counters open him (in the gun phases, only after a dodged volley).
  brawl(dt, b, { counters: 2, windup: feints ? 0.5 : 0.6, every: feints ? [0.9, 1.7] : [1.1, 2], redChance: feints ? 0.35 : 0.2, kind: 'heavy', openFor: 4 });
  if (guns) {
    const open = e.onCountered;
    e.onCountered = () => { if (!b.data.dodged) { b.data.countered = 0; b.say('Not until you have earned it.', 1.4); return; } open?.(); };
  }
}
