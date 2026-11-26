// A hero's strike tables, read from its kit (src/heroes/roster.js `moves`, workstream D1's data
// shape) with Batman's tables as the default for anything a kit leaves out or gets wrong. Pure.
//
// What combat reads (all clip names on the shared skeleton):
//   punchTiers  [[...], [...], [...]]  punches by place in a chain (openers, hooks, uppercuts)
//   kicks       [...]                  the regular kick rotation
//   finishers   { punch: [...], kick: [...] }  the chain's last blow
//   counters    [...]                  counter strikes, rotated
//   ground      [...]                  blows on a goon lying down (punch)
//   stomp       [...]                  the same with a kick
//   beatdown    [...]                  the flurry on a stunned brute / armoured heavy
//   travel      { kick: [...], punch: [...] }  strikes whose own motion covers a 2.5-6 m gap
//   cape, throw, special, air          single clips
//   dodge       { forward, back, left, right, over }
//   reactLight / reactHeavy { front, back, left, right }  the hero's own hit reactions
// Pack clips (combat2) may be missing until the pack loads: callers filter with `has`.

export const BATMAN_MOVES = Object.freeze({
  punchTiers: [
    ['Punch_Jab', 'Punch_Cross', 'Punch_BodyJab'],
    ['Punch_Cross', 'Punch_Hook_L', 'Punch_Jab', 'Punch_ShortHook', 'Punch_BodyHook'],
    ['Punch_Uppercut', 'Punch_Hook_L', 'Punch_Cross', 'Punch_LeadUppercut', 'Elbow_Head'],
  ],
  kicks: ['Kick_Front', 'Kick_Push', 'Kick_Round', 'Kick_Low', 'Kick_Side', 'Knee_Muay'],
  finishers: { punch: ['Melee_Hook', 'Punch_Backfist', 'Finisher_ElbowUp', 'Punch_Hammer', 'Finisher_ElbowUpper'], kick: ['Kick_Spin', 'Kick_Axe', 'Kick_Flip'] },
  counters: ['Melee_Hook', 'Elbow_Strike', 'Kick_Front', 'Punch_Uppercut', 'Finisher_ElbowUp', 'Kick_SideRound'],
  ground: ['Hammer_Down', 'Punch_Hammer'],
  stomp: ['Ground_Stomp', 'Stomp'],
  beatdown: ['Finisher_Quad', 'Finisher_Four', 'Punch_Jab', 'Knee_Strike', 'Punch_Cross'],
  travel: { kick: ['Travel_FlyKick', 'Travel_ButterflyKick', 'Travel_SlideTackle'], punch: ['Travel_FlyKick', 'Travel_SlideTackle'] },
  cape: ['Cape_Swirl', 'Sword_Regular_B'],
  throw: ['Throw_Shoulder', 'Sword_Heavy_Combo'],
  special: 'Kick_Round',
  // The special takedown rotates through these (variety); `special` above stays the first.
  specials: ['Kick_Round', 'Finisher_ElbowUpper', 'Finisher_PalmCombo', 'Travel_DropKick'],
  air: 'Kick_Flying',
  dodge: { forward: ['Dodge_Roll', 'Roll'], back: ['Dodge_Backflip', 'Roll'], left: ['Dodge_Step_L', 'Dodge_Roll', 'Roll'], right: ['Dodge_Step_R', 'Dodge_Roll', 'Roll'], over: ['NinjaJump_Start'] },
  reactLight: { front: ['React_Light_Front', 'React_Light_Front2', 'Hit_Head'], back: ['React_Light_Back', 'Hit_Chest'], left: ['React_Light_Left', 'Hit_Head'], right: ['React_Light_Right', 'Hit_Chest'] },
  reactHeavy: { front: ['React_Heavy_Front', 'Hit_Knockback'], back: ['React_Heavy_Back', 'Hit_Knockback'], left: ['React_Heavy_Right_M', 'Hit_Knockback'], right: ['React_Heavy_Right', 'Hit_Knockback'] },
});

const strings = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'string');
const asList = (v) => (typeof v === 'string' ? [v] : strings(v) ? v : null);

// The tables for a kit. Today's roster lists Batman's old moves under other keys (punches, kicks,
// counters, finishers, ground, special, air, dodge, cape, throw): read them where they fit and
// keep the default where they don't. Never throws.
export function movesFor(kit) {
  const m = kit && typeof kit === 'object' ? kit.moves : null;
  const out = { ...BATMAN_MOVES, finishers: { ...BATMAN_MOVES.finishers }, travel: { ...BATMAN_MOVES.travel } };
  if (!m || typeof m !== 'object') return out;
  if (Array.isArray(m.punchTiers) && m.punchTiers.length && m.punchTiers.every(strings)) out.punchTiers = m.punchTiers;
  else if (strings(m.punches) && !samePunches(m.punches)) out.punchTiers = [m.punches.slice(0, 3), m.punches.slice(3, 7).length ? m.punches.slice(3, 7) : m.punches, m.punches.slice(7).length ? m.punches.slice(7) : m.punches];
  if (strings(m.kicks) && !sameList(m.kicks, ROSTER_DEFAULT.kicks)) out.kicks = m.kicks;
  if (strings(m.counters) && !sameList(m.counters, ROSTER_DEFAULT.counters)) out.counters = m.counters;
  if (m.finishers && typeof m.finishers === 'object') {
    if (strings(m.finishers.punch) && !sameList(m.finishers.punch, ROSTER_DEFAULT.finishers.punch)) out.finishers.punch = m.finishers.punch;
    if (strings(m.finishers.kick) && !sameList(m.finishers.kick, ROSTER_DEFAULT.finishers.kick)) out.finishers.kick = m.finishers.kick;
  }
  for (const k of ['beatdown', 'stomp']) if (strings(m[k])) out[k] = m[k];
  const ground = asList(m.ground);
  if (ground && !sameList(ground, ['Punch_Hammer'])) out.ground = ground;
  const cape = asList(m.cape);
  if (cape && !sameList(cape, ['Sword_Regular_B'])) out.cape = cape;
  const thr = asList(m.throw);
  if (thr && !sameList(thr, ['Sword_Heavy_Combo'])) out.throw = thr;
  if (typeof m.special === 'string' && m.special !== 'Kick_Round') { out.special = m.special; out.specials = [m.special]; }
  if (strings(m.specials)) out.specials = m.specials;
  if (typeof m.air === 'string') out.air = m.air;
  if (m.travel && typeof m.travel === 'object') for (const k of ['kick', 'punch']) if (strings(m.travel[k])) out.travel[k] = m.travel[k];
  if (m.dodge && typeof m.dodge === 'object' && !Array.isArray(m.dodge)) out.dodge = { ...BATMAN_MOVES.dodge, ...pickLists(m.dodge) };
  for (const k of ['reactLight', 'reactHeavy']) if (m[k] && typeof m[k] === 'object') out[k] = { ...BATMAN_MOVES[k], ...pickLists(m[k]) };
  return out;
}

// What src/heroes/roster.js ships for every Batman kit today: reading it back must give the
// upgraded Batman tables (it names the old mismatched clips: a sword swing for the cape...).
const ROSTER_DEFAULT = {
  kicks: ['Kick_Front', 'Kick_Low', 'Kick_Push', 'Kick_Round', 'Kick_Side', 'Knee_Muay', 'Knee_Strike'],
  counters: ['Melee_Hook', 'Elbow_Strike', 'Kick_Front', 'Punch_Uppercut'],
  finishers: { punch: ['Melee_Hook', 'Punch_Backfist', 'Punch_Hammer'], kick: ['Kick_Axe', 'Kick_Flip', 'Kick_Spin'] },
};
const ROSTER_PUNCHES = ['Punch_Jab', 'Punch_Cross', 'Punch_BodyJab', 'Punch_BodyHook', 'Punch_Hook_L', 'Punch_ShortHook', 'Elbow_Head', 'Punch_LeadUppercut', 'Punch_Uppercut', 'Elbow_Strike'];
const sameList = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
const samePunches = (a) => sameList(a, ROSTER_PUNCHES);
function pickLists(o) {
  const r = {};
  for (const [k, v] of Object.entries(o)) { const l = asList(v); if (l) r[k] = l; }
  return r;
}

// The first clip of a list the build has (null when none).
export const firstHad = (list, has) => (list ?? []).find((c) => has(c)) ?? null;
