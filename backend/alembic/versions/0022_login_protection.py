"""login protection: failed-login log, two-factor login

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-02

"""
from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "login_failures",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(150), nullable=False),
        sa.Column("ip", sa.String(64), nullable=False),
        sa.Column("at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_login_failures_username", "login_failures", ["username"])
    op.create_index("ix_login_failures_ip", "login_failures", ["ip"])
    op.create_index("ix_login_failures_at", "login_failures", ["at"])
    op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    op.add_column("users", sa.Column("totp_enabled_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("totp_last_step", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("totp_recovery", sa.Text(), nullable=True))


def downgrade() -> None:
    for col in ("totp_recovery", "totp_last_step", "totp_enabled_at", "totp_secret"):
        op.drop_column("users", col)
    op.drop_index("ix_login_failures_at", table_name="login_failures")
    op.drop_index("ix_login_failures_ip", table_name="login_failures")
    op.drop_index("ix_login_failures_username", table_name="login_failures")
    op.drop_table("login_failures")
