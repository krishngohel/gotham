// The revive ring over a downed co-op hero (workstream D1): a comic ring that fills while a
// partner holds the revive button beside them, with the button to hold for the player who can help.
// One element per (view, downed player), pooled, placed in that view's own HUD; positions are the
// only thing written every frame.
const R = 22, C = 2 * Math.PI * R;

export function createReviveRing(getHuds) {
  const pool = new Map(); // key -> { el, fill, label, on }
  function get(hud, key) {
    let r = pool.get(key);
    if (r && r.hud !== hud) { r.el.remove(); pool.delete(key); r = null; }
    if (!r) {
      const el = document.createElement('div');
      el.className = 'revive-ring';
      el.innerHTML = `<svg viewBox="0 0 56 56"><circle class="bg" cx="28" cy="28" r="${R}"/><circle class="fill" cx="28" cy="28" r="${R}" stroke-dasharray="0 ${C.toFixed(1)}" transform="rotate(-90 28 28)"/></svg><b>!</b><span></span>`;
      hud.el.querySelector('.hud-layer')?.appendChild(el) ?? hud.el.appendChild(el);
      r = { el, hud, fill: el.querySelector('.fill'), label: el.querySelector('span'), on: true, text: '', prog: -1 };
      pool.set(key, r);
    }
    return r;
  }
  const seen = new Set();
  const head = { x: 0, y: 0, z: 0 };
  return {
    // players: Player[]; revive: the rule; split: the view manager; toScreenOf(player) -> fn(world)
    // projecting into that player's view; keyFor(player, action) -> '<kbd>..</kbd>'.
    update(players, revive, split, toScreenOf, keyFor) {
      seen.clear();
      if (players.length > 1) {
        const views = split.split ? split.views : split.views.slice(0, 1);
        for (const v of views) {
          const hud = v.hud ?? getHuds()[0];
          for (const p of players) {
            if (!p.hero.dead || !revive.isDown(p.id)) continue;
            const key = `${v.player.id}:${p.id}`;
            seen.add(key);
            const r = get(hud, key);
            const st = revive.state(p.id);
            head.x = p.hero.pos.x; head.y = p.hero.pos.y + 1.2; head.z = p.hero.pos.z;
            const s = toScreenOf(v.player)(head);
            r.el.style.display = s.behind ? 'none' : '';
            r.el.style.left = `${s.x}px`;
            r.el.style.top = `${s.y}px`;
            const prog = Math.round(st.progress * 100) / 100;
            if (prog !== r.prog) { r.prog = prog; r.fill.setAttribute('stroke-dasharray', `${(prog * C).toFixed(1)} ${C.toFixed(1)}`); }
            const helper = v.player !== p && !v.player.hero.dead;
            const text = helper ? `Hold ${keyFor(v.player, 'grapple')} to revive · ${Math.ceil(st.left)}s` : `Down! ${Math.ceil(st.left)}s`;
            if (text !== r.text) { r.text = text; r.label.innerHTML = text; }
          }
        }
      }
      for (const [key, r] of pool) if (!seen.has(key)) { r.el.remove(); pool.delete(key); }
    },
  };
}
