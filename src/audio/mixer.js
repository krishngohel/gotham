import { createReverb, createAlgoReverb, spaceImpulse } from './reverb.js';
import { busLevels, duckLevel, DUCK_RULES, dynamicsSettings, LIMITER } from './mixerMath.js';
import { SPACES } from './spaces.js';

// Bus layout shared by the live game and the offline self-check:
//
//   music  -> musicIn -> duck -> vol ----------------------------\
//                                 \-> hall reverb (music only) ---+
//   sfx    -> sfxIn   -> duck -> vol ------------------------------+
//   sends  -> sfxWet  -> space reverb (crossfades by space) -> vol-+--> master -> glue -> mono -> limiter -> out
//   ambience -> ambIn -> duck -> vol ------------------------------+
//   dialogue -> dlgIn -> vol --------------------------------------+
//   ui       -> uiIn  -> vol --------------------------------------/
//
// `limiter: false` (the offline self-check) skips the glue compressor and the limiter so the
// measured peaks are the recipes' own. `convolution: false` (low-spec tier) swaps both reverbs
// for the cheap feedback-delay one.
export function createMixer(ctx, { limiter = true, volumes = {}, prefs = {}, convolution = true } = {}) {
  const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  // No bass into a reverb: a random noise impulse has a random low end, and sustained bass
  // through it piles up into boom (and, measured, the occasional peak far above the dry signal).
  const hpf = (freq, to) => { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq; f.Q.value = 0.6; f.connect(to); return f; };
  const lv = busLevels(volumes, prefs);

  let tail = ctx.destination;
  let lim = null, glue = null, makeup = null, mono = null;
  if (limiter) {
    lim = ctx.createDynamicsCompressor();
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) lim[k].value = LIMITER[k];
    lim.connect(ctx.destination);
    mono = gain(1, lim);
    glue = ctx.createDynamicsCompressor();
    makeup = gain(1, mono);
    glue.connect(makeup);
    tail = glue;
  }
  const master = gain(lv.master, tail);

  // ---- music: its own hall, so a change of street space never smears the score ----
  const musicVol = gain(lv.music, master);
  const musicDuck = gain(1, musicVol);
  const musicIn = gain(1, musicDuck);
  const musicWet = gain(0.8, master);
  let musicVerb;
  if (convolution) { musicVerb = createReverb(ctx); musicVerb.connect(musicWet); musicVol.connect(hpf(220, gain(0.32, musicVerb))); }
  else { musicVerb = createAlgoReverb(ctx); musicVerb.setSpace('interior', 0.01); musicVerb.output.connect(musicWet); musicVol.connect(hpf(220, gain(0.25, musicVerb.input))); }

  // ---- sfx ----
  const sfxVol = gain(lv.sfx, master);
  const sfxDuck = gain(1, sfxVol);
  const sfxIn = gain(1, sfxDuck);
  const wetVol = gain(lv.sfx, master); // the reverb return follows the effects volume
  const sfxWet = gain(1); // everything sent here is reverberated in the current space
  const wetIn = ctx.createBiquadFilter(); // the reverb's input, with the bass rolled off
  wetIn.type = 'highpass';
  wetIn.frequency.value = 160;
  wetIn.Q.value = 0.6;
  sfxWet.connect(wetIn);

  // Space reverb: two convolver slots crossfaded when the listener's space changes.
  let space = 'street';
  let slots = [];
  let algo = null;
  if (convolution) {
    const conv = ctx.createConvolver();
    conv.buffer = spaceImpulse(ctx, space);
    const g = gain(1, wetVol);
    conv.connect(g);
    wetIn.connect(conv);
    slots.push({ conv, g, name: space });
  } else {
    algo = createAlgoReverb(ctx);
    algo.setSpace(space, 0.01);
    wetIn.connect(algo.input);
    algo.output.connect(wetVol);
  }

  // ---- ambience, dialogue, ui ----
  const ambVol = gain(lv.ambience, master);
  const ambDuck = gain(1, ambVol);
  const ambIn = gain(1, ambDuck);
  const dlgVol = gain(lv.dialogue, master);
  const dlgIn = gain(1, dlgVol);
  const uiVol = gain(lv.ui, master);
  const uiIn = gain(1, uiVol);

  const busGain = { master, music: musicVol, sfx: sfxVol, ambience: ambVol, dialogue: dlgVol, ui: uiVol };
  const duckGain = { music: musicDuck, sfx: sfxDuck, ambience: ambDuck };
  const ducks = { music: [], sfx: [], ambience: [] };

  function ramp(param, v, now, time) {
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(v, now + time);
  }

  // Reschedules one bus's duck curve from its list of active ducks: down fast, and back up in
  // steps as each duck expires (the deepest active duck always wins, see duckLevel).
  function applyDucks(bus, now) {
    const list = ducks[bus] = ducks[bus].filter((d) => d.until > now);
    const p = duckGain[bus].gain;
    p.cancelScheduledValues(now);
    p.setValueAtTime(p.value, now);
    p.setTargetAtTime(duckLevel(list, now), now, 0.02);
    const ends = [...new Set(list.map((d) => d.until))].sort((a, b) => a - b);
    for (const t of ends) p.setTargetAtTime(duckLevel(list, t + 1e-3), t, 0.18);
  }

  function setDynamics(night) {
    if (!glue) return;
    const s = dynamicsSettings(night);
    const now = ctx.currentTime;
    for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) glue[k].setValueAtTime(s[k], now);
    makeup.gain.setTargetAtTime(s.makeup, now, 0.1);
  }
  function setMono(on) {
    if (!mono) return;
    mono.channelCount = on ? 1 : 2;
    mono.channelCountMode = on ? 'explicit' : 'max';
    mono.channelInterpretation = 'speakers';
  }
  setDynamics(!!prefs.nightMode);
  setMono(!!prefs.mono);

  return {
    ctx, master, musicIn, sfxIn, sfxWet, ambIn, dlgIn, uiIn,
    // the bus a named category plays into (sound definitions carry a `bus`)
    input(bus) {
      return bus === 'music' ? musicIn : bus === 'ambience' ? ambIn : bus === 'dialogue' ? dlgIn : bus === 'ui' ? uiIn : sfxIn;
    },
    get space() { return space; },
    // Wet-send multiplier of the current space, so an alley is more reverberant than a roof.
    get spaceSend() { return SPACES[space]?.send ?? 1; },
    setVolumes(v = {}, time = 0.25) {
      const now = ctx.currentTime;
      const c = (x) => Math.min(1, Math.max(0, Number(x) || 0));
      for (const k of Object.keys(busGain)) if (v[k] !== undefined) ramp(busGain[k].gain, c(v[k]), now, time);
      if (v.sfx !== undefined) ramp(wetVol.gain, c(v.sfx), now, time);
    },
    setSpace(name, fade = 0.8) {
      if (!SPACES[name] || name === space) return;
      space = name;
      if (algo) { algo.setSpace(name, fade); return; }
      const now = ctx.currentTime;
      for (const s of slots) ramp(s.g.gain, 0, now, fade);
      // drop slots that have already faded out, keep at most the one fading now
      slots = slots.filter((s, i) => {
        if (i < slots.length - 1) { try { wetIn.disconnect(s.conv); } catch { /* already gone */ } s.g.disconnect(); return false; }
        return true;
      });
      const conv = ctx.createConvolver();
      conv.buffer = spaceImpulse(ctx, name);
      const g = gain(0, wetVol);
      conv.connect(g);
      wetIn.connect(conv);
      ramp(g.gain, 1, now, fade);
      slots.push({ conv, g, name });
    },
    // kind: a DUCK_RULES key ('dialogue', 'radio', 'bigHit', 'stinger'); seconds it lasts.
    duck(kind, seconds, now = ctx.currentTime) {
      const rule = DUCK_RULES[kind];
      if (!rule) return;
      for (const [bus, depth] of Object.entries(rule)) {
        if (!ducks[bus]) continue;
        ducks[bus].push({ depth, until: now + Math.max(0.05, seconds) });
        applyDucks(bus, now);
      }
    },
    setNightMode: setDynamics,
    setMono,
  };
}
