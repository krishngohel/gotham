// [prog] The gadget wheel's pages. Pure.
//
// Eighteen gadgets do not fit eight wheel slots, so the wheel has pages: LOADOUT_PAGES pages of
// WHEEL_SLOTS slots, each slot a gadget id or null. Page 1 is the original eight in their original
// slots (so the story, its tests and every player's muscle memory are unchanged); the ten new
// gadgets sit on pages 2 and 3. The player can rearrange any slot in the loadout station
// (src/ui/gadgetLoadout.js), except page 1 slot 1, which is always the batarang (the Joker's fight
// hands it over). Every gadget always has exactly one slot, so nothing can be lost off the wheel.
// While the wheel is open, the fire key (or Q) turns to the next page that holds an unlocked gadget.
// Saved as progress.gadgets.loadout (gadgetSave.js); a save without one gets DEFAULT_LOADOUT.
import { ALL_GADGET_IDS, GADGET_IDS, NEW_GADGET_IDS } from './gadgetDefs.js';
import { WHEEL_SLOTS } from './wheelMath.js';

export const LOADOUT_PAGES = 3;
const pad = (ids) => [...ids, ...Array(WHEEL_SLOTS).fill(null)].slice(0, WHEEL_SLOTS);
export const DEFAULT_LOADOUT = Object.freeze([
  Object.freeze(pad(GADGET_IDS)),
  Object.freeze(pad(NEW_GADGET_IDS.slice(0, WHEEL_SLOTS))),
  Object.freeze(pad(NEW_GADGET_IDS.slice(WHEEL_SLOTS))),
]);

export const defaultLoadout = () => DEFAULT_LOADOUT.map((p) => [...p]);

// Any value in, a valid loadout out: LOADOUT_PAGES x WHEEL_SLOTS, known ids once each, the
// batarang first, and every gadget the save does not place put in the first free slot.
export function sanitizeLoadout(raw) {
  if (!Array.isArray(raw)) return defaultLoadout();
  const seen = new Set(['batarang']);
  const out = [];
  for (let p = 0; p < LOADOUT_PAGES; p++) {
    const src = Array.isArray(raw[p]) ? raw[p] : [];
    const page = [];
    for (let s = 0; s < WHEEL_SLOTS; s++) {
      const id = src[s];
      if (p === 0 && s === 0) { page.push('batarang'); continue; }
      if (typeof id === 'string' && ALL_GADGET_IDS.includes(id) && !seen.has(id)) { seen.add(id); page.push(id); } else page.push(null);
    }
    out.push(page);
  }
  for (const id of ALL_GADGET_IDS) {
    if (seen.has(id)) continue;
    // Its default slot if free, else the first free one.
    const d = slotOf(DEFAULT_LOADOUT, id);
    if (d && out[d.page][d.slot] === null) out[d.page][d.slot] = id;
    else {
      const f = firstFree(out);
      if (f) out[f.page][f.slot] = id;
    }
    seen.add(id);
  }
  return out;
}

export function slotOf(loadout, id) {
  for (let p = 0; p < loadout.length; p++) {
    const s = loadout[p].indexOf(id);
    if (s >= 0) return { page: p, slot: s };
  }
  return null;
}

function firstFree(loadout) {
  for (let p = 0; p < loadout.length; p++) {
    const s = loadout[p].indexOf(null);
    if (s >= 0) return { page: p, slot: s };
  }
  return null;
}

// Swaps two slots ({ page, slot } each) in place. Page 1 slot 1 (the batarang) never moves.
// Returns whether anything changed.
export function swapSlots(loadout, a, b) {
  const ok = (x) => x && x.page >= 0 && x.page < loadout.length && x.slot >= 0 && x.slot < WHEEL_SLOTS;
  if (!ok(a) || !ok(b) || (a.page === b.page && a.slot === b.slot)) return false;
  if ((a.page === 0 && a.slot === 0) || (b.page === 0 && b.slot === 0)) return false;
  const t = loadout[a.page][a.slot];
  loadout[a.page][a.slot] = loadout[b.page][b.slot];
  loadout[b.page][b.slot] = t;
  return true;
}

// The pages worth showing: those with at least one unlocked gadget (page 1 always).
export function livePages(loadout, isUnlocked) {
  const out = [0];
  for (let p = 1; p < loadout.length; p++) if (loadout[p].some((id) => id && isUnlocked(id))) out.push(p);
  return out;
}

// The next live page after `page` (wrapping), or `page` itself when it is the only one.
export function nextPage(loadout, page, isUnlocked, dir = 1) {
  const live = livePages(loadout, isUnlocked);
  const i = live.indexOf(page);
  if (i < 0) return live[0];
  return live[(i + dir + live.length) % live.length];
}
