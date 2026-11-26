// Night Seven, "Slow Burn" (Act IV, The Cold Front). The first snow, and someone is setting fire to
// it. A flying arsonist and his Burners are torching filing offices across Lower Gotham with an
// armoured fuel convoy behind them. The night opens at the Wayne Foundation's Planetarium gala,
// with Bruce on the guest list and the signal over the lake. Verbs: talk (as Bruce), the
// gala-or-signal choice, a glide across the city with a date texting you, the sniper's tutorial
// under the double-decker street, detective work on the burnt tankers, a predator room at the
// loading dock, a run over the river bridges ahead of the fire, the convoy in battle mode on
// Lakeshore Drive, a tanker chase, the twist, and a boss fought from the Batmobile.
// New role this night: the sniper (tutorial on the lower deck). Format: docs/design/story-format.md.
//
// [m67] Four missions added for length (docs/design/briefs/missions-round.md), each in the plot:
//   m7Case    Next on the List: the Burners' staging post under the west deck (a predator room),
//             a case board on which office burns next, and across the Loop to City Hall.
//   m7Hall    Hall of Records: Bruce Wayne walks in the front door Batman would have to break
//             (talk, as Bruce), the fire starts, four people against a clock, the Burners on the
//             steps, and who let them in.
//   m7El      The Last Train: a man in a cape leaving a burning City Hall is a police matter
//             (a scripted pursuit), then a fuel car loose on the El: run the viaduct, cut the signals.
//   m7Lounge  Old Money: tail the paymaster's car from the west bridge, and an old acquaintance
//             on the Iceberg Lounge roof who has been selling aviation fuel (a boss rematch).
import { g, v, B, face, recap } from './common.js';
import { W, route } from '../rooms.js';
import '../missions/n6/steps.js'; // [m67] step types: freeing, hack, escape, caseboard
import '../missions/n7/steps.js'; // [m67] step type: tail

// [m67] The added missions run through places the open world also uses (the pier, the museum
// campus, the Loop's rooftops). `quiet` on a step keeps an unplayed open-world predator encounter
// from starting under it (src/openworld/index.js): one of those holds the story until it is played.
const quiet = (steps) => steps.map((s) => ({ ...s, quiet: true }));

const SITES = {
  n7Gala: { x: 320, y: 0.15, z: 250 },
  n7Kerr: { x: 336, y: 0.15, z: 230 },
  n7Lucius: { x: 352, y: 0.15, z: 275 },
  n7Tunnel: { x: 268, y: 0.2, z: 240 },
  n7Lower: { x: 0, y: -5.5, z: -291 },
  n7LowerEast: { x: 60, y: -5.5, z: -291 },
  n7LowerWest: { x: -60, y: -5.5, z: -291 },
  n7Tanker1: { x: -40, y: -5.5, z: -293 },
  n7Tanker2: { x: 20, y: -5.5, z: -289 },
  n7Tanker3: { x: 48, y: -5.5, z: -294 },
  n7Dock: { x: 60, y: -5.5, z: -300 },
  n7DockEntry: { x: 60, y: 0, z: -291 },
  n7Filing: { x: 72, y: -5.5, z: -298 },
  n7Bridge1: { x: 120, y: -4.5, z: -271 },
  n7Bridge2: { x: -30, y: 0, z: -258 },
  n7Bridge3: { x: -150, y: 0, z: -258 },
  n7Car: { x: -150, y: 0, z: -258, yaw: Math.PI / 2 },
  n7ConvoySite: { x: 345, y: 0, z: -200 },
  n7DriveBoard: { x: 345, y: 0, z: -420, yaw: Math.PI },
  n7FireflyArena: { x: 345, y: 0, z: -330 },
  n7FireflyStart: { x: 345, y: 11, z: -300 },
  n7Workers: { x: -90, y: -4.5, z: -271 },
  n7Hydrant: { x: 391, y: 0, z: -270 },
  // [m67] Next on the List (the west end of the lower deck)
  n7WestDeckEntry: { x: -180, y: 0, z: -291 },
  n7Staging: { x: -180, y: -5.5, z: -292 },
  n7Tally: { x: -194, y: -5.5, z: -288 },
  n7PinMap: { x: -170, y: -5.5, z: -296 },
  n7Scraps: { x: -184, y: -5.5, z: -297 },
  n7Pass: { x: -166, y: -5.5, z: -287 },
  // [m67] Hall of Records (City Hall, the Loop)
  n7HallStreet: { x: 150, y: 0, z: -449 },
  n7HallSteps: { x: 160, y: 1.35, z: -449 },
  n7HallNorth: { x: 160, y: 1.35, z: -458 },
  n7HallSouth: { x: 160, y: 1.35, z: -440 },
  n7HallKerb: { x: 151, y: 0, z: -437 },
  n7HallRoof: { x: 171, y: 26, z: -449 },
  // [m67] The Last Train (the El: City Hall station south, then the river leg to Riverside)
  n7HideRoof: { x: 120, y: 64, z: -390 },
  n7ElStart: { x: 90, y: 7.26, z: -449 },
  n7El1: { x: 90, y: 7.26, z: -420 },
  n7El2: { x: 90, y: 7.26, z: -390 },
  n7El3: { x: 88, y: 7.26, z: -364 },
  n7El4: { x: 60, y: 7.26, z: -359 },
  n7El5: { x: 34, y: 7.26, z: -359 },
  n7SignalA: { x: 22, y: 8.55, z: -364 },
  n7SignalB: { x: 0, y: 8.55, z: -364 },
  n7SignalC: { x: -22, y: 8.55, z: -364 },
  // [m67] Old Money (the west bridge to the Iceberg Lounge on the Mile)
  n7TailCar: { x: -130, y: 0, z: -291, yaw: Math.PI / 2 },
  n7TailFrom: { x: -75, y: 0, z: -291 },
  n7LoungeFront: { x: 60, y: 0, z: -590 },
  n7LoungeRoof: { x: 50, y: 22, z: -611, yaw: Math.PI },
  n7LoungeCar: { x: 60, y: 0, z: -590, yaw: Math.PI / 2 },
};

const ROOMS = {
  dockRoom: {
    id: 'dockRoom', site: 'n7Dock', entry: 'n7DockEntry', radius: 24, gang: 'firefly',
    lights: [{ x: 50, y: -2.5, z: -296, r: 5, post: true }, { x: 72, y: -2.5, z: -296, r: 4, post: true }],
    cover: [{ x: 46, y: -5.5, z: -300, w: 3, d: 1.4, h: 1.6 }, { x: 58, y: -5.5, z: -290, w: 1.4, d: 3, h: 1.6 }, { x: 70, y: -5.5, z: -292, w: 2, d: 2, h: 1.5 }, { x: 64, y: -5.5, z: -304, w: 3, d: 1.2, h: 1.5 }],
    huddle: { x: 60, y: -5.5, z: -296 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(42, -5.5, -294, 2, Math.PI / 2), W(78, -5.5, -294, 2, -Math.PI / 2)) },
      { type: 'sniper', route: route('pingpong', W(74, -5.5, -302, 3, -Math.PI / 2), W(74, -5.5, -288, 3, -Math.PI / 2)) },
      { type: 'heavy', route: route('pingpong', W(50, -5.5, -302, 3, Math.PI / 2), W(66, -5.5, -302, 3, Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(52, -5.5, -288), W(68, -5.5, -288, 1.5, 0), W(68, -5.5, -298), W(52, -5.5, -298, 1.5, Math.PI)) },
      { type: 'medic', route: route('pingpong', W(44, -5.5, -288, 3, Math.PI / 2), W(44, -5.5, -300, 3, Math.PI / 2)) },
    ],
  },
  // [m67] The Burners' staging post under the west end of the deck, where the jerrycans are filled.
  // Lit by more lamps than the dock: nothing here may read as a black hole (owner note, 2026-11-25).
  westRoom: {
    id: 'westRoom', site: 'n7Staging', entry: 'n7WestDeckEntry', radius: 24, gang: 'firefly',
    lights: [{ x: -194, y: -2.4, z: -291, r: 5, post: true, base: -5.5 }, { x: -180, y: -2.4, z: -286, r: 5, post: true, base: -5.5 }, { x: -166, y: -2.4, z: -292, r: 5, post: true, base: -5.5 }, { x: -180, y: -2.4, z: -297, r: 4, post: true, base: -5.5 }],
    cover: [{ x: -190, y: -5.5, z: -295, w: 3, d: 1.4, h: 1.6 }, { x: -176, y: -5.5, z: -289, w: 1.4, d: 3, h: 1.6 }, { x: -170, y: -5.5, z: -294, w: 2, d: 2, h: 1.5 }, { x: -186, y: -5.5, z: -287, w: 3, d: 1.2, h: 1.5 }],
    huddle: { x: -180, y: -5.5, z: -292 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-197, -5.5, -292, 2, Math.PI / 2), W(-163, -5.5, -292, 2, -Math.PI / 2)) },
      { type: 'sniper', route: route('pingpong', W(-164, -5.5, -297, 3, -Math.PI / 2), W(-164, -5.5, -286, 3, -Math.PI / 2)) },
      { type: 'heavy', route: route('pingpong', W(-194, -5.5, -297, 3, Math.PI / 2), W(-180, -5.5, -297, 3, Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(-188, -5.5, -286), W(-172, -5.5, -286, 1.5, 0), W(-172, -5.5, -296), W(-188, -5.5, -296, 1.5, Math.PI)) },
      { type: 'medic', route: route('pingpong', W(-196, -5.5, -286, 3, Math.PI / 2), W(-196, -5.5, -296, 3, Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(-182, -5.5, -290, 2.5, 0), W(-170, -5.5, -290, 2.5, 0)) },
    ],
  },
};

const FIGHTS = {
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n7Torches: { site: 'n7Bridge2', radius: 12, gang: 'firefly', act: 4, district: 'lowerGotham', waves: [{ budget: 7, ring: 4.5 }] },
  n7Looters: { site: 'n7ConvoySite', radius: 12, gang: 'firefly', act: 4, district: 'lowerGotham', waves: [{ budget: 7, ring: 4.5 }] },
  lowerDeck: { site: 'n7Lower', radius: 15, gang: 'firefly', act: 4, district: 'lowerGotham', waves: [{ budget: 6, ring: 8, lead: 'sniper' }, { budget: 9, ring: 8, lead: 'ninja' }] },
  lowerDeckBig: { site: 'n7Lower', radius: 15, gang: 'firefly', act: 4, district: 'lowerGotham', waves: [{ budget: 7, ring: 8, lead: 'sniper' }, { budget: 10, ring: 8, lead: 'ninja' }, { budget: 9, ring: 8, add: [{ type: 'brute', dx: 0, dz: 7 }] }] },
  dock: { stealth: 'dockRoom' },
  workers: { site: 'n7Workers', radius: 11, gang: 'firefly', act: 3, district: 'lowerGotham', waves: [{ budget: 4, ring: 5 }] },
  // [m67]
  westDeck: { stealth: 'westRoom' },
  // The one straight fight among the added missions: the Burners who came to finish City Hall.
  hallSteps: { site: 'n7HallStreet', radius: 15, gang: 'firefly', act: 4, district: 'loop', waves: [{ budget: 8, ring: 7, lead: 'sniper' }, { budget: 10, ring: 7, lead: 'ninja' }, { budget: 7, ring: 7, add: [{ type: 'brute', dx: 0, dz: -7 }] }] },
};

const SCENES = {
  n7Recap: (stage) => recap(stage, {
    title: 'A garden, a retainer',
    panels: [
      'The botanist took Robinson Park and very nearly the Wayne orchids. She was paid to keep Bruce Wayne at home.',
      { shot: { cam: [304, 8, -690], look: [294, 1, -714] }, caption: 'The park is quiet. The commuters remember nothing but a strong smell of roses.' },
      { shot: { cam: [360, 14, 220], look: [336, 8, 258] }, caption: 'Tonight: the first snow, the Planetarium gala, and fires on the lower deck.' },
    ],
  }),
  n7Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [60, -2, -282], look: [72, -5, -298], hero: { at: [70, -5.5, -296], yaw: 0.9, anim: 'Interact' } }), caption: 'The filing office on the loading dock. Every drawer emptied, every folder doused.' },
      { img: face('blackMask', 'SIONIS COLD HOLDINGS', 'registered office: Wolf Point'), caption: 'Every building burned tonight held a Sionis filing. He is not starting fires. He is shredding.', captionPos: 'bottom' },
      { img: face('firefly', 'FIREFLY'), balloons: [B('Paperwork, Batman! He pays me to burn paperwork! Do you know how boring that is? So I made it pretty.', 50, 6, { w: 84 })] },
    ],
  }],
  fireflyIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [330, 6, -460], look: [345, 4, -330], hero: { at: [345, 0, -420], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'Lakeshore Drive, snowing. Six empty lanes and one man in the sky with a flamethrower.' },
      { img: face('firefly', 'FIREFLY'), balloons: [B('You brought a car to a sky fight? Oh, I like you. I am going to set you on fire, but I like you.', 50, 6, { w: 82 })] },
    ],
  }],
  fireflyOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: face('firefly', 'GROUNDED'), balloons: [B('My suit! Do you know what a jetpack costs? Neither do I, I stole it!', 50, 6, { w: 80 })] },
      { img: stage.shot({ cam: [355, 4, -320], look: [345, 0.5, -332] }), caption: 'GCPD hose down the drive. The snow comes back. It seems to have been waiting.', captionPos: 'bottom' },
    ],
  }],
  // [m67] The rematch on the Lounge roof: the boss framework plays the def's intro and outro by
  // name from the night in play, so Night Seven writes its own pages for the second meeting.
  penguinIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [62, 27, -598], look: [49, 23, -623], hero: { at: [50, 22, -611], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The Iceberg Lounge roof, in the snow. The sign says CLOSED BY ORDER. The lights say otherwise.' },
      { img: face('penguin', 'THE PENGUIN', 'out on bail since Thursday'), balloons: [B('Detective! Twice in one season. I sell a man some aeroplane fuel, perfectly legal aeroplane fuel, and you come up my drainpipe.', 50, 6, { w: 84 })] },
    ],
  }],
  penguinOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: face('penguin', 'OLD MONEY', 'the ledger is in the ice bucket'), balloons: [B('Take the book! Seven tankers, six paid for, and the buyer signs with a rubber stamp from Wolf Point. I am a wholesaler, not an arsonist!', 50, 6, { w: 84 })] },
      { img: stage.shot({ cam: [40, 26, -604], look: [50, 23, -618], hero: { at: [49, 22, -616], yaw: Math.PI, anim: 'Interact' } }), caption: 'One page matters. The last tanker carries more than the other six together. Without it, the man in the sky comes down.', captionPos: 'bottom' },
    ],
  }],
  n7End: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [-334, 70, -240], look: [-334, 58, -270] }), caption: 'Wolf Point. One window lit at the very top.' },
      { img: face('alfred', 'ALFRED'), balloons: [B('He has burned his own paper trail, sir. Men only do that when they are about to leave, or about to do something worth hiding.', 50, 6, { w: 84 })] },
    ],
  }],
};

export default {
  id: 'n7', act: 'act4', number: 7, actNumber: 4,
  title: 'Night Seven: Slow Burn',
  blurb: 'The first snow, the Planetarium gala, and a man in a jetpack burning Lower Gotham one filing cabinet at a time.',
  villain: 'firefly', gang: 'firefly',
  districts: ['lowerGotham', 'lakefront'],
  timeOfDay: 21, weather: 'snow',
  start: 'n7Gala',
  day: {
    hook: 'day.n7',
    context: { day: 7, appointments: [{ id: 'planetariumGala', at: 20, place: 'planetariumDoor', title: 'The Planetarium gala, Bruce hosting' }], lead: 'Three fires in Lower Gotham this week, all in buildings that rent filing space.' },
    fallback: [
      g('alfred', 'The Planetarium gala tonight, sir. You are giving the speech. I have written it on cards. Large cards.'),
      g('alfred', 'And Miss Quell has asked whether you are free for a late supper after. I said yes on your behalf. Please do not make a liar of me.'),
    ],
  },
  sites: SITES,
  rooms: ROOMS,
  fights: FIGHTS,
  scenes: SCENES,
  overheard: [
    [['goonA', 'Is it snowing or is that ash?'], ['goonB', 'Bit of both.'], ['goonA', 'Lovely. Festive.']],
    [['goonA', 'Why do we only burn offices?'], ['goonB', 'Boss says paper burns honest.'], ['goonA', 'What does that even mean?'], ['goonB', 'Means he gets paid by the drawer.']],
    [['goonA', 'Heat jokes are banned on this crew.'], ['goonB', 'Since when?'], ['goonA', 'Since Dave said we were on fire and the boss took it personally.']],
  ],
  missions: [
    {
      id: 'm7Gala', title: 'The Planetarium Gala', checkpoint: 'n7Gala', rewards: ['xp:100'],
      steps: [
        { id: 'n7Recap', type: 'cutscene', scene: 'n7Recap' },
        {
          id: 'n7Party', type: 'civvy', outfit: 'tux', text: 'Your gala. Work the lawn.', site: 'n7Gala',
          card: 'Bruce Wayne, host, in a dinner jacket in the snow. Talk to your guests. The press is here.',
          beats: [
            { id: 'kerr', site: 'n7Kerr', text: 'Nadia Kerr from the Gazette is waiting.', lines: [v('kerr', 'Mr. Wayne. Lovely evening. Lovely knuckles. Polo again?')],
              choice: { key: 'n7.knuckles', prompt: 'She is looking at your hands', default: 'polo', options: [
                { id: 'polo', tag: 'excuse', text: 'Polo. The horses play rough.', effects: { suspicion: { reporter: 3 } }, lines: [v('kerr', 'Polo. In November. Noted.')] },
                { id: 'cooking', tag: 'excuse', text: 'I have taken up cooking. It is going badly.', effects: { suspicion: { reporter: 1 }, standing: -1 }, lines: [v('kerr', 'Cooking. I would pay to see that.')] },
                { id: 'gloves', tag: 'act', text: 'Pocket the hands, change the subject. "Have you tried the canapes?"', effects: { suspicion: { reporter: -1 }, threads: { reporter: -0.3 } }, lines: [v('kerr', 'I have. They are better than the answer.')] },
              ] } },
            { id: 'lucius', site: 'n7Lucius', text: 'Lucius is by the telescope.', lines: [v('lucius', 'Bruce. The new dome is funded if you finish the speech. Also, I have something for the car. It is fireproof. I do not want to know why you would need that.')] },
          ],
        },
        {
          id: 'n7Signal', type: 'dilemma', key: 'n7.gala', text: 'The signal is over the lake. Give the speech (gold), or slip out through the service tunnel.',
          timer: 40, heading: 'THE SIGNAL',
          card: 'The speech is in five minutes and the signal is up. Stay and give it (gold), and the fire in Lower Gotham grows. Slip out the service tunnel, and Alfred reads your cards.',
          bruce: { site: 'n7Gala', radius: 5, label: 'Give the speech', lines: [g('bruce', 'Thank you all for coming. Gotham has always looked up. Tonight, let us give it something to look at.'), v('guest', 'Bravo!')],
            miss: { effects: { standing: -5, patience: -6 }, lines: [g('alfred', 'I have read your speech, sir. They laughed in the right places. I had to improvise the ending. I used a quote from my mother.')] } },
          batman: { site: 'n7Tunnel', radius: 7, label: 'Slip out the service tunnel', lines: [g('batman', 'Alfred. The cards.'), g('alfred', 'The cards, sir. Of course. I shall try to sound younger.')],
            miss: { effects: { city: -4 }, lines: [g('gordon', 'Gordon. The fire on the lower deck has spread to a second building. Two of my officers went in after a night watchman. Whenever you are ready.')] } },
          both: { effects: { standing: 2 }, lines: [g('alfred', 'One of you on stage and one in a tunnel. The Foundation thanks you both.')] },
          branches: { bruce: 'n7ToLower', batman: 'n7ToLower', both: 'n7ToLower' },
        },
      ],
    },
    {
      id: 'm7Lower', title: 'Lower Deck', checkpoint: 'n7LowerWest', rewards: ['xp:200'],
      steps: [
        {
          id: 'n7ToLower', text: 'Fire on the lower deck of the river street. Across the city, under the upper deck.', site: 'n7Lower', radius: 18,
          interrupts: [{ id: 'n7Torches', at: 'n7Bridge2', radius: 24, fight: 'n7Torches', xp: 80, label: "Optional: the torch crew is out", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Units by the river: men with road flares lighting the bins along the bridge approach. One bin at a time. Very methodical." }] }], // [balance]
          nudge: g('oracle', 'North and west to the river. The double-decker street runs along it; the fire is on the bottom level. Drop in from either end.'),
          lines: [g('oracle', 'Lower Gotham, the bottom deck. Two tankers burning, and his crew are still there with rifles. Somebody up on the girders has a scope.')],
          banter: [
            v('dispatch', 'All units: Lower Gotham is closed due to fire. Use the upper deck. Or, honestly, another city.'),
            g('oracle', 'It is snowing on one deck and burning on the other. Gotham has range.'),
          ],
          calls: [{
            id: 'date', from: 'mara', after: 14, timeout: 14, default: 'silent', silent: 'stood', sound: 'BZZT',
            lines: [v('mara', 'Text from Mara: "Supper at nine? I am at the table. They have candles. Where are you?"')],
            prompt: 'Mara is waiting at the restaurant',
            options: [
              { id: 'sorry', tag: 'honest', text: '"Something came up. I am so sorry. Tomorrow, I promise."', effects: { threads: { love: -0.2 } }, lines: [v('mara', '"Tomorrow, then. I am holding you to it, Wayne."')] },
              { id: 'excuse', tag: 'excuse', text: '"Stuck at the gala. Board members. You know how they are."', effects: { threads: { love: -0.5 }, suspicion: { reporter: 1 } }, lines: [v('mara', '"I can see the Planetarium from here, Bruce. It is empty."')] },
              { id: 'go', tag: 'leave', text: '"On my way." (She waits. You will not come.)', effects: { threads: { love: -0.8 } }, lines: [g('alfred', 'Sir. You told her you were on your way. You are under a bridge.')] },
            ],
            silentEffects: { threads: { love: -1 } }, silentLines: [g('alfred', 'Miss Quell has left the restaurant, sir. She asked the waiter to tell you the candles were lovely.')],
          }],
        },
        {
          id: 'n7IfLate', type: 'life', test: 'choice:n7.gala=bruce',
          yesLines: [g('gordon', 'It is worse than it was. You took your time.')],
          branches: { yes: 'n7LowerBig', no: 'n7LowerFight' },
        },
        {
          id: 'n7LowerBig', type: 'fight', fight: 'lowerDeckBig', text: 'The fire has spread and so has his crew. A sniper on the girders. Clear the deck.', next: 'n7Tankers',
          tip: { title: 'NEW: THE SNIPER', text: 'A red laser means he has a lock. Break his line of sight (a column, a truck), then climb to him or knock him off with a gadget.' },
          lines: [v('burner', 'It is the Bat! Somebody tell the guy with the scope!'), v('burner', 'He can see! That is the whole point of the scope!')],
        },
        {
          id: 'n7LowerFight', type: 'fight', fight: 'lowerDeck', text: 'His crew on the lower deck. A sniper on the girders. Clear it.',
          tip: { title: 'NEW: THE SNIPER', text: 'A red laser means he has a lock. Break his line of sight (a column, a truck), then climb to him or knock him off with a gadget.' },
          lines: [v('burner', 'It is the Bat! Somebody tell the guy with the scope!'), v('burner', 'He can see! That is the whole point of the scope!')],
        },
        {
          id: 'n7Tankers', type: 'scan', text: 'Detective vision on the burnt tankers.',
          points: [
            { site: 'n7Tanker1', lines: [g('oracle', 'Aviation fuel, not diesel. That is not a truck that drives itself, it is a truck that flies someone.')] },
            { site: 'n7Tanker2', lines: [g('oracle', 'Convoy plates, armoured, sequential numbers. Seven trucks. Six still on the road.')] },
            { site: 'n7Tanker3', lines: [g('oracle', 'And the route sheet: Lakeshore Drive, then the loading dock here. They are refuelling him in stages.')] },
          ],
          optional: [{ id: 'n7Watchman', title: 'Optional: find the night watchman', site: 'n7LowerEast', radius: 5, xp: 60, done: 'The night watchman, singed and grateful, behind a column.', lines: [v('watchman', 'I am fine. I am fine. My lunchbox is not fine.')] }],
        },
      ],
    },
    {
      id: 'm7Dock', title: 'The Loading Dock', checkpoint: 'n7DockEntry', rewards: ['upgrade:fireproofLining'],
      steps: [
        {
          id: 'n7DockRoom', type: 'fight', fight: 'dock', text: 'The loading dock under the deck. Five of them, a heavy and a sniper. Quietly.', tutorial: ['crouch', 'silent'],
          lines: [v('burner', 'Lights are flickering.'), v('burner', 'It is a fire, Steve. Fires flicker.')],
        },
        {
          id: 'n7Filing', type: 'collect', item: 'n7Filing', site: 'n7Filing', radius: 3, text: 'The filing office on the dock. Take what has not burned.',
          lines: [g('oracle', 'Anything with a letterhead. I want to know why a pyromaniac is so interested in filing.')],
        },
        { id: 'n7Twist', type: 'cutscene', scene: 'n7Twist' },
      ],
    },
    // [m67] Next on the List: the staging post under the west deck, and which office burns next.
    {
      id: 'm7Case', title: 'Next on the List', checkpoint: 'n7LowerWest', rewards: ['xp:200'],
      steps: quiet([
        {
          id: 'n7ToStaging', text: 'The dock\'s fuel drums are empty. They fill the cans somewhere else: the west end of the deck.', site: 'n7WestDeckEntry', radius: 14,
          nudge: g('oracle', 'West along the river street, upper level, to where the deck ends before the bridge. They are underneath you there.'),
          lines: [
            g('oracle', 'He is shredding with fire, fine. But the drums on this dock are empty, and somebody filled forty jerrycans tonight. Thermal has a warm patch under the west end of the deck.'),
            g('oracle', 'Stay on the upper level until you are over them. And Batman: if he has a list, I want the list.'),
          ],
          banter: [
            g('alfred', 'The west end of the lower deck, sir. Some two hundred yards from our own downtown door. I do hope they have not been borrowing the electricity.'),
            v('dispatch', 'All units: the smell of petrol on the river street is, we are advised, petrol.'),
          ],
        },
        {
          id: 'n7WestRoom', type: 'fight', fight: 'westDeck', text: 'The Burners\' staging post under the deck. Six of them, a heavy and a sniper. Quietly: the place is full of fuel.', tutorial: ['crouch', 'silent'],
          lines: [v('burner', 'No smoking down here.'), v('burner', 'We are arsonists, Phil.'), v('burner', 'Professional arsonists. There is a difference. There is a sign.')],
        },
        {
          id: 'n7List', type: 'caseboard', text: 'Search the staging post: four pieces of evidence, then the case board. Which office is next?',
          caseTitle: 'Next on the List', blurb: 'Three fires in a week and a fourth being poured. He is working down a list. Find the end of it.',
          prompt: 'Put the fires in order. The last card is the one that has not happened yet.',
          evidence: [
            { id: 'tally', site: 'n7Tally', glyph: 'mark', label: 'Chalk tally', text: 'Cans per job, chalked on a column: KANE 4, CANAL 9, DOCK 15. A last line, not crossed out: 40.', lines: [g('oracle', 'Four, nine, fifteen. Each job bigger than the last. And then forty, which is not a job, it is a statement.')] },
            { id: 'map', site: 'n7PinMap', glyph: 'object', label: 'Street map', text: 'Three pins with dates: Monday on Kane Street, Wednesday on the canal, tonight at the dock. A fourth pin with no date, in the Loop.', lines: [g('oracle', 'Monday, Wednesday, tonight. And a pin with no date on it yet, in the middle of the Loop.')] },
            { id: 'scraps', site: 'n7Scraps', glyph: 'drop', label: 'Burnt letterheads', text: 'A bucket of half burnt paper: property deeds, building permits, shipping manifests. Trophies, or proof of work for the client.', lines: [g('oracle', 'Deeds, then permits, then manifests. He keeps a sample from each fire. For the invoice, I assume.')] },
            { id: 'pass', site: 'n7Pass', glyph: 'print', label: 'Visitor pass', text: 'A City Hall night pass, Hall of Records annex, made out to "boiler inspection". Issued today.', lines: [g('oracle', 'A night pass for the Hall of Records. Company registrations live there. Every Sionis shell company, on paper, in one room.')] },
          ],
          cards: [
            { id: 'dock', text: 'The loading dock filing office burns: fifteen cans, shipping manifests.' },
            { id: 'hall', text: 'Forty cans go to the Hall of Records at City Hall: company registrations.' },
            { id: 'kane', text: 'Kane Street Storage burns: four cans, property deeds.' },
            { id: 'canal', text: 'The Canal Records office burns: nine cans, building permits.' },
          ],
          order: ['kane', 'canal', 'dock', 'hall'],
          lines: [g('oracle', 'Nobody left to object. Chalk on the column, something pinned up by the lamp, a bucket, and whatever that is on the crate at the east end.')],
          readyLines: [g('oracle', 'Board is up. Three fires behind us and one ahead. Put them in order and the last card is where you need to be.')],
          solvedLines: [
            g('oracle', 'City Hall. Tonight. The Hall of Records is closed, alarmed, and guarded by the city, which means Batman going in is a felony with witnesses.'),
            g('alfred', 'Whereas Mr. Wayne, sir, sits on two civic boards and is still wearing a dinner jacket under all that.'),
          ],
        },
        {
          id: 'n7ToHall', text: 'City Hall, in the Loop. Get there before the forty cans do.', site: 'n7HallStreet', radius: 14,
          nudge: g('oracle', 'North east into the Loop. City Hall is the one with the dome and the steps, east of the El. The El is the thing making all the noise.'),
          lines: [g('oracle', 'Across the Loop, east side. If you ride the El roof from Kane Street you will be there before the lights change. Do not tell the transit authority I said that.')],
          banter: [
            g('alfred', 'Miss Kerr of the Gazette has telephoned twice, sir, to ask where the host of the gala has gone. I said you were inspecting a boiler. It seemed topical.'),
            g('oracle', 'Gotham fact: City Hall has burned down twice already. Both times the committee investigating it met in a tent.'),
          ],
        },
      ]),
    },
    // [m67] Hall of Records: in the front door as Bruce Wayne, out through a fire as Batman.
    {
      id: 'm7Hall', title: 'Hall of Records', checkpoint: 'n7HallStreet', rewards: ['xp:200'],
      steps: quiet([
        {
          id: 'n7Clerk', type: 'civvy', outfit: 'tux', text: 'City Hall is closed to Batman. It is not closed to Bruce Wayne.',
          card: 'You are Bruce again, in the dinner jacket, on the City Hall steps. Talk your way to the Hall of Records. What you say here is remembered.',
          beats: [
            { id: 'clerk', site: 'n7HallSteps', text: 'The night clerk is at the top of the steps.', lines: [v('clerk', 'We are closed, sir. We have been closed since five. I am only here because of the boiler inspection.')],
              choice: { key: 'n7.clerk', prompt: 'The night clerk, and a boiler inspection nobody ordered', default: 'board', options: [
                { id: 'board', tag: 'rank', text: 'Bruce Wayne, Civic Trust board. I need the records annex for ten minutes.', effects: { standing: 1, suspicion: { reporter: 1 } }, lines: [v('clerk', 'Mr. Wayne! Of course. Sign here. And here. And, if you would not mind, here, that one is for my mother.')] },
                { id: 'charm', tag: 'charm', text: 'I left my umbrella in the annex in March. It has sentimental value.', effects: { suspicion: { reporter: -1 }, standing: -1 }, lines: [v('clerk', 'In March. And you came back for it in a dinner jacket, at night, in the snow. Rich people are a mystery to me, sir. Go on up.')] },
                { id: 'warn', tag: 'honest', text: 'There is no boiler inspection. Call the fire brigade, then go home.', effects: { city: 2, suspicion: { detective: 3 } }, lines: [v('clerk', 'No inspection? But they had a clipboard. Oh. Oh, they had a clipboard.')] },
              ] } },
            { id: 'pryce', site: 'n7HallSouth', text: 'Councillor Pryce is working late under the colonnade.', lines: [v('pryce', 'Wayne? You skipped your own gala to visit the Hall of Records. Either you are finally taking an interest, or you are lost.')],
              choice: { key: 'n7.pryce', prompt: 'The councillor wants to know why you are here', default: 'interest', options: [
                { id: 'interest', tag: 'act', text: 'An interest. The Foundation is thinking of funding the archive.', effects: { standing: 2 }, lines: [v('pryce', 'Funding the archive. Nobody funds the archive. Sit down, I have a list.')] },
                { id: 'sionis', tag: 'honest', text: 'I am looking for a company called Sionis Cold Holdings.', effects: { standing: 1, suspicion: { detective: 2 }, threads: { gordon: 0.2 } }, lines: [v('pryce', 'So am I. Its file was requested this afternoon by a boiler inspector. Does that strike you as normal? It did not strike me as normal.')] },
              ] } },
            { id: 'annex', site: 'n7HallNorth', text: 'The records annex window, north end of the steps.', lines: [g('bruce', 'Sionis Cold Holdings. Registered agent, directors, the lot. One folder.'), v('clerk', 'Mr. Wayne? Is the floor meant to be wet? It smells like a garage.')] },
          ],
          endLines: [g('alfred', 'That would be the forty cans, sir. I suggest Mr. Wayne leaves by the nearest shadow and somebody else comes back.')],
        },
        {
          id: 'n7HallRescue', type: 'freeing', text: 'City Hall is alight. Four people inside the cordon, one of them on the roof. Get them clear.', checkpoint: 'n7HallStreet', retry: true,
          timer: 60, bonus: 12, hold: 2.5,
          points: [
            { site: 'n7HallSteps', label: 'The night clerk', lines: [v('clerk', 'I signed him in! I signed the boiler man in! It is in the book!')] },
            { site: 'n7HallSouth', label: 'Councillor Pryce', lines: [v('pryce', 'I am going, I am going. I am taking the minutes with me. Somebody should have minutes of this.')] },
            { site: 'n7HallKerb', label: 'The archivist', lines: [v('archivist', 'Thirty years of filing. Alphabetical. It will burn in alphabetical order, I suppose.')] },
            { site: 'n7HallRoof', label: 'The cleaner on the roof', lines: [v('cleaner', 'I came up for a cigarette. I would like it noted that I did not light it.')] },
          ],
          lines: [g('oracle', 'Fire on the ground floor, north side, moving fast. Clerk, councillor, an archivist at the kerb, and a heat signature on the roof by the dome. About a minute before the stairwell goes.')],
          failTitle: 'THE STAIRWELL WENT',
          failLines: [g('gordon', 'Fire brigade pulled them out, barely. That was closer than I like. If you are doing it again, do it faster.')],
          doneLines: [g('oracle', 'Four out of four. And the men who lit it have not left. They are on the street with the rest of the cans.')],
        },
        {
          id: 'n7HallFight', type: 'fight', fight: 'hallSteps', text: 'The Burners are on the City Hall steps with the rest of the fuel. Stop them finishing the job.',
          lines: [v('burner', 'Boss said the whole building.'), v('burner', 'The whole building is on fire.'), v('burner', 'He said the WHOLE building, Kev. That bit is not on fire.')],
        },
        {
          id: 'n7HallScan', type: 'scan', text: 'Detective vision: who let them in?',
          points: [
            { site: 'n7HallSteps', lines: [g('oracle', 'The visitor book. "Boiler inspection, three persons", countersigned by the building manager at four this afternoon.')] },
            { site: 'n7HallNorth', lines: [g('oracle', 'The annex lock was not forced. It was opened with a key, and the key is still in it, on a Wolf Point Property Management fob.')] },
            { site: 'n7HallKerb', lines: [g('oracle', 'And the building manager\'s car, engine warm, with a Sionis parking permit on the dash. He let them in and waited to watch.'), g('batman', 'He can explain it to Gordon.')] },
          ],
          lines: [g('oracle', 'Before the fire brigade washes it all into the gutter: the visitor book, the annex door, the kerb.')],
        },
      ]),
    },
    // [m67] The Last Train: a scripted police pursuit out of City Hall, then the fuel car on the El.
    {
      id: 'm7El', title: 'The Last Train', checkpoint: 'n7HallStreet', rewards: ['xp:200'],
      steps: quiet([
        {
          id: 'n7HallHeat', type: 'escape', level: 2, at: 'n7HallStreet', hide: 'n7HideRoof', mercy: 120, text: 'A man in a cape, leaving a burning City Hall. The GCPD have questions. Lose them over the rooftops.',
          lines: [
            v('dispatch', 'All units, City Hall: arson in progress, suspect on scene, described as large, dark and wearing a cape. Yes. Him.'),
            g('gordon', 'Gordon. The Mayor is watching this on television and wants an arrest. I cannot call them off with the cameras here. Get high and get gone.'),
          ],
          hintLines: [g('oracle', 'Cruisers are for roads. Go up: the tall roofs west of City Hall. Keep moving until they lose you, then keep still.')],
          doneLines: [g('gordon', 'They have lost you. I have told the Mayor it was a weather balloon. He asked which weather. I said the bad kind.')],
          caughtLines: [g('gordon', 'My own officers had you against a wall. I told them it was a fancy dress arsonist. Go again, and go up this time.')],
          mercyLines: [g('gordon', 'Building manager just confessed on the steps, loudly, to a camera. You are clear. For tonight.')],
        },
        {
          id: 'n7ToEl', text: 'Something is loose on the El. The City Hall station, on the viaduct.', site: 'n7ElStart', radius: 8,
          nudge: g('oracle', 'The El viaduct, one block west of City Hall. Get up on the deck at the station.'),
          lines: [
            g('oracle', 'While everyone was looking at City Hall: a tank car full of his aviation fuel has been shunted onto the El loop with nobody driving it. It is rolling south toward the river and Riverside station is full of people.'),
            g('oracle', 'I can stop it at Riverside if somebody resets three signal boxes on the platform by hand. That somebody has to get there along the track.'),
          ],
        },
        {
          id: 'n7ElRun', type: 'traverse', text: 'Run the El viaduct south, then west along the river leg, ahead of the fuel car. Mind the trains.',
          gates: ['n7El1', 'n7El2', 'n7El3', 'n7El4', 'n7El5'], timer: 34, bonus: 7,
          failTitle: 'IT IS AHEAD OF YOU', failText: 'The fuel car passed you. Oracle has held it at a red signal: from City Hall station, again.',
          failLines: [g('oracle', 'I bought you one red signal. It will not hold twice. Well. It might hold twice.')],
          lines: [g('oracle', 'South along the deck, round the corner at the river, west to Riverside. Stay between the rails and off the ones that hum.')],
        },
        {
          id: 'n7Signals', type: 'hack', text: 'Three signal boxes on the Riverside platform. Hack them, or throw each by hand, before the fuel car arrives.', checkpoint: 'n7ElStart', retry: true,
          terminals: [
            { site: 'n7SignalA', label: 'East signal box', lines: [g('oracle', 'One. Points are moving.')] },
            { site: 'n7SignalB', label: 'Platform signal box', lines: [g('oracle', 'Two. It is slowing. It is still a tank of jet fuel, but it is a slower one.')] },
            { site: 'n7SignalC', label: 'West signal box' },
          ],
          hold: 5, timer: 60,
          lines: [g('oracle', 'Three boxes along the platform. The hacking device does each from the far end. By hand you have to stand at it. Sixty seconds.')],
          failLines: [g('oracle', 'It ran the platform. I have dumped the line power, it is coasting back. Again, from the station.')],
          doneLines: [
            g('oracle', 'Stopped. Four metres short of a platform full of commuters, who are filming it.'),
            g('gordon', 'The river walk, east end. The fire jumped from City Hall to the bridges and I have workers cut off down there.'),
          ],
        },
      ]),
    },
    {
      id: 'm7Bridges', title: 'River Run', checkpoint: 'n7Bridge1', rewards: ['xp:250'],
      steps: [
        {
          id: 'n7Bridges', type: 'traverse', text: 'The fire is jumping the river bridges. Get across ahead of it: three bridges, west.',
          gates: ['n7Bridge1', 'n7Bridge2', 'n7Bridge3'], timer: 70, bonus: 12,
          failTitle: 'CUT OFF', failText: 'The fire took the bridge. Back to the first one.',
          failLines: [g('alfred', 'Beaten by a fire, sir. In the snow. I shall frame this.')],
          lines: [g('oracle', 'Workers trapped on the river walk at the far end. Three bridges, the fire is going the same way. Race it.')],
          interrupts: [{ id: 'n7Workers', at: 'n7Workers', radius: 24, fight: 'workers', xp: 90, label: 'Optional: the river walk crew is safe', lines: [v('dispatch', 'Any unit on the river walk: a road crew is cornered by three men with flamethrowers. They have a very small fire extinguisher.')] }],
        },
      ],
    },
    // [m67] Old Money: tail the paymaster, and the wholesaler he reports to.
    {
      id: 'm7Lounge', title: 'Old Money', checkpoint: 'n7Bridge3', rewards: ['xp:300'],
      steps: quiet([
        {
          id: 'n7TailBoard', type: 'board', text: 'The Batmobile is on the river street by the west bridge. A grey sedan has been collecting from every Burner crew tonight.', site: 'n7TailCar', talk: 'over',
          lines: [
            g('oracle', 'The road crew say a grey sedan came by before the fire did, handing out envelopes. Same sedan on four traffic cameras tonight, one for each crew. He is the paymaster.'),
            g('oracle', 'Do not stop him. Follow him. I want to know who a paymaster reports to.'),
          ],
        },
        {
          id: 'n7Tail', type: 'tail', text: 'Tail the grey sedan: about three car lengths back. Too close and he sees you, too far and he is gone.', from: 'n7TailFrom', model: 'sedan_deco', nodes: 10,
          boardText: 'Back in the Batmobile: the paymaster is on wheels.',
          lines: [g('oracle', 'Grey sedan pulling out ahead of you. No lights, no siren, no ramming. Tonight the car is a taxi with opinions.')],
          spottedLines: [g('oracle', 'He made you. It is a matt black tank, I am amazed it took him that long. I have him on a camera two blocks on: further back this time.'), g('alfred', 'Might I suggest, sir, that one does not tailgate while tailing.')],
          lostLines: [g('oracle', 'Lost him. Traffic camera has him again, one block ahead of you. Closer than that, further than last time.')],
          doneLines: [g('oracle', 'He has parked. On Gotham Mile, outside a nightclub with a penguin on the sign and a court order on the door. Oh, I know where this is going.')],
        },
        {
          id: 'n7ToLounge', text: 'The Iceberg Lounge, on the Mile. Closed by court order for a month. The lights are on.', site: 'n7LoungeFront', radius: 16,
          nudge: g('oracle', 'Gotham Mile, north of the Loop. The Iceberg Lounge. You have been before. You broke most of it.'),
          lines: [g('oracle', 'The Penguin made bail on Thursday. A man with a cold storage business, a shipping licence and no scruples: of course he is the one selling jet fuel.')],
          banter: [g('alfred', 'I did say he would be out by Thursday, sir. I take no pleasure in it. A little, perhaps.')],
        },
        {
          id: 'n7LoungeUp', text: 'He does business on the roof. Up.', site: 'n7LoungeRoof', radius: 8, onFoot: true,
          lines: [v('penguin', 'Is that an engine? Gentlemen, is that HIS engine? Umbrellas! And somebody hide the ledger!')],
        },
        {
          id: 'n7Penguin', type: 'boss', boss: 'penguin', text: 'The Penguin, again. Bodyguards first; a gadget knocks the umbrella aside.', checkpoint: 'n7LoungeRoof',
          lines: [g('oracle', 'Same umbrella, same tricks, new bodyguards. You have more on your belt than you did last time. Use it.')],
        },
        {
          id: 'n7FuelBook', type: 'collect', item: 'n7FuelBook', site: 'n7LoungeRoof', radius: 4, text: 'The fuel ledger, in the ice bucket.',
          lines: [g('oracle', 'Seven tankers. Six already burned or parked. The seventh is carrying the reserve for his jetpack: stop that one and he has ten minutes of flying left in the world.')],
        },
        {
          id: 'n7LoungeBoard', type: 'board', text: 'Back to the car. The convoy is on Lakeshore Drive.', site: 'n7LoungeCar', talk: 'over',
          lines: [g('alfred', 'I have brought the car round to the front, sir. The doorman tried to valet it. He is resting now.')],
        },
      ]),
    },
    {
      id: 'm7Convoy', title: 'The Convoy', checkpoint: 'n7Car', rewards: ['xp:300'],
      steps: [
        {
          id: 'n7Board', type: 'board', text: 'The Batmobile at the west bridge. The convoy is on Lakeshore Drive.', site: 'n7Car', talk: 'over',
          lines: [g('alfred', 'The car has the new lining fitted. Lucius asked me to tell you it is fireproof, not foolproof.')],
        },
        {
          id: 'n7Convoy', type: 'battle', text: 'His armoured convoy on Lakeshore Drive. Shock cannon: take out the escort drones.', site: 'n7ConvoySite', drones: 6,
          lines: [g('oracle', 'Six armoured escorts round the tankers, remote turrets. They will shoot first. Dodge, then shoot back.')],
        },
        {
          id: 'n7Chase', type: 'chase', text: 'The last tanker is running for the loading ramp. Ram it three times.', site: 'n7ConvoySite',
          van: { type: 'box_truck', color: 0xd8b23a, toast: 'Stop the fuel tanker. Ram it three times!', label: 'TANKER' },
          path: [{ x: 345, z: -160 }, { x: 345, z: 0 }, { x: 345, z: -280 }, { x: 345, z: -420 }],
          lines: [g('oracle', 'One tanker left and he needs every drop of it. Do not let it reach him.')],
        },
      ],
    },
    {
      id: 'm7Firefly', title: 'Firefly', checkpoint: 'n7DriveBoard', rewards: ['xp:500', 'lore:fireflyFile'],
      steps: [
        {
          id: 'n7ToDrive', type: 'board', text: 'He is circling over Lakeshore Drive. Get the car onto the drive.', site: 'n7DriveBoard', talk: 'over',
          lines: [g('oracle', 'He has seen the tanker go. He is coming for the car himself. Good. That is where you want him.')],
        },
        {
          id: 'n7Boss', type: 'boss', boss: 'firefly', vehicle: true, text: 'Ram him when he swoops low. Dodge the firebombs. Drive through his fuel drones.', checkpoint: 'n7DriveBoard', villain: 'firefly',
          lines: [g('oracle', 'When he dives, the ring shows his line. Be on it, fast. When he is up high, keep moving, and not in a straight line.')],
        },
      ],
    },
    {
      id: 'm7After', title: 'Ashes', checkpoint: 'n7DriveBoard', rewards: ['xp:150'],
      steps: [
        {
          id: 'n7Hydrant', text: 'GCPD has him. Meet Gordon by the viaduct.', site: 'n7Hydrant', radius: 10,
          interrupts: [{ id: 'n7Looters', at: 'n7ConvoySite', radius: 24, fight: 'n7Looters', xp: 80, label: "Optional: the looters are down", lines: [{ speaker: 'oracle', portrait: 'oracle', text: "Looters behind the convoy line, taking what the fire left. Seven. GCPD is busy with the fire." }] }], // [balance]
          lines: [g('gordon', 'Firefly is in a van, the convoy is in a tow yard and Lakeshore Drive is a skating rink. A good night, by our standards.')],
          calls: [{
            id: 'alibi', from: 'alfred', after: 5, timeout: 12, default: 'flu',
            lines: [g('alfred', 'Sir, the Foundation wants a statement on why its host left his own gala. I need an alibi I can repeat with a straight face.')],
            prompt: 'Alfred needs an alibi for the gala',
            options: [
              { id: 'flu', tag: 'cover', text: 'Flu. Sudden and dramatic.', effects: { standing: -1, suspicion: { reporter: 1 } }, lines: [g('alfred', 'Flu. I shall cough down the telephone myself.')] },
              { id: 'mara', tag: 'cover', text: 'Supper with Mara. True, if she forgives me.', effects: { suspicion: { reporter: -2 }, threads: { love: -0.2 } }, lines: [g('alfred', 'Supper with Miss Quell. I shall ask her to lie for you. I suspect she will charge.')] },
              { id: 'truthish', tag: 'honest', text: 'Say he had a family emergency. It is not untrue.', effects: { threads: { alfred: 0.4 } }, lines: [g('alfred', 'A family emergency. Yes. I suppose that is exactly what this is.')] },
            ],
          }],
        },
        {
          id: 'n7End', type: 'nightEnd', scene: 'n7End', text: 'Lakeshore Drive is a skating rink. Wolf Point is lit.',
          lines: [g('oracle', 'Everything burned tonight pointed at one building. Wolf Point. And one more thing: the doctor, the frost, the garden and the fire. He paid them all to study you. Your routes, your tools, your habits.'), g('batman', 'Then tomorrow he gets to see them up close.')],
        },
      ],
    },
  ],
};
