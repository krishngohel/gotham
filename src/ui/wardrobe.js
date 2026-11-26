// [prog] suits: the wardrobe page (the Batcave suit vault, station id 'suits'). Lists every roster
// hero and their looks; locked looks show their unlock text, every look shows its perk (marked
// active only while settings.suitPerks is on). Keyboard: arrows move, Enter / Space wear,
// Q / E (or PageUp / PageDown) switch hero, Esc / Backspace back. Pad: D-pad or left stick move,
// A wear, LB / RB switch hero, B back.
//
//   registerWardrobeStation({ wardrobe, getProgress, getSettings, inRun, sound }) -> unregister
//   openWardrobe(deps, ctx) -> { close() }      (what the station calls; ctx.onClose on close)
//
// The pick is saved at once (Batman: progress.suit; other heroes: progress.wardrobe.equipped).
// A run in progress keeps its model: the new look is worn from the next run (the page says so).
import { registerStation } from './stations.js';
import { HEROES } from '../heroes/roster.js';
import { wardrobeFor, isSuitUnlocked, perkText } from '../progress/suitData.js';
import { gearListHtml } from '../progress/storyLocker.js'; // [verify] the story gear's surface

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Nearest focusable in a direction (dx, dy), by on-screen position.
function nearest(from, list, dx, dy) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const b of list) {
    if (b === from) continue;
    const r = b.getBoundingClientRect();
    const vx = r.left + r.width / 2 - ax, vy = r.top + r.height / 2 - ay;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy) + Math.abs(vy * dx);
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  return best;
}

export function openWardrobe({ wardrobe, getProgress, getSettings = () => ({}), inRun = () => false, sound = () => {} }, ctx = {}) {
  const doc = document;
  const layer = doc.createElement('div');
  layer.className = 'wardrobe-layer';
  layer.setAttribute('role', 'dialog');
  layer.setAttribute('aria-label', 'Suit vault');
  const box = doc.createElement('div');
  box.className = 'menu wardrobe-menu';
  layer.appendChild(box);
  (ctx.root ?? doc.body).appendChild(layer);

  const heroes = HEROES.filter((h) => wardrobeFor(h.id).length);
  let hi = Math.max(0, heroes.findIndex((h) => h.id === (ctx.hero ?? 'batman')));
  let closed = false;

  function render(focusId = null) {
    const p = getProgress() ?? {};
    const perksOn = getSettings()?.suitPerks === true;
    const h = heroes[hi];
    const wearing = wardrobe.wearing(h.id);
    const tabs = heroes.map((x, i) => `<button class="mbtn small wd-tab${i === hi ? ' on' : ''}" data-hero="${i}" aria-pressed="${i === hi}">${esc(x.name)}</button>`).join('');
    const cards = wardrobeFor(h.id).map((s) => {
      const unlocked = isSuitUnlocked(s.id, p);
      const state = s.tailored ? 'tailored' : unlocked ? 'open' : 'locked';
      const perk = perkText(s.id);
      const tint = s.cardFilter ? ` style="filter:${esc(s.cardFilter)}"` : '';
      const line = state === 'locked' ? `Locked: ${esc(s.unlock?.text ?? '')}`
        : state === 'tailored' ? `${esc(s.desc)}<br><b>Being tailored:</b> ${unlocked ? 'unlocked, wearable once Lucius finishes the fitting.' : esc(s.unlock?.text ?? '')}`
          : esc(s.desc);
      return `<button class="suit-card wd-card ${state}${s.id === wearing ? ' wearing' : ''}" data-id="${esc(s.id)}" data-state="${state}"${state === 'open' ? '' : ' aria-disabled="true"'}>
        <div class="swatch"><img src="./assets/art/${esc(s.card)}.webp" alt="" draggable="false"${tint}>${s.id === wearing ? '<span class="wd-badge">WEARING</span>' : ''}</div>
        <div class="sname">${esc(s.name)}</div>
        <div class="sdesc">${line}</div>
        ${perk ? `<div class="wd-perk${perksOn ? ' active' : ''}">${perksOn ? 'Perk on' : 'Perk off'} &middot; ${esc(perk)}</div>` : '<div class="wd-perk none">Cosmetic only</div>'}
      </button>`;
    }).join('');
    const notes = [
      perksOn ? 'Suit perks are <b>on</b>: the suit you wear adds its small perk.' : 'Suit perks are <b>off</b>: every suit is cosmetic. Turn them on in Settings.',
      inRun() ? 'A new suit is worn from your next run; tonight you keep the one you have on.' : '',
    ].filter(Boolean).map((t) => `<p class="wd-note">${t}</p>`).join('');
    box.innerHTML = `<h2>Suit Vault</h2>
      <div class="wd-tabs" role="tablist">${tabs}</div>
      <div class="suits wd-grid">${cards}</div>
      ${notes}
      ${gearListHtml(p) /* [verify] Gear: the filters and linings the nights gave (src/progress/storyLocker.js) */}
      <div class="wd-foot"><button class="mbtn small wd-back">Back</button><span class="wd-keys">Arrows / D-pad move &middot; Enter / A wear &middot; Q E / LB RB hero &middot; Esc / B back</span></div>`;
    box.querySelectorAll('.wd-tab').forEach((b) => b.addEventListener('click', () => setHero(Number(b.dataset.hero))));
    box.querySelectorAll('.wd-card').forEach((b) => {
      b.addEventListener('click', () => pick(b.dataset.id, b.dataset.state));
      b.addEventListener('mouseenter', () => sound('uiMove'));
    });
    box.querySelector('.wd-back').addEventListener('click', close);
    const target = (focusId && box.querySelector(`.wd-card[data-id="${CSS.escape(focusId)}"]`))
      ?? box.querySelector('.wd-card.wearing') ?? box.querySelector('.wd-card');
    target?.focus({ preventScroll: false });
  }

  function setHero(i) {
    hi = (i + heroes.length) % heroes.length;
    sound('uiMove');
    render();
  }

  function pick(id, state) {
    if (state !== 'open' || !wardrobe.equip(id)) { sound('uiBack'); return; }
    sound('uiSelect');
    render(id);
  }

  const buttons = () => [...box.querySelectorAll('button')];
  function move(dx, dy) {
    const list = buttons();
    const cur = doc.activeElement && list.includes(doc.activeElement) ? doc.activeElement : null;
    const next = cur ? nearest(cur, list, dx, dy) : list[0];
    if (next) { next.focus(); sound('uiMove'); }
  }

  const KEYS = {
    ArrowLeft: () => move(-1, 0), ArrowRight: () => move(1, 0), ArrowUp: () => move(0, -1), ArrowDown: () => move(0, 1),
    KeyQ: () => setHero(hi - 1), KeyE: () => setHero(hi + 1), PageUp: () => setHero(hi - 1), PageDown: () => setHero(hi + 1),
    Escape: () => close(), Backspace: () => close(),
  };
  // Capture phase: the page owns these keys while it is open (the game's pause key is Esc).
  function onKey(e) {
    const fn = KEYS[e.code];
    if (!fn) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    fn();
  }
  window.addEventListener('keydown', onKey, true);

  // Gamepad: edge-triggered, polled while open. The press that opened the page does not count.
  let prev = null, raf = 0;
  function padState() {
    const out = { left: false, right: false, up: false, down: false, a: false, b: false, lb: false, rb: false };
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads ?? []) {
      if (!gp) continue;
      const btn = (i) => !!gp.buttons[i]?.pressed;
      const ax = gp.axes[0] ?? 0, ay = gp.axes[1] ?? 0;
      out.left ||= btn(14) || ax < -0.6; out.right ||= btn(15) || ax > 0.6;
      out.up ||= btn(12) || ay < -0.6; out.down ||= btn(13) || ay > 0.6;
      out.a ||= btn(0); out.b ||= btn(1); out.lb ||= btn(4); out.rb ||= btn(5);
    }
    return out;
  }
  function poll() {
    if (closed) return;
    const s = padState();
    if (prev) {
      const hit = (k) => s[k] && !prev[k];
      if (hit('left')) move(-1, 0); else if (hit('right')) move(1, 0);
      else if (hit('up')) move(0, -1); else if (hit('down')) move(0, 1);
      if (hit('lb')) setHero(hi - 1); else if (hit('rb')) setHero(hi + 1);
      if (hit('a')) (doc.activeElement && buttons().includes(doc.activeElement) ? doc.activeElement : buttons()[0])?.click();
      if (hit('b')) { close(); return; }
    }
    prev = s;
    raf = requestAnimationFrame(poll);
  }
  raf = requestAnimationFrame(poll);

  function close() {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    layer.remove();
    sound('uiBack');
    ctx.onClose?.();
  }

  render();
  return { close, get open() { return !closed; }, element: layer };
}

export function registerWardrobeStation(deps) {
  return registerStation('suits', (ctx) => openWardrobe(deps, ctx));
}
