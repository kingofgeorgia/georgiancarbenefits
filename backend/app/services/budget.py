import asyncio
import math
from datetime import date
from decimal import ROUND_CEILING, Decimal

from app.calculation.age import resolve_vehicle_age
from app.calculation.tariffs import get_calculation_rule_version
from app.schemas.budget import BudgetCandidate, BudgetCostBreakdown, BudgetSearchRequest, BudgetSearchResult
from app.schemas.calculator import CurrencyRates
from app.services import currency, myauto
from app.services.personal_import_customs import calculatePersonalImportCustoms


def _money(value: Decimal | float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_CEILING))


def _russia_cost(car, payload, snapshot, as_of):
    costs = []
    # Year-only listings may cross the 3/5-year bands. Budget against the more
    # expensive endpoint, never silently assume the cheaper manufacture month.
    for manufactured in {date(car.year, 1, 1), min(date(car.year, 12, 31), as_of)}:
        age = resolve_vehicle_age(car_year=car.year, manufacture_date=manufactured, calculation_date=as_of)
        customs = calculatePersonalImportCustoms({
            "price": car.price_usd, "currencyToRubRate": snapshot.rates["USD"],
            "eurToRubRate": snapshot.rates["EUR"], "engineCc": car.engine_volume_cc,
            "horsePower": car.horse_power, "electricPowerKw": car.electric_power_kw,
            "ageYears": age.age_years, "isPersonalUse": True, "powertrainKind": car.powertrain_kind,
        })
        purchase = round(car.price_usd * snapshot.rates["USD"], 2)
        total = round(purchase + customs["total"] + payload.logistics_cost_rub + payload.registration_cost_rub, 2)
        costs.append((total, purchase, customs))
    total, purchase, customs = max(costs, key=lambda item: item[0])
    return BudgetCostBreakdown(
        purchase_rub=purchase, customs_fee_rub=customs["customsFee"], customs_duty_rub=customs["unifiedRate"],
        import_duty_rub=customs["importDuty"], excise_rub=customs["excise"], vat_rub=customs["vat"],
        recycling_fee_rub=customs["utilFee"], logistics_cost_rub=payload.logistics_cost_rub,
        registration_cost_rub=payload.registration_cost_rub, total_rub=total,
        minimum_total_rub=min(item[0] for item in costs), calculation_rule_version=get_calculation_rule_version(),
    )


async def search_by_budget(payload: BudgetSearchRequest) -> BudgetSearchResult:
    as_of = date.today()
    snapshot = None
    if payload.mode == "RUSSIA_TOTAL" or payload.budget_currency != "USD":
        snapshot = await currency.get_rate_snapshot()
        if not all(math.isfinite(value) and value > 0 for value in snapshot.rates.values()):
            raise currency.CurrencyUnavailableError("Invalid exchange rates")
    rates = {"RUB": Decimal(1)}
    if snapshot:
        rates.update({code: Decimal(str(value)) for code, value in snapshot.rates.items()})
    else:
        rates["USD"] = Decimal(1)
    budget = Decimal(str(payload.budget_amount))
    # A generous upstream price ceiling; exact local filtering is authoritative.
    ceiling_usd = budget * rates[payload.budget_currency] / rates["USD"]
    if payload.mode == "RUSSIA_TOTAL":
        available_rub = budget * rates[payload.budget_currency] - Decimal(str(payload.logistics_cost_rub)) - Decimal(str(payload.registration_cost_rub))
        ceiling_usd = max(Decimal(0), available_rub / rates["USD"])
    if ceiling_usd < Decimal("0.01"):
        raw_list = []
    else:
        try:
            async with asyncio.timeout(25):
                raw_list = await myauto.search_cars(
                    make_id=payload.make_id, year_from=payload.year_from, year_to=payload.year_to,
                    price_usd_to=min(100_000_000, math.ceil(ceiling_usd)), page=payload.page, raise_on_error=True,
                )
        except TimeoutError as exc:
            raise myauto.MyAutoUnavailableError("MyAuto search timed out") from exc
    matches = []
    pending = []
    seen = set()
    skipped = 0
    for raw in raw_list[:100]:
        try:
            if not isinstance(raw, dict):
                skipped += 1
                continue
            if any(raw.get(flag) in (1, "1", True) for flag in ("for_rent", "auction", "is_sold", "is_deleted", "is_auction")):
                skipped += 1
                continue
            if int(raw.get("vehicle_type", 0)) != 0:
                skipped += 1
                continue
            if "parent_loc_id" in raw and int(raw["parent_loc_id"]) != 1:
                skipped += 1
                continue
            if payload.make_id and int(raw.get("man_id") or 0) != payload.make_id:
                skipped += 1
                continue
            normalized = {**raw, "price": raw.get("price_usd", raw.get("price"))}
            car = myauto.parse_car(normalized)
            if car.car_id <= 0 or car.car_id in seen or not math.isfinite(car.price_usd) or not 0 < car.price_usd <= 100_000_000:
                skipped += 1
                continue
            seen.add(car.car_id)
            if payload.year_from and car.year < payload.year_from or payload.year_to and car.year > payload.year_to:
                skipped += 1
                continue
            if payload.mileage_km_to is not None and car.mileage_km is not None and car.mileage_km > payload.mileage_km_to:
                skipped += 1
                continue
            purchase_cost = Decimal(str(car.price_usd)) * rates["USD"] / rates[payload.budget_currency]
            if purchase_cost > budget:
                skipped += 1
                continue
            reason = None
            breakdown = None
            cost = purchase_cost
            if payload.mileage_km_to is not None and car.mileage_km is None:
                reason = "MILEAGE"
            elif payload.mode == "RUSSIA_TOTAL":
                if not 1900 <= car.year <= as_of.year:
                    reason = "VEHICLE_DATA"
                elif car.powertrain_kind in {"EV", "SERIES_HYBRID"} and not car.electric_power_kw:
                    reason = "ELECTRIC_POWER"
                elif car.powertrain_kind != "EV" and car.engine_volume_cc <= 0:
                    reason = "ENGINE"
                elif car.powertrain_kind not in {"EV", "SERIES_HYBRID"} and not car.horse_power:
                    reason = "HORSEPOWER"
                else:
                    breakdown = _russia_cost(car, payload, snapshot, as_of)
                    cost = Decimal(str(breakdown.total_rub)) / rates[payload.budget_currency]
            if reason:
                pending.append(BudgetCandidate(car=car, status="NEEDS_DETAILS", reason=reason))
            elif cost <= budget:
                rounded = _money(cost)
                if Decimal(str(rounded)) <= budget:
                    matches.append(BudgetCandidate(
                        car=car, status="WITHIN_BUDGET", cost_in_budget_currency=rounded,
                        remaining_budget=round(float(budget - Decimal(str(rounded))), 2), breakdown=breakdown,
                    ))
                else:
                    skipped += 1
            else:
                skipped += 1
        except (ValueError, TypeError, OverflowError):
            skipped += 1
    matches.sort(key=lambda item: (item.cost_in_budget_currency, -item.car.year, item.car.car_id))
    rate_model = None
    if snapshot:
        rate_model = CurrencyRates(
            usd_to_rub=snapshot.rates["USD"], eur_to_rub=snapshot.rates["EUR"], gel_to_rub=snapshot.rates["GEL"],
            source=snapshot.source, effective_date=snapshot.effective_date, fetched_at=snapshot.fetched_at, is_stale=snapshot.is_stale,
        )
    has_more = bool(raw_list) and payload.page < 100
    return BudgetSearchResult(
        request=payload, matches=matches, needs_details=pending, checked_count=min(len(raw_list), 100),
        skipped_count=skipped, has_more=has_more, next_page=payload.page + 1 if has_more else None,
        rates=rate_model, calculation_date=as_of,
    )
