# Story format: the campaign contract

Workstream J1 (Long Night 2). How a night is written, what each step type does, and the hooks
other workstreams use. Code: `src/story/**` (campaign, runner, runtime, step types),
`src/bosses/**` (boss framework). Night One is `src/game/story.js`, wrapped by
`src/story/nights/n1.js`. Everything here is plain data; the interpreters are small and unit-tested
(`tests/unit/campaign*.test.js`, `bosses.test.js`).

## 1. Shape

```
ACTS (src/story/campaign.js)            act1 The Long Night   n1
                                        act2 The Gilded City  n2 n3
                                        act3 The Underside    n4 n5
                                        act4 The Cold Front   (J2 writes n6 n7)
                                        act5 Arkham           (J2 writes n8)
night -> missions -> steps
```

A night file (`src/story/nights/nX.js`) default-exports one object and is registered in
`src/story/nights/index.js` (one import, one entry in the list). Play order is act order, then
`number`. Nothing else needs to change to add a night.

```js
export default {
  id: 'n6', act: 'act4', number: 6, actNumber: 4,        // ids are saved: never rename one
  title: 'Night Six: ...', blurb: 'one line for mission select',
  villain: 'mrFreeze',               // music id (src/audio/music/director.js VILLAIN_THEMES)
  gang: 'freeze',                    // default goon colours (src/heroes/models/enemies.js GANGS)
  districts: ['museum'],             // district ids (src/world/regions/data.js); composeWave uses [0]
  timeOfDay: 22.5,                   // hours: world.clock.pin(h, { id: 'story:night' }) for the whole night
  weather: 'snow',                   // world.weather.pin(state, { id: 'story:night', snap: true }):
                                     // clear, overcast, drizzle, rain, storm, fog, snow
  start: 'siteId',                   // fallback respawn and replay placement
  day: { hook: 'day.n6', context: { ... }, fallback: [lines], time: 11, weather: 'overcast' },
                                     // the Bruce day BEFORE this night (pinned to daytime while it plays)
  sites: { name: { x, y, z, yaw? } },                              // the night's own named points
  fights: { id: FightDef }, rooms: { id: Room }, scenes: { name: (stage) => pages },
  missions: [{ id, title, checkpoint?, rewards?: [rewardId], replayable?: true, steps: [Step] }],
};
```

**Sites.** A step names places by id. Lookup order: the night's `sites`, then the core `SITES`
(`src/world/mapData.js`, frozen), then the regions' `REGION_SITES` (each region's data file lists
door, stealth, fight, vista sites). A literal `{ x, y, z }` works anywhere an id does. `y` is the
walkable surface (reach checks allow 6 m, fights snap to the ground from `y + 3`). `requiredSites(night)`
(`src/story/campaign.js`) lists every city site id a night depends on (its own `sites` excluded):
the world workstreams keep those ids stable, and `tests/unit/campaign.test.js` checks they resolve.

**Saving.** Night One's place stays in `progress.step` / `progress.stepId` (unchanged, so gadget
unlocks, the chapter list, the GCPD roof guests and the case file keep working). Everything after
it lives in `progress.campaign` (registered field, `src/story/campaignSave.js`):
`{ night, stepId, nightsDone, missionsDone, optionalDone, rewards, daysSeen }`. Step and night ids
match `/^[a-zA-Z][a-zA-Z0-9]{0,31}$/`. Old saves load with the default (`night: 'n1'`): a save
mid Night One resumes exactly as before; a finished one opens Night Two in free roam.

**Dev params.** `?night=n2` (first step), `?night=n2&at=<stepId>`, `?at=<Night One id>` (a retired
id resolves through `src/game/storyAliases.js`). `window.__game.jump(id)` works in the night in play.

**Time and weather.** Night One is pinned to 23:00 in a storm (its original look) from the first
step until its credits, then released. Each later night pins its own hour and weather while it runs
(Act II: rain, then a clear dusk opening into drizzle; Act III: fog for the toxin night, snow for
the cold plant); the Bruce day between nights pins daytime (`day.time`, default 11:00, overcast);
free roam after the last night runs the clock free. All of it is a no-op without `world.clock`.

## 2. Common step fields

| field | meaning |
|---|---|
| `id` | unique in the night; saved |
| `type` | see 3; omitted = `reach` |
| `text` | the objective (banner when new, then the corner caption) |
| `site`, `radius` | where (reach-type steps finish when any standing hero is within radius, 6 m vertical) |
| `checkpoint` | site id a death respawns at (the nearest earlier one otherwise) |
| `lines` | radio lines `{ speaker, portrait, text }` played as the step begins |
| `talk: 'over'` | async steps (courier, board, ally, radio...) start at once and the lines play over them |
| `nudge` | the line repeated when she stalls on a travel step |
| `tutorial` | prompt ids shown as the step begins (`src/ui/prompts.js PROMPT_IDS`) |
| `title` | `{ text, sub }`: a chapter title as a card, no stop |
| `banter` | lines played once ~14 s into a travel step with the radio quiet |
| `interrupts` | `[{ id, at, radius, roof?, fight, lines, xp }]`: an optional fight on the way |
| `optional` | `[{ id, title, site, radius, lines, reward, xp, done }]`: reach-style optionals |
| `next` | carry on at this step id afterwards (instead of the one below) |
| `branches` | `{ key: stepId }`: a step finished with that branch key goes there (`fork`) |
| `retry` | mark the step a failed mission restarts from (default: the mission's first step) |
| `reward` | a reward id emitted when the step begins (see 7) |
| `tip` | `{ title, text }`: a card with the answer to the night's new role or mechanic (its tutorial beat) |
| `music` | `{ context, villain }` override while the step runs |
| `time`, `weather` | pin the hour / weather while this step runs (`world.clock.pin`, `world.weather.pin`, id `story:step`; `weatherSnap` to jump straight to the look) |
| `onFoot`, `face`, `placeAt` | as Night One uses them (see `src/game/flow.js`) |

Pacing rules (research doc 6.4) the tests enforce for campaign nights: no stand-alone `radio` step
without `talk: 'over'` or a cinematic, every travel step has `lines` or `banter`, comics are short.

## 3. Step types

### 3.1 Night One's (flow.js)

`reach` (default), `cutscene` (`scene`: a comic page from `SCENES` or the night's `scenes`;
`cinematic` optional), `fight` (`fight`: an id in the night's `fights`, or Night One's `FIGHTS`;
`boss: id` shows that boss's bar over the fight), `collect` (`item`, `site`: a glint marks it),
`boss` (`boss`: a boss id, default `joker`), `credits` (Night One only), `radio`, `chase` (`path`
of `{ x, z }` on drivable streets), `battle`, `armada`, `courier` (`at`, `to`), `ally` (`at`),
`board` (`site`: the car parks there), `interior` (`room`).

### 3.2 The campaign's (src/story/stepTypes.js)

| type | fields | finishes when | fails |
|---|---|---|---|
| `scan` | `points: [{ site, lines }]` (or `site`), `radius` 4, `hold` 1.2 | every point held in detective vision | never |
| `traverse` | `gates: [site...]`, `radius` 4.5, `timer`, `bonus` (s per gate), `failLines` | last gate passed | the clock resets the run to gate one |
| `puzzle` | `plates: [{ id, site, label }]`, `order: [ids]`, `riddle`, `timer`, `wrongCost` 10, `wrongLines`, `penalty: { budget, gang }`, `failLines` | the plates stood on in order | the clock runs out: mission retry |
| `fork` | `options: [{ id, text, site, radius, lines }]` + `branches: { id: stepId }` | a hero reaches one option | never |
| `fear` | `site` (goal), `radius`, `phantoms: [{ at, type }]`, `watchers: [{ at, yaw, range }]`, `rules`, `fear: { gas, seen, hitPhantom, drain }`, `failLines` | a hero reaches the goal | the fear meter fills: mission retry |
| `nightEnd` | `scene`, `rewards`, `after` (objective text when no night follows) | at once: the night is done, the next begins after its Bruce day | never |
| `wait` | `seconds`, `lines` | after the time | never |

Fail and retry: the step's mission jumps back to its `retry` step (or first step), the heroes go
to that step's checkpoint, a "MISSION FAILED" card shows. Deaths use the normal checkpoint respawn.

## 4. Fights

```js
fights: {
  lobby: { site: 'icebergDoor', radius: 14, gang: 'penguin', act: 2, district: 'gothamMile',
    waves: [ { budget: 6, ring: 7, lead: 'shield' },        // composeWave squad, ring placement
             { budget: 8, spots: [[-4, 2], [4, 2]], add: [{ type: 'brute', dx: 0, dz: 6 }] },
             [{ type: 'grunt', dx: 2, dz: 0 }] ] },          // or an explicit wave
  hall: { stealth: 'lounge' },                               // a predator room (5)
}
```

`budget` waves come from `composeWave` (`src/enemies/compose.js`): difficulty from the mix, never
from health; the act number unlocks roles (act 2 shield/baton, 3 pistol/medic, 4 ninja/sniper,
5 heavy/lieutenant). `lead` pins the night's new role into the first wave (the tutorial beat).
Co-op scaling is applied by `encounters.js` (`scaleWave`), as for Night One. Guide budgets per act:
`ACT_BUDGET` in `src/story/fightBuilder.js`. Squads are deterministic per fight id + difficulty.

## 5. Predator rooms

`rooms: { lounge: { id, site, entry, radius, gang, lights: [{ x, y, z, r, post? }], cover:
[{ x, y, z, w, d, h }], vent?, huddle?, squad: [{ type, route: route(mode, W(x, y, z, wait, face)...) }] } }`
(helpers `W`, `route` from `src/story/rooms.js`). They run on the existing stealth runtime; the
room travels with its fight (the shared `ROOMS` table and the core's scenery never change). Cover
crates and lamp posts are built lazily the first time the night loads.

## 6. Bosses (src/bosses)

A boss step: `{ type: 'boss', boss: 'penguin', text, checkpoint }`. The director
(`src/bosses/director.js`) plays the def's `intro` comic, runs the controller, draws the bar (name,
phase pips, colours), restarts a death at the phase reached (checkpoints between phases), sets the
music context (`villain`), and on `ctx.defeated()` emits `bossDefeated { id }`; the flow plays the
def's `outro` and advances. Defs live in `src/bosses/defs/`; register in `src/bosses/index.js`.

```js
makeVillainBoss({ id, name, villain, model /* createVillain id */, site, start?, arena: { x, y, z, r },
  colors: [a, b], gang, act, phases: [{ id, name }], intro, outro, lines: { guard: [...] },
  targeting: { leash, kiteT, swapEvery },
  phase: { [phaseId]: { enter(b), update(dt, b), idle(dt, b), exit(b), windowClosed(b) } } })
```

The handle `b`: `actor` (`melee`, `aim`, `open(secs)`, `moveTo`, `face`, `say`), `target` (the
anti-kite pick), `punish` (a hero who has kited too long: shoot them), `heroes`, `players`,
`tier` (`src/bosses/rules.js BOSS_TIERS`: tell, window, adds, damage), `ctx.adds(budget)`,
`ctx.hurt(hero, kind)`, `next()`, `win()`. Rules: a phase is a number of vulnerability windows
(`HITS_PER_WINDOW` strikes each, the same on every tier: no health sponges); co-op adds one
mechanic, not health; the boss swaps targets every few seconds and punishes kiting.

Dev: `window.__game.bosses.debugWin()` / `debugPhase()`; the playthrough uses them.

## 7. Hooks for other workstreams

- **Bruce day (K).** Each night's `day: { hook, context }` names the scene that plays *before*
  that night. `registerDayHook(hookId, async ({ night, context, game, progress, events }) => {})`
  (`src/story/campaign.js`). The runtime awaits it, then starts the night; with no hook registered
  it plays `day.fallback` lines over free roam. `daysSeen` remembers which played. Event:
  `bruceDay { night, hook, played }`. The Wayne side never blocks a night (research doc 7.2).
- **Side missions and cases (J3).** `registerSideMission({ id, title, kind: 'side'|'case', after:
  nightId, district, start, run(ctx) })`; `sideMissionsAvailable(progress.campaign)` lists the
  unlocked ones. The story never runs them; J3's director does, in free roam between beats.
- **Rewards (L1).** The story only emits: `events.on('storyReward', ({ id, night, mission, step }) => ...)`.
  Ids are `kind:name`, kind in `gadget, skill, suit, upgrade, xp, lore` (`REWARD_KINDS`). Each id is
  emitted once per save (`campaign.rewards`). Mission rewards fire on `missionComplete`.
- **Mission select (K/L, the Batcomputer).** `missionSelect(progress.campaign)` lists
  `{ night, nightTitle, mission, title, done, replayable }`; `window.__game.flow.story.replayMission(night,
  mission)` plays one without touching the save's place (the run returns to it after).
- **Events.** `nightStart { night }`, `nightComplete { night }`, `missionComplete { night, mission,
  replay }`, `missionFailed`, `optionalDone`, `caseClue`, `caseSolved`, `puzzleWrong`, `fearRising`,
  `bossStart { id, villain }`, `bossPhase { id, phase }`, `bossDefeated { id }`, `replayStart/End`.
- **Abilities ([onboard], `src/abilities/`).** Every player-facing capability has an id
  (`abilityDefs.js`) and is usable only once the campaign has it; each trigger point asks
  `can(hero, id)` (`gate.js`), a hero with no ability state can do everything (tests, tools). Night
  One grants by step (`grant: { step }`), later nights by `{ night }` (as it starts) or
  `{ night, after: missionId }` (once that mission is complete), or by an `ability:<id>` reward a
  night emits (`REWARD_KINDS` includes `ability`). A grant with `teach` plays its line over play,
  shows a NEW chip and its tutorial prompt, and counts its `proof` event (twice takes the card
  down). Old saves derive theirs from story progress (`deriveUnlocked`). URL: `?abilities=all|none|story`
  (default story; `?god=1` / `?fight=test` are all). Online: `__game.abilities.snapshot()` /
  `.apply(snap)` (registered as the `abilities` online state blob). Skill nodes stay upgrades on top
  (wingsuit tiers, grapple pull, Bat Swarm). Campaign map: n2 special takedown (night start), grapple
  boost (after m2Heist), battle mode (after m2Pursuit), chain takedowns (after m2Smugglers); n3
  chained grapples (start), wingsuit (after m3El); n4 Bat Swarm (start); n5 grapple pull (start).
  A step's `locks: ['detective' | 'gadgets' | 'grapple' | 'glide' | 'vehicles']` + `lockText`
  suspends those abilities (any mode) with a standing HUD note until a step without locks
  (`LOCK_GROUPS`; Night Eight's gauntlet).
- **HUD flow ([onboard], `src/ui/hudDirector.js`).** Every night inherits it through flow.js: a reach,
  collect or interior step reveals the goal after it under the caption as the hero approaches
  (`approachLevel`), reaching it bursts the marker and holds the next banner and lines for a beat
  (`HANDOFF_MS`, also after a fight and before a comic), banners and cards take turns in the centre,
  wait out a fight close by and collapse to chips, a case-file tick is a chip.
- **Online (D2).** Everything that changes the world goes through the flow's own functions
  (`advance`, `enterStep`, `encounters.begin`, `spawn`), already host-only in
  `docs/design/coop-seams.md`; a guest runs none of it and replays the host's step events.

## 8. Checking a night

```
npx vitest run tests/unit/campaign.test.js     # ids, sites, fights, clips, music, completable
node scripts/pacing.mjs --stops                # hard stops, no-agency seconds, camera cuts
NIGHT=n2 BASE=http://localhost:5630/ node scripts/playthrough.mjs     # P2=bot for co-op
NIGHT=n2 node scripts/story-walk.mjs http://localhost:5630/ out/      # screenshots of every beat
```

## 9. Acts IV and V, and the double life inside the nights (workstream J2)

Nights: `n6` Overgrowth (botanist; Robinson Park + Bristol), `n7` Slow Burn (flying arsonist;
Lower Gotham + Lakeshore Drive), `n8` Hostile Takeover (Black Mask; Chinatown, Wolf Point,
Blackgate), `n9` The Last Laugh (finale: the pier and Arkham). Every night opens with a
"Previously" comic (`recap()` in `src/story/nights/common.js`); act cards ride on a step's `title`.

| new type | fields | finishes |
|---|---|---|
| `life` | `test`: `backup`, `tail`, `rndFrozen`, `alfredOff`, `tired`, `escalated`, `choice:<key>=<value>`, `thread:<id>>=<n>`; `yesLines`, `noLines`; `branches: { yes, no }` | at once, on the branch |
| `dilemma` | `key` (saved choice), `timer`, `heading`, `card`, `bruce: { site, radius, label, lines, miss: { effects, lines } }`, `batman: { ... }`, `both` (co-op: one player at each), `timeoutBranch`, `branches: { bruce, batman, both }` | a hero reaches one side (the other side's `miss` applies) |
| `civvy` | `outfit`, `card`, `beats: [{ id, site, text, lines, choice: { key, prompt, default, options: [{ id, tag, text, effects, lines }] } }]`, `endLines` | every beat visited; played as Bruce (bruce.becomeBruce/becomeBatman) |

Step fields: `calls: [{ id, from, after, timeout, default, prompt, lines, options, silent?, silentEffects?, silentLines? }]`
(a choice wheel mid-step, keys 1-3, saved in `progress.campaign.choices['<night>.<id>']`);
`locks: ['detective' | 'gadgets' | 'grapple']` (those actions read as not pressed for every player);
`thralls: true` on a fight (punches on the spore-dazed are counted, stuns wake them); `van: { type,
color, toast, label, hits }` on a chase (its own quarry); `vehicle: true` on a boss step (fought
from the Batmobile). `effects` are the Bruce side's `applyEffects()` shape (standing, city, fatigue,
patience, suspicion, threads, injuries, flags, credit, freeze).

Night fields: `overheard` (goon conversations for the bark system), `finale: true`, `endings: { family,
partners, exposed, alone }` (scene names). Saved: `campaign.choices`, `campaign.boss` ({ id, phase }:
a boss resumes at the phase reached), `campaign.ending`.

Each night begins with `bruce.nightStart()` (the day's cost: backup, the tail car, frozen R&D,
stamina and health factors); the night shows its notes on a TONIGHT card and emits
`storyOpening`. Events: `storyCall`, `storyDilemma`, `storyCivvy`, `storyHarm`, `storyFreed`,
`storyLocks`, `campaignEnding`, `campaignComplete`, `newGamePlus { available, ending, carry }`,
`campaignHundred`, `cityState { ending, calm, signal, tone }`.

Bosses: `ivy` (crowd control, non-lethal), `firefly` (vehicle), `blackMask` (combat mastery),
`doubleAct` (the Joker and Harley, co-op sync; solo, the ally takes Harley). Director additions:
`bosses.snapshot()` (`{ id, on, phase, phases, bar, name, colors, pos, yaw, visible, state, glyph,
vulnerable, hits, anim, speech, tells, hazards }`), `bosses.apply(snapshot)` (a guest's figure and
bar), `bosses.resumeAt(id, phase)`, `bosses.simHint()`. A def may add `sim(b)`, `hazards(b)`,
`applyHazards(b, h)`, `extraModels`, `hide(b)`, `onWin(b)`.

Reward ids the new content emits (L1 grants them): `gadget:sporeFilter`, `suit:gardener`,
`upgrade:fireproofLining`, `skill:readTheRoom`, `suit:arkhamKnight`, `lore:thornGang`,
`lore:ivyFile`, `lore:fireflyFile`, `lore:maskFile`, `lore:jokerFile`, `lore:icebergMenu`, `xp:*`.

Checking: `node scripts/night-sim.mjs` (scripted competent player, measured times),
`node scripts/site-probe.mjs` (a night's sites against the live collision).
