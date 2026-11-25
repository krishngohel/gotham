// Combat numbers and hit resolution. Pure.

// Difficulty (Long Night 2, workstream I). Hard comes from smarter, denser, faster-telegraphed
// enemies and fewer free heals, not from health bloat (research doc 3.5, "levers in order"):
//   budget / rangedBudget  attack tokens per target player (src/combat/director.js)
//   counterWarnings        whether the counter glyphs show (knightmare: no warnings)
//   tellMin                the shortest an attack may telegraph before contact (fairness floor)
//   smart                  0..1 behaviour level the squad AI reads (flanking, pickups, steals)
//   dodgeMul               multiplies the ninja / acrobat dodge chance
//   healAfterFight         fraction of max health given back when a fight ends (story: full)
//   regen                  out-of-combat recovery: { delay s since hurt, rate hp/s, cap fraction }
export const DIFFICULTIES = ['story', 'normal', 'hard', 'knightmare'];
export const DIFFICULTY = {
  // openHold (anim2 tuning): seconds before each goon of a new squad may first attack (was 1-2.6
  // on every tier: on hard and knightmare a quick player had half the fight won before anyone
  // swung).
  // armorBreak (story only, anim2 tuning): this many plain blows in a row on an armoured goon stun
  // him, as a cape stun would, so a player who only mashes can still finish a brute fight.
  story: { damage: 0.5, windup: 0.9, gap: [3.2, 5], maxWindups: 1, heroHealth: 150, budget: 1, rangedBudget: 1, counterWarnings: true, tellMin: 0.8, smart: 0.2, dodgeMul: 0.5, healAfterFight: 1, regen: { delay: 2, rate: 25, cap: 1 }, armorBreak: 5, openHold: [1.4, 3] },
  normal: { damage: 1, windup: 0.6, gap: [2.2, 4], maxWindups: 2, heroHealth: 100, budget: 3, rangedBudget: 1, counterWarnings: true, tellMin: 0.45, smart: 0.6, dodgeMul: 1, healAfterFight: 0.6, regen: { delay: 4, rate: 6, cap: 0.75 }, openHold: [1, 2.6] },
  hard: { damage: 1.5, windup: 0.45, gap: [1.6, 3], maxWindups: 2, heroHealth: 100, budget: 4, rangedBudget: 2, counterWarnings: true, tellMin: 0.35, smart: 0.85, dodgeMul: 1.3, healAfterFight: 0.35, regen: { delay: 6, rate: 3, cap: 0.5 }, openHold: [0.5, 1.4] },
  knightmare: { damage: 1.75, windup: 0.42, gap: [1.4, 2.6], maxWindups: 3, heroHealth: 100, budget: 5, rangedBudget: 2, counterWarnings: false, tellMin: 0.32, smart: 1, dodgeMul: 1.5, healAfterFight: 0, regen: { delay: 8, rate: 0, cap: 0 }, openHold: [0.3, 0.9] },
};
// The tier for an id; anything unknown (an old or edited setting) plays as normal.
export const difficultyOf = (id) => DIFFICULTY[id] ?? DIFFICULTY.normal;

// Health after a fight ends: a share of max given back, never less than the hero already has.
export function healAfterFight(difficulty, health, max) {
  const f = difficultyOf(difficulty).healAfterFight;
  return Math.max(health, Math.min(max, health + max * f));
}

// Out-of-combat regeneration for one frame: after regen.delay seconds unhurt and out of a fight,
// regen.rate hp per second up to regen.cap of max. Never lowers health.
export function regenStep(difficulty, { health, max, sinceHurt = 0, inCombat = false }, dt) {
  const r = difficultyOf(difficulty).regen;
  if (inCombat || sinceHurt < r.delay || r.rate <= 0) return health;
  const cap = max * r.cap;
  if (health >= cap) return health;
  return Math.min(cap, health + r.rate * dt);
}

export const ENEMY = {
  grunt: { health: 4, damage: 10, counterable: true, parry: false, armored: false, speed: 3.3, scale: 1 },
  knife: { health: 4, damage: 15, counterable: true, parry: true, armored: false, speed: 3.5, scale: 1 },
  brute: { health: 10, damage: 20, counterable: false, parry: false, armored: true, speed: 2.4, scale: 1.25 },
  rifle: { health: 4, damage: 15, counterable: false, parry: true, armored: false, speed: 3.2, scale: 1, ranged: true },
  joker: { health: 30, damage: 12, counterable: true, parry: false, armored: false, speed: 3.6, scale: 1, boss: true },
  // Harley Quinn, a mini-boss goon (src/actors/enemy.js, src/actors/harleyChar.js): about 6
  // grunts' worth of health, armored like a brute (immune to a plain punch/kick until stunned,
  // and so excluded from being a chain takedown's first target the same way brutes are, in
  // chains.js's `leaders`), but not a `boss`: chains, the swarm and dive-bomb shockwaves can all
  // still knock her down, they just never outright KO her (chainOutcome already reads that off
  // `def.armored`).
  harley: { health: 24, damage: 22, counterable: false, parry: false, armored: true, speed: 3.0, scale: 1.05 },
  // Roles (research doc 3.2): each one forces a different answer. Health stays modest; the role
  // flags are what make them hard.
  // shield: blocks frontal strikes; vault over (aerial), cape-stun, or hit from behind.
  shield: { health: 5, damage: 12, counterable: true, parry: false, armored: false, speed: 2.8, scale: 1.05, frontBlock: true },
  // baton: striking him barehanded while the baton is charged shocks you; dodge, cape, batarang, aerial.
  baton: { health: 4, damage: 18, counterable: false, parry: false, armored: false, speed: 3.3, scale: 1, shock: true },
  // heavy: armour; plain strikes only chip. Stun, then beatdown; grabs a hero who stands still.
  heavy: { health: 10, damage: 20, counterable: false, parry: false, armored: true, speed: 2.3, scale: 1.2, chip: true, grab: true },
  // pistol: takes cover and holds angles at mid range; close the gap or disarm with a gadget.
  pistol: { health: 3, damage: 12, counterable: false, parry: true, armored: false, speed: 3.4, scale: 1, ranged: true, cover: true, range: 18 },
  // sniper: laser-telegraphed long shot from a nest; break line of sight, then go and get him.
  sniper: { health: 3, damage: 35, counterable: false, parry: true, armored: false, speed: 3.0, scale: 1, ranged: true, laser: true, nest: true, range: 60 },
  // ninja: dodges plain strikes, counters your counters; vary the rhythm, cape stun, aerial.
  ninja: { health: 5, damage: 16, counterable: true, parry: false, armored: false, speed: 4.2, scale: 1, dodge: 0.35, counterCounter: true, sword: true },
  // medic: revives KO'd goons; priority target, interrupt the revive.
  medic: { health: 3, damage: 8, counterable: true, parry: false, armored: false, speed: 3.6, scale: 1, revive: true },
  // lieutenant: buffs morale and calls reinforcements; KO him first and the squad wavers.
  lieutenant: { health: 6, damage: 14, counterable: true, parry: false, armored: false, speed: 3.2, scale: 1.08, buff: true, reinforce: true },
};
// The rifleman keeps every old number; he also takes cover and lays down suppressing fire now.
ENEMY.rifle.cover = true;
ENEMY.rifle.suppress = true;

// damage, and whether the move knocks down / stuns / breaks a knife guard.
export const MOVES = {
  punch: { damage: 1 },
  beatdown: { damage: 1 },
  kick: { damage: 2, breaksGuard: true },
  jumpKick: { damage: 2, knockdown: true, breaksGuard: true },
  diveBomb: { damage: 2, knockdown: true, breaksGuard: true },
  counter: { damage: 1, knockdown: true, breaksGuard: true },
  cape: { damage: 0, stun: 1.5, stunOnly: true },
  batarang: { damage: 0, stun: 1.2, stunOnly: true },
  special: { ko: true },
  // Finishers and new attacks.
  heavy: { damage: 2, knockdown: true },
  spinKick: { damage: 3, knockdown: true, breaksGuard: true },
  slam: { damage: 2, knockdown: true, breaksGuard: true },
  throw: { damage: 1, knockdown: true, breaksGuard: true, noHeavy: true },
  thrownInto: { damage: 1, knockdown: true, breaksGuard: true },
  // Gadgets.
  gel: { damage: 1, knockdown: true, breaksGuard: true },
  remote: { damage: 0, stun: 1.5, stunOnly: true },
  claw: { damage: 0, stun: 1.2, stunOnly: true },
  smoke: { damage: 0, stun: 3, stunOnly: true },
  flashbang: { damage: 0, stun: 3, stunOnly: true },
  shatter: { ko: true },
  // Long Night 2 moves.
  aerial: { damage: 2, knockdown: true, breaksGuard: true, aerial: true },
  groundPound: { damage: 2, knockdown: true, groundKo: true },
  disarm: { damage: 0, stun: 1.2, stunOnly: true, disarms: true },
  travel: { damage: 1, breaksGuard: true },
};
// Barehanded blows: what a charged baton shocks.
const BAREHANDED = new Set(['punch', 'kick', 'counter', 'beatdown', 'heavy', 'spinKick']);
// Plain strikes: all a heavy's armour lets through is a chip.
const PLAIN = new Set(['punch', 'kick']);
// What gets past a shield from the front: going over it, stunning it, a counter turning it
// aside, and gadgets that break a guard.
const SHIELD_BREAKERS = new Set(['cape', 'batarang', 'remote', 'claw', 'smoke', 'flashbang', 'counter', 'gel', 'shatter', 'special', 'disarm']);

// How much of each attack a raised guard absorbs.
// Role attacks (Long Night 2): a baton and a grab cannot be blocked (dodge them), guns neither.
export const BLOCK_REDUCTION = { grunt: 0.8, knife: 0.5, brute: 0.4, charge: 0, joker: 0.6, gas: 0, buzzer: 0, rifle: 0, harleySlam: 0.3, harleySweep: 0.5, harleyThrow: 0.2,
  baton: 0, shieldBash: 0.6, grab: 0, pistol: 0, sniper: 0, sword: 0.4, shock: 0, heavy: 0.4 };
const ATTACK_DAMAGE = { grunt: 10, knife: 15, brute: 20, charge: 25, joker: 12, gas: 4, buzzer: 12, rifle: 15, harleySlam: 22, harleySweep: 14, harleyThrow: 6,
  baton: 18, shieldBash: 12, grab: 25, pistol: 12, sniper: 35, sword: 16, shock: 8, heavy: 20 };
// A rifle shot hurts a set amount per difficulty rather than Normal's figure times the difficulty
// multiplier: two Normal shots used to take half of Batman's health in under two seconds. Hard
// keeps what it had (25 x 1.5).
export const RIFLE_DAMAGE = { story: 10, normal: 15, hard: 37.5 };
// Knightmare's rifle shot, kept apart so the three original tiers stay exactly as pinned.
export const RIFLE_DAMAGE_EXTRA = { knightmare: 40 };

// Mutates enemy.health / enemy.stunned. Returns { outcome, damage, stun }.
// outcome: 'hit' | 'knockdown' | 'ko' | 'stun' | 'parried' | 'immune' | 'blocked' | 'shocked' | 'chip'
// ctx (optional): { fromBehind, aerial }: where the blow came from, for the shield bearer.
//   'blocked'  a shield bearer took it on the shield (front, not aerial, not a guard breaker)
//   'shocked'  a charged baton: the striker is hurt (the caller applies 'shock' to the hero)
//   'chip'     a heavy's armour: a quarter point of damage and no reaction
// Stun-only moves also report disarm: true when the move takes the weapon (MOVES.disarm).
export function resolveHit(move, enemy, ctx = {}) {
  const m = MOVES[move];
  const def = enemy.def ?? ENEMY[enemy.type];
  if (!m || !def) throw new Error(`Unknown move/enemy ${move}/${enemy.type}`);
  const stunned = !!enemy.stunned;
  if (m.groundKo && enemy.down && !def.boss) {
    enemy.health = 0;
    return { outcome: 'ko', damage: 0, stun: 0 };
  }
  if (def.frontBlock && !stunned && !enemy.down && !ctx.fromBehind && !ctx.aerial && !m.aerial && !m.ko && !SHIELD_BREAKERS.has(move)) {
    return { outcome: 'blocked', damage: 0, stun: 0 };
  }
  // From behind or from the air the baton can't be brought round: those blows land.
  if (def.shock && enemy.charged && !stunned && !enemy.down && !ctx.fromBehind && !ctx.aerial && !m.aerial && BAREHANDED.has(move)) {
    return { outcome: 'shocked', damage: 0, stun: 0 };
  }
  if (def.chip && !stunned && !enemy.down && PLAIN.has(move)) {
    enemy.health = Math.max(0.25, enemy.health - 0.25);
    return { outcome: 'chip', damage: 0.25, stun: 0 };
  }

  if (m.ko) {
    if (def.boss) return applyDamage(enemy, 3, false);
    enemy.health = 0;
    return { outcome: 'ko', damage: enemy.health, stun: 0 };
  }
  if (enemy.down && (move === 'punch' || move === 'kick' || move === 'beatdown') && !def.boss) {
    enemy.health = 0;
    return { outcome: 'ko', damage: 0, stun: 0 };
  }
  if (m.stunOnly) return m.disarms ? { outcome: 'stun', damage: 0, stun: m.stun, disarm: true } : { outcome: 'stun', damage: 0, stun: m.stun };
  // Nobody picks up a brute, or the Joker.
  if (m.noHeavy && (def.armored || def.boss)) return { outcome: 'immune', damage: 0, stun: 0 };
  if (def.armored && !enemy.stunned) return { outcome: 'immune', damage: 0, stun: 0 };
  // [fix1] A goon running away (fear's flee) parries nothing: his back is to the blow.
  if (def.parry && !enemy.stunned && enemy.state !== 'flee') {
    if (!m.breaksGuard) return { outcome: 'parried', damage: 0, stun: 0 };
    const r = applyDamage(enemy, m.damage, m.knockdown);
    return { ...r, stun: r.outcome === 'hit' ? 1.2 : 0 };
  }
  return applyDamage(enemy, m.damage, m.knockdown);
}

// A dive-bomb shockwave reaches out to `radius` on the ground and 2.5 m up/down.
export function inShockwave(c, p, radius = 4) {
  return Math.hypot(p.x - c.x, p.z - c.z) <= radius && Math.abs(p.y - c.y) <= 2.5;
}

// Whether a glide-state kick should start the dive-bomb attack (instead of the old
// target-seeking air kick, which still runs below this height).
export function shouldDiveBomb(state, heightAboveGround, threshold = 6) {
  return state === 'glide' && heightAboveGround > threshold;
}

function applyDamage(enemy, damage, knockdown) {
  enemy.health = Math.max(0, enemy.health - damage);
  if (enemy.health <= 0) return { outcome: 'ko', damage, stun: 0 };
  return { outcome: knockdown ? 'knockdown' : 'hit', damage, stun: 0 };
}

// Whether a hanging ledge takedown can target this enemy: alive, standing, unaware, not the
// boss or a grabbed goon, and within reach of the ledge's hang point.
export function canLedgeTakedown(enemy, ledge) {
  if (!enemy || !ledge || !enemy.alive || enemy.down || enemy.aware) return false;
  if (enemy.def?.boss || enemy.state === 'grabbed') return false;
  return Math.abs(enemy.pos.y - ledge.y) < 0.4 &&
    Math.hypot(enemy.pos.x - ledge.x, enemy.pos.z - ledge.z) < 1.5;
}

// Whether a hard landing can drop-takedown this enemy: alive, standing, not the boss or a
// grabbed goon (the boss can never be one-shot), and right under the hero.
export function canDropTakedown(enemy, heroPos) {
  if (!enemy || !heroPos || !enemy.alive || enemy.down) return false;
  if (enemy.def?.boss || enemy.state === 'grabbed') return false;
  return Math.hypot(enemy.pos.x - heroPos.x, enemy.pos.z - heroPos.z) < 1.2 &&
    Math.abs(enemy.pos.y - heroPos.y) < 1;
}

export function damageToHero(attack, { difficulty = 'normal', blocking = false, invulnerable = false } = {}) {
  if (invulnerable) return 0;
  const base = ATTACK_DAMAGE[attack] ?? 10;
  const reduction = blocking ? BLOCK_REDUCTION[attack] ?? 0 : 0;
  if (attack === 'rifle') return Math.round((RIFLE_DAMAGE[difficulty] ?? RIFLE_DAMAGE_EXTRA[difficulty] ?? RIFLE_DAMAGE.normal) * (1 - reduction) * 100) / 100;
  return Math.round(base * (1 - reduction) * difficultyOf(difficulty).damage * 100) / 100;
}
