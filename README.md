# Project Manager

A self-hosted task management application with hierarchical tasks (main tasks + subtasks), color-coded projects with categories, multi-user support, deadlines, search and filtering, a phone-friendly layout and in-app updates.

![Tasks grouped by project and category](docs/screenshots/tasks-desktop.png)

## Features

- **Authentication**: JWT-based login/registration; first registered user becomes admin
- **User Management**: Admins can promote/demote and activate/deactivate users
- **Hierarchical Tasks**: Main tasks with subtasks in a tree structure, drag-to-reorder at any level (in manual sort order), subtask progress (e.g. *1/2*) on the parent
- **Done Checkbox & Archive**: Tick tasks off with a checkbox; they move into a collapsed *✓ Completed* row at the end of their project/category (most recent first). After a configurable number of days (Settings → *Completed tasks*, default 30) they're archived — hidden from the list but still found by search or the *Done* filter. Nothing is deleted
- **Multi-User**: Task assignment
- **Search & Filters**: Full-text search over titles and descriptions (subtasks included), filters for status, project, assignee and deadline, sorting by deadline/priority/date/title; filters are kept in the URL
- **Projects & Categories**: Projects with one level of categories (e.g. *6GHub → General, Ordering, Documentation*), each project color-coded; the Tasks page lists tasks in collapsible sections per project and per category (remembered per browser), with every task carrying its project's color
- **Phone-friendly**: Bottom tab bar, two-line task rows with large touch targets, folding filters, no input zoom on iOS; installable via *Add to Home Screen* (web app manifest) to run full-screen like an app
- **Extended Status**: todo / in_progress / blocked / done
- **Deadlines**: Overdue highlighting plus an in-app notification bell (overdue + due-within-3-days)
- **Dark Mode**: Toggle in the nav, persisted per browser, defaults to OS preference
- **In-app Updates**: Settings shows the running version/branch/commit; anyone can check a branch for updates, admins can update or switch branches (pull, migrate, rebuild the frontend, sync the Nginx config, restart) with a live log
- **Self-Hosted**: One-command install on Proxmox VE (creates the LXC for you) or into any Debian/Ubuntu LXC/VM, no Docker

## Screenshots

| Desktop | Phone |
|---|---|
| ![Tasks, dark mode](docs/screenshots/tasks-desktop-dark.png) | ![Tasks on a phone](docs/screenshots/tasks-phone.png) |
| ![Search with highlighted matches](docs/screenshots/tasks-filtered.png) | ![Completed row on a phone, dark mode](docs/screenshots/tasks-phone-dark.png) |
| ![Projects with categories](docs/screenshots/projects-desktop.png) | ![Projects on a phone](docs/screenshots/projects-phone.png) |

<details>
<summary>Settings (archive days, updates, users)</summary>

![Settings](docs/screenshots/settings-desktop.png)

</details>

Screenshots use sample data from a local preview instance.

### On your phone

Open the app's URL in the phone browser and use *Add to Home Screen* (iOS: Share menu; Android/Chrome: ⋮ menu → *Install app*). It then starts full-screen with its own icon. It needs a connection to the server (e.g. over your VPN/ZeroTier when away) — there is no offline mode.

## Tech Stack

- **Backend**: FastAPI (Python) + SQLAlchemy + PostgreSQL
- **Frontend**: React 18 + React Router
- **Deployment**: Bare metal on LXC — Supervisor runs the API, Nginx serves the static React build. A Docker Compose setup also exists for local development but is not the production path.

## Installation

**New Proxmox LXC** (run on the PVE host):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/proxmox/project-manager-lxc.sh)"
```

**Existing Debian 12 / Ubuntu 22.04+ LXC or VM** (run inside it, as root):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/install.sh)"
```

Both install PostgreSQL, Nginx, Supervisor and Node.js without Docker, generate the database password and secret key, build the frontend and print the URL. Register the first account to become admin; later updates happen from **Settings → Updates**. Options, unattended mode and the manual steps are in [DEPLOYMENT.md](DEPLOYMENT.md#fresh-install).

## Development Setup

Needs Python 3.11+, Node 18+ and a PostgreSQL database.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env      # set DB_* to your database
python migrate.py         # create/upgrade the schema (Alembic)
uvicorn app.main:app --reload --port 8000
```

Schema changes go through Alembic migrations — see [DEPLOYMENT.md](DEPLOYMENT.md#database-migrations).

### Frontend

```bash
cd frontend
npm install
npm start                 # dev server on :3000, proxies /api to :8000
```

`npm run build` produces the static bundle that production serves.

### Docker Compose (alternative)

`docker compose up` starts Postgres, the backend (running `migrate.py` first) and the frontend dev server. Local development only.

## Testing

```bash
cd frontend
npm test                  # Jest: src/taskFilters.test.js (search/filter/sort), src/projects.test.js (project tree, grouping)
```

```bash
cd backend
alembic check             # models and migrations agree (against your dev DB)
```

## Architecture

```
project-manager/
├── VERSION                  # Single source of truth for the app version
├── backend/
│   ├── app/                 # FastAPI application (routers/, models.py, schemas.py, ...)
│   ├── alembic/versions/    # Database migrations
│   └── migrate.py           # Applies migrations; stamps pre-Alembic databases
├── frontend/
│   ├── public/              # index.html, web app manifest, app icons
│   └── src/
│       ├── components/      # React components (TaskList, Settings, UpdatePanel, ...)
│       ├── taskFilters.js   # Pure search/filter/sort/archive logic for the task tree
│       └── projects.js      # Project tree, colors, grouping tasks by project/category
├── install.sh               # Installer for a Debian/Ubuntu LXC or VM (idempotent)
├── proxmox/
│   └── project-manager-lxc.sh # Run on the PVE host: creates an LXC and runs install.sh
├── scripts/update.sh        # In-app updater (fetch, install, migrate, build, sync nginx, restart)
├── deploy/nginx.conf        # Production Nginx config (static build + /api proxy)
├── docs/screenshots/        # README screenshots (sample data)
├── docker-compose.yml       # Local dev only, not used in production
└── DEPLOYMENT.md            # LXC deployment, updates, migrations, troubleshooting
```

## Branching Strategy

- `main` — production. **Production runs `main`.**
- `dev` — integration branch for ongoing work
- To test `dev` on the live instance, use Settings → Updates → *Switch to dev*, then switch back to `main` once it's merged
- Merge `dev` → `main` (fast-forward) and tag a release when a set of changes is ready to ship

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`), tracked in the `VERSION` file at the repo root — the backend reads it at startup and serves it at `/api/health`. The frontend's `package.json` version is kept in sync.

**Bump the `VERSION` file on every behavior-changing commit** (not just docs/comments), update this README alongside, and tag the corresponding commit on `main` as `vX.Y.Z`:
- **Patch** (`1.0.x`): bug fixes, no behavior change
- **Minor** (`1.x.0`): new features, backward-compatible
- **Major** (`x.0.0`): breaking changes (API contract, data model requiring migration)

```bash
git tag -a v1.4.0 -m "Description of the release"
git push origin v1.4.0
```

A tag alone shows up under *Tags* on GitHub; draft a GitHub Release from it for it to appear under *Releases*.

---

**Note**: The LXC only ever pulls from GitHub (via Settings → Updates or the manual steps in [DEPLOYMENT.md](DEPLOYMENT.md)) — never push to it or edit files there directly.
