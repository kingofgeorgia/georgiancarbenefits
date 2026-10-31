"""Store the active vehicle catalogue in PostgreSQL.

Revision ID: b9c0d1e2f3a4
Revises: a8b9c0d1e2f3
Create Date: 2026-10-31
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "b9c0d1e2f3a4"
down_revision: str | None = "a8b9c0d1e2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "vehicle_catalog_state",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("id = 1", name="ck_vehicle_catalog_state_singleton"),
    )
    op.bulk_insert(
        sa.table(
            "vehicle_catalog_state",
            sa.column("id", sa.Integer()),
            sa.column("payload", postgresql.JSONB()),
        ),
        [
            {
                "id": 1,
                "payload": {
                    "schema_version": 1,
                    "updated_at": "2026-10-31",
                    "make_model_records": [],
                    "bmw_variants": [],
                    "tesla_power_variants": [],
                    "tesla_power_reference_rows": [],
                    "vehicle_specifications": [],
                    "vehicle_specifications_version": "2026-10-31",
                },
            }
        ],
    )


def downgrade() -> None:
    op.drop_table("vehicle_catalog_state")
