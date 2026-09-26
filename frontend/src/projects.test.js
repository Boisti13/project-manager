// Run with `npm test` (react-scripts / Jest).
import assert from 'assert';
import { buildProjectIndex, groupTasksByProject, groupTaskCount, NO_PROJECT_COLOR } from './projects';
import { DEFAULT_FILTERS, buildTaskTree } from './taskFilters';

const projects = [
  { id: 1, name: '6GHub', color: '#2196f3', parent_id: null },
  { id: 2, name: 'Ordering', color: null, parent_id: 1 },
  { id: 3, name: 'General', color: null, parent_id: 1 },
  { id: 4, name: 'Documentation', color: '#ff0000', parent_id: 1 },
  { id: 5, name: 'Apartment', color: '#4caf50', parent_id: null },
  { id: 6, name: 'Orphan category', color: null, parent_id: 99 },
];
const t = (id, project_id, extra = {}) => ({
  id, title: `Task ${id}`, status: 'todo', order: 0, parent_task_id: null, project_id, ...extra,
});

test('project index: tree, colors, labels', () => {
  const idx = buildProjectIndex(projects);
  assert.deepStrictEqual(idx.topLevel.map((p) => p.name), ['6GHub', 'Apartment', 'Orphan category']);
  assert.deepStrictEqual(idx.categoriesOf(1).map((p) => p.name), ['Documentation', 'General', 'Ordering']);
  assert.strictEqual(idx.colorOf(2), '#2196f3'); // inherits
  assert.strictEqual(idx.colorOf(4), '#ff0000'); // own color wins
  assert.strictEqual(idx.colorOf(123), NO_PROJECT_COLOR);
  assert.strictEqual(idx.labelOf(2), '6GHub / Ordering');
  assert.strictEqual(idx.parentIdOf(2), 1);
  assert.strictEqual(idx.parentIdOf(1), null);
  assert.strictEqual(idx.parentIdOf(6), null); // missing parent -> top-level
});

test('grouping tasks under projects and categories', () => {
  const idx = buildProjectIndex(projects);
  const roots = [t(10, 2), t(11, 1), t(12, null), t(13, 3), t(14, 2), t(15, 777)];

  const groups = groupTasksByProject(roots, idx);
  assert.deepStrictEqual(groups.map((g) => g.key), ['p1', 'none']);
  const hub = groups[0];
  assert.deepStrictEqual(hub.tasks.map((x) => x.id), [11]);
  assert.deepStrictEqual(hub.categories.map((c) => [c.project.name, c.tasks.map((x) => x.id)]), [
    ['General', [13]],
    ['Ordering', [10, 14]], // input order kept
  ]);
  assert.strictEqual(groupTaskCount(hub), 4);
  // Unknown project ids end up under "No project".
  assert.deepStrictEqual(groups[1].tasks.map((x) => x.id), [12, 15]);

  // includeEmpty lists every project and category.
  const all = groupTasksByProject([], idx, { includeEmpty: true });
  assert.deepStrictEqual(all.map((g) => g.key), ['p1', 'p5', 'p6']);
  assert.strictEqual(all[0].categories.length, 3);
});

test('project filter includes categories; same title in two projects stays separate', () => {
  const idx = buildProjectIndex(projects);
  const tasks = [
    t(1, 1, { title: 'Order cables' }),
    t(2, 2, { title: 'Order cables' }),
    t(3, 5, { title: 'Order cables' }),
    t(4, null, { title: 'Order cables', parent_task_id: 2 }), // subtask inherits Ordering
  ];
  const run = (over) =>
    buildTaskTree(tasks, { ...DEFAULT_FILTERS, ...over }, { projectParentOf: idx.parentIdOf });

  assert.deepStrictEqual([...run({ project: '1' }).matchedIds].sort(), [1, 2, 4]);
  assert.deepStrictEqual([...run({ project: '2' }).matchedIds].sort(), [2, 4]);
  assert.deepStrictEqual([...run({ project: '5' }).matchedIds], [3]);

  const groups = groupTasksByProject(run({ q: 'order' }).roots, idx);
  assert.deepStrictEqual(
    groups.map((g) => [g.project.name, g.tasks.map((x) => x.id), g.categories.map((c) => c.tasks.map((x) => x.id))]),
    [
      ['6GHub', [1], [[2]]],
      ['Apartment', [3], []],
    ]
  );
});

test('done tasks split into completed (newest first) and archived tasks hidden', () => {
  const idx = buildProjectIndex(projects);
  const NOW = Date.parse('2026-09-25T12:00:00Z');
  const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString().replace('Z', ''); // naive UTC like the API
  const tasks = [
    t(1, 2, { title: 'open' }),
    t(2, 2, { status: 'done', completed_at: daysAgo(1) }),
    t(3, 2, { status: 'done', completed_at: daysAgo(5) }),
    t(4, 2, { status: 'done', completed_at: daysAgo(40) }), // archived with 30 days
    t(5, 2, { status: 'done', completed_at: daysAgo(3) }),
    t(6, null, { title: 'sub of archived', parent_task_id: 4 }),
    t(7, 2, { title: 'parent' }),
    t(8, null, { status: 'done', parent_task_id: 7 }),
    t(9, null, { status: 'todo', parent_task_id: 7 }),
  ];
  const run = (over) =>
    buildTaskTree(tasks, { ...DEFAULT_FILTERS, ...over }, { archiveAfterDays: 30, now: NOW, projectParentOf: idx.parentIdOf });

  let tree = run({});
  assert.strictEqual(tree.archivedCount, 1);
  assert.ok(!tree.roots.some((r) => r.id === 4));
  const ordering = groupTasksByProject(tree.roots, idx)[0].categories[0];
  assert.strictEqual(ordering.project.name, 'Ordering');
  assert.deepStrictEqual(ordering.tasks.map((x) => x.id), [1, 7]);
  assert.deepStrictEqual(ordering.completed.map((x) => x.id), [2, 5, 3]); // most recent first
  assert.deepStrictEqual(tree.progressOf(tasks[6]), { done: 1, total: 2 });

  // Searching or filtering by "done" brings archived tasks back.
  tree = run({ status: 'done' });
  assert.strictEqual(tree.archivedCount, 0);
  assert.ok(tree.roots.some((r) => r.id === 4));
  tree = run({ q: 'sub of archived' });
  assert.deepStrictEqual(tree.roots.map((r) => r.id), [4]);

  // No setting loaded yet -> nothing archived.
  assert.strictEqual(buildTaskTree(tasks, DEFAULT_FILTERS, { now: NOW }).archivedCount, 0);
});

test('server dates are parsed as UTC', () => {
  const { parseServerDate } = require('./taskFilters');
  assert.strictEqual(parseServerDate('2026-09-25T10:00:00').toISOString(), '2026-09-25T10:00:00.000Z');
  assert.strictEqual(parseServerDate('2026-09-25T10:00:00Z').toISOString(), '2026-09-25T10:00:00.000Z');
  assert.strictEqual(parseServerDate('2026-09-25T10:00:00+02:00').toISOString(), '2026-09-25T08:00:00.000Z');
  assert.strictEqual(parseServerDate(null), null);
});

test('a task whose subtasks are all done stays open until it is ticked itself', () => {
  const idx = buildProjectIndex(projects);
  const tasks = [
    t(1, 2, { title: 'parent' }),
    t(2, null, { status: 'done', parent_task_id: 1 }),
    t(3, null, { status: 'done', parent_task_id: 1 }),
  ];
  let tree = buildTaskTree(tasks, DEFAULT_FILTERS, { projectParentOf: idx.parentIdOf });
  assert.deepStrictEqual(tree.progressOf(tasks[0]), { done: 2, total: 2 });
  let ordering = groupTasksByProject(tree.roots, idx)[0].categories[0];
  assert.deepStrictEqual(ordering.tasks.map((x) => x.id), [1]); // open, not completed
  assert.deepStrictEqual(ordering.completed, []);

  // Ticking the parent is what moves it.
  tasks[0] = { ...tasks[0], status: 'done', completed_at: '2026-09-25T10:00:00' };
  tree = buildTaskTree(tasks, DEFAULT_FILTERS, { projectParentOf: idx.parentIdOf });
  ordering = groupTasksByProject(tree.roots, idx)[0].categories[0];
  assert.deepStrictEqual(ordering.completed.map((x) => x.id), [1]);

  // A new open subtask on a ready task: progress drops again.
  const more = [...tasks.slice(1), t(1, 2, { title: 'parent' }), t(4, null, { parent_task_id: 1 })];
  tree = buildTaskTree(more, DEFAULT_FILTERS, { projectParentOf: idx.parentIdOf });
  assert.deepStrictEqual(tree.progressOf(more.find((x) => x.id === 1)), { done: 2, total: 3 });
});

test('search also matches tasks by their comments', () => {
  const tasks = [t(1, 1, { title: 'Order modules' }), t(2, 1, { title: 'Other' }), t(3, null, { title: 'Sub', parent_task_id: 2 })];
  const run = (ids) => buildTaskTree(tasks, { ...DEFAULT_FILTERS, q: 'supplier' }, { commentMatchIds: ids });
  assert.deepStrictEqual(run(null).roots, []);
  assert.deepStrictEqual([...run(new Set([1])).matchedIds], [1]);
  // A comment on a subtask brings its parent along, auto-expanded.
  const r = run(new Set([3]));
  assert.deepStrictEqual(r.roots.map((x) => x.id), [2]);
  assert.ok(r.autoExpandIds.has(2));
});

test('private projects: categories follow, only members are assignable', () => {
  const idx = buildProjectIndex([
    { id: 1, name: 'Secret', parent_id: null, is_private: true, member_ids: [10] },
    { id: 2, name: 'Inner', parent_id: 1 },
    { id: 3, name: 'Open', parent_id: null },
  ]);
  const users = [{ id: 10, is_admin: false }, { id: 11, is_admin: false }, { id: 12, is_admin: true }];
  assert.strictEqual(idx.isPrivate(2), true);
  assert.strictEqual(idx.isPrivate(3), false);
  assert.deepStrictEqual(idx.assignableUsers(2, users).map((u) => u.id), [10, 12]);
  assert.strictEqual(idx.assignableUsers(3, users).length, 3);
  assert.strictEqual(idx.assignableUsers(null, users).length, 3);
});
