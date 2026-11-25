import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { buildMapData, SITES, GRID, WORLD } from '../../src/world/mapData.js';

// The overhaul adds new regions around the original city; it must never move the original.
// Trophies, zip lines, breakable walls, stealth rooms and crime spots are all placed against this
// exact layout, so any change here silently breaks them. If this fails, you edited the core city:
// put the new content in a new region instead (docs/design/long-night-2.md, rule 3).
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

describe('core city is frozen', () => {
  it('seed 11 map data is unchanged', () => {
    expect(hash(buildMapData(11))).toBe('556236686db78b62');
  });
  it('named sites are unchanged', () => {
    expect(hash(SITES)).toBe('af0584ee85b15447');
  });
  it('grid and world extents are unchanged', () => {
    expect(hash({ GRID, WORLD })).toBe('0e0a5ded0371fd9d');
  });
});
