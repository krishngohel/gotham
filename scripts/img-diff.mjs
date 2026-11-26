// Pixel difference between two screenshots of the same size: mean absolute difference (0-255),
// the share of pixels that differ by more than 24 levels in any channel, and optionally a
// side-by-side strip (A | B | difference x4) for docs. HUD and frame-counter pixels count too, so
// crop or hide them when that matters.
// Usage: node scripts/img-diff.mjs a.png b.png [strip.jpg] [crop: x,y,w,h]
import sharp from 'sharp';

const [a, b, out, crop] = process.argv.slice(2);
const region = crop ? (([left, top, width, height]) => ({ left, top, width, height }))(crop.split(',').map(Number)) : null;
const load = async (f) => { let s = sharp(f); if (region) s = s.extract(region); return s.removeAlpha().raw().toBuffer({ resolveWithObject: true }); };
const A = await load(a), B = await load(b);
const { width, height } = A.info;
const diff = Buffer.alloc(A.data.length);
let sum = 0, big = 0;
for (let i = 0; i < A.data.length; i += 3) {
  let m = 0;
  for (let c = 0; c < 3; c++) { const d = Math.abs(A.data[i + c] - B.data[i + c]); sum += d; m = Math.max(m, d); diff[i + c] = Math.min(255, d * 4); }
  if (m > 24) big++;
}
const px = width * height;
console.log(JSON.stringify({ a, b, width, height, meanAbs: +(sum / (px * 3)).toFixed(2), pctOver24: +((big / px) * 100).toFixed(2) }));
if (out) {
  const raw = { raw: { width, height, channels: 3 } };
  const strip = await sharp({ create: { width: width * 3, height, channels: 3, background: '#000' } })
    .composite([{ input: A.data, ...raw, left: 0, top: 0 }, { input: B.data, ...raw, left: width, top: 0 }, { input: diff, ...raw, left: width * 2, top: 0 }])
    .png().toBuffer();
  await sharp(strip).resize(Math.round(width * 3 / 2)).jpeg({ quality: 72 }).toFile(out);
}
