// [wanted] Police attention ("wanted") for the heroes: the pure rules. No three.js, no DOM, no
// clock: everything here takes numbers and returns numbers, and is unit-tested
// (tests/unit/wantedRules.test.js). The runtime (src/wanted/wanted.js) feeds it events and positions.
//
// Not to be confused with the open world's district "heat" (src/openworld/director.js), which is
// CRIMINAL activity in a district. This is how hard the GCPD is looking for the vigilante.
//
// The model, in one paragraph: offences add ATTENTION points, but only what someone saw counts
// (an officer at once, a civilian through a phone call a few seconds later). The level is the
// highest threshold the points pass, and each offence can only push you so far on its own (cap).
// While any unit can see a hero the state is PURSUIT. Lose them all for a moment and it becomes a
// SEARCH: a timer that drains while you stay unseen, faster in a safe place, slower in the open, not
// at all in the open at a manhunt (go to ground). Be seen again and the pursuit resumes with the
// timer refilled. When the timer runs out the units stand down (COOLDOWN, a few seconds), then
// CLEAR. Getting caught is never death: an escape attempt, then a short consequence scene.

// ---------------------------------------------------------------- levels

// Six levels. `pts`: the attention needed to reach it. Unit counts are the level's wish before the
// quality tier's caps (caps.js) and the modifiers below cut them down.
export const LEVELS = Object.freeze([
  { level: 0, id: 'clear', name: 'Clear', pts: 0, cruisers: 0, officers: 0, vans: 0, heli: false, roadblocks: 0, spikes: false, spotters: false, bridges: false, search: 0, lose: 0 },
  // Officers come over to ask questions; a cruiser slows and tails you. Walking off ends it; running is "fleeing a stop".
  { level: 1, id: 'noticed', name: 'Noticed', pts: 1, cruisers: 1, officers: 2, vans: 0, heli: false, roadblocks: 0, spikes: false, spotters: false, bridges: false, search: 10, lose: 4 },
  // A real pursuit: on foot and by cruiser, "stop!" barks, cruisers try to box you in.
  { level: 2, id: 'pursuit', name: 'Pursuit', pts: 3, cruisers: 2, officers: 3, vans: 0, heli: false, roadblocks: 0, spikes: false, spotters: false, bridges: false, search: 18, lose: 3 },
  // Coordinated: more units, roadblocks and spike strips ahead on your route, rooftop spotters.
  { level: 3, id: 'coordinated', name: 'Coordinated', pts: 6, cruisers: 4, officers: 5, vans: 0, heli: false, roadblocks: 1, spikes: true, spotters: true, bridges: false, search: 28, lose: 3 },
  // Tactical: SWAT vans, the searchlight helicopter calling your position, nets and tear gas.
  { level: 4, id: 'tactical', name: 'Tactical', pts: 10, cruisers: 4, officers: 6, vans: 1, heli: true, roadblocks: 2, spikes: true, spotters: true, bridges: false, search: 40, lose: 2.5 },
  // Manhunt: the whole tactical response, bridges raised, El stations watched, checkpoints.
  { level: 5, id: 'manhunt', name: 'Manhunt', pts: 15, cruisers: 5, officers: 8, vans: 2, heli: true, roadblocks: 3, spikes: true, spotters: true, bridges: true, search: 55, lose: 2.5 },
]);
export const MAX_LEVEL = LEVELS.length - 1;
export const MAX_POINTS = 22;

export function levelForPoints(pts) {
  let lv = 0;
  for (const L of LEVELS) if (pts >= L.pts) lv = L.level;
  return lv;
}

// ---------------------------------------------------------------- offences

// pts: attention per occurrence (or per second for `rate` offences). cap: the highest level this
// offence can push you to on its own (a dented bin never brings out the helicopter).
// witness: 'any' (police or a civilian's call), 'police' (only an officer's own eyes count), 'none'
// (counts without a witness: something only the police could be hit by).
export const OFFENCES = Object.freeze({
  publicFight: { pts: 0.35, cap: 1, witness: 'any', label: 'Brawling in public' },
  collateral: { pts: 0.35, cap: 2, witness: 'any', label: 'Property damage' },
  propertyDamage: { pts: 1, cap: 3, witness: 'any', label: 'Serious property damage' },
  reckless: { pts: 0.35, cap: 2, witness: 'any', rate: true, label: 'Reckless driving' },
  pavement: { pts: 0.6, cap: 2, witness: 'any', rate: true, label: 'Driving on the pavement' },
  wrongWay: { pts: 0.18, cap: 1, witness: 'police', rate: true, label: 'Wrong way down the street' },
  ramTraffic: { pts: 0.8, cap: 2, witness: 'any', label: 'Ramming traffic' },
  ramPolice: { pts: 3, cap: 4, witness: 'none', label: 'Ramming a police car' },
  trespass: { pts: 1.5, cap: 2, witness: 'police', label: 'Trespassing' },
  fleeStop: { pts: 2.2, cap: 2, witness: 'police', label: 'Fleeing a police stop' },
  interfere: { pts: 1.2, cap: 3, witness: 'police', label: 'Interfering at a crime scene' },
  vehicleWeapons: { pts: 2, cap: 4, witness: 'any', label: 'Firing vehicle weapons in the street' },
  carjack: { pts: 1.3, cap: 2, witness: 'any', label: 'Taking a car' },
  stunOfficer: { pts: 1.1, cap: 4, witness: 'none', label: 'Assaulting an officer (non-lethal)' },
  restrainOfficer: { pts: 1.8, cap: 5, witness: 'none', label: 'Restraining an officer' },
  disableUnit: { pts: 1.5, cap: 5, witness: 'none', label: 'Disabling a police vehicle' },
  evadeArrest: { pts: 1.6, cap: 5, witness: 'none', label: 'Resisting arrest' },
  breakout: { pts: 3, cap: 4, witness: 'none', label: 'Escaping custody' },
});

// Restricted places (trespass). Points and cap override the offence's. `suspicion` instead of
// wanted: Batman seen at a Wayne site is a clue for the watchers, not a police matter.
export const RESTRICTED = Object.freeze({
  gcpd: { pts: 1.2, cap: 2, label: 'GCPD headquarters' },
  cityHall: { pts: 2, cap: 3, label: 'City Hall' },
  blackgate: { pts: 3, cap: 4, label: 'Blackgate Penitentiary' },
  arkham: { pts: 2.5, cap: 3, label: 'Arkham Asylum' },
  wayne: { pts: 0, cap: 0, suspicion: 6, label: 'a Wayne Enterprises site' },
});

// Attention an offence adds once seen. `wit`: 'police' | 'civilian' | null (unseen).
// Returns 0 for an offence that needs a witness nobody was.
export function witnessFactor(offence, wit) {
  const o = OFFENCES[offence];
  if (!o) return 0;
  if (o.witness === 'none') return 1;
  if (wit === 'police') return 1;
  if (wit === 'civilian') return o.witness === 'any' ? 0.65 : 0;
  return 0;
}

// The points this offence adds given the current points and the modifiers (difficulty, Gordon,
// district, record, menace: see modifiers()). dt: seconds, for `rate` offences. Respects the
// offence's cap: never past the cap level's threshold (but never removes points either).
export function addOffence(points, offence, { wit = 'police', dt = 1, mods = NEUTRAL, site = null } = {}) {
  const o = OFFENCES[offence];
  if (!o) return points;
  const r = site ? RESTRICTED[site] : null;
  const basePts = r ? r.pts : o.pts;
  const cap = r ? r.cap : o.cap;
  const f = witnessFactor(offence, wit);
  if (f <= 0 || basePts <= 0 || cap <= 0) return points;
  const gain = basePts * f * (o.rate ? dt : 1) * (mods.gain ?? 1) * (cap <= 2 ? mods.lowGain ?? 1 : 1);
  const ceiling = Math.min(MAX_POINTS, nextThreshold(cap) - 0.01);
  if (points >= ceiling) return points;
  return Math.min(ceiling, points + gain);
}
// Points just below level+1 (the cap's ceiling); the top level has no ceiling below MAX_POINTS.
function nextThreshold(cap) { return cap >= MAX_LEVEL ? MAX_POINTS + 0.01 : LEVELS[cap + 1].pts; }

// ---------------------------------------------------------------- modifiers

export const DIFFICULTY = Object.freeze({
  relaxed: { gain: 0.6, search: 0.7, units: -1 },
  standard: { gain: 1, search: 1, units: 0 },
  relentless: { gain: 1.4, search: 1.3, units: 1 },
});
export const NEUTRAL = Object.freeze({ gain: 1, lowGain: 1, search: 1, units: 0, callOff: false, minLevel: 0, drain: 1 });

// District stance: a district the heroes keep clean is friendlier; a corrupt precinct is hostile
// whatever you do. stopped: crimes stopped there; heat: the open world's criminal heat 0..5.
export const CORRUPT = Object.freeze(['narrows', 'parkRow', 'docks']);
export function districtStance(district, { stopped = 0, heat = 1 } = {}) {
  if (CORRUPT.includes(district)) return 'hostile';
  if (stopped >= 4 && heat <= 1.5) return 'friendly';
  return 'neutral';
}

// Gordon's trust: the Gordon relationship thread (src/bruce/doubleLife.js, rank 0..5).
export function gordonTrust(rank) {
  if (rank >= 4) return 'good';
  if (rank <= 1) return 'bad';
  return 'fair';
}

// Everything that bends the rules, folded into one object (cheap to recompute a few times a second).
//   difficulty: 'relaxed' | 'standard' | 'relentless'
//   gordon: thread rank 0..5; menace: a story beat branded Batman a menace (plot state)
//   stance: districtStance(); record: crimes stopped since the last time you were wanted
export function modifiers({ difficulty = 'standard', gordon = 2, menace = false, stance = 'neutral', record = 0 } = {}) {
  const d = DIFFICULTY[difficulty] ?? DIFFICULTY.standard;
  const trust = gordonTrust(gordon);
  let gain = d.gain, search = d.search, units = d.units, lowGain = 1;
  if (trust === 'good') { gain *= 0.85; search *= 0.8; }
  if (trust === 'bad') { gain *= 1.25; search *= 1.25; units += 1; }
  if (menace) { gain *= 1.5; search *= 1.4; units += 1; }
  if (stance === 'friendly') { gain *= 0.75; search *= 0.85; }
  if (stance === 'hostile') { gain *= 1.3; search *= 1.25; }
  // A clean record (crimes stopped since the last chase) excuses the small stuff.
  if (record >= 10) lowGain = 0.65; else if (record >= 5) lowGain = 0.82;
  return {
    gain, lowGain, search, units,
    // Gordon calls off a level 1-2 response when he trusts you and no story beat says otherwise.
    callOff: trust === 'good' && !menace,
    // A menace branding keeps the city looking: you never drop below Noticed while it holds.
    minLevel: menace ? 1 : 0,
    drain: 1,
  };
}

// ---------------------------------------------------------------- the search

// Seconds a search lasts at this level, after the modifiers.
export function searchTime(level, mods = NEUTRAL) {
  const L = LEVELS[Math.max(0, Math.min(MAX_LEVEL, level))];
  return L.search * (mods.search ?? 1);
}
// Seconds without any unit seeing a hero before a pursuit becomes a search.
export const loseTime = (level) => LEVELS[Math.max(0, Math.min(MAX_LEVEL, level))].lose;

// How fast the search timer drains (per second of real time), from where the hidden heroes are.
// spot: { safe (interior, sewer, cave entrance), cover (an alley, under an overhang or a deck),
//         rooftop, districtChanged (left the district of the last known position), weather 0..1
//         (fog, rain: how much it hides you), farFromLkp (metres from the last known position) }
// Level 5 drains only when gone to ground (safe); level 4 slowly in the open.
export function searchDrain(level, spot = {}, mods = NEUTRAL) {
  const { safe = false, cover = false, rooftop = false, districtChanged = false, weather = 0, farFromLkp = 0 } = spot;
  if (level >= 5 && !safe) return 0;
  let r = 1;
  if (safe) r *= 2.6;
  else {
    if (cover) r *= 1.5;
    if (rooftop) r *= level <= 3 ? 1.4 : 0.9;
    if (level === 4) r *= 0.55;
  }
  if (districtChanged) r *= 1.3;
  r *= 1 + Math.min(1, Math.max(0, weather)) * 0.25;
  r *= 1 + Math.min(1, farFromLkp / 250) * 0.35;
  if (mods.callOff && level <= 2) r *= 1.5;
  return r * (mods.drain ?? 1);
}

// ---------------------------------------------------------------- the state machine

export const STATES = Object.freeze(['clear', 'noticed', 'pursuit', 'search', 'cooldown', 'caught', 'custody']);
export const COOLDOWN_TIME = 6;
// Seconds the units get to reach a new call before not seeing anyone counts as losing you.
export const RESPOND_TIME = 10;

// A fresh state object (also the shape snapshot() writes and apply() reads).
export function createWantedState() {
  return {
    points: 0, level: 0, state: 'clear', unseen: 0, search: 0, searchMax: 0, cooldown: 0,
    lkp: null, lkpDistrict: null, lkpT: 0, peak: 0, scripted: false, suspended: [], caught: 0, menace: false, seq: 0,
  };
}

// One tick of the rules. s: the state (mutated). input:
//   dt          seconds
//   seen        some unit (or the helicopter's light) sees some hero this tick
//   seenAt      { x, z, district } where (the last known position), when seen
//   spot        searchDrain()'s spot for the hidden heroes (the least hidden one counts)
//   mods        modifiers()
//   enabled     the player's setting: false holds the level at 0 unless scripted
// Returns the list of transitions this tick as short strings (for events), reusing `out`.
export function stepWanted(s, { dt = 0, seen = false, seenAt = null, spot = {}, mods = NEUTRAL, enabled = true } = {}, out = []) {
  out.length = 0;
  if (s.suspended.length) return out;
  if (!enabled && !s.scripted) {
    if (s.level > 0 || s.points > 0) { clearTo(s, 0); out.push('cleared'); }
    return out;
  }
  // Points raise the level; the level never falls while the pursuit is on (only the search ends it).
  const want = Math.max(levelForPoints(s.points), mods.minLevel ?? 0);
  if (want > s.level) {
    const from = s.level;
    s.level = want;
    s.peak = Math.max(s.peak, want);
    s.seq++;
    out.push(`level:${from}:${want}`);
    if (s.state === 'clear' || s.state === 'search' || s.state === 'cooldown' || s.state === 'noticed') { s.state = want >= 2 ? 'pursuit' : 'noticed'; s.unseen = 0; out.push(`state:${s.state}`); }
    // Units need time to arrive: a fresh call is not "lost" before anyone could have looked.
    s.unseen = Math.min(s.unseen, -RESPOND_TIME);
  }
  if (s.level === 0) { if (s.state !== 'clear') { s.state = 'clear'; out.push('state:clear'); } return out; }
  if (s.state === 'caught' || s.state === 'custody') return out;
  if (seen && seenAt) { s.lkp = s.lkp ?? { x: 0, z: 0 }; s.lkp.x = seenAt.x; s.lkp.z = seenAt.z; s.lkpDistrict = seenAt.district ?? s.lkpDistrict; s.lkpT = 0; }
  else s.lkpT += dt;
  switch (s.state) {
    case 'noticed':
    case 'pursuit':
      if (seen) { s.unseen = 0; break; }
      s.unseen += dt;
      if (s.unseen >= loseTime(s.level)) {
        s.state = 'search';
        s.searchMax = s.search = searchTime(s.level, mods);
        out.push('state:search');
      }
      break;
    case 'search':
      if (seen) { s.state = s.level >= 2 ? 'pursuit' : 'noticed'; s.unseen = 0; out.push(`state:${s.state}`); break; }
      s.search -= dt * searchDrain(s.level, spot, mods);
      if (s.search <= 0) { s.search = 0; s.state = 'cooldown'; s.cooldown = COOLDOWN_TIME; out.push('state:cooldown'); }
      break;
    case 'cooldown':
      // A fresh sighting during the stand-down does not restart it: only a new offence does (points).
      s.cooldown -= dt;
      if (s.cooldown <= 0) {
        const floor = mods.minLevel ?? 0;
        clearTo(s, floor);
        out.push('cleared');
        if (floor > 0) { s.state = 'noticed'; out.push('state:noticed'); }
      }
      break;
    default: break;
  }
  return out;
}

function clearTo(s, level) {
  s.level = level; s.points = level > 0 ? LEVELS[level].pts : 0;
  s.state = level > 0 ? 'noticed' : 'clear';
  s.unseen = 0; s.search = 0; s.searchMax = 0; s.cooldown = 0; s.scripted = false; s.caught = 0;
  s.seq++;
}

// Gordon calls it off: a level 1-2 response ends at once (radio line), when trust allows.
export function canCallOff(s, mods) { return !!mods.callOff && s.level > 0 && s.level <= 2 && !s.scripted && (s.state === 'search' || s.state === 'noticed'); }

// Story: set a level outright (scripted moments ignore the player's "off" setting).
export function setLevel(s, level, { scripted = false } = {}) {
  const lv = Math.max(0, Math.min(MAX_LEVEL, Math.round(level)));
  if (lv === 0) { clearTo(s, 0); return s; }
  s.level = lv; s.points = Math.max(LEVELS[lv].pts, Math.min(s.points, (LEVELS[lv + 1]?.pts ?? MAX_POINTS) - 0.01));
  s.peak = Math.max(s.peak, lv);
  s.state = lv >= 2 ? 'pursuit' : 'noticed';
  s.unseen = -RESPOND_TIME; s.scripted = !!scripted; s.seq++;
  return s;
}

// ---------------------------------------------------------------- caught

// The caught meter (0..1): fills while officers are on a hero (within reach) and the hero is slow
// or held (netted, tased, boxed in by cruisers); drains otherwise. Struggling drains it hard.
// near: officers within reach; boxed: cruisers pinning a car; held: a net or taser on the hero.
export function caughtStep(meter, { dt = 0, near = 0, boxed = 0, held = false, slow = false, struggle = false, level = 0 } = {}) {
  let rate = 0;
  if (level >= 1) {
    if (held) rate += 0.45;
    if (near > 0 && slow) rate += 0.18 * Math.min(3, near);
    if (boxed >= 2) rate += 0.3;
  }
  if (struggle) rate -= 0.9;
  if (rate <= 0) rate = Math.min(rate, -0.25);
  return Math.max(0, Math.min(1, meter + rate * dt));
}

// What happens once caught (after the escape attempt failed). Never a game over, never a soft-lock:
// 'warning' (Gordon lets you go), else 'cell' (break out of a holding cell at the nearest precinct).
export function caughtOutcome({ gordon = 2, level = 1, menace = false } = {}) {
  if (!menace && gordonTrust(gordon) === 'good' && level <= 3) return 'warning';
  return 'cell';
}

// The cost of a caught: hours lost, reputation, suspicion if the identity came close, how long the
// gadgets are held (seconds, "confiscated, then recovered").
export function caughtPenalty(outcome, { level = 1, identityRisk = false } = {}) {
  if (outcome === 'warning') return { hours: 0.5, rep: -2, suspicion: 0, gadgetLock: 0 };
  return { hours: 2, rep: -4 - level, suspicion: identityRisk ? 12 : 0, gadgetLock: 45 + level * 10 };
}

// ---------------------------------------------------------------- the rule that keeps this Batman

// Batman does not hurt police. Every attack aimed at an officer or a police vehicle converts to a
// non-lethal outcome. dmg is always 0 (tests assert it); stun: seconds the unit is out of the chase;
// restrain: the officer is zip-tied (out for good until the units reset); offence: what it costs.
// Units: 'officer' (on foot, SWAT too), 'vehicle' (cruiser, van), 'heli'.
export const NONLETHAL = Object.freeze({
  officer: Object.freeze({
    punch: { outcome: 'zipTie', stun: 30, restrain: true, offence: 'restrainOfficer', word: 'ZIP!' },
    takedown: { outcome: 'zipTie', stun: 30, restrain: true, offence: 'restrainOfficer', word: 'ZIP!' },
    kick: { outcome: 'shove', stun: 3, restrain: false, offence: 'stunOfficer', word: 'SHOVE!' },
    heavy: { outcome: 'shove', stun: 3.5, restrain: false, offence: 'stunOfficer', word: 'SHOVE!' },
    counter: { outcome: 'disarm', stun: 2.5, restrain: false, offence: 'stunOfficer', word: 'DISARM!' },
    cape: { outcome: 'capeStun', stun: 4, restrain: false, offence: 'stunOfficer', word: 'SWISH!' },
    batarang: { outcome: 'disarm', stun: 2, restrain: false, offence: 'stunOfficer', word: 'TINK!' },
    bolas: { outcome: 'bolas', stun: 8, restrain: false, offence: 'stunOfficer', word: 'WRAP!' },
    glue: { outcome: 'glue', stun: 9, restrain: false, offence: 'stunOfficer', word: 'SPLAT!' },
    smoke: { outcome: 'blind', stun: 6, restrain: false, offence: null, word: null },
    flashbang: { outcome: 'stun', stun: 5, restrain: false, offence: 'stunOfficer', word: 'FLASH!' },
    sonic: { outcome: 'stun', stun: 4, restrain: false, offence: 'stunOfficer', word: 'WHEEE!' },
    emp: { outcome: 'taserFizzle', stun: 1.5, restrain: false, offence: null, word: 'FZZT' },
    riotRound: { outcome: 'stun', stun: 4, restrain: false, offence: 'stunOfficer', word: 'THWUMP' },
    grapplePull: { outcome: 'disarm', stun: 2, restrain: false, offence: 'stunOfficer', word: 'YANK!' },
    ram: { outcome: 'diveClear', stun: 1, restrain: false, offence: 'ramPolice', word: null },
  }),
  vehicle: Object.freeze({
    ram: { outcome: 'shove', stun: 3, restrain: false, offence: 'ramPolice', word: 'CRUNCH' },
    riotRound: { outcome: 'immobilise', stun: 12, restrain: false, offence: 'disableUnit', word: 'THUNK' },
    immobiliser: { outcome: 'immobilise', stun: 12, restrain: false, offence: 'disableUnit', word: 'THUNK' },
    emp: { outcome: 'immobilise', stun: 10, restrain: false, offence: 'disableUnit', word: 'FZZT' },
    cannon: { outcome: 'refused', stun: 0, restrain: false, offence: null, word: null },
    glue: { outcome: 'glue', stun: 8, restrain: false, offence: 'disableUnit', word: 'SPLAT!' },
    batarang: { outcome: 'tyre', stun: 4, restrain: false, offence: 'disableUnit', word: 'PSSST' },
  }),
  heli: Object.freeze({
    disruptor: { outcome: 'lost', stun: 12, restrain: false, offence: null, word: 'BZZT' },
    emp: { outcome: 'lost', stun: 8, restrain: false, offence: 'disableUnit', word: 'FZZT' },
    grapplePull: { outcome: 'none', stun: 0, restrain: false, offence: null, word: null },
    smoke: { outcome: 'none', stun: 0, restrain: false, offence: null, word: null },
    cannon: { outcome: 'refused', stun: 0, restrain: false, offence: null, word: null },
  }),
});
// The non-lethal result of `attack` on a unit of `kind`, always with dmg 0. Unknown attacks are a
// harmless shove (an officer) or nothing (vehicles): there is no path to harm.
export function convertAttack(kind, attack) {
  const t = NONLETHAL[kind];
  const r = t?.[attack] ?? (kind === 'officer' ? t.kick : { outcome: 'none', stun: 0, restrain: false, offence: null, word: null });
  return { ...r, dmg: 0 };
}

// Civilians are never harmable either; this is the list the runtime checks before any effect.
export const UNHARMABLE = Object.freeze(['civilian', 'officer', 'swat', 'police', 'pilot']);
