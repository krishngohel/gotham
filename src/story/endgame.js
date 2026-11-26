// After the finale (workstream J2): the ending the double life earned, the campaign's credits,
// free roam with the city reflecting that ending, mission replay from the Batcomputer, a 100%
// hook and the New Game Plus hook. Also registers the campaign's Batcomputer pages (missions,
// villain files, the Gazette) through the Bruce side's public registry (src/bruce/registry.js).
//
// Events:
//   campaignEnding { ending }                     the ending is decided (before its comic)
//   campaignComplete { ending, nights }           credits done, free roam begins
//   newGamePlus { available: true, ending, carry }  another workstream implements NG+ on this
//   campaignHundred { optional, total }           every optional objective in every night found
//   cityState { ending, calm, signal, tone }      for street life, radio and lighting to react to
import STORY from '../story.config.js';
import { allNights, missionSelect, stepsOf } from './campaign.js';
import { registerMissionProvider, registerBatcomputerTab } from '../bruce/registry.js';
import { VILLAIN_FILES } from './villainFiles.js';
import { storyHeadlines } from './headlines.js';

export const ENDINGS = ['family', 'partners', 'exposed', 'alone'];
const CITY = {
  family: { calm: 0.8, signal: 'lit', tone: 'warm' },
  partners: { calm: 0.65, signal: 'lit', tone: 'steady' },
  exposed: { calm: 0.6, signal: 'dark', tone: 'uneasy' },
  alone: { calm: 0.5, signal: 'dark', tone: 'cold' },
};

// Every optional objective in the campaign's later nights (the 100% count).
export function optionalTotal() {
  let n = 0;
  for (const night of allNights()) {
    if (night.id === 'n1') continue;
    for (const s of stepsOf(night)) n += (s.optional?.length ?? 0) + (s.interrupts?.length ?? 0);
  }
  return n;
}

export function createEndgame({ f, hud, radio, events, camp, theGame, replayMission, playScene, save, ending }) {
  let credits = null;

  function rollCredits(endingId) {
    if (typeof document === 'undefined') return Promise.resolve();
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'story-credits';
      // [verify] a11y: font sizes here scale with --a11y-text (settings.access.textSize).
      el.style.cssText = 'position:fixed;inset:0;z-index:40;background:#07070b;color:#efe6cf;overflow:hidden;font:calc(20px * var(--a11y-text, 1)) "Barlow Condensed",sans-serif;cursor:pointer';
      const sections = (STORY.campaignCredits ?? []).map((c) => `<h3 style="font:calc(28px * var(--a11y-text, 1)) 'Bangers',cursive;letter-spacing:2px;color:#f2c94c;margin:44px 0 8px">${c.title}</h3>${c.lines.map((l) => `<p style="margin:4px 0">${l}</p>`).join('')}`).join('');
      el.innerHTML = `<div class="roll" style="position:absolute;left:50%;width:min(640px,86vw);transform:translate(-50%,100vh);text-align:center;transition:transform ${STORY.creditsSeconds ?? 46}s linear">
        <h1 style="font:calc(56px * var(--a11y-text, 1)) 'Bangers',cursive;letter-spacing:3px;color:#f2c94c;margin:0">${STORY.campaignTitle ?? 'The Long Night'}</h1>
        <p style="font-size:calc(24px * var(--a11y-text, 1));margin:18px 0 0">${STORY.endingMessages?.[endingId] ?? STORY.finalMessage}</p>${sections}
        <p style="margin-top:60px;opacity:.7">${STORY.afterCredits ?? ''}</p></div>
        <div style="position:absolute;right:18px;bottom:14px;opacity:.6;font-size:calc(16px * var(--a11y-text, 1))">Click or press Space to skip</div>`;
      document.body.appendChild(el);
      const roll = el.querySelector('.roll');
      requestAnimationFrame(() => requestAnimationFrame(() => { roll.style.transform = `translate(-50%,-${roll.scrollHeight + 40}px)`; }));
      const end = () => { if (!credits) return; credits = null; clearTimeout(t); el.remove(); window.removeEventListener('keydown', key, true); resolve(); };
      const key = (e) => { if (e.code === 'Space' || e.code === 'Escape' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); end(); } };
      const t = setTimeout(end, (STORY.creditsSeconds ?? 46) * 1000 + 1500);
      el.addEventListener('click', end);
      window.addEventListener('keydown', key, true);
      credits = { end };
    });
  }

  function hundredCheck() {
    const c = camp();
    const total = optionalTotal();
    const found = (c.optionalDone ?? []).filter((k) => !k.startsWith('n1.')).length;
    if (total > 0 && found >= total && !c.choices?.['camp.hundred']) {
      c.choices ??= {};
      c.choices['camp.hundred'] = 'yes';
      events.emit('campaignHundred', { optional: found, total });
      hud.card?.('EVERY CORNER OF GOTHAM', STORY.hundredHook ?? 'Every optional objective, every night. Somebody left a card in the Batcave.', 8000);
      save();
    }
    return { found, total };
  }
  events.on('optionalDone', () => { if (camp().ending) hundredCheck(); });

  function freeRoam(endingId) {
    f.freeRoamBase();
    hud.setObjective?.(STORY.endingFreeRoam?.[endingId] ?? 'Gotham is yours. Replay any night from the Batcomputer.');
    const state = { ending: endingId, ...(CITY[endingId] ?? CITY.partners) };
    events.emit('cityState', state);
    // The double life remembers how it ended (the Gazette, Alfred's lines and the civilians read flags).
    const life = theGame()?.bruce?.life;
    if (life?.flags) life.flags[`ending.${endingId}`] = true;
    return state;
  }

  const api = {
    // The last night's nightEnd: the ending comic, credits, free roam, NG+.
    async play(night, s) {
      const id = ending();
      const c = camp();
      c.ending = id;
      save();
      events.emit('campaignEnding', { ending: id });
      const scene = night.endings?.[id];
      if (scene) await playScene(scene);
      f.setMode('cutscene');
      await rollCredits(id);
      f.setMode('play');
      freeRoam(id);
      events.emit('campaignComplete', { ending: id, nights: [...(c.nightsDone ?? [])] });
      const { found, total } = hundredCheck();
      events.emit('newGamePlus', { available: true, ending: id, carry: { rewards: [...(c.rewards ?? [])], optional: found, total } });
      setTimeout(() => hud.card?.('NEW GAME PLUS', STORY.ngPlusText ?? 'Start again from the title screen with everything you have earned.', 7000), 8500);
      save();
    },
    freeRoam,
    rollCredits,
    hundredCheck,
    get rolling() { return !!credits; },
    skipCredits() { credits?.end(); },
  };

  // ---- the Batcomputer: mission replay, villain files, the Gazette (Bruce registry hooks) ----
  registerMissionProvider(() => missionSelect(camp()).filter((m) => m.night !== 'n1' && m.replayable).map((m) => ({
    id: `${m.night}.${m.mission}`, title: `${m.nightTitle}: ${m.title}`, blurb: allNights().find((n) => n.id === m.night)?.blurb ?? '',
    start: () => replayMission(m.night, m.mission),
  })));
  registerBatcomputerTab('missions', {
    label: 'Missions',
    render: () => {
      const list = missionSelect(camp()).filter((m) => m.night !== 'n1');
      if (!list.length) return '<p>No missions on file yet. Go and make some.</p>';
      let last = null, html = '';
      for (const m of list) {
        if (m.night !== last) { last = m.night; html += `<h3>${m.nightTitle}</h3>`; }
        html += `<p>${m.done ? '&#10003;' : '&middot;'} ${m.title}${m.replayable ? ' <span class="ok">(replay)</span>' : ''}</p>`;
      }
      return html;
    },
    buttons: () => missionSelect(camp()).filter((m) => m.night !== 'n1' && m.replayable).slice(-8).map((m) => ({ label: `Replay: ${m.title}`, onClick: () => { theGame()?.bruce?.ui?.closeOverlay?.(); replayMission(m.night, m.mission); } })),
  });
  registerBatcomputerTab('villains', {
    label: 'Villain files',
    render: () => {
      const met = new Set(camp().nightsDone ?? []);
      const cur = camp().night;
      return VILLAIN_FILES.filter((v) => v.night === 'n1' || met.has(v.night) || v.night === cur).map((v) => `<h3>${v.alias}</h3><p><b>${v.realName}</b>. ${v.summary}</p><p class="note">Skill tested: ${v.skill}. Weakness: ${v.weakness}</p><p>${v.notes}</p>`).join('') || '<p>No files yet.</p>';
    },
  });
  registerBatcomputerTab('gazette', {
    label: 'Gazette',
    render: () => storyHeadlines(camp(), theGame()?.bruce?.life ?? null).map((h) => `<h3>${h.head}</h3><p>${h.sub}</p>`).join(''),
  });

  return api;
}
