// Goon chatter for the campaign (workstream J2): data for the bark system (src/game/sound.js listens
// for events.emit('bark', { text, speaker, pos, channel: 'world' })). Each night has overheard
// conversations played by the squad waiting at a fight before it starts, and each gang has idle
// lines for the quiet moments. A night file may carry its own `overheard` (n6-n9 do); these are the
// Act II and III nights' and every gang's. Original lines, general audience: goons may be funny,
// nobody jokes over a hostage or a death.
export const OVERHEARD = {
  n2: [
    [['goonA', 'Mr. Cobblepot says feed the fish.'], ['goonB', 'With what?'], ['goonA', 'He did not say with what. He said it looking at you.']],
    [['goonA', 'Why do we carry umbrellas when it is not raining?'], ['goonB', 'Brand loyalty.'], ['goonA', 'Mine just opened in my face.'], ['goonB', 'That is the brand.']],
    [['goonA', 'I asked for the coat check job.'], ['goonB', 'And?'], ['goonA', 'He said everyone wants the coat check job. So now I am guarding a river.']],
  ],
  n3: [
    [['goonA', 'Why do we wear question marks?'], ['goonB', 'Branding.'], ['goonA', 'Does that not make us easy to spot?'], ['goonB', 'That is a good question.'], ['goonA', 'Do not say that word around here.']],
    [['goonA', 'He made us take a quiz before the job.'], ['goonB', 'What did you get?'], ['goonA', 'Hired. Which I think means I failed.']],
    [['goonA', 'What is black and blue and about to happen to us?'], ['goonB', 'Is that one of his?'], ['goonA', 'No. That is just a prediction.']],
  ],
  n4: [
    [['goonA', 'What are you afraid of?'], ['goonB', 'Honestly? My performance review.'], ['goonA', 'The doctor can work with that.']],
    [['goonA', 'Is the sack itchy?'], ['goonB', 'It is a sack, Gary. Of course it is itchy.']],
    [['goonA', 'I keep seeing bats.'], ['goonB', 'That is the gas.'], ['goonA', 'This one has a utility belt.'], ['goonB', 'That is not the gas.']],
  ],
  n5: [
    [['goonA', 'Boss says heat is the enemy.'], ['goonB', 'What about soup?'], ['goonA', 'He froze my soup.']],
    [['goonA', 'Why are we always robbing the warm places?'], ['goonB', 'Because they have the coolant.'], ['goonA', 'Just once, a sauna. One sauna.']],
    [['goonA', 'I have lost feeling in my left foot.'], ['goonB', 'Which one is your left?'], ['goonA', 'Exactly.']],
  ],
};

// Idle lines by gang (the quiet moment before a predator room wakes up, or between waves).
export const GANG_IDLE = {
  penguin: ['Mind the carpet. He had it imported.', 'If he shows up, I am on my break. Write that down.', 'The fish in the tank are looking at me again.'],
  riddler: ['What has a thousand eyes and sees nothing? Us, tonight.', 'Riddle me this: why did I take this job?', 'If you solve the riddle, do you get a raise? Asking for me.'],
  scarecrow: ['Did the shadows move or was that me?', 'I am not scared. I am just standing very defensively.', 'Breathe through the mask. Breathe through the mask.'],
  freeze: ['My eyelashes are frozen. Is that normal?', 'Somebody check on Phil. Phil has gone very quiet.', 'Cold Crew. Best dental plan in the city. No, wait.'],
  ivy: ['Do not step on the moss.', 'I swear that hedge just sighed.', 'She says the roses are listening. I believe her.'],
  firefly: ['Is that snow or ash?', 'Heat jokes are banned on this crew.', 'Who brought the marshmallows? Put them away. Not funny.'],
  blackMask: ['Mr. Sionis says we are a family.', 'Corporate wants us looking sharp. In masks. At midnight.', 'Has anyone read the Bat file? Page one says run.'],
  joker: ['Why are we back on the pier?', 'I got my old mask back. It still smells like the funhouse.', 'Mr. J says this is the last time. He said that last time.'],
};

export function overheardFor(night) { return night?.overheard ?? OVERHEARD[night?.id] ?? []; }
