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

const nowIso = () => new Date().toISOString().slice(0, 19);

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

  mapId(entity, id) {
    if (typeof id !== 'number' || id >= 0) return id;
    const real = this.idMap()[`${entity}:${id}`];
    if (real === undefined) throw new Error(`missing:${entity}:${id}`);
    return real;
  }

  /** Temporary ids in a queued request -> the ids the server gave them. */
  resolve(op) {
    const path = op.path
      .replace(/\/tasks\/(-\d+)/, (m, id) => `/tasks/${this.mapId('task', Number(id))}`)
      .replace(/\/comments\/(-\d+)/, (m, id) => `/comments/${this.mapId('comment', Number(id))}`);
    let body = op.body;
    if (body) {
      body = { ...body };
      if (body.parent_task_id != null) body.parent_task_id = this.mapId('task', body.parent_task_id);
      if (Array.isArray(body.blocked_by_ids)) body.blocked_by_ids = body.blocked_by_ids.map((id) => this.mapId('task', id));
    }
    return { path, body };
  }

  conflict(entry) {
    const list = this.store.getMeta('conflicts') || [];
    this.store.setMeta('conflicts', [...list, { ...entry, at: nowIso() }].slice(-50));
  }

  async push() {
    for (const op of [...this.store.outbox]) {
      let request;
      try {
        request = this.resolve(op);
      } catch {
        // Something it refers to was never created on the server.
        this.conflict({ kind: 'failed', title: op.title || op.body?.title || null, detail: 'depends on a change that failed' });
        this.store.removeOp(op.seq);
        continue;
      }
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
        this.conflict({
          kind: 'conflict', title: data.detail.task?.title || op.title || null, fields: data.detail.conflicts,
        });
      } else if (res.status === 404 && op.kind !== 'create') {
        // Deleted on the server meanwhile: nothing left to change.
      } else {
        const detail = typeof data.detail === 'string' ? data.detail : `HTTP ${res.status}`;
        this.conflict({ kind: 'failed', title: op.title || op.body?.title || null, detail });
      }
      this.store.removeOp(op.seq);
    }
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
      if (op.entity === 'task' && op.taskId != null) busy.add(`task:${op.taskId}`);
      if (op.entity === 'comment' && op.commentId != null) busy.add(`comment:${op.commentId}`);
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
    for (const c of store.all('comments')) if (!store.get('tasks', c.task_id)) drop('comments', c.id);
    return changed;
  }
}
