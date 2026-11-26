// Written content that is not part of a story step: the hidden trophies' messages and the
// closing text. Edit this file to change the tone of the game without touching the engine.
export default {
  // Shown one per Riddler trophy, in the order they are found (not tied to where each trophy is).
  trophyMessages: [
    'Riddle me this: what do you call a trophy hidden in plain sight? Found. One of twelve, and eleven more are scattered across Gotham.',
    'Two. You are quicker than the GCPD, and they have been hunting these for a week.',
    "Three. The rain never stops in this city, so don't wait for it to clear. Keep climbing.",
    'Four, a third of the way. Whoever is whispering in your ear is not nearly as clever as I am.',
    "Five. Fun fact: the Joker has no idea these are out here. Let's keep it that way.",
    'Halfway. Six down, and the night is still young. Go glide somewhere.',
    'Seven. If you took the Batmobile to get here, no judgment. Walking is for people without one.',
    'Eight. Every one of these is a question, and you keep answering. Annoying. Admirable. Mostly annoying.',
    'Nine. You are better at this than the police, and they have a forensics lab.',
    "Ten! Only two left, and they are hoping you give up. Don't.",
    'Eleven. One more. You know the drill by now: look up, look down, check the alleys.',
    "That's all twelve! The Golden Knight suit is yours, so go pick it on the title screen. Riddle me this: who is the cleverest person in Gotham? Don't answer that.",
  ],

  // Rolls with the credits.
  finalMessage: 'The clock tower is still, the Joker is in custody, and every hostage is home. Gotham gets one quiet night. Tomorrow, the city will need you again.',

  // Shown on the closing comic page, "From Commissioner Gordon", once the Progress page reaches 100%.
  completionMessage: "Every trophy, every medal, every street crime in Gotham. You did all of it. Gordon would never say it over the radio, so he wrote it down instead: thank you.",

  // [story2] The whole campaign's ending (src/story/endgame.js): the roll after Night Nine.
  campaignTitle: 'The Long Night Is Over',
  creditsSeconds: 46,
  // One line per ending (src/story/lifeSteps.js endingFor): who is still standing with Bruce.
  endingMessages: {
    family: 'Nine nights. Every rogue in a cell, and every chair at the Manor table taken. Somebody even made him eat.',
    partners: 'Nine nights. The city is safe, the signal is on for no reason at all, and the man on the roof is not alone up there.',
    exposed: 'Nine nights. One detective worked it out, and decided Gotham needed him more than she needed the truth. For now.',
    alone: 'Nine nights. The city is safe. The house is quiet. The signal is on, and he goes, because he always will.',
  },
  // The free-roam objective after the ending (the city state follows it).
  endingFreeRoam: {
    family: 'Gotham is quiet and the Manor is full. Free roam: replay any night from the Batcomputer.',
    partners: 'The signal is lit for no reason. Gordon is waiting on the roof. Free roam: replay any night from the Batcomputer.',
    exposed: 'Detective Ostrow left her card on the Batcomputer. Free roam: replay any night from the Batcomputer.',
    alone: 'The cave is very quiet. The city still needs you. Free roam: replay any night from the Batcomputer.',
  },
  hundredHook: 'Every optional objective, every night. On the Batcomputer, a new file has appeared. It is a crossword. Seven across is "BAT".',
  ngPlusText: 'New Game Plus is ready: start again from the title screen with everything you have earned.',
  afterCredits: 'In a cell on Arkham Island, somebody is laughing. In a cell on Blackgate, somebody is writing a very long letter to his lawyers.',
  campaignCredits: [
    { title: 'The campaign', lines: ['Nine nights in five acts: the Long Night, the Gilded City, the Underside, the Cold Front and Arkham.'] },
    { title: 'The rogues', lines: ['The Joker and Harley, the Penguin, the Riddler, the Scarecrow, Mr. Freeze, Poison Ivy, Firefly, Black Mask.', 'Each one a different test: gadgets, detective work, stealth, the environment, holding back, the Batmobile, mastery, and a partner.'] },
    { title: 'The double life', lines: ['Bruce Wayne kept or missed galas, a board vote, a clinic, a ribbon, a birthday and a date. The city noticed which.'] },
    { title: 'With thanks', lines: ['Alfred, for the soup. Gordon, for the roof. Oracle, for the voice in the ear. Dick, for showing up.'] },
  ],
};
