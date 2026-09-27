// A stand-in for the Tauri updater plugin behind window.__TAURI__.
function fakeTauri({ update, failInstall = false }) {
  const calls = [];
  class Channel {
    constructor() {
      this.onmessage = null;
    }
  }
  window.__TAURI__ = {
    core: {
      Channel,
      invoke: async (cmd, args) => {
        calls.push(cmd);
        if (cmd === 'plugin:updater|check') return update;
        if (cmd === 'plugin:updater|download_and_install') {
          if (failInstall) throw new Error('signature mismatch');
          args.onEvent.onmessage({ event: 'Started', data: { contentLength: 200 } });
          args.onEvent.onmessage({ event: 'Progress', data: { chunkLength: 100 } });
          return null;
        }
        throw new Error(`unexpected ${cmd}`);
      },
    },
  };
  return calls;
}

// The updater keeps its state in the module: a fresh copy per test.
let updater;
beforeEach(() => {
  jest.resetModules();
  updater = require('./updater');
});

afterEach(() => {
  delete window.__TAURI__;
});

test('switched off outside the app', async () => {
  expect(updater.canUpdate()).toBe(false);
  expect((await updater.checkForUpdate()).checked).toBe(false);
});

test('reports an available update and installs it', async () => {
  const calls = fakeTauri({ update: { rid: 7, version: '0.3.0', body: 'Notes', date: null } });
  expect(updater.canUpdate()).toBe(true);
  const s = await updater.checkForUpdate();
  expect(s.available).toEqual({ version: '0.3.0', notes: 'Notes', date: null });
  await updater.installUpdate();
  expect(calls).toEqual(['plugin:updater|check', 'plugin:updater|download_and_install']);
  expect(updater.updateStatus().installing).toBe(true); // the installer closes the app from here
  expect(updater.updateStatus().progress).toBe(50);
});

test('no update', async () => {
  fakeTauri({ update: null });
  const s = await updater.checkForUpdate();
  expect(s.checked).toBe(true);
  expect(s.available).toBe(null);
});

test('a failed install is reported and can be retried', async () => {
  fakeTauri({ update: { rid: 8, version: '0.3.1' }, failInstall: true });
  await updater.checkForUpdate();
  await updater.installUpdate();
  const s = updater.updateStatus();
  expect(s.installing).toBe(false);
  expect(s.error).toBe('signature mismatch');
  expect(s.available.version).toBe('0.3.1');
});
