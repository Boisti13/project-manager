"""interface language per user

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-26

"""
from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("language", sa.String(length=5), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "language")
