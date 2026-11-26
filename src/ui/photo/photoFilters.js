// Photo mode filters (workstream L1, item 7). Pure: the list, the labels, the shader codes, and a
// per-pixel JS mirror of the colour maths the post pass (photoPost.js) runs on the GPU. The mirror
// is what the unit tests pin; the shader adds the spatial parts (dots, grid lines, blur) on top.
// Colours are the canvas's own (sRGB-encoded) values in 0..1, the same numbers the shader reads.

export const PHOTO_FILTERS = ['ink', 'noir', 'golden', 'blueprint', 'neon', 'pop', 'sepia'];
export const PHOTO_FILTER_LABEL = {
  ink: 'Ink', noir: 'Noir', golden: 'Golden-age print', blueprint: 'Blueprint', neon: 'Neon', pop: 'Pop', sepia: 'Sepia',
};
// The post shader's uFilter (0 = untouched).
export const FILTER_CODE = { ink: 0, noir: 1, golden: 2, blueprint: 3, neon: 4, pop: 5, sepia: 6 };

export const FILTER_COLORS = {
  ink: [0.043, 0.043, 0.07], paper: [0.937, 0.902, 0.812], accent: [0.78, 0.2, 0.235],
  goldPaper: [0.93, 0.86, 0.66], goldInk: [0.14, 0.09, 0.07],
  bpDark: [0.05, 0.17, 0.36], bpLight: [0.5, 0.72, 0.95], bpLine: [0.92, 0.97, 1],
  neonA: [1, 0.2, 0.8], neonB: [0.2, 0.95, 1], neonBase: [0.03, 0, 0.06],
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const luma = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

// Golden-age print: four ink levels per channel (a cheap four-colour press).
export const posterize = (v, levels = 4) => Math.round(clamp01(v) * (levels - 1)) / (levels - 1);

// rgb: [r, g, b] 0..1. edge: 0..1, the ink line strength the shader measures from the picture.
export function filterRgb(name, rgb, edge = 0) {
  const C = FILTER_COLORS;
  const L = luma(rgb);
  let c = rgb;
  switch (name) {
    case 'noir': {
      const mx = Math.max(...rgb), mn = Math.min(...rgb);
      const red = smoothstep(0.35, 0.6, (mx - mn) / Math.max(mx, 1e-3)) * (Math.max(rgb[1], rgb[2]) < rgb[0] * 0.7 ? 1 : 0);
      const bw = mix(C.ink, C.paper, smoothstep(0.18, 0.42, L));
      const k = 0.35 + 0.9 * L;
      c = mix(mix(bw, [C.accent[0] * k, C.accent[1] * k, C.accent[2] * k], red), C.ink, edge);
      break;
    }
    case 'golden': {
      const p = rgb.map((v) => posterize(v));
      c = mix(p, [p[0] + 0.06, p[1] * 0.93 + 0.04, p[2] * 0.78], 0.6);
      c = mix(c, C.goldPaper, smoothstep(0.75, 1, L) * 0.6);
      c = mix(c, C.goldInk, smoothstep(0.18, 0.05, L));
      c = mix(c, C.goldInk, edge);
      break;
    }
    case 'blueprint': {
      c = mix(C.bpDark, C.bpLight, clamp01(L * 0.8));
      c = mix(c, C.bpLine, edge);
      break;
    }
    case 'neon': {
      const s = rgb.map((v) => clamp01((v - L) * 2.2 + L));
      const k = smoothstep(0.05, 0.6, L) * 0.55;
      const glow = mix(C.neonA, C.neonB, smoothstep(0.3, 0.7, rgb[2] - rgb[0] + 0.5));
      c = [0, 1, 2].map((i) => s[i] * k + C.neonBase[i] + glow[i] * edge * 1.2);
      break;
    }
    case 'pop': {
      c = rgb.map((v) => clamp01(L + (v - L) * 1.9) * 1.12);
      break;
    }
    case 'sepia': {
      const s = [
        rgb[0] * 0.393 + rgb[1] * 0.769 + rgb[2] * 0.189,
        rgb[0] * 0.349 + rgb[1] * 0.686 + rgb[2] * 0.168,
        rgb[0] * 0.272 + rgb[1] * 0.534 + rgb[2] * 0.131,
      ];
      c = mix(rgb, s, 0.92);
      break;
    }
    default: return [...rgb];
  }
  return c.map(clamp01);
}

// Focus as a stylised depth cue: 0 in the focal plane, up to 1 far from it. depth and focus in
// metres; aperture 0 (off) .. 1 (shallow). Mirrors cocAt() in photoPost.js.
export function focusAmount(depth, focus, aperture) {
  if (!(aperture > 0) || !(focus > 0)) return 0;
  const d = Math.max(depth, 0.05);
  return clamp01(Math.abs(1 - focus / d) * aperture * 1.6);
}

// What the post pass may spend, from quality flags (never the tier name). potato/low ('depth'
// normals) get the halftone fade alone; medium and up add an 8-tap posterised blur.
export function photoPostQuality(quality = {}) {
  const rich = quality.normals === 'mrt';
  return { blurTaps: rich ? 8 : 0, edgeTaps: true };
}
