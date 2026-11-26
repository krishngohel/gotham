// [polish] Tips for the loading screen: one at a time, changing every few seconds while the city
// builds. Pure data plus a picker, so the order is testable and nothing here needs the DOM.
export const LOADING_TIPS = Object.freeze([
  'Counter the moment a thug flashes: a clean counter keeps your combo alive.',
  'Grapple to a ledge, then keep gliding: dive to gain speed, pull up to climb.',
  'Goons who see a friend go down get nervous. Nervous goons make mistakes.',
  'Open the city map to drop a waypoint: the route paints itself on the road.',
  'The Batmobile comes when called, but a stolen sedan gets you there just as fast.',
  'Detective vision shows who is armed, who is scared and who is about to call for help.',
  'Bruce has a day job. The board notices when he sneaks out of meetings.',
  'Two players? Press Start on a second pad, or host an online game with a room code.',
  'The El runs all night. Ride on top of a train to cross the Loop without touching the street.',
  'Riddler trophies hide in plain sight. Look up, look under, look behind the billboard.',
  'Perch on a gargoyle and wait. Patrols get lazy when nothing happens for a while.',
  'Alfred patches you up between nights. He also keeps score. He is not impressed.',
]);

// The tip to show for a given tick (a stable shuffle from a seed, so a reload shows a new first tip).
export function tipAt(tick, seed = 0) {
  const n = LOADING_TIPS.length;
  const step = 5; // coprime with 12: walks every tip once before repeating
  return LOADING_TIPS[(((seed + tick * step) % n) + n) % n];
}
