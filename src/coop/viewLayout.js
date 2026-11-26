// Where each local player's view goes on the screen (workstream D1, Long Night 2). Pure.
//
// One local player: today's full screen, exactly. Two: split, side by side ('vertical', the
// default: a vertical seam) or stacked ('horizontal': a horizontal seam). 'auto' picks side by side
// on a landscape screen and stacked on a portrait one. A merged single view when both players
// stand together is not done (design 4.4 does not need it).
//
// Every rect comes twice:
//   gl:  [x, y, w, h] fractions of the canvas, origin bottom-left (the ink pipeline's view.rect);
//   css: { left, top, width, height } in CSS pixels, origin top-left (the HUD panel over the view).
// The gutter between views is in CSS pixels and reads as a comic panel border (the ink pipeline
// clears the canvas to ink before drawing the views).
export const SPLIT_LAYOUTS = ['vertical', 'horizontal', 'auto'];
export const GUTTER_PX = 4;

export function splitOrientation(layout, width, height) {
  if (layout === 'horizontal') return 'horizontal';
  if (layout === 'vertical') return 'vertical';
  return width >= height ? 'vertical' : 'horizontal';
}

// count: local views (1 or 2). Returns [{ gl, css, aspect }] (one per view, slot order).
export function layoutViews(count, width, height, { layout = 'vertical', gutter = GUTTER_PX } = {}) {
  const W = Math.max(1, width), H = Math.max(1, height);
  if (count <= 1) return [{ gl: [0, 0, 1, 1], css: { left: 0, top: 0, width: W, height: H }, aspect: W / H }];
  const o = splitOrientation(layout, W, H);
  const out = [];
  if (o === 'vertical') {
    // Two columns: player 1 on the left, player 2 on the right.
    const w0 = Math.floor((W - gutter) / 2), w1 = W - gutter - w0;
    out.push(view(0, 0, w0, H, W, H));
    out.push(view(w0 + gutter, 0, w1, H, W, H));
  } else {
    // Two rows: player 1 on top, player 2 below.
    const h0 = Math.floor((H - gutter) / 2), h1 = H - gutter - h0;
    out.push(view(0, 0, W, h0, W, H));
    out.push(view(0, h0 + gutter, W, h1, W, H));
  }
  return out;
}

function view(left, top, width, height, W, H) {
  return {
    css: { left, top, width, height },
    // GL rect: y measured from the bottom.
    gl: [left / W, (H - top - height) / H, width / W, height / H],
    aspect: width / Math.max(1, height),
  };
}

// The FOV a split view uses: a half-width (8:9-ish) view keeps the full screen's horizontal field
// of view by widening the vertical one a little, capped so it never fish-eyes; a stacked
// (32:9-ish) view narrows it a little so heads are not cut off. Degrees.
export function splitFov(baseFov, aspect, fullAspect) {
  if (!(aspect > 0) || !(fullAspect > 0) || Math.abs(aspect - fullAspect) < 1e-6) return baseFov;
  const r = (d) => (d * Math.PI) / 180;
  // Horizontal FOV of the full-screen view, then the vertical FOV that gives `aspect` a share of it.
  const hFull = 2 * Math.atan(Math.tan(r(baseFov) / 2) * fullAspect);
  const share = aspect < fullAspect ? 0.78 : 1; // a narrow view keeps 78% of the full horizontal sweep
  const v = (2 * Math.atan(Math.tan((hFull * share) / 2) / aspect) * 180) / Math.PI;
  return Math.max(baseFov - 12, Math.min(baseFov + 14, v));
}

// Screen point of a world point already projected to NDC (x, y in -1..1, z > 1 behind), in the
// view's own CSS pixels (its HUD panel's coordinates). Writes `out`.
export function ndcToPanel(nx, ny, nz, css, out) {
  out.x = (nx * 0.5 + 0.5) * css.width;
  out.y = (-ny * 0.5 + 0.5) * css.height;
  out.behind = nz > 1;
  return out;
}
