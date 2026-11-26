// The full-screen city map (workstream L2): pan and zoom the whole city, filter layers, read a
// district's details, place and remove coloured waypoints (several, per player), mark a target
// for the partner, pick a fast-travel point and go, and set a route to a mission or crime from
// the list. Keyboard, mouse and gamepad. Opened from the pause menu, the map key (M) and the UI
// station 'cityMap' (src/ui/stations.js) the Batcave's computer calls.
//
// nav (src/nav/navSystem.js) supplies the data and does the work; this file is only the screen.
import { drawCity, drawIcon, drawArrow, INK, PAPER } from '../minimap/mapPainter.js';
import { WAYPOINT_COLORS } from '../../nav/waypoints.js';

const FILTERS = [
  ['waypoints', 'Waypoints'], ['travel', 'Fast travel'], ['missions', 'Missions & crimes'],
  ['landmarks', 'Landmarks'], ['el', 'The El'], ['fog', 'Unexplored'],
];

let styled = false;
function ensureStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  st.textContent = `
.city-map { position: fixed; inset: 0; z-index: 40; display: none; background: #191b24; font-family: 'Barlow Condensed', sans-serif; color: #0b0b12; user-select: none; }
.city-map.show { display: block; }
.city-map canvas.cm-canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; }
.cm-side { position: absolute; top: 16px; right: 16px; bottom: 16px; width: min(320px, 34vw); display: flex; flex-direction: column; gap: 10px; overflow: auto; pointer-events: auto; }
.cm-box { background: #efe6cf; border: 3px solid #0b0b12; box-shadow: 4px 4px 0 #0b0b12; padding: 8px 10px; }
.cm-box h3 { margin: 0 0 4px; font: calc(22px * var(--a11y-text, 1)) 'Bangers', cursive; letter-spacing: 1px; }
.cm-title { font: calc(34px * var(--a11y-text, 1)) 'Bangers', cursive; letter-spacing: 2px; transform: rotate(-1.5deg); background: #f2d24b; }
.cm-filters label { display: inline-flex; align-items: center; gap: 4px; margin: 2px 10px 2px 0; font-size: calc(16px * var(--a11y-text, 1)); cursor: pointer; }
.cm-district .cm-line { font-size: calc(16px * var(--a11y-text, 1)); line-height: 1.25; }
.cm-list { max-height: 30vh; overflow: auto; }
.cm-item { display: flex; justify-content: space-between; align-items: center; gap: 6px; font-size: calc(16px * var(--a11y-text, 1)); padding: 2px 0; border-bottom: 1px dashed rgba(11,11,18,0.3); }
.cm-item button, .cm-box button { font: calc(15px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; font-weight: 700; background: #0b0b12; color: #efe6cf; border: 0; padding: 2px 8px; cursor: pointer; }
.cm-item button:disabled, .cm-box button:disabled { opacity: 0.4; cursor: default; }
.cm-item button:focus, .cm-box button:focus { outline: 3px solid #f2d24b; }
.cm-swatches { display: flex; gap: 6px; margin-top: 4px; }
.cm-swatch { width: 22px; height: 22px; border: 2px solid #0b0b12; cursor: pointer; }
.cm-swatch.on { outline: 3px solid #0b0b12; outline-offset: 2px; }
.cm-help { position: absolute; left: 16px; bottom: 14px; right: min(360px, 37vw); background: rgba(239,230,207,0.94); border: 3px solid #0b0b12; padding: 4px 10px; font-size: calc(16px * var(--a11y-text, 1)); box-shadow: 4px 4px 0 #0b0b12; }
.cm-toast { position: absolute; left: 50%; top: 18px; transform: translateX(-50%) rotate(-1deg); background: #f2d24b; border: 3px solid #0b0b12; padding: 4px 14px; font: calc(22px * var(--a11y-text, 1)) 'Bangers', cursive; box-shadow: 4px 4px 0 #0b0b12; display: none; }
.cm-toast.show { display: block; }
.city-map.hc .cm-box { background: #fff; }
`;
  document.head.appendChild(st);
}

export function createCityMap({ root = document.body, nav }) {
  ensureStyles();
  const el = document.createElement('div');
  el.className = 'city-map';
  el.innerHTML = `
    <canvas class="cm-canvas"></canvas>
    <div class="cm-toast"></div>
    <div class="cm-side">
      <div class="cm-box cm-title">GOTHAM CITY</div>
      <div class="cm-box cm-filters"><h3>Show</h3>${FILTERS.map(([id, label]) => `<label><input type="checkbox" data-f="${id}" checked> ${label}</label>`).join('')}
        <div class="cm-swatches">${WAYPOINT_COLORS.map((c, i) => `<div class="cm-swatch" data-c="${i}" style="background:${c}" title="Waypoint colour ${i + 1}"></div>`).join('')}</div></div>
      <div class="cm-box cm-district"><h3>District</h3><div class="cm-dbody"></div></div>
      <div class="cm-box cm-travel"><h3>Fast travel</h3><div class="cm-tbody"></div></div>
      <div class="cm-box cm-missions"><h3>Missions &amp; crimes</h3><div class="cm-list"></div></div>
    </div>
    <div class="cm-help"></div>`;
  root.appendChild(el);
  const canvas = el.querySelector('canvas');
  const g = canvas.getContext('2d');
  const toastEl = el.querySelector('.cm-toast');
  const dBody = el.querySelector('.cm-dbody'), tBody = el.querySelector('.cm-tbody'), listEl = el.querySelector('.cm-list');
  const helpEl = el.querySelector('.cm-help');
  const filters = Object.fromEntries(FILTERS.map(([id]) => [id, true]));
  for (const box of el.querySelectorAll('.cm-filters input')) box.addEventListener('change', () => { filters[box.dataset.f] = box.checked; dirty = true; });
  for (const sw of el.querySelectorAll('.cm-swatch')) sw.addEventListener('click', () => { color = Number(sw.dataset.c); paintSwatches(); });

  const view = { cx: 0, cz: -200, s: 0.6 };
  const cursor = { x: 0, z: 0, sx: 0, sy: 0 };
  let open = false, player = null, dirty = true, raf = 0, color = 0, selected = null, onClose = null, toastT = 0, lastDistrict = null;
  let drag = null;
  const pads = new Map(); // pad index -> previous buttons
  let W = 1, H = 1, dpr = 1;

  function paintSwatches() { for (const sw of el.querySelectorAll('.cm-swatch')) sw.classList.toggle('on', Number(sw.dataset.c) === color); }
  function toast(text) { toastEl.textContent = text; toastEl.classList.add('show'); toastT = 2.2; }
  const toWorld = (sx, sy) => ({ x: view.cx + (sx - W / 2) / view.s, z: view.cz + (sy - H / 2) / view.s });
  const toScreen = (x, z) => ({ x: W / 2 + (x - view.cx) * view.s, y: H / 2 + (z - view.cz) * view.s });
  function clampView() {
    const b = nav.model.bounds;
    view.s = Math.max(0.25, Math.min(6, view.s));
    view.cx = Math.max(b.minX, Math.min(b.maxX, view.cx));
    view.cz = Math.max(b.minZ, Math.min(b.maxZ, view.cz));
  }
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = el.clientWidth || innerWidth; H = el.clientHeight || innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    dirty = true;
  }

  // ---- what is under the cursor ----
  function nearest(sx, sy, r = 16) {
    let best = null, bd = r * r;
    const consider = (kind, item, x, z) => { const p = toScreen(x, z); const d = (p.x - sx) ** 2 + (p.y - sy) ** 2; if (d < bd) { bd = d; best = { kind, item }; } };
    if (filters.travel) for (const p of nav.fastTravel.points) if (nav.fastTravel.isUnlocked(p.id)) consider('travel', p, p.x, p.z);
    if (filters.waypoints) for (const m of nav.waypoints.marksOf(player.id)) consider('mark', m, m.x, m.z);
    if (filters.missions) for (const t of nav.listTargets()) consider('target', t, t.x, t.z);
    return best;
  }

  // ---- actions ----
  function place(x, z, { forPartner = false } = {}) {
    const hit = nearest(toScreen(x, z).x, toScreen(x, z).y, 14);
    if (hit?.kind === 'travel') { select(hit.item); return; }
    if (hit?.kind === 'target') { nav.setRoute(player, hit.item); toast(`Route set: ${hit.item.label}`); dirty = true; return; }
    const m = nav.placeWaypoint(player, { x, z }, { color, forPartner });
    if (m) toast(forPartner ? 'Marked for your partner' : 'Waypoint set');
    dirty = true; refreshPanels();
  }
  function remove(x, z) {
    const p = toScreen(x, z);
    const hit = nearest(p.x, p.y, 18);
    const m = hit?.kind === 'mark' ? hit.item : null;
    if (m && nav.removeWaypoint(player, m.id)) { toast('Waypoint removed'); dirty = true; refreshPanels(); }
  }
  function select(point) { selected = point; refreshPanels(); dirty = true; }
  function travel() {
    if (!selected) return;
    const r = nav.travel(player, selected.id);
    if (!r.ok) { toast(r.reason ?? 'Not now.'); return; }
    close();
  }

  // ---- panels ----
  function refreshPanels() {
    // District under the cursor.
    const d = nav.districtInfo(cursor.x, cursor.z);
    lastDistrict = d?.id ?? null;
    dBody.innerHTML = d ? d.lines.map((l) => `<div class="cm-line">${l}</div>`).join('') : '<div class="cm-line">Open water.</div>';
    // Fast travel.
    const can = nav.canFastTravel(player);
    const pts = nav.fastTravel.points.filter((p) => nav.fastTravel.isUnlocked(p.id));
    tBody.innerHTML = `${selected ? `<div class="cm-line"><b>${selected.label}</b> (${selected.kind === 'el' ? 'El station' : selected.kind === 'batwing' ? 'Batwing drop' : 'Batcave entrance'})</div>
      <button class="cm-go" ${can.ok ? '' : 'disabled'}>Travel</button> ${can.ok ? '' : `<span class="cm-line">${can.reason}</span>`}` : '<div class="cm-line">Pick a point on the map.</div>'}
      <div class="cm-line">${pts.length} of ${nav.fastTravel.points.length} points unlocked.</div>
      ${pts.map((p) => `<div class="cm-item"><span>${p.label}</span><button data-ft="${p.id}">Select</button></div>`).join('')}`;
    tBody.querySelector('.cm-go')?.addEventListener('click', travel);
    for (const b of tBody.querySelectorAll('[data-ft]')) b.addEventListener('click', () => { const p = nav.fastTravel.points.find((q) => q.id === b.dataset.ft); select(p); view.cx = p.x; view.cz = p.z; dirty = true; });
    // Missions and crimes.
    const list = nav.listTargets();
    listEl.innerHTML = list.length ? list.map((t, i) => `<div class="cm-item"><span>${t.label}</span><button data-t="${i}">Set route</button></div>`).join('') : '<div class="cm-line">Nothing on the board.</div>';
    for (const b of listEl.querySelectorAll('[data-t]')) b.addEventListener('click', () => { const t = list[Number(b.dataset.t)]; nav.setRoute(player, t); toast(`Route set: ${t.label}`); view.cx = t.x; view.cz = t.z; dirty = true; });
    const pads = typeof navigator !== 'undefined' && [...(navigator.getGamepads?.() ?? [])].some((p) => p && p.connected);
    helpEl.textContent = pads
      ? 'Left stick: cursor  Right stick: pan  LT/RT: zoom  A: drop waypoint / select  X: remove  Y: travel  LB/RB: colour  View: mark for partner  B: close'
      : 'Click: waypoint / select   Shift+click: mark for partner   Right-click: remove   Drag/WASD: pan   Wheel/Q/E: zoom   F: travel   C: colour   Esc/M: close';
  }

  // ---- drawing ----
  function draw() {
    const m = nav.model, s = view.s;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const T = { s, ox: view.cx - W / 2 / s, oz: view.cz - H / 2 / s };
    const vb = { minX: T.ox, maxX: T.ox + W / s, minZ: T.oz, maxZ: T.oz + H / s };
    drawCity(g, m, T, { view: vb, highContrast: nav.settings().highContrast, el: filters.el });
    if (filters.fog) {
      const F = nav.fogLayer();
      if (F) { g.imageSmoothingEnabled = true; g.drawImage(F.canvas, (F.ox - T.ox) * s, (F.oz - T.oz) * s, F.canvas.width * F.cell * s, F.canvas.height * F.cell * s); }
    }
    // District names.
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const d of m.districts) {
      if (!d.area) continue;
      const p = toScreen(d.cx, d.cz);
      if (p.x < -100 || p.y < -40 || p.x > W + 100 || p.y > H + 40) continue;
      const known = nav.districtKnown(d.id);
      g.font = `${Math.round(Math.max(14, Math.min(30, 11 + s * 16)))}px 'Bangers', cursive`;
      g.lineWidth = 4; g.strokeStyle = PAPER; g.strokeText(known ? d.label.toUpperCase() : '???', p.x, p.y);
      g.fillStyle = INK; g.fillText(known ? d.label.toUpperCase() : '???', p.x, p.y);
    }
    const icon = (ic, x, z, r, c) => { const p = toScreen(x, z); if (p.x > -20 && p.y > -20 && p.x < W + 20 && p.y < H + 20) drawIcon(g, ic, p.x, p.y, r, c); };
    // Landmarks in explored ground; hidden collectibles only with the hint flag (no spoilers).
    if (filters.landmarks) for (const l of m.landmarks) if (nav.revealed(l.x, l.z) && (l.kind !== 'collectible' || nav.flags.collectibleHints)) icon(l.icon, l.x, l.z, 6, '#efe6cf');
    if (filters.el && !filters.travel) for (const st of m.el.stations) icon('el', st.x, st.z, 7, '#ffffff');
    if (filters.travel) for (const p of nav.fastTravel.points) {
      const on = nav.fastTravel.isUnlocked(p.id);
      if (!on && !nav.revealed(p.x, p.z)) continue;
      icon(p.kind === 'el' ? 'el' : p.kind === 'batcave' ? 'batcave' : 'batwing', p.x, p.z, on ? 9 : 6, on ? '#f2d24b' : '#8a8f9c');
      if (selected?.id === p.id) { const q = toScreen(p.x, p.z); g.beginPath(); g.arc(q.x, q.y, 16, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = '#f2d24b'; g.stroke(); }
    }
    if (filters.missions) for (const t of nav.listTargets()) icon(t.kind === 'crime' ? 'crime' : 'star', t.x, t.z, 8, t.kind === 'crime' ? '#ff4f4f' : '#f2d24b');
    // Bridges up.
    for (const b of nav.bridgeStates()) if (b.up) icon('bridgeUp', b.x, b.z, 7, '#ff9f43');
    // Routes.
    for (const rt of nav.routesFor(player)) {
      if (!rt.pts) continue;
      g.beginPath();
      rt.pts.forEach((p, i) => { const q = toScreen(p.x, p.z); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); });
      g.globalAlpha = rt.own ? 1 : 0.45;
      g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); g.strokeStyle = rt.color; g.lineWidth = 4; g.stroke();
      g.globalAlpha = 1;
    }
    if (filters.waypoints) {
      for (const mk of nav.waypoints.allMarks()) icon('diamond', mk.x, mk.z, mk.by === player.id ? 9 : 7, WAYPOINT_COLORS[mk.c] ?? WAYPOINT_COLORS[0]);
      for (const t of nav.trackedNow()) icon('diamond', t.x, t.z, 7, '#58e0ff');
    }
    const obj = nav.objective();
    if (obj) icon('star', obj.x, obj.z, 11, '#f2d24b');
    // Players.
    for (const p of nav.playerMarkers()) { const q = toScreen(p.x, p.z); drawArrow(g, q.x, q.y, Math.PI - p.yaw, p.id === player.id ? 11 : 9, p.color); }
    // Cursor.
    const c = toScreen(cursor.x, cursor.z);
    g.strokeStyle = INK; g.lineWidth = 3;
    g.beginPath(); g.moveTo(c.x - 14, c.y); g.lineTo(c.x - 4, c.y); g.moveTo(c.x + 4, c.y); g.lineTo(c.x + 14, c.y); g.moveTo(c.x, c.y - 14); g.lineTo(c.x, c.y - 4); g.moveTo(c.x, c.y + 4); g.lineTo(c.x, c.y + 14); g.stroke();
    g.strokeStyle = WAYPOINT_COLORS[color]; g.lineWidth = 1.5; g.stroke();
    // Scale bar.
    const metres = view.s > 2 ? 50 : view.s > 0.8 ? 100 : 250;
    g.fillStyle = PAPER; g.fillRect(14, 14, metres * view.s + 12, 26); g.strokeStyle = INK; g.lineWidth = 2; g.strokeRect(14, 14, metres * view.s + 12, 26);
    g.fillStyle = INK; g.fillRect(20, 30, metres * view.s, 4); g.font = "15px 'Barlow Condensed', sans-serif"; g.textAlign = 'left'; g.fillText(`${metres} m`, 22, 22);
  }

  // ---- input ----
  canvas.addEventListener('mousemove', (e) => {
    const w = toWorld(e.offsetX, e.offsetY);
    if (drag) { view.cx = drag.cx - (e.offsetX - drag.x) / view.s; view.cz = drag.cz - (e.offsetY - drag.y) / view.s; if (Math.hypot(e.offsetX - drag.x, e.offsetY - drag.y) > 4) drag.moved = true; clampView(); }
    else { cursor.x = w.x; cursor.z = w.z; }
    dirty = true;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) drag = { x: e.offsetX, y: e.offsetY, cx: view.cx, cz: view.cz, moved: false }; });
  window.addEventListener('mouseup', (e) => {
    if (!open || !drag) return;
    const d = drag; drag = null;
    if (e.button === 0 && !d.moved && e.target === canvas) { const w = toWorld(e.offsetX, e.offsetY); cursor.x = w.x; cursor.z = w.z; place(w.x, w.z, { forPartner: e.shiftKey }); }
  });
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); const w = toWorld(e.offsetX, e.offsetY); remove(w.x, w.z); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = toWorld(e.offsetX, e.offsetY);
    view.s *= e.deltaY < 0 ? 1.15 : 1 / 1.15;
    clampView();
    const after = toWorld(e.offsetX, e.offsetY);
    view.cx += before.x - after.x; view.cz += before.z - after.z;
    clampView(); dirty = true;
  }, { passive: false });
  const keys = new Set();
  function onKey(e) {
    if (!open) return;
    if (e.type === 'keyup') { keys.delete(e.code); return; }
    keys.add(e.code);
    const c = e.code;
    if (c === 'Escape' || c === 'KeyM') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (c === 'Enter' || c === 'Space') { e.preventDefault(); place(cursor.x, cursor.z, { forPartner: e.shiftKey }); }
    else if (c === 'Delete' || c === 'Backspace') remove(cursor.x, cursor.z);
    else if (c === 'KeyF') travel();
    else if (c === 'KeyC') { color = (color + 1) % WAYPOINT_COLORS.length; paintSwatches(); dirty = true; }
    else if (c === 'KeyX') { nav.clearWaypoints(player); dirty = true; refreshPanels(); }
    e.stopPropagation();
  }
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);

  function pollPads(dt) {
    const list = typeof navigator !== 'undefined' ? navigator.getGamepads?.() ?? [] : [];
    for (const p of list) {
      if (!p || !p.connected) continue;
      const prev = pads.get(p.index) ?? [];
      const now = p.buttons.map((b) => b.pressed);
      const hit = (i) => now[i] && !prev[i];
      pads.set(p.index, now);
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const lx = dz(p.axes[0] ?? 0), ly = dz(p.axes[1] ?? 0), rx = dz(p.axes[2] ?? 0), ry = dz(p.axes[3] ?? 0);
      if (lx || ly) {
        cursor.sx = Math.max(30, Math.min(W - 30, (cursor.sx || W / 2) + lx * 520 * dt));
        cursor.sy = Math.max(30, Math.min(H - 30, (cursor.sy || H / 2) + ly * 520 * dt));
        // Near the edge the map follows.
        if (cursor.sx < 90 || cursor.sx > W - 90) view.cx += lx * 420 * dt / view.s;
        if (cursor.sy < 90 || cursor.sy > H - 90) view.cz += ly * 420 * dt / view.s;
        clampView();
        const w = toWorld(cursor.sx, cursor.sy); cursor.x = w.x; cursor.z = w.z; dirty = true;
      }
      if (rx || ry) { view.cx += rx * 600 * dt / view.s; view.cz += ry * 600 * dt / view.s; clampView(); dirty = true; }
      const lt = p.buttons[6]?.value ?? 0, rt = p.buttons[7]?.value ?? 0;
      if (lt > 0.1 || rt > 0.1) { view.s *= Math.pow(1.9, (rt - lt) * dt * 2); clampView(); dirty = true; }
      if (hit(0)) place(cursor.x, cursor.z);
      if (hit(2)) remove(cursor.x, cursor.z);
      if (hit(3)) travel();
      if (hit(8)) place(cursor.x, cursor.z, { forPartner: true });
      if (hit(4)) { color = (color + WAYPOINT_COLORS.length - 1) % WAYPOINT_COLORS.length; paintSwatches(); dirty = true; }
      if (hit(5)) { color = (color + 1) % WAYPOINT_COLORS.length; paintSwatches(); dirty = true; }
      if (hit(1) || hit(9)) { close(); return; }
    }
  }

  let lastT = 0, panelT = 0;
  function loop(t) {
    if (!open) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
    lastT = t;
    // Keyboard pan and zoom.
    const k = (c) => keys.has(c);
    const px = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0), pz = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
    if (px || pz) { view.cx += px * 500 * dt / view.s; view.cz += pz * 500 * dt / view.s; clampView(); dirty = true; }
    if (k('KeyE') || k('Equal')) { view.s *= 1 + dt * 1.6; clampView(); dirty = true; }
    if (k('KeyQ') || k('Minus')) { view.s /= 1 + dt * 1.6; clampView(); dirty = true; }
    pollPads(dt);
    if (toastT > 0 && (toastT -= dt) <= 0) toastEl.classList.remove('show');
    panelT -= dt;
    if (panelT <= 0) { panelT = 0.4; const d = nav.districtInfo(cursor.x, cursor.z); if ((d?.id ?? null) !== lastDistrict) refreshPanels(); }
    if (dirty) { dirty = false; draw(); }
  }

  function close() {
    if (!open) return;
    open = false;
    cancelAnimationFrame(raf);
    el.classList.remove('show');
    keys.clear();
    const cb = onClose; onClose = null;
    cb?.();
  }

  const api = {
    el,
    get isOpen() { return open; },
    get view() { return view; },
    get cursor() { return cursor; },
    // opts: { player, onClose, focus: { x, z }, scale }
    open(opts = {}) {
      player = opts.player ?? nav.players()[0];
      onClose = opts.onClose ?? null;
      el.classList.toggle('hc', !!nav.settings().highContrast);
      el.classList.add('show');
      open = true;
      resize();
      const f = opts.focus ?? nav.playerPos(player);
      view.cx = f.x; view.cz = f.z; view.s = opts.scale ?? 1.1;
      cursor.x = f.x; cursor.z = f.z; cursor.sx = W / 2; cursor.sy = H / 2;
      selected = null;
      pads.clear();
      for (const p of (typeof navigator !== 'undefined' ? navigator.getGamepads?.() ?? [] : [])) if (p) pads.set(p.index, p.buttons.map((b) => b.pressed));
      clampView(); paintSwatches(); refreshPanels();
      dirty = true; lastT = 0;
      raf = requestAnimationFrame(loop);
    },
    close,
    // Test/automation hooks: act at a world point as a click would.
    placeAt(x, z, o) { place(x, z, o); },
    removeAt(x, z) { remove(x, z); },
    select(id) { select(nav.fastTravel.points.find((p) => p.id === id) ?? null); },
    travel,
    redraw() { dirty = true; },
  };
  addEventListener('resize', () => { if (open) resize(); });
  return api;
}
