// [prog] The gadget loadout station (UI station 'gadgets', src/ui/stations.js): the wheel's three
// pages of eight slots (src/gadgets/loadout.js). Pick a slot, then another, and the two swap; page
// 1 slot 1 is always the batarang. Every gadget always has a slot, so nothing is ever lost; a
// locked one shows as a padlock where it will appear. Writes through gadgets.setLoadout (saved in
// progress.gadgets.loadout). Keyboard: Tab/arrows move, Enter/Space picks, Escape closes.
import { gadgetById } from '../gadgets/gadgetDefs.js';
import { DEFAULT_LOADOUT, swapSlots, sanitizeLoadout } from '../gadgets/loadout.js';
import { GADGET_ICONS, LOCK_ICON } from './gadgetIcons.js';
import { registerStation } from './stations.js';

export function openGadgetLoadout({ gadgets, onClose, root } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc || !gadgets) { onClose?.(); return { close() {} }; }
  let work = sanitizeLoadout(gadgets.loadout);
  let held = null;
  const wrap = doc.createElement('div');
  // [fix1] A menu layer, so the pad's menu navigation (game.js) reaches its buttons; B is Done.
  wrap.className = 'gloadout menu-layer show';
  wrap.innerHTML = '<div class="menu" role="dialog" aria-label="Gadget loadout"><h2>GADGET LOADOUT</h2>'
    + '<p class="gl-info" aria-live="polite">Pick a slot, then another to swap them. The wheel turns its pages with the fire key or Q.</p>'
    + '<div class="gl-pages"></div><div class="gl-actions"><button class="mbtn small gl-reset">Default</button><button class="mbtn small gl-done">Done</button></div></div>';
  (root ?? doc.body).appendChild(wrap);
  const pagesEl = wrap.querySelector('.gl-pages'), info = wrap.querySelector('.gl-info');
  const unlocked = (id) => !!id && gadgets.state?.isUnlocked?.(id);

  function describe(id) {
    if (!id) return 'An empty slot.';
    const g = gadgetById(id);
    return unlocked(id) ? `${g.name}: ${g.cardText}` : `Locked. ${g.unlockText}`;
  }
  function render() {
    pagesEl.innerHTML = work.map((page, p) => `<div class="gl-page"><h3>Page ${p + 1}</h3><div class="gl-slots">${page.map((id, s) => {
      const fixed = p === 0 && s === 0;
      const cls = ['gl-slot', !id ? 'empty' : unlocked(id) ? '' : 'locked', fixed ? 'fixed' : '', held && held.page === p && held.slot === s ? 'held' : ''].filter(Boolean).join(' ');
      const icon = !id ? '' : unlocked(id) ? GADGET_ICONS[id] : LOCK_ICON;
      const label = !id ? `Page ${p + 1} slot ${s + 1}, empty` : `Page ${p + 1} slot ${s + 1}, ${unlocked(id) ? gadgetById(id).name : 'locked gadget'}`;
      return `<button class="${cls}" data-p="${p}" data-s="${s}" aria-label="${label}"><b>${s + 1}</b><svg class="g-ico" viewBox="0 0 48 48">${icon}</svg></button>`;
    }).join('')}</div></div>`).join('');
  }
  function pick(p, s) {
    const at = { page: p, slot: s };
    if (p === 0 && s === 0) { info.textContent = 'The batarang always stays in slot 1 of page 1.'; return; }
    if (!held) { held = at; info.textContent = `${describe(work[p][s])} Now pick where it goes.`; render(); focus(p, s); return; }
    if (swapSlots(work, held, at)) work = gadgets.setLoadout(work).map((x) => [...x]);
    held = null;
    info.textContent = describe(work[p][s]);
    render();
    focus(p, s);
  }
  const focus = (p, s) => pagesEl.querySelector(`[data-p="${p}"][data-s="${s}"]`)?.focus?.();
  pagesEl.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('.gl-slot');
    if (b) pick(Number(b.dataset.p), Number(b.dataset.s));
  });
  pagesEl.addEventListener('focusin', (ev) => {
    const b = ev.target.closest?.('.gl-slot');
    if (b && !held) info.textContent = describe(work[Number(b.dataset.p)][Number(b.dataset.s)]);
  });
  const onKey = (ev) => {
    // [fix1] The page owns Esc while open (as the wardrobe and the map do): stopped here, it no longer
    // reaches the game's pause key, which re-paused the game the moment the station handed it back.
    if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); if (held) { held = null; render(); } else close(); return; }
    const b = doc.activeElement?.closest?.('.gl-slot');
    if (!b) return;
    const p = Number(b.dataset.p), s = Number(b.dataset.s);
    const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
    const m = moves[ev.key];
    if (!m) return;
    ev.preventDefault();
    focus(Math.max(0, Math.min(work.length - 1, p + m[0])), Math.max(0, Math.min(7, s + m[1])));
  };
  doc.addEventListener('keydown', onKey, true);
  wrap.querySelector('.gl-reset').addEventListener('click', () => {
    work = gadgets.setLoadout(DEFAULT_LOADOUT.map((x) => [...x])).map((x) => [...x]);
    held = null;
    info.textContent = 'Back to the WayneTech default.';
    render();
  });
  let done = false;
  function close() {
    if (done) return;
    done = true;
    doc.removeEventListener('keydown', onKey, true);
    wrap.remove();
    onClose?.();
  }
  wrap.querySelector('.gl-done').addEventListener('click', close);
  render();
  focus(0, 1);
  return { close, get loadout() { return work; } };
}

// Registers the station once the game's gadget system exists (game.js). Returns the unregister.
export function registerGadgetLoadout(getGadgets) {
  return registerStation('gadgets', (ctx = {}) => openGadgetLoadout({ gadgets: getGadgets(), ...ctx }));
}
