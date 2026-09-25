#!/usr/bin/env bash
# Replaces the Project Manager database with a backup made by backup-db.sh
# (any pg_dump custom-format dump of this app), then migrates it to the
# current schema.
#
#   scripts/restore-db.sh /var/backups/project-manager/<file>.dump
#
# 1. makes a safety backup of the current database
# 2. drops the app's tables and types
# 3. pg_restore's the dump
# 4. runs migrate.py (older backups are upgraded)
# If 3 or 4 fails, the safety backup is restored the same way.
#
# Uses the connection settings in backend/.env. Works on a running
# instance; used by Settings -> Backup & export -> Restore and by
# install.sh --restore.
set -euo pipefail
export LANG=C.UTF-8 LC_ALL=C.UTF-8

DUMP="${1:?usage: restore-db.sh <file.dump>}"
APP_DIR="${PM_APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
PYTHON="${PM_PYTHON:-$APP_DIR/backend/venv/bin/python}"
ENV_FILE="$APP_DIR/backend/.env"

[[ -f "$DUMP" ]] || { echo "restore: $DUMP not found" >&2; exit 1; }
[[ "$(head -c 5 "$DUMP")" == PGDMP ]] || { echo "restore: $DUMP is not a pg_dump custom-format file" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "restore: $ENV_FILE not found" >&2; exit 1; }

env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
PGHOST="$(env_get DB_HOST)"; PGPORT="$(env_get DB_PORT)"; PGUSER="$(env_get DB_USER)"
PGDATABASE="$(env_get DB_NAME)"; PGPASSWORD="$(env_get DB_PASSWORD)"
: "${PGHOST:=localhost}" "${PGPORT:=5432}" "${PGUSER:=projectmanager}" "${PGDATABASE:=projectmanager}"
export PGHOST PGPORT PGUSER PGDATABASE PGPASSWORD

# Only objects this app's DB user owns are dropped, so this never needs
# superuser rights and never touches anything else in the database.
drop_app_objects() {
  psql -qX -v ON_ERROR_STOP=1 <<'SQL'
SET lock_timeout = '15s';
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.tablename);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
           WHERE n.nspname = 'public' AND t.typtype = 'e' AND pg_get_userbyid(t.typowner) = current_user LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;
SQL
}

load() { # $1 = dump file
  drop_app_objects \
    && pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -d "$PGDATABASE" "$1" \
    && (cd "$APP_DIR/backend" && "$PYTHON" migrate.py)
}

echo "==> Safety backup of the current database"
SAFETY_OUT="$(bash "$APP_DIR/scripts/backup-db.sh" before-restore)"
echo "$SAFETY_OUT"
SAFETY="$(sed -n 's/^Backup: \(.*\) (.*)$/\1/p' <<<"$SAFETY_OUT" | head -1)"
[[ -f "$SAFETY" ]] || { echo "restore: safety backup failed, nothing was changed" >&2; exit 1; }

echo "==> Restoring $(basename "$DUMP")"
if load "$DUMP"; then
  echo "==> Restore complete"
  exit 0
fi

echo "!! Restore failed; putting back the safety backup $(basename "$SAFETY")" >&2
if load "$SAFETY"; then
  echo "!! Previous data restored. Nothing changed." >&2
else
  echo "!! Could not restore the safety backup either. It is at $SAFETY — restore it by hand (see DEPLOYMENT.md)." >&2
fi
exit 1
