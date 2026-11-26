// The minimap (workstream L2): one per local player's HUD panel. A round comic panel in the top
// left: the cached city layer scrolled (and turned, when the map rotates with you) under the
// player's arrow, fog of war, the GPS route, waypoints, the partner, the objective, live crimes,
// El trains, raised bridges and detected enemies; markers past the rim clamp to it with an
// up/down chevron when they are on another level. Inside a room with a floor plan it shows the
// plan instead. Redraws at most `hz` times a second (the static layer is never redrawn).
import { drawIcon, drawArrow, INK, PAPER, VOID } from './mapPainter.js';
import { worldToMinimap, clampToRim, heightCue } from '../../nav/minimapRules.js';
import { WAYPOINT_COLORS } from '../../nav/waypoints.js';

const tmp = { x: 0, y: 0 }, rim = { x: 0, y: 0, edge: false };

let styled = false;
function ensureStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  st.textContent = `
.minimap { position: absolute; left: 16px; top: 16px; pointer-events: none; z-index: 3; filter: drop-shadow(4px 4px 0 #0b0b12); }
.minimap canvas { display: block; border-radius: 50%; }
.minimap .mm-district { position: absolute; left: 50%; top: 100%; transform: translate(-50%, -6px) rotate(-2deg); white-space: nowrap; padding: 0 8px;
  font: calc(17px * var(--a11y-text, 1))/1.25 'Bangers', cursive; letter-spacing: 1px; color: #0b0b12; background: var(--mm-tint, #efe6cf); border: 2px solid #0b0b12; }
.minimap .mm-extra:not(:empty) { margin-left: 6px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; }
.hud.split .minimap { left: 10px; top: 10px; }
.waypoint.wp-tinted .wp-diamond path:first-child, .waypoint.wp-tinted .wp-arrow path { fill: var(--wp-color); }
.waypoint.wp-custom .wp-diamond { transform: scale(0.8); }
`;
  document.head.appendChild(st);
}

export function createMinimap(hudEl, { hz = 20 } = {}) {
  ensureStyles();
  const el = document.createElement('div');
  el.className = 'minimap';
  el.innerHTML = '<canvas></canvas><div class="mm-district"><span class="mm-name"></span><span class="mm-extra"></span></div>';
  hudEl.appendChild(el);
  const canvas = el.querySelector('canvas');
  const g = canvas.getContext('2d');
  const nameEl = el.querySelector('.mm-name'), extraEl = el.querySelector('.mm-extra');
  let size = 0, dpr = 1, lastDraw = -1, lastName = null, lastExtra = null, lastTint = null;
  const period = 1 / Math.max(1, hz);

  function fit(px) {
    const d = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
    if (px === size && d === dpr) return;
    size = px; dpr = d;
    el.style.width = `${px}px`; el.style.height = `${px}px`;
    canvas.width = Math.round(px * d); canvas.height = Math.round(px * d);
    canvas.style.width = `${px}px`; canvas.style.height = `${px}px`;
    lastDraw = -1;
  }

  // Map pixel offset (rotated) of a world point relative to the player.
  const at = (f, x, z) => worldToMinimap(x, z, f.x, f.z, f.radius, f.R, f.rot, tmp);

  function marker(f, x, y, z, icon, color, r, { clamp = true, cue = true } = {}) {
    at(f, x, z);
    const C = f.R;
    clampToRim(tmp.x, tmp.y, C - r - 2, rim);
    if (rim.edge && !clamp) return;
    drawIcon(g, icon, C + rim.x, C + rim.y, rim.edge ? r * 0.85 : r, color);
    if (cue) {
      const c = heightCue(y - f.y);
      if (c) {
        g.save();
        g.translate(C + rim.x + r * 0.9, C + rim.y - r * 0.9);
        g.beginPath();
        if (c === 'up') { g.moveTo(-3.5, 2); g.lineTo(0, -2.5); g.lineTo(3.5, 2); } else { g.moveTo(-3.5, -2); g.lineTo(0, 2.5); g.lineTo(3.5, -2); }
        g.lineWidth = 3.4; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 1.8; g.strokeStyle = PAPER; g.stroke();
        g.restore();
      }
    }
  }

  function drawPlan(f, plan) {
    const C = f.R;
    g.fillStyle = '#20232e';
    g.fillRect(0, 0, 2 * C, 2 * C);
    g.save();
    g.translate(C, C);
    g.rotate(f.rot);
    const k = f.R / Math.max(20, f.planRadius ?? 30);
    g.scale(k, k);
    g.translate(-f.x, -f.z);
    for (const s of plan.shapes) {
      g.beginPath();
      if (s.rect) g.rect(s.rect.minX, s.rect.minZ, s.rect.maxX - s.rect.minX, s.rect.maxZ - s.rect.minZ);
      else if (s.points) s.points.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
      if (s.kind === 'floor') { g.fillStyle = '#d9cfb6'; g.fill(); }
      else if (s.kind === 'water') { g.fillStyle = '#6f93a6'; g.fill(); }
      else if (s.kind === 'stairs') { g.fillStyle = '#a49a82'; g.fill(); }
      else if (s.kind === 'door') { g.fillStyle = '#f2d24b'; g.fill(); }
      else if (s.kind === 'wall') { g.lineWidth = 1.6 / k * 1.6; g.strokeStyle = INK; g.stroke(); }
    }
    g.restore();
    g.font = `bold ${Math.round(f.R * 0.13)}px 'Bangers', sans-serif`;
    g.textAlign = 'center';
    for (const s of plan.shapes) {
      if (s.kind !== 'label') continue;
      at(f, s.x, s.z);
      g.fillStyle = INK;
      g.fillText(s.text, C + tmp.x, C + tmp.y);
    }
  }

  function draw(f) {
    const C = f.R;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, 2 * C, 2 * C);
    g.save();
    g.beginPath(); g.arc(C, C, C - 2, 0, Math.PI * 2); g.clip();
    if (f.plan) drawPlan(f, f.plan);
    else {
      g.fillStyle = VOID; g.fillRect(0, 0, 2 * C, 2 * C);
      // The static layer: only the part around the player, scaled and turned into place.
      const L = f.layer, k = C / f.radius, span = f.radius * 1.45;
      g.save();
      g.translate(C, C);
      g.rotate(f.rot);
      const sx = Math.max(0, (f.x - span - L.ox) * L.s), sy = Math.max(0, (f.z - span - L.oz) * L.s);
      const sw = Math.min(L.canvas.width - sx, span * 2 * L.s), sh = Math.min(L.canvas.height - sy, span * 2 * L.s);
      if (sw > 1 && sh > 1) g.drawImage(L.canvas, sx, sy, sw, sh, (sx / L.s + L.ox - f.x) * k, (sy / L.s + L.oz - f.z) * k, (sw / L.s) * k, (sh / L.s) * k);
      // Fog of war (one pixel per discovery cell, smoothed).
      if (f.fog) {
        const F = f.fog, c = F.cell;
        const fx = Math.max(0, Math.floor((f.x - span - F.ox) / c)), fz = Math.max(0, Math.floor((f.z - span - F.oz) / c));
        const fw = Math.min(F.canvas.width - fx, Math.ceil((span * 2) / c) + 2), fh = Math.min(F.canvas.height - fz, Math.ceil((span * 2) / c) + 2);
        if (fw > 0 && fh > 0) g.drawImage(F.canvas, fx, fz, fw, fh, (fx * c + F.ox - f.x) * k, (fz * c + F.oz - f.z) * k, fw * c * k, fh * c * k);
      }
      // Breadcrumbs.
      if (f.crumbs) {
        g.fillStyle = 'rgba(11,11,18,0.55)';
        f.crumbs((x, z, age) => { const dx = (x - f.x) * k, dz = (z - f.z) * k; if (dx * dx + dz * dz < C * C * 2) { g.globalAlpha = 0.25 + 0.6 * (1 - age); g.fillRect(dx - 1.3, dz - 1.3, 2.6, 2.6); } });
        g.globalAlpha = 1;
      }
      // Routes: the partner's faint, then this player's.
      for (const rt of f.routes) {
        if (!rt.pts) continue;
        g.beginPath();
        let started = false;
        for (let i = Math.max(0, rt.from); i < rt.pts.length; i++) {
          const p = rt.pts[i];
          const dx = (p.x - f.x) * k, dz = (p.z - f.z) * k;
          if (!started) { g.moveTo(dx, dz); started = true; } else g.lineTo(dx, dz);
        }
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.globalAlpha = rt.own ? 1 : 0.45;
        g.strokeStyle = INK; g.lineWidth = rt.own ? 6 : 4; g.stroke();
        g.strokeStyle = rt.color; g.lineWidth = rt.own ? 3.4 : 2.2; g.stroke();
        g.globalAlpha = 1;
      }
      g.restore();
    }
    // ---- live layers (upright icons) ----
    if (!f.plan) {
      // El trains: small red dots with an ink ring.
      for (const t of f.trains) {
        if (!t.visible && t.speed === 0 && !f.showAllTrains) continue;
        at(f, t.x, t.z);
        if (tmp.x * tmp.x + tmp.y * tmp.y > (C - 4) ** 2) continue;
        g.beginPath(); g.arc(C + tmp.x, C + tmp.y, 3.2, 0, Math.PI * 2);
        g.fillStyle = '#ff5a4f'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
      }
      // Raised bridges.
      for (const b of f.bridges) if (b.up) marker(f, b.x, 0, b.z, 'bridgeUp', '#ff9f43', 6, { clamp: false, cue: false });
      // Landmarks and fast-travel points in revealed ground, no clamping.
      for (const ic of f.icons) marker(f, ic.x, ic.y, ic.z, ic.icon, ic.color, ic.r ?? 5, { clamp: false, cue: false });
      // Crimes and side content: clamp to the rim (they call you).
      for (const c of f.crimes) marker(f, c.x, c.y ?? 0, c.z, 'crime', '#ff4f4f', 6, { clamp: true });
      for (const e of f.enemies) { at(f, e.x, e.z); if (tmp.x * tmp.x + tmp.y * tmp.y < (C - 4) ** 2) { g.beginPath(); g.arc(C + tmp.x, C + tmp.y, 2.6, 0, Math.PI * 2); g.fillStyle = '#ff2d2d'; g.fill(); g.lineWidth = 1; g.strokeStyle = INK; g.stroke(); } }
      for (const m of f.tracked) marker(f, m.x, m.y, m.z, 'diamond', '#58e0ff', 5.5);
      for (const p of f.pings) marker(f, p.x, p.y, p.z, 'diamond', p.color, 5);
      if (f.layers) for (let i = 0; i < f.layers.length; i++) f.layers[i](g, f, at); // [wanted] extra layers (nav.addMinimapLayer)
    }
    // Waypoints and the objective always show (clamped), plan or not.
    for (const m of f.marks) marker(f, m.x, m.y, m.z, 'diamond', WAYPOINT_COLORS[m.c] ?? WAYPOINT_COLORS[0], m.own ? 7 : 5.5);
    if (f.objective) marker(f, f.objective.x, f.objective.y, f.objective.z, 'star', '#f2d24b', 8);
    // Partner arrow, then this player's arrow in the middle.
    if (f.partner) {
      at(f, f.partner.x, f.partner.z);
      clampToRim(tmp.x, tmp.y, C - 9, rim);
      drawArrow(g, C + rim.x, C + rim.y, Math.PI - f.partner.yaw + f.rot, 6.5, f.partner.color);
    }
    drawArrow(g, C, C, Math.PI - f.yaw + f.rot, 8, f.color);
    g.restore();
    // Rim: ink ring, district tint band, and north.
    g.beginPath(); g.arc(C, C, C - 4, 0, Math.PI * 2);
    g.lineWidth = 5; g.strokeStyle = f.tint ?? PAPER; g.stroke();
    g.beginPath(); g.arc(C, C, C - 1.5, 0, Math.PI * 2);
    g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
    const na = -Math.PI / 2 + f.rot; // north (-z) on screen
    const nx = C + Math.cos(na) * (C - 5), ny = C + Math.sin(na) * (C - 5);
    g.beginPath(); g.arc(nx, ny, 7, 0, Math.PI * 2); g.fillStyle = INK; g.fill();
    g.fillStyle = PAPER; g.font = "bold 10px 'Barlow Condensed', sans-serif"; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + 0.5);
  }

  return {
    el,
    // f: the frame from src/nav/navSystem.js. px: the panel size. now: seconds (real time).
    update(f, px, now, force = false) {
      if (!f) { el.style.display = 'none'; return; }
      el.style.display = '';
      fit(px);
      if (!force && lastDraw >= 0 && now - lastDraw < period) return;
      lastDraw = now;
      f.R = px / 2;
      draw(f);
      if (f.name !== lastName) { lastName = f.name; nameEl.textContent = f.name ?? ''; }
      if (f.extra !== lastExtra) { lastExtra = f.extra; extraEl.textContent = f.extra ?? ''; }
      if (f.tint !== lastTint) { lastTint = f.tint; el.style.setProperty('--mm-tint', f.tint ?? PAPER); }
    },
    hide() { el.style.display = 'none'; },
    get drawn() { return lastDraw; },
    destroy() { el.remove(); },
  };
}
