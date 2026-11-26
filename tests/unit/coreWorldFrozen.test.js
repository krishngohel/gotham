import { describe, it, expect, beforeAll } from 'vitest';
import { createHash } from 'node:crypto';
import { buildCoreCityHeadless } from './helpers/headlessCity.js';

// The built core city, frozen: every collision box, grapple point, ladder and zip line that the
// story, trophies, breakables, challenges and stealth rooms were placed against. Companion to
// coreCityFrozen.test.js (which freezes the map *data*); this one freezes what the builders make
// of it, so render-side work (chunked buckets, far LOD, the region framework) can prove it did not
// move a single walkable surface. Numbers are rounded to 1e-5 m so a last-bit difference in
// Math.sin between JS engines does not matter (the browser build gives the same hashes).
// If this fails you changed what the core city builds: undo it, or move the content to a region.
const round = (v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : Array.isArray(v) ? v.map(round)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v);
const hash = (v) => createHash('sha256').update(JSON.stringify(round(v))).digest('hex').slice(0, 16);

let city;
beforeAll(async () => { city = await buildCoreCityHeadless(); }, 120000);

describe('core city build is frozen', () => {
  it('collision boxes: count and hash', () => {
    const boxes = city.coreBoxes.map((b) => [b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, b.tag]);
    expect(boxes.length).toBe(2636);
    expect(hash(boxes)).toBe('245c1c9757a48ca1');
  });
  it('grapple points', () => {
    expect(city.coreGrapple.length).toBe(1284);
    expect(hash(city.coreGrapple)).toBe('5d19c32f5ea8fd3a');
  });
  // Regions only ever append: the core's ladders and zip lines come first, unchanged.
  it('ladders', () => {
    const core = city.ctx.climbables.ladders.slice(0, 161);
    expect(hash(core)).toBe('cc47753f3a973330');
  });
  it('zip lines', () => {
    const core = city.ctx.climbables.ziplines.slice(0, 8);
    expect(hash(core)).toBe('a3cb45ad52c5b4ba');
  });
});
