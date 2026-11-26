// The "What's new" page: what the game holds, in short lines grouped by theme. Pure content
// (bindings in, sections of short lines out) so it can be unit tested without a DOM, and so the
// key call outs (the Batmobile, the Batwing, the map) always show the real, live binding rather
// than a hardcoded key name.
// [polish] Rewritten for the Long Night overhaul: the bigger city, co-op, the new nights, the
// double life. The first-night lines stay (the original content is still the opening chapter).
import { bindingLabel } from '../core/bindings.js';

export function whatsNewSections(bindings) {
  const t = bindingLabel(bindings, 'vehicle');
  const y = bindingLabel(bindings, 'batwing');
  const m = bindingLabel(bindings, 'map');
  return [
    { title: 'A much bigger Gotham', items: [
      'Old Gotham is now the harbour quarter of a whole city: the Loop under its elevated train, the river and its lifting bridges, Gotham Mile, the lakefront and its amusement pier, the Narrows, Park Row, Chinatown, the Yards, the Bristol hills, Arkham Island and Blackgate.',
      'Ride the El on the roof of a train, cross the river while the bridges rise, and watch the city turn from dusk to dawn through rain and fog.',
      `Open the city map with ${m}, drop a waypoint and follow the route painted on the road, or fast travel to places you have found.`,
    ] },
    { title: 'Play together', items: [
      'Two players on one screen, or online with a room code: pick from Batman, Batwoman, Nightwing, the Robins and more, each with their own moves.',
    ] },
    { title: 'The story', items: [
      'Night One is still where it starts, with a masked courier mystery running right through it. Eight more nights follow, each with its own villain and boss fight.',
      'Nightwing fights at your side, and Harley Quinn has strong opinions about your visit.',
      'Walk right in: the Joker funhouse, the Ace Chemicals halls and more have real doors now.',
      'In-engine cinematic camera shots for the biggest moments, letterbox bars and all.',
    ] },
    { title: 'Bruce Wayne', items: [
      'Between the nights, be Bruce: Wayne Manor, the Batcave, galas and board meetings. Slip away to answer the signal and the people who count on Bruce notice.',
    ] },
    { title: 'Streets and wheels', items: [
      `Summon the Batmobile with ${t}, switch it into battle mode, or just steal a car off the street and drive that instead.`,
      `Call the Batwing with ${y} and take the fight to the sky.`,
      'Crimes break out across every district, and the GCPD has its own ideas about vigilantes in stolen cars.',
      'Two vehicle challenges: the Gotham Grand Prix and Wing Walk.',
    ] },
    { title: 'And', items: [
      'Twelve Riddler trophies hide around the old city, and the case file tracks what the Joker took.',
      'Impact frames freeze the biggest hits for a beat, like a comic panel come to life.',
      'A skill tree, new suits, a bigger photo mode, and a Potato setting so older laptops can come along.',
    ] },
  ];
}

export function whatsNewItems(bindings) {
  return whatsNewSections(bindings).flatMap((s) => s.items);
}

export function whatsNewHeadline() { return 'What is new in The Long Night:'; }
