// The gadget wheel: eight comic panels in a ring around a caption box. Built once and hidden.
// Opening it sets the locked panels once; moving the pick swaps one class and the caption text.
import { GADGETS } from '../gadgets/gadgetDefs.js';
import { GADGET_ICONS, LOCK_ICON } from './gadgetIcons.js';
import { slotCenter } from '../gadgets/wheelMath.js';

export function createGadgetWheel(root) {
  const el = document.createElement('div');
  el.className = 'gwheel';
  el.innerHTML = `<div class="gw-ring">${GADGETS.map((g, i) => {
    const c = slotCenter(i, 245);
    return `<div class="gw-panel" style="--x:${c.x.toFixed(1)}px;--y:${c.y.toFixed(1)}px;--r:${i % 2 ? 2 : -2}deg">`
      + `<svg class="g-ico gw-icon" viewBox="0 0 48 48">${GADGET_ICONS[g.id]}</svg>`
      + `<svg class="g-ico gw-lock" viewBox="0 0 48 48">${LOCK_ICON}</svg><b>${i + 1}</b></div>`;
  }).join('')}<div class="gw-center"><div class="gw-name"></div><div class="gw-text"></div><div class="gw-page"></div></div></div>`;
  root.appendChild(el);
  const panels = [...el.querySelectorAll('.gw-panel')];
  const nameEl = el.querySelector('.gw-name'), textEl = el.querySelector('.gw-text');
  let pick = -1;
  // [prog] wave 3: the wheel's pages (src/gadgets/loadout.js). Which ids the panels show now.
  const icons = panels.map((p) => p.querySelector('.gw-icon'));
  const pageEl = el.querySelector('.gw-page');
  const shownIds = GADGETS.map((g) => g.id);
  let pageText = '';
  const setInfo = (info) => {
    if (nameEl.textContent !== info.name) nameEl.textContent = info.name;
    if (textEl.textContent !== info.text) textEl.textContent = info.text;
  };
  const setPick = (i, info) => {
    if (i !== pick) {
      panels[pick]?.classList.remove('on');
      panels[i]?.classList.add('on');
      pick = i;
    }
    setInfo(info);
  };
  return {
    el,
    // unlocked: booleans per slot.
    show(unlocked, i, info) {
      panels.forEach((p, k) => p.classList.toggle('locked', !unlocked[k]));
      setPick(i, info);
      el.classList.add('show');
    },
    setPick,
    setInfo,
    // [prog] ids: the page's eight slots (an id or null); n of count pages with a gadget on them.
    // The strip under the caption shows only when there is more than one.
    setPage(ids, n, count, keyLabel = '') {
      for (let k = 0; k < panels.length; k++) {
        const id = ids?.[k] ?? null;
        if (id === shownIds[k]) continue;
        shownIds[k] = id;
        icons[k].innerHTML = id ? GADGET_ICONS[id] ?? '' : '';
        panels[k].classList.toggle('empty', !id);
      }
      const text = count > 1 ? `Page ${n + 1} of ${count}. ${keyLabel || 'Q'} or Q turns the page.` : '';
      if (text !== pageText) { pageText = text; pageEl.textContent = text; pageEl.classList.toggle('on', !!text); }
    },
    hide() { el.classList.remove('show'); },
    // Lays the wheel out and paints it once while invisible, so the first real open costs nothing.
    warm() { el.classList.add('warm'); void el.offsetWidth; el.getBoundingClientRect(); el.classList.remove('warm'); },
  };
}
