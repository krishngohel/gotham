// Moon shadows, medium tier and up: a cached static map for the city plus a small per-frame map for
// characters, both inked (hard-thresholded) rather than soft.
//
// Before: one 2048 map, ±32 m around the player, redrawn every frame with every caster in it (and
// the city's merged meshes always pass the shadow frustum test, so the whole city went through the
// vertex shader a third time each frame).
//
// Now there are two shadow-casting directional lights:
// - `moon` (the real moonlight) owns the STATIC map: city casters only, rendered only when the
//   player has moved `refresh` metres from the map's centre, when the moon direction turns more
//   than 3 degrees, or after invalidate() (a breakable came down). Between refreshes the map, its
//   matrix and its light position stay put, so there is nothing to redo.
// - `moonDyn` (intensity 0, so it adds no light) owns the small DYNAMIC map: characters and other
//   non-static casters only, ±dynamicRadius around the player, every frame. A handful of skinned
//   meshes, so it is cheap.
// The two maps darken the same light: a patch of three's `lights_fragment_begin` makes directional
// light 0 multiply both shadows (the darker wins) and skips light 1's own shadow sample. The patch
// only applies when a scene has exactly two directional shadow casters, which only this does.
// The result goes through a narrow smoothstep, so cast shadows read as inked shapes; PCF only
// anti-aliases the edge.
//
// Shadow maps render once per frame whatever the number of views (split screen): the ink pipeline
// arms them for the first colour pass only (beginFrame/endFrame).
import * as THREE from 'three';

const MAX_ANGLE = Math.cos(THREE.MathUtils.degToRad(3));

// Pure: should the static map be re-rendered? `cache` = { cx, cy, cz, dx, dy, dz, valid }.
export function staticShadowStale(cache, focus, dir, refresh) {
  if (!cache.valid) return true;
  const ddx = focus.x - cache.cx, ddz = focus.z - cache.cz, ddy = focus.y - cache.cy;
  if (ddx * ddx + ddz * ddz + ddy * ddy * 0.25 > refresh * refresh) return true;
  const dot = dir.x * cache.dx + dir.y * cache.dy + dir.z * cache.dz;
  return dot < MAX_ANGLE;
}

// Snap a centre to the shadow map's texel grid so the map does not shimmer as it follows.
export function snapToTexels(v, radius, size) {
  const step = (radius * 2) / size;
  return Math.round(v / step) * step;
}

let chunkPatched = false;
export function installShadowChunk() {
  if (chunkPatched) return;
  chunkPatched = true;
  const C = THREE.ShaderChunk;
  const line = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  const before = C.lights_fragment_begin;
  if (!before.includes(line)) { console.warn('[shadows] lights_fragment_begin changed: shadows stay soft and separate'); return; }
  const sample = (k) => `getShadow( directionalShadowMap[ ${k} ], directionalLightShadows[ ${k} ].shadowMapSize, directionalLightShadows[ ${k} ].shadowIntensity, directionalLightShadows[ ${k} ].shadowBias, directionalLightShadows[ ${k} ].shadowRadius, vDirectionalShadowCoord[ ${k} ] )`;
  C.lights_fragment_begin = before.replace(line, /* glsl */ `
		#if ( NUM_DIR_LIGHT_SHADOWS == 2 ) && ( UNROLLED_LOOP_INDEX == 1 )
			// The dynamic companion map: already sampled with light 0; this light is dark.
		#elif ( NUM_DIR_LIGHT_SHADOWS == 2 )
			float inkShadow = min( ${sample(0)}, ${sample(1)} );
			directLight.color *= ( directLight.visible && receiveShadow ) ? smoothstep( 0.35, 0.65, inkShadow ) : 1.0;
		#else
			${line}
		#endif`);
}

// moon: the scene's existing DirectionalLight (castShadow already set). opts: quality.shadows.
export function createShadowSystem({ scene, moon, offset, opts }) {
  installShadowChunk();
  const { staticSize, staticRadius, dynamicSize, dynamicRadius, refresh } = opts;
  const setBox = (light, r, size) => {
    light.castShadow = true;
    light.shadow.mapSize.set(size, size);
    Object.assign(light.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 20, far: 150 });
    light.shadow.camera.updateProjectionMatrix();
    light.shadow.bias = -0.0012;
    light.shadow.normalBias = 0.06;
    light.shadow.autoUpdate = false;
  };
  setBox(moon, staticRadius, staticSize);
  const moonDyn = new THREE.DirectionalLight(0xffffff, 0);
  moonDyn.name = 'moonShadowDynamic';
  setBox(moonDyn, dynamicRadius, dynamicSize);
  moonDyn.shadow.normalBias = 0.03;
  // Added right after the moon so three's light sort (shadow casters first, then scene order)
  // makes the static map directional shadow 0 and this one shadow 1.
  scene.add(moonDyn, moonDyn.target);

  let staticCasters = [];
  const dynamicCasters = [];
  const cache = { cx: 0, cy: 0, cz: 0, dx: 0, dy: 1, dz: 0, valid: false };
  const dir = new THREE.Vector3();
  let refreshes = 0;
  let staticDue = true;
  let hidden = null;
  const far = []; // [perf2] dynamic casters out of the dynamic map's reach this frame

  // The city's casters (every mesh casting a shadow when the world finished building).
  function markStatic(root) {
    staticCasters = [];
    root.traverse((o) => { if (o.castShadow && !o.isLight && !o.isSkinnedMesh) staticCasters.push(o); });
  }
  const isStatic = new WeakSet();

  // Lights carry castShadow too: never toggle those (it would change every lit shader's program).
  function collectDynamic(o) { if (o.castShadow && !o.isLight && !isStatic.has(o)) dynamicCasters.push(o); }
  function setCast(list, on) { for (let i = 0; i < list.length; i++) list[i].castShadow = on; }

  return {
    moon, moonDyn,
    markStatic(root) { markStatic(root); for (const o of staticCasters) isStatic.add(o); },
    invalidate() { cache.valid = false; },
    get refreshes() { return refreshes; },
    get staticCount() { return staticCasters.length; },
    get dynamicCount() { return dynamicCasters.length; },
    // Per frame, before drawing: follow the focus (the player).
    update(focus) {
      dir.copy(offset).normalize();
      if (staticShadowStale(cache, focus, dir, refresh)) {
        const x = snapToTexels(focus.x, staticRadius, staticSize), y = snapToTexels(focus.y, staticRadius, staticSize), z = snapToTexels(focus.z, staticRadius, staticSize);
        moon.target.position.set(x, y, z);
        moon.position.set(x, y, z).add(offset);
        moon.target.updateMatrixWorld();
        moon.updateMatrixWorld();
        Object.assign(cache, { cx: focus.x, cy: focus.y, cz: focus.z, dx: dir.x, dy: dir.y, dz: dir.z, valid: true });
        staticDue = true;
      }
      const x = snapToTexels(focus.x, dynamicRadius, dynamicSize), y = snapToTexels(focus.y, dynamicRadius, dynamicSize), z = snapToTexels(focus.z, dynamicRadius, dynamicSize);
      moonDyn.target.position.set(x, y, z);
      moonDyn.position.set(x, y, z).add(offset);
      moonDyn.target.updateMatrixWorld();
      moonDyn.updateMatrixWorld();
    },
    // Shadow maps can only be drawn inside a renderer.render() call (three's shadow pass needs the
    // render state that call sets up), so the ink pipeline brackets the first colour pass of the
    // frame with beginFrame()/endFrame(): this arms the maps that are due and hides the other kind
    // of caster for that one call. A frame that refreshes the static map leaves the dynamic map as
    // it was (one frame old, invisible in play); every other frame redraws only the dynamic map.
    // Later render calls in the same frame (more views, x-ray) find nothing armed.
    beginFrame(renderer) {
      const sm = renderer.shadowMap;
      if (!sm.enabled) return;
      sm.needsUpdate = true;
      if (!moon.shadow.map || !moonDyn.shadow.map) {
        // The very first frame: create both maps at once (an unset map in three's shadow sampler
        // array is bound as a colour texture, which GL rejects), then redo the static one properly.
        moon.shadow.needsUpdate = true;
        moonDyn.shadow.needsUpdate = true;
        staticDue = true;
        return;
      }
      if (staticDue) {
        staticDue = false;
        refreshes++;
        // Anything casting that is not part of the static city is dynamic (characters join and
        // leave the scene during play), so it is collected here, on the rare static refresh.
        dynamicCasters.length = 0;
        scene.traverseVisible(collectDynamic);
        moon.shadow.needsUpdate = true;
        moonDyn.shadow.needsUpdate = false;
        setCast(dynamicCasters, false);
        hidden = dynamicCasters;
      } else {
        moon.shadow.needsUpdate = false;
        moonDyn.shadow.needsUpdate = true;
        setCast(staticCasters, false);
        hidden = staticCasters;
        // [perf2] Character parts are never frustum-culled (skinned), so three's shadow pass drew
        // every visible character, El car and boat in the city into this ±dynamicRadius map each
        // frame. Only casters near the map's box take part; the rest sit out this one call.
        far.length = 0;
        const t = moonDyn.target.position, reach = dynamicRadius * 1.5 + 4, r2 = reach * reach;
        for (let i = 0; i < dynamicCasters.length; i++) {
          const o = dynamicCasters[i];
          if (!o.castShadow || o.isInstancedMesh) continue;
          const e = o.matrixWorld.elements, dx = e[12] - t.x, dz = e[14] - t.z;
          if (dx * dx + dz * dz > r2) { o.castShadow = false; far.push(o); }
        }
      }
    },
    endFrame() {
      if (hidden) { setCast(hidden, true); hidden = null; }
      if (far.length) { setCast(far, true); far.length = 0; }
    },
  };
}
