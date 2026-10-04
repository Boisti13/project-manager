# Changelog — Windows and Linux app

Versions of the app for Windows and Linux (`desktop-v…` tags); the server has its own
[CHANGELOG](../CHANGELOG.md).

## v0.14.3 — 2026-10-04

### Changed
- *Change address* sits in front of the server's address in the settings (server v1.50.3 interface).

## v0.14.2 — 2026-10-04

### Changed
- *Settings → Updates* and *Settings → Users* are two pages (server v1.50.2 interface).

## v0.14.1 — 2026-10-04

### Fixed
- *Change address*: the field is wide enough for a whole address (server v1.50.1 interface).

## v0.14.0 — 2026-10-04

### Added
- **Change the server's address** (*Settings → Windows/Linux app → Server → Change address*) when the server moved, e.g. to a new IP: the app checks it's the same server and keeps the local copy and unsent changes. While it can't reach the server, the settings point to it.
- **Ctrl+K searches everything** (also offline, in the app's local copy) and **quick add on My day** (server v1.50.0 interface).

## v0.13.2 — 2026-10-04

### Changed
- No date and time in the top bar when the window is phone-narrow (server v1.49.1 interface).

## v0.13.1 — 2026-10-04

### Changed
- **Windows: install for all users** — the installer now asks whether to install just for you (user folder, no admin rights, silent updates, as before) or for all users in *Program Files* (admin rights; updates ask for them too). Existing installs stay where they are; see the README to move one.

## v0.13.0 — 2026-10-04

### Added
- Date and time in the top bar, so you always know where you are in the day (server v1.49.0 interface).

## v0.12.0 — 2026-10-03

### Changed
- The Home Assistant REST YAML in Settings includes the task titles and the *Next task* sensor (server v1.48.0 interface).

## v0.11.1 — 2026-10-03

### Fixed
- The MQTT broker settings keep your changes until you save them (server v1.47.1 interface).

## v0.11.0 — 2026-10-03

### Added
- Settings has a page per topic, the app's own first; *Settings → Calendar & Home Assistant*: the REST sensor YAML for your server, the MQTT opt-in, and (for admins) the broker settings (server v1.47.0 interface; needs server v1.47.0).

## v0.10.0 — 2026-10-02

### Added
- Quick entry with repeats and start dates, and per line in *Several (one per line)* — also offline; the bell marks notifications from other workspaces (server v1.46.0 interface; per-line fields need server v1.46.0).

## v0.9.0 — 2026-10-02

### Added
- *Connect* asks for the code from your authenticator app when two-factor login is on.
- **Quick entry** in a new task's title (*tomorrow !high #label @name*), also offline; the calendar feed link per workspace (server v1.45.0 interface; two-factor login needs server v1.45.0).

## v0.8.0 — 2026-10-02

### Added
- **Workspaces** (server v1.44.0 interface; needs server v1.44.0): the switch in the top bar shows one workspace at a time, also offline (the last known list is kept); setting them up needs a connection.

## v0.7.0 — 2026-09-29

### Added
- **Linux app**: the same app for Linux, for **x86_64 and ARM64** (e.g. a Raspberry Pi 4/5 or other ARM boards), each as an **AppImage** (runs anywhere, updates itself like the Windows app) and a **.deb** (Debian, Ubuntu, Mint, Raspberry Pi OS; updated by installing the new package — the app says when there is one and links to the download). Built on Ubuntu 22.04, so it runs on Debian 12 / Ubuntu 22.04 and newer.
- The Linux app reaches the server through its own HTTP client (the system's web view would block plain-HTTP requests); it trusts certificates from CAs added to the system, e.g. the server's own CA.

### Changed
- *Settings → Windows app* is *Linux app* on Linux, and the app's API token is named *Linux app (date)* there.
- Releases now hold all builds: the Windows installer, two AppImages and two .deb packages.

## v0.6.2 — 2026-09-29

### Fixed
- The task list **stays where you are** after creating or changing a task instead of jumping to the top (server v1.43.2 interface).

## v0.6.1 — 2026-09-29

### Changed
- The **+** on a project or category opens the new-task form right there, not at the top (server v1.43.1 interface).

## v0.6.0 — 2026-09-29

### Added
- **Timeline view (Gantt chart)** with bars, milestones and dependency arrows; drag bars to change dates — also offline. **Start dates** for tasks (server v1.43.0 interface; needs server v1.43.0 to sync them).

## v0.5.2 — 2026-09-29

### Changed
- **Tasks in a category are indented** under the category's header (server v1.42.2 interface).

## v0.5.1 — 2026-09-28

### Changed
- **Categories stand out more** in the task list: a light band in the project's color, larger bold name (server v1.42.1 interface).

## v0.5.0 — 2026-09-28

### Added
- **@mentions in comments** with suggestions while typing, and **pinned tasks** at the top of My day (server v1.42.0 interface). Pinning needs the connection to the server; offline, My day shows the pins it knew last.

## v0.4.0 — 2026-09-28

### Added
- **Formatted descriptions and comments** with clickable links, which open in your browser (server v1.41.0 interface).
- **Archived projects** stay out of the lists and choices, also offline; archiving, restoring and **read-only share links** are on the Projects page (need the connection to the server).

## v0.3.0 — 2026-09-28

### Added
- **Warning when the app and the server don't match**: *⚠ App older than the server* when the server has features the app doesn't show yet (and there's no app update for them), *⚠ Server older than the app* the other way round. *Settings → Windows app* shows both versions and what to do (server v1.40.0 interface).

### Changed
- The **⬆ Update** pill is readable on the blue bar (white with blue text).

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
