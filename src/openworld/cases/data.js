// Detective cases (item 6): plain data for the case engine (engine.js). Two cases open side
// chains (the cat burglar's Nine Lives, the clay brute's Clay Feet); three are stand-alone cold
// cases, each with a twist. Points are site ids from src/world/regions/data.js REGION_SITES with
// small offsets, at street (or deck) level near the site. Lines are original.
//
// case = { id, title, district, after, chain?, blurb, intro: [lines], scene: { site, radius },
//   evidence: [{ id, at, glyph, label, text }], reconstruct: { prompt, cards: [{ id, text }], order },
//   trail: { kind, text, points | receivers + target }, confront: { kind, at?, budget?, gang?, type?, lines? },
//   solvedLines, twist, reward: [reward ids] }
const L = (speaker, text) => ({ speaker, text });

export const CASES = [
  {
    id: 'caseNineLives',
    title: 'Nine Lives',
    district: 'gothamMile',
    after: 'n1',
    chain: 'nineLives',
    blurb: 'A jeweller on Diamond Row was robbed through a hole the size of a dinner plate.',
    intro: [
      L('alfred', 'Diamond Row, sir. The Kessler window was opened with a glass cutter and, according to the owner, "a great deal of nerve".'),
      L('alfred', 'Nothing else was touched. Whoever it was knew exactly which tray they wanted.'),
    ],
    scene: { site: 'diamondRow2', radius: 14 },
    evidence: [
      { id: 'glassCircle', at: { site: 'diamondRow2', dx: 0, dz: 1.5 }, glyph: 'mark', label: 'A perfect circle cut in the glass', text: 'Scored once, popped clean. A professional cutter, and a steady hand.' },
      { id: 'pawCard', at: { site: 'diamondRow2', dx: 3, dz: 2 }, glyph: 'object', label: 'A calling card with a paw print', text: 'Embossed, expensive card stock. She wanted us to know.' },
      { id: 'clawMarks', at: { site: 'diamondRow3', dx: -2, dz: 1.5 }, glyph: 'mark', label: 'Claw marks on the drainpipe', text: 'Three-pronged climbing claws. Up, not down. She left over the roofs.' },
      { id: 'chalkPrint', at: { site: 'diamondRow1', dx: 1, dz: 2 }, glyph: 'print', label: 'A soft-soled print in climbing chalk', text: 'Size five, ballet flats with grip tape. Not a crew. One climber.' },
    ],
    reconstruct: {
      prompt: 'How did the thief work the window?',
      cards: [
        { id: 'roof', text: 'She came down from the roof on a line.' },
        { id: 'cut', text: 'She cut a circle in the glass.' },
        { id: 'tray', text: 'She took one tray: the cat-eye opals.' },
        { id: 'card', text: 'She left a calling card on the sill.' },
        { id: 'climb', text: 'She went back up the drainpipe.' },
      ],
      order: ['roof', 'cut', 'tray', 'card', 'climb'],
    },
    trail: {
      kind: 'footprints',
      text: 'Chalk prints along the Row. She came down once to cut through the street.',
      points: [{ site: 'diamondRow3', dx: 6, dz: 2 }, { site: 'icebergDoor', dx: -6, dz: -4 }, { site: 'icebergDoor', dx: 3, dz: -4 }],
    },
    confront: { kind: 'chain', at: { site: 'icebergDoor', dx: 0, dz: -6 } },
    solvedLines: [
      L('alfred', 'The prints stop at a fire escape and a second calling card. "Catch me if you can." She is enjoying this, sir.'),
      L('batman', 'Then she will make a mistake. Cats always come back to the same roofs.'),
    ],
    twist: 'She was never after the money: every tray she takes belonged to the same insurance swindle.',
    reward: ['xp:300', 'lore:catBurglarFile'],
  },
  {
    id: 'caseClayFeet',
    title: 'Clay Feet',
    district: 'yards',
    after: 'n1',
    chain: 'clayFeet',
    blurb: 'A night guard at the Yards cold store walked out twice. Only one of him came back.',
    intro: [
      L('dispatch', 'Units at the Yards cold store: the guard is accounted for. Both of him. Please advise.'),
      L('alfred', 'Two identical guards on the camera feed, sir, at the same moment. I have checked the tape. It is not the tape.'),
    ],
    scene: { site: 'yardsColdStorageDoor', radius: 14 },
    evidence: [
      { id: 'claySmear', at: { site: 'yardsColdStorageDoor', dx: -1.5, dz: 1 }, glyph: 'drop', label: 'A grey smear on the door handle', text: 'Wet clay, still warm. Clay should not be warm.' },
      { id: 'uniform', at: { site: 'yardsColdStorageDoor', dx: -4, dz: -3 }, glyph: 'object', label: 'A guard uniform, empty, standing up', text: 'Stiff with dried clay, in the shape of a man. Like a shed skin.' },
      { id: 'prints', at: { site: 'yardsColdStorageDoor', dx: -6, dz: 2 }, glyph: 'print', label: 'Footprints that change size', text: 'Size eleven, then fourteen, then nothing a shoe shop sells.' },
      { id: 'padlock', at: { site: 'yardsColdStorageDoor', dx: -2.5, dz: 4 }, glyph: 'object', label: 'A padlock squeezed flat', text: 'Not cut. Squeezed. In a hand.' },
    ],
    reconstruct: {
      prompt: 'What happened at the cold store door?',
      cards: [
        { id: 'wait', text: 'Something waited in the clay pit behind the store.' },
        { id: 'copy', text: 'It took the guard\'s shape and walked in.' },
        { id: 'lock', text: 'It crushed the inner padlock.' },
        { id: 'shed', text: 'It shed the guard like a coat and left.' },
      ],
      order: ['wait', 'copy', 'lock', 'shed'],
    },
    trail: {
      kind: 'chemical',
      text: 'Clay drips glow in detective vision. They lead toward the crusher.',
      points: [{ site: 'yardsColdStorageDoor', dx: -8, dz: 6 }, { site: 'yardsCrusher', dx: 8, dz: -8 }, { site: 'yardsCrusher', dx: 4, dz: -3 }],
    },
    confront: { kind: 'chain', at: { site: 'yardsCrusher', dx: 0, dz: -4 } },
    solvedLines: [
      L('alfred', 'The drips end in the crusher\'s feed pit. Something big is sleeping in there, sir. Something that used to be an actor.'),
      L('batman', 'Then we wake it up on our terms.'),
    ],
    twist: 'The "guard" who reported the break-in was the brute the whole time; the real guard was asleep in the truck.',
    reward: ['xp:300', 'lore:clayBruteFile'],
  },
  {
    id: 'caseDrownedAccountant',
    title: 'The Drowned Accountant',
    district: 'river',
    after: null,
    blurb: 'A bookkeeper pulled from the river. The coroner says he jumped. His shoes say otherwise.',
    intro: [
      L('officer', 'Jumped off the river walk, looks like. Sad business. Case closed, as far as the sergeant cares.'),
      L('alfred', 'A man who jumps does not usually lace his shoes in double knots first, sir. Have a look.'),
    ],
    scene: { site: 'riverWalk', radius: 14 },
    evidence: [
      { id: 'dryShoes', at: { site: 'riverWalk', dx: 2, dz: 0 }, glyph: 'object', label: 'His shoes, dry, by the rail', text: 'Neatly paired. The socks inside are dry too. He did not walk here.' },
      { id: 'dragMarks', at: { site: 'riverWalk', dx: -4, dz: 0 }, glyph: 'mark', label: 'Two long scuffs on the paving', text: 'Heels dragged backwards. Somebody carried him the last few metres.' },
      { id: 'ledgerPage', at: { site: 'riverWalk', dx: 6, dz: 0 }, glyph: 'object', label: 'A torn ledger page in the drain', text: 'Two columns of figures. The second column is the real one.' },
      { id: 'oilDrop', at: { site: 'riverWalk', dx: -8, dz: 0 }, glyph: 'drop', label: 'Fresh engine oil on the steps', text: 'A van with a leaking sump waited at the top of these steps.' },
    ],
    reconstruct: {
      prompt: 'How did the accountant end up in the river?',
      cards: [
        { id: 'found', text: 'He found the second set of books.' },
        { id: 'van', text: 'He was driven down to Lower Gotham in a van.' },
        { id: 'carried', text: 'He was carried down the steps and put in the river.' },
        { id: 'shoes', text: 'Someone set his shoes by the rail to sell the story.' },
      ],
      order: ['found', 'van', 'carried', 'shoes'],
    },
    trail: {
      kind: 'tyre',
      text: 'The leaking van left a tyre track in its own oil, along the lower deck.',
      points: [{ site: 'lowerDeck', dx: -10, dz: 0 }, { site: 'lowerDeck', dx: 10, dz: 0 }, { site: 'loadingDock', dx: -11, dz: 2 }, { site: 'loadingDock', dx: -4, dz: 2 }],
    },
    confront: { kind: 'crime', type: 'dealBust', at: { site: 'loadingDock', dx: 0, dz: 2 } },
    solvedLines: [
      L('alfred', 'His business partner, sir, selling the real ledger to the highest bidder on a loading dock. Not a jumper. A witness.'),
      L('officer', 'Sergeant says he always had a feeling about that partner. Sergeant has never had a feeling in his life.'),
    ],
    twist: 'The suicide was staged by the partner, who reported it himself.',
    reward: ['xp:350', 'lore:accountantLedger'],
  },
  {
    id: 'caseMarqueeBlackout',
    title: 'Lights Out on Marquee Row',
    district: 'loop',
    after: null,
    blurb: 'The power went out mid-show. When it came back, the box office was empty and so was the safe.',
    intro: [
      L('dispatch', 'Theatre robbery on Marquee Row. Two hundred witnesses. All of them were looking at the stage.'),
      L('alfred', 'The understudy fainted, the orchestra kept playing, and somebody walked off with the takings. Showbusiness, sir.'),
    ],
    scene: { site: 'marqueeRow', radius: 14 },
    evidence: [
      { id: 'fuseBox', at: { site: 'marqueeRow', dx: -4, dz: 1.5 }, glyph: 'object', label: 'The fuse box, opened with a key', text: 'No forced lock. Whoever cut the power had the staff key.' },
      { id: 'redDrops', at: { site: 'marqueeRow', dx: 2, dz: 1.5 }, glyph: 'drop', label: 'Red drops on the carpet', text: 'Not blood. Stage blood: corn syrup and food colouring. It smells of a dentist\'s waiting room.' },
      { id: 'torchMark', at: { site: 'marqueeRow', dx: 6, dz: 1.5 }, glyph: 'mark', label: 'A scorch from a small torch', text: 'A usher\'s torch, set down hot on the velvet rope.' },
    ],
    reconstruct: {
      prompt: 'How was the box office robbed in the dark?',
      cards: [
        { id: 'key', text: 'Someone with the staff key opened the fuse box.' },
        { id: 'dark', text: 'The lights went out during the second act.' },
        { id: 'safe', text: 'The usher, torch in hand, emptied the box office.' },
        { id: 'spill', text: 'A prop bottle of stage blood broke in the escape.' },
      ],
      order: ['key', 'dark', 'safe', 'spill'],
    },
    trail: {
      kind: 'chemical',
      text: 'The stage blood dripped from the bag. It shows bright in detective vision.',
      // West along Marquee Row toward the loopMarqueeRow crime spot (-30, -539): the street under the El.
      points: [{ x: -10, y: 0.15, z: -545 }, { x: -20, y: 0.15, z: -542 }, { x: -29, y: 0, z: -539 }],
    },
    confront: { kind: 'fight', budget: 4, gang: 'twoFace', at: { x: -34, y: 0, z: -539 } },
    solvedLines: [
      L('alfred', 'The usher, sir. He sold the staff key to a coin crew and kept the torch for himself. He says the second act was terrible anyway.'),
      L('dispatch', 'Cars on Marquee Row: suspect in custody. He would like it on record that he has notes on the play.'),
    ],
    twist: 'The man who showed everyone to their seats in the dark was the only one who could see.',
    reward: ['xp:300', 'lore:marqueePlaybill'],
  },
  {
    id: 'caseBellTwice',
    title: 'The Bell That Rang Twice',
    district: 'bristol',
    after: null,
    blurb: 'St. Swithin\'s bell rings at three every morning. The bell rope was cut in 1952.',
    intro: [
      L('alfred', 'The village is convinced it is a ghost, sir. The vicar is convinced it is the village. I am convinced it is a radio.'),
      L('alfred', 'Every night at three, the same frequency hisses on the police band. A bell, and then a voice reading numbers.'),
    ],
    scene: { site: 'bristolChurch', radius: 14 },
    evidence: [
      { id: 'speaker', at: { site: 'bristolChurch', dx: 2, dz: 2 }, glyph: 'object', label: 'A speaker wired behind the noticeboard', text: 'Weatherproofed, battery-fed. The "bell" is a recording.' },
      { id: 'cable', at: { site: 'bristolChurch', dx: -3, dz: 3 }, glyph: 'mark', label: 'A thin aerial cable in the hedge', text: 'It runs toward the village, not up the tower.' },
      { id: 'numbers', at: { site: 'bristolChurch', dx: 0, dz: 5 }, glyph: 'wave', label: 'A burst of numbers on the police band', text: 'Ship times and berths for the harbour. Somebody is broadcasting a smuggling timetable.' },
    ],
    reconstruct: {
      prompt: 'What is the ghost bell really for?',
      cards: [
        { id: 'buy', text: 'A smuggling crew needs a signal nobody will question.' },
        { id: 'legend', text: 'They pick the church with the ghost story.' },
        { id: 'bell', text: 'The bell recording covers the start of each broadcast.' },
        { id: 'numbers', text: 'The numbers tell the boats where to land.' },
      ],
      order: ['buy', 'legend', 'bell', 'numbers'],
    },
    trail: {
      kind: 'radio',
      text: 'Take a bearing at three points around the village; the transmitter is where they cross.',
      receivers: [{ site: 'bristolChurch', dx: 4, dz: -4 }, { site: 'bristolGarage', dx: 0, dz: 3 }, { site: 'bristolPub', dx: 6, dz: 2 }],
      target: { site: 'bristolPub', dx: 0, dz: 3 },
    },
    confront: {
      kind: 'talk',
      at: { site: 'bristolPub', dx: 0, dz: 4 },
      lines: [
        L('civilian', 'All right, all right! It\'s my transmitter. They pay me fifty a night to read the numbers. I thought it was a pub quiz.'),
        L('batman', 'A pub quiz at three in the morning, with berth numbers.'),
        L('civilian', '...It was a very hard pub quiz.'),
      ],
    },
    solvedLines: [
      L('alfred', 'The landlord of the Gargoyle\'s Rest, sir. The harbour patrol has the timetable now. The ghost, I am sorry to say, has retired.'),
      L('dispatch', 'Bristol units: the bell is off the air. Please stop calling the vicar about it.'),
    ],
    twist: 'The haunted bell was a pirate radio relay, run from the pub cellar for a smuggling crew.',
    reward: ['xp:300', 'lore:ghostBell'],
  },
];
export const CASE_IDS = CASES.map((c) => c.id);
export const caseById = (id) => CASES.find((c) => c.id === id) ?? null;
