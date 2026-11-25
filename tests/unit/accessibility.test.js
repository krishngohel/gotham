// [prog] a11y (wave 3 L1 item 6): settings application, telegraph shapes, flash/shake numbers.
import { describe, it, expect } from 'vitest';
import {
  accessibilityVars, shakeScale, flashScale, FLASH_REDUCED, impactModeFor, lightningFlash, aimConeScale, qteWindowScale,
  TELLS, STEALTH_TELLS, tellKind, tellSvg, glyphTell, setTellResolver, applyPlayerInputs,
} from '../../src/ui/accessibility.js';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../../src/core/settings.js';
import { createImpactTimeline } from '../../src/render/impactTimeline.js';
import { pickAimed } from '../../src/gadgets/aim.js';
import { STANDARD_LAYOUT } from '../../src/core/input.js';

const withAccess = (a = {}, top = {}) => sanitizeSettings({ ...top, access: { ...a } });

describe('accessibilityVars', () => {
  it('defaults: text 1, medium subtitles, patterns on, nothing reduced', () => {
    const { vars, classes } = accessibilityVars(sanitizeSettings({}));
    expect(vars['--a11y-text']).toBe('1');
    expect(vars['--sub-size']).toBe('24px');
    expect(vars['--sub-bg']).toBe('0.6');
    expect(vars['--a11y-flash']).toBe('1');
    expect(classes).toEqual({ 'a11y-reduced-motion': false, 'a11y-flash-reduce': false, 'a11y-glyph-patterns': true, 'a11y-sub-names': true });
  });
  it('subtitle size scales with the text size; options turn classes on', () => {
    const { vars, classes } = accessibilityVars(withAccess({ textSize: 1.5, subtitleSize: 'huge', subtitleBg: 0, reducedMotion: true, flashReduce: true, glyphPatterns: false, subtitleSpeakers: false }));
    expect(vars['--a11y-text']).toBe('1.5');
    expect(vars['--sub-size']).toBe('63px');
    expect(vars['--sub-bg']).toBe('0');
    expect(vars['--a11y-flash']).toBe(String(FLASH_REDUCED));
    expect(classes).toEqual({ 'a11y-reduced-motion': true, 'a11y-flash-reduce': true, 'a11y-glyph-patterns': false, 'a11y-sub-names': false });
  });
  it('survives a missing or junk access block', () => {
    expect(accessibilityVars(null).vars['--a11y-text']).toBe('1');
    expect(accessibilityVars({ access: { textSize: 'big', subtitleSize: 'enormous' } }).vars['--sub-size']).toBe('24px');
  });
  it('an old settings save (no access, no pads) loads with every default', () => {
    const s = sanitizeSettings({ sensitivity: 1.4, cameraShake: false, rev: 2 });
    expect(s.access).toEqual(DEFAULT_SETTINGS.access);
    expect(s.pads).toEqual(DEFAULT_SETTINGS.pads);
    expect(s.sensitivity).toBe(1.4);
  });
});

describe('shake, flash and timing numbers', () => {
  it('shake: off with cameraShake false, else the strength slider', () => {
    expect(shakeScale(sanitizeSettings({}))).toBe(1);
    expect(shakeScale(withAccess({ shake: 0.25 }))).toBe(0.25);
    expect(shakeScale(withAccess({ shake: 1 }, { cameraShake: false }))).toBe(0);
  });
  it('flash reduction dims flashes and turns Full impact frames into Soft', () => {
    expect(flashScale(sanitizeSettings({}))).toBe(1);
    expect(flashScale(withAccess({ flashReduce: true }))).toBe(FLASH_REDUCED);
    expect(impactModeFor(sanitizeSettings({}))).toBe('full');
    expect(impactModeFor(withAccess({ flashReduce: true }))).toBe('soft');
    expect(impactModeFor(withAccess({ flashReduce: true }, { impactFrames: 'off' }))).toBe('off');
  });
  it('lightning: unchanged strobes normally, one soft swell when reduced', () => {
    const old = (t) => ((t > 0.2 && t <= 0.26) || (t > 0.06 && t <= 0.1) ? 1 : 0);
    let maxReduced = 0, rises = 0, prev = 0, dir = 1;
    for (let t = 0.27; t > -0.01; t -= 0.005) {
      expect(lightningFlash(t)).toBe(t > 0 ? old(t) : 0);
      const k = lightningFlash(t, true);
      maxReduced = Math.max(maxReduced, k);
      const d = Math.sign(k - prev);
      if (d > 0 && dir <= 0) rises++;
      if (d) dir = d;
      prev = k;
    }
    expect(maxReduced).toBeLessThanOrEqual(0.3);
    expect(maxReduced).toBeGreaterThan(0.1);
    expect(rises).toBeLessThanOrEqual(1); // never strobes
  });
  it('impact timeline flash beats follow flashScale; the freeze look does not', () => {
    const full = createImpactTimeline(), dim = createImpactTimeline(undefined, { flashScale: () => 0.35 });
    const a = {}, b = {};
    full.trigger(2, 0); dim.trigger(2, 0);
    expect(dim.sample(10, b).impact).toBeCloseTo(full.sample(10, a).impact * 0.35);
    expect(dim.sample(200, b).impact).toBe(full.sample(200, a).impact);
  });
  it('aim assist: the default strength keeps today\'s cone, and it grows with the slider', () => {
    expect(aimConeScale(0.5)).toBe(1);
    expect(aimConeScale(0)).toBeLessThan(1);
    expect(aimConeScale(1)).toBeGreaterThan(1);
    for (let i = 0; i < 10; i++) expect(aimConeScale((i + 1) / 10)).toBeGreaterThan(aimConeScale(i / 10));
    // pickAimed: a target 0.4 rad off the aim line is outside today's 0.35 cone, inside a wide one.
    const eye = { x: 0, y: 0, z: 0 }, dir = { x: 0, y: 0, z: 1 };
    const goon = { pos: { x: Math.sin(0.4) * 10, y: -1.1, z: Math.cos(0.4) * 10 } };
    expect(pickAimed([goon], eye, dir, {})).toBe(null);
    expect(pickAimed([goon], eye, dir, { coneScale: aimConeScale(1) })).toBe(goon);
  });
  it('QTE help: more time or automatic', () => {
    expect(qteWindowScale('off')).toBe(1);
    expect(qteWindowScale('slow')).toBeGreaterThan(1);
    expect(qteWindowScale('auto')).toBe(Infinity);
  });
});

describe('telegraph glyphs differ by shape and pattern, not only colour', () => {
  const tells = Object.values(TELLS);
  it('counter, unblockable, ranged and special have pairwise distinct shapes, paths and patterns', () => {
    for (let i = 0; i < tells.length; i++) for (let j = i + 1; j < tells.length; j++) {
      expect(tells[i].shape).not.toBe(tells[j].shape);
      expect(tells[i].path).not.toBe(tells[j].path);
      expect(tells[i].pattern).not.toBe(tells[j].pattern);
    }
    expect(new Set(tells.map((t) => t.id)).size).toBe(tells.length);
  });
  it('the stealth awareness states differ by ring style and mark', () => {
    const s = Object.values(STEALTH_TELLS);
    expect(new Set(s.map((t) => t.shape)).size).toBe(s.length);
    expect(new Set(s.map((t) => t.pattern)).size).toBe(s.length);
  });
  it('a red glyph is a dodge for melee and a crosshair for a gun', () => {
    expect(tellKind('blue')).toBe('counter');
    expect(tellKind('red')).toBe('unblockable');
    expect(tellKind('red', true)).toBe('ranged');
    expect(tellKind('yellow')).toBe('special');
    setTellResolver((id) => (id === 7 ? { def: { ranged: true } } : { def: {} }));
    expect(glyphTell('red', 7).id).toBe('ranged');
    expect(glyphTell('red', 8).id).toBe('unblockable');
    setTellResolver(() => { throw new Error('gone'); });
    expect(glyphTell('red', 7).id).toBe('unblockable');
    setTellResolver(null);
  });
  it('the counter tell keeps the original bolt; patterned tells carry a pattern layer', () => {
    expect(TELLS.counter.path).toBe('M22 2 L6 30 L17 30 L12 52 L32 20 L20 20 L26 2 Z');
    expect(tellSvg('counter')).not.toContain('class="pat"');
    expect(tellSvg('unblockable')).toContain('url(#a11y-stripes)');
    expect(tellSvg('ranged')).toContain('url(#a11y-dots)');
    expect(tellSvg('special')).toContain('url(#a11y-checks)');
  });
});

describe('applyPlayerInputs', () => {
  const fake = () => {
    const calls = {};
    return { calls, setPadLayout: (l) => { calls.layout = l; }, setHoldModes: (m, o) => { calls.modes = m; calls.airborne = o.airborne; }, setLookTuning: (t) => { calls.look = t; } };
  };
  it('gives each player its own pad slot, the hold modes and the look tuning', () => {
    const s = sanitizeSettings({ access: { sprint: 'toggle' }, pads: [{ preset: 'standard' }, { preset: 'legacy', sensitivity: 2, invertX: true }] });
    const a = fake(), b = fake();
    const hero = { grounded: false };
    applyPlayerInputs(s, { players: [{ slot: 0, input: a, hero: { grounded: true } }, { slot: 1, input: b, hero }, { slot: 2, input: { kind: 'bot' } }] });
    expect(a.calls.layout).toBe(STANDARD_LAYOUT);
    expect(b.calls.layout.preset).toBe('legacy');
    expect(b.calls.modes.sprint).toBe('toggle');
    expect(b.calls.airborne()).toBe(true);
    expect(a.calls.airborne()).toBe(false);
    expect(b.calls.look.pad.sensitivity).toBe(2);
    expect(b.calls.look.base).toEqual({ sensitivity: 1, invertY: false });
  });
  it('before a run exists, player 0\'s input alone', () => {
    const a = fake();
    applyPlayerInputs(sanitizeSettings({}), { input: a });
    expect(a.calls.layout).toBe(STANDARD_LAYOUT);
  });
});
