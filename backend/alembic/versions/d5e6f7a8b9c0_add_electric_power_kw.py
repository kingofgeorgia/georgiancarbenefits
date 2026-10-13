"""add electric 30-minute power

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-10-14
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "d5e6f7a8b9c0"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("calculations")}
    if "electric_power_kw" not in columns:
        op.add_column(
            "calculations",
            sa.Column("electric_power_kw", sa.Numeric(10, 2), nullable=True),
        )


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("calculations")}
    if "electric_power_kw" in columns:
        op.drop_column("calculations", "electric_power_kw")
