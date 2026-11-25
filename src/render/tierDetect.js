// First-boot quality tier selection and software-rendering detection. Pure functions (unit tested
// in tests/unit/tierDetect.test.js) plus two small browser helpers at the bottom.
//
// Order of precedence: ?q=<tier> in the URL, then the player's choice in Settings > Video, then
// "auto". Auto starts from the GPU renderer string, which is only a hint (Chromium gives the real
// model; Firefox a sanitised family; Safari just "Apple GPU"), then a short benchmark of the real
// ink pipeline right after shader prewarm decides. The decision is stored with the renderer
// string and re-made when that changes (new GPU, driver, browser switching GPUs).
import { TIERS, isTier, stepTier } from './quality.js';

export const AUTO_KEY = 'gotham-quality-auto-v1';
// Bump when the tier table or the benchmark changes enough that stored decisions should be redone.
export const DETECT_VERSION = 2; // [perf2] 2: auto no longer picks Ultra (stored Ultra picks are redone)

// Renderers that draw on the CPU. The game is unplayable on them beyond Potato, and the player can
// almost always fix it by turning hardware acceleration back on.
const SOFTWARE = /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Microsoft Basic Render|Mesa OffScreen|Generic Renderer|Software Adapter/i;

export function isSoftwareRenderer(raw) { return SOFTWARE.test(String(raw ?? '')); }

// A starting tier from the GPU string alone. Coarse on purpose: the benchmark refines it.
export function seedTierFromGpu(raw) {
  const s = String(raw ?? '');
  if (!s || s === 'unknown') return 'medium';
  if (isSoftwareRenderer(s)) return 'potato';
  if (/NVIDIA|GeForce|Quadro|RTX/i.test(s)) {
    if (/\bMX\s?\d{3}/i.test(s)) return 'low';
    if (/RTX\s?(20[6-9]0|30[6-9]0|40[6-9]0|50[6-9]0)|RTX\s?A\d{4}/i.test(s)) return 'high';
    if (/RTX/i.test(s)) return 'medium';
    if (/GTX\s?(16\d0|1070|1080)/i.test(s)) return 'high';
    return 'medium';
  }
  if (/Radeon|AMD/i.test(s)) {
    if (/RX\s?(6[6-9]\d0|7[6-9]\d0|9\d{3})/i.test(s)) return 'high';
    if (/RX\s?\d{3,4}/i.test(s)) return 'medium';
    if (/[6-8]\d0M|890M/i.test(s)) return 'medium'; // RDNA2/3 laptop APUs (680M, 780M, 890M)
    return 'low'; // Vega / "Radeon(TM) Graphics" APUs
  }
  if (/Intel/i.test(s)) {
    if (/Arc\(TM\) A\d|Arc A\d|Arc\(TM\) B\d|Arc B\d/i.test(s)) return 'high'; // discrete Arc
    if (/Iris|Xe|Arc/i.test(s)) return 'low';
    return 'potato'; // UHD / HD Graphics
  }
  if (/Apple/i.test(s)) return 'medium';
  if (/Adreno \(TM\) [7-9]\d\d|Adreno [7-9]\d\d/i.test(s)) return 'low';
  if (/Mali|Adreno|PowerVR|Immortalis|Vivante/i.test(s)) return 'potato';
  return 'medium';
}

// Frame budget (ms) a tier aims for: 30 fps on potato/low, 60 above.
export function tierBudgetMs(tier) { return TIERS.indexOf(tier) <= 1 ? 1000 / 30 : 1000 / 60; }

// Where the benchmark result points, from the tier it ran on and its median frame time (wall time
// of the whole frame including the GPU, see measurePipeline). Over budget: one step down, two when
// it is more than twice over. Under 40% of the next tier's budget: one step up. Pure.
export function tierFromBenchmark(tier, frameMs) {
  if (!(frameMs > 0)) return tier;
  const ratio = frameMs / tierBudgetMs(tier);
  if (ratio > 2) return stepTier(tier, -2);
  if (ratio > 1) return stepTier(tier, -1);
  const up = stepTier(tier, 1);
  // [perf2] Never up to Ultra on its own: the benchmark times the title view (sky, the GCPD roof),
  // which says nothing about Ultra's screen-space lighting, 4096 shadow map and 64-figure crowds in
  // a street, and an RTX 4060 laptop was promoted there and then ran the city at half the frame
  // rate of High. Ultra stays one click away in Settings > Video.
  if (up !== tier && up !== 'ultra' && frameMs < 0.4 * tierBudgetMs(up)) return up;
  return tier;
}

// The tier to boot with. `stored` is the saved auto decision ({ renderer, tier, version }) or null.
// Returns { tier, source: 'url' | 'setting' | 'stored' | 'seed', bench: run the benchmark? }.
export function chooseTier({ param = null, setting = 'auto', gpu = '', stored = null, automated = false }) {
  if (isTier(param)) return { tier: param, source: 'url', bench: false };
  if (isTier(setting)) return { tier: setting, source: 'setting', bench: false };
  if (stored && isTier(stored.tier) && stored.renderer === gpu && stored.version === DETECT_VERSION) {
    return { tier: stored.tier, source: 'stored', bench: false };
  }
  // Automated browsers (tests, the perf scripts) keep the GPU seed and never benchmark or reload,
  // so a test run is repeatable.
  return { tier: seedTierFromGpu(gpu), source: 'seed', bench: !automated };
}

export function loadAutoTier(storage) {
  try { const v = JSON.parse(storage?.getItem(AUTO_KEY) ?? 'null'); return v && typeof v === 'object' ? v : null; } catch { return null; }
}
export function saveAutoTier(storage, gpu, tier) {
  try { storage?.setItem(AUTO_KEY, JSON.stringify({ renderer: gpu, tier, version: DETECT_VERSION })); } catch { /* private window */ }
}

// ---- browser helpers ----

// True when the browser refuses a context that would perform badly (its own software fallback or
// a blocklisted GPU). Uses a throwaway canvas and releases the context straight away.
export function hasPerformanceCaveat(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return false;
  try {
    const c = doc.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    if (!gl) return true;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return false;
  } catch { return false; }
}

// Median wall time (ms) of one full frame of the real pipeline, measured by drawing `perBatch`
// frames back to back and forcing the GPU to finish with a one-pixel readback, so vsync cannot
// hide the cost. `draw()` renders one frame. Runs `batches` batches after one warm-up batch.
export function measurePipeline(gl, draw, { batches = 8, perBatch = 3, now = () => performance.now() } = {}) {
  const px = new Uint8Array(4);
  const times = [];
  for (let b = -1; b < batches; b++) {
    const t0 = now();
    for (let i = 0; i < perBatch; i++) draw();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    if (b >= 0) times.push((now() - t0) / perBatch);
  }
  times.sort((a, b) => a - b);
  return times[times.length >> 1];
}

// The unmasked renderer string from a throwaway context, before the game's own renderer exists
// (the tier decides how that renderer is set up). Same power preference as the game's.
export function probeRendererString(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return 'unknown';
  try {
    const gl = doc.createElement('canvas').getContext('webgl2', { powerPreference: 'high-performance' });
    if (!gl) return 'unknown';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const s = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return s;
  } catch { return 'unknown'; }
}

// First boot on "auto": right after shader prewarm, time the real pipeline (the title view, at the
// window's real size) and store the tier it points to for the next launch. [perf3] It never
// reloads the page any more: a reload under load landed mid-game for a player (and broke scripted
// runs), and a busy first second (a throttled CPU, the browser still starting) could push the
// decision down on its own. Now the first measurement is taken at boot and, while the player is
// still on the title screen, a second one a few seconds later; the faster of the two decides
// (load only ever makes a frame slower, so the faster reading is the truer one). The tier this
// session runs on does not change: when the stored decision differs, onDecided(next) lets the
// title offer a restart (the player's choice); dynamic resolution and the adaptive detail
// governor hold the frame rate meanwhile. Returns { first, decide(secondMs?) }.
export function settleAutoTier({ renderer, draw, storage, gpu, tier, onDecided = () => {} }) {
  let first = 0;
  try { first = measurePipeline(renderer.getContext(), draw, { batches: 10 }); } catch { return { first: 0, decide: () => tier }; }
  let done = false;
  return {
    first,
    // secondMs: a later measurement (or omit to decide on the first alone). Decides once.
    decide(secondMs = Infinity) {
      if (done) return tier;
      done = true;
      const ms = Math.min(first, secondMs > 0 ? secondMs : Infinity);
      const next = tierFromBenchmark(tier, ms);
      saveAutoTier(storage, gpu, next);
      console.info(`[quality] auto: ${tier} measured ${first.toFixed(1)} / ${Number.isFinite(secondMs) ? secondMs.toFixed(1) : '-'} ms/frame -> ${next}${next !== tier ? ' (from the next launch)' : ''}`);
      if (next !== tier) onDecided(next);
      return next;
    },
  };
}
