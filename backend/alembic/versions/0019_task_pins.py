"""pinned tasks per user

Revision ID: 0019
Revises: 0018
Create Date: 2026-09-28

"""
from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_pins",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("task_id", sa.Integer(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_task_pins_task_id", "task_pins", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_task_pins_task_id", table_name="task_pins")
    op.drop_table("task_pins")
