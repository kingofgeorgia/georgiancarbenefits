from dataclasses import dataclass
from enum import StrEnum


class DealRating(StrEnum):
    EXCELLENT = "EXCELLENT"
    GOOD = "GOOD"
    FAIR = "FAIR"
    WEAK = "WEAK"
    BAD = "BAD"


class MarketPosition(StrEnum):
    UNDER_MARKET = "UNDER_MARKET"
    AT_MARKET = "AT_MARKET"
    OVER_MARKET = "OVER_MARKET"


@dataclass(frozen=True)
class DealAssessment:
    reference_price_rub: float
    savings_rub: float
    savings_percent: float
    score: int
    rating: DealRating
    market_position: MarketPosition


def calculate_deal_assessment(*, total_cost_rub: float, reference_price_rub: float) -> DealAssessment:
    """Rate an import deal against a Russia-market reference price.

    Score semantics:
    - 50 means price parity with the reference market price;
    - every 1% of savings moves the score by 2 points;
    - score is clamped to 0..100.

    This deliberately keeps the scoring rule simple and deterministic so the
    UI can explain it and future market-data providers can reuse it.
    """
    if total_cost_rub < 0:
        raise ValueError("total_cost_rub must be non-negative")
    if reference_price_rub <= 0:
        raise ValueError("reference_price_rub must be positive")

    savings_rub = round(reference_price_rub - total_cost_rub, 2)
    savings_percent = round((savings_rub / reference_price_rub) * 100, 2)
    score = max(0, min(100, round(50 + savings_percent * 2)))

    if score >= 85:
        rating = DealRating.EXCELLENT
    elif score >= 70:
        rating = DealRating.GOOD
    elif score >= 50:
        rating = DealRating.FAIR
    elif score >= 35:
        rating = DealRating.WEAK
    else:
        rating = DealRating.BAD

    if savings_percent >= 5:
        market_position = MarketPosition.UNDER_MARKET
    elif savings_percent <= -5:
        market_position = MarketPosition.OVER_MARKET
    else:
        market_position = MarketPosition.AT_MARKET

    return DealAssessment(
        reference_price_rub=round(reference_price_rub, 2),
        savings_rub=savings_rub,
        savings_percent=savings_percent,
        score=score,
        rating=rating,
        market_position=market_position,
    )
