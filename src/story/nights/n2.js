// Night Two, "Cold Feet" (Act II, The Gilded City): the crime boss in the top hat moves uptown.
// With the Joker in Arkham, the old fence from Neon Row's ICEBERG dive has opened the Iceberg Lounge
// on Gotham Mile and is buying up the city: a diamond heist pays for proxy votes on the Narrows
// redevelopment, smuggled through the river under Lower Gotham. Verbs in order: fight (the new
// shield role), detective scan, Batmobile chase, timed rooftop run, a branch (the old dive or the
// river), fight on the river walk, predator room under the deck, the twist, a door fight, and the
// boss on the Lounge roof (gadgets and crowd control: src/bosses/defs/penguin.js).
// [m23] Four more missions (docs/design/briefs/missions-round.md): the drone nest on the marina road
// (battle mode, taught one mission earlier), the Aquarium case and the keepers on the quay (a case
// board, then a rescue against a clock), the holdout on the Pinnacle (a timed climb on the grapple
// boost) and the ice house (a second predator room, with the sonic batarang and the disruptor).
// [m23] Second pass, each of the four deepened with a real second stage: the paymaster's sedan
// (a tail in the Batmobile, then a predator room at the park band shell), the marina (a second
// case scene and a run over the campus roofs after the lookout), the forger over the Mile's roofs
// (a chase and a rooftop predator room) and the coolant valves on the engine hall roof.
// Every site below was checked against the live collision (groundBelow) on 2026-11-24.
import { titleCard } from '../../ui/comicArt.js';
import { villainCard } from '../../bosses/defs/penguinRiddlerArt.js';
import { W, route } from '../rooms.js';
import { v, recap } from './common.js'; // [story2]

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const SOUTH = 0, NORTH = Math.PI, EAST = Math.PI / 2, WEST = -Math.PI / 2;

const sites = {
  n2Mile: { x: 0, y: 0.15, z: -648 },
  n2Heist: { x: 0, y: 0, z: -653 },
  n2Board: { x: 30, y: 0, z: -690, yaw: Math.PI },
  n2RunStart: { x: 60, y: 22, z: -615 },
  n2Gate1: { x: 114, y: 44, z: -620 },
  n2Gate2: { x: 120, y: 30, z: -680 },
  n2Gate3: { x: 187, y: 38, z: -683 },
  n2Gate4: { x: 192, y: 64, z: -740 },
  n2Dive: { x: 180, y: 0, z: 88 },
  n2DiveDoor: { x: 180, y: 0, z: 95 },
  n2RiverWalk: { x: 120, y: -4.5, z: -271 },
  n2Toll: { x: 150, y: 0, z: -479 },
  n2UnderEntry: { x: 0, y: -4.5, z: -271 },
  n2Under: { x: 45, y: -4.5, z: -271 },
  n2Ledger: { x: 80, y: -4.5, z: -271 },
  n2LoungeFront: { x: 60, y: 0, z: -590 },
  n2LoungeRoof: { x: 50, y: 22, z: -611, yaw: NORTH },
  n2PenguinArena: { x: 49, y: 22, z: -623 },
  n2PenguinStart: { x: 49, y: 22, z: -634 },
  // [story2] Bruce on the guest list
  n2Doorman: { x: 60, y: 0, z: -598 },
  n2Tables: { x: 46, y: 0, z: -594 },
  n2Office: { x: 74, y: 0, z: -596 },
  n2Alley: { x: 80, y: 0, z: -590 },
  // [m23] the Museum Campus: the marina road, the Aquarium, the quay by the planetarium
  n2LsdCar: { x: 345, y: 0, z: -700, yaw: SOUTH },
  n2MarinaTurn: { x: 338, y: 0, z: 188 },
  n2MarinaRoad: { x: 292, y: 0, z: 188 },
  n2Wreck1: { x: 284, y: 0, z: 185 },
  n2Wreck2: { x: 297, y: 0, z: 192 },
  n2Wreck3: { x: 306, y: 0, z: 182 },
  n2Trail1: { x: 314, y: 0, z: 160 },
  n2Trail2: { x: 318, y: 0, z: 196 },
  n2Trail3: { x: 326, y: 0, z: 212 },
  n2Quay: { x: 336, y: 0, z: 222 },
  n2CrateA: { x: 318, y: 0, z: 226 },
  n2CrateB: { x: 340, y: 0, z: 234 },
  n2CrateC: { x: 352, y: 0, z: 214 },
  // [m23] the Pinnacle (a stepped tower: 40 m, 80 m, 100 m) and the pumping station yard
  n2PinnStreet: { x: 160, y: 0, z: -623 },
  n2Pinn1: { x: 172, y: 40, z: -623 },
  n2Pinn2: { x: 184, y: 80, z: -623 },
  n2Pinn3: { x: 198, y: 100, z: -623 },
  n2PinnTop: { x: 198, y: 100, z: -623 },
  n2Yard: { x: 199, y: 0, z: -684 },
  n2YardEntry: { x: 216, y: 10, z: -684, yaw: WEST },
  n2Strongroom: { x: 205, y: 0, z: -683 },
  // [m23] second pass: the band shell in Robinson Park (a 1 m stage, lawn all round)
  n2TailFrom: { x: 345, y: 0, z: -640 },
  n2ShellEntry: { x: 326, y: 0, z: -626 },
  n2Shell: { x: 300, y: 1, z: -657 },
  n2ShellPhone: { x: 300, y: 1, z: -656 },
  n2LsdCar2: { x: 345, y: 0, z: -640, yaw: SOUTH },
  // the marina sea wall and the campus roofs (museum 24 m, Aquarium 18.5 m, planetarium 17.4 m)
  n2MarinaEdge: { x: 270, y: 0, z: 200 },
  n2Diesel1: { x: 252, y: 0, z: 192 },
  n2Diesel2: { x: 246, y: 0, z: 168 },
  n2Diesel3: { x: 262, y: 0, z: 140 },
  n2RoofMus: { x: 300, y: 24, z: 116 },
  n2RoofAq: { x: 294, y: 18.5, z: 164 },
  // the roofs north of the Pinnacle (40 m, then 64 m) and the engine hall roof (10 m)
  n2PodiumN: { x: 198, y: 40, z: -639 },
  n2Roof40: { x: 213, y: 40, z: -742 },
  n2Roof64: { x: 180, y: 64, z: -742 },
  n2Page: { x: 180, y: 64, z: -746 },
  n2HallRoof: { x: 216, y: 10, z: -684 },
  n2ValveA: { x: 212, y: 10, z: -693 },
  n2ValveB: { x: 221, y: 10, z: -684 },
  n2ValveC: { x: 212, y: 10, z: -675 },
  n2TruckCar: { x: 150, y: 0, z: -690, yaw: NORTH },
};

const fights = {
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n2Valet: { site: 'n2Board', radius: 12, gang: 'penguin', act: 2, district: 'gothamMile', waves: [{ budget: 5, ring: 4.5 }] },
  n2Bouncers: { site: 'n2Alley', radius: 12, gang: 'penguin', act: 2, district: 'gothamMile', waves: [{ budget: 5, ring: 4.5 }] },
  heist: { site: 'n2Heist', radius: 14, gang: 'penguin', act: 2, district: 'gothamMile', waves: [{ budget: 4, lead: 'shield', ring: 6 }, { budget: 6, ring: 7 }] },
  oldDive: { site: 'n2Dive', radius: 14, gang: 'penguin', act: 2, district: 'core', waves: [{ budget: 5, ring: 5 }] },
  toll: { site: 'n2Toll', radius: 12, gang: 'penguin', act: 2, district: 'loop', waves: [{ budget: 3, ring: 4 }] },
  riverWalk: {
    site: 'n2RiverWalk', radius: 14, gang: 'penguin', act: 2, district: 'river',
    waves: [
      { budget: 5, spots: [[-6, 0], [6, 0], [-10, 0], [10, 0], [-3, 1], [3, 1]] },
      { budget: 7, spots: [[-14, 0], [14, 0], [-8, 1], [8, 1], [-18, 0], [18, 0], [0, 1]] },
    ],
  },
  undercroft: { stealth: 'undercroft' },
  // [m23]
  quayGuard: { site: 'n2Quay', radius: 20, gang: 'penguin', act: 2, district: 'museumCampus', waves: [{ budget: 7, spots: [[-15, 2], [3, 9], [13, -6], [-12, -2], [7, 14], [17, -3], [0, 0], [-4, 6]] }] },
  pinnacleTop: { site: 'n2PinnTop', radius: 9, gang: 'penguin', act: 2, district: 'gothamMile', waves: [[{ type: 'shield', dx: 0, dz: -4 }, { type: 'grunt', dx: -4, dz: 3 }, { type: 'knife', dx: 4, dz: 3 }]] },
  iceHouse: { stealth: 'iceHouse' },
  bandShell: { stealth: 'bandShell' },
  skyRoom: { stealth: 'skyRoom' },
  hallRoof: { site: 'n2HallRoof', radius: 14, gang: 'penguin', act: 2, district: 'gothamMile', waves: [[{ type: 'grunt', dx: -4, dz: -7 }, { type: 'knife', dx: 4, dz: 5 }, { type: 'grunt', dx: -3, dz: 8 }, { type: 'shield', dx: 5, dz: -4 }]] },
  loungeDoor: { site: 'n2LoungeFront', radius: 14, gang: 'penguin', act: 2, district: 'gothamMile', waves: [{ budget: 6, ring: 6 }, { budget: 7, ring: 6, start: 0.4, add: [{ type: 'brute', dx: 0, dz: -5 }] }] },
};

// The river walk west of the smugglers' boat: a 6 m strip between the river wall and the dark
// under the Lower Gotham deck, two lamps, crates for cover. (The deck itself is too low for the
// follow camera, so the squad walks the open strip.)
const rooms = {
  undercroft: {
    id: 'undercroft', site: 'n2Under', entry: 'n2UnderEntry', radius: 30, gang: 'penguin',
    bounds: { minX: 8, maxX: 88, minY: -7, maxY: 0, minZ: -276, maxZ: -266 },
    lights: [{ x: 28, y: -1.5, z: -269, r: 5, post: true, base: -4.5 }, { x: 62, y: -1.5, z: -269, r: 5, post: true, base: -4.5 }],
    cover: [{ x: 20, y: -4.5, z: -270, w: 1.4, d: 1.4, h: 1.4 }, { x: 40, y: -4.5, z: -272, w: 1.4, d: 1.4, h: 1.4 }, { x: 52, y: -4.5, z: -269.5, w: 1.4, d: 1.4, h: 1.4 }, { x: 70, y: -4.5, z: -272, w: 1.4, d: 1.4, h: 1.4 }],
    huddle: { x: 46, y: -4.5, z: -271 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(15, -4.5, -271, 2, EAST), W(75, -4.5, -271, 2, WEST)) },
      { type: 'grunt', route: route('pingpong', W(30, -4.5, -272, 3, EAST), W(58, -4.5, -272, 3, WEST)) },
      { type: 'knife', route: route('pingpong', W(48, -4.5, -270, 4, EAST), W(82, -4.5, -270, 4, WEST)) },
      { type: 'rifle', route: route('pingpong', W(84, -4.5, -271, 5, WEST), W(84, -4.5, -270, 5, WEST)) },
    ],
  },
  // [m23] The old pumping station on the Mile, his ice house: a castellated water tower and a low
  // engine hall in an open yard. Two rifles (the disruptor's first real job), three lamps, crates.
  // Come in over the engine hall roof; the tower top is a perch.
  iceHouse: {
    id: 'iceHouse', site: 'n2Yard', entry: 'n2YardEntry', radius: 36, gang: 'penguin',
    bounds: { minX: 164, maxX: 240, minY: -1, maxY: 42, minZ: -708, maxZ: -654 },
    lights: [{ x: 200, y: 4, z: -668, r: 6, post: true, base: 0 }, { x: 176, y: 4, z: -692, r: 6, post: true, base: 0 }, { x: 231, y: 4, z: -682, r: 6, post: true, base: 0 }],
    cover: [{ x: 190, y: 0, z: -671, w: 1.6, d: 1.6, h: 1.4 }, { x: 203, y: 0, z: -699, w: 1.6, d: 1.6, h: 1.4 }, { x: 229, y: 0, z: -692, w: 1.6, d: 1.6, h: 1.4 }, { x: 172, y: 0, z: -680, w: 1.6, d: 1.6, h: 1.4 }, { x: 214, y: 0, z: -664, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: 199, y: 0, z: -690 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(175, 0, -701, 3, EAST), W(201, 0, -701, 3, WEST)) },
      { type: 'rifle', route: route('pingpong', W(232, 0, -665, 3, NORTH), W(232, 0, -699, 3, SOUTH)) },
      { type: 'grunt', route: route('loop', W(178, 0, -674, 1), W(197, 0, -674, 2, SOUTH), W(197, 0, -694, 1), W(178, 0, -694, 2, NORTH)) },
      { type: 'knife', route: route('pingpong', W(201, 0, -661, 4, EAST), W(227, 0, -661, 4, WEST)) },
      { type: 'shield', route: route('pingpong', W(202, 0, -679, 5, WEST), W(202, 0, -688, 5, WEST)) },
    ],
  },
  // [m23] The band shell in Robinson Park: the paymaster's handover. A low stage with a back wall,
  // lawn on every side, three lamps. Six men, one rifle. Come in from the trees to the south-east.
  bandShell: {
    id: 'bandShell', site: 'n2Shell', entry: 'n2ShellEntry', radius: 38, gang: 'penguin',
    bounds: { minX: 266, maxX: 334, minY: -1, maxY: 20, minZ: -686, maxZ: -614 },
    lights: [{ x: 290, y: 5, z: -658, r: 6, post: true, base: 1 }, { x: 310, y: 5, z: -658, r: 6, post: true, base: 1 }, { x: 300, y: 4, z: -634, r: 6, post: true, base: 0 }],
    cover: [{ x: 286, y: 0, z: -644, w: 1.6, d: 1.6, h: 1.4 }, { x: 314, y: 0, z: -644, w: 1.6, d: 1.6, h: 1.4 }, { x: 300, y: 0, z: -626, w: 1.6, d: 1.6, h: 1.4 }, { x: 276, y: 0, z: -660, w: 1.6, d: 1.6, h: 1.4 }, { x: 324, y: 0, z: -672, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: 300, y: 0, z: -642 },
    squad: [
      { type: 'grunt', route: route('pingpong', W(288, 1, -657, 3, EAST), W(312, 1, -657, 3, WEST)) },
      { type: 'knife', route: route('pingpong', W(284, 0, -640, 3, EAST), W(316, 0, -640, 3, WEST)) },
      { type: 'rifle', route: route('pingpong', W(324, 0, -668, 4, NORTH), W(324, 0, -648, 4, SOUTH)) },
      { type: 'shield', route: route('pingpong', W(276, 0, -648, 4, NORTH), W(276, 0, -668, 4, SOUTH)) },
      { type: 'grunt', route: route('pingpong', W(290, 0, -674, 3, EAST), W(310, 0, -674, 3, WEST)) },
      { type: 'grunt', route: route('loop', W(292, 0, -632, 2, SOUTH), W(308, 0, -632, 2, SOUTH), W(308, 0, -646, 1), W(292, 0, -646, 1)) },
    ],
  },
  // [m23] The forger's roof: the 64 m block north of the Pinnacle, flat, 24 m by 36 m. Four men and
  // the man with the practice sheets. Come up over the east parapet from the 40 m roof beside it.
  skyRoom: {
    id: 'skyRoom', site: 'n2Roof64', entry: 'n2Roof40', radius: 26, gang: 'penguin',
    bounds: { minX: 164, maxX: 226, minY: 38, maxY: 72, minZ: -764, maxZ: -720 },
    lights: [{ x: 176, y: 68, z: -732, r: 5, post: true, base: 64 }, { x: 186, y: 68, z: -752, r: 5, post: true, base: 64 }],
    cover: [{ x: 174, y: 64, z: -744, w: 1.6, d: 1.6, h: 1.4 }, { x: 186, y: 64, z: -732, w: 1.6, d: 1.6, h: 1.4 }, { x: 183, y: 64, z: -756, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: 180, y: 64, z: -742 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(172, 64, -728, 3, SOUTH), W(172, 64, -756, 3, NORTH)) },
      { type: 'grunt', route: route('pingpong', W(188, 64, -756, 3, NORTH), W(188, 64, -728, 3, SOUTH)) },
      { type: 'knife', route: route('pingpong', W(176, 64, -740, 4, EAST), W(186, 64, -740, 4, WEST)) },
      { type: 'grunt', route: route('pingpong', W(180, 64, -752, 5, NORTH), W(180, 64, -734, 5, SOUTH)) },
      { type: 'shield', route: route('pingpong', W(168, 64, -724, 5, EAST), W(190, 64, -724, 5, WEST)) },
    ],
  },
};

const scenes = {
  // [story2]
  n2Recap: (stage) => recap(stage, {
    title: 'The Long Night',
    panels: [
      'One night of storm and laughter: the Joker took the clock tower, and the city, hostage. Batman took them back.',
      { shot: { cam: [20, 60, 30], look: [0, 44, 0] }, caption: 'The Joker is in Arkham. The signal is off. For six hours, Gotham was quiet.' },
      { shot: { cam: [40, 16, -560], look: [60, 6, -602] }, caption: 'Then a new club opened on Gotham Mile, and somebody started buying up the city.' },
    ],
  }),
  // The heist was a bank deposit: the twist under the deck.
  n2Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [72, -2.5, -268], look: [80, -4, -271] }), caption: 'A ledger in a cash crate, on the river under Lower Gotham. Every diamond from Diamond Row has a buyer.' },
      { img: titleCard('PROXY VOTES', 'Wayne Enterprises, Narrows redevelopment, 9 a.m.'), caption: 'The buyers are Wayne shareholders. The diamonds buy their votes.', captionPos: 'bottom' },
      { img: villainCard('riddler', 'READ IT FIRST', 'a green question mark on the last page'), caption: 'And somebody else got here first.', captionPos: 'bottom' },
    ],
  }],
  penguinIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [50, 27, -603], look: [49, 23, -630], hero: { at: [50, 22, -612], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The Iceberg Lounge roof. A private party with a dress code.' },
      { img: villainCard('penguin', 'THE ICEBERG LOUNGE', 'members only'), balloons: [{ text: 'You are tracking mud on my ice, Detective. Gentlemen, the umbrellas.', x: 50, y: 5, w: 78 }] },
    ],
  }],
  penguinOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [44, 25, -615], look: [49, 22.5, -628], hero: { at: [47, 22, -621], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The umbrellas are scrap. The bodyguards are asleep. The host is out of hats.' },
      { img: villainCard('penguin', 'LAST CALL', 'the lounge is closed'), balloons: [{ text: 'You have no idea who holds those votes, do you? I only sold them. Somebody clever is buying.', x: 50, y: 5, w: 80 }] },
    ],
  }],
  n2End: () => [{ layout: 'single', panels: [{ span: 'full', img: titleCard('END OF NIGHT TWO', 'The votes are safe. The buyer is not done.') }] }],
};

export default {
  id: 'n2', act: 'act2', number: 2, actNumber: 2,
  title: 'Night Two: Cold Feet',
  blurb: 'A diamond heist on Gotham Mile, a smuggling line under Lower Gotham, and a host with an umbrella for every occasion.',
  villain: 'penguin', gang: 'penguin',
  districts: ['gothamMile', 'river', 'lowerGotham', 'museumCampus'],
  timeOfDay: 21.5, weather: 'rain',
  start: 'n2Mile',
  day: {
    hook: 'day.n2',
    context: {
      after: 'n1', mood: 'morning after',
      appointments: [{ at: '09:00', what: 'Wayne Enterprises board: the Narrows redevelopment vote', place: 'wayneTowerLobby' }, { at: '20:00', what: 'Charity auction at the Grand Kane Hotel', place: 'grandKaneDoorman' }],
      news: 'The Joker is back in Arkham. Gotham Mile has a new nightclub.',
    },
    fallback: [
      g('alfred', 'Good evening, sir. The board postponed the Narrows vote to tomorrow morning. Several shareholders suddenly want to "think about it".'),
      g('alfred', 'Meanwhile a new club opened on Gotham Mile. Ice sculptures, a dress code, and a proprietor in a top hat. I am sure it is all perfectly legal.'),
    ],
  },
  sites, fights, rooms, scenes,
  // [m23] fill light over the new set pieces (src/story/missions/n2/fills.js): no scene too dark to read
  fills: [
    { id: 'quay', x: 336, y: 0, z: 222, r: 24 },
    { id: 'pinnacleTop', x: 198, y: 100, z: -623, r: 12 },
    { id: 'iceYard', x: 199, y: 0, z: -684, r: 30, height: 12 },
    { id: 'bandShell', x: 300, y: 0, z: -650, r: 34, height: 11 },
    { id: 'marinaEdge', x: 262, y: 0, z: 180, r: 30 },
    { id: 'skyRoom', x: 180, y: 64, z: -742, r: 20 },
  ],
  missions: [
    {
      id: 'm2Opening', title: 'The Gilded City', rewards: [],
      steps: [
        { id: 'n2Recap', type: 'cutscene', scene: 'n2Recap' },
        {
          id: 'n2Start', text: 'Alarms on Gotham Mile. Head for Diamond Row.', site: 'n2Mile', radius: 20,
          interrupts: [{ id: 'n2Valet', at: 'n2Board', radius: 24, fight: 'n2Valet', xp: 80, label: "Optional: the valet racket on the Mile is shut", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Units on Gotham Mile: men in purple waistcoats are \"valet parking\" cars nobody asked them to park. Into the river, mostly." }] }], // [balance]
          title: { text: 'ACT TWO: THE GILDED CITY', sub: 'Night Two: Cold Feet' },
          nudge: g('gordon', 'Diamond Row, Batman. North of the river, past the Loop. Follow the alarms.'),
          lines: [
            g('gordon', 'Joker is back in his cell. Gotham was quiet for six hours. I think that is a record.'),
            g('gordon', 'Then every jeweller on Diamond Row went off at once. Gotham Mile, north end.'),
            g('oracle', 'Oracle here. The alarms tripped in order, east to west, eleven seconds apart. Somebody planned this with a stopwatch.'),
          ],
          banter: [
            g('radio', 'Gotham Late Night FM. Tonight: overcast, with a ninety percent chance of being punched if you are up to no good.'),
            g('alfred', 'For the record, sir, the new club on the Mile sent the Manor an invitation. Black tie. Umbrellas provided.'),
          ],
        },
      ],
    },
    {
      id: 'm2Heist', title: 'Diamond Row', rewards: ['xp:150'], checkpoint: 'n2Mile',
      steps: [
        {
          id: 'heistFight', type: 'fight', fight: 'heist', text: 'Stop the heist. Shield goons: vault over them, cape stun, or hit them from the air.',
          tip: { title: 'NEW: SHIELD GOON', text: 'A riot shield stops strikes from the front. Vault over him (dodge through), cape stun him, or come down from the air, then hit him.' },
          lines: [
            g('goon', 'Mr. Cobblepot said nobody comes to Diamond Row at night. Mr. Cobblepot is wrong a lot lately.'),
            g('goon', 'Shields up! He can not punch through a shield! ...Right? Somebody say right.'),
          ],
        },
        {
          id: 'heistScan', type: 'scan', text: 'Detective vision: find out who planned this. Three clues on Diamond Row.', hold: 1.2,
          points: [
            { site: 'diamondRow0', lines: [g('oracle', 'Frost on the broken glass. Somebody chilled the window with a canister before they hit it. That is not a smash and grab, that is a recipe.')] },
            { site: 'diamondRow3', lines: [g('oracle', 'A matchbook. The Iceberg Lounge, Gotham Mile. Members only. Of course it is.')] },
            { site: 'diamondAlley', lines: [g('alfred', 'Tyre marks and the smell of a very expensive cigar. The getaway car is still circling the block, sir. Bold.')] },
          ],
          optional: [{ id: 'n2Belfry', title: 'Optional: the Old Church belfry, a smuggler lookout', site: 'oldChurchBelfry', radius: 5, xp: 60, done: 'Belfry lookout found: a pair of opera glasses and a very cold thermos.', lines: [g('oracle', 'Opera glasses pointed straight at the Lounge. Somebody is watching the watchers.')] }],
          nudge: g('oracle', 'Detective vision on, and stand by the windows and the alley. The clues glow.'),
        },
      ],
    },
    {
      id: 'm2Pursuit', title: 'Black Sedan', rewards: ['xp:150'], // [fix1] gadget reward
      steps: [
        {
          id: 'n2Board', type: 'board', text: 'The getaway car is circling the Mile. Get in the Batmobile.', site: 'n2Board', checkpoint: 'n2Heist', talk: 'over',
          nudge: g('alfred', 'The car is on the street west of the alley, sir. Waiting, like the rest of us.'),
          lines: [g('alfred', 'I have parked the car one block west. Do try to return it with the same number of doors.')],
        },
        {
          id: 'n2Chase', type: 'chase', text: 'Ram the getaway car 3 times before it reaches the river.', site: 'n2Board',
          path: [{ x: 30, z: -713 }, { x: 90, z: -713 }, { x: 150, z: -713 }, { x: 150, z: -653 }, { x: 90, z: -653 }, { x: 30, z: -653 }],
          // [story2] its own quarry, and the board calls mid-chase
          van: { type: 'sedan_deco', color: 0x111116, toast: 'Stop the black sedan. Ram it three times!', label: 'SEDAN' },
          calls: [{
            id: 'stone', from: 'board', after: 9, timeout: 12, default: 'later',
            lines: [v('stone', 'Bruce? Garrick Stone. Sorry to call so late. Is that an engine? Never mind. Will you back the Narrows redevelopment on Thursday? Yes or no.')],
            prompt: 'Garrick Stone wants your vote, mid-chase',
            options: [
              { id: 'yes', tag: 'yes', text: '"Sure, Garrick. Whatever you think."', effects: { standing: 2, flags: { 'lead.stone pushed the Narrows deal': true } }, lines: [v('stone', 'Splendid. You will not regret it.'), g('alfred', 'You may regret it, sir.')] },
              { id: 'no', tag: 'no', text: '"Not until I know who is buying."', effects: { standing: -1, suspicion: { villain: 2 } }, lines: [v('stone', 'Since when do you read the paperwork, Bruce?')] },
              { id: 'later', tag: 'later', text: 'Hang up. Both hands on the wheel.', effects: { standing: -2 }, lines: [g('alfred', 'Mr. Stone has called back twice. I told him you were in a tunnel. Technically true.')] },
            ],
          }],
          lines: [
            g('oracle', 'There. A loop of the Mile, again and again. He is not escaping, he is waiting for someone.'),
            g('goon', 'Is that him? Behind us? Tell me that is a very big taxi.'),
          ],
        },
      ],
    },
    {
      id: 'm2Drone', title: 'The Umbrella Run', rewards: ['xp:200'], // [fix1] gadget reward
      steps: [
        {
          id: 'droneRun', type: 'traverse', text: 'A drone took the diamonds off the car roof. Follow it across the rooftops before it gets away.', checkpoint: 'icebergRoof',
          gates: ['n2RunStart', 'n2Gate1', 'n2Gate2', 'n2Gate3', 'n2Gate4'], timer: 100, bonus: 8, radius: 5,
          tutorial: ['grapple', 'grappleBoost'],
          lines: [
            g('alfred', 'The driver passed a case up to a drone. It is flying a very particular route, sir, with lights on it. Like a parade.'),
            g('oracle', 'I can see its transponder for about a minute and a half before it drops out of range. Rings on your display. Go.'),
          ],
          failLines: [g('oracle', 'Lost it. It circles back to the Lounge roof every few minutes, he is that predictable. Back to the first ring.')],
        },
      ],
    },
    // [m23] The drone did not go home: it fed a fish van, and the van has friends on the marina road.
    {
      id: 'm2Nest', title: 'Catch of the Day', rewards: ['xp:200'], checkpoint: 'n2Gate4',
      steps: [
        {
          id: 'n2CarEast', type: 'board', text: 'The drone passed the case down to a fish van on Lakeshore Drive. The Batmobile is on the drive.', site: 'n2LsdCar', talk: 'over',
          nudge: g('alfred', 'Lakeshore Drive, sir, east of the Mile, along the park. The car is the one that is not a taxi.'),
          lines: [
            g('oracle', 'The drone did not go home. It lowered the case onto a refrigerated van. "Cobblepot Fine Seafood", heading south down Lakeshore Drive.'),
            g('alfred', 'I have brought the car round to the drive, sir. Mr. Fox asks that you try the new mode somewhere other than his car park.'),
          ],
        },
        // [m23] second pass: the paymaster
        {
          id: 'n2Tail', type: 'carTail', from: 'n2TailFrom', model: 'sedan_deco', nodes: 6, checkpoint: 'n2LsdCar',
          text: 'A grey sedan pulled out behind the fish van: his paymaster. Tail it. Hang back, but do not lose it.',
          lines: [
            g('oracle', 'Wait. A grey sedan just pulled out behind the van and it is not following it. Same plates as the car that paid the Diamond Row crew. That is the paymaster.'),
            g('alfred', 'A tail, sir. Not a chase. The object is for him not to know. I realise this is a new idea for the car.'),
          ],
          spottedLines: [g('oracle', 'He saw you. He is going round the block to check. Drop back and pick him up again.'), g('alfred', 'Perhaps without the afterburner this time, sir.')],
          lostLines: [g('oracle', 'Too far back, you lost him. He is still circling the park. Pick him up again.')],
          arrivedLines: [g('oracle', 'He has parked and walked into Robinson Park with a briefcase. The band shell. He is meeting somebody.')],
        },
        {
          id: 'toShell', text: 'The band shell in Robinson Park. Leave the car and come in through the trees.', site: 'n2ShellEntry', radius: 10, checkpoint: 'n2LsdCar',
          nudge: g('oracle', 'The band shell is the little stage in the middle of the park, west of the drive. Come at it from the south-east, on foot.'),
          lines: [
            g('oracle', 'Six of them at the band shell. One rifle, one shield, and a man on the stage counting out envelopes.'),
            g('alfred', 'The Gotham Philharmonic plays there on Sundays, sir. Do try to leave it fit for Elgar.'),
          ],
        },
        {
          id: 'shellRoom', type: 'fight', fight: 'bandShell', text: 'The paymaster is handing out envelopes at the band shell. Take the six of them silently.', tutorial: ['crouch', 'silent'],
          lines: [
            g('goon', 'Envelope for Diamond Row, envelope for the valets, envelope for the birds. Who is the birds?'),
            g('goon', 'Do not ask who is the birds. Take your envelope.'),
          ],
        },
        {
          id: 'shellPhone', type: 'collect', item: 'paddle', site: 'n2ShellPhone', radius: 3, text: 'The paymaster dropped his briefcase on the stage. Take it.',
          nudge: g('alfred', 'On the stage, sir, centre. Where the conductor stands.'),
          lines: [
            g('oracle', 'A briefcase of envelopes and an auction paddle. Lot fourteen, the Narrows clinic. He was bidding against you by telephone, with stolen money, to keep the clinic off the map.'),
            g('alfred', 'Then I am glad of the watercolour of the duck, sir. Whichever way it went.'),
          ],
        },
        {
          id: 'n2CarBack', type: 'board', text: 'Back to the Batmobile on Lakeshore Drive. The fish van has a head start.', site: 'n2LsdCar2', talk: 'over', checkpoint: 'n2ShellEntry',
          nudge: g('alfred', 'The car is on the drive, sir, east of the band shell. It has been very patient.'),
          lines: [g('alfred', 'I have moved the car down the drive to meet you. The van, I regret, did not wait.')],
        },
        {
          id: 'n2DriveSouth', text: 'South down Lakeshore Drive to the Museum Campus. The van turned onto the marina road.', site: 'n2MarinaTurn', radius: 26, checkpoint: 'n2LsdCar',
          nudge: g('oracle', 'Keep the lake on your left until the museums. The marina road is the turn past the Aquarium dome.'),
          lines: [
            g('oracle', 'The van has stopped on the marina road, behind the Aquarium. It is not alone. I count five heat signatures the size of ice cream carts.'),
            g('gordon', 'Lakeshore patrol says those carts have been parked there all week. Nobody ticketed them. They have guns on, Batman. Somebody should have ticketed them.'),
          ],
          banter: [
            g('radio', 'Gotham Late Night FM traffic: Lakeshore Drive is clear southbound, except for one very fast black car that we are choosing not to describe.'),
            g('alfred', 'Robinson Park on your right, sir. Your mother planted the elms by the fountain. I mention it because you are doing ninety past them.'),
          ],
          calls: [{
            id: 'auction', from: 'auction', after: 8, timeout: 13, default: 'hold',
            lines: [v('auctioneer', 'Mr. Wayne? The Grand Kane charity auction. You asked to bid by telephone on lot fourteen, the Narrows clinic. We are at forty thousand, sir. Is that wind?')],
            prompt: 'Lot fourteen, the Narrows clinic: the room is waiting on your bid',
            options: [
              { id: 'bid', tag: 'generous', text: '"Double it. And whatever the clinic needs after that."', effects: { standing: 2, credit: -10, city: 1 }, lines: [v('auctioneer', 'Sold! To the gentleman in the, er, very loud convertible.'), g('alfred', 'A clinic bought at ninety miles an hour. Your father would have slowed down first. He would still have bought it.')] },
              { id: 'hold', tag: 'later', text: '"Hold my paddle. I will call you back."', effects: { standing: -1 }, lines: [g('alfred', 'I have told them you are in a tunnel, sir. It is becoming my favourite tunnel.')] },
              { id: 'alfred', tag: 'delegate', text: 'Patch the call to Alfred. He knows the price of everything.', effects: { standing: 1, threads: { alfred: -0.1 } }, lines: [g('alfred', 'I bought the clinic, sir. I also bought a small watercolour of a duck. You will learn to love it.')] },
            ],
          }],
        },
        {
          id: 'n2DroneNest', type: 'battle', talk: 'over', text: 'Umbrella drones on the marina road. Battle mode: hold block to strafe, jump to dodge, punch to fire.', site: 'n2MarinaRoad', drones: 5, checkpoint: 'n2MarinaTurn',
          tutorial: ['battleMode'],
          lines: [
            g('oracle', 'Five armoured carts with umbrellas on top, and the umbrellas are turrets. Of course they are. Battle mode, and keep moving.'),
            g('goon', 'It is the car! The big one! Nobody said anything about the big one!'),
          ],
        },
        {
          id: 'n2NestScan', type: 'scan', text: 'The carts are scrap and the van is empty. Detective vision: what was it carrying, and where did it go?', hold: 1.2, checkpoint: 'n2MarinaRoad',
          points: [
            { site: 'n2Wreck1', lines: [g('oracle', 'The van is empty. No case, no diamonds. Just meltwater and a smell I am told is herring.')] },
            { site: 'n2Wreck2', lines: [g('alfred', 'A delivery docket, sir. "Live cargo, tank four, the night keeper to sign." Nobody has signed.')] },
            { site: 'n2Wreck3', lines: [g('oracle', 'Wet tracks from the van to the Aquarium door. Small wheels. A hand truck, loaded going in and loaded coming out.')] },
          ],
          nudge: g('oracle', 'Three spots around the wrecked van glow in detective vision. Start with the van itself.'),
        },
      ],
    },
    // [m23] The Aquarium: a case with a board, then the people he locked in the birds' crates.
    {
      id: 'm2Aquarium', title: 'Feeding Time', rewards: ['xp:250'], checkpoint: 'aquariumDoor',
      steps: [
        {
          id: 'toAquarium', text: 'The Aquarium door, across the lawn. The night keeper never signed for that delivery.', site: 'aquariumDoor', radius: 9,
          nudge: g('oracle', 'The Aquarium is the building with the green dome. The door faces north, toward the museum.'),
          lines: [
            g('gordon', 'The Aquarium has a night keeper and two cleaners on the rota. None of them is answering the telephone.'),
            g('alfred', 'I took you there when you were seven, sir. You stood at the penguin tank for an hour and told me they looked like they were up to something.'),
          ],
        },
        {
          id: 'aquariumCase', type: 'case', text: 'Work out what happened at the Aquarium door.', checkpoint: 'aquariumDoor',
          lines: [g('oracle', 'No alarm, no forced lock, and three people missing. Detective vision. Tag everything, then we put it in order.')],
          case: {
            title: 'Feeding Time', scene: 'aquariumDoor',
            blurb: 'A delivery nobody signed for, a door nobody forced, and a night shift nobody can find.',
            evidence: [
              { id: 'keys', at: { site: 'aquariumDoor', dx: 0.5, dz: -2 }, glyph: 'object', label: 'The keeper\'s keys, still in the lock', text: 'He opened the door himself, from the inside. He was expecting a delivery.', lines: [g('oracle', 'His keys are in the lock, on the inside. He opened up for them. He thought it was the fish.')] },
              { id: 'frost', at: { site: 'aquariumDoor', dx: -5, dz: -4 }, glyph: 'mark', label: 'A fan of frost on the paving', text: 'The same chilled canister as Diamond Row, fired at head height. A threat, not a break-in.', lines: [g('alfred', 'Frost on the stones, sir, at about the height of a man\'s face. One does tend to cooperate after that.')] },
              { id: 'tracks', at: { site: 'aquariumDoor', dx: 6, dz: -5 }, glyph: 'print', label: 'Hand truck tracks, in and out', text: 'Heavy going in, heavier coming out, and three sets of shoes walking beside it.', lines: [g('oracle', 'The hand truck went in heavy and came out heavier. Three pairs of work shoes walked out next to it. Walked. Not dragged.')] },
              { id: 'feather', at: { site: 'aquariumDoor', dx: 2.5, dz: -9 }, glyph: 'object', label: 'A crate slat with feathers in it', text: 'Bird transport crates, the big ones. The birds are still in tank four. The crates are not.', lines: [g('alfred', 'A slat from a transport crate, with feathers. The penguins are all present, I am told, and all furious. Somebody borrowed their luggage.')] },
            ],
            reconstruct: {
              prompt: 'What happened at the Aquarium door, in order?',
              lines: [g('alfred', 'That is all of it, sir. Shall we lay it out? I find it helps to say it aloud, even to a man in a mask.')],
              cards: [
                { id: 'load', text: 'The diamonds left again, hidden in the bird crates.' },
                { id: 'open', text: 'The keeper unlocked the door for a fish delivery.' },
                { id: 'march', text: 'The night shift was walked out beside the hand truck.' },
                { id: 'frost', text: 'A frost canister was fired past his face.' },
              ],
              order: ['open', 'frost', 'load', 'march'],
            },
            trail: { kind: 'chemical', text: 'Meltwater from the crates. Follow it round the dome', points: ['n2Trail1', 'n2Trail2', 'n2Trail3'] },
            trailLines: [g('oracle', 'That fits. The crates were packed in ice and they are dripping. There is a trail round the east side of the dome, toward the planetarium.')],
            solvedLines: [g('oracle', 'The trail ends at the quay by the planetarium. Three bird crates, a crew, and a boat with its engine running.')],
          },
        },
        {
          id: 'quayRescue', type: 'rescue', text: 'Three people are locked in bird crates on the quay. Break the locks before the boat leaves', checkpoint: 'n2Trail3', retry: true,
          timer: 150, hold: 2.4, guard: 'quayGuard', prop: 'crate', workLabel: 'BREAKING THE LOCK',
          captives: [
            { id: 'keeper', site: 'n2CrateA', label: 'The night keeper', lines: [v('keeper', 'Thirty years with penguins and the first one to lock me in a box wears a monocle.')] },
            { id: 'cleaner', site: 'n2CrateB', label: 'The cleaner', lines: [v('cleaner', 'I am not mopping that quay. I want that on the record.')] },
            { id: 'student', site: 'n2CrateC', label: 'The work experience student', lines: [v('student', 'Is this going to count toward my hours?')] },
          ],
          lines: [
            g('oracle', 'They mean to take the witnesses with the boat. You have about two and a half minutes. A guard standing over a crate will stop you opening it.'),
            g('goon', 'Boss said load the birds. These birds have opinions. And shoes.'),
          ],
          mopUpLines: [g('gordon', 'Harbour patrol has the three of them. Whatever is left on that quay is yours.')],
          failLines: [g('oracle', 'The boat pulled out with a crate still on the quay. It has to come back for the tide. Again, from the trail.')],
          doneLines: [
            v('keeper', 'They took the real crates up the river an hour ago, under the Lower Gotham deck. He pays in ice, that one. I heard him say so.'),
            g('alfred', 'Three people home in time for breakfast, sir. That is the part of the evening I shall remember.'),
          ],
        },
        // [m23] second pass: the boat and the lookout
        {
          id: 'marinaCase', type: 'case', text: 'Work out which boat took the crates, at the marina sea wall.', checkpoint: 'n2Quay',
          lines: [g('oracle', 'The keeper says the real crates left by boat. The marina is fifty metres west. One berth is empty and somebody left in a hurry.')],
          case: {
            title: 'The Empty Berth', scene: 'n2MarinaEdge',
            blurb: 'Six boats on the marina register, five at their moorings, and a tide that waits for nobody.',
            evidence: [
              { id: 'rope', at: { site: 'n2MarinaEdge', dx: -6, dz: 0 }, glyph: 'object', label: 'A mooring line, cut', text: 'Sliced, not untied. Whoever cast off did not have the time to do it properly.', lines: [g('oracle', 'The mooring line was cut with a knife. A boat owner unties. A thief cuts.')] },
              { id: 'fuel', at: { site: 'n2MarinaEdge', dx: 5, dz: -2 }, glyph: 'drop', label: 'Diesel on the quay stones', text: 'A full tank, filled badly and fast. It leaked all the way from the road.', lines: [g('alfred', 'Diesel, sir, and a good deal of it. Somebody filled a tank the way I am told you fill the car.')] },
              { id: 'chart', at: { site: 'n2MarinaEdge', dx: 14, dz: -1 }, glyph: 'mark', label: 'A tide table with one time ringed', text: 'High water under the Lower Gotham deck at 23:00. A boat that size only clears the arches on the top of the tide.', lines: [g('oracle', 'A tide table, twenty three hundred ringed in pencil. They need high water to get under the Lower Gotham deck.')] },
              { id: 'ice', at: { site: 'n2MarinaEdge', dx: -14, dz: -3 }, glyph: 'print', label: 'Wet squares on the stones', text: 'Six crates stood here long enough to leave puddles. Then they were gone, all at once.', lines: [g('oracle', 'Six square puddles. The crates sat here while they fuelled, then went aboard together.')] },
            ],
            reconstruct: {
              prompt: 'How did the crates leave the marina?',
              lines: [g('alfred', 'Once more, sir, in order. I shall hold the torch. Metaphorically.')],
              cards: [
                { id: 'cut', text: 'They cut the mooring line and left on the tide.' },
                { id: 'stack', text: 'The crates were stacked on the sea wall.' },
                { id: 'fuel', text: 'The boat was fuelled in a hurry from cans.' },
                { id: 'watch', text: 'A lookout stayed behind to say when it was clear.' },
              ],
              order: ['stack', 'fuel', 'cut', 'watch'],
            },
            trail: { kind: 'chemical', text: 'The diesel was carried from the road. Follow it back', points: ['n2Diesel1', 'n2Diesel2', 'n2Diesel3'] },
            trailLines: [g('oracle', 'A lookout. Then he is still here. The fuel cans came from the west side of the campus: follow the diesel.')],
            solvedLines: [g('oracle', 'The cans are stacked behind the museum, and there is a man on the museum roof with a radio who has just noticed you. He is running.')],
          },
        },
        {
          id: 'lookoutRun', type: 'traverse', text: 'The lookout is running across the campus roofs with his radio. Museum, Aquarium, planetarium: stay on him.', checkpoint: 'n2Diesel3',
          gates: ['n2RoofMus', 'n2RoofAq', 'planetariumVista'], timer: 80, bonus: 12, radius: 6, vertical: 6,
          lines: [
            g('oracle', 'Museum roof, then the Aquarium dome, then the planetarium. He is fast and he knows the roofs. So do you.'),
            v('lookout', 'He is on the campus! Repeat, the Bat is on the campus! Tell the boat! Tell anybody!'),
          ],
          failLines: [g('oracle', 'He went to ground under a skylight. He will break cover again. From the museum roof.')],
        },
        {
          id: 'lookoutRadio', type: 'collect', item: 'radio', site: 'planetariumVista', radius: 4, text: 'He dropped the radio on the planetarium roof. Take it.',
          lines: [
            v('radio voice', 'Lookout, this is the boat. We are under the Lower Gotham deck in twenty minutes and at the Lounge by midnight. Say something if you are still alive.'),
            g('alfred', 'I would not answer that, sir. Let them wonder.'),
          ],
        },
      ],
    },
    {
      id: 'm2Smugglers', title: 'Follow the Money', rewards: ['xp:250', 'gadget:sonic'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n2Fork', type: 'fork', text: 'The diamonds went up the river in bird crates. Check his old dive in Neon Row first, or go straight to the river walk.',
          options: [
            { id: 'dive', text: 'The old ICEBERG dive in Neon Row', site: 'n2Dive', radius: 14, lines: [g('gordon', 'His old place. He moved uptown, but people do not change their locks.')] },
            { id: 'river', text: 'The river walk under the Loop', site: 'n2RiverWalk', radius: 12, lines: [g('oracle', 'Straight to the river. Bold. The old dive can wait.')] },
          ],
          branches: { dive: 'diveFight', river: 'toRiverWalk' },
          lines: [g('oracle', 'Two leads up river. His old dive on Neon Row still has its sign, and the river walk under the Loop has a lot of very fresh footprints.')],
        },
        {
          id: 'diveFight', type: 'fight', fight: 'oldDive', text: 'Clear the old ICEBERG dive.',
          lines: [g('goon', 'Boss said nobody comes here anymore! He said the new place has valet!')],
        },
        {
          id: 'diveClue', type: 'scan', site: 'n2DiveDoor', text: 'Scan the dive door for where the smuggling goes.', hold: 1,
          points: [{ site: 'n2DiveDoor', lines: [g('oracle', 'A tide table taped behind the door. Lower Gotham, under the deck, 23:00. That is in an hour.')] }],
        },
        {
          id: 'toRiverWalk', text: 'Down to the river walk under the Loop.', site: 'n2RiverWalk', radius: 12, checkpoint: 'n2RiverWalk',
          nudge: g('gordon', 'The river walk is below street level, Batman. South of the Loop, along the water.'),
          lines: [
            g('gordon', 'Harbour patrol saw crates going under the Lower Gotham deck all week. They assumed it was fish.'),
            g('alfred', 'It is never fish, sir.'),
          ],
          banter: [
            g('radio', 'Be advised, the river bridge is lifting. Again. No, nobody knows where the boats are going at this hour.'),
            g('oracle', 'Penguin has bought four buildings on the Mile this month. He paid in cash. Cold cash. I am not apologising for that.'),
          ],
          interrupts: [{ id: 'n2Toll', at: 'n2Toll', radius: 26, fight: 'toll', xp: 80, label: 'Optional: the umbrella toll on the Loop is closed', lines: [g('radio', 'Units in the Loop: men with umbrellas are charging pedestrians a toll to cross the street. In fine weather.')] }],
        },
        {
          id: 'riverFight', type: 'fight', fight: 'riverWalk', text: 'Clear the smugglers off the river walk.',
          lines: [
            g('goon', 'Load faster! The boss pays by the crate, not by the hour!'),
            g('goon', 'Why is it always a river? Why can we never smuggle in a nice warm lobby?'),
          ],
        },
      ],
    },
    {
      id: 'm2Undercroft', title: 'Under the Deck', rewards: ['gadget:disruptor'], checkpoint: 'n2UnderEntry',
      steps: [
        {
          id: 'undercroft', type: 'fight', fight: 'undercroft', text: 'Riflemen guard the river walk to the boat. Stay in the dark and take them silently.', tutorial: ['crouch', 'silent'],
          lines: [
            g('oracle', 'Four of them between you and the boat, two rifles. Lamps at two spots, dark under the deck beside you. You know the drill.'),
            g('goon', 'Kevin, stop checking the ceiling. ...Actually, keep checking the ceiling.'),
          ],
        },
        {
          id: 'ledger', type: 'collect', item: 'ledger', site: 'n2Ledger', radius: 3, text: 'Take the ledger from the cash crate.',
          nudge: g('alfred', 'The crate at the east end, sir. The one with a lock and a sense of self importance.'),
          lines: [g('oracle', 'That crate is lined with lead and labelled "frozen fish". Open it.')],
        },
        { id: 'n2Twist', type: 'cutscene', scene: 'n2Twist', panels: 3 },
      ],
    },
    // [story2] Bruce on the guest list: the Iceberg Lounge collision scene, played as a night mission.
    {
      id: 'm2Guest', title: 'The Guest List', checkpoint: 'n2LoungeFront', rewards: ['xp:150', 'lore:icebergMenu'],
      steps: [
        {
          id: 'n2GuestIn', type: 'civvy', outfit: 'tux', text: 'Bruce Wayne has an invitation. Use it.', site: 'n2Doorman',
          card: 'The Lounge will not let Batman in the front door. It will let Bruce Wayne in. Be charming, be foolish, look at everything.',
          beats: [
            { id: 'door', site: 'n2Doorman', text: 'The doorman, by the ice-blue door.', lines: [v('doorman', 'Mr. Wayne. You are on the list. You are at the top of the list. Your coat, sir? And your, er, bruise?')],
              choice: { key: 'n2.bruise', prompt: 'The doorman is looking at your cheek', default: 'polo', options: [
                { id: 'polo', tag: 'excuse', text: 'Polo. A very rude pony.', effects: { suspicion: { reporter: 1 } }, lines: [v('doorman', 'Of course, sir. Ponies.')] },
                { id: 'door', tag: 'excuse', text: 'I walked into my own front door. It is a very big door.', effects: { standing: -1 }, lines: [v('doorman', 'Happens to the best of us, sir. Mostly to you, I gather.')] },
              ] } },
            { id: 'cards', site: 'n2Tables', text: 'The high table. He is dealing.', lines: [v('penguin', 'Wayne! Sit, sit. A friendly hand. I will even let you shuffle. Do you know how to shuffle?'), g('alfred', 'He tells, sir. When he bluffs he polishes the monocle.')],
              choice: { key: 'n2.cards', prompt: 'High stakes with the club owner: he is polishing the monocle', default: 'lose', options: [
                { id: 'lose', tag: 'mask on', text: 'Fold a winning hand. Laugh about it.', effects: { standing: -1, suspicion: { villain: -3 }, credit: -10 }, lines: [v('penguin', 'Ha! A gentleman and a terrible card player. My favourite kind of guest.')] },
                { id: 'win', tag: 'win', text: 'Call his bluff. Take the pot.', effects: { standing: 2, suspicion: { villain: 6 }, credit: 20 }, lines: [v('penguin', 'Well. Well, well. Lucky night, Mr. Wayne. I will remember it.'), g('alfred', 'He will, too.')] },
              ] } },
            { id: 'office', site: 'n2Office', text: 'The back office door, ajar.', lines: [g('bruce', 'A ledger, open on the desk. The buyer of the Narrows proxies: a shell company with a cold-storage address.'), g('alfred', 'You have been away from the table for a minute, sir. People are noticing your champagne is lonely.')] },
            { id: 'out', site: 'n2Alley', text: 'Out the side door into the alley.', lines: [g('bruce', 'Alfred. The car, and the other suit.')] },
          ],
        },
      ],
    },
    // [m23] One shareholder has not sold. He has sent people to help her change her mind.
    {
      id: 'm2Holdout', title: 'The Holdout', checkpoint: 'n2Alley', rewards: ['xp:200'],
      steps: [
        {
          id: 'toPinnacle', text: 'The Pinnacle Hotel, east along the Mile. The last shareholder who has not sold lives at the top.', site: 'n2PinnStreet', radius: 12,
          nudge: g('oracle', 'The Pinnacle is the stepped tower on the Mile, east of the Lounge. Three roofs, each smaller than the last.'),
          lines: [
            g('oracle', 'The ledger has one name with no price beside it. Agatha Crowne, nine percent of Wayne Enterprises, the penthouse of the Pinnacle. She has not sold.'),
            g('alfred', 'Mrs. Crowne has not sold anything since nineteen sixty, sir. Including, I believe, a single compliment.'),
            g('gordon', 'Three of his men just went up in her private lift, and the lift has stopped answering.'),
          ],
          banter: [
            g('radio', 'Gotham Late Night FM. A caller says the Pinnacle penthouse lights are flashing on and off. Could be a party. Could be a very old lady with a torch and a grudge.'),
          ],
        },
        {
          id: 'pinnacleClimb', type: 'traverse', text: 'Get to the penthouse before she is made to sign. Three roofs, straight up: grapple, and jump as the line reels in.', checkpoint: 'n2PinnStreet',
          gates: ['n2Pinn1', 'n2Pinn2', 'n2Pinn3'], timer: 70, bonus: 10, radius: 6, vertical: 6,
          tutorial: ['grapple', 'grappleBoost'],
          lines: [
            g('oracle', 'They have put a pen in her hand. Forty metres to the first roof, eighty to the second, the penthouse terrace at a hundred. Boost off each ledge.'),
            v('crowne', 'Young man, I have outlived four husbands and a war. You may hold that pen until your arm falls off.'),
          ],
          failLines: [g('oracle', 'She is stalling them beautifully, but she cannot do it all night. From the street again.')],
        },
        {
          id: 'pinnacleFight', type: 'fight', fight: 'pinnacleTop', text: 'Three of his men on the penthouse terrace. Mind the edge. It is a long way down.',
          lines: [
            g('goon', 'She bit me! Boss never said she bites!'),
            v('crowne', 'Ah. The help has arrived. You are late, and you are dripping on my terrace.'),
          ],
        },
        {
          id: 'crowneTalk', type: 'wait', seconds: 9, text: 'Mrs. Crowne has something to say.',
          lines: [
            v('crowne', 'He wanted my votes. I told him a Crowne does not sell to a man who waddles. He said the others were paid in ice, and that the papers were on ice too.'),
            g('oracle', 'On ice. The old pumping station on the Mile, two blocks north. He has been buying coolant for it all month.'),
            v('crowne', 'Tell young Wayne to come to his own board meetings. I am too old to be the only adult in the room.'),
          ],
        },
        // [m23] second pass: the forger
        {
          id: 'roofChase', type: 'traverse', text: 'One of them went out of her window with a folder. North over the roofs: do not let him reach the others.', checkpoint: 'n2PinnTop',
          gates: ['n2PodiumN', 'n2Roof40'], timer: 60, bonus: 12, radius: 6, vertical: 6,
          lines: [
            v('crowne', 'One more thing. A small man with ink on his cuffs went out of my bathroom window while you were hitting his friends. He took my chequebook. I want it back.'),
            g('oracle', 'I see him. North, down onto the hotel podium and across to the next block. He is heading for a crew on the tall roof beside it.'),
          ],
          failLines: [g('oracle', 'He doubled back behind a water tank. He will run again. From the terrace.')],
        },
        {
          id: 'skyRoom', type: 'fight', fight: 'skyRoom', text: 'The forger and three guards on the roof above you. Come up over the parapet and take them silently.', tutorial: ['silent', 'perch'],
          lines: [
            g('goon', 'How many Agatha Crownes have you signed?'),
            g('goon', 'Forty. The first thirty were rubbish. She has a very angry capital A.'),
          ],
        },
        {
          id: 'forgedPage', type: 'collect', item: 'page', site: 'n2Page', radius: 3, text: 'Take the folder of practice signatures.',
          lines: [
            g('oracle', 'Forty goes at her signature and one very good one, on a proxy form. He was not waiting for her to sign. He only needed her out of the way until morning.'),
            g('alfred', 'I shall return the chequebook myself, sir. I believe she intends to tip.'),
          ],
        },
      ],
    },
    // [m23] The ice house: the signed proxies and the men who guard them.
    {
      id: 'm2IceHouse', title: 'On Ice', checkpoint: 'n2YardEntry', rewards: ['xp:250'],
      steps: [
        {
          id: 'toIceHouse', text: 'The old pumping station, north of the Pinnacle. Come in over the engine hall roof.', site: 'n2YardEntry', radius: 8,
          nudge: g('oracle', 'The pumping station is the little castle with the water tower, two blocks north of the Pinnacle. Land on the low roof beside the tower.'),
          lines: [
            g('oracle', 'Five in the yard. Two of them carry rifles. You have a disruptor now: point it at a rifle and the rifle becomes a stick.'),
            g('alfred', 'And the sonic batarang, sir. Throw it somewhere you are not. They will go and look at it, which is more than can be said for most art.'),
          ],
        },
        {
          id: 'iceHouse', type: 'fight', fight: 'iceHouse', text: 'Take the yard silently. Jam the rifles with the disruptor, and lure the rest with the sonic batarang.', tutorial: ['gadgetDisruptor', 'gadgetSonic', 'silent'],
          lines: [
            g('goon', 'Why is it called a pumping station if all we do is stand outside it?'),
            g('goon', 'Stop asking questions. Questions are the other guy\'s thing.'),
          ],
        },
        // [m23] second pass: the engine hall roof
        {
          id: 'coolant', type: 'rescue', text: 'They are flushing the ice into the river. Shut the three coolant valves on the engine hall roof', checkpoint: 'n2YardEntry', retry: true,
          timer: 100, hold: 2, guard: 'hallRoof', prop: 'lever', workLabel: 'CLOSING THE VALVE', freedWord: 'HISS!', freedSuffix: 'shut',
          mopUpText: 'The valves are shut. Clear the roof.',
          captives: [
            { id: 'north', site: 'n2ValveA', label: 'North valve', lines: [g('oracle', 'One. The pressure is dropping.')] },
            { id: 'east', site: 'n2ValveB', label: 'East valve', lines: [g('oracle', 'Two. The pumps are slowing.')] },
            { id: 'south', site: 'n2ValveC', label: 'South valve', lines: [g('oracle', 'Three. The ice is staying where it is.')] },
          ],
          lines: [
            g('oracle', 'Somebody upstairs heard the yard go quiet. They have opened the coolant dump: the ice block with the papers in it goes into the river in under two minutes. Three valves on the hall roof.'),
            g('goon', 'Boss said if the Bat shows, flush it! Flush everything! ...Which one is flush?'),
          ],
          mopUpLines: [g('alfred', 'The papers are safe, sir, and the river will remain merely filthy.')],
          failLines: [g('oracle', 'The dump ran dry and tripped. It is refilling. They will try again: back up to the roof.')],
        },
        {
          id: 'proxies', type: 'collect', item: 'proxies', site: 'n2Strongroom', radius: 3, text: 'The strongroom door in the engine hall. Take the signed proxies.',
          nudge: g('alfred', 'The door in the west wall of the engine hall, sir, facing the tower. The cold one.'),
          lines: [
            g('oracle', 'The signed proxy forms, frozen into a block of ice like a prawn cocktail. Every seller, every signature. The buyer line is blank on all of them.'),
            g('alfred', 'He is filling in the buyer tonight, then, in person. At the Lounge. I shall warm the car.'),
          ],
        },
        // [m23] second pass: the ice truck
        {
          id: 'n2TruckBoard', type: 'board', text: 'A refrigerated truck just left the yard with the one page he would not freeze. The Batmobile is on the street west of the tower.', site: 'n2TruckCar', talk: 'over', checkpoint: 'n2Strongroom',
          nudge: g('alfred', 'One street west of the water tower, sir. Engine running.'),
          lines: [
            g('oracle', 'One form is missing from the block: the one with the buyer on it. A refrigerated truck pulled out of the yard while you were on the roof. It is carrying something he wants kept very cold.'),
            g('alfred', 'The car is on the street west of the tower, sir. Mr. Fox says the ram plates are new and he would like to hear how they do.'),
          ],
        },
        {
          id: 'n2TruckChase', type: 'chase', talk: 'over', text: 'Ram the ice truck 3 times before it gets to the Lounge.', site: 'n2TruckCar',
          path: [{ x: 150, z: -713 }, { x: 90, z: -713 }, { x: 30, z: -713 }, { x: 30, z: -653 }, { x: 90, z: -653 }, { x: 150, z: -653 }],
          van: { type: 'box_truck', color: 0xdfe9f2, toast: 'Stop the ice truck. Ram it three times!', label: 'TRUCK' },
          lines: [
            g('oracle', 'White truck, "Iceberg Catering". It is circling the Mile waiting for the Lounge loading door to open.'),
            g('goon', 'Do not brake! If the swan melts he takes it out of our wages!'),
          ],
        },
        {
          id: 'n2TruckWrap', type: 'wait', seconds: 6, text: 'The truck is stopped.',
          lines: [
            g('oracle', 'The cargo is an ice sculpture. A swan, I think, before you hit it. There is a proxy form frozen inside, and the buyer line is still blank.'),
            g('alfred', 'Then nobody has signed yet, sir, and the pen is at the Lounge. So, I gather, is the party.'),
          ],
        },
      ],
    },
    {
      id: 'm2Lounge', title: 'The Iceberg Lounge', checkpoint: 'n2LoungeFront', rewards: ['xp:200'],
      steps: [
        {
          id: 'toLounge', text: 'Back to the Iceberg Lounge on Gotham Mile. He is meeting the buyers tonight.', site: 'n2LoungeFront', radius: 14,
          interrupts: [{ id: 'n2Bouncers', at: 'n2Alley', radius: 24, fight: 'n2Bouncers', xp: 80, label: "Optional: the alley crew is down", lines: [{ speaker: 'oracle', portrait: 'oracle', text: "Five of his door staff in the alley behind the Lounge, sharing a very large cigar. They will be at your back when you go in." }] }], // [balance]
          nudge: g('gordon', 'The Iceberg Lounge. Gotham Mile, the ice blue front with the bouncers.'),
          lines: [
            g('gordon', 'Proxy votes. He is buying a seat at the Wayne board table with stolen diamonds.'),
            g('alfred', 'If he wins tomorrow, sir, the Narrows goes to a front company by lunch. I will cancel your breakfast.'),
            g('oracle', 'The Lounge has a party on the roof. Twelve guests, twenty bodyguards. Typical ratio for that crowd.'),
          ],
          banter: [
            g('nightwing', 'Heard you are taking on the Penguin. Bring an umbrella. Seriously, he has one for every occasion.'),
            g('alfred', 'Master Dick asked if you have learned to say thank you yet. I said we are working on it.'),
          ],
        },
        {
          id: 'loungeDoor', type: 'fight', fight: 'loungeDoor', text: 'The bouncers at the door. Members only, apparently.',
          lines: [
            g('goon', 'Sorry pal, dress code. No capes. ...That was a joke. Please laugh.'),
            g('goon', 'I took this job for the dental plan. There is no dental plan.'),
          ],
        },
        {
          id: 'toLoungeRoof', text: 'Up to the Lounge roof. Grapple.', site: 'n2LoungeRoof', radius: 8, tutorial: ['grapple'],
          nudge: g('oracle', 'Roof party. Straight up from the door. Grapple.'),
          lines: [g('penguin', 'A visitor! Without an invitation. How very common. Do come up, Detective, the view is wonderful and the fall is worse.')],
        },
      ],
    },
    {
      id: 'm2Penguin', title: 'Last Call', rewards: ['xp:500', 'lore:penguinFile'], checkpoint: 'n2LoungeRoof',
      steps: [
        { id: 'penguinBoss', type: 'boss', boss: 'penguin', text: 'Take down the Penguin. Gadgets open his umbrella. Bodyguards first.', checkpoint: 'n2LoungeRoof' },
        {
          id: 'n2Wrap', type: 'wait', seconds: 7, text: 'GCPD is on the way up.',
          lines: [
            g('gordon', 'We have him, the diamonds and the ledger. The vote is safe for tomorrow.'),
            g('gordon', 'One thing. The ledger has a green question mark on the last page. My forensics people say it was drawn with a very expensive pen.'),
            g('alfred', 'A question mark, sir. I do hope that is not a signature.'),
          ],
        },
        { id: 'n2End', type: 'nightEnd', scene: 'n2End', after: 'The Penguin is in custody. Gotham Mile can keep its ice.', rewards: ['xp:100'] },
      ],
    },
  ],
};
