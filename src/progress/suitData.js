// [prog] suits: unlock conditions, light perks and New Game Plus rewards for every wearable look,
// as data. Pure (no DOM, no three.js): the wardrobe page, the hero select, the run-time wardrobe
// (src/progress/wardrobe.js) and the lead's effects rebuild all read it.
//
// Keyed by KIT ID (docs/design/progression.md): a suit id from src/heroes/models/suits.js where the
// hero has suits ('m', 'stealth', 'nightwing-red', ...), else the roster hero id ('batgirl',
// 'superman', ...). Those files belong to the characters workstream and are read-only here.
//
//   unlock    the suits.js entry's own `unlock` (same text, same test: never redefined here), or,
//             for a look that suits.js does not have, this file's own { text, test(progress) }.
//             null = always open. Any look can also be granted by a campaign reward `suit.<id>`
//             (J1), which the run-time wardrobe stores in progress.wardrobe.rewarded.
//   perk      { name, text, ops } where ops are [key, op, value] on the shared effects object
//             (keys from BASE_EFFECTS in src/progress/upgrades.js, op set | add | mul | max). Perks
//             only apply when settings.suitPerks is on; off (the default) every suit is cosmetic.
//
// PUBLIC API (for the lead and other workstreams)
//   suitPerkOps(kitId)              -> [[key, op, value], ...]  (always the data; [] for none)
//   activeSuitPerkOps(kitId, settings) -> same, or [] while settings.suitPerks is off
//   applyPerkOps(effects, ops)      applies ops in place (the same set/add/mul/max meaning as the
//                                   skill tree), returns effects
//   perkText(kitId)                 -> 'Stealth: footsteps 15% quieter.' | ''
//   isSuitUnlocked(kitId, progress) -> bool (the suits.js / own condition, or a campaign reward)
//   unlockText(kitId)               -> what a locked card says
//   ngPlusRewards(level)            -> [{ kind: 'suit', id, name }] granted on reaching NG+ level
//   NEW_BATMAN_SUITS                suits.js-shaped entries for the four new Batman looks (below)
//
// The lead calls, when rebuilding effects:
//   applyPerkOps(effects, activeSuitPerkOps(player.kit.id, settings))
import { SUITS, isSuitId, suitById } from '../heroes/models/suits.js';
import { HEROES } from '../heroes/roster.js';

const SKIN = 0xc99a7c, PAPER = 0xefe6cf;

const ngPlus = (p) => {
  const n = p?.mode?.ngPlus;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
};
const goldMedals = (p) => {
  const c = p?.challenges;
  if (!c || typeof c !== 'object') return 0;
  return Object.values(c).filter((r) => r?.medal === 'gold').length;
};
const crimes = (p) => p?.crimes?.stopped ?? 0;

// ---- four new Batman looks (original designs). Same shape as a suits.js entry, so the
// characters workstream can append them to SUITS (and their ids to roster HEROES batman.suits)
// unchanged; until then the wardrobe lists them as "being tailored" and they cannot be worn
// (createBat reads looks from suits.js only). Palette keys are the ones batman.js reads.
export const NEW_BATMAN_SUITS = Object.freeze([
  { id: 'sentinel', hero: 'batman', name: 'Sentinel', desc: 'Charcoal plate, an oxblood cape and a red bat that has seen the night twice.', card: 'card_m',
    cardFilter: 'grayscale(0.5) sepia(0.4) hue-rotate(-30deg) saturate(1.8) brightness(0.75)',
    unlock: { text: 'Finish New Game Plus once.', test: (p) => ngPlus(p) >= 1 },
    look: { palette: { suit: 0x3a3d44, dark: 0x15161b, accent: 0x7a1f24, emblem: 0xb3262e, line: 0x0d0d10, cape: 0x3d0f14, lens: 0xff6a56, skin: SKIN, plate: 0x24262d }, armour: true } },
  { id: 'ashen', hero: 'batman', name: 'Ashen', desc: 'Pale as cold soot, with ember seams that glow under the cape.', card: 'card_m',
    cardFilter: 'grayscale(0.8) sepia(0.5) brightness(1.15)',
    unlock: { text: 'Finish New Game Plus twice.', test: (p) => ngPlus(p) >= 2 },
    look: { palette: { suit: 0xc9c4bc, dark: 0x2b2522, accent: 0xd9772c, emblem: 0x2b2522, line: 0xd9772c, cape: 0x34302d, lens: 0xffd9a0, skin: SKIN }, ears: 0.9, cape: { length: 1.2 } } },
  { id: 'harbour', hero: 'batman', name: 'Harbour Watch', desc: 'Slate blue and brass, cut for wet rope and dock lights.', card: 'card_m',
    cardFilter: 'hue-rotate(170deg) saturate(0.9) brightness(0.9)',
    unlock: { text: 'Win gold in three challenges.', test: (p) => goldMedals(p) >= 3 },
    look: { palette: { suit: 0x4b5e72, dark: 0x1a2430, accent: 0xb8893a, emblem: 0x1a2430, line: 0x0f151c, cape: 0x1f2c3a, lens: 0xeaf4ff, skin: SKIN }, collar: 'none' } },
  { id: 'field-repair', hero: 'batman', name: 'Field Repair', desc: 'Olive patches, a tan belt and a bat cut from gaffer tape.', card: 'card_m',
    cardFilter: 'sepia(0.7) hue-rotate(35deg) saturate(1.2) brightness(0.85)',
    unlock: { text: 'A campaign reward, or stop thirty street crimes.', test: (p) => crimes(p) >= 30 },
    look: { palette: { suit: 0x5e6247, dark: 0x24261c, accent: 0xa88a5a, emblem: PAPER, line: 0x1a1b14, cape: 0x2e3024, lens: PAPER, skin: SKIN }, ears: 0.92 } },
]);
const NEW_BY_ID = new Map(NEW_BATMAN_SUITS.map((s) => [s.id, s]));

// ---- perks (light; only with settings.suitPerks). One line of text, one to two effect ops.
const PERKS = {
  // Batman
  m: null,
  f: { name: 'Bat, with style', text: 'Thrown gags and rifle shots hurt 5% less.', ops: [['rangedMult', 'mul', 0.95]] },
  gold: { name: 'Golden Knight', text: '5% more XP. Showing off pays.', ops: [['xpMult', 'mul', 1.05]] },
  'year-one': { name: 'First Year', text: 'Light cloth: wall runs last 0.1 s longer.', ops: [['wallRunTime', 'add', 0.1]] },
  armoured: { name: 'Armoured', text: 'Hits hurt 5% less; glide top speed 2 m/s lower.', ops: [['damageMult', 'mul', 0.95], ['glideMax', 'add', -2]] },
  stealth: { name: 'Stealth', text: 'Footsteps 15% quieter.', ops: [['footstepNoise', 'mul', 0.85]] },
  arctic: { name: 'Arctic', text: 'Cold hurts 40% less.', ops: [['coldMult', 'mul', 0.6]] },
  classic: { name: 'Blue and Grey', text: 'Counter window 0.03 s longer.', ops: [['counterWindow', 'add', 0.03]] },
  noir: { name: 'Noir', text: 'Fear builds 10% faster in predator rooms.', ops: [['fearGain', 'mul', 1.1]] },
  sentinel: { name: 'Sentinel', text: 'Sniper shots hurt 10% less.', ops: [['sniperMult', 'mul', 0.9]] },
  ashen: { name: 'Ashen', text: 'Fire hurts 30% less.', ops: [['fireMult', 'mul', 0.7]] },
  harbour: { name: 'Harbour Watch', text: 'Gas hurts 20% less.', ops: [['gasMult', 'mul', 0.8]] },
  'field-repair': { name: 'Field Repair', text: 'Health starts coming back 0.5 s sooner.', ops: [['regenDelay', 'add', -0.5]] },
  'question-mark': { name: 'Question Mark', text: 'Detective vision reaches 10% further.', ops: [['detectiveRange', 'mul', 1.1]] }, // [verify] story-reward suit
  gardener: { name: 'Gardener', text: 'Gas and spores hurt 15% less.', ops: [['gasMult', 'mul', 0.85]] }, // [verify] story-reward suit
  // Nightwing
  nightwing: { name: 'Nightwing', text: 'Dodge window 0.03 s longer.', ops: [['dodgeWindow', 'add', 0.03]] },
  'nightwing-red': { name: 'Red Wing', text: 'Aerial attacks hit 5% harder.', ops: [['aerialDamage', 'mul', 1.05]] },
  'nightwing-tactical': { name: 'Tactical', text: 'Knife slashes hurt 10% less.', ops: [['knifeMult', 'mul', 0.9]] },
  // Robin
  robin: { name: 'Robin', text: 'Dodge window 0.02 s longer.', ops: [['dodgeWindow', 'add', 0.02]] },
  'robin-winter': { name: 'Winter Robin', text: 'Cold hurts 30% less.', ops: [['coldMult', 'mul', 0.7]] },
  'robin-shadow': { name: 'Shadow Robin', text: 'Footsteps 10% quieter.', ops: [['footstepNoise', 'mul', 0.9]] },
  // Heroes without suits (Batwoman's one look is 'f', above)
  'robin-modern': { name: 'Red Robin', text: 'Hits hurt 3% less.', ops: [['damageMult', 'mul', 0.97]] },
  'robin-staff': { name: 'Robin (staff)', text: 'Counter window 0.02 s longer.', ops: [['counterWindow', 'add', 0.02]] },
  batgirl: { name: 'Batgirl', text: 'Dodge window 0.03 s longer.', ops: [['dodgeWindow', 'add', 0.03]] },
  'red-hood': { name: 'Red Hood', text: 'Rifle shots and thrown gags hurt 10% less.', ops: [['rangedMult', 'mul', 0.9]] },
  'future-bat': { name: 'Future Batman', text: 'Glide top speed 2 m/s higher.', ops: [['glideMax', 'add', 2]] },
  'gaslight-bat': { name: 'Gaslight Batman', text: 'Fire hurts 20% less.', ops: [['fireMult', 'mul', 0.8]] },
  superman: null, // strong enough already
};

// ---- New Game Plus rewards (the lead shows them on the NG+ screen). level = progress.mode.ngPlus.
export const NG_PLUS_REWARDS = Object.freeze([
  Object.freeze({ level: 1, kind: 'suit', id: 'sentinel' }),
  Object.freeze({ level: 2, kind: 'suit', id: 'ashen' }),
]);

// ---- the catalogue: every wearable look, roster order (hero, then that hero's suits)
function entryFor(heroId, kitId) {
  const existing = isSuitId(kitId) ? suitById(kitId) : null;
  const added = NEW_BY_ID.get(kitId) ?? null;
  const src = existing ?? added;
  const hero = HEROES.find((h) => h.id === heroId);
  return Object.freeze({
    id: kitId,
    hero: heroId,
    name: src?.name ?? hero?.name ?? kitId,
    desc: src?.desc ?? hero?.tagline ?? '',
    card: src?.card ?? hero?.card ?? 'card_m',
    cardFilter: src?.cardFilter ?? (existing || added ? '' : hero?.cardFilter ?? ''),
    // Same object as suits.js: the condition is identical by construction.
    unlock: src?.unlock ?? null,
    perk: PERKS[kitId] ?? null,
    // Only looks that suits.js already builds can be worn; a new suit is listed but tailored later.
    tailored: !existing && !!added,
  });
}

export const WARDROBE = Object.freeze(HEROES.flatMap((h) => {
  const ids = (h.suits ?? [h.id]).slice();
  if (h.id === 'batman') for (const s of NEW_BATMAN_SUITS) if (!ids.includes(s.id)) ids.push(s.id);
  return ids.map((id) => entryFor(h.id, id));
}));
// Any suit in suits.js that no roster hero lists (none today) still gets an entry.
const extra = SUITS.filter((s) => !WARDROBE.some((w) => w.id === s.id)).map((s) => entryFor(s.hero, s.id));
export const WARDROBE_ALL = Object.freeze([...WARDROBE, ...extra]);
const BY_ID = new Map(WARDROBE_ALL.map((w) => [w.id, w]));
export const WARDROBE_IDS = Object.freeze(WARDROBE_ALL.map((w) => w.id));

export const wardrobeEntry = (id) => BY_ID.get(id) ?? null;
export const wardrobeFor = (heroId) => WARDROBE_ALL.filter((w) => w.hero === heroId);
export const isWardrobeId = (id) => typeof id === 'string' && BY_ID.has(id);

const rewarded = (p, id) => Array.isArray(p?.wardrobe?.rewarded) && p.wardrobe.rewarded.includes(id);

// The look's own condition (suits.js or this file), ignoring rewards. Never throws.
export function conditionMet(id, progress) {
  const w = BY_ID.get(id);
  if (!w) return false;
  if (!w.unlock) return true;
  try { return !!w.unlock.test(progress); } catch { return false; }
}
export const isSuitUnlocked = (id, progress) => conditionMet(id, progress) || (isWardrobeId(id) && rewarded(progress, id));
export const unlockText = (id) => BY_ID.get(id)?.unlock?.text ?? '';
// Ids with a real unlock condition (the ones that can be "newly unlocked" and announced).
export const LOCKABLE_IDS = Object.freeze(WARDROBE_ALL.filter((w) => w.unlock).map((w) => w.id));

// ---- perks
export const PERK_OPS = Object.freeze(['set', 'add', 'mul', 'max']);
export function suitPerkOps(id) {
  const p = BY_ID.get(id)?.perk ?? PERKS[id];
  return p ? p.ops.map((o) => o.slice()) : [];
}
export const activeSuitPerkOps = (id, settings) => (settings?.suitPerks === true ? suitPerkOps(id) : []);
export function perkText(id) {
  const p = BY_ID.get(id)?.perk ?? PERKS[id];
  return p ? `${p.name}: ${p.text}` : '';
}
export function applyPerkOps(effects, ops) {
  for (const [key, op, v] of ops ?? []) {
    if (!(key in effects)) continue;
    if (op === 'set') effects[key] = v;
    else if (typeof effects[key] !== 'number') continue;
    else if (op === 'add') effects[key] += v;
    else if (op === 'mul') effects[key] *= v;
    else if (op === 'max') effects[key] = Math.max(effects[key], v);
  }
  return effects;
}

// ---- New Game Plus
export function ngPlusRewards(level) {
  const n = Number.isFinite(level) ? Math.floor(level) : 0;
  return NG_PLUS_REWARDS.filter((r) => r.level === n).map((r) => ({ kind: r.kind, id: r.id, name: BY_ID.get(r.id)?.name ?? r.id }));
}

// ---- the saved field: progress.wardrobe
//   rewarded  ids granted by campaign rewards (`suit.<id>`)
//   seen      ids already announced (toast, or the one batched card on a returning save)
//   equipped  { heroId: kitId } the look each non-Batman hero wears (Batman: progress.suit)
//   primed    false until the first check on this save ran (an old save's already-unlocked suits
//             are batched into one card then, never one toast each)
export const WARDROBE_DEFAULTS = Object.freeze({ rewarded: [], seen: [], equipped: {}, primed: false });
const idList = (v) => (Array.isArray(v) ? [...new Set(v.filter(isWardrobeId))].slice(0, 128) : []);
export function sanitizeWardrobe(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const equipped = {};
  if (r.equipped && typeof r.equipped === 'object' && !Array.isArray(r.equipped)) {
    for (const [hero, id] of Object.entries(r.equipped)) {
      if (HEROES.some((h) => h.id === hero) && isWardrobeId(id) && BY_ID.get(id).hero === hero) equipped[hero] = id;
    }
  }
  return { rewarded: idList(r.rewarded), seen: idList(r.seen), equipped, primed: r.primed === true };
}
