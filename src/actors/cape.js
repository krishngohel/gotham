import * as THREE from 'three';
import { createCloth, hangFrom, stepCloth } from './verlet.js';
import { toonMaterial } from '../render/toon.js';
import { bindPosition } from './rig.js';
import { addRim } from './outfitParts.js';
import { PALETTE } from '../config/palette.js';


// [perf3] Cloth sub-steps per frame are capped by tier (quality.clothSteps, set once at boot by
// setCapeQuality): the cloth steps at 120 Hz, so a slow frame ran up to four steps, and on a weak
// CPU the cape cost four times as much exactly when the frame was already late (11 % of a 45 ms
// frame at 4x CPU throttle). Potato and low take at most two (each a little longer: a slightly
// livelier swing at low frame rates only; at 60 fps and up nothing changes).
let STEP_CAP = 4;
export function setCapeQuality(quality) { STEP_CAP = Math.max(1, Math.min(4, quality?.clothSteps ?? 4)); }

function gridIndex(cols, rows) {
  const idx = [];
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const i = r * cols + c;
      idx.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    }
  }
  return idx;
}

// The hero cape's cloth. From the third-person camera (behind the hero) the cape is most of what
// shows, so it has to read on its own without glowing: the outer face is the cowl black lifted a
// step toward the city's slate (still the darkest thing on him after the cowl, gloves and boots),
// its shadow floor is raised so it never drops to solid black, a cool rim runs along the folds
// where the cloth turns from the camera, and the inner face is a lighter lining that shows where
// the hem curls. Which winding faces the body is found from the cloth's normals each frame.
//
// The pale-blue cape (polish list): the outer face used to be the cape colour lifted 30 % toward
// slate and the lining 60 %, both blue-greys, and a big flat cloth facing the camera fill, the rim
// light and (after the day/night merge) a 1.7x noon sky took that to a pale powder blue from
// behind. Now the outer face is the cape colour itself, the lining only a step lighter, and the
// lit result is capped at CAPE_LIGHT_CAP times the cloth's own colour, so no time of day or
// weather can light a dark cape pale (scripts/cape-check.mjs measures it at noon and at night).
export const CAPE_LIGHT_CAP = 2.6;
export const CAPE_EDGE = 0.012; // linear headroom over the cap: a faint rim survives on the edge
// Which side is the lining is decided per fragment: the face whose normal (as drawn, after the
// double-sided flip) points toward the wearer's front is the inside. (It was decided once per
// frame from the winding of one cloth vertex, and that came out inverted: from behind, the
// camera saw the lining, which was the lighter of the two.)
function capeMaterial(color) {
  const outer = new THREE.Color(color);
  const lining = new THREE.Color(color).lerp(new THREE.Color(PALETTE.slate), 0.22);
  const mat = toonMaterial({ color: outer, side: THREE.DoubleSide });
  const wearerFwd = { value: new THREE.Vector3(0, 0, 1) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLining = { value: lining };
    shader.uniforms.uWearerFwd = wearerFwd;
    shader.vertexShader = 'varying vec3 vCapeN;\n' + shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
	vCapeN = mat3( modelMatrix ) * objectNormal;`);
    shader.fragmentShader = 'uniform vec3 uLining;\nuniform vec3 uWearerFwd;\nvarying vec3 vCapeN;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
	#include <color_fragment>
	if (dot(vCapeN, uWearerFwd) * (gl_FrontFacing ? 1.0 : -1.0) > 0.0) diffuseColor.rgb = uLining;`);
  };
  mat.customProgramCacheKey = () => 'cape-lining';
  // A thin cool rim on the folds' turning edges only (it was a broad full-strength band).
  addRim(mat, 0x9fc3ff, 0.5, [0.55, 0.7], 0.5);
  // The cap goes LAST, after the rim: the follow camera looks down on the cape from above and
  // behind, the view grazes the whole cloth, and the rim term (added after any earlier cap) lit
  // the entire cape pale blue in play while a level camera saw it dark. Whatever the light, the
  // rim or the angle, the cape ends at most CAPE_LIGHT_CAP x its colour plus a faint edge.
  const withRim = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    withRim(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
	outgoingLight = min(outgoingLight, diffuseColor.rgb * ${CAPE_LIGHT_CAP.toFixed(2)} + vec3(${CAPE_EDGE.toFixed(3)}));
	#include <opaque_fragment>`);
  };
  const rimKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => `${rimKey()}|cape-cap-last`;
  mat.userData.wearerFwd = wearerFwd;
  return mat;
}

// anchor 'shoulders' is the cape; 'waist' hangs coat tails from the hips (the Joker's).
// The hero cape's defaults: it is cut to the shoulder line and ends at the shins, leaving the
// gloves, the legs' outer edges and the boots visible around it from behind. look 'cape' is the
// hero material above; 'coat' a plain toon cloth with the usual rim (the Joker's tails).
// Options not passed fall back to the wearer's own cut (ch.meta.cape.options, set by the model
// builder: Batman's is longer and wider than Batwoman's), then to the defaults below.
export function createCape(ch, color, opts = {}) {
  const {
    cols: COLS = 11, rows: ROWS = 14, topWidth = 0.46, bottomWidth = 1.05, length = 1.2, pointDrop = 0.15, anchor: mode = 'shoulders', look = 'cape',
  } = { ...(ch.meta?.cape?.options ?? {}), ...opts };
  const cloth = createCloth({ cols: COLS, rows: ROWS, topWidth, bottomWidth, length, pointDrop });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(cloth.pos, 3));
  geo.setIndex(gridIndex(COLS, ROWS));
  const mesh = new THREE.Mesh(geo, look === 'cape' ? capeMaterial(color) : addRim(toonMaterial({ color, side: THREE.DoubleSide })));
  const wearerFwd = mesh.material.userData.wearerFwd ?? null;
  mesh.frustumCulled = false;
  mesh.castShadow = true;

  const b = {
    hl: ch.bone('hand_l'), hr: ch.bone('hand_r'),
    ul: ch.bone('upperarm_l'), ur: ch.bone('upperarm_r'),
    s2: ch.bone('spine_02'), s3: ch.bone('spine_03'), pelvis: ch.bone('pelvis'),
    tl: ch.bone('thigh_l'), tr: ch.bone('thigh_r'), cl: ch.bone('calf_l'), cr: ch.bone('calf_r'), fl: ch.bone('foot_l'), fr: ch.bone('foot_r'),
  };
  const pins = new Float32Array(COLS * 3);
  const colliders = Array.from({ length: 9 }, () => ({ x: 0, y: 0, z: 0, r: 0 }));
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), anchor = new THREE.Vector3();
  const va = new THREE.Vector3(), vb = new THREE.Vector3();
  let placed = false;
  // Which way the shoulder line's cross product points relative to the chest, fixed from the bind pose.
  const flip = Math.sign(bindPosition(ch.body, 'upperarm_l').x - bindPosition(ch.body, 'upperarm_r').x) * ch.lm.fwd;
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
  // Gliding: the bottom corners are held by the hands so the cape spreads into wings.
  const cornerL = (ROWS - 1) * COLS, cornerR = ROWS * COLS - 1;
  let wings = false;
  const hand = new THREE.Vector3();

  const setSphere = (s, v, r, push = 0) => { s.x = v.x + fwd.x * push; s.y = v.y; s.z = v.z + fwd.z * push; s.r = r; };
  const mid = (a, bb) => a.getWorldPosition(va).add(bb.getWorldPosition(vb)).multiplyScalar(0.5);

  // floorAt(x, z): ground height under a cloth point (world y, -Infinity for none), which the hem
  // may rest on but not pass; null lets the cloth fall free.
  const floors = new Float32Array(cloth.n);
  // The shoulder line's back plane (stepCloth's back): set each frame for the cape, off for the
  // coat tails and while the hands hold the corners out as wings.
  // Its top is a ceiling at the shoulders: a jump's take-off pulls the cloth up and the apex lets
  // it carry on, whipping the hem over the head, where it landed folded and stayed (every jump).
  const backPlane = { x: 0, z: 0, nx: 0, nz: 1, d: 0.02, top: Infinity };
  function update(dt, wind = [0.6, 0, 0.3], floorAt = null) {
    ch.root.updateMatrixWorld(true);
    // Follow the torso, not the root: idle stances twist the shoulders well off the root's facing.
    b.ul.getWorldPosition(va);
    b.ur.getWorldPosition(vb);
    side.subVectors(va, vb).setY(0);
    right.copy(side).normalize();
    fwd.crossVectors(side, up).setY(0).normalize().multiplyScalar(flip);
    if (mode === 'waist') {
      // Coat tails: a straight line across the back of the hips.
      b.pelvis.getWorldPosition(anchor);
      anchor.y += 0.1;
      for (let c = 0; c < COLS; c++) {
        const t = c / (COLS - 1) - 0.5;
        pins[c * 3] = anchor.x + right.x * t * topWidth - fwd.x * 0.2;
        pins[c * 3 + 1] = anchor.y;
        pins[c * 3 + 2] = anchor.z + right.z * t * topWidth - fwd.z * 0.2;
      }
    } else {
      anchor.addVectors(va, vb).multiplyScalar(0.5);
      anchor.y += 0.1;
      // Top edge wraps over the shoulders: well behind the neck at the center, near the shoulder tops at the ends.
      const span = topWidth + 0.06;
      for (let c = 0; c < COLS; c++) {
        const t = c / (COLS - 1) - 0.5;
        const back = 0.17 - t * t * 0.5;
        pins[c * 3] = anchor.x + right.x * t * span - fwd.x * back;
        pins[c * 3 + 1] = anchor.y - t * t * 0.3;
        pins[c * 3 + 2] = anchor.z + right.z * t * span - fwd.z * back;
      }
    }
    if (!placed) { hangFrom(cloth, pins); placed = true; }
    setSphere(colliders[7], b.ul.getWorldPosition(va), 0.11);
    setSphere(colliders[8], b.ur.getWorldPosition(va), 0.11);
    setSphere(colliders[0], b.s2.getWorldPosition(va), 0.2, -0.02);
    setSphere(colliders[1], b.s3.getWorldPosition(va), 0.21, -0.02);
    setSphere(colliders[2], b.pelvis.getWorldPosition(va), 0.19, -0.01);
    setSphere(colliders[3], mid(b.tl, b.cl), 0.1);
    setSphere(colliders[4], mid(b.tr, b.cr), 0.1);
    setSphere(colliders[5], mid(b.cl, b.fl), 0.075);
    setSphere(colliders[6], mid(b.cr, b.fr), 0.075);
    if (wings) {
      // Column 0 sits on the upperarm_r side of the shoulder line.
      for (const [i, bone] of [[cornerL, b.hr], [cornerR, b.hl]]) {
        bone.getWorldPosition(hand);
        cloth.pinned[i] = 1;
        cloth.pos[i * 3] = cloth.prev[i * 3] = hand.x;
        cloth.pos[i * 3 + 1] = cloth.prev[i * 3 + 1] = hand.y;
        cloth.pos[i * 3 + 2] = cloth.prev[i * 3 + 2] = hand.z;
      }
    }
    if (dt <= 0) return;
    // Ground under each point, sampled once per frame (a hair above it, clear of the depth test).
    if (floorAt) for (let i = 0; i < cloth.n; i++) floors[i] = floorAt(cloth.pos[i * 3], cloth.pos[i * 3 + 2]) + 0.01;
    const steps = Math.min(STEP_CAP, Math.ceil(dt / (1 / 120)));
    const back = mode === 'shoulders' && !wings ? backPlane : null;
    if (back) { back.x = anchor.x; back.z = anchor.z; back.nx = fwd.x; back.nz = fwd.z; back.top = anchor.y + 0.05; }
    for (let s = 0; s < steps; s++) stepCloth(cloth, dt / steps, { wind, damping: 0.04, iterations: 8, colliders, pins, floor: floorAt ? floors : null, back });
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    // Lining: the shader picks the face turned toward the wearer's front (see capeMaterial).
    if (wearerFwd) wearerFwd.value.copy(fwd);
  }

  return {
    mesh,
    update,
    setWings(on) {
      if (on === wings) return;
      wings = on;
      if (!on) { cloth.pinned[cornerL] = 0; cloth.pinned[cornerR] = 0; }
    },
    reset() { placed = false; },
    // World height of the hem (the bottom row's average): how the hero spots a cape left folded.
    hemY() {
      let y = 0;
      for (let i = cloth.n - COLS; i < cloth.n; i++) y += cloth.pos[i * 3 + 1];
      return y / COLS;
    },
  };
}
