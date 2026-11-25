// Night Five, "Cold Storage" (Act III, The Underside). The cold-suit scientist's crew is stripping
// the Yards of coolant to turn the old cold-storage plant into a freezer the size of a district.
// The night is about endurance and the environment: frost at the gate (investigation), his crew at
// the steelworks (the first pistols), a run up the grain elevators ahead of the frost, a reefer
// van chase on the yard roads, a predator room in the roundhouse, a ledger that changes the act,
// a choice between the night shift and the coolant cores, and a boss you cannot hit head-on.
// New role this night: the pistol (tutorial beat at the furnace). Format:
// docs/design/story-format.md. Every site below was checked against the live collision.
// [m45] Four more missions (docs/design/briefs/missions-round.md), each with a reason in the plot:
//   m5Pressure the coolant they took was the furnace's emergency supply: four valves in the
//              foreman's order against a clock, and the first look at what steam does to frost
//   m5Odessa   three hijacked trucks and no drivers: the truck stop in Little Odessa, then bearings
//              on a keyed radio from the church, the bathhouse and the freight viaduct
//   m5Freight  down the viaduct between a lookout's sweeps to the stock pens: a predator room round
//              a locked reefer (the guards wear the same masks as Night Four's quay)
// Second pass (the same four, deeper): a climb up the venting furnace to cap the stack; Bruce Wayne at
// the Odessa social club for how the pens are guarded; the relief shift arriving at the open
// reefer (the one plain brawl among the additions); the drones' control van down the harbour road.
//   m5Ice      second-hand drone tanks (the battle mode's own models) icing the river bridge: the Batmobile in battle mode, on the way to the plant
import { titleCard } from '../../ui/comicArt.js';
import { freezePanel } from '../../bosses/defs/scarecrowArt.js';
import { W, route } from '../rooms.js';
import { recap } from './common.js'; // [story2]

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const v = (speaker, text) => ({ speaker, portrait: 'radio', text }); // villains, goons, civilians
const B = (text, x = 50, y = 6, extra = {}) => ({ text, x, y, w: 70, ...extra });

const SITES = {
  n5ScanA: { x: -524, y: 0, z: -32 },
  n5ScanB: { x: -512, y: 0, z: -30 },
  n5ScanC: { x: -520, y: 0, z: -2 },
  n5Furnace: { x: -418, y: 0.2, z: 50 },
  n5SiloBase: { x: -375, y: 0, z: 20 },
  n5SiloSouth: { x: -340, y: 37.2, z: 8 },
  n5SiloNorth: { x: -340, y: 37.2, z: 52 },
  n5Headhouse: { x: -340, y: 42.2, z: 30 },
  n5Car: { x: -460, y: 0.15, z: 60, yaw: 0 },
  n5Roundhouse: { x: -530, y: 0.1, z: 160 },
  n5RoundhouseEntry: { x: -554, y: 9, z: 166 },
  n5Ledger: { x: -536, y: 0.1, z: 176 },
  n5Workers: { x: -460, y: 0, z: 197 },
  n5Cores: { x: -405, y: 0.1, z: 190 },
  n5JackSpot: { x: -460, y: 0, z: 120 },
  coldRoofEntry: { x: -351, y: 20, z: 111 },
  freezeArena: { x: -340, y: 20, z: 122 },
  freezeStart: { x: -330, y: 20, z: 132 },
  n5Core: { x: -344, y: 20, z: 124 },
  // [story2] the Wayne Foundation's warming shelter, opening at the Yards gate tonight
  n5Shelter: { x: -505, y: 2.55, z: -20 },
  n5ShelterLine: { x: -512, y: 0, z: -30 },
  n5Crusher: { x: -405, y: 0.1, z: 176 },
  n5PlantDoor: { x: -361, y: 0, z: 122 },
  // [m45] the control house and the four valves round the furnace
  n5Cabin: { x: -412, y: 0.15, z: -1 },
  n5ValveN: { x: -418, y: 0.15, z: 16 },
  n5ValveE: { x: -404, y: 0.15, z: 30 },
  n5ValveS: { x: -418, y: 0.15, z: 44 },
  n5ValveW: { x: -432, y: 0.15, z: 30 },
  // [m45] Little Odessa: the truck stop, the three high places, the freight viaduct's deck
  n5OdessaCorner: { x: -520, y: 0, z: -75 },
  n5TruckStop: { x: -566, y: 0, z: -150 },
  n5TruckA: { x: -570, y: 0, z: -146 },
  n5TruckB: { x: -566, y: 0, z: -156 },
  n5TruckC: { x: -574, y: 0, z: -160 },
  n5BearChurch: { x: -490, y: 13, z: -193 },
  n5BearBath: { x: -490, y: 10, z: -120 },
  n5BearViaduct: { x: -546.5, y: 6.2, z: -150 },
  n5ViaA: { x: -546.5, y: 6.2, z: -110 },
  n5ViaB: { x: -546.5, y: 6.2, z: -60 },
  n5ViaC: { x: -546.5, y: 6.2, z: -10 },
  n5PensPerch: { x: -546.5, y: 6.2, z: 28 },
  n5Pens: { x: -514, y: 0.15, z: 27 },
  n5ReeferDoor: { x: -513, y: 0.15, z: 28 },
  // [m45] the car on the harbour road, the junction at the foot of the river bridge
  n5Car2: { x: -430, y: 0.15, z: 197, yaw: Math.PI / 2 },
  n5IceSite: { x: -316, y: 0, z: 90 },
  // [m45] second pass: the furnace's ledge, rim and cap; the social club's door and pavement table
  n5Ledge: { x: -418, y: 11, z: 22 },
  n5Rim: { x: -418, y: 30, z: 25 },
  n5Cap: { x: -418, y: 37, z: 30 },
  n5ClubDoor: { x: -527, y: 0.15, z: -60 },
  n5ClubTable: { x: -523, y: 0, z: -56 },
  n5BathDoor: { x: -490, y: 0.15, z: -104 },
  n5BathRoof: { x: -490, y: 10, z: -120 },
  n5BathEdge: { x: -504, y: 10, z: -132 },
  n5Codes: { x: -478, y: 10, z: -114 },
};

const ROOMS = {
  roundhouseRoom: {
    id: 'roundhouseRoom', site: 'n5Roundhouse', entry: 'n5RoundhouseEntry', radius: 22, gang: 'freeze',
    lights: [{ x: -530, y: 3.5, z: 150, r: 5, post: true }, { x: -524, y: 3.5, z: 172, r: 4, post: true }],
    cover: [{ x: -528, y: 0.1, z: 153, w: 3, d: 1.6, h: 1.6 }, { x: -536, y: 0.1, z: 163, w: 1.6, d: 3, h: 1.6 }, { x: -521, y: 0.1, z: 165, w: 1.6, d: 1.6, h: 1.4 }],
    huddle: { x: -530, y: 0.1, z: 160 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-541, 0.1, 146, 2, 0), W(-516, 0.1, 146, 2, 0)) },
      { type: 'rifle', route: route('pingpong', W(-517, 0.1, 140, 2.5, -Math.PI / 2), W(-517, 0.1, 176, 2.5, -Math.PI / 2)) },
      { type: 'medic', route: route('pingpong', W(-541, 0.1, 172, 3, Math.PI / 2), W(-528, 0.1, 172, 3, Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(-532, 0.1, 157), W(-532, 0.1, 168, 1.5, Math.PI), W(-525, 0.1, 168), W(-525, 0.1, 157, 1.5, 0)) },
    ],
  },
  // [m45] The stock pens under the freight viaduct: two open lanes between the fenced pens, the
  // reefer in the middle, the viaduct deck as the way in. Three lamps: the yard is lit enough to
  // read every guard from the deck, with dark between the pools to move in.
  pensRoom: {
    id: 'pensRoom', site: 'n5Pens', entry: 'n5PensPerch', radius: 28, gang: 'blackMask',
    lights: [{ x: -522, y: 3.6, z: 31, r: 5, post: true, fill: true }, { x: -499, y: 3.6, z: 23.5, r: 4.5, post: true, fill: true }, { x: -534, y: 3.6, z: 15.5, r: 4, post: true, fill: true }],
    cover: [{ x: -526, y: 0.15, z: 26, w: 1.6, d: 2.6, h: 1.5 }, { x: -505, y: 0.15, z: 30.5, w: 2.6, d: 1.4, h: 1.5 }, { x: -516, y: 0.15, z: 15.5, w: 2.4, d: 1.4, h: 1.4 }, { x: -494, y: 0.15, z: 28, w: 1.4, d: 1.4, h: 1.2 }],
    huddle: { x: -514, y: 0.15, z: 27 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-534, 0.15, 24, 2, Math.PI / 2), W(-492, 0.15, 24, 2.5, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(-496, 0.15, 33, 2.5, -Math.PI / 2), W(-530, 0.15, 33, 2.5, Math.PI / 2)) },
      { type: 'medic', route: route('pingpong', W(-519, 0.15, 28.5, 3, Math.PI / 2), W(-508, 0.15, 28.5, 3, -Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(-536, 0.15, 14), W(-502, 0.15, 14, 1.5, 0), W(-502, 0.15, 17), W(-536, 0.15, 17, 1.5, Math.PI)) },
      { type: 'grunt', route: route('pingpong', W(-512, 0.15, 32, 2, 0), W(-512, 0.15, 23, 2, Math.PI)) },
    ],
  },
  // [m45] second pass. The bathhouse roof (34 by 28 m, flat, ten metres up, the only warm roof in
  // four districts): the hijack crew's radio man and his minders among the steam stacks. All on
  // one level, so it is about timing the two walkers, not about height.
  bathRoom: {
    id: 'bathRoom', site: 'n5BathRoof', entry: 'n5BathEdge', radius: 24, gang: 'blackMask',
    lights: [{ x: -496, y: 13.2, z: -126, r: 4.5, post: true, fill: true, base: 10 }, { x: -482, y: 13.2, z: -120, r: 4.5, post: true, fill: true, base: 10 }, { x: -492, y: 13.2, z: -111, r: 4, post: true, fill: true, base: 10 }],
    cover: [{ x: -498, y: 10, z: -119, w: 2.2, d: 2.2, h: 1.8 }, { x: -487, y: 10, z: -127, w: 2.2, d: 2.2, h: 1.8 }, { x: -484, y: 10, z: -112.5, w: 2.2, d: 1.6, h: 1.5 }, { x: -494, y: 10, z: -131, w: 1.6, d: 1.4, h: 1.3 }],
    huddle: { x: -490, y: 10, z: -120 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-502, 10, -124, 2, Math.PI / 2), W(-478, 10, -124, 2.5, -Math.PI / 2)) },
      { type: 'grunt', route: route('loop', W(-492, 10, -130), W(-481, 10, -130, 1.5, 0), W(-481, 10, -117), W(-492, 10, -117, 1.5, Math.PI)) },
      { type: 'medic', route: route('pingpong', W(-500, 10, -113, 3, Math.PI / 2), W(-489, 10, -113, 2, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(-478, 10, -116, 4, Math.PI), W(-478, 10, -111, 3, Math.PI)) },
    ],
  },
};

const FIGHTS = {
  // [balance] optional interrupts on travel steps (docs/design/balance.md 5)
  n5Siphon: { site: 'n5SiloBase', radius: 12, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 6, ring: 4.5 }] },
  n5Pickets: { site: 'n5Car', radius: 12, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 6, ring: 4.5 }] },
  // The pistol's tutorial at the steelworks furnace, then a mixed second wave.
  // [m45] The second wave led with a shield: on Hard that composed two shields and a brute (three
  // walls, no opening: the fight the regression bench found too close to call). It leads with the
  // night's own role now: Hard is pistol, shield, brute (three different answers).
  furnaceCrew: { site: 'n5Furnace', radius: 14, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 5, ring: 7, lead: 'pistol' }, { budget: 8, ring: 7, lead: 'pistol' }] },
  roundhouse: { stealth: 'roundhouseRoom' },
  // The choice: the night shift or the coolant cores. Both are four-type fights (hard means mix).
  workersFight: { site: 'n5Workers', radius: 13, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 8, ring: 6, lead: 'medic' }, { budget: 9, ring: 7, lead: 'baton' }] },
  coresFight: { site: 'n5Cores', radius: 13, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 8, ring: 6, lead: 'pistol' }, { budget: 10, ring: 7, add: [{ type: 'brute', dx: 0, dz: 8 }] }] },
  yardsJack: { site: 'n5JackSpot', radius: 10, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 3, ring: 4 }] },
  // [story2]
  crusherRaid: { site: 'n5Crusher', radius: 13, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 7, ring: 7, lead: 'pistol' }, { budget: 8, ring: 7, lead: 'shield' }] },
  plantGuard: { site: 'n5PlantDoor', radius: 12, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 8, ring: 7, lead: 'brute' }, { budget: 8, ring: 7, lead: 'pistol' }] },
  // [m45]
  n5Strippers: { site: 'n5OdessaCorner', radius: 12, gang: 'blackMask', act: 3, district: 'littleOdessa', waves: [{ budget: 5, ring: 4.5 }] },
  pens: { stealth: 'pensRoom' },
  bathRoof: { stealth: 'bathRoom' },
  // [m45] second pass: the relief shift walks in on an open reefer (this night's one plain brawl
  // among the additions): two lanes, so they come along them, not in a ring.
  pensHold: { site: 'n5Pens', radius: 16, gang: 'blackMask', act: 3, district: 'yards', waves: [{ budget: 7, lead: 'baton', spots: [[-12, 0], [12, 0], [-9, 4], [9, -3], [-14, -3], [14, 4]] }, { budget: 9, lead: 'pistol', spots: [[14, 0], [-14, 0], [10, 5], [-10, -3], [16, -3], [-16, 4], [0, 6]] }] },
  n5Doormen: { site: 'n5BathDoor', radius: 12, gang: 'blackMask', act: 3, district: 'littleOdessa', waves: [{ budget: 5, ring: 4.5 }] },
};

const SCENES = {
  // [story2]
  n5Recap: (stage) => recap(stage, {
    title: 'The Hollow Men',
    panels: [
      'The doctor on the Stack gassed the Narrows to see what a frightened city looks like. His notebook named who paid for it.',
      { shot: { cam: [-380, 44, -420], look: [-397, 36, -445] }, caption: 'The morning train ran on time. Nobody on it knew why that mattered.' },
      { shot: { cam: [-500, 12, 0], look: [-520, 4, -23] }, caption: 'Tonight the Yards gate froze solid. In July.' },
    ],
  }),
  n5Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [-516, 6, 150], look: [-536, 1, 176], hero: { at: [-534, 0.1, 173], yaw: 0.6, anim: 'Interact' } }), caption: 'A ledger, under a frozen coffee cup in the roundhouse office.' },
      { img: titleCard('PAID IN FULL', 'Sionis Cold Holdings', { bg: '#111116' }), caption: 'Coolant, trucks, the plant lease. One company paid for all of it. A company with a black mask on its letterhead.', captionPos: 'bottom' },
      { img: freezePanel('cold'), balloons: [B('I do not care whose money it is. The plant will be cold by dawn, and she will be safe for another year.', 50, 6, { w: 82 })] },
    ],
  }],
  freezeIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [-320, 30, 100], look: [-340, 21, 122], hero: { at: [-354, 20, 108], yaw: 0.8, anim: 'Idle_Loop' } }), caption: 'The roof of the cold-storage plant. The frost has already reached the gutters.' },
      { img: freezePanel('cold'), balloons: [B('You cannot hurt me, Batman. Twelve millimetres of insulated alloy. You may as well punch the weather.', 50, 6, { w: 80 })] },
    ],
  }],
  freezeOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: freezePanel('beaten'), balloons: [B('The seals... the coolant... You do not understand what this costs.', 50, 6, { w: 80 })] },
      { img: stage.shot({ cam: [-330, 25, 112], look: [-340, 20.5, 124], hero: { at: [-338, 20, 120], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'He does. That is why Lucius is already on his way with a new chamber for her. Paid for honestly.', captionPos: 'bottom' },
    ],
  }],
};

export default {
  id: 'n5', act: 'act3', number: 5, actNumber: 3,
  title: 'Night Five: Cold Storage',
  blurb: 'The Yards are icing over from the old cold-storage plant outward, and somebody is paying the heating bill in reverse.',
  villain: 'mrFreeze', gang: 'freeze',
  districts: ['yards'],
  timeOfDay: 0.5, weather: 'snow',
  start: 'yardsGate',
  day: {
    hook: 'day.n5',
    context: { day: 5, appointments: [{ id: 'narrowsVote', at: 9, place: 'wayneTowerLobby', title: 'The board vote on the Narrows land sale' }], lead: 'A shell company bidding on the Narrows land shares a registered address with a cold-storage lease in the Yards.' },
    fallback: [
      g('alfred', 'The board voted to delay the Narrows sale, sir, chiefly because you asked a question about the buyer that nobody could answer. Well done. You were also wearing odd socks.'),
      g('alfred', 'The weather service has issued a frost warning for the Yards. Only the Yards. In a heatwave. I mention it purely for meteorological interest.'),
    ],
  },
  sites: SITES,
  rooms: ROOMS,
  fights: FIGHTS,
  scenes: SCENES,
  missions: [
    {
      id: 'm5Frost', title: 'Frost Warning', checkpoint: 'yardsGate', rewards: ['xp:150'],
      steps: [
        { id: 'n5Recap', type: 'cutscene', scene: 'n5Recap' },
        {
          id: 'n5Start', text: 'Go to the Yards gate. The frost started there.', site: 'yardsGate', radius: 12,
          title: { text: 'NIGHT FIVE: COLD STORAGE', sub: 'The Yards, below freezing' },
          nudge: g('oracle', "South-west, past Chinatown. The Yards gate is the arch with the iron cattle on it. It's the only arch in Gotham with cattle on it, which helps."),
          lines: [
            g('gordon', 'Gordon. Three coolant trucks hijacked tonight, and the Yards gate froze solid an hour ago. In July.'),
            g('oracle', "Thermal imaging has the whole district six degrees colder than the river, and it's dropping. The cold is coming from somewhere in the middle."),
          ],
          banter: [
            v('dispatch', 'Units in the Yards: the frost is not a crime. Please stop arresting the frost.'),
            g('alfred', 'I have packed the thermal lining, sir. And a flask. The flask is tea. Mostly.'),
          ],
        },
        {
          id: 'n5Scan', type: 'scan', text: 'Scan the frozen gate for what froze it. Detective vision.',
          points: [
            { site: 'n5ScanA', lines: [g('oracle', 'Frost in a spray pattern, not a spread. Something fired cold at the gate on purpose. Deliberately pretty, too.')] },
            { site: 'n5ScanB', lines: [g('oracle', 'Tyre tracks, a heavy reefer van, and a puddle of coolant that never froze. Pressurised. Military grade.')] },
            { site: 'n5ScanC', lines: [g('oracle', "Boot prints with spikes, the insulated kind. Heading east, toward the steelworks and the silos. That's his crew.")] },
          ],
          lines: [g('oracle', 'Detective vision on the gate. Cold leaves a signature like anything else.')],
          optional: [{ id: 'n5Graffiti', title: 'Optional: read the frost on the gate arch', site: { x: -520, y: 0, z: -12 }, radius: 4, xp: 40, done: 'Somebody scratched "STAY COOL" in the frost. Goons.', lines: [v('graffiti', 'STAY COOL. signed, the Cold Crew. P.S. it is VERY cold.')] }],
        },
      ],
    },
    {
      id: 'm5Steel', title: 'Hot and Cold', checkpoint: 'n5Furnace', rewards: ['lore:coldCrew', 'gadget:shock'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n5ToFurnace', text: 'His crew is at the steelworks furnace. Get there.', site: 'n5Furnace', radius: 16,
          interrupts: [{ id: 'n5Siphon', at: 'n5SiloBase', radius: 24, fight: 'n5Siphon', xp: 80, label: "Optional: the coolant siphon is stopped", lines: [{ speaker: 'dispatch', portrait: 'radio', text: "Yards units: suspects siphoning coolant from the silo lines. Frost on the rails in July. You know who." }] }], // [balance]
          nudge: g('oracle', 'The blast furnace, east of the gate. Tallest chimney in the Yards. You could warm your hands, if they stop shooting.'),
          lines: [g('oracle', "They're stealing the furnace's emergency coolant. Six of them, and a couple are carrying handguns.")],
          banter: [
            v('coldCrew', 'Why do we always rob the warm places? Just once, a sauna. One sauna.'),
            v('coldCrew', 'Boss says heat is the enemy. I said what about soup. He froze my soup.'),
          ],
        },
        {
          id: 'n5FurnaceFight', type: 'fight', fight: 'furnaceCrew', text: 'The Cold Crew at the furnace. Close on the pistols between shots.',
          tip: { title: 'NEW: THE PISTOL', text: 'He ducks into cover and fires between breaths. Close the gap while he reloads, or batarang him out of cover. Do not stand still in the open.' },
          lines: [v('coldCrew', 'It is the Bat. Pistols up. Remember the training.'), v('coldCrew', 'We had training?')],
        },
      ],
    },
    // [m45] The coolant they stole was the furnace's emergency supply: with it gone the blast
    // furnace runs away, and the night crew is locked in the control house beside it. Four valves,
    // one right order, a clock. Steam is the lesson here; the roof of the plant is the exam.
    {
      id: 'm5Pressure', title: 'Pressure Drop', checkpoint: 'n5Furnace', rewards: ['xp:200'],
      steps: [
        {
          id: 'n5ToCabin', text: 'The furnace is running away without its coolant. The night crew is locked in the control house, north side.', site: 'n5Cabin', radius: 6,
          nudge: g('oracle', 'The brick control house on the north side of the furnace. The one with four men hammering on the inside of the door.'),
          lines: [
            g('oracle', 'Bad news about what they took. That was the emergency coolant. Without it the furnace has nothing to stop it climbing, and it is climbing.'),
            v('foreman', 'Hello? Anybody? Kowalczyk, night foreman. They locked us in the control house and took the valve keys. She blows in about two minutes and I would rather not be here for it.'),
          ],
        },
        {
          id: 'n5Valves', type: 'puzzle', site: 'n5Furnace', text: 'Four valves round the furnace. Turn them in the foreman\'s order before she blows: stand on each one.', checkpoint: 'n5Cabin',
          riddleTitle: 'THE FOREMAN, THROUGH THE DOOR',
          riddle: 'First let her breathe: the bleeder on the north side, toward the gate. Then shut her mouth: the blast gate on the south, facing the harbour. Then give her a drink: the river main, east. The bypass on the west is last, and only when she is quiet.',
          plates: [{ id: 'N', site: 'n5ValveN', label: 'Bleeder' }, { id: 'E', site: 'n5ValveE', label: 'River main' }, { id: 'S', site: 'n5ValveS', label: 'Blast gate' }, { id: 'W', site: 'n5ValveW', label: 'Bypass' }],
          order: ['N', 'S', 'E', 'W'], timer: 80, wrongCost: 10, plateRadius: 1.6,
          penalty: { budget: 3, gang: 'freeze', site: 'n5Furnace', ring: 7 },
          wrongLines: [
            v('foreman', 'Not that one! Breathe, mouth, drink, bypass! North, south, east, west!'),
            v('foreman', 'You are making her angry. I have been married to this furnace for nineteen years. I know angry.'),
            v('foreman', 'North. South. East. West. I would draw you a picture but they took my pencil with the keys.'),
          ],
          failLines: [g('oracle', 'The relief stack caught it, barely, and the gauges have reset. You get one more go before it does not.')],
          lines: [g('oracle', 'Four valve wheels at the compass points of the furnace, lit green. The foreman knows the order. Listen to him, not to me.')],
        },
        // [m45] second pass: the bleeder you opened will not close from the ground. Up the furnace
        // between its bursts: the charging ledge, the shell rim, the stack cap.
        {
          id: 'n5Gantry', type: 'traverse', text: 'The bleeder is stuck open and venting over the control house. Climb the furnace between bursts: ledge, rim, cap.',
          gates: ['n5Ledge', 'n5Rim', 'n5Cap'], timer: 35, bonus: 12, checkpoint: 'n5Cabin',
          failTitle: 'SCALDED', failText: 'The stack vented with you on it. Back to the ground and climb between the bursts.',
          failLines: [v('foreman', 'She breathes out every half minute! Count it! Climb on the in breath!')],
          lines: [
            v('foreman', 'She is quiet but she is not shut. That bleeder you opened has stuck. Every burst goes straight over this roof, and it is getting hotter each time.'),
            g('oracle', 'There is a hand cap on top of the stack. Thirty-seven metres. The charging ledge on the north face, then the shell rim, then the cap. Move when the steam stops, not when it starts.'),
          ],
        },
        {
          id: 'n5CapShut', type: 'collect', item: 'n5CapWheel', site: 'n5Cap', radius: 3, text: 'Spin the stack cap shut.',
          lines: [g('alfred', 'I am told the view from up there is the finest in the Yards, sir. I am also told that is not saying a great deal.')],
        },
        {
          id: 'n5Hatch', type: 'collect', item: 'n5Hatch', site: 'n5Cabin', radius: 3, text: 'She is quiet. Break the lock on the control house and let the crew out.',
          lines: [
            v('foreman', 'She is settling. Hear that? That is the nicest sound in the Yards. Now the door, if you would. Dembski has needed the washroom since midnight.'),
            g('oracle', 'Note for later: when that bleeder opened, every bit of frost within ten metres came off the steel. Steam and his kind of cold do not get along.'),
          ],
        },
      ],
    },
    {
      id: 'm5Silos', title: 'The Grain Elevators', checkpoint: 'n5Furnace', rewards: ['xp:200'],
      steps: [
        {
          id: 'n5Silos', type: 'traverse', text: 'The frost is climbing the grain elevators. Get to the top of the row before it does.',
          gates: ['n5SiloBase', 'n5SiloSouth', 'n5SiloNorth', 'n5Headhouse'], timer: 75, bonus: 8,
          failTitle: 'FROSTED OVER', failText: 'The ice beat you to the top. Back to the base and climb again.',
          failLines: [g('alfred', 'You have been overtaken by a weather pattern, sir. I shall not mention it at dinner.')],
          lines: [g('oracle', 'From the top of the silos you can see the whole district. I need eyes on where that cold is coming from. Up the south silo, the north one, then the headhouse.')],
          // [story2] the shelter opening, ringing while you climb
          calls: [{
            id: 'ribbon', from: 'alfred', after: 10, timeout: 12, default: 'send',
            lines: [g('alfred', 'Sir, the Foundation\'s warming shelter opens at the Yards gate at one. The press is there. The scissors are there. You, I note, are up a silo.')],
            prompt: 'The warming shelter needs its ribbon cut',
            options: [
              { id: 'send', tag: 'delegate', text: 'Send Lucius. He likes scissors.', effects: { standing: -1, threads: { lucius: 0.3 } }, lines: [v('lucius', 'I do like scissors. I will tell them you are very sorry and very busy. Both true, I assume.')] },
              { id: 'promise', tag: 'promise', text: '"Hold it. I will be there."', effects: { flags: { 'lead.the shelter is waiting for Bruce': true } }, lines: [g('alfred', 'Then I shall hold it, sir, with a smile that is costing me years.')] },
            ],
          }],
        },
        {
          id: 'n5Vista', type: 'scan', text: 'From the headhouse, scan the Yards for the source of the cold.', points: [{ site: 'n5Headhouse' }], hold: 1.5,
          lines: [
            g('oracle', 'There. The old cold-storage plant, south-east of you. Its roof is white. Everything around it is white.'),
            g('oracle', 'And a reefer van just left the roundhouse heading for it with a full load of coolant. Stop the van, then the roundhouse.'),
          ],
        },
      ],
    },
    {
      id: 'm5Reefer', title: 'Reefer Madness', checkpoint: 'n5Car', rewards: ['xp:250'], // [fix1] gadget reward
      steps: [
        {
          id: 'n5Board', type: 'board', text: 'Get to the Batmobile on the yard road.', site: 'n5Car', talk: 'over',
          nudge: g('alfred', 'The car is on the yard road below the silos. I left the heater on. It seemed only fair.'),
          lines: [g('alfred', 'The car is on the road west of the silos, sir. Running, warm, and frankly the best place in the district to be.')],
        },
        {
          id: 'n5Chase', type: 'chase', text: 'Ram the reefer van three times before it reaches the plant.', site: 'n5Car',
          path: [{ x: -480, z: 90 }, { x: -400, z: 90 }, { x: -330, z: 90 }, { x: -400, z: 90 }],
          // [story2] its own quarry: a white reefer truck, not the Joker's van
          van: { type: 'box_truck', color: 0xdedad0, toast: 'Stop the reefer truck. Ram it three times!', label: 'REEFER' },
          lines: [g('oracle', "It's doing laps of the yard road waiting for the plant gates. Ram it. It's full of coolant, so maybe from the side.")],
        },
      ],
    },
    // [story2] Two places at once: the warming shelter's opening at the Yards gate (Bruce cuts the
    // ribbon, the press is there, and so is a family the frost drove out) and a coolant raid on the
    // crusher. The one you leave goes worse, and the plant remembers.
    {
      id: 'm5Shelter', title: 'Warm Hands', checkpoint: 'n5Car', rewards: ['xp:200', 'gadget:emp'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n5Dilemma', type: 'dilemma', key: 'n5.shelter', text: 'The shelter opens at the Yards gate (gold, Bruce cuts the ribbon). His crew is raiding the crusher for coolant.',
          timer: 50, heading: 'TWO PLACES AT ONCE',
          card: 'The Foundation\'s warming shelter opens at the gate (gold): the press wants Bruce Wayne and his scissors. Or the crusher, where his crew is loading the coolant that makes the plant colder.',
          bruce: { site: 'n5Shelter', radius: 7, label: 'Cut the ribbon', lines: [g('alfred', 'The suit is in the boot, sir. It is very warm. I checked.')],
            miss: { effects: { standing: -4, suspicion: { reporter: 2 } }, lines: [v('kerr', 'The shelter opened without its patron. Mr. Wayne was, quote, unavoidably cold. I am writing that down.')] } },
          batman: { site: 'n5Crusher', radius: 12, label: 'The crusher raid', lines: [g('batman', 'Lucius. The scissors.')],
            miss: { effects: { city: -4 }, lines: [g('oracle', 'The coolant from the crusher reached the plant. It is colder in there now. Much.')] } },
          both: { effects: { standing: 2 }, lines: [g('alfred', 'Ribbon cut, raid stopped. The Gazette will be so confused.')] },
          branches: { bruce: 'n5Ribbon', batman: 'n5CrusherFight', both: 'n5CrusherFight' },
        },
        {
          id: 'n5Ribbon', type: 'civvy', outfit: 'suit', text: 'The shelter. Smile for the cameras.', next: 'n5ToOdessa', // [m45] was n5ToRoundhouse: the Odessa missions sit between
          card: 'Bruce Wayne in an overcoat at the Yards gate, with a family the frost drove out of their home.',
          beats: [
            { id: 'family', site: 'n5ShelterLine', text: 'The first family in the queue.', lines: [v('mother', 'Our pipes burst at nine. Then the windows. The kids thought it was snow. It was the kitchen.'), g('bruce', 'You will be warm tonight. And tomorrow, I promise you, the Yards will be too.')],
              choice: { key: 'n5.kids', prompt: 'Her son is staring at your knuckles', default: 'glove', options: [
                { id: 'glove', tag: 'cover', text: 'Pull your gloves on. "Cold hands."', effects: { suspicion: { reporter: -1 } }, lines: [v('boy', 'You have big hands for a rich man.')] },
                { id: 'joke', tag: 'joke', text: '"Fell off a polo pony. The pony was fine."', effects: { suspicion: { reporter: 1 }, standing: 1 }, lines: [v('boy', 'Ponies are not real. Ponies are a story for babies.')] },
              ] } },
            { id: 'ribbon', site: 'n5Shelter', text: 'The ribbon.', lines: [v('kerr', 'Mr. Wayne, Nadia Kerr, Gazette. Why open a shelter in July?'), g('bruce', 'Because somebody turned July off.'), g('alfred', 'Very good, sir. Now leave, before she asks a second question.')] },
          ],
        },
        {
          id: 'n5CrusherFight', type: 'fight', fight: 'crusherRaid', text: 'His crew at the crusher, loading coolant. Pistols and shields.',
          lines: [v('coldCrew', 'Load it, load it, load it!'), v('coldCrew', 'It is literally frozen to the truck, Phil!')],
        },
      ],
    },
    // [m45] Three coolant trucks were hijacked tonight and nobody has asked where the drivers are.
    // Little Odessa, the truck stop on the west edge street: a scene, then bearings on a keyed
    // radio from three high places, which cross on the stock pens under the freight viaduct.
    {
      id: 'm5Odessa', title: 'Cold Chain', checkpoint: 'yardsGate', rewards: ['xp:200'],
      steps: [
        {
          id: 'n5ToOdessa', text: 'Three coolant trucks were hijacked in Little Odessa. Nobody has seen the drivers. The truck stop, north-west.', site: 'n5TruckStop', radius: 12,
          nudge: g('oracle', 'North through the Yards gate, then the west edge street. The truck stop is the lot with three sets of skid marks and no trucks.'),
          lines: [
            g('gordon', 'Something has been bothering me. Three coolant trucks hijacked, three drivers on the manifests, and not one of them has called his wife. The trucks were taken at the Odessa truck stop.'),
            g('oracle', 'Little Odessa, north of the gate. The freight viaduct runs right past it. If the drivers were moved, that is how.'),
          ],
          banter: [
            v('dispatch', 'Odessa units: the bathhouse reports a queue round the block. It is the only warm building in four districts. Please stop taking statements in the steam room.'),
            g('alfred', 'Little Odessa, sir. Do try the pelmeni if the evening permits. It will not, but I like to offer.'),
          ],
          interrupts: [{ id: 'n5Strippers', at: 'n5OdessaCorner', radius: 22, fight: 'n5Strippers', xp: 80, label: 'Optional: the last truck keeps its wheels', lines: [v('dispatch', 'Odessa units: men in masks stripping a refrigerated truck on the Yards line. They have a jack and no sense of occasion.')] }],
        },
        {
          id: 'n5TruckScan', type: 'scan', text: 'Scan the truck stop for what happened to the drivers. Detective vision.', checkpoint: 'n5TruckStop',
          points: [
            { site: 'n5TruckA', lines: [g('oracle', 'Three thermos flasks in a row on the kerb, lids off, coffee frozen solid. They were on their break. Nobody finished.')] },
            { site: 'n5TruckB', lines: [g('oracle', 'Zip ties, cut, and boot prints that are not work boots. Good tread, all the same make. A crew that gets its kit from one supplier.')] },
            { site: 'n5TruckC', lines: [g('oracle', 'A CB handset, torn off its cord and still warm. One of the drivers palmed his radio. If he is clever, he is holding the key down right now.')] },
          ],
          lines: [g('oracle', 'Three trucks stood here an hour ago. Detective vision. Find me the drivers, not the trucks.')],
        },
        {
          id: 'n5Bearings', type: 'scan', text: 'A driver is holding his radio key down. Take a bearing from three high places: the church roof, the bathhouse roof, the viaduct.', hold: 1.5, radius: 5, checkpoint: 'n5TruckStop',
          points: [
            { site: 'n5BearChurch', lines: [g('oracle', 'Bearing one, from the church. South, a little east. And I can hear breathing on the carrier. Somebody is alive and very cold.')] },
            { site: 'n5BearBath', lines: [g('oracle', 'Bearing two, from the bathhouse. South-west. The lines are closing.')] },
            { site: 'n5BearViaduct', lines: [g('oracle', 'Bearing three, from the viaduct deck. Almost due south, straight down the rails.')] },
          ],
          lines: [
            g('oracle', 'There it is. Channel nineteen, an open carrier, no voice. He cannot talk, so he is letting us listen. I need three bearings to place it. High ground, detective vision, hold still.'),
            g('alfred', 'A man keeping his thumb on a button in the dark, sir, trusting that somebody is listening. I do hope we deserve him.'),
          ],
        },
        // [m45] second pass: the bearings say where. The people who hired the hijackers say how it
        // is guarded, and they do their talking at the social club, to people with money.
        {
          id: 'n5ToClub', text: 'The bearings cross somewhere at the Yards end of the viaduct. The men who arranged it drink at the Odessa social club. Go there first.', site: 'n5ClubDoor', radius: 7,
          nudge: g('oracle', 'The social club on the Odessa middle street, south of the bathhouse. Green door, no sign, a doorman the size of the door.'),
          lines: [
            g('oracle', 'South, a kilometre of rail and a dozen sheds it could be. I can give you the place in ten minutes or you can ask the people who booked it. The hijack crew was hired through the Odessa social club.'),
            g('alfred', 'They do not admit masks, sir. They do admit money. I have laid out the grey overcoat.'),
          ],
          interrupts: [{ id: 'n5Doormen', at: 'n5BathDoor', radius: 20, fight: 'n5Doormen', xp: 80, label: 'Optional: the bathhouse keeps its takings', lines: [v('dispatch', 'Odessa units: masked men at the bathhouse door collecting, quote, a heating surcharge. The bathhouse would like it noted it is the one doing the heating.')] }],
        },
        {
          id: 'n5Club', type: 'civvy', outfit: 'suit', text: 'The Odessa social club. Somebody here booked the hijack crew.', checkpoint: 'n5ClubDoor',
          card: 'Bruce Wayne in an overcoat on the wrong side of the river, where the Wayne name buys a chair and no trust at all.',
          beats: [
            { id: 'door', site: 'n5ClubDoor', text: 'The doorman.', lines: [
              v('doorman', 'Members only.'),
              g('bruce', 'I own the building.'),
              v('doorman', 'Members, and landlords. Mrs. Kol is at the pavement table. She does not like the cold either. She likes it less than you.'),
            ] },
            { id: 'kol', site: 'n5ClubTable', text: 'Vesna Kol, who books things.', lines: [
              v('kol', 'Mr. Wayne. You have come about the rent, or you have come about the trucks. Nobody comes about the rent at one in the morning.'),
              g('bruce', 'Three drivers. I would like them back before they freeze.'),
            ],
              choice: { key: 'n5.kol', prompt: 'She is waiting to hear what it is worth', default: 'rent', options: [
                { id: 'rent', tag: 'deal', text: 'A deal. "A year of rent on this building. For a place and a number of guards."', effects: { standing: -1, city: 1 }, lines: [v('kol', 'A year. You bargain like a man who has never needed to. The old stock pens, under the viaduct. Five men. A lookout on the deck who sweeps every minute and is bored by it.')] },
                { id: 'name', tag: 'risky', text: 'Pressure. "I know whose money hired them. Shall I say the name out loud?"', effects: { suspicion: { villain: 2 }, city: 1 }, lines: [v('kol', 'You do not know the name. But you know there is one, which is more than I like. The stock pens, under the viaduct. Five men and a lookout. Go away, Mr. Wayne.')] },
                { id: 'plain', tag: 'honest', text: 'Plainly. "They have families in this neighbourhood. So do you."', effects: { city: 1, threads: { alfred: 0.1 } }, lines: [v('kol', 'Marek drinks here. He owes me forty dollars. The stock pens, under the viaduct, five men, a lookout on the deck. Get him back. He owes me forty dollars.')] },
              ] } },
          ],
          endLines: [g('alfred', 'The stock pens, five men and a bored lookout. I do like a witness who counts, sir. One thing first: she mentioned a radio.')],
        },
        // [m45] second pass: the lookout calls in after every sweep. The man he calls is on the
        // bathhouse roof with the code sheet; take the sheet and the calls can be answered by Oracle.
        {
          id: 'n5ToBathRoof', text: 'The lookout reports to a radio man on the bathhouse roof. Get up on the roof edge, north-west corner.', site: 'n5BathEdge', radius: 6,
          nudge: g('oracle', 'The bathhouse, the long flat roof with the steam coming off it, one block north-east of the club. North-west corner.'),
          lines: [
            g('oracle', 'Mrs. Kol left something out, or did not know it. The lookout on the viaduct calls in after every sweep, and the calls go to a set on the bathhouse roof. If they stop, the pens know.'),
            g('oracle', 'So we do not stop them. Get me his code sheet and I will answer the lookout myself. I do a very good bored man.'),
          ],
        },
        {
          id: 'n5BathRoom', type: 'fight', fight: 'bathRoof', text: 'The bathhouse roof. A radio man and three minders among the steam stacks. Nobody gets to the handset.', checkpoint: 'n5BathEdge',
          lines: [
            v('guard', 'Warmest posting in the city and you are complaining.'),
            v('guard', 'My boots are melting, Ilya. I can smell my own boots.'),
          ],
        },
        {
          id: 'n5Codes', type: 'collect', item: 'n5Codes', site: 'n5Codes', radius: 3, text: 'Take the code sheet from the radio set.',
          lines: [
            g('oracle', 'Got it. "Deck clear, nothing, I am cold." Every minute, word for word. I can keep that up all night. The viaduct stairs are across the street. Go and be nothing.'),
          ],
        },
      ],
    },
    // [m45] The bearings cross on the old stock pens at the south end of the viaduct. Along the
    // deck, between the lookout's sweeps; then five guards round a locked reefer, quietly, because
    // the thermostat is in their hands.
    {
      id: 'm5Freight', title: 'Night Freight', checkpoint: 'n5BearViaduct', rewards: ['xp:250'],
      steps: [
        {
          id: 'n5ViaductRun', type: 'traverse', text: 'The bearings cross on the stock pens, south down the viaduct. Run the deck between the lookout\'s sweeps.',
          gates: ['n5ViaA', 'n5ViaB', 'n5ViaC', 'n5PensPerch'], timer: 50, bonus: 7,
          failTitle: 'THE LOOKOUT SAW YOU', failText: 'He swept the deck with his lamp. Back to the first marker and go again.',
          failLines: [g('alfred', 'He has seen a shape on the viaduct, sir, and has decided it was a pigeon. A very large pigeon. He will not decide that twice.')],
          lines: [
            g('oracle', 'All three lines cross on the stock pens at the Yards end of the viaduct. Two hundred metres of open deck, and a lookout at the far end who sweeps it with a lamp every minute.'),
            g('oracle', 'Go between sweeps. If he sees you coming, whoever is holding those drivers turns the thermostat down.'),
          ],
        },
        {
          id: 'n5PensRoom', type: 'fight', fight: 'pens', text: 'The stock pens. Five guards and a locked reefer with three drivers in it. Silently: the thermostat is theirs.', checkpoint: 'n5PensPerch',
          tutorial: ['crouch', 'silent'],
          lines: [
            g('oracle', 'Same masks as the quay last night. Black, good boots, one radio each. This is not his crew. Somebody lent him professionals.'),
            v('guard', 'How long do they keep in there?'),
            v('guard', 'It is a refrigerator, Lenny. That is the whole idea of a refrigerator.'),
          ],
        },
        {
          id: 'n5Reefer', type: 'collect', item: 'n5Reefer', site: 'n5ReeferDoor', radius: 3, text: 'Open the reefer. Get the drivers out.',
          lines: [
            v('driver', 'Is that... it is. Told you, Marek. Told you somebody was on nineteen.'),
            g('gordon', 'Three drivers, alive, blue round the edges. My people have blankets and a great deal of soup. Whoever held that radio key gets my parking space.'),
          ],
        },
        // [m45] second pass: the relief shift, on time, with the drivers still in the yard.
        {
          id: 'n5PensHold', type: 'fight', fight: 'pensHold', text: 'The relief shift just walked into the pens. Keep them off the drivers until Gordon\'s van gets here.', checkpoint: 'n5PensPerch',
          lines: [
            g('oracle', 'Headlights at the pen gate. That is not Gordon. That is the two o\'clock shift, and nobody told them the job was over.'),
            v('guard', 'Why is the door open? Lenny? Why is the door open, Lenny?'),
            v('driver', 'We will just... stay in the refrigerator. For now. If that is all right.'),
          ],
        },
      ],
    },
    {
      id: 'm5Roundhouse', title: 'The Roundhouse', checkpoint: 'n5RoundhouseEntry', rewards: ['upgrade:thermalLining'],
      steps: [
        {
          id: 'n5ToRoundhouse', text: 'The van came from the roundhouse. Get onto its roof, west side.', site: 'n5RoundhouseEntry', radius: 8,
          nudge: g('oracle', 'The roundhouse is at the south-west corner of the Yards. The stalls have a roof you can stand on.'),
          lines: [
            g('gordon', "Van's stopped, the driver's in a very cold cell. Says the boss keeps his books in the roundhouse office."),
            g('oracle', 'Four in the yard: a pistol, a rifle on the turntable side, a medic and one wandering in circles. Quiet would be better. Their radios go straight to the plant.'),
          ],
          interrupts: [{ id: 'n5Jack', at: 'n5JackSpot', radius: 22, fight: 'yardsJack', xp: 80, label: 'Optional: truck jacking stopped', lines: [v('dispatch', 'Any unit in the Yards: three suspects jacking a refrigerated truck on the yard road. It is, quote, very cold in there.')] }],
        },
        {
          id: 'n5RoundhouseRoom', type: 'fight', fight: 'roundhouse', text: 'Clear the roundhouse yard without raising the alarm.',
          tutorial: ['crouch', 'silent'],
          lines: [v('coldCrew', 'You hear that? Sounded like wings.'), v('coldCrew', "It's minus twelve. Even bats have the sense to stay in.")],
        },
        {
          id: 'n5Ledger', type: 'collect', item: 'n5Ledger', site: 'n5Ledger', radius: 3, text: 'Take the ledger from the roundhouse office.',
          lines: [g('oracle', "Bag it. I'll read it while you drive. I'm a fast reader. It's my one vice. Well. One of several.")],
        },
      ],
    },
    {
      id: 'm5Choice', title: 'Two Problems', checkpoint: 'n5Roundhouse', rewards: ['lore:sionisLedger'],
      steps: [
        { id: 'n5Twist', type: 'cutscene', scene: 'n5Twist', panels: 3 },
        {
          id: 'n5Choice', type: 'fork', text: 'The night shift is locked in a reefer car on the harbour road. The coolant cores are loading at the crusher. Pick one.',
          options: [
            { id: 'workers', text: 'Free the night shift', site: 'n5Workers', radius: 14, lines: [g('batman', 'People first.'), g('oracle', "Then the cores reach the plant and he gets stronger. I'll tell Gordon to brace.")] },
            { id: 'cores', text: 'Stop the coolant cores', site: 'n5Cores', radius: 14, lines: [g('batman', 'Gordon. The harbour road. A reefer car with people in it.'), g('gordon', "On it. My people will freeze their fingers off, but they'll get them out.")] },
          ],
          branches: { workers: 'n5WorkersFight', cores: 'n5CoresFight' },
          lines: [
            g('oracle', 'Two things at once, and he timed it that way. The night shift from the plant is locked in a reefer car on the harbour road. The last coolant cores are loading at the crusher.'),
            g('alfred', 'I find I dislike this gentleman more by the minute.'),
          ],
        },
        {
          id: 'n5WorkersFight', type: 'fight', fight: 'workersFight', text: 'Get the night shift out. His crew is guarding the car.', next: 'n5Board2', // [m45] was n5ToPlant: Black Ice sits between
          lines: [v('nightShift', "Is that him? Please tell me that's him. I can't feel my everything.")],
        },
        {
          id: 'n5CoresFight', type: 'fight', fight: 'coresFight', text: 'Stop the cores loading. Brute on the truck, pistols behind the crusher.',
          lines: [v('coldCrew', 'Load faster! The Bat is here!'), v('coldCrew', 'They are cores! They are heavy! They are COLD!')],
        },
      ],
    },
    // [m45] The money behind the ledger bought more than coolant: remote drone tanks are icing the
    // river bridge so nothing with a siren can get into the Yards. The Batmobile in battle mode,
    // on the junction at the foot of the bridge, on the way to the plant.
    {
      id: 'm5Ice', title: 'Black Ice', checkpoint: 'n5Car2', rewards: ['xp:250'],
      steps: [
        {
          id: 'n5Board2', type: 'board', text: 'Drone tanks are icing the river bridge. The Batmobile is on the harbour road.', site: 'n5Car2', talk: 'over',
          nudge: g('alfred', 'The car is on the harbour road, sir, between the roundhouse and the crusher. I have turned the seat warmers to "apology".'),
          lines: [
            g('gordon', 'My fire trucks cannot get in. Something is spraying the Ninetieth Street bridge, and the junction in front of it is a skating rink with turrets.'),
            g('oracle', 'Six remote tanks, and I know them. Purple and green. Those are the old clown drones, sold out of a police auction last spring, with frost sprayers bolted on. That is not his kit. That is the ledger again. The car is on the harbour road.'),
          ],
        },
        {
          id: 'n5IceBattle', type: 'battle', text: 'Six second-hand drone tanks are icing the river bridge. Battle mode: break them all before the bridge freezes shut.', site: 'n5IceSite', drones: 6,
          lines: [g('alfred', 'Lucius asks me to remind you that the cannon is non-lethal, the tanks are unmanned, and the paintwork is new. In that order of importance, sir. I asked. Somebody did not even repaint theirs.')],
        },
        // [m45] second pass: drones need a driver somewhere. A delivery van with too many aerials.
        {
          id: 'n5ControlChase', type: 'chase', text: 'The drones were driven from a van, and it is running for the harbour road. Ram it three times.', site: 'n5IceSite',
          path: [{ x: -370, z: 90 }, { x: -370, z: 197 }, { x: -310, z: 197 }, { x: -310, z: 90 }],
          van: { type: 'van_delivery', color: 0x3a3f4a, toast: 'Stop the control van. Ram it three times!', label: 'CONTROL VAN' },
          lines: [
            g('oracle', 'Six drones, one signal, and it just started moving. A delivery van with far too many aerials, south down the middle street. Whoever is in it has the receipts for all of this.'),
            g('gordon', 'Bring me a driver who can say a name in court and I will name a bridge after you. A small one.'),
          ],
        },
      ],
    },
    {
      id: 'm5Plant', title: 'The Cold-Storage Plant', checkpoint: 'yardsColdStorageDoor', rewards: ['xp:300'],
      steps: [
        {
          id: 'n5ToPlant', text: 'The cold-storage plant. Get to the loading door.', site: 'yardsColdStorageDoor', radius: 10,
          interrupts: [{ id: 'n5Pickets', at: 'n5Car', radius: 24, fight: 'n5Pickets', xp: 80, label: "Optional: the road to the plant is clear", lines: [{ speaker: 'oracle', portrait: 'oracle', text: "His crew put pickets on the yard road with cold packs. They will warn the plant if you walk past them." }] }], // [balance]
          nudge: g('oracle', 'The big white block south-east of the silos. You cannot miss it. It is the only building in Gotham with icicles in July.'),
          lines: [
            g('oracle', "He's on the roof, running the whole plant in reverse. Every compressor in there is pushing cold out instead of in."),
            g('gordon', 'Whatever you did back there, it mattered. Everybody from the plant is accounted for, one way or another. Finish it.'),
          ],
          banter: [g('alfred', 'For what it is worth, sir, the man is doing this for someone he loves. It does not make it right. It does make it sad.')],
        },
        {
          id: 'n5IfCold', type: 'life', test: 'choice:n5.shelter=bruce',
          yesLines: [g('oracle', 'The coolant from the crusher made it in. He has more men on the door than he should. Your choice, your consequences.')],
          branches: { yes: 'n5PlantGuard', no: 'n5Roof' },
        },
        {
          id: 'n5PlantGuard', type: 'fight', fight: 'plantGuard', text: 'The coolant you let go bought him a door crew. Clear them.',
          lines: [v('coldCrew', 'Boss says you would come in cold. Ha. Cold. Get it?'), v('coldCrew', 'Please stop.')],
        },
        {
          id: 'n5Roof', text: 'Up to the plant roof. Stay near the heat vents.', site: 'coldRoofEntry', radius: 6,
          nudge: g('oracle', 'Grapple to the roof edge on the west side. Twenty metres. It will be colder up there. Considerably.'),
          lines: [g('oracle', "His suit is armoured everywhere. You won't dent it with your hands. But the roof has steam valves on every edge. Steam plus a cold suit equals a very bad day for the seals.")],
        },
        {
          id: 'n5Boss', type: 'boss', boss: 'freeze', text: 'Lure him over a vent and turn its valve. Steam cracks his suit. Use the units for cover.', checkpoint: 'coldRoofEntry', villain: 'mrFreeze',
          lines: [g('oracle', 'Valves on the edges, vents in the middle. Get him standing on a vent, then turn its valve. And stay behind something when he raises that gun.')],
        },
      ],
    },
    {
      id: 'm5After', title: 'Thaw', checkpoint: 'coldRoofEntry', rewards: ['lore:freezeFile', 'gadget:thermalCharge'],
      steps: [
        {
          id: 'n5Core', type: 'collect', item: 'n5Core', site: 'n5Core', radius: 3, text: 'Pull the master coolant core out of his rig.',
          lines: [
            g('gordon', 'Temperature in the Yards is climbing. My officers are taking their scarves off. One of them is crying, but I think that is just relief.'),
            g('oracle', 'And his wife\'s chamber is on its own power now. Lucius sent a team. Nobody had to freeze a district for it.'),
          ],
        },
        {
          id: 'n5End', type: 'nightEnd', text: 'Dawn in the Yards. The ice is melting.',
          after: 'Act III is over. Black Mask paid for the fear and the frost. Free roam: Gotham is yours until the next signal.',
          lines: [
            g('oracle', 'Same company on the ledger as on the doctor\'s notebook. Sionis Cold Holdings. Registered office: the Wolf Point tower.'),
            g('alfred', 'Black Mask, then. Bankrolling other people\'s nightmares and keeping his own hands warm. I shall put the kettle on. It seems we have a long week ahead.'),
          ],
        },
      ],
    },
  ],
};
