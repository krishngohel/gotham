// The burlap doctor on the roof of the Stack (Night Four): a STEALTH boss (research doc 6.2).
//   1 'The Searchlight'  three gas carriers patrol the roof (the stealth runtime: silent
//                        takedowns, the alarm); a giant hallucination of him stands at the roof's
//                        corner and sweeps a light over it. Standing in the light fills the fear
//                        meter. In co-op a second giant sweeps from the opposite corner.
//   2 'House Calls'      he walks the roof with his own sight cone (shacks block it). Seen: he lobs
//                        a dose (fear) and slips into the fog to another corner. Reach him from
//                        outside his cone: caught, a short window, five strikes. Twice.
//   3 'The Last Dose'    the roof floods with toxin; he fights hand to hand (counter his blue
//                        swings, dodge the red), surrounded by goons that are not there. Striking a
//                        phantom spikes the fear meter. Three windows and he is done.
// A full fear meter is a panic: a hit of real damage and the meter drops back. No health sponge:
// phases are windows; difficulty scales tells, windows and the fear rates (src/bosses/rules.js).
import * as THREE from 'three';
import { makeVillainBoss, brawl } from './brawler.js';
import { loadVillain } from '../actor.js';
import { roomFight, W, route } from '../../story/rooms.js';
import { createStoryUi } from '../../story/ui.js';
import { createViewFx } from '../../story/viewFx.js';
import { inCone } from '../../story/stepLogic.js';
import { LAYER_FX } from '../../render/layers.js';
import { withPlayer } from '../../core/events.js';

const Y = 36;
// The Stack's roof: x -409..-385, z -457..-433 at y 36, with shacks (39 and 43 m) in the middle.
const ROOF = { x: -397, y: Y, z: -445, r: 11.5 };
const CORNERS = [{ x: -407, y: Y, z: -456 }, { x: -387, y: Y, z: -456 }, { x: -387, y: Y, z: -434 }, { x: -407, y: Y, z: -434 }];
const GIANTS = [{ x: -409.5, y: Y, z: -458, yaw: Math.atan2(12, 13) }, { x: -384.5, y: Y, z: -432, yaw: Math.atan2(-12, -13) }];
const PHANTOM_SPOTS = [{ x: -404, y: Y, z: -436 }, { x: -390, y: Y, z: -438 }, { x: -401, y: Y, z: -452 }, { x: -388, y: Y, z: -450 }, { x: -407, y: Y, z: -446 }, { x: -396, y: Y, z: -434 }];
// Phase 1's predator room on the roof: three carriers on the three clear lanes.
const CARRIERS = {
  id: 'stackRoof', site: { x: -397, y: Y, z: -445 }, entry: { x: -389, y: Y, z: -435 }, radius: 16, gang: 'scarecrow',
  lights: [{ x: -397, y: Y + 3, z: -445, r: 4 }],
  huddle: { x: -401, y: Y, z: -447 },
  squad: [
    { type: 'grunt', route: route('pingpong', W(-408, Y, -433.5, 2, Math.PI), W(-386, Y, -433.5, 2, Math.PI)) },
    { type: 'medic', route: route('pingpong', W(-408.5, Y, -455, 2, Math.PI / 2), W(-408.5, Y, -437, 2, Math.PI / 2)) },
    { type: 'grunt', route: route('pingpong', W(-406, Y, -456.5, 1.5, 0), W(-387, Y, -456.5, 1.5, 0)) },
  ],
};

const LINES = {
  guard: ['You cannot hit what you are afraid to see.', 'Closer. Tell me what you are frightened of.', 'Tsk. Bedside manner, Batman.'],
  searchlight: ['The light finds everyone eventually.', 'Hold still. This will only hurt the part of you that remembers.', 'My associates are doing rounds. Do not interrupt them.'],
  seen: ['There you are.', 'Peekaboo. Breathe deep.', 'I see you. Do you see me?'],
  caught: ['Ah. A house call.', 'You came up behind me. Rude, but educational.', 'No, no, you are supposed to be afraid of ME.'],
  panic: ['Your heart rate is magnificent.', 'Fear is just information. You are receiving a great deal of it.'],
  last: ['Then let us finish the treatment by hand.', 'Fine. No more hiding. Just you, me and the dark.'],
  phantom: ['That one was not there. Neither is the next one.', 'You keep hitting ghosts. Fascinating.'],
};

export const scarecrowDef = makeVillainBoss({
  id: 'scarecrow', name: 'THE SCARECROW', villain: 'scarecrow', model: 'scarecrow',
  site: 'scarecrowArena', start: 'scarecrowStart', arena: ROOF, gang: 'scarecrow', act: 3,
  colors: ['#b89a62', '#3a3022'],
  intro: 'scarecrowIntro', outro: 'scarecrowOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 10, kiteT: 3.5, swapEvery: 8 },
  phases: [{ id: 'searchlight', name: 'The Searchlight' }, { id: 'rounds', name: 'House Calls' }, { id: 'lastDose', name: 'The Last Dose' }],
  // [balance] The scripted player's hint (scripts/lib/player-bot.mjs). 1: a predator room (the
  // bot's own stealth: crouched, from behind). 2: round to his back outside his cone, crouched, then
  // in. 3: his swings are the bot's own tells; it never strikes a phantom (it skips hallucinations).
  sim(b) {
    const me = b.heroes[0];
    if (!me) return null;
    if (b.phase === 0) return { mode: 'stealth' };
    if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.6, action: 'punch', crouch: false };
    if (b.phase === 2) return { crouch: false };
    const yaw = b.actor.ch.yaw, p = b.actor.pos, fx = Math.sin(yaw), fz = Math.cos(yaw);
    const ahead = ((me.pos.x - p.x) * fx + (me.pos.z - p.z) * fz) > -0.5;
    const side = ((me.pos.x - p.x) * fz - (me.pos.z - p.z) * fx) >= 0 ? 1 : -1;
    const goal = ahead ? { x: p.x + fz * side * 6 - fx * 2.5, y: p.y, z: p.z - fx * side * 6 - fz * 2.5 } : { x: p.x - fx * 1.2, y: p.y, z: p.z - fz * 1.2 };
    return { goTo: goal, stop: 0.5, crouch: true };
  },
  setup(ctx, b) {
    const D = b.deps;
    b.data.fear = 0;
    b.data.ui = createStoryUi(() => document.querySelector('.hud'));
    b.data.fx = createViewFx({ hud: D.hud, players: () => ctx.players() });
    b.data.cones = [];
    b.data.giants = [];
    b.data.phantoms = [];
    b.data.puffs = [];
    // A sweeping light: a flat fan on the roof, on the FX layer (no light source).
    b.data.makeCone = (range, half, color) => {
      const geo = new THREE.BufferGeometry();
      const n = 14, pos = [0, 0.08, 0];
      for (let i = 0; i <= n; i++) { const a = -half + (2 * half * i) / n; pos.push(Math.sin(a) * range, 0.08, Math.cos(a) * range); }
      const idx = [];
      for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }));
      m.layers.set(LAYER_FX);
      m.visible = false;
      D.scene.add(m);
      return m;
    };
    // Direct toxin damage (like the Joker's gas): through the hero's own health, so god mode and
    // the co-op down rules apply.
    b.data.dose = (h, amount) => {
      if (!h || h.dead || h.invulnerable > 0) return;
      const dmg = Math.round(amount * b.tier.damage);
      h.health = Math.max(0, h.health - dmg);
      D.events.emit('heroHurt', withPlayer({ kind: 'gas', damage: dmg }, h.player ?? null));
      if (h.health <= 0) { if (h === D.hero || !D.combat.fighterFor) D.combat.killHero?.(); else D.combat.fighterFor(h)?.killHero?.(); }
    };
    b.data.addFear = (v) => {
      const before = b.data.fear;
      b.data.fear = Math.max(0, Math.min(100, before + v));
      if (Math.floor(b.data.fear / 25) > Math.floor(before / 25)) D.events.emit('fearRising', { value: b.data.fear });
      if (b.data.fear >= 100) {
        b.data.fear = 35;
        b.say(b.actor.pick(LINES.panic), 2.4);
        for (const h of b.heroes) b.data.dose(h, 22);
      }
    };
    b.data.los = (from, h) => {
      const c = D.collision;
      if (!c?.raycast) return true;
      const dx = h.pos.x - from.x, dy = h.pos.y + 1.2 - (from.y + 1.6), dz = h.pos.z - from.z, d = Math.hypot(dx, dy, dz);
      if (d < 0.5) return true;
      return !c.raycast({ x: from.x, y: from.y + 1.6, z: from.z }, { x: dx / d, y: dy / d, z: dz / d }, d - 0.5);
    };
    b.data.paint = () => {
      const f = b.data.fear / 100;
      // [story2] One gas cloud, one shared fear: shown on every player's own view (split-screen aware).
      for (const p of ctx.players()) { b.data.fx.meter(p, 'FEAR', f, f > 0.7 ? '#c8323c' : '#b89a62'); b.data.fx.distort(p, f, 'fear'); }
    };
    b.data.clearUi = () => { b.data.fx.clear(); };
    // A gas puff: a green ball that swells and fades where the dose lands.
    b.data.puff = (p) => {
      let m = b.data.puffs.find((x) => !x.visible);
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0x7ac85a, transparent: true, opacity: 0.4, depthWrite: false }));
        m.layers.set(LAYER_FX);
        D.scene.add(m);
        b.data.puffs.push(m);
      }
      m.position.set(p.x, p.y + 1, p.z);
      m.userData.t = 0;
      m.visible = true;
    };
    b.data.tickPuffs = (dt) => {
      for (const m of b.data.puffs) {
        if (!m.visible) continue;
        m.userData.t += dt;
        m.scale.setScalar(0.5 + m.userData.t * 2.2);
        m.material.opacity = Math.max(0, 0.45 - m.userData.t * 0.2);
        if (m.userData.t > 2.2) m.visible = false;
      }
    };
    // Giant hallucinations (a second copy of his figure, three times the size), lazily loaded.
    b.data.giantP = [];
    b.data.giant = (i) => (b.data.giantP[i] ??= loadVillain(D.assets, 'scarecrow').then((g) => {
      g.root.scale.setScalar(3);
      g.root.position.set(GIANTS[i].x, GIANTS[i].y, GIANTS[i].z);
      g.face(GIANTS[i].yaw);
      g.animator.play('Idle_Rail_Call', { fade: 0 });
      g.root.visible = false;
      D.scene.add(g.root);
      b.data.giants[i] = g;
      return g;
    }));
    // Striking a phantom (a goon that is not there): the meter jumps and it dissolves.
    D.events.on('impact', ({ target }) => {
      if (!target?.hallucination || !b.data.phantoms.includes(target)) return;
      target.hallucination = false;
      b.data.puff(target.pos);
      b.data.addFear(30 * b.tier.damage);
      if (b.rng.next() < 0.5) b.say(b.actor.pick(LINES.phantom), 2);
      setTimeout(() => {
        const k = b.data.phantoms.indexOf(target);
        if (k >= 0) b.data.phantoms.splice(k, 1);
        D.despawn?.(target);
        D.combat.setEnemies(D.combat.enemies.filter((x) => x !== target));
      }, 220);
    });
    // Phase 1 ends when every carrier is down.
    D.events.on('fightDone', ({ id }) => { if (id === 'scarecrowCarriers' && b.phase === 0 && !b.done && b.data.carriersLive) { b.data.carriersLive = false; b.next(); } });
    // The giants' light and the fear meter run whatever state he is in.
    const orig = b.e.update;
    b.e.update = (dt, ectx) => { env(dt, b); orig(dt, ectx); };
  },
  phase: {
    searchlight: {
      enter(b) {
        const D = b.deps;
        b.data.fear = 0;
        // He conducts from the top of the tallest shack while his carriers do the rounds.
        b.actor.place({ x: -406, y: 42.5, z: -454 }, Math.PI / 4);
        b.actor.ch.animator.play('Idle_Rail_Call', { fade: 0.2 });
        D.hud.setObjective?.('Take his three gas carriers silently. Stay out of the light from the giant.');
        b.say(b.actor.pick(LINES.searchlight), 3);
        startCones(b, b.players > 1 ? 2 : 1);
        const def = roomFight(CARRIERS, (id) => id);
        D.encounters?.begin('scarecrowCarriers', { ...def, gang: 'scarecrow' });
        b.data.carriersLive = true;
      },
      idle(dt, b) { env(dt, b); b.actor.face(b.target?.pos, 2, dt); },
      exit(b) {
        b.data.carriersLive = false;
        if (b.deps.encounters?.id === 'scarecrowCarriers') b.deps.encounters.end();
        stopCones(b);
        b.data.clearUi();
      },
    },
    rounds: {
      enter(b) {
        b.data.caught = 0;
        b.data.seenT = 0;
        b.data.wp = 1;
        startCones(b, b.players > 1 ? 2 : 1, 0.75);
        b.actor.place(CORNERS[0], 0);
        b.deps.combat.setEnemies([b.e]);
        b.deps.hud.setObjective?.('Get behind him without being seen. Catch him twice.');
        b.say('Enough watching. I make house calls.', 3);
        b.e.onWindowMissed = () => vanish(b);
      },
      update(dt, b) {
        const { actor } = b;
        // Walk the corners; look where he walks.
        const goal = CORNERS[b.data.wp % CORNERS.length];
        if (actor.moveTo(goal, dt, { speed: b.tier.tell < 1 ? 2.6 : 2.3, stop: 0.8 }) < 1) b.data.wp += 1;
        actor.face(goal, 4, dt);
        const me = { x: actor.pos.x, z: actor.pos.z, yaw: actor.ch.yaw };
        let seen = null, close = null;
        for (const h of b.heroes) {
          const d = Math.hypot(h.pos.x - actor.pos.x, h.pos.z - actor.pos.z);
          const range = h.crouched ? 6.5 : 9.5;
          if (inCone(me, h.pos, { range, half: 0.8 }) && b.data.los(actor.pos, h)) seen = h;
          else if (d < 2.6 && Math.abs(h.pos.y - actor.pos.y) < 2) close = h;
        }
        if (close && !seen) {
          // Caught from behind: a window.
          b.say(actor.pick(LINES.caught), 2.4);
          actor.open(4.5 * b.tier.window);
          b.deps.events.emit('bossStaggered', { id: 'scarecrow' });
          return;
        }
        b.data.seenT = seen ? b.data.seenT + dt : 0;
        if (b.data.seenT > 0.35 / b.tier.tell) {
          b.data.seenT = 0;
          b.say(actor.pick(LINES.seen), 2);
          actor.aim(seen, { windup: 0.7 * b.tier.tell, clip: 'OverhandThrow', fire: (h) => { if (!h) return; b.data.puff(h.pos); b.data.addFear(38 * b.tier.damage); b.data.dose(h, 6); vanish(b); } });
          return;
        }
        // Kiting from across the roof is not free: the far one gets a dose lobbed at them.
        if (b.punish && b.t - (b.data.lobT ?? -99) > 6) {
          b.data.lobT = b.t;
          actor.aim(b.punish, { windup: 1.0 * b.tier.tell, fire: (h) => { if (h) { b.data.puff(h.pos); b.data.addFear(20 * b.tier.damage); } } });
        }
      },
      windowClosed(b) {
        b.data.caught += 1;
        if (b.data.caught >= 2) { b.next(); return; } // [balance] tried 3: a skilled run never caught him a third time in 10 min
        b.say('Twice? No. Once was a fluke.', 2.4);
        setTimeout(() => { if (b.phase === 1) vanish(b); }, 1300);
      },
      exit(b) { stopCones(b); b.e.onWindowMissed = null; b.data.clearUi(); },
    },
    lastDose: {
      enter(b) {
        const D = b.deps;
        b.data.windows = 0;
        b.data.countered = 0;
        D.hud.setObjective?.('Counter his swings. Do not hit the figures that are not there.');
        b.say(b.actor.pick(LINES.last), 3);
        b.actor.place({ x: -397, y: Y, z: -438 }, Math.PI);
        // Phantoms: goons that are not there (co-op: more of them, the extra mechanic).
        const n = b.players > 1 ? 6 : 4;
        const types = ['heavy', 'grunt', 'knife', 'grunt', 'baton', 'knife'];
        b.data.phantoms = [];
        for (let i = 0; i < n && D.spawn; i++) {
          const p = PHANTOM_SPOTS[i];
          const e = D.spawn(types[i], { x: p.x, y: Y, z: p.z, gang: 'scarecrow' });
          e.hallucination = true;
          e.wake = () => {};
          e.aware = false;
          b.data.phantoms.push(e);
        }
        D.combat.setEnemies([b.e, ...b.data.phantoms]);
      },
      update(dt, b) {
        // [balance] One shared meter for two heroes filled as fast as for one, and a panic doses both:
        // the co-op scripted pair went down five times here. Two players: 60 % of the passive rate.
        b.data.addFear(3 * b.tier.damage * dt * (b.players > 1 ? 0.6 : 1));
        brawl(dt, b, { counters: 2, windup: 0.65, every: [1.3, 2.3], redChance: 0.35, kind: 'knife', openFor: 4 });
      },
      idle(dt, b) { env(dt, b); keepListed(b); },
      windowClosed(b) {
        b.data.windows += 1;
        if (b.data.windows >= 3) { b.next(); return; } // [balance] was 2
        b.say('Is that... is that MY fear? How unpleasant.', 2.6);
      },
      exit(b) {
        const D = b.deps;
        for (const e of b.data.phantoms) D.despawn?.(e);
        D.combat.setEnemies(D.combat.enemies.filter((x) => !b.data.phantoms.includes(x)));
        b.data.phantoms = [];
        b.data.clearUi();
      },
    },
  },
});

function keepListed(b) {
  const C = b.deps.combat;
  if (!b.done && !C.enemies.includes(b.e)) C.setEnemies([...C.enemies, b.e]);
}

// He slips into the fog: to the corner farthest from every hero.
function vanish(b) {
  if (b.done) return;
  let best = CORNERS[0], bd = -1;
  for (const c of CORNERS) {
    const d = Math.min(...b.heroes.map((h) => Math.hypot(h.pos.x - c.x, h.pos.z - c.z)), 99);
    if (d > bd) { bd = d; best = c; }
  }
  b.data.puff(b.actor.pos);
  b.actor.place(best, b.actor.ch.yaw);
  b.e.state = 'recover'; b.e.t = 0; b.e.vulnerable = 0; b.e.glyph = null;
  b.data.wp = CORNERS.indexOf(best) + 1;
}

function startCones(b, n, scale = 1) {
  stopCones(b);
  for (let i = 0; i < n; i++) {
    b.data.cones[i] ??= b.data.makeCone(24, 0.3, 0xe8d23a);
    const c = b.data.cones[i];
    c.position.set(GIANTS[i].x, Y, GIANTS[i].z);
    c.userData = { base: GIANTS[i].yaw, t: i * 2.3, sweep: 0.65, speed: 0.45 * (1 / b.tier.tell) * scale, active: true };
    c.visible = true;
    b.data.giant(i).then((g) => { if (c.userData.active) g.root.visible = true; });
  }
}
function stopCones(b) {
  for (const c of b.data.cones ?? []) { c.visible = false; c.userData.active = false; }
  for (const g of b.data.giants ?? []) if (g) g.root.visible = false;
}

// Every frame: the giants' sweeping light, the fear meter, the puffs.
function env(dt, b) {
  if (b.done) return;
  b.data.tickPuffs(dt);
  let lit = false;
  for (let i = 0; i < b.data.cones.length; i++) {
    const c = b.data.cones[i];
    if (!c.visible) continue;
    c.userData.t += dt * c.userData.speed;
    const yaw = c.userData.base + Math.sin(c.userData.t) * c.userData.sweep;
    c.rotation.y = yaw;
    const g = b.data.giants[i];
    if (g) { g.face(yaw); g.animator.update(dt); }
    const eye = { x: c.position.x, y: Y + 4, z: c.position.z };
    for (const h of b.heroes) {
      if (inCone({ x: c.position.x, z: c.position.z, yaw }, h.pos, { range: 24, half: 0.3 }) && Math.abs(h.pos.y - Y) < 6 && b.data.los(eye, h)) lit = true;
    }
  }
  if (lit) b.data.addFear(26 * b.tier.damage * dt);
  else if (b.phase < 2) b.data.fear = Math.max(0, b.data.fear - 6 * dt);
  b.data.paint();
}
