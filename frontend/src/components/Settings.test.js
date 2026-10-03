import { settingsPages } from './Settings';

const keys = (opts) => settingsPages(opts).map((p) => p.key);

test('Settings is split into sub-pages; the app puts its own first', () => {
  expect(keys({ desktop: false })).toEqual(['account', 'workspaces', 'tasks', 'integrations', 'app', 'backup', 'system', 'about']);
  expect(keys({ desktop: true })).toEqual(['app', 'account', 'workspaces', 'tasks', 'integrations', 'backup', 'system', 'about']);
  expect(settingsPages({ admin: true }).find((p) => p.key === 'system').label).toBe('Updates & users');
  expect(settingsPages({ admin: false }).find((p) => p.key === 'system').label).toBe('Updates');
});
