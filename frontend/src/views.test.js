// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { boardColumns, flattenVisible, tasksByDay, monthGrid, dayKey } from './views';
import { buildTaskTree, DEFAULT_FILTERS } from './taskFilters';

const t = (id, extra = {}) => ({ id, title: `t${id}`, status: 'todo', parent_task_id: null, ...extra });

test('board columns by status, recent done first', () => {
  const cols = boardColumns([
    t(1),
    t(2, { status: 'blocked' }),
    t(3, { status: 'done', completed_at: '2026-09-01T10:00:00' }),
    t(4, { status: 'done', completed_at: '2026-09-20T10:00:00' }),
    t(5, { status: 'in_progress' }),
  ]);
  assert.deepStrictEqual(
    Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v.map((x) => x.id)])),
    { todo: [1], in_progress: [5], blocked: [2], done: [4, 3] }
  );
});

test('flattens the visible tree, only matches when filtering', () => {
  const tasks = [t(1, { title: 'Order' }), t(2, { parent_task_id: 1, title: 'cables' }), t(3, { title: 'Other' })];
  const all = buildTaskTree(tasks, DEFAULT_FILTERS);
  assert.deepStrictEqual(flattenVisible(all).map((x) => x.id), [1, 2, 3]);
  const some = buildTaskTree(tasks, { ...DEFAULT_FILTERS, q: 'cables' });
  assert.deepStrictEqual(flattenVisible(some).map((x) => x.id), [2]);
});

test('groups deadlines by day, open and important first', () => {
  const byDay = tasksByDay([
    t(1, { deadline: '2026-09-28T00:00:00', status: 'done' }),
    t(2, { deadline: '2026-09-28T00:00:00', priority: 1 }),
    t(3, { deadline: '2026-09-28T00:00:00', priority: 3 }),
    t(4),
  ]);
  assert.deepStrictEqual(byDay.get('2026-09-28').map((x) => x.id), [3, 2, 1]);
  assert.strictEqual(byDay.size, 1);
});

test('month grid starts on Monday and covers the month', () => {
  const weeks = monthGrid(2026, 8); // September 2026 starts on a Tuesday
  assert.strictEqual(dayKey(weeks[0][0]), '2026-08-31');
  assert.strictEqual(dayKey(weeks[weeks.length - 1][6]), '2026-10-04');
  assert.strictEqual(weeks.length, 5);
  assert.ok(weeks.every((w) => w.length === 7 && w[0].getDay() === 1));
  assert.strictEqual(monthGrid(2027, 1).length, 4); // February 2027: Mon 1st to Sun 28th
});
