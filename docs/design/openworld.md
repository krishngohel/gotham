# The open world (workstream J3, `[world-content]`)

Crimes, the city director, fear and reputation in the street, open-world stealth, side chains,
detective cases, collectibles, trials and the post-game. Code: `src/openworld/**`; one factory
(`createOpenWorld`, `src/openworld/index.js`) built by side content (`src/game/sideContent.js`) and
updated once a frame on the host (`side.update`). Everything is reachable from
`window.__game.side.openworld` (`crimes`, `director`, `stealthEnc`, `cases`, `collect`, `chains`,
`board`, `geo`, `store`).

## 1. Shape

```
director.js        per-district heat 0..5, gang control, lieutenants, spawn selection, pacing governor (pure)
crimeTypes.js      23 crime types = objective x twist x place x escalation; composeCrime(); rewardsFor() (pure)
objectives.js      15 objective leaves + seq/all/any composites, facts snapshot (pure, no per-frame allocation)
reputationWorld.js arrival reactions (surrender/flee/trap), lieutenant counters (pure)
gangs.js lines.js  gangs per district (from the regions' spawn tables), radio/bark lines (data)
geo.js             street paths, roof hops, sniper roofs, El trains, bascule bridges from the real city
crimeRuntime.js    live crimes, one squad at a time through encounters, props, police, escalation
crimeProps.js      pooled civilians/runners/vans/bombs/fire/lasers
chaseAdapter.js    vehicle chases (today the old van chase; L3's API replaces only this file)
stealth/           10 predator encounters (data + runtime, collision-checked in unit tests)
cases/             case engine, 5 cases, runtime, case board UI
chains/            4 side chains (16 missions), 4 bosses on the boss framework, comic art
collect/           riddles, hides, audio logs, photo spots, trials, Most Wanted contracts, tracker
ui/                per-player HUD panel, Batcomputer tabs (State of the city, Case files, Side ops)
save.js            progress.openworld (one registered field)
```

## 2. Crime system v2

`composeCrime(typeId, { spot, heat|tier, control, hour, weather, players, act, rng, geo, twists? })`
returns a plan: `{ type, title, alert, tier, twists, gang(s), objective, squad: waves of
{ type, dx, dz, gang, look }, props, train?, bridge?, escalate?, reward }`. The objective is a tree
of leaves (`defeat protect defuse chase getaway interrupt war hold sniper rescue trail tail board
reach clock`). Co-op splits objectives (second runner, second bomb, two collectors), composeWave
adds bodies (x1.5), never health.

Depth, honestly: **deep** (several modules, twists that change play, tested end to end): mugging,
robbery, hostage store, rooftop chase, bomb, racket, gang war, bank job, deal bust. **Medium**
(their own module, simpler presentation): van break-in, foot chase, vehicle getaway, arson, sniper
nest, kidnapping, stolen-car ring, El hijack, bridge standoff, prison break, Arkham disturbance,
museum heist. **Thin**: pier shakedown (a protect + defeat reskin), street brawl (ambient defeat).

Dev hook (kept): `side.crimes.force({ kind | type, spotId, twists })`; `?crime=<type>&spot=<id>`.

## 3. Director and pacing

`governor({ mode, stepType, freeRoam, challenge, photo, mission, sinceStep, quality })`: nothing
during fights, bosses, cutscenes, chases, puzzles, fear steps, challenges, photo mode or a side
mission/stealth run/trial; at most 2 live crimes (never within 70 m of the objective, a 25 s
quiet spell after each new step) while a story objective waits; the quality cap in free roam
(potato 2, low 3, medium 4, high 5, ultra 6). Crimes are abstract until a hero is within 70 m
(100 m for rooftop ones) and discovered (dispatch, sound at 75 m, sight at 55 m). The story's
`holdStory` holds while a crime squad is engaged or a side mission/stealth run is on.

## 4. Events (host emits; a guest needs these to draw UI and pins)

| event | payload |
|---|---|
| `crimeSpawn` | `{ id, kind (dispatch alert), type, title, district, pos, dispatched, text }` |
| `crimeDiscovered` | `{ id, how: 'sound'|'sight', pos }` |
| `crimeActive` | `{ id, pos }` (police converge; also after a win while officers take the zip-tied) |
| `crimeUpdate` | `{ id, title, text, meter, label, tone, timer }` 2 Hz, for the HUD panel |
| `crimeEscalate` | `{ id, type }` |
| `crimeEnd` | `{ id, kind, type, district, districtLabel, outcome, grade, xp, pos }` |
| `crimeStopped` / `crimeArrests` | `{ count, type }` / `{ id, n }` |
| `districtMood` / `districtEnter` / `lieutenant` | `{ district, mood, from }` / `{ district, mood, heat }` / `{ district, name, gang }` |
| `sideMissionAvailable` | `{ id, title, chain, pos }` |
| `sideMissionStart` / `sideMissionStep` / `sideMissionComplete` / `sideMissionFailed` | `{ id, chain }` / `{ id, step, kind }` / `{ id, chain, chainDone }` / `{ id, reason }` |
| `stealthEncounterNear` / `Start` / `Done` / `Failed`, `stealthDetector` | `{ id, pos }` / `{ id, title }` / `{ id, time, medal, opts, best }` / `{ id, reason }`, `{ pos }` |
| `caseStart`, `caseMarker`, `caseClue`, `caseStage`, `caseHint`, `caseConfront`, `caseSolved` | see `cases/runtime.js` |
| `collectible`, `collectibleHint`, `trialStart`, `trialDone`, `contractStart`, `contractDone` | see `collect/runtime.js` |
| `storyReward` | `{ id: 'xp:N'|'lore:x'|..., night: 'side', source }` (L1 grants) |
| `dispatch`, `bark`, `missionComplete`, `caseSolved`, `collectible` | the audio system's hooks |

State a guest snapshot needs: `progress.openworld` (districts heat/control/lt, counters) and the
live crime list (`id, type, title, pos, discovered, materialized`) for the tracker; enemies are
replicated by the existing enemy snapshot.

## 5. Save

`progress.openworld` = `{ districts, types, arrests, saved, hurt, getaways, collateral, rep,
stealth, chains, cases, collect, contracts, rewards }` (`src/openworld/save.js`, sanitized, old
saves load empty). `progress.crimes.stopped` still counts every stopped crime (the old "10 crimes"
progress category is unchanged). The city-wide reputation (`combat.reputation`) is persisted here.
