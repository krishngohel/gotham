// The saved gadget state (progress.gadgets): what's equipped, every gadget ever unlocked (a new
// game keeps them), broken breakables, found caches and whether the wheel was ever opened. Registers itself at load, so game.js
// must import this module before loadProgress runs. Pure.
import { registerProgressField } from '../core/save.js';
import { tracker } from '../game/progressTracker.js';
import { ALL_GADGET_IDS } from './gadgetDefs.js';
import { sanitizeLoadout } from './loadout.js';
import { BREAKABLE_IDS, CACHE_IDS } from '../world/breakableSpots.js';

const ids = (v, allowed) => (Array.isArray(v) ? [...new Set(v.filter((s) => allowed.includes(s)))] : []);

export function sanitizeGadgetSave(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {
    // [prog] wave 3: equipped and unlocked take the ten new gadget ids too (ALL_GADGET_IDS).
    equipped: ALL_GADGET_IDS.includes(r.equipped) ? r.equipped : 'batarang',
    unlocked: ids(r.unlocked, ALL_GADGET_IDS),
    broken: ids(r.broken, BREAKABLE_IDS),
    caches: ids(r.caches, CACHE_IDS),
    // Older saves have no flag: the wheel tutorial still shows for them.
    wheelUsed: r.wheelUsed === true,
  };
  // [prog] The wheel pages (src/gadgets/loadout.js). Only written once the player rearranges
  // them: a save without the key (every older save) uses DEFAULT_LOADOUT.
  if (Array.isArray(r.loadout)) out.loadout = sanitizeLoadout(r.loadout);
  return out;
}

registerProgressField('gadgets', { sanitize: sanitizeGadgetSave });

tracker.register({
  id: 'caches', label: 'WayneTech caches', weight: 3,
  count: (p) => ({ done: p.gadgets.caches.length, total: CACHE_IDS.length }),
  detail: (p) => `${p.gadgets.caches.length} of ${CACHE_IDS.length} found behind cracked walls and vents`,
});
