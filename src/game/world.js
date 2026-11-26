// Assembles the whole city: geometry, collision, sky, weather, the Batsignal and lighting.
// The city is a list of regions (src/world/regions/): the original city is region 'core', built
// first with its own seed exactly as before; each further region gets its own rng and builds into
// the same collision world, chunk set, halos and street graph (docs/design/world-framework.md).
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { createRng } from '../core/rng.js';
import { SITES } from '../world/mapData.js';
import { REGIONS, WORLD_BOUNDS, WATER_BODIES, districtAt, regionAt, killYAt } from '../world/regions/index.js';
import { assembleCity } from '../world/regions/assemble.js';
import { INTERIOR_ROOMS, insideRoom, roomBounds } from '../world/interiors.js';
import { POCKETS } from '../bruce/pockets.js'; // [light] where the pockets are (the Manor, the cave, the tower)
import { createSkyDome } from '../world/sky.js';
import { createBackdrop } from '../world/skyline.js';
import { createBatsignal } from '../world/batsignal.js';
import { createWater } from '../world/water.js';
import { createLightPool, mergeRoomFills } from '../world/lightPool.js';
import { createRain } from '../render/rain.js';
import { createCityLife } from '../world/cityLife.js';
import { createWetStreaks } from '../world/wetStreaks.js';
import { createSteam } from '../world/steam.js';
import { createShadowSystem } from '../render/shadows.js';
import { createDropShadows } from '../render/dropShadows.js';
// [env] Time of day, weather and the environment object (workstream M, design doc 4.5).
import { createClock } from '../env/clock.js';
import { createWeather } from '../env/weather.js';
import { createEnvSystem } from '../env/envSystem.js';
import { patchCityMaterials, patchStaticHalos } from '../env/surfacePatch.js';
import { deriveEnvironment, makeEnvironment } from '../env/environment.js';
import { createFarLandmarks } from '../world/farLandmarks.js';

export const SIGNAL_LAMP = new THREE.Vector3(SITES.signal.x, SITES.signal.y + 1.3, SITES.signal.z);
export const SIGNAL_POINT = new THREE.Vector3(-110, 210, -215);

// envOpts ([env]): { startHour, weather (start state), weatherSeed, dayMinutes, nightShare }.
export function createWorld(scene, quality, envOpts = {}) {
  const rng = createRng(11);
  scene.background = new THREE.Color(PALETTE.fog);
  // Fog density per quality tier (0.0062 on medium and high, as before); the camera's far plane
  // and chunk culling follow quality.drawDistance, which is matched to it (render/quality.js).
  scene.fog = new THREE.FogExp2(PALETTE.fog, quality.fogDensity ?? 0.0062);

  const { ctx, collision, data, streetGraph } = assembleCity(scene, { rng, quality, createRng });
  // The light pool sees the spots in the chunks around the player (staticBatches.createSpotIndex),
  // refilled in update() whenever the player crosses into another chunk.
  const allSpots = ctx.lights;
  ctx.lights = [];
  ctx.lightIndex.near(0, 0, ctx.lights);

  // Lighting: a low sky fill so walls turned from the moon fall into shadow, a moon that casts
  // shadows near the player, and a cool rim from behind that mostly shows on silhouettes.
  const hemi = new THREE.HemisphereLight(0x6a7fa8, 0x14171f, 0.75);
  scene.add(hemi);
  const MOON = 2.4;
  const moon = new THREE.DirectionalLight(0xa9bde0, MOON);
  const moonOffset = new THREE.Vector3(-30, 60, 22);
  moon.position.copy(moonOffset);
  scene.add(moon, moon.target);
  // Shadow maps (medium and up): a cached static city map on the moon plus a small per-frame
  // character map, inked; drawn once per frame by the ink pipeline (render/shadows.js). The tiers
  // without them get inked drop shadows under characters instead (render/dropShadows.js).
  const shadows = quality.shadows ? createShadowSystem({ scene, moon, offset: moonOffset, opts: quality.shadows }) : null;
  if (shadows) scene.userData.shadows = shadows;
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.1);
  rim.position.set(20, 30, -60);
  scene.add(rim);

  // The painted horizon (sky dome, backdrop towers, mist rings, the bridge) lives in its own small
  // scene that the ink pipeline draws first with a far-reaching camera, so the main camera's far
  // plane can follow quality.drawDistance (the fog) without clipping the skyline. See
  // inkPipeline.js (renderFar) for how its depth stays behind the city and out of the sky test.
  const farScene = new THREE.Scene();
  scene.userData.farScene = farScene;
  const sky = createSkyDome();
  sky.setSignalPoint(SIGNAL_POINT, 34);
  farScene.add(sky.mesh);
  const backdrop = createBackdrop(rng);
  backdrop.name = 'backdrop';
  farScene.add(backdrop);
  // The horizon follows the camera (skyline.js), so its beacons are moved with it in update().
  const beaconHalos = backdrop.userData.beacons.map(([x, y, z]) => {
    const i = ctx.halos.add(x, y, z, PALETTE.crimson, 7);
    ctx.blinkers.push({ i, size: 7, phase: x * 0.01 + z });
    return i;
  });
  for (const [x, y, z] of backdrop.userData.bridgeLamps) ctx.halos.add(x, y, z, PALETTE.sodium, 9);
  // [env] The tall landmarks stay on the skyline past the far plane (src/world/farLandmarks.js).
  const farMarks = createFarLandmarks(collision.boxes, { extras: ctx.world.farShapes }); // [polish] + Wayne Tower's crown
  if (farMarks.mesh) farScene.add(farMarks.mesh);
  if (farMarks.glow) farScene.add(farMarks.glow); // [polish] its lit signature, by night
  const signal = createBatsignal(SIGNAL_LAMP, SIGNAL_POINT);
  scene.add(signal.group);
  const water = createWater(WATER_BODIES);
  scene.add(water.mesh);
  const rain = createRain(quality.rainCount);
  scene.add(rain.mesh);
  // The finale's Batsignal flash, dark until then. Not a light of its own: while its intensity is
  // above zero it borrows the light pool's first slot (finale.js only sets position and intensity),
  // so the number of lights in every lit shader's compile key never changes.
  const flashLight = new THREE.Object3D();
  Object.assign(flashLight, { intensity: 0, color: new THREE.Color(0xfff0d0), distance: 400, decay: 1.2 });
  flashLight.name = 'flashLight';
  scene.add(flashLight);
  // A fixed pool of real point lights (quality.lights: 0/2/4/6/8) shared by the street spots and
  // the interiors' room fills, merged into one broad light per room (see lightPool.js).
  const rooms = Object.values(INTERIOR_ROOMS);
  const fills = mergeRoomFills(ctx.roomFills ?? [], (f) => rooms.find((r) => insideRoom(r, f))?.bounds ?? null);
  const pool = createLightPool(scene, [...ctx.lights, ...fills], quality.lights ?? 4, { flash: flashLight });
  const streaks = createWetStreaks(ctx.reflect, { fogDensity: scene.fog.density });
  streaks.name = 'wetStreaks';
  scene.add(streaks);
  const steamQ = quality.steam ?? { perSource: 5, groundOnly: false };
  const citySteam = ctx.steam.filter((s) => !s.vent);
  const steam = createSteam(steamQ.groundOnly ? citySteam.filter((s) => s.y < 1) : citySteam, { perSource: steamQ.perSource, fogDensity: scene.fog.density });
  steam.mesh.name = 'steam';
  scene.add(steam.mesh);
  // The predator room's hiding vent: pale chemical steam, dense and low, with an inked rim, that
  // stays visible up close (Batman crouches inside it). Same shader, so no extra compile.
  const ventSteam = createSteam(ctx.steam.filter((s) => s.vent), {
    perSource: Math.max(3, steamQ.perSource), fogDensity: scene.fog.density,
    look: { alpha: 0.5, rise: 0.3, drift: 0.2, grow: 1.4, near: [0.8, 2.5], rim: 0.55, pulse: 0.3, color: 0xdcebc6, shade: 0x6a8270 },
  });
  ventSteam.mesh.name = 'ventSteam';
  scene.add(ventSteam.mesh);
  for (const o of [backdrop, streaks, steam.mesh, ventSteam.mesh]) { o.updateMatrix(); o.matrixAutoUpdate = false; }
  // [env] The city's toon materials and static lamps take the time of day and the weather through
  // shared uniforms (src/env/surfacePatch.js): patched now, before anything compiles.
  patchCityMaterials(scene, { surface: quality.envSurface ?? quality.name !== 'potato' });
  patchStaticHalos(scene);
  // Everything casting a shadow by now is the static city: its map is cached (see shadows.js).
  shadows?.markStatic(scene);
  const drops = quality.blobShadows ? createDropShadows(scene, (x, y, z) => collision.groundBelow(x, y, z, 0.3)) : null;
  const life = createCityLife(scene, ctx.halos, rng, { graph: streetGraph, bridges: ctx.world.bridges, bounds: WORLD_BOUNDS, quality, chunks: ctx.chunks, collision });
  let underCover = false;
  // [env] world.clock and world.weather. Night One starts an hour before midnight in a storm
  // (src/game/scenes.js); the weather's schedule is a pure function of its seed and the clock.
  const clock = createClock({ startHour: envOpts.startHour ?? 23, dayMinutes: envOpts.dayMinutes ?? 48, nightShare: envOpts.nightShare ?? 0.7 });
  const lakes = WATER_BODIES.filter((b) => b.kind === 'lake');
  const weather = createWeather({ seed: envOpts.weatherSeed ?? 7, start: envOpts.weather ?? 'storm', clock, lakes, snowScale: envOpts.snowScale ?? 1 });
  if (envOpts.weather) weather.pin(envOpts.weather, { id: 'url', snap: true });
  const env = createEnvSystem({
    scene, quality, clock, weather, lights: { hemi, key: moon, rim }, sky, rain, streaks, water,
    steams: [steam], signal, backdrop, keyOffset: moonOffset, fogBase: scene.fog.density,
  });
  const isCovered = (p) => ctx.world.covers.some((c) => p.x > c.minX && p.x < c.maxX && p.y > c.minY && p.y < c.maxY && p.z > c.minZ && p.z < c.maxZ);
  const envLocal = { fog: 0, snow: 0 };
  const altitudeAt = (p) => { const g = collision.groundBelow(p.x, p.y + 0.5, p.z, 0.3); return Number.isFinite(g) ? Math.max(0, p.y - g) : Math.max(0, p.y); };
  let envT = 0;
  // [light] How far indoors (a core interior room, or anywhere in a pocket: those are interiors
  // through and through) and how far under a deck the player is, eased over about a third of a
  // second so the fill never pops at a doorway. Tables built once; the per-frame tests allocate nothing.
  let indoorK = 0, coverK = 0;
  const roomBoxes = Object.values(INTERIOR_ROOMS).map(roomBounds);
  const pocketOrigins = Object.values(POCKETS).map((p) => p.origin);
  const POCKET_SPAN = 160;
  function focusIndoors(p) {
    for (let i = 0; i < roomBoxes.length; i++) { const b = roomBoxes[i]; if (p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY && p.z >= b.minZ && p.z <= b.maxZ) return true; }
    for (let i = 0; i < pocketOrigins.length; i++) { const o = pocketOrigins[i]; if (Math.abs(p.x - o.x) < POCKET_SPAN && Math.abs(p.z - o.z) < POCKET_SPAN) return true; }
    return false;
  }
  function focusCovered(p) {
    const cs = ctx.world.covers;
    for (let i = 0; i < cs.length; i++) { const c = cs[i]; if (p.x > c.minX && p.x < c.maxX && p.y > c.minY && p.y < c.maxY && p.z > c.minZ && p.z < c.maxZ) return true; }
    return false;
  }

  return {
    collision,
    grapplePoints: ctx.grapple,
    steamSources: ctx.steam, // [move] updraft columns over the bigger stacks (src/traversal/updrafts.js)
    climbables: ctx.climbables,
    roofs: ctx.roofs,
    halos: ctx.halos,
    sky,
    signal,
    rain,
    moon,
    flashLight,
    farScene,
    lightPool: pool,
    shadows,
    data,
    // ---- regions (contract 4.2) ----
    regions: REGIONS,
    bounds: WORLD_BOUNDS,
    regionAt,
    districtAt,
    streetGraph,
    bridges: ctx.world.bridges ?? null,
    covers: ctx.world.covers, // [light] covered volumes (under a deck): the darkness audit visits each
    traffic: life.traffic,
    // True when a body at p has gone under the water (or below the lowest deck) at its x, z. In
    // the core this is the old y < -0.8 test; the river and Lower Gotham sit lower.
    belowWater: (p) => p.y < killYAt(p.x, p.z),
    setFlash(k) { env.setExtraFlash(k); },
    // ---- [env] time of day, weather, environment (design doc 4.5; src/env/*) ----
    clock,
    weather,
    env,
    // [fix1] The dev URL's ?time= / ?weather= (env tools and tests): the story's night pins leave
    // whichever of them was given alone (src/story/storyRuntime.js env.pin).
    devEnv: Object.freeze({ time: Number.isFinite(envOpts.startHour), weather: !!envOpts.weather }),
    // The key light's direction (toward the light, world space) and how many lamps are lit (0..1):
    // the ink pass's upper-tier effects read them (game.js ink.setEnv).
    get keyDir() { return moonOffset; },
    // Wind for capes and loose cloth, [x, z] m/s (hero.envWind), and the gust strength 0..1 for
    // gliding (environment.gust).
    get windVec() { return env.windVec; },
    get lampsOn() { return env.look.lamps; },
    // [light] How strongly the ink pass prints hatching and shadow dots (1 by day, lighter in the dark).
    get toneInk() { return env.look.toneInk; },
    // Lightning's flash this frame (0 or 1): game.js feeds it to the ink pass.
    get flash() { return env.flash; },
    // The district palette graded by the time of day (in place).
    gradePalette: (pal) => env.gradePalette(pal),
    // The environment object for a spot (a player's hero, a camera): fills and returns `out`.
    environmentAt(p, { indoors = false, out = makeEnvironment(), traffic = null, crowd = null } = {}) {
      weather.localAt(p.x, p.z, envLocal);
      return deriveEnvironment({
        clock, weather, district: districtAt(p.x, p.z), region: regionAt(p.x, p.z)?.id ?? null, indoors,
        covered: isCovered(p), altitude: altitudeAt(p),
        local: envLocal, t: envT, traffic, crowd,
      }, out);
    },
    lightSpots: allSpots,
    chunks: ctx.chunks,
    // Chunks drawn this frame ({ key, cx, cz, region, state: 'near' | 'lod', distance }).
    get visibleChunks() { return ctx.chunks.visible; },
    update(t, dt, focus, camera, hero = null) {
      // [env] Clock, weather and the look first: the shadow system below reads the key direction.
      envT += dt;
      const inside = focusIndoors(focus) ? 1 : 0;
      const ease = Math.min(1, dt * 3.5);
      indoorK += (inside - indoorK) * ease;
      coverK += ((focusCovered(focus) ? 1 : 0) - coverK) * ease;
      env.update(t, dt, camera.position, indoorK, coverK);
      farMarks.setTone(scene.fog.color, clock.daylight);
      for (const u of ctx.updaters) u(t);
      life.update(t, dt, hero, camera);
      // Draw distance follows the fog (quality.drawDistance, workstream A); far-LOD past lodDistance.
      ctx.chunks.cull(camera.position.x, camera.position.y, camera.position.z, quality.drawDistance ?? 320, quality.lodDistance ?? 160);
      ctx.lightIndex.near(focus.x, focus.z, ctx.lights);
      if (backdrop.userData.follow(camera.position)) {
        backdrop.userData.beaconsWorld.forEach(([x, y, z], k) => ctx.halos.set(beaconHalos[k], x, y, z));
      }
      // No rain under a deck (Lower Gotham): only touched when the camera crosses in or out, so
      // the interiors' own rain switch (createInteriors) is left alone.
      const cp = camera.position;
      const covered = ctx.world.covers.some((c) => cp.x > c.minX && cp.x < c.maxX && cp.y > c.minY && cp.y < c.maxY && cp.z > c.minZ && cp.z < c.maxZ);
      if (covered !== underCover) { underCover = covered; rain.mesh.visible = !covered; }
      ctx.halos.update();
      sky.update(t, camera.position);
      water.update(t, camera.position);
      // Splashes on whatever the player stands on, hidden while gliding or falling.
      const ground = hero ? collision.groundBelow(hero.pos.x, hero.pos.y + 0.5, hero.pos.z, 0.3) : -Infinity;
      rain.update(t, camera.position, hero && hero.pos.y - ground < 1.5 && ground > killYAt(hero.pos.x, hero.pos.z) ? ground : null);
      steam.update(t);
      ventSteam.update(t);
      signal.update(t);
      pool.update(dt, focus);
      // Shadow boxes follow the player (the static one only when it has moved far enough).
      if (shadows) shadows.update(focus);
      else moon.target.position.copy(focus), moon.position.copy(focus).add(moonOffset);
      drops?.update(dt, camera);
    },
    resize(height, fov) { ctx.halos.resize(height, fov); },
  };
}
