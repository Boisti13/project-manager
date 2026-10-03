"""Home Assistant over MQTT: per-user opt-in

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-03

"""
from alembic import op
import sqlalchemy as sa

revision = "0023"
down_revision = "0022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("mqtt_enabled", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("users", sa.Column("mqtt_workspace_id", sa.Integer(), nullable=True))
    op.create_foreign_key("users_mqtt_workspace_id_fkey", "users", "workspaces", ["mqtt_workspace_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("users_mqtt_workspace_id_fkey", "users", type_="foreignkey")
    op.drop_column("users", "mqtt_workspace_id")
    op.drop_column("users", "mqtt_enabled")
