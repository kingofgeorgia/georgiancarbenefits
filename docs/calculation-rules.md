# Calculation rules

The canonical deterministic engine is `backend/app/services/personal_import_customs.py`. Mutable 2026 tariff values live under `backend/app/data/tariffs/ru/` and are loaded by `backend/app/calculation/tariffs.py`.

## Inputs

The engine accepts vehicle price, currency-to-RUB rate, EUR-to-RUB rate, displacement, horsepower, age, personal-use flag and powertrain kind (`ICE`, `OTHER_HYBRID`, `SERIES_HYBRID`, `EV`). The API additionally accepts an optional exact `manufacture_date`.

## Vehicle age

`backend/app/calculation/age.py` calculates fractional age from the exact manufacture date when it is known. If only model year is available, January 1 of that year is used as a conservative estimate and the API returns `age_is_estimated=true`. This is important around the 3-year and 5-year customs boundaries.

## Exchange rates

The primary source is the official Bank of Russia XML daily-rates endpoint. The API returns the source, effective date, fetch timestamp and `is_stale` flag. There is no hard-coded exchange-rate fallback. If the source is temporarily unavailable, only a previously fetched successful snapshot may be used and it is marked stale; without a snapshot the API returns an explicit service error.

## ICE and non-series hybrids

1. Convert price to RUB and EUR using the official rate snapshot.
2. Determine the customs-processing fee from the 2026 customs-value band.
3. Apply the EAEU personal-use unified rate: value/cc minimum for cars up to 3 years, and cc-specific rates for 3–5 and >5 years.
4. Convert horsepower to kW using `1 hp = 0.73549875 kW`.
5. Match the 2026 personal-use recycling coefficient by displacement, power, age and powertrain.
6. Add customs fee + unified rate + recycling fee.

## Pure EV

Pure EVs do not use the normal EUR/cc unified-rate path. They are calculated as an aggregate customs payment for personal-use goods. The 2026 implementation separates:

- import duty;
- excise by horsepower;
- VAT on customs value + import duty + excise;
- customs-processing fee;
- recycling fee using the EV/series-hybrid power table.

The API exposes `customs_payment_kind=AGGREGATE_PAYMENT` and returns import duty, excise and VAT separately.

## Series hybrid

For recycling-fee purposes, series hybrids use the EV/series-hybrid power table. For customs-duty purposes they are not treated as pure EVs and require a positive combustion-engine displacement.

## Versioning

The result includes `calculation_rule_version`, composed from the active customs and recycling data versions. 2026 data currently live in:

- `backend/app/data/tariffs/ru/customs_2026.json`
- `backend/app/data/tariffs/ru/recycling_2026.json`

Future tariff years should add new data files instead of rewriting calculation algorithms.

## Regression tests

`backend/tests/test_personal_import_customs.py` and `backend/tests/test_calculation_v2.py` cover representative formulas, exact age boundaries, CBR XML parsing, corrected 2026 recycling coefficients and pure-EV aggregate payment behavior. Tests protect against code regressions but do not replace regulatory review when legislation changes.
