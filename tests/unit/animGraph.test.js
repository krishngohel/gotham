import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createAnimGraph, canExit } from '../../src/anim/graph.js';
import { clipInfo, deriveStrikeEvents, registerClipData } from '../../src/anim/clips.js';
import { createDeadBlend } from '../../src/anim/deadBlend.js';
import { createOverlays } from '../../src/anim/overlay.js';

function fakeAnimator() {
  const a = {
    current: null, plays: [], updates: 0,
    play(name, opts) { a.plays.push([name, opts]); a.current = { name, timeScale: opts.timeScale, getClip: () => ({ name, duration: clipInfo(name)?.duration ?? 1 }) }; return a.current; },
    get currentAction() { return a.current; },
    update() { a.updates++; },
  };
  return a;
}

describe('clip events', () => {
  it('reads baked events for mocap clips and derives them for code strikes', () => {
    const jab = clipInfo('Punch_Jab');
    expect(jab.events.contact).toBeCloseTo(0.4);
    expect(jab.events.cancel).toBeGreaterThan(jab.events.contact);
    expect(jab.events.recover).toBeGreaterThan(jab.events.cancel);
    const ham = clipInfo('Punch_Hammer');
    expect(ham.source).toBe('code');
    expect(ham.events.contact).toBe(0.34);
    const d = deriveStrikeEvents(1, 0.4);
    expect(d.warpStart).toBeLessThan(0.4);
    expect(d.cancel).toBeGreaterThan(0.4);
    expect(d.recover).toBeLessThanOrEqual(1);
  });
  it('registers a pack without replacing preloaded clips', () => {
    registerClipData({ Test_Pack_Strike: { duration: 1, contact: 0.5, kind: 'strike', events: { contact: 0.5, cancel: 0.6, recover: 0.8, end: 1, footL: [0.1], footR: [] } }, Punch_Jab: { duration: 9, contact: 9 } });
    expect(clipInfo('Test_Pack_Strike').events.cancel).toBe(0.6);
    expect(clipInfo('Punch_Jab').duration).not.toBe(9);
  });
});

describe('animation graph', () => {
  it('fires contact when the clip clock reaches it, at the clip speed, from the start trim', () => {
    const anim = fakeAnimator();
    const bus = { got: [], emit(n, d) { this.got.push([n, d.name]); } };
    const g = createAnimGraph({ animator: anim, events: bus });
    const seen = [];
    g.play('Punch_Jab', { state: 'strike', timeScale: 2, startAt: 0.2, on: { contact: () => seen.push(['contact', g.time]), cancel: () => seen.push(['cancel', g.time]) } });
    let t = 0;
    while (!seen.length && t < 1) { g.advance(1 / 120); anim.update(); g.animUpdate?.(); t += 1 / 120; resetFrame(g, anim); }
    // (0.4 - 0.2) / 2 = 0.1 s of actor time.
    expect(t).toBeGreaterThanOrEqual(0.1 - 1e-9);
    expect(t).toBeLessThan(0.1 + 1 / 120 + 1e-9);
    expect(bus.got.some(([n, e]) => n === 'animEvent' && e === 'contact')).toBe(true);
  });
  it('a hit-stop (dt 0) holds the clock and its events', () => {
    const anim = fakeAnimator();
    const g = createAnimGraph({ animator: anim });
    let hits = 0;
    g.play('Punch_Cross', { state: 'strike', startAt: 0.45, on: { contact: () => hits++ } });
    g.advance(0); resetFrame(g, anim);
    expect(hits).toBe(0);
    g.advance(0.1); resetFrame(g, anim);
    expect(hits).toBe(1);
    g.advance(0.1); resetFrame(g, anim);
    expect(hits).toBe(1);
  });
  it('clocks itself from the animator when no control advanced it, once per frame', () => {
    const anim = fakeAnimator();
    const g = createAnimGraph({ animator: anim });
    g.play('Punch_Jab', { state: 'strike' });
    anim.update(0.1);
    expect(g.time).toBeCloseTo(0.1);
    g.advance(0.1); anim.update(0.1);
    expect(g.time).toBeCloseTo(0.2);
  });
  it('steps aside when someone plays straight on the animator', () => {
    const anim = fakeAnimator();
    const g = createAnimGraph({ animator: anim });
    g.play('Punch_Jab', { state: 'strike' });
    anim.play('Hit_Head', { timeScale: 1 });
    anim.update(0.1);
    expect(g.state).toBe('external');
  });
  it('exit rules: strike -> strike only from cancel; counters before contact; react any time', () => {
    const at = (t) => (e) => ({ contactSoon: t >= 0.38, contact: t >= 0.4, cancel: t >= 0.5, recover: t >= 0.77 })[e];
    expect(canExit('strike', at(0.3), 'strike')).toBe(false);
    expect(canExit('strike', at(0.55), 'strike')).toBe(true);
    expect(canExit('strike', at(0.3), 'counter')).toBe(true);
    expect(canExit('strike', at(0.45), 'counter')).toBe(false);
    expect(canExit('strike', at(0.45), 'react')).toBe(true);
    expect(canExit('strike', at(0.6), 'loco')).toBe(false);
    expect(canExit('strike', at(0.8), 'loco')).toBe(true);
    expect(canExit('react', at(0.1), 'react')).toBe(true);
  });
  it('loops fire their foot plants every cycle', () => {
    registerClipData({ Test_Loop: { duration: 1, kind: 'loop', loop: true, events: { end: 1, footL: [0.25], footR: [0.75] } } });
    const anim = fakeAnimator();
    const bus = { feet: 0, emit(n, d) { if (d.name.startsWith('foot')) this.feet++; } };
    const g = createAnimGraph({ animator: anim, events: bus });
    g.play('Test_Loop', { state: 'loco', once: false });
    for (let i = 0; i < 30; i++) { g.advance(0.1); resetFrame(g, anim); }
    expect(bus.feet).toBe(6);
  });
});

// The animator's update clears the per-frame "advanced" flag.
function resetFrame(g, anim) { anim.update(0); }

describe('dead blending', () => {
  it('starts from the old pose and lands exactly on the new one', () => {
    const bones = [new THREE.Bone(), new THREE.Bone()];
    const pelvis = bones[0];
    const db = createDeadBlend(bones, pelvis);
    const q0 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.0);
    const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.1);
    const qNew = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2);
    // Two frames of the old clip turning.
    for (const q of [q0, q1]) { for (const b of bones) b.quaternion.copy(q); db.apply(1 / 60); db.record(1 / 60); }
    db.start(0.1);
    // The new clip's pose, written by the mixer.
    for (const b of bones) b.quaternion.copy(qNew);
    db.apply(1 / 60);
    // First blended frame: still close to the old pose (no pop).
    expect(bones[1].quaternion.angleTo(q1)).toBeLessThan(0.35);
    db.record(1 / 60);
    for (let i = 0; i < 12; i++) { for (const b of bones) b.quaternion.copy(qNew); db.apply(1 / 60); db.record(1 / 60); }
    expect(bones[1].quaternion.angleTo(qNew)).toBeLessThan(1e-4);
    expect(db.active).toBe(false);
  });
});

describe('overlays', () => {
  it('an upper-body layer moves the arms and leaves the legs alone', () => {
    const root = new THREE.Group();
    const pelvis = new THREE.Bone(); pelvis.name = 'pelvis';
    const spine = new THREE.Bone(); spine.name = 'spine_01';
    const arm = new THREE.Bone(); arm.name = 'upperarm_l';
    const thigh = new THREE.Bone(); thigh.name = 'thigh_l';
    root.add(pelvis); pelvis.add(spine); spine.add(arm); pelvis.add(thigh);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1);
    const track = (n) => new THREE.QuaternionKeyframeTrack(`${n}.quaternion`, [0, 1], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]);
    const clip = new THREE.AnimationClip('Aim', 1, [track('upperarm_l'), track('thigh_l')]);
    const ov = createOverlays(root);
    ov.play('upper', clip, { weight: 1, fadeIn: 0 });
    ov.update(0.1); ov.apply();
    expect(arm.quaternion.angleTo(q)).toBeLessThan(1e-6);
    expect(thigh.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6);
  });
});
