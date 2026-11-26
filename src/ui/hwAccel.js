// "Hardware acceleration is off" dialog (design doc, workstream A). Shown at boot when the browser
// is drawing on the CPU: a software renderer string (SwiftShader, llvmpipe, Microsoft Basic Render
// Driver) or a context that fails `failIfMajorPerformanceCaveat`. It says so in plain words, gives
// the exact steps for the player's browser, and offers "Check again" and "Play anyway (Potato)".
//
// detectBrowser() and hwAccelSteps() are pure (tests/unit/hwAccel.test.js); the dialog is DOM.
import { isSoftwareRenderer, hasPerformanceCaveat } from '../render/tierDetect.js';
import { loadSettings, saveSettings } from '../core/settings.js';

// ua: navigator.userAgent; brands: navigator.userAgentData?.brands (Chromium); brave: whether
// navigator.brave exists (Brave hides itself from the user-agent string).
export function detectBrowser(ua = '', brands = [], brave = false) {
  const names = (brands ?? []).map((b) => b.brand ?? '').join(' ');
  if (brave || /Brave/i.test(names)) return 'brave';
  if (/Edg(e|A|iOS)?\//.test(ua) || /Microsoft Edge/i.test(names)) return 'edge';
  if (/OPR\/|Opera|OPX\//.test(ua) || /Opera/i.test(names)) return 'opera';
  if (/Firefox\/|FxiOS\//.test(ua)) return 'firefox';
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua)) return 'safari';
  return 'other';
}

const RELAUNCH = 'Click Relaunch (or close every window of the browser and open it again).';
const STEPS = {
  chrome: {
    name: 'Chrome',
    steps: [
      'Open a new tab and go to chrome://settings/system',
      'Turn on "Use graphics acceleration when available".',
      RELAUNCH,
      'Still off? Go to chrome://gpu and check that "WebGL2" says "Hardware accelerated"; if it says the GPU is blocklisted, update your graphics driver.',
    ],
  },
  edge: {
    name: 'Microsoft Edge',
    steps: [
      'Open a new tab and go to edge://settings/system',
      'Turn on "Use graphics acceleration when available".',
      'Click Restart (or close every Edge window and open it again).',
      'Still off? Go to edge://gpu and check that "WebGL2" says "Hardware accelerated"; if not, update your graphics driver.',
    ],
  },
  brave: {
    name: 'Brave',
    steps: [
      'Open a new tab and go to brave://settings/system',
      'Turn on "Use graphics acceleration when available".',
      RELAUNCH,
      'Still off? Go to brave://gpu and check that "WebGL2" says "Hardware accelerated"; if not, update your graphics driver.',
    ],
  },
  opera: {
    name: 'Opera',
    steps: [
      'Open a new tab and go to opera://settings/system',
      'Turn on "Use hardware acceleration when available" (under Settings > Advanced > Browser > System).',
      'Close every Opera window and open it again.',
      'Still off? Go to opera://gpu and check that "WebGL2" says "Hardware accelerated"; if not, update your graphics driver.',
    ],
  },
  firefox: {
    name: 'Firefox',
    steps: [
      'Open Settings (about:preferences) and stay on the General page.',
      'Scroll to Performance and untick "Use recommended performance settings".',
      'Tick "Use hardware acceleration when available".',
      'Close every Firefox window and open it again. Still off? about:support > Graphics shows why (often an old driver).',
    ],
  },
  safari: {
    name: 'Safari',
    steps: [
      'Safari always uses the GPU; software drawing usually means Low Power Mode or an old macOS.',
      'Plug in power or turn off Low Power Mode (System Settings > Battery), then reload this page.',
      'Still slow? Try the latest Chrome or Edge, where you can switch hardware acceleration on.',
    ],
  },
  other: {
    name: 'your browser',
    steps: [
      'Open your browser\'s settings and search for "hardware acceleration" or "graphics acceleration".',
      'Turn it on, then close every window of the browser and open it again.',
      'If there is no such setting, update your graphics driver or try the latest Chrome, Edge or Firefox.',
    ],
  },
};

export function hwAccelSteps(browser) { return STEPS[browser] ?? STEPS.other; }

// The whole check, for boot and for "Check again": a software renderer string, or the browser
// refusing a context without a major performance caveat.
export function softwareRendering(rendererString, { caveat = hasPerformanceCaveat } = {}) {
  if (isSoftwareRenderer(rendererString)) return { software: true, reason: 'renderer' };
  if (caveat()) return { software: true, reason: 'caveat' };
  return { software: false, reason: null };
}

const DISMISS_KEY = 'gotham-hwaccel-dismissed-v1';
let styled = false;
function addStyle(doc) {
  if (styled) return;
  styled = true;
  const s = doc.createElement('style');
  s.textContent = `
.hwaccel{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(11,11,18,.62);padding:16px}
.hwaccel .hwaccel-panel{max-width:620px;width:100%;background:#f4ecd8;color:#0b0b12;border:4px solid #0b0b12;box-shadow:8px 8px 0 #0b0b12;padding:20px 24px;transform:rotate(-0.6deg);font:17px/1.4 "Patrick Hand SC","Comic Sans MS",system-ui,sans-serif}
.hwaccel h2{margin:0 0 6px;font:44px/1 Bangers,Impact,sans-serif;letter-spacing:1px;color:#b3122e;text-shadow:2px 2px 0 #0b0b12}
.hwaccel .lead{margin:0 0 10px}
.hwaccel ol{margin:6px 0 12px 22px;padding:0}
.hwaccel li{margin:4px 0}
.hwaccel code{font:15px ui-monospace,Consolas,monospace;background:#fff7e0;border:1px solid #0b0b12;padding:0 4px}
.hwaccel .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.hwaccel button{font:22px/1 Bangers,Impact,sans-serif;letter-spacing:1px;padding:10px 16px;border:3px solid #0b0b12;box-shadow:3px 3px 0 #0b0b12;background:#f2c230;color:#0b0b12;cursor:pointer}
.hwaccel button.alt{background:#fff7e0}
.hwaccel button:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #0b0b12}
.hwaccel .status{min-height:1.4em;margin:8px 0 0;font-weight:bold}
`;
  doc.head.appendChild(s);
}

// Shows the dialog if rendering is software and the player has not waved it off this session.
// Returns the element (or null). `tier`: the tier this boot runs on; `getRenderer()` re-reads the
// renderer string from a fresh context for "Check again".
export function maybeShowHwAccelDialog({ root, rendererString, storage, session, tier, getRenderer, nav = navigator, reload = () => location.reload() }) {
  const check = softwareRendering(rendererString);
  if (!check.software) return null;
  try { if (session?.getItem(DISMISS_KEY)) return null; } catch { /* storage blocked: show it */ }
  const doc = root.ownerDocument;
  addStyle(doc);
  const browser = detectBrowser(nav.userAgent, nav.userAgentData?.brands, !!nav.brave);
  const { name, steps } = hwAccelSteps(browser);
  const box = doc.createElement('div');
  box.className = 'hwaccel';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.dataset.browser = browser;
  const panel = doc.createElement('div');
  panel.className = 'hwaccel-panel';
  const h = doc.createElement('h2');
  h.textContent = 'Holy slideshow!';
  const lead = doc.createElement('p');
  lead.className = 'lead';
  lead.textContent = check.reason === 'renderer'
    ? `${name} is drawing this game on your CPU (hardware acceleration is off), so Gotham will crawl. Switch it on:`
    : `${name} won't give this game your graphics card (hardware acceleration looks off or blocked), so Gotham will crawl. Switch it on:`;
  const ol = doc.createElement('ol');
  for (const st of steps) {
    const li = doc.createElement('li');
    // Wrap the settings URLs in <code> so they read as something to type.
    const parts = st.split(/(\b[a-z]+:\/\/[^\s]+|about:[a-z]+)/);
    for (const p of parts) {
      if (/^([a-z]+:\/\/|about:)/.test(p)) { const c = doc.createElement('code'); c.textContent = p; li.appendChild(c); } else li.appendChild(doc.createTextNode(p));
    }
    ol.appendChild(li);
  }
  const status = doc.createElement('p');
  status.className = 'status';
  status.setAttribute('aria-live', 'polite');
  const row = doc.createElement('div');
  row.className = 'row';
  const again = doc.createElement('button');
  again.textContent = 'Check again';
  again.className = 'check';
  again.addEventListener('click', () => {
    const now = softwareRendering(getRenderer());
    if (now.software) status.textContent = 'Still drawing in software. Did the browser restart after the change?';
    else { status.textContent = 'Hardware acceleration is on. Reloading...'; setTimeout(reload, 600); }
  });
  const anyway = doc.createElement('button');
  anyway.textContent = 'Play anyway (Potato)';
  anyway.className = 'alt anyway';
  anyway.addEventListener('click', () => {
    try { session?.setItem(DISMISS_KEY, '1'); } catch { /* private window */ }
    if (tier === 'potato') { box.remove(); return; }
    // The cheapest tier, saved as the player's choice so it sticks; tiers apply on load.
    const s = loadSettings(storage);
    s.quality = 'potato';
    saveSettings(storage, s);
    reload();
  });
  row.append(again, anyway);
  panel.append(h, lead, ol, row, status);
  box.appendChild(panel);
  root.appendChild(box);
  return box;
}
