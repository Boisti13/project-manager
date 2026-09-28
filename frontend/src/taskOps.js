// Pure helpers for the Tasks page: subtrees, changes to several tasks,
// reordering. No React, so they can be tested on their own.

/** The given ids plus all their subtasks, at any depth. */
export function withDescendants(tasks, ids) {
  const all = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const x of tasks) {
      if (x.parent_task_id != null && all.has(x.parent_task_id) && !all.has(x.id)) {
        all.add(x.id);
        grew = true;
      }
    }
  }
  return all;
}

/** The picked tasks (in the order given) that aren't below another picked one. */
export function topmost(tasks, ids) {
  const byId = new Map(tasks.map((x) => [x.id, x]));
  const picked = new Set([...ids].filter((id) => byId.has(id)));
  const underPicked = (x) => {
    for (let p = byId.get(x.parent_task_id); p; p = byId.get(p.parent_task_id)) if (picked.has(p.id)) return true;
    return false;
  };
  return [...picked].map((id) => byId.get(id)).filter((x) => !underPicked(x));
}

/**
 * One change for several tasks: { field, value } from the select-mode bar
 * (status | priority | project_id | assignee_id | deadline | add_label |
 * remove_label; "none" = no project / nobody). Returns the per-task
 * updates for the tasks it actually changes, and `before`: what each of
 * those had (for Undo).
 */
export function bulkChanges(tasks, selectedIds, { field, value }) {
  const num = (v) => (v === 'none' ? null : parseInt(v, 10));
  const changeFor = (task) => {
    const labelIds = task.label_ids || [];
    switch (field) {
      case 'status':
        return { status: value };
      case 'priority':
        return { priority: parseInt(value, 10) };
      case 'project_id':
        return { project_id: num(value) };
      case 'assignee_id':
        return { assignee_id: num(value) };
      case 'deadline':
        return { deadline: value ? `${value}T00:00:00` : null };
      case 'add_label':
        return labelIds.includes(num(value)) ? null : { label_ids: [...labelIds, num(value)] };
      case 'remove_label':
        return labelIds.includes(num(value)) ? { label_ids: labelIds.filter((x) => x !== num(value)) } : null;
      default:
        return null;
    }
  };
  const updates = [];
  const before = [];
  for (const task of tasks.filter((x) => selectedIds.has(x.id))) {
    const change = changeFor(task);
    if (!change) continue;
    const old = {};
    let differs = false;
    for (const [key, v] of Object.entries(change)) {
      old[key] = key === 'label_ids' ? task.label_ids || [] : task[key] ?? null;
      if (JSON.stringify(old[key]) !== JSON.stringify(v)) differs = true;
    }
    if (!differs) continue;
    updates.push({ id: task.id, ...change });
    before.push({ id: task.id, ...old });
  }
  return { updates, before };
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id - b.id;

/**
 * Tasks `task` can swap places with (Move up / down): same parent; for
 * top-level tasks also the same project and the same open/completed section.
 */
export function siblingsOf(tasks, task) {
  return tasks
    .filter(
      (x) =>
        x.parent_task_id === task.parent_task_id &&
        (task.parent_task_id != null ||
          (x.project_id === task.project_id && (x.status === 'done') === (task.status === 'done')))
    )
    .sort(byOrder);
}

/**
 * Dropping `draggedId` on `targetId`: the new `order` of every sibling whose
 * place changes, or [] when it can't move there (different parent/project).
 */
export function reorderUpdates(tasks, draggedId, targetId) {
  const dragged = tasks.find((x) => x.id === draggedId);
  const target = tasks.find((x) => x.id === targetId);
  if (!dragged || !target) return [];
  if (dragged.parent_task_id !== target.parent_task_id) return []; // only siblings
  if (dragged.parent_task_id === null && dragged.project_id !== target.project_id) return []; // ...within one project

  const siblings = tasks.filter((x) => x.parent_task_id === dragged.parent_task_id).sort(byOrder);
  const from = siblings.findIndex((x) => x.id === draggedId);
  const to = siblings.findIndex((x) => x.id === targetId);
  const reordered = [...siblings];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return reordered
    .map((x, order) => ({ id: x.id, order }))
    .filter((u) => siblings.find((s) => s.id === u.id).order !== u.order);
}

/** Same filters, whatever the order of the URL parameters. */
export function sameQuery(a, b) {
  const norm = (q) => {
    const p = new URLSearchParams(q);
    p.sort();
    return p.toString();
  };
  return norm(a) === norm(b);
}
