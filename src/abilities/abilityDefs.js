// [onboard] Every player-facing capability, and where the story hands it over. Pure data.
//
// A capability is usable only once it is unlocked for the campaign (src/abilities/abilities.js);
// the single place each one is triggered asks src/abilities/gate.js `can(hero, id)` first, so a
// locked one simply does not fire and its HUD / prompt / wheel entry stays hidden. Skill-tree
// nodes (src/progress) stay upgrades ON TOP of an unlocked ability (the wingsuit tiers, grapple
// pull, the Bat Swarm need both).
//
// grant:
//   'start'                        the starting kit (a brand-new save)
//   { step: 'toDocks' }            Night One: unlocked as that step begins (and for any save at
//                                  or past it: src/game/story.js order)
//   { night: 'n2' }                a campaign night: as the night starts
//   { night: 'n2', after: 'm2X' }  a campaign night: once that mission is complete
//   { reward: true }               only through an `ability:<id>` story reward
// teach (optional): the hands-on beat when it is granted.
//   prompt   the tutorial prompt id (src/ui/prompts.js) that explains it
//   proof    the event that proves she did it (completion is the player performing the move)
//   line     { speaker, text }: the diegetic reason, said over the play as it arrives
//
// Gadgets are listed for the snapshot and the wheel, but their unlocks stay with the gadget
// system (src/gadgets/gadgetDefs.js unlock, campaign `gadget:` rewards): `gadget: true` marks them.

const L = (speaker, text) => ({ speaker, portrait: speaker, text });

export const ABILITIES = Object.freeze([
  // ---------------------------------------------------------------- the starting kit
  // He is Batman before the night starts: he can move, climb, glide off a roof and fight with his
  // hands. That is all the opening (the GCPD roof, the glide to the Docks, the first roof fight)
  // needs, and nothing in it can be skipped past with a tool he hasn't been given yet.
  { id: 'move', kind: 'traversal', name: 'Move, jump and sprint', grant: 'start' },
  { id: 'crouch', kind: 'traversal', name: 'Crouch', grant: 'start' },
  { id: 'ledge', kind: 'traversal', name: 'Ledges and ladders', grant: 'start' },
  { id: 'glide', kind: 'traversal', name: 'Cape glide', grant: 'start' },
  { id: 'punch', kind: 'move', name: 'Punch', grant: 'start' },
  { id: 'kick', kind: 'move', name: 'Kick', grant: 'start' },
  { id: 'counter', kind: 'move', name: 'Block and counter', grant: 'start' },
  { id: 'stomp', kind: 'move', name: 'Ground takedown', grant: 'start' },
  { id: 'map', kind: 'system', name: 'Map and waypoints', grant: 'start' },
  { id: 'photoMode', kind: 'system', name: 'Photo mode', grant: 'start' },
  // The utility belt itself (the wheel and the fire key). Which gadgets are on it is the gadget
  // system's business; this id is what a scripted lock (Night Eight's gauntlet) switches off.
  { id: 'gadgets', kind: 'system', name: 'Utility belt', grant: 'start' },

  // ---------------------------------------------------------------- Night One
  { id: 'grapple', kind: 'traversal', name: 'Grapnel gun', grant: { step: 'toDocks' },
    teach: { prompt: 'grapple', proof: 'grapple', line: L('alfred', "Mr. Fox re-strung the grapnel this afternoon. If the glide comes up short, fire it at the roof edge.") } },
  { id: 'zipline', kind: 'traversal', name: 'Ziplines', grant: { step: 'toDocks' } },
  { id: 'batmobile', kind: 'vehicle', name: 'Batmobile', grant: { step: 'boardBatmobile' } },
  { id: 'batmobileCall', kind: 'vehicle', name: 'Call the Batmobile', grant: { step: 'toRoofAfterChase' },
    teach: { prompt: 'callCar', proof: 'vehicleCalled', line: L('alfred', 'The car will come when you call it now, sir. Within reason.') } },
  { id: 'dodge', kind: 'move', name: 'Dodge roll', grant: { step: 'f2' }, teach: { prompt: 'dodge', proof: 'dodge' } },
  { id: 'throw', kind: 'move', name: 'Grab and throw', grant: { step: 'f2' }, teach: { prompt: 'throw', proof: 'throwRelease' } },
  { id: 'moveStrikes', kind: 'move', name: 'Directional strikes', grant: { step: 'f2' }, teach: { prompt: 'movesDirection', proof: 'moveLanded' } },
  { id: 'diveBomb', kind: 'traversal', name: 'Dive bomb', grant: { step: 'toYard' },
    teach: { prompt: 'divebomb', proof: 'diveImpact', line: L('gordon', "That yard crew hasn't looked up all night. Come down on them hard.") } },
  { id: 'comboFinisher', kind: 'move', name: 'Combo finishers', grant: { step: 'f3' }, teach: { prompt: 'finisher', proof: 'critical' } },
  { id: 'aerialAttacks', kind: 'move', name: 'Aerial attacks', grant: { step: 'f3' }, teach: { prompt: 'movesAir', proof: 'moveLanded' } },
  { id: 'groundPound', kind: 'move', name: 'Ground pound', grant: { step: 'f3' }, teach: { prompt: 'slam', proof: 'slam' } },
  { id: 'wallRun', kind: 'traversal', name: 'Wall run', grant: { step: 'toNeon' },
    teach: { prompt: 'wallrun', proof: 'wallRun', line: L('oracle', "Neon Row's roofs are packed tight. Sprint along a wall and you won't even touch the street.") } },
  { id: 'capeStun', kind: 'move', name: 'Cape stun', grant: { step: 'n1' }, teach: { prompt: 'cape', proof: 'cape' } },
  { id: 'silentTakedown', kind: 'move', name: 'Silent takedown', grant: { step: 'monarchBalcony' }, teach: { prompt: 'silent', proof: 'silentTakedown' } },
  { id: 'perch', kind: 'traversal', name: 'Perches and perch drops', grant: { step: 'monarchBalcony' }, teach: { prompt: 'perchDrop', proof: 'perchDrop' } },
  { id: 'detective', kind: 'system', name: 'Detective vision', grant: { step: 'monarchBalcony' },
    teach: { prompt: 'detective', proof: 'detective', line: L('oracle', "I've pushed the new detective-mode filter to your cowl. Count the rifles before you move.") } },
  { id: 'beatdown', kind: 'move', name: 'Beatdown', grant: { step: 'a1' } },
  { id: 'eject', kind: 'vehicle', name: 'Eject into a glide', grant: { step: 'boardBatmobileAce2' },
    teach: { prompt: 'eject', proof: 'vehicleEject' } },
  { id: 'ledgeTakedown', kind: 'move', name: 'Ledge takedown and vents', grant: { step: 'aceCatwalks' } },
  { id: 'batwing', kind: 'vehicle', name: 'Call the Batwing', grant: { step: 'nightwingTagRadio' }, teach: { prompt: 'callBatwing', proof: 'wingEnter' } },
  { id: 'fastTravel', kind: 'system', name: 'Fast travel', grant: { step: 'credits' } },
  // [verify] The sandbox and the GCPD (src/wanted, src/sandbox; docs/design/wanted.md 9). Night One
  // teaches the basics: the car radio comes with the car; the police start to care about the
  // vigilante once Gordon warns him on the way to Ace (Night One still caps them at Pursuit, wanted.js
  // storyState); taking street cars and hailing a cab are free-roam conveniences after the credits.
  { id: 'carRadio', kind: 'vehicle', name: 'Car radio', grant: { step: 'boardBatmobile' } },
  { id: 'policeAttention', kind: 'system', name: 'Police attention', grant: { step: 'toAce' },
    teach: { line: L('gordon', "One more thing. Not every officer on the street got my memo about you. Give them a reason and they'll chase you, and I can't call them all off.") } },
  { id: 'takeCar', kind: 'vehicle', name: 'Take a street car', grant: { step: 'credits' } },
  { id: 'hailTaxi', kind: 'system', name: 'Hail a taxi (as Bruce)', grant: { step: 'credits' } },

  // ---------------------------------------------------------------- the campaign (Nights 2-9)
  // Each arrives one mission before the first beat that leans on it (the story agent's list:
  // droneRun / toLoungeRoof grapple boost, elRun chained grapples, m3Tower and n6Canopy flight,
  // n7Convoy battle mode; the predator rooms and bosses use what Night One gave).
  { id: 'specialTakedown', kind: 'move', name: 'Special takedown', grant: { night: 'n2' },
    teach: { prompt: 'special', proof: 'special', line: L('alfred', 'Mr. Fox fitted new actuators to the gauntlets today, sir. Build a big combo and they will finish one man outright.') } },
  { id: 'grappleBoost', kind: 'traversal', name: 'Grapple boost', grant: { night: 'n2', after: 'm2Heist' },
    teach: { prompt: 'grappleBoost', proof: 'grappleBoost', line: L('oracle', 'Lucius re-geared your grapnel motor. Jump as the line reels you in and it throws you up over the ledge. You will want it for that drone.') } },
  { id: 'battleMode', kind: 'vehicle', name: 'Batmobile battle mode', grant: { night: 'n2', after: 'm2Pursuit' },
    teach: { prompt: 'battleMode', proof: 'vehicleMode', line: L('alfred', 'Mr. Fox says he has taken the training wheels off the car. Hold block while you drive and it becomes a tank. His words, sir.') } },
  { id: 'chainTakedown', kind: 'move', name: 'Chain takedowns', grant: { night: 'n2', after: 'm2Smugglers' },
    teach: { prompt: 'chain', proof: 'chainStart', line: L('alfred', "You have been fighting six men at once all week, sir. Master Grayson calls what you do next a 'chain'. I call it showing off.") } },
  { id: 'reGrapple', kind: 'traversal', name: 'Chained grapples', grant: { night: 'n3' },
    teach: { prompt: 'reGrapple', proof: 'grapple', line: L('oracle', 'The El runs on a schedule and tonight so do you. Fire the grapnel again mid-glide and you keep every bit of speed. Lucius unlocked the second charge.') } },
  { id: 'wingsuit', kind: 'traversal', name: 'Wingsuit', grant: { night: 'n3', after: 'm3El' },
    teach: { prompt: 'glide', proof: 'glideStart', line: L('oracle', "Lucius says the suit's wing membrane is live, once you've fitted the flight upgrade. The tallest building in Gotham seems like a good place to try it.") } },
  { id: 'batSwarm', kind: 'move', name: 'Bat Swarm', grant: { night: 'n4' },
    teach: { prompt: 'swarm', proof: 'swarmStart', line: L('alfred', 'The colony under the cave has taken a liking to you. With the right gear, they will come when called.') } },
  { id: 'grapplePull', kind: 'traversal', name: 'Grapple pull', grant: { night: 'n5' },
    teach: { prompt: 'grapplePull', proof: 'grapplePull', line: L('oracle', 'New winch in the grapnel. Aim it at a man or a loose crate and pull. The Yards are full of both.') } },

  // ---------------------------------------------------------------- gadgets (unlocked by the gadget system)
  ...['batarang', 'remote', 'gel', 'smoke', 'launcher', 'claw', 'freeze', 'flashbang',
    'disruptor', 'sonic', 'hack', 'shock', 'glue', 'tracker', 'drone', 'bolas', 'emp', 'decoy']
    .map((g) => ({ id: `gadget.${g}`, kind: 'gadget', name: g, grant: { reward: true }, gadget: true })),
]);

export const ABILITY_IDS = Object.freeze(ABILITIES.map((a) => a.id));
const BY_ID = new Map(ABILITIES.map((a) => [a.id, a]));
export const abilityById = (id) => BY_ID.get(id) ?? null;
// The ones this layer gates itself (gadgets belong to the gadget system).
export const GATED_IDS = Object.freeze(ABILITIES.filter((a) => !a.gadget).map((a) => a.id));
export const START_KIT = Object.freeze(ABILITIES.filter((a) => a.grant === 'start').map((a) => a.id));
// Traversal abilities a `?moves=all` dev run expects (with the skill nodes it owns).
// Scripted temporary locks a step may name (`locks: ['detective', 'gadgets', 'grapple']`, Night
// Eight's gauntlet): what each switches off until a step without it begins.
export const LOCK_GROUPS = Object.freeze({
  detective: ['detective'], gadgets: ['gadgets'], grapple: ['grapple', 'grapplePull', 'grappleBoost', 'reGrapple', 'zipline'],
  glide: ['glide', 'wingsuit', 'diveBomb'], vehicles: ['batmobileCall', 'batwing'],
});
export const TRAVERSAL_IDS = Object.freeze(ABILITIES.filter((a) => a.kind === 'traversal' && !a.gadget).map((a) => a.id));

// Tutorial prompts (src/ui/prompts.js) that talk about one ability: the prompt queue drops them
// while that ability is locked, so no card ever teaches something she can't do yet.
export const PROMPT_ABILITY = Object.freeze({
  grapple: 'grapple', grappleBoost: 'grappleBoost', zip: 'zipline', wallrun: 'wallRun', divebomb: 'diveBomb',
  dodge: 'dodge', throw: 'throw', movesDirection: 'moveStrikes', movesSprint: 'moveStrikes', movesAir: 'aerialAttacks',
  slam: 'groundPound', finisher: 'comboFinisher', cape: 'capeStun', knife: 'capeStun', special: 'specialTakedown',
  brute: 'capeStun', detective: 'detective', callBatwing: 'batwing', chain: 'chainTakedown', chainTied: 'chainTakedown',
  swarm: 'batSwarm', silent: 'silentTakedown', perch: 'perch', perchDrop: 'perch', vent: 'ledgeTakedown',
  ledgeStealth: 'ledgeTakedown', takedown: 'ledgeTakedown', callCar: 'batmobileCall', eject: 'eject',
  battleMode: 'battleMode', photo: 'photoMode', vehicle: 'batmobile', spotted: 'grapple',
  reGrapple: 'reGrapple', grapplePull: 'grapplePull', gadgetWheel: 'gadgets',
});
