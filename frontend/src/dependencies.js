// Task dependencies ("blocked by"). No React in here.

/** Helpers over the loaded task list. */
export function buildDependencyIndex(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waitingOn = new Map(); // blocker id -> tasks waiting for it
  for (const t of tasks) {
    for (const id of t.blocked_by_ids || []) {
      if (!waitingOn.has(id)) waitingOn.set(id, []);
      waitingOn.get(id).push(t);
    }
  }
  const blockersOf = (task) => (task.blocked_by_ids || []).map((id) => byId.get(id)).filter(Boolean);
  return {
    blockersOf,
    /** Blockers that aren't done yet (none for a done task). */
    openBlockersOf: (task) => (task.status === 'done' ? [] : blockersOf(task).filter((b) => b.status !== 'done')),
    /** Tasks that wait for `task`. */
    waitingFor: (task) => waitingOn.get(task.id) || [],
  };
}

/** Whether `task` still waits for an open task (byId: Map of all tasks). */
export function isWaiting(task, byId) {
  if (task.status === 'done') return false;
  return (task.blocked_by_ids || []).some((id) => {
    const b = byId.get(id);
    return b && b.status !== 'done';
  });
}

/** Tasks that fit `query` as blockers of `task` (not itself), best first. */
export function blockerSuggestions(tasks, task, query, selected = [], limit = 8) {
  const q = query.trim().toLowerCase();
  const taken = new Set(selected);
  return tasks
    .filter((t) => (!task || t.id !== task.id) && !taken.has(t.id) && (!q || t.title.toLowerCase().includes(q)))
    .sort(
      (a, b) =>
        (a.status === 'done') - (b.status === 'done') ||
        (q ? a.title.toLowerCase().indexOf(q) - b.title.toLowerCase().indexOf(q) : 0) ||
        a.title.localeCompare(b.title)
    )
    .slice(0, limit);
}
