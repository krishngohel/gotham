import { describe, it, expect } from 'vitest';
import { staticShadowStale, snapToTexels } from '../../src/render/shadows.js';
import { viewPixelRect, splitRects } from '../../src/render/inkPipeline.js';

describe('cached static shadow map', () => {
  const dir = { x: 0, y: 1, z: 0 };
  const cache = (over = {}) => ({ cx: 0, cy: 0, cz: 0, dx: 0, dy: 1, dz: 0, valid: true, ...over });

  it('is stale before its first render and after invalidate()', () => {
    expect(staticShadowStale(cache({ valid: false }), { x: 0, y: 0, z: 0 }, dir, 8)).toBe(true);
  });

  it('stays cached until the player has moved `refresh` metres from its centre', () => {
    expect(staticShadowStale(cache(), { x: 5, y: 0, z: 5 }, dir, 8)).toBe(false);
    expect(staticShadowStale(cache(), { x: 6, y: 0, z: 6 }, dir, 8)).toBe(true);
    // Height counts half: a 12 m climb alone is not enough, a 17 m one is.
    expect(staticShadowStale(cache(), { x: 0, y: 12, z: 0 }, dir, 8)).toBe(false);
    expect(staticShadowStale(cache(), { x: 0, y: 17, z: 0 }, dir, 8)).toBe(true);
  });

  it('re-renders when the moon turns more than about 3 degrees', () => {
    const turn = (deg) => { const r = (deg * Math.PI) / 180; return { x: Math.sin(r), y: Math.cos(r), z: 0 }; };
    expect(staticShadowStale(cache(), { x: 0, y: 0, z: 0 }, turn(2), 8)).toBe(false);
    expect(staticShadowStale(cache(), { x: 0, y: 0, z: 0 }, turn(4), 8)).toBe(true);
  });

  it('snaps the box centre to whole shadow-map texels', () => {
    const step = 64 / 2048;
    const v = snapToTexels(10.01, 32, 2048);
    expect(Math.abs(v / step - Math.round(v / step))).toBeLessThan(1e-9);
    expect(Math.abs(v - 10.01)).toBeLessThanOrEqual(step / 2);
  });
});

describe('view rects (split screen)', () => {
  it('maps a fractional rect onto drawing-buffer pixels without gaps or overlap', () => {
    const [a, b] = splitRects(2, 1921, 1080, 4);
    const pa = viewPixelRect(a, 1921, 1080), pb = viewPixelRect(b, 1921, 1080);
    expect(pa[0]).toBe(0);
    expect(pb[0] + pb[2]).toBe(1921);
    expect(pb[0] - (pa[0] + pa[2])).toBe(4);
    expect(pa[3]).toBe(1080);
    expect(pb[3]).toBe(1080);
  });

  it('is one full rect for one view, and stacks the panels on a portrait screen', () => {
    expect(splitRects(1, 800, 600)).toEqual([[0, 0, 1, 1]]);
    expect(viewPixelRect([0, 0, 1, 1], 800, 600)).toEqual([0, 0, 800, 600]);
    const [top, bottom] = splitRects(2, 600, 1000, 4);
    expect(top[1]).toBeGreaterThan(bottom[1]);
    const pt = viewPixelRect(top, 600, 1000), pb = viewPixelRect(bottom, 600, 1000);
    expect(pt[1] - (pb[1] + pb[3])).toBe(4);
    expect(pt[1] + pt[3]).toBe(1000);
  });

  it('never makes an empty rect', () => {
    expect(viewPixelRect([0.5, 0.5, 0, 0], 10, 10)).toEqual([5, 5, 1, 1]);
  });
});
