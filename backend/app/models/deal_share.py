from datetime import datetime

from sqlalchemy import DateTime, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DealShare(Base):
    __tablename__ = "deal_shares"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, index=True)
    schema_version: Mapped[str] = mapped_column(String(16), nullable=False, default="1")
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
