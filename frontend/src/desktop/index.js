// Wiring for the Windows app: one local store, one sync engine, and
// desktopFetch() in place of the web app's fetch (see AuthContext.authFetch).
import { Store, IdbPersistence } from './store';
import { LocalApi } from './localApi';
import { SyncEngine } from './sync';
import {
  getServer, getDesktopToken, setConnection, normalizeServer, serverFetch, versionAtLeast, OfflineError,
} from './server';
import { MIN_SERVER_VERSION } from './platform';
import { t } from '../i18n';

export const store = new Store(typeof indexedDB !== 'undefined' ? new IdbPersistence() : null);
export const localApi = new LocalApi(store);
export const engine = new SyncEngine(store, (path, options) => serverFetch(path, options));

// Loaded once, on first use (never in the web app); everything waits for it.
let loading = null;
export const whenReady = () => {
  if (!loading) loading = store.load().catch(() => store.reset());
  return loading;
};

const jsonResponse = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Server-only calls that have a sensible offline answer.
const OFFLINE_FALLBACKS = [
  [/\/notifications\/?$/, () => ({ unread: 0, items: [] })],
  [/\/tasks\/-?\d+\/activity$/, () => []],
];

/** The app's API calls: local copy first, the server for everything else. */
export async function desktopFetch(url, options = {}) {
  await whenReady();
  const method = (options.method || 'GET').toUpperCase();
  let body = null;
  if (typeof options.body === 'string') {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = null;
    }
  }
  const local = localApi.handle(method, url, body);
  if (local) {
    if (local.changed) {
      await store.flush();
      engine.syncSoon();
    }
    return jsonResponse(local.status, local.data);
  }
  const path = new URL(url, 'http://local');
  try {
    const res = await serverFetch(path.pathname + path.search, options);
    // Changes made directly on the server (projects, labels, settings, …):
    // fetch them into the local copy.
    if (method !== 'GET' && res.ok) engine.syncSoon(300);
    return res;
  } catch (err) {
    if (!(err instanceof OfflineError)) throw err;
    const fallback = OFFLINE_FALLBACKS.find(([re]) => re.test(path.pathname));
    if (fallback && method === 'GET') return jsonResponse(200, fallback[1]());
    return jsonResponse(503, { detail: t('Not available offline — this needs a connection to the server.') });
  }
}

export const isConnected = () => !!getDesktopToken();
export { getServer };

async function readError(res, fallback) {
  const data = await res.json().catch(() => ({}));
  if (typeof data.detail === 'string') return data.detail;
  return fallback;
}

/**
 * Connect to a server: log in once with username and password, create a
 * personal API token for this app (visible and revocable in the web app
 * under Settings -> API tokens) and download everything.
 */
export async function connect(serverInput, username, password) {
  const server = normalizeServer(serverInput);
  if (!server) throw new Error(t('Enter the server address.'));
  const call = (path, options, auth) => serverFetch(path, options, { server, token: auth || '' });

  let health;
  try {
    health = await call('/api/v1/health', {});
  } catch {
    throw new Error(t('Can’t reach {server}. Check the address and your network (or ZeroTier).', { server }));
  }
  if (!health.ok) throw new Error(t('{server} doesn’t look like a Project Manager server.', { server }));
  const { version } = await health.json();
  if (!versionAtLeast(version, MIN_SERVER_VERSION)) {
    throw new Error(t('The server runs version {version}; the app needs {minimum} or newer. Update the server first.', {
      version, minimum: MIN_SERVER_VERSION,
    }));
  }

  const form = new URLSearchParams({ username, password });
  const login = await call('/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
  });
  if (!login.ok) throw new Error(await readError(login, t('Login failed')));
  const { access_token: session } = await login.json();

  const device = new Date().toLocaleDateString();
  const created = await call('/api/v1/auth/tokens/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: t('Windows app ({date})', { date: device }) }),
  }, session);
  if (!created.ok) throw new Error(await readError(created, t('Could not create an app token.')));
  const { token } = await created.json();

  const meRes = await call('/api/v1/auth/me', {}, token);
  const me = await meRes.json();

  // Another server or another account: start with an empty local copy.
  await whenReady();
  const previous = store.getMeta('me');
  if (store.getMeta('server') !== server || (previous && previous.id !== me.id)) await store.clearAll();
  setConnection(server, token);
  store.setMeta('server', server);
  store.setMeta('me', me);
  await store.flush();
  await engine.start();
  return me;
}

/** Forget the token; with wipe, also the local copy (and unsent changes). */
export async function disconnect({ wipe = false } = {}) {
  engine.stop();
  setConnection(null, null);
  if (wipe) await store.clearAll();
}
