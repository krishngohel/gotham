// [verify] Where the story's non-wheel rewards land. The nights and the open world emit
// `storyReward { id: 'kind:name' }` (docs/design/story-format.md 7); gadgets and suits already
// reached progression through ./storyRewards.js, but 'upgrade:', 'lore:', 'skill:', 'xp:' and the
// gear-not-gadget 'gadget:sporeFilter' went nowhere. This file is the data and the saved state
// for the two kinds that need a home of their own:
//
//   gear   story kit that goes with the suit (filters, linings): a small, real resistance on the
//          shared effects object (wayneTech applies gearOps), listed under "Gear" in the suit vault
//   lore   case-file pages: listed on the Batcomputer's Archive tab
//
// Saved as progress.storyLocker = { gear: [ids], lore: [ids] } (registerProgressField below; an
// old save without it loads with empty lists). What the player owns is that list joined with the
// rewards the save has already been paid (progress.campaign.rewards, progress.openworld.rewards),
// so a save that earned a filter before this existed still has it. Pure (no DOM).
import { registerProgressField } from '../core/save.js';

// ---- gear (content is data). `reward` is the exact story id that grants it.
export const STORY_GEAR = Object.freeze([
  Object.freeze({ id: 'rebreatherFilters', reward: 'upgrade:rebreatherFilters', night: 'n4', name: 'Rebreather filters',
    text: 'Fear toxin and gas hurt 15% less. Lucius cut them from the Rookery samples.', ops: Object.freeze([['gasMult', 'mul', 0.85]]) }),
  Object.freeze({ id: 'thermalLining', reward: 'upgrade:thermalLining', night: 'n5', name: 'Thermal lining',
    text: 'Cold hurts 15% less. Warm enough to stand in a freezer, not warm enough to enjoy it.', ops: Object.freeze([['coldMult', 'mul', 0.85]]) }),
  Object.freeze({ id: 'sporeFilter', reward: 'gadget:sporeFilter', night: 'n6', name: 'Spore filter',
    text: 'Clips into the rebreather. Pollen and spores hurt 10% less; hay fever is still your problem.', ops: Object.freeze([['gasMult', 'mul', 0.9]]) }),
  Object.freeze({ id: 'fireproofLining', reward: 'upgrade:fireproofLining', night: 'n7', name: 'Fireproof lining',
    text: 'Fire hurts 15% less. The cape still smells of smoke for a week.', ops: Object.freeze([['fireMult', 'mul', 0.85]]) }),
]);
const GEAR_BY_ID = new Map(STORY_GEAR.map((g) => [g.id, g]));
const GEAR_BY_REWARD = new Map(STORY_GEAR.map((g) => [g.reward, g]));
export const gearById = (id) => GEAR_BY_ID.get(id) ?? null;
export const gearForReward = (storyId) => GEAR_BY_REWARD.get(storyId) ?? null;

// ---- lore (content is data). `villain` points at the Batcomputer's villain file the page adds to.
const L = (id, title, text, villain = null) => Object.freeze({ id, title, text, villain });
export const LORE = Object.freeze([
  // the campaign
  L('icebergMenu', 'Iceberg Lounge menu', 'Every dish is named after a bird that cannot fly. The prices are named after the people who pay them.'),
  L('penguinFile', 'The Penguin: ledger pages', 'Pulled from the fish tank. The fish had read them first.', 'penguin'),
  L('riddlerFile', 'The Riddler: his own notes', 'Forty pages of riddles about me. Thirty-nine of them have the answer written underneath, in case I need help.', 'riddler'),
  L('hollowMen', 'The Hollow Men', 'Patients from the Narrows clinic, dosed and sent walking. None of them remember the walk. All of them remember the fear.'),
  L('crimeAlley', 'Crime Alley', 'Park Row, behind the old theatre. I keep this one short.'),
  L('scarecrowFile', 'The Scarecrow: lab books', 'Dose curves, in a neat hand, for a city of four million. The funding line reads Sionis Cold Holdings.', 'scarecrow'),
  L('coldCrew', 'The cold crew', 'Steelworkers paid in cash to keep the furnaces off. The overtime sheets were signed by a man in a refrigerated suit.'),
  L('sionisLedger', 'The Sionis ledger', 'Fear, frost and fire, all paid from one account. Somebody likes to buy his villains wholesale.'),
  L('freezeFile', 'Mr. Freeze: the chamber logs', 'Temperature, every hour, for six years. Next to each reading: one word, her name.', 'freeze'),
  L('thornGang', 'The Thorn gang', 'Park rangers who stopped taking orders from the city and started taking them from the ferns.'),
  L('ivyFile', 'Poison Ivy: seed catalogue', 'Every plant in Robinson Park, annotated. Next to the benches she has written "rest". Next to the car park, "remove".', 'ivy'),
  L('fireflyFile', 'Firefly: fuel receipts', 'Twelve tankers of aviation fuel, bought under the name "Mr. Phoenix". The clerk did not ask.', 'firefly'),
  L('maskFile', 'Black Mask: the file on me', 'His file on my methods. It is very thorough. It is also missing the part where I read it.', 'blackMask'),
  L('jokerFile', 'The Joker: the last word', 'A single card, left on the pier: "Same time next year?" No signature. None needed.', 'jokerRematch'),
  // the open world: cases, side chains and collectibles
  L('catBurglarFile', 'The cat burglar', 'Enters through skylights, leaves through skylights, takes only what fits in a coat pocket. The paw prints are a signature, not a mistake.'),
  L('clayBruteFile', 'Clay Feet: the night guard', 'Two of him clocked in. One of him was mud. The time card was fooled; the dog was not.'),
  L('clayManFile', 'The man made of mud', 'He gets bigger with every drum of chemicals he drinks. The Yards have run out of drums before he runs out of thirst.'),
  L('accountantLedger', 'The drowned accountant', 'He balanced the books for three gangs at once. The river balanced them for him.'),
  L('marqueePlaybill', 'Marquee Row playbill', 'Tonight only: the vanishing box office. The understudy did the vanishing.'),
  L('ghostBell', 'The bell that rang twice', 'No rope since 1952, a ring every morning at three. The ghost turned out to own a very quiet drill.'),
  L('twoFaceFile', 'The coin', 'A former prosecutor who lets a silver dollar pass sentence. Both sides are scarred now. So is the court.'),
  L('mercenaryFile', 'The contract', 'The best in the business took the job on me and filed a receipt for every bullet. Expensive, punctual, polite.'),
  L('riddleMap', 'The riddle map', 'Every question mark Edward hid in the city, joined up. Together they spell out his name. Of course they do.'),
  L('cityStories', 'Stories of the city', 'Recorded by people who stayed up late in Gotham. Most of them are about the weather. The good ones are about each other.'),
  L('photoAlbum', 'The photo album', 'Gotham from the rooftops, one picture at a time. Alfred has asked for copies.'),
]);
const LORE_BY_ID = new Map(LORE.map((e) => [e.id, e]));
export const loreById = (id) => LORE_BY_ID.get(id) ?? null;

// ---- skill rewards ('skill:<name>'): a free skill point, with the node Lucius has in mind for it.
export const STORY_SKILL_REWARDS = Object.freeze({ fearResistance: 'rebreather', readTheRoom: 'doubleCounter' });

// ---- the saved field
const ID = /^[a-zA-Z][a-zA-Z0-9]{0,31}$/;
const list = (v, known) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && ID.test(s) && known.has(s)))] : []);
export const LOCKER_DEFAULTS = Object.freeze({ gear: Object.freeze([]), lore: Object.freeze([]) });
export function sanitizeStoryLocker(raw) {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return { gear: list(r.gear, GEAR_BY_ID), lore: list(r.lore, LORE_BY_ID) };
}
// Kept across a new game, like progress.gadgets.unlocked (no `fresh`).
registerProgressField('storyLocker', { sanitize: sanitizeStoryLocker });

export function ensureLocker(progress) {
  if (!progress.storyLocker || typeof progress.storyLocker !== 'object') progress.storyLocker = sanitizeStoryLocker({});
  return progress.storyLocker;
}

// Reward ids the save has been paid, in the story's 'kind:name' form (the open world stores
// 'kind.name').
function paidIds(progress) {
  const out = [];
  for (const r of progress?.campaign?.rewards ?? []) if (typeof r === 'string') out.push(r);
  for (const r of progress?.openworld?.rewards ?? []) if (typeof r === 'string') out.push(r.replace('.', ':'));
  return out;
}
export function ownedGear(progress) {
  const have = new Set(progress?.storyLocker?.gear ?? []);
  for (const r of paidIds(progress)) { const g = gearForReward(r); if (g) have.add(g.id); }
  return STORY_GEAR.filter((g) => have.has(g.id)).map((g) => g.id);
}
export function ownedLore(progress) {
  const have = new Set(progress?.storyLocker?.lore ?? []);
  for (const r of paidIds(progress)) if (r.startsWith('lore:') && LORE_BY_ID.has(r.slice(5))) have.add(r.slice(5));
  return LORE.filter((e) => have.has(e.id)).map((e) => e.id);
}
// The gear's effect ops, for the effects rebuild (always on: gear is kit, not a suit perk).
export const gearOps = (progress) => ownedGear(progress).flatMap((id) => GEAR_BY_ID.get(id).ops.map((o) => o.slice()));

// Stores one gear or lore id; returns the entry if it was new, else null.
export function grantGear(progress, id) {
  const g = gearById(id);
  if (!progress || !g) return null;
  const k = ensureLocker(progress);
  if (k.gear.includes(id)) return null;
  k.gear.push(id);
  return g;
}
export function grantLore(progress, id) {
  const e = loreById(id);
  if (!progress || !e) return null;
  const k = ensureLocker(progress);
  if (k.lore.includes(id)) return null;
  k.lore.push(id);
  return e;
}

// ---- the surfaces (HTML strings; every text is escaped)
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// The suit vault's "Gear" list.
export function gearListHtml(progress) {
  const owned = ownedGear(progress);
  const rows = STORY_GEAR.map((g) => (owned.includes(g.id)
    ? `<li class="wd-gear-item"><b>${esc(g.name)}</b> &middot; ${esc(g.text)}</li>`
    : '<li class="wd-gear-item locked">Empty hook. Lucius is still working on it.</li>')).join('');
  return `<div class="wd-gear" aria-label="Gear"><h3>Gear</h3><ul>${rows}</ul></div>`;
}
// The Batcomputer's Archive tab.
export function archiveHtml(progress) {
  const owned = ownedLore(progress);
  if (!owned.length) return '<p>The archive is empty. Gotham will fill it.</p>';
  return `<p>${owned.length} of ${LORE.length} pages filed.</p>${owned.map((id) => { const e = LORE_BY_ID.get(id); return `<h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>`; }).join('')}`;
}
