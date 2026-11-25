// ?views=2: renders the same scene from two cameras side by side through the multi-view ink
// pipeline (contract 4.4), as the proof workstream D builds split-screen play on. The left view is
// the game's own camera; the right one orbits the hero (or the title view's focus). Shadows render
// once per frame for both; each view has its own targets and ink uniforms, and the gutter between
// the panels is inked like a comic panel border. Dev only: nothing here runs without the URL flag.
import * as THREE from 'three';
import { splitRects } from '../render/inkPipeline.js';

export function createDevViews({ ink, scene, camera }) {
  const cam2 = new THREE.PerspectiveCamera(55, 1, camera.near, camera.far);
  const left = ink.mainView;
  const right = ink.createView({ camera: cam2 });
  const list = [left, right];
  let orbit = 0;
  const focus = new THREE.Vector3();

  function resize(w, h) {
    const [a, b] = splitRects(2, w, h, 4);
    left.rect.splice(0, 4, ...a);
    right.rect.splice(0, 4, ...b);
    ink.setSize(w, h);
    camera.aspect = (a[2] * w) / (a[3] * h);
    camera.updateProjectionMatrix();
    cam2.aspect = (b[2] * w) / (b[3] * h);
    cam2.updateProjectionMatrix();
  }

  return {
    views: list,
    resize,
    render(t, hero) {
      orbit = t * 0.25;
      if (hero) focus.set(hero.pos.x, hero.pos.y + 1.2, hero.pos.z);
      else focus.set(-20, 60, -60);
      const r = hero ? 7 : 90;
      cam2.position.set(focus.x + Math.sin(orbit) * r, focus.y + (hero ? 2.5 : 25), focus.z + Math.cos(orbit) * r);
      cam2.lookAt(focus);
      left.camera = camera;
      ink.render(scene, list, t);
    },
  };
}
