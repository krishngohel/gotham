// The story runtime (workstream J1): the campaign layer between src/game/flow.js and the night
// data files. Flow keeps doing what it always did (step entry, reach checks, fights, async beats,
// respawn); this module adds:
//   - which night is in play, its step list, sites and fights (Night One: STEPS, SITES, FIGHTS);
//   - the campaign: Night One's credits lead into the next night (after its Bruce-day hook), each
//     night's nightEnd into the one after, free roam always available between beats;
//   - saving a later night's place in progress.campaign (Night One keeps progress.step/stepId);
//   - missions: missionComplete, reward events, optional objectives, fail and retry, replay;
//   - the campaign step types (stepTypes.js) and travel texture (travel.js);
//   - the music context flow exposes to sound.js.
// World-changing actions (spawning, advancing, placing heroes) go through the flow's own
// functions, which coop-seams.md lists as host-only: nothing here runs on an online guest's own.
import { STEPS } from '../game/story.js';
import { ALIASES } from '../game/storyAliases.js';
import { FIGHTS } from '../game/fights.js';
import { SITES } from '../world/mapData.js';
import { REGION_SITES } from '../world/regions/data.js';
import { nightById, stepsOf, nextNight, dayHook, missionById, REWARD_EVENT, isRewardId } from './campaign.js';
import { CAMPAIGN_DEFAULT, sanitizeCampaign } from './campaignSave.js';
import { buildFight } from './fightBuilder.js';
import { createStepTypes } from './stepTypes.js';
import { createTravel } from './travel.js';
import { createMarkers } from './markers.js';
import { createStoryUi } from './ui.js';
import { registerNightRooms, roomFight } from './rooms.js';
import './nights/index.js';
// [net2] Online co-op: an online guest's story is a replica of the host's (src/net/mode.js). It
// follows the host's (night, step) and never fails, rewards a day, loads a night or spawns here.
import { isReplica } from '../net/mode.js';
// [story2] the double life inside the nights, per-view meters, the endgame and the Batcomputer hooks
import { createViewFx } from './viewFx.js';
import { createLifeSteps, endingFor } from './lifeSteps.js';
import { createEndgame } from './endgame.js';
import { overheardFor, GANG_IDLE } from './storyBarks.js';
import { n4StepTypes } from './missions/n4/index.js'; // [m45] Night Four's own step type (hunted)
// [m23] Nights Two and Three: the case, rescue and evade step types (src/story/missions/n2, n3)
import { createN2Steps } from './missions/n2/index.js';
import { createN3Steps } from './missions/n3/index.js';
import { buildMissionSteps } from './missions/stepRegistry.js'; // [m67] step types that live beside their missions

const g2 = (speaker, text) => ({ speaker, portrait: speaker, text });

export function createStoryRuntime(f) {
  const { d, hero, events, hud, radio, stage, progress, encounters, collision, theGame } = f;
  let night = nightById('n1');
  let replay = null; // { night, mission, resume: { night, stepId, index } }
  let lastMission = null;
  let current = null; // the step being run by a campaign step type
  let stepEntered = null;
  let markers = null;
  const fightCache = new Map();
  const camp = () => {
    if (!progress.campaign || typeof progress.campaign !== 'object') progress.campaign = sanitizeCampaign({ ...CAMPAIGN_DEFAULT });
    return progress.campaign;
  };
  const scene = () => theGame()?.scene ?? null;
  const getMarkers = () => {
    if (markers) return markers;
    const sc = scene();
    if (!sc) return { place: () => null, color() {}, flash() {}, release() {}, releaseAll() {}, update() {} };
    markers = createMarkers(sc);
    return markers;
  };
  const markerProxy = {
    place: (...a) => getMarkers().place(...a), color: (...a) => getMarkers().color(...a), flash: (...a) => getMarkers().flash(...a),
    release: (...a) => getMarkers().release(...a), releaseAll: () => markers?.releaseAll(), update: (dt) => markers?.update(dt),
  };
  const ui = createStoryUi(() => document.querySelector('.hud'));
  const difficulty = () => d.getDifficulty?.() ?? 'normal';
  // [story2] Players, per-view effects and how tonight started (the Bruce side's nightStart()).
  const players = () => theGame()?.players ?? [{ hero, input: null, id: 'p0' }];
  const viewFx = createViewFx({ hud, players });
  let opening = null;
  function openNight(fresh = false) {
    const B = theGame()?.bruce;
    if (!B?.nightStart) return opening;
    if (opening && !fresh) return opening;
    try { opening = B.nightStart(); } catch (e) { console.error('nightStart', e); opening = null; }
    return opening;
  }

  // ---------------------------------------------------------------- lookups
  function site(id) {
    if (!id) return null;
    if (typeof id === 'object') return id;
    return night?.sites?.[id] ?? SITES[id] ?? REGION_SITES[id] ?? null;
  }
  function fight(id) {
    if (night.id === 'n1' || !night.fights?.[id]) return FIGHTS[id] ?? null;
    const key = `${night.id}.${id}.${difficulty()}`;
    if (fightCache.has(key)) return fightCache.get(key);
    const def = night.fights[id];
    let built;
    if (def.stealth) built = roomFight(typeof def.stealth === 'object' ? def.stealth : night.rooms?.[def.stealth] ?? def.stealth, site);
    else built = buildFight(id, def, { difficulty: difficulty(), act: def.act ?? night.actNumber ?? 2, district: def.district ?? night.districts?.[0] ?? 'core' });
    // encounters.js reads SITES for a string site; a night's own places are handed over resolved.
    const out = { ...built, site: site(built.site) ?? built.site, ...(built.entry ? { entry: built.entry } : {}) };
    fightCache.set(key, out);
    return out;
  }
  const scenePages = (name) => night?.scenes?.[name]?.(stage) ?? [];

  // ---------------------------------------------------------------- missions and rewards
  function reward(id, extra = {}) {
    if (!isRewardId(id)) return;
    const c = camp();
    if (c.rewards.includes(id)) return;
    c.rewards.push(id);
    events.emit(REWARD_EVENT, { id, night: night.id, ...extra });
  }
  function missionDone(missionId) {
    if (!missionId) return;
    const key = `${night.id}.${missionId}`;
    events.emit('missionComplete', { night: night.id, mission: missionId, replay: !!replay });
    if (replay) return;
    const c = camp();
    if (!c.missionsDone.includes(key)) c.missionsDone.push(key);
    for (const r of missionById(night, missionId)?.rewards ?? []) reward(r, { mission: missionId });
  }
  function optional(id, { xp = 0, label = null } = {}) {
    const key = `${night.id}.${id}`;
    const c = camp();
    if (!c.optionalDone.includes(key) && !replay) c.optionalDone.push(key);
    if (label) hud.card?.('OPTIONAL', label, 3200);
    if (xp) events.emit('xpGain', { amount: xp, reason: id });
    events.emit('optionalDone', { night: night.id, id });
    f.save();
  }

  // ---------------------------------------------------------------- the step types
  const stepCtx = {
    markers: markerProxy, ui, radio, hud, events, standing: f.standing, site, theGame, hero, prompts: f.prompts,
    done: (s, branch = null) => { if (f.objectives.step === s) setTimeout(() => f.advance({ type: 'stepDone', id: s.id, branch }), 0); },
    fail: (s, lines) => fail(s, lines),
    endNight: (s) => endNight(s),
    penalty: (s, n) => penalty(s, n),
    spawnPhantoms: (s) => spawnPhantoms(s),
    clearPhantoms: (list) => clearPhantoms(list),
    vanish: (e) => vanish(e),
    // [story2]
    players, viewFx,
    camp: () => camp(),
    nightId: () => night.id,
    opening: () => openNight(),
    replaying: () => !!replay,
  };
  const types = createStepTypes(stepCtx);
  const lifeKit = createLifeSteps(stepCtx);
  Object.assign(types, lifeKit.types);
  Object.assign(types, n4StepTypes(stepCtx)); // [m45]
  { const mctx = { ...stepCtx, encounters, collision, fight: (id) => fight(id), isReplica }; Object.assign(types, createN2Steps(mctx), createN3Steps(mctx)); } // [m23]
  Object.assign(types, buildMissionSteps(stepCtx)); // [m67]
  // [story2] A fight of spore-dazed civilians (step.thralls): a stun wakes one; anything else lands
  // on someone who did nothing wrong, and the city (and the night's tally) remembers.
  const harmed = new WeakSet();
  let harm = 0;
  const HARM_LINES = [g2('alfred', 'Sir. That was a commuter.'), g2('oracle', 'Easy. Those are people.'), g2('gordon', 'My officers are seeing bruises on civilians, Batman. Tell me those are not yours.'), g2('thrall', 'Ow. Why. I was just jogging.')];
  events.on('impact', ({ target, outcome, move } = {}) => {
    const s = f.objectives.step;
    if (!s?.thralls || !target || !encounters.enemies?.includes?.(target)) return;
    if (outcome === 'stun' || move === 'cape' || move === 'batarang' || move === 'counter') { if (!target.woke) {
        target.woke = true;
        events.emit('word', { text: 'AWAKE', pos: target.pos.clone?.().setY?.(target.pos.y + 2) ?? target.pos, big: false });
        events.emit('storyFreed', { night: night.id, step: s.id });
        // Awake, dazed, out of the fight: they sit down where they are (counts as down for the fight).
        const hp = hero.pos;
        setTimeout(() => { if (target.alive) { target.health = 0; target.applyHit?.({ outcome: 'ko' }, hp); } }, 450);
      }
      return;
    }
    if (harmed.has(target)) return;
    harmed.add(target);
    harm += 1;
    radio?.say([HARM_LINES[(harm - 1) % HARM_LINES.length]]);
    lifeKit.effects({ city: -1.5, threads: { gordon: -0.1 } }, 'civilian hurt');
    events.emit('storyHarm', { night: night.id, step: s.id, harm });
    const c = camp(); c.choices ??= {}; if (!replay) c.choices[`${night.id}.harm`] = harm > 3 ? 'many' : 'some';
  });
  // [story2] Overheard conversations: the night's own, one per fight, in turn; a stealth room's
  // squad gets a gang idle line instead (they are on patrol, not chatting).
  let overheardAt = 0;
  function overhear(s) {
    const def = fight(s.fight);
    const at = def?.site ? site(def.site) ?? def.site : null;
    const pos = at ? { x: at.x, y: (at.y ?? 0) + 1.6, z: at.z } : null;
    if (def?.stealth) {
      const pool = GANG_IDLE[def.gang ?? night.gang] ?? [];
      if (pool.length) setTimeout(() => events.emit('bark', { text: pool[overheardAt++ % pool.length], speaker: 'goon', pos, channel: 'world' }), 1800);
      return;
    }
    const convos = overheardFor(night);
    if (!convos.length) return;
    const convo = convos[overheardAt++ % convos.length];
    convo.forEach(([speaker, text], i) => setTimeout(() => { if (f.objectives.step === s) events.emit('bark', { text, speaker, pos, channel: 'world' }); }, 1200 + i * 2600));
  }
  // [story2] A boss's phase is saved as it is reached; a defeat clears it.
  events.on('bossPhase', ({ id, phase } = {}) => { if (replay || !id) return; camp().boss = { id, phase: Math.max(0, (phase ?? 1) - 1) }; f.save(); });
  events.on('bossDefeated', () => { if (camp().boss) { camp().boss = null; f.save(); } });
  const endgame = createEndgame({ f, d, hud, radio, events, camp, theGame, nightById, replayMission: (...a) => replayMission(...a), playScene: (n) => f.playScene(n), save: () => f.save(), ending: () => endingFor(theGame()?.bruce?.life ?? null) });
  const travel = createTravel({ hud, radio, events, encounters, collision, standing: f.standing, site, fightDef: fight, onOptional: optional });

  // A puzzle's wrong answer calls in a small squad (composeWave), when the runner is free.
  function penalty(s, n) {
    if (encounters.id || isReplica()) return; // [net2] the host's squad reaches a guest as puppets
    const at = site(s.penalty.site ?? s.site) ?? f.target;
    if (!at) return;
    const def = buildFight(`${s.id}Penalty${n}`, { site: at, radius: 30, gang: s.penalty.gang ?? night.gang, waves: [{ budget: s.penalty.budget ?? 3, ring: s.penalty.ring ?? 7 }] }, { difficulty: difficulty(), act: night.actNumber ?? 2 });
    encounters.begin(`${s.id}Penalty`, { ...def, site: at });
    encounters.trigger();
  }
  // Fear toxin phantoms: goons that are not there. They stand, turn to watch, never attack, and
  // vanish in a puff when struck (which is what the toxin wants: the meter jumps).
  const phantomSet = new Set();
  function spawnPhantoms(s) {
    const G = theGame();
    if (!G?.spawn || !s.phantoms?.length || isReplica()) return []; // [net2] the host's phantoms are puppets here
    const list = s.phantoms.map((p) => {
      const at = site(p.at ?? p) ?? p;
      const y = collision.groundBelow(at.x, (at.y ?? 0) + 3, at.z, 0.3);
      const e = G.spawn(p.type ?? 'grunt', { x: at.x, y: y > -Infinity ? y : at.y ?? 0, z: at.z, gang: 'scarecrow' });
      e.hallucination = true;
      e.wake = () => {};
      e.aware = false;
      phantomSet.add(e);
      return e;
    });
    const C = G.combat;
    if (C && !encounters.active) C.setEnemies([...list]);
    return list;
  }
  function vanish(e) {
    const G = theGame();
    events.emit('smoke', { pos: e.pos });
    if (isReplica()) return; // [net2] the host despawns it (the guest's copy goes with the despawn)
    setTimeout(() => { if (phantomSet.has(e)) { phantomSet.delete(e); G?.despawn?.(e); G?.combat?.setEnemies(G.combat.enemies.filter((x) => x !== e)); } }, 250);
  }
  function clearPhantoms(list) {
    const G = theGame();
    for (const e of list ?? []) { if (phantomSet.has(e)) { phantomSet.delete(e); G?.despawn?.(e); } }
    if (G?.combat && !encounters.active) G.combat.setEnemies(G.combat.enemies.filter((x) => !list?.includes(x)));
  }

  // ---------------------------------------------------------------- fail and retry
  let failing = false;
  function fail(s, lines) {
    if (failing) return;
    // [net2] A guest hears it; the host restarts the mission and its step event re-enters here.
    if (isReplica()) return;
    failing = true;
    events.emit('missionFailed', { night: night.id, step: s?.id });
    hud.card?.('MISSION FAILED', 'Back to the last checkpoint. Go again.', 3000);
    if (lines?.length) radio?.say(lines);
    setTimeout(() => {
      failing = false;
      exitCurrent();
      encounters.end();
      const i = f.objectives.retryIndex();
      f.objectives.jump(i);
      f.enterStep();
      const p = f.respawnPoint();
      hero.teleport(p, hero.bat.yaw);
      f.bringAlong();
      d.follow?.snapBehind?.(hero.bat.yaw);
    }, 1400);
  }

  // ---------------------------------------------------------------- nights
  // Time of day and weather (workstream M's world.clock / world.weather, docs/design/environment.md):
  // a night pins its hour and weather for its whole length ('story:night'), a step may pin its own
  // on top ('story:step', newest pin wins), the Bruce day pins daytime while its hook plays
  // ('story:day'). Every call is a no-op when the environment system is not there.
  const env = {
    get clock() { return theGame()?.world?.clock ?? null; },
    get weather() { return theGame()?.world?.weather ?? null; },
    // [fix1] A dev URL's ?time= / ?weather= (world.devEnv) is the look asked for: the story leaves
    // it alone (the env tools and tests set the time inside Night One). Never set in normal play.
    pin(id, hour, state, snap = true) {
      const dev = theGame()?.world?.devEnv ?? {};
      if (hour != null && !dev.time) this.clock?.pin?.(hour, { id });
      if (state && !dev.weather) this.weather?.pin?.(state, { id, snap });
    },
    unpin(id) { this.clock?.unpin?.(id); this.weather?.unpin?.(id); },
  };
  function clockPin(n) {
    env.unpin('story:night');
    if (n) env.pin('story:night', n.timeOfDay ?? null, n.weather ?? null);
  }
  function load(id, index = 0) {
    night = nightById(id) ?? nightById('n1');
    fightCache.clear();
    registerNightRooms(night);
    f.load(stepsOf(night), index);
    lastMission = f.objectives.step?.mission ?? null;
    clockPin(night);
  }
  async function playDay(n) {
    const day = n?.day;
    if (!day) return;
    const c = camp();
    const hook = dayHook(day.hook);
    // The day plays in daylight (a hook may pin its own hours on top); the night after pins its own.
    env.unpin('story:night');
    env.pin('story:day', day.time ?? 11, day.weather ?? 'overcast');
    if (hook) {
      try { await hook({ night: n.id, context: day.context ?? {}, game: theGame(), progress, events }); } catch (e) { console.error('day hook', day.hook, e); }
    } else if (day.fallback?.length) {
      // No Bruce day yet (workstream K fills it): the night's own fallback lines, over free roam.
      radio?.say(day.fallback);
    }
    env.unpin('story:day');
    if (!c.daysSeen.includes(day.hook)) c.daysSeen.push(day.hook);
    events.emit('bruceDay', { night: n.id, hook: day.hook, played: !!hook });
  }
  function beginNight(id, { index = 0 } = {}) {
    const c = camp();
    c.night = id;
    c.stepId = stepsOf(id)[index]?.id ?? null;
    load(id, index);
    f.setMode('play');
    events.emit('nightStart', { night: id });
    // [story2] How tonight starts is shaped by the day (backup, the tail, frozen R&D, fatigue): the
    // Bruce side applies it to the heroes; the night shows what it costs.
    const ns = openNight(true);
    if (ns?.notes?.length && !replay) setTimeout(() => hud.card?.('TONIGHT', ns.notes.slice(0, 3).join(' '), 7500), 4800);
    if (ns) events.emit('storyOpening', { night: id, ...ns });
    f.enterStep();
  }
  async function endNight(s) {
    // [net2] A guest reads the night's last comic; the host runs the day and loads the next night,
    // and its step event (night, step) brings the guest along (flow.follow -> followNight).
    if (isReplica()) { if (s?.scene && !replay) { events.emit('nightComplete', { night: night.id, remote: true }); await f.playScene(s.scene); theGame()?.net?.sceneDone?.(f.objectives.index); } return; }
    missionDone(f.objectives.step?.mission ?? lastMission);
    lastMission = null;
    if (replay) { endReplay(); return; }
    const c = camp();
    if (!c.nightsDone.includes(night.id)) c.nightsDone.push(night.id);
    events.emit('nightComplete', { night: night.id });
    if (s?.scene) { await f.playScene(s.scene); await theGame()?.net?.waitScene?.(f.objectives.index); } // [net2] an online guest reads it too
    for (const r of s?.rewards ?? []) reward(r, { step: s.id });
    const next = nextNight(night.id);
    f.save();
    if (!next) {
      // The last night: [story2] the ending (from the double life), credits, free roam with the
      // city reflecting it, mission replay, the 100% hook and New Game Plus (an event).
      c.stepId = s?.id ?? null;
      env.unpin('story:night');
      env.unpin('story:step');
      if (night.finale) { await endgame.play(night, s); return; }
      f.freeRoamBase();
      hud.setObjective?.(s?.after ?? 'Gotham sleeps, for now. Free roam.');
      f.save();
      return;
    }
    await playDay(nightById(next));
    beginNight(next);
    f.save();
  }
  function nightDone() {
    // Night One's credits step.
    missionDone(f.objectives.step?.mission ?? lastMission);
    lastMission = null;
    const c = camp();
    if (!c.nightsDone.includes('n1')) c.nightsDone.push('n1');
    events.emit('nightComplete', { night: 'n1' });
    // The long night is over: the clock and the weather run free again (until the next night).
    env.unpin('story:night');
    env.unpin('story:step');
  }

  // ---------------------------------------------------------------- replay (mission select)
  function replayMission(nightId, missionId) {
    const n = nightById(nightId);
    if (!n) return false;
    const list = stepsOf(n);
    const start = list.findIndex((s) => s.mission === missionId);
    if (start < 0) return false;
    replay = { night: nightId, mission: missionId, resume: { night: night.id, index: f.objectives.index } };
    exitCurrent();
    encounters.end();
    load(nightId, start);
    f.setMode('play');
    f.enterStep();
    hero.teleport(f.respawnPoint(), hero.bat.yaw);
    f.bringAlong();
    events.emit('replayStart', { night: nightId, mission: missionId });
    return true;
  }
  function endReplay() {
    const r = replay;
    replay = null;
    if (!r) return;
    exitCurrent();
    encounters.end();
    load(r.resume.night, r.resume.index);
    events.emit('replayEnd', { night: r.night, mission: r.mission });
    const s = f.objectives.step;
    if (night.id === 'n1' && (!s || s.type === 'credits')) { f.freeRoamBase(); return; }
    f.enterStep();
  }

  function exitCurrent() {
    if (current) types[current.type]?.exit(current);
    current = null;
  }

  // ---------------------------------------------------------------- the surface flow uses
  const api = {
    get nightOne() { return night.id === 'n1'; },
    get night() { return night; },
    get replaying() { return replay; },
    get startSite() { return night.start ?? 'start'; },
    get musicContext() {
      if (api.musicOverride) return api.musicOverride; // [story2] the Bruce side's pockets
      const B = d.bosses;
      if (B?.active || B?.watching) return { context: 'boss', villain: B.villain };
      const s = f.objectives.step;
      if (s?.music) return s.music;
      if (night.id !== 'n1' && s?.type === 'boss') return { context: 'boss', villain: night.villain };
      return null;
    },
    site, fight, scenePages,
    bossSite(s) { return s.site ? site(s.site) : d.bosses?.siteOf?.(s.boss ?? 'joker') ?? null; },
    indexOf(id) {
      const i = f.objectives.indexOf(id);
      if (i >= 0 || night.id !== 'n1') return i;
      return f.objectives.indexOf(ALIASES[id] ?? '');
    },
    // Flow asks before writing progress.step: true means "a later night (or a replay): saved here".
    record(index, id) {
      if (replay) return true;
      if (night.id === 'n1') return false;
      camp().stepId = id;
      return true;
    },
    // [net2] An online guest following the host into another night: that night's list (no step
    // entered: flow.follow enters the host's). True when it changed nights.
    followNight(id) {
      if (!id || night.id === id || !nightById(id)) return false;
      exitCurrent();
      replay = null;
      load(id, 0);
      camp().night = id;
      return true;
    },
    start() {
      const c = camp();
      if (c.night && c.night !== 'n1' && nightById(c.night)) {
        const list = stepsOf(c.night);
        const i = c.stepId ? list.findIndex((s) => s.id === c.stepId) : 0;
        load(c.night, Math.max(0, i));
      } else if (!progress.finished) {
        // Night One in play: night and a storm for its whole length (the look it always had).
        clockPin(night);
      }
    },
    // Night One finished: the campaign carries on into the next night. boot: a save that was
    // already past the credits when it loaded (no day scene; straight into the next night's opening).
    afterNightOne({ boot = false } = {}) {
      if (night.id !== 'n1' || replay || isReplica()) return; // [net2] the host's beginNight brings a guest along
      const next = nextNight('n1');
      if (!next) return;
      const c = camp();
      if (!c.nightsDone.includes('n1')) c.nightsDone.push('n1');
      if (boot) { beginNight(next); f.save(); return; }
      playDay(nightById(next)).then(() => { beginNight(next); f.save(); });
    },
    nightDone,
    // Before flow enters a step: a replay that ran past its mission ends instead (true = handled).
    intercept(s) {
      // [story2] A boss fight resumes at the phase this save reached (a checkpoint after every phase).
      if (s?.type === 'boss' && s.boss && !replay) { const b = camp().boss; d.bosses?.resumeAt?.(s.boss, b?.id === s.boss ? b.phase : 0); }
      if (!replay) return false;
      if (s && s.mission === replay.mission && s.type !== 'credits' && s.type !== 'nightEnd') return false;
      missionDone(replay.mission);
      endReplay();
      return true;
    },
    // A step is being entered (flow.enterStep, after its own work).
    enter(s) {
      if (s.mission !== lastMission) { if (lastMission) missionDone(lastMission); lastMission = s.mission; }
      if (current && current !== s) exitCurrent();
      stepEntered = s;
      // A step's own hour or weather (story-format.md 2), held until the next step begins.
      env.unpin('story:step');
      if (s.time != null || s.weather) env.pin('story:step', s.time ?? null, s.weather ?? null, s.weatherSnap ?? false);
      travel.enter(s, { next: f.objectives.peek?.() ?? null });
      if (s.reward) reward(s.reward, { step: s.id });
      // A night's tutorial beat for its new enemy role or mechanic: a card with the answer.
      if (s.tip) hud.card?.(s.tip.title, s.tip.text, s.tip.ms ?? 8000);
      lifeKit.calls.enter(s);
      lifeKit.locks.enter(s);
      if (types[s.type]) { current = s; types[s.type].enter(s); }
      if (s.type === 'fight' && s.boss) d.bosses?.watch(s.boss);
      // [story2] The squad waiting at a fight is overheard before it starts (data for the bark system).
      if (s.type === 'fight' && !replay) overhear(s);
      // A later night's collect step: a glint where the thing is.
      if (night.id !== 'n1' && s.type === 'collect' && site(s.site)) { current = s; this._collectMark = markerProxy.place('scan', site(s.site)); }
      if (s.optional?.length) for (const o of s.optional) if (o.title) hud.card?.('OPTIONAL', o.title, 3500);
    },
    update(dt) {
      markers?.update(dt);
      travel.update(dt);
      lifeKit.calls.update(dt);
      lifeKit.locks.update(dt);
      const s = f.objectives.step;
      if (current && s === current && types[s.type]) types[s.type].update(dt, s);
      // Optional objectives on this step: reach-style ones tick when a hero gets there.
      if (s?.optional?.length) {
        for (const o of f.objectives.optionals()) {
          const at = site(o.site);
          if (!at) continue;
          if (f.standing().some((h) => Math.hypot(h.pos.x - at.x, h.pos.z - at.z) < (o.radius ?? 4) && Math.abs(h.pos.y - at.y) < 5)) {
            f.objectives.completeOptional(o.id);
            if (o.lines?.length) radio?.say(o.lines);
            if (o.reward) reward(o.reward, { step: s.id });
            optional(o.id, { xp: o.xp ?? 40, label: o.done ?? o.title ?? 'Optional objective complete' });
          }
        }
      }
    },
    marker() {
      const s = f.objectives.step;
      if (current && s === current && types[s.type]) return types[s.type].marker();
      return null;
    },
    collected(s) { if (this._collectMark) { markerProxy.release(this._collectMark); this._collectMark = null; } },
    onRespawn(s) {
      if (current && s === current) types[s.type]?.onRespawn(s);
    },
    // Mission select (the Batcomputer, workstream K/L): replay a done mission without touching the
    // save's own place; the run returns to it when the mission ends.
    replayMission,
    endReplay,
    // Dev and tests: jump straight into a night (its first step, or a step id).
    beginNight: (id, stepId = null) => { const i = stepId ? stepsOf(id).findIndex((s) => s.id === stepId) : 0; beginNight(id, { index: Math.max(0, i) }); },
    fail: (lines) => fail(f.objectives.step, lines),
    _collectMark: null,
    musicOverride: null,
    // [story2]
    get opening() { return openNight(); },
    get choices() { return camp().choices ?? {}; },
    get calls() { return lifeKit.calls; },
    get locks() { return lifeKit.locks; },
    get viewFx() { return viewFx; },
    get endgame() { return endgame; },
    ending: () => endingFor(theGame()?.bruce?.life ?? null),
    // Dev, playthrough and night-sim: where to stand to finish the current campaign step, and answer
    // any open choice with its default.
    debugSolve() { const s = f.objectives.step; return s && types[s.type]?.debugSolve ? types[s.type].debugSolve(s) : null; },
    debugAnswer() { if (lifeKit.calls.open) { lifeKit.calls.answer(lifeKit.calls.open.default); return true; } return types.civvy.debugAnswer?.() ?? false; },
    get stepTypes() { return types; },
    get ui() { return ui; },
  };
  return api;
}
