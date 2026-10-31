"""store make, model, and trim with calculation history

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-10-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "e6f7a8b9c0d1"
down_revision: str | None = "d5e6f7a8b9c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("calculations")}
    additions = (
        ("source_make", sa.String(length=80)),
        ("source_model", sa.String(length=120)),
        ("source_trim", sa.String(length=180)),
    )
    for name, column_type in additions:
        if name not in columns:
            op.add_column("calculations", sa.Column(name, column_type, nullable=True))


def downgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("calculations")}
    for name in ("source_trim", "source_model", "source_make"):
        if name in columns:
            op.drop_column("calculations", name)
