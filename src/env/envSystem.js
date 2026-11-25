// The day/night cycle and the weather on screen (design doc 4.5, rendering research section 8).
// world.clock and world.weather (pure) decide; this writes the result into what already exists:
// light colours and intensities, the key light's direction (the cached static shadow map follows
// it, re-rendering only when it has turned 3 degrees: shadows.js), fog colour and density, the sky
// dome's uniforms, rain and snow, wet streets, water, steam, window lights and street lamps, the
// Batsignal by night, and lightning. Never a new light, never a toggled light, never a recompile.
//
// The night in a storm is the pre-overhaul look exactly (look.js NIGHT; tests/unit/envClockWeather).
import * as THREE from 'three';
import { lookAtHour, applyWeather, makeLook, keyDirection, gradePalette } from './look.js';
import { ENV_UNIFORMS } from './surfacePatch.js';
import { lightningFlash, getAccess } from '../ui/accessibility.js'; // [verify] a11y flash reduction

const SNOW_TINT = new THREE.Color(0xefe6cf);
const RAIN_SLANT = [0.18, 0.06];

export function createEnvSystem({ scene, quality, clock, weather, lights, sky, rain, streaks, water, steams = [], signal, backdrop, keyOffset, fogBase }) {
  const look = makeLook();
  const { hemi, key, rim } = lights;
  const KEY_LEN = keyOffset.length();
  const dir = [0, 1, 0];
  const sunDir = [0, 1, 0];
  const c = new THREE.Color();
  const rainTint = rain.uniforms.uColor.value.clone();
  const rainBase = { speed: rain.uniforms.uSpeed.value, len: rain.uniforms.uLen.value, width: rain.uniforms.uWidth.value, opacity: rain.uniforms.uOpacity.value };
  const splashOK = quality.splashes ?? quality.name !== 'potato';
  const surfaceOK = quality.envSurface ?? quality.name !== 'potato';
  const fogBanks = quality.fogBanks ?? quality.name !== 'potato';
  const local = { fog: 0, snow: 0 };
  let flash = 0, flashT = 0, keyBase = 2.4, extraFlash = 0;
  const set = (color, arr) => color.setRGB(arr[0], arr[1], arr[2], THREE.SRGBColorSpace);

  // Lightning: the old two-pulse flash (0.26 s), now on the weather's strikes.
  function strike(s) {
    flashT = s.distance < 1800 ? 0.26 : 0.18;
  }
  weather.on((s) => { if (s.kind === 'lightning') strike(s); });

  const windVec = [0, 0];
  const api = {
    look,
    windVec,
    get flash() { return flash; },
    // Per frame. dt: real seconds (0 while photo mode holds time). camPos: the camera (fog banks
    // near the lake follow the viewer).
    update(t, dt, camPos) {
      clock.update(dt);
      weather.update(dt);
      const h = clock.hour;
      const day = clock.daylight;
      lookAtHour(h, look);
      look.day = day;
      applyWeather(look, weather.params, day, surfaceOK ? weather.snowCover : 0);
      // Lake effect: thicker fog near open lake water (a fog bank you can drive into).
      if (fogBanks && camPos) {
        weather.localAt(camPos.x, camPos.z, local);
        const extra = Math.max(0, local.fog - weather.params.fog);
        look.fogMul *= 1 + 2.2 * extra;
      }
      // Lights: colours and intensities only.
      set(hemi.color, look.hemiSky); set(hemi.groundColor, look.hemiGround); hemi.intensity = look.hemiI;
      set(key.color, look.key); keyBase = look.keyI;
      set(rim.color, look.rim); rim.intensity = look.rimI;
      // Key light direction: the moon by night, the sun by day (the swap happens at dawn and dusk
      // while the key light is dim). The shadow system reads keyOffset.
      const sunUp = clock.sun > 0;
      keyDirection(h, sunUp, dir);
      keyOffset.set(dir[0] * KEY_LEN, dir[1] * KEY_LEN, dir[2] * KEY_LEN);
      keyDirection(h, true, sunDir);
      // Fog and the cleared background (the ink pass's "sky" pixels outside the dome).
      set(scene.fog.color, look.fog);
      scene.fog.density = fogBase * look.fogMul;
      if (scene.background?.isColor) scene.background.copy(scene.fog.color);
      // Sky dome.
      const u = sky.uniforms;
      set(u.uTop.value, look.skyTop); set(u.uHorizon.value, look.skyHorizon); set(u.uGlow.value, look.skyGlow);
      u.uCloudCut.value = look.cloudCut;
      u.uStars.value = look.starsVis;
      u.uDay.value = day;
      u.uSunDir.value.set(sunDir[0], sunDir[1], sunDir[2]);
      // The Batsignal shines at night only (it fades out through dawn and back at dusk).
      const sig = Math.max(0, Math.min(1, (0.6 - day) / 0.3));
      sky.setSignalOn(sig);
      if (signal) signal.group.visible = sig > 0.02;
      // Lights on in the city: windows and lamps (each with its own threshold).
      ENV_UNIFORMS.uEnvWindows.value = look.windows;
      ENV_UNIFORMS.uEnvLamps.value = look.lamps;
      ENV_UNIFORMS.uEnvWet.value = surfaceOK ? weather.wetness : 0;
      ENV_UNIFORMS.uEnvSnow.value = surfaceOK ? weather.snowCover : 0;
      // Rain or snow: one particle mesh, two looks.
      const p = weather.params;
      const snowK = p.snow / Math.max(1e-3, p.snow + p.rain);
      const amount = Math.max(p.rain, p.snow);
      rain.setDensity(amount < 0.03 ? 0 : 0.15 + 0.85 * amount);
      const ru = rain.uniforms;
      ru.uSpeed.value = rainBase.speed * (1 - 0.9 * snowK);
      ru.uLen.value = rainBase.len * (1 - 0.75 * snowK);
      ru.uWidth.value = rainBase.width * (1 + 2.2 * snowK);
      ru.uOpacity.value = rainBase.opacity * (1 + 0.8 * snowK);
      ru.uColor.value.copy(rainTint).lerp(SNOW_TINT, snowK);
      const wx = Math.cos(weather.windDir), wz = Math.sin(weather.windDir);
      const slant = 0.18 + 0.5 * p.wind * (1 + snowK);
      ru.uSlant.value.set(RAIN_SLANT[0] * (1 - p.wind) + wx * slant * p.wind, RAIN_SLANT[1] * (1 - p.wind) + wz * slant * p.wind);
      rain.setSplashes(splashOK && p.rain > 0.2 && snowK < 0.5);
      rain.splashUniforms.uRate.value = 0.6 + 1.0 * p.rain;
      // Wet streets: the reflection streaks need water and lit lamps.
      if (streaks) streaks.material.uniforms.uWet.value = Math.min(1, weather.wetness * 1.1) * (0.25 + 0.75 * look.lamps);
      // Water: its colour by time, the sky in it, the key light's glitter path.
      if (water) {
        const wu = water.uniforms;
        set(wu.uWater.value, look.water);
        set(wu.uSky.value, look.skyHorizon);
        set(wu.uFog.value, look.fog);
        set(wu.uKeyCol.value, look.key);
        wu.uKeyDir.value.set(sunUp ? sunDir[0] : 0.55, sunUp ? sunDir[1] : 0.42, sunUp ? sunDir[2] : -0.72);
        wu.uDay.value = day;
        wu.uLamps.value = 0.3 + 0.7 * look.lamps;
        wu.uGlint.value = 0.35 * (1 - 0.7 * p.fog) * (0.4 + 0.6 * (1 - p.cloud) + 0.3 * day);
        wu.uWindK.value = 0.5 + p.wind;
      }
      // Wind on capes (hero.js reads world.windVec): a steady push plus gusts.
      const gust = weather.gust(t);
      windVec[0] = wx * (p.wind * 3 + gust * 2.5); windVec[1] = wz * (p.wind * 3 + gust * 2.5);
      // Steam drifts with the wind.
      const ws = 0.3 + 1.2 * p.wind;
      for (const s of steams) s.setWind(0.6 * (1 - p.wind) + wx * ws * p.wind, 0.25 * (1 - p.wind) + wz * ws * p.wind);
      // Lightning flash (the finale's flash path: world.setFlash and the ink's uFlash).
      if (flashT > 0) flashT -= dt;
      flash = lightningFlash(flashT, !!getAccess().flashReduce); // [verify] a11y: one soft swell under flash reduction (was two hard strobes always)
      const k = Math.max(flash, extraFlash);
      u.uFlashSky.value = k;
      key.intensity = keyBase + 9 * k;
      backdrop?.userData?.setFlash?.(k);
      return look;
    },
    // The key light's resting intensity this frame (flashes add on top).
    get keyBase() { return keyBase; },
    // A flash from elsewhere (world.setFlash: the finale, tests), on top of lightning.
    setExtraFlash(k) { extraFlash = k; },
    // The district palette graded by the time of day (comicPalette.paletteAt output, in place).
    gradePalette(pal) {
      const day = clock.daylight;
      const h = clock.hour;
      const warm = Math.max(0, 1 - Math.abs(h - 18.3) / 1.5) + Math.max(0, 1 - Math.abs(h - 6.3) / 1.2) * 0.6;
      return gradePalette(pal, day * (1 - 0.6 * warm), warm);
    },
  };
  return api;
}
