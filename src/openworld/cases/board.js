// The case board (item 6): a full-screen comic-style overlay for the active case. Evidence is
// listed with its glyph as a shape AND a word plus the label (never colour-only); the
// reconstruction is an ordered deduction: click (or press 1-5) the event cards in the order they
// happened, Backspace takes the last one back, Enter submits, Esc closes. It calls
// cases.answer(order). Browser only.
const GLYPH_SHAPE = { print: '●', drop: '▼', mark: '✖', object: '■', wave: '≋' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function createCaseBoard({ root = document.body, cases, onClose = null } = {}) {
  let el = null, order = [], message = '';

  function render() {
    const a = cases.active;
    if (!el) return;
    if (!a) { el.innerHTML = '<div class="cb-sheet"><h2>CASE BOARD</h2><p>No case open. Pick one from the Batcomputer.</p><p class="cb-keys">Esc: close</p></div>'; return; }
    const { def, run } = a;
    const ev = run.evidence.map((e) => `<li class="${e.found ? 'found' : 'missing'}"><span class="cb-glyph" aria-hidden="true">${GLYPH_SHAPE[e.glyph] ?? '?'}</span> <b>[${esc(e.glyph.toUpperCase())}]</b> ${e.found ? `<b>${esc(e.label)}</b>: ${esc(e.text)}` : e.hinted ? `<i>Not found yet: ${esc(e.label)}</i>` : '<i>Not found yet</i>'}</li>`).join('');
    let recon = '';
    if (a.stage === 'reconstruct') {
      const cards = def.reconstruct.cards.map((c, i) => {
        const used = order.includes(c.id);
        const hint = run.revealed === c.id ? ' <b>(starts here)</b>' : '';
        return `<button class="cb-card${used ? ' used' : ''}" data-card="${esc(c.id)}" ${used ? 'disabled' : ''}>${i + 1}. ${esc(c.text)}${hint}</button>`;
      }).join('');
      const chosen = order.map((id, i) => `<li>${i + 1}. ${esc(def.reconstruct.cards.find((c) => c.id === id)?.text)}</li>`).join('');
      recon = `<h3>${esc(def.reconstruct.prompt)}</h3><div class="cb-cards">${cards}</div><ol class="cb-order">${chosen || '<li><i>Pick the first event</i></li>'}</ol>
        <div class="cb-actions"><button data-act="undo">Take back</button><button data-act="submit" ${order.length === def.reconstruct.cards.length ? '' : 'disabled'}>Submit</button></div>`;
    } else if (run.stage > 1) {
      recon = `<h3>What happened</h3><ol class="cb-order">${def.reconstruct.order.map((id) => `<li>${esc(def.reconstruct.cards.find((c) => c.id === id)?.text)}</li>`).join('')}</ol>`;
    }
    const hud = cases.hud();
    el.innerHTML = `<div class="cb-sheet"><h2>CASE BOARD: ${esc(def.title)}</h2><p class="cb-blurb">${esc(def.blurb ?? '')}</p>
      <p class="cb-status"><b>Now:</b> ${esc(hud?.text ?? '')}</p>
      <h3>Evidence (${run.foundCount}/${run.evidence.length})</h3><ul class="cb-evidence">${ev}</ul>${recon}
      ${message ? `<p class="cb-msg">${esc(message)}</p>` : ''}
      <p class="cb-keys">1-${def.reconstruct.cards.length}: pick a card &nbsp; Backspace: take back &nbsp; Enter: submit &nbsp; Esc: close</p></div>`;
  }

  function pick(id) {
    const a = cases.active;
    if (!a || a.stage !== 'reconstruct' || order.includes(id)) return;
    if (!a.def.reconstruct.cards.some((c) => c.id === id)) return;
    order.push(id);
    message = '';
    render();
  }
  function submit() {
    const a = cases.active;
    if (!a || a.stage !== 'reconstruct') return;
    const res = cases.answer(order.slice());
    order = [];
    message = res.ok ? 'That fits. Now follow the trail.' : res.revealed ? 'Not quite. The first card is marked for you.' : 'That order does not fit the evidence. Try again.';
    render();
  }
  function onKey(e) {
    if (!el) return;
    const a = cases.active;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); order.pop(); render(); return; }
    const n = Number(e.key);
    if (a && n >= 1 && n <= 5) { e.preventDefault(); e.stopPropagation(); const c = a.def.reconstruct.cards[n - 1]; if (c) pick(c.id); }
  }
  function onClick(e) {
    const card = e.target.closest?.('[data-card]');
    if (card) { pick(card.dataset.card); return; }
    const act = e.target.closest?.('[data-act]')?.dataset.act;
    if (act === 'undo') { order.pop(); render(); }
    if (act === 'submit') submit();
  }

  const api = {
    get isOpen() { return !!el; },
    open() {
      if (el) { render(); return; }
      el = document.createElement('div');
      el.className = 'case-board';
      el.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(5,8,12,0.78);font-family:"Patrick Hand SC","Comic Sans MS",sans-serif;color:#0b0b12';
      const style = document.createElement('style');
      // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
      style.textContent = `.case-board .cb-sheet{background:#efe6cf;border:6px solid #0b0b12;box-shadow:10px 10px 0 #0b0b12;max-width:780px;max-height:86vh;overflow:auto;padding:18px 24px;font-size:calc(18px * var(--a11y-text, 1))}
        .case-board h2{font-family:Bangers,Impact,sans-serif;letter-spacing:2px;font-size:calc(34px * var(--a11y-text, 1));margin:0 0 6px}.case-board h3{font-family:Bangers,Impact,sans-serif;letter-spacing:1px;margin:12px 0 4px}
        .case-board ul,.case-board ol{margin:4px 0 8px 18px;padding:0}.case-board li.missing{opacity:.7}.cb-glyph{display:inline-block;width:1.2em;text-align:center}
        .cb-cards{display:flex;flex-direction:column;gap:6px}.cb-card{text-align:left;font:inherit;background:#fff8e2;border:3px solid #0b0b12;padding:6px 10px;cursor:pointer}
        .cb-card.used{opacity:.4;text-decoration:line-through}.cb-actions button{font:inherit;margin:6px 8px 0 0;border:3px solid #0b0b12;background:#f2d24b;padding:4px 14px;cursor:pointer}
        .cb-actions button[disabled]{opacity:.5;cursor:default}.cb-msg{font-weight:bold}.cb-keys{font-size:calc(14px * var(--a11y-text, 1));opacity:.75}`;
      el.appendChild(style);
      const body = document.createElement('div');
      el.appendChild(body);
      el.addEventListener('click', onClick);
      root.appendChild(el);
      // render() replaces innerHTML: keep the style element by rendering into a child.
      const realEl = el;
      el = body;
      api._wrap = realEl;
      order = [];
      message = '';
      window.addEventListener('keydown', onKey, true);
      document.exitPointerLock?.();
      render();
    },
    close() {
      if (!el) return;
      window.removeEventListener('keydown', onKey, true);
      api._wrap?.remove();
      el = null;
      api._wrap = null;
      onClose?.();
    },
    refresh() { render(); },
    // Tests / scripts: pick cards and submit without the mouse.
    pick, submit,
    get order() { return order.slice(); },
  };
  return api;
}
