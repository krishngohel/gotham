// [light] The Brightness setting: saved with the other settings, safe for old saves, and one curve
// shared by the ink pass and the menu's calibration tile.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, sanitizeSettings, loadSettings, saveSettings } from '../../src/core/settings.js';
import { BRIGHTNESS, clampBrightness, brightnessGamma, displayedByte, calibrationShades, CALIBRATION } from '../../src/render/brightness.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('brightness setting', () => {
  it('defaults to 1 (the picture as authored) and an old settings save loads with it', () => {
    expect(DEFAULT_SETTINGS.brightness).toBe(1);
    expect(sanitizeSettings({ rev: 2, fov: 70, quality: 'low' }).brightness).toBe(1);
    expect(sanitizeSettings({}).brightness).toBe(1);
  });

  it('clamps and rejects junk', () => {
    expect(sanitizeSettings({ brightness: 9 }).brightness).toBe(BRIGHTNESS.max);
    expect(sanitizeSettings({ brightness: 0 }).brightness).toBe(BRIGHTNESS.min);
    expect(sanitizeSettings({ brightness: 'bright' }).brightness).toBe(1);
    expect(sanitizeSettings({ brightness: NaN }).brightness).toBe(1);
    expect(clampBrightness(1.25)).toBe(1.25);
  });

  it('persists through save and load', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    saveSettings(storage, { ...sanitizeSettings({}), brightness: 1.3 });
    expect(loadSettings(storage).brightness).toBe(1.3);
  });

  it('is a gamma: 1 at the default, lower exponent = brighter, black and white stay put', () => {
    expect(brightnessGamma(1)).toBe(1);
    expect(brightnessGamma(1.5)).toBeLessThan(1);
    expect(brightnessGamma(0.7)).toBeGreaterThan(1);
    for (const b of [BRIGHTNESS.min, 1, BRIGHTNESS.max]) {
      expect(displayedByte(0, b)).toBe(0);
      expect(displayedByte(1, b)).toBe(255);
    }
    // A shadow tone climbs steadily across the slider's range.
    let last = -1;
    for (let b = BRIGHTNESS.min; b <= BRIGHTNESS.max + 1e-9; b += BRIGHTNESS.step) {
      const v = displayedByte(0.008, b);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    expect(displayedByte(0.008, BRIGHTNESS.max)).toBeGreaterThan(displayedByte(0.008, BRIGHTNESS.min) + 25);
  });

  it('calibration tile: the faint bat is darker than the clear one at every setting, and both follow the slider', () => {
    const byte = (css) => Number(css.match(/rgb\((\d+)/)[1]);
    for (const b of [BRIGHTNESS.min, 0.8, 1, 1.3, BRIGHTNESS.max]) {
      const s = calibrationShades(b);
      expect(byte(s.faint)).toBeLessThan(byte(s.clear));
    }
    // At the default the faint bat is just above black, the clear one plainly visible.
    const d = calibrationShades(1);
    expect(byte(d.faint)).toBeGreaterThan(3);
    expect(byte(d.faint)).toBeLessThan(16);
    expect(byte(d.clear)).toBeGreaterThan(30);
    expect(byte(calibrationShades(BRIGHTNESS.max).faint)).toBeGreaterThan(byte(calibrationShades(BRIGHTNESS.min).faint));
    expect(CALIBRATION.faint).toBeLessThan(CALIBRATION.clear);
  });

  it('is wired: the ink pass has the uniform, the game applies the setting, both menu tabs show it', () => {
    const ink = read('src/render/inkPipeline.js');
    expect(ink).toMatch(/uniform float uGamma[,;]/);
    expect(ink).toMatch(/if \(uGamma != 1\.0\) col = pow\(/);
    expect(ink).toMatch(/setBrightness/);
    expect(read('src/game/game.js')).toMatch(/ink\.setBrightness\(/);
    expect(read('src/ui/menus.js')).toMatch(/buildBrightnessControl\(body, settings, a11y\)/);
    expect(read('src/ui/accessibility.js')).toMatch(/buildBrightnessControl\(body, settings, h\)/);
  });
});
