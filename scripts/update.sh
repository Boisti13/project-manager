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
echo "Started $(date -Is), current: $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD)"

step "Fetching origin/$BRANCH"
git fetch origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH" || fail "git fetch failed"

step "Checking out $BRANCH"
# -f discards local edits to tracked files; the deployed checkout is never
# meant to be edited by hand.
git checkout -f -B "$BRANCH" "origin/$BRANCH" || fail "git checkout failed"
echo "Now at $(git rev-parse --short HEAD): $(git log -1 --pretty=%s)"

step "Installing backend dependencies"
backend/venv/bin/pip install -q -r backend/requirements.txt || fail "pip install failed, services were NOT restarted"

step "Running database migrations"
(cd backend && venv/bin/python migrate.py) || fail "migrations failed, services were NOT restarted"

step "Installing frontend dependencies"
(cd frontend && npm install --no-audit --no-fund) || fail "npm install failed, services were NOT restarted"

step "Restarting services"
set_state restarting
supervisorctl restart project-manager-backend project-manager-frontend || fail "supervisorctl restart failed"

echo
echo "Done $(date -Is)"
set_state success
