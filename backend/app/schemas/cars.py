from pydantic import BaseModel


class CarListing(BaseModel):
    car_id: int
    make: str
    model: str
    year: int
    price_usd: float
    engine_volume_cc: int
    mileage_km: int | None
    image_url: str | None
    url: str
    estimated_total_rub: float | None = None
