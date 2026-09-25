# Deployment Guide

## Current Deployment

**LXC 113** on PVE .103 (192.168.100.113) — Ubuntu 22.04, bare metal (no Docker).

| Component | How it runs |
|---|---|
| PostgreSQL 14 | systemd, native package |
| FastAPI backend | Supervisor (`project-manager-backend`), Uvicorn on :8000, Python venv |
| React frontend | Static production build in `frontend/build/`, served by Nginx — no Node process at runtime |
| Nginx | :80 — `/api/*` → backend, everything else → `frontend/build/` ([`deploy/nginx.conf`](deploy/nginx.conf)) |

**Production only ever runs `main`.** Ongoing work happens on `dev`; merge to `main` and tag a release (see [README.md](README.md#versioning)) when ready to ship.

## Updating the Live Deployment

### From the app (Settings → Updates)

Any logged-in user can pick a branch and **Check for updates**. Admins additionally get an **Update now** / **Switch to <branch>** button, which runs [`scripts/update.sh`](scripts/update.sh) in the background:

fetch → `git checkout -f -B <branch> origin/<branch>` → `pip install` → `migrate.py` → `npm install` → `npm run build` → `supervisorctl restart project-manager-backend`

After the checkout the script re-runs itself from the new code, so changes to these steps apply to the update that ships them. The frontend is built into `frontend/build.new/` and only swapped in once the build succeeds.

The log streams into the Settings page and is kept in `/opt/project-manager/.update/update.log`. If pip, migrations, npm or the build fail, nothing is restarted or swapped: the old backend and the old frontend build keep being served. Any local edits to tracked files in the deployed checkout are discarded.

Requirements: the backend runs as a user that can run `git` in the checkout and `supervisorctl` (root under the default Supervisor setup), and the LXC can reach GitHub.

Switching to an older branch does not roll back database migrations. That's usually harmless because older code ignores newer columns, but check first if a migration dropped or renamed something.

### Manually

```bash
ssh root@192.168.100.103   # or the pve_rptu alias
pct exec 113 -- bash -c '
  cd /opt/project-manager
  git checkout main
  git pull origin main
  backend/venv/bin/pip install -r backend/requirements.txt
  cd backend && venv/bin/python migrate.py && cd ..
  cd frontend && npm install && npm run build && cd ..
  supervisorctl restart project-manager-backend
'
```

`migrate.py` applies any pending Alembic migrations and is a no-op when there are none, so it is safe to run on every deploy. The `&&` means nothing is restarted if a migration or the build fails. (The manual `npm run build` writes straight into `build/`, so the site is briefly broken during the build — the in-app updater avoids that.)

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

5. **Build the frontend** (needs ~1 GB RAM while building)
```bash
cd frontend && npm install && npm run build && cd ..
```

6. **Supervisor config** — `/etc/supervisor/conf.d/project-manager-backend.conf`, running `backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000` in `backend/`. `supervisorctl reread && supervisorctl update`. The frontend needs no Supervisor program.
   - If the configs set `DB_*` via `environment=`, keep `backend/.env` identical — the app uses the Supervisor values, but `migrate.py`/`alembic` run from a shell read `.env`.

7. **Nginx** — copy [`deploy/nginx.conf`](deploy/nginx.conf) to `/etc/nginx/sites-available/project-manager`, symlink it into `sites-enabled/` (remove `default`), `nginx -t && systemctl reload nginx`.

8. **First admin user**: the first account registered via the app's Register tab is automatically promoted to admin — no manual step needed.

## Troubleshooting

**Check logs:**
```bash
pct exec 113 -- tail -50 /var/log/project-manager-backend.log
pct exec 113 -- tail -50 /var/log/nginx/error.log
pct exec 113 -- supervisorctl status
```

**Build fails / `node:path` errors**: Node.js version too old — install 18+ from NodeSource. A build killed with no error is usually out-of-memory; the LXC needs ~1 GB free during `npm run build`.

**Blank page or 500 at `/`**: `frontend/build/index.html` is missing — run the build (step 5). Check the last update log at `.update/update.log`.

**Old UI after an update**: hard-reload (Ctrl+F5). `index.html` is served with `Cache-Control: no-cache`, so this should only happen if a proxy in front caches it.

**Backend 500s after a model change**: check `cd backend && venv/bin/alembic current` shows `(head)`; if not, run `venv/bin/python migrate.py`.
