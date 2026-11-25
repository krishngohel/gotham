// The eight gadgets, in wheel order (slot 0 at the top of the wheel, then clockwise). Pure data.
// kind: 'free' (no limit), 'cooldown' (seconds after each use), 'charges' (max; one refills every
// `recharge` seconds). unlock: null (always), { step } (once the story reaches that step id), or
// { finished: true } (after the credits). promptId is the tutorial prompt in src/ui/prompts.js.
export const GADGETS = [
  { id: 'batarang', slot: 0, name: 'Batarang', kind: 'free', unlock: null, promptId: 'batarang',
    unlockText: 'Always with you.', cardText: 'Stuns goons and interrupts attacks from far away.' },
  { id: 'remote', slot: 1, name: 'Remote Batarang', kind: 'cooldown', cooldown: 4, unlock: { step: 'toMonarch' }, promptId: 'gadgetRemote',
    unlockText: 'Unlocks after the street fight on Neon Row.', cardText: 'Steer it with the mouse. It stuns every goon it passes and smashes glass signs.' },
  { id: 'gel', slot: 2, name: 'Explosive Gel', kind: 'charges', max: 3, recharge: 5, unlock: { step: 'toNeon' }, promptId: 'gadgetGel',
    unlockText: 'Unlocks once the Wayne Tech cargo is safe.', cardText: 'Spray it, then set it off. Cracked walls hide secrets.' },
  { id: 'smoke', slot: 3, name: 'Smoke Pellet', kind: 'cooldown', cooldown: 12, unlock: { step: 'toStreet' }, promptId: 'gadgetSmoke',
    unlockText: 'Unlocks after the Gazette rooftop fight.', cardText: 'A cloud five meters across. Goons inside lose you.' },
  { id: 'launcher', slot: 4, name: 'Line Launcher', kind: 'cooldown', cooldown: 1.5, unlock: { step: 'toAce' }, promptId: 'gadgetLauncher',
    unlockText: 'Unlocks once the transmitter is seized.', cardText: 'A line to the wall ahead, and a free ride across. Even mid-glide.' },
  { id: 'claw', slot: 5, name: 'Batclaw', kind: 'cooldown', cooldown: 2, unlock: { step: 'toYard' }, promptId: 'gadgetClaw',
    unlockText: 'Unlocks after the first fight at the Docks.', cardText: 'Yank a goon to you for a free punch. Tears down vents and weak railings.' },
  { id: 'freeze', slot: 6, name: 'Freeze Blast', kind: 'charges', max: 2, recharge: 10, unlock: { step: 'toVat' }, promptId: 'gadgetFreeze',
    unlockText: 'Unlocks after the Ace Chemicals roof.', cardText: 'Ice for one goon. One hit shatters it and knocks them out.' },
  { id: 'flashbang', slot: 7, name: 'Flashbang', kind: 'cooldown', cooldown: 20, unlock: { finished: true }, promptId: 'gadgetFlashbang',
    unlockText: 'A last piece of Wayne Tech, after the story.', cardText: 'A blinding flash. Goons nearby are stunned and staggering.' },
];

export const GADGET_IDS = GADGETS.map((g) => g.id);

// ---- [prog] Wave 3 gadgets (docs/design/progression.md section 3) ----
// Ten more, on wheel pages 2 and 3 by default (src/gadgets/loadout.js). They unlock through the
// campaign (`campaignReward { id: 'gadget.<id>' }`, kept in progress.gadgets.unlocked) or, until
// the campaign maps them, once the Long Night is finished. unlock: { reward: true } marks that.
// `maxKey`: the effects key that sets the charge count (disruptorCharges). The original eight
// stay GADGETS/GADGET_IDS (their slots, tests and the story's unlocks are unchanged).
const EARNED = 'A WayneTech prototype, earned in the campaign.';
export const NEW_GADGETS = [
  { id: 'disruptor', name: 'Disruptor', kind: 'charges', max: 2, maxKey: 'disruptorCharges', recharge: 15, unlock: { reward: true }, promptId: 'gadgetDisruptor',
    unlockText: EARNED, cardText: 'Jam a gun from afar so it cannot fire, or kill the charge in a stun baton.' },
  { id: 'sonic', name: 'Sonic Batarang', kind: 'cooldown', cooldown: 6, unlock: { reward: true }, promptId: 'gadgetSonic',
    unlockText: EARNED, cardText: 'It lands and whines. Goons nearby turn to look at it, and stop looking at you.' },
  { id: 'hack', name: 'Remote Hacking Device', kind: 'cooldown', cooldown: 10, unlock: { reward: true }, promptId: 'gadgetHack',
    unlockText: EARNED, cardText: 'Crack a goon radio and send the squad chasing fake orders. Time the signal to break in.' },
  { id: 'shock', name: 'Shock Gloves', kind: 'cooldown', cooldown: 4, unlock: { reward: true }, promptId: 'gadgetShock',
    unlockText: EARNED, cardText: 'Charge the gloves, then punch through shields, batons and heavy armor.' },
  { id: 'glue', name: 'Glue Grenade', kind: 'charges', max: 3, recharge: 8, unlock: { reward: true }, promptId: 'gadgetGlue',
    unlockText: EARNED, cardText: 'Quick-set foam pins goons where they stand. One hit knocks a stuck goon out.' },
  { id: 'tracker', name: 'Tracker Dart', kind: 'charges', max: 3, recharge: 10, unlock: { reward: true }, promptId: 'gadgetTracker',
    unlockText: EARNED, cardText: 'Tag a goon or a car. The map follows it for you.' },
  { id: 'drone', name: 'Scout Drone', kind: 'cooldown', cooldown: 25, unlock: { reward: true }, promptId: 'gadgetDrone',
    unlockText: EARNED, cardText: 'Fly a little camera over the street and mark every goon it sees.' },
  { id: 'bolas', name: 'Bolas', kind: 'charges', max: 3, recharge: 6, unlock: { reward: true }, promptId: 'gadgetBolas',
    unlockText: EARNED, cardText: 'Wraps the legs and drops a goon on the spot. Ninjas and runners hate it.' },
  { id: 'emp', name: 'EMP Mine', kind: 'charges', max: 2, recharge: 15, unlock: { reward: true }, promptId: 'gadgetEmp',
    unlockText: EARNED, cardText: 'Drop it and walk away. When goons step close it fries every gun and baton around it.' },
  { id: 'decoy', name: 'Decoy Hologram', kind: 'cooldown', cooldown: 20, unlock: { reward: true }, promptId: 'gadgetDecoy',
    unlockText: EARNED, cardText: 'A Batman made of light. Goons shout at it, shoot at it and forget the real one.' },
];
export const NEW_GADGET_IDS = NEW_GADGETS.map((g) => g.id);
export const ALL_GADGETS = [...GADGETS, ...NEW_GADGETS];
export const ALL_GADGET_IDS = ALL_GADGETS.map((g) => g.id);

// [fix1] Story reward names that are not gadget ids (written in the night files before the gadget
// list was settled): the gadget each one stands for.
export const STORY_GADGET_ALIASES = { cryptographicSequencer: 'hack', thermalCharge: 'emp' };

// The gadget a campaign reward id unlocks ('gadget.disruptor' -> 'disruptor'), or null.
// [fix1] Also takes the story's own form ('gadget:disruptor', src/story/campaign.js REWARD_KINDS),
// through STORY_GADGET_ALIASES.
export function rewardGadgetId(rewardId) {
  if (typeof rewardId !== 'string' || !(rewardId.startsWith('gadget.') || rewardId.startsWith('gadget:'))) return null;
  const name = rewardId.slice(7);
  const id = STORY_GADGET_ALIASES[name] ?? name;
  return ALL_GADGET_IDS.includes(id) ? id : null;
}

// The new gadgets this save has: every one the campaign gave, kept in the sticky list or in the
// story's own record of rewards paid (progress.campaign.rewards).
// [fix1] No more "all of them once finished": `finished` is set at Night One's credits, so that
// fallback handed all ten out after Night One. The campaign now gives each one on a later night
// (the gadget rewards in src/story/nights/n2-n5.js).
export function unlockedNewIds(progress, sticky = []) {
  const paid = (progress?.campaign?.rewards ?? []).map(rewardGadgetId);
  return NEW_GADGET_IDS.filter((id) => sticky.includes(id) || paid.includes(id));
}

export function gadgetById(id) {
  return ALL_GADGETS.find((g) => g.id === id) ?? null;
}

export function isUnlocked(def, progress, steps) {
  if (!def.unlock) return true;
  if (progress.finished === true) return true;
  if (def.unlock.finished) return false;
  const i = steps.findIndex((s) => s.id === def.unlock.step);
  return i >= 0 && progress.step >= i;
}

// Unlocked by the story so far, plus `sticky` (every gadget ever unlocked, kept by a new game).
export function unlockedIds(progress, steps, sticky = []) {
  return GADGETS.filter((g) => sticky.includes(g.id) || isUnlocked(g, progress, steps)).map((g) => g.id);
}

// Hero controls no gadget acts under: a chain takedown's timeline (the Bat Swarm's too), the two
// stealth takedowns (the silent choke and the perch drop) and a challenge's 3-2-1 countdown. The
// wheel never opens over them and gel ignores the fire key.
export const NO_GADGET_CONTROLS = new Set(['chain', 'swarm', 'silent', 'perchDrop', 'countdown']);
export const gadgetsLocked = (hero) => NO_GADGET_CONTROLS.has(hero.control?.name) || hero.gadgetLock > 0; // [wanted] gadgets confiscated after a holding cell (seconds, src/wanted/wanted.js)

// Batman is free to start a gadget: no move in progress, or a combat move in its chain window
// (the gadget replaces it, the way the next punch would). Mirrors combat's own `free` test.
export function freeForGadget(hero) {
  const c = hero.control;
  return !c || (!!c.combat && !!c.canChain?.());
}

// The one card a returning save gets for gadgets it earned before they existed.
export function gadgetNewsCard(ids, wheelKey) {
  const names = ids.map((id) => gadgetById(id).name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
  return {
    title: 'WAYNETECH DELIVERY!',
    text: `Lucius sent new toys: ${list}. Hold ${wheelKey} for the gadget wheel.`,
  };
}

// [prog] The hints the wave 3 handlers raise (sys.hint(id)); game.js merges them into its HINTS.
// `key(action)` renders a bound key.
export function newGadgetHints(key) {
  return {
    'disruptor-none': () => 'No gun or charged baton in your sights for the disruptor.',
    'hack-none': () => 'Nothing to hack in range. Get within twelve meters of a goon and aim at him.',
    'hack-fail': () => 'Locked out! The radio squealed. Try again when it recharges.',
    'shock-ready': () => `The gloves are live! ${key('punch')} punch through shields, batons and armor.`,
    'tracker-none': () => 'Aim the tracker dart at a goon or a car.',
    'drone-busy': () => 'Finish your move first. The drone needs Batman standing still.',
    'drone-ground': () => 'Stand on solid ground to fly the drone.',
    'bolas-none': () => 'No goon in range to wrap up.',
    'emp-full': () => 'Two mines down already. Let one go off first.',
  };
}
