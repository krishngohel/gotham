// The Bruce Wayne side at runtime (workstream K): the Manor, the cave and Wayne Tower as lazily built
// pockets entered from their city door sites; playing as Bruce out of the suit; Alfred; the cave's
// stations; the training simulator; the Bruce-day scenes and days. Rules live in the pure modules
// (doubleLife.js, sceneMachine.js, calendar.js, days.js); this file renders them and wires them
// to the game. game.js constructs it once per run ([bruce] block) and calls update() every frame.
//
// PUBLIC (window.__game.bruce; the campaign joins through playDay / skipDay / nightStart):
//   life, state { inside, room, area, identity, scene }, clock
//   enterSite(siteId) / leaveTo(siteId) / enter(pocketId, entry)
//   becomeBruce(outfit?) / becomeBatman() / use(stationId)
//   playScene(id) -> Promise<SceneResult>   scene: the running scene ({ machine, def }) or null
//   playDay(slotId, { report, campaign }) -> Promise<DayResult>   skipDay(slotId, { report })
//   nightStart() -> how the next night starts (doubleLife.nightStart), applied to the heroes
//   nightReport() -> what this night has done so far (hits, finishers, crimes), for the next day
import * as THREE from 'three';
import { createBruceUI, changeText } from './ui.js';
import { createPockets, POCKETS, toWorld } from './pockets.js';
import { createCivilians } from './civilian.js';
import { createCast, alfredStation } from './cast.js';
import { createDayClock } from './clock.js';
import { createSceneMachine } from './sceneMachine.js';
import { SCENES, CAST } from './scenes.js';
import { planDay, slotFor } from './days.js';
import { generateWeek, clockText, makeCommitment } from './calendar.js';
import { headlines } from './newspaper.js';
import { pickLine, MANOR_THINGS } from './lines.js';
import {
  createDoubleLife, applyEffects, applyNight, dayDrift, nightStart, dayStart, suspicionEvents, useExcuse, injuryLook,
  patchUp, sleep, passTime, keepCommitment, missCommitment, rndBudget, sanitizeDoubleLife, threadRank, spendCredit,
  setLifeModifiers, // [verify]
} from './doubleLife.js';
import { bruceUI, batcomputerTabs, missionList } from './registry.js';
import { REGION_SITES, REGION_DATA } from '../world/regions/data.js';
import { SIM_ARENA, CAVE_TROPHIES, buildBats } from '../world/interiors/batcave.js';
import { trophyCoin, trophyDinosaur, trophyCard } from '../world/interiors/caveTrophies.js'; // [polish]
import { TOWER_FLOORS } from '../world/interiors/wayneTower.js';
import { loadStoryAnims, loadCivAnims, mergePackClips } from '../actors/animPacks.js';
import { composeWave } from '../enemies/compose.js';
import { ROLE_NAMES } from '../enemies/roleKit.js';
import { SUITS, suitUnlocked } from '../heroes/models/suits.js';
import { createBat } from '../actors/characters.js';
import { createBatmobile, createStreetVehicle } from '../vehicles/vehicleModels.js';
import { createBatcycle } from '../vehicles/models/heroBikes.js';
import { createBatwingModel } from '../vehicles/models/batwing.js';

// Where a scene starts the player (a station in its venue).
const SCENE_SPAWN = { gala: { x: 0, z: 13, yaw: 0 }, boardVote: { x: 40, z: 22.6, yaw: 0 }, clinic: { x: 66.5, z: 0, yaw: Math.PI / 2 }, pressConference: { x: 3, z: 1, yaw: Math.PI }, detectiveCalls: { x: 16, z: 22.4, yaw: Math.PI }, luciusBriefing: { x: -13, z: 32, yaw: Math.PI / 2 } };
const SIM_CHALLENGES = [
  { id: 'simBasics', name: 'Basics: strikes and counters', budget: 4, act: 1, tips: ['punch', 'counter', 'dodge'], medals: [45, 70, 110] },
  { id: 'simRoles', name: 'Read the room: shields and batons', budget: 7, act: 2, tips: ['cape', 'dodge', 'kick'], medals: [60, 95, 150] },
  { id: 'simGadgets', name: 'Gadget drill', budget: 6, act: 3, tips: ['gadgetWheel', 'batarang'], medals: [60, 100, 160] },
  { id: 'simGauntlet', name: 'The gauntlet', budget: 12, act: 4, tips: ['chain', 'special'], medals: [90, 140, 220] },
];
const MEDAL_NAMES = ['gold', 'silver', 'bronze'];
const OUTFITS = ['tux', 'suit', 'casual', 'training'];
const OUTFIT_LABEL = { tux: 'Black tie', suit: 'The board suit', casual: 'Casual (Alfred disagrees)', training: 'Training gear' };
const PORTRAIT = { alfred: 'alfred', gordon: 'gordon', bruce: 'radio', narrator: 'radio' };

// Root motion out of the walk clips the civilians loop (the pelvis keeps its bob, loses its drift).
function inPlace(clip) {
  const c = clip.clone();
  for (const t of c.tracks) {
    if (!t.name.endsWith('.position')) continue;
    const v = t.values, n = t.times.length;
    if (n < 2) continue;
    const dx = v[(n - 1) * 3] - v[0], dz = v[(n - 1) * 3 + 2] - v[2];
    const T = t.times[n - 1] - t.times[0] || 1;
    for (let i = 0; i < n; i++) { const k = (t.times[i] - t.times[0]) / T; v[i * 3] -= dx * k; v[i * 3 + 2] -= dz * k; }
  }
  return c;
}

export function createBruceLife(d) {
  const { scene, assets, world, events, hud, radio, combat, vehicles, batwing, progress, quality = {}, audio = null } = d;
  const players = () => d.players();
  const p0 = () => players()[0];
  if (!progress.bruce) progress.bruce = createDoubleLife();
  const life = progress.bruce;
  setLifeModifiers(() => d.game?.()?.wayne?.effects ?? null); // [verify] Alfred's Alibis, Night Nurse (Wayne skill nodes) reach the double life
  progress.batcave ??= { medals: {}, tutorial: [], trophies: [], suit: null };
  const save = () => d.save?.();
  const ui = createBruceUI(typeof document !== 'undefined' ? document.body : null);
  // [fix1] A real station (skill tree, gadget loadout, wardrobe, city map: registerBruceUI) is on
  // screen. ui.busy: any overlay, choice row or station is up (ui.overlayOpen only knows its own).
  let systemOpen = null;
  Object.defineProperty(ui, 'busy', { get: () => !!(ui.overlayOpen || ui.choicesOpen || systemOpen), configurable: true });
  Object.defineProperty(ui, 'systemOpen', { get: () => systemOpen, configurable: true });
  const pockets = createPockets({ scene, collision: world.collision, world, quality });
  const civ = createCivilians({ scene, assets, events, vehicles });
  const cast = createCast({ scene, assets, quality });
  const clock = createDayClock({ world, hour: 21, day: life.day });
  const key = (a) => d.keyFor?.(p0(), a) ?? `<kbd>${a}</kbd>`;
  const state = {
    inside: null, room: null, area: null, identity: 'batman', outfit: 'suit', scene: null, day: null, busy: false,
    station: null, hintT: 0, door: null, sim: null, rainWas: true, holdT: 0, metersT: 0, screenT: 0, night: { hits: 0, finishers: 0, crimesStopped: 0, crimesIgnored: 0, startHour: 21 },
    indoors: false, displays: {}, t: 0,
  };
  let packs = null;

  // ---------------- clips ----------------
  function loadPacks() {
    if (packs || typeof fetch !== 'function') return packs;
    const base = assets.base ?? './assets/';
    packs = Promise.all([loadStoryAnims({ base }), loadCivAnims({ base })].map((p) => p.catch(() => null))).then(([story, civp]) => {
      for (const p of [story, civp]) if (p) mergePackClips(assets.clips, p);
      for (const name of ['Civ_Walk_M', 'Civ_Walk_Hurried', 'Story_Limp', 'Story_Injured_Arm']) {
        const c = assets.clips.get(name);
        if (c) assets.clips.set(name, inPlace(c));
      }
      return true;
    });
    return packs;
  }

  // ---------------- identity ----------------
  // The vehicle key as Bruce: it enters a car he is standing by, never summons the Batmobile.
  const guardedInput = (src) => new Proxy(src, { get(t, k) {
    if (k === 'pressed') return (a) => (a === 'vehicle' ? t.pressed(a) && nearCar() : t.pressed(a));
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
  function nearCar() {
    const h = p0().hero;
    return (vehicles.streetCars ?? []).some((v) => v.group.visible && Math.hypot(v.group.position.x - h.pos.x, v.group.position.z - h.pos.z) < 5);
  }
  let driverSwap = null;
  function setDriverInput(guard) {
    const pl = p0();
    driverSwap = { hero: pl.hero, input: guard ? guardedInput(pl.input) : pl.input, follow: pl.view?.follow ?? d.follow };
  }
  function becomeBruce(outfit = state.outfit) {
    state.identity = 'bruce';
    state.outfit = outfit;
    const inj = injuryLook(life);
    civ.dress(p0(), 'bruce', { outfit, injuries: inj, limp: life.injuries.ribs > 0, speedK: life.fatigue > 70 ? 0.85 : 1 });
    for (const pl of players().slice(1)) civ.dress(pl, 'ward');
    setDriverInput(true);
    loadPacks();
    events.emit('bruceIdentity', { identity: 'bruce', outfit });
  }
  function becomeBatman() {
    state.identity = 'batman';
    for (const pl of players()) civ.undress(pl);
    setDriverInput(false);
    events.emit('bruceIdentity', { identity: 'batman' });
  }

  // ---------------- pockets: in and out ----------------
  function placeHeroes(w) {
    const list = players();
    list[0].hero.teleport({ x: w.x, y: w.y + 0.05, z: w.z }, w.yaw);
    list[0].view?.follow?.snapBehind?.(w.yaw);
    for (let i = 1; i < list.length; i++) {
      const s = i % 2 ? 1 : -1;
      list[i].hero.teleport({ x: w.x + Math.cos(w.yaw) * 1.4 * s, y: w.y + 0.05, z: w.z - Math.sin(w.yaw) * 1.4 * s }, w.yaw);
      list[i].view?.follow?.snapBehind?.(w.yaw);
    }
  }
  function setInside(id) {
    const was = state.inside;
    state.inside = id;
    if (id && !was) { state.rainWas = world.rain?.mesh?.visible ?? true; if (world.rain?.mesh) world.rain.mesh.visible = false; }
    if (!id && was && world.rain?.mesh) world.rain.mesh.visible = state.rainWas;
    state.indoors = !!id;
    musicFor();
    if (id !== was) events.emit(id ? 'bruceEnter' : 'bruceExit', { pocket: id ?? was });
  }
  function musicFor() {
    const f = d.flow?.();
    if (!f) return;
    const ctx = state.inside ? POCKETS[state.inside].music : null;
    if (ctx) f.musicContext = { context: ctx, source: 'bruce' };
    else if (f.musicContext?.source === 'bruce') f.musicContext = null;
  }
  function enter(pocketId, entry, { instant = false } = {}) {
    const go = () => {
      const rec = pockets.ensure(pocketId);
      if (!rec) return;
      const w = toWorld(pocketId, entry ?? POCKETS[pocketId].spawn);
      placeHeroes(w);
      setInside(pocketId);
      onPocketEntered(pocketId, rec);
    };
    if (instant) { go(); return Promise.resolve(); }
    return ui.through(go);
  }
  function enterSite(siteId) {
    const site = REGION_SITES[siteId];
    const e = pockets.entryFor(siteId, site);
    if (!e) return Promise.resolve(false);
    return enter(e.pocket.id, e.entry).then(() => true);
  }
  // Out to a city site, a few steps outside its door (yaw: the way the door faces).
  function leaveTo(siteId, { vehicle = null } = {}) {
    const s = REGION_SITES[siteId];
    if (!s) return Promise.resolve(false);
    return ui.through(() => {
      setInside(null);
      cast.dropAlfred();
      const yaw = s.yaw ?? 0;
      const step = siteId === 'batcaveMouth' ? 1.5 : 3;
      const out = { x: s.x + Math.sin(yaw) * step, y: s.y, z: s.z + Math.cos(yaw) * step };
      const g = world.collision.groundBelow(out.x, out.y + 3, out.z, 0.3);
      if (g > -Infinity) out.y = g;
      placeHeroes({ ...out, yaw });
      if (vehicle === 'batmobile') {
        // Out of the cave mouth onto the lake-shore track (the mouth itself opens onto the water).
        const c = siteId === 'batcaveMouth' ? { x: -412, z: -686.2, yaw: -Math.PI / 2 } : { x: out.x + Math.sin(yaw) * 4, z: out.z + Math.cos(yaw) * 4, yaw };
        const cg = world.collision.groundBelow(c.x, out.y + 4, c.z, 0.3);
        state.mouthCool = 8;
        vehicles.park({ x: c.x, y: cg > -Infinity ? cg : out.y, z: c.z, yaw: c.yaw }, { slide: false });
        vehicles.enter(vehicles.batmobile);
      } else if (vehicle === 'wayneCar') wayneCar(out, yaw);
    }).then(() => true);
  }
  // Bruce's own car out of the garage: a Wayne limousine he drives like any car.
  function wayneCar(at, yaw) {
    let car = state.displays.wayneCar;
    if (!car) {
      car = createStreetVehicle('limousine', { palette: 0 });
      car.radius = 2.8;
      car.kind = 'wayneCar';
      car.tuning = vehicles.streetCars?.[0]?.tuning;
      car.borrowed = false; car.traffic = false; car.knockT = 0;
      scene.add(car.group);
      vehicles.streetCars?.push(car);
      state.displays.wayneCar = car;
    }
    car.v = { speed: 0, yaw, drift: 0 };
    car.group.rotation.y = yaw;
    car.group.position.set(at.x + Math.sin(yaw) * 5, at.y, at.z + Math.cos(yaw) * 5);
    car.group.visible = true;
    if (car.tuning) vehicles.enter(car);
  }

  // City doors: the Bristol sites, the downtown cave door, Wayne Tower, the clinic.
  const DOORS = Object.entries(REGION_SITES).filter(([id, s]) => pockets.entryFor(id, s) && id !== 'wayneManorClockPassage').map(([id, s]) => ({ id, s, label: s.label ?? (id === 'wayneTowerLobby' ? 'Wayne Tower' : id === 'narrowsClinicDoor' ? 'The Foundation clinic' : id) }));
  function nearDoor(h) {
    for (const dr of DOORS) {
      const r = dr.s.kind === 'cave' ? 7 : dr.s.kind === 'window' ? 3 : 3.2;
      if (Math.hypot(h.pos.x - dr.s.x, h.pos.z - dr.s.z) < r && Math.abs(h.pos.y - dr.s.y) < (dr.s.kind === 'window' ? 4 : 3.5)) return dr;
    }
    return null;
  }

  // ---------------- arriving in a pocket ----------------
  function onPocketEntered(id, rec) {
    if (id === 'batcave') setupCave(rec);
    placeAlfred(id);
    const sky = rec.extras?.find((x) => x.name === 'manorSky');
    sky?.userData.setSignal?.(false);
    if (id === 'batcave' && !state.caveGreeted) { state.caveGreeted = true; say([{ s: 'alfred', t: pickLine('caveGreet', life) }]); }
  }
  function placeAlfred(id) {
    const st = alfredStation(id, clock.hour, { injured: Object.values(life.injuries).some((h) => h > 0) });
    if (!st) { cast.dropAlfred(); return; }
    const s = POCKETS[id].stations[st];
    const w = toWorld(id, { x: s.x + Math.sin(s.yaw ?? 0) * -1.2 + 0.8, y: s.y ?? 0, z: s.z + Math.cos(s.yaw ?? 0) * -1.2 + 0.6, yaw: (s.yaw ?? 0) + Math.PI });
    cast.alfredIn(id, w, id === 'batcave' ? 'shirtsleeves' : 'butler', id === 'batcave' ? 'medkit' : 'tray');
  }

  // ---------------- the cave's furniture that is live, not built geometry ----------------
  function setupCave(rec) {
    if (state.displays.caveReady) return;
    state.displays.caveReady = true;
    const O = POCKETS.batcave.origin;
    const rich = (quality.crowdDensity ?? 1) >= 0.5;
    // The Batmobile on its turntable (a display copy; the live car is the vehicles system's).
    const bmM = createBatmobile();
    const bm = bmM.group ?? bmM;
    bm.position.set(O.x, 0.2, O.z + 24);
    scene.add(bm);
    state.displays.turntable = bm;
    if (rich) {
      const cyM = createBatcycle(); const cy = cyM.group ?? cyM;
      cy.position.set(O.x - 11, 0.1, O.z + 22); cy.rotation.y = 0.6; scene.add(cy);
      const wgM = createBatwingModel(); const wg = wgM.group ?? wgM;
      wg.position.set(O.x + 30, 4.4, O.z - 20); wg.rotation.y = -Math.PI / 2; scene.add(wg);
    }
    // Suits on their stands: as many as the tier allows, unlocked ones first.
    const bat = SUITS.filter((s) => s.hero === 'batman');
    const shown = [...bat.filter((s) => suitUnlocked(s, progress)), ...bat.filter((s) => !suitUnlocked(s, progress))].slice(0, rich ? 4 : 2);
    shown.forEach((s, k) => {
      const ch = createBat(assets, s.id);
      ch.root.position.set(O.x - 24.6, 4.3, O.z - 13 + k * 4);
      ch.face(Math.PI / 2);
      ch.animator.play('Idle_Loop', { fade: 0 });
      ch.animator.update(0.5);
      scene.add(ch.root);
    });
    // Trophies the story has earned.
    const tro = [];
    const t = (geo, color, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color })); m.position.set(O.x + x, y, O.z + z); m.rotation.y = ry; scene.add(m); tro.push(m); return m; };
    const earned = trophiesEarned();
    // [polish] Proper trophies (src/world/interiors/caveTrophies.js), each turned to the hall.
    const put = (m, x, y, z, ry, sc = 1) => { m.position.set(O.x + x, y, O.z + z); m.rotation.y = ry; m.scale.setScalar(sc); scene.add(m); tro.push(m); return m; };
    if (earned.includes('coin')) put(trophyCoin(), -41, 3.0, -12, Math.PI / 2 - 0.25);
    if (earned.includes('dinosaur')) put(trophyDinosaur(), -38.2, 0.5, -2, -0.15, 0.55);
    if (earned.includes('card')) put(trophyCard(), -41, 2.6, -18, Math.PI / 2 - 0.12);
    void t;
    state.displays.trophies = tro;
    // Bats under the roof.
    const n = Math.max(6, Math.round((quality.swarmBats ?? 160) / 10));
    const bats = buildBats(n);
    bats.position.set(O.x, 0, O.z);
    scene.add(bats);
    state.displays.bats = { mesh: bats, n, m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) };
    state.displays.screen = rec.extras?.find((x) => x.name === 'batcomputerScreen') ?? null;
  }
  function trophiesEarned() {
    const out = [...(progress.batcave.trophies ?? [])];
    if ((progress.step ?? 0) > 20 && !out.includes('dinosaur')) out.push('dinosaur');
    if (progress.finished && !out.includes('card')) out.push('card');
    if (life.flags['boss.twoFace'] && !out.includes('coin')) out.push('coin');
    return out;
  }

  // ---------------- speech ----------------
  function nameOf(s) { return s === 'bruce' ? 'Bruce' : s === 'alfred' ? 'Alfred' : s === 'narrator' ? '' : CAST[s]?.name ?? s; }
  function say(lines) {
    if (!lines?.length) return Promise.resolve();
    const out = lines.map((l) => ({ speaker: nameOf(l.s), portrait: PORTRAIT[l.s] ?? 'radio', text: l.t }));
    return radio?.say?.(out) ?? Promise.resolve();
  }

  // ---------------- overlays: pause the game while one is open ----------------
  function overlay(html, opts = {}) {
    d.pause?.();
    return ui.overlay(html, { ...opts, onClose: () => { opts.onClose?.(); d.resume?.(); } });
  }

  // ---------------- stations ----------------
  function stationsHere() {
    if (!state.inside) return [];
    return Object.values(POCKETS[state.inside].stations);
  }
  function nearestStation(h) {
    if (!state.inside) return null;
    const O = POCKETS[state.inside].origin;
    let best = null, bd = Infinity;
    for (const s of stationsHere()) {
      if (s.kind === 'mark') continue;
      const dd = Math.hypot(h.pos.x - (O.x + s.x), h.pos.z - (O.z + s.z));
      if (dd < (s.r ?? 1.6) + 0.4 && Math.abs(h.pos.y - (O.y + (s.y ?? 0))) < 2 && dd < bd) { bd = dd; best = s; }
    }
    return best;
  }
  async function use(id) {
    const s = POCKETS[state.inside]?.stations[id] ?? Object.values(POCKETS).map((p) => p.stations[id]).find(Boolean);
    if (!s) return false;
    const h = STATION[s.kind];
    if (!h) return false;
    await h(s);
    events.emit('bruceStation', { id, kind: s.kind });
    return true;
  }
  const thing = (s) => say([{ s: 'bruce', t: pick(MANOR_THINGS[s.thing] ?? ['...']) }]);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const STATION = {
    thing,
    mark: () => {},
    // ---- the Manor ----
    clockPassage: () => ui.through(() => { const rec = pockets.ensure('batcave'); placeHeroes(toWorld('batcave', POCKETS.batcave.entries.wayneManorClockPassage)); setInside('batcave'); onPocketEntered('batcave', rec); }),
    lift: () => ui.through(() => { const rec = pockets.ensure('wayneManor'); placeHeroes(toWorld('wayneManor', POCKETS.wayneManor.entries.wayneManorClockPassage)); setInside('wayneManor'); onPocketEntered('wayneManor', rec); }),
    phone: () => say(phoneMessages()),
    calendar: () => openCalendar(),
    newspaper: () => openPaper(),
    alfred: () => talkToAlfred(),
    wardrobe: () => openWardrobe(),
    bed: () => rest(),
    car: () => { if (state.identity !== 'bruce') becomeBruce(state.outfit); return leaveTo('wayneManorGarage', { vehicle: 'wayneCar' }); },
    // ---- Wayne Tower ----
    liftPanel: () => openLift(),
    // ---- the cave ----
    batcomputer: () => openBatcomputer('city'),
    suitVault: () => (bruceUI('suits') ? openSystem('suits') : openVault()), // [fix1] the real wardrobe when there is one
    suitUp: () => suitUp(),
    lockers: () => openLockers(),
    workbench: () => openSystem('gadgets'),
    skillTree: () => openSystem('skillTree'),
    batwing: () => launchBatwing(),
    vehicleBay: () => driveOut(),
    batcycle: () => say([{ s: 'alfred', t: 'Lucius says the bike needs another week. He said the same thing last week, and the week before.' }]),
    medbay: () => medbay(),
    trophy: (s) => say([{ s: 'bruce', t: trophiesEarned().includes(s.trophy) ? `${CAVE_TROPHIES[s.trophy].label}. I remember every one of them.` : 'An empty plinth. Alfred keeps it dusted, just in case.' }]),
    sim: () => openSim(),
    tunnel: () => leaveTo('batcaveDowntown'),
  };

  function phoneMessages() {
    const out = [];
    if (life.threads.lucius >= 2) out.push({ s: 'lucius', t: '(voicemail) The new parts are in. Please do not test them on a building.' });
    if (life.threads.love >= 1.5) out.push({ s: 'love', t: '(voicemail) You owe me a dinner. Not a gala. A dinner, with chairs, that you stay in.' });
    if (life.suspicion.reporter >= 30) out.push({ s: 'reporter', t: '(voicemail) Nadia Kerr, Gazette. Just checking on your sailing. And your polo. And your cat.' });
    if (!out.length) out.push({ s: 'bruce', t: pick(MANOR_THINGS.phone) });
    return out;
  }
  function talkToAlfred() {
    if (life.flags.alfredBreak && !life.flags.alfredHeard) {
      life.flags.alfredHeard = true;
      save();
      return say([{ s: 'alfred', t: pickLine('breaking', life) }]);
    }
    say([{ s: 'alfred', t: pickLine(Object.values(life.injuries).some((h) => h > 0) ? 'morning' : 'kitchen', life) }]);
    ui.choose('Alfred, a tea towel over one arm.', [
      { id: 'honest', tag: 'honest', text: 'Last night was bad. I should have been faster.' },
      { id: 'thanks', tag: 'charm', text: 'Thank you. For all of it.' },
      { id: 'notNow', tag: 'deflect', text: 'Not now, Alfred.' },
    ], (id) => {
      ui.hideChoices();
      const eff = id === 'honest' ? { threads: { alfred: 0.4 }, patience: 6 } : id === 'thanks' ? { threads: { alfred: 0.3 }, patience: 10 } : { threads: { alfred: -0.2 }, patience: -4 };
      ui.changes(applyEffects(life, eff, id === 'notNow' ? 'brushed Alfred off' : 'talked to Alfred'));
      save();
      say([{ s: 'alfred', t: id === 'honest' ? 'Faster would have been worse, sir. You came home. Start there.' : id === 'thanks' ? 'Good heavens. Sit down, you must be concussed.' : 'Of course, sir. Not now. It is never now.' }]);
    });
  }
  function openPaper() {
    const hs = headlines(life);
    overlay(`<h2>THE GOTHAM GAZETTE</h2><div class="paper">${hs.map((h, i) => `<div class="${i ? '' : 'front'}"><div class="head" style="font-size:${i ? 22 : 36}px">${ui.esc(h.head)}</div><div class="sub">${ui.esc(h.sub)}</div></div>`).join('')}</div>`);
  }
  function openWardrobe() {
    overlay(`<h2>The wardrobe</h2><p>What does today need? Clothes matter: black tie at a gala, a suit at the board, something with a collar for a detective.</p><p class="note">Injuries show in anything but a high collar. Alfred has opinions about all of it.</p>`, {
      buttons: OUTFITS.map((o) => ({ label: OUTFIT_LABEL[o], onClick: () => { ui.closeOverlay(); becomeBruce(o); } })).concat(state.identity === 'bruce' ? [] : []),
    });
  }
  function rest() {
    // [fix1] The story holds the hour (a night in progress, a Bruce day's scene): a skip would move
    // the clock underneath while the hour on screen stayed put. Say no instead of doing nothing.
    if (clock.heldBy(['settings']).some((id) => id.startsWith('story:'))) return say([{ s: 'alfred', t: 'Bed, sir? The city has other plans for tonight. The sheets will keep.' }]);
    return ui.through(() => {
      const h = clock.hour;
      const hours = h >= 8 ? 24 - h + 8 : 8 - h;
      ui.changes(sleep(life, Math.min(10, hours)));
      clock.skipTo(8);
      p0().hero.health = p0().hero.maxHealth;
      save();
    }).then(() => say([{ s: 'alfred', t: pickLine('morning', life) }]));
  }
  function openLift() {
    const here = state.room;
    overlay('<h2>Wayne Tower</h2><p>Which floor, Mr. Wayne?</p>', {
      buttons: Object.entries(TOWER_FLOORS).filter(([id]) => id !== here).map(([id, f]) => ({ label: f.label, onClick: () => { ui.closeOverlay(); ui.through(() => placeHeroes(toWorld('wayneTower', { x: f.x, y: 0, z: f.z, yaw: f.yaw }))); } })),
    });
  }
  // The two calendars, side by side: what Bruce has promised and what the city is doing.
  function weekNow() { return state.day?.plan ? [state.day.plan.calendar, ...generateWeek({ seed: 77 + life.day, days: 6, act: state.day.plan.slot.act, cityHeat: 1 - life.city / 100, startDay: life.day + 1 })] : generateWeek({ seed: 77 + life.day, days: 7, act: 2, cityHeat: 1 - life.city / 100, startDay: life.day }); }
  function calendarHtml() {
    const week = weekNow();
    const rows = week.map((day) => {
      const cs = day.commitments.map((c) => `${clockText(c.hour)} ${ui.esc(c.title)}`).join('<br>');
      const es = day.emergencies.map((e) => `${clockText(e.hour)} ${ui.esc(e.label)} (${ui.esc(e.district)})`).join('<br>');
      const clash = day.collisions.length ? `<span class="hot">${day.collisions.length} clash${day.collisions.length > 1 ? 'es' : ''}</span>` : '<span class="ok">clear</span>';
      return `<tr><td>Day ${day.day + 1}</td><td>${cs}</td><td>${es}</td><td>${clash}</td></tr>`;
    }).join('');
    return `<table><tr><th></th><th>Wayne</th><th>Batman</th><th></th></tr>${rows}</table>`;
  }
  function openCalendar() {
    const btns = [];
    const sc = state.day?.scene;
    if (sc && !state.scene) btns.push({ label: `Go now: ${sc.title} (${clockText(sc.hour)})`, onClick: () => { ui.closeOverlay(); startDayScene(); } });
    if (!state.day && !state.scene) for (const id of Object.keys(SCENES)) if (!life.scenes[id]) { btns.push({ label: `Play: ${SCENES[id].title}`, onClick: () => { ui.closeOverlay(); playScene(id); } }); if (btns.length >= 3) break; }
    overlay(`<h2>The diary</h2><p class="note">One clock, two calendars. ${clockText(clock.hour)}, day ${clock.day + 1}.</p>${calendarHtml()}`, { buttons: btns });
  }
  function openSystem(id) {
    const open = bruceUI(id);
    // [fix1] One close per opening (the station's Back, Esc or pad B), then live play again.
    if (open) {
      const mine = {};
      systemOpen = id;
      const close = () => { if (mine.done) return; mine.done = true; if (systemOpen === id) systemOpen = null; d.resume?.(); };
      d.pause?.();
      try { open({ game: d.game?.(), life, close }); } catch (e) { console.warn(e); close(); }
      return;
    }
    const what = id === 'skillTree' ? 'the upgrade bench (the skill tree)' : 'the gadget workbench (loadout and upgrades)';
    overlay(`<h2>${id === 'skillTree' ? 'The upgrade bench' : 'The gadget workbench'}</h2><p>This is ${what}. The system behind it is being built by another team and plugs in here (registerBruceUI('${id}')).</p>
      <h3>What the Wayne side funds</h3><table><tr><td>Wayne credit (buys the Wayne branch)</td><td>${life.credit}</td></tr><tr><td>R&D budget this week</td><td>${rndBudget(life)}${life.rnd.frozen ? ' <span class="hot">(frozen)</span>' : ''}</td></tr><tr><td>Prototypes shipped</td><td>${life.rnd.shipped.join(', ') || 'none yet'}</td></tr></table>`, { cave: true });
  }

  // ---------------- the Batcomputer ----------------
  const DISTRICT_HEAT = () => {
    const base = 1 - life.city / 100;
    return Object.fromEntries(REGION_DATA.flatMap((r) => r.districts).map((dd, i) => [dd.id, Math.max(0, Math.min(1, base + Math.sin(i * 7.3 + life.day) * 0.25))]));
  };
  function drawCityMap(c) {
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.fillStyle = '#050a0e'; g.fillRect(0, 0, W, H);
    const all = REGION_DATA.map((r) => r.bounds);
    const minX = Math.min(...all.map((b) => b.minX)), maxX = Math.max(...all.map((b) => b.maxX)), minZ = Math.min(...all.map((b) => b.minZ)), maxZ = Math.max(...all.map((b) => b.maxZ));
    const sx = (x) => 10 + (x - minX) / (maxX - minX) * (W - 20), sz = (z) => 24 + (z - minZ) / (maxZ - minZ) * (H - 34);
    const heat = DISTRICT_HEAT();
    for (const r of REGION_DATA) {
      const h = heat[r.districts[0]?.id] ?? 0.3;
      g.fillStyle = `rgba(${Math.round(60 + h * 195)},${Math.round(120 - h * 80)},${Math.round(140 - h * 100)},0.55)`;
      g.fillRect(sx(r.bounds.minX), sz(r.bounds.minZ), sx(r.bounds.maxX) - sx(r.bounds.minX), sz(r.bounds.maxZ) - sz(r.bounds.minZ));
      g.strokeStyle = '#4fe3ff'; g.lineWidth = 1; g.strokeRect(sx(r.bounds.minX), sz(r.bounds.minZ), sx(r.bounds.maxX) - sx(r.bounds.minX), sz(r.bounds.maxZ) - sz(r.bounds.minZ));
    }
    g.fillStyle = '#4fe3ff'; g.font = '16px monospace';
    g.fillText(`GOTHAM  ${clockText(clock.hour)}  CITY ${Math.round(life.city)}  STANDING ${Math.round(life.standing)}`, 10, 16);
    for (const pl of players()) { const p = pl.hero.pos; if (p.x < 1500) { g.fillStyle = '#f2d24b'; g.beginPath(); g.arc(sx(p.x), sz(p.z), 4, 0, Math.PI * 2); g.fill(); } }
  }
  function openBatcomputer(tab) {
    const tabs = [['city', 'City'], ['calendar', 'Two calendars'], ['cases', 'Case files'], ['villains', 'Villain files'], ['missions', 'Missions'], ['news', 'News'], ...batcomputerTabs().filter(([id]) => !['cases', 'villains', 'missions'].includes(id)).map(([id, t]) => [id, t.label])];
    const reg = new Map(batcomputerTabs());
    let html = '';
    if (reg.has(tab)) html = reg.get(tab).render({ life, game: d.game?.() });
    else if (tab === 'city') {
      const heat = DISTRICT_HEAT();
      html = `<canvas width="760" height="300" id="bw-map"></canvas><table><tr><th>District</th><th>Heat</th><th>Status</th></tr>${REGION_DATA.flatMap((r) => r.districts).map((dd) => `<tr><td>${ui.esc(dd.label)}</td><td>${Math.round((heat[dd.id] ?? 0) * 100)}%</td><td>${(heat[dd.id] ?? 0) > 0.6 ? '<span class="hot">escalating</span>' : (heat[dd.id] ?? 0) > 0.35 ? 'restless' : '<span class="ok">quiet</span>'}</td></tr>`).join('')}</table>`;
    } else if (tab === 'calendar') html = calendarHtml();
    else if (tab === 'cases') { const cf = d.caseFile?.() ?? []; html = cf.length ? `<table>${cf.map((c) => `<tr><td>${c.done ? '<span class="ok">done</span>' : 'open'}</td><td>${ui.esc(c.text ?? c.label ?? '')}</td></tr>`).join('')}</table>` : '<p>No open cases. The detective chain plugs in here.</p>'; }
    else if (tab === 'villains') {
      const v = [['The Joker', progress.finished ? 'In Arkham. For now.' : 'At large'], ['Two-Face', life.flags['boss.twoFace'] ? 'Caught' : 'Splitting the Loop with the Penguin'], ['The Penguin', 'Runs the Iceberg Lounge'], ['Scarecrow', 'Testing something in the Narrows'], ['Firefly', 'The Yards smell of smoke'], ['Mr. Freeze', 'Unseen'], ['Poison Ivy', 'Unseen'], ['The Riddler', life.suspicion.villain > 40 ? '<span class="hot">Mapping your routes</span>' : 'Leaving puzzles'], ['Black Mask', 'Funding all of them']];
      html = `<table>${v.map(([n, s]) => `<tr><td>${n}</td><td>${s}</td></tr>`).join('')}</table>`;
    } else if (tab === 'missions') {
      const list = missionList({ life, game: d.game?.() });
      html = list === null ? '<p>The campaign\'s mission select plugs in here (registerMissionProvider). Tonight\'s start, from the Wayne side:</p>' + nightStartHtml() : list.map((m) => `<h3>${ui.esc(m.title)}</h3><p>${ui.esc(m.blurb ?? '')}</p>`).join('') || '<p>Nothing on the board tonight.</p>';
    } else if (tab === 'news') html = headlines(life).map((h) => `<h3>${ui.esc(h.head)}</h3><p>${ui.esc(h.sub)}</p>`).join('');
    const buttons = tabs.map(([id, label]) => ({ label, cls: id === tab ? 'on' : '', onClick: () => { ui.closeOverlay(); openBatcomputer(id); } }));
    // [fix1] The city tab opens the real map (waypoints, fast travel) when the map station exists.
    if (tab === 'city' && bruceUI('cityMap')) buttons.push({ label: 'Full map', onClick: () => { ui.closeOverlay(); openSystem('cityMap'); } });
    if (tab === 'missions') for (const m of missionList({ life, game: d.game?.() }) ?? []) buttons.push({ label: `Start: ${m.title}`, onClick: () => { ui.closeOverlay(); m.start?.(); } });
    const p = overlay(`<h2>BATCOMPUTER</h2>${html}`, { cave: true, buttons });
    const c = p?.querySelector?.('#bw-map');
    if (c) drawCityMap(c);
  }
  function nightStartHtml() { const n = nightStart(life); return `<ul>${n.notes.map((x) => `<li>${ui.esc(x)}</li>`).join('') || '<li>Nothing in the way tonight.</li>'}</ul>`; }

  // ---------------- the vault, suiting up, lockers ----------------
  function openVault() {
    const bat = SUITS.filter((s) => s.hero === 'batman');
    const chosen = progress.batcave.suit ?? progress.suit ?? 'm';
    overlay(`<h2>The suit vault</h2><p>Tonight's suit: <b>${ui.esc(bat.find((s) => s.id === chosen)?.name ?? 'The Bat')}</b>. Alfred lays it out for the next suit-up; it goes on when the night is loaded.</p>
      <table>${bat.map((s) => `<tr><td>${ui.esc(s.name)}</td><td>${ui.esc(s.desc)}</td><td>${suitUnlocked(s, progress) ? '<span class="ok">ready</span>' : `<span class="hot">${ui.esc(s.unlock?.text ?? 'locked')}</span>`}</td></tr>`).join('')}</table>`, {
      cave: true,
      buttons: bat.filter((s) => suitUnlocked(s, progress)).map((s) => ({ label: s.name, cls: s.id === chosen ? 'on' : '', onClick: () => { progress.batcave.suit = s.id; progress.suit = s.id; save(); events.emit('suitChosen', { suit: s.id }); ui.closeOverlay(); openVault(); } })),
    });
  }
  function suitUp() {
    if (state.identity === 'batman') return say([{ s: 'alfred', t: 'You are already wearing it, sir. I would have noticed.' }]);
    return ui.through(() => { becomeBatman(); applyNightStart(); }).then(() => say([{ s: 'alfred', t: pickLine('suitUp', life) }]));
  }
  function openLockers() {
    const partner = players()[1];
    overlay(`<h2>The partner lockers</h2><p>${partner ? 'Your partner\'s gear is here, cleaned and mended. They suit up with you.' : 'Three lockers: blue, red and gold. A second player joins from the pause menu (or Start on a controller) and gears up here.'}</p>`, { cave: true });
  }
  function launchBatwing() {
    if (state.identity === 'bruce') becomeBatman();
    return leaveTo('batcaveMouth').then(() => {
      const h = p0().hero;
      h.teleport({ x: h.pos.x, y: h.pos.y + 45, z: h.pos.z }, h.bat.yaw);
      h.vel.set(Math.sin(h.bat.yaw) * 18, 0, Math.cos(h.bat.yaw) * 18);
      h.grounded = false; h.setState('air'); h.airT = 0.5;
      h.startGlide?.();
      setTimeout(() => batwing?.call?.(), 120);
    });
  }
  function driveOut() {
    const out = () => leaveTo('batcaveMouth', { vehicle: 'batmobile' }).then(() => { events.emit('word', { text: 'VRRROOOM!', pos: p0().hero.pos.clone().setY(p0().hero.pos.y + 2), big: true }); events.emit('bruceDriveOut', {}); });
    if (state.identity === 'bruce') { becomeBatman(); applyNightStart(); }
    return out();
  }
  function medbay() {
    const r = patchUp(life);
    const h = p0().hero;
    h.health = h.maxHealth;
    cast.moveAlfred(toWorld('batcave', { x: -29, y: 0, z: 13.5, yaw: -Math.PI / 2 }));
    if (cast.alfred) { cast.alfred.rec.mood = 'tend'; setTimeout(() => { if (cast.alfred) cast.alfred.rec.mood = 'idle'; }, 4000); }
    if (r.healed) { ui.changes(r.changes); civ.setInjuries(p0(), injuryLook(life)); save(); }
    return say([{ s: 'alfred', t: r.healed ? pickLine('patchUp', life) : 'Nothing to stitch tonight, sir. I find I almost miss it.' }]);
  }

  // ---------------- the training simulator ----------------
  function openSim() {
    if (state.sim) return say([{ s: 'alfred', t: 'One simulation at a time, sir.' }]);
    const med = progress.batcave.medals;
    overlay(`<h2>Training simulator</h2><p>Holographic goons, real bruises. Each drill doubles as a lesson: the moves it teaches come up as you fight.</p><table>${SIM_CHALLENGES.map((c) => `<tr><td>${ui.esc(c.name)}</td><td>${med[c.id] ? `<span class="ok">${med[c.id]}</span>` : '-'}</td><td>gold under ${c.medals[0]}s</td></tr>`).join('')}</table>`, {
      cave: true, buttons: SIM_CHALLENGES.map((c) => ({ label: c.name, onClick: () => { ui.closeOverlay(); startSim(c.id); } })),
    });
  }
  function startSim(id) {
    const c = SIM_CHALLENGES.find((x) => x.id === id);
    if (!c || !d.spawn) return false;
    if (state.identity === 'bruce') becomeBatman();
    const O = POCKETS.batcave.origin;
    const wave = composeWave({ budget: c.budget, act: c.act, players: players().length, rng: { next: Math.random } }).list.filter((e) => ROLE_NAMES.includes(e.type));
    const n = Math.max(2, wave.length);
    const enemies = wave.map((e, i) => {
      const a = (i / n) * Math.PI * 2;
      return d.spawn(e.type, { x: O.x + SIM_ARENA.x + Math.cos(a) * (SIM_ARENA.r - 2), y: SIM_ARENA.y, z: O.z + SIM_ARENA.z + Math.sin(a) * (SIM_ARENA.r - 2) });
    });
    placeHeroes(toWorld('batcave', { x: SIM_ARENA.x, y: SIM_ARENA.y, z: SIM_ARENA.z, yaw: 0 }));
    combat.setEnemies(enemies);
    for (const e of enemies) e.wake?.();
    state.sim = { id, c, enemies, t: 0, hurt: 0 };
    d.prompts?.show?.(c.tips);
    events.emit('word', { text: 'SIM ONLINE', pos: p0().hero.pos.clone().setY(p0().hero.pos.y + 2.5), big: true });
    events.emit('fightStart', { sim: true });
    return true;
  }
  function updateSim(dt) {
    const s = state.sim;
    if (!s) return;
    s.t += dt;
    if (s.enemies.some((e) => e.alive)) return;
    const medal = s.t <= s.c.medals[0] ? 'gold' : s.t <= s.c.medals[1] ? 'silver' : s.t <= s.c.medals[2] ? 'bronze' : null;
    const prev = progress.batcave.medals[s.id];
    if (medal && (!prev || MEDAL_NAMES.indexOf(medal) < MEDAL_NAMES.indexOf(prev))) progress.batcave.medals[s.id] = medal;
    for (const e of s.enemies) d.despawn?.(e);
    combat.setEnemies([]);
    state.sim = null;
    save();
    hud.card?.(`SIMULATION ${medal ? medal.toUpperCase() : 'COMPLETE'}`, `${s.c.name}: ${Math.round(s.t)} s.`, 4000);
    events.emit('bruceSimDone', { id: s.id, medal, t: s.t });
    say([{ s: 'alfred', t: pickLine('trainingDone', life) }]);
  }

  // ---------------- the night's report and how the next night starts ----------------
  events.on('heroHurt', () => { state.night.hits += 1; });
  events.on('critical', () => { state.night.finishers += 1; });
  events.on('crimeStopped', () => { state.night.crimesStopped += 1; });
  // [verify] Nothing ever emitted 'crimeExpired': the crime runtime ends a crime with crimeEnd { outcome }.
  // A crime she was told about (discovered) and let run out is the one the papers count as ignored.
  events.on('crimeEnd', ({ outcome, discovered, remote } = {}) => { if (!remote && outcome === 'expired' && discovered) state.night.crimesIgnored += 1; });
  // [wanted] Police attention feeds the double life through the public effects shape (src/wanted/wanted.js):
  // suspicion from a witnessed quick change or a traffic stop, Gordon's thread after a pursuit, a ticket's Standing.
  events.on('bruceEffects', ({ effects, reason } = {}) => { if (effects) { applyEffects(life, effects, reason ?? 'police'); save(); } });
  function nightReport() { return { endHour: clock.hour < 12 ? clock.hour : 2, hits: state.night.hits, finishers: state.night.finishers, crimesStopped: state.night.crimesStopped, crimesIgnored: state.night.crimesIgnored, district: world.districtAt?.(p0().hero.pos.x, p0().hero.pos.z) ?? null }; }
  function applyNightStart() {
    const ns = nightStart(life);
    for (const pl of players()) {
      const h = pl.hero;
      h.bruceBaseMax ??= h.maxHealth;
      h.maxHealth = Math.round(h.bruceBaseMax * ns.healthK);
      h.health = Math.min(h.health, h.maxHealth);
      h.staminaRegenK = ns.staminaRegenK; // read by hero.js (flight stamina) and wayneTech (health regen) [verify]
    }
    events.emit('bruceNightStart', ns);
    if (ns.notes.length && ns.alfredOnComms) say([{ s: 'alfred', t: `Before you go: ${ns.notes[0]}` }]);
    // A tail you can see: an unmarked car with its lights off, waiting at the Manor gates.
    const gates = REGION_SITES.wayneManorGates;
    if (ns.tail && gates && !state.displays.tailCar) {
      const car = createStreetVehicle('sedan', { color: 0x1a1c22 });
      const gy = world.collision.groundBelow(gates.x + 12, gates.y + 4, gates.z + 6, 0.3);
      car.group.position.set(gates.x + 12, gy > -Infinity ? gy : gates.y, gates.z + 6);
      car.group.rotation.y = -Math.PI / 2;
      scene.add(car.group);
      state.displays.tailCar = car;
    } else if (!ns.tail && state.displays.tailCar) { scene.remove(state.displays.tailCar.group); state.displays.tailCar = null; }
    state.night = { hits: 0, finishers: 0, crimesStopped: 0, crimesIgnored: 0, startHour: clock.hour };
    return ns;
  }

  // ---------------- scenes ----------------
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.08, 6, 24).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2d24b }));
  marker.visible = false;
  scene.add(marker);
  async function playScene(id, { fromDay = null } = {}) {
    const def = SCENES[id];
    if (!def || state.scene) return null;
    loadPacks();
    await ui.through(() => {
      const rec = pockets.ensure(def.venue.pocket);
      const st = SCENE_SPAWN[id] ?? POCKETS[def.venue.pocket].spawn;
      placeHeroes(toWorld(def.venue.pocket, { x: st.x, y: 0, z: st.z, yaw: st.yaw ?? 0 }));
      setInside(def.venue.pocket);
      onPocketEntered(def.venue.pocket, rec);
      becomeBruce(def.outfit);
      clock.skipTo(def.hour);
      clock.pin(def.hour, { id: 'bruce:scene' });
      world.weather?.pin?.(def.venue.pocket === 'wayneManor' ? 'rain' : 'overcast', { id: 'bruce:scene', snap: true });
      cast.clear('scene'); cast.clear('guests');
      for (const c of def.cast) {
        const s = POCKETS[def.venue.pocket].stations[c.at];
        cast.person(c.id, CAST[c.id].look, toWorld(def.venue.pocket, s), s.yaw ?? 0, { name: CAST[c.id].name, mood: c.id === 'patient' ? 'sit' : 'talk' });
      }
      // [polish] The gala: conversation groups round the dance floor, the band, two waiters.
      if (id === 'gala') cast.guests(toWorld('wayneManor', { x: 0, y: 0, z: 23 }), { n: 12, radius: 6.4, band: (quality.crowdDensity ?? 1) >= 0.5 ? (p) => toWorld('wayneManor', p) : null, waiters: (quality.crowdDensity ?? 1) >= 0.5 ? [toWorld('wayneManor', { x: -3.2, y: 0, z: 16.8, yaw: 0.6 }), toWorld('wayneManor', { x: 4.4, y: 0, z: 27.8, yaw: -2.4 })] : [] });
      if (id === 'pressConference') cast.guests(toWorld('wayneTower', { x: 0, y: 0, z: 1 }), { n: 6, radius: 3, seed: 3 });
      if (id === 'boardVote') cast.guests(toWorld('wayneTower', { x: 41, y: 0, z: 26 }), { n: 5, radius: 4, seed: 5 });
    });
    const m = createSceneMachine(def, { life, outfit: def.outfit, coop: players().length > 1 }).start();
    const run = { m, def, seen: null, speaking: false, shown: 0, fromDay, resolve: null, assistKey: false };
    state.scene = run;
    
    events.emit('bruceSceneStart', { id });
    return new Promise((res) => { run.resolve = res; });
  }
  function speak(lines) {
    const run = state.scene;
    if (!run || !lines?.length) return;
    run.speaking = true;
    say(lines);
  }
  function onNode(run) {
    const { m } = run;
    const n = m.node;
    ui.hideChoices();
    ui.goal(null);
    marker.visible = false;
    if (n.type === 'line' || n.type === 'event') {
      if (n.type === 'event') sceneEvent(n.event);
      speak(n.lines);
      run.lineNode = true;
      if (!n.lines?.length) run.speaking = false;
    } else if (n.type === 'choice') {
      
      ui.choose(n.prompt, m.options(), (id) => { ui.hideChoices(); m.choose(id); });
    } else if (n.type === 'pressure') {
      
      speak(n.lines);
      showPressure(run);
    } else if (n.type === 'goto') {
      
      const st = POCKETS[run.def.venue.pocket].stations[n.target.station];
      const w = toWorld(run.def.venue.pocket, st);
      marker.position.set(w.x, w.y + 0.1, w.z);
      marker.visible = true;
      ui.goal(n.prompt);
    } else if (n.type === 'inspect') {
      showInspect(run);
    }
  }
  function showPressure(run) {
    const { m } = run;
    const n = m.node;
    const opts = [{ id: 'stay', tag: 'stay', text: n.stay.text }, { id: 'slip', tag: 'slip away', text: n.slip.text }];
    if (n.cover) opts.push({ id: 'cover', tag: 'Alfred', text: `Alfred, cover for me (+${n.cover.seconds}s, his patience)`, ok: m.canCover(), reason: m.canCover() ? '' : 'He has nothing left to give' });
    ui.choose(n.prompt, opts, (id) => {
      if (id === 'cover') { if (m.cover()) { ui.changes(m.changes.slice(-2)); showPressure(run); } return; }
      ui.hideChoices();
      if (id === 'stay') m.stay(); else m.slip();
    }, { left: m.timer, max: m.timerMax });
  }
  function showInspect(run) {
    const { m } = run;
    const n = m.node;
    ui.choose(`${n.prompt}${n.seconds ? ' (quietly: time is passing)' : ''}`, n.spots.map((s) => ({ id: s.id, tag: m.found.includes(s.id) ? 'seen' : 'look', text: s.label, ok: !m.found.includes(s.id) })), (id) => {
      ui.hideChoices();
      m.inspect(id);
      if (m.node === n) setTimeout(() => { if (state.scene === run && m.node === n && !run.speaking) showInspect(run); }, 50);
    }, n.seconds ? { left: m.timer, max: m.timerMax } : null);
  }
  function sceneEvent(ev) {
    const h = p0().hero;
    const word = (text) => events.emit('word', { text, pos: h.pos.clone().setY(h.pos.y + 2.2), big: true });
    if (ev === 'batsignal') {
      const rec = pockets.record('wayneManor');
      rec?.extras?.find((x) => x.name === 'manorSky')?.userData.setSignal?.(true);
      for (const r of cast.people) if (r.group === 'guests') r.faceTo = toWorld('wayneManor', { x: 0, y: 0, z: 40 });
      word('!');
    } else if (ev === 'phone') { word('BZZT BZZT'); audio?.play?.('radioCrackle'); }
    else if (ev === 'caveAlarm') { word('BEEP... BEEP...'); audio?.play?.('radioCrackle'); }
    else if (ev === 'scanner') word('KSSHHT');
    else if (ev === 'toast') { const f = civ.of(p0())?.figure; f?.animator.play(f.animator.has('Story_Drink') ? 'Story_Drink' : 'Yes', { once: true, fade: 0.2 }); word('TING TING'); }
    events.emit('bruceEvent', { kind: ev });
  }
  function sceneTick(dt) {
    const run = state.scene;
    if (!run) return;
    const { m } = run;
    // Cause -> effect as it happens: the ticker, and big swings float over Bruce's head.
    if (m.changes.length > run.shown) {
      const fresh = m.changes.slice(run.shown);
      run.shown = m.changes.length;
      ui.changes(fresh);
      for (const c of fresh) if ((c.what === 'standing' || c.what === 'city') && Math.abs(c.delta) >= 4) events.emit('word', { text: `${c.delta > 0 ? '+' : ''}${Math.round(c.delta)} ${c.what.toUpperCase()}`, pos: p0().hero.pos.clone().setY(p0().hero.pos.y + 2.6), big: false });
      save();
    }
    if (run.speaking) { if (radio?.playing) return; run.speaking = false; }
    if (m.said?.length) { const s = m.said; m.said = []; speak(s); return; }
    if (m.done) { finishScene(run); return; }
    if (m.nodeId !== run.seen) { run.seen = m.nodeId; onNode(run); return; }
    const n = m.node;
    if (n.type === 'line' || n.type === 'event') { if (!run.speaking) m.next(); return; }
    if (n.type === 'pressure') {
      m.tick(dt);
      if (m.node === n) ui.timer(m.timer, m.timerMax);
      // The partner's light participation: their ping key makes a scene (a dropped tray) once.
      const pl = players()[1];
      if (pl && pl.input?.pressed?.('ping') && m.assist()) { ui.changes(m.changes.slice(-1)); events.emit('word', { text: 'CRASH!', pos: pl.hero.pos.clone().setY(pl.hero.pos.y + 2), big: true }); showPressure(run); }
    } else if (n.type === 'goto') {
      m.tick(dt);
      const st = POCKETS[run.def.venue.pocket].stations[n.target.station];
      const w = toWorld(run.def.venue.pocket, st);
      marker.rotation.y += dt * 2;
      if (n.seconds) ui.goal(`${n.prompt}  ${Math.ceil(m.timer)}s`);
      const reached = players().some((pl) => Math.hypot(pl.hero.pos.x - w.x, pl.hero.pos.z - w.z) < (st.r ?? 1.6) && Math.abs(pl.hero.pos.y - w.y) < 2);
      if (reached) m.reach(n.target.id);
      const pl = players()[1];
      if (pl && pl.input?.pressed?.('ping') && m.assist()) ui.changes(m.changes.slice(-1));
    } else if (n.type === 'inspect') {
      m.tick(dt);
      if (m.node === n && n.seconds) ui.timer(m.timer, m.timerMax);
    }
  }
  function finishScene(run) {
    if (run.finished) return;
    run.finished = true;
    const { m, def } = run;
    ui.hideChoices(); ui.goal(null); marker.visible = false;
    const end = m.node;
    const ns = nightStart(life);
    // Seeing it through counts as keeping the commitment; slipping away already cost what it cost.
    if (def.commitment && m.outcome !== 'slip') keepCommitment(life, makeCommitment(def.commitment, life.day));
    save();
    const result = { scene: def.id, outcome: m.outcome, ending: m.nodeId, changes: m.changes, nightStart: ns };
    const finish = () => {
      cast.clear('scene'); cast.clear('guests');
      pockets.record('wayneManor')?.extras?.find((x) => x.name === 'manorSky')?.userData.setSignal?.(false);
      state.scene = null;
      clock.unpin('bruce:scene');
      world.weather?.unpin?.('bruce:scene');
      events.emit('bruceSceneEnd', result);
      run.resolve?.(result);
    };
    const lines = end.lines ?? [];
    say(lines).then(() => {
      const ch = m.changes.map((c) => { const t = changeText(c); return `<div class="${t.good ? 'ok' : 'hot'}">${ui.esc(t.text)}</div>`; }).join('');
      overlay(`<h2>${ui.esc(end.title ?? def.title)}</h2><p>${ui.esc(end.summary ?? '')}</p><h3>What it cost, what it bought</h3><div class="changes">${ch || '<div>Nothing changed. That is its own kind of cost.</div>'}</div><h3>Tonight</h3>${nightStartHtml()}`, { onClose: finish });
    });
    if (!lines.length) radio?.skip?.();
  }

  // ---------------- days ----------------
  async function playDay(slotId, { report = null, campaign = {} } = {}) {
    if (state.day || state.scene) return null;
    const plan = planDay(slotId, { life, report, campaign });
    if (report) applyNight(life, report);
    else if (state.night.hits || state.night.crimesStopped) applyNight(life, nightReport());
    dayDrift(life, { keptToday: 1, crimesLastNight: report?.crimesStopped ?? null });
    const ds = dayStart(life);
    const sus = suspicionEvents(life);
    save();
    state.day = { slot: plan.slot, plan, scene: plan.scene, resolve: null, started: false };
    await enter('wayneManor', { x: -13.4, y: 0, z: -3.5, yaw: -Math.PI / 2 });
    becomeBruce('casual');
    clock.skipTo(8);
    placeAlfred('wayneManor');
    const lines = [{ s: 'alfred', t: pickLine('morning', life) }];
    for (const e of sus) lines.push({ s: 'alfred', t: SUSPICION_LINES[e.event] ?? 'Someone has been asking questions about you, sir.' });
    say(lines);
    if (ds.gordonVisit) gordonVisit();
    if (ds.reporterAtBreakfast && ds.injured) breakfastReporter();
    events.emit('bruceDayStart', { slot: plan.slot.id, scene: plan.scene.id });
    return new Promise((res) => { state.day.resolve = res; });
  }
  const SUSPICION_LINES = {
    reporterQuestions: 'The Gazette rang twice. Miss Kerr wanted to know which hospital you favour.',
    reporterInterview: 'Miss Kerr would like an interview. She was very specific that it be "about the injuries".',
    reporterStory: 'The Gazette is running a piece called "The Billionaire Who Never Sleeps". I have cancelled the paper. It did not help.',
    detectiveNotes: 'A detective was seen walking the boundary wall this morning. Taking notes. On the wall.',
    detectiveTail: 'There is an unmarked car at the end of the drive. It has been there since six.',
    detectiveVisit: 'Detective Ostrow has asked to see the house. All of it. Including, she said, the basement.',
    villainHint: 'A crossword arrived in the post with your name in it. Seven across is "BAT". I burned it.',
    villainNote: 'A card was left on the gate. It says "I know what you did last night". I suspect it is not the milkman.',
    villainTarget: 'Someone has been photographing the house from the woods, sir. Professionally.',
  };
  // You arrive at breakfast with a split lip and the reporter is at the table.
  function breakfastReporter() {
    const at = toWorld('wayneManor', { x: -14.6, y: 0, z: -1.5 });
    cast.person('reporter', 'reporter', at, -Math.PI / 2, { name: CAST.reporter.name, mood: 'sit', group: 'breakfast' });
    say([{ s: 'reporter', t: 'Morning, Mr. Wayne. Alfred let me in. Rough night? That lip looks like it has a story.' }]).then(() => {
      ui.choose('Nadia Kerr has her notebook open beside the toast.', [
        { id: 'sailing', tag: 'deflect', text: 'Sailing. The boom swung.', worn: (life.excuses.sailing?.n ?? 0) > 0 },
        { id: 'polo', tag: 'deflect', text: 'Polo. The horse had the better day.', worn: (life.excuses.polo?.n ?? 0) > 0 },
        { id: 'act', tag: 'act', text: 'A lady\'s husband. A gentleman never says which.' },
      ], (id) => {
        ui.hideChoices();
        if (id === 'act') ui.changes(applyEffects(life, { suspicion: { reporter: -5 }, standing: -2, threads: { love: -0.3 } }, 'the playboy act over breakfast'));
        else ui.changes(useExcuse(life, id, 'reporter', { visible: true }).changes);
        save();
        say([{ s: 'reporter', t: id === 'act' ? 'Of course. I will put it under "hobbies".' : 'I will put it with the others.' }]).then(() => cast.clear('breakfast'));
      });
    });
  }
  // A neglected city comes to the door: the commissioner, in the hall, not quite saying it.
  function gordonVisit() {
    const at = toWorld('wayneManor', { x: 0, y: 0, z: 4 });
    cast.person('gordon', 'commissioner', at, Math.PI, { name: CAST.gordon.name, mood: 'idle', group: 'visit' });
    setTimeout(() => say([
      { s: 'gordon', t: 'Mr. Wayne. Your Foundation pays for the GCPD night shift. I wanted to meet the man who signs for it.' },
      { s: 'bruce', t: 'And now that you have?' },
      { s: 'gordon', t: 'The Narrows had a bad night. Nobody came. If you know anyone who might want to hear that, pass it on.' },
    ]).then(() => cast.clear('visit')), 9000);
  }
  async function startDayScene() {
    const day = state.day;
    if (!day || day.started) return;
    day.started = true;
    const r = await playScene(day.scene.id, { fromDay: day.slot.id });
    const result = { slot: day.slot.id, ...r };
    state.day = null;
    // The night begins in the cave: the suit is waiting.
    await enter('batcave', POCKETS.batcave.entries.wayneManorClockPassage);
    say([{ s: 'alfred', t: r?.outcome === 'slip' ? 'You left early. I have the car warm. Do try to make it worth it.' : 'You stayed. The city waited. It is not good at waiting, sir.' }]);
    events.emit('bruceDayEnd', result);
    day.resolve?.(result);
    return result;
  }
  function skipDay(slotId, { report = null } = {}) {
    const slot = slotFor(slotId, life);
    const scene = SCENES[slot.scene];
    if (report) applyNight(life, report);
    const c = makeCommitment(scene.commitment, life.day);
    const changes = missCommitment(life, c);
    dayDrift(life, { keptToday: 0, crimesLastNight: report?.crimesStopped ?? null });
    save();
    return { slot: slot.id, scene: scene.id, outcome: 'skipped', changes, nightStart: nightStart(life) };
  }

  // ---------------- per frame ----------------
  const tmpV = new THREE.Vector3();
  const focusList = [];
  const pocketFocus = () => { focusList.length = 0; for (const pl of players()) if (pl?.hero?.pos) focusList.push(pl.hero.pos); const cam = typeof d.camera === 'function' ? d.camera() : d.camera; if (cam?.position) focusList.push(cam.position); return focusList; };
  function update(dt, real) {
    state.t += real;
    const pl0 = p0();
    if (!pl0) return;
    const h = pl0.hero;
    if (driverSwap && !vehicles.active) { if (vehicles.setDriver?.(driverSwap)) driverSwap = null; }
    civ.update(dt);
    cast.update(dt, h.pos);
    pockets.update(state.t, pocketFocus()); // [perf3] parked while no player or camera is near
    if (!state.scene && state.identity === 'bruce' && state.inside) clock.advance(real);
    sceneTick(real);
    updateSim(dt);
    if (state.day && !state.day.started && !state.scene && clock.hour >= state.day.scene.hour - 0.05 && clock.hour < state.day.scene.hour + 6) {
      say([{ s: 'alfred', t: 'The car is ready, sir. They are expecting you.' }]);
      startDayScene();
    }
    // Where am I (rooms, areas), exits.
    const at = state.inside ? pockets.at(h.pos) : null;
    state.room = at?.room ?? null; state.area = at?.area ?? null;
    if (state.inside && !state.busy && !state.scene) {
      const P = POCKETS[state.inside];
      const L = { x: h.pos.x - P.origin.x, z: h.pos.z - P.origin.z };
      for (const x of P.exits) {
        if (L.x >= x.x0 && L.x <= x.x1 && L.z >= x.z0 && L.z <= x.z1) {
          state.busy = true;
          leaveTo(x.site).then(() => { state.busy = false; });
          break;
        }
      }
      // Fell out of a pocket somehow (a glitch, a glide off the deck into the void): back to its spawn.
      if (h.pos.y < -3) placeHeroes(toWorld(state.inside, P.spawn));
    }
    if (!state.inside && !state.busy) state.indoors = false;
    // Prompts: stations inside, doors outside, the quick change.
    const input = pl0.input;
    state.hintT -= real;
    const busyUi = ui.busy || state.busy || !!radio?.playing; // [fix1] busy: a station counts too
    const fighting = combat?.active;
    let st = null, door = null;
    if (!busyUi && !fighting && !vehicles.active) {
      if (state.inside) st = nearestStation(h);
      else door = nearDoor(h);
    }
    if (st !== state.station || door !== state.door || (state.hintT <= 0 && (st || door))) {
      state.station = st; state.door = door; state.hintT = 3;
      if (st) hud.hint?.(`${key('kick')} ${ui.esc(st.label)}`, 3200);
      else if (door) hud.hint?.(`${key('kick')} ${ui.esc(door.label)}`, 3200);
    }
    if (!busyUi && input?.pressed?.('kick')) {
      if (st) use(st.id);
      else if (door) { state.busy = true; enterSite(door.id).then(() => { state.busy = false; }); }
    }
    // Driving the Batmobile into the cave mouth parks it on the turntable.
    if (state.mouthCool > 0) state.mouthCool -= real;
    if (!state.inside && !state.busy && !(state.mouthCool > 0) && vehicles.active === vehicles.batmobile) {
      const s = REGION_SITES.batcaveMouth;
      if (Math.hypot(h.pos.x - s.x, h.pos.z - s.z) < 9) {
        state.busy = true;
        vehicles.exit();
        vehicles.batmobile.group.visible = false;
        enterSite('batcaveMouth').then(() => { state.busy = false; });
      }
    }
    // Quick change: Bruce in the city, hold the interact key out of sight.
    if (state.identity === 'bruce' && !state.inside && !vehicles.active && !state.scene) {
      if (input?.down?.('kick') && !door) {
        state.holdT += real;
        if (state.holdT > 1.1) { state.holdT = 0; becomeBatman(); applyNightStart(); events.emit('word', { text: 'QUICK CHANGE', pos: h.pos.clone().setY(h.pos.y + 2.2), big: true }); }
      } else state.holdT = 0;
    }
    // The meters: shown as Bruce, in a pocket, or in a scene.
    state.metersT -= real;
    if (state.metersT <= 0) {
      state.metersT = 0.3;
      ui.meters(state.identity === 'bruce' || !!state.inside || !!state.scene, life, { title: state.identity === 'bruce' ? 'Bruce Wayne' : 'The double life', hour: clock.hour, note: state.day ? `${state.day.scene.title} at ${clockText(state.day.scene.hour)}` : '' });
      ui.mode?.({ civ: state.identity === 'bruce' || !!state.scene, inside: !!state.inside }); // [polish] the HUD dresses for Bruce
    }
    // The cave's moving parts.
    if (state.inside === 'batcave') {
      const tt = state.displays.turntable;
      if (tt) tt.rotation.y += real * 0.15;
      const b = state.displays.bats;
      if (b) {
        for (let i = 0; i < b.n; i++) {
          const a = state.t * (0.3 + (i % 5) * 0.07) + i * 2.4, r = 14 + (i % 7) * 3;
          b.v.set(Math.cos(a) * r, 20 + Math.sin(a * 1.7 + i) * 4, Math.sin(a) * r * 0.7);
          b.e.set(0, -a, Math.sin(state.t * 18 + i) * 0.6);
          b.q.setFromEuler(b.e);
          b.m.compose(b.v, b.q, b.s);
          b.mesh.setMatrixAt(i, b.m);
        }
        b.mesh.instanceMatrix.needsUpdate = true;
      }
      state.screenT -= real;
      const scr = state.displays.screen;
      if (scr && state.screenT <= 0) { state.screenT = 1; drawCityMap(scr.userData.canvas); scr.userData.texture.needsUpdate = true; }
    }
    // Alfred keeps his day: where he stands follows the hour, and he has a word when Bruce comes near.
    if (state.inside && !state.scene) {
      const hb = Math.floor(clock.hour);
      if (hb !== state.alfredHour) { state.alfredHour = hb; placeAlfred(state.inside); }
      const a = cast.alfred?.rec?.ch?.root;
      if (a) {
        const near = Math.hypot(a.position.x - h.pos.x, a.position.z - h.pos.z) < 3 && Math.abs(a.position.y - h.pos.y) < 2;
        if (near && !state.alfredNear && !radio?.playing) {
          const ctx = state.inside === 'batcave' ? (Object.values(life.injuries).some((x) => x > 0) ? 'patchUp' : 'caveGreet') : clock.hour < 12 ? 'morning' : life.threads.ward >= 2 && (state.t % 3) < 1 ? 'ward' : 'kitchen';
          say([{ s: 'alfred', t: pickLine(ctx, life) }]);
        }
        state.alfredNear = near;
      }
    }
    void tmpV;
  }

  // Dev and test entry points (URL params are read by game.js's [bruce] block).
  function start(mode) {
    if (mode === 'manor') { enter('wayneManor', POCKETS.wayneManor.spawn, { instant: true }); becomeBruce('suit'); }
    else if (mode === 'cave') enter('batcave', POCKETS.batcave.spawn, { instant: true });
    else if (mode === 'tower') { enter('wayneTower', POCKETS.wayneTower.spawn, { instant: true }); becomeBruce('suit'); }
  }

  return {
    get life() { return life; }, state, clock, pockets, civ, cast, ui, sites: REGION_SITES, POCKETS,
    get scene() { return state.scene ? { machine: state.scene.m, def: state.scene.def } : null; },
    get indoors() { return state.indoors; },
    enter, enterSite, leaveTo, becomeBruce, becomeBatman, use, playScene, playDay, skipDay, startDayScene,
    nightStart: applyNightStart, nightReport, startSim, start, loadPacks, update, openBatcomputer,
    // Replace the double life (tests, a save slot swap).
    reset(next = null) { Object.assign(life, sanitizeDoubleLife(next ?? createDoubleLife())); save(); },
    // Standing buys the Wayne branch (the skill tree calls these); R&D reads the week's budget.
    get credit() { return life.credit; },
    spendCredit(cost, what = 'Wayne branch') { const r = spendCredit(life, cost, what); if (r.ok) { save(); events.emit('bruceCredit', { spent: cost, what, credit: life.credit }); } return r; },
    rndBudget: () => rndBudget(life),
    passTime: (hours, o) => passTime(life, hours, o),
    threadRank: (id) => threadRank(life, id),
  };
}
