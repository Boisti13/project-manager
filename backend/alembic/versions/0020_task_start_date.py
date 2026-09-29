"""start date of tasks (timeline)

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-29

"""
from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("start_date", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "start_date")
