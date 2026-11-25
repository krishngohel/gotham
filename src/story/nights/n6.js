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
import { g, v, B, face, recap } from './common.js';
import { W, route } from '../rooms.js';

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
};

const FIGHTS = {
  greenhouse: { site: 'n6Greenhouse', radius: 12, gang: 'ivy', act: 4, district: 'bristol', waves: [{ budget: 5, ring: 6 }] },
  fountain: { site: 'n6Fountain', radius: 14, gang: 'ivy', act: 4, district: 'lakefront', waves: [{ budget: 5, ring: 7, lead: 'ninja' }, { budget: 8, ring: 7, lead: 'shield' }] },
  // Spore-dazed commuters: the rehearsal for the boss (stun, never strike). They are plain goons in
  // the combat code; the step's `thralls` flag makes the story count every punch that lands on one.
  commuters: { site: 'n6Commuters', radius: 13, gang: 'ivy', act: 2, district: 'lakefront', waves: [[{ type: 'grunt', dx: -4, dz: 2 }, { type: 'grunt', dx: 3, dz: 3 }, { type: 'grunt', dx: 0, dz: -4 }, { type: 'grunt', dx: 5, dz: -2 }], [{ type: 'grunt', dx: -5, dz: -3 }, { type: 'grunt', dx: 4, dz: 5 }, { type: 'grunt', dx: -2, dz: 6 }]] },
  shell: { stealth: 'shellRoom' },
  mugging: { site: 'n6ParkGate', radius: 10, gang: 'ivy', act: 3, district: 'lakefront', waves: [{ budget: 3, ring: 4 }] },
  manorVines: { site: 'n6Gates', radius: 13, gang: 'ivy', act: 4, district: 'bristol', waves: [{ budget: 7, ring: 7, lead: 'brute' }, { budget: 8, ring: 7, lead: 'ninja' }] },
  manorQuiet: { site: 'n6Gates', radius: 12, gang: 'ivy', act: 4, district: 'bristol', waves: [{ budget: 4, ring: 6 }] },
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
          lines: [g('oracle', 'Six people standing in a ring round the Mirror sculpture, swaying. Their heart rates say asleep. Their feet say otherwise.')],
        },
        {
          id: 'n6Commuters', type: 'fight', fight: 'commuters', thralls: true, text: 'They are civilians, spore-dazed. Cape-stun them awake. Do not punch them.',
          tip: { title: 'HOLD BACK', text: 'These are commuters, not goons. Cape stun, a batarang or a counter shakes the spores loose. Every punch lands on someone who did nothing wrong, and the city will hear about it.' },
          lines: [v('commuter', 'Must... water... the... begonias...'), g('batman', 'Sir. Wake up.')],
        },
      ],
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
          branches: { bruce: 'n6Board', batman: 'n6Board' },
        },
      ],
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
