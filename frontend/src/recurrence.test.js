// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { describeRecurrence, shortRecurrence } from './recurrence';

test('describes repeat settings', () => {
  assert.strictEqual(describeRecurrence('week', 1), 'Repeats weekly');
  assert.strictEqual(describeRecurrence('week', null), 'Repeats weekly');
  assert.strictEqual(describeRecurrence('day', 3), 'Repeats every 3 days');
  assert.strictEqual(describeRecurrence(null, 2), '');
  assert.strictEqual(shortRecurrence('month', 1), 'monthly');
  assert.strictEqual(shortRecurrence('week', 2), '2 wks');
  assert.strictEqual(shortRecurrence('bogus', 1), '');
});
