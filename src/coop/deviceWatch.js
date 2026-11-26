// Watches every input device for the co-op layer (workstream D1): "press Start / Enter to join",
// which device is in use, pads connecting and disconnecting, and menu navigation per device
// (the hero select is driven by each player's own device). Polled once a frame; never holds a
// Gamepad object between frames (some browsers snapshot them).
//
//   poll()  -> { joins: [device], activity: [device], connected: [index], disconnected: [index] }
//   nav(device) -> { left, right, up, down, ok, back, start } edges this frame for that device
// device: 'kbm' or a pad index.
const defaultGetGamepads = () => (typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null) ?? [];
const STICK = 0.55;
const NAV_KEYS = ['left', 'right', 'up', 'down', 'ok', 'back', 'start'];
const QUEUE_KEYS = [...NAV_KEYS, 'join', 'active'];
const OTHER_BUTTONS = [2, 3, 4, 5, 6, 7, 8, 10, 11];
// A button edge on pad state s (allocation-free: no closure per frame).
function edge(p, s, b) {
  const down = !!p.buttons[b]?.pressed;
  const was = s.held.has(b);
  if (down) s.held.add(b); else s.held.delete(b);
  if (down) s.used = true;
  return down && !was;
}

export function createDeviceWatch({ target = window, getGamepads = defaultGetGamepads } = {}) {
  const pads = new Map(); // index -> { held: Set<button>, stick: { x, y }, nav, used }
  const seen = new Set();
  const out = { joins: [], activity: [], connected: [], disconnected: [] };
  const kbNav = blankNav();
  const kbQueue = { left: 0, right: 0, up: 0, down: 0, ok: 0, back: 0, start: 0, join: 0, active: 0 };
  let enabled = true;

  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Enter: 'ok', NumpadEnter: 'ok', Space: 'ok', Escape: 'back', Backspace: 'back',
  };
  const onKey = (e) => {
    if (e.repeat || e.target?.closest?.('input[type="text"], textarea')) return;
    kbQueue.active = 1;
    const k = KEYS[e.code];
    if (k) kbQueue[k] = 1;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') kbQueue.join = 1;
  };
  const onMouse = () => { kbQueue.active = 1; };
  target.addEventListener('keydown', onKey);
  target.addEventListener('mousedown', onMouse);

  function blankNav() { return { left: false, right: false, up: false, down: false, ok: false, back: false, start: false }; }

  return {
    get enabled() { return enabled; },
    setEnabled(v) { enabled = v; },
    poll() {
      out.joins.length = 0; out.activity.length = 0; out.connected.length = 0; out.disconnected.length = 0;
      // Keyboard.
      for (const k of NAV_KEYS) kbNav[k] = !!kbQueue[k];
      if (kbQueue.join) out.joins.push('kbm');
      if (kbQueue.active) out.activity.push('kbm');
      for (const k of QUEUE_KEYS) kbQueue[k] = 0;
      // Pads.
      const list = getGamepads() ?? [];
      seen.clear();
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p || !p.connected) continue;
        seen.add(p.index);
        let s = pads.get(p.index);
        if (!s) { s = { held: new Set(), stick: { x: 0, y: 0 }, nav: blankNav(), used: false }; pads.set(p.index, s); out.connected.push(p.index); }
        const nav = s.nav;
        for (const k of NAV_KEYS) nav[k] = false;
        s.used = false;
        const a = edge(p, s, 0), b = edge(p, s, 1), start = edge(p, s, 9);
        if (edge(p, s, 14)) nav.left = true;
        if (edge(p, s, 15)) nav.right = true;
        if (edge(p, s, 12)) nav.up = true;
        if (edge(p, s, 13)) nav.down = true;
        for (let n = 0; n < OTHER_BUTTONS.length; n++) edge(p, s, OTHER_BUTTONS[n]);
        // The left stick as a D-pad: an edge when it crosses STICK.
        const sx = p.axes[0] ?? 0, sy = p.axes[1] ?? 0;
        if (sx < -STICK && s.stick.x >= -STICK) nav.left = true;
        if (sx > STICK && s.stick.x <= STICK) nav.right = true;
        if (sy < -STICK && s.stick.y >= -STICK) nav.up = true;
        if (sy > STICK && s.stick.y <= STICK) nav.down = true;
        if (Math.abs(sx) > 0.3 || Math.abs(sy) > 0.3 || Math.abs(p.axes[2] ?? 0) > 0.3 || Math.abs(p.axes[3] ?? 0) > 0.3) s.used = true;
        s.stick.x = sx; s.stick.y = sy;
        nav.ok = a; nav.back = b; nav.start = start;
        if (start || a) out.joins.push(p.index);
        if (s.used) out.activity.push(p.index);
      }
      if (seen.size !== pads.size) for (const idx of [...pads.keys()]) if (!seen.has(idx)) { pads.delete(idx); out.disconnected.push(idx); }
      if (!enabled) { out.joins.length = 0; }
      return out;
    },
    nav(device) { return device === 'kbm' ? kbNav : pads.get(device)?.nav ?? blankNav(); },
    // Pad indices connected right now (lowest first): the 'first' pad is connectedPads()[0].
    connectedPads() { return [...pads.keys()].sort((a, b) => a - b); },
    dispose() { target.removeEventListener('keydown', onKey); target.removeEventListener('mousedown', onMouse); },
  };
}
