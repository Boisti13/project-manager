// Updates for the Windows app: the Tauri updater plugin checks the release
// feed (latest.json on the "desktop-updates" GitHub release), downloads the
// new installer, verifies its signature and runs it; the installer closes and
// restarts the app. Talks to the plugin through window.__TAURI__ (the app has
// withGlobalTauri on), so in a browser this is all switched off.

const tauri = () => (typeof window !== 'undefined' ? window.__TAURI__ : undefined);

export const canUpdate = () => Boolean(tauri()?.core?.invoke);

const listeners = new Set();
let state = { checking: false, checked: false, available: null, installing: false, progress: null, error: null };
let pending = null; // what the plugin returned for the available update (holds its resource id)

function set(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export const updateStatus = () => state;

export function subscribeUpdates(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Asks the release feed whether there's a newer version. */
export async function checkForUpdate() {
  if (!canUpdate() || state.checking || state.installing) return state;
  set({ checking: true, error: null });
  try {
    const meta = await tauri().core.invoke('plugin:updater|check', {});
    pending = meta || null;
    set({
      checking: false,
      checked: true,
      available: meta ? { version: meta.version, notes: meta.body || '', date: meta.date || null } : null,
    });
  } catch (err) {
    set({ checking: false, error: String(err?.message || err) });
  }
  return state;
}

/** Downloads and installs the available update; the app closes and restarts. */
export async function installUpdate() {
  if (!pending || state.installing) return;
  set({ installing: true, progress: 0, error: null });
  const { core } = tauri();
  const channel = new core.Channel();
  let total = 0;
  let done = 0;
  channel.onmessage = (e) => {
    if (e.event === 'Started') total = e.data?.contentLength || 0;
    else if (e.event === 'Progress') {
      done += e.data?.chunkLength || 0;
      if (total) set({ progress: Math.min(100, Math.round((done * 100) / total)) });
    } else if (e.event === 'Finished') set({ progress: 100 });
  };
  try {
    await core.invoke('plugin:updater|download_and_install', { onEvent: channel, rid: pending.rid });
  } catch (err) {
    set({ installing: false, progress: null, error: String(err?.message || err) });
  }
}
