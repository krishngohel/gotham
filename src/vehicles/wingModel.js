// src/vehicles/wingModel.js
// Code-built Batwing mesh: a swept bat-shaped planform (the bat emblem outline stretched into a
// delta wing), a raised cockpit canopy, twin tail fins and twin engine glows. All flat colour /
// toon materials with an ink hull outline, matching the rest of the cast. No asset files.
import * as THREE from 'three';
import { PALETTE } from '../config/palette.js';
import { toonMaterial, addHullOutline } from '../render/toon.js';
import { LAYER_FX } from '../render/layers.js';
import { createBatwingModel } from './models/batwing.js';

// Outline units to metres. SZ > SX stretches the bat emblem's nose-to-tail axis into a longer
// jet fuselage than the logo itself (which reads squat when used at 1:1). Sized like a small
// fighter jet (~14 m wingspan), not a building, next to a rooftop or Batman.
const SX = 0.145, SZ = 0.205, THICK = 1.0;

// The plane itself now lives in models/batwing.js (a lofted fuselage through the same bat-emblem
// planform, canopy, nacelles, fins, nav lights; merged to a few draws). Same return shape as
// before: { mesh (hidden until called), engines: [left, right] groups that batwing.js pulses }.
export function buildBatwingMesh() {
  const { mesh, engines } = createBatwingModel();
  return { mesh, engines };
}

export const WING_RADIUS = 5.6;
export const WING_HEIGHT = 2.2;

// A Joker balloon: a toon sphere body, a knot and a simple grin (an arc) plus two dot eyes so it
// reads at a glance, purple or green.
export function buildBalloonMesh(kind) {
  const color = kind === 'green' ? PALETTE.jokerGreen : PALETTE.jokerPurple;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 12).scale(1, 1.18, 1), toonMaterial({ color, emissive: 0x140a1a, emissiveIntensity: 0.5 }));
  addHullOutline(body, 0.03);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.22, 8).rotateX(Math.PI), toonMaterial({ color }));
  knot.position.y = -1.0;
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0b0b12 });
  const eyeGeo = new THREE.SphereGeometry(0.09, 8, 6);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat); eyeL.position.set(-0.27, 0.28, 0.78);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat); eyeR.position.set(0.27, 0.28, 0.78);
  const grinGeo = new THREE.TorusGeometry(0.32, 0.05, 6, 12, Math.PI * 0.85);
  const grin = new THREE.Mesh(grinGeo, eyeMat);
  grin.position.set(0, 0.02, 0.82);
  grin.rotation.set(0, 0, Math.PI * 1.075);
  g.add(body, knot, eyeL, eyeR, grin);
  return g;
}

// A small bat-dart tracer fired with punch while flying: a thin black dart with a cyan tip glow.
export function buildDartMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0x101116 }));
  body.rotation.x = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0x6fe0ff }));
  tip.position.z = 0.4;
  g.add(body, tip);
  g.visible = false;
  return g;
}
