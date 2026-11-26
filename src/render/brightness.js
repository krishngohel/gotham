// [light] The Brightness setting (Settings > Video, also on the Accessibility tab). Pure numbers,
// no three.js and no DOM, so the settings sanitiser, the ink pass and the menu's calibration tile
// all share one definition (tests/unit/brightness.test.js).
//
// The setting is a gamma on the finished frame: out = in ^ (1 / brightness), applied by the ink
// pass as its last step in linear light (src/render/inkPipeline.js uGamma). A gamma keeps pure
// black and pure white where they are, so ink lines stay ink and paper stays paper; it moves the
// dark mid-tones, which is where a dim monitor or a bright room loses the picture. One uniform
// for every view, so split screen and every quality tier get it for free.
export const BRIGHTNESS = { min: 0.6, max: 1.6, step: 0.05, default: 1 };

export function clampBrightness(v) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(BRIGHTNESS.max, Math.max(BRIGHTNESS.min, v)) : BRIGHTNESS.default;
}

// The exponent the ink pass raises linear colour to. 1 at the default (the pass skips the pow).
export function brightnessGamma(brightness) {
  return 1 / clampBrightness(brightness);
}

const toSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055);

// What a linear value becomes on screen at this brightness, as an sRGB byte (0..255).
export function displayedByte(linear, brightness) {
  return Math.round(255 * toSrgb(Math.max(0, Math.min(1, linear)) ** brightnessGamma(brightness)));
}

// The calibration tile: a symbol on black that should be "barely visible" when the setting suits
// the screen, and a second one that should always be easy to see. Their linear values sit where
// the night city's shadow tones do (asphalt in moonlight is about 0.008 linear, 9 % sRGB), so
// when the faint symbol can be made out, so can a goon in an unlit alley.
export const CALIBRATION = { faint: 0.0028, clear: 0.02 };

// CSS colours for the tile's two symbols at this brightness.
export function calibrationShades(brightness) {
  const g = (l) => { const b = displayedByte(l, brightness); return `rgb(${b}, ${b}, ${Math.min(255, b + 2)})`; };
  return { faint: g(CALIBRATION.faint), clear: g(CALIBRATION.clear) };
}
