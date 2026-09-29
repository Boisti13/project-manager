// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { spanOf, timelineRange, draggedDates, dependencyLinks, daysBetween, toDay } from './timeline';

const d = (s) => toDay(s);

test('bars, milestones and open starts', () => {
  const bar = spanOf({ start_date: '2026-10-05T00:00:00', deadline: '2026-10-09T00:00:00' });
  assert.strictEqual(daysBetween(bar.start, bar.end), 4);
  assert.strictEqual(bar.milestone, false);
  assert.strictEqual(spanOf({ deadline: '2026-10-09T00:00:00' }).milestone, true);
  assert.strictEqual(spanOf({ start_date: '2026-10-05T00:00:00' }).open, true);
  // a start after the deadline (shouldn't happen): shown as the deadline
  assert.strictEqual(spanOf({ start_date: '2026-10-12T00:00:00', deadline: '2026-10-09T00:00:00' }).milestone, true);
  assert.strictEqual(spanOf({}), null);
});

test('the range covers everything and today, from a Monday', () => {
  const today = d('2026-09-30'); // a Wednesday
  const r = timelineRange([spanOf({ deadline: '2026-11-20T00:00:00' })], today);
  assert.strictEqual(r.start.getDay(), 1);
  assert.ok(r.start <= d('2026-09-27'));
  assert.ok(daysBetween(r.start, d('2026-11-30')) < r.days);
  assert.strictEqual(timelineRange([], today).days, 35); // at least five weeks
});

test('dragging moves dates, edges never cross', () => {
  const task = { start_date: '2026-10-05T00:00:00', deadline: '2026-10-09T00:00:00' };
  assert.deepStrictEqual(draggedDates(task, 3), { start_date: '2026-10-08T00:00:00', deadline: '2026-10-12T00:00:00' });
  assert.deepStrictEqual(draggedDates(task, -2, 'start'), { start_date: '2026-10-03T00:00:00' });
  assert.deepStrictEqual(draggedDates(task, 9, 'start'), { start_date: '2026-10-09T00:00:00' });
  assert.deepStrictEqual(draggedDates(task, -9, 'end'), { deadline: '2026-10-05T00:00:00' });
  assert.deepStrictEqual(draggedDates({ deadline: '2026-10-09T00:00:00' }, 1), { deadline: '2026-10-10T00:00:00' });
  assert.strictEqual(draggedDates(task, 0), null);
});

test('dependency arrows only between shown tasks', () => {
  const tasks = [{ id: 1 }, { id: 2, blocked_by_ids: [1, 9] }, { id: 3, blocked_by_ids: [2] }];
  assert.deepStrictEqual(dependencyLinks(tasks), [{ from: 1, to: 2 }, { from: 2, to: 3 }]);
});
