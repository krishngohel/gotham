# Brief for the city-building agents (workstream H)

You are one of four agents building the Chicago-modelled Gotham on the world framework, each in a
different part of the map. The owner said the city expansion must be right first time, the existing
game must not break, and it must run on low-spec machines. The river, Lower Gotham and the first
row of Loop blocks already exist as the proof region — study them as the worked example.

## Read first

1. `docs/design/long-night-2.md` — all of it; sections 2 (hard rules), 4.2, 4.3, 6 and 8 (district
   table, scale rule) matter most.
2. `docs/design/world-framework.md` — how to add a region, the builder ctx API, chunk/LOD rules,
   sites, grapple points, spawn tables, graph edges, palettes, interiors, budgets, checklist.
3. `docs/design/research/city-and-content.md` — the sections for your districts (real Chicago
   dimensions with sources, Gotham identity, landmark analogues, gameplay purpose per district).
4. The code: `src/world/regions/**` (the proof region builders are your template),
   `src/world/chunks.js`, `staticBatches.js`, `cityBuilder.js`, `streetDressing.js`,
   `materials.js`, `textures.js`, `collision.js`, the street graph module, `src/world/cityLife.js`,
   `src/render/quality.js` (flags you must respect), `tests/unit/coreWorldFrozen.test.js`,
   `tests/e2e/world.spec.js`, `scripts/world-shots.mjs`.

## Rules specific to city building

- **Frozen core.** `coreCityFrozen` and `coreWorldFrozen` tests stay green untouched. Regions only
  append. `core` stays first in `REGIONS`. Use your own seeds. Never add `PointLight`s (light spots
  go through the pooled light index). Traffic keeps to the framework's side convention.
- **Scale rule.** Distances ≈ 0.3 × Chicago, heights ≈ 0.45 ×, but anything a body touches is true
  size (alleys 5 m, deck clearances, El columns, doors, stairs, railings 1.1 m).
- **Your region files only.** Create `src/world/regions/<yourRegion>.js` (and helper modules beside
  them). Shared files (`regions/index.js`, `chunks.js` never-cull ranges, material/texture
  registries, district data) get append-only edits — other city agents are appending to the same
  files, so keep each edit to a few adjacent lines and list them in the hand-back. Do not edit
  `src/game/**`, `src/combat/**`, `src/actors/**`, `src/render/**`, `src/players/**` — other
  workstreams are in those right now.
- **It is a place to play, not a backdrop.** Every district needs: a clear identity from the roof
  line and from the street; 3+ landmarks you can navigate by; rooftop routes (grapple points along
  roof edges, ledges, zip lines, flagpoles/gargoyle perches, at least one long glide line and one
  climb); street dressing (lamps, signage with original puns, bins, hydrants, steam, awnings,
  newsstands, bus shelters, phone boxes, trees where apt); alleys and courtyards for fights; at
  least 6 registered `sites` for later content (crime spots, a stealth location with perches, a
  side-mission door, a fast-travel point, a vista, a collectible hide); spawn-table entries for
  civilians, traffic and gangs; palette and ambience ids (`district` id is what audio and the
  comic palette key on); street-graph edges for every drivable street and sidewalk lines for
  pedestrians; collision that a car and a walking hero cannot fall through or snag on.
- **Signage and names are original.** Gotham names from the design doc; shop signs, billboards and
  posters are your own jokes. No real brands, no official DC logo art, no copying a specific
  film's or game's set piece.
- **Budgets.** Follow the per-chunk draw-call/triangle budgets in the framework doc. Far-LOD
  silhouettes for everything tall. Instancing/batching for repeated props. Report draw calls and
  triangles per pass from 3 street-level and 2 rooftop cameras in your districts on High and on
  Potato (`scripts/world-shots.mjs` records them) — a district that only runs on a 4060 is not done.
- **Shadows.** Static casters are marked once at world build (`world.shadows.markStatic`); anything
  that moves (bridges, trains, Ferris wheel) must be dynamic and cheap.
- **Interiors.** Only build an interior if your brief names it; otherwise doors are sites for later.

## How to work

Workspace per design rule 8: `git -C ~/Documents/Projects/gotham worktree add
../gotham-ln2-<name> -b ln2/<name> long-night-2`, `npm ci`, your own vite port, never 5200.
Build one district end to end first (layout → buildings → dressing → traversal → graph → sites →
budgets → screenshots), look at your own screenshots at street level, rooftop and from a glide,
fix what looks wrong, then the next. Commit per district with tests green.

Verify before hand-back: `npm test` (all green, never weaken a test), `npm run build`,
`BASE_URL=http://localhost:<port> npx playwright test` (23 pass on long-night-2), `BASE=http://localhost:<port>/
node scripts/playthrough.mjs`, `scripts/breakables-check.mjs`, `scripts/course-check.mjs`. Add to
`tests/e2e/world.spec.js`-style tests: each of your districts is reachable on foot and by car from
the core via the graph (A* route exists and a scripted drive/walk along it does not fall through),
and a glide across it finds grapple points. Add unit tests for any pure generators. Other agents
load the GPU at the same time: re-run a timed-out e2e before concluding, and measure
before/after back to back. Save 6–10 of your best screenshots per district to
`docs/design/shots/city/<district>/` (keep your total under 5 MB).

Hand-back (under 600 words): per district — what is built, landmarks, traversal routes, sites
registered (ids), budgets on High and Potato, an honest self-assessment from your screenshots (what
reads as Chicago-Gotham, what still looks generic or empty); shared-file edits; verification
commands and results; what the content workstreams should know (best fight spaces, chase routes,
stealth spots); risks.
