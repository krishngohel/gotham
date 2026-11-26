// Interior floor plans for the minimap (workstream L2). Inside a room that has a plan, the
// minimap switches from the city to the plan. Rooms are any id the game reports as "inside"
// (src/world/interiors.js INTERIOR_ROOMS today; the Batcave and Manor agent registers its own).
//
//   registerFloorPlan(roomId, shapes, { label, y }) -> unregister()
//   shapes: [{ kind, rect: { minX, maxX, minZ, maxZ } } | { kind, points: [[x, z], ...] } |
//            { kind: 'label', x, z, text }]
//   kind:   'floor' (filled), 'wall' (thick ink), 'door' (a gap marker), 'stairs' (hatched),
//           'water', 'label'. World coordinates (x east, z south), metres.
const plans = new Map();
let version = 0;

export function registerFloorPlan(roomId, shapes, opts = {}) {
  if (typeof roomId !== 'string' || !Array.isArray(shapes)) return () => {};
  const plan = { id: roomId, shapes: shapes.filter((s) => s && typeof s === 'object'), label: opts.label ?? null, y: opts.y ?? null };
  plans.set(roomId, plan);
  version++;
  return () => { if (plans.get(roomId) === plan) { plans.delete(roomId); version++; } };
}
export const floorPlanFor = (roomId) => (roomId ? plans.get(roomId) ?? null : null);
export const floorPlanVersion = () => version;

// A plan from a room record like INTERIOR_ROOMS' ({ bounds, doors, name }): the floor, the four
// walls and the doors.
export function planFromRoom(room) {
  const b = room.bounds;
  const shapes = [
    { kind: 'floor', rect: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ } },
    { kind: 'wall', points: [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ], [b.minX, b.minZ]] },
  ];
  for (const d of room.doors ?? []) shapes.push({ kind: 'door', rect: { minX: d.x - (d.w ?? 3) / 2, maxX: d.x + (d.w ?? 3) / 2, minZ: d.z - 1, maxZ: d.z + 1 } });
  shapes.push({ kind: 'label', x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, text: room.name ?? room.id });
  return shapes;
}

// Bounds of a plan's shapes (for centring and zoom).
export function planBounds(plan) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  const add = (x, z) => { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); };
  for (const s of plan.shapes) {
    if (s.rect) { add(s.rect.minX, s.rect.minZ); add(s.rect.maxX, s.rect.maxZ); }
    if (s.points) for (const [x, z] of s.points) add(x, z);
    if (s.kind === 'label') add(s.x, s.z);
  }
  return b;
}
