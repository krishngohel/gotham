// Crime system v2: the crime types (research doc 5.2's table), each a composition of the
// objective modules in objectives.js, plus the twists and escalation tiers that vary them.
// Pure data + a composer: composeCrime(typeId, ctx) -> a plan the runtime plays.
//
// A type: { id, title, alert (dispatch category), districts|null (null: anywhere), heat [min, max]
//   (district heat tiers it appears at), time ('any'|'night'|'day'), twists (allowed ids), budget
//   (composeWave budget at tier 0), depth ('deep'|'medium'|'thin': honest), coop (how two players
//   split it), build(c) -> { objective, squad?, props?, needs? } }
// c (build context) = { spot, district, tier, rng, geo, players, twists, gangs, params }
// geo (the runtime's world queries; stubbed in tests): streetPath(from, len), roofPath(from, hops),
//   roofsNear(at, n), train(at), bridge(at)
import { composeWave } from '../enemies/compose.js';
import { lookOf, topGang } from './gangs.js';

const ring = (n, r, turn = 0) => Array.from({ length: n }, (_, i) => { const a = turn + (i / Math.max(1, n)) * Math.PI * 2; return { dx: Math.sin(a) * r, dz: Math.cos(a) * r }; });
const at = (s, dx = 0, dz = 0, dy = 0) => ({ x: s.x + dx, y: s.y + dy, z: s.z + dz });

export const TWISTS = {
  ambush: { title: 'Ambush', text: 'It was bait. More of them were waiting.' },
  secondWave: { title: 'Second wave', text: 'Backup is on the way.' },
  hostageSwap: { title: 'Hostage swap', text: 'They are moving the hostage.' },
  boobyTrap: { title: 'Booby trap', text: 'Something is ticking under the car.' },
  elite: { title: 'Elite', text: 'Someone who knows how to fight is running this.' },
  police: { title: 'Police on scene', text: 'A patrol rolled in early and is pinned down.' },
  storm: { title: 'Bad weather', text: 'The weather is on their side tonight.' },
  blackout: { title: 'Blackout', text: 'The block has gone dark. They got bold.' },
  split: { title: 'Split up', text: 'They split up at the corner.' },
  decoy: { title: 'Decoy', text: 'One of them is a fake. Scan before you touch.' },
};
export const TWIST_IDS = Object.keys(TWISTS);

// Escalation tiers from district heat (0..5): budget, clocks, and who shows up.
export const TIERS = [
  { tier: 0, budget: 0, clock: 1, elite: false, twists: 0 },
  { tier: 1, budget: 2, clock: 0.92, elite: false, twists: 1 },
  { tier: 2, budget: 4, clock: 0.85, elite: false, twists: 1 },
  { tier: 3, budget: 6, clock: 0.78, elite: true, twists: 2 },
];
export const tierOfHeat = (heat) => (heat >= 4 ? 3 : heat >= 2.6 ? 2 : heat >= 1.3 ? 1 : 0);

const clockOf = (c, s) => Math.round(s * TIERS[c.tier].clock * (c.has('storm') ? 1.1 : 1));

export const CRIME_TYPES = [
  // 1. Mugging: protect one civilian (panic meter); ignored for 60 s it becomes a hostage scene.
  { id: 'mugging', title: 'Civilian cornered', alert: 'mugging', districts: null, heat: [0, 3], time: 'any', budget: 3, depth: 'deep',
    twists: ['split', 'ambush', 'police', 'blackout'], coop: 'A second mugging starts round the corner: split up or race.', legacy: true,
    build: (c) => ({ objective: { kind: 'all', parts: [{ kind: 'defeat' }, { kind: 'protect', at: c.spot, civilians: [{ dx: 0, dz: 0 }], rise: 0.035 }] }, props: { civilians: 1 }, escalateAfter: 60, escalateTo: 'hostageStore' }) },
  // 2. Robbery in progress: the crew plus a getaway driver waiting a block away.
  { id: 'robbery', title: 'Robbery', alert: 'robbery', districts: null, heat: [0, 5], time: 'any', budget: 4, depth: 'deep',
    twists: ['secondWave', 'elite', 'police', 'boobyTrap', 'ambush'], coop: 'One stops the driver, one takes the crew.', legacy: true,
    build: (c) => ({ objective: { kind: 'all', parts: [{ kind: 'defeat' }, { kind: 'getaway', path: c.geo.streetPath(at(c.spot, 14, 0), 160), delay: clockOf(c, 25), speed: 8.5 }] }, props: { loot: true, car: true } }) },
  // 3. Van break-in: they scatter with the goods; catch the carriers (recover across carriers).
  { id: 'van', title: 'Van break-in', alert: 'van', districts: null, heat: [0, 3], time: 'any', budget: 3, depth: 'medium',
    twists: ['split', 'police', 'storm'], coop: 'Three carriers run three ways: each player takes one, the third is a race.', legacy: true,
    build: (c) => ({ objective: { kind: 'seq', parts: [{ kind: 'defeat' }, { kind: 'chase', goods: true, need: 2, wake: 0, runners: [0, 1, 2].map((i) => ({ path: c.geo.streetPath(at(c.spot, Math.sin(i * 2.1) * 4, Math.cos(i * 2.1) * 4), 120 + i * 15), speed: 5.6 })) }] }, props: { van: true } }) },
  // 4. Hostage store: protect 2-4 hostages; a gunman's dead-man trigger punishes an alarm.
  { id: 'hostageStore', title: 'Hostages taken', alert: 'hostage', districts: ['gothamMile', 'parkRow', 'loop', 'neon', 'chinatown', 'narrows'], heat: [2, 5], time: 'any', budget: 5, depth: 'deep',
    twists: ['hostageSwap', 'elite', 'police', 'boobyTrap'], coop: 'Enter from two sides; a takedown on both gunmen at once is the bonus.',
    build: (c) => { const n = 2 + Math.floor(c.rng.next() * 3); return { objective: { kind: 'all', parts: [{ kind: 'defeat' }, { kind: 'protect', at: c.spot, deadMan: true, rise: 0.03, civilians: ring(n, 2.2, c.rng.next() * 6).map((p) => ({ ...p, panic: 0.25 })) }] }, props: { civilians: n } }; } },
  // 5. Foot chase: a runner bolts down the street.
  { id: 'footChase', title: 'Purse snatcher', alert: 'mugging', districts: null, heat: [0, 2], time: 'any', budget: 0, depth: 'medium',
    twists: ['split', 'storm'], coop: 'The runner splits in two at the junction: each takes one.',
    build: (c) => ({ objective: { kind: 'chase', wake: 30, runners: c.has('split') ? [0, 1].map((i) => ({ path: c.geo.streetPath(at(c.spot, i * 3, 0), 170), speed: 6 })) : [{ path: c.geo.streetPath(c.spot, 190), speed: 6.3 }] }, noSquad: true }) },
  // 6. Rooftop chase: a free-runner across the roofs, hopping gaps (the runner uses them too).
  { id: 'rooftopChase', title: 'Rooftop runner', alert: 'generic', districts: ['narrows', 'parkRow', 'loop', 'chinatown', 'neon', 'gcpd', 'clock', 'gothamMile'], heat: [1, 5], time: 'night', budget: 0, depth: 'deep',
    twists: ['split', 'storm', 'ambush'], coop: 'One chases; the other cuts across to the roof he is heading for.',
    build: (c) => ({ objective: { kind: 'chase', wake: 35, reach: 2.6, text: 'Catch the free-runner', runners: [{ path: c.geo.roofPath(c.spot, 6), speed: c.has('storm') ? 6.4 : 7 }] }, noSquad: true, roof: true }) },
  // 7. Vehicle getaway: a car on the move; the vehicle chase (old van chase, behind an adapter).
  { id: 'vehicleGetaway', title: 'Getaway car', alert: 'carjack', districts: ['lowerGotham', 'loop', 'river', 'lakeshore', 'gothamMile', 'yards', 'docks', 'gcpd', 'neon', 'ace', 'clock'], heat: [1, 5], time: 'any', budget: 0, depth: 'medium',
    twists: ['storm', 'police'], coop: 'Driver and gunner in the car, or car and glider.',
    build: (c) => ({ objective: { kind: 'getaway', vehicle: true, path: c.geo.streetPath(c.spot, 300), delay: 0, speed: 11 }, noSquad: true, vehicle: true }) },
  // 8. Bomb: defuse against the clock (find, scan, a timing interaction); decoys need the scan.
  { id: 'bomb', title: 'Bomb threat', alert: 'generic', districts: ['loop', 'museumCampus', 'gothamMile', 'amusementMile', 'gcpd', 'clock', 'river'], heat: [3, 5], time: 'any', budget: 3, depth: 'deep',
    twists: ['decoy', 'ambush', 'police'], coop: 'Two bombs, two players: defuse both at once.',
    build: (c) => { const two = c.players > 1 || c.has('decoy'); return { objective: { kind: 'all', parts: [{ kind: 'defeat', optional: true }, { kind: 'defuse', at: c.spot, timer: clockOf(c, 75), bombs: two ? [{ dx: -7, dz: 3 }, { dx: 7, dz: -3, decoy: c.has('decoy') && c.players < 2 }] : [{ dx: 0, dz: 4 }] }] }, props: { bombs: true } }; } },
  // 9. Arson: get the occupants out, then catch the arsonist on the roof.
  { id: 'arson', title: 'Arson', alert: 'arson', districts: ['parkRow', 'yards', 'chinatown', 'narrows', 'littleOdessa', 'docks', 'ace'], heat: [2, 5], time: 'night', budget: 0, depth: 'medium',
    twists: ['storm', 'police'], coop: 'One evacuates, one catches the arsonist.',
    build: (c) => ({ objective: { kind: 'seq', parts: [{ kind: 'rescue', at: c.spot, burn: clockOf(c, 40), people: [{ dx: 4, dz: 2 }, { dx: -4, dz: 3 }, { dx: 0, dz: -5 }] }, { kind: 'chase', wake: 0, text: 'Catch the arsonist', runners: [{ path: c.geo.roofPath(at(c.spot, 0, -6), 4), speed: 6.2 }] }] }, noSquad: true, props: { fire: true, civilians: 3 } }) },
  // 10. Protection racket: tail the collector back to the boss, then take the shop back.
  { id: 'racket', title: 'Protection racket', alert: 'generic', districts: ['chinatown', 'littleOdessa', 'gothamMile', 'parkRow', 'narrows', 'neon'], heat: [1, 4], time: 'any', budget: 5, depth: 'deep',
    twists: ['elite', 'ambush'], coop: 'Two collectors work opposite ends of the street.',
    build: (c) => { const path = c.geo.streetPath(c.spot, 140); const end = path[path.length - 1]; return { objective: { kind: 'seq', parts: [{ kind: 'tail', path, speed: 2.4, min: 9, max: 40 }, { kind: 'defeat', text: 'The boss is here. Shame him in front of the street.' }] }, squadAt: end, squadDelay: true, tailTarget: true }; } },
  // 11. Sniper nest: snipers on the roofs pin down the police; sightlines are lasers.
  { id: 'sniperNest', title: 'Snipers', alert: 'generic', districts: ['loop', 'gothamMile', 'lowerGotham', 'chinatown', 'yards', 'neon', 'clock'], heat: [3, 5], time: 'night', budget: 0, depth: 'medium',
    twists: ['elite', 'police'], coop: 'One draws the sightlines, the other flanks.',
    build: (c) => { const nests = c.geo.roofsNear(c.spot, 3).map((r) => ({ ...r, yaw: Math.atan2(c.spot.x - r.x, c.spot.z - r.z) })); return { objective: { kind: 'sniper', nests }, nests, squadKind: 'nests', props: { police: true } }; } },
  // 12. Gang war: two gangs in one street; stop both or pick a side.
  { id: 'gangWar', title: 'Gang war', alert: 'brawl', districts: null, heat: [3, 5], time: 'night', budget: 7, depth: 'deep', twoGangs: true,
    twists: ['elite', 'police', 'ambush'], coop: 'Each player takes one side of the street.',
    build: (c) => ({ objective: { kind: 'war', gangs: c.gangs, truce: 10, names: c.gangNames } }) },
  // 13. Kidnapped witness: follow the clues to the van, then get the witness out alive.
  { id: 'kidnap', title: 'Kidnapping', alert: 'generic', districts: ['narrows', 'yards', 'parkRow', 'docks', 'littleOdessa', 'quay'], heat: [2, 5], time: 'night', budget: 4, depth: 'medium',
    twists: ['hostageSwap', 'ambush'], coop: 'One tracks, one intercepts at the van.',
    build: (c) => { const path = c.geo.streetPath(c.spot, 120); const end = path[path.length - 1]; const pts = [path[Math.floor(path.length / 3)], path[Math.floor((path.length * 2) / 3)], end].map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z })); return { objective: { kind: 'seq', parts: [{ kind: 'trail', points: pts.slice(0, 2), text: 'Tyre marks and a dropped phone: follow them in detective vision' }, { kind: 'all', parts: [{ kind: 'defeat' }, { kind: 'protect', at: { ...end }, civilians: [{ dx: 1.5, dz: 0, panic: 0.3 }] }] }] }, squadAt: end, squadDelay: true, props: { van: true, civilians: 1 } }; } },
  // 14. Stolen-car ring: tail a stolen car to the chop shop; clean it out.
  { id: 'carRing', title: 'Stolen car', alert: 'carjack', districts: ['yards', 'lowerGotham', 'docks', 'quay', 'ace'], heat: [1, 4], time: 'night', budget: 5, depth: 'medium',
    twists: ['ambush', 'elite'], coop: 'One tails, one scouts the shop.',
    build: (c) => { const path = c.geo.streetPath(c.spot, 200); return { objective: { kind: 'seq', parts: [{ kind: 'tail', path, speed: 6, min: 14, max: 70, lose: 10, text: 'Tail the stolen car to the chop shop. Keep your distance.' }, { kind: 'defeat', text: 'The chop shop. Clean it out.' }] }, squadAt: path[path.length - 1], squadDelay: true, tailTarget: 'car' }; } },
  // 15. Bank / jeweller job in stages: the crew inside, then the escape vehicle.
  { id: 'bankJob', title: 'Bank job', alert: 'robbery', districts: ['loop', 'gothamMile', 'chinatown', 'neon'], heat: [2, 5], time: 'night', budget: 6, depth: 'deep',
    twists: ['secondWave', 'elite', 'police', 'boobyTrap'], coop: 'One takes the vault crew, the other the lookouts and the car.',
    build: (c) => ({ objective: { kind: 'seq', parts: [{ kind: 'defeat', text: 'Stage 1: the vault crew' }, { kind: 'getaway', path: c.geo.streetPath(at(c.spot, 12, 6), 200), delay: 3, speed: 10, text: 'Stage 2: the escape car' }] }, props: { loot: true, car: true }, waves: 2 }) },
  // 16. El hijack: the crew rides a running El train; board it before it makes three stops.
  { id: 'elHijack', title: 'El hijack', alert: 'generic', districts: ['loop'], heat: [2, 5], time: 'any', budget: 4, depth: 'medium',
    twists: ['elite', 'secondWave'], coop: 'Front car and back car.',
    build: (c) => ({ objective: { kind: 'seq', parts: [{ kind: 'board', stops: 3 }, { kind: 'defeat', text: 'Clear the train roof' }] }, train: c.geo.train(c.spot), squadDelay: true, onTrain: true }) },
  // 17. Bridge standoff: a car hangs off a raised bascule; retake the bridgehouse before it slips.
  { id: 'bridgeStandoff', title: 'Bridge standoff', alert: 'hostage', districts: ['river', 'quay', 'loop', 'lowerGotham', 'narrows'], heat: [2, 5], time: 'any', budget: 4, depth: 'medium',
    twists: ['elite', 'police'], coop: 'One holds the bridgehouse, one rescues the car.',
    build: (c) => { const b = c.geo.bridge(c.spot); return b ? { objective: { kind: 'any', parts: [{ kind: 'all', parts: [{ kind: 'defeat', text: 'Retake the bridgehouse' }, { kind: 'reach', at: b.car, radius: 4, text: 'Reach the hanging car' }] }, { kind: 'clock', timer: clockOf(c, 120), text: 'The car is slipping' }] }, bridge: b, place: b.house } : null; } },
  // 18. Prison break at Blackgate: hold the yard, stop the runners at the wall.
  { id: 'prisonBreak', title: 'Prison break', alert: 'brawl', districts: ['blackgate'], heat: [0, 5], time: 'any', budget: 6, depth: 'medium',
    twists: ['secondWave', 'elite'], coop: 'Separate blocks: one holds the yard, one runs down the wall.',
    build: (c) => ({ objective: { kind: 'all', parts: [{ kind: 'hold', at: c.spot, radius: 10, time: 20, text: 'Retake the yard' }, { kind: 'chase', wake: 0, need: 1, text: 'Stop the escapees at the wall', runners: [{ path: c.geo.streetPath(at(c.spot, 0, -8), 50), speed: 4.6 }, { path: c.geo.streetPath(at(c.spot, 0, 8), 50), speed: 4.6 }] }] }, waves: 2 }) },
  // 19. Asylum disturbance at Arkham: inmates loose in the yard; hold the ward.
  { id: 'asylumRiot', title: 'Arkham disturbance', alert: 'brawl', districts: ['arkham'], heat: [0, 5], time: 'any', budget: 7, depth: 'medium',
    twists: ['secondWave', 'elite', 'blackout'], coop: 'Separate wards.',
    build: (c) => ({ objective: { kind: 'all', parts: [{ kind: 'hold', at: c.spot, radius: 11, time: 30, text: 'Hold the ward until the orderlies are out' }, { kind: 'protect', at: c.spot, civilians: [{ dx: 3, dz: 3 }, { dx: -3, dz: 3 }], rise: 0.025, text: 'Keep the orderlies safe' }] }, waves: 3 }) },
  // 20. Pier arcade shakedown: the collectors leaning on the arcade; protect the owner.
  { id: 'pierShakedown', title: 'Arcade shakedown', alert: 'generic', districts: ['amusementMile'], heat: [0, 5], time: 'night', budget: 4, depth: 'thin',
    twists: ['elite', 'ambush'], coop: 'Two collectors at opposite ends of the pier.',
    build: (c) => ({ objective: { kind: 'all', parts: [{ kind: 'defeat' }, { kind: 'protect', at: c.spot, civilians: [{ dx: 0, dz: 1.6, panic: 0.2 }], text: 'Protect the arcade owner' }] }, props: { civilians: 1 } }) },
  // 21. Museum heist: the gallery crew loading crates; quietly, or chase the crates.
  { id: 'museumHeist', title: 'Museum heist', alert: 'robbery', districts: ['museumCampus'], heat: [0, 5], time: 'night', budget: 5, depth: 'medium',
    twists: ['elite', 'boobyTrap'], coop: 'One takes the loaders silently, one watches the trucks.',
    build: (c) => ({ objective: { kind: 'seq', parts: [{ kind: 'interrupt', onAlarm: 'escalate', text: 'Take the gallery crew without raising the alarm' }] }, escalate: { kind: 'chase', goods: true, need: 1, wake: 0, text: 'The crates are running: catch a carrier', runners: [0, 1].map((i) => ({ path: c.geo.streetPath(at(c.spot, i * 5 - 2, 6), 110), speed: 5.2 })) }, props: { loot: true } }) },
  // 22. Interrupt a deal: two crews swapping cases; silent, or the money runs.
  { id: 'dealBust', title: 'A deal going down', alert: 'generic', districts: ['docks', 'quay', 'river', 'lowerGotham', 'yards', 'littleOdessa', 'chinatown', 'ace'], heat: [1, 5], time: 'night', budget: 5, depth: 'deep',
    twists: ['elite', 'split'], coop: 'Two buyers, two exits.',
    build: (c) => ({ objective: { kind: 'seq', parts: [{ kind: 'interrupt', onAlarm: 'escalate' }] }, escalate: { kind: 'chase', goods: true, need: 1, wake: 0, text: 'The money is running', runners: (c.has('split') ? [0, 1] : [0]).map((i) => ({ path: c.geo.streetPath(at(c.spot, i * 6 - 3, 0), 130), speed: 5.8 })) }, props: { loot: true } }) },
  // 23. Street brawl (ambient, optional): break it up; sometimes it's a stunt for a phone video.
  { id: 'brawl', title: 'Street brawl', alert: 'brawl', districts: null, heat: [0, 2], time: 'any', budget: 3, depth: 'thin', optional: true,
    twists: ['police'], coop: 'Same fight, two heroes.',
    build: () => ({ objective: { kind: 'defeat', text: 'Break up the brawl' } }) },
];
export const CRIME_TYPE_IDS = CRIME_TYPES.map((t) => t.id);
export const crimeType = (id) => CRIME_TYPES.find((t) => t.id === id) ?? null;
// The old single-template kinds (robbery, mugging, van) are v2 types with the same ids, so a save,
// a test or `side.crimes.force({ kind: 'robbery' })` keeps working.
export const LEGACY_KINDS = CRIME_TYPES.filter((t) => t.legacy).map((t) => t.id);

// Could this type run here, now? (district list, heat band, time of day, weather)
export function typeFits(t, { district, heat = 0, hour = 23, weather = 'clear' } = {}) {
  if (t.districts && !t.districts.includes(district)) return false;
  if (heat < t.heat[0] || heat > t.heat[1] + 0.99) return false;
  const night = hour >= 19 || hour < 6;
  if (t.time === 'night' && !night) return false;
  if (t.time === 'day' && night) return false;
  if (t.id === 'rooftopChase' && weather === 'storm') return false; // nobody free-runs in a storm
  return true;
}

// Picks twists for a type: the tier's count, weighted by context (cocky gangs at high heat set
// ambushes; storms and blackouts follow the weather and the hour).
export function pickTwists(t, { tier = 0, rng, weather = 'clear', hour = 23, cocky = 0, players = 1, forced = null } = {}) {
  if (forced) return forced.filter((id) => TWISTS[id]);
  const n = TIERS[tier].twists;
  const pool = t.twists.filter((id) => {
    if (id === 'storm') return weather === 'rain' || weather === 'storm' || weather === 'snow';
    if (id === 'blackout') return hour >= 21 || hour < 5;
    if (id === 'split') return true;
    return true;
  });
  const weight = (id) => (id === 'ambush' ? 1 + cocky * 3 : id === 'split' && players > 1 ? 2 : id === 'storm' ? 2 : 1);
  const out = [];
  for (let k = 0; k < n && pool.length; k++) {
    const total = pool.reduce((s, id) => s + weight(id), 0);
    let r = rng.next() * total;
    let pick = pool[0];
    for (const id of pool) { r -= weight(id); if (r <= 0) { pick = id; break; } }
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  if (TIERS[tier].elite && t.twists.includes('elite') && !out.includes('elite')) out.push('elite');
  return out;
}

// Elite role by act (research 6.5: hard means mix, not health).
const ELITE = { 1: 'brute', 2: 'shield', 3: 'pistol', 4: 'ninja', 5: 'lieutenant' };

// The squad: composeWave lists placed in rings, split into waves; twists add an ambush wave from
// behind, a second wave, an elite. Two gangs for a war (half each, opposite sides).
export function composeSquad(t, built, c) {
  if (built.noSquad) return [];
  const budget = (t.budget || 4) + TIERS[c.tier].budget + (c.has('secondWave') ? 0 : 0);
  const gangs = t.twoGangs ? c.gangs : [c.gang];
  const waves = [];
  const main = [];
  gangs.forEach((g, gi) => {
    const w = composeWave({ budget: budget / gangs.length + (gangs.length > 1 ? 1 : 0), district: c.district, act: c.act, players: c.players, difficulty: c.difficulty, rng: c.rng, gang: lookOf(g) });
    const side = gangs.length > 1 ? (gi === 0 ? -1 : 1) : 0;
    const pts = ring(w.list.length, 4 + c.rng.next() * 1.5, c.rng.next() * 6);
    w.list.forEach((e, i) => main.push({ type: e.type, dx: pts[i].dx + side * 6, dz: pts[i].dz, gang: g, look: lookOf(g) }));
  });
  if (c.has('elite')) main.push({ type: ELITE[Math.min(5, c.act)] ?? 'brute', dx: 0, dz: -3, gang: c.gang, look: lookOf(c.gang), elite: true });
  const nWaves = built.waves ?? 1;
  if (nWaves > 1 && main.length >= 4) {
    const per = Math.ceil(main.length / nWaves);
    for (let i = 0; i < main.length; i += per) waves.push(main.slice(i, i + per));
  } else waves.push(main);
  if (c.has('secondWave')) waves.push(ring(3, 7, 1).map((p, i) => ({ type: i === 0 ? 'knife' : 'grunt', dx: p.dx, dz: p.dz, gang: c.gang, look: lookOf(c.gang) })));
  if (c.has('ambush')) waves.push(ring(3, 9, 2).map((p, i) => ({ type: i === 2 && c.act >= 3 ? 'pistol' : 'grunt', dx: p.dx, dz: p.dz + 4, gang: c.gang, look: lookOf(c.gang), ambush: true })));
  return waves;
}

// Base rewards; performance multiplies them (rewardsFor).
export const REWARD = { xpBase: 60, xpPerTier: 30, deep: 1.2, medium: 1, thin: 0.7 };

export function composeCrime(typeId, ctx) {
  const t = crimeType(typeId);
  if (!t) return null;
  const { spot, rng, geo } = ctx;
  const tier = ctx.tier ?? tierOfHeat(ctx.heat ?? 0);
  const control = ctx.control ?? {};
  const gang = ctx.gang ?? topGang(control);
  // A war needs a second gang: the district's runner-up, or a neighbour's crew.
  const others = Object.keys(control).filter((g) => g !== gang && g !== 'free' && control[g] > 0.02);
  const second = others[0] ?? (gang === 'street' ? 'joker' : 'street');
  const twists = pickTwists(t, { tier, rng, weather: ctx.weather, hour: ctx.hour, cocky: ctx.cocky ?? 0, players: ctx.players ?? 1, forced: ctx.twists ?? null });
  const c = {
    spot, district: spot.district, tier, rng, geo, players: ctx.players ?? 1, act: ctx.act ?? 2, difficulty: ctx.difficulty ?? 'normal',
    twists, gang, gangs: [gang, second], gangNames: { [gang]: gang, [second]: second },
    has: (id) => twists.includes(id),
  };
  const built = t.build(c);
  if (!built) return null;
  // Twists that change the objective itself.
  if (c.has('boobyTrap') && built.objective.kind !== 'chase') built.objective = { kind: 'all', parts: [built.objective, { kind: 'defuse', at: spot, timer: 50, need: 2, bombs: [{ dx: 3, dz: -3 }], text: 'A trap on the getaway car' }] };
  if (c.has('police') && !built.noSquad && built.objective.kind !== 'protect') built.objective = { kind: 'all', parts: [built.objective, { kind: 'protect', at: { x: spot.x + 6, y: spot.y, z: spot.z + 6 }, civilians: [{ dx: 0, dz: 0, panic: 0.1 }], rise: 0.02, optional: true, text: 'Cover the pinned-down officer', officer: true }] };
  const squad = composeSquad(t, built, c);
  const xp = Math.round((REWARD.xpBase + REWARD.xpPerTier * tier) * REWARD[t.depth] * (1 + twists.length * 0.15));
  return {
    type: t.id, title: t.title, alert: t.alert, depth: t.depth, optional: !!t.optional,
    spot: { ...spot }, place: built.place ?? null, district: spot.district, tier, twists, gang, gangs: t.twoGangs ? c.gangs : [gang],
    objective: built.objective, escalate: built.escalate ?? null, escalateAfter: built.escalateAfter ?? null, escalateTo: built.escalateTo ?? null,
    squad, squadAt: built.squadAt ?? null, squadDelay: !!built.squadDelay, nests: built.nests ?? null,
    props: built.props ?? {}, train: built.train ?? null, bridge: built.bridge ?? null, vehicle: !!built.vehicle, roof: !!built.roof, tailTarget: built.tailTarget ?? null,
    reward: { xp }, coop: t.coop,
  };
}

// Rewards by performance: civilians saved, arrests, silent, speed; penalties for hurt and collateral.
export function rewardsFor(plan, outcome, { arrests = 0, time = 0 } = {}) {
  let k = 1;
  k += 0.15 * (outcome.saved ?? 0) + 0.1 * arrests + (outcome.silent ? 0.2 : 0) + 0.1 * (outcome.defused ?? 0) + 0.1 * (outcome.caught ?? 0);
  k -= 0.25 * (outcome.hurt ?? 0) + 0.1 * (outcome.collateral ?? 0);
  if (time > 0 && time < 60) k += 0.15;
  k = Math.max(0.4, Math.min(2.5, k));
  const grade = k >= 1.8 ? 'A' : k >= 1.3 ? 'B' : k >= 0.9 ? 'C' : 'D';
  return { xp: Math.round(plan.reward.xp * k / 5) * 5, grade, k };
}
