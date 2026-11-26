// [prog] suits: the run-time wardrobe. Owns progress.wardrobe (registered here), turns campaign
// rewards `suit.<id>` into unlocks, notices when a suit's condition becomes true and announces it
// once per suit (a HUD card, plus `suitUnlocked { id }` on the bus), and equips looks.
//
//   const wardrobe = createWardrobe({ events, getProgress, save, getHud })
//   wardrobe.update(dt)        cheap throttled check (every 2 s) while a run is on
//   wardrobe.check()           check now (also run on trophy / crime / challenge / reward events)
//   wardrobe.equip(kitId)      -> bool; a Batman suit sets progress.suit (the save's suit), any
//                              other hero's look sets progress.wardrobe.equipped[heroId]
//   wardrobe.wearing(heroId)   -> the kit id that hero wears now
//   wardrobe.dispose()
//
// A returning save (one that played before the wardrobe existed) gets one batched card for every
// suit it had already unlocked ("New suits in the vault: A, B and C") instead of a toast each, and
// no `suitUnlocked` events for those (they are not new this session).
import { registerProgressField } from '../core/save.js';
import {
  sanitizeWardrobe, isSuitUnlocked, LOCKABLE_IDS, wardrobeEntry, wardrobeFor, isWardrobeId,
} from './suitData.js';
import { isSuitId, suitById } from '../heroes/models/suits.js';

let registered = false;
export function registerWardrobeSave() {
  if (registered) return;
  registered = true;
  registerProgressField('wardrobe', { sanitize: sanitizeWardrobe });
}
registerWardrobeSave();

export function ensureWardrobe(progress) {
  if (!progress.wardrobe || typeof progress.wardrobe !== 'object') progress.wardrobe = sanitizeWardrobe({});
  return progress.wardrobe;
}

// 'A', 'A and B', 'A, B and C'
export function listNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// A look that suits.js builds and whose hero is Batman (Batwoman's 'f' too): the save's suit.
export const isSaveSuit = (id) => isSuitId(id) && suitById(id).hero === 'batman';

export function createWardrobe({ events, getProgress, save = () => {}, getHud = () => null, checkEvery = 2 } = {}) {
  const offs = [];
  let timer = 0;

  function card(title, text) { getHud()?.card?.(title, text, 6000); }

  function check() {
    const p = getProgress?.();
    if (!p) return [];
    // Announcing needs a HUD: outside a run (the title) nothing is marked seen, so the next run
    // still shows it.
    if (!getHud()) return [];
    const w = ensureWardrobe(p);
    const fresh = LOCKABLE_IDS.filter((id) => !w.seen.includes(id) && isSuitUnlocked(id, p));
    if (!w.primed) {
      w.primed = true;
      w.seen.push(...fresh);
      if (fresh.length) {
        const names = fresh.map((id) => wardrobeEntry(id).name);
        card(fresh.length === 1 ? 'NEW SUIT IN THE VAULT' : 'NEW SUITS IN THE VAULT', `${listNames(names)} ${fresh.length === 1 ? 'is' : 'are'} waiting in the Batcave suit vault.`);
      }
      save();
      return [];
    }
    if (!fresh.length) return [];
    w.seen.push(...fresh);
    save();
    if (fresh.length === 1) {
      const e = wardrobeEntry(fresh[0]);
      card(`NEW SUIT: ${e.name.toUpperCase()}`, `${e.desc} Waiting in the Batcave suit vault.`);
    } else {
      card('NEW SUITS IN THE VAULT', `${listNames(fresh.map((id) => wardrobeEntry(id).name))} are waiting in the Batcave suit vault.`);
    }
    for (const id of fresh) events?.emit('suitUnlocked', { id });
    return fresh;
  }

  function reward({ id } = {}) {
    if (typeof id !== 'string' || !id.startsWith('suit.')) return;
    const kitId = id.slice(5);
    const p = getProgress?.();
    if (!p || !isWardrobeId(kitId)) return;
    const w = ensureWardrobe(p);
    // Prime first, so a reward on a save's first check is a real toast, not part of the batch.
    if (!w.primed) check();
    if (!w.rewarded.includes(kitId)) { w.rewarded.push(kitId); save(); }
    check();
  }

  if (events) {
    offs.push(events.on('campaignReward', reward));
    for (const ev of ['trophy', 'crimeStopped', 'challengeDone', 'objectiveDone', 'ngPlus']) offs.push(events.on(ev, () => { timer = checkEvery; }));
  }

  function wearing(heroId) {
    const p = getProgress?.() ?? {};
    const looks = wardrobeFor(heroId);
    if (!looks.length) return null;
    const saveSuit = p.suit ?? 'm';
    if (looks.some((l) => l.id === saveSuit)) return saveSuit;
    const eq = p.wardrobe?.equipped?.[heroId];
    if (eq && looks.some((l) => l.id === eq) && isSuitUnlocked(eq, p)) return eq;
    return (looks.find((l) => isSuitUnlocked(l.id, p) && !l.tailored) ?? looks[0]).id;
  }

  function equip(kitId) {
    const p = getProgress?.();
    const e = wardrobeEntry(kitId);
    if (!p || !e || e.tailored || !isSuitUnlocked(kitId, p)) return false;
    if (isSaveSuit(kitId)) p.suit = kitId;
    else ensureWardrobe(p).equipped[e.hero] = kitId;
    save();
    events?.emit('suitEquipped', { id: kitId, hero: e.hero });
    return true;
  }

  return {
    check, equip, wearing, reward,
    update(dt) {
      timer += dt;
      if (timer < checkEvery) return;
      timer = 0;
      check();
    },
    dispose() { for (const off of offs.splice(0)) off?.(); },
  };
}
