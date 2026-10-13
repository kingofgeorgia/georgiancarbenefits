"""add precise calculation snapshot fields

Revision ID: a1b2c3d4e5f6
Revises: 5437fb538d42
Create Date: 2026-10-13
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "5437fb538d42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_COLUMNS: tuple[sa.Column, ...] = (
    sa.Column("manufacture_date", sa.Date(), nullable=True),
    sa.Column("horse_power", sa.Numeric(10, 2), nullable=True),
    sa.Column("util_coefficient", sa.Numeric(10, 4), nullable=True),
    sa.Column("powertrain_kind", sa.String(length=32), nullable=True),
    sa.Column("is_personal_use", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("age_is_estimated", sa.Boolean(), nullable=False, server_default=sa.true()),
    sa.Column("customs_fee_rub", sa.Numeric(14, 2), nullable=True),
    sa.Column("customs_payment_kind", sa.String(length=32), nullable=True),
    sa.Column("import_duty_rub", sa.Numeric(14, 2), nullable=True),
    sa.Column("excise_rub", sa.Numeric(14, 2), nullable=True),
    sa.Column("vat_rub", sa.Numeric(14, 2), nullable=True),
    sa.Column("customs_total_rub", sa.Numeric(14, 2), nullable=True),
    sa.Column("calculation_rule_version", sa.String(length=128), nullable=True),
    sa.Column("currency_source", sa.String(length=32), nullable=True),
    sa.Column("currency_effective_date", sa.Date(), nullable=True),
)


def _calculation_columns() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("calculations"):
        raise RuntimeError(
            "The calculations table is missing. The database is not compatible with the MileON baseline schema."
        )
    return {column["name"] for column in inspector.get_columns("calculations")}


def upgrade() -> None:
    existing = _calculation_columns()
    for column in _COLUMNS:
        if column.name not in existing:
            op.add_column("calculations", column)


def downgrade() -> None:
    existing = _calculation_columns()
    for column in reversed(_COLUMNS):
        if column.name in existing:
            op.drop_column("calculations", column.name)
