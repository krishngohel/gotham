// Crime system v2 at run time: several crimes live in the city at once (abstract until a hero
// gets close), one squad at a time materialises through the encounter system (the story's own
// fights always win the slot), the rest of a crime (runners, getaway cars, bombs, civilians in
// danger, fires, sniper lasers) is drawn from small pools. Plays each crime's objective tree
// (objectives.js) against a facts snapshot built here, handles escalation, abandonment, expiry,
// police takeover of zip-tied goons, and feeds outcomes to the director (heat, gangs) and the
// rewards path. Host-only online: a guest draws from the events below.
//
// Events: crimeSpawn { id, kind, type, title, district, pos, dispatched, text } (map pin, dispatch
// audio), crimeDiscovered { id, how }, crimeActive { id, pos } (police converge),
// crimeUpdate { id, text, meter, label, tone, timer } (2 Hz, HUD for guests), crimeEscalate
// { id, type }, crimeEnd { id, kind, type, district, districtLabel, outcome, grade, xp, pos },
// crimeStopped { count } (XP and progress), crimeArrests { id, n }.
import * as THREE from 'three';
import { createObjective, createFacts } from './objectives.js';
import { composeCrime, crimeType, rewardsFor } from './crimeTypes.js';
import { DISTRICT_LABEL, DISTRICT_PHRASE } from '../world/regions/data.js';
import { lookOf } from './gangs.js';
import { DISPATCH, ARRIVAL_BARKS, fill } from './lines.js';
import { arrivalReaction, lieutenantEntries, styleOf } from './reputationWorld.js';
import { roomFight } from '../story/rooms.js';
import { createCrimeProps } from './crimeProps.js';

const RADIO = 'POLICE RADIO';
export const RANGE = { materialize: 70, roof: 100, engage: 22, abandon: 80, abandonT: 10, discoverSound: 75, discoverSight: 55, policeT: 8 };
const STORY_STOP = new Set(['fight', 'boss', 'cutscene']);
const LOUD_TWISTS = new Set(['ambush', 'secondWave']);

// A leaf's outcome is an object; a composite's is a function that sums its leaves.
const outcomeOf = (c) => (typeof c.obj.outcome === 'function' ? c.obj.outcome() : { silent: 1, ...c.obj.outcome });

export function crimeTitle(type, district) { return `${crimeType(type)?.title ?? 'Crime'} ${DISTRICT_PHRASE[district] ?? ''}`.trim(); }

export function createCrimeRuntime(ow, { director, geo, chase = null, quality = 'high', avoid = () => null, stepType = () => null, extraBlocked = () => false }) {
  const { events, rng, store, encounters, combat } = ow;
  const props = createCrimeProps(ow);
  const live = [];
  const facts = createFacts(2);
  let serial = 0, focus = null, forced = null, sinceStep = 999, hudT = 0;
  let style = { gadgets: 0, counters: 0, stealth: 0, hits: 0 };
  const label = (d) => DISTRICT_LABEL[d] ?? d;
  const pick = (a) => a[Math.floor(rng.next() * a.length)];

  // ------------------------------------------------------------ spawning
  function spawn(req) {
    const t = crimeType(req.type);
    if (!t) return null;
    const d = req.spot.district;
    const lt = director.district(d).lt;
    const plan = composeCrime(req.type, {
      spot: { ...req.spot, y: groundAt(req.spot) }, rng, geo, heat: director.heat(d), control: director.district(d).control,
      hour: ow.hour(), weather: ow.weather(), players: Math.max(1, ow.players().length), act: actNow(), difficulty: ow.difficulty?.() ?? 'normal',
      cocky: director.cocky(d, combat?.reputation), twists: req.twists ?? null,
    });
    if (!plan) return null;
    // A district's lieutenant leads the bigger jobs there, with counters for how he lost before.
    if (lt && plan.squad.length && plan.tier >= 1 && !plan.gangs[1] && rng.next() < 0.6) {
      plan.squad[0].push(...lieutenantEntries(lt, lookOf(lt.gang)));
      plan.lieutenant = lt.name;
    }
    serial += 1;
    const c = {
      id: req.id ?? `ow${serial}`, serial, fightId: `crime:${serial}`, type: plan.type, kind: plan.type, plan, title: crimeTitle(plan.type, d),
      spot: plan.spot, pos: { ...(plan.place ?? plan.spot) }, district: d,
      obj: createObjective(plan.objective, rng), status: 'run', state: 'pending',
      dispatched: req.forced || rng.next() < 0.55 + director.heat(d) * 0.08, discovered: false,
      materialized: false, squadUp: false, engaged: false, age: 0, life: req.life ?? 180, awayT: 0, idleT: 0, t: 0,
      wavesLeft: 0, alarm: false, arrests: 0, tagged: new Map(), squad: [], reacted: false, police: 0, actors: null, ltDown: false,
      chase: null, escalated: false,
    };
    live.push(c);
    if (c.dispatched) discover(c, 'dispatch');
    return c;
  }
  const groundAt = (s) => { const y = ow.collision?.groundBelow?.(s.x, (s.y ?? 0) + 3, s.z, 0.3); return y > -Infinity ? y : s.y ?? 0; };
  const actNow = () => { const n = ow.progress.campaign?.nightsDone?.length ?? 0; return Math.min(5, Math.max(1, n === 0 ? 1 : 1 + Math.ceil(n / 2))); };

  function discover(c, how) {
    if (c.discovered) return;
    c.discovered = true;
    const text = fill(pick(DISPATCH.spawn[c.type] ?? DISPATCH.spawn.robbery), { district: label(c.district) });
    if (how === 'dispatch') ow.ui.radio(RADIO, c.title, 6500);
    else ow.ui.hint(how === 'sound' ? `You hear trouble nearby: ${c.title.toLowerCase()}.` : `Trouble ahead: ${c.title.toLowerCase()}.`, 3500);
    events.emit('crimeSpawn', { id: c.id, kind: c.plan.alert, type: c.type, title: c.title, district: c.district, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z }, dispatched: how === 'dispatch', text: how === 'dispatch' ? text : null });
    if (how !== 'dispatch') events.emit('crimeDiscovered', { id: c.id, how, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z } });
    if (c.plan.twists.length && how === 'dispatch' && c.plan.twists.some((x) => x === 'police')) ow.dispatch(`Officer down near the scene in ${label(c.district)}. Units are pinned.`, c.district);
  }

  // ------------------------------------------------------------ materialising
  const nearestHeroDist = (p, yTol = 1e9) => {
    let best = Infinity;
    for (const pl of ow.players()) { const h = pl.hero; if (!h || h.dead || Math.abs(h.pos.y - (p.y ?? 0)) > yTol) continue; const d = Math.hypot(h.pos.x - p.x, h.pos.z - p.z); if (d < best) best = d; }
    return best;
  };
  const slotFree = () => !encounters.id || (focus && encounters.id === focus.fightId) || encounters.id.startsWith('crime:');

  function squadPoint(c) {
    if (c.plan.train) { const T = geo.trainState(c.plan.train); if (T) return { x: T.x, y: T.y, z: T.z }; }
    return c.plan.squadAt ? { x: c.plan.squadAt.x, y: c.plan.squadAt.y ?? groundAt(c.plan.squadAt), z: c.plan.squadAt.z } : c.plan.place ?? c.spot;
  }

  function materializeSquad(c) {
    if (!c.plan.squad.length || c.squadUp) return true;
    if (focus && focus !== c) return false;
    if (encounters.id && encounters.id !== c.fightId && !encounters.id.startsWith('crime:')) return false;
    const site = squadPoint(c);
    let def;
    if (c.type === 'dealBust' || c.type === 'museumHeist') def = dealRoom(c, site);
    else if (c.plan.nests) {
      // Snipers on their roofs: one per nest (their y from the roof), the rest of the crew below.
      const flat = c.plan.squad.flat();
      const nests = c.plan.nests.map((n) => ({ type: 'rifle', dx: n.x - site.x, dz: n.z - site.z, y: n.y + 0.2, gang: c.plan.gang }));
      def = { site, radius: 30, gang: lookOf(c.plan.gang), waves: [[...nests, ...flat.slice(0, 2).map((e) => ({ type: e.type, dx: e.dx, dz: e.dz }))]] };
    } else {
      def = { site, radius: c.plan.onTrain ? 14 : 16, gang: lookOf(c.plan.gang), waves: c.plan.squad.map((w) => w.map((e) => ({ type: e.type, dx: e.dx, dz: e.dz, gang: e.look, owGang: e.gang, elite: e.elite, lt: e.lt }))) };
    }
    encounters.begin(c.fightId, def);
    c.def = def;
    c.squadUp = true;
    c.wavesLeft = def.waves.length - 1;
    c.tagged.clear();
    focus = c;
    return true;
  }

  // An interrupt crime is a small predator room: the crew stands its ground on short beats, the
  // stealth runtime watches for the Bat, an alarm is the stealth alarm.
  function dealRoom(c, site) {
    const flat = c.plan.squad.flat();
    const squad = flat.slice(0, 6).map((e, i) => {
      const a = (i / Math.max(1, Math.min(6, flat.length))) * Math.PI * 2;
      const r = 5 + (i % 2) * 2;
      const x = site.x + Math.sin(a) * r, z = site.z + Math.cos(a) * r;
      return { type: e.type === 'rifle' || e.type === 'pistol' || e.type === 'sniper' ? 'rifle' : 'grunt', route: { mode: 'pingpong', points: [{ x, y: site.y, z, wait: 2 }, { x: x + Math.cos(a) * 3, y: site.y, z: z - Math.sin(a) * 3, wait: 2.5 }] } };
    });
    const room = { id: `owDeal${c.serial}`, site, radius: 20, gang: lookOf(c.plan.gang), squad, lights: [{ x: site.x, y: site.y + 4, z: site.z, r: 7 }], cover: [] };
    return roomFight(room, (s) => s);
  }

  // Facts for one crime (the shared object, refilled; nothing allocated).
  function fill1(c) {
    const players = ow.players();
    let n = 0;
    for (const p of players) {
      if (n >= 2) break;
      const h = p.hero;
      const F = facts.heroes[n];
      F.x = h.pos.x; F.y = h.pos.y; F.z = h.pos.z; F.slot = n; F.dead = !!h.dead;
      F.detective = ow.detective(p); F.crouched = !!h.crouched;
      facts.press[n] = ow.pressed(p, 'throw') || ow.pressed(p, 'punch');
      n++;
    }
    facts.nHeroes = n;
    facts.materialized = c.plan.squad.length ? c.squadUp : true;
    facts.engaged = c.engaged;
    const sq = facts.squad;
    sq.alive = 0; sq.total = 0; sq.aware = false; sq.alarm = c.alarm;
    for (const k in facts.gangAlive) facts.gangAlive[k] = 0;
    facts.struckGang = c.struck ?? null;
    c.struck = null;
    if (c.squadUp && focus === c) {
      const list = combat.enemies;
      for (const e of list) {
        if (!c.tagged.has(e)) { if (encounters.enemies.includes(e)) tag(c, e); else continue; }
        sq.total += 1;
        const standing = e.alive && e.state !== 'surrender' && e.state !== 'flee' && !e.fled;
        if (standing) { sq.alive += 1; const g = c.tagged.get(e); if (g) facts.gangAlive[g] = (facts.gangAlive[g] ?? 0) + 1; }
        if (e.aware) sq.aware = true;
      }
      if (c.wavesLeft > 0) sq.alive += c.wavesLeft;
    }
    facts.hit.fill(0);
    facts.train = c.plan.train ? geo.trainState(c.plan.train) : null;
    facts.chase = c.chase?.state ?? null;
  }
  // Which gang a goon belongs to (a war's two crews can share a look): the nearest wave entry.
  function tag(c, e) {
    let best = c.plan.gang, bd = Infinity;
    const site = c.def?.site ?? c.spot;
    for (const w of c.def?.waves ?? []) for (const en of w) {
      const d = Math.hypot(site.x + en.dx - e.pos.x, site.z + en.dz - e.pos.z);
      if (d < bd) { bd = d; best = en.owGang ?? c.plan.gang; e.owLt = !!en.lt; }
    }
    c.tagged.set(e, best);
  }

  // ------------------------------------------------------------ ending
  function end(c, outcome, { caption = null, silent = false } = {}) {
    const i = live.indexOf(c);
    if (i < 0) return;
    live.splice(i, 1);
    const o = outcomeOf(c);
    let arrests = c.arrests;
    if (c.squadUp && focus === c) for (const [e] of c.tagged) if (e.alive && e.state === 'surrender') arrests += 1;
    const res = outcome === 'stopped' ? rewardsFor(c.plan, o, { arrests, time: c.t }) : { xp: 0, grade: null };
    if (outcome === 'stopped') {
      ow.progress.crimes.stopped += 1;
      store.types[c.type] = (store.types[c.type] ?? 0) + 1;
      store.saved += o.saved ?? 0;
      store.arrests += arrests;
      ow.xp(res.xp, 'crime');
      combat?.reputation?.add('crimeStopped', 1, lookOf(c.plan.gang));
      ow.ui.toast(`${crimeType(c.type).title}: stopped`, `${label(c.district)} is a little safer. Grade ${res.grade}${arrests ? `, ${arrests} arrest${arrests === 1 ? '' : 's'}` : ''}${o.saved ? `, ${o.saved} saved` : ''}. Crimes stopped: ${ow.progress.crimes.stopped}.`, 5000);
      events.emit('crimeStopped', { count: ow.progress.crimes.stopped, type: c.type });
      if (!silent) ow.dispatch(fill(pick(DISPATCH.stopped), { district: label(c.district) }), c.district);
      if (arrests) { events.emit('crimeArrests', { id: c.id, n: arrests }); ow.dispatch(fill(pick(DISPATCH.arrests), { district: label(c.district), n: arrests }), c.district); }
    } else if (outcome !== 'cancelled' && outcome !== 'abandoned') {
      store.getaways += o.getaway ?? 0;
    }
    store.hurt += o.hurt ?? 0;
    store.collateral += o.collateral ?? 0;
    if (o.hurt) ow.dispatch(fill(DISPATCH.hurt, { district: label(c.district) }), c.district);
    director.outcome(c.district, { outcome: outcome === 'failed' && o.getaway ? 'getaway' : outcome, tier: c.plan.tier, gang: c.plan.gang, gangs: c.plan.gangs, hurt: o.hurt ?? 0, sided: o.sided ?? null });
    if (c.ltDown) director.lieutenantBeaten(c.district, styleOf(style));
    if (caption) ow.ui.radio(RADIO, caption, 4500);
    // The squad: a won fight leaves its bodies to the police (a few seconds: officers arrive and
    // take over the zip-tied); anything else clears at once.
    if (c.squadUp && focus === c) {
      focus = null;
      if (outcome === 'stopped' && arrests > 0) { policeHold = { fightId: c.fightId, t: RANGE.policeT }; events.emit('crimeActive', { id: c.id, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z } }); }
      else if (encounters.id === c.fightId) encounters.end();
    }
    if (c.chase) chase?.cancel?.(c.chase);
    if (c.plan.bridge) ow.world?.bridges?.hold?.(c.plan.bridge.id, null);
    props.release(c, outcome === 'stopped' ? 4 : 0);
    events.emit('crimeEnd', { id: c.id, kind: c.plan.alert, type: c.type, district: c.district, districtLabel: label(c.district), outcome, discovered: !!c.discovered, grade: res.grade, xp: res.xp, sided: o.sided ?? null, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z } });
    ow.save();
  }
  let policeHold = null;
  const heroPos = [], livePos = [];
  const tickCtx = { gov: null, hour: 23, weather: 'clear', visited: null, heroes: heroPos, live: livePos, avoid: null, forced: null };

  // ------------------------------------------------------------ events
  const offs = [
    events.on('fightStart', ({ id }) => { const c = live.find((x) => x.fightId === id); if (c) { c.engaged = true; events.emit('crimeActive', { id: c.id, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z } }); } }),
    events.on('wave', ({ id }) => { const c = live.find((x) => x.fightId === id); if (c) c.wavesLeft = Math.max(0, c.wavesLeft - 1); }),
    events.on('stealthAlarm', () => { if (focus) focus.alarm = true; }),
    events.on('zipTie', ({ target }) => { if (focus?.tagged.has(target)) { focus.arrests += 1; } }),
    events.on('impact', (d) => { if (focus && d?.target && focus.tagged.has(d.target)) focus.struck = focus.tagged.get(d.target); }),
    events.on('ko', (d) => { if (focus && d?.target?.owLt) focus.ltDown = true; }),
    events.on('takedown', (d) => { style.stealth += d?.kind === 'silent' ? 1 : 0; if (focus && d?.target?.owLt) focus.ltDown = true; }),
    events.on('gadgetUse', () => { style.gadgets += 1; }),
    events.on('counter', () => { style.counters += 1; }),
    // A story step that needs the encounter slot, or lands on top of a crime, calls it off.
    events.on('step', ({ step }) => {
      sinceStep = 0;
      const site = step?.site ? ow.site(step.site) : null;
      for (const c of [...live]) {
        const close = site && Math.hypot(site.x - c.pos.x, site.z - c.pos.z) < 60;
        if (STORY_STOP.has(step?.type) || close) end(c, 'cancelled');
      }
      if (STORY_STOP.has(step?.type) && policeHold) { if (encounters.id === policeHold.fightId) encounters.end(); policeHold = null; }
    }),
    events.on('challengeStart', () => { for (const c of [...live]) if (c.squadUp || c.engaged) end(c, 'cancelled'); }),
  ];

  // ------------------------------------------------------------ per frame
  function update(dt, gov) {
    sinceStep += dt;
    if (policeHold && (policeHold.t -= dt) <= 0) { if (encounters.id === policeHold.fightId) encounters.end(); policeHold = null; }
    // The director: spawn when the governor allows.
    // The director's context: one reused object and arrays (nothing allocated per frame).
    heroPos.length = 0;
    for (const p of ow.players()) if (p.hero && !p.hero.dead) heroPos.push(p.hero.pos);
    livePos.length = 0;
    for (const c of live) livePos.push(c.pos);
    tickCtx.gov = gov; tickCtx.hour = ow.hour(); tickCtx.weather = ow.weather(); tickCtx.visited = ow.progress.districts;
    tickCtx.avoid = avoid(); tickCtx.forced = forced;
    const req = director.tick(dt, tickCtx);
    if (forced && req) forced = null;
    if (req) { const c = spawn({ ...req, forced: req.forced }); if (c && req.forced) focus = focus ?? null; if (c && req.forced) c.forcedFocus = true; }
    for (const ev of director.drain()) onDirectorEvent(ev);
    for (let i = live.length - 1; i >= 0; i--) {
      const c = live[i];
      if (!c) continue;
      tick1(c, dt, gov);
    }
    hudT -= dt;
    if (hudT <= 0) { hudT = 0.5; publishHud(); }
    props.update(dt);
  }

  function tick1(c, dt, gov) {
    const d = nearestHeroDist(c.pos);
    // Discovery by sound (sirens, shouting) or sight.
    if (!c.discovered && (d < RANGE.discoverSound || (d < RANGE.discoverSight + 20 && c.plan.roof))) discover(c, d < RANGE.discoverSight ? 'sight' : 'sound');
    // Waiting crimes age (escalation, expiry) only while the governor lets the city run.
    if (!c.materialized) {
      if (gov.age) { c.age += dt; c.idleT += dt; }
      if (c.plan.escalateAfter && !c.escalated && c.idleT > c.plan.escalateAfter && c.plan.escalateTo) { escalateType(c, c.plan.escalateTo); return; }
      if (c.age > c.life && !c.forcedFocus) { end(c, 'expired', { caption: c.discovered ? DISPATCH.expired : null }); return; }
      const reach = c.plan.roof ? RANGE.roof : RANGE.materialize;
      if (d < reach && c.discovered && !extraBlocked()) {
        if (c.plan.squad.length && !c.plan.squadDelay && !materializeSquad(c)) return;
        c.materialized = true;
        props.claim(c);
        if (c.plan.bridge) ow.world?.bridges?.hold?.(c.plan.bridge.id, 'up');
        if (c.plan.vehicle && chase) c.chase = chase.start(c);
      } else return;
    }
    c.t += dt;
    // Materialised but never engaged, and the heroes have left: the crew finishes the job and goes
    // (frees the encounter slot; counts as ignored).
    if (!c.engaged) {
      c.farT = d > RANGE.materialize + 50 ? (c.farT ?? 0) + dt : 0;
      if (c.farT > 25 && !c.forcedFocus) { end(c, 'expired', { caption: c.discovered ? DISPATCH.expired : null }); return; }
    }
    if (!c.engaged && d < RANGE.engage) { c.engaged = true; events.emit('crimeActive', { id: c.id, pos: { x: c.pos.x, y: c.pos.y, z: c.pos.z } }); }
    // Delayed squads (the tail's destination, the trail's van, the train) come up when the first
    // stage is done.
    if (c.plan.squadDelay && !c.squadUp && c.obj.index >= 1) {
      if (!materializeSquad(c)) return;
      const q = squadPoint(c);
      c.pos.x = q.x; c.pos.y = q.y ?? c.pos.y; c.pos.z = q.z;
    }
    track(c);
    if (c.plan.onTrain && c.squadUp) carryOnTrain(c);
    // Reputation on arrival: the crew sees who's coming.
    if (c.squadUp && !c.reacted && d < RANGE.engage + 6 && focus === c) react(c);
    // Abandonment: an engaged crime you walked away from.
    if (c.engaged) {
      c.awayT = d > RANGE.abandon ? c.awayT + dt : 0;
      if (c.awayT >= RANGE.abandonT) { end(c, 'abandoned', { caption: 'The goons scattered.' }); return; }
    }
    fill1(c);
    const r = c.obj.step(dt, facts);
    props.draw(c, facts);
    if (r === 'escalate') { escalateObjective(c); return; }
    if (r === 'won') end(c, 'stopped');
    else if (r === 'lost') {
      const o = outcomeOf(c);
      end(c, 'failed', { caption: o.getaway || o.escaped ? fill(pick(DISPATCH.failed), { district: label(c.district) }) : o.hurt ? null : 'They got away.' });
      if (c.plan.props?.bombs && !c.obj.leaves.find((l) => l.kind === 'defuse')?.bombs.every((b) => b.done)) events.emit('word', { text: 'KA-BOOM!', pos: new THREE.Vector3(c.pos.x, c.pos.y + 2, c.pos.z), big: true });
    }
  }

  // The crime's centre follows what is moving: the tailed target, the lead runner, the getaway
  // car, the train (abandonment, the HUD distance and discovery all measure from it).
  function track(c) {
    let p = null;
    for (const l of c.obj.leaves) {
      if (l.kind === 'tail' && !l.done) { p = l.target; break; }
      if (l.kind === 'chase') { const r = l.runners.find((x) => x.started && !x.caught && !x.escaped); if (r) { p = r; break; } }
      if (l.kind === 'getaway' && l.car.moving && !l.car.stopped) { p = l.car; break; }
    }
    if (!p && c.plan.train && !c.squadUp) p = geo.trainState(c.plan.train);
    if (p) { c.pos.x = p.x; c.pos.y = p.y ?? c.pos.y; c.pos.z = p.z; }
  }

  // Escalation: a mugging ignored becomes a hostage scene (a new plan in the same place).
  function escalateType(c, to) {
    const i = live.indexOf(c);
    live.splice(i, 1);
    props.release(c, 0);
    const n = spawn({ type: to, spot: c.spot, life: c.life, forced: true, id: c.id });
    if (n) { n.escalated = true; n.discovered = c.discovered; events.emit('crimeEscalate', { id: n.id, type: to }); if (n.discovered) ow.dispatch(fill(DISPATCH.escalate[c.type] ?? DISPATCH.escalate.mugging, { district: label(c.district) }), c.district); }
  }
  // Escalation inside a crime: the deal's money runs, the tailed collector bolts.
  function escalateObjective(c) {
    if (c.escalated) return;
    c.escalated = true;
    const lines = DISPATCH.escalate[c.type];
    if (lines) ow.dispatch(fill(lines, { district: label(c.district) }), c.district);
    events.emit('crimeEscalate', { id: c.id, type: c.type });
    if (c.plan.escalate) { c.obj.add(c.plan.escalate); return; }
    const tail = c.obj.leaves.find((l) => l.kind === 'tail');
    if (tail) {
      const p = tail.target;
      const path = geo.streetPath({ x: p.x, y: p.y, z: p.z }, 120, { foot: true });
      c.obj.add({ kind: 'chase', wake: 0, text: 'He made you. Catch him!', runners: [{ path, speed: 6.4 }] });
    }
  }

  // The crew rides the train: move every goon of the squad with the lead car.
  const trainLast = { x: 0, z: 0, set: false };
  function carryOnTrain(c) {
    const T = geo.trainState(c.plan.train);
    if (!T) return;
    if (trainLast.set) {
      const dx = T.x - trainLast.x, dz = T.z - trainLast.z;
      if (Math.abs(dx) + Math.abs(dz) < 6) for (const [e] of c.tagged) if (e.alive && Math.hypot(e.pos.x - T.x, e.pos.z - T.z) < 30) { e.pos.x += dx; e.pos.z += dz; }
    }
    trainLast.x = T.x; trainLast.z = T.z; trainLast.set = true;
  }

  function react(c) {
    c.reacted = true;
    const list = [...c.tagged.keys()].filter((e) => e.alive);
    const rep = combat?.reputation;
    const r = arrivalReaction({ fearBias: rep?.fearBias?.(lookOf(c.plan.gang)) ?? 0, heat: director.heat(c.district), cocky: director.cocky(c.district, rep), n: list.length, rng });
    const fx = (m) => combat?.fear?.effects?.(m);
    let k = 0;
    for (const e of list) {
      if (e.type === 'lieutenant' || e.owLt) continue;
      if (k < r.surrender) { e.setMood?.('surrender', fx('surrender')); k++; continue; }
      if (k < r.surrender + r.flee) { e.setMood?.('flee', fx('flee')); k++; continue; }
    }
    if (r.surrender || r.flee) ow.bark(pick(ARRIVAL_BARKS[r.surrender ? 'surrender' : 'flee']), list[0]?.pos, 'goon');
    else if (r.trap && c.plan.twists.includes('ambush')) ow.bark(pick(ARRIVAL_BARKS.trap), list[0]?.pos, 'goon');
  }

  function onDirectorEvent(ev) {
    if (ev.type === 'lieutenant') { ow.dispatch(fill(DISPATCH.lieutenant, { name: ev.lt.name, district: label(ev.district) }), ev.district); events.emit('lieutenant', { district: ev.district, name: ev.lt.name, gang: ev.lt.gang }); }
    if (ev.type === 'mood' && DISPATCH.mood[ev.mood]) ow.dispatch(fill(DISPATCH.mood[ev.mood], { district: label(ev.district) }), ev.district);
    if (ev.type === 'mood') events.emit('districtMood', { district: ev.district, mood: ev.mood, from: ev.from });
  }

  function publishHud() {
    for (const c of live) {
      if (!c.materialized) continue;
      const h = c.obj.hud?.();
      if (!h) continue;
      c.hud = h;
      events.emit('crimeUpdate', { id: c.id, title: c.title, text: h.text, meter: h.meter ?? null, label: h.label ?? null, tone: h.tone ?? 'ok', timer: h.timer ?? null });
    }
  }

  // ------------------------------------------------------------ API
  return {
    get live() { return live; },
    propStats: () => props.stats(),
    // The legacy single-crime view (tests, the pause info, the story's marker): the crime in the
    // encounter slot, or the one most recently forced, or the nearest engaged one.
    get active() { return focus ?? live.find((c) => c.forcedFocus) ?? live.find((c) => c.engaged) ?? null; },
    get focus() { return focus; },
    update,
    // Dev hook (tests, ?crime=type): kind = any type id (old kinds included), spotId = a crime spot
    // or site id; twists optional. The next tick spawns it, dispatched and focused.
    force({ kind = null, type = null, spotId = null, twists = null } = {}) {
      const t = type ?? kind ?? 'robbery';
      const spot = spotId ? ow.spotById(spotId) : null;
      forced = { type: crimeType(t) ? t : 'robbery', spot, district: spot?.district ?? null, twists };
      director.force();
    },
    spawnNow(req) { return spawn({ ...req, forced: true }); },
    holdStory() { return live.some((c) => c.engaged && c.squadUp && focus === c) || !!live.find((c) => c.engaged && c.materialized && !c.plan.optional && !c.plan.squad.length); },
    marker() {
      if (avoid()) return null;
      const c = focus && !focus.engaged ? focus : live.find((x) => x.forcedFocus && !x.engaged) ?? null;
      return c ? c.pos : null;
    },
    onRespawn({ manual = false } = {}) {
      for (const c of [...live]) if (c.engaged) end(c, 'failed', { caption: manual ? 'The goons got away.' : 'The goons got away while you were down.' });
    },
    cancelAll() { for (const c of [...live]) end(c, 'cancelled'); },
    // Dev: win (or lose) the focused crime through its own path.
    debugWin(id = null) {
      const c = id ? live.find((x) => x.id === id) : this.active;
      if (!c) return false;
      end(c, 'stopped');
      return true;
    },
    nearest(p, max = 400) { let best = null, bd = max; for (const c of live) { if (!c.discovered) continue; const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z); if (d < bd) { bd = d; best = c; } } return best; },
    destroy() { for (const off of offs) off?.(); props.dispose?.(); },
    set sinceStep(v) { sinceStep = v; },
    get sinceStep() { return sinceStep; },
    resetStyle() { style = { gadgets: 0, counters: 0, stealth: 0, hits: 0 }; },
  };
}
