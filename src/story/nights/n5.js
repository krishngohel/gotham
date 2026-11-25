// Night Five, "Cold Storage" (Act III, The Underside). The cold-suit scientist's crew is stripping
// the Yards of coolant to turn the old cold-storage plant into a freezer the size of a district.
// The night is about endurance and the environment: frost at the gate (investigation), his crew at
// the steelworks (the first pistols), a run up the grain elevators ahead of the frost, a reefer
// van chase on the yard roads, a predator room in the roundhouse, a ledger that changes the act,
// a choice between the night shift and the coolant cores, and a boss you cannot hit head-on.
// New role this night: the pistol (tutorial beat at the furnace). Format:
// docs/design/story-format.md. Every site below was checked against the live collision.
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
};

const FIGHTS = {
  // The pistol's tutorial at the steelworks furnace, then a mixed second wave.
  furnaceCrew: { site: 'n5Furnace', radius: 14, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 5, ring: 7, lead: 'pistol' }, { budget: 8, ring: 7, lead: 'shield' }] },
  roundhouse: { stealth: 'roundhouseRoom' },
  // The choice: the night shift or the coolant cores. Both are four-type fights (hard means mix).
  workersFight: { site: 'n5Workers', radius: 13, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 8, ring: 6, lead: 'medic' }, { budget: 9, ring: 7, lead: 'baton' }] },
  coresFight: { site: 'n5Cores', radius: 13, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 8, ring: 6, lead: 'pistol' }, { budget: 10, ring: 7, add: [{ type: 'brute', dx: 0, dz: 8 }] }] },
  yardsJack: { site: 'n5JackSpot', radius: 10, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 3, ring: 4 }] },
  // [story2]
  crusherRaid: { site: 'n5Crusher', radius: 13, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 7, ring: 7, lead: 'pistol' }, { budget: 8, ring: 7, lead: 'shield' }] },
  plantGuard: { site: 'n5PlantDoor', radius: 12, gang: 'freeze', act: 3, district: 'yards', waves: [{ budget: 8, ring: 7, lead: 'brute' }, { budget: 8, ring: 7, lead: 'pistol' }] },
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
          id: 'n5Ribbon', type: 'civvy', outfit: 'suit', text: 'The shelter. Smile for the cameras.', next: 'n5ToRoundhouse',
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
          id: 'n5WorkersFight', type: 'fight', fight: 'workersFight', text: 'Get the night shift out. His crew is guarding the car.', next: 'n5ToPlant',
          lines: [v('nightShift', "Is that him? Please tell me that's him. I can't feel my everything.")],
        },
        {
          id: 'n5CoresFight', type: 'fight', fight: 'coresFight', text: 'Stop the cores loading. Brute on the truck, pistols behind the crusher.',
          lines: [v('coldCrew', 'Load faster! The Bat is here!'), v('coldCrew', 'They are cores! They are heavy! They are COLD!')],
        },
      ],
    },
    {
      id: 'm5Plant', title: 'The Cold-Storage Plant', checkpoint: 'yardsColdStorageDoor', rewards: ['xp:300'],
      steps: [
        {
          id: 'n5ToPlant', text: 'The cold-storage plant. Get to the loading door.', site: 'yardsColdStorageDoor', radius: 10,
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
