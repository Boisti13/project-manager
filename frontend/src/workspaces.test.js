import { nextWorkspaceId, workspaceOf, workspaceScope } from './workspaces';
import { buildProjectIndex, withinScope } from './projects';

const data = {
  workspaces: [
    { id: 1, name: 'Work', color: '#2196f3', position: 0, project_ids: [10] },
    { id: 2, name: 'Private', color: '#4caf50', position: 1, project_ids: [20] },
  ],
  unassigned_everywhere: true,
};
const projects = [
  { id: 10, name: 'Office', parent_id: null },
  { id: 11, name: 'Office / Ordering', parent_id: 10 },
  { id: 20, name: 'Garden', parent_id: null },
  { id: 30, name: 'Loose', parent_id: null },
  { id: 40, name: 'Old work', parent_id: null, archived_at: '2026-09-01T00:00:00' },
];
const tasks = [
  { id: 1, title: 'Report', project_id: 10, parent_task_id: null },
  { id: 2, title: 'Order cables', project_id: 11, parent_task_id: null },
  { id: 3, title: 'subtask of Report', project_id: null, parent_task_id: 1 },
  { id: 4, title: 'Mow', project_id: 20, parent_task_id: null },
  { id: 5, title: 'Loose task', project_id: 30, parent_task_id: null },
  { id: 6, title: 'No project', project_id: null, parent_task_id: null },
];
const titles = (list) => list.map((x) => x.title);

test('All (or a deleted workspace) shows everything', () => {
  expect(workspaceScope(data, null)).toBeNull();
  expect(workspaceScope(data, 99)).toBeNull();
  expect(workspaceScope({ workspaces: [] }, 1)).toBeNull();
  const index = buildProjectIndex(projects, null);
  expect(index.scoped).toBe(false);
  expect(withinScope(tasks, index)).toBe(tasks);
});

test('a workspace shows its projects, categories, subtasks — and unfiled ones when set to', () => {
  const index = buildProjectIndex(projects, workspaceScope(data, 1));
  expect(index.topLevel.map((p) => p.name)).toEqual(['Loose', 'Office']);
  expect(index.inScope(11)).toBe(true); // category follows its project
  expect(index.inScope(20)).toBe(false);
  expect(titles(withinScope(tasks, index))).toEqual(['Report', 'Order cables', 'subtask of Report', 'Loose task', 'No project']);

  const strict = buildProjectIndex(projects, workspaceScope({ ...data, unassigned_everywhere: false }, 2));
  expect(strict.topLevel.map((p) => p.name)).toEqual(['Garden']);
  expect(strict.archived).toEqual([]); // the archived project isn't filed anywhere
  expect(titles(withinScope(tasks, strict))).toEqual(['Mow']);
});

test('archived projects follow the workspace too', () => {
  const filed = { ...data, workspaces: [{ ...data.workspaces[0], project_ids: [10, 40] }, data.workspaces[1]] };
  expect(buildProjectIndex(projects, workspaceScope(filed, 1)).archived.map((p) => p.name)).toEqual(['Old work']);
  expect(buildProjectIndex(projects, workspaceScope(filed, 2)).archived).toEqual([]);
});

test('workspaceOf and switching through', () => {
  expect(workspaceOf(data, 20).name).toBe('Private');
  expect(workspaceOf(data, 30)).toBeNull();
  const list = data.workspaces;
  expect(nextWorkspaceId(list, null)).toBe(1);
  expect(nextWorkspaceId(list, 1)).toBe(2);
  expect(nextWorkspaceId(list, 2)).toBeNull();
  expect(nextWorkspaceId(list, 99)).toBe(null); // unknown: back to All
});
