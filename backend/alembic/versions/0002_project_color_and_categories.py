"""project color and categories (sub-projects)

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-25

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

# Same palette as app/routers/projects.py.
PALETTE = [
    "#2196f3", "#4caf50", "#ff9800", "#9c27b0", "#e91e63", "#009688",
    "#f44336", "#3f51b5", "#795548", "#00bcd4", "#8bc34a", "#607d8b",
]


def upgrade() -> None:
    op.add_column("projects", sa.Column("color", sa.String(length=7), nullable=True))
    op.add_column("projects", sa.Column("parent_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "projects_parent_id_fkey", "projects", "projects", ["parent_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_projects_parent_id", "projects", ["parent_id"])

    # Give existing projects distinct colors, in creation order.
    conn = op.get_bind()
    ids = [row[0] for row in conn.execute(sa.text("SELECT id FROM projects ORDER BY id"))]
    for i, pid in enumerate(ids):
        conn.execute(
            sa.text("UPDATE projects SET color = :c WHERE id = :id"),
            {"c": PALETTE[i % len(PALETTE)], "id": pid},
        )


def downgrade() -> None:
    op.drop_index("ix_projects_parent_id", table_name="projects")
    op.drop_constraint("projects_parent_id_fkey", "projects", type_="foreignkey")
    op.drop_column("projects", "parent_id")
    op.drop_column("projects", "color")
