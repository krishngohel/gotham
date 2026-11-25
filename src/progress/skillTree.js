// The skill tree (wave 3, workstream L1): WayneTech grown from 4 linear rows of 5 into eight
// branching branches plus small per-hero kit branches. Pure data and rules, no DOM.
//
// A node:   { id, branch, name, text, demo, cost, currency, requires[], act, heroes?, effect[] }
//   text     what it changes, in one line, with numbers
//   demo     a short "picture it" line the tree page shows under the text
//   currency 'xp' (skill points from XP) or 'standing' (the Wayne branch: Bruce's Standing, K)
//   act      the campaign act that opens it (1..5); see actOf() in the run-time module
//   heroes   only for kit branches: the hero ids (src/heroes/roster.js) that see and use it
//   effect   [key, op, value] ops on the one effects object (BASE_EFFECTS in ./upgrades.js);
//            op: 'set' | 'add' | 'mul' | 'max'. Applied in tree order.
//
// The original 20 WayneTech ids are the first five nodes of armor, combat, gadgets and traversal,
// each still needing the one above it, with exactly their old effects (old saves load: see
// ./wayneSave.js and tests/unit/skillTree.test.js).

export const BRANCHES = [
  { id: 'armor', name: 'Armor', icon: 'shield', currency: 'xp', blurb: 'Plates, weaves and the will to stand back up.' },
  { id: 'combat', name: 'Combat', icon: 'fist', currency: 'xp', blurb: 'Counters, chains and crowd control.' },
  { id: 'gadgets', name: 'Gadgets', icon: 'belt', currency: 'xp', blurb: 'More out of every toy on the belt.' },
  { id: 'traversal', name: 'Traversal', icon: 'wing', currency: 'xp', blurb: 'Grapple, glide and the wingsuit.' },
  { id: 'predator', name: 'Predator', icon: 'eye', currency: 'xp', blurb: 'Silence, shadows and fear.' },
  { id: 'detective', name: 'Detective', icon: 'lens', currency: 'xp', blurb: 'See further, scan faster, never lose a tag.' },
  { id: 'vehicle', name: 'Batmobile', icon: 'car', currency: 'xp', blurb: 'Speed, plates and a bigger bang.' },
  { id: 'wayne', name: 'Wayne', icon: 'tower', currency: 'standing', blurb: "Bought with Bruce's Standing, not XP." },
  { id: 'kit', name: 'Hero kit', icon: 'star', currency: 'xp', blurb: 'Moves only this hero has.' },
];
export const BRANCH_IDS = BRANCHES.map((b) => b.id);

const n = (branch, id, name, text, demo, { cost = 1, requires = [], act = 1, heroes = null, effect = [] } = {}) => ({
  id, branch, name, text, demo, cost, currency: branch === 'wayne' ? 'standing' : 'xp', requires, act, heroes, effect,
});

export const NODES = [
  // ---------------- Armor ----------------
  n('armor', 'plating1', 'Reinforced Plating', 'Max health +25.', 'Shrug off one more punch per fight.', { effect: [['maxHealthBonus', 'add', 25]] }),
  n('armor', 'kevlar', 'Kevlar Weave', 'Knife slashes, thrown gags and rifle shots hurt 30% less.', 'A knife skids off the forearm with a spark.', { requires: ['plating1'], effect: [['knifeMult', 'set', 0.7], ['rangedMult', 'set', 0.7]] }),
  n('armor', 'plating2', 'Titanium Plating', 'Max health +25 more.', 'Two more hits before the cowl rings.', { requires: ['kevlar'], effect: [['maxHealthBonus', 'add', 25]] }),
  n('armor', 'medic', 'Field Medic', 'Out of a fight, health comes back after 2.5 s instead of 6 s, three times as fast.', 'Catch your breath on a gargoyle and the bar fills.', { requires: ['plating2'], effect: [['regenDelay', 'set', 2.5], ['regenRate', 'set', 12]] }),
  n('armor', 'dampers', 'Impact Dampers', 'Every hit hurts 15% less.', 'A brute swing lands like a shove.', { requires: ['medic'], effect: [['damageMult', 'set', 0.85]] }),
  n('armor', 'insulated', 'Insulated Lining', 'Cold and ice hurt half as much.', 'Frost creeps up the cape and stops at the seams.', { requires: ['kevlar'], act: 2, effect: [['coldMult', 'mul', 0.5]] }),
  n('armor', 'fireweave', 'Fireweave', 'Fire and burning chemicals hurt half as much.', 'Walk through a burning doorway with the cape over your face.', { requires: ['kevlar'], act: 2, effect: [['fireMult', 'mul', 0.5]] }),
  n('armor', 'rebreather', 'Rebreather', 'Gas, smoke traps and fear toxin hurt half as much.', 'A green cloud rolls over you; the lenses fog, you keep fighting.', { requires: ['plating2'], act: 3, effect: [['gasMult', 'mul', 0.5]] }),
  n('armor', 'ironclad', 'Ironclad', 'Max health +25, a third time.', 'The suit creaks. It does not give.', { cost: 2, requires: ['plating2'], act: 3, effect: [['maxHealthBonus', 'add', 25]] }),
  n('armor', 'secondWind', 'Second Wind', 'Once per fight, a hit that would put you down leaves you on 25% health instead.', 'Knees hit the floor; the cape snaps; you are up again.', { cost: 2, requires: ['medic'], act: 3, effect: [['secondWind', 'add', 1]] }),
  n('armor', 'hardenedCowl', 'Hardened Cowl', 'Sniper and rifle shots hurt half as much again.', 'A laser dot finds the cowl. The round does not.', { cost: 2, requires: ['dampers'], act: 4, effect: [['sniperMult', 'mul', 0.5]] }),

  // ---------------- Combat ----------------
  n('combat', 'reflexes', 'Quick Reflexes', 'Blue bolts stay up 0.15 s longer: more time to counter.', 'The bolt hangs in the air a heartbeat longer.', { effect: [['counterWindow', 'set', 0.15]] }),
  n('combat', 'flow', 'Steady Flow', 'The first hit you take in a combo does not break it.', 'Take a jab, keep the count.', { requires: ['reflexes'], effect: [['comboShield', 'set', 1]] }),
  n('combat', 'efficient', 'Efficient Chains', 'Chain takedowns cost 2 less combo.', 'Rope-a-Dope comes up two hits sooner.', { requires: ['flow'], effect: [['chainDiscount', 'set', 2]] }),
  n('combat', 'fastFinish', 'Fast Finish', 'Special takedowns unlock at combo 6 instead of 8.', 'The combo turns yellow sooner.', { requires: ['efficient'], effect: [['specialAt', 'set', 6]] }),
  n('combat', 'swarm', 'Bat Swarm', 'A fourth chain takedown for a big combo: a swarm of bats takes down up to six goons.', 'SKREEEE. Six goons on the floor.', { requires: ['fastFinish'], effect: [['batSwarm', 'set', true]] }),
  n('combat', 'doubleCounter', 'Double Counter', 'Counter two attackers at once.', 'Two blue bolts, one tap, two goons flipped.', { requires: ['reflexes'], act: 1, effect: [['multiCounter', 'max', 2]] }),
  n('combat', 'shieldBreaker', 'Shield Breaker', 'Aerial attacks and kicks crack riot shields.', 'Vault, kick, and the shield splits down the middle.', { requires: ['flow'], act: 2, effect: [['shieldBreak', 'set', true]] }),
  n('combat', 'disarm', 'Disarm and Destroy', 'Knives, batons and guns can be broken mid-fight.', 'Snap. The baton is two short sticks now.', { requires: ['efficient'], act: 2, effect: [['disarmDestroy', 'set', true]] }),
  n('combat', 'aerialPlus', 'Aerial Attack Plus', 'Aerial attacks hit 50% harder.', 'A jump-kick that ends the argument.', { requires: ['flow'], act: 3, effect: [['aerialDamage', 'mul', 1.5]] }),
  n('combat', 'tripleCounter', 'Triple Counter', 'Counter three attackers at once.', 'Three bolts. One tap. Three groans.', { cost: 2, requires: ['doubleCounter'], act: 3, effect: [['multiCounter', 'max', 3]] }),
  n('combat', 'beatdownFinisher', 'Beatdown Finisher', 'A beatdown ends in a knockout blow.', 'The last punch of the flurry lands with a CRACK.', { cost: 2, requires: ['fastFinish'], act: 4, effect: [['beatdownFinisher', 'set', true]] }),
  n('combat', 'partnerTakedown', 'Partner Takedown', 'Two heroes, one goon, one move. Solo: an AI ally joins in.', 'Two capes, a lift and a slam.', { cost: 2, requires: ['swarm'], act: 5, effect: [['partnerTakedown', 'set', true]] }),

  // ---------------- Gadgets ----------------
  n('gadgets', 'triple', 'Triple Batarang', 'The batarang throws up to three at once, one per goon.', 'Three goons, three clonks.', { effect: [['batarangCount', 'set', 3]] }),
  n('gadgets', 'bigBang', 'Bigger Bang', 'Explosive gel blast grows from 4 m to 5.5 m.', 'The wall goes, and the goon behind it.', { requires: ['triple'], effect: [['gelRadius', 'set', 5.5]] }),
  n('gadgets', 'quickSmoke', 'Quick Smoke', 'Smoke pellet cooldown drops from 12 s to 7 s.', 'Vanish, reappear, vanish again.', { requires: ['bigBang'], effect: [['smokeCooldown', 'set', 7]] }),
  n('gadgets', 'doubleClaw', 'Double Claw', 'The batclaw pulls two goons at once.', 'Two goons, one rope, a collision.', { requires: ['quickSmoke'], effect: [['clawTargets', 'set', 2]] }),
  n('gadgets', 'deepFreeze', 'Deep Freeze', 'Freeze blast ice lasts 8 s instead of 5 s.', 'A goon-shaped ice cube, for longer.', { requires: ['doubleClaw'], effect: [['freezeTime', 'set', 8]] }),
  n('gadgets', 'disruptorCharges', 'Disruptor Capacitor', 'The disruptor holds 3 charges instead of 2.', 'Click. Click. Click. Three dead rifles.', { requires: ['triple'], act: 1, effect: [['disruptorCharges', 'set', 3]] }),
  n('gadgets', 'sonicStun', 'Sonic Shockwave', 'Press again while the sonic batarang lures: it bursts and stuns everyone it drew in.', 'Five goons lean in to listen. Then: SKREE.', { requires: ['triple'], act: 2, effect: [['sonicStun', 'set', true]] }),
  n('gadgets', 'hackFast', 'Cryptographic Sequencer Mk II', 'Hacking windows are 50% wider.', 'The tumblers line up before the guard turns.', { requires: ['bigBang'], act: 2, effect: [['hackWindow', 'mul', 1.5]] }),
  n('gadgets', 'shockOvercharge', 'Overcharge', 'Shock gloves charge 40% faster.', 'The knuckles hum after four hits, not six.', { requires: ['bigBang'], act: 3, effect: [['shockChargeRate', 'mul', 1.4]] }),
  n('gadgets', 'glueSpread', 'Wide Spray', 'Glue grenade covers 4.5 m instead of 3 m.', 'A whole doorway of goons, stuck to the floor.', { requires: ['quickSmoke'], act: 2, effect: [['glueRadius', 'set', 4.5]] }),
  n('gadgets', 'trackerMulti', 'Twin Trackers', 'Keep two tracker darts tagged at once.', 'Two cars, two blips.', { requires: ['quickSmoke'], act: 2, effect: [['trackerTags', 'max', 2]] }),
  n('gadgets', 'droneLong', 'Long-range Drone', 'The scout drone flies for 32 s instead of 20 s.', 'One more lap of the warehouse roof.', { requires: ['doubleClaw'], act: 3, effect: [['droneTime', 'set', 32]] }),
  n('gadgets', 'bolasDouble', 'Weighted Bolas', 'Bolas wrap two goons standing close.', 'Two pairs of legs, one knot.', { requires: ['doubleClaw'], act: 3, effect: [['bolasTargets', 'max', 2]] }),
  n('gadgets', 'empWide', 'Wide-band EMP', 'EMP mines reach 9 m instead of 6 m.', 'Every gun in the room clicks dead.', { requires: ['deepFreeze'], act: 4, effect: [['empRadius', 'set', 9]] }),
  n('gadgets', 'decoyLong', 'Persistent Decoy', 'Decoy holograms last 14 s instead of 8 s.', 'They empty a whole magazine into a picture of you.', { requires: ['deepFreeze'], act: 4, effect: [['decoyTime', 'set', 14]] }),
  n('gadgets', 'gadgetCombo', 'Gadget Combo', 'Two quickfire gadgets inside one combo without breaking it.', 'Claw, punch, freeze, punch: the count keeps climbing.', { cost: 2, requires: ['deepFreeze'], act: 5, effect: [['gadgetCombo', 'set', true]] }),

  // ---------------- Traversal ----------------
  n('traversal', 'accelerator', 'Grapple Accelerator', 'Grapple boost launches you about 25% higher and farther.', 'Off the ledge and into the clouds.', { effect: [['boostUp', 'set', 19], ['boostOut', 'set', 11]] }),
  n('traversal', 'aero', 'Aerodynamic Cape', 'Glide dives build speed 30% faster, top speed 56 m/s instead of 48.', 'The wind screams past the ears.', { requires: ['accelerator'], effect: [['diveGain', 'set', 1.3], ['glideMax', 'set', 56]] }),
  n('traversal', 'grip', 'Wall Grip Boots', 'Wall runs last 1.8 s instead of 1.2 s.', 'Three more steps up the brick.', { requires: ['aero'], effect: [['wallRunTime', 'set', 1.8]] }),
  n('traversal', 'rails', 'Slide Rails', 'Slide down ladders at 14 m/s instead of 9.', 'Zzzzip to the street.', { requires: ['grip'], effect: [['ladderSlide', 'set', 14]] }),
  n('traversal', 'seismic', 'Seismic Landing', 'Dive bomb shockwave reaches 6 m instead of 4 m.', 'Land in the middle of them. They all fall over.', { requires: ['rails'], effect: [['diveRadius', 'set', 6]] }),
  n('traversal', 'grappleRange1', 'Grapple Range I', 'Grapple reaches 25% farther and reels 20% faster.', 'That far rooftop is in reach now.', { requires: ['accelerator'], act: 1, effect: [['grappleRange', 'max', 1.25], ['grappleReel', 'max', 1.2]] }),
  n('traversal', 'grappleBoost', 'Grapple Boost', 'Hold jump at the top of a grapple to launch past the ledge straight into a glide.', 'Up, over, and already gliding.', { requires: ['grappleRange1'], act: 1, effect: [['grappleBoost', 'set', true]] }),
  n('traversal', 'grappleRange2', 'Grapple Range II', 'Grapple reaches 50% farther and reels 40% faster.', 'Across the avenue in one pull.', { cost: 2, requires: ['grappleRange1'], act: 2, effect: [['grappleRange', 'max', 1.5], ['grappleReel', 'max', 1.4]] }),
  n('traversal', 'glideReGrapple', 'Glide Re-grapple', 'Grapple again mid-glide and keep your speed.', 'Glide, grapple, glide: never touch the street.', { requires: ['aero', 'grappleBoost'], act: 2, effect: [['glideReGrapple', 'set', true]] }),
  n('traversal', 'grapplePull', 'Grapple Pull', 'Yank a goon off a ledge or a loose object toward you.', 'The sniper leaves his nest the quick way.', { requires: ['grappleBoost'], act: 2, effect: [['grapplePull', 'set', true]] }),
  n('traversal', 'wingsuit1', 'Wingsuit I', 'Dive to build speed, pull up to trade it for height.', 'Drop, scream, swoop back up a whole storey.', { requires: ['aero'], act: 2, effect: [['wingsuit', 'max', 1]] }),
  n('traversal', 'wingsuit2', 'Wingsuit II', 'Tighter turns at speed.', 'Thread between the El tracks and the billboards.', { requires: ['wingsuit1'], act: 3, effect: [['wingsuit', 'max', 2]] }),
  n('traversal', 'wingsuit3', 'Wingsuit III', 'Higher top speed and a speed-line tunnel at full dive.', 'The city smears into ink lines.', { cost: 2, requires: ['wingsuit2'], act: 4, effect: [['wingsuit', 'max', 3]] }),
  n('traversal', 'elSurfer', 'El Surfer', 'Stick to train roofs and jump off them with a boost.', 'Ride the Loop, leap at the station.', { requires: ['rails'], act: 3, effect: [['elSurfer', 'set', true]] }),
  n('traversal', 'updraftReader', 'Updraft Reader', 'Rising air over vents, silos and the lakefront shows up and lifts you.', 'Shimmer lines over a vent: free height.', { requires: ['wingsuit1'], act: 3, effect: [['updrafts', 'set', true]] }),

  // ---------------- Predator ----------------
  n('predator', 'silentGlide', 'Silent Glide', 'Gliding and landing make no noise.', 'Touch down behind him. He never hears it.', { act: 1, effect: [['silentGlide', 'set', true]] }),
  n('predator', 'quietFeet', 'Quiet Feet', 'Footsteps carry half as far.', 'Walk, do not creep, and still go unheard.', { requires: ['silentGlide'], act: 1, effect: [['footstepNoise', 'mul', 0.5]] }),
  n('predator', 'invertedTakedown', 'Inverted Takedown', 'Hang from a perch and haul a goon up to dangle.', 'Feet disappear upward. A muffled yelp.', { requires: ['silentGlide'], act: 2, effect: [['invertedTakedown', 'set', true]] }),
  n('predator', 'fearTakedown1', 'Fear Takedown', 'After a silent takedown, take down two more goons in one move.', 'Time slows. Two goons, two thuds.', { cost: 2, requires: ['quietFeet'], act: 3, effect: [['fearTakedowns', 'max', 2]] }),
  n('predator', 'dread', 'Dread', 'Your takedowns spread fear 25% faster: goons hesitate, flee or surrender sooner.', 'His hands are shaking. He drops the rifle.', { requires: ['fearTakedown1'], act: 3, effect: [['fearGain', 'mul', 1.25]] }),
  n('predator', 'fearTakedown2', 'Fear Takedown x3', 'Fear takedowns reach three goons.', 'Three thuds, one heartbeat.', { cost: 2, requires: ['fearTakedown1'], act: 4, effect: [['fearTakedowns', 'max', 3]] }),
  n('predator', 'ledgePlus', 'Ledge Takedown Plus', 'Ledge takedowns work from twice as far along the edge.', 'Down the ledge, a hand, a splash.', { requires: ['invertedTakedown'], act: 4, effect: [['ledgeTakedownPlus', 'set', true]] }),

  // ---------------- Detective ----------------
  n('detective', 'scanRange', 'Long Lens', 'Detective vision sees 50% farther.', 'The far rooftop lights up in outlines.', { act: 1, effect: [['detectiveRange', 'mul', 1.5]] }),
  n('detective', 'forensics', 'Field Forensics', 'Evidence scans finish 50% faster.', 'The blood spatter resolves before the sirens arrive.', { requires: ['scanRange'], act: 2, effect: [['scanSpeed', 'mul', 1.5]] }),
  n('detective', 'trackerNetwork', 'Tracker Network', 'Tracker darts stay on the map until you remove them.', 'The van went to ground. The blip did not.', { requires: ['scanRange'], act: 2, effect: [['trackerPersist', 'set', true]] }),
  n('detective', 'hackRange', 'Long-range Sequencer', 'Hack from 24 m instead of 12 m.', 'The camera turns away from across the street.', { requires: ['forensics'], act: 3, effect: [['hackRange', 'set', 24]] }),

  // ---------------- Batmobile ----------------
  n('vehicle', 'pursuitTuning', 'Pursuit Tuning', 'Batmobile top speed +10%.', 'The getaway van sees you in the mirror.', { act: 1, effect: [['carTopSpeed', 'mul', 1.1]] }),
  n('vehicle', 'ramPlates', 'Ram Plates', 'Rams do 50% more damage.', 'The van folds. The Batmobile does not.', { requires: ['pursuitTuning'], act: 2, effect: [['carRamDamage', 'mul', 1.5]] }),
  n('vehicle', 'battleArmor', 'Battle Armour', 'The Batmobile takes 30% less damage.', 'Rounds spark off the hood.', { requires: ['pursuitTuning'], act: 3, effect: [['carArmor', 'mul', 0.7]] }),
  n('vehicle', 'afterburner', 'Afterburner', 'A longer, hotter boost.', 'A blue cone and a sonic thump.', { cost: 2, requires: ['ramPlates'], act: 4, effect: [['carAfterburner', 'set', true]] }),

  // ---------------- Wayne (Standing) ----------------
  n('wayne', 'wayneScholars', 'Wayne Scholars', 'All XP +10%.', 'Interns at Applied Sciences crunch your fight data.', { cost: 10, act: 1, effect: [['xpMult', 'mul', 1.1]] }),
  n('wayne', 'appliedSciences', 'Applied Sciences Budget', 'A weekly delivery of gadget parts to the Batcave.', 'A crate with a sticky note from Lucius.', { cost: 15, act: 1, effect: [['rndDelivery', 'set', true]] }),
  n('wayne', 'alfredAlibis', "Alfred's Alibis", 'Suspicion grows 20% slower.', '"Master Bruce was at the opera. I have the ticket stub."', { cost: 10, act: 1, effect: [['suspicionMult', 'mul', 0.8]] }),
  n('wayne', 'batmobileFunding', 'Batmobile Modules', 'Unlocks the Batmobile pursuit modules.', 'A new bay door opens in the cave.', { cost: 20, requires: ['appliedSciences'], act: 2, effect: [['pursuitModules', 'set', true]] }),
  n('wayne', 'oracleNetwork', 'Oracle Network', 'Crimes show on the map before they start.', 'A ping, a district, a countdown.', { cost: 20, requires: ['appliedSciences'], act: 2, effect: [['crimeForewarning', 'set', true]] }),
  n('wayne', 'nightNurse', 'Night Nurse', 'Fatigue recovers 50% faster.', 'Stitches, tea and four hours of sleep.', { cost: 15, requires: ['alfredAlibis'], act: 2, effect: [['fatigueRecovery', 'mul', 1.5]] }),
  n('wayne', 'downtownCave', 'Downtown Cave', 'A second cave entrance downtown for fast travel.', 'A lift behind a parking garage wall.', { cost: 25, requires: ['appliedSciences'], act: 3, effect: [['downtownCave', 'set', true]] }),
  n('wayne', 'foundationFund', 'Foundation Fund', 'Every week, one district cools down a notch.', 'New streetlights; fewer muggings.', { cost: 25, requires: ['alfredAlibis'], act: 3, effect: [['heatRelief', 'add', 1]] }),
  n('wayne', 'alliesOnCall', 'Allies on Call', 'Summon Nightwing or Robin into a fight.', 'A whistle, a flip, and backup.', { cost: 30, requires: ['oracleNetwork'], act: 4, effect: [['alliesOnCall', 'set', true]] }),

  // ---------------- Kit branches (one small branch per hero family) ----------------
  n('kit', 'nw.escrimaCharge', 'Live Wire', 'Escrima flurry comes back 20% sooner.', 'The sticks crackle and swing again.', { heroes: ['nightwing'], effect: [['sigCooldownMult', 'mul', 0.8]] }),
  n('kit', 'nw.wallFlip', 'Wall Flip Chain', 'Wall flips chain into an aerial strike.', 'Off the wall, over the goon, into his back.', { heroes: ['nightwing'], requires: ['nw.escrimaCharge'], act: 2, effect: [['acrobatChain', 'set', true]] }),
  n('kit', 'nw.escrimaShock', 'Escrima Shock', 'Signature moves hit 25% harder.', 'Blue arcs between the sticks.', { heroes: ['nightwing'], requires: ['nw.escrimaCharge'], act: 3, effect: [['sigPower', 'mul', 1.25]] }),
  n('kit', 'rb.staffVault', 'Staff Vault', 'Signature moves come back 20% sooner.', 'Plant, vault, strike.', { heroes: ['robin', 'robin-modern', 'robin-staff'], effect: [['sigCooldownMult', 'mul', 0.8]] }),
  n('kit', 'rb.smokeDash', 'Smoke and Dash', 'A wider dodge window.', 'A puff, and the bird has flown.', { heroes: ['robin', 'robin-modern', 'robin-staff'], requires: ['rb.staffVault'], act: 2, effect: [['dodgeWindow', 'add', 0.1]] }),
  n('kit', 'rb.staffSweep', 'Staff Sweep', 'Signature moves hit 25% harder.', 'A full circle at ankle height.', { heroes: ['robin', 'robin-modern', 'robin-staff'], requires: ['rb.staffVault'], act: 3, effect: [['sigPower', 'mul', 1.25]] }),
  n('kit', 'bg.twirlReach', 'Long Reach', 'Signature moves come back 20% sooner.', 'The twirl kick finds the man at the back.', { heroes: ['batgirl'], effect: [['sigCooldownMult', 'mul', 0.8]] }),
  n('kit', 'bg.acroDodge', 'Acrobat', 'A wider dodge window.', 'Cartwheel through the swing.', { heroes: ['batgirl'], requires: ['bg.twirlReach'], act: 2, effect: [['dodgeWindow', 'add', 0.1]] }),
  n('kit', 'bg.cowlSense', 'Cowl Sense', 'Blue bolts stay up 0.1 s longer.', 'You feel the punch before he throws it.', { heroes: ['batgirl'], requires: ['bg.twirlReach'], act: 3, effect: [['counterWindow', 'add', 0.1]] }),
  n('kit', 'rh.brawler', 'Brawler', 'Signature moves hit 25% harder.', 'The eighth punch of the flurry is the loudest.', { heroes: ['red-hood'], effect: [['sigPower', 'mul', 1.25]] }),
  n('kit', 'rh.quickDraw', 'Quick Draw', 'Signature moves come back 20% sooner.', 'Elbow, step, elbow again.', { heroes: ['red-hood'], requires: ['rh.brawler'], act: 2, effect: [['sigCooldownMult', 'mul', 0.8]] }),
  n('kit', 'rh.helmet', 'Bulletproof Helmet', 'Rifle and sniper shots hurt 30% less.', 'Ping. He keeps walking.', { heroes: ['red-hood'], requires: ['rh.brawler'], act: 3, effect: [['sniperMult', 'mul', 0.7]] }),
  n('kit', 'sm.restraint', 'Restraint', 'Hold back: your blows never kill, and a meter rewards control with more health.', 'A punch that stops a centimetre short.', { heroes: ['superman'], effect: [['restraint', 'add', 1], ['maxHealthBonus', 'add', 25]] }),
  n('kit', 'sm.heatVision', 'Heat Vision', 'Signature moves gain a heat-vision finisher.', 'Two red lines, and the rifle is slag.', { heroes: ['superman'], requires: ['sm.restraint'], act: 2, effect: [['heatVision', 'set', true]] }),
  n('kit', 'sm.freezeBreath', 'Freeze Breath', 'Signature moves gain a freeze-breath stun.', 'A white plume; three goons in ice.', { heroes: ['superman'], requires: ['sm.restraint'], act: 3, effect: [['freezeBreath', 'set', true]] }),
];

export const NODE_IDS = NODES.map((x) => x.id);
const BY_ID = new Map(NODES.map((x) => [x.id, x]));
export const nodeById = (id) => BY_ID.get(id) ?? null;
export const nodesOf = (branch) => NODES.filter((x) => x.branch === branch);
// The hero family a node belongs to (kit nodes) or null (shared trunk).
export const forHero = (node, heroId) => !node.heroes || node.heroes.includes(heroId);

const OPS = {
  set: (a, v) => v,
  add: (a, v) => a + v,
  mul: (a, v) => a * v,
  max: (a, v) => Math.max(a, v),
};
export const OP_IDS = Object.keys(OPS);

// Apply one list of [key, op, value] ops (skill nodes, suit perks) to an effects object.
export function applyOps(out, ops) {
  for (const [k, op, v] of ops) {
    const f = OPS[op];
    if (f && k in out) out[k] = f(out[k], v);
  }
  return out;
}

// Rebuild `out` from the base and the owned nodes, in tree order. `hero` limits kit nodes to the
// hero that is playing (null applies none). `extra` is more ops after the tree (suit perks).
export function treeEffects(owned, base, out = {}, { hero = null, extra = null } = {}) {
  Object.assign(out, base);
  const has = owned instanceof Set ? owned : new Set(owned);
  for (const node of NODES) {
    if (!has.has(node.id)) continue;
    if (node.heroes && !node.heroes.includes(hero)) continue;
    applyOps(out, node.effect);
  }
  if (extra) applyOps(out, extra);
  return out;
}

// Why a node can or can't be bought. ctx: { owned (array|Set), xpFree, standing, act, hero }.
export function nodeCheck(id, { owned, xpFree = 0, standing = 0, act = 1, hero = null }) {
  const node = BY_ID.get(id);
  if (!node) return { ok: false, reason: 'unknown' };
  const has = owned instanceof Set ? owned : new Set(owned);
  if (has.has(id)) return { ok: false, reason: 'owned' };
  if (node.heroes && hero && !node.heroes.includes(hero)) return { ok: false, reason: 'hero' };
  if (node.requires.some((r) => !has.has(r))) return { ok: false, reason: 'locked' };
  if (node.act > act) return { ok: false, reason: 'act' };
  const have = node.currency === 'standing' ? standing : xpFree;
  if (have < node.cost) return { ok: false, reason: node.currency === 'standing' ? 'standing' : 'points' };
  return { ok: true, reason: null };
}

// What the page shows: owned | buyable | poor | locked | act | hero.
export function nodeStatus(id, ctx) {
  const r = nodeCheck(id, ctx);
  if (r.ok) return 'buyable';
  if (r.reason === 'standing') return 'poor';
  return r.reason === 'points' ? 'poor' : r.reason === 'unknown' ? 'locked' : r.reason;
}

// XP points spent on a set of owned nodes (Standing is not counted: it is Bruce's).
export function xpSpent(owned) {
  let s = 0;
  for (const id of owned) { const node = BY_ID.get(id); if (node && node.currency === 'xp') s += node.cost; }
  return s;
}

// Keep only nodes whose prerequisites are also kept (repeat until stable), in tree order.
export function closeOwned(ids) {
  const want = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of want) {
      const node = BY_ID.get(id);
      if (!node || node.requires.some((r) => !want.has(r))) { want.delete(id); changed = true; }
    }
  }
  return NODES.filter((x) => want.has(x.id)).map((x) => x.id);
}

// Grid layout for the page: column = depth in its branch (longest prerequisite chain), row =
// order within that depth. Pure, so tests can check every node has a unique cell.
export function layout() {
  const depth = new Map();
  const d = (id) => {
    if (depth.has(id)) return depth.get(id);
    const node = BY_ID.get(id);
    const v = node.requires.length ? 1 + Math.max(...node.requires.map(d)) : 0;
    depth.set(id, v);
    return v;
  };
  const out = [];
  for (const b of BRANCHES) {
    const rows = new Map();
    for (const node of NODES.filter((x) => x.branch === b.id)) {
      const c = d(node.id);
      // Kit branches: each hero family gets its own band of rows.
      const key = node.heroes ? `${node.heroes[0]}:${c}` : String(c);
      const r = rows.get(key) ?? 0;
      rows.set(key, r + 1);
      out.push({ id: node.id, branch: b.id, col: c, row: r, band: node.heroes ? node.heroes[0] : null });
    }
  }
  return out;
}
