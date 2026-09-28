# Changelog — Windows app

Versions of the Windows app (`desktop-v…` tags); the server has its own
[CHANGELOG](../CHANGELOG.md).

## v0.2.8 — 2026-09-28

### Fixed
- **Task descriptions line up with the title** instead of starting at a fixed distance (server v1.39.2 interface).

## v0.2.7 — 2026-09-28

### Fixed
- **Shift+click in select mode** picks the whole range between two tasks (server v1.39.1 interface).

## v0.2.6 — 2026-09-28

### Added
- **Change several tasks at once** (*☑ Select* on the Tasks page): status, priority, project, assignee, deadline, labels or delete for all selected tasks, with Undo — also offline; the changes are sent as one update per task when the app is back online (server v1.39.0 interface).

## v0.2.5 — 2026-09-28

### Added
- **Weekly review** page (◷ *Review*) — works offline too (server v1.38.0 interface).
- **Undo** after deleting a task or ticking one off, instead of "Are you sure?".
- **Task templates**: *Save as template…* in the ⋯ menu and *From template* in the task form (need the connection to the server and server v1.38.0).

## v0.2.4 — 2026-09-28

### Added
- **Time estimates** on tasks, with the open work per project and category — also offline (server v1.37.0 interface; needs server v1.37.0 to sync them).
- **Saved filters** as ★ chips above the filters (need the connection to the server; offline they're not shown).
- **Keyboard shortcuts** on the Tasks page — press **?** for the list.

## v0.2.3 — 2026-09-28

### Changed
- **Priority is picked by name** — Low / Medium / High / Critical instead of a number (server v1.36.0 interface).
- **Delete buttons show a trash can** instead of ✕ (server v1.36.1 interface).

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
