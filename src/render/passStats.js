// Per-pass cost of the ink pipeline: draw calls and triangles of each renderer.render() call (from
// renderer.info, which three resets at the start of every render call), and GPU milliseconds of
// each pass from EXT_disjoint_timer_query_webgl2 where the browser exposes it.
//
// Diagnostic only. Draw-call counting is free (two property reads per pass), so it is always on;
// GPU timing creates query objects every frame, so it only runs when the pipeline was created with
// gpuTime (the ?gputime=1 URL flag, which perfBench and the perf scripts set).
//
// Queries come back one to three frames late and are read without stalling. Only one
// TIME_ELAPSED query may be open at a time, so passes are timed one after another, never nested.

export const PASSES = ['shadow', 'far', 'color', 'normal', 'ink', 'xray'];

export function createPassStats(gl, { gpuTime = false } = {}) {
  const timer = gpuTime ? (gl.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null) : null;
  // Latest finished numbers per pass. `calls`/`tris` are this frame's; `gpu` lags a frame or two.
  const passes = {};
  for (const p of PASSES) passes[p] = { calls: 0, tris: 0, gpu: 0, ran: false };
  // A small ring of open queries, each tagged with its pass. Pre-allocated entries: no per-frame
  // object churn beyond the WebGL query objects themselves.
  const ring = Array.from({ length: 32 }, () => ({ q: null, pass: '' }));
  let head = 0, tail = 0;
  let open = null;
  let calls0 = 0, tris0 = 0;
  let gpuTotal = null;
  const frameGpu = {};

  // info: renderer.info. With info.autoReset (three's default) every render() call starts from zero;
  // the perf scripts turn it off to sum a whole frame, so take the difference either way.
  function begin(pass, info) {
    calls0 = info.render.calls; tris0 = info.render.triangles;
    if (!timer || open) return;
    if (((head + 1) & 31) === tail) return; // ring full: the GPU is far behind, skip this sample
    const q = gl.createQuery();
    gl.beginQuery(timer.TIME_ELAPSED_EXT, q);
    open = ring[head];
    open.q = q; open.pass = pass;
    head = (head + 1) & 31;
  }

  // info: renderer.info after the pass's render() call.
  function end(pass, info) {
    const s = passes[pass];
    s.calls += info.autoReset ? info.render.calls : info.render.calls - calls0;
    s.tris += info.autoReset ? info.render.triangles : info.render.triangles - tris0;
    s.ran = true;
    if (open) { gl.endQuery(timer.TIME_ELAPSED_EXT); open = null; }
  }

  // Start of a frame: per-frame counters back to zero, and collect any finished queries.
  function frameStart() {
    for (const p of PASSES) { passes[p].calls = 0; passes[p].tris = 0; passes[p].ran = false; }
    if (!timer) return;
    let any = false;
    for (const p of PASSES) frameGpu[p] = -1;
    while (tail !== head) {
      const e = ring[tail];
      if (!gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6;
        frameGpu[e.pass] = (frameGpu[e.pass] < 0 ? 0 : frameGpu[e.pass]) + ms;
        any = true;
      }
      gl.deleteQuery(e.q);
      e.q = null;
      tail = (tail + 1) & 31;
    }
    if (any) {
      let sum = 0;
      for (const p of PASSES) if (frameGpu[p] >= 0) { passes[p].gpu = frameGpu[p]; sum += frameGpu[p]; }
      gpuTotal = sum;
    }
  }

  return {
    passes,
    begin,
    end,
    frameStart,
    get timing() { return !!timer; },
    // Sum of the last fully read frame's passes (null until the first result arrives).
    get gpuMs() { return gpuTotal; },
  };
}
