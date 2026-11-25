// Remote call (workstream L3, `[move]`): the Batmobile drives itself to the player along a street
// graph route (src/world/streetGraph.js routeBetween). Pure: a point that runs along a polyline
// with a speed profile (pull away, cruise, slow for corners, brake to a stop at the end); the
// runtime snaps the car to the ground under it. Never collides: it follows the road's centre, so
// it cannot get stuck on the way.
import { polylineLength, pointAlong } from '../world/streetGraph.js';

export const AUTOPILOT = { cruise: 26, accel: 12, brake: 16, cornerSpeed: 11, look: 14 };

export function createAutopilot(points, k = AUTOPILOT) {
  return { pts: points, len: polylineLength(points), s: 0, speed: 0, k, done: points.length < 2, at: { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0, z: points[0]?.z ?? 0, yaw: 0 }, ahead: { x: 0, y: 0, z: 0, yaw: 0 } };
}

export function stepAutopilot(ap, dt) {
  if (ap.done) return ap;
  const k = ap.k, left = ap.len - ap.s;
  // Corner ahead: the heading change between here and `look` metres on.
  pointAlong(ap.pts, ap.s, ap.at);
  pointAlong(ap.pts, Math.min(ap.len, ap.s + k.look), ap.ahead);
  const turn = Math.abs(Math.atan2(Math.sin(ap.ahead.yaw - ap.at.yaw), Math.cos(ap.ahead.yaw - ap.at.yaw)));
  let want = turn > 0.4 ? k.cornerSpeed + (k.cruise - k.cornerSpeed) * Math.max(0, 1 - turn / 1.5) : k.cruise;
  want = Math.min(want, Math.sqrt(2 * k.brake * Math.max(0, left - 0.5))); // stop at the end
  ap.speed += Math.max(-k.brake * dt, Math.min(k.accel * dt, want - ap.speed));
  ap.s = Math.min(ap.len, ap.s + Math.max(0.5, ap.speed) * dt);
  pointAlong(ap.pts, ap.s, ap.at);
  if (ap.s >= ap.len - 0.05) { ap.done = true; ap.speed = 0; }
  return ap;
}
