// Side content glue: play stats, districts and moves for the Progress page, milestone captions,
// and (Tasks 11 to 15) challenges, street crimes and the menu pages. The story flow sees side
// content only through flowHooks.
import * as THREE from 'three';
import { districtAt } from '../world/regions/data.js';
import { DISTRICT_IDS, saveProgress } from '../core/save.js';
import { tracker, milestonesCrossed } from './progressTracker.js';
import { createPlayStats, formatStatsLine } from './playStats.js';
import { createSideHud } from '../ui/sideHud.js';
import { CHALLENGES, pillarPos, formatResult } from './challenges.js';
import { createChallengeRunner } from './challengeRunner.js';
import { attachArena } from './arenaChallenge.js';
import { attachVehicleChallenges } from './vehicleChallenges.js';
import { CRIME_SPOTS, isCrimeId } from './crimes.js';
// [world-content] Crime system v2 and the rest of the open world (src/openworld/index.js) replace
// the old single-template crime director (crimeDirector.js, retired).
import { createOpenWorld } from '../openworld/index.js';
import { vanChaseBlocked } from './sideVanChase.js';
import { createVanChaseDirector } from './vanChaseDirector.js';
import { TROPHIES } from '../config/trophySpots.js';
import { mapModel } from './mapModel.js';
// [net2] Online co-op through the content seams (src/net/share.js): the worked example.
import { net } from '../net/share.js';

export const MILESTONE_TEXT = {
  25: 'A quarter of Gotham, handled. The Joker has started to notice.',
  50: 'Halfway there. Gotham is sleeping a little easier tonight.',
  75: 'Three quarters done. Gotham owes you more than it will ever say.',
  100: 'One hundred percent. A page has been left for you in the Progress menu.',
};

export function createSideContent(deps) {
  const { scene, hero, follow, combat, encounters, events, flow, hudRoot, prompts, progress, storage, assets, rng, collision, buildings, vehicles, batwing } = deps;
  const save = () => saveProgress(storage, progress);
  const ui = createSideHud(hudRoot);
  const stats = createPlayStats(progress.stats);
  const last = new THREE.Vector3().copy(hero.pos);
  let dirty = true, districtT = 0, saveT = 0;

  const stepType = () => flow.objectives.step?.type ?? null;
  const offLimits = () => ['boss', 'cutscene'].includes(stepType());
  const challenges = createChallengeRunner({
    scene, hero, follow, events, ui, progress, save,
    hidden: offLimits,
    // Not in a fight or cutscene, including mid-story. The arena also needs the encounter
    // system free (a waiting crime squad is fine: the crime is called off at the start).
    canStart: (ch) => flow.mode === 'play' && !hero.dead && !offLimits() && !combat.active && !encounters.active
      && (ch.kind !== 'arena' || !encounters.id || isCrimeId(encounters.id)),
  });
  attachArena(challenges, { events, encounters, ui });
  attachVehicleChallenges(challenges, { vehicles, batwing, hero });
  // [world-content] The open world: the director, crimes v2, stealth, cases, chains, collectibles.
  const openworld = createOpenWorld({
    ...deps, ui, save, events, rng, progress, flow, encounters, combat,
    challengeActive: () => challenges.active, photoActive: () => deps.photoActive?.() ?? false,
  });
  const crimes = openworld.crimes;
  const vanChase = createVanChaseDirector({ vehicles, events, ui, progress, save, rng });
  const vanChaseVehicleBusy = () => !!(vehicles.chase?.active || vehicles.battle?.active || vehicles.sideChase?.active);
  const vanChaseMarker = () => { const c = vehicles.sideChase; return c?.active ? c.van.group.position : null; };
  const MARKER_RANGE = 60;
  const tmp = new THREE.Vector3();
  let pillarHint = false;
  // Bat markers over pillars within 60 m (the spec's "HUD shows them when you're within 60 m").
  function markers(toScreen) {
    for (const p of challenges.pillars) {
      const far = Math.hypot(hero.pos.x - p.at.x, hero.pos.z - p.at.z) > MARKER_RANGE;
      if (challenges.active || far || !p.mesh.visible) { ui.marker(p.ch.id, 0, 0, false); continue; }
      const s = toScreen(tmp.set(p.at.x, p.at.y + 3.6, p.at.z));
      ui.marker(p.ch.id, s.x, s.y, !s.behind, progress.challenges[p.ch.id]?.medal ?? null);
      if (!s.behind && !pillarHint) { pillarHint = true; prompts.show(['challenges']); }
    }
  }

  events.on('ko', () => stats.ko());
  events.on('takedown', () => stats.ko());
  events.on('moveLearned', ({ id }) => {
    if (progress.moves.includes(id)) return;
    progress.moves.push(id);
    save();
    dirty = true;
  });
  for (const ev of ['trophy', 'objectiveDone', 'challengeDone', 'crimeStopped', 'vanChaseStopped']) events.on(ev, () => { dirty = true; });

  // Captions at 25, 50, 75 and 100%. progress.milestone remembers the highest one shown, so a
  // new post-game category that lowers the percentage never replays them.
  function checkMilestones() {
    dirty = false;
    const crossed = milestonesCrossed(progress.milestone, tracker.score(progress).percent);
    if (!crossed.length) return;
    const top = crossed[crossed.length - 1];
    progress.milestone = top;
    if (top === 100 && !progress.unlocks.includes('commendation')) {
      progress.unlocks.push('commendation');
      events.emit('unlock', { id: 'commendation' });
    }
    save();
    ui.toast(`${top}% complete`, MILESTONE_TEXT[top], 7000);
    events.emit('milestone', { percent: top });
  }

  function visitDistrict() {
    const d = districtAt(hero.pos.x, hero.pos.z);
    if (!DISTRICT_IDS.includes(d) || progress.districts.includes(d)) return;
    progress.districts.push(d);
    save();
    dirty = true;
    events.emit('districtVisited', { id: d });
  }

  // ---- [net2] Online co-op (docs/design/online-coop.md "Content seams", the worked example) ----
  // Side content stays host-authoritative (it runs on the host's hero; a guest never runs update).
  // 1. Shared events: a guest's own listeners (civilians and police on foot, siren cars, the map's
  //    crime pins, audio stingers, XP shares) hear the host's crimes, chases and challenges.
  //    The open world's list (docs/design/openworld.md 4, crime system v2, J3) is shared whole.
  for (const n of ['crimeSpawn', 'crimeEnd', 'crimeStopped', 'vanChaseStopped', 'sideChaseStart', 'sideChaseHit', 'sideChaseDone', 'challengeStart', 'challengeDone', 'challengeFail', 'ringPass', 'checkpoint', 'milestone',
    'crimeDiscovered', 'crimeActive', 'crimeUpdate', 'crimeEscalate', 'crimeArrests', 'districtMood', 'districtEnter', 'lieutenant',
    'sideMissionAvailable', 'sideMissionStart', 'sideMissionStep', 'sideMissionComplete', 'sideMissionFailed',
    'stealthEncounterNear', 'stealthEncounterDone', 'stealthEncounterFailed', 'stealthDetector',
    'caseStart', 'caseMarker', 'caseClue', 'caseHint', 'caseSolved', // (caseStage, caseConfront, stealthEncounterStart drive host logic: not re-emitted)
    'collectible', 'collectibleHint', 'trialStart', 'trialDone', 'contractStart', 'contractDone']) net.shareEvent(n);
  // The live crime's HUD (crimeUpdate, 2 Hz) in the guest's side panel; gone with the crime.
  let guestCrime = null;
  events.on('crimeUpdate', (d) => {
    if (!d?.remote) return;
    if (guestCrime !== d.id) { guestCrime = d.id; ui.challenge(String(d.title ?? 'Crime')); }
    const meter = Number.isFinite(d.meter) ? ` ${Math.round(d.meter * 100)}%` : '';
    ui.timer(String(d.text ?? ''), `${d.label ?? ''}${meter}${Number.isFinite(d.timer) ? ` · ${Math.ceil(d.timer)} s` : ''}`.trim());
  });
  events.on('crimeEnd', (d) => { if (d?.remote && d.id === guestCrime) { guestCrime = null; if (!mirror.challenge) ui.clearChallenge(); } });
  // 2. The side HUD mirrored: radio calls, toasts and hints as one shared event; the challenge
  //    panel (title, timer, countdown) and the crime marker as a small state blob.
  const mirror = { challenge: null, main: '', sub: '', count: '', marker: null };
  const wrapUi = (m, fn) => { const orig = ui[m]; ui[m] = (...a) => { fn?.(...a); return orig.apply(ui, a); }; };
  for (const m of ['radio', 'toast', 'hint']) wrapUi(m, (...a) => { if (net.isHost()) events.emit('sideHudLine', { m, a: a.map((x) => (typeof x === 'number' ? x : String(x ?? ''))) }); });
  wrapUi('challenge', (title) => { mirror.challenge = String(title ?? ''); mirror.main = ''; mirror.sub = ''; });
  wrapUi('timer', (main, sub = '') => { mirror.main = String(main ?? ''); mirror.sub = String(sub ?? ''); });
  wrapUi('countdown', (text) => { mirror.count = String(text ?? ''); });
  wrapUi('clearChallenge', () => { mirror.challenge = null; mirror.count = ''; });
  net.shareEvent('sideHudLine', (d) => ['radio', 'toast', 'hint'].includes(d?.m) && Array.isArray(d.a) && d.a.length <= 3);
  events.on('sideHudLine', (d) => { if (d?.remote) ui[d.m](...d.a); });
  let shown = { challenge: null, main: '', sub: '', count: '' };
  net.registerState('side.hud', {
    hz: 6,
    snapshot: () => { const c = openworld.marker() ?? vanChaseMarker(); return { ...mirror, count: mirror.count, marker: c ? { x: +c.x.toFixed(1), y: +(c.y ?? 0).toFixed(1), z: +c.z.toFixed(1) } : null }; },
    apply: (v) => {
      if (!v || typeof v !== 'object') return;
      if (v.challenge !== shown.challenge) { if (v.challenge) ui.challenge(String(v.challenge)); else ui.clearChallenge(); }
      if (v.challenge && (v.main !== shown.main || v.sub !== shown.sub)) ui.timer(String(v.main ?? ''), String(v.sub ?? ''));
      if (v.count && v.count !== shown.count) ui.countdown(String(v.count));
      shown = { challenge: v.challenge ?? null, main: v.main ?? '', sub: v.sub ?? '', count: v.count ?? '' };
      mirror.marker = v.marker && Number.isFinite(v.marker.x) ? v.marker : null;
    },
  });
  // 3. A claim: a guest at a challenge pillar asks the host to run it (challenges are host only
  //    for now: they time the host's hero). The guest gets the "host only" hint; the host is told.
  net.registerClaim('side.pillar', (d, { player }) => {
    const ch = CHALLENGES.find((c) => c.id === d.id);
    if (!ch || !player) return;
    ui.hint(`Player ${(player.netSlot ?? 1) + 1} wants to run ${ch.name}: stand on its pillar to start it.`, 4500);
  }, (d) => typeof d?.id === 'string' && d.id.length <= 32);
  let pillarAsked = null;
  function guestPillars(heroes) {
    let at = null;
    for (const p of challenges.pillars) if (heroes.some((h) => Math.hypot(h.pos.x - p.at.x, h.pos.z - p.at.z) < 2.5 && Math.abs(h.pos.y - p.at.y) < 3)) { at = p.ch.id; break; }
    if (at && at !== pillarAsked) { net.claim('side.pillar', { id: at }); net.hostOnly(ui, 'Challenges are host only for now: your partner can start this one from the pillar.'); }
    pillarAsked = at;
  }
  // ---- [net2] end ----

  return {
    ui,
    stats,
    // [net2] What an online guest's side content still does each frame (game.js calls it instead of
    // update): the "host only" pillar hint and claim.
    guestUpdate() { guestPillars([hero]); },
    save,
    score: () => tracker.score(progress),
    // dt is game time (slow motion and hit-stop included), real is wall time.
    update(dt, real, view) {
      stats.tick(real);
      stats.combo(combat.combo.value);
      if (hero.state === 'glide') stats.glide(hero.glide.speed, Math.hypot(hero.pos.x - last.x, hero.pos.z - last.z));
      last.copy(hero.pos);
      districtT -= real;
      if (districtT <= 0) { districtT = 0.5; visitDistrict(); }
      challenges.update(dt); markers(view.toScreen);
      openworld.update(dt);
      vanChase.update(dt, hero.pos, () => vanChaseBlocked({ mode: flow.mode, stepType: stepType(), vehicleBusy: vanChaseVehicleBusy(), challenge: challenges.active }));
      if (dirty) checkMilestones();
      saveT += real;
      if (saveT > 20) { saveT = 0; save(); }
    },
    challenges,
    crimes,
    openworld,
    vanChase,
    data: { CHALLENGES, CRIME_SPOTS, pillarPos },
    flowHooks: {
      holdStory: () => challenges.active || openworld.holdStory(),
      marker: () => (net.isGuest() ? mirror.marker : challenges.active ? challenges.nextMarker() : openworld.marker() ?? vanChaseMarker()), // [net2] a guest points at the host's crime
      onRespawn: (opts) => { const p = openworld.onRespawn(opts); return challenges.takeRespawn() ?? p; },
    },
    pauseInfo: () => ({
      challenge: challenges.current?.name ?? null, crimesStopped: progress.crimes.stopped,
      vanChasesStopped: progress.vanChases.stopped, percent: tracker.score(progress).percent,
    }),
    photoTaken() { stats.photo(); save(); },
    challengesPage: () => ({
      list: CHALLENGES.map((ch) => {
        const e = progress.challenges[ch.id];
        return { id: ch.id, name: ch.name, blurb: ch.blurb, medal: e?.medal ?? null, best: e ? formatResult(ch, e.best) : null, goal: `Gold: ${formatResult(ch, ch.medals.gold)}` };
      }),
      goldStandard: progress.unlocks.includes('goldStandard'),
    }),
    progressPage: () => {
      const s = tracker.score(progress);
      return {
        percent: s.percent,
        parts: s.parts,
        statsLine: formatStatsLine(progress.stats, { crimes: progress.crimes.stopped }),
        commendation: progress.unlocks.includes('commendation'),
        map: mapModel({ buildings, trophies: TROPHIES, challenges: CHALLENGES.map((ch) => ({ id: ch.id, ...pillarPos(ch) })), progress }),
      };
    },
  };
}
