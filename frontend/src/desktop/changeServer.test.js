// Moving the app to a new address of the same server (desktop/index.js changeServer).
import { changeServer, store, whenReady } from './index';
import { getDesktopToken, getServer, setConnection } from './server';

jest.mock('./sync', () => ({
  SyncEngine: class {
    start() {
      return Promise.resolve();
    }
    stop() {}
    syncSoon() {}
  },
}));

// A fake server per address: who the token belongs to there (null: unknown token).
let servers;
beforeEach(async () => {
  servers = {};
  global.fetch = jest.fn(async (url, options = {}) => {
    const { origin, pathname } = new URL(url);
    const srv = servers[origin];
    if (!srv) throw new TypeError('Failed to fetch');
    const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
    if (pathname === '/api/v1/health') return srv.pm ? json(200, { status: 'ok', version: '1.50.0' }) : json(404, {});
    if (pathname === '/api/v1/auth/me') {
      const ok = options.headers?.Authorization === 'Bearer pm_token' && srv.user;
      return ok ? json(200, srv.user) : json(401, { detail: 'Could not validate credentials' });
    }
    return json(404, {});
  });
  await whenReady();
  setConnection('http://192.168.100.113', 'pm_token');
  store.setMeta('server', 'http://192.168.100.113');
  store.setMeta('me', { id: 7, username: 'bastian' });
});

test('same server, new address: switches and keeps the token and local copy', async () => {
  servers['http://192.168.100.114'] = { pm: true, user: { id: 7, username: 'bastian' } };
  store.put('tasks', { id: -1, title: 'made offline', local: true });
  await changeServer(' 192.168.100.114/ ');
  expect(getServer()).toBe('http://192.168.100.114');
  expect(store.getMeta('server')).toBe('http://192.168.100.114');
  expect(getDesktopToken()).toBe('pm_token');
  expect(store.get('tasks', -1).title).toBe('made offline');
});

test('another server or a wrong address: nothing changes', async () => {
  servers['http://other'] = { pm: true, user: null }; // token unknown there
  servers['http://someone-else'] = { pm: true, user: { id: 8, username: 'anna' } };
  servers['http://not-pm'] = { pm: false };
  await expect(changeServer('other')).rejects.toThrow('another server');
  await expect(changeServer('someone-else')).rejects.toThrow('another server');
  await expect(changeServer('not-pm')).rejects.toThrow('doesn’t look like a Project Manager server');
  await expect(changeServer('nowhere')).rejects.toThrow('Can’t reach');
  await expect(changeServer('  ')).rejects.toThrow('Enter the server address');
  expect(getServer()).toBe('http://192.168.100.113');
  expect(store.getMeta('server')).toBe('http://192.168.100.113');
});
