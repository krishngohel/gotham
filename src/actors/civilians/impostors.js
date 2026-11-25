// Far crowd impostors: every distant pedestrian is one camera-facing quad in a single
// InstancedMesh (one draw call for the whole far crowd). Each figure gets a cell in a shared
// atlas painted from its palette as a flat comic silhouette (head, hair, top, legs, shoes, an ink
// outline), so the colours stay the same person's when they walk out of full-model range.
//
//   const crowd = createImpostorCrowd({ capacity: 256 });  scene.add(crowd.mesh);
//   const h = crowd.add(civ.palette, civ.spec?.cut);       crowd.set(h, x, y, z, height);
//   crowd.remove(h);
import * as THREE from 'three';
import { PALETTE } from '../../config/palette.js';

const CELL_W = 32, CELL_H = 64, COLS = 32, ROWS = 16; // 1024 x 1024 atlas, 512 cells
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

function paintCell(g, x0, y0, pal, cut = {}) {
  const ink = hex(PALETTE.ink);
  const W = CELL_W, H = CELL_H;
  const top = hex(cut.outer ? (pal.outer ?? pal.top) : pal.top ?? 0x555555);
  const legs = hex(pal.bottom ?? 0x333333);
  const long = ['coat', 'trench', 'labcoat', 'gown'].includes(cut.outer);
  g.save();
  g.translate(x0, y0);
  g.clearRect(0, 0, W, H);
  g.lineWidth = 2;
  g.strokeStyle = ink;
  const shape = (fill, path) => { g.beginPath(); path(); g.fillStyle = fill; g.fill(); g.stroke(); };
  shape(legs, () => { g.rect(W * 0.32, H * 0.5, W * 0.15, H * 0.42); g.rect(W * 0.53, H * 0.5, W * 0.15, H * 0.42); });
  shape(hex(pal.shoes ?? 0x111111), () => g.rect(W * 0.28, H * 0.9, W * 0.44, H * 0.07));
  shape(top, () => { g.moveTo(W * 0.24, H * 0.2); g.lineTo(W * 0.76, H * 0.2); g.lineTo(W * (long ? 0.78 : 0.72), H * (long ? 0.78 : 0.54)); g.lineTo(W * (long ? 0.22 : 0.28), H * (long ? 0.78 : 0.54)); g.closePath(); });
  shape(top, () => { g.rect(W * 0.12, H * 0.22, W * 0.12, H * 0.3); g.rect(W * 0.76, H * 0.22, W * 0.12, H * 0.3); });
  shape(hex(pal.skin ?? 0xc99a7c), () => g.arc(W * 0.5, H * 0.11, W * 0.15, 0, Math.PI * 2));
  shape(hex(cut.hat ? (pal.hat ?? pal.hair) : pal.hair ?? 0x222222), () => g.arc(W * 0.5, H * 0.08, W * 0.155, Math.PI, Math.PI * 2));
  g.restore();
}

export function createImpostorCrowd({ capacity = 256 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * COLS; canvas.height = CELL_H * ROWS;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const geo = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  const cell = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
  geo.setAttribute('aCell', cell);
  const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, transparent: false });
  mat.onBeforeCompile = (shader) => {
    // Cylindrical billboard: keep the instance's position and scale, face the camera about Y.
    shader.vertexShader = 'attribute vec2 aCell;\n' + shader.vertexShader
      .replace('#include <uv_vertex>', `#include <uv_vertex>
	vMapUv = (aCell + uv) * vec2(${(1 / COLS).toFixed(6)}, ${(1 / ROWS).toFixed(6)});`)
      .replace('#include <project_vertex>', `
	vec4 centre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
	float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
	vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
	vec4 world = centre + vec4(right * position.x * sx + vec3(0.0, position.y * sy, 0.0), 0.0);
	vec4 mvPosition = viewMatrix * world;
	gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'crowd-impostor';
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const free = [];
  let used = 0, nextCell = 0;
  const cells = new Map(); // palette key -> atlas cell
  const slots = []; // handle -> instance index
  const m = new THREE.Matrix4();
  return {
    mesh,
    add(palette, cut = {}) {
      const key = JSON.stringify([palette.skin, palette.hair, palette.top, palette.outer, palette.bottom, palette.shoes, palette.hat, cut.outer, cut.hat]);
      let c = cells.get(key);
      if (c === undefined) {
        c = nextCell++ % (COLS * ROWS);
        paintCell(g, (c % COLS) * CELL_W, (ROWS - 1 - Math.floor(c / COLS)) * CELL_H, palette, cut);
        tex.needsUpdate = true;
        cells.set(key, c);
      }
      const i = free.length ? free.pop() : used++;
      if (i >= capacity) return -1;
      cell.setXY(i, c % COLS, Math.floor(c / COLS));
      cell.needsUpdate = true;
      mesh.count = Math.max(mesh.count, i + 1);
      slots[i] = true;
      return i;
    },
    set(h, x, y, z, height = 1.8, width = 0.9) {
      if (h < 0) return;
      m.makeScale(width, height, 1).setPosition(x, y, z);
      mesh.setMatrixAt(h, m);
      mesh.instanceMatrix.needsUpdate = true;
    },
    remove(h) {
      if (h < 0 || !slots[h]) return;
      slots[h] = false;
      m.makeScale(0, 0, 0);
      mesh.setMatrixAt(h, m);
      mesh.instanceMatrix.needsUpdate = true;
      free.push(h);
    },
    budget: () => ({ drawCalls: 1, triangles: mesh.count * 2, atlasCells: cells.size }),
  };
}
