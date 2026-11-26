// Photo mode (workstream L1, item 7 upgrade): a free or orbiting camera within 20 m of the
// photographer's hero (no collision: it flies through walls), roll, FOV and a comic focus cue;
// filters; frames, a caption, speech bubbles and stickers; poses from the character's loaded
// clips; hide the hero or everyone; time-of-day and weather overrides where the world has them;
// a logo-free PNG export up to 4K through the ink pipeline; and a small local gallery.
//
// Who it stops:
// - one player: the world freezes (as before; game.js pauses on onOpen).
// - several players (split screen or online): only the photographer's view and input are taken
//   over. The world, the other player and their view keep running (design 4.4: time is per
//   actor). The photographer's hero stands still (its input is muted) and can be posed.
//
// Input: the photographer's own devices. Keyboard + mouse only if that player has them; their pad
// through its raw buttons. Keys inside photo mode are fixed (only the key that opens it is
// rebindable) and listed on the panel.
//
// Pure rules live in src/game/photoMath.js (camera) and src/ui/photo/*.js (filters, focus, export
// size, gallery caps, bubbles, poses, environment), all unit-tested.
import * as THREE from 'three';
import {
  FRAMES, FRAME_LABEL, DEFAULT_CAPTION, cycle, createPhotoCam, setPhotoMode, stepPhotoCam, photoView, sanitizeCaption, photoFileName,
} from '../game/photoMath.js';
import { drawPhotoFrame } from './photoFrame.js';
import { PHOTO_FILTERS, PHOTO_FILTER_LABEL } from './photo/photoFilters.js';
import { EXPORT_PRESETS, EXPORT_LABEL, exportCap, exportSize, bufferFor, thumbSize } from './photo/photoExport.js';
import { createGallery } from './photo/photoGallery.js';
import { CAPTION_LINES, ITEM_LABEL, BUBBLE_KINDS, STICKER_KINDS, createItem, addItem, removeItem, updateItem, moveItem, hitItem, cycleIn } from './photo/photoItems.js';
import { drawPhotoItems } from './photo/photoDraw.js';
import { createPhotoPost } from './photo/photoPost.js';
import { createPoser, poseLabel } from './photo/photoPoses.js';
import { createEnvOverride } from './photo/photoEnv.js';

const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const HIDE_MODES = ['none', 'me', 'all'];
const HIDE_LABEL = { none: 'Nobody', me: 'Me', all: 'Everyone' };
const FOCUS_MODES = ['off', 'auto', 'manual'];
const FOCUS_LABEL = { off: 'Off', auto: 'On me', manual: 'Manual' };
const ITEM_KINDS = [...BUBBLE_KINDS, ...STICKER_KINDS];
const ZERO_OVERRIDES = { detective: 0, impact: 0, impactSoft: 0, cx: 0.5, cy: 0.5 };

export function createPhotoMode({
  root, camera, renderer, ink, scene, hero, input, quality = {}, world = null, settings = null, storage,
  getPlayers = null, viewOf = null, getCharacters = null, restoreSize = null, autoDownload = true,
  sound = () => {}, getTime, getIssue = () => '', onOpen = () => {}, onClose = () => {}, onSaved = () => {},
}) {
  const overlay = document.createElement('canvas');
  overlay.className = 'photo-overlay';
  const flash = document.createElement('div');
  flash.className = 'photo-flash';
  const panel = document.createElement('div');
  panel.className = 'menu photo-panel';
  panel.innerHTML = `
    <h2>Photo mode <span class="ph-who"></span></h2>
    <div class="ph-sec">Camera</div>
    <div class="ph-row"><span>Move</span><button class="mbtn small ph-mode"></button></div>
    <div class="ph-row"><span>Focus</span><button class="mbtn small ph-focus"></button></div>
    <label class="ph-row ph-fdist"><span>Focus at <b class="ph-fval"></b></span><input type="range" min="1" max="40" step="0.5"></label>
    <label class="ph-row ph-depth"><span>Depth cue</span><input type="range" min="0.1" max="1" step="0.05"></label>
    <div class="ph-sec">Look</div>
    <div class="ph-row"><span>Filter</span><button class="mbtn small ph-filter"></button></div>
    <div class="ph-row"><span>Frame</span><button class="mbtn small ph-frame"></button></div>
    <div class="ph-row"><span>Hide</span><button class="mbtn small ph-hide"></button></div>
    <div class="ph-row"><span>Pose</span><button class="mbtn small ph-pose"></button></div>
    <label class="ph-row ph-scrub"><span>Pose time</span><input type="range" min="0" max="1" step="0.01" value="0"></label>
    <label class="ph-row ph-hour"><span>Hour <b class="ph-hval"></b></span><input type="range" min="0" max="24" step="0.25"></label>
    <div class="ph-row ph-wx"><span>Weather</span><button class="mbtn small ph-weather"></button></div>
    <div class="ph-sec">Comic</div>
    <label class="ph-row ph-cap"><span>Caption</span><input type="text" maxlength="48" spellcheck="false"></label>
    <div class="ph-row ph-adds">
      ${ITEM_KINDS.map((k) => `<button class="mbtn small ph-add" data-kind="${k}">${ITEM_LABEL[k]}</button>`).join('')}
    </div>
    <label class="ph-row ph-item"><span>Words</span><input type="text" maxlength="60" spellcheck="false"></label>
    <div class="ph-row ph-item"><span>Size</span><span><button class="mbtn small ph-smaller">-</button> <button class="mbtn small ph-bigger">+</button> <button class="mbtn small ph-del">Remove</button></span></div>
    <div class="ph-sec">Print</div>
    <div class="ph-row"><span>Size</span><button class="mbtn small ph-size"></button></div>
    <div class="ph-actions"><button class="mbtn primary ph-save">Save photo</button><button class="mbtn small ph-gal">Gallery</button><button class="mbtn small ph-exit">Exit</button></div>
    <p class="note ph-status" aria-live="polite"></p>
    <details class="ph-help"><summary>Controls</summary>
    <p class="note ph-keys">WASD move · Arrows or drag look · R F up, down · Q E roll · Z X or wheel zoom · 1 filter · 2 frame · 3 hide · 4 pose ([ ] scrub) · G orbit · V focus (N M near, far) · B bubble · K sticker · drag to place, Del removes · , . hour · L weather · J size · I gallery · T caption · H panel · Enter save · Esc exit</p>
    <p class="note ph-keys">Pad: sticks move and look · LT RT down, up · LB RB roll · D-pad up, down zoom · D-pad left, right caption · X filter · Y frame · View hide · Start pose · L3 orbit · R3 panel · A save · B exit</p>
    </details>`;
  const gal = document.createElement('div');
  gal.className = 'menu photo-gallery';
  gal.innerHTML = '<h2>Gallery</h2><p class="note ph-gnote"></p><div class="ph-grid"></div><img class="ph-big" alt=""><div class="ph-actions"><button class="mbtn small ph-gclose">Back</button></div>';
  const q = (s) => panel.querySelector(s);
  const capInput = q('.ph-cap input');
  const itemInput = q('.ph-item input');
  const fRange = q('.ph-fdist input'), dRange = q('.ph-depth input'), sRange = q('.ph-scrub input'), hRange = q('.ph-hour input');

  const post = createPhotoPost(renderer, quality);
  const gallery = createGallery(storage !== undefined ? { storage } : {});
  const held = new Set();
  let active = false, live = false;
  let player = null, view = null, pin = null;
  let cam = null;
  let anchor = { x: 0, y: 0, z: 0 };
  let filter = 'ink', frame = 'none', caption = DEFAULT_CAPTION, hide = 'none', panelHidden = false;
  let focusMode = 'off', focusDist = 6, aperture = 0.6;
  let items = [], selected = null, itemN = 0;
  let exportPreset = 'screen';
  let poser = null, poses = [], env = null;
  let drag = null, lookX = 0, lookY = 0, wheel = 0;
  let pending = [], lastExport = null, status = '';
  let muted = null, hudEl = null, hudVis = '';
  capInput.value = caption;

  // ---- who and where ----
  const playersNow = () => getPlayers?.() ?? [];
  const resolvePlayer = (p) => {
    const list = playersNow();
    if (typeof p === 'number') return list[p] ?? null;
    if (p) return p;
    return list[0] ?? { hero, input, slot: 0, local: true };
  };
  const viewFor = (p) => {
    const v = viewOf?.(p) ?? {};
    return { camera: v.camera ?? camera, css: v.css ?? null, inkView: v.inkView ?? ink.mainView, hudEl: v.hudEl ?? null };
  };
  const rectCss = () => view?.css ?? { left: 0, top: 0, width: innerWidth, height: innerHeight };
  const hasKeys = () => !!pin && (pin.hasKbm ?? (player?.slot ?? 0) === 0);
  const access = () => settings?.access ?? {};

  // ---- hiding characters, for the photographer's camera only ----
  // scene.onBeforeRender runs at the start of every render() with the camera being drawn (split
  // screen already uses it to move the fill light per view), so the photographer's picture can
  // leave people out while the other view still shows them. Visibility is put back after the
  // frame (post()), so game code never sees the change.
  let underlying = null;
  const hiddenNow = [];
  const hideTargets = () => {
    if (hide === 'none' || !player) return [];
    const h = player.hero;
    const mine = h ? [h.bat?.root, h.cape?.mesh, h.cable] : [];
    if (hide === 'me') return mine;
    const everyone = getCharacters?.() ?? playersNow().flatMap((p) => [p.hero?.bat?.root, p.hero?.cape?.mesh, p.hero?.cable]);
    return [...mine, ...everyone];
  };
  function showAgain() {
    for (let i = 0; i < hiddenNow.length; i += 2) hiddenNow[i].visible = hiddenNow[i + 1];
    hiddenNow.length = 0;
  }
  function wrapper(r, sc, c, ...rest) {
    underlying?.call(sc, r, sc, c, ...rest);
    if (!active || c !== view?.camera) { showAgain(); return; }
    if (hiddenNow.length) return;
    for (const o of hideTargets()) if (o && !hiddenNow.includes(o)) { hiddenNow.push(o, o.visible); o.visible = false; }
  }
  function installHider() {
    if (hide === 'none') { uninstallHider(); return; }
    if (scene.onBeforeRender !== wrapper) { underlying = scene.onBeforeRender; scene.onBeforeRender = wrapper; }
  }
  function uninstallHider() {
    showAgain();
    if (scene.onBeforeRender === wrapper) scene.onBeforeRender = underlying ?? (() => {});
    underlying = null;
  }

  // ---- muting the photographer's game input (several players only) ----
  // Patched on the input instance (the co-op filter reads it at call time), so the hero stands
  // still while its pad and keys drive the camera. Raw pad state (stick, padButton) stays live.
  function mute() {
    if (muted || !pin) return;
    const no = () => false;
    muted = { down: pin.down, pressed: pin.pressed, released: pin.released, codePressed: pin.codePressed, update: pin.update };
    pin.down = no; pin.pressed = no; pin.released = no;
    if (muted.codePressed) pin.codePressed = no;
    if (muted.update) {
      pin.update = (dt) => {
        muted.update.call(pin, dt);
        if (pin.move) { pin.move.x = 0; pin.move.y = 0; }
        if (pin.look) { pin.look.dx = 0; pin.look.dy = 0; }
      };
    }
    if (pin.move) { pin.move.x = 0; pin.move.y = 0; }
    if (hasKeys()) pin.setEnabled?.(false);
  }
  function unmute() {
    if (!muted) return;
    pin.down = muted.down; pin.pressed = muted.pressed; pin.released = muted.released;
    if (muted.codePressed) pin.codePressed = muted.codePressed;
    if (muted.update) pin.update = muted.update;
    if (hasKeys()) pin.setEnabled?.(true);
    muted = null;
  }

  // ---- drawing ----
  function drawOverlays(g, w, h, sel) {
    drawPhotoFrame(g, w, h, { frame, caption, issue: getIssue() });
    drawPhotoItems(g, w, h, items, sel);
  }
  function drawOverlay() {
    const r = rectCss();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    Object.assign(overlay.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    overlay.width = Math.max(1, Math.round(r.width * dpr));
    overlay.height = Math.max(1, Math.round(r.height * dpr));
    const g = overlay.getContext('2d');
    g.clearRect(0, 0, overlay.width, overlay.height);
    drawOverlays(g, overlay.width, overlay.height, panelHidden ? null : selected);
  }
  function placePanel() {
    const r = view?.css;
    if (!r) { panel.style.left = ''; panel.style.right = ''; panel.style.top = ''; gal.style.left = ''; return; }
    panel.style.right = 'auto';
    const pw = panel.offsetWidth || 380;
    panel.style.left = `${Math.max(r.left + 8, r.left + r.width - pw - 14)}px`;
    panel.style.top = `${r.top + 12}px`;
    panel.style.maxHeight = `${Math.max(200, r.height - 24)}px`;
  }
  const label = (sel, t) => { const el = q(sel); if (el && el.textContent !== t) el.textContent = t; };
  // [prog] One player (the whole screen is the photographer's): noir, pop and sepia run in the ink
  // pipeline's own filter, as photo mode always did (ink.uniforms.uFilter, content.spec.js); the
  // new filters, and every filter in co-op (the ink pass is shared by both views), use the post pass.
  const INK_FILTERS = new Set(['noir', 'pop', 'sepia']);
  const inkOwns = () => !live && INK_FILTERS.has(filter);
  const postFilter = () => (inkOwns() ? 'ink' : filter);
  function syncInkFilter() { if (active) ink.setFilter?.(inkOwns() ? filter : 'ink'); }
  function refresh() {
    syncInkFilter();
    label('.ph-who', playersNow().length > 1 ? `P${(player?.slot ?? 0) + 1}` : '');
    label('.ph-filter', PHOTO_FILTER_LABEL[filter]);
    label('.ph-frame', FRAME_LABEL[frame]);
    label('.ph-mode', cam?.mode === 'orbit' ? 'Orbit' : 'Free');
    label('.ph-hide', HIDE_LABEL[hide]);
    label('.ph-focus', FOCUS_LABEL[focusMode]);
    label('.ph-fval', `${focusDist.toFixed(1)} m`);
    label('.ph-pose', poseLabel(poser?.name));
    label('.ph-size', `${EXPORT_LABEL[exportPreset]}`);
    label('.ph-status', status);
    fRange.value = String(focusDist);
    dRange.value = String(aperture);
    q('.ph-fdist').classList.toggle('off', focusMode === 'off');
    q('.ph-depth').classList.toggle('off', focusMode === 'off');
    q('.ph-scrub').classList.toggle('off', !poser?.name);
    sRange.value = String(poser?.scrub ?? 0);
    const clockOn = !!env?.hasClock && !live, wxOn = !!env?.hasWeather && !live;
    q('.ph-hour').style.display = clockOn ? '' : 'none';
    q('.ph-wx').style.display = wxOn ? '' : 'none';
    if (clockOn) { const hr = env.hour ?? 0; hRange.value = String(hr); label('.ph-hval', `${String(Math.floor(hr)).padStart(2, '0')}:${String(Math.round((hr % 1) * 60)).padStart(2, '0')}`); }
    if (wxOn) label('.ph-weather', String(env.weather ?? '-').replace(/^./, (c) => c.toUpperCase()));
    const it = items.find((i) => i.id === selected);
    for (const el of panel.querySelectorAll('.ph-item')) el.classList.toggle('off', !it);
    if (it && document.activeElement !== itemInput) itemInput.value = it.text;
    panel.classList.toggle('hidden', panelHidden);
    drawOverlay();
  }
  function say(t) { status = t; label('.ph-status', t); }

  // ---- actions ----
  const act = {
    filter: (d = 1) => { filter = cycle(PHOTO_FILTERS, filter, d); sound('uiMove'); refresh(); },
    frame: (d = 1) => { frame = cycle(FRAMES, frame, d); sound('uiMove'); refresh(); },
    hide: (d = 1) => { hide = cycle(HIDE_MODES, hide, d); sound('uiMove'); installHider(); refresh(); },
    mode: () => { cam = setPhotoMode(cam, cam.mode === 'orbit' ? 'free' : 'orbit', anchor); sound('uiMove'); refresh(); },
    panel: () => { panelHidden = !panelHidden; refresh(); },
    caption: (d) => { caption = cycle(CAPTION_LINES, caption, d); capInput.value = caption; refresh(); },
    focus: (d = 1) => { focusMode = cycle(FOCUS_MODES, focusMode, d); sound('uiMove'); refresh(); },
    focusBy: (k) => { focusMode = 'manual'; focusDist = clamp(focusDist * k, 1, 40); refresh(); },
    pose: (d = 1) => {
      if (!poser) return;
      if (!poses.length) poses = poser.list();
      const cur = poser.name;
      const list = [null, ...poses];
      const next = list[(list.indexOf(cur) + d + list.length) % list.length];
      if (next) poser.hold(next, poser.scrub); else poser.release();
      sound('uiMove'); refresh();
    },
    scrub: (d) => { if (poser?.name) { poser.setScrub(((poser.scrub + d) % 1 + 1) % 1); refresh(); } },
    hour: (d) => { if (env?.hasClock && !live) { env.setHour((env.hour ?? 0) + d); refresh(); } },
    weather: () => {
      if (!env?.hasWeather || live) return;
      env.setWeather(cycleIn(env.weatherChoices(), env.weather, 1)); sound('uiMove'); refresh();
    },
    add: (kind) => {
      const k = kind ?? ITEM_KINDS[itemN % ITEM_KINDS.length];
      const it = createItem(k, { x: 0.3 + ((itemN * 0.17) % 0.4), y: 0.25 + ((itemN * 0.11) % 0.3), n: itemN });
      itemN += 1;
      const before = items.length;
      items = addItem(items, it);
      if (items.length > before) { selected = it.id; sound('uiMove'); } else say('That page is full.');
      refresh();
    },
    del: () => { if (selected) { items = removeItem(items, selected); selected = null; refresh(); } },
    grow: (k) => { const it = items.find((i) => i.id === selected); if (it) { items = updateItem(items, it.id, { scale: clamp(it.scale * k, 0.5, 2.5) }); refresh(); } },
    size: () => { exportPreset = cycle(EXPORT_PRESETS, exportPreset, 1); sound('uiMove'); refresh(); },
  };
  q('.ph-filter').addEventListener('click', () => act.filter());
  q('.ph-frame').addEventListener('click', () => act.frame());
  q('.ph-mode').addEventListener('click', () => act.mode());
  q('.ph-hide').addEventListener('click', () => act.hide());
  q('.ph-focus').addEventListener('click', () => act.focus());
  q('.ph-pose').addEventListener('click', () => act.pose());
  q('.ph-weather').addEventListener('click', () => act.weather());
  q('.ph-size').addEventListener('click', () => act.size());
  q('.ph-save').addEventListener('click', () => save());
  q('.ph-gal').addEventListener('click', () => openGallery());
  q('.ph-exit').addEventListener('click', () => close());
  q('.ph-del').addEventListener('click', () => act.del());
  q('.ph-bigger').addEventListener('click', () => act.grow(1.15));
  q('.ph-smaller').addEventListener('click', () => act.grow(1 / 1.15));
  for (const b of panel.querySelectorAll('.ph-add')) b.addEventListener('click', () => act.add(b.dataset.kind));
  fRange.addEventListener('input', () => { focusMode = 'manual'; focusDist = Number(fRange.value); refresh(); });
  dRange.addEventListener('input', () => { aperture = Number(dRange.value); if (focusMode === 'off') focusMode = 'auto'; refresh(); });
  sRange.addEventListener('input', () => { poser?.setScrub(Number(sRange.value)); });
  hRange.addEventListener('input', () => { if (env?.hasClock && !live) { env.setHour(Number(hRange.value)); refresh(); } });
  capInput.addEventListener('input', () => { caption = sanitizeCaption(capInput.value); drawOverlay(); });
  itemInput.addEventListener('input', () => { if (selected) { items = updateItem(items, selected, { text: itemInput.value }); drawOverlay(); } });
  for (const inp of [capInput, itemInput]) {
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); inp.blur(); }
    });
  }
  gal.querySelector('.ph-gclose').addEventListener('click', () => closeGallery());

  const typing = (t) => t && (t.tagName === 'INPUT' && t.type !== 'range') || t?.tagName === 'TEXTAREA';
  const onKey = (e) => {
    if (typing(e.target)) return;
    if (e.type === 'keyup') { held.delete(e.code); return; }
    if (e.repeat) return;
    held.add(e.code);
    // The gallery eats every key; Esc (and I) close it, not photo mode (this listener runs in the
    // capture phase, ahead of the game's own Esc handler).
    if (gal.isConnected) { if (e.code === 'Escape' || e.code === 'KeyI') { e.preventDefault(); e.stopImmediatePropagation(); closeGallery(); } return; }
    const d = e.shiftKey ? -1 : 1;
    switch (e.code) {
      case 'Digit1': act.filter(d); break;
      case 'Digit2': act.frame(d); break;
      case 'Digit3': act.hide(d); break;
      case 'Digit4': act.pose(d); break;
      case 'BracketLeft': act.scrub(-0.05); break;
      case 'BracketRight': act.scrub(0.05); break;
      case 'KeyG': act.mode(); break;
      case 'KeyH': act.panel(); break;
      case 'KeyV': act.focus(d); break;
      case 'KeyN': act.focusBy(1 / 1.15); break;
      case 'KeyM': act.focusBy(1.15); break;
      case 'KeyB': act.add(BUBBLE_KINDS[itemN % BUBBLE_KINDS.length]); break;
      case 'KeyK': act.add(STICKER_KINDS[itemN % STICKER_KINDS.length]); break;
      case 'Delete': case 'Backspace': act.del(); break;
      case 'Comma': act.hour(-0.5); break;
      case 'Period': act.hour(0.5); break;
      case 'KeyL': act.weather(); break;
      case 'KeyJ': act.size(); break;
      case 'KeyI': openGallery(); break;
      case 'KeyT': e.preventDefault(); capInput.focus(); capInput.select(); break;
      case 'Enter': case 'Space': e.preventDefault(); save(); break;
      default: return;
    }
  };
  const toFrac = (e) => { const r = rectCss(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r }; };
  const onDown = (e) => {
    if (e.target.closest?.('.photo-panel, .photo-gallery')) return;
    const f = toFrac(e);
    if (f.x < 0 || f.x > 1 || f.y < 0 || f.y > 1) return;
    const hit = panelHidden ? null : hitItem(items, f.x, f.y, f.r.width, f.r.height);
    if (hit) { selected = hit.id; drag = { item: hit.id, x: e.clientX, y: e.clientY }; refresh(); return; }
    if (selected) { selected = null; refresh(); }
    drag = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e) => {
    if (!drag) return;
    if (drag.item) {
      const r = rectCss();
      const it = items.find((i) => i.id === drag.item);
      if (it) items = items.map((i) => (i.id === it.id ? moveItem(i, (e.clientX - drag.x) / r.width, (e.clientY - drag.y) / r.height) : i));
      drawOverlay();
    } else {
      lookX += e.clientX - drag.x;
      lookY += e.clientY - drag.y;
    }
    drag.x = e.clientX;
    drag.y = e.clientY;
  };
  const onUp = () => { drag = null; };
  // Trackpads send many small deltas: scale by the delta and clamp each event (see git history).
  const onWheel = (e) => { if (!e.target.closest?.('.photo-panel, .photo-gallery')) { wheel += clamp(e.deltaY * 0.03, -3, 3); e.preventDefault(); } };
  const onResize = () => { if (active) { placePanel(); drawOverlay(); } };
  const listeners = [['keydown', onKey], ['keyup', onKey], ['mousedown', onDown], ['mousemove', onMove], ['mouseup', onUp]];

  const _dir = new THREE.Vector3();
  function apply() {
    const c = view.camera;
    const v = photoView(cam);
    c.position.set(v.position.x, v.position.y, v.position.z);
    c.up.set(0, 1, 0);
    c.lookAt(v.target.x, v.target.y, v.target.z);
    c.rotateZ(v.roll);
    if (Math.abs(c.fov - v.fov) > 0.01) { c.fov = v.fov; c.updateProjectionMatrix(); }
    c.updateMatrixWorld();
    if (focusMode === 'auto' && player?.hero) {
      const p = player.hero.pos;
      focusDist = clamp(Math.hypot(p.x - c.position.x, p.y + 1.2 - c.position.y, p.z - c.position.z), 0.5, 60);
    }
  }

  // ---- open / close ----
  function open(who) {
    if (active) return false;
    const p = resolvePlayer(who);
    if (!p?.hero) return false;
    player = p;
    view = viewFor(p);
    pin = p.input ?? input;
    live = playersNow().length > 1;
    active = true;
    anchor = { x: p.hero.pos.x, y: p.hero.pos.y, z: p.hero.pos.z };
    const c = view.camera;
    c.getWorldDirection(_dir);
    cam = createPhotoCam({ position: c.position, target: c.position.clone().add(_dir), fov: c.fov });
    held.clear();
    items = []; selected = null; status = '';
    poser = p.hero.bat?.animator?.mixer ? createPoser(p.hero.bat.animator) : null;
    poses = [];
    env = live ? null : createEnvOverride(world);
    root.append(overlay, flash, panel);
    placePanel();
    if (hasKeys()) {
      for (const [ev, fn] of listeners) window.addEventListener(ev, fn, ev.startsWith('key'));
      window.addEventListener('wheel', onWheel, { passive: false });
    }
    window.addEventListener('resize', onResize);
    if (live) {
      mute();
      hudEl = view.hudEl;
      if (hudEl) { hudVis = hudEl.style.visibility; hudEl.style.visibility = 'hidden'; }
      if (hasKeys()) document.exitPointerLock?.();
    }
    installHider();
    onOpen(p, live);
    refresh();
    return true;
  }

  function close() {
    if (!active) return;
    capInput.blur(); itemInput.blur();
    closeGallery();
    for (const [ev, fn] of listeners) window.removeEventListener(ev, fn, ev.startsWith('key'));
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('resize', onResize);
    uninstallHider();
    poser?.release();
    poser = null;
    env?.restore();
    env = null;
    ink.setFilter?.('ink');
    if (live) {
      unmute();
      if (hudEl) hudEl.style.visibility = hudVis;
      hudEl = null;
    }
    overlay.remove();
    flash.remove();
    panel.remove();
    drag = null; held.clear();
    const p = player, wasLive = live;
    active = false;
    for (const job of pending) job.resolve(null);
    pending = [];
    player = null; view = null; pin = null;
    onClose(p, wasLive);
  }

  // ---- gallery ----
  function renderGallery() {
    const grid = gal.querySelector('.ph-grid');
    grid.textContent = '';
    const list = gallery.list();
    gal.querySelector('.ph-gnote').textContent = list.length ? `${list.length} shot${list.length === 1 ? '' : 's'} on this device. Full-size PNGs go to your downloads.` : 'Nothing here yet. Go make some art.';
    for (const e of list) {
      const cell = document.createElement('div');
      cell.className = 'ph-cell';
      const img = document.createElement('img');
      img.src = e.thumb;
      img.alt = e.caption || 'Photo';
      img.title = `${e.w} x ${e.h}`;
      img.addEventListener('click', () => { const big = gal.querySelector('.ph-big'); big.src = e.thumb; big.classList.add('on'); });
      const del = document.createElement('button');
      del.className = 'mbtn small ph-gdel';
      del.textContent = 'X';
      del.title = 'Remove';
      del.addEventListener('click', () => { gallery.remove(e.id); renderGallery(); });
      cell.append(img, del);
      grid.appendChild(cell);
    }
  }
  function openGallery() {
    if (!active || gal.isConnected) return;
    renderGallery();
    gal.querySelector('.ph-big').classList.remove('on');
    const r = view?.css;
    if (r) Object.assign(gal.style, { left: `${r.left + 12}px`, top: `${r.top + 12}px`, maxWidth: `${r.width - 24}px`, maxHeight: `${r.height - 24}px` });
    root.appendChild(gal);
  }
  function closeGallery() { gal.remove(); }

  // ---- export ----
  // Saving is queued and done at the start of update(): that runs inside the frame, before the
  // game draws, so the canvas is redrawn at its own size in the same frame and never shows blank.
  function save() {
    if (!active) return Promise.resolve(null);
    return new Promise((resolve) => { pending.push({ resolve }); });
  }

  function glMax() {
    try {
      const gl = renderer.getContext();
      const vp = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
      return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE), vp[0], vp[1]);
    } catch { return 4096; }
  }

  // Renders the photographer's camera alone at the export size into the canvas, runs the post
  // pass, copies it with the frame and comic layer into a 2D canvas, and puts the renderer back
  // exactly as it was (the game's own resize() when given). Returns that 2D canvas.
  function renderExport() {
    const c = view.camera;
    const iv = view.inkView;
    const vw = iv?.w || iv?.px?.[2] || renderer.domElement.width;
    const vh = iv?.h || iv?.px?.[3] || renderer.domElement.height;
    const { w, h } = exportSize({ preset: exportPreset, viewW: vw, viewH: vh, cap: exportCap(quality), glMax: glMax() });
    const mv = ink.mainView;
    const prev = {
      pr: renderer.getPixelRatio(), size: renderer.getSize(new THREE.Vector2()), aspect: c.aspect,
      rect: [...mv.rect], overrides: mv.overrides, camera: mv.camera,
      u: ['uDetective', 'uImpact', 'uImpactSoft'].map((k) => ink.uniforms[k]?.value),
      center: ink.uniforms.uImpactCenter?.value.clone(),
    };
    const b = bufferFor(w, h, rectCss().width);
    let out = null;
    try {
      renderer.setPixelRatio(b.pixelRatio);
      renderer.setSize(b.cssW, b.cssH, false);
      mv.rect.splice(0, 4, 0, 0, 1, 1);
      mv.overrides = ZERO_OVERRIDES;
      ink.setSize(b.cssW, b.cssH);
      c.aspect = w / h;
      c.updateProjectionMatrix();
      ink.render(scene, c, getTime());
      const W = renderer.domElement.width, H = renderer.domElement.height;
      const o = { filter: postFilter(), focus: focusMode === 'off' ? 0 : focusDist, aperture: focusMode === 'off' ? 0 : aperture };
      if (post.wanted(o)) post.apply({ px: [0, 0, W, H], depthTexture: mv.target.depthTexture, camera: c, ...o, dot: 7 * b.pixelRatio, temp: true });
      out = document.createElement('canvas');
      out.width = W; out.height = H;
      const g = out.getContext('2d');
      g.drawImage(renderer.domElement, 0, 0, W, H);
      drawOverlays(g, W, H, null);
    } finally {
      showAgain();
      c.aspect = prev.aspect;
      c.updateProjectionMatrix();
      mv.rect.splice(0, 4, ...prev.rect);
      mv.overrides = prev.overrides;
      mv.camera = prev.camera;
      ['uDetective', 'uImpact', 'uImpactSoft'].forEach((k, i) => { if (ink.uniforms[k]) ink.uniforms[k].value = prev.u[i]; });
      if (prev.center) ink.uniforms.uImpactCenter.value.copy(prev.center);
      renderer.setPixelRatio(prev.pr);
      if (restoreSize) restoreSize();
      else { renderer.setSize(prev.size.x, prev.size.y, false); ink.setSize(prev.size.x, prev.size.y); }
    }
    return out;
  }

  function finishExport(out, jobs) {
    const done = (r) => { for (const j of jobs) j.resolve(r); };
    if (!out) { done(null); return; }
    sound('uiSelect');
    const a = access();
    if (!a.flashReduce && !a.reducedMotion) {
      flash.classList.remove('on');
      void flash.offsetWidth;
      flash.classList.add('on');
    }
    // The gallery keeps a small JPEG; the full PNG goes to the player's downloads.
    let kept = false;
    try {
      const t = thumbSize(out.width, out.height, 320);
      const tc = document.createElement('canvas');
      tc.width = t.w; tc.height = t.h;
      tc.getContext('2d').drawImage(out, 0, 0, t.w, t.h);
      const thumb = tc.toDataURL('image/jpeg', 0.72);
      kept = gallery.add({ id: `p${Date.now().toString(36)}`, t: Date.now(), w: out.width, h: out.height, filter, caption, thumb });
    } catch { kept = false; }
    const who = player;
    out.toBlob((blob) => {
      if (!blob) { done(null); return; }
      if (lastExport?.url) URL.revokeObjectURL(lastExport.url);
      const url = URL.createObjectURL(blob);
      lastExport = { width: out.width, height: out.height, bytes: blob.size, type: blob.type, url, gallery: kept };
      if (autoDownload) {
        const link = document.createElement('a');
        link.href = url;
        link.download = photoFileName(new Date());
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      onSaved(who);
      say(kept ? `Saved ${out.width} x ${out.height}. In the gallery too.` : `Saved ${out.width} x ${out.height}. Gallery is full or off.`);
      if (active) drawOverlay();
      done({ ...lastExport });
    }, 'image/png');
  }

  function runExports() {
    const jobs = pending;
    pending = [];
    let out = null;
    try { out = renderExport(); } catch (err) { console.warn('photo export failed', err); say('That one did not print. Try a smaller size.'); }
    finishExport(out, jobs);
  }

  // ---- per frame ----
  function update(real) {
    if (!active) return;
    // The game's own update ran first (the partner rig moved its camera): take it back.
    const k = (c) => (held.has(c) ? 1 : 0);
    const st = pin.stick ?? { mx: 0, my: 0, lx: 0, ly: 0 };
    const ph = (i) => (pin.padButtonHeld?.(i) ? 1 : 0);
    const pb = (i) => !!pin.padButton?.(i);
    if (!gal.isConnected) {
      cam = stepPhotoCam(cam, {
        moveX: k('KeyD') - k('KeyA') + st.mx,
        moveY: k('KeyW') - k('KeyS') - st.my,
        up: k('KeyR') - k('KeyF') + ph(PAD.RT) - ph(PAD.LT),
        lookX: lookX + (k('ArrowRight') - k('ArrowLeft')) * 500 * real + st.lx * 700 * real,
        lookY: lookY + (k('ArrowDown') - k('ArrowUp')) * 400 * real + st.ly * 500 * real,
        roll: k('KeyE') - k('KeyQ') + ph(PAD.RB) - ph(PAD.LB),
        zoom: k('KeyX') - k('KeyZ') + ph(PAD.DOWN) - ph(PAD.UP),
        fovDelta: wheel,
      }, real, anchor);
    }
    lookX = 0; lookY = 0; wheel = 0;
    apply();
    installHider();
    if (gal.isConnected) { if (pb(PAD.B)) closeGallery(); }
    else {
      if (pb(PAD.X)) act.filter();
      if (pb(PAD.Y)) act.frame();
      if (pb(PAD.VIEW)) act.hide();
      if (pb(PAD.START)) act.pose();
      if (pb(PAD.L3)) act.mode();
      if (pb(PAD.R3)) act.panel();
      if (pb(PAD.LEFT)) act.caption(-1);
      if (pb(PAD.RIGHT)) act.caption(1);
      if (pb(PAD.A)) save();
      if (pb(PAD.B)) { close(); return; }
    }
    if (focusMode === 'auto') label('.ph-fval', `${focusDist.toFixed(1)} m`);
    if (pending.length) runExports();
  }

  // After the frame is drawn: the filter / focus pass over the photographer's view, then the
  // hidden characters come back for the game.
  function postFrame() {
    if (!active) return;
    const o = { filter: postFilter(), focus: focusMode === 'off' ? 0 : focusDist, aperture: focusMode === 'off' ? 0 : aperture };
    if (post.wanted(o)) {
      // One player: the main view; split screen: the photographer's own view and rect.
      const iv = view.inkView;
      const px = iv?.px ?? [0, 0, renderer.domElement.width, renderer.domElement.height];
      if (iv?.target?.depthTexture) {
        try {
          post.apply({ px, depthTexture: iv.target.depthTexture, camera: view.camera, ...o, dot: 7 * renderer.getPixelRatio() });
        } catch (err) { console.warn('photo post failed', err); filter = 'ink'; focusMode = 'off'; }
      }
    }
    showAgain();
  }

  return {
    get active() { return active; },
    // Whether the whole world is frozen for it (one player). Game code that used to check
    // `photo.active` for "the game is paused" reads this instead.
    get freezesWorld() { return active && !live; },
    get live() { return active && live; },
    get player() { return player; },
    // Whether the keyboard belongs to photo mode right now (Esc and the photo key close it).
    get ownsKeyboard() { return active && hasKeys(); },
    get lastExport() { return lastExport; },
    get state() {
      return {
        active, live, slot: player?.slot ?? null, filter, frame, caption, hide, mode: cam?.mode ?? null,
        fov: cam?.fov ?? null, roll: cam?.roll ?? 0, focusMode, focusDist, aperture, pose: poser?.name ?? null,
        scrub: poser?.scrub ?? 0, items: items.map((i) => ({ ...i })), exportPreset, exportCap: exportCap(quality),
        clock: !!env?.hasClock, weather: !!env?.hasWeather, cam: cam ? { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch } : null,
      };
    },
    gallery,
    open, close, update, save, post: postFrame, openGallery, closeGallery,
    // Script / test hooks (the same as the panel's buttons).
    setFilter(name) { if (PHOTO_FILTERS.includes(name)) { filter = name; refresh(); } },
    setFrame(name) { if (FRAMES.includes(name)) { frame = name; refresh(); } },
    setHide(mode) { if (HIDE_MODES.includes(mode)) { hide = mode; installHider(); refresh(); } },
    setFocus(mode, dist, ap) { if (FOCUS_MODES.includes(mode)) focusMode = mode; if (dist > 0) focusDist = clamp(dist, 1, 40); if (ap > 0) aperture = clamp(ap, 0.1, 1); refresh(); },
    setExportSize(preset) { if (EXPORT_PRESETS.includes(preset)) { exportPreset = preset; refresh(); } },
    setPose(name, scrub = 0) { if (!poser) return false; const ok = name ? poser.hold(name, scrub) : (poser.release(), true); refresh(); return ok; },
    poses: () => poser?.list() ?? [],
    addItem(kind, opts) { act.add(kind); if (opts && selected) { items = updateItem(items, selected, opts); refresh(); } return selected; },
    setCaption(t) { caption = sanitizeCaption(t); capInput.value = caption; refresh(); },
    setHour(h) { if (env?.hasClock && !live) { env.setHour(h); refresh(); return true; } return false; },
    setWeather(w) { if (env?.hasWeather && !live) { env.setWeather(w); refresh(); return true; } return false; },
    // Moves the photo camera as if the sticks were held for `sec` (tests).
    nudge(cmd, sec = 0.5) { if (active) { cam = stepPhotoCam(cam, cmd, sec, anchor); apply(); } },
  };
}
