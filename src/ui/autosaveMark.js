// The autosave indicator (wave 3, workstream L1): a small spinning bat and "Saved" in the corner
// for a moment after any progress write. One element, made once; ping() costs a class toggle and
// a timer, and pings closer together than the display time just extend it.
export function createAutosaveMark(root) {
  const el = document.createElement('div');
  el.className = 'autosave-mark';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<svg viewBox="0 0 40 20" aria-hidden="true"><path d="M20 4 L23 9 L33 5 L30 13 L37 15 L22 16 L20 19 L18 16 L3 15 L10 13 L7 5 L17 9 Z"/></svg><span></span>';
  const label = el.querySelector('span');
  label.textContent = 'Saved';
  root.appendChild(el);
  let timer = 0, count = 0;
  return {
    ping() {
      count += 1;
      el.classList.add('show');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('show'), 1400);
    },
    get count() { return count; },
    get visible() { return el.classList.contains('show'); },
  };
}
