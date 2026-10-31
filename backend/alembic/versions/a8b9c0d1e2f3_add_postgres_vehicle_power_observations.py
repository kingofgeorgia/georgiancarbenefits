"""Store calculator observations in the shared PostgreSQL vehicle catalog.

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-10-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a8b9c0d1e2f3"
down_revision: str | None = "f7a8b9c0d1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vehicle_make_models",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("make_id", sa.Integer(), nullable=False),
        sa.Column("make", sa.String(length=120), nullable=False),
        sa.Column("model_id", sa.Integer(), nullable=True),
        sa.Column("model", sa.String(length=180), nullable=False),
        sa.Column("group_title", sa.String(length=180), nullable=False, server_default=""),
    )
    op.create_index("ix_vehicle_make_models_id", "vehicle_make_models", ["id"])
    op.create_index(
        "ix_vehicle_make_models_make_model",
        "vehicle_make_models",
        ["make_id", "model_id"],
    )

    op.create_table(
        "vehicle_power_observations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("make", sa.String(length=80), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("make_key", sa.String(length=80), nullable=True),
        sa.Column("model_key", sa.String(length=120), nullable=True),
        sa.Column("car_year", sa.Integer(), nullable=False),
        sa.Column("engine_volume_cc", sa.Integer(), nullable=False),
        sa.Column("powertrain_kind", sa.String(length=32), nullable=False),
        sa.Column("horse_power", sa.Numeric(10, 2), nullable=True),
        sa.Column("electric_power_kw", sa.Numeric(10, 2), nullable=True),
        sa.Column("source_trim", sa.String(length=180), nullable=True),
        sa.Column("source_url", sa.String(length=2048), nullable=True),
        sa.Column("calculation_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_vehicle_power_observations_id",
        "vehicle_power_observations",
        ["id"],
    )
    op.create_index(
        "ix_vehicle_power_observations_exact_vehicle",
        "vehicle_power_observations",
        ["make_key", "model_key", "car_year", "engine_volume_cc", "powertrain_kind"],
    )


def downgrade() -> None:
    op.drop_index("ix_vehicle_power_observations_exact_vehicle", table_name="vehicle_power_observations")
    op.drop_index("ix_vehicle_power_observations_id", table_name="vehicle_power_observations")
    op.drop_table("vehicle_power_observations")
    op.drop_index("ix_vehicle_make_models_make_model", table_name="vehicle_make_models")
    op.drop_index("ix_vehicle_make_models_id", table_name="vehicle_make_models")
    op.drop_table("vehicle_make_models")
