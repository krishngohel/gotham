// Drives the story: objectives, fights, pickups, cutscenes, trophies, checkpoints, death.
import { healAfterFight } from '../combat/rules.js';
import { STEPS, tutorialFor } from './story.js';
import { FIGHTS } from './fights.js';
import { SCENES } from './scenes.js';
import { checkpointFor } from './objectives.js';
// [story] The campaign (workstream J1): a mission runner that is a superset of the old linear walk,
// and the story runtime that loads later nights, their sites, fights and new step types.
import { createRunner, resumeCheckpoint } from '../story/runner.js';
import { createStoryRuntime } from '../story/storyRuntime.js';
import { bannerText, createGate } from './storyCues.js';
import { createNudge } from './nudge.js';
import { tickedBy, CHECKLIST, CHECKLIST_TITLE } from './caseFile.js';
import { SITES } from '../world/mapData.js';
import { saveProgress, TROPHY_COUNT } from '../core/save.js';
import { withPlayer } from '../core/events.js';
import STORY from '../story.config.js';
// [net] Online co-op (workstream D2): a guest's flow is a replica of the host's (src/net/mode.js).
import { isReplica, isNetHost, netMode } from '../net/mode.js';
// [onboard] Goal hand-off and approach reveal (src/ui/hudDirector.js).
import { approachLevel, handoffMs } from '../ui/hudDirector.js';
import { getAccess } from '../ui/accessibility.js';

// Part S mission types: async beats that finish on their own event instead of a site radius. Each
// tries the real system first (through window.__game, never captured at creation so it still works
// however late that part attaches itself) and falls back to a short timer, so the story always
// reaches credits with any subset of Vehicles, Batwing or Nightwing missing.
const ASYNC_TYPES = new Set(['radio', 'chase', 'battle', 'armada', 'courier', 'ally', 'board']);
// [story] Step types the story runtime runs itself (src/story/stepTypes.js): no site radius here.
const RUNTIME_TYPES = new Set(['scan', 'traverse', 'puzzle', 'fork', 'fear', 'nightEnd', 'wait']);
const DEGRADE_MS = 2200;
// [onboard] Steps finished by walking somewhere: the goal after them is revealed on the approach.
const REVEAL_TYPES = new Set([undefined, 'reach', 'collect', 'interior']);
// A plain travel step may still finish while Batman is driving or flying (that is the point of
// getting there). Every other kind of beat needs her on foot first (coordinator guidance,
// 2026-09-30): a cutscene, fight, boss, collect or any of these async ones except the three that
// put her IN a vehicle on purpose (chase, battle, armada) or ask her to get into one herself
// (board; forcing an exit here would fight its own "already driving? finish at once" check below).
const EXIT_VEHICLE_TYPES = new Set(['cutscene', 'fight', 'boss', 'radio', 'courier', 'ally', 'interior', 'collect', 'scan', 'puzzle', 'fear', 'traverse']);

// [net] The host waits (with a cap) for an online partner to finish reading a comic before the story
// moves on; everyone else carries on at once.
const partnerDone = (index) => (isNetHost() && netMode.net?.waitScene ? netMode.net.waitScene(index) : Promise.resolve());

let flowMusicOverride = null; // [integration] see the musicContext accessor below
export function createFlow(d) {
  const { hero, encounters, hud, events, progress, storage, comic, stage, prompts, waypoint, beacon, trophies, pickups, collision, radio } = d;
  const side = d.side ?? { holdStory: () => false, marker: () => null, onRespawn: () => null };
  // Co-op partners (src/players/players.js): every player after player 0. The story, checkpoints and
  // the camera follow player 0's hero; the others are healed and brought along with it.
  const others = () => (d.players ? d.players.list.slice(1) : []);
  // Every hero in the story (co-op, workstream D1: any of them can reach a goal, start a fight,
  // pick up an item or a trophy). Player 0's alone without co-op.
  const allHeroes = () => (d.players ? d.players.list.map((p) => p.hero) : [hero]);
  const heroList = [];
  function standing() { heroList.length = 0; for (const h of allHeroes()) if (!h.dead) heroList.push(h); if (!heroList.length) heroList.push(hero); return heroList; }
  function healOthers() { for (const p of others()) { p.hero.health = p.hero.maxHealth; p.hudSlot?.setHealth(1); } }
  // Partners placed beside player 0's hero (a story step that puts her somewhere puts everyone
  // there). onlyFar: leave a partner already close by where they are.
  function bringAlong({ onlyFar = 0 } = {}) {
    others().forEach((p, i) => {
      const h = p.hero;
      if (onlyFar && Math.hypot(h.pos.x - hero.pos.x, h.pos.z - hero.pos.z) < onlyFar && Math.abs(h.pos.y - hero.pos.y) < 4) return;
      d.onPlacePartner?.(p);
      const a = hero.bat.yaw + Math.PI * (0.6 + 0.8 * i);
      const x = hero.pos.x + Math.sin(a) * 1.8, z = hero.pos.z + Math.cos(a) * 1.8;
      const gy = collision?.groundBelow?.(x, hero.pos.y + 1.5, z, 0.3) ?? -Infinity;
      h.teleport({ x, y: gy > -Infinity && Math.abs(gy - hero.pos.y) < 1.5 ? gy : hero.pos.y, z: gy > -Infinity && Math.abs(gy - hero.pos.y) < 1.5 ? z : hero.pos.z }, hero.bat.yaw);
    });
  }
  // After a won fight: how much health comes back depends on the difficulty (story: all of it, as
  // before; knightmare: none). src/combat/rules.js healAfterFight.
  const diff = () => d.getDifficulty?.() ?? 'story';
  function healAfterWin(h, slot) { h.health = healAfterFight(diff(), h.health, h.maxHealth); slot?.setHealth(h.health / h.maxHealth); }
  // Back on their feet beside player 0's hero (a respawn, a checkpoint).
  function regroup() {
    others().forEach((p) => {
      const h = p.hero;
      h.dead = false;
      h.health = h.maxHealth;
      h.control = null;
      p.hudSlot?.setHealth(1);
      p.hudSlot?.setDown(null);
    });
    bringAlong();
    d.onRegroup?.();
  }
  // The nearest standing hero to a point (and its distance): who the nudge and the marker measure.
  function nearestTo(pt) {
    let best = hero, bd = Infinity;
    for (const h of standing()) { const dd = Math.hypot(h.pos.x - pt.x, h.pos.z - pt.z); if (dd < bd) { bd = dd; best = h; } }
    return best;
  }
  let markerTarget = null;
  // [story] The step list in play: Night One's STEPS, or a later night's (story.load). The site and
  // fight lookups go through the story runtime so a night's own places resolve; Night One's are
  // the same SITES and FIGHTS as always.
  let steps = STEPS;
  let objectives = createRunner(steps, progress.step);
  const site = (id) => story.site(id);
  const fightDef = (id) => story.fight(id);
  let mode = 'play';
  let target = null;
  let fightStarted = false;
  let t = 0;

  const save = () => saveProgress(storage, progress);
  const theGame = () => (typeof window !== 'undefined' ? window.__game : null);

  // Cues wait until the screen is hers: no comic page or cinematic up (and, for the checklist
  // card, no radio line or banner either).
  const clearScreen = () => mode === 'play' && !comic?.playing && !theGame()?.cinematic?.active;
  let lastBanner = null, stepAge = 0;
  // Travel steps only: a fight, a chase or a cutscene already tells her what to do.
  const nudge = createNudge();
  const NUDGE_TYPES = new Set([undefined, 'reach', 'board', 'interior', 'collect']);
  // [onboard] Reaching a goal holds the next one's banner and lines for a beat (handoffUntil):
  // the marker bursts and the caption ticks off first, control never leaves her.
  let handoffUntil = 0, pendingLines = null, faceGlide = null;
  const FACE_GLIDE = 0.7;
  const huds = () => hud.all?.() ?? [hud];
  function beginHandoff() {
    handoffUntil = t + handoffMs(!!getAccess().reducedMotion) / 1000;
    waypoint.burst?.();
    for (const h of huds()) h.reached?.();
  }
  const bannerGate = createGate({ canShow: () => clearScreen() && t >= handoffUntil, show: (text) => { hud.banner?.(text); events.emit('objectiveReveal', { text }); } });
  const checklistGate = createGate({
    canShow: () => clearScreen() && !radio?.playing && !hud.bannerShowing,
    // [onboard] A case-file tick is a checkpoint: a small chip under the caption, not a centre card.
    show: (item) => { const text = `Case file: ${item.got} (${CHECKLIST.indexOf(item) + 1}/${CHECKLIST.length})`; if (hud.chip) { for (const h of huds()) h.chip?.(`case:${item.got}`, text, 'checkpoint'); } else hud.card(CHECKLIST_TITLE, text, 6500); },
  });

  function siteOf(s) {
    if (!s) return null;
    if (s.type === 'fight') { const f = fightDef(s.fight); return typeof f.site === 'string' ? site(f.site) : f.site; }
    if (s.type === 'boss') return story.bossSite(s) ?? SITES.arena;
    return s.site ? site(s.site) : null;
  }

  // Where to put the hero when loading or after going down.
  function respawnPoint() {
    const s = objectives.step;
    if (s?.type === 'fight') {
      const f = fightDef(s.fight);
      // Predator rooms respawn at their entry, above the room and out of sight.
      if (f.entry) return { ...site(f.entry) };
      const at = typeof f.site === 'string' ? site(f.site) : f.site;
      const r = f.radius + 3;
      const x = at.x, z = at.z + r;
      const y = collision.groundBelow(x, at.y + 4, z, 0.3);
      if (y > -Infinity && Math.abs(y - at.y) < 3) return { x, y, z };
      return { ...at };
    }
    // [m23] Later nights: never put her down on the goal of the travel step she is on (a resumed
    // save would finish it unplayed): src/story/runner.js resumeCheckpoint. Night One is unchanged.
    const cp = story.nightOne ? checkpointFor(steps, objectives.index) ?? story.startSite : resumeCheckpoint(steps, objectives.index, { site, start: story.startSite });
    return { ...(site(cp) ?? SITES.start) };
  }

  // One synthetic "done" event per async step, whether the real system finished it or it degraded
  // to a timer. objectives.js matches these the same way either way. Deferred a tick: a real part
  // that reports done() synchronously (as 'ally' does below) must never re-enter enterStep() while
  // the step that triggered it is still being entered.
  function finishAsync(step, ok = true) { setTimeout(() => advance({ type: `${step.type}Done`, id: step.id, ok }), 0); }

  // Hands an async step to the real part if window.__game has it, wired to call `done` when that
  // part reports finished. Returns false (never having called anything) when the part, or the one
  // method this step needs, is not there yet.
  function tryReal(step, done) {
    const G = theGame();
    if (!G) return false;
    switch (step.type) {
      case 'chase':
        if (!G.vehicles?.startChase) return false;
        // Normal play: a 'board' step always runs first (see below), so Batman is already driving
        // the Batmobile by the time this fires and startChase never has to place her at all. The
        // teleport-and-summon inside startChase only fires as a last-resort fallback (an old save
        // resuming mid-mission, say), never on the path a player actually takes.
        // [story2] a night's own chase vehicle and toast (step.van: { type, color, toast, label })
        G.vehicles.startChase({ path: step.path ?? null, look: step.van ?? null, onDone: (r) => done(r?.ok !== false) });
        return true;
      case 'battle':
        // Same as chase: the 'board' step ahead of this one gets her into the Batmobile for real,
        // so startBattle's own teleport-and-summon is a fallback, not the normal path.
        if (!G.vehicles?.startBattle) return false;
        G.vehicles.startBattle({ site: siteOf(step), drones: step.drones ?? 6, onDone: (r) => done(r?.ok !== false) });
        return true;
      case 'armada':
        if (!G.batwing?.startArmada) return false;
        G.batwing.call?.();
        // The balloons fill a fixed box around the step's site (where the text says they are and
        // the marker points), when the step gives one; otherwise ahead of the plane.
        {
          const c = step.field && site(step.site);
          const region = c ? { cx: c.x, cy: c.y, cz: c.z, ...step.field } : null;
          G.batwing.startArmada({ balloons: step.balloons ?? 12, region, onDone: (r) => done(r?.ok !== false) });
        }
        return true;
      case 'courier': {
        if (!G.nightwing?.spawn || !G.nightwing?.courierFlee) return false;
        const p = site(step.at) ?? target ?? hero.pos;
        G.nightwing.spawn(p, 'courier');
        const off = events.on('courierEscaped', () => { off(); done(true); });
        setTimeout(() => G.nightwing?.courierFlee(site(step.to) ?? p), 1200);
        return true;
      }
      case 'ally':
        if (!G.nightwing?.spawn) return false;
        // A human playing Nightwing is the ally: the AI one steps aside (workstream D1).
        if (!d.humanNightwing?.()) G.nightwing.spawn(site(step.at) ?? hero.pos, 'ally');
        done(true);
        return true;
      // A real, player-driven "get in the car" beat (no teleport): the Batmobile parks itself at
      // the step's own site (vehicles.park, a short slide-in for drama), and the step only
      // completes once Batman actually gets in it himself, at whatever pace he likes. Already
      // driving it (a save resumed mid-mission, or she never got out after the last mission):
      // finish at once, nothing to walk up to.
      case 'board': {
        if (!G.vehicles?.park) return false;
        if (G.vehicles.active === G.vehicles.batmobile) { done(true); return true; }
        const spot = siteOf(step);
        if (spot) G.vehicles.park(spot);
        const off = events.on('vehicleEnter', ({ kind }) => { if (kind === 'batmobile') { off(); done(true); } });
        return true;
      }
      default:
        return false;
    }
  }

  // A letterboxed in-engine camera moment (window.__game.cinematic, from the night branch) before
  // a step's own comic or dialogue. `step.cinematic` is either { shots, lines } (played as-is) or
  // { orbit: { center, radius, height, dur, opts }, lines } (an establishing arc). Degrades to an
  // already-resolved promise when the step has none, or the part isn't there.
  function playCinematicFor(step) {
    const spec = step.cinematic;
    if (!spec) return Promise.resolve();
    return new Promise((resolve) => {
      const C = theGame()?.cinematic;
      if (!C) { resolve(); return; }
      const opts = { lines: spec.lines ?? [], onDone: resolve };
      const shots = spec.reveal === 'nightwing' ? revealShots() : spec.shots;
      const started = spec.orbit
        ? C.orbit(spec.orbit.center, spec.orbit.radius, spec.orbit.height, spec.orbit.dur, { ...(spec.orbit.opts ?? {}), ...opts })
        : shots ? C.play(shots, opts) : false;
      if (!started) resolve();
    });
  }

  // The reveal: Nightwing steps out in front of her, unmasked, on ground at her own height (tried
  // ahead, then to either side, then behind, so never off the edge of a deck), and the camera
  // frames the pair over her right shoulder, with the follow camera already behind her, so the
  // hand-back never sweeps through her. Returns the shots, or null if he can't appear.
  function revealShots() {
    const G = theGame();
    if (!G?.nightwing?.spawn) return null;
    const h = hero.pos;
    let spot = null, yaw = hero.bat.yaw;
    for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
      const a = hero.bat.yaw + turn;
      const x = h.x + Math.sin(a) * 4.5, z = h.z + Math.cos(a) * 4.5;
      const gy = collision.groundBelow(x, h.y + 1.5, z, 0.3);
      if (gy > -Infinity && Math.abs(gy - h.y) < 0.6) { spot = { x, y: gy, z }; yaw = a; break; }
    }
    if (!spot) return null;
    hero.bat.face(yaw);
    d.follow?.snapBehind(yaw, 0.22);
    G.nightwing.spawn(spot, 'pose');
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const at = (back, side, up) => ({ x: h.x - fx * back + rx * side, y: h.y + up, z: h.z - fz * back + rz * side });
    return [{ from: at(2.6, 1.7, 2.1), to: at(1.5, 1.2, 1.8), look: { x: spot.x, y: spot.y + 1.45, z: spot.z }, dur: 5 }];
  }

  // Plays a step's radio lines (if any), then either lets the real part run or, when it (or the
  // whole module) is missing, completes on a short timer. A pure 'radio' beat is done as soon as
  // its lines finish: the dialogue was the whole mission.
  function startAsync(step) {
    const done = (ok = true) => finishAsync(step, ok);
    const afterCinematic = () => {
      const proceed = () => {
        if (step.type === 'radio') {
          // He walks off with the reveal: Act 3's title card covers it, and the plaza beat spawns him
          // again as an ally where he is needed.
          if (step.cinematic?.reveal === 'nightwing') theGame()?.nightwing?.despawn?.();
          done(true);
          return;
        }
        // [net] A guest only hears the beat: the host runs the mission and says when it is done.
        if (isReplica()) return;
        if (tryReal(step, done)) return;
        setTimeout(() => done(true), DEGRADE_MS);
      };
      // [story] talk: 'over' starts the real part at once and lets the lines play over it (the
      // pacing rule: talk while moving; the next marker appears with the first line).
      if (step.lines?.length && radio && step.talk === 'over') { radio.say(step.lines); proceed(); }
      else if (step.lines?.length && radio) radio.say(step.lines).then(proceed);
      else proceed();
    };
    playCinematicFor(step).then(afterCinematic);
  }

  async function playScene(name) {
    mode = 'cutscene';
    document.exitPointerLock?.();
    hud.setVisible(false);
    radio?.skip(); // a comic page takes the whole screen; any dialogue beat still up steps aside
    events.emit('cutscene', { name, on: true });
    // [story] A later night's scenes live in its own data file (story.scenePages).
    const pages = SCENES[name] ? SCENES[name](stage) : story.scenePages(name);
    if (pages.length) await comic.play(pages);
    hud.setVisible(true);
    events.emit('cutscene', { name, on: false });
    mode = 'play';
  }

  function enterStep() {
    // [story] A mission replay that has run past its mission hands back to the save's own place.
    if (story.intercept(objectives.step)) return;
    const s = objectives.step;
    // [story] Night One writes the save's step as always; a later night (or a replay) records its
    // own place in progress.campaign instead, so everything keyed off Night One's step stays put.
    if (!story.record(objectives.index, s?.id ?? null)) {
      progress.step = objectives.index;
      progress.stepId = s?.id ?? null;
    }
    save();
    if (!s) return;
    // [story2] a vehicle boss (Firefly) is fought from the Batmobile: its step keeps her in the car
    if (EXIT_VEHICLE_TYPES.has(s.type) && !s.vehicle) {
      const G = theGame();
      if (G?.vehicles?.active) G.vehicles.exit();
      if (G?.batwing?.active) G.batwing.exit();
    }
    hud.setObjective(s.text ?? '');
    stepAge = 0;
    nudge.reset();
    const banner = bannerText(s, lastBanner);
    // Shown this frame when it can be, before the 'step' listeners below push their own cards.
    if (banner) { lastBanner = banner; bannerGate.set(banner); bannerGate.update(); }
    const item = tickedBy(s.id);
    if (item) checklistGate.set(item);
    target = siteOf(s);
    fightStarted = false;
    waypoint.update(null);
    beacon.set(target);
    // A step's own tips go to the front, and anything queued two steps ago is dropped: a tip
    // should arrive while it still applies (see createPromptQueue).
    // face: turn her (and the camera behind her) toward a site as the step begins, e.g. away
    // from the Batsignal lamp she walked up to and toward the Docks she is about to head for.
    if (s.face && site(s.face)) {
      const p = site(s.face);
      const yaw = Math.atan2(p.x - hero.pos.x, p.z - hero.pos.z);
      // [onboard] A camera glide toward it (over FACE_GLIDE s), not a cut; she turns herself.
      if (d.follow?.state) faceGlide = { yaw, t: 0 };
      else { hero.bat.face(yaw); d.follow?.snapBehind(yaw, 0.22); }
    }
    // placeAt: stand her at a fixed vantage point (a site with a yaw) as the step begins, e.g. away
    // from the Batsignal lamp she just walked up to, with it behind her and the camera, so it isn't
    // filling the view for the next beats. A fixed spot, not "a step back from wherever she is":
    // standing right on the lamp's own spot left no direction to step back in. Only on ground.
    if (s.placeAt && site(s.placeAt)) {
      const p = site(s.placeAt);
      const gy = collision.groundBelow(p.x, p.y + 1.5, p.z, 0.3);
      if (gy > -Infinity) {
        hero.teleport({ x: p.x, y: gy, z: p.z }, p.yaw ?? hero.bat.yaw);
        hero.bat.face(p.yaw ?? hero.bat.yaw);
        d.follow?.snapBehind(p.yaw ?? hero.bat.yaw, 0.22);
        bringAlong();
      }
    }
    prompts.newStep?.();
    const tips = tutorialFor(s, progress.moves);
    if (tips) prompts.show(tips, { first: true });
    events.emit('step', { step: s, index: objectives.index });
    if (s.type === 'fight' && !isReplica()) encounters.begin(s.fight, fightDef(s.fight));
    if (s.type === 'cutscene' && s.scene === 'finale') {
      radio?.skip();
      // mode stays 'play' through any cinematic first (same reason as the general cutscene branch
      // below): cinematic.update() only ticks under mode 'play'. Switch to 'finale' only once the
      // cinematic (if any) has handed off to the finale sequence itself.
      playCinematicFor(s).then(() => {
        mode = 'finale';
        document.exitPointerLock?.();
        hud.setVisible(false);
        return d.finale.play();
      }).then(() => { hud.setVisible(true); mode = 'play'; netMode.net?.sceneDone?.(objectives.index); return partnerDone(objectives.index); }).then(() => advance({ type: 'cutsceneDone', scene: 'finale' }));
    } else if (s.type === 'cutscene') {
      const REWARD = { crates: 'crates', rig: 'rig', antidote: 'antidote' };
      if (s.scene === 'rig') d.neonRelight?.show();
      // mode stays 'play' while any cinematic plays first: cinematic.update() (src/game/game.js)
      // only ticks under mode 'play', since it manages its own pause (hero.frozen) rather than
      // needing flow's own cutscene mode. playScene() below still sets mode to 'cutscene' itself,
      // once the comic actually starts.
      const at = objectives.index;
      // [onboard] Straight after reaching or grabbing something, the world's acknowledgement (the
      // marker burst, the stinger) plays before the comic page takes the screen.
      const beat = Math.max(0, handoffUntil - t);
      (beat > 0 ? new Promise((r) => setTimeout(r, beat * 1000)) : Promise.resolve()).then(() => playCinematicFor(s)).then(() => playScene(s.scene)).then(() => {
        if (REWARD[s.scene]) pickups.hide(REWARD[s.scene]);
        netMode.net?.sceneDone?.(at);
        return partnerDone(at);
      }).then(() => advance({ type: 'cutsceneDone', scene: s.scene }));
    }
    // He opens the fight from his balcony ten meters up, above the top of the usual view (the
    // level 0.22 pitch put him a full screen off the top): face him and tilt the camera up so he
    // sits under the boss bar; after a moment it settles back to a playing view of the floor and
    // its buzzer tiles, unless she has already taken the camera.
    // [story] Bosses run through the boss framework (src/bosses/director.js); the Joker's def plays
    // the same intro comic, begin and camera turn this block always did.
    if (s.type === 'boss') {
      // [net] A guest's Joker is the host's (src/net/game/bossNet.js). The campaign's other bosses
      // are not replicated yet (docs/design/polish-list.md).
      if (isReplica()) playScene('bossIntro').then(() => { netMode.net?.bossBegin?.(); });
      else if (d.bosses) d.bosses.begin(s.boss ?? 'joker', { step: s, playScene });
      else playScene('bossIntro').then(() => {
        d.boss?.begin();
        const j = d.boss?.joker?.pos;
        if (!j) return;
        const yaw = Math.atan2(j.x - hero.pos.x, j.z - hero.pos.z);
        hero.bat.face(yaw);
        d.follow?.snapBehind(yaw, -0.2);
        d.follow?.settlePitch?.(0.12, 2.5);
      });
    }
    if (ASYNC_TYPES.has(s.type)) startAsync(s);
    story.enter(s);
    // Hand-off lines on a plain step (reach, fight, collect, interior): what just happened and
    // why she is going where she is going. Async beats play their own lines in startAsync().
    if (!ASYNC_TYPES.has(s.type) && s.type !== 'cutscene' && s.lines?.length) { if (t < handoffUntil) pendingLines = s.lines; else radio?.say(s.lines); } // [onboard] after the hand-off beat
    if (s.type === 'credits') {
      story.nightDone();
      progress.finished = true;
      save();
      mode = 'credits';
      d.onCredits?.();
    }
  }

  function advance(ev) {
    // [net] Only the host moves the story on; a guest follows its 'step' events (follow below).
    if (isReplica()) return false;
    const prev = objectives.step;
    if (!objectives.handle(ev)) return false;
    events.emit('objectiveDone', ev);
    // A fight's own tip cards are about that fight: they leave with it.
    if (prev?.type === 'fight') prompts.dropStepTips?.();
    enterStep();
    return true;
  }

  events.on('fightStart', ({ id }) => {
    if (objectives.step?.fight !== id) return;
    fightStarted = true;
    beacon.set(null);
  });
  events.on('fightDone', ({ id }) => {
    if (isReplica()) return;
    // [onboard] The last knockout gets its moment before the next goal's banner and lines.
    handoffUntil = t + handoffMs(!!getAccess().reducedMotion) / 1000;
    healAfterWin(hero, hud);
    for (const p of others()) healAfterWin(p.hero, p.hudSlot);
    setTimeout(() => encounters.cleanupBodies(), 5000);
    advance({ type: 'fightDone', id });
  });
  events.on('bossDefeated', async (ev) => {
    if (isReplica()) return;
    hero.health = hero.maxHealth;
    healOthers();
    // [story] The boss framework plays each boss's own outro; the Joker's is still 'bossEnd'.
    const id = ev?.id ?? 'joker';
    if (d.bosses) await d.bosses.outro(id, playScene);
    else { await playScene('bossEnd'); d.boss?.hide(); }
    await partnerDone(objectives.index);
    advance({ type: 'bossDone', id });
  });
  events.on('heroDown', () => {
    // [net] The team going down is the host's call; it tells a guest where to respawn.
    if (isReplica()) return;
    if (mode !== 'play') return;
    mode = 'dead';
    setTimeout(async () => {
      await playScene('death');
      respawn();
    }, 1500);
  });

  function respawn({ manual = false } = {}) {
    hero.dead = false;
    hero.health = hero.maxHealth;
    hud.setHealth(1);
    hud.clearGlyphs();
    const finished = story.nightOne && (objectives.done || steps[objectives.index]?.type === 'credits');
    // Side content first: it clears a crime fight or a challenge and may want the hero back at a
    // challenge marker instead of the story checkpoint. `manual` distinguishes a pause-menu
    // "Restart from checkpoint" (the hero was never actually knocked down) from a real death.
    const over = side.onRespawn({ manual });
    const p = over ?? (finished ? { ...SITES.start } : respawnPoint());
    // Face the objective, not whatever wall we happened to be looking at.
    const aim = over || finished ? null : target;
    const yaw = over?.yaw ?? (aim ? Math.atan2(aim.x - p.x, aim.z - p.z) : hero.bat.yaw);
    hero.teleport(p, yaw);
    const s = objectives.step;
    if (s?.type === 'fight') encounters.restart();
    if (s?.type === 'boss') { if (d.bosses) d.bosses.restart(); else d.boss?.restart(); }
    story.onRespawn(s);
    d.follow.snapBehind(hero.bat.yaw);
    regroup();
    mode = 'play';
  }

  function collectTrophy(index, by = null) {
    if (!progress.trophies.includes(index)) progress.trophies.push(index);
    const n = progress.trophies.length;
    const text = STORY.trophyMessages[Math.min(n, TROPHY_COUNT) - 1];
    hud.setTrophies(n, TROPHY_COUNT);
    if (story.nightOne && (objectives.done || steps[objectives.index]?.type === 'credits')) {
      const left = TROPHY_COUNT - n;
      hud.setObjective(left > 0 ? `Explore Gotham. ${left} Riddler trophy${left === 1 ? '' : 's'} still hidden.` : 'All twelve found! The Golden Knight suit is waiting on the title screen.');
    }
    hud.card(`Riddler trophy ${n} of ${TROPHY_COUNT}`, text);
    if (n >= TROPHY_COUNT) progress.goldUnlocked = true;
    save();
    events.emit('trophy', withPlayer({ index, count: n }, by));
  }

  // [story] The story runtime: later nights, new step types, travel texture, the campaign. It gets
  // the flow's own levers (advance, enterStep, the step list) through this small surface.
  const story = createStoryRuntime({
    d, hero, events, hud, radio, comic, stage, progress, encounters, collision, waypoint, beacon, prompts,
    save, standing, bringAlong, regroup, playScene, theGame, nearestTo,
    get mode() { return mode; },
    setMode: (m) => { mode = m; },
    get objectives() { return objectives; },
    get steps() { return steps; },
    advance: (ev) => advance(ev),
    load(list, index) { steps = list; objectives = createRunner(steps, index); },
    enterStep: () => enterStep(),
    respawn: (o) => respawn(o),
    respawnPoint: () => respawnPoint(),
    get target() { return target; },
    setTarget: (p) => { target = p; beacon.set(p); },
    freeRoamBase: () => freeRoamBase(),
  });
  // After the credits with nothing queued: roam the city, finish the trophy hunt.
  function freeRoamBase() {
    mode = 'play';
    target = null;
    beacon.set(null);
    const left = TROPHY_COUNT - progress.trophies.length;
    hud.setObjective(left > 0 ? `Explore Gotham. ${left} Riddler trophy${left === 1 ? '' : 's'} still hidden.` : 'Gotham is quiet. For tonight.');
    if (left > 0) prompts.show(['detective']);
    d.finale.freeRoam();
  }

  return {
    get mode() { return mode; },
    get objectives() { return objectives; },
    // [story] The music override sound.js reads ({ context, villain }): a boss's theme, a night's.
    // [integration] The story's music context, unless another system (the Bruce scenes) has set
    // its own for a while: `flow.musicContext = {...}` overrides, `= null` hands back to the story.
    get musicContext() { return flowMusicOverride ?? story.musicContext; },
    set musicContext(v) { flowMusicOverride = v ?? null; story.musicOverride = v ?? null; },
    get story() { return story; },
    get steps() { return steps; },
    get target() { return target; },
    start() {
      // [story] A save inside a later night is loaded onto that night's steps first (story.start);
      // Night One's own path below is unchanged.
      story.start();
      if (story.nightOne && (objectives.done || steps[objectives.index]?.type === 'credits')) {
        hud.setTrophies(progress.trophies.length, TROPHY_COUNT);
        pickups.restore(['crates', 'rig', 'antidote']);
        hero.teleport(SITES.start, hero.bat.yaw);
        this.freeRoam({ boot: true });
        return;
      }
      if (!story.nightOne) { pickups.restore(['crates', 'rig', 'antidote']); d.finale.freeRoam(); }
      if (objectives.index > 0) { hero.teleport(respawnPoint(), hero.bat.yaw); bringAlong(); }
      const got = story.nightOne ? steps.slice(0, objectives.index).filter((s) => s.type === 'collect').map((s) => s.item) : [];
      pickups.restore(got);
      if (got.includes('rig')) d.neonRelight?.show();
      hud.setTrophies(progress.trophies.length, TROPHY_COUNT);
      enterStep();
    },
    // Tip cards hold off while a goal is being announced (prompts.js quiet); side tips also wait
    // out a radio line and the first seconds of a step.
    quiet(own = false) { return t < handoffUntil || !!hud.bannerShowing || (!own && (stepAge < 8 || !!radio?.playing)); },
    update(dt, camera) {
      t += dt;
      if (mode !== 'play') return;
      const s = objectives.step;
      stepAge += dt;
      if (pendingLines && t >= handoffUntil) { const l = pendingLines; pendingLines = null; radio?.say(l); } // [onboard]
      if (faceGlide) { // [onboard] the camera eases round to face the step's site
        const st = d.follow.state, k = Math.min(1, dt / Math.max(0.05, FACE_GLIDE - faceGlide.t) * 1.6);
        st.yaw += Math.atan2(Math.sin(faceGlide.yaw - st.yaw), Math.cos(faceGlide.yaw - st.yaw)) * k;
        faceGlide.t += dt;
        if (faceGlide.t >= FACE_GLIDE) faceGlide = null;
      }
      bannerGate.update();
      checklistGate.update();
      story.update(dt);
      if (s && target && NUDGE_TYPES.has(s.type)) {
        const running = !side.holdStory() && !radio?.playing && clearScreen();
        const nh = nearestTo(target);
        if (nudge.update(dt, Math.hypot(nh.pos.x - target.x, nh.pos.z - target.z), running)) {
          radio?.say([s.nudge ?? { speaker: 'alfred', portrait: 'alfred', text: s.text }]);
          waypoint.pulse?.();
        }
      }
      if (!isReplica()) encounters.update(dt, d.players ? standing() : hero);
      if (s && target && !isReplica() && !side.holdStory() && s.type !== 'fight' && s.type !== 'boss' && s.type !== 'cutscene' && !ASYNC_TYPES.has(s.type) && !RUNTIME_TYPES.has(s.type) && s.type !== 'credits') {
        // Any standing hero at the goal reaches it (one player: her alone, as always).
        for (const h of standing()) {
          const dxz = Math.hypot(h.pos.x - target.x, h.pos.z - target.z);
          const dy = Math.abs(h.pos.y - target.y);
          // onFoot: only done once she is out of the car or plane ("get clear of the Batmobile").
          const G = s.onFoot ? theGame() : null;
          const mounted = !!(G?.vehicles?.active || G?.batwing?.active) && (!G?.coop || G.coop.mounted(h));
          if (dxz < (s.radius ?? 8) && dy < 6 && !mounted) {
            const by = h.player ?? null;
            beginHandoff(); // [onboard]
            if (s.type === 'collect') { pickups.take(s.item); story.collected(s); encounters.cleanupBodies(); events.emit('pickup', withPlayer({ item: s.item }, by)); advance({ type: 'collected', item: s.item }); }
            else {
              if (s.type === 'interior') { theGame()?.interiors?.enter?.(s.room); bringAlong(); }
              advance({ type: 'reached', step: s.id });
            }
            break;
          }
        }
      }
      const nearD = target ? Math.hypot(hero.pos.x - target.x, hero.pos.z - target.z) : Infinity;
      const near = target && nearD < 7 && Math.abs(hero.pos.y - target.y) < 5;
      // [onboard] The marker fades as she arrives (gone by 7 m, where it always hid), and the goal
      // after this one is revealed under the caption as she closes in, so reaching the site hands
      // over to something she has already seen coming.
      waypoint.fade?.(Math.min(1, Math.max(0, (nearD - 7) / 9)));
      const reachLike = s && target && !isReplica() && REVEAL_TYPES.has(s.type);
      let approachK = 0, nextText = '';
      if (reachLike) {
        let dmin = Infinity;
        for (const h of standing()) dmin = Math.min(dmin, Math.hypot(h.pos.x - target.x, h.pos.z - target.z));
        approachK = approachLevel(dmin, s.radius ?? 8);
        const nx = steps[objectives.index + 1];
        nextText = nx && nx.text && nx.type !== 'cutscene' && nx.type !== 'credits' ? nx.text : '';
      }
      for (const h of huds()) h.setApproach?.(approachK, nextText);
      const showMarker = target && !near && !(s?.type === 'fight' && fightStarted) && s?.type !== 'cutscene' && s?.type !== 'boss';
      // What the marker points at (every split view draws its own: game.js reads markerTarget).
      // [story] With no story target (a fight in progress, free roam), the runtime may still point
      // somewhere: an optional objective, the next night's start, a puzzle plate.
      markerTarget = side.marker() ?? (target && !(s?.type === 'fight' && fightStarted) && s?.type !== 'cutscene' && s?.type !== 'boss' ? target : null) ?? story.marker();
      waypoint.update(side.marker() ?? (showMarker ? target : null) ?? story.marker(), camera, hero.pos);
      beacon.update(t, hero.pos);
      for (const h of allHeroes()) {
        const b = trophies.update(t, h.pos);
        if (b >= 0) collectTrophy(b, h.player);
      }
      pickups.update(t);
      prompts.update(dt);
      radio?.update(dt);
    },
    // After the credits: roam the city, finish the trophy hunt, watch the searchlights sweep.
    // [story] Then, with the campaign ahead, the next night opens (its first step waits in free
    // roam until she heads for it; the Bruce day hook plays first when one is registered).
    freeRoam(opts = {}) {
      freeRoamBase();
      story.afterNightOne(opts);
    },
    jumpTo(index) { objectives.jump(index); encounters.end(); enterStep(); hero.teleport(respawnPoint(), hero.bat.yaw); bringAlong(); },
    // [net] A guest following the host's story: enter the host's step (no teleport: the host
    // places the guest's hero itself), with this step's beats (banner, radio, comic) played here.
    // [net2] o = { night, id, force }: the host's campaign position is (night id, step id). A guest
    // on another night's list loads the host's night first; the step id wins over the index (the
    // two lists can differ by a build's aliases); force re-enters the same step (a mission retry).
    follow(index, o = {}) {
      if (o.night && story.followNight(o.night)) { if (mode === 'credits') mode = 'play'; }
      if (o.id) { const i = objectives.indexOf(o.id); if (i >= 0) index = i; }
      if (index === objectives.index && objectives.step && !o.force) return;
      objectives.jump(index);
      if (mode === 'credits' && steps[index]?.type !== 'credits') mode = 'play';
      enterStep();
    },
    // [net] The host's respawn, on a guest: back on its feet where the host puts it.
    respawnAt(p, yaw) {
      hero.dead = false;
      hero.health = hero.maxHealth;
      hero.control = null;
      hud.setHealth(1);
      hud.clearGlyphs();
      hero.teleport(p, yaw);
      d.follow?.snapBehind(yaw);
      mode = 'play';
    },
    get stepIndex() { return objectives.index; },
    // [net] A comic the host's world played outside a step change (the boss's end), on a guest.
    playScene,
    // [story] A step id in the list in play (Night One's retired ids resolve through ALIASES), or -1.
    indexOf: (id) => story.indexOf(id),
    respawn,
    // Co-op: put the partners beside player 0's hero (a story teleport, the regroup rule).
    bringAlong,
    // Where the objective marker points right now (null: none), for every split view's own marker.
    get markerTarget() { return markerTarget; },
  };
}
