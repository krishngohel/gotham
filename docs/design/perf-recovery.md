# Performance recovery (perf2)

The owner, after playing the merged `long-night-2`: "the fps dropped a lot, the game optimization is
pretty bad". This is the record of what was measured, what it cost, what was changed, and how to
keep it from coming back. Branch `ln2/perf2`; every code edit is tagged `[perf2]`.

## 1. Measuring on a shared machine

The RTX 4060 laptop was shared with four to six other agents for the whole session (their headless
browsers, e2e suites and builds; `nvidia-smi` read 30-99 % utilisation before any of our pages ran).
Absolute frame rates swung by 3x from one minute to the next, and the pre-overhaul build measured
**today** is nowhere near its recorded numbers:

| `scripts/perf.mjs`, High | gcpd roof | docks | neon street | ace chemicals | clock plaza |
|---|---|---|---|---|---|
| baseline as recorded (docs/baseline/04-perf.txt, quiet machine) | 332 | 514 | 513 | 353 | 601 |
| the same baseline build (5fe2c7f), today, shared machine | 113-196 | 61-240 | 147-218 | 129-153 | 40-262 |
| long-night-2, today, same conditions | 75 | 113 | 83 | 70 | 89 |

So most of the "6x" in the first report was the machine, not the game; the real regression, A/B on
the same machine at the same minute, was about **1.5-2.5x on High**, and it was almost all **CPU**
(JavaScript): at every site the frame time was the JS time plus under a millisecond, while the
GPU's own timer said 4-7 ms of a 10-12 ms frame. A low-spec player has a far slower CPU than this
one, so the CPU side is also what hurts them most.

Tools added (all measurement-only; nothing loads without its URL flag):

- `?prof=1` (src/dev/perfProbe.js): wraps the update method of every big system from the outside
  (no frame-loop changes) and records per frame: JS ms per system (`game`, `hero`, `hero.cape`,
  `combat`, `civilians`, `vehicles`, `side`, `nav`, `world`, `world.traffic`, `world.chunks`,
  `render`, `render.matrices`, `hud`, `audio`, ...), draw calls and triangles per pass, visible
  skinned meshes, lit point lights, scene objects and the objects the matrix walk visits, shader
  programs, DOM mutations per frame, heap growth and long tasks. `window.__prof.report()`.
- `?off=a,b` (same file): turns one system off each for A/B (traffic, civilians, el, weather, sky,
  shadows, mrt, inkfx, minimap, nav, openworld, crimes, hud, halos, audio, cape, vehicles, farlod,
  bruce, lobby, hulls, skinned, xray, boats).
- `scripts/perf-matrix.mjs`: the seven-site matrix (the five baseline sites plus the Loop under the
  El and the Narrows) per tier, with `?prof=1`; `BASES=a=url,b=url` compares servers, `PAIRED=1`
  opens every server's page at once and measures them side by side, so a burst of load from
  another program lands on both sides of the comparison (the only way to get usable A/B numbers on
  this machine); `CPU=4` (CDP throttle) and `WEAK=swiftshader` are the low-spec proxies.
- `scripts/hitch-tour.mjs`: a ~100 s route across district boundaries (street "drive" legs at
  18 m/s, rooftop "glide" legs at 28 m/s) listing every frame over 25 ms with place, district and
  the renderer's program/texture/geometry counts.
- `scripts/perf-gate.mjs` + `docs/perf2/perf-budget.json`: the regression guard (section 6).

Raw results are in `docs/perf2/*.json`.

## 2. Before: the frame budget on long-night-2

`perf-matrix.mjs` on the frozen `long-night-2` (a554518), 1920x1080, vsync off, dynamic resolution
off, one round per tier on a contended machine (read the columns against each other, not as
absolute speed). JS columns are mean ms per frame.

| tier | site | frame ms | JS ms | GPU ms | render (of which matrices) | game (of which cape) | world (traffic) | civilians | nav | draws | tris | skinned visible | scene objects |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ultra | gcpd roof | 12.5 | 12.3 | 8.1 | 9.6 (2.1) | 2.0 (0.9) | 0.51 (0.14) | 0.07 | 0.12 | 611 | 920k | 109 | 6661 |
| ultra | docks | 8.4 | 8 | 5.37 | 6.1 (2.2) | 1.3 (0.6) | 0.49 (0.15) | 0.05 | 0.06 | 238 | 268k | 62 | 7076 |
| ultra | neon street | 10.1 | 9.6 | 6.3 | 7.4 (2.3) | 1.5 (0.6) | 0.50 (0.15) | 0.09 | 0.08 | 358 | 606k | 70 | 7242 |
| ultra | ace chemicals | 10.1 | 9.7 | 5.85 | 7.6 (2.2) | 1.4 (0.6) | 0.47 (0.13) | 0.04 | 0.08 | 450 | 521k | 80 | 7242 |
| ultra | clock plaza | 11.1 | 10.7 | 6.83 | 8.6 (2.3) | 1.4 (0.6) | 0.48 (0.14) | 0.05 | 0.08 | 524 | 849k | 88 | 7325 |
| ultra | loop el | 11.2 | 10.7 | 7.02 | 8.3 (2.4) | 1.5 (0.6) | 0.47 (0.13) | 0.13 | 0.10 | 418 | 739k | 148 | 7408 |
| ultra | narrows | 18.1 | 17.1 | 9.52 | 14.0 (3.6) | 2.4 (1.1) | 0.63 (0.12) | 0.14 | 0.17 | 590 | 812k | 114 | 7657 |
| high | gcpd roof | 20.3 | 19.1 | 11.27 | 15.1 (4.1) | 3.1 (1.3) | 0.81 (0.20) | 0.14 | 0.24 | 532 | 687k | 103 | 6742 |
| high | docks | 8.4 | 7.9 | 4.74 | 6.1 (2.2) | 1.3 (0.6) | 0.49 (0.14) | 0.04 | 0.06 | 226 | 244k | 62 | 6742 |
| high | neon street | 12.3 | 11.7 | 6.62 | 8.9 (2.6) | 1.9 (1.0) | 0.59 (0.17) | 0.07 | 0.10 | 333 | 494k | 64 | 6908 |
| high | ace chemicals | 10.6 | 10 | 6.24 | 7.8 (2.2) | 1.7 (0.8) | 0.55 (0.14) | 0.04 | 0.10 | 386 | 437k | 69 | 6908 |
| high | clock plaza | 11.5 | 10.9 | 6.41 | 8.6 (2.4) | 1.5 (0.7) | 0.52 (0.14) | 0.05 | 0.08 | 470 | 599k | 76 | 6908 |
| high | loop el | 10.4 | 9.9 | 5.74 | 7.8 (2.3) | 1.6 (0.7) | 0.49 (0.14) | 0.06 | 0.10 | 370 | 452k | 127 | 6908 |
| high | narrows | 12.1 | 11.6 | 6.91 | 13.6 (2.4) | 1.6 (0.8) | 0.46 (0.10) | 0.06 | 0.10 | 562 | 699k | 93 | 6991 |
| low | gcpd roof | 10.8 | 10 | 6.68 | 7.2 (2.0) | 2.2 (1.0) | 0.54 (0.11) | 0.06 | 0.09 | 366 | 423k | 100 | 5509 |
| low | docks | 7.1 | 6.6 | 3.32 | 4.8 (1.9) | 1.2 (0.5) | 0.46 (0.09) | 0.03 | 0.05 | 188 | 161k | 59 | 5509 |
| low | neon street | 7.5 | 7 | 3.95 | 5.3 (1.8) | 1.3 (0.5) | 0.44 (0.09) | 0.05 | 0.05 | 271 | 267k | 60 | 5509 |
| low | ace chemicals | 7.5 | 6.9 | 3.67 | 4.8 (1.8) | 1.2 (0.5) | 0.44 (0.09) | 0.03 | 0.05 | 257 | 262k | 59 | 5509 |
| low | clock plaza | 7.3 | 6.7 | 3.53 | 4.9 (1.8) | 1.2 (0.5) | 0.44 (0.08) | 0.03 | 0.05 | 272 | 306k | 59 | 5509 |
| low | loop el | 7.9 | 7.3 | 4.32 | 5.2 (1.8) | 1.3 (0.5) | 0.42 (0.08) | 0.09 | 0.06 | 278 | 336k | 97 | 5509 |
| low | narrows | 8.4 | 7.9 | 4.3 | 5.8 (1.9) | 1.3 (0.5) | 0.44 (0.10) | 0.04 | 0.06 | 355 | 302k | 63 | 5509 |
| potato | gcpd roof | 8 | 7.2 | 4.81 | 5.0 (1.4) | 1.5 (0.6) | 0.41 (0.07) | 0.03 | 0.05 | 304 | 352k | 98 | 4739 |
| potato | docks | 6.3 | 5.9 | 2.78 | 4.0 (1.5) | 1.1 (0.4) | 0.41 (0.07) | 0.02 | 0.04 | 173 | 158k | 59 | 4739 |
| potato | neon street | 6 | 5.5 | 3.11 | 4.0 (1.3) | 1.0 (0.4) | 0.36 (0.06) | 0.03 | 0.04 | 222 | 251k | 59 | 4739 |
| potato | ace chemicals | 6.7 | 6.1 | 3.41 | 4.3 (1.4) | 1.1 (0.5) | 0.40 (0.07) | 0.03 | 0.05 | 244 | 263k | 59 | 4739 |
| potato | clock plaza | 6.3 | 5.8 | 3.09 | 4.0 (1.4) | 1.1 (0.5) | 0.38 (0.07) | 0.03 | 0.04 | 215 | 232k | 59 | 4739 |
| potato | loop el | 7.4 | 6.9 | 3.9 | 4.8 (1.5) | 1.3 (0.6) | 0.42 (0.08) | 0.04 | 0.06 | 239 | 295k | 75 | 4739 |
| potato | narrows | 9.3 | 8.6 | 4.38 | 6.3 (2.0) | 1.7 (0.8) | 0.52 (0.09) | 0.04 | 0.08 | 261 | 259k | 61 | 4739 |

Reading it:

- **render is 70-80 % of the JS frame** at every site and tier: three.js submitting 200-600 draw
  calls (each material switch re-uploads that material's uniforms; ~10-20 µs per draw here) plus a
  1.3-4 ms walk over 4,700-7,600 scene objects to recompose world matrices.
- **game** (every gameplay system together) is 1-3 ms, of which the hero's cape cloth is the largest
  single item (0.4-1.3 ms; unchanged since the baseline). Everything else in the list the brief
  suspected is small at these sites: traffic 0.07-0.2 ms, civilians 0.03-0.14, nav/minimap
  0.04-0.24, side content/crimes/open world 0.05-0.12, HUD 0.003-0.012 (one DOM mutation a frame on
  average), audio 0.01. Heap growth showed no GC pressure (GC 0.04 ms/frame in CPU profiles).
- **skinned meshes visible: 59-148**, with the hero alone 12. Each goon is ~13 skinned parts and
  ~44k triangles, and wore 6-8 separate `Skeleton`s (one bone texture upload each per frame).
- **GPU** 3-11 ms; at 1080p on this GPU it is not the limit on any tier.

## 3. Ranked: what was costing what

Found by CPU profiles (`Profiler` over CDP, inclusive time per function), the probe, the ablation
switches and a draw-call inventory (every `renderBufferDirect` of a frame grouped by object and
material).

| # | cost | where | size (High, this machine) |
|---|---|---|---|
| 1 | every character part drawn wherever the camera looked, and drawn again into the shadow map: skinned bodies, garments, kit slots, their hulls and x-ray copies were all `frustumCulled = false` | src/actors, src/heroes, src/render/toon.js | ~30-40 % of character draws; the dynamic shadow map drew every visible character and El car in the city each frame |
| 2 | static ink hulls (`addHullOutline` on props) also never culled: e.g. 12 Riddler marks x 8 draws each drawn from 400 m in fog | toon.js, trophies.js | 69 of 227 draws at the docks |
| 3 | the GCPD lobby's three cell goons (39 skinned meshes, 133k triangles, animated) drawn from the GCPD roof, 35 m of tower above them | gcpdLobby.js | 39 skinned + hulls + animation at the roof |
| 4 | world-matrix walk over hidden pooled civilians (83 objects each), El cars off their stretch and the lobby | inkPipeline.js | 1.3-4 ms -> visited objects 4,750 -> 2,700 |
| 5 | civilian figure templates built whole in one idle callback; with no idle time the 400 ms timeout forced them anyway | civilians/crowd.js | 25-250 ms long tasks every 0.4 s for the first 20-30 s of play (40-60 builds) |
| 6 | garments each with their own Skeleton | outfitParts.js | 5-6 extra bone-texture uploads per goon per frame |
| 7 | first boot on a fast GPU auto-promoted to Ultra from a title-view benchmark | tierDetect.js | Ultra's 4096 shadow map, AO/contact/SSR and 64-figure crowds for a player who never chose them |
| 8 | (partly fixed: signs, hull materials) per-chunk, per-material city draws (18 near chunks x ~13 materials at the GCPD roof) and many small unmerged props with hulls | world builder | ~100-250 draws |
| 9 | (not fixed) dynamic resolution re-allocating every render target on each 5 % step | game.js applyResolution | a ~40 ms hitch per step when the machine struggles |

## 4. Fixes, in order, with before -> after

Numbers are paired (same moment, same machine) unless stated.

Each fix was A/B'd against a frozen `long-night-2`; the combined effect of fixes 1-7 is in the table
at the end of this section, of all of them in section 5.

1. **Skinned characters frustum-cull** (src/render/skinCull.js, called once per frame from the ink
   pipeline; commit b1fd443). Every 20th frame, each newly visible skinned mesh that was built
   unculled gets a bounding sphere from a sample of its vertices skinned to its current pose, in
   its own space, radius doubled so any pose stays inside, shared per position buffer (crowds share
   templates), and culling is turned on; three then culls it against the camera and the shadow
   cameras. Opt out per mesh with `userData.noSkinCull`. Visible effect: none (spheres are
   conservative; checked at the roof fight, Neon Row and the Loop, screenshots identical).
2. **The dynamic shadow map draws only nearby casters** (src/render/shadows.js). On the frames that
   redraw the small per-frame character map (±12 m on High), casters farther than 1.5x its radius
   + 4 m sit out that one render call. Visible effect: none (they were outside the map).
3. **GCPD lobby goons hide above the lobby's ceiling** (src/game/gcpdLobby.js `LOBBY_VIEW_TOP`):
   39 skinned meshes and 133k triangles were drawn and animated from the roof 35 m above them.
   The unit test that asserted "visible from the GCPD roof" now asserts the opposite (it was a
   pre-overhaul simplification from when a goon was one cheap mesh; nothing in the lobby can be
   seen from the roof). Skinned meshes visible at the roof: 103 -> 63.
4. **Hidden pooled things skip the matrix walk** (inkPipeline.js `updateMatrices`, flag
   `userData.parkHidden`): pooled civilian figures, El cars off their stretch of line, the lobby.
   Objects visited per frame at the GCPD roof: 4,750 -> 2,700 (matrix-composed 3,232 -> 1,182).
5. **Garments share skeletons** (src/actors/outfitParts.js `wornSkeleton`): a garment whose bones and
   bind inverses match the body's binds to the body's skeleton, otherwise one skeleton per source
   skin per character. Bone-texture uploads per goon per frame: 7-8 -> 3 (body, eyes, brows).
6. **Crowd figures build in slices, and on the title screen** (src/actors/civilians/figure.js
   `prepareFigure`/`templateSteps`, src/civilians/crowd.js). The template build is a generator
   (one draped garment, the body paint, one part per step); in play the builder runs a few ms per
   idle callback; on the title screen and menus `warmCrowdTemplates` builds whole templates while
   nobody is playing. A figure is no longer one 25-250 ms task (measured 54-249 ms long tasks on
   long-night-2 in the first minute at the Loop and the Narrows); the largest single step is now a
   draped garment, 8-20 ms on this contended CPU.
7. **Static ink hulls cull with their mesh; Riddler marks stop drawing past 110 m**
   (skinCull.js, src/game/trophies.js). A static hull shares its mesh's geometry at identity, so
   it now culls exactly when the mesh does (it was never culled). The 12 trophy marks (4 parts + 4
   hulls each) hide past 110 m, per frame and for every hero (co-op safe); their detective-vision
   x-ray marker is untouched. Draws at the docks on High: 227 -> 145.
8. **First boot no longer auto-picks Ultra** (src/render/tierDetect.js, `DETECT_VERSION` 2 so
   stored Ultra picks are redone): the benchmark times the title view, which says nothing about
   Ultra's screen-space lighting, 4096 shadow map and 64-figure crowds in a street. An RTX 4060
   laptop seeded High and was promoted to Ultra; it now stays on High. Ultra is one click away.
9. **Loose sign planes cull at the LOD distance** (src/world/cityBuilder.js `cullLooseSigns`,
   unit test tests/unit/looseSigns.test.js): neon/poster planes the atlas batcher skipped
   (flickering ones, and sets too large for one atlas: most west/east signs) were each a draw out
   to the full draw distance; they now join the chunk detail list with the 'lod' range. 77 draws at
   the Narrows were from these.
10. **Hull materials shared** per colour/width/kind (src/render/toon.js; batwing.js gets its own
   slate one): distinct materials in one colour pass at the docks 149 -> 81, so far fewer uniform
   re-uploads between draws.
11. **Production build fix**: a stray non-UTF-8 byte in shadows.js from an edit broke `vite build`
   (caught and fixed before hand-back).

Paired A/B (both pages open at once, same minute; 1920x1080, vsync off, dynamic resolution off;
JS ms median / draw calls / visible skinned meshes; contended machine, `docs/perf2/paired-3way-step2.json`):

| tier | site | long-night-2 (before) | perf2 (after) | baseline build, same minute (JS ms) |
|---|---|---|---|---|
| high | gcpd roof | 18.2 / 540 / 109 | 11.4 / 390 / 63 | 17.7 |
| high | docks | 11 / 212 / 62 | 6.3 / 145 / 62 | 12.1 |
| high | neon street | 12 / 343 / 69 | 7.5 / 247 / 59 | 7.6 |
| high | ace chemicals | 51.6 / 390 / 87 | 20 / 319 / 77 | 16.2 |
| high | clock plaza | 107.7 / 456 / 62 | 198.9 / 390 / 76 | 257.1 |
| high | loop el | 36.9 / 401 / 131 | 26.7 / 297 / 129 | 11.7 |
| high | narrows | 29.3 / 555 / 85 | 13.3 / 486 / 80 | 41.2 |
| low | gcpd roof | 11.8 / 369 / 99 | 8.2 / 252 / 63 | 18.5 |
| low | docks | 7.5 / 183 / 59 | 7.3 / 128 / 59 | 5.6 |
| low | neon street | 8.3 / 269 / 60 | 7.3 / 193 / 63 | 7.4 |
| low | ace chemicals | 9.2 / 258 / 59 | 7.9 / 188 / 59 | 7.1 |
| low | clock plaza | 10.6 / 273 / 59 | 9.2 / 203 / 59 | 7 |
| low | loop el | 10.6 / 273 / 99 | 10.4 / 201 / 94 | 6 |
| low | narrows | 9.9 / 350 / 64 | 9.3 / 281 / 64 | 14.3 |
| potato | gcpd roof | 203 / 307 / 98 | 7.6 / 197 / 59 | 860.4 |
| potato | docks | 14.5 / 177 / 59 | 5.8 / 102 / 59 | 21.6 |
| potato | neon street | 9.1 / 216 / 60 | 6.7 / 151 / 62 | 40.2 |
| potato | ace chemicals | 9.4 / 244 / 59 | 51.5 / 174 / 59 | 50.6 |
| potato | clock plaza | 8.9 / 223 / 59 | 45.3 / 151 / 59 | 61.7 |
| potato | loop el | 6.1 / 230 / 75 | 4.7 / 169 / 77 | 14.2 |
| potato | narrows | 23.8 / 256 / 59 | 8.9 / 190 / 60 | 38.8 |


## 5. After

Final paired A/B, `long-night-2` vs this branch (aa60c84), both pages open at once,
1920x1080, vsync off, dynamic resolution off, the machine moderately loaded by other agents at the
time (frame times sane, GPU 15-60 %). `docs/perf2/paired-final.json`. The Narrows "before" High row
caught a load burst (43 ms); read it as an outlier.

| tier | site | before: fps / JS ms / draws / skinned | after: fps / JS ms / draws / skinned | JS after/before |
|---|---|---|---|---|
| high | gcpd roof | 82 / 11.5 / 534 / 103 | 114 / 8.1 / 375 / 64 | x0.70 |
| high | docks | 116 / 7.6 / 218 / 62 | 147 / 5.9 / 145 / 62 | x0.78 |
| high | neon street | 85 / 10.9 / 341 / 66 | 111 / 8 / 247 / 59 | x0.73 |
| high | ace chemicals | 85 / 10.8 / 394 / 80 | 105 / 8.6 / 277 / 87 | x0.80 |
| high | clock plaza | 77 / 12.4 / 448 / 62 | 90 / 10.4 / 356 / 69 | x0.84 |
| high | loop el | 73 / 13.4 / 408 / 135 | 98 / 9.5 / 274 / 129 | x0.71 |
| high | narrows | 23 / 45.6 / 565 / 82 | 114 / 8.5 / 410 / 80 | x0.19 |
| low | gcpd roof | 108 / 8.7 / 366 / 98 | 133 / 6.6 / 245 / 61 | x0.76 |
| low | docks | 120 / 7.5 / 189 / 59 | 149 / 5.8 / 124 / 59 | x0.77 |
| low | neon street | 122 / 7.6 / 267 / 59 | 145 / 6.3 / 192 / 60 | x0.83 |
| low | ace chemicals | 106 / 8.7 / 254 / 59 | 123 / 7.4 / 179 / 59 | x0.85 |
| low | clock plaza | 135 / 6.9 / 269 / 59 | 152 / 6.1 / 197 / 59 | x0.88 |
| low | loop el | 139 / 6.7 / 273 / 98 | 147 / 6.2 / 199 / 98 | x0.93 |
| low | narrows | 130 / 7.3 / 354 / 72 | 137 / 6.8 / 266 / 70 | x0.93 |
| potato | gcpd roof | 110 / 8.5 / 309 / 99 | 145 / 6 / 185 / 60 | x0.71 |
| potato | docks | 161 / 5.4 / 171 / 59 | 185 / 4.6 / 108 / 59 | x0.85 |
| potato | neon street | 119 / 7.5 / 222 / 62 | 128 / 7.1 / 159 / 62 | x0.95 |
| potato | ace chemicals | 132 / 7.1 / 246 / 59 | 154 / 6 / 174 / 59 | x0.85 |
| potato | clock plaza | 152 / 6.1 / 214 / 59 | 175 / 5.3 / 148 / 59 | x0.87 |
| potato | loop el | 132 / 7.2 / 242 / 76 | 152 / 6.2 / 166 / 77 | x0.86 |
| potato | narrows | 179 / 5.2 / 261 / 65 | 185 / 4.9 / 191 / 64 | x0.94 |

Summary: JS per frame down 16-30 % on High at every site (x0.70-0.84), 7-24 % on Low, 5-29 % on
Potato; draw calls down 25-40 % everywhere; visible skinned meshes down by 40 at the GCPD roof.
The GPU was never the limit at 1080p on this machine.

`scripts/perf.mjs` (the owner's measurement: one page per site, 3 s, uncapped), run twice per
build interleaved (baseline 5fe2c7f, long-night-2, this branch), 14:23-14:44, GPU 29-97 % busy
with other agents' work; best of the two runs (the less disturbed one), fps. `docs/perf2/perf-mjs-3way.log`.
The coordinator's "quiet window" had closed before these could run (the first attempt at 13:36
read 196/240/218/153/40 fps for the baseline at High with the GPU going from 0 to 60 %): **these
were not taken on a lightly loaded GPU**, and single 3-second samples swing 2-30x here.

| perf.mjs, best of 2 | gcpd roof | docks | neon street | ace chemicals | clock plaza |
|---|---|---|---|---|---|
| High: baseline build today | 107 | 150 | 200 | 128 | 229 |
| High: long-night-2 | 89 | 123 | 114 | 83 | 112 |
| High: this branch | 122 | 133 | 139 | 83 | 161 |
| Low: baseline build today | 146 | 212 | 194 | 159 | 395 |
| Low: long-night-2 | 103 | 131 | 129 | 106 | 145 |
| Low: this branch | 160 | 171 | 165 | 130 | 193 |
| recorded baseline (quiet machine), High / Low | 332 / 358 | 514 / 516 | 513 / 469 | 353 / 342 | 601 / 623 |

Against the brief's targets, on these numbers: High is at 65-114 % of the same-day baseline
(gcpd roof and the docks above 75 %, neon street, ace chemicals and the clock plaza below); Low is
above the baseline at the GCPD roof and below it elsewhere (49-110 %). So the targets are **not
met** at most sites, by this measure. The paired measurement in the table above (same moment, much
less noise) is the better guide to how far each build moved: this branch is 16-30 % less JS per
frame than long-night-2 on High.

**Split screen** (`?p2=bot`, High, sequential single-page runs a minute apart): GCPD roof 62 -> 85
fps (draws 889 -> 630), Neon Row 69 -> 99 fps (723 -> 558). Target >= 60 fps: met.

**Production build vs dev server** (`npm run build` served by `vite preview` vs `npm run dev`, same
commit, paired): JS per frame within +-5 % at three sites on High and Low (prod/dev x0.91-1.04,
`docs/perf2/dev-vs-prod.log`). The dev server and the dev-only tools cost no measurable frame time;
the owner's `npm run dev` numbers are representative.

**Hitches** (`scripts/hitch-tour.mjs`, ~100 s across the core, the Loop, the Narrows, the river and
the docks; before and after run at the same time): both builds logged ~900-1,500 frames over 25 ms
per pass with multi-second stalls on both sides, while the machine's CPU was at 100 % from other
agents' suites; the counts say nothing about the game. Not measured cleanly; see section 8.
Attributable improvements: the 25-250 ms civilian figure builds are gone from play (largest step
now one draped garment), and character/sign culling removes most of the per-frame cost of
newly-entered districts.

**Low-spec proxies** (`CPU=4`, `WEAK=swiftshader`, paired, potato/low): the runs were dominated by
multi-second stalls on one side or the other (CPU at 100 % from other agents); the CPU=4 run
timed out loading. Draw calls under SwiftShader went 222-375 -> 148-281 (the same structural
cut as above); frame times were not usable. Not measured cleanly; see section 8.

## 6. Keeping it fixed: the perf gate

`scripts/perf-gate.mjs` checks structural budgets that do not depend on how fast or how busy the
GPU is: at the seven fixed cameras on potato, low and high it reads from `?prof=1` the draw calls
per frame (all passes), triangles, visible skinned meshes, lit point lights, objects the matrix walk
visits and shader programs (fail above the budget x1.15), and JS ms for game, world, render and the
whole frame with the page's CPU throttled 2x (fail above the budget x2.5: generous on purpose, it is
there to catch a system that suddenly costs several times more, not 10 %).

```
npx vite --port 5820 --strictPort                      # any free port
BASE=http://localhost:5820/ node scripts/perf-gate.mjs     # exit 1 on a breach, lists each one
UPDATE=1 BASE=http://localhost:5820/ node scripts/perf-gate.mjs   # re-record after an intended change
```

The budget lives in `docs/perf2/perf-budget.json`. Unit tests cover the pieces that can be tested
without a GPU: `tests/unit/skinCull.test.js` (character culling spheres, hidden meshes untouched,
opt-out), `tests/unit/interiors.test.js` (the lobby is not drawn from the roof),
`tests/unit/tierDetect.test.js` (auto never picks Ultra).

## 7. Visual changes

Every fix is meant to be invisible; the comic look and every tier's settings are unchanged.
Before/after at the same camera: `docs/design/shots/perf2/` (GCPD roof with a fight, Neon Row,
the Narrows; `before` = long-night-2, `after` = this branch). They match apart from the moving
rain and civilians.

| change | what a player could notice |
|---|---|
| characters, static hulls frustum-cull | nothing (conservative spheres; no part pops at the screen edge in the shots or the tour) |
| far dynamic shadow casters skipped | nothing (they were outside the dynamic map) |
| lobby goons hidden from above 12 m | nothing (they are under a ceiling and 35 m of tower) |
| Riddler marks past 110 m | a 1 m mark stops drawing past 110 m (a few pixels, 50 %+ fog on High); detective vision still shows it through walls at any range |
| loose sign planes past lodDistance | signs on buildings stop past the chunk LOD distance (240 m High, 160 m Low), where the buildings themselves are already the signless far-LOD silhouette; their halos (the glow) still show |
| auto tier stops at High | a fast GPU on first boot gets High instead of Ultra; Ultra is still in Settings > Video |
| crowd templates on the title | the first figures appear as full figures sooner; nothing else |

## 8. Not fixed, and what next

- **Per-draw CPU cost is the floor now.** At ~10-20 µs per draw call (three.js re-uploading each
  material's uniforms on every material switch), 150-500 draws is 3-8 ms of a frame on this CPU and
  three to four times that on a weak laptop CPU. The biggest remaining group is the city's near
  chunks: one mesh per material per 128 m chunk (18 near chunks x ~13 materials at the GCPD roof),
  plus many small unmerged props and their hulls (side content, story props). Next: merge near
  chunk meshes per material across 2x2 chunk blocks on potato/low (fewer, larger draws; the GPU has
  headroom), merge static prop groups at build time (vehicleModels.mergeStaticParts already does
  this for cars), and share one hull material per width/colour (149 distinct materials in one
  colour pass at the docks; addHullOutline makes a material per hull).
- **Dynamic resolution resizes every render target on each 5 % step** (~40 ms here, more on a weak
  machine): allocate targets once at full size and render into a viewport of them instead.
- **Static shadow map refresh while moving** (every 8 m on High, 12 m on Ultra) redraws the city's
  casters into a 2048/4096 map in one frame; amortise or widen the box on fast traversal.
- **The hero's cape** (verlet cloth, 0.4-1.3 ms) is the largest single gameplay cost; unchanged
  since the baseline, left as is (signature look).
- **Measurement.** Absolute frame rates, hitch counts and the low-spec proxies could not be measured
  cleanly in this session: the GPU was at 30-99 % and the CPU at up to 100 % from other agents, with
  multi-second stalls on both sides of every A/B. Re-run on a quiet machine:
  `BASE=... node scripts/perf.mjs`, `PAIRED=1 BASES=before=...,after=... Q=high,low,potato node
  scripts/perf-matrix.mjs`, `BASE=... node scripts/hitch-tour.mjs` (the target: no frame over
  25 ms on the second round) and the same with `CPU=4` / `WEAK=swiftshader`.

# Round 2 (perf3)

Branch `ln2/perf3`, code edits tagged `[perf3]`. Raw results in `docs/perf3/`.

## R2.1 Measuring on this laptop

What was learned the hard way, and what the round-2 tools do about it:

- **A single reading means nothing.** The same build read 2.5 ms/frame and 5.5 ms/frame minutes
  apart; under the owner's own use (the machine was shared with the owner and, at first, three
  other agents) one round of a page-against-page A/B swung 0.4x-2.4x. The CPU throttles and its
  clock changes from second to second.
- **Simultaneous pages are not the answer either.** Two pages measured at the same moment in two
  browsers had a steady 3-4 % bias for whichever sat in the second browser (A/A run,
  `aa-calib1.json`), and two pages in one browser share one GPU process. And the owner asked for
  one page at a time.
- **0.1 ms clocks.** `performance.now()` and rAF timestamps step in 0.1 ms here; at 2-4 ms frames a
  median is quantised by 3-5 %. Means of thousands of frames are not.

Tools (all measurement-only, none loads without its flag):

| tool | what it is for |
|---|---|
| `scripts/perf-ab.mjs <urlA> <urlB> --rounds N --pairs low:low,low:potato,high:high` | old vs new: one page open at a time, A then B then B then A (order flipped every round), seven fixed cameras, trimmed-mean frame and JS time, a CPU-speed calibration task timed in the same page and seconds (`normalised` ratios), per-site median ratio with min..max over rounds. `--fresh` repeats the owner's `scripts/perf.mjs` procedure (fresh load per site, 1.2 s, uncapped). `--cpu 4`, `--weak swiftshader`. |
| `scripts/perf-toggle.mjs <url> --features a,b` + `src/dev/perfToggles.js` | before/after of one optimisation **inside one page**: its runtime switch flips every 0.5 s for 20 s per site, so both states see the same machine. The only way to see effects under ~10 % here. |
| `scripts/perf-cpu.mjs <url> --q low --site docks [--fresh] [--cpu 4]` | CDP CPU profile as shares of busy time (self and inclusive) + sampled allocation per frame; the share does not depend on how fast the machine is that minute. |
| `scripts/perf-draws.mjs [--tris]`, `perf-glcalls.mjs`, `perf-objects.mjs`, `perf-sys.mjs` | draw/material/triangle inventory per object, WebGL calls per frame, scene-graph walk inventory, `?prof=1` per-system JS + counters. |
| `scripts/dynres-hitch.mjs` | cost of one dynamic-resolution step (`dynRes.forceScale`). |
| `scripts/hitch-tour.mjs` (extended) | now also long tasks (PerformanceObserver) and frames whose own JS took > 25 ms; `ROUTE=core` is a tour the old build can also do. |
| `scripts/lowprio.sh` | runs any of the above at BelowNormal priority (the browser inherits it). |

**Procedure.** Serve the frozen builds (old: worktree `gotham-ln2-baseline` at 5fe2c7f on :5201;
a frozen `long-night-2` in its own worktree; the branch under test); then
`sh scripts/lowprio.sh node scripts/perf-ab.mjs http://localhost:5201/ http://localhost:5850/ --rounds 3 --pairs low:low,low:potato,high:high --labels old,new`.
Never edit the served tree while it runs (vite reloads the page). Read the raw frame ratio and
its spread first; the normalised one corrects some but not all clock swings (it over-corrected
one round by 2x), so it is reported second. For one optimisation, use `perf-toggle.mjs`.
The pre-overhaul build has no Potato tier (it falls back to High): Potato is compared with its Low.

## R2.2 Ranked costs on the current head (before the round-2 fixes)

CPU profile shares, Low, steady state (`cpu-low-gcpd.json`, `cpu-old-low-docks.json`,
`cpu-fix-low-docks.json`); the game is CPU-bound (frame = JS + ~0.5 ms).

| # | cost | share of a Low frame | note |
|---|---|---|---|
| 1 | three.js draw submission (`renderBufferDirect`: program/uniform/VAO setup), 130-260 draws | 25-31 % | 87 program switches for 257 draws at the roof |
| 2 | **crowd figure templates built in play** (`prepareFigure`, drape, kit geometry) | **22 % for the first 15-30 s after a `?at=` load**, 4 % after a tour | the whole fresh-load gap to the old build |
| 3 | the hero's cape cloth (`stepCloth`, `Math.hypot`) | 11-13 % (4 sub-steps a frame at 4x throttle) | |
| 4 | scene walks: matrix update (`updateMatrices`) + three's `projectObject` | 17-19 % | 2,646 objects visited at the roof, ~1,500 of them hidden chunk meshes |
| 5 | `world.update` (env, halos, steam, light pool, shadows) | 6-9 % | spread over many small parts |
| 6 | everything else in `game.update` (hero, animators, vehicles, El, traffic, nav, flow, side content, wanted 0.03-0.16 ms, sandbox 0.03 ms) | ~10 % | no single item over 0.2 ms unthrottled |
| 7 | GC | 1-2.5 % | 3-4 KB allocated per frame (sampled); not a problem |
| 8 | dynamic-resolution step | a 4-36 ms frame per step | target reallocation |

The new systems the brief asked about: wanted 0.03-0.16 ms, sandbox 0.03-0.04 ms, abilities and
HUD director below 0.02 ms, HUD 0.03-0.04 ms with 2-3 DOM mutations a frame, radio 0.05-0.14 ms,
nav/minimap 0.03-0.15 ms (0.4-0.5 ms at 4-6x throttle). None is a lever.

## R2.3 Fixes, each with its before -> after

In-page numbers are `scripts/perf-toggle.mjs` (the switch flipped every 0.5 s for 16-20 s per site,
three sites: GCPD roof, Neon Row, clock plaza; JS per frame, geometric mean, both halves of each
run agree to +-3 %). `docs/perf3/toggle-*.log`.

| # | fix | where | before -> after |
|---|---|---|---|
| 1 | **Chunk groups**: each 128 m chunk's near meshes hang under one group shown/hidden as a whole and parked while hidden, so the matrix walk and three's scene walk skip a hidden chunk with one check | `world/chunks.js groupNear`, `cityBuilder.js groupChunkMembers` | objects walked at the roof 2,646 -> 1,962; in-page **JS x0.943** on Low |
| 2 | **Cape cloth**: `Math.sqrt` instead of `Math.hypot` in the constraint loop | `actors/verlet.js` | one step 0.30 -> 0.13 ms (node); in-page **JS x0.963** on Low |
| 1+2 | together | | in-page **JS x0.904 on Low, x0.940 on High** (`toggle-low-all3.log`, `toggle-each.log`) |
| 3 | **Cape sub-steps capped** at 2 per frame on potato/low (`quality.clothSteps`); at slow frames it ran 4 | `actors/cape.js setCapeQuality` | at 4x CPU throttle the cape was 11 % of a 45 ms frame; now half that. No change at >= 60 fps |
| 4 | **Crowd template builder capped at 8 % of wall time** (token bucket over the idle callbacks) | `civilians/crowd.js` | it took 22 % of the CPU for the first 15-30 s after a load that skips the title (`cpu`, fresh: `crowd.js` 1.16 of 5.3 ms/frame); that was the whole first-seconds gap in the owner's `perf.mjs` procedure. Templates warmed on the title screen are unaffected |
| 5 | **Dynamic resolution renders into a sub-rect** of its targets instead of reallocating them (the ink pass reads through `sColor/sDepth/sNormal`, clamped like CLAMP_TO_EDGE: identical at scale 1) | `render/inkPipeline.js fitView` | longest frame after a step, Low at Neon Row: 7.1-36.2 ms (median frame 5.3) -> 7.0-10.9 ms (5.5); High 11-17 ms (10.2) -> 8-15 ms (6.9). The canvas itself still resizes (the remaining ~3 ms) |
| 6 | **Bruce pockets parked** while no player is within 160 m (the dressed Manor, gala and cave stayed in the scene walk for the rest of the session once built) | `bruce/pockets.js`, `bruce/runtime.js` | structural (thousands of objects off the walk after a visit) |
| 7 | **First-boot auto quality never reloads** (R2.6) | `render/tierDetect.js`, `game.js`, `ui/gpuInfo.js showTierAdvice` | no reload; decision on the faster of two readings |
| 8 | **Adaptive detail governor** (R2.6) | `render/detailGovernor.js`, `world/trafficSim.js setLimit`, `civilians/pedSim.js setLimitScale` | acts only past the dynamic-resolution floor |
| - | tried and reverted: opaque list sorted by program first | | 87 -> 76 program switches, in-page x1.011: no win |
| - | tried and reverted: 256 m chunks on potato/low | | draws -14 % at the roof but triangles +12-24 % and +4 draws at the docks: not a clear win for a GPU-weak machine |

## R2.4 Final paired table, old build vs this branch

`docs/perf3/final-old-vs-new.json`: steady state (after a tour of the seven cameras), 1920x1080,
uncapped, dynamic resolution off, 3 rounds, one page at a time, order flipped each round, at
BelowNormal priority while the owner used the machine. Ratio = new frame time / old frame time,
median of 3 rounds [min..max]; below 1 the new build is faster. Old Low is the reference for
Potato (the old build has no Potato). The old build has nothing at the Loop and the Narrows (they
are the new city), so those two rows compare different content.

| site | Low vs old Low | Potato vs old Low | High vs old High |
|---|---|---|---|
| gcpd roof | x0.96 [0.72..0.99] | x0.67 [0.64..0.75] | x1.14 [1.09..1.25] |
| docks | x1.07 [0.85..1.35] | x0.69 [0.65..1.19] | x1.29 [1.23..1.37] |
| neon street | x1.10 [0.98..1.13] | x0.77 [0.67..0.85] | x1.25 [1.25..1.26] |
| ace chemicals | x1.02 [0.93..1.18] | x0.91 [0.82..1.20] | x1.29 [1.20..1.31] |
| clock plaza | x1.07 [0.93..1.15] | x0.76 [0.72..0.87] | x1.48 [1.35..1.62] |
| loop el (new content) | x1.39 | x1.02 | x1.79 |
| narrows (new content) | x0.90 | x0.64 | x1.16 |

In fps terms: **Potato is 10-50 % faster than the old Low** at the five original sites; **Low is
93-104 % of the old Low** (parity within the noise at the roof and Ace Chemicals, 3-10 % short
at the docks, Neon Row and the clock plaza); **High is 68-88 % of the old High** (the target 85 %
is met at the GCPD roof only). Potato vs Low in the same build (`ab-low-vs-potato.log`): Potato
x0.78 frame time overall (x0.63-0.98 by site). The `--fresh` (owner's `perf.mjs`) procedure before
the fixes read Low x1.17 JS (x1.22 frame) against the old Low; most of that was fix 4.

At 4x CPU throttle (`ab-cpu4-old-vs-new.log`, 2 rounds, before fix 3): Low x0.89/1.13/1.26 JS at
roof/Neon Row/clock plaza vs the old Low, Potato x0.77/0.83/0.97.

## R2.5 Hitches

`scripts/hitch-tour.mjs` on Low, 1600x900, uncapped, two passes on one page, old and new run one
after the other at low priority (`docs/perf3/hitch.log`, `hitch-*.json`). `ROUTE=core` is a 64 s
drive/glide tour of the original city that the old build can also do.

| tour | pass | frames > 25 ms | frames whose JS > 25 ms | long tasks (> 50 ms) | max frame |
|---|---|---|---|---|---|
| core, old build | 1 / 2 | 5 / 1 | 1 / 1 | 2 (102, 51 ms) / 1 (51) | 93.7 / 48.6 ms |
| core, this branch | 1 / 2 | 2 / **0** | 2 / **0** | 1 (55 ms) / **0** | 50.7 / **16.2 ms** |
| full (core, Loop, Narrows, river, docks; 100 s), this branch | 1 / 2 | 4 / **0** | 3 / **0** | 0 / 0 | 43.3 / **22.4 ms** |

So no frame over 25 ms on the second pass of either tour, and the first pass (things seen for the
first time) is no worse than the old build's. The first-pass hitches are at the start of the run
(0, -17 .. -79: the first street crossings after the load) and one at the Loop boundary.
Dynamic-resolution steps: fix 5. Not measured this round: fight/chase/boss starts and Bruce's
pockets (they build on entering, behind the existing transition).

## R2.7 Low-spec evidence

- **The integrated GPU cannot be used for a test on this laptop.** Windows lists the Intel UHD
  Graphics with status "Unknown" (not present): the MSI Raider is in discrete-only (MUX) mode, so
  no browser flag, `--gpu-vendor-id` or `UserGpuPreferences` entry can reach it. Switching the
  laptop to MSHybrid is a firmware GPU-mode switch, which on this machine breaks the Windows Hello
  PIN and passkeys on the next boot; it was not done. Nothing was set in the registry.
- **SwiftShader (software GPU), whole-frame time with the GPU forced to finish** (`scripts/pipeline-sync.mjs`,
  the first-boot benchmark's method; rAF frame times are meaningless under SwiftShader because the
  page keeps running while the software GPU falls behind). 1280x720, two rounds, order flipped,
  `docs/perf3/swiftshader-sync.log`:

  | camera | old Low | new Low | new Potato |
  |---|---|---|---|
  | GCPD roof | 380-471 ms | 198-264 ms (x0.52-0.58) | 163-165 ms (x0.35-0.43) |
  | Neon Row | 264-335 ms | 152-207 ms (x0.57-0.65) | 146-147 ms (x0.44-0.56) |

  On a GPU-starved machine the new Low and Potato cost about half and a third of the old Low per
  frame: the render tiers (depth-derived ink creases instead of a normal pass, an 8-bit colour
  target, no shadow maps, fog-matched draw distance) cut the pixel and vertex work that dominates
  there. This is a stress proxy, not a real integrated GPU (SwiftShader has no tile cache, no
  fixed-function hardware and shares the CPU with the game).
- **CPU throttled** (CDP; JS-time per system on Low at Neon Row under a 4x or 6x throttle; the log kept one of the two runs and not which: render 15.5 ms,
  game 6.2 of which cape 1.7 and hero 0.9, world 1.9, nav 0.5, traffic 0.4, civilians 0.3,
  wanted 0.16, sandbox 0.03 ms; step 21.6 ms). Old vs new at 4x (before the cape sub-step cap):
  Low JS x0.89-1.26 of the old Low, Potato x0.77-0.97 (`ab-cpu4-old-vs-new.log`).
- **What a player on a 2018-class integrated laptop should expect on Potato** (a 4-core 15 W CPU,
  UHD 620 / Vega 8, roughly 3-5x slower single-thread than this i9 under load and a GPU in the
  SwiftShader-to-iGPU range): the CPU side of a Potato frame here is 2.6-4.3 ms, so 9-20 ms on that
  CPU; the GPU side at 1080p is of the order of a 2018 iGPU running a light deferred-style pass
  (a full-screen ink pass plus ~250k triangles). Expect **30-45 fps at 1080p on Potato in the core
  city, 45-60 fps with Render scale at 75 %** (dynamic resolution does this on its own, down to 50 %),
  and the adaptive detail governor trimming crowd/traffic budgets if the CPU is the limit. Limits
  of this estimate: no real iGPU was measured; the CPU factor comes from CDP throttling, which
  scales main-thread JS but not the GPU process or the driver.

## R2.6 Auto quality

- **No reload, ever.** `settleAutoTier` (src/render/tierDetect.js) times the real pipeline once at
  boot (10 batches, median) and `game.js` takes a second reading 4 s later if the player is still
  on the title screen; the faster of the two decides (load only makes frames slower, so the faster
  reading is the truer one: a throttled first second no longer pushes the tier down). The
  decision is stored for the next launch; the session keeps the tier it booted with. When it
  differs, the title shows a note ("Video quality X suits this machine better ... Restart now /
  Later", `showTierAdvice` in src/ui/gpuInfo.js); nothing reloads unless the player clicks, and
  the note goes away when play starts. Auto still never picks Ultra. Unit test in
  tests/unit/tierDetect.test.js.
- **Adaptive detail governor** (src/render/detailGovernor.js): when dynamic resolution is already
  at its floor and more than 10 % of frames still miss the display refresh for two 2-second
  windows, it steps one level (of three) down: crowd hull and full-rate-animation distances x0.8 /
  0.65 / 0.5, traffic and pedestrian spawn caps x0.85 / 0.7 / 0.55 (soft caps: nothing on screen
  is removed, fewer new ones spawn out of sight). After 20 s with under 1 % late frames it climbs
  one level back. Off under automation unless `?gov=1`; `?gov=0` turns it off. Unit tests in
  tests/unit/detailGovernor.test.js.
- Dynamic resolution steps no longer reallocate (fix 5), so stepping is cheap on a weak machine.

## R2.8 Visual changes

| change | what a player could notice |
|---|---|
| chunk groups, cloth sqrt, crowd builder cap, pocket parking | nothing in a frame (same objects drawn). With the builder capped, a session that starts straight in play (skipping the title) fills its crowd with distinct full figures over ~15-30 s instead of ~5 s; until then the nearest people are the ones already built (impostors further out as before). From the title screen, nothing |
| cape sub-steps capped at 2 on potato/low | at frame rates under 60 fps the cape swings a little more loosely (longer sub-steps); at 60 fps and up, nothing (`docs/design/shots/perf3/cape-low-cpu6.png`, 20 fps) |
| dynamic resolution sub-rect | nothing at full scale (identical shader result); while scaled down, the same picture as before (`docs/design/shots/perf3/dynres-subrect-high-*.png`: the differences are the HUD act card and animation, not the render) |
| auto quality | a title-screen note instead of a reload |
| adaptive detail | only on a machine past the resolution floor: distant figures lose their ink line and animate at a lower rate a few metres sooner, and streets fill a little less densely over time |

## R2.10 What remains, and why

- **High is 68-88 % of the old High**, worst at the clock plaza (x1.48 frame time) and the docks.
  High pays for the light pool (6 point lights in every lit shader's uniforms), the per-frame
  dynamic shadow map, MRT normals and 160-400 draws; the polish merge (Wayne Tower crown on the
  far skyline, dressed interiors) landed while this was measured. Next: per-chunk static prop
  merging and a BatchedMesh for the repeated street furniture (the biggest remaining draw groups
  are city chunk materials, 'painted' alone 21-32 draws), and the far scene's separate render call.
- **Low is at parity within the noise at two of five sites and 3-10 % short at three.** The
  remaining CPU is spread: draw submission ~25 %, scene walks ~15 %, world update ~7 %, the rest
  many small systems. No single lever left over 5 %.
- **Hitches**: the canvas still resizes on a dynamic-resolution step (~3 ms here).
- The perf probe's `render.matrices` scope wraps `scene.updateMatrixWorld`, which makes the ink
  pipeline take the unoptimised walk while `?prof=1` is on: read matrix costs from CPU profiles.

## R2.9 Keeping it fixed

- `scripts/perf-gate.mjs` now reads `docs/perf3/perf-budget.json` (round 2; `docs/perf2/` stays as
  the round-1 record), also budgets the JS of the cape, the crowd, the wanted system and the
  sandbox, and gives triangles x1.3 room (they follow how many crowd figures and cars happen to be
  in view: +-15 % between two runs of one build). The probe's `matrixWalk` now counts a parked
  hidden subtree once, as the ink pipeline walks it.
- **The polish merge's gate failures** (14 on long-night-2 at 292a1a1 against the round-1 budget,
  `docs/perf3/gate-ln2-polish.log`, including the two old "loop el" ones): every `matrixWalk`
  failure was the counter, not the game. The count rose by ~165 at every camera of a run
  (4,074 -> 4,899 on Potato over seven cameras) because crowd figures are built over time and
  parked hidden, and the round-1 probe counted the children of a parked figure though the walk
  skips them; the polish characters (face pivots) made each figure a few objects bigger, which
  pushed more sites over. With the fixed counter and the chunk groups the same run reads
  2,027-2,278, flat across the run. The Potato Neon Row triangle failure is crowd/traffic
  variance: a draw-by-draw triangle inventory at that camera (`perf-draws.mjs --tris`) is 229,954
  before the polish merge and 231,222 after. The polish content itself (dressed pockets, Wayne
  Tower crown) is budgeted; the pockets are now parked whenever no player is near them (fix 6).
- Unit tests: `detailGovernor.test.js`, `tierDetect.test.js` (no reload, faster reading decides),
  `worldChunks.test.js` (chunk groups toggle as one).
- Procedure for the next change: `sh scripts/lowprio.sh node scripts/perf-toggle.mjs <url> --features <switch>`
  for an optimisation you can switch at run time; `perf-ab.mjs` (3+ rounds) against a frozen
  build otherwise; `perf-gate.mjs` before merging.
