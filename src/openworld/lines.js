// Open-world lines: the police radio for every crime type, escalations and outcomes, the city's
// mood barks, lieutenants. Original writing in the game's comic voice; humour lives in the radio
// and the barks, never in a hurt civilian. `{district}` is filled with the district's label.
export const DISPATCH = {
  spawn: {
    mugging: ['Caller reports a woman cornered in {district}. Any unit.', 'Units near {district}: someone is being robbed in an alley. Caller is the victim. She is whispering.'],
    robbery: ['Silent alarm in {district}. Getaway car spotted idling a block away.', 'All units, robbery in progress, {district}. The driver keeps honking. Hurry.'],
    van: ['Delivery van being emptied in {district}. The driver says it is "a lot of televisions".', 'Van break-in, {district}. Suspects are carrying the goods on foot. Optimists.'],
    hostageStore: ['All units, hostages taken in a store in {district}. Do not engage. Repeat, do not engage.', 'Hostage situation, {district}. One gunman says he has a trigger. Negotiator is twenty minutes out.'],
    footChase: ['Purse snatching in {district}. Suspect is running. Officer is not.', 'Runner on foot in {district}, stolen handbag, very fast legs.'],
    rooftopChase: ['Caller in {district} reports a man jumping between roofs. Not the usual one. Somebody new.', 'Free-runner with a bag of stolen jewellery, roofs over {district}. Air support grounded.'],
    vehicleGetaway: ['Stolen car heading out of {district} at speed. Units in pursuit. Losing pursuit.', 'All cars, getaway vehicle leaving {district}. It just went through a fruit stand.'],
    bomb: ['Bomb threat called in from {district}. Squad is on the way. Clear the street.', 'Device reported in {district}. The caller left a riddle. Nobody is laughing.'],
    arson: ['Fire department en route to {district}. Building occupied. Possible arson.', 'Structure fire, {district}. Witnesses saw a man on the roof with a gas can. And a grin.'],
    racket: ['Shopkeeper in {district} reports a "collection". He does not owe anyone anything.', 'Protection racket working {district} again. Nobody will make a statement.'],
    sniperNest: ['Shots fired in {district}! Officers pinned behind a cruiser. Rooftop shooters.', 'Snipers on the roofs over {district}. Do not raise your head. That is an order.'],
    gangWar: ['Two crews fighting in the street in {district}. Bring the big van. Bring two.', 'Gang war breaking out in {district}. Residents report "a lot of yelling about territory".'],
    kidnap: ['Witness taken from her front step in {district}. Van, no plates. Last seen heading south.', 'Abduction in {district}. Caller saw a van and a dropped phone. The phone is still ringing.'],
    carRing: ['Car theft in {district}. Owner says it was parked "for one minute". Tracking it now.', 'Stolen car out of {district}. Plate matches three others stolen this week. A ring.'],
    bankJob: ['Bank alarm in {district}. Vault crew inside, lookouts outside, escape car running.', 'All units, armed robbery at the bank in {district}. This one is organised.'],
    elHijack: ['Motorman reports hijackers on his train. The Loop line. He would like to stop being on it.', 'El train taken over by armed men. Next stops are not being announced.'],
    bridgeStandoff: ['The bridge is going up with a car still on it. Somebody took the bridgehouse.', 'Bridge operator held at gunpoint. A car is hanging off the leaf. All units.'],
    prisonBreak: ['Blackgate reports a breakout in the yard. Guards are... reconsidering their careers.', 'Riot in progress on Blackgate Isle. Inmates heading for the wall.'],
    asylumRiot: ['Arkham reports a disturbance in the yard. Orderlies trapped. Please hurry. Please.', 'Code orange at Arkham. Inmates loose in the ward. The orderlies have locked themselves in the linen room.'],
    pierShakedown: ['Arcade owner on the pier says some men want "a percentage of the fun".', 'Shakedown at the pier arcade. The claw machine has been threatened.'],
    museumHeist: ['Motion sensors tripped in the gallery wing. Security guard is not answering.', 'Somebody is loading crates at the museum at two in the morning. It is not a delivery.'],
    dealBust: ['Informant says there is a buy going down in {district}. Two cars, two crews, one bag.', 'Unmarked vans meeting in {district}. Somebody is trading something. Somebody is armed.'],
    brawl: ['Brawl outside a bar in {district}. Again. Somebody bring a mop.', 'Fight in the street, {district}. Witnesses say it started over a parking space.'],
  },
  escalate: {
    mugging: 'Update: the mugging in {district} has turned into a hostage situation. Nobody went.',
    racket: 'The collector made the tail. He is running.',
    carRing: 'Stolen car is aware of pursuit. It is driving like it.',
    dealBust: 'The deal is blown. Money is on the move in {district}.',
    museumHeist: 'Alarm at the museum. The crates are running.',
  },
  stopped: [
    '{district}: suspects down. Units, go pick them up. Bring the zip-tie cutters.',
    'Dispatch, situation in {district} is resolved. Suspects are "very sorry". Witnesses describe a large bat.',
    'All clear in {district}. Somebody tell the caller she can come out from behind the bins.',
  ],
  failed: [
    'We lost them in {district}. Anyone see which way?',
    '{district}: the suspects got away. Paperwork for everybody.',
  ],
  hurt: 'Ambulance requested in {district}. Civilian hurt. Units, stay on scene.',
  expired: 'Too late. The goons got away.',
  arrests: ['Units in {district}: {n} suspects zip-tied and waiting. Courtesy of the usual.', 'Pick-up in {district}: {n} gift-wrapped suspects. No note this time.'],
  mood: {
    safe: 'All units, {district} has gone quiet. Enjoy it. It never lasts.',
    lawless: 'Be advised: {district} is out of control. Units travel in pairs. Or not at all.',
  },
  lieutenant: 'Word on the street: {name} is running {district} now. The crews answer to him.',
  lieutenantDown: '{name} is in custody. {district} just lost its boss. Expect a scramble.',
};

// Civilians' barks as the district's mood changes (cleaned districts thank, neglected ones hide).
export const MOOD_BARKS = {
  safe: ['Evening! Quiet one tonight. Wonder why.', 'I walked home alone tonight. First time in a year.', 'Thank you! Whoever you are under there.', 'My shop window is still in one piece. That is a record.'],
  calm: ['Nice night for it.', 'Did you see the paper? Crime is down. I read it twice.'],
  uneasy: ['Keep your bag close round here.', 'Somebody got jumped on the corner last night.'],
  tense: ['Get inside, it is getting bad out here.', 'Where are the cops? Where is anybody?'],
  lawless: ['Shutters down! They own this street now.', 'Nobody saw nothing. Got it? Nothing.'],
};

// Goons arriving at a crime when the Bat's reputation runs ahead of him.
export const ARRIVAL_BARKS = {
  surrender: ['Okay! Okay! I give up! Not the face!', 'I am on my knees, see? Knees!', 'I was never here and I am very sorry.'],
  flee: ['It is him! Run!', 'Nope. Nope nope nope.', 'I did not sign up for wings!'],
  trap: ['He took the bait! Now, boys!', 'Told you he would come. Lights!'],
};

export const fill = (text, vars) => String(text).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));
