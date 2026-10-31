from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Index, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class VehiclePowerObservation(Base):
    """Append-only vehicle facts captured from successful calculator requests."""

    __tablename__ = "vehicle_power_observations"
    __table_args__ = (
        Index(
            "ix_vehicle_power_observations_exact_vehicle",
            "make_key",
            "model_key",
            "car_year",
            "engine_volume_cc",
            "powertrain_kind",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    make: Mapped[str | None] = mapped_column(String(80), nullable=True)
    model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    make_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    model_key: Mapped[str | None] = mapped_column(String(120), nullable=True)
    car_year: Mapped[int] = mapped_column(Integer, nullable=False)
    engine_volume_cc: Mapped[int] = mapped_column(Integer, nullable=False)
    powertrain_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    horse_power: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    electric_power_kw: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    source_trim: Mapped[str | None] = mapped_column(String(180), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    calculation_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
