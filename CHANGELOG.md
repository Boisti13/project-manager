# Changelog

All notable changes, newest first. Versions follow [semantic versioning](README.md#versioning); each release is tagged `vX.Y.Z` on `main`.

## v1.23.0 — 2026-09-26

### Added
- **Private projects.** In the project form, *Visibility*: **Everyone** (default, as before) or **🔒 Private — only members and admins**, with a member picker. A private project, its categories, tasks, subtasks, comments and history are visible only to its members and to admins; for everyone else they don't exist (lists leave them out, direct links answer *not found*, comment search skips them).
- The Projects page shows a **🔒 Private** badge and the members; the Tasks page a 🔒 next to the project name.
- Tasks in a private project can only be **assigned to members** (the assignee list only offers them); a task assigned to a non-member can't be moved into the project.
- The creator of a private project is a member; members can change the members and the visibility, and non-admins stay members of projects they manage (so nobody locks themselves out). Categories always follow their project.
- Notifications about tasks you can no longer see are hidden, and comments don't notify people who can't see the task.
- Export only includes projects you can see; the *private* flag is exported, and an imported private project gets the importing user as its member.

### Under the hood
- Migration `0008`: `projects.is_private`, `project_members` table; all checks in `backend/app/access.py`.
- 8 new backend tests (115 in total), frontend test for the project-index helpers.

### Fixed
- Two database backups started within the same second (e.g. *Back up now* while the nightly one runs) no longer overwrite each other; the second gets a `_2` suffix.

## v1.22.0 — 2026-09-26

### Added
- **Board view** (Tasks → *Board*): To Do / In Progress / Blocked / Done columns of the top-level tasks. Drag cards between columns, or use ◀ ▶ on a card (touch). Cards show project/category, priority, deadline (red when overdue), repeat, subtask progress, comments and assignee; ✎ edits, the title opens the task in the list. Done shows the 15 most recently completed (*Show n more*). On phones the columns scroll sideways.
- **Calendar view** (Tasks → *Calendar*): month grid (Monday first) of all deadlines, subtasks included, colored by project; overdue in red, done struck through. Click a day to list its tasks below the grid; **drag a task onto another day to move its deadline**. ◀ ▶ and *Today* to navigate; a note counts open tasks without a deadline. On phones days show colored dots.
- The view is part of the URL (`?view=board`) and search, filters and *Assigned to me* apply to all views.

### Changed
- Next-deadline dates on the Projects page use the same format as the task list (*Sep 29*).

## v1.21.0 — 2026-09-26

### Added
- **Progress overview on the Projects page.** Every project shows a progress bar in its color, **% done** and *x of y done* (its categories included), plus **open**, **overdue** and **due this week** counts — each a link to the Tasks page with that filter set — and the **next deadline** (a link to the task).
- Categories get their own mini progress bar, *done/total* and an overdue count.
- Counts are top-level tasks (subtasks are a task's checklist); archived done tasks count as done.

## v1.20.0 — 2026-09-26

### Added
- **Nightly database backup** at 03:15 (`/etc/cron.d/project-manager`, installed by `install.sh` and by the next update). **Settings → Backup & export → Back up automatically every night** turns it off and on (on by default); output in `/var/log/project-manager-backup.log`.
- **Link to the source on GitHub** in the footer.

### Changed
- Backup retention counts **nightly and other backups separately** (newest N of each), so nightly dumps never push out the backup taken before an update.
- `install.sh` also installs `cron`.

## v1.19.0 — 2026-09-26

### Added
- **Task history.** The 💬 panel shows what happened to a task, interleaved with the comments: who created it, and who changed its status, assignee, project/category, title, description, deadline, priority or repeat setting — e.g. *anna changed priority from High to Critical*, *preview took it on*, *bob completed it*. Repeating tasks note when the next occurrence was created.
- **Hide history / Show history (n)** in the panel to see only the comments; the choice is remembered in the browser.
- The history refreshes while the panel is open when the task changes.
- Names are stored as they were at the time, so the history stays readable after users or projects are renamed or deleted; it's removed together with the task. Saving the form without changes adds nothing.

### Under the hood
- Migration `0007`: `task_activity` table; logging in `backend/app/activity.py`; `GET /api/tasks/{id}/activity`.
- 3 new backend tests (105 in total), frontend test for the history sentences.
- Not part of project export/import (comments still are).

## v1.18.0 — 2026-09-26

### Added
- **Recurring tasks.** *Repeat* in the task form: every N days, weeks, months or years. Ticking a repeating task off creates the next occurrence — same title, description, project, assignee and priority — with the deadline moved forward **on its schedule** (a weekly Monday task stays on Mondays; if it's finished very late the next date is the first one not in the past). Month steps clamp to the month's end (31 Jan → 28/29 Feb). Subtasks are copied as a fresh, unticked checklist. Without a deadline, the next one is due one interval after today.
- A **↻ badge** ("weekly", "3 d") on repeating tasks.
- Unticking and re-ticking doesn't create a second occurrence; if the next one was deleted, ticking again creates a new one.
- Export/import keeps the repeat settings.

### Under the hood
- Migration `0006`: `tasks.recurrence_unit`, `recurrence_interval`, `recurrence_next_id`; logic in `backend/app/recurrence.py`.
- 11 new backend tests (102 in total), frontend test for the repeat labels.

## v1.17.0 — 2026-09-26

### Added
- **"⋯" menu on every task**: Add subtask, Edit, Move to…, Move up, Move down, Delete. On phones it opens as a bottom sheet with large touch targets.
- **Move up / Move down** — reordering that works on touchscreens (manual sort order; disabled with a hint otherwise). Moves stay within the task's list: same parent, and for top-level tasks the same project and open/completed section.
- **Move to…** another project or category, straight from the menu. Subtasks that followed the old project (or had none) move along; ones deliberately put elsewhere keep theirs. The task is scrolled to and highlighted in its new place.

### Changed
- On phones a task row shows only 💬 and ⋯ (add subtask / edit / delete are in the menu), so rows no longer wrap on narrow screens.
- Changing a task's project to one that doesn't exist is rejected (400).

## v1.16.0 — 2026-09-26

### Added
- **Notifications** in the bell: you're notified when someone **assigns you a task** (on create, edit or bulk add — a bulk add is one notification, "and 4 more tasks") and when someone **comments** on a task assigned to you or one you've commented on. Your own actions never notify you; deactivated users aren't notified. Unread items are highlighted and counted on the badge; opening the bell marks them read.
- **Jump to the task** from a notification or deadline: its project, category and parent tasks open, it scrolls into view and flashes briefly; comment notifications open the thread.
- **Assigned to me** switch next to the search, with the number of your open tasks.

### Changed
- The bell's deadline list only shows tasks assigned to you or to nobody (it showed everyone's before).
- On phones the bell dropdown sits right under the top bar.

### Under the hood
- Migration `0005`: `notifications` table (removed with its task or user; read ones are cleaned up after 60 days).
- New API: `GET /api/notifications/`, `POST /api/notifications/read`.
- 8 new backend tests (87 in total).

## v1.15.0 — 2026-09-26

### Changed
- **Dependencies updated** to current versions: FastAPI 0.141, SQLAlchemy 2.0.54, Pydantic 2.13, Alembic 1.20, Uvicorn 0.54 and friends (SQLAlchemy 2.1 needs Python 3.11; Ubuntu 22.04 installs have 3.10 — CI checks both). The PostgreSQL driver is now **psycopg 3**, named explicitly; connections always use UTF-8.
- **passlib → bcrypt** and **python-jose → PyJWT**: both old libraries are unmaintained, and passlib printed a bcrypt error on every start. Existing password hashes and login sessions keep working (covered by tests using credentials created with the old libraries), including passwords longer than bcrypt's 72-byte limit.
- **Frontend dependencies are locked** in `package-lock.json` (React 18.3, React Router 6.30); CI installs them with `npm ci`.
- Code uses current APIs (no more deprecated `class Config`, `datetime.utcnow()` or `declarative_base` import); the test suite now fails on any warning.

### Added
- **`scripts/fix-db-encoding.sh`**: converts databases created as `SQL_ASCII` (older hand-made installs) to UTF-8 — validates the text first, keeps the old database as a fallback, rolls back on any failure. `install.sh` runs it on re-installs; a no-op on UTF-8 databases.

### Removed
- `psycopg2-binary`, `passlib`, `python-jose` dependencies.

## v1.14.0 — 2026-09-26

### Added
- **Bulk entry — one task per line.** The task form has a new *Several (one per line)* mode: type or paste a list; indented lines (Tab or two spaces) become subtasks of the line above, at any depth. Bullets (`-`, `*`, `•`, `1.`) are stripped and Markdown checkboxes create done tasks (`- [x] …`). A live preview shows the tree and count; project/category, status, priority, deadline and assignee apply to every task. Available from *+ New Task*, a section's **+** (preset to that project/category) and a task's **+** (all lines become its subtasks). Tab / Shift+Tab indent and outdent the current line.
- New tasks appear expanded after a bulk add.

### Under the hood
- `POST /api/tasks/bulk`: creates the whole tree in one transaction (all or nothing), up to 500 tasks, appended after existing siblings; validates parent, project and assignee.
- `frontend/src/bulkParse.js` with Jest tests; 6 new backend tests (72 in total).

## v1.13.0 — 2026-09-26

### Changed
- **Registration is closed once an admin exists.** Only the very first account can sign up on its own (and becomes admin); after that the login page hides *Register* and says to ask an admin. Admins can re-open it with **Allow new registrations** in Settings → User Management. Existing installs are closed after updating.
- New passwords (registration, admin-set, change) need at least **8 characters**; existing passwords keep working. Usernames can't contain spaces (new accounts only).

### Added
- **Admins add users** (username, email, initial password, optional admin) and **set a new password** for any user, in Settings → User Management.
- **Change your own password** in Settings → *Your account*.
- Registration errors from the server are shown as readable messages.

### Fixed
- On phones the login page no longer shows the app header twice.

### Under the hood
- New API: `GET /api/auth/registration`, `POST /api/auth/change-password`, `POST /api/users/` (admin), `PUT /api/users/{id}/password` (admin); `allow_registration` in `/api/settings`.
- 9 new backend tests (66 in total).

## v1.12.1 — 2026-09-25

### Fixed
- **Deactivated users were not locked out**: they could still log in and keep using existing sessions. Login now refuses deactivated accounts ("This account has been deactivated") and their tokens stop working immediately.

### Added
- **Backend test suite** (`backend/tests/`, pytest against a real PostgreSQL — starts a throwaway server automatically): auth and users, projects/categories, tasks, comments, settings, export/import, backup endpoints, migrations, and the backup/restore scripts including rollback.
- **GitHub Actions CI**: backend tests on Python 3.10 and 3.12 with PostgreSQL 16, frontend tests and production build, shellcheck — on every push to `main`/`dev` and on pull requests.
- `PM_ENV_FILE` for `scripts/backup-db.sh` / `restore-db.sh` to read connection settings from a file other than `backend/.env`.

### Changed
- The two long-standing ESLint warnings in the frontend build are resolved.

## v1.12.0 — 2026-09-25

### Added
- **Comments on tasks**: a 💬 button on every task and subtask (with the comment count) opens its comment thread — author, time, *edited* marker; Ctrl+Enter to send. Authors can edit and delete their own comments, admins can delete any.
- Task search also finds tasks by the text of their comments.
- Project export/import includes comments; on another installation the original author's name is kept as text.

### Changed
- On phones the task row's action buttons are a little narrower so the comment button fits on the same line.

### Under the hood
- Migration `0004`: `task_comments` table (deleted together with its task).
- New API: `GET/POST /api/tasks/{id}/comments`, `PUT/DELETE /api/comments/{id}`, `GET /api/comments/search?q=`; tasks in `GET /api/tasks/` carry `comment_count`.

## v1.11.0 — 2026-09-25

Everything since v1.5.0 ships in this release (v1.6.0 – v1.10.0 were development versions on `dev`).

### Tasks
- **Tasks grouped by project**: collapsible sections per project, with sub-sections per category and *No project* last; tasks carry their project's color. "+" on a section creates a task pre-set to that project/category.
- **Done checkbox** on every task and subtask.
- **Completed rows**: ticked tasks move into a collapsed *✓ Completed (n)* row at the end of their project/category, most recent first.
- **Archiving**: tasks completed more than N days ago (Settings, default 30) are hidden from the list but still found by search or the *Done* filter. Nothing is deleted.
- **Subtask progress** (*1/2*) on parent tasks; when all subtasks are ticked the parent is highlighted as ready (*✓ 2/2*) but stays open until it's ticked itself.
- Collapsible categories; collapse state remembered per browser.
- Drag-to-reorder stays within a project.

### Projects
- **Categories** (one level of sub-projects, e.g. *6GHub → General, Ordering, Documentation*).
- **Project colors**, auto-assigned from a palette and editable; categories use their parent's color.
- Projects page shows a tree with task counts and *+ Category*.
- **Export/import as JSON**: one project or everything, into any account or installation.

### Backups & restore
- **Automatic database backup before every update** (and before migrations on `install.sh` re-runs); a failed backup stops the update.
- Settings → *Backup & export*: *Back up now*, keep the newest N (default 3), download, upload, delete and **restore** backups. Restores take a safety backup first and roll back automatically on failure; older backups are migrated to the current schema.
- **Move to a new server**: `PM_RESTORE_FILE=…` for the Proxmox helper, `install.sh --restore FILE`, or upload + restore in Settings.
- **CSV export** of all tasks for Excel.

### Phone & UI
- **Phone layout**: bottom tab bar, compact header, folding filters, two-line task rows with large touch targets, no input zoom on iOS.
- **Add to Home Screen**: web app manifest and icons; runs full-screen.
- Darker header in dark mode; disabled buttons look disabled.

### Under the hood
- Migrations `0002` (project color, categories) and `0003` (`tasks.completed_at`, `app_settings`).
- New API: `/api/settings`, `/api/transfer/export|import`, `/api/system/backups` (list, create, upload, download, restore, delete).
- `scripts/backup-db.sh`, `scripts/restore-db.sh`.
- README screenshots under `docs/screenshots/`.

## v1.5.0 — 2026-09-25
- `install.sh` for Debian 12 / Ubuntu 22.04+ LXCs or VMs, and `proxmox/project-manager-lxc.sh` to create a ready-to-use LXC from the Proxmox host (no Docker).
- In-app updater keeps the Nginx config in sync; backend listens on 127.0.0.1 only; `backend/.env` restricted to root.

## v1.4.0 — 2026-09-25
- Task search (titles and descriptions, subtasks included), filters for status, project, assignee and deadline, sorting; filters kept in the URL.

## v1.3.0 — 2026-09-25
- Production frontend build served by Nginx instead of the React dev server; updater builds into a staging directory and swaps only on success.

## v1.2.2 — 2026-09-25
- Update check offers switching to a branch that points at the same commit.

## v1.2.1 — 2026-09-25
- In-app update check, branch selection and update button (Settings → Updates).
- Alembic database migrations.
- "Project Manager" naming throughout.

## v1.0.0 — 2026-09-18
- First release: JWT authentication and user management, projects, hierarchical tasks with drag-to-reorder, extended statuses, deadlines with notification bell, dark mode.
