// Inks the city map model (src/nav/cityMapData.js) onto a 2D canvas (workstream L2): paper land
// in district tints, halftoned water, inked building footprints, streets by class, the El. Used
// three ways: once into a cached static layer the minimap scrolls over, directly (vectors) by the
// full-screen city map at any zoom, and by the Progress page.
//
// T = { s, ox, oz }: world (x, z) -> canvas ((x - ox) * s, (z - oz) * s), north up.
import { CITY_TINT } from '../../nav/cityMapData.js';

export const INK = '#0b0b12', PAPER = '#efe6cf', VOID = '#191b24';
const WATER = { river: '#6f93a6', lake: '#7a9cb2', harbour: '#6f8fa6' };
const HC = { land: '#f4f4f4', water: '#1f4fa0', street: '#000000', building: '#9a9a9a', ink: '#000000', park: '#3f9a3f' };

// Street styles: [casing extra px, fill colour, min px width, dash].
export const STREET_STYLE = {
  highway: { fill: '#f2d24b', min: 2.4 },
  avenue: { fill: '#fbf6e8', min: 2.0 },
  street: { fill: '#efe6cf', min: 1.4 },
  alley: { fill: '#d9cfb6', min: 0.8 },
  bridge: { fill: '#fbf6e8', min: 1.8, ticks: true },
  ramp: { fill: '#e2d8bd', min: 1.4 },
  lower: { fill: '#8a8f9c', min: 1.4, dash: [3, 2] },
  path: { fill: '#b7ad94', min: 0.7, dash: [1.5, 1.5] },
};
const ORDER = ['path', 'lower', 'alley', 'street', 'ramp', 'avenue', 'bridge', 'highway'];

// Mixes two #rrggbb colours (k = share of b).
export function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

let dotPattern = null;
function halftone(g, color) {
  if (typeof document === 'undefined') return color;
  if (!dotPattern) {
    const c = document.createElement('canvas');
    c.width = c.height = 6;
    const q = c.getContext('2d');
    q.fillStyle = 'rgba(11,11,18,0.22)';
    q.beginPath(); q.arc(1.5, 1.5, 1.05, 0, Math.PI * 2); q.arc(4.5, 4.5, 1.05, 0, Math.PI * 2); q.fill();
    dotPattern = c;
  }
  return g.createPattern(dotPattern, 'repeat') ?? color;
}

// Draws the model with transform T. opts: { highContrast, streets: true, buildings: true,
// districts: true, el: true, view: { minX, maxX, minZ, maxZ } (cull) }.
export function drawCity(g, model, T, opts = {}) {
  const hc = !!opts.highContrast;
  const { s, ox, oz } = T;
  const X = (x) => (x - ox) * s, Z = (z) => (z - oz) * s;
  const v = opts.view ?? null;
  const vis = (minX, maxX, minZ, maxZ) => !v || (maxX >= v.minX && minX <= v.maxX && maxZ >= v.minZ && minZ <= v.maxZ);
  const b = model.bounds;
  g.save();
  // Off the map: void.
  g.fillStyle = VOID;
  g.fillRect(X(b.minX) - 4000, Z(b.minZ) - 4000, (b.maxX - b.minX) * s + 8000, (b.maxZ - b.minZ) * s + 8000);
  // Land: regions in paper, then district tints.
  g.fillStyle = hc ? HC.land : mix(CITY_TINT, PAPER, 0.35);
  for (const r of model.land) if (vis(r.minX, r.maxX, r.minZ, r.maxZ)) g.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * s, (r.maxZ - r.minZ) * s);
  if (opts.districts !== false && !hc) {
    for (const d of model.districts) {
      g.fillStyle = d.park ? '#a9cc94' : mix(d.tint, PAPER, 0.45);
      for (const r of d.rects) if (vis(r.minX, r.maxX, r.minZ, r.maxZ)) g.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * s + 0.5, (r.maxZ - r.minZ) * s + 0.5);
    }
  } else if (hc) {
    g.fillStyle = HC.park;
    for (const d of model.districts) if (d.park) for (const r of d.rects) g.fillRect(X(r.minX), Z(r.minZ), (r.maxX - r.minX) * s + 0.5, (r.maxZ - r.minZ) * s + 0.5);
  }
  // Water: flat colour, halftone dots, inked shore.
  for (const w of model.water) {
    if (!vis(w.minX, w.maxX, w.minZ, w.maxZ)) continue;
    g.fillStyle = hc ? HC.water : WATER[w.kind] ?? WATER.lake;
    g.fillRect(X(w.minX), Z(w.minZ), (w.maxX - w.minX) * s + 0.5, (w.maxZ - w.minZ) * s + 0.5);
  }
  if (!hc) {
    g.fillStyle = halftone(g, 'rgba(0,0,0,0)');
    for (const w of model.water) if (vis(w.minX, w.maxX, w.minZ, w.maxZ)) g.fillRect(X(w.minX), Z(w.minZ), (w.maxX - w.minX) * s + 0.5, (w.maxZ - w.minZ) * s + 0.5);
  }
  // Streets: inked casing first (all classes), then fills (narrow first, wide on top).
  if (opts.streets !== false) {
    g.lineCap = 'round';
    for (const pass of ['casing', 'fill']) {
      for (const cls of ORDER) {
        const st = STREET_STYLE[cls];
        g.beginPath();
        let any = false, wsum = 0, n = 0;
        for (const e of model.streets) {
          if (e.cls !== cls) continue;
          if (!vis(Math.min(e.x0, e.x1) - 20, Math.max(e.x0, e.x1) + 20, Math.min(e.z0, e.z1) - 20, Math.max(e.z0, e.z1) + 20)) continue;
          g.moveTo(X(e.x0), Z(e.z0)); g.lineTo(X(e.x1), Z(e.z1));
          any = true; wsum += e.width; n++;
        }
        if (!any) continue;
        const w = Math.max(st.min, (wsum / n) * s * 0.8);
        if (pass === 'casing') {
          g.setLineDash([]);
          g.strokeStyle = hc ? HC.ink : INK;
          g.lineWidth = w + (hc ? 1.6 : 1.1);
          if (cls !== 'path' && cls !== 'lower') g.stroke();
        } else {
          g.setLineDash(st.dash ? st.dash.map((k) => k * Math.max(1, w * 0.8)) : []);
          g.strokeStyle = hc ? (cls === 'lower' || cls === 'path' ? '#555' : '#ffffff') : st.fill;
          g.lineWidth = w;
          g.stroke();
        }
      }
    }
    g.setLineDash([]);
    // Bridge railings: ink ticks along both edges.
    g.strokeStyle = INK;
    g.lineWidth = Math.max(0.6, s * 0.6);
    for (const e of model.streets) {
      if (e.cls !== 'bridge') continue;
      const dx = e.x1 - e.x0, dz = e.z1 - e.z0, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L, o = e.width / 2 + 1;
      g.beginPath();
      for (const sg of [1, -1]) { g.moveTo(X(e.x0 + nx * o * sg), Z(e.z0 + nz * o * sg)); g.lineTo(X(e.x1 + nx * o * sg), Z(e.z1 + nz * o * sg)); }
      g.stroke();
    }
  }
  // Buildings: district-tinted footprints with an ink outline (landmark-tall ones heavier).
  if (opts.buildings !== false) {
    const tints = new Map(model.districts.map((d) => [d.id, d.tint]));
    g.lineWidth = Math.max(0.5, Math.min(1.4, s * 0.5));
    g.strokeStyle = hc ? HC.ink : INK;
    for (const f of model.buildings) {
      if (!vis(f.x - f.w / 2, f.x + f.w / 2, f.z - f.d / 2, f.z + f.d / 2)) continue;
      const base = tints.get(f.district) ?? CITY_TINT;
      g.fillStyle = hc ? HC.building : mix(base, INK, Math.min(0.5, 0.18 + f.h / 400));
      const x = X(f.x - f.w / 2), z = Z(f.z - f.d / 2), w = f.w * s, d = f.d * s;
      g.fillRect(x, z, w, d);
      if (w > 2.2) g.strokeRect(x, z, w, d);
    }
  }
  // The El: a dark red line with ties.
  if (opts.el !== false && model.el) {
    for (const tr of model.el.tracks) {
      g.beginPath();
      tr.forEach((p, i) => (i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))));
      g.strokeStyle = INK; g.lineWidth = Math.max(2.2, s * 5.5); g.stroke();
      g.strokeStyle = hc ? '#d00000' : '#a8323a'; g.lineWidth = Math.max(1.2, s * 3.6); g.stroke();
      g.setLineDash([Math.max(1, s * 1.2), Math.max(2, s * 4)]);
      g.strokeStyle = '#f2e3c6'; g.lineWidth = Math.max(0.6, s * 1.4); g.stroke();
      g.setLineDash([]);
    }
  }
  g.restore();
}

// The cached static layer: the whole city at `pxPerM` (about 4 to 15 MB of canvas; 1 px/m on
// the lowest tier). Built once; rebuilt only for the high-contrast option.
export function createStaticLayer(model, { pxPerM = 1.5, highContrast = false, maxSide = 4096 } = {}) {
  const b = model.bounds;
  const W = b.maxX - b.minX, H = b.maxZ - b.minZ;
  const s = Math.min(pxPerM, maxSide / W, maxSide / H);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(W * s);
  canvas.height = Math.ceil(H * s);
  drawCity(canvas.getContext('2d'), model, { s, ox: b.minX, oz: b.minZ }, { highContrast });
  return { canvas, s, ox: b.minX, oz: b.minZ, highContrast };
}

// Icons drawn upright at a fixed size (the minimap and the city map call this per icon).
export function drawIcon(g, icon, x, y, r = 6, color = '#f2d24b') {
  g.save();
  g.translate(x, y);
  g.lineWidth = Math.max(1.2, r * 0.28);
  g.strokeStyle = INK;
  g.fillStyle = color;
  g.beginPath();
  switch (icon) {
    case 'star': {
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, k = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
      g.closePath(); break;
    }
    case 'eye': g.ellipse(0, 0, r, r * 0.6, 0, 0, Math.PI * 2); break;
    case 'roof': g.moveTo(-r, r * 0.6); g.lineTo(0, -r * 0.8); g.lineTo(r, r * 0.6); g.closePath(); break;
    case 'riddle': g.arc(0, 0, r * 0.85, 0, Math.PI * 2); break;
    case 'crime': g.moveTo(0, -r); g.lineTo(r, r * 0.8); g.lineTo(-r, r * 0.8); g.closePath(); break;
    case 'el': g.arc(0, 0, r * 0.85, 0, Math.PI * 2); break;
    case 'batwing': case 'bat': { const k = r / 10; g.moveTo(-10 * k, -2 * k); g.lineTo(-4 * k, 1 * k); g.lineTo(0, -4 * k); g.lineTo(4 * k, 1 * k); g.lineTo(10 * k, -2 * k); g.lineTo(6 * k, 5 * k); g.lineTo(0, 2 * k); g.lineTo(-6 * k, 5 * k); g.closePath(); break; }
    case 'batcave': g.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); break;
    case 'car': g.moveTo(-r, r * 0.5); g.lineTo(-r * 0.7, -r * 0.3); g.lineTo(-r * 0.3, -r * 0.7); g.lineTo(r * 0.3, -r * 0.7); g.lineTo(r * 0.7, -r * 0.3); g.lineTo(r, r * 0.5); g.closePath(); break;
    case 'door': g.rect(-r * 0.5, -r * 0.8, r, r * 1.6); break;
    case 'anchor': g.arc(0, 0, r * 0.7, 0, Math.PI * 2); break;
    case 'fist': g.rect(-r * 0.7, -r * 0.6, r * 1.4, r * 1.2); break;
    case 'gargoyle': g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0); g.closePath(); break;
    case 'diamond': g.moveTo(0, -r); g.lineTo(r, 0); g.lineTo(0, r); g.lineTo(-r, 0); g.closePath(); break;
    case 'bridgeUp': g.moveTo(-r, r * 0.6); g.lineTo(-r * 0.2, -r); g.lineTo(r * 0.2, -r); g.lineTo(r, r * 0.6); g.closePath(); break;
    default: g.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  }
  g.fill();
  g.stroke();
  if (icon === 'riddle') { g.fillStyle = INK; g.font = `bold ${Math.round(r * 1.3)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 0, r * 0.08); }
  if (icon === 'el') { g.fillStyle = INK; g.font = `bold ${Math.round(r * 0.95)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('EL', 0, r * 0.05); }
  if (icon === 'batcave') { g.fillStyle = INK; g.font = `bold ${Math.round(r * 1.1)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B', 0, r * 0.08); }
  g.restore();
}

// A player arrow: tip toward heading yaw (radians, world: forward = (sin yaw, cos yaw)), screen
// rotation `rot` already applied by the caller's transform if any.
export function drawArrow(g, x, y, angle, r, fill, outline = INK) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, -r); g.lineTo(r * 0.72, r * 0.8); g.lineTo(0, r * 0.38); g.lineTo(-r * 0.72, r * 0.8); g.closePath();
  g.fillStyle = fill; g.fill();
  g.lineWidth = Math.max(1.5, r * 0.22); g.strokeStyle = outline; g.stroke();
  g.restore();
}
