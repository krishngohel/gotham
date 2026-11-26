# World framework (Long Night 2, workstream C)

How the city is put together after wave 1, and how workstream H adds the remaining districts.
Read `long-night-2.md` sections 4.2 and 8 first (contract and scale rule), then this.

Everything here is measured or tested; where something is not done yet it says so (section 9).

## 1. The shape of it

```
src/world/regions/
  data.js        REGION_DATA: bounds, districts (names, palettes, tints), water, floor, sites,
                 spawn tables. Pure: saves, crimes, the palette and the progress page read it.
  index.js       REGIONS = data + build(ctx) + killY; regionAt, killYAt; re-exports data.js
  assemble.js    assembleCity(): builds every region into one scene/collision (game + tests)
  streets.js     each region's streets for the shared street graph, traffic loops, layout numbers
  walls.js       invisible edge walls around the union of the regions' land
  riverfront.js  the proof region builders (river, Lower Gotham, first Loop row, El stretch)
  bascules.js    working bascule bridges (schedule, gates, collision swap)
src/world/chunks.js        chunk set: near / LOD / detail culling
src/world/buckets.js       geometry grouped per material per chunk, indexed
src/world/lod.js           far-LOD silhouettes per chunk
src/world/staticBatches.js ink lines and sign planes folded into chunk batches; light spot index
src/world/halos.js         glow sprites, per 512 m cell after freeze(), partial uploads
src/world/collision.js     dense grid collision (scales past 65,536 boxes)
src/world/streetGraph.js   the street graph (pure)
```

`src/game/world.js` calls `assembleCity` and exposes, besides what it always did:

```
world.regions            REGIONS
world.bounds             WORLD_BOUNDS (union of all regions; waterZ 205 kept)
world.regionAt(x, z)     region or null
world.districtAt(x, z)   district id (core answers exactly as mapData.districtAt did)
world.streetGraph        the street graph (section 6)
world.visibleChunks      chunks drawn this frame: { key, cx, cz, region, state, distance }
world.chunks             the chunk set (stats(), chunks Map)
world.bridges            { list, isDown(id), hold(id, 'up'|'down'|null), update(t) }
world.traffic            region traffic loops (cars, polylines)
world.belowWater(p)      true when p is under the water line of its region (see section 9.1)
world.lightSpots         every light spot (the pool sees only the ones near the player)
```

Assembly order is the `REGIONS` order. **The core is first, on the seed-11 rng that world.js
keeps drawing from afterwards** (horizon, traffic). Every other region gets `createRng(seed)`
of its own and never touches that rng. That is what keeps the core byte-for-byte:
`tests/unit/coreWorldFrozen.test.js` (built with every region present) freezes the core's
collision boxes, grapple points, ladders and zip lines; `coreCityFrozen.test.js` freezes map data.

## 2. Adding a region (H's recipe)

1. **Data** (`regions/data.js`): append to `REGION_DATA`:
   ```js
   { id: 'mile', name: 'Gotham Mile', seed: 105,              // unique seed
     bounds: { minX: -40, maxX: 236, minZ: -780, maxZ: -600 },// must not overlap another region
     districts: [{ id: 'mile', label: 'Gotham Mile', phrase: 'on Gotham Mile', tint: '#d8c49a',
       palette: { key: 'mile', center: { x: 150, z: -690 }, swatches: [ink, main, second, mid, accent, paper] } }],
     districtAt: (x, z) => 'mile',                            // or split the region into several
     water: [],                                                // { id, kind: 'river'|'lake', minX..maxZ, level }
     floor: () => 0,                                           // -Infinity where only boxes are ground
     sites: { pumpingTower: { x: 150, y: 0, z: -700 } },
     spawnTables: { crimes: [{ id, district, x, y, z, yaw }], civilians: {...}, traffic: {...} } }
   ```
   District ids are saved; once shipped, never rename one. Append, never reorder (the core's
   five stay first). Palette swatches follow the existing order (darkest, main, second, mid,
   accent, paper-light); `center` drives the camera-blended palette.
2. **Builder**: a file in `regions/`, exporting `buildX(ctx)`. Register it in `index.js`
   `BUILDERS[id]` and give it a `KILL_Y` entry if anything walkable is below y -0.8.
3. **Streets**: an `addXStreets(g)` in `streets.js`, called from `buildStreetGraph()`. Continue
   the core's 60 m lines (`CORE_LINES`) north and the existing z phase; join at shared nodes
   (nodes on the same deck within 0.5 m merge). Traffic needs nothing more: since the city-north
   pass, `cityLife` drives the street fleet over every drivable graph edge (`src/world/trafficSim.js`;
   the `*_TRAFFIC` loop lists are no longer read). Give a street `lanes: 0` (or `deck: 'walk'`) to
   keep cars off it; junctions get signals (or give way in regions listed in `GIVE_WAY_REGIONS`).
4. **Tests**: add walk tests like `tests/unit/riverfront.test.js` for every route a body must
   take; add the region's crime spots to the `regions.test.js` district check (automatic); run
   `scripts/world-shots.mjs` and add shots of the new district (section 8).

## 3. The builder `ctx`

`createCityContext(scene, rng, collision, { shared, region })` gives every region a ctx that
shares the world's lists and has its own rng, buckets and bookkeeping:

| field | shared? | use |
|---|---|---|
| `rng` | own | the region's seeded rng; draw everything random from it |
| `scene`, `collision` | shared | add meshes / boxes (`collision.addBox(minX, minY, minZ, maxX, maxY, maxZ, tag)`) |
| `materials` | shared | the city's toon materials (below); do not create new ones without need |
| `buckets` | own | `ctx.buckets.add(key, worldSpaceGeometry, colorHex?)` merges into chunk meshes |
| `halos` | shared | `halos.add(x, y, z, color, size)` → index; `set`, `setSize` (cheap, partial upload) |
| `grapple` | shared | push `{ x, y, z, nx, nz, perch? }`: y is the surface you land on, n points out |
| `lights` | shared | `lightSpot(ctx, x, y, z, color, intensity, distance)`: where the pool may park a real light |
| `climbables` | shared | `addLadder(ctx.climbables, { x, z, nx, nz, bottom, top })`; `addZipline` |
| `blinkers`, `flickers`, `updaters` | shared | blinking halos `{ i, size, phase }`; per-frame `(t) => {}` (no allocation) |
| `roofs`, `steam`, `reflect` | shared | roof records, steam sources, wet-street light streaks |
| `chunks` | shared | the chunk set (register dynamic objects: `chunks.addDetail(obj, box, 'draw'|'lod')`) |
| `world` | shared | cross-region services: `world.bridges`, `world.covers` (no-rain volumes) |
| `facades` | own | far-LOD source boxes; `facade()` (via `building()`) records them, or push your own |
| `region`, `quality` | | region id; the quality object (`quality.name`, `drawDistance`, ...) |

Helpers (all world-space; `src/world/cityBuilder.js` unless noted):

- `building(ctx, b)`: a full building from a record like mapData's
  `{ id, x, z, w, d, h, style, roof: 'flat'|'sawtooth'|'pitched', parapet, cornice, storefront,
  tiers: [{ w, d, h, spire }], props: 'auto'|'industrial'|'none', neon: [...], billboard,
  fireEscape: 'n'|'s'|'e'|'w', district }`. Facades, collision, edge grapple points, roof props,
  deco crowns, fire-escape ladders, neon signs, all from `ctx.rng`.
- `solid(ctx, key, geo, { color, collide, tag })`, `glow(ctx, geo, color)`, `lightSpot(...)`,
  `edgeGrapples(ctx, x, z, w, d, y, step)`, `streetLamp(ctx, x, z, nx, nz)`, `parkedCar`,
  `parapet`, `ring`, `waterTower`, `acUnit`, `vent`, `duct`, `graffiti`.
- `streetDressing.js`: `hydrant`, `newsBoxes`, `trashBags`, `trashCan`, `mailbox`, `bench`,
  `phoneBooth`, `trafficLight` (returns ids for an updater, see `buildLoopRow`), `streetTree`,
  `manhole`, `puddle`. These stand at street level (y 0.15 base).
- `gargoyles.js`: `addGargoyle(ctx, x, y, z, yaw)` (a perch), `plinth`.
- `buckets.js`: `box`, `tiledBox(w, h, d, x, y, z, { uvScale, faces })`, `cylinder`, `prism`.
- `riverfront.js` shows the patterns for anything off street level: `slab()` (a solid tiled
  box), `railing()` (1.1 m, collides), `lampAt()` (a lamp at any height), `ramp()` (a sloped road
  that collides as 0.1 m steps), `balustrade`, `obeliskLamp`, `corncobs()` (round towers whose
  floors collide as a square plus a cross inscribed in the circle).

Materials (`materials.js`): `facade_<style>` (brick, stone, deco, concrete, warehouse, factory,
steel), `storefront`, `trim`, `roof`, `asphalt`, `sidewalk`, `yard`, `concrete`, `steel`, `rust`,
`wood`, `glass`, `painted` (vertex colour), `glow` (unlit vertex colour), `lane`, `pool`
(additive light decal), `puddle`, `cone` (lamp shaft), `chem`. Flat-colour ones (`trim`,
`steel`, `rust`, `chem`) are folded into `painted`/`glow` automatically (one draw fewer per
chunk; identical shading). A new look is usually `painted` with a colour, not a new material.
Every new material is a new draw per chunk and, if it is a new type, a shader compile.

## 4. Chunks, LOD and culling

- Every bucketed mesh belongs to a **128 m chunk** (`CHUNK_SIZE`), by the centre of each added
  piece. `painted` groups finer (64 m sub-chunks) for tight frustum culling of the heaviest
  geometry. **Detail** materials (`asphalt`, `sidewalk`, `yard`, `concrete`, `glow`, `lane`,
  `pool`, `puddle`, `cone`, `chem`) group in **512 m cells offset by 256 m** (the whole old city
  is one cell) and cull on their own box at the draw distance.
- `chunks.cull(camera, drawDistance, lodDistance)` each frame (world.js; allocation-free):
  near meshes within `quality.lodDistance ?? 160` m (3D distance to the chunk box, 6 m
  hysteresis), the chunk's **far-LOD silhouette** out to `quality.drawDistance ?? 320` m,
  nothing past it. three.js frustum-culls each mesh on its tight bounding sphere.
- **Far LOD** (`lod.js`): one merged mesh per chunk of plain boxes (no bottoms) from every facade
  `building()` made (tinted with the style's wall colour, windows lit from one shared texture on
  the real 3.4 m floor pitch), plus tall collision boxes the facades do not cover (spires,
  stacks, pitched roofs). One material for every chunk of every region. Custom shapes that do not
  go through `facade()` should push a box to `ctx.facades` (see `corncobs()`).
- **Lines and signs** (`staticBatches.js`): any static `Line`/`LineSegments` a region adds to the
  scene is folded into one `LineSegments` per chunk and colour (culled at the LOD distance);
  textured sign planes (neon, graffiti, posters) sharing every material setting but the texture
  are packed into an atlas and merged per chunk. Flickering signs stay separate.
- **Halos** split per 512 m cell at `finishWorld`; only touched ranges upload.
- **Dynamic objects** (bridge leaves, gates, anything that moves): give them
  `userData.dynamic = true` (so the matrix freeze skips them) and register them with
  `ctx.chunks.addDetail(obj, box)` so they cull with the rest.

**Budgets per 128 m chunk** (measured by `tests/unit/chunkBudget.test.js`, which prints the
table): the core's busiest chunks are 12 to 14 near draws and 30 to 37k triangles; the proof
region's Loop/river chunks 13 to 18 draws and 22 to 28k triangles; far LOD is one draw and
under 300 triangles. Budget for H: at most 20 near draws and 45k triangles per chunk, LOD under
2k triangles (the test fails above 40 draws or a 4k-triangle LOD). If a district needs more
materials, merge colours into `painted`. (`chunk.region` is the first region that put a mesh in
the chunk; chunks do not follow region edges.)

## 5. Collision, ground and water

- Boxes are axis-aligned (`collision.addBox(..., tag)`); characters are cylinders. Steps up to
  0.45 m are walked; anything taller is a wall. Slopes are stairs of 0.05 to 0.1 m (see `ramp()`).
- The fallback floor is `floorAt(x, z)` from region data: `0` on ordinary land, `-Infinity`
  over water and on multi-level districts where only boxes are ground (river, Lower Gotham).
  Give every walkable surface there a box.
- Railings 1.1 m, collide as one thin box (vehicles and people stop at them).
- `KILL_Y` per region (`index.js`): below it the hero is "in the water" (see 9.1).
- `world.covers` volumes hide the rain while the camera is inside (Lower Gotham's lower deck).
- Water bodies (`data.js` `water`) render as one merged mesh; each body glows off its banks.
- The collision grid covers x -700..800, z -820..420 (`assemble.js COLLISION_BOUNDS`);
  boxes outside still work (sparse fallback). Breakables and other runtime boxes go to per-cell
  lists until the next `freeze()`.

## 6. The street graph

`buildStreetGraph()` (pure) = core streets + each region's. `g.addStreet(points, opts)` with
points `{ x, z, y?, deck? }` and opts `{ width, lanes, oneway, sidewalk, kind, deck, region,
bridge }`. Decks: `'street'` (y 0), `'lower'`, `'ramp'`, `'walk'` (no lanes: on foot only),
`'el'` later. Nodes only merge on the same deck, so the two decks of Lower Gotham are distinct.

- `g.route(nodeA, nodeB, { blocked })` (A*), `g.routeBetween(from, to, { blocked, lane })` →
  `{ points, length, edges }`: a polyline on the road surface (snap to nearest edge at both ends),
  optionally offset onto a lane (`lane` metres, positive = right of travel).
- `g.nearestNode(x, z, { y, deck })`, `g.nearestEdge(x, z, { y, filter })`, `g.sidewalkLines(e)`.
- Raised bridges: pass `blocked: (e) => e.bridge && !world.bridges.isDown(e.bridge)`.
- **Traffic keeps left** in this city (the core's cars always did; region loops follow it).
- Core `LINES` (cityLife, vehicles) come from `coreTrafficLines(graph)`.

## 7. Sites, spawn tables, palettes, interiors

- `SITES` (mapData) is frozen. A region's named points go in its `sites` (merged into
  `REGION_SITES`).
- Crime spots: `spawnTables.crimes` entries `{ id, district, x, y, z, yaw }` (y at the surface;
  the director snaps from y + 3, so lower-deck spots work). They join `ALL_CRIME_SPOTS`, used
  only once the district is visited.
- Palettes: one per district (`palette.key`, `center`, six `swatches`); `comicPalette.js` reads
  them. Progress-page tints: `tint`. The progress map shows regions with `progressMap: true` (the
  core only, until a region opts in and the page is redesigned for the bigger map).
- Interiors: the core's rooms are in `interiors.js` (`INTERIOR_ROOMS`). A region builds a hollow
  `building()` (`hollow: true, exteriorHoles: [...]`) and its room geometry like
  `interiors.js` does. **No new `THREE.PointLight`s** (light count is a shader key; workstream A
  owns lights): use `lightSpot()` and emissive geometry.

## 8. Checking your work

```
npm test                                  # frozen core, collision parity, graph, regions, walks
BASE_URL=http://localhost:5330 npx playwright test world.spec.js   # on foot, glide, car
node scripts/world-shots.mjs shoot http://localhost:5330 <dir> high   # fixed-camera shots + per-pass draws
node scripts/world-shots.mjs diff docs/design/shots/world/before <dir> <diffDir>
node scripts/collision-bench.mjs          # old hash vs dense grid
```

Shots freeze time (traffic, rain, lightning, ink boil), so two runs of one build diff to
0.00 %. A shot can pin the time (`{ t }`) to show a bridge raised.

## 9. Known gaps and hand-over notes

1. **Lower deck and river walk need one line in `src/game/game.js` (workstream B's file).**
   game.js teleports the hero back to safe ground whenever `hero.pos.y < -0.8` (the harbour
   rule). Below street level that fires on the lower deck (y -5.5) and the river walk (-4.5).
   The fix is `if (world.belowWater(hero.pos))` in place of `if (hero.pos.y < -0.8)`: identical
   in the core and harbour (killY -0.8), lower only where a region says so. Until it lands the
   lower deck is reachable by car and its collision is proven by unit walks, but the hero on
   foot is bounced back up. Not changed here because game.js is B's.
2. The El is a stretch of structure only (south leg of the Loop rectangle on z -359, the row's
   north street: not z -330 as the research sketch has it). Trains, stations and stairs are H's.
3. Landmark silhouettes that should never cull (Wayne Tower, the Exchange) need
   `chunks.addDetail(mesh, box, 'draw')` with a larger draw distance: add a range to
   `chunks.js` when the first landmark exists.
4. Region traffic loops are polylines with spacing and bridge stops; they do not yield at
   junctions. Civilians do not use the sidewalk lines yet (workstream M).
5. The horizon follows the camera (no parallax past about 700 m); the suspension bridge across
   the bay stays where it was.

## 10. Measurements at hand-over (RTX 4060 laptop, headless Edge, 1280x720 shots, High)

Fixed-camera shots (`docs/design/shots/world/before/stats.json` vs `stats-after.json`), colour +
normal + ink passes summed. Before = the original code; "chunking only" = the framework without
the new region; after = with the proof region in view where the camera faces north.

| shot | calls before / chunking only / after | triangles before / chunking only / after |
|---|---|---|
| gcpd roof | 187 / 248 / 339 | 530k / 468k / 507k |
| neon street | 246 / 225 / 240 | 559k / 433k / 448k |
| docks roof | 305 / 217 / 220 | 598k / 313k / 327k |
| clock arena | 329 / 253 / 327 | 693k / 480k / 556k |
| overview south (140 m up) | 365 / 160 / 165 | 733k / 178k / 192k |

Core look (`world-shots.mjs diff`): street level and interiors 0.00 to 0.13 % of pixels change;
roofs 0.5 to 3.5 % (the horizon now follows the camera and the blimp's orbit is larger: the
city itself is unchanged, see the diff images); the 140 m overviews and the north edge change by
12 to 32 % (far LOD, the new region). In play (`fps-sweep.mjs`, ONLY=main, back to back): GCPD
roof 654 -> 782 calls, 795k -> 775k triangles, median 3.2 -> 3.7 ms (the Loop row is in view);
docks yard 267 -> 272 calls, 331k -> 281k triangles, 1.8 ms both.
