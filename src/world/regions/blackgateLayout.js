// Blackgate Penitentiary's layout (pure numbers): a prison on a rock in the harbour, south-east of
// the freighter and south of the lighthouse, joined to the core's docks by a low causeway that
// leaves the docks road at x 90 (the core street's south end). The islet's ground is 2.2 m above
// the harbour (-0.6); the causeway deck 0.3 m, ramping up over its last 30 m.
export const BLACKGATE = {
  bounds: { minX: 70, maxX: 200, minZ: 320, maxZ: 420 },
  ground: 2.2,
  deck: 0.3,
  // The causeway's centre line, docks end first: [x, y, z].
  causeway: [[90, 0, 197], [90, 0.3, 206], [84, 0.3, 214], [84, 0.3, 300], [84, 2.2, 330], [92, 2.2, 343], [121, 2.2, 343]],
  rock: { minX: 86, maxX: 192, minZ: 334, maxZ: 414 },
  walls: { minX: 104, maxX: 180, minZ: 352, maxZ: 406, h: 8, t: 1.6 },
  gate: { x: 121, z: 352 },
  blocks: [
    { id: 'A', x: 142, z: 368, w: 44, d: 12, h: 12.6 },
    { id: 'B', x: 142, z: 394, w: 44, d: 12, h: 12.6 },
  ],
  admin: { x: 113, z: 381, w: 14, d: 22, h: 10 },
  yard: { x: 165, z: 381, w: 24, d: 14 },
  tower: { x: 165, z: 381 },
  dock: { x0: 186, x1: 206, z: 380, w: 8, y: 1.2 },
};
