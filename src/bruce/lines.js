// Alfred's voice, and the Manor's and the cave's other lines (workstream K). Data only: the runtime
// picks a line by context and plays it through the radio panel (src/ui/radio.js), so subtitles and
// accessibility settings apply. Original writing; dry where the research doc says Alfred is dry,
// never over a grief beat.
//
//   ALFRED_LINES[context] = [text...]   contexts: see ALFRED_CONTEXTS
//   pickLine(context, state, rng) -> text (state-aware: fatigue, standing, injuries, patience)

export const ALFRED_LINES = Object.freeze({
  // Greeting Bruce in the Manor, by how the meters stand.
  morningTired: [
    'Coffee, sir. I have made it strong enough to stand a spoon in. The spoon has asked for leave.',
    'Your board meeting is in three hours. I recommend sleep, coffee, or a very convincing cough.',
    'Sleep is not a weakness, sir. It is simply something you have never tried.',
  ],
  morningInjured: [
    'That is the third time I have stitched that eyebrow this month. It is practically a hobby.',
    'I have laid out the suit, an ice pack and a story. Do use them in that order.',
    'Shall I add "fell off a cathedral" to the list of reasons, or keep it vague?',
  ],
  morningGood: [
    'Good morning, sir. The papers are on the table and, for once, you are not on the front of them.',
    'The car is fuelled, the cave is lit, and the bats remain unimpressed.',
  ],
  standingLow: [
    'That is the third gala this month, sir. They have started saving you a seat by the door.',
    'The board telephoned. I told them you were in a meeting with yourself. They did not laugh.',
  ],
  cityLow: [
    'The commissioner\'s car went past the gates twice this morning. He did not stop. That is a message in itself.',
    'The papers have run out of adjectives for Park Row, sir. They have started using numbers.',
  ],
  // Covering for him (a scene's pressure node): his patience thread pays for it.
  cover: [
    'I shall tell them you have been taken ill. Again. Gotham\'s most fragile billionaire.',
    'Your guest asked where you had gone. I said the wine cellar. She found that entirely believable, which says something.',
  ],
  coverTired: [
    'I will cover, sir. I am running low on illnesses I have not already given you.',
    'This is the last time this month. I mean it this time, which I also said last time.',
  ],
  // His breaking point (patience at zero): a serious beat, no joke.
  breaking: [
    'I have buried one Wayne too young, sir. I find I am not prepared to be told about a second over breakfast.',
    'You keep asking me to lie for you. I keep doing it. One of us ought to stop and ask why.',
  ],
  // In the cave.
  caveGreet: [
    'The car is warm and the coffee is not. One of those was deliberate.',
    'Lucius sent a new part. The manual is one page and says "please be careful" four times.',
    'If you are going to brood, sir, kindly brood away from the medical supplies.',
  ],
  patchUp: [
    'Hold still. This will sting, and I shall enjoy it slightly less than you think.',
    'Ribs again. You could try being hit somewhere new, for variety.',
    'There. Good as new, which is to say, fragile and late.',
  ],
  suitUp: [
    'The cowl is pressed, sir. I do not know why I press it. Habit.',
    'Do come back with all the pieces you left with. Including the ones on the inside.',
  ],
  trainingDone: [
    'Holograms do not bleed, sir. Neither, ideally, should you.',
    'Very good. I have noted it in the book of things I shall never be allowed to mention.',
  ],
  // Small talk around the house.
  kitchen: [
    'Dinner is at eight. It was at eight yesterday, too, and it waited until midnight.',
    'If you are going to raid the larder at four in the morning, sir, at least close the larder.',
  ],
  ward: [
    'Master Dick asked if you have learned to say thank you yet. I said we are working on it.',
    'The young man left his trainers in the hall again. I have filed them under "evidence".',
  ],
});
export const ALFRED_CONTEXTS = Object.keys(ALFRED_LINES);

// Bruce, thinking out loud at the things in the house (the inspect lines).
export const MANOR_THINGS = Object.freeze({
  piano: ['Three notes of the only song my mother played. I never learned the fourth.', 'Middle C still sticks. I asked Alfred not to fix it.'],
  phone: ['No messages. Which means Alfred has already answered them.', 'Lucius, twice. Mara, once. The Gazette, eleven times.'],
  wardrobe: ['Tux, suit, something with a collar Alfred calls "casual". Pick one.'],
  bed: ['Sleep. Alfred keeps saying it like it is a place.'],
  trophies: ['A tin car with one wheel. A theatre ticket. A fencing medal I won by cheating. All of it from before.'],
  clock: ['The clock has been stopped at the same time for years. The guests think it is broken. It is not broken.'],
  portrait: ['They painted my father laughing. He hardly ever sat still for it.', 'My mother in her garden. The painter got the light wrong. She would have said so.'],
  fireplace: ['Real fire. Alfred insists. He says a house should smell like a house.'],
  newspaper: ['The Gazette. Let us see what I did last night.'],
});

export function pickLine(context, state = null, rng = Math.random) {
  let ctx = context;
  if (context === 'morning' && state) {
    if (state.patience <= 0 || state.flags?.alfredBreak) ctx = 'breaking';
    else if (Object.values(state.injuries ?? {}).some((h) => h > 0)) ctx = 'morningInjured';
    else if (state.fatigue >= 60) ctx = 'morningTired';
    else if (state.standing < 35) ctx = 'standingLow';
    else if (state.city < 35) ctx = 'cityLow';
    else ctx = 'morningGood';
  }
  if (context === 'cover' && state && state.patience < 35) ctx = 'coverTired';
  const list = ALFRED_LINES[ctx] ?? ALFRED_LINES.morningGood;
  const r = typeof rng === 'function' ? rng() : rng.next();
  return list[Math.floor(r * list.length) % list.length];
}
