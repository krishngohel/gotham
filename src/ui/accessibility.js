// [prog] Accessibility and options (wave 3, workstream L1 item 6).
//
// One place that turns settings.access (src/core/settings.js) into what the systems read:
//   accessibilityVars(settings)   pure: the CSS variables and body classes (text size, subtitle
//                                 size and plate, reduced motion, flash reduction, glyph patterns)
//   applyAccessibility(settings, { input, players })  applies them to the page and to every local
//                                 player's input (pad layout, hold/toggle modes, pad look tuning)
//   getAccess()                   the live access block for modules that read it per frame
//                                 (comic effects, the impact panel); never null
//   TELLS / tellKind / tellSvg    the attack telegraph glyphs: every tell differs by shape and fill
//                                 pattern, not only by colour
//   shakeScale, flashScale, lightningFlash, impactModeFor, aimConeScale, qteWindowScale: the
//                                 numbers the shake, flash, aim and timing code multiplies by
// The settings menu pieces (Accessibility tab, pad rebinding, per-player pad look) are at the end.
import { padLayout, PAD_PRESET_DEFS, PAD_REBINDABLE, padButtonName, rebindPad, resolvePadButtons } from '../core/input.js';
import { buildBrightnessControl } from './brightnessControl.js'; // [light]
import { ACTIONS } from '../core/bindings.js';
import { DEFAULT_SETTINGS, SUBTITLE_SIZES } from '../core/settings.js';

// ---------------------------------------------------------------- numbers

// Subtitle text size in CSS px at text scale 1.
export const SUBTITLE_PX = { small: 18, medium: 24, large: 32, huge: 42 };

// Camera shake multiplier: off entirely with cameraShake false, else the access slider.
export function shakeScale(settings) {
  if (!settings || settings.cameraShake === false) return 0;
  const k = settings.access?.shake;
  return typeof k === 'number' && Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 1;
}

// Multiplier on full-screen flashes (impact-frame beats, lightning, the red damage vignette).
export const FLASH_REDUCED = 0.35;
export const flashScale = (settings) => (settings?.access?.flashReduce ? FLASH_REDUCED : 1);

// [verify] Whether an alternating / strobing colour effect may run (the wanted siren's red-blue
// screen edge, the photo-mode shutter): never under flash reduction or reduced motion.
export const allowStrobe = (access = live) => !access?.flashReduce && !access?.reducedMotion;

// [verify] The strength of a full-view colour distortion (src/story/viewFx.js: fear, cold, spores,
// heat): halved under flash reduction, and reduced motion drops the swimming blur.
export function distortOptions(access = live) {
  return { k: access?.flashReduce ? 0.5 : 1, blur: !access?.reducedMotion };
}

// Impact-frame mode with flash reduction: Full becomes Soft (no flashing beats in tier 2).
export function impactModeFor(settings) {
  const m = settings?.impactFrames ?? 'full';
  return settings?.access?.flashReduce && m === 'full' ? 'soft' : m;
}

// The lightning flash level for `t` seconds left of a 0.26 s strike (src/game/game.js lightning()).
// Normal: two hard white strobes. Reduced: one soft swell, no strobe.
export function lightningFlash(t, reduce = false) {
  if (!(t > 0)) return 0;
  if (!reduce) return (t > 0.2 && t <= 0.26) || (t > 0.06 && t <= 0.1) ? 1 : 0;
  const x = Math.min(1, Math.max(0, (0.26 - t) / 0.26));
  return 0.3 * Math.sin(Math.PI * x);
}

// Aim assist strength 0..1 -> multiplier on a gadget's aim cone. 0.5 (the default) is today's cone.
export function aimConeScale(k = 0.5) {
  const a = typeof k === 'number' && Number.isFinite(k) ? Math.min(1, Math.max(0, k)) : 0.5;
  return a <= 0.5 ? 0.6 + 0.8 * a : 1 + (a - 0.5);
}

// QTE / timing-window help: how much longer a window stays open, and whether it completes itself.
export function qteWindowScale(mode) { return mode === 'slow' ? 1.6 : mode === 'auto' ? Infinity : 1; }
export const qteAuto = (mode) => mode === 'auto';

// ---------------------------------------------------------------- CSS

// Pure: the page's variables and body classes for these settings.
export function accessibilityVars(settings) {
  const a = { ...DEFAULT_SETTINGS.access, ...(settings?.access ?? {}) };
  const text = Math.min(1.5, Math.max(0.85, Number(a.textSize) || 1));
  const size = SUBTITLE_SIZES.includes(a.subtitleSize) ? a.subtitleSize : 'medium';
  const bg = Math.min(1, Math.max(0, Number.isFinite(a.subtitleBg) ? a.subtitleBg : 0.6));
  return {
    vars: {
      '--a11y-text': String(+text.toFixed(3)),
      '--sub-size': `${Math.round(SUBTITLE_PX[size] * text)}px`,
      '--sub-bg': String(+bg.toFixed(2)),
      '--a11y-flash': String(flashScale(settings)),
    },
    classes: {
      'a11y-reduced-motion': !!a.reducedMotion,
      'a11y-flash-reduce': !!a.flashReduce,
      'a11y-glyph-patterns': !!a.glyphPatterns,
      'a11y-sub-names': a.subtitleSpeakers !== false,
    },
  };
}

// The live access block (defaults until applyAccessibility runs).
let live = { ...DEFAULT_SETTINGS.access };
export const getAccess = () => live;
let liveAimScale = 1;
// The aim cone multiplier for src/gadgets/aim.js (1 = today).
export const getAimConeScale = () => liveAimScale;

const PATTERN_DEFS = `<svg class="a11y-defs" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0"><defs>
<pattern id="a11y-stripes" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3.2" height="7" fill="#0b0b12"/></pattern>
<pattern id="a11y-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.6" fill="#0b0b12"/></pattern>
<pattern id="a11y-checks" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#0b0b12"/><rect x="4" y="4" width="4" height="4" fill="#0b0b12"/></pattern>
</defs></svg>`;

// Applies the CSS side to the page and the input side to every local player. Safe to call often.
export function applyAccessibility(settings, { input = null, players = null, doc = globalThis.document } = {}) {
  live = { ...DEFAULT_SETTINGS.access, ...(settings?.access ?? {}) };
  liveAimScale = aimConeScale(live.aimAssist);
  if (doc?.documentElement) {
    const { vars, classes } = accessibilityVars(settings);
    for (const [k, v] of Object.entries(vars)) doc.documentElement.style.setProperty(k, v);
    for (const [k, on] of Object.entries(classes)) doc.body?.classList.toggle(k, on);
    if (doc.body && !doc.querySelector('.a11y-defs')) doc.body.insertAdjacentHTML('beforeend', PATTERN_DEFS);
  }
  applyPlayerInputs(settings, { input, players });
}

// Each local player's pad layout (settings.pads[slot]), hold/toggle modes and pad look tuning.
export function applyPlayerInputs(settings, { input = null, players = null } = {}) {
  const list = players && players.length ? players : input ? [{ slot: 0, input, hero: null }] : [];
  for (const p of list) {
    const inp = p.input;
    if (!inp || typeof inp.setPadLayout !== 'function') continue; // a bot or a remote player
    const slot = Math.min(1, Math.max(0, p.slot ?? 0));
    const pad = settings?.pads?.[slot] ?? DEFAULT_SETTINGS.pads[slot];
    inp.setPadLayout(padLayout(pad.preset, pad.map));
    inp.setHoldModes(settings?.access ?? {}, { airborne: () => !!p.hero && p.hero.grounded === false });
    inp.setLookTuning({ base: { sensitivity: settings?.sensitivity ?? 1, invertY: !!settings?.invertY }, pad });
  }
}

// ---------------------------------------------------------------- telegraph glyphs

// Every tell has its own silhouette, fill pattern and inner mark; colour is a third cue, never the
// only one. viewBox 0 0 38 54 (the HUD glyph box).
const BOLT = 'M22 2 L6 30 L17 30 L12 52 L32 20 L20 20 L26 2 Z';
const SPIKED = 'M19 1 L24 12 L31 8 L29 19 L37 27 L29 33 L33 46 L23 42 L19 53 L15 42 L5 46 L9 33 L1 27 L9 19 L7 8 L14 12 Z';
const CROSSHAIR = 'M19 15 A12 12 0 1 1 18.99 15 Z M19 20 A7 7 0 1 0 19.01 20 Z M17 3 H21 V13 H17 Z M17 41 H21 V51 H17 Z M0 25 H5 V29 H0 Z M33 25 H38 V29 H33 Z';
const STAR = 'M19 2 L24 20 L37 27 L24 34 L19 52 L14 34 L1 27 L14 20 Z';
export const TELLS = {
  // Blue: counter it (block tap).
  counter: { id: 'counter', shape: 'bolt', pattern: 'solid', path: BOLT, mark: '', label: 'Counter (bolt)' },
  // Red melee: can't be countered, dodge it.
  unblockable: { id: 'unblockable', shape: 'spiked', pattern: 'stripes', path: SPIKED, mark: 'M17 15 H21 L20.4 32 H17.6 Z M17 36 H21 V40 H17 Z', label: 'Dodge (spiked, striped)' },
  // Red ranged: a gun is aiming; break line of sight.
  ranged: { id: 'ranged', shape: 'crosshair', pattern: 'dots', path: CROSSHAIR, mark: 'M19 24.5 A2.5 2.5 0 1 0 19.01 24.5 Z', label: 'Gun aiming (crosshair, dotted)' },
  // Yellow: a boss throw to answer with a gadget.
  special: { id: 'special', shape: 'star', pattern: 'checks', path: STAR, mark: '', label: 'Gadget it (star, checked)' },
};
// The stealth awareness ring states (src/ui/stealthHud.js), told apart by ring style and mark.
export const STEALTH_TELLS = {
  noticing: { id: 'noticing', shape: 'ring', pattern: 'solid', mark: '?' },
  searching: { id: 'searching', shape: 'ring-dashed', pattern: 'dashes', mark: '?' },
  hostile: { id: 'hostile', shape: 'burst', pattern: 'spikes', mark: '!' },
};

// Which tell a glyph colour means ('blue' counter, 'red' dodge, 'yellow' boss throw), given
// whether the goon is ranged.
export function tellKind(color, ranged = false) {
  if (color === 'red') return ranged ? 'ranged' : 'unblockable';
  if (color === 'yellow') return 'special';
  return 'counter';
}

let tellResolver = null;
// fn(id) -> the enemy with that id (or null): lets the HUD tell a gun's aim from a melee swing.
export function setTellResolver(fn) { tellResolver = typeof fn === 'function' ? fn : null; }
export function glyphTell(color, id) {
  let ranged = false;
  try { const e = tellResolver?.(id); ranged = !!(e?.def?.ranged ?? e?.ranged); } catch { /* the HUD never breaks */ }
  return TELLS[tellKind(color, ranged)];
}

const PATTERN_URL = { stripes: 'a11y-stripes', dots: 'a11y-dots', checks: 'a11y-checks' };
// The SVG markup for a tell (the HUD glyph's innerHTML).
export function tellSvg(tell) {
  const t = typeof tell === 'string' ? TELLS[tell] ?? TELLS.counter : tell;
  const pat = PATTERN_URL[t.pattern];
  return `<svg viewBox="0 0 38 54"><path class="shape" fill-rule="evenodd" d="${t.path}"/>${pat ? `<path class="pat" fill-rule="evenodd" d="${t.path}" style="fill:url(#${pat})"/>` : ''}${t.mark ? `<path class="mark" d="${t.mark}"/>` : ''}</svg>`;
}

// ---------------------------------------------------------------- settings menu pieces

// helpers: the menu's own { slider, toggle, choice, button, el, rerender(tab) }.
export function buildAccessibilityTab(body, settings, h) {
  const a = settings.access;
  const pct = (v) => `${Math.round(v * 100)}%`;
  body.appendChild(h.el('h3', '', 'Text and subtitles'));
  body.appendChild(h.slider('Text size', a.textSize, 0.85, 1.5, 0.05, (v) => { a.textSize = v; }, pct));
  body.appendChild(h.choice('Subtitle size', a.subtitleSize, SUBTITLE_SIZES.map((s) => [s, s[0].toUpperCase() + s.slice(1)]), (v) => { a.subtitleSize = v; }));
  body.appendChild(h.slider('Subtitle background', a.subtitleBg, 0, 1, 0.05, (v) => { a.subtitleBg = v; }, pct));
  body.appendChild(h.toggle('Speaker names in subtitles', a.subtitleSpeakers, (v) => { a.subtitleSpeakers = v; }));
  if (h.subtitlesToggle) body.appendChild(h.subtitlesToggle());
  body.appendChild(h.el('h3', '', 'Controls'));
  const hm = [['hold', 'Hold'], ['toggle', 'Toggle']];
  body.appendChild(h.choice('Sprint', a.sprint, hm, (v) => { a.sprint = v; }));
  body.appendChild(h.choice('Block', a.block, hm, (v) => { a.block = v; }));
  body.appendChild(h.choice('Crouch', a.crouch, hm, (v) => { a.crouch = v; }));
  body.appendChild(h.choice('Glide', a.glide, hm, (v) => { a.glide = v; }));
  body.appendChild(h.el('p', 'note', 'Toggle: press once to start, again to stop. Toggle glide: jump, then press jump again in the air. Hold crouch is for the keyboard; the pad keeps its tap.'));
  body.appendChild(h.slider('Aim assist', a.aimAssist, 0, 1, 0.05, (v) => { a.aimAssist = v; }, pct));
  body.appendChild(h.choice('Timing help', a.qteAssist, [['off', 'Off'], ['slow', 'More time'], ['auto', 'Automatic']], (v) => { a.qteAssist = v; }));
  body.appendChild(h.el('h3', '', 'Screen'));
  buildBrightnessControl(body, settings, h); // [light] the same Brightness as the Video tab
  body.appendChild(h.slider('Camera shake strength', a.shake, 0, 1, 0.05, (v) => { a.shake = v; }, pct));
  body.appendChild(h.toggle('Reduce flashing', a.flashReduce, (v) => { a.flashReduce = v; }));
  body.appendChild(h.toggle('Reduce motion (comic pops, speed lines, zooms, wobble)', a.reducedMotion, (v) => { a.reducedMotion = v; }));
  body.appendChild(h.toggle('Patterned attack signs', a.glyphPatterns, (v) => { a.glyphPatterns = v; }));
  // [onboard] Tutorials and the compact HUD (src/abilities, src/ui/hudDirector.js).
  body.appendChild(h.el('h3', '', 'Tutorials and HUD'));
  body.appendChild(h.choice('Tutorials', a.tutorials, [['full', 'Teach each new ability'], ['skip', 'Skip (unlock as the story goes)']], (v) => { a.tutorials = v; }));
  body.appendChild(h.toggle('Compact HUD (cards become small notes)', a.compactHud, (v) => { a.compactHud = v; for (const hud of globalThis.window?.__game?.hud?.all?.() ?? []) hud.setCompact?.(v); }));
  const legend = h.el('div', 'a11y-legend');
  for (const t of Object.values(TELLS)) {
    const item = h.el('span', `a11y-tell glyph-sample ${t.id}`);
    item.innerHTML = `<span class="glyph-demo" data-tell="${t.id}">${tellSvg(t)}</span>`;
    item.appendChild(h.el('span', '', t.label));
    legend.appendChild(item);
  }
  body.appendChild(legend);
}

// Pad look per player (Camera tab).
export function buildPadLook(body, settings, h) {
  for (let i = 0; i < settings.pads.length; i++) {
    const p = settings.pads[i];
    body.appendChild(h.el('h3', '', `Player ${i + 1} gamepad`));
    body.appendChild(h.slider(`Pad ${i + 1} look sensitivity`, p.sensitivity, 0.2, 3, 0.05, (v) => { p.sensitivity = v; }, (v) => v.toFixed(2)));
    body.appendChild(h.toggle(`Pad ${i + 1} invert Y`, p.invertY, (v) => { p.invertY = v; }));
    body.appendChild(h.toggle(`Pad ${i + 1} invert X`, p.invertX, (v) => { p.invertX = v; }));
  }
}

const actionLabel = (id) => (id === 'cape' ? 'Cape stun (tap) / gadget wheel (hold)' : id === 'crouch' ? 'Crouch (tap) / sprint (hold)' : ACTIONS.find((a) => a.id === id)?.label ?? id);

// Gamepad layout and rebinding (Controls tab), for the player picked with the Player buttons.
// h.rerender() reopens the Controls tab; the picked player is remembered here.
let padSlot = 0;
export function buildPadBindings(body, settings, h, { getGamepads = () => globalThis.navigator?.getGamepads?.() ?? [] } = {}) {
  const slot = Math.min(settings.pads.length - 1, Math.max(0, padSlot));
  const pad = settings.pads[slot];
  body.appendChild(h.el('h3', 'pad-head', 'Gamepad'));
  const who = h.el('div', 'set-row');
  who.appendChild(h.el('span', '', 'Player'));
  const group = h.el('div', 'choices');
  settings.pads.forEach((_, i) => group.appendChild(h.button(`Player ${i + 1}`, () => { padSlot = i; h.rerender(); }, `small pad-player ${i === slot ? 'on' : ''}`)));
  who.appendChild(group);
  body.appendChild(who);
  body.appendChild(h.choice('Layout', pad.preset, Object.entries(PAD_PRESET_DEFS).map(([id, d]) => [id, d.label]), (v) => { pad.preset = v; pad.map = {}; }));
  const buttons = resolvePadButtons(pad.preset, pad.map);
  const list = h.el('div', 'binds pad-binds');
  for (const id of PAD_REBINDABLE) {
    const row = h.el('div', 'set-row');
    row.appendChild(h.el('span', '', actionLabel(id)));
    const b = h.button(padButtonName(buttons[id]?.[0]), () => {
      if (capture.active || performance.now() < capture.coolUntil) return;
      b.textContent = 'Press a pad button...';
      b.classList.add('listening');
      capturePadButton(getGamepads, (idx) => {
        b.classList.remove('listening');
        if (idx !== null) { pad.map = rebindPad(pad.map, id, idx); h.save(); }
        h.rerender();
      });
    }, 'small rebind pad-rebind');
    b.dataset.action = id;
    row.appendChild(b);
    list.appendChild(row);
  }
  body.appendChild(list);
  body.appendChild(h.button('Reset gamepad', () => { pad.preset = 'standard'; pad.map = {}; h.save(); h.rerender(); }, 'small pad-reset'));
}

// Waits for a pad button that goes down after the capture starts (buttons already held are
// ignored until let go). Esc or 8 s cancels (cb(null)). One capture at a time.
const capture = { active: false, coolUntil: 0 };
export function capturePadButton(getGamepads, cb, { timeout = 8000, raf = (f) => globalThis.requestAnimationFrame(f) } = {}) {
  if (capture.active) return;
  capture.active = true;
  const held = new Set();
  const read = () => {
    const out = [];
    for (const p of getGamepads() ?? []) if (p && p.connected !== false) p.buttons.forEach((b, i) => { if (b?.pressed) out.push(i); });
    return out;
  };
  for (const i of read()) held.add(i);
  const t0 = performance.now();
  const onKey = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(null); } };
  globalThis.addEventListener?.('keydown', onKey, true);
  let done = false;
  function finish(v) {
    if (done) return;
    done = true;
    capture.active = false;
    capture.coolUntil = performance.now() + 350;
    globalThis.removeEventListener?.('keydown', onKey, true);
    cb(v);
  }
  const poll = () => {
    if (done) return;
    const now = read();
    for (const i of [...held]) if (!now.includes(i)) held.delete(i);
    const fresh = now.find((i) => !held.has(i));
    if (fresh !== undefined) return finish(fresh);
    if (performance.now() - t0 > timeout) return finish(null);
    raf(poll);
  };
  raf(poll);
}
export const _padCaptureState = capture;
