import asyncio
from datetime import date, datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import cars
from app.core.public_api import PublicAPIGuard
from app.main import validation_error
from app.schemas.budget import BudgetSearchRequest
from app.services import budget, currency, myauto, russian_market


def listing(car_id=1, **values):
    return {"car_id": car_id, "man_id": 3, "man_name": "BMW", "model_name": "X3", "price": 30000,
            "engine_volume": 1998, "horse_power": 150, "fuel_type_id": 2,
            "prod_year": date.today().year - 2, "km": 25000, **values}


@pytest.fixture
def setup(monkeypatch):
    rows = [listing()]
    calls = []

    async def search(**kwargs):
        calls.append(kwargs)
        return rows

    async def rates():
        return currency.CurrencySnapshot(rates={"USD": 90, "EUR": 100, "GEL": 30}, source="fixture", effective_date=date.today(), fetched_at=datetime.now(timezone.utc))

    async def forbidden(*args, **kwargs):
        raise AssertionError("Budget selection must never query Drom")

    monkeypatch.setattr(myauto, "search_cars", search)
    monkeypatch.setattr(currency, "get_rate_snapshot", rates)
    monkeypatch.setattr(russian_market, "get_market_comparison", forbidden)
    return rows, calls


def request(**values):
    return BudgetSearchRequest(mode="GEORGIA_PURCHASE", budget_amount=30000, budget_currency="USD", **values)


def russia(**values):
    return BudgetSearchRequest.model_validate({"mode": "RUSSIA_TOTAL", "budget_amount": 10000000, "budget_currency": "RUB", "logistics_cost_rub": 170000, "registration_cost_rub": 30000, **values})


def test_georgia_purchase_does_not_need_rates_or_power(setup, monkeypatch):
    rows, calls = setup
    rows[0]["horse_power"] = None

    async def forbidden():
        raise AssertionError("USD purchase search must work without exchange rates")

    monkeypatch.setattr(currency, "get_rate_snapshot", forbidden)
    result = asyncio.run(budget.search_by_budget(request()))
    assert len(result.matches) == 1 and result.rates is None
    assert result.matches[0].cost_in_budget_currency == 30000
    assert result.matches[0].remaining_budget == 0 and result.matches[0].breakdown is None
    assert calls[0]["price_usd_to"] == 30000 and calls[0]["raise_on_error"] is True


@pytest.mark.parametrize("code,amount,expected", [("RUB", 2700000, 2700000), ("GEL", 90000, 90000), ("USD", 30000, 30000)])
def test_purchase_currency_conversion_is_consistent(setup, code, amount, expected):
    payload = BudgetSearchRequest(mode="GEORGIA_PURCHASE", budget_amount=amount, budget_currency=code)
    result = asyncio.run(budget.search_by_budget(payload))
    assert result.matches[0].cost_in_budget_currency == expected
    result = asyncio.run(budget.search_by_budget(payload.model_copy(update={"budget_amount": amount - 0.01})))
    assert result.matches == []


def test_russia_includes_logistics_and_registration_and_exact_boundary(setup):
    result = asyncio.run(budget.search_by_budget(russia()))
    item = result.matches[0]
    costs = item.breakdown
    assert costs.total_rub == round(costs.purchase_rub + costs.customs_fee_rub + costs.customs_duty_rub + costs.recycling_fee_rub + 170000 + 30000, 2)
    exact = asyncio.run(budget.search_by_budget(russia(budget_amount=costs.total_rub)))
    assert len(exact.matches) == 1 and exact.matches[0].remaining_budget == 0
    too_low = asyncio.run(budget.search_by_budget(russia(budget_amount=costs.total_rub - 0.01)))
    assert not too_low.matches


def test_total_mode_does_not_reuse_purchase_only_match(setup):
    purchase = asyncio.run(budget.search_by_budget(request()))
    imported = asyncio.run(budget.search_by_budget(russia(budget_amount=30000, budget_currency="USD")))
    assert len(purchase.matches) == 1 and not imported.matches


def test_missing_ev_or_ice_power_is_never_reported_as_within_import_budget(setup):
    rows, _ = setup
    rows[:] = [listing(1, fuel_type_id=7, engine_volume=0, horse_power=455), listing(2, horse_power=None)]
    result = asyncio.run(budget.search_by_budget(russia()))
    assert not result.matches
    assert [item.reason for item in result.needs_details] == ["ELECTRIC_POWER", "HORSEPOWER"]
    assert all(item.remaining_budget is None and item.cost_in_budget_currency is None for item in result.needs_details)


def test_ev_uses_regulatory_power_when_available(setup, monkeypatch):
    car = myauto.parse_car(listing(fuel_type_id=7, engine_volume=0))
    car.electric_power_kw = 153
    monkeypatch.setattr(myauto, "parse_car", lambda raw: car)
    item = asyncio.run(budget.search_by_budget(russia())).matches[0]
    assert item.breakdown.vat_rub > 0 and item.breakdown.excise_rub > 0
    assert item.breakdown.customs_duty_rub == round(item.breakdown.import_duty_rub + item.breakdown.excise_rub + item.breakdown.vat_rub, 2)


@pytest.mark.parametrize("age", [3, 5])
def test_year_only_search_budgets_against_more_expensive_age_band(setup, age):
    rows, _ = setup
    rows[:] = [listing(prod_year=date.today().year - age)]
    item = asyncio.run(budget.search_by_budget(russia())).matches[0]
    assert item.breakdown.total_rub >= item.breakdown.minimum_total_rub
    if item.breakdown.total_rub != item.breakdown.minimum_total_rub:
        result = asyncio.run(budget.search_by_budget(russia(budget_amount=item.breakdown.minimum_total_rub)))
        assert not result.matches


def test_filters_duplicates_invalid_prices_and_unconfirmed_mileage(setup):
    rows, _ = setup
    rows[:] = [listing(1), listing(1), listing(2, price=float("nan")), listing(3, price=0),
               listing(4, km=50000), listing(5, km=None), listing(6, man_id=99),
               listing(7, for_rent=1), listing(8, is_sold=1), "invalid", listing(9, price="invalid")]
    result = asyncio.run(budget.search_by_budget(request(make_id=3, mileage_km_to=30000)))
    assert [item.car.car_id for item in result.matches] == [1]
    assert [item.car.car_id for item in result.needs_details] == [5]
    assert result.checked_count == 11 and result.skipped_count == 9


def test_pagination_is_one_provider_page_per_request_and_bounded(setup):
    _, calls = setup
    result = asyncio.run(budget.search_by_budget(request(page=2)))
    assert len(calls) == 1 and calls[0]["page"] == 2 and result.next_page == 3
    result = asyncio.run(budget.search_by_budget(request(page=100)))
    assert not result.has_more and result.next_page is None


def test_real_provider_price_currency_and_passenger_sale_filters(setup):
    rows, _ = setup
    rows[:] = [listing(1, price=10000, price_usd=3500, vehicle_type=0, parent_loc_id=1),
               listing(2, vehicle_type=1), listing(3, parent_loc_id=-1), listing(4, auction=True),
               listing(5, price_usd=0), listing(6, for_rent=True)]
    result = asyncio.run(budget.search_by_budget(request()))
    assert [item.car.car_id for item in result.matches] == [1]
    assert result.matches[0].car.price_usd == 3500
    assert result.matches[0].remaining_budget == 26500


def test_budget_below_fixed_costs_does_not_call_provider(setup):
    _, calls = setup
    result = asyncio.run(budget.search_by_budget(russia(budget_amount=100)))
    assert not result.matches and not result.has_more and calls == []


@pytest.mark.parametrize("changes", [{"budget_amount": 0}, {"budget_amount": float("nan")}, {"budget_amount": float("inf")}, {"mode": "INVALID"}, {"budget_currency": "EUR"}, {"page": 101}, {"year_from": 2024, "year_to": 2020}, {"registration_cost_rub": -1}, {"mode": "RUSSIA_TOTAL"}])
def test_invalid_budget_inputs_are_rejected(changes):
    with pytest.raises(ValidationError):
        BudgetSearchRequest.model_validate({"mode": "GEORGIA_PURCHASE", "budget_amount": 30000, "budget_currency": "USD", **changes})


def test_budget_endpoint_reports_provider_and_exchange_failure_not_empty_results(setup, monkeypatch):
    app = FastAPI()
    app.include_router(cars.router)
    app.add_exception_handler(RequestValidationError, validation_error)

    async def unavailable(**kwargs):
        raise myauto.MyAutoUnavailableError("Sensitive upstream URL")

    monkeypatch.setattr(myauto, "search_cars", unavailable)
    with TestClient(app) as client:
        response = client.post("/cars/budget", json=request().model_dump())
        assert response.status_code == 503 and response.json()["detail"]["code"] == "MYAUTO_UNAVAILABLE"
        assert "Sensitive" not in response.text
        response = client.post("/cars/budget", content='{"mode":"GEORGIA_PURCHASE","budget_amount":NaN,"budget_currency":"USD"}', headers={"content-type": "application/json"})
        assert response.status_code == 422

        async def no_rates():
            raise currency.CurrencyUnavailableError("Unavailable")

        monkeypatch.setattr(currency, "get_rate_snapshot", no_rates)
        response = client.post("/cars/budget", json=russia().model_dump())
        assert response.status_code == 503 and response.json()["detail"]["code"] == "RATES_UNAVAILABLE"


def test_budget_endpoint_uses_existing_lookup_rate_group():
    assert PublicAPIGuard.group({"path": "/cars/budget/", "method": "POST"}) == "lookup"
