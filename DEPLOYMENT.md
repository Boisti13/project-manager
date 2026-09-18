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

```bash
ssh root@192.168.100.103
pct exec 113 -- bash -c '
  cd /opt/project-manager
  git checkout main
  git pull origin main
  cd frontend && npm install && cd ..
  supervisorctl restart project-manager-backend project-manager-frontend
'
```

If the `Task` or `User` model changed, check whether a manual `ALTER TABLE` is needed first — `Base.metadata.create_all()` only creates missing tables, it never alters existing columns or constraints (see the `is_admin` column and `ON DELETE SET NULL` constraints added by hand during development).

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
cp backend/.env.example backend/.env
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

**Backend 500s after a model change**: check for a pending manual migration (see "Updating" above) — `create_all()` won't add columns or fix constraints on existing tables.
