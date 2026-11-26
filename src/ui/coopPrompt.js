// A comic message box for co-op moments that stop play (workstream D1): a controller lost
// ("Player 2: press A on a controller"), a join that cannot happen yet. Buttons are optional;
// the pad answers through the game's own menu navigation.
export function createCoopPrompt(root = document.body) {
  const el = document.createElement('div');
  el.className = 'coop-prompt menu-layer';
  root.appendChild(el);
  let shown = null;
  return {
    get open() { return !!shown; },
    get id() { return shown; },
    show(id, title, text, buttons = []) {
      shown = id;
      el.innerHTML = `<div class="box"><h3></h3><p></p><div class="mlist"></div></div>`;
      el.querySelector('h3').textContent = title;
      el.querySelector('p').innerHTML = text;
      const list = el.querySelector('.mlist');
      for (const b of buttons) {
        const btn = document.createElement('button');
        btn.className = `mbtn ${b.cls ?? ''}`;
        btn.textContent = b.label;
        btn.addEventListener('click', (e) => { e.stopPropagation(); b.onClick(); });
        list.appendChild(btn);
      }
      el.classList.add('show');
      list.querySelector('button')?.focus();
    },
    hide() { shown = null; el.classList.remove('show'); el.innerHTML = ''; },
  };
}
