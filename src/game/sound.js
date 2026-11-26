import { districtAt as coreDistrictAt } from '../world/mapData.js';
import { DISTRICT_LABEL } from './crimes.js';

// Maps game events to the audio engine: effects, impacts, footsteps, barks, stingers, the
// listener and environment it hears from, and which music plays when.
//
// Everything new reads optional payload fields and falls back when they are missing, so the
// other workstreams can add them at their own pace (see the hand-back for the list):
//   impact      { pos, move, outcome, target, crit, power?, strike?, material? }
//   footstep    { sprint, surface?, gait?, who?, pos?, player? }
//   animEvent   { actor, name: 'footL'|'footR'|..., clip }   (timer footsteps step aside)
//   land        { hard, who, pos?, surface? }
//   swing       { kind, finisher, speed?, pos? }
// Optional deps: camera (or `listeners()` returning cameras/views for split screen),
// `environment()` returning the environment object, quality, world.
export function wireAudio({
  audio, events, hero, combat, flow, voice = null, settings, stealth = null,
  camera = null, listeners = null, environment = null, quality = null, world = null,
}) {
  const on = (ev, fn) => events.on(ev, (p) => fn(p && typeof p === 'object' ? p : {}));
  const vary = (p = 0.12) => 1 - p / 2 + Math.random() * p;
  const now = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000;
  const G = () => globalThis.__game ?? null;
  let overrideDistrict = null; // [sandbox]
  let fighting = false;
  let mode = 'explore';
  let district = null;
  let lastFootAnim = -1; // when the hero last stepped from an animation event
  let lastCritLayer = -1;
  let lastVehicle = null;
  let lastFear = 0;
  let lastFearSting = -1;
  let diving = false;
  if (quality) audio.configure?.({ quality });

  const heroPos = (p) => (p && Number.isFinite(p.x) ? p : hero?.pos ?? null);
  const isHero = (actor) => !actor || actor === hero || actor === hero?.bat || actor?.isHero;
  const gaitOf = () => (hero?.crouched || hero?.state === 'crouch' ? 'crouch' : hero?.speed > 8 ? 'sprint' : hero?.speed > 4.5 ? 'run' : 'walk');

  // ---- movement ----
  on('footstep', (e) => {
    // the animation's own foot plants win when they arrive (workstream N's foot* events)
    if (isHero(e.actor) && now() - lastFootAnim < 0.6) return;
    audio.footstep({ ...e, gait: e.gait ?? (e.sprint ? 'sprint' : gaitOf()), who: e.who ?? 'hero', pos: e.pos ?? (isHero(e.actor) ? null : e.actor?.pos) });
  });
  on('animEvent', (e) => {
    if (typeof e.name !== 'string' || !e.name.startsWith('foot')) return;
    if (isHero(e.actor)) {
      lastFootAnim = now();
      if (hero?.state === 'air' || hero?.state === 'glide') return;
      audio.footstep({ gait: gaitOf(), who: 'hero', surface: e.surface });
    } else {
      const a = e.actor;
      audio.footstep({ who: a?.civilian || a?.kind === 'civilian' ? 'civilian' : 'goon', pos: a?.pos ?? null, gait: (a?.speed ?? 3) > 5 ? 'run' : 'walk', surface: e.surface });
    }
  });
  on('jump', () => { audio.play('whoosh', { gain: 0.35, pitch: 1.2 }); audio.play('cloth', { gain: 0.5 }); });
  on('vault', () => { audio.play('whoosh', { gain: 0.35, pitch: 1.3 }); audio.play('cloth', { gain: 0.4 }); });
  on('land', ({ hard, who, pos, surface }) => {
    diving = false;
    const p = who === 'hero' ? null : pos ?? null;
    if (hard) { audio.play('land', { pos: p }); audio.footstep({ gait: 'land', surface, pos: p, who: 'hero' }); } else audio.footstep({ gait: 'land', surface, pos: p, who: 'hero' });
  });
  on('glideStart', () => audio.play('glideStart'));
  on('grapple', () => audio.play('grapple'));
  on('grappleLand', () => audio.play('grappleLand'));
  on('grappleBoost', () => audio.play('whoosh', { gain: 0.6, pitch: 0.8 }));
  on('swing', ({ kind, speed, pos }) => audio.whoosh({ kind, speed: speed ?? 1, pos: pos ?? null }));
  on('whiff', () => audio.play('whooshFist', { gain: 0.8, pitch: 0.9 }));
  on('cape', () => audio.play('cape'));
  on('dodge', () => { audio.play('roll'); audio.play('cloth', { gain: 0.5, pitch: 0.9 }); });
  on('ladderOn', () => audio.play('grappleLand', { gain: 0.6 }));
  on('ledgeGrab', () => { audio.play('grappleLand', { gain: 0.7 }); audio.play('cloth', { gain: 0.5 }); });
  on('zipOn', () => { audio.play('grapple'); audio.play('zipLine'); });
  on('wallRun', () => audio.play('whoosh'));
  on('wallKick', () => audio.play('whoosh'));
  on('diveStart', () => { diving = true; audio.play('glideStart'); });
  on('diveImpact', ({ pos }) => { diving = false; audio.play('land', { gain: 1.4 }); audio.play('hit_heavy', { pos: pos ?? null, power: 2 }); });
  on('perchDropStart', () => audio.play('whoosh', { gain: 0.7, pitch: 0.75 }));

  // ---- combat ----
  on('impact', (e) => {
    audio.impact(e);
    if (e.crit) lastCritLayer = now();
    if (e.outcome === 'knockdown') audio.play('hit_bodyFall', { pos: e.pos ?? null, delay: 0.35 });
  });
  on('critical', ({ target }) => {
    // takedowns call critical() without an impact; plain crits already got the layer with the hit
    audio.play('takedown', { gain: 0.55 });
    if (now() - lastCritLayer > 0.25) { audio.play('hit_critLayer', { pos: target?.pos ?? null }); audio.duck?.('bigHit', 0.9); }
  });
  on('special', () => audio.play('takedown'));
  on('grab', () => audio.play('cloth', { pitch: 0.8 }));
  on('throwRelease', () => audio.play('whooshHeavy', { gain: 0.9, pitch: 0.9 }));
  on('slamStart', () => audio.play('whooshHeavy', { gain: 0.7, pitch: 0.8 }));
  on('slam', ({ pos }) => { audio.play('land'); audio.play('hit_heavy', { pos: pos ?? null, power: 2.2 }); });
  on('counter', () => audio.play('counter', { gain: 0.6 }));
  on('heroHurt', ({ blocking, kind }) => {
    if (blocking) audio.play('hit_blocked', { pitch: vary(0.08) });
    else if (kind !== 'gas' && kind !== 'buzzer') audio.play('hurt', { pitch: vary() });
  });
  on('heroDown', () => audio.stinger('death'));
  on('chainStart', ({ stealth: s }) => audio.play('whoosh', { gain: s ? 0.5 : 0.8, pitch: 0.85 }));
  on('chainTether', () => audio.play('tether'));
  on('chainYank', () => audio.play('whooshHeavy', { gain: 0.8 }));
  on('chainTied', () => { audio.play('hit_heavy', { power: 1.5 }); audio.play('tether', { gain: 0.7, pitch: 0.7 }); });
  on('chainGrab', () => audio.play('cloth', { pitch: 0.7 }));
  on('chainSmash', ({ pos }) => audio.play('konk', { pos: pos ?? null }));
  on('chainStomp', () => audio.play('hit_kick', { power: 1.6 }));
  on('tiedBreak', () => audio.play('konk', { pitch: 0.8 }));
  on('rifleShot', (e) => audio.play('rifleShot', { pitch: vary(0.1), pos: e.from ?? e.target?.pos ?? null, ref: 12, max: 200 }));
  on('rifleAim', () => audio.play('laser'));
  on('silentStart', () => audio.play('choke'));
  on('stealthAlarm', ({ target }) => { audio.play('alarm'); audio.bark({ table: 'goon.spotted', pos: target?.pos ?? null, speaker: `goon${target?.id ?? ''}` }); });
  on('stealthLine', ({ target, text }) => { if (text) audio.bark({ text, speaker: `goon${target?.id ?? ''}`, pos: target?.pos ?? null, channel: 'world' }); });
  on('stealthFear', ({ fear }) => {
    const f = Number(fear) || 0;
    if (f > lastFear + 0.15 && now() - lastFearSting > 8) { audio.play('fearRising'); lastFearSting = now(); }
    lastFear = f;
  });
  on('courierTaunt', ({ text }) => { if (text) audio.bark({ text, speaker: 'goon', channel: 'world' }); });

  // ---- gadgets ----
  on('batarangThrow', () => audio.play('batarangThrow'));
  on('batarangHit', () => audio.play('batarangHit'));
  on('batarangWall', ({ pos }) => audio.play('tink', { pos: pos ?? null }));
  on('wheelOpen', () => audio.play('wheelOpen'));
  on('wheelPick', () => audio.play('uiMove'));
  on('gadgetEquip', () => audio.play('uiSelect', { gain: 0.7 }));
  on('remoteStart', () => audio.play('batarangThrow'));
  on('remoteWhirr', () => audio.play('remote'));
  on('remoteHit', () => audio.play('batarangHit'));
  on('gelSpray', ({ pos }) => audio.play('gelSpray', { pitch: vary(), pos: pos ?? null }));
  on('gelBlast', ({ pos }) => audio.play('gelBoom', { pitch: vary(0.1), pos: pos ?? null, ref: 10, max: 160 }));
  on('smoke', ({ pos }) => audio.play('smoke', { pos: pos ?? null }));
  on('launcherFire', () => audio.play('launcher'));
  on('launcherOn', () => audio.play('grapple'));
  on('clawYank', () => audio.play('claw'));
  on('clawRip', ({ target }) => audio.play('clawRip', { pos: target?.pos ?? null }));
  on('freeze', () => audio.play('freeze'));
  on('iceShatter', ({ pos }) => audio.play('shatter', { pos: pos ?? null }));
  on('flashbang', ({ pos }) => audio.play('flashbang', { pos: pos ?? null, ref: 10, max: 150 }));
  on('glassBroken', ({ pos }) => audio.play('glassBreak', { pos: pos ?? null }));
  on('wallBroken', ({ pos }) => audio.play('wallBreak', { pos: pos ?? null }));
  on('ventOpen', () => audio.play('ventOpen'));
  on('railingDown', ({ pos }) => audio.play('railingDown', { pos: pos ?? null }));
  on('swarmStart', () => audio.play('swarm'));
  // [prog] gadgets (wave 3): each new gadget's own events, voiced with the existing effects.
  on('disruptorJam', ({ target }) => audio.play('laser', { pos: target?.pos ?? null, pitch: 0.7 }));
  on('sonicThrow', () => audio.play('batarangThrow', { pitch: 1.15 }));
  on('sonicLand', ({ pos }) => audio.play('tink', { pos: pos ?? null, pitch: 1.4 }));
  on('sonicPulse', ({ pos }) => audio.play('remote', { pos: pos ?? null, pitch: 1.6, gain: 0.6 }));
  on('sonicStun', ({ pos }) => audio.play('flashbang', { pos: pos ?? null, pitch: 1.3, gain: 0.7 }));
  on('hackStart', () => audio.play('radioCrackle'));
  on('hackDone', () => audio.play('uiSelect'));
  on('hackFail', () => audio.play('uiBack'));
  on('shockCharge', () => audio.play('buzzer', { gain: 0.4, pitch: 1.4 }));
  on('shockStrike', ({ target }) => audio.play('buzzer', { pos: target?.pos ?? null, gain: 0.8 }));
  on('glueThrow', () => audio.play('throw'));
  on('glueBurst', ({ pos }) => audio.play('gelSpray', { pos: pos ?? null, pitch: 0.7 }));
  on('trackerTag', () => audio.play('tink', { pitch: 1.8, gain: 0.6 }));
  on('droneLaunch', () => audio.play('remote'));
  on('droneMark', () => audio.play('uiMove', { gain: 0.5 }));
  on('bolasThrow', () => audio.play('throw'));
  on('bolasWrap', ({ target }) => audio.play('claw', { pos: target?.pos ?? null }));
  on('empPlace', () => audio.play('uiSelect', { gain: 0.6 }));
  on('empPulse', ({ pos }) => audio.play('gelBoom', { pos: pos ?? null, pitch: 0.6, ref: 10, max: 150 }));
  on('decoyOn', () => audio.play('pickup', { pitch: 0.8 }));
  on('decoyShot', ({ from }) => audio.play('rifleShot', { pitch: vary(0.1), pos: from ?? null, ref: 12, max: 200 }));
  on('gas', () => audio.play('gas'));
  on('buzzer', () => audio.play('buzzer'));
  on('signal', () => audio.play('signal'));

  // ---- progress and the new systems' stingers ----
  on('trophy', () => audio.play('trophy'));
  on('pickup', () => audio.play('pickup'));
  on('cacheFound', () => { audio.play('collectible'); audio.play('pickup', { gain: 0.6 }); });
  on('collectible', () => audio.play('collectible'));
  on('levelUp', () => audio.play('levelUp'));
  on('upgradeBought', () => audio.play('upgrade'));
  on('objectiveDone', ({ type }) => { if (type === 'reached' || type === 'fightDone') audio.stinger('objective'); });
  on('waypointSet', () => audio.play('waypointSet'));
  on('objectiveReveal', () => audio.play('waypointSet')); // [onboard] the next goal's banner arriving after the hand-off beat
  on('caseSolved', () => audio.play('caseSolved'));
  on('missionComplete', () => audio.stinger('missionComplete'));
  on('fearRising', () => audio.play('fearRising'));
  on('bossIntro', () => audio.stinger('bossIntro'));
  on('fightStart', () => { fighting = true; });
  on('fightDone', () => { fighting = false; });
  on('cutscene', ({ name, on: starting }) => { if (starting && ['crates', 'rig', 'antidote'].includes(name)) audio.stinger('districtClear'); });
  on('bossPhase', () => audio.stinger('bossPhase'));
  on('thunder', ({ distance }) => audio.thunder({ distance }));
  on('laugh', () => { if (!voice || voice.speaking || !voice.say('laugh', { interrupt: false })) audio.play('laugh'); });
  on('jokerVoice', ({ id }) => voice?.say(id));

  // ---- barks and radio ----
  // Any system can ask for a line: events.emit('bark', { table: 'goon.idle', pos, speaker }).
  on('bark', (req) => audio.bark(req));
  on('dispatch', (req) => audio.dispatch(req));
  on('crimeSpawn', ({ kind, district: d, text = null, dispatched = true }) => { if (dispatched !== false) audio.dispatch({ kind: kind ?? 'generic', district: DISTRICT_LABEL[d] ?? d ?? 'the city', text }); }); // [world-content] the crime's own line; a crime found by ear is not called in

  // ---- vehicles ----
  // Continuous engine loops are set every frame by the vehicle code itself (audio.setEngine).
  on('vehicleEnter', ({ kind }) => { lastVehicle = kind; audio.play('carDoor'); audio.play('ignition', { pitch: kind === 'batmobile' ? 0.85 : 1.15 }); });
  on('vehicleExit', ({ kind }) => { lastVehicle = null; audio.play('carDoor', { pitch: kind === 'batmobile' ? 0.9 : 1.1 }); });
  on('vehicleBoost', () => audio.play(lastVehicle === 'batmobile' ? 'afterburner' : 'boostRoar'));
  on('vehicleMode', () => audio.play('modeShift'));
  on('vehicleSkid', ({ amount }) => audio.setSkid(amount ?? 1));
  on('trafficPassBy', (e) => audio.passBy(e)); // [env] ambient traffic pass-bys (cityLife.js)
  on('trafficHonk', ({ pos }) => { const h = heroPos(null); audio.ambientEvent('carHorn', { distance: pos && h ? Math.hypot(pos.x - h.x, pos.z - h.z) : 30 }); }); // [env] the horn
  on('vehicleImpact', ({ speed }) => audio.play('crash', { gain: Math.min(1.1, 0.5 + (Number(speed) || 0) / 22), pitch: Math.min(1.15, 0.85 + (Number(speed) || 0) / 70) }));
  on('cannonFire', () => audio.play('cannonFire'));
  on('droneShot', () => audio.play('droneShot', { pitch: vary(0.08) }));
  on('shellHit', () => audio.play('shellBlast'));
  on('armorHit', () => audio.play('armorHit'));
  on('droneDestroyed', () => audio.play('droneBoom', { pitch: vary(0.1) }));
  on('armadaPop', ({ count }) => {
    const n = Number(count) || 1;
    audio.play('pop', { gain: Math.min(1.3, 0.8 + 0.12 * n) });
    audio.play('balloon', { gain: Math.min(1.1, 0.7 + 0.08 * n), delay: 0.12 });
  });

  audio.setRain(0.8);

  // ---- per-frame: listener, environment, music ----
  const listenerList = [];
  const wrap = [{ camera: null, indoors: null }, { camera: null, indoors: null }]; // reused every frame
  const env = { district: null, timeOfDay: 23, weather: 'rain', indoors: false, altitude: 0, traffic: null, crowd: null };
  let envT = 0;
  let lastEnv = null;

  function updateListeners() {
    listenerList.length = 0;
    const custom = typeof listeners === 'function' ? listeners() : null;
    const indoors = typeof lastEnv?.indoors === 'boolean' ? lastEnv.indoors : null;
    const add = (c) => { if (listenerList.length < 2 && c) { const w = wrap[listenerList.length]; w.camera = c; w.indoors = indoors; listenerList.push(w); } };
    if (Array.isArray(custom) && custom.length) { for (const l of custom) if (listenerList.length < 2) listenerList.push(l); }
    else {
      const players = G()?.players;
      if (Array.isArray(players) && players.length > 1) for (const p of players) add(p?.view?.camera);
      if (!listenerList.length) add(camera ?? G()?.camera);
    }
    if (listenerList.length) audio.setListeners(listenerList);
  }

  function buildEnv() {
    const given = typeof environment === 'function' ? environment() : environment ?? G()?.environment ?? null;
    if (given && typeof given === 'object') return given;
    const p = hero?.pos;
    const w = world ?? G()?.world;
    env.district = p ? (w?.districtAt?.(p.x, p.z) ?? coreDistrictAt(p.x, p.z)) : 'gcpd';
    if (env.district === 'city') env.district = 'gcpd';
    const clock = w?.clock;
    env.timeOfDay = Number.isFinite(clock) ? clock : Number.isFinite(clock?.hours) ? clock.hours : 23;
    const wx = w?.weather;
    env.weather = typeof wx === 'string' ? wx : typeof wx?.state === 'string' ? wx.state : 'rain';
    env.indoors = !!(G()?.interiors?.inside ?? G()?.game?.interiors?.inside);
    env.altitude = p ? Math.max(0, p.y) : 0;
    return env;
  }

  return {
    // hush: gameplay is stopped (pause menu, a comic, photo mode). The vehicle code only sets the
    // engine while it runs, so silence the loops here; it sets them again on the next played frame.
    update(real, { hush = false } = {}) {
      if (hush) { audio.setEngine(null); audio.setGlide(0); }
      updateListeners();
      envT -= real;
      if (envT <= 0) {
        envT = 0.25; // the bed only needs a few updates a second
        const e = buildEnv();
        lastEnv = e;
        audio.setEnvironment(e);
        if (e.district !== district) { district = e.district; if (!(flow?.musicContext ?? G()?.sandbox?.radio?.musicContext)?.district) audio.setMusicContext({ district }); } // [sandbox] not over a radio station
      }
      const step = flow?.objectives?.step;
      const override = flow?.musicContext ?? G()?.sandbox?.radio?.musicContext ?? G()?.wanted?.musicContext ?? null; // [wanted] a pursuit's chase music; [sandbox] the car radio's station
      const want = override?.context
        ?? (step?.type === 'boss' ? 'boss'
          : step?.scene === 'finale' || step?.type === 'credits' ? 'finale'
            : flow?.mode === 'cutscene' ? 'title'
              : stealth?.active && !stealth.alarm ? 'stealth'
                : fighting || combat?.active ? 'combat' : 'explore');
      if (want !== mode || (override?.district ?? null) !== overrideDistrict) { // [sandbox] a station change re-picks the theme
        overrideDistrict = override?.district ?? null;
        mode = want;
        audio.setMusicContext({ context: want, district: override?.district ?? district, villain: override?.villain ?? step?.villain ?? 'joker' }); // [sandbox] a radio station picks its own theme
        audio.music(want);
      }
      if (!hush) {
        const st = hero?.state;
        const zip = typeof st === 'string' && st.startsWith('zip');
        const lvl = st === 'glide' || diving ? Math.min(1, 0.35 + (hero.speed ?? 0) / 40) : zip ? 0.5 : 0;
        audio.setGlide(lvl, diving ? 'dive' : zip ? 'zip' : 'glide');
      }
      const enemies = combat?.enemies ?? [];
      let aware = 0;
      for (const e of enemies) if (e.alive && e.aware) aware++;
      const heat = combat?.active ? Math.min(1, aware / 6 + (combat.combo?.value ?? 0) / 16) : stealth?.active ? Math.min(1, (stealth.alarm ? 0.6 : 0.2) + lastFear * 0.4) : 0;
      audio.setCombatIntensity(heat);
      audio.update(real);
    },
    start() { audio.music(mode); audio.setMusicContext({ context: mode }); },
  };
}
