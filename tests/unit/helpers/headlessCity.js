// Builds the real core city in Node (no browser, no GPU) for tests that need its actual
// collision boxes, grapple points, ladders and zip lines. Canvas textures get a stub 2D context:
// painting does nothing, and no city rng draw depends on what is painted (texture builders draw
// from the rng the same way whatever the canvas does). The collision hash this produces is
// checked against the one the browser build reports (tests/unit/coreWorldFrozen.test.js notes how).
import * as THREE from 'three';

function stubContext(canvas) {
  const state = { canvas, font: '10px sans-serif' };
  const noop = () => {};
  const gradient = () => ({ addColorStop: noop });
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => {
        const px = Number(/(\d+(?:\.\d+)?)px/.exec(t.font)?.[1] ?? 10);
        return { width: String(s).length * px * 0.55, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2 };
      };
      if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => {
        const W = typeof x === 'number' && h === undefined ? x : w, H = typeof x === 'number' && h === undefined ? y : h;
        return { data: new Uint8ClampedArray(Math.max(1, W * H * 4)), width: W, height: H };
      };
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createConicGradient' || k === 'createPattern') return gradient;
      if (k === 'getLineDash') return () => [];
      if (k === 'isPointInPath') return () => false;
      return noop;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

export function installCanvasStub() {
  if (globalThis.document?.__stub) return;
  const make = (tag) => {
    if (tag !== 'canvas') return { style: {}, appendChild() {}, setAttribute() {} };
    const c = { width: 300, height: 150, style: {}, tagName: 'CANVAS' };
    let ctx = null;
    c.getContext = () => (ctx ??= stubContext(c));
    c.toDataURL = () => 'data:,';
    c.addEventListener = () => {};
    return c;
  };
  globalThis.document = { __stub: true, createElement: make, createElementNS: (ns, tag) => make(tag), body: { appendChild() {} } };
}

// Exactly what src/game/world.js builds (src/world/regions/assemble.js: every region, the core
// first on the seed-11 rng), minus sky, backdrop, lighting and traffic. `coreBoxes` are the boxes
// region 'core' added (the invisible edge walls are not part of the core city).
export async function buildCoreCityHeadless() {
  installCanvasStub();
  const { createRng } = await import('../../../src/core/rng.js');
  const { assembleCity } = await import('../../../src/world/regions/assemble.js');
  const scene = new THREE.Scene();
  const rng = createRng(11);
  const out = assembleCity(scene, { rng, quality: { name: 'high' }, createRng });
  const core = out.regionCtx.core;
  return {
    ...out, scene, rng,
    coreBoxes: out.collision.boxes.slice(core.boxStart, core.boxEnd),
    coreGrapple: out.ctx.grapple.slice(core.grappleStart, core.grappleEnd),
  };
}
