import { settingsPages } from './Settings';

const keys = (opts) => settingsPages(opts).map((p) => p.key);

test('Settings is split into sub-pages; the app puts its own first', () => {
  expect(keys({ desktop: false })).toEqual(['account', 'workspaces', 'tasks', 'integrations', 'app', 'backup', 'updates', 'about']);
  expect(keys({ desktop: true })).toEqual(['app', 'account', 'workspaces', 'tasks', 'integrations', 'backup', 'updates', 'about']);
  // Users: a page of its own, for admins only
  expect(keys({ desktop: false, admin: true })).toEqual(['account', 'workspaces', 'tasks', 'integrations', 'app', 'backup', 'updates', 'users', 'about']);
});
