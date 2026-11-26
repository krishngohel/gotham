// [wanted] Words: officer barks, dispatch chatter and the first-time teaching cards. Original
// writing in the game's comic voice; clean; names stay in data. {dir} is a compass direction,
// {street} a district phrase ("in the Loop"), {n} a count. Pure data + a tiny formatter.

export const BARKS = Object.freeze({
  question: [
    'Evening. Mind if we ask you a few questions?',
    'Hold up there, pal. Is that a cape?',
    'Sir? Sir. The pointy ears. Stay right there.',
    'We just want to talk. Slowly. With the hands where I can see them.',
  ],
  shrug: [
    'Huh. He just walked off. Do we write that up?',
    'Let him go. Paperwork is longer than he is tall.',
  ],
  chase: [
    'Stop! GCPD!',
    'Freeze! Yeah, you, the bat!',
    'He\'s getting away! Again!',
    'Don\'t make me run up stairs! I will!',
    'Halt! In the name of... the department!',
  ],
  box: [
    'Box him in! Box him in!',
    'Cut him off at the corner!',
    'Pin that car!',
  ],
  restrained: [
    'Hey! These are MY zip-ties!',
    'This is going in my report. In detail.',
    'Very funny. Very, very funny.',
  ],
  stunned: [
    'My eyes! Is that... smoke? It smells expensive.',
    'Ow. Okay. Non-lethal. Still ow.',
    'I\'m fine! I meant to sit down!',
  ],
  search: [
    'Fan out. He can\'t have gone far.',
    'Check the alleys. Check the roofs. Check the bins.',
    'Anybody got eyes on him?',
    'I swear he was right here.',
  ],
  swat: [
    'Tactical team moving in!',
    'Net ready. On my mark.',
    'Shields up. Nobody tries to punch him. We\'ve all seen the tapes.',
  ],
  lost: [
    'Lost him.',
    'And... he\'s gone. Of course he\'s gone.',
    'Every time. Every single time.',
  ],
  traffic: [
    'License and registration, Mr. Wayne.',
    'Bit fast for a Tuesday, sir.',
    'Nice car. Shame about the driving.',
  ],
});

// Dispatch: the radio voice (audio.dispatch with a text).
export const DISPATCH = Object.freeze({
  noticed: ['Units in the area, a costumed individual reported {street}. Approach and question.'],
  pursuit: ['All units, suspect fleeing {street}, heading {dir}. Pursue with caution.', 'Suspect in a dark cape heading {dir} {street}. Pursuit authorised.'],
  coordinated: ['Units, set up a roadblock ahead of the suspect, {dir}bound {street}. Spikes are approved.', 'Rooftop spotters to the {dir} side. He likes the roofs.'],
  tactical: ['Tactical units rolling. Air One, light him up {street}.', 'Air One to ground: I have eyes, suspect moving {dir}.'],
  manhunt: ['Citywide alert. Raise the bridges. Cover every El station. Nobody sleeps.', 'All precincts, all units: the bat is the priority. Checkpoints on every crossing.'],
  heading: ['Suspect heading {dir} {street}.', 'He just turned {dir}. Stay on him.', 'Air One: target {dir}bound, keep up down there.'],
  search: ['Visual lost. Units, search the last known position {street}.', 'All units, sweep the area. Alleys and rooftops.'],
  lost: ['Air One breaking off. Units, resume patrol.', 'Search called off. Back to it, people.'],
  callOff: ['This is Gordon. Stand down. That one is... on loan to us.', 'Gordon here. Let him go. I\'ll take it from here.'],
  caught: ['Suspect detained. Somebody get the Commissioner. He is going to love this.'],
  breakout: ['He\'s out of the holding cell! How is he always out of the holding cell?'],
  menace: ['By order of the Mayor\'s office, the vigilante is to be detained on sight.'],
  bruceStop: ['Unit pulling over a speeding sports car. Plates say... oh no. Wayne.'],
});

// First time each level is reached: a short card (through the HUD director when one exists).
export const TEACH = Object.freeze({
  1: { title: 'NOTICED', text: 'An officer wants a word. Walk away calmly and it ends. Run, and it\'s a pursuit.' },
  2: { title: 'PURSUIT', text: 'Break line of sight: rooftops, alleys, interiors. Stay unseen and the search runs out.' },
  3: { title: 'ROADBLOCKS', text: 'Roadblocks and spikes ahead on your route. Leave the street or take another way.' },
  4: { title: 'AIR ONE', text: 'The helicopter\'s light finds you anywhere open. Get under cover, indoors, or into the fog.' },
  5: { title: 'MANHUNT', text: 'Bridges up, stations watched. Only going to ground ends this: a sewer, an interior, the cave.' },
  caught: { title: 'SURROUNDED', text: 'Mash Punch to struggle free, or smoke out. Batman never hurts the police.' },
  restrain: { title: 'THE RULE', text: 'Batman does not hurt police. Strikes on officers become restraints and stuns, and they raise the alarm.' },
});

export const LEVEL_LABEL = Object.freeze(['', 'NOTICED', 'PURSUIT', 'ROADBLOCKS', 'AIR ONE', 'MANHUNT']);

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
// x east, z south: north is -z.
export function compass(dx, dz) {
  const a = Math.atan2(dx, -dz); // 0 = north, clockwise
  const i = Math.round(((a / (Math.PI * 2)) * 8 + 8)) % 8;
  return DIRS[i];
}

export function fill(text, vars = {}) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '').toString()).replace(/\s+/g, ' ').trim();
}

export function pick(list, n) { return list[((n % list.length) + list.length) % list.length]; }
