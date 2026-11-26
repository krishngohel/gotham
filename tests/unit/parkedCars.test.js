import { describe, it, expect } from 'vitest';
import { installCanvasStub } from './helpers/headlessCity.js';

// Parked cars come from the street fleet's models but never from a region's rng: the core's
// parked cars keep their rng draws (the paint) and their collision boxes exactly as before.
describe('parked fleet cars', () => {
  it('pick their model and facing from where they stand, not from the rng, and merge into buckets', async () => {
    installCanvasStub();
    const { parkedFleetCar, parkedRow, KERB_TYPES } = await import('../../src/world/parkedCars.js');
    const added = [];
    const boxes = [];
    const ctx = {
      rng: new Proxy({}, { get() { throw new Error('parked cars must not draw from the rng'); } }),
      buckets: { add: (key, geo) => added.push({ key, n: geo.attributes.position.count }) },
      collision: { addBox: (...b) => boxes.push(b) },
    };
    const a = parkedFleetCar(ctx, 12.5, -40, true, 0x6d2f2f);
    const b = parkedFleetCar(ctx, 12.5, -40, true, 0x6d2f2f);
    expect(a).toBe(b);
    expect(KERB_TYPES).toContain(a);
    expect(added.map((x) => x.key)).toEqual(['painted', 'glass', 'glow', 'painted', 'glass', 'glow']);
    // The silhouette LOD is one painted piece of a few hundred triangles.
    added.length = 0;
    parkedFleetCar(ctx, 30, 7, false, null, { detail: 'lod' });
    expect(added).toHaveLength(1);
    expect(added[0].n / 3).toBeLessThan(300);
    // A row along a kerb: some gaps, a 4.4 x 1.9 m box per car.
    parkedRow(ctx, 0, 0, 60, 0, { fill: 0.7 });
    expect(boxes.length).toBeGreaterThan(2);
    for (const [x0, y0, z0, x1, y1, z1] of boxes) { expect(x1 - x0).toBeCloseTo(4.4); expect(z1 - z0).toBeCloseTo(1.9); expect(y1 - y0).toBeCloseTo(0.8); }
  });
});
