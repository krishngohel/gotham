// [polish] The HUD's layout grammar (src/ui/hudLayout.js): the feed column's slot allocation, the
// overlap check and when centre cards become chips.
import { describe, it, expect } from 'vitest';
import { stackSlot, feedBounds, overlaps, findOverlaps, cardsAsChips, SLOTS } from '../../src/ui/hudLayout.js';

describe('stackSlot: the feed column', () => {
  it('stacks top-down, pinned first, then oldest to newest, gap apart', () => {
    const r = stackSlot([{ id: 'toast', h: 90, at: 3 }, { id: 'radio', h: 60, at: 2 }, { id: 'challenge', h: 80, pinned: true, at: 9 }], { top: 236, bottom: 600, gap: 10 });
    expect(r.placed).toEqual([{ id: 'challenge', y: 236 }, { id: 'radio', y: 326 }, { id: 'toast', y: 396 }]);
    expect(r.dropped).toEqual([]);
  });
  it('drops the oldest unpinned item first when they do not all fit', () => {
    const r = stackSlot([{ id: 'radio', h: 120, at: 1 }, { id: 'toast', h: 120, at: 2 }, { id: 'challenge', h: 100, pinned: true, at: 0 }], { top: 200, bottom: 450, gap: 10 });
    expect(r.dropped).toEqual(['radio']);
    expect(r.placed.map((p) => p.id)).toEqual(['challenge', 'toast']);
    // Nothing placed reaches past the bottom.
    const last = r.placed.at(-1);
    expect(last.y + 120).toBeLessThanOrEqual(450);
  });
  it('never drops a pinned item, even when it alone is too tall', () => {
    const r = stackSlot([{ id: 'challenge', h: 500, pinned: true }, { id: 'toast', h: 50, at: 1 }], { top: 100, bottom: 300 });
    expect(r.dropped).toEqual(['toast']);
    expect(r.placed).toEqual([{ id: 'challenge', y: 100 }]);
  });
  it('placed items never overlap each other', () => {
    const items = [{ id: 'a', h: 70, at: 1 }, { id: 'b', h: 40, at: 2 }, { id: 'c', h: 55, at: 3 }];
    const r = stackSlot(items, { top: 0, bottom: 1000, gap: 6 });
    const box = (p) => ({ left: 0, right: 100, top: p.y, bottom: p.y + items.find((i) => i.id === p.id).h });
    expect(findOverlaps(r.placed.map((p) => ({ name: p.id, rect: box(p) })), 0)).toEqual([]);
  });
});

describe('feedBounds', () => {
  it('sits under the minimap and above the vitals corner, tighter in compact and split', () => {
    const n = feedBounds(720), c = feedBounds(720, { compact: true }), s = feedBounds(720, { split: true });
    expect(n.top).toBeGreaterThan(200);
    expect(n.bottom).toBeLessThan(720 - 140);
    expect(c.top).toBeLessThan(n.top);
    expect(s.bottom).toBeLessThan(n.bottom);
    // A tiny window never gives a negative column.
    const t = feedBounds(200);
    expect(t.bottom).toBeGreaterThanOrEqual(t.top);
  });
});

describe('overlaps', () => {
  const r = (left, top, right, bottom) => ({ left, top, right, bottom });
  it('touching or grazing boxes do not count; real overlaps do', () => {
    expect(overlaps(r(0, 0, 100, 100), r(100, 0, 200, 100))).toBe(false);
    expect(overlaps(r(0, 0, 100, 100), r(99, 0, 200, 100))).toBe(false);
    expect(overlaps(r(0, 0, 100, 100), r(80, 80, 200, 200))).toBe(true);
  });
  it('findOverlaps names every overlapping pair', () => {
    const list = [{ name: 'card', rect: r(400, 70, 880, 200) }, { name: 'caption', rect: r(900, 20, 1250, 130) }, { name: 'word', rect: r(850, 100, 1000, 180) }];
    expect(findOverlaps(list)).toEqual([['card', 'word'], ['caption', 'word']]);
  });
});

describe('the grammar', () => {
  it('centre cards are chips in the compact HUD and in a split view only', () => {
    expect(cardsAsChips()).toBe(false);
    expect(cardsAsChips({ compact: true })).toBe(true);
    expect(cardsAsChips({ split: true })).toBe(true);
  });
  it('every slot has a kind', () => {
    for (const k of Object.values(SLOTS)) expect(['corner', 'side', 'centre', 'prompt']).toContain(k);
  });
});
