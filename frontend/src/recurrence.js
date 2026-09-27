// Human-readable repeat settings for recurring tasks. `extras` is the task
// (or any object) with recurrence_weekdays, recurrence_monthly,
// recurrence_from and deadline, for the finer rules (backend/app/recurrence.py).
import { t, tn, locale } from './i18n';

export const WORKDAYS = [0, 1, 2, 3, 4];

/** Short weekday name, 0 = Monday ("Mon" / "Mo"). */
export const weekdayName = (d, style = 'short') =>
  new Date(2024, 0, 1 + d).toLocaleDateString(locale(), { weekday: style }); // 1 Jan 2024 was a Monday

const isWorkdays = (days) => days && days.length === 5 && WORKDAYS.every((d) => days.includes(d));

export const ordinal = (n) => {
  switch (n) {
    case 1:
      return t('1st');
    case 2:
      return t('2nd');
    case 3:
      return t('3rd');
    default:
      return t('4th');
  }
};

/** The weekday a "same weekday" rule is based on, from the deadline. */
export function weekdayOf(deadline) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(deadline || '');
  if (!m) return null;
  const date = new Date(+m[1], m[2] - 1, +m[3]);
  return { weekday: (date.getDay() + 6) % 7, nth: Math.floor((date.getDate() - 1) / 7) + 1 };
}

function plainHow(unit, n) {
  switch (unit) {
    case 'day':
      return n === 1 ? t('daily') : t('every {n} days', { n });
    case 'week':
      return n === 1 ? t('weekly') : t('every {n} weeks', { n });
    case 'month':
      return n === 1 ? t('monthly') : t('every {n} months', { n });
    case 'year':
      return n === 1 ? t('yearly') : t('every {n} years', { n });
    default:
      return '';
  }
}

/** "weekly", "every Mon, Thu", "monthly on the last workday", "3 days after completion". */
export function recurrenceHow(unit, interval, extras = {}) {
  const n = interval || 1;
  const days = extras.recurrence_weekdays;
  const monthly = extras.recurrence_monthly;
  const fromCompletion = extras.recurrence_from === 'completion';
  let how = plainHow(unit, n);
  if (!how) return '';

  if (unit === 'week' && days && days.length) {
    const names = days.map((d) => weekdayName(d)).join(', ');
    if (isWorkdays(days) && n === 1) how = t('every workday');
    else how = n === 1 ? t('every {days}', { days: names }) : t('every {n} weeks on {days}', { n, days: names });
  } else if ((unit === 'month' || unit === 'year') && monthly && monthly !== 'day') {
    const w = weekdayOf(extras.deadline);
    switch (monthly) {
      case 'last_day':
        how = t('{how} on the last day', { how });
        break;
      case 'last_workday':
        how = t('{how} on the last workday', { how });
        break;
      case 'first_workday':
        how = t('{how} on the first workday', { how });
        break;
      case 'weekday':
        how = w
          ? w.nth >= 5
            ? t('{how} on the last {weekday}', { how, weekday: weekdayName(w.weekday, 'long') })
            : t('{how} on the {nth} {weekday}', { how, nth: ordinal(w.nth), weekday: weekdayName(w.weekday, 'long') })
          : t('{how} on the same weekday', { how });
        break;
      case 'last_weekday':
        how = w
          ? t('{how} on the last {weekday}', { how, weekday: weekdayName(w.weekday, 'long') })
          : t('{how} on the same weekday', { how });
        break;
      default:
        break;
    }
  }

  if (fromCompletion) {
    const simple = !(days && days.length) && !(monthly && monthly !== 'day');
    if (simple && unit === 'day') return tn(n, 'one day after completion', '{n} days after completion');
    if (simple && unit === 'week') return tn(n, 'one week after completion', '{n} weeks after completion');
    if (simple && unit === 'month') return tn(n, 'one month after completion', '{n} months after completion');
    if (simple && unit === 'year') return tn(n, 'one year after completion', '{n} years after completion');
    return t('{how}, counted from completion', { how });
  }
  return how;
}

/** "Repeats weekly", "Repeats every Mon, Thu"; '' for non-repeating tasks. */
export function describeRecurrence(unit, interval, extras = {}) {
  const how = recurrenceHow(unit, interval, extras);
  return how ? t('Repeats {how}', { how }) : '';
}

/** Short badge text: "weekly", "2 wks", "Mon, Thu", "last workday", "3 d after done". */
export function shortRecurrence(unit, interval, extras = {}) {
  const n = interval || 1;
  const days = extras.recurrence_weekdays;
  const monthly = extras.recurrence_monthly;
  if (!plainHow(unit, n)) return '';
  let text;
  if (unit === 'week' && days && days.length) {
    text = isWorkdays(days) ? t('workdays') : days.map((d) => weekdayName(d)).join(', ');
    if (n > 1) text = `${text} · ${t('{n} wks', { n })}`;
  } else if ((unit === 'month' || unit === 'year') && monthly && monthly !== 'day') {
    const w = weekdayOf(extras.deadline);
    const short = {
      last_day: () => t('last day'),
      last_workday: () => t('last workday'),
      first_workday: () => t('first workday'),
      weekday: () =>
        w ? (w.nth >= 5 ? t('last {weekday}', { weekday: weekdayName(w.weekday) }) : `${ordinal(w.nth)} ${weekdayName(w.weekday)}`) : t('same weekday'),
      last_weekday: () => (w ? t('last {weekday}', { weekday: weekdayName(w.weekday) }) : t('same weekday')),
    }[monthly];
    text = short ? short() : plainHow(unit, n);
    if (n > 1 || unit === 'year') text = `${text} · ${plainHow(unit, n)}`;
  } else if (n === 1) {
    text = plainHow(unit, 1);
  } else {
    text = { day: t('{n} d', { n }), week: t('{n} wks', { n }), month: t('{n} mo', { n }), year: t('{n} yrs', { n }) }[unit];
  }
  return extras.recurrence_from === 'completion' ? t('{text} after done', { text }) : text;
}
