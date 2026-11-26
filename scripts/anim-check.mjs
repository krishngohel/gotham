// Automated quality gate for baked animation packs. For every clip: NaNs, duration, feet against
// the idle's toe height (sinking / floating), and the classic retarget failures on the joints:
// a knee or elbow bending the wrong way, and twisted forearms, wrists or neck (candy-wrapper).
// Thresholds are calibrated on the vetted clips of anims_mocap.glb, which must all pass.
//   node scripts/anim-check.mjs [pack ...|mocap]   (no args: every pack in anim-packs.mjs)
// Prints one line per flagged clip and a summary; exits 1 if any clip fails a hard check.
import * as THREE from 'three';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { samplePack } from './clip-events.mjs';
import { PACKS, PACK_CLIPS } from './anim-packs.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HINGES = { calf_l: 'foot_l', calf_r: 'foot_r', lowerarm_l: 'hand_l', lowerarm_r: 'hand_r' };
const TWISTS = { lowerarm_l: 'hand_l', lowerarm_r: 'hand_r', hand_l: 'middle_01_l', hand_r: 'middle_01_r', neck_01: 'Head', Head: null };
const AIRY = /^(air|acro|flight|evade|travel)$/;

// Swing-twist split of q about unit axis a: returns the twist angle (radians, -pi..pi).
export function twistAngle(q, a) {
  const d = q.x * a.x + q.y * a.y + q.z * a.z;
  const t = new THREE.Quaternion(a.x * d, a.y * d, a.z * d, q.w);
  if (t.lengthSq() < 1e-12) return Math.PI;
  t.normalize();
  const ang = 2 * Math.atan2(Math.hypot(t.x, t.y, t.z) * Math.sign(d || 1), t.w);
  return ang > Math.PI ? ang - 2 * Math.PI : ang < -Math.PI ? ang + 2 * Math.PI : ang;
}

// Per-joint measures of one sampled clip, relative to the joint's rest rotation.
function measure(clip, restOf, childDir) {
  const m = { hingeAxes: {}, maxTwist: {} };
  for (const j of Object.keys(HINGES)) m.hingeAxes[j] = [];
  for (const j of Object.keys(TWISTS)) m.maxTwist[j] = 0;
  for (const loc of clip.locals) {
    for (const j of Object.keys(HINGES)) {
      if (!loc[j] || !childDir(j)) continue;
      // Swing only (twist about the bone removed): the direction the joint actually bends.
      const d = restOf(j).clone().invert().multiply(loc[j]);
      const a = childDir(j), tw = twistAngle(d, a);
      const sw = d.clone().multiply(new THREE.Quaternion().setFromAxisAngle(a, tw).invert());
      const ang = 2 * Math.acos(Math.min(1, Math.abs(sw.w)));
      if (ang < THREE.MathUtils.degToRad(35)) continue;
      const s = Math.sign(sw.w) || 1;
      m.hingeAxes[j].push(new THREE.Vector3(sw.x * s, sw.y * s, sw.z * s).normalize());
    }
    for (const j of Object.keys(TWISTS)) {
      if (!loc[j] || !childDir(j)) continue;
      const d = restOf(j).clone().invert().multiply(loc[j]);
      m.maxTwist[j] = Math.max(m.maxTwist[j], Math.abs(twistAngle(d, childDir(j))));
    }
  }
  return m;
}

async function rigInfo(file) {
  const clips = await samplePack(file);
  const order = clips[0].order;
  const rest = new Map(order.map((o) => [o.name, o.rest]));
  // Bone direction in the parent joint's local frame = the child's rest translation; read it
  // from frame positions of the rest... simpler: from the pack's node translations via FK at rest.
  return { clips, rest };
}

export async function checkPack(file, { reference = null, kinds = {} } = {}) {
  const { NodeIO } = await import('@gltf-transform/core');
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
  const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
  const nodeT = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), new THREE.Vector3(...n.getTranslation())]));
  const childOf = { ...HINGES, ...TWISTS };
  const childDir = (j) => (childOf[j] && nodeT.get(childOf[j]) ? nodeT.get(childOf[j]).clone().normalize() : null);
  const { clips, rest } = await rigInfo(file);
  const restOf = (j) => rest.get(j);
  return clips.map((c) => ({ name: c.name, clip: c, ...measure(c, restOf, childDir), kind: kinds[c.name] }));
}

const deg = (r) => THREE.MathUtils.radToDeg(r);

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const want = process.argv.slice(2);
  // Reference: the vetted mocap pack and the idle's toe height.
  const ref = await checkPack(path.join(ROOT, 'public/assets/anims_mocap.glb'));
  const idle = (await samplePack(path.join(ROOT, 'public/assets/anims1.glb'))).find((c) => c.name === 'Idle_Loop');
  const idleToe = Math.min(idle.frames[0].ball_l[1], idle.frames[0].ball_r[1]);
  const refAxis = {};
  for (const j of Object.keys(HINGES)) {
    const s = new THREE.Vector3();
    for (const r of ref) for (const a of r.hingeAxes[j]) s.add(a);
    refAxis[j] = s.normalize();
  }
  const refTwist = {};
  for (const j of Object.keys(TWISTS)) refTwist[j] = Math.max(...ref.map((r) => r.maxTwist[j]));
  console.log(`reference: idle toe y ${idleToe.toFixed(3)}; hinge axes ${Object.entries(refAxis).map(([k, v]) => `${k} (${v.toArray().map((x) => x.toFixed(2))})`).join(' ')}`);
  console.log(`reference max twist (deg): ${Object.entries(refTwist).map(([k, v]) => `${k} ${deg(v).toFixed(0)}`).join(', ')}`);

  const targets = want.length ? want : PACKS;
  let hard = 0, total = 0;
  const report = [];
  for (const pack of targets) {
    const file = pack === 'mocap' ? 'public/assets/anims_mocap.glb' : `public/assets/anims_${pack}.glb`;
    let data = {};
    if (pack !== 'mocap') data = (await import(pathToFileURL(path.join(ROOT, `src/config/mocapData.${pack}.js`)).href)).MOCAP_DATA;
    const res = await checkPack(path.join(ROOT, file));
    for (const r of res) {
      total++;
      const src = PACK_CLIPS[r.name] ?? PACK_CLIPS[r.name.replace(/_M$/, '')];
      const cat = src?.cat ?? '';
      const problems = [], notes = [];
      const c = r.clip;
      if (c.nan) problems.push('NaN');
      if (c.duration < 0.25 || c.duration > (src?.loop ? 60 : 10)) problems.push(`duration ${c.duration.toFixed(2)}s`);
      if (data[r.name] && Math.abs(data[r.name].duration - c.duration) > 2e-3) problems.push('data/GLB duration mismatch');
      const toes = c.frames.map((f) => Math.min(f.ball_l[1], f.ball_r[1]));
      // retarget-mocap aligns each clip's lowest toe with the idle's, so look at the typical frame:
      // a grounded clip keeps a foot near the floor most of the time.
      const minToe = Math.min(...toes) - idleToe;
      if (minToe < -0.2) problems.push(`toe sinks ${minToe.toFixed(2)} m`);
      const med = [...toes].sort((x, y) => x - y)[Math.floor(toes.length / 2)] - idleToe;
      if (med > 0.12 && !AIRY.test(cat) && src?.kind !== 'knockdown' && !/sit|sniper|medic/.test(cat)) notes.push(`median lowest toe ${med.toFixed(2)} m above the floor`);
      const air = toes.filter((t) => t - idleToe > 0.15).length / toes.length;
      if (air > 0.5 && !AIRY.test(cat) && src?.kind !== 'knockdown') notes.push(`airborne ${Math.round(air * 100)}% of frames`);
      // Wrong-way hinges: a big bend about an axis far from (or opposite to) the vetted one.
      for (const j of Object.keys(HINGES)) {
        const axes = r.hingeAxes[j];
        if (!axes.length) continue;
        const back = axes.filter((a) => a.angleTo(refAxis[j]) > THREE.MathUtils.degToRad(120)).length;
        const side = axes.filter((a) => { const t = a.angleTo(refAxis[j]); return t > THREE.MathUtils.degToRad(60) && t <= THREE.MathUtils.degToRad(120); }).length;
        if (back / axes.length > 0.1) problems.push(`${j} bends backwards in ${Math.round((100 * back) / axes.length)}% of bent frames`);
        if (side / axes.length > 0.25) problems.push(`${j} bends sideways in ${Math.round((100 * side) / axes.length)}% of bent frames`);
      }
      for (const j of Object.keys(TWISTS)) {
        // The vetted clips reach 108-146 deg on wrists/forearms in a few frames; beyond these a
        // forearm reads as wrung out.
        const lim = THREE.MathUtils.degToRad({ lowerarm_l: 130, lowerarm_r: 130, hand_l: 155, hand_r: 155, neck_01: 70, Head: 180 }[j]);
        if (r.maxTwist[j] > lim) problems.push(`${j} twist ${deg(r.maxTwist[j]).toFixed(0)} deg (ref max ${deg(refTwist[j]).toFixed(0)})`);
      }
      if (problems.length) hard++;
      report.push({ pack, name: r.name, problems, notes });
      if (problems.length || notes.length) console.log(`${pack}/${r.name}: ${[...problems.map((p) => 'FAIL ' + p), ...notes.map((n) => 'note ' + n)].join('; ')}`);
    }
  }
  console.log(`${total} clips checked, ${hard} with hard failures`);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  if (process.env.CHECK_JSON) { mkdirSync(path.dirname(process.env.CHECK_JSON), { recursive: true }); writeFileSync(process.env.CHECK_JSON, JSON.stringify(report, null, 1)); }
  process.exit(hard ? 1 : 0);
}
