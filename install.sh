#!/usr/bin/env bash
# Project Manager installer for a Debian 12 / Ubuntu 22.04+ LXC or VM (no Docker).
#
# From a clone:            sudo ./install.sh
# Straight from GitHub:    bash -c "$(curl -fsSL https://raw.githubusercontent.com/Boisti13/project-manager/main/install.sh)"
#
# Installs PostgreSQL, Node.js, Nginx and Supervisor, puts the app in
# /opt/project-manager as a git checkout (so Settings -> Updates works),
# builds the frontend and starts everything. Re-running it updates an
# existing install in place and keeps its .env and database.
#
# Options (or the matching environment variables):
#   -y, --yes           don't ask for confirmation            (PM_YES=1)
#   -b, --branch NAME   branch to install, default main        (PM_BRANCH)
#   -d, --dir PATH      install directory                      (PM_DIR)
#   -r, --repo URL      git repository to clone                (PM_REPO)
set -euo pipefail

REPO="${PM_REPO:-https://github.com/Boisti13/project-manager.git}"
BRANCH="${PM_BRANCH:-main}"
INSTALL_DIR="${PM_DIR:-/opt/project-manager}"
ASSUME_YES="${PM_YES:-0}"
NODE_MAJOR=20

while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes) ASSUME_YES=1 ;;
    -b|--branch) BRANCH="$2"; shift ;;
    -d|--dir) INSTALL_DIR="$2"; shift ;;
    -r|--repo) REPO="$2"; shift ;;
    -h|--help) echo "Usage: install.sh [-y] [-b branch] [-d dir] [-r repo]  (see the header of install.sh)"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)" >&2; exit 1 ;;
  esac
  shift
done

say() { echo; echo "--> $*"; }
die() { echo; echo "!! $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Please run this script as root."
command -v apt-get >/dev/null || die "This installer expects a Debian/Ubuntu host (apt-get not found)."

export DEBIAN_FRONTEND=noninteractive
# Fresh containers often have no locale configured; without this PostgreSQL
# creates its cluster as SQL_ASCII.
export LANG=C.UTF-8 LC_ALL=C.UTF-8

UPDATE_MODE=0
[[ -d "$INSTALL_DIR/.git" && -f "$INSTALL_DIR/backend/.env" ]] && UPDATE_MODE=1

echo "== Project Manager installer =="
echo
echo "Install directory: $INSTALL_DIR"
echo "Repository:        $REPO"
echo "Branch:            $BRANCH"
if [[ $UPDATE_MODE -eq 1 ]]; then
  echo "Mode:              update (existing .env and database are kept)"
else
  echo "Mode:              fresh install"
fi
if [[ "$ASSUME_YES" != 1 ]]; then
  read -rp "Proceed? [Y/n]: " CONFIRM </dev/tty || CONFIRM=Y
  [[ "${CONFIRM:-Y}" =~ ^[Nn] ]] && { echo "Aborted."; exit 1; }
fi

say "Installing system packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git openssl \
  python3 python3-venv python3-pip postgresql nginx supervisor >/dev/null

node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }
if [[ "$(node_major)" -lt 18 ]]; then
  if apt-cache policy nodejs 2>/dev/null | grep -qE 'Candidate: (1[89]|[2-9][0-9])\.'; then
    say "Installing Node.js from the distribution"
    apt-get install -y -qq nodejs npm >/dev/null
  else
    say "Installing Node.js $NODE_MAJOR from NodeSource (distribution version is too old)"
    install -d -m 0755 /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
      | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
      > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs >/dev/null
  fi
fi
echo "Node $(node -v), npm $(npm -v), $(python3 --version)"

say "Fetching the application"
if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch -q origin "+refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
  git -C "$INSTALL_DIR" checkout -q -f -B "$BRANCH" "origin/$BRANCH"
else
  [[ -e "$INSTALL_DIR" && -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]] \
    && die "$INSTALL_DIR exists and is not a git checkout. Move it away or pick another --dir."
  git clone -q --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"
echo "At $(git rev-parse --short HEAD): $(git log -1 --pretty=%s) (v$(cat VERSION))"

say "Setting up PostgreSQL"
systemctl enable --now postgresql >/dev/null 2>&1 || true
ENV_FILE="$INSTALL_DIR/backend/.env"
psql_q() { (cd /tmp && sudo -u postgres psql -qtAX "$@"); }
if [[ -f "$ENV_FILE" ]]; then
  echo "Keeping existing $ENV_FILE"
  # Older installs were set up with the example secret; anyone who knows it
  # can forge login tokens. Replacing it logs everyone out once.
  if grep -qE '^SECRET_KEY=(your-secret-key-change-in-production)?$' "$ENV_FILE" || ! grep -q '^SECRET_KEY=' "$ENV_FILE"; then
    sed -i '/^SECRET_KEY=/d' "$ENV_FILE"
    echo "SECRET_KEY=$(openssl rand -hex 32)" >> "$ENV_FILE"
    echo "Replaced the placeholder SECRET_KEY with a random one (users will need to log in again)"
  fi
else
  DB_NAME=projectmanager DB_USER=projectmanager
  DB_PASSWORD="$(openssl rand -hex 16)"
  if [[ "$(psql_q -c "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'")" == 1 ]]; then
    psql_q -c "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD'"
  else
    psql_q -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD'"
  fi
  if [[ "$(psql_q -c "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")" != 1 ]]; then
    psql_q -c "CREATE DATABASE $DB_NAME OWNER $DB_USER ENCODING 'UTF8' TEMPLATE template0"
  fi
  cat > "$ENV_FILE" <<EOF
DB_HOST=localhost
DB_PORT=5432
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
SECRET_KEY=$(openssl rand -hex 32)
ALGORITHM=HS256
EOF
  chmod 600 "$ENV_FILE"
  echo "Created database '$DB_NAME' and $ENV_FILE (random password and secret key)"
fi

say "Installing backend dependencies"
[[ -x backend/venv/bin/python ]] || python3 -m venv backend/venv
backend/venv/bin/pip install -q --upgrade pip
backend/venv/bin/pip install -q -r backend/requirements.txt

say "Running database migrations"
(cd backend && venv/bin/python migrate.py)

say "Building the frontend (takes a minute)"
(cd frontend && npm install --no-audit --no-fund --loglevel=error && GENERATE_SOURCEMAP=false npm run build >/dev/null) \
  || die "Frontend build failed. Re-run with the output visible: cd $INSTALL_DIR/frontend && npm run build"

say "Configuring Supervisor"
# The old dev-server setup ran the frontend under Supervisor; it's now static.
if [[ -f /etc/supervisor/conf.d/project-manager-frontend.conf ]]; then
  supervisorctl stop project-manager-frontend >/dev/null 2>&1 || true
  rm -f /etc/supervisor/conf.d/project-manager-frontend.conf
fi
# DB settings come from backend/.env only. Runs as root because the in-app
# updater needs git and supervisorctl.
cat > /etc/supervisor/conf.d/project-manager-backend.conf <<EOF
[program:project-manager-backend]
directory=$INSTALL_DIR/backend
command=$INSTALL_DIR/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
user=root
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
redirect_stderr=true
stdout_logfile=/var/log/project-manager-backend.log
EOF
systemctl enable --now supervisor >/dev/null 2>&1 || true
supervisorctl reread >/dev/null
supervisorctl update >/dev/null
supervisorctl restart project-manager-backend >/dev/null

say "Configuring Nginx"
sed "s#/opt/project-manager/frontend/build#$INSTALL_DIR/frontend/build#" deploy/nginx.conf \
  > /etc/nginx/sites-available/project-manager
ln -sf /etc/nginx/sites-available/project-manager /etc/nginx/sites-enabled/project-manager
rm -f /etc/nginx/sites-enabled/default
nginx -t -q || die "nginx config test failed"
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx 2>/dev/null || systemctl restart nginx

say "Checking that it's up"
for _ in $(seq 1 20); do
  HEALTH="$(curl -fsS http://127.0.0.1/api/health 2>/dev/null || true)"
  [[ -n "$HEALTH" ]] && break
  sleep 1
done
[[ -n "$HEALTH" ]] || die "The API did not come up. Check: tail -50 /var/log/project-manager-backend.log"

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo
echo "Done. Project Manager v$(cat VERSION) is running."
echo
echo "  http://${IP:-<this-host>}/"
echo
if [[ $UPDATE_MODE -eq 0 ]]; then
  echo "Open it and register — the first account becomes the admin."
fi
echo "Later updates: Settings -> Updates in the app, or re-run this script."
