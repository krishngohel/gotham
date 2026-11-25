// Parked cars on the kerbs, from the street fleet (src/vehicles/models): the model's static
// geometry merged into the city's chunk buckets (painted body, glass, dark lamps), no extra draws.
// Which model, which way it faces and how it sits are a pure hash of where it stands, so calling
// this never draws from the region's rng (the core's layout stays byte-for-byte; the frozen core
// test holds its collision boxes, which cityBuilder.parkedCar still adds exactly as before).
import * as THREE from 'three';
import { parkedVehicleParts, lodGeometry } from '../vehicles/vehicleModels.js';

// Car-length types that fit the old 4.4 x 1.9 m parked-car collision box (give or take a bumper).
export const KERB_TYPES = ['sedan', 'sedan', 'sedan_deco', 'sedan_compact', 'coupe', 'hatchback', 'wagon', 'suv', 'taxi'];
// Wider choice for places with room (estates, the village, the prison car park).
export const ROOMY_TYPES = [...KERB_TYPES, 'pickup', 'van_delivery', 'limousine'];

function hash(x, z, k = 0) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);

// Adds one parked car standing at (x, y, z), along x or z. `color` (hex) is the paint; `detail`
// 'full' uses the fleet's LOD0 static geometry, 'lod' its ~190-triangle silhouette (for long rows
// of kerbside cars where the budget is tight). Returns the type used.
export function parkedFleetCar(ctx, x, z, alongX, color, { y = 0, types = KERB_TYPES, detail = 'full', yaw = null } = {}) {
  const type = types[Math.floor(hash(x, z) * types.length)];
  const flip = hash(x, z, 1) < 0.5;
  const a = yaw ?? (alongX ? (flip ? Math.PI / 2 : -Math.PI / 2) : (flip ? 0 : Math.PI));
  q.setFromAxisAngle(up, a + (hash(x, z, 2) - 0.5) * 0.06);
  mtx.compose(p.set(x, y, z), q, one);
  const palette = color == null ? Math.floor(hash(x, z, 3) * 8) : `c${color.toString(16).padStart(6, '0')}`;
  if (detail === 'lod') {
    const g = lodGeometry(type, palette).clone().applyMatrix4(mtx);
    ctx.buckets.add('painted', g);
    return type;
  }
  const parts = parkedVehicleParts(type, { palette, matrix: mtx });
  ctx.buckets.add('painted', parts.painted);
  if (parts.glass) ctx.buckets.add('glass', parts.glass);
  if (parts.glow) ctx.buckets.add('glow', parts.glow);
  return type;
}

// A row of parked cars along a kerb from (x0, z0) to (x1, z1) (axis-aligned), `gap` metres apart
// with random holes; collision boxes like the old parked cars (4.4 x 0.8 x 1.9 m, 0.3 m up).
export function parkedRow(ctx, x0, z0, x1, z1, { y = 0, fill = 0.6, gap = 6.5, colors, types = KERB_TYPES, detail = 'full', collide = true } = {}) {
  const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
  const L = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.floor(L / gap);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (hash(x, z, 4) > fill) continue;
    const c = colors ? colors[Math.floor(hash(x, z, 5) * colors.length)] : null;
    parkedFleetCar(ctx, x, z, alongX, c, { y, types, detail });
    if (collide) {
      const sx = alongX ? 4.4 : 1.9, sz = alongX ? 1.9 : 4.4;
      ctx.collision.addBox(x - sx / 2, y + 0.3, z - sz / 2, x + sx / 2, y + 1.1, z + sz / 2, 'car');
    }
  }
}
