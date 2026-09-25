#!/usr/bin/env bash
# In-app updater, started detached by POST /api/system/update.
# Can also be run by hand: scripts/update.sh <branch>
#
# Progress goes to .update/update.log, state to .update/status
# (running -> restarting -> success | failed).
set -uo pipefail

BRANCH="${1:?usage: update.sh <branch>}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
STATE_DIR="$APP_DIR/.update"
mkdir -p "$STATE_DIR"
exec >>"$STATE_DIR/update.log" 2>&1
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

set_state() { echo "$1" >"$STATE_DIR/status"; }
step() { echo; echo "==> $*"; }
fail() { echo; echo "!! $*"; set_state failed; exit 1; }

set_state running
cd "$APP_DIR" || fail "cannot cd to $APP_DIR"

if [ -z "${UPDATE_CHECKED_OUT:-}" ]; then
  echo "Started $(date -Is), current: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"
  UPDATE_FROM="$(git rev-parse --short HEAD)"

  step "Fetching origin/$BRANCH"
  git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" || fail "git fetch failed"

  step "Checking out $BRANCH"
  # -f discards local edits to tracked files; the deployed checkout is never
  # meant to be edited by hand.
  git checkout -f -B "$BRANCH" "origin/$BRANCH" || fail "git checkout failed"
  echo "Now at $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"

  # Continue with the freshly checked-out copy of this script, so changes to
  # the deploy steps apply to the update that brings them in.
  UPDATE_CHECKED_OUT=1 UPDATE_FROM="$UPDATE_FROM" exec bash "$APP_DIR/scripts/update.sh" "$BRANCH"
fi

step "Backing up the database"
# Before anything can touch the schema. No backup, no update.
bash scripts/backup-db.sh "before-update-from-${UPDATE_FROM:-unknown}" || fail "database backup failed; the new code is checked out but the database and running services are untouched"

step "Installing backend dependencies"
backend/venv/bin/pip install -q -r backend/requirements.txt || fail "pip install failed, services were NOT restarted"

step "Running database migrations"
(cd backend && venv/bin/python migrate.py) || fail "migrations failed, services were NOT restarted"

step "Installing frontend dependencies"
(cd frontend && npm install --no-audit --no-fund) || fail "npm install failed, services were NOT restarted"

step "Building frontend"
# Build next to the live bundle and swap only on success, so nginx never
# serves a half-written or failed build.
rm -rf frontend/build.new
(cd frontend && BUILD_PATH=build.new GENERATE_SOURCEMAP=false npm run build) \
  || fail "frontend build failed, the previous build is still being served"
rm -rf frontend/build.old
[ -d frontend/build ] && mv frontend/build frontend/build.old
mv frontend/build.new frontend/build || fail "could not swap in the new build"
rm -rf frontend/build.old

step "Syncing Nginx config"
# Keep the live site config in step with deploy/nginx.conf; roll back if the
# new one doesn't pass nginx -t.
SITE=/etc/nginx/sites-available/project-manager
if [ -f "$SITE" ]; then
  NEW="$(sed "s#/opt/project-manager/frontend/build#$APP_DIR/frontend/build#" deploy/nginx.conf)"
  if [ "$NEW" != "$(cat "$SITE")" ]; then
    cp "$SITE" "$SITE.bak"
    printf '%s\n' "$NEW" > "$SITE"
    if nginx -t -q; then
      systemctl reload nginx && echo "Updated and reloaded $SITE"
    else
      mv "$SITE.bak" "$SITE"
      echo "New nginx config failed nginx -t, kept the previous one"
    fi
  else
    echo "Unchanged"
  fi
fi

step "Restarting backend"
set_state restarting
supervisorctl restart project-manager-backend || fail "supervisorctl restart failed"

echo
echo "Done $(date -Is)"
set_state success
