// HUD pieces for side content: the challenge panel and timer, the 3-2-1 comic panels, short
// hints, police radio captions, milestone toasts and the bat markers over challenge pillars.
import { batSvgPath } from '../config/batShape.js';
import { stackSlot, feedBounds } from './hudLayout.js'; // [polish] the feed column

export function createSideHud(root) {
  const el = document.createElement('div');
  el.className = 'side-hud';
  el.innerHTML = `
    <div class="ch-panel"><div class="ch-name"></div><div class="ch-time"></div><div class="ch-sub"></div></div>
    <div class="ch-count"></div>
    <div class="ch-hint"></div>
    <div class="radio"><div class="radio-title"></div><div class="radio-text"></div></div>
    <div class="side-toast"><div class="toast-title"></div><div class="toast-text"></div></div>
    <div class="ch-markers"></div>`;
  root.appendChild(el);
  const q = (s) => el.querySelector(s);
  const panel = q('.ch-panel'), nameEl = q('.ch-name'), timeEl = q('.ch-time'), subEl = q('.ch-sub');
  const count = q('.ch-count'), hintEl = q('.ch-hint'), radio = q('.radio'), toast = q('.side-toast'), markers = q('.ch-markers');
  const marks = new Map();
  const timers = new Map();
  const set = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const flash = (node, key, ms) => {
    node.classList.add('show');
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => node.classList.remove('show'), ms));
  };
  const pop = (node) => { node.classList.remove('pop'); void node.offsetWidth; node.classList.add('pop'); };
  // [polish] The feed (src/ui/hudLayout.js): the challenge panel, the police radio and the toast
  // stack in one column under the minimap instead of three fixed spots, newest at the bottom; the
  // oldest goes early when there is no room. Laid out when one arrives or leaves, never per frame.
  el.classList.add('feed');
  const feed = [{ id: 'challenge', node: panel, pinned: true, at: 0 }, { id: 'radio', node: radio, at: 0 }, { id: 'toast', node: toast, at: 0 }];
  let seq = 0;
  const relayout = () => {
    const on = feed.filter((f) => f.node.classList.contains('show'));
    if (!on.length) return;
    const b = feedBounds(innerHeight, { compact: document.body.classList.contains('hud-compact'), split: document.body.classList.contains('coop-split') });
    // The double-life card (Batman in the cave) sits at the head of this column: start under it.
    const bw = document.querySelector('.bw-meters.show');
    if (bw && !document.body.classList.contains('bruce-civ')) b.top = Math.max(b.top, bw.getBoundingClientRect().bottom + 12);
    const r = stackSlot(on.map((f) => ({ id: f.id, h: f.node.offsetHeight, pinned: f.pinned, at: f.at })), { ...b, gap: 10 });
    for (const p of r.placed) feed.find((f) => f.id === p.id).node.style.top = `${p.y}px`;
    for (const id of r.dropped) { const f = feed.find((x) => x.id === id); f.node.classList.remove('show'); clearTimeout(timers.get(id)); }
  };
  const arrive = (id) => { feed.find((f) => f.id === id).at = ++seq; relayout(); };
  const flashFeed = (node, key, ms) => {
    flash(node, key, ms);
    arrive(key);
    clearTimeout(timers.get(`${key}:out`));
    timers.set(`${key}:out`, setTimeout(relayout, ms + 320));
  };

  return {
    challenge(title) { set(nameEl, title); set(timeEl, ''); set(subEl, ''); panel.classList.add('show'); arrive('challenge'); },
    timer(main, sub = '') { set(timeEl, main); set(subEl, sub); },
    countdown(text) { count.textContent = text; pop(count); },
    clearChallenge() { panel.classList.remove('show'); relayout(); },
    hint(text, ms = 3000) { set(hintEl, text); flash(hintEl, 'hint', ms); },
    radio(title, text, ms = 6000) { set(q('.radio-title'), title); set(q('.radio-text'), text); flashFeed(radio, 'radio', ms); },
    toast(title, text, ms = 6000) { set(q('.toast-title'), title); set(q('.toast-text'), text); flashFeed(toast, 'toast', ms); },
    marker(id, x, y, visible, medal = null) {
      let m = marks.get(id);
      if (!visible) { if (m && m.style.display !== 'none') m.style.display = 'none'; return; }
      if (!m) {
        m = document.createElement('div');
        m.className = 'ch-marker';
        m.innerHTML = `<svg viewBox="-52 -26 104 52"><path d="${batSvgPath(1, 0, 0)}"/></svg>`;
        markers.appendChild(m);
        marks.set(id, m);
      }
      m.style.display = '';
      m.dataset.medal = medal ?? 'none';
      m.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    },
    hideMarkers() { for (const m of marks.values()) m.style.display = 'none'; },
  };
}
