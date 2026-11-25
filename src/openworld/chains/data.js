// The side-mission chains (research 6.3): four multi-step chains, each around a rogue the
// campaign's Nights 2-5 do not use (the Penguin, the Riddler, the Scarecrow and the cold-suit
// scientist are the campaign's), each over a cluster of districts, each ending in a boss with its
// own mechanic (chains/bosses.js). Unlocked by campaign night. Every mission is registered through
// the campaign's registerSideMission; the chain runner (chains/runtime.js) plays the steps.
//
// Step kinds: talk { lines } · comic { scene } · go { at, radius, text } · crime { type, spot,
// twists } · stealth { id } · case { id } · fight { at, budget, gang, act, text } · boss { id }
const g = (speaker, text) => ({ speaker, portrait: speaker, text });
const v = (speaker, text) => ({ speaker, portrait: 'radio', text });

export const CHAINS = [
  {
    id: 'nineLives', title: 'Nine Lives', villain: 'catBurglar', after: 'n1', districts: ['loop', 'gothamMile'],
    blurb: 'Somebody is robbing the Loop from above, and leaving a paw print on every safe.',
    missions: [
      { id: 'nineLives1', title: 'Second-Storey Work', start: 'loopWaynePlaza', district: 'loop', steps: [
        { do: 'comic', scene: 'owCatChainIntro' },
        { do: 'talk', lines: [g('oracle', 'Three penthouse safes in a week, all on the Loop, all opened from the roof. Somebody up there is very light on her feet.'), g('oracle', 'And she is up there right now. Over Wayne Plaza, heading north.')] },
        { do: 'crime', type: 'rooftopChase', spot: 'loopWaynePlaza', twists: [] },
        { do: 'talk', lines: [g('alfred', 'Not her, I am afraid, sir. A hired runner. He was carrying her calling card: a paw print in purple ink.'), g('alfred', 'Rather theatrical. I approve, in a way I would never admit.')] },
      ] },
      { id: 'nineLives2', title: 'Paw Prints', start: 'diamondRow2', district: 'gothamMile', steps: [
        { do: 'talk', lines: [g('oracle', 'Diamond Row again. A jeweller swears nobody came in through the door. Scan the place.')] },
        { do: 'case', id: 'caseNineLives' },
      ] },
      { id: 'nineLives3', title: 'The Pemberton Job', start: 'pembertonEntry', district: 'gothamMile', steps: [
        { do: 'talk', lines: [g('oracle', 'Her fence works out of the Pemberton penthouse. The guards up there are the Umbrella Men. They are expecting a cat, not a bat.')] },
        { do: 'stealth', id: 'pembertonPenthouse' },
        { do: 'talk', lines: [g('alfred', 'The fence kept a diary. Tonight, ten o\'clock: "The cat collects her money on the roof." How very punctual of her.')] },
      ] },
      { id: 'nineLives4', title: 'Nine Lives', start: 'pembertonEntry', district: 'gothamMile', steps: [
        { do: 'boss', id: 'owCatBurglar' },
        { do: 'talk', lines: [g('oracle', 'She is in a GCPD van and she is laughing. I do not like it when they laugh.'), g('alfred', 'Eight lives left, then. I shall keep count.')] },
      ], reward: ['xp:600', 'lore:catBurglarFile'] },
    ],
  },
  {
    id: 'clayFeet', title: 'Feet of Clay', villain: 'clayBrute', after: 'n2', districts: ['yards'],
    blurb: 'A man made of mud is stealing chemicals in the Yards. The chemicals are making him bigger.',
    missions: [
      { id: 'clayFeet1', title: 'Wet Cement', start: 'yardsFastTravel', district: 'yards', steps: [
        { do: 'comic', scene: 'owClayChainIntro' },
        { do: 'talk', lines: [g('oracle', 'A tanker of industrial binder went missing from the Yards. Then a second. The thieves are stealing cars to move it.')] },
        { do: 'crime', type: 'carRing', spot: 'yardsStolenCars', twists: [] },
        { do: 'talk', lines: [g('alfred', 'The chop shop was full of grey mud, sir. Warm grey mud. I would rather not think about why it was warm.')] },
      ] },
      { id: 'clayFeet2', title: 'Feet of Clay', start: 'yardsColdStorageDoor', district: 'yards', steps: [
        { do: 'case', id: 'caseClayFeet' },
      ] },
      { id: 'clayFeet3', title: 'Mould and Mildew', start: 'yardsCrusher', district: 'yards', steps: [
        { do: 'talk', lines: [v('Clay man', 'You keep sending little men with little fists. Come yourself. I have room for you.')] },
        { do: 'fight', at: 'yardsCrusher', budget: 9, gang: 'firefly', act: 3, text: 'Clear his crew out of the crusher yard' },
        { do: 'talk', lines: [g('oracle', 'He has the furnace, the crusher and the steelworks under watch. If we fight him, we fight him on all three. Use them.')] },
      ] },
      { id: 'clayFeet4', title: 'Kiln', start: 'yardsCrusher', district: 'yards', steps: [
        { do: 'boss', id: 'owClayBrute' },
        { do: 'talk', lines: [g('oracle', 'He is fired solid. GCPD needed a forklift. Arkham is building a very particular cell.'), g('alfred', 'I suggest a dehumidifier.')] },
      ], reward: ['xp:650', 'lore:clayManFile'] },
    ],
  },
  {
    id: 'headsOrTails', title: 'Heads or Tails', villain: 'twoFace', after: 'n3', districts: ['parkRow'],
    blurb: 'A former prosecutor holds court in Park Row, and lets a coin pass sentence.',
    missions: [
      { id: 'headsOrTails1', title: 'Call It', start: 'parkRowMission', district: 'parkRow', steps: [
        { do: 'comic', scene: 'owTwoFaceChainIntro' },
        { do: 'talk', lines: [g('gordon', 'Pawn shop on Park Row. His men walked in and asked the owner to call a coin. He called wrong.'), g('gordon', 'Now they have him and two customers in the back. Do not let them flip again.')] },
        { do: 'crime', type: 'hostageStore', spot: 'parkRowPawnRobbery', twists: ['hostageSwap'] },
      ] },
      { id: 'headsOrTails2', title: 'Both Sides', start: 'parkRowFastTravel', district: 'parkRow', steps: [
        { do: 'talk', lines: [g('oracle', 'His crew and the Park Row Kings are settling the street with a coin and a lot of bats. Not your kind of bat.')] },
        { do: 'crime', type: 'gangWar', spot: 'parkRowUnderViaduct', twists: [] },
        { do: 'talk', lines: [v('Two-faced DA', 'You picked a side. Or you picked none. Either way the coin noticed.')] },
      ] },
      { id: 'headsOrTails3', title: 'Odds Against', start: 'crimeAlley', district: 'parkRow', steps: [
        { do: 'talk', lines: [g('gordon', 'The one honest clerk at the courthouse just got pulled into a van in Crime Alley. She has his old case files.')] },
        { do: 'crime', type: 'kidnap', spot: 'parkRowMugging', twists: [] },
      ] },
      { id: 'headsOrTails4', title: 'Fifty-Fifty', start: 'orpheumMarquee', district: 'parkRow', steps: [
        { do: 'boss', id: 'owTwoFace' },
        { do: 'talk', lines: [g('gordon', 'Got him. He asked for a coin in his cell. Request denied.'), g('alfred', 'I find I do not like how close some of those calls were, sir.')] },
      ], reward: ['xp:650', 'lore:twoFaceFile'] },
    ],
  },
  {
    id: 'theContract', title: 'The Contract', villain: 'mercenary', after: 'n4', districts: ['loop', 'blackgate', 'robinsonPark'],
    blurb: 'Someone has put a price on the Bat. The best in the business took the job.',
    missions: [
      { id: 'theContract1', title: 'Open Season', start: 'loopCanyon', district: 'loop', steps: [
        { do: 'comic', scene: 'owMercChainIntro' },
        { do: 'talk', lines: [g('oracle', 'Snipers on the Loop roofs, pinning down a patrol. It is bait. It is bait with very good rifles.')] },
        { do: 'crime', type: 'sniperNest', spot: 'loopCanyon', twists: [] },
        { do: 'talk', lines: [g('oracle', 'One of them had a business card. Just a mask, and a number. The number is a price. Your price.')] },
      ] },
      { id: 'theContract2', title: 'Yard Time', start: 'blackgateDock', district: 'blackgate', steps: [
        { do: 'talk', lines: [g('gordon', 'Somebody paid Blackgate guards to look the other way while his men moved weapons through the yard. Go and look the right way.')] },
        { do: 'stealth', id: 'blackgateYardNight' },
      ] },
      { id: 'theContract3', title: 'Paid in Full', start: 'quayDock', district: 'quay', steps: [
        { do: 'talk', lines: [g('oracle', 'His payment is changing hands on the quay tonight. Break the deal and he has to come for you himself.')] },
        { do: 'crime', type: 'dealBust', spot: 'quayHeist', twists: [] },
        { do: 'talk', lines: [v('Masked mercenary', 'You cost me money. Robinson Park. The fountain. Come alone, or do not. It changes nothing.')] },
      ] },
      { id: 'theContract4', title: 'Hunter', start: 'parkFastTravel', district: 'robinsonPark', steps: [
        { do: 'boss', id: 'owMercenary' },
        { do: 'talk', lines: [g('gordon', 'He is in a cell and he still has the contract in his pocket. Someone paid him a fortune. We do not know who yet.'), g('alfred', 'I know that silence, sir. You are already working on it.')] },
      ], reward: ['xp:700', 'lore:mercenaryFile'] },
    ],
  },
];

// Places the chains name that are not city sites (the penthouse terrace's roof entry).
export const CHAIN_SITES = {
  pembertonEntry: { x: 128, y: 30, z: -689 },
  catArena: { x: 116, y: 30, z: -679 },
  twoFaceArena: { x: -478.75, y: 0.15, z: -318 },
  mercArena: { x: 300, y: 0.15, z: -500 },
  loopWaynePlaza: { x: 12, y: 0, z: -428.5 },
};
// The clay man's three stages across the Yards: where he fights, the hazard's sweep, its lever.
export const CLAY_STAGES = [
  { name: 'The Crusher', at: { x: -405, y: 0, z: 176 }, hazard: { x: -405, y: 0, z: 170 }, lever: { x: -409, y: 0, z: 168 }, sound: 'CRUNCH!', taunt: 'This is where they flatten cars. I like it here.', hurt: 'GRAAH! My shape!' },
  { name: 'The Furnace', at: { x: -418, y: 0, z: 46 }, hazard: { x: -418, y: 0, z: 52 }, lever: { x: -414, y: 0, z: 55 }, sound: 'SSSSSS!', taunt: 'Heat makes me hard. Did you not read the label?', hurt: 'Too hot! TOO HOT!' },
  { name: 'The Steelworks', at: { x: -430, y: 0, z: -26 }, hazard: { x: -424, y: 0, z: -26 }, lever: { x: -427, y: 0, z: -22 }, sound: 'KER-SPLASH!', taunt: 'Bring your friends. I will wear them.', hurt: 'The water! It is washing me OUT!' },
];

export const CHAIN_IDS = CHAINS.map((c) => c.id);
export const ALL_MISSIONS = CHAINS.flatMap((c) => c.missions.map((m, i) => ({ ...m, chain: c.id, index: i, after: c.after, villain: c.villain })));
