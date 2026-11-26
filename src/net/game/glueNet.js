// [net2] Paired co-op moves online: dual takedowns and team moves (src/coop/glue.js) start on the
// host, which sees the guest's presses as edges on its remote input (puppets.js `edges`). The glue
// gives each hero a move control with a clip and a contact time; a networked partner's hero never
// runs hero.update on the host, so this module:
//   host:  runs that control for the remote hero (its strike lands through the remote fighter at
//          the contact time, on the host's clock, so KO credit and XP are the guest's), and tells
//          the guest to play its part ('ev' glueMove: clip, where to stand, facing, start time)
//   guest: stands its hero there and plays the clip under a held control (input locked, invulnerable)
//          that ends with the clip: one move, one timeline (the host's), seen on both machines.
export function createGlueHost({ remote, rep, now = () => performance.now() }) {
  let seen = null;
  return {
    frame(dt) {
      const h = remote.hero, c = h.control;
      if (!c || !c.signature) { seen = null; return; }
      if (c !== seen) {
        seen = c;
        rep.event({ t: 'ev', name: 'glueMove', data: { name: String(c.name ?? 'move').slice(0, 24), clip: String(h.bat.animator.currentName ?? '').slice(0, 40), pos: { x: +h.pos.x.toFixed(2), y: +h.pos.y.toFixed(2), z: +h.pos.z.toFixed(2) }, yaw: +h.bat.yaw.toFixed(3), at: now() } });
      }
      // The puppet pose stays the guest's (it plays the same clip); the control only times the strike.
      let done = false;
      try { done = c.update(dt); } catch (e) { console.error(e); done = true; }
      if (done && h.control === c) { h.control = null; seen = null; }
    },
  };
}

export function createGlueGuest({ hero, follow, events, hostNow }) {
  return {
    play(d) {
      if (!d || hero.dead || typeof d.clip !== 'string') return;
      const anim = hero.bat.animator;
      const clip = anim.has?.(d.clip) ? d.clip : null;
      if (d.pos && Number.isFinite(d.pos.x)) hero.teleport(d.pos, Number.isFinite(d.yaw) ? d.yaw : hero.bat.yaw);
      if (Number.isFinite(d.yaw)) { hero.bat.face(d.yaw); follow?.snapBehind?.(d.yaw, 0.15); }
      const late = Number.isFinite(d.at) ? Math.max(0, (hostNow() - d.at) / 1000) : 0;
      if (clip) anim.play(clip, { once: true, fade: 0.08, timeScale: 1.1, startAt: Math.min(late * 1.1, 0.3) });
      const dur = Math.min(2.2, (anim.clips?.get?.(clip)?.duration ?? 1.4) / 1.1);
      let t = Math.min(late, 0.3);
      hero.invulnerable = Math.max(hero.invulnerable, dur + 0.2);
      hero.control = { name: d.name ?? 'teamMove', combat: true, signature: true, netMove: true, update(dt) { t += dt; return t >= dur; }, canChain: () => t > dur * 0.8 };
      events?.emit?.('netGlueMove', { name: d.name });
    },
  };
}
