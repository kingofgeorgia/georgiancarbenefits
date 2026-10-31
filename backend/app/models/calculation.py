from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

if TYPE_CHECKING:
    from app.models.user import User


class Calculation(Base):
    __tablename__ = "calculations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    car_price_usd: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    engine_volume_cc: Mapped[int] = mapped_column(Integer, nullable=False)
    car_year: Mapped[int] = mapped_column(Integer, nullable=False)
    source_make: Mapped[str | None] = mapped_column(String(80), nullable=True)
    source_model: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_trim: Mapped[str | None] = mapped_column(String(180), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    manufacture_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    horse_power: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    electric_power_kw: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    util_coefficient: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    powertrain_kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_personal_use: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    age_is_estimated: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    logistics_cost_rub: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    rf_analog_price_rub: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)

    customs_fee_rub: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    customs_duty_rub: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    customs_payment_kind: Mapped[str | None] = mapped_column(String(32), nullable=True)
    import_duty_rub: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    excise_rub: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    vat_rub: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    recycling_fee_rub: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    customs_total_rub: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    total_cost_rub: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    calculation_rule_version: Mapped[str | None] = mapped_column(String(128), nullable=True)

    usd_to_rub: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    eur_to_rub: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    gel_to_rub: Mapped[float] = mapped_column(Numeric(10, 4), nullable=False)
    currency_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    currency_effective_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="calculations")
