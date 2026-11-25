// What each enemy role looks like, plays and costs, as data (the rules numbers live in
// src/combat/rules.js ENEMY; the AI in src/actors/enemy.js reads this table). Pure.
//
// Role spawn names (createEnemy / encounters / composeWave type strings): the story's old names
// keep working exactly (grunt, knife, brute, rifle, plus joker and harley), and the new roles are
// shield, baton, heavy, pistol, sniper, ninja, medic, lieutenant.
//
// Per role:
//   look      createGoon type (role looks: src/heroes/models/enemies.js; old goons: characters.js)
//   attacks   strike clips from the enemies pack, tried in order of preference
//   fallback  preloaded strike clips used until the pack arrives (or forever in tests)
//   kind      the attack kind combat resolves (ATTACK_DAMAGE / BLOCK_REDUCTION keys)
//   glyph     the tell over his head: 'blue' (counter), 'red' (dodge / don't counter)
//   cost      attack tokens it takes from the target's budget (director v2)
//   guard, walk, run, strafe: locomotion clips (pack names, preloaded fallbacks in brackets)
//   answer    the player's answer, for hints and docs
//   pack      true when the role's clips come from the enemies pack
export const ROLE_KIT = {
  grunt: { look: 'grunt', attacks: [], fallback: ['Goon_Hook', 'Goon_Haymaker'], kind: 'grunt', glyph: 'blue', cost: 1, answer: 'strike or counter', pack: false },
  knife: { look: 'knife', attacks: ['Knife_Slash', 'Knife_Lunge'], fallback: ['Goon_Stab'], kind: 'knife', glyph: 'blue', cost: 1, parryChain: 1, answer: 'counter each slash of the chain, or dodge', pack: true },
  brute: { look: 'brute', attacks: ['Brute_DoubleAxe', 'Brute_Swipe', 'Brute_HeavySwing'], fallback: ['Goon_Overhead', 'Goon_Headbutt'], kind: 'brute', glyph: 'red', cost: 2, charge: 0.45, guard: 'Brute_Idle', walk: 'Brute_Walk', answer: 'dodge the charge, cape stun, then beat down', pack: true },
  heavy: { look: 'heavy', attacks: ['Brute_HeavySwing', 'Brute_Punch', 'Brute_DoubleAxe'], fallback: ['Goon_Overhead', 'Goon_Headbutt'], kind: 'heavy', glyph: 'red', cost: 2, charge: 0.3, grab: 0.3, guard: 'Brute_Idle', walk: 'Brute_Walk', answer: 'dodge the charge or the grab, cape stun, then beat down (plain hits only chip the armour)', pack: true },
  shield: { look: 'shield', attacks: ['Shield_Bash', 'Shield_Strike'], fallback: ['Goon_Haymaker'], kind: 'shieldBash', glyph: 'blue', cost: 1, guard: 'Shield_BlockIdle', strafeL: 'Shield_StrafeL', strafeR: 'Shield_StrafeR', answer: 'vault over him (dodge through), cape stun, or an aerial attack; then strike', pack: true },
  baton: { look: 'baton', attacks: ['Baton_Slash', 'Baton_Down', 'Baton_Thrust'], fallback: ['Goon_Overhead', 'Goon_Hook'], kind: 'baton', glyph: 'red', cost: 2, answer: 'dodge his swing; stun him (cape, batarang) or hit him from behind or from the air; a strike while stunned takes the baton', pack: true },
  ninja: { look: 'ninja', attacks: ['Sword_LowSlash', 'Sword_Combo2H', 'Sword_SpinAttack'], fallback: ['Goon_Hook', 'Goon_Haymaker'], kind: 'sword', glyph: 'blue', cost: 1, guard: 'Sword_Idle2H', run: 'Ninja_Run', evade: ['Ninja_Cartwheel', 'Dodge_Step_L', 'Dodge_Step_R'], answer: 'he dodges plain strikes and reverses your first counter: counter again, vary the rhythm, cape stun or go aerial', pack: true },
  medic: { look: 'medic', attacks: [], fallback: ['Goon_Haymaker', 'Punch_Cross'], kind: 'grunt', glyph: 'blue', cost: 1, answer: 'take him out first: he gets knocked-out goons back up', pack: true },
  lieutenant: { look: 'lieutenant', attacks: [], fallback: ['Goon_Haymaker', 'Goon_Hook'], kind: 'grunt', glyph: 'blue', cost: 1, answer: 'take him out first: he steadies the squad and calls in backup', pack: false },
  rifle: { look: 'rifle', ranged: true, aim: 'Rifle_Aim', fire: 'Rifle_Fire', cover: 'Cover_Crouch', walk: 'Rifle_Walk', kind: 'rifle', glyph: 'red', cost: 1, answer: 'break line of sight, close the gap, or gadget him (batarang, claw)', pack: false },
  pistol: { look: 'gunner', ranged: true, aim: 'Pistol_Idle', fire: 'Pistol_Fire', cover: 'Cover_Crouch', walk: 'Pistol_Walk', strafeL: 'Pistol_StrafeL', strafeR: 'Pistol_StrafeR', melee: 'Pistol_Whip', kind: 'pistol', glyph: 'red', cost: 1, answer: 'close the gap (he ducks into cover between shots) or gadget him', pack: true },
  sniper: { look: 'sniper', ranged: true, aim: 'Sniper_KneelAim', idle: 'Sniper_Kneel', fire: 'Rifle_Fire', kind: 'sniper', glyph: 'red', cost: 1, laser: true, answer: 'break line of sight when the laser locks; climb to his nest or gadget him', pack: true },
};

// Old type names, kept for the story: a type with no entry plays as a grunt.
export const roleKit = (type) => ROLE_KIT[type] ?? ROLE_KIT.grunt;
export const ROLE_NAMES = Object.keys(ROLE_KIT);
// Every pack clip a role may play (primed when the pack lands).
export function roleClips(type) {
  const k = roleKit(type);
  return [...(k.attacks ?? []), k.guard, k.walk, k.run, k.strafeL, k.strafeR, k.aim, k.fire, k.cover, k.idle, k.melee, ...(k.evade ?? []),
    k.grab ? 'Grab_Slam' : null, type === 'medic' ? 'Medic_Kneel' : null, type === 'medic' ? 'Medic_Revive' : null, k.charge ? 'Brute_Roar' : null,
    k.charge ? 'Brute_Charge' : null, 'Fear_Flee', 'Fear_Kneel', 'Fear_BackAway', 'Thug_Taunt_Box', 'Thug_Insult', 'Shield_BlockHit', 'Shield_GuardBreak',
    'Rifle_HitReact'].filter(Boolean);
}
// The reaction / knockdown / get-up table every role shares (combat pack).
export const REACT_TABLE = {
  light: { front: ['React_Light_Front', 'React_Light_Front2'], back: ['React_Light_Back'], left: ['React_Light_Left'], right: ['React_Light_Right'] },
  heavy: { front: ['React_Heavy_Front', 'React_Heavy_Head'], back: ['React_Heavy_Back'], left: ['React_Heavy_Right_M'], right: ['React_Heavy_Right'] },
  knockdown: { front: 'KD_FromFront', back: 'KD_FromBack', left: 'KD_FromRight_M', right: 'KD_FromRight' },
  // Which get-up follows which fall (lying on the back or the front).
  lies: { KD_FromFront: 'back', KD_FromBack: 'front', KD_FromRight: 'back', KD_FromRight_M: 'back', KD_FlyBack: 'back', KD_Over: 'back', KD_Shoulder: 'front', Sweep_Front: 'back' },
  getup: { back: 'GetUp_Back', front: 'GetUp_Front' },
};
export const REACT_CLIPS = [
  ...Object.values(REACT_TABLE.light).flat(), ...Object.values(REACT_TABLE.heavy).flat(), ...Object.values(REACT_TABLE.knockdown),
  'KD_FlyBack', 'KD_Launch', 'KD_Over', 'Air_Flail', 'Air_HardLand', 'GetUp_Back', 'GetUp_Front', 'GetUp_KipUp', 'Stun_Dizzy', 'React_Flinch_L', 'React_Flinch_R', 'Block_Outward',
];
