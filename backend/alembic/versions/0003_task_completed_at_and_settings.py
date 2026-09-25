"""task completed_at, app_settings table

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-25

"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("completed_at", sa.DateTime(), nullable=True))
    # Best guess for tasks that are already done: when they were last changed.
    op.execute("UPDATE tasks SET completed_at = COALESCE(updated_at, created_at, now()) WHERE status = 'DONE'")

    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
    op.drop_column("tasks", "completed_at")
