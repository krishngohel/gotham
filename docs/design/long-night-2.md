# Gotham: The Long Night 2 — overhaul design

Branch `long-night-2`. This file is the shared contract for every agent working on the overhaul.
Read sections 1–3 and the section for your workstream before touching code.

## 1. Intent

The owner's words, condensed: the game works and must not break, but it is too short, too easy,
the city is small and empty, combat is not smooth and animations sometimes do not match the action,
the story flow is choppy, and it needs to run on lower-specced machines. The two headline changes
are **co-op** (online room code *and* same-PC split screen, playing Robin variants, alternate
Batmen, Superman and others) and a **city expansion modelled on Chicago with Gotham character**.
Those two must be right first time. Everything keeps the comic-book look.

Full requested scope (each is owned by a workstream in section 5):

- Low-spec optimisation; better shaders, shadows and "ray-traced" lighting within the comic look.
- City expansion (Chicago layout, Gotham flavour), more crimes, more civilians, living streets.
- Co-op: online + split screen, a roster of playable heroes.
- Combat overhaul; animation/action sync; more enemy types; smarter goons.
- Player character work: better Batman model, much better Nightwing, Alfred model. Batwoman
  (the `f` suit) is fine as is — do not restyle her.
- Longer, harder game: more story, more villains and boss fights, side missions, smoother story flow.
- Batcave, Wayne Manor, playable Bruce Wayne and a felt double life (section 5, K).
- More gadgets, a real skill tree, more suits, photo mode upgrade.
- Better cars; a tank-style Batmobile with pursuit and battle modes (original design, see below).
- Minimap, player waypoints, GPS route drawn on the roads.
- Day/night cycle and dynamic weather.
- Better sound effects, music, and jokes.

Anti-goals: breaking a save; breaking the existing story path; a prettier game that runs worse on
the Low preset than today; co-op that desyncs or soft-locks the story; a city where the old
districts moved; realism that loses the ink-and-halftone look.

IP line: this is an unofficial fan game with original art, writing and level design. Do not
replicate a specific existing game's assets, levels, UI or signature designs (for example the
Batmobile is our own design, not a copy of any game's or film's car). Write original dialogue;
take tone, not lines, from films and shows.

## 2. Hard rules for every agent

1. **Never break main-path behaviour.** `npm test` (1,174 tests at baseline), `npm run build`,
   `npm run test:e2e` and `node scripts/playthrough.mjs` must be green when you hand back. Baseline
   numbers live in `docs/baseline/README.md`. If a baseline test must change because behaviour
   intentionally changed, say so explicitly in your hand-back with the reason; never delete or
   weaken a test to get green.
2. **Saves stay compatible.** Keys `gotham-progress-v1` and `gotham-settings-v1` keep loading. New
   persistent data goes through `registerProgressField` (`src/core/save.js`) with safe defaults and
   a unit test that an old save (see `tests/unit/persistence.test.js`) still loads.
3. **The core city does not move.** `buildMapData(11)` output, `SITES`, trophy spots, zip routes and
   breakable spots are frozen (guard test: `tests/unit/coreCityFrozen.test.js`). New land is added
   as new regions with their own seeds (section 4.2), never by editing the core grid.
4. **Single-player is co-op with one player.** No `if (coop)` forks in gameplay code; write to the
   players list (section 4.1). `game.hero` stays as an alias of player 0 for old call sites.
5. **Low spec is a feature.** Anything new that costs GPU/CPU has a quality-tier switch
   (section 4.3) and is off or cheap on `potato`/`low`. New per-frame code allocates nothing.
6. **Comic look.** Toon materials via `src/render/toon.js` and `src/world/materials.js`; everything
   goes through the ink pipeline. No PBR-looking assets, no photo textures.
7. **Assets must be licence-clean** and recorded in `CREDITS.md` with source URL, licence and
   download date. See the licence table in `docs/design/research/combat-animation-assets.md`.
   Allowed: Quaternius (note: new downloads fall under the "Quaternius Asset License v1.0", not
   CC0 — fine to ship inside the game, never as a standalone asset dump), Kenney (CC0), KayKit,
   CMU mocap, CC0 sounds layered over the synth (ship as Opus/WebM). Mixamo animation only as
   retargeted clips baked into our GLB, credited, never raw FBX in the repo. Not allowed:
   Bandai-Namco mocap (non-commercial licence), Sonniss files in the repo, Sketchfab fan models of
   DC characters, photo-real texture sets, anything ripped from a game, voice that imitates a real
   actor. Character names stay in data files so the project could be renamed. Keep the shipped
   `dist/` under 40 MB; lazy-load anything a player may never see.
8. **Work in your own git worktree and port.** `git worktree add ../gotham-ln2-<name> -b
   ln2/<name> long-night-2`, `npm ci` there, run vite on your assigned port
   (`npx vite --port <port> --strictPort`, e2e with `BASE_URL=http://localhost:<port>`). Stay inside
   the files your brief lists; if you must touch a file outside it, keep the edit minimal and list
   it in the hand-back. Commit to your branch in small commits; do not push, merge or touch
   `long-night-2` itself.
9. **Test-first for logic.** Pure rules (targeting, AI choice, net messages, route finding, skill
   tree maths, schedules) live in DOM-free modules with Vitest tests, as the codebase already does.
10. **Report honestly.** Hand-back = what changed, what you verified and how (commands + results),
    what you did not verify, known gaps. Screenshots of new visuals go to
    `docs/design/shots/<workstream>/`.

Code style: match the existing files — plain ES modules, factory functions (`createX({deps})`),
comments that explain why, no new runtime dependencies without a line of justification in the
hand-back (the game currently ships only `three`).

## 3. Approaches considered

**Co-op networking.** (a) Deterministic lockstep: rejected — the sim uses variable dt, a shared RNG
and wall-clock time. (b) Dedicated server: rejected — the game is a static site. (c) **Chosen:
peer-to-peer, host-authoritative replication.** The host owns enemies, story, crimes and world
events; every peer owns its own hero. State is replicated as snapshots and events, not inputs.
Signalling uses a public PeerJS broker for room codes with a manual copy-paste code fallback; a
`BroadcastChannel` transport gives two-tabs-on-one-PC play and makes co-op testable in Playwright.

**City expansion.** (a) Enlarge the 7×7 grid: rejected — one seed drives everything, so every
existing building would reshuffle. (b) Rebuild the city from real map data: rejected — loses the
authored districts. (c) **Chosen: regions.** The existing city is region `core`, untouched; new
districts are separately seeded regions around it, built into distance-culled chunks, sharing one
street graph used by traffic, the GPS and AI.

**Rendering.** (a) Port to WebGPU for real ray tracing: rejected — rewrites every shader and locks
out the low-spec machines this is meant to help. (c) **Chosen: stay on WebGL2, add screen-space
ray-marched effects on the upper tiers** (contact shadows, ambient occlusion, wet-street
reflections), cascaded shadows, and cut the base cost so the lower tiers get faster than today.

**Characters and animation.** Keep the single shared 65-bone Quaternius skeleton so every clip
works on every character. Better models come from more careful region painting, more modelled
rigid parts and CC0 parts — not from foreign rigs. New motion comes through the existing
Mixamo → `fbx2glb` → `retarget-mocap` pipeline when the owner supplies a logged-in session, with
procedural `poseAuthor` clips as the always-available fallback.

## 4. Shared architecture contracts

### 4.1 Players (owner: workstream B)

```
game.players: Player[]            // 1..2 local; remote players appear here as proxies
Player = { id, slot, local, kit, hero, input, view, fighter, hudSlot }
game.hero  === game.players[0].hero      // legacy alias, keep working
```

- `kit` — a hero definition from `src/heroes/roster.js`: model builder, move set, traversal
  (glide / grapple / flight / acrobat), stats, gadget list, voice lines. Batman variants, Batwoman,
  Nightwing, Robin (several), Batgirl, Red Hood, Superman, etc. A kit never special-cases in
  gameplay code; it is data + small strategy objects.
- `input` — an input *source* with the existing action API (`down/pressed/released/move/look`).
  Sources: keyboard+mouse, gamepad N, remote (net), scripted (tests).
- `view` — camera + follow rig + viewport rect. One per local player.
- `fighter` — the per-hero half of combat (combo, input buffer, chains, focus target). Enemies,
  the attack director and hit resolution are shared.
- Enemies pick a target with `pickTarget(enemy, players)` (aggro: distance, who hit me last, spread
  across players). Anything that used "the hero" takes a player or asks `nearestPlayer(pos)`.
- Events carry `player` where relevant (`heroHurt`, `heroDown`, `land`, …); listeners that ignore it
  keep working.
- Co-op rules: shared story progress; a downed player can be revived by the other within a timer,
  both down = checkpoint; enemy counts and attack tokens scale with player count (health at most 1.25x); XP is credited to each
  player's own save.

### 4.2 World regions (owner: workstream C)

```
REGIONS: Region[]   // src/world/regions/index.js
Region = { id, name, bounds, seed, build(ctx), districtAt(x,z), sites, spawnTables, palette }
world.regionAt(x,z), world.districtAt(x,z), world.streetGraph, world.visibleChunks
```

- `core` wraps today's builders byte-for-byte. New regions use a per-region RNG and chunked
  buckets (no city-wide "global" meshes) so chunks can be culled by distance and frustum, with a
  cheap merged far-LOD silhouette per chunk.
- Collision stays fully loaded (it is cheap) but the spatial hash must scale past 65,536 boxes;
  glow sprites and light spots become per-chunk.
- `streetGraph` — nodes at intersections, edges with lane data, covering core and new regions.
  Consumers: traffic, civilians' sidewalks, GPS route, vehicle AI, crime spawn points.
- District names are data, not literals: saves, crimes, palettes, progress read the region list.

### 4.3 Quality tiers (owner: workstream A)

`potato | low | medium | high | ultra` in `src/render/quality.js`. `low` and `high` keep their
ids (saves) and `high` keeps today's look as its floor. First boot picks a tier from the GPU string
and a 2-second benchmark; the player can override. Every system reads flags from the quality
object (`quality.shadows.cascades`, `quality.ssr`, `quality.crowdDensity`, `quality.drawDistance`,
…); nobody tests the tier name. Target: `potato` holds 30 fps on a 2018 Intel UHD 620 laptop at
720p in the busiest new district; `low` is faster than today's Low in the core city.

**Amendments from research (`docs/design/research/rendering-performance.md` is authoritative for
A and for C's mesh structure; follow its prioritised list in order, measuring before and after
each step — its expected wins are estimates, not measurements):**

- "Core is frozen" means map *data* (rule 3), not mesh grouping. **C re-buckets the core city too**
  into ~128 m chunks per material, indexed geometry, with a far-LOD silhouette per chunk; draw
  distance follows the fog. The core's visual result must be unchanged (screenshot compare).
- A: fixed-size light pool per tier (0/2/4/6/8) with interior fills moved into it; remove the
  separate normal pass (depth-only creases on potato/low, MRT normals on medium+); cached static
  city shadow map + small per-frame character map, thresholded into inked shapes. **No three-csm**
  (it overwrites `onBeforeCompile` and redraws every cascade). Skeletons must update once per
  frame, not once per pass.
- Tier detection: GPU string is a hint only; decide with a benchmark of the real pipeline run after
  prewarm; dynamic resolution stays as the safety net.
- Upper tiers (last): GTAO reusing our depth/normals, stylised wet-street reflections, contact
  shadows — all quantised into hatching/dots, never soft-realistic. True hardware ray tracing does
  not exist in browsers on WebGL2 or WebGPU; these screen-space effects are what "ray tracing"
  means in this project.
- Collision: dense typed-array grid that scales past 65,536 boxes with no per-call allocation (C).

### 4.4 Net (owner: workstream D)

`src/net/`: `transport` (loopback | broadcast | webrtc) → `session` (lobby, room code, roles,
clock sync, reconnect) → `replication` (snapshots at 15–20 Hz with interpolation for enemies and
remote heroes; reliable ordered events for hits, KOs, story steps, pickups, crimes).
A guest runs the same game in *replica* mode: it never spawns enemies or advances story itself; it
applies host events, simulates only its own hero, and sends hit claims the host validates. Message
schemas are plain data with versioned encode/decode and unit tests. A version handshake refuses
mismatched builds.

**Amendments from research (`docs/design/research/coop-netcode.md` is authoritative for D; read
its "Decisions and why" list):**

- Signalling primary is **Trystero (Nostr strategy, exact version pinned, behind our own
  `signaller` interface)**, not the public PeerJS broker (unbounded delays reported, no uptime
  promise). Manual copy-paste code is the last resort and needs a countdown + auto-regenerate
  because the answer must arrive within ~10–15 s.
- Two data channels: `ctl` (reliable, ordered: handshake, events) and `state` (unordered, no
  retransmits: snapshots, hero state, clock pings). Snapshots are hand-rolled `DataView` binary
  under ~1,100 bytes; events may be JSON.
- **Time scaling is per actor, not global (owner: B, then I).** `src/core/time.js` currently slows
  the whole world for hit-stop, slow motion, the gadget wheel and impact frames. With two players
  that is wrong: hit-stop freezes only the attacker and the victim; the gadget wheel and remote
  holds do not slow the world when more than one player is present; world slow motion is reserved
  for rare host-broadcast cinematic moments. With one player the feel must match today.
- Enemy attacks on a guest are resolved on the guest (counter / dodge / hit) and reported; the
  host accepts or times out. Grabs and takedowns need a host-granted lock on the target.
- A hidden host tab gets no animation frames: v1 pauses both players with a "host away" overlay.
- Save rule: a guest keeps XP, unlocks and collectibles earned, but story steps completed in the
  host's world do not advance the guest's own story.
- Split screen: each view owns its render-target pair and ink uniforms; the final ink pass draws to
  the canvas with viewport + scissor (in r186 `setViewport` does not apply to render targets).
  Shadows render once per frame; split screen drops one quality tier. At most one keyboard+mouse
  player; gamepads are matched by `index`.

### 4.5 Time of day and weather (owner: workstream M)

`world.clock` (0–24 h, pausable, story steps can pin it) and `world.weather` (state machine: clear,
drizzle, rain, storm, fog, snow) drive sky, fog, light colours, rain, wetness, ambience and AI
schedules through one `environment` object. Nights are long, days are short and overcast.

## 5. Workstreams

Wave 1 (foundations, parallel, mostly disjoint files):

- **A. Render and performance** — `src/render/**`, `src/core/settings.js`, lights. Tiers; shadow
  map throttling and cascades; light culling (interior lights off outside); normal-pass and ink
  shader cost; screen-space contact shadows, AO and wet reflections for upper tiers; viewport-aware
  pipeline so split screen can render two views; perf scripts updated. Also a **hardware
  acceleration prompt**: when the browser is rendering in software (SwiftShader, llvmpipe,
  "Microsoft Basic Render Driver", or a failed major-performance-caveat context) show a popup that
  says so and gives the exact steps for the player's browser (Chrome, Edge, Firefox, Opera, Brave)
  with a "check again" button and a "play anyway on Potato" option; build on the existing
  integrated-GPU hint (`maybeShowGpuHint`, `src/render/gpuInfo*`).
- **B. Players core** — `src/game/game.js`, `src/combat/**`, `src/actors/hero.js`, `enemy.js`,
  `src/core/input.js`, HUD. Contract 4.1 with one player behaving exactly as today, plus a dev
  second local player (`?p2=1`) proving two heroes fight the same goons.
- **C. World framework** — `src/world/**`. Contract 4.2, street graph, capacity fixes, chunk
  culling/LOD, with a small proof region so the framework is exercised end to end.
- **E. Audio** — `src/audio/**`, `src/game/sound.js`. Spatial sfx, surfaces, longer adaptive music
  per district/act, city ambience (traffic, sirens, crowds, the El), dispatch radio, impact
  layering, bark playback API.
- **F. Characters** — `src/actors/characters.js`, `nightwingChar.js`, `outfits*.js`,
  `scripts/paint-suits.mjs`, new `src/heroes/` model builders. Batman polish, Nightwing rebuild,
  Alfred, Bruce Wayne (civilian looks), civilian variety, roster models, more suits.
- **G. Vehicle models** — `src/vehicles/vehicleModels.js` and new model files. Better street cars,
  police, taxis, buses, trucks, the El train cars, the new Batmobile body.

Wave 2 (needs wave 1):

- **D. Co-op** — split screen (two views, two inputs, lobby UI) then online (contract 4.4), hero
  select, revive, scaling. Owns `src/net/**`, `src/coop/**`.
- **H. The city** — the Chicago-modelled regions on C's framework (section 6).
- **I. Combat and enemies** — the sync fixes listed in `docs/design/combat-findings.md`, animation
  events instead of timers, turn smoothing, directional reactions, new enemy types, squad AI.

Wave 3 (content on top):

- **J. Story, villains, bosses, side missions, crimes, pacing.**
- **K. Bruce Wayne, Wayne Manor, Batcave, Alfred, the double life.**
- **L. Gadgets, skill tree, suits, photo mode, minimap/waypoints/GPS, Batmobile mechanics.**
- **M. Day/night, weather, civilians and street life.**

Added by the owner after the first draft (all confirmed), with their owning workstream:

- **Detective cases** (J): crime scenes with evidence scanning in detective vision, reconstructing
  what happened, deduction boards; some investigated as Bruce in plain clothes (K).
- **Fear and reputation** (I + J): a city-wide fear level and per-gang reputation fed by how the
  player fights; goons hesitate, surrender, flee or call for backup; news and police radio react.
  Feeds the double-life meters (K).
- **Open-world stealth** (J on I's AI): sniper nests, hostage rooms and gang hideouts in every
  district on the existing predator system.
- **Co-op glue** (D): dual takedowns, a ping/mark wheel, drop-in/drop-out mid-mission, one
  signature team move per hero pairing, quick-chat lines.
- **Fast travel and Batcave hub** (K + L): El stations and Batwing drops; the Batcave holds the
  Batcomputer (map, cases, villain files), trophy room, suit and gadget loadout, vehicle bay and a
  training simulator that is also the tutorial.
- **New Game Plus, difficulty modes, accessibility** (J + L): a hard mode without counter
  warnings, NG+ carrying upgrades, subtitles with speaker names, colour-blind-safe indicators,
  gamepad rebinding, hold/toggle options, screen-shake and flash reduction.
- **Grapple gun upgrades and wingsuit** (L, traversal code in `src/actors/hero.js` and
  `src/actors/traverse/**`): grapple tiers in the skill tree — longer range, faster reel, a
  grapple *boost* that launches the hero past the ledge into a glide, mid-glide re-grapple to
  chain momentum, and a pull that yanks enemies or objects. The wingsuit upgrades the cape glide:
  dive to build speed, pull up to trade speed for height, tighter turns, a speed-line tunnel
  effect; it is how a 4x city stays fun to cross. Each co-op hero's kit maps these to its own
  traversal (Nightwing/Robin lines and acrobatics, Superman flight).
- **Save slots with export/import** (L): three slots migrated from the single existing save
  (which becomes slot 1), plus export/import as a file or code. Co-op guests keep their own save.

- **Wanted level and the GCPD** (added 2026-11-24, workstream W): a heat/wanted system with
  escalating police response — beat officers, cruisers, roadblocks and spike strips, SWAT vans, a
  searchlight helicopter — that the player evades by breaking line of sight, hiding and using the
  rooftops. Batman never harms police: he can only disable non-lethally, and doing so raises heat.
  Tied to reputation ("vigilante: friend or foe"), Gordon's trust and, as Bruce, to Suspicion.
- **Open-world sandbox feel** (added 2026-11-24, owner: "game should feel like GTA 5"): the genre's
  freedom and reactivity — go anywhere, take any vehicle, a city that reacts and pushes back, car
  radio, activities and mission markers discovered in the world rather than a linear chain — with
  our own design, UI and content. No copying that game's HUD, map, missions, characters or audio.

Wave 4: integration, balance, full regression against the baseline, polish, PR.

## 6. The city (workstream H brief)

Old Gotham (region `core`) becomes the old harbour quarter at the south end. Around it, a
Chicago-shaped city with Gotham names and gargoyles:

- **The River** — a canal-walled river with a fork, crossed by lifting bascule bridges, a river
  walk below street level, tour boats. It separates Old Gotham from downtown.
- **The Loop** — dense downtown inside an elevated-train rectangle (the "El", running trains you
  can ride on top of), art-deco towers, Wayne Tower as the tallest building, a Board of Trade-style
  canyon street, Gotham City Hall, the theatre district with marquees.
- **Lower Gotham** — a double-decker street along the river (green-lit lower level, loading docks),
  ideal for car chases and ambushes.
- **Gotham Mile** — the big shopping avenue north of the river, a water-tower-style landmark, the
  Iceberg Lounge, hotels.
- **The Lakefront** — a big park with a monumental fountain and a mirrored sculpture analogue,
  a lakeshore drive, a long amusement pier with a Ferris wheel (Amusement Mile), a museum campus
  (natural history museum, planetarium, aquarium), marina.
- **The Narrows / Park Row** — tight tenements, alleys, fire escapes, Crime Alley, a monorail spur.
- **The Yards** — stockyards, rail yards, steel works and grain elevators to the south-west.
- **Chinatown, Little Odessa** — gates, lanterns, mob fronts.
- **Arkham Island** — the asylum on an island in the lake, reached by causeway.
- **Bristol** — wooded hills north of the city with Wayne Manor; the Batcave beneath it.

Target land area about four times today's. Every district needs: its own palette, signage,
landmarks you can navigate by, rooftop routes (grapple points, zip lines, ledges), interiors where
the story needs them, street dressing, and entries in the crime/civilian/traffic spawn tables.

## 7. The double life (workstream K brief)

Bruce Wayne is playable out of the suit: the Manor, Wayne Tower, galas, board meetings, charity
visits, plain-clothes investigation. The player must *feel* the strain and the overlap:

- **One clock, two calendars.** Wayne commitments and Batman emergencies land on the same nights.
  The Batsignal lights during the gala; a board vote is at 9 a.m. after a night that ended at 5.
- **You cannot do both well.** Slipping away costs Wayne standing (the board, the press, the
  people who care about Bruce); staying costs the city (the crime escalates, someone gets hurt, a
  lead goes cold). Neither bar can be maxed — the systems push against each other.
- **The night follows you into the day.** Injuries show (a split lip at the fundraiser), fatigue
  dulls Bruce's dialogue options and Batman's stamina, excuses wear thin and people notice.
- **Suspicion.** Reporters, a sharp detective and a villain or two start joining dots; cover
  stories and the playboy act are a mechanic, not a cutscene.
- **Alfred** is the conscience and the stage manager — he covers, patches wounds and says what it
  is costing. Relationships (Alfred, Gordon, Dick, a love interest, Lucius) have their own
  threads that advance or fray depending on which life the player keeps choosing.
- Wayne standing funds R&D (gadgets, suits, the car); neglect it and upgrades slow down.

## 8. Amendments from the city and content research

`docs/design/research/city-and-content.md` is authoritative for H, J, K, L and M (district
dimensions, 26 crime types, villains and boss mechanics, campaign acts, double-life scenarios,
comedy lines, 56-node skill tree). Changes to the briefs above:

- **Scale rule for every builder:** distances compress to about 0.3 of Chicago's, heights to about
  0.45 (Wayne Tower 190 m), but anything a body touches stays true size: alleys 5 m, deck
  clearances, El columns, doors, stairs.
- New streets continue the core's 60 m street lines across the bridges. Neighbourhoods use a 2:1
  block (120 x 60 m) with a 5 m alley; the Loop keeps square 60 m blocks served from the lower deck.
- **One rail system:** the El (Loop rectangle + a West Line through five districts, rideable).
  No separate monorail.
- The core's existing ICEBERG sign in Neon Row stays as the Penguin's old dive; the new Lounge is on
  Gotham Mile. Add river locks, Blackgate on a harbour islet, and a downtown Batcave entrance.
- **Campaign:** the current story is kept intact as Night One; Acts II–V add seven more nights with
  a short Bruce day between each. The five stand-alone radio steps in `story.js` fold into the
  travel steps that follow them (lines play while moving) — the main cause of the choppy feel.
- **Double life meters:** Standing, City and a shared Fatigue meter, soft-capped rather than
  unmaxable; Suspicion remembers which excuses were used. The Wayne side never blocks the main
  story, it changes how a night starts.
- **Skill tree:** the 20 existing WayneTech upgrade ids stay as the first nodes so old saves load;
  the Wayne branch is bought with Standing instead of XP.
- Crimes are composed from objective x twist x place x escalation, with per-district heat and gangs;
  in co-op the objective splits between the players.

District map (x east, z south, metres):

| District | x | z |
|---|---|---|
| Old Gotham (core, unchanged) | -236..236 | -236..205 |
| River main stem (water) | -266..366 | -276..-236 |
| North/South Branch (water) | -300..-266 | -600..205 |
| South Branch quay | -266..-236 | -236..205 |
| Lower Gotham (double deck) | -266..366 | -306..-276 |
| The Loop (El at x ±90, z -330..-570) | -266..236 | -600..-306 |
| Gotham Mile | -40..236 | -780..-600 |
| Robinson Park + Lakeshore Drive | 236..366 | -780..80 |
| Museum Campus | 236..366 | 80..300 |
| Amusement Mile pier | 366..626 | -470..-430 |
| The Narrows (island) | -430..-300 | -600..-236 |
| Park Row / Crime Alley | -580..-450 | -600..-226 |
| Chinatown + Little Odessa | -580..-300 | -226..-30 |
| The Yards | -580..-300 | -30..205 |
| Bristol (Wayne Manor) | -580..-40 | -780..-600 |
| Arkham Island (causeway at z -80) | 560..740 | -160..0 |
