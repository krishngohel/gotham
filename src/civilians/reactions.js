// How a pedestrian reacts to what happens near them (workstream M). Pure and unit-tested.
//
// Stimuli: { kind, dist, rep } where kind is
//   'heroPass'  a hero walking through them (< 2.5 m)        -> step aside
//   'heroSeen'  a hero standing or landing nearby (< 14 m)   -> stare, point, cheer, boo, photo
//   'fight'     a brawl nearby (< 28 m)                       -> flee or cower, maybe call the police
//   'gunfire'   shots (< 45 m)                                -> cower or flee, call the police
//   'gadget'    a stray gadget lands close (< 4 m)            -> flinch (never hurt)
//   'rescue'    a crime stopped nearby (< 30 m)               -> thank or cheer
//   'siren'     a police car passing                          -> look
// rep: the city's view of the heroes, 0..100 (combat.reputation.value; 50 is neutral).
// brave: the archetype's nerve 0..1 (archetypes.js). r: a random number in [0, 1).
//
// Civilians are never targets: player attacks ignore them (they are not in combat's lists), and a
// stray gadget only makes them flinch. Nothing here hurts or kills anyone.

export const REACTIONS = ['ignore', 'stepAside', 'stare', 'point', 'cheer', 'boo', 'photo', 'flee', 'cower', 'flinch', 'thank', 'callPolice', 'look'];

// Priority: a pedestrian already reacting only switches to something more urgent.
export const URGENCY = { ignore: 0, look: 1, stare: 2, stepAside: 3, photo: 3, point: 3, cheer: 3, boo: 3, thank: 3, flinch: 4, callPolice: 5, flee: 6, cower: 6 };

export function decideReaction({ kind, dist = 0, rep = 50, brave = 0.5, police = false }, r = 0.5) {
  const love = Math.max(-1, Math.min(1, (rep - 50) / 50)); // -1 feared/hated .. 1 loved
  switch (kind) {
    case 'heroPass': return dist < 2.5 ? 'stepAside' : 'ignore';
    case 'heroSeen': {
      if (dist > 14) return 'ignore';
      if (police) return r < 0.5 ? 'stare' : 'ignore';
      // Loved: cheer, photos, pointing; hated: boos and wary stares.
      if (love > 0.25) return r < 0.3 ? 'cheer' : r < 0.55 ? 'photo' : r < 0.8 ? 'point' : 'stare';
      if (love < -0.25) return r < 0.35 ? 'boo' : r < 0.7 ? 'stare' : 'stepAside';
      return r < 0.25 ? 'point' : r < 0.45 ? 'photo' : r < 0.8 ? 'stare' : 'ignore';
    }
    case 'fight': {
      if (dist > 28) return 'ignore';
      if (police) return 'callPolice'; // an officer radios it in (and responds)
      if (dist < 8) return r < 0.6 - 0.3 * brave ? 'cower' : 'flee';
      return r < 0.12 + 0.1 * brave ? 'callPolice' : r < 0.25 + 0.4 * brave ? 'stare' : 'flee';
    }
    case 'gunfire': {
      if (dist > 45) return 'ignore';
      if (police) return 'callPolice';
      if (dist < 15) return r < 0.55 ? 'cower' : 'flee';
      return r < 0.2 ? 'callPolice' : 'flee';
    }
    case 'gadget': return dist < 4 ? 'flinch' : 'ignore';
    case 'rescue': return dist > 30 ? 'ignore' : love < -0.4 ? 'stare' : r < 0.55 ? 'thank' : 'cheer';
    case 'siren': return r < 0.5 ? 'look' : 'ignore';
    default: return 'ignore';
  }
}

// How long a reaction lasts (seconds) and whether the pedestrian keeps walking during it.
export const REACTION_TIME = {
  ignore: [0, true], look: [1.5, true], stare: [3, false], stepAside: [1.2, true], photo: [3.5, false], point: [2.6, false],
  cheer: [2.9, false], boo: [2.5, false], thank: [3, false], flinch: [0.9, false], callPolice: [6, false], flee: [9, true], cower: [7, false],
};

// The clip for a reaction (anims_civ plus base clips). Pure data.
export const REACTION_CLIP = {
  look: null, stare: 'Civ_Idle_Look', stepAside: null, photo: 'Civ_Texting', point: 'Civ_Point', cheer: 'Civ_Cheer',
  boo: 'Civ_Argue', thank: 'Civ_Wave', flinch: 'Civ_Scared', callPolice: 'Civ_Phone_M', flee: 'Civ_PanicRun', cower: 'Crouch_Idle_Loop',
};

// Thank-you lines after a rescue (shown through the bark system). Original, short, comic voice.
export const THANKS = [
  'Thank you! I owe you one!',
  'You came! You actually came!',
  'My hero. Well, someone\'s hero.',
  'I\'m telling everyone at work about this.',
  'Thanks! I\'ll... go home now. Right now.',
  'Bless you, whoever you are under there.',
];
export const BOOS = ['Go home, freak!', 'We don\'t need you!', 'Menace!'];
export const CHEERS = ['Get \'em!', 'Gotham\'s finest!', 'That was amazing!'];
