// The Bruce side's screen furniture (workstream K): a fade, the double-life meters with their
// cause -> effect ticker, the dialogue choice panel, the stay-or-slip timer, full-screen overlays
// (the Batcomputer, the diary, the paper, the wardrobe, the vault) and the end-of-scene card.
// Spoken lines go through the game's radio panel (src/ui/radio.js), not through here, so subtitle
// and accessibility settings apply to them. Keys: 1-4 pick, Esc closes an overlay; every button is
// also clickable and reachable with the pad's D-pad + A (the game's menu navigation walks
// `.menu-layer.show button`, which every overlay here is).
import { clockText } from './calendar.js';

// [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
const CSS = `
.bw-fade { position: fixed; inset: 0; background: #07070b; opacity: 0; pointer-events: none; transition: opacity .35s; z-index: 40; }
.bw-fade.on { opacity: 1; }
.bw-meters { position: fixed; left: 18px; bottom: 18px; width: 230px; padding: 8px 10px 10px; background: rgba(12,12,18,.82); border: 3px solid #0b0b12; box-shadow: 4px 4px 0 #b89a52; color: #efe6cf; font: calc(13px * var(--a11y-text, 1))/1.2 'Barlow Condensed', sans-serif; z-index: 22; display: none; }
.bw-meters.show { display: block; }
.bw-meters .row { display: grid; grid-template-columns: 78px 1fr 30px; align-items: center; gap: 6px; margin-top: 4px; }
.bw-meters .bar { height: 8px; background: #26262e; border: 1px solid #0b0b12; position: relative; }
.bw-meters .fill { position: absolute; inset: 0 auto 0 0; transition: width .5s; }
.bw-meters .soft { position: absolute; top: -2px; bottom: -2px; width: 1px; background: rgba(239,230,207,.5); }
.bw-meters .head { display: flex; justify-content: space-between; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #f2d24b; }
.bw-meters .sus { margin-top: 6px; display: flex; gap: 10px; font-size: calc(12px * var(--a11y-text, 1)); opacity: .9; }
.bw-meters .flash { animation: bwflash .9s; }
@keyframes bwflash { 0%,60% { background: #f2d24b; } 100% { background: inherit; } }
.bw-ticker { position: fixed; left: 18px; bottom: 210px; width: 320px; z-index: 22; pointer-events: none; }
.bw-ticker div { margin-top: 4px; padding: 4px 8px; background: #fffdf5; color: #0b0b12; border: 3px solid #0b0b12; font: calc(15px * var(--a11y-text, 1))/1.2 'Patrick Hand SC', cursive; animation: bwin .25s; }
.bw-ticker .up { box-shadow: 3px 3px 0 #3f9e34; } .bw-ticker .down { box-shadow: 3px 3px 0 #c8323c; }
@keyframes bwin { from { transform: translateX(-30px); opacity: 0; } }
.bw-choices { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); width: min(720px, 92vw); z-index: 30; display: none; }
.bw-choices.show { display: block; }
.bw-choices .prompt { background: #0b0b12; color: #efe6cf; padding: 8px 12px; font: calc(18px * var(--a11y-text, 1))/1.25 'Patrick Hand SC', cursive; border: 3px solid #0b0b12; }
.bw-choices button { display: grid; grid-template-columns: 30px 70px 1fr; gap: 8px; width: 100%; text-align: left; margin-top: 5px; padding: 8px 10px; background: #fffdf5; color: #0b0b12; border: 3px solid #0b0b12; font: calc(18px * var(--a11y-text, 1))/1.2 'Patrick Hand SC', cursive; cursor: pointer; box-shadow: 4px 4px 0 #0b0b12; }
.bw-choices button:hover, .bw-choices button:focus { background: #f2d24b; outline: none; }
.bw-choices button.off { opacity: .45; cursor: not-allowed; }
.bw-choices button.worn { box-shadow: 4px 4px 0 #c8323c; }
.bw-choices .k { font: 800 calc(16px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; }
.bw-choices .tag { font: 700 calc(12px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: 1px; align-self: center; }
.bw-choices .why { grid-column: 3; font-size: calc(14px * var(--a11y-text, 1)); color: #8a2a2a; }
.bw-timer { height: 10px; margin-top: 6px; background: #26262e; border: 2px solid #0b0b12; }
.bw-timer div { height: 100%; background: #c8323c; }
.bw-goal { position: fixed; top: 86px; left: 50%; transform: translateX(-50%); z-index: 24; padding: 6px 14px; background: #0b0b12; color: #f2d24b; border: 3px solid #f2d24b; font: 800 calc(18px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; letter-spacing: 1px; display: none; }
.bw-goal.show { display: block; }
.bw-overlay.menu-layer { position: fixed; inset: 0; z-index: 35; display: none; background: rgba(7,7,11,.72); }
.bw-overlay.show { display: grid; place-items: center; }
.bw-panel { width: min(900px, 94vw); max-height: 86vh; overflow: auto; background: #efe6cf; color: #0b0b12; border: 5px solid #0b0b12; box-shadow: 10px 10px 0 #f2d24b; padding: 16px 20px; font: calc(17px * var(--a11y-text, 1))/1.35 'Patrick Hand SC', cursive; }
.bw-panel.cave { background: #0d1418; color: #cfeaf2; box-shadow: 10px 10px 0 #4fe3ff; font-family: 'Barlow Condensed', sans-serif; }
.bw-panel h2 { margin: 0 0 8px; font: calc(34px * var(--a11y-text, 1)) 'Bangers', Impact, sans-serif; letter-spacing: 1px; }
.bw-panel h3 { margin: 12px 0 4px; font: 800 calc(18px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; text-transform: uppercase; letter-spacing: 1px; }
.bw-panel .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.bw-panel button { padding: 6px 12px; margin: 3px 4px 3px 0; background: #fffdf5; color: #0b0b12; border: 3px solid #0b0b12; font: 700 calc(16px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; cursor: pointer; box-shadow: 3px 3px 0 #0b0b12; }
.bw-panel.cave button { background: #12262e; color: #cfeaf2; border-color: #4fe3ff; box-shadow: 3px 3px 0 #000; }
.bw-panel button:focus, .bw-panel button:hover { background: #f2d24b; color: #0b0b12; outline: none; }
.bw-panel button.on { background: #f2d24b; color: #0b0b12; }
.bw-panel table { border-collapse: collapse; width: 100%; font: calc(15px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; }
.bw-panel td, .bw-panel th { border-bottom: 1px solid rgba(128,128,128,.4); padding: 3px 6px; text-align: left; }
.bw-panel .hot { color: #e85a4a; font-weight: 800; } .bw-panel .ok { color: #3f9e34; font-weight: 800; }
.bw-panel .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.bw-panel .paper { background: #f4efe0; padding: 10px 14px; border: 2px solid #0b0b12; }
.bw-panel .paper .head { font: calc(30px * var(--a11y-text, 1))/1.05 'Bangers', Impact, sans-serif; } .bw-panel .paper .sub { font-size: calc(16px * var(--a11y-text, 1)); margin-bottom: 10px; }
.bw-panel canvas { width: 100%; border: 2px solid #4fe3ff; background: #050a0e; }
.bw-panel .note { font-size: calc(14px * var(--a11y-text, 1)); opacity: .8; }
.bw-card .changes div { font: calc(16px * var(--a11y-text, 1)) 'Barlow Condensed', sans-serif; }
/* [polish] A designed place for the double life (src/ui/hudLayout.js). As Bruce (body.bruce-civ)
   the Batman HUD steps aside: the meters card takes the vitals corner (bottom left), his goal the
   objective corner (top right) with the cause -> effect feed under it, the choices the bottom
   centre, and the dialogue rises above the choices while they are open. As Batman (in the cave)
   the card sits under the minimap, clear of the health ring. */
.bw-meters { left: 20px; top: 236px; bottom: auto; width: 236px; background: #efe6cf; color: #0b0b12; border: 3px solid #0b0b12; box-shadow: 5px 5px 0 #0b0b12; transform: rotate(-0.8deg); padding: 7px 11px 9px; font: calc(14px * var(--a11y-text, 1))/1.2 'Barlow Condensed', sans-serif; }
.bw-meters .head { color: #0b0b12; font: calc(19px * var(--a11y-text, 1))/1 'Bangers', Impact, sans-serif; letter-spacing: 1.2px; text-transform: none; border-bottom: 2px solid #0b0b12; padding-bottom: 4px; margin-bottom: 2px; }
.bw-meters .head span:last-child { color: #c8323c; }
.bw-meters .row { grid-template-columns: 62px 1fr 26px; margin-top: 5px; font-weight: 700; }
.bw-meters .bar { height: 9px; background: #fffdf5; border: 2px solid #0b0b12; }
.bw-meters .soft { background: rgba(11,11,18,.55); }
.bw-meters .sus { font-size: calc(13px * var(--a11y-text, 1)); opacity: 1; color: #3a3a44; flex-wrap: wrap; gap: 2px 8px; }
body.bruce-civ .bw-meters { top: auto; bottom: 20px; }
.bw-ticker { left: auto; right: 24px; bottom: auto; top: 128px; width: min(300px, 30vw); display: flex; flex-direction: column; align-items: flex-end; }
.bw-ticker div { font-size: calc(16px * var(--a11y-text, 1)); box-shadow: 3px 3px 0 #0b0b12; }
.bw-goal { left: auto; right: 28px; top: 24px; transform: rotate(-1deg); max-width: 320px; padding: 9px 14px; background: #f2d24b; color: #0b0b12; border: 3px solid #0b0b12; box-shadow: 5px 5px 0 #0b0b12; font: calc(20px * var(--a11y-text, 1))/1.15 'Patrick Hand SC', cursive; letter-spacing: 0; }
.bw-choices { bottom: 28px; width: min(680px, 62vw); }
body.bruce-civ .hud .hud-caption, body.bruce-civ .hud .hud-banner, body.bruce-civ .hud .hud-arrive, body.bruce-civ .hud .hud-under, body.bruce-civ .hud .hud-slot, body.bruce-civ .hud .ghud,
body.bruce-civ .waypoint, body.bruce-civ .gh-swarm, body.bruce-inside .minimap, body.bruce-inside .wanted-readout { display: none !important; }
body:has(.bw-choices.show) .dlg-panel { bottom: calc(var(--bw-choices-h, 240px) + 44px); }
body:has(.bw-choices.show) .hud-hint { opacity: 0 !important; }
body.hud-compact .bw-meters .sus { display: none; }
body.hud-compact .bw-ticker div:nth-last-child(n+3) { display: none; }
`;

let styled = false;
function style() {
  if (styled || typeof document === 'undefined') return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}
const el = (tag, cls, parent, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent?.appendChild(e); return e; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const METER_LABEL = { standing: 'Standing', city: 'City', fatigue: 'Fatigue', patience: 'Alfred' };
const METER_COLOR = { standing: '#d9a92c', city: '#49b4ff', fatigue: '#c8323c', patience: '#8fd18f' };
const WHAT_LABEL = (w) => {
  if (METER_LABEL[w]) return METER_LABEL[w];
  if (w.startsWith('suspicion.')) return `Suspicion (${w.slice(10)})`;
  if (w.startsWith('thread.')) return `${w.slice(7)[0].toUpperCase()}${w.slice(8)} thread`;
  if (w.startsWith('injury.')) return w.slice(7);
  if (w.startsWith('door.')) return `door: ${w.slice(5)}`;
  if (w === 'credit') return 'Wayne credit';
  if (w === 'alfredBreak') return "Alfred's breaking point";
  return w;
};
// "-6 Standing: left the gala mid-toast". Good changes read "up" (green), bad "down" (red).
export function changeText(c) {
  const d = c.delta ?? 0;
  const badUp = c.what === 'fatigue' || c.what.startsWith('suspicion') || c.what.startsWith('injury');
  const good = badUp ? d < 0 : d > 0;
  const amount = c.what.startsWith('thread') ? (d > 0 ? 'closer' : 'strained') : c.what.startsWith('door') ? (d > 0 ? 'opened' : 'closed') : c.what === 'alfredBreak' ? 'reached' : `${d > 0 ? '+' : ''}${Math.round(d)}`;
  return { text: `${amount} ${WHAT_LABEL(c.what)}${c.reason ? `: ${c.reason}` : ''}`, good };
}

export function createBruceUI(root = typeof document !== 'undefined' ? document.body : null) {
  if (!root) return headlessUI();
  style();
  const fadeEl = el('div', 'bw-fade', root);
  const meters = el('div', 'bw-meters', root);
  const ticker = el('div', 'bw-ticker', root);
  const choices = el('div', 'bw-choices', root);
  const goal = el('div', 'bw-goal', root);
  const overlay = el('div', 'bw-overlay menu-layer', root);
  let onKey = null, closeCb = null, picks = [];
  window.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('show') && e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); api.closeOverlay(); return; }
    if (!onKey) return;
    const m = /^Digit([1-9])$/.exec(e.code) || /^Numpad([1-9])$/.exec(e.code);
    if (m) { const i = Number(m[1]) - 1; if (picks[i]) { e.preventDefault(); e.stopPropagation(); picks[i](); } }
  }, true);

  const api = {
    get overlayOpen() { return overlay.classList.contains('show'); },
    get choicesOpen() { return choices.classList.contains('show'); },
    fade(on) { fadeEl.classList.toggle('on', !!on); },
    // Fades out, runs fn at black, fades back in. Resolves when visible again.
    async through(fn, ms = 380) {
      api.fade(true);
      await new Promise((r) => setTimeout(r, ms));
      try { await fn(); } finally { api.fade(false); }
      await new Promise((r) => setTimeout(r, ms * 0.6));
    },
    meters(show, life = null, extra = {}) {
      meters.classList.toggle('show', !!show);
      if (!show || !life) return;
      const row = (k, v, soft) => `<div class="row" data-k="${k}"><span>${METER_LABEL[k]}</span><div class="bar"><div class="fill" style="width:${Math.round(v)}%;background:${METER_COLOR[k]}"></div>${soft ? `<div class="soft" style="left:${soft}%"></div>` : ''}</div><b>${Math.round(v)}</b></div>`;
      meters.innerHTML = `<div class="head"><span>${esc(extra.title ?? 'Bruce Wayne')}</span><span>${extra.hour != null ? clockText(extra.hour) : ''}</span></div>`
        + row('standing', life.standing, 80) + row('city', life.city, 80) + row('fatigue', life.fatigue, 85) + row('patience', life.patience)
        + `<div class="sus">Suspicion: reporter ${Math.round(life.suspicion.reporter)} · detective ${Math.round(life.suspicion.detective)} · villain ${Math.round(life.suspicion.villain)}</div>`
        + `<div class="sus">Wayne credit ${life.credit}${life.rnd.frozen ? ' · R&D frozen' : ''}${extra.note ? ` · ${esc(extra.note)}` : ''}</div>`;
    },
    // [polish] Which life the screen is dressed for (body classes, written only on a change): civ
    // as Bruce or in a scene (the Batman HUD steps aside), inside a pocket (no city minimap).
    mode({ civ = false, inside = false } = {}) {
      const b = document.body.classList;
      if (b.contains('bruce-civ') !== civ) b.toggle('bruce-civ', civ);
      if (b.contains('bruce-inside') !== inside) b.toggle('bruce-inside', inside);
    },
    // The cause -> effect ticker (a few lines, each fades after a while).
    changes(list, ms = 5200) {
      for (const c of list.slice(-5)) {
        const t = changeText(c);
        const d = el('div', t.good ? 'up' : 'down', ticker, esc(t.text));
        setTimeout(() => d.remove(), ms);
      }
      while (ticker.children.length > 4) ticker.firstChild.remove(); // [polish] four fit under the goal
    },
    goal(text) { goal.textContent = text ?? ''; goal.classList.toggle('show', !!text); },
    // options: [{ id, text, tag, ok, reason, worn }]; onPick(id). timer: { left, max } (optional).
    choose(prompt, options, onPick, timer = null) {
      choices.innerHTML = '';
      el('div', 'prompt', choices, esc(prompt ?? ''));
      picks = [];
      options.forEach((o, i) => {
        const b = el('button', `${o.ok === false ? 'off' : ''} ${o.worn ? 'worn' : ''}`, choices,
          `<span class="k">${i + 1}</span><span class="tag">${esc(o.tag ?? '')}</span><span>${esc(o.text)}</span>${o.reason ? `<span class="why">${esc(o.reason)}</span>` : ''}`);
        const go = () => { if (o.ok === false) return; onPick(o.id); };
        b.addEventListener('click', (e) => { e.stopPropagation(); go(); });
        picks.push(go);
      });
      if (timer) { const t = el('div', 'bw-timer', choices); t.appendChild(document.createElement('div')); api.timer(timer.left, timer.max); }
      choices.classList.add('show');
      document.documentElement.style.setProperty('--bw-choices-h', `${choices.offsetHeight}px`); // [polish] the dialogue rises above
      onKey = true;
    },
    timer(left, max) {
      const bar = choices.querySelector('.bw-timer div');
      if (bar) bar.style.width = `${Math.max(0, Math.min(1, left / Math.max(0.01, max))) * 100}%`;
    },
    hideChoices() { choices.classList.remove('show'); picks = []; onKey = null; },
    // A full overlay: html, then buttons [{ label, onClick, cls }]. Returns the panel element.
    overlay(html, { cave = false, buttons = [], onClose = null } = {}) {
      overlay.innerHTML = '';
      const p = el('div', `bw-panel ${cave ? 'cave' : ''}`, overlay, html);
      const row = el('div', 'tabs', p);
      for (const b of buttons) {
        const btn = el('button', b.cls ?? '', row, esc(b.label));
        btn.addEventListener('click', (e) => { e.stopPropagation(); b.onClick(); });
      }
      const close = el('button', '', row, 'Back');
      close.addEventListener('click', (e) => { e.stopPropagation(); api.closeOverlay(); });
      overlay.classList.add('show');
      closeCb = onClose;
      setTimeout(() => (row.querySelector('button') ?? close).focus(), 30);
      return p;
    },
    closeOverlay() {
      if (!overlay.classList.contains('show')) return;
      overlay.classList.remove('show');
      overlay.innerHTML = '';
      const cb = closeCb; closeCb = null;
      cb?.();
    },
    esc,
  };
  return api;
}

// The same API with no DOM (unit tests, a headless run).
function headlessUI() {
  const noop = () => {};
  return { overlayOpen: false, choicesOpen: false, fade: noop, mode: noop, through: async (fn) => { await fn(); }, meters: noop, changes: noop, goal: noop, choose: noop, timer: noop, hideChoices: noop, overlay: () => null, closeOverlay: noop, esc: (t) => String(t) };
}
