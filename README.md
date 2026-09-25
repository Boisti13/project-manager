# Project Manager

A self-hosted task management application with hierarchical tasks (main tasks + subtasks), multi-user support with authentication, projects, deadlines, search and filtering, and in-app updates.

## Features

- **Authentication**: JWT-based login/registration; first registered user becomes admin
- **User Management**: Admins can promote/demote and activate/deactivate users
- **Hierarchical Tasks**: Main tasks with subtasks in a tree structure, drag-to-reorder at any level (in manual sort order)
- **Multi-User**: Task assignment
- **Search & Filters**: Full-text search over titles and descriptions (subtasks included), filters for status, project, assignee and deadline, sorting by deadline/priority/date/title; filters are kept in the URL
- **Projects**: Organize tasks across multiple projects (full CRUD)
- **Extended Status**: todo / in_progress / blocked / done
- **Deadlines**: Overdue highlighting plus an in-app notification bell (overdue + due-within-3-days)
- **Dark Mode**: Toggle in the nav, persisted per browser, defaults to OS preference
- **In-app Updates**: Settings shows the running version/branch/commit; anyone can check a branch for updates, admins can update or switch branches (pull, migrate, rebuild the frontend, restart) with a live log
- **Self-Hosted**: Bare-metal deployment on an LXC container on Proxmox VE

## Tech Stack

- **Backend**: FastAPI (Python) + SQLAlchemy + PostgreSQL
- **Frontend**: React 18 + React Router
- **Deployment**: Bare metal on LXC — Supervisor runs the API, Nginx serves the static React build. A Docker Compose setup also exists for local development but is not the production path.

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
npm test                  # Jest, e.g. src/taskFilters.test.js (search/filter/sort logic)
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
│   └── src/
│       ├── components/      # React components (TaskList, Settings, UpdatePanel, ...)
│       └── taskFilters.js   # Pure search/filter/sort logic for the task tree
├── scripts/update.sh        # In-app updater (fetch, install, migrate, build, restart)
├── deploy/nginx.conf        # Production Nginx config (static build + /api proxy)
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
