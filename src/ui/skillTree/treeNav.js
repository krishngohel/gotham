// Pure geometry for the skill tree page: node sizes, spatial focus moves, zoom limits and the pan
// that brings a node into view. No DOM, so it is unit-tested.
export const NODE_W = 150;
export const NODE_H = 58;
export const COL_W = 176;
export const ROW_H = 70;
export const BAND_PAD = 34;
export const LABEL_W = 150;
export const ZOOM_MIN = 0.45;
export const ZOOM_MAX = 1.6;

export const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number.isFinite(z) ? z : 1));

// The best node to move to from `cur` in direction (dx, dy): it must lie that way (within a 60°
// cone either side), and among those the nearest, with sideways distance counting double so
// straight moves win.
export function nearestInDirection(cells, cur, dx, dy) {
  let best = null, bestScore = Infinity;
  for (const c of cells) {
    if (c === cur) continue;
    const vx = c.x - cur.x, vy = c.y - cur.y;
    const along = vx * dx + vy * dy;
    if (along <= 0) continue;
    const side = Math.abs(vx * dy - vy * dx);
    if (side > along * 1.8) continue;
    const score = along + side * 2;
    if (score < bestScore) { bestScore = score; best = c; }
  }
  return best;
}

// The pan that keeps a node box inside the view with a margin; unchanged when it already is.
export function panToShow(box, { panX, panY, zoom, w, h, margin = 40 }) {
  const left = box.x * zoom + panX, top = box.y * zoom + panY;
  const right = left + box.w * zoom, bottom = top + box.h * zoom;
  let px = panX, py = panY;
  if (left < margin) px += margin - left;
  else if (right > w - margin) px -= right - (w - margin);
  if (top < margin) py += margin - top;
  else if (bottom > h - margin) py -= bottom - (h - margin);
  return { panX: px, panY: py };
}
