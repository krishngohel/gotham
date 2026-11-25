// Split screen at run time (workstream D1, Long Night 2; contract: docs/design/long-night-2.md 4.4).
//
// One view per local player. Player 0's view is the game's own camera, follow rig and HUD, drawn
// through the ink pipeline's main view: with one local player nothing here changes a pixel (the
// game renders ink.render(scene, camera) exactly as before). With two, each view gets its rect of
// the canvas (src/coop/viewLayout.js), its own camera aspect and FOV, its HUD confined to its
// panel, and its own detective vision and impact frame (ink view overrides).
//
// Things the renderer shares between views and that must follow the view being drawn are moved
// per camera in scene.onBeforeRender (called by three at the start of every render() call, before
// lights are set up): the camera fill light, and the rain and splashes (centred on the camera that
// draws them, so both halves are wet). Shadow maps render once per frame for both views (the ink
// pipeline arms them for the first colour pass only).
//
// Full screen while a cutscene, a comic, the finale or the credits run (setFullscreen): one view,
// player 0's camera, which the cinematic drives.
import { layoutViews, splitFov } from './viewLayout.js';

export function createSplitScreen({ ink, scene, fill, rain = null, getLayout = () => 'vertical', onLayout = () => {} }) {
  const views = [];          // { player, camera, follow, ink, hud, css, overrides, extras: [] }
  const byCamera = new Map(); // camera -> view (scene.onBeforeRender looks it up)
  let fullscreen = false;
  let split = false;
  let width = 1, height = 1;
  const list = [];           // ink views of this frame (reused)
  let baseFov = 60;
  const rainMat = rain?.mesh?.material ?? null;
  const splash = rain?.mesh?.children?.[0] ?? null;
  const splashMat = splash?.material ?? null;

  // Per camera: the fill light sits at the camera and lights its own player's hero; the rain
  // follows the camera. Only installed while split (single player keeps its own frame path).
  function beforeRender(renderer, sc, camera) {
    const v = byCamera.get(camera);
    if (!v) return;
    fill.position.copy(camera.position);
    fill.target.position.copy(v.player.hero.pos);
    fill.updateMatrixWorld();
    fill.target.updateMatrixWorld();
    if (rainMat?.uniforms?.uCenter) { rainMat.uniforms.uCenter.value.copy(camera.position); rainMat.uniformsNeedUpdate = true; }
    if (splashMat?.uniforms?.uCenter) { splashMat.uniforms.uCenter.value.copy(camera.position); splashMat.uniformsNeedUpdate = true; }
  }

  function apply() {
    const wantSplit = !fullscreen && views.length > 1;
    if (wantSplit !== split) {
      split = wantSplit;
      scene.onBeforeRender = split ? beforeRender : () => {};
    }
    const n = split ? views.length : 1;
    const rects = layoutViews(n, width, height, { layout: getLayout() });
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      const on = i < n;
      const r = rects[Math.min(i, rects.length - 1)];
      v.css = on ? r.css : null;
      v.ink.rect.splice(0, 4, ...(on ? r.gl : [0, 0, 1, 1]));
      v.ink.overrides = split ? v.overrides : null;
      v.camera.aspect = on ? r.aspect : width / height;
      v.camera.updateProjectionMatrix();
      v.hud?.setPanel(split && on ? r.css : null);
      if (v.hud) v.hud.el.style.display = on || i === 0 ? '' : 'none';
      // The view's FOV keeps the full screen's horizontal sweep (a narrow half widens a little).
      // Single player never has its FOV touched here (Settings > FOV via follow.configure rules).
      if (v.follow?.state && (split || v.fovSet)) {
        v.follow.state.baseFov = split ? splitFov(baseFov, r.aspect, width / height) : baseFov;
        v.fovSet = split;
      }
      for (const x of v.extras) x.resize?.();
    }
    ink.setSize(width, height);
    onLayout({ split, views });
  }

  return {
    views,
    get split() { return split; },
    get fullscreen() { return fullscreen; },
    // A local player's view. extras: things with resize() that follow the panel (speed lines).
    add(player, { camera, follow, inkView, hud = null, extras = [] }) {
      const v = { player, camera, follow, ink: inkView, hud, css: null, extras, overrides: { detective: 0, impact: 0, impactSoft: 0, cx: 0.5, cy: 0.5 } };
      views.push(v);
      byCamera.set(camera, v);
      player.view = Object.assign(player.view ?? {}, { follow, camera, screen: v });
      apply();
      return v;
    },
    remove(player) {
      const i = views.findIndex((v) => v.player === player);
      if (i <= 0) return; // player 0's view is the game's own
      const [v] = views.splice(i, 1);
      byCamera.delete(v.camera);
      v.hud?.setPanel(null);
      if (v.hud) v.hud.el.style.display = 'none';
      if (v.ink !== ink.mainView) ink.disposeView(v.ink);
      apply();
    },
    viewOf(player) { return views.find((v) => v.player === player) ?? null; },
    resize(w, h) { width = Math.max(1, w); height = Math.max(1, h); apply(); },
    setBaseFov(f) { baseFov = f; apply(); },
    // Cutscenes, comics, the finale and the credits take the whole screen (player 0's camera).
    setFullscreen(on) { if (on !== fullscreen) { fullscreen = on; apply(); } },
    relayout: apply,
    // The ink views to draw this frame (split only; one view uses the old single-camera path).
    inkViews() {
      list.length = 0;
      for (const v of views) list.push(v.ink);
      return list;
    },
    // Screen position of a world point in a view's own panel (CSS px). Writes `out`.
    project(v, world, out, tmp) {
      tmp.copy(world).project(v.camera);
      const css = v.css ?? { width, height };
      out.x = (tmp.x * 0.5 + 0.5) * css.width;
      out.y = (-tmp.y * 0.5 + 0.5) * css.height;
      out.behind = tmp.z > 1;
      return out;
    },
  };
}
