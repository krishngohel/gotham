// Photo mode's post pass (workstream L1, item 7): filters and a stylised focus cue, drawn over the
// photographer's view after the ink pipeline has finished it. Only runs while photo mode is open
// and something is switched on; costs one framebuffer copy and one full-view quad.
//
// The finished view is copied out of the canvas (copyFramebufferToTexture), then redrawn through
// this shader into the same viewport + scissor rect. Depth comes from the view's own ink target
// (ink views keep their depth texture), so focus needs no extra scene pass.
//
// Focus is a comic depth cue, not a lens: out of the focal plane the picture is posterised, its
// lines thin into a fading halftone toward paper, and on 'mrt' tiers it also takes an 8-tap blur.
// The colour maths matches filterRgb()/focusAmount() in photoFilters.js (unit-tested there).
import * as THREE from 'three';
import { FILTER_CODE, FILTER_COLORS, photoPostQuality } from './photoFilters.js';

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const fragmentShader = /* glsl */ `
#include <packing>
uniform sampler2D tScreen;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear, uFar, uFilter, uFocus, uAperture, uDot;
uniform vec3 uInk, uPaper, uAccent, uGoldPaper, uGoldInk, uBpDark, uBpLight, uBpLine, uNeonA, uNeonB, uNeonBase;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float viewDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x;
  if (z >= 1.0) return uFar;
  return -perspectiveDepthToViewZ(z, uNear, uFar);
}
float cocAt(float d) {
  if (uAperture <= 0.0 || uFocus <= 0.0) return 0.0;
  return clamp(abs(1.0 - uFocus / max(d, 0.05)) * uAperture * 1.6, 0.0, 1.0);
}
float dots(vec2 frag, float size, float r) {
  vec2 cell = mat2(0.7071, -0.7071, 0.7071, 0.7071) * frag / size;
  return 1.0 - smoothstep(r - 0.06, r + 0.06, length(fract(cell) - 0.5));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 col = texture2D(tScreen, vUv).rgb;
  float d = viewDepth(vUv);
  float coc = cocAt(d);
#if BLUR_TAPS > 0
  if (coc > 0.02) {
    vec3 acc = col;
    float rad = coc * 7.0 * uDot / 7.0;
    for (int i = 0; i < BLUR_TAPS; i++) {
      float a = float(i) * 6.2831853 / float(BLUR_TAPS);
      acc += texture2D(tScreen, vUv + vec2(cos(a), sin(a)) * rad * uTexel).rgb;
    }
    col = acc / float(BLUR_TAPS + 1);
  }
#endif
  // Ink lines measured from the finished picture (four taps), for the filters that redraw them.
  float lx = luma(texture2D(tScreen, vUv + vec2(uTexel.x, 0.0)).rgb) - luma(texture2D(tScreen, vUv - vec2(uTexel.x, 0.0)).rgb);
  float ly = luma(texture2D(tScreen, vUv + vec2(0.0, uTexel.y)).rgb) - luma(texture2D(tScreen, vUv - vec2(0.0, uTexel.y)).rgb);
  float edge = smoothstep(0.12, 0.35, abs(lx) + abs(ly)) * (1.0 - coc * 0.7);
  float L = luma(col);

  if (uFilter > 0.5 && uFilter < 1.5) {
    // Noir: black, white and the one accent colour.
    float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
    float red = smoothstep(0.35, 0.6, (mx - mn) / max(mx, 1e-3)) * step(max(col.g, col.b), col.r * 0.7);
    vec3 bw = mix(uInk, uPaper, smoothstep(0.18, 0.42, L));
    col = mix(mix(bw, uAccent * (0.35 + 0.9 * L), red), uInk, edge);
  } else if (uFilter < 2.5 && uFilter > 1.5) {
    // Golden-age print: four ink levels, warm paper, coarse dots in the mid tones.
    vec3 p = floor(clamp(col, 0.0, 1.0) * 3.0 + 0.5) / 3.0;
    col = mix(p, vec3(p.r + 0.06, p.g * 0.93 + 0.04, p.b * 0.78), 0.6);
    col = mix(col, uGoldPaper, smoothstep(0.75, 1.0, L) * 0.6);
    col = mix(col, uGoldInk, smoothstep(0.18, 0.05, L));
    float mid = smoothstep(0.2, 0.35, L) * (1.0 - smoothstep(0.6, 0.8, L));
    col = mix(col, col * 0.7, dots(frag + vec2(1.5, 0.0), uDot * 1.4, 0.28) * mid);
    col = mix(col, uGoldInk, edge);
  } else if (uFilter < 3.5 && uFilter > 2.5) {
    // Blueprint: one blue, white lines, a faint grid.
    col = mix(uBpDark, uBpLight, clamp(L * 0.8, 0.0, 1.0));
    vec2 g = abs(fract(frag / (uDot * 8.0)) - 0.5);
    float grid = 1.0 - smoothstep(0.46, 0.5, max(g.x, g.y));
    col = mix(col, uBpLine, (1.0 - grid) * 0.18);
    col = mix(col, uBpLine, edge);
  } else if (uFilter < 4.5 && uFilter > 3.5) {
    // Neon: the night pushed dark, colour loud, lines glowing magenta to cyan.
    vec3 s = clamp((col - L) * 2.2 + L, 0.0, 1.0);
    vec3 glow = mix(uNeonA, uNeonB, smoothstep(0.3, 0.7, col.b - col.r + 0.5));
    col = s * smoothstep(0.05, 0.6, L) * 0.55 + uNeonBase + glow * edge * 1.2;
  } else if (uFilter < 5.5 && uFilter > 4.5) {
    // Pop: loud colour and big dots.
    col = clamp(vec3(L) + (col - vec3(L)) * 1.9, 0.0, 1.0) * 1.12;
    col = mix(col, col * 0.45, dots(frag, uDot * 2.2, 0.34 * smoothstep(0.15, 0.7, L)) * 0.8);
  } else if (uFilter > 5.5) {
    vec3 s = vec3(dot(col, vec3(0.393, 0.769, 0.189)), dot(col, vec3(0.349, 0.686, 0.168)), dot(col, vec3(0.272, 0.534, 0.131)));
    col = mix(col, s, 0.92);
  }

  // Focus: off the focal plane the print loses its ink. Posterised, lifted toward paper, with a
  // halftone screen that grows as the picture leaves the plane.
  if (coc > 0.0) {
    vec3 post = floor(clamp(col, 0.0, 1.0) * 5.0 + 0.5) / 5.0;
    col = mix(col, post, coc * 0.6);
    vec3 paper = uFilter > 2.5 && uFilter < 4.5 ? col * 0.6 : uPaper;
    float fade = dots(frag, uDot, 0.38 + 0.2 * coc);
    col = mix(col, mix(paper, col, fade), coc * 0.3);
  }
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

export function createPhotoPost(renderer, quality) {
  const q = photoPostQuality(quality);
  const C = FILTER_COLORS;
  const uniforms = {
    tScreen: { value: null }, tDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
    uNear: { value: 0.1 }, uFar: { value: 1000 }, uFilter: { value: 0 }, uFocus: { value: 0 }, uAperture: { value: 0 },
    uDot: { value: 7 },
    uInk: { value: v3(C.ink) }, uPaper: { value: v3(C.paper) }, uAccent: { value: v3(C.accent) },
    uGoldPaper: { value: v3(C.goldPaper) }, uGoldInk: { value: v3(C.goldInk) },
    uBpDark: { value: v3(C.bpDark) }, uBpLight: { value: v3(C.bpLight) }, uBpLine: { value: v3(C.bpLine) },
    uNeonA: { value: v3(C.neonA) }, uNeonB: { value: v3(C.neonB) }, uNeonBase: { value: v3(C.neonBase) },
  };
  // Built lazily: a player who never opens photo mode never compiles it.
  let mat = null, quad = null, qScene = null;
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let tex = null;
  const at = new THREE.Vector2();

  function build() {
    mat = new THREE.ShaderMaterial({
      uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, defines: { BLUR_TAPS: q.blurTaps },
    });
    quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    qScene = new THREE.Scene();
    qScene.add(quad);
  }
  function texFor(w, h) {
    if (tex && tex.image.width === w && tex.image.height === h) return tex;
    tex?.dispose();
    tex = new THREE.FramebufferTexture(w, h);
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    return tex;
  }

  return {
    // Whether anything would change the picture.
    wanted: (o) => (FILTER_CODE[o.filter] ?? 0) > 0 || (o.aperture > 0 && o.focus > 0),
    // px: the view's drawing-buffer rect [x, y, w, h] (bottom-left origin); depthTexture: the ink
    // view's; camera: for near/far. dot: the halftone cell in drawing-buffer px.
    // One-shot textures (an export) pass `temp` so the big copy is freed straight after.
    apply({ px, depthTexture, camera, filter, focus, aperture, dot = 7, temp = false }) {
      if (!mat) build();
      const [x, y, w, h] = px;
      if (w < 2 || h < 2) return;
      const t = temp ? new THREE.FramebufferTexture(w, h) : texFor(w, h);
      renderer.setRenderTarget(null);
      at.set(x, y);
      renderer.copyFramebufferToTexture(t, at);
      uniforms.tScreen.value = t;
      uniforms.tDepth.value = depthTexture;
      uniforms.uTexel.value.set(1 / w, 1 / h);
      uniforms.uNear.value = camera.near;
      uniforms.uFar.value = camera.far;
      uniforms.uFilter.value = FILTER_CODE[filter] ?? 0;
      uniforms.uFocus.value = focus;
      uniforms.uAperture.value = aperture;
      uniforms.uDot.value = dot;
      const pr = renderer.getPixelRatio();
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setViewport(x / pr, y / pr, w / pr, h / pr);
      renderer.setScissor(x / pr, y / pr, w / pr, h / pr);
      renderer.setScissorTest(true);
      try {
        renderer.render(qScene, qCam);
      } finally {
        renderer.autoClear = autoClear;
        renderer.setScissorTest(false);
        const s = renderer.getSize(at);
        renderer.setViewport(0, 0, s.x, s.y);
        renderer.setScissor(0, 0, s.x, s.y);
        if (temp) t.dispose();
      }
    },
    dispose() { tex?.dispose(); tex = null; mat?.dispose(); quad?.geometry.dispose(); },
  };
}
