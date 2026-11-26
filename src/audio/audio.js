import { createMixer } from './mixer.js';
import { SFX, SFX_NAMES, triggerSfx } from './sfx.js';
import { createMusic, MUSIC_MODES, STINGERS } from './music.js';
import { createAmbience } from './ambience.js';
import { createSampleBanks } from './samples.js';
import { createVoicePool, PRIORITY } from './voicePool.js';
import { spatialize, makeListener, readListener, makeSpatialResult } from './spatial.js';
import { busLevels, audioTier } from './mixerMath.js';
import { getAudioPrefs, onAudioPrefs } from './prefs.js';
import { classifyImpact, VARIANTS } from './impacts.js';
import { normalizeSurface, normalizeGait } from './footsteps.js';
import { spaceFor } from './spaces.js';
import { createDialogue, dispatchLine, BARK_PRIORITY } from './dialogue.js';
import { renderVoiceLine } from './voiceBlip.js';

export { SFX_NAMES, MUSIC_MODES, STINGERS };

const TICK_MS = 30; // scheduler timer
const LOOKAHEAD = 0.15; // seconds scheduled ahead while visible
const HIDDEN_LOOKAHEAD = 1.5; // background tabs throttle timers to ~1 s
const MODES = new Set([...MUSIC_MODES, 'none']);
const clamp01 = (x) => Math.min(1, Math.max(0, Number(x) || 0));

// The game's sound system. Nothing touches Web Audio until unlock() is called from a user
// gesture; every method before that just records state and never throws. Every public method
// is wrapped so a bad payload costs a console warning at most, never a broken frame.
//
// options: { quality } the render quality object (its `audio` flags pick the audio tier),
//          { base } where the sample banks live (default ./assets/audio/).
export function createAudio({ quality = null, base = './assets/audio/' } = {}) {
  let ctx = null;
  let mix = null;
  let music = null;
  let amb = null;
  let banks = null;
  let timer = 0;
  let disposed = false;
  let prefs = getAudioPrefs();
  if (!quality) quality = guessQuality();
  let tier = audioTier(quality, prefs);
  const state = {
    volumes: { master: 0.9, music: 0.7, sfx: 0.9 }, mode: 'none', rain: 0, glide: 0, glideMode: 'glide', intensity: 0,
    engine: { kind: null, level: 0, speed: 0, boost: false, mode: null, throttle: null, skid: 0 },
    env: null, musicCtx: null,
  };
  const warned = new Set();
  const pool = createVoicePool({ cap: tier.voices });
  let spent = [];
  const rr = new Map(); // round-robin counters per sound
  let impactSeq = 0;
  const listeners = [makeListener(), makeListener()];
  let listenerCount = 0;
  const active = []; // the listeners in use (a view of `listeners`, never reallocated)
  const sp = makeSpatialResult();
  const dialogue = createDialogue();
  const subtitleFns = new Set();

  const warnOnce = (key, msg) => {
    if (warned.has(key)) return;
    warned.add(key);
    console.warn(`[audio] ${msg}`);
  };
  const guard = (fn) => (...args) => {
    try { return fn(...args); } catch (err) { warnOnce(`err:${err && err.message}`, `ignored error: ${err && err.message}`); }
    return undefined;
  };
  const running = () => !disposed && ctx && ctx.state === 'running';
  const clock = () => (running() ? ctx.currentTime : (globalThis.performance?.now?.() ?? Date.now()) / 1000);
  const nextVariant = (key, n = VARIANTS) => { const v = (rr.get(key) ?? Math.floor(Math.random() * n)) + 1; rr.set(key, v); return v % n; };

  function applyPrefs(p) {
    prefs = p;
    tier = audioTier(quality, prefs);
    pool.setCap(tier.voices);
    if (!mix) return;
    const lv = busLevels(state.volumes, prefs);
    mix.setVolumes(lv);
    mix.setNightMode(prefs.nightMode);
    mix.setMono(prefs.mono);
    amb?.setMaxLayers(tier.ambienceLayers);
    music?.setVoiceCap(tier.musicVoices);
  }
  const unsubscribe = onAudioPrefs(guard(applyPrefs));

  function tick() {
    if (!running()) return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const until = ctx.currentTime + (hidden ? HIDDEN_LOOKAHEAD : LOOKAHEAD);
    music.pump(until);
    amb.tick(until);
    // release finished voices so their nodes can be collected
    const now = ctx.currentTime;
    if (spent.length) spent = spent.filter((v) => (v.end < now - 0.2 ? (v.gain.disconnect(), false) : true));
  }

  function steal(v, now) {
    const g = v.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + 0.03);
  }

  // Shared path for every one-shot: positional maths, voice budget, then build it.
  function fire(name, opts = {}) {
    const def = SFX[name];
    if (!def) { warnOnce(`sfx:${name}`, `unknown sfx "${name}"`); return null; }
    if (!running()) return null;
    const o = { ...opts, samples: banks };
    if (opts.pos && listenerCount > 0) {
      spatialize(active, opts.pos, { ref: opts.ref ?? 4, max: opts.max ?? 110, rolloff: 1, indoors: typeof opts.indoors === 'boolean' ? opts.indoors : null }, sp);
      if (sp.gain < 0.004) return null; // too far to hear: costs nothing
      o.gain = (opts.gain ?? 1) * sp.gain;
      if (tier.hrtf && listenerCount === 1 && sp.dist > 1) o.panner = { x: sp.lx, y: sp.ly, z: sp.lz };
      else o.pan = (opts.pan ?? 0) + sp.pan;
      o.lowpass = sp.muffle ? 900 : sp.behind > 0.7 ? 9000 : 0;
      o.wet = (opts.wet ?? 1) * Math.min(2.5, 1 + sp.dist / 30);
    }
    const now = ctx.currentTime;
    const priority = opts.priority ?? def.priority ?? PRIORITY.normal;
    const adm = pool.admit({ name, priority, max: def.max ?? 4 }, now);
    if (!adm.ok) return null;
    if (adm.victim) steal(adm.victim, now);
    const v = triggerSfx(mix, name, now + 0.003 + (opts.delay ?? 0), o);
    if (v) { v.priority = priority; pool.add(v); spent.push(v); }
    return v;
  }

  function emitSubtitle(plan, delayBase = 0) {
    if (!plan || typeof plan !== 'object') return null;
    const now = clock();
    const lines = plan.parts.map((p) => ({ text: p.text, speaker: p.speaker, name: p.name, duration: p.duration, delay: Math.max(0, p.start - now) + delayBase }));
    const sub = { lines, channel: plan.channel, radio: plan.radio, duration: Math.max(0, plan.end - now) + delayBase, text: lines[0]?.text ?? '', speaker: lines[0]?.speaker ?? '', name: lines[0]?.name ?? '' };
    for (const fn of subtitleFns) { try { fn(sub); } catch { /* UI errors never break audio */ } }
    return sub;
  }

  // Plays a dialogue plan: voice blips per line, radio treatment, ducking.
  function voicePlan(plan) {
    if (!running() || !plan) return;
    const now = ctx.currentTime;
    const base = now - clock() + 0.02; // plan times are in clock(); here they equal ctx time
    let out = mix.dlgIn;
    let gain = 1;
    if (plan.pos && listenerCount > 0) {
      spatialize(active, plan.pos, { ref: 5, max: 60, rolloff: 1.2 }, sp);
      if (sp.gain < 0.01) return;
      gain = sp.gain;
      if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = sp.pan; p.connect(mix.dlgIn); out = p; }
    }
    const g = ctx.createGain();
    g.gain.value = gain;
    g.connect(out);
    for (const part of plan.parts) {
      const at = part.start + base;
      renderVoiceLine(ctx, g, at, part.text, part.speaker, { duration: part.duration, radio: plan.radio });
    }
    const total = plan.end - plan.start;
    if (plan.radio) {
      triggerSfx(mix, 'squelch', plan.start + base - 0.05, {});
      triggerSfx(mix, 'squelch', plan.end + base + 0.05, { pitch: 0.8 });
    }
    if (plan.channel !== 'world') mix.duck(plan.radio ? 'radio' : 'dialogue', total + 0.3, now);
    setTimeout(() => { try { g.disconnect(); } catch { /* already gone */ } }, (total + 2) * 1000);
  }

  function startPlan(plan) {
    if (!plan || plan === 'queued') return plan === 'queued' ? { queued: true } : null;
    voicePlan(plan);
    return emitSubtitle(plan);
  }

  const api = {
    unlock: guard(() => {
      if (disposed) return;
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) { warnOnce('noac', 'Web Audio is not available'); return; }
        ctx = new AC({ latencyHint: 'interactive' });
        mix = createMixer(ctx, { volumes: state.volumes, prefs, convolution: tier.convolution });
        music = createMusic(ctx, mix.musicIn, { voiceCap: tier.musicVoices, chorus: !tier.lowSpec });
        banks = createSampleBanks(ctx, { base, enabled: tier.samples });
        amb = createAmbience(ctx, mix.ambIn, { sfxOut: mix.sfxIn, samples: banks, maxLayers: tier.ambienceLayers });
        music.setIntensity(state.intensity);
        if (state.rain > 0) amb.setRain(state.rain);
        if (state.glide > 0) amb.setGlide(state.glide, 0.3, state.glideMode);
        if (state.engine.kind) amb.setEngine(state.engine.kind, state.engine.level, state.engine.speed, state.engine);
        if (state.env) { amb.setEnvironment(state.env); mix.setSpace(spaceFor(state.env)); }
        if (state.musicCtx) music.setContext(state.musicCtx);
        if (state.mode !== 'none') music.setMode(state.mode);
        timer = setInterval(guard(tick), TICK_MS);
        // After the gesture, not on the loading screen: the hits and steps the player hears first.
        banks.load('combat');
        banks.load('steps');
      }
      if (ctx.state !== 'running' && ctx.state !== 'closed') {
        const p = ctx.resume();
        if (p && p.then) p.then(guard(tick), () => {});
      }
    }),

    // { master, music, sfx } from settings.volume (and optionally ambience/dialogue/ui).
    setVolumes: guard((v = {}) => {
      for (const k of ['master', 'music', 'sfx']) if (v[k] !== undefined) state.volumes[k] = clamp01(v[k]);
      if (mix) mix.setVolumes(busLevels(state.volumes, { ...prefs, ...pick(v, ['ambience', 'dialogue', 'ui']) }));
    }),

    // Late quality object (the render workstream picks the tier after a benchmark).
    configure: guard(({ quality: q } = {}) => {
      if (q) { quality = q; applyPrefs(prefs); }
    }),

    // name: any SFX_NAMES entry. opts: gain, pitch, pan, pos ({x,y,z}: positional), indoors
    // (where the source is), ref/max (metres), priority, delay, and recipe options.
    play: guard((name, opts = {}) => { fire(name, opts || {}); }),

    // A combat hit from the `impact` event payload. Returns the impact kind it chose.
    impact: guard((ev = {}) => {
      const c = classifyImpact(ev, impactSeq++);
      const pos = ev.pos && Number.isFinite(ev.pos.x) ? ev.pos : null;
      const pitch = 1 + (Math.random() - 0.5) * 0.07;
      fire(`hit_${c.kind}`, { pos, power: c.power, variant: nextVariant(c.kind), ko: c.ko, pitch, priority: c.ko || c.crit ? PRIORITY.critical : PRIORITY.combat, ref: 6, max: 70 });
      if (c.crit || c.ko) {
        fire('hit_critLayer', { pos, gain: c.crit ? 1 : 0.6, pitch: 1 + (Math.random() - 0.5) * 0.04, ref: 8, max: 80 });
        if (running()) mix.duck('bigHit', c.crit ? 0.9 : 0.5);
      }
      return c.kind;
    }),

    // A whoosh for a swing. kind: the strike's kind ('punch', 'kick', 'heavy', 'spinKick', ...).
    whoosh: guard(({ kind = 'punch', speed = 1, pos = null } = {}) => {
      const name = kind === 'kick' || kind === 'jumpKick' ? 'whooshKick' : kind === 'heavy' || kind === 'slam' ? 'whooshHeavy' : kind === 'spinKick' ? 'whooshSpin' : 'whooshFist';
      fire(name, { pos, pitch: (0.92 + 0.16 * Math.random()) * (0.85 + 0.15 * clamp01(speed)), gain: 0.7 + 0.3 * clamp01(speed), ref: 3, max: 30 });
    }),

    // A footstep. { surface, gait | sprint | speed, who: 'hero'|'goon'|'civilian', pos, foot }.
    footstep: guard((ev = {}) => {
      const surface = normalizeSurface(ev.surface ?? state.env?.surface ?? (state.env && (state.env.weather === 'rain' || state.env.weather === 'storm') && !state.env.indoors && Math.random() < 0.35 ? 'water' : null));
      const gait = normalizeGait(ev.gait, { sprint: !!ev.sprint, speed: ev.speed });
      const who = ev.who === 'goon' || ev.who === 'civilian' ? ev.who : 'hero';
      fire(`step_${surface}`, {
        pos: ev.pos ?? null, gait, who, variant: nextVariant(`step:${surface}`), pitch: 1 + (Math.random() - 0.5) * 0.12,
        gain: who === 'hero' ? 0.85 : 0.7, priority: who === 'hero' ? PRIORITY.movement : PRIORITY.ambient, ref: 3, max: 35,
      });
    }),

    bodyFall: guard((pos = null) => { fire('hit_bodyFall', { pos, variant: nextVariant('fall'), pitch: 1 + (Math.random() - 0.5) * 0.08, ref: 5, max: 50 }); }),

    music: guard((mode) => {
      if (!MODES.has(mode)) { warnOnce(`mode:${mode}`, `unknown music mode "${mode}"`); return; }
      if (mode === state.mode) return;
      state.mode = mode;
      if (music) music.setMode(mode, 1.5);
      tick();
    }),

    // Finer than music(): { context, district, villain, threat }. See music/director.js.
    setMusicContext: guard((c = {}) => {
      state.musicCtx = { ...(state.musicCtx ?? {}), ...c };
      if (music) music.setContext(c);
    }),

    stinger: guard((name) => {
      if (!STINGERS.includes(name)) { warnOnce(`sting:${name}`, `unknown stinger "${name}"`); return; }
      if (running()) { music.stinger(name); mix.duck('stinger', 1.5); }
    }),

    setRain: guard((x) => { state.rain = clamp01(x); if (amb) amb.setRain(state.rain); }),
    // x: 0..1 wind level; mode: 'glide' | 'dive' | 'grapple' | 'zip'.
    setGlide: guard((x, mode = 'glide') => { state.glide = clamp01(x); state.glideMode = mode; if (amb) amb.setGlide(state.glide, 0.3, mode); }),
    // kind: 'batmobile' | 'car' | 'wing' | null. level 0..1 presence, speed 0..1 of top speed.
    // opts: { boost, throttle 0..1, mode: 'pursuit' | 'battle', skid 0..1 }.
    setEngine: guard((kind, level = 1, speed = 0, opts = {}) => {
      const e = state.engine; // mutated in place: called every frame while driving
      e.kind = kind || null; e.level = clamp01(level); e.speed = clamp01(speed); e.boost = !!opts?.boost;
      e.mode = opts?.mode ?? null; e.throttle = Number.isFinite(opts?.throttle) ? opts.throttle : null; e.skid = clamp01(opts?.skid);
      if (amb) amb.setEngine(e.kind, e.level, e.speed, e);
    }),
    setSkid: guard((x) => { if (amb) amb.setSkid(clamp01(x)); }),
    // A vehicle driving past: { kind: 'car'|'truck'|'siren', speed, closest, side, gain }.
    passBy: guard((opts = {}) => { if (running()) amb.passBy(opts); }),
    setCombatIntensity: guard((x) => { state.intensity = clamp01(x); if (music) music.setIntensity(state.intensity); }),

    // The environment object (cityAmbience.js). Drives the ambience bed and the reverb space.
    setEnvironment: guard((env = {}) => {
      state.env = env && typeof env === 'object' ? env : {};
      if (amb) { amb.setEnvironment(state.env); mix.setSpace(spaceFor(state.env)); }
    }),

    // Split screen: up to two listeners, each { camera } or { position, yaw } or { x, y, z, yaw },
    // plus `indoors`. Copied into internal objects, so passing the same array every frame is free.
    setListeners: guard((list = []) => {
      active.length = 0;
      let k = 0;
      const n = Array.isArray(list) ? list.length : list ? 1 : 0;
      for (let i = 0; i < n && k < 2; i++) {
        const src = Array.isArray(list) ? list[i] : list;
        if (!src) continue;
        readListener(src, listeners[k]);
        active.push(listeners[k]);
        k++;
      }
      listenerCount = k;
    }),

    // Thunder from a strike `distance` metres away: later, darker and quieter the farther it is.
    thunder: guard(({ distance = null } = {}) => {
      const d = Number.isFinite(distance) ? distance : 300 + Math.random() * 1500;
      const delay = amb ? amb.thunderDelay(d) : 0;
      fire('thunder', { gain: Math.max(0.35, 1 - d / 3000), lowpass: Math.max(400, 4000 / (1 + d / 600)), delay, priority: PRIORITY.critical });
    }),

    ambientEvent: guard((kind, { distance = 40, azimuth = 0 } = {}) => { if (running()) amb.playEvent(kind, ctx.currentTime + 0.02, distance, azimuth); }),

    // ---- dialogue ----
    // req: { table, text, speaker, priority, channel: 'world'|'voice'|'radio', radio, pos, interrupt }
    // Returns a subtitle { text, speaker, name, duration, lines[], channel } when the line starts
    // now, { queued: true } when it waits its turn, or null when it was dropped.
    bark: guard((req = {}) => startPlan(dialogue.request(req, clock()))),
    say: guard((text, speaker = 'alfred', opts = {}) => startPlan(dialogue.request({ text, speaker, channel: opts.radio ? 'radio' : 'voice', priority: BARK_PRIORITY.story, ...opts }, clock()))),
    // A crime alert over the police radio: alert tone, then dispatch reading it out.
    dispatch: guard(({ kind = 'generic', district = 'the city', text = null } = {}) => {
      const line = text ?? dispatchLine({ kind, district });
      const sub = startPlan(dialogue.request({ text: line, speaker: 'dispatch', channel: 'radio', radio: true, priority: BARK_PRIORITY.radio }, clock() + 0.45));
      if (sub && !sub.queued) fire('dispatchTone', {});
      return sub;
    }),
    // fn(subtitle) is called whenever a line starts. Returns an unsubscribe function.
    onSubtitle(fn) { if (typeof fn === 'function') subtitleFns.add(fn); return () => subtitleFns.delete(fn); },
    duck: guard((kind, seconds = 1) => { if (running()) mix.duck(kind, seconds); }),

    // Per frame: only the dialogue queue needs a nudge; sound scheduling runs on its own timer.
    update: guard(() => { const plan = dialogue.update(clock()); if (plan) startPlan(plan); }),

    dispose: guard(() => {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
      unsubscribe();
      if (music) music.dispose();
      if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
      mix = music = amb = banks = null; // later calls only record state
      pool.clear();
      spent = [];
    }),

    get context() { return ctx; },
    get tier() { return { ...tier }; },
    get listenerCount() { return listenerCount; },
    get musicState() { return music ? { mode: music.mode, cue: music.cue, section: music.section } : { mode: state.mode, cue: null, section: null }; },
    get voices() { return ctx ? pool.active(ctx.currentTime).length : 0; },
    get ambienceLevels() { return amb?.levels ?? null; },
    get samplesLoaded() { return banks ? ['combat', 'steps', 'world'].filter((b) => banks.loaded(b)) : []; },
  };
  return api;
}

// Until the game hands over its quality object (configure()), read the tier the player chose
// (?q= or the saved setting) so the mixer is built right at the first gesture.
function guessQuality() {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? '').get('q');
    if (q) return { name: q };
    const raw = globalThis.localStorage?.getItem('gotham-settings-v1');
    const name = raw ? JSON.parse(raw)?.quality : null;
    return typeof name === 'string' ? { name } : null;
  } catch { return null; }
}

function pick(o, keys) {
  const out = {};
  for (const k of keys) if (o && o[k] !== undefined) out[k] = o[k];
  return out;
}
