# Common brief for wave 3 agents

Waves 1 and 2 are merged into `long-night-2`: players list and split-screen co-op, the render
tiers, the world framework and the whole Chicago-modelled city (16 districts, the El, traffic),
new characters and vehicles, the animation library, the audio system, and the combat/enemy
overhaul. You are adding one slice on top. Several other agents are adding other slices at the same
time in their own worktrees; the orchestrator merges everyone.

## Read first (all agents)

1. `docs/design/long-night-2.md` — the contract. Sections 1, 2 (hard rules), 4, 5, 7, 8.
2. `docs/design/research/city-and-content.md` — authoritative for content design: crime types,
   villains and boss mechanics, campaign acts, double-life scenarios, comedy lines, skill tree.
3. The docs for what you build on: `docs/design/world-framework.md` (regions, sites, street graph),
   `docs/design/coop-seams.md` (which functions/events are player-scoped or host-only — everything
   you add must work for two players and must put world-changing actions behind the same seams),
   `docs/design/anim-manifest.md` (available clips), the hand-back notes summarised in your brief.
4. `docs/baseline/README.md` — what "not broken" means.

## Rules that bite in wave 3

- **Night One is sacred.** The existing 62-step story must still play start to finish exactly as
  the automated playthrough expects (`scripts/playthrough.mjs`, single and `P2=bot`), unless your
  brief explicitly owns a change to it.
- **Two players always.** Anything keyed to "the hero" is a bug. Use `game.players`, player-scoped
  events (`withPlayer`), per-view HUD. Test your feature with `?p2=bot`.
- **Saves.** New persistent state goes through `registerProgressField` with defaults and a unit
  test that an old save loads. Never rename or repurpose an existing field.
- **Low spec.** New visuals read quality flags (`src/render/quality.js`); no new `PointLight`s
  (use the light-spot index); no per-frame allocation; lazy-load content the player may not reach.
- **game.js is shared.** Put your system in your own module(s) with a `createX({deps})` factory and
  wire it into `src/game/game.js` with one small, clearly tagged block (`// [your-tag] ...`) for
  construction and one line in the update loop. Do not reorganise the file. The same goes for
  `flow.js`, `menus.js`, `hud.js`, `save.js`, `sound.js`: append, tag, list the edit.
- **Content is data.** Missions, crimes, dialogue, skill nodes, gadgets, schedules: plain data
  files with a small interpreter, unit-tested for consistency (ids unique, sites exist, every
  referenced clip/model/site resolves).
- **Writing.** Original dialogue in a consistent comic voice; clean enough for a general audience;
  funny where the research doc says humour belongs (goon barks, Alfred, signage, radio), never
  undercutting the serious beats. No lines lifted from films, shows or other games. Character
  names stay in data.
- **Audio/UI hooks.** Emit the events the audio system listens for (`src/game/sound.js` lists
  them: `missionComplete`, `caseSolved`, `waypointSet`, `fearRising`, `collectible`, `bark`,
  `dispatch`, `flow.musicContext`, the environment object). Text shown to players goes through the
  existing prompt/radio/subtitle systems so accessibility options apply.

## Workflow

Design rule 8: your own worktree (`git -C ~/Documents/Projects/gotham worktree add
../gotham-ln2-<name> -b ln2/<name> long-night-2`), `npm ci`, your own vite port, never 5200.
Stage the work and commit at each stage with tests green. Look at your own screenshots.

Verify before hand-back: `npm test` (never weaken a test), `npm run build` (report `dist` size),
`BASE_URL=http://localhost:<port> npx playwright test`, `BASE=http://localhost:<port>/ node
scripts/playthrough.mjs` and the same with `P2=bot`, `scripts/story-walk.mjs`. Many agents share
one GPU: a timeout may be load — re-run that spec alone before concluding, and say which specs
were flaky. `tests/e2e/coop.spec.js` "two heroes fight the same goons" is known to be
load-sensitive; another agent is fixing it.

Hand-back (under 600 words): done / partial / not done per numbered item in your brief; what a
human should try first (exact URL params and controls); public APIs and data formats other
workstreams will use; every edit outside your own modules (file + why); verification commands and
results; honest self-assessment and risks. Screenshots to `docs/design/shots/<your-tag>/` (< 4 MB).
