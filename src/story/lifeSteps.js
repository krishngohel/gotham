// The double life inside the nights (workstream J2): the owner asked to FEEL the strain of being
// two people at once. Bruce's life reaches into a night through these, all plain data on a step:
//
//   calls     a step field: Bruce's phone rings mid-step (a date texting, the board calling during a
//             chase, Alfred needing a cover story). A choice wheel (keys 1-3, or click) with a timer
//             while play carries on; no answer is an answer (`default`). The choice is saved
//             (progress.campaign.choices['n6.date'] = 'sorry') and moves the double-life meters.
//   locks     a step field: ['detective', 'gadgets', 'grapple'] are offline for the step (the
//             strategist's gauntlet in Night Eight). Every player's input for those actions reads
//             as not pressed; detective vision is switched off.
//   life      a step type that branches at once on how the night started or on an earlier choice:
//             test 'backup' | 'tail' | 'rndFrozen' | 'alfredOff' | 'tired' | 'choice:<key>=<value>'
//             branches { yes: stepId, no: stepId }.
//   dilemma   a step type: Bruce is needed THERE and Batman HERE at the same time. Two markers and a
//             clock. Reaching one picks it (branch 'bruce' or 'batman'); the other resolves worse and
//             is remembered. Two players can split up and cover both (branch 'both' when given).
//             Time running out picks `timeout` (default 'batman') with the Bruce side missed too.
//   civvy     a step type played as Bruce Wayne in plain clothes, in the open city (the Bruce
//             runtime's becomeBruce/becomeBatman; its choice panel): walk to each beat, talk, choose.
//             Choices cost or earn Suspicion and Standing like a day scene does. Ends suited up.
//
// Bruce is reached only through its public surface (window.__game.bruce: becomeBruce, becomeBatman,
// nightStart, life, ui) and the pure applyEffects() from src/bruce/doubleLife.js. With no Bruce
// runtime (unit tests, a headless run) every choice falls back to its default after its timer.
import { applyEffects } from '../bruce/doubleLife.js';

const DEFAULT_CALL_AFTER = 10; // seconds into a step before a call rings
const DEFAULT_CALL_TIMEOUT = 14;

export const LOCK_ACTIONS = { detective: ['detective'], gadgets: ['batarang', 'gadgetWheel'], grapple: ['grapple'] };
const LOCK_LABEL = { detective: 'Detective vision', gadgets: 'Gadgets', grapple: 'Grapple' };

// Pure: does a `life` test pass, given how the night started (bruce.nightStart()) and the saved choices.
export function lifeTest(test, { opening = null, choices = {}, life = null } = {}) {
  if (!test) return false;
  if (test.startsWith('choice:')) {
    const [k, v] = test.slice(7).split('=');
    return v == null ? k in choices : choices[k] === v;
  }
  if (test.startsWith('thread:')) {
    const [k, v] = test.slice(7).split('>=');
    return (life?.threads?.[k] ?? 0) >= Number(v);
  }
  const o = opening ?? {};
  switch (test) {
    case 'backup': return o.backup !== false;
    case 'tail': return !!o.tail;
    case 'rndFrozen': return !!o.rndFrozen;
    case 'alfredOff': return o.alfredOnComms === false;
    case 'tired': return (o.staminaRegenK ?? 1) < 0.8;
    case 'escalated': return !!o.escalated;
    default: return false;
  }
}

// Pure: the finale's ending from the double life (who is still standing with Bruce).
//   'family'   Alfred, the ward and someone he loves are still at his table
//   'partners' the family is frayed, but Gordon (and Lucius) stand with Batman
//   'exposed'  the detective has worked it out; she keeps the secret, on her terms
//   'alone'    Alfred has had enough, the ward has gone, and the cave is quiet
export function endingFor(life) {
  if (!life) return 'partners';
  const t = life.threads ?? {};
  const s = life.suspicion ?? {};
  if (life.flags?.alfredBreak || (t.alfred ?? 0) < 2) return 'alone';
  if ((s.detective ?? 0) >= 80 || (s.reporter ?? 0) >= 85) return 'exposed';
  if ((t.alfred ?? 0) >= 3 && (t.ward ?? 0) >= 2 && ((t.love ?? 0) >= 2 || (life.standing ?? 0) >= 60)) return 'family';
  return 'partners';
}

export function createLifeSteps(ctx) {
  const { markers, hud, radio, events, standing, site, theGame } = ctx;
  const pos = (p) => (typeof p === 'string' ? site(p) : p);
  const bruce = () => theGame()?.bruce ?? null;
  const players = () => ctx.players?.() ?? [];
  const camp = () => ctx.camp();
  const nightId = () => ctx.nightId();
  const near = (at, r = 6) => at && standing().some((h) => Math.hypot(h.pos.x - at.x, h.pos.z - at.z) < r && Math.abs(h.pos.y - at.y) < 6);
  const heroesNear = (at, r = 6) => (at ? standing().filter((h) => Math.hypot(h.pos.x - at.x, h.pos.z - at.z) < r && Math.abs(h.pos.y - at.y) < 6) : []);

  function record(key, value) {
    const c = camp();
    c.choices ??= {};
    if (!ctx.replaying?.()) c.choices[key.includes('.') ? key : `${nightId()}.${key}`] = value;
  }
  function effects(eff, reason) {
    const life = bruce()?.life;
    if (!life || !eff) return [];
    const out = applyEffects(life, eff, reason);
    if (out.length) bruce()?.ui?.changes?.(out);
    return out;
  }
  // The choice panel: Bruce's own (keys 1-9, click) when the runtime is there.
  function choose(prompt, options, onPick, timer = null) {
    const ui = bruce()?.ui;
    if (ui?.choose) { ui.choose(prompt, options.map((o) => ({ id: o.id, text: o.text, tag: o.tag ?? '' })), onPick, timer); return true; }
    return false;
  }
  const hideChoices = () => bruce()?.ui?.hideChoices?.();
  const setChoiceTimer = (left, max) => bruce()?.ui?.timer?.(left, max);

  // ---------------------------------------------------------------- calls (a field on any step)
  const calls = (() => {
    let step = null, age = 0, queue = [], open = null;
    function answered(c) { return !!camp().choices?.[`${nightId()}.${c.id}`] && !ctx.replaying?.(); }
    function pick(id, timedOut = false) {
      if (!open) return;
      const c = open.call;
      open = null;
      hideChoices();
      const o = c.options.find((x) => x.id === id) ?? c.options.find((x) => x.id === c.default) ?? c.options[0];
      record(c.id, timedOut && c.silent ? c.silent : o.id);
      effects(timedOut && c.silentEffects ? c.silentEffects : o.effects, c.from ?? 'call');
      const lines = timedOut && c.silentLines ? c.silentLines : o.lines;
      if (lines?.length) radio?.say(lines);
      events.emit('storyCall', { night: nightId(), id: c.id, choice: o.id, timedOut });
    }
    function ring(c) {
      const t = c.timeout ?? DEFAULT_CALL_TIMEOUT;
      open = { call: c, left: t, max: t };
      events.emit('word', { text: c.sound ?? 'BZZT BZZT', pos: ctx.hero.pos.clone?.().setY?.(ctx.hero.pos.y + 2.2) ?? ctx.hero.pos, big: false });
      events.emit('storyCall', { night: nightId(), id: c.id, ring: true, from: c.from ?? null });
      if (c.lines?.length) radio?.say(c.lines);
      if (!choose(c.prompt, c.options, (id) => pick(id), { left: t, max: t })) hud.card?.(c.title ?? 'INCOMING', c.prompt, 4000);
    }
    return {
      enter(s) {
        if (open) pick(open.call.default, true);
        step = s; age = 0;
        queue = (s.calls ?? []).filter((c) => !answered(c));
      },
      update(dt) {
        if (!step) return;
        age += dt;
        if (open) {
          open.left -= dt;
          setChoiceTimer(open.left, open.max);
          if (open.left <= 0) pick(open.call.default, true);
          return;
        }
        const c = queue[0];
        if (!c || age < (c.after ?? DEFAULT_CALL_AFTER) || radio?.playing) return;
        queue.shift();
        if (c.when && !lifeTest(c.when, { opening: ctx.opening(), choices: camp().choices, life: bruce()?.life })) return;
        ring(c);
      },
      exit() { if (open) pick(open.call.default, true); step = null; queue = []; },
      get open() { return open?.call ?? null; },
      answer(id) { pick(id); },
      // Dev and the simulator: ring the next call now.
      debugRing() { const c = queue.shift(); if (c) ring(c); return c?.id ?? null; },
    };
  })();

  // ---------------------------------------------------------------- locks (a field on any step)
  const locks = (() => {
    const held = new Map(); // input -> original methods
    let active = [];
    function lock(list) {
      const acts = new Set(list.flatMap((k) => LOCK_ACTIONS[k] ?? []));
      for (const p of players()) {
        const inp = p.input;
        if (!inp || held.has(inp)) continue;
        const orig = {};
        for (const m of ['pressed', 'down', 'held', 'released']) {
          if (typeof inp[m] !== 'function') continue;
          orig[m] = inp[m];
          inp[m] = (a, ...rest) => (acts.has(a) ? false : orig[m].call(inp, a, ...rest));
        }
        held.set(inp, orig);
        if (p.rig) p.rig.detectiveOn = false;
      }
      if (list.includes('detective')) { const st = theGame()?.state; if (st) st.detectiveOn = false; }
    }
    function unlock() {
      for (const [inp, orig] of held) for (const [m, fn] of Object.entries(orig)) inp[m] = fn;
      held.clear();
    }
    return {
      enter(s) {
        unlock();
        active = s.locks ?? [];
        if (!active.length) return;
        // [onboard] The ability layer (src/abilities/runtime.js) owns the lock when it is there: it
        // switches the abilities off at their trigger points and keeps a standing HUD note. The
        // input patch below is the fallback for a build without it.
        if (!theGame()?.abilities) lock(active);
        hud.card?.('OFFLINE', `${active.map((k) => LOCK_LABEL[k] ?? k).join(', ')}. ${s.lockText ?? 'You will have to do this the hard way.'}`, 5000);
        events.emit('storyLocks', { locks: [...active] });
      },
      update() {
        if (!active.length) return;
        // A player who joined mid-step is locked too; detective vision stays off.
        if (!theGame()?.abilities && players().some((p) => p.input && !held.has(p.input))) lock(active);
        if (active.includes('detective')) { const st = theGame()?.state; if (st?.detectiveOn) st.detectiveOn = false; }
      },
      exit() { if (active.length) events.emit('storyLocks', { locks: [] }); active = []; unlock(); },
      get active() { return active; },
    };
  })();

  // ---------------------------------------------------------------- life (branch at once)
  const life = {
    enter(s) {
      const ok = lifeTest(s.test, { opening: ctx.opening(), choices: camp().choices ?? {}, life: bruce()?.life });
      const lines = ok ? s.yesLines : s.noLines;
      if (lines?.length) radio?.say(lines);
      ctx.done(s, ok ? 'yes' : 'no');
    },
    update() {}, marker() { return null; }, exit() {}, onRespawn() {},
  };

  // ---------------------------------------------------------------- dilemma
  const dilemma = (() => {
    let marks = [], clock = null, B = null, W = null, picked = false, wait = 0;
    function settle(s, branch) {
      if (picked) return;
      picked = true;
      ctx.ui.timer(null);
      record(s.key ?? s.id, branch);
      const miss = branch === 'batman' || branch === 'timeout' ? s.bruce?.miss : branch === 'bruce' ? s.batman?.miss : null;
      if (miss?.effects) effects(miss.effects, s.bruce?.label ?? 'dilemma');
      if (branch === 'both') effects(s.both?.effects, 'covered both');
      const lines = (branch === 'both' ? s.both?.lines : branch === 'bruce' ? s.bruce?.lines : s.batman?.lines) ?? [];
      const after = miss?.lines ?? [];
      if (lines.length || after.length) radio?.say([...lines, ...after]);
      events.emit('storyDilemma', { night: nightId(), id: s.id, choice: branch });
      const to = branch === 'timeout' ? (s.timeoutBranch ?? 'batman') : branch;
      ctx.done(s, s.branches?.[to] ? to : branch === 'both' ? 'batman' : to);
    }
    return {
      enter(s) {
        picked = false; wait = 0;
        B = pos(s.bruce.site); W = pos(s.batman.site);
        marks = [B ? markers.place('scan', B, { color: 0xf2d24b }) : null, W ? markers.place('scan', W) : null];
        clock = s.timer ?? null;
        const show = () => hud.card?.(s.heading ?? 'TWO PLACES AT ONCE', s.card ?? `${s.bruce.label} (gold), or ${s.batman.label}. You cannot be both.`, 7000);
        if (s.title) setTimeout(show, 4400); else show();
      },
      update(dt, s) {
        if (picked) return;
        if (clock != null) { clock -= dt; ctx.ui.timer(clock); if (clock <= 0) { settle(s, 'timeout'); return; } }
        const atB = heroesNear(B, s.bruce.radius ?? 8), atW = heroesNear(W, s.batman.radius ?? 10);
        if (s.both && atB.length && atW.length && (atB.length > 1 || atW.length > 1 || atB[0] !== atW[0])) { settle(s, 'both'); return; }
        const coop = players().length > 1 && !!s.both;
        if (!coop) { if (atB.length) settle(s, 'bruce'); else if (atW.length) settle(s, 'batman'); return; }
        // Two players: whoever arrives first waits a few seconds for the partner to take the other.
        if (atB.length || atW.length) { wait += dt; if (wait > (s.bothWait ?? 8)) settle(s, atB.length ? 'bruce' : 'batman'); }
      },
      marker() { return W ?? B; },
      exit() { for (const m of marks) markers.release(m); marks = []; ctx.ui.timer(null); },
      onRespawn() {},
      debugSolve(s) { const b = pos(s.batman.site); return b ? [{ at: b, hold: 0.6 }] : []; },
    };
  })();

  // ---------------------------------------------------------------- civvy (as Bruce, in the city)
  const civvy = (() => {
    let beats = [], i = 0, mark = null, talking = false, wasBruce = false, done = false, pendingGo = null;
    function placeMark() {
      markers.release(mark); mark = null;
      const b = beats[i];
      if (b?.at) mark = markers.place('scan', b.at, { color: 0xf2d24b });
      if (b?.text) hud.setObjective?.(b.text);
    }
    function finish(s) {
      if (done) return;
      done = true;
      markers.release(mark); mark = null;
      if (s.endLines?.length) radio?.say(s.endLines);
      const B = bruce();
      if (B && B.state?.identity === 'bruce' && s.suitUp !== false) {
        B.becomeBatman?.();
        events.emit('word', { text: 'QUICK CHANGE', pos: ctx.hero.pos.clone?.().setY?.(ctx.hero.pos.y + 2.2) ?? ctx.hero.pos, big: true });
      }
      ctx.done(s);
    }
    async function runBeat(s, b) {
      talking = true;
      if (b.lines?.length) await radio?.say(b.lines);
      if (b.choice) {
        await new Promise((res) => {
          const t = b.choice.timeout ?? 20;
          let left = t;
          const go = (id) => {
            if (!res) return;
            pendingGo = null;
            clearInterval(tick);
            hideChoices();
            const o = b.choice.options.find((x) => x.id === id) ?? b.choice.options.find((x) => x.id === b.choice.default) ?? b.choice.options[0];
            record(b.choice.key ?? `${s.id}${b.id ?? i}`, o.id);
            effects(o.effects, s.label ?? 'as Bruce');
            const after = o.lines ?? [];
            events.emit('storyCivvy', { night: nightId(), step: s.id, beat: b.id ?? i, choice: o.id });
            const r = res; res = null;
            (after.length ? radio?.say(after) ?? Promise.resolve() : Promise.resolve()).then(r);
          };
          pendingGo = () => go(b.choice.default);
          const tick = setInterval(() => { left -= 0.25; setChoiceTimer(left, t); if (left <= 0) go(b.choice.default); }, 250);
          if (!choose(b.choice.prompt, b.choice.options, go, { left: t, max: t })) setTimeout(() => go(b.choice.default), 50);
        });
      }
      talking = false;
      i += 1;
      if (i >= beats.length) finish(s); else placeMark();
    }
    return {
      enter(s) {
        done = false; talking = false; i = 0;
        beats = (s.beats ?? []).map((b) => ({ ...b, at: pos(b.site) }));
        const B = bruce();
        wasBruce = B?.state?.identity === 'bruce';
        if (B && !wasBruce) B.becomeBruce?.(s.outfit ?? 'suit');
        if (s.card) { const show = () => hud.card?.('AS BRUCE WAYNE', s.card, 6500); if (s.title) setTimeout(show, 4400); else show(); }
        placeMark();
      },
      update(dt, s) {
        if (done || talking) return;
        const b = beats[i];
        if (!b) { finish(s); return; }
        if (!b.at || near(b.at, b.radius ?? 4)) runBeat(s, b);
      },
      marker() { return beats[i]?.at ?? null; },
      exit() { markers.release(mark); mark = null; beats = []; if (!done) { const B = bruce(); if (B?.state?.identity === 'bruce') B.becomeBatman?.(); } },
      onRespawn() {},
      debugSolve(s) { return (s.beats ?? []).map((b) => ({ at: pos(b.site), hold: 0.4, talk: true })); },
      debugAnswer() { if (pendingGo) { pendingGo(); return true; } return false; },
    };
  })();

  return { types: { life, dilemma, civvy }, calls, locks, choose, record, effects };
}
