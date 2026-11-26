// Night Nine, "The Last Laugh" (Act V, Arkham): the finale. The Joker walked out of Arkham on the
// door Black Mask paid for, took Amusement Mile and then the island back. A rematch that remixes
// Night One (the clowns, the funhouse, the van, the buzzer floor) with every trick learned since:
// a wing of fear gas, a greenhouse of dazed inmates, a riddle left in a cell, a frozen clock tower,
// and a dual boss in the yard built for two players (solo, the ally takes Harley). The ending's
// tone comes from the double life: who is still standing with Bruce (src/story/lifeSteps.js
// endingFor: family, partners, exposed, alone). After it: credits, free roam, replay, NG+.
// New role this night: the heavy (tutorial on the pier). Format: docs/design/story-format.md.
import { g, v, B, face, recap } from './common.js';
import { W, route } from '../rooms.js';
// [missions] Four more missions before the endgame (docs/design/briefs/missions-round.md), each
// collecting on something the earlier nights left owing:
//   m9Date     "bring a date": Mara Quell is restoring the ballroom ceiling when the clowns take the
//              pier. Walk in the front door as Bruce Wayne, or come through the roof as Batman: a
//              predator room either way, easier if the fuses went first, and she remembers which
//              of you turned up
//   m9Air      the laugh on the pier loudspeakers carries Black Mask's jammer (the copy of the file
//              that reached cell 0801): a fight with the belt and the visor dark, the transmitter on
//              the Wheel, the generator crew at the carousel
//   m9Parade   the riot drones he ordered for Blackgate, repainted as a parade, on Lakeshore Drive;
//              and the Penguin's boat crew on the Arkham lawn, come to collect a boss who is in
//              another prison
//   m9Breach   the door Black Mask paid for: what blew it, who was bought, and the staff it left
//              on the wrong side. How hard it is depends on whether the ward is still speaking to you

const SITES = {
  n9Pier: { x: 392, y: 3, z: -450 },
  n9Wheel: { x: 446, y: 3, z: -450 },
  n9WheelTop: { x: 446, y: 34.9, z: -450 },
  n9Coaster: { x: 520, y: 14.5, z: -466 },
  n9BallroomRoof: { x: 611, y: 18.4, z: -450 },
  n9Funhouse: { x: 570, y: 3, z: -455 },
  n9PlateA: { x: 562, y: 3, z: -449 },
  n9PlateB: { x: 578, y: 3, z: -449 },
  n9PlateC: { x: 562, y: 3, z: -461 },
  n9PlateD: { x: 578, y: 3, z: -461 },
  n9Car: { x: 345, y: 0, z: -420, yaw: Math.PI },
  n9Causeway: { x: 450, y: 0.5, z: -80 },
  n9Gate: { x: 596, y: 5, z: -80 },
  n9Intensive: { x: 668, y: 5, z: -113 },
  n9Phantom1: { x: 620, y: 5, z: -95 },
  n9Phantom2: { x: 640, y: 5, z: -104 },
  n9Phantom3: { x: 655, y: 5, z: -110 },
  n9Watch1: { x: 632, y: 5, z: -92 },
  n9Watch2: { x: 650, y: 5, z: -100 },
  n9Greenhouse: { x: 700, y: 6, z: -30 },
  n9Chapel: { x: 612, y: 5, z: -138 },
  n9ChPlateA: { x: 606, y: 5, z: -130 },
  n9ChPlateB: { x: 618, y: 5, z: -130 },
  n9ChPlateC: { x: 606, y: 5, z: -146 },
  n9Hall: { x: 617, y: 5, z: -80 },
  n9Tower: { x: 622, y: 41.5, z: -80 },
  n9YardArena: { x: 702, y: 5, z: -80 },
  n9JokerStart: { x: 706, y: 5, z: -84 },
  n9HarleyStart: { x: 696, y: 5, z: -74 },
  // [missions] every point below was checked against the live collision (scripts/site-probe.mjs)
  n9BallDoor: { x: 594, y: 3, z: -450 },
  n9BallSky: { x: 621, y: 12, z: -450 },
  n9Terrace: { x: 590, y: 3, z: -450 },
  n9MaraAt: { x: 590, y: 3, z: -458 },
  n9FuseAt: { x: 590, y: 3, z: -434 },
  n9CarouselAt: { x: 500, y: 3, z: -450 },
  n9TapeAt: { x: 490, y: 3, z: -441 },
  n9ParadeAt: { x: 345, y: 0, z: -130 },
  n9LawnAt: { x: 646, y: 5, z: -20 },
  n9LawnPerch: { x: 654, y: 17, z: -38 },
  n9BreachYard: { x: 672, y: 5, z: -140 },
  n9Invoice: { x: 660, y: 5, z: -144 },
  n9Rota: { x: 702, y: 5, z: -138 },
  n9IntRoof: { x: 654, y: 17, z: -122 },
};

const ROOMS = {
  // [missions] The ballroom terrace and the galleries either side of the hall. All cover stays east
  // of x 583: the funhouse plates of the mission after this one are on the same deck. `fill` is a
  // broad soft light from the shared pool so the room reads in the storm (src/story/rooms.js).
  ballRoom: {
    id: 'ballRoom', site: 'n9Terrace', entry: 'n9BallroomRoof', radius: 34, gang: 'joker',
    lights: [{ x: 612, y: 6.5, z: -433, r: 4, post: true, base: 3 }],
    fill: [{ x: 592, y: 12, z: -450, color: 0xffd9a0 }],
    cover: [{ x: 586, y: 3, z: -454, w: 1.4, d: 3, h: 1.6 }, { x: 592, y: 3, z: -444, w: 3, d: 1.4, h: 1.6 }, { x: 584, y: 3, z: -436, w: 2, d: 2, h: 1.5 }, { x: 606, y: 3, z: -468, w: 2.4, d: 1.2, h: 1.5 }, { x: 610, y: 3, z: -432.5, w: 2.4, d: 1.2, h: 1.5 }],
    huddle: { x: 590, y: 3, z: -450 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(594, 3, -460, 2, -Math.PI / 2), W(594, 3, -440, 2, -Math.PI / 2)) },
      { type: 'lieutenant', route: route('pingpong', W(587, 3, -448, 3, Math.PI / 2), W(587, 3, -462, 3, Math.PI / 2)) },
      { type: 'knife', route: route('loop', W(586, 3, -434), W(620, 3, -434, 1.5, 0), W(620, 3, -431), W(586, 3, -431, 1.5, Math.PI)) },
      { type: 'rifle', route: route('pingpong', W(602, 3, -468, 2.5, 0), W(622, 3, -468, 2.5, 0)) },
      { type: 'baton', route: route('pingpong', W(583, 3, -440, 2, Math.PI), W(583, 3, -456, 2, 0)) },
    ],
  },
  ballRoomHard: {
    id: 'ballRoomHard', site: 'n9Terrace', entry: 'n9BallroomRoof', radius: 34, gang: 'joker',
    lights: [{ x: 588, y: 6.5, z: -458, r: 5, post: true, base: 3 }, { x: 588, y: 6.5, z: -442, r: 5, post: true, base: 3 }, { x: 612, y: 6.5, z: -433, r: 4 }],
    fill: [], cover: [],
    huddle: { x: 590, y: 3, z: -450 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(594, 3, -460, 1.5, -Math.PI / 2), W(594, 3, -440, 1.5, -Math.PI / 2)) },
      { type: 'lieutenant', route: route('pingpong', W(587, 3, -448, 2, Math.PI / 2), W(587, 3, -462, 2, Math.PI / 2)) },
      { type: 'knife', route: route('loop', W(586, 3, -434), W(620, 3, -434, 1, 0), W(620, 3, -431), W(586, 3, -431, 1, Math.PI)) },
      { type: 'rifle', route: route('pingpong', W(602, 3, -468, 2, 0), W(622, 3, -468, 2, 0)) },
      { type: 'baton', route: route('pingpong', W(583, 3, -440, 1.5, Math.PI), W(583, 3, -456, 1.5, 0)) },
      { type: 'sniper', route: route('pingpong', W(596, 3, -466, 3, -Math.PI / 2), W(596, 3, -434, 3, -Math.PI / 2)) },
      { type: 'ninja', route: route('loop', W(584, 3, -464), W(596, 3, -464, 1, 0), W(596, 3, -438), W(584, 3, -438, 1, Math.PI)) },
    ],
  },
  // The carousel on the midway: the generator that feeds the transmitter, and its crew.
  carousel: {
    id: 'carousel', site: 'n9CarouselAt', entry: 'n9Coaster', radius: 28, gang: 'joker',
    lights: [{ x: 490, y: 6.5, z: -452, r: 5, post: true, base: 3 }, { x: 512, y: 6.5, z: -448, r: 5, post: true, base: 3 }, { x: 486, y: 6.5, z: -438, r: 4, post: true, base: 3 }],
    fill: [{ x: 500, y: 12, z: -450, color: 0xffd9a0 }],
    cover: [{ x: 486, y: 3, z: -460, w: 3, d: 1.4, h: 1.6 }, { x: 514, y: 3, z: -461, w: 1.4, d: 3, h: 1.6 }, { x: 484, y: 3, z: -442, w: 2, d: 2, h: 1.5 }, { x: 516, y: 3, z: -441, w: 2.4, d: 1.2, h: 1.5 }, { x: 500, y: 3, z: -462, w: 2, d: 1.4, h: 1.5 }],
    huddle: { x: 500, y: 3, z: -440 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(480, 3, -459, 2, Math.PI / 2), W(518, 3, -459, 2, -Math.PI / 2)) },
      { type: 'lieutenant', route: route('pingpong', W(490, 3, -439, 3, 0), W(512, 3, -439, 3, 0)) },
      { type: 'knife', route: route('loop', W(490, 3, -458), W(510, 3, -458, 1.5, 0), W(510, 3, -442), W(490, 3, -442, 1.5, Math.PI)) },
      { type: 'sniper', route: route('pingpong', W(520, 3, -446, 3, -Math.PI / 2), W(520, 3, -456, 3, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(480, 3, -446, 2.5, Math.PI / 2), W(480, 3, -454, 2.5, Math.PI / 2)) },
      { type: 'ninja', route: route('pingpong', W(496, 3, -463.5, 2, 0), W(516, 3, -463.5, 2, 0)) },
    ],
  },
  // The south lawn inside the Arkham wall: a boat crew cutting its way to the wrong prison.
  lawnRoom: {
    id: 'lawnRoom', site: 'n9LawnAt', entry: 'n9LawnPerch', radius: 46, gang: 'penguin',
    lights: [{ x: 622, y: 8.5, z: -14, r: 5, post: true, base: 5 }, { x: 646, y: 8.5, z: -26, r: 5, post: true, base: 5 }, { x: 672, y: 8.5, z: -14, r: 4, post: true, base: 5 }],
    fill: [{ x: 628, y: 15, z: -20, color: 0xdfe8ff }, { x: 668, y: 15, z: -20, color: 0xdfe8ff }],
    cover: [{ x: 616, y: 5, z: -20, w: 3, d: 1.4, h: 1.6 }, { x: 634, y: 5, z: -16, w: 1.4, d: 3, h: 1.6 }, { x: 652, y: 5, z: -22, w: 2, d: 2, h: 1.5 }, { x: 670, y: 5, z: -16, w: 2.4, d: 1.2, h: 1.5 }, { x: 606, y: 5, z: -24, w: 2, d: 1.4, h: 1.5 }],
    huddle: { x: 646, y: 5, z: -20 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(604, 5, -14, 2, Math.PI / 2), W(686, 5, -14, 2, -Math.PI / 2)) },
      { type: 'lieutenant', route: route('pingpong', W(626, 5, -25, 3, 0), W(656, 5, -25, 3, 0)) },
      { type: 'knife', route: route('loop', W(610, 5, -26), W(610, 5, -14, 1.5, 0), W(626, 5, -14), W(626, 5, -26, 1.5, Math.PI)) },
      { type: 'sniper', route: route('pingpong', W(690, 5, -18, 3, -Math.PI / 2), W(690, 5, -26, 3, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(640, 5, -18, 2.5, Math.PI), W(652, 5, -18, 2.5, Math.PI)) },
      { type: 'baton', route: route('pingpong', W(666, 5, -21, 2, Math.PI / 2), W(682, 5, -21, 2, -Math.PI / 2)) },
    ],
  },
};

// [missions] Fill light for the new open-air fights (src/story/rooms.js `night.lit`).
const LIT = [
  { id: 'n9LitHub', fill: [{ x: 446, y: 12, z: -444, ground: 3, color: 0xffd9a0, pool: 9, reach: 20 }] },
  { id: 'n9LitBreach', fill: [{ x: 672, y: 13, z: -140, ground: 5, color: 0xdfe8ff, pool: 7.5 }] },
];

const FIGHTS = {
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n9Escapees: { site: 'n9Causeway', radius: 12, gang: 'joker', act: 5, district: 'arkham', waves: [{ budget: 8, ring: 4.5 }] },
  pier: { site: 'n9Wheel', radius: 15, gang: 'joker', act: 5, district: 'pier', waves: [{ budget: 7, ring: 8, lead: 'heavy' }, { budget: 10, ring: 8, lead: 'knife' }] },
  gate: { site: 'n9Gate', radius: 14, gang: 'joker', act: 5, district: 'arkham', waves: [{ budget: 9, ring: 8, lead: 'lieutenant' }, { budget: 11, ring: 9, lead: 'ninja' }] },
  gateFallen: { site: 'n9Gate', radius: 14, gang: 'joker', act: 5, district: 'arkham', waves: [{ budget: 10, ring: 8, lead: 'lieutenant' }, { budget: 12, ring: 9, lead: 'ninja' }, { budget: 12, ring: 9, lead: 'heavy' }] },
  greenhouse: { site: 'n9Greenhouse', radius: 12, gang: 'ivy', act: 2, district: 'arkham', waves: [[{ type: 'grunt', dx: -4, dz: 2 }, { type: 'grunt', dx: 3, dz: 3 }, { type: 'grunt', dx: 0, dz: -4 }, { type: 'grunt', dx: 5, dz: -2 }, { type: 'grunt', dx: -5, dz: -3 }]] },
  // [missions]
  ball: { stealth: 'ballRoom' },
  ballHard: { stealth: 'ballRoomHard' },
  hub: { site: 'n9Wheel', radius: 15, gang: 'joker', act: 5, district: 'pier', waves: [{ budget: 9, ring: 8, lead: 'sniper' }, { budget: 11, ring: 8, lead: 'heavy' }] },
  carousel: { stealth: 'carousel' },
  lawn: { stealth: 'lawnRoom' },
  breach: { site: 'n9BreachYard', radius: 13, gang: 'joker', act: 5, district: 'arkham', waves: [{ budget: 9, ring: 7, lead: 'lieutenant' }, { budget: 11, ring: 7, lead: 'heavy' }] },
  breachAlone: { site: 'n9BreachYard', radius: 13, gang: 'joker', act: 5, district: 'arkham', waves: [{ budget: 9, ring: 7, lead: 'lieutenant' }, { budget: 11, ring: 7, lead: 'heavy' }, { budget: 11, ring: 7, lead: 'ninja' }] },
  chapelPenalty: { site: 'n9Chapel', radius: 12, gang: 'riddler', act: 5, district: 'arkham', waves: [{ budget: 4, ring: 6 }] },
};

const SCENES = {
  n9Recap: (stage) => recap(stage, {
    title: 'The man with the file',
    panels: [
      'Black Mask paid for a month of villains to study Batman, then tried to beat him with the results. He did not.',
      { shot: { cam: [-320, 64, -262], look: [-334, 58.5, -272] }, caption: 'Wolf Point is dark. The file is in an evidence bag. Some of it.' },
      { shot: { cam: [420, 20, -420], look: [446, 20, -450] }, caption: 'And the door he paid for let the Joker out. The pier is lit. The wheel is turning.' },
    ],
  }),
  doubleIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [690, 10, -66], look: [702, 6, -82], hero: { at: [694, 5, -72], yaw: 2.4, anim: 'Idle_Loop' } }), caption: 'The Arkham yard. Floodlights, a stage built out of gurneys, and two seats in the front row.' },
      { img: face('joker', 'THE JOKER AND HARLEY'), balloons: [B('A double act, Bats! You and the bird boy versus me and my girl. Somebody has to lose, and I have rigged it.', 50, 6, { w: 84 })] },
    ],
  }],
  doubleOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: face('joker', 'CURTAIN'), balloons: [B('Ha. Haha. You know what the funny part is? You need a partner now. You never used to need anybody.', 50, 6, { w: 84 })] },
      { img: stage.shot({ cam: [712, 8, -70], look: [702, 5.5, -82] }), caption: 'The guards come back into the yard. This time they double-lock the door, and nobody paid for it.', captionPos: 'bottom' },
    ],
  }],
  endFamily: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [-380, 26, -700], look: [-399, 20, -725] }), caption: 'Wayne Manor, a week later. Sunday lunch.' },
      { img: face('alfred', 'THE TABLE IS FULL'), caption: 'Alfred at the head of it, pretending not to be. Dick, late, with a bandage he will not explain. Mara, who has decided to stop asking.', captionPos: 'bottom' },
      { img: face('alfred', 'ALFRED'), balloons: [B('More soup, sir? You look almost rested. I had begun to think the condition was permanent.', 50, 6, { w: 82 })] },
    ],
  }],
  endPartners: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [8, 52, 18], look: [0, 44, 0] }), caption: 'The GCPD roof. The signal, switched on for no reason at all.' },
      { img: face('gordon', 'GORDON'), balloons: [B('Nothing on fire. Nothing frozen. Nobody in a mask on my radio. I thought you might want to see what that looks like.', 50, 6, { w: 84 })] },
      { img: face('gordon', 'PARTNERS'), caption: 'Lucius has a new grapple waiting. Alfred has left the porch light on. It is not a family dinner. It is close enough.', captionPos: 'bottom' },
    ],
  }],
  endExposed: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [-370, 26, -730], look: [-383, 19, -745] }), caption: 'Wayne Manor. A knock at the door. Detective Ostrow, with two cups of tea she brought herself.' },
      { img: face('gordon', 'DET. OSTROW'), balloons: [B('I know, Mr. Wayne. I have known for three weeks. I am not here to arrest you. I am here to tell you how sloppy you have been.', 50, 6, { w: 86 })] },
      { img: face('alfred', 'ALFRED'), balloons: [B('Biscuit, Detective? I find it helps with the lecturing.', 50, 6, { w: 76 })] },
    ],
  }],
  endAlone: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [-395, 8, -700], look: [-395, 1, -690] }), caption: 'The cave. The city is safe. The Manor is very quiet.' },
      { img: face('alfred', 'A NOTE ON THE BATCOMPUTER'), caption: 'In Alfred\'s hand: "Gone to my sister\'s for a while. The soup is in the freezer. Please eat it. Please sleep."', captionPos: 'bottom' },
      { img: face('recap', 'THE SIGNAL IS ON'), caption: 'He goes anyway. He always will. That was the problem, and the point.', captionPos: 'bottom' },
    ],
  }],
};

const NIGHT = {
  id: 'n9', act: 'act5', number: 9, actNumber: 5,
  finale: true,
  endings: { family: 'endFamily', partners: 'endPartners', exposed: 'endExposed', alone: 'endAlone' },
  title: 'Night Nine: The Last Laugh',
  blurb: 'The Joker is out, the pier is his and Arkham is a stage. A rematch with everything you have learned, and a partner at your side.',
  villain: 'joker', gang: 'joker',
  districts: ['pier', 'arkham'],
  timeOfDay: 23.5, weather: 'storm',
  start: 'n9Pier',
  day: {
    hook: 'day.n9',
    context: { day: 9, appointments: [], lead: 'Arkham is in lockdown. The pier is not.' },
    fallback: [
      g('alfred', 'No appointments today, sir. I cancelled them all. I told the world you have a cold. The world sent soup.'),
      g('alfred', 'And Master Dick is on his way. He said, and I quote, "he is not doing this one alone." I did not argue.'),
    ],
  },
  sites: SITES,
  rooms: ROOMS,
  lit: LIT,
  fights: FIGHTS,
  scenes: SCENES,
  overheard: [
    [['goonA', 'Why are we back on the pier?'], ['goonB', 'Boss likes a callback.'], ['goonA', 'What is a callback?'], ['goonB', 'It is when you do the same thing again and it is funnier.'], ['goonA', 'Is it funnier?'], ['goonB', 'Not for us.']],
    [['goonA', 'I got my old mask back.'], ['goonB', 'Did you wash it?'], ['goonA', 'It is a callback, Steve.']],
    [['goonA', 'Mr. J says this is the last time.'], ['goonB', 'He said that last time.'], ['goonA', 'That is the joke.']],
  ],
  missions: [
    {
      id: 'm9Pier', title: 'Amusement Mile', checkpoint: 'n9Pier', rewards: ['xp:200'],
      steps: [
        { id: 'n9Recap', type: 'cutscene', scene: 'n9Recap' },
        {
          id: 'n9ToPier', text: 'The pier. The Wheel is lit and turning.', site: 'n9Pier', radius: 16,
          title: { text: 'THE LAST LAUGH', sub: 'Night Nine' },
          nudge: g('oracle', 'East, past the park, out on the lake. You cannot miss it. He made sure you cannot miss it.'),
          lines: [
            g('oracle', 'Amusement Mile, every bulb on. He hijacked the pier sound system. It is playing the same laugh on a loop.'),
            g('nightwing', 'I am here, I am here. Did I miss the speech? Tell me I missed the speech.'),
          ],
          banter: [
            v('dispatch', 'All units: Amusement Mile is closed. The rides are running anyway. Do not, repeat, do not get on the rides.'),
            g('alfred', 'For the record, sir, I have made soup. It will keep. So, I trust, will you.'),
          ],
        },
        {
          id: 'n9PierFight', type: 'fight', fight: 'pier', text: 'Clowns at the Wheel, and a heavy in armour with them.',
          tip: { title: 'NEW: THE HEAVY', text: 'Armour shrugs off plain hits. Dodge his charge and his grab, cape stun him, then beat him down.' },
          lines: [v('clown', 'He is back! Mr. J said you would be back!'), v('clown', 'We had a bet. I lost the bet.')],
        },
      ],
    },
    {
      id: 'm9Wheel', title: 'The Wheel', checkpoint: 'n9Wheel', rewards: ['xp:250'],
      steps: [
        {
          id: 'n9WheelRun', type: 'traverse', text: 'He is in the funhouse. The fast way is over the top: the Wheel, the coaster, the ballroom roof.',
          gates: ['n9WheelTop', 'n9Coaster', 'n9BallroomRoof'], timer: 75, bonus: 12,
          failTitle: 'ROUND AGAIN', failText: 'The ride ended. Back to the Wheel.',
          failLines: [v('joker', 'Again! Again! Oh, that is the best part of a ride.')],
          lines: [g('nightwing', 'Race you to the coaster.'), g('batman', 'It is not a race.'), g('nightwing', 'Which is exactly what someone losing a race says.')],
        },
      ],
    },
    // [missions] ------------------------------------------------------------ Bring a Date
    {
      id: 'm9Date', title: 'Bring a Date', checkpoint: 'n9BallroomRoof', rewards: ['xp:300'],
      steps: [
        {
          id: 'n9Skylight', type: 'scan', text: 'The ballroom, from its own roof. Detective vision: who is he holding down there?', points: [{ site: 'n9BallroomRoof' }], hold: 1.2,
          lines: [g('oracle', 'Before the funhouse: the ballroom under you is lit and it should be shut. I count a dozen people sitting very still on the terrace.'), g('oracle', 'Restoration crew. They were doing the ceiling for the Foundation. One of them is Mara Quell.'), g('alfred', 'She said she would be at the pier ballroom today, sir. You said you would be there. I believe this is what the letter meant by a date.')],
        },
        {
          id: 'n9DateChoice', type: 'dilemma', key: 'n9.date', text: 'Walk in the front door as Bruce Wayne (gold), or come through the roof as Batman.',
          timer: 30, heading: 'BRING A DATE',
          card: 'The clowns are waiting for Batman. Nobody is waiting for a billionaire in a dinner jacket: walk in as Bruce (gold), find Mara and pull the fuses. Or go in as Batman from the low roof at the far end: seven of them, lamps on, and she will know which of you came.',
          bruce: { site: 'n9BallDoor', radius: 4, label: 'Bruce at the door', lines: [g('alfred', 'The dinner jacket is in the Wheel\'s ticket booth, sir. I planned for the evening you promised her, not the one you are having.')],
            miss: { effects: { threads: { love: -0.5 } }, lines: [v('mara', 'A man in a cape. Of course. And Bruce Wayne, who promised, is consistently somewhere else.')] } },
          batman: { site: 'n9BallSky', radius: 3, label: 'Batman through the roof', lines: [g('batman', 'No time for the jacket.'), g('alfred', 'There is never time for the jacket, sir. That is rather her point.')],
            miss: { effects: { suspicion: { reporter: 2 } }, lines: [g('oracle', 'Bruce Wayne walking into a hostage scene in a dinner jacket. That will be in the Gazette, and nobody will believe it.')] } },
          both: { effects: { threads: { love: 0.3 } }, lines: [g('nightwing', 'You take the door, I take the roof. For the record, I am the one doing the cool part.')] },
          timeoutBranch: 'batman',
          branches: { bruce: 'n9Ballroom', batman: 'n9RoomHard', both: 'n9Ballroom' },
        },
        {
          id: 'n9Ballroom', type: 'civvy', outfit: 'suit', text: 'The ballroom terrace, as Bruce Wayne. Be exactly what they expect.', next: 'n9Room',
          card: 'Bruce Wayne, in a dinner jacket, an hour late for a date and walking into a room full of clowns. Find Mara. Then find the fuse box.',
          beats: [
            { id: 'door', site: 'n9BallDoor', text: 'A clown on the door, with a clipboard.', lines: [v('clown', 'Name? We are only doing bats tonight. Are you a bat?')],
              choice: { key: 'n9.doorman', prompt: 'A clown with a guest list', default: 'drunk', options: [
                { id: 'drunk', tag: 'act', text: 'Is this the Foundation thing? I was told there would be a bar.', effects: { suspicion: { reporter: -2 }, standing: -1 }, lines: [v('clown', 'It is Bruce Wayne. He thinks it is a party. Sit him with the others, he will pay for himself later.')] },
                { id: 'own', tag: 'sharp', text: 'I own the pier. Strictly speaking, you are all trespassing on me.', effects: { standing: 1, suspicion: { villain: 2 } }, lines: [v('clown', 'He owns the pier! Boss will love that. Sit down, landlord.')] },
              ] } },
            { id: 'mara', site: 'n9MaraAt', text: 'Mara, in the front row, paint on her hands.', lines: [v('mara', 'You came. You are an hour late, there are clowns, and you came. I honestly do not know what to do with that.')],
              choice: { key: 'n9.mara', prompt: 'Mara Quell, very quietly', default: 'honest', options: [
                { id: 'honest', tag: 'honest', text: 'I said tomorrow. It is tomorrow. I am sorry it took a kidnapping.', effects: { threads: { love: 0.8 } }, lines: [v('mara', 'That is the first true thing you have said to me this month. Whatever you are about to do, Bruce, do it. I will keep them looking at me.')] },
                { id: 'charm', tag: 'charm', text: 'I brought coffee. I may have dropped the coffee.', effects: { threads: { love: 0.4 } }, lines: [v('mara', 'Of course you did. Go on, then. You have that look, the one you get before you leave a room.')] },
              ] } },
            { id: 'fuse', site: 'n9FuseAt', text: 'The fuse box, behind the popcorn stand.', lines: [g('bruce', 'Terrace lamps, gallery lamps, the spotlight on the hostages. Three fuses.'), g('alfred', 'I shall never again say that your misspent evenings at that pier taught you nothing, sir.')] },
          ],
          endLines: [g('oracle', 'Lights are out on the terrace and the clowns are shouting at each other about whose job the fuses were. Five of them. Go.')],
        },
        {
          id: 'n9RoomHard', type: 'fight', fight: 'ballHard', text: 'The terrace. Seven clowns, every lamp on, a dozen hostages in the middle. Quietly, or not at all.', next: 'n9DateAfter', tutorial: ['crouch', 'silent'],
          lines: [g('oracle', 'Seven, lamps on, and a sniper walking the front of the hall. If one of them shouts, the hostages are in the middle of it.')],
        },
        {
          id: 'n9Room', type: 'fight', fight: 'ball', text: 'The terrace, in the dark. Five clowns and no fuses. Quietly.', tutorial: ['crouch', 'silent'],
          lines: [v('clown', 'Who turned the lights off?'), v('clown', 'Mr. Wayne went to find the bar.'), v('clown', 'The bar is not IN the fuse box, Gary.')],
        },
        {
          id: 'n9DateAfter', type: 'life', test: 'thread:love>=2',
          yesLines: [v('mara', 'They are all asleep and the bat has gone. Bruce? Wherever you are standing, I know you can hear me. Go and finish it. Then come to dinner. I will bring the candles this time.'), g('alfred', 'I heard that too, sir. I shall lay a third place.')],
          noLines: [v('mara', 'Everyone is safe. Somebody tell Mr. Wayne, if anyone can find him, that the ceiling will be finished on time. He need not come and look at it.'), g('alfred', 'That was civil, sir. I would rather she had shouted.')],
          branches: { yes: 'n9Static', no: 'n9Static' },
        },
      ],
    },
    // [missions] ------------------------------------------------------------ Dead Air
    {
      id: 'm9Air', title: 'Dead Air', checkpoint: 'n9Wheel', rewards: ['xp:300'],
      steps: [
        {
          id: 'n9Static', type: 'fight', fight: 'hub', locks: ['detective', 'gadgets'], lockText: 'The laugh on the loudspeakers is a carrier wave. Your visor and your belt are dark until the transmitter is.',
          text: 'Your visor just went dark. The laugh track is a jammer, and it is coming from the Wheel. Back down the pier: his crew is under it.',
          lines: [g('oracle', 'That laugh on the pier speakers is not a recording, it is a carrier. Black Mask\'s jammer, the one from the tower. The copy of the file that went to cell 0801 had the circuit diagram in it.'), g('gordon', 'Gordon. Every police radio east of the park is playing that laugh. I can not move my people to the causeway until it stops.'), g('batman', 'Transmitter on the Wheel hub. I have done this dark before.')],
          banter: [g('nightwing', 'So no gadgets, no vision, and the rides are still running. This is the worst school trip I have ever been on.')],
        },
        {
          id: 'n9Hub', type: 'scan', text: 'Your tools are back for a moment. Find the transmitter on the Wheel hub and its relay on the coaster.',
          points: [
            { site: 'wheelTopVista', lines: [g('oracle', 'The transmitter. Sionis parts, clown wiring. It is fed by cable from the carousel: a generator, and people guarding it.')] },
            { site: 'n9Coaster', lines: [g('oracle', 'The relay. From up here you can see the carousel crew: six of them, and they have stopped watching the sky because they think you can not see.'), g('batman', 'They are half right.')] },
          ],
        },
        {
          id: 'n9Carousel', type: 'fight', fight: 'carousel', text: 'The carousel. Six of them round the generator, and they think you are blind. Quietly, from the coaster.', tutorial: ['crouch', 'silent'],
          lines: [v('clown', 'Boss says he can not see us and he can not throw things.'), v('clown', 'So what can he do?'), v('clown', 'Boss did not say. Boss started laughing.')],
        },
        {
          id: 'n9Tape', type: 'collect', item: 'n9Tape', site: 'n9TapeAt', radius: 3, text: 'Pull the tape out of the generator deck.',
          lines: [g('oracle', 'Pull the tape and Gordon gets his radios back. It is labelled, by the way. "Laugh track, mine. Do not tape over."'), g('gordon', 'Radios are up. Thank you. I have had that laugh in my ear for an hour and I would like it noted in my pension.')],
        },
      ],
    },
    {
      id: 'm9Funhouse', title: 'Funhouse, Again', checkpoint: 'n9Funhouse', rewards: ['xp:250'],
      steps: [
        {
          id: 'n9Jokes', type: 'puzzle', text: 'A joke on the floor, in four tiles. Tell it in the right order.',
          riddleTitle: 'HE LEFT A JOKE',
          riddle: 'Why did the bat cross the pier? First he SET UP the punchline, then the WAIT, then the BEAT, then he LAUGHED. Step on them in that order. (Set up, wait, beat, laugh.)',
          plates: [{ id: 'setup', site: 'n9PlateA', label: 'SET UP' }, { id: 'wait', site: 'n9PlateB', label: 'WAIT' }, { id: 'beat', site: 'n9PlateC', label: 'BEAT' }, { id: 'laugh', site: 'n9PlateD', label: 'LAUGH' }],
          order: ['setup', 'wait', 'beat', 'laugh'], timer: 80, wrongCost: 10, penalty: { budget: 3, gang: 'joker' },
          wrongLines: [v('joker', 'No no no, you stepped on the punchline! Timing, Bats!'), v('joker', 'You are killing it. Not in the good way.')],
          failLines: [v('joker', 'Boo! Off! Get him off! Bring him back on! Again!')],
          lines: [v('joker', 'You remember the funhouse! I remember the funhouse. Here, I wrote you a joke. You have to tell it right, or it is not funny.')],
        },
        {
          id: 'n9Gone', type: 'wait', seconds: 5, text: 'He is not in the funhouse. He never was.',
          lines: [v('joker', 'Oops! I am on the island. The van is on the drive. Catch me if you want to, or don\'t. I am not your dad.'), g('oracle', 'His van is heading for the causeway. Get to the car.')],
        },
      ],
    },
    {
      id: 'm9Van', title: 'Same Van, New Night', checkpoint: 'n9Car', rewards: ['xp:250'],
      steps: [
        { id: 'n9Board', type: 'board', text: 'The Batmobile on Lakeshore Drive.', site: 'n9Car', talk: 'over', lines: [g('alfred', 'The car is on the drive, sir. It has been washed. Please try not to undo that.')] },
        {
          id: 'n9Chase', type: 'chase', text: 'His old van, on the causeway road. Ram it three times before the gate.', site: 'n9Car',
          van: { type: 'gang_van', toast: 'His van, again. Ram it three times before the island gate!', label: 'THE VAN' },
          path: [{ x: 345, z: -300 }, { x: 345, z: -140 }, { x: 372, z: -80 }, { x: 450, z: -80 }, { x: 372, z: -80 }, { x: 345, z: -200 }],
          lines: [v('joker', 'Same van! I had it restored. Do you like the paint? It is the same paint!')],
        },
      ],
    },
    // [missions] ------------------------------------------------------------ The Welcoming Committee
    {
      id: 'm9Parade', title: 'The Welcoming Committee', checkpoint: 'n9Car', rewards: ['xp:300'],
      steps: [
        {
          id: 'n9Floats', type: 'battle', text: 'A parade on Lakeshore Drive: the riot drones Black Mask ordered for Blackgate, repainted. Shock cannon.', site: 'n9ParadeAt', drones: 8,
          lines: [v('joker', 'A parade! For you! I found them in a warehouse with the invoice still on. Somebody bought a great many tanks and then went to prison.'), g('oracle', 'Eight of the Blackgate riot drones between you and the causeway, painted like floats. Same turrets under the paint.')],
        },
        {
          id: 'n9ToDock', text: 'Boats at the Arkham dock, and they are not the Joker\'s. Over the causeway and round the south wall to the lawn.', site: 'n9LawnPerch', radius: 9,
          lines: [g('gordon', 'My people at the gate can hold ten minutes. But there are boats tying up at the island dock, south side, and nobody on them is wearing a party hat.'), g('oracle', 'Top hats, in fact. Stencilled on the hulls. Somebody has come to collect a prisoner.')],
          banter: [g('alfred', 'One does admire loyalty, sir. One prefers it better informed.')],
          nudge: g('oracle', 'Across the causeway, then south round the outside of the wall. The roof of the greenhouse wing looks down on the lawn.'),
        },
        {
          id: 'n9Lawn', type: 'fight', fight: 'lawn', text: 'The south lawn. The Penguin\'s old boat crew, cutting through to the cells to fetch a boss who is in Blackgate. Six. Quietly.', tutorial: ['crouch', 'silent'],
          lines: [v('goon', 'Which cell is the boss in?'), v('goon', 'The one with the umbrella stand.'), v('goon', 'None of them has an umbrella stand.'), v('goon', 'Then we are in the wrong prison, Clive.')],
        },
      ],
    },
    {
      id: 'm9Gate', title: 'The Island Gate', checkpoint: 'n9Causeway', rewards: ['xp:200'],
      steps: [
        {
          id: 'n9ToGate', text: 'Across the causeway to the Arkham gate.', site: 'n9Gate', radius: 14,
          interrupts: [{ id: 'n9Escapees', at: 'n9Causeway', radius: 24, fight: 'n9Escapees', xp: 80, label: "Optional: the escapees are back in custody", lines: [{ speaker: 'oracle', portrait: 'oracle', text: "Inmates on the causeway in orderly whites, hitchhiking toward the city. They are waving. Some of them are waving knives." }] }], // [balance]
          lines: [g('gordon', 'Gordon. Half my people are on the causeway. The other half are wondering why the inmates are wearing party hats.')],
        },
        {
          id: 'n9IfFell', type: 'life', test: 'choice:n8.statement=bruce',
          yesLines: [g('gordon', 'The gate fell while you were elsewhere last night. They have had a day to dig in.')],
          noLines: [g('gordon', 'The gate held last night, thanks to you. They are thin on the ground. Go.')],
          branches: { yes: 'n9GateFallen', no: 'n9GateFight' },
        },
        { id: 'n9GateFallen', type: 'fight', fight: 'gateFallen', text: 'The gate fell yesterday. They have dug in. Clear it, lieutenant first.', next: 'n9Intensive',
          lines: [v('clown', 'Welcome to Arkham! Mind the step! The step is a trap!')] },
        { id: 'n9GateFight', type: 'fight', fight: 'gate', text: 'The Arkham gate. Lieutenant first.', lines: [v('clown', 'Welcome to Arkham! Mind the step! The step is a trap!')] },
      ],
    },
    // [missions] ------------------------------------------------------------ The Door He Paid For
    {
      id: 'm9Breach', title: 'The Door He Paid For', checkpoint: 'n9Gate', rewards: ['xp:300'],
      steps: [
        {
          id: 'n9ToBreach', text: 'The breach in the north wall: the door Black Mask paid for. The night staff never got out past it.', site: 'n9BreachYard', radius: 9,
          lines: [g('gordon', 'The hole they all walked out of is on the north wall. My count of the night staff is eleven short, and the last radio call came from beside it.'), g('nightwing', 'I will take the east end. If you still want me at the east end.')],
          banter: [g('alfred', 'He asks, sir, because of a birthday. I only mention it.')],
        },
        {
          id: 'n9BreachScan', type: 'scan', text: 'Detective vision on the breach: what blew it, who was paid, where the staff went.',
          points: [
            { site: 'arkhamBreach', lines: [g('oracle', 'Shaped charges, set from the inside, against a wall that had been cored out first. That takes a week and a works order.')] },
            { site: 'n9Invoice', lines: [g('oracle', 'And there is the works order. "Damp remediation, north wall." Paid by Sionis Cold Holdings, the same week as the frost in the Yards. He bought this door before he bought anything else.')] },
            { site: 'n9Rota', lines: [g('oracle', 'The staff rota, with tonight circled. The eleven who would not take his money were all put on the same shift. They are on the wing roofs, with the gas valves, and the fans come on at midnight.'), g('batman', 'After his crew.')] },
          ],
        },
        {
          id: 'n9WardTest', type: 'life', test: 'thread:ward>=2',
          yesLines: [g('nightwing', 'East end is mine. Go on, say it. "Good work." It will not kill you.'), g('batman', 'Good work.'), g('nightwing', 'Alfred, did you get that on tape?')],
          noLines: [g('nightwing', 'Harley has me pinned at the yard door. You are on your own at the wall. You are used to that, right? That is how you like it.'), g('alfred', 'He will be there for the yard, sir. He is merely making a point, and it is not an unfair one.')],
          branches: { yes: 'n9BreachFight', no: 'n9BreachAlone' },
        },
        {
          id: 'n9BreachAlone', type: 'fight', fight: 'breachAlone', text: 'The breach, alone. Three waves of them, and nobody on the east end. Lieutenant first.', next: 'n9Roofs',
          lines: [v('clown', 'It is just him! The little one is not coming!'), v('clown', 'Did they have a row?'), v('clown', 'I hope they are all right.')],
        },
        {
          id: 'n9BreachFight', type: 'fight', fight: 'breach', text: 'The breach. Nightwing has the east end: two waves on yours. Lieutenant first.',
          lines: [v('clown', 'There are two of them!'), v('clown', 'There are always two of them now. It is very unfair.')],
        },
        {
          id: 'n9Roofs', type: 'traverse', text: 'The night staff are on the wing roofs with the gas valves. Shut both before the fans start: intensive treatment, then the greenhouse wing.',
          gates: ['n9IntRoof', 'n9LawnPerch'], radius: 6, timer: 55, bonus: 20,
          failTitle: 'FANS ON', failText: 'The fans cycled and the valves locked. They cycle again in a minute: go again.',
          failLines: [g('oracle', 'The fans ran. The staff have masks, for now. Next cycle in a minute.')],
          lines: [g('oracle', 'Two valves, two roofs, either side of the yard. The staff are tied to them. Under a minute.'), v('doctor', 'If that is the Batman: the valve wheel turns LEFT. Everyone turns it right. Everyone.')],
        },
      ],
    },
    {
      id: 'm9Wings', title: 'Old Friends', checkpoint: 'n9Gate', rewards: ['xp:400'],
      steps: [
        {
          id: 'n9Intensive', type: 'fear', site: 'n9Intensive', radius: 18, text: 'Intensive treatment: the doctor\'s gas is still in the vents. Through to the far door. Do not strike the phantoms.',
          rules: 'His gas, his wing. Phantoms are not there: do not hit them. Stay out of the watchers\' sight. Reach the far door.',
          phantoms: [{ at: 'n9Phantom1', type: 'grunt' }, { at: 'n9Phantom2', type: 'knife' }, { at: 'n9Phantom3', type: 'brute' }],
          watchers: [{ at: 'n9Watch1', yaw: Math.PI / 2, range: 9 }, { at: 'n9Watch2', yaw: -Math.PI / 2, range: 9 }],
          fear: { gas: 3.5, seen: 22 },
          failLines: [g('oracle', 'Your heart rate just did something I did not like. Back to the gate. Breathe.')],
          lines: [g('oracle', 'Fear toxin in the air handlers. Old stock, but it works. You know the drill.')],
        },
        {
          id: 'n9Greenhouse', type: 'fight', fight: 'greenhouse', thralls: true, text: 'The greenhouse. Inmates dazed by her old spores. Stun them awake.',
          lines: [v('inmate', 'The ferns told me to stand here.'), g('batman', 'The ferns are wrong.')],
        },
        {
          id: 'n9Chapel', type: 'puzzle', text: 'The chapel. The puzzler left a riddle in his cell for you. Answer it on the floor.',
          riddleTitle: 'A RIDDLE, LEFT BEHIND',
          riddle: 'I am the first to rise in the Narrows, the last to set on the Mile, and I was always here before you. Stand on: WHERE I RISE, WHERE I SET, WHERE I WAIT. (East, west, here.)',
          plates: [{ id: 'east', site: 'n9ChPlateB', label: 'EAST' }, { id: 'west', site: 'n9ChPlateA', label: 'WEST' }, { id: 'here', site: 'n9ChPlateC', label: 'HERE' }],
          order: ['east', 'west', 'here'], timer: 70, wrongCost: 10, penalty: { budget: 3, gang: 'riddler' },
          wrongLines: [v('riddler', 'Recorded message: if you are hearing this, you got it wrong. Of course you did.')],
          failLines: [v('riddler', 'Recorded message: time is up. I knew it would be. I always know.')],
          lines: [v('riddler', 'Recorded message, for the Bat only. The answer is the sun. Do try to keep up. I am in solitary, I am not dead.')],
        },
        {
          id: 'n9Clock', type: 'traverse', text: 'The clock tower is icing over (his frost cannon, left in storage, left on). To the top before it seals.',
          gates: ['n9Hall', 'n9Tower'], timer: 45, bonus: 10,
          failTitle: 'ICED', failText: 'The frost sealed the climb. Back to the hall.',
          failLines: [g('alfred', 'Defeated by a refrigerator, sir. Again.')],
          lines: [g('oracle', 'From the top of the tower you will see the yard. That is where he is. That is where she is.')],
        },
        {
          id: 'n9Look', type: 'scan', text: 'From the tower: find them in the yard.', points: [{ site: 'n9Tower' }], hold: 1.4,
          lines: [g('nightwing', 'Two of them, two of us. I like those odds.'), g('batman', 'Stay on Harley. Keep her away from him.'), g('nightwing', 'Keep her away from him. Got it. Away from the guy she is in love with. Easy.')],
        },
      ],
    },
    {
      id: 'm9Yard', title: 'Double Act', checkpoint: 'n9Gate', rewards: ['xp:800', 'lore:jokerFile', 'suit:arkhamKnight'],
      steps: [
        { id: 'n9Boss', type: 'boss', boss: 'doubleAct', text: 'Pull them apart, then daze both within a few seconds of each other.', checkpoint: 'n9Gate', villain: 'joker',
          lines: [g('oracle', 'Together they cover each other. Apart, they are two people having a very bad night. Make it apart.')] },
      ],
    },
    {
      id: 'm9Dawn', title: 'Dawn', checkpoint: 'n9Gate', rewards: [],
      steps: [
        {
          id: 'n9Walk', text: 'It is over. Walk out the gate.', site: 'n9Gate', radius: 10,
          lines: [g('gordon', 'Arkham secure. Every one of them in a cell, and the cells are locked with locks nobody bought from a man in a mask.'), g('nightwing', 'So. Breakfast?')],
        },
        { id: 'n9End', type: 'nightEnd', text: 'Dawn over the lake.', after: 'Gotham is yours. Replay any night from the Batcomputer.',
          lines: [g('alfred', 'Come home, sir. Whatever is waiting there, it is waiting for you.')] },
      ],
    },
  ],
};

// [missions] The new missions' steps are `quiet` (docs/design/story-format.md 11): no open-world
// predator encounter starts under them and holds the story.
for (const m of NIGHT.missions) if (['m9Date', 'm9Air', 'm9Parade', 'm9Breach'].includes(m.id)) m.steps = m.steps.map((s) => ({ ...s, quiet: true }));

export default NIGHT;
