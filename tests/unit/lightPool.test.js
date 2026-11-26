import { describe, it, expect } from 'vitest';
import { spotScore, pickSpots, mergeRoomFills } from '../../src/world/lightPool.js';

const spot = (x, z, intensity = 20, distance = 20, extra = {}) => ({ x, y: 4, z, color: 0xffffff, intensity, distance, ...extra });

describe('light pool selection', () => {
  it('scores nearer spots higher, height counting half, and zero past 90 m', () => {
    const s = spot(0, 0, 20, 20);
    expect(spotScore(s, 0, 4, 5)).toBeGreaterThan(spotScore(s, 0, 4, 12));
    expect(spotScore(spot(0, 10), 0, 4, 0)).toBeLessThan(spotScore({ ...spot(0, 0), y: 14 }, 0, 4, 0));
    expect(spotScore(spot(0, 200), 0, 4, 0)).toBe(0);
  });

  it('keeps the best `count` spots, best first, and never more', () => {
    const spots = [spot(50, 0), spot(2, 0), spot(10, 0), spot(5, 0), spot(300, 0)];
    const out = new Int32Array(3), scr = new Float32Array(3);
    pickSpots(spots, 0, 4, 0, 3, out, scr);
    expect([...out]).toEqual([1, 3, 2]);
  });

  it('leaves empty slots at -1 when few spots are in range, and handles a pool of zero', () => {
    const out = new Int32Array(4), scr = new Float32Array(4);
    pickSpots([spot(3, 0)], 0, 4, 0, 4, out, scr);
    expect([...out]).toEqual([0, -1, -1, -1]);
    expect(() => pickSpots([spot(3, 0)], 0, 4, 0, 0, new Int32Array(0), new Float32Array(0))).not.toThrow();
  });

  it('gives a room light the first slot while the focus is in (or just outside) its room', () => {
    const room = { minX: -10, maxX: 10, minY: 0, maxY: 6, minZ: -10, maxZ: 10 };
    const spots = [spot(1, 1, 60, 30), spot(0, 0, 1, 40, { room })];
    const out = new Int32Array(1), scr = new Float32Array(1);
    pickSpots(spots, 0, 1, 15, 1, out, scr);
    expect(out[0]).toBe(1);
    pickSpots(spots, 0, 1, 25, 1, out, scr);
    expect(out[0]).toBe(0);
  });
});

describe('room fills', () => {
  it('merge per room into one light at the intensity-weighted centre with summed intensity', () => {
    const a = { minX: 0, maxX: 10 }, b = { minX: 100, maxX: 110 };
    const fills = [
      { x: 0, y: 4, z: 0, color: 0xff0000, intensity: 3, distance: 20, decay: 1.4 },
      { x: 4, y: 4, z: 0, color: 0x0000ff, intensity: 1, distance: 40, decay: 1.4 },
      { x: 100, y: 2, z: 0, color: 0xffffff, intensity: 2, distance: 10, decay: 1.4 },
      { x: 500, y: 2, z: 0, color: 0xffffff, intensity: 2, distance: 10, decay: 1.4 },
    ];
    const merged = mergeRoomFills(fills, (f) => (f.x < 50 ? a : f.x < 200 ? b : null));
    expect(merged).toHaveLength(3);
    const ma = merged.find((m) => m.room === a);
    expect(ma.intensity).toBe(4);
    expect(ma.x).toBeCloseTo(1);
    expect(ma.distance).toBe(40);
    expect(ma.decay).toBeCloseTo(1.4);
    expect(merged.find((m) => !m.room).x).toBe(500);
  });
});
