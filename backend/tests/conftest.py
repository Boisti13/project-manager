"""Test setup: a real PostgreSQL database for the whole run.

The server is taken from PM_TEST_DATABASE_URL (a URL to a database the test
user may run CREATE DATABASE from, e.g. postgresql://postgres:pw@localhost/postgres).
Without it, a throwaway server is started with the `pgserver` package, so
`pytest` works with no Postgres installed.

Each run creates its own database, builds the schema with migrate.py (so the
migrations are exercised too), and empties all tables between tests.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


def _server_url():
    url = os.environ.get("PM_TEST_DATABASE_URL")
    if url:
        return url, None
    import pgserver  # dev dependency, see requirements-dev.txt

    data_dir = tempfile.mkdtemp(prefix="pm-test-pg-")
    srv = pgserver.get_server(data_dir, cleanup_mode="delete")
    return srv.get_uri(), srv


SERVER_URL, _PGSERVER = _server_url()
_u = urlparse(SERVER_URL)
DB_NAME = f"pm_test_{uuid.uuid4().hex[:8]}"
BACKUP_DIR = tempfile.mkdtemp(prefix="pm-test-backups-")

DB_ENV = {
    "DB_HOST": _u.hostname or "localhost",
    "DB_PORT": str(_u.port or 5432),
    "DB_USER": _u.username or "postgres",
    "DB_PASSWORD": _u.password or "",
    "DB_NAME": DB_NAME,
    "SECRET_KEY": "test-secret",
    "PM_BACKUP_DIR": BACKUP_DIR,
}
# Must be set before anything imports app.* (settings are read at import).
os.environ.update(DB_ENV)

# For scripts/backup-db.sh and restore-db.sh, which read connection settings
# from an env file rather than the environment.
ENV_FILE = Path(BACKUP_DIR).with_suffix(".env")
ENV_FILE.write_text("".join(f"{k}={v}\n" for k, v in DB_ENV.items() if k.startswith("DB_")))
os.environ["PM_ENV_FILE"] = str(ENV_FILE)
os.environ["PM_PYTHON"] = sys.executable

# pgserver ships pg_dump/psql/pg_restore; use them if they're not installed.
if _PGSERVER is not None:
    import pgserver

    os.environ["PATH"] = str(Path(pgserver.__file__).parent / "pginstall" / "bin") + os.pathsep + os.environ["PATH"]


def admin_engine():
    from sqlalchemy import create_engine

    return create_engine(SERVER_URL, isolation_level="AUTOCOMMIT")


def db_url(name=DB_NAME):
    return f"postgresql://{DB_ENV['DB_USER']}:{DB_ENV['DB_PASSWORD']}@{DB_ENV['DB_HOST']}:{DB_ENV['DB_PORT']}/{name}"


def create_database(name):
    from sqlalchemy import text

    with admin_engine().connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        c.execute(text(f'CREATE DATABASE "{name}"'))


def drop_database(name):
    from sqlalchemy import text

    with admin_engine().connect() as c:
        c.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))


def run_backend(*args, db_name=DB_NAME, check=True):
    """Runs a python module/script in backend/ against the given database."""
    env = {**os.environ, **DB_ENV, "DB_NAME": db_name}
    r = subprocess.run([sys.executable, *args], cwd=BACKEND, env=env, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise AssertionError(f"{' '.join(args)} failed:\n{r.stdout}\n{r.stderr}")
    return r


@pytest.fixture(scope="session", autouse=True)
def database():
    create_database(DB_NAME)
    run_backend("migrate.py")
    yield
    from app.database import engine

    engine.dispose()
    drop_database(DB_NAME)
    shutil.rmtree(BACKUP_DIR, ignore_errors=True)
    ENV_FILE.unlink(missing_ok=True)
    if _PGSERVER is not None:
        _PGSERVER.cleanup()


@pytest.fixture(autouse=True)
def clean_tables(database):
    yield
    from sqlalchemy import text
    from app.database import engine

    with engine.begin() as c:
        tables = [r[0] for r in c.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'"
        ))]
        if tables:
            c.execute(text("TRUNCATE " + ", ".join(f'"{t}"' for t in tables) + " RESTART IDENTITY CASCADE"))
    for f in Path(BACKUP_DIR).iterdir():
        f.unlink()


@pytest.fixture
def client(database):
    from fastapi.testclient import TestClient
    from app.auth import pwd_context
    from app.main import app

    # Full-strength bcrypt makes every register/login take ~0.3 s; tests
    # don't need that. Production settings are untouched.
    pwd_context.update(bcrypt__rounds=4)
    return TestClient(app)


class User:
    """A registered user with a ready-to-use auth header."""

    def __init__(self, client, username, password="Secret-pass-1"):
        r = client.post("/api/auth/register", json={
            "username": username, "email": f"{username}@example.com", "password": password,
        })
        assert r.status_code == 200, r.text
        self.data = r.json()
        self.id = self.data["id"]
        self.username = username
        self.password = password
        tok = client.post("/api/auth/login", data={"username": username, "password": password})
        assert tok.status_code == 200, tok.text
        self.headers = {"Authorization": f"Bearer {tok.json()['access_token']}"}


@pytest.fixture
def admin(client):
    return User(client, "admin")  # first account becomes admin


@pytest.fixture
def alice(client, admin):
    return User(client, "alice")


@pytest.fixture
def bob(client, admin):
    return User(client, "bob")


@pytest.fixture
def backup_dir():
    return Path(BACKUP_DIR)
