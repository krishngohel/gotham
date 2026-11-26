// Paired moves (anim2): an attacker clip and its victim clip from one Mixamo take, driven from ONE
// clock so the hands meet the body (docs/design/anim-manifest.md: a victim clip's
// `pair: { with, offset }`; both clips keep the take's own heading, root motion stripped into
// `root`).
//
// In the take's frame (x = the attacker's left, z = his forward at frame 0), at clip time t:
//   attacker root = O + attRM(t),  victim root = O + offset + vicRM(t)
// so the victim's root is always the attacker's plus rel(t) = offset + vicRM(t) - attRM(t),
// turned by the pair's yaw. Both characters' roots face that same yaw (the clips turn the
// bodies to face each other).
//
// Pure helpers plus moveRootUnderBlend, which turns and moves a character's root while a dead
// blend is running without the shown pose jumping (src/anim/deadBlend.js rebase).
import * as THREE from 'three';
import { rootMotionAt } from '../combat/reach.js';

const ra = [0, 0], rv = [0, 0];

// The victim's root relative to the attacker's at clip time t, in the take's frame. out: [x, z].
export function pairRel(attInfo, vicInfo, t, out = [0, 0]) {
  const off = vicInfo?.pair?.offset ?? [0, 0];
  rootMotionAt(attInfo, t, ra);
  rootMotionAt(vicInfo, t, rv);
  out[0] = off[0] + rv[0] - ra[0];
  out[1] = off[1] + rv[1] - ra[1];
  return out;
}

// Take-frame (x, z) to world for a pair facing `yaw` (the warp's convention, src/anim/warp.js).
export const pairX = (yaw, x, z) => Math.cos(yaw) * x + Math.sin(yaw) * z;
export const pairZ = (yaw, x, z) => -Math.sin(yaw) * x + Math.cos(yaw) * z;

// The pair yaw that puts the victim, standing `dx, dz` from the attacker in the world, where the
// take has him at time t (rel): the attacker turns the pair to the victim, not the other way.
export function pairYawFor(rel, dx, dz) {
  return Math.atan2(dx, dz) - Math.atan2(rel[0], rel[1]);
}

const Mp = new THREE.Matrix4(), Mrel = new THREE.Matrix4(), Mt = new THREE.Matrix4(), sc = new THREE.Vector3();
// After a root move under a running blend: the pose on screen THIS frame (already posed, if the
// move came after the character's update) is carried too, by its pelvis, so not even one frame
// shows it at the new root (the 1x-2x-1x pop of a revive's get-up).
export function carryPelvis(pelvis, m) {
  Mt.compose(pelvis.position, pelvis.quaternion, sc.set(1, 1, 1)).premultiply(m);
  Mt.decompose(pelvis.position, pelvis.quaternion, sc);
}
// Turns (and optionally moves) a character's root while its dead blend is running, carrying the
// held old pose along so nothing jumps on screen; the blend then carries the body into the new
// clip's pose at its new place. Without a running blend it is a plain move.
export function moveRootUnderBlend(ch, yaw, x = null, z = null) {
  const pelvis = ch?.bone?.('pelvis');
  if (!pelvis?.parent || !ch.animator?.blending) {
    ch.face(yaw);
    if (x !== null) { ch.root.position.x = x; ch.root.position.z = z; }
    return;
  }
  ch.root.updateMatrixWorld(true);
  Mp.copy(pelvis.parent.matrixWorld);
  ch.face(yaw);
  if (x !== null) { ch.root.position.x = x; ch.root.position.z = z; }
  ch.root.updateMatrixWorld(true);
  Mrel.copy(pelvis.parent.matrixWorld).invert().multiply(Mp);
  ch.animator.rebaseBlend(Mrel);
  carryPelvis(pelvis, Mrel);
}
