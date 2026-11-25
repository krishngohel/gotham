// Bruce-day scenes as data (workstream K; research doc 7.3's collision scenarios, original writing).
// The interpreter is ./sceneMachine.js (node types documented there); ./days.js puts them on the
// campaign's Bruce-day slots. Speakers are cast ids, 'bruce', 'alfred' or 'narrator'. Names are data.
//
// Six scenes: the gala (1), the 9 a.m. vote (2 + 15), the clinic (3), the press conference with
// the knuckles (4), the detective at the door (11, a stealth walk through your own house) and the
// R&D hearing (7, a gadget choice). Each has a stay-or-slip-away decision under time pressure,
// Alfred's cover, and endings that feed the meters and the next night's start.

const L = (s, t) => ({ s, t });

export const CAST = Object.freeze({
  reporter: { name: 'Nadia Kerr', look: 'reporter', role: 'Gotham Gazette' },
  love: { name: 'Mara Quell', look: 'socialite', role: 'art restorer' },
  councillor: { name: 'Councillor Pryce', look: 'mayor', role: 'city council' },
  stone: { name: 'Garrick Stone', look: 'boardMember', role: 'Wayne Enterprises board' },
  lucius: { name: 'Lucius', look: 'engineer', role: 'Applied Sciences' },
  nurse: { name: 'Ines Barro', look: 'doctor', role: 'nurse' },
  patient: { name: 'Tommy Barro', look: 'civilian', role: 'patient' },
  admin: { name: 'Mrs. Odunsi', look: 'boardMember', role: 'clinic administrator' },
  detective: { name: 'Det. Renata Ostrow', look: 'detective', role: 'GCPD' },
  press: { name: 'The press', look: 'photographer', role: 'press pool' },
  gordon: { name: 'Commissioner Gordon', look: 'commissioner', role: 'GCPD' },
});
export const SPEAKERS = Object.freeze(Object.keys(CAST));

// ------------------------------------------------------------------------------------------------
const gala = {
  id: 'gala', title: 'The Foundation Gala', commitment: 'gala',
  blurb: 'Two hundred guests, a toast at nine, and a dome to pay for. The sky over the lake is clear. For now.',
  venue: { pocket: 'wayneManor', room: 'ballroom' }, outfit: 'tux', hour: 20.25,
  cast: [
    { id: 'love', at: 'galaWindow' }, { id: 'reporter', at: 'galaBar' }, { id: 'councillor', at: 'galaFloor' },
  ],
  start: 'arrive',
  nodes: {
    arrive: { type: 'line', lines: [
      L('alfred', 'Two hundred guests, sir, and every one of them convinced you planned this.'),
      L('bruce', 'I signed the cheque. That counts as planning.'),
      L('alfred', 'The toast is at nine. The dome needs three million. Do smile as though you mean it.'),
    ], next: 'mingle' },
    mingle: { type: 'goto', prompt: 'Find Mara by the tall windows', target: { id: 'love', station: 'galaWindow' }, next: 'mara' },
    mara: { type: 'choice', who: 'love', prompt: 'Mara Quell, a glass she has not touched: "You actually came to your own party."', options: [
      { id: 'charm', tag: 'charm', text: 'I would have bet the dome against it.', effects: { threads: { love: 0.5 }, standing: 1 },
        say: [L('love', 'You would have lost. I have seen your accountant\'s face.')], next: 'reporterCheck' },
      { id: 'honest', tag: 'honest', text: 'I nearly didn\'t. It has been a long week.', effects: { threads: { love: 0.8 }, suspicion: { reporter: 2 } },
        say: [L('love', 'You say that every week, Bruce. I am starting to believe it.')], next: 'reporterCheck' },
      { id: 'act', tag: 'act', text: 'Champagne? I ordered a fountain of it. It\'s shaped like me.', effects: { standing: 2, threads: { love: -0.3 }, suspicion: { reporter: -3 } },
        say: [L('love', 'Of course you did.')], next: 'reporterCheck' },
    ] },
    reporterCheck: { type: 'branch', cases: [{ if: { injured: true }, next: 'reporterInjured' }], else: 'reporterPlain' },
    reporterInjured: { type: 'choice', who: 'reporter', prompt: 'Nadia Kerr, Gotham Gazette: "That is quite a bruise for black tie, Mr. Wayne."', options: [
      { id: 'sailing', tag: 'deflect', excuse: 'sailing', text: 'Sailing. The boom and I had a disagreement.', next: 'toast' },
      { id: 'polo', tag: 'deflect', excuse: 'polo', text: 'Polo. The horse won on points.', next: 'toast' },
      { id: 'act', tag: 'act', text: 'Would you believe a jealous husband? Several?', effects: { standing: -2, suspicion: { reporter: -6 }, threads: { love: -0.4 } }, next: 'toast' },
      { id: 'sharp', tag: 'sharp', text: 'Ask your sports desk. They took the photo.', effects: { suspicion: { reporter: -4 } }, next: 'toast' },
    ] },
    reporterPlain: { type: 'choice', who: 'reporter', prompt: 'Nadia Kerr: "The Foundation\'s money keeps going to the Narrows. Some people call it guilt."', options: [
      { id: 'honest', tag: 'honest', text: 'Some people. I call it where the need is.', effects: { standing: 3, threads: { reporter: 0.5 } }, next: 'toast' },
      { id: 'deflect', tag: 'deflect', text: 'Some people say a lot after the third glass.', next: 'toast' },
      { id: 'act', tag: 'act', text: 'Guilt? I just like the view from the bridges.', effects: { standing: -1, suspicion: { reporter: -3 } }, next: 'toast' },
    ] },
    toast: { type: 'event', event: 'toast', lines: [
      L('narrator', 'A spoon on crystal. Two hundred faces turn.'),
      L('bruce', 'Friends. Donors. People who came for the shrimp. Thank you for being here tonight.'),
    ], next: 'signal' },
    signal: { type: 'event', event: 'batsignal', lines: [
      L('narrator', 'Through the tall windows, over the lake, the clouds take a shape you know.'),
      L('alfred', '(quietly) Sir. The window.'),
    ], next: 'decide' },
    decide: { type: 'pressure', seconds: 30, timeout: 'stay', prompt: 'The toast, or the signal?',
      stay: { text: 'Finish the toast', effects: { standing: 6, city: -6 },
        say: [L('bruce', 'So raise a glass to the dome. May it show us something bigger than ourselves.')], next: 'stayEnd' },
      slip: { text: 'Slip away', effects: { standing: -5, city: 3 },
        say: [L('bruce', 'Excuse me. Nature and the wine cellar are both calling.')], next: 'slipRoute' },
      cover: { cost: 15, seconds: 20, say: [L('alfred', 'Ladies and gentlemen, while Mr. Wayne finds his notes, a word about the canapes.')] },
    },
    slipRoute: { type: 'goto', prompt: 'Get to the service door before anyone notices', target: { id: 'service', station: 'galaService' }, seconds: 40, next: 'slipClean', late: 'slipSeen' },
    slipSeen: { type: 'line', lines: [
      L('reporter', 'Leaving your own party, Mr. Wayne? Through the kitchen?'),
      L('bruce', 'The kitchen is where the real party is.'),
    ], next: 'slipSeenEnd' },
    slipClean: { type: 'branch', cases: [{ if: { thread: { alfred: 2 } }, next: 'slipCovered' }], else: 'slipCold' },
    slipCovered: { type: 'end', outcome: 'slip', title: 'Gone before the applause',
      summary: 'Alfred gave the toast. The pledge was announced without you, and the night started early.',
      lines: [L('alfred', 'I told them you were overcome by your own generosity. They believed me, which is the worrying part.')],
      effects: { patience: -5 }, night: { flags: { earlyStart: true } } },
    slipCold: { type: 'end', outcome: 'slip', title: 'An empty chair at the top table',
      summary: 'Nobody gave the toast. The dome is short of its pledge, and Mara noticed.',
      lines: [L('narrator', 'Behind you the band plays on to a room that is asking where the host went.')],
      effects: { standing: -3, threads: { love: -0.5 } }, night: { flags: { earlyStart: true } } },
    slipSeenEnd: { type: 'end', outcome: 'slip', title: 'Seen leaving',
      summary: 'You got out, but the Gazette watched you go, and it will want to know where.',
      effects: { suspicion: { reporter: 8 } }, night: { flags: { earlyStart: true } } },
    stayEnd: { type: 'end', outcome: 'stay', title: 'The toast, finished',
      summary: 'The dome will be built. Across the lake, something was left to grow for an hour.',
      lines: [L('alfred', 'The pledge is announced and the dome is paid for. And somewhere across the lake, something has been allowed to grow.')],
      effects: { threads: { love: 0.5 } }, night: { flags: { escalated: true } } },
  },
};

// ------------------------------------------------------------------------------------------------
const boardVote = {
  id: 'boardVote', title: 'The 9 a.m. Vote', commitment: 'board',
  blurb: 'The board votes on selling Narrows land to a company eleven days old. Last night ended at 05:10.',
  venue: { pocket: 'wayneTower', room: 'boardroom' }, outfit: 'suit', hour: 9,
  cast: [{ id: 'stone', at: 'boardHead' }, { id: 'lucius', at: 'boardSide' }],
  start: 'open',
  nodes: {
    open: { type: 'branch', cases: [{ if: { fatigueAbove: 75 }, next: 'dozing' }], else: 'arrive' },
    dozing: { type: 'line', lines: [
      L('narrator', 'The projector hums. The room is very warm. Somebody says "synergy" and means it.'),
      L('lucius', '(a polite elbow) Bruce. Slide forty.'),
      L('bruce', 'Forty. Yes. Riveting. Go on.'),
    ], next: 'arrive' },
    arrive: { type: 'line', lines: [
      L('stone', 'The Narrows parcel. Arkwright Holdings offers twice the valuation. I move that we sell.'),
      L('lucius', 'Arkwright Holdings was incorporated eleven days ago.'),
      L('stone', 'Young companies are the future, Lucius. Try to keep up.'),
    ], next: 'papers' },
    papers: { type: 'inspect', prompt: 'Read the papers on the table (look closely)', need: 1, seconds: 60, next: 'argue', late: 'argue', spots: [
      { id: 'survey', label: 'the land survey', clue: 'The surveyor\'s stamp is dated a Sunday. The city survey office does not open on Sundays.', effects: { flags: { 'lead.forgedSurvey': true } } },
      { id: 'letterhead', label: 'Arkwright\'s letterhead', clue: 'Registered to a laundromat on Park Row. I closed down a smuggling ring in its back room last spring.', effects: { flags: { 'lead.arkwright': true } } },
      { id: 'cufflinks', label: 'Stone\'s cufflinks', clue: 'Little silver birds in top hats. Either a joke, or a gift.' },
    ] },
    argue: { type: 'choice', who: 'board', prompt: 'Stone calls the vote.', options: [
      { id: 'survey', tag: 'sharp', req: { flag: 'lead.forgedSurvey' }, text: 'Before we vote: this survey is stamped on a Sunday. Ask Arkwright who worked overtime.',
        effects: { standing: 8, threads: { lucius: 0.6 }, flags: { voteWon: true } }, next: 'phone' },
      { id: 'lucius', tag: 'deflect', req: { thread: { lucius: 3 } }, text: 'Lucius has read the papers. Lucius, tell them.',
        effects: { threads: { lucius: 0.3 }, flags: { voteWon: true } }, next: 'phone' },
      { id: 'honest', tag: 'honest', text: 'I am not selling the Narrows to a company younger than my socks.', effects: { standing: 2, flags: { argued: true } }, next: 'phone' },
      { id: 'act', tag: 'act', text: 'Sell it. Buy me a yacht with the difference.', effects: { standing: -6, suspicion: { reporter: -4 }, flags: { voteLost: true } }, next: 'phone' },
    ] },
    phone: { type: 'event', event: 'phone', lines: [
      L('narrator', 'Your phone buzzes against the table. One line from Alfred: "The orchids need watering."'),
      L('bruce', '(to himself) The orchids. Something at the docks.'),
    ], next: 'decide' },
    decide: { type: 'pressure', seconds: 25, timeout: 'stay', prompt: 'Stay for the count, or go?',
      stay: { text: 'Stay for the count', effects: { city: -5, standing: 3 }, next: 'count' },
      slip: { text: 'Leave mid-vote', effects: { standing: -6, city: 4, threads: { lucius: -0.3 } },
        say: [L('bruce', 'Gentlemen. My cardiologist. You understand.')], next: 'slipEnd' },
      cover: { cost: 12, seconds: 15, say: [L('alfred', '(on the phone) I shall ring back in four minutes as your cardiologist. Do try to look alarmed.')] },
    },
    count: { type: 'branch', cases: [
      { if: { flag: 'voteWon' }, next: 'stayWon' },
      { if: { flag: 'argued', standingAbove: 55 }, next: 'stayWon' },
    ], else: 'stayLost' },
    stayWon: { type: 'end', outcome: 'stay', title: 'Nine votes to four',
      summary: 'The Narrows stay with the Foundation. Arkwright\'s lawyers are about to have a bad week, and tonight you know where to look.',
      lines: [L('lucius', 'Nine to four. The Narrows stay ours, and Arkwright\'s lawyers have my sympathy.')],
      effects: { standing: 4, open: ['narrowsLand'] }, night: { flags: { 'lead.arkwright': true } } },
    stayLost: { type: 'end', outcome: 'stay', title: 'Carried, by one',
      summary: 'The land goes to Arkwright. You were in the room and it still went.',
      lines: [L('stone', 'Carried. Thank you all. And thank you, Bruce, for your... attendance.')],
      effects: { standing: -3, close: ['narrowsLand'], flags: { arkwrightLand: true } } },
    slipEnd: { type: 'end', outcome: 'slip', title: 'The empty chair',
      summary: 'Stone won the count by one. Lucius froze the prototype budget before Stone could spend it.',
      lines: [L('lucius', '(a message, later) You missed the count. Stone won by one. I froze the prototype budget before he could touch it.')],
      effects: { close: ['narrowsLand'], freeze: 'prototype', flags: { arkwrightLand: true } }, night: { flags: { earlyStart: true } } },
  },
};

// ------------------------------------------------------------------------------------------------
const clinic = {
  id: 'clinic', title: 'Same Block, Different Coat', commitment: 'charity',
  blurb: 'Bruce opens the Foundation\'s clinic in the Narrows. The man in the end bed met Batman two nights ago.',
  venue: { pocket: 'wayneTower', room: 'clinic' }, outfit: 'suit', hour: 15,
  cast: [{ id: 'admin', at: 'clinicDoor' }, { id: 'nurse', at: 'clinicBed' }, { id: 'patient', at: 'clinicBedPatient' }],
  start: 'arrive',
  nodes: {
    arrive: { type: 'line', lines: [
      L('admin', 'Mr. Wayne. The new wing is, well, a room, so far. But it is a clean room.'),
      L('bruce', 'Every wing starts as a room.'),
    ], next: 'walk' },
    walk: { type: 'goto', prompt: 'Walk the ward to the end bed', target: { id: 'bed', station: 'clinicBed' }, next: 'meet' },
    meet: { type: 'branch', cases: [{ if: { finishersAbove: 6 }, next: 'meetHard' }], else: 'meetSoft' },
    meetHard: { type: 'line', lines: [
      L('nurse', 'My brother. His jaw is wired in two places. He says a bat did it. Everybody laughs.'),
      L('patient', 'Mmf.'),
    ], next: 'talk' },
    meetSoft: { type: 'line', lines: [
      L('nurse', 'My brother. Two ribs and his pride. He says the Bat could have done worse and didn\'t.'),
      L('patient', 'Didn\'t have to sit on me, though.'),
    ], next: 'talk' },
    talk: { type: 'choice', who: 'nurse', prompt: 'Ines Barro watches you over the clipboard.', options: [
      { id: 'honest', tag: 'honest', text: 'Whatever he did, he didn\'t deserve worse than this.', effects: { city: 2, flags: { 'lead.barroTrust': true } }, next: 'lead' },
      { id: 'charm', tag: 'charm', text: 'The Foundation covers all of it. And a better pillow.', effects: { standing: 3 }, next: 'lead' },
      { id: 'sharp', tag: 'sharp', text: 'Who was he driving for? Someone who hasn\'t visited.', effects: { flags: { 'lead.barroBoss': true } }, next: 'lead' },
      { id: 'act', tag: 'act', text: 'A bat! Ha. I\'m terrified of the things.', effects: { standing: 1, suspicion: { reporter: -2 } }, next: 'lead' },
    ] },
    lead: { type: 'branch', cases: [
      { if: { flag: 'lead.barroTrust' }, next: 'leadGiven' },
      { if: { flag: 'lead.barroBoss', finishersAbove: -1 }, next: 'leadGiven' },
    ], else: 'leadCold' },
    leadGiven: { type: 'line', lines: [
      L('nurse', '(quietly) He drove for a man who rents warehouse space at the Yards. Pier twelve. He is scared of him, not of bats.'),
    ], next: 'scanner' },
    leadCold: { type: 'line', lines: [L('nurse', 'Thank you for the room, Mr. Wayne.')], next: 'scanner' },
    scanner: { type: 'event', event: 'scanner', lines: [
      L('narrator', 'The police scanner at the nurses\' station crackles: shots fired, the Narrows market, two streets away.'),
      L('alfred', '(earpiece) Four minutes on foot, sir. Considerably less by rooftop.'),
    ], next: 'decide' },
    decide: { type: 'pressure', seconds: 25, timeout: 'stay', prompt: 'Finish the visit, or excuse yourself?',
      stay: { text: 'Finish the visit', effects: { standing: 4, city: -4 }, say: [L('bruce', 'Show me the children\'s ward.')], next: 'stayEnd' },
      slip: { text: 'Excuse yourself', effects: { standing: -4, city: 5 }, say: [L('bruce', 'Forgive me. My car has been towed. Again.')], next: 'slipEnd' },
      cover: { cost: 10, seconds: 15, say: [L('alfred', 'I shall ring the administrator about a second donation. She will be on the phone for some time.')] },
    },
    stayEnd: { type: 'end', outcome: 'stay', title: 'The children\'s ward',
      summary: 'The shots at the market stopped on their own. By morning there is a name in the paper, and it is a GCPD officer\'s.',
      lines: [L('narrator', 'You cut a ribbon. You hold a baby nobody introduces. Somewhere two streets away, the sirens arrive late.')],
      effects: { flags: { officerHurt: true } } },
    slipEnd: { type: 'end', outcome: 'slip', title: 'Two streets away',
      summary: 'A man with a pistol found out how quiet a rooftop can be. The clinic noticed the empty chair at the ribbon.',
      lines: [L('narrator', 'Two streets away, a man with a pistol finds out how quiet a rooftop can be.')],
      effects: { city: 2 }, night: { flags: { earlyStart: true } } },
  },
};

// ------------------------------------------------------------------------------------------------
const pressConference = {
  id: 'pressConference', title: 'Knuckles', commitment: 'press',
  blurb: 'Twelve cameras, one podium, and a reporter who has started keeping a list of your sports.',
  venue: { pocket: 'wayneTower', room: 'lobby' }, outfit: 'suit', hour: 11,
  cast: [{ id: 'reporter', at: 'pressFront' }, { id: 'press', at: 'pressBack' }],
  start: 'intro',
  nodes: {
    intro: { type: 'branch', cases: [{ if: { injured: true }, next: 'introInjured' }], else: 'introClean' },
    introInjured: { type: 'line', lines: [L('alfred', '(earpiece) Your lip has opened again, sir. Keep the left side away from the cameras.')], next: 'podium' },
    introClean: { type: 'line', lines: [L('alfred', '(earpiece) Twelve cameras, sir. Try to look like a man who sleeps.')], next: 'podium' },
    podium: { type: 'goto', prompt: 'Take the podium', target: { id: 'podium', station: 'pressPodium' }, next: 'statement' },
    statement: { type: 'choice', prompt: 'Your statement on the Narrows housing fund.', options: [
      { id: 'honest', tag: 'honest', text: 'We are building four hundred homes in the Narrows. Not a press release. Homes.', effects: { standing: 5 }, next: 'questions' },
      { id: 'charm', tag: 'charm', text: 'I\'m told this is the part where I\'m serious. I\'ve been practising.', effects: { standing: 2, threads: { reporter: 0.3 } }, next: 'questions' },
      { id: 'act', tag: 'act', text: 'Housing is so important. I have six of them.', effects: { standing: -3, suspicion: { reporter: -5 } }, next: 'questions' },
    ] },
    questions: { type: 'branch', cases: [{ if: { injured: true }, next: 'knuckles' }], else: 'whereabouts' },
    knuckles: { type: 'choice', who: 'reporter', prompt: 'Nadia Kerr: "Your knuckles, Mr. Wayne. Again. Is there a sport the public should know about?"', options: [
      { id: 'sailing', tag: 'deflect', excuse: 'sailing', text: 'Sailing. Rope burn.', next: 'whereabouts' },
      { id: 'polo', tag: 'deflect', excuse: 'polo', text: 'Polo. The mallet slipped.', next: 'whereabouts' },
      { id: 'cat', tag: 'charm', excuse: 'cat', text: 'My cat. She disapproves of my lifestyle.', next: 'whereabouts' },
      { id: 'cooking', tag: 'honest', excuse: 'cooking', text: 'I\'ve taken up cooking. The onions fought back.', next: 'whereabouts' },
      { id: 'act', tag: 'act', text: 'Would you believe I punched a cathedral?', effects: { suspicion: { reporter: -4 }, standing: -2 }, next: 'whereabouts' },
    ] },
    whereabouts: { type: 'choice', who: 'reporter', prompt: 'Nadia Kerr: "Where were you at three a.m. on Tuesday? A Wayne car was seen near the docks."', options: [
      { id: 'act', tag: 'act', text: 'Three a.m.? Asleep on a yacht. I own several. Some of them are lost.', effects: { suspicion: { reporter: -4 }, standing: -2 }, next: 'alarm' },
      { id: 'deflect', tag: 'deflect', text: 'My cars go lots of places. Most of them come back.', effects: { suspicion: { reporter: 3 } }, next: 'alarm' },
      { id: 'honest', tag: 'honest', req: { thread: { alfred: 3 } }, text: 'Working late. Ask my butler. He disapproved.', effects: { suspicion: { reporter: -2 }, patience: -3 }, next: 'alarm' },
      { id: 'sharp', tag: 'sharp', text: 'On Tuesday the GCPD closed the docks. It was on your own front page.', effects: { suspicion: { reporter: -6 } }, next: 'alarm' },
    ] },
    alarm: { type: 'event', event: 'phone', lines: [L('narrator', 'Your watch buzzes twice against your wrist: the cave\'s silent alarm.')], next: 'decide' },
    decide: { type: 'pressure', seconds: 20, timeout: 'stay', prompt: 'One more question, or the side door?',
      stay: { text: 'Take the last question', effects: { standing: 4, city: -3 }, next: 'stayEnd' },
      slip: { text: 'Wrap it up', effects: { standing: -3, suspicion: { reporter: 4 }, city: 3 }, say: [L('bruce', 'That is all the time we have. I have a squash game. Or a squash. One of those.')], next: 'slipEnd' },
      cover: { cost: 10, seconds: 15, say: [L('alfred', 'I have told the building manager the fire alarm is due a test. You have one minute.')] },
    },
    stayEnd: { type: 'end', outcome: 'stay', title: 'The last question',
      summary: 'The housing fund leads the evening news. The cave alarm logged a break-in at a WayneTech depot that nobody stopped.',
      lines: [L('reporter', 'Last one: do you ever sleep, Mr. Wayne?'), L('bruce', 'Professionally? No.')],
      effects: { threads: { reporter: 0.4 } }, night: { flags: { 'depot.robbed': true } } },
    slipEnd: { type: 'end', outcome: 'slip', title: 'The side door',
      summary: 'You were out before the cameras lowered. The depot thieves had a worse afternoon than you did.',
      effects: { city: 2 }, night: { flags: { earlyStart: true } } },
  },
};

// ------------------------------------------------------------------------------------------------
const detectiveCalls = {
  id: 'detectiveCalls', title: 'The Detective at the Door', commitment: 'detective',
  blurb: 'Det. Ostrow has a piece of Wayne alloy from a gutter on Fourth Street, and the cave alarm has opinions.',
  venue: { pocket: 'wayneManor', room: 'drawingRoom' }, outfit: 'casual', hour: 19,
  cast: [{ id: 'detective', at: 'drawingGuest' }],
  start: 'arrive',
  nodes: {
    arrive: { type: 'line', lines: [
      L('alfred', 'Detective Ostrow, sir. She declined the good chair and the good biscuits, which I am taking personally.'),
      L('detective', 'Mr. Wayne. A piece of armour plate turned up in a gutter on Fourth Street. Your company\'s alloy.'),
      L('bruce', 'We make a great deal of alloy.'),
    ], next: 'probe' },
    probe: { type: 'choice', who: 'detective', prompt: 'Ostrow: "Your company sells it to exactly three buyers. One of them is you."', options: [
      { id: 'charm', tag: 'charm', text: 'Then I\'m very easy to find. Tea?', effects: { threads: { detective: 0.3 }, suspicion: { detective: 2 } }, next: 'alarm' },
      { id: 'deflect', tag: 'deflect', text: 'Inventory is Lucius\'s department. He hates it when I ask.', effects: { suspicion: { detective: 3 } }, next: 'alarm' },
      { id: 'honest', tag: 'honest', text: 'Some of our stock goes missing. I\'ve been trying to find out where.', effects: { suspicion: { detective: 6 }, threads: { detective: 0.6 } }, next: 'alarm' },
      { id: 'act', tag: 'act', text: 'Armour? Detective, I bruise if I sneeze.', effects: { suspicion: { detective: -4 }, threads: { detective: -0.3 } }, next: 'alarm' },
    ] },
    alarm: { type: 'event', event: 'caveAlarm', lines: [
      L('narrator', 'Under the floor, faint as a heartbeat: the cave\'s proximity alarm. Ostrow tilts her head.'),
      L('detective', 'Do you hear that?'),
      L('alfred', 'The boiler, madam. It has opinions.'),
    ], next: 'decide' },
    decide: { type: 'pressure', seconds: 20, timeout: 'stay', prompt: 'Sit tight, or slip out and silence it?',
      stay: { text: 'Sit tight', effects: { suspicion: { detective: 8 } }, say: [L('bruce', 'Old house. Everything knocks.')], next: 'stayCheck' },
      slip: { text: 'Excuse yourself', say: [L('bruce', 'Excuse me. I promised to call my tailor back.')], next: 'sneak' },
      cover: { cost: 10, seconds: 20, say: [L('alfred', 'More tea, Detective? I insist. It is a very long pour.')] },
    },
    sneak: { type: 'goto', prompt: 'Reach the grandfather clock in the study and silence the alarm', target: { id: 'clock', station: 'clock' }, seconds: 45, next: 'back', late: 'caught' },
    back: { type: 'goto', prompt: 'Get back to your chair before the tea goes cold', target: { id: 'seat', station: 'drawingSeat' }, seconds: 40, next: 'inTime', late: 'teaCold' },
    inTime: { type: 'end', outcome: 'slip', title: 'Back before the tea cooled',
      summary: 'The alarm is silent and Ostrow has a cup of tea and a feeling. The feeling will keep.',
      lines: [L('detective', 'Your tea is still warm, Mr. Wayne. Funny. Your hands aren\'t.')],
      effects: { suspicion: { detective: 2 }, threads: { detective: 0.4 } } },
    teaCold: { type: 'end', outcome: 'slip', title: 'The tea went cold',
      summary: 'Ostrow waited a long time for a man calling his tailor. There is an unmarked car at the gates tonight.',
      lines: [L('detective', 'Long call. Your tailor must be very thorough.')],
      effects: { suspicion: { detective: 10 } }, night: { flags: { tail: true } } },
    caught: { type: 'end', outcome: 'slip', title: 'This house has a lot of clocks',
      summary: 'Ostrow found you in the study with your hand on a clock that was not chiming. She did not say anything. That was worse.',
      lines: [L('detective', 'This house has a lot of clocks, Mr. Wayne.')],
      effects: { suspicion: { detective: 15 } }, night: { flags: { tail: true } } },
    stayCheck: { type: 'branch', cases: [{ if: { suspicionAbove: { detective: 60 } }, next: 'stayTail' }], else: 'stayEnd' },
    stayEnd: { type: 'end', outcome: 'stay', title: 'The boiler',
      summary: 'Ostrow let herself out. Whatever tripped the alarm had the cave to itself for twenty minutes.',
      lines: [L('detective', 'I\'ll let myself out. Your boiler should see someone.')],
      effects: { city: -3 } },
    stayTail: { type: 'end', outcome: 'stay', title: 'An unmarked car',
      summary: 'Ostrow left without her coat, and came back for it twenty minutes later to look at the hall again.',
      lines: [L('detective', 'I left my coat. And my curiosity. I\'ll be back for one of them.')],
      effects: { city: -3 }, night: { flags: { tail: true } } },
  },
};

// ------------------------------------------------------------------------------------------------
const luciusBriefing = {
  id: 'luciusBriefing', title: 'The R&D Hearing', commitment: 'briefing',
  blurb: 'Two prototypes and one budget. The board wants a reason; Lucius wants one he can say out loud.',
  venue: { pocket: 'wayneTower', room: 'lab' }, outfit: 'suit', hour: 14,
  cast: [{ id: 'lucius', at: 'labBench' }],
  start: 'arrive',
  nodes: {
    arrive: { type: 'line', lines: [
      L('lucius', 'Two prototypes, one budget. The board wants a reason. I want a reason I can say out loud.'),
    ], next: 'look' },
    look: { type: 'inspect', prompt: 'Look over the bench', need: 2, next: 'pick', spots: [
      { id: 'grapple', label: 'the grapple prototype', clue: 'A winch the size of a lunchbox. Twice the reel speed, half the noise.' },
      { id: 'module', label: 'the vehicle module', clue: 'An armour module that bolts onto anything with wheels. Including, it says here, a shopping trolley.' },
      { id: 'notes', label: 'Lucius\'s notebook', clue: 'Page one says "please be careful" four times. Page two is the same.' },
    ] },
    pick: { type: 'choice', prompt: 'Which prototype do you fight for?', options: [
      { id: 'grapple', tag: 'plain', text: 'The grapple.', effects: { flags: { 'rnd.grapple': true } }, next: 'hearing' },
      { id: 'module', tag: 'plain', text: 'The vehicle module.', effects: { flags: { 'rnd.module': true } }, next: 'hearing' },
    ] },
    hearing: { type: 'line', lines: [L('stone', '(speakerphone) Bruce, the board is on the line. Convince us.')], next: 'speech' },
    speech: { type: 'choice', who: 'board', prompt: 'Your pitch.', options: [
      { id: 'sharp', tag: 'sharp', text: 'Every rescue costs less when the rescuers get there faster. The numbers are on page four.', effects: { standing: 4, flags: { speechGood: true } }, next: 'call' },
      { id: 'honest', tag: 'honest', req: { thread: { lucius: 2 } }, text: 'Because people I care about go out at night.', effects: { standing: 2, threads: { lucius: 0.4 }, flags: { speechGood: true } }, next: 'call' },
      { id: 'act', tag: 'act', text: 'Because it\'s shiny?', effects: { standing: -3 }, next: 'call' },
    ] },
    call: { type: 'event', event: 'phone', lines: [L('narrator', 'Alfred, by text: "There is a man on the cathedral roof who appears to be waiting for someone in a cape."')], next: 'decide' },
    decide: { type: 'pressure', seconds: 20, timeout: 'stay', prompt: 'Finish the pitch, or hand it to Lucius?',
      stay: { text: 'Finish the pitch', effects: { standing: 3, city: -3 }, next: 'result' },
      slip: { text: 'Hand it to Lucius', effects: { standing: -2, city: 3 }, say: [L('bruce', 'Lucius knows this better than I do. Lucius?')], next: 'resultLucius' },
      cover: { cost: 8, seconds: 15, say: [L('alfred', '(text) I have asked the cathedral man to hold. He seems patient. For now.')] },
    },
    result: { type: 'branch', cases: [
      { if: { flag: 'speechGood', standingAbove: 45 }, next: 'shipCheck' },
    ], else: 'shelved' },
    resultLucius: { type: 'branch', cases: [{ if: { thread: { lucius: 3 } }, next: 'shipCheck' }], else: 'shelved' },
    shipCheck: { type: 'branch', cases: [{ if: { flag: 'rnd.grapple' }, next: 'shippedGrapple' }], else: 'shippedModule' },
    shippedGrapple: { type: 'end', outcome: 'shipped', title: 'The grapple ships',
      summary: 'Applied Sciences delivers the grapple prototype this week.',
      lines: [L('lucius', 'Approved. I will have it in the cave by tonight. Please be careful. That is the whole manual.')],
      effects: { ship: 'grapplePrototype', freeze: null } },
    shippedModule: { type: 'end', outcome: 'shipped', title: 'The module ships',
      summary: 'Applied Sciences delivers the vehicle armour module this week.',
      lines: [L('lucius', 'Approved. The car gets its new coat tonight. Try not to scratch it on purpose.')],
      effects: { ship: 'vehicleModule', freeze: null } },
    shelved: { type: 'end', outcome: 'shelved', title: 'Shelved',
      summary: 'The board shelved both prototypes until next quarter. Lucius locked them in a crate marked "patience".',
      lines: [L('lucius', 'Shelved. I have put them in a crate marked "patience". I will be in the crate if you need me.')],
      effects: { freeze: 'prototype', threads: { lucius: -0.2 } } },
  },
};

export const SCENES = Object.freeze({ gala, boardVote, clinic, pressConference, detectiveCalls, luciusBriefing });
export const SCENE_IDS = Object.keys(SCENES);
export const sceneById = (id) => SCENES[id] ?? null;
