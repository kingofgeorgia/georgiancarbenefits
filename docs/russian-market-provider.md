# Russian Market Comparable Provider

MileON Import Calculator can automatically compare the calculated landed cost of a vehicle with comparable vehicles offered in Russia.

The implementation uses the official **Auto.ru Business Appraisal.API** rather than scraping public Auto.ru pages.

## Why the official API

Auto.ru's public-site terms restrict automated extraction/collection of site information without written permission. The official Auto.ru Business API provides a supported appraisal workflow designed for market valuation.

Official documentation:

- API overview: https://yandex.ru/support/autoru-business/ru/integrations/api
- Appraisal API: https://yandex.ru/support/autoru-business/ru/integrations/appraisal-api/servise-methods/get-appraisal
- Simplified comparable appraisal: https://yandex.ru/support/autoru-business/ru/integrations/appraisal-api/servise-methods/get-rating
- Appraisal service/catalog reference: https://www.yandex.ru/support/autoru-business/ru/integrations/appraisal-api/service-methods-old

## Activation

The provider is optional. Customs calculation continues to work when market comparison is not configured.

Auto.ru Business documents OAuth 2.0 authorization and instructs integrators to obtain authorization data via `help@business.auto.ru` and implement the appropriate token-acquisition mechanism. This project accepts the resulting valid Bearer token from the deployment environment:

```env
AUTO_RU_BUSINESS_TOKEN=<secret bearer token>
```

Token acquisition/rotation should be handled by deployment secret management until a dedicated OAuth credential flow is added. Do not commit credentials or a real token to Git.

Default provider settings:

```env
AUTO_RU_BUSINESS_API_URL=https://appraisal.api.cm.expert/v1
AUTO_RU_BUSINESS_SOURCES=auto_ru
AUTO_RU_BUSINESS_LIQUIDITY_REGION_ID=1960671
AUTO_RU_BUSINESS_TIMEOUT_SECONDS=10
AUTO_RU_MARKET_SIMILAR_THRESHOLD=10
AUTO_RU_MARKET_CACHE_TTL_SECONDS=3600
```

`AUTO_RU_BUSINESS_SOURCES=auto_ru` intentionally limits the comparison to Auto.ru listings instead of mixing additional marketplaces.

## Request flow

When a calculation has no manual Russia-market override and automatic comparison is enabled:

1. Resolve the myauto.ge make against `GET /autocatalog/brands`.
2. Resolve the model against `GET /autocatalog/models`.
3. Fetch supported Russian regions from `GET /regions`.
4. Call `GET /appraisal/similar/simple` with:
   - make/brand ID;
   - model ID;
   - model year;
   - optional mileage;
   - the Russia region set returned by the provider;
   - a liquidity region ID required for multi-region comparison;
   - `sources=auto_ru`;
   - configurable comparable threshold.
5. Normalize the response into the stable MileON market-comparison contract.
6. Use the selected reference price as input to the existing MileON Deal Score.

A manual `rf_analog_price_rub` always overrides automatic market data and is labeled `MANUAL` in the result.

## Reference-price policy

The provider uses the following priority:

1. `correctedAveragePriceMileage` when Auto.ru Business returns a mileage-adjusted average price.
2. Otherwise, the midpoint of the provider's `middle` price category.

The second value is explicitly called `market_midpoint_rub`; it is **not** presented as a statistical median.

Auto.ru Business Appraisal.API does not expose a statistical median in the documented comparable response, so MileON returns:

```json
"median_price_rub": null
```

rather than inventing or mislabeling a value.

The documented `low` and `high` values are market price-category boundaries, not claimed to be the literal cheapest and most expensive live listings.

## Response metadata

Automatic comparison can return:

- `reference_price_rub` and `reference_kind`;
- lower and upper market-category boundaries;
- mileage-adjusted average price when available;
- midpoint of the middle price band;
- number of similar listings;
- average mileage of comparable vehicles;
- parameters removed by the provider to expand the comparable set;
- source/provider;
- UTC check timestamp;
- explicit provider status/reason.

## Provider statuses

| Status | Meaning |
|---|---|
| `AVAILABLE` | A usable automatic market reference was returned. |
| `NOT_CONFIGURED` | The official API token is not configured. |
| `MISSING_VEHICLE_DATA` | Make/model is unavailable, normally because no myauto.ge vehicle was loaded. |
| `VEHICLE_NOT_FOUND` | Make/model could not be resolved in the provider catalog. |
| `INSUFFICIENT_DATA` | The provider could not build a sufficiently useful comparable set. |
| `AUTH_ERROR` | The official API rejected authorization. |
| `PROVIDER_ERROR` | Network/provider response failed for another reason. |

Market-data failure never invalidates the customs calculation. It only prevents automatic Deal Score generation unless the user supplies a manual reference price.

## Caching

Successful market comparisons are cached in-process using make, model, model year and mileage as the cache key. The default TTL is one hour. Failed responses are not cached so temporary provider issues can recover immediately.

## Trust and presentation

The UI always identifies the market source and check time. It also warns when Auto.ru Business reports that comparison parameters were removed to widen the sample, because that can reduce precision.

This market appraisal is a decision aid and is not a guaranteed transaction price.
