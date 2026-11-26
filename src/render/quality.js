// Quality tiers (design doc contract 4.3). Every system reads *flags* from the quality object;
// nothing tests the tier name. `low` and `high` keep their ids (saved settings), and `high` keeps
// the pre-overhaul look as its floor.
//
// Flags other workstreams read (always with a fallback, e.g. `quality.drawDistance ?? 420`):
//   drawDistance   metres. Camera far plane and chunk culling distance. Matched to the fog density
//                  so nothing past it shows: at the tier's fog, `drawDistance` is at least 97% fog.
//   lodDistance    metres. Where a chunk swaps to its merged far-LOD silhouette (workstream C).
//   crowdDensity   0..1. Share of the full civilian/traffic crowd to spawn (workstreams C, M).
//   hullDistance   metres. Characters farther than this may skip their inked hull outline.
//   animFullRate   metres. Characters within this animate every frame; farther ones may throttle.
//   lights         point-light pool size (0/2/4/6/8). Fixed for the session: changing it recompiles
//                  every lit shader. Read by world.js only.
//   normals        'depth' (ink creases from the depth buffer, no normal target) | 'mrt' (view
//                  normals written as a second colour attachment by every material).
//   colorTarget    'u8' (sRGB 8-bit colour buffer) | 'half' (half float).
//   shadows        false, or { staticSize, staticRadius, dynamicSize, dynamicRadius, refresh,
//                  cascades }: a cached city shadow map (re-rendered when the player has moved
//                  `refresh` m from its centre) plus a small per-frame map for characters.
//   shadowMapSize  legacy alias of shadows.staticSize (0 without shadow maps).
//   blobShadows    inked drop shadows under characters (the tiers without shadow maps).
//   ao, contact, ssr  upper-tier screen-space effects in the ink pass (workstream M, src/render/
//                  inkPipeline.js INK_AO / INK_CONTACT / INK_SSR): depth AO and a short contact-
//                  shadow march, both turned into hatching, and wet-street reflections that keep only
//                  bright hits (neon, windows, lamps) cut into dashes. MRT tiers only; ultra by
//                  default, high by choice (Video settings).
//   envSurface     wet darkening and snow cover on the city's materials (off on potato).
//   splashes       rain splash marks around the player (off on potato).
//   fogBanks       lake-effect fog thickening near open lake water (off on potato).
//   ambientLife    pigeons and bats that scatter (off on potato).
//   dynResMin      dynamic resolution's floor.
//   clothSteps     [perf3] most cape cloth sub-steps per frame (potato/low 2, else 4; src/actors/cape.js).
//   steam          { perSource, groundOnly }: street steam puffs per vent, and street level only.
//   comic          ink-pass effect weights (uniforms only).
//   normalScale    legacy (the old separate normal pass's resolution); unused since the pass went.
//
// | flag            | potato | low   | medium | high  | ultra |
// |-----------------|--------|-------|--------|-------|-------|
// | pixelRatioCap   | 1      | 1     | 1.25   | 2     | 2     |
// | colorTarget     | u8     | u8    | half   | half  | half  |
// | normals         | depth  | depth | mrt    | mrt   | mrt   |
// | drawDistance m  | 200    | 260   | 330    | 420   | 480   |
// | fogDensity      | 0.0095 | 0.0075| 0.0062 | 0.0062| 0.0055|
// | lodDistance m   | 120    | 160   | 200    | 240   | 280   |
// | shadows         | blob   | blob  | 1024 static + 512 dyn | 2048 + 1024 | 4096 + 2048 |
// | lights          | 0      | 2     | 4      | 6     | 8     |
// | crowdDensity    | 0.25   | 0.5   | 0.75   | 1     | 1     |
// | hullDistance m  | 15     | 20    | 30     | 40    | 60    |
// | animFullRate m  | 10     | 15    | 25     | 35    | 50    |
// | rainCount       | 400    | 850   | 1500   | 2500  | 3500  |
// | dynResMin       | 0.5    | 0.6   | 0.6    | 0.6   | 0.7   |
// | comic           | hatch  | hatch | full   | full  | full  |
//
// `high` keeps the pre-overhaul fog (0.0062) and pixel-ratio cap (2), so its picture only changes
// where the render work changes it on purpose (see docs/design/shots/render).

export const TIERS = ['potato', 'low', 'medium', 'high', 'ultra'];
export const TIER_LABELS = { potato: 'Potato', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };

const COMIC_FULL = { wobble: 1, hatch: 1, midDots: 1, skyDots: 1, colorEdges: 1, misreg: 1, palette: 0.35, paper: 1 };
// Cross-hatching is one cheap branch in the ink pass and carries most of the comic read in shadow.
const COMIC_CHEAP = { wobble: 0, hatch: 1, midDots: 0, skyDots: 0, colorEdges: 0, misreg: 0, palette: 0, paper: 0 };

const PRESETS = {
  potato: {
    pixelRatioCap: 1, colorTarget: 'u8', normals: 'depth', normalScale: 0.5,
    drawDistance: 200, fogDensity: 0.0095, lodDistance: 120, clothSteps: 2,
    shadows: false, shadowMapSize: 0, blobShadows: true,
    lights: 0, crowdDensity: 0.25, hullDistance: 15, animFullRate: 10,
    rainCount: 400, swarmBats: 80, steam: { perSource: 2, groundOnly: true }, dynResMin: 0.5,
    ao: false, contact: false, ssr: false,
    envSurface: false, splashes: false, fogBanks: false, ambientLife: false,
    comic: COMIC_CHEAP,
  },
  low: {
    pixelRatioCap: 1, colorTarget: 'u8', normals: 'depth', normalScale: 0.5,
    drawDistance: 260, fogDensity: 0.0075, lodDistance: 160, clothSteps: 2,
    shadows: false, shadowMapSize: 0, blobShadows: true,
    lights: 2, crowdDensity: 0.5, hullDistance: 20, animFullRate: 15,
    rainCount: 850, swarmBats: 120, steam: { perSource: 3, groundOnly: true }, dynResMin: 0.6,
    ao: false, contact: false, ssr: false,
    comic: COMIC_CHEAP,
  },
  medium: {
    pixelRatioCap: 1.25, colorTarget: 'half', normals: 'mrt', normalScale: 1,
    drawDistance: 330, fogDensity: 0.0062, lodDistance: 200,
    shadows: { staticSize: 1024, staticRadius: 32, dynamicSize: 512, dynamicRadius: 12, refresh: 8, cascades: 1 },
    shadowMapSize: 1024, blobShadows: false,
    lights: 4, crowdDensity: 0.75, hullDistance: 30, animFullRate: 25,
    rainCount: 1500, swarmBats: 160, steam: { perSource: 5, groundOnly: false }, dynResMin: 0.6,
    ao: false, contact: false, ssr: false,
    comic: COMIC_FULL,
  },
  high: {
    pixelRatioCap: 2, colorTarget: 'half', normals: 'mrt', normalScale: 1,
    drawDistance: 420, fogDensity: 0.0062, lodDistance: 240,
    shadows: { staticSize: 2048, staticRadius: 32, dynamicSize: 1024, dynamicRadius: 12, refresh: 8, cascades: 1 },
    shadowMapSize: 2048, blobShadows: false,
    lights: 6, crowdDensity: 1, hullDistance: 40, animFullRate: 35,
    rainCount: 2500, swarmBats: 220, steam: { perSource: 5, groundOnly: false }, dynResMin: 0.6,
    ao: false, contact: false, ssr: false,
    comic: COMIC_FULL,
  },
  ultra: {
    pixelRatioCap: 2, colorTarget: 'half', normals: 'mrt', normalScale: 1,
    drawDistance: 480, fogDensity: 0.0055, lodDistance: 280,
    shadows: { staticSize: 4096, staticRadius: 48, dynamicSize: 2048, dynamicRadius: 16, refresh: 12, cascades: 1 },
    shadowMapSize: 4096, blobShadows: false,
    lights: 8, crowdDensity: 1, hullDistance: 60, animFullRate: 50,
    rainCount: 3500, swarmBats: 260, steam: { perSource: 5, groundOnly: false }, dynResMin: 0.7,
    ao: true, contact: true, ssr: true,
    comic: COMIC_FULL,
  },
};

export function isTier(name) { return TIERS.includes(name); }

// A fresh copy each call: perfBench and the split-screen budget rule tweak fields on their copy.
export function getQuality(name) {
  const id = isTier(name) ? name : 'high';
  const p = PRESETS[id];
  return { ...p, name: id, shadows: p.shadows ? { ...p.shadows } : false, comic: { ...p.comic } };
}

// One step down (negative) or up the ladder, clamped. Used by auto-detection and split screen.
export function stepTier(name, delta) {
  const i = TIERS.indexOf(isTier(name) ? name : 'high');
  return TIERS[Math.max(0, Math.min(TIERS.length - 1, i + delta))];
}
