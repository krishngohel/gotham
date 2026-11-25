# Rendering and performance research for Long Night 2

Scope: three.js **r186 (0.186.1, as installed)** `WebGLRenderer` on WebGL2, the ink pipeline in
`src/render/inkPipeline.js`, a city about to grow about 4x in area, a `potato` tier that must hold
30 fps at 720p on an Intel UHD 620, and better shaders, shadows and "ray tracing" for strong GPUs
without losing the comic look. Written 2026-11-24.

Notes on the evidence. Statements about three.js are checked against the installed source in
`node_modules/three` (file names are given) unless marked otherwise. Statements about browsers come
from MDN, caniuse, Bugzilla and web.dev, with links at the end of each section. Frame-time numbers
marked *estimate* are my own reasoning and have not been measured on this game. Every one of them
needs to be checked with `?bench=1` (`src/dev/perfBench.js`) on real hardware. Section 11 lists
what I could not verify.

---

## 0. Do this, in this order (one page)

| # | Do this | Where | Expected win (*estimate*, measure it) |
|---|---|---|---|
| 0 | **Measure first.** Extend `perfBench` with GPU ms per pass (the timer query already exists in the ink pipeline), draw calls per pass, triangles per pass, and a fixed camera in the busiest new district. Record a UHD 620 baseline. | `src/dev/perfBench.js`, `inkPipeline.js` | Without this, none of the numbers below can be checked |
| 1 | **Stop paying for lights you cannot see.** 19 `PointLight`s are always in every lit shader: 4 pool, 1 finale flash, and 14 `roomFill` lights in `interiors.js`. Every lit fragment in the city loops over all of them, even when intensity is 0. Move the interior fills into the pool (priority to the room the player is in) or bake them into vertex colour. Make the pool size a fixed number per tier: 0 / 2 / 4 / 6 / 8. | `world/interiors.js`, `world/lightPool.js`, `quality.js` | Colour-pass fragment cost down **20–40 %** on UHD-class GPUs. The biggest win for the least work |
| 2 | **Cut draw distance to the fog.** Fog is `FogExp2(0.0062)`, so anything past about **320 m** is pure fog colour, but `camera.far` is 1500. Add `quality.drawDistance` (potato 200 m with denser fog, up to about 450 m on ultra) and cull chunks by distance. | `game.js` camera, region builder | Bounds the 4x city to roughly today's visible load |
| 3 | **Re-bucket all static geometry into chunks** of **128 m** per material, the core city included (render-side only: the frozen data stays frozen). Keep geometry **indexed**: today `buckets.add` calls `toNonIndexed()`, which costs about +50 % vertex work on boxes. Add a merged far-LOD silhouette per chunk past about 200 m. | `world/buckets.js`, `world/materials.js` (`global` flag) | Vertex work in all three passes follows what is visible, not the whole city. City draw calls about **40–90 per pass** (section 1.5) |
| 4 | **Delete the normal pass.** `potato`/`low`: take creases from the depth buffer the ink shader already samples (the Laplacian of 1/z already fires on creases), with no normal target at all. `medium`+: write view normals as a second MRT attachment (`WebGLRenderTarget({count: 2})`) from the colour pass. | `inkPipeline.js`, `render/toon.js` | Removes one full scene pass, plus the skeleton updates and bone-texture uploads that run again for every `renderer.render` call. About **25–35 %** of geometry cost |
| 5 | **Cache shadows.** The 2048 map is redrawn every frame (`needsUpdate = true` in `render()`). Split it: a static city shadow, rendered only when the player has moved far enough from the last centre (or time-sliced), plus a small per-frame map for characters only. Threshold the result so it reads as an inked shape, and let the ink pass hatch it. Shadows stay off on potato and become a blob or ink drop shadow there. | `world.js`, `inkPipeline.js`, `toon.js` | Shadow pass from every frame to about every 30–60 frames. Big on medium |
| 6 | **Characters.** Hull outlines are `frustumCulled = false`, so every goon or civilian off screen still draws its skinned hulls. Cull hulls with their body, hulls only within about 30 m, and throttle `AnimationMixer.update` by distance (1, 1/2, 1/4 rate, skipped off screen). For crowds, use one skinned mesh per civilian (palette-posterized vertex colours), or baked-animation instancing once civilians number more than about 30. | `render/toon.js`, `actors/*` | CPU and vertex cost that grows linearly with crowd size |
| 7 | **Collision past 65,536 boxes.** `seen = new Uint32Array(1 << 16)`. Past that, `query()` silently falls back to `queryAll`, which scans every box on every query. That cliff arrives at about 4x the city. Replace it with a dense per-region CSR grid (typed arrays), grow `seen`, and drop the per-call allocations in `raycast` and `resolveCylinder`. | `world/collision.js` | Avoids an O(n) cliff that would cost milliseconds per frame |
| 8 | **Tiers + detection** (section 6): renderer string, then a short benchmark of the *real* pipeline after prewarm, then a stored decision. Dynamic resolution stays as the safety net. | `quality.js`, boot | Right defaults on first boot |
| 9 | **Upper-tier looks**, only after 1–5: AO from depth + MRT normals (in-tree `GTAOPass.setGBuffer`, half res, quantised into hatch bands), stylised wet-street screen-space reflections that reflect bright and emissive pixels only, near-character contact shadows, day/night and weather through uniforms only. Optional and experimental: `LightProbeGridWebGL` baked bounce light (new in r18x, see 5.4). | new `render/` modules | Better looks within about 3–4 ms on a mid GPU at 1080p |

**Where I think the design doc (`long-night-2.md`) is wrong or under-specified**

1. **§3 "cascaded shadows".** The `three/addons/csm/CSM.js` addon is a poor fit here. It
   *overwrites* `material.onBeforeCompile`, which breaks `posterize()` in `toon.js`. It replaces
   `ShaderChunk.lights_fragment_begin` globally with its own copy, which already lags core (no
   `USE_LIGHT_PROBES_GRID`, no `NUM_SUN_LIGHTS`). And it redraws every cascade every frame. Use the
   cached static map plus a small dynamic map from step 5 instead. `CSMShadowNode` exists only for
   `WebGPURenderer`.
2. **§4.2 "`core` wraps today's builders byte-for-byte" plus "new regions use chunked buckets".**
   If the core keeps its ~25 city-wide merged meshes, the core is still drawn whole, three times
   a frame, from anywhere in the 4x city. The frozen-city guard covers *map data*
   (`buildMapData`, `SITES`, …), not how meshes are grouped for rendering. Re-bucket the core too.
3. **§4.3 "a tier from the GPU string and a 2-second benchmark".** The GPU string is reliable only
   on Chromium. Safari reports "Apple GPU", and Firefox sanitises it or disables it under
   resist-fingerprinting. Under vsync a benchmark cannot see headroom past the refresh rate. It
   must run after shader prewarm and measure GPU time (or several frames per rAF), or it will
   mostly measure compile hitches. See section 6.
4. **§4.3 potato target.** 30 fps at 720p on a UHD 620 in the busiest district is realistic *only*
   with all of 1–4 and shadows off. Today's `low` still renders the whole city twice and loops over
   19 point lights per fragment. Write the potato spec as a contract (section 6.4 table).
5. **§2 rule 5 "new per-frame code allocates nothing".** Existing hot paths break it:
   `collision.raycast` allocates `[]` and a normal object per call, `resolveCylinder` returns a new
   object, and the public `query` wrapper allocates. Fix these when the collision work in step 7
   touches them.
6. **§3 "WebGPU rejected".** I agree (section 5.6), with one correction to the reason: WebGPU does
   not offer ray tracing either. The real reasons are the port cost and browser and backend
   coverage, not ray tracing.

---

## 1. Large static city on WebGL2

### 1.1 What the code does today
- `buckets.js` groups geometry by material and 80 m chunk, but `materials.js` sets
  `userData.global = true` on every material except `painted` and `steel`. Facades, storefront,
  trim, roof, asphalt, sidewalk, glass, glow, lanes, pools, puddles and cones each become one
  city-wide mesh, and its bounding sphere always intersects the frustum. So the whole city goes
  through the vertex shader in the colour pass, the normal pass and the **shadow pass** (the
  shadow camera covers only ±32 m, but the city-wide meshes pass its frustum test as well).
- `add()` calls `geometry.toNonIndexed()`. A box drawn non-indexed runs the vertex shader 36 times
  instead of 24, because the post-transform cache only works with an index.

### 1.2 Options compared (r186 facts from source)

| | Chunked merged `Mesh` per material | `BatchedMesh` per material, chunk = instance | `InstancedMesh` per prop type |
|---|---|---|---|
| Draw calls | materials × visible chunks | 1 per material per pass with `WEBGL_multi_draw`. **Firefox has no `WEBGL_multi_draw`** (caniuse, Bugzilla 1536673 still open), so r186 falls back to a loop of single draws (`WebGLRenderer.js` ~l.1317) | 1 per type per pass |
| Culling | per chunk (three's frustum test on the bounding sphere) plus our distance test | `perObjectFrustumCulled` (default true) and `sortObjects` (default true) run in `onBeforeRender` on the CPU. `onBeforeShadow` re-culls against the shadow camera | whole mesh only. Per-instance culling needs your own compaction or `@three.ez/instanced-mesh` |
| Vertex cost | none extra | per-instance matrix read from `_matricesTexture` in the vertex shader (one texel fetch per vertex; small, not zero) | instance matrix as an attribute |
| Compatibility with this code | works unchanged with `onBeforeCompile`, `prewarm`, the normal pass and the shadow depth materials | the normal pass already sorts on `isBatchedMesh` (`variantOf`). Needs its own `customDepthMaterial` (see `prewarm.js`). All geometries must share the same attributes and indexing. Capacity is fixed up front (`setGeometrySize` / `setInstanceCount` to grow) | fine for props |
| Risk | lowest | medium: CPU cost of per-instance culling with many instances (forum reports), Firefox fallback | low |

**Recommendation.** Use plain chunked `Mesh`es first: simplest, identical in every browser, and
they keep every existing hook. Move a material to `BatchedMesh` only if section 0 step 0 shows
draw-call CPU time matters on Chrome. With about 56 chunks per material that is a trivial culling
loop. Use `InstancedMesh` (or `BatchedMesh` with `addGeometry` once and `addInstance` many) for
repeated props such as lamps, hydrants, AC units, water towers and gargoyles, **one per prop type
per chunk**, so culling still works. The official example `webgl_batch_lod_bvh.html` shows
`@three.ez/batched-mesh-extensions` (BVH culling plus LOD). It is not needed at this scale, and it
would be a new runtime dependency, which rule 7 asks us to justify.

### 1.3 Material consolidation (do it if draw calls come out above about 400 per frame)
About 16 toon materials differ mostly by their `map`. Facade styles plus storefront (8 canvas
textures) can become one `DataArrayTexture` (`sampler2DArray`), with a per-vertex layer index
patched in through `onBeforeCompile`. That collapses about 8 materials to 1. Memory stays about the
same: 8 × 1024×2048 RGBA is about 64 MB plus mips, which is already resident today. On potato,
halve facade resolution, since UHD 620 memory is shared system RAM.

### 1.4 Far LOD and occlusion
- **Far LOD per chunk:** one merged mesh per chunk made of building boxes (no undersides) with a
  procedural lit-window pattern (world-space grid hashed in the fragment shader, emissive only).
  Switch at about 200 m, where ink lines already fade (`smoothstep(70, 180, dc)` in the ink
  shader). Small dither or fog hides the swap. Impostor cards are not worth it for box buildings.
- **Skyline backdrop** (`skyline.js`) already covers the horizon. Keep it.
- **Occlusion that is viable in WebGL2:** hardware occlusion queries
  (`ANY_SAMPLES_PASSIVE_CONSERVATIVE`) on chunk bounding boxes are asynchronous with 1–3 frames of
  latency, so chunks pop when a corner is turned quickly (grapple and glide). three does not
  integrate them. A street-level potentially-visible set is awkward because players also glide
  above the roofs. **Verdict:** frustum, distance and fog are enough at this size. Revisit
  occlusion queries only for ultra if the measurements say so.

### 1.5 Chunk size and expected draw calls
- 4x area is about 950 × 900 m. 128 m chunks give about 8 × 7 = **56 chunks**.
- Visible set at 300 m draw distance with about 75° horizontal FOV: sector area
  ≈ (75/360)·π·300² ≈ 59,000 m², which is about **12–18 chunks** once frustum-edge overlap is
  counted.
- City draws per pass ≈ materials per chunk (about 6–8 after merging the light ones, 3–4 with
  texture arrays) × 15, plus far-LOD chunks (about 10), plus global FX (lanes, pools, cones; keep
  those per chunk too) ≈ **60–130 per pass**. Shadow (static, cached) only touches chunks inside
  the shadow box (1–4).
- 64 m chunks give four times as many draws for finer culling. On the weak 4-core laptop CPUs that
  come with a UHD 620, each WebGL draw call costs roughly 10–40 µs of CPU in ANGLE (*estimate*), so
  128 m is the better trade.
- **Index buffers:** keep indices (`Uint32` is core in WebGL2; use `Uint16` when a chunk has
  fewer than 65,536 vertices). For non-indexed inputs (`ExtrudeGeometry`) run
  `BufferGeometryUtils.mergeVertices` before merging. It welds only vertices whose position,
  normal, uv and colour all match, so hard edges survive. `mergeGeometries` needs all inputs
  indexed or all non-indexed.

Sources: [caniuse WEBGL_multi_draw](https://caniuse.com/mdn-api_webgl_multi_draw),
[Bugzilla 1536673](https://bugzilla.mozilla.org/show_bug.cgi?id=1536673),
[three.js webgl_batch_lod_bvh](https://threejs.org/examples/webgl_batch_lod_bvh.html),
[batched-mesh-extensions](https://github.com/agargaro/batched-mesh-extensions/),
[BatchedMesh high CPU thread](https://discourse.threejs.org/t/significant-performance-drop-and-high-cpu-usage-with-batchedmesh/67324),
[InstancedMesh2 thread](https://discourse.threejs.org/t/three-ez-instancedmesh2-enhanced-instancedmesh-with-frustum-culling-fast-raycasting-bvh-sorting-visibility-management-lod-skinning-and-more/69344),
[MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) (batching, atlasing).

---

## 2. Avoiding the triple draw

Today's frame: shadow (inside the colour `render`), colour, normal (`overrideMaterial =
MeshNormalMaterial`, DoubleSide, `normalScale` 0.5 on low), the ink quad, and x-ray when detective
mode is on. One cost the code does not show: `info.render.frame` increases on every
`renderer.render()` call (`WebGLRenderer.js` ~l.1729), and `WebGLObjects.update` re-runs
`skeleton.update()` (bone matrices and the bone-texture upload) once per *render call*. So every
skinned character's skeleton is computed twice a frame today.

### 2.1 Potato and low: no normal target at all
The ink shader already takes a 3×3 Laplacian of inverse depth. Because 1/z is linear across any
plane, that Laplacian is zero on flat faces and non-zero at *both* silhouettes and creases between
planes. For a boxy city this already finds most creases. The normal-gradient term mainly adds weak,
distant creases and curved character interiors, and characters already get hull outlines. Plan:
- add a `quality.normals: 'depth' | 'mrt'` flag;
- in `'depth'` mode, compile the ink shader with `#define NORMALS_FROM_DEPTH`, skip the
  `tNormal` taps, and use a second, lower Laplacian band for creases (thin pen line) on top of the
  silhouette band;
- if crease lines look weak, reconstruct normals from the same depth taps (atyuwen's / Wicked
  Engine's "accurate normal reconstruction" picks the smaller-gradient side to avoid edge
  artefacts) and run the existing normal-gradient code on those. No extra texture fetches, since
  the 3×3 depth taps are already loaded.
This needs a visual check against `docs/design/shots/`.

### 2.2 Medium and up: MRT normals from the colour pass
r186 facts (source):
- `new WebGLRenderTarget(w, h, { count: 2, type })` creates `textures[0..1]`. Each attachment can
  have its own `type` and format: `setupFrameBufferTexture` uses each attachment's own texture
  (`WebGLTextures.js` ~l.2178). Set `colorRT.textures[1].type = UnsignedByteType` before first use.
  `WebGLState.drawBuffers` enables `COLOR_ATTACHMENT0..n` automatically.
- three declares only `layout(location = 0) out highp vec4 pc_fragColor;`
  (`WebGLProgram.js` ~l.819). Every material drawn into the MRT target must declare and write
  location 1 itself. **In WebGL2, an attachment that the bound program does not write is
  undefined**, so any material you miss leaves garbage normals. That includes `MeshBasicMaterial`
  glow, the sky `ShaderMaterial`, rain, steam, halos, cones, lanes, the x-ray materials if they
  ever draw into it, and hull outlines.
- Cleanest way to patch built-ins: one helper, `withNormalOut(material)`, applied in `toonMaterial()`,
  in `materials.js` and in each of the 14 custom `ShaderMaterial`s. It injects
  `layout(location = 1) out highp vec4 gNormal;` after the prefix and
  `gNormal = vec4(normalize(normal) * 0.5 + 0.5, 1.0);` at the end of `main`. For built-ins the
  hook is the `#include <dithering_fragment>` line, which every built-in fragment shader ends with.
  Chain with any existing `onBeforeCompile` (posterize) instead of overwriting it, and extend
  `customProgramCacheKey`. (Patching `ShaderChunk.dithering_pars_fragment` globally also works
  for built-ins, but not for `ShaderMaterial`s, and it is invisible to readers. Use the helper.)
- **Transparent and FX objects:** with blending on, WebGL2 blends every draw buffer with the same
  equation, using *each output's own alpha*. Write `gNormal = vec4(0.0)` from additive and
  alpha-blended FX (pools, cones, puddles, steam, rain, halos): additive `ONE, ONE` adds zero, and
  `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` with alpha 0 leaves the destination alone. So FX stay out of the
  normal buffer, as they do today with `LAYER_FX`. Opaque FX (lanes, hull outlines) write a real
  normal: lanes are flat on flat roads, and hulls are already depth edges.
- Keep `DoubleSide` behaviour: today's normal pass draws everything DoubleSide. In the colour pass,
  front-face-only materials write front normals, which is what the edge pass wants.
- Format: normals in **RGBA8** (4 B/px) are fine for edge gradients and for AO. Use
  `OctahedronEncode` into RG8 only if bandwidth bites. Keep the alpha channel for flags such as a
  shadow mask (5.1) or wetness.
- Size: MRT attachments must match the colour size, so the `normalScale` 0.5 trick goes away. On
  medium that costs bandwidth (full-res RGBA8 write) but saves a whole geometry pass, a good trade
  on any discrete GPU.

### 2.3 Half float vs RGBA8 on integrated GPUs
- Colour target is `HalfFloatType` (8 B/px) whenever `EXT_color_buffer_float` exists. On a UHD 620
  sharing about 19–38 GB/s of DDR4 with the CPU, bandwidth is the scarce resource.
- r186 supports **sRGB 8-bit render targets**: `colorSpace: SRGBColorSpace` with
  `UnsignedByteType` maps to `SRGB8_ALPHA8` (`WebGLTextures.js` l.234). Blending happens in linear
  and dark values keep their precision, which matters for a night scene. Use it on potato and low
  (4 B/px). The ink shader reads it back as linear automatically.
- HDR headroom: there is no tone mapping, and emissive or additive values above 1 are clamped by
  the ink pass anyway. The only visible loss is additive stacking above 1.0 before clamping, which
  the palette snap hides. Check visually.
- MDN: float16 blending is always supported when rendering to float16 is. Avoid RGB8 targets.
  Call `gl.invalidateFramebuffer` on the depth attachment once the ink pass has consumed it,
  though that matters mostly on tiled mobile GPUs.

### 2.4 Depth pre-pass: no
A depth pre-pass adds back the geometry pass that 2.1 and 2.2 remove. The opaque list is already
sorted front to back (`normalPassSort`, and three's default opaque sort by z), Intel Gen9 has
hierarchical Z, and after step 1 (lights) the toon fragment shader is cheap. Reconsider only if
AO or screen-space reflections ever move into the material shader, which they should not.

Sources: [three.js PR #27808 (MRT and built-in materials)](https://www.github.com/mrdoob/three.js/pull/27808),
[forum: multiple outputs from a ShaderMaterial](https://discourse.threejs.org/t/how-do-you-get-multiple-outputs-from-a-fragment-shader-in-a-shader-material/74959),
[atyuwen: accurate normal reconstruction](https://atyuwen.github.io/posts/normal-reconstruction),
[Wicked Engine: improved normal reconstruction](https://wickedengine.net/2019/09/improved-normal-reconstruction-from-depth),
[MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

---

## 3. Shadows

### 3.1 Facts in r186 (source)
- `WebGLShadowMap.render` returns early when `autoUpdate === false && needsUpdate === false`.
  **Per light**, `light.shadow.autoUpdate` and `light.shadow.needsUpdate` exist and are checked
  (`WebGLShadowMap.js` ~l.170). The renderer already sets `shadowMap.autoUpdate = false`, but
  `inkPipeline.render` sets `needsUpdate = true` every frame.
- **`PCFSoftShadowMap` was removed in r186** (deprecated in `constants.js`, falls back to PCF with
  a warning). Types left: `BasicShadowMap`, `PCFShadowMap` (hardware compare), `VSMShadowMap`.
- The shadow pass tests `object.layers` against the *view* camera's layers, not the shadow
  camera's (l.522). So layers cannot pick shadow casters per light.
- A shadow map cannot be partly redrawn. Three clears it and draws every caster.

### 3.2 Recommended structure ("cached static plus small dynamic")
1. **Static city shadow:** your own `DepthTexture` render target, rendered with an orthographic
   moon camera covering ±64 m (2048 on high, 1024 on medium) from the static chunks only.
   Re-render it only when the player has moved more than about 24 m from the last centre, when the
   moon direction changes enough (day/night), or after a breakable changes. Time-slice it by
   rendering it in the frame after the trigger, and keep the old one until then. Sample it in the
   toon material through the same chained `onBeforeCompile` (`toon.js` is already the single
   factory for toon materials) and multiply it into the moon's `directLight.color` the way
   `shadowmap_fragment` does.
2. **Dynamic characters:** three's own moon shadow with `castShadow` on characters and vehicles
   only (the city sets `castShadow = false`). A ±12 m box at 1024 follows the player. This is cheap
   because only a handful of skinned meshes draw into it each frame.
3. **Potato and low:** no shadow maps. Characters get an **ink drop shadow** (a flat ink ellipse
   decal, like the existing `pool` decal) and the toon bands do the rest.

Alternatives considered:
- *Throttle the single existing map* (every Nth frame): character shadows visibly stutter while
  they move. Fine for medium if 3.2's split costs too much engineering.
- *Blit a cached depth copy into the shadow map, then draw dynamic casters*: needs raw
  `gl.blitFramebuffer` around three's internal clear. Fragile across three updates.
- **three's CSM addon:** see section 0, disagreement 1. In short, it overwrites
  `onBeforeCompile`, patches `ShaderChunk` globally with a stale copy, adds
  `NUM_DIR_LIGHT_SHADOWS = cascades` to every lit shader, and renders N maps per frame. A far
  cascade is also mostly invisible here because the fog finishes it by about 320 m.

### 3.3 Keeping shadows inked rather than soft
- Hard-threshold the shadow factor in the patched chunk (`step(0.5, shadow)`, or a narrow
  `smoothstep` across one or two texels) so cast shadows have clean shapes. PCF then only
  anti-aliases the edge.
- Write a **shadow mask** into the MRT normal target's alpha. The ink pass can then (a) hatch cast
  shadow specifically, as distinct from dark albedo, and (b) draw a thin ink line along shadow
  borders (gradient of the mask), which is the classic Mignola or noir look.
- **PCSS and soft shadows are against the art direction.** three has a PCSS example
  (`webgl_shadowmap_pcss`, which patches `shadowmap_pars_fragment`), but its soft penumbrae fight
  the ink bands and cost 16–32 or more taps per pixel. Not recommended.
- **Contact shadows (high and up):** a screen-space march toward the moon from the depth buffer,
  8–12 steps, max length about 0.75 m, only for pixels with `dc < 25 m`. Run it at half resolution
  inside a small AO-and-contact pass. Output is binary (it feeds the shadow mask, then hatching).
  three's `SSSNode` does exactly this, but it is TSL/WebGPU-only, so port the idea, not the code
  (Bend Studio method). Cost *estimate*: 0.3–0.6 ms at 1080p half-res on a GTX 1060 class GPU.

Sources: [forum: per-light shadow caching after r165](https://discourse.threejs.org/t/when-three-js-version-bigger-than-164-the-shadowmap-cant-be-cache-this-leads-to-a-decrease-in-rendering-performance/67687),
[forum: render shadow map once](https://discourse.threejs.org/t/how-to-render-shadow-map-one-time/7176),
[Bend Studio screen-space shadows](https://www.bendstudio.com/blog/inside-bend-screen-space-shadows/),
[Panos Karabelas: screen-space shadows](https://panoskarabelas.com/posts/screen_space_shadows/).

---

## 4. Many lights

### 4.1 Cost model in three's forward renderer
- Every lit material is compiled with `NUM_POINT_LIGHTS` = all point lights in the scene, and the
  loop in `lights_fragment_begin` is unrolled. For `MeshToonMaterial`, each light does
  attenuation, N·L and a **gradient-map texture lookup** for every lit fragment, *including lights
  at intensity 0 or out of range*. Hiding a light (`visible = false`) or adding one changes the
  count and recompiles every lit program, which causes the hitch the code comments already avoid.
- Forum consensus is about 8–10 lights in total before it hurts on average hardware. Integrated
  GPUs should be well below that.
- **This codebase:** 19 point lights (`lightPool` 4, `flashLight` 1, `interiors.roomFill` × 14)
  plus hemisphere, moon and rim. At 720p with about 2× overdraw that is about 1.8 M fragments ×
  22 light evaluations a frame. *Estimate* on a UHD 620 (about 400 GFLOPS): 10–20 % of the whole
  frame budget, spent mostly on lights in rooms the player is not in.

### 4.2 What to do for a night city
1. **Fixed small pool per tier** (keeps program keys constant): potato 0, low 2, medium 4,
   high 6, ultra 8. Interior fills become pool *spots* with a priority boost when the player is
   inside, and the flash light becomes a pool override during the finale.
2. **Everything else is fake light that costs no shader loops:** emissive windows (already
   there), halos and sprites (`halos.js`), light-pool decals on the ground (`pool` material). Make
   these per chunk so they cull.
3. **Distance-culled pool assignment** already exists (`lightPool.update`, 0.2 s re-sort). Add a
   short intensity fade when a light is reassigned to stop popping, and pre-allocate the `order`
   array entries, since `push([d, s])` allocates.
4. **Deferred-lite light volumes (high and ultra, optional):** with MRT normals and depth, draw
   instanced spheres or cones for many street lamps after the colour pass, with additive blending,
   reading depth and normal, and quantised to one or two bands. Cost scales with screen coverage,
   not with light count × all pixels. Without a separate albedo buffer this tints rather than
   relights (multiply by the colour buffer's luma as a proxy), which suits a stylised look.
5. **Clustered forward in WebGL2: no production-ready option for `WebGLRenderer`.** r186 ships
   `three/addons/lighting/ClusteredLighting.js` and `DynamicLighting.js`, but both are custom
   `Lighting` systems for **`WebGPURenderer`** (TSL, compute and storage buffers). Older WebGL
   clustered experiments on the forum ("Dr.Strangelight") are not maintained libraries.

Sources: [forum: point lights and performance, revisited](https://discourse.threejs.org/t/point-lights-and-performance-revisited/49316),
[forum: many lights in a city game](https://discourse.threejs.org/t/performance-when-handling-large-number-of-lights-in-a-city-game/11802),
[forum: Dr.Strangelight clustered thread](https://discourse.threejs.org/t/dr-strangelight-or-how-i-learned-to-stop-worrying-and-love-the-cluster/23104?page=2).

---

## 5. "Ray tracing" with WebGL2 and a toon look

### 5.1 What is honestly achievable
| Effect | How | Tier | Cost *estimate* (1080p, GTX 1060 class) | Comic treatment |
|---|---|---|---|---|
| Ambient occlusion | in-tree `GTAOPass` with `setGBuffer(colorRT.depthTexture, normalTex)`. It takes our depth and normal targets directly, and its `NORMAL_VECTOR_TYPE 1` decodes `normal*0.5+0.5`, the same packing as `MeshNormalMaterial` and our MRT. Or a small custom half-res horizon AO. N8AO is an alternative (depth-only, half-res mode) but is built around EffectComposer or pmndrs/postprocessing, and it would be a new dependency | medium (half-res, 8 samples), high | 0.7–1.5 ms half-res | Do not multiply AO into the colour. Feed it into the ink shader's hatch and dot zones (`ao < 0.6` → hatch band), so occlusion appears as ink, not grey |
| Contact shadows | section 3.3 | high+ | 0.3–0.6 ms | binary, so it becomes hatching |
| Wet-street reflections | screen-space reflection **only** where MRT normal.y > 0.9 and the wetness mask is set. 12–16 linear steps at half res, sampling the colour target, **only accepting hits whose luma is above a threshold** (signs, windows, lamps). Stretch vertically and break into dashes, which extends what `wetStreaks.js` fakes today | high+, with `wetStreaks` as the low fallback | 0.5–1 ms | posterise to two levels, then halftone; the reflection reads as painted neon streaks |
| Planar reflections (`Reflector`) | re-renders the scene | **no** | one more full pass | — |
| Screen-space GI | three's `SSGINode` is TSL/WebGPU only. A WebGL port is a large job, noisy without temporal accumulation (needs TAA and reprojection we do not have), and flat toon albedo gains little | **no** | — | — |
| Baked bounce light | `LightProbeGridWebGL` (section 5.4) | ultra, experimental | bake at load; cheap per pixel | quantise the irradiance (band it) in the toon patch |

### 5.2 Quantise everything into the ink language
Stylised games keep screen-space effects in the art style by turning their outputs into the
existing quantised channels (bands, hatching, dots, line), not continuous shading. In this code:
the ink shader's `hatchZone`, `r` (dot radius) and `edge` are the channels, so AO, contact shadow
and the shadow mask should *feed those*. Reflections get the palette snap and halftone like
everything else, because they are sampled from the colour target before the ink pass.

### 5.3 What is not feasible
- **Hardware ray tracing:** neither WebGL2 nor shipped WebGPU exposes ray-tracing pipelines or
  acceleration structures. No browser offers it. (I could not find any 2026 shipping status for a
  WebGPU ray-tracing extension, so treat it as absent.)
- **Software BVH ray tracing** (`three-mesh-bvh` shader BVH, `three-gpu-pathtracer`): built for
  progressive or offline rendering. A city with hundreds of thousands of triangles at 30 fps is
  not realistic, even at quarter resolution on strong GPUs. The "ray tracing" we can sell is
  screen-space ray marching (AO, contact shadows, SSR).

### 5.4 New in r18x: `LightProbeGridWebGL` (verify before relying on it)
`three/addons/lighting/LightProbeGridWebGL.js`, documented as "can only be used with
`WebGLRenderer`", is a 3D grid of L2 spherical-harmonics irradiance probes baked on the GPU (cube
renders, SH projection, packed into one 3D render target). Core `lights_fragment_begin` adds
`getLightProbeGridIrradiance` under `USE_LIGHT_PROBES_GRID`, so `MeshToonMaterial` picks it up.
For a night city it could give coloured bounce from sodium lamps and neon, at low per-pixel cost.
Caveats: the bake cost per chunk is unmeasured; it conflicts with the CSM addon's stale chunk (one
more reason to skip CSM); and the irradiance enters toon shading unbanded, so patch it in to
keep it stylised. Ultra only, experimental.

### 5.5 Upper-tier frame budget (*estimate*, 1080p, mid GPU)
MRT colour pass + ink pass ≈ today minus one geometry pass, plus AO (1.0) + contact (0.4) +
SSR (0.8) + cached shadows (about 0 on average, 2–3 ms spike when re-rendered: time-slice it)
≈ **+2–3 ms** over a leaner base, which fits a 60 fps budget on GTX 1060 / RX 580 class GPUs.

### 5.6 WebGPURenderer / TSL in r186: confirm "no" for this project
- `onBeforeCompile` and `ShaderMaterial` / `RawShaderMaterial` are **not supported** by
  `WebGPURenderer`, on either its WebGPU or its WebGL2 backend (three.js manual). This repo has
  **10 `onBeforeCompile` hooks in 5 files and 14 `ShaderMaterial`s in 12 files**, plus the whole
  ink pipeline, all of which would need a TSL port.
- Coverage: WebGPU shipped in Chrome and Edge, Safari 26, Firefox 141 on Windows and Firefox 145
  on Apple-silicon macOS. Linux, Android Firefox and Intel Macs were still in progress in the
  late-2025 sources. Low-spec players would therefore run on the WebGL2 *backend* of
  `WebGPURenderer`, which forum reports describe as slower than `WebGLRenderer` and which gains
  nothing for the potato tier.
- The real WebGPU-only goodies (`ClusteredLighting`, `SSGINode`, `SSRNode`, `SSSNode`,
  `TRAANode`, `CSMShadowNode`) help only the top tier.
- **Conclusion:** stay on `WebGLRenderer` for Long Night 2. Revisit as a separate "ultra
  renderer" experiment only after the base costs are fixed, and only if the top tier looks
  inadequate.

Sources: [three.js manual: WebGPURenderer](https://threejs.org/manual/en/webgpurenderer.html),
[forum: onBeforeCompile in WebGPU](https://discourse.threejs.org/t/how-to-make-the-onbeforecompile-of-the-previous-webgl-version-compatible-in-the-webgpu-version-of-three-js/79895),
[forum: WebGPURenderer slower than WebGLRenderer](https://discourse.threejs.org/t/why-webgpurenderer-performance-significantly-lower-than-webglrenderer/77629),
[web.dev: WebGPU in major browsers](https://web.dev/blog/webgpu-supported-major-browsers),
[N8AO](https://github.com/N8python/n8ao),
[realism-effects](https://www.npmjs.com/package/realism-effects) (last push early 2024, readme
says "v2 in the works": treat as unmaintained),
[three.js SSGINode docs](https://threejs.org/docs/pages/SSGINode.html).

---

## 6. Quality tiers and auto-detection

### 6.1 Getting the GPU string in 2026
- **Chromium (Chrome, Edge, Opera):** `WEBGL_debug_renderer_info` → `UNMASKED_RENDERER_WEBGL`
  gives the ANGLE string, for example "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 …)".
  `gl.RENDERER` itself returns a generic value.
- **Firefox:** the extension logs a deprecation warning and is disabled under
  `privacy.resistFingerprinting`. `gl.RENDERER` returns a *sanitised* family string (Bugzilla
  1722113, 1916271). Usable for coarse classes, not exact models.
- **Safari:** "Apple GPU". Classify as Apple silicon and rely on the benchmark.
- **Extra signal:** `navigator.gpu.requestAdapter()` → `adapter.info.vendor` / `.architecture`
  (for example "intel" / "gen-9") on Chromium, without creating a WebGPU device. Strings may be
  empty, it needs a secure context, and the call is async and can take a moment. Use it only as a
  hint.
- **Software renderers** (SwiftShader, llvmpipe, "Microsoft Basic Render Driver") → potato, plus a
  one-time notice suggesting hardware acceleration.
- `detect-gpu` (now `@pmndrs/detect-gpu` v6): gfxbench-derived tiers 0–3 with automated weekly data
  updates, but it fetches benchmark JSON from a CDN unless self-hosted, and it is a new runtime
  dependency. **Do not add it.** A 30-line regex table (Intel HD/UHD/Iris Xe/Arc, AMD Vega/680M APU
  vs RX, NVIDIA MX vs GTX/RTX, Apple M-series, Adreno/Mali) is enough to *seed* the benchmark.

### 6.2 Benchmark that actually measures headroom
- Run it **after** `prewarm` (`compileAsync`, `uploadTextures`, `drawEverything`). Otherwise it
  measures shader compiles.
- Render the real ink pipeline from a fixed camera in the busiest district into the offscreen
  targets at 720p. Measure GPU time with `EXT_disjoint_timer_query_webgl2` where it exists (the
  pipeline already has the code). Where it does not, render 3–4 frames per rAF so vsync does not
  hide the cost, and sync with a 1-pixel `readPixels` at the end of each batch.
- Start at the regex-seeded tier. If the p90 is at most 0.75 of the 33 ms (potato or low) or 16.7
  ms (others) budget, try the tier above; if over, step down. Stop at three tries, about 2–3 s.
- Store `{rendererString, build, tier}` and re-run when the renderer string changes. The player
  can always override.

### 6.3 Interplay with dynamic resolution
`dynamicRes.js` scales only on missed frames, deliberately. Keep it as the safety net *inside* a
tier. Give each tier its own floor (potato 0.6 of 720p, ultra 0.75). If dynamic resolution sits on
its floor for more than about 30 s, offer a one-tap "drop to <tier>" rather than switching
silently (switching tiers recompiles programs for light count and defines).

### 6.4 Tier table (proposal; every field a flag, no tier-name tests)
| flag | potato | low | medium | high | ultra |
|---|---|---|---|---|---|
| target | UHD 620, 720p30 | Iris Xe / Vega 8, 900p–1080p30 | GTX 1050 / RX 560, 1080p60 | GTX 1660 / RTX 2060, 1080p60 | RTX 3070+, 1440p60 |
| pixelRatioCap | 1 (render scale 0.75–1 of 720p) | 1 | 1.25 | 1.5 | 2 |
| colour target | RGBA8 sRGB | RGBA8 sRGB | half float | half float | half float |
| normals | depth | depth | MRT | MRT | MRT |
| drawDistance / fog density | 200 m / 0.0085 | 260 m / 0.0072 | 320 m / 0.0062 | 380 m / 0.0055 | 450 m / 0.0048 |
| far LOD from | 120 m | 160 m | 200 m | 240 m | 280 m |
| shadows | ink drop decals | ink drop decals | static 1024 cached + dyn 512 | static 2048 + dyn 1024 | static 2048 + dyn 2048 + far static cascade |
| point-light pool | 0 | 2 | 4 | 6 | 8 (+ light volumes) |
| AO / contact / SSR | off | off | AO half-res | AO + contact + SSR | same, full-res AO |
| comic flags | wobble 0, hatch 1 (cheap), paper 0, misreg 0 | as today's `low` + hatch | today's `high` | today's `high` | + colour edges at full range |
| crowd density | 0.25 | 0.5 | 0.75 | 1 | 1 |
| hull outlines within | 15 m | 20 m | 30 m | 40 m | 60 m |
| anim full-rate radius | 10 m | 15 m | 25 m | 35 m | 50 m |
| rainCount | 400 | 850 | 1500 | 2500 | 3500 |

(`low` and `high` keep their ids. `high` must still look at least as good as today's high, per the
design doc. Check that the table's `high` does.)

Sources: [MDN WEBGL_debug_renderer_info](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_debug_renderer_info),
[Babylon forum: Firefox deprecation warning](https://forum.babylonjs.com/t/firefox-webgl-debug-renderer-info-is-deprecated/27017),
[Bugzilla 1722113](https://bugzilla.mozilla.org/show_bug.cgi?id=1722113),
[Bugzilla 1916271](https://bugzilla.mozilla.org/show_bug.cgi?id=1916271),
[MDN GPUAdapterInfo](https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapterInfo),
[@pmndrs/detect-gpu README](https://cdn.jsdelivr.net/npm/@pmndrs/detect-gpu@6.0.15/README.md).

---

## 7. Split-screen

- **Pixel cost is unchanged** (two half-size views), **geometry and CPU cost double**: two culling
  walks, two sets of draw calls, two skeleton updates if each view is a separate `render` call.
- **Do not use `ArrayCamera`** for split-screen. It culls against one combined frustum, which
  suits stereo views, not two players 200 m apart.
- **Render both views into one shared colour (+MRT) target** using `setViewport`/`setScissor` on
  the render target, then run **one** ink quad over the whole screen with a per-pixel viewport
  lookup (uniform array of two rects plus near/far per view). Clamp the 3×3 kernel inside the
  pixel's own viewport, or leave a 2–4 px ink gutter, so edges do not bleed across the seam. One
  ink draw is cheaper than two, and the gutter reads as a comic panel border, which suits the look.
- **Shadows:** two cached static regions (each re-rendered on its own trigger, time-sliced so
  they never land in the same frame). The dynamic character map follows the midpoint when the
  players are within about 40 m and is disabled (ink drop decals) when they are farther apart.
- **Budget rule:** split-screen applies a "−1 step" to `drawDistance`, `crowdDensity`, pool size
  and hull radius (not to the comic flags or resolution, which matter more for readability), and
  the benchmark in 6.2 should include a split-screen run before split-screen is offered on that
  tier. Expected *estimate*: about 1.4–1.6× single-view frame time after the reductions.

---

## 8. Day/night and weather with toon shading (no recompiles)

Rules: never add or remove lights, never toggle `castShadow`, `fog` or `visible` on lights,
never swap material defines mid-run. Change only uniforms and texture contents.
- **Sky:** `sky.js` is already a custom gradient dome. Drive its colours from a small keyframed
  table indexed by `world.clock`, with dots and halftone from the ink pass. No physical sky model
  is needed (three's `Sky` addon is Preetham scattering, which looks wrong under halftone and costs
  more).
- **Light colour and intensity:** `moon.color`, `moon.intensity`, `hemi.color`/`groundColor`,
  `rim` and the fog colour are uniforms. Day is "overcast": swap the moon for a sun direction by
  moving the same light. Move the shadow camera with it and re-trigger the static shadow cache
  when the angle changes by more than about 3°.
- **Toon bands:** the gradient map is a 3-texel `DataTexture`. Rewrite its bytes and set
  `needsUpdate` for day (softer shadow band) vs night (deeper). Palette snap already has
  `setPalette`, so keep per-time-of-day palettes there.
- **Emissive windows:** `emissiveIntensity` is a uniform. Fade windows in at dusk, with a
  per-window random threshold baked into the emissive map's alpha so lights come on one by one.
- **Wetness:** one global `uWet` uniform in the chained toon patch: darken albedo (× 0.6–0.7) on
  up-facing surfaces, and add a hard specular-like "ink highlight" band (a step on N·H). It
  drives the SSR mask on high and `wetStreaks` on low. The puddle mask is world-space so it does
  not swim.
- **Snow:** `uSnow` (0–1) in the same patch: world-normal-up mask (`dot(nWorld, up) >
  1 - uSnow*0.6`) broken up with world-space noise and replaced by paper white. White roofs with
  black ink edges are a very strong comic look for almost nothing. Rain particles become slow
  flakes: same `rain.js` mesh, different uniforms.
- **Fog:** keep `FogExp2`, which is a uniform. Height fog for "fog" weather by patching
  `fog_fragment` in the same chained hook. Tie `drawDistance` to fog density per tier, because
  denser fog permits a shorter draw distance.

---

## 9. CPU side

### 9.1 Collision past 65k boxes (`world/collision.js`)
- The cliff: `seen = new Uint32Array(1 << 16)` and `if (seen.length < boxes.length) return
  queryAll(...)`. At 4x the city, every `groundBelow`, `resolveCylinder` and `raycast` scans
  every box.
- Replace with:
  - **struct-of-arrays boxes:** `Float32Array` for min/max (6 × n), `Uint8Array` for flags or
    removed, a tag table;
  - **dense grid per region** (bounds are known): `cellStart: Uint32Array(W*H+1)` plus
    `cellBoxes: Uint32Array` (CSR), built once in `finishCity` with a counting pass;
  - a small **dynamic overflow** `Map` for boxes added or removed after the freeze (breakables).
    `removeBox` sets a flag instead of splicing;
  - `seen` grows to the next power of two of the box count (or use a generation `Uint16Array` and
    clear on wrap);
  - **no allocation:** `raycast` takes a reusable out-object and a module-level scratch list;
    `resolveCylinder` writes into a caller-owned result; drop the allocating `query` wrapper from
    the public API, or make it take an `out` array.
- Keep it DOM-free with Vitest tests (design rule 9), including a 300k-box performance test that
  must stay under a fixed time budget.

### 9.2 Per-frame allocation hot spots seen
`lightPool.update` (`order.push([d, s])` every 0.2 s), `collision.raycast` (`[]`, the normal
object), `resolveCylinder` (return object), and `ink.render` (fine). Run Chrome's allocation
sampling profiler during a glide across districts to find the rest.

### 9.3 Animation for dozens of characters
- Today: one `AnimationMixer` per character, twin actions for crossfades, skeletons updated per
  render call (section 2). Costs grow with active actions × tracks (65 bones × rotation, plus
  pelvis position).
- **Shared skeleton design is good.** One clip set binds to everyone. Keep `sanitizeClip`
  (dropping scale tracks is already a real saving).
- **Update throttling (animation LOD):** keep a `dtAccum` per character. Within the full-rate
  radius update every frame, then every 2nd frame, then every 4th (pass the accumulated dt so
  timing stays right). **Off screen** (looseSkinBounds failed the frustum test last frame): skip
  `mixer.update` and keep accumulating. Hide hulls and x-ray meshes with the body.
- **Hull outlines:** `addHullOutline` sets `frustumCulled = false`. Give the hull its parent's
  `boundingSphere` (or toggle `hull.visible` from the parent's culling result), and limit hulls
  by distance per tier. Characters with 5–8 skinned parts × (body + hull) × passes are where draw
  calls go.
- **Civilians:** build each civilian as **one** skinned mesh with palette-posterized vertex colours
  (`toon.js posterize` already supports this) rather than several parts with separate materials.
  No x-ray for civilians.
- **Crowds of more than about 30–40:** instanced skinning, so the per-character CPU cost becomes
  O(1).
  - *Baked bone textures:* bake each clip's 65 bone matrices per frame into a `DataTexture`
    (rows = frames). An `InstancedMesh` of the civilian body reads
    `boneTexture[clip, frame + instanceOffset]` in a patched `skinning_pars_vertex`. One draw per
    outfit type, no mixer. Crossfades are lost (blend two frames in the shader if needed).
  - *Vertex animation textures* (positions per vertex per frame): cheaper per vertex but huge for
    65-bone characters. Not worth it here.
  - `@three.ez/instanced-mesh` (InstancedMesh2) advertises skinning, LOD and BVH culling. It is a
    new dependency, so evaluate it only if the hand-rolled bone-texture approach stalls.

---

## 10. Code-level notes for the implementer

- **`inkPipeline.render`:** remove `renderer.shadowMap.needsUpdate = true` from the per-frame path
  once 3.2 lands. Keep `debug.cachedShadows` working for `perfBench`.
- **Program-key stability:** light counts, shadow-casting light counts, `USE_LIGHT_PROBES_GRID`, MRT
  output defines and `NORMALS_FROM_DEPTH` must be fixed per tier at boot. Switching tier =
  `prewarm` again under a loading overlay.
- **One chained `onBeforeCompile` per toon material.** Write a tiny `chainCompile(mat, fn, keyPart)`
  helper that composes hooks and cache keys. Posterize, MRT normals, the static shadow sampler,
  wet, snow and fog patches all go through it. Never assign `onBeforeCompile` directly again (the
  CSM addon's mistake).
- **`prewarm.depthMaterial`:** add a `'batched'` kind if `BatchedMesh` is adopted.
- **`camera.far`:** set it to `drawDistance + margin`. The ink shader's sky test `dc > uFar*0.9`
  depends on `uFar`, so check sky dots after changing it. Depth precision improves as a bonus.
- **Benchmark hooks:** `perfBench` already wraps `renderer.render` to sum calls. Add per-pass
  timer-query spans (shadow, colour, normal, ink) so each step's win can be attributed.

---

## 11. Not verified / open

- All millisecond and percentage numbers marked *estimate*: none were measured on this game or on
  a UHD 620.
- Firefox's exact sanitised `RENDERER` strings in 2026, and whether Firefox has *removed* (not just
  deprecated) `WEBGL_debug_renderer_info`.
- `EXT_disjoint_timer_query_webgl2` availability per browser in 2026 (it has been toggled for
  security reasons in the past).
- `WEBGL_multi_draw` in Firefox as of late 2026: sources up to the latest caniuse snapshot say
  unsupported.
- Whether the WebGL2 backend of `WebGPURenderer` has closed its performance gap in r18x (only
  older forum reports found).
- `LightProbeGridWebGL`: bake time for a city chunk, and whether it is stable in r186 (it is in the
  installed addons and wired into the core shader chunks, but I did not run it).
- N8AO's 2025–26 maintenance status (v2.0.0 on npm; commit dates not confirmed).
- That no browser has shipped a WebGPU ray-tracing extension by late 2026: I found no evidence of
  one, which is not proof.
- Visual quality of depth-only crease lines on characters and props (2.1) needs a screenshot
  comparison.
