// Human-readable repeat settings for recurring tasks.
const NAMES = { day: ['day', 'daily'], week: ['week', 'weekly'], month: ['month', 'monthly'], year: ['year', 'yearly'] };

/** "Repeats weekly", "Repeats every 2 weeks"; '' for non-repeating tasks. */
export function describeRecurrence(unit, interval) {
  if (!unit || !NAMES[unit]) return '';
  const n = interval || 1;
  return n === 1 ? `Repeats ${NAMES[unit][1]}` : `Repeats every ${n} ${NAMES[unit][0]}s`;
}

/** Short badge text: "weekly", "2 wks". */
export function shortRecurrence(unit, interval) {
  if (!unit || !NAMES[unit]) return '';
  const n = interval || 1;
  if (n === 1) return NAMES[unit][1];
  const abbr = { day: 'd', week: 'wks', month: 'mo', year: 'yrs' }[unit];
  return `${n} ${abbr}`;
}
