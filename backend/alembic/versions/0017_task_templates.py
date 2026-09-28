"""task templates

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-28

"""
from alembic import op
import sqlalchemy as sa

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_templates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("data", sa.Text(), nullable=False),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("name", name="task_templates_name_key"),
    )
    op.create_index("ix_task_templates_id", "task_templates", ["id"])


def downgrade() -> None:
    op.drop_index("ix_task_templates_id", table_name="task_templates")
    op.drop_table("task_templates")
