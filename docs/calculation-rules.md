# Calculation rules

This document describes the current deterministic calculation flow implemented in `backend/app/services/personal_import_customs.py`.

## Inputs

The engine accepts:

- vehicle price
- price currency → RUB rate
- EUR → RUB rate
- engine displacement in cc
- horsepower
- vehicle age in years
- personal-use flag
- powertrain kind (`ICE`, `OTHER_HYBRID`, `SERIES_HYBRID`, `EV`)

## Main flow

1. Convert vehicle price to RUB.
2. Convert customs value to EUR.
3. Determine age category: up to 3 years, 3–5 years, or over 5 years.
4. Determine the customs-processing fee from the customs-value band.
5. Calculate the unified customs duty using vehicle value and/or engine displacement depending on age category.
6. Convert horsepower to kW using `1 hp = 0.73549875 kW`.
7. Match the recycling coefficient by powertrain, engine range, power band and age.
8. Multiply the coefficient by the passenger-car recycling base rate.
9. Return customs fee + unified duty + recycling fee and diagnostic details.

## Important limitations

- Age is currently derived from model year by the API route, not an exact manufacture date. Boundary cases around 3 and 5 years therefore still need improvement.
- Tariff tables are currently encoded in Python and should be migrated to versioned data files.
- Regulatory values must be re-verified whenever legislation changes.
- The engine supports personal import by an individual only.

## Regression tests

`backend/tests/test_personal_import_customs.py` covers representative control cases and boundary conditions. These tests are intended to prevent accidental formula regressions; they are not a substitute for regulatory verification.
