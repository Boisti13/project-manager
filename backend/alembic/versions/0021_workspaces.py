"""workspaces: each user's own groups of projects

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-02

"""
from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("user_id", "name", name="workspaces_user_name_key"),
    )
    op.create_index("ix_workspaces_id", "workspaces", ["id"])
    op.create_index("ix_workspaces_user_id", "workspaces", ["user_id"])
    op.create_table(
        "project_workspaces",
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_index("ix_project_workspaces_project_id", "project_workspaces", ["project_id"])
    op.create_index("ix_project_workspaces_workspace_id", "project_workspaces", ["workspace_id"])
    op.add_column("users", sa.Column("workspace_unassigned_everywhere", sa.Boolean(), server_default=sa.true(), nullable=False))


def downgrade() -> None:
    op.drop_column("users", "workspace_unassigned_everywhere")
    op.drop_index("ix_project_workspaces_workspace_id", table_name="project_workspaces")
    op.drop_index("ix_project_workspaces_project_id", table_name="project_workspaces")
    op.drop_table("project_workspaces")
    op.drop_index("ix_workspaces_user_id", table_name="workspaces")
    op.drop_index("ix_workspaces_id", table_name="workspaces")
    op.drop_table("workspaces")
