import { describe, it, expect } from 'vitest';
import { seedTierFromGpu, isSoftwareRenderer, chooseTier, tierFromBenchmark, DETECT_VERSION, measurePipeline } from '../../src/render/tierDetect.js';
import { detectBrowser, hwAccelSteps, softwareRendering } from '../../src/ui/hwAccel.js';

const angle = (vendor, name) => `ANGLE (${vendor}, ${name} (0x00001234) Direct3D11 vs_5_0 ps_5_0, D3D11)`;

describe('GPU string seeds a tier', () => {
  it('reads common GPUs into the expected tier', () => {
    expect(seedTierFromGpu(angle('Intel', 'Intel(R) UHD Graphics 620'))).toBe('potato');
    expect(seedTierFromGpu(angle('Intel', 'Intel(R) Iris(R) Xe Graphics'))).toBe('low');
    expect(seedTierFromGpu(angle('Intel', 'Intel(R) Arc(TM) A770 Graphics'))).toBe('high');
    expect(seedTierFromGpu(angle('AMD', 'AMD Radeon(TM) Graphics'))).toBe('low');
    expect(seedTierFromGpu(angle('AMD', 'AMD Radeon 780M Graphics'))).toBe('medium');
    expect(seedTierFromGpu(angle('AMD', 'AMD Radeon RX 580'))).toBe('medium');
    expect(seedTierFromGpu(angle('AMD', 'AMD Radeon RX 7600'))).toBe('high');
    expect(seedTierFromGpu(angle('NVIDIA', 'NVIDIA GeForce MX150'))).toBe('low');
    expect(seedTierFromGpu(angle('NVIDIA', 'NVIDIA GeForce GTX 1050 Ti'))).toBe('medium');
    expect(seedTierFromGpu(angle('NVIDIA', 'NVIDIA GeForce GTX 1660 SUPER'))).toBe('high');
    expect(seedTierFromGpu(angle('NVIDIA', 'NVIDIA GeForce RTX 4060 Laptop GPU'))).toBe('high');
    expect(seedTierFromGpu(angle('NVIDIA', 'NVIDIA GeForce RTX 3050'))).toBe('medium');
    expect(seedTierFromGpu('Apple GPU')).toBe('medium');
    expect(seedTierFromGpu('Mali-G57')).toBe('potato');
    expect(seedTierFromGpu('')).toBe('medium');
    expect(seedTierFromGpu('Some Future GPU')).toBe('medium');
  });

  it('knows software renderers, and puts them on potato', () => {
    const soft = ['ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 'llvmpipe (LLVM 15.0.7, 256 bits)', angle('Microsoft', 'Microsoft Basic Render Driver'), 'Google SwiftShader'];
    for (const s of soft) {
      expect(isSoftwareRenderer(s), s).toBe(true);
      expect(seedTierFromGpu(s)).toBe('potato');
    }
    expect(isSoftwareRenderer(angle('NVIDIA', 'NVIDIA GeForce RTX 4060'))).toBe(false);
  });
});

describe('choosing the boot tier', () => {
  const gpu = angle('Intel', 'Intel(R) UHD Graphics 620');
  it('prefers the URL, then the saved setting (old saves: high/low), then a stored auto decision', () => {
    expect(chooseTier({ param: 'ultra', setting: 'low', gpu })).toEqual({ tier: 'ultra', source: 'url', bench: false });
    expect(chooseTier({ param: 'nope', setting: 'low', gpu })).toEqual({ tier: 'low', source: 'setting', bench: false });
    expect(chooseTier({ setting: 'high', gpu }).tier).toBe('high');
    const stored = { renderer: gpu, tier: 'low', version: DETECT_VERSION };
    expect(chooseTier({ setting: 'auto', gpu, stored })).toEqual({ tier: 'low', source: 'stored', bench: false });
  });

  it('re-detects when the GPU or the detector changed, and never benchmarks under automation', () => {
    expect(chooseTier({ setting: 'auto', gpu, stored: { renderer: 'other', tier: 'ultra', version: DETECT_VERSION } })).toEqual({ tier: 'potato', source: 'seed', bench: true });
    expect(chooseTier({ setting: 'auto', gpu, stored: { renderer: gpu, tier: 'ultra', version: 0 } }).source).toBe('seed');
    expect(chooseTier({ setting: 'auto', gpu, automated: true }).bench).toBe(false);
  });

  it('moves down when over budget, two steps when far over, up only with lots of headroom', () => {
    expect(tierFromBenchmark('high', 12)).toBe('high');
    expect(tierFromBenchmark('high', 20)).toBe('medium');
    expect(tierFromBenchmark('high', 40)).toBe('low');
    // [perf2] Auto stops at High however fast the title view runs (Ultra is a choice).
    expect(tierFromBenchmark('high', 5)).toBe('high');
    expect(tierFromBenchmark('medium', 2)).toBe('high');
    expect(tierFromBenchmark('potato', 80)).toBe('potato');
    expect(tierFromBenchmark('low', 25)).toBe('low');
    expect(tierFromBenchmark('low', 5)).toBe('medium');
    expect(tierFromBenchmark('ultra', 3)).toBe('ultra');
    expect(tierFromBenchmark('medium', NaN)).toBe('medium');
  });

  it('times whole frames with a GPU sync per batch and returns the median', () => {
    let t = 0, draws = 0, syncs = 0;
    const gl = { RGBA: 0, UNSIGNED_BYTE: 0, readPixels() { syncs++; } };
    const ms = measurePipeline(gl, () => { draws++; t += draws % 7 === 0 ? 30 : 10; }, { batches: 5, perBatch: 3, now: () => t });
    expect(syncs).toBe(6);
    expect(draws).toBe(18);
    expect(ms).toBeGreaterThanOrEqual(10);
    expect(ms).toBeLessThan(20);
  });
});

describe('hardware acceleration dialog', () => {
  const UA = {
    chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
    opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0',
    firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:145.0) Gecko/20100101 Firefox/145.0',
    safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  };
  it('tells the browsers apart, including Brave which hides in its user agent', () => {
    for (const [b, ua] of Object.entries(UA)) expect(detectBrowser(ua), b).toBe(b);
    expect(detectBrowser(UA.chrome, [], true)).toBe('brave');
    expect(detectBrowser(UA.chrome, [{ brand: 'Brave' }, { brand: 'Chromium' }])).toBe('brave');
    expect(detectBrowser(UA.chrome, [{ brand: 'Microsoft Edge' }])).toBe('edge');
    expect(detectBrowser('curl/8')).toBe('other');
  });

  it('has exact steps for each browser', () => {
    expect(hwAccelSteps('chrome').steps[0]).toContain('chrome://settings/system');
    expect(hwAccelSteps('edge').steps[0]).toContain('edge://settings/system');
    expect(hwAccelSteps('brave').steps[0]).toContain('brave://settings/system');
    expect(hwAccelSteps('opera').steps.join(' ')).toContain('Use hardware acceleration when available');
    expect(hwAccelSteps('firefox').steps.join(' ')).toContain('Use hardware acceleration when available');
    expect(hwAccelSteps('mystery').name).toBe('your browser');
  });

  it('flags a software renderer string or a performance-caveat refusal', () => {
    expect(softwareRendering('Google SwiftShader', { caveat: () => false })).toEqual({ software: true, reason: 'renderer' });
    expect(softwareRendering(angle('NVIDIA', 'RTX 4060'), { caveat: () => true })).toEqual({ software: true, reason: 'caveat' });
    expect(softwareRendering(angle('NVIDIA', 'RTX 4060'), { caveat: () => false }).software).toBe(false);
  });
});

// [perf3] Auto quality never reloads; the faster of two readings decides, stored for next launch.
describe('settleAutoTier', () => {
  it('stores the decision, reports it, and takes the faster of two readings', async () => {
    const { settleAutoTier, loadAutoTier } = await import('../../src/render/tierDetect.js');
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    let t = 0;
    const realNow = performance.now;
    performance.now = () => t;
    const gl = { RGBA: 0, UNSIGNED_BYTE: 0, readPixels() {} };
    let decided = null;
    try {
      // A slow first reading (60 ms/frame on high, a busy boot) ...
      const auto = settleAutoTier({ renderer: { getContext: () => gl }, draw: () => { t += 60; }, storage, gpu: 'X', tier: 'high', onDecided: (n) => { decided = n; } });
      expect(auto.first).toBeCloseTo(60);
      // ... and a calm second one (12 ms): high stays, nothing to offer.
      expect(auto.decide(12)).toBe('high');
      expect(decided).toBe(null);
      expect(loadAutoTier(storage).tier).toBe('high');
      expect(auto.decide(100)).toBe('high'); // decides once
      // Both slow: one step down per the benchmark rule, offered (not applied) via onDecided.
      const slow = settleAutoTier({ renderer: { getContext: () => gl }, draw: () => { t += 20; }, storage, gpu: 'X', tier: 'high', onDecided: (n) => { decided = n; } });
      expect(slow.decide(25)).toBe('medium');
      expect(decided).toBe('medium');
    } finally { performance.now = realNow; }
  });
});
