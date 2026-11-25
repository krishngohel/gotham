// Never-culled far silhouettes of the tall landmarks (Wayne Tower, the Loop's towers, Arkham's
// clock tower...) in the far scene (world.js farScene), so they stay on the skyline past the
// camera's far plane, where their chunks' own meshes and far-LOD boxes stop drawing
// (docs/design/world-framework.md: draw distance follows the fog). One merged mesh of plain boxes,
// one draw call, a flat colour the environment tints with the time of day (setTone).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LAYER_FX } from '../render/layers.js';

// Tall solid boxes (collision) that make a skyline: at least `minTop` high, a real footprint.
export function landmarkBoxes(boxes, { minTop = 75, minArea = 30 } = {}) {
  const out = [];
  for (const b of boxes) {
    if (b.maxY < minTop) continue;
    if ((b.maxX - b.minX) * (b.maxZ - b.minZ) < minArea) continue;
    if (b.tag && /stealth|prop|zip|tree|bound/.test(b.tag)) continue;
    out.push(b);
  }
  return out;
}

// [polish] opts.extras = { solid: [geometry], glow: [geometry with a colour attribute] }: shapes a
// landmark adds beyond its collision boxes (Wayne Tower's spire, pinnacles and mast; its lit
// W monograms, setback bands and lantern). The glow shapes are a second mesh (one more draw) that
// shows its own colours by night and fades to the silhouette's tone by day.
const indexed = (g) => (g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]));
export function createFarLandmarks(boxes, opts = {}) {
  const list = landmarkBoxes(boxes, opts);
  const mat = new THREE.MeshBasicMaterial({ color: 0x141a28, fog: false });
  if (!list.length) return { mesh: null, glow: null, count: 0, setTone() {} };
  const geos = list.map((b) => new THREE.BoxGeometry(b.maxX - b.minX, b.maxY - Math.max(b.minY, -5), b.maxZ - b.minZ)
    .translate((b.minX + b.maxX) / 2, (b.maxY + Math.max(b.minY, -5)) / 2, (b.minZ + b.maxZ) / 2));
  for (const g of opts.extras?.solid ?? []) geos.push(indexed(g.clone()));
  const geo = mergeGeometries(geos.map((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); return g; }), false);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'farLandmarks';
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;
  mesh.layers.set(LAYER_FX);
  let glow = null;
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const glowList = (opts.extras?.glow ?? []).map((g) => {
    const c = indexed(g.clone());
    for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'color') c.deleteAttribute(k);
    return c;
  });
  if (glowList.length) {
    glow = new THREE.Mesh(mergeGeometries(glowList, false), glowMat);
    glow.name = 'farLandmarkGlow';
    glow.frustumCulled = false;
    glow.matrixAutoUpdate = false;
    glow.layers.set(LAYER_FX);
    // After the silhouettes: the far pass squeezes 300-3000 m into a thin depth band, so a lit
    // band 0.5 m proud of a wall is often the same depth step (LessEqual then lets it through).
    glow.renderOrder = 1;
  }
  const c = new THREE.Color(), white = new THREE.Color(1, 1, 1);
  return {
    mesh,
    glow,
    count: list.length,
    // A shade of the fog: a dark shape in it by night, a grey one by day. The glow shapes are
    // their own colours by night and a little lighter than the silhouette by day.
    setTone(fog, day = 0) {
      c.copy(fog).multiplyScalar(0.55 + 0.2 * day); mat.color.copy(c);
      const night = Math.min(1, Math.max(0, 1 - day * 1.4));
      glowMat.color.copy(c).multiplyScalar(1.15).lerp(white, night);
    },
  };
}
