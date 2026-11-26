# Vehicles and traversal upgrades (workstream L3, `[move]`)

What mission, crime, story and UI agents can call. Everything here works for two players; the
world-changing calls are host-only online (see "Online" at the end).

## 1. Upgrades (the skill tree's effect keys)

`src/traversal/moves.js` turns the shared `effects` object (workstream L1, `src/progress/upgrades.js`
and `docs/design/progression.md`) into `hero.moves`. Defaults are today's game; `?moves=all` owns
everything (dev). A list of node ids is accepted too (tests).

| effect key (node) | `hero.moves` |
|---|---|
| `grappleRange` 1 / 1.25 / 1.5 (`grappleRange1/2`) | grapple reach 52 / 65 / 78 m |
| `grappleReel` 1 / 1.2 / 1.4 | `reel` |
| `grappleBoost` (`grappleBoost`) | `perfectBoost`: jump in the last 30% of the reel launches with the reel's speed |
| `glideReGrapple` (`glideReGrapple`) | `reGrapple`: a grapple fired from a glide keeps the flight speed (3 charges, 4 with wingsuit 2+, 0.6 s apart, refilled on landing, each link gains 15% less) |
| `grapplePull` (`grapplePull`) | `pull`: an aimed goon (yank / disarm / shield break / a heavy resists) or a light pullable |
| `wingsuit` 0..3 (`wingsuit1/2/3`) | the wingsuit replaces the cape glide; 2 tighter bank and brake; 3 top speed 72 m/s |
| `updrafts` (`updraftReader`) | rising air lifts 1.4x |
| `carTopSpeed` mul (`pursuitTuning`) | Batmobile top speeds |
| `carRamDamage` mul (`ramPlates`) | a ram also drains a chase unit's stop meter; enables the nose winch |
| `carArmor` mul (`battleArmor`) | battle damage taken |
| `carAfterburner` (`afterburner`) | heat lasts 1.6x; the missile barrage |

Per player: every hero gets the shared tree's moves; set `hero.movesFrom` (an effects object of
that player's own, e.g. L1's `effectsFor(heroId)`) and emit `effectsChanged` to give a partner
their own. Refreshes on `upgradeBought`, `nodeBought`, `effectsChanged`, `playerJoined`.
`elSurfer` (riding the El) is not implemented yet.

## 2. Traversal

- Wingsuit: `src/traversal/flightModel.js` (pure, energy-conserving: dive builds speed, pull up
  spends it for height, stall below 9 m/s, banked turns, air brake on crouch). Rising air:
  `src/traversal/updrafts.js` (steam stacks from `world.steamSources`, the lakefront band); add a
  zone with `game.moves.updrafts.add([{ kind: 'column', x, z, r, y0, top, strength }])`. Weather
  wind: set `hero.wind = { x, z }` (m/s) and the suit drifts with it.
- Landing by speed (wingsuit only): fast and shallow rolls out keeping 55% speed, fast and steep is
  a heavy landing (`land` event `{ heavy: true }`).
- Glide kick: kick low over a goon in the wingsuit knocks him down (`glideKick`).
- Pullables: `game.moves.pullables.register({ id, x, y, z, r, heavy, onPull({ by, player, vehicle }) })`
  returns an unregister function. `heavy: true` objects answer only the Batmobile winch
  (`vehicles.winch(pullables)`).
- Events: `grapple { chained, link }`, `grappleBoost { perfect, link }`, `grapplePull { outcome, target }`,
  `glideKick`, `land { roll | heavy }`.
- Camera modes added to `src/game/camera.js`: `wingsuit`, `driveClose`, `driveHood`, `battle`;
  speed FOV is halved with camera shake off or `settings.reduceMotion`.

## 3. Driving (`vehicles`, src/vehicles/vehicles.js)

Unchanged contract: `summon, enter, exit, eject, park, active, update, startChase, startBattle,
debugWin, setDriver, useKey, fireCannon`. Story step types `board`, `chase`, `battle` work as before.

- PURSUIT (default): arcade drive plus held power slides (throttle + steer into it after a
  handbrake flick) and countersteer recovery; afterburner (sprint) with heat
  (`batmobile.heat = { heat, locked }`); real ground under four wheels (ramps, both Lower Gotham
  decks, the Bristol hills; a deck overhead is never the ground, so no tunnelling at speed); jumps
  and landings (`vehicleLand { speed }`); falls into water recover to the last road
  (`vehicleRecovered`). Cars are bound by the region extent, not the old z < 205.
- BATTLE: hold block (right mouse / the pad's block). The drone battle is always in battle mode.
  The body turns to the camera, the stick strafes in any direction, jump is a dodge thruster
  (`vehicleDodge`), punch fires the turret (held: keeps firing), special fires the barrage when
  its meter is full. `vehicles.mode` is `'pursuit' | 'battle'`; `vehicles.setBattle(on)`.
- The turret picks its round from its lock (`src/vehicles/battleMode.js`): heavy cannon at
  unmanned drones/tanks only, an immobiliser at manned vehicles, a non-lethal riot round at
  people. Event `cannonFire { round }`.
- Q cycles the driving camera (chase / close / roof). Under a deck (Lower Gotham's lower deck,
  the river walk) every camera stays below the slab overhead, and its floor follows the ground
  under it rather than y 0.4.
- Eject (vehicle key at 14 m/s+): up and forward into a glide with the car's speed; a co-op
  passenger goes too (`vehicleEject`).
- Remote call: the vehicle key away from the car calls it; with a road within 30 m it drives
  itself along the street graph (`vehicleCalled { eta }`, `vehicleArrived`); off-road it slides in
  as before. `vehicles.remoteCall()`, `vehicles.calling`.
- Bikes: `vehicles.callBike(hero, 'batcycle' | 'wingbike')` places one; an acrobat kit's vehicle
  key calls Nightwing's bike. In co-op a partner too far to board the Batmobile calls their own
  bike and rides it (`summonBikeFor(player)`, `riderKey(player)`, `isRider(hero)`).
- Lending: `vehicles.lendCar('police', { x, y, z, yaw }, { siren: true })`.
- Traffic: brakes for the car (trafficSim obstacles); rammed at speed a sim car is retired and a
  pooled stand-in spins off (`trafficShoved { type, speed }`). Pedestrian safety:
  `vehicleDanger { x, y, z, fx, fz, speed, r, kind }` four times a second at speed (a reused
  object: read it, don't keep it) for civilians to dive clear.
- Audio: `setEngine(kind, level, speed, { boost, throttle, mode, skid })`, events `vehicleMode`,
  `vehicleSkid { amount }`, `vehicleBoost`, `vehicleImpact`.

## 4. Chases and vehicle combat (`vehicles.chases`, src/vehicles/chases.js)

Each returns a handle (`{ id, ... }`) or null when there is no road, and ends through
`onDone({ ok, why, time })` plus `chaseEnd { kind, id, ok, why }`. `vehicles.debugWin()` wins the
running one.

```js
vehicles.chases.startPursuit({ from, model: 'gangVan', outcome: 'either' /* 'ram' | 'immobilise' */,
  hits: 3, stop: 100, speed: 21, escapeDist: 220, escapeT: 8, timeLimit: 120, label: 'GETAWAY', onDone });
vehicles.chases.startConvoy({ from, trucks: 3, spacing: 14, model: 'box_truck', speed: 15, hits: 4, stop: 140, onDone });
vehicles.chases.startTail({ from, model: 'sedan_deco', nodes: 12, onDone });       // why: arrived | spotted | lost
vehicles.chases.startTimeTrial('lakeshoreSprint' | 'lowerGothamDecks' | 'bristolHill', { onDone }); // why: par | slow | time
vehicles.chases.raiseBridge('bridgeE'); vehicles.chases.lowerBridge('bridgeE');
vehicles.chases.setPiece('elPillar', { x, z });                                    // emits vehicleSetPiece
```

- Escape logic and rubber band: `src/vehicles/chaseAI.js` (pure, unit-tested): flees at each
  junction away from the pursuer, never footpaths or raised bridges, eases off when far ahead and
  pushes when close, within `[minSpeed, maxSpeed]`.
- Outcomes: rams (`chaseHit { hits }`) and the battle-mode immobiliser (`chaseHit { stop }`).
- Tail meter: `stepTail` (too close in view fills suspicion; too far for 6 s loses it).
- Drone tanks v2: `vehicles.startBattle({ site, drones, onDone })` as before, now fought in
  battle mode with the turret lock, dodges and the barrage.

## 5. The Batwing

`batwing.dropAt({ x, y, z }, { altitude = 60, speed = 85, onDone })`: the fast-travel drop. The
plane picks the hero up, flies a scripted arc and releases them into a glide above the target
(`wingDropStart`, `wingDropDone`). For the fast-travel menu and story steps. Flying it yourself,
the armada and the boarding are unchanged.

## 6. World notes found while driving (for the world owners)

- A bascule's deck collision is removed as soon as its gates start closing (phase `closing`), while
  the leaves are still down: anything on the span falls into the river. `vehicles.js` now holds a
  bridge down while the player's car is on or just short of it; walkers and traffic are not covered.
- A bollard stands on the centre line of the Blackgate causeway mouth (x 90, z 188): a car must
  pass either side of it.
- The graph's straight edge from Lower Gotham's east plaza to the ramp top crosses the median
  railing; drive in through the gap at x 358-366.

## 7. Dev and tests

- `?moves=all`; `scripts/move-probe.mjs` (wingsuit dive and climb), `scripts/drive-probe.mjs`
  (core → both Lower Gotham decks → Lakeshore Drive → Arkham causeway → core → Blackgate causeway
  with the in-game pilot `vehicles.startPilot(points, { speed })`), `vehicles.routePoints(from, to)`.
- Unit: `flightModel`, `grappleRules`, `updrafts`, `driveModel`, `chaseAI`, `vehicleBattle`.
- e2e: `tests/e2e/movement.spec.js`.

## 8. Online (what a follow-up must replicate)

The guest cannot drive or fly online yet. To add it: the Batmobile pose already goes out as a
prop (`netGame collectProps`); a follow-up needs `modeT`, `v.lat`, turret yaw/pitch, canopy, heat
and boost flags in that record; bikes and riders as props; chase units and time-trial rings as
host-owned props with `chaseStart/Hit/End` as reliable events; the guest's own hero state
`glide.wingsuit`, the flight state (`speed`, `gamma`, `roll`) for the puppet's pose; and
`vehicleEject` / `grapplePull` as hit claims the host validates (a pull moves a host-owned goon).
