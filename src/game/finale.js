// The finale on the GCPD roof: the Batsignal burns clean over the city, the recovered cargo,
// transmitter and antidote lie on the evidence table, the Joker sits tied to a chair, then the
// credits.
import * as THREE from 'three';
import { toonMaterial, addHullOutline } from '../render/toon.js';
import { createCrates, createBroadcastRig, createAntidoteCase } from '../world/storyProps.js';

export function createFinale({ scene, world, hero, boss, camera, events }) {
  const set = new THREE.Group();
  set.visible = false;
  scene.add(set);
  const Y = 42;
  const table = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.6), toonMaterial({ color: 0x5a4636 }));
  table.position.set(3, Y + 0.45, 4);
  addHullOutline(table, 0.02);
  const antidote = createAntidoteCase();
  antidote.position.set(3, Y + 0.9, 4);
  const crates = createCrates();
  crates.position.set(-1, Y, 6.5);
  const rig = createBroadcastRig();
  rig.position.set(8, Y, 1);
  set.add(table, antidote, crates, rig);
  // Rope and a chair for our guest.
  const rope = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 20), toonMaterial({ color: 0xb08a50 }));
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.75 + k * 0.22;
    rope.add(r);
  }
  const chair = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.7), toonMaterial({ color: 0x3a2a24 }));
  chair.position.y = 0.25;
  rope.add(chair);
  rope.position.set(-7, Y, 9);
  set.add(rope);

  // The signal catches with one hard flash of light over the roof, then settles.
  // The light is made with the city (world.flashLight) so the scene's light count is the same
  // from boot, and no lit shader has to recompile when a run starts.
  const flash = world?.flashLight ?? new THREE.PointLight(0xfff0d0, 0, 400, 1.2);
  if (!flash.parent) scene.add(flash);
  let flashT = 0;
  const focus = new THREE.Vector3(1, Y + 1.5, 6);
  let playing = false;
  let t = 0;
  let resolve = null;

  return {
    get active() { return playing; },
    // The cinematic. Resolves when it is done; the credits come next.
    play() {
      set.visible = true;
      playing = true;
      t = 0;
      hero.teleport({ x: 0, y: Y, z: 9 }, Math.PI);
      hero.bat.animator.play('Idle_Loop', { fade: 0.2 });
      boss.pose([-7, Y + 0.5, 9], 1.2, 'Sitting_Idle_Loop', 1);
      // The Batsignal swings up over the roof, bigger than the city has ever seen it.
      world.sky.setSignalPoint(new THREE.Vector3(-60, 190, -220), 58);
      flash.position.set(0, Y + 14, 0);
      flashT = 0.6;
      events.emit('signal');
      events.emit('finaleStart');
      return new Promise((r) => { resolve = r; });
    },
    freeRoam() { playing = false; set.visible = true; },
    update(dt) {
      if (!set.visible) return false;
      flashT = Math.max(0, flashT - dt);
      flash.intensity = flashT * 9000;
      const rigDish = rig.userData.dish;
      if (rigDish) rigDish.rotation.y += dt * 0.4;
      if (!playing) return false;
      t += dt;
      hero.bat.animator.update(dt);
      hero.updateCape(dt);
      boss.update(dt);
      // Three camera moves: up at the signal, around the evidence table, out over the city.
      if (t < 7) {
        const k = t / 7;
        camera.position.set(2 - k * 3, Y + 1 + k * 2, 16 - k * 3);
        camera.lookAt(-20 + k * 14, Y + 25 - k * 12, -40 + k * 20);
      } else if (t < 14) {
        const a = (t - 7) * 0.35 + 0.4;
        camera.position.set(focus.x + Math.sin(a) * 8, Y + 3, focus.z + Math.cos(a) * 8);
        camera.lookAt(focus);
      } else {
        const k = Math.min(1, (t - 14) / 7);
        camera.position.set(14 + k * 20, Y + 6 + k * 18, 22 + k * 20);
        camera.lookAt(-20, Y + 30, -60);
      }
      if (t > 21 && resolve) { const r = resolve; resolve = null; playing = false; r(); }
      return true;
    },
  };
}
