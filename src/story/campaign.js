// The campaign: acts -> nights -> missions -> steps (docs/design/story-format.md is the contract).
// Pure data and lookups, no DOM, no three.js. Night files are plain data registered through
// ./nights/index.js; other workstreams hook in through the registries at the bottom (Bruce-day
// scenes, side missions and cases) without touching a night file.
//
// The research doc's act table (city-and-content.md 6.1) is the spine. Night One is the existing
// story, unchanged in content. Acts II and III are written here (workstream J1); Acts IV and V are
// reserved for the second story workstream, which appends nights to ACTS[3] / ACTS[4] by
// registering them with an `act` id.
import { matches } from '../game/objectives.js';

export const ACTS = [
  { id: 'act1', number: 1, title: 'The Long Night', nights: [] },
  { id: 'act2', number: 2, title: 'The Gilded City', nights: [] },
  { id: 'act3', number: 3, title: 'The Underside', nights: [] },
  { id: 'act4', number: 4, title: 'The Cold Front', nights: [] },
  { id: 'act5', number: 5, title: 'Arkham', nights: [] },
];

// Step ids are saved (progress.campaign.stepId), so they follow the save's id rule.
export const STEP_ID = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
// Every step type the flow and the story runtime understand (docs/design/story-format.md 3).
export const STEP_TYPES = [
  // Night One's (src/game/flow.js)
  'reach', 'cutscene', 'fight', 'collect', 'boss', 'credits', 'radio', 'chase', 'battle', 'armada', 'courier', 'ally', 'board', 'interior',
  // the campaign's (src/story/stepTypes.js)
  'scan', 'traverse', 'puzzle', 'fork', 'fear', 'nightEnd', 'wait',
  // [story2] the double life inside the nights (src/story/lifeSteps.js)
  'life', 'dilemma', 'civvy',
];

const NIGHTS = new Map();
const FLAT = new Map();

// Adds a night (a night file's default export) to the campaign, in its act, in number order.
export function registerNight(night) {
  if (!night?.id || !STEP_ID.test(night.id)) throw new Error(`night id ${night?.id}`);
  if (NIGHTS.has(night.id)) throw new Error(`night ${night.id} registered twice`);
  const act = ACTS.find((a) => a.id === night.act);
  if (!act) throw new Error(`night ${night.id}: unknown act ${night.act}`);
  NIGHTS.set(night.id, night);
  FLAT.delete(night.id);
  act.nights.push(night.id);
  act.nights.sort((a, b) => (NIGHTS.get(a).number ?? 0) - (NIGHTS.get(b).number ?? 0));
  return night;
}
// Tests only: forget a night (so a test can register a throwaway one).
export function unregisterNight(id) {
  NIGHTS.delete(id);
  FLAT.delete(id);
  for (const a of ACTS) a.nights = a.nights.filter((n) => n !== id);
}

export const nightById = (id) => NIGHTS.get(id) ?? null;
export const allNights = () => nightOrder().map((id) => NIGHTS.get(id));
// Play order: act by act, each act's nights by number.
export const nightOrder = () => ACTS.flatMap((a) => a.nights);
export function nextNight(id) {
  const order = nightOrder();
  const i = order.indexOf(id);
  return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
}
export const actOf = (nightId) => ACTS.find((a) => a.nights.includes(nightId)) ?? null;

// A night's missions flattened into one step list. Each step gets `mission` (its mission's id)
// and the first step of a mission gets the mission's checkpoint when it has none of its own.
// Night One's wrapper (nights/n1.js) hands back the original STEPS objects untouched.
export function stepsOf(night) {
  if (typeof night === 'string') night = nightById(night);
  if (!night) return [];
  if (FLAT.has(night.id)) return FLAT.get(night.id);
  const out = night.flatSteps ?? night.missions.flatMap((m) => m.steps.map((s, i) => ({
    ...s,
    mission: m.id,
    ...(i === 0 && m.checkpoint && !s.checkpoint ? { checkpoint: m.checkpoint } : {}),
  })));
  FLAT.set(night.id, out);
  return out;
}
export const missionsOf = (night) => (typeof night === 'string' ? nightById(night) : night)?.missions ?? [];
export function missionById(night, id) { return missionsOf(night).find((m) => m.id === id) ?? null; }

// The mission-select list for the Batcomputer (workstream K/L draw it): every mission of every
// night the save has reached, with whether it is done and whether it can be replayed.
export function missionSelect(campaign = {}) {
  const reached = new Set([...(campaign.nightsDone ?? []), campaign.night ?? 'n1']);
  const done = new Set(campaign.missionsDone ?? []);
  const out = [];
  for (const night of allNights()) {
    if (!reached.has(night.id)) continue;
    for (const m of night.missions) {
      const key = `${night.id}.${m.id}`;
      out.push({ night: night.id, nightTitle: night.title, mission: m.id, title: m.title, done: done.has(key), replayable: m.replayable !== false && done.has(key) });
    }
  }
  return out;
}

// Every named site a night needs (its steps, fights and rooms), for the world workstreams: a
// district rebuild must keep these ids (or tell the story) so the night still resolves.
export function requiredSites(night) {
  if (typeof night === 'string') night = nightById(night);
  if (!night) return [];
  const out = new Set();
  const add = (v) => { if (typeof v === 'string') out.add(v); };
  for (const s of stepsOf(night)) {
    for (const k of ['site', 'checkpoint', 'at', 'to', 'face', 'placeAt']) add(s[k]);
    for (const p of s.points ?? []) add(p.site ?? p.at);
    for (const g of s.gates ?? []) add(g);
    for (const p of s.plates ?? []) add(p.site ?? p.at);
    for (const o of [...(s.options ?? []), ...(s.optional ?? [])]) add(o.site);
    for (const i of s.interrupts ?? []) add(i.at);
  }
  for (const f of Object.values(night.fights ?? {})) add(f.site);
  for (const r of Object.values(night.rooms ?? {})) { add(r.site); add(r.entry); }
  return [...out].filter((id) => !night.sites?.[id]);
}

// Every event that can finish a step of this type (for the completability check: a step whose
// type has no finishing event could never end). Mirrors objectives.js matches().
export function canFinish(step) {
  const probe = {
    cutscene: { type: 'cutsceneDone', scene: step.scene }, fight: { type: 'fightDone', id: step.fight },
    collect: { type: 'collected', item: step.item }, boss: { type: 'bossDone' }, radio: { type: 'radioDone', id: step.id },
    chase: { type: 'chaseDone' }, battle: { type: 'battleDone' }, armada: { type: 'armadaDone' },
    courier: { type: 'courierDone', id: step.id }, ally: { type: 'allyDone', id: step.id }, board: { type: 'boardDone', id: step.id },
  }[step.type ?? 'reach'] ?? { type: 'reached', step: step.id };
  return matches(step, probe) || matches(step, { type: 'stepDone', id: step.id });
}

// ---------------------------------------------------------------- hooks for other workstreams

// Bruce-day scenes (workstream K). A night declares `day: { hook, context }`; when the night is
// about to begin, the runtime awaits the registered function (or plays the night's own fallback
// lines when nothing is registered). fn(ctx) -> Promise; ctx = { night, context, game, progress }.
const DAY_HOOKS = new Map();
export function registerDayHook(id, fn) { DAY_HOOKS.set(id, fn); return () => DAY_HOOKS.delete(id); }
export const dayHook = (id) => DAY_HOOKS.get(id) ?? null;

// Side missions and detective cases (workstream J3). `def` = { id, title, kind: 'side'|'case',
// after: nightId (unlocked once that night is done), district, start: siteId, run(ctx) }. The
// story never runs them itself; J3's own director lists available() and runs them in free roam.
const SIDE = new Map();
export function registerSideMission(def) {
  if (!def?.id || SIDE.has(def.id)) throw new Error(`side mission ${def?.id}`);
  SIDE.set(def.id, def);
  return () => SIDE.delete(def.id);
}
export function sideMissionsAvailable(campaign = {}) {
  const done = new Set(campaign.nightsDone ?? []);
  return [...SIDE.values()].filter((m) => !m.after || done.has(m.after));
}

// Rewards (workstream L1 grants them): the story only emits ids. The event name and id shape:
//   events.emit('storyReward', { id: 'gadget:disruptor', night: 'n2', mission: 'm2Lounge', step })
// Ids are 'kind:name' with kind one of gadget, skill, suit, upgrade, xp (xp:250), lore.
export const REWARD_EVENT = 'storyReward';
export const REWARD_KINDS = ['gadget', 'skill', 'suit', 'upgrade', 'xp', 'lore', 'ability']; // [onboard] 'ability:<id>' (src/abilities/abilityDefs.js)
export const isRewardId = (id) => typeof id === 'string' && REWARD_KINDS.includes(id.split(':')[0]) && id.split(':')[1]?.length > 0;
