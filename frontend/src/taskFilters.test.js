import assert from 'assert';
import {
  DEFAULT_FILTERS, buildTaskTree, filtersFromParams, filtersToParams, hasActiveFilters, highlightParts,
} from './taskFilters';

// Run with `npm test` (react-scripts / Jest).

const NOW = Date.parse('2026-09-25T12:00:00Z');
const day = (n) => new Date(NOW + n * 86400000).toISOString();
const t = (id, extra) => ({
  id, title: `Task ${id}`, description: null, status: 'todo', priority: 0, order: 0,
  deadline: null, created_at: day(-id), project_id: null, parent_task_id: null, assignee_id: null, ...extra,
});

const tasks = [
  t(1, { title: 'Website relaunch', project_id: 10, order: 1 }),
  t(2, { title: 'Design mockups', parent_task_id: 1, status: 'done', assignee_id: 7 }),
  t(3, { title: 'Write copy', parent_task_id: 1, description: 'Landing page TEXT', deadline: day(-2) }),
  t(4, { title: 'Fix login bug', parent_task_id: 3, status: 'blocked', assignee_id: 5, deadline: day(3) }),
  t(5, { title: 'Taxes', order: 0, priority: 3, deadline: day(10) }),
  t(6, { title: 'Groceries', order: 2, project_id: 20, status: 'in_progress', assignee_id: 5 }),
];
const f = (over) => ({ ...DEFAULT_FILTERS, ...over });
const ids = (list) => list.map((x) => x.id);
const run = (over) => buildTaskTree(tasks, f(over), { currentUserId: 5, now: NOW });

test('buildTaskTree, URL params and highlighting', () => {
  // No filters: all roots in manual order, nothing matched/expanded.
  let r = run({});
  assert.deepStrictEqual(ids(r.roots), [5, 1, 6]);
  assert.strictEqual(r.matchedIds, null);
  assert.deepStrictEqual(ids(r.childrenOf(tasks[0])), [2, 3]);
  assert.strictEqual(r.totalRoots, 3);

  // Search finds a deep subtask; ancestors visible + auto-expanded but not "matched".
  r = run({ q: 'LOGIN' });
  assert.deepStrictEqual(ids(r.roots), [1]);
  assert.deepStrictEqual([...r.matchedIds], [4]);
  assert.deepStrictEqual([...r.autoExpandIds].sort(), [1, 3]);
  assert.deepStrictEqual(ids(r.childrenOf(tasks[0])), [3]); // sibling 2 hidden
  // Search also matches description.
  assert.deepStrictEqual([...run({ q: 'landing' }).matchedIds], [3]);

  // Status 'open' excludes done; 'blocked' reaches into subtasks.
  assert.ok(!run({ status: 'open' }).matchedIds.has(2));
  assert.deepStrictEqual([...run({ status: 'blocked' }).matchedIds], [4]);

  // Project is inherited by subtasks without their own project.
  r = run({ project: '10' });
  assert.deepStrictEqual(ids(r.roots), [1]);
  assert.deepStrictEqual([...r.matchedIds].sort(), [1, 2, 3, 4]);

  // Assignee: me / none / specific user.
  assert.deepStrictEqual([...run({ assignee: 'me' }).matchedIds].sort(), [4, 6]);
  assert.deepStrictEqual([...run({ assignee: '7' }).matchedIds], [2]);
  assert.ok(run({ assignee: 'none' }).matchedIds.has(5));

  // Deadlines: overdue, due within a week (not done), none.
  assert.deepStrictEqual([...run({ due: 'overdue' }).matchedIds], [3]);
  assert.deepStrictEqual([...run({ due: 'week' }).matchedIds], [4]);
  assert.ok(!run({ due: 'none' }).matchedIds.has(5));

  // Filters combine with AND.
  assert.deepStrictEqual([...run({ assignee: 'me', status: 'blocked' }).matchedIds], [4]);
  assert.deepStrictEqual(ids(run({ q: 'zzz' }).roots), []);

  // Sorting applies at every level.
  assert.deepStrictEqual(ids(run({ sort: 'priority' }).roots), [5, 1, 6]);
  assert.deepStrictEqual(ids(run({ sort: 'title' }).roots), [6, 5, 1]);
  assert.deepStrictEqual(ids(run({ sort: 'deadline' }).roots), [5, 1, 6]);
  assert.deepStrictEqual(ids(run({ sort: 'created' }).roots), [1, 5, 6]);
  assert.deepStrictEqual(ids(run({ sort: 'title' }).childrenOf(tasks[0])), [2, 3]);
  // Sort alone is not a filter.
  assert.strictEqual(hasActiveFilters(f({ sort: 'title' })), false);

  // URL round trip only keeps non-defaults.
  const params = filtersToParams(f({ q: 'x', sort: 'priority' }));
  assert.deepStrictEqual(params, { q: 'x', sort: 'priority' });
  assert.deepStrictEqual(filtersFromParams(new URLSearchParams(params)), f({ q: 'x', sort: 'priority' }));

  // Highlighting.
  assert.deepStrictEqual(highlightParts('Fix login LOGIN', 'login'), [
    { text: 'Fix ', hit: false }, { text: 'login', hit: true }, { text: ' ', hit: false }, { text: 'LOGIN', hit: true },
  ]);
  assert.deepStrictEqual(highlightParts('abc', ''), [{ text: 'abc', hit: false }]);
});
