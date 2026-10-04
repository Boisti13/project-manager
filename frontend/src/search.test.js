import { fold, searchAll } from './search';
import { buildProjectIndex } from './projects';

const projects = [
  { id: 1, name: '6GHub', parent_id: null },
  { id: 2, name: 'Ordering', parent_id: 1 },
  { id: 3, name: 'Trade fair 2025', parent_id: null, archived_at: '2026-09-01T00:00:00' },
  { id: 4, name: 'Größe & Maße', parent_id: null },
];
const index = buildProjectIndex(projects);
const tasks = [
  { id: 1, title: 'Order antenna modules', project_id: 2, parent_task_id: null, status: 'in_progress', deadline: '2026-09-20T00:00:00' },
  { id: 2, title: 'Confirm order date', project_id: null, parent_task_id: 1, status: 'todo' },
  { id: 3, title: 'Reorder cables', project_id: 2, parent_task_id: null, status: 'done' },
  { id: 4, title: 'Write guide', description: 'with photos of the antenna', project_id: 1, parent_task_id: null, status: 'todo' },
  { id: 5, title: 'Book booth', project_id: 3, parent_task_id: null, status: 'done' },
  { id: 6, title: 'Quiet task', project_id: null, parent_task_id: null, status: 'todo' },
  { id: 7, title: 'Straße messen', project_id: 4, parent_task_id: null, status: 'todo' },
];
const search = (q, extra = {}) => searchAll(q, { tasks, projectIndex: index, ...extra });
const titles = (r) => r.tasks.map((x) => x.task.title);

test('folding: case, accents, ß', () => {
  expect(fold('Größe Straße CAFÉ')).toBe('grosse strasse cafe');
});

test('title hits rank by where they start; open before done', () => {
  expect(titles(search('order'))).toEqual(['Order antenna modules', 'Confirm order date', 'Reorder cables']);
  expect(search('order').tasks[1].projectId).toBe(2); // the subtask's project is its parent's
});

test('every word has to match; descriptions and comments count less', () => {
  expect(titles(search('antenna'))).toEqual(['Order antenna modules', 'Write guide']);
  expect(search('antenna').tasks[1].where).toBe('description');
  expect(titles(search('order guide'))).toEqual([]);
  const r = search('lead time', { commentTaskIds: new Set([6]) });
  expect(r.tasks.map((x) => [x.task.title, x.where])).toEqual([['Quiet task', 'comment']]);
});

test('projects and categories by name or path; archived ones last', () => {
  expect(search('ordering').projects.map((p) => p.name)).toEqual(['Ordering']);
  expect(search('6ghub ord').projects.map((p) => p.name)).toEqual(['Ordering']); // "6GHub / Ordering"
  expect(search('strasse').tasks[0].task.title).toBe('Straße messen');
  expect(search('grosse').projects[0].name).toBe('Größe & Maße');
  const booth = search('book');
  expect(booth.tasks[0].task.title).toBe('Book booth'); // archived, but still found
});

test('limits and empty queries', () => {
  expect(search('  ')).toEqual({ tasks: [], projects: [], more: { tasks: 0, projects: 0 } });
  const r = searchAll('o', { tasks, projectIndex: index, limit: 2 });
  expect(r.tasks).toHaveLength(2);
  expect(r.more.tasks).toBeGreaterThan(0);
});
