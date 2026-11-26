# Polish list (collected at integration)

Items seen by the orchestrator in screenshots or admitted in agent hand-backs that are not yet
fixed. The final polish wave works through this; tick items off with the commit that fixes them.

## Characters
- [x] Batman's emblem tip gaps: 3677ea7. Future and gaslight Batmen on the reworked chassis: 2fc305b. Gunner vs baton silhouettes: be30593. Red Hood holsters: 5b6db24 (shots/polish/chars). Cape hem: tried and reverted (8fdaed9).
      [polish2] Cape hem: not attempted (out of time after the world, cave, vehicle and ink items).
- [ ] Batman's cape renders pale blue from behind in play (noon and night, after the environment
      merge); it should read near-black/dark navy with a lighter lining at most. Check the cape
      material, the time-of-day light grade and the `[env]` wind edit in hero.js.
- [ ] Batman model: improvement is modest. Second pass on silhouette (cowl/jaw, chest, shoulders),
      dark-on-dark gauntlet blades, bulky base body.
- [ ] Red Hood's helmet is a flat red disc. Redo.
- [~] Alfred: superhero musculature shows through the suit; stair-stepped colour borders up close;
      carry poses for tray and umbrella.
      [polish] carry poses for tray and umbrella: aa260f6 (an upper-body overlay; waiters at the gala use it too). Musculature and colour borders not touched.

## Vehicles
- [~] Batmobile reads lean and very dark; needs bulk and rim lighting (assigned to L3).
      [polish2] 24e85e2: flank pods between the tyres and a fuller midsection, on top of L3's bulk and
      rim pass (shots/polish2/vehicles). Still an open-wheeled car: a heavier tail and haunches over
      the rear wheels were left alone (the wheels swivel sideways in battle mode and need the room).
- [x] Nightwing bike fairing too upright; deco fenders read as flaps; chunky smoke.
      [polish2] 24e85e2: the bike has its own raked fairing, low screen and belly pan; deco fenders
      keep their depth to both ends (sedan and cab); tyre smoke is rounder, smaller and fainter.
      The smoke was changed in code and not looked at in a burnout.

## City
- [~] Wayne Tower silhouette not distinctive; Iceberg Lounge plain from the street; Gotham Mile
      boulevard a little empty.
      [polish] Wayne Tower done: c9fc76e (crown, spire, lit W monograms and setback bands on the far skyline; shots/polish/city). Iceberg Lounge and Gotham Mile not done.
      [polish2] f59bc31: the Iceberg Lounge's street face (a waterline with the berg above and below it,
      lit fins, lounge windows, icicles) and the boulevard (pennants, median bulbs, benches, flower
      boxes, a fountain, a statue and a clock, kerb shrubs). No parked cars on the boulevard (they
      would stand in traffic lanes). shots/polish2/districts.
- [~] Park Row repetitive from the air; the Yards sparse and dark between landmarks; Odessa domes small.
      [polish2] Odessa domes: edd1b57 (done). The Yards: ae68acb (steel stock yard under a gantry
      crane, raw-material bays, freight on the two empty tracks, three flood masts; the night aerial
      is still dark away from them). Park Row: ae68acb, partial: roofs now differ (tones, bulkheads,
      skylights, chimneys, ducts) but the blocks are the same heights and sizes as before (those come
      from the region's seed), so from high up it still reads as a grid of similar flats.
- [x] Bristol cliffs and gorge walls look like stacked slabs.
      [polish2] 06bdd76: rock boxes cut finer and displaced by world-space noise, standing flakes,
      shaded beds; same rng draws and collision boxes.
- [x] The Mirror sculpture reads plainly; funhouse crown overlaps its eyes.
      [polish2] d7600d1.
- [x] Lake water flat (partly addressed by `[env]` water work — re-check).
      [polish2] 5bf8449: two-tone swell patches and near crest ticks on every water body. Same commit:
      the harbour lighthouse's flat wedge fades along its length (from above it covered Blackgate
      in yellow; shots/polish2/districts/before-blackgate-aerial.jpg).
- [~] El: riders can drop through the train floor on curves; West Line structure not built west of
      x -266 (corridor reserved on z -479, stations at x -370 and -520).
      [polish] riders stay on through curves: 7aa7caa (elRide.test). West Line west of x -266 still not built.
      [polish2] 7342c3d: built from x -266 to a terminus at Park Row (deck to x -557, tracks to -551):
      bents, deck, track bed, Narrows (x -370) and Park Row (x -520) stations with stairs, the
      shuttles run the whole line and call at Canal, the Narrows and Park Row; the map and fast
      travel list both stations (elWest.test). Potato and Low run one two-car shuttle instead of
      two four-car ones (the first gate run failed on visible skinned meshes at the Narrows site:
      84 against a budget of 60 x1.15). Tick: [x] for the West Line half of this item.
- [ ] Some core views use more draw calls than before chunking; halo pool at ~4.6k of 6k.
- [ ] Core parked cars raised chunk triangles 37k -> 45.5k (`PARKED_DETAIL` switch exists).

## Rendering
- [~] Ultra ink lighting: teal hatched artefact under the hero's feet on a wet roof; overall effect
      is subtle — decide whether it earns its place, tune or restrict to streets.
      [polish] not done.
      [polish2] 5a6b809: cause found and fixed. Two things: SSR accepted the hero's own rim light as a
      light source (teal dashes by his boots), and the depth-only AO counted a flat floor's nearer
      pixels as occluders at a steep camera pitch (the whole roof, and wet streets, hatched).
      Isolated by switching each effect off in the same frame (shots/polish2/ink). SSR now needs a
      lit area round the hit; AO measures occluders above the surface's tangent plane. Whether the
      effect earns its place was not decided here.
- [ ] Split screen: shadows and light pool follow the pair's midpoint.

## Combat
- [ ] Smoothness second pass (I2 in progress): travel strikes, ground pound, goon landings, foot lock.
- [ ] Normal difficulty may be too punishing.

## Co-op
- [ ] Never tested with real gamepads or between two real PCs.
- [x] Online gaps ([net2]): the guest drives and guns (host-simulated from its input); dual
      takedowns and team moves online; stealth rings, crime UI and the AI Nightwing on the guest;
      clock, weather and lightning synced; civilians hear the host's crimes and shots.
- [ ] Online, still host only or local ([net2], online-coop.md "Known limits"): a guest Batwing
      pilot and a guest's own bike (hint shown), challenges (hint shown), ambient traffic and civilian
      positions (local per machine), per-boss hazard visuals, crime props on the guest.
- [ ] Photo mode, crimes and challenges are player-one only (photo mode assigned to L1).

## Audio
- [~] Verified by measurement only; needs a human listen. Menus still use old UI sounds; gadget
      sounds not redesigned; Safari untested; `quay` district needs an ambience profile.
      [polish] menus now use the ui-bus sounds (uiHover/uiConfirm/uiTab/uiError): 2e246e6. The rest stands.

## Tests
- [ ] `coop.spec.js` "two heroes fight the same goons" is load-sensitive (assigned to I2).
- [ ] `gadgets.spec.js:67` old flake (assigned to L1).

## Story (from the campaign hand-back)
- [ ] New nights are short: an estimated 30–50 minutes each on Normal against a 60–90 minute
      target, and never timed by a human. Lengthen with real encounters, not padding.
- [ ] Boss mechanics checked by forcing state, never played by hand; fear and cold rates are
      untuned guesses. Predator rooms in the new nights were auto-won by the script, never played.
- [x] When a boss calls adds, the boss drops out of the combat list: the director pins him while
      his adds fight (J2, `[story2]`).
- [x] Both new chases reuse the Joker van and its toast text: every chase names its own quarry
      (`van` on the step; J2).
- [x] Fear and cold meters and the screen distortion are not split-screen aware: per view now
      (`src/story/viewFx.js`; J2). The Scarecrow boss's fear is one shared cloud, shown on each view.
- [x] The new nights and bosses run online ([net2]): `CAMPAIGN=1 NET=broadcast` playthrough, every
      framework boss replicated through the director (the Penguin tested with both players).
- [x] The villains follow the orchestrator's brief (Penguin, Riddler, Scarecrow, Freeze types), not
      the research doc's Act II/III list: reconciled in Acts IV and V (Ivy, Firefly, Black Mask, the
      Joker and Harley; no boss skill repeats). Unused from the research roster: Two-Face, Croc,
      the Tweedles (the finale's dual boss is the Joker and Harley instead).
- [ ] (J2) Penguin and Scarecrow bosses have no night-sim hint: the scripted player cannot beat
      them, so their timings are estimates. Firefly's vehicle fight is not driven by the sim.

## Bruce Wayne, Manor, Batcave (seen in screenshots by the orchestrator)
- [ ] Bruce in a tux or suit renders as a black muscular bodysuit from behind — he does not look
      like a man in clothes. Needs real jacket/trouser/collar/tie/cuff geometry and a civilian
      body shape. Same for gala guests and staff where they use the hero body.
- [x] During Bruce scenes the Batman HUD still shows: the story objective ("Walk to the
      Batsignal…"), the waypoint distance, the health ring and Batarang slot — and the double-life
      meter panel sits on top of them. Hide the Batman HUD in civilian mode; give the meters a
      proper place.
      [polish] 0d1f726 + 9e990c0: body.bruce-civ hides caption, banner, waypoint, health ring and gadget slot; the double-life card takes the vitals corner (shots/polish/hud/after-gala*.jpg).
- [x] Gala ballroom and the Batcave are sparse and flat (bare tables, plain walls, a blocky
      waterfall). Dress them: chandeliers, guests in groups, a band, drapes; cave scale, depth,
      stalactites, lit platforms, the vehicles and trophies visible.
      [polish] 6fb1579 + 1047ce3: Manor dressed room by room, the gala with conversation groups in formal looks, a band and waiters, the cave with depth, a waterfall, railed lit walkways, a screen wall, trophies. Before/after: docs/design/shots/polish/interiors/. The cave is better, not yet great (see the hand-back).
      [polish2] 7285e8f: the cave's rock no longer one grey: tones from height and each lamp's pool,
      dipping strata round the walls, black recesses, floor-to-roof columns and arches in
      silhouette, light shafts and washes; walls and roof go near black. Baked colour and additive
      cards only, no lights. shots/polish2/batcave.
- [ ] Six of eight collision scenes built (missing: Iceberg Lounge, museum hall). Vault suit choice
      applies on next load. Batcycle display-only. Story radio keeps running inside interiors;
      lightning comic words show indoors. Not host-only for online guests yet.

## Online + campaign (found at integration)
- [x] The guest follows the host's (night, step id) across nights; the playthrough's `NET=broadcast`
      check compares night + step id and the nights in order ([net2]).
- [x] World clock, weather seed/state and lightning are sent to the guest; civilian stimuli arrive as
      the host's crime and combat events ([net2]).

## HUD and UX (seen in screenshots by the orchestrator)
- [x] Title screen and first impression ([polish] 2e246e6): 'Gotham: The Long Night', one primary action, grouped actions, the camera drifting to Wayne Tower, page title, loading tips, a grouped What's new, arrow-key and pad focus states (shots/polish/title).
- [x] The screen gets crowded: minimap, objective card, WayneTech delivery card, comic sound words,
      radio panel, tutorial prompt and autosave badge can all be up at once and overlap the action
      (see docs/design/shots/move/battle-turret.jpg). Needs a HUD director: priorities, queueing,
      one centre-screen card at a time, auto-hide of tutorial prompts once learned, a compact mode,
      safe zones per split-screen view, and comic words that avoid UI panels.
      [polish] 0d1f726 + 9e990c0: src/ui/hudLayout.js grammar (corner chips, one feed column, the dialogue slot, one centre card, prompts bottom centre), comic words avoid every panel, compact HUD with teeth, split views get cards as chips. scripts/hud-shots.mjs forces the busy situations and reports overlaps (0 in drive, bomb, boss, gala; split screen: the wanted badge touches the minimap).
- [x] No gamepad button for the map or for dropping a waypoint mark.
      [polish] c642d50: hold View opens the map (tap stays detective vision); waypoints from the map with A; prompts in the map and the controls list.

## Vehicles and traversal (from the hand-back)
- [x] A bascule bridge deck stops being solid during its `closing` phase while the leaves are
      still down: walkers and traffic can fall through (the player's car is special-cased).
      [polish] 82fe960 (basculeDeck.test).
- [x] A bollard sits on the centre line at the Blackgate causeway mouth.
      [polish] bbe172b: it was a dock crate from the core's seed; taken out after the frozen build (worldfixCity.test).
- [ ] The camera floor change lifts the camera off lower rooftops in some views.
- [ ] Not done: ceiling perches, Batwing patrol/chase use, brake lamps on traffic, El-roof surfing
      helper, remote-gadget integration with `vehicles.remoteCall()`.
- [x] Street graph straight lines cut through some railings (drive legs in tests start on-road).
      [polish] 415e5a3: Lower Gotham ramps and the pier foot; a test now checks every graph edge against railings, fences and parapets.

## Combat balance (from the second-pass hand-back)
- [ ] Hard is not tense (a competent scripted player loses ~2 HP per fight); Knightmare still lets
      a masher win grunt-only fights. Root: auto-targeting sends mashed punches into whoever is
      winding up, interrupting them. Needs a rules change, then re-tune with scripts/combat-tune.mjs.
- [ ] Joker boss, Nightwing and stealth takedowns still on plain cross-fades; arm-twist counter and
      dual takedowns not yet paired; six residual 0.26–0.41 m pops (audit-after.txt).

## Owner playtest feedback, 2026-11-24 (highest priority)
- [ ] **Frame rate collapsed.** `scripts/perf.mjs` on the RTX 4060: baseline High 332/514/513/353/601
      fps (gcpd roof / docks / neon street / ace chemicals / clock plaza), now 54/77/65/58/94; Low
      358/516/469/342/623 → 96/124/121/92/133 (measured with other agents on the GPU). Owner:
      "the fps dropped a lot, the game optimization is pretty bad". Assigned: ln2/perf2. Lesson for
      integration: run `scripts/perf.mjs` after every merge, contended GPU or not — a 6x drop shows
      through any noise.
- [ ] **Everything is unlocked from the start.** Owner: "the grapple gun and advanced combos etc —
      the story needs to teach this rather than just giving it out". Assigned: ln2/onboard
      (abilities layer, Night One as the tutorial arc, later abilities via campaign rewards).
- [ ] **Abrupt popups.** Owner: "walking up to tasks or checkpoints gives an abrupt popup, it's not
      a smooth transition". Assigned: ln2/onboard (HUD director, distance-based ease-in, queueing).
- [ ] **Story still choppy, though better.** Assigned: ln2/onboard job 3 (interruptions logged
      through real scripted play).

## State after the third wave (2026-11-24, all branches merged)
Frame rate, old build (5fe2c7f on :5201) and new build measured alternately in the same minutes
with `scripts/perf.mjs`, machine idle but apparently throttled (the OLD build read 48–190 fps
instead of its recorded 330–600; single readings on this laptop vary several-fold with machine
state, so only same-moment A/B comparisons mean anything):

| round | build | High: gcpd / docks / neon / ace / clock | Low: gcpd / docks / neon / ace / clock |
|---|---|---|---|
| 1 | old | 48 / 93 / 90 / 53 / 162 | 79 / 113 / 87 / 57 / 161 |
| 1 | new | 38 / 48 / 46 / 33 / 68 | 50 / 49 / 61 / 47 / 138 |
| 2 | old | 83 / 137 / 126 / 94 / 187 | 98 / 145 / 134 / 98 / 204 |
| 2 | new | 77 / 99 / 91 / 67 / 102 | 98 / 113 / 113 / 86 / 146 |
| 3 | old | 81 / 134 / 127 / 96 / 131 | 70 / 164 / 111 / 59 / 148 |
| 3 | new | 42 / 60 / 50 / 33 / 69 | 53 / 60 / 66 / 48 / 105 |

- [ ] **Performance round 2.** New is roughly 50–75% of old on High and 60–90% on Low at the same
      moment. Target: parity with the old build on Low and Potato in the core city, ≥ 85% on High.
- [x] `tests/e2e/movement.spec.js:44` (grapple chain across the Loop) fails on every full run: the
      start roof it picks is 140 m high and no grapple targets are offered during the long glide.
      ([verify] `82dfbaa`: test assumption, not a game regression: same roof and up-only grapple on
      ln2/move; the run had 3-4 lines and '> 3' flaked with load. Starts on a mid roof now.)
- [x] `CAMPAIGN=1 NET=broadcast` playthrough errored twice at integration (once disturbed by a
      merge reload; the second not explained). Re-run and diagnose. ([verify] passes on real Potato
      from a frozen worktree: n1 > ... > n9 on both pages, same (n9, n9End), no console errors. The
      unexplained `name: 'Error'` is the shape of a Playwright navigation/evaluate exception: the
      served tree or server changing under the run; run long checks from a frozen worktree.)
- [ ] Under load the first-boot auto-quality benchmark reloads the page mid-game.
- [ ] Wanted: no police boats; traffic does not swerve; radio stations reuse district themes;
      officers snag on corners. ([verify] `d3c6998` done: units replicated to a guest, teaching
      through the HUD director, the four ability ids in the abilities layer.)
- [ ] Story: nights 2–9 run an estimated 35–55 minutes each against a 60–90 minute target; the
      scripted player cannot beat Ivy (thrall targeting fights the player); fear rates untuned;
      Firefly's vehicle boss never driven by a sim. ([verify] `suit:questionMarkCowl` is a real suit now.)
- [ ] Onboarding: comic/cinematic time in Night One unchanged (~33 s in the opening stretch).
      ([verify] skill tree says "Arrives in Night N" (`4f35534`); partners' vehicle calls gated (`e5d9f39`).)

## Found by the integration verifier (2026-11-24, branch ln2/verify; owners in brackets)
- [ ] (perf) `scripts/perf-gate.mjs` fails on Potato at long-night-2 head as well as on ln2/verify:
      `matrixWalk` 4,150-4,890 against budgets of 3,554-4,048 (x1.15) at every site but the GCPD
      roof. Same numbers on both builds (A/B, docs/verification/raw/perfgate-potato-*.txt), so it
      predates this branch: the budget was recorded on ln2/perf2 before W (always-present police
      instanced sets, barricades, spikes) and onboarding merged. Re-record or cut the walk.
- [ ] (perf) Triangle counts at neon street and the Narrows vary ~15% run to run on the same build
      (traffic and crowd placement), which can trip the gate's x1.15 tris check by itself.
- [ ] (perf) Boot loads one 2.94 MB JS chunk (all game code incl. three) plus 8.9 MB of preloaded
      GLB (outfits 2.6, anims_mocap 3.2, anims1/2 1.7, bodies 1.3); civ clips (2.8 MB) at run start.
      Candidates to split off the first chunk: the nine campaign nights' data, bosses, Bruce/Manor,
      wanted/sandbox, photo mode (netGame/netUi already lazy). dist 24.5 MB (baseline ~11 MB).
- [ ] (HUD look) Split screen at 1600x800: each view's minimap overlaps the left end of its centre
      card; the radio panel is centred on the whole window and straddles the split.
- [ ] (HUD) A card issued before player 2 joins (the WayneTech delivery) stays in player 1's director
      only; harmless, but the two views show different centre cards for a few seconds.
- [ ] (Bruce/K) `roomEnter` / `roomExit` (src/world/interiors.js) have no listener: the story radio
      and the lightning comic words could use them to go quiet indoors (polish list, Bruce section).
      Firefly's vehicle boss never driven by a sim; `suit:questionMarkCowl` is not a real suit id.
- [ ] Onboarding: comic/cinematic time in Night One unchanged (~33 s in the opening stretch); the
      skill tree does not say "arrives in Night N"; partners can still call vehicles through co-op seats.

## Balance pass findings (`[balance]`, docs/design/balance.md)
- [ ] **Nights are ~17-21 minutes for an average player** (measured fights and bosses, modelled
      travel), not 35-55: the 60-90 minute target needs about three times the content (3-4 more
      missions a night). Balance added optional skirmishes and longer bosses only.
- [ ] Side-chain bosses not beaten by the scripted player: the Clay Man (it never reached the first
      lever from the arena edge: check the lever sites are reachable on foot), the Two-Faced DA (the
      bot loses the plates across levels), the Cat Burglar's 'Nine Lives' (stalls after the roof
      chase even with her back on the combat list). Needs a human run each.
- [ ] Firefly: the bot drives the Batmobile through `startPilot` but lines up only some rams
      (reached phase 2 once in 10 min). A person should judge whether the swoop line is readable.
- [ ] Riddler: one run of three stalled for 10 minutes in the last question (crew squad + panels);
      the other two finished in 73-92 s.
- [ ] Night One's Joker (boss.js, untouched: Night One is sacred) is over in about a minute for an
      average player.
- [ ] Lieutenant reinforcements were never seen in the balance fight set (no act-5 lieutenant in
      those squads); medic revives were attempted in 14 fights and finished twice.
