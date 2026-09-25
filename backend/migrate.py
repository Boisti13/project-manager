"""Bring the database schema up to date. Run from backend/ on every deploy:

    venv/bin/python migrate.py

- Fresh database: creates everything via the migrations.
- Database already under Alembic: runs any pending migrations.
- Database created by the old create_all() (pre-Alembic): checks that it
  matches the baseline revision, stamps it, then runs pending migrations.
  If it doesn't match, nothing is changed and the differences are printed.
"""
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import inspect

from app.database import engine

BASELINE = "0001"
APP_TABLES = {"users", "projects", "tasks"}


def baseline_problems(insp):
    """Differences between a pre-Alembic DB and the 0001 baseline."""
    problems = []
    tables = set(insp.get_table_names())
    missing = APP_TABLES - tables
    if missing:
        return [f"missing tables: {', '.join(sorted(missing))}"]

    if "is_admin" not in {c["name"] for c in insp.get_columns("users")}:
        problems.append("users.is_admin column is missing")

    fks = {fk["constrained_columns"][0]: fk for fk in insp.get_foreign_keys("tasks")}
    for col in ("project_id", "assignee_id"):
        fk = fks.get(col)
        if fk is None:
            problems.append(f"tasks.{col} has no foreign key")
        elif (fk.get("options") or {}).get("ondelete", "").upper() != "SET NULL":
            problems.append(f"tasks.{col} foreign key is not ON DELETE SET NULL")
    if "parent_task_id" not in fks:
        problems.append("tasks.parent_task_id has no foreign key")
    return problems


def main():
    cfg = Config(str(Path(__file__).resolve().parent / "alembic.ini"))
    insp = inspect(engine)
    tables = set(insp.get_table_names())

    if "alembic_version" not in tables and tables & APP_TABLES:
        problems = baseline_problems(insp)
        if problems:
            print("Existing schema does not match the baseline, not touching it:")
            for p in problems:
                print(f"  - {p}")
            print("Fix these by hand, then run migrate.py again.")
            sys.exit(1)
        print(f"Pre-Alembic database detected, stamping baseline {BASELINE}.")
        command.stamp(cfg, BASELINE)

    command.upgrade(cfg, "head")
    command.current(cfg)


if __name__ == "__main__":
    main()
