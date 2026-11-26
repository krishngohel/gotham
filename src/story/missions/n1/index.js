// Night One's four added missions (content round, 2026-11-24). Pure data: no three.js, no DOM.
// Each sits between two of the original missions and gives the tools the night has just taught a
// real use before the next lesson, in the districts next door to the original five:
//
//   m1Short   "One Crate Short"      after the freighter   the South Branch quay and the Yards
//             grapple chain, dive bomb onto a crew, call the Batmobile, a pursuit
//   m1Booth   "The Man in the Booth" after the Monarch     Museum Campus
//             detective trail, a predator promenade, a rescue, detective vision again
//   m1Encore  "The Encore"           after the unmasking   Lakeshore Drive and Robinson Park
//             a pursuit, eject into a glide, a riddle on a timer
//   m1Clocks  "Stopping the Clocks"  after the funhouse    the west quay and the Loop
//             a predator strip, detective vision, the Batwing, a timed descent
//
// Nothing here unlocks anything: abilities and gadgets still arrive on the original steps
// (src/abilities/abilityDefs.js, src/gadgets/gadgetDefs.js). Enemy roles stay in teaching order too
// (grunts only before the Gazette roof teaches knives, rifles only after the Monarch balcony).
// src/game/story.js splices the steps into STEPS after each `after` id; src/story/nights/n1.js
// carries the sites, fights and rooms. Every site was checked against the live collision
// (scripts/site-probe.mjs) on 2026-11-25.

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const v = (speaker, text) => ({ speaker, portrait: 'radio', text }); // the Joker on an open channel, civilians
const W = (x, y, z, wait = 0, face = null) => ({ x, y, z, wait, face });
const route = (mode, ...points) => ({ mode, points });
const SOUTH = 0, EAST = Math.PI / 2, NORTH = Math.PI, WEST = -Math.PI / 2;

export const N1_SITES = {
  // m1Short: the quay crane, the grain silos and the scrap furnace across the South Branch.
  n1CraneSouth: { x: -262, y: 18.65, z: 122 },
  n1Silo: { x: -340, y: 42.15, z: 30 },
  n1Furnace: { x: -418, y: 0.15, z: 50 },
  n1YardCar: { x: -460, y: 0, z: 60 },
  // m1Booth: the Monarch roof's second cable, then the planetarium on Museum Campus.
  n1FeedA: { x: 172, y: 22, z: -64 },
  n1FeedB: { x: 180, y: 22, z: -52 },
  n1FeedC: { x: 190, y: 22, z: -64 },
  n1Dome: { x: 336, y: 17.4, z: 258 },
  n1DomeRoom: { x: 336, y: 0, z: 281 },
  n1BoothDoor: { x: 336, y: 0, z: 283.2 },
  n1RelayA: { x: 318, y: 0, z: 246 },
  n1RelayB: { x: 354, y: 0, z: 270 },
  // m1Encore: Lakeshore Drive and Founders' Fountain in Robinson Park.
  n1Drive: { x: 345, y: 0, z: -120 },
  n1DriveCar: { x: 345, y: 0, z: -140, yaw: NORTH },
  n1Fountain: { x: 300, y: 0.15, z: -441 },
  n1ValveE: { x: 312, y: 0.15, z: -455 },
  n1ValveS: { x: 300, y: 0.15, z: -443 },
  n1ValveW: { x: 288, y: 0.15, z: -455 },
  // m1Clocks: the west quay, then the Exchange and down through the Loop.
  n1CraneNorth: { x: -262, y: 18.65, z: -118 },
  n1QuayRoom: { x: -260, y: 0, z: -78 },
  n1ClockA: { x: -260, y: 0, z: -30 },
  n1ClockB: { x: -260, y: 0, z: -132 },
  n1Exchange: { x: -140, y: 92, z: -566 },
  n1Lookout: { x: -60, y: 40, z: -495 },
  n1KaneDeck: { x: -85, y: 8.55, z: -449 },
  n1LoopCabinet: { x: -30, y: 0, z: -330 },
};

const gr = (dx, dz) => ({ type: 'grunt', dx, dz });

export const N1_FIGHTS = {
  // The night's one plain brawl among the additions: grunts only (knives are taught later), opened
  // from above with the dive bomb.
  furnace: { site: 'n1Furnace', radius: 14, waves: [[gr(-6, 0), gr(6, 0), gr(0, 6), gr(-4, -8)], [gr(-9, 5), gr(9, -5), gr(4, 8)]] },
  domeWatch: { stealth: 'n1Dome' },
  quayWatch: { stealth: 'n1Quay' },
};

export const N1_ROOMS = {
  // The planetarium's promenade: the paved ring round the stepped dome (x 324..348, z 244..272),
  // which hides each side from the others. She comes in on top of the dome and looks down on all
  // four. (The museum's own roof belongs to an open-world encounter; this one stays clear of it.)
  n1Dome: {
    id: 'n1Dome', site: 'n1DomeRoom', entry: 'n1Dome', radius: 48,
    bounds: { minX: 302, maxX: 366, minY: -1, maxY: 6, minZ: 224, maxZ: 290 },
    lights: [
      { x: 308, y: 4.2, z: 232, r: 5, post: true, base: 0 },
      { x: 363, y: 4.2, z: 284, r: 5, post: true, base: 0 },
      { x: 339.6, y: 4.2, z: 286, r: 4.5, post: true, base: 0 },
    ],
    cover: [
      { x: 310, y: 0, z: 258, w: 1.4, d: 1.4, h: 1.3 },
      { x: 362, y: 0, z: 258, w: 1.4, d: 1.4, h: 1.3 },
      { x: 336, y: 0, z: 229.6, w: 1.4, d: 1.4, h: 1.3 },
      // The ticket booth the engineer is locked in, on the south promenade by the seawall.
      { x: 336, y: 0, z: 285.8, w: 2.6, d: 2.4, h: 2.5 },
    ],
    huddle: { x: 314, y: 0, z: 282 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(314, 0, 240, 2, SOUTH), W(314, 0, 276, 2, NORTH)) },
      { type: 'rifle', route: route('pingpong', W(358, 0, 276, 2, NORTH), W(358, 0, 240, 2, SOUTH)) },
      { type: 'knife', route: route('pingpong', W(320, 0, 234, 3, EAST), W(352, 0, 234, 3, WEST)) },
      { type: 'grunt', route: route('pingpong', W(326, 0, 281, 4, EAST), W(346, 0, 281, 4, WEST)) },
    ],
  },
  // The west quay: a 6 m strip between the river wall and the warehouse backs, 130 m long. The
  // warehouse roofs (10 to 16 m) and the crane she arrives on overlook all of it.
  n1Quay: {
    id: 'n1Quay', site: 'n1QuayRoom', entry: 'n1CraneNorth', radius: 70,
    bounds: { minX: -267, maxX: -254, minY: -1, maxY: 20, minZ: -145, maxZ: -15 },
    lights: [
      { x: -264.4, y: 4.2, z: -112, r: 5, post: true, base: 0 },
      { x: -264.4, y: 4.2, z: -72, r: 5, post: true, base: 0 },
      { x: -264.4, y: 4.2, z: -32, r: 5, post: true, base: 0 },
    ],
    cover: [
      { x: -258.4, y: 0, z: -126, w: 1.4, d: 1.4, h: 1.3 },
      { x: -263.2, y: 0, z: -92, w: 1.4, d: 1.4, h: 1.3 },
      { x: -258.4, y: 0, z: -88, w: 1.4, d: 1.4, h: 1.3 },
      { x: -263.2, y: 0, z: -52, w: 1.4, d: 1.4, h: 1.3 },
      { x: -258.4, y: 0, z: -34, w: 1.4, d: 1.4, h: 1.3 },
    ],
    huddle: { x: -260.5, y: 0, z: -72 },
    squad: [
      { type: 'rifle', route: route('pingpong', W(-260.8, 0, -138, 2, SOUTH), W(-260.8, 0, -104, 2, NORTH)) },
      { type: 'grunt', route: route('pingpong', W(-260.8, 0, -98, 3, SOUTH), W(-260.8, 0, -64, 3, NORTH)) },
      { type: 'knife', route: route('pingpong', W(-260.8, 0, -58, 3, SOUTH), W(-260.8, 0, -40, 3, NORTH)) },
      { type: 'rifle', route: route('pingpong', W(-260.8, 0, -22, 4, NORTH), W(-260.8, 0, -28, 4, NORTH)) },
      { type: 'rifle', route: route('pingpong', W(-263, 0, -76, 5, WEST), W(-263, 0, -84, 5, WEST)) },
    ],
  },
};

// Fill lights for the new set pieces (owner note, 2026-11-25: no scene too dark). They are spots in
// the shared light pool (world.lightPool.addSpots): the pool's fixed point lights pick them up
// when a player is near, so the light count never changes.
export const N1_FILLS = [
  { x: 314, y: 7, z: 258, color: 0xffd9a8, intensity: 54, distance: 40, decay: 1.4 },
  { x: 358, y: 7, z: 258, color: 0xffd9a8, intensity: 54, distance: 40, decay: 1.4 },
  { x: 336, y: 7, z: 232, color: 0xffd9a8, intensity: 54, distance: 40, decay: 1.4 },
  { x: 336, y: 6, z: 283, color: 0xcfe4ff, intensity: 54, distance: 36, decay: 1.4 },
  { x: -260, y: 7, z: -112, color: 0xffd9a8, intensity: 54, distance: 40, decay: 1.4 },
  { x: -260, y: 7, z: -72, color: 0xffd9a8, intensity: 54, distance: 40, decay: 1.4 },
  { x: -260, y: 7, z: -32, color: 0xffd9a8, intensity: 54, distance: 40, decay: 1.4 },
  { x: -418, y: 7, z: 50, color: 0xffb070, intensity: 60, distance: 40, decay: 1.4 },
  { x: 300, y: 6, z: -449, color: 0xcfe4ff, intensity: 54, distance: 34, decay: 1.4 },
];

// ---------------------------------------------------------------- m1Short: One Crate Short
const SHORT = [
  {
    id: 'shortCount', text: 'One crate is missing. Grapple up the quay crane west along the seawall.', site: 'n1CraneSouth', radius: 7, checkpoint: 'crates', tutorial: ['grapple'],
    nudge: g('alfred', 'The crane, sir. West along the seawall, where the docks give up and the river starts.'),
    lines: [
      g('alfred', 'A small matter of arithmetic, sir. The manifest lists twelve crates. I count eleven on that deck.'),
      g('gordon', 'Harbor patrol saw a pickup leave the pier ten minutes ago, heading west for the South Branch. Something heavy in the bed.'),
      g('alfred', 'The quay crane has the best view of the river. Grapple up and have a look.'),
    ],
    banter: [
      g('gordon', 'For the record, eleven out of twelve is the best recovery rate this department has had all year.'),
      g('alfred', 'I would settle for twelve, Commissioner. The twelfth is the one with the prototype in it. Naturally.'),
    ],
  },
  {
    id: 'toSilo', text: 'Cross the river to the Yards. Grapple up the grain silos for a better look.', site: 'n1Silo', radius: 9, checkpoint: 'n1CraneSouth', tutorial: ['glide'],
    nudge: g('alfred', 'The silos, sir. The tall grey row across the water. Glide over, then grapple up in stages.'),
    lines: [
      g('alfred', 'Tail lights, across the river, going into the Yards. Rail sidings, scrap heaps and very few witnesses.'),
      g('alfred', 'Glide across and take the high ground. The grain silos will do: grapple the lower ledge, then the top.'),
    ],
  },
  {
    // The same lesson the warehouse roof gave (16 m over the yard crew), from 42 m.
    id: 'toFurnace', text: 'The crate is at the scrap furnace below. Glide off the silo and dive bomb the crew.', site: 'n1Furnace', radius: 14, checkpoint: 'n1Silo', tutorial: ['divebomb'],
    nudge: g('gordon', 'The furnace, Batman. West of the silos. It is the thing that is on fire on purpose.'),
    lines: [
      g('alfred', 'There. The scrap furnace, west of you. A pickup, a Wayne Tech crate, and a crew arguing about its weight in copper.'),
      g('gordon', 'They are going to melt a prototype for scrap. Somebody down there has no idea what he stole.'),
      g('alfred', 'You have the height, sir. I believe you know what to do with it.'),
    ],
  },
  { id: 'furnaceFight', type: 'fight', fight: 'furnace', text: 'Stop the furnace crew before the crate goes in.' },
  {
    id: 'callCar', type: 'board', text: 'The foreman drove off with the crate. Call the Batmobile and get in.', site: 'n1YardCar', checkpoint: 'n1Furnace', tutorial: ['callCar'], talk: 'over',
    nudge: g('alfred', 'The car is on the yard road, west of the furnace. It came when called, which is more than I can say for some.'),
    lines: [
      g('alfred', 'The foreman has just left by the yard road, in the pickup, with crate twelve bouncing about in the back.'),
      g('alfred', 'You can call the car from anywhere now, sir. It is rather good at finding you.'),
    ],
  },
  {
    // The yard road (z 90), the line Night Five's own chase runs on.
    id: 'pickupChase', type: 'chase', text: 'Ram the pickup 3 times before it leaves the Yards.', site: 'n1YardCar', checkpoint: 'n1Furnace',
    path: [{ x: -480, z: 90 }, { x: -400, z: 90 }, { x: -330, z: 90 }, { x: -400, z: 90 }],
    van: { type: 'pickup', color: 0x7a4a2e, toast: 'Stop the pickup. Ram it three times!', label: 'PICKUP' },
    lines: [g('gordon', 'Go easy on the ramming, Batman. That crate is worth more than my whole motor pool.')],
  },
];

// ---------------------------------------------------------------- m1Booth: The Man in the Booth
const BOOTH = [
  {
    id: 'feedTrace', type: 'scan', text: 'The picture is still up. Detective vision: trace the second cable off the transmitter.', hold: 1.2, checkpoint: 'rig', tutorial: ['detective'],
    lines: [
      g('oracle', 'Bad news. You have his transmitter in your hands and his face is still on every screen. There is a second feed.'),
      g('oracle', 'Use the filter I just sent you. Something on that roof is still carrying a signal.'),
    ],
    points: [
      { site: 'n1FeedA', lines: [g('oracle', 'A splice. He ran a second cable off the rig before you got here. Belt and braces, for a clown.')] },
      { site: 'n1FeedB', lines: [g('oracle', 'Fresh solder, and neat. That is not goon work. Somebody who knows broadcasting did that with a gun in his back.')] },
      { site: 'n1FeedC', lines: [g('oracle', 'A microwave dish, aimed south east at the tallest mast on the lake shore. The planetarium. And the Gazette engineer went missing on his way to work this evening.')] },
    ],
  },
  {
    id: 'toPlanetarium', text: 'Cross to Museum Campus and land on top of the planetarium dome.', site: 'n1Dome', radius: 8, checkpoint: 'rig',
    nudge: g('oracle', 'Museum Campus is south east of Neon Row, on the lake. The planetarium is the stepped dome at the far end, past the museum.'),
    lines: [
      g('gordon', 'The relay is on the planetarium, so that is where the engineer is. His wife has called my desk four times.'),
      g('oracle', 'Rifles on the promenade round it. Do not land on the ground. Take the top of the dome and look before you leap.'),
    ],
    banter: [
      g('alfred', 'The planetarium, sir. You are a patron. I mention it only because the dome you are about to scuff is technically yours.'),
      g('oracle', 'Their late show is called "A Quiet Night Under the Stars". Somebody should tell the clowns.'),
    ],
  },
  {
    id: 'domeWatch', type: 'fight', fight: 'domeWatch', text: 'Four of them round the planetarium. Drop into the dark between the lamps and take them silently.', checkpoint: 'n1Dome', tutorial: ['silent'],
    lines: [
      g('oracle', 'Four on the promenade, one to a side. The dome hides each of them from the other three. Use that.'),
      g('alfred', 'The same rules as the balcony, sir. Crouch, pick the one nobody is watching, and be somewhere else afterwards.'),
    ],
  },
  {
    id: 'freeEngineer', text: 'Break the lock on the ticket booth and let the engineer out.', site: 'n1BoothDoor', radius: 3, checkpoint: 'n1Dome',
    nudge: g('oracle', 'The ticket booth on the south side, by the seawall lamp. He is inside it, and he is knocking.'),
    lines: [
      g('oracle', 'Promenade is quiet. The ticket booth on the south side is locked from the outside, and somebody in it is being very polite about that.'),
    ],
  },
  {
    id: 'relayKill', type: 'scan', text: 'Detective vision: find the two relay boxes he was made to wire, at the foot of the dome.', hold: 1.2, checkpoint: 'n1Dome',
    lines: [
      v('engineer', 'Thank you. Sincerely. They made me build it twice. One box feeds the picture, one feeds the sound. Either side of the dome, at the foot of it.'),
      v('engineer', 'Pull both or he just becomes a radio show. Nobody wants that either.'),
    ],
    points: [
      { site: 'n1RelayA', lines: [g('oracle', 'Picture is down. Half the city is now staring at a blank screen and feeling better about it.')] },
      { site: 'n1RelayB', lines: [g('oracle', 'And sound. He is off the air, all of him. GCPD is on the stairs for the engineer.')] },
    ],
  },
];

// ---------------------------------------------------------------- m1Encore: The Encore
const ENCORE = [
  {
    id: 'toDrive', text: 'One van is unaccounted for. Head east through the statue garden to Lakeshore Drive.', site: 'n1Drive', radius: 16, checkpoint: 'antidote',
    nudge: g('nightwing', 'Lakeshore Drive, B. East until you run out of city and hit lake.'),
    lines: [
      g('nightwing', 'One thing before the plaza. I loaded four vans for him tonight. You have stopped two and you are standing on the third.'),
      g('nightwing', 'The fourth left early with the spare charges, north up Lakeshore Drive. He called it the encore. For when the tower disappoints.'),
      g('gordon', 'I can close the Drive at the park, but my cars will not catch it. Yours will.'),
    ],
    banter: [
      g('nightwing', 'In my defence, I put a flat on the fourth one. He had a spare. Who carries a spare?'),
      g('alfred', 'Robinson Park is up that road, sir. Your mother planted half of it. Do try to keep the van off the lawns.'),
    ],
  },
  {
    id: 'encoreBoard', type: 'board', text: 'Get in the Batmobile on Lakeshore Drive.', site: 'n1DriveCar', checkpoint: 'n1Drive', talk: 'over',
    nudge: g('alfred', 'The car is on the Drive, pointing north, engine running. It would like to go.'),
    lines: [g('alfred', 'The car is on the Drive, sir. The van has a head start and a great deal of purple paint.')],
  },
  {
    // Lakeshore Drive (x 345), the line Night Six's chase runs on.
    id: 'encoreChase', type: 'chase', text: 'Ram the party van 3 times before it reaches the park.', site: 'n1DriveCar', checkpoint: 'n1Drive',
    path: [{ x: 345, z: -200 }, { x: 345, z: -420 }, { x: 345, z: -600 }, { x: 345, z: -420 }],
    van: { type: 'van_delivery', color: 0x6c3fa3, toast: 'Stop the party van. Ram it three times!', label: 'PARTY VAN' },
    lines: [g('nightwing', 'Purple van, balloons painted on the side, driving like it stole itself. That is the one.')],
  },
  {
    id: 'toFountain', text: 'The crew dumped the charges at the fountain in the park. Eject from the car and glide in.', site: 'n1Fountain', radius: 12, checkpoint: 'n1Drive', tutorial: ['eject'],
    nudge: g('gordon', "Founders' Fountain, Batman. In the park, just west of the Drive. The thing with the water."),
    lines: [
      g('gordon', "Van is stopped. But it is empty. My officers say the crew carried a rack of canisters into the park, to Founders' Fountain."),
      g('alfred', 'The car has an ejector seat, sir. I mention it because the park does not have a road.'),
    ],
  },
  {
    id: 'valves', type: 'puzzle', site: 'n1Fountain', text: 'Close the three valve plates round the fountain in the order of the riddle, before the rack vents.', checkpoint: 'n1Drive',
    riddleTitle: 'THE ENCORE',
    riddle: 'A good joke has three parts, Bats. The setup comes in where the sun does. The pause faces dead south, where the smart birds go. The punchline goes down with the sun. Tell it in order.',
    plates: [
      { id: 'E', site: 'n1ValveE', label: 'East, the lake side' },
      { id: 'S', site: 'n1ValveS', label: 'South' },
      { id: 'W', site: 'n1ValveW', label: 'West, the city side' },
    ],
    order: ['E', 'S', 'W'], timer: 80, wrongCost: 8, plateRadius: 1.6,
    lines: [
      v('joker', 'Oh, you found my encore! It was going to be a surprise. Three valves, one right order, and a little rhyme to help you fail.'),
      g('alfred', 'Three plates round the fountain, sir. East is the lake. I would start by thinking about where the sun comes up.'),
    ],
    wrongLines: [
      v('joker', 'Wrong! You stepped on the punchline. Nobody ever lets me finish.'),
      v('joker', 'Timing, Bats. Timing. Sunrise, then the birds, then sunset. I am practically telling it for you.'),
    ],
    failLines: [v('joker', 'And the room goes quiet. From the top, then. I do love a second show.')],
  },
];

// ---------------------------------------------------------------- m1Clocks: Stopping the Clocks
const CLOCKS = [
  {
    id: 'toQuay', text: 'The gas listens for the midnight time signal. Reach the crane on the west quay.', site: 'n1CraneNorth', radius: 7, checkpoint: 'plaza',
    nudge: g('oracle', 'West of the plaza, on the river. The quay crane, north end. You cannot miss a crane.'),
    lines: [
      g('oracle', 'Batman, I am inside the funhouse wiring. The tower release is not on a timer. It listens for the city time signal at midnight.'),
      g('oracle', 'Two relay clocks pass that signal along: the harbor master clock on the west quay, and the Exchange in the Loop. Stop both and he has to set it off by hand.'),
      g('nightwing', 'Go. I will walk these people out and find the rest. Somebody up there is still filming.'),
    ],
    banter: [
      g('gordon', 'So the plan is to stop every clock in Gotham. My pension paperwork will be thrilled.'),
      g('oracle', 'Two clocks, Commissioner. Everyone else can keep being late on their own.'),
    ],
  },
  {
    id: 'quayWatch', type: 'fight', fight: 'quayWatch', text: 'Rifles along the quay below. Drop on them from the roofs, one at a time.', checkpoint: 'n1CraneNorth',
    lines: [
      g('oracle', 'Five of them strung out along the quay, guarding a clock. A long thin room with no ceiling. You like those.'),
      g('alfred', 'The warehouse roofs run the whole length of it, sir. I would stay up there between introductions.'),
    ],
  },
  {
    id: 'quayClock', type: 'scan', text: 'Detective vision: find the relay clock on the quay and the cable that feeds it.', hold: 1.2, checkpoint: 'n1CraneNorth',
    lines: [g('oracle', 'Quay is clear. The clock is in a cabinet at the south end. Its feed comes in at the north end. I need eyes on both.')],
    points: [
      { site: 'n1ClockA', lines: [g('oracle', 'Got it. The harbor master clock has not been wrong since 1931. It is about to be wrong for a very good reason.')] },
      { site: 'n1ClockB', lines: [g('oracle', 'Feed is cut. One relay left: the top of the Exchange, north over the river. It is a long way up.')] },
    ],
  },
  {
    id: 'toExchange', text: 'Call the Batwing. Fly north over the river and drop onto the roof of the Exchange.', site: 'n1Exchange', radius: 10, checkpoint: 'n1CraneNorth', tutorial: ['callBatwing', 'fly'],
    nudge: g('alfred', 'The Exchange, sir. The tallest dark tower in the Loop, north west of you. The Batwing will put you above it.'),
    lines: [
      g('alfred', 'The Exchange roof is ninety metres up, sir. I would not climb it. I would arrive.'),
      g('nightwing', 'This is the bit the Batwing is for. Call it, fly north, and step out over the roof.'),
    ],
    banter: [
      g('oracle', 'That is the Loop under you. Banks, the El, City Hall, and more closed-circuit cameras than people. Wave if you like.'),
      g('alfred', 'Wayne Tower is the tall one in the middle, sir. Lucius left a light on. He usually does.'),
    ],
  },
  {
    // A descent against the clock: 92 m down to the street in three glides.
    id: 'pulseRun', type: 'traverse', text: 'The relay is rerouting down the block. Dive to each junction box before the test pulse.', checkpoint: 'n1Exchange', tutorial: ['dive'],
    gates: ['n1Lookout', 'n1KaneDeck', 'n1LoopCabinet'], timer: 85, bonus: 12, radius: 5.5,
    failTitle: 'THE PULSE WENT OUT', failText: 'Back to the first junction box and go again.',
    failLines: [g('oracle', 'Test pulse went through. It is only a test, so we get another go. Back to the first box.')],
    lines: [
      g('oracle', 'Relay is dead, but it is clever: it is rerouting through three junction boxes down the block, and it tests the line every minute and a half.'),
      g('oracle', 'A rooftop to the south east, the El platform below that, then a cabinet on the street by the river. Dive. Do not take the stairs.'),
    ],
  },
];

// The four missions in story order. `after`: the original step each one follows.
export const N1_MISSIONS = [
  { id: 'm1Short', title: 'One Crate Short', after: 'rewardCrates', steps: SHORT },
  { id: 'm1Booth', title: 'The Man in the Booth', after: 'rewardRig', steps: BOOTH },
  { id: 'm1Encore', title: 'The Encore', after: 'courierReveal', steps: ENCORE },
  { id: 'm1Clocks', title: 'Stopping the Clocks', after: 'funhouseFight', steps: CLOCKS },
];

// The original step list with each mission's steps spliced in after its `after` step. Each added
// step carries its mission id (nights/n1.js groups the rest by where each mission starts).
export function withMissions(base, missions = N1_MISSIONS) {
  const out = [];
  for (const s of base) {
    out.push(s);
    for (const m of missions) if (m.after === s.id) for (const step of m.steps) { step.mission = m.id; out.push(step); }
  }
  return out;
}
