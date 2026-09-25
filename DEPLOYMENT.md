# Deployment Guide

## Current Deployment

**LXC 113** on PVE .103 (192.168.100.113) — Ubuntu 22.04, bare metal (no Docker).

| Component | How it runs |
|---|---|
| PostgreSQL 14 | systemd, native package |
| FastAPI backend | Supervisor (`project-manager-backend`), Uvicorn on 127.0.0.1:8000, Python venv, settings from `backend/.env` |
| React frontend | Static production build in `frontend/build/`, served by Nginx — no Node process at runtime |
| Nginx | :80 — `/api/*` → backend, everything else → `frontend/build/` ([`deploy/nginx.conf`](deploy/nginx.conf)) |

**Production only ever runs `main`.** Ongoing work happens on `dev`; merge to `main` and tag a release (see [README.md](README.md#versioning)) when ready to ship.

## Updating the Live Deployment

### From the app (Settings → Updates)

Any logged-in user can pick a branch and **Check for updates**. Admins additionally get an **Update now** / **Switch to <branch>** button, which runs [`scripts/update.sh`](scripts/update.sh) in the background:

fetch → `git checkout -f -B <branch> origin/<branch>` → **database backup** → `pip install` → `migrate.py` → `npm install` → `npm run build` → sync the Nginx site from `deploy/nginx.conf` (rolled back if `nginx -t` fails) → `supervisorctl restart project-manager-backend`

After the checkout the script re-runs itself from the new code, so changes to these steps apply to the update that ships them. The frontend is built into `frontend/build.new/` and only swapped in once the build succeeds.

The log streams into the Settings page and is kept in `/opt/project-manager/.update/update.log`. If the database backup fails, the update stops before any migration runs. If pip, migrations, npm or the build fail, nothing is restarted or swapped: the old backend and the old frontend build keep being served. Any local edits to tracked files in the deployed checkout are discarded.

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

## Backups & Export

### Database backups

[`scripts/backup-db.sh`](scripts/backup-db.sh) writes a full `pg_dump` (custom format) of the app database to `/var/backups/project-manager/`, using the connection settings in `backend/.env`. It runs automatically:

- before every update from **Settings → Updates** (label `before-update-from-<commit>`)
- before migrations when `install.sh` re-runs on an existing install (`before-reinstall`)

and on demand via **Settings → Backup & export → Back up now** (admins) or by hand:

```bash
cd /opt/project-manager && scripts/backup-db.sh my-label
```

Only the newest backups are kept — **3** by default, adjustable under **Settings → Backup & export** (stored in the `app_settings` table; the script reads it from there). Override per run with `PM_BACKUP_KEEP=10`, or the location with `PM_BACKUP_DIR=/somewhere`. The directory is `700`, each dump `600`.

Admins can **download** any listed backup from the Settings page, to keep a copy off the server.

### Restoring a backup

**In the app** (admins): **Settings → Backup & export → Restore** on any backup in the list. To bring in a backup from another server, **Download** it there and **Upload backup…** here, then *Restore* it. A restore **replaces all data** — users, projects, tasks, settings — so afterwards you log in with an account from the backup.

**On the command line:**

```bash
cd /opt/project-manager && scripts/restore-db.sh /var/backups/project-manager/<file>.dump
```

Both run [`scripts/restore-db.sh`](scripts/restore-db.sh), which:

1. makes a safety backup of the current data (`before-restore`)
2. drops the app's tables and types (only objects owned by the app's DB user — no superuser needed)
3. `pg_restore`s the backup in a single transaction
4. runs `migrate.py`, so a backup from an older version is upgraded to the current schema

If step 3 or 4 fails — corrupt file, or a backup from a *newer* app version than the one installed — the safety backup is loaded back and nothing changes. The backend keeps running throughout.

A backup can be restored into the same or a newer PostgreSQL version (e.g. from a Ubuntu 22.04 install with PostgreSQL 14 into a Debian 12 container with PostgreSQL 15), not an older one.

### Moving to a new server

1. On the old instance: **Settings → Backup & export → Back up now**, then **Download** it.
2. Create the new instance with the backup loaded, either
   - on the Proxmox host (copy the `.dump` there first):
     ```bash
     PM_RESTORE_FILE=/root/projectmanager-….dump \
       bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/proxmox/project-manager-lxc.sh)"
     ```
   - or inside an existing Debian/Ubuntu container: `install.sh --restore /path/to/file.dump`
   - or install normally, register a temporary admin, and use **Upload backup…** + **Restore** in Settings.
3. Log in with your usual account — users come with the backup.

### Handing projects to someone else (export/import)

For moving *some* projects rather than a whole instance — e.g. to another person's installation or account — use the **Projects** page:

- **⤓** on a project exports it with its categories, tasks and subtasks (status, priority, deadlines, completion dates) as JSON; **Export all** also includes tasks without a project.
- **Import** reads such a file and always creates **new** projects; if a name is taken it becomes *Name (2)*. Assignees aren't included (users differ between installations), so imported tasks are unassigned.

Any logged-in user can export and import. The file format is `project-manager/projects`, version 1 ([`backend/app/routers/transfer.py`](backend/app/routers/transfer.py)).

### CSV export

**Settings → Backup & export → Export CSV** (any user) downloads all tasks — including subtasks, done and archived ones — as a semicolon-separated UTF-8 CSV that Excel opens directly: ID, project, category, task, parent task, status, priority, assignee, deadline, created, completed, description. It's for spreadsheets and reporting; use the database backups to restore.

## Fresh Install

All options install without Docker: PostgreSQL, a Python venv under Supervisor, and Nginx serving the built frontend. The app lives in `/opt/project-manager` as a git checkout, so **Settings → Updates** works right away. The first account you register becomes the admin.

### Option A: New LXC from the Proxmox host (recommended)

On the Proxmox VE host shell, as root (add `PM_RESTORE_FILE=/path/backup.dump` in front to start from a backup, see [Moving to a new server](#moving-to-a-new-server)):

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/proxmox/project-manager-lxc.sh)"
```

Pick **default** (next free ID, 2 cores, 2 GB RAM, 8 GB disk, DHCP on `vmbr0`) or **advanced** to set ID, hostname, resources, storage, bridge, static IP/gateway, VLAN, root password and branch. It downloads the Debian 12 template if needed, creates an unprivileged container (`nesting=1`, start on boot, tagged `project-manager`), runs the installer inside and prints the URL.

Unattended, e.g. with a static IP:

```bash
UNATTENDED=1 CT_HOSTNAME=pm CT_IP=192.168.100.120/24 CT_GW=192.168.100.1 \
  bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/proxmox/project-manager-lxc.sh)"
```

All variables are listed at the top of [`proxmox/project-manager-lxc.sh`](proxmox/project-manager-lxc.sh). If a step fails, the container is kept for inspection and the script prints how to remove it.

### Option B: Existing LXC or VM (Debian 12, Ubuntu 22.04/24.04)

As root inside the container:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/install.sh)"
```

or from a clone: `sudo ./install.sh`. Options: `-y` (no prompt), `-b <branch>`, `-d <dir>`, `-r <repo-url>`, `-R <backup.dump>` (load a backup, replacing the data).

What it does:
1. Installs `postgresql nginx supervisor git python3-venv`, plus Node.js 18+ (distribution package if new enough, otherwise Node 20 from NodeSource)
2. Clones the repo to `/opt/project-manager` (or updates an existing checkout)
3. Creates the `projectmanager` database and role with a random password, and writes `backend/.env` with a random `SECRET_KEY`
4. Installs Python dependencies, runs `migrate.py`, builds the frontend
5. Writes `/etc/supervisor/conf.d/project-manager-backend.conf` (Uvicorn on `127.0.0.1:8000`) and the Nginx site from [`deploy/nginx.conf`](deploy/nginx.conf)
6. Checks `/api/health` and prints the URL

**Re-running it is safe**: it updates in place, keeps the existing `.env` and database, and migrates older installs (removes the old frontend dev-server program, drops Supervisor `environment=` DB settings in favour of `.env`, and replaces a placeholder `SECRET_KEY`).

### Option C: Manually

The steps `install.sh` automates, for reference:

```bash
apt-get install -y postgresql nginx supervisor git python3-venv nodejs npm   # Node 18+ needed
sudo -u postgres psql -c "CREATE ROLE projectmanager LOGIN PASSWORD '<password>'"
sudo -u postgres psql -c "CREATE DATABASE projectmanager OWNER projectmanager ENCODING 'UTF8' TEMPLATE template0"
git clone https://github.com/Boisti13/project-manager.git /opt/project-manager && cd /opt/project-manager
python3 -m venv backend/venv && backend/venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # set DB_PASSWORD and a random SECRET_KEY (openssl rand -hex 32)
(cd backend && venv/bin/python migrate.py)
(cd frontend && npm install && npm run build)   # needs ~1 GB RAM
```

Then a Supervisor program running `backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000` in `backend/` (as root, for the in-app updater), and [`deploy/nginx.conf`](deploy/nginx.conf) as the Nginx site.

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
