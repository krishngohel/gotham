// Night Four, "The Hollow Men" (Act III, The Underside). The burlap doctor tests a fear toxin on
// the Narrows; the night is about stealth and nerve: an investigation in the street market, the
// first medics in a fight, a rooftop run ahead of a gas cloud, a predator room in the Rookery, his
// "ambulance" through the island's streets, a walk down Crime Alley through his toxin with
// Nightwing at the end of it, the climb up the Stack and a stealth boss on its roof.
// New role this night: the medic (tutorial beat on the market fight). Format:
// docs/design/story-format.md. Every site below was checked against the live collision.
import { titleCard } from '../../ui/comicArt.js';
import { scarecrowPanel } from '../../bosses/defs/scarecrowArt.js';
import { W, route } from '../rooms.js';
import { recap } from './common.js'; // [story2]

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const v = (speaker, text) => ({ speaker, portrait: 'radio', text }); // villains, goons, civilians
const B = (text, x = 50, y = 6, extra = {}) => ({ text, x, y, w: 70, ...extra });

const SITES = {
  n4Car: { x: -370, y: 0.15, z: -400, yaw: Math.PI },
  n4ScanA: { x: -344, y: 0.2, z: -336 },
  n4ScanB: { x: -332, y: 0.2, z: -322 },
  n4ScanC: { x: -340, y: 0.2, z: -316 },
  n4RoofA: { x: -328, y: 24, z: -344 },
  n4RoofB: { x: -334, y: 24, z: -380 },
  n4RoofC: { x: -334, y: 24, z: -404 },
  n4RoofD: { x: -334, y: 14, z: -434 },
  n4Rookery: { x: -340, y: 0, z: -448 },
  n4RookeryEntry: { x: -350, y: 20.4, z: -454 },
  n4Canister: { x: -340, y: 0, z: -462 },
  n4AlleyMouth: { x: -490, y: 0, z: -425 },
  n4AlleyGoal: { x: -490, y: 0, z: -330 },
  n4AlleyFight: { x: -492, y: 0, z: -318 },
  n4StackBase: { x: -375, y: 0, z: -445 },
  n4ShackEast: { x: -383, y: 29.8, z: -443 },
  n4ShackSouth: { x: -399, y: 32.8, z: -459 },
  stackTopEntry: { x: -389, y: 36, z: -435 },
  scarecrowArena: { x: -397, y: 36, z: -445 },
  scarecrowStart: { x: -405, y: 36, z: -441 },
  n4Sample: { x: -401, y: 36, z: -437 },
  n4MuggingSpot: { x: -421, y: 0, z: -450 },
  // [story2] the clinic donor dinner and the hostage at the boxing gym, at the same hour
  n4Clinic: { x: -319, y: 0.15, z: -505 },
  n4ClinicBed: { x: -312, y: 0.15, z: -500 },
  n4ClinicNurse: { x: -326, y: 0.15, z: -500 },
  n4Gym: { x: -412, y: 0.15, z: -387 },
  n4Ostrow: { x: -340, y: 0, z: -330 },
  n4Roof: { x: -328, y: 24, z: -344 },
};

const ROOMS = {
  rookeryRoom: {
    id: 'rookeryRoom', site: 'n4Rookery', entry: 'n4RookeryEntry', radius: 18, gang: 'scarecrow',
    lights: [{ x: -340, y: 3.2, z: -446, r: 5, post: true }, { x: -340, y: 3.2, z: -461, r: 3.5, post: true }],
    cover: [{ x: -346, y: 0, z: -449.6, w: 1.4, d: 1.2, h: 1.3 }, { x: -333, y: 0, z: -449.6, w: 1.4, d: 1.2, h: 1.3 }, { x: -336, y: 0, z: -447.6, w: 1.2, d: 1.0, h: 1.1 }],
    huddle: { x: -340, y: 0, z: -446 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(-330, 13.6, -464, 2.5, -Math.PI / 2), W(-330, 13.6, -453, 2.5, -Math.PI / 2)) },
      { type: 'grunt', route: route('pingpong', W(-348, 0, -446, 2, 0), W(-330, 0, -446, 2, Math.PI)) },
      { type: 'medic', route: route('pingpong', W(-340, 0, -466, 2, Math.PI), W(-340, 0, -452, 3, 0)) },
      { type: 'pistol', route: route('pingpong', W(-332, 0, -444, 1.5, Math.PI), W(-346, 0, -444, 1.5, 0)) },
    ],
  },
};

const FIGHTS = {
  // The market: the medic's tutorial (pinned into the first wave), then a fuller squad.
  marketHollow: { site: 'narrowsMarket', radius: 13, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 5, ring: 6, lead: 'medic' }, { budget: 7, ring: 7, lead: 'medic' }] },
  rookery: { stealth: 'rookeryRoom' },
  // Crime Alley is nine metres wide: the squad comes down it from both ends, not in a ring.
  alleyHollow: { site: 'n4AlleyFight', radius: 16, gang: 'scarecrow', act: 3, district: 'parkRow', waves: [{ budget: 7, spots: [[0, -8], [0, 8], [-2.5, -4], [2.5, 4], [-2.5, 5], [2.5, -5]] }, { budget: 9, lead: 'pistol', spots: [[0, 10], [0, -10], [-2.5, 7], [2.5, -7], [-2.5, -2], [2.5, 2]] }] },
  roadHollow: { site: 'n4MuggingSpot', radius: 10, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 3, ring: 4 }] },
  // [story2]
  gym: { site: 'n4Gym', radius: 12, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 6, ring: 6, lead: 'pistol' }, { budget: 7, ring: 7, lead: 'medic' }] },
  stackGuard: { site: 'n4StackBase', radius: 12, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 7, ring: 7, lead: 'pistol' }] },
};

const SCENES = {
  // [story2]
  n4Recap: (stage) => recap(stage, {
    title: 'Know-it-all',
    panels: [
      'The Riddler mapped Batman\'s routes and lost on live television. The proxy votes for the Narrows land are back with the city.',
      { shot: { cam: [10, 56, -486], look: [2, 48, -510] }, caption: 'A green question mark is still drying on Wayne Tower.' },
      { shot: { cam: [-320, 30, -380], look: [-340, 10, -440] }, caption: 'Tonight the fog in the Narrows is not fog.' },
    ],
  }),
  n4Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [-492, 4.5, -303], look: [-492, 2.5, -340], hero: null }), caption: 'Crime Alley. Nobody in Park Row calls it anything else.' },
      { img: titleCard('KSSHK', 'channel three', { bg: '#1d2418' }), balloons: [B("B? There's someone in the alley. Two people. They keep falling and I can't get to them in time. I can't...", 50, 8, { w: 80 })] },
      { img: scarecrowPanel('gloat'), balloons: [B('Your little bird flew into my fog. Come and fetch him. Mind the dark. It bites.', 50, 6, { w: 80 })] },
    ],
  }],
  scarecrowIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [-378, 46, -424], look: [-397, 37, -447], hero: { at: [-389, 36, -435], yaw: Math.PI * 1.15, anim: 'Idle_Loop' } }), caption: 'The roof of the Stack. Thirty-six metres of bad plumbing and worse decisions.' },
      { img: scarecrowPanel('calm'), balloons: [B('Welcome to my consulting room. The light is the examination. The dark is the treatment.', 50, 6, { w: 80 })] },
    ],
  }],
  scarecrowOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: scarecrowPanel('beaten'), balloons: [B('You were afraid. I measured it. You were afraid the whole time.', 50, 6, { w: 80 })] },
      { img: stage.shot({ cam: [-386, 40, -430], look: [-397, 36, -445], hero: { at: [-395, 36, -440], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'Afraid, yes. Still here. That is the part he never puts in his notes.', captionPos: 'bottom' },
    ],
  }],
};

export default {
  id: 'n4', act: 'act3', number: 4, actNumber: 3,
  title: 'Night Four: The Hollow Men',
  blurb: 'A fear toxin is loose in the Narrows, and the doctor behind it is watching the results from the top of the Stack.',
  villain: 'scarecrow', gang: 'scarecrow',
  districts: ['narrows', 'parkRow'],
  timeOfDay: 23.5, weather: 'fog',
  start: 'narrowsFastTravel',
  day: {
    hook: 'day.n4',
    context: { day: 4, appointments: [{ id: 'clinicOpening', at: 15, place: 'parkRowMission', title: 'The Park Row clinic opening' }], lead: 'The clinic nurse mentions patients from the Narrows screaming at things nobody else can see.' },
    fallback: [
      g('alfred', 'The clinic opened without you, sir. I cut the ribbon. It was a very nice ribbon. I have kept the scissors as evidence.'),
      g('alfred', 'The nurse asked after you. Also after six patients from the Narrows who arrived terrified of their own coats. That one seemed more your department.'),
    ],
  },
  sites: SITES,
  rooms: ROOMS,
  fights: FIGHTS,
  scenes: SCENES,
  missions: [
    {
      id: 'm4Fog', title: 'The Fog Comes In', checkpoint: 'narrowsFastTravel', rewards: ['xp:150'],
      steps: [
        { id: 'n4Recap', type: 'cutscene', scene: 'n4Recap' },
        {
          id: 'n4Start', text: 'Head to the Narrows El station. The fog is wrong tonight.', site: 'narrowsFastTravel', radius: 12,
          title: { text: 'ACT THREE: THE UNDERSIDE', sub: 'Night Four: The Hollow Men' },
          nudge: g('oracle', 'Narrows station, west across the North Branch. Follow the marker, and maybe hold your breath.'),
          lines: [
            g('gordon', 'Gordon. Every ambulance in the city is on the Narrows bridge, and every one of them is full of people screaming at nothing.'),
            g('oracle', "Oracle here. Air sensors on the island are reading something sweet and chemical. It isn't on any list I have, which means somebody cooked it."),
            g('gordon', 'They all describe the same thing. A man with a sack for a face. I would like that to be a coincidence.'),
          ],
          banter: [
            v('dispatch', 'All units: a caller in the Narrows reports her laundry is staring at her. Dispatch has noted the laundry.'),
            g('alfred', 'The fog index tonight is, I believe, "pea soup with ambitions". Do keep the cowl on.'),
          ],
        },
        {
          id: 'n4Scan', type: 'scan', text: 'Scan the street market for where the toxin came from. Detective vision.',
          points: [
            { site: 'n4ScanA', lines: [g('oracle', 'Burlap fibres caught on the stall hinge. Hand-stitched. Somebody sews his own wardrobe.')] },
            { site: 'n4ScanB', lines: [g('oracle', 'A spent canister. Pressure-fed, timed release. The label says "pest control". The pest is us.')] },
            { site: 'n4ScanC', lines: [g('oracle', "Boot prints, and a medic's kit dragged through the slush. His crew carries first aid. That is new, and not friendly.")] },
          ],
          lines: [g('oracle', 'Start at the market. Detective vision will light up anything chemical. Stand by each one until it reads.')],
          optional: [{ id: 'n4ClinicRoof', title: 'Optional: check the clinic roof vents for canisters', site: { x: -330, y: 13, z: -505 }, radius: 5, xp: 60, done: 'Clinic vents clean. The patients inside can breathe easy.', lines: [g('alfred', 'Clean vents. The clinic will sleep tonight, which is more than can be said for you.')] }],
        },
      ],
    },
    {
      id: 'm4Market', title: 'House Calls', checkpoint: 'narrowsMarket', rewards: ['lore:hollowMen', 'gadget:glue'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n4MarketFight', type: 'fight', fight: 'marketHollow', text: 'Hollow Men in the market. Take the medic down first.',
          tip: { title: 'NEW: THE MEDIC', text: 'He gets knocked-out goons back on their feet. Take him first, or hit him while he kneels to stop the revive.' },
          lines: [
            v('hollowMan', 'Doc says the Bat is just a feeling. Doc says feelings pass.'),
            v('hollowMan', "Then why's the feeling coming down the street at us?"),
            g('oracle', 'One of them has a medkit. If he reaches a man on the floor, that man gets up again. Medic first.'),
          ],
        },
      ],
    },
    {
      id: 'm4Highway', title: 'The Rooftop Highway', checkpoint: 'narrowsMarket', rewards: ['xp:200', 'gadget:bolas'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n4Highway', type: 'traverse', text: 'The gas is rising off the market. Outrun it across the rooftops to the Rookery.',
          gates: ['n4RoofA', 'n4RoofB', 'n4RoofC', 'n4RoofD', 'n4RookeryEntry'], timer: 70, bonus: 6,
          failTitle: 'THE FOG CAUGHT UP', failText: 'Back to the first roof and go again.',
          failLines: [g('alfred', 'The fog was faster, sir. In fairness, it does not have a cape to manage.')],
          lines: [
            g('oracle', 'The canisters they dropped are venting. That cloud is climbing, and it is drifting north the same way you need to go.'),
            g('oracle', 'Roofs here are three to six metres apart. Grapple, glide, keep moving. The Rookery is at the end of the line.'),
          ],
        },
      ],
    },
    {
      id: 'm4Rookery', title: 'The Rookery', checkpoint: 'n4RookeryEntry', rewards: ['upgrade:rebreatherFilters'], // [fix1] gadget reward
      steps: [
        {
          id: 'n4RookeryRoom', type: 'fight', fight: 'rookery', text: 'The Rookery courtyard. Four of his crew, one on the roof. Take them silently.',
          tutorial: ['crouch', 'silent'],
          lines: [
            g('oracle', 'That courtyard is where he fills the canisters. Rifle on the east roof, a pistol and a medic below.'),
            g('alfred', "Quietly, sir. If one of them shouts, the rest will panic, and panicked men with chemicals are nobody's idea of a pleasant evening."),
            v('hollowMan', 'Do you ever think the masks make it worse? Like, we scare people, sure. But we also scare us.'),
            v('hollowMan', 'Every time I catch my reflection I lose a year.'),
          ],
        },
        {
          id: 'n4Canister', type: 'collect', item: 'n4Canister', site: 'n4Canister', radius: 3, text: 'Grab a sealed canister for the lab.',
          lines: [g('oracle', 'Bag one. If I can read the formula, the hospitals can stop guessing.')],
        },
      ],
    },
    {
      id: 'm4Ambulance', title: 'Wrong Ambulance', checkpoint: 'n4Car', rewards: ['xp:250'],
      steps: [
        {
          id: 'n4Board', type: 'board', text: 'Get to the Batmobile on the channel street.', site: 'n4Car', talk: 'over',
          nudge: g('alfred', 'The car is on the street west of the Rookery. It has been waiting very patiently. I had a word with it.'),
          lines: [
            g('oracle', 'Problem. A van painted like an ambulance just left the Rookery with the rest of the canisters. It is circling the island, venting as it goes.'),
            g('gordon', 'My people waved it through twice. It has a siren. It has a red cross. It has a man in a sack driving it.'),
          ],
        },
        {
          id: 'n4Chase', type: 'chase', text: 'Ram the fake ambulance three times before it gasses the whole island.', site: 'n4Car',
          path: [{ x: -370, z: -479 }, { x: -310, z: -479 }, { x: -310, z: -359 }, { x: -370, z: -359 }],
          // [story2] its own quarry (the fake ambulance), not the Joker's van
          van: { type: 'ambulance', toast: 'Stop the fake ambulance. Ram it three times!', label: 'AMBULANCE' },
          lines: [g('alfred', 'Ambulances are for helping people, sir. This one has forfeited the courtesy.')],
        },
      ],
    },
    // [story2] Same block, different coat: the Narrows clinic's donor dinner wants Bruce Wayne at the
    // same hour a hostage is taken at the boxing gym. And Detective Ostrow walks into the scene.
    {
      id: 'm4Clinic', title: 'Same Block, Different Coat', checkpoint: 'n4Car', rewards: ['xp:200'],
      steps: [
        {
          id: 'n4Dilemma', type: 'dilemma', key: 'n4.clinic', text: 'The clinic donor dinner wants Bruce (gold). Hollow Men have a hostage at the boxing gym.',
          timer: 50, heading: 'TWO PLACES AT ONCE',
          card: 'The Narrows clinic\'s donor dinner (gold): Bruce promised, and the nurse there is the one whose brother you fought on Night Two. Or the boxing gym, where they are holding an off duty officer.',
          bruce: { site: 'n4Clinic', radius: 6, label: 'The clinic dinner', lines: [g('alfred', 'Your suit is in the car, sir. The gym is Gordon\'s now. He knows.')],
            miss: { effects: { standing: -4, threads: { alfred: -0.2 } }, lines: [v('ines', 'Voicemail for Mr. Wayne: the dinner went fine without you. Tommy asked if you were real. I said I was starting to wonder.')] } },
          batman: { site: 'n4Gym', radius: 12, label: 'The hostage', lines: [g('batman', 'Alfred. Send my apologies to the clinic.')],
            miss: { effects: { city: -5, threads: { gordon: -0.3 }, flags: { officerHurt: true } }, lines: [g('gordon', 'The officer at the gym. They hurt him before my people got in. He will live. He wants to know where you were. So do I.')] } },
          both: { effects: { standing: 1 }, lines: [g('alfred', 'A dinner kept and a hostage freed. I may take up religion.')] },
          branches: { bruce: 'n4ClinicVisit', batman: 'n4GymFight', both: 'n4GymFight' },
        },
        {
          id: 'n4ClinicVisit', type: 'civvy', outfit: 'suit', text: 'The clinic. You promised.', next: 'n4Ostrow',
          card: 'Bruce Wayne at the clinic he paid for. The man in bed four is a goon Batman put there. His sister is the nurse.',
          beats: [
            { id: 'nurse', site: 'n4ClinicNurse', text: 'Ines Barro, the night nurse.', lines: [v('ines', 'Mr. Wayne. You came. My brother is in bed four. Someone broke his jaw on Gotham Mile. He will not say who. He does not need to.')],
              choice: { key: 'n4.ines', prompt: 'She is watching your face', default: 'listen', options: [
                { id: 'listen', tag: 'honest', text: 'Listen. Ask what the clinic needs.', effects: { threads: { alfred: 0.2 }, standing: 2, city: 1 }, lines: [v('ines', 'Beds. Nights. People who do not hit my brother. Two out of three, maybe.')] },
                { id: 'defend', tag: 'risky', text: 'Say the man who did it was probably stopping something worse.', effects: { suspicion: { reporter: 2 }, city: -1 }, lines: [v('ines', 'Probably. Everyone in this city is probably stopping something worse.')] },
              ] } },
            { id: 'bed', site: 'n4ClinicBed', text: 'Bed four. Tommy, wired jaw, awake.', lines: [v('tommy', 'Mmph. Mmmph mm.'), v('ines', 'He says thank you for the beds. He also says the Bat owes him a sandwich. I do not know what that means.'), g('alfred', 'Neither of us shall ask, sir.')] },
          ],
        },
        {
          id: 'n4GymFight', type: 'fight', fight: 'gym', text: 'The boxing gym. Pistols and a medic, and an officer tied to the ring ropes.',
          lines: [v('hollow man', 'Tell him what you are afraid of, officer. Tell the Bat.'), v('officer', 'Honestly? My performance review.')],
        },
        {
          id: 'n4Ostrow', type: 'dilemma', key: 'n4.ostrow', text: 'Detective Ostrow is walking up the street to the market scene. Get on the roof, or face her.',
          timer: 14, heading: 'COMPANY',
          card: 'Detective Ostrow is coming up the street. Get onto the roof before she sees you, or wait for her by the stalls (gold) and brazen it out.',
          bruce: { site: 'n4Ostrow', radius: 4, label: 'Brazen it out', lines: [v('ostrow', 'Detective Ostrow, GCPD. And you are the man who is not supposed to exist.'), g('batman', 'The toxin is in the market. The doctor is on the Stack.'), v('ostrow', 'I know where the doctor is. I would like to know where you go in the daytime.')] },
          batman: { site: 'n4Roof', radius: 6, label: 'Up on the roof', lines: [v('ostrow', 'Bootprints. Fresh. Climbing gear marks on the drainpipe. Somebody very large left in a hurry.')],
            miss: { effects: { suspicion: { detective: 5 }, threads: { detective: 0.5 } } } },
          timeoutBranch: 'bruce',
          branches: { bruce: 'n4Twist', batman: 'n4Twist' },
        },
      ],
    },
    {
      id: 'm4Alley', title: 'Crime Alley', checkpoint: 'n4AlleyMouth', rewards: ['lore:crimeAlley'],
      steps: [
        { id: 'n4Twist', type: 'cutscene', scene: 'n4Twist', panels: 3 },
        {
          id: 'n4ToAlley', text: 'Nightwing is in Crime Alley. Get to the south end of it.', site: 'n4AlleyMouth', radius: 9,
          nudge: g('oracle', "Park Row, west of the island. The alley runs north from the marker. He's at the far end."),
          lines: [
            g('oracle', "His tracker is in Crime Alley, Park Row. Heart rate's through the roof. The toxin is thickest right where he's standing."),
            g('alfred', 'Sir. Of all the streets in Gotham.'),
            g('batman', 'I know which street it is.'),
          ],
          interrupts: [{ id: 'n4RoadHollow', at: 'n4MuggingSpot', radius: 22, fight: 'roadHollow', xp: 80, label: 'Optional: road cleared', lines: [g('oracle', 'Three of them dragging a gas canister across the channel street on your way. Your call.')] }],
          optional: [{ id: 'n4Orphanage', title: 'Optional: warn the orphanage to shut its vents', site: 'parkRowOrphanage', radius: 4, xp: 60, done: 'The orphanage vents are shut. The kids sleep through it.', lines: [g('alfred', "They will wake up to a quiet morning. That is a good night's work on its own.")] }],
        },
        {
          id: 'n4Fear', type: 'fear', text: 'Walk the alley to Nightwing. Not everything you see is there. Do not hit what is not real.', site: 'n4AlleyGoal', radius: 60, goalRadius: 5,
          rules: 'The toxin fills a meter while you breathe it, faster while a watcher sees you. Some figures are not there: strike one and the meter jumps. Crouch to stay out of sight.',
          fear: { gas: 2.5, seen: 20, hitPhantom: 30, drain: 12 },
          phantoms: [{ at: { x: -492, y: 0, z: -405 }, type: 'grunt' }, { at: { x: -487, y: 0, z: -388 }, type: 'knife' }, { at: { x: -490, y: 0, z: -395 }, type: 'heavy' }, { at: { x: -494, y: 0, z: -370 }, type: 'grunt' }, { at: { x: -490, y: 0, z: -362 }, type: 'heavy' }, { at: { x: -486, y: 0, z: -352 }, type: 'knife' }, { at: { x: -491, y: 0, z: -340 }, type: 'grunt' }],
          watchers: [{ at: { x: -490, y: 0, z: -395 }, yaw: -Math.PI / 2, range: 8 }, { at: { x: -490, y: 0, z: -362 }, yaw: Math.PI / 2, range: 8 }],
          failLines: [g('oracle', 'Your vitals spiked and I pulled you back on a gas reading. Breathe. Try it again, slower.')],
          lines: [g('oracle', 'The readings in that alley are off the chart. Whatever you see in there, check it twice before you hit it.')],
        },
        {
          id: 'n4AlleyFight', type: 'fight', fight: 'alleyHollow', text: 'Hollow Men came to finish Nightwing. Keep them off him.', checkpoint: 'n4AlleyGoal',
          lines: [
            g('nightwing', "B? Is that actually you? You're not forty feet tall and on fire?"),
            g('batman', "It's me. Stay down. The antidote takes a minute."),
            v('hollowMan', 'Doc said the bird would be easy pickings. Doc did not mention the big bird.'),
          ],
        },
      ],
    },
    {
      id: 'm4Stack', title: 'The Stack', checkpoint: 'n4StackBase', rewards: ['xp:250'],
      steps: [
        {
          id: 'n4ToStack', text: 'Back to the Narrows. The Stack, the tall tenement in the middle of the island.', site: 'n4StackBase', radius: 10,
          nudge: g('nightwing', 'Tallest junk pile on the island, B. It has a satellite dish growing out of a shed growing out of a bathroom.'),
          lines: [
            g('nightwing', 'Okay. I am back. For the record, what I saw in there was mostly you in a tutu. I am going to need to talk to someone about that.'),
            g('nightwing', "Before it got bad I heard him on their radios. He's on top of the Stack. The El runs right under it, and at dawn he dumps the rest into the morning train."),
            g('oracle', 'Five thousand commuters through the Narrows station between six and seven. He wants to see what a whole city looks like scared.'),
            g('gordon', "I'll hold the trains. I can't hold them forever. Go."),
          ],
          banter: [
            g('nightwing', 'Also, small thing, the tutu was purple. I feel like that is important.'),
            g('alfred', 'Master Dick, I will be filing that image somewhere very secure.'),
          ],
        },
        {
          id: 'n4IfHurt', type: 'life', test: 'choice:n4.clinic=bruce',
          yesLines: [g('gordon', 'The ones who hurt my officer at the gym are at the foot of the Stack. Armed. Angry. Yours, if you want them.')],
          branches: { yes: 'n4StackGuard', no: 'n4Climb' },
        },
        {
          id: 'n4StackGuard', type: 'fight', fight: 'stackGuard', text: 'The crew from the gym, at the foot of the Stack. Clear them before the climb.',
          lines: [v('hollow man', 'He came! The Bat came! Tonight he is late for everything.')],
        },
        {
          id: 'n4Climb', type: 'traverse', text: 'Climb the Stack before the gas reaches the top. Shacks, then the roof.',
          gates: ['n4StackBase', 'n4ShackEast', 'n4ShackSouth', 'stackTopEntry'], timer: 60, bonus: 8,
          failTitle: 'TOO SLOW', failText: 'The gas got there first. Back to the street and climb again.',
          lines: [g('oracle', 'Grapple the east shack, then the south one, then the roof. The building is mostly held up by optimism, so do not dawdle.')],
        },
        {
          id: 'n4Boss', type: 'boss', boss: 'scarecrow', text: 'Stop the Scarecrow. Stay out of the light. Take his carriers silently.', checkpoint: 'stackTopEntry', villain: 'scarecrow',
          lines: [g('oracle', 'Three carriers on the roof with the gas. Take them quietly. And something big is standing at the corner. My sensors say it is not there.')],
        },
      ],
    },
    {
      id: 'm4After', title: 'Morning Train', checkpoint: 'stackTopEntry', rewards: ['lore:scarecrowFile', 'skill:fearResistance'],
      steps: [
        {
          id: 'n4Sample', type: 'collect', item: 'n4Sample', site: 'n4Sample', radius: 3, text: 'Take his formula notebook off the roof.',
          lines: [
            g('gordon', 'Trains are moving. Nobody on the six fifteen saw anything worse than a Monday. Thank you.'),
            g('oracle', 'His notebook will tell me how to make an antidote that is not a guess. And look at the margins. Payments.'),
          ],
        },
        {
          id: 'n4End', type: 'nightEnd', text: 'Dawn over the Narrows.',
          lines: [
            g('oracle', 'Every page of that notebook has the same note in the corner. Paid, with a little black mask drawn next to it.'),
            g('alfred', 'Someone is paying for the city\'s nightmares, sir. I find I would like to send them the bill.'),
          ],
        },
      ],
    },
  ],
};
