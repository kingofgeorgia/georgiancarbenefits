"""merge legacy and current migration branches

Revision ID: c4d5e6f7a8b9
Revises: b7c8d9e0f1a2, 8c10a5c2b7d1
Create Date: 2026-10-14
"""

from collections.abc import Sequence


revision: str = "c4d5e6f7a8b9"
down_revision: tuple[str, str] = ("b7c8d9e0f1a2", "8c10a5c2b7d1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
