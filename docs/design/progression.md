# Progression contract (workstream L1, tag `[prog]`)

This file is the agreement between L1 (progression, gadgets, suits, saves, options) and the agents
that read or feed it: **L3** (traversal + Batmobile behaviour reads `effects`), **K** (Batcave
stations, double-life Standing), **J1** (campaign rewards), **L2** (minimap marks), **M** (clock and
weather in photo mode), **I2** (combat reads `effects`). Ids listed here are frozen once merged:
never rename or repurpose one (saves store them).

## 1. The effects object

One live object per run (`game.wayne.effects`, also `hero.tuning`), rebuilt from the owned skill
nodes whenever a node is bought or refunded. Systems read numbers/flags from it every frame; they
never test node ids. Defaults (no nodes owned) are in `BASE_EFFECTS`, `src/progress/upgrades.js`.
Effects are declared per node as `[key, op, value]` with `op` one of `set | add | mul | max`
(`src/progress/skillTree.js`).

## 2. Skill tree node ids

Branch order and node ids. `*` = one of the 20 original WayneTech ids (same meaning, same first
five positions of their branch, so old saves load). `consumer` = who reads the effect.

| Branch (currency) | Node ids, in tree order | Effect keys | Consumer |
|---|---|---|---|
| armor (XP) | plating1* kevlar* plating2* medic* dampers* insulated fireweave rebreather ironclad secondWind hardenedCowl | maxHealthBonus knifeMult rangedMult regenDelay regenRate damageMult coldMult fireMult gasMult secondWind sniperMult | prog (hurtDamage, regen, secondWind) |
| combat (XP) | reflexes* flow* efficient* fastFinish* swarm* doubleCounter shieldBreaker disarm aerialPlus tripleCounter beatdownFinisher partnerTakedown | counterWindow comboShield chainDiscount specialAt batSwarm multiCounter shieldBreak disarmDestroy aerialDamage beatdownFinisher partnerTakedown | combat (I2), coop glue (D) for partnerTakedown |
| gadgets (XP) | triple* bigBang* quickSmoke* doubleClaw* deepFreeze* disruptorCharges sonicStun hackFast shockOvercharge glueSpread trackerMulti droneLong bolasDouble empWide decoyLong gadgetCombo | batarangCount gelRadius smokeCooldown clawTargets freezeTime disruptorCharges sonicStun hackWindow shockChargeRate glueRadius trackerTags droneTime bolasTargets empRadius decoyTime gadgetCombo | prog (gadget handlers); gadgetCombo: combat |
| traversal (XP) | accelerator* aero* grip* rails* seismic* grappleRange1 grappleBoost grappleRange2 glideReGrapple grapplePull wingsuit1 wingsuit2 wingsuit3 elSurfer updraftReader | boostUp boostOut diveGain glideMax wallRunTime ladderSlide diveRadius grappleRange grappleReel grappleBoost glideReGrapple grapplePull wingsuit elSurfer updrafts | hero.js (existing five); **L3** for the rest |
| predator (XP) | silentGlide quietFeet invertedTakedown fearTakedown1 dread fearTakedown2 ledgePlus | silentGlide footstepNoise invertedTakedown fearTakedowns fearGain ledgeTakedownPlus | stealth / combat (I2, J) |
| detective (XP) | scanRange forensics trackerNetwork hackRange | detectiveRange scanSpeed trackerPersist hackRange | J (cases), L2 (trackerPersist), prog (hackRange) |
| vehicle (XP) | pursuitTuning ramPlates battleArmor afterburner | carTopSpeed carRamDamage carArmor carAfterburner | **L3** |
| wayne (**Standing**) | wayneScholars appliedSciences alfredAlibis batmobileFunding oracleNetwork nightNurse downtownCave foundationFund alliesOnCall | xpMult rndDelivery suspicionMult pursuitModules crimeForewarning fatigueRecovery downtownCave heatRelief alliesOnCall | prog (xpMult); **K** for the rest |

L3's traversal values: `grappleRange` is a range multiplier (1, 1.25, 1.5), `grappleReel` a reel
speed multiplier (1, 1.2, 1.4), `grappleBoost` / `glideReGrapple` / `grapplePull` are booleans,
`wingsuit` is a tier 0..3 (1: dive and pull-up, 2: tighter turns, 3: speed tunnel and top speed),
`elSurfer` / `updrafts` booleans. Kits map them to their own traversal (Nightwing/Robin lines,
Superman flight) through `effectsFor(heroId)`.

Kit branches (XP, shown only when the save's player 0 plays that hero; ids prefixed by hero):
`nw.escrimaCharge nw.wallFlip nw.escrimaShock` (nightwing), `rb.staffVault rb.smokeDash
rb.staffSweep` (robin, robin-modern, robin-staff), `bg.twirlReach bg.acroDodge bg.cowlSense`
(batgirl), `rh.brawler rh.quickDraw rh.helmet` (red-hood), `sm.restraint sm.heatVision
sm.freezeBreath` (superman). Effect keys: `sigCooldownMult sigPower acrobatChain dodgeWindow
restraint heatVision freezeBreath` plus shared ones.

### Pacing

- XP per point: 1,000 for the first ten levels (Night One is unchanged), then +50 per level up to
  1,400 (`src/progress/xp.js` `xpForLevel`). An old save never loses points to the new curve: the
  difference is kept as `progress.wayne.bonusPoints` at load.
- Act gates: original 20 nodes = act 1; other nodes carry an `act` (1..5). The act comes from a
  provider (`setActProvider(fn)`, default: `progress.act` if a story sets it, else 5 once the Long
  Night is finished, else 1).
- Respec: `game.skillTree.respec()` refunds every XP node; free once per act (the Batcave bench),
  otherwise it is refused. Wayne nodes are not refunded (Standing spent stays spent).

### Standing provider (K)

```js
import { setStandingProvider } from './src/progress/standing.js';
setStandingProvider({ getStanding: () => n, spendStanding: (n) => boolean });
```
Default is a stub (`getStanding() === 0`, dev param `?standing=N` gives a session-only budget).

## 3. Gadget ids and campaign reward ids (J1)

New gadgets (in addition to the original eight): `disruptor sonic hack shock glue tracker drone
bolas emp decoy`. J1 emits rewards on the bus:

```js
events.emit('campaignReward', { id: 'gadget.disruptor' });   // any id below
```

| Reward id | Effect |
|---|---|
| `gadget.<id>` (one per new gadget above) | unlocks that gadget for the save, announced with the gadget card |
| `suit.<id>` (any suit id in `src/heroes/models/suits.js`) | unlocks that suit, with a new-suit toast |
| `skillPoint` | one free skill point (`progress.wayne.bonusPoints += 1`) |
| `ngPlus` | marks the save as finished for New Game Plus purposes |

Until J1 maps them, every new gadget also unlocks once the Long Night is finished. Dev:
`?gadgets=all` unlocks everything for the session (never saved).

## 4. Events other workstreams can listen for

| Event | Payload | Listener |
|---|---|---|
| `mapMark` | `{ id, kind: 'tracker' \| 'drone' \| 'hack', target?, pos?, ttl, player }` | L2 draws it; `ttl` 0 = until `mapUnmark` |
| `mapUnmark` | `{ id }` | L2 |
| `nodeBought` | `{ id, branch, player }` (also the old `upgradeBought { id }`) | audio, HUD |
| `suitUnlocked` | `{ id }` | HUD toast (prog), audio |
| `autosave` | `{ slot }` | HUD indicator (prog) |

## 5. UI stations (K)

`src/ui/stations.js`: `openStation(id, ctx)` with ids `skillTree`, `gadgets` (loadout), `suits`
(wardrobe). Unknown ids show a placeholder card and never throw. `ctx.onClose` is called when the
page closes.

## 6. Saves

Three slots. Slot 1 is the old key `gotham-progress-v1` byte for byte; slots 2 and 3 are
`gotham-progress-v1-slot2/3`; the guest profile (online co-op as a guest) is
`gotham-progress-v1-guest`. The active slot is `gotham-slot-v1`. Settings (`gotham-settings-v1`)
stay global. Export code: `GOTHAM1.<base64url(json)>.<crc32 hex>`; files are the same JSON with a
header. See `src/core/slots.js`.

## 7. What landed (hand-back notes for other workstreams)

- **Gadgets** (`src/gadgets/**`): `ALL_GADGETS` / `ALL_GADGET_IDS` (18) in `gadgetDefs.js`; `GADGETS`
  stays the original 8. Wheel = 3 pages of 8 (R/RT or Q flips while open); page 1 is the original
  wheel. Loadout station `gadgets` swaps slots (`progress.gadgets.loadout`, written only once
  edited). New combat hook `combat.gadgetApi.jam(e, sec)`. Events: `mapMark`/`mapUnmark` (payload
  `player` is the player id), `empPulse { pos, radius, time }` (L3: stall vehicles), `glueSeal`,
  `disruptorJam`, `sonicStun`, `hackDone`, `gadgetHit`. Extension points: `registerHackTarget()`,
  `registerPowerTarget()` (doors, cameras, generators when the city has them).
  **Online:** `jam` is not yet in `src/net/game/hostAdapter.js`'s FX list (D2 to add).
- **Suits** (`src/progress/suitData.js`, `wardrobe.js`, `src/ui/wardrobe.js`): `suitPerkOps`,
  `activeSuitPerkOps(kitId, settings)`, `perkText`, `isSuitUnlocked`, `ngPlusRewards(level)`,
  `NEW_BATMAN_SUITS` (sentinel, ashen, harbour, field-repair). Those four need appending to
  `SUITS` in `src/heroes/models/suits.js` and to the batman `suits` list in `roster.js` (F) before
  they can be worn; until then the vault shows them as "Being tailored". Events `suitUnlocked`,
  `suitEquipped`. Save field `wardrobe`.
- **Mode** (`src/progress/mode.js`): fields `mode` and `reputation` (the live
  `combat.reputation` object is stored and serialised through its `toJSON`). `remixWaveInputs(inputs,
  ngPlus)` is what J/I should pass `composeWave` inputs through in NG+.
- **Accessibility** (`src/ui/accessibility.js`, `src/ui/subtitles.js`): `TELLS` shape/pattern table,
  `qteWindowScale(settings)` / `qteAuto(settings)` for any timing minigame (the hack game reads settings.access.qteAssist directly).
- **Photo mode** (`game.photo`): per-player in co-op (`open(player)`), `freezesWorld` true only with
  one player; `photoEnv.js` feature-detects `world.clock` / `world.weather` (M: confirm the API).

## 8. [verify] Story rewards and effect readers (integration pass)

Every story reward kind now lands (`storyRewardTarget` in `src/progress/storyRewards.js`; the walk
in `tests/unit/rewardIds.test.js` fails on any id without a target):

| Story id | Lands as |
|---|---|
| `gadget:<id>` / `suit:<id>` | `campaignReward gadget.<id>` / `suit.<id>` (aliases: `STORY_GADGET_ALIASES`, `STORY_SUIT_ALIASES`: `questionMarkCowl` is the `question-mark` suit, `arkhamKnight` is `field-repair`) |
| `xp:<n>` (and a step optional's `xpGain`) | `campaignReward { id: 'xp', amount }`, awarded by wayneTech (5,000 cap a reward) |
| `skill:<name>` | `campaignReward { id: 'skillPoint', key, hint }`: one free point per save; `hint` is the node Lucius suggests (`STORY_SKILL_REWARDS`) |
| `upgrade:<id>`, `gadget:sporeFilter` | story gear (`src/progress/storyLocker.js` `STORY_GEAR`): small resistances on the effects, listed as Gear in the suit vault, then `campaignReward gear.<id>` |
| `lore:<id>` | an archive page (`LORE`), on the Batcomputer's Archive tab, then `campaignReward lore.<id>` |
| `ability:<id>` | the abilities layer (`src/abilities/runtime.js`) |

Gear and lore are saved in `progress.storyLocker = { gear, lore }`; what a save owns also counts
rewards already paid (`campaign.rewards`, `openworld.rewards`), so older saves keep theirs. XP a save
was "paid" before this wiring is not paid again.

Effect keys wired in this pass: `fearGain` (`src/enemies/fear.js` gain), `suspicionMult` and
`fatigueRecovery` (`src/bruce/doubleLife.js` `setLifeModifiers`). Bruce's `staminaRegenK` slows
flight stamina and out-of-combat health regen. Still declared but read by nothing, with the owner:

| Keys | Owner |
|---|---|
| `multiCounter shieldBreak disarmDestroy aerialDamage beatdownFinisher gadgetCombo` | combat (I2), `src/combat/combatSystem.js` |
| `sigCooldownMult sigPower acrobatChain dodgeWindow restraint heatVision freezeBreath` | combat kits (I2), `src/combat/kitMoves.js` |
| `partnerTakedown` | co-op glue (D) |
| `silentGlide invertedTakedown fearTakedowns ledgeTakedownPlus` | stealth / takedowns (I2, J), `src/stealth` |
| `scanSpeed` | detective scans (J3), `src/openworld/cases` |
| `elSurfer` | traversal (L3), the El |
| `crimeForewarning` | open-world crime director (J3) |
| `heatRelief` | district heat (J3 director) or the wanted level (W) |
| `rndDelivery pursuitModules downtownCave alliesOnCall` | the Wayne side (K) |
