"""Mind maps (brainstorming), one per row, nodes as JSON

Revision ID: 0024
Revises: 0023
Create Date: 2026-11-06

"""
from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mind_maps",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("uid", sa.Uuid(as_uuid=False), nullable=False, server_default=sa.text("gen_random_uuid()")),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("nodes", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("created_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("uid", name="mind_maps_uid_key"),
    )
    op.create_index("ix_mind_maps_id", "mind_maps", ["id"])
    op.create_index("ix_mind_maps_project_id", "mind_maps", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_mind_maps_project_id", table_name="mind_maps")
    op.drop_index("ix_mind_maps_id", table_name="mind_maps")
    op.drop_table("mind_maps")
