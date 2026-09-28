# Changelog — Windows app

Versions of the Windows app (`desktop-v…` tags); the server has its own
[CHANGELOG](../CHANGELOG.md).

## v0.2.2 — 2026-09-28

### Changed
- **Edit and Add subtask open right below the task** in the list instead of at the top, with the cursor in the title (server v1.34.0 interface).
- **Save and Cancel at the top of the form**, staying in view while scrolling; *type → Enter* creates a task, **Ctrl+Enter** saves from any field, **Esc** cancels (server v1.33.0 interface).

## v0.2.1 — 2026-09-27

### Changed
- First release delivered through the in-app updater (no changes to the app itself).
- Build: GitHub Actions updated off the deprecated Node.js 20 (checkout, setup-node, upload-artifact v7).

## v0.2.0 — 2026-09-27

### Added
- **Updates from within the app**: it checks for new versions on start and every six hours, shows *⬆ Update x.y.z* in the top bar, and *Settings → Windows app → Install and restart* downloads, installs and restarts it — changes waiting to be sent are kept. Updates are signed; the app only installs ones signed with the project's update key.

## v0.1.0 — 2026-09-27

### Added
- First version: the Project Manager interface in a Windows window (Tauri), connected to your server with an app token.
- **Works offline**: a local copy of everything you can see; tasks, subtasks and comments can be created, edited, ticked off and deleted offline and are synced in order when the server is reachable.
- **Sync status** in the top bar (online/offline, changes waiting, last sync; click to sync now) and *Settings → Windows app* (server, account, sync now, disconnect).
- **Conflicts** from edits made offline are detected (the server's version wins) and listed instead of silently overwriting someone else's change.
- Repeat rules (weekdays, "first Monday" style monthly dates, repeat from completion) can be set offline too; the app stores them the way the server does.
- Needs server v1.31.0 or newer. Repeat rules beyond every n days/weeks/months/years need v1.32.0.
