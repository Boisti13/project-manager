// Pure helpers for the Board and Calendar views of the Tasks page.

export const BOARD_COLUMNS = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'blocked', label: 'Blocked' },
  { status: 'done', label: 'Done' },
];

/** Top-level tasks by status column, in the list's sort order; Done shows
 *  the most recently completed first. */
export function boardColumns(roots) {
  const cols = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.status, []]));
  for (const t of roots) (cols[t.status] || cols.todo).push(t);
  cols.done.sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || '') || b.id - a.id);
  return cols;
}

/** Every task the list would show (subtasks included) as a flat array:
 *  all of them without filters, only the matches with filters. */
export function flattenVisible(tree) {
  const out = [];
  const walk = (t) => {
    if (!tree.matchedIds || tree.matchedIds.has(t.id)) out.push(t);
    tree.childrenOf(t).forEach(walk);
  };
  tree.roots.forEach(walk);
  return out;
}

const pad = (n) => String(n).padStart(2, '0');

/** Local date -> "2026-09-26". */
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Deadlines are stored as dates at midnight ("2026-09-26T00:00:00"). */
export function deadlineKey(task) {
  return task.deadline ? task.deadline.slice(0, 10) : null;
}

/** Map "YYYY-MM-DD" -> tasks due that day (open ones first). */
export function tasksByDay(tasks) {
  const out = new Map();
  for (const t of tasks) {
    const key = deadlineKey(t);
    if (!key) continue;
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(t);
  }
  for (const list of out.values()) {
    list.sort((a, b) => (a.status === 'done') - (b.status === 'done') || (b.priority || 0) - (a.priority || 0) || a.id - b.id);
  }
  return out;
}

/** Weeks (Monday first) covering the given month: arrays of 7 Dates. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - ((first.getDay() + 6) % 7));
  const weeks = [];
  const d = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    weeks.push(week);
  } while (d.getMonth() === month);
  return weeks;
}
