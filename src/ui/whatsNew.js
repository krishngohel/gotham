// The "What's inside" page: what the game holds, in short lines. Pure content
// (bindings in, a list of short lines out) so it can be unit tested without a DOM, and so the two
// key call outs (the Batmobile, the Batwing) always show the real, live binding rather than a
// hardcoded key name.
import { bindingLabel } from '../core/bindings.js';

export function whatsNewItems(bindings) {
  const t = bindingLabel(bindings, 'vehicle');
  const y = bindingLabel(bindings, 'batwing');
  return [
    'A story in three acts across Gotham, with a masked courier mystery running right through it.',
    `Summon the Batmobile with ${t}, or just steal a car off the street and drive that instead.`,
    `Call the Batwing with ${y} and take the fight to the sky.`,
    'Nightwing fights at your side for the last act, and Harley Quinn has strong opinions about your visit.',
    'Walk right in this time: the Joker funhouse and the Ace Chemicals halls both have real doors now.',
    'In-engine cinematic camera shots for the biggest moments, letterbox bars and all.',
    'Twelve Riddler trophies hide around the city, and the case file tracks what the Joker took.',
    'Two vehicle challenges: the Gotham Grand Prix and Wing Walk.',
    'Impact frames freeze the biggest hits for a beat, like a comic panel come to life.',
  ];
}

export function whatsNewHeadline() { return 'What is inside The Long Night:'; }
