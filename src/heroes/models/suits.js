// The suit table: every selectable costume as data. Pure (no three.js), so the save sanitiser and
// the suit-select menu can import it without pulling in any model code.
//
//   id        what the save stores in progress.suit ('m' | 'f' | 'gold' are the original three
//             and keep their ids forever; old saves load unchanged)
//   hero      which hero kit wears it ('batman' suits go to createBat; 'nightwing' and 'robin'
//             suits to those builders' `suit` option)
//   name, desc, card, cardFilter   suit-select card text and art (a CSS filter tints a shared card)
//   unlock    null (always) or { text, test(progress) -> bool }; text is shown on a locked card
//   look      builder options (palette and parts), read by the hero's model builder
//
// Colours are sRGB hex. Batman palettes: suit (main body colour), dark (cowl, gloves, boots),
// accent (belt), emblem, line (inner ink lines; light on dark suits), cape, lens, skin.
const P = {
  ink: 0x0b0b12, cowl: 0x17181e, belt: 0xd9a92c, skin: 0xc99a7c, signal: 0xf2d24b, paper: 0xefe6cf,
};

const finished = (p) => p?.finished === true;
const trophies = (n) => (p) => (p?.trophies?.length ?? 0) >= n;
const crimes = (n) => (p) => (p?.crimes?.stopped ?? 0) >= n;
const ngPlus = (p) => { const n = p?.mode?.ngPlus; return typeof n === 'number' && Number.isFinite(n) ? n : 0; };
// [verify] A campaign reward the save has already been paid (progress.campaign.rewards, story form).
const storyPaid = (p, id) => Array.isArray(p?.campaign?.rewards) && p.campaign.rewards.includes(id);
const goldMedals = (p) => {
  const c = p?.challenges;
  if (!c || typeof c !== 'object') return 0;
  return Object.values(c).filter((r) => r?.medal === 'gold').length;
};

export const SUITS = [
  // ---- the original three (ids frozen: saves store them)
  { id: 'm', hero: 'batman', name: 'The Bat', desc: 'Grey suit, black cape, black bat.', card: 'card_m', unlock: null,
    look: { palette: { suit: 0xa0a5ae, dark: P.cowl, accent: P.belt, emblem: P.ink, line: P.ink, cape: P.cowl, lens: P.paper, skin: P.skin } } },
  { id: 'f', hero: 'batman', name: 'Bat, with style', desc: 'Dark suit, gold bat, red hair.', card: 'card_f', unlock: null, look: { base: 'f' } },
  { id: 'gold', hero: 'batman', name: 'Golden Knight', desc: 'Unlocked by finding all twelve Riddler trophies.', card: 'card_m', cardFilter: 'sepia(1) saturate(2.4) hue-rotate(-12deg) brightness(1.02) contrast(1.05)',
    unlock: { text: 'Find all twelve Riddler trophies.', test: (p) => p?.goldUnlocked === true },
    look: { palette: { suit: 0xd9a92c, dark: 0x3a2a0a, accent: P.signal, emblem: P.ink, line: P.ink, cape: 0x3a2a0a, lens: P.paper, skin: P.skin, plate: 0xb8861f }, armour: true, ears: 1.12 } },

  // ---- Batman alternates (original designs)
  { id: 'year-one', hero: 'batman', name: 'First Year', desc: 'Grey cloth, a stitched bat, a borrowed belt.', card: 'card_m', cardFilter: 'grayscale(0.7) brightness(1.05)',
    unlock: null,
    look: { palette: { suit: 0x8d9096, dark: 0x2a2b31, accent: 0x7a5a3a, emblem: 0x1d1e24, line: 0x1d1e24, cape: 0x26272d, lens: P.paper, skin: P.skin }, ears: 0.78, cape: { length: 1.1, bottomWidth: 1.05, pointDrop: 0.2 }, collar: 'none' } },
  { id: 'armoured', hero: 'batman', name: 'Armoured', desc: 'Plated for a war: chest, shoulders, shins.', card: 'card_m', cardFilter: 'grayscale(0.4) contrast(1.2) brightness(0.85)',
    unlock: { text: 'Finish the Long Night.', test: finished },
    look: { palette: { suit: 0x5a616d, dark: 0x14151a, accent: 0x9a9fa8, emblem: P.ink, line: P.ink, cape: 0x1b1c22, lens: P.paper, skin: P.skin, plate: 0x30343d }, ears: 1.08, armour: true } },
  { id: 'stealth', hero: 'batman', name: 'Stealth', desc: 'All black, matte, silent. Lines only show in the light.', card: 'card_m', cardFilter: 'grayscale(1) brightness(0.55) contrast(1.3)',
    unlock: { text: 'Stop five street crimes.', test: crimes(5) },
    look: { palette: { suit: 0x2a2d36, dark: 0x101115, accent: 0x30333c, emblem: 0x101115, line: 0x56657f, cape: 0x121318, lens: 0xbfe3ff, skin: P.skin }, mantle: false, collar: 'none', ears: 0.86, pouches: 'flat', cape: { length: 1.05, bottomWidth: 1.1, pointDrop: 0.12 } } },
  { id: 'arctic', hero: 'batman', name: 'Arctic', desc: 'Insulated white and steel, fur collar, ice-blue lenses.', card: 'card_m', cardFilter: 'grayscale(0.6) brightness(1.35) hue-rotate(160deg) saturate(0.6)',
    unlock: { text: 'Find six Riddler trophies.', test: trophies(6) },
    look: { palette: { suit: 0xd3d8e0, dark: 0x3b4250, accent: 0x7a8ea8, emblem: 0x3b4250, line: 0x2a3140, cape: 0x4a5a74, lens: 0x8fe0ff, skin: P.skin, fur: 0xe6e2d8 }, collar: 'fur', cape: { length: 1.15 } } },
  { id: 'classic', hero: 'batman', name: 'Blue and Grey', desc: 'The bright old colours: blue cape, yellow oval.', card: 'card_m', cardFilter: 'hue-rotate(190deg) saturate(1.6)',
    unlock: { text: 'Find three Riddler trophies.', test: trophies(3) },
    look: { palette: { suit: 0x9ca2ad, dark: 0x2e4a86, accent: P.signal, emblem: P.ink, line: P.ink, cape: 0x2e4a86, lens: P.paper, skin: P.skin, oval: P.signal }, emblemStyle: 'oval', trunks: 0x2e4a86 } },
  { id: 'noir', hero: 'batman', name: 'Noir', desc: 'Black, white and every grey between.', card: 'card_m', cardFilter: 'grayscale(1) contrast(1.4)',
    unlock: { text: 'Stop fifteen street crimes.', test: crimes(15) },
    look: { palette: { suit: 0xb9b9b9, dark: 0x121212, accent: 0x6a6a6a, emblem: 0x121212, line: 0x121212, cape: 0x161616, lens: 0xffffff, skin: 0xb5aca4 }, noir: true, ears: 1.18, cape: { length: 1.45, bottomWidth: 1.6, pointDrop: 0.28 } } },

  // ---- four later Batman looks (L1's progression data, src/progress/suitData.js NEW_BATMAN_SUITS:
  // same ids, text and conditions; the silhouette flags are the characters pass's)
  { id: 'sentinel', hero: 'batman', name: 'Sentinel', desc: 'Charcoal plate, an oxblood cape and a red bat that has seen the night twice.', card: 'card_m',
    cardFilter: 'grayscale(0.5) sepia(0.4) hue-rotate(-30deg) saturate(1.8) brightness(0.75)',
    unlock: { text: 'Finish New Game Plus once.', test: (p) => ngPlus(p) >= 1 },
    look: { palette: { suit: 0x3a3d44, dark: 0x15161b, accent: 0x7a1f24, emblem: 0xb3262e, line: 0x0d0d10, cape: 0x3d0f14, lens: 0xff6a56, skin: P.skin, plate: 0x24262d }, armour: true, bulk: 1.05, ears: 0.82, cape: { length: 1.36, bottomWidth: 1.5 } } },
  { id: 'ashen', hero: 'batman', name: 'Ashen', desc: 'Pale as cold soot, with ember seams that glow under the cape.', card: 'card_m',
    cardFilter: 'grayscale(0.8) sepia(0.5) brightness(1.15)',
    unlock: { text: 'Finish New Game Plus twice.', test: (p) => ngPlus(p) >= 2 },
    look: { palette: { suit: 0xc9c4bc, dark: 0x2b2522, accent: 0xd9772c, emblem: 0x2b2522, line: 0xd9772c, cape: 0x34302d, lens: 0xffd9a0, skin: P.skin }, ears: 0.9, cape: { length: 1.2, pointDrop: 0.3 }, seams: 0xd9772c, collar: 'none' } },
  { id: 'harbour', hero: 'batman', name: 'Harbour Watch', desc: 'Slate blue and brass, cut for wet rope and dock lights.', card: 'card_m',
    cardFilter: 'hue-rotate(170deg) saturate(0.9) brightness(0.9)',
    unlock: { text: 'Win gold in three challenges.', test: (p) => goldMedals(p) >= 3 },
    look: { palette: { suit: 0x4b5e72, dark: 0x1a2430, accent: 0xb8893a, emblem: 0x1a2430, line: 0x0f151c, cape: 0x1f2c3a, lens: 0xeaf4ff, skin: P.skin }, collar: 'none', coat: true, cape: { length: 1.05, bottomWidth: 1.15 } } },
  { id: 'field-repair', hero: 'batman', name: 'Field Repair', desc: 'Olive patches, a tan belt and a bat cut from gaffer tape.', card: 'card_m',
    cardFilter: 'sepia(0.7) hue-rotate(35deg) saturate(1.2) brightness(0.85)',
    unlock: { text: 'A campaign reward, or stop thirty street crimes.', test: (p) => (p?.crimes?.stopped ?? 0) >= 30 || storyPaid(p, 'suit:arkhamKnight') }, // [verify] the finale's suit reward (src/progress/storyRewards.js STORY_SUIT_ALIASES)
    look: { palette: { suit: 0x5e6247, dark: 0x24261c, accent: 0xa88a5a, emblem: P.paper, line: 0x1a1b14, cape: 0x2e3024, lens: P.paper, skin: P.skin }, ears: 0.92, patches: 0x4a4e38, pouches: 'extra' } },

  // ---- [verify] two story rewards (src/story/nights n3, n6 'suit:questionMarkCowl', 'suit:gardener'): palette
  // variants only, so they cost nothing to build. Also open once the save's campaign paid them.
  { id: 'question-mark', hero: 'batman', name: 'Question Mark', desc: 'Edward mailed it gift-wrapped: a green cowl and a question mark. Lucius painted the question out and kept the green.', card: 'card_m',
    cardFilter: 'hue-rotate(75deg) saturate(1.6) brightness(0.8)',
    unlock: { text: 'Night Three: answer the last riddle.', test: (p) => storyPaid(p, 'suit:questionMarkCowl') },
    look: { palette: { suit: 0x2f3d33, dark: 0x141a16, accent: 0x6b3f8f, emblem: 0x5fcf3a, line: 0x0e120f, cape: 0x1b2a1e, lens: 0xb6ff8a, skin: P.skin }, ears: 0.95 } },
  { id: 'gardener', hero: 'batman', name: 'Gardener', desc: 'Moss-green weave over bark-brown plates, cut from the thornproof cloth in the Conservatory. Smells faintly of compost.', card: 'card_m',
    cardFilter: 'sepia(0.5) hue-rotate(50deg) saturate(1.4) brightness(0.85)',
    unlock: { text: 'Night Six: see the park through to morning.', test: (p) => storyPaid(p, 'suit:gardener') },
    look: { palette: { suit: 0x4f6b3c, dark: 0x3a2c1e, accent: 0x8a6a3a, emblem: 0x2a1f14, line: 0x1c150d, cape: 0x2f4426, lens: 0xe8f5c8, skin: P.skin }, collar: 'none', cape: { length: 1.1 } } },

  // ---- Nightwing
  { id: 'nightwing', hero: 'nightwing', name: 'Nightwing', desc: 'Black suit, the blue bird shoulder to fingertip.', card: 'card_m', unlock: null, look: { wing: 0x49b4ff } },
  { id: 'nightwing-red', hero: 'nightwing', name: 'Red Wing', desc: 'The same cut in signal red.', card: 'card_m', unlock: { text: 'Finish the Long Night.', test: finished }, look: { wing: 0xd2363f } },
  { id: 'nightwing-tactical', hero: 'nightwing', name: 'Tactical', desc: 'Grey wing, padded shoulders and knees.', card: 'card_m', unlock: { text: 'Stop ten street crimes.', test: crimes(10) }, look: { wing: 0x8ea3bf, pads: true } },

  // ---- Robin (the classic builder)
  { id: 'robin', hero: 'robin', name: 'Robin', desc: 'Red tunic, green sleeves, yellow cape.', card: 'card_m', unlock: null, look: {} },
  { id: 'robin-winter', hero: 'robin', name: 'Winter Robin', desc: 'Forest green and snow, with a scarf.', card: 'card_m', unlock: { text: 'Find six Riddler trophies.', test: trophies(6) },
    look: { palette: { tunic: 0x2f6b3a, sleeves: 0xe8e4da, cape: 0x1d3a26, lining: 0xf2d24b, trunks: 0x1d3a26 }, scarf: 0xc8323c } },
  { id: 'robin-shadow', hero: 'robin', name: 'Shadow Robin', desc: 'Black and red, for the rooftops.', card: 'card_m', unlock: { text: 'Finish the Long Night.', test: finished },
    look: { palette: { tunic: 0xa82a32, sleeves: 0x16171d, cape: 0x16171d, lining: 0xa82a32, trunks: 0x16171d, legs: 0x16171d } } },
];

const BY_ID = new Map(SUITS.map((s) => [s.id, s]));
export const SUIT_IDS = SUITS.map((s) => s.id);
export const isSuitId = (id) => typeof id === 'string' && BY_ID.has(id);
// Any id -> a suit entry; unknown, empty or old-and-removed ids fall back to the grey Batman.
export const suitById = (id) => BY_ID.get(id) ?? BY_ID.get('m');
// Suits a hero can wear, in table order.
export const suitsFor = (hero) => SUITS.filter((s) => s.hero === hero);
export const suitUnlocked = (suit, progress) => !suit.unlock || !!suit.unlock.test(progress);
