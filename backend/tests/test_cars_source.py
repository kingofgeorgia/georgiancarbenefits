from app.api.cars import _extract_myauto_car_id


def test_extract_myauto_id_from_numeric_input():
    assert _extract_myauto_car_id("123673764") == 123673764
    assert _extract_myauto_car_id("  123673764  ") == 123673764


def test_extract_myauto_id_from_listing_url():
    assert (
        _extract_myauto_car_id(
            "https://myauto.ge/ru/pr/123673764/prodaetsya-mashini?offerType=basic"
        )
        == 123673764
    )
    assert _extract_myauto_car_id("https://www.myauto.ge/en/pr/123673764") == 123673764


def test_extract_myauto_id_rejects_invalid_input():
    assert _extract_myauto_car_id("") is None
    assert _extract_myauto_car_id("abc123") is None
    assert _extract_myauto_car_id("https://myauto.ge/search/123673764") is None
    assert _extract_myauto_car_id("0") is None
