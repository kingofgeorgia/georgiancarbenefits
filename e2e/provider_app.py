"""Full-stack E2E app: replace external providers, keep API/calculation/DB real."""

from datetime import date, datetime, timezone

from app.main import app  # noqa: F401
from app.services import currency, myauto, vin_decoder


async def rates():
    return currency.CurrencySnapshot(
        rates={"USD": 90, "EUR": 100, "GEL": 30},
        source="CBR E2E fixture",
        effective_date=date.today(),
        fetched_at=datetime.now(timezone.utc),
    )


async def listing(car_id: int):
    fixtures = {
        1001: {"man_name": "BMW", "model_name": "X3", "engine_volume": 1998,
               "horse_power": 150, "fuel_type_id": 2, "price": 30000, "age": 2},
        1002: {"man_name": "Toyota", "model_name": "Prius", "engine_volume": 1798,
               "horse_power": 121, "fuel_type_id": 4, "price": 20000, "age": 4},
        1003: {"man_name": "Tesla", "model_name": "Model Y", "engine_volume": 0,
               "horse_power": 455, "fuel_type_id": 7, "price": 30000, "age": 2},
    }
    raw = fixtures.get(car_id)
    if raw is None:
        return None
    return {**raw, "car_id": car_id, "prod_year": date.today().year - raw["age"], "km": 25000}


async def vin(value: str):
    normalized = vin_decoder.normalize_vin(value)
    if not vin_decoder.validate_vin(normalized):
        raise ValueError("VIN must contain exactly 17 valid VIN characters")
    if normalized == "1HGCM82633A004352":
        row = {"Make": "HONDA", "Model": "Accord", "ModelYear": "2003",
               "DisplacementCC": "2999", "EngineHP": "240", "FuelTypePrimary": "Gasoline"}
    elif normalized == "1HGCM82633A004353":
        row = {"Make": "HONDA", "Model": "Accord", "ModelYear": "2003", "FuelTypePrimary": "Gasoline"}
    elif normalized == "5YJ3E1EA0SF004091":
        row = {"Make": "TESLA", "Model": "Model 3", "ModelYear": str(date.today().year - 2),
               "FuelTypePrimary": "Electric", "ElectrificationLevel": "BEV", "EngineHP": "283"}
    else:
        row = {}
    return vin_decoder.parse_vpic_result({"Results": [row]}, normalized)


currency.get_rate_snapshot = rates
myauto.get_car_by_id = listing
vin_decoder.decode_vin = vin
