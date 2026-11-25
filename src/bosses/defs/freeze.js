// The cold-suit scientist on the roof of the Yards' cold-storage plant (Night Five): an ENDURANCE
// and ENVIRONMENT boss (research doc 6.2). His suit shrugs off every strike; the roof is the weapon.
//   Steam valves at the roof's edges each feed a vent in the middle. Turn a valve (stand on it)
//   while he walks over its vent and the steam cracks his suit's seals: a short window, five
//   strikes. He follows whoever he is after, so one hero lures and the other turns the valve.
//   His freeze beam is telegraphed (red); the refrigeration units block it (a real ray against the
//   roof's collision), so cover matters. A cold meter fills from the beam, his frost rings and, in
//   the last phase, the roof itself; two heat vents at the corners thaw it. Cold full = real damage.
//   1 'Cold Open'     the beam and a squad of his crew; one window
//   2 'Frost Rings'   rings of frost land where you stand (move!); two windows
//   3 'Absolute Zero' the whole roof freezes (heat vents or bust); in co-op the steam only builds
//                     when two different valves are turned within three seconds; two windows
// Difficulty: tells, window length and the cold rates (src/bosses/rules.js BOSS_TIERS).
import * as THREE from 'three';
import { makeVillainBoss } from './brawler.js';
import { createMarkers } from '../../story/markers.js';
import { createStoryUi } from '../../story/ui.js';
import { createViewFx } from '../../story/viewFx.js';
import { toonMaterial, addHullOutline } from '../../render/toon.js';
import { withPlayer } from '../../core/events.js';

const Y = 20;
// The plant roof: x -358..-322, z 104..140 at y 20.
const ROOF = { x: -340, y: Y, z: 122, r: 16.5 };
const UNITS = [[-348, 117], [-332, 117], [-348, 129], [-332, 129]];
const VENTS = [
  { vent: { x: -340, y: Y, z: 111 }, valve: { x: -340, y: Y, z: 105.5 } },
  { vent: { x: -340, y: Y, z: 135 }, valve: { x: -340, y: Y, z: 139 } },
  { vent: { x: -352, y: Y, z: 123 }, valve: { x: -356.5, y: Y, z: 123 } },
  { vent: { x: -328, y: Y, z: 123 }, valve: { x: -323.5, y: Y, z: 123 } },
];
const HEAT = [{ x: -355, y: Y, z: 107 }, { x: -325, y: Y, z: 137 }];
// [balance] One more window per phase: the average scripted player beat him in 31 s (target 3-6 min).
const WINDOWS = [3, 3, 3]; // phase 3 at 4 windows: five deaths to the frozen roof in one run

const LINES = {
  guard: ['My suit is rated to two hundred below. Your knuckles are not.', 'You are wasting heat, Batman.', 'Strike me again. I could use the exercise.'],
  open: ['Cold. Calculated. Correct. Now hold still.', 'This plant kept the city fed for eighty years. Tonight it keeps me company.', 'Do you know what absolute zero feels like? You will.'],
  vented: ['My seals! You do not know what you have done!', 'Pressure loss... no... NO!', 'The steam. Clever. Briefly.'],
  rings: ['Mind the floor.', 'Stand still and become a statue. It is restful.', 'Every step you take, I take the warmth out of.'],
  zero: ['Enough. The whole roof, then.', 'Absolute zero. Let us see how long you last.'],
  stun: ['Your little toys are colder than you think.', 'A bat-shaped boomerang. How festive.'],
  frozen: ['Cold enough for you?', 'There. Now you understand me a little.'],
};

export const freezeDef = makeVillainBoss({
  id: 'freeze', name: 'MR. FREEZE', villain: 'mrFreeze', model: 'coldScientist',
  site: 'freezeArena', start: 'freezeStart', arena: ROOF, gang: 'freeze', act: 3,
  colors: ['#7fd8ff', '#2a4a6a'],
  intro: 'freezeIntro', outro: 'freezeOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 13, kiteT: 4, swapEvery: 9 },
  phases: [{ id: 'coldOpen', name: 'Cold Open' }, { id: 'frostRings', name: 'Frost Rings' }, { id: 'absoluteZero', name: 'Absolute Zero' }],
  // [story2] The night simulator's player: thaw when cold, turn a valve when he is over its vent,
  // otherwise stand beyond the vent nearest him so he walks onto it; strike while he is open.
  sim(b) {
    const me = b.heroes[0];
    if (!me || !b.data.valves) return null;
    const d = (a, c) => Math.hypot(a.x - c.x, a.z - c.z);
    if ((b.data.cold.get(me) ?? 0) > 65) { const h = HEAT.reduce((a, c) => (d(c, me.pos) < d(a, me.pos) ? c : a)); return { goTo: h, stop: 1 }; }
    if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.8, action: 'punch' };
    for (let i = 0; i < VENTS.length; i++) if (d(b.actor.pos, VENTS[i].vent) < 4 && b.data.valves[i].cool <= 0) return { goTo: VENTS[i].valve, stop: 0.6 };
    const v = VENTS.reduce((a, c) => (d(c.vent, b.actor.pos) < d(a.vent, b.actor.pos) ? c : a)).vent;
    const dx = v.x - b.actor.pos.x, dz = v.z - b.actor.pos.z, l = Math.hypot(dx, dz) || 1;
    return { goTo: { x: v.x + (dx / l) * 3, z: v.z + (dz / l) * 3 }, stop: 0.8 };
  },
  hazards: (b) => ({ valves: (b.data.valves ?? []).map((v) => Math.round(Math.max(0, v.burst) * 10) / 10), rings: (b.data.rings ?? []).map((r) => [Math.round(r.p.x), Math.round(r.p.z), Math.round(r.t * 10) / 10]) }),
  setup(ctx, b) {
    const D = b.deps;
    b.data.cold = new Map();
    b.data.ui = createStoryUi(() => document.querySelector('.hud'));
    // [story2] The cold meter and its frost veil per view (split screen: each player sees their own).
    b.data.fx = createViewFx({ hud: D.hud, players: () => ctx.players() });
    b.data.markers = createMarkers(D.scene);
    b.data.valves = VENTS.map(() => ({ cool: 0, burst: 0, armed: -99 }));
    b.data.rings = [];
    // The refrigeration units (cover from the beam), built once with collision.
    const mat = toonMaterial({ color: 0x8a9aa8 });
    const fanMat = toonMaterial({ color: 0x3a4a5a });
    b.data.units = UNITS.map(([x, z]) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.6), mat);
      box.position.set(x, Y + 1.2, z);
      addHullOutline(box, 0.02);
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.12, 12), fanMat);
      fan.position.set(x, Y + 2.46, z);
      g.add(box, fan);
      g.visible = false;
      D.scene.add(g);
      D.collision?.addBox?.(x - 1.3, Y, z - 1.3, x + 1.3, Y + 2.4, z + 1.3, 'freezeUnit');
      return g;
    });
    // The beam: one reused line.
    const beamGeo = new THREE.BufferGeometry();
    beamGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    b.data.beam = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: 0xbfefff, linewidth: 3 }));
    b.data.beam.visible = false;
    b.data.beam.frustumCulled = false;
    D.scene.add(b.data.beam);
    b.data.beamT = 0;
    b.data.dose = (h, amount, kind = 'buzzer') => {
      if (!h || h.dead || h.invulnerable > 0) return;
      const dmg = Math.round(amount * b.tier.damage);
      h.health = Math.max(0, h.health - dmg);
      D.events.emit('heroHurt', withPlayer({ kind, damage: dmg }, h.player ?? null));
      if (h.health <= 0) { if (h === D.hero || !D.combat.fighterFor) D.combat.killHero?.(); else D.combat.fighterFor(h)?.killHero?.(); }
    };
    b.data.chill = (h, v) => {
      const c = Math.min(100, (b.data.cold.get(h) ?? 0) + v * b.tier.damage);
      b.data.cold.set(h, c);
      if (c >= 100) {
        b.data.cold.set(h, 45);
        b.data.dose(h, 18);
        b.say(b.actor.pick(LINES.frozen), 2);
      }
    };
    b.e.onStun = () => b.say(b.actor.pick(LINES.stun), 2);
    const orig = b.e.update;
    b.e.update = (dt, ectx) => { env(dt, b); orig(dt, ectx); };
  },
  phase: {
    coldOpen: {
      enter(b) { start(b); b.deps.hud.setObjective?.('Lure him over a vent, then turn its valve on the roof edge. Stay behind the units when he aims.'); b.say(b.actor.pick(LINES.open), 3.2); b.ctx.adds(5, { at: 'freezeArena', ring: 9, gang: 'freeze', act: 3, id: 'freezeCrew' }); },
      update: (dt, b) => think(dt, b),
      idle: (dt, b) => { env(dt, b); keepListed(b); },
      windowClosed: (b) => closed(b),
      exit: (b) => stop(b),
    },
    frostRings: {
      enter(b) { start(b); b.deps.hud.setObjective?.('Frost rings land where you stand: keep moving. Vent his suit twice.'); b.say(b.actor.pick(LINES.rings), 3); b.ctx.adds(4, { at: 'freezeArena', ring: 9, gang: 'freeze', act: 3, id: 'freezeCrew2' }); },
      update: (dt, b) => think(dt, b),
      idle: (dt, b) => { env(dt, b); keepListed(b); },
      windowClosed: (b) => closed(b),
      exit: (b) => stop(b),
    },
    absoluteZero: {
      enter(b) { start(b); b.deps.hud.setObjective?.(b.players > 1 ? 'The roof is freezing: thaw on the orange heat vents. Turn two valves together to build the steam.' : 'The roof is freezing: thaw on the orange heat vents. Vent his suit twice more.'); b.say(b.actor.pick(LINES.zero), 3); },
      update: (dt, b) => think(dt, b),
      idle: (dt, b) => { env(dt, b); keepListed(b); },
      windowClosed: (b) => closed(b),
      exit: (b) => stop(b),
    },
  },
});

function keepListed(b) {
  const C = b.deps.combat;
  if (!b.done && !C.enemies.includes(b.e)) C.setEnemies([...C.enemies, b.e]);
}

function start(b) {
  const M = b.data.markers;
  b.data.windows = 0;
  b.data.beamCool = 2.5;
  b.data.meleeCool = 1;
  b.data.ringCool = 4;
  for (const u of b.data.units) u.visible = true;
  M.releaseAll();
  b.data.marks = VENTS.map((v) => ({ valve: M.place('plate', v.valve, { color: 0x7fd8ff, scale: 0.7 }), vent: M.place('plate', v.vent, { color: 0x9aa8b4, scale: 0.8 }), steam: null }));
  b.data.heat = HEAT.map((p) => M.place('plate', p, { color: 0xf08a24, scale: 1.3 }));
  b.data.rings = [];
  for (const v of b.data.valves) { v.cool = 0; v.burst = 0; v.armed = -99; }
}

function stop(b) {
  b.data.markers.releaseAll();
  b.data.rings = [];
  b.data.beam.visible = false;
  b.data.fx.clear();
  b.data.ui.timer(null);
}

function closed(b) {
  b.data.windows += 1;
  if (b.data.windows >= WINDOWS[b.phase]) { b.next(); return; }
  b.say('A crack in the seals. It will not happen twice.', 2.4);
}

// His own choices while free: follow, slam the close one (red: dodge), beam the far one.
function think(dt, b) {
  const { actor } = b;
  const tgt = b.target;
  if (!tgt) return;
  b.data.meleeCool -= dt;
  b.data.beamCool -= dt;
  const d = actor.moveTo(tgt.pos, dt, { speed: 1.7, stop: 3.5 });
  actor.face(tgt.pos, 5, dt);
  if (d < 2.8 && b.data.meleeCool <= 0) {
    b.data.meleeCool = 3;
    actor.melee({ kind: 'heavy', windup: 0.8 * b.tier.tell, counter: false, clip: 'Melee_Hook' });
    return;
  }
  if (b.data.beamCool <= 0) {
    b.data.beamCool = (b.phase === 0 ? 3.6 : 3) + b.rng.next() * 1.2;
    const at = b.punish ?? tgt;
    actor.aim(at, { windup: 1.1 * b.tier.tell, clip: 'OverhandThrow', fire: (h) => fireBeam(b, h) });
  }
}

function fireBeam(b, h) {
  if (!h) return;
  const D = b.deps, p = b.actor.pos;
  const o = { x: p.x, y: p.y + 1.5, z: p.z };
  const dx = h.pos.x - o.x, dy = h.pos.y + 1.1 - o.y, dz = h.pos.z - o.z, d = Math.hypot(dx, dy, dz) || 1;
  const hit = D.collision?.raycast?.(o, { x: dx / d, y: dy / d, z: dz / d }, d - 0.5) ?? null;
  const t = hit ? hit.t : d;
  const arr = b.data.beam.geometry.attributes.position.array;
  arr[0] = o.x; arr[1] = o.y; arr[2] = o.z;
  arr[3] = o.x + (dx / d) * t; arr[4] = o.y + (dy / d) * t; arr[5] = o.z + (dz / d) * t;
  b.data.beam.geometry.attributes.position.needsUpdate = true;
  b.data.beam.visible = true;
  b.data.beamT = 0.35;
  D.events.emit('throw');
  // Behind a unit (or rolling clear) the beam frosts the cover instead.
  if (!hit && !h.dead && !(h.invulnerable > 0) && d < 40) { b.data.dose(h, 12); b.data.chill(h, 35); }
}

// Every frame, whatever state he is in: valves and steam, rings, the cold, the beam's fade.
function env(dt, b) {
  if (b.done || !b.data.marks) return;
  const M = b.data.markers;
  M.update(dt);
  if (b.data.beamT > 0) { b.data.beamT -= dt; if (b.data.beamT <= 0) b.data.beam.visible = false; }
  const heroes = b.heroes;
  const dual = b.phase === 2 && b.players > 1;
  // Valves: stand on one to turn it.
  VENTS.forEach((v, i) => {
    const st = b.data.valves[i];
    st.cool -= dt;
    if (st.burst > 0) {
      st.burst -= dt;
      if (st.burst <= 0 && b.data.marks[i].steam) { M.release(b.data.marks[i].steam); b.data.marks[i].steam = null; }
      // Steam cracks his seals when he stands in it.
      if (b.e.vulnerable <= 0 && b.e.state !== 'open' && Math.hypot(b.actor.pos.x - v.vent.x, b.actor.pos.z - v.vent.z) < 4.5) {
        b.say(b.actor.pick(b.data.saidVent ? LINES.vented : LINES.vented), 2.4);
        b.actor.open(5 * b.tier.window);
        b.deps.events.emit('bossStaggered', { id: 'freeze' });
      }
    }
    if (st.cool > 0) return;
    if (!heroes.some((h) => Math.hypot(h.pos.x - v.valve.x, h.pos.z - v.valve.z) < 1.6 && Math.abs(h.pos.y - Y) < 1.8)) return;
    st.cool = 6;
    M.flash(b.data.marks[i].valve);
    if (dual) {
      // Co-op, last phase: a second valve within 3 s, or the pressure bleeds away.
      st.armed = b.t;
      const other = b.data.valves.findIndex((o, k) => k !== i && b.t - o.armed < 3);
      if (other < 0) { b.say('One valve? The pressure needs two of you.', 2); return; }
      burst(b, i); burst(b, other);
      b.data.valves[other].armed = -99; st.armed = -99;
      return;
    }
    burst(b, i);
  });
  // Frost rings (phases 2 and 3): a disc grows under the target, then bites.
  if (b.phase >= 1) {
    b.data.ringCool -= dt;
    if (b.data.ringCool <= 0 && b.target) {
      b.data.ringCool = (b.phase === 1 ? 6 : 5) * b.tier.tell + 1;
      const p = { x: b.target.pos.x, y: Y, z: b.target.pos.z };
      b.data.rings.push({ p, t: 0, m: M.place('plate', p, { color: 0xbfefff, scale: 0.4 }) });
    }
    for (let k = b.data.rings.length - 1; k >= 0; k--) {
      const r = b.data.rings[k];
      r.t += dt;
      const grow = 1.6 * b.tier.tell;
      if (r.m) r.m.mesh.scale.setScalar(0.4 + 2.1 * Math.min(1, r.t / grow));
      if (r.t >= grow && !r.hit) {
        r.hit = true;
        if (r.m) M.color(r.m, 0xffffff);
        for (const h of heroes) if (Math.hypot(h.pos.x - r.p.x, h.pos.z - r.p.z) < 3.4 && Math.abs(h.pos.y - Y) < 2) { b.data.chill(h, 45); b.data.dose(h, 6); }
      }
      if (r.t > grow + 0.6) { M.release(r.m); b.data.rings.splice(k, 1); }
    }
  }
  // The cold: drains away from danger, fast on a heat vent; the whole roof bites in phase 3.
  for (const h of heroes) {
    const onHeat = HEAT.some((p) => Math.hypot(h.pos.x - p.x, h.pos.z - p.z) < 3.2);
    const onRoof = Math.abs(h.pos.y - Y) < 3 && Math.hypot(h.pos.x - ROOF.x, h.pos.z - ROOF.z) < 26;
    const c = b.data.cold.get(h) ?? 0;
    if (onHeat) b.data.cold.set(h, Math.max(0, c - 35 * dt));
    else if (b.phase === 2 && onRoof) b.data.chill(h, 5 * dt);
    else b.data.cold.set(h, Math.max(0, c - 8 * dt));
  }
  for (const p of b.ctx.players()) {
    const c = b.data.cold.get(p.hero) ?? 0;
    b.data.fx.meter(p, 'COLD', c / 100, c > 70 ? '#ffffff' : '#7fd8ff');
    b.data.fx.distort(p, Math.max(0, (c - 30) / 70), 'cold');
  }
}

function burst(b, i) {
  const st = b.data.valves[i];
  st.burst = 2.6;
  const M = b.data.markers;
  if (b.data.marks[i].steam) M.release(b.data.marks[i].steam);
  b.data.marks[i].steam = M.place('pillar', VENTS[i].vent, { color: 0xffffff, scale: 1.1 });
  b.deps.events.emit('steam', { pos: VENTS[i].vent });
}
