// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { describeRecurrence, shortRecurrence, recurrenceHow } from './recurrence';

test('describes repeat settings', () => {
  assert.strictEqual(describeRecurrence('week', 1), 'Repeats weekly');
  assert.strictEqual(describeRecurrence('week', null), 'Repeats weekly');
  assert.strictEqual(describeRecurrence('day', 3), 'Repeats every 3 days');
  assert.strictEqual(describeRecurrence(null, 2), '');
  assert.strictEqual(shortRecurrence('month', 1), 'monthly');
  assert.strictEqual(shortRecurrence('week', 2), '2 wks');
  assert.strictEqual(shortRecurrence('bogus', 1), '');
});

test('weekdays, monthly modes and counting from completion', () => {
  const how = (unit, n, extras) => recurrenceHow(unit, n, extras);
  assert.strictEqual(how('week', 1, { recurrence_weekdays: [0, 3] }), 'every Mon, Thu');
  assert.strictEqual(how('week', 2, { recurrence_weekdays: [4] }), 'every 2 weeks on Fri');
  assert.strictEqual(how('week', 1, { recurrence_weekdays: [0, 1, 2, 3, 4] }), 'every workday');
  assert.strictEqual(shortRecurrence('week', 1, { recurrence_weekdays: [0, 1, 2, 3, 4] }), 'workdays');
  assert.strictEqual(shortRecurrence('week', 1, { recurrence_weekdays: [0, 3] }), 'Mon, Thu');

  assert.strictEqual(how('month', 1, { recurrence_monthly: 'last_workday' }), 'monthly on the last workday');
  assert.strictEqual(how('month', 3, { recurrence_monthly: 'last_day' }), 'every 3 months on the last day');
  // 13 Oct 2026 is the 2nd Tuesday, 30 Oct the last Friday, 29 Oct the 5th Thursday
  assert.strictEqual(how('month', 1, { recurrence_monthly: 'weekday', deadline: '2026-10-13T00:00:00' }),
    'monthly on the 2nd Tuesday');
  assert.strictEqual(how('month', 1, { recurrence_monthly: 'last_weekday', deadline: '2026-10-30T00:00:00' }),
    'monthly on the last Friday');
  assert.strictEqual(how('month', 1, { recurrence_monthly: 'weekday', deadline: '2026-10-29T00:00:00' }),
    'monthly on the last Thursday');
  assert.strictEqual(how('month', 1, { recurrence_monthly: 'weekday' }), 'monthly on the same weekday');
  assert.strictEqual(shortRecurrence('month', 1, { recurrence_monthly: 'weekday', deadline: '2026-10-13' }), '2nd Tue');
  assert.strictEqual(shortRecurrence('month', 1, { recurrence_monthly: 'last_workday' }), 'last workday');

  assert.strictEqual(how('day', 3, { recurrence_from: 'completion' }), '3 days after completion');
  assert.strictEqual(how('week', 1, { recurrence_weekdays: [0], recurrence_from: 'completion' }),
    'every Mon, counted from completion');
  assert.strictEqual(shortRecurrence('day', 3, { recurrence_from: 'completion' }), '3 d after done');
});
