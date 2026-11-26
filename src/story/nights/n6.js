// Night Six, "Overgrowth" (Act IV, The Cold Front). The botanist has turned Robinson Park into a
// garden that eats people, and the night begins at Bruce Wayne's own garden party in Bristol with
// her vines already on the greenhouse. The night is about holding back: civilians spore-dazed into
// a mob, a boss who feeds on every bruise you leave on them. Verbs in order: talk (as Bruce), a
// choice between the guests and the greenhouse, a long glide east, the ninja's tutorial at the
// fountain, detective work on the roots, a rehearsal fight against dazed commuters (stun, do not
// strike), a timed run over the park canopy, a predator room at the band shell, a detective at the
// scene, a chase on Lakeshore Drive, the conservatory roof, the boss, and a reprise at the Manor
// that remembers whether you stayed at your own party.
// New role this night: the ninja (tutorial at the fountain). Format: docs/design/story-format.md.
//
// [m67] Four missions added for length (docs/design/briefs/missions-round.md), each in the plot:
//   m6Tower   Waterworks: she is dosing the park's water at the Mile's pumping station (a vista
//             scan from the tower, a predator room in the yard, the valves in the order the water
//             runs, a sample for Oracle). After the sleepwalkers.
//   m6Press   Bad Press: the GCPD saw a man in a cape shut off the Mile's water. Lose them (a
//             scripted police pursuit), then the pier: evacuees pinned by vines against a clock,
//             dazed evacuees under the wheel, her spore blower, and the view from the top.
//   m6Case    Paper Roots: the boathouse as a crime scene, a case board, and the closure order
//             with Bruce Wayne's signature on it (the councillor rings mid-fight). After Ostrow.
//   m6Marina  Downstream: sower drones on Lakeshore Drive from the Batmobile, then the seed barge
//             at the museum campus marina (a predator room). After the seed truck.
import { g, v, B, face, recap } from './common.js';
import { W, route } from '../rooms.js';
import '../missions/n6/steps.js'; // [m67] step types: freeing, hack, escape, caseboard

// [m67] The added missions run through places the open world also uses (the pier, the museum
// campus, the Loop's rooftops). `quiet` on a step keeps an unplayed open-world predator encounter
// from starting under it (src/openworld/index.js): one of those holds the story until it is played.
const quiet = (steps) => steps.map((s) => ({ ...s, quiet: true }));

const SITES = {
  n6Terrace: { x: -399, y: 18.85, z: -725 },
  n6Mara: { x: -395, y: 18.6, z: -712 },
  n6Pryce: { x: -415, y: 18, z: -735 },
  n6Guests: { x: -400, y: 18.6, z: -718 },
  n6Greenhouse: { x: -370, y: 18, z: -722 },
  n6Overlook: { x: -214, y: 15.2, z: -764 },
  n6ParkGate: { x: 270, y: 0, z: -430 },
  n6Fountain: { x: 300, y: 0, z: -455 },
  n6RootA: { x: 284, y: 0, z: -488 },
  n6RootB: { x: 312, y: 0, z: -500 },
  n6RootC: { x: 320, y: 0, z: -520 },
  n6Commuters: { x: 282, y: 0.15, z: -585 },
  n6Mirror: { x: 282, y: 0.15, z: -585 },
  n6Canopy1: { x: 260, y: 0, z: -620 },
  n6Canopy2: { x: 330, y: 0, z: -600 },
  n6Shell: { x: 300, y: 0.43, z: -650 },
  n6ShellEntry: { x: 330, y: 0, z: -640 },
  n6Boathouse: { x: 380, y: 0.15, z: -610 },
  n6BoathouseRoof: { x: 380, y: 4.55, z: -610 },
  n6Ostrow: { x: 372, y: 0, z: -600 },
  n6Car: { x: 345, y: 0, z: -560, yaw: 0 },
  n6ConsRoof: { x: 294, y: 26, z: -750 },
  n6ConsDoor: { x: 294, y: 0.15, z: -733 },
  n6IvyArena: { x: 294, y: 0, z: -712 },
  n6IvyStart: { x: 294, y: 0, z: -722 },
  n6Gates: { x: -280, y: 17, z: -752 },
  n6GardenEnd: { x: -395, y: 18.6, z: -712 },
  // [m67] Waterworks (the Mile's pumping station)
  n6TowerTop: { x: 191, y: 12, z: -683 },
  n6TowerLedge: { x: 216, y: 10, z: -684 },
  n6PumpYard: { x: 199, y: 0.15, z: -684 },
  n6ValveIntake: { x: 199, y: 0.15, z: -702 },
  n6ValveFilter: { x: 194, y: 0.15, z: -690 },
  n6ValveMain: { x: 204, y: 0.15, z: -668 },
  n6Rig: { x: 204, y: 0.15, z: -690 },
  // [m67] Bad Press (the Amusement Mile pier)
  n6PierGate: { x: 392, y: 3, z: -450 },
  n6PierKiosk: { x: 408, y: 3, z: -447 },
  n6PierCarousel: { x: 428, y: 3, z: -456 },
  n6PierBooth: { x: 462, y: 3, z: -441 },
  n6PierCoaster: { x: 482, y: 3, z: -452 },
  n6Wheel: { x: 452, y: 3, z: -456 },
  n6BlowerA: { x: 438, y: 3, z: -443 },
  n6BlowerB: { x: 464, y: 3, z: -443 } /* 25 m clear of the open world's own pier encounter (pierUndercroft) */,
  n6WheelTop: { x: 446, y: 34.9, z: -450 },
  // [m67] Paper Roots (the boathouse scene and the band shell path)
  n6Tracks: { x: 372, y: 0.15, z: -604 },
  n6Stencil: { x: 388, y: 0.15, z: -616 },
  n6Runner: { x: 366, y: 0.15, z: -612 },
  n6Notice: { x: 328, y: 0, z: -644 },
  n6Hygiene: { x: 322, y: 0, z: -636 },
  n6Dash1: { x: 338, y: 0, z: -618 },
  n6Dash2: { x: 350, y: 0, z: -592 },
  n6Ledger: { x: 347, y: 0, z: -566 },
  // [m67] Downstream (Lakeshore Drive south and the museum campus marina)
  n6DriveCar: { x: 345, y: 0, z: -420, yaw: 0 },
  n6SowerSite: { x: 345, y: 0, z: -120 },
  n6DriveSouth: { x: 345, y: 0, z: 150 },
  n6Marina: { x: 294, y: 0, z: 188 },
  n6AquariumRoof: { x: 300, y: 18.5, z: 165 },
  n6Barge: { x: 290, y: 0, z: 197 },
  n6MarinaCar: { x: 345, y: 0, z: 150, yaw: Math.PI },
};

const ROOMS = {
  shellRoom: {
    id: 'shellRoom', site: 'n6Shell', entry: 'n6ShellEntry', radius: 24, gang: 'ivy',
    lights: [{ x: 300, y: 3.5, z: -640, r: 5, post: true }, { x: 288, y: 3.5, z: -660, r: 4, post: true }, { x: 314, y: 3.5, z: -660, r: 4, post: true }],
    cover: [{ x: 294, y: 0.4, z: -645, w: 3, d: 1.4, h: 1.6 }, { x: 308, y: 0.4, z: -648, w: 1.4, d: 3, h: 1.6 }, { x: 290, y: 0.4, z: -656, w: 1.6, d: 1.6, h: 1.4 }, { x: 304, y: 0.4, z: -660, w: 2.4, d: 1.2, h: 1.5 }],
    huddle: { x: 300, y: 0.4, z: -652 },
    squad: [
      { type: 'sniper', route: route('pingpong', W(288, 0.4, -664, 3, Math.PI / 2), W(312, 0.4, -664, 3, -Math.PI / 2)) },
      { type: 'ninja', route: route('loop', W(292, 0.4, -642), W(308, 0.4, -642, 1.5, 0), W(308, 0.4, -656), W(292, 0.4, -656, 1.5, Math.PI)) },
      { type: 'rifle', route: route('pingpong', W(284, 0.4, -646, 2.5, Math.PI / 2), W(284, 0.4, -660, 2.5, Math.PI / 2)) },
      { type: 'medic', route: route('pingpong', W(316, 0.4, -646, 3, -Math.PI / 2), W(316, 0.4, -658, 3, -Math.PI / 2)) },
      { type: 'grunt', route: route('pingpong', W(296, 0.4, -638, 2, 0), W(304, 0.4, -638, 2, 0)) },
    ],
  },
  // [m67] The pumping station yard on the Mile: the tower stands over its west side (the entry).
  pumpRoom: {
    id: 'pumpRoom', site: 'n6PumpYard', entry: 'n6TowerTop', radius: 24, gang: 'ivy',
    lights: [{ x: 195, y: 3.4, z: -697, r: 4.5, post: true, base: 0.15 }, { x: 203, y: 3.4, z: -672, r: 4.5, post: true, base: 0.15 }, { x: 205, y: 3.4, z: -688, r: 4, post: true, base: 0.15 }],
    cover: [{ x: 197, y: 0.15, z: -692, w: 3, d: 1.4, h: 1.6 }, { x: 203, y: 0.15, z: -678, w: 1.4, d: 3, h: 1.6 }, { x: 195, y: 0.15, z: -674, w: 1.6, d: 1.6, h: 1.4 }, { x: 201, y: 0.15, z: -699, w: 2.4, d: 1.2, h: 1.5 }],
    huddle: { x: 199, y: 0.15, z: -684 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(194, 0.15, -700, 3, 0), W(194, 0.15, -668, 3, Math.PI)) },
      { type: 'ninja', route: route('loop', W(197, 0.15, -686), W(205, 0.15, -686, 1.5, Math.PI / 2), W(205, 0.15, -696), W(197, 0.15, -696, 1.5, -Math.PI / 2)) },
      { type: 'shield', route: route('pingpong', W(205, 0.15, -670, 2.5, Math.PI), W(205, 0.15, -682, 2.5, Math.PI)) },
      { type: 'medic', route: route('pingpong', W(199, 0.15, -668, 3, Math.PI), W(199, 0.15, -678, 3, 0)) },
      { type: 'grunt', route: route('pingpong', W(196, 0.15, -702, 2, Math.PI / 2), W(204, 0.15, -702, 2, -Math.PI / 2)) },
      { type: 'grunt', route: route('pingpong', W(201, 0.15, -690, 2.5, 0), W(201, 0.15, -682, 2.5, Math.PI)) },
    ],
  },
  // [m67] The marina lawn south of the aquarium: seed crates going onto a barge. Entry: the aquarium roof.
  marinaRoom: {
    id: 'marinaRoom', site: 'n6Marina', entry: 'n6AquariumRoof', radius: 28, gang: 'ivy',
    lights: [{ x: 280, y: 3.4, z: 182, r: 5, post: true }, { x: 304, y: 3.4, z: 196, r: 5, post: true }, { x: 312, y: 3.4, z: 180, r: 4, post: true }],
    cover: [{ x: 286, y: 0, z: 186, w: 3, d: 1.4, h: 1.6 }, { x: 298, y: 0, z: 192, w: 1.4, d: 3, h: 1.6 }, { x: 306, y: 0, z: 184, w: 2, d: 2, h: 1.5 }, { x: 292, y: 0, z: 198, w: 3, d: 1.2, h: 1.5 }, { x: 276, y: 0, z: 194, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: 294, y: 0, z: 188 },
    squad: [
      { type: 'sniper', route: route('pingpong', W(312, 0, 198, 3.5, -Math.PI / 2), W(312, 0, 182, 3.5, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(274, 0, 180, 2.5, Math.PI / 2), W(274, 0, 198, 2.5, Math.PI / 2)) },
      { type: 'ninja', route: route('loop', W(284, 0, 182), W(304, 0, 182, 1.5, 0), W(304, 0, 190), W(284, 0, 190, 1.5, Math.PI)) },
      { type: 'pistol', route: route('pingpong', W(288, 0, 200, 2, 0), W(302, 0, 200, 2, 0)) },
      { type: 'medic', route: route('pingpong', W(296, 0, 180, 3, Math.PI), W(296, 0, 188, 3, 0)) },
      { type: 'grunt', route: route('pingpong', W(280, 0, 188, 2, Math.PI / 2), W(290, 0, 194, 2, Math.PI / 2)) },
    ],
  },
};

const FIGHTS = {
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n6Pruners: { site: 'n6RootB', radius: 12, gang: 'ivy', act: 4, district: 'park', waves: [{ budget: 7, ring: 4.5 }] },
  n6Seeds: { site: 'n6Canopy2', radius: 12, gang: 'ivy', act: 4, district: 'park', waves: [{ budget: 7, ring: 4.5 }] },
  greenhouse: { site: 'n6Greenhouse', radius: 12, gang: 'ivy', act: 4, district: 'bristol', waves: [{ budget: 5, ring: 6 }] },
  fountain: { site: 'n6Fountain', radius: 14, gang: 'ivy', act: 4, district: 'lakefront', waves: [{ budget: 5, ring: 7, lead: 'ninja' }, { budget: 8, ring: 7, lead: 'shield' }] },
  // Spore-dazed commuters: the rehearsal for the boss (stun, never strike). They are plain goons in
  // the combat code; the step's `thralls` flag makes the story count every punch that lands on one.
  commuters: { site: 'n6Commuters', radius: 13, gang: 'ivy', act: 2, district: 'lakefront', waves: [[{ type: 'grunt', dx: -4, dz: 2 }, { type: 'grunt', dx: 3, dz: 3 }, { type: 'grunt', dx: 0, dz: -4 }, { type: 'grunt', dx: 5, dz: -2 }], [{ type: 'grunt', dx: -5, dz: -3 }, { type: 'grunt', dx: 4, dz: 5 }, { type: 'grunt', dx: -2, dz: 6 }]] },
  shell: { stealth: 'shellRoom' },
  mugging: { site: 'n6ParkGate', radius: 10, gang: 'ivy', act: 3, district: 'lakefront', waves: [{ budget: 3, ring: 4 }] },
  manorVines: { site: 'n6Gates', radius: 13, gang: 'ivy', act: 4, district: 'bristol', waves: [{ budget: 7, ring: 7, lead: 'brute' }, { budget: 8, ring: 7, lead: 'ninja' }] },
  manorQuiet: { site: 'n6Gates', radius: 12, gang: 'ivy', act: 4, district: 'bristol', waves: [{ budget: 4, ring: 6 }] },
  // [m67]
  pump: { stealth: 'pumpRoom' },
  marina: { stealth: 'marinaRoom' },
  // Evacuees under the wheel, spore-dazed (the step's `thralls` flag: stun, never strike).
  evacuees: { site: 'n6Wheel', radius: 14, gang: 'ivy', act: 2, district: 'amusementMile', waves: [[{ type: 'grunt', dx: -5, dz: 2 }, { type: 'grunt', dx: 4, dz: 3 }, { type: 'grunt', dx: 0, dz: -5 }, { type: 'grunt', dx: 6, dz: -2 }], [{ type: 'grunt', dx: -6, dz: -3 }, { type: 'grunt', dx: 3, dz: 6 }, { type: 'grunt', dx: -2, dz: 7 }, { type: 'grunt', dx: 7, dz: 4 }]] },
  // The one straight fight among the added missions: the "pest control" crew, back for their paperwork.
  hygiene: { site: 'n6Hygiene', radius: 14, gang: 'ivy', act: 4, district: 'lakefront', waves: [{ budget: 8, ring: 7, lead: 'ninja' }, { budget: 10, ring: 7, lead: 'shield', add: [{ type: 'brute', dx: 0, dz: 7 }] }] },
};

const SCENES = {
  n6Recap: (stage) => recap(stage, {
    title: 'Five nights, one ledger',
    panels: [
      'The fear in the Narrows and the frost in the Yards were paid for by the same company: Sionis Cold Holdings.',
      { shot: { cam: [-340, 52, 20], look: [-340, 20, 122] }, caption: 'The Yards have thawed. The money has not stopped moving.' },
      { shot: { cam: [-370, 30, -700], look: [-399, 19, -725] }, caption: 'Tonight Bruce Wayne hosts a garden party. Tonight, something in the garden is growing.' },
    ],
  }),
  n6Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [360, 8, -560], look: [345, 1, -600], hero: { at: [348, 0, -590], yaw: 0.4, anim: 'Interact' } }), caption: 'The seed truck\'s manifest. Not seeds: cuttings. Wayne Manor greenhouse, the orchid collection.' },
      { img: face('ivy', 'THE ORCHIDS', 'Martha Wayne\'s collection'), caption: 'Forty years old. Every one of them catalogued, by name, in a hand Bruce knows.', captionPos: 'bottom' },
      { img: face('blackMask', 'A RETAINER', 'paid by Sionis Cold Holdings'), balloons: [B('The park is a distraction, Batman. So is the party. Somebody wanted Bruce Wayne at home and looking the other way.', 50, 6, { w: 84 })] },
    ],
  }],
  ivyIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [294, 9, -690], look: [294, 1, -718], hero: { at: [294, 0, -700], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The conservatory lawn. Every lamp post wears a rose.' },
      { img: face('ivy', 'POISON IVY'), balloons: [B('Look at them, Batman. Commuters, joggers, a man with a dog. All of them mine. Hit one, I dare you.', 50, 6, { w: 82 })] },
    ],
  }],
  ivyOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: face('ivy', 'ROOTS CUT'), balloons: [B('You held back. All night. Do you know how rare that is in this city?', 50, 6, { w: 80 })] },
      { img: stage.shot({ cam: [304, 5, -700], look: [294, 0.5, -714], hero: { at: [296, 0, -710], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The commuters wake up on the lawn, embarrassed, mostly fine. The man with the dog gets his dog back.', captionPos: 'bottom' },
    ],
  }],
  n6End: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [-380, 26, -700], look: [-399, 19, -725] }), caption: 'Bristol, near dawn. The greenhouse glass is cracked. The orchids are not.' },
      { img: face('alfred', 'ALFRED'), balloons: [B('Your guests have gone home, sir, with stories. I have told them it was a very aggressive hedge.', 50, 6, { w: 80 })] },
    ],
  }],
};

const PARTY_GUEST_CALL = {
  id: 'cover', from: 'alfred', after: 6, timeout: 14, default: 'cellar',
  lines: [g('alfred', 'Sir. Councillor Pryce is asking where the host has gone. I need a story in the next ten seconds.')],
  prompt: 'Alfred needs a cover story for the party',
  options: [
    { id: 'cellar', tag: 'cover', text: 'The wine cellar. A rare vintage, a long search.', effects: { suspicion: { reporter: 1 }, patience: -2 }, lines: [g('alfred', 'The cellar. Very good. I shall look suitably flustered about the Burgundy.')] },
    { id: 'migraine', tag: 'cover', text: 'A migraine. Lying down in the dark.', effects: { standing: -2, patience: -1 }, lines: [g('alfred', 'Lying down in the dark. Well. It is not entirely untrue.')] },
    { id: 'dog', tag: 'joke', text: 'Chasing the dog through the rose beds.', effects: { standing: 1, suspicion: { reporter: 2 } }, lines: [g('alfred', 'We do not have a dog, sir.'), g('alfred', 'We do now. I shall acquire one before breakfast.')] },
  ],
};

export default {
  id: 'n6', act: 'act4', number: 6, actNumber: 4,
  title: 'Night Six: Overgrowth',
  blurb: 'A garden party in Bristol, a mob of sleepwalkers in Robinson Park, and a botanist who wants Bruce Wayne looking the other way.',
  villain: 'poisonIvy', gang: 'ivy',
  districts: ['lakefront', 'bristol'],
  timeOfDay: 20.5, weather: 'overcast',
  start: 'n6Terrace',
  day: {
    hook: 'day.n6',
    context: { day: 6, appointments: [{ id: 'gardenParty', at: 19, place: 'wayneManorTerrace', title: 'The Wayne garden party' }], lead: 'The Robinson Park conservatory has been closed for "pest control" for a week. Nobody at the city remembers ordering it.' },
    fallback: [
      g('alfred', 'Tonight is the garden party, sir. Forty guests, two string quartets and one rather ambitious ice sculpture. I have hidden the Kevlar under the canapés.'),
      g('alfred', 'Also, the greenhouse door was open this morning. I did not open it. The orchids look, if I may say so, nervous.'),
    ],
  },
  sites: SITES,
  rooms: ROOMS,
  fights: FIGHTS,
  scenes: SCENES,
  overheard: [
    [['goonA', 'Why are we guarding a hedge?'], ['goonB', 'It is not a hedge. It is a living perimeter.'], ['goonA', 'It just ate my sandwich.'], ['goonB', 'Living perimeter.']],
    [['goonA', 'Boss lady says do not step on the moss.'], ['goonB', 'Which moss?'], ['goonA', 'All of it. It is a park, Dave. It is all moss.']],
    [['goonA', 'I asked for a raise and she gave me a fern.'], ['goonB', 'Is it a nice fern?'], ['goonA', 'It is a lovely fern. That is not the point.']],
  ],
  missions: [
    {
      id: 'm6Party', title: 'Garden Party', checkpoint: 'n6Terrace', rewards: ['xp:100'],
      steps: [
        { id: 'n6Recap', type: 'cutscene', scene: 'n6Recap' },
        {
          id: 'n6Party', type: 'civvy', outfit: 'tux', text: 'Your own garden party. Be Bruce Wayne for a while.', site: 'n6Terrace',
          title: { text: 'ACT FOUR: THE COLD FRONT', sub: 'Night Six: Overgrowth' },
          card: 'You are Bruce tonight, in black tie, on your own terrace. Walk to the gold markers and talk. Every answer costs or earns something.',
          beats: [
            { id: 'mara', site: 'n6Mara', text: 'Mara Quell is by the roses.', lines: [v('mara', 'You actually came to your own party. I owe Alfred five dollars.')],
              choice: { key: 'n6.mara', prompt: 'Mara, glass untouched, watching the greenhouse', default: 'charm', options: [
                { id: 'charm', tag: 'charm', text: 'I heard there would be roses. I came for the roses.', effects: { threads: { love: 0.4 } }, lines: [v('mara', 'Liar. But a nice one.')] },
                { id: 'honest', tag: 'honest', text: 'I almost did not. It has been a long week.', effects: { threads: { love: 0.7 }, suspicion: { reporter: 1 } }, lines: [v('mara', 'You say that every week. Stay for one song, at least.')] },
              ] } },
            { id: 'pryce', site: 'n6Pryce', text: 'Councillor Pryce wants a word about the park.', lines: [v('pryce', 'Wayne. The conservatory is closed for pest control and my office never ordered it. You sit on the parks board. Explain.')],
              choice: { key: 'n6.pryce', prompt: 'The councillor wants an answer', default: 'promise', options: [
                { id: 'promise', tag: 'promise', text: 'I will have someone look at it tonight.', effects: { standing: 2 }, lines: [v('pryce', 'Tonight. Good. People keep promising me tonight.')] },
                { id: 'playboy', tag: 'act', text: 'Parks board? Is that the one with the lunch?', effects: { standing: -1, suspicion: { reporter: -2 } }, lines: [v('pryce', 'It is the one with the budget, Wayne. Try to keep up.')] },
              ] } },
            { id: 'vines', site: 'n6Guests', text: 'Something is moving on the greenhouse glass.', lines: [v('guest', 'Is the greenhouse supposed to be breathing?'), g('alfred', 'Sir. The greenhouse. Discreetly, if at all possible.')] },
          ],
        },
        {
          id: 'n6Garden', type: 'dilemma', key: 'n6.party', text: 'Vines on the greenhouse, guests on the terrace. Stay with the guests (gold) or slip away to the greenhouse.',
          timer: 40, heading: 'TWO PLACES AT ONCE',
          card: 'Stay with your guests (gold marker) and Alfred handles the greenhouse alone, or slip away and fight the vines while the party wonders where you went.',
          bruce: { site: 'n6Terrace', radius: 6, label: 'Stay at the party', lines: [g('alfred', 'Very well, sir. I shall deal with the greenhouse with a pair of secateurs and my dignity.')],
            miss: { effects: { standing: -4, threads: { love: -0.4 } }, lines: [v('mara', 'He was right here a second ago. He does that, does he not?')] } },
          batman: { site: 'n6Greenhouse', radius: 9, label: 'Slip away to the greenhouse', lines: [g('batman', 'Alfred. Keep them on the terrace.')],
            miss: { effects: { city: -3 }, lines: [g('alfred', 'The vines went over the wall while you were toasting, sir. Toward the park.')] } },
          both: { effects: { standing: 1 }, lines: [g('alfred', 'One of you at the party and one in the greenhouse. I could weep.')] },
          branches: { bruce: 'n6Toast', batman: 'n6GreenhouseFight', both: 'n6GreenhouseFight' },
          calls: [PARTY_GUEST_CALL],
        },
        {
          id: 'n6Toast', type: 'civvy', outfit: 'tux', text: 'Give the toast. Smile.', next: 'n6ToPark',
          beats: [{ id: 'toast', site: 'n6Terrace', text: 'The toast, on the terrace.', lines: [g('bruce', 'To the park, and everything that grows there.'), v('guest', 'Hear, hear!'), g('alfred', 'The greenhouse is quiet, sir. The vines left. Toward Robinson Park.')] }],
          endLines: [g('alfred', 'Your guests are toasting the roses. The roses, I fear, are toasting you.')],
        },
        {
          id: 'n6GreenhouseFight', type: 'fight', fight: 'greenhouse', text: 'Thorns in the greenhouse. Quietly: there are guests forty metres away.',
          lines: [v('thorn', 'Shh. Shh! There is a party.'), v('thorn', 'Then why did you bring the leaf blower?')],
        },
      ],
    },
    {
      id: 'm6Park', title: 'Into the Park', checkpoint: 'n6Overlook', rewards: ['xp:150'],
      steps: [
        {
          id: 'n6ToPark', text: 'The vines are coming from Robinson Park. Glide east from the Bristol ridge.', site: 'n6ParkGate', radius: 18,
          nudge: g('oracle', 'East, over the Mile and the Pumping Tower. The park is the dark green rectangle with the lake beside it. It is moving. Parks should not move.'),
          lines: [
            g('oracle', 'Robinson Park. Thermal imaging says the whole thing is warm. Like a compost heap. Or a crowd.'),
            g('gordon', 'Gordon. We have forty missing persons from the park since sundown. Joggers, commuters, a man walking his dog. Their phones are all still in the park.'),
          ],
          banter: [
            v('dispatch', 'Units near Robinson Park: the plants are behaving aggressively. Please do not argue with the plants.'),
            g('oracle', 'Fun fact: the conservatory was built in 1894 and has never once tried to eat anyone. I checked.'),
            g('alfred', 'Your guests are asking about the music. The quartet has stopped. A vine took the cello.'),
          ],
          interrupts: [{ id: 'n6Mugging', at: 'n6ParkGate', radius: 26, fight: 'mugging', xp: 80, label: 'Optional: the park gate mugging is stopped', lines: [v('dispatch', 'Any unit, park gate: three men in leaves robbing a hot dog stand. They took the relish. Only the relish.')] }],
          calls: [{
            id: 'lucius', from: 'lucius', after: 18, timeout: 12, default: 'later',
            lines: [v('lucius', 'Bruce, it is Lucius. The board wants the R and D budget numbers by morning or they freeze the prototype. Do you want me to send the honest version or the optimistic one?')],
            prompt: 'Lucius needs an answer on the R&D numbers',
            options: [
              { id: 'honest', tag: 'honest', text: 'Honest. They can take it.', effects: { threads: { lucius: 0.5 }, standing: -1 }, lines: [v('lucius', 'Honest it is. They will hate it. I will enjoy that.')] },
              { id: 'optimistic', tag: 'spin', text: 'Optimistic. We will grow into it.', effects: { standing: 2, threads: { lucius: -0.3 } }, lines: [v('lucius', 'Optimistic. I will hold my nose and type.')] },
              { id: 'later', tag: 'later', text: 'Not now, Lucius.', effects: { freeze: 'prototype', threads: { lucius: -0.4 } }, lines: [v('lucius', 'Not now. Right. The prototype stays in its crate, then.')] },
            ],
          }],
        },
      ],
    },
    {
      id: 'm6Fountain', title: 'Founders\' Fountain', checkpoint: 'n6ParkGate', rewards: ['lore:thornGang'],
      steps: [
        {
          id: 'n6FountainFight', type: 'fight', fight: 'fountain', text: 'Thorns at the fountain, and a new kind of fighter with them.',
          tip: { title: 'NEW: THE NINJA', text: 'He dodges plain strikes and turns your first counter around. Counter twice, vary your rhythm, cape stun him, or come in from the air.' },
          lines: [v('thorn', 'She said you would come. She said you would be grumpy.'), v('thorn', 'He does look grumpy.')],
        },
        {
          id: 'n6Roots', type: 'scan', text: 'Detective vision: follow the roots from the fountain.',
          points: [
            { site: 'n6RootA', lines: [g('oracle', 'The roots run under the paths, not through the beds. Somebody planted them to a plan.')] },
            { site: 'n6RootB', lines: [g('oracle', 'Spore sacs on the root, the size of a grapefruit. Burst one and you breathe in whatever she wants you to feel.')] },
            { site: 'n6RootC', lines: [g('oracle', 'They all lead north to the conservatory. And there is a crowd at the Mirror who are not moving like a crowd.')] },
          ],
          lines: [g('oracle', 'Three root lines leave the fountain. Detective vision on and walk them.')],
          optional: [{ id: 'n6Plaque', title: 'Optional: read the fountain plaque', site: 'n6Fountain', radius: 5, xp: 40, done: 'A plaque to the park\'s founders. Somebody has added "AND THE PLANTS" in moss.', lines: [v('plaque', 'Robinson Park, given to the people of Gotham. And the plants. Mostly the plants.')] }],
        },
      ],
    },
    {
      id: 'm6Sleepwalkers', title: 'Sleepwalkers', checkpoint: 'n6Commuters', rewards: ['xp:200', 'gadget:decoy'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n6ToMirror', text: 'The crowd at the Mirror. Get there.', site: 'n6Mirror', radius: 16,
          interrupts: [{ id: 'n6Pruners', at: 'n6RootB', radius: 24, fight: 'n6Pruners', xp: 80, label: "Optional: the root pruners are down", lines: [{ speaker: 'oracle', portrait: 'oracle', text: "Her people are cutting the park lights so the roots can spread in the dark. Seven of them by the lamp line." }] }], // [balance]
          lines: [g('oracle', 'Six people standing in a ring round the Mirror sculpture, swaying. Their heart rates say asleep. Their feet say otherwise.')],
        },
        {
          id: 'n6Commuters', type: 'fight', fight: 'commuters', thralls: true, text: 'They are civilians, spore-dazed. Cape-stun them awake. Do not punch them.',
          tip: { title: 'HOLD BACK', text: 'These are commuters, not goons. Cape stun, a batarang or a counter shakes the spores loose. Every punch lands on someone who did nothing wrong, and the city will hear about it.' },
          lines: [v('commuter', 'Must... water... the... begonias...'), g('batman', 'Sir. Wake up.')],
        },
      ],
    },
    // [m67] Waterworks: the park's water is dosed at the Mile's pumping station.
    {
      id: 'm6Tower', title: 'Waterworks', checkpoint: 'n6TowerTop', rewards: ['xp:150'],
      steps: quiet([
        {
          id: 'n6ToTower', text: 'The sacs drink from the park\'s water main. Up to the gallery of the Pumping Tower on the Mile.', site: 'n6TowerTop', radius: 8,
          nudge: g('oracle', 'West out of the park onto the Mile. The Pumping Tower is the tall stone one that looks like a castle somebody forgot. Grapple the gallery, a third of the way up.'),
          lines: [
            g('oracle', 'Those commuters were drinking from the fountains. The sacs are fed by the park\'s irrigation main, and the main is fed from the Pumping Station on the Mile.'),
            g('oracle', 'She is dosing the water. The Mile\'s street sprinklers run at eleven. That is a lot of shoppers who suddenly want to stand very still near a hedge.'),
          ],
          banter: [
            v('dispatch', 'Units on the Mile: reports of a man watering the pavement and apologising to it. Approach with patience.'),
            g('alfred', 'The Pumping Tower survived the fire of 1871, sir. I should be obliged if it also survived you.'),
          ],
        },
        {
          id: 'n6TowerScan', type: 'scan', text: 'Detective vision from the tower: find her dosing rig and count the yard.',
          points: [
            { site: 'n6TowerTop', lines: [g('oracle', 'Six in the station yard below you, east side. One shield, one of the quick ones from the fountain, and a medic who looks bored.')] },
            { site: 'n6TowerLedge', lines: [g('oracle', 'There. A green drum plumbed into the filter bed, and three valve wheels with fresh paint. She has re-run the pipes so the park main comes off last.')] },
          ],
          lines: [g('oracle', 'Two looks: one from the tower gallery, one from the station roof across the yard. Do not drop in until you have both.')],
        },
        {
          id: 'n6PumpRoom', type: 'fight', fight: 'pump', text: 'Six of her people in the pumping station yard. Quietly: the valves are behind them.', tutorial: ['crouch', 'silent'],
          lines: [v('thorn', 'I used to be a plumber, you know.'), v('thorn', 'You are still a plumber, Gary. You are just a plumber for a plant now.')],
        },
        {
          id: 'n6Valves', type: 'puzzle', text: 'Shut the three valves the way the water runs.', checkpoint: 'n6PumpYard', retry: true,
          riddleTitle: 'THE VALVES',
          riddle: 'Shut them in the order the water runs: the lake intake by the north lamp, the filter bed under the tower wall, the park main by the south lamp. Out of order and the pressure blows a sac.',
          plates: [{ id: 'main', site: 'n6ValveMain', label: 'Park main' }, { id: 'intake', site: 'n6ValveIntake', label: 'Lake intake' }, { id: 'filter', site: 'n6ValveFilter', label: 'Filter bed' }],
          order: ['intake', 'filter', 'main'], timer: 75, wrongCost: 10,
          wrongLines: [g('oracle', 'Wrong wheel. A sac just went on the Mile. Intake, filter, main: north lamp, tower wall, south lamp.'), g('alfred', 'Water, sir, runs downhill and in one direction. I mention it only in passing.')],
          penalty: { budget: 3, gang: 'ivy', site: 'n6PumpYard' },
          failLines: [g('oracle', 'Eleven o\'clock. The sprinklers ran. Go again, I can roll the timer back but not the water.')],
          lines: [g('oracle', 'Three wheels. Close them upstream to downstream or the back pressure does her work for her.')],
        },
        {
          id: 'n6Sample', type: 'collect', item: 'n6Sample', site: 'n6Rig', radius: 3, text: 'Take a sample from her dosing drum.',
          lines: [g('oracle', 'Main is shut. Get me a sample from the green drum and I can tell you what forty people are dreaming about.')],
        },
      ]),
    },
    // [m67] Bad Press: a scripted police pursuit, then the pier.
    {
      id: 'm6Press', title: 'Bad Press', checkpoint: 'n6PumpYard', rewards: ['xp:200'],
      steps: quiet([
        {
          id: 'n6Heat', type: 'escape', level: 2, at: 'n6PumpYard', hide: 'n6Mirror', mercy: 130, text: 'The GCPD think you poisoned the Mile. Lose them: break their line of sight and stay out of it.',
          lines: [
            v('dispatch', 'All units, the Mile pumping station: the vigilante has shut off the water main. Yes, that vigilante. No, we do not know why.'),
            g('gordon', 'Gordon. I know why. Half my shift does not. Stay out of sight for two minutes and I can make this go away.'),
            g('oracle', 'The sample says it is not a poison, it is a suggestion. Tell that to the cruisers. Back into the park, the trees will cover you.'),
          ],
          hintLines: [g('oracle', 'They only chase what they can see. Rooftops, trees, anything between you and a windscreen. Then stop moving.')],
          doneLines: [g('gordon', 'They have lost you. Officially you were a large bird. Unofficially: thank you for the water.')],
          caughtLines: [g('gordon', 'They had you in cuffs for a second there. I lost the paperwork. Do not make me lose it twice.')],
          mercyLines: [g('gordon', 'I have called them off myself. You owe me a coffee. A good one, not the precinct kind.')],
        },
        {
          id: 'n6ToPier', text: 'The evacuees were sent to the Amusement Mile pier. Her vines followed the crowd. East, over the drive.', site: 'n6PierGate', radius: 14,
          nudge: g('oracle', 'East across Lakeshore Drive. The pier is the long one with the wheel on it. You cannot miss the wheel, it is the only thing in Gotham that is supposed to go in circles.'),
          lines: [
            g('oracle', 'While half the precinct was chasing you: the park evacuation went to the pier, and the vines went after the crowd. Four groups pinned along the boardwalk, sacs swelling over each one.'),
          ],
          banter: [g('alfred', 'Master Bruce won a goldfish on that pier when he was nine, sir. It lived eleven years. I mention it because the goldfish stall is, I believe, on fire.')],
        },
        {
          id: 'n6PierRescue', type: 'freeing', text: 'Four groups pinned by vines on the pier. Cut each one loose before the sacs burst.', checkpoint: 'n6PierGate', retry: true,
          timer: 75, bonus: 12, hold: 2.5,
          points: [
            { site: 'n6PierKiosk', label: 'The ticket queue', lines: [v('evacuee', 'We were told to queue. We are very good at queueing. Nobody said for what.')] },
            { site: 'n6PierCarousel', label: 'The carousel', lines: [v('evacuee', 'The horse grew leaves. I would like a refund on the horse.')] },
            { site: 'n6PierBooth', label: 'The goldfish stall', lines: [v('evacuee', 'Take the fish! Not me, the fish! All right, also me.')] },
            { site: 'n6PierCoaster', label: 'The coaster steps', lines: [v('evacuee', 'Forty minutes I waited for that ride. The vine pushed in.')] },
          ],
          lines: [g('oracle', 'Stand by each group and cut. The sacs over them go in about a minute. Every group you free buys the others a little air.')],
          failTitle: 'TOO LATE',
          failLines: [g('oracle', 'The sacs went. They are breathing it, and they will walk into the lake if she asks. Go again.')],
          doneLines: [g('oracle', 'All four clear and coughing. Which leaves the ones under the wheel, who did not get clear.')],
        },
        {
          id: 'n6PierThralls', type: 'fight', fight: 'evacuees', thralls: true, text: 'Evacuees under the wheel, spore-dazed. Cape-stun them awake. Do not punch them.',
          lines: [v('evacuee', 'Round... and round... and round...'), g('batman', 'Ma\'am. The ride is over.')],
        },
        {
          id: 'n6Blower', type: 'hack', text: 'Her spore blower is wired into the wheel\'s two control boxes. Hack them, or force each by hand.',
          terminals: [
            { site: 'n6BlowerA', label: 'Wheel drive box', lines: [g('oracle', 'One. The blower is running off the wheel motor. Of course it is. Free power and a nice view.')] },
            { site: 'n6BlowerB', label: 'Blower relay' },
          ],
          hold: 5,
          lines: [g('oracle', 'Two boxes either side of the wheel. The hacking device does each from range in seconds. By hand it is a crowbar and patience.')],
          doneLines: [g('oracle', 'Blower is off. Now go up. I want you to see what I am seeing on thermal.')],
        },
        {
          id: 'n6WheelTop', type: 'scan', text: 'Up the wheel to the axle platform. Detective vision: look back at the park.', points: [{ site: 'n6WheelTop' }], hold: 1.6, radius: 6,
          lines: [g('oracle', 'The axle of the wheel, thirty five metres up. It is the best view of Robinson Park in the city and tonight you will not enjoy it.')],
        },
        {
          id: 'n6FromWheel', text: 'The canopy is closing over the park. Glide back to the Mirror before the paths are gone.', site: 'n6Mirror', radius: 16,
          lines: [g('oracle', 'See it? The tree line is knitting shut from the north. In ten minutes the only way through that park is over it. One long glide west and you are at the Mirror.')],
          banter: [g('alfred', 'I timed that descent, sir. Had you paid for the ride you would be owed most of your money back.')],
        },
      ]),
    },
    {
      id: 'm6Canopy', title: 'Over the Canopy', checkpoint: 'n6Mirror', rewards: ['xp:200'],
      steps: [
        {
          id: 'n6Canopy', type: 'traverse', text: 'The vines are closing over the paths. Over the canopy to the band shell before they do.',
          gates: ['n6Canopy1', 'n6Canopy2', 'n6ShellEntry'], timer: 60, bonus: 10,
          failTitle: 'OVERGROWN', failText: 'The vines closed the route. Back to the Mirror and go again.',
          failLines: [g('alfred', 'Outpaced by shrubbery, sir. I shall not tell the gardener.')],
          lines: [g('oracle', 'Down there it is a maze now. Up top you can glide it: the tree line, the lamp posts by the lake, then the band shell.')],
        },
      ],
    },
    {
      id: 'm6Shell', title: 'The Band Shell', checkpoint: 'n6ShellEntry', rewards: ['gadget:sporeFilter'],
      steps: [
        {
          id: 'n6ShellRoom', type: 'fight', fight: 'shell', text: 'Her guards hold the band shell. A sniper on the stage. Take them silently.', tutorial: ['crouch', 'silent'],
          tip: { title: 'THE SNIPER', text: 'His laser shows where he is looking. Break line of sight when it locks on, then come at him from behind the stage.' },
          lines: [v('thorn', 'Did the hedge just move?'), v('thorn', 'Everything moves, Carl. We are in a magic park.')],
        },
      ],
    },
    {
      id: 'm6Detective', title: 'A Detective Calls', checkpoint: 'n6Boathouse', rewards: ['xp:150', 'gadget:drone'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n6ToBoathouse', text: 'The seed truck was loaded at the boathouse. Check it.', site: 'n6Boathouse', radius: 10,
          interrupts: [{ id: 'n6Seeds', at: 'n6Canopy2', radius: 24, fight: 'n6Seeds', xp: 80, label: "Optional: the seed carriers are stopped", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Any unit near the canopy walk: men in leaf masks scattering seed from sacks. The seed is moving." }] }], // [balance]
          lines: [g('oracle', 'The guards were watching the boathouse. Tyre tracks into it, heavy, and out again toward Lakeshore Drive.')],
        },
        {
          id: 'n6Ostrow', type: 'dilemma', key: 'n6.ostrow', text: 'Headlights. Detective Ostrow is walking into the boathouse. Hide on the roof, or face her.',
          timer: 14, heading: 'COMPANY',
          card: 'Detective Ostrow is here. Get onto the boathouse roof before she sees you, or stand your ground and talk (gold).',
          bruce: { site: 'n6Ostrow', radius: 4, label: 'Brazen it out', lines: [v('ostrow', 'You. Of course it is you. You are standing in my crime scene.'), g('batman', 'Tyre tracks. North, then the drive. Heavy truck.'), v('ostrow', 'I know. I can read tyre tracks. What I cannot read is you.')],
            miss: { effects: {}, lines: [] } },
          batman: { site: 'n6BoathouseRoof', radius: 5, label: 'Hide on the roof', lines: [v('ostrow', 'Footprints. Big ones. Fresh. And not a soul in sight.'), v('ostrow', 'One day I am going to look up.')],
            miss: { effects: { suspicion: { detective: 6 }, threads: { detective: 0.6 } }, lines: [] } },
          timeoutBranch: 'bruce',
          branches: { bruce: 'n6Scene', batman: 'n6Scene' }, // [m67] was n6Board: the scene is worked first
        },
      ],
    },
    // [m67] Paper Roots: the boathouse as a crime scene, the case board, and whose name is on the order.
    {
      id: 'm6Case', title: 'Paper Roots', checkpoint: 'n6Boathouse', rewards: ['xp:200'],
      steps: quiet([
        {
          id: 'n6Scene', type: 'caseboard', text: 'Work the scene before Ostrow\'s forensics van arrives: four pieces of evidence, then the case board.',
          caseTitle: 'Paper Roots', blurb: 'A park does not grow teeth in one night. Somebody planned this, and plans leave paper.',
          prompt: 'How was Robinson Park taken? Put the events in the order they happened.',
          evidence: [
            { id: 'tracks', site: 'n6Tracks', glyph: 'mark', label: 'Tyre tracks', text: 'Heavy truck, loaded here within the hour, out toward Lakeshore Drive. The mud is still wet.', lines: [g('oracle', 'Tracks are fresh. Tonight, within the hour. That is the end of the story, not the start.')] },
            { id: 'stencil', site: 'n6Stencil', glyph: 'object', label: 'Seed crate', text: 'Stencilled "PARKS DEPT: BULBS". Lake weed on the base, three days dry: it came by water and it waited here.', lines: [g('oracle', 'Bulbs. In crates that came off a boat three days ago and sat in the dark. Nobody plants bulbs by boat.')] },
            { id: 'runner', site: 'n6Runner', glyph: 'drop', label: 'Root runner', text: 'A feeder root laid in a cut trench, not grown. About six days of growth since it was put down, running back toward the fountain.', lines: [g('oracle', 'Six days of growth, and somebody dug that trench with a spade. The roots were installed. Like cable.')] },
            { id: 'notice', site: 'n6Notice', glyph: 'print', label: 'Closure notice', text: '"Conservatory closed for pest control." Dated eight days ago. Contractor: Verdant Hygiene, no licence number. Signed for the Parks Board: B. Wayne.', lines: [g('oracle', 'Eight days ago. A contractor that does not exist, and a signature that does.'), g('batman', 'I did not sign that.'), g('oracle', 'I know. I am just telling you what it says.')] },
          ],
          cards: [
            { id: 'crates', text: 'Seed crates come down the lake by boat and are stacked in the boathouse.' },
            { id: 'order', text: 'The conservatory is closed by a Parks Board order signed "B. Wayne".' },
            { id: 'truck', text: 'The sacs burst at sundown and a truck takes the crates out to the drive.' },
            { id: 'roots', text: 'Feeder roots are laid in trenches under the paths, from the fountain outward.' },
          ],
          order: ['order', 'roots', 'crates', 'truck'],
          lines: [g('oracle', 'Ostrow has gone to radio for a forensics van. You have the scene until it gets here. Tracks, a crate, something in the grass by the water, and the park noticeboard on the band shell path.')],
          readyLines: [g('oracle', 'That is all four. I have put a board up on your display. Tell me the order and I will tell you who to be angry at.')],
          solvedLines: [
            g('oracle', 'Eight days of planning, and it starts with a forged Bruce Wayne on a parks form. Whoever did this wanted the park, and wanted your name on the door when it went wrong.'),
            g('alfred', 'I have compared it with the genuine article, sir. The forgery is rather neater than yours.'),
          ],
        },
        {
          id: 'n6HygieneFight', type: 'fight', fight: 'hygiene', text: 'Verdant Hygiene, the pest control firm that does not exist, has come back for its paperwork.',
          lines: [v('thorn', 'That is the notice. Take it down, burn it, and nobody mentions the signature.'), v('thorn', 'There is a man reading it.'), v('thorn', 'Then mention it to him very quietly.')],
          calls: [{
            id: 'signature', from: 'pryce', after: 9, timeout: 14, default: 'forged',
            lines: [v('pryce', 'Wayne! I am holding a closure order for the conservatory with your signature on it. I have a detective in my office holding a copy. Explain. Now.')],
            prompt: 'Councillor Pryce, about your signature',
            options: [
              { id: 'forged', tag: 'honest', text: 'It is forged. Have her compare it with the board minutes.', effects: { standing: 1, suspicion: { detective: 2 } }, lines: [v('pryce', 'Forged. Fine. Then somebody has your letterhead, Wayne, and you had better find out who.')] },
              { id: 'lawyer', tag: 'cover', text: 'Not a word without the Foundation\'s lawyers.', effects: { standing: -3, suspicion: { detective: -1 } }, lines: [v('pryce', 'Lawyers. You sound like the people you are supposed to be better than.')] },
              { id: 'joke', tag: 'act', text: 'I sign a great many things, Councillor. Usually cheques.', effects: { standing: -1, suspicion: { reporter: -2, detective: 3 } }, lines: [v('pryce', 'Is that wind? Are you outdoors? Where are you, Wayne?'), g('alfred', 'He is in the wine cellar, Councillor. It is very draughty.')] },
            ],
          }],
        },
        {
          id: 'n6Foreman', type: 'traverse', text: 'The foreman has the key ledger and is running for the truck. Cut him off before the drive.',
          gates: ['n6Dash1', 'n6Dash2', 'n6Ledger'], timer: 26, bonus: 6, vertical: 9,
          failTitle: 'HE IS AHEAD', failText: 'He doubled back through the trees. From the band shell path, again.',
          failLines: [g('oracle', 'He runs like a man who has read his own contract. Again, and cut the corner by the lake.')],
          lines: [g('oracle', 'One of them kept running, with a ledger under his arm. South east through the trees to the drive. He is fast. You have a cape.')],
        },
        {
          id: 'n6KeyLedger', type: 'collect', item: 'n6KeyLedger', site: 'n6Ledger', radius: 3, text: 'He dropped the ledger at the kerb. Take it.',
          lines: [v('thorn', 'Take it! Take the book! I only drive the truck! I mean I do not drive the truck! There is no truck!'), g('oracle', 'Key ledger. Conservatory keys signed out to Verdant Hygiene, countersigned from a holding company account. I have seen that account number before. Give me a minute. And there, on the drive: the truck there is not.')],
        },
      ]),
    },
    {
      id: 'm6Truck', title: 'The Seed Truck', checkpoint: 'n6Car', rewards: ['xp:250'],
      steps: [
        {
          id: 'n6Board', type: 'board', text: 'Get to the Batmobile on Lakeshore Drive.', site: 'n6Car', talk: 'over',
          lines: [g('alfred', 'The car is on the drive by the boathouse, sir. I had to move it twice. The hedges kept leaning on it.')],
        },
        {
          id: 'n6Chase', type: 'chase', text: 'Ram the seed truck three times before it leaves the drive.', site: 'n6Car',
          van: { type: 'garbage_truck', color: 0x2f5a3c, toast: 'Stop the seed truck. Ram it three times!', label: 'SEED TRUCK' },
          path: [{ x: 345, z: -600 }, { x: 345, z: -420 }, { x: 345, z: -260 }, { x: 345, z: -420 }],
          lines: [g('oracle', 'A green garbage truck doing fifty on Lakeshore Drive. I do not think it is collecting garbage.')],
        },
        { id: 'n6Twist', type: 'cutscene', scene: 'n6Twist' },
      ],
    },
    // [m67] Downstream: the truck was one of two ways out. The other is a barge at the museum marina.
    {
      id: 'm6Marina', title: 'Downstream', checkpoint: 'n6DriveCar', rewards: ['xp:200'],
      steps: quiet([
        {
          id: 'n6DriveBoard', type: 'board', text: 'Back in the Batmobile. The manifest lists a second shipment, south along the drive.', site: 'n6DriveCar', talk: 'over',
          lines: [
            g('oracle', 'The manifest has two columns. One truck, which you have just bent. And one barge, loading tonight at the museum campus marina, for every park downstream of the lake.'),
            g('oracle', 'She is not waiting for the barge either. Something is flying low over the south end of the drive and it is not birds.'),
          ],
        },
        {
          id: 'n6Sowers', type: 'battle', text: 'Sower drones are seeding Lakeshore Drive toward downtown. Shock cannon: bring all six down.', site: 'n6SowerSite', drones: 6,
          lines: [g('oracle', 'Six crop dusters the size of a bathtub, armed, laying seed down the median. Battle mode. Try to leave me some of the drive.')],
        },
        {
          id: 'n6ToMarina', text: 'South to the museum campus. Leave the car on the drive: the marina is behind the aquarium.', site: 'n6DriveSouth', radius: 16,
          nudge: g('oracle', 'Keep south on the drive, past the museum steps. The aquarium is the round one. Park and go over its roof.'),
          lines: [g('oracle', 'Drones down. The barge is still loading. Six of her people on the marina lawn, and they have a rifle with a scope, so do not walk in the front.')],
          banter: [
            g('alfred', 'The aquarium has a new exhibit on kelp forests, sir. I thought you might like to know there is one plant in this city minding its own business.'),
            v('dispatch', 'Lakeshore units: disregard the reports of a tank on the drive. Repeat, it is not a tank. It is being described as tank adjacent.'),
          ],
        },
        {
          id: 'n6MarinaRoom', type: 'fight', fight: 'marina', text: 'The seed barge is loading on the marina lawn. Six of them, a sniper by the water. Silently, from the aquarium roof.', tutorial: ['crouch', 'silent'],
          lines: [v('thorn', 'How many parks is this lot for?'), v('thorn', 'All of them. She said all of them, and then she laughed, and then a tulip laughed.')],
        },
        {
          id: 'n6BargeManifest', type: 'collect', item: 'n6BargeManifest', site: 'n6Barge', radius: 3, text: 'The barge\'s mooring line and its manifest, at the water\'s edge.',
          lines: [g('oracle', 'Cut the line and take the paperwork. That is every park from here to the river mouth that gets to stay a park.')],
        },
        {
          id: 'n6MarinaBoard', type: 'board', text: 'Back to the car on the drive. She is at the conservatory, north end of the park.', site: 'n6MarinaCar', talk: 'over',
          lines: [
            g('oracle', 'Nothing left to ship and nowhere left to ship it from. She will know by now. She is at the conservatory with everyone she took.'),
            g('alfred', 'The whole length of the drive, sir, northbound. I believe the phrase is "foot down". The car is where you left it and, for once, so are the hedges.'),
          ],
        },
      ]),
    },
    {
      id: 'm6Conservatory', title: 'Glass House', checkpoint: 'n6ConsRoof', rewards: ['xp:200'],
      steps: [
        {
          id: 'n6ToRoof', text: 'She is in the conservatory. Up onto its glass roof.', site: 'n6ConsRoof', radius: 8,
          nudge: g('oracle', 'North end of the park. Twenty-six metres of glass and iron. Grapple the ribs.'),
          lines: [g('oracle', 'The conservatory roof gives you the whole lawn. She is out front with the people she took. Count them before you go in.')],
          banter: [g('alfred', 'If it helps, sir, your guests had a lovely time. Two of them are now engaged. One of them to the ice sculpture.')],
        },
        {
          id: 'n6Count', type: 'scan', text: 'Detective vision from the roof: count her thralls and find her root nodes.', points: [{ site: 'n6ConsRoof' }], hold: 1.6,
          lines: [g('oracle', 'Twelve people on the lawn, three root nodes glowing around her. Cut the nodes, wake the people, do not hurt anyone. That is the job.')],
        },
      ],
    },
    {
      id: 'm6Ivy', title: 'Poison Ivy', checkpoint: 'n6ConsDoor', rewards: ['xp:500', 'lore:ivyFile'],
      steps: [
        { id: 'n6Boss', type: 'boss', boss: 'ivy', text: 'Cut her root nodes, free her thralls with stuns, strike while she is open.', checkpoint: 'n6ConsDoor', villain: 'poisonIvy',
          lines: [g('oracle', 'Stand on a node to cut it. Cape the sleepwalkers. And Batman: she wants you to lose your temper. Do not.')] },
      ],
    },
    {
      id: 'm6Reprise', title: 'Home Invasion', checkpoint: 'n6Gates', rewards: ['suit:gardener', 'xp:200'],
      steps: [
        {
          id: 'n6Home', text: 'The last of her cuttings went to Bristol. Back to the Manor gates.', site: 'n6Gates', radius: 16,
          lines: [g('alfred', 'Sir, the vines are at the gates. I have the garden hose and an attitude. I would welcome company.')],
          banter: [g('oracle', 'For the record, a man was just arrested on the Mile for telling a tree to stop following him. The tree has been released without charge.')],
        },
        {
          id: 'n6IfLeft', type: 'life', test: 'choice:n6.party=batman', text: 'The Manor gates.',
          yesLines: [g('alfred', 'Some of your guests wandered into the garden while you were away, sir. They are not themselves.')],
          noLines: [g('alfred', 'Your guests are safe indoors, sir. You saw to that. It is only the vines.')],
          branches: { yes: 'n6ManorVines', no: 'n6ManorQuiet' },
        },
        { id: 'n6ManorVines', type: 'fight', fight: 'manorVines', text: 'Your own guests, spore-dazed, and her last thorns. Clear the gates.', next: 'n6Orchids',
          lines: [v('guest', 'Lovely party, Mr. Wayne. Lovely... vines...'), g('batman', 'Go home, Councillor.')] },
        { id: 'n6ManorQuiet', type: 'fight', fight: 'manorQuiet', text: 'Her last thorns at the gates.', lines: [v('thorn', 'Big house. Big garden. Big bat. Oh no.')] },
        {
          id: 'n6Orchids', type: 'collect', item: 'n6Orchids', site: 'n6GardenEnd', radius: 3, text: 'Check the orchids in the greenhouse.',
          lines: [g('alfred', 'All forty-one of them. Untouched. Your mother would have liked her, sir. Up to a point.')],
        },
        {
          id: 'n6End', type: 'nightEnd', scene: 'n6End', text: 'The park is quiet. The Manor is overgrown.',
          lines: [g('oracle', 'Sionis paid her too. Retainer, not a fee: he wanted Bruce Wayne at home and distracted. He knows who you are seen with, at least.'), g('alfred', 'Then tomorrow you will be seen with a great many people. The Planetarium gala. Do try to stay for the speeches.')],
        },
      ],
    },
  ],
};
