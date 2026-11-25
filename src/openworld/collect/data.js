// Collectibles and activities across the new districts (workstream J3, item 7). Pure data: riddles
// answered at landmarks, hides at the regions' registered collectible sites, audio-log "city
// stories", photo spots, and trials (glide rings, an El-roof run, a rooftop run, combat maps).
// Every place is a REGION_SITES id (src/world/regions/data.js) or a literal point near one; the
// 12 core trophies (src/config/trophySpots.js) are separate and frozen.
//
// Trial medal times/scores are ESTIMATES from path length and speed (glide ~16 m/s, run ~7 m/s,
// arena scores scaled from the core Big Top), not measured runs: retune with
// scripts/challenge-tune.mjs once the courses have been flown.
import { REGION_SITES } from '../../world/regions/data.js';
import { withNormals } from '../../game/challenges.js';
import { composeWave } from '../../enemies/compose.js';
import { createRng } from '../../core/rng.js';

export const siteOf = (s) => (typeof s === 'string' ? REGION_SITES[s] ?? null : s);
const S = (id) => REGION_SITES[id];

// ------------------------------------------------------------------ riddles
// Answer: stand at the site (within radius, 8 m vertical); `scan` needs detective vision held there.
export const RIDDLES = [
  { id: 'rdWheel', district: 'amusementMile', riddle: 'I go round all night and never get anywhere. Everyone who rides me ends up where they started, minus a ticket.', answer: { site: 'ferrisWheel', radius: 14, scan: false } },
  { id: 'rdLighthouse', district: 'lake', riddle: 'I stand alone on the water and wink at every ship. I have never once been asked out.', answer: { site: 'lighthouse', radius: 10, scan: true } },
  { id: 'rdPlanetarium', district: 'museumCampus', riddle: 'Under my dome the stars come out at noon, and nobody ever needs a coat.', answer: { site: 'planetarium', radius: 14, scan: false } },
  { id: 'rdClockTower', district: 'arkham', riddle: 'My hands point at every patient, and I am the only one on the island they call sane.', answer: { site: 'arkhamClockTower', radius: 12, scan: true } },
  { id: 'rdFountain', district: 'robinsonPark', riddle: 'Founders drink from me forever and are never less thirsty. Wishes go in; nothing comes out.', answer: { site: 'foundersFountain', radius: 12, scan: false } },
  { id: 'rdExchange', district: 'loop', riddle: 'Climb my crown and the whole market looks small. I have bought and sold Gotham twice before lunch.', answer: { site: 'exchangeTop', radius: 10, scan: false } },
  { id: 'rdPumping', district: 'gothamMile', riddle: 'The fire could not take me; the shoppers barely notice me. I pump nothing now but tourists.', answer: { site: 'pumpingTowerTop', radius: 8, scan: true } },
  { id: 'rdOrpheum', district: 'parkRow', riddle: 'My name still shines over the alley. The last show ended badly, and the lights stayed on to remember it.', answer: { site: 'orpheumMarquee', radius: 10, scan: true } },
  { id: 'rdGate', district: 'chinatown', riddle: 'I have a roof, but no walls, and everyone walks through me without knocking.', answer: { site: 'chinatownGate', radius: 10, scan: false } },
  { id: 'rdSilos', district: 'yards', riddle: 'Six of us stand in a row, full of nothing but echoes. Climb the tallest and see the whole railyard yawn.', answer: { site: 'yardsSiloTop', radius: 10, scan: false } },
  { id: 'rdStack', district: 'narrows', riddle: 'They stacked the island on top of itself. At the top, the only neighbour is the wind.', answer: { site: 'narrowsStackTop', radius: 10, scan: false } },
  { id: 'rdBascule', district: 'river', riddle: 'I open my arms for every boat but hold the cars back. Half of me is always going up.', answer: { site: 'bridgeEast', radius: 12, scan: true } },
  { id: 'rdMirror', district: 'robinsonPark', riddle: 'Look into me and the city looks back, bent into a bean. I never blink.', answer: { site: 'parkMirror', radius: 12, scan: true } },
  { id: 'rdLocks', district: 'river', riddle: 'I raise the water without lifting a finger and lower it again without spilling a drop.', answer: { site: 'locks', radius: 12, scan: false } },
];

// ------------------------------------------------------------------ hides
// gate: null (open) or a gadget id (src/gadgets/gadgetDefs.js) the hide needs: gel for the cracked
// boards and plaster, claw for the vents and grilles, launcher for the ones across a gap. There is
// no runtime API to add breakable walls (src/world/breakables.js builds its fixed spots at boot),
// so the "breakable" hides are gadget-gated here instead.
export const HIDES = [
  { id: 'hdElTrack', site: 'elTrackCache', gate: null },
  { id: 'hdMile', site: 'mileCollectible', gate: 'claw' },
  { id: 'hdBoathouse', site: 'boathouseHide', gate: null },
  { id: 'hdPenny', site: 'pennyHide', gate: 'gel' },
  { id: 'hdCoaster', site: 'coasterCollectible', gate: 'launcher' },
  { id: 'hdArkham', site: 'arkhamBreach', gate: 'gel' },
  { id: 'hdBristolBoathouse', site: 'bristolBoathouse', gate: 'claw' },
  { id: 'hdBlackgate', site: 'blackgateCollectible', gate: null },
  { id: 'hdBarge', site: 'quayBargeHide', gate: null },
  { id: 'hdNarrows', site: 'narrowsHide', gate: 'gel' },
  { id: 'hdParkRow', site: 'parkRowHide', gate: null },
  { id: 'hdChinatown', site: 'chinatownHide', gate: 'launcher' },
  { id: 'hdYards', site: 'yardsHide', gate: 'claw' },
];
export const HIDE_GADGETS = [...new Set(HIDES.map((h) => h.gate).filter(Boolean))];

// ------------------------------------------------------------------ audio logs ("city stories")
const L = (speaker, text) => ({ speaker, text });
export const LOGS = [
  { id: 'lgLockKeeper', district: 'quay', site: 'lockKeeper', title: 'The lock keeper', lines: [
    L('civilian', 'Forty years on these locks. Boats go up, boats come down. Nobody ever says thank you to a lock.'),
    L('civilian', 'Last week a fella in a cape stood on my gate for an hour. Didn\'t say a word. Best company I\'ve had in years.')] },
  { id: 'lgElDriver', district: 'loop', site: 'elRiverside', title: 'Night shift on the El', lines: [
    L('civilian', 'Motorman log, three a.m. Passengers: two. One asleep. One on the roof.'),
    L('dispatch', 'Car four, confirm: someone is riding on the roof of your train?'),
    L('civilian', 'Confirmed. He waved. I waved back. We have an understanding.')] },
  { id: 'lgMarket', district: 'narrows', site: 'narrowsMarket', title: 'The market at midnight', lines: [
    L('civilian', 'My grandmother sold fish here when the bridges were wood. She said the Narrows has two kinds of nights.'),
    L('civilian', 'The kind where you lock the shutters, and the kind where you hear wings and leave them open a crack.')] },
  { id: 'lgOrpheum', district: 'parkRow', site: 'crimeAlley', title: 'The usher', lines: [
    L('civilian', 'I tore the tickets the night of that last show. A boy and his parents. Second row.'),
    L('civilian', 'I still sweep the alley every morning. Somebody should. Somebody leaves a rose there, too. Never see who.')] },
  { id: 'lgTemple', district: 'chinatown', site: 'chinatownTemple', title: 'The temple roof', lines: [
    L('civilian', 'The temple roof has four dragons and one gargoyle. The gargoyle is not ours. It arrived one night and stayed.'),
    L('civilian', 'We voted. The gargoyle can stay. It is very quiet, and the pigeons are afraid of it.')] },
  { id: 'lgDomes', district: 'littleOdessa', site: 'odessaChurchDomes', title: 'The bells of Odessa', lines: [
    L('civilian', 'Father Pavlo rings the bell when the mob\'s cars come down the street. Three rings means stay inside.'),
    L('civilian', 'Last month he rang it once and the cars turned around. Nobody knows what one ring means. The mob does not like not knowing.')] },
  { id: 'lgRoundhouse', district: 'yards', site: 'yardsRoundhouse', title: 'The roundhouse cat', lines: [
    L('civilian', 'Yard log: the roundhouse cat caught another rat the size of a suitcase. We have named the cat Commissioner.'),
    L('officer', 'I heard that. I am choosing to take it as a compliment.')] },
  { id: 'lgCauseway', district: 'arkham', site: 'causewayGate', title: 'The causeway guard', lines: [
    L('officer', 'Causeway checkpoint. Nobody in, nobody out, nobody on the water. Except the fog. The fog does what it likes.'),
    L('officer', 'Twelve years on this gate. Every breakout, they say it was the last one. I bring a bigger thermos every year.')] },
  { id: 'lgMarina', district: 'museumCampus', site: 'marinaDocks', title: 'The night watchman', lines: [
    L('civilian', 'The dinosaur in the museum hall has been there since my father was a boy. Some nights I could swear it turns its head.'),
    L('civilian', 'Other nights it is a man on the skylight, watching the trucks. I prefer the dinosaur. It is less judgemental.')] },
  { id: 'lgPier', district: 'amusementMile', site: 'pierBallroom', title: 'The last waltz', lines: [
    L('radioHost', 'Gotham Late Night FM, live from the old pier ballroom, where the band plays to an empty floor every Friday.'),
    L('radioHost', 'The bandleader says they play for the ghosts. The ghosts have requested something with more trumpet.')] },
  { id: 'lgBristolChurch', district: 'bristol', site: 'bristolChurch', title: 'The verger', lines: [
    L('civilian', 'St. Swithin\'s bell tower has a gargoyle that faces the manor. Old Mister Wayne paid for it. Said it was looking after the family.'),
    L('alfred', 'It has done a better job than some of the staff. I include myself on the evenings I am late with the tea.')] },
  { id: 'lgBoathouse', district: 'lake', site: 'boathouse', title: 'Rowing club minutes', lines: [
    L('civilian', 'Minutes of the Lakeshore Rowing Club: a member reports a large black boat moving with no lights and no engine noise.'),
    L('civilian', 'Motion to report it to the police: defeated. Motion to buy a boat like it: carried unanimously.')] },
];

// ------------------------------------------------------------------ photo spots
export const PHOTOS = [
  { id: 'phExchange', site: 'exchangeTop', radius: 14, subject: 'The Loop from the Exchange crown' },
  { id: 'phWheel', site: 'wheelTopVista', radius: 16, subject: 'The pier and the lake from the top of the wheel' },
  { id: 'phPlanetarium', site: 'planetariumVista', radius: 14, subject: 'The museum campus at night' },
  { id: 'phArkham', site: 'arkhamTowerVista', radius: 14, subject: 'Arkham Island from the clock tower' },
  { id: 'phBristol', site: 'bristolOverlook', radius: 14, subject: 'The city skyline from the Bristol hills' },
  { id: 'phLighthouse', site: 'lighthouseVista', radius: 14, subject: 'The harbour from the lighthouse gallery' },
  { id: 'phConservatory', site: 'conservatoryVista', radius: 14, subject: 'Robinson Park under glass' },
  { id: 'phBlackgate', site: 'blackgateTower', radius: 14, subject: 'Blackgate from the searchlight tower' },
];

// ------------------------------------------------------------------ trials
const ring = (x, y, z, r = 5) => ({ x, y, z, r, n: null });
const cp = (x, y, z, r, label, needs = null, h = 4) => ({ x, y, z, r, h, label, needs });
const len3 = (pts, start) => { let L = 0, p = start; for (const q of pts) { L += Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); p = q; } return L; };
// Estimated thresholds: gold at 1.15x the reference speed, silver at it, bronze at 0.8x.
const est = (len, speed) => ({ gold: Math.round(len / (speed * 1.15)), silver: Math.round(len / speed), bronze: Math.round(len / (speed * 0.8)) });
const at = (id, dy = 0) => ({ x: S(id).x, y: S(id).y + dy, z: S(id).z });

// A ring course from a site, along a heading, each ring `step` m on and `drop` m down.
function glide(startId, yaw, n, step, drop, r = 5) {
  const s = S(startId);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  return Array.from({ length: n }, (_, i) => ring(s.x + fx * step * (i + 1), s.y - drop * (i + 1), s.z + fz * step * (i + 1), r));
}

const RAW_TRIALS = [
  // Glide courses. Rings in open air, dropping about 1 m per 5 m forward.
  { id: 'trExchangeDrop', name: 'Exchange Drop', kind: 'rings', district: 'loop', startSite: 'exchangeTop', yaw: Math.PI / 2,
    blurb: 'Off the Exchange crown and east down the canyon street, ring to ring.', rings: glide('exchangeTop', Math.PI / 2, 6, 38, 7) },
  { id: 'trPumpingGlide', name: 'Over the Park', kind: 'rings', district: 'gothamMile', startSite: 'pumpingTowerTop', yaw: Math.PI / 2,
    blurb: 'From the pumping tower out over Robinson Park.', rings: glide('pumpingTowerTop', Math.PI / 2, 5, 28, 5) },
  { id: 'trWheelGlide', name: 'Wheel to Shore', kind: 'rings', district: 'amusementMile', startSite: 'wheelTopVista', yaw: -Math.PI / 2,
    blurb: 'Drop off the top of the Ferris wheel and glide back to the shore.', rings: glide('wheelTopVista', -Math.PI / 2, 6, 30, 6) },
  { id: 'trStackDive', name: 'Stack Dive', kind: 'rings', district: 'narrows', startSite: 'narrowsStackTop', yaw: 0,
    blurb: 'Off the top of the Stack and south over the Narrows rooftops.', rings: glide('narrowsStackTop', 0, 4, 26, 4.5) },
  // El-roof run: station to station along the Loop's elevated deck.
  { id: 'trElLoop', name: 'Round the Loop', kind: 'parkour', district: 'loop', startSite: 'elRiverside', yaw: Math.PI / 2,
    blurb: 'Run the El deck from Riverside round the whole Loop. Trains have right of way.',
    checkpoints: [cp(85, 8.6, -449, 9, 'City Hall station'), cp(0, 8.6, -544, 9, 'Lafayette station'), cp(-95, 8.6, -449, 9, 'Kane station'), cp(0, 8.6, -363.9, 9, 'Back at Riverside')] },
  // Rooftop run: the Gazette roof to the Iceberg Lounge's roof, via the El and Diamond Row.
  { id: 'trGazetteIceberg', name: 'Gazette to the Iceberg', kind: 'parkour', district: 'loop', startSite: 'gazetteRoof', yaw: Math.PI,
    blurb: 'Off the Gazette roof, over the El, down Diamond Row and up onto the Iceberg Lounge.',
    checkpoints: [cp(0, 8.6, -544, 9, 'The El at Lafayette'), cp(0, 0.1, -681, 10, 'Diamond Row'), cp(72, 22, -613, 9, 'The Iceberg roof', null, 6)] },
  // Combat maps (arena scoring through the encounter system). Scores scaled from the Big Top.
  { id: 'trAlleyBrawl', name: 'Loop Alley Brawl', kind: 'arena', district: 'loop', startSite: 'loopAlleyWest', yaw: 0, act: 2, gang: 'twoFace',
    blurb: 'Three waves of the Coin crew in the alley off the canyon street.', waves: [5, 7, 9], medals: { gold: 3600, silver: 2400, bronze: 1400 } },
  { id: 'trDiamondBrawl', name: 'Diamond Row Rumble', kind: 'arena', district: 'gothamMile', startSite: 'diamondAlley', yaw: 0, act: 3, gang: 'penguin',
    blurb: 'The Umbrella Men want their alley back. Three waves, mixed roles.', waves: [6, 8, 10], medals: { gold: 4200, silver: 2800, bronze: 1600 } },
  { id: 'trYardRiot', name: 'Yard Time', kind: 'arena', district: 'blackgate', startSite: 'blackgateYard', yaw: 0, act: 4, gang: 'joker',
    blurb: 'The Blackgate exercise yard, after lights out. Four waves.', waves: [6, 8, 10, 12], medals: { gold: 5400, silver: 3600, bronze: 2000 } },
];

// Arena waves: composeWave lists in a ring around the start, deterministic per trial id.
function arenaWaves(t) {
  let h = 0;
  for (const c of t.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const rng = createRng(h);
  return t.waves.map((budget) => {
    const { list } = composeWave({ budget, act: t.act, rng, gang: t.gang });
    return list.map((e, i) => { const a = (i / list.length) * Math.PI * 2; return { type: e.type, dx: Math.sin(a) * 6, dz: Math.cos(a) * 6 }; });
  });
}

export const TRIALS = RAW_TRIALS.map((t) => {
  const start = { ...at(t.startSite), yaw: t.yaw };
  const out = { ...t, start };
  if (t.rings) { out.rings = withNormals(t.rings, start); out.medals = est(len3(t.rings, start), 16); out.limit = Math.round(out.medals.bronze * 2); }
  if (t.checkpoints) { out.checkpoints = withNormals(t.checkpoints, start, true); out.medals = est(len3(t.checkpoints, start), 7); out.limit = Math.round(out.medals.bronze * 2.5); }
  if (t.kind === 'arena') out.fight = { site: { x: start.x, y: start.y, z: start.z }, radius: 16, gang: t.gang, waves: arenaWaves(t) };
  return out;
});
// The predator challenge maps are the stealth encounters (src/openworld/stealth/, another module):
// their ids are listed by that module; this list is the placeholder the Batcomputer merges.
export const PREDATOR_MAPS = [];

export const KINDS = ['riddles', 'hides', 'logs', 'photos'];
export const COLLECTIBLES = { riddles: RIDDLES, hides: HIDES, logs: LOGS, photos: PHOTOS };
// Where an item is (its answer/site resolved to a point).
export function placeOf(kind, item) {
  if (kind === 'riddles') return siteOf(item.answer.site);
  if (kind === 'trials') return item.start;
  return siteOf(item.site);
}
