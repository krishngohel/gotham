// The double life as rules (workstream K, Long Night 2; design doc sections 7 and 8, research
// doc 7.2). Pure: no three.js, no DOM, no clock of its own. Everything here takes the state object
// and returns what changed, so the HUD can show cause -> effect ("-6 Standing: left the gala
// mid-toast") and the tests can assert it.
//
// THE STATE (progress.bruce, saved through registerProgressField in ./save.js)
//   day          the calendar day index the state was last advanced to
//   standing     0..100  Bruce's standing: the board, the press, the people who care about him
//   city         0..100  how the city is holding (100 = quiet streets); Batman work raises it
//   fatigue      0..100  shared by both lives: long nights raise it, sleep lowers it
//   suspicion    { reporter, detective, villain }  0..100 per watcher
//   excuses      { [excuseId]: { n, who: [personId...] } }  every cover story told, and to whom
//   threads      { alfred, gordon, ward, love, lucius, reporter, detective }  rank 0..5 (fractional
//                progress; the rank is the floor)
//   patience     0..100  Alfred's patience with covering for Bruce (the breaking-point thread)
//   injuries     { bruise, lip, ribs, sling }  game hours left until healed (0 = none)
//   doors        { closed: [], opened: [] }  what missed and kept commitments changed for good
//   kept, missed commitment ids
//   credit       Wayne credit banked from Standing: what the Wayne skill branch is bought with
//   rnd          { frozen: id|null, shipped: [] }  R&D: a frozen prototype, what has shipped
//   flags        story flags set by scenes (leads, a tail on the car, an escalated crime ...)
//   fired        suspicion thresholds already turned into story events
//   log          the last few cause -> effect entries (newest last)
//
// SOFT CAPS. Standing and City are soft-capped, not unmaxable: past the soft line (80) every gain
// shrinks the closer the meter gets to 100, so it can be pushed high but never parked at the top,
// and the two push against each other through Fatigue and the daily drift (dayDrift below).
//
// NEVER BLOCK THE STORY. Nothing here fails a night. nightStart() says how a night *starts*
// (backup or none, a frozen R&D item, a tail on the car, slower stamina); dayStart() says how a day
// starts (headlines, a visit from Gordon).

export const WATCHERS = Object.freeze(['reporter', 'detective', 'villain']);
export const THREADS = Object.freeze(['alfred', 'gordon', 'ward', 'love', 'lucius', 'reporter', 'detective']);
export const INJURIES = Object.freeze(['bruise', 'lip', 'ribs', 'sling']);
export const METERS = Object.freeze({
  standing: Object.freeze({ min: 0, max: 100, soft: 80, label: 'Standing' }),
  city: Object.freeze({ min: 0, max: 100, soft: 80, label: 'City' }),
  fatigue: Object.freeze({ min: 0, max: 100, soft: 85, label: 'Fatigue' }),
  patience: Object.freeze({ min: 0, max: 100, soft: 100, label: "Alfred's patience" }),
});
// Options tagged 'sharp' (the clever line, the forged survey) grey out from this Fatigue up.
export const SHARP_FATIGUE = 60;
// Suspicion thresholds and the story event each one raises (never a game over).
export const SUSPICION_EVENTS = Object.freeze({
  reporter: Object.freeze([[40, 'reporterQuestions'], [70, 'reporterInterview'], [90, 'reporterStory']]),
  detective: Object.freeze([[40, 'detectiveNotes'], [70, 'detectiveTail'], [90, 'detectiveVisit']]),
  villain: Object.freeze([[40, 'villainHint'], [70, 'villainNote'], [90, 'villainTarget']]),
});
// Which watcher hears about an excuse told to a person (gossip travels).
const WATCHER_OF = { reporter: 'reporter', detective: 'detective', villain: 'villain', penguin: 'villain', gordon: 'detective', board: 'reporter', press: 'reporter', mayor: 'reporter', guest: 'reporter', love: 'reporter', nurse: 'reporter' };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function createDoubleLife(overrides = {}) {
  return {
    v: 1, day: 0,
    standing: 55, city: 50, fatigue: 20,
    suspicion: { reporter: 5, detective: 5, villain: 0 },
    excuses: {},
    threads: { alfred: 3, gordon: 2, ward: 2, love: 1, lucius: 2, reporter: 0, detective: 0 },
    patience: 80,
    injuries: { bruise: 0, lip: 0, ribs: 0, sling: 0 },
    doors: { closed: [], opened: [] },
    kept: [], missed: [],
    credit: 0,
    rnd: { frozen: null, shipped: [] },
    flags: {},
    fired: [],
    lastNight: null,
    scenes: {},
    log: [],
    ...overrides,
  };
}

// A gain past the soft line approaches the max without reaching it; losses are plain.
export function softAdd(v, d, { min = 0, max = 100, soft = 80 } = {}) {
  v = num(v);
  if (!(d > 0)) return clamp(v + num(d), min, max);
  let left = d;
  if (v < soft) { const step = Math.min(left, soft - v); v += step; left -= step; }
  if (left > 0) v = max - (max - v) * Math.exp(-left / (max - soft || 1));
  return clamp(v, min, max);
}

function logIt(state, entry) {
  state.log.push(entry);
  if (state.log.length > 16) state.log.splice(0, state.log.length - 16);
}

// Applies an effects object; returns the list of changes [{ what, before, after, delta, reason }].
//   effects = { standing, city, fatigue, patience: number deltas,
//               suspicion: { watcher: delta }, threads: { id: delta },
//               injuries: { kind: hours | false }, flags: { k: v | null },
//               open: [doorId], close: [doorId], credit: delta, freeze: rndId | null }
// [verify] The Wayne skill branch's effects on the double life (docs/design/progression.md 2:
// alfredAlibis suspicionMult, nightNurse fatigueRecovery): src/bruce/runtime.js points this at the
// run's live effects object. Rises in suspicion are scaled by suspicionMult, falls in fatigue by
// fatigueRecovery. No provider (tests, the title): both are 1.
let lifeMods = () => null;
export function setLifeModifiers(fn) {
  lifeMods = typeof fn === 'function' ? fn : () => null;
  return () => { if (lifeMods === fn) lifeMods = () => null; };
}
const modOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(4, v) : 1);

export function applyEffects(state, effects = {}, reason = '') {
  const out = [];
  const mods = lifeMods() ?? {}; // [verify]
  const suspicionK = modOf(mods.suspicionMult), fatigueK = modOf(mods.fatigueRecovery); // [verify]
  const note = (what, before, after) => {
    const delta = Math.round((after - before) * 10) / 10;
    if (delta === 0) return;
    const e = { what, before: Math.round(before * 10) / 10, after: Math.round(after * 10) / 10, delta, reason };
    out.push(e);
    logIt(state, e);
  };
  for (const m of ['standing', 'city', 'fatigue', 'patience']) {
    if (typeof effects[m] !== 'number') continue;
    const before = state[m];
    state[m] = softAdd(before, m === 'fatigue' && effects[m] < 0 ? effects[m] * fatigueK : effects[m], METERS[m]); // [verify] fatigueRecovery
    note(m, before, state[m]);
  }
  for (const [w, d] of Object.entries(effects.suspicion ?? {})) {
    if (!WATCHERS.includes(w)) continue;
    const before = state.suspicion[w];
    state.suspicion[w] = clamp(before + (num(d) > 0 ? num(d) * suspicionK : num(d)), 0, 100); // [verify] suspicionMult
    note(`suspicion.${w}`, before, state.suspicion[w]);
  }
  for (const [t, d] of Object.entries(effects.threads ?? {})) {
    if (!THREADS.includes(t)) continue;
    const before = state.threads[t];
    state.threads[t] = clamp(before + num(d), 0, 5);
    note(`thread.${t}`, before, state.threads[t]);
  }
  for (const [k, h] of Object.entries(effects.injuries ?? {})) {
    if (!INJURIES.includes(k)) continue;
    const before = state.injuries[k];
    state.injuries[k] = h === false ? 0 : Math.max(before, num(h));
    note(`injury.${k}`, before, state.injuries[k]);
  }
  for (const [k, v] of Object.entries(effects.flags ?? {})) {
    if (v === null || v === false) delete state.flags[k]; else state.flags[k] = v;
  }
  for (const d of effects.open ?? []) if (!state.doors.opened.includes(d)) { state.doors.opened.push(d); out.push({ what: `door.${d}`, delta: 1, reason }); }
  for (const d of effects.close ?? []) if (!state.doors.closed.includes(d)) { state.doors.closed.push(d); out.push({ what: `door.${d}`, delta: -1, reason }); }
  if (typeof effects.credit === 'number') { const b = state.credit; state.credit = Math.max(0, b + effects.credit); note('credit', b, state.credit); }
  if ('freeze' in effects) state.rnd.frozen = effects.freeze ?? null;
  if (effects.ship && !state.rnd.shipped.includes(effects.ship)) { state.rnd.shipped.push(effects.ship); out.push({ what: `rnd.${effects.ship}`, delta: 1, reason }); }
  if (state.patience <= 0 && !state.flags.alfredBreak) { state.flags.alfredBreak = true; out.push({ what: 'alfredBreak', delta: 1, reason }); }
  return out;
}

export const threadRank = (state, id) => Math.floor(clamp(num(state.threads?.[id]), 0, 5));
export const injured = (state) => INJURIES.some((k) => state.injuries[k] > 0);
// What setInjuries() on the Bruce model wants: booleans.
export function injuryLook(state) {
  const o = {};
  for (const k of INJURIES) o[k] = state.injuries[k] > 0;
  return o;
}
// Injuries someone across a table would see in this outfit (ribs only show bare-chested).
export function visibleInjuries(state, outfit = 'suit') {
  return INJURIES.filter((k) => state.injuries[k] > 0 && (k !== 'ribs' || outfit === 'training'));
}

// ---- excuses: remembered by id and by who heard them ----
// First telling to someone: free (+2 if the injury is plainly visible). The same excuse again to
// the same person: +12 to that watcher. A third telling anywhere: the Gazette has a running joke
// (+20 reporter, flag excuseJoke.<id>). Told to a new person after two uses: +5 (gossip).
export function useExcuse(state, excuseId, who = 'guest', { visible = false } = {}) {
  const rec = (state.excuses[excuseId] ??= { n: 0, who: [] });
  const watcher = WATCHER_OF[who] ?? 'reporter';
  const heardBefore = rec.who.includes(who);
  rec.n += 1;
  if (!heardBefore) rec.who.push(who);
  let delta = 0, joke = false;
  if (rec.n >= 3) { delta = 20; joke = true; }
  else if (heardBefore) delta = 12;
  else if (rec.n === 2) delta = 5;
  if (visible) delta += 2;
  const effects = { suspicion: { [watcher]: delta } };
  if (joke) effects.flags = { [`excuseJoke.${excuseId}`]: true };
  const changes = applyEffects(state, effects, `excuse "${excuseId}" (${rec.n === 1 ? 'first time' : `told ${rec.n} times`})`);
  return { watcher, delta, count: rec.n, heardBefore, joke, changes };
}
// How worn an excuse is for a person: 'fresh' | 'heard' | 'worn' (the UI greys a worn one).
export function excuseWear(state, excuseId, who) {
  const rec = state.excuses?.[excuseId];
  if (!rec) return 'fresh';
  if (rec.n >= 2 || rec.who.includes(who)) return 'worn';
  return 'heard';
}

// ---- dialogue gating ----
// option.req = { fatigueBelow, standingAbove, cityBelow, thread: { id: rank }, outfit: [ids],
//                flag: name, noFlag: name, injured: bool }. option.tag 'sharp' greys at
// SHARP_FATIGUE. Returns { ok, reason }: a greyed option is still shown, with the reason.
export function optionAvailable(state, option, ctx = {}) {
  const r = option.req ?? {};
  if (option.tag === 'sharp' && state.fatigue >= SHARP_FATIGUE) return { ok: false, reason: 'Too tired to think of it' };
  if (typeof r.fatigueBelow === 'number' && state.fatigue >= r.fatigueBelow) return { ok: false, reason: 'Too tired' };
  if (typeof r.standingAbove === 'number' && state.standing <= r.standingAbove) return { ok: false, reason: 'Not enough standing' };
  if (typeof r.cityBelow === 'number' && state.city >= r.cityBelow) return { ok: false, reason: 'The city is quiet' };
  for (const [id, rank] of Object.entries(r.thread ?? {})) if (threadRank(state, id) < rank) return { ok: false, reason: `Needs a closer bond (${id})` };
  if (Array.isArray(r.outfit) && ctx.outfit && !r.outfit.includes(ctx.outfit)) return { ok: false, reason: 'Wrong clothes for it' };
  if (r.flag && !state.flags[r.flag]) return { ok: false, reason: 'You do not know that yet' };
  if (r.noFlag && state.flags[r.noFlag]) return { ok: false, reason: 'Already done' };
  if (r.injured === true && !injured(state)) return { ok: false, reason: 'Nothing to explain' };
  if (option.excuse && ctx.who && excuseWear(state, option.excuse, ctx.who) === 'worn') return { ok: true, reason: 'They have heard this one', worn: true };
  return { ok: true, reason: '' };
}

// ---- the night follows you into the day ----
// report = { endHour (0..12 = past midnight), hits, finishers, crimesStopped, crimesIgnored,
//            injuries: { kind: hours } (explicit), district }
export function applyNight(state, report = {}) {
  const end = num(report.endHour, 2);
  const hits = num(report.hits);
  const effects = {
    fatigue: 10 + clamp(end, 0, 8) * 6 + Math.min(20, hits * 1.5),
    city: num(report.crimesStopped) * 3 - num(report.crimesIgnored) * 5 + (report.storyWon ? 6 : 0),
    injuries: { ...(report.injuries ?? {}) },
  };
  // Hits taken leave marks Bruce has to explain at breakfast.
  if (hits >= 4) effects.injuries.bruise = Math.max(effects.injuries.bruise ?? 0, 30);
  if (hits >= 8) effects.injuries.lip = Math.max(effects.injuries.lip ?? 0, 24);
  if (hits >= 12) effects.injuries.ribs = Math.max(effects.injuries.ribs ?? 0, 60);
  state.lastNight = { endHour: end, hits, finishers: num(report.finishers), crimesStopped: num(report.crimesStopped), crimesIgnored: num(report.crimesIgnored), district: typeof report.district === 'string' ? report.district : null, storyWon: !!report.storyWon };
  return applyEffects(state, effects, `the night ended at ${String(Math.floor(end)).padStart(2, '0')}:${String(Math.round((end % 1) * 60)).padStart(2, '0')}`);
}

// Game hours pass: injuries mend (twice as fast in the medical bay).
export function passTime(state, hours, { medbay = false } = {}) {
  const h = Math.max(0, num(hours)) * (medbay ? 2 : 1);
  for (const k of INJURIES) state.injuries[k] = Math.max(0, state.injuries[k] - h);
}

export function sleep(state, hours) {
  const h = clamp(num(hours), 0, 12);
  passTime(state, h);
  return applyEffects(state, { fatigue: -h * 9 }, `slept ${h} hour${h === 1 ? '' : 's'}`);
}

// Alfred patches a wound in the medical bay: an injury healed now, at a little of his patience.
export function patchUp(state) {
  const worst = INJURIES.filter((k) => state.injuries[k] > 0).sort((a, b) => state.injuries[b] - state.injuries[a])[0];
  if (!worst) return { healed: null, changes: [] };
  const changes = applyEffects(state, { injuries: { [worst]: false }, patience: -2, threads: { alfred: 0.2 }, fatigue: -4 }, `Alfred patched the ${worst}`);
  return { healed: worst, changes };
}

// ---- commitments ----
export function keepCommitment(state, c) {
  if (!state.kept.includes(c.id)) state.kept.push(c.id);
  return applyEffects(state, { standing: c.standing ?? 5, threads: c.thread ? { [c.thread]: 0.5 } : {}, fatigue: 4, ...(c.keepEffects ?? {}) }, `kept: ${c.title ?? c.id}`);
}
export function missCommitment(state, c) {
  if (!state.missed.includes(c.id)) state.missed.push(c.id);
  const eff = { standing: -(Math.abs(c.miss ?? 8)), threads: c.thread ? { [c.thread]: -0.7 } : {}, ...(c.missEffects ?? {}) };
  return applyEffects(state, eff, `missed: ${c.title ?? c.id}`);
}

// ---- day and night boundaries ----
// The systems push against each other: a day with no Wayne commitment kept lets Standing slide;
// a night with no crime stopped lets the City slide; Standing banks Wayne credit.
export function dayDrift(state, { keptToday = 0, crimesLastNight = null } = {}) {
  const changes = [];
  if (!keptToday) changes.push(...applyEffects(state, { standing: -3 }, 'no Wayne commitments kept'));
  if (crimesLastNight === 0) changes.push(...applyEffects(state, { city: -4 }, 'no patrol last night'));
  const bank = Math.floor(state.standing / 20);
  if (bank) changes.push(...applyEffects(state, { credit: bank }, 'the Foundation banks your standing'));
  state.day += 1;
  return changes;
}

// How a night STARTS (never whether it can be finished).
export function nightStart(state) {
  const f = state.fatigue;
  const notes = [];
  const backup = threadRank(state, 'ward') >= 2 && !state.doors.closed.includes('ward');
  if (!backup) notes.push('No backup tonight: the ward is not answering.');
  const tail = !!state.flags.tail || state.suspicion.detective >= 70;
  if (tail) notes.push('An unmarked car has been sitting at the end of the drive since dusk.');
  const rndFrozen = state.rnd.frozen ?? (state.standing < 30 ? 'prototype' : null);
  if (rndFrozen) notes.push('Applied Sciences is frozen: the new prototype stays in its crate.');
  const staminaRegenK = f >= 80 ? 0.55 : f >= 60 ? 0.75 : f >= 40 ? 0.9 : 1;
  if (staminaRegenK < 1) notes.push(`Running on empty: stamina comes back ${Math.round((1 - staminaRegenK) * 100)}% slower.`);
  const healthK = state.injuries.ribs > 0 ? 0.85 : 1;
  if (healthK < 1) notes.push('Taped ribs: every hit lands a little harder.');
  const alfredOnComms = state.patience > 15;
  if (!alfredOnComms) notes.push('Alfred is not on the comms tonight.');
  const escalated = !!state.flags.escalated;
  if (escalated) notes.push('The crime you left at the gala has grown teeth.');
  const earlyStart = !!state.flags.earlyStart;
  if (earlyStart) notes.push('You left early: the trail is still warm.');
  const leads = Object.keys(state.flags).filter((k) => k.startsWith('lead.')).map((k) => k.slice(5));
  for (const l of leads) notes.push(`You know something: ${l}.`);
  return { backup, tail, rndFrozen, staminaRegenK, healthK, alfredOnComms, escalated, earlyStart, leads, notes };
}

// How a day STARTS: what the papers say, who is at the door.
export function dayStart(state) {
  const gordonVisit = state.city < 35;
  const reporterAtBreakfast = state.suspicion.reporter >= 40 || injured(state);
  return { gordonVisit, reporterAtBreakfast, injured: injured(state), visible: visibleInjuries(state, 'suit') };
}

// Suspicion thresholds crossed since last asked: [{ watcher, level, event }], each fired once.
export function suspicionEvents(state) {
  const out = [];
  for (const w of WATCHERS) {
    for (const [level, event] of SUSPICION_EVENTS[w]) {
      const id = `${w}.${level}`;
      if (state.suspicion[w] >= level && !state.fired.includes(id)) { state.fired.push(id); out.push({ watcher: w, level, event }); }
    }
  }
  return out;
}

// Standing buys the Wayne branch (the skill tree is another workstream's: it calls these).
export function spendCredit(state, cost, what = 'Wayne branch') {
  const c = Math.max(0, num(cost));
  if (state.credit < c) return { ok: false, credit: state.credit };
  state.credit -= c;
  logIt(state, { what: 'credit', before: state.credit + c, after: state.credit, delta: -c, reason: what });
  return { ok: true, credit: state.credit };
}
// The week's R&D budget from Standing: funds the gadget deliveries (another workstream reads it).
export const rndBudget = (state) => (state.rnd.frozen ? 0 : Math.round(state.standing * 1.2));

// ---- the save ----
const ID = /^[a-zA-Z][a-zA-Z0-9._-]{0,47}$/;
export function sanitizeDoubleLife(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const s = createDoubleLife();
  s.day = Math.max(0, Math.floor(num(r.day)));
  for (const m of ['standing', 'city', 'fatigue', 'patience']) if (typeof r[m] === 'number' && Number.isFinite(r[m])) s[m] = clamp(r[m], 0, 100);
  for (const w of WATCHERS) if (typeof r.suspicion?.[w] === 'number') s.suspicion[w] = clamp(num(r.suspicion[w]), 0, 100);
  for (const t of THREADS) if (typeof r.threads?.[t] === 'number') s.threads[t] = clamp(num(r.threads[t]), 0, 5);
  for (const k of INJURIES) if (typeof r.injuries?.[k] === 'number') s.injuries[k] = clamp(num(r.injuries[k]), 0, 200);
  if (r.excuses && typeof r.excuses === 'object') {
    for (const [id, e] of Object.entries(r.excuses).slice(0, 32)) {
      if (!ID.test(id) || !e || typeof e !== 'object') continue;
      s.excuses[id] = { n: clamp(Math.floor(num(e.n)), 0, 99), who: Array.isArray(e.who) ? e.who.filter((w) => typeof w === 'string' && ID.test(w)).slice(0, 16) : [] };
    }
  }
  const ids = (v, max = 64) => (Array.isArray(v) ? [...new Set(v.filter((x) => typeof x === 'string' && ID.test(x)))].slice(0, max) : []);
  s.doors = { closed: ids(r.doors?.closed), opened: ids(r.doors?.opened) };
  s.kept = ids(r.kept); s.missed = ids(r.missed); s.fired = ids(r.fired, 32);
  s.credit = Math.max(0, Math.floor(num(r.credit)));
  s.rnd = { frozen: typeof r.rnd?.frozen === 'string' && ID.test(r.rnd.frozen) ? r.rnd.frozen : null, shipped: ids(r.rnd?.shipped, 32) };
  if (r.flags && typeof r.flags === 'object') {
    for (const [k, v] of Object.entries(r.flags).slice(0, 64)) if (ID.test(k) && (typeof v === 'boolean' || typeof v === 'number' || (typeof v === 'string' && v.length < 64))) s.flags[k] = v;
  }
  if (r.scenes && typeof r.scenes === 'object') {
    for (const [k, v] of Object.entries(r.scenes).slice(0, 64)) if (ID.test(k) && typeof v === 'string' && ID.test(v)) s.scenes[k] = v;
  }
  if (r.lastNight && typeof r.lastNight === 'object') {
    const n = r.lastNight;
    s.lastNight = { endHour: num(n.endHour, 2), hits: num(n.hits), finishers: num(n.finishers), crimesStopped: num(n.crimesStopped), crimesIgnored: num(n.crimesIgnored), district: typeof n.district === 'string' && ID.test(n.district) ? n.district : null, storyWon: !!n.storyWon };
  }
  s.log = []; // the log is a session view, never saved
  return s;
}
