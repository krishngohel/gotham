# Balance and playability (`[balance]`, wave 3)

Owner's words, in order: "the game is honestly too easy and too quick to finish, it needs a lot
more"; "the combat needs a lot of work as well, it's not as smooth"; "make the goons smarter";
"the story is still choppy but better". This file holds the measurements behind the balance pass,
the rule changes and why, and the tables later passes should re-run. Every number here came from
the scripted player on the deterministic virtual clock unless it says "model".

## 1. The scripted player and its calibration

`scripts/lib/player-bot.mjs` plays through player one's real input actions (the same
`pressed()/down()/move` the keyboard and pad feed). It never calls `winFight`, `debugWin`,
teleports or god mode. It decides once per game frame on the virtual clock
(`scripts/anim-lib.mjs`), with its own seeded rng, so a run is the same frame for frame for a seed
and a build. Modes: `fight`, `boss` (follows each boss's `sim()` hint, answers tells itself),
`stealth` (crouched, approach from behind, wait for a back, silent takedown), `travel` (on foot
toward a goal, grapple when the goal is well above, glide down), `fear`, and vehicle driving through
the vehicle API's own pilot (`vehicles.startPilot`, allowed and counted as `stats.piloted`).
It only uses what the story has granted (`hero.abilities.has(id)` before every press).

Skill profiles (`SKILLS`):

| profile | reaction (s) | counter acc. | dodge acc. | role answer | press every (s) | stray press |
|---|---|---|---|---|---|---|
| novice | 0.46 ± 0.16 | 50 % | 40 % | 40 % | 0.44 | 12 % |
| average | 0.32 ± 0.10 | 76 % | 62 % | 72 % | 0.33 | 5 % |
| skilled | 0.22 ± 0.06 | 93 % | 86 % | 94 % | 0.26 | 1.5 % |
| masher | never reads a tell | - | - | - | 0.20 | punch x3, kick |

Each tell aimed at the hero is noticed after the reaction time and answered correctly with the
profile's accuracy (one decision per wind-up). Knightmare hides the glyphs: the bot then reads the
animation only (+0.10 s, accuracy x `readNoGlyph` 0.55 / 0.75 / 0.90).

Calibration and its limits. Reaction times follow simple (~0.25 s) and choice-under-load
(0.35-0.45 s) reaction studies; counter accuracy follows what freeflow players report (average
75-80 %, good 90 %+). Fight and boss times are multiplied by **1.25** to estimate a person
(`HUMAN_K` in `scripts/night-length.mjs`): a person also has to find the fight, read the HUD, aim
the camera and recover from a surprise, which the bot does not. The bot cannot judge fun,
readability under pressure, the camera, or whether a tell is visible on screen; it reads the
tell's state, a person reads the picture.

## 2. Difficulty

`scripts/balance-matrix.mjs` stages each fight the same way every run (the page opens at the fight's
story step, comics skipped, the hero placed 5 m outside the squad facing it) and from then on
everything is real input. A run ends at `fightDone` (win), the first `heroDown` (a loss: a person
retries from the checkpoint) or 180 game seconds (a loss). Seed 108 unless stated. The fixed set:
Night One `f1 f2 n2 a1 harleyFight a3 plazaFight funhouseFight` and later nights `n2:heistFight
n3:bankFight n4:n4GymFight n5:n5FurnaceFight n5:n5WorkersFight n6:n6FountainFight n7:n7LowerFight
n8:n8Market`. Health is the tier's base (150 story, 100 otherwise) with no skill-tree upgrades.

### 2.1 Before (the long-night-2 rules at 337da32; 8 fights: f2 n2 a1 a3 plaza funhouse heist furnace)

| tier | skill | win % | median HP lost | deaths | median win time |
|---|---|---|---|---|---|
| story | masher | 88 | 0 % | 1 (Night Two's shields) | 13.5 s |
| normal | average | 100 | 0 % | 0 | 17 s |
| normal | masher | 29 | 100 % | 5 | 15.5 s |
| hard | skilled | 88 | 0 % | 1 | 16 s |
| hard | average | 88 | 30 % | 1 | 14.5 s |
| knightmare | masher | 25 | 110 % | 6 | 16 s |
| knightmare | skilled | 75 | 35 % | 2 | 15.5 s |

What it showed: on Normal an average player lost nothing in most fights; on Hard a skilled one lost
nothing at all (median 0 %); a masher on Knightmare still won the grunt and knife fights (f2, n2)
without a scratch, because every mashed punch that auto-attached to a goon winding up interrupted
him; a masher on Story died to Night Two's shield goons (nothing he pressed got through a shield,
and the story-only armour break only counted brutes); and the goons in the grunt fights barely got
an attack off (10 s fights, 0 HP lost on every tier).

### 2.3 After (all 16 fights; story/hard rows from the full matrix, normal and knightmare re-run on the final rules)

| tier | skill | win % | median HP lost | deaths (of 16) | median win time | target |
|---|---|---|---|---|---|---|
| story | novice | 100 | 0 % | 0 | 20.5 s | wins nearly everything: yes |
| story | masher | 100 | 0 % | 0 | 17 s | (was 88 %, died to shields and batons) |
| normal | novice | 88 | 12 % | 2 | 16.5 s | |
| normal | average | 100 | 10 % | 0 | 17.5 s | wins with visible loss: light (worst fights 47-74 %) |
| normal | skilled | 94 | 10 % | 1 | 17.5 s | |
| normal | masher | 38 | 103 % | 10 | 16 s | loses fights with roles: yes (wins only grunt fights) |
| hard | average | 69 | 38 % | 5 | 15 s | struggles: yes |
| hard | skilled | 88 | 15 % | 1 | 19 s | real pressure, some retries: partly |
| hard | masher | 19 | 108 % | 13 | 13.5 s | |
| knightmare | average | 38 | 109 % | 10 | 19.5 s | should lose: mostly |
| knightmare | skilled | 50 | 105 % | 8 | 18 s | only skilled wins: wins half, with retries |
| knightmare | masher | 6 | 110 % | 15 | 5.5 s | loses everything quickly: yes |

Per fight, the later-night fights (Night Three's bank and later) are where Hard and Knightmare bite:
the act 3-5 role mixes plus the larger squads. Night One's early fights (f1, f2) stay gentle on every
tier for a reader of tells; a masher on Hard or Knightmare now takes visible damage even there.
Every run's JSON (with per-run counters, dodges, capes, damage by attack kind and the squad
observer) is reproducible with `node scripts/balance-matrix.mjs <url> --combos tier:skill,...`;
`scripts/combat-tune.mjs` (the old two-player tuner) is superseded by it.

### 2.2 Rule changes and why

1. **Windup armour** (`src/combat/rules.js` `windupHolds`, `DIFFICULTY.*.windupArmor`; `combatSystem`
   `landHit` turns a plain `'hit'` into `'absorbed'`; `enemy.applyHit` layers a flinch and lets the
   swing carry on). On Normal a punch (also a travel strike or a beatdown) no longer stops a goon
   who is past the first 20 % of his wind-up; on Hard and Knightmare neither does a kick, from the
   first frame. The damage still lands (no free immunity, no health sponge). What stops a committed
   attack: a counter, a dodge, a stun (cape, batarang, gadgets), a knockdown (aerial, spin kick,
   slam, throw) or the role's answer. Story keeps the old rule. Why: auto-attach sends a mashed
   punch into whoever is winding up; the punch used to interrupt him, so mashing countered by
   accident and the tells meant nothing.
2. **Thralls are never auto-attached** (`src/combat/targeting.js` `attachable`): a punch, kick, throw
   or special never lands on one of Ivy's spore-dazed civilians; the cape, a batarang and a counter
   still do (and free them). The scripted player could not beat Ivy because every press meant for
   the goon beside a thrall hurt the thrall and regrew a root node.
3. **Shield goons are not stun-locked** (`enemy.applyHit` 'blocked'): one block reaction, then
   1.6 s in which blocked blows are a jolt on top. A stream of punches kept a shield goon reeling
   for 10 s and more, so a masher was never attacked by him (the parry fix of [fix1], for shields).
4. **Story's armour break counts shields too**: five blows into a riot shield stagger it, as five
   into a brute already did. A masher on Story died to Night Two's first shield fight.
5. **Pressure on Hard and Knightmare** (`DIFFICULTY.hard/knightmare`): up to 3 / 4 attackers may
   commit at once (was 2 / 3), the melee token budget 5 / 6 (was 4 / 5), and goons come back
   sooner after an attack (gap 1.3-2.6 s / 1.1-2.2 s). Tells, health and damage are unchanged.
6. **Squad size by tier** (`rules.js` `WAVE_SCALE`, applied in `encounters.js` before co-op scaling):
   Hard x1.25, Knightmare x1.5 more of the same light goons (never brutes, heavies or snipers),
   capped at 9 from difficulty alone. Night One's waves are hand-written; on the top tiers its grunt
   fights were over before anyone swung. Boss adds are left to the boss rules.

## 3. Goon behaviour, observed in play

`scripts/balance-matrix.mjs` attaches an observer to every run (`observeSquad`): event counts
(reinforcements called, weapons dropped and picked up, revives, flights, surrenders, token steals,
barks, counters) and, every ten frames, each goon's state and mood, keeping the longest unbroken run
in any one state. Across the 55 baseline fights:

| behaviour | seen | evidence |
|---|---|---|
| flanking (next in line comes from behind) | yes | `nextInLine` assigned in every fight |
| back off after a takedown | yes | `backoffT` set on witnesses in 458 samples |
| hesitate / surrender / flee (fear) | yes | hesitant in 27 runs, surrendered in 14, fled in 11 |
| weapons dropped / picked up | partly | 5 drops, goons walked to pick up twice, no pickup completed |
| token hand-off (steal) | yes (final 192 runs) | 90 steals in 66 fights (event added: it ran silently) |
| weapons picked up | yes (final runs) | 38 drops, 13 pickups completed in 10 fights |
| medic revives | yes (final runs) | a medic knelt over a body in 14 fights, finished twice |
| lieutenant reinforcements | **not seen** | no lieutenant in the fight set's squads (act 5 role) |
| a goon stuck in one state | **yes** | a shield goon in `hit` for 10.7 s (stun-locked by punches): fixed |

Fixed or added in this pass:
- shield stun-lock (above); the [fix1] fixes (a cape-stunned goon idle forever, a parry-locked knife
  goon, a scared goon who stopped fleeing) were confirmed in place: no goon spent more than 6 s in
  `stunned`, `hit` (other than the shield) or `flee` in any run;
- **rush a downed co-op player** (`src/enemies/squad.js` `rushDowned`, wired in combat's squad pass):
  when a hero is down in co-op, the 1-2 nearest melee goons without a token (by difficulty) take
  slots round the body, so the partner has to fight through them to revive;
- **local avoidance and a stuck detector** (`src/nav/avoid.js`) shared by GCPD officers
  (`src/wanted/units.js` `moveOfficer`/`navigate`) and goons (`enemy.js`, fight states): one probe ray
  ahead every 0.25 s, four fanned rays only when it is blocked, the deflection kept between probes
  (allocation-free, sliced). Stuck for 2 s (under 0.35 m per 1.2 s): an officer re-routes along the
  sidewalks and tries the other side; stuck for 8 s where nobody can see him, he despawns (a fresh
  one spawns if still wanted). A fleeing goon stuck against a wall counts as gone.

## 4. Bosses (`scripts/boss-bench.mjs`, Normal)

The bot fights each boss from its story step (or, for the four side-chain bosses, started through
the boss director at its arena), reading tells itself and following the def's `sim()` hint, which
says only what a player can see (`src/bosses/defs/*.js`; added for the Joker, the Penguin, the
Scarecrow and the four side bosses, fixed for Ivy, Firefly and the Riddler). A death restarts the
phase reached (the director's checkpoint), as for a person. Recorded staging, not counted as play:
a hero more than 25 m from the arena is placed 8 m from it (?at= opens a boss step where the step
starts); Firefly starts with the hero in the Batmobile (the story's board step); the Batmobile is
driven through `vehicles.startPilot` (counted). Times are the bot's; a person ~x1.25, more for the
Riddler (reading).

| boss | solo average | solo skilled | co-op average (`?p2=bot`) | verdict |
|---|---|---|---|---|
| Joker (n1, boss.js) | 64 s, 0 deaths, 3/3 | 55 s, 0 | - | beatable; short (Night One untouched) |
| Penguin (n2) | 150 s, 1 death, 3/3 | 301 s, 4 deaths | 100 s, 1 | good; blizzard phase is the killer, high variance |
| Riddler (n3) | 73-92 s, 0 deaths; one run stalled | - | - | beatable; crew now opens each question; check the stall |
| Scarecrow (n4) | 100 s, 0 deaths | stalled in House Calls with 3 catches (now 2) | 238 s, 5 downs (before the co-op fear fix) | beatable solo; co-op re-run needed |
| Freeze (n5) | 71-136 s, 0-1 deaths | - | - | good after more windows (was 31 s) |
| Ivy (n6) | 160 s, 0 deaths | 174 s, 0 | 188 s, 1 | **now beatable** (was never, in 8 min) |
| Firefly (n7) | not beaten in 10 min: phase 2 reached once | - | - | bot drives but lines up few rams; judge by hand |
| Black Mask (n8) | 104-150 s, 0-1 deaths | 150 s, 1 | 210 s, 2 | good (windows tuned 2-3-2) |
| Double act (n9) | 262 s, 0 deaths | 138 s, 0 | 158 s, 0 | good |
| Cat Burglar (side) | not beaten: Nine Lives stalls | - | - | soft-lock fixed (she was off the combat list); still stalls |
| Clay Man (side) | not beaten: never reached the lever | - | - | check lever reachability |
| Two-Faced DA (side) | not beaten: bot loses the plates across levels | - | - | bot limit |
| Mercenary (side) | 74 s, 0 deaths (before 3 windows) | - | - | beatable; now longer |

Changes (all structural or timing, never health; tiers still scale tells, windows and adds):
- Ivy: a node cut survives a counter or a cape step-off (it drained at 2x and reset on every
  thrall swing), the plate reads 2 m wide, thralls telegraph a third longer, Overgrowth regrows
  after 22 s solo (was 12 s: five nodes could not all be cut in time), windows 2-2-3, vine lash a
  little more often. Plus the targeting rule in 2.2 (thralls never auto-attached).
- Penguin: after a window the umbrella is braced for a few seconds, four windows (the umbrella
  phase took 8 s).
- Riddler: his crew opens every question (all three answered in under a minute, nothing in the way).
- Scarecrow: three windows in The Last Dose; co-op: the shared fear meter fills at 60 %.
- Freeze: three windows a phase (beaten in 31 s). Black Mask: 2-3-2 windows (3-3-3 killed the
  average bot five times; 2-2-2 took 101 s).
- Mercenary: three windows in the hunt and the duel. Cat Burglar: back on the combat list for Nine
  Lives (a whip nobody can counter was a soft-lock).
- The bot itself: it now answers every wind-up of a framework boss (it used to count a boss's first
  tell only, which is why earlier sims could not beat Ivy or the Scarecrow), faces a target before
  a cape, and zip-ties surrendered goons.

## 5. Night length (model built from measured parts: `scripts/night-length.mjs`)

Measured: fight times (the average bot on Normal, `--matrix`), boss times (`--bosses`). Modelled:
travel (distance between consecutive objectives x 1.35 at 9 m/s, a person's mix of running, gliding
and grappling, not driven by the bot: its travel mode has no route planner and gets stuck on
roofs), predator rooms (30 s a goon), chases 75 s and battles 110 s, scans, puzzles and civilian
beats at fixed costs, comics and stand-alone radio from `src/story/pacing.js`. Fights and bosses x
1.25 for a person (section 1). Bruce's days between nights are not counted.

| night | before (min) | after (min) | travel | fights | rooms | vehicles | boss | story | other |
|---|---|---|---|---|---|---|---|---|---|
| n1 | 26.7 | 20.9 | 4.6 | 4.2 | 4.0 | 4.3 | 1.3 | 1.2 | 1.2 |
| n2 | 18.0 | 16.7 | 4.5 | 3.0 | 2.0 | 1.3 | 3.1 | 0.6 | 2.3 |
| n3 | 18.9 | 16.4 | 3.9 | 4.7 | 2.0 | 0 | 1.5 | 0.5 | 3.7 |
| n4 | 16.4 | 17.7 | 1.6 | 3.3 | 2.0 | 1.3 | 5.6 | 0.3 | 3.6 |
| n5 | 17.0 | 14.9 | 1.3 | 4.9 | 2.0 | 1.3 | 2.8 | 0.5 | 2.1 |
| n6 | 18.7 | 17.8 | 5.0 | 3.5 | 2.5 | 1.3 | 3.3 | 0.3 | 2.0 |
| n7 | 19.7 | 20.5 | 4.8 | 3.5 | 2.5 | 3.1 | 5.0 (Firefly not beaten: estimate) | 0.3 | 1.5 |
| n8 | 17.1 | 14.8 | 3.6 | 5.5 | 2.5 | 0 | 2.2 | 0.3 | 0.6 |
| n9 | 16.7 | 17.7 | 2.5 | 5.2 | 0 | 1.3 | 5.5 | 0.3 | 3.0 |

"Before" used the old 5-minute boss estimate and modelled fight times; "after" uses the measured
fights and bosses, so some nights read shorter: the bosses were quicker than estimated, even after
this pass lengthened the short ones.

**The owner is right, and by more than the old estimate said.** The story hand-back estimated 35-55
minutes a night; built from measured fights, nights 2-9 run 15-21 minutes for an average player
(about 2.6 hours for the whole campaign plus Bruce's days and side content). The target of 60-90
minutes a night needs roughly three times the content: this pass added what could be added safely
in data (two optional interrupt skirmishes on travel steps in every night, on sites each night
already uses; harder, longer fights on Hard and Knightmare; longer boss fights where the bot beat
them in under two minutes) and trimmed Night One's opening (intro comic 5 panels to 3, cinematic
5 s to 3.5 s: 18.2 s of no control to 11.7 s; hard stops 8, no-agency 78 s to 72 s, no other night
grew). It did not write new missions. What a content pass needs, per night, to reach ~60 minutes:
3-4 more missions of the existing kinds (a second predator room, a set-piece fight with a new role
mix, an investigation with a case board, a traversal challenge), each 8-10 minutes, plus a mid-night
twist that sends the player back across the district; a scripted wanted moment
(`wanted.brand`/`set`) on the nights where the story already has the police involved (n3, n7, n8).

## 6. Economy and progression (model: `scripts/economy-sim.mjs`)

XP per night comes from what the night contains (its fights' squads as `buildFight` composes them
on Normal, steps, missions, rooms, optional objectives) plus the fight-side numbers the average bot
produces (about 0.6 counters per goon, one 8-hit combo per wave, a special every two fights) and side
content at a typical rate (two crimes, one cache, a medal every other night).

Found and fixed: **campaign missions paid no XP and optional objectives paid nothing**. The story
emits `missionComplete` (side chains emit `missionDone`, which pays 500) and optional objectives
emit `xpGain`; nobody listened to either. Now a finished story mission pays `XP.campaignMission`
(300, not on replay, not Night One, whose 1,000-XP levels were tuned without it) and an optional
pays its own `xp` (`src/progress/wayneTech.js`).

| night | fights | goons | missions | XP that night | XP total | skill points |
|---|---|---|---|---|---|---|
| n1 | 14 | 71 | 6 | 8,343 | 8,343 | 8 |
| n2 | 5 | 28 | 9 | 5,754 | 14,097 | 13 |
| n3 | 5 | 43 | 9 | 6,271 | 20,368 | 18 |
| n4 | 5 | 33 | 9 | 6,019 | 26,387 | 22 |
| n5 | 6 | 56 | 9 | 6,535 | 32,922 | 27 |
| n6 | 6 | 30 | 11 | 6,691 | 39,613 | 32 |
| n7 | 3 | 30 | 7 | 4,775 | 44,388 | 35 |
| n8 | 6 | 58 | 5 | 5,200 | 49,588 | 39 |
| n9 | 4 | 55 | 8 | 5,421 | 55,009 | 43 |

The 69 shared XP nodes cost 81 points; by act gate 28 / 45 / 64 / 77 / 81 are on offer. A typical
player ends the campaign with about 43 points (just over half the tree), so every branch gets its
core and the player chooses a speciality; the rest is for side content and New Game Plus. Without
the mission fix the same player ended on about 28 (a third). Before this pass nights 2-9 paid 2-3
points each; now 4-5.

**Wayne credit.** The double life banks one credit per `WAYNE_BANK_PER` Standing each day. At 20 that
was about 23 credit over the eight days against a 170-credit Wayne branch (two nodes, ever). Now one
per 10 Standing (about 50 over the campaign at Standing 55-75) and the branch costs about a third less
(108): Wayne Scholars 6, Applied Sciences 10, Alfred's Alibis 6, Batmobile Modules 12, Oracle
Network 12, Night Nurse 10, Downtown Cave 16, Foundation Fund 16, Allies on Call 20. A player who
keeps Bruce's commitments affords about half the branch by the finale, and has to choose.

**Gadget arrival vs encounters.** Gadgets arrive as mission rewards (two per night n2-n6). The night
files' teaching beats and encounter leads were checked against the ability unlock order
(`tests/unit/abilities.test.js` and the night tests); the balance bot only presses what the story
has granted, and the matrix fights it won at average skill never needed a gadget it did not have.

**Wanted rise and decay** (`scripts/wanted-sim.mjs`, the pure rules; not changed):

| Police pressure | escape after 3 s seen, from level 1 / 2 / 3 / 4 | officers stunned to reach 2 / 3 / 4 | public brawls to reach 1 |
|---|---|---|---|
| Relaxed | 17 / 22 / 29 / 60 s | 5 / 10 / 16 | 5 |
| Standard | 20 / 27 / 37 / 81 s | 3 / 6 / 10 | 3 |
| Relentless | 23 / 32 / 45 / 103 s | 2 / 4 / 7 | 3 |

Level 5 (manhunt) is reached only through the story or by restraining officers; it does not clear
inside five minutes of hiding, which is intended (the story clears it).

**Not done:** medal thresholds were not re-set from flown/driven courses (the bot cannot fly a ring
course or drive a time trial reliably; see 8). City heat and fear/reputation growth were read from
their rules, not measured over a campaign.

## 7. Tests and tools

- Unit: `tests/unit/balanceRules.test.js` (windup armour, thrall attach, rush-downed, avoidance and
  stuck detector, squad size by tier, attacker spacing, boss hints), `tests/unit/balanceContent.test.js`
  (interrupt content consistency, pacing did not grow, economy bands), plus the changed pins in
  `wayneTech`, `skillTree` and `bruceDoubleLife` tests (each marked `[balance]` with the reason).
- `npm run test:balance` (`scripts/balance-regress.mjs`, needs a running build at `BASE`): seven
  seeded fights across the tiers and skills plus the Joker, each asserting win/lose and an HP band.
- Harnesses: `scripts/lib/player-bot.mjs` (the player), `scripts/balance-matrix.mjs` (fights),
  `scripts/boss-bench.mjs` (bosses, `--p2 bot`, `--skill`, `TRACE=1`), `scripts/night-length.mjs`,
  `scripts/economy-sim.mjs`, `scripts/wanted-sim.mjs`. `scripts/anim-lib.mjs` now runs its node
  process and browser below normal priority (shared machine; `LOWPRI=0` to opt out).

## 8. What the bot cannot judge, and its limits

It reads game state, not the picture: it cannot tell whether a tell is visible through the camera,
whether a glyph is readable in a crowd, or whether a fight is fun. It does not traverse the city
(travel is modelled), cannot fly ring courses or drive time trials (medal times were not re-set),
lines up few Firefly rams, cannot find the Clay Man's levers or the Two-Faced DA's plates across
levels, and its predator-room play is simple (crouch, approach from behind, wait for a back; no
perches or gadgets). Fights are staged from 5 m outside the squad, which favours ranged squads on
the top tiers. Boss runs are single seeds with large run-to-run variance (the Penguin took 100-301 s
across runs); the Riddler stalled in two of six runs and the cause is not yet found.

**Five things worth judging by hand**
1. Normal, Night Three onward: does an average player now get hit enough to feel it, and does a
   punch that does not stop a swing (windup armour) read as fair or as a bug?
2. Knightmare: is losing half the fights as a skilled player with no glyphs the right wall?
3. Ivy: with nodes keeping their progress and thralls never auto-targeted, is her mechanic
   readable without the objective text?
4. Firefly from the Batmobile: is the swoop line readable enough to ram?
5. Night length: play Night Two start to finish and time it; the model says ~17 minutes.
