// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { buildMyDay, recentNotifications, greeting } from './myday';

const NOW = new Date(2026, 8, 26, 10, 0).getTime(); // Sat 26 Sep 2026, 10:00 local
const t = (id, extra = {}) => ({ id, title: `t${id}`, status: 'todo', parent_task_id: null, assignee_id: 1, ...extra });

test('sections of my day', () => {
  const tasks = [
    t(1, { deadline: '2026-09-20T00:00:00' }), // overdue
    t(2, { deadline: '2026-09-26T00:00:00', priority: 1 }), // today
    t(3, { deadline: '2026-09-26T00:00:00', priority: 3 }), // today, first
    t(4, { deadline: '2026-10-03T00:00:00' }), // within the week
    t(5, { deadline: '2026-10-04T00:00:00' }), // 8 days: not this week
    t(6, { deadline: '2026-09-20T00:00:00', status: 'done' }), // done: nowhere
    t(7, { deadline: '2026-09-20T00:00:00', assignee_id: 2 }), // someone else's
    t(8, { assignee_id: null, status: 'in_progress', priority: 2 }), // unassigned counts
    t(9, { status: 'in_progress', blocked_by_ids: [10] }),
    t(10, { assignee_id: 2 }),
  ];
  const d = buildMyDay(tasks, { userId: 1, now: NOW });
  const ids = (list) => list.map((x) => x.id);
  assert.deepStrictEqual(ids(d.overdue), [1]);
  assert.deepStrictEqual(ids(d.dueToday), [3, 2]);
  assert.deepStrictEqual(ids(d.thisWeek), [4]);
  assert.deepStrictEqual(ids(d.inProgress), [8, 9]);
  assert.deepStrictEqual(ids(d.waiting), [9]);
  assert.deepStrictEqual(ids(buildMyDay(tasks, { userId: 1, now: NOW, includeUnassigned: false }).inProgress), [9]);
});

test('recent notifications and greeting', () => {
  const items = [
    { id: 1, kind: 'assigned', task_id: 5, created_at: '2026-09-25T08:00:00' },
    { id: 2, kind: 'assigned', task_id: 6, created_at: '2026-09-10T08:00:00' }, // too old
    { id: 3, kind: 'comment', task_id: 5, created_at: '2026-09-26T07:00:00' },
    { id: 4, kind: 'assigned', task_id: null, created_at: '2026-09-26T07:00:00' }, // deleted task
    { id: 5, kind: 'assigned', task_id: 7, created_at: '2026-09-26T07:30:00' },
  ];
  assert.deepStrictEqual(recentNotifications(items, 'assigned', { now: NOW }).map((n) => n.id), [5, 1]);
  assert.strictEqual(greeting(new Date(2026, 8, 26, 9)), 'Good morning');
  assert.strictEqual(greeting(new Date(2026, 8, 26, 20)), 'Good evening');
});
