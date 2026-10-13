from app.services.myauto import _extract_listing_horse_power, _parse_horse_power_value, parse_car


def test_parse_horsepower_value_accepts_numeric_and_unit_strings() -> None:
    assert _parse_horse_power_value(489) == 489
    assert _parse_horse_power_value("489 hp") == 489
    assert _parse_horse_power_value("489 ცხ.ძ.") == 489
    assert _parse_horse_power_value("489 / 360") == 489
    assert _parse_horse_power_value("0") is None
    assert _parse_horse_power_value("99999") is None


def test_extract_horsepower_from_top_level_payload_variants() -> None:
    hp, source = _extract_listing_horse_power({"max_power": 489})
    assert hp == 489
    assert source == "listing_max_power"


def test_extract_horsepower_from_nested_payload() -> None:
    hp, source = _extract_listing_horse_power(
        {"details": {"engine": {"engine_power_hp": "375 HP"}}}
    )
    assert hp == 375
    assert source == "listing_engine_power_hp"


def test_extract_horsepower_does_not_treat_generic_power_as_hp() -> None:
    hp, source = _extract_listing_horse_power({"battery": {"power": 208}})
    assert hp is None
    assert source is None


def test_parse_car_uses_max_power_when_hp_key_is_absent() -> None:
    car = parse_car(
        {
            "car_id": 123,
            "man_name": "BMW",
            "model_name": "X5",
            "car_model": "X5",
            "prod_year": 2025,
            "price": 34000,
            "engine_volume": 3000,
            "fuel_type_id": 2,
            "max_power": "375 hp",
            "km": 42526,
        }
    )

    assert car.horse_power == 375
    assert car.horse_power_source == "listing_max_power"
