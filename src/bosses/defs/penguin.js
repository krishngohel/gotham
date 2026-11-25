// The Penguin on the Iceberg Lounge roof (Night Two): a crowd-control and GADGETS fight.
//   1 'guards'    He holds the far end of the roof under an armoured umbrella, firing telegraphed
//                 umbrella bursts (red: dodge or break line of sight) while his bodyguards (a
//                 composeWave squad led by shields) rush the heroes. Bodyguards down: phase over.
//   2 'umbrella'  He comes down swinging. The umbrella stops every strike from the front (he says
//                 so). A batarang or the Batclaw (a stun) knocks it aside and opens a window; so
//                 does a hit from behind, which in co-op means one player draws him while the other
//                 flanks. Countered swings stagger him but do not open him. Four windows ([balance]); after one the
//                 umbrella is braced for a few seconds.
//   3 'blizzard'  A gas umbrella: freezing clouds lobbed where the heroes stand, three per volley,
//                 then he must reload (a window). A few bodyguards come back. Two windows.
// Kiting is punished: a hero who stays out of reach gets the next burst or lob (rules.js). Co-op
// adds one mechanic, not health: bursts and lobs go at both heroes. Difficulty: tells, windows and
// the adds budget scale by tier; the number of windows never does.
import * as THREE from 'three';
import { makeVillainBoss } from './brawler.js';
import { shotLands } from '../actor.js';
import { damageToHero } from '../../combat/rules.js';
import { withPlayer } from '../../core/events.js';

const LINES = {
  guard: ['Kevlar silk, Detective. Imported.', 'Not the umbrella! It was my mother\'s!', 'Manners! One knocks from the front.', 'Rain or shine, dear boy. Rain or shine.'],
  guards: ['Gentlemen! Earn your bonuses!', 'Do try not to bleed on the ice.', 'Twenty men and not one of them can hit a bat. I pay for this?'],
  shoot: ['Umbrella, open!', 'Duck, Detective! Oh, you did.', 'Hold still, the rain is coming.'],
  open: ['My umbrella! You brute!', 'That was a limited edition!', 'Put me down! I bruise like a peach!'],
  umbrella: 'Very well. If you want something done properly, you hire it. If you want it done stylishly, you do it yourself.',
  blizzard: 'Enough! Let us cool your temper, shall we?',
  reload: 'Blast, the canister. One moment.',
};

const CLOUD_R = 3.2, CLOUD_LIFE = 6;

export const penguinDef = makeVillainBoss({
  id: 'penguin', name: 'THE PENGUIN', villain: 'penguin', model: 'crimeBoss', gang: 'penguin', act: 2,
  site: 'n2PenguinArena', start: 'n2PenguinStart', arena: { x: 49, y: 22, z: -623, r: 7 },
  colors: ['#5a2a6a', '#e8e2d6'],
  intro: 'penguinIntro', outro: 'penguinOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 13, kiteT: 3.5, swapEvery: 8 },
  phases: [{ id: 'guards', name: 'The bodyguards' }, { id: 'umbrella', name: 'The umbrella' }, { id: 'blizzard', name: 'The blizzard' }],
  // [balance] The scripted player's hint (scripts/lib/player-bot.mjs): bodyguards first (his bursts
  // are red aims the bot dodges itself); then a batarang knocks the umbrella aside between his
  // swings; in the blizzard, stay out of the clouds and strike when he reloads.
  sim(b) {
    const me = b.heroes[0];
    if (!me) return null;
    if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.6, action: 'punch' };
    const inCloud = (b.data.clouds ?? []).find((c) => Math.hypot(c.x - me.pos.x, c.z - me.pos.z) < CLOUD_R + 0.5);
    if (inCloud) { const dx = me.pos.x - inCloud.x, dz = me.pos.z - inCloud.z, d = Math.hypot(dx, dz) || 1; return { goTo: { x: me.pos.x + (dx / d) * 4, y: me.pos.y, z: me.pos.z + (dz / d) * 4 }, stop: 0.3 }; }
    if (b.phase === 1 && b.e.state !== 'windup' && b.e.state !== 'swing') return { goTo: b.actor.pos, stop: 5, action: 'batarang' };
    return null;
  },
  setup(ctx, b) {
    const { actor, e } = b;
    const deps = b.deps;
    b.data.clouds = [];
    b.data.mat = new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.32, depthWrite: false });
    // Strikes from behind count as knocking the umbrella aside (the flank, the co-op answer).
    const hit = e.applyHit;
    e.applyHit = (result, from, opts) => {
      if (b.phase === 1 && !(e.vulnerable > 0) && e.state !== 'windup' && result.outcome !== 'immune' && result.outcome !== 'stun' && from) {
        const toHero = Math.atan2(from.x - actor.pos.x, from.z - actor.pos.z);
        const diff = Math.abs(Math.atan2(Math.sin(toHero - actor.ch.yaw), Math.cos(toHero - actor.ch.yaw)));
        if (diff > 2.1) { openUp(b, 'flank'); return false; }
        if (!b.data.tipped) { b.data.tipped = true; deps.hud.card?.('UMBRELLA SHIELD', 'Nothing gets through it from the front. A batarang or the Batclaw knocks it aside (so does a hit from behind). Then strike.', 7000); }
      }
      return hit(result, from, opts);
    };
    // [balance] After a window the umbrella is braced for a few seconds: a second batarang straight
    // away bounces off (the scripted player emptied this phase in 8 s by throwing every 0.8 s).
    e.onStun = () => { if (b.phase === 1 && !(e.vulnerable > 0)) { if (b.t - (b.data.openedAt ?? -99) < 6) { b.say('Not twice, Detective. Manners.', 1.6); return; } openUp(b, 'gadget'); } };
  },
  phase: {
    guards: {
      enter(b) {
        b.say('Gentlemen! Our guest is leaving. Help him off the roof.', 3);
        b.data.shotT = 2.5;
        b.ctx.adds(6, { at: 'n2PenguinArena', ring: 6, id: 'penguinGuards' });
      },
      idle(dt, b) { guards(dt, b, true); },
      update(dt, b) { guards(dt, b, false); },
    },
    umbrella: {
      enter(b) {
        b.say(LINES.umbrella, 3.5);
        b.data.windows = 0; b.data.cool = 1.5; b.data.burstT = 6;
        ensureListed(b);
      },
      update(dt, b) { umbrellaFight(dt, b); },
      idle(dt, b) { b.actor.tick(dt, null, b.target); ensureListed(b); },
      windowClosed(b) {
        b.data.windows += 1;
        b.inPhase = b.data.windows / 4;
        b.say(b.actor.pick(LINES.open), 2);
        if (b.data.windows >= 4) b.next(); // [balance] was 3
      },
    },
    blizzard: {
      enter(b) {
        b.say(LINES.blizzard, 3);
        b.data.windows = 0; b.data.lobs = 0; b.data.lobT = 2; b.data.cool = 2;
        b.ctx.adds(4, { at: 'n2PenguinArena', ring: 6, id: 'penguinGuards2' });
      },
      update(dt, b) { blizzard(dt, b); },
      idle(dt, b) { b.actor.tick(dt, null, b.target); blizzard(dt, b); ensureListed(b); },
      windowClosed(b) {
        b.data.windows += 1;
        b.inPhase = b.data.windows / 2;
        if (b.data.windows >= 2) b.win();
      },
      exit(b) { clearClouds(b); },
    },
  },
});

function guards(dt, b, tick) {
  if (tick && b.actor.tick(dt, null, b.target)) { if (!b.deps.encounters?.id) b.next(); return; }
  if (b.e.state !== 'aim') {
    b.actor.face(b.target?.pos, 4, dt);
    b.actor.ch.animator.play('Idle_FoldArms_Loop', { fade: 0.3 });
    b.data.shotT -= dt;
    if (b.data.shotT <= 0) { b.data.shotT = 3.6 + b.rng.next() * 1.6; burst(b); }
    if (b.rng.next() < dt * 0.08) b.say(b.actor.pick(LINES.guards), 2.2);
  }
  if (!b.deps.encounters?.id) b.next();
}

// He is attackable this phase: back on the combat list after an adds squad replaced it.
function ensureListed(b) {
  const C = b.deps.combat;
  if (!C.enemies.includes(b.e)) C.setEnemies([...C.enemies, b.e]);
}

function openUp(b, how) {
  b.data.openedAt = b.t + 4 * b.tier.window; // [balance] braced again from when this window ends
  b.say(b.actor.pick(LINES.open), 2);
  b.actor.open(4 * b.tier.window);
  b.deps.events.emit('bossVulnerable', { id: 'penguin', how });
}

// Who the next shot is for: a kiter first, then his target; co-op: both heroes.
function shotTargets(b) {
  const first = b.punish ?? b.target;
  const out = first ? [first] : [];
  if (b.players > 1) for (const h of b.heroes) if (!out.includes(h)) out.push(h);
  return out;
}

function burst(b) {
  const targets = shotTargets(b);
  if (!targets.length) return;
  b.say(b.actor.pick(LINES.shoot), 1.4);
  b.actor.aim(targets[0], {
    windup: 0.95 * b.tier.tell,
    clip: 'Idle_Rail_Call',
    fire: () => {
      for (const h of targets) {
        if (shotLands(b.deps.collision, b.actor.pos, h)) b.ctx.hurt(h, 'pistol', b.e);
        b.deps.events.emit('rifleShot', { from: b.actor.pos.clone(), to: h.pos.clone(), target: h, hit: true });
      }
    },
  });
}

function umbrellaFight(dt, b) {
  const { actor } = b;
  const tgt = b.target;
  if (!tgt) return;
  b.data.cool -= dt;
  b.data.burstT -= dt;
  // A kiter, or every few seconds: plant the feet and fire a burst instead of swinging.
  b.data.punishT = (b.data.punishT ?? 0) - dt;
  if ((b.punish && b.data.punishT <= 0) || b.data.burstT <= 0) { b.data.burstT = 7; b.data.punishT = 2.5; burst(b); return; }
  const d = actor.moveTo(tgt.pos, dt, { speed: 2.9, stop: 2.1 });
  actor.face(tgt.pos, 8, dt);
  if (d <= 2.5 && b.data.cool <= 0) {
    const red = b.rng.next() < 0.3;
    actor.melee({ kind: red ? 'brute' : 'joker', windup: (red ? 0.8 : 0.65) * b.tier.tell, counter: !red });
    b.data.cool = 1.4 + b.rng.next() * 1.2;
  }
}

function blizzard(dt, b) {
  const { actor } = b;
  updateClouds(dt, b);
  if (['aim', 'open', 'windup', 'swing', 'knocked', 'flinch'].includes(b.e.state)) return;
  const tgt = b.target;
  if (!tgt) return;
  b.data.lobT -= dt;
  b.data.cool -= dt;
  const d = Math.hypot(tgt.pos.x - actor.pos.x, tgt.pos.z - actor.pos.z) || 0.01;
  if (d < 2.6 && b.data.cool <= 0) {
    actor.melee({ kind: 'brute', windup: 0.75 * b.tier.tell, counter: false });
    b.data.cool = 2.2;
    return;
  }
  if (b.data.lobT <= 0) {
    if (b.data.lobs >= 3) {
      b.data.lobs = 0; b.data.lobT = 3.5;
      b.say(LINES.reload, 2);
      actor.open(3.5 * b.tier.window);
      return;
    }
    b.data.lobs += 1;
    b.data.lobT = 2.6;
    const targets = shotTargets(b);
    actor.aim(targets[0], { windup: 0.85 * b.tier.tell, fire: () => { for (const h of targets) spawnCloud(b, h.pos); } });
    return;
  }
  // Waddle to keep a lobbing distance.
  const want = 7;
  if (d < want - 1) {
    actor.pos.x -= ((tgt.pos.x - actor.pos.x) / d) * 2 * dt; actor.pos.z -= ((tgt.pos.z - actor.pos.z) / d) * 2 * dt;
    actor.clamp(); actor.ch.animator.play('Walk_Loop', { fade: 0.2 });
  } else actor.moveTo(tgt.pos, dt, { speed: 2.4, stop: want });
  actor.face(tgt.pos, 6, dt);
}

function spawnCloud(b, p) {
  const grp = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(1.2 + b.rng.next() * 0.8, 10, 8), b.data.mat);
    puff.position.set((b.rng.next() - 0.5) * 3, 0.5 + b.rng.next(), (b.rng.next() - 0.5) * 3);
    grp.add(puff);
  }
  grp.position.set(p.x, p.y, p.z);
  b.deps.scene.add(grp);
  b.data.clouds.push({ grp, x: p.x, z: p.z, t: 0, ticks: new Map() });
  b.deps.events.emit('gas');
}

function updateClouds(dt, b) {
  const list = b.data.clouds;
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    c.t += dt;
    c.grp.scale.setScalar(Math.min(1, c.t * 2) * (c.t > CLOUD_LIFE - 0.7 ? Math.max(0, (CLOUD_LIFE - c.t) / 0.7) : 1));
    for (const h of b.heroes) {
      if (Math.hypot(h.pos.x - c.x, h.pos.z - c.z) > CLOUD_R) continue;
      const t = (c.ticks.get(h) ?? 0) - dt;
      if (t > 0) { c.ticks.set(h, t); continue; }
      c.ticks.set(h, 0.5);
      const dmg = damageToHero('gas', { difficulty: b.ctx.difficulty, invulnerable: h.invulnerable > 0 }) * 1.5;
      if (dmg <= 0) continue;
      h.health = Math.max(0, h.health - dmg);
      b.deps.events.emit('heroHurt', withPlayer({ kind: 'gas', damage: dmg }, h.player ?? null));
      if (h.health <= 0) { const f = b.deps.combat.fighterFor?.(h); if (f?.killHero) f.killHero(); else b.deps.combat.killHero?.(); }
    }
    if (c.t > CLOUD_LIFE) { b.deps.scene.remove(c.grp); list.splice(i, 1); }
  }
}

function clearClouds(b) {
  for (const c of b.data.clouds ?? []) b.deps.scene.remove(c.grp);
  if (b.data.clouds) b.data.clouds.length = 0;
}
