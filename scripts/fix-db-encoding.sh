#!/usr/bin/env bash
# Converts the app database to UTF-8 if it was created with another encoding
# (e.g. SQL_ASCII on installs set up by hand before install.sh existed).
# Does nothing if it's already UTF-8, so it's safe to run any time.
#
#   scripts/fix-db-encoding.sh        (as root on the server)
#
# Steps: stop the backend, back up, rename the old database (kept as a
# fallback), create a UTF-8 database owned by the app user, restore, compare
# row counts, start the backend. On any failure the new database is dropped,
# the old one renamed back, and the backend started again.
#
#   PM_ENV_FILE    connection settings        ($APP_DIR/backend/.env)
#   PM_ADMIN_PSQL  psql with superuser rights (runuser -u postgres -- psql)
#   PM_DB_LOCALE   locale for the new DB      (C.UTF-8)
#   PM_STOP_CMD / PM_START_CMD  stop/start the backend (supervisorctl ...)
set -euo pipefail
export LANG=C.UTF-8 LC_ALL=C.UTF-8

APP_DIR="${PM_APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
ENV_FILE="${PM_ENV_FILE:-$APP_DIR/backend/.env}"
ADMIN_PSQL="${PM_ADMIN_PSQL:-runuser -u postgres -- psql}"
LOCALE="${PM_DB_LOCALE:-C.UTF-8}"
STOP_CMD="${PM_STOP_CMD:-supervisorctl stop project-manager-backend}"
START_CMD="${PM_START_CMD:-supervisorctl start project-manager-backend}"

die() { echo "!! $*" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || die "$ENV_FILE not found"
env_get() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
DB="$(env_get DB_NAME)"; DB_USER="$(env_get DB_USER)"
DB_HOST="$(env_get DB_HOST)"; DB_PORT="$(env_get DB_PORT)"; DB_PASSWORD="$(env_get DB_PASSWORD)"
: "${DB:=projectmanager}" "${DB_USER:=projectmanager}" "${DB_HOST:=localhost}" "${DB_PORT:=5432}"

# admin <database> <psql args...>
admin() {
  local db="$1"; shift
  # shellcheck disable=SC2086  # ADMIN_PSQL is a command line on purpose
  (cd /tmp && $ADMIN_PSQL -qtAX -v ON_ERROR_STOP=1 -d "$db" "$@") | tr -d '\r'
}
sql_lit() { printf "'%s'" "${1//\'/\'\'}"; }
sql_id() { printf '"%s"' "${1//\"/\"\"}"; }

ENC="$(admin postgres -c "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = $(sql_lit "$DB")")"
[[ -n "$ENC" ]] || die "database $DB not found"
if [[ "$ENC" == UTF8 ]]; then
  echo "Database $DB is already UTF-8 — nothing to do."
  exit 0
fi
echo "Database $DB uses $ENC; converting to UTF-8 (locale $LOCALE)."

# Restoring a SQL_ASCII dump doesn't validate the bytes, so check first that
# every text value is valid UTF-8 -- otherwise stop before changing anything.
echo "==> Checking that all text is valid UTF-8"
while IFS='|' read -r tbl col; do
  [[ -n "$tbl" ]] || continue
  if ! admin "$DB" -c "SELECT count(convert_from(convert_to($(sql_id "$col"), 'SQL_ASCII'), 'UTF8')) FROM public.$(sql_id "$tbl")" >/dev/null 2>"$(mktemp /tmp/pm-utf8-check-XXXXXX)"; then
    die "$tbl.$col contains bytes that aren't valid UTF-8 — fix those rows first. Nothing was changed."
  fi
done < <(admin "$DB" -c "SELECT table_name, column_name FROM information_schema.columns
                          WHERE table_schema = 'public' AND data_type IN ('text', 'character varying', 'character')")
rm -f /tmp/pm-utf8-check-*

counts() { # table=rows for every app table in database $1
  admin "$1" -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1" | while read -r t; do
    echo "$t=$(admin "$1" -c "SELECT count(*) FROM public.$(sql_id "$t")")"
  done
}

echo "==> Stopping the backend"
$STOP_CMD >/dev/null || true
trap 'echo "==> Starting the backend"; $START_CMD >/dev/null || true' EXIT

echo "==> Backing up"
BACKUP_OUT="$(bash "$APP_DIR/scripts/backup-db.sh" before-utf8)"
echo "$BACKUP_OUT"
DUMP="$(sed -n 's/^Backup: \(.*\) (.*)$/\1/p' <<<"$BACKUP_OUT" | head -1)"
[[ -f "$DUMP" ]] || die "backup failed, nothing was changed"
WORK="$(mktemp /tmp/pm-utf8-XXXXXX.dump)"
cp -- "$DUMP" "$WORK"   # retention may rotate the original out later
trap 'rm -f -- "$WORK"; echo "==> Starting the backend"; $START_CMD >/dev/null || true' EXIT

BEFORE="$(counts "$DB")"
OLD="${DB}_${ENC,,}_$(date +%Y%m%d%H%M%S)"

rollback() {
  echo "!! $1 — rolling back" >&2
  admin postgres -c "DROP DATABASE IF EXISTS $(sql_id "$DB")" || true
  admin postgres -c "ALTER DATABASE $(sql_id "$OLD") RENAME TO $(sql_id "$DB")" \
    && echo "!! Old database restored. Nothing changed." >&2 \
    || echo "!! Could not rename $OLD back to $DB — do it by hand." >&2
  exit 1
}

echo "==> Keeping the old database as $OLD"
admin postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $(sql_lit "$DB") AND pid <> pg_backend_pid()" >/dev/null
admin postgres -c "ALTER DATABASE $(sql_id "$DB") RENAME TO $(sql_id "$OLD")"

echo "==> Creating $DB as UTF-8"
admin postgres -c "CREATE DATABASE $(sql_id "$DB") OWNER $(sql_id "$DB_USER") ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE $(sql_lit "$LOCALE") LC_CTYPE $(sql_lit "$LOCALE")" \
  || rollback "creating the UTF-8 database failed"

echo "==> Restoring"
PGPASSWORD="$DB_PASSWORD" pg_restore -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB" \
  --no-owner --no-privileges --exit-on-error --single-transaction "$WORK" \
  || rollback "restore failed (data that isn't valid UTF-8?)"

AFTER="$(counts "$DB")"
[[ "$BEFORE" == "$AFTER" ]] || rollback "row counts differ after the restore:
$BEFORE
vs.
$AFTER"

echo "==> Done: $DB is UTF-8 ($(tr '\n' ' ' <<<"$AFTER"))"
echo "The old database is kept as $OLD. Once everything looks right, remove it with:"
echo "  runuser -u postgres -- psql -c 'DROP DATABASE \"$OLD\"'"
