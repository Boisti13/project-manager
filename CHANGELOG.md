# Changelog

All notable changes, newest first. Versions follow [semantic versioning](README.md#versioning); each release is tagged `vX.Y.Z` on `main`.

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
