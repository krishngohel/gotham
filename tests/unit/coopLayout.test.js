import { describe, it, expect } from 'vitest';
import { layoutViews, splitOrientation, splitFov, ndcToPanel, GUTTER_PX } from '../../src/coop/viewLayout.js';
import { createHudGroup, SHARED_HUD_CALLS } from '../../src/coop/hudGroup.js';

describe('split-screen layout', () => {
  it('one player is the whole screen, exactly', () => {
    const [v] = layoutViews(1, 1280, 720);
    expect(v.gl).toEqual([0, 0, 1, 1]);
    expect(v.css).toEqual({ left: 0, top: 0, width: 1280, height: 720 });
    expect(v.aspect).toBeCloseTo(1280 / 720);
  });
  it('two players split side by side by default, with an inked gutter between', () => {
    const [a, b] = layoutViews(2, 1280, 720);
    expect(a.css).toEqual({ left: 0, top: 0, width: 638, height: 720 });
    expect(b.css).toEqual({ left: 642, top: 0, width: 638, height: 720 });
    expect(b.css.left - (a.css.left + a.css.width)).toBe(GUTTER_PX);
    // GL rects: fractions, origin bottom-left, covering the same pixels.
    expect(a.gl[0]).toBe(0);
    expect(a.gl[2] * 1280).toBeCloseTo(638);
    expect(b.gl[0] * 1280).toBeCloseTo(642);
    expect(a.gl[1]).toBe(0);
    expect(a.gl[3]).toBe(1);
  });
  it('stacked (horizontal seam) puts player 1 on top: GL y is measured from the bottom', () => {
    const [a, b] = layoutViews(2, 1280, 720, { layout: 'horizontal' });
    expect(a.css.top).toBe(0);
    expect(b.css.top).toBe(a.css.height + GUTTER_PX);
    expect(a.gl[1]).toBeGreaterThan(b.gl[1]);
    expect(b.gl[1]).toBe(0);
    expect(a.css.height + b.css.height + GUTTER_PX).toBe(720);
  });
  it('auto follows the screen shape', () => {
    expect(splitOrientation('auto', 1920, 1080)).toBe('vertical');
    expect(splitOrientation('auto', 800, 1200)).toBe('horizontal');
    expect(splitOrientation('vertical', 800, 1200)).toBe('vertical');
  });
  it('odd sizes never lose or overlap a pixel', () => {
    for (const [w, h] of [[1281, 721], [1366, 768], [3, 3]]) {
      for (const layout of ['vertical', 'horizontal']) {
        const [a, b] = layoutViews(2, w, h, { layout });
        if (layout === 'vertical') expect(a.css.width + b.css.width + GUTTER_PX).toBe(w);
        else expect(a.css.height + b.css.height + GUTTER_PX).toBe(h);
      }
    }
  });
  it('a narrow half widens its vertical FOV a little (kept within bounds); the full view is untouched', () => {
    expect(splitFov(60, 16 / 9, 16 / 9)).toBe(60);
    const f = splitFov(60, 638 / 720, 1280 / 720);
    expect(f).toBeGreaterThan(60);
    expect(f).toBeLessThanOrEqual(74);
    const stacked = splitFov(60, 1280 / 358, 1280 / 720);
    expect(stacked).toBeLessThan(60);
    expect(stacked).toBeGreaterThanOrEqual(48);
  });
  it('projects NDC into a panel', () => {
    const o = {};
    ndcToPanel(0, 0, 0.5, { width: 600, height: 400 }, o);
    expect(o).toEqual({ x: 300, y: 200, behind: false });
    ndcToPanel(1, 1, 1.2, { width: 600, height: 400 }, o);
    expect(o).toEqual({ x: 600, y: 0, behind: true });
  });
});

describe('the HUD group', () => {
  const fakeHud = (log, name) => {
    const h = {};
    for (const m of [...SHARED_HUD_CALLS, 'hint', 'damage', 'sfx']) h[m] = (...a) => log.push([name, m, ...a]);
    Object.defineProperty(h, 'bannerShowing', { get: () => name === 'p0', enumerable: true });
    return h;
  };
  it('one player: every call is player 0\'s HUD, nothing else', () => {
    const log = [];
    const g = createHudGroup(fakeHud(log, 'p0'));
    g.setObjective('Go'); g.hint('x'); g.damage(5);
    expect(log).toEqual([['p0', 'setObjective', 'Go'], ['p0', 'hint', 'x'], ['p0', 'damage', 5]]);
    expect(g.bannerShowing).toBe(true);
    expect(g.forPlayer({ id: 3 })).toBe(g.primary);
  });
  it('a partner HUD gets the shared story calls, its own when asked, and the standing state on attach', () => {
    const log = [];
    const g = createHudGroup(fakeHud(log, 'p0'));
    g.setObjective('Reach the docks');
    g.setTrophies(3, 12);
    const p1 = { id: 1 };
    const h1 = fakeHud(log, 'p1');
    log.length = 0;
    g.attach(p1, h1);
    expect(log).toEqual([['p1', 'setObjective', 'Reach the docks'], ['p1', 'setTrophies', 3, 12]]);
    log.length = 0;
    g.banner('NEW GOAL');
    g.hint('only p0');
    g.forPlayer(p1).hint('only p1');
    expect(log).toEqual([['p0', 'banner', 'NEW GOAL'], ['p1', 'banner', 'NEW GOAL'], ['p0', 'hint', 'only p0'], ['p1', 'hint', 'only p1']]);
    g.detach(p1);
    log.length = 0;
    g.card('A', 'B');
    expect(log).toEqual([['p0', 'card', 'A', 'B']]);
  });
});
