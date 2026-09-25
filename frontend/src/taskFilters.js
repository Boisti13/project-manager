// Pure search/filter/sort logic for the task tree. No React in here so it
// can be reasoned about (and tested) on its own.

export const DEFAULT_FILTERS = {
  q: '',
  status: 'all', // all | open | todo | in_progress | blocked | done
  project: '', // '' | project id (string)
  assignee: '', // '' | 'me' | 'none' | user id (string)
  due: '', // '' | 'overdue' | 'week' | 'none'
  sort: 'manual', // manual | deadline | priority | created | title
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Server timestamps are naive UTC ("2026-09-25T19:38:08"); parse them as UTC. */
export function parseServerDate(value) {
  if (!value) return null;
  return new Date(/(?:[zZ]|[+-]\d\d:?\d\d)$/.test(value) ? value : value + 'Z');
}

export function filtersFromParams(params) {
  const f = { ...DEFAULT_FILTERS };
  for (const key of Object.keys(DEFAULT_FILTERS)) {
    const v = params.get(key);
    if (v !== null) f[key] = v;
  }
  return f;
}

export function filtersToParams(filters) {
  const out = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== DEFAULT_FILTERS[key]) out[key] = value;
  }
  return out;
}

export function hasActiveFilters(f) {
  return f.q.trim() !== '' || f.status !== 'all' || f.project !== '' || f.assignee !== '' || f.due !== '';
}

function matchesText(task, needle) {
  if (!needle) return true;
  return (
    (task.title || '').toLowerCase().includes(needle) ||
    (task.description || '').toLowerCase().includes(needle)
  );
}

function matchesStatus(task, status) {
  if (status === 'all') return true;
  if (status === 'open') return task.status !== 'done';
  return task.status === status;
}

function matchesAssignee(task, assignee, currentUserId) {
  if (assignee === '') return true;
  if (assignee === 'none') return task.assignee_id == null;
  if (assignee === 'me') return task.assignee_id === currentUserId;
  return String(task.assignee_id) === assignee;
}

function matchesDue(task, due, now) {
  if (due === '') return true;
  if (due === 'none') return !task.deadline;
  if (!task.deadline || task.status === 'done') return false;
  const d = new Date(task.deadline).getTime();
  if (due === 'overdue') return d < now;
  if (due === 'week') return d >= now && d <= now + 7 * DAY_MS;
  return true;
}

const byManual = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;

const SORTERS = {
  manual: byManual,
  // No deadline sorts last.
  deadline: (a, b) =>
    (a.deadline ? new Date(a.deadline).getTime() : Infinity) -
      (b.deadline ? new Date(b.deadline).getTime() : Infinity) || byManual(a, b),
  priority: (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || byManual(a, b),
  created: (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id,
  title: (a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }) || byManual(a, b),
};

/**
 * Builds the visible tree from the flat task list.
 *
 * Returns:
 *   roots        – visible root tasks, sorted
 *   childrenOf   – (task) => visible children, sorted
 *   matchedIds   – tasks that satisfy every filter (null when no filter is active)
 *   autoExpandIds – ancestors of matches, to be shown expanded
 *   totalRoots   – number of root tasks before filtering (archived excluded)
 *   archivedCount – archived root tasks currently hidden
 *   progressOf   – (task) => { done, total } over its direct subtasks
 *
 * Archiving: a done root task whose completed_at is more than
 * archiveAfterDays old is left out (with its subtasks), unless the user is
 * searching or filtering by status "done" — then everything is searchable.
 *
 * projectParentOf(projectId) returns the parent of a category (or null), so a
 * project filter also matches tasks in that project's categories.
 */
export function isArchived(task, archiveAfterDays, now = Date.now()) {
  if (task.status !== 'done' || !task.completed_at || !archiveAfterDays) return false;
  return parseServerDate(task.completed_at).getTime() < now - archiveAfterDays * DAY_MS;
}

export function buildTaskTree(
  tasks,
  filters,
  { currentUserId, now = Date.now(), projectParentOf = () => null, archiveAfterDays = null } = {}
) {
  const children = new Map();
  const byId = new Map();
  for (const t of tasks) {
    byId.set(t.id, t);
    const key = t.parent_task_id ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(t);
  }
  const sorter = SORTERS[filters.sort] || byManual;
  for (const list of children.values()) list.sort(sorter);

  const progressOf = (t) => {
    const kids = children.get(t.id) || [];
    return { done: kids.filter((k) => k.status === 'done').length, total: kids.length };
  };

  const showArchived = filters.q.trim() !== '' || filters.status === 'done';
  const everyRoot = children.get(null) || [];
  const allRoots = showArchived ? everyRoot : everyRoot.filter((t) => !isArchived(t, archiveAfterDays, now));
  const archivedCount = everyRoot.length - allRoots.length;
  const active = hasActiveFilters(filters);

  if (!active) {
    return {
      roots: allRoots,
      childrenOf: (t) => children.get(t.id) || [],
      matchedIds: null,
      autoExpandIds: new Set(),
      totalRoots: allRoots.length,
      archivedCount,
      progressOf,
    };
  }

  const needle = filters.q.trim().toLowerCase();
  const matchedIds = new Set();
  const visibleIds = new Set();
  const autoExpandIds = new Set();

  // Subtasks without their own project belong to their parent's project.
  const walk = (task, inheritedProject) => {
    const project = task.project_id ?? inheritedProject;
    const matches =
      matchesText(task, needle) &&
      matchesStatus(task, filters.status) &&
      // Filtering by a project includes its categories.
      (filters.project === '' ||
        String(project) === filters.project ||
        (project != null && String(projectParentOf(project)) === filters.project)) &&
      matchesAssignee(task, filters.assignee, currentUserId) &&
      matchesDue(task, filters.due, now);

    let childVisible = false;
    for (const child of children.get(task.id) || []) {
      if (walk(child, project)) childVisible = true;
    }
    if (matches) matchedIds.add(task.id);
    if (childVisible) autoExpandIds.add(task.id);
    const visible = matches || childVisible;
    if (visible) visibleIds.add(task.id);
    return visible;
  };
  allRoots.forEach((r) => walk(r, null));

  return {
    roots: allRoots.filter((t) => visibleIds.has(t.id)),
    childrenOf: (t) => (children.get(t.id) || []).filter((c) => visibleIds.has(c.id)),
    matchedIds,
    autoExpandIds,
    totalRoots: allRoots.length,
    archivedCount,
    progressOf,
  };
}

/** Splits text into [{text, hit}] parts around case-insensitive matches of needle. */
export function highlightParts(text, needle) {
  const n = (needle || '').trim().toLowerCase();
  if (!n || !text) return [{ text: text || '', hit: false }];
  const parts = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < text.length) {
    const j = lower.indexOf(n, i);
    if (j === -1) {
      parts.push({ text: text.slice(i), hit: false });
      break;
    }
    if (j > i) parts.push({ text: text.slice(i, j), hit: false });
    parts.push({ text: text.slice(j, j + n.length), hit: true });
    i = j + n.length;
  }
  return parts;
}
