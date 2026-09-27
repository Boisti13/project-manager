// Run with `npm test` (react-scripts / Jest). The Windows app's offline
// layer (store + localApi + sync) against a small fake server in memory.
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { Store } from './store';
import { LocalApi, normalizeDeadline } from './localApi';
import { SyncEngine } from './sync';
import { OfflineError, normalizeServer, versionAtLeast } from './server';
import { DESKTOP_VERSION } from './platform';

// ---------------------------------------------------------------- fake server

function fakeServer() {
  let clock = 1;
  let nextId = 100;
  const tick = () => String(clock++).padStart(6, '0');
  const srv = {
    online: true,
    tasks: new Map(),
    comments: new Map(),
    projects: new Map(),
    labels: new Map(),
    deletions: [],
    requests: [],
    uidIndex: new Map(),
    addTask(fields) {
      const id = nextId++;
      const task = {
        id, uid: fields.uid || `srv-${id}`, title: '', description: null, status: 'todo', priority: 0, order: 0,
        deadline: null, project_id: null, parent_task_id: null, assignee_id: null, recurrence_unit: null,
        recurrence_interval: null, label_ids: [], blocked_by_ids: [], completed_at: null,
        created_at: '2026-09-27T10:00:00', ...fields, updated_at: tick(),
      };
      srv.tasks.set(id, task);
      srv.uidIndex.set(task.uid, id);
      return task;
    },
    edit(id, fields) {
      Object.assign(srv.tasks.get(id), fields, { updated_at: tick() });
    },
    remove(id) {
      srv.tasks.delete(id);
      srv.deletions.push({ entity: 'task', id, uid: null, deleted_at: tick() });
    },
    addProject(fields) {
      const id = nextId++;
      const project = {
        id, uid: fields.uid || `srv-p${id}`, name: '', description: null, color: '#2196f3', parent_id: null,
        is_private: false, member_ids: [], created_at: '2026-09-27T10:00:00', ...fields, updated_at: tick(),
      };
      srv.projects.set(id, project);
      srv.uidIndex.set(project.uid, id);
      return project;
    },
    addLabel(fields) {
      const id = nextId++;
      const label = { id, uid: fields.uid || `srv-l${id}`, color: '#4caf50', ...fields, updated_at: tick() };
      srv.labels.set(id, label);
      srv.uidIndex.set(label.uid, id);
      return label;
    },
  };
  const reply = (status, data) => ({ status, ok: status < 400, json: async () => data });

  srv.fetch = async (url, options = {}) => {
    if (!srv.online) throw new OfflineError('offline');
    const method = (options.method || 'GET').toUpperCase();
    const body = options.body ? JSON.parse(options.body) : null;
    const u = new URL(url, 'http://srv');
    const p = u.pathname.replace(/^\/api\/v1\//, '');
    srv.requests.push(`${method} ${p}`);
    let m;
    if (method === 'GET' && p === 'sync/') {
      const since = u.searchParams.get('since');
      const newer = (map) => [...map.values()].filter((o) => !since || o.updated_at > since);
      const changed = newer(srv.tasks);
      const ids = new Set(changed.map((t) => t.id));
      return reply(200, {
        // the newest change included; later ones are "after" it
        cursor: String(clock - 1).padStart(6, '0'), full: !since, tasks: changed,
        projects: newer(srv.projects), labels: newer(srv.labels),
        comments: [...srv.comments.values()].filter((c) => ids.has(c.task_id) || !since || c.created_at > since),
        users: [], deletions: srv.deletions.filter((d) => !since || d.deleted_at > since),
        ids: { tasks: [...srv.tasks.keys()], projects: [...srv.projects.keys()], labels: [...srv.labels.keys()] },
      });
    }
    // projects and labels: uid makes creates idempotent; no "expected" (last save wins)
    for (const [coll, map] of [['projects', srv.projects], ['labels', srv.labels]]) {
      if (method === 'POST' && p === `${coll}/`) {
        if (body.uid && srv.uidIndex.has(body.uid)) return reply(200, map.get(srv.uidIndex.get(body.uid)));
        if (coll === 'labels' && [...map.values()].some((l) => l.name.toLowerCase() === body.name.toLowerCase())) {
          return reply(400, { detail: `A label "${body.name}" already exists` });
        }
        if (coll === 'projects' && body.parent_id != null && !map.has(body.parent_id)) return reply(400, { detail: 'Project not found' });
        return reply(200, coll === 'projects' ? srv.addProject(body) : srv.addLabel(body));
      }
      if ((m = new RegExp(`^${coll}/(-?\\d+)$`).exec(p))) {
        const id = Number(m[1]);
        if (!map.has(id)) return reply(404, { detail: 'Not found' });
        if (method === 'PUT') {
          Object.assign(map.get(id), body, { updated_at: tick() });
          return reply(200, map.get(id));
        }
        if (method === 'DELETE') {
          const gone = new Set([id, ...[...map.values()].filter((o) => o.parent_id === id).map((o) => o.id)]);
          for (const g of gone) map.delete(g);
          for (const t of srv.tasks.values()) {
            if (coll === 'projects' && gone.has(t.project_id)) srv.edit(t.id, { project_id: null });
            if (coll === 'labels' && t.label_ids.includes(id)) srv.edit(t.id, { label_ids: t.label_ids.filter((x) => x !== id) });
          }
          return reply(200, { ok: true });
        }
      }
    }
    if (method === 'GET' && p === 'users/') return reply(200, [{ id: 1, username: 'me', is_admin: false }]);
    if (method === 'GET' && p === 'settings/') return reply(200, { archive_after_days: 30 });
    if (method === 'GET' && p === 'auth/me') return reply(200, { id: 1, username: 'me' });
    if (method === 'POST' && p === 'tasks/') {
      if (body.uid && srv.uidIndex.has(body.uid)) return reply(200, srv.tasks.get(srv.uidIndex.get(body.uid)));
      if (body.parent_task_id != null && !srv.tasks.has(body.parent_task_id)) return reply(404, { detail: 'Parent task not found' });
      if (body.project_id != null && !srv.projects.has(body.project_id)) return reply(400, { detail: 'Project not found' });
      if ((body.label_ids || []).some((id) => !srv.labels.has(id))) return reply(400, { detail: 'Label not found' });
      return reply(200, srv.addTask(body));
    }
    if ((m = /^tasks\/(-?\d+)$/.exec(p))) {
      const id = Number(m[1]);
      const task = srv.tasks.get(id);
      if (!task) return reply(404, { detail: 'Task not found' });
      if (method === 'DELETE') {
        srv.remove(id);
        return reply(200, { ok: true });
      }
      const { expected, ...changes } = body;
      const conflicts = {};
      for (const [f, v] of Object.entries(expected || {})) {
        if (JSON.stringify(task[f] ?? null) !== JSON.stringify(v)) conflicts[f] = { expected: v, current: task[f] };
      }
      if (Object.keys(conflicts).length) return reply(409, { detail: { message: 'conflict', conflicts, task } });
      srv.edit(id, changes);
      return reply(200, task);
    }
    if ((m = /^tasks\/(-?\d+)\/comments$/.exec(p)) && method === 'POST') {
      const taskId = Number(m[1]);
      if (!srv.tasks.has(taskId)) return reply(404, { detail: 'Task not found' });
      const id = nextId++;
      const c = { id, uid: body.uid, task_id: taskId, author_id: 1, author: 'me', body: body.body, created_at: tick(), edited_at: null };
      srv.comments.set(id, c);
      srv.edit(taskId, {});
      return reply(200, c);
    }
    return reply(404, { detail: `no route ${method} ${p}` });
  };
  return srv;
}

function setup() {
  const srv = fakeServer();
  const store = new Store();
  store.setMeta('me', { id: 1, username: 'me' });
  const api = new LocalApi(store);
  const engine = new SyncEngine(store, srv.fetch);
  const call = (method, url, body) => api.handle(method, url, body);
  return { srv, store, api, engine, call };
}

// ---------------------------------------------------------------- tests

test('full sync fills the local copy; reads are answered locally', async () => {
  const { srv, store, engine, call } = setup();
  const a = srv.addTask({ title: 'A' });
  srv.addTask({ title: 'A1', parent_task_id: a.id });
  const s = await engine.sync();
  assert.strictEqual(s.online, true);
  assert.deepStrictEqual(call('GET', '/api/tasks/').data.map((t) => t.title).sort(), ['A', 'A1']);
  assert.strictEqual(call('GET', `/api/tasks/${a.id}`).data.title, 'A');
  assert.strictEqual(call('GET', '/api/users/').data[0].username, 'me');
  assert.deepStrictEqual(call('GET', '/api/settings/').data, { archive_after_days: 30 });
  assert.strictEqual(call('GET', '/api/system/info'), null); // server-only: passed through
  assert.ok(store.getMeta('cursor'));
});

test('offline changes are queued, then sent in order with real ids', async () => {
  const { srv, store, engine, call } = setup();
  const existing = srv.addTask({ title: 'Existing', priority: 1 });
  await engine.sync();
  srv.online = false;

  // new task with a subtask (bulk), a comment on the new task, an edit, a tick
  const bulk = call('POST', '/api/tasks/bulk', { items: [{ title: 'Offline parent', children: [{ title: 'Offline child' }] }] });
  const [parentTemp, childTemp] = bulk.data.ids;
  assert.ok(parentTemp < 0 && childTemp < 0);
  assert.strictEqual(call('GET', `/api/tasks/${childTemp}`).data.parent_task_id, parentTemp);
  call('POST', `/api/tasks/${parentTemp}/comments`, { body: 'written on the train' });
  assert.strictEqual(call('GET', '/api/tasks/').data.find((t) => t.id === parentTemp).comment_count, 1);
  call('PUT', `/api/tasks/${existing.id}`, { priority: 3 });
  call('PUT', `/api/tasks/${existing.id}`, { status: 'done' }); // merged into the same queued update
  assert.strictEqual(store.outbox.length, 4);

  let s = await engine.sync();
  assert.strictEqual(s.online, false);
  assert.strictEqual(s.pending, 4);

  srv.online = true;
  s = await engine.sync();
  assert.strictEqual(s.pending, 0);
  assert.deepStrictEqual(s.conflicts, []);
  const onServer = [...srv.tasks.values()];
  const parent = onServer.find((t) => t.title === 'Offline parent');
  const child = onServer.find((t) => t.title === 'Offline child');
  assert.strictEqual(child.parent_task_id, parent.id);
  assert.strictEqual([...srv.comments.values()][0].task_id, parent.id);
  assert.strictEqual(srv.tasks.get(existing.id).priority, 3);
  assert.strictEqual(srv.tasks.get(existing.id).status, 'done');
  // the local copy now has the server's ids, no temporary ones
  const local = call('GET', '/api/tasks/').data;
  assert.ok(local.every((t) => t.id > 0), JSON.stringify(local.map((t) => t.id)));
  assert.strictEqual(local.length, 3);
  assert.strictEqual(store.all('comments')[0].task_id, parent.id);
});

test('changes to something created offline fold into its queued create', async () => {
  const { srv, store, engine, call } = setup();
  await engine.sync();
  srv.online = false;
  const created = call('POST', '/api/tasks/', { title: 'Draft', deadline: '2026-10-01' }).data;
  assert.strictEqual(created.deadline, '2026-10-01T00:00:00');
  call('PUT', `/api/tasks/${created.id}`, { title: 'Final' });
  assert.strictEqual(store.outbox.length, 1);
  assert.strictEqual(store.outbox[0].body.title, 'Final');
  // created and deleted offline: the server never hears of it
  const gone = call('POST', '/api/tasks/', { title: 'Oops' }).data;
  call('DELETE', `/api/tasks/${gone.id}`);
  assert.strictEqual(store.outbox.length, 1);
  srv.online = true;
  await engine.sync();
  assert.deepStrictEqual([...srv.tasks.values()].map((t) => t.title), ['Final']);
});

test('repeat rules are passed through and normalized like the server does', async () => {
  const { srv, store, engine, call } = setup();
  await engine.sync();
  srv.online = false;
  const created = call('POST', '/api/tasks/', {
    title: 'Standup', recurrence_unit: 'week', recurrence_interval: 1, recurrence_weekdays: [3, 0, 3],
    recurrence_monthly: 'day', recurrence_from: 'completion',
  }).data;
  assert.deepStrictEqual(
    [created.recurrence_weekdays, created.recurrence_monthly, created.recurrence_from],
    [[0, 3], null, 'completion']
  );
  assert.deepStrictEqual(store.outbox[0].body.recurrence_weekdays, [0, 3]);
  assert.ok(!('recurrence_monthly' in store.outbox[0].body)); // default: not sent
  srv.online = true;
  await engine.sync();
  const onServer = [...srv.tasks.values()].find((t) => t.title === 'Standup');
  assert.deepStrictEqual(onServer.recurrence_weekdays, [0, 3]);

  // Saving the form unchanged (it sends the defaults) queues nothing.
  const local = call('GET', '/api/tasks/').data.find((t) => t.title === 'Standup');
  call('PUT', `/api/tasks/${local.id}`, {
    title: 'Standup', recurrence_unit: 'week', recurrence_interval: 1, recurrence_weekdays: [0, 3],
    recurrence_monthly: 'day', recurrence_from: 'completion',
  });
  assert.strictEqual(store.outbox.length, 0);
  // Switching to monthly drops the weekdays.
  call('PUT', `/api/tasks/${local.id}`, { recurrence_unit: 'month', recurrence_monthly: 'last_weekday' });
  const changed = call('GET', `/api/tasks/${local.id}`).data;
  assert.deepStrictEqual([changed.recurrence_weekdays, changed.recurrence_monthly], [null, 'last_weekday']);
});

test('a field changed on the server meanwhile is a conflict, not overwritten', async () => {
  const { srv, engine, call } = setup();
  const t = srv.addTask({ title: 'Order', priority: 1 });
  await engine.sync();
  srv.online = false;
  call('PUT', `/api/tasks/${t.id}`, { priority: 3, title: 'Order cables' });
  srv.edit(t.id, { priority: 2 }); // someone else, on the server
  srv.online = true;
  const s = await engine.sync();
  assert.strictEqual(s.conflicts.length, 1);
  assert.strictEqual(s.conflicts[0].kind, 'conflict');
  assert.deepStrictEqual(Object.keys(s.conflicts[0].fields), ['priority']);
  assert.strictEqual(srv.tasks.get(t.id).priority, 2); // server's version kept
  assert.strictEqual(srv.tasks.get(t.id).title, 'Order cables'); // the other field still went through
  assert.strictEqual(call('GET', `/api/tasks/${t.id}`).data.priority, 2); // and shown locally
  assert.strictEqual(call('GET', `/api/tasks/${t.id}`).data.title, 'Order cables');
  engine.dismissConflicts();
  assert.deepStrictEqual(engine.status().conflicts, []);
});

test('an edit that arrived but whose answer was lost is not a conflict when re-sent', async () => {
  const { srv, engine, call } = setup();
  const t = srv.addTask({ title: 'Order', priority: 1 });
  await engine.sync();
  srv.online = false;
  call('PUT', `/api/tasks/${t.id}`, { priority: 3 });
  srv.edit(t.id, { priority: 3 }); // the first attempt reached the server
  srv.online = true;
  const s = await engine.sync();
  assert.deepStrictEqual(s.conflicts, []);
  assert.strictEqual(s.pending, 0);
  assert.strictEqual(srv.tasks.get(t.id).priority, 3);
});

test('deleted or no longer visible on the server: removed locally', async () => {
  const { srv, engine, call } = setup();
  const a = srv.addTask({ title: 'A' });
  srv.addTask({ title: 'B' });
  await engine.sync();
  srv.remove(a.id);
  await engine.sync();
  assert.deepStrictEqual(call('GET', '/api/tasks/').data.map((t) => t.title), ['B']);
  // an edit to a task deleted on the server meanwhile is dropped quietly
  const b = [...srv.tasks.values()][0];
  srv.online = false;
  call('PUT', `/api/tasks/${b.id}`, { title: 'B2' });
  srv.online = true;
  srv.remove(b.id);
  const s = await engine.sync();
  assert.strictEqual(s.pending, 0);
  assert.deepStrictEqual(s.conflicts, []);
  assert.deepStrictEqual(call('GET', '/api/tasks/').data, []);
});

const noTempIds = (store) => {
  for (const coll of ['tasks', 'projects', 'labels', 'comments']) {
    for (const o of store.all(coll)) {
      assert.ok(o.id > 0, `${coll} ${o.id}`);
      for (const f of ['project_id', 'parent_id', 'parent_task_id']) assert.ok(!(o[f] < 0), `${coll}.${f}`);
      assert.ok(!(o.label_ids || []).some((id) => id < 0), `${coll}.label_ids`);
    }
  }
};

test('projects, categories and labels created offline get real ids, and tasks follow', async () => {
  const { srv, store, engine, call } = setup();
  await engine.sync();
  srv.online = false;

  const garden = call('POST', '/api/projects/', { name: 'Garden' }).data;
  const beds = call('POST', '/api/projects/', { name: 'Beds', parent_id: garden.id }).data;
  const outside = call('POST', '/api/labels/', { name: 'Outside' }).data;
  const dig = call('POST', '/api/tasks/', { title: 'Dig', project_id: beds.id, label_ids: [outside.id] }).data;
  assert.ok(garden.id < 0 && garden.color, 'temporary id and a palette color');
  assert.deepStrictEqual(call('GET', '/api/projects/').data.map((p) => p.name), ['Beds', 'Garden']);
  assert.strictEqual(call('GET', '/api/labels/').data[0].task_count, 1);

  // the server's rules apply offline too
  assert.strictEqual(call('POST', '/api/projects/', { name: 'Too deep', parent_id: beds.id }).status, 400);
  assert.strictEqual(call('POST', '/api/projects/', { name: 'Cat', parent_id: garden.id, is_private: true }).status, 400);
  assert.strictEqual(call('POST', '/api/labels/', { name: '  outside ' }).status, 400);
  const secret = call('POST', '/api/projects/', { name: 'Secret', is_private: true }).data;
  assert.deepStrictEqual(secret.member_ids, [1], 'the creator is a member');

  srv.online = true;
  const s = await engine.sync();
  assert.strictEqual(s.pending, 0);
  assert.deepStrictEqual(s.conflicts, []);
  const byName = (map, name) => [...map.values()].find((o) => o.name === name);
  const g = byName(srv.projects, 'Garden');
  const b = byName(srv.projects, 'Beds');
  const l = byName(srv.labels, 'Outside');
  assert.strictEqual(b.parent_id, g.id);
  const task = [...srv.tasks.values()].find((t) => t.title === 'Dig');
  assert.strictEqual(task.project_id, b.id);
  assert.deepStrictEqual(task.label_ids, [l.id]);
  noTempIds(store);
  assert.strictEqual(call('GET', `/api/tasks/${task.id}`).data.project_id, b.id);
  assert.ok(dig.id < 0);
});

test('a change waits for something created after it in the queue', async () => {
  const { srv, store, engine, call } = setup();
  await engine.sync();
  srv.online = false;
  const task = call('POST', '/api/tasks/', { title: 'Plan trip' }).data;
  const trip = call('POST', '/api/projects/', { name: 'Trip' }).data;
  const packing = call('POST', '/api/labels/', { name: 'Packing' }).data;
  // folded into the task's create, which is queued before the project's and the label's
  call('PUT', `/api/tasks/${task.id}`, { project_id: trip.id, label_ids: [packing.id] });
  srv.online = true;
  const s = await engine.sync();
  assert.deepStrictEqual(s.conflicts, []);
  const t = [...srv.tasks.values()].find((x) => x.title === 'Plan trip');
  assert.strictEqual(srv.projects.get(t.project_id).name, 'Trip');
  assert.strictEqual(srv.labels.get(t.label_ids[0]).name, 'Packing');
  noTempIds(store);
});

test('projects and labels edited and deleted offline', async () => {
  const { srv, store, engine, call } = setup();
  const home = srv.addProject({ name: 'Home' });
  const kitchen = srv.addProject({ name: 'Kitchen', parent_id: home.id });
  const work = srv.addProject({ name: 'Work' });
  const x = srv.addLabel({ name: 'X' });
  const y = srv.addLabel({ name: 'Y' });
  const t = srv.addTask({ title: 'Paint', project_id: kitchen.id, label_ids: [x.id, y.id] });
  await engine.sync();
  srv.online = false;

  call('PUT', `/api/projects/${work.id}`, { name: 'Office', color: '#f44336' });
  call('PUT', `/api/labels/${y.id}`, { name: 'Why' });
  call('DELETE', `/api/labels/${x.id}`);
  call('DELETE', `/api/projects/${home.id}`); // takes Kitchen with it
  const local = call('GET', `/api/tasks/${t.id}`).data;
  assert.strictEqual(local.project_id, null);
  assert.deepStrictEqual(local.label_ids, [y.id]);
  assert.deepStrictEqual(call('GET', '/api/projects/').data.map((p) => p.name), ['Office']);
  // made and removed offline: the server never hears of it
  const tmp = call('POST', '/api/projects/', { name: 'Tmp' }).data;
  call('DELETE', `/api/projects/${tmp.id}`);

  srv.online = true;
  const s = await engine.sync();
  assert.deepStrictEqual(s.conflicts, []);
  assert.deepStrictEqual([...srv.projects.values()].map((p) => [p.name, p.color]), [['Office', '#f44336']]);
  assert.deepStrictEqual([...srv.labels.values()].map((l) => l.name), ['Why']);
  assert.strictEqual(srv.tasks.get(t.id).project_id, null);
  assert.deepStrictEqual(srv.tasks.get(t.id).label_ids, [y.id]);
  assert.ok(!srv.requests.some((r) => r.startsWith('POST projects')));
  noTempIds(store);
});

test("a label that can't be created doesn't cost the task", async () => {
  const { srv, store, engine, call } = setup();
  await engine.sync();
  srv.online = false;
  const urgent = call('POST', '/api/labels/', { name: 'Urgent' }).data;
  call('POST', '/api/tasks/', { title: 'Call back', label_ids: [urgent.id] });
  srv.addLabel({ name: 'urgent' }); // someone else was quicker
  srv.online = true;
  const s = await engine.sync();
  assert.strictEqual(s.conflicts.length, 1);
  assert.strictEqual(s.conflicts[0].kind, 'failed');
  assert.match(s.conflicts[0].detail, /already exists/);
  const t = [...srv.tasks.values()].find((x) => x.title === 'Call back');
  assert.deepStrictEqual(t.label_ids, []);
  noTempIds(store);
  assert.deepStrictEqual(call('GET', '/api/labels/').data.map((l) => l.name), ['urgent']);
});

test('helpers', () => {
  assert.strictEqual(normalizeServer(' 192.168.100.113/ '), 'http://192.168.100.113');
  assert.strictEqual(normalizeServer('https://pm.example.com'), 'https://pm.example.com');
  assert.strictEqual(versionAtLeast('1.31.0', '1.31.0'), true);
  assert.strictEqual(versionAtLeast('1.30.9', '1.31.0'), false);
  assert.strictEqual(versionAtLeast('2.0.0', '1.31.0'), true);
  assert.strictEqual(normalizeDeadline('2026-10-01'), '2026-10-01T00:00:00');
  assert.strictEqual(normalizeDeadline(null), null);
});

test('the app version matches the Tauri config', () => {
  const conf = path.join(__dirname, '..', '..', '..', 'desktop', 'src-tauri', 'tauri.conf.json');
  assert.strictEqual(JSON.parse(fs.readFileSync(conf, 'utf8')).version, DESKTOP_VERSION);
});
