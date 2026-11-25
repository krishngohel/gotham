// Night Seven, "Slow Burn" (Act IV, The Cold Front). The first snow, and someone is setting fire to
// it. A flying arsonist and his Burners are torching filing offices across Lower Gotham with an
// armoured fuel convoy behind them. The night opens at the Wayne Foundation's Planetarium gala,
// with Bruce on the guest list and the signal over the lake. Verbs: talk (as Bruce), the
// gala-or-signal choice, a glide across the city with a date texting you, the sniper's tutorial
// under the double-decker street, detective work on the burnt tankers, a predator room at the
// loading dock, a run over the river bridges ahead of the fire, the convoy in battle mode on
// Lakeshore Drive, a tanker chase, the twist, and a boss fought from the Batmobile.
// New role this night: the sniper (tutorial on the lower deck). Format: docs/design/story-format.md.
import { g, v, B, face, recap } from './common.js';
import { W, route } from '../rooms.js';

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
};

const FIGHTS = {
  lowerDeck: { site: 'n7Lower', radius: 15, gang: 'firefly', act: 4, district: 'lowerGotham', waves: [{ budget: 6, ring: 8, lead: 'sniper' }, { budget: 9, ring: 8, lead: 'ninja' }] },
  lowerDeckBig: { site: 'n7Lower', radius: 15, gang: 'firefly', act: 4, district: 'lowerGotham', waves: [{ budget: 7, ring: 8, lead: 'sniper' }, { budget: 10, ring: 8, lead: 'ninja' }, { budget: 9, ring: 8, add: [{ type: 'brute', dx: 0, dz: 7 }] }] },
  dock: { stealth: 'dockRoom' },
  workers: { site: 'n7Workers', radius: 11, gang: 'firefly', act: 3, district: 'lowerGotham', waves: [{ budget: 4, ring: 5 }] },
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
    {
      id: 'm7Convoy', title: 'The Convoy', checkpoint: 'n7Car', rewards: ['xp:300'],
      steps: [
        {
          id: 'n7Board', type: 'board', text: 'The Batmobile at the west bridge. The convoy is on Lakeshore Drive.', site: 'n7Car', talk: 'over',
          lines: [g('alfred', 'The car is at the bridge with the new lining fitted. Lucius asked me to tell you it is fireproof, not foolproof.')],
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
