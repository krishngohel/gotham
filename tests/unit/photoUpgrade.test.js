import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PHOTO_FILTERS, FILTER_CODE, filterRgb, focusAmount, photoPostQuality, posterize, luma } from '../../src/ui/photo/photoFilters.js';
import { exportSize, exportCap, bufferFor, thumbSize, EXPORT_MAX } from '../../src/ui/photo/photoExport.js';
import { addPhoto, createGallery, sanitizeGallery, entryBytes, GALLERY_KEY } from '../../src/ui/photo/photoGallery.js';
import { createItem, addItem, moveItem, hitItem, updateItem, removeItem, MAX_ITEMS, CAPTION_LINES, BUBBLE_LINES, sanitizeItemText } from '../../src/ui/photo/photoItems.js';
import { createEnvOverride, WEATHER_DEFAULT } from '../../src/ui/photo/photoEnv.js';
import { poseList, createPoser } from '../../src/ui/photo/photoPoses.js';
import { getQuality } from '../../src/render/quality.js';

const close = (a, b, e = 1e-6) => a.every((v, i) => Math.abs(v - b[i]) < e);

describe('photo filters', () => {
  it('every filter has a distinct shader code, ink is 0 and identity', () => {
    const codes = PHOTO_FILTERS.map((f) => FILTER_CODE[f]);
    expect(new Set(codes).size).toBe(PHOTO_FILTERS.length);
    expect(FILTER_CODE.ink).toBe(0);
    expect(filterRgb('ink', [0.3, 0.5, 0.7])).toEqual([0.3, 0.5, 0.7]);
    for (const f of ['noir', 'golden', 'blueprint', 'neon']) expect(PHOTO_FILTERS).toContain(f);
  });
  it('noir is black and white except strong reds', () => {
    const g = filterRgb('noir', [0.4, 0.5, 0.45]);
    // On the ink-to-paper line (the paper is warm, so not quite grey).
    expect(Math.max(...g) - Math.min(...g)).toBeLessThan(0.15);
    const r = filterRgb('noir', [0.8, 0.1, 0.1]);
    expect(r[0]).toBeGreaterThan(r[1] * 2);
    expect(close(filterRgb('noir', [0.9, 0.9, 0.9], 1), [0.043, 0.043, 0.07], 1e-3)).toBe(true);
  });
  it('golden-age print uses few levels and warm paper highlights', () => {
    expect(posterize(0.4)).toBeCloseTo(1 / 3);
    const w = filterRgb('golden', [1, 1, 1]);
    expect(w[0]).toBeGreaterThan(w[2]);
    const dark = filterRgb('golden', [0.02, 0.02, 0.02]);
    expect(luma(dark)).toBeLessThan(0.15);
  });
  it('blueprint is blue everywhere, lines white', () => {
    for (const c of [[0, 0, 0], [1, 0.2, 0.1], [0.5, 0.5, 0.5], [1, 1, 1]]) {
      const b = filterRgb('blueprint', c);
      expect(b[2]).toBeGreaterThan(b[0]);
    }
    expect(filterRgb('blueprint', [0.2, 0.2, 0.2], 1)[0]).toBeGreaterThan(0.9);
  });
  it('neon keeps darks dark and lights its lines', () => {
    expect(luma(filterRgb('neon', [0.03, 0.03, 0.03]))).toBeLessThan(0.05);
    const lit = filterRgb('neon', [0.1, 0.1, 0.4], 1);
    expect(Math.max(...lit)).toBeGreaterThan(0.9);
  });
  it('outputs stay in 0..1', () => {
    for (const f of PHOTO_FILTERS) for (const c of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0.2, 0.9, 0.4]]) {
      for (const v of filterRgb(f, c, 0.5)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });
});

describe('photo focus cue', () => {
  it('is zero in the focal plane and grows away from it', () => {
    expect(focusAmount(6, 6, 0.6)).toBe(0);
    expect(focusAmount(12, 6, 0.6)).toBeGreaterThan(focusAmount(8, 6, 0.6));
    expect(focusAmount(3, 6, 0.6)).toBeGreaterThan(focusAmount(5, 6, 0.6));
    expect(focusAmount(1000, 6, 1)).toBe(1);
  });
  it('off when the aperture or focus is zero', () => {
    expect(focusAmount(20, 6, 0)).toBe(0);
    expect(focusAmount(20, 0, 1)).toBe(0);
  });
  it('blur taps follow quality flags, cheap on potato and low', () => {
    expect(photoPostQuality(getQuality('potato')).blurTaps).toBe(0);
    expect(photoPostQuality(getQuality('low')).blurTaps).toBe(0);
    expect(photoPostQuality(getQuality('high')).blurTaps).toBe(8);
  });
});

describe('photo export size', () => {
  it('keeps the view aspect and names the long side', () => {
    expect(exportSize({ preset: '4k', viewW: 1600, viewH: 900, cap: 3840, glMax: 16384 })).toMatchObject({ w: 3840, h: 2160 });
    expect(exportSize({ preset: '1080', viewW: 800, viewH: 900, cap: 3840, glMax: 16384 })).toMatchObject({ w: 1707, h: 1920 });
    expect(exportSize({ preset: 'screen', viewW: 1280, viewH: 720 })).toMatchObject({ w: 1280, h: 720, clamped: false });
  });
  it('clamps to the tier cap, the GPU limit and 4K', () => {
    expect(exportCap(getQuality('potato'))).toBe(1920);
    expect(exportCap(getQuality('low'))).toBe(1920);
    expect(exportCap(getQuality('ultra'))).toBe(EXPORT_MAX);
    const s = exportSize({ preset: '4k', viewW: 1920, viewH: 1080, cap: exportCap(getQuality('low')), glMax: 16384 });
    expect(s).toMatchObject({ w: 1920, h: 1080, clamped: true });
    expect(exportSize({ preset: '4k', viewW: 1920, viewH: 1080, cap: 3840, glMax: 2048 }).w).toBe(2048);
    expect(exportSize({ preset: 'screen', viewW: 8000, viewH: 4000, cap: 99999, glMax: 99999 }).w).toBe(3840);
    // A very tall view: the short side can't pass the GPU limit either.
    const t = exportSize({ preset: '4k', viewW: 100, viewH: 4000, cap: 3840, glMax: 3000 });
    expect(Math.max(t.w, t.h)).toBeLessThanOrEqual(3000);
  });
  it('picks a pixel ratio three floors to the exact buffer size', () => {
    for (const [w, h, css] of [[3840, 2160, 1280], [3840, 2160, 1263], [1707, 1920, 777], [2560, 1440, 961]]) {
      const b = bufferFor(w, h, css);
      expect(Math.floor(b.cssW * b.pixelRatio)).toBe(w);
      expect(Math.floor(b.cssH * b.pixelRatio)).toBe(h);
    }
  });
  it('thumbnails are small', () => {
    expect(thumbSize(3840, 2160)).toEqual({ w: 320, h: 180 });
    expect(thumbSize(100, 50)).toEqual({ w: 100, h: 50 });
  });
});

const thumb = (n = 100) => `data:image/jpeg;base64,${'A'.repeat(n)}`;
const entry = (id, n) => ({ id, t: 1, w: 10, h: 10, filter: 'ink', caption: '', thumb: thumb(n) });
function memStorage({ quota = Infinity, blocked = false } = {}) {
  const m = new Map();
  return {
    m,
    getItem(k) { if (blocked) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { if (blocked) throw new Error('blocked'); if (v.length > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, v); },
    removeItem(k) { if (blocked) throw new Error('blocked'); m.delete(k); },
  };
}

describe('photo gallery', () => {
  it('keeps the newest within the count cap', () => {
    let list = [];
    for (let i = 0; i < 30; i++) list = addPhoto(list, entry(`p${i}`, 10), { maxCount: 24, maxBytes: 1e9 }).list;
    expect(list.length).toBe(24);
    expect(list[0].id).toBe('p29');
    expect(list.at(-1).id).toBe('p6');
  });
  it('keeps within the byte cap and refuses one oversized shot', () => {
    let list = [];
    for (let i = 0; i < 10; i++) list = addPhoto(list, entry(`p${i}`, 1000), { maxCount: 99, maxBytes: 3500 }).list;
    expect(list.reduce((n, e) => n + entryBytes(e), 0)).toBeLessThanOrEqual(3500);
    expect(list[0].id).toBe('p9');
    const r = addPhoto(list, entry('huge', 9000), { maxCount: 99, maxBytes: 3500 });
    expect(r.added).toBe(false);
    expect(r.list).toBe(list);
  });
  it('rejects malformed entries and sanitises loaded data', () => {
    expect(addPhoto([], { id: 'x', thumb: 'javascript:alert(1)' }).added).toBe(false);
    expect(sanitizeGallery('nope')).toEqual([]);
    expect(sanitizeGallery([entry('a', 5), entry('a', 5), { id: 3 }, null]).length).toBe(1);
  });
  it('stores under its own key and survives a reload', () => {
    const s = memStorage();
    const g = createGallery({ storage: s });
    expect(g.add(entry('a', 50))).toBe(true);
    expect(s.m.has(GALLERY_KEY)).toBe(true);
    expect(createGallery({ storage: s }).list().map((e) => e.id)).toEqual(['a']);
    g.remove('a');
    expect(createGallery({ storage: s }).count).toBe(0);
  });
  it('never throws when storage is blocked, full or corrupt', () => {
    const blocked = createGallery({ storage: memStorage({ blocked: true }) });
    expect(blocked.list()).toEqual([]);
    expect(blocked.add(entry('a', 10))).toBe(true); // kept for this session
    expect(() => blocked.clear()).not.toThrow();
    const full = memStorage({ quota: 700 });
    const g = createGallery({ storage: full });
    for (let i = 0; i < 5; i++) g.add(entry(`p${i}`, 200));
    expect(full.m.get(GALLERY_KEY).length).toBeLessThanOrEqual(700);
    const bad = memStorage();
    bad.m.set(GALLERY_KEY, '{not json');
    expect(createGallery({ storage: bad }).list()).toEqual([]);
    expect(createGallery({ storage: null }).add(entry('z', 5))).toBe(true);
  });
});

describe('photo bubbles and stickers', () => {
  it('creates items with original default text, kept on the picture', () => {
    const b = createItem('speech', { x: 2, y: -1, n: 0 });
    expect(b.x).toBe(0.98);
    expect(b.y).toBe(0.02);
    expect(BUBBLE_LINES).toContain(b.text);
    expect(() => createItem('logo')).toThrow();
    expect(createItem('burst', { n: 0 }).text).toMatch(/!$/);
  });
  it('moves an item with its tail and clamps', () => {
    const b = createItem('speech', { x: 0.5, y: 0.5 });
    const m = moveItem(b, 0.1, 0.2);
    expect(m.x).toBeCloseTo(0.6);
    expect(m.tx - m.x).toBeCloseTo(b.tx - b.x);
    expect(moveItem(b, 5, 5).x).toBe(0.98);
  });
  it('caps the count, picks the top-most, edits and removes', () => {
    let items = [];
    for (let i = 0; i < MAX_ITEMS + 3; i++) items = addItem(items, createItem('star', { x: 0.5, y: 0.5 }));
    expect(items.length).toBe(MAX_ITEMS);
    expect(hitItem(items, 0.5, 0.5, 1000, 600)).toBe(items.at(-1));
    expect(hitItem(items, 0.05, 0.95, 1000, 600)).toBe(null);
    const id = items[0].id;
    items = updateItem(items, id, { text: 'Hi <b>there</b>— friend' });
    expect(items[0].text).toBe('Hi bthere/b- friend');
    expect(removeItem(items, id).length).toBe(MAX_ITEMS - 1);
  });
  it('text is short and clean', () => {
    expect(sanitizeItemText('x'.repeat(200)).length).toBe(60);
    for (const l of [...CAPTION_LINES, ...BUBBLE_LINES]) expect(l.length).toBeLessThanOrEqual(48);
  });
});

describe('photo time of day and weather overrides', () => {
  it('is off without world.clock / world.weather', () => {
    const e = createEnvOverride({});
    expect(e.hasClock).toBe(false);
    expect(e.hasWeather).toBe(false);
    expect(e.setHour(3)).toBe(false);
    expect(() => e.restore()).not.toThrow();
    expect(createEnvOverride(null).hasClock).toBe(false);
  });
  it('pins the clock and restores an unpinned clock', () => {
    const clock = { hour: 23, pinned: null, pin(h) { this.pinned = h; this.hour = h; }, unpin() { this.pinned = null; }, set(h) { this.hour = h; } };
    const e = createEnvOverride({ clock });
    expect(e.hasClock).toBe(true);
    e.setHour(26);
    expect(clock.hour).toBe(2);
    expect(clock.pinned).toBe(2);
    e.restore();
    expect(clock.pinned).toBe(null);
    expect(clock.hour).toBe(23);
  });
  it('restores a clock the story had pinned, and a plain writable hour', () => {
    const clock = { hour: 21, pinned: 21, pin(h) { this.pinned = h; this.hour = h; }, unpin() { this.pinned = null; } };
    const e = createEnvOverride({ clock });
    e.setHour(12);
    e.restore();
    expect(clock.pinned).toBe(21);
    const plain = { hour: 4 };
    const e2 = createEnvOverride({ clock: plain });
    e2.setHour(10);
    expect(plain.hour).toBe(10);
    e2.restore();
    expect(plain.hour).toBe(4);
  });
  it('sets and restores weather', () => {
    const weather = { state: 'rain', set(n) { this.state = n; } };
    const e = createEnvOverride({ weather });
    expect(e.weatherChoices()).toEqual(WEATHER_DEFAULT);
    e.setWeather('snow');
    expect(weather.state).toBe('snow');
    e.restore();
    expect(weather.state).toBe('rain');
    const forced = { current: 'fog', states: ['fog', 'clear'], force(n) { this.current = n; } };
    const e2 = createEnvOverride({ weather: forced });
    expect(e2.weatherChoices()).toEqual(['fog', 'clear']);
    e2.setWeather('clear');
    e2.restore();
    expect(forced.current).toBe('fog');
  });
});

describe('photo poses', () => {
  it('lists loaded clips, favourites first, never the bind pose', () => {
    const l = poseList(['Zed', 'A_TPose', 'Idle_Loop', 'Alpha', 'Roll', 'Idle_Loop']);
    expect(l).toEqual(['Idle_Loop', 'Roll', 'Alpha', 'Zed']);
  });

  function rig() {
    const root = new THREE.Object3D();
    const bone = new THREE.Bone();
    bone.name = 'pelvis';
    root.add(bone);
    const clip = (name, y) => new THREE.AnimationClip(name, 1, [new THREE.NumberKeyframeTrack('pelvis.position[y]', [0, 1], [0, y])]);
    const clips = new Map([['Idle_Loop', clip('Idle_Loop', 1)], ['Wave', clip('Wave', 10)]]);
    const mixer = new THREE.AnimationMixer(root);
    let current = null;
    const animator = {
      mixer, clips,
      play(name, { once = false, startAt = 0, timeScale = 1 } = {}) {
        if (current?.getClip().name === name && !once) return current;
        const a = mixer.clipAction(clips.get(name));
        a.reset(); a.time = startAt; a.timeScale = timeScale; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); a.play();
        current = a;
        return a;
      },
      update(dt) { mixer.update(dt); },
      get currentName() { return current?.getClip().name ?? null; },
      get currentAction() { return current; },
    };
    return { animator, bone };
  }

  it('holds a clip at the scrubbed time against the state machine, then gives it back', () => {
    const { animator, bone } = rig();
    animator.play('Idle_Loop');
    animator.update(0.25);
    const realPlay = animator.play;
    const p = createPoser(animator);
    expect(p.list()).toEqual(['Idle_Loop', 'Wave']);
    expect(p.hold('Nope')).toBe(false);
    expect(p.hold('Wave', 0.5)).toBe(true);
    expect(bone.position.y).toBeCloseTo(5, 3);
    // The hero's per-frame requests don't break the pose.
    animator.play('Idle_Loop');
    animator.update(0.1);
    expect(bone.position.y).toBeCloseTo(5, 3);
    p.setScrub(0.2);
    expect(bone.position.y).toBeCloseTo(2, 3);
    p.release();
    expect(animator.play).toBe(realPlay);
    expect(animator.currentName).toBe('Idle_Loop');
    expect(bone.position.y).toBeCloseTo(0.25, 2);
  });
});
