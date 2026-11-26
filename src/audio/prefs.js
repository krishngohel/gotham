// Audio preferences that the original settings object (gotham-settings-v1, src/core/settings.js)
// does not know about: the extra buses and the mix options. They live under their own storage
// key so the old `volume { master, music, sfx }` keeps loading untouched and settings.js (owned by
// the render workstream) never has to change for audio.
//
// One module-level store shared by the menus (writers) and the audio engine (subscriber), so a
// slider in Settings > Audio reaches the live mix without game.js wiring anything new.

export const AUDIO_PREFS_KEY = 'gotham-audio-v1';

export const DEFAULT_AUDIO_PREFS = Object.freeze({
  // Bus volumes on top of master/music/sfx (which stay in settings.volume).
  ambience: 0.8,
  dialogue: 1,
  ui: 0.7,
  // Squashes the dynamic range: quiet sounds up, big hits down. For late-night / low-volume play.
  nightMode: false,
  // Sums the whole mix to mono (one-sided hearing, a single speaker).
  mono: false,
  // 'auto' follows the quality tier; 'on' forces fewer voices and no convolution reverb.
  lowSpec: 'auto',
  // Spoken-line captions (the subtitle hook fires either way; this is for the UI to read).
  subtitles: true,
});

const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

export function sanitizeAudioPrefs(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_AUDIO_PREFS;
  return {
    ambience: num(r.ambience, d.ambience),
    dialogue: num(r.dialogue, d.dialogue),
    ui: num(r.ui, d.ui),
    nightMode: bool(r.nightMode, d.nightMode),
    mono: bool(r.mono, d.mono),
    lowSpec: ['auto', 'on', 'off'].includes(r.lowSpec) ? r.lowSpec : d.lowSpec,
    subtitles: bool(r.subtitles, d.subtitles),
  };
}

const defaultStorage = () => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

let current = null;
const listeners = new Set();

export function loadAudioPrefs(storage = defaultStorage()) {
  try {
    const raw = storage?.getItem(AUDIO_PREFS_KEY);
    return sanitizeAudioPrefs(raw ? JSON.parse(raw) : {});
  } catch {
    return sanitizeAudioPrefs({});
  }
}

export function getAudioPrefs() {
  if (!current) current = loadAudioPrefs();
  return current;
}

// Merges a patch, saves it and tells every subscriber. Never throws.
export function setAudioPrefs(patch = {}, storage = defaultStorage()) {
  current = sanitizeAudioPrefs({ ...getAudioPrefs(), ...patch });
  try { storage?.setItem(AUDIO_PREFS_KEY, JSON.stringify(current)); } catch { /* private window */ }
  for (const fn of listeners) { try { fn(current); } catch { /* a bad listener never blocks the others */ } }
  return current;
}

export function onAudioPrefs(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Test hook: forget the cached copy so the next get() reads storage again.
export function resetAudioPrefsCache() { current = null; }
