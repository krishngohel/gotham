// A small animation graph per character (docs/design/research/combat-animation-assets.md 2).
//
// Callers ask for a state with a clip (`play`), and the graph owns the clip clock, the event
// track and the transition rules:
// - the clock is the clip's own time (startAt + the actor's dt x timeScale), so a hit-stop (dt 0),
//   a slowed clip or a start trim all move the events with the pose: a hit fires when the clip
//   reaches `contact`, never from a separate timer (combat-findings 1, 6, 8, 12);
// - events come from src/anim/clips.js (baked tracks: warpStart, contact, cancel, recover, end,
//   footL/footR, down, getUpStart) and fire once each as the clock crosses them, loops included;
// - per-play handlers (`on: { contact() {...} }`) go to the caller that started the clip; foot
//   plants and contacts also go out on the event bus as `animEvent` for audio and VFX;
// - `canEnter(next)` answers the exit rules: strike -> strike from `cancel`, counter/dodge any
//   time before contact or after cancel, react interrupts anything, anything else from `recover`.
//
// Who advances the clock: a control that drives a move calls graph.advance(dt) itself (so its
// contact lands inside its own update, also in tests with no mixer); otherwise the animator's
// update does it, once per frame either way.
import { clipInfo, noteDuration } from './clips.js';
import { createFootLock } from './footLock.js';

// Exit rules per state: which event of the current clip must have passed before `next` may start.
// 'start' = any time; 'never' = not at all (the state ends itself).
export const STATES = {
  idle: { exits: { '*': 'start' } },
  loco: { exits: { '*': 'start' } },
  strike: { exits: { strike: 'cancel', counter: 'preContact', dodge: 'preContact', react: 'start', '*': 'recover' } },
  counter: { exits: { strike: 'cancel', counter: 'cancel', dodge: 'cancel', react: 'start', '*': 'recover' } },
  dodge: { exits: { strike: 'recover', counter: 'start', dodge: 'recover', react: 'start', '*': 'recover' } },
  react: { exits: { react: 'start', counter: 'recover', '*': 'recover' } },
  air: { exits: { land: 'start', react: 'start', '*': 'never' } },
  knockdown: { exits: { react: 'start', getup: 'down', '*': 'end' } },
  getup: { exits: { react: 'start', '*': 'recover' } },
  action: { exits: { react: 'start', '*': 'recover' } },
};

// Pure: may a character in `state` (with `passed(event)` answering for its clip) start `next`?
export function canExit(state, passed, next) {
  const s = STATES[state] ?? STATES.action;
  const rule = s.exits[next] ?? s.exits['*'] ?? 'recover';
  if (rule === 'start') return true;
  if (rule === 'never') return false;
  // Counters and dodges cut a strike before its blow lands (today's `interruptible`), or after
  // its cancel point like any strike.
  if (rule === 'preContact') return !passed('contactSoon') || passed('cancel');
  return passed(rule);
}

// Events that fire for every clip (the rest are named in the clip's track).
const NAMES = ['warpStart', 'contact', 'cancel', 'recover', 'down', 'getUpStart', 'end'];

// States whose foot plants are locked against the warp (src/anim/footLock.js).
// (Not knockdowns: the feet leave the floor; footLock.js also checks the foot really is down.)
const LOCK_STATES = new Set(['strike', 'counter', 'react', 'getup']);

export function createAnimGraph({ animator, events = null, actor = null, who = 'actor', surfaceAt = null, footLock = null } = {}) {
  let state = 'idle', clip = null, info = null, t = 0, speed = 1, startAt = 0, once = false, loop = false;
  let duration = 1, action = null, handlers = null, advanced = false, carry = false;
  // Bit per entry of NAMES already fired this play; foot plants by index (reset each loop cycle).
  let fired = 0, footLi = 0, footRi = 0;
  // Bumped by play(): a handler that starts a new clip ends the old clip's event pass.
  let gen = 0;
  const listeners = new Map(); // name -> [fn] for every play (combat listens for 'contact')
  // One reused payload for the bus (listeners copy what they keep).
  const payload = { actor, who, name: '', clip: '', state: '', pos: null, surface: null, gait: null };
  const playOpts = { once: true, timeScale: 1, startAt: 0, fade: 0.1, blend: 'inertial', maxBlend: undefined, freeLimbs: null };

  const evTime = (name) => {
    const v = info?.events?.[name];
    if (typeof v === 'number') return v;
    if (!info) return null;
    // Sensible stand-ins for clips missing one: cancel a beat after contact, recover at the end.
    if (name === 'cancel' && typeof info.events.contact === 'number') return info.events.contact + 0.08;
    if (name === 'recover' || name === 'end') return info.events.end ?? duration;
    return null;
  };

  function emit(name) {
    if (footLock && (name === 'footL' || name === 'footR') && LOCK_STATES.has(state)) footLock.plant(name);
    const h = handlers?.[name];
    if (h) h(name);
    const ls = listeners.get(name);
    if (ls) for (let i = 0; i < ls.length; i++) ls[i](name, graph);
    if (events && (name === 'contact' || name === 'footL' || name === 'footR' || name === 'down')) {
      payload.name = name; payload.clip = clip; payload.state = state;
      payload.pos = actor?.pos ?? null;
      payload.surface = surfaceAt && payload.pos ? surfaceAt(payload.pos) : null;
      events.emit('animEvent', payload);
    }
  }

  // Fires every event in (t0, t1] of one clip pass (no wrap inside).
  function fireRange(t0, t1) {
    const ev = info?.events;
    if (!ev) return;
    const g = gen;
    for (let i = 0; i < NAMES.length; i++) {
      const bit = 1 << i;
      if (fired & bit) continue;
      const v = evTime(NAMES[i]);
      if (v === null) continue;
      // Inclusive at t0: an event exactly on the start frame fires on the first step (the bit
      // keeps every event to once per pass).
      if (v <= t1 && v >= t0) { fired |= bit; emit(NAMES[i]); if (gen !== g) return; }
    }
    const fl = ev.footL, fr = ev.footR;
    if (fl) while (footLi < fl.length && fl[footLi] <= t1) { footLi++; emit('footL'); if (gen !== g) return; }
    if (fr) while (footRi < fr.length && fr[footRi] <= t1) { footRi++; emit('footR'); if (gen !== g) return; }
  }

  function clock(dt) {
    if (!clip || dt <= 0 || speed === 0) return;
    // Someone played a clip straight on the animator (a chain takedown on a held goon): the graph
    // steps aside until it is asked to play again.
    if (action && animator.currentAction && animator.currentAction !== action) { state = 'external'; clip = null; info = null; return; }
    const t0 = t, g = gen;
    t += dt * speed;
    if (loop && duration > 0 && t >= duration) {
      fireRange(t0, duration);
      if (gen !== g) return;
      t %= duration;
      fired = 0; footLi = 0; footRi = 0;
      fireRange(-1e-9, t);
    } else {
      if (once && t > duration) t = duration;
      fireRange(t0, t);
    }
  }

  const graph = {
    get state() { return state; },
    get clip() { return clip; },
    get info() { return info; },
    get time() { return t; },
    get speed() { return speed; },
    get duration() { return duration; },
    // Seconds of this actor's time until `name` (0 when passed; Infinity when unknown or held).
    timeTo(name) {
      const v = evTime(name);
      if (v === null || speed <= 0) return v !== null && t >= v ? 0 : Infinity;
      return Math.max(0, (v - t) / speed);
    },
    // Whether the clock has reached `name`. 'contactSoon': within 0.02 s of contact (counters and
    // dodges may no longer cut in).
    passed(name) {
      if (name === 'contactSoon') { const v = evTime('contact'); return v !== null && (v - t) / Math.max(speed, 1e-3) <= 0.02; }
      const v = evTime(name);
      if (v === null) return !clip || (once && t >= duration);
      return t >= v;
    },
    get ended() { return !clip || (once && t >= duration - 1e-6); },
    canEnter(next) { return canExit(state, graph.passed, next); },
    // Starts `name` in `st`. Options as animator.play plus `on` (per-play event handlers) and
    // `blend` ('inertial' for combat transitions, 'fade' otherwise).
    // `events`: an event track to use when the clip has none of its own (a clip with no data).
    play(name, { state: st = 'action', once: o = true, timeScale = 1, startAt: s0 = 0, fade = 0.1, blend = 'inertial', on = null, events: evs = null, maxBlend = undefined } = {}) {
      // A strike or counter blends in no longer than 80% of the way to its contact: the blow
      // must read on the frame it lands (the dead blend otherwise stretches with pose distance).
      let mb = maxBlend, freeLimbs = null;
      if (mb === undefined && (st === 'strike' || st === 'counter')) {
        const ci = clipInfo(name), c = ci?.events?.contact ?? evs?.contact;
        // The striking limb (and the spine) keep the cap; the other pair of limbs blend freely.
        const limb = ci?.limb ?? '';
        freeLimbs = /hand|arm/.test(limb) ? 'legs' : /foot|ball|calf|toe/.test(limb) ? 'arms' : null;
        // (Never under 0.14 s: a jab cancelled out of an overhead hammer still has to bring its
        // arms down; at contact it is then ~80% in.)
        if (typeof c === 'number' && c > s0) mb = Math.max(fade, 0.14, ((c - s0) / Math.max(0.05, timeScale)) * 0.8);
      }
      playOpts.once = o; playOpts.timeScale = timeScale; playOpts.startAt = s0; playOpts.fade = fade; playOpts.blend = blend; playOpts.maxBlend = mb; playOpts.freeLimbs = freeLimbs;
      action = animator.play(name, playOpts) ?? null;
      const real = action?.getClip?.();
      if (real && Number.isFinite(real.duration)) noteDuration(name, real.duration);
      info = clipInfo(name);
      if (evs && (!info || info.events?.contact === undefined)) info = { ...(info ?? {}), name, duration: info?.duration ?? evs.end ?? real?.duration ?? 1, events: evs };
      clip = name; state = st; t = s0; startAt = s0; speed = timeScale; once = o;
      loop = !o;
      duration = info?.duration ?? real?.duration ?? 1;
      handlers = on;
      fired = 0;
      gen++;
      // A strike or a reaction starts with both feet planted (their plant events are usually
      // before the start trim, so they never fire): lock whichever is really down (footLock.js
      // checks), and let the clip's lift take it off.
      if (footLock) { if (LOCK_STATES.has(st)) { footLock.plant('footL'); footLock.plant('footR'); } else footLock.release(); }
      // Events at or before the start are treated as passed (a trimmed wind-up).
      const ev = info?.events;
      for (let i = 0; i < NAMES.length; i++) { const v = evTime(NAMES[i]); if (v !== null && v < s0) fired |= 1 << i; }
      footLi = 0; footRi = 0;
      if (ev?.footL) while (footLi < ev.footL.length && ev.footL[footLi] < s0) footLi++;
      if (ev?.footR) while (footRi < ev.footR.length && ev.footR[footRi] < s0) footRi++;
      // Played after this frame's clock step: the mixer will still advance it this frame.
      carry = advanced;
      return graph;
    },
    // A clip the graph should only time (locomotion played by older code): adopt it as a loop.
    adopt(name, st = 'loco') {
      if (clip === name && state === st) return;
      info = clipInfo(name); clip = name; state = st; t = 0; startAt = 0; speed = 1; once = false; loop = true;
      duration = info?.duration ?? 1; handlers = null; fired = 0; footLi = 0; footRi = 0; gen++;
      action = animator.currentAction ?? null;
    },
    // Sets the clip time without firing the events in between: a paired victim follows its
    // attacker's clock (src/anim/paired.js), a network puppet the host's.
    seek(time) { t = time; if (action) action.time = time; },
    // Renames the state without touching the clip (a fall clip that carries on into its own
    // get-up: 'knockdown' -> 'getup').
    relabel(st) { state = st; },
    // Changes the clip's speed in place (a goon's held wind-up fires).
    setSpeed(s) {
      speed = s;
      if (action && 'timeScale' in action) action.timeScale = s;
    },
    // Per-frame step from a control (see the header). dt: this actor's dt.
    // Called once per frame by whoever drives the move; the animator's own update then skips
    // its clock step for this frame.
    advance(dt) {
      advanced = true;
      clock(dt);
    },
    on(name, fn) { let l = listeners.get(name); if (!l) { l = []; listeners.set(name, l); } l.push(fn); },
    // The state ends (a control finished): back to locomotion, which the owner plays.
    release(st = 'idle') { state = st; handlers = null; footLock?.release(); },
  };

  // Clock the graph from the animator when no control did this frame.
  const base = animator.update;
  animator.update = (dt) => {
    if (!advanced || carry) clock(dt);
    advanced = false; carry = false;
    base(dt);
  };
  return graph;
}

// The graph for a character, made on first use (ch.graph). Turns dead blending on for it.
export function graphFor(ch, opts = {}) {
  if (!ch) return null;
  if (!ch.graph) {
    ch.animator.inertial?.();
    // Foot locks pose after the mixer (animator.after), on heroes with a leg rig (anim2: on goons
    // a lock fought the knock slide of every blow and added pops; on the hero it takes about a
    // third off the strikes' foot slide, scripts/anim-audit.mjs FOOTLOCK=0/1).
    let footLock = null;
    if (opts.who === 'hero' && ch.animator.after && ch.bone && ch.root && ch.forward) {
      const actor = opts.actor;
      footLock = createFootLock(ch, { grounded: () => !actor || actor.grounded !== false });
      ch.animator.after((dt) => footLock.apply(dt));
      ch.footLock = footLock;
    }
    ch.graph = createAnimGraph({ animator: ch.animator, footLock, ...opts });
  }
  return ch.graph;
}
