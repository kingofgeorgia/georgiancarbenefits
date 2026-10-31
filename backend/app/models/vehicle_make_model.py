from sqlalchemy import Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class VehicleMakeModel(Base):
    """MyAuto make/model directory stored in the shared PostgreSQL catalog."""

    __tablename__ = "vehicle_make_models"
    __table_args__ = (Index("ix_vehicle_make_models_make_model", "make_id", "model_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    make_id: Mapped[int] = mapped_column(Integer, nullable=False)
    make: Mapped[str] = mapped_column(String(120), nullable=False)
    model_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    model: Mapped[str] = mapped_column(String(180), nullable=False)
    group_title: Mapped[str] = mapped_column(String(180), nullable=False, default="")
