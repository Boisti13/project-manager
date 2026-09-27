"""repeat rules: weekdays, monthly mode, count from completion

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("recurrence_weekdays", sa.String(length=20), nullable=True))
    op.add_column("tasks", sa.Column("recurrence_monthly", sa.String(length=20), nullable=True))
    op.add_column("tasks", sa.Column("recurrence_from", sa.String(length=12), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "recurrence_from")
    op.drop_column("tasks", "recurrence_monthly")
    op.drop_column("tasks", "recurrence_weekdays")
