// The timeline view (components/TaskTimeline.js): which tasks get a bar, the
// date range shown, and moving dates by dragging. Dates are whole days in
// local time, like deadlines everywhere else.

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-10-05T00:00:00" -> that day at local midnight (null if empty). */
export function toDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
  return m ? new Date(+m[1], m[2] - 1, +m[3]) : null;
}

/** Local day -> "2026-10-05T00:00:00" (how the API takes dates). */
export function toApi(day) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}T00:00:00`;
}

export function addDays(day, n) {
  const d = new Date(day);
  d.setDate(d.getDate() + n);
  return d;
}

/** Whole days from a to b (also across daylight-saving changes). */
export const daysBetween = (a, b) => Math.round((b - a) / DAY_MS);

/**
 * A task's place on the timeline: a bar from start to deadline, a milestone
 * (◆) on the deadline when there's no start, a one-day bar when there's only
 * a start; null without dates.
 */
export function spanOf(task) {
  const end = toDay(task.deadline);
  const start = toDay(task.start_date);
  if (end && start && start <= end) return { start, end, milestone: false, open: false };
  if (end) return { start: end, end, milestone: true, open: false };
  if (start) return { start, end: start, milestone: false, open: true }; // no deadline yet
  return null;
}

/**
 * The days to show: every span plus today, with some room around it, at
 * least `minDays` long, starting on a Monday.
 */
export function timelineRange(spans, today, { before = 3, after = 10, minDays = 35 } = {}) {
  let first = today;
  let last = today;
  for (const s of spans) {
    if (s.start < first) first = s.start;
    if (s.end > last) last = s.end;
  }
  let start = addDays(first, -before);
  start = addDays(start, -((start.getDay() + 6) % 7)); // back to Monday
  const days = Math.max(minDays, daysBetween(start, addDays(last, after)) + 1);
  return { start, days };
}

/**
 * New dates after dragging a task's bar by `delta` days: 'move' shifts both,
 * 'start' / 'end' one edge (never past the other). Returns the fields to save.
 */
export function draggedDates(task, delta, edge = 'move') {
  const span = spanOf(task);
  if (!span || !delta) return null;
  if (span.milestone) return { deadline: toApi(addDays(span.end, delta)) };
  if (span.open) return { start_date: toApi(addDays(span.start, delta)) };
  if (edge === 'start') {
    const start = addDays(span.start, delta);
    return { start_date: toApi(start > span.end ? span.end : start) };
  }
  if (edge === 'end') {
    const end = addDays(span.end, delta);
    return { deadline: toApi(end < span.start ? span.start : end) };
  }
  return { start_date: toApi(addDays(span.start, delta)), deadline: toApi(addDays(span.end, delta)) };
}

/** Arrows for "waits for": [{ from: blockerId, to: taskId }] between tasks that are both shown. */
export function dependencyLinks(tasks) {
  const shown = new Set(tasks.map((t) => t.id));
  const links = [];
  for (const t of tasks) {
    for (const b of t.blocked_by_ids || []) if (shown.has(b)) links.push({ from: b, to: t.id });
  }
  return links;
}
