// [onboard] The HUD director's priorities, deferral over combat, collapse to chips, and the reveal math.
import { describe, it, expect } from 'vitest';
import { createHudDirector, approachLevel, revealStyle, quantise, GAP_MS, COLLAPSE_MS, CHIP_MS, MAX_CHIPS, handoffMs } from '../../src/ui/hudDirector.js';

const card = (id, extra = {}) => ({ id, kind: 'card', ms: 1000, payload: { title: id, text: '' }, ...extra });
const shows = (ops) => ops.filter((o) => o.op === 'show').map((o) => o.item.id);

describe('hud director', () => {
  it('one centre card at a time, with a gap between them', () => {
    const d = createHudDirector();
    d.request(card('a'), 0);
    d.request(card('b'), 0);
    expect(shows(d.tick(0))).toEqual(['a']);
    expect(shows(d.tick(500))).toEqual([]);
    const ops = d.tick(1000);
    expect(ops.some((o) => o.op === 'hide' && o.item.id === 'a')).toBe(true);
    expect(shows(ops)).toEqual([]);
    expect(shows(d.tick(1000 + GAP_MS))).toEqual(['b']);
  });
  it('higher priority first', () => {
    const d = createHudDirector();
    d.request(card('news', { kind: 'news' }), 0);
    d.request({ id: 'goal', kind: 'banner', ms: 2300, payload: { text: 'Go' } }, 0);
    expect(shows(d.tick(0))).toEqual(['goal']);
  });
  it('waits out combat, then collapses to a chip; a banner collapses at once', () => {
    const d = createHudDirector();
    d.request(card('delivery'), 0);
    d.request({ id: 'goal', kind: 'banner', ms: 2300, payload: { text: 'Go' } }, 0);
    let ops = d.tick(100, { combat: true });
    expect(shows(ops)).toEqual([]);
    expect(ops.some((o) => o.op === 'collapse' && o.item.id === 'goal')).toBe(true);
    expect(d.chips.map((c) => c.id)).toEqual([]); // the caption carries the goal
    ops = d.tick(COLLAPSE_MS + 1, { combat: true });
    expect(ops.some((o) => o.op === 'collapse' && o.item.id === 'delivery')).toBe(true);
    expect(d.chips.map((c) => c.id)).toEqual(['delivery']);
    expect(d.waiting).toBe(0);
  });
  it('a lull lets a deferred card through', () => {
    const d = createHudDirector();
    d.request(card('x'), 0);
    expect(shows(d.tick(10, { combat: true }))).toEqual([]);
    expect(shows(d.tick(2000, { combat: false }))).toEqual(['x']);
  });
  it('critical cuts in, even in combat', () => {
    const d = createHudDirector();
    d.request(card('a', { ms: 5000 }), 0);
    d.tick(0);
    d.request(card('fail', { critical: true }), 100);
    const ops = d.tick(100, { combat: true });
    expect(ops.some((o) => o.op === 'hide' && o.item.id === 'a')).toBe(true);
    expect(shows(ops)).toEqual(['fail']);
  });
  it('nothing new over a comic', () => {
    const d = createHudDirector();
    d.request(card('a'), 0);
    expect(shows(d.tick(0, { blocked: true }))).toEqual([]);
    expect(shows(d.tick(10))).toEqual(['a']);
  });
  it('compact HUD: everything non-critical is a chip', () => {
    const d = createHudDirector({ compact: () => true });
    d.request(card('lvl'), 0);
    expect(shows(d.tick(0))).toEqual([]);
    expect(d.chips.map((c) => c.id)).toEqual(['lvl']);
  });
  it('chips age out and never pile up past the cap', () => {
    const d = createHudDirector();
    for (let i = 0; i < 6; i++) d.chip(`c${i}`, 'x', 0);
    d.tick(1);
    expect(d.chips.length).toBe(MAX_CHIPS);
    d.tick(CHIP_MS + 1);
    expect(d.chips.length).toBe(0);
  });
  it('a duplicate request is one card; dismiss shortens the current one', () => {
    const d = createHudDirector();
    d.request(card('a', { ms: 9000 }), 0);
    d.request(card('a', { ms: 9000 }), 0);
    d.tick(0);
    expect(d.waiting).toBe(0);
    d.dismiss(100, 1500);
    expect(d.tick(1500).some((o) => o.op === 'hide')).toBe(true);
  });
});

describe('reveal math', () => {
  it('approach ramps smoothly from the outer ring to the trigger', () => {
    expect(approachLevel(100, 8)).toBe(0);
    expect(approachLevel(8, 8)).toBe(1);
    expect(approachLevel(2, 8)).toBe(1);
    const a = approachLevel(30, 8), b = approachLevel(20, 8), c = approachLevel(12, 8);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(approachLevel(NaN, 8)).toBe(0);
  });
  it('reduced motion is a plain fade', () => {
    expect(revealStyle(0.5, true)).toEqual({ opacity: 0.5, y: 0, scale: 1 });
    const r = revealStyle(0, false);
    expect(r.y).toBeGreaterThan(0);
    expect(r.scale).toBeLessThan(1);
  });
  it('quantised levels keep DOM writes rare; the hand-off is short', () => {
    expect(quantise(0.501)).toBe(quantise(0.5));
    expect(handoffMs(true)).toBeLessThan(handoffMs(false));
    expect(handoffMs(false)).toBeLessThanOrEqual(1000);
  });
});
