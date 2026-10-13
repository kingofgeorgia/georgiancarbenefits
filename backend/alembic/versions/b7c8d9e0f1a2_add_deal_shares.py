"""add deal shares

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-10-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa

revision: str = "b7c8d9e0f1a2"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "deal_shares",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("public_id", sa.String(length=32), nullable=False),
        sa.Column("schema_version", sa.String(length=16), nullable=False),
        sa.Column("snapshot", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_deal_shares_public_id"), "deal_shares", ["public_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_deal_shares_public_id"), table_name="deal_shares")
    op.drop_table("deal_shares")
