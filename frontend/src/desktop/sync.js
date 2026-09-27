// Keeps the local copy and the server in step: sends the queued changes
// (outbox) in order, then fetches what changed since the last cursor
// (GET /api/v1/sync/) and applies it. See docs/API.md -> Syncing.
//
// Things created offline have negative ids until the server answers; the
// real ids are remembered (meta "idMap") and later queued changes that
// refer to them are rewritten before they're sent.

import { OfflineError } from './server';

export class AuthError extends Error {}
class ServerError extends Error {}
// A queued change refers to something whose create is still queued: send it later.
class Waiting extends Error {}

// Which op field holds the id of the object an op is about.
const ID_KEY = { task: 'taskId', comment: 'commentId', project: 'projectId', label: 'labelId' };

const opTitle = (op) => op.title || op.body?.title || op.body?.name || null;

const nowIso = () => new Date().toISOString().slice(0, 19);

// Compare field values the way the server does: deadlines as dates, id lists unordered.
function normalize(value) {
  if (Array.isArray(value)) return [...value].sort();
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return value ?? null;
}

export class SyncEngine {
  /** fetcher(path, options) -> Response (throws OfflineError when unreachable). */
  constructor(store, fetcher) {
    this.store = store;
    this.fetcher = fetcher;
    this.listeners = new Set();
    this.running = null;
    this.again = false;
    this.timer = null;
    this.soon = null;
    this.state = { online: null, syncing: false, authError: false, error: null };
  }

  // ---------------------------------------------------------------- status

  status() {
    return {
      ...this.state,
      pending: this.store.outbox.length,
      lastSync: this.store.getMeta('lastSync') || null,
      conflicts: this.store.getMeta('conflicts') || [],
    };
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(dataChanged = false) {
    const s = this.status();
    this.listeners.forEach((fn) => fn(s, dataChanged));
  }

  dismissConflicts() {
    this.store.setMeta('conflicts', []);
    this.emit();
  }

  // ---------------------------------------------------------------- scheduling

  start(intervalMs = 30000) {
    this.stop();
    this.timer = setInterval(() => this.sync(), intervalMs);
    this.onWake = () => this.sync();
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.onWake);
      window.addEventListener('focus', this.onWake);
    }
    return this.sync();
  }

  stop() {
    clearInterval(this.timer);
    clearTimeout(this.soon);
    this.timer = null;
    if (this.onWake && typeof window !== 'undefined') {
      window.removeEventListener('online', this.onWake);
      window.removeEventListener('focus', this.onWake);
    }
  }

  /** After a local change: sync shortly (several quick changes go together). */
  syncSoon(delayMs = 800) {
    this.emit();
    clearTimeout(this.soon);
    this.soon = setTimeout(() => this.sync(), delayMs);
  }

  /** One round: push, then pull. Concurrent calls share the running round. */
  sync() {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      this.state = { ...this.state, syncing: true };
      this.emit();
      let changed = false;
      try {
        await this.push();
        changed = await this.pull();
        this.state = { online: true, syncing: false, authError: false, error: null };
      } catch (err) {
        if (err instanceof OfflineError) this.state = { ...this.state, online: false, syncing: false, error: null };
        else if (err instanceof AuthError) this.state = { ...this.state, online: true, syncing: false, authError: true };
        else this.state = { ...this.state, online: true, syncing: false, error: err.message };
      } finally {
        await this.store.flush();
        this.running = null;
        this.emit(changed);
      }
      if (this.again) {
        this.again = false;
        return this.sync();
      }
      return this.status();
    })();
    return this.running;
  }

  // ---------------------------------------------------------------- push

  idMap() {
    return this.store.getMeta('idMap') || {};
  }

  /** A create for this temporary id is still queued. */
  queued(entity, id) {
    return this.store.outbox.some((o) => o.kind === 'create' && o.entity === entity && o.tempId === id);
  }

  /**
   * Temporary id -> the id the server gave it. Throws Waiting while its create
   * is still queued; undefined when that create failed (the thing is gone).
   */
  mapId(entity, id) {
    if (typeof id !== 'number' || id >= 0) return id;
    const real = this.idMap()[`${entity}:${id}`];
    if (real !== undefined) return real;
    if (this.queued(entity, id)) throw new Waiting();
    return undefined;
  }

  /**
   * Temporary ids in a queued request -> the server's ids. The object the
   * request is about must exist; references to things that failed to be
   * created are left out (a task isn't lost over a label). With force,
   * references still waiting are left out too.
   */
  resolve(op, force = false) {
    const ref = (entity, id) => {
      try {
        return this.mapId(entity, id);
      } catch (err) {
        if (force && err instanceof Waiting) return undefined;
        throw err;
      }
    };
    const path = op.path.replace(/\/(tasks|comments|projects|labels)\/(-\d+)/, (m, coll, id) => {
      const real = this.mapId(coll.slice(0, -1), Number(id));
      if (real === undefined) throw new Error(`missing:${coll}:${id}`);
      return `/${coll}/${real}`;
    });
    let body = op.body;
    if (body) {
      body = { ...body };
      const one = (field, entity) => {
        if (body[field] != null) body[field] = ref(entity, body[field]) ?? null;
      };
      const many = (field, entity) => {
        if (Array.isArray(body[field])) body[field] = body[field].map((id) => ref(entity, id)).filter((id) => id !== undefined);
      };
      one('parent_task_id', 'task');
      one('project_id', 'project');
      if (op.entity === 'project') one('parent_id', 'project');
      many('blocked_by_ids', 'task');
      many('label_ids', 'label');
    }
    return { path, body };
  }

  conflict(entry) {
    const list = this.store.getMeta('conflicts') || [];
    this.store.setMeta('conflicts', [...list, { ...entry, at: nowIso() }].slice(-50));
  }

  /**
   * Sends the queue in order. A change that refers to something whose create
   * is further back in the queue waits for it (passes repeat until nothing
   * moves; references waiting on each other in a circle are left out).
   */
  async push() {
    let force = false;
    for (;;) {
      let moved = false;
      let waiting = false;
      for (const op of [...this.store.outbox]) {
        let request;
        try {
          request = this.resolve(op, force);
        } catch (err) {
          if (err instanceof Waiting) {
            waiting = true;
            continue;
          }
          // What it's about was never created on the server.
          this.conflict({ kind: 'failed', title: opTitle(op), detail: 'depends on a change that failed' });
          this.store.removeOp(op.seq);
          moved = true;
          continue;
        }
        force = false;
        await this.send(op, request);
        this.store.removeOp(op.seq);
        moved = true;
      }
      if (!waiting || (!moved && force)) break; // (the second: can't happen, but never loop)
      if (!moved) force = true;
    }
    this.remapLocal();
  }

  async send(op, request) {
    const res = await this.fetcher(request.path, {
      method: op.method,
      headers: request.body ? { 'Content-Type': 'application/json' } : {},
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
    if (res.status === 401) throw new AuthError('Not signed in');
    if (res.status >= 500) throw new ServerError(`Server error ${res.status}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (op.kind === 'create' && op.tempId != null && data.id != null) {
        this.store.setMeta('idMap', { ...this.idMap(), [`${op.entity}:${op.tempId}`]: data.id });
      }
    } else if (res.status === 409 && data.detail && data.detail.conflicts) {
      // A retried edit whose first attempt did arrive: the server already
      // has our values, so it's not a conflict.
      const same = (a, b) => JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
      const conflicts = Object.fromEntries(
        Object.entries(data.detail.conflicts).filter(([f, c]) => !same(c.current, request.body[f]))
      );
      if (Object.keys(conflicts).length) {
        this.conflict({ kind: 'conflict', title: data.detail.task?.title || op.title || null, fields: conflicts });
      }
      for (const f of Object.keys(data.detail.conflicts)) if (!conflicts[f]) conflicts[f] = true;
      // Only those fields lose; the rest of the edit still goes through.
      const rest = { ...request.body, expected: { ...(request.body.expected || {}) } };
      for (const field of Object.keys(conflicts)) {
        delete rest[field];
        delete rest.expected[field];
      }
      if (Object.keys(rest).some((k) => k !== 'expected')) {
        const retry = await this.fetcher(request.path, {
          method: op.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rest),
        });
        if (retry.status === 401) throw new AuthError('Not signed in');
        if (retry.status >= 500) throw new ServerError(`Server error ${retry.status}`);
      }
    } else if (res.status === 404 && op.kind !== 'create') {
      // Deleted on the server meanwhile: nothing left to change.
    } else {
      const detail = typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`;
      this.conflict({ kind: 'failed', title: opTitle(op), detail });
    }
  }

  /**
   * After sending: local references to things created offline point to the
   * server's ids (the objects themselves are replaced on the next pull).
   */
  remapLocal() {
    const map = this.idMap();
    const real = (entity, id) => (typeof id === 'number' && id < 0 ? map[`${entity}:${id}`] ?? id : id);
    const store = this.store;
    const update = (coll, o, patch) => {
      if (Object.keys(patch).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(o[k] ?? null))) {
        store.put(coll, { ...o, ...patch });
      }
    };
    for (const t of store.all('tasks')) {
      update('tasks', t, {
        project_id: real('project', t.project_id ?? null),
        parent_task_id: real('task', t.parent_task_id ?? null),
        label_ids: (t.label_ids || []).map((id) => real('label', id)),
        blocked_by_ids: (t.blocked_by_ids || []).map((id) => real('task', id)),
      });
    }
    for (const p of store.all('projects')) update('projects', p, { parent_id: real('project', p.parent_id ?? null) });
    for (const c of store.all('comments')) update('comments', c, { task_id: real('task', c.task_id) });
  }

  // ---------------------------------------------------------------- pull

  async getJson(path) {
    const res = await this.fetcher(path, {});
    if (res.status === 401) throw new AuthError('Not signed in');
    if (!res.ok) throw new ServerError(`HTTP ${res.status} for ${path}`);
    return res.json();
  }

  /** Returns true when anything in the local copy changed. */
  async pull() {
    const cursor = this.store.getMeta('cursor');
    const data = await this.getJson(`/api/v1/sync/${cursor ? `?since=${encodeURIComponent(cursor)}` : ''}`);
    const [users, settings, me] = await Promise.all([
      this.getJson('/api/v1/users/'),
      this.getJson('/api/v1/settings/'),
      this.getJson('/api/v1/auth/me'),
    ]);
    const changed = this.apply(data);
    const store = this.store;
    const known = new Set(users.map((u) => u.id));
    for (const u of store.all('users')) if (!known.has(u.id)) store.remove('users', u.id);
    for (const u of users) store.put('users', u);
    store.setMeta('settings', settings);
    store.setMeta('me', me);
    store.setMeta('cursor', data.cursor);
    store.setMeta('lastSync', nowIso());
    return changed;
  }

  apply(data) {
    const store = this.store;
    let changed = false;
    // Objects with changes still waiting to be sent keep the local version.
    const busy = new Set();
    for (const op of store.outbox) {
      const id = op[ID_KEY[op.entity]];
      if (id != null && op.kind !== 'create') busy.add(`${op.entity}:${id}`);
    }
    const put = (coll, entity, obj) => {
      if (busy.has(`${entity}:${obj.id}`)) return;
      // A local copy created offline and now on the server: replace it.
      const local = obj.uid ? store.byUid(coll, obj.uid) : null;
      if (local && local.id !== obj.id) store.remove(coll, local.id);
      store.put(coll, obj);
      changed = true;
    };
    const drop = (coll, id) => {
      if (store.get(coll, id)) {
        store.remove(coll, id);
        changed = true;
      }
    };

    if (data.full) {
      // Everything the server has is in this answer: start over, except
      // what exists only locally so far.
      for (const coll of ['tasks', 'projects', 'labels', 'comments']) {
        for (const o of store.all(coll)) if (o.id > 0 && !busy.has(`${coll.slice(0, -1)}:${o.id}`)) drop(coll, o.id);
      }
    }
    for (const t of data.tasks) put('tasks', 'task', t);
    for (const p of data.projects) put('projects', 'project', p);
    for (const l of data.labels) put('labels', 'label', l);
    for (const c of data.comments) put('comments', 'comment', c);

    // Anything not visible any more (deleted, or access removed) goes.
    const ids = {
      tasks: new Set(data.ids.tasks),
      projects: new Set(data.ids.projects),
      labels: new Set(data.ids.labels),
    };
    for (const coll of ['tasks', 'projects', 'labels']) {
      for (const o of store.all(coll)) if (o.id > 0 && !ids[coll].has(o.id)) drop(coll, o.id);
    }
    for (const d of data.deletions || []) if (d.entity === 'comment') drop('comments', d.id);

    // Local copies of things whose create failed (nothing queued, no server id).
    const map = this.idMap();
    for (const [coll, entity] of [['tasks', 'task'], ['projects', 'project'], ['labels', 'label'], ['comments', 'comment']]) {
      for (const o of store.all(coll)) {
        if (o.id < 0 && !this.queued(entity, o.id) && map[`${entity}:${o.id}`] === undefined) drop(coll, o.id);
      }
    }
    for (const c of store.all('comments')) if (!store.get('tasks', c.task_id)) drop('comments', c.id);
    // Tasks lose references to projects and labels that are gone.
    for (const t of store.all('tasks')) {
      if (busy.has(`task:${t.id}`)) continue;
      const projectGone = t.project_id != null && !store.get('projects', t.project_id);
      const labels = (t.label_ids || []).filter((id) => store.get('labels', id));
      if (projectGone || labels.length !== (t.label_ids || []).length) {
        store.put('tasks', { ...t, project_id: projectGone ? null : t.project_id, label_ids: labels });
        changed = true;
      }
    }
    return changed;
  }
}
