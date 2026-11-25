// Bakes the lazy animation packs listed in scripts/anim-packs.mjs, end to end:
//   1. FBX -> GLB (scripts/fbx2glb.mjs; needs a vite dev server, DEV_URL) for any clip lacking one
//   2. retarget onto the game skeleton (scripts/retarget-mocap.mjs --map mixamo --no-ease --pack)
//   3. shrink: drop unused tracks, resample, 16-bit rotations (scripts/optimize-assets.mjs)
//   4. derive kind / loop / events into src/config/mocapData.<pack>.js (scripts/clip-events.mjs)
//
//   MIXAMO_DIR=../gotham/assets-src/mixamo DEV_URL=http://localhost:5370 node scripts/bake-packs.mjs [pack ...]
// Clips in DROPPED (anim-packs.mjs) or without a downloaded FBX are skipped and reported.
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS, PACK_CLIPS, DROPPED, bakeSpec } from './anim-packs.mjs';
import { mixamoDir } from './mixamo-fetch.mjs';
import { optimizeAnims, quantizeRotations } from './optimize-assets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mixamoDir();
const want = process.argv.slice(2);
const node = (script, args) => execFileSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { cwd: ROOT, stdio: 'inherit' });
process.chdir(ROOT);

for (const pack of PACKS.filter((p) => !want.length || want.includes(p))) {
  const clips = Object.entries(PACK_CLIPS).filter(([k, c]) => c.pack === pack && !DROPPED[k]);
  const missing = clips.filter(([k]) => !existsSync(path.join(dir, k + '.fbx'))).map(([k]) => k);
  const have = clips.filter(([k]) => existsSync(path.join(dir, k + '.fbx')));
  const stale = have.filter(([k]) => {
    const g = path.join(dir, k + '.glb');
    return !existsSync(g) || statSync(g).mtimeMs < statSync(path.join(dir, k + '.fbx')).mtimeMs;
  }).map(([k]) => path.join(dir, k + '.fbx'));
  for (let i = 0; i < stale.length; i += 20) node('fbx2glb.mjs', stale.slice(i, i + 20));
  if (!have.length) { console.log(`${pack}: nothing to bake`); continue; }
  node('retarget-mocap.mjs', ['--map', 'mixamo', '--no-ease', '--pack', pack, ...have.map(([k, c]) => `${k}=${bakeSpec(path.join(dir, k + '.glb'), c)}`)]);
  await optimizeAnims(`anims_${pack}.glb`);
  await quantizeRotations(`anims_${pack}.glb`);
  node('clip-events.mjs', ['--pack', pack]);
  const mb = statSync(path.join(ROOT, 'public/assets', `anims_${pack}.glb`)).size / 1e6;
  console.log(`${pack}: ${have.length} clips baked, ${mb.toFixed(2)} MB${missing.length ? `; no FBX for ${missing.join(', ')}` : ''}`);
}
