# Changelog — Windows app

Versions of the Windows app (`desktop-v…` tags); the server has its own
[CHANGELOG](../CHANGELOG.md).

## v0.1.0 — unreleased

### Added
- First version: the Project Manager interface in a Windows window (Tauri), connected to your server with an app token.
- **Works offline**: a local copy of everything you can see; tasks, subtasks and comments can be created, edited, ticked off and deleted offline and are synced in order when the server is reachable.
- **Sync status** in the top bar (online/offline, changes waiting, last sync; click to sync now) and *Settings → Windows app* (server, account, sync now, disconnect).
- **Conflicts** from edits made offline are detected (the server's version wins) and listed instead of silently overwriting someone else's change.
- Repeat rules (weekdays, "first Monday" style monthly dates, repeat from completion) can be set offline too; the app stores them the way the server does.
- Needs server v1.31.0 or newer. Repeat rules beyond every n days/weeks/months/years need v1.32.0.
