// Weekly review: what got done in a week, what's overdue, what's due the
// week after, and open work per project. Pure logic; WeeklyReview.js shows it.
import { parseServerDate } from './taskFilters';
import { remainingMinutes } from './estimate';

/** Monday 00:00 (local time) of the week containing `date`. */
export function weekStart(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** "2026-10-01T00:00:00" -> that day at local midnight. */
export function deadlineDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3]) : null;
}

/**
 * tasks: all tasks; start: weekStart(...); mine: only tasks assigned to userId.
 * projectOf(task) -> top-level project id or null (subtasks inherit);
 * childrenOf(task) -> subtasks (for estimates).
 */
export function buildReview(tasks, { start, userId = null, mine = false, now = new Date(), projectOf, childrenOf }) {
  const end = addDays(start, 7);
  const nextEnd = addDays(end, 7);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const scoped = mine ? tasks.filter((t) => t.assignee_id === userId) : tasks;
  const within = (value, from, to) => {
    const d = parseServerDate(value);
    return d !== null && d >= from && d < to;
  };
  const byDeadline = (a, b) => deadlineDay(a.deadline) - deadlineDay(b.deadline) || a.id - b.id;

  const done = scoped
    .filter((t) => t.status === 'done' && within(t.completed_at, start, end))
    .sort((a, b) => parseServerDate(a.completed_at) - parseServerDate(b.completed_at) || a.id - b.id);
  const created = scoped.filter((t) => within(t.created_at, start, end)).length;
  const open = scoped.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.deadline && deadlineDay(t.deadline) < today).sort(byDeadline);
  const dueNext = open
    .filter((t) => {
      const d = deadlineDay(t.deadline);
      return d && d >= end && d < nextEnd;
    })
    .sort(byDeadline);

  // Per top-level project; estimates over open tasks whose parent isn't
  // counted already (a task's own estimate covers its subtasks).
  const openIds = new Set(open.map((t) => t.id));
  const projects = new Map();
  const row = (key) => {
    if (!projects.has(key)) projects.set(key, { projectId: key, done: 0, open: 0, overdue: 0, minutes: 0 });
    return projects.get(key);
  };
  done.forEach((t) => (row(projectOf(t)).done += 1));
  open.forEach((t) => {
    const r = row(projectOf(t));
    r.open += 1;
    if (!openIds.has(t.parent_task_id)) r.minutes += remainingMinutes(t, childrenOf);
  });
  overdue.forEach((t) => (row(projectOf(t)).overdue += 1));

  return { start, end, done, created, overdue, dueNext, projects: [...projects.values()] };
}
