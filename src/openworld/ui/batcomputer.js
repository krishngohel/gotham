// The open world on the Batcomputer (src/bruce/registry.js registerBatcomputerTab): the state of
// the city (heat, mood, who runs each district, lieutenants, completion), the case files, and side
// ops (the chains, the stealth encounters to replay, trials, the post-game contracts). Buttons in
// the tab html carry data-ow="action:id"; one delegated click listener runs them, then presses the
// overlay's own Back button so the Batcomputer closes the normal way.
import { registerBatcomputerTab } from '../../bruce/registry.js';
import { DISTRICT_LABEL } from '../../world/regions/data.js';
import { gangName } from '../gangs.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (v) => `${Math.round(v * 100)}%`;
const MOOD = { safe: 'safe', calm: 'calm', uneasy: 'uneasy', tense: '<span class="hot">tense</span>', lawless: '<span class="hot">LAWLESS</span>' };

export function cityStateRows(world) {
  const comp = world.completion();
  return world.director.summary().filter((r) => world.progress.districts.includes(r.district) || r.lt || r.stopped || r.failed)
    .map((r) => ({ ...r, label: DISTRICT_LABEL[r.district] ?? r.district, completion: comp[r.district] ?? { done: 0, total: 0 } }));
}

export function registerOpenWorldTabs(world) {
  const offs = [];
  offs.push(registerBatcomputerTab('cityState', {
    label: 'State of the city',
    render() {
      const rows = cityStateRows(world);
      const s = world.store;
      const lts = rows.filter((r) => r.lt);
      return `<p>Crimes stopped: <b>${world.progress.crimes.stopped}</b> · arrests: <b>${s.arrests}</b> · civilians saved: <b>${s.saved}</b> · hurt: <b>${s.hurt}</b> · getaways: <b>${s.getaways}</b></p>
        <table><tr><th>District</th><th>Heat</th><th>Mood</th><th>Runs it</th><th>Done</th></tr>${rows.map((r) => `<tr><td>${esc(r.label)}</td><td>${r.heat.toFixed(1)} / 5</td><td>${MOOD[r.mood] ?? r.mood}</td><td>${esc(gangName(r.gang))} (${pct(r.control[r.gang] ?? 0)})</td><td>${r.completion.done}/${r.completion.total}</td></tr>`).join('')}</table>
        ${lts.length ? `<h3>Lieutenants</h3><ul>${lts.map((r) => `<li><b>${esc(r.lt.name)}</b> runs ${esc(r.label)} for ${esc(gangName(r.lt.gang))}${r.lt.memory.length ? ` (remembers your ${esc(r.lt.memory.join(', '))})` : ''}</li>`).join('')}</ul>` : '<p>No lieutenant holds a district. Yet.</p>'}
        <p><i>${esc(world.headline?.() ?? '')}</i></p>`;
    },
  }));
  offs.push(registerBatcomputerTab('cases', {
    label: 'Case files',
    render() {
      const list = world.cases?.list() ?? [];
      return `<table><tr><th>Case</th><th>District</th><th>Status</th><th></th></tr>${list.map((c) => `<tr><td>${esc(c.title)}</td><td>${esc(DISTRICT_LABEL[c.district] ?? c.district)}</td><td>${c.solved ? '<span class="ok">solved</span>' : !c.unlocked ? 'locked' : c.active ? 'open (active)' : c.stage ? `open: ${esc(c.stage)}` : 'unopened'}</td><td>${c.unlocked && !c.active && !c.chain ? `<button data-ow="case:${esc(c.id)}">${c.solved ? 'Replay' : 'Investigate'}</button>` : c.chain ? '<i>side chain</i>' : ''}</td></tr>`).join('')}</table>`;
    },
  }));
  offs.push(registerBatcomputerTab('sideOps', {
    label: 'Side ops',
    render() {
      const chains = world.chains?.list() ?? [];
      const stealth = world.stealthEnc?.list() ?? [];
      const trials = world.collect?.list('trials') ?? [];
      const contract = world.collect?.contractUnlocked?.();
      return `<h3>Side missions</h3><table>${chains.map((c) => `<tr><td><b>${esc(c.title)}</b><br><small>${esc(c.blurb)}</small></td><td>${c.done}/${c.total}</td><td>${(() => { const m = c.missions.find((x) => !x.done && x.unlocked); return m ? `<button data-ow="chain:${esc(m.id)}">${esc(m.title)}</button>` : c.done >= c.total ? '<span class="ok">done</span>' : `after night ${esc(c.after.replace('n', ''))}`; })()}</td></tr>`).join('')}</table>
        <h3>Predator encounters</h3><table>${stealth.map((e) => `<tr><td>${esc(e.title)}</td><td>${esc(DISTRICT_LABEL[e.district] ?? e.district)}</td><td>${e.medal ? esc(e.medal) : '-'}${e.best != null ? ` (${e.best}s)` : ''}</td><td><button data-ow="stealth:${esc(e.id)}">${e.played ? 'Replay' : 'Go'}</button></td></tr>`).join('')}</table>
        <h3>Trials</h3><table>${trials.map((t) => `<tr><td>${esc(t.name ?? t.id)}</td><td>${esc(t.medal ?? '-')}</td><td><button data-ow="trial:${esc(t.id)}">Run</button></td></tr>`).join('')}</table>
        ${contract ? '<h3>Most Wanted</h3><p><button data-ow="contract:next">Take the next contract</button></p>' : '<p><small>Most Wanted contracts open after the last night.</small></p>'}`;
    },
  }));
  const onClick = (e) => {
    const b = e.target?.closest?.('[data-ow]');
    if (!b) return;
    e.stopPropagation();
    const [kind, id] = b.dataset.ow.split(':');
    const panel = b.closest('.bw-panel');
    const back = panel ? [...panel.querySelectorAll('.tabs button')].pop() : null;
    back?.click();
    world.startFromComputer(kind, id);
  };
  if (typeof document !== 'undefined') document.addEventListener('click', onClick, true);
  return () => { for (const off of offs) off(); if (typeof document !== 'undefined') document.removeEventListener('click', onClick, true); };
}
