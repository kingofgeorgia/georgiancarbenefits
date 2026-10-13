# Russian Market Comparable Provider

MileON Import Calculator can automatically compare the calculated landed cost of a vehicle with comparable vehicles offered in Russia.

The implementation uses the official **Auto.ru Business Appraisal.API** rather than scraping public Auto.ru pages.

## Why the official API

Auto.ru's public-site terms restrict automated extraction/collection of site information without written permission. The official Auto.ru Business API provides a supported appraisal workflow designed for market valuation.

Official documentation:

- API overview: https://yandex.ru/support/autoru-business/ru/api/start
- Appraisal API: https://yandex.ru/support/autoru-business/ru/api/price-appraisal
- Simplified comparable appraisal: https://yandex.ru/support/autoru-business/ru/api/price-appraisal-simplified
- Vehicle catalog endpoints: https://yandex.ru/support/autoru-business/ru/api/autocatalog

## Activation

The provider is optional. Customs calculation continues to work when market comparison is not configured.

Request authorized Auto.ru Business API access through the official Auto.ru Business process/support, then set the issued credential only in the deployment environment or secret store:

```env
AUTO_RU_BUSINESS_TOKEN=<secret token>
```

Do not commit a real token to Git.

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
   - all returned Russia region IDs;
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

## Response metadata

Automatic comparison can return:

- `reference_price_rub` and `reference_kind`;
- lower and upper market boundaries;
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

This market data is an asking-price appraisal and should be treated as a decision aid, not a guaranteed transaction price.
