// Progress per project/category for the Projects page. Counts top-level
// tasks only (subtasks are a task's checklist), archived ones included.

const DAY_MS = 24 * 60 * 60 * 1000;

const empty = () => ({ total: 0, done: 0, overdue: 0, dueSoon: 0, next: null });

/** Map projectId -> { total, done, overdue, dueSoon, next: task | null } for
 *  the tasks directly in that project or category. */
export function progressByProject(tasks, now = Date.now()) {
  const out = new Map();
  for (const t of tasks) {
    if (t.parent_task_id != null || t.project_id == null) continue;
    if (!out.has(t.project_id)) out.set(t.project_id, empty());
    const s = out.get(t.project_id);
    s.total += 1;
    if (t.status === 'done') {
      s.done += 1;
      continue;
    }
    if (!t.deadline) continue;
    // Same rule as the "Overdue" / "Due this week" filters on the Tasks page.
    const due = new Date(t.deadline).getTime();
    if (due < now) s.overdue += 1;
    else {
      if (due <= now + 7 * DAY_MS) s.dueSoon += 1;
      if (!s.next || due < new Date(s.next.deadline).getTime()) s.next = t;
    }
  }
  return out;
}

/** Adds up several stats (a project and its categories). */
export function combineProgress(list) {
  const s = empty();
  for (const x of list) {
    if (!x) continue;
    s.total += x.total;
    s.done += x.done;
    s.overdue += x.overdue;
    s.dueSoon += x.dueSoon;
    if (x.next && (!s.next || new Date(x.next.deadline) < new Date(s.next.deadline))) s.next = x.next;
  }
  return s;
}

/** Whole percent done, 0 for an empty project. */
export function percentDone(s) {
  return s && s.total ? Math.round((s.done / s.total) * 100) : 0;
}
