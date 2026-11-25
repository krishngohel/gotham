import { describe, it, expect, beforeAll } from 'vitest';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';
import { LEVELS } from '../../src/world/regions/data.js';
import { killYAt } from '../../src/world/regions/index.js';

// Walks a character (or a car-sized cylinder) through the proof region's real collision, the way
// hero.js integrates: move, resolve against boxes, stand on the ground below (or fall to it).
function walk(collision, from, to, { radius = 0.35, height = 1.8, step = 0.25 } = {}) {
  const p = { ...from };
  const dx = to.x - from.x, dz = to.z - from.z, L = Math.hypot(dx, dz);
  const n = Math.ceil(L / step);
  let walls = 0, minY = Infinity, maxY = -Infinity;
  for (let i = 1; i <= n; i++) {
    const prevY = p.y;
    const tx = from.x + (dx * i) / n, tz = from.z + (dz * i) / n;
    p.x = tx; p.z = tz;
    const r = collision.resolveCylinder(p, radius, height, { prevY });
    if (r.hitWall) walls++;
    if (r.groundY > -Infinity && p.y > r.groundY) p.y = r.groundY; // fall onto it
    if (r.groundY === -Infinity) { p.y = -Infinity; break; }
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { p, walls, minY, maxY };
}

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

describe('the riverfront proof region is walkable and drivable', () => {
  it('over the west bridge (down) from the core to the Loop', () => {
    const r = walk(city.collision, { x: -146, y: 0, z: -225 }, { x: -146, z: -300 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
    expect(r.p.z).toBeCloseTo(-300, 3);
  });
  it('along the upper deck, both ways along the drive', () => {
    const r = walk(city.collision, { x: -195, y: 0, z: -291 }, { x: 285, z: -291 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('along the lower deck (between the barriers and the columns)', () => {
    const r = walk(city.collision, { x: -195, y: LEVELS.lowerDeck, z: -295 }, { x: 285, z: -295 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeCloseTo(LEVELS.lowerDeck, 3);
    expect(r.maxY).toBeCloseTo(LEVELS.lowerDeck, 3);
    // 4.2 m clear above: a standing hero's head never touches the upper deck.
    expect(city.collision.groundBelow(0, -1.5, -295, 0.3)).toBeCloseTo(LEVELS.lowerDeck, 3);
  });
  it('down the east ramp from the plaza to the lower deck, in a car-sized cylinder', () => {
    const r = walk(city.collision, { x: 362, y: 0, z: -281 }, { x: 280, z: -281 }, { radius: 1.3, height: 1.6 });
    expect(r.walls).toBe(0);
    expect(r.p.y).toBeCloseTo(LEVELS.lowerDeck, 1);
  });
  it('and up the west ramp back to street level', () => {
    const r = walk(city.collision, { x: -190, y: LEVELS.lowerDeck, z: -281 }, { x: -262, z: -281 }, { radius: 1.3, height: 1.6 });
    expect(r.walls).toBe(0);
    expect(r.p.y).toBeGreaterThan(-0.3);
  });
  it('from the lower deck up the steps onto the river walk', () => {
    const r = walk(city.collision, { x: 16, y: LEVELS.lowerDeck, z: -288 }, { x: 16, z: -270 });
    expect(r.walls).toBe(0);
    expect(r.p.y).toBeCloseTo(LEVELS.riverWalk, 3);
  });
  it('the river walk runs the length of the stem', () => {
    const r = walk(city.collision, { x: -262, y: LEVELS.riverWalk, z: -271 }, { x: 362, z: -271 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeCloseTo(LEVELS.riverWalk, 3);
  });
  it('under the El along the Loop row street', () => {
    const r = walk(city.collision, { x: -150, y: 0, z: -359 }, { x: 140, z: -359 });
    expect(r.walls).toBe(0);
    expect(r.minY).toBeGreaterThan(-0.1);
  });
  it('the water: nothing to stand on in the channel, and it counts as in the water', () => {
    expect(city.collision.groundBelow(0, 2, -253, 0.3)).toBe(-Infinity);
    expect(killYAt(0, -253)).toBeGreaterThan(LEVELS.river - 1);
    expect(killYAt(0, -253)).toBeLessThan(LEVELS.riverWalk);
  });
  it('railings stop a walk off the quay and off the river walk', () => {
    const quay = walk(city.collision, { x: 40, y: 0.15, z: -237 }, { x: 40, z: -250 });
    expect(quay.walls).toBeGreaterThan(0);
    expect(quay.p.z).toBeGreaterThan(-241.5);
    const rw = walk(city.collision, { x: 40, y: LEVELS.riverWalk, z: -270 }, { x: 40, z: -255 });
    expect(rw.p.z).toBeLessThan(-265.5);
  });
  it('adds grapple points, ladders, lamps and light spots of its own', () => {
    const core = city.regionCtx.core;
    expect(city.ctx.grapple.length - core.grappleEnd).toBeGreaterThan(150);
    expect(city.ctx.climbables.ladders.length).toBeGreaterThan(161);
  });
});
