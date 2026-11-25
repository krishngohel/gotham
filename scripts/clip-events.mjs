// Samples baked animation packs (joint world positions per frame, by forward kinematics on the
// pack's own skeleton) and derives per-clip events with scripts/anim-events.mjs.
//
//   node scripts/clip-events.mjs --existing
//       events for the shipped anims_mocap.glb clips -> src/config/clipEvents.js (an additive file:
//       mocapData.js is never touched)
//   node scripts/clip-events.mjs --pack <name>
//       adds `kind` and `events` to every entry of src/config/mocapData.<name>.js, from the
//       optimised public/assets/anims_<name>.glb (so events describe the shipped samples)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deriveEvents } from './anim-events.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Values of an accessor as floats (rotation outputs may be stored as normalised integers).
function floats(acc) {
  const a = acc.getArray();
  if (!acc.getNormalized()) return Array.from(a);
  const div = a instanceof Int16Array ? 32767 : a instanceof Int8Array ? 127 : a instanceof Uint16Array ? 65535 : 255;
  return Array.from(a, (v) => Math.max(-1, v / div));
}

function sampler(ch) {
  const s = ch.getSampler();
  return { times: Array.from(s.getInput().getArray()), values: floats(s.getOutput()), size: s.getOutput().getElementSize() };
}
function at(sm, t, out) {
  const { times, values, size } = sm;
  let i = 0;
  while (i < times.length - 1 && times[i + 1] <= t) i++;
  const j = Math.min(i + 1, times.length - 1);
  const k = j === i ? 0 : THREE.MathUtils.clamp((t - times[i]) / (times[j] - times[i]), 0, 1);
  if (size === 4) return out.copy(new THREE.Quaternion().fromArray(values, i * 4).normalize()).slerp(new THREE.Quaternion().fromArray(values, j * 4).normalize(), k);
  return out.copy(new THREE.Vector3().fromArray(values, i * 3)).lerp(new THREE.Vector3().fromArray(values, j * 3), k);
}

// Every clip of a pack sampled at `fps`: per frame, joint positions (Armature space, y up) and
// local rotations; plus NaN detection on the raw data.
export async function samplePack(file, fps = 30) {
  const doc = await io.read(file);
  const nodes = doc.getRoot().listNodes();
  const arm = nodes.find((n) => n.getName() === 'Armature');
  const roots = arm ? arm.listChildren() : nodes.filter((n) => !n.getParentNode());
  const order = [];
  const visit = (n, parent) => { order.push({ n, name: n.getName(), parent }); for (const c of n.listChildren()) visit(c, n.getName()); };
  for (const r of roots) visit(r, null);
  const clips = [];
  for (const anim of doc.getRoot().listAnimations()) {
    const chans = new Map();
    let nan = false, dur = 0;
    for (const ch of anim.listChannels()) {
      const sm = sampler(ch);
      if (sm.values.some(Number.isNaN) || sm.times.some(Number.isNaN)) nan = true;
      dur = Math.max(dur, sm.times[sm.times.length - 1]);
      chans.set(`${ch.getTargetNode().getName()}.${ch.getTargetPath()}`, sm);
    }
    const n = Math.round(dur * fps) + 1;
    const frames = [], locals = [];
    const q = new THREE.Quaternion(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const t = Math.min(dur, i / fps);
      const wq = new Map(), wp = new Map(), pos = {}, loc = {};
      for (const { n: node, name, parent } of order) {
        const rs = chans.get(`${name}.rotation`), ts = chans.get(`${name}.translation`);
        const lq = rs ? at(rs, t, q).clone() : new THREE.Quaternion(...node.getRotation());
        const lt = ts ? at(ts, t, v).clone() : new THREE.Vector3(...node.getTranslation());
        const pq = parent ? wq.get(parent) : new THREE.Quaternion();
        const pp = parent ? wp.get(parent) : new THREE.Vector3();
        const p = lt.applyQuaternion(pq).add(pp);
        wq.set(name, pq.clone().multiply(lq));
        wp.set(name, p);
        pos[name] = [p.x, p.y, p.z];
        loc[name] = lq;
      }
      frames.push(pos);
      locals.push(loc);
    }
    clips.push({ name: anim.getName(), duration: dur, fps, frames, locals, nan, order: order.map((o) => ({ name: o.name, parent: o.parent, rest: new THREE.Quaternion(...o.n.getRotation()) })) });
  }
  return clips;
}

// The 56 clips of anims_mocap.glb predate kinds: classify them by name.
export function existingKind(name) {
  if (/Idle$|Strafe_[LR]$/.test(name)) return /Strafe/.test(name) ? 'loco' : 'loop';
  if (/^Goon_Taunt/.test(name)) return 'action';
  if (/^Goon_GetUp$/.test(name)) return 'getup';
  if (/^(Sweep_Fall|Fall_Flat|Getting_Thrown)$/.test(name)) return 'knockdown';
  if (/^Hit_/.test(name)) return 'react';
  return 'strike';
}

// Where a paired clip's victim starts relative to the attacker (metres, the attacker clip's x/z,
// the same axes as root motion): both source clips come from one Mixamo take, so their hips at
// frame 0 give the spacing. Scaled from Mixamo centimetres by our pelvis height / X Bot's.
async function hipsAtStart(file) {
  const doc = await io.read(file);
  const nodes = doc.getRoot().listNodes();
  const hips = nodes.find((n) => /Hips$/.test(n.getName()));
  const anim = doc.getRoot().listAnimations().reduce((a, b) => (b.listChannels().length > a.listChannels().length ? b : a));
  const ch = anim.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === 'translation');
  const local = ch ? new THREE.Vector3().fromArray(floats(ch.getSampler().getOutput()), 0) : new THREE.Vector3(...hips.getTranslation());
  const rest = new THREE.Vector3(...hips.getTranslation());
  const m = new THREE.Matrix4();
  for (let a = hips.getParentNode(); a; a = a.getParentNode()) m.premultiply(new THREE.Matrix4().compose(new THREE.Vector3(...a.getTranslation()), new THREE.Quaternion(...a.getRotation()), new THREE.Vector3(...a.getScale())));
  return { start: local.applyMatrix4(m), restY: rest.applyMatrix4(m).y };
}
export async function pairOffset(attackerGlb, victimGlb, pelvisHeight) {
  const a = await hipsAtStart(attackerGlb), v = await hipsAtStart(victimGlb);
  const unit = pelvisHeight / a.restY;
  return [+((v.start.x - a.start.x) * unit).toFixed(3), +((v.start.z - a.start.z) * unit).toFixed(3)];
}

const fmt = (obj) => JSON.stringify(obj, null, 1).replace(/\n\s*(-?\d|null)/g, ' $1').replace(/\n\s*\]/g, ' ]');

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  if (args[0] === '--existing') {
    const { MOCAP_DATA } = await import(pathToFileURL(path.join(ROOT, 'src/config/mocapData.js')).href);
    const clips = await samplePack(path.join(ROOT, 'public/assets/anims_mocap.glb'));
    const out = {};
    for (const c of clips) {
      const d = MOCAP_DATA[c.name];
      const kind = existingKind(c.name);
      out[c.name] = { kind, ...deriveEvents({ kind, fps: d.fps, duration: d.duration, contact: d.contact, limb: d.limb, frames: c.frames, root: d.root, ease: { lead: Math.round(0.08 * d.fps), tail: Math.round(0.15 * d.fps) } }) };
    }
    const header = '// Generated by scripts/clip-events.mjs --existing; do not edit by hand.\n'
      + '// Animation events for the clips of anims_mocap.glb (src/config/mocapData.js stays as it was):\n'
      + '// kind, and clip-second times derived from the motion (scripts/anim-events.mjs): strikes\n'
      + '// warpStart/contact/cancel/recover/end, reactions recover, knockdowns down/getUpStart,\n'
      + '// footL/footR plants. Contact equals MOCAP_DATA contact on its 1/fps frame.\n';
    writeFileSync(path.join(ROOT, 'src/config/clipEvents.js'), header + 'export const CLIP_EVENTS = ' + fmt(out) + ';\n');
    console.log(`wrote src/config/clipEvents.js (${Object.keys(out).length} clips)`);
  } else if (args[0] === '--pack') {
    const pack = args[1];
    const { PACK_CLIPS } = await import('./anim-packs.mjs');
    const dataFile = path.join(ROOT, `src/config/mocapData.${pack}.js`);
    const { MOCAP_DATA } = await import(pathToFileURL(dataFile).href + '?t=' + Date.now());
    const clips = await samplePack(path.join(ROOT, `public/assets/anims_${pack}.glb`));
    for (const c of clips) {
      const d = MOCAP_DATA[c.name];
      if (!d) continue;
      const src = PACK_CLIPS[c.name] ?? PACK_CLIPS[c.name.replace(/_M$/, '')];
      const kind = src.kind;
      d.kind = kind;
      d.loop = !!src.loop;
      d.events = deriveEvents({ kind, fps: d.fps, duration: d.duration, contact: d.contact, limb: d.limb, frames: c.frames, root: d.root });
      if (src.pairWith) {
        const { mixamoDir } = await import('./mixamo-fetch.mjs');
        const dir = mixamoDir();
        const att = clips.find((x) => x.name === src.pairWith);
        const fa = path.join(dir, src.pairWith + '.glb'), fv = path.join(dir, c.name + '.glb');
        const { existsSync } = await import('node:fs');
        if (att && existsSync(fa) && existsSync(fv)) d.pair = { with: src.pairWith, offset: await pairOffset(fa, fv, att.frames[0].pelvis[1]) };
      }
    }
    const header = `// Generated by scripts/retarget-mocap.mjs --pack ${pack} and scripts/clip-events.mjs; do not edit by hand.\n`
      + '// Same shape as mocapData.js (duration, contact, limb, reach, fps, root motion) plus kind, loop\n'
      + '// and events (clip seconds, derived from the motion; see scripts/anim-events.mjs and\n'
      + '// docs/design/anim-manifest.md). Contact is only meaningful for kind "strike".\n';
    writeFileSync(dataFile, header + 'export const MOCAP_DATA = ' + fmt(MOCAP_DATA) + ';\n');
    console.log(`events added to ${dataFile} (${clips.length} clips)`);
  } else {
    console.error('usage: node scripts/clip-events.mjs --existing | --pack <name>');
    process.exit(1);
  }
}
