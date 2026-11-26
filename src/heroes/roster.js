// Hero kits: who a player can be (workstream B, Long Night 2; contract: docs/design/long-night-2.md
// 4.1). A kit is data plus a model builder reference. Gameplay code never asks which kit it has;
// it reads the kit's numbers and names. Today's roster is the three existing suits; Robin variants,
// Nightwing, Batgirl, Red Hood, Superman and the rest join as more entries here.
//
// THE KIT INTERFACE
//   id          string, stable (saves, net messages, ?p2kit=): 'm', 'f', 'gold', ...
//   name        what the hero select shows
//   desc        one line for the select card
//   card        card art under public/assets/art/ (without extension)
//   model       { builder, suit }: how the body is built.
//               builder 'bat' is createBat(assets, suit) from src/actors/characters.js.
//               Any other builder id is looked up in the model-builder registry below: workstream
//               F's src/heroes/models/<id>.js exports `build(assets, kit)` returning the same shape
//               createBat returns (root, animator, face(), yaw, bone(), tilt, lm, colors, headWorld,
//               groundAt ...: the shared 65-bone rig, so every clip plays on it) and registers it:
//                   import { registerModelBuilder } from '../roster.js';
//                   registerModelBuilder('nightwing', build);
//   moves       the move set: clip names per role. Combat reads it in wave 2 (workstream I owns
//               the move logic); today every kit lists the moves the game already plays.
//   traversal   { style, moves }: style 'glide' | 'grapple' | 'flight' | 'acrobat'; moves is the
//               traversal set the hero has (glide, grapple, divebomb, wallrun, ladder, zip, ledge).
//   stats       multipliers on the base hero: health, speed, damage, toughness (all 1 = Batman).
//   gadgets     gadget ids from src/gadgets/gadgetDefs.js this hero carries.
//   voice       voice-line keys by situation (hurt, down, revive, taunt, teamUp); '' = none yet.
//   unlock      null, or the progress flag that unlocks it ('goldUnlocked').

// The moves the game plays today (src/combat/combatSystem.js, strikeChoice.js, moveSelect.js).
const BAT_MOVES = Object.freeze({
  punches: ['Punch_Jab', 'Punch_Cross', 'Punch_BodyJab', 'Punch_BodyHook', 'Punch_Hook_L', 'Punch_ShortHook', 'Elbow_Head', 'Punch_LeadUppercut', 'Punch_Uppercut', 'Elbow_Strike'],
  kicks: ['Kick_Front', 'Kick_Low', 'Kick_Push', 'Kick_Round', 'Kick_Side', 'Knee_Muay', 'Knee_Strike'],
  counters: ['Melee_Hook', 'Elbow_Strike', 'Kick_Front', 'Punch_Uppercut'],
  finishers: { punch: ['Melee_Hook', 'Punch_Backfist', 'Punch_Hammer'], kick: ['Kick_Axe', 'Kick_Flip', 'Kick_Spin'] },
  ground: 'Punch_Hammer',
  special: 'Kick_Round',
  air: 'Kick_Flying',
  dodge: 'Roll',
  cape: 'Sword_Regular_B',
  throw: 'Sword_Heavy_Combo',
  chains: ['rope', 'head', 'domino', 'swarm'],
});
const BAT_TRAVERSAL = Object.freeze({ style: 'glide', moves: ['glide', 'grapple', 'grappleBoost', 'divebomb', 'wallrun', 'ladder', 'zip', 'ledge', 'vault'] });
const BAT_STATS = Object.freeze({ health: 1, speed: 1, damage: 1, toughness: 1 });
const BAT_GADGETS = Object.freeze(['batarang', 'claw', 'gel', 'smoke', 'remote', 'launcher', 'freeze', 'flashbang']);
const BAT_VOICE = Object.freeze({ hurt: '', down: '', revive: '', taunt: '', teamUp: '' });

export const KITS = Object.freeze([
  Object.freeze({
    id: 'm', name: 'The Bat', desc: 'Grey suit, black cape, black bat.', card: 'card_m',
    model: Object.freeze({ builder: 'bat', suit: 'm' }),
    moves: BAT_MOVES, traversal: BAT_TRAVERSAL, stats: BAT_STATS, gadgets: BAT_GADGETS, voice: BAT_VOICE, unlock: null,
  }),
  Object.freeze({
    id: 'f', name: 'Bat, with style', desc: 'Dark suit, gold bat, red hair.', card: 'card_f',
    model: Object.freeze({ builder: 'bat', suit: 'f' }),
    moves: BAT_MOVES, traversal: BAT_TRAVERSAL, stats: BAT_STATS, gadgets: BAT_GADGETS, voice: BAT_VOICE, unlock: null,
  }),
  Object.freeze({
    id: 'gold', name: 'Golden Knight', desc: 'Unlocked by finding all twelve Riddler trophies.', card: 'card_m',
    model: Object.freeze({ builder: 'bat', suit: 'gold' }),
    moves: BAT_MOVES, traversal: BAT_TRAVERSAL, stats: BAT_STATS, gadgets: BAT_GADGETS, voice: BAT_VOICE, unlock: 'goldUnlocked',
  }),
]);

export const DEFAULT_KIT = 'm';
const byId = new Map(KITS.map((k) => [k.id, k]));

// The kit for an id; unknown ids fall back to the default (an old save's suit always maps).
// Legacy ids first ('m', 'f', 'gold' keep their objects), then every co-op roster kit id.
export function kitById(id) { return byId.get(id) ?? rosterKits.get(id) ?? byId.get(DEFAULT_KIT); }

// Kits this save can pick (locked ones need their progress flag).
export function availableKits(progress = {}) { return KITS.filter((k) => !k.unlock || !!progress[k.unlock]); }

// Traversal styles (workstream D1): 'glide' cape glide + grapple (the Bat family), 'acrobat' lines
// and flips (Nightwing, the Robins: no long glide), 'wings' glider wings (the future Batman),
// 'flight' (Superman, bounded by stamina and altitude), 'grapple' grapple and jumps only.
export const TRAVERSAL_STYLES = ['glide', 'grapple', 'flight', 'acrobat', 'wings'];

// Every field a kit must have, and their types: used by the unit test and by registerKit.
export const KIT_FIELDS = { id: 'string', name: 'string', desc: 'string', card: 'string', model: 'object', moves: 'object', traversal: 'object', stats: 'object', gadgets: 'object', voice: 'object' };
export function kitProblems(kit) {
  const out = [];
  for (const [f, t] of Object.entries(KIT_FIELDS)) if (typeof kit?.[f] !== t || kit[f] === null) out.push(`${f} should be ${t}`);
  if (kit?.model && typeof kit.model.builder !== 'string') out.push('model.builder should be a string');
  if (kit?.traversal && !TRAVERSAL_STYLES.includes(kit.traversal.style)) out.push('traversal.style unknown');
  if (kit?.stats) for (const s of ['health', 'speed', 'damage', 'toughness']) if (typeof kit.stats[s] !== 'number') out.push(`stats.${s} should be a number`);
  return out;
}

// ---- model builders ----
// 'bat' is built in (createBat is passed in by the caller, so this file stays free of three.js and
// of the character code). Other builders register themselves from src/heroes/models/<id>.js.
const builders = new Map();
export function registerModelBuilder(id, build) { builders.set(id, build); }
export function hasModelBuilder(id) { return id === 'bat' || builders.has(id); }

// Builds a kit's body: `createBat` for the built-in builder, else the registered builder. A kit
// whose builder is not loaded falls back to the bat body in its suit (never a crash on an old build).
export function buildKitModel(kit, assets, { createBat }) {
  const m = kit.model;
  if (m.builder !== 'bat' && builders.has(m.builder)) return builders.get(m.builder)(assets, kit);
  return createBat(assets, m.suit ?? 'm');
}

// =================================================================================================
// THE CO-OP ROSTER (workstream D1, Long Night 2)
//
// Every playable hero, built on the kit interface above, plus what the hero select shows and
// what the co-op layer reads. The original three kits (KITS: 'm', 'f', 'gold') stay exactly as
// they were for single-player call sites; kitById() now also answers every roster kit id.
//
//   HEROES[i] = { id, name, tagline, builder, variant, suits | null, traversal (style), stats,
//                 signature, packs, teamTags, card, cardFilter }
//   kit id    a suit id from src/heroes/models/suits.js where the hero has suits ('m', 'year-one',
//             'nightwing-red', 'robin-winter', ...), else the hero id ('superman', 'batgirl', ...).
//             One id = one look, so a save stores one string per player (progress.coop.picks).
//
// THE KIT -> COMBAT INTERFACE (stable; workstream I reads it):
//   kit.moves      the move table (clip names per role: punches, kicks, counters, finishers,
//                  ground, special, air, dodge, cape, throw, chains). Batman's table is today's
//                  moves. Co-op kits list their pack clips under the same keys; combat may adopt
//                  them per fighter (fighter.player.kit.moves) without anything else changing.
//   kit.signature  [{ id, name, clip, pack, contact, reach, arc, power, launch, area, cooldown,
//                  when }]: the two signature moves the co-op layer plays itself
//                  (src/coop/signatures.js) through the fighter's own gadgetApi.landHit, so every
//                  hit goes through the normal combat bookkeeping. native: true means the move is
//                  combat's own (Batman's special and chain takedowns): nothing extra to play.
//   kit.stats      { health, speed, damage, toughness } multipliers (1 = Batman). health, speed
//                  and toughness are applied by the co-op layer; damage is handed to combat as data.
//   kit.packs      the animation packs (src/actors/animPacks.js) the kit's moves need: only these
//                  are downloaded, and only when the kit is picked.
// =================================================================================================

// Traversal profiles per style (numbers the hero reads; src/heroes/traversal.js has the rules).
export const TRAVERSAL_PROFILES = Object.freeze({
  glide: Object.freeze({ style: 'glide', moves: BAT_TRAVERSAL.moves, jump: 1, run: 1, glide: true, glideCruise: 17, glideMax: 48, wallRun: 1, grappleSpeed: 1, airFlips: 0 }),
  acrobat: Object.freeze({ style: 'acrobat', moves: Object.freeze(['grapple', 'grappleBoost', 'wallrun', 'ladder', 'zip', 'ledge', 'vault', 'flip', 'lineLaunch']), jump: 1.2, run: 1.06, glide: false, wallRun: 1.8, grappleSpeed: 1.35, airFlips: 1 }),
  wings: Object.freeze({ style: 'wings', moves: Object.freeze(['glide', 'grapple', 'grappleBoost', 'divebomb', 'wallrun', 'ladder', 'zip', 'ledge', 'vault']), jump: 1.05, run: 1.04, glide: true, glideCruise: 22, glideMax: 60, wallRun: 1, grappleSpeed: 1.1, airFlips: 0 }),
  flight: Object.freeze({ style: 'flight', moves: Object.freeze(['fly', 'hover', 'fastFlight', 'ledge', 'vault']), jump: 1.25, run: 1.08, glide: false, wallRun: 0, grappleSpeed: 1, airFlips: 0, flight: Object.freeze({ speed: 14, fast: 34, climb: 9, stamina: 12, regen: 3, ceiling: 45, hoverDrain: 0.6 }) }),
  grapple: Object.freeze({ style: 'grapple', moves: Object.freeze(['grapple', 'grappleBoost', 'wallrun', 'ladder', 'zip', 'ledge', 'vault']), jump: 1.05, run: 1.02, glide: false, wallRun: 1.2, grappleSpeed: 1.2, airFlips: 0 }),
});

const sig = (o) => Object.freeze({ arc: 1.4, reach: 2.6, power: 1.5, launch: 0, area: 0, cooldown: 7, when: 'ground', ...o });
const BAT_SIGNATURE = Object.freeze([
  sig({ id: 'special', name: 'Special takedown', native: true }),
  sig({ id: 'chain', name: 'Chain takedown', native: true }),
]);

// Move tables: the base set plus the kit's own pack clips where it has them.
const movesWith = (extra) => Object.freeze({ ...BAT_MOVES, ...extra });

// teamTags: the pairing categories (src/coop/teamMoves.js picks a team move from two heroes' tags).
const hero = (o) => Object.freeze({ suits: null, packs: Object.freeze([]), teamTags: Object.freeze([]), card: 'card_m', cardFilter: '', variant: null, ...o });
export const HEROES = Object.freeze([
  hero({ id: 'batman', name: 'Batman', tagline: 'Cape, grapple and every gadget.', builder: 'bat', suits: Object.freeze(['m', 'year-one', 'armoured', 'stealth', 'arctic', 'classic', 'noir', 'gold', 'sentinel', 'ashen', 'harbour', 'field-repair', 'question-mark', 'gardener']), traversal: 'glide', stats: BAT_STATS, signature: BAT_SIGNATURE, teamTags: Object.freeze(['shadow']) }), // [verify] + the two story-reward suits
  hero({ id: 'batwoman', name: 'Batwoman', tagline: 'Red hair, gold bat, the same cape and claws.', builder: 'bat', suits: Object.freeze(['f']), card: 'card_f', traversal: 'glide', stats: BAT_STATS, signature: BAT_SIGNATURE, teamTags: Object.freeze(['shadow']) }),
  hero({ id: 'nightwing', name: 'Nightwing', tagline: 'Escrima sticks, flips and lines. No cape.', builder: 'nightwing', suits: Object.freeze(['nightwing', 'nightwing-red', 'nightwing-tactical']), cardFilter: 'hue-rotate(185deg) saturate(1.6)', traversal: 'acrobat',
    stats: Object.freeze({ health: 0.9, speed: 1.08, damage: 0.95, toughness: 0.95 }), packs: Object.freeze(['heroes']), teamTags: Object.freeze(['acrobat']),
    signature: Object.freeze([
      sig({ id: 'escrima', name: 'Escrima flurry', clip: 'Staff_Combo2', pack: 'heroes', contact: 1.47, reach: 2.8, power: 1.6, cooldown: 6 }),
      sig({ id: 'wingKick', name: 'Wing spin kick', clip: 'Agile_SpinKick', pack: 'heroes', contact: 1.23, reach: 2.4, arc: 3.2, area: 2.6, power: 1.3, launch: 2.5, cooldown: 8, when: 'move' }),
    ]) }),
  hero({ id: 'robin', name: 'Robin', tagline: 'Bo staff and somersaults.', builder: 'robin', variant: 'classic', suits: Object.freeze(['robin', 'robin-winter', 'robin-shadow']), cardFilter: 'hue-rotate(-30deg) saturate(2)', traversal: 'acrobat',
    stats: Object.freeze({ health: 0.85, speed: 1.1, damage: 0.9, toughness: 0.9 }), packs: Object.freeze(['heroes']), teamTags: Object.freeze(['acrobat', 'protege']),
    signature: Object.freeze([
      sig({ id: 'boSmash', name: 'Bo smash', clip: 'Staff_Smash', pack: 'heroes', contact: 0.53, reach: 2.6, power: 1.7, cooldown: 6 }),
      sig({ id: 'leapStaff', name: 'Leaping staff', clip: 'Staff_JumpAttack', pack: 'heroes', contact: 1.53, reach: 5, power: 1.6, launch: 3, cooldown: 8, when: 'move' }),
    ]) }),
  hero({ id: 'robin-modern', name: 'Red Robin', tagline: 'Armoured, hooded, all business.', builder: 'robin', variant: 'modern', cardFilter: 'hue-rotate(-40deg) saturate(1.4) brightness(0.8)', traversal: 'acrobat',
    stats: Object.freeze({ health: 1, speed: 1.04, damage: 1, toughness: 1.05 }), packs: Object.freeze(['heroes', 'combat2']), teamTags: Object.freeze(['acrobat', 'protege']),
    signature: Object.freeze([
      sig({ id: 'legSweep', name: 'Leg sweep', clip: 'Sweep_Front', pack: 'combat2', contact: 0.57, reach: 2.6, arc: 3.4, area: 2.6, power: 1.2, cooldown: 7 }),
      sig({ id: 'snapKicks', name: 'Double snap kick', clip: 'Agile_DoubleSnap', pack: 'heroes', contact: 0.93, reach: 2.8, power: 1.6, cooldown: 6, when: 'move' }),
    ]) }),
  hero({ id: 'robin-staff', name: 'Robin (staff)', tagline: 'Two hands on the staff, sweeping wide.', builder: 'robin', variant: 'staff', cardFilter: 'hue-rotate(-20deg) saturate(1.6)', traversal: 'acrobat',
    stats: Object.freeze({ health: 0.9, speed: 1.06, damage: 1.05, toughness: 0.95 }), packs: Object.freeze(['heroes']), teamTags: Object.freeze(['acrobat', 'protege']),
    signature: Object.freeze([
      sig({ id: 'staffCombo', name: 'Staff combo', clip: 'Staff_Combo3', pack: 'heroes', contact: 2.2, reach: 2.8, arc: 2.4, area: 2.4, power: 1.5, cooldown: 7 }),
      sig({ id: 'vaultStrike', name: 'Vaulting strike', clip: 'Staff_JumpAttack', pack: 'heroes', contact: 1.53, reach: 5, power: 1.7, launch: 3, cooldown: 8, when: 'move' }),
    ]) }),
  hero({ id: 'batgirl', name: 'Batgirl', tagline: 'Fast feet, a short cape, a long reach.', builder: 'batgirl', cardFilter: 'hue-rotate(250deg) saturate(1.2)', traversal: 'glide',
    stats: Object.freeze({ health: 0.9, speed: 1.08, damage: 0.95, toughness: 0.95 }), packs: Object.freeze(['heroes']), teamTags: Object.freeze(['shadow', 'acrobat']),
    signature: Object.freeze([
      sig({ id: 'twirlKick', name: 'Butterfly twirl', clip: 'Agile_TwirlKick', pack: 'heroes', contact: 1.3, reach: 3, arc: 2.6, area: 2.4, power: 1.5, launch: 2, cooldown: 7 }),
      sig({ id: 'heelSpin', name: 'Spinning heel', clip: 'Agile_StepSpinKick', pack: 'heroes', contact: 1.17, reach: 2.8, power: 1.6, cooldown: 6, when: 'move' }),
    ]) }),
  hero({ id: 'red-hood', name: 'Red Hood', tagline: 'A brawler with a helmet and no patience.', builder: 'redHood', cardFilter: 'hue-rotate(-50deg) saturate(2.2) brightness(0.85)', traversal: 'grapple',
    stats: Object.freeze({ health: 1.1, speed: 1, damage: 1.15, toughness: 1.1 }), packs: Object.freeze(['heroes']), teamTags: Object.freeze(['brawler']),
    moves: movesWith({ punches: Object.freeze(['Brawl_LeadHook', 'Brawl_BackHook', 'Brawl_JabCross', 'Brawl_BodyJabCross', 'Punch_Jab', 'Punch_Cross']) }),
    signature: Object.freeze([
      sig({ id: 'flurry', name: 'Eight-punch flurry', clip: 'Brawl_Eight', pack: 'heroes', contact: 2.2, reach: 2.4, power: 2.2, cooldown: 7 }),
      sig({ id: 'elbowStep', name: 'Stepping elbow', clip: 'Brawl_ElbowStep', pack: 'heroes', contact: 0.57, reach: 3, power: 1.6, launch: 2, cooldown: 5, when: 'move' }),
    ]) }),
  hero({ id: 'future-bat', name: 'Future Batman', tagline: 'Glider wings and jet boots, decades ahead.', builder: 'futureBat', cardFilter: 'grayscale(1) contrast(1.4) brightness(0.6)', traversal: 'wings',
    stats: Object.freeze({ health: 1, speed: 1.05, damage: 1, toughness: 1 }), packs: Object.freeze(['heroes']), teamTags: Object.freeze(['shadow', 'aerial']),
    signature: Object.freeze([
      sig({ id: 'jetSlam', name: 'Jet slam', clip: 'Fly_Slam', pack: 'heroes', contact: 0.73, reach: 3.2, arc: 6.3, area: 3.2, power: 1.4, launch: 3, cooldown: 8 }),
      sig({ id: 'snapKicks', name: 'Snap kicks', clip: 'Agile_DoubleSnap', pack: 'heroes', contact: 0.93, reach: 2.8, power: 1.6, cooldown: 6, when: 'move' }),
    ]) }),
  hero({ id: 'gaslight-bat', name: 'Gaslight Batman', tagline: 'A Victorian coat-cape and an old-fashioned hammer fist.', builder: 'gaslightBat', cardFilter: 'sepia(1) contrast(1.1)', traversal: 'glide',
    stats: Object.freeze({ health: 1.1, speed: 0.95, damage: 1.1, toughness: 1.1 }), packs: Object.freeze(['combat2']), teamTags: Object.freeze(['shadow', 'brawler']),
    signature: Object.freeze([
      sig({ id: 'hammerDown', name: 'Hammer down', clip: 'Hammer_Down', pack: 'combat2', contact: 0.83, reach: 2.6, power: 2, cooldown: 6 }),
      sig({ id: 'backSweep', name: 'Gaslight sweep', clip: 'Sweep_Back', pack: 'combat2', contact: 0.47, reach: 2.6, arc: 6.3, area: 2.6, power: 1.2, cooldown: 7, when: 'move' }),
    ]) }),
  hero({ id: 'superman', name: 'Superman', tagline: 'Flight on a stamina meter. Mind the predator rooms.', builder: 'superman', cardFilter: 'hue-rotate(200deg) saturate(1.8)', traversal: 'flight',
    stats: Object.freeze({ health: 1.4, speed: 1.05, damage: 1.2, toughness: 1.4 }), packs: Object.freeze(['heroes']), teamTags: Object.freeze(['power', 'aerial']),
    signature: Object.freeze([
      sig({ id: 'groundSlam', name: 'Ground slam', clip: 'Fly_Slam', pack: 'heroes', contact: 0.73, reach: 3.6, arc: 6.3, area: 4, power: 1.6, launch: 4, cooldown: 9 }),
      sig({ id: 'powerPush', name: 'Power push', clip: 'Fly_PowerPush', pack: 'heroes', contact: 0.6, reach: 6, arc: 1.2, area: 0, power: 1.4, launch: 5, cooldown: 7, when: 'move' }),
    ]) }),
]);

const heroById = new Map(HEROES.map((h) => [h.id, h]));
export const heroOf = (id) => heroById.get(id) ?? null;

// The kit for one hero in one suit (frozen like the legacy kits). The legacy ids keep their
// legacy kit objects, so kitById('m') is the same object single-player always had.
const rosterKits = new Map();
function makeRosterKit(h, suit) {
  const id = suit ?? h.id;
  return Object.freeze({
    id, hero: h.id, name: h.name, desc: h.tagline, card: h.card, cardFilter: h.cardFilter,
    model: Object.freeze({ builder: h.builder, suit: suit ?? null, variant: h.variant }),
    moves: h.moves ?? BAT_MOVES,
    traversal: TRAVERSAL_PROFILES[h.traversal],
    stats: h.stats, gadgets: h.gadgets ?? BAT_GADGETS, voice: BAT_VOICE,
    signature: h.signature, packs: h.packs, teamTags: h.teamTags,
    unlock: null,
  });
}
for (const h of HEROES) for (const s of h.suits ?? [null]) {
  const k = makeRosterKit(h, s);
  if (!byId.has(k.id)) rosterKits.set(k.id, k);
}
// The legacy kits belong to these roster heroes.
const LEGACY_HERO = { m: 'batman', f: 'batwoman', gold: 'batman' };

// Every kit id, roster order (legacy ids where they belong).
export const ALL_KIT_IDS = Object.freeze(HEROES.flatMap((h) => (h.suits ?? [h.id]).slice()));
export function isKitId(id) { return typeof id === 'string' && (byId.has(id) || rosterKits.has(id)); }
// The roster hero a kit belongs to.
export function heroOfKit(kit) { return heroById.get(kit?.hero ?? LEGACY_HERO[kit?.id] ?? 'batman') ?? HEROES[0]; }
// The roster view of any kit (a legacy kit answers with its hero's profile, signature and packs).
export function kitInfo(kit) {
  const h = heroOfKit(kit);
  return {
    hero: h,
    traversal: kit?.traversal?.jump ? kit.traversal : TRAVERSAL_PROFILES[h.traversal],
    signature: kit?.signature ?? h.signature, packs: kit?.packs ?? h.packs, teamTags: kit?.teamTags ?? h.teamTags, stats: kit?.stats ?? h.stats,
  };
}
// Kits a save can pick for a hero (each suit's unlock from suits.js; heroes without suits are
// always open). suitUnlocked: (suitId) -> bool, passed in so this file stays free of suits.js.
export function heroKits(heroId, suitUnlocked = () => true) {
  const h = heroById.get(heroId);
  if (!h) return [];
  return (h.suits ?? [h.id]).map((id) => ({ kit: kitById(id), locked: h.suits ? !suitUnlocked(id) : false }));
}

// ---- [bruce] Civilian kits (workstream K) ----
// Out of the suit: what src/bruce/civilian.js plays a player as (Bruce Wayne; the ward off duty
// for a second player in a Bruce scene). Not in HEROES, so never offered in the hero select;
// kitById answers their ids. The player's hero object keeps its physics and collision; the
// civilian overlay hides the suit and walks a civilian figure with these numbers. No gadgets, no
// combat moves: a guard, a shove and the conversation tags the scenes use.
export const CIVILIAN_TRAVERSAL = Object.freeze({ style: 'civilian', moves: Object.freeze(['walk', 'ladder']), jump: 0, run: 0.45, glide: false, wallRun: 0, grappleSpeed: 0, airFlips: 0 });
const civKit = (o) => Object.freeze({
  card: 'card_m', cardFilter: '', traversal: CIVILIAN_TRAVERSAL, gadgets: Object.freeze([]), voice: BAT_VOICE, unlock: null, civilian: true,
  stats: Object.freeze({ health: 1, speed: 0.45, damage: 0, toughness: 1 }), signature: Object.freeze([]), packs: Object.freeze(['story', 'civ']), teamTags: Object.freeze([]),
  moves: Object.freeze({ guard: 'Idle_Shield_Loop', shove: 'Shield_OneShot', walk: 'Civ_Walk_M', brisk: 'Civ_Walk_Hurried', limp: 'Story_Limp', observe: 'Story_Examine', talk: Object.freeze(['Story_Talk_One', 'Story_Talk_Two', 'Story_Talk_Arm', 'Story_Shrug']) }),
  conversation: Object.freeze(['charm', 'deflect', 'honest', 'act', 'sharp']),
  ...o,
});
export const CIVILIAN_KITS = Object.freeze([
  civKit({ id: 'bruce-civ', hero: 'bruce', name: 'Bruce Wayne', desc: 'Out of the suit: talk, read the room, slip away.', model: Object.freeze({ builder: 'bruce', suit: null, outfits: Object.freeze(['tux', 'suit', 'casual', 'training']) }) }),
  civKit({ id: 'ward-civ', hero: 'ward', name: 'The ward, off duty', desc: 'Jeans, a jacket and a talent for making a scene.', model: Object.freeze({ builder: 'look', suit: null, look: 'ward' }) }),
]);
for (const k of CIVILIAN_KITS) rosterKits.set(k.id, k);
// ---- [bruce] end ----
