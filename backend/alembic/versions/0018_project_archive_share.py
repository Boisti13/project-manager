"""archived projects, read-only share links

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-28

"""
from alembic import op
import sqlalchemy as sa

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("projects", sa.Column("archived_at", sa.DateTime(), nullable=True))
    op.add_column("projects", sa.Column("share_token", sa.String(length=64), nullable=True))
    op.create_unique_constraint("projects_share_token_key", "projects", ["share_token"])


def downgrade() -> None:
    op.drop_constraint("projects_share_token_key", "projects", type_="unique")
    op.drop_column("projects", "share_token")
    op.drop_column("projects", "archived_at")
