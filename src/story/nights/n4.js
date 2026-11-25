// Night Four, "The Hollow Men" (Act III, The Underside). The burlap doctor tests a fear toxin on
// the Narrows; the night is about stealth and nerve: an investigation in the street market, the
// first medics in a fight, a rooftop run ahead of a gas cloud, a predator room in the Rookery, his
// "ambulance" through the island's streets, a walk down Crime Alley through his toxin with
// Nightwing at the end of it, the climb up the Stack and a stealth boss on its roof.
// New role this night: the medic (tutorial beat on the market fight). Format:
// docs/design/story-format.md. Every site below was checked against the live collision.
// [m45] Four more missions (docs/design/briefs/missions-round.md), each with a reason in the plot:
//   m4Case     the canister's label leads to a pest-control depot in Chinatown: a scene to scan
//              and a deduction (three regular buyers, go and ask the one the evidence fits)
//   m4Broker   Bruce Wayne buys a pot of tea from the man who sold the precursor, then a predator
//              room on the South Branch quay: the stabiliser there becomes the antidote the night
//              uses from then on (the officers, Nightwing in the alley)
//   m4Cordon   the ambulance's last lap gassed Gordon's cordon on the bridge: the officers see a
//              monster and hunt him into the Loop (`hunted`: src/story/missions/n4/hunted.js; never
//              harm them), then the strays are found and dosed
//   m4Balloons the doctor's second delivery: canister balloons over Park Row, from the Batwing,
//              and the launch crew on the Orpheum roof
// Second pass (the same four, deeper): the Kettle's yard and a runner over the Chinatown roofs; the
// three cranes on the quay; a rescue on the El bridge and a second, thinner hunt; a second flight
// of balloons over the island and the helium truck through Park Row.
// The masks at the quay are not burlap: somebody else's payroll (the night's last line pays it off).
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
  // [m45] Chinatown: the depot by the gate, the three buyers, the tea house on the night market
  n4Toll: { x: -370, y: 0.15, z: -222 },
  n4CaseDoor: { x: -338, y: 0, z: -143 },
  n4CaseBook: { x: -324, y: 0.15, z: -143 },
  n4CaseCups: { x: -325, y: 0.15, z: -157 },
  n4CaseTracks: { x: -346, y: 0.15, z: -157 },
  n4Kettle: { x: -415, y: 0, z: -120 },
  n4Fireworks: { x: -318.5, y: 0.15, z: -110 },
  n4TempleKitchen: { x: -415, y: 0.15, z: -170 },
  n4KettleHost: { x: -409, y: 0, z: -118 },
  n4KettleTable: { x: -424, y: 0, z: -122 },
  // [m45] the South Branch quay: shed nine under the middle crane
  n4QuayPerch: { x: -262.5, y: 18.65, z: 2 },
  n4Shed: { x: -259, y: 0, z: 30 },
  n4Stabiliser: { x: -259, y: 0, z: 44 },
  // [m45] the cordon on the Narrows bridge, the roof in the Loop, the three strays
  n4Bridge: { x: -306, y: 0, z: -419 },
  n4LoopRoof: { x: -252, y: 26, z: -448 },
  n4StrayWindow: { x: -238, y: 0, z: -425 },
  n4StrayLamp: { x: -215, y: 0, z: -366 },
  n4StrayStairs: { x: -232, y: 0.15, z: -470 },
  // [m45] the balloons over Park Row and the launch crew on the Orpheum roof
  n4WingRoof: { x: -478.75, y: 9, z: -380 },
  n4Sky: { x: -470, y: 62, z: -390 },
  n4LaunchRoof: { x: -478.75, y: 17, z: -326 },
  n4Manifest: { x: -478.75, y: 17, z: -338 },
  // [m45] second pass: the Kettle's yard, the runner's roofs, the cranes, the El, the second sky, the helium truck
  n4YardRings: { x: -421.5, y: 0, z: -121.5 },
  n4YardTruck: { x: -427, y: 0, z: -122.5 },
  n4YardPage: { x: -407, y: 0, z: -118 },
  n4RunA: { x: -418, y: 13.6, z: -134 },
  n4RunB: { x: -390, y: 17, z: -134 },
  n4RunC: { x: -388, y: 10, z: -166 },
  n4RunD: { x: -388, y: 17, z: -184 },
  n4RunEnd: { x: -414, y: 12.77, z: -190 },
  n4CraneSouth: { x: -262.5, y: 18.65, z: 122 },
  n4CraneNorth: { x: -262.5, y: 18.65, z: -118 },
  n4Dock: { x: -259, y: 0, z: -92 },
  n4Book: { x: -259, y: 0, z: -76 },
  n4ElEast: { x: -240, y: 7.26, z: -479 },
  n4ElBridge: { x: -283, y: 7.26, z: -479 },
  n4Sky2: { x: -380, y: 66, z: -330 },
  n4HeliumCar: { x: -460, y: 0.15, z: -350, yaw: 0 },
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
  // [m45] Shed nine: the quay apron under the middle crane (the crane cab is the way in), five
  // hired guns in somebody else's masks. Open ground, long sight lines along the water: the
  // lamps (real fill light, so the apron reads at night) and the crane legs are what there is to work with.
  quayRoom: {
    id: 'quayRoom', site: 'n4Shed', entry: 'n4QuayPerch', radius: 26, gang: 'blackMask',
    lights: [{ x: -257, y: 3.4, z: 26, r: 5, post: true, fill: true }, { x: -262, y: 3.4, z: 46, r: 4, post: true, fill: true }, { x: -256.5, y: 3.4, z: 11, r: 3.5, post: true, fill: true }],
    cover: [{ x: -262, y: 0, z: 20, w: 2.4, d: 1.4, h: 1.5 }, { x: -257.5, y: 0, z: 37, w: 1.4, d: 2.4, h: 1.5 }, { x: -263, y: 0, z: 38, w: 1.4, d: 1.4, h: 1.2 }, { x: -247, y: 0, z: 33, w: 1.6, d: 1.4, h: 1.4 }],
    huddle: { x: -259, y: 0, z: 30 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-263.5, 0, 14, 2, Math.PI), W(-263.5, 0, 50, 2.5, 0)) },
      { type: 'grunt', route: route('pingpong', W(-255, 0, 30, 2, -Math.PI / 2), W(-241, 0, 30, 2.5, Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(-258.5, 0, 9, 3, 0), W(-258.5, 0, 22, 2, 0)) },
      { type: 'medic', route: route('pingpong', W(-260, 0, 52, 3, Math.PI), W(-260, 0, 41, 2, Math.PI)) },
      { type: 'grunt', route: route('loop', W(-261, 0, 27), W(-261, 0, 34, 1.5, Math.PI / 2), W(-256, 0, 34), W(-256, 0, 27, 1.5, -Math.PI / 2)) },
    ],
  },
  // [m45] second pass. The north dock, under the north crane (where the crane run ends: its cab is
  // the way in): the crew's foreman and the shipping book. A narrower room than shed nine: the
  // apron and one side street, four men, a brute who never leaves the book.
  dockRoom: {
    id: 'dockRoom', site: 'n4Dock', entry: 'n4CraneNorth', radius: 26, gang: 'blackMask',
    lights: [{ x: -257.5, y: 3.4, z: -104, r: 4.5, post: true, fill: true }, { x: -262.5, y: 3.4, z: -86, r: 4.5, post: true, fill: true }, { x: -246, y: 3.4, z: -94, r: 4, post: true, fill: true }],
    cover: [{ x: -262, y: 0, z: -98, w: 1.4, d: 2.4, h: 1.5 }, { x: -258, y: 0, z: -82.5, w: 2.4, d: 1.4, h: 1.5 }, { x: -250, y: 0, z: -87, w: 1.6, d: 1.4, h: 1.4 }],
    huddle: { x: -259, y: 0, z: -92 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(-263, 0, -110, 2.5, 0), W(-263, 0, -72, 2.5, Math.PI)) },
      { type: 'pistol', route: route('pingpong', W(-256, 0, -90, 2, -Math.PI / 2), W(-240, 0, -90, 2.5, Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(-259, 0, -106), W(-259, 0, -96, 1.5, 0), W(-262, 0, -92), W(-259, 0, -86, 1.5, Math.PI)) },
      { type: 'brute', route: route('pingpong', W(-259.5, 0, -78, 4, Math.PI), W(-259.5, 0, -74, 3, 0)) },
    ],
  },
};

const FIGHTS = {
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n4Masks: { site: 'n4Ostrow', radius: 12, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 5, ring: 4.5 }] },
  n4Carriers: { site: 'n4Car', radius: 12, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 6, ring: 4.5 }] },
  // The market: the medic's tutorial (pinned into the first wave), then a fuller squad.
  marketHollow: { site: 'narrowsMarket', radius: 13, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 5, ring: 6, lead: 'medic' }, { budget: 7, ring: 7, lead: 'medic' }] },
  rookery: { stealth: 'rookeryRoom' },
  // Crime Alley is nine metres wide: the squad comes down it from both ends, not in a ring.
  alleyHollow: { site: 'n4AlleyFight', radius: 16, gang: 'scarecrow', act: 3, district: 'parkRow', waves: [{ budget: 7, spots: [[0, -8], [0, 8], [-2.5, -4], [2.5, 4], [-2.5, 5], [2.5, -5]] }, { budget: 9, lead: 'pistol', spots: [[0, 10], [0, -10], [-2.5, 7], [2.5, -7], [-2.5, -2], [2.5, 2]] }] },
  roadHollow: { site: 'n4MuggingSpot', radius: 10, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 3, ring: 4 }] },
  // [story2]
  gym: { site: 'n4Gym', radius: 12, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 6, ring: 6, lead: 'pistol' }, { budget: 7, ring: 7, lead: 'medic' }] },
  stackGuard: { site: 'n4StackBase', radius: 12, gang: 'scarecrow', act: 3, district: 'narrows', waves: [{ budget: 7, ring: 7, lead: 'pistol' }] },
  // [m45] optional: a toll on the way off the island
  n4TollFight: { site: 'n4Toll', radius: 12, gang: 'scarecrow', act: 3, district: 'chinatown', waves: [{ budget: 5, ring: 4.5 }] },
  quay: { stealth: 'quayRoom' },
  dock: { stealth: 'dockRoom' },
  // [m45] The Orpheum's roof is 17 m wide and 36 long: the crew stands along it (the helium rack
  // at the south end), a rifle first, then the medic who keeps the pumps going.
  launchCrew: { site: 'n4LaunchRoof', radius: 14, gang: 'scarecrow', act: 3, district: 'parkRow', waves: [{ budget: 6, lead: 'rifle', spots: [[0, -9], [3, -6], [-3, -6], [0, -13], [4, -11], [-4, -11]] }, { budget: 7, lead: 'medic', spots: [[0, 9], [3, 6], [-3, 6], [0, 13], [4, 11], [-4, 11]] }] },
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
          interrupts: [{ id: 'n4Masks', at: 'n4Ostrow', radius: 24, fight: 'n4Masks', xp: 80, label: "Optional: the gas-mask sellers are gone", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Narrows units: men selling gas masks door to door. Before the gas. Somebody tipped them off, and charged them for it." }] }], // [balance]
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
    // [m45] The canister's label is a real company's: a pest-control depot by the Chinatown gate.
    // A scene to read, then a deduction made with her feet: three regular buyers, one fits.
    {
      id: 'm4Case', title: 'Pest Control', checkpoint: 'narrowsFastTravel', rewards: ['xp:200'],
      steps: [
        {
          id: 'n4ToChinatown', text: 'The canister label is a real company. Lucky Cricket Pest Control, by the Chinatown gate. Go south.', site: 'chinatownGate', radius: 12,
          nudge: g('oracle', 'South off the island over the cut bridge, then east along the lantern street. The gate is the one with the green roof and the opinions.'),
          lines: [
            g('oracle', 'Got something off the canister while you were bagging it. Under the "pest control" sticker there is a second sticker. Lucky Cricket Pest Control, Chinatown. A real firm, real licence.'),
            g('oracle', 'He did not cook the base himself. He bought forty drums of something legal and improved it. Their depot is by the Chinatown gate, and nobody there has picked up a phone since noon.'),
            g('alfred', 'A wholesaler, sir. Even nightmares, it seems, have a supply chain.'),
          ],
          banter: [
            g('oracle', 'That tower on the fork is Wolf Point. Forty floors, all dark, and somebody pays the electric bill on every one of them.'),
            g('alfred', 'I shall add it to the list, Miss Gordon. The list is becoming a pamphlet.'),
          ],
          interrupts: [{ id: 'n4Toll', at: 'n4Toll', radius: 22, fight: 'n4TollFight', xp: 80, label: 'Optional: the toll booth is closed', lines: [v('dispatch', 'Units near the south cut: men in sacks are charging a toll to leave the Narrows. Ten dollars, or your gas mask. Exact change preferred.')] }],
        },
        {
          id: 'n4CaseScan', type: 'scan', text: 'The depot was emptied this afternoon. Scan it for who took the drums. Detective vision.', checkpoint: 'chinatownGate',
          points: [
            { site: 'n4CaseDoor', lines: [g('oracle', 'The roller door was unlocked with a key and locked again after. Nobody broke in. This was a customer with an account.')] },
            { site: 'n4CaseBook', lines: [g('oracle', 'The order book. Forty drums of concentrate, paid in cash, in full, no discount asked for. Somebody did not want a paper trail and did not mind what that cost.')] },
            { site: 'n4CaseCups', lines: [g('oracle', 'Two cups on the counter. Jasmine tea, one drunk, one untouched. The buyer brought the tea. The clerk was too nervous to drink his.')] },
            { site: 'n4CaseTracks', lines: [g('oracle', 'Hand truck tracks at the kerb, narrow wheels, heading west. Forty drums, four at a time, on foot. Wherever it went, it went round the corner.')] },
          ],
          lines: [g('oracle', 'Shutters down, lights on, nobody home. Four things in there are chemically interesting. Stand by each one until it reads.')],
        },
        {
          id: 'n4Deduce', type: 'fork', text: 'Three regular buyers: the fireworks shop (east), the tea house (west), the temple kitchen (south-west). The evidence fits one. Go and ask.', checkpoint: 'chinatownGate',
          options: [
            { id: 'fireworks', text: 'Golden Finch Fireworks', site: 'n4Fireworks', radius: 6, lines: [v('fireworks man', 'Pesticide? Friend, I sell things that go bang. If I wanted to frighten a neighbourhood I would not need a chemist.')] },
            { id: 'kettle', text: 'The Jade Kettle', site: 'n4Kettle', radius: 8, lines: [g('oracle', 'Jasmine, west, cash. That is how I read it too. Mind the dumpling queue. It has ended better men.')] },
            { id: 'temple', text: 'The temple kitchen', site: 'n4TempleKitchen', radius: 8, lines: [v('temple cook', 'Forty drums? We buy ant powder. One tin. And we have never paid full price for anything. Ask the abbot. It is practically a vow.')] },
          ],
          branches: { fireworks: 'n4WrongFireworks', kettle: 'n4KettleYard', temple: 'n4WrongTemple' }, // [m45] second pass: was n4Kettle; the yard and the runner sit between
          lines: [
            g('oracle', 'Lucky Cricket has three customers who buy by the pallet. Golden Finch Fireworks, on the riverside, east. The Jade Kettle tea house, on the night market, west. And the temple kitchen, south-west.'),
            g('oracle', 'You read the room, not me. Pick the one the evidence fits and go and knock.'),
          ],
        },
        {
          id: 'n4WrongFireworks', type: 'wait', seconds: 5, next: 'n4BackToKettle',
          lines: [g('oracle', 'And the hand truck went west. He is east. I should have said that twice.')],
        },
        {
          id: 'n4WrongTemple', type: 'wait', seconds: 5,
          lines: [g('alfred', 'The order book said cash, sir, in full. I mention it without judgement. Well. With very little.')],
        },
        {
          id: 'n4BackToKettle', text: 'The tea was jasmine. The Jade Kettle, on the night market.', site: 'n4Kettle', radius: 8,
          nudge: g('oracle', 'The night market is the stall street west of the gate. The Jade Kettle is the one with the queue.'),
          lines: [g('oracle', 'Jasmine tea on the counter, a hand truck going west, cash in full. That is the Jade Kettle. Night market, west of the gate.')],
          banter: [g('alfred', 'Even the great detective is permitted one wrong door a night, sir. I keep a tally. It is a short tally.')],
        },
        // [m45] second pass: the right door is only an address. The yard behind it says the drums
        // have already gone, and a runner on the roofs is carrying the paperwork away.
        {
          id: 'n4KettleYard', type: 'scan', text: 'The Jade Kettle\'s back yard. The drums came through here. Scan it before you walk in the front.', checkpoint: 'n4Kettle',
          points: [
            { site: 'n4YardRings', lines: [g('oracle', 'Forty rust rings on the flagstones, in rows of four. The drums stood here for an hour, no longer. This yard was a platform, not a storeroom.')] },
            { site: 'n4YardTruck', lines: [g('oracle', 'The hand truck, still warm at the axle. And a second set of wheel marks, wider. A van took them on from here.')] },
            { site: 'n4YardPage', lines: [g('oracle', 'A carbon copy, torn off a delivery pad. No address. Just "collected, P." and a time. Twenty minutes ago.')] },
          ],
          lines: [g('oracle', 'Before you go in the front, go round the back. Whoever bought forty drums did not carry them through a tea room.')],
        },
        {
          id: 'n4Runner', type: 'traverse', text: 'A runner just went up the fire escape with the delivery pad. Stay with him across the roofs to the temple.',
          gates: ['n4RunA', 'n4RunB', 'n4RunC', 'n4RunD', 'n4RunEnd'], timer: 40, bonus: 8,
          failTitle: 'LOST HIM', failText: 'He doubled back over the market. Pick him up again from the first roof.',
          failLines: [g('alfred', 'He knows these roofs, sir. You merely own several of them.')],
          lines: [
            g('oracle', 'Movement on the fire escape. One man, a satchel, and the rest of that delivery pad. He is going over the roofs, east then south, toward the temple.'),
            g('batman', 'He is not running from me. He does not know I am here. He is running to someone.'),
          ],
        },
        {
          id: 'n4Satchel', type: 'collect', item: 'n4Satchel', site: 'n4RunEnd', radius: 3, text: 'He dropped the satchel on the temple roof and kept running. Take it.',
          lines: [
            v('runner', 'I just carry the bag! I do not read the bag! Take the bag!'),
            g('oracle', 'Let him go. The pad is what matters. Every page is signed for by the same man: D. Pike, and under it a table number. He does business at the Kettle. Back table.'),
          ],
        },
        {
          id: 'n4KettleDoor', text: 'Back to the Jade Kettle, by the front door this time. Pike will not talk to a mask.', site: 'n4Kettle', radius: 6,
          nudge: g('alfred', 'The night market, sir, where you started. I have a suit waiting behind the dumpling stall. It has been admired.'),
          lines: [g('alfred', 'A broker who signs for forty drums and sits down to tea, sir. He will run from the cowl. He will pour for a Wayne.')],
          banter: [v('dispatch', 'Chinatown units: a man on the temple roof says a very large bat took his bag and was, quote, polite about it.')],
        },
      ],
    },
    // [m45] The broker will not talk to a mask. He will talk to money: Bruce Wayne, a pot of tea and
    // a choice of how to lean on him. Then shed nine on the South Branch quay, quietly.
    {
      id: 'm4Broker', title: 'The Jade Kettle', checkpoint: 'n4Kettle', rewards: ['xp:250'],
      steps: [
        {
          id: 'n4Kettle', type: 'civvy', outfit: 'suit', text: 'The Jade Kettle. The man who sold the drums drinks here. He will not talk to a mask.',
          card: 'Bruce Wayne, a long way from the Mile, in a tea house that has never needed him. The broker at the back table sells chemicals by the pallet and questions by the pound.',
          beats: [
            { id: 'host', site: 'n4KettleHost', text: 'Madam Shu, who owns the kettle and the room.', lines: [
              v('madam shu', 'Mr. Wayne. We do not see your sort before midnight. Tea is on the house. Questions are extra.'),
              g('bruce', 'Then the tea, and one question. Who buys jasmine by the flask and takes it to a pest-control depot?'),
              v('madam shu', 'Back table. Grey suit. Tips like a man who is being followed. Tonight, I notice, he is.'),
            ] },
            { id: 'pike', site: 'n4KettleTable', text: 'The back table. Desmond Pike, chemical broker.', lines: [
              v('pike', 'Wayne. Of the Waynes. If this is about the Narrows land, I only sell the fertiliser.'),
              g('bruce', 'Forty drums of concentrate left Lucky Cricket this afternoon on a hand truck. I would like to know where the hand truck stopped.'),
            ],
              choice: { key: 'n4.pike', prompt: 'He is deciding what you are', default: 'buyer', options: [
                { id: 'buyer', tag: 'cover', text: 'A customer. "I have a greenhouse problem. A large one."', effects: { suspicion: { reporter: 1 } }, lines: [v('pike', 'A greenhouse. Naturally. Shed nine, South Branch quay, under the middle crane. Ask for nobody. I only rent the space.')] },
                { id: 'lean', tag: 'risky', text: 'A threat. "Wayne Chemical buys from your suppliers. We could stop."', effects: { standing: -1, city: 1 }, lines: [v('pike', 'There it is. The teeth behind the smile. Shed nine, South Branch quay, under the middle crane. And I was never your friend, Mr. Wayne, so we have lost nothing.')] },
                { id: 'honest', tag: 'honest', text: 'The truth. "There are people in hospital. Tell me where it went."', effects: { city: 1, threads: { alfred: 0.1 } }, lines: [v('pike', 'I sold a man something to kill ants. What he did with it after... Shed nine. South Branch quay, under the middle crane. I did not know. Write that down somewhere.')] },
              ] } },
          ],
          endLines: [g('alfred', 'Shed nine. The suit will meet you behind the dumpling stall, sir. Do try not to be seen changing by anyone holding chopsticks.')],
        },
        {
          id: 'n4ToQuay', text: 'Shed nine, South Branch quay. Get up on the middle crane and look before you leap.', site: 'n4QuayPerch', radius: 7,
          nudge: g('oracle', 'East to the water, over the South Branch. Three cranes on the quay. Yours is the middle one. Grapple the cab.'),
          lines: [
            g('oracle', 'Pike rents the shed to a holding company I cannot see the bottom of. What I can see is five heat signatures walking circles on that quay.'),
            g('alfred', 'I counted his tea, sir. One pot, two hours. A man does not nurse a pot that long unless he is waiting for somebody to tell him it is over.'),
          ],
          banter: [
            v('dispatch', 'Chinatown units: disregard the report of Bruce Wayne buying tea. Caller admits it is, quote, more of a feeling.'),
            g('oracle', 'The bridges over the South Branch lift for barges. If yours is up, there is a perfectly good river to glide across.'),
          ],
        },
        {
          id: 'n4QuayRoom', type: 'fight', fight: 'quay', text: 'Shed nine. Five guards on open ground. Use the crane, the crates and the dark between the lamps.', checkpoint: 'n4QuayPerch',
          tutorial: ['crouch', 'silent'],
          lines: [
            g('oracle', 'Those are not Hollow Men. No burlap. Black masks, good boots, the same radio on every belt. Somebody with a payroll is minding the pantry for him.'),
            v('guard', 'You ever wonder what is in the drums?'),
            v('guard', 'I wonder what is in my pay packet. It is in my pay packet. I have stopped wondering.'),
          ],
        },
        {
          id: 'n4Stabiliser', type: 'collect', item: 'n4Stabiliser', site: 'n4Stabiliser', radius: 3, text: 'Take a flask of the stabiliser from the drums. Oracle needs it for an antidote.',
          lines: [
            g('oracle', 'The drums on the left are the stabiliser. It is what keeps his toxin from breaking down in the air. Run it backwards and it is most of an antidote.'),
            g('oracle', 'Bag a flask. Twenty minutes with that and I can stop guessing.'),
          ],
        },
        // [m45] second pass: the guards' last order. Three pallets of concentrate are on the crane
        // hooks over the South Branch with the hoist brakes on timers; the river feeds the Loop.
        {
          id: 'n4Cranes', type: 'traverse', text: 'Three pallets of drums hang over the river on timed hoist brakes. Lock each crane by hand: south, middle, north.',
          gates: ['n4CraneSouth', 'n4QuayPerch', 'n4CraneNorth'], timer: 45, bonus: 30,
          failTitle: 'A PALLET WENT IN', failText: 'Oracle caught it downstream with the lock gates. Not twice. From the south crane again.',
          failLines: [g('oracle', 'I shut the locks on it. That trick works once. Go again, and do not stop to admire the view.')],
          lines: [
            g('oracle', 'Bad. One of them hit a switch before he went down. All three cranes are swung out over the water with a pallet on the hook, and the hoist brakes are on a timer.'),
            g('gordon', 'The South Branch runs into the main stem and the main stem runs through the Loop. If those drums go in, I am evacuating downtown in the dark.'),
            g('oracle', 'Each cab has a manual lock. South crane first, it has the least time. Then the middle, then the north.'),
          ],
        },
        {
          id: 'n4CranesDone', type: 'wait', seconds: 4,
          lines: [
            g('gordon', 'Harbour unit has all three pallets. Whoever those men work for, they would rather poison a river than lose a shipment.'),
            g('alfred', 'Not the behaviour of a man in a sack, sir. That is somebody with a ledger.'),
          ],
        },
        {
          id: 'n4DockRoom', type: 'fight', fight: 'dock', text: 'The north dock, under you. The crew\'s foreman and three more, and the book that says who the drums were for. Quietly.', checkpoint: 'n4CraneNorth',
          lines: [
            g('oracle', 'While you are up there, look down. The north dock. Four of them packing up, and the big one has not let go of a shipping book since I started watching.'),
            v('guard', 'Boss says burn the book.'),
            v('foreman', 'Boss says a lot of things. The book is how I get paid. Nobody burns how I get paid.'),
          ],
        },
        {
          id: 'n4Book', type: 'collect', item: 'n4Book', site: 'n4Book', radius: 3, text: 'Take the shipping book.',
          lines: [
            g('oracle', 'Hold it up to the lens. Forty drums in, forty out, consigned to a set of initials and a box number. I will have the name by morning. It is not the doctor\'s.'),
            g('alfred', 'He kept the one thing that could hang his employer, sir, because it also had his wages in it. There is a moral there. I shall not labour it.'),
          ],
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
    // [m45] The ambulance vented its last lap along the riverside, and the wind put it on Gordon's
    // cordon. His officers see a monster. Batman does not hurt police: he runs, hides and comes
    // back with the antidote (docs/design/wanted.md 3 is the rule; the `hunted` step raises it).
    {
      id: 'm4Cordon', title: 'Friendly Fire', checkpoint: 'n4Car', rewards: ['xp:250'],
      steps: [
        {
          id: 'n4ToCordon', text: 'Gordon wants what is left in the van at his cordon. The Narrows bridge, east side of the island.', site: 'n4Bridge', radius: 10,
          nudge: g('gordon', 'The bascule bridge on the east side, one street up from the El. You will see the lights. And the paperwork.'),
          lines: [
            g('gordon', 'That was not driving, that was demolition. Thank you. Bring what is left of its cargo to my cordon on the bridge, before somebody steals it twice.'),
            g('oracle', 'One thing. That van vented its whole last lap along the riverside, and the wind is out of the west. It is all drifting onto the bridge.'),
          ],
          banter: [g('alfred', 'I do hope the Commissioner has masks for his people, sir. Hope being, as ever, the cheaper option.')],
        },
        {
          id: 'n4Hunted', type: 'hunted', text: 'The cordon breathed the toxin. They think you are the monster. Do not hurt them: lose them over the rooftops.', checkpoint: 'n4Bridge', retry: true,
          at: 'n4Bridge', hide: 'n4LoopRoof', level: 3,
          heading: 'FRIENDLY FIRE',
          rules: 'The officers are gassed, not guilty: never strike one. Break their line of sight, get off the street and stay hidden until the search ends. Rooftops and the fog are on your side. The blue marker is a roof nobody is watching.',
          lines: [
            v('officer', 'Sarge! The fog! The fog has got WINGS!'),
            g('gordon', 'Hold your fire! That is an order! ...They cannot hear me. Batman, they breathed it. Half my line. Get out of there, and do not lay a hand on them.'),
            g('oracle', 'East, over the bridge, into the Loop. I have marked a roof with no windows on the river side. Go. I am working on the antidote as fast as chemistry allows.'),
          ],
          escapedLines: [
            g('gordon', 'They have lost you. They are currently arresting a mailbox. I will take it from here.'),
            g('alfred', 'Hunted by the police and innocent of everything, sir. Rather like your school reports.'),
          ],
          calledOffLines: [g('gordon', 'I have them back on the radio, one at a time, mostly by shouting my own badge number. Stand easy. You are clear.')],
          failLines: [g('oracle', 'They had you pinned. I jammed their radios and Gordon pulled two of them off you by the collar. Go again, and stay off the street this time.')],
        },
        {
          id: 'n4Strays', type: 'scan', text: 'Three gassed officers ran into the Loop. Find their radios in detective vision and give each one a dose.', hold: 1.5, checkpoint: 'n4LoopRoof',
          points: [
            { site: 'n4StrayWindow', lines: [g('oracle', 'Officer Brandt. Behind a newspaper box, arresting his own reflection in a shop window. Dosed. The reflection is being released without charge.')] },
            { site: 'n4StrayLamp', lines: [g('oracle', 'Officer Okafor, halfway up a lamp post. She says the pavement is looking at her funny. Dosed. Coming down. Slowly.')] },
            { site: 'n4StrayStairs', lines: [g('oracle', 'Sergeant Diaz, under the El stairs, reading the fog its rights. Dosed. He would like it noted that the fog started it.')] },
          ],
          lines: [
            g('oracle', 'The flask from the quay did it. First batch of antidote is real, and a drone just dropped six doses on your roof. Do not ask what I had to promise the drone.'),
            g('gordon', 'Three of mine ran east into the Loop before I could stop them. They are armed, they are terrified and they are my responsibility. Find them before a taxi does.'),
          ],
        },
        // [m45] second pass: the fourth one. On the El bridge, on the rails, with a train due; and the
        // officer he pulls clear tells the radio exactly what grabbed him.
        {
          id: 'n4ElRescue', type: 'traverse', text: 'A fourth officer has climbed onto the El bridge and is walking the rails. A train is due. Get up there and get him off.',
          gates: ['n4ElEast', 'n4ElBridge'], timer: 35, bonus: 10, checkpoint: 'n4StrayStairs',
          failTitle: 'THE TRAIN', failText: 'Oracle held it at the last signal. She cannot hold it twice. From the station end again.',
          failLines: [g('oracle', 'I threw the signal to red. The driver is furious and the timetable is ruined. You have until he gets the all clear.')],
          lines: [
            g('gordon', 'There is a fourth. Patrolman Reyes. He went up the El stairs and he is out on the bridge span, on the rails, telling the river to put its hands up.'),
            g('oracle', 'West Line train is two minutes out and it does not stop for hallucinations. Up onto the deck at the station end, then out over the water.'),
          ],
        },
        {
          id: 'n4HuntedAgain', type: 'hunted', text: 'Reyes is safe, dosed, and on the radio saying the monster grabbed him. They are coming again. Lose them on the island.', checkpoint: 'n4ElBridge', retry: true,
          at: 'n4ElBridge', hide: 'n4Roof', level: 2,
          heading: 'ONCE MORE',
          rules: 'The officers who are still gassed heard that call. Same rule: never strike one. West this time, onto the island roofs, and stay out of sight until the search ends.',
          lines: [
            v('reyes', 'All units, it had me! It had me by the collar! It was very gentle! Send everyone!'),
            g('gordon', 'Reyes, get off the air. Batman, I am sorry. The ones I have not dosed yet are coming your way. I am pulling them back as fast as I can stick needles in them.'),
          ],
          escapedLines: [g('gordon', 'That is the last of them dosed. Nobody is chasing you now but me, and I only want the paperwork.')],
          calledOffLines: [g('gordon', 'Stand easy. Every officer on that bridge has had the antidote and a cup of tea. You are clear.')],
          failLines: [g('oracle', 'They boxed you in on the span. I cut their radios again. Go again, and go west.')],
        },
        {
          id: 'n4Doses', text: 'Take the last doses back to Gordon at the bridge.', site: 'n4Bridge', radius: 10,
          nudge: g('gordon', 'The bridge, where you left us. It is safe now. Mostly we are just embarrassed.'),
          lines: [
            g('gordon', 'Diaz is asking for you by name. That is new. Bring whatever you have left. My medics have run out of ideas and blankets.'),
            g('oracle', 'And B? The doses work. Hold on to one. Somebody you know may need it before morning.'),
          ],
          banter: [v('dispatch', 'All units: the monster on the Narrows bridge has been downgraded to a person of interest. The fog remains at large.')],
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
    // [m45] The doctor's second delivery: weather balloons with a canister under each, let go from
    // Park Row into a west wind. From the Batwing, above the fog; then the crew that filled them.
    {
      id: 'm4Balloons', title: 'Second Delivery', checkpoint: 'n4AlleyGoal', rewards: ['xp:250'],
      steps: [
        {
          // The Batwing only picks her up from high ground (src/vehicles/batwing.js canCall): the
          // mission roof, south of the alley, is the nearest flat one.
          id: 'n4ToWingRoof', text: 'Canister balloons are rising off Park Row. Get up onto the mission roof, south of the alley: the Batwing needs high ground to pick you up.', site: 'n4WingRoof', radius: 7,
          nudge: g('alfred', 'The Park Row mission, sir, the low flat roof just south of the theatre. The aircraft will not come down into an alley. It has standards.'),
          lines: [
            g('oracle', 'New problem, and it is above you. Weather balloons going up off a roof on Park Row. Twelve of them, a canister under each, and a west wind that ends in the Loop.'),
            g('gordon', 'I cannot shoot at those over a neighbourhood. Tell me you have something that can.'),
            g('alfred', 'The Batwing is inbound, sir. Find it a roof. Master Dick is in good hands. Mine, on the radio. He is already complaining.'),
          ],
        },
        {
          id: 'n4BalloonsUp', type: 'armada', text: 'Pop every canister balloon from the Batwing before the wind carries them over the Loop. (Not aboard? Call it from any roof.)', site: 'n4Sky', talk: 'over',
          balloons: 12, field: { rx: 60, ry: 14, rz: 70 },
          lines: [g('oracle', 'Twelve on my scope, drifting east at walking pace. Fly through them or dart them. Either way, do it over the river side of the row, not the houses.')],
        },
        {
          id: 'n4LaunchFight', type: 'fight', fight: 'launchCrew', text: 'The launch crew is on the roof of the old Orpheum, filling the next batch. Stop them.', checkpoint: 'n4LaunchRoof',
          lines: [
            g('oracle', 'Last one popped. They came off the roof of the Orpheum, the shut theatre beside the alley, and there is a second rack up there half full of helium.'),
            v('hollowMan', 'Doc said nobody looks up in this town.'),
            v('hollowMan', 'Doc has not met the one fella who lives up there.'),
          ],
        },
        {
          id: 'n4Manifest', type: 'collect', item: 'n4Manifest', site: 'n4Manifest', radius: 3, text: 'Take the launch sheet off the helium rack.',
          lines: [
            g('oracle', 'There will be a launch sheet on that rack. He is a scientist. He writes everything down. It is his worst habit.'),
            g('alfred', 'Twelve balloons to keep you busy over Park Row, sir. One does wonder what he wanted you too busy to notice.'),
          ],
        },
        // [m45] second pass: the sheet has two columns. The second flight went up from the truck
        // while the roof was being cleared, and the truck is leaving with what is left.
        {
          id: 'n4BalloonsEast', type: 'armada', text: 'The launch sheet lists a second flight, already over the Narrows and drifting for the river. Pop every one from the Batwing.', site: 'n4Sky2', talk: 'over',
          balloons: 14, field: { rx: 70, ry: 14, rz: 60 },
          lines: [
            g('oracle', 'Two columns on that sheet. The second flight went up from a truck in the street while you were busy up here. Fourteen, higher, and already over the island.'),
            g('alfred', 'The aircraft is coming back round for you, sir. Do stay on the roof. It sulks if it has to look for you.'),
          ],
        },
        {
          id: 'n4HeliumBoard', type: 'board', text: 'The helium truck is pulling out of Park Row with the last rack. The Batmobile is on the street east of the theatre.', site: 'n4HeliumCar', talk: 'over',
          nudge: g('alfred', 'The car is on the street east of the theatre, sir. Nose pointing at the problem.'),
          lines: [g('oracle', 'Sky is clear. The truck that carried the helium is not: a pickup with one more rack on the bed, circling Park Row looking for a quiet street to finish the job.')],
        },
        {
          id: 'n4HeliumChase', type: 'chase', text: 'Ram the helium truck three times before it lets the last rack go.', site: 'n4HeliumCar',
          path: [{ x: -460, z: -419 }, { x: -520, z: -419 }, { x: -520, z: -298 }, { x: -460, z: -298 }],
          van: { type: 'pickup', color: 0x8a7a44, toast: 'Stop the helium truck. Ram it three times!', label: 'HELIUM' },
          lines: [g('alfred', 'Do mind the cylinders, sir. Helium is harmless. What is tied to it is not.')],
        },
      ],
    },
    {
      id: 'm4Stack', title: 'The Stack', checkpoint: 'n4StackBase', rewards: ['xp:250'],
      steps: [
        {
          id: 'n4ToStack', text: 'Back to the Narrows. The Stack, the tall tenement in the middle of the island.', site: 'n4StackBase', radius: 10,
          interrupts: [{ id: 'n4Carriers', at: 'n4Car', radius: 24, fight: 'n4Carriers', xp: 80, label: "Optional: the canister crew is down", lines: [{ speaker: 'oracle', portrait: 'oracle', text: "Six of his carriers moving canisters on foot, two streets from the Stack. Take them now and there is less in the air later." }] }], // [balance]
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
