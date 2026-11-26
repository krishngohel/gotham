// [polish] The title screen's pure parts: the camera path, loading tips, the menu sound map.
import { describe, it, expect } from 'vitest';
import { titleCamera, TITLE_KEYS, LEG } from '../../src/ui/titleCam.js';
import { LOADING_TIPS, tipAt } from '../../src/ui/loadingTips.js';
import { MENU_SOUNDS, menuSound } from '../../src/ui/uiSounds.js';
import { SFX } from '../../src/audio/sfx.js';
import { whatsNewSections, whatsNewItems } from '../../src/ui/whatsNew.js';
import { DEFAULT_BINDINGS, bindingLabel } from '../../src/core/bindings.js';

const DASH = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);

describe('title camera', () => {
  it('starts on the first key, reaches the second after one leg, and comes back', () => {
    const p = [0, 0, 0], l = [0, 0, 0];
    titleCamera(0, p, l);
    expect(p).toEqual(TITLE_KEYS[0].pos);
    titleCamera(LEG, p, l);
    p.forEach((v, i) => expect(v).toBeCloseTo(TITLE_KEYS[1].pos[i], 6));
    titleCamera(2 * LEG, p, l);
    p.forEach((v, i) => expect(v).toBeCloseTo(TITLE_KEYS[0].pos[i], 6));
  });
  it('moves smoothly (no jump larger than a few centimetres per frame)', () => {
    const a = [0, 0, 0], b = [0, 0, 0], l = [0, 0, 0];
    for (let t = 0; t < 3 * LEG; t += 1 / 60) {
      titleCamera(t, a, l); titleCamera(t + 1 / 60, b, l);
      expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.1);
    }
  });
  it('stays above the Loop roofs and near enough to Wayne Tower for the Potato fog', () => {
    const p = [0, 0, 0], l = [0, 0, 0];
    for (let t = 0; t < 2 * LEG; t += 1) {
      titleCamera(t, p, l);
      expect(p[1]).toBeGreaterThan(90);
      expect(Math.hypot(p[0], p[2] + 449)).toBeLessThan(190);
    }
  });
});

describe('loading tips', () => {
  it('are clean, short lines and every tip comes round before one repeats', () => {
    for (const t of LOADING_TIPS) { expect(t).not.toMatch(DASH); expect(t.length).toBeLessThan(110); }
    const seen = new Set();
    for (let i = 0; i < LOADING_TIPS.length; i++) seen.add(tipAt(i, 3));
    expect(seen.size).toBe(LOADING_TIPS.length);
  });
});

describe('menu sounds', () => {
  it('map the old names onto ui-bus sounds that exist', () => {
    for (const n of Object.values(MENU_SOUNDS)) { expect(SFX[n], n).toBeTruthy(); expect(SFX[n].bus).toBe('ui'); }
    const calls = [];
    const play = menuSound((n) => calls.push(n));
    play('uiMove'); play('uiSelect'); play('uiBack'); play('uiTab');
    expect(calls).toEqual(['uiHover', 'uiConfirm', 'uiBack', 'uiTab']);
  });
});

describe("What's new", () => {
  it('groups the overhaul into sections and names the live map key', () => {
    const secs = whatsNewSections(DEFAULT_BINDINGS);
    expect(secs.length).toBeGreaterThanOrEqual(4);
    const text = whatsNewItems(DEFAULT_BINDINGS).join(' ');
    for (const w of ['Loop', 'El', 'room code', 'Bruce', 'Batcave']) expect(text).toContain(w);
    expect(text).toContain(bindingLabel(DEFAULT_BINDINGS, 'map'));
  });
});
