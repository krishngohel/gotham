// The Riddler on the Gazette roof (Night Three): a PUZZLE, not a brawl. He stands at the back of
// his rooftop "studio" behind a hard-light shield and asks three riddles live on the Gazette's
// screens. Each riddle has answer panels on the roof floor; a panel only shows its word once it is
// scanned (detective vision, a moment up close), and an answer is given by standing on the panel.
//   - a wrong answer: a squad of his question-mark crew (composeWave) and 15 s off the clock;
//   - the clock running out: the roof shocks every hero standing on it, more crew, a fresh clock;
//   - his question-mark drone zaps someone every few seconds (red tell, dodge it), the kiter first;
//   - co-op: an answer only counts while the other hero holds the LOCK plate in the middle, so
//     both players matter (one reads, one holds);
//   - the third right answer drops the shield: one window to put him down (five strikes; a missed
//     window closes and reopens after another zap).
// Difficulty: the clock, the tells and the crew budget scale by tier; the riddles and the number
// of answers never do.
import { makeVillainBoss } from './brawler.js';
import { shotLands } from '../actor.js';
import { createMarkers } from '../../story/markers.js';

const RIDDLES = [
  {
    text: 'I have hands but never clap, a face but never smile, and I run all night without leaving the wall. What am I?',
    panels: [['A', 'A CLOCK'], ['B', 'A MIRROR'], ['C', 'A MAP']], answer: 'A',
  },
  {
    text: 'The more of me you take, the more of me you leave behind. Every rooftop in this city has a set of yours. What am I?',
    panels: [['A', 'SECRETS'], ['B', 'FOOTSTEPS'], ['C', 'SHADOWS'], ['D', 'DEBTS']], answer: 'B',
  },
  {
    text: 'I am always in front of you and never seen. Gotham keeps promising me to its children. What am I?',
    panels: [['A', 'DARKNESS'], ['B', 'THE BAT'], ['C', 'A DEBT'], ['D', 'TOMORROW']], answer: 'D',
  },
];
const SPOTS = { A: { x: -10, z: -500 }, B: { x: 12, z: -500 }, C: { x: -10, z: -520 }, D: { x: 12, z: -520 } };
const LOCK = { x: 2, z: -508 };
const ROOF_Y = 48;

const LINES = {
  guard: ['Hard light, Detective. You can not punch a concept.', 'Touching the talent is against the rules!', 'Answers, not fists. This is a quiz show.'],
  right: ['Lucky guess. Statistically, absurdly lucky.', 'Fine. Fine! Next question.', 'You solved it? I am checking the maths.'],
  wrong: ['Wrong! Oh, I have been rehearsing that all week.', 'Wrong, and on live television. Crew, a consolation prize!', 'Incorrect. Even the pigeons got that one.'],
  timeout: 'Tick, tock. That is not a riddle, that is your floor. See? I am helping.',
  zap: ['Pop quiz!', 'Eyes on the panels, not on me.', 'Hold still, I am taking attendance.'],
  final: 'No. No! That answer was not on the card! Crew? CREW?',
};

export const riddlerDef = makeVillainBoss({
  id: 'riddler', name: 'THE RIDDLER', villain: 'riddler', model: 'puzzler', gang: 'riddler', act: 2,
  site: 'n3RiddlerArena', start: 'n3RiddlerStart', arena: { x: 2, y: ROOF_Y, z: -523, r: 3 },
  colors: ['#2f8a3a', '#7dff4a'],
  intro: 'riddlerIntro', outro: 'riddlerOutro',
  lines: { guard: LINES.guard },
  targeting: { leash: 16, kiteT: 4, swapEvery: 7 },
  phases: [{ id: 'q1', name: 'Question one' }, { id: 'q2', name: 'Question two' }, { id: 'q3', name: 'The final question' }],
  // [story2] The night simulator's player knows the answers (it read the riddle): scan every panel
  // with detective vision, stand on the answer, then strike while the shield is down.
  sim(b) {
    if (b.e.vulnerable > 0) return { goTo: b.actor.pos, stop: 1.8, action: 'punch', detective: false };
    const ps = b.data.panels ?? [];
    const un = ps.find((p) => !p.scanned);
    if (un) return { goTo: un.at, stop: 0.7, detective: true };
    const ans = ps.find((p) => p.id === RIDDLES[b.phase]?.answer);
    if (ans && b.data.answered !== ans.id) return { goTo: ans.at, stop: 0.4, detective: false };
    return null;
  },
  hazards: (b) => ({ clock: Math.round((b.data.clock ?? 0) * 10) / 10, scanned: (b.data.panels ?? []).map((p) => p.scanned), answered: b.data.answered ?? null }),
  setup(ctx, b) {
    b.data.markers = createMarkers(b.deps.scene);
    b.e.onWindowMissed = () => { b.data.reopenT = 6; b.say('Saved by the bell! Mine, I mean.', 2); };
  },
  phase: {
    q1: puzzlePhase(0),
    q2: puzzlePhase(1),
    q3: puzzlePhase(2),
  },
});

const ui = () => (typeof window !== 'undefined' ? window.__game?.flow?.story?.ui : null);
const detective = () => (typeof window !== 'undefined' ? !!window.__game?.state?.detectiveOn : false);

function puzzlePhase(i) {
  return {
    enter(b) { startRiddle(b, i); },
    idle(dt, b) { b.actor.tick(dt, null, b.target); riddleTick(dt, b, i); },
    update(dt, b) { riddleTick(dt, b, i); },
    windowClosed(b) { if (i === 2) b.win(); },
    exit(b) { clearPanels(b); ui()?.timer(null); },
  };
}

function startRiddle(b, i) {
  const r = RIDDLES[i];
  clearPanels(b);
  const M = b.data.markers;
  b.data.panels = r.panels.map(([id, label]) => {
    const at = { x: SPOTS[id].x, y: ROOF_Y, z: SPOTS[id].z };
    return { id, label, at, scanned: false, scanT: 0, mark: M.place('plate', at, { color: 0x7dff4a }) };
  });
  b.data.lock = b.players > 1 ? { at: { x: LOCK.x, y: ROOF_Y, z: LOCK.z }, mark: M.place('plate', { x: LOCK.x, y: ROOF_Y, z: LOCK.z }, { color: 0xf08a24 }) } : null;
  b.data.clock = 75 * b.tier.window;
  b.data.zapT = 5;
  b.data.holdT = 0;
  b.data.solved = false;
  b.data.reopenT = 0;
  b.data.hinted = false;
  b.data.answered = null;
  b.inPhase = 0;
  b.say(i === 2 ? 'Final question, for the grand prize: your dignity.' : i === 1 ? 'Question two! Do keep up.' : 'Welcome to Riddle Me Live! Our contestant tonight: a man in a bat costume.', 3);
  b.deps.hud.card?.(`RIDDLE ${i + 1} OF 3`, `${r.text}  Scan the panels on the roof to read them, then stand on your answer.`, 12000);
  if (b.data.lock && i === 0) setTimeout(() => b.deps.hud.card?.('TWO PLAYERS', 'An answer only counts while your partner holds the orange LOCK plate in the middle.', 7000), 12500);
  b.deps.combat.setEnemies(b.deps.combat.enemies.filter((x) => x !== b.e));
}

function riddleTick(dt, b, i) {
  const { actor } = b;
  b.data.markers.update(dt);
  if (b.data.solved) {
    // The last answer dropped his shield: he is on the combat list and open.
    if (b.data.reopenT > 0) { b.data.reopenT -= dt; zap(dt, b); if (b.data.reopenT <= 0) actor.open(6 * b.tier.window); }
    else if (b.e.state !== 'open' && b.e.state !== 'knocked' && b.e.vulnerable <= 0) actor.ch.animator.play('Idle_Loop', { fade: 0.3 });
    return;
  }
  actor.face(b.target?.pos, 4, dt);
  if (b.e.state !== 'aim') actor.ch.animator.play('Idle_FoldArms_Loop', { fade: 0.3 });
  // The clock.
  b.data.clock -= dt;
  ui()?.timer(b.data.clock);
  if (b.data.clock <= 0) {
    b.say(LINES.timeout, 3);
    for (const h of b.heroes) if (Math.abs(h.pos.y - ROOF_Y) < 3) b.ctx.hurt(h, 'shock', b.e);
    crew(b, 3, 'riddlerTimeout');
    b.data.clock = 60 * b.tier.window;
  }
  zap(dt, b);
  // Scanning and answering.
  const heroes = b.heroes;
  let standing = null;
  for (const p of b.data.panels) {
    const on = heroes.find((h) => Math.hypot(h.pos.x - p.at.x, h.pos.z - p.at.z) < 1.9 && Math.abs(h.pos.y - ROOF_Y) < 1.6);
    const near = heroes.some((h) => Math.hypot(h.pos.x - p.at.x, h.pos.z - p.at.z) < 3);
    if (!p.scanned && near && detective()) {
      p.scanT += dt;
      if (p.scanT > 0.6) {
        p.scanned = true;
        b.data.markers.color(p.mark, 'scan');
        b.data.markers.flash(p.mark);
        b.deps.hud.card?.(`PANEL ${p.id}`, p.label, 3500);
        b.deps.events.emit('caseClue', { boss: 'riddler', panel: p.id });
      }
    }
    if (on) standing = p;
  }
  const lockHeld = !b.data.lock || heroes.some((h) => Math.hypot(h.pos.x - b.data.lock.at.x, h.pos.z - b.data.lock.at.z) < 1.9 && Math.abs(h.pos.y - ROOF_Y) < 1.6);
  if (standing && !standing.scanned) {
    if (!b.data.hinted) { b.data.hinted = true; b.deps.hud.card?.('SCAN IT FIRST', 'Detective vision, up close: the panel shows its word. Then stand on your answer.', 5000); }
    b.data.holdT = 0;
    return;
  }
  // An answer counts once per visit: step off the panel to answer again.
  if (b.data.answered && b.data.answered !== standing) b.data.answered = null;
  if (!standing || !lockHeld || b.data.answered === standing) { b.data.holdT = 0; b.data.holding = null; return; }
  if (b.data.holding !== standing) { b.data.holding = standing; b.data.holdT = 0; }
  b.data.holdT += dt;
  if (b.data.holdT < 1.2) return;
  b.data.holdT = 0;
  b.data.holding = null;
  b.data.answered = standing;
  if (standing.id === RIDDLES[i].answer) {
    b.data.markers.color(standing.mark, 'plateLit');
    b.deps.events.emit('caseSolved', { boss: 'riddler', riddle: i });
    b.inPhase = 1;
    if (i < 2) { b.say(b.actor.pick(LINES.right), 2.5); b.next(); return; }
    // The shield drops.
    b.data.solved = true;
    ui()?.timer(null);
    clearPanels(b);
    b.say(LINES.final, 3);
    const C = b.deps.combat;
    if (!C.enemies.includes(b.e)) C.setEnemies([...C.enemies, b.e]);
    actor.open(6 * b.tier.window);
  } else {
    b.say(b.actor.pick(LINES.wrong), 2.5);
    b.data.markers.color(standing.mark, 'plateWrong');
    b.data.clock = Math.max(10, b.data.clock - 15);
    b.deps.events.emit('puzzleWrong', { boss: 'riddler', riddle: i });
    crew(b, 3, 'riddlerCrew');
    setTimeout(() => { if (standing.mark && !b.data.solved) b.data.markers.color(standing.mark, 'scan'); }, 900);
  }
}

// His crew, only while the encounter runner is free (one squad at a time).
function crew(b, budget, id) {
  if (b.deps.encounters?.id) return;
  b.ctx.adds(budget, { at: 'n3RiddlerArena', ring: 9, id });
}

function zap(dt, b) {
  if (b.e.state === 'aim') return;
  b.data.zapT -= dt;
  if (b.data.zapT > 0) return;
  b.data.zapT = 6.5 + b.rng.next() * 2;
  const h = b.punish ?? b.target;
  if (!h) return;
  b.say(b.actor.pick(LINES.zap), 1.5);
  b.actor.aim(h, {
    windup: 1.1 * b.tier.tell, clip: 'Idle_Rail_Call',
    fire: (hero) => { if (shotLands(b.deps.collision, b.actor.pos, hero)) b.ctx.hurt(hero, 'shock', b.e); b.deps.events.emit('zap', { pos: hero.pos }); },
  });
}

function clearPanels(b) {
  for (const p of b.data.panels ?? []) b.data.markers.release(p.mark);
  if (b.data.lock) b.data.markers.release(b.data.lock.mark);
  b.data.panels = [];
  b.data.lock = null;
}
