// Talking to the server from the Windows/Linux app: which server, which token.
// The token is a personal API token created when connecting (it shows up
// in the web app under Settings -> API tokens and can be revoked there).

const SERVER_KEY = 'pm.desktop.server';
const TOKEN_KEY = 'pm.desktop.token';

const read = (key) => {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
};

export const getServer = () => read(SERVER_KEY);
export const getDesktopToken = () => read(TOKEN_KEY);

export function setConnection(server, token) {
  try {
    if (server) localStorage.setItem(SERVER_KEY, server);
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to do: without storage the app can't stay connected
  }
}

/** "192.168.100.113" -> "http://192.168.100.113" (no trailing slash). */
export function normalizeServer(input) {
  let s = (input || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/+$/, '');
}

/** "1.31.0" >= "1.30.2" */
export function versionAtLeast(version, minimum) {
  const parts = (v) => String(v || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const [a, b] = [parts(version), parts(minimum)];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return true;
}

export class OfflineError extends Error {}

// Linux app: WebKitGTK treats the app's own page as secure and would block
// plain-HTTP requests to the server, so they go through Tauri's HTTP client
// (Rust) instead. Windows' WebView2 allows them directly.
const NATIVE_HTTP = typeof navigator !== 'undefined' && /Linux/.test(navigator.userAgent) && !!window.__TAURI__;
let nativeFetch = null;
const httpFetch = async (url, options) => {
  if (!NATIVE_HTTP) return fetch(url, options);
  if (!nativeFetch) nativeFetch = (await import('@tauri-apps/plugin-http')).fetch;
  const { keepalive, ...rest } = options; // not supported there (and not needed: the app keeps running)
  return nativeFetch(url, rest);
};

/** fetch() against the configured server; OfflineError when it can't be reached. */
export async function serverFetch(path, options = {}, { server = getServer(), token = getDesktopToken() } = {}) {
  const headers = { ...(options.headers || {}) };
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
  try {
    return await httpFetch(server + path, { ...options, headers });
  } catch (err) {
    throw new OfflineError(err.message);
  }
}
