// Night Nine, "The Last Laugh" (Act V, Arkham): the finale. The Joker walked out of Arkham on the
// door Black Mask paid for, took Amusement Mile and then the island back. A rematch that remixes
// Night One (the clowns, the funhouse, the van, the buzzer floor) with every trick learned since:
// a wing of fear gas, a greenhouse of dazed inmates, a riddle left in a cell, a frozen clock tower,
// and a dual boss in the yard built for two players (solo, the ally takes Harley). The ending's
// tone comes from the double life: who is still standing with Bruce (src/story/lifeSteps.js
// endingFor: family, partners, exposed, alone). After it: credits, free roam, replay, NG+.
// New role this night: the heavy (tutorial on the pier). Format: docs/design/story-format.md.
import { g, v, B, face, recap } from './common.js';

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
};

const FIGHTS = {
  pier: { site: 'n9Wheel', radius: 15, gang: 'joker', act: 5, district: 'pier', waves: [{ budget: 7, ring: 8, lead: 'heavy' }, { budget: 10, ring: 8, lead: 'knife' }] },
  gate: { site: 'n9Gate', radius: 14, gang: 'joker', act: 5, district: 'arkham', waves: [{ budget: 9, ring: 8, lead: 'lieutenant' }, { budget: 11, ring: 9, lead: 'ninja' }] },
  gateFallen: { site: 'n9Gate', radius: 14, gang: 'joker', act: 5, district: 'arkham', waves: [{ budget: 10, ring: 8, lead: 'lieutenant' }, { budget: 12, ring: 9, lead: 'ninja' }, { budget: 12, ring: 9, lead: 'heavy' }] },
  greenhouse: { site: 'n9Greenhouse', radius: 12, gang: 'ivy', act: 2, district: 'arkham', waves: [[{ type: 'grunt', dx: -4, dz: 2 }, { type: 'grunt', dx: 3, dz: 3 }, { type: 'grunt', dx: 0, dz: -4 }, { type: 'grunt', dx: 5, dz: -2 }, { type: 'grunt', dx: -5, dz: -3 }]] },
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

export default {
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
    {
      id: 'm9Gate', title: 'The Island Gate', checkpoint: 'n9Causeway', rewards: ['xp:200'],
      steps: [
        {
          id: 'n9ToGate', text: 'Across the causeway to the Arkham gate.', site: 'n9Gate', radius: 14,
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
