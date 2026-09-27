// The Windows app's local copy of the data: tasks, projects, labels,
// comments and users, the queue of changes not sent yet (outbox) and a few
// values (cursor, current user, settings). Kept in memory for the UI and
// written through to IndexedDB, which the app's WebView keeps on disk.

export const COLLECTIONS = ['tasks', 'projects', 'labels', 'comments', 'users'];
const ALL_STORES = [...COLLECTIONS, 'outbox', 'meta'];

export class Store {
  constructor(persistence = null) {
    this.persistence = persistence;
    this.pending = new Map();
    this.timer = null;
    this.reset();
  }

  reset() {
    this.data = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
    this.meta = {};
    this.outbox = [];
  }

  async load() {
    if (!this.persistence) return;
    const snap = await this.persistence.load();
    this.reset();
    for (const c of COLLECTIONS) for (const o of snap[c] || []) this.data[c].set(o.id, o);
    this.meta = snap.meta || {};
    this.outbox = (snap.outbox || []).sort((a, b) => a.seq - b.seq);
  }

  all(c) {
    return [...this.data[c].values()];
  }

  get(c, id) {
    return this.data[c].get(id);
  }

  byUid(c, uid) {
    for (const o of this.data[c].values()) if (o.uid === uid) return o;
    return null;
  }

  put(c, obj) {
    this.data[c].set(obj.id, obj);
    this._mark(c, obj.id, obj);
  }

  remove(c, id) {
    this.data[c].delete(id);
    this._mark(c, id, null);
  }

  getMeta(key) {
    return this.meta[key];
  }

  setMeta(key, value) {
    if (value === null || value === undefined) delete this.meta[key];
    else this.meta[key] = value;
    this._mark('meta', key, value ?? null);
  }

  /** Local ids for things created offline: -1, -2, … until the server assigns real ones. */
  nextTempId() {
    const n = (this.meta.tempId || 0) - 1;
    this.setMeta('tempId', n);
    return n;
  }

  enqueue(op) {
    const seq = (this.meta.seq || 0) + 1;
    this.setMeta('seq', seq);
    const full = { ...op, seq };
    this.outbox.push(full);
    this._mark('outbox', seq, full);
    return full;
  }

  saveOp(op) {
    this._mark('outbox', op.seq, op);
  }

  removeOp(seq) {
    this.outbox = this.outbox.filter((o) => o.seq !== seq);
    this._mark('outbox', seq, null);
  }

  async clearAll() {
    this.reset();
    this.pending.clear();
    if (this.persistence) await this.persistence.clear();
  }

  _mark(c, key, value) {
    if (!this.persistence) return;
    this.pending.set(`${c}\u0000${key}`, { c, key, value });
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 30);
  }

  async flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.persistence || this.pending.size === 0) return;
    const batch = [...this.pending.values()];
    this.pending.clear();
    await this.persistence.write(batch);
  }
}

/** Persistence in IndexedDB (the WebView's database). */
export class IdbPersistence {
  constructor(name = 'pm-desktop') {
    this.name = name;
    this.db = null;
  }

  open() {
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const req = indexedDB.open(this.name, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const c of COLLECTIONS) db.createObjectStore(c, { keyPath: 'id' });
          db.createObjectStore('outbox', { keyPath: 'seq' });
          db.createObjectStore('meta', { keyPath: 'key' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return this.db;
  }

  async load() {
    const db = await this.open();
    const tx = db.transaction(ALL_STORES, 'readonly');
    const out = {};
    await Promise.all(
      ALL_STORES.map(
        (name) =>
          new Promise((resolve, reject) => {
            const req = tx.objectStore(name).getAll();
            req.onsuccess = () => {
              out[name] = req.result;
              resolve();
            };
            req.onerror = () => reject(req.error);
          })
      )
    );
    out.meta = Object.fromEntries((out.meta || []).map((m) => [m.key, m.value]));
    return out;
  }

  async write(batch) {
    const db = await this.open();
    const names = [...new Set(batch.map((b) => b.c))];
    const tx = db.transaction(names, 'readwrite');
    for (const { c, key, value } of batch) {
      const store = tx.objectStore(c);
      if (value === null) store.delete(key);
      else store.put(c === 'meta' ? { key, value } : value);
    }
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async clear() {
    const db = await this.open();
    const tx = db.transaction(ALL_STORES, 'readwrite');
    ALL_STORES.forEach((name) => tx.objectStore(name).clear());
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}
