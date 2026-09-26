"""recurring tasks

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-26

"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("recurrence_unit", sa.String(length=10), nullable=True))
    op.add_column("tasks", sa.Column("recurrence_interval", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("recurrence_next_id", sa.Integer(), nullable=True))
    op.create_foreign_key("tasks_recurrence_next_id_fkey", "tasks", "tasks",
                          ["recurrence_next_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("tasks_recurrence_next_id_fkey", "tasks", type_="foreignkey")
    op.drop_column("tasks", "recurrence_next_id")
    op.drop_column("tasks", "recurrence_interval")
    op.drop_column("tasks", "recurrence_unit")
