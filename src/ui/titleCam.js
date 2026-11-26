// [polish] The title screen's camera: a slow rise over the Loop's roofs toward Wayne Tower, the
// moon behind its crown, the tower on the right of the frame (the menu sits on the left).
// Pure (numbers in, numbers out) so the path can be unit tested without a renderer.
//
// The path ping-pongs between two keys with a cosine ease, so it never snaps; one leg takes
// LEG seconds. Distances keep Wayne Tower inside the Potato tier's 200 m fog.
export const TITLE_KEYS = [
  { pos: [-140, 95, -330], look: [-20, 110, -460] },
  { pos: [-90, 115, -360], look: [-25, 130, -455] },
];
export const LEG = 48;

const ease = (s) => 0.5 - 0.5 * Math.cos(Math.PI * s);

// t seconds -> writes [x, y, z] into pos and look (arrays of 3); allocation-free.
export function titleCamera(t, pos, look) {
  const k = ((t / LEG) % 2 + 2) % 2;
  const s = ease(k <= 1 ? k : 2 - k);
  const [a, b] = TITLE_KEYS;
  for (let i = 0; i < 3; i++) {
    pos[i] = a.pos[i] + (b.pos[i] - a.pos[i]) * s;
    look[i] = a.look[i] + (b.look[i] - a.look[i]) * s;
  }
}
