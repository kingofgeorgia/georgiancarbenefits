# Own Modification Catalog

The calculator can use a local, reviewed specification catalog without a paid
vehicle-data subscription. The public catalog picker and source-reference panels
are currently hidden at the product owner's request. The data, API and strict
automatic enrichment remain available internally; no records were deleted.
This is a technical reference, not proof of the specification of a particular VIN
or a binding Russian tax assessment.

## Initial Coverage

`backend/app/data/vehicle_specs.json` contains 12 records, not a global database:

- Toyota Camry, US model year 2020: L/LE/SE/XLE/XSE 2.5 FWD and
  XLE/XSE/TRD 3.5 V6 FWD (8 records).
- Toyota RAV4 LE, US model year 2024: 2.5 FWD and AWD (2 records).
- Toyota RAV4 Hybrid LE, US model year 2024: system power, reference only.
- BMW M4 Competition Coupe M xDrive, EU specification published 05/2021.

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

Every row preserves the original power value/unit, source title/URL, verification
date, year interval, fuel, drivetrain and explicit market. Original SAE mechanical
hp is converted to metric PS using 745.6998715822702 / 735.49875, rounded to two
decimals; PS is retained and kW uses 1000 / 735.49875. No SAE-to-PS relabelling.
This conversion is scoped to the catalog; existing provider power behavior and
tariff rules are not rewritten by this change. Confirm final power with documents.

Exact displacement is populated only where independently supported by the source.
The Camry press release gives nominal litres, so `engine_cc` is intentionally
null, not invented as 2500/3500. The user must retain/enter documented displacement.
The RAV4 gas manual supports 2487 cc; BMW lists 2993 cc. Source documents are linked,
not copied into the repository or scraped as a complete third-party database.

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
regulatory electric power. The initial hybrid record is visibly reference-only;
it cannot complete a tax calculation by itself. No 30-minute values are invented.
The picker and reference panels described above are not mounted on the site.

`GET /cars/specifications` returns local records, with optional exact make/model
and year filters. It is protected by existing lookup quotas, performs no upstream
calls and has a validated maximum catalog size of 500. Sources are HTTPS links,
not server-side fetch targets. There is no public write endpoint or migration.

## Adding Records

Add a new stable ID through a branch/PR. Record the exact year/market/version,
source URL/title, date reviewed and original unit/basis. Do not extend a year
range beyond its documentary support. Leave unsupported exact cc null and do not
use system/peak power as engine-net or regulatory power. Review source terms
before bulk ingestion; do not copy a proprietary commercial database.

Run catalog validation and matching tests, the full backend suite, frontend
lint/typecheck/build and browser E2E. Tests reject duplicate IDs, invalid/future
verification dates, nonfinite power, bad source URLs, conflicting matches and
incomplete identities. Browser tests currently verify that the catalog is absent
in RU/EN/KA and that the page makes no catalog request. Budget results on both the
home tab and catalog route must not render source panels even if the API returns
a catalog reference. Backend tests retain unit
conversion, exact matching and hybrid safety coverage. External providers remain deterministic fixtures in E2E;
the catalog itself and API/calculation are real.
