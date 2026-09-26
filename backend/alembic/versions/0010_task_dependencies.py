"""task dependencies (blocked by)

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-26

"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_dependencies",
        sa.Column("task_id", sa.Integer(), nullable=False),
        sa.Column("blocked_by_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["blocked_by_id"], ["tasks.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("task_id", "blocked_by_id"),
    )
    op.create_index("ix_task_dependencies_blocked_by_id", "task_dependencies", ["blocked_by_id"])


def downgrade() -> None:
    op.drop_table("task_dependencies")
