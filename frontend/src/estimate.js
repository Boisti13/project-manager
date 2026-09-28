// Time estimates: tasks store minutes (estimate_minutes); people type and read
// hours and minutes.

export const ESTIMATE_MAX = 60 * 24 * 365;

const HOURS = '(?:h|hr|hrs|hours?|std\\.?|stunden?)';
const MINUTES = '(?:m|min|mins|minutes?|minuten?)';

/**
 * "1.5", "1,5", "1.5h", "90m", "90 min", "1h 30m", "1h30", "1:30", "2 Std"
 * -> minutes. A bare number means hours. Returns null for empty text and NaN
 * for text that isn't an estimate (or is 0 / too large).
 */
export function parseEstimate(text) {
  const s = (text || '').trim().toLowerCase().replace(/,/g, '.');
  if (!s) return null;
  let minutes;
  let m;
  if ((m = /^(\d+):([0-5]\d)$/.exec(s))) {
    minutes = +m[1] * 60 + +m[2];
  } else if ((m = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${HOURS}?$`).exec(s))) {
    minutes = +m[1] * 60;
  } else if ((m = new RegExp(`^(\\d+)\\s*${MINUTES}$`).exec(s))) {
    minutes = +m[1];
  } else if ((m = new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${HOURS}\\s*(\\d+)\\s*(?:${MINUTES})?$`).exec(s))) {
    minutes = +m[1] * 60 + +m[2];
  } else {
    return NaN;
  }
  minutes = Math.round(minutes);
  return minutes >= 1 && minutes <= ESTIMATE_MAX ? minutes : NaN;
}

/** 90 -> "1h 30min", 45 -> "45min", 480 -> "8h". */
export function formatEstimate(minutes) {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}min`;
  return m ? `${h}h ${m}min` : `${h}h`;
}

/**
 * Remaining work of a task in minutes: 0 when done; its own estimate when it
 * has one (it covers its subtasks); otherwise the sum over its subtasks.
 * childrenOf(task) -> subtasks.
 */
export function remainingMinutes(task, childrenOf) {
  if (task.status === 'done') return 0;
  if (task.estimate_minutes) return task.estimate_minutes;
  return childrenOf(task).reduce((sum, c) => sum + remainingMinutes(c, childrenOf), 0);
}

/** Sum of remainingMinutes over a list of (root) tasks. */
export function totalRemaining(tasks, childrenOf) {
  return tasks.reduce((sum, t) => sum + remainingMinutes(t, childrenOf), 0);
}

/** childrenOf over the full task list (not just what a filter shows). */
export function childIndex(tasks) {
  const kids = new Map();
  for (const t of tasks) {
    if (t.parent_task_id == null) continue;
    if (!kids.has(t.parent_task_id)) kids.set(t.parent_task_id, []);
    kids.get(t.parent_task_id).push(t);
  }
  return (task) => kids.get(task.id) || [];
}
