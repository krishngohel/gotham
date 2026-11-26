// Export size rules for photo mode (workstream L1, item 7). Pure.
//
// The picture keeps the photographer's view aspect. Presets name the long side; the result is
// clamped by the quality tier's cap (flags only), the GPU's render-buffer limit and a floor.

export const EXPORT_PRESETS = ['screen', '1080', '1440', '4k'];
export const EXPORT_LABEL = { screen: 'Screen', '1080': 'HD 1080', '1440': 'QHD 1440', '4k': '4K' };
const LONG = { '1080': 1920, '1440': 2560, '4k': 3840 };
export const EXPORT_MAX = 3840;
export const EXPORT_MIN = 320;

// The largest long side a tier may export: 8-bit colour tiers (potato, low) stop at 1920, the
// rest at 4K. `quality.photoExportMax` overrides (a bench or a test).
export function exportCap(quality = {}) {
  if (Number.isFinite(quality.photoExportMax)) return Math.max(EXPORT_MIN, Math.min(EXPORT_MAX, quality.photoExportMax));
  return quality.colorTarget === 'u8' ? 1920 : EXPORT_MAX;
}

// viewW/viewH: the view's drawing-buffer size (px). glMax: min(MAX_RENDERBUFFER_SIZE,
// MAX_TEXTURE_SIZE, MAX_VIEWPORT_DIMS). Returns integer { w, h, long, clamped }.
export function exportSize({ preset = 'screen', viewW, viewH, cap = EXPORT_MAX, glMax = 4096 } = {}) {
  const vw = Math.max(1, Math.round(viewW || 1)), vh = Math.max(1, Math.round(viewH || 1));
  const aspect = vw / vh;
  const want = preset === 'screen' || !LONG[preset] ? Math.max(vw, vh) : LONG[preset];
  const limit = Math.max(EXPORT_MIN, Math.min(cap, glMax, EXPORT_MAX));
  const long = Math.max(EXPORT_MIN, Math.min(want, limit));
  let w, h;
  if (aspect >= 1) { w = long; h = Math.max(1, Math.round(long / aspect)); } else { h = long; w = Math.max(1, Math.round(long * aspect)); }
  // The short side may not pass the GPU limit either (a very tall or very wide view).
  if (h > glMax) { const k = glMax / h; h = glMax; w = Math.max(1, Math.round(w * k)); }
  if (w > glMax) { const k = glMax / w; w = glMax; h = Math.max(1, Math.round(h * k)); }
  return { w, h, long: Math.max(w, h), clamped: long < want };
}

// A pixel ratio and CSS size whose drawing buffer three.js floors to exactly w x h
// (setSize floors width * pixelRatio; the quarter pixel keeps float error on the right side).
export function bufferFor(w, h, cssW) {
  const pr = (w + 0.25) / Math.max(1, cssW);
  return { pixelRatio: pr, cssW: (w + 0.25) / pr, cssH: (h + 0.25) / pr };
}

// Thumbnail size for the gallery: long side `max`, aspect kept.
export function thumbSize(w, h, max = 320) {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
