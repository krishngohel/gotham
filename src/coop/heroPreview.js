// The live 3D preview behind the hero select (workstream D1): the picked heroes standing in the
// city, drawn by the same ink pipeline as the game (so the select shows the real model in the
// comic look). Pre-game they stand side by side on the GCPD roof in front of a fixed lobby camera;
// in-game (a player joining mid-mission) the joiner stands in front of the paused camera.
import * as THREE from 'three';
import { buildKitModel, kitById } from '../heroes/roster.js';
import { prepareKit } from '../heroes/kitModels.js';
import { createBat } from '../actors/characters.js';
import { createCape } from '../actors/cape.js';

export function createHeroPreview({ scene, assets }) {
  const slots = [null, null]; // { kitId, ch, cape }
  const spots = [new THREE.Vector3(), new THREE.Vector3()];
  let yaw = 0;
  let token = 0;
  const wind = [0.6, 0.2, 0.3];

  function clear(i) {
    const s = slots[i];
    if (!s) return;
    scene.remove(s.ch.root);
    if (s.cape) scene.remove(s.cape.mesh);
    slots[i] = null;
  }
  function place(i) {
    const s = slots[i];
    if (!s) return;
    s.ch.root.position.copy(spots[i]);
    s.ch.face(yaw);
    s.cape?.reset();
    for (let k = 0; k < 60; k++) s.cape?.update(1 / 60, wind, null);
  }

  return {
    // Two spots facing a camera: the lobby (pre-game). Returns the camera pose to use.
    stage(center, facing, camera) {
      yaw = facing;
      const fx = Math.sin(facing), fz = Math.cos(facing), rx = -fz, rz = fx;
      // Seen from the camera (looking back along -facing), +right is screen left: player 1
      // stands under its column on the left.
      spots[0].set(center.x + rx * 0.95, center.y, center.z + rz * 0.95);
      spots[1].set(center.x - rx * 0.95, center.y, center.z - rz * 0.95);
      if (camera) {
        camera.position.set(center.x + fx * 4.4, center.y + 1.55, center.z + fz * 4.4);
        camera.lookAt(center.x, center.y + 1.0, center.z);
      }
      for (let i = 0; i < 2; i++) place(i);
    },
    // One spot in front of a camera (in-game join): the joiner, 3.4 m ahead, on the ground there.
    stageBefore(camera, collision, i = 1) {
      const dir = camera.getWorldDirection(new THREE.Vector3());
      dir.y = 0; dir.normalize();
      const p = camera.position.clone().addScaledVector(dir, 3.4);
      const g = collision.groundBelow(p.x, camera.position.y + 1, p.z, 0.3);
      p.y = g > -Infinity ? g : camera.position.y - 1.6;
      spots[i].copy(p);
      yaw = Math.atan2(-dir.x, -dir.z);
      place(i);
    },
    // Show a kit on a spot (loads its model the first time).
    async show(i, kitId) {
      const my = ++token;
      if (slots[i]?.kitId === kitId) return;
      const kit = kitById(kitId);
      await prepareKit(kit, assets);
      if (my !== token && slots[i]?.kitId === kitId) return;
      clear(i);
      const ch = buildKitModel(kit, assets, { createBat });
      const cape = ch.meta?.cape !== null ? createCape(ch, ch.colors?.cape ?? 0x17181e) : null;
      scene.add(ch.root);
      if (cape) scene.add(cape.mesh);
      ch.animator.play('Idle_Loop', { fade: 0 });
      slots[i] = { kitId, ch, cape };
      place(i);
    },
    hide(i) { clear(i); },
    clearAll() { clear(0); clear(1); },
    update(dt) {
      for (const s of slots) {
        if (!s) continue;
        s.ch.animator.update(dt);
        s.cape?.update(dt, wind, null);
      }
    },
    get active() { return !!(slots[0] || slots[1]); },
  };
}
