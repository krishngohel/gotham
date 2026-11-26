// Lazy-loaded animation packs (Long Night 2): extra Mixamo clips retargeted onto the shared
// 65-bone skeleton, split by purpose so a player only downloads what the current content needs.
// Nothing here is preloaded (index.html / assets.js keep their eager list); a system that wants
// a pack calls its loader and merges the clips into the actor's clip map. What each clip is for:
// docs/design/anim-manifest.md. Per-clip data (duration, contact, root motion, kind, loop,
// events) comes from the generated src/config/mocapData.<pack>.js, imported on demand too.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sanitizeClip } from './animator.js';

const DATA = {
  combat2: () => import('../config/mocapData.combat2.js'),
  enemies: () => import('../config/mocapData.enemies.js'),
  heroes: () => import('../config/mocapData.heroes.js'),
  civ: () => import('../config/mocapData.civ.js'),
  story: () => import('../config/mocapData.story.js'),
};
export const ANIM_PACKS = Object.keys(DATA);

const cache = new Map();

// Loads one pack: { clips: Map<name, AnimationClip>, data: { [name]: clip data } }. Cached per
// base URL, so repeated calls share one download. `fetchBuffer` is for tests and tools.
export function loadAnimPack(name, { base = './assets/', fetchBuffer = null } = {}) {
  if (!DATA[name]) return Promise.reject(new Error(`Unknown animation pack ${name}`));
  const key = base + name;
  if (!cache.has(key)) {
    const url = `${base}anims_${name}.glb`;
    const get = fetchBuffer ?? ((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}`); return r.arrayBuffer(); }));
    const p = Promise.all([get(url), DATA[name]()]).then(async ([buf, mod]) => {
      const gltf = await new GLTFLoader().parseAsync(buf, base);
      const clips = new Map();
      for (const clip of gltf.animations) clips.set(clip.name, sanitizeClip(clip));
      return { clips, data: mod.MOCAP_DATA };
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key);
}

// Adds a loaded pack's clips to an actor clip map without replacing clips it already has.
export function mergePackClips(target, pack) {
  for (const [k, v] of pack.clips) if (!target.has(k)) target.set(k, v);
  return target;
}

// One loader per pack (unused until the combat, enemy, civilian and story workstreams adopt them).
export const loadCombat2Anims = (opts) => loadAnimPack('combat2', opts);
export const loadEnemyAnims = (opts) => loadAnimPack('enemies', opts);
export const loadHeroAnims = (opts) => loadAnimPack('heroes', opts);
export const loadCivAnims = (opts) => loadAnimPack('civ', opts);
export const loadStoryAnims = (opts) => loadAnimPack('story', opts);
