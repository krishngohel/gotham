// Night Three, "Know-It-All" (Act II, The Gilded City): the man who read the Penguin's ledger first
// turns the Loop into a quiz show. He has the proxy votes the Penguin was selling and wants the
// world's greatest detective to earn them back, one riddle at a time, live on the Gazette's screens.
// Verbs in order: fight (the new baton role), detective scan, a timed death-trap run on the El,
// a plate puzzle on the City Hall steps, a predator alley, a timed trap at the foot of Wayne Tower
// and its clue, the twist (he has mapped every route Batman takes), a fight on the Exchange steps,
// the climb to the Gazette roof and the boss: a puzzle, not a brawl (src/bosses/defs/riddler.js).
// Every site below was checked against the live collision (groundBelow) on 2026-11-24.
import { titleCard } from '../../ui/comicArt.js';
import { villainCard } from '../../bosses/defs/penguinRiddlerArt.js';
import { W, route } from '../rooms.js';
import { v, recap } from './common.js'; // [story2]

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const SOUTH = 0, NORTH = Math.PI, EAST = Math.PI / 2, WEST = -Math.PI / 2;

const sites = {
  n3Loop: { x: -30, y: 0, z: -330 },
  n3Bank: { x: -150, y: 0, z: -500 },
  n3BankN: { x: -150, y: 0, z: -490 },
  n3BankS: { x: -150, y: 0, z: -512 },
  n3El1: { x: -90, y: 7.26, z: -400 },
  n3El2: { x: -90, y: 7.26, z: -490 },
  n3El3: { x: -30, y: 7.26, z: -539 },
  n3El4: { x: 60, y: 7.26, z: -539 },
  n3El5: { x: 90, y: 7.26, z: -490 },
  n3El6: { x: 90, y: 7.26, z: -420 },
  n3CityHall: { x: 160.6, y: 1.35, z: -449 },
  n3CityHallStreet: { x: 146, y: 0, z: -449 },
  n3PlateN: { x: 159.5, y: 1.08, z: -456 },
  n3PlateS: { x: 159.5, y: 1.08, z: -442 },
  n3PlateE: { x: 160.5, y: 1.35, z: -449 },
  n3PlateW: { x: 147, y: 0, z: -449 },
  n3PlateC: { x: 153.5, y: 0, z: -449 },
  n3Alley: { x: -240, y: 0.15, z: -450 },
  n3AlleyEntry: { x: -252, y: 26, z: -466 },
  n3Cipher: { x: -240, y: 0.15, z: -428 },
  n3Trivia: { x: -150, y: 0, z: -419 },
  n3Plaza: { x: 0, y: 0, z: -420 },
  n3Trap1: { x: -14, y: 0, z: -418 },
  n3Trap2: { x: 14, y: 0, z: -418 },
  n3Trap3: { x: 0, y: 8.6, z: -431 },
  n3Trap4: { x: 0, y: 0, z: -410 },
  n3LobbyDoor: { x: 0, y: 0.15, z: -432.6 },
  n3Exchange: { x: -150, y: 0, z: -539 },
  n3Lookout: { x: -60, y: 40, z: -495 },
  n3GazetteCP: { x: 2, y: 48, z: -496, yaw: NORTH },
  n3RiddlerArena: { x: 2, y: 48, z: -510 },
  n3RiddlerStart: { x: 2, y: 48, z: -524 },
  // [story2] the City Hall charity gala, and the bomb in the canyon
  n3GalaFront: { x: 146, y: 0, z: -449 },
  n3GalaNorth: { x: 146, y: 0, z: -462 },
  n3GalaSouth: { x: 146, y: 0, z: -436 },
  n3Bomb: { x: -141, y: 0, z: -500 },
  n3BombA: { x: -146, y: 0, z: -494 },
  n3BombB: { x: -141, y: 0, z: -508 },
};

const fights = {
  bank: { site: 'n3Bank', radius: 14, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 4, lead: 'baton', ring: 6 }, { budget: 7, ring: 7 }] },
  trivia: { site: 'n3Trivia', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 3, ring: 4 }] },
  lookout: { site: 'n3Lookout', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [[{ type: 'grunt', dx: -2, dz: -2 }, { type: 'knife', dx: 2, dz: 1 }]] },
  alley: { stealth: 'deliveryAlley' },
  exchange: { site: 'n3Exchange', radius: 14, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 7, ring: 6, lead: 'baton' }, { budget: 9, ring: 7, add: [{ type: 'brute', dx: 0, dz: 6 }] }] },
  // [story2]
  bombCrew: { site: 'n3Bomb', radius: 12, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 5, ring: 6, lead: 'baton' }] },
  exchangeBig: { site: 'n3Exchange', radius: 14, gang: 'riddler', act: 2, district: 'loop', waves: [{ budget: 7, ring: 6, lead: 'baton' }, { budget: 9, ring: 7, add: [{ type: 'brute', dx: 0, dz: 6 }] }, { budget: 8, ring: 7, lead: 'shield' }] },
};

// The Question Mark Delivery depot: a 5 m alley between a 26 m and a 40 m block, riflemen on both
// roofs, two on the alley floor, lamp posts at either end and a dark middle.
const rooms = {
  deliveryAlley: {
    id: 'deliveryAlley', site: 'n3Alley', entry: 'n3AlleyEntry', radius: 26, gang: 'riddler',
    bounds: { minX: -262, maxX: -222, minY: -1, maxY: 45, minZ: -470, maxZ: -428 },
    lights: [{ x: -240, y: 4, z: -462, r: 5, post: true, base: 0.15 }, { x: -240, y: 4, z: -436, r: 5, post: true, base: 0.15 }],
    cover: [{ x: -239, y: 0.15, z: -452, w: 1.4, d: 1.6, h: 1.4 }, { x: -241, y: 0.15, z: -444, w: 1.4, d: 1.6, h: 1.4 }],
    huddle: { x: -240, y: 0.15, z: -448 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(-256, 26, -460, 2, EAST), W(-248, 26, -436, 2, EAST)) },
      { type: 'rifle', route: route('pingpong', W(-232, 40, -436, 2, WEST), W(-228, 40, -460, 2, WEST)) },
      { type: 'grunt', route: route('pingpong', W(-240, 0.15, -466, 3, NORTH), W(-240, 0.15, -434, 3, SOUTH)) },
      { type: 'knife', route: route('pingpong', W(-240, 0.15, -440, 4, SOUTH), W(-240, 0.15, -456, 4, NORTH)) },
    ],
  },
};

const scenes = {
  // [story2]
  n3Recap: (stage) => recap(stage, {
    title: 'Last call at the Iceberg',
    panels: [
      'The Penguin is in custody, his ledger is in evidence, and the proxy votes he was selling for the Narrows land are missing.',
      { shot: { cam: [40, 30, -590], look: [49, 22, -623] }, caption: 'Somebody read that ledger before the police did. Somebody who signs his work.' },
      { shot: { cam: [-20, 40, -380], look: [0, 30, -450] }, caption: 'Tonight every screen in the Loop has a question mark on it.' },
    ],
  }),
  n3Twist: (stage) => [{
    layout: 'trio',
    panels: [
      { img: stage.shot({ cam: [8, 4, -414], look: [0, 6, -432], hero: { at: [0, 0.15, -427], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'Taped inside the Wayne Tower lobby door: a map of the Loop.' },
      { img: villainCard('riddler', 'EVERY ROUTE YOU TAKE', 'numbered, timed, annotated'), caption: 'Every rooftop Batman has crossed this month, numbered in green ink.', captionPos: 'bottom' },
      { img: titleCard('ROUTE 1: WAYNE TOWER', 'he always starts here. why?'), caption: 'And every route begins at the same building.', captionPos: 'bottom' },
    ],
  }],
  riddlerIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [14, 54, -490], look: [2, 49, -515], hero: { at: [2, 48, -497], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The Gazette roof. Every screen in the Loop is showing it.' },
      { img: villainCard('riddler', 'RIDDLE ME LIVE', 'tonight\'s contestant: you'), balloons: [{ text: 'No punching, no gadgets on the host. Answers only. You do read, Detective? Out loud, ideally.', x: 50, y: 5, w: 80 }] },
    ],
  }],
  riddlerOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [8, 51, -512], look: [2, 48.6, -522], hero: { at: [3, 48, -519], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The show is cancelled. The host is zip-tied to his own podium.' },
      { img: villainCard('riddler', 'ONE LAST QUESTION', 'he always has one'), balloons: [{ text: 'Riddle me this. Why does the Bat always start at Wayne Tower? I will work it out. I always do.', x: 50, y: 5, w: 80 }] },
    ],
  }],
  n3End: () => [{ layout: 'single', panels: [{ span: 'full', img: titleCard('END OF ACT TWO', 'The votes are back. The question is not going away.') }] }],
};

const PLATES = [
  { id: 'E', site: 'n3PlateE', label: 'East, by the doors' },
  { id: 'S', site: 'n3PlateS', label: 'South' },
  { id: 'W', site: 'n3PlateW', label: 'West, on the street' },
  { id: 'C', site: 'n3PlateC', label: 'The middle of the square' },
  { id: 'N', site: 'n3PlateN', label: 'North' },
];

export default {
  id: 'n3', act: 'act2', number: 3, actNumber: 2,
  title: 'Night Three: Know-It-All',
  blurb: 'Riddles across the Loop: a bank, the El, City Hall, Wayne Tower and a quiz show on the Gazette roof.',
  villain: 'riddler', gang: 'riddler',
  districts: ['loop', 'lowerGotham'],
  timeOfDay: 22, weather: 'drizzle',
  start: 'n3Loop',
  day: {
    hook: 'day.n3',
    context: {
      after: 'n2', mood: 'the vote',
      appointments: [{ at: '09:00', what: 'Wayne Enterprises board: the rescheduled Narrows vote', place: 'wayneTowerLobby' }, { at: '19:30', what: 'Dinner with Lucius: the stolen proxy votes', place: 'wayneTowerLobby' }],
      news: 'The Penguin is in Blackgate. The proxy votes he sold are missing, and the Gazette has received a crossword with no clues.',
    },
    fallback: [
      g('alfred', 'The vote was postponed again, sir. The proxy papers the Penguin sold have vanished from the evidence room. In their place, a single green question mark.'),
      g('alfred', 'And every screen in the Loop has been showing a countdown since six. I asked it what it was counting down to. It asked me a riddle back.'),
    ],
  },
  sites, fights, rooms, scenes,
  missions: [
    {
      id: 'm3Opening', title: 'Riddle Me Live',
      steps: [
        { id: 'n3Recap', type: 'cutscene', scene: 'n3Recap' },
        {
          id: 'n3Start', text: 'Every screen in the Loop is counting down. Head downtown.', site: 'n3Loop', radius: 20,
          // A clear dusk over the Loop for the opening; the drizzle comes in with the first fight.
          time: 19.75, weather: 'clear',
          title: { text: 'NIGHT THREE: KNOW-IT-ALL', sub: 'The Loop' },
          nudge: g('oracle', 'The Loop, north of the river. You cannot miss it, it is the part with all the screens shouting at you.'),
          lines: [
            g('riddler', 'Good evening, Gotham! And good evening to the man in the cape. Yes, you. I can see you reading this.'),
            g('riddler', 'I have the proxy votes the Penguin was selling. Want them back? Then play. First question is at the bank on the canyon. Do try to keep up.'),
            g('gordon', 'He is on every screen downtown. Bank alarm on the canyon street, west side of the Loop.'),
          ],
          banter: [
            g('radio', 'All units, a man in a cape on the El roof. ...Disregard. Dispatch says we all know who that is.'),
            g('oracle', 'He has hacked every billboard in the Loop. One of them is now an advert for a self-help book called "Being Right". Written by him.'),
          ],
        },
      ],
    },
    {
      id: 'm3Bank', title: 'The First Question', rewards: ['xp:150'], checkpoint: 'n3Loop',
      steps: [
        {
          id: 'bankFight', type: 'fight', fight: 'bank', text: 'His crew is robbing the bank. Baton goons: dodge the swing, then stun them or hit from behind.',
          tip: { title: 'NEW: BATON GOON', text: 'A charged stun baton shocks a bare fist. Dodge his swing, then cape stun or batarang him, or hit him from behind or from the air. A strike while he is stunned takes the baton.' },
          lines: [
            g('goon', 'Why do we wear question marks? Branding, he says. Does that not make us easy to spot? Do not say "question" around here, he says.'),
            g('goon', 'He said the Bat would be here in four minutes. It has been three. The boss is never wrong. I hate that.'),
          ],
        },
        {
          id: 'bankScan', type: 'scan', text: 'Detective vision: the vault door, the cameras and the getaway point. Find the next question.', hold: 1.2,
          points: [
            { site: 'n3Bank', lines: [g('oracle', 'The vault was opened, not cracked. He had the code. The receipt says "Question one: where do trains go to think?"')] },
            { site: 'n3BankN', lines: [g('oracle', 'He spray painted the camera lens green. With a question mark. On a camera. That is just showing off.')] },
            { site: 'n3BankS', lines: [g('gordon', 'Trains thinking. The El. He means the El, Batman. Something is on the tracks.')] },
          ],
          nudge: g('oracle', 'Three spots glow in detective vision: the vault door, the camera on the north side and the kerb on the south.'),
        },
      ],
    },
    {
      id: 'm3El', title: 'Express Service', rewards: ['xp:250'], checkpoint: 'n3Bank',
      steps: [
        {
          id: 'elRun', type: 'traverse', text: 'He has rigged the El signals. Reach every junction box on the track before the express does.', checkpoint: 'n3Bank',
          gates: ['n3El1', 'n3El2', 'n3El3', 'n3El4', 'n3El5', 'n3El6'], timer: 75, bonus: 6, radius: 5,
          lines: [
            g('oracle', 'He has switched the express onto the closed spur at City Hall. Six junction boxes on the track. Reach each one and I can switch them back.'),
            g('gordon', 'There are people on that train, Batman. Go.'),
          ],
          failLines: [g('oracle', 'The train stopped at the last signal, it is safe for now, but the boxes reset. Back to the first one.')],
          // [story2] Dick's birthday, mid-run
          calls: [{
            id: 'birthday', from: 'alfred', after: 12, timeout: 12, default: 'late',
            lines: [g('alfred', 'Sir, a reminder: it is Master Dick\'s birthday. I have made the cake with the candles you said he would hate. He is asking where you are.')],
            prompt: 'Dick\'s birthday dinner, at the Manor, now',
            options: [
              { id: 'invite', tag: 'family', text: 'Tell him to suit up. Dinner can wait an hour.', effects: { threads: { ward: 0.6 }, patience: -4 }, lines: [g('nightwing', 'Best birthday present ever. I mean it. The cake can come too.'), g('alfred', 'The cake cannot come too.')] },
              { id: 'late', tag: 'sorry', text: '"Save me a slice. I will be late."', effects: { threads: { ward: -0.4, alfred: -0.2 } }, lines: [g('alfred', 'I shall save you a slice, sir. I shall also save you the look on his face.')] },
              { id: 'home', tag: 'go home', text: 'Ask Oracle to watch the Loop for twenty minutes. Go home for the candles.', effects: { threads: { ward: 0.8, alfred: 0.3 }, city: -3 }, lines: [g('oracle', 'Twenty minutes. I am timing you. Happy birthday, Dick.')] },
            ],
          }],
        },
      ],
    },
    // [story2] Two places at once: the mayor's charity gala on the City Hall plaza (Bruce is the guest
    // of honour, and the buyer of the Narrows land is on the guest list), and a bomb in the canyon.
    {
      id: 'm3Gala', title: 'Black Tie', rewards: ['xp:200', 'gadget:tracker'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'n3Dilemma', type: 'dilemma', key: 'n3.gala', text: 'The charity gala on the City Hall plaza wants its guest of honour (gold). A bomb in the canyon wants Batman.',
          timer: 50, heading: 'GUEST OF HONOUR',
          card: 'The mayor\'s gala on the City Hall plaza (gold): Bruce is the guest of honour, and the Narrows buyer is on the list. Or the box on the canyon street that is ticking.',
          bruce: { site: 'n3GalaFront', radius: 7, label: 'The gala', lines: [g('alfred', 'Black tie in the car, sir. The bomb squad is on the canyon. They are very good. Mostly.')],
            miss: { effects: { standing: -5, threads: { gordon: 0.2 } }, lines: [v('pryce', 'The guest of honour sent his regrets and a cheque. The mayor kept the cheque.')] } },
          batman: { site: 'n3Bomb', radius: 12, label: 'The bomb', lines: [g('batman', 'Alfred. Send the cheque.')],
            miss: { effects: { city: -5 }, lines: [g('gordon', 'The canyon box went off. Nobody hurt, thank God, but the Exchange crew used the noise to dig in.')] } },
          both: { effects: { standing: 2 }, lines: [g('alfred', 'A gala attended and a bomb defused. I shall tell the press you have a twin.')] },
          branches: { bruce: 'n3Gala', batman: 'n3BombFight', both: 'n3BombFight' },
        },
        {
          id: 'n3Gala', type: 'civvy', outfit: 'tux', text: 'Walk the gala. Find out who bought the Narrows land.', next: 'toCityHall',
          card: 'Bruce Wayne, guest of honour. The buyer of the Narrows land is here somewhere. Ask without asking.',
          beats: [
            { id: 'mayor', site: 'n3GalaFront', text: 'Councillor Pryce, at the head of the receiving line.', lines: [v('pryce', 'Wayne! You came. The mayor will be thrilled. I am mildly surprised.')] },
            { id: 'buyer', site: 'n3GalaNorth', text: 'A man in a grey suit nobody seems to know.', lines: [v('grey suit', 'Mr. Wayne. We have not met. I represent a cold-storage concern. We are expanding into land.')],
              choice: { key: 'n3.buyer', prompt: 'The buyer\'s man, smiling, waiting for small talk', default: 'card', options: [
                { id: 'card', tag: 'charm', text: 'Ask for his card. Admire the paper.', effects: { flags: { 'lead.Sionis Cold Holdings is buying the Narrows': true }, suspicion: { villain: 2 } }, lines: [v('grey suit', 'Sionis Cold Holdings. We are discreet.'), g('bruce', 'Not very.')] },
                { id: 'drunk', tag: 'act', text: 'Spill a drink on him and apologise loudly.', effects: { standing: -2, suspicion: { reporter: -2 }, flags: { 'lead.the buyer wears a Sionis pin': true } }, lines: [v('grey suit', 'It is quite all right.'), g('alfred', 'You read his lapel pin while you dabbed. Very good, sir. Very undignified.')] },
              ] } },
            { id: 'slip', site: 'n3GalaSouth', text: 'Excuse yourself. The steps are behind the band.', lines: [g('riddler', 'Ah, the gala! Every rich fool in the Loop in one place. And on the steps behind them: my next question.')] },
          ],
        },
        {
          id: 'n3BombFight', type: 'fight', fight: 'bombCrew', text: 'His crew is guarding the canyon box. Clear them.',
          lines: [v('question mark', 'Nobody touches the box! The box is a riddle!'), v('question mark', 'What is the riddle?'), v('question mark', 'It is a bomb. That is the riddle.')],
        },
        {
          id: 'n3Defuse', type: 'scan', text: 'Detective vision: the bomb\'s two wires. Trace them both.',
          points: [
            { site: 'n3BombA', lines: [g('oracle', 'The green wire is a decoy. It is always the green wire with him.')] },
            { site: 'n3BombB', lines: [g('oracle', 'The red one goes to a clock. Cut there. Done. Lovely. Never do that again.')] },
          ],
        },
      ],
    },
    {
      id: 'm3CityHall', title: 'The Steps', rewards: ['xp:200', 'gadget:hack'] /* [onboard] gadget reward */,
      steps: [
        {
          id: 'toCityHall', text: 'The last box had a card in it: City Hall, the steps.', site: 'n3CityHall', radius: 14, checkpoint: 'n3El6',
          nudge: g('gordon', 'City Hall is the domed building on the east side of the Loop. The steps face the street.'),
          lines: [
            g('oracle', 'Train is safe. Passengers are complaining about the delay, which is the most Gotham thing I have ever heard.'),
            g('riddler', 'Well done! Now, a walk in the sun. City Hall steps. Mind the plates, they bite.'),
          ],
        },
        {
          id: 'cityHallPuzzle', type: 'puzzle', site: 'n3CityHall', text: 'Stand on the plates in the right order before the clock runs out.',
          riddleTitle: 'RIDDLE: WALK MY DAY',
          riddle: 'I rise by the doors in the east, I am highest in the south, I sink into the street in the west, and then I sleep in the middle of everything. Walk my day.',
          plates: PLATES, order: ['E', 'S', 'W', 'C'], timer: 60, wrongCost: 10, plateRadius: 1.4,
          penalty: { budget: 4, gang: 'riddler', site: 'n3CityHallStreet', ring: 7 },
          wrongLines: [
            g('riddler', 'Wrong! Even the pigeons on the dome got that one.'),
            g('riddler', 'Incorrect. I am sending some friends to help you think.'),
            g('riddler', 'You do know where the sun comes up? East. Doors. I practically drew you a picture.'),
          ],
          failLines: [g('riddler', 'Time! Do not worry, we will run it again. I love a repeat.')],
        },
      ],
    },
    {
      id: 'm3Alley', title: 'Question Mark Delivery', rewards: ['gadget:cryptographicSequencer'], checkpoint: 'n3AlleyEntry',
      steps: [
        {
          id: 'toAlley', text: 'The plates spelled a delivery address. West side of the Loop, an alley depot.', site: 'n3AlleyEntry', radius: 10,
          nudge: g('oracle', 'The roof above the alley on the far west side of the Loop, by the river branch. Come in high.'),
          lines: [
            g('oracle', 'Question Mark Delivery. A company that delivers nothing, at all hours, to nobody. The proxy papers went through it.'),
            g('alfred', 'Riflemen on both roofs, sir, and two in the alley. They are, I am told, very well informed.'),
          ],
          banter: [
            g('radio', 'Traffic: the Loop is gridlocked because every traffic light is showing a question mark. Please treat a question mark as a red light.'),
            g('nightwing', 'Want me to swing by? I hear he asks you riddles. I am great at riddles. Ask me one. Actually do not, you will be mean about it.'),
          ],
          interrupts: [{ id: 'n3Trivia', at: 'n3Trivia', radius: 24, fight: 'trivia', xp: 80, label: 'Optional: the trivia argument is settled', lines: [g('radio', 'Units on the canyon street: three men in green bowlers are fighting over a pub quiz answer. With crowbars.')] }],
        },
        {
          id: 'deliveryAlley', type: 'fight', fight: 'alley', text: 'Take the depot silently. Riflemen on both roofs.', tutorial: ['crouch', 'silent', 'perch'],
          lines: [g('goon', 'Anybody else hear wings? No? Just me? Great.')],
        },
        {
          id: 'cipher', type: 'collect', item: 'cipher', site: 'n3Cipher', radius: 3, text: 'Take the delivery ledger from the depot door.',
          nudge: g('oracle', 'The depot door, at the street end of the alley.'),
          lines: [g('oracle', 'One delivery tonight. Wayne Tower, the lobby. Signed with a question mark. Of course.')],
        },
      ],
    },
    {
      id: 'm3Tower', title: 'The Tallest Building in Gotham', rewards: ['xp:250'],
      steps: [
        {
          id: 'toWayneTower', text: 'Wayne Tower. The delivery went to the lobby.', site: 'n3Plaza', radius: 14, checkpoint: 'n3Cipher',
          nudge: g('gordon', 'Wayne Tower is the tallest thing in the Loop, Batman. The one with the W on top. Plaza on the south side.'),
          lines: [
            g('alfred', 'Wayne Tower, sir. I do hope he has not rearranged the furniture.'),
            g('riddler', 'The tallest building in Gotham. Have you ever wondered why it is so tall? Compensating, I think.'),
          ],
          banter: [
            g('gordon', 'Lucius Fox just called my office to ask why the Wayne Tower plaza is beeping. I told him I would look into it. Personally.'),
            g('oracle', 'Fun fact, the Riddler has a library card for every branch in Gotham. All overdue.'),
          ],
          optional: [{ id: 'n3TowerTop', title: 'Optional: the very top of Wayne Tower (if you can get there)', site: 'wayneTowerRoof', radius: 6, xp: 150, done: 'Wayne Tower summit: one green question mark on the mast, and a very good view.', lines: [g('riddler', 'You climbed it! Did you take the stairs? You took the stairs.')] }],
        },
        {
          id: 'plazaTrap', type: 'traverse', text: 'The plaza is wired. Hit the four cut-outs, the last one on the canopy, before it goes off.',
          gates: ['n3Trap1', 'n3Trap2', 'n3Trap3', 'n3Trap4'], timer: 40, bonus: 4, radius: 4,
          lines: [
            g('oracle', 'Pressure charges under the plaza, on a timer. Four cut-out switches. One is on the lobby canopy, so you will need to go up.'),
            g('gordon', 'Lobby is evacuated. Just the cleaner, and he is very angry about the floor.'),
          ],
          failLines: [g('oracle', 'Charges reset. Again, from the first one. You have this.')],
        },
        {
          id: 'lobbyScan', type: 'scan', site: 'n3LobbyDoor', text: 'Scan the lobby door. He left something for you.', hold: 1.4,
          points: [{ site: 'n3LobbyDoor', lines: [g('oracle', 'A map. Taped inside the door. Of the Loop. With your routes on it.')] }],
        },
        { id: 'n3Twist', type: 'cutscene', scene: 'n3Twist', panels: 3 },
      ],
    },
    {
      id: 'm3Exchange', title: 'Closing Bell', rewards: ['xp:250'], checkpoint: 'n3Exchange', // [fix1] gadget reward
      steps: [
        {
          id: 'toExchange', text: 'He is broadcasting from the Gazette, but his crew is guarding the Exchange. Go through them.', site: 'n3Exchange', radius: 14,
          nudge: g('gordon', 'The Gotham Exchange, the big one at the end of the canyon street, west of Marquee Row.'),
          lines: [
            g('batman', 'He has been watching me for a month.'),
            g('alfred', 'Then for once, sir, he will have to come up with a new route. Unlike some of us.'),
            g('gordon', 'His crew is holding the Exchange steps. The proxy papers are in an armoured case behind them.'),
          ],
          banter: [
            g('radio', 'Gotham Exchange closes early tonight, due to a man in a green suit asking the traders riddles about compound interest.'),
            g('nightwing', 'He mapped your routes? Mine are unmappable. I just do flips until something works.'),
          ],
          interrupts: [{ id: 'n3Lookout', at: 'n3Lookout', radius: 30, roof: true, fight: 'lookout', xp: 80, label: 'Optional: the roof spotters are out of the game', lines: [g('oracle', 'Two spotters on a roof along your way, phoning in your position. Optional, and very satisfying.')] }],
          optional: [{ id: 'n3ExchangeTop', title: 'Optional: the statue on top of the Exchange', site: 'exchangeTop', radius: 5, xp: 100, done: 'Justice holds her scales. Someone has put a green question mark on one pan.' }],
        },
        {
          id: 'n3IfBomb', type: 'life', test: 'choice:n3.gala=bruce',
          yesLines: [g('gordon', 'They dug in while the canyon was burning. There are more of them than there should be.')],
          branches: { yes: 'exchangeBig', no: 'exchangeFight' },
        },
        {
          id: 'exchangeBig', type: 'fight', fight: 'exchangeBig', text: 'They dug in while you were at the gala. Batons, a brute, shields. Clear the Exchange steps.', next: 'toGazette',
          lines: [g('goon', 'Count off! One. Two. ...Three? Three, buddy?')],
        },
        {
          id: 'exchangeFight', type: 'fight', fight: 'exchange', text: 'Clear the Exchange steps. Batons, a brute, and a lot of opinions.',
          lines: [
            g('goon', 'Quick question for the Bat. What is black, blue and about to be very sorry? ...I forgot the end. It was the Bat. No, us. It is us.'),
            g('goon', 'Count off! One. Two. ...Three? Three, buddy?'),
          ],
        },
      ],
    },
    {
      id: 'm3Riddler', title: 'Riddle Me Live', rewards: ['xp:600', 'lore:riddlerFile', 'suit:questionMarkCowl'], checkpoint: 'n3GazetteCP',
      steps: [
        {
          id: 'toGazette', text: 'The Gazette roof. He is on air. Grapple up.', site: 'n3GazetteCP', radius: 8, tutorial: ['grapple'],
          nudge: g('oracle', 'Gazette building, two blocks north of Marquee Row. The roof with all the lights. Grapple.'),
          lines: [
            g('oracle', 'The proxy papers are in the case. And the case is on his podium. Every screen in Gotham is watching.'),
            g('riddler', 'And here he is! Our contestant! Everyone, a round of applause for the man who still has not worked out who I am. ...It is me. The Riddler. It was always me.'),
          ],
        },
        { id: 'riddlerBoss', type: 'boss', boss: 'riddler', text: 'Answer three riddles. Scan the panels, then stand on your answer.', checkpoint: 'n3GazetteCP' },
        {
          id: 'n3Wrap', type: 'wait', seconds: 8, text: 'The papers are safe. GCPD on the way up.',
          lines: [
            g('gordon', 'Proxy papers recovered. The vote goes ahead in the morning, fair and square. Lucius says thank you, by the way. To you, I mean. Not to Bruce Wayne, who slept through the last one.'),
            g('batman', 'Riddler. The answer is prison.'),
            g('alfred', 'He asked about Wayne Tower, sir. On live television. I shall draw the blinds.'),
          ],
        },
        { id: 'n3End', type: 'nightEnd', scene: 'n3End', after: 'Act Two is over. The Loop is quiet, and a green question mark is drying on Wayne Tower.', rewards: ['xp:100'] },
      ],
    },
  ],
};
