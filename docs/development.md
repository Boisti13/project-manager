# Development

How the code is organized, how to run and test it, and how changes are
released. For running a server see [DEPLOYMENT.md](../DEPLOYMENT.md); the
Windows app's build is in [desktop/README.md](../desktop/README.md).

## Tech stack

- **Backend**: FastAPI (Python 3.10+) + SQLAlchemy 2.0 + psycopg 3 + PostgreSQL, schema changes with Alembic; bcrypt password hashes, JWT sessions (PyJWT). Everything is a REST API under `/api/v1` — see [API.md](API.md).
- **Frontend**: React 18 + React Router (Create React App), dependency versions locked in `package-lock.json`. No UI library; texts in English and German (`i18n.js`, `locales/de.js`).
- **Windows app**: [Tauri](https://tauri.app) around the same frontend, with an offline layer (`frontend/src/desktop/`).
- **Production**: bare metal on an LXC or VM — Supervisor runs the API, Nginx serves the static React build and proxies `/api`. A Docker Compose setup exists for local development only.

## Setup

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

Schema changes go through Alembic migrations — see [DEPLOYMENT.md](../DEPLOYMENT.md#database-migrations).

### Frontend

```bash
cd frontend
npm ci                    # exact versions from package-lock.json
npm start                 # dev server on :3000, proxies /api to :8000
```

`npm run build` produces the static bundle that production serves.

### Docker Compose (alternative)

`docker compose up` starts Postgres, the backend (running `migrate.py` first) and the frontend dev server. Local development only.

## Testing

**Backend** — pytest against a real PostgreSQL:

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

With no configuration it starts a throwaway PostgreSQL via the `pgserver` package (nothing to install); set `PM_TEST_DATABASE_URL=postgresql://user:pw@host/postgres` to use an existing server instead (the user needs `CREATE DATABASE`). Each run uses its own database and removes it afterwards. The suite covers auth and users, projects and private projects, tasks (bulk create, bulk update, repeat rules, dependencies, estimates), comments, history, notifications, templates, saved filters, the calendar feed, sync and deletions, settings, export/import, backups, the migrations (upgrade/downgrade, models vs. migrations, stamping pre-Alembic databases) and the `backup-db.sh`/`restore-db.sh` scripts including rollback — the script tests need `bash` and the PostgreSQL client tools and are skipped without them.

**Frontend** — Jest:

```bash
cd frontend
npm test
```

The logic without React is tested on its own: search/filter/sort (`taskFilters`), subtrees, bulk changes and reordering (`taskOps`), projects, progress, board and calendar (`views`), labels, dependencies, My day, the weekly review, estimates, CSV export, bulk entry, repeat rules, the history texts, translations, and the Windows app's offline layer against a fake server.

**Browser tests** — the real app (backend + production build) in Chromium, with Playwright: logging in, creating and editing tasks inline, estimates, description alignment, deleting and ticking off with Undo (incl. repeating tasks), keyboard shortcuts, search, saved filters, changing several tasks at once (incl. all-or-nothing), templates, the board and calendar (moving cards, dropping on another day), Move up and drag-and-drop reordering, links to a task, My day, the weekly review, German, and the phone layout:

```bash
cd frontend && npm run build && cd ..
pip install -r backend/requirements.txt -r e2e/requirements.txt
python -m playwright install chromium
pytest e2e
```

Like the backend tests they use `PM_TEST_DATABASE_URL` or start a throwaway PostgreSQL; `PM_E2E_BUILD=path` tests another build, `PW_CHANNEL=chrome` uses an installed Chrome. Each test makes its own project and tasks, so they don't depend on each other. When one fails, a screenshot lands in `e2e/artifacts/` and the server's output in `e2e/server.log`.

**Translations** — every UI text goes through `t('English text')` (or `tn(n, 'one …', '{n} …')` for plurals) from `frontend/src/i18n.js`; the German text for it lives in `frontend/src/locales/de.js`, keyed by the English text. `i18n.test.js` fails when a text used in the code has no German entry, or when the placeholders (`{name}`) differ. Server error messages stay English.

**CI** — [GitHub Actions](../.github/workflows/ci.yml) runs the backend tests (PostgreSQL 16, Python 3.10 and 3.12), the frontend tests and production build, the browser tests (screenshots of failures are kept as a download), and shellcheck on every push to `main`/`dev` and on pull requests. [desktop.yml](../.github/workflows/desktop.yml) builds the Windows app.

## Architecture

```
project-manager/
├── VERSION                  # Single source of truth for the app version
├── .github/workflows/ci.yml # Tests, build, browser tests and shellcheck on every push
├── .github/workflows/desktop.yml # Windows app: tests, build, installer
├── desktop/                 # Windows app (Tauri shell; offline layer in frontend/src/desktop)
├── backend/
│   ├── app/                 # FastAPI application (routers/, models.py, schemas.py, access.py = who sees what, ...)
│   ├── alembic/versions/    # Database migrations
│   ├── tests/               # pytest suite (real PostgreSQL)
│   └── migrate.py           # Applies migrations; stamps pre-Alembic databases
├── frontend/
│   ├── public/              # index.html, web app manifest, app icons
│   └── src/
│       ├── components/      # React components (TaskList, Settings, UpdatePanel, ...)
│       │   └── tasklist/    # Parts of the Tasks page: data, filter bar, groups, select mode, Undo, shortcuts
│       ├── desktop/         # Windows app: local copy, offline API, sync, updater
│       ├── taskOps.js       # Subtrees, changes to several tasks, reordering (pure, tested)
│       ├── taskFilters.js   # Pure search/filter/sort/archive logic for the task tree
│       ├── exportCsv.js     # CSV export of all tasks
│       ├── i18n.js          # t()/tn(), language detection; texts in locales/de.js
│       ├── names.js         # Status and priority names
│       ├── estimate.js      # Time estimates: parse "1h 30m", format, add up
│       ├── review.js        # Weekly review: done, overdue, due next week, per project
│       ├── clipboard.js     # Copy text, also on plain-HTTP servers
│       ├── bulkParse.js     # "One task per line" text → task tree
│       ├── recurrence.js    # Repeat settings as text
│       ├── activity.js      # Task history entries as sentences
│       ├── dependencies.js  # Blockers, waiting tasks, picker suggestions
│       ├── labels.js        # Label index, readable text color on a label
│       ├── myday.js         # Sections of the My day page
│       ├── progress.js      # Per-project progress for the Projects page
│       ├── views.js         # Board columns, calendar grid and deadlines by day
│       └── projects.js      # Project tree, colors, grouping tasks by project/category
├── e2e/                     # Browser tests (Playwright): serve.py runs backend + build, test_*.py
├── install.sh               # Installer for a Debian/Ubuntu LXC or VM (idempotent)
├── proxmox/
│   └── project-manager-lxc.sh # Run on the PVE host: creates an LXC and runs install.sh
├── scripts/
│   ├── update.sh            # In-app updater (fetch, backup, install, migrate, build, sync nginx, restart)
│   ├── setup-https.sh       # Local CA + server certificate (renews when due / IP changed)
│   ├── nginx-site.sh        # Prints the Nginx site config (HTTPS or HTTP)
│   ├── backup-db.sh         # pg_dump to /var/backups/project-manager, keeps the newest N (also nightly via cron)
│   ├── restore-db.sh        # Safety backup, restore, migrate; rolls back on failure
│   └── fix-db-encoding.sh   # Converts a SQL_ASCII database to UTF-8 (older installs)
├── deploy/nginx.conf        # Production Nginx config (static build + /api proxy)
├── docs/
│   ├── user-guide.md        # Using the app
│   ├── API.md               # REST API, tokens, sync
│   ├── development.md       # This file
│   └── screenshots/         # Screenshots for the docs (sample data)
├── CHANGELOG.md             # What changed in each release
├── docker-compose.yml       # Local dev only, not used in production
└── DEPLOYMENT.md            # Installing and running a server: updates, HTTPS, backups, troubleshooting
```

## Branches

- `main` — production. **Production runs `main`.**
- `dev` — integration branch for ongoing work.
- To test `dev` on the live instance, use Settings → Updates → *Switch to dev*, then switch back to `main` once it's merged.
- Merge `dev` → `main` (fast-forward) and tag a release when a set of changes is ready to ship.

The server only ever pulls from GitHub (Settings → Updates or the manual steps in [DEPLOYMENT.md](../DEPLOYMENT.md)) — never push to it or edit files there directly.

## Versioning

Semantic versioning (`MAJOR.MINOR.PATCH`), tracked in the `VERSION` file at the repo root — the backend reads it at startup and serves it at `/api/health`. The frontend's `package.json` (and `package-lock.json`) version is kept in sync; `npm run build` stamps it into the interface (`frontend/.env.production` → `REACT_APP_VERSION`, read in `src/version.js`). The web app compares it with the server's to offer a reload after an update; the Windows app compares feature versions (major.minor) to warn when it's older or newer than the server. So a **minor** bump means "the interface changed in a way worth an app update".

**Bump `VERSION` on every behavior-changing commit** (not for docs or comments), update the [user guide](user-guide.md) / README, the screenshots and [CHANGELOG.md](../CHANGELOG.md) alongside, and tag the corresponding commit on `main` as `vX.Y.Z`:

- **Patch** (`1.0.x`): bug fixes, no behavior change
- **Minor** (`1.x.0`): new features, backward-compatible
- **Major** (`x.0.0`): breaking changes (API contract, data model requiring migration)

```bash
git tag -a v1.4.0 -m "Description of the release"
git push origin v1.4.0
```

A tag alone shows up under *Tags* on GitHub; create a GitHub Release from it (with the CHANGELOG section as notes) for it to appear under *Releases*. The Windows app has its own versions and `desktop-vX.Y.Z` tags — see [desktop/README.md](../desktop/README.md#building).

## Screenshots

The screenshots in `docs/screenshots/` come from a local instance with sample data (never real data), taken with Playwright in English at fixed window sizes, in light mode unless the name says `-dark`.
