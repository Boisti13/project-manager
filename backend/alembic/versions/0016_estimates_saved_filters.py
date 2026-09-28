"""time estimates on tasks, saved filters per user

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-28

"""
from alembic import op
import sqlalchemy as sa

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("estimate_minutes", sa.Integer(), nullable=True))
    op.create_table(
        "saved_filters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("query", sa.String(length=2000), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("user_id", "name", name="saved_filters_user_name_key"),
    )
    op.create_index("ix_saved_filters_id", "saved_filters", ["id"])
    op.create_index("ix_saved_filters_user_id", "saved_filters", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_filters_user_id", table_name="saved_filters")
    op.drop_index("ix_saved_filters_id", table_name="saved_filters")
    op.drop_table("saved_filters")
    op.drop_column("tasks", "estimate_minutes")
