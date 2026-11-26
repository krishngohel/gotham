# Police attention, the GCPD and the sandbox (workstream W, `[wanted]` `[sandbox]`)

The owner asked for "a wanted level system with gcpd chasing you too" and for the game to "feel
like gta 5". Read as the design doc does (long-night-2.md section 5, the 2026-11-24 bullets, and the
IP line in section 1): the open-world crime-sandbox genre's freedom and reactivity, with our own
design, names, UI and content. Nothing here copies another game's HUD, map, missions, stations or art.

"Wanted" / "police attention" here is how hard the GCPD looks for the vigilante. It is **not** the
open world's district heat (`src/openworld/director.js`), which measures criminal activity.

## 1. Code

```
src/wanted/rules.js      pure rules: levels, offences, witnesses, modifiers, search, caught, non-lethal table
src/wanted/witness.js    pure sight: cones (stealth vision maths), weather, searchlight, the least-hidden spot
src/wanted/placement.js  pure: edge index, snap to road (same deck), predicted route, roadblock/spike/spawn spots
src/wanted/caps.js       pure: unit caps by quality flags, the level's unit budget
src/wanted/units.js      cruisers + vans (instanced), officers (pooled figures), helicopter, roadblocks, spikes
src/wanted/wanted.js     runtime: offences from events, sight, state machine, caught/custody, traffic stop, API
src/wanted/hud.js        the readout element (one per player view)
src/wanted/lines.js      barks, dispatch chatter, teaching cards (data)
src/wanted/save.js       progress.wanted (registered field)
src/sandbox/index.js     take any car, owner beat, arguments, pedestrians dive clear, stunts, taxis
src/sandbox/radio/       stations (data) and the car radio
src/sandbox/furniture.js destructible street furniture, pooled debris, hydrant spouts
src/sandbox/stunts.js    pure drift/jump scoring
src/sandbox/save.js      progress.sandbox (registered field)
```

Tests: `tests/unit/wantedRules.test.js`, `wantedPlacement.test.js`, `sandbox.test.js`;
`tests/e2e/wanted.spec.js`. Dev probe: `BASE=http://localhost:5840/ node scripts/wanted-probe.mjs <snippet.js> <outDir>`.

## 2. The levels

| level | name (readout tag) | what the city does |
|---|---|---|
| 0 | clear | nothing |
| 1 | NOTICED | two officers walk up to ask questions; a cruiser slows and tails. Walk away calmly: it ends. Run, glide or floor it within 7 m of them: "fleeing a stop" (level 2) |
| 2 | PURSUIT | officers on foot ("Stop! GCPD!"), cruisers route to where you are (or were) and box in a car; tasers on a hero on foot (a roll or being airborne beats it); PIT nudges |
| 3 | ROADBLOCKS | more units; a roadblock (two cruisers across the road + barricades) at a junction mouth ahead on your predicted route, a spike strip mid-block; a rooftop spotter on a perch |
| 4 | AIR ONE | a SWAT van (SWAT on foot, nets), the helicopter: its light tracks you (it can be outrun), sees you anywhere open, calls your heading; warning shots at a car's tyres |
| 5 | MANHUNT | the whole response, bascule bridges raised away from you, El fast travel refused, a city-wide search that only ends by going to ground |

**Rise.** Offences add points; only what someone saw counts. An officer's own eyes count at once; a
civilian phones it in 4-9 s later with a rough position; nobody saw it: nothing. Each offence has a
cap (a dented bin never brings out the helicopter). Offences (`OFFENCES` in rules.js): public fight
(only when reputation < 40 or the menace branding), collateral and property damage (street furniture,
roadblocks), reckless driving, pavement driving, wrong way (this city keeps left), ramming traffic,
ramming police, trespass (GCPD lobby, City Hall, Blackgate, Arkham; a Wayne site gives the reporter a
clue instead), fleeing a stop, interfering at a scene police hold, Batmobile weapons in the street,
taking a car, and every non-lethal act on police (stun, restrain, disable) and resisting arrest.

**Fall.** While any unit sees any hero it is a pursuit. Lose them for 2.5-4 s (after a 10 s response
grace for a fresh call) and it becomes a SEARCH: the amber ring round the badge drains, faster in a
safe place (interiors, the cave doors), under cover, on rooftops (levels 1-3), in another district,
in fog and rain, far from the last known position; at level 4 slowly in the open; at level 5 only in
a safe place. Seen again: back to the pursuit with the timer refilled. The search ends: COOLDOWN
(6 s, units leave out of sight), then clear. Units search the last known position: officers fan out,
cruisers patrol round it, the helicopter sweeps a widening spiral; the minimap shows the search
area, the ghost of where they last saw you, officers' vision wedges, cruisers and the light.

**Modifiers** (`modifiers()`): difficulty setting; Gordon's thread (rank >= 4: softer, and he calls
off levels 1-2 after a quiet spell, once per 3 minutes; rank <= 1: harsher city-wide, one more unit);
the menace branding (story; overrides Gordon, floors the level at 1); district stance (a district
with 4+ crimes stopped and low heat is friendlier; the Narrows, Park Row and the docks are corrupt
precincts and hostile regardless); a clean record (crimes stopped since the last chase excuse the
small offences).

## 3. The rule that keeps this Batman

He does not hurt police. Officers and police vehicles are not combat targets at all; anything aimed
at them converts (`NONLETHAL`, every entry has dmg 0, unit-tested): a punch within reach zip-ties an
officer (out of the chase, "THE RULE" card the first time), cape stun, bolas, glue, smoke (blinds:
they lose you), flashbang and sonic stun, EMP (cars immobilised, tasers fizzle), the riot round and
immobiliser stop cruisers, a ram shoves and spins a cruiser (never wrecks it), the main cannon is
refused, a disruptor makes the helicopter lose you. All of it buys time and raises the level.
Officers dive clear of a car. Civilians stay unharmable (the existing safety plus `vehicleDanger`).

**Caught** is never death. Officers on you while you are slow, a net or taser, or cruisers boxing a
stopped car fill a meter. Full: SURROUNDED, 3.2 s to struggle free (mash Punch or Jump) or drop
smoke. Free: resisting arrest (level up), nearby officers shoved. Not: Gordon lets you go with a
warning (trust >= 4, level <= 3, no menace), else the holding cell at the GCPD lobby: pick the lock
(Punch x4; the door always gives after 40 s), out into a breakout pursuit, with penalties (2 h on
the clock, reputation, Suspicion if the identity came close, gadgets locked 55-95 s).

## 4. Story API (for the story agents)

```js
const W = window.__game.wanted;           // game.wanted inside game.js
W.suspend('n6:hearing'); W.resume('n6:hearing');   // hold everything (stack of reasons)
W.set(3, { scripted: true, reason: 'n7:framed', at: { x, z } });  // a level now; scripted ignores "off"
W.brand(true);                             // Batman is a menace (saved: progress.wanted.menace)
W.clear('n7:gordonDeal');
W.offence('trespass', { site: 'cityHall', player });  // any offence id from OFFENCES
W.level; W.stateName; W.state              // read
events: wantedLevel { level, from, reason }, wantedState { state, level }, wantedOffence, wantedCaught,
        wantedEscaped { how }, wantedTicket, wantedTeach, roadblockHit, spikeStrip
```

Night One is protected: while one of its objectives waits the level caps at 2 and nobody is caught;
fights, bosses, cutscenes, chases, battles and puzzles hold offences in every night. Several nights
can brand Batman wanted as plot state with `brand(true)` and `set(n, { scripted: true })`.

## 5. Bruce and the double life

Feeds the existing systems through one tagged hook (`bruceEffects` -> `applyEffects`, src/bruce/runtime.js):
- As Bruce, speeding (> 21 m/s, about 75 km/h), the pavement or the wrong way gets a traffic stop: a cruiser pulls
  up behind; stop and wait = a ticket (Standing -1, `progress.wanted.tickets`, a comic line); drive
  off = Bruce Wayne ran from the police (detective +8, reporter +4) and a level 2 pursuit.
- Seen changing (becomeBruce while a unit or civilian sees you during a chase): detective +20,
  reporter +10. Unseen, up to level 3: the chase ends (Batman went to ground).
- Bruce within 60 m of a fresh Batman sighting: detective +3. Batman seen at a Wayne site: reporter.
- Reaching level 3: Gordon's thread -0.15, reporter +2; level 5: Gordon -0.3 and flag `manhunt`
  (the next day's headlines and Gordon's visit read the flags and meters). `progress.wanted.nights`
  keeps the night's peak, catches and escapes.

## 6. Units, budgets and cost

Caps by tier (`caps.js`, from the quality flags `lights` and `crowdDensity`, never the tier name):

| tier | vehicles | vans | officers | helicopter cone mesh | roadblocks |
|---|---|---|---|---|---|
| potato | 2 | 0 | 3 | no (ground spot only) | 1 |
| low | 3 | 1 | 5 | no | 1 |
| medium | 4 | 1 | 6 | yes | 2 |
| high | 5 | 2 | 8 | yes | 2 |
| ultra | 6 | 2 | 10 | yes | 3 |

Cruisers and vans are instanced (one draw set for all, the traffic fleet's models), driven by our
own kinematic driver on graph routes (repath every 0.8-1.6 s from the junction they are heading to;
direct steering only within 26 m of a car on the road). Officers are pooled skinned figures from the
civilian generator's `gcpd`/`gcpdF`/`swat` looks (built at most one per frame; one beat officer, one
SWAT figure and the helicopter are pre-built on quiet frames), walking the sidewalks of the street
graph and going direct when close and in the open. Everything spawns out of sight (95-175 m for
cars, 30-75 m for officers, on the hero's deck) and leaves out of sight.

Measured (headless Chrome, RTX 4060 laptop shared with other agents): `wanted.update` median
0.1-0.3 ms with 4 cruisers + 6 officers + the helicopter; 0.0x ms idle; `sandbox.update` 0.01 ms.
The first chase of a run can hitch 40-60 ms once while a figure template is made if the warm-up has
not run yet. Scopes for the perf probe (`?prof=1`, branch ln2/perf2): add
`['wanted', 'wanted', 'update'], ['sandbox', 'sandbox', 'update']` to `SCOPES` in src/dev/perfProbe.js;
both also keep their own EMA in `.stats.ms`.

## 7. Two players and online

One shared level; sight is per hero (one hidden and one seen = still a pursuit; the search drains at
the least hidden hero's rate); two heroes over 120 m apart split the pursuit (one extra cruiser,
under the cap); units target heroes round-robin; every local view gets its own readout.
Online: the host runs everything. `wanted.snapshot()` -> `{ v, points, level, state, search,
searchMax, lkp, menace, scripted, seq }`; a guest calls `wanted.apply(snap)` and only draws (its
`update` returns early when `isReplica()`). Send the snapshot on change (`seq`) and at 2 Hz during a
search; forward `wantedLevel`, `wantedState`, `wantedTeach`, `wantedCaught`, `wantedEscaped` as
reliable events. [verify] Wired: `wanted.js` registers `net.registerState('wanted')` (4 Hz) and
`'police'` (8 Hz, `src/wanted/netCodec.js`: cruisers, vans, officers with a pose, the helicopter and
its light, roadblocks, spikes; ~0.6 KiB for a full pursuit, ~40 kbit/s) and shares the five events.
A guest draws the units as puppets (`units.applyNet` / `updateReplica`, eased between updates) and on
its minimap. Being chased, the caught meter, the struggle, the cell and the non-lethal conversions run
on the host against the guest's hero (its presses arrive in the hero record); the guest holds its
own hero while the host holds it (caught, the cell) and shows its own teaching cards and cell hint.
Not done: a guest's gadget events near officers (smoke, glue...) are not converted on the host.

## 8. HUD and teaching

One element per view (`createWantedReadout`): a precinct shield whose five bands fill bottom-up in
siren red and blue, the amber search ring, a hand-lettered tag, and a siren-tinted screen edge when
units close in (steady tint under reduced motion). Interface for the HUD director:
`show() / hide() / release() / setPriority(n) / priority / visible / wants`. Teaching cards, once per
save, for each level, being caught, the no-harm rule, the traffic stop: `wanted.setDirector({ request, chip })`
routes them through the director; without one they use `hud.card`.

## 9. The sandbox

- **Take any car**: the vehicle key beside a street car of the traffic pool (moving under 10 m/s or
  stopped) takes it: the owner gets out on the kerb, shouts, runs and phones it in (a civilian
  witness: police attention), Batman loses a little reputation. At most two taken cars are kept.
- **Car radio**: five original stations (Night Owl jazz, Rust Belt rock, Lantern night market,
  Mile High hits, Gotham Public Radio) playing the game's own themes through the music director;
  DJ chatter, news that follows the police level and the city, the weather, satirical ads; the
  Batmobile gets the GCPD scanner or Alfred. Tune with the detective key while driving.
- **Street furniture**: bins, cones, barrels, newspaper boxes, hydrants (they spout), work fences at
  the kerb of every street with a sidewalk; cars and fights break them (pooled debris), collateral.
- **Stunts**: drift chains (multiplier up to x4) and jumps scored; bests saved; jumping near a
  bascule bridge or a ramp marks the spot on the map (discovered, not a checklist).
- **Taxi** (as Bruce): the vehicle key away from any car hails a cab to your waypoint (or Wayne
  Tower); it drives the street graph; Jump skips the ride (clock advances).
- **Reactions**: a driver you shove at low speed gets out and argues; pedestrians in a speeding
  car's path step aside and scatter (they are never hit).
- **Ability ids** in the onboarding layer ([verify], src/abilities/abilityDefs.js): `carRadio` with the
  Batmobile, `policeAttention` at Night One's `toAce` (Gordon's warning; no offence counts before it),
  `takeCar` and `hailTaxi` after the credits.

Thin or not done (honest): traffic does not swerve (needs a lateral offset in trafficSim, owner:
traffic); no police boats yet (the model exists; caps reserve 1-2); checkpoints at level 5 are the
fast-travel refusal and the raised bridges, not physical checkpoints; the helicopter has no rotor
loop sound (needs an audio loop); manholes are not "safe places" (they are baked into street
dressing with no list); radio music reuses district themes rather than new genre arrangements.
