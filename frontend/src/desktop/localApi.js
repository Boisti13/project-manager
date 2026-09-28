// Answers the web app's API calls from the local copy (store.js), so the
// same screens work offline. Reads come from the store; changes are applied
// to it right away and queued in the outbox for sync.js to send.
//
// handle(method, url, body) returns { status, data, changed } or null when
// the call isn't handled locally (then desktopFetch passes it to the server:
// settings, users, updates, backups, projects, labels, …).

const nowIso = () => new Date().toISOString().slice(0, 19);

function uuid() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** "2026-10-01" or "2026-10-01T00:00:00Z" -> "2026-10-01T00:00:00" (as the server returns it). */
export function normalizeDeadline(value) {
  if (!value) return null;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? `${m[1]}T00:00:00` : value;
}

// Fields a task create/update may carry, as the server takes them.
const TASK_FIELDS = [
  'title', 'description', 'status', 'priority', 'estimate_minutes', 'order', 'deadline', 'project_id', 'parent_task_id',
  'assignee_id', 'recurrence_unit', 'recurrence_interval', 'recurrence_weekdays', 'recurrence_monthly',
  'recurrence_from', 'label_ids', 'blocked_by_ids',
];

/**
 * Repeat settings as the server stores them (routers/tasks.py
 * normalize_recurrence): refinements only where they apply, defaults as null.
 */
export function normalizeRecurrence(task) {
  const t = { ...task };
  if (!t.recurrence_unit) {
    t.recurrence_unit = null;
    t.recurrence_interval = null;
    t.recurrence_weekdays = null;
    t.recurrence_monthly = null;
    t.recurrence_from = null;
    return t;
  }
  t.recurrence_interval = t.recurrence_interval || 1;
  const days = t.recurrence_unit === 'week' ? [...new Set(t.recurrence_weekdays || [])].sort((a, b) => a - b) : [];
  t.recurrence_weekdays = days.length ? days : null;
  if (!['month', 'year'].includes(t.recurrence_unit) || !t.recurrence_monthly || t.recurrence_monthly === 'day') {
    t.recurrence_monthly = null;
  }
  if (!t.recurrence_from || t.recurrence_from === 'schedule') t.recurrence_from = null;
  return t;
}
const UPDATABLE = TASK_FIELDS.filter((f) => f !== 'parent_task_id');

const json = (status, data, changed = false) => ({ status, data, changed });
const notFound = (what) => json(404, { detail: `${what} not found` });
const clone = (o) => JSON.parse(JSON.stringify(o));

function parse(url) {
  const u = new URL(url, 'http://local');
  const path = u.pathname.replace(/^\/api(\/v1)?\//, '');
  return { parts: path.split('/').filter(Boolean), query: u.searchParams };
}

export class LocalApi {
  constructor(store) {
    this.store = store;
  }

  get me() {
    return this.store.getMeta('me') || null;
  }

  handle(method, url, body) {
    const { parts, query } = parse(url);
    const [a, b, c] = parts;
    const M = method.toUpperCase();

    if (a === 'tasks') {
      if (!b && M === 'GET') return json(200, this.listTasks());
      if (b === 'bulk-update' && M === 'POST') return this.bulkUpdate(body || {});
      if ((!b || b === 'bulk') && M === 'POST') {
        const parentId = (body || {}).parent_task_id;
        if (parentId != null && !this.store.get('tasks', parentId)) return notFound('Parent task');
        return b ? this.bulk(body || {}) : json(200, this.createTask(body || {}), true);
      }
      const id = Number(b);
      if (!Number.isFinite(id)) return null;
      if (!c) {
        if (M === 'GET') return this.store.get('tasks', id) ? json(200, this.withCount(this.store.get('tasks', id))) : notFound('Task');
        if (M === 'PUT') return this.updateTask(id, body || {});
        if (M === 'DELETE') return this.deleteTask(id);
      }
      if (c === 'comments') {
        if (M === 'GET') return json(200, this.listComments(id));
        if (M === 'POST') return this.createComment(id, body || {});
      }
      return null; // activity etc.: server
    }
    if (a === 'comments') {
      if (b === 'search' && M === 'GET') return json(200, this.searchComments(query.get('q') || ''));
      const id = Number(b);
      if (!Number.isFinite(id)) return null;
      if (M === 'PUT') return this.editComment(id, body || {});
      if (M === 'DELETE') return this.deleteComment(id);
      return null;
    }
    if (M !== 'GET') return null;
    if (a === 'projects' && !b) return json(200, this.store.all('projects'));
    if (a === 'labels' && !b) return json(200, this.listLabels());
    if (a === 'users' && !b && this.store.all('users').length) return json(200, this.store.all('users'));
    if (a === 'settings' && !b && this.store.getMeta('settings')) return json(200, this.store.getMeta('settings'));
    if (a === 'auth' && b === 'me' && !c && this.me) return json(200, this.me);
    return null;
  }

  // ---------------------------------------------------------------- reads

  withCount(task) {
    const count = this.store.all('comments').filter((c) => c.task_id === task.id).length;
    return { ...clone(task), comment_count: count };
  }

  listTasks() {
    const counts = new Map();
    for (const c of this.store.all('comments')) counts.set(c.task_id, (counts.get(c.task_id) || 0) + 1);
    return this.store
      .all('tasks')
      .map((t) => ({ ...clone(t), comment_count: counts.get(t.id) || 0 }))
      .sort((x, y) => (x.order ?? 0) - (y.order ?? 0) || x.id - y.id);
  }

  listLabels() {
    const counts = new Map();
    for (const t of this.store.all('tasks')) for (const id of t.label_ids || []) counts.set(id, (counts.get(id) || 0) + 1);
    return this.store
      .all('labels')
      .map((l) => ({ ...clone(l), task_count: counts.get(l.id) || 0 }))
      .sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
  }

  listComments(taskId) {
    return this.store
      .all('comments')
      .filter((c) => c.task_id === taskId)
      .sort((x, y) => (x.created_at || '').localeCompare(y.created_at || '') || x.id - y.id)
      .map(clone);
  }

  searchComments(q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    const ids = new Set(this.store.all('comments').filter((c) => c.body.toLowerCase().includes(needle)).map((c) => c.task_id));
    return [...ids].sort((x, y) => x - y);
  }

  // ---------------------------------------------------------------- tasks

  createTask(body) {
    const store = this.store;
    const now = nowIso();
    const status = body.status || 'todo';
    const task = {
      id: store.nextTempId(),
      uid: body.uid || uuid(),
      title: body.title,
      description: body.description ?? null,
      status,
      priority: body.priority ?? 0,
      estimate_minutes: body.estimate_minutes ?? null,
      order: body.order ?? 0,
      deadline: normalizeDeadline(body.deadline),
      project_id: body.project_id ?? null,
      parent_task_id: body.parent_task_id ?? null,
      assignee_id: body.assignee_id ?? null,
      recurrence_unit: body.recurrence_unit || null,
      recurrence_interval: body.recurrence_interval ?? null,
      recurrence_weekdays: body.recurrence_weekdays ?? null,
      recurrence_monthly: body.recurrence_monthly ?? null,
      recurrence_from: body.recurrence_from ?? null,
      label_ids: body.label_ids || [],
      blocked_by_ids: body.blocked_by_ids || [],
      completed_at: status === 'done' ? now : null,
      created_at: now,
      updated_at: now,
      local: true, // not on the server yet
    };
    Object.assign(task, normalizeRecurrence(task));
    store.put('tasks', task);
    const payload = { uid: task.uid };
    for (const f of TASK_FIELDS) if (task[f] !== null && task[f] !== undefined) payload[f] = task[f];
    if (payload.deadline) payload.deadline = task.deadline;
    store.enqueue({ kind: 'create', entity: 'task', tempId: task.id, method: 'POST', path: '/api/v1/tasks/', body: payload });
    return this.withCount(task);
  }

  bulk(body) {
    const ids = [];
    const add = (items, parentId) => {
      for (const item of items || []) {
        const created = this.createTask({
          title: item.title.trim(),
          status: item.status || body.status || 'todo',
          priority: body.priority || 0,
          deadline: body.deadline || null,
          project_id: parentId == null ? body.project_id ?? null : null,
          parent_task_id: parentId,
          assignee_id: body.assignee_id ?? null,
          label_ids: body.label_ids || [],
        });
        ids.push(created.id);
        add(item.children, created.id);
      }
    };
    add(body.items, body.parent_task_id ?? null);
    return json(200, { created: ids.length, ids }, true);
  }

  updateTask(id, body) {
    const store = this.store;
    const task = store.get('tasks', id);
    if (!task) return notFound('Task');
    // Apply the request, normalize like the server, then see what really changed.
    const candidate = { ...task };
    for (const f of UPDATABLE) if (f in body) candidate[f] = f === 'deadline' ? normalizeDeadline(body[f]) : body[f];
    const normalized = normalizeRecurrence(candidate);
    const changes = {};
    for (const f of UPDATABLE) {
      if (JSON.stringify(normalized[f] ?? null) !== JSON.stringify(task[f] ?? null)) changes[f] = normalized[f] ?? null;
    }
    if (Object.keys(changes).length === 0) return json(200, this.withCount(task));

    const before = Object.fromEntries(Object.keys(changes).map((f) => [f, task[f] ?? null]));
    const updated = { ...task, ...changes, updated_at: nowIso() };
    if ('status' in changes) updated.completed_at = updated.status === 'done' ? task.completed_at || nowIso() : null;
    store.put('tasks', updated);

    const queuedCreate = store.outbox.find((o) => o.kind === 'create' && o.entity === 'task' && o.tempId === id);
    if (queuedCreate) {
      // Not sent yet: fold the change into the queued create.
      Object.assign(queuedCreate.body, changes);
      store.saveOp(queuedCreate);
    } else {
      // (Also for tasks created offline and already sent: sync.js maps the
      // temporary id to the real one.)
      // One queued update per task: merge, keeping the first "expected" per field.
      const op = store.outbox.find((o) => o.kind === 'update' && o.entity === 'task' && o.taskId === id);
      if (op) {
        const expected = { ...before, ...op.body.expected };
        op.body = { ...op.body, ...changes, expected };
        store.saveOp(op);
      } else {
        store.enqueue({
          kind: 'update', entity: 'task', taskId: id, title: task.title, method: 'PUT',
          path: `/api/v1/tasks/${id}`, body: { ...changes, expected: before },
        });
      }
    }
    return json(200, this.withCount(updated), true);
  }

  /** Several tasks, each with its own fields; all exist or nothing changes. */
  bulkUpdate(body) {
    const updates = body.updates || [];
    const missing = updates.find((u) => !this.store.get('tasks', u.id));
    if (missing) return notFound(`Task ${missing.id}`);
    for (const { id, expected, ...fields } of updates) this.updateTask(id, fields);
    return json(200, { updated: updates.length }, true);
  }

  deleteTask(id) {
    const store = this.store;
    if (!store.get('tasks', id)) return notFound('Task');
    // The task goes with its subtasks and their comments.
    const doomed = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const t of store.all('tasks')) {
        if (t.parent_task_id != null && doomed.has(t.parent_task_id) && !doomed.has(t.id)) {
          doomed.add(t.id);
          grew = true;
        }
      }
    }
    for (const c of store.all('comments')) if (doomed.has(c.task_id)) store.remove('comments', c.id);
    for (const tid of doomed) store.remove('tasks', tid);
    // Created offline and not sent yet: then the server never needs to know.
    const unsent = store.outbox.some((o) => o.kind === 'create' && o.entity === 'task' && o.tempId === id);
    // Queued work about these tasks is moot now.
    for (const op of [...store.outbox]) {
      if ((op.entity === 'task' && (doomed.has(op.tempId) || doomed.has(op.taskId))) ||
          (op.entity === 'comment' && doomed.has(op.taskId))) {
        store.removeOp(op.seq);
      }
    }
    if (!unsent) store.enqueue({ kind: 'delete', entity: 'task', taskId: id, method: 'DELETE', path: `/api/v1/tasks/${id}` });
    return json(200, { ok: true }, true);
  }

  // ---------------------------------------------------------------- comments

  createComment(taskId, body) {
    const store = this.store;
    if (!store.get('tasks', taskId)) return notFound('Task');
    const text = (body.body || '').trim();
    if (!text) return json(400, { detail: 'Comment is empty' });
    const me = this.me || {};
    const comment = {
      id: store.nextTempId(), uid: body.uid || uuid(), task_id: taskId, author_id: me.id ?? null,
      author: me.username ?? null, body: text, created_at: nowIso(), edited_at: null, local: true,
    };
    store.put('comments', comment);
    store.enqueue({
      kind: 'create', entity: 'comment', tempId: comment.id, taskId, method: 'POST',
      path: `/api/v1/tasks/${taskId}/comments`, body: { uid: comment.uid, body: text },
    });
    return json(200, clone(comment), true);
  }

  editComment(id, body) {
    const store = this.store;
    const comment = store.get('comments', id);
    if (!comment) return notFound('Comment');
    const text = (body.body || '').trim();
    if (!text) return json(400, { detail: 'Comment is empty' });
    const updated = { ...comment, body: text, edited_at: comment.local ? null : nowIso() };
    store.put('comments', updated);
    const queued = store.outbox.find((o) => o.entity === 'comment' && (o.tempId === id || o.commentId === id) && o.kind !== 'delete');
    if (queued) {
      queued.body = { ...queued.body, body: text };
      store.saveOp(queued);
    } else {
      store.enqueue({ kind: 'update', entity: 'comment', commentId: id, taskId: comment.task_id, method: 'PUT',
        path: `/api/v1/comments/${id}`, body: { body: text } });
    }
    return json(200, clone(updated), true);
  }

  deleteComment(id) {
    const store = this.store;
    const comment = store.get('comments', id);
    if (!comment) return notFound('Comment');
    store.remove('comments', id);
    const unsent = store.outbox.some((o) => o.kind === 'create' && o.entity === 'comment' && o.tempId === id);
    for (const op of [...store.outbox]) {
      if (op.entity === 'comment' && (op.tempId === id || op.commentId === id)) store.removeOp(op.seq);
    }
    if (!unsent) {
      store.enqueue({ kind: 'delete', entity: 'comment', commentId: id, taskId: comment.task_id, method: 'DELETE',
        path: `/api/v1/comments/${id}` });
    }
    return json(200, { ok: true }, true);
  }
}
