// Each district is "coloured" by a different colourist: six swatches, blended by where the
// camera is. snapColor mirrors the ink shader's snap so it can be tested.
// Swatches and centres are data on each district of the region list (src/world/regions/data.js),
// keyed by palette key (the clock district's has always been 'cathedral').
import { DISTRICTS } from '../world/regions/data.js';

export const DISTRICT_PALETTES = Object.fromEntries(DISTRICTS.filter((d) => d.palette).map((d) => [d.palette.key, d.palette.swatches]));
export const DISTRICT_CENTERS = Object.fromEntries(DISTRICTS.filter((d) => d.palette).map((d) => [d.palette.key, d.palette.center]));

const toRgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const RGB = Object.fromEntries(Object.entries(DISTRICT_PALETTES).map(([k, v]) => [k, v.map(toRgb)]));

export function paletteAt(x, z, out = new Array(18).fill(0)) {
  let wsum = 0;
  out.fill(0);
  for (const [id, c] of Object.entries(DISTRICT_CENTERS)) {
    const d2 = (x - c.x) ** 2 + (z - c.z) ** 2;
    const w = 1 / (d2 + 400) ** 1.5; // sharp near a center, smooth between
    wsum += w;
    RGB[id].forEach((s, i) => { out[i * 3] += s[0] * w; out[i * 3 + 1] += s[1] * w; out[i * 3 + 2] += s[2] * w; });
  }
  for (let i = 0; i < 18; i++) out[i] /= wsum;
  return out;
}

const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

// Same maths as snapPalette() in the ink shader: compare chroma (colour / luminance), take
// the nearest swatch's chroma, keep the pixel's luminance.
export function snapColor(c, pal, amount) {
  const L = luma(c[0], c[1], c[2]);
  if (amount <= 0 || L < 0.02) return c;
  const cn = c.map((v) => v / Math.max(L, 1e-3));
  let best = null, bd = Infinity;
  for (let i = 0; i < 6; i++) {
    const p = [pal[i * 3], pal[i * 3 + 1], pal[i * 3 + 2]];
    const pl = Math.max(luma(p[0], p[1], p[2]), 1e-3);
    const pn = p.map((v) => v / pl);
    const d = (cn[0] - pn[0]) ** 2 + (cn[1] - pn[1]) ** 2 + (cn[2] - pn[2]) ** 2;
    if (d < bd) { bd = d; best = pn; }
  }
  const k = amount * Math.min(1, Math.max(0, (L - 0.02) / 0.06));
  return c.map((v, i) => v + (best[i] * L - v) * k);
}
