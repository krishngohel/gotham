// The Joker's plan, taken apart item by item (shown as a card when one comes off the list, and on
// the pause menu's Case File page). Pure: an item is done once the story reaches the step that
// ticks it, so a save shows the right ticks with no field of its own. In story order: the gas
// charges come back (Harley's van) before the antidote.
export const CHECKLIST_TITLE = 'CASE FILE: THE LONG NIGHT';
export const CHECKLIST = [
  { id: 'cargo', step: 'toNeon', label: 'Wayne Tech cargo', got: 'Cargo, secured. Still loose: the broadcast, the gas charges, the antidote, and every hostage.' },
  { id: 'broadcast', step: 'aceClueRadio', label: 'Pirate broadcast', got: 'The Joker is off the air. Still loose: the gas charges, the antidote, and the hostages.' },
  { id: 'charges', step: 'harleyRadio', label: 'Gas charges', got: 'Midnight has lost its big finish. Still loose: the antidote, and the hostages.' },
  { id: 'antidote', step: 'courierReveal', label: 'The antidote', got: 'Antidote, secured. Only the hostages are still out there. Go and get them.' },
  { id: 'hostages', step: 'rescueGuestsRadio', label: 'Hostages and the news crew', got: "Everyone's out. The cargo, the broadcast, the charges, the antidote, and the people. The Joker has nothing left but the tower." },
];

export function checklistAt(stepIndex, steps) {
  return CHECKLIST.map((c) => {
    const at = steps.findIndex((s) => s.id === c.step);
    return { id: c.id, label: c.label, done: at !== -1 && stepIndex >= at };
  });
}

export const tickedBy = (stepId) => CHECKLIST.find((c) => c.step === stepId) ?? null;
