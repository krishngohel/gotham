// [sandbox] The car radio's stations: original in-fiction stations, data only (tested for
// consistency in tests/unit/sandbox.test.js). Music is the game's own synthesised score: each
// station plays a theme from src/audio/music/themes.js through the music director (a district key
// picks the exploration theme), so nothing new is loaded. Talk is text with voice blips through the
// bark system (subtitles apply). {level} {weather} {district} {hour} are filled at air time.
//
// Ordinary cars get the five music stations; the Batmobile gets the police band and Alfred.

export const STATIONS = Object.freeze([
  {
    id: 'nightOwl', name: 'WNOX 88.4 The Night Owl', short: 'NIGHT OWL', theme: 'loop', host: 'Della Vance', voice: 'radioDJ',
    tag: 'Slow jazz for fast cities.',
    talk: [
      'This is Della on the Night Owl. If you\'re driving, keep both hands on the wheel. If you\'re a gargoyle, keep doing what you\'re doing.',
      'It\'s {hour} in Gotham and the saxophone doesn\'t care. Neither do I. Here\'s another one.',
      'A listener calls in: "Della, is that a bat on my fire escape?" Honey, in this town, you don\'t ask. You turn the radio up.',
    ],
  },
  {
    id: 'rustBelt', name: 'WRKR 101.9 Rust Belt Radio', short: 'RUST BELT', theme: 'yards', host: 'Big Stosh', voice: 'radioDJ2',
    tag: 'Steel, smoke and power chords.',
    talk: [
      'Big Stosh here. That was loud. This next one is louder. Somebody wake up the Yards.',
      'Shout-out to the night shift at the grain elevators. You smell like toast and I respect it.',
      'If your car is making a noise like this song, see a mechanic. If your mechanic is making a noise like this song, see a doctor.',
    ],
  },
  {
    id: 'lantern', name: 'Lantern 93.3 Night Market', short: 'LANTERN FM', theme: 'chinatown', host: 'Mei and Ollie', voice: 'radioDJ',
    tag: 'Grooves from the night market.',
    talk: [
      'Mei and Ollie with you till sunrise. Ollie, what are we eating? Ollie is eating dumplings on air again.',
      'Traffic report from the gate: the dragon is fine, the parking is not.',
      'Lantern 93.3. If you can hear us, the noodles at the corner of Paifang Lane are still open. You\'re welcome.',
    ],
  },
  {
    id: 'mile', name: 'Mile High 97.7', short: 'MILE HIGH', theme: 'gothamMile', host: 'Tiffani with an i', voice: 'radioDJ2',
    tag: 'Gotham Mile\'s hits, all night long.',
    talk: [
      'Mile High 97.7! Shopping is a cardio! The Mile is open late and so are we!',
      'Caller three, you\'ve won two tickets to anything at the Iceberg that doesn\'t involve a debt!',
      'That song was about love. This one is also about love, but faster.',
    ],
  },
  {
    id: 'public', name: 'Gotham Public Radio 89.1', short: 'GPR 89.1', theme: 'robinsonPark', host: 'Harold Pemberton-Ruiz', voice: 'radioNews',
    tag: 'News, weather and very calm strings.',
    talk: [
      'You\'re listening to Gotham Public Radio. Our pledge drive continues. Every tote bag funds one minute of calm.',
      'And now, the weather, read slowly, for those who need it read slowly.',
      'A reminder that the municipal pothole on Lakeshore Drive is now old enough to vote.',
    ],
  },
]);

// The Batmobile's two "stations": no music (the score plays), only voices.
export const CAR_BANDS = Object.freeze([
  { id: 'policeBand', name: 'GCPD band (scanner)', short: 'POLICE BAND', police: true },
  { id: 'alfred', name: 'Wayne Manor line', short: 'ALFRED', alfred: true },
]);

export const OFF = Object.freeze({ id: 'off', name: 'Radio off', short: 'OFF' });

// News bulletins (any music station, between songs). Keyed by what the city is doing.
export const NEWS = Object.freeze({
  wanted: [
    'Police are asking motorists to report sightings of a large, bat-shaped individual. Do not approach. He will approach you.',
    'GCPD confirms an ongoing pursuit {district}. A department spokesman described the suspect as "tall, dark and extremely annoying".',
  ],
  manhunt: [
    'Breaking: bascule bridges raised citywide as the GCPD conducts what the Mayor calls "a big search, the biggest". Expect delays.',
    'The Commissioner declined to comment on tonight\'s manhunt, except to say, quote, "I need a vacation".',
  ],
  clear: [
    'Crime is down {district} this week, and nobody can explain why. Local gargoyle repair costs, meanwhile, are way up.',
    'The Gazette reports another gang lieutenant found hanging upside down outside a precinct. Gift-wrapped. Again.',
    'City Hall says the new streetlights are "basically working". Basically.',
  ],
  menace: [
    'The Mayor\'s office repeated tonight that the so-called vigilante is a public menace. In related news, the Mayor\'s office was saved by him twice last month.',
  ],
});

export const WEATHER = Object.freeze({
  clear: 'Clear skies tonight. Enjoy them. They won\'t last.',
  drizzle: 'Light drizzle. The kind that gets in your collar and stays there.',
  rain: 'Rain, steady, all night. Gotham\'s natural state.',
  storm: 'Thunderstorms. Stay indoors unless you have a cape, in which case, apparently, you don\'t.',
  fog: 'Fog off the lake. Visibility is low. Drive slow and trust nothing.',
  snow: 'Snow. The city looks almost clean. Almost.',
});

// Satirical ads: original, clean, local.
export const ADS = Object.freeze([
  'Grimsby\'s Gargoyle Polish. Because something up there is perching on your building, and it deserves to shine.',
  'Penny-Wise Umbrellas. It\'s always raining. Buy two.',
  'Sal\'s Pizza: delivered before the bridge goes up, or it\'s free. The bridge goes up a lot. Please be patient.',
  'Narrows Locksmiths. We\'ve seen worse doors. We\'ve seen worse everything.',
  'Is your car being chased by the police? Ask your lawyer about Vincenzo and Sons, Attorneys at Law. We don\'t ask questions. You shouldn\'t either.',
  'Gotham Mutual Insurance. Now covering "vigilante-related incidents" at no extra cost, for a limited time, because our lawyers lost.',
  'Tired of losing your tuxedo every night? Formally Yours Rentals. No questions about the cape-shaped tears.',
]);

// The Batmobile: Alfred's line, now and then (not a station's music).
export const ALFRED = Object.freeze([
  'Alfred: The car\'s telemetry suggests you are driving like a man with no insurance, sir. You have excellent insurance. Please drive accordingly.',
  'Alfred: Shall I keep dinner warm, or is tonight a "breakfast at five" sort of evening?',
  'Alfred: Master Bruce, the radio in that car is for emergencies. Not for whatever you were humming.',
  'Alfred: The police band is quite busy tonight. I do hope none of it is about you.',
]);
