// The Loop's rows 2-5 and Gotham Mile in the shared street graph (workstream H), plus their
// ambient traffic loops. Pure (no three.js). Node positions follow loopLayout.js, so they merge
// with the proof row's nodes on the z -359 street (same deck, within 0.5 m).
//
// Boundary edges for the neighbouring districts (the integrator stitches them):
//   west  (x -266): the z -419, -479, -539, -593 streets end at (-266, z)
//   east  (x 236):  the Loop's z -419..-593 and the Mile's z -653, -713, -773 streets end at (236, z)
//   north (z -600, west of x -40): stubs from the z -593 street at x -210, -150, -90 end at (x, -600)
//   north (z -780): the Mile's x -30, 30, 90 streets and the boulevard (x 150) end at (x, -780)
//   west of the Mile (x -40): the z -653, -713, -773 streets end at (-40, z)
import { LOOP, MILE } from './loopLayout.js';

export function addLoopStreets(g) {
  const loop = { width: LOOP.street, lanes: 2, sidewalk: LOOP.sidewalk, region: 'loop' };
  const north = LOOP.zLines[LOOP.zLines.length - 1];
  // North-south streets from the El street (-359) to the north edge street; the canyon (x -150)
  // ends at the Exchange on the z -539 street.
  for (const x of LOOP.xLines) {
    const end = x === LOOP.canyonX ? LOOP.canyonEndZ : north;
    g.addStreet(LOOP.zLines.filter((z) => z >= end).map((z) => ({ x, z })), loop);
  }
  // East-west streets across the whole Loop, an intersection node at every x line.
  const xs = [LOOP.minX, ...LOOP.xLines, LOOP.maxX];
  for (const z of LOOP.zLines.slice(1)) g.addStreet(xs.map((x) => ({ x, z })), loop);
  // Stubs to the north edge west of the Mile, where Bristol's lanes will join.
  for (const x of LOOP.xLines.filter((q) => q < MILE.minX)) g.addStreet([{ x, z: north }, { x, z: LOOP.minZ }], loop);
}

export function addMileStreets(g) {
  const s = { width: MILE.street, lanes: 2, sidewalk: 3, region: 'gothamMile' };
  const zs = MILE.zLines; // -593 (the Loop's north edge street) ... -773
  for (const x of MILE.xLines) g.addStreet([...zs, MILE.minZ].map((z) => ({ x, z })), s);
  g.addStreet([...zs, MILE.minZ].map((z) => ({ x: MILE.boulevardX, z })), { width: MILE.boulevardW, lanes: 4, sidewalk: 4, region: 'gothamMile', kind: 'boulevard' });
  const xs = [MILE.minX, ...MILE.xLines, MILE.boulevardX, MILE.maxX];
  for (const z of zs.slice(1)) g.addStreet(xs.map((x) => ({ x, z })), s);
}

// Ambient traffic (cityLife regionLoops): legs are routed through the graph.
export const LOOP_TRAFFIC = [
  // Up the canyon to the Exchange, east under the El's north leg, back south on x -30.
  { id: 'loopCanyonCircuit', cars: 5, speed: [9, 12], legs: [
    { x: -150, y: 0, z: -419 }, { x: -150, y: 0, z: -539 }, { x: -30, y: 0, z: -539 }, { x: -30, y: 0, z: -419 },
  ] },
  // Round the El rectangle's streets.
  { id: 'loopElCircuit', cars: 4, speed: [8, 11], legs: [
    { x: -90, y: 0, z: -419 }, { x: -90, y: 0, z: -539 }, { x: 90, y: 0, z: -539 }, { x: 90, y: 0, z: -419 },
  ] },
  // Gotham Mile: north up the boulevard, back down x 30.
  { id: 'mileCircuit', cars: 6, speed: [9, 13], legs: [
    { x: 150, y: 0, z: -593 }, { x: 150, y: 0, z: -773 }, { x: 30, y: 0, z: -773 }, { x: 30, y: 0, z: -593 },
  ] },
];
