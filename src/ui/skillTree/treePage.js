// The skill tree page (wave 3, workstream L1): every branch as a band of comic panels joined by ink
// lines, on a board you can pan (drag, arrow keys move focus and the view follows) and zoom (mouse
// wheel, + / -, gamepad bumpers). Hover or focus a node to read what it changes and a short "picture
// it" line; click (or A / Enter) builds it when it is buyable. Node buttons keep the old WayneTech
// card classes (.wt-card + state) so the old page's tests and styles still apply.
//
// buildTreePage(data, { onBuy, onBack, onRespec?, focus?, sound? }) -> HTMLElement
// `data` is wayne.tree() (src/progress/wayneTech.js). Text always goes in with textContent.
import { nearestInDirection, clampZoom, panToShow, NODE_W, NODE_H, COL_W, ROW_H, BAND_PAD, LABEL_W } from './treeNav.js';

const STATE_TEXT = {
  owned: 'Built', buyable: 'Build it', poor: 'Not enough yet', locked: 'Needs the one before',
  act: 'Opens later in the story', hero: 'Another hero’s move',
};
const BRANCH_GLYPH = { shield: '⛨', fist: '✊', belt: '⚙', wing: '➶', eye: '◉', lens: '⌕', car: '▬', tower: '▲', star: '★' };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function buildTreePage(data, { onBuy, onBack, onRespec = null, focus = null, sound = () => {}, reducedMotion = false }) {
  const node = el('div', 'menu wt-menu st-menu');
  node.dataset.nav = 'spatial';
  if (reducedMotion) node.classList.add('st-calm');

  // ---- header: level, XP bar, points, Standing, act ----
  const head = el('div', 'wt-head');
  head.append(el('span', 'wt-logo', 'WAYNETECH'), el('span', 'wt-sub', 'Applied Sciences · skill tree'));
  node.appendChild(head);
  const bar = el('div', 'wt-xp st-xp');
  const lvl = el('div', 'wt-level', `Level ${data.level}`);
  const meter = el('div', 'wt-bar');
  const fill = el('i');
  fill.style.width = `${Math.round((data.next?.fraction ?? 0) * 100)}%`;
  meter.appendChild(fill);
  const pts = el('div', 'wt-points', data.free === 1 ? '1 point to spend' : `${data.free} points to spend`);
  const sub = el('div', 'wt-next', `${data.xp.toLocaleString('en-US')} XP · ${(data.next?.need ?? 0).toLocaleString('en-US')} to level ${data.level + 1} · Standing ${data.standing} · Act ${data.act}`);
  bar.append(lvl, meter, pts, sub);
  node.appendChild(bar);

  // ---- branch tabs (jump the view to a branch) ----
  const tabs = el('div', 'st-tabs');
  node.appendChild(tabs);

  // ---- the board ----
  const view = el('div', 'st-view');
  view.tabIndex = -1;
  const board = el('div', 'st-board');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('st-lines');
  board.appendChild(svg);
  view.appendChild(board);
  node.appendChild(view);

  // ---- the detail panel ----
  const detail = el('div', 'st-detail');
  const dName = el('div', 'st-dname'), dMeta = el('div', 'st-dmeta'), dText = el('div', 'st-dtext'), dDemo = el('div', 'st-ddemo'), dState = el('div', 'st-dstate');
  detail.append(dName, dMeta, dText, dDemo, dState);
  node.appendChild(detail);

  const cells = []; // { id, x, y, btn, data }
  let top = 0, width = 0;
  const bandTop = new Map();
  for (const br of data.branches) {
    const rows = Math.max(1, ...br.nodes.map((x) => x.row + 1));
    bandTop.set(br.id, top);
    const label = el('div', `st-band st-band-${br.id}`);
    label.style.top = `${top}px`;
    label.style.height = `${rows * ROW_H + BAND_PAD - 10}px`;
    const name = el('div', 'st-bname', `${BRANCH_GLYPH[br.icon] ?? ''} ${br.name}`);
    const blurb = el('div', 'st-bblurb', br.blurb + (br.currency === 'standing' ? ' (Standing)' : ''));
    label.append(name, blurb);
    board.appendChild(label);
    const tab = el('button', `mbtn small st-tab st-tab-${br.id}`, br.name);
    tab.addEventListener('click', (e) => { e.stopPropagation(); sound('uiMove'); const first = cells.find((c) => c.data.branch === br.id); if (first) first.btn.focus(); });
    tabs.appendChild(tab);
    for (const x of br.nodes) {
      const px = LABEL_W + x.col * COL_W, py = top + BAND_PAD / 2 + x.row * ROW_H;
      const btn = el('button', `mbtn wt-card st-node ${x.state} cur-${x.currency}`);
      btn.dataset.id = x.id;
      btn.style.left = `${px}px`;
      btn.style.top = `${py}px`;
      btn.append(el('span', 'wt-name', x.name), el('span', 'st-cost', x.currency === 'standing' ? `${x.cost} Standing` : x.cost === 1 ? '1 pt' : `${x.cost} pts`), el('span', 'wt-state', x.arrives ? x.arrives.replace(/, after .*/, '') : STATE_TEXT[x.state] ?? x.state)); // [verify] arrival (src/abilities/arrival.js) in place of the state
      btn.setAttribute('aria-label', `${x.name}. ${x.text} ${STATE_TEXT[x.state] ?? ''}${x.arrives ? ` ${x.arrives}.` : ''}`); // [verify] + arrival
      board.appendChild(btn);
      cells.push({ id: x.id, x: px, y: py, btn, data: { ...x, branch: br.id } });
      width = Math.max(width, px + NODE_W + 40);
    }
    top += rows * ROW_H + BAND_PAD;
  }
  board.style.width = `${width}px`;
  board.style.height = `${top}px`;
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(top));
  // Ink lines from each prerequisite to its node (a dog-leg, like a panel gutter).
  const at = new Map(cells.map((c) => [c.id, c]));
  for (const c of cells) {
    for (const r of c.data.requires) {
      const p = at.get(r);
      if (!p) continue;
      const x1 = p.x + NODE_W, y1 = p.y + NODE_H / 2, x2 = c.x, y2 = c.y + NODE_H / 2, mx = (x1 + x2) / 2;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M${x1} ${y1} H${mx} V${y2} H${x2}`);
      path.setAttribute('class', `st-link ${c.data.state === 'owned' ? 'on' : ''}`);
      svg.appendChild(path);
    }
  }

  // ---- pan and zoom ----
  let zoom = 1, panX = 0, panY = 0;
  const apply = () => { board.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`; };
  const viewSize = () => ({ w: view.clientWidth || 900, h: view.clientHeight || 420 });
  function show(c) {
    const v = viewSize();
    const p = panToShow({ x: c.x, y: c.y, w: NODE_W, h: NODE_H }, { panX, panY, zoom, w: v.w, h: v.h });
    panX = p.panX; panY = p.panY;
    apply();
  }
  function setZoom(z, cx = viewSize().w / 2, cy = viewSize().h / 2) {
    const nz = clampZoom(z);
    // Keep the point under the cursor (or the centre) still.
    panX = cx - ((cx - panX) / zoom) * nz;
    panY = cy - ((cy - panY) / zoom) * nz;
    zoom = nz;
    apply();
  }
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    setZoom(zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  let drag = null;
  view.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    drag = { x: e.clientX, y: e.clientY, px: panX, py: panY };
    view.setPointerCapture?.(e.pointerId);
  });
  view.addEventListener('pointermove', (e) => {
    if (!drag) return;
    panX = drag.px + (e.clientX - drag.x);
    panY = drag.py + (e.clientY - drag.y);
    apply();
  });
  const endDrag = () => { drag = null; };
  view.addEventListener('pointerup', endDrag);
  view.addEventListener('pointercancel', endDrag);

  // ---- details and buying ----
  function describe(c) {
    const x = c.data;
    dName.textContent = x.name;
    dMeta.textContent = `${x.currency === 'standing' ? `${x.cost} Standing` : x.cost === 1 ? '1 point' : `${x.cost} points`} · ${x.branch === 'kit' ? 'Hero kit' : data.branches.find((b) => b.id === x.branch)?.name ?? ''}${x.act > 1 ? ` · Act ${x.act}` : ''}`;
    dText.textContent = x.text;
    dDemo.textContent = `Picture it: ${x.demo}`;
    const needs = x.requires.map((r) => at.get(r)?.data.name).filter(Boolean);
    dState.textContent = x.state === 'locked' && needs.length ? `Needs ${needs.join(' and ')} first.` : STATE_TEXT[x.state] ?? '';
    if (x.arrives) dState.textContent += ` ${x.arrives}: the upgrade works once it does.`; // [verify]
    dState.className = `st-dstate ${x.state}`;
  }
  for (const c of cells) {
    c.btn.addEventListener('focus', () => { describe(c); show(c); });
    c.btn.addEventListener('mouseenter', () => { describe(c); sound('uiMove'); });
    c.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (c.data.state === 'buyable') onBuy(c.id);
      else sound('uiRefuse');
    });
  }

  // Spatial keyboard navigation (the gamepad's D-pad arrives here as arrow keys: game.js).
  node.addEventListener('keydown', (e) => {
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (dirs[e.key]) {
      const cur = cells.find((c) => c.btn === document.activeElement) ?? cells[0];
      const next = nearestInDirection(cells, cur, ...dirs[e.key]);
      if (next) { next.btn.focus({ preventScroll: true }); sound('uiMove'); }
      e.preventDefault();
      e.stopPropagation();
    } else if (e.key === '+' || e.key === '=') { setZoom(zoom * 1.15); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { setZoom(zoom / 1.15); e.preventDefault(); }
  });

  // ---- footer ----
  const foot = el('div', 'st-foot');
  if (onRespec) {
    const rb = el('button', `mbtn small st-respec ${data.respecReady ? '' : 'off'}`, data.respecReady ? 'Respec (free this act)' : 'Respec used this act');
    rb.addEventListener('click', (e) => { e.stopPropagation(); if (data.respecReady) onRespec(); else sound('uiRefuse'); });
    foot.appendChild(rb);
  } else {
    foot.appendChild(el('span', 'st-hint', 'Respec at the Batcave bench, free once per act.'));
  }
  foot.appendChild(el('span', 'st-hint', 'Drag or arrow keys to move · wheel or +/- to zoom'));
  const back = el('button', 'mbtn small', 'Back');
  back.addEventListener('click', (e) => { e.stopPropagation(); sound('uiSelect'); onBack(); });
  foot.appendChild(back);
  node.appendChild(foot);

  // First focus: the asked-for node, else the first buyable one, else the first node.
  node.focusFirst = () => {
    const c = (focus && at.get(focus)) || cells.find((x) => x.data.state === 'buyable') || cells[0];
    if (c) { c.btn.focus({ preventScroll: true }); describe(c); show(c); }
  };
  apply();
  return node;
}
