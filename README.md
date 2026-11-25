# Gotham: The Long Night

A comic-book Batman game that runs in the browser, alone or with a friend. Glide, grapple and drive
across a rainy, Chicago-shaped Gotham of sixteen districts with the El overhead and traffic below;
brawl through gangs with counters, chain takedowns and gadgets; stalk predator rooms; and play a
five-act campaign of nine nights that starts with the Joker's midnight plan (Night One: the
hijacked Wayne Tech cargo, the pirate broadcast, the gas charges, the clock tower) and goes on
through bosses, side crimes, detective cases and Bruce Wayne's days at the manor. Between missions
the city lives: day and night, weather, civilians, a GCPD that answers a wanted level, Riddler
trophies, a skill tree, suits and a photo mode.

Play as Batman (several suits), Batwoman, Nightwing, the Robins, Batgirl, Red Hood, a future
Batman or Superman, with a second player on the same PC (split screen) or online.

Everything is built in code: the city, the vehicles, the comic panels, the music and most sound.
Downloaded art is limited to the Quaternius characters, baked animation clips and a few CC0
Kenney sound layers; see [CREDITS.md](CREDITS.md). An unofficial, non-commercial fan game.

## Play

```
npm ci
npm run dev        # http://localhost:5200
```

Desktop browser with a mouse, or a gamepad (Xbox layout; others map through the browser's standard
mapping). Click the screen to capture the mouse. Every key can be rebound in Settings > Controls,
and pad buttons per player (Standard, Southpaw and Legacy layouts) in the Gamepad part of the same
tab. Settings > Accessibility has the assist and readability options.

### Keyboard and mouse

| Action | Default |
|---|---|
| Move | W A S D (or arrows) |
| Jump; glide (hold in the air) | Space |
| Sprint (gliding: dive) | Shift |
| Crouch (toggle, quieter and harder to see) | Z |
| Dodge roll | C |
| Grapple | F |
| Punch | Left mouse |
| Kick (in the air: jump-kick) | E |
| Block (hold) / counter (tap on the blue glyph) | Right mouse |
| Grab and throw | G |
| Cape stun | Q |
| Use the selected gadget | R |
| Gadget wheel (hold, pick with the mouse or 1-8) | Tab |
| Special takedown (combo meter yellow) | X |
| Chain takedowns 1-4 | 1 2 3 4 |
| Summon, enter or leave a vehicle | T |
| Call the Batwing (or eject) | Y |
| Detective vision | V |
| City map / set or clear a waypoint where you look | M / N |
| Co-op comms wheel (hold: mark, go here, help, quick chat) | B |
| Photo mode | O |
| Controls help | H |
| Pause and settings | Esc or P |

### Gamepad (Standard preset)

| Action | Button |
|---|---|
| Move / camera | Left stick / right stick (Southpaw swaps them) |
| Jump, glide | A |
| Kick | B |
| Punch | X |
| Block / counter | Y |
| Grapple | LB |
| Cape stun (tap) / gadget wheel (hold) | RB |
| Dodge | LT |
| Use gadget | RT |
| Crouch (tap) / sprint (hold) | L3 |
| Special takedown | R3 |
| Detective vision | View |
| Pause (the city map is in the pause menu) | Menu |
| Photo mode / controls help | D-pad up / D-pad down |
| Vehicle | D-pad left |
| Grab and throw | D-pad right |
| Chain takedowns 1-3 | Hold Y + D-pad left / up / right |
| Chain takedown 4 (Bat Swarm) | Hold Y + LB |
| Co-op comms wheel | Hold Y + D-pad down |

The Batwing has no default pad button (keyboard Y).

## Co-op

**Same PC, split screen.** Title screen > *Two players*. In the hero select, player 1 uses the
keyboard and mouse (or the first pad); player 2 presses Start or A on a controller to join, then
both pick a hero. Two pads work too; browsers cannot tell two keyboards apart, so only one player
can use the keyboard. The screen splits side by side (the pause menu switches to stacked and has
*Regroup* to bring player 2 over) and joins into one view for cutscenes and comics. A solo run
can also be opened to a friend from the pause menu (*Invite a friend online*). Story progress is shared; each player's XP goes to their own save.
A downed player can be revived by the other; both down returns to the checkpoint.

**Online.** One player chooses *Host online game*, the other *Join with code*. Three ways to connect:

- *Room code*: the host reads out a six-character code, the guest types it (signalling through
  public Nostr relays via Trystero, then a direct WebRTC link).
- *Paste codes*: when room codes cannot connect (strict networks), the host copies an offer code to
  the guest, who pastes it and sends an answer code back.
- *Same PC (two tabs)*: open the game in two tabs of one browser; they connect over
  `BroadcastChannel`. Useful for testing (`?net=broadcast` preselects it).

The host owns the story, the enemies and the world; the guest plays their own hero. If a network
blocks direct links the lobby warns; try Paste codes or another network.

## Quality and low-spec machines

Settings > Video has five tiers: **Potato, Low, Medium, High, Ultra**, plus *Auto* (the default:
it guesses from the GPU name, times the first frames and stores its choice). Potato and Low use
blob shadows, few or no dynamic lights, a shorter draw distance, a lighter ink pass and fewer
civilians and raindrops; Medium and up add real shadow maps and the screen-space effects. Dynamic
resolution (on by default) lowers the render scale under load.

On a weak laptop: pick Potato or Low, keep dynamic resolution on, make sure the browser uses
hardware acceleration (the game warns when it detects software rendering), and plug in the charger.
On a laptop with two GPUs, let the browser use the discrete one. Split screen draws the city twice,
so drop one tier for two players.

## Build and deploy

```
npm run build      # static site in dist/ (about 23 MB; the contract caps it at 40 MB)
npm run preview    # serve dist/ on http://localhost:5201
```

`dist/` is a plain static site and works from any static host. `.github/workflows/pages.yml` runs
the unit tests, builds, checks the size budget and deploys to GitHub Pages on a push to `main`.

## npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5200 |
| `npm run build` / `npm run preview` | production build to `dist/` / serve it on 5201 |
| `npm test` | unit tests (Vitest, `tests/unit/`) |
| `npm run test:e2e` | browser tests (Playwright, `tests/e2e/`; real GPU) |
| `npm run perf:gate` | structural performance budget check (`scripts/perf-gate.mjs`, needs `BASE`) |
| `npm run verify` | unit tests then a production build; the browser checks are in `scripts/verify/run-checks.sh` |
| `npm run assets` | rebuild `public/assets/` from the Quaternius packs (see `scripts/ASSETS.md`) |
| `npm run shots` | screenshot script (`scripts/shots.mjs`) |

## Checks

The browser checks need a real GPU and share it badly: run them one at a time, against a server on
your own port.

```
npm test                                          # unit tests
npm run build                                     # must stay under 40 MB

# e2e: Playwright starts `npm run dev` itself, or point it at a running server
BASE_URL=http://localhost:5860 npx playwright test
BASE_URL=http://localhost:5860 npx playwright test tests/e2e/coop.spec.js   # one spec

# automated story run, title to credits (comic pages saved to $OUT, default ./playthrough)
BASE=http://localhost:5860/ node scripts/playthrough.mjs
BASE=... P2=bot node scripts/playthrough.mjs                 # with a scripted second player (P2KIT=robin)
BASE=... CAMPAIGN=1 QUALITY=potato node scripts/playthrough.mjs   # every night, not just Night One
BASE=... NET=broadcast QUALITY=potato node scripts/playthrough.mjs # with an online guest in a second tab
BASE=... NIGHT=n2 START=<stepId> node scripts/playthrough.mjs     # from a night or a step
BASE=... ENGINE=firefox node scripts/playthrough.mjs

# visual walk through every story beat, with a log of cuts, falls and errors
node scripts/story-walk.mjs http://localhost:5860/ <outDir>

# performance gate: against a production preview (a dev server reloads mid-run)
npm run build && npx vite preview --port 5861 --strictPort
BASE=http://localhost:5861/ npm run perf:gate       # Q=low,potato SITES="gcpd roof" for a subset

# everything above in sequence, raw logs to $OUT
DEV=http://localhost:5860/ PREVIEW=http://localhost:5861/ OUT=docs/verification/raw-after \
  bash scripts/verify/run-checks.sh [pt pt-p2 pt-camp pt-camp-p2 pt-net pt-camp-net walk pacing breakables course perfgate browsers]
```

Write screenshots and run output outside the repo (or to a git-ignored folder); `playthrough/` and
`story-walk/` are the scripts' default output folders.

Other tools: `node scripts/perf.mjs` (frame rate per district), `node scripts/browsers.mjs`
(Chromium, Edge, Firefox boot the build), `node scripts/anim-check.mjs` (clip sanity),
`tools/roster.html` and `tools/pose-viewer.html` in the dev server (characters and clips).

### Dev URL parameters

Most are honoured in a dev build or with `?god=1`.

| Parameter | Effect |
|---|---|
| `?new=1` | start from a fresh save |
| `?at=<stepId>` | jump to a Night One step (`src/game/story.js`; retired ids resolve) |
| `?night=n2[&at=<stepId>]` | start a campaign night, optionally at a step |
| `?play=1`, `?new=1&skip=1` | skip the title screen |
| `?god=1` | no damage, every ability, dev tools |
| `?abilities=story` / `?moves=all` / `?gadgets=all` | story-gated abilities / every traversal move / every gadget |
| `?q=potato\|low\|medium\|high\|ultra` | quality tier for this boot |
| `?dynres=0` | dynamic resolution off |
| `?suit=m\|f\|gold` | starting suit |
| `?p2=bot` or `?p2=1` | second local player (scripted bot, or gamepad 1); `&p2kit=<kit id>` picks the hero |
| `?net=broadcast\|manual\|trystero` | preselect the online connection mode |
| `?fight=test` | combat sandbox on the GCPD roof |
| `?crime=<type>[&spot=<id>]` | force an open-world crime |
| `?contracts=1` | dev contracts in the collectibles layer |
| `?time=<0-24>`, `?weather=<state>`, `?daymin=<minutes>` | clock, weather and day length |
| `?civ=0` | no civilians |
| `?bruceDays=0\|1` | Bruce Wayne's day scenes off / on (off under automation by default) |
| `?standing=<n>` | Wayne standing for testing |
| `?hitstop=<s>` | minimum hit-stop |
| `?prof=1`, `?off=<a,b>`, `?gputime=1` | performance probe, systems switched off, GPU timer queries |
| `?bench=1` / `?bench=districts` | built-in benchmarks |
| `?views=2` | dev multi-view |
| `?hwcheck=1` | run the hardware-acceleration check under automation |
| `?force=1` | allow touch-only devices past the desktop notice |

## Where things live

| Folder | What |
|---|---|
| `src/main.js`, `src/game/` | boot, the game shell (`game.js`), Night One flow and story steps, fights, cutscenes |
| `src/story/` | the campaign: acts, nights (`nights/n1.js`-`n9.js`), step types, runner |
| `src/core/` | input (`input.js`, `bindings.js`), settings, saves and slots, events, loop |
| `src/players/`, `src/coop/`, `src/heroes/` | the players list, device assignment, split screen, the hero roster |
| `src/net/` | online co-op: sessions, signalling, transports, snapshot codecs, host/guest adapters |
| `src/world/`, `src/nav/` | the city, regions and chunks, collision, traffic; GPS, minimap data, fast travel |
| `src/actors/`, `src/anim/`, `src/config/` | hero and enemy actors, the animation graph, clip data |
| `src/combat/`, `src/enemies/`, `src/bosses/`, `src/stealth/` | combat rules, enemy roles and squads, bosses, predator rooms |
| `src/gadgets/`, `src/abilities/`, `src/progress/`, `src/traversal/` | gadgets, ability gates, skill tree and upgrades, traversal moves |
| `src/vehicles/` | Batmobile, Batcycle, Batwing, street cars, chases |
| `src/openworld/`, `src/wanted/`, `src/sandbox/` | crimes, cases, collectibles; GCPD wanted level; stunts, radio, street furniture |
| `src/bruce/`, `src/allies/`, `src/civilians/`, `src/env/` | Bruce Wayne days, allies, pedestrians, time of day and weather |
| `src/render/` | quality tiers, toon materials, the ink pipeline, dynamic resolution |
| `src/ui/`, `src/audio/` | HUD, menus, map, photo mode, accessibility; synthesised music and sound |
| `src/dev/` | dev-only probes and benchmarks (loaded by URL parameter) |
| `tests/unit/`, `tests/e2e/` | Vitest and Playwright tests |
| `scripts/`, `tools/` | asset pipeline, playthrough and perf scripts, dev viewers |
| `docs/` | design contract and workstream docs ([docs/README.md](docs/README.md)) |

The story text: Night One's steps are in `src/game/story.js`, its comic pages in
`src/game/scenes.js`; the later nights in `src/story/nights/`. `src/story.config.js` holds the
twelve Riddler trophy taunts and the closing credits text.

See [CREDITS.md](CREDITS.md) for licences.
