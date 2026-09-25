"""baseline: schema as of v1.0.0

Matches what Base.metadata.create_all() produced, plus the changes that were
applied by hand on the live DB before migrations existed (users.is_admin,
ON DELETE SET NULL on tasks.project_id / tasks.assignee_id).

Existing databases are stamped at this revision instead of running it
(see backend/migrate.py).

Revision ID: 0001
Revises:
Create Date: 2026-09-25

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

# SQLAlchemy's Enum stores the Python member *names*, so these are the labels
# of the Postgres enum type, not the lowercase values.
taskstatus = sa.Enum("TODO", "IN_PROGRESS", "BLOCKED", "DONE", name="taskstatus")


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("hashed_password", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=True),
        sa.Column("is_admin", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_projects_id", "projects", ["id"])
    op.create_index("ix_projects_name", "projects", ["name"])

    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", taskstatus, nullable=True),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.Column("order", sa.Integer(), nullable=True),
        sa.Column("deadline", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("project_id", sa.Integer(), nullable=True),
        sa.Column("parent_task_id", sa.Integer(), nullable=True),
        sa.Column("assignee_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["parent_task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["assignee_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tasks_id", "tasks", ["id"])
    op.create_index("ix_tasks_title", "tasks", ["title"])


def downgrade() -> None:
    op.drop_table("tasks")
    op.drop_table("projects")
    op.drop_table("users")
    taskstatus.drop(op.get_bind(), checkfirst=True)
