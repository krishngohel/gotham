// The flying arsonist over Lakeshore Drive (Night Seven): a VEHICLE boss (research doc 6.2). The
// fight is driven: the step is `{ type: 'boss', boss: 'firefly', vehicle: true }`, so the hero
// stays in the Batmobile (flow.js keeps a vehicle boss step in the car).
//   He circles high over the drive. When he SWOOPS (a ring marks his line, a whine and a red tell),
//   he comes down to bumper height for two seconds: ram him at speed. Each ram is a strike.
//   His firebombs land where the car is going, not where it is: brake, swerve, boost.
//   Fuel drones (phase 2+) fly in to refuel him: drive through them (or, on foot, stand in their
//   path). A drone that reaches him makes his next swoop untouchable.
//   On foot he is not your problem, he says, and sets the grass around you alight.
//   1 'Torchlight'   two rams
//   2 'Refuel'       three rams, fuel drones
//   3 'Burn Out'     three rams; burning lanes sweep the drive; double swoops
// The Batmobile's armour is a meter on the driver's view; at zero the car limps out and the phase
// starts again (no game over). Co-op: the drones come in pairs, and a partner on foot can knock
// them down while the driver rams.
import * as THREE from 'three';
import { makeVillainBoss } from './brawler.js';
import { bossKit, dist2 } from './kit.js';

const Y = 0;
const ARENA = { x: 345, z: -330, r: 70 };
const CENTRE = { x: 345, y: Y, z: -330 };
const RAMS = [2, 3, 3];
const HIGH = 11;
const V = () => (typeof window !== 'undefined' ? window.__game?.vehicles ?? null : null);

const LINES = {
  guard: ['You cannot punch the sky, Batman.', 'Up here, the rules are mine.', 'Get in your car. This is a car fight.'],
  open: ['Lakeshore Drive. Six lanes, no exits, and one very flammable evening.', 'You like your car? I like it too. On fire.', 'The city made me file a permit. This is my permit.'],
  swoop: ['Coming in hot!', 'Duck!', 'Low pass!', 'Watch the paint!'],
  rammed: ['My thrusters!', 'You hit a man with a car! Who does that?', 'Ow. Ow. Ow, and also ow.'],
  miss: ['Too slow, Bat.', 'Missed me by a mile. Well. A metre.', 'Better luck next lap.'],
  refuel: ['Fill her up!', 'Topped off. Thanks, little drone.', 'Unleaded. My favourite.'],
  lanes: ['Every lane is the fast lane tonight.', 'Burn out!'],
  foot: ['On foot? Brave. Stupid, but brave.', 'Walking? On my highway?'],
  disabled: ['Ha! Tow truck for the Batmobile!', 'That is going to cost you a fortune. Oh wait.'],
};

export const fireflyDef = makeVillainBoss({
  id: 'firefly', name: 'FIREFLY', villain: 'firefly', model: 'firebug',
  site: 'n7FireflyArena', start: 'n7FireflyStart', arena: ARENA, gang: 'firefly', act: 4,
  colors: ['#f08a24', '#4a3a2a'],
  intro: 'fireflyIntro', outro: 'fireflyOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 80, kiteT: 99, swapEvery: 12 },
  phases: [{ id: 'torchlight', name: 'Torchlight' }, { id: 'refuel', name: 'Refuel' }, { id: 'burnOut', name: 'Burn Out' }],
  setup(ctx, b) {
    b.data.kit = bossKit(ctx, b);
    b.data.ring = null;
    b.data.drones = [];
    // A trail of flame behind him: one reused line (no lights).
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    b.data.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf08a24 }));
    b.data.trail.frustumCulled = false;
    b.data.trail.visible = false;
    b.deps.scene?.add(b.data.trail);
  },
  sim(b) {
    // The simulator drives: aim the car at the swoop line while he is low, away from discs otherwise.
    const s = b.data.swoop;
    if (s && s.low) return { drive: { x: b.actor.pos.x, z: b.actor.pos.z }, boost: true };
    if (s) return { drive: { x: s.to.x, z: s.to.z } };
    const d = b.data.drones.find((x) => x.alive);
    if (d) return { drive: { x: d.p.x, z: d.p.z } };
    return { drive: { x: CENTRE.x + Math.sin(b.t * 0.3) * 25, z: CENTRE.z + Math.cos(b.t * 0.3) * 25 } };
  },
  hazards: (b) => ({ swoop: b.data.swoop ? { t: Math.round(b.data.swoop.t * 100) / 100, low: !!b.data.swoop.low } : null, drones: b.data.drones.filter((d) => d.alive).map((d) => [Math.round(d.p.x), Math.round(d.p.z)]), discs: b.data.kit.netHazards(), rams: b.data.rams ?? 0 }),
  phase: {
    torchlight: phaseHooks('Ram him when he swoops low. His firebombs land where you are heading.', LINES.open),
    refuel: phaseHooks('Fuel drones are coming in: drive through them before they reach him. Ram him three times.', LINES.refuel),
    burnOut: phaseHooks('The lanes are burning in waves. Ram him three more times.', LINES.lanes),
  },
});

function phaseHooks(objective, lines) {
  return {
    enter(b) { start(b); b.deps.hud.setObjective?.(objective); b.say(b.actor.pick(lines), 3.2); },
    idle: (dt, b) => think(dt, b),
    update: (dt, b) => think(dt, b),
    exit: (b) => stop(b),
  };
}

function car() {
  const v = V();
  return v?.active && v.active === v.batmobile ? v.batmobile : null;
}

function start(b) {
  b.data.kit.clear();
  b.data.rams = 0; b.inPhase = 0;
  b.data.swoopCool = 4; b.data.bombCool = 3; b.data.droneCool = 6; b.data.laneCool = 5; b.data.footCool = 0;
  b.data.swoop = null; b.data.fuelled = false;
  b.data.orbit = b.rng.next() * Math.PI * 2;
  for (const d of b.data.drones) b.data.kit.markers.release(d.m);
  b.data.drones = [];
  // Off the combat list: nobody can punch him from the road; the idle hook runs the fight.
  const C = b.deps.combat;
  C.setEnemies(C.enemies.filter((e) => e !== b.e));
  const bm = V()?.batmobile;
  if (bm?.armor) { bm.armor.hp = bm.maxArmor ?? bm.armor.hp; }
}

function stop(b) {
  b.data.kit.clear();
  b.data.trail.visible = false;
  for (const d of b.data.drones) b.data.kit.markers.release(d.m);
  b.data.drones = [];
  b.data.swoop = null;
  b.data.ring = null;
}

function armour(b, dmg) {
  const bm = V()?.batmobile;
  if (!bm?.armor) return;
  bm.armor.hp = Math.max(0, bm.armor.hp - dmg * b.tier.damage);
  bm.armor.sinceHit = 0;
  b.deps.events.emit('armorHit');
  if (bm.armor.hp <= 0) {
    // The car limps: the phase starts over, the armour comes back. No game over.
    b.deps.events.emit('word', { text: 'KRAKOOM!', pos: bm.group.position.clone().setY(bm.group.position.y + 1.4), big: true });
    b.say(b.actor.pick(LINES.disabled), 2.4);
    b.deps.hud.card?.('BATMOBILE DISABLED', 'Alfred reroutes the backup power. Back on the drive: the round starts again.', 3500);
    stop(b); start(b);
  }
}

function think(dt, b) {
  if (b.done) return;
  const K = b.data.kit, D = b.deps;
  K.tick(dt);
  const a = b.actor;
  const bm = car();
  const driverPos = bm ? bm.group.position : b.target?.pos ?? null;
  // The armour on every player's view (it is the one car).
  const maxA = V()?.batmobile?.maxArmor ?? 100;
  for (const p of b.ctx.players()) K.fx.meter(p, bm ? 'ARMOUR' : null, (V()?.batmobile?.armor?.hp ?? maxA) / maxA, '#f08a24');
  // Circling, unless swooping.
  const s = b.data.swoop;
  if (!s) {
    b.data.orbit += dt * 0.35;
    const want = { x: CENTRE.x + Math.sin(b.data.orbit) * 28, y: HIGH + Math.sin(b.t * 1.3), z: CENTRE.z + Math.cos(b.data.orbit) * 28 };
    a.pos.x += (want.x - a.pos.x) * Math.min(1, dt * 1.2);
    a.pos.z += (want.z - a.pos.z) * Math.min(1, dt * 1.2);
    a.pos.y += (want.y - a.pos.y) * Math.min(1, dt * 1.5);
    if (driverPos) a.face(driverPos, 4, dt);
    a.ch.animator.play('Idle_Loop', { fade: 0.25 });
  } else swoopTick(dt, b, s, bm);
  // Flame trail under him.
  const arr = b.data.trail.geometry.attributes.position.array;
  arr[0] = a.pos.x; arr[1] = a.pos.y + 0.8; arr[2] = a.pos.z;
  arr[3] = a.pos.x; arr[4] = a.pos.y - 1.8; arr[5] = a.pos.z;
  b.data.trail.geometry.attributes.position.needsUpdate = true;
  b.data.trail.visible = true;
  if (!driverPos) return;
  // Swoops.
  b.data.swoopCool -= dt;
  if (!s && b.data.swoopCool <= 0) {
    const to = { x: driverPos.x, y: Y, z: driverPos.z };
    const dx = to.x - a.pos.x, dz = to.z - a.pos.z, d = Math.hypot(dx, dz) || 1;
    b.data.swoop = { t: 0, tell: 1.5 * b.tier.tell, from: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, to, dir: { x: dx / d, z: dz / d }, low: false, hit: false, fuelled: b.data.fuelled, again: b.phase === 2 && b.rng.next() < 0.5 };
    b.data.fuelled = false;
    b.data.ring = K.markers.place('gate', { x: to.x, y: Y - 1.2, z: to.z }, { color: b.data.swoop.fuelled ? 0x7fd8ff : 0xf08a24, scale: 1.4 });
    a.e.glyph = 'red';
    D.events.emit('word', { text: 'WHIIINE', pos: a.pos.clone().setY(a.pos.y + 1.5), big: false });
    b.say(b.actor.pick(LINES.swoop), 1.4);
  }
  // Firebombs where the car is heading.
  b.data.bombCool -= dt;
  if (b.data.bombCool <= 0) {
    b.data.bombCool = (b.phase === 0 ? 3.4 : 2.6) * (0.8 + b.rng.next() * 0.4);
    const v = bm?.v;
    const yaw = v?.yaw ?? 0, sp = Math.min(30, Math.abs(v?.speed ?? 0));
    const lead = 1.4;
    const p = { x: driverPos.x + Math.sin(yaw) * sp * lead, y: Y, z: driverPos.z + Math.cos(yaw) * sp * lead };
    K.disc(p, { r: 4.2, grow: 1.5, color: 0xf08a24, tag: 'bomb', onBite: (h) => { if (car() && dist2(car().group.position, p) < 4.6) armour(b, 18); else K.dose(h, 14, 'gas'); } });
    // The car itself is not a hero: bite it if it is inside when the bomb goes.
    const hz = K.hazards[K.hazards.length - 1];
    hz.onBurst = () => { const c = car(); if (c && dist2(c.group.position, p) < 4.6 && !b.heroes.some((h) => dist2(h.pos, p) < hz.r)) armour(b, 18); };
  }
  // On foot: he does not take you seriously, and sets the grass alight around you.
  if (!bm) {
    b.data.footCool -= dt;
    if (b.data.footCool <= 0) {
      b.data.footCool = 3;
      for (const h of b.heroes) K.disc({ x: h.pos.x, y: h.pos.y, z: h.pos.z }, { r: 3, grow: 1.4, tag: 'grass', onBite: (hh) => K.dose(hh, 10, 'gas') });
      b.say(b.actor.pick(LINES.foot), 1.8);
      D.hud.setObjective?.('Back in the Batmobile: you cannot reach him on foot.');
    }
  }
  // Fuel drones (phase 2+).
  if (b.phase >= 1) {
    b.data.droneCool -= dt;
    if (b.data.droneCool <= 0) {
      b.data.droneCool = 9 * b.tier.tell;
      const n = b.players > 1 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const ang = b.rng.next() * Math.PI * 2;
        const p = { x: CENTRE.x + Math.sin(ang) * 55, y: Y + 1.6, z: CENTRE.z + Math.cos(ang) * 55 };
        b.data.drones.push({ p, alive: true, m: K.markers.place('scan', p, { color: 0x7fd8ff, scale: 0.5 }) });
      }
    }
    for (const d of b.data.drones) {
      if (!d.alive) continue;
      const dx = a.pos.x - d.p.x, dz = a.pos.z - d.p.z, dd = Math.hypot(dx, dz) || 1;
      d.p.x += (dx / dd) * 6.5 * dt; d.p.z += (dz / dd) * 6.5 * dt;
      if (d.m?.mesh) d.m.mesh.position.set(d.p.x, d.p.y + 1.5, d.p.z);
      const c = car();
      if ((c && dist2(c.group.position, d.p) < 3.4) || b.heroes.some((h) => !car() || h !== b.deps.hero ? dist2(h.pos, d.p) < 2.2 && Math.abs(h.pos.y - d.p.y) < 3 : false)) {
        d.alive = false; K.markers.release(d.m);
        D.events.emit('word', { text: 'BZZT-POP', pos: { x: d.p.x, y: d.p.y + 2, z: d.p.z }, big: false });
        D.events.emit('droneDestroyed');
      } else if (dd < 3) {
        d.alive = false; K.markers.release(d.m);
        b.data.fuelled = true;
        b.data.rams = Math.max(0, b.data.rams - (b.phase === 2 ? 1 : 0));
        b.inPhase = b.data.rams / RAMS[b.phase];
        b.say(b.actor.pick(LINES.refuel), 1.8);
      }
    }
    b.data.drones = b.data.drones.filter((d) => d.alive);
  }
  // Burning lanes (phase 3): a stripe of fire across the drive, sweeping north to south.
  if (b.phase === 2) {
    b.data.laneCool -= dt;
    if (b.data.laneCool <= 0) {
      b.data.laneCool = 6 * b.tier.tell;
      const z = CENTRE.z + (b.rng.next() * 2 - 1) * 45;
      for (let x = CENTRE.x - 18; x <= CENTRE.x + 18; x += 7) K.disc({ x, y: Y, z }, { r: 3.6, grow: 1.8, color: 0xc8323c, tag: 'lane', onBite: (h) => K.dose(h, 10, 'gas') });
      const hzs = K.hazards.slice(-6);
      for (const hz of hzs) hz.onBurst = () => { const c = car(); if (c && dist2(c.group.position, hz.p) < 4) armour(b, 10); };
    }
  }
}

function swoopTick(dt, b, s, bm) {
  const a = b.actor, D = b.deps, K = b.data.kit;
  s.t += dt;
  if (s.t < s.tell) {
    // The tell: he rears back and the engines whine.
    a.pos.y += (HIGH + 3 - a.pos.y) * Math.min(1, dt * 2);
    a.face(s.to, 6, dt);
    return;
  }
  // Low and fast along his line, then up again.
  s.low = s.t < s.tell + 2.2;
  a.e.glyph = null;
  const speed = 20;
  a.pos.x += s.dir.x * speed * dt; a.pos.z += s.dir.z * speed * dt;
  const wantY = s.low ? Y + 1.6 : HIGH;
  a.pos.y += (wantY - a.pos.y) * Math.min(1, dt * (s.low ? 5 : 1.6));
  a.ch.animator.play('Jog_Fwd_Loop', { fade: 0.15 });
  if (s.low && !s.hit && bm && Math.abs(bm.v?.speed ?? 0) > 8 && dist2(bm.group.position, a.pos) < 4.6) {
    s.hit = true;
    if (s.fuelled) {
      b.say('Afterburners! Can not touch this!', 1.8);
    } else {
      b.data.rams += 1;
      b.inPhase = b.data.rams / RAMS[b.phase];
      D.events.emit('word', { text: 'KRUNCH!', pos: a.pos.clone().setY(a.pos.y + 1.4), big: true });
      D.events.emit('vehicleImpact', { speed: Math.abs(bm.v.speed) });
      D.events.emit('bossHit', { id: 'firefly', hits: b.data.rams });
      b.say(b.actor.pick(LINES.rammed), 2);
      a.ch.animator.play('Hit_Knockback', { once: true, fade: 0.05 });
      if (b.data.rams >= RAMS[b.phase]) { endSwoop(b, s); b.next(); return; }
    }
  }
  if (s.t > s.tell + 3.6) {
    if (!s.hit) b.say(b.actor.pick(LINES.miss), 1.6);
    endSwoop(b, s);
    if (s.again && !s.second) { b.data.swoopCool = 0.6; b.data.secondNext = true; }
  }
  void K;
}

function endSwoop(b, s) {
  b.data.kit.markers.release(b.data.ring); b.data.ring = null;
  b.data.swoop = null;
  b.actor.e.glyph = null;
  b.data.swoopCool = b.data.secondNext ? 0.6 : (b.phase === 0 ? 5 : 4.2) * b.tier.tell + b.rng.next();
  b.data.secondNext = false;
  void s;
}
