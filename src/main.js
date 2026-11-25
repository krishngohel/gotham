import './ui/style.css';
import { startGame } from './game/game.js';
import { tipAt } from './ui/loadingTips.js'; // [polish] loading-screen tips

const params = new URLSearchParams(location.search);
const loading = document.getElementById('loading');

const hasWebGL2 = (() => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } })();

if (!hasWebGL2) {
  loading.classList.add('error');
} else if (matchMedia('(pointer: coarse)').matches && !params.has('force')) {
  loading.classList.add('mobile');
} else {
  const bar = loading.querySelector('.bar i');
  // [polish] A tip at a time while the city builds (fades between them; stops when the game starts).
  const tipEl = loading.querySelector('.tip');
  let tick = 0;
  const seed = Math.floor(Math.random() * 12);
  const nextTip = () => { if (!tipEl) return; tipEl.classList.remove('in'); setTimeout(() => { tipEl.textContent = tipAt(tick++, seed); tipEl.classList.add('in'); }, tick ? 250 : 0); };
  nextTip();
  const tipTimer = setInterval(nextTip, 5200);
  startGame({
    canvas: document.getElementById('game'),
    hudRoot: document.body,
    params,
    onProgress: (f) => { bar.style.animation = 'none'; bar.style.width = `${Math.round(f * 100)}%`; },
  })
    .then(() => { clearInterval(tipTimer); loading.remove(); })
    .catch((err) => { console.error(err); loading.classList.add('error'); });
}
