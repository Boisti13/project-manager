# Project Manager for Windows and Linux

An app for Project Manager on **Windows** and **Linux** (x86_64 and ARM64) that **keeps working without a connection**
and syncs with your server when it's reachable again (at home, in the office,
or over ZeroTier/VPN).

It's the same interface as the web app — My day, the task list, board and
calendar, labels, dependencies, comments, English/German — in its own window,
with a local copy of your data.

## Installing

Downloads are on the [releases](https://github.com/Boisti13/project-manager/releases?q=desktop-v&expanded=true)
tagged `desktop-v…` (or the latest build under *Actions → Desktop apps →
Artifacts*):

| System | File | Updates |
|---|---|---|
| Windows 10/11 (x64) | `Project.Manager_<version>_x64-setup.exe` | itself |
| Linux x86_64, any distribution | `Project.Manager_<version>_amd64.AppImage` | itself |
| Linux ARM64 (e.g. Raspberry Pi 4/5 with a 64-bit OS) | `Project.Manager_<version>_aarch64.AppImage` | itself |
| Debian, Ubuntu, Mint, Raspberry Pi OS — x86_64 | `Project.Manager_<version>_amd64.deb` | install the new package |
| … ARM64 | `Project.Manager_<version>_arm64.deb` | install the new package |

- **Windows**: run the installer. It installs for the current user; no admin
  rights needed. The installer isn't code-signed yet, so on first run Windows
  SmartScreen warns ("Windows protected your PC"): click **More info → Run
  anyway**. With **Smart App Control** switched on, Windows blocks unsigned
  apps outright; it has to be off to install the app.
- **AppImage**: make it executable and start it —
  `chmod +x Project.Manager_*.AppImage && ./Project.Manager_*.AppImage`
  (or *Properties → Allow executing as program* in the file manager). Keep it
  somewhere it can be replaced, e.g. `~/Applications`, so it can update
  itself. If it says FUSE is missing, install `libfuse2` (Ubuntu 24.04:
  `libfuse2t64`) or start it with `--appimage-extract-and-run`.
- **.deb**: `sudo apt install ./Project.Manager_*_amd64.deb` (or `_arm64`).
  It pulls in WebKitGTK and shows up in the app menu as *Project Manager*.
  Updates: the app shows when there's a new version and links to its
  download page; install the new `.deb` the same way.

The Linux builds need a system from about 2022 on (Debian 12, Ubuntu 22.04,
Mint 21, Fedora 36, Raspberry Pi OS Bookworm or newer). If the server uses
**HTTPS with its own CA**, add the CA to the system's trusted certificates
(see [DEPLOYMENT.md → HTTPS](../DEPLOYMENT.md#trusting-the-certificate-on-your-devices-once-per-device)).

## Using it

1. Install the app (see above).
2. On first start, enter the **server address** (e.g. `192.168.100.113`),
   your username and password. The password is used once to create an **app
   token** — it shows up in the web app under *Settings → API tokens*
   ("Windows app (date)" or "Linux app (date)") and can be revoked there.
3. Work as usual. The **status in the top bar** shows whether the app is
   online, how many changes are waiting, and when it last synced; click it to
   sync now.
4. **Updates** (from v0.2.0): the app looks for a new version when it starts
   and every six hours. When there is one, the top bar shows *⬆ Update
   x.y.z*; *Settings → Windows app* (or *Linux app*) *→ Install and
   restart* downloads it, installs it and restarts the app. Changes still
   waiting to be sent are kept. *Check for updates* looks right away. The
   **.deb** can't replace itself: there the settings link to the new
   version's download page instead. (v0.1.0 has no updater: install v0.2.0
   once by hand.)
5. **App and server versions** (from v0.3.0): the app's interface is built
   from a certain server version (*Settings → Windows/Linux app → App version*,
   e.g. "interface of server 1.40.0"). When the server has gained features
   since then and there's no app update to bring them yet, the top bar shows
   *⚠ App older than the server* (the web app already has them). The other
   way round — the app is newer than the server — shows *⚠ Server older than
   the app*: some features won't work until the server is updated. Only
   feature releases count (1.40 → 1.41), not fix or docs releases; the
   server's version is looked up while syncing, at most every 10 minutes.

### Offline

- Everything you can see stays available offline, including comments.
- Links in descriptions and comments open in your normal browser.
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
  Windows/Linux app* lists them. Changes to *different* fields of the same task are
  merged.
- *Log Out* disconnects the app and deletes its local copy (it warns if
  changes are still waiting).

## How it works

- `desktop/src-tauri/` — the [Tauri](https://tauri.app) shell: a native
  window with the system's web view (WebView2 on Windows, WebKitGTK on
  Linux) showing the React frontend. No server-side code; the plugins are the
  updater, the opener (links open in the browser) and the HTTP client: on
  Linux the app's requests to the server go through it, since WebKitGTK
  treats the app's page as secure and would block plain-HTTP requests
  (`frontend/src/desktop/server.js`). A small command, `install_kind`, tells
  the frontend whether it runs from an installer, an AppImage or a package.
- `frontend/src/desktop/` — the offline layer, active only in builds with
  `REACT_APP_TARGET=desktop`:
  - `store.js` — the local copy (IndexedDB in the app's WebView profile),
  - `localApi.js` — answers the frontend's API calls from it and queues changes
    (items created offline get temporary negative ids and a UUID),
  - `sync.js` — sends the queue (with `expected` values, so concurrent edits
    become conflicts instead of overwrites), then `GET /api/v1/sync/?since=…`,
  - `index.js` — `desktopFetch()`, connecting and disconnecting,
  - `updater.js` — checking for and installing new versions (see *Updates*).
- The server needs **v1.31.0 or newer** (sync endpoint); the app checks when
  connecting. See [docs/API.md](../docs/API.md) → *Keeping a copy*.

## Building

GitHub Actions ([`.github/workflows/desktop.yml`](../.github/workflows/desktop.yml),
*Desktop apps*) builds everything whenever `frontend/` or `desktop/` changes:
the frontend once (with its tests), then the Windows installer on
`windows-latest` and the AppImage and .deb on `ubuntu-22.04` (x86_64) and
`ubuntu-22.04-arm` (ARM64, native, no cross-compiling). Each AppImage is
started on a virtual display for 20 seconds as a check that it runs.

```bash
cd frontend && npm ci && REACT_APP_TARGET=desktop npm run build
cd ../desktop
npx @tauri-apps/cli@^2 icon ../frontend/public/icon-512.png --output src-tauri/icons
npx @tauri-apps/cli@^2 build --bundles nsis           # Windows -> src-tauri/target/release/bundle/nsis/*.exe
npx @tauri-apps/cli@^2 build --bundles appimage,deb   # Linux   -> …/bundle/appimage/*.AppImage, …/bundle/deb/*.deb
```

Locally that needs Node.js 20 and Rust, plus on Windows the MSVC build tools
and WebView2 (standard on Windows 10/11), on Linux
`libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev file`
(Debian/Ubuntu package names).

Releases: bump the version in `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` and `frontend/src/desktop/platform.js` (a test checks
they match), add a section to [CHANGELOG.md](CHANGELOG.md), and push a tag
`desktop-vX.Y.Z` — the workflow attaches all five files to one GitHub
release and updates the update feed, so installed apps offer it.

## Updates

The app uses the [Tauri updater](https://v2.tauri.app/plugin/updater/). It
reads `latest.json` from the GitHub release **`desktop-updates`** (a fixed
release that only holds that file; the workflow replaces it on every
`desktop-v*` tag). The file names the newest version, its release notes (the
CHANGELOG section) and, per platform (`windows-x86_64`, `linux-x86_64`,
`linux-aarch64`), the download URL and its **update signature**. The app
installs only files whose signature matches the public key built into it
(`plugins.updater.pubkey` in `tauri.conf.json`). On Windows the installer
runs in passive mode: it shows progress, needs no clicks and restarts the
app; an AppImage is replaced in place. A `.deb` isn't updated this way (it
would need root): the app only reports the new version.

Signing updates is free and unrelated to Windows code signing. The key pair
is a minisign key; the private key and its password are stored as the
repository secrets **`TAURI_SIGNING_PRIVATE_KEY`** and
**`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`**. Builds without them (e.g. pull
requests from forks) skip the update signature; a release without it fails.

**Keep a backup of the private key and its password** (e.g. in a password
manager). Without them no update can be signed that installed apps accept —
they would have to reinstall a version with a new key by hand.
