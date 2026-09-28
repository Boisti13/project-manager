// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { parseEstimate, formatEstimate, remainingMinutes, totalRemaining, childIndex } from './estimate';

test('parses what people type', () => {
  const cases = {
    '': null, '  ': null,
    2: 120, '1.5': 90, '1,5': 90, '1.5h': 90, '2 h': 120, '2 hours': 120, '3 Std': 180, '3 std.': 180,
    '90m': 90, '90 min': 90, '45 minutes': 45, '20 Minuten': 20,
    '1h 30m': 90, '1h30': 90, '1 h 30 min': 90, '1:30': 90, '0:45': 45,
  };
  for (const [text, minutes] of Object.entries(cases)) assert.strictEqual(parseEstimate(text), minutes, text);
  for (const bad of ['abc', '0', '0h', '1:75', '-2', '2 days', '1h 30x', '99999']) {
    assert.ok(Number.isNaN(parseEstimate(bad)), bad);
  }
});

test('formats minutes as hours and minutes', () => {
  assert.strictEqual(formatEstimate(90), '1h 30min');
  assert.strictEqual(formatEstimate(45), '45min');
  assert.strictEqual(formatEstimate(480), '8h');
  assert.strictEqual(formatEstimate(null), '');
  // What formatEstimate writes can be typed back in.
  for (const m of [5, 45, 60, 90, 125, 2400]) assert.strictEqual(parseEstimate(formatEstimate(m)), m);
});

test('remaining work: own estimate covers subtasks, done counts nothing', () => {
  const tasks = [
    { id: 1, parent_task_id: null, status: 'todo', estimate_minutes: 240 }, // covers 2 and 3
    { id: 2, parent_task_id: 1, status: 'todo', estimate_minutes: 60 },
    { id: 3, parent_task_id: 1, status: 'todo', estimate_minutes: 300 },
    { id: 4, parent_task_id: null, status: 'in_progress', estimate_minutes: null }, // sum of 5, 6 (not 7)
    { id: 5, parent_task_id: 4, status: 'todo', estimate_minutes: 30 },
    { id: 6, parent_task_id: 4, status: 'todo', estimate_minutes: null },
    { id: 7, parent_task_id: 4, status: 'done', estimate_minutes: 90 },
    { id: 8, parent_task_id: 6, status: 'todo', estimate_minutes: 15 }, // grandchild
    { id: 9, parent_task_id: null, status: 'done', estimate_minutes: 500 },
  ];
  const kids = childIndex(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  assert.strictEqual(remainingMinutes(byId.get(1), kids), 240);
  assert.strictEqual(remainingMinutes(byId.get(4), kids), 45);
  assert.strictEqual(remainingMinutes(byId.get(9), kids), 0);
  assert.strictEqual(totalRemaining([byId.get(1), byId.get(4), byId.get(9)], kids), 285);
});
