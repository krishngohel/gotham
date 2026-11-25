// Night Eight, "Hostile Takeover" (Act V, Arkham). The man who paid for the fear, the frost, the
// garden and the fire has spent four nights studying Batman, and tonight he puts it to use. The
// night opens with an emergency board vote at Wayne Tower and False Faces setting a Chinatown block
// alight at the same hour. Then Wolf Point: a gauntlet that switches Batman's tools off one at a
// time (detective vision in the dark of the parking floor, gadgets against shields and snipers on
// the fork, the grapple on the climb), a duel on the roof that is pure combat, and a second choice
// as the night ends: give Detective Ostrow the statement she asked for, or answer the alarm on
// the Arkham causeway. New role this night: the lieutenant (take him out first). Format:
// docs/design/story-format.md.
import { g, v, B, face, recap } from './common.js';
import { W, route } from '../rooms.js';

const SITES = {
  n8Lobby: { x: 0, y: 0, z: -433 },
  n8Stone: { x: 6, y: 0, z: -428 },
  n8LuciusAt: { x: -6, y: 0, z: -428 },
  n8Gate: { x: -332, y: 0, z: -150 },
  n8GateRoof: { x: -332, y: 11.6, z: -150 },
  n8Market: { x: -415, y: 0, z: -120 },
  n8Temple: { x: -415, y: 0.15, z: -172 },
  n8Mahjong: { x: -321, y: 0.15, z: -110 },
  n8Domes: { x: -490, y: 13, z: -182 },
  n8Bath: { x: -490, y: 0.15, z: -104 },
  n8Base: { x: -320, y: 0.15, z: -285 },
  n8BaseEntry: { x: -345, y: 0.15, z: -255 },
  n8Fork: { x: -283, y: 0, z: -298 },
  n8Walk: { x: -269, y: -4.5, z: -200 },
  n8Roof: { x: -334, y: 52, z: -277 },
  n8Dock: { x: 196, y: 1, z: 380 },
  n8MaskArena: { x: 165, y: 2.2, z: 385 },
  n8MaskStart: { x: 165, y: 2.2, z: 378 },
  n8YardIn: { x: 172, y: 2.2, z: 390 },
  n8Gcpd: { x: 0, y: 0, z: 26 },
  n8Causeway: { x: 372, y: 0.5, z: -80 },
};

const ROOMS = {
  baseRoom: {
    id: 'baseRoom', site: 'n8Base', entry: 'n8BaseEntry', radius: 22, gang: 'blackMask',
    lights: [{ x: -326, y: 3.5, z: -278, r: 5, post: true }, { x: -312, y: 3.5, z: -292, r: 4, post: true }],
    cover: [{ x: -322, y: 0.15, z: -280, w: 3, d: 1.4, h: 1.6 }, { x: -314, y: 0.15, z: -286, w: 1.4, d: 3, h: 1.6 }, { x: -328, y: 0.15, z: -292, w: 2, d: 2, h: 1.5 }, { x: -318, y: 0.15, z: -276, w: 2.4, d: 1.2, h: 1.5 }],
    huddle: { x: -320, y: 0.15, z: -285 },
    squad: [
      { type: 'pistol', route: route('pingpong', W(-332, 0.15, -280, 2, Math.PI / 2), W(-308, 0.15, -280, 2, -Math.PI / 2)) },
      { type: 'lieutenant', route: route('pingpong', W(-320, 0.15, -296, 3, 0), W(-320, 0.15, -274, 3, Math.PI)) },
      { type: 'ninja', route: route('loop', W(-328, 0.15, -276), W(-312, 0.15, -276, 1.5, 0), W(-312, 0.15, -294), W(-328, 0.15, -294, 1.5, Math.PI)) },
      { type: 'sniper', route: route('pingpong', W(-306, 0.15, -290, 3, -Math.PI / 2), W(-306, 0.15, -278, 3, -Math.PI / 2)) },
      { type: 'rifle', route: route('pingpong', W(-334, 0.15, -290, 2.5, Math.PI / 2), W(-334, 0.15, -282, 2.5, Math.PI / 2)) },
    ],
  },
};

const FIGHTS = {
  gateFire: { site: 'n8Gate', radius: 15, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 7, ring: 7, lead: 'lieutenant' }, { budget: 10, ring: 8, lead: 'heavy' }] },
  gateBurnt: { site: 'n8Gate', radius: 15, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 6, ring: 7, lead: 'lieutenant' }, { budget: 9, ring: 8, lead: 'heavy' }, { budget: 9, ring: 8, lead: 'medic' }] },
  market: { site: 'n8Market', radius: 13, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 8, ring: 7, lead: 'knife' }] },
  base: { stealth: 'baseRoom' },
  fork: { site: 'n8Fork', radius: 15, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 9, ring: 8, lead: 'shield' }, { budget: 10, ring: 9, lead: 'sniper' }] },
  walk: { site: 'n8Walk', radius: 13, gang: 'blackMask', act: 5, district: 'chinatown', waves: [{ budget: 9, ring: 7, lead: 'rifle' }, { budget: 11, ring: 8, lead: 'baton' }] },
  bath: { site: 'n8Bath', radius: 11, gang: 'blackMask', act: 4, district: 'chinatown', waves: [{ budget: 4, ring: 5 }] },
};

const SCENES = {
  n8Recap: (stage) => recap(stage, {
    title: 'Paper, burning',
    panels: [
      'Firefly burned every Sionis filing in Lower Gotham. Black Mask was erasing his trail.',
      { shot: { cam: [355, 6, -320], look: [345, 0.5, -332] }, caption: 'Lakeshore Drive is still frozen in the shape of the car.' },
      { shot: { cam: [-300, 70, -230], look: [-334, 58, -270] }, caption: 'Tonight, Wolf Point. He has been waiting.' },
    ],
  }),
  n8File: (stage) => [{
    layout: 'trio',
    panels: [
      { img: face('blackMask', 'SUBJECT: THE BAT', 'file 1 of 1'), caption: 'Routes, numbered. Gadgets, sketched. Fight tapes from the Iceberg, the Stack, the plant, the park.' },
      { img: stage.shot({ cam: [-310, 4, -270], look: [-320, 1, -285], hero: { at: [-318, 0.15, -283], yaw: 0.4, anim: 'Interact' } }), caption: 'Every villain this month was a test. He paid for the tests.', captionPos: 'bottom' },
      { img: face('blackMask', 'BLACK MASK'), balloons: [B('Let us see what you are without the toys, Batman. I have read the manual. I wrote the manual.', 50, 6, { w: 84 })] },
    ],
  }],
  maskIntro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [176, 8, 396], look: [165, 3, 383], hero: { at: [168, 2.2, 390], yaw: Math.PI, anim: 'Idle_Loop' } }), caption: 'The Blackgate yard, in the rain. He bought the floodlights too.' },
      { img: face('blackMask', 'BLACK MASK'), balloons: [B('You switched them back on, I see. The vision, the toys, the rope. They will not help you here. Shall we?', 50, 6, { w: 82 })] },
    ],
  }],
  maskOutro: (stage) => [{
    layout: 'duo',
    panels: [
      { img: face('blackMask', 'ACCOUNT CLOSED'), balloons: [B('You think this is over? You are the one in a mask. I am just the one who admits it.', 50, 6, { w: 80 })] },
      { img: stage.shot({ cam: [178, 7, 395], look: [165, 2.5, 384] }), caption: 'The guards he paid lock him in his own cell. The file goes in an evidence bag. Some of it does not.', captionPos: 'bottom' },
    ],
  }],
  n8Breakout: (stage) => [{
    layout: 'duo',
    panels: [
      { img: stage.shot({ cam: [560, 30, -40], look: [622, 20, -80] }), caption: 'Arkham Island. Every light on at once.' },
      { img: face('joker', 'A LETTER', 'hand delivered, by a clown'), balloons: [B('Dear Bats. Your new friend paid for my door. So kind! See you at the pier. Bring a date. Love, you know who.', 50, 6, { w: 86 })] },
    ],
  }],
};

export default {
  id: 'n8', act: 'act5', number: 8, actNumber: 5,
  title: 'Night Eight: Hostile Takeover',
  blurb: 'The man who paid for every villain this month has a file on Batman, and tonight he switches the tools off one by one.',
  villain: 'blackMask', gang: 'blackMask',
  districts: ['chinatown'],
  timeOfDay: 22.5, weather: 'rain',
  start: 'n8Lobby',
  day: {
    hook: 'day.n8',
    context: { day: 8, appointments: [{ id: 'emergencyVote', at: 22, place: 'wayneTowerLobby', title: 'Emergency board vote: the Wolf Point debt' }], lead: 'Garrick Stone wants the board to sell Wolf Point debt to a buyer nobody has met.' },
    fallback: [
      g('alfred', 'Mr. Stone has called an emergency vote. At ten at night. On the Wolf Point debt. I find that a very specific time to want people tired.'),
      g('alfred', 'Miss Quell telephoned. She said, and I quote, "tell him the candles were lovely." I do not believe she meant it kindly.'),
    ],
  },
  sites: SITES,
  rooms: ROOMS,
  fights: FIGHTS,
  scenes: SCENES,
  overheard: [
    [['goonA', 'Mr. Sionis says we are a family.'], ['goonB', 'He docked my pay for smiling.'], ['goonA', 'Families are complicated.']],
    [['goonA', 'Why the masks?'], ['goonB', 'Corporate identity.'], ['goonA', 'I can not see out of mine.'], ['goonB', 'That is the identity.']],
    [['goonA', 'He read us the Bat file at the team meeting.'], ['goonB', 'And?'], ['goonA', 'Forty pages. Page one says "run." I skipped to the end. It also says "run."']],
  ],
  missions: [
    {
      id: 'm8Vote', title: 'Ten O\'Clock Vote', checkpoint: 'n8Lobby', rewards: ['xp:100'],
      steps: [
        { id: 'n8Recap', type: 'cutscene', scene: 'n8Recap' },
        {
          id: 'n8Choice', type: 'dilemma', key: 'n8.vote', text: 'The board votes at ten (gold, Wayne Tower). False Faces are torching a Chinatown block at the same hour.',
          title: { text: 'ACT FIVE: ARKHAM', sub: 'Night Eight: Hostile Takeover' }, heading: 'TEN O\'CLOCK', timer: 45,
          card: 'Vote as Bruce at Wayne Tower (gold) and the debt sale fails, but Chinatown burns longer. Go to Chinatown as Batman and the board sells Wolf Point the money it needs.',
          bruce: { site: 'n8Lobby', radius: 8, label: 'Bruce at the vote', lines: [g('alfred', 'Wayne Tower, then. Chinatown will have to hold. I am sorry, sir. There was no right answer.')],
            miss: { effects: { standing: -6, threads: { lucius: -0.5 } }, lines: [v('lucius', 'They sold it, Bruce. Stone had the votes the moment your chair was empty. Wolf Point has money tonight.')] } },
          batman: { site: 'n8Gate', radius: 14, label: 'Batman in Chinatown', lines: [g('batman', 'Lucius. Vote my shares. Against.'), v('lucius', 'I can not vote your shares, Bruce. That is rather the point of shares.')],
            miss: { effects: { city: -6 }, lines: [g('gordon', 'Chinatown, the block by the gate. It burned for an hour. Everyone got out. Nobody got out with anything.')] } },
          both: { effects: { standing: 2, city: 2 }, lines: [g('alfred', 'A vote won and a block saved. I shall have the good china out.')] },
          branches: { bruce: 'n8Vote', batman: 'n8GateFight', both: 'n8GateFight' },
        },
        {
          id: 'n8Vote', type: 'civvy', outfit: 'suit', text: 'The board room. Vote against the sale.', next: 'n8GateLate',
          card: 'Bruce Wayne, late, in a suit with damp shoulders. Garrick Stone has the floor.',
          beats: [
            { id: 'stone', site: 'n8Stone', text: 'Garrick Stone is mid-speech.', lines: [v('stone', 'And so the motion: we sell the Wolf Point debt tonight, to a buyer who has asked for discretion. All in favour.')],
              choice: { key: 'n8.stone', prompt: 'The board is about to vote', default: 'question', options: [
                { id: 'question', tag: 'sharp', text: 'Who is the buyer, Garrick? Say the name out loud.', effects: { standing: 3, suspicion: { villain: 4 } }, lines: [v('stone', 'That is... confidential.'), v('lucius', 'Then it is a no from me. And, I suspect, from Bruce.')] },
                { id: 'playboy', tag: 'act', text: 'Sorry, is this the vote about the yacht?', effects: { standing: -2, suspicion: { reporter: -3 } }, lines: [v('stone', 'No, Bruce. It is not about the yacht.'), v('lucius', 'He is voting no. He just does not know it yet.')] },
              ] } },
            { id: 'lucius', site: 'n8LuciusAt', text: 'Lucius, by the window.', lines: [v('lucius', 'Motion fails. You looked tired in there, Bruce. You look tired everywhere. Go home.'), g('bruce', 'Not yet.')] },
          ],
        },
        {
          id: 'n8GateLate', type: 'fight', fight: 'gateBurnt', text: 'Chinatown burned while you voted. False Faces are looting the gate. Stop them.', next: 'n8Market',
          tip: { title: 'NEW: THE LIEUTENANT', text: 'He steadies the squad and calls in backup. Take him out first, or the fight never ends.' },
          lines: [g('gordon', 'Late. It is out now, the fire. The looting is not.')],
        },
        {
          id: 'n8GateFight', type: 'fight', fight: 'gateFire', text: 'False Faces at the Chinatown gate. The lieutenant first.',
          tip: { title: 'NEW: THE LIEUTENANT', text: 'He steadies the squad and calls in backup. Take him out first, or the fight never ends.' },
          lines: [v('falseFace', 'The boss said you would come here. The boss is always right.'), v('falseFace', 'The boss said he would come HERE?')],
        },
      ],
    },
    {
      id: 'm8Market', title: 'Night Market', checkpoint: 'n8Gate', rewards: ['xp:200'],
      steps: [
        {
          id: 'n8Market', type: 'fight', fight: 'market', text: 'The night market. His knife men are shaking down the stalls.',
          lines: [v('falseFace', 'Protection fee! Protection from us!'), v('stallholder', 'You are the only thing I need protecting from!')],
          interrupts: [{ id: 'n8Bath', at: 'n8Bath', radius: 22, fight: 'bath', xp: 80, label: 'Optional: the bathhouse is clear', lines: [v('dispatch', 'Units in Odessa: masked men in the bathhouse, refusing to leave the sauna.')] }],
        },
        {
          id: 'n8Ledger', type: 'scan', text: 'Detective vision while you still have it: where is the money going?',
          points: [
            { site: 'n8Temple', lines: [g('oracle', 'Envelopes in the temple donation box. Same folding, same seal. That is a collection route.')] },
            { site: 'n8Mahjong', lines: [g('oracle', 'The mahjong parlour is a counting room. Tonight\'s take went to Wolf Point an hour ago.')] },
            { site: 'n8GateRoof', lines: [g('oracle', 'And from up here you can see it: the tower lit top to bottom. He knows you are coming. He is holding the door.')] },
          ],
          optional: [{ id: 'n8Domes', title: 'Optional: the Odessa church domes', site: 'n8Domes', radius: 6, xp: 60, done: 'From the domes: a False Face lookout, asleep on the job with a thermos.', lines: [v('falseFace', 'Five more minutes, mum.')] }],
        },
      ],
    },
    {
      id: 'm8Gauntlet', title: 'The File', checkpoint: 'n8BaseEntry', rewards: ['xp:300'],
      steps: [
        {
          id: 'n8ToTower', text: 'Wolf Point. The tower on the fork. Drop in at the north entrance.', site: 'n8BaseEntry', radius: 10,
          lines: [g('oracle', 'Forty floors of False Faces. He will have planned for detective vision first. Everyone does.')],
          banter: [g('alfred', 'I have read his file on you, sir. He thinks you are vain about the cape. I could not possibly comment.')],
        },
        {
          id: 'n8Dark', type: 'fight', fight: 'base', locks: ['detective'], lockText: 'A jammer in the tower. Read them by sound, light and patience.',
          text: 'The parking floor. Detective vision is jammed. Five of them, a lieutenant among them. Take them silently.', tutorial: ['crouch', 'silent'],
          lines: [g('oracle', 'Your visor is dark. That is him. A jammer somewhere on this floor.'), v('falseFace', 'Boss says he can not see us now.'), v('falseFace', 'Then why am I whispering?')],
        },
        { id: 'n8File', type: 'cutscene', scene: 'n8File' },
        {
          id: 'n8NoGadgets', type: 'fight', fight: 'fork', locks: ['gadgets'], lockText: 'Your belt is locked out. Shields and snipers, and nothing to throw.',
          text: 'The fork. Shields and snipers, and your gadgets are locked out. Vault the shields. Break the snipers\' sight.',
          lines: [g('oracle', 'He sent a signal into the belt. Batarangs, claw, all of it. Locked.'), v('falseFace', 'He has got nothing! Get him!'), v('falseFace', 'He has got fists. Fists are something!')],
        },
        {
          id: 'n8NoGrapple', type: 'fight', fight: 'walk', locks: ['grapple', 'gadgets'], lockText: 'The grapple is locked too. Rifles on the river walk. Close the gap on foot.',
          text: 'The river walk. No grapple, no gadgets. Rifles and batons: close on foot, use cover.',
          lines: [g('oracle', 'Grapple is down. He wants you on the ground, in a line of fire. So do not stand in it.')],
        },
        {
          id: 'n8Up', text: 'Your tools come back. He wants you to have them now. Up to the roof deck.', site: 'n8Roof', radius: 7,
          lines: [g('oracle', 'Everything is back online. That is not a mistake. He wants to show you they will not matter.'), g('batman', 'They will not.')],
        },
        {
          id: 'n8ToBlackgate', text: 'A helicopter, lifting off the roof, south over the harbour. Blackgate. Call the Batwing and follow.', site: 'n8Dock', radius: 14,
          tutorial: ['callBatwing'],
          nudge: g('oracle', 'Blackgate is the prison island in the harbour, south of Old Gotham. Call the Batwing from a roof and fly. You cannot swim it. Please do not try.'),
          lines: [g('oracle', 'He is landing at Blackgate. He owns the contract for the prison laundry. Of course he does.'), v('black mask', 'Come and see me, Batman. I have the whole yard to myself. I paid for it.')],
          banter: [g('alfred', 'A man who buys a prison so he has somewhere to fight. I have known dukes like that.')],
        },
      ],
    },
    {
      id: 'm8Mask', title: 'Black Mask', checkpoint: 'n8YardIn', rewards: ['xp:600', 'lore:maskFile', 'skill:readTheRoom'],
      steps: [
        { id: 'n8Boss', type: 'boss', boss: 'blackMask', text: 'Black Mask. Counter blue, dodge red, do not repeat yourself.', checkpoint: 'n8YardIn', villain: 'blackMask',
          lines: [g('oracle', 'He has every tape of you. So fight like the tapes are wrong.')] },
      ],
    },
    {
      id: 'm8Breakout', title: 'Two Calls', checkpoint: 'n8Dock', rewards: ['xp:200'],
      steps: [
        { id: 'n8Breakout', type: 'cutscene', scene: 'n8Breakout' },
        {
          id: 'n8Statement', type: 'dilemma', key: 'n8.statement', text: 'Ostrow wants Bruce Wayne at the GCPD for a statement, now (gold). Arkham is breaking open.',
          timer: 60, heading: 'TWO CALLS',
          card: 'Detective Ostrow wants Bruce Wayne\'s statement at GCPD tonight (gold): an alibi, and her trust. Or answer the Arkham alarm at the causeway, and give the Joker less of a head start.',
          bruce: { site: 'n8Gcpd', radius: 8, label: 'Bruce at GCPD', lines: [v('ostrow', 'Mr. Wayne. Wet, at midnight, on a Tuesday. Sit down.'), g('bruce', 'I was at a board meeting. Then I went for a drive. In the rain.'), v('ostrow', 'I will write that down. I write everything down.')],
            miss: { effects: { suspicion: { detective: 10 }, threads: { detective: -0.5 } }, lines: [v('ostrow', 'Voicemail for Bruce Wayne. You missed our appointment. People who miss appointments with me get more appointments.')] } },
          batman: { site: 'n8Causeway', radius: 12, label: 'Batman at the causeway', lines: [g('gordon', 'Gordon. The causeway gate is holding because you are on it. Do not leave.')],
            miss: { effects: { city: -5 }, lines: [g('gordon', 'They took the causeway gate. He is on the pier with half of Arkham behind him.')] } },
          both: { effects: { suspicion: { detective: -4 } }, lines: [v('ostrow', 'Mr. Wayne gave his statement and the causeway held. Funny how that works.')] },
          branches: { bruce: 'n8End', batman: 'n8End', both: 'n8End' },
        },
        {
          id: 'n8End', type: 'nightEnd', text: 'Wolf Point is dark. Arkham is not.',
          lines: [g('alfred', 'One more night, sir. Then, I am told, there is a thing called sleep. I have read about it.'), g('oracle', 'He is on the pier. He wants an audience. Let us not give him one.')],
        },
      ],
    },
  ],
};
