// One clock, two calendars (workstream K; research doc 7.2 "Calendar"). Pure.
//
// The Wayne calendar is a week of commitments at fixed hours (a board meeting at 09:00, a gala at
// 20:00 ...). The Batman calendar is generated from the city and the campaign: the signal, a cave
// alarm, a call on the secure line. Both land on the same days on purpose: generateWeek() makes sure
// every day has at least one collision (a Batman emergency inside a Wayne commitment's window).
//
//   generateWeek({ seed, days, act, cityHeat, villain }) -> Day[]
//   Day = { day, commitments: Commitment[], emergencies: Emergency[], collisions: [[cId, eId]] }
//   Commitment = { id, type, title, hour, length, venue, standing, miss, thread, scene }
//   Emergency  = { id, kind: 'signal' | 'alarm' | 'call', hour, district, label, urgency }
import { createRng } from '../core/rng.js';

// venue: '<pocket>:<room>' for the lazy interiors (src/world/interiors/*), or a city site id.
export const COMMITMENT_TYPES = Object.freeze({
  board: { title: 'Board meeting', hour: 9, length: 2, venue: 'wayneTower:boardroom', standing: 6, miss: 8, thread: 'lucius', scene: 'boardVote' },
  gala: { title: 'Wayne Foundation gala', hour: 20, length: 3, venue: 'wayneManor:ballroom', standing: 8, miss: 10, thread: null, scene: 'gala' },
  charity: { title: 'Clinic visit, the Narrows', hour: 15, length: 1.5, venue: 'wayneTower:clinic', standing: 5, miss: 6, thread: 'love', scene: 'clinic' },
  press: { title: 'Press conference', hour: 11, length: 1, venue: 'wayneTower:lobby', standing: 5, miss: 7, thread: 'reporter', scene: 'pressConference' },
  date: { title: 'Dinner date', hour: 21, length: 2, venue: 'wayneManor:dining', standing: 2, miss: 4, thread: 'love', scene: null },
  funeral: { title: 'A funeral in Bristol', hour: 10, length: 1.5, venue: 'wayneFamilyPlot', standing: 4, miss: 9, thread: 'gordon', scene: null },
  rivalLunch: { title: 'Lunch with a rival', hour: 13, length: 1.5, venue: 'wayneTower:office', standing: 4, miss: 5, thread: null, scene: null },
  briefing: { title: 'Applied Sciences briefing', hour: 14, length: 1, venue: 'wayneTower:lab', standing: 3, miss: 4, thread: 'lucius', scene: 'luciusBriefing' },
  detective: { title: 'A detective calls', hour: 19, length: 1, venue: 'wayneManor:drawingRoom', standing: 2, miss: 6, thread: 'detective', scene: 'detectiveCalls' },
});
export const COMMITMENT_IDS = Object.keys(COMMITMENT_TYPES);

export const EMERGENCY_KINDS = Object.freeze({
  signal: { label: 'The signal is lit', urgency: 1 },
  alarm: { label: 'The cave alarm', urgency: 0.7 },
  call: { label: 'Alfred, on the secure line', urgency: 0.8 },
});

const DISTRICTS = ['loop', 'lowerGotham', 'narrows', 'parkRow', 'chinatown', 'yards', 'gothamMile', 'lakefront'];

// Two to three commitments a day, never overlapping each other, in the act's flavour.
const ACT_POOLS = {
  2: ['board', 'gala', 'press', 'briefing', 'rivalLunch', 'charity', 'date'],
  3: ['charity', 'funeral', 'board', 'press', 'detective', 'gala', 'briefing'],
  4: ['gala', 'date', 'detective', 'board', 'charity', 'press'],
  5: ['funeral', 'board', 'press', 'detective', 'gala'],
};

export function overlaps(c, e) { return e.hour >= c.hour && e.hour < c.hour + c.length; }

export function makeCommitment(type, day, hour = null) {
  const t = COMMITMENT_TYPES[type];
  return { id: `d${day}.${type}`, type, title: t.title, hour: hour ?? t.hour, length: t.length, venue: t.venue, standing: t.standing, miss: t.miss, thread: t.thread, scene: t.scene };
}

export function generateWeek({ seed = 1, days = 7, act = 2, cityHeat = 0.5, villain = null, startDay = 0 } = {}) {
  const rng = createRng((seed * 7919 + act * 104729) >>> 0);
  const pool = ACT_POOLS[act] ?? ACT_POOLS[2];
  const out = [];
  for (let i = 0; i < days; i++) {
    const day = startDay + i;
    const n = 2 + (rng.chance(0.35 + cityHeat * 0.2) ? 1 : 0);
    const picks = [];
    const order = [...pool].sort(() => rng.next() - 0.5);
    for (const type of order) {
      if (picks.length >= n) break;
      const c = makeCommitment(type, day);
      if (picks.some((p) => c.hour < p.hour + p.length && p.hour < c.hour + c.length)) continue;
      picks.push(c);
    }
    picks.sort((a, b) => a.hour - b.hour);
    // The Batman calendar: one emergency per day, more when the city runs hot. The first always
    // lands inside a commitment (that is the point); the rest fall where they fall.
    const ems = [];
    const nE = 1 + (cityHeat > 0.6 && rng.chance(0.5) ? 1 : 0);
    for (let k = 0; k < nE; k++) {
      const kind = rng.pick(Object.keys(EMERGENCY_KINDS));
      let hour;
      if (k === 0 && picks.length) { const c = rng.pick(picks); hour = c.hour + rng.range(0.1, Math.max(0.2, c.length - 0.2)); }
      else hour = rng.range(8, 23.5);
      hour = Math.round(hour * 4) / 4;
      ems.push({ id: `d${day}.e${k}`, kind, hour, district: rng.pick(DISTRICTS), label: EMERGENCY_KINDS[kind].label, urgency: EMERGENCY_KINDS[kind].urgency, villain });
    }
    const collisions = [];
    for (const c of picks) for (const e of ems) if (overlaps(c, e)) collisions.push([c.id, e.id]);
    out.push({ day, commitments: picks, emergencies: ems, collisions });
  }
  return out;
}

// A fixed day for a scene (the campaign's Bruce-day slots name their commitment and emergency).
export function fixedDay(day, commitmentType, emergency = { kind: 'signal' }) {
  const c = makeCommitment(commitmentType, day);
  const hour = emergency.hour ?? c.hour + Math.min(c.length / 2, 0.75);
  const e = { id: `d${day}.e0`, kind: emergency.kind ?? 'signal', hour, district: emergency.district ?? 'loop', label: EMERGENCY_KINDS[emergency.kind ?? 'signal'].label, urgency: 1, villain: emergency.villain ?? null };
  return { day, commitments: [c], emergencies: [e], collisions: overlaps(c, e) ? [[c.id, e.id]] : [] };
}

// "09:15", "20:30".
export function clockText(hour) {
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
  return `${String(mm === 60 ? hh + 1 : hh).padStart(2, '0')}:${String(mm === 60 ? 0 : mm).padStart(2, '0')}`;
}
