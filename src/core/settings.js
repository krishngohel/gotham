import { ACTIONS, DEFAULT_BINDINGS } from './bindings.js';
import { DEFAULT_MAP_SETTINGS, sanitizeMapSettings } from '../nav/mapSettings.js'; // [map]

const KEY = 'gotham-settings-v1';

// Bumped when a default changes in a way that older saves should pick up once (see sanitizeSettings).
export const SETTINGS_REV = 3;

export const DEFAULT_SETTINGS = {
  rev: SETTINGS_REV,
  bindings: DEFAULT_BINDINGS,
  sensitivity: 1,
  invertY: false,
  fov: 60,
  cameraShake: true,
  actionCam: true,
  lineWobble: true,
  impactFrames: 'full',
  // 'auto' (first boot picks a tier: render/tierDetect.js) or a tier id from render/quality.js.
  quality: 'auto',
  renderScale: 1,
  dynamicRes: true,
  halftone: 1,
  showFps: true,
  fpsDetails: false,
  // [env] Ink lighting (AO, contact shadows, wet-street reflections): 'auto' follows the tier
  // (on for Ultra), 'on' adds it on Medium and High, 'off' drops it. Applies on reload.
  inkLight: 'auto',
  // [env] Time of day: 'cycle' (the day/night cycle) or 'night' (always night, as before).
  timeOfDay: 'cycle',
  // [wanted] Police attention: 'on' or 'off' (story-scripted wanted moments still play), and how fast
  // it rises and how long the searches last (src/wanted/rules.js DIFFICULTY).
  police: 'on',
  policeHeat: 'standard',
  volume: { master: 0.8, music: 0.6, sfx: 0.9 },
  difficulty: 'normal',
  hints: true,
  autoLedge: true,
  map: DEFAULT_MAP_SETTINGS, // [map] minimap and GPS options (src/nav/mapSettings.js)
  // [prog] Wave 3 (workstream L1): accessibility, per-player pads and suit perks. Settings stay
  // global (one per browser, never per save slot). Every field has a safe default, so an old
  // settings save loads unchanged (tests/unit/settingsAccess.test.js).
  access: {
    // Subtitles (on/off lives in src/audio/prefs.js 'subtitles'): text size, backing plate
    // opacity, and whether the speaker's name leads the line.
    subtitleSize: 'medium', subtitleBg: 0.6, subtitleSpeakers: true,
    // Hold or toggle for the held actions.
    sprint: 'hold', block: 'hold', crouch: 'toggle', glide: 'hold',
    // 0..1 multiplier on camera shake (cameraShake=false still means none at all).
    shake: 1,
    // Flash reduction: impact-frame flashes, lightning and gadget flashes are dimmed and slowed.
    flashReduce: false,
    // Interface text scale.
    textSize: 1,
    // Comic effects (panel pops, speed lines, wobble, screen zooms) calm down.
    reducedMotion: false,
    // 0 (off) .. 1 (strong): how much gadget aim and strike targeting help.
    aimAssist: 0.5,
    // QTE and minigame help: 'off', 'slow' (more time), 'auto' (completes on its own).
    qteAssist: 'off',
    // Telegraph glyphs: always distinct by shape; 'patterns' also fills them with stripes/dots.
    glyphPatterns: true,
    // [onboard] Tutorials: 'full' (the story teaches each new ability with a short hands-on beat)
    // or 'skip' (abilities still arrive as the story goes, without the lines and cards).
    tutorials: 'full',
    // [onboard] Compact HUD: centre cards come as small chips under the objective instead.
    compactHud: false,
  },
  // Per local player (index = player slot): pad layout preset and overrides, look sensitivity and
  // inversion. Player 1's keyboard/mouse sensitivity is still the top-level `sensitivity`.
  pads: [
    { preset: 'standard', map: {}, sensitivity: 1, invertY: false, invertX: false },
    { preset: 'standard', map: {}, sensitivity: 1, invertY: false, invertX: false },
  ],
  // Optional light suit perks (src/progress/suitData.js). Off: every suit is cosmetic.
  suitPerks: false,
};

export const SUBTITLE_SIZES = ['small', 'medium', 'large', 'huge'];
export const PAD_PRESETS = ['standard', 'southpaw', 'legacy', 'oneHanded'];
const HOLD_MODES = ['hold', 'toggle'];
const PAD_BUTTON_MAX = 17;

function sanitizePad(raw, d) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const map = {};
  if (r.map && typeof r.map === 'object' && !Array.isArray(r.map)) {
    for (const [a, i] of Object.entries(r.map).slice(0, 64)) {
      if (ACTIONS.some((x) => x.id === a) && Number.isInteger(i) && i >= 0 && i < PAD_BUTTON_MAX) map[a] = i;
    }
  }
  return {
    preset: oneOf(r.preset, PAD_PRESETS, d.preset),
    map,
    sensitivity: num(r.sensitivity, 0.2, 3, d.sensitivity),
    invertY: bool(r.invertY, d.invertY),
    invertX: bool(r.invertX, d.invertX),
  };
}

export function sanitizeAccess(raw) {
  const d = DEFAULT_SETTINGS.access;
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    subtitleSize: oneOf(r.subtitleSize, SUBTITLE_SIZES, d.subtitleSize),
    subtitleBg: num(r.subtitleBg, 0, 1, d.subtitleBg),
    subtitleSpeakers: bool(r.subtitleSpeakers, d.subtitleSpeakers),
    sprint: oneOf(r.sprint, HOLD_MODES, d.sprint),
    block: oneOf(r.block, HOLD_MODES, d.block),
    crouch: oneOf(r.crouch, HOLD_MODES, d.crouch),
    glide: oneOf(r.glide, HOLD_MODES, d.glide),
    shake: num(r.shake, 0, 1, d.shake),
    flashReduce: bool(r.flashReduce, d.flashReduce),
    textSize: num(r.textSize, 0.85, 1.5, d.textSize),
    reducedMotion: bool(r.reducedMotion, d.reducedMotion),
    aimAssist: num(r.aimAssist, 0, 1, d.aimAssist),
    qteAssist: oneOf(r.qteAssist, ['off', 'slow', 'auto'], d.qteAssist),
    glyphPatterns: bool(r.glyphPatterns, d.glyphPatterns),
    tutorials: oneOf(r.tutorials, ['full', 'skip'], d.tutorials), // [onboard]
    compactHud: bool(r.compactHud, d.compactHud), // [onboard]
  };
}

const num = (v, min, max, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);

function sanitizeBindings(raw) {
  const out = {};
  for (const { id } of ACTIONS) {
    const codes = raw?.[id];
    out[id] = Array.isArray(codes) && codes.length && codes.every((c) => typeof c === 'string') ? [...codes] : [...DEFAULT_BINDINGS[id]];
  }
  // One code, one action. The action that owns the code by default wins; others fall back
  // to their own defaults where those are free.
  const owner = new Map();
  for (const { id } of ACTIONS) for (const c of out[id]) {
    const prev = owner.get(c);
    if (!prev || DEFAULT_BINDINGS[id].includes(c)) owner.set(c, id);
  }
  for (const { id } of ACTIONS) {
    out[id] = out[id].filter((c) => owner.get(c) === id);
    if (!out[id].length) {
      const free = DEFAULT_BINDINGS[id].filter((c) => !owner.has(c) || owner.get(c) === id);
      for (const c of free) owner.set(c, id);
      out[id] = free;
    }
  }
  return out;
}

export function sanitizeSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  const r = raw && typeof raw === 'object' ? raw : {};
  const v = r.volume && typeof r.volume === 'object' ? r.volume : {};
  // Rev 2 turned the FPS counter on by default. A save from before that takes the new default
  // once; the player's later choice is saved with the current rev and respected from then on.
  const fpsMigrated = num(r.rev, 0, SETTINGS_REV, 0) >= 2;
  return {
    rev: SETTINGS_REV,
    bindings: sanitizeBindings(r.bindings),
    sensitivity: num(r.sensitivity, 0.2, 3, d.sensitivity),
    invertY: bool(r.invertY, d.invertY),
    fov: num(r.fov, 50, 90, d.fov),
    cameraShake: bool(r.cameraShake, d.cameraShake),
    actionCam: bool(r.actionCam, d.actionCam),
    lineWobble: bool(r.lineWobble, d.lineWobble),
    // Rev 3: the old on/off became Full, Soft or Off. A saved true is Full, false is Off.
    impactFrames: r.impactFrames === true ? 'full' : r.impactFrames === false ? 'off' : oneOf(r.impactFrames, ['full', 'soft', 'off'], d.impactFrames),
    // Saves from before the tiers hold 'high' or 'low', which are still tiers.
    quality: oneOf(r.quality, ['auto', 'potato', 'low', 'medium', 'high', 'ultra'], d.quality),
    renderScale: num(r.renderScale, 0.5, 1, d.renderScale),
    dynamicRes: bool(r.dynamicRes, d.dynamicRes),
    halftone: num(r.halftone, 0, 1.5, d.halftone),
    showFps: fpsMigrated ? bool(r.showFps, d.showFps) : d.showFps,
    fpsDetails: bool(r.fpsDetails, d.fpsDetails),
    inkLight: oneOf(r.inkLight, ['auto', 'on', 'off'], d.inkLight), // [env]
    timeOfDay: oneOf(r.timeOfDay, ['cycle', 'night'], d.timeOfDay), // [env]
    police: oneOf(r.police, ['on', 'off'], d.police), // [wanted]
    policeHeat: oneOf(r.policeHeat, ['relaxed', 'standard', 'relentless'], d.policeHeat), // [wanted]
    volume: {
      master: num(v.master, 0, 1, d.volume.master),
      music: num(v.music, 0, 1, d.volume.music),
      sfx: num(v.sfx, 0, 1, d.volume.sfx),
    },
    // [prog] Knightmare (src/combat/rules.js) is surfaced in wave 3.
    difficulty: oneOf(r.difficulty, ['story', 'normal', 'hard', 'knightmare'], d.difficulty),
    hints: bool(r.hints, d.hints),
    autoLedge: bool(r.autoLedge, d.autoLedge),
    map: sanitizeMapSettings(r.map), // [map]
    access: sanitizeAccess(r.access),
    pads: d.pads.map((pd, i) => sanitizePad(Array.isArray(r.pads) ? r.pads[i] : null, pd)),
    suitPerks: bool(r.suitPerks, d.suitPerks),
  };
}

export function loadSettings(storage) {
  try {
    const raw = storage?.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : {});
  } catch {
    return sanitizeSettings({});
  }
}

export function saveSettings(storage, settings) {
  try { storage?.setItem(KEY, JSON.stringify(settings)); } catch { /* private window or blocked storage */ }
}
