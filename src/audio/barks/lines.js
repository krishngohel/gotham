// Bark and chatter tables. Data only: the dialogue system (src/audio/dialogue.js) picks from
// these, never repeating a recent line, and plays them with a synthesised voice blip.
//
// Lines 1-61 are the original comedy lines from docs/design/research/city-and-content.md
// section 8.2 (written for this project, general audience). The short combat/civilian/police
// lines at the end of each table are new and in the same spirit. Rules from that section: goons
// may be funny, Batman is deadpan and never quips for its own sake, nothing jokes over a death,
// a hostage under threat or a grief beat. Callers enforce the "after tension resolves" part by
// choosing which table to bark from.
//
// Speaker ids are data too (`SPEAKERS` below holds display names), so the project could rename
// every character in one file. A line is either a string (spoken by the table's speaker) or a
// conversation: an array of [speakerId, text] pairs played back to back.

export const SPEAKERS = {
  goon: 'Goon',
  goonA: 'Goon',
  goonB: 'Goon',
  henchman: 'Henchman',
  civilian: 'Civilian',
  batman: 'Batman',
  alfred: 'Alfred',
  riddler: 'Riddler',
  nightwing: 'Nightwing',
  robin: 'Robin',
  superman: 'Superman',
  penguin: 'Penguin',
  dispatch: 'Dispatch',
  officer: 'Officer',
  radioHost: 'Gotham Late Night FM',
};

export const BARK_TABLES = {
  // Patrolling goons who have not seen anyone yet (8.2, lines 1-16).
  'goon.idle': {
    speaker: 'goon',
    lines: [
      'Anybody else hear wings? No? Just me? Great.',
      "I took this job for the dental plan. There's no dental plan.",
      "If he shows up, I'm on break. Write that down.",
      'Kevin, stop checking the ceiling. ...Actually, keep checking the ceiling.',
      "Boss says the Bat's a myth. Boss says a lot of things from very far away.",
      'My mom thinks I work in logistics. Technically, I move stuff.',
      "Why's it always a rooftop? Why can't we ever do crime in a nice lobby?",
      "Rule one: don't stand under gargoyles. Rule two: this city is all gargoyles.",
      'New guy, quick tip: when the lights go out, you already lost.',
      [['goonA', 'Do we get hazard pay?'], ['goonB', "We get the hazard. That's the pay."]],
      "I asked for nights because I thought it'd be quiet.",
      'Count off! One. Two. ...Three? Three, buddy?',
      [['goonA', "He can't be everywhere."], ['goonB', "Then how come he's always here?"]],
      "I'm not scared. I'm just standing very defensively.",
      'Who parked the van under the El? He basically lives on the El.',
      [['goonA', 'I swear that statue moved.'], ['goonB', "It's a pigeon."], ['goonA', "Pigeons don't have capes."]],
    ],
  },
  // Two goons talking where the player can overhear them (8.2, lines 17-22).
  'goon.overheard': {
    speaker: 'goonA',
    lines: [
      [['goonA', 'You took the El to a heist?'], ['goonB', "Getaway car's in the shop."], ['goonA', 'The getaway car got away?'], ['goonB', 'It got towed. Different thing.']],
      [['goonA', 'Mr. Cobblepot says feed the fish.'], ['goonB', 'With what?'], ['goonA', "He didn't say with what. He said it while looking at you."]],
      [['goonA', 'Why do we wear question marks?'], ['goonB', 'Branding.'], ['goonA', "Doesn't that make us easy to spot?"], ['goonB', "...That's a good question."], ['goonA', "Don't say that word around here."]],
      [['goonA', 'Did you see the Bat last night?'], ['goonB', 'Nobody sees the Bat.'], ['goonA', 'Then how do you know it was him?'], ['goonB', 'Because nobody saw him.']],
      [['goonA', "Commissioner says we don't work with vigilantes."], ['goonB', 'So who switched on the big light?'], ['goonA', 'Electrical fault.'], ['goonB', 'Bat-shaped?'], ['goonA', 'Very specific fault.']],
      [['goonA', 'What are you afraid of?'], ['goonB', 'Honestly? My performance review.']],
    ],
  },
  // New: a goon has spotted the hero.
  'goon.spotted': {
    speaker: 'goon',
    lines: [
      "It's him! It's actually him!",
      'Over there! Everybody, over there!',
      "Lights! Somebody get the lights! No, the other way, turn them ON!",
      'Contact! Big contact! Cape-shaped contact!',
      "He's here. I knew I heard wings.",
    ],
  },
  // New: mid-fight chatter.
  'goon.combat': {
    speaker: 'goon',
    lines: [
      'Surround him! ...Somebody else surround him first.',
      "Go high! I'll go... somewhere else.",
      'All at once! On three! One...',
      "He's just one guy! One very large guy!",
      "Take him down! Gently! I'm not paying for a hospital.",
    ],
  },
  // New: when a goon is the last one standing, or fear is high (the fear system can pick this).
  'goon.afraid': {
    speaker: 'goon',
    lines: [
      "Okay. Okay. I'm putting it down. It's down.",
      "I quit. Effective immediately. Effective five minutes ago.",
      "Nobody's answering the radio. Why is nobody answering the radio?",
      "I'm just here for the van. I don't even like the van.",
    ],
  },
  // Squad AI (workstream I): intent barks before acting, the cheapest "smart" there is.
  'goon.squad.flank': {
    speaker: 'goon',
    lines: ['Get behind him!', 'I got his back! I mean... his back!', 'Go round! Go round!', 'Flank him! That means the side!'],
  },
  'goon.squad.medic': {
    speaker: 'goon',
    lines: ['Hang on, buddy, I got you!', 'Medic coming through!', 'Stay with me! Stay with me!', 'Walk it off. Walk it off!'],
  },
  'goon.squad.backup': {
    speaker: 'goon',
    lines: ['Backup! Now!', 'Everybody get up here!', 'Call the others! All of them!', 'We need more guys!'],
  },
  'goon.squad.flee': {
    speaker: 'goon',
    lines: ["I'm out! I'm out!", 'Nope. Nope. Nope.', 'Tell the boss I quit!', 'Every man for himself!'],
  },
  'goon.squad.pickup': {
    speaker: 'goon',
    lines: ["Ooh, that's mine now.", 'Finders keepers!', 'Grab it! Grab it!'],
  },
  'goon.squad.lieutenantDown': {
    speaker: 'goon',
    lines: ["He took out the boss!", "Who's in charge now?", "That was our guy! That was our guy!"],
  },
  // New: a goon going down. Short, never cruel.
  'goon.down': {
    speaker: 'goon',
    lines: ['Oof.', 'Not the face.', "I'm good. I'm good down here.", 'Tell my mom it was logistics.'],
  },
  // New: civilians reacting to the hero (the street-life workstream picks when).
  'civilian.saved': {
    speaker: 'civilian',
    lines: ['Thank you! Whoever you are!', "Wait till I tell my sister. She won't believe me either.", 'Is it safe? It feels safe. Is it?', 'You dropped your... never mind, he is gone.'],
  },
  'civilian.scared': {
    speaker: 'civilian',
    lines: ['Run! No, the other way!', 'Somebody call somebody!', "I'm just here for a hot dog!", 'Not again. Not on my street.'],
  },
  // Alfred (8.2, lines 23-34): dry, warm, never at a bad moment.
  alfred: {
    speaker: 'alfred',
    lines: [
      "The signal is up, sir. I'll tell the gala you've been taken ill. Again. Gotham's most fragile billionaire.",
      "I've laid out the tuxedo, the Kevlar and an ice pack. Do wear them in that order.",
      "Shall I add 'fell off a cathedral' to the list of reasons you were late, or keep it vague?",
      'Your board meeting is in four hours. I recommend sleep, coffee, or a very convincing cough.',
      "That's the third time I've stitched that eyebrow this month. It's practically a hobby.",
      "Master Dick asked if you've learned to say thank you yet. I said we're working on it.",
      "Lucius sent a new grapple. The manual is one page long and says 'please be careful' four times.",
      "If you're going to brood, sir, kindly brood away from the souffle.",
      'The car is fuelled, the cave is lit, and the bats remain unimpressed.',
      'Your guest asked where you vanished to. I said the wine cellar. She found that entirely believable, which says something about your reputation.',
      'A man who can solve a murder from a shoelace, and yet the cufflinks elude you.',
      "Sleep isn't a weakness, sir. It's simply something you've never tried.",
    ],
  },
  // Riddler taunts (8.2, lines 35-43).
  'riddler.taunt': {
    speaker: 'riddler',
    lines: [
      'What has a thousand eyes and sees nothing? The GCPD. Keep up.',
      'I hid the clue in plain sight. I know, I know: plain sight is your blind spot.',
      "Tick, tock. That's not a riddle, that's a bomb. See? I'm helping.",
      "Wrong! Oh, I've been rehearsing that all week.",
      "You solved it? Lucky guess. Statistically, absurdly lucky. I'm checking the maths.",
      "I'm the only man in Gotham who reads without moving his lips. You're welcome, Gotham.",
      'I left you a prize on top of the Exchange. Climb carefully. Falling would be such an obvious ending.',
      "Riddle: I climb all night, I never sleep, and I still can't solve a crossword. Who am I? Hint: pointy ears.",
      "Every route you take, I've drawn. Every rooftop, numbered. You're not a mystery, you're a commute.",
    ],
  },
  // Deadpan Batman (8.2, lines 44-52). Conversations carry the other speaker.
  'batman.deadpan': {
    speaker: 'batman',
    lines: [
      [['goon', "You'll never take me alive!"], ['batman', "That's not the plan."]],
      "You're not getting a lawyer yet. You're getting a cast first.",
      [['nightwing', 'Perfect landing.'], ['batman', 'Perfectly loud.']],
      [['alfred', "You're bleeding on the carpet."], ['batman', "It's an old carpet."]],
      'Robin. Stop narrating.',
      [['superman', 'Was that small talk?'], ['batman', "It didn't count."]],
      [['penguin', 'The umbrella is a weapon!'], ['batman', 'So is the hat, apparently.']],
      'Comfortable?',
      "Riddler. The answer is 'prison.'",
    ],
  },
  // Police radio and dispatch (8.2, lines 53-59). Played with the radio treatment.
  dispatch: {
    speaker: 'dispatch',
    radio: true,
    lines: [
      'All units, a man in a cape on the El roof. ...Disregard. Dispatch says we all know who that is.',
      'Car twelve, a gargoyle fell off the cathedral. Second caller says it walked away.',
      'Be advised, the river bridge is lifting. Again. No, nobody knows where the boats are going at three a.m.',
      'Units near Robinson Park: the plants are behaving aggressively. Please do not argue with the plants.',
      'Traffic: Lower Gotham closed due to a large reptile. Use the upper deck. Or another city.',
      [['officer', "Dispatch, I've got a guy zip-tied to a lamppost with a note that says 'for the GCPD.'"], ['dispatch', 'Is the note polite?'], ['officer', "It's very polite."]],
      'Reminder: the bat-shaped lamp on the roof is city property. Stop drying socks on it.',
    ],
  },
  // Late-night radio in cars and shops (8.2, lines 60-61).
  'radio.fm': {
    speaker: 'radioHost',
    radio: true,
    lines: [
      "Gotham Late Night FM. Tonight's forecast: overcast, with a ninety percent chance of being punched if you're up to no good.",
      'Weather: tonight, overcast. Tomorrow, overcast. Long-range outlook: Gotham.',
    ],
  },
};

// Crime alerts for the dispatch radio. `{district}` and `{kind}` are filled in by
// dispatchLine() (dialogue.js); unknown kinds use the generic template.
export const CRIME_ALERTS = {
  generic: ['All units, reports of a {kind} in {district}.', 'Units in {district}, we have a {kind} in progress.', 'Any car near {district}: {kind}, respond code two.'],
  robbery: ['All units, robbery in progress, {district}. Suspects armed.', 'Silent alarm tripped in {district}. Units respond.'],
  mugging: ['Caller reports a mugging in {district}. Any unit nearby.'],
  carjack: ['Carjacking reported in {district}. Vehicle heading for the bridges.'],
  hostage: ['All units, hostage situation, {district}. Do not engage. Repeat, do not engage.'],
  brawl: ['Large disturbance in {district}. Bring the big van.'],
  arson: ['Fire department en route to {district}. Possible arson, units secure the scene.'],
  vandalism: ['Vandalism in {district}. Again. Somebody bring a mop.'],
  van: ['Van break-in reported in {district}. Units respond.', 'Somebody is emptying a van in {district}. It is not their van.'],
};
