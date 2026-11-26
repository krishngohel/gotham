// [perf2] The fixed cameras of scripts/perf-matrix.mjs and scripts/perf-gate.mjs: the five sites of
// scripts/perf.mjs (docs/baseline/04-perf.txt) plus the Loop at street level under the El and the Narrows.
// [name, hero position, yaw, camera pitch]
export const SITES = [
  ['gcpd roof', { x: 0, y: 42, z: 5 }, 2.6, 0.2],
  ['docks', { x: -60, y: 16, z: 175 }, 0.2, 0.25],
  ['neon street', { x: 150, y: 0, z: 10 }, 0, 0.1],
  ['ace chemicals', { x: 140, y: 25.1, z: -160 }, Math.PI, 0.3],
  ['clock plaza', { x: -62, y: 58, z: -148 }, Math.PI, 0.1],
  ['loop el', { x: 60, y: 0, z: -359 }, Math.PI / 2, 0.12],
  ['narrows', { x: -370, y: 0, z: -420 }, 0, 0.1],
];
