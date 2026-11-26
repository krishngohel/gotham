import { describe, it, expect } from 'vitest';
import { nearestInDirection, clampZoom, panToShow, ZOOM_MIN, ZOOM_MAX } from '../../src/ui/skillTree/treeNav.js';
import { layout } from '../../src/progress/skillTree.js';
import { COL_W, ROW_H, LABEL_W } from '../../src/ui/skillTree/treeNav.js';

describe('skill tree page navigation', () => {
  const cells = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 176, y: 0 }, { id: 'c', x: 176, y: 70 }, { id: 'd', x: 0, y: 140 }];
  it('moves to the nearest node that way, preferring straight lines', () => {
    expect(nearestInDirection(cells, cells[0], 1, 0).id).toBe('b');
    expect(nearestInDirection(cells, cells[1], 0, 1).id).toBe('c');
    expect(nearestInDirection(cells, cells[0], 0, 1).id).toBe('d');
    expect(nearestInDirection(cells, cells[0], -1, 0)).toBe(null);
  });
  it('every node on the real tree can be reached with arrow moves from the first', () => {
    // Positions as the page computes them: one band per branch, the kit band for one hero.
    const cellsAll = layout().filter((c) => !c.band || c.band === 'nightwing');
    const real = [];
    let top = 0;
    for (const br of ['armor', 'combat', 'gadgets', 'traversal', 'predator', 'detective', 'vehicle', 'wayne', 'kit']) {
      const mine = cellsAll.filter((c) => c.branch === br);
      for (const c of mine) real.push({ id: c.id, x: LABEL_W + c.col * COL_W, y: top + c.row * ROW_H });
      top += Math.max(1, ...mine.map((c) => c.row + 1)) * ROW_H + 34;
    }
    const seen = new Set([real[0].id]);
    const queue = [real[0]];
    while (queue.length) {
      const c = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = nearestInDirection(real, c, dx, dy);
        if (n && !seen.has(n.id)) { seen.add(n.id); queue.push(n); }
      }
    }
    expect(seen.size).toBe(real.length);
  });
  it('zoom is clamped and a node is panned into view', () => {
    expect(clampZoom(10)).toBe(ZOOM_MAX);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(NaN)).toBe(1);
    expect(panToShow({ x: 1000, y: 10, w: 150, h: 58 }, { panX: 0, panY: 0, zoom: 1, w: 800, h: 400 }).panX).toBe(800 - 40 - 1150);
    expect(panToShow({ x: 100, y: 100, w: 150, h: 58 }, { panX: 0, panY: 0, zoom: 1, w: 800, h: 400 })).toEqual({ panX: 0, panY: 0 });
  });
});
