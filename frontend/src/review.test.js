// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { weekStart, addDays, buildReview } from './review';
import { childIndex } from './estimate';

test('weeks start on Monday', () => {
  assert.strictEqual(weekStart(new Date(2026, 8, 30)).toDateString(), new Date(2026, 8, 28).toDateString()); // Wed
  assert.strictEqual(weekStart(new Date(2026, 9, 4)).toDateString(), new Date(2026, 8, 28).toDateString()); // Sun
  assert.strictEqual(weekStart(new Date(2026, 8, 28)).toDateString(), new Date(2026, 8, 28).toDateString()); // Mon
  assert.strictEqual(addDays(new Date(2026, 8, 28), 7).toDateString(), new Date(2026, 9, 5).toDateString());
});

test('done, overdue, due next week and projects', () => {
  const start = new Date(2026, 8, 28); // Mon 28 Sep
  const utc = (d) => d.toISOString().slice(0, 19); // server timestamps: naive UTC
  const at = (day, h = 12) => utc(new Date(2026, 8, day, h));
  const tasks = [
    { id: 1, status: 'done', completed_at: at(29), created_at: at(20), project_id: 10, assignee_id: 1 },
    { id: 2, status: 'done', completed_at: at(27), created_at: at(20), project_id: 10, assignee_id: 1 }, // week before
    { id: 3, status: 'done', completed_at: at(30), created_at: at(29), project_id: null, parent_task_id: 5, assignee_id: 2 },
    { id: 4, status: 'todo', deadline: '2026-09-25T00:00:00', created_at: at(20), project_id: 10, assignee_id: 1, estimate_minutes: 60 },
    { id: 5, status: 'in_progress', deadline: '2026-10-06T00:00:00', created_at: at(28), project_id: 20, assignee_id: 2 },
    { id: 6, status: 'todo', created_at: at(29), project_id: null, parent_task_id: 5, estimate_minutes: 30, assignee_id: 1 },
    { id: 7, status: 'todo', deadline: '2026-10-20T00:00:00', created_at: at(1), project_id: 20, assignee_id: 1 },
  ];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const projectOf = (t) => {
    for (let cur = t; cur; cur = byId.get(cur.parent_task_id)) if (cur.project_id != null) return cur.project_id;
    return null;
  };
  const opts = { start, now: new Date(2026, 8, 30, 9), projectOf, childrenOf: childIndex(tasks) };

  const all = buildReview(tasks, opts);
  assert.deepStrictEqual(all.done.map((t) => t.id), [1, 3]);
  assert.strictEqual(all.created, 3); // 3, 5, 6
  assert.deepStrictEqual(all.overdue.map((t) => t.id), [4]);
  assert.deepStrictEqual(all.dueNext.map((t) => t.id), [5]); // 5–11 Oct
  const p = Object.fromEntries(all.projects.map((r) => [r.projectId, r]));
  assert.deepStrictEqual(p[10], { projectId: 10, done: 1, open: 1, overdue: 1, minutes: 60 });
  // 5 has no estimate: its open subtask 6 counts (once)
  assert.deepStrictEqual(p[20], { projectId: 20, done: 1, open: 3, overdue: 0, minutes: 30 });

  const mine = buildReview(tasks, { ...opts, mine: true, userId: 1 });
  assert.deepStrictEqual(mine.done.map((t) => t.id), [1]);
  assert.deepStrictEqual(mine.dueNext.map((t) => t.id), []);
  // 6 is mine but its parent isn't: it counts on its own
  assert.strictEqual(Object.fromEntries(mine.projects.map((r) => [r.projectId, r]))[20].minutes, 30);
});
