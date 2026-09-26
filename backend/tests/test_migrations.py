"""Migrations and migrate.py, each on its own scratch database."""
import uuid

import pytest
from sqlalchemy import create_engine, text

from conftest import create_database, db_url, drop_database, run_backend


@pytest.fixture
def scratch_db():
    name = f"pm_mig_{uuid.uuid4().hex[:8]}"
    create_database(name)
    yield name
    drop_database(name)


def q(name, sql):
    eng = create_engine(db_url(name))
    try:
        with eng.begin() as c:
            r = c.execute(text(sql))
            return r.all() if r.returns_rows else None
    finally:
        eng.dispose()


def test_upgrade_downgrade_upgrade(scratch_db):
    run_backend("-m", "alembic", "upgrade", "head", db_name=scratch_db)
    run_backend("-m", "alembic", "downgrade", "base", db_name=scratch_db)
    assert q(scratch_db, "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename <> 'alembic_version'")[0][0] == 0
    run_backend("-m", "alembic", "upgrade", "head", db_name=scratch_db)


def test_models_match_migrations(scratch_db):
    run_backend("-m", "alembic", "upgrade", "head", db_name=scratch_db)
    r = run_backend("-m", "alembic", "check", db_name=scratch_db, check=False)
    assert r.returncode == 0, r.stdout + r.stderr


def test_upgrade_keeps_and_backfills_data(scratch_db):
    run_backend("-m", "alembic", "upgrade", "0001", db_name=scratch_db)
    q(scratch_db, "INSERT INTO projects(name, created_at, updated_at) VALUES ('A', now(), now()), ('B', now(), now())")
    q(scratch_db, "INSERT INTO tasks(title, status, project_id, created_at, updated_at) "
                  "VALUES ('done', 'DONE', 1, now(), now() - interval '3 days'), ('open', 'TODO', 1, now(), now())")
    run_backend("migrate.py", db_name=scratch_db)
    colors = [r[0] for r in q(scratch_db, "SELECT color FROM projects ORDER BY id")]
    assert len(set(colors)) == 2 and None not in colors
    rows = dict(q(scratch_db, "SELECT title, completed_at IS NOT NULL FROM tasks"))
    assert rows == {"done": True, "open": False}


def test_migrate_stamps_pre_alembic_database(scratch_db):
    """Databases created by the old create_all() get stamped, then upgraded."""
    from app.database import Base
    from app import models  # noqa: F401

    eng = create_engine(db_url(scratch_db))
    # Only the tables that existed at v1.0.0.
    Base.metadata.create_all(eng, tables=[Base.metadata.tables[t] for t in ("users", "projects", "tasks")])
    with eng.begin() as c:
        # v1.0.0 tables didn't have the later columns.
        c.execute(text("ALTER TABLE projects DROP COLUMN color, DROP COLUMN parent_id"))
        c.execute(text("ALTER TABLE tasks DROP COLUMN completed_at"))
    eng.dispose()
    r = run_backend("migrate.py", db_name=scratch_db)
    assert "stamping baseline 0001" in r.stdout
    assert q(scratch_db, "SELECT version_num FROM alembic_version")[0][0] == "0005"


def test_migrate_refuses_mismatched_pre_alembic_database(scratch_db):
    q(scratch_db, "CREATE TABLE users (id serial PRIMARY KEY, username varchar)")
    q(scratch_db, "CREATE TABLE projects (id serial PRIMARY KEY)")
    q(scratch_db, "CREATE TABLE tasks (id serial PRIMARY KEY)")
    r = run_backend("migrate.py", db_name=scratch_db, check=False)
    assert r.returncode == 1
    assert "does not match the baseline" in r.stdout
    assert q(scratch_db, "SELECT count(*) FROM pg_tables WHERE tablename = 'alembic_version'")[0][0] == 0
