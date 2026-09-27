# Project Manager for Windows

A Windows app for Project Manager that **keeps working without a connection**
and syncs with your server when it's reachable again (at home, in the office,
or over ZeroTier/VPN).

It's the same interface as the web app — My day, the task list, board and
calendar, labels, dependencies, comments, English/German — in its own window,
with a local copy of your data.

## Using it

1. Install `Project Manager_<version>_x64-setup.exe` (from the
   [releases](https://github.com/Boisti13/project-manager/releases) tagged
   `desktop-v…`, or the latest build under *Actions → Windows app →
   Artifacts*). It installs for the current user; no admin rights needed.
   The installer isn't code-signed yet, so on first run Windows SmartScreen
   warns ("Windows protected your PC"): click **More info → Run anyway**.
2. On first start, enter the **server address** (e.g. `192.168.100.113`),
   your username and password. The password is used once to create an **app
   token** — it shows up in the web app under *Settings → API tokens*
   ("Windows app (date)") and can be revoked there.
3. Work as usual. The **status in the top bar** shows whether the app is
   online, how many changes are waiting, and when it last synced; click it to
   sync now.

### Offline

- Everything you can see stays available offline, including comments.
- **Offline you can**: create, edit, tick off and delete tasks and subtasks
  (also several at once), reorder them, and write, edit and delete comments.
  The changes wait in a queue and are sent in order once the server is
  reachable — within a few seconds of any change, every 30 seconds, and when
  the window gets focus.
- **Needs a connection**: projects and categories, labels, settings, users,
  updates, backups, export/import, the task history and notifications.
  Offline, these say so instead of failing silently.
- **Conflicts**: if someone changed the same field of a task on the server
  while you were offline, your change to it isn't saved — the server's
  version wins, and the top bar shows *⚠ n changes not saved*; *Settings →
  Windows app* lists them. Changes to *different* fields of the same task are
  merged.
- *Log Out* disconnects the app and deletes its local copy (it warns if
  changes are still waiting).

## How it works

- `desktop/src-tauri/` — the [Tauri](https://tauri.app) shell: a native
  window with the system's WebView2 showing the React frontend. No
  server-side code; no Rust commands so far.
- `frontend/src/desktop/` — the offline layer, active only in builds with
  `REACT_APP_TARGET=desktop`:
  - `store.js` — the local copy (IndexedDB in the app's WebView profile),
  - `localApi.js` — answers the frontend's API calls from it and queues changes
    (items created offline get temporary negative ids and a UUID),
  - `sync.js` — sends the queue (with `expected` values, so concurrent edits
    become conflicts instead of overwrites), then `GET /api/v1/sync/?since=…`,
  - `index.js` — `desktopFetch()`, connecting and disconnecting.
- The server needs **v1.31.0 or newer** (sync endpoint); the app checks when
  connecting. See [docs/API.md](../docs/API.md) → *Keeping a copy*.

## Building

The installer is built by GitHub Actions ([`.github/workflows/desktop.yml`](../.github/workflows/desktop.yml))
on `windows-latest` whenever `frontend/` or `desktop/` changes:

```bash
cd frontend && npm ci && REACT_APP_TARGET=desktop npm run build
cd ../desktop
npx @tauri-apps/cli@^2 icon ../frontend/public/icon-512.png --output src-tauri/icons
npx @tauri-apps/cli@^2 build          # -> src-tauri/target/release/bundle/nsis/*.exe
```

Locally that needs Node.js 20 and Rust (plus the MSVC build tools and WebView2,
standard on Windows 10/11).

Releases: bump the version in `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` and `frontend/src/desktop/platform.js` (a test checks
they match), add a section to [CHANGELOG.md](CHANGELOG.md), and push a tag
`desktop-vX.Y.Z` — the workflow attaches the installer to a GitHub release.
