// Sections of the "My day" page. No React in here.
import { isWaiting } from './dependencies';
import { parseServerDate } from './taskFilters';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const byDeadline = (a, b) =>
  new Date(a.deadline) - new Date(b.deadline) || (b.priority || 0) - (a.priority || 0) || a.id - b.id;
const byPriority = (a, b) => (b.priority || 0) - (a.priority || 0) || a.id - b.id;

/**
 * Open tasks (subtasks included) that are the user's: assigned to them, or
 * unassigned when includeUnassigned. Deadlines are dates (midnight), so
 * "overdue" means before today and "today" means today's date.
 */
export function buildMyDay(tasks, { userId, now = Date.now(), includeUnassigned = true } = {}) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const mine = tasks.filter(
    (t) => t.status !== 'done' && (t.assignee_id === userId || (includeUnassigned && t.assignee_id == null))
  );
  const today = startOfDay(now);
  const tomorrow = today + DAY_MS;
  const weekEnd = today + 8 * DAY_MS; // the next 7 days after today
  const due = (t) => (t.deadline ? new Date(t.deadline).getTime() : null);

  const overdue = mine.filter((t) => due(t) !== null && due(t) < today).sort(byDeadline);
  const dueToday = mine.filter((t) => due(t) !== null && due(t) >= today && due(t) < tomorrow).sort(byDeadline);
  const thisWeek = mine.filter((t) => due(t) !== null && due(t) >= tomorrow && due(t) < weekEnd).sort(byDeadline);
  const inProgress = mine.filter((t) => t.status === 'in_progress').sort(byPriority);
  const waiting = mine.filter((t) => isWaiting(t, byId)).sort(byPriority);
  return { overdue, dueToday, thisWeek, inProgress, waiting };
}

/** Notifications of `kind` from the last `days` days, newest first. */
export function recentNotifications(items, kind, { now = Date.now(), days = 7 } = {}) {
  return items
    .filter((n) => n.kind === kind && n.task_id && parseServerDate(n.created_at)?.getTime() >= now - days * DAY_MS)
    .sort((a, b) => parseServerDate(b.created_at) - parseServerDate(a.created_at));
}

/** "Good morning" etc. by local hour. */
export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
