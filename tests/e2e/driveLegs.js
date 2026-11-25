// [move] The cross-city drive, as legs on the real roads (shared by tests/e2e/movement.spec.js and
// scripts/drive-probe.mjs). Each leg places the Batmobile at its start on the road and the in-game
// pilot drives it along `pts` (or a street-graph route to `to`) with the real physics. Legs start
// on the road rather than chaining junction to junction: the graph's straight lines cut across
// kerbs, railings and centre bollards at a few junctions, which a human steers round and the
// simple pilot does not; the roads themselves (ramps, both decks, causeways, hills) are what the
// legs prove the car follows.
export const DRIVE_LEGS = [
  { id: 'core-to-river', start: { x: -30, y: 0, z: -150, yaw: Math.PI }, to: { x: -30, y: 0, z: -282 }, y: 0 },
  { id: 'upper-deck', start: { x: -10, y: 0, z: -294, yaw: Math.PI / 2 }, pts: [{ x: 120, y: 0, z: -294 }, { x: 330, y: 0, z: -294 }], y: 0 },
  { id: 'ramp-to-lower-deck', start: { x: 356, y: 0, z: -284.5, yaw: -Math.PI / 2 }, pts: [{ x: 320, y: -2.6, z: -284.5 }, { x: 290, y: -5.5, z: -284.5 }, { x: 270, y: -5.5, z: -290 }, { x: 100, y: -5.5, z: -293 }, { x: -120, y: -5.5, z: -293 }], y: -5.5 },
  { id: 'lakeshore-drive', start: { x: 345, y: 0, z: -560, yaw: 0 }, to: { x: 345, y: 0, z: -100 }, y: 0 },
  { id: 'arkham-causeway', start: { x: 350, y: 0, z: -80, yaw: Math.PI / 2 }, pts: [{ x: 372, y: 0.5, z: -80 }, { x: 560, y: 0.5, z: -80 }, { x: 586, y: 4, z: -80 }], y: 4 },
  { id: 'core-to-blackgate', start: { x: 86, y: 0, z: 110, yaw: 0 }, pts: [{ x: 86, y: 0, z: 200 }, { x: 84, y: 0.3, z: 214 }, { x: 84, y: 0.3, z: 300 }, { x: 84, y: 2.2, z: 330 }, { x: 92, y: 2.2, z: 343 }, { x: 115, y: 2.2, z: 343 }], y: 2.2 },
];

// In the page: place the car at the leg's start and start the pilot. Returns false with no route.
export function startLeg(leg) {
  const v = window.__game.vehicles, car = v.active;
  const gy = window.__game.world.collision.groundBelow(leg.start.x, leg.start.y + 2, leg.start.z, 0.3);
  car.group.position.set(leg.start.x, gy > -Infinity ? gy : leg.start.y, leg.start.z);
  car.v.yaw = leg.start.yaw; car.v.speed = 0; car.v.drift = 0; car.v.lat = 0;
  const pts = leg.pts ?? v.routePoints(car.group.position, leg.to);
  if (!pts) return false;
  window.__leg = v.startPilot(pts, { speed: 24, timeout: 120 });
  return true;
}
