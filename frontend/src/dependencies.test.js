// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { buildDependencyIndex, blockerSuggestions } from './dependencies';
import { buildTaskTree, DEFAULT_FILTERS } from './taskFilters';

const tasks = [
  { id: 1, title: 'Get quote', status: 'done', parent_task_id: null },
  { id: 2, title: 'Order parts', status: 'todo', parent_task_id: null },
  { id: 3, title: 'Build it', status: 'todo', parent_task_id: null, blocked_by_ids: [1, 2, 99] },
  { id: 4, title: 'Test it', status: 'todo', parent_task_id: null, blocked_by_ids: [1] },
];

test('open blockers and who waits for a task', () => {
  const idx = buildDependencyIndex(tasks);
  assert.deepStrictEqual(idx.blockersOf(tasks[2]).map((t) => t.id), [1, 2]); // unknown ids skipped
  assert.deepStrictEqual(idx.openBlockersOf(tasks[2]).map((t) => t.id), [2]);
  assert.deepStrictEqual(idx.openBlockersOf(tasks[3]), []);
  assert.deepStrictEqual(idx.waitingFor(tasks[0]).map((t) => t.id), [3, 4]);
});

test('status filter "waiting"', () => {
  const tree = buildTaskTree(tasks, { ...DEFAULT_FILTERS, status: 'waiting' });
  assert.deepStrictEqual(tree.roots.map((t) => t.id), [3]);
});

test('blocker suggestions: not itself, not chosen, open first, best match first', () => {
  const s = blockerSuggestions(tasks, tasks[2], 'it', [4]);
  assert.deepStrictEqual(s.map((t) => t.id), []); // "Build it" is itself, "Test it" already chosen
  assert.deepStrictEqual(blockerSuggestions(tasks, tasks[3], '').map((t) => t.id), [3, 2, 1]);
  assert.deepStrictEqual(blockerSuggestions(tasks, null, 'order').map((t) => t.id), [2]);
});
