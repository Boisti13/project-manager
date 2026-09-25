// Project tree helpers: colors, categories (one level of sub-projects) and
// grouping of tasks under their project. No React in here.

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
 * Returns [{ key, project, color, tasks, categories: [{ key, project, tasks }] }]
 * in project name order, with tasks that have no (known) project last under
 * project: null. `tasks` holds tasks directly on the project; category tasks
 * are under their category. Root order is preserved within each list.
 *
 * With includeEmpty, projects and categories without tasks are listed too.
 */
export function groupTasksByProject(roots, index, { includeEmpty = false } = {}) {
  const groups = new Map();
  const groupFor = (top) => {
    if (!groups.has(top.id)) {
      const cats = new Map(index.categoriesOf(top.id).map((c) => [c.id, { key: `c${c.id}`, project: c, tasks: [] }]));
      groups.set(top.id, { key: `p${top.id}`, project: top, color: index.colorOf(top.id), tasks: [], cats });
    }
    return groups.get(top.id);
  };

  if (includeEmpty) index.topLevel.forEach(groupFor);
  const none = { key: 'none', project: null, color: NO_PROJECT_COLOR, tasks: [], categories: [] };

  for (const task of roots) {
    const top = task.project_id != null ? index.topOf(task.project_id) : null;
    if (!top) {
      none.tasks.push(task);
      continue;
    }
    const g = groupFor(top);
    if (top.id === task.project_id) g.tasks.push(task);
    else g.cats.get(task.project_id)?.tasks.push(task);
  }

  const result = index.topLevel
    .filter((p) => groups.has(p.id))
    .map((p) => {
      const { cats, ...g } = groups.get(p.id);
      const categories = [...cats.values()].filter((c) => includeEmpty || c.tasks.length > 0);
      return { ...g, categories };
    })
    .filter((g) => includeEmpty || g.tasks.length > 0 || g.categories.length > 0);

  if (none.tasks.length > 0) result.push(none);
  return result;
}

export const groupTaskCount = (group) =>
  group.tasks.length + group.categories.reduce((n, c) => n + c.tasks.length, 0);
