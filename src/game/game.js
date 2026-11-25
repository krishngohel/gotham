// Game shell: boot, title screen, the frame loop and the wiring between systems.
import '../gadgets/gadgetSave.js';
import '../progress/wayneSave.js';
import './vanChaseSave.js';
import '../bruce/save.js'; // [bruce] progress.bruce, progress.batcave
import { upgradeEffects } from '../progress/upgrades.js';
import { createWayneTech } from '../progress/wayneTech.js';
// ---- [prog] Wave 3 progression (workstream L1): skill tree page, stations, suit perks, Standing.
import { buildTreePage } from '../ui/skillTree/treePage.js';
import { withArrivals } from '../abilities/arrival.js'; // [verify] skill nodes say when their ability arrives
import { registerStation, openStation } from '../ui/stations.js';
import { registerBruceUI } from '../bruce/registry.js'; // [integration]
import { setStandingProvider } from '../progress/standing.js'; // [integration]
import { activeSuitPerkOps } from '../progress/suitData.js';
import { setDevStanding } from '../progress/standing.js';
const progSuitOps = (kitId, settings) => activeSuitPerkOps(kitId, settings);
import { ngPlusRewards } from '../progress/suitData.js';
import { getActiveSlot, setActiveSlot, slotStorage, slotSummary, copySlot, deleteSlot, writeSlot, exportCode, exportFile, importSave, slotKey, SLOTS as SLOT_IDS } from '../core/slots.js';
import { canNgPlus, startRunMode, DIFFICULTY_INFO, checkpointAllowed } from '../progress/mode.js';
import { buildSlotsPage, buildDifficultyRow } from '../ui/slotsMenu.js';
import { createAutosaveMark } from '../ui/autosaveMark.js';
import { saveSettings } from '../core/settings.js';
import { createReputation } from '../enemies/fear.js';
import { gadgetById, gadgetNewsCard } from '../gadgets/gadgetDefs.js';
import { createGadgetSystem, NEWS_CARD_S } from '../gadgets/gadgetSystem.js';
import { createGadgetWheel } from '../ui/gadgetWheel.js';
import { createGadgetHud } from '../ui/gadgetHud.js';
// [prog] gadgets (wave 3): shared wiring, the loadout station and the new gadgets' hints.
import { configureGadgets } from '../gadgets/config.js';
import { registerGadgetLoadout } from '../ui/gadgetLoadout.js';
import { newGadgetHints } from '../gadgets/gadgetDefs.js';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadSettings } from '../core/settings.js';
import { loadProgress, saveProgress, sanitizeProgress, DEFAULT_PROGRESS, newGameProgress } from '../core/save.js';
import { createInput, createInputFor, createScriptedInput } from '../core/input.js';
import { createEvents, onceEachId, withPlayer } from '../core/events.js';
import { createPlayers, createPlayer } from '../players/players.js';
import { assignDevices } from '../players/devices.js';
import { createReviveRules, scaledHealth, scaleWave, xpRecipients } from '../players/coopRules.js';
import { createBotDriver } from '../players/bot.js';
import { kitById } from '../heroes/roster.js';
import { XP } from '../progress/xp.js';
import { createTimeControl } from '../core/time.js';
import { createRng } from '../core/rng.js';
import { bindingLabel } from '../core/bindings.js';
import { getQuality, TIER_LABELS } from '../render/quality.js';
import { setAnimQuality } from '../anim/quality.js';
import { chooseTier, loadAutoTier, probeRendererString, settleAutoTier, measurePipeline } from '../render/tierDetect.js';
import { showTierAdvice } from '../ui/gpuInfo.js'; // [perf3]
import { createDetailGovernor } from '../render/detailGovernor.js'; // [perf3]
import { setCapeQuality } from '../actors/cape.js'; // [perf3]
import { maybeShowHwAccelDialog } from '../ui/hwAccel.js';
import { createRenderer } from '../render/renderer.js';
import { createInkPipeline } from '../render/inkPipeline.js';
import { paletteAt } from '../render/comicPalette.js';
import { loadAssets } from '../actors/assets.js';
import { createHero } from '../actors/hero.js';
import { buildReachTable } from '../combat/reach.js';
import { buildClimbClips } from '../actors/climbAnims.js';
import { buildStrikeClips } from '../actors/strikes.js';
import { buildReactionClips } from '../actors/reactions.js';
import { buildChainClips } from '../actors/chainAnims.js';
import { chainClipNames } from '../combat/chainTimeline.js';
import { buildStealthClips } from '../actors/stealthAnims.js';
import { createEnemy } from '../actors/enemy.js';
import { SITES } from '../world/mapData.js';
import { checkRooms } from '../stealth/roomCheck.js';
import { ROOMS } from '../stealth/stealthRooms.js';
import { createStealth } from '../stealth/stealthSystem.js';
import { pickGrapplePoint } from '../world/grapple.js';
import { createPickups, createNeonRelight } from '../world/storyProps.js';
import { createCombat } from '../combat/combatSystem.js';
import { createHud, SFX_WORDS } from '../ui/hud.js';
import { createRadio } from '../ui/radio.js';
import { createStealthHud } from '../ui/stealthHud.js';
import { glyphCode } from '../stealth/brain.js';
import { createComicFx } from '../ui/comicFx.js';
import { createComic } from '../ui/comic.js';
import { createMenus } from '../ui/menus.js';
import { createPromptQueue, chainLockedText, chainCostText, QUIET_CONTROLS, PROMPT_FOR_MOVE } from '../ui/prompts.js';
import { createWaypoint, createBeacon } from '../ui/waypoint.js';
import { createAudio } from '../audio/audio.js';
import { createVoice } from '../audio/voice.js';
import { createWorld } from './world.js';
import { createFollowCamera } from './camera.js';
import { createBatwing } from '../vehicles/batwing.js';
import { createCinematic } from '../ui/cinematic.js';
import { createGcpdRoof } from './gcpdRoof.js';
import { createGCPDLobby } from './gcpdLobby.js';
import { guestsUpTo, celebrateAt } from './roofStory.js';
import { CHECKLIST_TITLE, checklistAt } from './caseFile.js';
import { createFx } from './fx.js';
import { createStealthFx } from '../stealth/stealthFx.js';
import { createGadgetFx } from '../gadgets/gadgetFx.js';
import { createBreakables } from '../world/breakables.js';
import { createChainFx } from './chainFx.js';
import { createSwarmFx } from './swarmFx.js';
import { createEncounters } from './encounters.js';
import { createNightwing } from '../allies/nightwing.js';
import { createInteriors } from '../world/interiors.js';
import { createTrophies } from './trophies.js';
import { createFlow } from './flow.js';
import { STEPS } from './story.js';
import { migrateProgress } from './storyMigrate.js';
import { wireAudio } from './sound.js';
import { createCivilians } from '../civilians/civilians.js'; // [env]
import { warmCrowdTemplates } from '../civilians/crowd.js'; // [perf2]
import '../env/envSave.js'; // [env] progress.env: the clock and the weather seed
import { createBoss } from './boss.js';
import { edgeGlyph } from '../ui/edgeGlyph.js';
import { createVehicles } from '../vehicles/vehicles.js';
// [move] Traversal and vehicle upgrades (workstream L3): src/traversal/**.
import { createMoves } from '../traversal/movesRuntime.js';
import { tracker } from './progressTracker.js';
import { goldStandardPages, commendationPages } from './rewardPages.js';
import { createFinale } from './finale.js';
import { createSideContent } from './sideContent.js';
import { createPhotoMode } from '../ui/photoMode.js';
import { createWarmCast, createWarmCastLate } from './warmCast.js';
import { drawEverything, uploadTextures, readyObjects } from '../render/prewarm.js';
import { createDynamicRes, sanitizeResScale } from '../render/dynamicRes.js';
import { createFrameCapDetector } from '../render/frameCap.js';
import { createBruceLife } from '../bruce/runtime.js'; // [bruce]
import { createWanted } from '../wanted/wanted.js'; // [wanted] police attention and the GCPD (docs/design/wanted.md)
import { createSandbox } from '../sandbox/index.js'; // [sandbox] car radio, street furniture, stunts, taxis, taking cars
import { createImpactTimeline } from '../render/impactTimeline.js';
import { createImpactPanel } from '../ui/impactPanel.js';
// [prog] a11y: subtitles, accessibility options, per-player pads.
import { applyAccessibility, setTellResolver, flashScale as a11yFlash, impactModeFor, lightningFlash } from '../ui/accessibility.js';
import { createSubtitles } from '../ui/subtitles.js';
import { getAudioPrefs as a11yAudioPrefs } from '../audio/prefs.js';
import { gpuRenderer, gpuShortName, maybeShowGpuHint } from '../ui/gpuInfo.js';
// ---- Local co-op and split screen (workstream D1, src/coop/**) ----
import { createSplitScreen } from '../coop/splitScreen.js';
import { createHudGroup } from '../coop/hudGroup.js';
import { createCoop } from '../coop/coopRuntime.js';
import { lastPick, rememberPick } from '../coop/coopSave.js';
// [prog] suits: the run-time wardrobe (unlock toasts, campaign rewards) and the suit vault station.
import { createWardrobe } from '../progress/wardrobe.js';
import { bridgeStoryRewards } from '../progress/storyRewards.js'; // [fix1]
import { registerWardrobeStation } from '../ui/wardrobe.js';
import { createDeviceWatch } from '../coop/deviceWatch.js';
import { createHeroSelect } from '../ui/heroSelect.js';
import { createHeroPreview } from '../coop/heroPreview.js';
import { createCoopPrompt } from '../ui/coopPrompt.js';
import { prepareKit, kitReady } from '../heroes/kitModels.js';
import { heroOfKit, kitInfo } from '../heroes/roster.js';
import { isSuitId, suitById } from '../heroes/models/suits.js';
const suitIsBatman = (id) => suitById(id).hero === 'batman';
import { stepTier } from '../render/quality.js';
// ---- [net] Online co-op (workstream D2, src/net/**): the replica gate and the save field are tiny
// and load with the game; the rest (src/net/game/netGame.js) loads only when someone goes online.
import { isReplica } from '../net/mode.js';
import '../net/netSave.js';
// [story] The campaign's start params and the boss framework (workstream J1).
import { applyStartParams } from '../story/campaignSave.js';
import { stepsOf, registerDayHook } from '../story/campaign.js';
import { missionsOf as campaignMissionsOf } from '../story/campaign.js'; // [onboard]
import { createAbilities } from '../abilities/runtime.js'; // [onboard] the ability layer
import { PROMPT_ABILITY } from '../abilities/abilityDefs.js'; // [onboard]
import '../abilities/abilitySave.js'; // [onboard] progress.abilities
import { ALIASES } from './storyAliases.js';
import { createBossFramework } from '../bosses/index.js';
import { createNav } from '../nav/navSystem.js'; // [map] minimap, GPS, waypoints, fast travel
import { createTravelTransition } from '../nav/travelTransition.js'; // [map]
import { titleCamera } from '../ui/titleCam.js'; // [polish] title camera path
import { menuSound } from '../ui/uiSounds.js'; // [polish] menus use the newer ui-bus sounds

// Pad button names for co-op prompts (a gamepad player's hints name its buttons, Xbox layout).
const PAD_LABELS = { grapple: 'LB', punch: 'X', kick: 'B', jump: 'A', block: 'Y', cape: 'RB', batarang: 'RT', dodge: 'LT', special: 'R3', detective: 'View', map: 'Hold View', pause: 'Start', vehicle: 'D-pad left', throw: 'D-pad right', ping: 'Y + D-pad down' };

async function loadFonts() {
  try {
    const all = Promise.all(['64px Bangers', '32px "Patrick Hand SC"', '700 32px "Barlow Condensed"'].map((f) => document.fonts.load(f)));
    // Never hold the game hostage to a slow font server.
    await Promise.race([all, new Promise((r) => setTimeout(r, 4000))]);
  } catch { /* fonts are a nicety; canvases fall back to Impact */ }
}

// [env] URL options for the clock and weather: ?time=<0-24>, ?weather=<state>, ?daymin=<minutes>.
function envOptions(params) {
  const o = {};
  const t = parseFloat(params.get('time'));
  if (Number.isFinite(t)) o.startHour = ((t % 24) + 24) % 24;
  if (params.get('weather')) o.weather = params.get('weather');
  const dm = parseFloat(params.get('daymin'));
  if (Number.isFinite(dm) && dm > 0) o.dayMinutes = dm;
  return o;
}

export async function startGame({ canvas, hudRoot, params, onProgress = () => {} }) {
  // [net] `let`: an online guest's run writes its save through src/net/netSave.js guestStorage
  // (the guest keeps its own story), so the run's closures read this binding, not a copy.
  const realStorage = (() => { try { return window.localStorage; } catch { return null; } })();
  let storage = realStorage;
  // [prog] Save slots (src/core/slots.js): `storage` maps the progress key onto the active slot
  // (slot 1 is the old key itself); every write lights the autosave indicator.
  const activeSlot = getActiveSlot(realStorage);
  const autosaveMark = createAutosaveMark(document.body);
  const slotStore = slotStorage(realStorage, activeSlot, { onWrite: () => autosaveMark.ping() });
  storage = slotStore;
  const settings = loadSettings(storage);
  // [render] Quality tier: ?q=, else Settings > Video, else auto (the GPU string as a hint, then a
  // benchmark after prewarm; render/tierDetect.js).
  const gpuProbe = probeRendererString();
  const tierChoice = chooseTier({ param: params.get('q'), setting: settings.quality, gpu: gpuProbe, stored: loadAutoTier(storage), automated: !!navigator.webdriver });
  const quality = getQuality(tierChoice.tier);
  if (settings.inkLight !== 'auto' && quality.normals === 'mrt') quality.ao = quality.contact = quality.ssr = settings.inkLight === 'on'; // [env] Video > Ink lighting
  // Dead blending (medium up) and foot locking (high up) follow the tier (src/anim/quality.js).
  setAnimQuality(quality);
  setCapeQuality(quality); // [perf3] cloth sub-step cap per tier
  const renderer = createRenderer(canvas, quality);
  const ink = createInkPipeline(renderer, quality, { gpuTime: params.get('gputime') === '1' });
  ink.setComic(quality.comic);
  ink.setPalette(paletteAt(0, 0));
  const scene = new THREE.Scene();
  // The camera fill light exists from boot (dark until a run starts) so the light count never
  // changes: a new light would recompile every lit shader the first time each one is drawn.
  const fill = new THREE.DirectionalLight(0x9fb2d6, 0);
  scene.add(fill, fill.target);
  // [render] Far plane = the tier's draw distance (matched to its fog; render/quality.js).
  const camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.1, quality.drawDistance ?? 1500);
  const input = createInput({ target: window, bindings: settings.bindings });
  const events = createEvents();
  const time = createTimeControl();
  const audio = createAudio();
  // The split-screen view manager (workstream D1), created once the save is loaded (below).
  let split = null;

  // Boot timing marks (read with performance.getEntriesByType('mark')).
  const mark = (n) => performance.mark?.(`boot:${n}`);
  // Models download while the fonts load (the city's painted signs need the fonts first).
  const assetsPromise = loadAssets('./assets/', (f) => onProgress(0.1 + f * 0.6)).then((a) => { mark('assets'); return a; });
  const DEV_TOOLS = import.meta.env.DEV || params.get('god') === '1';
  // [prog] ?standing=N: a session-only Standing budget for the Wayne branch until K's meters exist.
  if (params.has('standing')) setDevStanding(Number(params.get('standing')));
  await loadFonts();
  mark('fonts');
  onProgress(0.1);
  // [env] ?time=<hour> and ?weather=<state> set the clock and pin the weather (dev, screenshots).
  const world = createWorld(scene, quality, envOptions(params));
  if (settings.timeOfDay === 'night' && !params.has('time')) world.clock.pin(23, { id: 'settings', under: true }); // [env] Gameplay > Time of day ([fix1] under the story's pins)
  mark('world');
  const assets = await assetsPromise;
  for (const c of buildClimbClips(SkeletonUtils.clone(assets.bodies.m), assets.clips)) assets.clips.set(c.name, c);
  for (const c of buildChainClips(SkeletonUtils.clone(assets.bodies.m), assets.clips)) assets.clips.set(c.name, c);
  for (const c of buildStealthClips(SkeletonUtils.clone(assets.bodies.m), assets.clips)) assets.clips.set(c.name, c);
  // More punches and kicks for freeflow (src/actors/strikes.js); mocap clips of the same name win.
  for (const c of buildStrikeClips(SkeletonUtils.clone(assets.bodies.m), assets.clips)) if (!assets.clips.has(c.name)) assets.clips.set(c.name, c);
  // Gadget poses and goon hit reactions (src/actors/reactions.js).
  for (const c of buildReactionClips(SkeletonUtils.clone(assets.bodies.m), assets.clips)) if (!assets.clips.has(c.name)) assets.clips.set(c.name, c);
  // Where each strike's fist or foot is on its contact frame, so lunges connect.
  const reach = buildReachTable(SkeletonUtils.clone(assets.bodies.m), assets.clips);
  mark('clips');
  onProgress(0.9);
  // Characters that only appear later (goons, the Joker, every suit) join the city for the
  // compile and the prewarm draw below, then leave again.
  const warmCast = createWarmCast(assets);
  scene.add(warmCast);
  // Compile the city's shaders behind the loading bar instead of freezing the first frame.
  try { await ink.compileAsync(scene, camera); } catch { /* compiles on first draw instead */ }
  mark('compiled');
  onProgress(0.97);

  let progress = params.has('new') ? sanitizeProgress(DEFAULT_PROGRESS) : loadProgress(storage);
  // Put the save on the story by step id (saves from before Part D only have an old index).
  progress = migrateProgress(progress);
  // [story] ?at=<Night One step> (retired ids resolve through ALIASES), ?night=n2[&at=<step>].
  if (params.has('at') || params.has('night')) progress = applyStartParams(progress, params, { nightSteps: stepsOf, nightOneSteps: STEPS, aliases: ALIASES });

  // ---- Split screen (workstream D1): one view per local player; one player = the old full screen.
  // Split drops one quality tier's runtime knobs (pixel ratio cap, draw distance, comic weights;
  // design 4.4). Shadow maps and the light pool keep the boot tier: changing them recompiles shaders.
  const splitQuality = getQuality(stepTier(quality.name, -1));
  let splitOn = false;
  const tierNow = () => (splitOn ? splitQuality : quality);
  split = createSplitScreen({
    ink, scene, fill, rain: world.rain,
    getLayout: () => progress.coop?.split ?? 'vertical',
    onLayout: ({ split: on }) => {
      if (on === splitOn) return;
      splitOn = on;
      const q = tierNow();
      for (const v of split.views) { v.camera.far = q.drawDistance ?? 1500; v.camera.updateProjectionMatrix(); }
      ink.setComic({ ...q.comic, wobble: settings.lineWobble && !settings.access.reducedMotion ? q.comic.wobble : 0 }); // [prog] a11y
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap) * sanitizeResScale(settings.renderScale, dynRes.scale));
      ink.setSize(innerWidth, innerHeight);
      canvas.classList.toggle('split', on);
      document.body.classList.toggle('coop-split', on);
    },
  });
  const devices = createDeviceWatch({ target: window });
  const coopPrompt = createCoopPrompt(document.body);
  const heroSelect = createHeroSelect({ root: document.body, progress, sound: menuSound((n, o) => audio.play(n, o)), onChange: (picks) => showPreview(picks) });
  const preview = createHeroPreview({ scene, assets });

  // Recorded Joker lines; the music ducks while he talks.
  const voice = createVoice({
    getVolume: () => settings.volume,
    duck: (on) => audio.setVolumes(on ? { ...settings.volume, music: settings.volume.music * 0.35 } : settings.volume),
  });
  const menus = createMenus({ root: document.body, settings, storage, input, sound: menuSound((n, o) => audio.play(n, o)), onChange: () => applySettings() });
  // [prog] a11y: captions for spoken lines (the audio subtitle hook), minus lines a goon's speech
  // balloon already shows; the HUD's tell glyphs ask which goon is ranged; a joining player gets
  // its own pad layout, hold/toggle modes and pad look.
  const subtitles = createSubtitles(document.body, { enabled: () => a11yAudioPrefs().subtitles, speakers: () => settings.access.subtitleSpeakers });
  audio.onSubtitle((sub) => subtitles.show(sub));
  events.on('stealthLine', ({ text } = {}) => subtitles.suppress(text));
  setTellResolver((id) => game?.combat?.enemies?.find((e) => e.id === id) ?? null);
  events.on('playerJoined', () => applyAccessibility(settings, { input, players: game?.players }));
  // Comic-style frame counter in the corner (Settings > Video hides it, or adds the GPU line).
  const fpsEl = Object.assign(document.createElement('div'), { className: 'fps' });
  fpsEl.innerHTML = '<span class="n">--</span><span class="u">fps</span><span class="d"></span>';
  document.body.appendChild(fpsEl);
  const fpsNum = fpsEl.querySelector('.n'), fpsD = fpsEl.querySelector('.d');
  const gpu = gpuRenderer(renderer.getContext());
  const gpuName = gpuShortName(gpu);
  // [render] Software rendering gets the hardware-acceleration dialog instead of the iGPU hint.
  const session = (() => { try { return window.sessionStorage; } catch { return null; } })();
  // Automated browsers (e2e on a software-GL machine) only get it when asked: ?hwcheck=1.
  const hwCheck = !navigator.webdriver || params.has('hwcheck');
  let gpuHintBox = (hwCheck ? maybeShowHwAccelDialog({ root: document.body, rendererString: gpu, storage, session, tier: quality.name, getRenderer: probeRendererString }) : null)
    ?? maybeShowGpuHint(document.body, gpu, storage);
  // Dynamic resolution rides on top of the Render scale setting (?dynres=0 turns it off, for
  // benchmarks run with vsync off, where there is no refresh budget to aim for).
  // A Retina / high-DPI screen starts at 80% and climbs while frames stay on time.
  const dynRes = createDynamicRes({ min: quality.dynResMin ?? 0.6, missLimit: 0.03, start: window.devicePixelRatio >= 2 ? 0.8 : 1, onChange: () => applyResolution() });
  // The browser capping play at 30 fps (Low Power Mode / Energy Saver): told once, see frameCap.js.
  const frameCap = createFrameCapDetector();
  // [perf3] Adaptive detail (src/render/detailGovernor.js): when dynamic resolution is at its floor
  // and frames still miss the refresh, trims CPU-side crowd and traffic budgets in small steps.
  const detailBase = { hull: quality.hullDistance ?? 40, anim: quality.animFullRate ?? 35 };
  const detailGov = createDetailGovernor({
    apply: (L, level) => {
      quality.hullDistance = detailBase.hull * L.crowd;
      quality.animFullRate = detailBase.anim * L.crowd;
      const tr = world.traffic;
      tr?.sim?.setLimit?.(tr.cap * L.spawn);
      game?.civilians?.sim?.setLimitScale?.(L.spawn);
      state.detailLevel = level;
      console.info(`[quality] adaptive detail level ${level}`);
    },
  });
  // Scripted runs (tests, perf scripts) keep fixed budgets unless asked: ?gov=1 (or ?gov=0 to turn it off for a player).
  if ((navigator.webdriver && params.get('gov') !== '1') || params.get('gov') === '0') detailGov.setEnabled(false);
  if (DEV_TOOLS) window.__detailGov = detailGov;
  function applyResolution() {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, (split?.split ? getQuality(stepTier(quality.name, -1)) : quality).pixelRatioCap) * sanitizeResScale(settings.renderScale, dynRes.scale));
    resize();
  }

  const state = { frame: 0, fps: 0, ready: false, t: 0, phase: 'title', paused: false };
  let game = null; // everything that exists once a run has begun
  // ---- [prog] suits: wardrobe (src/progress/wardrobe.js) + the Batcave 'suits' station ----
  const wardrobe = createWardrobe({ events, getProgress: () => progress, save: () => saveProgress(storage, progress), getHud: () => game?.hud ?? null });
  registerWardrobeStation({ wardrobe, getProgress: () => progress, getSettings: () => settings, inRun: () => !!game, sound: menuSound((n, o) => audio.play(n, o)) });
  if (DEV_TOOLS) window.__wardrobe = wardrobe;
  bridgeStoryRewards(events, { getProgress: () => progress, save: () => saveProgress(storage, progress), getHud: () => game?.hud ?? null }); // [fix1] the story's 'gadget:x' / 'suit:x' rewards reach progression; [verify] and xp, skill, gear, lore (stored in the save)
  // ---- [prog] suits end ----

  function applySettings() {
    input.setBindings(settings.bindings);
    game?.gadgets.refresh();
    audio.setVolumes(settings.volume);
    ink.uniforms.uHalftoneAmount.value = settings.halftone;
    // The tier in force: split screen runs one tier lower (see splitQuality).
    const tq = split?.split ? getQuality(stepTier(quality.name, -1)) : quality;
    ink.setComic({ ...tq.comic, wobble: settings.lineWobble && !settings.access.reducedMotion ? tq.comic.wobble : 0 }); // [prog] a11y
    dynRes.setEnabled(settings.dynamicRes && params.get('dynres') !== '0');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, tq.pixelRatioCap) * sanitizeResScale(settings.renderScale, dynRes.scale));
    fpsEl.style.display = settings.showFps ? '' : 'none';
    fpsEl.classList.toggle('detail', settings.fpsDetails);
    game?.follow.configure(settings);
    if (game) for (const p of game.players) if (p.rig) p.rig.follow.configure(settings);
    applyAccessibility(settings, { input, players: game?.players }); // [prog] a11y
    split?.setBaseFov(settings.fov);
    if (game) {
      game.combat.setDifficulty(settings.difficulty);
      game.wayne?.apply({ health: false }); // [prog] suit perks on/off change the effects
      const base = (settings.difficulty === 'story' ? 150 : 100) + (game.wayne?.effects.maxHealthBonus ?? 0);
      for (const p of game.players) {
        const h = p.hero;
        // A co-op kit's health multiplier (src/heroes/roster.js stats; 1 for Batman).
        const max = Math.round(base * (h.healthK ?? 1));
        if (h.maxHealth === max) continue;
        h.health = Math.round((h.health / h.maxHealth) * max);
        h.maxHealth = max;
        p.hudSlot?.setHealth(h.health / max);
      }
    }
    resize();
  }

  // [render] Dev split view (?views=2, src/dev/multiView.js), loaded only when asked for.
  let devViews = null;
  if (params.get('views') === '2') import('../dev/multiView.js').then(({ createDevViews }) => { devViews = createDevViews({ ink, scene, camera }); resize(); });
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    ink.setSize(w, h);
    devViews?.resize(w, h);
    split?.resize(w, h);
    world.resize(h * renderer.getPixelRatio(), camera.fov);
  }
  addEventListener('resize', resize);

  // ---------------- title screen ----------------
  function showTitle() {
    state.phase = 'title';
    input.setEnabled(false);
    audio.music('title');
    menus.title({
      canContinue: progress.step > 0,
      percent: tracker.score(progress).percent,
      onContinue: () => begin(progress.suit ?? 'm', false),
      // The save's alternate suits show, locked until earned (src/heroes/models/suits.js).
      // [prog] The suit select carries the difficulty row (tiers, modifiers); NG+ is the same page.
      onNew: () => newRunPage(false),
      onNgPlus: canNgPlus(progress) ? () => newRunPage(true) : null,
      onSlots: () => openSlots(),
      slotLine: `Slot ${activeSlot}${progress.mode?.ngPlus ? ` · NG+${progress.mode.ngPlus > 1 ? progress.mode.ngPlus : ''}` : ''}${progress.mode?.difficulty ? ` · ${DIFFICULTY_INFO[progress.mode.difficulty].name}` : ''}`,
      onCoop: () => openLobby(),
      // [net] Online co-op (src/net/game/netGame.js, loaded on demand).
      onHostOnline: () => openNet((n) => n.openHost()),
      onJoinOnline: () => openNet((n) => n.openJoin()),
    });
    if (netEndMessage) { const m = netEndMessage; netEndMessage = null; setTimeout(() => alertNet(m), 50); }
  }

  // ---------------- [prog] run modifiers: no HUD, checkpoint limit (permadeath-lite) ----------------
  let progModsWired = false;
  function progRunModifiers() {
    document.body.classList.toggle('no-hud', !!progress.mode?.modifiers?.noHud);
    if (progModsWired) return;
    progModsWired = true;
    events.on('heroDown', () => {
      const mode = progress.mode;
      if (!mode?.modifiers?.checkpointLimit) return;
      mode.checkpoints += 1;
      const r = checkpointAllowed(mode);
      if (r.ok) { game?.hud.card('BACK TO THE CHECKPOINT', `${r.left} ${r.left === 1 ? 'restart' : 'restarts'} left this run.`, 4000); saveProgress(storage, progress); return; }
      game?.hud.card('OUT OF CHANCES', 'The night starts over. Everything you earned stays with you.', 5000);
      progress = newGameProgress(progress);
      progress.stepId = null;
      progress.mode.checkpoints = 0;
      saveProgress(storage, progress);
      setTimeout(() => { location.search = ''; }, 4500);
    });
  }

  // ---------------- [prog] new game / New Game Plus, save slots ----------------
  function newRunPage(ngPlus) {
    const row = buildDifficultyRow({ ngPlus, current: settings.difficulty, sound: menuSound((n, o) => audio.play(n, o)), rewards: ngPlus ? ngPlusRewards((progress.mode?.ngPlus ?? 0) + 1) : [] });
    menus.suitSelect({
      gold: progress.goldUnlocked, progress, header: row.node, title: ngPlus ? 'New Game Plus: choose your suit' : 'Choose your suit',
      onPick: (s) => {
        const v = row.value();
        settings.difficulty = v.difficulty;
        saveSettings(realStorage, settings);
        begin(s, true, { ngPlus, modifiers: v.modifiers });
      },
      onBack: showTitle,
    });
  }
  const slotScore = (p) => tracker.score(p).percent;
  const slotWhere = (p) => (p.finished ? 'Finished' : `Night One, step ${Math.min(p.step + 1, STEPS.length)} of ${STEPS.length}`);
  function openSlots() {
    const draw = () => menus.page(buildSlotsPage({
      summaries: SLOT_IDS.map((s) => slotSummary(realStorage, s, { score: slotScore, stepName: slotWhere })),
      guest: slotSummary(realStorage, 'guest', { score: slotScore, stepName: slotWhere }),
      active: activeSlot, sound: menuSound((n, o) => audio.play(n, o)),
      onPlay: (s) => { if (s === activeSlot) { showTitle(); return; } setActiveSlot(realStorage, s); location.reload(); },
      onCopy: (from, to) => { copySlot(realStorage, from, to); if (to === activeSlot) location.reload(); },
      onDelete: (s) => { deleteSlot(realStorage, s); if (s === activeSlot) location.reload(); },
      onExportCode: (s) => exportCode(sanitizeProgress(JSON.parse(realStorage?.getItem(slotKey(s)) ?? '{}'))),
      onExportFile: (s) => {
        const text = exportFile(sanitizeProgress(JSON.parse(realStorage?.getItem(slotKey(s)) ?? '{}')));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        a.download = `gotham-slot${s}.json`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      },
      onImport: (s, text) => {
        const r = importSave(text);
        if (r.ok) { writeSlot(realStorage, s, r.progress); if (s === activeSlot) setTimeout(() => location.reload(), 600); }
        return r;
      },
      refresh: () => draw(),
      onBack: showTitle,
    }));
    draw();
  }

  // ---------------- [net] online co-op (workstream D2) ----------------
  let net = null, netLoading = null, netEndMessage = null, netLobby = null;
  // A message a finished online session left for the title (src/net/game/netGame.js).
  try { const r = window.sessionStorage.getItem('gotham-net-msg'); if (r) { window.sessionStorage.removeItem('gotham-net-msg'); netEndMessage = r; } } catch { /* none */ }
  function alertNet(reason) { import('../net/ui/netUi.js').then((m) => m.toast(m.MESSAGES[reason] ?? reason, 9000)); }
  function openNet(fn) {
    if (net) { fn(net); return; }
    if (!netLoading) netLoading = import('../net/game/netGame.js').then((m) => { net = m.createNetController(netHooks()); return net; });
    netLoading.then(fn).catch((err) => { console.error(err); alertNet('Online play could not load. Check your connection and reload.'); });
  }
  function netHooks() {
    return {
      params, state,
      getGame: () => game,
      inRun: () => !!game && state.phase === 'play',
      hostKit: () => (game ? game.players[0].kit.id : lastPick(progress, 0) ?? progress.suit ?? 'm'),
      lastKit: (slot) => lastPick(progress, slot),
      getProgress: () => progress,
      setProgress: (p) => { progress = p; },
      // [prog] A guest's run writes the separate guest profile (src/core/slots.js), never a slot.
      realStorage: () => slotStorage(realStorage, 'guest', { onWrite: () => autosaveMark.ping() }),
      setStorage: (st) => { storage = st ?? slotStore; },
      prepareKit: (id) => prepareKit(kitById(id), assets),
      beginRun: async (kitId, fresh) => { menus.hide(); preview.clearAll(); await prepareKit(kitById(kitId), assets); begin(kitId, fresh); },
      showTitle: () => { if (state.phase !== 'play') showTitle(); },
      toTitle: () => { try { game?.side.save(); } catch { /* fine */ } location.search = ''; },
      resume: () => resume(),
      // The online lobby: this machine's column and the online partner's, over the 3D preview.
      showLobby: ({ mine, theirs, onLocal, onCancel }) => {
        menus.hide();
        netLobby = true;
        if (state.phase !== 'play') {
          state.phase = 'lobby';
          preview.stage({ x: SITES.start.x, y: SITES.start.y, z: SITES.start.z }, Math.PI * 1.2 + Math.PI, camera);
        }
        const dev = devices.connectedPads().length && lastPadUsed !== null ? lastPadUsed : 'kbm';
        heroSelect.show([{ device: dev, kitId: mine, label: 'You' }, { remote: true, kitId: theirs.kit, ready: theirs.ready, label: theirs.name }], {
          footer: '<span class="hs-note">Online: pick your hero and press Ready \u00b7 Esc / B: leave</span>',
          onColumn: (i, st) => { if (i === 0) onLocal(st); },
          onDone: () => {},
          onCancel: () => { netLobby = null; preview.clearAll(); onCancel(); },
        });
        onLocal({ kit: mine, ready: false });
      },
      lobbyRemote: (st) => heroSelect.remote(1, { kitId: st.kit, ready: st.ready, label: st.label }),
      closeLobby: () => { if (netLobby) { netLobby = null; if (heroSelect.open) heroSelect.close(); preview.clearAll(); } },
      setWorldTime: (t) => { state.t = t; },
      getWorldTime: () => state.t,
      // [net2] The world (clock, weather) and the credits page a guest closes when the host moves on.
      getWorld: () => world,
      closeCredits: () => { if (document.querySelector('.credits-menu')) { menus.hide(); input.setEnabled(true); } },
    };
  }

  // ---------------- the co-op lobby (workstream D1) ----------------
  // Two columns of the hero select over the picked heroes standing on the GCPD roof. Player 1 is
  // whoever opened it (keyboard+mouse, or the pad that pressed A); player 2 joins with Start / A
  // on another controller, or Enter on the keyboard when player 1 is on a pad.
  let lobby = null;
  function openLobby() {
    menus.hide();
    const p1Device = devices.connectedPads().length && lastPadUsed !== null ? lastPadUsed : 'kbm';
    lobby = { devices: [p1Device, null], story: progress.step > 0 ? 'continue' : 'new' };
    state.phase = 'lobby';
    const center = SITES.start;
    preview.stage({ x: center.x, y: center.y, z: center.z }, Math.PI * 1.2 + Math.PI, camera);
    heroSelect.show([
      { device: p1Device, kitId: lastPick(progress, 0) ?? progress.suit ?? 'm', label: deviceLabel(p1Device) },
      { waiting: true },
    ], {
      optional: true,
      footer: lobbyFooter(),
      onDone: (picks) => startCoop(picks),
      onCancel: () => { lobby = null; preview.clearAll(); showTitle(); },
      onLeave: () => { lobby.devices[1] = null; preview.hide(1); },
    });
  }
  function lobbyFooter() {
    const can = progress.step > 0;
    return `<span class="hs-note">${can ? 'Story: carries on from your save (New game: title menu)' : 'Story: a new game'} · Esc / B: back</span>`;
  }
  function deviceLabel(d) { return d === 'kbm' ? 'keyboard + mouse' : `controller ${d + 1}`; }
  function showPreview(picks) {
    if (state.phase !== 'lobby' && !joining) return;
    picks.forEach((k, i) => { if (k) preview.show(i, k).catch((e) => console.warn(e)); else preview.hide(i); });
  }
  // Both ready (player 2 may have stayed out): build the run with player 1's hero, then player 2's.
  async function startCoop(picks) {
    const [k0, k1] = picks;
    const d1 = lobby?.devices[1] ?? null;
    preview.clearAll();
    rememberPick(progress, 0, k0);
    if (k1) rememberPick(progress, 1, k1);
    await prepareKit(kitById(k0), assets);
    if (k1) await prepareKit(kitById(k1), assets);
    const fresh = !(progress.step > 0);
    lobby = null;
    begin(k0, fresh);
    if (k1 && d1 !== null) {
      game.coop.joins.activity(lobbyP1Device);
      await game.coop.join(k1, d1, devices.connectedPads());
    }
  }
  let lastPadUsed = null, lobbyP1Device = 'kbm';

  // ---------------- a run ----------------
  function begin(suit, fresh, runOpts = {}) {
    menus.hide();
    audio.unlock();
    // Don't let the integrated-GPU hint sit over the boss bar once a run is under way.
    if (gpuHintBox) { gpuHintBox.remove(); gpuHintBox = null; }
    // A new run never inherits a time hold (the gadget wheel's 20%, remote steering).
    time.releaseAll();
    if (fresh) {
      // [prog] NG+ needs a finished save; the run's difficulty and modifiers go on the slot.
      const ngPlus = !!runOpts.ngPlus && canNgPlus(progress);
      progress = newGameProgress(progress); progress.stepId = null;
      progress.mode = startRunMode(progress.mode, { difficulty: settings.difficulty, ngPlus, modifiers: runOpts.modifiers ?? null });
    }
    // A Batman suit is the save's suit (the suit select); any other roster kit is a co-op pick.
    if (isSuitId(suit) && suitIsBatman(suit)) progress.suit = suit;
    else rememberPick(progress, 0, suit);
    saveProgress(storage, progress);
    game = buildRun(suit);
    progRunModifiers(); // [prog]
    input.setEnabled(true);
    state.phase = 'play';
    applySettings();
    // The run's own objects (hero, boss, pickups, effects) get the same treatment as the city at
    // boot; programs are mostly cached by now, so this is a short, one-off stall on the click.
    try { uploadTextures(renderer, scene); drawEverything(renderer, ink, scene, camera); } catch (err) { console.error(err); }
    mark('runWarm');
    game.flow.start();
  }

  function buildRun(suit) {
    // A hero for a kit (src/heroes/roster.js): built, primed and placed the same way for everyone.
    const makeHero = (kit) => {
      const h = createHero({ assets, kit, scene, collision: world.collision, events, climbables: world.climbables, settings });
      // Every clip a chain takedown plays gets its mixer action now, not on the first chain.
      h.bat.animator.prime(chainClipNames());
      // The choke and the crouch get their mixer actions now, not on the first silent takedown.
      h.bat.animator.prime(['Takedown_Choke', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop']);
      if (settings.difficulty === 'story') { h.maxHealth = 150; h.health = 150; }
      // A co-op kit's health (src/heroes/roster.js stats.health; Batman's is 1, unchanged).
      h.healthK = kitInfo(kit).stats?.health ?? 1;
      if (h.healthK !== 1) { h.maxHealth = Math.round(h.maxHealth * h.healthK); h.health = h.maxHealth; }
      return h;
    };
    const kit = kitById(suit);
    const hero = makeHero(kit);
    hero.teleport(SITES.start, Math.PI * 1.2);
    const follow = createFollowCamera(camera, world.collision);
    follow.configure(settings);
    follow.snapBehind(hero.bat.yaw);
    fill.intensity = 1.25;

    // Every local player's HUD behind one object (src/coop/hudGroup.js): player 0's answers as
    // always; the shared story parts are mirrored into a partner's own HUD.
    const hud = createHudGroup(createHud(hudRoot));
    hud.setHealth(1);
    // ---- Players (src/players/players.js, docs/design/long-night-2.md 4.1) ----
    // Single-player is co-op with one player: player 0 is this hero, the keyboard+mouse and first
    // pad (`input`), the one camera and the HUD's slot 0. game.hero stays player 0's hero.
    const players = createPlayers({ time });
    const p0 = players.add(createPlayer({ id: 0, slot: 0, kit, hero, input, view: { follow, camera }, hudSlot: hud.slot(0) }));
    // Player 0's split-screen view: the game's own camera, follow rig, HUD and the ink main view.
    const view0 = split.add(p0, { camera, follow, inkView: ink.mainView, hud: hud.primary });
    // Downed and revive (co-op only: one player going down is the old death). Hold to revive: the
    // helper stands beside the downed hero and holds the revive button (src/coop/revive.js).
    const revive = createReviveRules({ hold: true });
    // Pays the comic sound-word vocabulary's one-time layout cost now (fonts are already loaded,
    // see mark('fonts') above), so a hit's "POW!" or the Bat Swarm's "SKREEEE!" never forces
    // that reflow for the first time mid-fight.
    hud.prewarmWords(SFX_WORDS);
    // ---- Batwing (Part V2): src/vehicles/batwing.js, contract in the design doc ----
    const batwing = createBatwing({ scene, camera, hero, follow, collision: world.collision, events, hudRoot: hudRoot.querySelector('.hud') ?? hudRoot, audio });
    // Part S: the radio and cutscene dialogue panel (src/ui/radio.js). Lives alongside the HUD and
    // never pauses play; flow.js drives it for the new 'radio' step type and the async missions'
    // flavor lines.
    const radio = createRadio(hudRoot, { onSound: (n) => audio.play(n) });
    // ---- Cinematic camera: src/ui/cinematic.js ----
    const cinematic = createCinematic({ camera, hero, hudRoot: hudRoot.querySelector('.hud') ?? hudRoot });
    const comicFx = createComicFx(document.body, () => hud.primary.viewSize());
    view0.extras.push(comicFx);
    const fx = createFx(scene);
    const stealthFx = createStealthFx(scene);
    const gfx = createGadgetFx(scene);
    const breakables = createBreakables({
      scene, collision: world.collision, climbables: world.climbables, progress, events, gfx,
      save: () => saveProgress(storage, progress),
      // ?gadgets=all is a dev run (gadgetSystem's devAll, read the same way at its own call site):
      // breaks and cache finds still happen for the session but never reach the real save.
      dev: params.get('gadgets') === 'all',
    });
    const chainFx = createChainFx(scene, camera);
    const swarmFx = createSwarmFx(scene, { count: quality.swarmBats }); // fewer bats on Low
    const rng = createRng(99);
    // The live WayneTech effects (src/progress/upgrades.js): combat, the hero and the gadgets all
    // read this one object; buying an upgrade refills it (Task 22).
    const effects = upgradeEffects(progress.wayne.owned);
    hero.tuning = effects;
    // [move] Grapple/wingsuit/vehicle upgrades per player, updrafts, pull targets (?moves=all: dev).
    const moves = createMoves({ events, effects, players, world, all: params.get('moves') === 'all' });
    let gadgets = null;
    let stealth = null;
    const combat = createCombat({
      players: [p0], follow, time, events, rng, reach, getDifficulty: () => settings.difficulty,
      effects, getChainDiscount: () => effects.chainDiscount, useGadget: (ctx, o) => gadgets.fire(ctx, o),
      stealthStart: (action, c) => stealth?.start(action, c) ?? false,
      stealthHold: (action, target) => stealth?.hold(action, target) ?? false,
      // [prog] The city's fear/reputation, loaded from the save (progress.reputation).
      reputation: createReputation(progress.reputation),
    });
    // [prog] The live object rides in the save: JSON.stringify calls its toJSON().
    progress.reputation = combat.reputation;
    hero.combat = combat;
    p0.fighter = combat.fighters[0];
    // ---- Part V1: ground vehicles (src/vehicles/vehicles.js) ----
    const vehicles = createVehicles({ scene, collision: world.collision, hero, events, input, follow, combat, fx, hudRoot, audio, world, quality }); // [move] world, quality
    // Ambient traffic (src/world/cityLife.js) spawns around every player, brakes for the cars and
    // the Batmobile, and reports pass-bys and honks on the event bus.
    world.traffic?.attach?.({ events, players, vehicles, clock: () => world.clock.hour }); // [env] mix follows the clock
    // [env] Civilians (src/civilians/): pedestrians on every player's sidewalks, reacting to heroes,
    // fights and crimes; the traffic yields to anyone on a crossing.
    // ?civ=0 leaves the streets empty (A/B benchmarks).
    const civilians = params.get('civ') === '0' ? { update() {}, obstacles() {}, stats: null } : createCivilians({ scene, assets, quality, world, events, players, combat, cameras: () => (split?.split ? split.views.map((v) => v.camera) : [camera]) });
    world.traffic?.setPedestrians?.((put) => civilians.obstacles(put));
    // [env] A saved game resumes at its saved time (a new game starts at 23:00 in a storm).
    if (Number.isFinite(progress.env?.abs) && !params.has('time')) world.clock.sync(progress.env.abs, { force: true });
    // Predator stealth: room goons, perches, silent takedowns and perch drops (Part D).
    stealth = createStealth({ hero, combat, events, collision: world.collision, perches: world.grapplePoints.filter((p) => p.perch), rng });
    // Predator visuals (src/stealth/stealthFx.js): vision cones, laser sights, tracers and flashes.
    events.on('rifleShot', ({ from, to, hit }) => stealthFx.shot(from, to, hit));
    events.on('stealthEnd', () => stealthFx.clear());
    const stealthHud = createStealthHud(hudRoot.querySelector('.hud') ?? hudRoot);
    events.on('stealthLine', ({ target, text }) => stealthHud.say(target, text));
    events.on('stealthEnd', () => stealthHud.clear());
    // A goon's head on screen, written into one shared object (no allocation per goon per frame).
    const headAt = new THREE.Vector3(), headScr = { x: 0, y: 0, behind: false };
    const headOnScreen = (e) => {
      // Split screen: player 0's own view (its HUD panel's coordinates).
      if (split.split) return split.project(view0, e.ch.headWorld(headAt, 0.75), headScr, headAt);
      e.ch.headWorld(headAt, 0.75).project(camera);
      headScr.x = (headAt.x * 0.5 + 0.5) * innerWidth;
      headScr.y = (-headAt.y * 0.5 + 0.5) * innerHeight;
      headScr.behind = headAt.z > 1;
      return headScr;
    };
    let promptKind = null;
    // Key labels in hints: a co-op partner's hint names its own buttons (hintPlayer, set per hint).
    let hintPlayer = null;
    const key = (a) => (hintPlayer && hintPlayer !== p0 ? coopKeyFor(hintPlayer, a) : `<kbd>${bindingLabel(settings.bindings, a)}</kbd>`);
    let coopKeyFor = (pl, a) => `<kbd>${bindingLabel(settings.bindings, a)}</kbd>`;
    const screen = new THREE.Vector3();
    const toScreen = (v) => {
      // Split screen: player 0's own view (its HUD panel's coordinates).
      if (split.split) return split.project(view0, v, { x: 0, y: 0, behind: false }, screen);
      screen.copy(v).project(camera); return { x: (screen.x * 0.5 + 0.5) * innerWidth, y: (-screen.y * 0.5 + 0.5) * innerHeight, behind: screen.z > 1 };
    };
    // Any local player's view (co-op: words, glyphs, rings and markers land in the right half).
    const screenTmp = new THREE.Vector3();
    const toScreenOf = (pl) => {
      const v = split.viewOf(pl) ?? view0;
      return (w) => (split.split ? split.project(v, w, { x: 0, y: 0, behind: false }, screenTmp) : toScreen(w));
    };

    let nextId = 0;
    const spawn = (type, p) => {
      // [story] p.gang: a night fight's gang colours (src/story/fightBuilder.js, encounters.js).
      const e = createEnemy({ id: `e${nextId++}`, type, assets, scene, collision: world.collision, rng, events, gang: p.gang });
      // Stealth clips get their mixer actions now, not on the first patrol step or choke.
      e.ch.animator.prime(type === 'rifle' ? ['Rifle_Idle', 'Rifle_Walk', 'Rifle_Aim', 'Rifle_Search', 'Choked'] : ['Choked']);
      readyObjects(e.ch.root);
      // Co-op: a little tougher (at most 1.25x, src/players/coopRules.js); one player: unchanged.
      if (players.count > 1) e.health = scaledHealth(e.health, players.count);
      e.place(p, Math.atan2(hero.pos.x - p.x, hero.pos.z - p.z) + rng.range(-1, 1));
      // A goon's first draw builds its bone textures and vertex bindings (~8 ms). A wave of four
      // in one frame is a visible hitch, so new goons join the scene one per frame instead.
      scene.remove(e.ch.root);
      toReveal.push(e);
      return e;
    };
    const toReveal = [];
    const despawn = (e) => {
      const i = toReveal.indexOf(e);
      if (i >= 0) toReveal.splice(i, 1);
      e.remove();
    };
    // [net] An online guest's copy of one of the host's enemies (src/net/game/guestAdapter.js): the
    // host's id, placed where the host says; the net layer turns it into a puppet (no AI here).
    const spawnNet = (type, p, id, yaw = 0) => {
      const e = createEnemy({ id, type, assets, scene, collision: world.collision, rng, events });
      e.ch.animator.prime(type === 'rifle' ? ['Rifle_Idle', 'Rifle_Walk', 'Rifle_Aim', 'Rifle_Search', 'Choked'] : ['Choked']);
      readyObjects(e.ch.root);
      e.place(p, yaw);
      return e;
    };
    const encounters = createEncounters({ spawn, despawn, combat, events, collision: world.collision, stealth, getPlayerCount: () => players.count, getDifficulty: () => settings.difficulty }); // [balance] getDifficulty
    // ---- Part I: interiors (see src/world/interiors.js) ----
    const interiors = createInteriors({ hero, events, rain: world.rain, collision: world.collision });
    const trophies = createTrophies(scene, progress.trophies);
    const pickups = createPickups(scene, world.halos, SITES);
    const neonRelight = createNeonRelight(scene, world.halos);
    const comic = createComic(document.body, { onSound: (n) => audio.play(n), onVoice: (id) => voice.say(id) });
    // Tip cards wait out a takedown, a chain, the Bat Swarm or an action shot instead of covering
    // it (QUIET_CONTROLS, src/ui/prompts.js).
    // Which cards apply right now: a vehicle's controls only while in it, "get in" only while
    // out, and every on-foot tip waits while she drives or flies (prompts.js createPromptQueue).
    let abilityGate = null; // [onboard] the ability layer, once it exists (below)
    const promptRelevance = (id) => {
      const driving = !!vehicles.active, flying = !!batwing.active;
      // [onboard] A card about something the story hasn't given yet never shows.
      const need = PROMPT_ABILITY[id];
      if (need && abilityGate && !abilityGate.has(need)) return 'drop';
      if (id === 'battleMode' || id === 'eject') return driving ? true : 'wait';
      if (id === 'drive') return driving ? true : 'drop';
      if (id === 'fly') return flying ? true : 'drop';
      if (id === 'vehicle') return driving ? 'drop' : true;
      if (id === 'exitVehicle') return driving ? true : 'drop';
      if (id === 'callBatwing') return flying ? 'drop' : true;
      if (id === 'lowPower') return true;
      return driving || flying ? 'wait' : true;
    };
    // Tutorial tips show in every local player's view (each split HUD has its own hint line).
    const promptHud = { hint: (html, ms) => { for (const h of hud.all()) h.hint(html, ms); }, hideHint: () => { for (const h of hud.all()) h.hideHint(); } };
    const prompts = createPromptQueue(promptHud, () => settings.bindings, () => settings.hints, (id) => follow.actionActive || (QUIET_CONTROLS.has(hero.control?.name) && id !== hero.control?.name), () => gadgets?.state.equipped ?? null, promptRelevance,
      // flow is created further down: read it through the game object once it exists.
      (own) => window.__game?.flow?.quiet?.(own) ?? false);
    // [onboard] The campaign's abilities (src/abilities): every player's hero asks them at each
    // trigger point; the story grants and teaches them (?abilities=all|none|story; ?god=1 and
    // ?fight=test sandboxes have everything).
    const abilities = createAbilities({
      events, progress, steps: STEPS, params, settings, radio, prompts, hud: { chip: (...a) => { for (const h of hud.all()) h.chip?.(...a); }, setLocks: (t) => { for (const h of hud.all()) h.setLocks?.(t); } },
      save: () => saveProgress(storage, progress),
      missionsOf: (n) => campaignMissionsOf(n).map((m) => ({ id: m.id, steps: (m.steps ?? []).map((x) => x.id) })),
      isNightOne: () => window.__game?.flow?.story?.nightOne ?? true,
    });
    abilities.attach(hero);
    abilityGate = abilities;
    events.on('abilitiesLocked', () => { if (!abilities.has('detective')) state.detectiveOn = false; }); // [onboard] a jammer switches the cowl's filter off
    queueMicrotask(() => abilities.state.setGadgetSource((g) => !!gadgets?.state?.isUnlocked?.(g))); // gadgets are created further down
    events.on('playerJoined', () => { for (const pl of players.list) abilities.attach(pl.hero); });
    hud.setCompact?.(!!settings.access?.compactHud);
    for (const h of hud.all()) h.setCompact?.(!!settings.access?.compactHud);
    const waypoint = createWaypoint(hudRoot.querySelector('.hud') ?? hudRoot);
    const beacon = createBeacon(scene);
    const boss = createBoss({ assets, scene, rng, combat, events, hud, spawn, despawn, hero, time, getDifficulty: () => settings.difficulty, collision: world.collision, effects, getPlayers: () => players.list });
    boss.joker.health = 999;
    // [story] The boss framework: the Joker (boss.js, unchanged) and every campaign boss behind one
    // director (intro/outro comics, HUD bar, phase checkpoints, music, co-op targeting).
    const bosses = createBossFramework({ boss, assets, scene, rng, combat, events, hud, time, encounters, follow, hero, collision: world.collision, getDifficulty: () => settings.difficulty, getPlayers: () => players.list, spawn, despawn });
    const finale = createFinale({ scene, world, hero, boss, camera, events });
    // ---- GCPD roof at the finale: src/game/gcpdRoof.js, wired to story progress (roofStory.js) ----
    const roof = createGcpdRoof({ scene, assets, events, finale });
    // A resumed save (or a completed one, past credits, which never re-fires 'step' below):
    // everyone whose join step is already behind the current one is on the roof immediately.
    for (const id of guestsUpTo(progress.step ?? 0, STEPS)) roof.addGuest(id);
    if (celebrateAt(progress.step ?? 0, STEPS)) roof.celebrate();
    // Live progression: flow.js's enterStep() emits 'step' the moment each new step starts
    // (including, on a fresh run, the very first one), which is also when the finale cutscene
    // itself starts (s.type === 'cutscene' && s.scene === 'finale').
    events.on('step', ({ index }) => {
      for (const id of guestsUpTo(index, STEPS)) roof.addGuest(id);
      if (celebrateAt(index, STEPS)) roof.celebrate();
    });
    // ---- GCPD lobby dressing (goons behind bars, the trophy case): src/game/gcpdLobby.js ----
    const gcpdLobby = createGCPDLobby({ scene, assets, events, progress });

    // Renders the live city from a posed camera into an image for comic panels.
    const stage = {
      boss,
      shot({ cam, look, fov = 55, hero: pose, setup }) {
        // A comic panel is a full-screen shot: split screen steps aside for it (and the comic after).
        split.setFullscreen(true);
        const saved = { pos: hero.pos.clone(), yaw: hero.bat.yaw };
        if (pose === null) { hero.bat.root.visible = false; hero.cape.mesh.visible = false; }
        else if (pose) {
          hero.pos.set(...pose.at);
          hero.bat.face(pose.yaw);
          hero.bat.tilt.rotation.set(0, 0, 0);
          hero.bat.animator.play(pose.anim ?? 'Idle_Loop', { fade: 0 });
          hero.bat.animator.update(pose.time ?? 0.6);
          hero.cape.reset();
          for (let i = 0; i < 90; i++) hero.cape.update(1 / 60);
        }
        setup?.(stage);
        camera.position.set(...cam);
        camera.fov = fov;
        camera.updateProjectionMatrix();
        camera.lookAt(...look);
        fill.position.copy(camera.position);
        fill.target.position.set(...look);
        world.update(state.t, 0.016, camera.position, camera);
        ink.render(scene, camera, state.t);
        const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
        hero.pos.copy(saved.pos);
        hero.bat.face(saved.yaw);
        hero.bat.root.visible = true;
        hero.cape.mesh.visible = true;
        hero.cape.reset();
        if (setup && !boss.active) boss.hide();
        camera.fov = settings.fov;
        camera.updateProjectionMatrix();
        return url;
      },
    };

    // Late-bound: side content needs the flow, and the flow asks side content three questions.
    const sideHooks = { holdStory: () => false, marker: () => null, onRespawn: () => null };
    const flow = createFlow({
      hero, encounters, hud, events, progress, storage, comic, stage, prompts, waypoint, beacon, trophies, pickups, radio,
      collision: world.collision, follow, boss, bosses, finale, neonRelight, side: sideHooks, players, getDifficulty: () => settings.difficulty,
      onRegroup: () => revive.clear(),
      // A human playing Nightwing is the ally: the AI Nightwing steps aside (workstream D1).
      humanNightwing: () => players.list.some((pl) => heroOfKit(pl.kit).id === 'nightwing'),
      // A partner placed by the story (a teleport, the regroup) leaves any vehicle seat first.
      onPlacePartner: (pl) => coopHooks.onPlacePartner?.(pl),
      onCredits: () => {
        document.exitPointerLock?.();
        input.setEnabled(false);
        menus.credits({ final: true, onClose: () => { menus.hide(); input.setEnabled(true); flow.freeRoam(); gadgets.unlockCheck(); } });
      },
    });
    const gadgetHud = createGadgetHud(hudRoot.querySelector('.hud') ?? hudRoot);
    const wheelUi = createGadgetWheel(document.body);
    wheelUi.warm();
    gadgets = createGadgetSystem({
      hero, combat, follow, time, events, input, fx, gfx, breakables, progress, camera, effects, wheelUi, gadgetHud, stealth,
      collision: world.collision, save: () => saveProgress(storage, progress), getBindings: () => settings.bindings,
      // Live play only: never in a cutscene, a comic, a menu or photo mode.
      isPlaying: () => flow.mode === 'play' && !state.paused && !comic.playing && !photo.freezesWorld, // [prog] photo: a partner's photo mode doesn't stop yours
      devAll: params.get('gadgets') === 'all',
    });
    menus.setGadgetHelp(() => gadgets.helpList(settings.bindings));
    // [prog] gadgets (wave 3): settings (the hack's QTE assist), street cars for the tracker, the
    // quality tier for their visuals; the 'gadgets' loadout station; and a gadget that lands on a
    // goon who never saw it coming feeds the squad's fear like the batarang does.
    configureGadgets({ getSettings: () => settings, getVehicles: () => vehicles?.streetCars ?? null, quality });
    registerGadgetLoadout(() => gadgets);
    events.on('gadgetHit', (d) => { if (d?.target && d.dark) combat.fear?.note?.('gadgetFromDark', { id: d.target.id }); });
    const wayne = createWayneTech({
      events, progress, hero, combat, hud, effects, save: () => saveProgress(storage, progress),
      baseHealth: () => (settings.difficulty === 'story' ? 150 : 100),
      // ?gadgets=all is a dev run (read the same way gadgets/breakables do): XP, levels and
      // purchases still happen for the session, but never reach the real save.
      dev: params.get('gadgets') === 'all',
      // [prog] Skill tree: player 0's hero picks its kit branch; suit perks ride on the effects.
      getHero: () => heroOfKit(p0.kit).id,
      extraOps: () => progSuitOps(p0.kit.id, settings),
    });
    wayne.apply();
    hud.setHealth(1);
    events.on('levelUp', ({ level, points }) => {
      hud.card(`LEVEL ${level}!`, `WayneTech sent an upgrade. ${points === 1 ? 'One point' : `${points} points`} to spend in the pause menu.`, 6500);
      events.emit('word', { text: 'LEVEL UP!', pos: hero.pos.clone().setY(hero.pos.y + 2.4), big: true });
      prompts.show(['wayneTech']);
    });
    const NO_LOOK = { dx: 0, dy: 0 };
    const side = createSideContent({
      scene, assets, hero, follow, combat, encounters, events, flow, prompts, progress, storage, rng,
      hudRoot: hudRoot.querySelector('.hud') ?? hudRoot, collision: world.collision, buildings: world.data.buildings,
      // For the Gotham Grand Prix / Wing Walk challenges (src/game/vehicleChallenges.js).
      vehicles, batwing,
      // [world-content] The open world (src/openworld/index.js): every player, the city, the systems it plays on.
      players, world, stealth, bosses, civilians, hud, comic, radio, quality, state, getDifficulty: () => settings.difficulty, photoActive: () => photo?.active, winFight: () => window.__game?.winFight?.(),
      bossDeps: { boss, assets, scene, rng, combat, events, hud, time, encounters, follow, hero, collision: world.collision, getDifficulty: () => settings.difficulty, getPlayers: () => players.list, spawn, despawn },
      modal: { open: () => { state.paused = true; input.setEnabled(false); document.exitPointerLock?.(); }, close: () => resume() },
    });
    Object.assign(sideHooks, side.flowHooks);
    // [prog] photo: per-player photo mode (src/ui/photoMode.js). One player: the world pauses as
    // before. Several players (live): only the photographer's view and input are taken over.
    const photo = createPhotoMode({
      root: document.body, camera, renderer, ink, scene, hero, input,
      quality, world, settings, storage: realStorage, restoreSize: () => resize(),
      getPlayers: () => players.list,
      viewOf: (pl) => {
        const v = split.viewOf(pl);
        return { camera: pl === p0 ? camera : pl.view?.camera, css: split.split ? v?.css : null, inkView: split.split ? v?.ink : ink.mainView, hudEl: (v?.hud ?? hud.primary)?.el };
      },
      getCharacters: () => [
        ...players.list.flatMap((pl) => [pl.hero.bat?.root, pl.hero.cape?.mesh, pl.hero.cable]),
        ...combat.enemies.map((e) => e.ch?.root),
      ],
      sound: (n) => audio.play(n),
      getTime: () => state.t,
      getIssue: () => `No. ${progress.stats.photos + 1}`,
      onOpen: (pl, live) => {
        // Live (co-op): from the pause menu the world resumes; nothing else stops.
        if (live) { if (state.paused) resume({ lock: false }); events.emit('photoOpen', withPlayer({}, pl)); return; }
        state.paused = true;
        state.pauseMenu = false;
        input.setEnabled(false);
        document.exitPointerLock?.();
        document.body.classList.add('photo-on');
        events.emit('photoOpen');
      },
      onClose: (pl, live) => { if (live) { events.emit('photoClose', withPlayer({}, pl)); return; } document.body.classList.remove('photo-on'); events.emit('photoClose'); resume(); },
      onSaved: () => { side.photoTaken(); events.emit('photoSaved'); },
    });

    // ---- HUD reactions ----
    events.on('impact', ({ pos, outcome }) => fx.impact(pos, outcome === 'hit' ? 0.7 : 1.1));
    // Dev only (dev server or ?god=1): contact-frame bookkeeping for tools/contact-shots.mjs,
    // and ?hitstop=<s> stretches every hit-stop so a screenshot lands inside the freeze.
    if (DEV_TOOLS) {
      events.on('impact', ({ move, outcome, target }) => { window.__impacts = (window.__impacts ?? 0) + 1; window.__lastImpact = { n: window.__impacts, move, outcome, target: target?.type ?? null, at: performance.now() }; });
      if (params.get('hitstop')) { const floor = Number(params.get('hitstop')), orig = time.hitStop; time.hitStop = (sec) => orig(Math.max(sec, floor)); }
    }
    events.on('word', ({ text, pos, big }) => {
      // Split screen: a sound word shows in every view that can see where it happened.
      if (split.split) { for (const v of split.views) { const q = toScreenOf(v.player)(pos); if (!q.behind) (v.hud ?? hud.primary).sfx(text, q.x, q.y, big); } return; }
      const p = toScreen(pos); if (!p.behind) hud.sfx(text, p.x, p.y, big);
    });
    events.on('zipOn', () => events.emit('word', { text: 'ZZZIP!', pos: hero.pos.clone().setY(hero.pos.y + 2), big: false }));
    events.on('launcherOn', () => events.emit('word', { text: 'ZZZIP!', pos: hero.pos.clone().setY(hero.pos.y + 2), big: false }));
    events.on('diveStart', () => events.emit('word', { text: 'FWOOSH!', pos: hero.pos.clone(), big: false }));
    events.on('diveImpact', ({ pos, word }) => { if (word !== null) events.emit('word', { text: word ?? 'KA-THOOM!', pos, big: true }); });
    // hard THUD is the hero's own landing only; the boss emits 'land' too (boss.js) but has no `who`.
    events.on('land', (d) => { if (d.hard && d.who === 'hero') events.emit('word', { text: 'THUD', pos: (d.player?.hero ?? hero).pos.clone(), big: false }); });
    events.on('critical', (d = {}) => hud.forPlayer(d.player).critical(d.variant));
    // The action shot and the impact frame frame the blow mid-screen: sound words step aside.
    events.on('critical', (d = {}) => hud.forPlayer(d.player).focus(1300));
    // Impact frames (Part I). Tier 1: every critical. Tier 2: chain and swarm finishers, the
    // tied-bundle KAPOW (critical `impact: 2`), the special takedown and a story fight's last blow
    // (they upgrade the critical that follows within 150 ms), and the Joker's phase change.
    const impactTl = createImpactTimeline(undefined, { flashScale: () => a11yFlash(settings) }); // [prog] a11y flash reduction
    const impactOut = { impact: 0, soft: false, freeze: false, panel: 0, panelT: 0 };
    const impactPanel = createImpactPanel(hudRoot);
    let bigUntil = -Infinity, impactPin = null, impactPinBase = 0;
    // Whose critical the impact frame is (its freeze is that player's: src/core/time.js).
    let impactBy = null;
    const impactNow = () => (impactPin === null ? performance.now() : impactPinBase);
    function fireImpact(tier, target) {
      const mode = impactModeFor(settings); // [prog] a11y: flash reduction turns Full into Soft
      // Split screen: the impact frame is the attacker's view only (src/coop/splitScreen.js).
      const owner = impactBy ?? p0;
      const sz = split.split ? (split.viewOf(owner)?.hud ?? hud.primary).viewSize() : { w: innerWidth, h: innerHeight };
      const p = target ? (split.split ? toScreenOf(owner) : toScreen)(target.pos.clone().setY(target.pos.y + 1)) : null;
      const at = p && !p.behind ? p : { x: sz.w / 2, y: sz.h / 2 };
      const got = impactTl.trigger(tier, impactNow(), mode);
      if (!got) return 0;
      ink.setImpact(0, mode === 'soft', at.x / sz.w, 1 - at.y / sz.h);
      impactCenter.x = at.x / sz.w; impactCenter.y = 1 - at.y / sz.h;
      if (got === 2 && (!split.split || owner === p0)) impactPanel.show(at.x, at.y);
      return got;
    }
    const impactCenter = { x: 0.5, y: 0.5 };
    events.on('special', () => { bigUntil = performance.now() + 150; });
    events.on('lastHit', () => { if (flow.objectives.step?.type === 'fight') bigUntil = performance.now() + 150; });
    events.on('critical', (d = {}) => {
      const { target, impact } = d;
      impactBy = d.player ?? null;
      const big = impact === 2 || performance.now() < bigUntil;
      bigUntil = -Infinity;
      fireImpact(big ? 2 : 1, target);
    });
    events.on('bossPhase', () => { impactBy = null; fireImpact(2, boss.joker); });
    // The hurt player's own ring (an event without a player, like the boss's buzzers, is player 0's).
    // The red flash is player 0's screen: with a shared screen a partner's hit only shows on its ring.
    events.on('heroHurt', (d) => {
      const p = d.player ?? p0;
      // Split screen: every player's red flash is in its own view.
      if (p === p0) hud.damage(d.damage);
      else if (split.split) hud.forPlayer(p).damage(d.damage);
      p.hudSlot?.setHealth(p.hero.health / p.hero.maxHealth);
    });
    const HINTS = {
      parried: () => `Knife goons parry punches. ${key('kick')} kick or ${key('cape')} cape-stun them first.`,
      immune: () => `Brutes shrug off hits. ${key('cape')} cape-stun first, then punch away.`,
      'brute-counter': () => `A red bolt can't be countered. ${key('dodge')} dodge out of the way!`,
      // "an 8", "a 6" (Fast Finish).
      'special-locked': () => `Special takedowns unlock at ${combat.combo.readyAt === 8 ? 'an' : 'a'} ${combat.combo.readyAt} hit combo.`,
      joker: () => (gadgets.state.equipped === 'batarang'
        ? `The Joker slips every punch. Hit him with a batarang ${key('batarang')} while he winds up a throw!`
        : `The Joker slips every punch. Pick the batarang on the gadget wheel (hold ${key('gadgetWheel')}) and hit him while he winds up a throw!`),
      'joker-throw': () => (gadgets.state.equipped === 'batarang'
        ? `A yellow star means he is throwing. ${key('batarang')} batarang him now!`
        : `A yellow star means he is throwing. Hold ${key('gadgetWheel')}, pick the batarang, and hit him!`),
      'gadget-cooldown': (name) => `${name} is recharging.`,
      'gadget-empty': (name) => `${name} is out of charges. They come back on their own.`,
      'gadget-boss': () => 'The Joker is too slippery for that. Use the batarang while he winds up a throw.',
      'remote-ground': () => 'Stand still on solid ground to steer the remote batarang.',
      'remote-busy': () => 'Finish your move first. The remote batarang needs Batman standing still.',
      'gel-aim': () => 'Aim at a floor or a wall within 14 m to spray gel.',
      'gel-none': () => `No gel down yet. Tap ${key('batarang')} to spray some first.`,
      'gel-full': () => `Three blobs is the limit. Hold ${key('batarang')} to set them off.`,
      'launcher-none': () => 'No wall within 40 m ahead for the line launcher.',
      'launcher-short': () => 'Too close. The line launcher needs a wall at least 6 m away.',
      'claw-none': () => 'Aim the batclaw at a goon, a vent cover or a weak railing.',
      'claw-ground': () => 'Plant your feet to fire the batclaw.',
      'freeze-none': () => 'No goon in sight to freeze.',
      'flashbang-ground': () => 'Plant your feet to throw the flashbang.',
      gas: () => 'Laughing gas! Get out of the green cloud.',
      finish: () => `He is reeling! ${key('special')} Finish him!`,
      'perch-none': () => `Get right above a goon first. ${key('kick')} drops on him from the gargoyle.`,
      'silent-miss': () => `No silent takedown from here. Sneak right up behind him, or ${key('kick')} kick to start a fight.`,
      rifle: () => `Rifle goons parry punches. ${key('kick')} kick them, ${key('cape')} cape-stun them, or take them from behind.`,
      // Enemy roles (workstream I): the answer each one needs.
      blocked: () => `Shields stop blows from the front. ${key('cape')} cape-stun him, ${key('dodge')} vault over him, or hit him from the air.`,
      shocked: () => `That baton is charged. ${key('dodge')} dodge it, stun him first (${key('cape')}, ${key('batarang')}), or hit him from behind.`,
      'swarm-locked': () => 'The Bat Swarm is the last Combat upgrade in WayneTech, in the pause menu.',
      'swarm-cost': (cost) => `Not enough combo. The Bat Swarm needs ${cost}.`,
      'swarm-targets': () => 'The Bat Swarm needs two goons close by and in sight.',
      // Both cost-aware: built from the costs startChain actually charged against
      // (combatSystem.js), so Efficient Chains reads 4 / 7 / 10 here (src/ui/prompts.js). The
      // locked hint also carries the stealth clause: two unaware goons close by make it free.
      'chain-locked': (costs) => chainLockedText(costs),
      'chain-cost': (costs) => chainCostText(costs),
      'chain-targets': () => 'A chain takedown needs two goons close by and in sight.',
    };
    Object.assign(HINTS, newGadgetHints(key)); // [prog] gadgets (wave 3)
    events.on('blocked', (d) => { const { outcome, target } = d; hintPlayer = d.player ?? null; hud.forPlayer(d.player).hint((target?.type === 'joker' ? HINTS.joker : target?.type === 'rifle' ? HINTS.rifle : HINTS[outcome])(), 3500); hintPlayer = null; });
    // The chain-locked hint carries the stealth clause too, a second sentence: longer to read.
    const HINT_MS = { 'chain-locked': 5500 };
    events.on('hint', (d) => { const { id, arg } = d; hintPlayer = d.player ?? null; if (HINTS[id]) hud.forPlayer(d.player).hint(HINTS[id](arg), HINT_MS[id] ?? 3000); hintPlayer = null; });
    events.on('bossStaggered', () => hud.hint(HINTS.finish(), 3500));
    events.on('chainTied', () => prompts.show(['chainTied']));
    // Landing a movement move skips the tutorial card that teaches it.
    events.on('moveLanded', ({ id }) => { if (PROMPT_FOR_MOVE[id]) prompts.learned(PROMPT_FOR_MOVE[id]); });
    // A dropped chain (teleport, respawn, restart) leaves the tether stretched to stale goon
    // spots until it times out on its own; clear it the moment the chain actually breaks.
    events.on('chainBroken', () => chainFx.clear());
    const PROMPT_DONE = {
      throwRelease: 'throw', slam: 'slam', glideStart: 'glide', grapple: 'grapple', grappleBoost: 'grappleBoost', counter: 'counter', cape: 'cape',
      batarangThrow: 'batarang', dodge: 'dodge', special: 'special', jumpKick: 'kick',
      ladderOn: 'ladder', ledgeGrab: 'ledge', zipOn: 'zip', wallRun: 'wallrun', diveStart: 'divebomb', takedown: 'takedown',
      chainStart: 'chain', tiedBreak: 'chainTied',
      wheelSeen: 'gadgetWheel',
      crouchOn: 'crouch', silentTakedown: 'silent', perched: 'perch', perchDrop: 'perchDrop', batarangWall: 'distract', ventHide: 'vent', stealthLost: 'spotted',
      upgradeBought: 'wayneTech',
      swarmStart: 'swarm',
    };
    for (const [ev, id] of Object.entries(PROMPT_DONE)) events.on(ev, () => prompts.done(id));
    events.on('vehicleBoost', () => prompts.retire?.('drive')); // [polish] a learned card leaves early
    events.on('perchDropStart', ({ target }) => follow.dropShot(hero.pos, target.pos));
    events.on('stealthAlarm', () => prompts.show(['spotted']));
    events.on('rifleAim', () => prompts.show(['rifle']));
    events.on('takedown', ({ kind }) => { if (kind === 'ledge') prompts.done('ledgeStealth'); });
    events.on('upgradeBought', ({ id }) => { if (id === 'swarm') prompts.show(['swarm']); });
    events.on('gadgetUnlocked', ({ id }) => {
      const g = gadgetById(id);
      hud.card(`NEW GADGET: ${g.name.toUpperCase()}`, g.cardText, 5000);
      prompts.show(['gadgetWheel', g.promptId]);
    });
    // A returning save: one card for every gadget it already earned (the flashbang follows on its own).
    events.on('gadgetNews', ({ ids }) => {
      const c = gadgetNewsCard(ids, bindingLabel(settings.bindings, 'gadgetWheel'));
      // Down a moment before the flashbang's card takes its place.
      hud.card(c.title, c.text, NEWS_CARD_S * 1000 - 700);
      prompts.show(['gadgetWheel']);
    });
    events.on('gadgetWheelTip', () => prompts.show(['gadgetWheel']));
    // A card (a new gadget, a level up) steps aside once the action starts.
    for (const ev of ['fightStart', 'vehicleEnter', 'wingEnter', 'swarmStart']) events.on(ev, () => hud.dismissCard());
    events.on('swing', ({ kind, finisher }) => { prompts.done(kind === 'kick' ? 'kick' : 'punch'); if (finisher) prompts.done('finisher'); });
    events.on('step', ({ step }) => {
      if (step.id === 'toDocks') {
        setTimeout(() => prompts.show(abilities.has('detective') ? ['detective', 'trophies'] : ['trophies']), 30000); // [onboard] detective vision arrives on the Monarch balcony
        setTimeout(() => prompts.show(['photo']), 120000);
      }
    });

    // Progress tracking (Plan 3C): one moveLearned event the first time each traversal move happens.
    const MOVE_IDS = { ladderOn: 'ladder', ledgeGrab: 'ledge', zipOn: 'zipline', wallRun: 'wallrun', diveImpact: 'divebomb', throwRelease: 'throw', slam: 'slam', counter: 'counter', silentTakedown: 'silentTakedown', perchDrop: 'perchDrop' };
    onceEachId(events, MOVE_IDS, 'moveLearned');

    const sound = wireAudio({ audio, events, hero, combat, flow, settings, voice, stealth });
    sound.start();

    // ---- grapple targeting ----
    // Ledge-variant grapple points: every non-perch grapple point, dropped 0.1m so the vault
    // lands slightly short and finds a ledge to hang from instead of standing on top. Only
    // offered while the player holds `back` when the target is picked, so they don't crowd
    // out the normal landing points.
    const ledgeGrapplePoints = world.grapplePoints.filter((p) => !p.perch).map((p) => ({ ...p, y: p.y - 0.1, ledge: true }));
    const grapple = { target: null, timer: 0 };
    const eye = new THREE.Vector3(), camDir = new THREE.Vector3(), toPt = new THREE.Vector3();
    function pickGrapple(dt) {
      grapple.timer -= dt;
      if (grapple.timer > 0) return;
      grapple.timer = 0.1;
      if (hero.control) { grapple.target = null; grapple.pull = null; return; } // [move] pull too
      if (!abilities.has('grapple')) { grapple.target = null; grapple.pull = null; return; } // [onboard] no grapple yet: no marker either
      follow.lookDir(camDir);
      eye.copy(hero.pos); eye.y += 1.6;
      const points = input.down('back') ? ledgeGrapplePoints : world.grapplePoints;
      grapple.pull = moves.pickPull(hero, combat.enemies, eye, camDir); // [move] grapple pull
      grapple.target = pickGrapplePoint(points, camera.position, camDir, hero.pos, {
        maxDist: hero.moves.grappleRange, // [move] range tiers (52 m is today's)
        visible: (p) => {
          toPt.set(p.x + (p.nx ?? 0) * 0.4 - eye.x, p.y + 0.3 - eye.y, p.z + (p.nz ?? 0) * 0.4 - eye.z);
          const d = toPt.length();
          const hit = world.collision.raycast(eye, toPt.divideScalar(d), d);
          return !hit || hit.t > d - 1.2;
        },
      });
    }
    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), new THREE.MeshBasicMaterial({ color: 0x49b4ff }));
    marker.layers.set(1);
    scene.add(marker);

    const ctx = { input, cam: follow, grappleTarget: null, fx, chainFx, swarmFx };
    const hudCtx = { combat: false, blocked: false }; // [onboard]
    p0.ctx = ctx;

    // ---- Local co-op (workstream D1, src/coop/coopRuntime.js): a second local player with its own
    // view, HUD, gadgets, grapple, detective vision and stealth; revive, the tether and the glue.
    // Player 0 above keeps every line of its own frame code. ----
    const coopHooks = {};
    const keyFor = (pl, a) => {
      if (pl.input?.device === 'pad' || (!pl.input?.hasKbm && pl.input?.pad)) return `<kbd>${PAD_LABELS[a] ?? a}</kbd>`;
      return `<kbd>${bindingLabel(settings.bindings, a)}</kbd>`;
    };
    const coop = createCoop({
      scene, camera, follow, ink, split, hud, hudRoot, settings, events, time, combat, players, p0, world, assets,
      makeHero, effects, fx, chainFx, swarmFx, gfx, breakables, progress, save: () => saveProgress(storage, progress),
      stealth, revive, input, state, getFlow: () => flow, devAll: params.get('gadgets') === 'all', vehicles, batwing, toScreenOf, moves, // [move] moves
      chainLabels: () => chainLabels, swarmLabel: () => swarmLabel, keyFor,
      isMounted: (h) => coopHooks.isMounted?.(h) ?? false,
      inVehicleTogether: () => coopHooks.inVehicleTogether?.() ?? false,
      onPlacePartner: (pl) => coopHooks.onPlacePartner?.(pl),
      onPlayerLeaving: (pl) => coopHooks.onPlayerLeaving?.(pl),
      onPlayersChanged: () => coopHooks.onPlayersChanged?.(),
    });
    const addLocalPlayer = (o = {}) => coop.addLocalPlayer(o);
    coopKeyFor = keyFor;
    events.on('playerDown', (d) => {
      const p = d.player;
      if (!p) return;
      revive.down(p.id);
      p.hudSlot?.setDown(0);
      for (const o of players.list) if (o !== p) hud.forPlayer(o).hint(`Player ${p.slot + 1} is down! Stand beside them and hold ${keyFor(o, 'grapple')} to get them up.`, 3500);
    });
    // XP for players without a save here (src/players/coopRules.js): their own KOs and moves, and a
    // share of every team event. Player 0's save is credited by WayneTech itself.
    for (const ev of ['ko', 'takedown', 'special', 'counter', 'fightDone', 'objectiveDone', 'trophy', 'crimeStopped']) {
      events.on(ev, (d) => {
        if (players.count < 2) return;
        for (const id of xpRecipients(ev, d, players.list)) {
          const p = id === 0 ? null : players.byId(id);
          if (p) p.xp += XP[ev] * (ev === 'counter' ? d?.count ?? 1 : 1);
        }
      });
    }
    // ---- Part N: Nightwing (src/allies/nightwing.js) ----
    const nightwing = createNightwing({ assets, scene, collision: world.collision, events, combat, hero, rng, ctx });
    events.on('courierTaunt', ({ text }) => hud.card('MASKED COURIER', text, 2500));
    events.on('teamTakedown', ({ target }) => events.emit('word', { text: 'TEAM UP!', pos: target.ch.headWorld(new THREE.Vector3(), -0.3), big: true }));
    // ---- end Part N ----
    // ---- Harley Quinn (src/actors/harleyChar.js, src/combat/harleyLogic.js): HUD taunt card ----
    events.on('harleyTaunt', ({ text }) => hud.card('HARLEY QUINN', text, 2500));
    // ---- end Harley Quinn ----
    // [map] Navigation (workstream L2, src/nav/navSystem.js): the city map model, a minimap per
    // local player, waypoints, the GPS ribbon on the roads, fast travel, UI station 'cityMap'.
    let travelPanel = null;
    const nav = createNav({
      scene, world, quality, events, progress, players: () => players.list, settings: () => settings,
      flow: () => flow, side: () => side, combat, stealth, vehicles, interiors, glue: () => coop.glue,
      currentStep: () => STEPS[flow.stepIndex] ?? null,
      cameraOf: (pl) => (pl === p0 ? camera : pl.rig?.camera ?? pl.view?.camera ?? null),
      followOf: (pl) => (pl === p0 ? follow : pl.rig?.follow ?? null),
      hudFor: (pl) => (pl === p0 ? hud.primary : pl.rig?.hud ?? null),
      detectiveOf: (pl) => (pl === p0 ? !!state.detectiveOn : !!pl.rig?.detectiveOn),
      lookDir: (cam) => cam.getWorldDirection(new THREE.Vector3()),
      hint: (pl, text) => hud.forPlayer(pl).hint(text, 4000),
      keyFor: (pl, a) => keyFor(pl, a),
      pauseForMap: () => { gadgets.halt(); state.paused = true; state.pauseMenu = false; input.setEnabled(false); document.exitPointerLock?.(); menus.hide(); net?.hostPaused(true); },
      resumeFromMap: () => resume(),
      transition: (info, arrive) => { travelPanel ??= createTravelTransition(document.body); travelPanel.play(info, arrive); },
    });
    nav.fastTravel?.addVeto?.(() => (abilities.has('fastTravel') ? null : 'Fast travel opens once the Long Night is over.')); // [onboard]
    // [map] end
    let lastCombo = -1;
    let chainLabels = ['1', '2', '3'];
    let swarmLabel = '4';
    let chainPromptShown = false;
    let detective = 0;
    let palT = 0;
    const palBuf = new Array(18).fill(0);
    // First-time traversal hints (ladder, zip, divebomb). Kept to one cheap pass every 0.5s
    // (including the divebomb altitude check, which calls hero.heightAboveGround(), a raycast,
    // so it must not run every frame), and each one stops checking once it has shown.
    let hintCheckT = 0;
    let glideHighT = 0;
    const hintShown = { ladder: false, zip: false, divebomb: false, drive: false, fly: false, stomp: false };
    // The controls for a vehicle, the first time she gets in one.
    events.on('vehicleEnter', () => { if (!hintShown.drive) { prompts.show(['drive'], { first: true }); hintShown.drive = true; } });
    events.on('wingEnter', () => { if (!hintShown.fly) { prompts.show(['fly'], { first: true }); hintShown.fly = true; } });

    // stealthFx.update's options, filled in place every frame.
    const fxView = { detective: false, hero };

    function update(real) {
      if (toReveal.length) scene.add(toReveal.shift().ch.root);
      const playing = flow.mode === 'play' || flow.mode === 'dead';
      // Impact frames run on real time, sampled before hit-stop and slow motion apply. Menus,
      // pause, photo mode and comics cancel a sequence (and its hold) outright.
      if (impactTl.active && (!playing || state.paused || comic.playing || photo.freezesWorld)) impactTl.cancel(); // [prog] photo: live photo mode never stops the world
      impactTl.sample(impactPin === null ? performance.now() : impactPinBase + impactPin, impactOut);
      ink.setImpact(impactOut.impact, impactOut.soft);
      impactPanel.set(impactOut.panel);
      if (impactOut.freeze) time.hold('impact', 0.01, impactBy ?? 'world'); else time.release('impact');
      // Split screen: the impact frame lands in its owner's view only; detective vision per view.
      if (split.split) {
        for (const v of split.views) {
          const mine = v.player === (impactBy ?? p0);
          v.overrides.impact = mine ? impactOut.impact : 0;
          v.overrides.impactSoft = impactOut.soft ? 1 : 0;
          v.overrides.cx = impactCenter.x; v.overrides.cy = impactCenter.y;
        }
      }
      // Cutscenes, comics, the finale, the credits and photo mode take the whole screen.
      split.setFullscreen(comic.playing || cinematic.active || photo.freezesWorld || (flow.mode !== 'play' && flow.mode !== 'dead')); // [prog] photo: split photo mode keeps its own view
      const dt = playing && !state.paused ? time.scale(real) : 0;
      if (playing && !state.paused) {
        if (input.pressed('photo') && flow.mode === 'play' && !hero.dead && !photo.active && abilities.has('photoMode')) { photo.open(p0); if (photo.freezesWorld) return; }
        // [prog] photo: any local partner opens photo mode on its own view (its pad's photo button).
        for (let i = 1; i < players.list.length && !photo.active; i++) { const pl = players.list[i]; if (pl.local && !pl.hero.dead && pl.input.pressed?.('photo') && flow.mode === 'play') photo.open(pl); }
        if (input.pressed('detective') && abilities.has('detective') && !window.__game?.sandbox?.radio?.ownsKey(p0)) { state.detectiveOn = !state.detectiveOn; if (state.detectiveOn) events.emit('detective', { on: true }); } // [onboard] gate; [sandbox] in a car the key tunes the radio
        // Batwing (Part V2): call it from a roof or a glide, or eject back into a glide.
        // Co-op: the Batwing key may board the partner's plane instead (src/coop/passenger.js).
        if (input.pressed('batwing') && !isReplica() && !coop.batwingKey(p0)) { if (batwing.active) batwing.exit(); else if (abilities.has('batwing')) batwing.call(); } // [onboard] gate: the call
        pickGrapple(real);
        // Grapple is only locked while a fight is actually around you.
        const busy = combat.enemies.some((e) => e.alive && e.aware && !e.room && e.pos.distanceTo(hero.pos) < 12 && Math.abs(e.pos.y - hero.pos.y) < 4);
        ctx.grappleTarget = busy || !abilities.has('grapple') ? null : grapple.target; // [onboard] gate
        ctx.pullTarget = grapple.pull ?? null; // [move] a pull works in a fight
        hintCheckT -= real;
        if (hintCheckT <= 0) {
          hintCheckT = 0.5;
          if (!hintShown.ladder) {
            for (const l of world.climbables.ladders) {
              const lx = l.x + l.nx * 0.45, lz = l.z + l.nz * 0.45;
              if (Math.hypot(hero.pos.x - lx, hero.pos.z - lz) < 6 && Math.abs(hero.pos.y - l.bottom) < 6) { prompts.show(['ladder']); hintShown.ladder = true; break; }
            }
          }
          if (!hintShown.zip && ctx.grappleTarget?.zip) { prompts.show(['zip']); hintShown.zip = true; }
          // The first goon on the floor near her: kick to stomp, punch to hammer.
          if (!hintShown.stomp && combat.enemies.some((e) => e.alive && e.down && !e.air && e.pos.distanceTo(hero.pos) < 5)) { prompts.show(['stomp'], { first: true }); hintShown.stomp = true; }
          if (!hintShown.divebomb) {
            // Sampled once per throttle tick, not every frame: the timer advances by the
            // tick length instead of by `real`, so it still reads as "~3s continuously high".
            if (hero.state === 'glide' && hero.heightAboveGround() > 10) glideHighT += 0.5; else glideHighT = 0;
            if (glideHighT > 3) { prompts.show(['divebomb']); hintShown.divebomb = true; }
          }
          chainLabels = ['chain1', 'chain2', 'chain3'].map((a) => bindingLabel(settings.bindings, a));
          swarmLabel = bindingLabel(settings.bindings, 'chain4');
        }
        gadgets.update(real, dt, ctx);
        // Beside a downed partner the grapple button is the revive (no zipping away mid-revive).
        if (coop.partners().length && ctx.grappleTarget && reviveNearP0()) ctx.grappleTarget = null;
        net?.pre(real, dt); // [net] a guest poses the host's world before its own fight runs
        coop.beforeCombat(real, dt);
        interiors.update();
        stealth.update(dt);
        if (!isReplica()) nightwing.update(dt); // [net] the AI ally is the host's. Part N: before combat.update, so a team takedown can lock ctx.lockInput for this frame
        combat.update(dt, ctx);
        // Each hero on its own dt: a co-op hit-stop freezes only the fighters in it (src/core/time.js).
        hero.update(time.dtFor(hero, dt), ctx);
        coop.afterCombat(real, dt);
        // [onboard] The HUD director's turn (src/ui/hudDirector.js): the centre waits out a fight close
        // by, and nothing new arrives over a comic or a cinematic.
        { let near = false; const list = combat.enemies; for (let i = 0; i < list.length && !near; i++) { const e = list[i]; near = e.alive && e.aware && !e.room && e.pos.distanceToSquared(hero.pos) < 324; }
          hudCtx.combat = near; hudCtx.blocked = !!(comic.playing || cinematic.active); for (const h of hud.all()) h.tick?.(hudCtx); }
        if (!isReplica()) batwing.update(dt, real); // [net] a guest rides the host's vehicles
        // ---- Part V1: ground vehicles hook (src/vehicles/vehicles.js) ----
        if (!isReplica()) vehicles.update(dt, real);
        civilians.update(dt, state.t); // [env]
        for (const pl of players.list) pl.hero.envWind = world.windVec; // [env] wind on capes
        if (progress.env) { progress.env.abs = world.clock.value; progress.env.seed = world.weather.seed; } // [env] saved with the game
        bruce.update(dt, real); // [bruce] the Manor, the cave, Wayne Tower, playing as Bruce
        gcpdLobby.update(dt, camera.position);
        if (!isReplica()) side.update(dt, real, { toScreen }); // [net] side content is the host's
        else side.guestUpdate?.(); // [net2] a guest's "host only" pillar hint (src/game/sideContent.js)
        wanted.update(dt, real); // [wanted] (a guest only draws the host's state)
        sandbox.update(dt, real); // [sandbox]
        fx.update(dt, real);
        fxView.detective = !!state.detectiveOn;
        stealthFx.update(dt, stealth.goons, fxView);
        gfx.update(dt);
        swarmFx.update(dt, camera.position);
        wayne.update(dt);
        wardrobe.update(dt); // [prog] suits: throttled unlock check (toasts once per suit)
        breakables.update(state.t, hero.pos);
        if (world.belowWater(hero.pos)) { hero.teleport(hero.lastSafe); events.emit('splash'); }
        follow.update(real, gadgets.cameraFocus ?? hero.pos, gadgets.wheelOpen ? NO_LOOK : input.look, gadgets.cameraMode ?? combat.cameraMode ?? hero.cameraMode(), hero.speed);
        // Cinematic camera: overrides whatever follow.update() just set, after it ran.
        cinematic.update(dt);
        // After follow.update, so the rope ribbon billboards toward this frame's camera, not
        // last frame's. It reads only goon and hand positions, which are already final.
        chainFx.update(dt);
        comicFx.update(real, { speed: hero.control?.speed ?? Math.hypot(hero.vel.x, hero.vel.y, hero.vel.z), actionActive: follow.actionActive });
        palT -= real;
        if (palT <= 0) { palT = 0.25; ink.setPalette(world.gradePalette(paletteAt(camera.position.x, camera.position.z, palBuf))); } // [env] graded by the time of day
        hero.updateCape(time.dtFor(hero, dt));
        if (!isReplica()) boss.update(dt); // [net] the Joker is the host's
        if (boss.speech) { const p = toScreen(boss.headWorld(new THREE.Vector3())); hud.speechPos(p.x, p.y - 20, !p.behind); }
        bosses.update(dt); // [story]
        if (!boss.speech && bosses.speech) { const w = bosses.headWorld(new THREE.Vector3()); if (w) { const p = toScreen(w); hud.speechPos(p.x, p.y - 20, !p.behind); } }
        if (combat.combo.value !== lastCombo) { lastCombo = combat.combo.value; hud.setCombo(lastCombo, abilities.has('specialTakedown') ? combat.combo.readyAt : Infinity); } // [onboard] no 'special ready' glow before the story gives it
        hud.setChains(combat.chains, chainLabels);
        gadgetHud.setSwarm(combat.swarm, swarmLabel);
        if (!chainPromptShown && combat.chains.affordable.some(Boolean)) { chainPromptShown = true; prompts.show(['chain']); }
        marker.visible = !!ctx.grappleTarget && !hero.control;
        if (marker.visible) { marker.position.set(ctx.grappleTarget.x, ctx.grappleTarget.y + 1, ctx.grappleTarget.z); marker.rotation.y += real * 3; }
        fill.position.copy(camera.position);
        fill.target.position.copy(hero.pos);
        if (split.split) {
          // Split screen: each view shows the bolts of the goons going after its own player.
          for (const e of combat.enemies) e.ch.root.visible = splitVisible(e);
          coop.glyphsFor(p0, hud.primary, camera, toScreen, glyphIdsP0);
        } else {
          const glyphIds = new Set();
          for (const e of combat.enemies) {
            glyphIds.add(e.id);
            e.ch.root.visible = e.pos.distanceTo(camera.position) > 2.4;
            const show = !!e.glyph && (e.state === 'windup' || e.state === 'throw');
            // A goon winding up off screen (behind her, most often) gets his bolt on the screen edge.
            if (show) { const p = toScreen(e.ch.headWorld(new THREE.Vector3(), 0.45)); const g = edgeGlyph(p.x, p.y, p.behind, innerWidth, innerHeight, 56, 84); hud.glyph(e.id, g.x, g.y, true, e.glyph, g.edge ? g.angle : null); }
            else hud.glyph(e.id, 0, 0, false);
          }
          hud.pruneGlyphs(glyphIds);
        }
        // Predator HUD: awareness rings, lines, the armed counter, the takedown prompt, crouch.
        const room = stealth.active ? stealth.goons : null;
        if (room) {
          for (let i = 0; i < room.length; i++) {
            const g = room[i], code = g.e.alive ? glyphCode(g.mind) : 0;
            if (!code) { stealthHud.glyph(i, 0, 0, false, 0); continue; }
            const p = headOnScreen(g.e);
            stealthHud.glyph(i, p.x, p.y, !p.behind, code);
          }
        }
        stealthHud.hideFrom(room ? room.length : 0);
        stealthHud.updateLines(real, headOnScreen);
        stealthHud.armed(stealth.armed(), !!room && !!state.detectiveOn);
        stealthHud.crouch(!!hero.crouched);
        if (stealth.prompt !== promptKind) {
          promptKind = stealth.prompt;
          stealthHud.prompt(promptKind === 'silent' ? `${key('punch')} Silent takedown` : promptKind === 'perch' ? `${key('kick')} Perch drop` : null);
        }
      } else {
        // Play stopped (paused, a cutscene, the finale) mid-effect: without this, speed lines or
        // the action panel border can freeze on screen instead of easing out.
        comicFx?.update(real, { speed: 0, actionActive: false });
        net?.pre(real, 0); // [net] a comic or a pause still keeps the link and the puppets alive
        // Play stopped: the wheel shuts and no slow time outlives it. A pause, the help screen and
        // photo mode (state.paused) only halt; a cutscene, the finale or the credits also drop
        // anything a gadget has in flight.
        if (!playing) gadgets.interrupt();
        else gadgets.halt();
      }
      detective += ((state.detectiveOn && playing ? 1 : 0) - detective) * Math.min(1, real * 6);
      ink.uniforms.uDetective.value = detective;
      view0.overrides.detective = detective;
      // Every partner's camera, marker, HUD and view effects (src/coop/coopRuntime.js).
      coop.lateUpdate(real, dt, { playing: playing && !state.paused, toScreenOf });
      nav.update(real, { playing: playing && !state.paused && flow.mode === 'play', visible: !comic.playing && !cinematic.active && !photo.active, t: state.t }); // [map]
      if (flow.mode === 'finale') finale.update(real);
      else finale.update(state.paused ? 0 : real);
      // Every frame, not only in play: the GCPD roof is the finale's whole stage.
      roof.update(state.paused ? 0 : real, camera.position);
      flow.update(state.paused ? 0 : real, camera);
      sound.update(real, { hush: state.paused || comic.playing || photo.freezesWorld || flow.mode !== 'play' }); // [prog] photo
      for (let i = 1; i < players.list.length; i++) players.list[i].input.endFrame();
      net?.post(real); // [net] the host's snapshot and events for this frame
    }
    // A goon right in front of a view's camera hides (the old rule, per view: either camera).
    function splitVisible(e) {
      for (const v of split.views) if (e.pos.distanceTo(v.camera.position) <= 2.4) return false;
      return true;
    }
    const glyphIdsP0 = new Set();
    function reviveNearP0() { return coop.partners().length > 0 && !!coopReviveNear(p0); }
    const coopReviveNear = (pl) => players.list.some((o) => o !== pl && o.hero.dead && revive.isDown(o.id) && Math.hypot(o.hero.pos.x - pl.hero.pos.x, o.hero.pos.z - pl.hero.pos.z) <= revive.options.radius + 0.4);

    // [bruce] Wayne Manor, the Batcave, Wayne Tower, playing as Bruce Wayne and the double life
    // (src/bruce/runtime.js). The interiors build lazily, the first time a player goes in.
    const bruce = createBruceLife({
      scene, assets, world, events, hud, radio, combat, vehicles, batwing, progress, quality, audio, prompts, spawn, despawn, follow,
      players: () => players.list, flow: () => flow, game: () => window.__game,
      save: () => saveProgress(storage, progress),
      keyFor: (pl, a) => coopKeyFor(pl, a),
      caseFile: () => checklistAt(progress.step ?? 0, STEPS),
      pause: () => { gadgets.halt(); state.paused = true; state.pauseMenu = false; input.setEnabled(false); document.exitPointerLock?.(); },
      resume: () => resume({ lock: false }),
    });
    for (const k of ['bruce', 'bruceScene', 'bruceDay']) if (params.get(k)) setTimeout(() => (k === 'bruce' ? bruce.start(params.get(k)) : k === 'bruceScene' ? bruce.playScene(params.get(k)) : bruce.playDay(params.get(k))), 400);
    // The Manor, the cave and Wayne Tower count as indoors wherever the game asks the interiors
    // (audio, the environment object, rain, the Batwing): their own rooms first, then the pockets.
    {
      const own = Object.getOwnPropertyDescriptor(interiors, 'inside').get;
      Object.defineProperty(interiors, 'inside', { get: () => own.call(interiors) ?? (bruce.state.inside ? `bruce:${bruce.state.inside}` : null), configurable: true });
    }
    // [integration] The campaign's Bruce-day slots: a night's `day.hook` 'day.nN' plays before
    // night N (docs/design/story-format.md) and is filled by the Bruce slot for the day after night
    // N-1 (src/bruce/days.js). Scripted browsers skip the playable scene (it waits on the player)
    // unless ?bruceDays=1; the skip still applies the night to the double-life meters.
    {
      const playable = params.get('bruceDays') === '1' || (params.get('bruceDays') !== '0' && !navigator.webdriver);
      for (let n = 2; n <= 9; n++) {
        registerDayHook(`day.n${n}`, ({ context } = {}) => {
          const slot = `day${n - 1}`, campaign = { night: `n${n}`, ...(context ?? {}) };
          return playable ? bruce.playDay(slot, { campaign }) : bruce.skipDay(slot, {});
        });
      }
    }
    // [integration] The Batcave's benches open the real screens (src/ui/stations.js), and the
    // skill tree's Wayne branch spends the double life's Wayne credit (src/bruce/doubleLife.js).
    // [fix1] ...and the suit vault the wardrobe ('suits'), the Batcomputer the full city map ('cityMap').
    for (const id of ['skillTree', 'gadgets', 'suits', 'cityMap']) registerBruceUI(id, ({ close } = {}) => openStation(id, { onClose: close }));
    if (params.get('standing') === null) setStandingProvider({ getStanding: () => bruce.credit, spendStanding: (cost, what) => !!bruce.spendCredit(cost, what)?.ok });
    // [bruce] end
    // [wanted] Police attention, the GCPD units and its readout (src/wanted/**, docs/design/wanted.md).
    const wantedCams = [camera];
    const wanted = createWanted({
      scene, world, events, players, vehicles, civilians, combat, quality, assets, progress, hud, interiors,
      flow: () => flow, bruce: () => bruce, nav: () => nav, settings: () => settings, isReplica,
      cameras: () => { wantedCams.length = 0; if (split?.split) for (const v of split.views) wantedCams.push(v.camera); else wantedCams.push(camera); return wantedCams; },
      reducedMotion: () => !!settings.access?.reducedMotion,
      can: (id) => abilities.has(id), // [verify] policeAttention gate
    });
    // [verify] First-time police teaching goes through every view's HUD director (one centre card at a time).
    wanted.setDirector({ request: (item, t) => { for (const h of hud.all()) h.director?.request({ ...item }, t); } });
    nav.addMinimapLayer?.((g, f, at) => wanted.drawMinimap(g, f, at));
    const sandbox = createSandbox({
      scene, world, events, players, vehicles, civilians, combat, quality, assets, progress, hud, isReplica,
      nav: () => nav, bruce: () => bruce, wanted: () => wanted, settings: () => settings,
      can: (id) => abilities.has(id), // [verify] takeCar / carRadio / hailTaxi gates
    });
    // [wanted] end
    const api = {
      hero, follow, combat, hud, comicFx, flow, encounters, trophies, boss, bosses, finale, comic, grapple, update, spawn, despawn, side,
      batwing, nightwing, radio, vehicles, cinematic, interiors, roof, prompts,
      moves, // [move] upgrades, updrafts, pullables (src/traversal/movesRuntime.js)
      abilities, // [onboard] the ability layer (src/abilities/runtime.js)
      civilians, // [env]
      // Renders a posed shot of the live city (comic panels; scripts/clip-sheet.mjs films clips with it).
      stage,
      // Impact frames test hook: pin(ms) samples `ms` into the sequence the next fire() starts.
      impact: {
        fire: (tier, target) => fireImpact(tier, target),
        pin(ms) { impactPin = ms; impactPinBase = performance.now(); impactTl.reset(); },
        get sample() { return { ...impactOut }; },
      }, stage, gfx, breakables, chainFx, swarmFx, photo,
      gadgets, wheelUi, wayne, stealth, stealthFx, stealthHud,
      nav, // [map]
      winFight: () => { for (const e of combat.enemies) if (e.alive && e.type !== 'joker' && e.type !== 'boss') { e.health = 0; e.applyHit({ outcome: 'ko' }, hero.pos); } },
      // ---- players (docs/design/long-night-2.md 4.1) ----
      players: players.list,
      addLocalPlayer,
      removeLocalPlayer: (pl) => coop.removeLocalPlayer(pl ?? players.list[1]),
      revive,
      coop, split, coopHooks,
      // [net] What src/net/game/** reads and calls (docs/design/online-coop.md).
      spawnNet, pickups, events, time,
      netScreen: (e) => headOnScreen(e), // [net2] a goon's head on player 0's screen (the guest's stealth rings)
      takenPickups: () => STEPS.slice(0, flow.stepIndex).filter((s) => s.type === 'collect').map((s) => s.item),
      bruce, // [bruce]
      wanted, sandbox, // [wanted] [sandbox]
    };
    if (params.get('god') === '1') events.on('heroHurt', (d) => { const p = d.player ?? p0; p.hero.health = p.hero.maxHealth; p.hudSlot?.setHealth(1); });
    if (DEV_TOOLS) window.__game.reach = reach;
    // ?p2=1 (gamepad index 1) or ?p2=bot (scripted): a second local hero, dev tools only.
    const p2Mode = params.get('p2');
    // A roster kit loads its model, texture and animation packs first (src/heroes/kitModels.js);
    // the original suits build at once, as before.
    if (p2Mode && DEV_TOOLS) {
      const k2 = kitById(params.get('p2kit') ?? 'f');
      const add = () => addLocalPlayer({ kit: k2, mode: p2Mode === 'bot' ? 'bot' : 'pad' });
      if (kitReady(k2) && !kitInfo(k2).packs.length) add(); else prepareKit(k2, assets).then(add);
    }
    // ?fight=test drops a mixed squad on the GCPD roof (combat sandbox); more of them in co-op.
    if (params.get('fight') === 'test') {
      const b = SITES.start;
      const squad = scaleWave([
        { type: 'grunt', dx: -4, dz: -6 }, { type: 'grunt', dx: 4, dz: -6 },
        { type: 'grunt', dx: 0, dz: -9 }, { type: 'knife', dx: -6, dz: -2 },
        { type: 'brute', dx: 6, dz: -12 },
      ], players.count);
      combat.setEnemies(squad.map(({ type, dx, dz }) => spawn(type, { x: b.x + dx, y: b.y, z: b.z + dz })));
      for (const e of combat.enemies) e.wake();
    }
    Object.assign(window.__game, api, { climbables: world.climbables, teleport: (site) => {
        const p = { ...(SITES[site] ?? site) };
        const g = world.collision.groundBelow(p.x, p.y + 4, p.z, 0.3);
        if (g > -Infinity) p.y = g;
        hero.teleport(p);
        // Co-op: the partner comes too (a test or dev teleport is a story placement).
        if (players.count > 1) flow.bringAlong();
      }, jump: (id) => flow.jumpTo(flow.indexOf(id)) }); // [story] the list in play; retired ids resolve
    Object.defineProperty(window.__game, 'enemies', { get: () => combat.enemies, configurable: true });
    return api;
  }

  // ---------------- pause ----------------
  function pause() {
    if (state.phase !== 'play' || state.paused || !game || game.flow.mode !== 'play') return;
    game.gadgets.halt();
    state.paused = true;
    state.pauseMenu = true;
    input.setEnabled(false);
    document.exitPointerLock?.();
    menus.pause(pauseOptions());
    net?.hostPaused(true); // [net] the guest sees "host away" while the host's menu is up
  }
  // Built fresh on every pause so the info line and the challenge button are current.
  function pauseOptions() {
    const side = game.side;
    const caseFile = checklistAt(progress.step ?? 0, STEPS);
    const opts = {
      onResume: resume,
      onRestart: () => { resume(); game.flow.respawn({ manual: true }); },
      onTitle: () => { side.save(); location.search = ''; },
      info: { ...side.pauseInfo(), wayneFree: game.wayne.free, caseFile: `${caseFile.filter((c) => c.done).length}/${caseFile.length}` },
      onQuitChallenge: () => { side.challenges.quit(); resume(); },
      onChallenges: () => menus.challengesPage(side.challengesPage(), { onBack: () => menus.pause(opts), onRead: () => readPage('goldStandard', () => menus.pause(opts)) }),
      onProgress: () => menus.progressPage(side.progressPage(), { onBack: () => menus.pause(opts), onRead: () => readPage('commendation', () => menus.pause(opts)) }),
      onCaseFile: () => menus.caseFilePage({ title: CHECKLIST_TITLE, items: caseFile }, { onBack: () => menus.pause(opts) }),
      onWayneTech: openWayneTech,
      onPhoto: () => { menus.hide(); game.photo.open(); },
      extra: [{ label: 'City map', onClick: () => game.nav.openMap(game.players[0]) }, ...coopPauseExtras()], // [map]
    };
    return opts;
  }
  // Co-op entries in the pause menu (workstream D1).
  function coopPauseExtras() {
    const out = [];
    // [net] Online co-op: invite a friend into this run, or leave the online game.
    if (net?.runStarted) {
      out.push({ label: net.role === 'host' ? 'End the online game' : 'Leave the online game', onClick: () => { resume(); net.leave(); } });
      return out;
    }
    if (game.players.length === 1) out.push({ label: 'Invite a friend online', onClick: () => { menus.hide(); openNet((n) => n.inviteFromRun()); } });
    const two = game.players.length > 1;
    if (two) {
      out.push({ label: 'Regroup (bring Player 2 over)', onClick: () => { game.coop.regroup(); resume(); } });
      const lay = progress.coop?.split ?? 'vertical';
      out.push({ label: lay === 'horizontal' ? 'Split: stacked (change)' : 'Split: side by side (change)', onClick: () => {
        progress.coop.split = lay === 'horizontal' ? 'vertical' : 'horizontal';
        saveProgress(storage, progress);
        split.relayout();
        menus.pause(pauseOptions());
      } });
      out.push({ label: 'Player 2: drop out', onClick: () => { game.coop.removeLocalPlayer(game.players[1]); resume(); } });
    } else if (devices.connectedPads().length) {
      // Only offered with a controller connected (a keyboard-only player sees the old menu).
      out.push({ label: 'Add Player 2 (press Start / Enter)', onClick: () => { resume(); game.hud.hint('Player 2: press <kbd>Start</kbd> or <kbd>A</kbd> on a controller, or <kbd>Enter</kbd> on the keyboard if Player 1 is on a controller.', 6000); } });
    }
    return out;
  }

  // ---------------- joining, leaving and lost controllers mid-run (workstream D1) ----------------
  // A join press pauses both players and opens the hero select for the joiner; picking a hero
  // spawns them beside player 1 and splits the screen. A lost controller pauses both and asks for
  // a button press; the waiting player can also drop out.
  let joining = null;
  function startJoin(device) {
    joining = { device };
    game.gadgets.halt();
    state.paused = true;
    state.pauseMenu = false;
    input.setEnabled(false);
    document.exitPointerLock?.();
    preview.stageBefore(camera, world.collision, 1);
    heroSelect.show([{ device, kitId: lastPick(progress, 1) ?? 'robin', label: deviceLabel(device) }], {
      joinedOnly: true,
      footer: '<span class="hs-note">Player 2 joins the story where Player 1 is. B / Esc: cancel</span>',
      onDone: async ([kitId]) => {
        const d = joining.device;
        try { await game.coop.join(kitId, d, devices.connectedPads()); } catch (err) { console.error(err); }
        preview.clearAll();
        joining = null;
        resume({ lock: !!game.coop.kbmPlayer });
      },
      onCancel: () => { preview.clearAll(); joining = null; resume({ lock: !!game.coop.kbmPlayer }); },
    });
  }
  function promptWaiting(slot) {
    if (!game) return;
    game.gadgets.halt();
    state.paused = true;
    state.pauseMenu = false;
    input.setEnabled(false);
    document.exitPointerLock?.();
    coopPrompt.show('waiting', `Player ${slot + 1}: controller lost`, `Press <b>A</b> or <b>Start</b> on a controller to carry on as Player ${slot + 1}.`, slot > 0 ? [
      { label: `Player ${slot + 1}: drop out`, onClick: () => { coopPrompt.hide(); game.coop.removeLocalPlayer(game.players[slot]); resume({ lock: !!game.coop.kbmPlayer }); } },
    ] : [
      { label: 'Use the keyboard and mouse', onClick: () => { coopPrompt.hide(); game.coop.joins.slots[0].status = 'playing'; input.setKbm(true); resume(); } },
    ]);
  }
  // Every frame: devices in, joins, lost pads.
  function handleDevices() {
    const ev = devices.poll();
    for (const d of ev.activity) {
      if (typeof d === 'number') lastPadUsed = d;
      else lastPadUsed = null;
    }
    if (state.phase === 'lobby') {
      for (const d of ev.joins) {
        if (!lobby || lobby.devices[1] !== null || d === lobby.devices[0]) continue;
        if (d === 'kbm' && lobby.devices[0] === 'kbm') continue;
        lobby.devices[1] = d;
        heroSelect.fill(1, d, lastPick(progress, 1) ?? 'robin', deviceLabel(d));
      }
      return true;
    }
    if (!game || state.phase !== 'play') return false;
    const flow = game.flow;
    const joins = game.coop.joins;
    for (const idx of ev.disconnected) {
      const slot = joins.disconnect(idx);
      if (slot >= 0) promptWaiting(slot);
    }
    let consumed = false;
    for (const d of ev.joins) {
      if (heroSelect.open || flow.mode !== 'play') break;
      const r = joins.press(d, devices.connectedPads());
      if (r.type === 'reassign') {
        game.coop.reassign(r.slot, d);
        coopPrompt.hide();
        resume({ lock: !!game.coop.kbmPlayer });
        consumed = true;
      } else if (r.type === 'join' && !state.paused) {
        startJoin(d);
        consumed = true;
      } else if (r.type === 'refused') {
        game.hud.hint(r.reason, 4000);
      }
    }
    // Player 0 alone: which device it is on decides what it keeps when someone joins. Noted after
    // the joins, so a join press on a fresh pad is not taken for player 0 using it.
    if (game.players.length === 1 && !consumed) for (const d of ev.activity) if (d === 'kbm' || d === devices.connectedPads()[0]) joins.activity(d);
    return consumed;
  }

  // The WayneTech page stays open while buying; Back returns to a pause menu with fresh numbers.
  // [prog] Wave 3: the skill tree page (src/ui/skillTree/treePage.js) replaces the four-row page;
  // its nodes keep the old .wt-card classes. From the pause menu, Back returns to the pause menu;
  // from the Batcave bench (station 'skillTree') it can also respec, and Back hands control back.
  function openWayneTech({ respec = false, onBack = () => menus.pause(pauseOptions()) } = {}) {
    const draw = (focus = null) => menus.page(buildTreePage(withArrivals(game.wayne.tree(), (id) => game.abilities?.has?.(id) ?? true), { // [verify] withArrivals
      focus, sound: menuSound((n, o) => audio.play(n, o)), reducedMotion: !!settings.access?.reducedMotion,
      onBuy: (id) => { const r = game.wayne.buy(id); audio.play(r.ok ? 'uiConfirm' : 'uiError'); draw(id); }, // [polish] ui-bus sounds
      onRespec: respec ? () => { const r = game.wayne.respec(); if (r.ok) game.hud.card('RESPEC!', `${r.refunded} points back to spend.`, 4000); draw(); } : null,
      onBack,
    }));
    draw();
  }
  // [prog] Stations the Batcave (workstream K) opens by id: src/ui/stations.js.
  function openStationPage(open, ctx = {}) {
    if (!game) { ctx.onClose?.(); return { close() {} }; }
    const wasPaused = state.paused;
    if (!wasPaused) {
      game.gadgets.halt();
      state.paused = true;
      input.setEnabled(false);
      document.exitPointerLock?.();
    }
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      if (stationPageClose === close) stationPageClose = null; // [fix1]
      if (wasPaused) menus.hide(); else resume({ lock: false });
      ctx.onClose?.();
    };
    stationPageClose = close; // [fix1] the pause key closes it (below), as its Back button does
    open(close);
    return { close };
  }
  // [fix1] The station page on screen (openStationPage), so Esc goes through its own close and its
  // opener (the Batcave bench) hears about it, instead of resume() skipping both.
  let stationPageClose = null;
  registerStation('skillTree', (ctx) => openStationPage((close) => openWayneTech({ respec: true, onBack: close }), ctx));
  // Reward comics open from the pause menu. stage.shot moves the camera for its panels, so the
  // paused view is put back before the comic shows.
  function readPage(kind, back) {
    menus.hide();
    const p = camera.position.clone(), q = camera.quaternion.clone();
    const pages = kind === 'goldStandard' ? goldStandardPages(game.stage) : commendationPages(game.stage);
    camera.position.copy(p);
    camera.quaternion.copy(q);
    game.comic.play(pages).then(back);
  }
  // Safari only grants pointer lock inside a real user gesture, and rejects the request
  // (Promise) otherwise, e.g. from Esc or the pad's B button. Swallowing that rejection keeps
  // it from surfacing as an uncaught error; the lock then waits for the player's next click.
  const lockPointer = () => {
    // Co-op: pointer lock belongs to the keyboard+mouse player; two controllers need none.
    if (game && game.players.length > 1 && !game.coop.kbmPlayer) return;
    try {
      canvas.requestPointerLock?.()?.catch?.(() => {
        if (state.phase === 'play' && !state.paused) game?.hud.hint('Click to look around.', 2200);
      });
    } catch { /* some engines throw synchronously instead of rejecting */ }
  };
  function resume({ lock = true } = {}) {
    net?.hostPaused(false); // [net]
    menus.hide();
    state.paused = false;
    state.pauseMenu = false;
    input.setEnabled(true);
    if (lock) lockPointer();
  }

  // Gamepad: pause and help, comic pages, and menu navigation (D-pad to move, A to press, B to go back).
  // Any local player's pad (co-op: each player's own controller) as one: menus, comics, pause.
  const anyPad = (i) => input.padButton(i) || (game ? partnerPad(i) : false);
  function partnerPad(i) {
    for (let k = 1; k < game.players.length; k++) {
      const pl = game.players[k];
      const idx = pl.input.padIndex;
      if (typeof idx !== 'number') continue;
      const n = devices.nav(idx);
      if ((i === 0 && n.ok) || (i === 1 && n.back) || (i === 9 && n.start) || (i === 12 && n.up) || (i === 13 && n.down) || (i === 14 && n.left) || (i === 15 && n.right)) return true;
    }
    return false;
  }
  function padControls() {
    if (game?.photo.active) return;
    if (heroSelect.open || state.phase === 'lobby') return;
    if (game?.comic.playing) {
      if (anyPad(0)) game.comic.advance();
      if (anyPad(1)) game.comic.skip();
      return;
    }
    if (state.phase === 'title' || state.paused || menus.open) {
      const buttons = [...document.querySelectorAll('.menu-layer.show button')];
      if (!buttons.length) return;
      const i = buttons.indexOf(document.activeElement);
      // [prog] A page that moves focus by position (the skill tree) gets the D-pad as arrow keys and
      // the bumpers as zoom.
      const spatial = document.querySelector('.menu-layer.show [data-nav="spatial"]');
      if (spatial && document.activeElement && spatial.contains(document.activeElement)) {
        const key = (k) => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
        if (anyPad(12)) key('ArrowUp');
        if (anyPad(13)) key('ArrowDown');
        if (anyPad(14)) key('ArrowLeft');
        if (anyPad(15)) key('ArrowRight');
        if (anyPad(4)) key('-');
        if (anyPad(5)) key('+');
      } else {
        if (anyPad(12) || anyPad(14)) { buttons[(i - 1 + buttons.length) % buttons.length].focus(); audio.play('uiHover'); } // [polish] focus tick
        if (anyPad(13) || anyPad(15)) { buttons[(i + 1) % buttons.length].focus(); audio.play('uiHover'); }
      }
      if (anyPad(0)) (buttons[i] ?? buttons[0]).click();
      if (anyPad(1) || anyPad(9)) {
        const back = buttons.find((b) => /^(Back|Resume|Done)$/i.test(b.textContent)); // [fix1] Done: the gadget loadout
        if (back) back.click();
        else if (state.pauseMenu) resume({ lock: false });
      }
      return;
    }
    if (!game) return;
    if (anyPad(9)) pause();
    // Co-op: Y + D-pad down is the comms wheel, so help waits for D-pad down alone.
    else if (input.padButton(13) && !(game.players.length > 1 && input.padButtonHeld(3)) && game.flow.mode === 'play') {
      game.gadgets.halt();
      state.paused = true;
      state.pauseMenu = true;
      input.setEnabled(false);
      menus.help(() => resume({ lock: false }));
    }
  }
  // [fix1] When the game itself let go of the mouse (a station, an overlay, the map: they all pause
  // and call exitPointerLock), the change event can arrive after a quick close has already resumed:
  // it then read as "the player pressed Esc in play" and opened the pause menu over live play (the
  // Batcave tests, closing an overlay right after opening it). A loss within a moment of a pause is
  // that echo, not the player.
  let lastPausedAt = -Infinity;
  document.addEventListener('pointerlockchange', () => {
    if (performance.now() - lastPausedAt < 400) return; // [fix1]
    // Losing the mouse mid-game (Esc) pauses, like any PC game.
    if (!document.pointerLockElement && state.phase === 'play' && !state.paused && game?.flow.mode === 'play' && !menus.open && !heroSelect.open && !game.photo.active && !(game.players.length > 1 && !game.coop.kbmPlayer)) pause(); // [prog] photo: a live photo mode frees the mouse on purpose
  });
  window.addEventListener('keydown', (e) => {
    if (state.phase !== 'play' || !game) return;
    if (heroSelect.open || coopPrompt.open) return;
    if (e.target?.closest?.('input[type="text"], textarea')) return;
    if (game.photo.active) {
      if (game.photo.ownsKeyboard && (settings.bindings.pause.includes(e.code) || settings.bindings.photo.includes(e.code))) { e.preventDefault(); game.photo.close(); } // [prog] photo: only the photographer's keyboard
      return;
    }
    const pauseKeys = settings.bindings.pause, helpKeys = settings.bindings.help;
    if (pauseKeys.includes(e.code) && !input.capturing && !game.comic.playing && !game.cinematic.active) { e.preventDefault(); state.paused ? (stationPageClose ? stationPageClose() : menus.open ? resume() : null) : pause(); } // [fix1] stationPageClose
    else if (helpKeys.includes(e.code) && !state.paused && game.flow.mode === 'play') {
      game.gadgets.halt();
      state.paused = true;
      state.pauseMenu = true;
      input.setEnabled(false);
      document.exitPointerLock?.();
      menus.help(resume);
    }
  });
  canvas.addEventListener('click', (e) => {
    audio.unlock();
    if (state.phase !== 'play' || state.paused) return;
    if (!document.pointerLockElement) {
      // This click's only job is re-acquiring the lock (Esc, or Safari losing it on its own);
      // the mousedown that already buffered a punch press for it must not fire one too.
      lockPointer();
      input.swallowCode('Mouse' + e.button);
    }
  });
  window.addEventListener('mousedown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });
  // Cheap (localStorage write): catches a tab close or app switch that skips the pause menu,
  // so at most one save interval's worth of stats is ever at risk instead of up to 20 s.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') game?.side.save(); });

  window.__game = { state, renderer, ink, dynRes, camera, scene, world, input, events, audio, voice, settings, sites: SITES, time, get progress() { return progress; }, begin,
    // [net] Online co-op from scripts and tests: openNet((n) => n.openHost()), and the controller.
    openNet: (fn) => openNet(fn), get net() { return net; }, lightningNow: () => { world.weather.strikeNow(); }, checkStealthRooms: () => checkRooms(world.collision, world.grapplePoints, ROOMS, SITES) };

  // [env] The environment object (design doc 4.5) for player 0's hero (or the camera before a
  // run): read by the audio (sound.js falls back to __game.environment), traffic, civilians, UI.
  const envObj = world.environmentAt(camera.position);
  Object.defineProperty(window.__game, 'environment', {
    get() { return world.environmentAt(game?.hero?.pos ?? camera.position, { indoors: !!game?.interiors?.inside, out: envObj }); },
    configurable: true,
  });

  // ---------------- frame loop ----------------
  let last = performance.now(), fpsT = 0, fpsN = 0, errors = 0;
  let orbit = 0;
  const titlePos = [0, 0, 0], titleLook = [0, 0, 0]; // [polish] title camera path (src/ui/titleCam.js)
  // [env] Lightning comes from world.weather (storms only); the flash timing is the old one.
  // Thunder carries its distance (the audio delays it by distance / 343 m/s).
  world.weather.on((s) => {
    if (s.kind !== 'lightning') return;
    if (game && s.distance < 1800) game.hud.sfx('KRAKOOM!', innerWidth * (0.2 + Math.random() * 0.6), innerHeight * (0.12 + Math.random() * 0.15), true);
    events.emit('thunder', { distance: s.distance });
  });
  function lightning() {
    ink.uniforms.uFlash.value = world.flash; // [verify] a11y: env's lightningFlash already applies flash reduction (no double dimming)
    ink.setEnv(world.keyDir, world.weather.wetness, 0.25 + 0.75 * world.lampsOn); // [env] upper-tier ink passes
  }
  let prevNow = performance.now();
  const coopFocus = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    const stepStart = performance.now();
    try { step(now); } catch (err) { if (errors++ < 5) console.error(err); }
    state.stepMs = performance.now() - stepStart; // JavaScript time this frame (read by ?bench=1)
    if (game && state.phase === 'play' && !state.paused && game.flow.mode === 'play' && frameCap.frame(now - prevNow, state.stepMs)) {
      dynRes.capTo(30);
      state.frameCapped = true;
      // Through the prompt queue (at the front), so a tutorial card can't write over it.
      game.prompts.show(['lowPower'], { first: true });
    }
    dynRes.update(now - prevNow);
    if (game && state.phase === 'play' && !state.paused) detailGov.update(now - prevNow, 1000 / dynRes.refreshHz, !dynRes.enabled || dynRes.scale <= (quality.dynResMin ?? 0.6) + 1e-6); // [perf3]
    prevNow = now;
    if (state.frame === 1) mark('firstFrame');
  }
  function step(now) {
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    const photoOn = !!game?.photo.freezesWorld; // [prog] photo: co-op photo mode never freezes the world
    // Photo mode freezes time: rain, lightning, traffic and the ink's boiling line all hold still.
    if (!photoOn) state.t += real;
    input.update(real);
    // Co-op devices: join presses, lost pads, the lobby (workstream D1). A join press this frame is
    // not also a pause.
    const joinedNow = handleDevices();
    heroSelect.update(devices);
    if (preview.active) preview.update(real);
    let focus = camera.position;
    if (state.phase === 'lobby') {
      // The lobby camera holds still on the heroes (heroPreview.stage placed it).
    } else if (state.phase === 'title') {
      // [polish] A slow drift over the river toward the Loop and Wayne Tower (src/ui/titleCam.js).
      // Dev builds: window.__titleT pins the path, window.__titleCam = [x,y,z,lx,ly,lz] any camera.
      orbit += real;
      const pin = DEV_TOOLS ? window.__titleCam : null;
      if (pin) { camera.position.set(pin[0], pin[1], pin[2]); camera.lookAt(pin[3], pin[4], pin[5]); }
      else {
        titleCamera(DEV_TOOLS && window.__titleT != null ? window.__titleT : orbit, titlePos, titleLook);
        camera.position.set(titlePos[0], titlePos[1], titlePos[2]);
        camera.lookAt(titleLook[0], titleLook[1], titleLook[2]);
      }
    } else if (game) {
      // A cutscene, the finale or the credits never run under a pause menu.
      if (state.pauseMenu && !['play', 'dead'].includes(game.flow.mode)) resume({ lock: false });
      game.update(real);
      if (game.photo.active) game.photo.update(real); // [prog] photo
      focus = game.hero.pos;
      // Two local heroes: lights and shadows follow the pair while they stay together.
      if (game.players.length > 1) {
        const b = game.players[1].hero.pos;
        if (Math.hypot(b.x - focus.x, b.z - focus.z) < 60) focus = coopFocus.copy(focus).add(b).multiplyScalar(0.5);
      }
    }
    if (!joinedNow) padControls();
    if (!photoOn) lightning(real);
    world.update(state.t, photoOn ? 0 : real, focus, camera, game?.hero ?? null);
    // [render] ?views=2: two views of the same scene (dev proof of the split-screen pipeline).
    // Co-op split screen: every local player's view (src/coop/splitScreen.js); one player draws
    // exactly as before.
    if (split?.split) ink.render(scene, split.inkViews(), state.t);
    else if (devViews) devViews.render(state.t, game?.hero ?? null); else ink.render(scene, camera, state.t);
    game?.photo.post(); // [prog] photo: filters and focus over the photographer's view
    input.endFrame();
    audio.update(real);
    state.frame += 1;
    if (state.paused) lastPausedAt = performance.now(); // [fix1] see pointerlockchange
    fpsT += real; fpsN += 1;
    // Refreshed four times a second: quick enough to see a stutter, slow enough to read.
    if (fpsT >= 0.25) {
      state.fps = Math.round(fpsN / fpsT); fpsT = 0; fpsN = 0;
      fpsNum.textContent = String(state.fps);
      if (settings.fpsDetails) fpsD.textContent = `${Math.round(settings.renderScale * dynRes.scale * 100)}% · ${gpuName}`;
    }
  }

  applySettings();
  onProgress(1);
  // Hidden frames under the loading screen: every texture and buffer uploaded and every shader
  // variant (shadow, normal pass, x-ray) built for the whole city and the warm cast, then one
  // real frame of the title view, so nothing compiles or uploads on first sight mid-play.
  camera.position.set(Math.sin(orbit) * 95, 82, Math.cos(orbit) * 95 + 10);
  camera.lookAt(-20, 60, -60);
  try {
    world.update(0, 0, camera.position, camera, null);
    uploadTextures(renderer, scene);
    drawEverything(renderer, ink, scene, camera);
    scene.remove(warmCast);
    ink.render(scene, camera, 0);
  } catch (err) { console.error(err); }
  scene.remove(warmCast);
  mark('prewarm');
  // [render] First boot on auto: time the real pipeline now that every shader is warm.
  // [perf3] Never reloads: the decision is stored for the next launch, and the title offers a restart.
  if (tierChoice.bench) {
    const auto = settleAutoTier({ renderer, draw: () => ink.render(scene, camera, 0), storage, gpu, tier: quality.name,
      onDecided: (next) => { if (state.phase === 'title' && !game) showTierAdvice(document.body, TIER_LABELS[next] ?? next, () => state.phase === 'title' && !game); } });
    // A second reading a few seconds into the title screen (the first second after boot is the
    // noisiest); the faster one decides. Once play has begun, decide on the first alone.
    setTimeout(() => {
      let second = Infinity;
      if (state.phase === 'title' && !game) { try { second = measurePipeline(renderer.getContext(), () => ink.render(scene, camera, state.t), { batches: 10 }); } catch { /* keep the first */ } }
      auto.decide(second);
    }, 4000);
  }
  requestAnimationFrame(frame);
  state.ready = true;
  // [perf2] Crowd figure templates on the title screen, before play needs them (src/civilians/crowd.js).
  if (params.get('civ') !== '0') warmCrowdTemplates({ assets, tierName: quality.name, busy: () => state.phase === 'play' });
  // ?bench=1: the one-link benchmark for the player's own machine (loaded only when asked for).
  // [render] ?bench=districts: fixed-camera per-pass costs per district (scripts/render-bench.mjs).
  // [perf2] ?prof=1 per-system frame scopes, ?off=a,b measurement switches (src/dev/perfProbe.js).
  if (params.get('prof') === '1' || params.get('off')) import('../dev/perfProbe.js').then(({ createPerfProbe }) => createPerfProbe({ params, getGame: () => (game ? window.__game : null), getRun: () => game }));
  if (params.get('bench') === '1') import('../dev/perfBench.js').then(({ runPerfBench }) => runPerfBench({ renderer, ink, dynRes, quality, applyResolution, state, getGame: () => game, gpuName }));
  else if (params.get('bench') === 'districts') import('../dev/perfBench.js').then(({ runDistrictBench }) => runDistrictBench({ renderer, ink, dynRes, quality, applyResolution, state, getGame: () => game, gpuName }));
  // Nightwing and Harley (see warmCast.js): warmed once, off-screen, on idle right after the
  // first real frame instead of before it. Neither appears until minutes into a run (the Courier
  // in Act 1, Harley in Act 2), so this never risks a first-use hitch; it just keeps their shader
  // and texture cost off the loading screen.
  const warmLater = () => {
    try {
      const late = createWarmCastLate(assets);
      scene.add(late);
      uploadTextures(renderer, scene);
      drawEverything(renderer, ink, scene, camera);
      scene.remove(late);
    } catch (err) { console.error(err); }
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(warmLater, { timeout: 2000 });
  else setTimeout(warmLater, 300);
  // The Joker's lines download while the title screen is up.
  setTimeout(() => voice.warm(), 1500);
  // Dev and test shortcuts skip the title: ?at=<step>, ?play=1, ?fight=test.
  if (params.has('at') || params.has('night') || params.has('play') || params.has('fight') || params.has('new') && params.has('skip')) begin(params.get('suit') ?? progress.suit ?? 'm', false);
  else showTitle();
}
