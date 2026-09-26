#!/usr/bin/env bash
# Dumps the Project Manager database, using the connection settings in
# backend/.env, and keeps only the newest dumps.
#
#   scripts/backup-db.sh [label]
#
# Run automatically by scripts/update.sh and install.sh before migrations,
# and nightly as `backup-db.sh daily` from /etc/cron.d/project-manager
# (skipped when Settings -> "Back up automatically every night" is off);
# can also be run by hand at any time. Restore: see DEPLOYMENT.md.
#
# Daily dumps and all other dumps (before updates, manual, uploaded) are
# rotated separately, so a week of nightly backups never pushes out the
# backup taken before an update.
#
#   PM_BACKUP_DIR   where dumps go          (/var/backups/project-manager)
#   PM_BACKUP_KEEP  how many dumps to keep  (Settings -> Database backups, else 3)
#   PM_APP_DIR      app checkout            (the directory above this script)
#   PM_ENV_FILE     connection settings     ($PM_APP_DIR/backend/.env)
set -euo pipefail
# The Postgres client wrappers are Perl and warn when LANG names a locale the
# container doesn't have.
export LANG=C.UTF-8 LC_ALL=C.UTF-8

LABEL="${1:-manual}"
APP_DIR="${PM_APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="${PM_BACKUP_DIR:-/var/backups/project-manager}"
ENV_FILE="${PM_ENV_FILE:-$APP_DIR/backend/.env}"

[[ -f "$ENV_FILE" ]] || { echo "backup: $ENV_FILE not found" >&2; exit 1; }
command -v pg_dump >/dev/null || { echo "backup: pg_dump not found (install postgresql-client)" >&2; exit 1; }

# Read single keys from .env without sourcing it.
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
DB_HOST="$(env_get DB_HOST)"; DB_PORT="$(env_get DB_PORT)"
DB_USER="$(env_get DB_USER)"; DB_NAME="$(env_get DB_NAME)"
DB_PASSWORD="$(env_get DB_PASSWORD)"

# A value from the app's settings table (Settings page); empty if it isn't
# set or the table doesn't exist yet (pre-0003 databases).
setting() {
  PGPASSWORD="$DB_PASSWORD" psql -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" \
    -U "${DB_USER:-projectmanager}" -d "${DB_NAME:-projectmanager}" -qtAX \
    -c "SELECT value FROM app_settings WHERE key = '$1'" 2>/dev/null || true
}

if [[ "$LABEL" == daily ]]; then
  case "$(setting backup_daily | tr '[:upper:]' '[:lower:]')" in
    0|false|no|off) echo "Daily backups are turned off (Settings -> Backup & export)"; exit 0 ;;
  esac
fi

# Retention: Settings page, else 3.
[[ -n "${PM_BACKUP_KEEP:-}" ]] || PM_BACKUP_KEEP="$(setting backup_keep)"
KEEP="${PM_BACKUP_KEEP:-3}"
[[ "$KEEP" =~ ^[0-9]+$ && "$KEEP" -ge 1 ]] || KEEP=3

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
name() { echo "$BACKUP_DIR/${DB_NAME:-projectmanager}-$1-${LABEL//[^A-Za-z0-9._-]/_}.dump"; }
FILE="$(name "$STAMP")"
# Two backups within the same second must not overwrite each other.
n=2
while [[ -e "$FILE" ]]; do FILE="$(name "${STAMP}_$n")"; n=$((n + 1)); done

trap 'rm -f -- "$FILE.partial"' EXIT

# Custom format: compressed, restorable with pg_restore (also selectively).
PGPASSWORD="$DB_PASSWORD" pg_dump -h "${DB_HOST:-localhost}" -p "${DB_PORT:-5432}" -U "${DB_USER:-projectmanager}" \
  -Fc -f "$FILE.partial" "${DB_NAME:-projectmanager}"
mv "$FILE.partial" "$FILE"
chmod 600 "$FILE"
echo "Backup: $FILE ($(du -h "$FILE" | cut -f1))"

# Retention: keep the newest $KEEP dumps of the same kind (daily / other).
if [[ "$LABEL" == daily ]]; then same=(grep -- '-daily\.dump$'); else same=(grep -v -- '-daily\.dump$'); fi
ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | { "${same[@]}" || true; } | tail -n +"$((KEEP + 1))" | while read -r old; do
  rm -f -- "$old" && echo "Removed old backup: $(basename "$old")"
done
