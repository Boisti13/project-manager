// Human-readable repeat settings for recurring tasks.
import { t } from './i18n';

/** "weekly", "every 2 weeks"; '' for non-repeating tasks. */
export function recurrenceHow(unit, interval) {
  const n = interval || 1;
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

/** "Repeats weekly", "Repeats every 2 weeks"; '' for non-repeating tasks. */
export function describeRecurrence(unit, interval) {
  const how = recurrenceHow(unit, interval);
  return how ? t('Repeats {how}', { how }) : '';
}

/** Short badge text: "weekly", "2 wks". */
export function shortRecurrence(unit, interval) {
  const n = interval || 1;
  if (n === 1) return recurrenceHow(unit, 1);
  switch (unit) {
    case 'day':
      return t('{n} d', { n });
    case 'week':
      return t('{n} wks', { n });
    case 'month':
      return t('{n} mo', { n });
    case 'year':
      return t('{n} yrs', { n });
    default:
      return '';
  }
}
