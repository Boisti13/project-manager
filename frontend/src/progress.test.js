// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { progressByProject, combineProgress, percentDone } from './progress';

const NOW = new Date('2026-09-26T12:00:00Z').getTime();
let id = 0;
const t = (project_id, status = 'todo', deadline = null, extra = {}) => ({
  id: ++id, title: `t${id}`, project_id, status, deadline, parent_task_id: null, ...extra,
});

test('counts top-level tasks per project', () => {
  const tasks = [
    t(1, 'done'),
    t(1, 'done', '2026-09-01T00:00:00'), // done tasks are never overdue
    t(1, 'todo', '2026-09-20T00:00:00'), // overdue
    t(1, 'in_progress', '2026-09-29T00:00:00'), // due soon, next
    t(1, 'todo', '2026-10-20T00:00:00'),
    t(1, 'todo', null, { parent_task_id: 3 }), // subtask: ignored
    t(null, 'todo'), // no project: ignored
    t(2, 'todo', '2026-10-01T00:00:00'),
  ];
  const p = progressByProject(tasks, NOW);
  const one = p.get(1);
  assert.deepStrictEqual(
    [one.total, one.done, one.overdue, one.dueSoon, one.next.deadline],
    [5, 2, 1, 1, '2026-09-29T00:00:00']
  );
  assert.strictEqual(percentDone(one), 40);
  assert.strictEqual(p.has(null), false);

  const both = combineProgress([one, p.get(2), undefined]);
  assert.deepStrictEqual([both.total, both.done, both.dueSoon, both.next.deadline], [6, 2, 2, '2026-09-29T00:00:00']);
  assert.strictEqual(percentDone(combineProgress([])), 0);
});
