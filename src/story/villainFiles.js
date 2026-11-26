// The Batcomputer's villain files (workstream J2): one per rogue the campaign meets, shown once
// that night has begun. Original write-ups in the case-file voice: dry, exact, now and then a
// little tired. Names stay in data. `skill` is the one thing each boss fight tests (research doc
// 6.2: no mechanic repeats).
export const VILLAIN_FILES = [
  { id: 'joker', night: 'n1', alias: 'THE JOKER', realName: 'Unknown', skill: 'everything at once', weakness: 'an audience that will not laugh',
    summary: 'Held the city hostage for one storm-soaked night from the clock tower. In custody at Arkham.',
    notes: 'Records list eleven names, four birthdays and one claim to have invented the whoopee cushion. All false. Probably.' },
  { id: 'harley', night: 'n1', alias: 'HARLEY', realName: 'Dr. Harleen (surname withheld)', skill: 'reading a fighter who never stops moving', weakness: 'loyalty to the wrong man',
    summary: 'Former Arkham psychiatrist. Acrobat. Hits harder than the mallet suggests.',
    notes: 'Her case notes on him are still on file. They are the best work anyone has done on him. That is the tragedy.' },
  { id: 'penguin', night: 'n2', alias: 'THE PENGUIN', realName: 'Oswald (surname withheld)', skill: 'gadgets', weakness: 'his own reputation for class',
    summary: 'Runs the Iceberg Lounge and half the smuggling on the river. Every umbrella is a weapon. Some are two.',
    notes: 'Tips the coat-check girl well, the police better. Keeps a ledger in a fish tank. The fish are fine.' },
  { id: 'riddler', night: 'n3', alias: 'THE RIDDLER', realName: 'Edward (surname withheld)', skill: 'detective work', weakness: 'cannot leave a clue unsigned',
    summary: 'Turned the Loop into a quiz with live ammunition. Believes he is the smartest man in Gotham and says so out loud.',
    notes: 'Has mapped a great many of my routes across the rooftops. Has not yet asked himself who has the time. Keep it that way.' },
  { id: 'scarecrow', night: 'n4', alias: 'THE SCARECROW', realName: 'Dr. Jonathan (surname withheld)', skill: 'stealth', weakness: 'his own fear, in a high enough dose',
    summary: 'Former professor of psychology. Tested a fear toxin on the Narrows from the top of the Stack.',
    notes: 'His notebooks are meticulous. His funding was not his own: Sionis Cold Holdings again.' },
  { id: 'freeze', night: 'n5', alias: 'MR. FREEZE', realName: 'Dr. Victor (surname withheld)', skill: 'the environment', weakness: 'heat, and the truth about what he is doing it for',
    summary: 'Cryogenics specialist in a refrigerated suit. Iced over the Yards to buy his wife another year.',
    notes: 'The only villain on this list who has written me a thank-you note. Lucius kept the chamber running. I did not tell him who paid.' },
  { id: 'ivy', night: 'n6', alias: 'POISON IVY', realName: 'Dr. Pamela (surname withheld)', skill: 'crowd control without hurting anyone', weakness: 'fire, frost, and people who keep their promises to the park',
    summary: 'Botanist. Grows things that should not grow and talks to the ones that do. Can make a crowd her garden with a breath of pollen.',
    notes: 'Her people are not her people. They are commuters, joggers and one very confused dog walker. Stun, never strike. She knows I will hold back. She counts on it.' },
  { id: 'firefly', night: 'n7', alias: 'FIREFLY', realName: 'Garfield (surname withheld)', skill: 'driving and the Batmobile', weakness: 'fuel, and the patience to wait for it to run out',
    summary: 'Pyrotechnician for hire. Flying suit, flamethrower, a convoy of fuel trucks and a grudge against the city fire code.',
    notes: 'He sets fires to be looked at. The best thing to do with him is to make sure nobody watches.' },
  { id: 'blackMask', night: 'n8', alias: 'BLACK MASK', realName: 'Roman (surname withheld)', skill: 'mastery of every counter and every enemy', weakness: 'he studied me from the outside',
    summary: 'Paid for the fear toxin, the frost and the fires through Sionis Cold Holdings. Runs the False Face Society from the Wolf Point tower.',
    notes: 'He has my methods on file: the detective vision, the gadgets, the grapple lines. He has been switching them off one at a time to see what is left. What is left is enough.' },
  { id: 'jokerRematch', night: 'n9', alias: 'THE JOKER, AGAIN', realName: 'Still unknown', skill: 'all of it, in time with a partner', weakness: 'two people who trust each other',
    summary: 'Walked out of Arkham on the night Black Mask fell. Took the pier and the island with him. Harley came along.',
    notes: 'He says this is the last time. He said that last time.' },
];

export const villainFile = (id) => VILLAIN_FILES.find((v) => v.id === id) ?? null;
