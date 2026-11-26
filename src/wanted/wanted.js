// [wanted] Police attention at runtime (workstream W). One createWanted() per run; game.js calls
// update() once a frame. The rules are pure (rules.js, witness.js, placement.js, caps.js); the
// units are in units.js; the readout in hud.js. Docs: docs/design/wanted.md.
//
// PUBLIC (window.__game.wanted):
//   level, stateName, state (the serialisable object), stats, units
//   offence(id, { pos, player, site, wit })      report an offence (the runtime finds the witness)
//   suspend(reason) / resume(reason)              story: hold everything (a cutscene, a mission)
//   set(level, { scripted, reason, at })          story: a level outright (scripted ignores "off")
//   brand(on)                                     story: Batman is a menace (plot state, saved)
//   clear(reason)                                 story / tests: stand everyone down now
//   snapshot() / apply(snap)                      online: the host's state for a guest
//   musicContext                                  sound.js reads it ('chase' during a pursuit)
//   ui                                            per-player readouts (show/hide/priority)
// Events emitted: wantedLevel { level, from, reason }, wantedState { state, level },
//   wantedOffence { id, wit, pts, level }, wantedCaught { outcome }, wantedEscaped { how },
//   wantedTeach { id, title, text }, plus the audio hooks: dispatch, bark, rifleShot, word.
import { withPlayer } from '../core/events.js';
import {
  LEVELS, MAX_LEVEL, RESTRICTED, createWantedState, stepWanted, addOffence, modifiers, districtStance, setLevel,
  canCallOff, caughtStep, caughtOutcome, caughtPenalty, convertAttack, levelForPoints, OFFENCES,
} from './rules.js';
import { canSee, inSearchlight, worstSpot, callDelay, callError } from './witness.js';
import { capsFor, unitBudget } from './caps.js';
import { createEdgeIndex, snapToRoad } from './placement.js';
import { createPoliceUnits } from './units.js';
import { createWantedReadout } from './hud.js';
import { BARKS, DISPATCH, TEACH, compass, fill, pick } from './lines.js';
import { REGION_SITES, DISTRICT_LABEL } from '../world/regions/data.js';
import { SITES } from '../world/mapData.js';
import './save.js';
import { net } from '../net/share.js'; // [verify] online: the GCPD for a guest
import { packUnits, unpackUnits } from './netCodec.js'; // [verify]

const STORY_STOP = new Set(['fight', 'boss', 'cutscene', 'chase', 'battle', 'board', 'puzzle', 'fear', 'credits']);
// Places to go to ground (search drains fast) besides interiors: the cave's doors.
const GROUND = [REGION_SITES.batcaveMouth, REGION_SITES.batcaveDowntown].filter(Boolean);
// Restricted places: a circle (r) and the most a hero may stand above the ground there and still be
// "inside" (a gargoyle on the GCPD roof is Batman's spot; the lobby is not).
const ZONES = [
  { site: 'gcpd', x: SITES.gcpdLobby?.x ?? 0, z: SITES.gcpdLobby?.z ?? 6, r: 16, maxY: 4 },
  { site: 'cityHall', x: REGION_SITES.cityHallSteps?.x ?? 160, z: REGION_SITES.cityHallSteps?.z ?? -449, r: 14, maxY: 6 },
  { site: 'blackgate', district: 'blackgate', maxY: 30 },
  { site: 'arkham', district: 'arkham', maxY: 30 },
  { site: 'wayne', x: REGION_SITES.wayneTowerLobby?.x ?? 0, z: REGION_SITES.wayneTowerLobby?.z ?? -432, r: 10, maxY: 4 },
];
const DIFF = { off: 'standard', relaxed: 'relaxed', standard: 'standard', relentless: 'relentless' };

export function createWanted(deps) {
  const {
    scene, world, events, players, vehicles = null, civilians = null, combat = null, quality, assets = null,
    progress, flow = () => null, bruce = () => null, interiors = null, hud = null, nav = () => null,
    settings = () => ({}), cameras = () => [], isReplica = () => false, reducedMotion = () => false, gordonRank = null,
    can = () => true, // [verify] the abilities layer: 'policeAttention' (src/abilities/abilityDefs.js)
  } = deps;
  const save = progress.wanted;
  const S = createWantedState();
  S.menace = !!save.menace;
  const caps = capsFor(quality);
  const index = createEdgeIndex(world.streetGraph);
  let seed = 1234567;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const units = createPoliceUnits({ scene, world, assets, quality, caps, index, cameras, rng, on: onUnit });
  const list = () => players?.list ?? players ?? [];

  // ---------------------------------------------------------------- per-hero scratch
  const views = []; // one per player slot: { hero info for units, sight, caught meter, timers }
  function viewOf(i) {
    while (views.length <= i) {
      views.push({
        index: views.length, x: 0, y: 0, z: 0, vx: 0, vz: 0, driving: false, car: null, carSpeed: 0, carYaw: 0, onRoad: false,
        roof: false, ground: 0, airborne: false, seen: false, seenT: 99, hidden: false, overhead: false, overheadT: 0,
        known: false, kx: 0, kz: 0, crouched: false, held: 0, caught: 0, struggle: 0, wrongT: 0, laneT: 0, district: null, spot: {}, pavementT: 0,
        lastPunch: false, lastCape: false, identity: 'batman', bruceNearT: 0, spiked: 0, ticketT: 0,
      });
    }
    return views[i];
  }
  const heroes = []; // the views of live players (units read this)
  let mods = modifiers({});
  let modsT = 0, sightT = 0, zoneT = 0, chatterT = 0, callOffQuiet = 0, lastCallOff = -999, offenceT = 0, propsT = 0, simT = 0;
  const pending = []; // civilian calls on their way to dispatch: { at, offence, pos, player, site, dt }
  const transitions = [];
  let enabledSetting = true;
  const stepIn = { dt: 0, seen: false, seenAt: { x: 0, z: 0, district: null }, spot: {}, mods, enabled: true };
  const spotScratch = [];
  const worst = {};
  let caughtHero = null, custody = null, stop = null;
  let warm = true, warmT = 0;
  let musicCtx = null;
  const statsOut = { ms: 0, sightRays: 0 };

  // ---------------------------------------------------------------- story gate
  // Night One is sacred: while one of its story objectives waits, the most this goes to is
  // Pursuit and you are never caught (the playthrough must not be teleported to a cell). Fights,
  // bosses, cutscenes and chases hold offences entirely.
  function storyState() {
    const f = flow();
    if (!f) return { hold: false, cap: MAX_LEVEL, noCatch: false };
    if (f.mode !== 'play') return { hold: true, cap: MAX_LEVEL, noCatch: true };
    const st = f.objectives?.step?.type ?? null;
    const pendingGoal = !!f.target && st !== 'credits' && st !== 'nightEnd';
    const hold = STORY_STOP.has(st) && pendingGoal;
    const nightOne = !!f.story?.nightOne;
    // Later nights: a travel step can end in a cell (custody always ends; the objective waits).
    return { hold, cap: nightOne && pendingGoal ? 2 : MAX_LEVEL, noCatch: hold || (nightOne && pendingGoal) };
  }
  let story = { hold: false, cap: MAX_LEVEL, noCatch: false };

  // ---------------------------------------------------------------- offences
  // Who saw it: an officer (now), a civilian (a call in a few seconds), or nobody.
  function witnessOf(pos, player) {
    const v = player ? viewOf(player.slot ?? 0) : null;
    if (v && v.seenT < 0.6) return 'police';
    for (const o of units.officers) if (o.active && o.stun <= 0 && Math.hypot(o.x - pos.x, o.z - pos.z) < 28) return 'police';
    for (const c of units.cruisers) if (c.active && c.stun <= 0 && Math.hypot(c.x - pos.x, c.z - pos.z) < 40) return 'police';
    const ag = civilians?.sim?.agents;
    if (ag) for (let k = 0; k < ag.length; k++) { const a = ag[k]; if (a.active && Math.abs(a.x - pos.x) < 30 && Math.abs(a.z - pos.z) < 30 && Math.abs(a.y - (pos.y ?? a.y)) < 8) return 'civilian'; }
    return null;
  }
  function offence(id, { pos = null, player = null, site = null, wit = undefined, dt = 1 } = {}) {
    if (isReplica() || S.suspended.length || !OFFENCES[id]) return false;
    if (!can('policeAttention')) return false; // [verify] the story has not introduced the GCPD yet
    if (story.hold && OFFENCES[id].witness !== 'none') return false;
    const p = player ?? list()[0];
    const at = pos ?? p?.hero?.pos;
    if (!at) return false;
    const w = wit === undefined ? (OFFENCES[id].witness === 'none' ? 'police' : witnessOf(at, p)) : wit;
    if (!w) return false;
    if (w === 'civilian') {
      // A phone call: it reaches dispatch in a few seconds, with a rough position.
      if (pending.length < 8 && !pending.some((q) => q.offence === id && simT - q.made < 2)) {
        const err = callError(rng()), a = rng() * Math.PI * 2;
        pending.push({ at: simT + callDelay(rng()), made: simT, offence: id, pos: { x: at.x + Math.cos(a) * err, y: at.y ?? 0, z: at.z + Math.sin(a) * err }, player: p, site, dt });
      }
      return true;
    }
    return commit(id, w, at, p, site, dt);
  }
  function commit(id, wit, at, p, site, dt) {
    if (!enabledSetting && !S.scripted) return false;
    const before = S.points;
    S.points = addOffence(S.points, id, { wit, dt, mods: modsFor(), site });
    // Night One's story cap.
    const capPts = (LEVELS[story.cap + 1]?.pts ?? 99) - 0.01;
    if (S.points > capPts) S.points = Math.max(before, capPts);
    if (S.points <= before) return false;
    stepIn.seenAt.x = at.x; stepIn.seenAt.z = at.z;
    if (!S.lkp) S.lkp = { x: at.x, z: at.z };
    else if (wit === 'police' || S.level === 0) { S.lkp.x = at.x; S.lkp.z = at.z; }
    S.lkpDistrict = world.districtAt?.(at.x, at.z) ?? null;
    offenceT = 0;
    // An officer's own eyes on the hero: the pursuit starts from here.
    if (wit === 'police' && p) { const v = viewOf(p.slot ?? 0); v.seenT = 0; }
    if (S.state === 'search' && wit === 'police') { S.state = S.level >= 2 ? 'pursuit' : 'noticed'; S.unseen = 0; }
    if (!OFFENCES[id].rate || Math.floor(before) !== Math.floor(S.points)) events.emit('wantedOffence', withPlayer({ id, wit, pts: S.points, level: levelForPoints(S.points), label: OFFENCES[id].label }, p));
    return true;
  }
  const modsFor = () => mods;

  // ---------------------------------------------------------------- unit reports
  function onUnit(kind, d) {
    const pl = list();
    switch (kind) {
      case 'bark': {
        const o = d.officer;
        const lines = BARKS[d.kind] ?? BARKS.chase;
        events.emit('bark', { text: pick(lines, Math.floor(rng() * 97)), speaker: 'officer', pos: { x: o.x, y: o.y + 1.7, z: o.z }, channel: 'world' });
        break;
      }
      case 'taser': case 'net': {
        const v = viewOf(d.hero);
        const p = pl[d.hero];
        if (!p || v.driving) break;
        // A dodge (roll) or being in the air beats it.
        const h = p.hero;
        if (h.state === 'dodge' || h.state === 'roll' || v.airborne) break;
        v.held = Math.max(v.held, kind === 'net' ? 2.2 : 1.1);
        events.emit('word', { text: kind === 'net' ? 'FWUMP!' : 'ZZZAP!', pos: { x: h.pos.x, y: h.pos.y + 2.2, z: h.pos.z } });
        events.emit('sonicPulse', { pos: { x: h.pos.x, y: h.pos.y, z: h.pos.z } }); // a crackle from the audio set
        break;
      }
      case 'shot': {
        const v = viewOf(d.hero);
        const o = d.officer;
        if (!v.car) break;
        // A warning shot at the tyres: a tracer to the road beside the car, a small slowdown.
        events.emit('rifleShot', { from: { x: o.x, y: o.y + 1.4, z: o.z }, to: { x: v.x + (rng() - 0.5) * 2, y: v.y + 0.3, z: v.z + (rng() - 0.5) * 2 }, hit: false, police: true });
        if (v.car.v) v.car.v.speed *= 0.96;
        break;
      }
      case 'pit': {
        const v = viewOf(d.hero);
        if (!v.car?.v) break;
        v.car.v.yaw += d.side * 0.28;
        v.car.v.speed *= 0.82;
        events.emit('vehicleImpact', { speed: 8 });
        const c = d.cruiser;
        events.emit('bark', { text: pick(BARKS.box, Math.floor(rng() * 7)), speaker: 'officer', pos: { x: c.x, y: c.y + 1.5, z: c.z }, channel: 'world' });
        break;
      }
      case 'roadblock': {
        const v = viewOf(d.hero);
        if (v.car?.v) { v.car.v.speed *= 0.3; v.car.v.yaw += (rng() - 0.5) * 0.5; }
        events.emit('vehicleImpact', { speed: 20 });
        events.emit('word', { text: 'CRASH!', pos: { x: d.rb.x, y: d.rb.y + 2, z: d.rb.z } });
        events.emit('roadblockHit', withPlayer({ pos: { x: d.rb.x, y: d.rb.y, z: d.rb.z } }, pl[d.hero]));
        offence('propertyDamage', { pos: d.rb, player: pl[d.hero], wit: 'police' });
        break;
      }
      case 'spikes': {
        const v = viewOf(d.hero);
        v.spiked = v.car === vehicles?.batmobile ? 8 : 18;
        events.emit('word', { text: 'PSSSHH!', pos: { x: v.x, y: v.y + 1.5, z: v.z } });
        events.emit('spikeStrip', withPlayer({}, pl[d.hero]));
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- event wiring (host)
  let fightT = 0;
  events.on('impact', (e) => {
    if (isReplica() || simT - fightT < 1) return;
    const p = e?.player ?? null;
    const pos = e?.pos ?? p?.hero?.pos;
    if (!pos) return;
    fightT = simT;
    // A brawl in the street matters to the police only when the city doesn't trust the vigilante
    // (reputation under 40) or a story beat says he's a menace. Stopping crimes is the job.
    const rep = combat?.reputation?.value ?? 50;
    if (rep < 40 || S.menace) offence('publicFight', { pos, player: p });
    // Interfering: fighting inside a scene the police already hold (officers within 15 m).
    for (const o of units.officers) if (o.active && Math.hypot(o.x - pos.x, o.z - pos.z) < 15) { offence('interfere', { pos, player: p }); break; }
  });
  events.on('trafficShoved', (e) => { const p = e?.player ?? driverPlayer(); if (p) offence('ramTraffic', { player: p }); });
  events.on('cannonFire', () => {
    const p = driverPlayer();
    if (!p || vehicles?.battle?.active || vehicles?.chase?.active || vehicles?.chases?.active) return;
    offence('vehicleWeapons', { player: p });
    // The riot round / immobiliser at a cruiser: converted, never destroyed.
    const v = viewOf(p.slot ?? 0);
    const hits = units.attackArea('riotRound', v.x + Math.sin(v.carYaw) * 18, v.y, v.z + Math.cos(v.carYaw) * 18, 9);
    costHits(hits, p);
  });
  events.on('streetDamage', (e) => { const p = e?.player ?? null; offence(e?.big ? 'propertyDamage' : 'collateral', { pos: e?.pos, player: p }); });
  // The owner saw it (and phones it in), unless an officer saw it first.
  events.on('carTaken', (e) => { const p = e?.player ?? driverPlayer(); const pos = e?.pos ?? p?.hero?.pos; if (pos) offence('carjack', { pos, player: p, wit: witnessOf(pos, p) ?? 'civilian' }); });
  // Gadgets near officers: converted outcomes (smoke blinds, glue sticks, EMP stops cars...).
  const gadgetAt = (attack, r) => (e) => {
    if (isReplica()) return;
    const pos = e?.pos ?? e?.target?.pos;
    if (!pos) return;
    costHits(units.attackArea(attack, pos.x, pos.y ?? 0, pos.z, r), e?.player ?? null);
  };
  events.on('smoke', gadgetAt('smoke', 6));
  events.on('glueBurst', gadgetAt('glue', 3.5));
  events.on('empPulse', gadgetAt('emp', 9));
  events.on('flashbang', gadgetAt('flashbang', 7));
  events.on('sonicStun', gadgetAt('sonic', 6));
  events.on('disruptorJam', (e) => { const p = e?.player ?? list()[0]; if (p?.hero) costHits(units.attackArea('disruptor', p.hero.pos.x, p.hero.pos.y, p.hero.pos.z, 60), p); });
  // Smoke also ends a caught attempt (the escape opportunity).
  events.on('smoke', (e) => { if (caughtHero && e?.pos && Math.hypot(e.pos.x - caughtHero.hero.pos.x, e.pos.z - caughtHero.hero.pos.z) < 8) escapeCaught('smoke'); });
  function costHits(hits, p) {
    for (const h of hits) {
      if (h.res.word) events.emit('word', { text: h.res.word, pos: { x: h.unit.x, y: (h.unit.y ?? 0) + 2, z: h.unit.z } });
      if (h.res.offence) offence(h.res.offence, { pos: h.unit, player: p, wit: 'police' });
      if (h.unit.kind === 'officer' && h.res.stun > 2) events.emit('bark', { text: pick(h.res.restrain ? BARKS.restrained : BARKS.stunned, Math.floor(rng() * 11)), speaker: 'officer', pos: { x: h.unit.x, y: h.unit.y + 1.7, z: h.unit.z }, channel: 'world' });
    }
    if (hits.length && hits.some((h) => h.unit.kind === 'officer')) teach('restrain');
  }
  // Crimes stopped: the clean record grows; Bruce-side reports read the night.
  events.on('crimeStopped', () => { if (S.level === 0) save.record = Math.min(1e6, (save.record ?? 0) + 1); });
  // Quick change (src/bruce: becomeBruce / becomeBatman): witnessed = large suspicion; unseen while
  // wanted (not scripted, up to level 3) = gone to ground.
  events.on('bruceIdentity', (e) => {
    if (isReplica()) return;
    const p = list()[0];
    if (!p?.hero) return;
    const v = viewOf(0);
    v.identity = e?.identity ?? 'batman';
    const seen = v.seenT < 2 || witnessOf(p.hero.pos, p) === 'civilian';
    if (e?.identity === 'bruce') {
      if (seen && S.level > 0) {
        bruceEffects({ suspicion: { detective: 20, reporter: 10 } }, 'Seen changing out of the suit');
        events.emit('word', { text: 'WAIT... WAYNE?!', pos: { x: p.hero.pos.x, y: p.hero.pos.y + 2.4, z: p.hero.pos.z } });
      } else if (S.level > 0 && S.level <= 3 && !S.scripted) {
        clear('quickChange');
      }
    }
  });
  function driverPlayer() {
    const d = vehicles?.driver;
    for (const p of list()) if (p.hero === d) return p;
    return list()[0] ?? null;
  }

  // ---------------------------------------------------------------- Bruce (public API only)
  function bruceEffects(effects, reason) {
    events.emit('bruceEffects', { effects, reason });
  }

  // ---------------------------------------------------------------- readouts (per local player)
  const readouts = new Map();
  function readoutFor(p) {
    if (p.local === false) return null;
    const root = hud?.forPlayer?.(p)?.el ?? hud?.el;
    if (!root) return null;
    let r = readouts.get(p);
    if (!r || r.root !== root) { r?.ui.destroy(); r = { root, ui: createWantedReadout(root, { reducedMotion }) }; readouts.set(p, r); }
    return r.ui;
  }
  let director = null; // the HUD director at integration: { request(item, t), chip(id, text, t) }
  function teach(id) {
    const key = String(id);
    if (save.taught.includes(key)) return;
    const t = TEACH[id];
    if (!t) return;
    save.taught.push(key);
    events.emit('wantedTeach', { id: key, title: t.title, text: t.text });
    if (director?.request) director.request({ id: `wanted:${key}`, kind: 'tip', ms: 4500, payload: { title: t.title, text: t.text }, chip: t.title }, performance.now());
    else hud?.card?.(t.title, t.text, 4500);
  }

  // ---------------------------------------------------------------- dispatch chatter
  function streetPhrase(x, z) { const d = world.districtAt?.(x, z); return d ? `in ${DISTRICT_LABEL[d] ?? 'the city'}` : ''; }
  function say(kind, vars = {}) {
    const lines = DISPATCH[kind];
    if (!lines) return;
    events.emit('dispatch', { kind: 'wanted', district: '', text: fill(pick(lines, Math.floor(rng() * 13)), vars) });
  }
  function headingVars() {
    const v = heroes[0];
    if (!v) return {};
    const sp = Math.hypot(v.vx, v.vz);
    return { dir: sp > 1 ? compass(v.vx, v.vz) : 'on foot', street: streetPhrase(v.x, v.z) };
  }

  // ---------------------------------------------------------------- caught and custody
  function startCaught(p) {
    if (caughtHero || custody) return;
    caughtHero = p;
    const v = viewOf(p.slot ?? 0);
    if (v.driving && vehicles?.active && vehicles.driver === p.hero) vehicles.exit();
    S.state = 'caught';
    v.struggle = 0;
    v.caughtT = 0;
    p.hero.control = { name: 'wantedCaught', camera: 'ground', update: () => false };
    p.hero.vel?.set?.(0, 0, 0);
    teach('caught');
    events.emit('wantedState', withPlayer({ state: 'caught', level: S.level }, p)); // [verify] player: a guest freezes its own hero
    events.emit('word', { text: 'SURROUNDED!', pos: { x: p.hero.pos.x, y: p.hero.pos.y + 2.4, z: p.hero.pos.z }, big: true });
  }
  function escapeCaught(how) {
    const p = caughtHero;
    if (!p) return;
    caughtHero = null;
    if (p.hero.control?.name === 'wantedCaught') p.hero.control = null;
    const v = viewOf(p.slot ?? 0);
    v.caught = 0; v.held = 0;
    costHits(units.attackArea('kick', p.hero.pos.x, p.hero.pos.y, p.hero.pos.z, 4, { officersOnly: true }), p);
    offence('evadeArrest', { player: p, wit: 'police' });
    S.state = S.level >= 2 ? 'pursuit' : 'noticed';
    save.nights.escapes = Math.min(999, (save.nights.escapes ?? 0) + 1);
    events.emit('wantedEscaped', withPlayer({ how }, p));
    events.emit('wantedState', { state: S.state, level: S.level });
  }
  function failCaught() {
    const p = caughtHero;
    caughtHero = null;
    const outcome = caughtOutcome({ gordon: gordon(), level: S.level, menace: S.menace });
    const identityRisk = S.level >= 4 || viewOf(p.slot ?? 0).identity === 'bruce';
    const pen = caughtPenalty(outcome, { level: S.level, identityRisk });
    save.nights.caught = Math.min(999, (save.nights.caught ?? 0) + 1);
    events.emit('wantedCaught', withPlayer({ outcome, penalty: pen }, p));
    say('caught');
    combat?.reputation?.add?.('points', pen.rep);
    world.clock?.advance?.(pen.hours * 60);
    if (pen.suspicion) bruceEffects({ suspicion: { detective: pen.suspicion } }, 'Batman in custody, briefly');
    if (outcome === 'warning') {
      events.emit('bark', { text: 'You and I are going to have a talk about the cars. Go. Before I change my mind.', speaker: 'gordon', channel: 'radio' });
      if (p.hero.control?.name === 'wantedCaught') p.hero.control = null;
      clear('warning');
      return;
    }
    // The holding cell at the GCPD lobby: a tiny playable escape. Units stand down meanwhile.
    custody = { p, t: 0, picks: 0, need: 4, lock: pen.gadgetLock, last: false };
    S.state = 'custody';
    units.clearAll();
    const cell = { x: 17.2, y: 0.25, z: 0.0 };
    p.hero.teleport?.(cell, -Math.PI / 2);
    p.hero.control = { name: 'wantedCell', camera: 'ground', update: () => false };
    events.emit('wantedState', withPlayer({ state: 'custody', level: S.level }, p)); // [verify] player: see caught
    if (p.local !== false) hud?.forPlayer?.(p)?.hint?.('Holding cell. Pick the lock: press <kbd>Punch</kbd> a few times.', 6000);
  }
  function stepCustody(dt) {
    const c = custody;
    const p = c.p;
    c.t += dt;
    const press = !!p.input?.pressed?.('punch');
    if (press && !c.last) { c.picks++; events.emit('word', { text: c.picks >= c.need ? 'CLICK!' : 'TINK', pos: { x: p.hero.pos.x - 0.8, y: p.hero.pos.y + 1.4, z: p.hero.pos.z } }); }
    c.last = press;
    // Never a soft-lock: the door gives after 40 s whatever happens.
    if (c.picks >= c.need || c.t > 40 || flow()?.mode !== 'play') {
      custody = null;
      if (p.hero.control?.name === 'wantedCell') p.hero.control = null;
      p.hero.teleport?.({ x: 14.4, y: 0.25, z: 0 }, -Math.PI / 2);
      p.hero.gadgetLock = c.lock; // [wanted] confiscated: src/gadgets/gadgetDefs.js gadgetsLocked reads it
      say('breakout');
      S.state = 'clear'; S.level = 0; S.points = 0;
      offence('breakout', { player: p, wit: 'police' });
      events.emit('wantedEscaped', withPlayer({ how: 'cell' }, p));
    }
  }

  // ---------------------------------------------------------------- Bruce's traffic stop
  // Bruce driving recklessly gets pulled over: stop within 10 s with the cruiser behind = a ticket
  // (Standing -1, a comic line); keep going = Bruce Wayne fled the police (suspicion, Pursuit).
  function startStop(p) {
    if (stop || S.level > 0 || !can('policeAttention')) return; // [verify] gate
    stop = { p, t: 0, stillT: 0 };
    setLevel(S, 1);
    S.points = LEVELS[1].pts;
    say('bruceStop');
    teach('stop');
    hud?.forPlayer?.(p)?.hint?.('Police lights behind you. Pull over (stop the car) or floor it.', 5000);
    events.emit('wantedState', { state: 'stop', level: 1 });
  }
  function stepStop(dt) {
    const v = viewOf(stop.p.slot ?? 0);
    stop.t += dt;
    let near = Infinity;
    for (const c of units.cruisers) if (c.active) near = Math.min(near, Math.hypot(c.x - v.x, c.z - v.z));
    if (v.driving && v.carSpeed < 1.5) stop.stillT += dt; else stop.stillT = 0;
    if (stop.stillT > 1.5 && near < 40) {
      save.tickets = Math.min(1e6, (save.tickets ?? 0) + 1);
      events.emit('bark', { text: pick(BARKS.traffic, save.tickets), speaker: 'officer', channel: 'world', pos: { x: v.x, y: v.y + 1.6, z: v.z } });
      bruceEffects({ standing: -1, flags: { lastTicket: save.tickets } }, 'A speeding ticket');
      events.emit('wantedTicket', withPlayer({ count: save.tickets }, stop.p));
      stop = null;
      clear('ticket');
      return;
    }
    // Waiting at the kerb and no cruiser came: let off with nothing.
    if (stop.t > 45 && v.carSpeed < 1.5) { stop = null; clear('stopGiveUp'); return; }
    // Driving off (fast after the first few seconds, or still moving much later): fled.
    if ((stop.t > 4 && v.carSpeed > 20) || (stop.t > 25 && v.carSpeed > 3) || !v.driving && stop.t > 3) {
      bruceEffects({ suspicion: { detective: 8, reporter: 4 } }, 'Bruce Wayne ran from a traffic stop');
      stop = null;
      S.points = Math.max(S.points, LEVELS[2].pts);
    }
  }

  // ---------------------------------------------------------------- the frame
  let wasLevel = 0, wasState = 'clear', taughtCheckT = 0, bridgesHeld = false, vetoOff = null, peakNight = 0;
  function gordon() {
    if (typeof gordonRank === 'function') return gordonRank();
    const b = bruce();
    return b?.threadRank?.('gordon') ?? 2;
  }
  function refreshMods() {
    const p0 = list()[0]?.hero?.pos;
    const d = p0 ? world.districtAt?.(p0.x, p0.z) : null;
    const ow = progress.openworld?.districts?.[d] ?? null;
    const stance = districtStance(d, { stopped: ow?.stopped ?? 0, heat: ow?.heat ?? 1 });
    const st = settings();
    mods = modifiers({ difficulty: DIFF[st.policeHeat] ?? 'standard', gordon: gordon(), menace: S.menace, stance, record: save.record ?? 0 });
    enabledSetting = st.police !== 'off';
    stepIn.mods = mods;
    stepIn.enabled = enabledSetting;
  }

  const sightIn = { night: 1, fog: 0, rain: 0 };
  const ray = { x: 0, y: 0, z: 0 }, eye = { x: 0, y: 0, z: 0 }, rayOut = { t: 0, box: null, normal: { x: 0, y: 0, z: 0 } };
  function clearLine(o, v) {
    eye.x = o.x; eye.y = o.y + (o.kind === 'heli' ? -1.5 : o.kind === 'cruiser' ? 1.3 : 1.6); eye.z = o.z;
    ray.x = v.x - eye.x; ray.y = v.y + 1 - eye.y; ray.z = v.z - eye.z;
    const len = Math.hypot(ray.x, ray.y, ray.z);
    if (len < 1) return true;
    ray.x /= len; ray.y /= len; ray.z /= len;
    statsOut.sightRays++;
    const hit = world.collision.raycast(eye, ray, len - 0.6, rayOut);
    return !hit;
  }
  // Updates each view from its player: where, how fast, driving, on a roof, hidden.
  function gatherHeroes(dt) {
    heroes.length = 0;
    const pl = list();
    const act = vehicles?.active ?? null;
    for (let i = 0; i < pl.length; i++) {
      const p = pl[i], h = p.hero;
      if (!h?.pos) continue;
      const v = viewOf(i);
      v.player = p;
      v.x = h.pos.x; v.y = h.pos.y; v.z = h.pos.z;
      const drivingThis = !!act && vehicles.driver === h;
      v.driving = drivingThis || h.control?.name === 'drive';
      v.car = drivingThis ? act : null;
      if (v.car?.group) {
        v.x = v.car.group.position.x; v.y = v.car.group.position.y; v.z = v.car.group.position.z;
        v.carYaw = v.car.v?.yaw ?? 0; v.carSpeed = Math.abs(v.car.v?.speed ?? 0);
        v.vx = Math.sin(v.carYaw) * (v.car.v?.speed ?? 0); v.vz = Math.cos(v.carYaw) * (v.car.v?.speed ?? 0);
      } else { v.vx = h.vel?.x ?? 0; v.vz = h.vel?.z ?? 0; v.carSpeed = 0; }
      v.airborne = h.state === 'glide' || h.state === 'air' || h.state === 'jump' || (h.state ?? '').startsWith?.('zip') || h.state === 'grapple';
      v.crouched = !!h.crouched;
      if (h.gadgetLock > 0) h.gadgetLock = Math.max(0, h.gadgetLock - dt); // confiscated gadgets come back
      v.hidden = !!interiors?.inside && i === 0 || !!bruce()?.indoors && i === 0;
      v.identity = i === 0 ? (bruce()?.state?.identity ?? 'batman') : 'batman';
      heroes.push(v);
    }
  }
  // Road, roof and cover for each hero: a few times a second (raycasts).
  function slowHeroFacts() {
    for (const v of heroes) {
      const s = snapToRoad(index, v.x, v.y, v.z, { maxDist: 60 });
      v.ground = s ? s.y : v.y;
      v.onRoad = !!s && s.dist < ((world.streetGraph.edges[s.edge]?.width ?? 12) / 2 + 1);
      v.roof = v.y - (s ? s.y : 0) > 5.5 && !v.airborne;
      v.roadDist = s ? s.dist : 99;
      v.roadEdge = s ? s.edge : -1;
      v.roadT = s ? s.t : 0;
      // Something solid over the head within 30 m: a deck, an awning, an underpass.
      eye.x = v.x; eye.y = v.y + 2.2; eye.z = v.z;
      ray.x = 0; ray.y = 1; ray.z = 0;
      v.overhead = !!world.collision.raycast(eye, ray, 30, rayOut);
      v.district = world.districtAt?.(v.x, v.z) ?? null;
      let safe = v.hidden;
      for (const g of GROUND) if (Math.hypot(g.x - v.x, g.z - v.z) < 8 && Math.abs(g.y - v.y) < 4) safe = true;
      const sp = v.spot;
      sp.safe = safe; sp.cover = v.overhead; sp.rooftop = v.roof;
      sp.districtChanged = !!S.lkpDistrict && v.district !== S.lkpDistrict;
      sp.farFromLkp = S.lkp ? Math.hypot(v.x - S.lkp.x, v.z - S.lkp.z) : 0;
      sp.weather = Math.min(1, sightIn.fog + sightIn.rain * 0.5);
    }
  }
  function updateSight() {
    const env = world.weather?.params ?? null;
    const hour = world.clock?.hour ?? 23;
    sightIn.night = hour >= 20 || hour < 6 ? 1 : hour >= 18 || hour < 7 ? 0.5 : 0;
    sightIn.fog = env?.fog ?? (world.weather?.state === 'fog' ? 1 : 0);
    sightIn.rain = env?.rain ?? (world.weather?.state === 'rain' || world.weather?.state === 'storm' ? 1 : 0);
    if (!Number.isFinite(sightIn.fog)) sightIn.fog = 0;
    if (!Number.isFinite(sightIn.rain)) sightIn.rain = 0;
    for (const v of heroes) {
      let seen = false;
      if (!v.hidden) {
        const H = units.heli;
        if (H.active && H.stun <= 0 && H.mode === 'track' && inSearchlight(H.light, v)) seen = true;
        if (!seen && H.active && H.stun <= 0 && canSee(H, v, sightIn) >= 0 && clearLine(H, v)) seen = true;
        if (!seen) for (const o of units.officers) { if (o.active && o.stun <= 0 && canSee(o, v, sightIn) >= 0 && clearLine(o, v)) { seen = true; break; } }
        if (!seen) for (const c of units.cruisers) { if (c.active && c.stun <= 0 && c.mode !== 'leave' && canSee(c, v, sightIn) >= 0 && clearLine(c, v)) { seen = true; break; } }
      }
      v.seen = seen;
      if (seen) v.seenT = 0;
    }
  }

  function updateDriving(dt) {
    for (const v of heroes) {
      const p = v.player;
      if (!v.car) { v.wrongT = 0; v.pavementT = 0; continue; }
      // Rams and shoves with police cars; officers dive clear (never run over).
      const hit = units.carContact(v, v.carSpeed, v.carYaw, v.car.radius ?? 2);
      if (hit) {
        events.emit('vehicleImpact', { speed: hit.speed });
        events.emit('word', { text: hit.res.word ?? 'CRUNCH', pos: { x: hit.cruiser.x, y: hit.cruiser.y + 2, z: hit.cruiser.z } });
        offence('ramPolice', { pos: hit.cruiser, player: p, wit: 'police' });
      }
      if (v.carSpeed > 4) units.clearRoad(v.x, v.z, Math.sin(v.carYaw), Math.cos(v.carYaw), v.carSpeed);
      // Spikes: tyres gone for a while (the Batmobile's run-flats recover sooner).
      if (v.spiked > 0) { v.spiked -= dt; if (v.car.v && v.car.v.speed > 11) v.car.v.speed -= (v.car.v.speed - 11) * Math.min(1, dt * 3); }
      if (v.roadEdge < 0) continue;
      // Wrong way: this city keeps left; on the right-hand half of a two-way street, moving.
      const e = world.streetGraph.edges[v.roadEdge];
      if (e && !e.oneway && v.carSpeed > 8 && v.onRoad) {
        const A = world.streetGraph.nodes[e.a], B = world.streetGraph.nodes[e.b];
        const ex = B.x - A.x, ez = B.z - A.z, L = Math.hypot(ex, ez) || 1;
        const along = (v.vx * ex + v.vz * ez) / L;
        // Signed lateral offset from the centre line (+: right of A->B, x east z south).
        const lat = ((v.x - A.x) * -ez + (v.z - A.z) * ex) / L;
        const rightOfTravel = along >= 0 ? lat > 1.2 : lat < -1.2;
        v.wrongT = rightOfTravel ? v.wrongT + dt : 0;
        if (v.wrongT > 2) offence('wrongWay', { player: p, dt, pos: v });
      } else v.wrongT = 0;
      // Pavement: off the carriageway at speed with people about.
      const off = v.roadDist > (e?.width ?? 12) / 2 + 0.6 && v.roadDist < (e?.width ?? 12) / 2 + (e?.sidewalk ?? 3) + 1;
      v.pavementT = off && v.carSpeed > 6 ? v.pavementT + dt : 0;
      if (v.pavementT > 0.5) offence('pavement', { player: p, dt, pos: v });
      if (v.carSpeed > 30 && v.onRoad) offence('reckless', { player: p, dt, pos: v });
      // Bruce at the wheel: reckless driving gets pulled over (not Batman's business).
      if (v.identity === 'bruce' && (v.carSpeed > 21 || v.pavementT > 1 || v.wrongT > 3) && !stop && S.level === 0) startStop(p);
    }
  }

  function updateZones(dt) {
    for (const v of heroes) {
      if (v.hidden && v.index !== 0) continue;
      for (const z of ZONES) {
        const inside = z.district ? v.district === z.district : Math.hypot(v.x - z.x, v.z - z.z) < z.r;
        if (!inside || v.y - v.ground > z.maxY) continue;
        const R = RESTRICTED[z.site];
        if (R.suspicion) {
          if (v.identity === 'batman' && v.seenT < 1) { v.bruceNearT -= dt; if (v.bruceNearT <= 0) { v.bruceNearT = 30; bruceEffects({ suspicion: { reporter: R.suspicion } }, `Batman seen at ${R.label}`); } }
          continue;
        }
        if (v.identity !== 'batman') continue;
        offence('trespass', { player: v.player, site: z.site, pos: v });
      }
      // Bruce near a Batman incident: the detective notes it.
      if (v.identity === 'bruce' && S.lkp && S.lkpT < 120 && Math.hypot(v.x - S.lkp.x, v.z - S.lkp.z) < 60) {
        v.bruceNearT -= dt;
        if (v.bruceNearT <= 0) { v.bruceNearT = 90; bruceEffects({ suspicion: { detective: 3 } }, 'Bruce Wayne near a Batman incident'); }
      }
    }
  }

  // Level 1: walking away calmly from officers asking questions ends it; running is fleeing a stop.
  function updateNoticed() {
    if (S.level !== 1 || S.scripted) return;
    for (const v of heroes) {
      for (const o of units.officers) {
        if (!o.active || o.mode !== 'approach') continue;
        const d = Math.hypot(o.x - v.x, o.z - v.z);
        const fast = Math.hypot(v.vx, v.vz) > 7.5 || v.airborne || v.driving && v.carSpeed > 12;
        if (d < 7 && fast) { offence('fleeStop', { player: v.player, wit: 'police', pos: v }); return; }
      }
    }
  }

  function updateCaught(dt) {
    if (custody) { stepCustody(dt); return; }
    if (caughtHero) {
      const p = caughtHero, v = viewOf(p.slot ?? 0);
      v.caughtT = (v.caughtT ?? 0) + dt;
      const press = !!p.input?.pressed?.('punch') || !!p.input?.pressed?.('jump');
      if (press) v.struggle += 1;
      if (v.struggle >= 7) { escapeCaught('struggle'); return; }
      if (v.caughtT > 3.2) failCaught();
      return;
    }
    if (story.noCatch || S.level === 0) return;
    for (const v of heroes) {
      let near = 0, boxed = 0;
      for (const o of units.officers) if (o.active && o.stun <= 0 && !o.spotter && Math.hypot(o.x - v.x, o.z - v.z) < 1.9 && Math.abs(o.y - v.y) < 1.5) near++;
      if (v.driving) for (const c of units.cruisers) if (c.active && c.stun <= 0 && Math.hypot(c.x - v.x, c.z - v.z) < 6.5) boxed++;
      v.held = Math.max(0, v.held - dt);
      const slow = Math.hypot(v.vx, v.vz) < 2.5 && !v.airborne;
      const struggle = !!v.player?.input?.pressed?.('punch');
      v.caught = caughtStep(v.caught, { dt, near, boxed: v.driving && v.carSpeed < 3 ? boxed : 0, held: v.held > 0, slow, struggle, level: S.level });
      // Punching an officer within reach is a restraint (zip-tie), never a blow.
      if (!v.driving && struggle && !v.lastPunch) {
        const o = units.nearestOfficer(v.x, v.y, v.z, 1.9);
        const enemyClose = combat?.enemies?.some?.((e) => e.alive && Math.hypot(e.pos.x - v.x, e.pos.z - v.z) < 3);
        if (o && !enemyClose) costHits([{ unit: o, res: restrain(o) }], v.player);
      }
      v.lastPunch = struggle;
      const cape = !!v.player?.input?.pressed?.('cape');
      if (cape && !v.lastCape) costHits(units.attackArea('cape', v.x, v.y, v.z, 3.2, { officersOnly: true }), v.player);
      v.lastCape = cape;
      if (v.caught >= 1) { v.caught = 0; startCaught(v.player); return; }
    }
  }
  function restrain(o) {
    const res = convertAttack('officer', 'punch');
    o.stun = res.stun; o.restrained = true; o.clip = null;
    return res;
  }

  // Props ahead (level 3+): a roadblock and spikes on the predicted route of a driving hero.
  function updateProps(dt) {
    propsT -= dt;
    if (propsT > 0) return;
    propsT = 2;
    if (S.level < 3 || S.state !== 'pursuit') return;
    const v = heroes.find((h) => h.driving) ?? null;
    if (!v || v.carSpeed < 6) return;
    const budget = unitBudget(S.level, caps, { units: mods.units });
    const ahead = (rb) => (rb.x - v.x) * v.vx + (rb.z - v.z) * v.vz > 0 && Math.hypot(rb.x - v.x, rb.z - v.z) < 260;
    if (!units.roadblocks.some((rb) => !rb.hit && ahead(rb))) {
      if (units.placeRoadblocks({ x: v.x, y: v.y, z: v.z }, { x: v.vx, z: v.vz }, budget.roadblocks)) say('coordinated', headingVars());
    }
    if (budget.spikes && !(units.spike.active && !units.spike.hit && ahead(units.spike))) units.placeSpikes({ x: v.x, y: v.y, z: v.z }, { x: v.vx, z: v.vz });
  }

  // Level 5: raise the bascules away from the heroes (sealed bridges), lower them after.
  function updateBridges() {
    const br = world.bridges;
    if (!br?.list) return;
    const want = S.level >= 5 && S.state !== 'cooldown';
    if (want) {
      for (const b of br.list) {
        if (b.x === undefined) continue;
        const near = heroes.some((v) => Math.hypot(v.x - b.x, v.z - ((b.z0 ?? b.z ?? 0) + (b.z1 ?? b.z ?? 0)) / 2) < 90);
        br.hold(b.id, near ? null : 'up');
      }
      bridgesHeld = true;
    } else if (bridgesHeld) {
      for (const b of br.list) br.hold(b.id, null);
      bridgesHeld = false;
    }
  }

  function updateNet() {
    // A guest never runs the rules: the host's snapshot arrives through apply().
  }

  function update(dt, real = dt) {
    const t0 = performance.now();
    simT += dt;
    if (isReplica()) { units.updateReplica(real); drawReadouts(real); return; } // [verify] the host's units, as puppets
    statsOut.sightRays = 0;
    modsT -= real;
    if (modsT <= 0) { modsT = 0.25; refreshMods(); story = storyState(); }
    const idle = S.level === 0 && !units.busy && !pending.length && !caughtHero && !custody && !stop;
    gatherHeroes(dt);
    if (idle) {
      // A figure or the helicopter built on a quiet frame now and then (never mid-chase).
      if (warm && simT > 8 && (warmT -= real) <= 0) { warmT = 1.5; warm = units.prewarm(); }
      // Cheap watch while clear: driving and places (offences can start a chase).
      sightT -= real;
      if (sightT <= 0) { sightT = 0.25; slowHeroFacts(); updateZones(0.25); }
      updateDriving(dt);
      if (S.points > 0) stepRules(dt);
      drawReadouts(real);
      statsOut.ms = statsOut.ms * 0.95 + (performance.now() - t0) * 0.05;
      return;
    }
    // Civilian calls reaching dispatch.
    for (let i = pending.length - 1; i >= 0; i--) {
      const q = pending[i];
      if (simT < q.at) continue;
      pending.splice(i, 1);
      commit(q.offence, 'civilian', q.pos, q.player, q.site, q.dt);
      if (S.level <= 1) say('noticed', { street: streetPhrase(q.pos.x, q.pos.z) });
    }
    sightT -= real;
    if (sightT <= 0) { sightT = 0.25; slowHeroFacts(); updateSight(); updateZones(0.25); }
    for (const v of heroes) {
      v.seenT += dt;
      // What the police know: the real position while seen (or within 2 s), else the last known one.
      v.known = v.seenT < 2;
      v.kx = v.known || !S.lkp ? v.x : S.lkp.x; v.kz = v.known || !S.lkp ? v.z : S.lkp.z;
    }
    updateDriving(dt);
    updateNoticed();
    stepRules(dt);
    updateCaught(dt);
    if (stop) stepStop(dt);
    updateProps(dt);
    updateBridges();
    // Units.
    const split = heroes.length > 1 && Math.hypot(heroes[0].x - heroes[1].x, heroes[0].z - heroes[1].z) > 120;
    const budget = custody ? unitBudget(0, caps) : unitBudget(S.level, caps, { units: mods.units, split });
    unitCtx.level = custody ? 0 : S.level;
    unitCtx.mode = S.state === 'search' ? 'search' : S.state === 'cooldown' ? 'cooldown' : S.level === 1 ? 'noticed' : S.level > 1 ? 'pursuit' : 'idle';
    unitCtx.heroes = heroes; unitCtx.lkp = S.lkp; unitCtx.budget = budget;
    units.update(dt, unitCtx);
    // Chatter: where he's heading, every so often during a pursuit.
    chatterT -= dt;
    if (S.state === 'pursuit' && chatterT <= 0) { chatterT = 14 + rng() * 8; say('heading', headingVars()); }
    musicCtx = S.state === 'pursuit' && S.level >= 2 ? { context: 'chase' } : null;
    drawReadouts(real);
    statsOut.ms = statsOut.ms * 0.95 + (performance.now() - t0) * 0.05;
  }
  const unitCtx = { level: 0, mode: 'idle', heroes, lkp: null, budget: null };

  function stepRules(dt) {
    let anySeen = false;
    spotScratch.length = 0;
    for (const v of heroes) {
      if (v.seenT < 0.3) { anySeen = true; stepIn.seenAt.x = v.x; stepIn.seenAt.z = v.z; stepIn.seenAt.district = v.district; }
      else spotScratch.push(v.spot);
    }
    stepIn.dt = dt; stepIn.seen = anySeen;
    stepIn.spot = worstSpot(spotScratch, worst);
    const tr = stepWanted(S, stepIn, transitions);
    // Gordon stands them down (level 1-2, good trust) after a quiet spell.
    if (canCallOff(S, mods) && !anySeen) { callOffQuiet += dt; if (callOffQuiet > 6 && simT - lastCallOff > 180) { lastCallOff = simT; callOffQuiet = 0; say('callOff'); clear('gordon'); return; } } else callOffQuiet = 0;
    for (const t of tr) onTransition(t);
  }
  function onTransition(t) {
    if (t.startsWith('level:')) {
      const [, from, to] = t.split(':').map(Number);
      events.emit('wantedLevel', { level: to, from, reason: 'offence' });
      peakNight = Math.max(peakNight, to);
      save.nights.peak = Math.max(save.nights.peak ?? 0, to);
      teach(to);
      const v = headingVars();
      say(LEVELS[to].id === 'noticed' ? 'noticed' : LEVELS[to].id, v);
      if (to >= 3 && from < 3) bruceEffects({ threads: { gordon: -0.15 }, suspicion: { reporter: 2 } }, 'Batman in a police pursuit');
      if (to >= 5 && from < 5) bruceEffects({ threads: { gordon: -0.3 }, flags: { manhunt: true } }, 'A citywide manhunt for the Batman');
      save.record = 0;
      updateVeto();
    } else if (t.startsWith('state:')) {
      const st = t.slice(6);
      events.emit('wantedState', { state: st, level: S.level });
      if (st === 'search') say('search', headingVars());
      if (st === 'cooldown') { say('lost'); for (const o of units.officers) if (o.active && o.stun <= 0) { events.emit('bark', { text: pick(BARKS.lost, Math.floor(rng() * 5)), speaker: 'officer', pos: { x: o.x, y: o.y + 1.7, z: o.z }, channel: 'world' }); break; } }
    } else if (t === 'cleared') {
      events.emit('wantedLevel', { level: S.level, from: wasLevel, reason: 'cleared' });
      updateVeto();
    }
    wasLevel = S.level; wasState = S.state;
  }

  // Fast travel from the El stations is off while the police are looking hard (they watch them).
  function updateVeto() {
    const n = nav();
    if (!n?.fastTravel?.addVeto) return;
    if (!vetoOff) vetoOff = n.fastTravel.addVeto(() => (S.level >= 3 ? 'The GCPD is watching the stations. Lose them first.' : null));
  }

  function drawReadouts(real) {
    const pl = list();
    let closing = 0;
    for (const v of heroes) for (const c of units.cruisers) if (c.active && c.mode !== 'leave') { const d = Math.hypot(c.x - v.x, c.z - v.z); closing = Math.max(closing, 1 - Math.min(1, Math.max(0, (d - 8) / 40))); }
    for (const v of heroes) for (const o of units.officers) if (o.active && o.stun <= 0 && !o.spotter) { const d = Math.hypot(o.x - v.x, o.z - v.z); closing = Math.max(closing, 1 - Math.min(1, Math.max(0, (d - 2) / 14))); }
    rv.level = S.level; rv.state = S.state; rv.search01 = S.searchMax > 0 ? S.search / S.searchMax : 0; rv.closing01 = closing;
    for (const p of pl) readoutFor(p)?.update(rv, real);
  }
  const rv = { level: 0, state: 'clear', search01: 0, closing01: 0 };

  // ---------------------------------------------------------------- public
  function clear(reason = 'clear') {
    const from = S.level;
    S.points = 0; S.level = 0; S.state = 'clear'; S.search = 0; S.searchMax = 0; S.scripted = false; S.unseen = 0; S.seq++;
    for (const v of views) { v.caught = 0; v.held = 0; }
    if (caughtHero?.hero?.control?.name === 'wantedCaught') caughtHero.hero.control = null;
    caughtHero = null;
    if (from > 0) events.emit('wantedLevel', { level: 0, from, reason });
    events.emit('wantedState', { state: 'clear', level: 0 });
    wasLevel = 0;
  }
  const api = {
    get level() { return S.level; },
    get stateName() { return S.state; },
    get state() { return S; },
    get points() { return S.points; },
    get musicContext() { return musicCtx; },
    get stats() { return { ...statsOut, ...units.stats, caps }; },
    get units() { return units; },
    get heroes() { return heroes; },
    get custody() { return custody; },
    get caughtHero() { return caughtHero; },
    get trafficStop() { return stop; },
    get save() { return save; },
    readouts,
    offence,
    teach,
    suspend(reason = 'story') { if (!S.suspended.includes(reason)) S.suspended.push(reason); },
    resume(reason = 'story') { const i = S.suspended.indexOf(reason); if (i >= 0) S.suspended.splice(i, 1); },
    set(level, { scripted = true, reason = 'story', at = null } = {}) {
      const from = S.level;
      setLevel(S, level, { scripted });
      if (at) S.lkp = { x: at.x, z: at.z };
      else if (!S.lkp && heroes[0]) S.lkp = { x: heroes[0].x, z: heroes[0].z };
      if (S.level !== from) events.emit('wantedLevel', { level: S.level, from, reason });
      if (S.level === 0) clear(reason);
      return S.level;
    },
    clear,
    brand(on = true) {
      S.menace = !!on; save.menace = !!on;
      refreshMods();
      if (on) { say('menace'); if (S.level === 0) api.set(1, { scripted: false, reason: 'menace' }); }
    },
    // The HUD director at integration: { request(item, t), chip(id, text, t) }.
    setDirector(d) { director = d ?? null; },
    snapshot() {
      return { v: 1, points: S.points, level: S.level, state: S.state, search: S.search, searchMax: S.searchMax, lkp: S.lkp ? { x: S.lkp.x, z: S.lkp.z } : null, menace: S.menace, scripted: S.scripted, seq: S.seq };
    },
    apply(snap) {
      if (!snap || snap.v !== 1) return;
      S.points = +snap.points || 0; S.level = Math.max(0, Math.min(MAX_LEVEL, snap.level | 0)); S.state = typeof snap.state === 'string' ? snap.state : 'clear';
      S.search = +snap.search || 0; S.searchMax = +snap.searchMax || 0; S.lkp = snap.lkp ? { x: +snap.lkp.x, z: +snap.lkp.z } : null;
      S.menace = !!snap.menace; S.scripted = !!snap.scripted; S.seq = snap.seq | 0;
    },
    // The minimap layer (src/nav: addMinimapLayer): last known position, search area, unit dots
    // and the helicopter's light, drawn into the player's minimap canvas.
    drawMinimap(g, f, at) {
      if (S.level === 0 && !units.busy) return;
      const C = f.R, k = f.R / f.radius;
      if (S.lkp && (S.state === 'search' || S.state === 'cooldown')) {
        const p = at(f, S.lkp.x, S.lkp.z);
        const r = (18 + (1 - (S.searchMax > 0 ? S.search / S.searchMax : 0)) * 40) * k;
        g.beginPath(); g.arc(C + p.x, C + p.y, r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(242,193,75,0.22)'; g.fill();
        g.setLineDash([4, 3]); g.lineWidth = 1.5; g.strokeStyle = '#f2c14b'; g.stroke(); g.setLineDash([]);
        // The ghost: where they last saw you.
        g.globalAlpha = 0.75;
        g.beginPath(); g.arc(C + p.x, C + p.y, 4.5, 0, Math.PI * 2); g.fillStyle = '#efe6cf'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#0b0b12'; g.stroke();
        g.globalAlpha = 1;
      }
      for (const o of units.officers) {
        if (!o.active) continue;
        const p = at(f, o.x, o.z);
        if (p.x * p.x + p.y * p.y > (C - 6) ** 2) continue;
        // A little vision wedge (the stealth cone, 110 degrees) and the dot.
        if (o.stun <= 0) {
          const a = Math.PI / 2 - o.yaw + (f.rot ?? 0), w = 0.96, len = 30 * k;
          g.beginPath(); g.moveTo(C + p.x, C + p.y);
          g.arc(C + p.x, C + p.y, len, -a - w, -a + w); g.closePath();
          g.fillStyle = 'rgba(88,140,255,0.18)'; g.fill();
        }
        g.beginPath(); g.arc(C + p.x, C + p.y, 2.6, 0, Math.PI * 2); g.fillStyle = o.stun > 0 ? '#8a8f9c' : '#3a6dff'; g.fill();
      }
      for (const c of units.cruisers) {
        if (!c.active) continue;
        const p = at(f, c.x, c.z);
        if (p.x * p.x + p.y * p.y > (C - 6) ** 2) continue;
        const blink = Math.floor(simT * 4) % 2;
        g.fillStyle = blink ? '#ff4f4f' : '#3a6dff';
        g.fillRect(C + p.x - 3.5, C + p.y - 3.5, 7, 7);
        g.lineWidth = 1.2; g.strokeStyle = '#0b0b12'; g.strokeRect(C + p.x - 3.5, C + p.y - 3.5, 7, 7);
      }
      const H = units.heli;
      if (H.active) {
        const p = at(f, H.light.x, H.light.z);
        g.beginPath(); g.arc(C + p.x, C + p.y, Math.max(4, H.light.r * k), 0, Math.PI * 2);
        g.fillStyle = 'rgba(255,250,220,0.45)'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#0b0b12'; g.stroke();
      }
      for (const rb of units.roadblocks) {
        const p = at(f, rb.x, rb.z);
        g.fillStyle = '#ff7a1a'; g.fillRect(C + p.x - 5, C + p.y - 2, 10, 4);
      }
    },
    update,
    // Tests and tools: pretend a unit saw the hero at once.
    debugSeen(i = 0) { const v = viewOf(i); v.seenT = 0; },
    dispose() { for (const r of readouts.values()) r.ui.destroy(); readouts.clear(); units.clearAll(); vetoOff?.(); for (const off of netOffs.splice(0)) off?.(); },
  };
  // [verify] Online (docs/design/wanted.md 7, src/net/share.js): the host's level and search go to a
  // guest as a state blob, its units as a second blob the guest draws as puppets (units.js
  // applyNet), and the level/state/teaching/caught events are re-emitted on the guest. Being chased,
  // caught and the non-lethal rule all run on the host against the guest's hero there; the guest
  // freezes its own hero while the host holds it (caught, the cell) and shows its own cards.
  const netOffs = [];
  try {
    netOffs.push(net.registerState('wanted', { snapshot: () => api.snapshot(), apply: (v) => api.apply(v), hz: 4 }));
    netOffs.push(net.registerState('police', {
      snapshot: () => packUnits(units),
      apply: (v) => units.applyNet(unpackUnits(v, { maxCruisers: units.cruisers.length, maxOfficers: units.officers.length })),
      hz: 8,
    }));
    for (const n of ['wantedLevel', 'wantedState', 'wantedTeach', 'wantedCaught', 'wantedEscaped']) netOffs.push(net.shareEvent(n));
  } catch (e) { console.error(e); }
  const HELD = new Set(['wantedCaught', 'wantedCell']);
  const holdLocal = (p, name) => { const h = p?.hero; if (h && p.local !== false && (!h.control || HELD.has(h.control.name))) { h.control = { name, camera: 'ground', update: () => false }; h.vel?.set?.(0, 0, 0); } };
  const releaseLocal = () => { for (const p of list()) if (p.local !== false && HELD.has(p.hero?.control?.name)) p.hero.control = null; };
  events.on('wantedState', (d) => {
    if (!d?.remote || !isReplica()) return;
    if (d.state === 'caught') holdLocal(d.player, 'wantedCaught');
    else if (d.state === 'custody') { holdLocal(d.player, 'wantedCell'); if (d.player?.local !== false) hud?.forPlayer?.(d.player)?.hint?.('Holding cell. Pick the lock: press <kbd>Punch</kbd> a few times.', 6000); }
    else releaseLocal();
  });
  for (const n of ['wantedEscaped', 'wantedCaught', 'wantedLevel']) events.on(n, (d) => {
    if (!d?.remote || !isReplica()) return;
    if (n === 'wantedCaught' && d.outcome !== 'warning') return; // the cell follows: still held
    if (n === 'wantedLevel' && d.level > 0) return;
    releaseLocal();
  });
  // A guest's own teaching cards (its save, its screen): the host only says which.
  events.on('wantedTeach', (d) => { if (d?.remote && isReplica() && TEACH[d.id]) teach(d.id); });
  updateVeto();
  return api;
}
