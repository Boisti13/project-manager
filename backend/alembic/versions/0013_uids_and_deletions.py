"""uids on tasks/projects/labels/comments, deletion records, labels.updated_at

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-27

"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

TABLES = ("tasks", "projects", "labels", "task_comments")


def upgrade() -> None:
    for table in TABLES:
        # gen_random_uuid() fills existing rows too (PostgreSQL 13+).
        op.add_column(table, sa.Column("uid", sa.Uuid(as_uuid=False), nullable=False,
                                       server_default=sa.text("gen_random_uuid()")))
        op.create_unique_constraint(f"{table}_uid_key", table, ["uid"])
    op.add_column("labels", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE labels SET updated_at = created_at")
    op.create_table(
        "deletions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("entity", sa.String(length=20), nullable=False),
        sa.Column("entity_id", sa.Integer(), nullable=False),
        sa.Column("uid", sa.Uuid(as_uuid=False), nullable=True),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("deleted_by_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["deleted_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_deletions_id", "deletions", ["id"])
    op.create_index("ix_deletions_deleted_at", "deletions", ["deleted_at"])


def downgrade() -> None:
    op.drop_table("deletions")
    op.drop_column("labels", "updated_at")
    for table in TABLES:
        op.drop_constraint(f"{table}_uid_key", table, type_="unique")
        op.drop_column(table, "uid")
