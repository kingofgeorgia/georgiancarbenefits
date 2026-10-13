"""recognize legacy local database baseline

Revision ID: 8c10a5c2b7d1
Revises: 5437fb538d42
Create Date: 2026-10-14

This revision intentionally performs no schema changes. An early local build of
MileON used this Alembic revision after the original baseline migration, but the
migration file was not retained in the repository. Keeping the revision in the
graph lets those databases upgrade safely without stamping or deleting data.
"""

from collections.abc import Sequence


revision: str = "8c10a5c2b7d1"
down_revision: str | None = "5437fb538d42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
