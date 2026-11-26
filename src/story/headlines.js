// The Gotham Gazette, campaign edition (workstream J2): headlines per night for the Manor's paper,
// the Batcomputer's Gazette page and the civilians' headline hook (newsstands, billboards, radio).
// Pure. A night's own front page appears the morning after it; choices made during the nights
// (progress.campaign.choices) and the double life's flags add their own stories.
//   storyHeadlines(campaign, life?) -> [{ kind, head, sub }]   (front page first)
//   storyHeadline(campaign, r)      -> one headline string, for a sign or a radio line
export const NIGHT_HEADLINES = {
  n1: [{ head: 'CLOWN IN CUSTODY AFTER NIGHT OF TERROR', sub: 'Hostages home. Clock tower "structurally sound, emotionally scarred," say engineers.' }],
  n2: [{ head: 'ICEBERG LOUNGE RAIDED', sub: 'Club owner arrested in a tuxedo. Insists the umbrella "was for the rain."' },
    { head: 'DIAMOND ROW REOPENS', sub: 'Jewellers report every stone accounted for, plus one opera glass case nobody can explain.' }],
  n3: [{ head: 'THE LOOP SOLVES ITSELF', sub: 'Puzzle bombs defused across downtown. Commuters report "unusually smug" graffiti.' },
    { head: 'QUIZ NIGHT CANCELLED', sub: 'City Hall suspends its charity trivia evening "for obvious reasons."' }],
  n4: [{ head: 'NARROWS WAKES FROM A BAD DREAM', sub: 'Hospitals treat dozens for "panic" after a green fog. Doctors prescribe sleep and a day off.' }],
  n5: [{ head: 'THE YARDS THAW', sub: 'Frost warning lifted. A forklift driver describes the night as "very, very cold, and then fine."' }],
  n6: [{ head: 'ROBINSON PARK REGROWS OVERNIGHT', sub: 'Gardeners baffled by roses on the lamp posts. Commuters baffled by their own memories of last night.' },
    { head: 'NOBODY HURT IN PARK RIOT', sub: 'Police praise "unusual restraint" by whoever was there. Nobody was there, says police.' }],
  n7: [{ head: 'CONVOY OF FIRE STOPPED ON LAKESHORE', sub: 'Eleven fuel trucks, zero explosions. The drive reopens with new scorch marks and a tow bill.' },
    { head: 'PLANETARIUM SAFE', sub: 'The dome stands. The Foundation\'s gala raises a record sum, or most of one, depending who you ask.' }],
  n8: [{ head: 'WOLF POINT TOWER FALLS SILENT', sub: 'Sionis empire collapses in one night. Investors ask where the money went. So does the DA.' }],
  n9: [{ head: 'ARKHAM SECURE', sub: 'The island is quiet. The pier will reopen after "a deep clean and a long hard look."' },
    { head: 'GOTHAM SLEEPS', sub: 'For the first time in a fortnight, the signal stays dark until dawn.' }],
};

// Stories that come from what the player chose (choice key -> value -> headline).
const CHOICE_HEADLINES = {
  'n3.gala': { batman: { kind: 'wayne', head: 'WAYNE NO-SHOW AT CITY HALL GALA', sub: 'The guest of honour sent a cheque and a cough. The mayor took the cheque.' },
    bruce: { kind: 'city', head: 'BOMB SCARE IN THE LOOP', sub: 'Two blocks evacuated while downtown\'s elite clinked glasses a street away.' } },
  'n4.clinic': { batman: { kind: 'wayne', head: 'CLINIC DONOR DINNER GOES ON WITHOUT DONOR', sub: 'Nurses eat the dessert. Report it was excellent.' },
    bruce: { kind: 'city', head: 'NARROWS HOSTAGE HURT', sub: 'Officer says help "came, eventually." He is expected to recover.' } },
  'n6.party': { batman: { kind: 'gossip', head: 'WAYNE LEAVES OWN GARDEN PARTY', sub: 'Guests report host "went to check on the roses" and never came back.' },
    bruce: { kind: 'city', head: 'PARK STILL OVERGROWN', sub: 'Lakeshore Drive closed for a second morning. Roots, says the city. Plotting, says a jogger.' } },
  'n7.gala': { batman: { kind: 'wayne', head: 'PLANETARIUM PLEDGE MISSING ITS SPEAKER', sub: 'Alfred Pennyworth reads Mr. Wayne\'s speech. Critics call it "his best yet."' },
    bruce: { kind: 'city', head: 'FIRE ON THE LOWER DECK', sub: 'Lower Gotham closed after a tanker blaze. Crews say it could have been "very much worse."' } },
  'n8.vote': { batman: { kind: 'wayne', head: 'WAYNE ABSENT AS BOARD SELLS WOLF POINT DEBT', sub: 'Shareholders approve the sale. One asks if Mr. Wayne still works here.' },
    bruce: { kind: 'city', head: 'CHINATOWN BLOCK ON FIRE', sub: 'Residents out safely. They would like a word with whoever was supposed to be watching.' } },
  'n6.date': { stood: { kind: 'gossip', head: 'BILLIONAIRE STANDS UP DATE AT CONSERVATORY', sub: 'She waited forty minutes. The orchids, she says, were good company.' } },
  'n4.ostrow': { brazen: { kind: 'gossip', head: 'WAYNE SPOTTED AT NARROWS CRIME SCENE', sub: '"I was lost," says the billionaire. Detective Ostrow writes that down.' } },
};

export function storyHeadlines(campaign = {}, life = null) {
  const out = [];
  const done = campaign.nightsDone ?? [];
  const last = [...done].reverse().find((n) => NIGHT_HEADLINES[n]);
  if (last) for (const h of NIGHT_HEADLINES[last]) out.push({ kind: 'night', ...h });
  for (const [key, byValue] of Object.entries(CHOICE_HEADLINES)) {
    const v = campaign.choices?.[key];
    if (v && byValue[v] && done.includes(key.split('.')[0])) out.push(byValue[v]);
  }
  if (campaign.ending === 'exposed') out.push({ kind: 'gossip', head: 'DETECTIVE DECLINES TO COMMENT ON WAYNE', sub: 'Asked about the billionaire, Det. Ostrow said only: "He owes me a cup of tea."' });
  if (life?.flags?.alfredBreak) out.push({ kind: 'wayne', head: 'WAYNE MANOR BUTLER SEEN AT BUS STATION', sub: 'Carrying one suitcase and, witnesses say, an air of great patience finally spent.' });
  if (!out.length) out.push({ kind: 'city', head: 'GOTHAM: OVERCAST, AGAIN', sub: 'Long-range forecast: Gotham.' });
  return out;
}

export function storyHeadline(campaign = {}, r = 0) {
  const list = storyHeadlines(campaign);
  return list[Math.floor(Math.abs(r) * list.length) % list.length].head;
}
