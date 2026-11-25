// Night Two, "Cold Feet" (Act II, The Gilded City): the crime boss in the top hat moves uptown.
// With the Joker in Arkham, the old fence from Neon Row's ICEBERG dive has opened the Iceberg Lounge
// on Gotham Mile and is buying up the city: a diamond heist pays for proxy votes on the Narrows
// redevelopment, smuggled through the river under Lower Gotham. Verbs in order: fight (the new
// shield role), detective scan, Batmobile chase, timed rooftop run, a branch (the old dive or the
// river), fight on the river walk, predator room under the deck, the twist, a door fight, and the
// boss on the Lounge roof (gadgets and crowd control: src/bosses/defs/penguin.js).
// Every site below was checked against the live collision (groundBelow) on 2026-11-24.
import { titleCard } from '../../ui/comicArt.js';
import { villainCard } from '../../bosses/defs/penguinRiddlerArt.js';
import { W, route } from '../rooms.js';
import { v, recap } from './common.js'; // [story2]

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const SOUTH = 0, NORTH = Math.PI, EAST = Math.PI / 2, WEST = -Math.PI / 2;

const sites = {
  n2Mile: { x: 0, y: 0.15, z: -648 },
  n2Heist: { x: 0, y: 0, z: -653 },
  n2Board: { x: 30, y: 0, z: -690, yaw: Math.PI },
  n2RunStart: { x: 60, y: 22, z: -615 },
  n2Gate1: { x: 114, y: 44, z: -620 },
  n2Gate2: { x: 120, y: 30, z: -680 },
  n2Gate3: { x: 187, y: 38, z: -683 },
  n2Gate4: { x: 192, y: 64, z: -740 },
  n2Dive: { x: 180, y: 0, z: 88 },
  n2DiveDoor: { x: 180, y: 0, z: 95 },
  n2RiverWalk: { x: 120, y: -4.5, z: -271 },
  n2Toll: { x: 150, y: 0, z: -479 },
  n2UnderEntry: { x: 0, y: -4.5, z: -271 },
  n2Under: { x: 45, y: -4.5, z: -271 },
  n2Ledger: { x: 80, y: -4.5, z: -271 },
  n2LoungeFront: { x: 60, y: 0, z: -590 },
  n2LoungeRoof: { x: 50, y: 22, z: -611, yaw: NORTH },
  n2PenguinArena: { x: 49, y: 22, z: -623 },
  n2PenguinStart: { x: 49, y: 22, z: -634 },
  // [story2] Bruce on the guest list
  n2Doorman: { x: 60, y: 0, z: -598 },
  n2Tables: { x: 46, y: 0, z: -594 },
  n2Office: { x: 74, y: 0, z: -596 },
  n2Alley: { x: 80, y: 0, z: -590 },
};

const fights = {
  heist: { site: 'n2Heist', radius: 14, gang: 'penguin', act: 2, district: 'gothamMile', waves: [{ budget: 4, lead: 'shield', ring: 6 }, { budget: 6, ring: 7 }] },
  oldDive: { site: 'n2Dive', radius: 14, gang: 'penguin', act: 2, district: 'core', waves: [{ budget: 5, ring: 5 }] },
  toll: { site: 'n2Toll', radius: 12, gang: 'penguin', act: 2, district: 'loop', waves: [{ budget: 3, ring: 4 }] },
  riverWalk: {
    site: 'n2RiverWalk', radius: 14, gang: 'penguin', act: 2, district: 'river',
    waves: [
      { budget: 5, spots: [[-6, 0], [6, 0], [-10, 0], [10, 0], [-3, 1], [3, 1]] },
      { budget: 7, spots: [[-14, 0], [14, 0], [-8, 1], [8, 1], [-18, 0], [18, 0], [0, 1]] },
    ],
  },
  undercroft: { stealth: 'undercroft' },
  loungeDoor: { site: 'n2LoungeFront', radius: 14, gang: 'penguin', act: 2, district: 'gothamMile', waves: [{ budget: 6, ring: 6 }, { budget: 7, ring: 6, start: 0.4, add: [{ type: 'brute', dx: 0, dz: -5 }] }] },
};

// The river walk west of the smugglers' boat: a 6 m strip between the river wall and the dark
// under the Lower Gotham deck, two lamps, crates for cover. (The deck itself is too low for the
// follow camera, so the squad walks the open strip.)
const rooms = {
  undercroft: {
    id: 'undercroft', site: 'n2Under', entry: 'n2UnderEntry', radius: 30, gang: 'penguin',
    bounds: { minX: 8, maxX: 88, minY: -7, maxY: 0, minZ: -276, maxZ: -266 },
    lights: [{ x: 28, y: -1.5, z: -269, r: 5, post: true, base: -4.5 }, { x: 62, y: -1.5, z: -269, r: 5, post: true, base: -4.5 }],
    cover: [{ x: 20, y: -4.5, z: -270, w: 1.4, d: 1.4, h: 1.4 }, { x: 40, y: -4.5, z: -272, w: 1.4, d: 1.4, h: 1.4 }, { x: 52, y: -4.5, z: -269.5, w: 1.4, d: 1.4, h: 1.4 }, { x: 70, y: -4.5, z: -272, w: 1.4, d: 1.4, h: 1.4 }],
    huddle: { x: 46, y: -4.5, z: -271 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(15, -4.5, -271, 2, EAST), W(75, -4.5, -271, 2, WEST)) },
      { type: 'grunt', route: route('pingpong', W(30, -4.5, -272, 3, EAST), W(58, -4.5, -272, 3, WEST)) },
      { type: 'knife', route: route('pingpong', W(48, -4.5, -270, 4, EAST), W(82, -4.5, -270, 4, WEST)) },
      { type: 'rifle', route: route('pingpong', W(84, -4.5, -271, 5, WEST), W(84, -4.5, -270, 5, WEST)) },
    ],
  },
};

const scenes = {
  // [story2]
  n2Recap: (stage) => recap(stage, {
    title: 'The Long Night',
    panels: [
      'One night of storm and laughter: the Joker took the clock tower, and the city, hostage. Batman took them back.',
      { shot: { cam: [20, 60, 30], look: [0, 44, 0] }, caption: 'The Joker is in Arkham. The signal is off. For six hours, Gotham was quiet.' },
      { shot: { cam: [40, 16, -560], look: [60, 6, -602] }, caption: 'Then a new club opened on Gotham Mile, and somebody started buying up the city.' },
    ],
  }),
  // The heist was a bank deposit: the twist under the deck.
  n2Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [72, -2.5, -268], look: [80, -4, -271] }), caption: 'A ledger in a cash crate, on the river under Lower Gotham. Every diamond from Diamond Row has a buyer.' },
      { img: titleCard('PROXY VOTES', 'Wayne Enterprises, Narrows redevelopment, 9 a.m.'), caption: 'The buyers are Wayne shareholders. The diamonds buy their votes.', captionPos: 'bottom' },
      { img: villainCard('riddler', 'READ IT FIRST', 'a green question mark on the last page'), caption: 'And somebody else got here first.', captionPos: 'bottom' },
    ],
  }],
  penguinIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [50, 27, -603], look: [49, 23, -630], hero: { at: [50, 22, -612], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The Iceberg Lounge roof. A private party with a dress code.' },
      { img: villainCard('penguin', 'THE ICEBERG LOUNGE', 'members only'), balloons: [{ text: 'You are tracking mud on my ice, Detective. Gentlemen, the umbrellas.', x: 50, y: 5, w: 78 }] },
    ],
  }],
  penguinOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [44, 25, -615], look: [49, 22.5, -628], hero: { at: [47, 22, -621], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The umbrellas are scrap. The bodyguards are asleep. The host is out of hats.' },
      { img: villainCard('penguin', 'LAST CALL', 'the lounge is closed'), balloons: [{ text: 'You have no idea who holds those votes, do you? I only sold them. Somebody clever is buying.', x: 50, y: 5, w: 80 }] },
    ],
  }],
  n2End: () => [{ layout: 'single', panels: [{ span: 'full', img: titleCard('END OF NIGHT TWO', 'The votes are safe. The buyer is not done.') }] }],
};

export default {
  id: 'n2', act: 'act2', number: 2, actNumber: 2,
  title: 'Night Two: Cold Feet',
  blurb: 'A diamond heist on Gotham Mile, a smuggling line under Lower Gotham, and a host with an umbrella for every occasion.',
  villain: 'penguin', gang: 'penguin',
  districts: ['gothamMile', 'river', 'lowerGotham'],
  timeOfDay: 21.5, weather: 'rain',
  start: 'n2Mile',
  day: {
    hook: 'day.n2',
    context: {
      after: 'n1', mood: 'morning after',
      appointments: [{ at: '09:00', what: 'Wayne Enterprises board: the Narrows redevelopment vote', place: 'wayneTowerLobby' }, { at: '20:00', what: 'Charity auction at the Grand Kane Hotel', place: 'grandKaneDoorman' }],
      news: 'The Joker is back in Arkham. Gotham Mile has a new nightclub.',
    },
    fallback: [
      g('alfred', 'Good evening, sir. The board postponed the Narrows vote to tomorrow morning. Several shareholders suddenly want to "think about it".'),
      g('alfred', 'Meanwhile a new club opened on Gotham Mile. Ice sculptures, a dress code, and a proprietor in a top hat. I am sure it is all perfectly legal.'),
    ],
  },
  sites, fights, rooms, scenes,
  missions: [
    {
      id: 'm2Opening', title: 'The Gilded City', rewards: [],
      steps: [
        { id: 'n2Recap', type: 'cutscene', scene: 'n2Recap' },
        {
          id: 'n2Start', text: 'Alarms on Gotham Mile. Head for Diamond Row.', site: 'n2Mile', radius: 20,
          title: { text: 'ACT TWO: THE GILDED CITY', sub: 'Night Two: Cold Feet' },
          nudge: g('gordon', 'Diamond Row, Batman. North of the river, past the Loop. Follow the alarms.'),
          lines: [
            g('gordon', 'Joker is back in his cell. Gotham was quiet for six hours. I think that is a record.'),
            g('gordon', 'Then every jeweller on Diamond Row went off at once. Gotham Mile, north end.'),
            g('oracle', 'Oracle here. The alarms tripped in order, east to west, eleven seconds apart. Somebody planned this with a stopwatch.'),
          ],
          banter: [
            g('radio', 'Gotham Late Night FM. Tonight: overcast, with a ninety percent chance of being punched if you are up to no good.'),
            g('alfred', 'For the record, sir, the new club on the Mile sent the Manor an invitation. Black tie. Umbrellas provided.'),
          ],
        },
      ],
    },
    {
      id: 'm2Heist', title: 'Diamond Row', rewards: ['xp:150'], checkpoint: 'n2Mile',
      steps: [
        {
          id: 'heistFight', type: 'fight', fight: 'heist', text: 'Stop the heist. Shield goons: vault over them, cape stun, or hit them from the air.',
          tip: { title: 'NEW: SHIELD GOON', text: 'A riot shield stops strikes from the front. Vault over him (dodge through), cape stun him, or come down from the air, then hit him.' },
          lines: [
            g('goon', 'Mr. Cobblepot said nobody comes to Diamond Row at night. Mr. Cobblepot is wrong a lot lately.'),
            g('goon', 'Shields up! He can not punch through a shield! ...Right? Somebody say right.'),
          ],
        },
        {
          id: 'heistScan', type: 'scan', text: 'Detective vision: find out who planned this. Three clues on Diamond Row.', hold: 1.2,
          points: [
            { site: 'diamondRow0', lines: [g('oracle', 'Frost on the broken glass. Somebody chilled the window with a canister before they hit it. That is not a smash and grab, that is a recipe.')] },
            { site: 'diamondRow3', lines: [g('oracle', 'A matchbook. The Iceberg Lounge, Gotham Mile. Members only. Of course it is.')] },
            { site: 'diamondAlley', lines: [g('alfred', 'Tyre marks and the smell of a very expensive cigar. The getaway car is still circling the block, sir. Bold.')] },
          ],
          optional: [{ id: 'n2Belfry', title: 'Optional: the Old Church belfry, a smuggler lookout', site: 'oldChurchBelfry', radius: 5, xp: 60, done: 'Belfry lookout found: a pair of opera glasses and a very cold thermos.', lines: [g('oracle', 'Opera glasses pointed straight at the Lounge. Somebody is watching the watchers.')] }],
          nudge: g('oracle', 'Detective vision on, and stand by the windows and the alley. The clues glow.'),
        },
      ],
    },
    {
      id: 'm2Pursuit', title: 'Black Sedan', rewards: ['xp:150'], // [fix1] gadget reward
      steps: [
        {
          id: 'n2Board', type: 'board', text: 'The getaway car is circling the Mile. Get in the Batmobile.', site: 'n2Board', checkpoint: 'n2Heist', talk: 'over',
          nudge: g('alfred', 'The car is on the street west of the alley, sir. Waiting, like the rest of us.'),
          lines: [g('alfred', 'I have parked the car one block west. Do try to return it with the same number of doors.')],
        },
        {
          id: 'n2Chase', type: 'chase', text: 'Ram the getaway car 3 times before it reaches the river.', site: 'n2Board',
          path: [{ x: 30, z: -713 }, { x: 90, z: -713 }, { x: 150, z: -713 }, { x: 150, z: -653 }, { x: 90, z: -653 }, { x: 30, z: -653 }],
          // [story2] its own quarry, and the board calls mid-chase
          van: { type: 'sedan_deco', color: 0x111116, toast: 'Stop the black sedan. Ram it three times!', label: 'SEDAN' },
          calls: [{
            id: 'stone', from: 'board', after: 9, timeout: 12, default: 'later',
            lines: [v('stone', 'Bruce? Garrick Stone. Sorry to call so late. Is that an engine? Never mind. Will you back the Narrows redevelopment on Thursday? Yes or no.')],
            prompt: 'Garrick Stone wants your vote, mid-chase',
            options: [
              { id: 'yes', tag: 'yes', text: '"Sure, Garrick. Whatever you think."', effects: { standing: 2, flags: { 'lead.stone pushed the Narrows deal': true } }, lines: [v('stone', 'Splendid. You will not regret it.'), g('alfred', 'You may regret it, sir.')] },
              { id: 'no', tag: 'no', text: '"Not until I know who is buying."', effects: { standing: -1, suspicion: { villain: 2 } }, lines: [v('stone', 'Since when do you read the paperwork, Bruce?')] },
              { id: 'later', tag: 'later', text: 'Hang up. Both hands on the wheel.', effects: { standing: -2 }, lines: [g('alfred', 'Mr. Stone has called back twice. I told him you were in a tunnel. Technically true.')] },
            ],
          }],
          lines: [
            g('oracle', 'There. A loop of the Mile, again and again. He is not escaping, he is waiting for someone.'),
            g('goon', 'Is that him? Behind us? Tell me that is a very big taxi.'),
          ],
        },
      ],
    },
    {
      id: 'm2Drone', title: 'The Umbrella Run', rewards: ['xp:200'], // [fix1] gadget reward
      steps: [
        {
          id: 'droneRun', type: 'traverse', text: 'A drone took the diamonds off the car roof. Follow it across the rooftops before it gets away.', checkpoint: 'icebergRoof',
          gates: ['n2RunStart', 'n2Gate1', 'n2Gate2', 'n2Gate3', 'n2Gate4'], timer: 100, bonus: 8, radius: 5,
          tutorial: ['grapple', 'grappleBoost'],
          lines: [
            g('alfred', 'The driver passed a case up to a drone. It is flying a very particular route, sir, with lights on it. Like a parade.'),
            g('oracle', 'I can see its transponder for about a minute and a half before it drops out of range. Rings on your display. Go.'),
          ],
          failLines: [g('oracle', 'Lost it. It circles back to the Lounge roof every few minutes, he is that predictable. Back to the first ring.')],
        },
      ],
    },
    {
      id: 'm2Smugglers', title: 'Follow the Money', rewards: ['xp:250', 'gadget:sonic'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n2Fork', type: 'fork', text: 'The drone dropped the case into the river. Check his old dive in Neon Row first, or go straight to the river walk.',
          options: [
            { id: 'dive', text: 'The old ICEBERG dive in Neon Row', site: 'n2Dive', radius: 14, lines: [g('gordon', 'His old place. He moved uptown, but people do not change their locks.')] },
            { id: 'river', text: 'The river walk under the Loop', site: 'n2RiverWalk', radius: 12, lines: [g('oracle', 'Straight to the river. Bold. The old dive can wait.')] },
          ],
          branches: { dive: 'diveFight', river: 'toRiverWalk' },
          lines: [g('oracle', 'Two leads. His old dive on Neon Row still has its sign, and the river walk under the Loop has a lot of very fresh footprints.')],
        },
        {
          id: 'diveFight', type: 'fight', fight: 'oldDive', text: 'Clear the old ICEBERG dive.',
          lines: [g('goon', 'Boss said nobody comes here anymore! He said the new place has valet!')],
        },
        {
          id: 'diveClue', type: 'scan', site: 'n2DiveDoor', text: 'Scan the dive door for where the smuggling goes.', hold: 1,
          points: [{ site: 'n2DiveDoor', lines: [g('oracle', 'A tide table taped behind the door. Lower Gotham, under the deck, 23:00. That is in an hour.')] }],
        },
        {
          id: 'toRiverWalk', text: 'Down to the river walk under the Loop.', site: 'n2RiverWalk', radius: 12, checkpoint: 'n2RiverWalk',
          nudge: g('gordon', 'The river walk is below street level, Batman. South of the Loop, along the water.'),
          lines: [
            g('gordon', 'Harbour patrol saw crates going under the Lower Gotham deck all week. They assumed it was fish.'),
            g('alfred', 'It is never fish, sir.'),
          ],
          banter: [
            g('radio', 'Be advised, the river bridge is lifting. Again. No, nobody knows where the boats are going at this hour.'),
            g('oracle', 'Penguin has bought four buildings on the Mile this month. He paid in cash. Cold cash. I am not apologising for that.'),
          ],
          interrupts: [{ id: 'n2Toll', at: 'n2Toll', radius: 26, fight: 'toll', xp: 80, label: 'Optional: the umbrella toll on the Loop is closed', lines: [g('radio', 'Units in the Loop: men with umbrellas are charging pedestrians a toll to cross the street. In fine weather.')] }],
        },
        {
          id: 'riverFight', type: 'fight', fight: 'riverWalk', text: 'Clear the smugglers off the river walk.',
          lines: [
            g('goon', 'Load faster! The boss pays by the crate, not by the hour!'),
            g('goon', 'Why is it always a river? Why can we never smuggle in a nice warm lobby?'),
          ],
        },
      ],
    },
    {
      id: 'm2Undercroft', title: 'Under the Deck', rewards: ['gadget:disruptor'], checkpoint: 'n2UnderEntry',
      steps: [
        {
          id: 'undercroft', type: 'fight', fight: 'undercroft', text: 'Riflemen guard the river walk to the boat. Stay in the dark and take them silently.', tutorial: ['crouch', 'silent'],
          lines: [
            g('oracle', 'Four of them between you and the boat, two rifles. Lamps at two spots, dark under the deck beside you. You know the drill.'),
            g('goon', 'Kevin, stop checking the ceiling. ...Actually, keep checking the ceiling.'),
          ],
        },
        {
          id: 'ledger', type: 'collect', item: 'ledger', site: 'n2Ledger', radius: 3, text: 'Take the ledger from the cash crate.',
          nudge: g('alfred', 'The crate at the east end, sir. The one with a lock and a sense of self importance.'),
          lines: [g('oracle', 'That crate is lined with lead and labelled "frozen fish". Open it.')],
        },
        { id: 'n2Twist', type: 'cutscene', scene: 'n2Twist', panels: 3 },
      ],
    },
    // [story2] Bruce on the guest list: the Iceberg Lounge collision scene, played as a night mission.
    {
      id: 'm2Guest', title: 'The Guest List', checkpoint: 'n2LoungeFront', rewards: ['xp:150', 'lore:icebergMenu'],
      steps: [
        {
          id: 'n2GuestIn', type: 'civvy', outfit: 'tux', text: 'Bruce Wayne has an invitation. Use it.', site: 'n2Doorman',
          card: 'The Lounge will not let Batman in the front door. It will let Bruce Wayne in. Be charming, be foolish, look at everything.',
          beats: [
            { id: 'door', site: 'n2Doorman', text: 'The doorman, by the ice-blue door.', lines: [v('doorman', 'Mr. Wayne. You are on the list. You are at the top of the list. Your coat, sir? And your, er, bruise?')],
              choice: { key: 'n2.bruise', prompt: 'The doorman is looking at your cheek', default: 'polo', options: [
                { id: 'polo', tag: 'excuse', text: 'Polo. A very rude pony.', effects: { suspicion: { reporter: 1 } }, lines: [v('doorman', 'Of course, sir. Ponies.')] },
                { id: 'door', tag: 'excuse', text: 'I walked into my own front door. It is a very big door.', effects: { standing: -1 }, lines: [v('doorman', 'Happens to the best of us, sir. Mostly to you, I gather.')] },
              ] } },
            { id: 'cards', site: 'n2Tables', text: 'The high table. He is dealing.', lines: [v('penguin', 'Wayne! Sit, sit. A friendly hand. I will even let you shuffle. Do you know how to shuffle?'), g('alfred', 'He tells, sir. When he bluffs he polishes the monocle.')],
              choice: { key: 'n2.cards', prompt: 'High stakes with the club owner: he is polishing the monocle', default: 'lose', options: [
                { id: 'lose', tag: 'mask on', text: 'Fold a winning hand. Laugh about it.', effects: { standing: -1, suspicion: { villain: -3 }, credit: -10 }, lines: [v('penguin', 'Ha! A gentleman and a terrible card player. My favourite kind of guest.')] },
                { id: 'win', tag: 'win', text: 'Call his bluff. Take the pot.', effects: { standing: 2, suspicion: { villain: 6 }, credit: 20 }, lines: [v('penguin', 'Well. Well, well. Lucky night, Mr. Wayne. I will remember it.'), g('alfred', 'He will, too.')] },
              ] } },
            { id: 'office', site: 'n2Office', text: 'The back office door, ajar.', lines: [g('bruce', 'A ledger, open on the desk. The buyer of the Narrows proxies: a shell company with a cold-storage address.'), g('alfred', 'You have been away from the table for a minute, sir. People are noticing your champagne is lonely.')] },
            { id: 'out', site: 'n2Alley', text: 'Out the side door into the alley.', lines: [g('bruce', 'Alfred. The car, and the other suit.')] },
          ],
        },
      ],
    },
    {
      id: 'm2Lounge', title: 'The Iceberg Lounge', checkpoint: 'n2LoungeFront', rewards: ['xp:200'],
      steps: [
        {
          id: 'toLounge', text: 'Back to the Iceberg Lounge on Gotham Mile. He is meeting the buyers tonight.', site: 'n2LoungeFront', radius: 14,
          nudge: g('gordon', 'The Iceberg Lounge. Gotham Mile, the ice blue front with the bouncers.'),
          lines: [
            g('gordon', 'Proxy votes. He is buying a seat at the Wayne board table with stolen diamonds.'),
            g('alfred', 'If he wins tomorrow, sir, the Narrows goes to a front company by lunch. I will cancel your breakfast.'),
            g('oracle', 'The Lounge has a party on the roof. Twelve guests, twenty bodyguards. Typical ratio for that crowd.'),
          ],
          banter: [
            g('nightwing', 'Heard you are taking on the Penguin. Bring an umbrella. Seriously, he has one for every occasion.'),
            g('alfred', 'Master Dick asked if you have learned to say thank you yet. I said we are working on it.'),
          ],
        },
        {
          id: 'loungeDoor', type: 'fight', fight: 'loungeDoor', text: 'The bouncers at the door. Members only, apparently.',
          lines: [
            g('goon', 'Sorry pal, dress code. No capes. ...That was a joke. Please laugh.'),
            g('goon', 'I took this job for the dental plan. There is no dental plan.'),
          ],
        },
        {
          id: 'toLoungeRoof', text: 'Up to the Lounge roof. Grapple.', site: 'n2LoungeRoof', radius: 8, tutorial: ['grapple'],
          nudge: g('oracle', 'Roof party. Straight up from the door. Grapple.'),
          lines: [g('penguin', 'A visitor! Without an invitation. How very common. Do come up, Detective, the view is wonderful and the fall is worse.')],
        },
      ],
    },
    {
      id: 'm2Penguin', title: 'Last Call', rewards: ['xp:500', 'lore:penguinFile'], checkpoint: 'n2LoungeRoof',
      steps: [
        { id: 'penguinBoss', type: 'boss', boss: 'penguin', text: 'Take down the Penguin. Gadgets open his umbrella. Bodyguards first.', checkpoint: 'n2LoungeRoof' },
        {
          id: 'n2Wrap', type: 'wait', seconds: 7, text: 'GCPD is on the way up.',
          lines: [
            g('gordon', 'We have him, the diamonds and the ledger. The vote is safe for tomorrow.'),
            g('gordon', 'One thing. The ledger has a green question mark on the last page. My forensics people say it was drawn with a very expensive pen.'),
            g('alfred', 'A question mark, sir. I do hope that is not a signature.'),
          ],
        },
        { id: 'n2End', type: 'nightEnd', scene: 'n2End', after: 'The Penguin is in custody. Gotham Mile can keep its ice.', rewards: ['xp:100'] },
      ],
    },
  ],
};
