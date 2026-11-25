// Night Eight, "Hostile Takeover" (Act V, Arkham). The man who paid for the fear, the frost, the
// garden and the fire has spent four nights studying Batman, and tonight he puts it to use. The
// night opens with an emergency board vote at Wayne Tower and False Faces setting a Chinatown block
// alight at the same hour. Then Wolf Point: a gauntlet that switches Batman's tools off one at a
// time (detective vision in the dark of the parking floor, gadgets against shields and snipers on
// the fork, the grapple on the climb), a duel on the roof that is pure combat, and a second choice
// as the night ends: give Detective Ostrow the statement she asked for, or answer the alarm on
// the Arkham causeway. New role this night: the lieutenant (take him out first). Format:
// docs/design/story-format.md.
import { g, v, B, face, recap } from './common.js';
import { W, route } from '../rooms.js';
// [missions] Four more missions (docs/design/briefs/missions-round.md), each paying off a thread
// from Nights Two to Seven:
//   m8Paper    the money leaves Chinatown by barge: a detective case down the South Branch quay to
//              the harbour locks (clues, a deduction with a wrong answer that costs, a predator
//              room, the lock worked in the right order) and Garrick Stone's name on the case
//   m8Routes   Black Mask hands the GCPD the route map he bought from the Riddler: a police level to
//              lose (Night Three's `evade` step, on purpose: the same map), the cranes nobody numbered, his spotters, and Detective
//              Ostrow, who has finally looked up
//   m8Laundry  Blackgate before the duel: the bought shift at the gate with the grapple cut by the
//              wall emitters, the honest shift locked in the blocks on a clock, the Penguin in Cell 1
//   m8Copies   the file was copied: a laundry truck over the causeway, its drone escort on the
//              docks road, and two copies already delivered (one to Ostrow, one to Arkham)

const SITES = {
  n8Lobby: { x: 0, y: 0, z: -433 },
  n8Stone: { x: 6, y: 0, z: -428 },
  n8LuciusAt: { x: -6, y: 0, z: -428 },
  n8Gate: { x: -332, y: 0, z: -150 },
  n8GateRoof: { x: -332, y: 11.6, z: -150 },
  n8Market: { x: -415, y: 0, z: -120 },
  n8Temple: { x: -415, y: 0.15, z: -172 },
  n8Mahjong: { x: -321, y: 0.15, z: -110 },
  n8Domes: { x: -490, y: 13, z: -182 },
  n8Bath: { x: -490, y: 0.15, z: -104 },
  n8Base: { x: -320, y: 0.15, z: -285 },
  n8BaseEntry: { x: -345, y: 0.15, z: -255 },
  n8Fork: { x: -283, y: 0, z: -298 },
  n8Walk: { x: -269, y: -4.5, z: -200 },
  n8Roof: { x: -334, y: 52, z: -277 },
  n8Dock: { x: 196, y: 1, z: 380 },
  n8MaskArena: { x: 165, y: 2.2, z: 385 },
  n8MaskStart: { x: 165, y: 2.2, z: 378 },
  n8YardIn: { x: 172, y: 2.2, z: 390 },
  n8Gcpd: { x: 0, y: 0, z: 26 },
  n8Causeway: { x: 372, y: 0.5, z: -80 },
  // [missions] every point below was checked against the live collision (scripts/site-probe.mjs)
  n8BargeAt: { x: -277.5, y: -3.3, z: 70 }, // the moored barge: between its deck (-4.6) and the crate tops (-2)
  n8LockApproach: { x: -261, y: 0, z: 152 },
  n8LockYard: { x: -224, y: 0, z: 180 },
  n8LockPerch: { x: -248, y: 17.1, z: 175 },
  n8SluiceGate: { x: -284, y: 0, z: 200 },
  n8SluiceDrain: { x: -270, y: 0, z: 200 },
  n8SluiceWinch: { x: -262, y: 0, z: 188 },
  n8WestBank: { x: -314, y: 0, z: 168 },
  n8CaseAt: { x: -294, y: 0, z: 200 },
  n8NestAt: { x: -261, y: 0, z: -120 },
  n8NestCam: { x: -261, y: 0, z: -130 },
  n8NestMap: { x: -261, y: 0, z: -108 },
  n8OstrowAt: { x: -261, y: 0, z: -100 },
  n8NorthWalk: { x: 184, y: 2.2, z: 344 },
  n8GateYard: { x: 146, y: 2.2, z: 343 },
  n8WallTop: { x: 150, y: 10.2, z: 352 },
  n8KeysAt: { x: 112, y: 2.2, z: 343 },
  n8DoorA: { x: 142, y: 2.2, z: 376 },
  n8DoorB: { x: 142, y: 2.2, z: 386 },
  n8CarGate: { x: 104, y: 2.2, z: 343, yaw: -Math.PI / 2 },
  n8DocksRoad: { x: 90, y: 0, z: 148 },
};

const ROOMS = {
  baseRoom: {
    id: 'baseRoom', site: 'n8Base', entry: 'n8BaseEntry', radius: 22, gang: 'blackMask',
    lights: [{ x: -326, y: 3.5, z: -278, r: 5, post: true }, { x: -312, y: 3.5, z: -292, r: 4, post: true }],
    cover: [{ x: -322, y: 0.15, z: -280, w: 3, d: 1.4, h: 1.6 }, { x: -314, y: 0.15, z: -286, w: 1.4, d: 3, h: 1.6 }, { x: -328, y: 0.15, z: -292, w: 2, d: 2, h: 1.5 }, { x: -318, y: 0.15, z: -276, w: 2.4, d: 1.2, h: 1.5 }],
    huddle: { x: -320, y: 0.15, z: -285 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-332, 0.15, -280, 2, Math.PI / 2), W(-308, 0.15, -280, 2, -Math.PI / 2)) },
      { type: 'lieutenant', route: route('pingpong', W(-320, 0.15, -296, 3, 0), W(-320, 0.15, -274, 3, Math.PI)) },
      { type: 'ninja', route: route('loop', W(-328, 0.15, -276), W(-312, 0.15, -276, 1.5, 0), W(-312, 0.15, -294), W(-328, 0.15, -294, 1.5, Math.PI)) },
      { type: 'sniper', route: route('pingpong', W(-306, 0.15, -290, 3, -Math.PI / 2), W(-306, 0.15, -278, 3, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(-334, 0.15, -290, 2.5, Math.PI / 2), W(-334, 0.15, -282, 2.5, Math.PI / 2)) },
    ],
  },
  // [missions] The harbour locks: the apron east of the lock keeper's house. Two squads on the same
  // ground: the one that was not expecting anybody, and the one a wrong guess warns. `fill` is a
  // broad soft light from the shared light pool so the room reads on a wet night (rooms.js).
  lockRoom: {
    id: 'lockRoom', site: 'n8LockYard', entry: 'n8LockPerch', radius: 32, gang: 'blackMask',
    lights: [{ x: -232, y: 3.5, z: 168, r: 5, post: true }, { x: -214, y: 3.5, z: 192, r: 5, post: true }, { x: -246, y: 3.5, z: 196, r: 4, post: true }],
    fill: [{ x: -224, y: 9, z: 180, color: 0xffd9a0 }],
    cover: [{ x: -226, y: 0, z: 176, w: 3, d: 1.4, h: 1.6 }, { x: -216, y: 0, z: 184, w: 1.4, d: 3, h: 1.6 }, { x: -230, y: 0, z: 194, w: 2, d: 2, h: 1.5 }, { x: -212, y: 0, z: 166, w: 2.4, d: 1.2, h: 1.5 }, { x: -244, y: 0, z: 198, w: 2, d: 1.4, h: 1.5 }],
    huddle: { x: -224, y: 0, z: 180 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-234, 0, 162, 2, 0), W(-234, 0, 198, 2, Math.PI)) },
      { type: 'lieutenant', route: route('pingpong', W(-220, 0, 172, 3, Math.PI / 2), W(-220, 0, 196, 3, -Math.PI / 2)) },
      { type: 'knife', route: route('loop', W(-230, 0, 188), W(-210, 0, 188, 1.5, 0), W(-210, 0, 170), W(-230, 0, 170, 1.5, Math.PI)) },
      { type: 'rifle', route: route('pingpong', W(-248, 0, 194, 3, Math.PI / 2), W(-240, 0, 200, 3, Math.PI / 2)) },
      { type: 'sniper', route: route('pingpong', W(-208, 0, 150, 3, 0), W(-208, 0, 160, 3, 0)) },
    ],
  },
  lockRoomAlert: {
    id: 'lockRoomAlert', site: 'n8LockYard', entry: 'n8LockPerch', radius: 32, gang: 'blackMask',
    lights: [{ x: -232, y: 3.5, z: 168, r: 6 }, { x: -214, y: 3.5, z: 192, r: 6 }, { x: -246, y: 3.5, z: 196, r: 5 }, { x: -222, y: 3.5, z: 152, r: 5, post: true }],
    fill: [], cover: [],
    huddle: { x: -224, y: 0, z: 180 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-234, 0, 162, 1.5, 0), W(-234, 0, 198, 1.5, Math.PI)) },
      { type: 'lieutenant', route: route('pingpong', W(-220, 0, 172, 2, Math.PI / 2), W(-220, 0, 196, 2, -Math.PI / 2)) },
      { type: 'knife', route: route('loop', W(-230, 0, 188), W(-210, 0, 188, 1, 0), W(-210, 0, 170), W(-230, 0, 170, 1, Math.PI)) },
      { type: 'rifle', route: route('pingpong', W(-248, 0, 194, 2, Math.PI / 2), W(-240, 0, 200, 2, Math.PI / 2)) },
      { type: 'sniper', route: route('pingpong', W(-208, 0, 150, 2, 0), W(-208, 0, 160, 2, 0)) },
      { type: 'ninja', route: route('loop', W(-236, 0, 148), W(-214, 0, 148, 1, 0), W(-214, 0, 200), W(-236, 0, 200, 1, Math.PI)) },
      { type: 'sniper', route: route('pingpong', W(-246, 0, 192, 2.5, Math.PI / 2), W(-246, 0, 200, 2.5, Math.PI / 2)) },
    ],
  },
  // His spotters under the north crane: the quay street, the river walk below it, the bridge street.
  nestRoom: {
    id: 'nestRoom', site: 'n8NestAt', entry: 'quayCraneNorth', radius: 30, gang: 'blackMask',
    lights: [{ x: -261, y: 3.5, z: -134, r: 4, post: true }, { x: -261, y: 3.5, z: -104, r: 4, post: true }],
    fill: [{ x: -261, y: 8, z: -120, color: 0xffd9a0, pool: 3.5 }],
    cover: [{ x: -263, y: 0, z: -128, w: 1.4, d: 2.4, h: 1.5 }, { x: -259.5, y: 0, z: -110, w: 1.4, d: 2.4, h: 1.5 }, { x: -262, y: 0, z: -98, w: 2, d: 1.4, h: 1.5 }],
    huddle: { x: -261, y: 0, z: -120 },
    squad: [
      { type: 'sniper', route: route('pingpong', W(-261, 0, -140, 3, 0), W(-261, 0, -132, 3, 0)) },
      { type: 'pistol', route: route('pingpong', W(-260, 0, -126, 2, 0), W(-260, 0, -102, 2, Math.PI)) },
      { type: 'lieutenant', route: route('pingpong', W(-263, 0, -112, 3, Math.PI / 2), W(-263, 0, -100, 3, Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(-270, -4.5, -136, 2.5, 0), W(-270, -4.5, -104, 2.5, Math.PI)) },
      { type: 'knife', route: route('loop', W(-250, 0, -150), W(-262, 0, -150, 1.5, 0), W(-262, 0, -145), W(-250, 0, -145, 1.5, Math.PI)) },
    ],
  },
  // Blackgate, outside the north wall: the gate plaza and the walk, laundry trucks being loaded.
  gateRoom: {
    id: 'gateRoom', site: 'n8GateYard', entry: 'n8WallTop', radius: 36, gang: 'blackMask',
    lights: [{ x: 126, y: 5.7, z: 340, r: 5, post: true, base: 2.2 }, { x: 150, y: 5.7, z: 347, r: 5, post: true, base: 2.2 }, { x: 172, y: 5.7, z: 340, r: 4, post: true, base: 2.2 }],
    fill: [{ x: 146, y: 11, z: 342, color: 0xdfe8ff, pool: 7.5 }, { x: 122, y: 11, z: 342, color: 0xdfe8ff, pool: 7.5, reach: 16 }, { x: 170, y: 11, z: 342, color: 0xdfe8ff, pool: 7.5, reach: 16 }],
    cover: [{ x: 138, y: 2.2, z: 341, w: 3, d: 1.4, h: 1.6 }, { x: 156, y: 2.2, z: 346, w: 1.4, d: 3, h: 1.6 }, { x: 166, y: 2.2, z: 340, w: 2, d: 2, h: 1.5 }, { x: 118, y: 2.2, z: 340, w: 2.4, d: 1.2, h: 1.5 }, { x: 146, y: 2.2, z: 348, w: 2, d: 1.4, h: 1.5 }],
    huddle: { x: 146, y: 2.2, z: 343 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(122, 2.2, 339, 2, Math.PI / 2), W(170, 2.2, 339, 2, -Math.PI / 2)) },
      { type: 'lieutenant', route: route('pingpong', W(136, 2.2, 348, 3, 0), W(160, 2.2, 348, 3, 0)) },
      { type: 'baton', route: route('loop', W(112, 2.2, 340), W(112, 2.2, 347, 1.5, 0), W(126, 2.2, 347), W(126, 2.2, 340, 1.5, Math.PI)) },
      { type: 'sniper', route: route('pingpong', W(184, 2.2, 340, 3, -Math.PI / 2), W(184, 2.2, 348, 3, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(144, 2.2, 340, 2.5, Math.PI), W(152, 2.2, 340, 2.5, Math.PI)) },
      { type: 'knife', route: route('pingpong', W(164, 2.2, 345, 2, Math.PI / 2), W(176, 2.2, 345, 2, -Math.PI / 2)) },
    ],
  },
};

// [missions] Fill light for the new open-air fights (src/story/rooms.js `night.lit`): no set piece
// added in this round is left to a single dim lamp.
const LIT = [
  { id: 'n8LitBank', fill: [{ x: -314, y: 9, z: 168, ground: 0, color: 0xffd9a0, pool: 12 }] },
  { id: 'n8LitYard', fill: [{ x: 165, y: 11, z: 381, ground: 2.2, color: 0xdfe8ff, pool: 6.5, reach: 18 }] },
];

const FIGHTS = {
  // [missions]
  lock: { stealth: 'lockRoom' },
  lockAlert: { stealth: 'lockRoomAlert' },
  bargeCrew: { site: 'n8WestBank', radius: 13, gang: 'blackMask', act: 5, district: 'yards', waves: [{ budget: 9, ring: 7, lead: 'shield' }, { budget: 11, ring: 8, lead: 'heavy' }] },
  nest: { stealth: 'nestRoom' },
  gateShift: { stealth: 'gateRoom' },
  riot: { site: 'n8MaskArena', radius: 11, gang: 'blackMask', act: 5, district: 'blackgate', waves: [{ budget: 9, ring: 5, lead: 'shield' }, { budget: 10, ring: 5.5, lead: 'baton' }] },
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n8Collectors: { site: 'n8Mahjong', radius: 12, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 8, ring: 4.5 }] },
  gateFire: { site: 'n8Gate', radius: 15, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 7, ring: 7, lead: 'lieutenant' }, { budget: 10, ring: 8, lead: 'heavy' }] },
  gateBurnt: { site: 'n8Gate', radius: 15, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 6, ring: 7, lead: 'lieutenant' }, { budget: 9, ring: 8, lead: 'heavy' }, { budget: 9, ring: 8, lead: 'medic' }] },
  market: { site: 'n8Market', radius: 13, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 8, ring: 7, lead: 'knife' }] },
  base: { stealth: 'baseRoom' },
  fork: { site: 'n8Fork', radius: 15, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 9, ring: 8, lead: 'shield' }, { budget: 10, ring: 9, lead: 'sniper' }] },
  walk: { site: 'n8Walk', radius: 13, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 9, ring: 7, lead: 'rifle' }, { budget: 11, ring: 8, lead: 'baton' }] },
  bath: { site: 'n8Bath', radius: 11, gang: 'blackMask', act: 4, district: 'chinatown', waves: [{ budget: 4, ring: 5 }] },
};

const SCENES = {
  n8Recap: (stage) => recap(stage, {
    title: 'Paper, burning',
    panels: [
      'Firefly burned every Sionis filing in Lower Gotham. Black Mask was erasing his trail.',
      { shot: { cam: [355, 6, -320], look: [345, 0.5, -332] }, caption: 'Lakeshore Drive is still frozen in the shape of the car.' },
      { shot: { cam: [-300, 70, -230], look: [-334, 58, -270] }, caption: 'Tonight, Wolf Point. He has been waiting.' },
    ],
  }),
  n8File: (stage) => [{
    layout: 'trio',
    panels: [
      { img: face('blackMask', 'SUBJECT: THE BAT', 'file 1 of 1'), caption: 'Routes, numbered. Gadgets, sketched. Fight tapes from the Iceberg, the Stack, the plant, the park.' },
      { img: stage.shot({ cam: [-310, 4, -270], look: [-320, 1, -285], hero: { at: [-318, 0.15, -283], yaw: 0.4, anim: 'Interact' } }), caption: 'Every villain this month was a test. He paid for the tests.', captionPos: 'bottom' },
      { img: face('blackMask', 'BLACK MASK'), balloons: [B('Let us see what you are without the toys, Batman. I have read the manual. I wrote the manual.', 50, 6, { w: 84 })] },
    ],
  }],
  maskIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [176, 8, 396], look: [165, 3, 383], hero: { at: [168, 2.2, 390], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The Blackgate yard, in the rain. He bought the floodlights too.' },
      { img: face('blackMask', 'BLACK MASK'), balloons: [B('You switched them back on, I see. The vision, the toys, the rope. They will not help you here. Shall we?', 50, 6, { w: 82 })] },
    ],
  }],
  maskOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: face('blackMask', 'ACCOUNT CLOSED'), balloons: [B('You think this is over? You are the one in a mask. I am just the one who admits it.', 50, 6, { w: 80 })] },
      { img: stage.shot({ cam: [178, 7, 395], look: [165, 2.5, 384] }), caption: 'The guards he paid lock him in his own cell. The file goes in an evidence bag. Some of it does not.', captionPos: 'bottom' },
    ],
  }],
  n8Breakout: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [560, 30, -40], look: [622, 20, -80] }), caption: 'Arkham Island. Every light on at once.' },
      { img: face('joker', 'A LETTER', 'hand delivered, by a clown'), balloons: [B('Dear Bats. Your new friend paid for my door. So kind! See you at the pier. Bring a date. Love, you know who.', 50, 6, { w: 86 })] },
    ],
  }],
};

const NIGHT = {
  id: 'n8', act: 'act5', number: 8, actNumber: 5,
  title: 'Night Eight: Hostile Takeover',
  blurb: 'The man who paid for every villain this month has a file on Batman, and tonight he switches the tools off one by one.',
  villain: 'blackMask', gang: 'blackMask',
  districts: ['chinatown'],
  timeOfDay: 22.5, weather: 'rain',
  start: 'n8Lobby',
  day: {
    hook: 'day.n8',
    context: { day: 8, appointments: [{ id: 'emergencyVote', at: 22, place: 'wayneTowerLobby', title: 'Emergency board vote: the Wolf Point debt' }], lead: 'Garrick Stone wants the board to sell Wolf Point debt to a buyer nobody has met.' },
    fallback: [
      g('alfred', 'Mr. Stone has called an emergency vote. At ten at night. On the Wolf Point debt. I find that a very specific time to want people tired.'),
      g('alfred', 'Miss Quell telephoned. She said, and I quote, "tell him the candles were lovely." I do not believe she meant it kindly.'),
    ],
  },
  sites: SITES,
  rooms: ROOMS,
  lit: LIT,
  fights: FIGHTS,
  scenes: SCENES,
  overheard: [
    [['goonA', 'Mr. Sionis says we are a family.'], ['goonB', 'He docked my pay for smiling.'], ['goonA', 'Families are complicated.']],
    [['goonA', 'Why the masks?'], ['goonB', 'Corporate identity.'], ['goonA', 'I can not see out of mine.'], ['goonB', 'That is the identity.']],
    [['goonA', 'He read us the Bat file at the team meeting.'], ['goonB', 'And?'], ['goonA', 'Forty pages. Page one says "run." I skipped to the end. It also says "run."']],
  ],
  missions: [
    {
      id: 'm8Vote', title: 'Ten O\'Clock Vote', checkpoint: 'n8Lobby', rewards: ['xp:100'],
      steps: [
        { id: 'n8Recap', type: 'cutscene', scene: 'n8Recap' },
        {
          id: 'n8Choice', type: 'dilemma', key: 'n8.vote', text: 'The board votes at ten (gold, Wayne Tower). False Faces are torching a Chinatown block at the same hour.',
          title: { text: 'ACT FIVE: ARKHAM', sub: 'Night Eight: Hostile Takeover' }, heading: 'TEN O\'CLOCK', timer: 45,
          card: 'Vote as Bruce at Wayne Tower (gold) and the debt sale fails, but Chinatown burns longer. Go to Chinatown as Batman and the board sells Wolf Point the money it needs.',
          bruce: { site: 'n8Lobby', radius: 8, label: 'Bruce at the vote', lines: [g('alfred', 'Wayne Tower, then. Chinatown will have to hold. I am sorry, sir. There was no right answer.')],
            miss: { effects: { standing: -6, threads: { lucius: -0.5 } }, lines: [v('lucius', 'They sold it, Bruce. Stone had the votes the moment your chair was empty. Wolf Point has money tonight.')] } },
          batman: { site: 'n8Gate', radius: 14, label: 'Batman in Chinatown', lines: [g('batman', 'Lucius. Vote my shares. Against.'), v('lucius', 'I can not vote your shares, Bruce. That is rather the point of shares.')],
            miss: { effects: { city: -6 }, lines: [g('gordon', 'Chinatown, the block by the gate. It burned for an hour. Everyone got out. Nobody got out with anything.')] } },
          both: { effects: { standing: 2, city: 2 }, lines: [g('alfred', 'A vote won and a block saved. I shall have the good china out.')] },
          branches: { bruce: 'n8Vote', batman: 'n8GateFight', both: 'n8GateFight' },
        },
        {
          id: 'n8Vote', type: 'civvy', outfit: 'suit', text: 'The board room. Vote against the sale.', next: 'n8GateLate',
          card: 'Bruce Wayne, late, in a suit with damp shoulders. Garrick Stone has the floor.',
          beats: [
            { id: 'stone', site: 'n8Stone', text: 'Garrick Stone is mid-speech.', lines: [v('stone', 'And so the motion: we sell the Wolf Point debt tonight, to a buyer who has asked for discretion. All in favour.')],
              choice: { key: 'n8.stone', prompt: 'The board is about to vote', default: 'question', options: [
                { id: 'question', tag: 'sharp', text: 'Who is the buyer, Garrick? Say the name out loud.', effects: { standing: 3, suspicion: { villain: 4 } }, lines: [v('stone', 'That is... confidential.'), v('lucius', 'Then it is a no from me. And, I suspect, from Bruce.')] },
                { id: 'playboy', tag: 'act', text: 'Sorry, is this the vote about the yacht?', effects: { standing: -2, suspicion: { reporter: -3 } }, lines: [v('stone', 'No, Bruce. It is not about the yacht.'), v('lucius', 'He is voting no. He just does not know it yet.')] },
              ] } },
            { id: 'lucius', site: 'n8LuciusAt', text: 'Lucius, by the window.', lines: [v('lucius', 'Motion fails. You looked tired in there, Bruce. You look tired everywhere. Go home.'), g('bruce', 'Not yet.')] },
          ],
        },
        {
          id: 'n8GateLate', type: 'fight', fight: 'gateBurnt', text: 'Chinatown burned while you voted. False Faces are looting the gate. Stop them.', next: 'n8Market',
          tip: { title: 'NEW: THE LIEUTENANT', text: 'He steadies the squad and calls in backup. Take him out first, or the fight never ends.' },
          lines: [g('gordon', 'Late. It is out now, the fire. The looting is not.')],
        },
        {
          id: 'n8GateFight', type: 'fight', fight: 'gateFire', text: 'False Faces at the Chinatown gate. The lieutenant first.',
          tip: { title: 'NEW: THE LIEUTENANT', text: 'He steadies the squad and calls in backup. Take him out first, or the fight never ends.' },
          lines: [v('falseFace', 'The boss said you would come here. The boss is always right.'), v('falseFace', 'The boss said he would come HERE?')],
        },
      ],
    },
    {
      id: 'm8Market', title: 'Night Market', checkpoint: 'n8Gate', rewards: ['xp:200'],
      steps: [
        {
          id: 'n8Market', type: 'fight', fight: 'market', text: 'The night market. His knife men are shaking down the stalls.',
          lines: [v('falseFace', 'Protection fee! Protection from us!'), v('stallholder', 'You are the only thing I need protecting from!')],
          interrupts: [{ id: 'n8Bath', at: 'n8Bath', radius: 22, fight: 'bath', xp: 80, label: 'Optional: the bathhouse is clear', lines: [v('dispatch', 'Units in Odessa: masked men in the bathhouse, refusing to leave the sauna.')] }],
        },
        {
          id: 'n8Ledger', type: 'scan', text: 'Detective vision while you still have it: where is the money going?',
          points: [
            { site: 'n8Temple', lines: [g('oracle', 'Envelopes in the temple donation box. Same folding, same seal. That is a collection route.')] },
            { site: 'n8Mahjong', lines: [g('oracle', 'The mahjong parlour is a counting room. Tonight\'s take went to Wolf Point an hour ago.')] },
            { site: 'n8GateRoof', lines: [g('oracle', 'And from up here you can see it: the tower lit top to bottom. He knows you are coming. He is holding the door.')] },
          ],
          optional: [{ id: 'n8Domes', title: 'Optional: the Odessa church domes', site: 'n8Domes', radius: 6, xp: 60, done: 'From the domes: a False Face lookout, asleep on the job with a thermos.', lines: [v('falseFace', 'Five more minutes, mum.')] }],
        },
      ],
    },
    // [missions] ------------------------------------------------------------ Paper Trail
    {
      id: 'm8Paper', title: 'Paper Trail', checkpoint: 'quayDock', rewards: ['xp:300'],
      steps: [
        {
          id: 'n8ToQuay', text: 'The take left Chinatown by water. Down to the dock on the South Branch quay.', site: 'quayDock', radius: 10,
          lines: [g('oracle', 'The counting room is empty because the money sails. One barge an hour off the Chinatown dock, and the last one left forty minutes ago.'), g('batman', 'Then it has not got far. Barges do not hurry.')],
          banter: [g('alfred', 'A river of money, sir, and for once it is not a figure of speech.')],
          nudge: g('oracle', 'East of the gate, over the bridge: the quay runs along the river, cranes all down it. The dock is under the north one.'),
          // Bruce's telephone does not know what Batman is doing: the board calls on the quay.
          calls: [{
            id: 'stoneOffer', from: 'board', after: 8, timeout: 13, default: 'hang',
            lines: [v('stone', 'Bruce? Garrick. Whatever happened in that room tonight, my buyer is still interested. He asked me to ask you, privately, what your number is.')],
            prompt: 'Garrick Stone, on Bruce Wayne\'s telephone',
            options: [
              { id: 'listen', tag: 'play along', text: '"Everybody has a number, Garrick. Who is asking?"', effects: { suspicion: { villain: 3 }, flags: { 'lead.Stone carries offers for the Wolf Point buyer': true } }, lines: [v('stone', 'A friend. A generous one. He says he will meet you whenever you are done with whatever it is you do at night.'), g('alfred', 'I did not care for the end of that sentence, sir.')] },
              { id: 'no', tag: 'no', text: '"My number is no. Goodnight."', effects: { standing: 1 }, lines: [v('stone', 'Everyone says that the first time, Bruce.')] },
              { id: 'hang', tag: 'later', text: 'Let it ring. You are standing on a dock.', effects: { standing: -1 }, lines: [g('alfred', 'Mr. Stone left a message. It was mostly a number, with a great many noughts.')] },
            ],
          }],
        },
        {
          id: 'n8Barges', type: 'scan', text: 'Detective vision on the quay: the mooring, the crane, the barge that stayed behind.',
          points: [
            { site: 'quayDock', lines: [g('oracle', 'Wet rope on a dry bollard. A barge cast off here within the hour, riding low. Whatever it carries is heavy.')] },
            { site: 'quayCraneNorth', lines: [g('oracle', 'The crane log. One pallet lowered at nine forty, and the operator wrote which way the barge went: with the current. The current runs south.')] },
            { site: 'n8BargeAt', lines: [g('oracle', 'Cash crates on the spare barge, empty. The bands on the floor are from a payroll account. A Wayne Enterprises payroll account.'), g('alfred', 'I shall pretend I did not hear that until you have finished hitting people, sir.')] },
          ],
          optional: [{ id: 'n8MidCrane', title: 'Optional: the middle crane, for the view', site: 'quayCraneMid', radius: 6, xp: 60, done: 'From the middle crane: the whole South Branch, the Yards dark on one bank, the old city lit on the other.', lines: [g('alfred', 'A fine view, sir. One sees why the criminal classes prefer the waterfront.')] }],
        },
        {
          id: 'n8Deduce', type: 'fork', text: 'Where does a heavy barge stop? The harbour locks, south, with the current. Or the south crane, where he would expect you to look.', radius: 9,
          lines: [g('oracle', 'Two places it could have put in. The south crane can lift a pallet off a deck. The locks at the harbour mouth are the one place every barge has to stop.'), g('batman', 'With the current. Riding low.')],
          options: [
            { id: 'locks', site: 'n8LockApproach', radius: 9, lines: [g('oracle', 'The locks. The lock keeper has company, and none of it is expecting you.')] },
            { id: 'crane', site: 'quayCraneSouth', radius: 7, lines: [g('oracle', 'Nothing on the south crane but a telephone, taped to the rail. It is ringing.')] },
          ],
          branches: { locks: 'n8Lock', crane: 'n8Decoy' },
        },
        {
          id: 'n8Decoy', type: 'wait', seconds: 7, text: 'A telephone, taped to the crane. The barge was never here.', next: 'n8LockAlert',
          lines: [v('black mask', 'Page six of your file, Batman. "Always checks the high ground first." I left you some high ground.'), v('black mask', 'The locks, by the way. I have told them you are coming.')],
        },
        {
          id: 'n8LockAlert', type: 'fight', fight: 'lockAlert', text: 'The harbour locks. They know you are coming: seven of them, every lamp turned outward. Quietly anyway.', next: 'n8Sluice', tutorial: ['crouch', 'silent'],
          lines: [g('oracle', 'Seven at the locks now, and they have turned the lamps round. He warned them. Take your time.')],
        },
        {
          id: 'n8Lock', type: 'fight', fight: 'lock', text: 'The harbour locks. Five of them round the lock keeper\'s house, a lieutenant among them. Quietly.', tutorial: ['crouch', 'silent'],
          lines: [v('falseFace', 'How long does a lock take?'), v('falseFace', 'Depends how much you pay the lock.')],
        },
        {
          id: 'n8Sluice', type: 'puzzle', text: 'The barge is in the lock chamber. Strand it: work the lock in the keeper\'s order.',
          riddleTitle: 'THE KEEPER\'S NOTICE',
          riddle: 'Painted on the wall, half rubbed out: "Never touch the WINCH until the water is out. The water will not leave by the SLUICE while the far GATE stands open." (Gate, sluice, winch.)',
          plates: [{ id: 'gate', site: 'n8SluiceGate', label: 'GATE' }, { id: 'sluice', site: 'n8SluiceDrain', label: 'SLUICE' }, { id: 'winch', site: 'n8SluiceWinch', label: 'WINCH' }],
          order: ['gate', 'sluice', 'winch'], timer: 75, wrongCost: 10, penalty: { budget: 3, gang: 'blackMask', site: 'n8SluiceWinch' },
          wrongLines: [v('lock keeper', 'Not that one! Forty years I have kept this lock, and nobody reads the notice.'), v('lock keeper', 'You will have the whole river in the street. Read the notice!')],
          failLines: [g('oracle', 'The chamber filled and the barge is through. It will have to come back round. So will you.')],
          lines: [v('lock keeper', 'I am tied to a chair and I am still the only one here who knows how the lock works. The notice. On the wall.')],
        },
        {
          id: 'n8BargeCrew', type: 'fight', fight: 'bargeCrew', text: 'The barge is aground and its crew is coming ashore on the Yards bank. Shields in front, armour behind.',
          lines: [v('falseFace', 'He drained the lock!'), v('falseFace', 'Can he do that?'), v('falseFace', 'He just did it, Kevin.')],
        },
        {
          id: 'n8Case', type: 'collect', item: 'n8Case', site: 'n8CaseAt', radius: 3, text: 'A case, chained to the lock rail. Take it.',
          lines: [g('oracle', 'The bagman chained his case to the rail and ran. People who run from you leave the most interesting luggage.')],
        },
        {
          id: 'n8StoneName', type: 'wait', seconds: 7, text: 'Bearer bonds, payroll bands, and a chauffeur\'s pass.',
          lines: [g('oracle', 'Bearer bonds in bank bands from the Wayne payroll account. And a pass for the Wayne Tower garage, level B2. The bagman is a chauffeur. He drives for Garrick Stone.'), g('batman', 'Stone was never selling the Wolf Point debt to a stranger.'), g('oracle', 'No. He was selling it to the man who already pays him.')],
        },
        {
          id: 'n8StoneVote', type: 'life', test: 'choice:n8.vote=bruce',
          yesLines: [v('lucius', 'You voted him down tonight, Bruce, so he is carrying cash instead. A motion on the record, and bonds in a briefcase. I can take that to the board in the morning.'), g('alfred', 'One evening in a suit, sir, and look what it bought.')],
          noLines: [v('lucius', 'The sale went through the moment your chair was empty. That case is the first instalment. I can still unwind it, Bruce, but I will need you in the room. In person. Awake.'), g('alfred', 'He is not wrong, sir. He is merely early.')],
          branches: { yes: 'n8Tip', no: 'n8Tip' },
        },
      ],
    },
    // [missions] ------------------------------------------------------------ Every Route You Take
    {
      id: 'm8Routes', title: 'Every Route You Take', checkpoint: 'lockKeeper', rewards: ['xp:300'],
      steps: [
        {
          id: 'n8Tip', type: 'evade', level: 3, delay: 7, ground: ['quayCraneSouth'],
          text: 'An anonymous tip, with a map. The GCPD is coming to the locks. Lose them: break their line of sight and stay out of it.',
          clearText: 'They have lost you. Stay off the numbered routes until the search stands down.',
          hintTitle: 'WANTED, AGAIN', hint: 'Black Mask has given the police the route map. Do not fight them: get out of sight and stay there until the search gives up. The south crane is not on any map (blue).',
          lines: [v('black mask', 'I bought a map from a man in a green suit, Batman. Thirteen routes, numbered. I have just read it to the police.'), g('gordon', 'Gordon. Another tip with your name, your position and a route map. Same green ink as the last one. I can not stop the Ostrow unit rolling on it. I can only tell you they are rolling.'), g('oracle', 'Every route you take is on that map. So take one you have never taken. Up the south crane.')],
          clearLines: [g('oracle', 'They have lost you. They are searching thirteen routes and you are not on any of them.'), g('gordon', 'I have pulled the rest. The tip came from a Sionis telephone, and I have a judge who dislikes Sionis more than he dislikes you.')],
        },
        {
          id: 'n8Cranes', type: 'traverse', text: 'The cranes: the one route nobody numbered. North along the jibs before the cordon closes on the quay.',
          gates: ['quayCraneMid', 'quayCraneNorth'], radius: 6, timer: 70, bonus: 20,
          failTitle: 'CORDON CLOSED', failText: 'They boxed the quay. Go again from where you stand.',
          failLines: [v('ostrow', 'All units, he is on the quay. I do not know how I know. I know.')],
          lines: [g('oracle', 'Three cranes, a hundred and twenty metres apart. Glide what you can, run what you can not. The cordon closes in about a minute.'), g('alfred', 'I did say the cape was not vanity, sir. I said it to Mr. Sionis\'s file, admittedly.')],
        },
        {
          id: 'n8Nest', type: 'fight', fight: 'nest', text: 'Under the north crane: his spotters, with a radio tuned to the police band. They are the tip line. Quietly.',
          lines: [g('oracle', 'Five False Faces under you with a police scanner and a telescope. They are not hiding from the GCPD. They are dictating to it.'), v('falseFace', 'Dispatch, he is on the roofs by the gate. No. The other roofs.')],
        },
        {
          id: 'n8RouteMap', type: 'scan', text: 'Their camera and their map. Read what he bought.',
          points: [
            { site: 'n8NestCam', lines: [g('oracle', 'A camera on a tripod, pointed at the gate roof. Tonight\'s pictures of you, numbered and timed. He is still adding pages.')] },
            { site: 'n8NestMap', lines: [g('oracle', 'The map. Thirteen routes in green ink, in a hand you know: he bought it from the man who drew it, back when the Loop was a quiz show. And one line added tonight in black: "Route 14, the cranes."'), g('batman', 'He had not numbered that one.'), g('oracle', 'He has now.')] },
          ],
        },
        {
          id: 'n8Ostrow', type: 'dilemma', key: 'n8.ostrow', text: 'Headlights on the quay. Detective Ostrow, alone, walking up to the nest. Back up the crane, or face her.',
          timer: 16, heading: 'COMPANY, AGAIN',
          card: 'Detective Ostrow is walking up the quay. Get back up the north crane before she sees you, or stand by the map and talk (gold).',
          bruce: { site: 'n8OstrowAt', radius: 4, label: 'Brazen it out', lines: [v('ostrow', 'Twice you have been a set of footprints. I prefer this.'), g('batman', 'The tip came from here. Their scanner, their map. Sionis is writing your dispatches.'), v('ostrow', 'I worked that out on the drive over. I called my units off before I got out of the car. I wanted to see whether you would run.')],
            miss: { effects: { suspicion: { detective: 5 } }, lines: [] } },
          batman: { site: 'quayCraneNorth', radius: 5, label: 'Back up the crane', lines: [v('ostrow', 'A scanner. A map. Five men asleep in a row. And nobody here.'), v('ostrow', 'I said one day I would look up.'), v('ostrow', 'Goodnight, whoever you are. Mind the jib.')],
            miss: { effects: { suspicion: { detective: -3 }, threads: { detective: 0.6 } }, lines: [] } },
          timeoutBranch: 'bruce',
          branches: { bruce: 'n8ToTower', batman: 'n8ToTower' },
        },
      ],
    },
    {
      id: 'm8Gauntlet', title: 'The File', checkpoint: 'n8BaseEntry', rewards: ['xp:300'],
      steps: [
        {
          id: 'n8ToTower', text: 'Wolf Point. The tower on the fork. Drop in at the north entrance.', site: 'n8BaseEntry', radius: 10,
          interrupts: [{ id: 'n8Collectors', at: 'n8Mahjong', radius: 24, fight: 'n8Collectors', xp: 80, label: "Optional: the protection money stays put", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Chinatown units: masked men collecting \"insurance\" door to door. The shopkeepers have started paying in fortune cookies." }] }], // [balance]
          lines: [g('oracle', 'Forty floors of False Faces. He will have planned for detective vision first. Everyone does.')],
          banter: [g('alfred', 'I have read his file on you, sir. He thinks you are vain about the cape. I could not possibly comment.')],
        },
        {
          id: 'n8Dark', type: 'fight', fight: 'base', locks: ['detective'], lockText: 'A jammer in the tower. Read them by sound, light and patience.',
          text: 'The parking floor. Detective vision is jammed. Five of them, a lieutenant among them. Take them silently.', tutorial: ['crouch', 'silent'],
          lines: [g('oracle', 'Your visor is dark. That is him. A jammer somewhere on this floor.'), v('falseFace', 'Boss says he can not see us now.'), v('falseFace', 'Then why am I whispering?')],
        },
        { id: 'n8File', type: 'cutscene', scene: 'n8File' },
        {
          id: 'n8NoGadgets', type: 'fight', fight: 'fork', locks: ['gadgets'], lockText: 'Your belt is locked out. Shields and snipers, and nothing to throw.',
          text: 'The fork. Shields and snipers, and your gadgets are locked out. Vault the shields. Break the snipers\' sight.',
          lines: [g('oracle', 'He sent a signal into the belt. Batarangs, claw, all of it. Locked.'), v('falseFace', 'He has got nothing! Get him!'), v('falseFace', 'He has got fists. Fists are something!')],
        },
        {
          id: 'n8NoGrapple', type: 'fight', fight: 'walk', locks: ['grapple', 'gadgets'], lockText: 'The grapple is locked too. Rifles on the river walk. Close the gap on foot.',
          text: 'The river walk. No grapple, no gadgets. Rifles and batons: close on foot, use cover.',
          lines: [g('oracle', 'Grapple is down. He wants you on the ground, in a line of fire. So do not stand in it.')],
        },
        {
          id: 'n8Up', text: 'Your tools come back. He wants you to have them now. Up to the roof deck.', site: 'n8Roof', radius: 7,
          lines: [g('oracle', 'Everything is back online. That is not a mistake. He wants to show you they will not matter.'), g('batman', 'They will not.')],
        },
        {
          id: 'n8ToBlackgate', text: 'A helicopter, lifting off the roof, south over the harbour. Blackgate. Call the Batwing and follow.', site: 'n8Dock', radius: 14,
          tutorial: ['callBatwing'],
          nudge: g('oracle', 'Blackgate is the prison island in the harbour, south of Old Gotham. Call the Batwing from a roof and fly. You cannot swim it. Please do not try.'),
          lines: [g('oracle', 'He is landing at Blackgate. He owns the contract for the prison laundry. Of course he does.'), v('black mask', 'Come and see me, Batman. I have the whole yard to myself. I paid for it.')],
          banter: [g('alfred', 'A man who buys a prison so he has somewhere to fight. I have known dukes like that.')],
        },
      ],
    },
    // [missions] ------------------------------------------------------------ Laundry Day
    {
      id: 'm8Laundry', title: 'Laundry Day', checkpoint: 'n8Dock', rewards: ['xp:300'],
      steps: [
        {
          id: 'n8NorthWalk', text: 'Blackgate. The yard is sealed from the gatehouse. Round the north wall to the gate.', site: 'n8NorthWalk', radius: 7,
          lines: [g('oracle', 'He holds the laundry contract, so he holds the night shift: half of it took his money. The half that did not is locked in the cell blocks.'), v('black mask', 'Mind the walls, Batman. The emitters on top cut a grapple line clean through. The prison paid for those. I merely switched them on.')],
          banter: [g('alfred', 'A prison with a laundry service and no working locks. One feels the priorities were set by an accountant.')],
        },
        {
          id: 'n8GateShift', type: 'fight', fight: 'gateShift', locks: ['grapple'], lockText: 'The wall emitters cut the line. No perches, no escapes upward: cover, patience and the dark.',
          text: 'The bought shift is loading laundry trucks at the gate. Six of them, and no grapple inside the emitters. Quietly, from the ground.',
          lines: [v('falseFace', 'Why are we loading laundry at midnight?'), v('falseFace', 'It is not laundry.'), v('falseFace', 'Then why does it say laundry on the truck?'), v('falseFace', 'That is how you launder things, Dennis.')],
        },
        {
          id: 'n8Keys', type: 'collect', item: 'n8Keys', site: 'n8KeysAt', radius: 3, text: 'The shift sergeant\'s keys, by the first truck.',
          lines: [g('oracle', 'Emitters are off. And the boilers under Block B have been running against a shut valve since he landed. He is holding the honest shift over a kettle.')],
        },
        {
          id: 'n8Cells', type: 'traverse', text: 'Over the wall. Kill the boiler master in the searchlight tower, then open Block B, then Block A, before the pressure peaks.',
          gates: ['n8WallTop', 'blackgateTower', 'n8DoorB', 'n8DoorA'], radius: 5, timer: 60, bonus: 12,
          failTitle: 'PRESSURE', failText: 'The relief valve blew and the blocks locked down again. Start again from the wall.',
          failLines: [v('black mask', 'Tick, tick. I do like a man who believes he can be in two places.')],
          lines: [g('oracle', 'About a minute before the relief valve goes. Wall, tower, Block B, Block A. The guards in there did nothing but refuse a bribe.')],
        },
        {
          id: 'n8Cobblepot', type: 'wait', seconds: 8, text: 'Cell 1, Block A. Somebody wants a word.',
          lines: [v('penguin', 'Detective! I heard the Sionis boy was buying the building. I would like it noted that I never bought a prison. I merely rented guards. There is a difference of class.'), g('batman', 'Stay in the cell.'), v('penguin', 'My dear fellow, tonight it is the only door in Gotham he does not own.')],
        },
        {
          id: 'n8Riot', type: 'fight', fight: 'riot', locks: ['grapple'], lockText: 'He has the yard emitters on again. Riot shields and stun batons, and nowhere to go but through.',
          text: 'The yard. The rest of the bought shift, in riot gear, between you and him. Vault the shields. Mind the batons.',
          lines: [v('black mask', 'Gentlemen. He let your colleagues out. Do explain to him what that does to my margins.'), g('oracle', 'Yard emitters are live. He wants you tired before he says hello.')],
        },
      ],
    },
    {
      id: 'm8Mask', title: 'Black Mask', checkpoint: 'n8YardIn', rewards: ['xp:600', 'lore:maskFile', 'skill:readTheRoom'],
      steps: [
        { id: 'n8Boss', type: 'boss', boss: 'blackMask', text: 'Black Mask. Counter blue, dodge red, do not repeat yourself.', checkpoint: 'n8YardIn', villain: 'blackMask',
          lines: [g('oracle', 'He has every tape of you. So fight like the tapes are wrong.')] },
      ],
    },
    // [missions] ------------------------------------------------------------ Carbon Copies
    {
      id: 'm8Copies', title: 'Carbon Copies', checkpoint: 'n8YardIn', rewards: ['xp:300'],
      steps: [
        {
          id: 'n8CopiesBoard', type: 'board', text: 'Some of the file did not go in the evidence bag. The Batmobile is at the prison gate.', site: 'n8CarGate', talk: 'over',
          lines: [g('oracle', 'Three laundry trucks left over the causeway while you were in the yard. Laundry does not need a drone escort. He had the file copied.'), g('alfred', 'The car is at the gate, sir. It came by the causeway. I had no idea it could hold its breath.')],
        },
        {
          id: 'n8Trucks', type: 'chase', text: 'The last laundry truck, on the causeway and into the docks grid. Ram it three times.', site: 'n8CarGate',
          van: { type: 'box_truck', color: 0xe8e4da, toast: 'The laundry truck. Ram it three times before it reaches the city!', label: 'LAUNDRY' },
          path: [{ x: 84, z: 300 }, { x: 84, z: 216 }, { x: 90, z: 198 }, { x: 90, z: 150 }, { x: 150, z: 150 }, { x: 150, z: 90 }, { x: 90, z: 90 }, { x: 90, z: 150 }, { x: 30, z: 150 }, { x: 30, z: 90 }, { x: 90, z: 90 }, { x: 90, z: 150 }],
          lines: [v('falseFace', 'He is behind us! Throw him something!'), v('falseFace', 'It is all paper! You can not throw paper at a tank!')],
          // The other life, mid-chase: the supper she waited at on Night Seven is still owed.
          calls: [{
            id: 'maraLate', from: 'mara', after: 10, timeout: 12, default: 'silent', silent: 'unread', sound: 'BZZT',
            lines: [v('mara', 'Text from Mara: "It is past midnight and I am deciding whether I am still cross about the candles. Help me decide."')],
            prompt: 'Mara, past midnight',
            options: [
              { id: 'truth', tag: 'honest', text: '"Be cross. I earned it. Tomorrow, wherever you are, I will be there."', effects: { threads: { love: 0.4 } }, lines: [v('mara', '"I shall be at the pier ballroom, up a ladder, restoring a ceiling. Bring coffee. And yourself, for once."')] },
              { id: 'joke', tag: 'charm', text: '"I am driving. Badly. Ask me again when I have stopped."', effects: { threads: { love: 0.1 } }, lines: [v('mara', '"You are always driving, Bruce. I am at the pier ballroom tomorrow. The ceiling does not cancel on me."')] },
            ],
            silentEffects: { threads: { love: -0.4 } }, silentLines: [g('alfred', 'Miss Quell\'s message has been read by nobody for ten minutes, sir. She will be at the pier ballroom tomorrow, restoring a ceiling. I mention it in case you ever answer anything.')],
          }],
        },
        {
          id: 'n8Escort', type: 'battle', text: 'The escort has turned back on the docks road: armoured drones, remote turrets. Shock cannon.', site: 'n8DocksRoad', drones: 8,
          lines: [g('oracle', 'Eight escort drones coming back down the docks road to cover the other two trucks. They are the model the prison ordered for riots. Guess who filled in the order.')],
        },
        {
          id: 'n8Delivered', type: 'wait', seconds: 7, text: 'Two trucks stopped. One had already made its drops.',
          lines: [g('oracle', 'Forty pages, eleven copies. Nine are in the trucks you stopped. One was left at the GCPD front desk an hour ago, addressed to Detective Ostrow.'), g('batman', 'And the last.'), g('oracle', 'Signed for at the Arkham mail room. "Occupant, cell 0801."')],
        },
      ],
    },
    {
      id: 'm8Breakout', title: 'Two Calls', checkpoint: 'n8Dock', rewards: ['xp:200'],
      steps: [
        { id: 'n8Breakout', type: 'cutscene', scene: 'n8Breakout' },
        {
          id: 'n8Statement', type: 'dilemma', key: 'n8.statement', text: 'Ostrow wants Bruce Wayne at the GCPD for a statement, now (gold). Arkham is breaking open.',
          timer: 60, heading: 'TWO CALLS',
          card: 'Detective Ostrow wants Bruce Wayne\'s statement at GCPD tonight (gold): an alibi, and her trust. Or answer the Arkham alarm at the causeway, and give the Joker less of a head start.',
          bruce: { site: 'n8Gcpd', radius: 8, label: 'Bruce at GCPD', lines: [v('ostrow', 'Mr. Wayne. Wet, at midnight, on a Tuesday. Sit down.'), g('bruce', 'I was at a board meeting. Then I went for a drive. In the rain.'), v('ostrow', 'I will write that down. I write everything down.')],
            miss: { effects: { suspicion: { detective: 10 }, threads: { detective: -0.5 } }, lines: [v('ostrow', 'Voicemail for Bruce Wayne. You missed our appointment. People who miss appointments with me get more appointments.')] } },
          batman: { site: 'n8Causeway', radius: 12, label: 'Batman at the causeway', lines: [g('gordon', 'Gordon. The causeway gate is holding because you are on it. Do not leave.')],
            miss: { effects: { city: -5 }, lines: [g('gordon', 'They took the causeway gate. He is on the pier with half of Arkham behind him.')] } },
          both: { effects: { suspicion: { detective: -4 } }, lines: [v('ostrow', 'Mr. Wayne gave his statement and the causeway held. Funny how that works.')] },
          branches: { bruce: 'n8End', batman: 'n8End', both: 'n8End' },
        },
        {
          id: 'n8End', type: 'nightEnd', text: 'Wolf Point is dark. Arkham is not.',
          lines: [g('alfred', 'One more night, sir. Then, I am told, there is a thing called sleep. I have read about it.'), g('oracle', 'He is on the pier. He wants an audience. Let us not give him one.')],
        },
      ],
    },
  ],
};

// [missions] The new missions' steps are `quiet` (docs/design/story-format.md 11): no open-world
// predator encounter starts under them and holds the story.
for (const m of NIGHT.missions) if (['m8Paper', 'm8Routes', 'm8Laundry', 'm8Copies'].includes(m.id)) m.steps = m.steps.map((s) => ({ ...s, quiet: true }));

export default NIGHT;
