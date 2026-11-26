// One lookup for everything the animation graph and combat need to know about a clip: duration,
// contact frame, striking limb and its reach, baked root motion, kind and the event track
// (warpStart, contact, cancel, recover, end, footL/footR, down, getUpStart).
//
// Sources, in order of trust:
// - the lazy pack data (src/config/mocapData.<pack>.js, registered when a pack loads): events baked
//   by scripts/clip-events.mjs from the motion itself;
// - the preloaded mocap clips: MOCAP_DATA (root, reach) plus CLIP_EVENTS (src/config/clipEvents.js);
// - the code-authored strikes (src/actors/strikes.js STRIKE_BEATS): contact and limb only, so the
//   other events are derived from the contact the way the bake script places them;
// - anything else (an old reaction clip, a locomotion loop): `recover` near the end.
// Pure apart from the registry; the derived records are cached, so a lookup per frame is free.
import { MOCAP_DATA } from '../config/mocapData.js';
import { CLIP_EVENTS } from '../config/clipEvents.js';
import { STRIKE_BEATS } from '../actors/strikes.js';

const packs = new Map(); // clip name -> pack record (MOCAP_DATA shape + kind/loop/events)
const cache = new Map();
const durations = new Map(); // clip name -> seconds, for clips only the mixer knows

// Adds a loaded pack's data (loadAnimPack().data). A pack never replaces a preloaded clip's
// record: mergePackClips keeps the preloaded clip too, so the two must agree.
export function registerClipData(data) {
  if (!data) return;
  for (const [name, d] of Object.entries(data)) {
    if (MOCAP_DATA[name] || packs.has(name)) continue;
    packs.set(name, d);
    cache.delete(name);
  }
}
// The duration of a clip with no data of its own (code-authored reactions, poses): the graph
// learns it from the AnimationClip the first time it plays one.
export function noteDuration(name, seconds) {
  if (!durations.has(name) && Number.isFinite(seconds)) { durations.set(name, seconds); cache.delete(name); }
}
export const hasPackClip = (name) => packs.has(name);

const r4 = (v) => Math.round(v * 1e4) / 1e4;

// Events for a strike known only by its contact frame: wind-up starts a beat before, the cancel
// window opens a quarter of the way back, recovery at about two thirds of the follow-through.
export function deriveStrikeEvents(duration, contact) {
  const tail = Math.max(0.05, duration - contact);
  return {
    kind: 'strike', end: duration,
    warpStart: r4(Math.max(0, contact - 0.2)),
    contact,
    cancel: r4(Math.min(duration, contact + Math.max(0.06, tail * 0.25))),
    recover: r4(Math.min(duration, contact + tail * 0.65)),
    footL: [], footR: [],
  };
}

function build(name) {
  const p = packs.get(name);
  if (p) {
    const ev = { footL: [], footR: [], ...(p.events ?? {}) };
    ev.end ??= p.duration;
    ev.kind = p.kind ?? (ev.contact !== undefined ? 'strike' : 'action');
    if (ev.kind === 'strike' && ev.contact === undefined) ev.contact = p.contact;
    return { name, duration: p.duration, contact: p.contact, limb: p.limb, reach: p.reach, root: p.root ?? null, fps: p.fps ?? 30, kind: ev.kind, loop: !!p.loop, events: ev, pair: p.pair ?? null, source: 'pack' };
  }
  const m = MOCAP_DATA[name];
  if (m) {
    const base = CLIP_EVENTS[name];
    const ev = base ? { footL: [], footR: [], ...base } : deriveStrikeEvents(m.duration, m.contact);
    if (!base) ev.kind = 'strike';
    return { name, duration: m.duration, contact: m.contact, limb: m.limb, reach: m.reach, root: m.root ?? null, fps: m.fps ?? 30, kind: ev.kind, loop: ev.kind === 'loop' || ev.kind === 'loco', events: ev, pair: null, source: 'mocap' };
  }
  const b = STRIKE_BEATS[name];
  if (b) {
    const ev = deriveStrikeEvents(b.duration, b.contact);
    return { name, duration: b.duration, contact: b.contact, limb: b.limb, reach: null, root: null, fps: 0, kind: 'strike', loop: false, events: ev, pair: null, source: 'code' };
  }
  const d = durations.get(name);
  if (d === undefined) return null;
  return { name, duration: d, contact: null, limb: null, reach: null, root: null, fps: 0, kind: 'action', loop: false, events: { kind: 'action', end: d, recover: r4(d * 0.85), footL: [], footR: [] }, pair: null, source: 'derived' };
}

// The record for a clip, or null when nothing is known about it yet.
export function clipInfo(name) {
  if (!name) return null;
  let r = cache.get(name);
  if (r === undefined) {
    r = build(name);
    if (r) cache.set(name, r);
  }
  return r ?? null;
}

// One event's clip time (null when the clip has no such event).
export function eventTime(name, ev) {
  const t = clipInfo(name)?.events?.[ev];
  return typeof t === 'number' ? t : null;
}

// For tests: forget registered packs and learned durations.
export function resetClipRegistry() { packs.clear(); cache.clear(); durations.clear(); }
