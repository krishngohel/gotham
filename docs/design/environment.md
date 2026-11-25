# Time of day, weather, environment and civilians (workstream M)

Code: `src/env/` (clock, weather, look tables, the environment object, the on-screen system),
`src/civilians/` (pedestrian simulation, crowd LOD, reactions, ambient birds). Tests:
`tests/unit/envClockWeather.test.js`, `tests/unit/civilians.test.js`, `tests/unit/envSave.test.js`,
`tests/e2e/env.spec.js`. Screenshots: `docs/design/shots/env/`.

## world.clock (src/env/clock.js)

One number, `clock.value`: game hours since midnight of day 0. `hour` (0–24) and `day` derive from
it. Nights are long: a real-time day lasts 48 minutes and dusk (19:00) to dawn (06:00) takes 70% of
it (`createWorld(scene, quality, { dayMinutes, nightShare })`). A new game starts at 23:00.

| call | what it does |
|---|---|
| `clock.hour`, `clock.day`, `clock.daylight` (0..1), `clock.night`, `clock.sun` (-1..1) | read |
| `clock.pin(hour, { id })` | show `hour` and stop the clock until `unpin(id)`; pins stack, newest wins; the clock resumes where it was |
| `clock.unpin(id)` | drop one pin (no id: all) |
| `clock.pause()` / `clock.resume()` | stop without changing the hour |
| `clock.skipTo(hour)` | rest: run forward to the next time it reads `hour` |
| `clock.skip(hours)`, `clock.set(hour, day?)` | jump |
| `clock.value` / `clock.sync(value)` | network: the host broadcasts the number, a guest adopts it |
| `clock.save()` / `clock.load(s)` | `{ abs }`; the game saves it as `progress.env.abs` |

Story steps and cutscenes (workstream J1): `world.clock.pin(23.5, { id: 'step:<id>' })` on entry,
`world.clock.unpin('step:<id>')` on exit. Workstream K's adapter keeps the shape `hour`, `day`,
`pause()`, `pin()`.

## world.weather (src/env/weather.js)

States: `clear`, `overcast`, `drizzle`, `rain`, `storm` (alias `thunderstorm`), `fog`, `snow`.
The schedule is a Markov chain over 2-hour slots of game time, a pure function of the weather seed
and the clock's number (network: send the seed once, then the clock). Visible parameters follow
the scheduled or pinned state smoothly (about 45 s).

| call | what it does |
|---|---|
| `weather.state`, `weather.params` (`rain, snow, fog, cloud, wind, lightning`) | read |
| `weather.wetness`, `weather.snowCover` | the street, 0..1, built up and dried over time |
| `weather.visibility`, `weather.traction`, `weather.gust(t)`, `weather.wind`, `weather.windDir` | gameplay hooks |
| `weather.pin(state, { id, snap })` / `weather.unpin(id)` | story control (`snap: true` jumps straight to the look) |
| `weather.forecast(n)` | the next `n` slots `[{ state, inHours }]` |
| `weather.localAt(x, z)` | lake effect: `{ fog, snow }` thicker near open lake water |
| `weather.on(fn)` | lightning strikes `{ kind: 'lightning', distance, bearing }` (game.js turns them into the flash and `thunder { distance }`) |
| `weather.reseed(seed)` | network |

URL: `?time=<hour>` sets the clock, `?weather=<state>` pins the weather, `?daymin=<minutes>`.

## The environment object (src/env/environment.js)

`world.environmentAt(pos, { indoors })` or `__game.environment` (player 0):
`{ district, region, timeOfDay, day, daylight, night, weather, rain, snow, fog, wetness, snowCover,
wind, windDir, gust, indoors, altitude, traffic, crowd, space, visibility, traction }`.
Audio reads it through `__game.environment` (sound.js), traffic reads `world.clock.hour`, the
civilians read the clock and the weather, stealth may read `visibility`, vehicles `traction`,
gliding `gust`.

## Civilians (src/civilians/)

`createCivilians({ scene, assets, quality, world, events, players, combat, cameras })`, one update
per frame. Per tier (`archetypes.js CROWD_TIERS`): full skinned figures potato 12, low 20, medium 32,
high 45, ultra 64; the rest are one-draw billboards; figures are built on idle time only.
`civilians.registerSpot({ kind, x, y, z, yaw, cap })` adds a bench, a cart, a platform...
Events out: `civilianCall { pos, district, kind }`, `dispatch`, `bark { text, speaker: 'civilian' }`.
Events in: `impact`, `rifleShot`, `crimeSpawn` / `crimeActive` (with `pos` or `x, z`), `crimeEnd`.
Net: the simulation is seeded and runs on every machine; send reactions as
`civilians.stimulus(kind, x, z)` events.
