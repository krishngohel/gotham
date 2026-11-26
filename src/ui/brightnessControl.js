// [light] The Brightness row for the settings menu (Video and Accessibility tabs): the slider
// and a calibration tile. The tile is plain DOM, tinted by the same curve the ink pass applies to
// the game (src/render/brightness.js), so it answers the slider with or without a run behind it.
import { BRIGHTNESS, calibrationShades } from '../render/brightness.js';

// A bat on black, twice: the left one should be barely visible, the right one easy to see.
const BAT = 'M2 13 L11 8 L14 11 L19 6 L20.5 1 L22 5 L24 5 L25.5 1 L27 6 L32 11 L35 8 L44 13 L38 18 L35 16 L30 20 L23 29 L16 20 L11 16 L8 18 Z';
const tile = (cls) => `<svg class="${cls}" viewBox="0 0 46 30" aria-hidden="true"><path d="${BAT}" fill="currentColor"/></svg>`;

// h: the settings menu's own helpers ({ el, slider }); settings: the live settings object.
export function buildBrightnessControl(body, settings, h) {
  const calib = h.el('div', 'bright-calib', `<div class="bright-tile">${tile('faint')}${tile('clear')}</div>`);
  const text = h.el('p', 'note', 'Move the slider until the left bat is barely visible and the right one is easy to see. Night stays night; this only decides how much you can read in the shadows on your screen.');
  calib.appendChild(text);
  const paint = (v) => {
    const s = calibrationShades(v);
    calib.querySelector('.faint').style.color = s.faint;
    calib.querySelector('.clear').style.color = s.clear;
  };
  paint(settings.brightness);
  body.appendChild(h.slider('Brightness', settings.brightness, BRIGHTNESS.min, BRIGHTNESS.max, BRIGHTNESS.step, (v) => { settings.brightness = v; paint(v); }, (v) => `${Math.round(v * 100)}%`));
  body.appendChild(calib);
}
