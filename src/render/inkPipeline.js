import * as THREE from 'three';
import { registerToggle } from '../dev/perfToggles.js'; // [perf3]
import { PALETTE } from '../config/palette.js';
import { LAYER_FX, LAYER_XRAY } from './layers.js';
import { createPassStats } from './passStats.js';
import { createSkinCuller } from './skinCull.js'; // [perf2]
import { installMrtNormals, prepareInkMaterials, INK_VIEWPORT } from './mrtNormals.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tNormal;
uniform vec2 uTexel;
uniform float uNear, uFar, uTime, uFlash, uDetective, uHalftone, uHalftoneAmount;
uniform float uWobble, uHatch, uMidDots, uSkyDots, uColorEdges, uMisreg, uPaletteAmt, uImpact, uImpactSoft, uPaperTex, uFilter;
uniform vec2 uImpactCenter;
uniform vec3 uPalette[6];
uniform vec3 uInk, uPaper, uDetectiveTint, uAccent;
// [env] Upper-tier screen-space light (quality.ao / quality.contact / quality.ssr; defines, so the
// tiers without them compile none of it). uProj: projection x/y scale; uViewUp and uKeyView: the
// world's up and the key light's direction in view space; uWet: street wetness 0..1.
uniform vec2 uProj;
uniform vec3 uViewUp, uKeyView;
uniform float uWet, uEnvLit;
varying vec2 vUv;
// [perf3] The scene may fill only the bottom-left uUvScale of its targets (a dynamic-resolution step
// renders into a sub-rect instead of reallocating them): screen uv in, target uv out, clamped to
// the last drawn texel the way CLAMP_TO_EDGE clamps a full target (identical at scale 1).
uniform vec2 uUvScale, uUvMax;
vec2 inkUv(vec2 uv) { return min(uv * uUvScale, uUvMax); }
vec4 sColor(vec2 uv) { return texture2D(tColor, inkUv(uv)); }
vec4 sDepth(vec2 uv) { return texture2D(tDepth, inkUv(uv)); }
vec4 sNormal(vec2 uv) { return texture2D(tNormal, inkUv(uv)); }

float viewDepth(vec2 uv) { return -perspectiveDepthToViewZ(sDepth(uv).x, uNear, uFar); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Mirrors snapColor() in src/render/comicPalette.js.
vec3 snapPalette(vec3 c, float amount) {
  float L = luma(c);
  if (amount <= 0.0 || L < 0.02) return c;
  vec3 cn = c / max(L, 1e-3);
  vec3 best = cn; float bd = 1e9;
  for (int i = 0; i < 6; i++) {
    vec3 pn = uPalette[i] / max(luma(uPalette[i]), 1e-3);
    vec3 d = cn - pn;
    float dd = dot(d, d);
    if (dd < bd) { bd = dd; best = pn; }
  }
  // Saturated accents (signs, the Joker's suit, trophies) keep their own colour.
  float sat = (max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b))) / max(max(c.r, max(c.g, c.b)), 1e-3);
  float k = amount * clamp((L - 0.02) / 0.06, 0.0, 1.0) * (1.0 - smoothstep(0.45, 0.7, sat));
  return mix(c, best * L, k);
}

#if defined( INK_AO ) || defined( INK_SSR ) || defined( INK_CONTACT )
// View-space position of a pixel from its uv and view depth.
vec3 viewPos(vec2 uv, float d) { vec2 n = uv * 2.0 - 1.0; return vec3(n.x * d / uProj.x, n.y * d / uProj.y, -d); }
vec2 toUv(vec3 p) { return vec2(p.x * uProj.x / -p.z, p.y * uProj.y / -p.z) * 0.5 + 0.5; }
#endif

void main() {
  vec2 frag = gl_FragCoord.xy;
  // Boiling line: sample positions drift a little and re-roll 8 times a second.
  vec2 uvE = vUv;
  if (uWobble > 0.0) {
    vec2 bp = frag / 90.0 + floor(uTime * 8.0) * 17.13;
    uvE += (vec2(vnoise(bp), vnoise(bp + 31.7)) - 0.5) * uTexel * 2.2 * uWobble;
  }

  // Depth edges from the Laplacian of inverse depth: 1/z is linear across any plane in screen
  // space, so flat floors seen at grazing angles produce no false lines.
  float dc = viewDepth(uvE);
  float ic = 1.0 / dc;
  float lap = 0.0;
  vec3 gxN = vec3(0.0), gyN = vec3(0.0);
  // A wider kernel close to the camera gives near silhouettes a bolder brush line.
  vec2 texel = uTexel * mix(1.6, 1.0, smoothstep(6.0, 28.0, dc));
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 uv = uvE + vec2(float(i), float(j)) * texel;
      float kx = float(i) * (j == 0 ? 2.0 : 1.0);
      float ky = float(j) * (i == 0 ? 2.0 : 1.0);
      lap += 1.0 / viewDepth(uv);
#ifndef NORMALS_FROM_DEPTH
      vec3 n = sNormal(uv).xyz * 2.0 - 1.0;
      gxN += n * kx; gyN += n * ky;
#endif
    }
  }
  lap -= 9.0 * ic;
  // Brush weight: near silhouettes also test a ring twice as wide, so outlines swell.
  float thick = 0.0;
  if (dc < 35.0) {
    vec2 t2 = texel * 2.0;
    float m = max(max(abs(1.0 / viewDepth(uvE + vec2(t2.x, 0.0)) - ic), abs(1.0 / viewDepth(uvE - vec2(t2.x, 0.0)) - ic)),
                  max(abs(1.0 / viewDepth(uvE + vec2(0.0, t2.y)) - ic), abs(1.0 / viewDepth(uvE - vec2(0.0, t2.y)) - ic)));
    thick = smoothstep(0.25, 0.5, m / ic) * (1.0 - smoothstep(20.0, 35.0, dc));
  }
  float depthEdge = max(smoothstep(0.12, 0.3, abs(lap) / ic), thick);
  // Creases are a thinner pen line.
#ifdef NORMALS_FROM_DEPTH
  // No normal target (potato, low): a fold between two planes bends 1/z without a jump, so the same
  // Laplacian finds it in a lower band than a silhouette.
  float normalEdge = smoothstep(0.03, 0.08, abs(lap) / ic) * 0.8;
#else
  float normalEdge = smoothstep(0.7, 1.3, length(gxN) + length(gyN)) * 0.8;
#endif
  float edge = max(depthEdge, normalEdge) * (1.0 - smoothstep(70.0, 180.0, dc));

  // Colour, with a hair of print misregistration.
  vec3 col = sColor(vUv).rgb;
  bool skyPx = sDepth(vUv).x >= 1.0;
#ifdef INK_SSR
  // Wet-street reflections (the "ray tracing" of this project): a screen-space ray march from
  // up-facing wet ground that accepts only bright hits (signs, windows, lamps), posterised to two
  // levels and cut into horizontal dashes, so neon spills onto the street as painted streaks.
  if (uWet > 0.02 && !skyPx && dc < 110.0) {
    vec3 N = normalize(sNormal(vUv).xyz * 2.0 - 1.0);
    if (dot(N, uViewUp) > 0.92) {
      vec3 P = viewPos(vUv, dc);
      vec3 R = reflect(normalize(P), N);
      vec3 q = P;
      float stepL = 0.35 + dc * 0.02;
      vec3 hitCol = vec3(0.0);
      vec2 hitUv = vUv;
      float hit = 0.0;
      for (int i = 0; i < 16; i++) {
        q += R * stepL;
        stepL *= 1.22;
        if (q.z > -0.2) break;
        vec2 uv2 = toUv(q);
        if (uv2.x < 0.0 || uv2.x > 1.0 || uv2.y < 0.0 || uv2.y > 1.0) break;
        float sd = viewDepth(uv2);
        float behind = -q.z - sd;
        if (behind > 0.05 && behind < 3.0 + stepL) {
          // A watery wobble along the streak: each scanline band samples a little to the side.
          uv2.x += (fract(sin(floor(frag.y / 3.0) * 78.233) * 43758.5453) - 0.5) * 0.012;
          hitCol = sColor(uv2).rgb; hitUv = uv2; hit = 1.0 - float(i) / 16.0; break;
        }
      }
      float lum = luma(hitCol);
      float bright = step(0.5, lum) * hit;
      // [polish2] Only lit AREAS reflect (a window, a sign, a lamp's glow): a bright hit a pixel or
      // two wide is a character's rim light or an edge highlight, not a light source. Those used
      // to be accepted, which put teal dashes on a wet roof beside the hero's own boots (the
      // polish list's "teal hatched artefact under the hero's feet"): the ray from the roof at
      // his feet meets his rim-lit legs within a metre. The neighbours
      // on both diagonals 3 px out must be lit as well (four more reads, on bright hits only).
      if (bright > 0.0) {
        vec2 nb = uTexel * 3.0, nc = vec2(nb.x, -nb.y);
        float around = min(min(luma(sColor(hitUv + nb).rgb), luma(sColor(hitUv - nb).rgb)), min(luma(sColor(hitUv + nc).rgb), luma(sColor(hitUv - nc).rgb)));
        bright *= step(0.3, around);
      }
      // Thin horizontal pen strokes with gaps (every other scanline band, broken along x).
      float band = floor(frag.y / 2.0);
      float gap = step(0.5, fract(band * 0.5)) * step(0.3, fract(sin(band * 12.9898 + floor(frag.x / 17.0) * 4.1) * 43758.5453));
      vec3 refl = hitCol / max(lum, 1e-3) * (lum > 0.85 ? 0.8 : 0.45); // two levels
      float fadeD = 1.0 - smoothstep(60.0, 110.0, dc);
      col += refl * bright * gap * uWet * fadeD * 0.75 * uEnvLit;
    }
  }
#endif
  if (uMisreg > 0.0) {
    vec2 o = uTexel * 1.1 * uMisreg;
    col.r = mix(col.r, sColor(vUv + vec2(o.x, o.y * 0.5)).r, 0.6);
    col.b = mix(col.b, sColor(vUv - vec2(o.x, o.y * 0.5)).b, 0.6);
  }
  // Ink where flat colours meet (window frames, signs, road paint), close to the camera.
  if (uColorEdges > 0.0 && dc < 90.0) {
    float lx = luma(sColor(vUv + vec2(uTexel.x, 0.0)).rgb) - luma(sColor(vUv - vec2(uTexel.x, 0.0)).rgb);
    float ly = luma(sColor(vUv + vec2(0.0, uTexel.y)).rgb) - luma(sColor(vUv - vec2(0.0, uTexel.y)).rgb);
    float ce = smoothstep(0.16, 0.32, abs(lx) + abs(ly)) * (1.0 - smoothstep(30.0, 90.0, dc)) * 0.6 * uColorEdges;
    edge = max(edge, ce);
  }
  col = snapPalette(col, uPaletteAmt);
  float L = pow(max(luma(col), 0.0), 1.0 / 2.2);

  vec2 cell = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / uHalftone;
  // Sky: nothing wrote depth here (the far pass keeps the backdrop just short of 1.0, see renderFar).
  bool sky = sDepth(vUv).x >= 1.0;
  float nearK = 1.0 - smoothstep(25.0, 80.0, dc);
  // Shadows: cross-hatching up close, Ben-Day dots further out (never both at full strength).
  float hatchZone = smoothstep(0.2, 0.1, L) * nearK * uHatch;
#if defined( INK_AO ) || defined( INK_CONTACT )
  float inkOcc = 0.0;
  if (!sky && dc < 90.0) {
#ifdef INK_AO
    // Ambient occlusion from depth (8 taps on a ring 0.7 m wide in the world): how much nearby
    // geometry stands in front of this pixel. Never multiplied into the colour: it becomes ink.
    // [polish2] Occluders are measured above this pixel's own surface (along its normal), not by
    // raw depth: seen at a steep pitch a flat roof's nearer pixels are all "in front" in depth,
    // so half the ring counted and the whole floor went to hatching (the other half of the
    // polish list's wet-roof artefact). A tap now counts when it stands 6 cm or more proud of the
    // tangent plane, within 1.6 m.
    float rad = 0.7 * uProj.y / dc * 0.5;
    float occ = 0.0;
    vec3 Na = normalize(sNormal(vUv).xyz * 2.0 - 1.0);
    vec3 Pa = viewPos(vUv, dc);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + hash(frag) * 0.6;
      vec2 o = vec2(cos(a), sin(a)) * rad * (0.5 + 0.5 * fract(float(i) * 0.618));
      o.x *= uTexel.x / uTexel.y;
      float sd = viewDepth(vUv + o);
      vec3 dlt = viewPos(vUv + o, sd) - Pa;
      occ += step(0.06, dot(Na, dlt)) * (1.0 - smoothstep(0.8, 1.6, length(dlt)));
    }
    inkOcc = max(inkOcc, occ / 8.0);
#endif
#ifdef INK_CONTACT
    // Contact shadow: a short march toward the key light; anything in the way within 0.6 m.
    vec3 Nc = normalize(sNormal(vUv).xyz * 2.0 - 1.0);
    if (dc < 18.0 && dot(Nc, normalize(uKeyView)) > 0.15) {
      vec3 P0 = viewPos(vUv, dc);
      vec3 q = P0 + Nc * (0.04 + dc * 0.006) + normalize(uKeyView) * 0.04;
      for (int i = 0; i < 10; i++) {
        q += normalize(uKeyView) * 0.06;
        float sd = viewDepth(toUv(q));
        float behind = -q.z - sd;
        if (behind > 0.03 + dc * 0.004 && behind < 0.4) { inkOcc = max(inkOcc, 0.75 * (1.0 - smoothstep(12.0, 18.0, dc))); break; }
      }
    }
#endif
  }
  // Quantised into the ink: an occluded corner gets a hatch band, never a grey smudge.
  hatchZone = max(hatchZone, step(0.42, inkOcc) * nearK * max(uHatch, 0.6) * (1.0 - smoothstep(0.28, 0.45, L)));
#endif
  float r = (0.3 * smoothstep(0.24, 0.15, L) + 0.12 * smoothstep(0.1, 0.04, L)) * (1.0 - smoothstep(60.0, 150.0, dc)) * uHalftoneAmount * (1.0 - hatchZone * 0.8);
  float dotMask = 1.0 - smoothstep(r - 0.06, r + 0.06, length(fract(cell) - 0.5));
  col = mix(col, uInk, dotMask * step(0.001, r) * 0.9);
  if (hatchZone > 0.0) {
    vec2 hp = frag + (uWobble > 0.0 ? vec2(vnoise(frag / 40.0 + floor(uTime * 8.0)) * 1.5, 0.0) : vec2(0.0));
    float s = uHalftone * 0.9;
    float h1 = 1.0 - smoothstep(0.12, 0.28, abs(fract((hp.x + hp.y) / s) - 0.5));
    float h2 = 1.0 - smoothstep(0.12, 0.28, abs(fract((hp.x - hp.y) / s) - 0.5));
    float hatch = max(h1, h2 * smoothstep(0.1, 0.05, L)) * hatchZone;
    col = mix(col, uInk, hatch * 0.75);
  }
  // Mid tones: a light dot tint of the surface's own hue.
  float mid = smoothstep(0.18, 0.26, L) * (1.0 - smoothstep(0.42, 0.55, L)) * (1.0 - smoothstep(50.0, 120.0, dc)) * uMidDots;
  if (mid > 0.0 && !sky) {
    float rm = 0.22 * mid;
    float mm = 1.0 - smoothstep(rm - 0.06, rm + 0.06, length(fract(cell) - 0.5));
    col = mix(col, col * 0.62, mm);
  }
  // Sky: big dots grading toward the horizon.
  if (sky && uSkyDots > 0.0) {
    float rs = 0.3 * clamp(1.2 - vUv.y * 1.4, 0.0, 1.0) * uSkyDots;
    float sm = 1.0 - smoothstep(rs - 0.06, rs + 0.06, length(fract(cell / 2.6) - 0.5));
    col = mix(col, col * 0.72, sm * step(0.001, rs));
  }

  vec3 line = uInk;
  if (uDetective > 0.0) {
    vec3 det = uDetectiveTint * (0.08 + 0.9 * L);
    det *= 0.88 + 0.12 * sin(frag.y * 1.2 + uTime * 6.0);
    col = mix(col, det, uDetective);
    line = mix(line, uDetectiveTint * 1.6, uDetective);
  }
  col = mix(col, line, edge);
  if (uFlash > 0.0) col = mix(col, (L > 0.08 && edge < 0.5) ? uPaper : uInk, uFlash);

  // Impact frame: black and white ink with radial speed lines out from the hit. Soft mode keeps
  // the lines over a pale paper vignette and never inverts (no flashing).
  if (uImpact > 0.0) {
    vec2 d = (vUv - uImpactCenter) * vec2(uTexel.y / uTexel.x, 1.0);
    float ang = atan(d.y, d.x);
    float rays = step(0.8, fract(ang * 9.549 + hash(vec2(floor(ang * 30.0), 1.0)) * 0.5)) * smoothstep(0.1, 0.45, length(d));
    if (uImpactSoft > 0.5) {
      vec3 pale = mix(col, uPaper, smoothstep(0.35, 0.95, length(d)) * 0.55);
      col = mix(col, mix(pale, uInk, rays * 0.6), uImpact);
    } else {
      vec3 bw = mix(uInk, uPaper, step(0.22, L));
      bw = mix(bw, uInk, edge);
      col = mix(col, mix(bw, uInk, rays * 0.9), uImpact);
    }
  }

  // Photo-mode filters (0 = the normal ink look). Uniform-driven, so no new shader program.
  if (uFilter > 0.5) {
    float Lf = pow(max(luma(col), 0.0), 1.0 / 2.2);
    if (uFilter < 1.5) {
      // Noir: black, white and one accent colour (the crimson).
      float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
      float red = smoothstep(0.35, 0.6, (mx - mn) / max(mx, 1e-3)) * step(max(col.g, col.b), col.r * 0.7);
      vec3 bw = mix(uInk, uPaper, smoothstep(0.18, 0.42, Lf));
      col = mix(mix(bw, uAccent * (0.35 + 0.9 * Lf), red), uInk, edge);
    } else if (uFilter < 2.5) {
      // Pop: loud colour and big dots.
      vec3 gl = vec3(luma(col));
      col = clamp(gl + (col - gl) * 1.9, 0.0, 1.0) * 1.12;
      vec2 pc = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / (uHalftone * 2.2);
      float pr = 0.34 * smoothstep(0.15, 0.7, Lf);
      float pd = 1.0 - smoothstep(pr - 0.05, pr + 0.05, length(fract(pc) - 0.5));
      col = mix(col, col * 0.45, pd * 0.8);
    } else {
      // Sepia.
      vec3 s = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
      col = mix(col, s, 0.92);
    }
  }

  // Paper: fibres, a slow grain, and warm paper white in the highlights.
  if (uPaperTex > 0.0) {
    float fib = vnoise(frag * vec2(0.9, 0.12)) * 0.5 + vnoise(frag * 0.35) * 0.5;
    col *= 0.965 + 0.05 * fib;
    col = mix(col, uPaper, smoothstep(0.8, 1.0, L) * 0.35);
  }
  col *= 0.96 + 0.04 * hash(floor(frag / 2.0) + floor(uTime * 6.0));
  vec2 v = vUv - 0.5;
  col *= 1.0 - 0.72 * dot(v, v);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;


// ---------------------------------------------------------------------------------------------
// The pipeline. Per frame:
//   1. shadow maps, once, whatever the number of views (scene.userData.shadows, see shadows.js);
//   2. per view: the far pass (painted horizon) then the colour pass into the view's own target,
//      which also writes view normals as a second attachment on 'mrt' tiers (mrtNormals.js);
//   3. per view: the ink quad, drawn into that view's viewport + scissor rect of the canvas;
//   4. per view, in detective vision: x-ray silhouettes over the finished frame.
// There is no separate normal pass any more: 'mrt' tiers write normals in the colour pass, and
// 'depth' tiers (potato, low) take creases from the depth buffer alone.
//
// Every skinned mesh's skeleton is computed and uploaded once per frame, not once per render call:
// three keys that work on renderer.info.render.frame, which each renderer.render() bumps, so the
// pipeline pins it to one value for every call of a frame (see draw() below).
//
// Views (split screen, contract 4.4): ink.createView() makes a view that owns its render targets
// and per-view uniforms; ink.render(scene, views, time) draws each into its rect. With one
// full-screen view (ink.render(scene, camera, time), the old signature) the output is unchanged.
// ---------------------------------------------------------------------------------------------

// rect: [x, y, w, h] as fractions of the canvas, origin bottom-left (GL convention). Pure.
export function viewPixelRect(rect, width, height, out = [0, 0, 0, 0]) {
  const x0 = Math.round(rect[0] * width), y0 = Math.round(rect[1] * height);
  const x1 = Math.round((rect[0] + rect[2]) * width), y1 = Math.round((rect[1] + rect[3]) * height);
  out[0] = x0; out[1] = y0; out[2] = Math.max(1, x1 - x0); out[3] = Math.max(1, y1 - y0);
  return out;
}

// Side-by-side (landscape) or stacked (portrait) rects for n local views (1 or 2), with a gutter
// of `gutterPx` drawing-buffer pixels between them that reads as a comic panel border. Pure.
export function splitRects(n, width, height, gutterPx = 4, sideBySide = width >= height) {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (sideBySide) {
    const g = gutterPx / width / 2;
    return [[0, 0, 0.5 - g, 1], [0.5 + g, 0, 0.5 - g, 1]];
  }
  const g = gutterPx / height / 2;
  return [[0, 0.5 + g, 1, 0.5 - g], [0, 0, 1, 0.5 - g]];
}

export function createInkPipeline(renderer, quality, { gpuTime = false } = {}) {
  const mrt = quality.normals !== 'depth';
  if (mrt) installMrtNormals();
  // Colour target: half float where the browser can render to it, else 8-bit. 'u8' tiers use an
  // sRGB 8-bit target on purpose (half the bandwidth; blending stays linear, darks keep precision).
  const floatOK = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const u8 = quality.colorTarget === 'u8' || !floatOK;
  const type = u8 ? THREE.UnsignedByteType : THREE.HalfFloatType;
  const srgb = quality.colorTarget === 'u8';

  function makeTarget() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type, count: mrt ? 2 : 1, colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace });
    // The normal attachment is data, never colour-managed.
    if (mrt) { rt.textures[1].colorSpace = THREE.NoColorSpace; rt.textures[1].name = 'inkNormals'; }
    rt.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType);
    return rt;
  }

  // Shared ink uniforms (comic weights, palette, flash, detective...): one set for every view.
  // The per-view ones (targets, texel size, near/far) are swapped in before each view's quad.
  const uniforms = {
    tColor: { value: null },
    tDepth: { value: null },
    tNormal: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uUvScale: { value: new THREE.Vector2(1, 1) }, uUvMax: { value: new THREE.Vector2(1, 1) }, // [perf3]
    uNear: { value: 0.1 },
    uFar: { value: 1000 },
    uTime: { value: 0 },
    uFlash: { value: 0 },
    uDetective: { value: 0 },
    uHalftone: { value: 5 },
    uHalftoneAmount: { value: 1 },
    uInk: { value: new THREE.Color(PALETTE.ink) },
    uPaper: { value: new THREE.Color(PALETTE.paper) },
    uDetectiveTint: { value: new THREE.Color(PALETTE.detective) },
    uAccent: { value: new THREE.Color(PALETTE.crimson) },
    uFilter: { value: 0 },
    uWobble: { value: 0 }, uHatch: { value: 0 }, uMidDots: { value: 0 }, uSkyDots: { value: 0 },
    uColorEdges: { value: 0 }, uMisreg: { value: 0 }, uPaletteAmt: { value: 0 }, uPaperTex: { value: 0 },
    uImpact: { value: 0 }, uImpactSoft: { value: 0 }, uImpactCenter: { value: new THREE.Vector2(0.5, 0.5) },
    uPalette: { value: Array.from({ length: 6 }, () => new THREE.Color(0.5, 0.5, 0.5)) },
    // [env] Upper-tier screen-space light (see the shader).
    uProj: { value: new THREE.Vector2(1, 1) }, uViewUp: { value: new THREE.Vector3(0, 1, 0) }, uKeyView: { value: new THREE.Vector3(0, 1, 0) },
    uWet: { value: 0 }, uEnvLit: { value: 1 },
  };
  // [env] Which upper-tier effects this session compiles (quality flags, fixed at boot).
  const envDefines = {};
  if (quality.ao && mrt) envDefines.INK_AO = '';
  if (quality.contact && mrt) envDefines.INK_CONTACT = '';
  if (quality.ssr && mrt) envDefines.INK_SSR = '';
  const keyWorld = new THREE.Vector3(0, 1, 0);
  const makeQuad = (defines) => new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, defines });
  const quadMat = makeQuad(mrt ? { ...envDefines } : { NORMALS_FROM_DEPTH: '' });
  // perfBench's "creases from depth" ablation on mrt tiers; built on first use.
  let quadDepthMat = mrt ? null : quadMat;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat);
  quad.frustumCulled = false;
  const quadScene = new THREE.Scene();
  quadScene.add(quad);
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  let canvasW = 1, canvasH = 1, pixelRatio = 1;
  const views = [];
  // [perf3] A view's targets are only reallocated when it grows past them or shrinks below half
  // of them; a dynamic-resolution step (5 % of the scale) renders into the bottom-left w x h of the
  // existing targets instead (viewport + scissor), and the ink quad reads that sub-rect. Every step
  // used to reallocate the colour, normal and depth targets: a 4-36 ms frame here, more on a weak
  // machine, each time the scale moved.
  let subRect = true;
  registerToggle('dynresSubRect', (on) => { subRect = on; for (const v of views) { v.cw = 0; v.w = 0; fitView(v); } });
  function fitView(v) {
    const bw = Math.max(1, Math.floor(canvasW * pixelRatio)), bh = Math.max(1, Math.floor(canvasH * pixelRatio));
    viewPixelRect(v.rect, bw, bh, v.px);
    if (v.w !== v.px[2] || v.h !== v.px[3]) {
      v.w = v.px[2]; v.h = v.px[3];
      const fits = subRect && v.w <= v.cw && v.h <= v.ch && v.w * 2 > v.cw && v.h * 2 > v.ch;
      if (!fits) { v.cw = v.w; v.ch = v.h; v.target.setSize(v.w, v.h); }
      v.target.viewport.set(0, 0, v.w, v.h);
      v.target.scissor.set(0, 0, v.w, v.h);
    }
  }
  // A view: its camera, its rect of the canvas ([x, y, w, h] fractions, origin bottom-left), and
  // its own colour (+normal) and depth targets. The caller keeps camera.aspect matched to the rect.
  function createView({ camera = null, rect = [0, 0, 1, 1] } = {}) {
    const view = { camera, rect: [...rect], target: makeTarget(), px: [0, 0, 1, 1], w: 0, h: 0, cw: 0, ch: 0, overrides: null };
    views.push(view);
    fitView(view);
    return view;
  }
  const mainView = createView();
  function disposeView(view) {
    if (view === mainView) return;
    const i = views.indexOf(view);
    if (i >= 0) views.splice(i, 1);
    view.target.depthTexture?.dispose();
    view.target.dispose();
  }

  // Canvas size in CSS pixels; each view's target follows its rect of the drawing buffer.
  function setSize(width, height) {
    canvasW = width; canvasH = height;
    pixelRatio = renderer.getPixelRatio();
    for (const v of views) fitView(v);
    uniforms.uHalftone.value = 7 * pixelRatio;
  }

  // GPU time and draw calls of each pass (see passStats.js). GPU timing only with ?gputime=1.
  const gl = renderer.getContext();
  const stats = createPassStats(gl, { gpuTime });

  function setComic(c) {
    uniforms.uWobble.value = c.wobble; uniforms.uHatch.value = c.hatch; uniforms.uMidDots.value = c.midDots;
    uniforms.uSkyDots.value = c.skyDots; uniforms.uColorEdges.value = c.colorEdges; uniforms.uMisreg.value = c.misreg;
    uniforms.uPaletteAmt.value = c.palette; uniforms.uPaperTex.value = c.paper;
  }
  function setPalette(a) { for (let i = 0; i < 6; i++) uniforms.uPalette.value[i].setRGB(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]); }
  // Driven every frame by the impact timeline (game.js). Uniform writes only: no new program.
  function setImpact(strength, soft, cx, cy) {
    uniforms.uImpact.value = strength;
    uniforms.uImpactSoft.value = soft ? 1 : 0;
    if (cx !== undefined) uniforms.uImpactCenter.value.set(cx, cy);
  }
  const FILTER_INDEX = { ink: 0, noir: 1, pop: 2, sepia: 3 };
  function setFilter(name) { uniforms.uFilter.value = FILTER_INDEX[name] ?? 0; }

  // Benchmark switches (src/dev/perfBench.js): each drops or swaps a piece of the frame so its cost
  // can be measured on the player's own machine. Never set in normal play.
  //   cachedShadows: skip the shadow maps this frame (they keep last frame's content);
  //   depthNormals: the potato/low crease variant of the ink shader on any tier;
  //   fixedTime: hold the ink pass's time-keyed effects (boiling line, grain) still for screenshots.
  const debug = { cachedShadows: false, skipNormals: false, depthNormals: false, fixedTime: null };

  // ---- the far pass (painted horizon) ----
  // scene.userData.farScene (sky dome, backdrop towers, mist, bridge; world.js) is drawn first with
  // the main camera's pose and screen mapping but a depth row of its own, which squeezes everything
  // from FAR_NEAR to FAR_FAR metres into a thin band of depth just below 1.0 and just behind where
  // the main camera's geometry ends (97% of its far plane). So:
  // - the main camera's far plane can follow the fog (quality.drawDistance) without clipping the
  //   skyline, and the city still draws over the backdrop wherever it is in front of it;
  // - backdrop pixels keep a depth below 1.0, so the ink pass's sky test (depth 1, nothing drawn)
  //   treats them as before; the sky dome writes no depth, so it stays sky;
  // - inside the band the backdrop still sorts by distance (about a hundred float32 depth steps
  //   across the towers' 340-980 m).
  const FAR_NEAR = 300, FAR_FAR = 3000;
  const farCam = new THREE.PerspectiveCamera();
  farCam.matrixAutoUpdate = false;
  farCam.matrixWorldAutoUpdate = false;
  const _bg = new THREE.Color();
  const ZERO4 = new Float32Array(4);

  // Every renderer.render() of a frame runs with the same info.render.frame, so three's per-frame
  // caches (geometry updates, skeleton.update() and the bone texture upload) run once a frame.
  let frameKey = 0;
  function draw(scene, camera) {
    renderer.info.render.frame = frameKey - 1;
    renderer.render(scene, camera);
  }

  function clearTarget(target, bg) {
    const prevAlpha = renderer.getClearAlpha();
    renderer.getClearColor(_bg);
    renderer.setRenderTarget(target);
    if (bg?.isColor) renderer.setClearColor(bg, 1);
    renderer.clear(true, true, false);
    renderer.setClearColor(_bg, prevAlpha);
    // The normal attachment starts at 0 (decodes to (-1,-1,-1), the old normal pass's black).
    if (mrt) gl.clearBufferfv(gl.COLOR, 1, ZERO4);
  }

  function renderFar(far, camera) {
    const n = camera.near, f = camera.far;
    // Window depth of main-camera geometry at distance z: (1 - n/z) * f / (f - n).
    const winAt = (z) => (1 - n / z) * f / (f - n);
    const ndc0 = 2 * winAt(0.97 * f) - 1, ndc1 = 1 - 4e-7;
    // NDC depth of the far camera at view distance u: -e10 + e14 / u.
    const e14 = (ndc0 - ndc1) / (1 / FAR_NEAR - 1 / FAR_FAR);
    const e10 = e14 / FAR_FAR - ndc1;
    farCam.projectionMatrix.copy(camera.projectionMatrix);
    farCam.projectionMatrix.elements[10] = e10;
    farCam.projectionMatrix.elements[14] = e14;
    farCam.projectionMatrixInverse.copy(farCam.projectionMatrix).invert();
    farCam.matrixWorld.copy(camera.matrixWorld);
    farCam.matrixWorldInverse.copy(camera.matrixWorldInverse);
    farCam.layers.mask = 0xffffffff;
    stats.begin('far', renderer.info);
    draw(far, farCam);
    stats.end('far', renderer.info);
  }

  function setViewUniforms(v, camera) {
    uniforms.tColor.value = v.target.textures[0];
    uniforms.tDepth.value = v.target.depthTexture;
    uniforms.tNormal.value = mrt ? v.target.textures[1] : null;
    uniforms.uTexel.value.set(1 / v.w, 1 / v.h).multiplyScalar(Math.max(1, pixelRatio * 0.75));
    uniforms.uUvScale.value.set(v.w / v.cw, v.h / v.ch); // [perf3] sub-rect of the targets
    uniforms.uUvMax.value.set((v.w - 0.5) / v.cw, (v.h - 0.5) / v.ch);
    uniforms.uNear.value = camera.near;
    uniforms.uFar.value = camera.far;
    // [env] View-space up and key light for the upper-tier passes.
    uniforms.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    uniforms.uViewUp.value.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    uniforms.uKeyView.value.copy(keyWorld).transformDirection(camera.matrixWorldInverse);
    // Split screen (workstream D1): a view may carry its own detective vision and impact frame
    // (one player's x-ray or critical never covers the other player's half). Uniform writes only.
    const o = v.overrides;
    if (o) {
      uniforms.uDetective.value = o.detective;
      uniforms.uImpact.value = o.impact;
      uniforms.uImpactSoft.value = o.impactSoft;
      uniforms.uImpactCenter.value.set(o.cx, o.cy);
    }
  }

  // [perf2] scene.updateMatrixWorld(), except that a hidden object flagged userData.parkHidden
  // skips its whole subtree (a pooled civilian figure, an El car off its line, the GCPD lobby's
  // goons): thousands of bones and parts no longer recompose every frame while nobody can see
  // them. A pending parent move is remembered (matrixWorldNeedsUpdate), and the first visible
  // frame recomputes the subtree. Objects with their own updateMatrixWorld (cameras, skinned
  // meshes, audio) run it as before. Only flag things whose matrices nothing reads while hidden.
  const baseUpdate = THREE.Object3D.prototype.updateMatrixWorld;
  function updateMatrices(o, force) {
    if (o.updateMatrixWorld !== baseUpdate) { o.updateMatrixWorld(force); return; }
    if (o.matrixAutoUpdate) o.updateMatrix();
    if (o.matrixWorldNeedsUpdate || force) {
      if (o.matrixWorldAutoUpdate === true) {
        if (o.parent === null) o.matrixWorld.copy(o.matrix);
        else o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      }
      o.matrixWorldNeedsUpdate = false;
      force = true;
    }
    const children = o.children;
    for (let i = 0, l = children.length; i < l; i++) {
      const c = children[i];
      if (!c.visible && c.userData.parkHidden) { if (force) c.matrixWorldNeedsUpdate = true; continue; }
      updateMatrices(c, force);
    }
  }

  const skinCull = createSkinCuller();
  const single = [null];
  // render(scene, camera, time) for one full-screen view, or render(scene, views, time).
  function render(scene, cameraOrViews, time) {
    let list;
    if (Array.isArray(cameraOrViews)) list = cameraOrViews;
    else { mainView.camera = cameraOrViews; single[0] = mainView; list = single; }
    uniforms.uTime.value = debug.fixedTime ?? time;
    stats.frameStart();
    frameKey = renderer.info.render.frame + 1;

    // Up-to-date world matrices once for every pass of the frame (then each render skips the walk).
    updateMatrices(scene, false); // [perf2] scene.updateMatrixWorld() minus parked hidden subtrees
    skinCull.tick(scene); // [perf2] skinned characters frustum-cull on a posed-safe sphere (skinCull.js)
    const autoMatrices = scene.matrixWorldAutoUpdate;
    scene.matrixWorldAutoUpdate = false;
    try {
      // 1. Shadows, once per frame: armed for the first colour pass only (see shadows.js). They
      // draw inside that render call, so their GPU time and draw calls count under 'color'.
      const shadows = debug.cachedShadows ? null : scene.userData.shadows;

      // 2. Far + colour per view.
      const far = scene.userData.farScene;
      const { background } = scene;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        const camera = v.camera;
        if (v !== mainView) fitView(v);
        camera.updateMatrixWorld();
        camera.layers.set(0);
        camera.layers.enable(LAYER_FX);
        clearTarget(v.target, background);
        INK_VIEWPORT.value.set(0, 0, v.w, v.h);
        if (far) renderFar(far, camera);
        scene.background = null;
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        if (i === 0) shadows?.beginFrame(renderer);
        stats.begin('color', renderer.info);
        try { draw(scene, camera); } finally { if (i === 0) shadows?.endFrame(); }
        stats.end('color', renderer.info);
        renderer.autoClear = autoClear;
        scene.background = background;
      }

      // 3. Ink quad per view, into its viewport + scissor rect of the canvas.
      renderer.setRenderTarget(null);
      const bw = Math.floor(canvasW * pixelRatio), bh = Math.floor(canvasH * pixelRatio);
      const multi = list.length > 1 || list[0].px[0] !== 0 || list[0].px[1] !== 0 || list[0].px[2] !== bw || list[0].px[3] !== bh;
      if (multi) {
        // Gutters between panels read as comic panel borders: clear the canvas to ink first.
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, canvasW, canvasH);
        const prevAlpha = renderer.getClearAlpha();
        renderer.getClearColor(_bg);
        renderer.setClearColor(uniforms.uInk.value, 1);
        renderer.clear(true, false, false);
        renderer.setClearColor(_bg, prevAlpha);
      }
      quad.material = debug.depthNormals ? (quadDepthMat ??= makeQuad({ NORMALS_FROM_DEPTH: '' })) : quadMat;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        setViewUniforms(v, v.camera);
        if (multi) {
          const r = v.px, pr = pixelRatio;
          renderer.setViewport(r[0] / pr, r[1] / pr, r[2] / pr, r[3] / pr);
          renderer.setScissor(r[0] / pr, r[1] / pr, r[2] / pr, r[3] / pr);
          renderer.setScissorTest(true);
        }
        stats.begin('ink', renderer.info);
        draw(quadScene, quadCam);
        stats.end('ink', renderer.info);

        // 4. X-ray silhouettes over the finished view (detective vision).
        if (uniforms.uDetective.value > 0.01) {
          const camera = v.camera;
          camera.layers.set(LAYER_XRAY);
          scene.background = null;
          renderer.autoClear = false;
          renderer.clearDepth();
          stats.begin('xray', renderer.info);
          draw(scene, camera);
          stats.end('xray', renderer.info);
          renderer.autoClear = true;
          scene.background = background;
          camera.layers.set(0);
          camera.layers.enable(LAYER_FX);
        }
      }
      if (multi) {
        renderer.setScissorTest(false);
        renderer.setViewport(0, 0, canvasW, canvasH);
        renderer.setScissor(0, 0, canvasW, canvasH);
      }
    } finally {
      scene.matrixWorldAutoUpdate = autoMatrices;
    }
  }

  // Material fix-ups for the normal attachment (see mrtNormals.js). Cheap and idempotent.
  function prepare(root) {
    if (!mrt) return;
    prepareInkMaterials(root);
    if (root.userData?.farScene) prepareInkMaterials(root.userData.farScene);
  }

  // Parallel shader compile for everything in `scene` (and its far scene). Scene materials only
  // ever draw into the colour target, whose linear colour space is part of each program's key:
  // compiling against the canvas (sRGB) would build programs that are never used and leave the
  // real ones to compile synchronously on first draw.
  async function compileAsync(scene, camera) {
    prepare(scene);
    renderer.setRenderTarget(mainView.target);
    try {
      await renderer.compileAsync(scene, camera);
      if (scene.userData.farScene) await renderer.compileAsync(scene.userData.farScene, camera);
    } finally { renderer.setRenderTarget(null); }
  }

  // [env] The world's key light direction (toward the light) and the street's wetness.
  function setEnv(dir, wet, lit = 1) { if (dir) keyWorld.copy(dir).normalize(); uniforms.uWet.value = wet; uniforms.uEnvLit.value = lit; }

  return {
    setEnv,
    get envEffects() { return Object.keys(envDefines); },
    uniforms, setSize, render, setComic, setPalette, setImpact, setFilter, compileAsync, prepare, debug, stats,
    createView, disposeView, mainView, views,
    get normals() { return mrt ? 'mrt' : 'depth'; },
    get gpuMs() { return stats.gpuMs; },
  };
}
