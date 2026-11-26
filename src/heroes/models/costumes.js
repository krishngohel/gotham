// Costume region maps for the code-painted roster heroes, shared by the offline painter
// (scripts/paint-suits.mjs paints public/assets/tex/hero_<id>.webp from them, with ink contours
// where regions meet, anatomy lines and face lines) and the runtime fallback (crisp vertex paint
// when the texture is not loaded). Pure functions of the bind-pose point p, its normal n, the
// landmarks lm and B(boneName) -> bind position. Original designs in the comic spirit.
//
//   COSTUMES[id] = { body, colors: { region: hex }, lines: 'ink' | 'light', lineColor, region(p, n, lm, B) }
// Shared geometry tests.
function zones(p, n, lm, B) {
  const ax = Math.abs(p.x);
  const arm = ax > lm.shoulderX - 0.02 && p.y > lm.chestY - 0.12;
  const head = !arm && p.y > lm.neckY + 0.005 && ax < 0.16;
  const wristX = Math.abs(B('hand_l').x) - 0.03;
  const hipY = B('thigh_l').y;
  const front = n.z * lm.fwd;
  return { ax, arm, head, wristX, hipY, front, elbowX: Math.abs(B('lowerarm_l').x) };
}

// A disc (cx, cy, r) on the chest front.
const onChestDisc = (p, n, lm, cx, cy, r) => n.z * lm.fwd > 0.2 && (p.z - lm.chestFrontZ) * lm.fwd > -0.1 && Math.hypot(p.x - cx, p.y - cy) < r;

// Point-in-polygon on the frontal plane (mirror: use |x|).
function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const COSTUMES = {
  // Robin, the bright classic: red tunic, green sleeves, gloves and leggings, yellow belt, a
  // yellow disc on the chest with a black wing chevron.
  robin: {
    body: 'm',
    colors: { skin: 0xc99a7c, tunic: 0xc8323c, sleeves: 0x3f9e5a, legs: 0x2f7a46, glove: 0x3f9e5a, boot: 0x1a1a1f, belt: 0xf2d24b, disc: 0xf2d24b, mark: 0x0b0b12, trunks: 0x2f7a46 },
    lines: 'ink',
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return 'skin';
      if (z.arm) return z.ax > z.wristX - 0.05 ? 'glove' : z.ax < z.elbowX - 0.04 ? 'sleeves' : 'skin';
      if (p.y < lm.kneeY - 0.06) return 'boot';
      if (Math.abs(p.y - (lm.beltY - 0.01)) < 0.028 && z.ax < lm.hipHalfWidth + 0.06) return 'belt';
      if (p.y < lm.beltY - 0.03) return p.y > z.hipY - 0.1 + z.ax * 0.2 ? 'trunks' : 'legs';
      if (onChestDisc(p, n, lm, 0.09 * Math.sign(lm.fwd), lm.chestY + 0.05, 0.042)) {
        const dx = (p.x - 0.09 * Math.sign(lm.fwd)), dy = p.y - lm.chestY - 0.05;
        return inPoly(Math.abs(dx), dy, [[0, -0.022], [0.028, 0.012], [0.016, 0.016], [0, -0.004]]) ? 'mark' : 'disc';
      }
      return 'tunic';
    },
  },
  // Robin, modern: armoured, black with a red torso and forearm guards, yellow disc, hooded cape.
  robinModern: {
    body: 'm',
    colors: { skin: 0xc99a7c, tunic: 0xa82a32, panel: 0x1c1d24, sleeves: 0x1c1d24, legs: 0x1c1d24, glove: 0x1c1d24, guard: 0xa82a32, boot: 0x14151a, belt: 0xd9a92c, disc: 0xd9a92c, mark: 0x0b0b12, trunks: 0x1c1d24 },
    lines: 'light', lineColor: 0x56657f,
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return 'skin';
      if (z.arm) return z.ax > z.wristX - 0.03 ? 'glove' : z.ax > z.elbowX + 0.02 ? 'guard' : 'sleeves';
      if (p.y < lm.kneeY - 0.06) return 'boot';
      if (Math.abs(p.y - (lm.beltY - 0.01)) < 0.024 && z.ax < lm.hipHalfWidth + 0.06) return 'belt';
      if (p.y < lm.beltY - 0.03) return 'legs';
      if (onChestDisc(p, n, lm, 0, lm.chestY + 0.02, 0.045)) return Math.hypot(p.x, p.y - lm.chestY - 0.02) < 0.03 && Math.abs(p.x) < 0.006 + (lm.chestY + 0.05 - p.y) * 0.4 ? 'mark' : 'disc';
      return z.front > -0.35 && z.ax < 0.13 ? 'tunic' : 'panel';
    },
  },
  // Robin with the staff: a long split tunic in deep red over black, high collar, yellow sash.
  robinStaff: {
    body: 'm',
    colors: { skin: 0xc99a7c, tunic: 0x7a1e28, sleeves: 0x16171d, legs: 0x16171d, glove: 0x16171d, boot: 0x2a1f18, belt: 0xf2d24b, collar: 0x16171d, stripe: 0xf2d24b },
    lines: 'light', lineColor: 0x6a5a66,
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return 'skin';
      if (z.arm) return z.ax > z.wristX - 0.05 ? 'glove' : 'sleeves';
      if (p.y < lm.kneeY - 0.02) return 'boot';
      if (Math.abs(p.y - (lm.beltY - 0.01)) < 0.03 && z.ax < lm.hipHalfWidth + 0.06) return 'belt';
      if (p.y > lm.neckY - 0.04) return 'collar';
      if (p.y < lm.beltY - 0.03) return 'legs';
      // A diagonal trim from the left shoulder to the right hip.
      if (z.front > 0 && Math.abs(p.y - (lm.neckY - 0.04) + (p.x * Math.sign(lm.fwd) + 0.12) * 0.9) < 0.014) return 'stripe';
      return 'tunic';
    },
  },
  // Batgirl: deep purple, black cowl, gloves and boots, yellow belt and a yellow bat.
  batgirl: {
    body: 'f',
    colors: { skin: 0xe0ac86, suit: 0x55357e, dark: 0x18161f, belt: 0xf2d24b, emblem: 0xf2d24b },
    lines: 'light', lineColor: 0x2a1c40,
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return p.y < lm.eyeY - 0.05 && (p.z - lm.headCenter.z) * lm.fwd > lm.headRadius * 0.1 && z.ax < 0.08 ? 'skin' : 'dark';
      if (z.arm) return z.ax > z.elbowX + 0.03 ? 'dark' : 'suit';
      if (p.y < lm.kneeY - 0.04) return 'dark';
      if (Math.abs(p.y - lm.beltY) < 0.026 && z.ax < lm.hipHalfWidth + 0.06) return 'belt';
      if (z.front > 0.15 && (p.z - lm.chestFrontZ) * lm.fwd > -0.1 && inPoly(z.ax, p.y - lm.chestY - 0.07, BAT_SMALL)) return 'emblem';
      return 'suit';
    },
  },
  // The hooded gunman: grey shirt with a red bat, dark trousers, boots (the jacket and helmet are
  // modelled parts).
  redHood: {
    body: 'm',
    colors: { skin: 0xc99a7c, shirt: 0x4a4e58, emblem: 0xb8262e, legs: 0x23252e, boot: 0x2a1f18, belt: 0x2a1f18, glove: 0x1a1410 },
    lines: 'ink',
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return 'skin';
      if (z.arm) return z.ax > z.wristX - 0.04 ? 'glove' : 'shirt';
      if (p.y < lm.kneeY - 0.08) return 'boot';
      if (Math.abs(p.y - (lm.beltY - 0.02)) < 0.02 && z.ax < lm.hipHalfWidth + 0.06) return 'belt';
      if (p.y < lm.beltY - 0.03) return 'legs';
      if (z.front > 0.1 && (p.z - lm.chestFrontZ) * lm.fwd > -0.1 && inPoly(z.ax, p.y - lm.chestY - 0.01, BAT_WIDE)) return 'emblem';
      return 'shirt';
    },
  },
  // The far-future Batman: black, a big red bat across the chest, no cape.
  futureBat: {
    body: 'm',
    colors: { skin: 0xc99a7c, suit: 0x121318, emblem: 0xd0262f, dark: 0x0b0b10 },
    lines: 'light', lineColor: 0x3a4660,
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return 'suit';
      if (z.front > 0.05 && !z.arm && (p.z - lm.chestFrontZ) * lm.fwd > -0.12 && inPoly(z.ax, p.y - lm.chestY + 0.0, BAT_WIDE.map(([x, y]) => [x * 1.35, y * 1.35]))) return 'emblem';
      if (z.arm && z.ax > z.wristX - 0.05) return 'dark';
      return 'suit';
    },
  },
  // The gaslight Batman: dark grey under a long coat, leather browns, a stitched bat.
  gaslightBat: {
    body: 'm',
    colors: { skin: 0xc99a7c, suit: 0x45474e, dark: 0x1c1b1f, leather: 0x4a3324, belt: 0x6a4a2a, emblem: 0x1c1b1f },
    lines: 'ink',
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return 'dark';
      if (z.arm) return z.ax > z.elbowX + 0.04 ? 'leather' : 'suit';
      if (p.y < lm.kneeY + 0.02) return 'leather';
      if (Math.abs(p.y - lm.beltY) < 0.03 && z.ax < lm.hipHalfWidth + 0.06) return 'belt';
      if (z.front > 0.15 && (p.z - lm.chestFrontZ) * lm.fwd > -0.1 && inPoly(z.ax, p.y - lm.chestY - 0.02, BAT_SMALL)) return 'emblem';
      return 'suit';
    },
  },
  // The flying man: blue, red boots and trunks, yellow belt; the shield is a modelled decal.
  superman: {
    body: 'm',
    colors: { skin: 0xd9a882, suit: 0x2c56b0, red: 0xc8262f, belt: 0xf2d24b },
    lines: 'ink',
    region(p, n, lm, B) {
      const z = zones(p, n, lm, B);
      if (z.head) return 'skin';
      if (z.arm) return 'suit';
      if (p.y < lm.kneeY - 0.07) return 'red';
      if (Math.abs(p.y - (lm.beltY - 0.005)) < 0.02 && z.ax < lm.hipHalfWidth + 0.06) return 'belt';
      if (p.y < lm.beltY - 0.025 && p.y > z.hipY - 0.11 + z.ax * 0.25) return 'red';
      return 'suit';
    },
  },
};

// Bat shapes for the painted emblems (metres, right half mirrored by |x|): our own silhouettes.
const BAT_SMALL = [[0, 0.03], [0.012, 0.022], [0.02, 0.034], [0.03, 0.02], [0.07, 0.026], [0.085, 0.0], [0.06, 0.006], [0.05, -0.012], [0.035, 0.0], [0.02, -0.018], [0.0, -0.04]];
const BAT_WIDE = [[0, 0.03], [0.014, 0.024], [0.022, 0.044], [0.034, 0.024], [0.1, 0.04], [0.16, 0.0], [0.11, 0.004], [0.09, -0.02], [0.06, -0.004], [0.035, -0.03], [0.0, -0.06]];

export const COSTUME_IDS = Object.keys(COSTUMES);
export const costumeTexName = (id) => `hero_${id}`;
