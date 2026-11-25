// Objective marker: a diamond with the distance, pinned to the screen edge as an arrow when the
// objective is off screen or behind the camera. A target more than 4 m above or below gets a
// height line (up 58 m: a roof; down: the lower deck). The same marker, recoloured with
// setColor(), shows custom waypoints (src/nav/navSystem.js, workstream L2).
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { LAYER_FX } from '../render/layers.js';

// getSize: the view's size in CSS px (split screen: one player's panel); the window by default.
export function createWaypoint(root, getSize = null) {
  const el = document.createElement('div');
  el.className = 'waypoint';
  el.innerHTML = `
    <svg class="wp-diamond" viewBox="0 0 40 40"><path d="M20 2 L38 20 L20 38 L2 20 Z"/><path class="wp-core" d="M20 11 L29 20 L20 29 L11 20 Z"/></svg>
    <svg class="wp-arrow" viewBox="0 0 40 40"><path d="M6 8 L36 20 L6 32 L13 20 Z"/></svg>
    <span class="wp-dist"></span>`;
  root.appendChild(el);
  const dist = el.querySelector('.wp-dist');
  const arrow = el.querySelector('.wp-arrow');
  const v = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const rel = new THREE.Vector3();
  let lastText = '', lastColor = null, lastFade = 1;
  return {
    el,
    // A custom waypoint's colour (CSS colour; null: the objective's yellow).
    setColor(c) { if (c === lastColor) return; lastColor = c; el.style.setProperty('--wp-color', c ?? ''); el.classList.toggle('wp-tinted', !!c); },
    update(target, camera, heroPos) {
      if (!target) { el.style.display = 'none'; return; }
      el.style.display = '';
      const meters = Math.round(Math.hypot(target.x - heroPos.x, target.y - heroPos.y, target.z - heroPos.z));
      const dy = Math.round((target.y ?? 0) - heroPos.y);
      const text = Math.abs(dy) > 4 ? `${meters} m ${dy > 0 ? '▲' : '▼'}${Math.abs(dy)}` : `${meters} m`;
      if (text !== lastText) { lastText = text; dist.textContent = text; }
      v.set(target.x, target.y + 1.5, target.z);
      camera.getWorldDirection(camDir);
      const behind = rel.copy(v).sub(camera.position).dot(camDir) < 0;
      v.project(camera);
      let x = v.x, y = v.y;
      if (behind) { x = -x; y = -y; }
      const sz = getSize?.();
      const W = sz ? sz.w : innerWidth, H = sz ? sz.h : innerHeight;
      const margin = 0.88;
      const off = behind || Math.abs(x) > margin || Math.abs(y) > margin;
      if (off) {
        const len = Math.max(Math.abs(x) / margin, Math.abs(y) / margin) || 1;
        x /= len; y /= len;
        if (behind && Math.abs(y) < 0.3 && Math.abs(x) < 0.3) y = -margin;
      }
      // Stay clear of the objective box in the top corner.
      if (off && y > 0.62) y = 0.62;
      if (off && y < -0.55 && x < -0.6) y = -0.55;
      el.classList.toggle('off', off);
      el.style.left = `${(x * 0.5 + 0.5) * W}px`;
      el.style.top = `${(-y * 0.5 + 0.5) * H}px`;
      arrow.style.transform = `rotate(${Math.atan2(-y, x)}rad)`;
    },
    hide() { el.style.display = 'none'; },
    // The idle nudge: a few beats so the eye finds it.
    pulse() { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); },
    // [onboard] Arriving: the marker fades as she closes in (1 far, 0 on the spot) instead of
    // vanishing at 7 m. Written only when the quantised level changes.
    fade(k) { const q = Math.round(Math.min(1, Math.max(0, k)) * 20) / 20; if (q === lastFade) return; lastFade = q; el.style.opacity = q >= 1 ? '' : String(q); },
    // [onboard] Reached: the diamond bursts where it stood (the world's acknowledgement).
    burst() { el.classList.remove('burst'); void el.offsetWidth; el.classList.add('burst'); setTimeout(() => el.classList.remove('burst'), 600); },
  };
}

// A tall column of yellow ink light over the objective, fading as the hero gets close.
// opts.color: another colour (a custom waypoint); opts.owner(): the camera of the only view that
// should see it (split screen: each player's own waypoint beacon), or nothing for every view.
export function createBeacon(scene, { color = PALETTE.signal, owner = null } = {}) {
  const uniforms = { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uFade: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime, uFade; varying vec2 vUv;
      void main(){
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = pow(edge, 1.5) * (1.0 - vUv.y) * 0.55 * uFade;
        a *= 0.8 + 0.2 * sin(uTime * 3.0 - vUv.y * 30.0);
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const geo = new THREE.CylinderGeometry(1.4, 1.4, 180, 16, 1, true).translate(0, 90, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  mesh.visible = false;
  const fade = { v: 1 };
  if (owner) mesh.onBeforeRender = (r, s, cam) => { const o = owner(); uniforms.uFade.value = !o || cam === o ? fade.v : 0; };
  scene.add(mesh);
  return {
    set(pos, c = null) { mesh.visible = !!pos; if (pos) mesh.position.set(pos.x, pos.y, pos.z); if (c) uniforms.uColor.value.set(c); },
    update(t, heroPos) {
      uniforms.uTime.value = t;
      if (!mesh.visible) return;
      const d = Math.hypot(heroPos.x - mesh.position.x, heroPos.z - mesh.position.z);
      fade.v = THREE.MathUtils.smoothstep(d, 8, 40);
      uniforms.uFade.value = fade.v;
    },
  };
}
