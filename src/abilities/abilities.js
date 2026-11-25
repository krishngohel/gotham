// [onboard] The ability layer: which capabilities a campaign has unlocked. Pure (no DOM, no THREE).
//
//   createAbilityState({ mode, unlocked })   the live set: has(id), unlock(ids), list(),
//                                            snapshot() / apply(snap) for replication (online co-op)
//   deriveUnlocked(progress, { steps })       what a save has earned from its story progress alone:
//                                            the start kit, every Night One grant at or before its
//                                            step (all of them once Night One is finished), and
//                                            each campaign night's grants from campaign.night /
//                                            nightsDone / missionsDone. Old saves need nothing more.
//   abilityModeFromParams(params)             'story' | 'all' | 'none' from the URL:
//                                            ?abilities=all|none|story wins; else ?god=1 or
//                                            ?fight=test (sandboxes) are 'all'; everything else,
//                                            including `npm run dev`, plays the story's gates.
//   ALL_ABILITIES                             has() is always true: what combat and the hero use
//                                            when nobody supplied a state (unit tests, tools).
import { ABILITIES, ABILITY_IDS, GATED_IDS, START_KIT, TRAVERSAL_IDS, abilityById } from './abilityDefs.js';

export const ABILITY_MODES = Object.freeze(['story', 'all', 'none']);

export const ALL_ABILITIES = Object.freeze({ mode: 'all', has: () => true, list: () => [...ABILITY_IDS] });

export function abilityModeFromParams(params) {
  const p = params && typeof params.get === 'function' ? params : new URLSearchParams(params ?? '');
  const explicit = p.get('abilities');
  if (ABILITY_MODES.includes(explicit)) return explicit;
  if (p.get('god') === '1' || p.get('fight') === 'test') return 'all';
  return 'story';
}

// The Night One step index of a grant (-1: not a Night One grant or the step is unknown).
const stepIndexOf = (steps, id) => steps.findIndex((s) => s.id === id);

// Ids a save has earned. progress: { step, stepId, finished, campaign }. steps: Night One's list.
// nightOrder: campaign play order. missionsOf(night): [{ id, steps: [stepId] }] in order (optional:
// a `?night=n2&at=<step>` start, or a save inside a night, counts the missions before its step as
// done even though missionsDone was never written for them).
export const NIGHT_ORDER = Object.freeze(Array.from({ length: 12 }, (_, i) => `n${i + 1}`)); // campaign play order (n9 is the finale)
export function deriveUnlocked(progress = {}, { steps = [], nightOrder = NIGHT_ORDER, missionsOf = null } = {}) {
  const out = new Set(START_KIT);
  const finished = !!progress.finished;
  // Night One's place: its step id first (indices shift when steps are added), the index otherwise.
  let at = typeof progress.stepId === 'string' ? stepIndexOf(steps, progress.stepId) : -1;
  if (at < 0 && Number.isInteger(progress.step)) at = progress.step;
  const camp = progress.campaign ?? {};
  const nightsDone = new Set(camp.nightsDone ?? []);
  const missionsDone = new Set(camp.missionsDone ?? []);
  const current = typeof camp.night === 'string' ? camp.night : 'n1';
  const order = (n) => nightOrder.indexOf(n);
  // Past Night One, the night in play has begun, and every night before it is behind her.
  const inCampaign = finished && current !== 'n1';
  const behind = (n) => nightsDone.has(n) || (inCampaign && order(n) >= 0 && order(n) < order(current));
  const begun = (n) => behind(n) || (inCampaign && n === current);
  // Missions of the night in play that come before its saved step.
  if (inCampaign && missionsOf && typeof camp.stepId === 'string') {
    for (const m of missionsOf(current) ?? []) {
      if (m.steps?.includes(camp.stepId)) break;
      missionsDone.add(`${current}.${m.id}`);
    }
  }
  for (const a of ABILITIES) {
    const g = a.grant;
    if (!g || g === 'start' || a.gadget) continue;
    if (g.step) {
      const i = stepIndexOf(steps, g.step);
      if (finished || nightsDone.has('n1') || (i >= 0 && at >= i)) out.add(a.id);
    } else if (g.night) {
      if (behind(g.night)) out.add(a.id);
      else if (g.after ? missionsDone.has(`${g.night}.${g.after}`) : begun(g.night)) out.add(a.id);
    }
  }
  // Ability rewards a night emitted ('ability:<id>' in campaign.rewards).
  for (const r of camp.rewards ?? []) if (typeof r === 'string' && r.startsWith('ability:') && abilityById(r.slice(8))) out.add(r.slice(8));
  return out;
}

// The grants a Night One step hands over as it begins.
export const grantsForStep = (stepId) => ABILITIES.filter((a) => a.grant?.step === stepId).map((a) => a.id);
// The grants a campaign night hands over as it starts, or once a mission in it is done.
export const grantsForNight = (night) => ABILITIES.filter((a) => a.grant?.night === night && !a.grant.after).map((a) => a.id);
export const grantsForMission = (night, mission) => ABILITIES.filter((a) => a.grant?.night === night && a.grant.after === mission).map((a) => a.id);

// The live set. `mode` 'all' answers yes to everything; 'none' only the bare movement it needs so a
// test can never soft-lock (move, ledge); 'story' the unlocked list.
export function createAbilityState({ mode = 'story', unlocked = START_KIT } = {}) {
  const open = new Set(unlocked.filter((id) => GATED_IDS.includes(id) || abilityById(id)));
  let m = ABILITY_MODES.includes(mode) ? mode : 'story';
  const listeners = new Set();
  const NONE = new Set(['move', 'ledge']);
  // Gadgets are the gadget system's (src/gadgets): asked through this source when one is set.
  let gadgetSource = null;
  // A scripted temporary lock (a step's `locks`): ids switched off for a while, whatever the mode.
  const suspended = new Set();
  let suspendReason = null;
  const api = {
    get mode() { return m; },
    set mode(v) { if (ABILITY_MODES.includes(v)) { m = v; for (const f of listeners) f({ ids: [], mode: m }); } },
    has(id) {
      if (suspended.size && (suspended.has(id) || (id.startsWith('gadget.') && suspended.has('gadgets')))) return false;
      if (m === 'all') return true;
      if (m === 'none') return NONE.has(id);
      // Unknown ids (a kit's own signature move) are never this layer's to block.
      const def = abilityById(id);
      if (!def) return true;
      if (def.gadget) return gadgetSource ? !!gadgetSource(id.slice(7)) : true;
      return open.has(id);
    },
    // Adds ids; returns the ones that were new (in definition order).
    unlock(ids) {
      const fresh = [];
      for (const id of Array.isArray(ids) ? ids : [ids]) if (abilityById(id) && !open.has(id)) { open.add(id); fresh.push(id); }
      if (fresh.length) for (const f of listeners) f({ ids: fresh, mode: m });
      return fresh;
    },
    list: () => [...ABILITY_IDS],
    setGadgetSource(fn) { gadgetSource = typeof fn === 'function' ? fn : null; },
    get unlocked() { return ABILITY_IDS.filter((id) => open.has(id)); },
    // Replication (src/net): the host's state, sent to a guest, applied whole. Gadgets travel with
    // the gadget system's own state, not here.
    snapshot: () => ({ mode: m, unlocked: GATED_IDS.filter((id) => open.has(id)), suspended: [...suspended].sort(), reason: suspendReason }),
    // A scripted lock: these ids stop working (even in 'all' mode: the story asked) until resume().
    suspend(ids, reason = null) {
      for (const id of ids) if (abilityById(id)) suspended.add(id);
      suspendReason = reason;
      for (const f of listeners) f({ ids: [], mode: m, suspended: [...suspended] });
    },
    resume() {
      if (!suspended.size) return false;
      suspended.clear();
      suspendReason = null;
      for (const f of listeners) f({ ids: [], mode: m, suspended: [] });
      return true;
    },
    get suspended() { return [...suspended]; },
    get suspendReason() { return suspendReason; },
    apply(snap) {
      if (!snap || typeof snap !== 'object') return false;
      if (ABILITY_MODES.includes(snap.mode)) m = snap.mode;
      const next = new Set((Array.isArray(snap.unlocked) ? snap.unlocked : []).filter((id) => abilityById(id)));
      const fresh = [...next].filter((id) => !open.has(id));
      open.clear();
      for (const id of next) open.add(id);
      suspended.clear();
      for (const id of Array.isArray(snap.suspended) ? snap.suspended : []) if (abilityById(id)) suspended.add(id);
      suspendReason = typeof snap.reason === 'string' ? snap.reason.slice(0, 200) : null;
      for (const f of listeners) f({ ids: fresh, mode: m, applied: true });
      return true;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
  return api;
}

// The persisted part (progress.abilities): unlocked ids beyond what the story derives (rewards a
// night emitted, a replay's grants) and which teaching beats were practised. Sanitized.
const ID = /^[a-zA-Z][a-zA-Z0-9.]{0,40}$/;
export const ABILITY_SAVE_DEFAULT = Object.freeze({ unlocked: [], practised: {} });
export function sanitizeAbilitySave(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const unlocked = Array.isArray(r.unlocked) ? [...new Set(r.unlocked.filter((s) => typeof s === 'string' && ID.test(s) && abilityById(s)))] : [];
  const practised = {};
  if (r.practised && typeof r.practised === 'object' && !Array.isArray(r.practised)) {
    for (const [k, v] of Object.entries(r.practised)) if (abilityById(k) && Number.isFinite(v) && v > 0) practised[k] = Math.min(99, Math.floor(v));
  }
  return { unlocked, practised };
}

export { TRAVERSAL_IDS };
