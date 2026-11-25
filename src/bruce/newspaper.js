// The morning paper (workstream K): headlines that react to last night and to the double life.
// Pure. The Manor's newspaper on the breakfast table and the Batcomputer's news tab read it.
//   headlines(state, { district, villain }) -> [{ kind, head, sub }] (front page first)
const DISTRICT_NAME = {
  loop: 'the Loop', lowerGotham: 'Lower Gotham', narrows: 'the Narrows', parkRow: 'Park Row', chinatown: 'Chinatown',
  yards: 'the Yards', gothamMile: 'Gotham Mile', lakefront: 'the Lakefront', bristol: 'Bristol', core: 'Old Gotham',
};
const where = (d) => DISTRICT_NAME[d] ?? 'Old Gotham';

export function headlines(state, { district = null, villain = null } = {}) {
  const out = [];
  const n = state.lastNight;
  const d = where(district ?? n?.district);
  if (n) {
    if (n.storyWon) out.push({ kind: 'night', head: 'CAPED FIGURE ENDS STANDOFF', sub: `Police arrive in ${d} to find the work already done.` });
    else if (n.crimesIgnored > n.crimesStopped) out.push({ kind: 'night', head: `${d.toUpperCase()} ON EDGE AFTER NIGHT OF CRIME`, sub: 'Residents ask where the city\'s guardian was.' });
    else if (n.crimesStopped > 0) out.push({ kind: 'night', head: `QUIET NIGHT IN ${d.toUpperCase()}`, sub: `${n.crimesStopped} crime${n.crimesStopped === 1 ? '' : 's'} stopped before police arrived. Nobody saw who.` });
    if (n.finishers > 8) out.push({ kind: 'night', head: 'HOSPITALS REPORT BUSY NIGHT', sub: 'Several men treated for injuries they will not explain.' });
  }
  if (state.flags?.officerHurt) out.push({ kind: 'city', head: 'OFFICER HURT IN THE NARROWS', sub: 'GCPD asks why backup took so long.' });
  if (state.flags?.escalated) out.push({ kind: 'city', head: 'LAKEFRONT STANDOFF GROWS', sub: 'An incident left alone for an hour became something worse.' });
  if (state.flags?.arkwrightLand) out.push({ kind: 'wayne', head: 'WAYNE BOARD SELLS NARROWS LAND', sub: 'Buyer is a company eleven days old. Shareholders shrug.' });
  if (state.doors?.opened?.includes('narrowsLand')) out.push({ kind: 'wayne', head: 'WAYNE BLOCKS NARROWS SALE', sub: 'A billionaire reads the small print. Markets stunned.' });
  for (const [k, v] of Object.entries(state.flags ?? {})) {
    if (v && k.startsWith('excuseJoke.')) {
      const id = k.slice(11);
      out.push({ kind: 'gossip', head: `WAYNE INJURED ${id === 'sailing' ? 'SAILING' : id === 'polo' ? 'AT POLO' : 'BY ' + id.toUpperCase()}, AGAIN`, sub: 'The Gazette\'s running count of Bruce Wayne\'s hobbies reaches a new high.' });
    }
  }
  if (state.standing < 30) out.push({ kind: 'wayne', head: 'WHERE IS BRUCE WAYNE?', sub: 'Third Foundation event missed this month. Board said to be "concerned".' });
  else if (state.standing > 80) out.push({ kind: 'wayne', head: 'WAYNE FOUNDATION PLEDGES RECORD SUM', sub: 'The playboy, it seems, can count.' });
  if (state.city < 30) out.push({ kind: 'city', head: 'CITY HALL CALLS EMERGENCY MEETING', sub: 'Crime figures worst in a decade.' });
  if (state.suspicion?.reporter >= 70) out.push({ kind: 'gossip', head: 'THE BILLIONAIRE WHO NEVER SLEEPS', sub: 'Our reporter has questions. Mr. Wayne has a yacht.' });
  if (villain) out.push({ kind: 'city', head: `${String(villain).toUpperCase()} SIGHTING UNCONFIRMED`, sub: 'GCPD says "no comment" in a way that means yes.' });
  if (!out.length) out.push({ kind: 'city', head: 'GOTHAM: OVERCAST, AGAIN', sub: 'Long-range forecast: Gotham.' });
  return out;
}
