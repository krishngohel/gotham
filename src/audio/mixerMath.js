// Pure mixer maths: bus levels, ducking, night mode and the low-spec audio tier. The Web Audio
// graph in mixer.js only applies what these return, so every rule here is unit-tested.

export const BUSES = ['music', 'sfx', 'ambience', 'dialogue', 'ui'];

const c01 = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : d);

// settings.volume { master, music, sfx } (the original save shape) plus the extra buses from
// prefs.js. Missing or broken values fall back to defaults, never to NaN.
export function busLevels(volume = {}, prefs = {}) {
  const v = volume && typeof volume === 'object' ? volume : {};
  const p = prefs && typeof prefs === 'object' ? prefs : {};
  return {
    master: c01(v.master, 0.9),
    music: c01(v.music, 0.7),
    sfx: c01(v.sfx, 0.9),
    ambience: c01(p.ambience, 0.8),
    dialogue: c01(p.dialogue, 1),
    ui: c01(p.ui, 0.7),
  };
}

// Several things can duck a bus at once (a line of dialogue, a KO, a stinger). The deepest one
// wins; they do not multiply, or two overlapping ducks would bury the music.
export function duckLevel(ducks, now) {
  let g = 1;
  if (!ducks) return g;
  for (const d of ducks) if (d && d.until > now && d.depth < g) g = d.depth;
  return Math.max(0, g);
}

// How far each kind of moment ducks each bus (gain multiplier while active).
export const DUCK_RULES = Object.freeze({
  dialogue: { music: 0.45, ambience: 0.7, sfx: 0.85 },
  radio: { music: 0.6, ambience: 0.8 },
  bigHit: { music: 0.55, ambience: 0.8 },
  stinger: { music: 0.5 },
});

// Compressor settings for the master glue stage. Night mode squashes the range hard and adds
// makeup gain so quiet things (footsteps, dialogue) come up while hits come down.
export function dynamicsSettings(nightMode) {
  return nightMode
    ? { threshold: -32, knee: 12, ratio: 8, attack: 0.004, release: 0.25, makeup: 2.2 }
    : { threshold: -14, knee: 8, ratio: 2.5, attack: 0.006, release: 0.2, makeup: 1.15 };
}

// Final brick-wall limiter before the speakers: catches the sum of many layered hits.
export const LIMITER = Object.freeze({ threshold: -2.5, knee: 0, ratio: 20, attack: 0.001, release: 0.12 });

// The audio half of the quality tier. Reads the flags workstream A is adding
// (quality.audio.voices, .convolution, .hrtf, .ambienceLayers) and falls back on the tier name
// for the presets that exist today. prefs.lowSpec 'on'/'off' overrides 'auto'.
export function audioTier(quality, prefs = {}) {
  const q = quality && typeof quality === 'object' ? quality : {};
  const a = q.audio && typeof q.audio === 'object' ? q.audio : {};
  const name = typeof q.name === 'string' ? q.name : 'high';
  const lowByName = name === 'potato' || name === 'low';
  const low = prefs.lowSpec === 'on' ? true : prefs.lowSpec === 'off' ? false : lowByName;
  const topByName = name === 'ultra';
  const tier = {
    lowSpec: low,
    voices: low ? 14 : 28,
    musicVoices: low ? 40 : 72,
    convolution: !low,
    hrtf: topByName,
    ambienceLayers: low ? 4 : 10,
    samples: name !== 'potato',
  };
  // Explicit flags from the quality object win over the name, unless the player forced lowSpec.
  if (prefs.lowSpec !== 'on') {
    if (Number.isFinite(a.voices)) tier.voices = Math.max(6, Math.min(64, a.voices | 0));
    if (typeof a.convolution === 'boolean') tier.convolution = a.convolution;
    if (typeof a.hrtf === 'boolean') tier.hrtf = a.hrtf;
    if (Number.isFinite(a.ambienceLayers)) tier.ambienceLayers = Math.max(1, a.ambienceLayers | 0);
    if (typeof a.samples === 'boolean') tier.samples = a.samples;
  } else {
    tier.voices = Math.min(tier.voices, 14);
    tier.convolution = false;
    tier.hrtf = false;
  }
  return tier;
}
