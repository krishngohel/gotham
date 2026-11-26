// Action-based input over keyboard, mouse (pointer lock) and the Gamepad API.
// Keyboard and mouse follow the rebindable settings; the gamepad uses an Xbox layout preset with
// per-player overrides ([prog] a11y: padLayout, settings.pads[slot]; 'standard' is the old layout).
//
// Input is built from device *sources* (workstream B, Long Night 2), each with the same action
// API (down / pressed / released / move / look):
//   createKeyboardMouseSource  the one keyboard+mouse (browsers cannot tell two keyboards apart)
//   createGamepadSource        one pad, by Gamepad.index (or 'first': the first connected pad)
//   createScriptedInput        driven by code: tests, the ?p2=bot dev player
//   createRemoteInput          a networked player (src/net/**: held actions from the wire)
// createMergedInput joins sources into one player's input. createInput (player 0 alone) is the
// keyboard+mouse merged with the first connected pad, exactly as before the split.

// L3 (10) is not here: a tap toggles crouch and holding it sprints (createHoldTap).
export const PAD_BUTTONS = {
  jump: [0], kick: [1], punch: [2], block: [3], grapple: [4],
  // RB (5) is not here: a tap is the cape stun and a hold opens the gadget wheel (createHoldTap).
  dodge: [6], batarang: [7],
  detective: [8], pause: [9], special: [11], photo: [12], help: [13], throw: [15],
  // D-pad left (14) is the last free pad button: vehicle (summon, enter, exit the Batmobile or a
  // street car). It doubles as the chain1 chord button; the chord latch keeps it from firing
  // 'vehicle' while block (Y) is held. The Batwing has no default pad button (keyboard Y).
  vehicle: [14],
};

// Chain takedowns: D-pad left, up and right while block (Y) is held. With block held, D-pad
// right belongs to chain 3, not grab and throw. Y plus LB is the Bat Swarm (chain 4).
export const PAD_CHORD_HOLD = 3;
export const PAD_CHORDS = { chain1: 14, chain2: 12, chain3: 15, chain4: 4 };

// Hoisted once at module load: padActions runs every frame and must not allocate.
const PAD_BUTTON_ENTRIES = Object.entries(PAD_BUTTONS);
const PAD_CHORD_ENTRIES = Object.entries(PAD_CHORDS);
const CHORD_BUTTONS = PAD_CHORD_ENTRIES.map(([, i]) => i);
// D-pad chord buttons (12 to 15) stay latched: once a chord fires, the D-pad button stays
// suppressed for its plain action (e.g. throw) until it is physically released, even if block
// lets go first (players release the two buttons in either order). Chord buttons outside the
// D-pad, like LB (4) for chain4, are not latched: LB doubles as the grapple button and is held
// far longer than a quick D-pad tap, so grapple resumes the instant block lets go even if LB is
// still held; those buttons are only suppressed while block is actually down this frame.
const STICKY_CHORD_BUTTONS = CHORD_BUTTONS.filter((i) => i >= 12);
const IMMEDIATE_CHORD_BUTTONS = new Set(CHORD_BUTTONS.filter((i) => i < 12));

// Buttons a D-pad chord has consumed this "hold" (see STICKY_CHORD_BUTTONS above). Module-scoped
// so it survives across pollPad's per-frame calls; pass a private Set (or call
// resetPadChordLatch) to isolate tests.
const defaultChordLatch = new Set();
export function resetPadChordLatch(latch = defaultChordLatch) { latch.clear(); }

// [prog] a11y: a compiled pad layout (padLayout below). STANDARD_LAYOUT is today's fixed layout.
const STANDARD_COMPILED = {
  preset: 'standard', entries: PAD_BUTTON_ENTRIES, chordHold: PAD_CHORD_HOLD, chordEntries: PAD_CHORD_ENTRIES,
  sticky: STICKY_CHORD_BUTTONS, immediate: IMMEDIATE_CHORD_BUTTONS,
  wheel: 5, wheelTap: 'cape', wheelHold: 'gadgetWheel', l3: 10, l3Tap: 'crouch', l3Hold: 'sprint', swapSticks: false,
};

// Actions held on the pad this frame, from a button-state lookup. Allocates nothing beyond the
// returned Set (reuse `out` to avoid even that). `layout`: a padLayout() (default: the standard one).
export function padActions(isDown, out = new Set(), latch = defaultChordLatch, layout = STANDARD_COMPILED) {
  out.clear();
  const L = layout;
  const chord = L.chordHold >= 0 && isDown(L.chordHold);
  for (let n = 0; n < L.sticky.length; n++) {
    const i = L.sticky[n];
    if (!isDown(i)) latch.delete(i);
    else if (chord) latch.add(i);
  }
  for (let n = 0; n < L.entries.length; n++) {
    const action = L.entries[n][0];
    const idx = L.entries[n][1];
    let down = false;
    for (let j = 0; j < idx.length; j++) {
      const i = idx[j];
      if (isDown(i) && !latch.has(i) && !(chord && L.immediate.has(i))) { down = true; break; }
    }
    if (down) out.add(action);
  }
  for (let n = 0; n < L.chordEntries.length; n++) {
    const action = L.chordEntries[n][0];
    const i = L.chordEntries[n][1];
    if (chord && isDown(i)) out.add(action);
  }
  return out;
}

// [prog] a11y: pad layout presets and per-player overrides (settings.pads[slot]).
// A preset is { buttons: { action: [index] }, chords, swapSticks }. Two buttons are special slots,
// not plain buttons: `cape` is the tap/hold button (tap: cape stun, hold: gadget wheel) and `crouch`
// is the other one (tap: crouch, hold: sprint). Chain chords are held with whatever button blocks.
export const PAD_BUTTON_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Home'];
export const padButtonName = (i) => (Number.isInteger(i) && i >= 0 ? PAD_BUTTON_NAMES[i] ?? `Button ${i}` : 'Unbound');
const STANDARD_BUTTONS = { ...Object.fromEntries(PAD_BUTTON_ENTRIES.map(([a, b]) => [a, b])), cape: [5], crouch: [10] }; // RB and L3 (PAD_WHEEL, PAD_L3 below)
export const PAD_PRESET_DEFS = {
  standard: { label: 'Standard', buttons: STANDARD_BUTTONS, chords: PAD_CHORDS, swapSticks: false },
  // Sticks swapped (look on the left stick), and the stick clicks swapped with them.
  southpaw: { label: 'Southpaw', buttons: { ...STANDARD_BUTTONS, special: [10], crouch: [11] }, chords: PAD_CHORDS, swapSticks: true },
  // The classic layout: cape stun on B (hold B for the gadget wheel), kick on RB.
  legacy: { label: 'Legacy', buttons: { ...STANDARD_BUTTONS, kick: [5], cape: [1] }, chords: PAD_CHORDS, swapSticks: false },
  // Left hand only for moving and fighting: shoulders and the D-pad do the work.
  oneHanded: {
    label: 'One-handed (left)',
    buttons: { jump: [13], punch: [6], block: [4], kick: [14], dodge: [12], throw: [15], cape: [10], crouch: [8], grapple: [0], batarang: [7], special: [3], detective: [2], vehicle: [1], photo: [11], pause: [9], help: [] },
    chords: { chain1: 14, chain2: 12, chain3: 15, chain4: 6 },
    swapSticks: false,
  },
};
// The actions the pad rebinding screen lists (in this order).
export const PAD_REBINDABLE = ['jump', 'punch', 'kick', 'block', 'throw', 'grapple', 'cape', 'crouch', 'dodge', 'batarang', 'special', 'detective', 'vehicle', 'photo', 'help', 'pause'];

// The resolved buttons for a preset plus overrides ({ action: index }): an override takes the
// button from whichever action held it, which gets the overridden action's old button (a swap,
// like the keyboard's rebind). Pure.
export function resolvePadButtons(preset = 'standard', map = {}) {
  const def = PAD_PRESET_DEFS[preset] ?? PAD_PRESET_DEFS.standard;
  const out = {};
  for (const [a, b] of Object.entries(def.buttons)) out[a] = [...b];
  for (const [a, idx] of Object.entries(map ?? {})) {
    if (!Number.isInteger(idx) || idx < 0) continue;
    const old = out[a]?.[0];
    for (const [other, list] of Object.entries(out)) {
      if (other === a || !list.includes(idx)) continue;
      out[other] = list.filter((i) => i !== idx);
      if (old !== undefined && old !== idx && !out[other].includes(old)) out[other].unshift(old);
    }
    out[a] = [idx, ...(out[a] ?? []).slice(1).filter((i) => i !== idx)];
  }
  return out;
}

// A new overrides map with `action` on button `idx` (moved to the end so it applies last). Pure.
export function rebindPad(map = {}, action, idx) {
  const out = {};
  for (const [a, i] of Object.entries(map ?? {})) if (a !== action) out[a] = i;
  out[action] = idx;
  return out;
}

// The compiled layout padActions and the gamepad source read. 'standard' with no overrides is
// exactly the fixed layout above.
export function padLayout(preset = 'standard', map = {}) {
  const hasMap = map && Object.keys(map).length > 0;
  if ((preset === 'standard' || !PAD_PRESET_DEFS[preset]) && !hasMap) return STANDARD_COMPILED;
  const def = PAD_PRESET_DEFS[preset] ?? PAD_PRESET_DEFS.standard;
  const buttons = resolvePadButtons(preset, map);
  const entries = Object.entries(buttons).filter(([a, b]) => a !== 'cape' && a !== 'crouch' && b.length);
  const chordEntries = Object.entries(def.chords);
  const chordButtons = chordEntries.map(([, i]) => i);
  return {
    preset, entries, chordHold: buttons.block?.[0] ?? -1, chordEntries,
    sticky: chordButtons.filter((i) => i >= 12), immediate: new Set(chordButtons.filter((i) => i < 12)),
    wheel: buttons.cape?.[0] ?? -1, wheelTap: 'cape', wheelHold: 'gadgetWheel',
    l3: buttons.crouch?.[0] ?? -1, l3Tap: 'crouch', l3Hold: 'sprint', swapSticks: !!def.swapSticks,
  };
}
export const STANDARD_LAYOUT = STANDARD_COMPILED;

// Hold or toggle for held actions (settings.access sprint/block/crouch/glide). Pure state machine:
// step() runs once per frame with the raw edges; down()/pressedExtra() answer for the player.
//   sprint toggle: a press latches sprint until pressed again or the stick lets go
//   block toggle:  a press latches block until pressed again (the press still counters)
//   crouch hold:   crouch is a toggle in the hero, so letting go sends a second press
//   glide toggle:  a jump press in the air latches the glide until pressed again or landing
export function createHoldModes() {
  const m = { sprint: 'hold', block: 'hold', crouch: 'toggle', glide: 'hold' };
  const latch = { sprint: false, block: false, glide: false };
  let crouchRelease = false;
  return {
    modes: m,
    latch,
    set(modes = {}) {
      for (const k of ['sprint', 'block', 'crouch', 'glide']) if (modes[k] === 'hold' || modes[k] === 'toggle') m[k] = modes[k];
      if (m.sprint === 'hold') latch.sprint = false;
      if (m.block === 'hold') latch.block = false;
      if (m.glide === 'hold') latch.glide = false;
    },
    get active() { return m.sprint === 'toggle' || m.block === 'toggle' || m.crouch === 'hold' || m.glide === 'toggle'; },
    // raw: { pressed(a), released(a) }; moving: the stick or keys are pushed; airborne: in the air.
    step(raw, moving, airborne) {
      if (m.sprint === 'toggle') { if (raw.pressed('sprint')) latch.sprint = !latch.sprint; if (!moving) latch.sprint = false; }
      if (m.block === 'toggle' && raw.pressed('block')) latch.block = !latch.block;
      if (m.glide === 'toggle') {
        if (!airborne) latch.glide = false;
        else if (raw.pressed('jump')) latch.glide = !latch.glide;
      }
      crouchRelease = m.crouch === 'hold' && raw.released('crouch');
    },
    // down(a) given the raw held state.
    down(a, rawDown) {
      if (a === 'sprint' && m.sprint === 'toggle') return latch.sprint;
      if (a === 'block' && m.block === 'toggle') return latch.block;
      if (a === 'jump' && m.glide === 'toggle') return rawDown || latch.glide;
      return rawDown;
    },
    pressedExtra(a) { return a === 'crouch' && crouchRelease; },
    reset() { latch.sprint = latch.block = latch.glide = false; crouchRelease = false; },
  };
}

// The right bumper: a tap is the cape stun (it fires on release), holding it past PAD_TAP
// opens the gadget wheel until it is let go. Pure.
export const PAD_WHEEL = 5;
export const PAD_TAP = 0.22;
export function createHoldTap(holdTime = PAD_TAP) {
  let down = false, t = 0, holding = false;
  return {
    get holding() { return holding; },
    update(isDown, dt) {
      if (isDown) {
        if (!down) { down = true; t = 0; holding = false; return null; }
        t += dt;
        if (!holding && t >= holdTime) { holding = true; return 'hold'; }
        return null;
      }
      if (!down) return null;
      down = false;
      const was = holding;
      holding = false;
      return was ? 'release' : 'tap';
    },
  };
}
export const PAD_L3 = 10;
// [polish] The city map on a pad: hold the detective button (View) past PAD_MAP_HOLD and the map
// opens ('map' pressed once); a tap is detective vision, fired on release like the cape tap. The
// keyboard keeps M and N. Works for any layout: it follows whatever button 'detective' is on.
export const PAD_MAP_HOLD = 0.45;

const DEADZONE = 0.18;
const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE));
const defaultGetGamepads = () => (typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null) ?? [];

// The keyboard and the mouse. `onTouch` fires on any key, button or locked mouse move (the merged
// input's `device` follows the last device touched).
export function createKeyboardMouseSource({ target = window, bindings, onTouch = () => {} }) {
  const held = new Set();
  const pressedCodes = new Set();
  const releasedCodes = new Set();
  let codeToActions = new Map();
  let capture = null;
  let enabled = true;
  const look = { dx: 0, dy: 0 };
  const move = { x: 0, y: 0 };

  function setBindings(b) {
    codeToActions = new Map();
    for (const [action, codes] of Object.entries(b)) {
      for (const c of codes) {
        if (!codeToActions.has(c)) codeToActions.set(c, []);
        codeToActions.get(c).push(action);
      }
    }
  }
  setBindings(bindings);

  function codeDown(code, e) {
    onTouch();
    if (!enabled && !capture) return;
    if (capture) {
      // The key belongs to the rebind screen: nothing else (like Esc closing the pause menu) sees it.
      e?.preventDefault();
      e?.stopImmediatePropagation();
      const cb = capture;
      capture = null;
      cb(code === 'Escape' ? null : code);
      return;
    }
    if (codeToActions.has(code) && e && code !== 'Escape' && !e.ctrlKey && !e.metaKey) e.preventDefault();
    if (!held.has(code)) pressedCodes.add(code);
    held.add(code);
  }
  function codeUp(code) {
    if (held.delete(code)) releasedCodes.add(code);
  }

  // Typing in a text field (the photo caption) never drives the game.
  const typing = (e) => !!e.target?.closest?.('input[type="text"], textarea');
  const onKeyDown = (e) => { if (typing(e)) return; if (!e.repeat) codeDown(e.code, e); else if (codeToActions.has(e.code)) e.preventDefault(); };
  const onKeyUp = (e) => codeUp(e.code);
  const onMouseDown = (e) => {
    if (e.target?.closest?.('.menu, .rebind')) { if (capture) codeDown('Mouse' + e.button, e); return; }
    codeDown('Mouse' + e.button, e);
  };
  const onMouseUp = (e) => codeUp('Mouse' + e.button);
  const onMouseMove = (e) => {
    if (document.pointerLockElement) { look.dx += e.movementX; look.dy += e.movementY; onTouch(); }
  };
  const onBlur = () => { for (const c of held) releasedCodes.add(c); held.clear(); };
  const onContext = (e) => e.preventDefault();

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('mousemove', onMouseMove);
  target.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', onBlur);

  const anyCode = (set, action) => {
    for (const [code, actions] of codeToActions) if (actions.includes(action) && set.has(code)) return true;
    return false;
  };

  return {
    kind: 'kbm',
    move,
    look,
    down: (a) => anyCode(held, a),
    pressed: (a) => anyCode(pressedCodes, a),
    released: (a) => anyCode(releasedCodes, a),
    codePressed: (code) => pressedCodes.has(code),
    swallow(code) { pressedCodes.delete(code); },
    setBindings,
    captureNext(cb) { capture = cb; },
    cancelCapture() { capture = null; },
    get capturing() { return capture !== null; },
    setEnabled(v) { enabled = v; if (!v) onBlur(); },
    update() {
      move.x = (anyCode(held, 'right') ? 1 : 0) - (anyCode(held, 'left') ? 1 : 0);
      move.y = (anyCode(held, 'forward') ? 1 : 0) - (anyCode(held, 'back') ? 1 : 0);
    },
    endFrame() { pressedCodes.clear(); releasedCodes.clear(); look.dx = 0; look.dy = 0; },
    releaseAll: onBlur,
    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('mouseup', onMouseUp);
      target.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('contextmenu', onContext);
      window.removeEventListener('blur', onBlur);
    },
  };
}

// One gamepad. `index` is a Gamepad.index (two identical pads share an id, never an index), or
// 'first' for the first connected pad (single player: any pad drives player 0). Polled every
// frame through getGamepads (never hold the Gamepad objects: some browsers snapshot them).
// `update` returns true when the pad was used this frame (any action, a tap or a stick).
export function createGamepadSource({ index = 'first', getGamepads = defaultGetGamepads, latch = new Set(), layout = STANDARD_COMPILED } = {}) {
  const padHeld = new Set();
  const padPressed = new Set();
  const padReleased = new Set();
  const rawHeld = new Set();
  const rawPressed = new Set();
  const now = new Set();
  const stick = { mx: 0, my: 0, lx: 0, ly: 0 };
  const rbHold = createHoldTap(PAD_TAP);
  const l3Hold = createHoldTap(PAD_TAP);
  const viewHold = createHoldTap(PAD_MAP_HOLD); // [polish] tap: detective, hold: the city map
  let capeTap = false, crouchTap = false, connected = false, viewTap = false, mapHold = false;

  function find() {
    const pads = getGamepads() ?? [];
    if (index === 'first') {
      for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return pads[i];
      return null;
    }
    for (let i = 0; i < pads.length; i++) { const p = pads[i]; if (p && p.connected && p.index === index) return p; }
    return null;
  }

  return {
    kind: 'pad',
    get index() { return index; },
    // Re-bind to another pad (a second player joined and took pad 1: player 0 keeps pad 0).
    setIndex(i) { index = i; },
    // [prog] a11y: a padLayout() (preset + overrides) for this pad.
    setLayout(l) { layout = l ?? STANDARD_COMPILED; },
    get layout() { return layout; },
    stick,
    get connected() { return connected; },
    down: (a) => padHeld.has(a),
    pressed: (a) => padPressed.has(a),
    released: (a) => padReleased.has(a),
    padPressed: (a) => padPressed.has(a),
    padButton: (i) => rawPressed.has(i),
    padButtonHeld: (i) => rawHeld.has(i),
    update(dt = 0) {
      const pad = find();
      connected = !!pad;
      let used = false;
      now.clear();
      if (pad) {
        // [prog] a11y: the layout (preset + overrides) decides the buttons; standard is unchanged.
        padActions((i) => !!pad.buttons[i]?.pressed, now, latch, layout);
        if (rbHold.update(!!pad.buttons[layout.wheel]?.pressed, dt) === 'tap') capeTap = true;
        if (rbHold.holding) now.add(layout.wheelHold);
        if (l3Hold.update(!!pad.buttons[layout.l3]?.pressed, dt) === 'tap') crouchTap = true;
        if (l3Hold.holding) now.add(layout.l3Hold);
        // [polish] Detective comes out of the held set: a tap fires it, a hold opens the map.
        const v = viewHold.update(now.has('detective'), dt);
        now.delete('detective');
        if (v === 'tap') viewTap = true; else if (v === 'hold') mapHold = true;
        pad.buttons.forEach((b, i) => { if (b?.pressed) { if (!rawHeld.has(i)) rawPressed.add(i); rawHeld.add(i); } else rawHeld.delete(i); });
        const s = layout.swapSticks ? 2 : 0;
        stick.mx = dz(pad.axes[s] ?? 0); stick.my = dz(pad.axes[s + 1] ?? 0);
        stick.lx = dz(pad.axes[2 - s] ?? 0); stick.ly = dz(pad.axes[3 - s] ?? 0);
        if (now.size || stick.mx || stick.my || stick.lx || stick.ly) used = true;
      } else {
        stick.mx = stick.my = stick.lx = stick.ly = 0;
        rbHold.update(false, dt);
        l3Hold.update(false, dt);
        viewHold.update(false, dt);
      }
      for (const a of now) if (!padHeld.has(a)) padPressed.add(a);
      if (capeTap) { padPressed.add(layout.wheelTap); capeTap = false; used = true; }
      if (crouchTap) { padPressed.add(layout.l3Tap); crouchTap = false; used = true; }
      if (viewTap) { padPressed.add('detective'); viewTap = false; used = true; } // [polish]
      if (mapHold) { padPressed.add('map'); mapHold = false; used = true; } // [polish]
      for (const a of padHeld) if (!now.has(a)) padReleased.add(a);
      padHeld.clear();
      for (const a of now) padHeld.add(a);
      return used;
    },
    endFrame() { padPressed.clear(); padReleased.clear(); rawPressed.clear(); },
    releaseAll() { padHeld.clear(); },
  };
}

// One player's input: keyboard+mouse and/or one pad behind the single action API every system
// reads. Either may be null (a pad-only second player has no keyboard). The move vector and the
// look delta combine both, as they always did.
export function createMergedInput({ kbm = null, pad = null } = {}) {
  let device = 'kbm';
  // Co-op (workstream D1): the keyboard+mouse can be handed to another local player (at most one
  // keyboard+mouse player). Off, this input ignores it entirely (actions, movement and mouse look).
  let kbmOn = true;
  const K = () => (kbmOn ? kbm : null);
  const move = { x: 0, y: 0 };
  const look = { dx: 0, dy: 0 };
  const noStick = { mx: 0, my: 0, lx: 0, ly: 0 };
  // [prog] a11y: hold/toggle modes (createHoldModes) and the pad's own look tuning, relative to
  // the camera's (keyboard+mouse) sensitivity and inversion: lookX/lookY multiply the stick only.
  const hold = createHoldModes();
  let airborne = null;
  let lookX = 1, lookY = 1;
  const rawDown = (a) => (K() ? kbm.down(a) : false) || (pad ? pad.down(a) : false);
  const rawPressed = (a) => (K() ? kbm.pressed(a) : false) || (pad ? pad.pressed(a) : false);
  const rawReleased = (a) => (K() ? kbm.released(a) : false) || (pad ? pad.released(a) : false);
  const rawEdges = { pressed: rawPressed, released: rawReleased };
  const api = {
    get device() { return device; },
    move,
    look,
    kbm,
    pad,
    down: (a) => (hold.active ? hold.down(a, rawDown(a)) : rawDown(a)),
    // Gamepad-only queries (menus and comics listen to the pad directly).
    padPressed: (a) => (pad ? pad.padPressed(a) : false),
    padButton: (i) => (pad ? pad.padButton(i) : false),
    // Raw pad state for screens with their own controls (photo mode). Works while disabled.
    padButtonHeld: (i) => (pad ? pad.padButtonHeld(i) : false),
    get stick() { return pad ? pad.stick : noStick; },
    pressed: (a) => rawPressed(a) || hold.pressedExtra(a),
    released: rawReleased,
    // Raw key presses this frame, for the gadget wheel's 1 to 8 (whatever they are bound to).
    codePressed: (code) => (K() ? kbm.codePressed(code) : false),
    // Hides a key press from every action for the rest of this frame (the open wheel eats 1 to 8,
    // so chain takedowns on 1 to 3 never fire from a wheel pick).
    swallow(code) { kbm?.swallow(code); },
    setBindings(b) { kbm?.setBindings(b); },
    captureNext(cb) { kbm?.captureNext(cb); },
    cancelCapture() { kbm?.cancelCapture(); },
    // Drops a code's buffered press without touching `held`, so a click that only re-acquired
    // pointer lock (Safari needs a real user gesture) doesn't also fire the action bound to it.
    swallowCode(code) { kbm?.swallow(code); },
    get capturing() { return kbm ? kbm.capturing : false; },
    // While a menu is open, the game ignores keys so buttons get Space and Enter.
    setEnabled(v) { kbm?.setEnabled(v); },
    // Call once per frame before reading actions.
    update(dt) {
      if (pad && pad.update(dt)) device = 'pad';
      if (K()) kbm.update(dt);
      const stick = api.stick;
      move.x = (K() ? kbm.move.x : 0) + stick.mx;
      move.y = (K() ? kbm.move.y : 0) - stick.my;
      const len = Math.hypot(move.x, move.y);
      if (len > 1) { move.x /= len; move.y /= len; }
      // The locked mouse's movement since last frame, then the right stick (~900 px/s of mouse
      // at full tilt).
      if (K()) { look.dx += kbm.look.dx; look.dy += kbm.look.dy; kbm.look.dx = 0; kbm.look.dy = 0; }
      look.dx += stick.lx * 900 * dt * lookX;
      look.dy += stick.ly * 700 * dt * lookY;
      if (hold.active) hold.step(rawEdges, move.x !== 0 || move.y !== 0, airborne ? airborne() : false);
    },
    // [prog] a11y: settings.access hold/toggle modes; airborne() tells the glide toggle she is in the air.
    setHoldModes(modes, { airborne: fn = null } = {}) { hold.set(modes ?? {}); if (fn) airborne = fn; },
    get holdModes() { return hold.modes; },
    // [prog] a11y: a pad layout (padLayout) for this player's pad.
    setPadLayout(layout) { pad?.setLayout?.(layout); },
    // [prog] a11y: the pad's look: its sensitivity and inversion relative to the camera's
    // (base = the keyboard+mouse settings the camera applies: { sensitivity, invertY }).
    setLookTuning({ base = { sensitivity: 1, invertY: false }, pad: p = null } = {}) {
      if (!p) { lookX = 1; lookY = 1; return; }
      const k = (p.sensitivity ?? 1) / (base.sensitivity || 1);
      lookX = k * (p.invertX ? -1 : 1);
      lookY = k * (!!p.invertY !== !!base.invertY ? -1 : 1);
    },
    get lookTuning() { return { x: lookX, y: lookY }; },
    endFrame() {
      K()?.endFrame();
      pad?.endFrame();
      look.dx = 0; look.dy = 0;
    },
    releaseAll() { kbm?.releaseAll(); pad?.releaseAll(); hold.reset(); },
    dispose() { kbm?.dispose(); },
    // The keyboard and mouse were touched: `device` switches to 'kbm' at once (the hint labels).
    touch() { if (kbmOn) device = 'kbm'; },
    // Co-op: whether this player has the keyboard+mouse, and which pad (a Gamepad.index, 'first',
    // or null) it reads.
    get hasKbm() { return !!kbm && kbmOn; },
    setKbm(on) { kbmOn = !!on; if (!kbmOn && device === 'kbm' && pad) device = 'pad'; },
    setPad(index) { pad?.setIndex?.(index); },
    get padIndex() { return pad ? pad.index : null; },
  };
  return api;
}

// Player 0 on its own: the keyboard and mouse merged with whichever pad is connected first,
// exactly as input worked before it was split into sources.
export function createInput({ target = window, bindings, getGamepads = defaultGetGamepads }) {
  let merged = null;
  const kbm = createKeyboardMouseSource({ target, bindings, onTouch: () => merged?.touch() });
  const pad = createGamepadSource({ index: 'first', getGamepads, latch: defaultChordLatch });
  merged = createMergedInput({ kbm, pad });
  return merged;
}

// A player's input built from a device assignment (src/players/devices.js): { kbm, pad } where
// pad is a Gamepad.index, 'first' or null. Player 0 alone gets exactly createInput.
export function createInputFor({ kbm = false, pad = null }, { target = window, bindings, getGamepads = defaultGetGamepads } = {}) {
  if (kbm && pad === 'first') return createInput({ target, bindings, getGamepads });
  let merged = null;
  const k = kbm ? createKeyboardMouseSource({ target, bindings, onTouch: () => merged?.touch() }) : null;
  const p = pad === null ? null : createGamepadSource({ index: pad, getGamepads });
  merged = createMergedInput({ kbm: k, pad: p });
  return merged;
}

// An input driven by code: tests, the ?p2=bot dev player, replays. Same action API as a device.
// press(a): pressed on the next frame and held until release(a). tap(a): pressed for one frame.
export function createScriptedInput({ kind = 'scripted' } = {}) {
  const held = new Set(), pressedNow = new Set(), releasedNow = new Set();
  const queuedPress = new Set(), queuedRelease = new Set(), queuedTap = new Set();
  const move = { x: 0, y: 0 };
  const look = { dx: 0, dy: 0 };
  const stick = { mx: 0, my: 0, lx: 0, ly: 0 };
  const wantMove = { x: 0, y: 0 }, wantLook = { dx: 0, dy: 0 };
  const src = {
    kind,
    get device() { return kind; },
    move, look, stick,
    down: (a) => held.has(a),
    pressed: (a) => pressedNow.has(a),
    released: (a) => releasedNow.has(a),
    padPressed: () => false,
    padButton: () => false,
    padButtonHeld: () => false,
    codePressed: () => false,
    swallow() {}, swallowCode() {}, setBindings() {}, captureNext() {}, cancelCapture() {},
    get capturing() { return false; },
    setEnabled() {},
    press(a) { queuedPress.add(a); },
    release(a) { queuedRelease.add(a); },
    tap(a) { queuedTap.add(a); },
    setMove(x, y) { wantMove.x = x; wantMove.y = y; },
    // A per-frame look delta (pixels of mouse), applied every frame until changed.
    setLook(dx, dy) { wantLook.dx = dx; wantLook.dy = dy; },
    // Replace the whole held state at once (a remote snapshot): held actions and move/look.
    setState({ held: h = [], move: m = null, look: l = null } = {}) {
      for (const a of held) if (!h.includes(a)) queuedRelease.add(a);
      for (const a of h) if (!held.has(a)) queuedPress.add(a);
      if (m) src.setMove(m.x, m.y);
      if (l) src.setLook(l.dx, l.dy);
    },
    update() {
      for (const a of queuedPress) { if (!held.has(a)) pressedNow.add(a); held.add(a); }
      for (const a of queuedTap) pressedNow.add(a);
      for (const a of queuedRelease) { if (held.delete(a)) releasedNow.add(a); }
      queuedPress.clear(); queuedTap.clear(); queuedRelease.clear();
      move.x = wantMove.x; move.y = wantMove.y;
      const len = Math.hypot(move.x, move.y);
      if (len > 1) { move.x /= len; move.y /= len; }
      look.dx += wantLook.dx; look.dy += wantLook.dy;
    },
    endFrame() { pressedNow.clear(); releasedNow.clear(); look.dx = 0; look.dy = 0; },
    releaseAll() { for (const a of held) releasedNow.add(a); held.clear(); },
    // [net] Replace the held set now, without press or release edges (createRemoteInput.setHeld).
    replaceHeld(list) { held.clear(); for (let i = 0; i < list.length; i++) held.add(list[i]); queuedPress.clear(); queuedRelease.clear(); },
    dispose() {},
  };
  return src;
}

// A networked player's input (workstream D2, src/net/**): the scripted source under another kind.
// apply() takes a decoded input message { held: [action], move: {x, y}, look: {dx, dy} } and makes
// press/release edges on the next update(), like any device. setHeld(list) replaces what is held
// at once with no edges: the net layer uses it, because a networked player's presses act on its own
// machine and this machine only needs what it is holding (the revive hold, a glue chord).
export function createRemoteInput() {
  const src = createScriptedInput({ kind: 'remote' });
  src.apply = (msg) => src.setState(msg);
  src.setHeld = (list) => src.replaceHeld(list);
  return src;
}
