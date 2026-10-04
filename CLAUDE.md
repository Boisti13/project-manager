# Working on this repository

Notes for Claude Code (and anyone else) working on Project Manager: how
changes are made, tested, documented and released here. Details live in
[docs/development.md](docs/development.md); this is the checklist.
Infrastructure (servers, deploy targets, credentials) is **not** in this
repository — if the folder above this one has its own `CLAUDE.md`, it has
those notes.

## Ground rules

- **Start with `git pull` on `dev`.** The owner works from more than one
  computer; never assume the checkout is current, and never overwrite work
  you didn't pull.
- **Work on `dev`, commit and push to `dev`.** Don't merge to `main`, tag or
  release unless asked. The phrase **"merge to main and make a new release"**
  means the whole [release routine](#release-routine) below.
- **One change = one commit with everything it needs**: the code, its tests,
  the version bump, the docs, the screenshots and the CHANGELOG entry — not
  "docs later".
- **Screenshots and examples use sample data only** — never real tasks, names
  or servers.
- **Every UI text** goes through `t()` / `tn()` and gets its German entry in
  `frontend/src/locales/de.js` (`python tools/translations.py missing`).
- After pushing, **watch CI** (`gh run list --branch dev`) — the *CI* and
  *Desktop apps* workflows — and fix what fails before moving on.

## Versions to bump

| Change | Bump |
|---|---|
| server/web app (behavior) | `VERSION`, `frontend/package.json`, `frontend/package-lock.json` (both `"version"` fields at the top) — patch for fixes, minor for features (a minor bump tells the desktop app "the interface changed") |
| anything in `frontend/` | **also** the Windows/Linux app: `desktop/src-tauri/tauri.conf.json`, `desktop/src-tauri/Cargo.toml`, `frontend/src/desktop/platform.js` (`DESKTOP_VERSION`; a test checks they match) + a section in `desktop/CHANGELOG.md` |
| docs, tests or tools only | none — note it in `CHANGELOG.md` under `## Unreleased` (*Under the hood*); the next version takes that section over |

## What to update with a change

- `CHANGELOG.md` — a section for the new version: *Added / Changed / Fixed /
  Under the hood*, written for users. If there's a `## Unreleased` section,
  rename it to the new version and add to it.
- `README.md` (highlights) and the docs that describe what changed:
  `docs/user-guide.md`, `docs/API.md`, `docs/development.md`,
  `docs/home-assistant.md`, `desktop/README.md`, `DEPLOYMENT.md`.
- The **screenshots** of everything that now looks different —
  `python tools/screenshots.py <names>` against `tools/preview_server.py`
  (see [docs/development.md → Preview and screenshots](docs/development.md#preview-and-screenshots)).
- `python tools/check_links.py` must report `problems: 0`.

## Tests

Python tools in a virtual environment **outside** any cloud-synced folder,
e.g. `~/.venvs/project-manager` (`pip install -r tools/requirements.txt`).

```bash
# backend (throwaway PostgreSQL via pgserver)
cd backend && python -m pytest -q
# frontend (Node 18+)
cd frontend && CI=true npx react-scripts test --watchAll=false && CI=true npm run build
# browser tests against that build (needs Chrome or `playwright install chromium`)
PW_CHANNEL=chrome python -m pytest e2e -q
```

- Windows: if psycopg's binary is blocked, set `PSYCOPG_IMPL=python` and put
  pgserver's `pginstall/bin` on `PATH` (it ships libpq).
- `npm run build` (not `npx react-scripts build`) — it stamps the version
  into the interface.
- New migration: `backend/alembic/versions/00NN_name.py` with the next
  number; the tests find the head themselves. If a test builds an old schema
  by hand (`test_migrate_stamps_pre_alembic_database`), drop the new columns
  there too.
- UI tests: inputs whose saved state comes from the server should change at
  once (optimistic) — Playwright's `check()` fails otherwise.

## Release routine

"Merge to main and make a new release":

1. `dev` is pushed and CI + *Desktop apps* are green on its last commit.
2. Fast-forward `main`: `git checkout main && git pull --ff-only && git merge --ff-only dev && git push`.
3. Tag and release the server: `git tag vX.Y.Z && git push origin vX.Y.Z`,
   then `gh release create vX.Y.Z --title vX.Y.Z --notes-file <the CHANGELOG
   section>` — if versions since the last release were never released, put
   all their sections into the notes (`##` → `###`).
4. If the desktop version changed since the last `desktop-v*` tag:
   `git tag desktop-vA.B.C && git push origin desktop-vA.B.C` — **after** the
   server release, because the workflow attaches the apps to the latest
   release. Wait for *Desktop apps* on that tag (~15 min).
5. Check: the release `desktop-updates` has a `latest.json` with the new
   version for `windows-x86_64`, `linux-x86_64`, `linux-aarch64`, and the
   server release lists the five `ProjectManager-*` files.
6. Switch back to `dev`. Deploy as the owner's notes say.

## Code

- Match the surrounding code; comments say *why*, briefly.
- Pure logic in plain modules with tests (`frontend/src/*.js` +
  `*.test.js`, `backend/app/*.py` + `tests/`); React components stay thin.
- The desktop app reuses the frontend: anything with a server call needs an
  offline answer in `frontend/src/desktop/localApi.js` or a graceful "needs a
  connection".
- On Windows with Git Bash, heredocs containing quotes break easily — write
  longer edit scripts to a file first.
