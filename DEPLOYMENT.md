# Deployment Guide

## Current Deployment

**LXC 113** on PVE .103 (192.168.100.113) — Ubuntu 22.04, bare metal (no Docker).

| Component | How it runs |
|---|---|
| PostgreSQL 14 | systemd, native package |
| FastAPI backend | Supervisor (`project-manager-backend`), Uvicorn on :8000, Python venv |
| React frontend | Supervisor (`project-manager-frontend`), `npm start` on :3000 |
| Nginx | Reverse proxy on :80 — `/api/*` → backend, `/` → frontend |

**Production only ever runs `main`.** Ongoing work happens on `dev`; merge to `main` and tag a release (see [README.md](README.md#versioning)) when ready to ship.

## Updating the Live Deployment

### From the app (Settings → Updates)

Any logged-in user can pick a branch and **Check for updates**. Admins additionally get an **Update now** / **Switch to <branch>** button, which runs [`scripts/update.sh`](scripts/update.sh) in the background:

fetch → `git checkout -f -B <branch> origin/<branch>` → `pip install` → `migrate.py` → `npm install` → `supervisorctl restart` both services

The log streams into the Settings page and is kept in `/opt/project-manager/.update/update.log`. If pip, migrations or npm fail, the services are **not** restarted, so the old processes keep running. Any local edits to tracked files in the deployed checkout are discarded.

Requirements: the backend runs as a user that can run `git` in the checkout and `supervisorctl` (root under the default Supervisor setup), and the LXC can reach GitHub.

Switching to an older branch does not roll back database migrations. That's usually harmless because older code ignores newer columns, but check first if a migration dropped or renamed something.

### Manually

```bash
ssh root@192.168.100.103
pct exec 113 -- bash -c '
  cd /opt/project-manager
  git checkout main
  git pull origin main
  backend/venv/bin/pip install -r backend/requirements.txt
  cd backend && venv/bin/python migrate.py && cd ..
  cd frontend && npm install && cd ..
  supervisorctl restart project-manager-backend project-manager-frontend
'
```

`migrate.py` applies any pending Alembic migrations and is a no-op when there are none, so it is safe to run on every deploy. The `&&` means the services are not restarted if a migration fails.

### Database migrations

The schema is managed by Alembic (`backend/alembic/`). The app no longer creates tables on startup.

- **First run on a pre-Alembic database** (anything created by the old `create_all()`): `migrate.py` checks that the schema matches the `0001` baseline — including the hand-applied `users.is_admin` column and `ON DELETE SET NULL` foreign keys — and stamps it. If something doesn't match, it changes nothing and lists the differences.
- **Changing a model**: after editing `app/models.py`, generate and review a migration from `backend/` against a dev database:
  ```bash
  venv/bin/alembic revision --autogenerate -m "add foo to tasks"
  ```
  Always read the generated file — autogenerate misses things like enum value changes and renames. Use short sequential revision IDs (`--rev-id 0002`) to keep the history readable.
- **Check models and DB agree**: `venv/bin/alembic check`
- **Current revision**: `venv/bin/alembic current`

## Fresh Install (from scratch)

1. **Create the LXC** — Ubuntu 22.04, at least 8GB disk (12GB+ recommended once npm/postgres/logs accumulate), nesting NOT required (bare metal, no Docker).

2. **Install dependencies**
```bash
apt-get install -y postgresql python3-venv npm curl nginx supervisor git
```
   Node.js from Ubuntu's default repo is often too old for `react-scripts`; install Node 18+ from NodeSource if `npm install` fails with `node:path` module errors.

3. **Create the database**
```bash
sudo -u postgres psql <<EOF
CREATE DATABASE projectmanager;
CREATE USER projectmanager WITH PASSWORD 'projectmanager';
GRANT ALL PRIVILEGES ON DATABASE projectmanager TO projectmanager;
EOF
```

4. **Clone and set up the backend**
```bash
cd /opt && git clone <repo-url> project-manager && cd project-manager
git checkout main
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt
deactivate
cp backend/.env.example backend/.env   # then set DB_* to match step 3
cd backend && venv/bin/python migrate.py && cd ..
```

5. **Set up the frontend**
```bash
cd frontend && npm install && cd ..
```

6. **Supervisor configs** — `/etc/supervisor/conf.d/project-manager-backend.conf` and `project-manager-frontend.conf`, running the Uvicorn/npm commands above. `supervisorctl reread && supervisorctl update`.

7. **Nginx** — reverse proxy config as described in the table above, under `/etc/nginx/sites-available/`.

8. **First admin user**: the first account registered via the app's Register tab is automatically promoted to admin — no manual step needed.

## Troubleshooting

**Check logs:**
```bash
pct exec 113 -- tail -50 /var/log/project-manager-backend.log
pct exec 113 -- tail -50 /var/log/project-manager-frontend.log
pct exec 113 -- supervisorctl status
```

**Frontend won't start / `node:path` errors**: Node.js version too old — install 18+ from NodeSource.

**Port already in use on restart**: `fuser -k 3000/tcp` before `supervisorctl restart project-manager-frontend`.

**Backend 500s after a model change**: check `cd backend && venv/bin/alembic current` shows `(head)`; if not, run `venv/bin/python migrate.py`.
