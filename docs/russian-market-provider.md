# Russian Market Comparable Provider

MileON Import Calculator can compare the calculated landed cost of a vehicle with comparable vehicles offered in Russia.

The current provider is built around Drom's documented Search API endpoint:

```text
GET https://api.drom.ru/v1.2/bulls/search
```

The integration does **not** scrape public Drom pages and does not use reverse-engineered application credentials.

## Access policy

Drom publishes Search API documentation, but Drom's rules separately restrict automated extraction/use of the portal database without permission and govern database access through its licence terms.

For that reason the provider is disabled by default:

```env
DROM_API_ACCESS_CONFIRMED=false
```

Set it to `true` only after Drom has confirmed that the MileON use case may access the API/database automatically and supplied any required integration parameters.

Official references:

- Search API: https://www.drom.ru/commerce/dromsearch/
- Drom database/portal usage rules: https://www.drom.ru/about/reprint/
- Drom licence terms: https://www.drom.ru/commerce/license/

Customs calculation remains fully available while Drom market comparison is disabled or unavailable.

## Configuration

Default settings:

```env
DROM_API_URL=https://api.drom.ru/v1.2
DROM_API_ACCESS_CONFIRMED=false
DROM_API_AUTH_QUERY_JSON={}
DROM_VEHICLE_ID_MAP_JSON={}
DROM_MARKET_TIMEOUT_SECONDS=10
DROM_MARKET_PAGES=3
DROM_MARKET_MIN_SAMPLES=5
DROM_MARKET_TRIM_FRACTION=0.10
DROM_MARKET_MILEAGE_WINDOW_PERCENT=0.35
DROM_MARKET_MILEAGE_WINDOW_MIN_KM=30000
DROM_MARKET_CACHE_TTL_SECONDS=3600
```

`DROM_API_AUTH_QUERY_JSON` is reserved only for query parameters explicitly issued/required by Drom for an authorized integration. Never populate it from reverse-engineered mobile/web application secrets.

### Make/model ID mapping

The documented Drom search request uses numeric `firmId` and `modelId`. The public Search API documentation does not provide a documented make/model catalog resolver, so MileON does not scrape Drom to discover those IDs.

Until Drom provides a supported catalog endpoint or a catalog export, authorized IDs are configured explicitly:

```env
DROM_VEHICLE_ID_MAP_JSON={"Tesla":{"firmId":123,"models":{"Model Y":456,"Model 3":457}}}
```

or:

```env
DROM_VEHICLE_ID_MAP_JSON={"Tesla|Model Y":{"firmId":123,"modelId":456}}
```

The numbers above are examples only. Production must use IDs confirmed for the authorized Drom integration.

## Search flow

When the user enables automatic Russia-market comparison and has not supplied a manual reference price:

1. MileON receives make/model/year and optional mileage from MyAuto or VIN data.
2. Make/model are resolved through the configured Drom `firmId`/`modelId` map.
3. MileON searches Drom for the exact model year.
4. The search excludes damaged cars and listings without documents and requests unsold/current listings.
5. When mileage is known, MileON narrows the sample around that mileage using a configurable window.
6. Up to `DROM_MARKET_PAGES` result pages are collected.
7. Duplicate listing IDs are removed.
8. Listings without a usable price are ignored.
9. If enough listings remain, configurable lower/upper price tails are trimmed to reduce the impact of obvious outliers.
10. MileON calculates minimum, statistical median, arithmetic average, maximum and average mileage.
11. The statistical **median listing price** becomes the Deal Score reference price.

If the mileage-filtered sample is too small, the provider automatically retries the same make/model/year without the mileage filter. The response records `mileage` in `removed_params`, so the UI can warn that the comparison was widened.

A manual `rf_analog_price_rub` always overrides automatic market data and is labelled `MANUAL`.

## Reference-price policy

For new Drom comparisons:

```json
{
  "reference_kind": "MEDIAN_LISTING_PRICE",
  "reference_price_rub": 5250000,
  "median_price_rub": 5250000
}
```

The median is preferred for Deal Score because it is less sensitive than a simple average to unusually cheap or expensive listings. MileON still returns the average and market boundaries for transparency.

Legacy `MILEAGE_ADJUSTED_AVERAGE` and `MIDDLE_BAND_MIDPOINT` enum values remain supported so Deal Page snapshots created under the previous Auto.ru Business provider stay readable.

## Response metadata

An available Drom comparison can return:

- market reference price and reference kind;
- minimum listing price;
- statistical median listing price;
- arithmetic average listing price;
- maximum listing price;
- number of usable comparable listings after de-duplication/outlier trimming;
- average mileage when listings provide mileage;
- filters removed to expand the sample;
- source/provider;
- UTC check timestamp;
- explicit provider status/reason.

## Provider statuses

| Status | Meaning |
|---|---|
| `AVAILABLE` | A usable Drom comparable set was returned. |
| `NOT_CONFIGURED` | Authorized Drom access has not been enabled. |
| `MISSING_VEHICLE_DATA` | Make/model is unavailable. |
| `VEHICLE_NOT_FOUND` | No configured Drom `firmId`/`modelId` mapping exists for the vehicle, or the authorized endpoint reports it missing. |
| `INSUFFICIENT_DATA` | Too few usable listings remain for a reliable comparison. |
| `AUTH_ERROR` | Drom rejected the authorized request. |
| `PROVIDER_ERROR` | Network, response-contract or configuration parsing failed. |

Market-data failure never invalidates the customs calculation. It only prevents automatic Deal Score generation unless the user supplies a manual Russia-market reference price.

## Caching

Successful comparisons are cached in-process by make, model, model year and mileage. The default TTL is one hour. Failed responses are not cached so temporary provider/configuration problems can recover immediately.

This is currently per-process memory caching. A future multi-worker deployment can move this to Redis or another shared cache.

## Production activation checklist

Before enabling Drom comparison in production:

1. Obtain written/contractual confirmation that this automated API/database use is permitted.
2. Obtain any required authorized Drom request parameters.
3. Obtain/confirm the actual `firmId` and `modelId` catalog values, or a supported catalog resolver.
4. Verify the authorized Search API response schema against the MileON adapter.
5. Populate server-side environment variables only; do not expose integration credentials to the browser.
6. Set `DROM_API_ACCESS_CONFIRMED=true` only after the previous steps pass.
7. Test several high-volume and low-volume models before relying on Deal Score in production.

The market comparison is a decision aid, not a guaranteed transaction price.
