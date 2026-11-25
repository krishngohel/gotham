// Predator stealth at run time. Inside a predator room it drives the room's goons on top of the
// normal enemy AI: their patrols, what each one sees (vision.js) and how it reacts (brain.js),
// noises, the alarm and its fall-back, fear, and the lines they call out. Anywhere in the city it
// hands combat the silent takedown and the perch drop (combatSystem's stealthStart hook) and keeps
// hero.perched up to date. Allocation-free per frame: every goon record, sense and goal is built
// in begin(), and line-of-sight rays run at 10 Hz per goon.
import { STEALTH, spotCheck, sightRange, inShadow, inRect, canLook, hears, perchedOn, pickSilentTarget, pickPerchDrop, smokeBlocks } from './vision.js';
import { HOSTILE, createSquad, createMind, thinkGoon, thinkSquad, alarmAll, goHostile, smokeReset, struck, noteTakedown, fearSpeed, huddles, pickLine } from './brain.js';
import { createPatrol, stepPatrol, huddleSpot, pickSpot } from './patrol.js';
import { ROOMS, roomSquad, roomSpots } from './stealthRooms.js';
import { createSilentTakedown, createPerchDrop } from './takedowns.js';
import { registerMoves } from '../game/progressTracker.js';
import { withPlayer } from '../core/events.js';

// Plan 3C's progress tracker: the two stealth moves count toward "Moves learned", but only for a
// save that can still reach a predator room (up to the catwalks, the last one in the story) or has
// already learned them, so a finished save from before Part D keeps its 100%.
registerMoves(['silentTakedown', 'perchDrop'], { until: 'aceCatwalks' });

const WALK = 1.6, SEARCH = 2.2, HUNT = 3.6;   // m/s before fear
const LOOK_SEARCH = 2.5, LOOK_HUNT = 1.5;     // seconds spent looking round at each spot
const LINE_GAP = 2.2;                         // seconds between two lines called out
const HELD_BY_CHAIN = new Set(['chained', 'tied']);

// Co-op (workstream D1): every hero in the world is watched. Each has its own "watcher": what the
// goons see of it (crouched, perched, in a vent), its takedown prompt and its perch state, and the
// combat it takes goons down through. A goon looks at every hero and reacts to the one it sees
// best; either hero can choke or perch-drop. With one hero it is exactly the old system.
export function createStealth({ hero, combat, events, collision, perches = [], rng, rules = STEALTH }) {
  let room = null, spots = [];
  let squad = createSquad();
  const goons = [], minds = [];
  const eye = { x: 0, y: 0, z: 0 }, ray = { x: 0, y: 0, z: 0 };
  // The last smoke pellet's cloud: nobody sees through it while t > 0.
  const cloud = { x: 0, y: 0, z: 0, r: 0, t: 0 };
  const sense = { seesAt: -1, range: rules.range, hero: hero.pos, noise: null };
  let perchT = 0, lineT = 0, lineN = 0, alive = 0, lastAlive = -1;
  const graceRules = { ...rules, silentReach: rules.silentReach * (rules.silentGraceReach ?? 1) };
  // One watcher per hero. Events a hero's takedowns emit carry its player.
  function makeWatcher(h, takedownVia) {
    const w = {
      hero: h,
      view: { pos: h.pos, crouched: false, perched: false, hidden: false, flying: false },
      prompt: null, wasPerched: false, wasHidden: false,
      // Seconds since the silent takedown prompt was last on screen. The prompt is 10 Hz stale and
      // a goon walks off at 1.6 m/s, so a press just after it goes still counts with more reach.
      silentAgo: Infinity,
    };
    const evs = { on: events.on, emit: (n, d) => events.emit(n, withPlayer(d ?? {}, h.player)) };
    w.api = { events: h === hero ? events : evs, noise, takedown: (e, kind, opts) => takedownVia().takedown(e, kind, opts), quiet: () => !!room };
    return w;
  }
  const primary = makeWatcher(hero, () => combat);
  const watchers = [primary];
  const watcherOf = (h) => watchers.find((w) => w.hero === h) ?? null;
  const api = primary.api;
  // The view of the hero each goon is judging this frame (look() sets it).
  let view = primary.view;
  const heroAt = (d) => (d?.player?.hero && watcherOf(d.player.hero) ? d.player.hero : hero);
  // The hero nearest a point (a goon waking to "go and look" goes to the nearest one).
  function nearestHero(pos) {
    let best = hero, bd = Infinity;
    for (const w of watchers) { if (w.hero.dead) continue; const d = Math.hypot(w.hero.pos.x - pos.x, w.hero.pos.z - pos.z); if (d < bd) { bd = d; best = w.hero; } }
    return best;
  }

  function hearAt(g, at) {
    g.noiseAt.x = at.x; g.noiseAt.y = at.y; g.noiseAt.z = at.z;
    g.noise = g.noiseAt;
  }

  function begin(fight, made, def = ROOMS[fight.stealth]) {
    end();
    room = def;
    spots = roomSpots(def);
    squad = createSquad();
    cloud.t = 0; // a pellet's cloud from a room before (or a restart) blocks nothing here
    const list = roomSquad(def, fight.squad);
    made.forEach((e, i) => {
      const spec = list[i] ?? list[list.length - 1];
      const g = {
        e, spec, route: spec.route, mind: createMind(), patrol: createPatrol(0),
        goal: { x: e.pos.x, y: e.pos.y, z: e.pos.z, face: null }, look: { x: 0, z: 0 },
        view: { pos: e.pos, yaw: 0, hostile: false },
        seesAt: -1, range: rules.range, losT: (i * 0.1) / Math.max(1, made.length), lookT: 0, rev: -1, slot: i, k: i,
        noise: null, noiseAt: { x: 0, y: 0, z: 0 }, out: false, color: -1, baseWake: e.wake,
      };
      e.room = def.id;
      e.aware = false;
      e.seesHero = false;
      // 4E's chain hearers and a goon getting up call wake(): here that means "go and look".
      e.wake = () => hearAt(g, nearestHero(e.pos).pos);
      // 5FG's smoke calls e.lose(), which calls e.search(from).
      e.search = (from) => hearAt(g, from);
      goons.push(g);
      minds.push(g.mind);
    });
    lastAlive = -1;
    events.emit('stealthStart', { room: def.id });
  }

  function end() {
    if (!room) return;
    // Ended mid-choke or mid-drop (a restart, a story jump): the goon is about to be despawned, so
    // let go of it and drop the control. One that already landed plays out its short tail.
    for (const w of watchers) {
      const c = w.hero.control;
      if (c && (c.name === 'silent' || c.name === 'perchDrop') && c.target?.alive && goons.some((g) => g.e === c.target)) {
        c.target.chainRelease?.();
        w.hero.control = null;
      }
    }
    for (const g of goons) { g.e.room = null; g.e.wake = g.baseWake; g.e.search = undefined; g.e.seesHero = undefined; }
    goons.length = 0;
    minds.length = 0;
    room = null;
    spots = [];
    events.emit('stealthEnd');
  }

  function noise(pos, radius, kind = 'noise') {
    if (!room || !radius) return 0;
    let n = 0;
    for (const g of goons) {
      if (!canLook(g.e) || HOSTILE.has(g.mind.alert) || !hears(g.e.pos, pos, radius, rules)) continue;
      hearAt(g, pos);
      n += 1;
    }
    if (n) events.emit('stealthNoise', { pos, radius, kind, count: n });
    return n;
  }

  // A perch drop is judged once, where it lands. A goon that isn't hostile and has the landing in
  // its cone, in range and in sight (Batman crouched, as he lands) saw it happen: it shouts. The
  // others only heard it (the drop's noise sends them to look). Until Batman can move again, no
  // goon that isn't hostile builds its meter from seeing him: the landing was the moment to spot.
  function witness(target, dropper = hero) {
    if (!room) return;
    const w = watcherOf(dropper) ?? primary;
    const v = w.view;
    v.crouched = !!dropper.crouched;
    v.perched = false;
    v.flying = false;
    v.hidden = !!room.vent && v.crouched && inRect(dropper.pos, room.vent);
    for (const g of goons) {
      if (g.e === target || !g.e.alive || !canLook(g.e) || HOSTILE.has(g.mind.alert)) continue;
      if (lookAt(g, w) < 0) continue;
      goHostile(g.mind, squad, dropper.pos);
      shout(g);
      return;
    }
  }
  const dropJudged = () => watchers.some((w) => w.hero.control?.name === 'perchDrop');

  // How far away this goon sees a hero right now, or -1, over every hero: the one it sees best
  // (nearest) is the one it reacts to (g.seen).
  function look(g) {
    let best = -1;
    g.seen = null;
    for (let i = 0; i < watchers.length; i++) {
      const w = watchers[i];
      if (w.hero.dead && watchers.length > 1) continue;
      const d = lookAt(g, w);
      if (d >= 0 && (best < 0 || d < best)) { best = d; g.seen = w; }
    }
    if (g.seen) g.range = sightRange({ crouched: g.seen.view.crouched, shadow: inShadow(g.seen.hero.pos, room.lights) }, rules);
    return best;
  }
  // One hero: the pure checks, then one ray.
  function lookAt(g, w) {
    const e = g.e, h = w.hero;
    view = w.view;
    g.view.yaw = e.yaw;
    g.view.hostile = HOSTILE.has(g.mind.alert);
    g.range = sightRange({ crouched: view.crouched, shadow: inShadow(h.pos, room.lights) }, rules);
    const d = spotCheck(g.view, view, room.lights, rules);
    if (d < 0) return -1;
    eye.x = e.pos.x; eye.y = e.pos.y + rules.eye; eye.z = e.pos.z;
    ray.x = h.pos.x - eye.x;
    ray.y = h.pos.y + (view.crouched ? rules.crouchChest : rules.chest) - eye.y;
    ray.z = h.pos.z - eye.z;
    const len = Math.hypot(ray.x, ray.y, ray.z);
    if (len < 0.5) return d;
    ray.x /= len; ray.y /= len; ray.z /= len;
    if (cloud.t > 0 && smokeBlocks(eye, ray, len, cloud)) return -1;
    const hit = collision.raycast(eye, ray, len);
    return hit && hit.t < len - 0.3 ? -1 : d;
  }

  function say(g, kind, force = false) {
    if (!kind || (!force && lineT > 0)) return;
    lineT = LINE_GAP;
    events.emit('stealthLine', { target: g.e, text: pickLine(kind, lineN++) });
  }

  function shout(g) {
    const n = alarmAll(minds, squad);
    // Every rifle's first shot after an alarm is a warning (enemy.js warnShot): it misses on purpose.
    for (const o of goons) if (o.e.alive && HOSTILE.has(o.mind.alert)) { o.e.aware = true; if (o.e.def?.ranged) o.e.warnShot = true; }
    say(g, 'spot', true);
    events.emit('stealthAlarm', { target: g.e, count: n + 1 });
  }

  function lost() {
    let first = null;
    for (const g of goons) {
      if (!g.e.alive || g.mind.alert !== 'search') continue;
      g.e.calm();
      if (!first) first = g;
    }
    if (first) say(first, 'lost', true);
    events.emit('stealthLost');
  }

  function knockedOut(g) {
    g.out = true;
    const fear = noteTakedown(squad);
    let left = 0, speaker = null;
    for (const o of goons) {
      if (!o.e.alive) continue;
      left += 1;
      if (!speaker && canLook(o.e)) speaker = o;
    }
    if (speaker) say(speaker, `fear${fear}`, true);
    events.emit('stealthFear', { fear, left });
  }

  // Steer one goon from its mind: fight, stare, patrol (or huddle), or search and hunt.
  function drive(g, dt) {
    const e = g.e, m = g.mind;
    if (m.alert === 'engage') { e.engageNow(); return; }
    if (!e.canNav()) return;
    const k = fearSpeed(squad.fear);
    if (m.alert === 'suspicious') {
      if (e.aware) e.calm();
      e.lookAt(m.target.x, m.target.z, 'suspicious');
      return;
    }
    if (m.alert === 'patrol') {
      if (e.aware) e.calm();
      // Only goons on the huddle's own floor can reach it: a catwalk goon would walk to the rail
      // nearest it and freeze there, so it keeps to its route instead (just faster).
      if (room.huddle && huddles(squad.fear, alive) && Math.abs(e.pos.y - room.huddle.y) < 1) huddleSpot(room.huddle, g.slot, alive, g.goal);
      else stepPatrol(g.patrol, g.route, e.pos, dt, g.goal);
      e.goTo(g.goal.x, g.goal.y, g.goal.z, WALK * k, 'patrol', g.goal.face);
      return;
    }
    const hunt = m.alert === 'hunt';
    if (hunt) e.aware = true;
    else if (e.aware) e.calm();
    if (g.rev !== m.rev) {
      g.rev = m.rev;
      g.goal.x = m.target.x; g.goal.y = m.target.y; g.goal.z = m.target.z;
      g.lookT = 0;
    }
    if (g.lookT > 0) {
      g.lookT -= dt;
      e.lookAt(g.look.x, g.look.z, 'look');
      if (g.lookT <= 0) { g.k += 1; pickSpot(spots, hunt ? squad.lastKnown : m.target, e.pos.y, g.k, g.goal); }
      return;
    }
    const state = hunt ? 'hunt' : 'search';
    if (e.state === state && e.nav.arrived) {
      g.lookT = hunt ? LOOK_HUNT : LOOK_SEARCH;
      const a = rng.next() * Math.PI * 2;
      g.look.x = e.pos.x + Math.sin(a) * 5;
      g.look.z = e.pos.z + Math.cos(a) * 5;
      e.lookAt(g.look.x, g.look.z, 'look');
      return;
    }
    e.goTo(g.goal.x, g.goal.y, g.goal.z, (hunt ? HUNT : SEARCH) * k, state);
  }

  function promptFor(h = hero) {
    if (h.dead || h.control || h.state !== 'ground' || !h.grounded) return null;
    if (h.perched) return pickPerchDrop(h.pos, combat.enemies, rules) ? 'perch' : null;
    return pickSilentTarget(h.pos, combat.enemies, rules) ? 'silent' : null;
  }

  function update(dt) {
    if (!dt) return;
    perchT -= dt;
    const tick = perchT <= 0;
    if (tick) perchT = 0.1;
    for (const w of watchers) {
      const h = w.hero;
      if (tick) {
        const on = !h.dead && h.grounded && h.state === 'ground' && !h.control ? perchedOn(h.pos, perches, rules) : null;
        h.perched = !!on;
        if (h.perched && !w.wasPerched) w.api.events.emit('perched');
        w.wasPerched = h.perched;
        w.prompt = promptFor(h);
      }
      w.silentAgo = w.prompt === 'silent' ? 0 : w.silentAgo + dt;
    }
    if (!room) return;
    cloud.t -= dt;
    for (const w of watchers) {
      const h = w.hero, v = w.view;
      v.crouched = !!h.crouched;
      v.perched = h.perched;
      v.hidden = !!room.vent && !!h.crouched && inRect(h.pos, room.vent);
      // In the air on a line, or flying (a co-op kit), the hero is hard to pin down; down, out of it.
      v.flying = h.dead || h.control?.name === 'grapple' || h.state === 'fly';
      if (v.hidden && !w.wasHidden) w.api.events.emit('ventHide');
      w.wasHidden = v.hidden;
    }

    let anySees = false;
    alive = 0;
    for (const g of goons) {
      const e = g.e;
      if (!e.alive) { if (!g.out) knockedOut(g); continue; }
      alive += 1;
      if (!canLook(e)) { g.seesAt = -1; e.seesHero = false; continue; }
      g.losT -= dt;
      if (g.losT <= 0) { g.losT = 0.1; g.seesAt = look(g); e.seesHero = g.seesAt >= 0; }
      if (g.seesAt >= 0) anySees = true;
    }
    if (alive !== lastAlive) {
      let k = 0;
      for (const g of goons) if (g.e.alive) g.slot = k++;
      lastAlive = alive;
    }
    const judging = dropJudged();
    for (const g of goons) {
      const e = g.e;
      if (!e.alive || !canLook(e)) continue;
      sense.seesAt = judging && !HOSTILE.has(g.mind.alert) ? -1 : g.seesAt;
      sense.hero = (g.seen ?? primary).hero.pos;
      sense.range = g.range;
      sense.noise = g.noise;
      g.noise = null;
      const ev = thinkGoon(g.mind, squad, sense, dt, rules);
      if (ev === 'shout') shout(g);
      else if (ev) say(g, ev === 'giveUp' ? 'calm' : ev === 'search' ? 'suspect' : ev);
      drive(g, dt);
    }
    if (thinkSquad(squad, minds, anySees, dt, rules) === 'lost') lost();
    lineT = Math.max(0, lineT - dt);
  }

  // combatSystem's stealthStart hook: true when the press was used. startFor(hero, action) is the
  // same for any watched hero (a co-op partner's own hook).
  function startFor(h, action) {
    const w = watcherOf(h);
    if (!w) return false;
    if (h.dead || h.state !== 'ground' || !h.grounded) return false;
    if (action !== 'punch' && action !== 'kick') return false;
    if (h.perched) {
      const t = pickPerchDrop(h.pos, combat.enemies, rules);
      if (t) { h.control = createPerchDrop(h, w.api, { target: t, rules }); return true; }
      // Outside a room a gargoyle or a container top is just somewhere to stand: a normal attack.
      if (!room) return false;
      w.api.events.emit('hint', { id: 'perch-none' });
      return true;
    }
    if (action !== 'punch') return false;
    let t = pickSilentTarget(h.pos, combat.enemies, rules);
    if (!t && w.silentAgo <= (rules.silentGrace ?? 0)) t = pickSilentTarget(h.pos, combat.enemies, graceRules);
    if (!t) return false;
    // Null when no side of the goon is safe to snap to (a wall, or an edge): combat decides then.
    const choke = createSilentTakedown(h, w.api, { target: t, rules });
    if (!choke) return false;
    h.control = choke;
    return true;
  }
  const start = (action) => startFor(hero, action);

  // combatSystem's stealthHold hook, asked once a punch has picked its target: true swallows the
  // press. In a quiet room a punch that would land on a goon who hasn't noticed Batman is a missed
  // takedown, not a plan: the rifle would parry it and raise the alarm. Kicks still go loud, and
  // punches are normal outside rooms, after an alarm, or on a goon who is down, stunned or frozen.
  function hold(action, target) {
    if (action !== 'punch' || !room || squad.alarm || !target || target.room !== room.id) return false;
    if (target.aware || !canLook(target)) return false;
    events.emit('hint', { id: 'silent-miss' });
    return true;
  }

  events.on('footstep', (d) => { if (room) noise(heroAt(d).pos, d?.sprint ? rules.noise.sprint : rules.noise.step, 'step'); });
  events.on('land', (d) => { if (room && d?.hard && d.who === 'hero') noise(heroAt(d).pos, rules.noise.land, 'land'); });
  events.on('batarangWall', (d) => { if (room) noise(d.pos, rules.noise.batarang, 'batarang'); });
  events.on('perchDrop', (d) => witness(d?.target, heroAt(d)));
  events.on('smoke', (d) => {
    if (!room) return;
    cloud.x = d.pos.x; cloud.y = d.pos.y; cloud.z = d.pos.z;
    cloud.r = d.radius ?? 2.5;
    cloud.t = d.life ?? rules.smokeTime;
    smokeReset(minds, squad, d.pos, rules);
    for (const g of goons) if (g.e.alive) g.e.calm();
    events.emit('stealthLost');
  });
  events.on('impact', (d) => {
    const target = d?.target;
    if (!room || !target?.alive || target.room !== room.id || HELD_BY_CHAIN.has(target.state)) return;
    const g = goons.find((x) => x.e === target);
    if (g && struck(g.mind, squad, heroAt(d).pos, d.outcome, rules) === 'shout') shout(g);
  });

  return {
    get active() { return !!room; },
    get room() { return room; },
    get alarm() { return squad.alarm; },
    get squad() { return squad; },
    get prompt() { return primary.prompt; },
    goons, rules,
    begin, end, update, noise, start, hold, startFor,
    // Co-op: watch another hero (its takedowns go through its own fighter's combat api).
    addHero(h, combatApi) { if (!watcherOf(h)) watchers.push(makeWatcher(h, () => combatApi)); },
    removeHero(h) { const i = watchers.findIndex((w) => w.hero === h); if (i > 0) watchers.splice(i, 1); },
    promptOf(h) { return watcherOf(h)?.prompt ?? null; },
    // Whether a point is inside the running predator room (flight is not allowed there).
    inRoom(pos) {
      const b = room?.bounds;
      if (!room) return false;
      if (!b) return true;
      return pos.x > b.minX - 8 && pos.x < b.maxX + 8 && pos.z > b.minZ - 8 && pos.z < b.maxZ + 8 && pos.y < b.maxY + 25;
    },
    armed() { let n = 0; for (const g of goons) if (g.e.alive && g.e.def?.ranged) n += 1; return n; },
  };
}
