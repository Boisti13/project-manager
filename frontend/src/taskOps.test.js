// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { withDescendants, topmost, bulkChanges, siblingsOf, reorderUpdates, sameQuery } from './taskOps';

const task = (id, fields = {}) => ({
  id, title: `T${id}`, parent_task_id: null, project_id: 1, status: 'todo', priority: 0, order: 0,
  deadline: null, assignee_id: null, label_ids: [], ...fields,
});

test('subtrees: descendants at any depth, and the topmost of a selection', () => {
  const tasks = [task(1), task(2, { parent_task_id: 1 }), task(3, { parent_task_id: 2 }), task(4), task(5, { parent_task_id: 4 })];
  assert.deepStrictEqual([...withDescendants(tasks, [1])].sort(), [1, 2, 3]);
  assert.deepStrictEqual([...withDescendants(tasks, [2, 4])].sort(), [2, 3, 4, 5]);
  // 3 is under 1; 99 doesn't exist
  assert.deepStrictEqual(topmost(tasks, [3, 1, 5, 99]).map((x) => x.id), [1, 5]);
});

test('bulk changes: only where something changes, with what each had before', () => {
  const tasks = [
    task(1, { priority: 1, label_ids: [7] }),
    task(2, { priority: 3, deadline: '2026-10-01T00:00:00' }),
    task(3, { priority: 0 }),
  ];
  const sel = new Set([1, 2]);
  assert.deepStrictEqual(bulkChanges(tasks, sel, { field: 'priority', value: '3' }), {
    updates: [{ id: 1, priority: 3 }],
    before: [{ id: 1, priority: 1 }],
  });
  assert.deepStrictEqual(bulkChanges(tasks, sel, { field: 'add_label', value: '7' }).updates, [{ id: 2, label_ids: [7] }]);
  assert.deepStrictEqual(bulkChanges(tasks, sel, { field: 'remove_label', value: '7' }), {
    updates: [{ id: 1, label_ids: [] }],
    before: [{ id: 1, label_ids: [7] }],
  });
  assert.deepStrictEqual(bulkChanges(tasks, sel, { field: 'deadline', value: null }).updates, [{ id: 2, deadline: null }]);
  assert.deepStrictEqual(bulkChanges(tasks, sel, { field: 'deadline', value: '2026-10-09' }).updates.map((u) => u.deadline), [
    '2026-10-09T00:00:00',
    '2026-10-09T00:00:00',
  ]);
  assert.deepStrictEqual(bulkChanges(tasks, sel, { field: 'assignee_id', value: 'none' }).updates, []); // nobody already
  assert.deepStrictEqual(bulkChanges(tasks, sel, { field: 'project_id', value: 'none' }).before, [
    { id: 1, project_id: 1 },
    { id: 2, project_id: 1 },
  ]);
});

test('siblings and reordering', () => {
  const tasks = [
    task(1, { order: 0 }),
    task(2, { order: 1 }),
    task(3, { order: 2 }),
    task(4, { order: 3, status: 'done' }), // completed section: not a sibling for Move up/down
    task(5, { project_id: 2 }),
    task(6, { parent_task_id: 1 }),
  ];
  assert.deepStrictEqual(siblingsOf(tasks, tasks[1]).map((x) => x.id), [1, 2, 3]);
  // 3 dropped on 1: 3 first, the others shift down (4 keeps its place)
  const oneProject = tasks.filter((x) => x.project_id === 1);
  assert.deepStrictEqual(reorderUpdates(oneProject, 3, 1), [
    { id: 3, order: 0 },
    { id: 1, order: 1 },
    { id: 2, order: 2 },
  ]);
  assert.deepStrictEqual(reorderUpdates(tasks, 1, 5), []); // other project
  assert.deepStrictEqual(reorderUpdates(tasks, 6, 2), []); // other parent
});

test('same query in any order', () => {
  assert.ok(sameQuery('assignee=me&sort=deadline', 'sort=deadline&assignee=me'));
  assert.ok(!sameQuery('assignee=me', 'assignee=me&label=2'));
});
