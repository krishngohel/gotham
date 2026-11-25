// Traversal and vehicle upgrades (workstream L3, `[move]`): the skill tree's effect keys
// (workstream L1: src/progress/skillTree.js, docs/design/progression.md) read into one plain
// numbers object the hero, the grapple and the vehicles consult. Pure.
//
// Effect keys this module reads from the shared `effects` object (defaults = today's game):
//   grappleRange   range multiplier (1, 1.25, 1.5)           -> grappleRange (m) = 52 x it
//   grappleReel    reel speed multiplier (1, 1.2, 1.4)       -> reel
//   grappleBoost   bool: the timed perfect boost             -> perfectBoost
//   glideReGrapple bool: chained re-grapples from a glide    -> reGrapple, chainCharges
//   grapplePull    bool                                      -> pull
//   wingsuit       tier 0..3 (1 dive and pull-up, 2 tighter turns, 3 speed tunnel and top speed)
//   updrafts       bool: rising air lifts harder (1.4x)      -> updraftMul
//   carTopSpeed    mul, carRamDamage mul, carArmor mul (damage taken), carAfterburner bool
// The node ids (grappleRange1, grappleRange2, grappleBoost, glideReGrapple, grapplePull, wingsuit1..3,
// pursuitTuning, ramPlates, battleArmor, afterburner) are also understood when a caller passes a list
// of owned ids instead (tests, an effects object of another shape). `?moves=all` owns everything (dev).
export const MOVE_NODES = Object.freeze([
  'grappleRange1', 'grappleRange2', 'grappleBoost', 'glideReGrapple', 'grapplePull',
  'wingsuit1', 'wingsuit2', 'wingsuit3', 'updraftReader',
  'pursuitTuning', 'ramPlates', 'battleArmor', 'afterburner',
]);

export const BASE_MOVES = Object.freeze({
  grappleRange: 52,     // m: the grapple's reach (src/world/grapple.js maxDist; 52 is today's)
  reel: 1,              // grapple zip speed multiplier
  perfectBoost: false,  // a timed jump at the end of a zip launches into a glide with the zip's momentum
  reGrapple: false,     // grapple again from a glide, chaining momentum
  chainCharges: 0,      // re-grapples per time off the ground (0: none)
  pull: false,          // grapple an aimed goon or object to yank it
  wingsuit: 0,          // 0 cape glide (today), 1..3 the wingsuit tiers
  updraftMul: 1,        // rising air strength
  topSpeed: 1,          // Batmobile top speed multiplier
  ramDamage: 1,         // ram damage multiplier (chase units, knocked traffic)
  armorMul: 1,          // Batmobile damage taken multiplier
  heatCap: 1,           // afterburner heat capacity multiplier
  barrage: false,       // missile barrage in battle mode (with the afterburner upgrade)
  winch: false,         // the nose winch pulls heavy pullables (with the ram plates)
});

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

// effects: the shared effects object | an array / Set of owned node ids | null.
export function moveEffects(effects = null, { all = false } = {}) {
  const m = { ...BASE_MOVES };
  const list = Array.isArray(effects) || effects instanceof Set ? new Set(effects) : null;
  const e = list ? {} : (effects ?? {});
  const has = (id) => all || !!list?.has(id);
  // The effect keys (the skill tree's own shape).
  const rangeMul = Math.max(num(e.grappleRange, 1), has('grappleRange2') ? 1.5 : has('grappleRange1') ? 1.25 : 1, all ? 1.5 : 1);
  m.grappleRange = Math.round(52 * rangeMul);
  m.reel = Math.max(num(e.grappleReel, 1), all ? 1.4 : 1);
  m.perfectBoost = e.grappleBoost === true || has('grappleBoost');
  m.reGrapple = e.glideReGrapple === true || has('glideReGrapple');
  m.pull = e.grapplePull === true || has('grapplePull');
  m.wingsuit = Math.max(0, Math.min(3, Math.floor(num(e.wingsuit, 0))), has('wingsuit3') ? 3 : has('wingsuit2') ? 2 : has('wingsuit1') ? 1 : 0);
  m.chainCharges = m.reGrapple ? (m.wingsuit >= 2 ? 4 : 3) : 0;
  m.updraftMul = e.updrafts === true || has('updraftReader') ? 1.4 : 1;
  m.topSpeed = Math.max(num(e.carTopSpeed, 1), has('pursuitTuning') ? 1.1 : 1);
  m.ramDamage = Math.max(num(e.carRamDamage, 1), has('ramPlates') ? 1.5 : 1);
  m.armorMul = Math.min(num(e.carArmor, 1), has('battleArmor') ? 0.7 : 1);
  const burner = e.carAfterburner === true || has('afterburner');
  m.heatCap = burner ? 1.6 : 1;
  m.barrage = burner;
  m.winch = m.ramDamage > 1;
  // An effects object may also carry a ready-made `moves` block (tests, a kit's own mapping).
  if (!list && effects && typeof effects.moves === 'object' && effects.moves) Object.assign(m, effects.moves);
  return m;
}

// The dev switch, read from a URL query string ('?moves=all').
export const movesAllFromQuery = (search = '') => new URLSearchParams(search).get('moves') === 'all';
