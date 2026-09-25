# Project Manager

A self-hosted task management application with hierarchical tasks (main tasks + subtasks), multi-user support with authentication, projects, deadlines, and extended status tracking.

## Features

- **Authentication**: JWT-based login/registration; first registered user becomes admin
- **User Management**: Admins can promote/demote and activate/deactivate users
- **Hierarchical Tasks**: Main tasks with subtasks in a tree structure, drag-to-reorder at any level
- **Multi-User**: Task assignment, "My Tasks Only" filter
- **Projects**: Organize tasks across multiple projects (full CRUD)
- **Extended Status**: todo / in_progress / blocked / done
- **Deadlines**: Overdue highlighting plus an in-app notification bell (overdue + due-within-3-days)
- **Dark Mode**: Toggle in the nav, persisted per browser, defaults to OS preference
- **In-app Updates**: Settings shows the running version/branch/commit; anyone can check a branch for updates, admins can update or switch branches (pull, migrate, restart)
- **Self-Hosted**: Bare-metal deployment on an LXC container on Proxmox VE

## Tech Stack

- **Backend**: FastAPI (Python) + SQLAlchemy + PostgreSQL
- **Frontend**: React 18 + React Router
- **Deployment**: Bare metal on LXC (Supervisor + Nginx). A Docker Compose setup also exists for local development but is not the production path.

## Development Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python migrate.py   # create/upgrade the schema (Alembic)
```

Schema changes go through Alembic migrations — see [DEPLOYMENT.md](DEPLOYMENT.md#database-migrations).

### Frontend

```bash
cd frontend
npm install
npm start
```

## Architecture

```
project-manager/
├── VERSION            # Single source of truth for the app version
├── backend/           # FastAPI application
├── frontend/          # React application
├── docker-compose.yml # Local dev only, not used in production
└── DEPLOYMENT.md      # LXC deployment guide
```

## Branching Strategy

- `main` — production. **Only `main` is ever deployed.**
- `dev` — integration branch for ongoing work
- Merge `dev` → `main` and tag a release when a set of changes is ready to ship

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`), tracked in the `VERSION` file at the repo root — the backend reads it at startup and serves it at `/api/health`. The frontend's `package.json` version is kept in sync.

**Bump the `VERSION` file on every behavior-changing commit** (not just docs/comments), and tag the corresponding commit on `main` as `vX.Y.Z`:
- **Patch** (`1.0.x`): bug fixes, no behavior change
- **Minor** (`1.x.0`): new features, backward-compatible
- **Major** (`x.0.0`): breaking changes (API contract, data model requiring migration)

```bash
git tag -a v1.1.0 -m "Description of the release"
git push origin v1.1.0
```

---

**Note**: Pull code from git to the LXC, never push directly.
