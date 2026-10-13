from pydantic import BaseModel, ConfigDict, field_validator

from app.services.personal_import_customs import PowertrainKind
from app.services.vin_decoder import VinDecodeStatus


class CarModelOption(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_id: int
    man_id: int
    title: str
    group_title: str | None = None


class CarListing(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    car_id: int
    category_id: int | None = None
    make: str
    model_id: int | None = None
    car_model: str | None = None
    model: str
    year: int
    price_usd: float
    engine_volume_cc: int
    horse_power: int | None = None
    horse_power_source: str | None = None
    fuel_type: str | None = None
    util_coefficient: float | None = None
    powertrain_kind: PowertrainKind | None = None
    mileage_km: int | None = None
    image_url: str | None = None
    image_urls: list[str] = []
    url: str
    estimated_total_rub: float | None = None
    estimate_warning: str | None = None


class VinDecodeRequest(BaseModel):
    vin: str

    @field_validator("vin")
    @classmethod
    def normalize_vin(cls, value: str) -> str:
        return value.strip().upper()


class VinDecodeOut(BaseModel):
    status: VinDecodeStatus
    vin: str
    make: str | None = None
    model: str | None = None
    model_year: int | None = None
    trim: str | None = None
    series: str | None = None
    manufacturer: str | None = None
    body_class: str | None = None
    vehicle_type: str | None = None
    fuel_type: str | None = None
    electrification_level: str | None = None
    engine_cylinders: int | None = None
    displacement_l: float | None = None
    displacement_cc: int | None = None
    engine_kw: float | None = None
    horse_power: float | None = None
    drive_type: str | None = None
    transmission_style: str | None = None
    plant_country: str | None = None
    plant_city: str | None = None
    powertrain_kind: PowertrainKind | None = None
    complete_for_calculator: bool = False
    error_code: str | None = None
    error_text: str | None = None
    warning: str | None = None
    source: str = "NHTSA vPIC"
