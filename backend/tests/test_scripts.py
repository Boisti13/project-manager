"""scripts/backup-db.sh and scripts/restore-db.sh against a real database.

Needs bash and the PostgreSQL client tools (pg_dump, pg_restore, psql);
skipped where they're missing.
"""
import os
import shutil
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import text

REPO = Path(__file__).resolve().parents[2]


def _bash():
    if os.name == "nt":
        git_bash = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Git" / "bin" / "bash.exe"
        return str(git_bash) if git_bash.exists() else None
    return shutil.which("bash")


BASH = _bash()
pytestmark = pytest.mark.skipif(
    not BASH or not all(shutil.which(t) for t in ("pg_dump", "pg_restore", "psql")),
    reason="needs bash and the PostgreSQL client tools",
)


def script(name, *args, **env):
    r = subprocess.run([BASH, f"scripts/{name}", *args], cwd=REPO, capture_output=True, text=True,
                       env=dict(os.environ, **env))
    return r.returncode, r.stdout + r.stderr


def backup(label="test", **env):
    rc, out = script("backup-db.sh", label, **env)
    assert rc == 0, out
    path = out.split("Backup: ")[1].rsplit(" (", 1)[0].strip()
    return path.replace("\\", "/")


def sql(query):
    from app.database import engine

    with engine.begin() as c:
        r = c.execute(text(query))
        return r.all() if r.returns_rows else None


def state():
    return (
        sql("SELECT version_num FROM alembic_version")[0][0],
        sorted(r[0] for r in sql("SELECT title FROM tasks")),
    )


def dumps(backup_dir):
    return sorted(p.name for p in backup_dir.glob("*.dump"))


def test_backup_retention(client, backup_dir):
    for i in range(5):
        backup(f"n{i}", PM_BACKUP_KEEP="2")
    names = dumps(backup_dir)
    assert len(names) == 2 and names[-1].endswith("-n4.dump")
    assert (backup_dir / names[0]).read_bytes()[:5] == b"PGDMP"


def test_backup_retention_from_settings(client, admin, backup_dir):
    client.put("/api/settings/", json={"backup_keep": 1}, headers=admin.headers)
    backup("a")
    backup("b")
    assert [n.rsplit("-", 1)[1] for n in dumps(backup_dir)] == ["b.dump"]


def test_backup_fails_cleanly_with_bad_credentials(backup_dir, tmp_path):
    bad = tmp_path / "bad.env"
    bad.write_text(Path(os.environ["PM_ENV_FILE"]).read_text().replace("DB_NAME=", "DB_NAME=does_not_exist_"))
    rc, out = script("backup-db.sh", "x", PM_ENV_FILE=str(bad))
    assert rc != 0
    assert list(backup_dir.iterdir()) == []  # no .partial left behind


def test_restore_roundtrip(client, alice, backup_dir):
    h = alice.headers
    client.post("/api/tasks/", json={"title": "before"}, headers=h)
    snapshot = backup("snap")
    client.post("/api/tasks/", json={"title": "after"}, headers=h)
    assert state()[1] == ["after", "before"]

    rc, out = script("restore-db.sh", snapshot)
    assert rc == 0, out
    assert state() == ("0006", ["before"])
    assert any("before-restore" in n for n in dumps(backup_dir))  # safety backup


def test_restore_rolls_back_on_corrupt_dump(client, alice, backup_dir, tmp_path):
    client.post("/api/tasks/", json={"title": "keep me"}, headers=alice.headers)
    good = Path(backup("good"))
    corrupt = tmp_path / "corrupt.dump"
    corrupt.write_bytes(good.read_bytes()[: good.stat().st_size // 2])
    before = state()
    rc, out = script("restore-db.sh", str(corrupt).replace("\\", "/"))
    assert rc == 1
    assert "Nothing changed" in out
    assert state() == before


def test_restore_rejects_non_dumps(tmp_path):
    junk = tmp_path / "junk.dump"
    junk.write_text("hello")
    rc, out = script("restore-db.sh", str(junk).replace("\\", "/"))
    assert rc == 1 and "not a pg_dump" in out


def test_restore_rolls_back_backup_from_newer_version(client, alice, backup_dir):
    client.post("/api/tasks/", json={"title": "current"}, headers=alice.headers)
    sql("UPDATE alembic_version SET version_num = '9999'")
    future = backup("future")
    sql("UPDATE alembic_version SET version_num = '0006'")
    before = state()
    rc, out = script("restore-db.sh", future)
    assert rc == 1
    assert state() == before


def test_restore_survives_retention_deleting_the_source(client, admin, alice, backup_dir):
    """The file being restored may be rotated out by the safety backup."""
    client.post("/api/tasks/", json={"title": "in snapshot"}, headers=alice.headers)
    snap = backup("snap")
    client.put("/api/settings/", json={"backup_keep": 1}, headers=admin.headers)
    client.post("/api/tasks/", json={"title": "later"}, headers=alice.headers)
    rc, out = script("restore-db.sh", snap)
    assert rc == 0, out
    assert state()[1] == ["in snapshot"]


@pytest.mark.skipif(os.name != "posix", reason="the restore endpoint only runs on Linux")
def test_restore_endpoint(client, admin, alice, backup_dir):
    client.post("/api/tasks/", json={"title": "snapshot task"}, headers=alice.headers)
    name = Path(backup("api")).name
    client.post("/api/tasks/", json={"title": "later task"}, headers=alice.headers)
    r = client.post(f"/api/system/backups/{name}/restore", headers=admin.headers)
    assert r.status_code == 200, r.text
    assert state()[1] == ["snapshot task"]


# ---- scripts/fix-db-encoding.sh ----------------------------------------------

def _encoding_env(tmp_path, db_name):
    from conftest import DB_ENV

    env_file = tmp_path / "enc.env"
    env_file.write_text("".join(f"{k}={v}\n" for k, v in {**DB_ENV, "DB_NAME": db_name}.items() if k.startswith("DB_")))
    admin = f"psql -h {DB_ENV['DB_HOST']} -p {DB_ENV['DB_PORT']} -U {DB_ENV['DB_USER']}"
    return {
        "PM_ENV_FILE": str(env_file).replace("\\", "/"),
        "PM_ADMIN_PSQL": admin,
        "PGPASSWORD": DB_ENV["DB_PASSWORD"],
        "PM_STOP_CMD": "true",
        "PM_START_CMD": "true",
        # Windows' PostgreSQL doesn't know C.UTF-8; the conversion itself is the same.
        "PM_DB_LOCALE": "C.UTF-8" if os.name == "posix" else "C",
    }


@pytest.fixture
def sql_ascii_db(tmp_path):
    """A database like the ones created by hand before install.sh: SQL_ASCII."""
    import uuid
    from conftest import _admin, drop_database, run_backend

    name = f"pm_enc_{uuid.uuid4().hex[:8]}"
    _admin(f'CREATE DATABASE "{name}" ENCODING \'SQL_ASCII\' TEMPLATE template0 LC_COLLATE \'C\' LC_CTYPE \'C\'')
    run_backend("migrate.py", db_name=name)
    yield name
    from sqlalchemy import create_engine
    from conftest import SERVER_URL

    eng = create_engine(SERVER_URL.replace("postgresql://", "postgresql+psycopg://", 1))
    with eng.connect() as c:
        others = [r[0] for r in c.execute(text("SELECT datname FROM pg_database WHERE datname LIKE :p"),
                                          {"p": name + "%"})]
    eng.dispose()
    for db in others:
        drop_database(db)


def _q(db_name, sql, **params):
    from sqlalchemy import create_engine
    from conftest import db_url

    eng = create_engine(db_url(db_name))
    try:
        with eng.begin() as c:
            r = c.execute(text(sql), params)
            return r.all() if r.returns_rows else None
    finally:
        eng.dispose()


def test_fix_encoding_converts_sql_ascii(sql_ascii_db, tmp_path, backup_dir):
    _q(sql_ascii_db, "INSERT INTO tasks(title, status, created_at, updated_at) VALUES (:t, 'TODO', now(), now())",
       t="Werkstatt aufräumen")
    rc, out = script("fix-db-encoding.sh", **_encoding_env(tmp_path, sql_ascii_db))
    assert rc == 0, out
    assert _q(sql_ascii_db, "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()")[0][0] == "UTF8"
    assert _q(sql_ascii_db, "SELECT title FROM tasks")[0][0] == "Werkstatt aufräumen"
    assert _q(sql_ascii_db, "SELECT version_num FROM alembic_version")[0][0] == "0006"
    if os.name == "posix":  # needs a UTF-8 locale for case-folding umlauts
        assert _q(sql_ascii_db, "SELECT count(*) FROM tasks WHERE title ILIKE '%AUFRÄUMEN%'")[0][0] == 1
    assert "kept as" in out
    # running again is a no-op
    rc, out = script("fix-db-encoding.sh", **_encoding_env(tmp_path, sql_ascii_db))
    assert rc == 0 and "nothing to do" in out


def test_fix_encoding_rolls_back_on_invalid_utf8(sql_ascii_db, tmp_path, backup_dir):
    env = _encoding_env(tmp_path, sql_ascii_db)
    # A byte that isn't valid UTF-8, as a SQL_ASCII database happily stores.
    bad = subprocess.run(
        [*env["PM_ADMIN_PSQL"].split(), "-d", sql_ascii_db, "-c",
         "SET client_encoding = 'SQL_ASCII'; "
         "INSERT INTO tasks(title, status, created_at, updated_at) VALUES (E'bad \\xff byte', 'TODO', now(), now())"],
        capture_output=True, text=True, env=dict(os.environ, PGPASSWORD=env["PGPASSWORD"]))
    assert bad.returncode == 0, bad.stderr
    rc, out = script("fix-db-encoding.sh", **env)
    assert rc == 1
    assert "tasks.title" in out and "Nothing was changed" in out
    assert _q(sql_ascii_db, "SELECT pg_encoding_to_char(encoding) FROM pg_database WHERE datname = current_database()")[0][0] == "SQL_ASCII"
    assert _q(sql_ascii_db, "SELECT count(*) FROM tasks")[0][0] == 1


def test_fix_encoding_noop_on_utf8(tmp_path):
    from conftest import DB_NAME

    rc, out = script("fix-db-encoding.sh", **_encoding_env(tmp_path, DB_NAME))
    assert rc == 0 and "already UTF-8" in out
