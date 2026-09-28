"""calendar feed token per user

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-28

"""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("calendar_token", sa.String(length=64), nullable=True))
    op.create_unique_constraint("users_calendar_token_key", "users", ["calendar_token"])


def downgrade() -> None:
    op.drop_constraint("users_calendar_token_key", "users", type_="unique")
    op.drop_column("users", "calendar_token")
