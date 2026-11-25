// What online co-op keeps in the save (workstream D2), and the guest's save rule.
//
// Save rule (design 4.4 amendment; research §4 "Host leaves"): a guest keeps the XP, unlocks and
// collectibles it earns in the host's world, but story steps completed there never advance the
// guest's own story. The guest's run writes its progress through guestStorage(), which puts the
// guest's own story fields back before anything reaches localStorage.
//
// `online` (registered field): how many online sessions this save has played and the furthest
// story step it has seen in someone else's world (the "completed in co-op" marker).
import { registerProgressField } from '../core/save.js';

export const PROGRESS_KEY = 'gotham-progress-v1';
// The story's own fields: never taken from a session in someone else's world.
// [net2] With the campaign: the later nights' place (campaign), the double life (bruce: never run
// on a guest, never taken from the host's world) and the world clock (env: the host's hour).
export const STORY_FIELDS = ['step', 'stepId', 'finished', 'seenIntro', 'milestone', 'campaign', 'bruce', 'env'];

export function sanitizeOnline(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const int = (v) => (Number.isInteger(v) && v >= 0 && v < 1e6 ? v : 0);
  return { sessions: int(r.sessions), hostedSteps: int(r.hostedSteps), guestBestStep: int(r.guestBestStep) };
}

let registered = false;
export function registerOnlineSave() {
  if (registered) return;
  registered = true;
  registerProgressField('online', { sanitize: sanitizeOnline });
}
registerOnlineSave();

// A storage for the guest's run: reads pass through; a progress write keeps the guest's own story
// fields (from `own`, its save as it was before the session) and records the furthest step seen.
export function guestStorage(real, own) {
  const keep = {};
  for (const k of STORY_FIELDS) if (own && k in own) keep[k] = own[k];
  return {
    getItem: (k) => real?.getItem(k) ?? null,
    removeItem: (k) => real?.removeItem?.(k),
    setItem(k, v) {
      if (k !== PROGRESS_KEY) { real?.setItem(k, v); return; }
      let p;
      try { p = JSON.parse(v); } catch { return; }
      if (!p || typeof p !== 'object') return;
      const seen = Number.isInteger(p.step) ? p.step : 0;
      for (const f of STORY_FIELDS) { if (f in keep) p[f] = keep[f]; else delete p[f]; }
      p.online = sanitizeOnline(p.online);
      p.online.guestBestStep = Math.max(p.online.guestBestStep, seen);
      real?.setItem(k, JSON.stringify(p));
    },
  };
}
