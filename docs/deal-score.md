# MileON Deal Score

`MileON Deal Score` is a transparent 0–100 comparison between the calculated landed cost of a vehicle and a Russia-market reference price.

## Inputs

- `total_cost_rub`: calculated import cost including vehicle, customs/recycling and logistics;
- `reference_price_rub`: average asking price of a comparable vehicle in Russia.

The current product uses the existing `rf_analog_price_rub` field as the reference price. It is entered manually by the user. Automatic Russian-market comparable collection is intentionally a separate future provider layer.

## Formula

```text
savings_rub = reference_price_rub - total_cost_rub
savings_percent = savings_rub / reference_price_rub * 100
score = clamp(round(50 + savings_percent * 2), 0, 100)
```

Interpretation:

- `50` = price parity with the Russia-market reference;
- every 1% cheaper adds 2 score points;
- every 1% more expensive removes 2 score points;
- score is always limited to `0..100`.

## Ratings

| Score | Rating | Meaning |
|---:|---|---|
| 85–100 | `EXCELLENT` | Strong value relative to the reference market |
| 70–84 | `GOOD` | Clearly attractive import economics |
| 55–69 | `FAIR` | Some economic advantage |
| 40–54 | `WEAK` | Around market parity / weak advantage |
| 0–39 | `BAD` | Import is materially more expensive |

## Market position

The score and market position are related but distinct:

- `UNDER_MARKET`: at least 5% cheaper than the reference;
- `AT_MARKET`: within ±5% of the reference;
- `OVER_MARKET`: at least 5% more expensive than the reference.

## API compatibility

The calculator keeps `savings_vs_rf_rub` for backwards compatibility and adds a structured `deal_assessment` object:

```json
{
  "deal_assessment": {
    "reference_price_rub": 5000000,
    "savings_rub": 500000,
    "savings_percent": 10,
    "score": 70,
    "rating": "GOOD",
    "market_position": "UNDER_MARKET"
  }
}
```

If no Russia-market reference price is provided, `deal_assessment` remains `null`.

## Product usage

The frontend shows the score, savings, market position and a MileON lead CTA. For a myauto.ge vehicle, the CTA pre-fills the selected vehicle, calculated total, score and source URL into the MileON contact message.
