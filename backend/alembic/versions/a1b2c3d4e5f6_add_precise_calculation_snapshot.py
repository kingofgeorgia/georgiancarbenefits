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


def upgrade() -> None:
    op.add_column("calculations", sa.Column("manufacture_date", sa.Date(), nullable=True))
    op.add_column("calculations", sa.Column("horse_power", sa.Numeric(10, 2), nullable=True))
    op.add_column("calculations", sa.Column("util_coefficient", sa.Numeric(10, 4), nullable=True))
    op.add_column("calculations", sa.Column("powertrain_kind", sa.String(length=32), nullable=True))
    op.add_column(
        "calculations",
        sa.Column("is_personal_use", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "calculations",
        sa.Column("age_is_estimated", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column("calculations", sa.Column("customs_fee_rub", sa.Numeric(14, 2), nullable=True))
    op.add_column("calculations", sa.Column("customs_payment_kind", sa.String(length=32), nullable=True))
    op.add_column("calculations", sa.Column("import_duty_rub", sa.Numeric(14, 2), nullable=True))
    op.add_column("calculations", sa.Column("excise_rub", sa.Numeric(14, 2), nullable=True))
    op.add_column("calculations", sa.Column("vat_rub", sa.Numeric(14, 2), nullable=True))
    op.add_column("calculations", sa.Column("customs_total_rub", sa.Numeric(14, 2), nullable=True))
    op.add_column("calculations", sa.Column("calculation_rule_version", sa.String(length=128), nullable=True))
    op.add_column("calculations", sa.Column("currency_source", sa.String(length=32), nullable=True))
    op.add_column("calculations", sa.Column("currency_effective_date", sa.Date(), nullable=True))


def downgrade() -> None:
    for column in (
        "currency_effective_date",
        "currency_source",
        "calculation_rule_version",
        "customs_total_rub",
        "vat_rub",
        "excise_rub",
        "import_duty_rub",
        "customs_payment_kind",
        "customs_fee_rub",
        "age_is_estimated",
        "is_personal_use",
        "powertrain_kind",
        "util_coefficient",
        "horse_power",
        "manufacture_date",
    ):
        op.drop_column("calculations", column)
