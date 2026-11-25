// Night Three, "Know-It-All" (Act II, The Gilded City): the man who read the Penguin's ledger first
// turns the Loop into a quiz show. He has the proxy votes the Penguin was selling and wants the
// world's greatest detective to earn them back, one riddle at a time, live on the Gazette's screens.
// Verbs in order: fight (the new baton role), detective scan, a timed death-trap run on the El,
// a plate puzzle on the City Hall steps, a predator alley, a timed trap at the foot of Wayne Tower
// and its clue, the twist (he has mapped every route Batman takes), a fight on the Exchange steps,
// the climb to the Gazette roof and the boss: a puzzle, not a brawl (src/bosses/defs/riddler.js).
// [m23] Four more missions (docs/design/briefs/missions-round.md): the Ferris wheel on Amusement
// Mile (a run east over City Hall and the park, then a rescue against a clock), the second delivery
// (the night's only car chase, along Lower Gotham), the frame-up (the police are sent his map of
// Batman's routes: lose them) and the watchers' nest across from Wayne Tower (a case with a board
// and a radio trail that ends at the Exchange).
// [m23] Second pass, each of the four deepened with a real second stage: the wheel shakes loose
// (a run down the pier and a predator room at the ballroom doors), the van's hideout under the
// river arches (a predator room), the proof for Gordon (the vault scanned again, a meeting on the
// El platform) and the relay on the clearing house roof beside the Exchange (a predator room).
// Every site below was checked against the live collision (groundBelow) on 2026-11-24.
import { titleCard } from '../../ui/comicArt.js';
import { villainCard } from '../../bosses/defs/penguinRiddlerArt.js';
import { W, route } from '../rooms.js';
import { v, recap } from './common.js'; // [story2]

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const SOUTH = 0, NORTH = Math.PI, EAST = Math.PI / 2, WEST = -Math.PI / 2;

const sites = {
  n3Loop: { x: -30, y: 0, z: -330 },
  n3Bank: { x: -150, y: 0, z: -500 },
  n3BankN: { x: -150, y: 0, z: -490 },
  n3BankS: { x: -150, y: 0, z: -512 },
  n3El1: { x: -90, y: 7.26, z: -400 },
  n3El2: { x: -90, y: 7.26, z: -490 },
  n3El3: { x: -30, y: 7.26, z: -539 },
  n3El4: { x: 60, y: 7.26, z: -539 },
  n3El5: { x: 90, y: 7.26, z: -490 },
  n3El6: { x: 90, y: 7.26, z: -420 },
  n3CityHall: { x: 160.6, y: 1.35, z: -449 },
  n3CityHallStreet: { x: 146, y: 0, z: -449 },
  n3PlateN: { x: 159.5, y: 1.08, z: -456 },
  n3PlateS: { x: 159.5, y: 1.08, z: -442 },
  n3PlateE: { x: 160.5, y: 1.35, z: -449 },
  n3PlateW: { x: 147, y: 0, z: -449 },
  n3PlateC: { x: 153.5, y: 0, z: -449 },
  n3Alley: { x: -240, y: 0.15, z: -450 },
  n3AlleyEntry: { x: -252, y: 26, z: -466 },
  n3Cipher: { x: -240, y: 0.15, z: -428 },
  n3Trivia: { x: -150, y: 0, z: -419 },
  n3Plaza: { x: 0, y: 0, z: -420 },
  n3Trap1: { x: -14, y: 0, z: -418 },
  n3Trap2: { x: 14, y: 0, z: -418 },
  n3Trap3: { x: 0, y: 8.6, z: -431 },
  n3Trap4: { x: 0, y: 0, z: -410 },
  n3LobbyDoor: { x: 0, y: 0.15, z: -432.6 },
  n3Exchange: { x: -150, y: 0, z: -539 },
  n3Lookout: { x: -60, y: 40, z: -495 },
  n3GazetteCP: { x: 2, y: 48, z: -496, yaw: NORTH },
  n3RiddlerArena: { x: 2, y: 48, z: -510 },
  n3RiddlerStart: { x: 2, y: 48, z: -524 },
  // [story2] the City Hall charity gala, and the bomb in the canyon
  n3GalaFront: { x: 146, y: 0, z: -449 },
  n3GalaNorth: { x: 146, y: 0, z: -462 },
  n3GalaSouth: { x: 146, y: 0, z: -436 },
  n3Bomb: { x: -141, y: 0, z: -500 },
  n3BombA: { x: -146, y: 0, z: -494 },
  n3BombB: { x: -141, y: 0, z: -508 },
  // [m23] east to the pier: City Hall's roof, the park fountain, the pier gate, the wheel
  n3Dome: { x: 172, y: 26, z: -436 },
  n3PierGate: { x: 392, y: 3, z: -450 },
  n3WheelFoot: { x: 430, y: 3, z: -459 },
  // (the levers keep 20 m clear of the open world's Pier After Hours doorway at 455, -460)
  n3Wheel: { x: 436, y: 3, z: -452 },
  n3LeverA: { x: 432, y: 3, z: -462 },
  n3LeverB: { x: 418, y: 3, z: -440 },
  n3LeverC: { x: 447, y: 3, z: -437 },
  n3BackLoop: { x: 120, y: 0, z: -419 },
  // [m23] the delivery van: Lower Gotham's upper deck
  n3VanCar: { x: -210, y: 0, z: -400, yaw: SOUTH },
  n3VanStop: { x: 30, y: 0, z: -291 },
  n3VanA: { x: 26, y: 0, z: -288 },
  n3VanB: { x: 35, y: 0, z: -295 },
  // [m23] the watchers' nest: the flat roof across the street from Wayne Tower, and the relay
  n3Nest: { x: -60, y: 54, z: -446 },
  n3Relay: { x: -128, y: 0, z: -545 },
  // [m23] second pass: the east end of the pier (open deck between the funhouse and the ballroom)
  n3Pier1: { x: 490, y: 3, z: -440 },
  n3Pier2: { x: 522, y: 3, z: -440 },
  n3PierEnd: { x: 546, y: 3, z: -440 },
  n3Deck: { x: 574, y: 3, z: -450 },
  n3BrakeKey: { x: 588, y: 3, z: -450 },
  // the river walk west of the Loop bridge (a 6 m strip under the Lower Gotham deck)
  n3ArchEntry: { x: -48, y: -4.5, z: -271 },
  n3Arch: { x: -90, y: -4.5, z: -271 },
  n3ArchMap: { x: -124, y: -4.5, z: -271 },
  // the bank again, for the proof
  n3Proof1: { x: -154, y: 0, z: -498 },
  n3Proof2: { x: -146, y: 0, z: -506 },
  // the darkroom on the City Hall roof (26 m, a dome in the middle) and the taller block east of it
  n3DarkEntry: { x: 222, y: 44.5, z: -448 },
  n3Dark: { x: 181, y: 26, z: -437 },
  n3Negative: { x: 184, y: 26, z: -434 },
  // the clearing house: the low flat roof (28 m) west of the Exchange, and the Exchange ledge above it
  n3ExchLedge: { x: -174, y: 56, z: -566 },
  n3Clear: { x: -240, y: 28, z: -568 },
  n3RelayCore: { x: -228, y: 28, z: -576 },
};

const fights = {
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n3Quiz: { site: 'n3Loop', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 4, ring: 4.5 }] },
  n3Riddlers: { site: 'n3Trivia', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 5, ring: 4.5 }] },
  n3Couriers: { site: 'n3BankS', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 5, ring: 4.5 }] },
  bank: { site: 'n3Bank', radius: 14, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 4, lead: 'baton', ring: 6 }, { budget: 7, ring: 7 }] },
  trivia: { site: 'n3Trivia', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 3, ring: 4 }] },
  lookout: { site: 'n3Lookout', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [[{ type: 'grunt', dx: -2, dz: -2 }, { type: 'knife', dx: 2, dz: 1 }]] },
  alley: { stealth: 'deliveryAlley' },
  darkroom: { stealth: 'darkroom' }, ballroomDeck: { stealth: 'ballroomDeck' }, riverArch: { stealth: 'riverArch' }, clearingRoof: { stealth: 'clearingRoof' }, // [m23]
  exchange: { site: 'n3Exchange', radius: 14, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 7, ring: 6, lead: 'baton' }, { budget: 9, ring: 7, add: [{ type: 'brute', dx: 0, dz: 6 }] }] },
  // [m23]
  wheelCrew: { site: 'n3Wheel', radius: 20, gang: 'riddler', act: 2, district: 'amusementMile', waves: [{ budget: 6, spots: [[-6, -8], [-16, 10], [9, 13], [-1, -12], [-20, 14], [12, 14], [0, 6]] }] },
  vanCrew: { site: 'n3VanStop', radius: 14, gang: 'riddler', act: 2, district: 'lowerGotham', waves: [{ budget: 5, ring: 6, lead: 'baton' }, { budget: 6, ring: 7, lead: 'shield' }] },
  nest: { site: 'n3Nest', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [[{ type: 'rifle', dx: 9, dz: -9 }, { type: 'grunt', dx: -4, dz: 3 }, { type: 'baton', dx: 4, dz: 4 }, { type: 'knife', dx: -7, dz: -6 }]] },
  // [story2]
  bombCrew: { site: 'n3Bomb', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 5, ring: 6, lead: 'baton' }] },
  exchangeBig: { site: 'n3Exchange', radius: 14, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 7, ring: 6, lead: 'baton' }, { budget: 9, ring: 7, add: [{ type: 'brute', dx: 0, dz: 6 }] }, { budget: 8, ring: 7, lead: 'shield' }] },
};

// The Question Mark Delivery depot: a 5 m alley between a 26 m and a 40 m block, riflemen on both
// roofs, two on the alley floor, lamp posts at either end and a dark middle.
const rooms = {
  deliveryAlley: {
    id: 'deliveryAlley', site: 'n3Alley', entry: 'n3AlleyEntry', radius: 26, gang: 'riddler',
    bounds: { minX: -262, maxX: -222, minY: -1, maxY: 45, minZ: -470, maxZ: -428 },
    lights: [{ x: -240, y: 4, z: -462, r: 5, post: true, base: 0.15 }, { x: -240, y: 4, z: -436, r: 5, post: true, base: 0.15 }],
    cover: [{ x: -239, y: 0.15, z: -452, w: 1.4, d: 1.6, h: 1.4 }, { x: -241, y: 0.15, z: -444, w: 1.4, d: 1.6, h: 1.4 }],
    huddle: { x: -240, y: 0.15, z: -448 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(-256, 26, -460, 2, EAST), W(-248, 26, -436, 2, EAST)) },
      { type: 'rifle', route: route('pingpong', W(-232, 40, -436, 2, WEST), W(-228, 40, -460, 2, WEST)) },
      { type: 'grunt', route: route('pingpong', W(-240, 0.15, -466, 3, NORTH), W(-240, 0.15, -434, 3, SOUTH)) },
      { type: 'knife', route: route('pingpong', W(-240, 0.15, -440, 4, SOUTH), W(-240, 0.15, -456, 4, NORTH)) },
    ],
  },
  // [m23] The east end of the pier: open deck between the funhouse and the ballroom doors, strung
  // with fairground bulbs. Six of his crew and the foreman with the brake key.
  ballroomDeck: {
    id: 'ballroomDeck', site: 'n3Deck', entry: 'n3PierEnd', radius: 30, gang: 'riddler',
    bounds: { minX: 540, maxX: 600, minY: 0, maxY: 20, minZ: -468, maxZ: -430 },
    lights: [{ x: 560, y: 7, z: -444, r: 5, post: true, base: 3 }, { x: 588, y: 7, z: -456, r: 5, post: true, base: 3 }, { x: 576, y: 7, z: -438, r: 5, post: true, base: 3 }],
    cover: [{ x: 564, y: 3, z: -456, w: 1.6, d: 1.6, h: 1.4 }, { x: 584, y: 3, z: -452, w: 1.6, d: 1.6, h: 1.4 }, { x: 590, y: 3, z: -461, w: 1.6, d: 1.6, h: 1.4 }, { x: 556, y: 3, z: -448, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: 574, y: 3, z: -450 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(594, 3, -440, 3, WEST), W(594, 3, -460, 3, WEST)) },
      { type: 'grunt', route: route('pingpong', W(558, 3, -461, 3, EAST), W(588, 3, -461, 3, WEST)) },
      { type: 'knife', route: route('pingpong', W(562, 3, -438, 3, EAST), W(590, 3, -438, 3, WEST)) },
      { type: 'baton', route: route('pingpong', W(570, 3, -450, 4, EAST), W(586, 3, -450, 4, WEST)) },
      { type: 'grunt', route: route('pingpong', W(566, 3, -454, 4, NORTH), W(566, 3, -442, 4, SOUTH)) },
      { type: 'grunt', route: route('loop', W(580, 3, -456, 2), W(590, 3, -456, 2, WEST), W(590, 3, -447, 2), W(580, 3, -447, 2, EAST)) },
    ],
  },
  // [m23] The delivery crew's hideout: the river walk under the Lower Gotham deck, west of the
  // bridge. A 6 m strip, two lamps, crates. Four men, one rifle.
  riverArch: {
    id: 'riverArch', site: 'n3Arch', entry: 'n3ArchEntry', radius: 44, gang: 'riddler',
    bounds: { minX: -134, maxX: -42, minY: -7, maxY: 0, minZ: -276, maxZ: -266 },
    lights: [{ x: -70, y: -1.5, z: -269, r: 5, post: true, base: -4.5 }, { x: -108, y: -1.5, z: -269, r: 5, post: true, base: -4.5 }],
    cover: [{ x: -60, y: -4.5, z: -272, w: 1.4, d: 1.4, h: 1.4 }, { x: -82, y: -4.5, z: -269.5, w: 1.4, d: 1.4, h: 1.4 }, { x: -98, y: -4.5, z: -272, w: 1.4, d: 1.4, h: 1.4 }, { x: -116, y: -4.5, z: -270, w: 1.4, d: 1.4, h: 1.4 }],
    huddle: { x: -90, y: -4.5, z: -271 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(-64, -4.5, -271, 2, WEST), W(-118, -4.5, -271, 2, EAST)) },
      { type: 'grunt', route: route('pingpong', W(-76, -4.5, -272, 3, WEST), W(-104, -4.5, -272, 3, EAST)) },
      { type: 'knife', route: route('pingpong', W(-94, -4.5, -270, 4, WEST), W(-126, -4.5, -270, 4, EAST)) },
      { type: 'baton', route: route('pingpong', W(-128, -4.5, -271, 5, EAST), W(-128, -4.5, -270, 5, EAST)) },
    ],
  },
  // [m23] The darkroom: the faked picture was printed under the gala's lighting rigs on the City
  // Hall roof (26 m; the dome stands in the middle, so the squad walks the four sides). Five men.
  // Come across from the taller block to the east.
  darkroom: {
    id: 'darkroom', site: 'n3Dark', entry: 'n3DarkEntry', radius: 30, gang: 'riddler',
    bounds: { minX: 162, maxX: 228, minY: 24, maxY: 50, minZ: -470, maxZ: -426 },
    lights: [{ x: 172, y: 30, z: -434, r: 5, post: true, base: 26 }, { x: 190, y: 30, z: -462, r: 5, post: true, base: 26 }],
    cover: [{ x: 180, y: 26, z: -432.5, w: 1.6, d: 1.6, h: 1.4 }, { x: 186, y: 26, z: -464.5, w: 1.6, d: 1.6, h: 1.4 }, { x: 172.5, y: 26, z: -447, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: 182, y: 26, z: -437 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(170, 26, -462, 3, EAST), W(194, 26, -462, 3, WEST)) },
      { type: 'grunt', route: route('pingpong', W(170, 26, -436, 3, EAST), W(194, 26, -436, 3, WEST)) },
      { type: 'knife', route: route('pingpong', W(169, 26, -458, 4, SOUTH), W(169, 26, -440, 4, NORTH)) },
      { type: 'baton', route: route('pingpong', W(194, 26, -441, 4, NORTH), W(194, 26, -457, 4, SOUTH)) },
      { type: 'shield', route: route('pingpong', W(176, 26, -439.5, 5, EAST), W(189, 26, -439.5, 5, WEST)) },
    ],
  },
  // [m23] The relay: the clearing house roof (28 m, flat) across the street from the Exchange's west
  // side. Six men round a dish. Come down from the Exchange ledge above it.
  clearingRoof: {
    id: 'clearingRoof', site: 'n3Clear', entry: 'n3ExchLedge', radius: 30, gang: 'riddler',
    bounds: { minX: -264, maxX: -170, minY: 26, maxY: 60, minZ: -586, maxZ: -546 },
    lights: [{ x: -252, y: 32, z: -576, r: 5, post: true, base: 28 }, { x: -228, y: 32, z: -554, r: 5, post: true, base: 28 }],
    cover: [{ x: -250, y: 28, z: -560, w: 1.6, d: 1.6, h: 1.4 }, { x: -230, y: 28, z: -570, w: 1.6, d: 1.6, h: 1.4 }, { x: -244, y: 28, z: -576, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: -234, y: 28, z: -574 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(-256, 28, -579, 3, EAST), W(-224, 28, -579, 3, WEST)) },
      { type: 'grunt', route: route('pingpong', W(-256, 28, -554, 3, EAST), W(-224, 28, -554, 3, WEST)) },
      { type: 'knife', route: route('pingpong', W(-258, 28, -574, 4, SOUTH), W(-258, 28, -556, 4, NORTH)) },
      { type: 'baton', route: route('pingpong', W(-222, 28, -556, 4, NORTH), W(-222, 28, -574, 4, SOUTH)) },
      { type: 'shield', route: route('pingpong', W(-248, 28, -572, 5, EAST), W(-232, 28, -572, 5, WEST)) },
    ],
  },
};

const scenes = {
  // [story2]
  n3Recap: (stage) => recap(stage, {
    title: 'Last call at the Iceberg',
    panels: [
      'The Penguin is in custody, his ledger is in evidence, and the proxy votes he was selling for the Narrows land are missing.',
      { shot: { cam: [40, 30, -590], look: [49, 22, -623] }, caption: 'Somebody read that ledger before the police did. Somebody who signs his work.' },
      { shot: { cam: [-20, 40, -380], look: [0, 30, -450] }, caption: 'Tonight every screen in the Loop has a question mark on it.' },
    ],
  }),
  n3Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [8, 4, -414], look: [0, 6, -432], hero: { at: [0, 0.15, -427], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'Taped inside the Wayne Tower lobby door: a map of the Loop.' },
      { img: villainCard('riddler', 'EVERY ROUTE YOU TAKE', 'numbered, timed, annotated'), caption: 'Every rooftop Batman has crossed this month, numbered in green ink.', captionPos: 'bottom' },
      { img: titleCard('ROUTE 1: WAYNE TOWER', 'he always starts here. why?'), caption: 'And every route begins at the same building.', captionPos: 'bottom' },
    ],
  }],
  riddlerIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [14, 54, -490], look: [2, 49, -515], hero: { at: [2, 48, -497], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The Gazette roof. Every screen in the Loop is showing it.' },
      { img: villainCard('riddler', 'RIDDLE ME LIVE', 'tonight\'s contestant: you'), balloons: [{ text: 'No punching, no gadgets on the host. Answers only. You do read, Detective? Out loud, ideally.', x: 50, y: 5, w: 80 }] },
    ],
  }],
  riddlerOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [8, 51, -512], look: [2, 48.6, -522], hero: { at: [3, 48, -519], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The show is cancelled. The host is zip-tied to his own podium.' },
      { img: villainCard('riddler', 'ONE LAST QUESTION', 'he always has one'), balloons: [{ text: 'Riddle me this. Why does the Bat always start at Wayne Tower? I will work it out. I always do.', x: 50, y: 5, w: 80 }] },
    ],
  }],
  n3End: () => [{ layout: 'single', panels: [{ span: 'full', img: titleCard('END OF ACT TWO', 'The votes are back. The question is not going away.') }] }],
};

const PLATES = [
  { id: 'E', site: 'n3PlateE', label: 'East, by the doors' },
  { id: 'S', site: 'n3PlateS', label: 'South' },
  { id: 'W', site: 'n3PlateW', label: 'West, on the street' },
  { id: 'C', site: 'n3PlateC', label: 'The middle of the square' },
  { id: 'N', site: 'n3PlateN', label: 'North' },
];

export default {
  id: 'n3', act: 'act2', number: 3, actNumber: 2,
  title: 'Night Three: Know-It-All',
  blurb: 'Riddles across the Loop: a bank, the El, City Hall, Wayne Tower and a quiz show on the Gazette roof.',
  villain: 'riddler', gang: 'riddler',
  districts: ['loop', 'lowerGotham', 'amusementMile'],
  timeOfDay: 22, weather: 'drizzle',
  start: 'n3Loop',
  day: {
    hook: 'day.n3',
    context: {
      after: 'n2', mood: 'the vote',
      appointments: [{ at: '09:00', what: 'Wayne Enterprises board: the rescheduled Narrows vote', place: 'wayneTowerLobby' }, { at: '19:30', what: 'Dinner with Lucius: the stolen proxy votes', place: 'wayneTowerLobby' }],
      news: 'The Penguin is in Blackgate. The proxy votes he sold are missing, and the Gazette has received a crossword with no clues.',
    },
    fallback: [
      g('alfred', 'The vote was postponed again, sir. The proxy papers the Penguin sold have vanished from the evidence room. In their place, a single green question mark.'),
      g('alfred', 'And every screen in the Loop has been showing a countdown since six. I asked it what it was counting down to. It asked me a riddle back.'),
    ],
  },
  sites, fights, rooms, scenes,
  // [m23] fill light over the new set pieces (src/story/missions/n2/fills.js): no scene too dark to read
  fills: [
    { id: 'wheel', x: 436, y: 3, z: -450, r: 26 },
    { id: 'vanStop', x: 30, y: 0, z: -291, r: 18 },
    { id: 'nest', x: -60, y: 54, z: -448, r: 22 },
    { id: 'ballroomDeck', x: 572, y: 3, z: -450, r: 30 },
    { id: 'riverArch', x: -90, y: -4.5, z: -271, r: 46, height: 4, intensity: 34 },
    { id: 'clearingRoof', x: -240, y: 28, z: -566, r: 26 },
    { id: 'darkroom', x: 181, y: 26, z: -448, r: 22 },
  ],
  missions: [
    {
      id: 'm3Opening', title: 'Riddle Me Live',
      steps: [
        { id: 'n3Recap', type: 'cutscene', scene: 'n3Recap' },
        {
          id: 'n3Start', text: 'Every screen in the Loop is counting down. Head downtown.', site: 'n3Loop', radius: 20,
          interrupts: [{ id: 'n3Quiz', at: 'n3Loop', radius: 24, fight: 'n3Quiz', xp: 80, label: "Optional: the pop quiz is over", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Units in the Loop: masked men stopping commuters with a quiz. Wrong answers lose their wallets." }] }], // [balance]
          // A clear dusk over the Loop for the opening; the drizzle comes in with the first fight.
          time: 19.75, weather: 'clear',
          title: { text: 'NIGHT THREE: KNOW-IT-ALL', sub: 'The Loop' },
          nudge: g('oracle', 'The Loop, north of the river. You cannot miss it, it is the part with all the screens shouting at you.'),
          lines: [
            g('riddler', 'Good evening, Gotham! And good evening to the man in the cape. Yes, you. I can see you reading this.'),
            g('riddler', 'I have the proxy votes the Penguin was selling. Want them back? Then play. First question is at the bank on the canyon. Do try to keep up.'),
            g('gordon', 'He is on every screen downtown. Bank alarm on the canyon street, west side of the Loop.'),
          ],
          banter: [
            g('radio', 'All units, a man in a cape on the El roof. ...Disregard. Dispatch says we all know who that is.'),
            g('oracle', 'He has hacked every billboard in the Loop. One of them is now an advert for a self-help book called "Being Right". Written by him.'),
          ],
        },
      ],
    },
    {
      id: 'm3Bank', title: 'The First Question', rewards: ['xp:150'], checkpoint: 'n3Loop',
      steps: [
        {
          id: 'bankFight', type: 'fight', fight: 'bank', text: 'His crew is robbing the bank. Baton goons: dodge the swing, then stun them or hit from behind.',
          tip: { title: 'NEW: BATON GOON', text: 'A charged stun baton shocks a bare fist. Dodge his swing, then cape stun or batarang him, or hit him from behind or from the air. A strike while he is stunned takes the baton.' },
          lines: [
            g('goon', 'Why do we wear question marks? Branding, he says. Does that not make us easy to spot? Do not say "question" around here, he says.'),
            g('goon', 'He said the Bat would be here in four minutes. It has been three. The boss is never wrong. I hate that.'),
          ],
        },
        {
          id: 'bankScan', type: 'scan', text: 'Detective vision: the vault door, the cameras and the getaway point. Find the next question.', hold: 1.2,
          points: [
            { site: 'n3Bank', lines: [g('oracle', 'The vault was opened, not cracked. He had the code. The receipt says "Question one: where do trains go to think?"')] },
            { site: 'n3BankN', lines: [g('oracle', 'He spray painted the camera lens green. With a question mark. On a camera. That is just showing off.')] },
            { site: 'n3BankS', lines: [g('gordon', 'Trains thinking. The El. He means the El, Batman. Something is on the tracks.')] },
          ],
          nudge: g('oracle', 'Three spots glow in detective vision: the vault door, the camera on the north side and the kerb on the south.'),
        },
      ],
    },
    {
      id: 'm3El', title: 'Express Service', rewards: ['xp:250'], checkpoint: 'n3Bank',
      steps: [
        {
          id: 'elRun', type: 'traverse', text: 'He has rigged the El signals. Reach every junction box on the track before the express does.', checkpoint: 'n3Bank',
          gates: ['n3El1', 'n3El2', 'n3El3', 'n3El4', 'n3El5', 'n3El6'], timer: 75, bonus: 6, radius: 5,
          lines: [
            g('oracle', 'He has switched the express onto the closed spur at City Hall. Six junction boxes on the track. Reach each one and I can switch them back.'),
            g('gordon', 'There are people on that train, Batman. Go.'),
          ],
          failLines: [g('oracle', 'The train stopped at the last signal, it is safe for now, but the boxes reset. Back to the first one.')],
          // [story2] Dick's birthday, mid-run
          calls: [{
            id: 'birthday', from: 'alfred', after: 12, timeout: 12, default: 'late',
            lines: [g('alfred', 'Sir, a reminder: it is Master Dick\'s birthday. I have made the cake with the candles you said he would hate. He is asking where you are.')],
            prompt: 'Dick\'s birthday dinner, at the Manor, now',
            options: [
              { id: 'invite', tag: 'family', text: 'Tell him to suit up. Dinner can wait an hour.', effects: { threads: { ward: 0.6 }, patience: -4 }, lines: [g('nightwing', 'Best birthday present ever. I mean it. The cake can come too.'), g('alfred', 'The cake cannot come too.')] },
              { id: 'late', tag: 'sorry', text: '"Save me a slice. I will be late."', effects: { threads: { ward: -0.4, alfred: -0.2 } }, lines: [g('alfred', 'I shall save you a slice, sir. I shall also save you the look on his face.')] },
              { id: 'home', tag: 'go home', text: 'Ask Oracle to watch the Loop for twenty minutes. Go home for the candles.', effects: { threads: { ward: 0.8, alfred: 0.3 }, city: -3 }, lines: [g('oracle', 'Twenty minutes. I am timing you. Happy birthday, Dick.')] },
            ],
          }],
        },
      ],
    },
    // [m23] The bonus round: the people who could take him off the air are on the Ferris wheel.
    {
      id: 'm3Wheel', title: 'Round and Round', rewards: ['xp:250'], checkpoint: 'n3El6',
      steps: [
        {
          id: 'wheelRun', type: 'traverse', text: 'Bonus round. The Gazette night desk is locked on the Ferris wheel at Amusement Mile, and it is speeding up. East: City Hall roof, the park, the pier.',
          gates: ['n3Dome', 'foundersFountain', 'n3PierGate', 'n3WheelFoot'], timer: 110, bonus: 10, radius: 6, vertical: 6,
          tutorial: ['glide', 'reGrapple'],
          lines: [
            g('riddler', 'The train is safe! How dull. Bonus round. What goes round and round and never arrives? The Gazette night desk. I have put them on the big wheel. It is getting faster.'),
            g('oracle', 'Amusement Mile, the pier, east of the park. The wheel motor is running over its limit. Go over City Hall and glide the park. If Lucius fitted the wing membrane, this is the night for it.'),
          ],
          failLines: [g('oracle', 'The wheel tripped its own breaker and slowed. He has reset it. From the track again, and do not stop to admire the fountain.')],
        },
        {
          id: 'wheelRescue', type: 'rescue', text: 'Pull the three gondola releases at the foot of the wheel before the motor burns out', checkpoint: 'n3PierGate', retry: true,
          timer: 120, hold: 2.2, guard: 'wheelCrew', prop: 'lever', workLabel: 'PULLING THE RELEASE', freedWord: 'CLUNK!',
          captives: [
            { id: 'editor', site: 'n3LeverA', label: 'The night editor', lines: [v('editor', 'He took our roof at six and our transmitter at five past. I want it back and I want a quote.')] },
            { id: 'snapper', site: 'n3LeverB', label: 'The photographer', lines: [v('photographer', 'I got eleven frames from the top. Ten of them are my own feet.')] },
            { id: 'printer', site: 'n3LeverC', label: 'The printer', propDz: 1.3, propYaw: Math.PI, lines: [v('printer', 'Forty years in newspapers and this is the first time the news went round me.')] },
          ],
          lines: [
            g('oracle', 'Three release levers at the foot of the wheel, one for each gondola he locked. His crew is standing on them. Two minutes of motor left.'),
            v('question mark', 'Boss says nobody touches the levers. Boss says it is a metaphor. Nobody touch the metaphor.'),
          ],
          mopUpLines: [g('oracle', 'All three gondolas are down. The wheel can spin itself silly now.')],
          failLines: [g('riddler', 'Time! The motor is cooked and the wheel has stopped with them at the top. Do not sulk. I will wind it up again.')],
          doneLines: [
            v('editor', 'He is on the Gazette roof, the big transmitter, behind a quiz show set he built out of our own furniture. Print that he owes us a desk.'),
          ],
        },
        // [m23] second pass: the wheel shakes loose
        {
          id: 'pierRun', type: 'traverse', text: 'The foreman has the brake key and the wheel is shaking loose. After him, east down the pier.', checkpoint: 'n3WheelFoot',
          gates: ['n3Pier1', 'n3Pier2', 'n3PierEnd'], timer: 45, bonus: 10, radius: 6, vertical: 6,
          lines: [
            g('oracle', 'The gondolas are down but the wheel is still turning with no brake. The foreman ran east with the key. The ballroom end of the pier.'),
            v('question mark', 'Boss! He did the levers! All three! I am going to the ballroom! I am taking the key! I do not know why!'),
          ],
          failLines: [g('oracle', 'He ducked behind the funhouse and you lost him. He is moving again. From the wheel.')],
        },
        {
          id: 'ballroomDeck', type: 'fight', fight: 'ballroomDeck', text: 'His crew is dug in at the ballroom doors. Six of them, one rifle. Take them silently and get the brake key.', tutorial: ['crouch', 'silent'],
          lines: [
            v('question mark', 'What goes round and round and falls on us? ...That is not a riddle, I am asking. Is it going to fall on us?'),
            v('question mark', 'Not if he does not get the key. Stand on the key.'),
          ],
        },
        {
          id: 'brakeKey', type: 'collect', item: 'brakeKey', site: 'n3BrakeKey', radius: 3, text: 'Take the brake key from the foreman.',
          lines: [
            g('oracle', 'I have the brake from here now. The wheel is stopping. Slowly. Like a very large sulk.'),
            g('riddler', 'You are behind schedule, Detective. I allowed four minutes for the wheel. Back to the Loop: City Hall has a party and the canyon has a parcel, and you only have the one cape.'),
          ],
        },
        {
          id: 'backToLoop', text: 'Back west to the Loop. City Hall and the canyon are both calling.', site: 'n3BackLoop', radius: 16, checkpoint: 'n3PierGate',
          nudge: g('gordon', 'The Loop, Batman. Back over the park, the street under the El on the City Hall side.'),
          lines: [g('alfred', 'A word before you get there, sir. The mayor has a charity gala on the City Hall plaza tonight and you are the guest of honour. You, sir. The other you.')],
          banter: [
            g('radio', 'Amusement Mile is closed for the night after what the operator calls "an unscheduled fast bit". Refunds are not available. They never are.'),
            g('nightwing', 'The Ferris wheel? Without me? I grew up in a circus. That is basically my office.'),
          ],
        },
      ],
    },
    // [story2] Two places at once: the mayor's charity gala on the City Hall plaza (Bruce is the guest
    // of honour, and the buyer of the Narrows land is on the guest list), and a bomb in the canyon.
    {
      id: 'm3Gala', title: 'Black Tie', rewards: ['xp:200', 'gadget:tracker'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n3Dilemma', type: 'dilemma', key: 'n3.gala', text: 'The charity gala on the City Hall plaza wants its guest of honour (gold). A bomb in the canyon wants Batman.',
          timer: 50, heading: 'GUEST OF HONOUR',
          card: 'The mayor\'s gala on the City Hall plaza (gold): Bruce is the guest of honour, and the Narrows buyer is on the list. Or the box on the canyon street that is ticking.',
          bruce: { site: 'n3GalaFront', radius: 7, label: 'The gala', lines: [g('alfred', 'Black tie in the car, sir. The bomb squad is on the canyon. They are very good. Mostly.')],
            miss: { effects: { standing: -5, threads: { gordon: 0.2 } }, lines: [v('pryce', 'The guest of honour sent his regrets and a cheque. The mayor kept the cheque.')] } },
          batman: { site: 'n3Bomb', radius: 12, label: 'The bomb', lines: [g('batman', 'Alfred. Send the cheque.')],
            miss: { effects: { city: -5 }, lines: [g('gordon', 'The canyon box went off. Nobody hurt, thank God, but the Exchange crew used the noise to dig in.')] } },
          both: { effects: { standing: 2 }, lines: [g('alfred', 'A gala attended and a bomb defused. I shall tell the press you have a twin.')] },
          branches: { bruce: 'n3Gala', batman: 'n3BombFight', both: 'n3BombFight' },
        },
        {
          id: 'n3Gala', type: 'civvy', outfit: 'tux', text: 'Walk the gala. Find out who bought the Narrows land.', next: 'toCityHall',
          card: 'Bruce Wayne, guest of honour. The buyer of the Narrows land is here somewhere. Ask without asking.',
          beats: [
            { id: 'mayor', site: 'n3GalaFront', text: 'Councillor Pryce, at the head of the receiving line.', lines: [v('pryce', 'Wayne! You came. The mayor will be thrilled. I am mildly surprised.')] },
            { id: 'buyer', site: 'n3GalaNorth', text: 'A man in a grey suit nobody seems to know.', lines: [v('grey suit', 'Mr. Wayne. We have not met. I represent a cold-storage concern. We are expanding into land.')],
              choice: { key: 'n3.buyer', prompt: 'The buyer\'s man, smiling, waiting for small talk', default: 'card', options: [
                { id: 'card', tag: 'charm', text: 'Ask for his card. Admire the paper.', effects: { flags: { 'lead.Sionis Cold Holdings is buying the Narrows': true }, suspicion: { villain: 2 } }, lines: [v('grey suit', 'Sionis Cold Holdings. We are discreet.'), g('bruce', 'Not very.')] },
                { id: 'drunk', tag: 'act', text: 'Spill a drink on him and apologise loudly.', effects: { standing: -2, suspicion: { reporter: -2 }, flags: { 'lead.the buyer wears a Sionis pin': true } }, lines: [v('grey suit', 'It is quite all right.'), g('alfred', 'You read his lapel pin while you dabbed. Very good, sir. Very undignified.')] },
              ] } },
            { id: 'slip', site: 'n3GalaSouth', text: 'Excuse yourself. The steps are behind the band.', lines: [g('riddler', 'Ah, the gala! Every rich fool in the Loop in one place. And on the steps behind them: my next question.')] },
          ],
        },
        {
          id: 'n3BombFight', type: 'fight', fight: 'bombCrew', text: 'His crew is guarding the canyon box. Clear them.',
          lines: [v('question mark', 'Nobody touches the box! The box is a riddle!'), v('question mark', 'What is the riddle?'), v('question mark', 'It is a bomb. That is the riddle.')],
        },
        {
          id: 'n3Defuse', type: 'scan', text: 'Detective vision: the bomb\'s two wires. Trace them both.',
          points: [
            { site: 'n3BombA', lines: [g('oracle', 'The green wire is a decoy. It is always the green wire with him.')] },
            { site: 'n3BombB', lines: [g('oracle', 'The red one goes to a clock. Cut there. Done. Lovely. Never do that again.')] },
          ],
        },
      ],
    },
    {
      id: 'm3CityHall', title: 'The Steps', rewards: ['xp:200', 'gadget:hack'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'toCityHall', text: 'The last box had a card in it: City Hall, the steps.', site: 'n3CityHall', radius: 14, checkpoint: 'n3El6',
          nudge: g('gordon', 'City Hall is the domed building on the east side of the Loop. The steps face the street.'),
          lines: [
            g('oracle', 'Train is safe. Passengers are complaining about the delay, which is the most Gotham thing I have ever heard.'),
            g('riddler', 'Well done! Now, a walk in the sun. City Hall steps. Mind the plates, they bite.'),
          ],
        },
        {
          id: 'cityHallPuzzle', type: 'puzzle', site: 'n3CityHall', text: 'Stand on the plates in the right order before the clock runs out.',
          riddleTitle: 'RIDDLE: WALK MY DAY',
          riddle: 'I rise by the doors in the east, I am highest in the south, I sink into the street in the west, and then I sleep in the middle of everything. Walk my day.',
          plates: PLATES, order: ['E', 'S', 'W', 'C'], timer: 60, wrongCost: 10, plateRadius: 1.4,
          penalty: { budget: 4, gang: 'riddler', site: 'n3CityHallStreet', ring: 7 },
          wrongLines: [
            g('riddler', 'Wrong! Even the pigeons on the dome got that one.'),
            g('riddler', 'Incorrect. I am sending some friends to help you think.'),
            g('riddler', 'You do know where the sun comes up? East. Doors. I practically drew you a picture.'),
          ],
          failLines: [g('riddler', 'Time! Do not worry, we will run it again. I love a repeat.')],
        },
      ],
    },
    {
      id: 'm3Alley', title: 'Question Mark Delivery', rewards: ['gadget:cryptographicSequencer'], checkpoint: 'n3AlleyEntry',
      steps: [
        {
          id: 'toAlley', text: 'The plates spelled a delivery address. West side of the Loop, an alley depot.', site: 'n3AlleyEntry', radius: 10,
          nudge: g('oracle', 'The roof above the alley on the far west side of the Loop, by the river branch. Come in high.'),
          lines: [
            g('oracle', 'Question Mark Delivery. A company that delivers nothing, at all hours, to nobody. The proxy papers went through it.'),
            g('alfred', 'Riflemen on both roofs, sir, and two in the alley. They are, I am told, very well informed.'),
          ],
          banter: [
            g('radio', 'Traffic: the Loop is gridlocked because every traffic light is showing a question mark. Please treat a question mark as a red light.'),
            g('nightwing', 'Want me to swing by? I hear he asks you riddles. I am great at riddles. Ask me one. Actually do not, you will be mean about it.'),
          ],
          interrupts: [{ id: 'n3Trivia', at: 'n3Trivia', radius: 24, fight: 'trivia', xp: 80, label: 'Optional: the trivia argument is settled', lines: [g('radio', 'Units on the canyon street: three men in green bowlers are fighting over a pub quiz answer. With crowbars.')] }],
        },
        {
          id: 'deliveryAlley', type: 'fight', fight: 'alley', text: 'Take the depot silently. Riflemen on both roofs.', tutorial: ['crouch', 'silent', 'perch'],
          lines: [g('goon', 'Anybody else hear wings? No? Just me? Great.')],
        },
        {
          id: 'cipher', type: 'collect', item: 'cipher', site: 'n3Cipher', radius: 3, text: 'Take the delivery ledger from the depot door.',
          nudge: g('oracle', 'The depot door, at the street end of the alley.'),
          lines: [g('oracle', 'One delivery tonight. Wayne Tower, the lobby. Signed with a question mark. Of course.')],
        },
      ],
    },
    // [m23] The depot made two deliveries tonight. The second is still on the road.
    {
      id: 'm3Van', title: 'Second Delivery', rewards: ['xp:200'], checkpoint: 'n3Cipher',
      steps: [
        {
          id: 'n3VanBoard', type: 'board', text: 'A second delivery is on the road in a green van. The Batmobile is on the street east of the depot.', site: 'n3VanCar', talk: 'over',
          nudge: g('alfred', 'One block east of the alley, sir. I have left the engine running and the meter off.'),
          lines: [
            g('oracle', 'Hold on. Two deliveries on that ledger, not one. The second left ten minutes ago: a green van, an armoured case in the back, heading for Lower Gotham.'),
            g('alfred', 'The car is one block east of you, sir. Do bring this one back with its mirrors.'),
          ],
        },
        {
          id: 'n3VanChase', type: 'chase', talk: 'over', text: 'Ram the delivery van 3 times. It is circling the Loop along the Lower Gotham deck.', site: 'n3VanCar',
          path: [{ x: -150, z: -359 }, { x: -150, z: -291 }, { x: -30, z: -291 }, { x: 90, z: -291 }, { x: 150, z: -291 }, { x: 150, z: -359 }, { x: 30, z: -359 }, { x: -90, z: -359 }],
          van: { type: 'box_truck', color: 0x2f8a3a, toast: 'Stop the green delivery van. Ram it three times!', label: 'VAN' },
          lines: [
            g('oracle', 'It is doing laps: down to the river deck, east along Lower Gotham, back up under the El. He is making sure you see it.'),
            v('question mark', 'Is that him? He said the Bat would be on foot! He said it was a walking sort of night!'),
          ],
        },
        {
          id: 'n3VanFight', type: 'fight', fight: 'vanCrew', text: 'The van is stopped on the Lower Gotham deck and the crew is climbing out. Clear them.', checkpoint: 'n3VanStop',
          lines: [
            v('question mark', 'Out! Everybody out! Protect the case! ...What is in the case? Do we know what is in the case?'),
            v('question mark', 'It is not our job to know. It is our job to be hit near it.'),
          ],
        },
        {
          id: 'n3VanScan', type: 'scan', text: 'Detective vision: the van and its armoured case.', hold: 1.2,
          points: [
            { site: 'n3VanA', lines: [g('oracle', 'The case is empty. No papers. One card: "Question three: what is delivered before it is sent?" I hate him.')] },
            { site: 'n3VanB', lines: [g('gordon', 'A route sheet on the dashboard. "Stop one, Wayne Tower, the lobby. Delivered 21:40." The van was the decoy. The real parcel is already there.')] },
          ],
          nudge: g('oracle', 'The back of the van and the cab. Both glow in detective vision.'),
        },
        // [m23] second pass: the hideout
        {
          id: 'toArch', text: 'The route sheet ends at the river walk under the Lower Gotham deck, west of the bridge. Down to the water.', site: 'n3ArchEntry', radius: 7, checkpoint: 'n3VanStop',
          nudge: g('oracle', 'The river walk is below the deck. The stairs are by the bridge, west of where the van stopped.'),
          lines: [
            g('oracle', 'Bottom of the route sheet: "Return vehicle to the arches." His delivery crew has a hideout on the river walk, right under your wheels.'),
            g('alfred', 'Under a bridge, sir. I do wish one of them would rent an office.'),
          ],
        },
        {
          id: 'riverArch', type: 'fight', fight: 'riverArch', text: 'Four of his couriers under the arches. One rifle. Stay out of the lamps.', tutorial: ['crouch', 'silent'],
          lines: [
            v('question mark', 'The van is late. The van is never late. He times the van.'),
            v('question mark', 'Maybe it got a flat. ...Maybe it got a Bat.'),
          ],
        },
        {
          id: 'archMap', type: 'collect', item: 'spareMap', site: 'n3ArchMap', radius: 3, text: 'The couriers kept a copy of something on the far wall. Take it.',
          lines: [
            g('oracle', 'A street map of the Loop with one block ringed in green. Wayne Tower. And a note: "He will go there last. He always does."'),
            g('alfred', 'I should not take that personally, sir. I do, but you should not.'),
          ],
        },
      ],
    },
    {
      id: 'm3Tower', title: 'The Tallest Building in Gotham', rewards: ['xp:250'],
      steps: [
        {
          id: 'toWayneTower', text: 'Wayne Tower. The delivery went to the lobby.', site: 'n3Plaza', radius: 14, checkpoint: 'n3Cipher',
          interrupts: [{ id: 'n3Riddlers', at: 'n3Trivia', radius: 24, fight: 'n3Riddlers', xp: 80, label: "Optional: the question marks are off the street", lines: [{ speaker: 'oracle', portrait: 'oracle', text: "A crew in green bowlers on the canyon street, painting question marks on the windows. On the way. Mostly." }] }], // [balance]
          nudge: g('gordon', 'Wayne Tower is the tallest thing in the Loop, Batman. The one with the W on top. Plaza on the south side.'),
          lines: [
            g('alfred', 'Wayne Tower, sir. I do hope he has not rearranged the furniture.'),
            g('riddler', 'The tallest building in Gotham. Have you ever wondered why it is so tall? Compensating, I think.'),
          ],
          banter: [
            g('gordon', 'Lucius Fox just called my office to ask why the Wayne Tower plaza is beeping. I told him I would look into it. Personally.'),
            g('oracle', 'Fun fact, the Riddler has a library card for every branch in Gotham. All overdue.'),
          ],
          optional: [{ id: 'n3TowerTop', title: 'Optional: the very top of Wayne Tower (if you can get there)', site: 'wayneTowerRoof', radius: 6, xp: 150, done: 'Wayne Tower summit: one green question mark on the mast, and a very good view.', lines: [g('riddler', 'You climbed it! Did you take the stairs? You took the stairs.')] }],
        },
        {
          id: 'plazaTrap', type: 'traverse', text: 'The plaza is wired. Hit the four cut-outs, the last one on the canopy, before it goes off.',
          gates: ['n3Trap1', 'n3Trap2', 'n3Trap3', 'n3Trap4'], timer: 40, bonus: 4, radius: 4,
          lines: [
            g('oracle', 'Pressure charges under the plaza, on a timer. Four cut-out switches. One is on the lobby canopy, so you will need to go up.'),
            g('gordon', 'Lobby is evacuated. Just the cleaner, and he is very angry about the floor.'),
          ],
          failLines: [g('oracle', 'Charges reset. Again, from the first one. You have this.')],
        },
        {
          id: 'lobbyScan', type: 'scan', site: 'n3LobbyDoor', text: 'Scan the lobby door. He left something for you.', hold: 1.4,
          points: [{ site: 'n3LobbyDoor', lines: [g('oracle', 'A map. Taped inside the door. Of the Loop. With your routes on it.')] }],
        },
        { id: 'n3Twist', type: 'cutscene', scene: 'n3Twist', panels: 3 },
      ],
    },
    // [m23] He has every route Batman takes. He posts them to the police, with a picture.
    {
      id: 'm3Frame', title: 'Public Enemy', rewards: ['xp:250'], checkpoint: 'n3Plaza',
      steps: [
        {
          id: 'n3Framed', type: 'evade', level: 3, delay: 8, ground: ['batcaveDowntown'],
          text: 'The GCPD has your routes and a faked picture of you at the vault. Lose them: break their line of sight, take the roofs, or go to ground.',
          clearText: 'They have lost you. Stay out of sight until the search is called off.',
          hintTitle: 'WANTED', hint: 'The police are not the enemy: do not fight them. Get out of sight and stay there, or go to ground: the downtown cave door (blue) under the Lower Gotham deck ends it, once everyone is there.',
          lines: [
            g('riddler', 'One more thing about that map. I have posted a copy to the police, with a photograph of you emptying the bank vault. It is a very good photograph. I made it myself.'),
            g('gordon', 'Batman, the deputy chief has that picture and he does not like you. I know it is a fake. It will take me an hour to prove it. Every car in the Loop is coming to Wayne Tower. Do not be there.'),
          ],
          clearLines: [
            g('gordon', 'They have lost you. I have the lab on the picture now: the shadows fall the wrong way and the vault has a door it never had. One hour.'),
            g('oracle', 'The picture is fake but the tip was real. It came with a live camera feed of Wayne Tower plaza. Somebody was filming you tonight, from the roof across the street.'),
          ],
        },
        // [m23] second pass: the proof
        {
          id: 'toVaultProof', text: 'The picture shows you at the canyon bank vault. Go back and prove it is a fake. Stay off the streets.', site: 'n3Bank', radius: 12, checkpoint: 'n3Plaza',
          nudge: g('gordon', 'The bank on the canyon street, west side. Over the roofs, Batman. Half my cars are still out.'),
          lines: [
            g('gordon', 'I can stall the deputy chief or I can end this. To end it I need the real vault and his picture side by side. You are the only one who can get near it tonight.'),
          ],
          banter: [g('radio', 'Correction to the earlier bulletin: the suspect is not, repeat not, to be asked for an autograph.')],
        },
        {
          id: 'vaultProof', type: 'scan', text: 'Detective vision: the vault, the camera and the floor. Find what the picture got wrong.', hold: 1.2,
          points: [
            { site: 'n3Proof1', lines: [g('oracle', 'The vault door hinges on the left. In his picture it hinges on the right. He flipped the frame to hide the clock on the wall.')] },
            { site: 'n3BankN', lines: [g('oracle', 'The camera he painted green was the only one facing the vault. His picture is taken from exactly there. From a camera that could not see.')] },
            { site: 'n3Proof2', lines: [g('alfred', 'And the floor, sir. Wet footprints from tonight, yours among them, and none in his photograph. It was made last week. One does not forge the weather.')] },
          ],
          nudge: g('oracle', 'Three spots at the bank glow in detective vision: the vault door, the painted camera and the floor.'),
        },
        {
          id: 'toDarkroom', text: 'The picture was printed tonight, on the City Hall roof, under the gala lights. Cross the Loop and come in from the taller block to the east.', site: 'n3DarkEntry', radius: 9,
          nudge: g('oracle', 'City Hall, east side of the Loop. The block across the street from it is taller: land there and look down.'),
          lines: [
            g('oracle', 'One more thing in that picture: the paper. It is the stock the Mayor uses for gala programmes, and tonight the only printer running it is in a tent on the City Hall roof.'),
            g('gordon', 'Get me the negative and I do not need the deputy chief to believe me. I can make him look at it.'),
          ],
          banter: [g('nightwing', 'Wanted by the police, chased across the Loop, framed by a man in a green hat. So a normal Tuesday. Call if you want company.')],
        },
        {
          id: 'darkroom', type: 'fight', fight: 'darkroom', text: 'Five of his men round a printing tent on the City Hall roof. Take them silently: the gala is right underneath.', tutorial: ['silent', 'perchDrop'],
          lines: [
            v('question mark', 'Is the Bat taller than this in real life? The boss says the picture has to be the right height.'),
            v('question mark', 'Nobody has measured him. Nobody who measured him remembers.'),
          ],
        },
        {
          id: 'negative', type: 'collect', item: 'negative', site: 'n3Negative', radius: 3, text: 'Take the negative from the printing tent.',
          lines: [g('oracle', 'The negative, the paste-up and a cardboard cut-out of you that is, frankly, flattering. That is everything Gordon needs.')],
        },
        {
          id: 'toGordon', text: 'Gordon is waiting on the El platform at Kane, west of Wayne Tower. Bring him the proof.', site: 'elKaneB', radius: 6,
          nudge: g('gordon', 'Kane station, the El platform over the street west of Wayne Tower. I am the one in the bad coat.'),
          lines: [g('gordon', 'Kane station, the El platform. I will not have this conversation in my own building. Half of it is listening.')],
        },
        {
          id: 'gordonProof', type: 'wait', seconds: 9, text: 'Gordon has the proof.',
          lines: [
            g('gordon', 'Hinges, a blind camera, last week\'s floor and the negative. That will do. I am pulling every car back, and the deputy chief can explain to the Mayor why he chased you on a postcard.'),
            g('gordon', 'For what it is worth, I never thought it was you. You would have used the door.'),
            g('batman', 'Somebody was filming the plaza tonight, Jim. From a roof. I am going to go and ask him why.'),
          ],
        },
        {
          id: 'toNest', text: 'The flat roof across the street from Wayne Tower, on the west side. Somebody has been watching from it.', site: 'n3Nest', radius: 12, checkpoint: 'n3Plaza',
          nudge: g('oracle', 'West of Wayne Tower, across the street: the wide flat roof about fifty metres up. Stay high.'),
          lines: [g('alfred', 'A month, sir. Every night for a month a man has sat on a roof and written down when you left. I feel I should have brought him a sandwich.')],
          banter: [g('radio', 'All units, the suspect is described as tall, dark, and, quote, obviously a bat. The public is asked not to approach. The public is asked to stop cheering.')],
        },
        {
          id: 'nestFight', type: 'fight', fight: 'nest', text: 'The watchers are still on the roof. One rifle. Clear the nest.',
          lines: [
            v('question mark', 'Write this down. Twenty three fourteen, subject arrives on our roof. Subject looks annoyed.'),
            v('question mark', 'Stop writing it down and hit him!'),
          ],
        },
      ],
    },
    // [m23] The nest: how the map was made, and where the pictures went.
    {
      id: 'm3Nest', title: 'The Watchers', rewards: ['xp:250'], checkpoint: 'n3Nest',
      steps: [
        {
          id: 'nestCase', type: 'case', text: 'Work out how the nest fed his map.', checkpoint: 'n3Nest',
          lines: [g('oracle', 'This is where the map came from. Detective vision: everything they left. Then tell me how it worked, because he will have another one.')],
          case: {
            title: 'The Watchers', scene: 'n3Nest',
            blurb: 'A roof with a view of Wayne Tower, a month of somebody else\'s patience, and a cable that goes somewhere.',
            evidence: [
              { id: 'tripod', at: { site: 'n3Nest', dx: 12, dz: 2 }, glyph: 'mark', label: 'Three dents in the roofing felt', text: 'A heavy tripod stood here for weeks, pointed at the plaza and the streets round Wayne Tower.', lines: [g('oracle', 'Tripod marks, deep ones. A long lens on the plaza, in the same spot for weeks.')] },
              { id: 'boots', at: { site: 'n3Nest', dx: -8, dz: 8 }, glyph: 'print', label: 'Boot prints in three sizes', text: 'Three men, never at the same time. Eight hour shifts, round the clock.', lines: [g('alfred', 'Three sizes of boot, sir, and three sorts of sandwich wrapper. Shift work. He has better staffing than the Manor.')] },
              { id: 'log', at: { site: 'n3Nest', dx: -10, dz: -9 }, glyph: 'object', label: 'A logbook in green ink', text: 'Thirty one nights of times and headings. Every route begins "from W.T." and none of them say why.', lines: [g('oracle', 'A logbook. Every time you left, which way you went, how long you were gone. He did not guess your routes. He counted them.')] },
              { id: 'cable', at: { site: 'n3Nest', dx: 6, dz: -11 }, glyph: 'wave', label: 'A cable taped along the parapet', text: 'New tonight. It runs from where the camera stood to a transmitter aerial clipped to the roof edge.', lines: [g('oracle', 'This cable is new. Tonight the camera stopped being a notebook and started being a broadcast.')] },
            ],
            reconstruct: {
              prompt: 'How did this roof turn into a police tip?',
              lines: [g('alfred', 'Shall we lay it out, sir? From the beginning. I shall try not to take the sandwiches personally.')],
              cards: [
                { id: 'send', text: 'Tonight the camera was wired to send its picture live.' },
                { id: 'watch', text: 'Three men watched Wayne Tower in shifts for a month.' },
                { id: 'tip', text: 'The police were sent the map and a faked picture together.' },
                { id: 'log', text: 'Every route was timed and written in the log.' },
              ],
              order: ['watch', 'log', 'send', 'tip'],
            },
            trail: { kind: 'radio', text: 'The aerial is sending to a relay. Take a bearing from three high places', receivers: ['heraldCrown', 'elKaneB', 'n3Lookout'], target: 'n3Relay' },
            trailLines: [g('oracle', 'That is how it worked. The aerial is still talking to something. Give me three bearings from three different places and I can cross them: the Herald crown, the El platform at Kane, the roof south of here.')],
            solvedLines: [
              g('oracle', 'The bearings cross on the Gotham Exchange. That is his relay, and the proxy papers went the same way. No wonder his crew is holding the steps.'),
              g('batman', 'Then that is the way in.'),
            ],
          },
        },
        // [m23] second pass: the relay
        {
          id: 'toRelayRoof', text: 'The relay dish is on the low roof west of the Exchange. Get up onto the Exchange ledge above it.', site: 'n3ExchLedge', radius: 8, checkpoint: 'n3Relay',
          nudge: g('oracle', 'The Exchange has a ledge all the way round, about halfway up. West side. The clearing house roof is right below it.'),
          lines: [
            g('oracle', 'The dish itself is not on the Exchange. It is on the clearing house next door, the low flat roof to the west, where nobody would look. Six men round it.'),
            g('alfred', 'If you take the relay, sir, he loses his eyes on the Loop. He will have to find you the old fashioned way. By guessing.'),
          ],
        },
        {
          id: 'clearingRoof', type: 'fight', fight: 'clearingRoof', text: 'Six of his men round the relay dish. Drop in from the ledge and take them silently.', tutorial: ['silent', 'perchDrop'],
          lines: [
            v('question mark', 'Camera nine is just a pigeon. Camera nine has been a pigeon for an hour.'),
            v('question mark', 'Log it. He wants everything logged. "Pigeon, still."'),
          ],
        },
        {
          id: 'relayCore', type: 'collect', item: 'relayCore', site: 'n3RelayCore', radius: 3, text: 'Pull the core out of the relay dish.',
          lines: [
            g('oracle', 'Relay is down. Every screen in the Loop just went to static, and for the first time tonight he does not know where you are.'),
            g('riddler', 'Hello? Hello! That was MY relay! Do you know how long it takes to train a pigeon? ...Fine. The Exchange steps. Come and be wrong in person.'),
          ],
        },
      ],
    },
    {
      id: 'm3Exchange', title: 'Closing Bell', rewards: ['xp:250'], checkpoint: 'n3Exchange', // [fix1] gadget reward
      steps: [
        {
          id: 'toExchange', text: 'He is broadcasting from the Gazette, but his crew is guarding the Exchange. Go through them.', site: 'n3Exchange', radius: 14,
          nudge: g('gordon', 'The Gotham Exchange, the big one at the end of the canyon street, west of Marquee Row.'),
          lines: [
            g('batman', 'He has been watching me for a month.'),
            g('alfred', 'Then for once, sir, he will have to come up with a new route. Unlike some of us.'),
            g('gordon', 'His crew is holding the Exchange steps. The proxy papers are in an armoured case behind them.'),
          ],
          banter: [
            g('radio', 'Gotham Exchange closes early tonight, due to a man in a green suit asking the traders riddles about compound interest.'),
            g('nightwing', 'He mapped your routes? Mine are unmappable. I just do flips until something works.'),
          ],
          interrupts: [{ id: 'n3Lookout', at: 'n3Lookout', radius: 30, roof: true, fight: 'lookout', xp: 80, label: 'Optional: the roof spotters are out of the game', lines: [g('oracle', 'Two spotters on a roof along your way, phoning in your position. Optional, and very satisfying.')] }],
          optional: [{ id: 'n3ExchangeTop', title: 'Optional: the statue on top of the Exchange', site: 'exchangeTop', radius: 5, xp: 100, done: 'Justice holds her scales. Someone has put a green question mark on one pan.' }],
        },
        {
          id: 'n3IfBomb', type: 'life', test: 'choice:n3.gala=bruce',
          yesLines: [g('gordon', 'They dug in while the canyon was burning. There are more of them than there should be.')],
          branches: { yes: 'exchangeBig', no: 'exchangeFight' },
        },
        {
          id: 'exchangeBig', type: 'fight', fight: 'exchangeBig', text: 'They dug in while you were at the gala. Batons, a brute, shields. Clear the Exchange steps.', next: 'toGazette',
          lines: [g('goon', 'Count off! One. Two. ...Three? Three, buddy?')],
        },
        {
          id: 'exchangeFight', type: 'fight', fight: 'exchange', text: 'Clear the Exchange steps. Batons, a brute, and a lot of opinions.',
          lines: [
            g('goon', 'Quick question for the Bat. What is black, blue and about to be very sorry? ...I forgot the end. It was the Bat. No, us. It is us.'),
            g('goon', 'Count off! One. Two. ...Three? Three, buddy?'),
          ],
        },
      ],
    },
    {
      id: 'm3Riddler', title: 'Riddle Me Live', rewards: ['xp:600', 'lore:riddlerFile', 'suit:questionMarkCowl'], checkpoint: 'n3GazetteCP',
      steps: [
        {
          id: 'toGazette', text: 'The Gazette roof. He is on air. Grapple up.', site: 'n3GazetteCP', radius: 8, tutorial: ['grapple'],
          interrupts: [{ id: 'n3Couriers', at: 'n3BankS', radius: 24, fight: 'n3Couriers', xp: 80, label: "Optional: the couriers will not deliver", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Any unit near the bank: couriers in green loading envelopes into a van. Every envelope has a question mark on it." }] }], // [balance]
          nudge: g('oracle', 'Gazette building, two blocks north of Marquee Row. The roof with all the lights. Grapple.'),
          lines: [
            g('oracle', 'The proxy papers are in the case. And the case is on his podium. Every screen in Gotham is watching.'),
            g('riddler', 'And here he is! Our contestant! Everyone, a round of applause for the man who still has not worked out who I am. ...It is me. The Riddler. It was always me.'),
          ],
        },
        { id: 'riddlerBoss', type: 'boss', boss: 'riddler', text: 'Answer three riddles. Scan the panels, then stand on your answer.', checkpoint: 'n3GazetteCP' },
        {
          id: 'n3Wrap', type: 'wait', seconds: 8, text: 'The papers are safe. GCPD on the way up.',
          lines: [
            g('gordon', 'Proxy papers recovered. The vote goes ahead in the morning, fair and square. Lucius says thank you, by the way. To you, I mean. Not to Bruce Wayne, who slept through the last one.'),
            g('batman', 'Riddler. The answer is prison.'),
            g('alfred', 'He asked about Wayne Tower, sir. On live television. I shall draw the blinds.'),
          ],
        },
        { id: 'n3End', type: 'nightEnd', scene: 'n3End', after: 'Act Two is over. The Loop is quiet, and a green question mark is drying on Wayne Tower.', rewards: ['xp:100'] },
      ],
    },
  ],
};
