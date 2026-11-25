import { describe, it, expect } from 'vitest';
import { getQuality, TIERS, stepTier, isTier } from '../../src/render/quality.js';

describe('quality tiers', () => {
  it('has the five tiers in order, keeping the old ids', () => {
    expect(TIERS).toEqual(['potato', 'low', 'medium', 'high', 'ultra']);
    for (const t of TIERS) expect(getQuality(t).name).toBe(t);
    expect(isTier('high') && isTier('low')).toBe(true);
    expect(getQuality('auto').name).toBe('high');
  });

  it('gets cheaper monotonically down the ladder', () => {
    const qs = TIERS.map(getQuality);
    const fields = ['lights', 'drawDistance', 'lodDistance', 'crowdDensity', 'hullDistance', 'animFullRate', 'rainCount', 'swarmBats', 'pixelRatioCap'];
    for (const f of fields) for (let i = 1; i < qs.length; i++) expect(qs[i][f], `${f} ${qs[i].name}`).toBeGreaterThanOrEqual(qs[i - 1][f]);
    expect(qs.map((q) => q.lights)).toEqual([0, 2, 4, 6, 8]);
  });

  it('matches draw distance to fog: at drawDistance the scene is at least 97% fog', () => {
    for (const t of TIERS) {
      const q = getQuality(t);
      const fog = 1 - Math.exp(-((q.fogDensity * q.drawDistance) ** 2));
      expect(fog, t).toBeGreaterThan(0.97);
    }
  });

  it('keeps high on the pre-overhaul look: same fog, pixel ratio cap and comic weights', () => {
    const h = getQuality('high');
    expect(h.fogDensity).toBe(0.0062);
    expect(h.pixelRatioCap).toBe(2);
    expect(h.comic).toEqual({ wobble: 1, hatch: 1, midDots: 1, skyDots: 1, colorEdges: 1, misreg: 1, palette: 0.35, paper: 1 });
    expect(h.shadows.staticSize).toBe(2048);
  });

  it('turns shadow maps off below medium and puts ink blob shadows there instead', () => {
    for (const t of TIERS) {
      const q = getQuality(t);
      expect(!!q.shadows !== q.blobShadows, t).toBe(true);
    }
    expect(getQuality('potato').normals).toBe('depth');
    expect(getQuality('medium').normals).toBe('mrt');
  });

  it('returns independent copies, and steps clamp at the ends', () => {
    const a = getQuality('high');
    a.comic.hatch = 0; a.shadows.staticSize = 1;
    expect(getQuality('high').comic.hatch).toBe(1);
    expect(getQuality('high').shadows.staticSize).toBe(2048);
    expect(stepTier('potato', -1)).toBe('potato');
    expect(stepTier('ultra', 1)).toBe('ultra');
    expect(stepTier('high', -1)).toBe('medium');
  });
});
