import pytest

from app.services.deal_score import (
    DealRating,
    MarketPosition,
    calculate_deal_assessment,
)


def test_market_parity_scores_50() -> None:
    result = calculate_deal_assessment(
        total_cost_rub=5_000_000,
        reference_price_rub=5_000_000,
    )
    assert result.savings_rub == 0
    assert result.savings_percent == 0
    assert result.score == 50
    assert result.rating == DealRating.WEAK
    assert result.market_position == MarketPosition.AT_MARKET


def test_10_percent_savings_is_good_deal() -> None:
    result = calculate_deal_assessment(
        total_cost_rub=4_500_000,
        reference_price_rub=5_000_000,
    )
    assert result.savings_rub == 500_000
    assert result.savings_percent == 10
    assert result.score == 70
    assert result.rating == DealRating.GOOD
    assert result.market_position == MarketPosition.UNDER_MARKET


def test_large_savings_is_clamped_to_100() -> None:
    result = calculate_deal_assessment(
        total_cost_rub=2_000_000,
        reference_price_rub=5_000_000,
    )
    assert result.score == 100
    assert result.rating == DealRating.EXCELLENT


def test_overpay_can_reach_zero_score() -> None:
    result = calculate_deal_assessment(
        total_cost_rub=7_000_000,
        reference_price_rub=5_000_000,
    )
    assert result.savings_rub == -2_000_000
    assert result.savings_percent == -40
    assert result.score == 0
    assert result.rating == DealRating.BAD
    assert result.market_position == MarketPosition.OVER_MARKET


def test_small_market_delta_is_treated_as_market_parity() -> None:
    result = calculate_deal_assessment(
        total_cost_rub=4_800_000,
        reference_price_rub=5_000_000,
    )
    assert result.savings_percent == 4
    assert result.market_position == MarketPosition.AT_MARKET


@pytest.mark.parametrize("reference_price_rub", [0, -1])
def test_reference_price_must_be_positive(reference_price_rub: float) -> None:
    with pytest.raises(ValueError):
        calculate_deal_assessment(
            total_cost_rub=4_000_000,
            reference_price_rub=reference_price_rub,
        )
