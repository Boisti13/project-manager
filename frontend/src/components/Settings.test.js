import { isCaCertificate, settingsPages } from './Settings';

const keys = (opts) => settingsPages(opts).map((p) => p.key);

test('Settings is split into sub-pages; the app puts its own first', () => {
  expect(keys({ desktop: false })).toEqual(['account', 'workspaces', 'tasks', 'integrations', 'app', 'backup', 'updates', 'about']);
  expect(keys({ desktop: true })).toEqual(['app', 'account', 'workspaces', 'tasks', 'integrations', 'backup', 'updates', 'about']);
  // Users: a page of its own, for admins only
  expect(keys({ desktop: false, admin: true })).toEqual(['account', 'workspaces', 'tasks', 'integrations', 'app', 'backup', 'updates', 'users', 'about']);
});

test('the CA link only shows when /ca.crt is a certificate, not the app page', () => {
  const res = (ok, type) => ({ ok, headers: { get: () => type } });
  expect(isCaCertificate(res(true, 'application/x-x509-ca-cert'))).toBe(true);
  expect(isCaCertificate(res(true, 'text/html'))).toBe(false); // behind a proxy: the app's page
  expect(isCaCertificate(res(false, 'application/x-x509-ca-cert'))).toBe(false);
  expect(isCaCertificate(undefined)).toBe(false);
});
