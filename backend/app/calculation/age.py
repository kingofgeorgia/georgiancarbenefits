from __future__ import annotations

from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class VehicleAge:
    manufacture_date_used: date
    calculation_date: date
    age_years: float
    age_is_estimated: bool
    estimation_method: str | None = None


def _anniversary(original: date, year: int) -> date:
    """Return an anniversary date, normalizing Feb 29 to Feb 28 when needed."""
    try:
        return original.replace(year=year)
    except ValueError:
        return original.replace(year=year, day=28)


def calculate_fractional_age_years(manufacture_date: date, calculation_date: date) -> float:
    if manufacture_date > calculation_date:
        raise ValueError("manufacture_date cannot be later than calculation_date")

    full_years = calculation_date.year - manufacture_date.year
    current_anniversary = _anniversary(manufacture_date, manufacture_date.year + full_years)
    if current_anniversary > calculation_date:
        full_years -= 1
        current_anniversary = _anniversary(manufacture_date, manufacture_date.year + full_years)

    next_anniversary = _anniversary(manufacture_date, manufacture_date.year + full_years + 1)
    year_length_days = (next_anniversary - current_anniversary).days
    elapsed_days = (calculation_date - current_anniversary).days
    fractional = elapsed_days / year_length_days if year_length_days else 0.0
    return round(full_years + fractional, 8)


def resolve_vehicle_age(
    *,
    car_year: int,
    manufacture_date: date | None,
    calculation_date: date | None = None,
) -> VehicleAge:
    as_of = calculation_date or date.today()
    if car_year < 1900 or car_year > as_of.year:
        raise ValueError("car_year is outside the supported range")

    if manufacture_date is not None:
        if manufacture_date.year != car_year:
            raise ValueError("manufacture_date year must match car_year")
        used_date = manufacture_date
        is_estimated = False
        method = None
    else:
        # Year-only listings do not contain enough information to determine the
        # 3/5-year customs boundary precisely. Use the start of the model year
        # as a conservative estimate and expose that fact in the API result.
        used_date = date(car_year, 1, 1)
        is_estimated = True
        method = "year_start"

    return VehicleAge(
        manufacture_date_used=used_date,
        calculation_date=as_of,
        age_years=calculate_fractional_age_years(used_date, as_of),
        age_is_estimated=is_estimated,
        estimation_method=method,
    )
