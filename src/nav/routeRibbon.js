// The GPS route drawn on the road (workstream L2): one dynamic strip mesh per player, rebuilt only
// when the route changes or the player has moved far enough along it (no per-frame allocation),
// and a trail of small markers through the air for the on-foot / gliding hint.
//
// Both draw on LAYER_FX (the colour pass only, like the objective beacon), so the ink pass
// posterises and halftones them with the rest of the frame: the ribbon reads as a neon dash
// with an ink rim. Depth-tested, so an upper deck hides the ribbon on the lower deck beneath it.
// Each player's ribbon is full strength in their own view and faint in the partner's.
import * as THREE from 'three';
import { LAYER_FX } from '../render/layers.js';
import { PALETTE } from '../config/palette.js';
import { createRibbonBuffers, fillRibbon, ribbonWindow, RIBBON } from './ribbonGeometry.js';
import { AIR } from './airHint.js';

const vertexShader = /* glsl */ `
attribute vec3 aInfo;
varying vec3 vInfo;
varying float vDist;
void main() {
  vInfo = aInfo;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const fragmentShader = /* glsl */ `
uniform vec3 uColor, uInk;
uniform float uTime, uFar, uOwn, uPlayerS, uDash;
varying vec3 vInfo;
varying float vDist;
void main() {
  float side = abs(vInfo.y);
  vec3 col; float a;
  if (vInfo.z < 0.5) {
    float dash = fract((vInfo.x - uTime * 7.0) / 7.0);
    float on = mix(1.0, step(dash, 0.6), uDash);
    float rim = smoothstep(0.72, 0.9, side);
    col = mix(uColor * 1.35, uInk, rim);
    a = mix(0.45 + 0.5 * on, 0.9, rim);
    a *= smoothstep(uPlayerS - 10.0, uPlayerS - 2.0, vInfo.x);
  } else {
    float rim = step(0.8, side);
    col = mix(uColor * 1.5, uInk, rim * 0.6);
    a = 0.95;
  }
  a *= (1.0 - smoothstep(uFar * 0.5, uFar, vDist)) * uOwn;
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a);
}`;

// color: a CSS colour or hex; ownerCamera(): the camera of the view this route belongs to.
export function createRouteRibbon(scene, { color = 0x49b4ff, quality = {}, ownerCamera = () => null, groundAt = null } = {}) {
  const low = (quality.drawDistance ?? 420) <= 200;
  const buf = createRibbonBuffers({ maxSamples: low ? 72 : RIBBON.maxSamples, maxTurns: low ? 4 : RIBBON.maxTurns });
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(buf.position, 3).setUsage(THREE.DynamicDrawUsage);
  const info = new THREE.BufferAttribute(buf.info, 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('aInfo', info);
  geo.setDrawRange(0, 0);
  const uniforms = {
    uColor: { value: new THREE.Color(color) }, uInk: { value: new THREE.Color(PALETTE.ink ?? 0x0b0b12) },
    uTime: { value: 0 }, uFar: { value: Math.min(320, (quality.drawDistance ?? 420) * 0.9) }, uOwn: { value: 1 },
    uPlayerS: { value: 0 }, uDash: { value: low ? 0 : 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, depthTest: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'routeRibbon';
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.visible = false;
  mesh.userData.dynamic = true;
  // Strength per view: full in the owner's view, faint in the partner's.
  mesh.onBeforeRender = (r, s, cam) => { const own = ownerCamera(); uniforms.uOwn.value = !own || cam === own ? 1 : 0.35; };
  scene.add(mesh);

  // ---- air trail (on foot / gliding) ----
  const AIRN = AIR.maxMarkers;
  const airMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, fog: false });
  const air = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.45), airMat, AIRN);
  air.name = 'routeAirTrail';
  air.layers.set(LAYER_FX);
  air.frustumCulled = false;
  air.count = 0;
  air.visible = false;
  air.userData.dynamic = true;
  air.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  air.onBeforeRender = (r, s, cam) => { const own = ownerCamera(); airMat.opacity = !own || cam === own ? 0.75 : 0.25; };
  scene.add(air);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();

  let routeKey = -1, lastS = -1e9, route = null, cum = null, turns = null, widthOf = null;
  const api = {
    mesh, air, buf,
    // A new route (or null). version: the GPS state's version (rebuild only when it changes).
    setRoute(r, c, tr, version, wOf = null) {
      if (version === routeKey) return;
      routeKey = version;
      route = r; cum = c; turns = tr; widthOf = wOf;
      lastS = -1e9;
      if (!route) { mesh.visible = false; geo.setDrawRange(0, 0); }
    },
    // Draw the window around s (metres along the route). show: the ribbon is wanted now.
    update(t, s, show) {
      uniforms.uTime.value = t;
      uniforms.uPlayerS.value = s;
      mesh.visible = !!(show && route);
      if (!mesh.visible) return;
      if (Math.abs(s - lastS) < 10) return;
      lastS = s;
      const [s0, s1] = ribbonWindow(s, cum[cum.length - 1]);
      fillRibbon(buf, route.points, cum, s0, s1, { widthOf, groundAt, turns });
      geo.setDrawRange(0, buf.count);
      pos.needsUpdate = true; info.needsUpdate = true;
      // Only the written part is uploaded.
      pos.clearUpdateRanges?.(); info.clearUpdateRanges?.();
      pos.addUpdateRange?.(0, buf.count * 3); info.addUpdateRange?.(0, buf.count * 3);
    },
    // The air trail: n markers from a Float32Array of xyz triples (0 hides it).
    setAir(points, n, t = 0) {
      air.count = Math.min(n, AIRN);
      air.visible = air.count > 0;
      for (let i = 0; i < air.count; i++) {
        q.setFromAxisAngle(v3.set(0, 1, 0), t * 1.5 + i * 0.4);
        const k = 0.8 + 0.25 * Math.sin(t * 4 - i * 0.6);
        sc.set(k, k * 1.4, k);
        m4.compose(v3.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]), q, sc);
        air.setMatrixAt(i, m4);
      }
      if (air.count) air.instanceMatrix.needsUpdate = true;
    },
    setColor(c) { uniforms.uColor.value.set(c); airMat.color.set(c); },
    dispose() { scene.remove(mesh); scene.remove(air); geo.dispose(); mat.dispose(); air.geometry.dispose(); airMat.dispose(); },
  };
  return api;
}
