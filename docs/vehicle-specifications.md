# Own Modification Catalog

The calculator and vehicle catalog browser use local vehicle data without a paid
vehicle-data subscription. This is a technical reference, not proof of the
specification of a particular VIN or a binding Russian tax assessment.

## Initial Coverage

`backend/app/data/vehicle_catalog.json` is the single source for the application's
vehicle data. It has a versioned envelope and typed sections for make/model rows,
BMW variants, Tesla power references and exact vehicle specifications. The initial
specification section contains 27 records, not a global database:

- Toyota Camry, US model year 2020: L/LE/SE/XLE/XSE 2.5 FWD and
  XLE/XSE/TRD 3.5 V6 FWD (8 records).
- Toyota RAV4 LE, US model year 2024: 2.5 FWD and AWD (2 records).
- Toyota RAV4 Hybrid LE, US model year 2024: system power, reference only.
- BMW M4 Competition Coupe M xDrive, EU specification published 05/2021.
- BMW US model-year 2016: M6 standard and Competition Package, each covering
  Coupé, Convertible and Gran Coupé body styles (2 powertrain records). Exact
  displacement is null for the standard row because its cited US source gives
  nominal 4.4 L only; this prevents automatic matching. The Competition Package
  source explicitly supports 4,395 cc and 600 SAE hp.
- BMW US model-year 2024: X1 M35i, X2 xDrive28i/M35i, 5 Series 530i/540i,
  X5/X6 40i and M60i, and X5 M/X6 M Competition (13 records). The X1 M35i source
  supports nominal 2.0 L but not exact cc, so its exact displacement remains null.

The former four broad, unsourced records are replaced, not silently retained as
fallbacks. In particular, the previous 530 hp value spanning 2021-2026 M4s is not
reused. Records are deliberately not extrapolated to adjacent years/markets.

## Sources And Units

Power, versions and markets were checked against the following primary sources:

- [Toyota USA 2020 Camry](https://pressroom.toyota.com/toyota-camry-leads-midsize-sedan-segment-while-revving-it-up-with-first-ever-trd-model/).
- [Toyota USA 2024 RAV4 brochure](https://www.toyota.com/content/dam/toyota/brochures/pdf/2024/rav4_ebrochure.pdf),
  gas LE features on page 9 and hybrid combined power on page 3.
- [Toyota USA RAV4 2024 owner manual, engine specifications](https://www.toyota.com/owners/warranty-owners-manuals/digital/article/rav4/2024/om42f42u/ch08se010401/).
- [BMW specifications 05/2021](https://www.press.bmwgroup.com/global/article/attachment/T0329893EN/477740), pages 1-2.
- [BMW USA 2016 6 Series and M6](https://www.press.bmwgroup.com/usa/article/detail/T0198105EN_US/the-new-bmw-6-series:-three-body-styles-rejuvenated-and-ready-to-take-on-the-competition).
- [BMW USA 2016 M6 Competition Edition and Competition Package](https://www.press.bmwgroup.com/usa/article/detail/T0234222EN_US/bmw-m6-coupe-competition-edition).
- [BMW USA 2024 X1 M35i](https://www.press.bmwgroup.com/usa/article/detail/T0422247EN_US/the-bmw-x1-m35i-xdrive).
- [BMW USA 2024 X2](https://www.press.bmwgroup.com/usa/article/detail/T0437576EN_US/the-all-new-2024-bmw-x2).
- [BMW USA 2024 5 Series](https://www.press.bmwgroup.com/usa/article/detail/T0418778EN_US/the-all-new-2024-bmw-5-series) and [BMW engine specifications](https://www.press.bmwgroup.com/global/article/attachment/T0416261EN/587400).
- [BMW USA 2024 X5 and X6](https://www.press.bmwgroup.com/usa/article/detail/T0408460EN_US/the-2024-bmw-x5-and-x6).
- [BMW USA 2024 X5 M and X6 M Competition](https://www.press.bmwgroup.com/usa/article/detail/T0409477EN_US/the-2024-bmw-x5-m-competition-and-x6-m-competition/).

Every row preserves the original power value/unit, source title/URL, verification
date, year interval, fuel, drivetrain and explicit market. Original SAE mechanical
hp is converted to metric PS using 745.6998715822702 / 735.49875, rounded to two
decimals; PS is retained and kW uses 1000 / 735.49875. No SAE-to-PS relabelling.
This conversion is scoped to the catalog; existing provider power behavior and
tariff rules are not rewritten by this change. Confirm final power with documents.

Exact displacement is populated only where independently supported by the source.
The Camry press release gives nominal litres, so `engine_cc` is intentionally
null, not invented as 2500/3500. The user must retain/enter documented displacement.
The RAV4 gas manual supports 2487 cc; BMW sources list exact displacements for the
catalogued variants except the X1 M35i, where only nominal 2.0 L is stated. Source
documents are linked, not copied into the repository or scraped as a complete
third-party database.

## Matching And UI Safety

Automatic enrichment requires exactly one ICE entry matching make, exact model,
year, documented exact cc, explicit market, combustion fuel, drive and a bounded
modification alias. Missing identity, rounded displacement, substring-only model
matches, ambiguous entries and unknown market produce no inferred power.
MyAuto market is never inferred from a production country or a numeric model ID.
vPIC uses the US-market catalog only and must identify an ICE powertrain.
Existing nonempty provider horsepower is not overwritten.

The retained picker implementation allows choosing a reference even when automatic matching is not
possible. Applying a different make/model/year clears the old listing/VIN, price,
mileage and photo. Choosing a record with unknown exact cc cannot keep a
contradictory engine size. Applying a modification or editing catalog-populated
power/identity fields invalidates prior results. Other manual edits retain the
existing immutable Share Deal snapshot until recalculation, as before.
Manual horsepower edits remove the active source attribution; year/powertrain
edits invalidate the selected catalog identity. Reset also clears catalog controls.

System/peak hybrid and EV power never fills calculator engine horsepower or
regulatory electric power. The initial hybrid record is reference-only; it cannot
complete a tax calculation by itself. No 30-minute values are invented.

`GET /cars/catalog` returns the local consolidated catalog and performs no
upstream calls. `GET /cars/specifications` continues to return the validated
specification section, with optional make/model and year filters. Sources are
HTTPS links, not server-side fetch targets. There is no public write endpoint or
migration. The former source files under `frontend/public/data/` and
`backend/app/data/vehicle_specs.json` are retained as inactive copies;
application code now reads through the consolidated API.

## Adding Records

Add a new stable ID through a branch/PR. Record the exact year/market/version,
source URL/title, date reviewed and original unit/basis. Do not extend a year
range beyond its documentary support. Leave unsupported exact cc null and do not
use system/peak power as engine-net or regulatory power. Review source terms
before bulk ingestion; do not copy a proprietary commercial database.

The specification schema rejects duplicate IDs, invalid/future verification
dates, nonfinite power and bad source URLs. Exact matching also requires one
unambiguous record. External providers remain separate from the local catalog.
