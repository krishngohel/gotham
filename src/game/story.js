// The whole game, in order: The Long Night. Steps without a type are "reach" steps: get
// to the site. tutorial: prompt ids introduced when the step begins (see ui/prompts.js).
//
// The Joker has hijacked a Wayne Tech shipment, taken over the airwaves and stockpiled Smilex for a
// midnight release from the clock tower. Saves are placed purely by stepId, so ids here are free to
// change between reworks. They stay stable *within* this story only so that gadget unlocks
// (src/gadgets/gadgetDefs.js) and the chapter list (src/game/progressTracker.js CHAPTERS) keep
// pointing at the right beat: 'intro', 'toDocks', 'toYard', 'toNeon', 'toStreet', 'toMonarch',
// 'toAce', 'toVat', 'toTower' must not move to a different place in the story than the one they
// already mark.
//
// [story] Long Night 2 (workstream J1): the five stand-alone radio steps (and the other dead stops:
// the act title cards, aceVanRadio, toBruteFight, nightwingTagRadio's own beat) are folded into the
// steps that follow them. Their lines now play *over* the travel (`talk: 'over'`: an async step's
// real part starts at once instead of waiting for the last line), act titles are a non-blocking
// overlay (`title`), long walks have banter and an optional interrupt fight on the way, and the
// next objective is previewed before a fight ends. Retired ids still resolve: see ALIASES below
// and src/game/storyMigrate.js (old saves, ?at= links and scripts land on the step that absorbed
// them). Night One is wrapped as the campaign's first night in src/story/nights/n1.js.
//
// Mission types (see flow.js): 'radio' (a dialogue beat), 'board' (walk up and get in the
// Batmobile, no teleport), 'chase' / 'battle' (ground vehicles, always preceded by a 'board' step
// in normal play), 'armada' (the Batwing), 'courier' / 'ally' (Nightwing), 'interior' (a room
// site). Every one of them is read against window.__game at run time; when the part that provides
// it is missing, flow.js plays the step's `lines` and completes it on a short timer, so the whole
// story always reaches credits even with none of Vehicles, Batwing, Nightwing or Interiors merged
// in yet.
import { HARLEY_FIGHT } from './fights.js';

const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const c = (who, text) => ({ who, text });

// Cinematic camera moments (window.__game.cinematic): a letterboxed in-engine shot layered before
// the matching comic/radio beat. Optional by design (flow.js's playCinematicFor degrades to
// nothing when the part isn't there), so these moments still play their existing comic pages or
// dialogue either way.
const CINEMATIC = {
  // Prologue: a slow push toward the Batsignal as the beam bends into a grin.
  intro: { shots: [{ from: { x: -26, y: 52, z: 8 }, to: { x: -7, y: 44.4, z: -7 }, look: { x: -12, y: 43.6, z: -12 }, dur: 3.5 }], lines: [c('joker', 'Good evening, Gotham. Try to keep up, Bat.')] },
  // (The act openers' establishing orbits went with the act title cards: [story] J1 pacing pass.)
  // The Courier's mask comes off: a push toward Nightwing by the Ace Chemicals gate.
  // Built around wherever Batman stands when the step begins (flow.js revealShots): Nightwing
  // appears in front of him, unmasked, framed over his shoulder.
  courierReveal: { reveal: 'nightwing', lines: [c('nightwing', 'Surprise. Sort of.')] },
  // The finale: a push over the GCPD roof, the Joker in ropes and the Batsignal burning clean.
  finale: { shots: [{ from: { x: -6, y: 50, z: 26 }, to: { x: 6, y: 43.5, z: 12 }, look: { x: 6, y: 42, z: 6 }, dur: 5 }], lines: [c('gordon', 'Quiet night, for once. Thank you, Batman.')] },
};

export const STEPS = [
  // ---------------------------------------------------------------- Prologue: GCPD roof
  { id: 'intro', type: 'cutscene', scene: 'intro', cinematic: CINEMATIC.intro },
  { id: 'signal', text: 'Walk to the Batsignal and see what is stuck to it.', nudge: g('alfred', 'The Batsignal, sir. The large lamp behind you with something taped to it.'), site: 'signal', radius: 4.5, tutorial: ['move', 'look'], checkpoint: 'start' },
  { id: 'card', type: 'cutscene', scene: 'card' },
  {
    // After the card: out from under the Batsignal lamp, facing the city and the Docks, and the
    // masked man already running while Gordon explains (was the stand-alone 'gordonRadio' beat).
    id: 'courierIntro', type: 'courier', text: 'Follow the masked man as he runs for the Docks.', at: 'signal', to: 'wh3Roof', checkpoint: 'signal', placeAt: 'signalView', talk: 'over',
    lines: [
      g('gordon', 'Gordon here. The signal was a trap, and I walked every officer I have right into it. Sorry.'),
      g('gordon', "Wayne Enterprises had a prototype shipment coming in tonight. Armored truck, full escort. The Joker's crew hit it at the bridge."),
      g('gordon', 'A man in a mask grabbed the first crate off the truck and ran before my officers blinked. He was headed for the Docks.'),
      g('gordon', "And his pirate broadcast is on every television in the city. He says something happens at midnight. I'd rather not find out what."),
      g('courier', 'Nothing personal, Bat. Catch me if you can.'),
    ],
  },

  // ---------------------------------------------------------------- Act 1: Docks and Neon Row
  {
    id: 'toDocks', text: 'Glide to the Docks and land on the warehouse roof.', nudge: g('alfred', "The Docks are the other way, I'm afraid. Follow the marker and the smell of fish."), site: 'wh3Roof', radius: 16, tutorial: ['glide', 'dive', 'grapple'], checkpoint: 'signal',
    title: { text: 'ACT ONE: THE STOLEN SHIPMENT', sub: 'The Docks and Neon Row' },
    lines: [g('alfred', 'The Docks, and Neon Row beyond them. Rather a lot of city for one night, sir.')],
    banter: [
      g('gordon', 'Dispatch, be advised: the Batsignal is city property. Somebody tell the Joker.'),
      g('alfred', 'For the record, sir, the masked gentleman is faster than he looks. I say that with professional respect.'),
    ],
  },
  {
    // SITES.dockBoard: the dock road at x = -90, a real street the city builder always leaves
    // clear (src/vehicles/vehicles.js's LINES), a short climb down from wh3Roof. The Batmobile
    // parks itself there (src/vehicles/vehicles.js's park(), called from flow.js's 'board'
    // handling) and waits; this step only ends once Batman actually walks up and gets in.
    // Alfred's car call plays as the car slides in (was the stand-alone 'alfredRadio' beat).
    id: 'boardBatmobile', type: 'board', text: 'Climb down to the dock road and get in the Batmobile.', nudge: g('alfred', 'The car is on the dock road below you. It will not come up the stairs.'), site: 'dockBoard', tutorial: ['vehicle'], checkpoint: 'wh3Roof', talk: 'over',
    lines: [
      g('alfred', 'Alfred here, sir. I have brought the car around. Do try not to enjoy it too much.'),
      g('alfred', "Wayne Tech built it for exactly this sort of night: entirely too much power for anyone's own good."),
    ],
  },
  {
    // The same dock road, running north from here up toward the warehouses at wh3Roof (x -60,
    // z 180). He is already driving by the time this starts (the board step above put him in
    // the car himself), so the van simply appears further down the road and comes to him.
    // Ramming it 3 times ends the chase before it gets in among the warehouses.
    id: 'batmobileChase', type: 'chase', text: 'Ram the Joker van 3 times before it reaches the warehouses.', site: 'wh3Roof',
    path: [{ x: -90, z: 40 }, { x: -90, z: 100 }, { x: -90, z: 165 }, { x: -90, z: 100 }, { x: -90, z: 40 }],
    lines: [g('alfred', 'A van just peeled off the dock road with a Wayne Tech crate sticking out the back. After it.')],
  },
  {
    id: 'toRoofAfterChase', text: 'Leave the car. Climb back up to the warehouse roof.', site: 'wh3Roof', radius: 16, checkpoint: 'wh3Roof',
    nudge: g('gordon', 'The driver went up to the warehouse roof. Nothing in the car worth staying for.'),
    lines: [
      g('alfred', "Van's done. Its driver bolted up to the warehouse roof, and the cargo went with him."),
      g('gordon', 'The goons up there loaded that van. They know where the rest of the shipment went. Go and ask.'),
    ],
  },
  { id: 'f1', type: 'fight', fight: 'docksRoof', text: 'Take down the goons on the warehouse roof. Punch, kick, counter.', tutorial: ['punch', 'kick', 'counter'] },
  {
    // [onboard] Teaching beat: the dive bomb (granted here, src/abilities/abilityDefs.js). The roof is
    // 16 m over the yard crew: glide off, kick, and the fight below opens with it.
    id: 'toYard', text: 'Glide down into the container yard. Kick mid-glide to dive bomb the crew.', site: 'yard', radius: 14, checkpoint: 'wh3Roof', tutorial: ['glide', 'divebomb'],
    nudge: g('alfred', 'The container yard is directly below you. One step off the edge will do it.'),
    lines: [
      g('alfred', 'One of them dropped a shipping manifest. The shipment went through the container yard below you.'),
      g('gordon', "The yard crew is Joker's. Clear them and the cargo is one fence away."),
    ],
  },
  { id: 'f2', type: 'fight', fight: 'yard', text: 'Clear the container yard. Dodge, block and throw.', tutorial: ['movesDirection', 'combo', 'dodge', 'throw', 'block'] },
  {
    // [onboard] The grapple boost arrives in Night Two (src/abilities/abilityDefs.js); here the plain
    // grapple, taught at the Docks, is used for real.
    id: 'toShip', text: 'Grapple onto the freighter at the end of the dock.', site: 'freighter', radius: 12, tutorial: ['grapple'], checkpoint: 'yard',
    nudge: g('gordon', "Freighter's at the end of the dock, Batman. Big grey thing. Hard to miss."),
    lines: [
      g('alfred', 'The manifest ends at the freighter. Every crate with a Wayne Tech seal is in that hold.'),
      g('gordon', "Harbor patrol has the mouth blocked, so it isn't sailing. Get aboard before they find another way out."),
    ],
  },
  { id: 'f3', type: 'fight', fight: 'freighter', text: 'Clear the freighter deck. Finish them before the next wave lands.', tutorial: ['movesSprint', 'movesAir', 'finisher', 'slam'] },
  {
    id: 'crates', type: 'collect', item: 'crates', site: 'crates', radius: 3, text: 'Secure the Wayne Tech crates at the marker on deck.', checkpoint: 'freighter',
    nudge: g('alfred', 'The crates are right there on the deck, sir. One does need to actually secure them.'),
    lines: [
      g('alfred', "Deck's clear. The crates by the marker carry the Wayne Tech seal, unbroken."),
      g('gordon', "Secure them, Batman. That's one piece of his plan gone. The rest is still out there."),
    ],
  },
  { id: 'rewardCrates', type: 'cutscene', scene: 'crates' },
  {
    id: 'toNeon', text: 'Head east to the Gazette building roof in Neon Row.', site: 'gazetteRoof', radius: 16, checkpoint: 'crates',
    nudge: g('oracle', "Neon Row is east, Batman. Look for the Gazette sign. It's the loud one."),
    lines: [
      g('gordon', "Cargo is safe. Now the airwaves. A truck full of transmitter gear went east into Neon Row, and that's where his broadcast is coming from."),
      g('oracle', 'Oracle here. Traffic cameras caught your masked friend on the Gazette roof, a crate still under his arm.'),
      g('alfred', "The Gazette building, then. Follow the lights east. Half the city's televisions are showing that dreadful grin."),
    ],
    banter: [
      g('oracle', 'Fun fact: the Gazette prints a correction every time someone calls you a myth. They have a whole column now.'),
      g('alfred', 'If you see a hot dog cart on the way, sir, it is not evidence. It is a hot dog cart.'),
    ],
    interrupts: [{ id: 'neonLookout', at: { x: 65, z: 65 }, radius: 26, roof: true, fight: 'interruptLookout', lines: [g('oracle', 'Two of his lookouts on a roof along your route. Optional. Though they did just call you "the big pigeon".')] }],
  },
  { id: 'n1', type: 'fight', fight: 'gazette', text: 'Knife goons on the Gazette roof. Kick or cape to break their guard.', tutorial: ['knife', 'cape'] },
  {
    id: 'toStreet', text: 'Drop down to the Neon Row street, toward the broadcast.', site: 'neonStreet', radius: 14, checkpoint: 'gazetteRoof',
    nudge: g('alfred', 'The noise is below you, not above. Down to the street.'),
    lines: [
      g('alfred', 'Hear that? His broadcast is playing from speakers in the street below. Loudly, and on a loop.'),
      g('gordon', "That's his relay rig. Whoever has it is drawing a crowd of goons. Get down there and thin them out."),
    ],
  },
  { id: 'n2', type: 'fight', fight: 'street', text: 'Clear the street. Batarang the ones hanging back.', tutorial: ['batarang'] },
  {
    id: 'toMonarch', text: 'Climb to the Monarch Theater roof.', site: 'monarchRoof', radius: 14, checkpoint: 'neonStreet',
    nudge: g('gordon', 'Monarch Theater, Batman. The roof with the transmitter on it.'),
    lines: [
      g('oracle', "The signal is coming from the Monarch Theater roof. They've built a whole studio up there."),
      g('gordon', 'And the mask just went up the Monarch fire escape. Two birds, Batman. Get up there.'),
    ],
  },
  // [onboard] The special takedown arrives in Night Two: this roof is the exam for what the night has
  // taught so far.
  { id: 'n3', type: 'fight', fight: 'monarch', text: 'Clear the Monarch roof. Counters, the cape, throws: use everything.' },
  {
    id: 'courierRooftop', type: 'courier', text: 'Chase the masked man down to the theater balcony.', at: 'monarchRoof', to: 'monarchBalconyEntry', checkpoint: 'monarchRoof',
    lines: [
      g('batman', 'Nowhere left to run. Start talking.'),
      g('courier', "Wrong again. You'll thank me for this later, Bat."),
    ],
  },
  // [onboard] Detective vision is handed over here too (Oracle's filter, src/abilities/abilityDefs.js).
  { id: 'monarchBalcony', type: 'fight', fight: 'monarchBalcony', text: 'Rifle goons on the balcony. Crouch, stay hidden, take them one by one.', tutorial: ['crouch', 'silent', 'perch', 'perchDrop'], checkpoint: 'monarchBalconyEntry' },
  {
    id: 'rig', type: 'collect', item: 'rig', site: 'rig', radius: 3, text: "Seize the Joker's transmitter and relay gear on the balcony stage.", checkpoint: 'monarchRoof',
    nudge: g('alfred', 'The transmitter is on the stage, sir. Do pull the plug before the next broadcast.'),
    lines: [
      g('alfred', "Balcony's quiet. The transmitter and the relay gear are on the stage behind you, still live."),
      g('gordon', 'Cut it and take it before anyone else comes up those stairs.'),
    ],
  },
  { id: 'rewardRig', type: 'cutscene', scene: 'rig' },

  // ---------------------------------------------------------------- Act 2: Ace Chemicals
  {
    // Gordon's clue call plays on the way north (was the stand-alone 'aceClueRadio' beat), under
    // the act title (was the 'actTwoTitle' card).
    id: 'toAce', text: 'Go north to the Ace Chemicals gate.', nudge: g('gordon', 'Ace Chemicals is north. Follow the marker, or just follow the smell.'), site: 'aceGate', radius: 16, checkpoint: 'rig',
    title: { text: 'ACT TWO: ACE CHEMICALS', sub: 'Follow the smell of bitter almonds' },
    lines: [
      g('gordon', 'Every television in the city just went to static. The engineer he was holding at gunpoint is safe, and he says thank you.'),
      g('gordon', "Forensics found the Joker's next clue. It smells like bitter almonds and industrial solvent."),
      g('gordon', 'Ace Chemicals. Of course it is Ace Chemicals. Head north.'),
    ],
    banter: [
      g('gordon', "Dispatch just asked me if the bat-shaped lamp needs a permit. I told them to take it up with the bat."),
      g('oracle', 'Ace Chemicals: forty years of safety violations, and the fire marshal still sends them a holiday card. Bring the good boots.'),
    ],
    interrupts: [{ id: 'aceMugging', at: { x: 150, z: -84 }, radius: 24, fight: 'interruptMugging', lines: [g('gordon', 'Unit on Neon Row reports a mugging on your way north. Up to you, Batman. They would appreciate it.')] }],
  },
  {
    // SITES.aceGate: the real street just south of the Ace Chemicals compound, where the
    // Batmobile parks and waits (the compound itself is a merged super-block with no streets
    // inside). Ends the moment he gets in, same as boardBatmobile in Act 1.
    id: 'boardBatmobileAce', type: 'board', text: 'Get in the Batmobile waiting at the Ace Chemicals gate.', nudge: g('alfred', 'The car is by the gate, sir, and it is getting impatient.'), site: 'aceGateCar', tutorial: ['vehicle'], checkpoint: 'aceGate',
  },
  {
    // He drives himself in from the gate; startBattle no longer has to place him (he is already
    // in the Batmobile from the board step above).
    id: 'aceBattle', type: 'battle', text: 'Drive into the yard. Cannon the drone tanks.', site: 'aceYard',
    lines: [g('alfred', 'Motion in the yard, and none of it is friendly. Batmobile cannon, if you would.')],
  },
  {
    // Out of the car and straight into it (was a separate 'toBruteFight' walk to the spot he was
    // already standing on): a fight step puts him on foot itself.
    id: 'a1', type: 'fight', fight: 'aceYard', text: 'A brute. Cape to stun him, then hit him while he is dazed.', tutorial: ['brute'], checkpoint: 'aceYard',
    lines: [
      g('alfred', 'The tanks are scrap. One large gentleman in the yard did not get the message.'),
      g('gordon', "He's standing between you and the factory. The cannon won't help on foot."),
    ],
  },
  {
    id: 'toFactory', text: 'Climb to the factory roof inside Ace Chemicals.', site: 'factoryRoof', radius: 18, checkpoint: 'aceYard',
    nudge: g('oracle', 'Factory roof, Batman. The tall one in the compound. Grapple will get you there.'),
    lines: [
      g('oracle', 'Oracle here. The factory roof is their lookout post. Every goon in the compound gets called from up there.'),
      g('gordon', "Take the lookouts down and the hall below goes blind. That's how you reach the antidote without a full alarm."),
      g('alfred', 'Grapple up. The roof is the tall one in the middle of the compound.'),
    ],
  },
  { id: 'a2', type: 'fight', fight: 'factory', text: 'Take out the lookouts on the factory roof.' },
  {
    // SITES.aceGate: the same real street just south of the compound the first Ace Chemicals
    // board step used. The Batmobile slides back in and waits (src/vehicles/vehicles.js's park(),
    // called from flow.js's 'board' handling); the step only ends once he walks up and gets in.
    // The van news plays as she turns for the gate (was the stand-alone 'aceVanRadio' beat).
    id: 'boardBatmobileAce2', type: 'board', text: 'Get back in the Batmobile at the Ace gate.', nudge: g('alfred', 'The van is getting away and the car is at the gate. One of those is closer.'), site: 'aceGate', checkpoint: 'factoryRoof', face: 'aceGate', talk: 'over',
    lines: [
      g('alfred', "One of Harley's crew just peeled out of the yard with the case of gas charges meant for the clock tower."),
      g('gordon', 'Those cannot reach midnight. Get the Batmobile and run them down.'),
    ],
  },
  {
    // The real street outside the Ace Chemicals gate (z -90, clear of the compound's own merged
    // super-block, the same line SITES.aceGate sits on), running east past Neon Row's edge. He is
    // already driving by the time this starts (the board step above put him in the car himself),
    // so the van simply appears on the street and comes to him.
    id: 'aceVanChase', type: 'chase', text: "Ram Harley's van 3 times before it leaves the block.", site: 'aceHallDoor', checkpoint: 'factoryRoof',
    path: [{ x: 95, z: -90 }, { x: 150, z: -90 }, { x: 195, z: -90 }, { x: 150, z: -90 }, { x: 95, z: -90 }],
    lines: [g('alfred', 'There it goes, past the gate and east along the block. After it.')],
  },
  {
    // Harley's taunt plays on the way to the door (was the stand-alone 'harleyRadio' beat).
    id: 'toHarleyDoor', type: 'interior', text: 'Enter the chemical hall through the open loading dock door.', nudge: g('alfred', 'The loading dock door, on the hall. Still open, still probably a trap.'), site: 'aceHallDoor', room: 'aceHall', radius: 10, checkpoint: 'aceHallDoor',
    lines: [
      g('harley', "Aw, you caught my van! Puddin' never lets ME play with the big toys. So I'm borrowing 'em."),
      g('harley', 'The antidote stays right where it is, Batsy. Come say hi to my crew.'),
      g('alfred', 'The loading dock is open. That is either careless or a trap. Mind the difference.'),
    ],
  },
  { id: 'harleyFight', type: 'fight', fight: HARLEY_FIGHT, text: 'Beat Harley and her crew in the chemical hall.', boss: 'harley' },
  // Harley's crew first (the hall), then out to the vat deck for the antidote: Act 2 runs one way.
  {
    id: 'toVat', text: 'Go out to the deck over the vats. The antidote is there.', site: 'vatDeck', radius: 11, checkpoint: 'aceHallDoor',
    nudge: g('harley', "Antidote's on the vat deck, Batsy. I'm not gonna wait all night."),
    lines: [
      g('alfred', 'Her crew is down and Harley has slipped out the back. The antidote is on the deck over the vats.'),
      g('harley', "Fine, Batsy. Come get it. It's right over the acid, where I left it."),
    ],
  },
  { id: 'a3', type: 'fight', fight: 'vats', text: 'Protect the antidote on the vat deck. Keep every goon off it.' },
  // Off the vat deck to the hall's catwalk entrance: the stealth room is 57 m away, and its fight
  // otherwise began with no marker leading there.
  {
    id: 'toCatwalks', text: 'Reach the catwalk entrance along the hall wall. Crouch.', site: 'aceCatwalksEntry', radius: 8, checkpoint: 'vatDeck',
    nudge: g('oracle', 'The catwalk entrance is along the hall wall from the deck. Crouch before you go in.'),
    lines: [
      g('alfred', 'The case is still intact, which is more than I can say for her crew.'),
      g('oracle', "Don't touch it yet. Rifles on the catwalks above have the deck covered. You can't rush rifles."),
      g('alfred', 'The catwalk entrance is off the deck, along the hall wall. Quietly, sir.'),
    ],
  },
  { id: 'aceCatwalks', type: 'fight', fight: 'aceCatwalks', text: 'Rifle goons on the catwalks. Stay hidden and take them silently.', tutorial: ['distract', 'vent', 'ledgeStealth'], checkpoint: 'aceCatwalksEntry' },
  {
    id: 'antidote', type: 'collect', item: 'antidote', site: 'antidote', radius: 3, text: 'Secure the antidote case on the vat deck.', checkpoint: 'vatDeck',
    nudge: g('alfred', 'The case, sir. On the deck. It will not secure itself.'),
    lines: [
      g('alfred', 'Catwalks are clear. Nobody is looking at that case but you.'),
      g('gordon', 'Get it out of there. The hospitals have been calling my desk every five minutes since nine.'),
    ],
  },
  { id: 'rewardAntidote', type: 'cutscene', scene: 'antidote' },
  {
    // [story] The reveal shot plays, then the conversation carries on over the walk to the plaza.
    id: 'courierReveal', type: 'radio', text: 'The masked man has caught up with you, mask in hand.', checkpoint: 'antidote', cinematic: CINEMATIC.courierReveal, talk: 'over',
    lines: [
      g('courier', 'Before you swing at me again, you should probably see who you have been chasing.'),
      g('nightwing', "Nightwing. Surprise. I've been undercover in the Joker's crew for two weeks, and tonight I had to keep carrying his cargo to keep my cover."),
      g('nightwing', "I couldn't tell you. His goons were listening on every channel. I needed you to make the chase look real."),
      g('batman', 'You ran me across two rooftops to make it look real.'),
      g('nightwing', "In my defence, it worked. Come on, B. Let's finish this before midnight."),
    ],
  },

  // ---------------------------------------------------------------- Act 3: The Clock Plaza
  {
    // Nightwing joins at the plaza while he and Gordon talk (was the 'actThreeTitle' card, the
    // stand-alone 'nightwingTagRadio' call and a separate 'nightwingAlly' beat). The id stays
    // 'nightwingTagRadio' so saves sitting on the old Batwing balloon run still land here.
    id: 'nightwingTagRadio', type: 'ally', text: 'Nightwing is with you. Head for the clock plaza.', at: 'plaza', checkpoint: 'arena', talk: 'over',
    title: { text: 'ACT THREE: THE CLOCK PLAZA', sub: 'Hostages, a funhouse, and the Joker' },
    lines: [
      g('gordon', 'The clock plaza. Midnight is close, and so is he.'),
      g('nightwing', "The Batwing's cleared for you. Call it whenever you like. Just not for this bit."),
      g('gordon', 'GCPD has the plaza sealed. Every goon the Joker has left is inside it, and your hostages are past them.'),
      g('nightwing', "I'm going in the front. Come down and join me. Let's finish this together."),
    ],
  },
  {
    id: 'toPlaza', text: 'Get down to the clock plaza and back Nightwing up.', site: 'plaza', radius: 14, checkpoint: 'plaza', tutorial: ['callBatwing'],
    nudge: g('nightwing', 'Still in the plaza, still outnumbered. Not a complaint. Well, a small one.'),
    lines: [
      g('nightwing', "I'm in the middle of the plaza and they just noticed me. Any time now, B."),
      g('alfred', 'Down the steps, past the fountain. He is cocky, not invincible. Go and stand next to him.'),
    ],
  },
  { id: 'plazaFight', type: 'fight', fight: 'plaza', text: 'Clear the plaza with Nightwing at your side.' },
  {
    id: 'toFunhouse', type: 'interior', text: 'Enter the funhouse door in the old cathedral.', nudge: g('nightwing', "Funhouse door is in the cathedral, down the side. Can't miss it."), site: 'funhouseDoor', room: 'funhouse', radius: 10, checkpoint: 'arena',
    lines: [g('nightwing', 'Funhouse door, dead ahead. This is exactly as safe as it sounds, which is to say, not very.')],
  },
  { id: 'funhouseFight', type: 'fight', fight: 'funhouseFight', text: 'Fight through the funhouse floor to reach the hostages.' },
  {
    // The hostage roll call plays on the way up (was the stand-alone 'rescueGuestsRadio' beat).
    id: 'toTower', text: 'Go to the clock tower. The Joker is waiting.', site: 'arena', radius: 18, checkpoint: 'funhouse',
    nudge: g('gordon', "The clock tower, Batman. He's waited all night and he is not patient."),
    lines: [
      g('nightwing', 'Found the news crew, tied up but still filming out of spite. Found the rest of the hostages too.'),
      g('gordon', "Everyone's accounted for, Batman. Every hostage, the cargo, the transmitter, the antidote, all of it."),
      g('oracle', "One more thing before you go. The clock tower's cameras just lit up. He's waiting for you."),
      g('nightwing', "Go. We've got the hostages. The tower is yours, and so is he."),
    ],
  },
  { id: 'boss', type: 'boss', boss: 'joker', text: 'Defeat the Joker.', checkpoint: 'arena' },
  { id: 'finale', type: 'cutscene', scene: 'finale', cinematic: CINEMATIC.finale },
  { id: 'credits', type: 'credits' },
];

// [story] Retired step ids (folded into the step that follows them) -> where they live now:
// src/game/storyAliases.js (pure, so roofStory.js and caseFile.js can read it without this file).
export { ALIASES } from './storyAliases.js';

// Lessons a later step repeats for a save that skipped the step teaching them.
export const CATCH_UP = {
  aceCatwalks: [
    { move: 'silentTakedown', tips: ['crouch', 'silent'] },
    { move: 'perchDrop', tips: ['perch', 'perchDrop'] },
  ],
};

// The tip cards to show when `step` begins: its own, after any basics this save hasn't learned.
export function tutorialFor(step, moves = [], catchUp = CATCH_UP) {
  if (!step?.tutorial) return null;
  const extra = (catchUp[step.id] ?? []).filter((c) => !moves.includes(c.move)).flatMap((c) => c.tips);
  return extra.length ? [...extra, ...step.tutorial] : step.tutorial;
}
