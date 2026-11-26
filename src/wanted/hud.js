// [wanted] The police-attention readout: one self-contained HUD element per player view, with a
// single show / hide / priority interface so the HUD director (src/ui/hudDirector.js, onboarding
// workstream) can own when it appears. Our own look, nothing borrowed: a precinct shield in ink
// whose five bands fill from the bottom in siren red and blue, a thin amber ring round it that
// drains while a search runs, a hand-lettered tag under it (NOTICED, PURSUIT, SEARCHING...), and a
// siren tint on the screen edge when units are closing in. Enter/exit ease in 260/200 ms (the
// director's numbers); reduced motion drops the pulse and the edge flicker for a steady tint.
//
//   const r = createWantedReadout(hudEl, { reducedMotion: () => bool })
//   r.update(view)      view: { level, state, search01, closing01, label, scripted }  (cheap: diffs)
//   r.show() / r.hide() / r.setPriority(n) / r.priority / r.visible / r.destroy()
import { LEVEL_LABEL } from './lines.js';
import { allowStrobe } from '../ui/accessibility.js'; // [verify] a11y: flash reduction stops the siren flicker too

let styled = false;
function ensureStyles() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const st = document.createElement('style');
  // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
  st.textContent = `
.wanted-readout { position: absolute; left: calc(var(--mm-size, 176px) + 40px); top: 18px; z-index: 3; pointer-events: none;
  display: flex; flex-direction: column; align-items: center; gap: 2px; opacity: 0; transform: translateY(-10px) scale(0.92) rotate(-2deg);
  transition: opacity 0.26s ease-out, transform 0.26s cubic-bezier(.2,1.4,.4,1); filter: drop-shadow(3px 3px 0 #0b0b12); }
.wanted-readout.show { opacity: 1; transform: translateY(0) scale(1) rotate(-2deg); }
.wanted-readout.hide { transition: opacity 0.2s ease-in, transform 0.2s ease-in; }
.wanted-readout svg { width: 64px; height: 64px; overflow: visible; }
.wanted-readout .wr-band { transition: fill 0.25s; }
.wanted-readout .wr-tag { font: calc(17px * var(--a11y-text, 1))/1 'Bangers', cursive; letter-spacing: 1.5px; color: #0b0b12; background: #efe6cf; border: 2px solid #0b0b12;
  padding: 2px 7px 1px; transform: rotate(1.5deg); white-space: nowrap; }
.wanted-readout.l4 .wr-tag, .wanted-readout.l5 .wr-tag { background: #ff4f4f; color: #fffdf5; }
.wanted-readout.search .wr-tag { background: #f2c14b; }
.wanted-readout.cool .wr-tag { background: #9fb3c8; }
.wanted-readout.pulse svg { animation: wr-pulse 0.9s ease-in-out infinite; }
@keyframes wr-pulse { 50% { transform: scale(1.06); } }
.wanted-edge { position: absolute; inset: 0; pointer-events: none; z-index: 2; opacity: 0; transition: opacity 0.4s;
  box-shadow: inset 0 0 70px 18px rgba(255, 40, 60, 0.55); }
.wanted-edge.blue { box-shadow: inset 0 0 70px 18px rgba(60, 110, 255, 0.55); }
.hud.split .wanted-readout { left: calc(var(--mm-size, 150px) + 24px); top: 10px; }
.hud.split .wanted-readout svg { width: 52px; height: 52px; }
`;
  document.head.appendChild(st);
}

// The shield outline (viewBox 0 0 64 64): a flat top with clipped corners, curving to a point.
const SHIELD = 'M12 6 L52 6 L58 12 L58 30 C58 44 46 54 32 60 C18 54 6 44 6 30 L6 12 Z';
const RING_R = 30;
const RING_LEN = 2 * Math.PI * RING_R;
const BAND_ON = ['#ff4f4f', '#3a6dff', '#ff4f4f', '#3a6dff', '#ff4f4f'];

export function createWantedReadout(hudEl, { reducedMotion = () => false } = {}) {
  ensureStyles();
  const el = document.createElement('div');
  el.className = 'wanted-readout';
  // Five bands inside the shield, bottom (1) to top (5), clipped by the shield's shape.
  const uid = `wr${Math.random().toString(36).slice(2, 8)}`;
  const bands = [];
  for (let i = 0; i < 5; i++) {
    const y = 50 - i * 9;
    bands.push(`<rect class="wr-band" data-i="${i}" x="6" y="${y}" width="52" height="8" fill="#2a2e38"/>`);
  }
  el.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true">
    <defs><clipPath id="${uid}"><path d="${SHIELD}"/></clipPath></defs>
    <circle class="wr-ring" cx="32" cy="33" r="${RING_R}" fill="none" stroke="#f2c14b" stroke-width="3.5" stroke-linecap="round"
      stroke-dasharray="${RING_LEN.toFixed(1)}" stroke-dashoffset="0" transform="rotate(-90 32 33)" opacity="0"/>
    <path d="${SHIELD}" fill="#1a1d24"/>
    <g clip-path="url(#${uid})">${bands.join('')}</g>
    <path d="${SHIELD}" fill="none" stroke="#0b0b12" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M20 13 L44 13" stroke="#efe6cf" stroke-width="2.4" stroke-linecap="round"/>
  </svg><div class="wr-tag"></div>`;
  hudEl.appendChild(el);
  const edge = document.createElement('div');
  edge.className = 'wanted-edge';
  hudEl.appendChild(edge);
  const bandEls = [...el.querySelectorAll('.wr-band')];
  const ring = el.querySelector('.wr-ring');
  const tag = el.querySelector('.wr-tag');
  let visible = false, priority = 30, wantVisible = false, held = false;
  let lastLevel = -1, lastState = '', lastLabel = '', lastRing = -1, lastEdge = -1, flick = 0, lastBlue = false;

  function setShown(on) {
    if (on === visible) return;
    visible = on;
    el.classList.toggle('show', on);
    el.classList.toggle('hide', !on);
  }

  return {
    el, edge,
    get visible() { return visible; },
    get priority() { return priority; },
    get wants() { return wantVisible; },
    setPriority(n) { priority = n; },
    // The HUD director (or the owner) shows and hides it; with no director, update() does.
    show() { held = false; setShown(true); },
    hide() { held = true; setShown(false); },
    release() { held = false; },
    update(v, dt = 0) {
      const level = v?.level ?? 0;
      wantVisible = level > 0;
      if (!held) setShown(wantVisible);
      const st = v?.state ?? 'clear';
      if (level !== lastLevel) {
        lastLevel = level;
        for (let i = 0; i < 5; i++) bandEls[i].setAttribute('fill', i < level ? BAND_ON[i] : '#2a2e38');
        el.classList.toggle('l4', level === 4);
        el.classList.toggle('l5', level === 5);
      }
      if (st !== lastState) {
        lastState = st;
        el.classList.toggle('search', st === 'search');
        el.classList.toggle('cool', st === 'cooldown');
        el.classList.toggle('pulse', (st === 'pursuit' || st === 'caught') && !reducedMotion());
      }
      const label = v?.label ?? (st === 'search' ? 'SEARCHING' : st === 'cooldown' ? 'STANDING DOWN' : st === 'caught' ? 'SURROUNDED' : st === 'custody' ? 'IN CUSTODY' : LEVEL_LABEL[level] ?? '');
      if (label !== lastLabel) { lastLabel = label; tag.textContent = label; }
      // The search ring: full when the search starts, empty when it ends.
      const r = st === 'search' ? Math.max(0, Math.min(1, v.search01 ?? 0)) : -1;
      const rq = r < 0 ? -1 : Math.round(r * 60) / 60;
      if (rq !== lastRing) {
        lastRing = rq;
        ring.setAttribute('opacity', rq < 0 ? '0' : '1');
        if (rq >= 0) ring.setAttribute('stroke-dashoffset', (RING_LEN * (1 - rq)).toFixed(1));
      }
      // The siren edge: opacity follows how close the units are; red/blue alternate unless
      // reduced motion asks for a steady tint.
      const c = Math.max(0, Math.min(1, v?.closing01 ?? 0)) * (level > 1 && st === 'pursuit' ? 1 : 0);
      const cq = Math.round(c * 10) / 10;
      if (cq !== lastEdge) { lastEdge = cq; edge.style.opacity = (cq * 0.7).toFixed(2); }
      if (cq > 0 && !reducedMotion() && allowStrobe()) { // [verify] a11y: steady tint under flash reduction as well
        flick += dt;
        const blue = Math.floor(flick * 3) % 2 === 1;
        if (blue !== lastBlue) { lastBlue = blue; edge.classList.toggle('blue', blue); }
      }
    },
    destroy() { el.remove(); edge.remove(); },
  };
}
