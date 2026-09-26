// Project tree helpers: colors, categories (one level of sub-projects) and
// grouping of tasks under their project. No React in here.
import { parseServerDate } from './taskFilters';

// Kept in sync with PALETTE in backend/app/routers/projects.py.
export const PROJECT_COLORS = [
  '#2196f3', '#4caf50', '#ff9800', '#9c27b0', '#e91e63', '#009688',
  '#f44336', '#3f51b5', '#795548', '#00bcd4', '#8bc34a', '#607d8b',
];

export const NO_PROJECT_COLOR = '#9e9e9e';

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.id - b.id;

export function buildProjectIndex(projects) {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const children = new Map();
  const topLevel = [];
  for (const p of projects) {
    // A category whose parent is missing is treated as top-level.
    if (p.parent_id != null && byId.has(p.parent_id)) {
      if (!children.has(p.parent_id)) children.set(p.parent_id, []);
      children.get(p.parent_id).push(p);
    } else {
      topLevel.push(p);
    }
  }
  topLevel.sort(byName);
  for (const list of children.values()) list.sort(byName);

  const topOf = (id) => {
    const p = byId.get(id);
    if (!p) return null;
    return p.parent_id != null && byId.has(p.parent_id) ? byId.get(p.parent_id) : p;
  };

  return {
    byId,
    topLevel,
    categoriesOf: (id) => children.get(id) || [],
    topOf,
    parentIdOf: (id) => {
      const p = byId.get(id);
      return p && p.parent_id != null && byId.has(p.parent_id) ? p.parent_id : null;
    },
    // Private projects: only members (and admins) see them; categories
    // follow their project.
    isPrivate: (id) => !!topOf(id)?.is_private,
    /** Users who may be assigned tasks in project `id` (all when it's public). */
    assignableUsers: (id, users) => {
      const top = topOf(id);
      if (!top || !top.is_private) return users;
      const members = new Set(top.member_ids || []);
      return users.filter((u) => members.has(u.id) || u.is_admin);
    },
    colorOf: (id) => {
      const p = byId.get(id);
      if (!p) return NO_PROJECT_COLOR;
      return p.color || topOf(id)?.color || NO_PROJECT_COLOR;
    },
    labelOf: (id) => {
      const p = byId.get(id);
      if (!p) return '';
      const top = topOf(id);
      return top && top.id !== p.id ? `${top.name} / ${p.name}` : p.name;
    },
  };
}

/**
 * Groups root tasks by their project.
 *
 * Returns [{ key, project, color, tasks, completed,
 *            categories: [{ key, project, tasks, completed }] }]
 * in project name order, with tasks that have no (known) project last under
 * project: null. `tasks` holds open tasks directly on the project (root order
 * preserved), `completed` the done ones, most recently completed first;
 * category tasks are under their category.
 *
 * With includeEmpty, projects and categories without tasks are listed too.
 */
export function groupTasksByProject(roots, index, { includeEmpty = false } = {}) {
  const groups = new Map();
  const groupFor = (top) => {
    if (!groups.has(top.id)) {
      const cats = new Map(
        index.categoriesOf(top.id).map((c) => [c.id, { key: `c${c.id}`, project: c, tasks: [], completed: [] }])
      );
      groups.set(top.id, { key: `p${top.id}`, project: top, color: index.colorOf(top.id), tasks: [], completed: [], cats });
    }
    return groups.get(top.id);
  };

  if (includeEmpty) index.topLevel.forEach(groupFor);
  const none = { key: 'none', project: null, color: NO_PROJECT_COLOR, tasks: [], completed: [], categories: [] };
  const add = (bucket, task) => (task.status === 'done' ? bucket.completed : bucket.tasks).push(task);

  for (const task of roots) {
    const top = task.project_id != null ? index.topOf(task.project_id) : null;
    if (!top) {
      add(none, task);
      continue;
    }
    const g = groupFor(top);
    if (top.id === task.project_id) add(g, task);
    else if (g.cats.has(task.project_id)) add(g.cats.get(task.project_id), task);
  }

  const completedTime = (t) => parseServerDate(t.completed_at)?.getTime() ?? 0;
  const byCompleted = (a, b) => completedTime(b) - completedTime(a) || b.id - a.id;
  const hasAny = (b) => b.tasks.length > 0 || b.completed.length > 0;

  const result = index.topLevel
    .filter((p) => groups.has(p.id))
    .map((p) => {
      const { cats, ...g } = groups.get(p.id);
      const categories = [...cats.values()].filter((c) => includeEmpty || hasAny(c));
      return { ...g, categories };
    })
    .filter((g) => includeEmpty || hasAny(g) || g.categories.length > 0);

  if (hasAny(none)) result.push(none);
  for (const g of result) {
    g.completed.sort(byCompleted);
    g.categories.forEach((c) => c.completed.sort(byCompleted));
  }
  return result;
}

/** Open (not done) root tasks in a project section, categories included. */
export const groupTaskCount = (group) =>
  group.tasks.length + group.categories.reduce((n, c) => n + c.tasks.length, 0);
