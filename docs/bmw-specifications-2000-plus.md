# BMW reference dataset, 2000 onward

`backend/app/data/references/bmw-production-variants-2000-plus.csv` contains
1,590 BMW factory type-code records whose production interval intersects 2000
or later, with 189 distinct source model labels. Each row includes the BMW type
code, chassis, body, source engine label, production dates, market region,
variant power in kW and converted metric PS, and a source-record URL.

## Source and limits

The candidate rows were assembled from [BimmerArchive Open Data](https://github.com/alisacorporation/bimmerarchive-open-data),
a machine-readable mirror of the now-offline bimmerarchive.org, based on public
Internet Archive captures. This is an enthusiast reference, not an official BMW
dataset. Keep its attribution and source links with the file. Its own provenance
notes say that compilation/database rights are unresolved in some jurisdictions
and that the data may contain errors.

The source reports 4,339 production codes across BMW, MINI and Rolls-Royce;
this CSV filters to BMW only and to records with dates that overlap 2000 onward.
It is not a claim that every market, body, or production variant is covered.

## Displacement matching

Otoba's public BMW engine-family pages were collected for the 25 engine
families present in the staged records. The section-level extract is in
`backend/app/data/references/otoba-bmw-engine-sections.csv`; exact engine-code
matches are in `otoba-bmw-engine-variants.csv`. The main CSV keeps these
separate from the original BimmerArchive values:

- `engine_cc` is the BimmerArchive-based candidate and is present in 630 rows.
- `engine_cc_otoba` is present in 967 rows: 674 rows match an exact engine code
  in an Otoba section, and 293 have a unique engine-family/power match.
  Twenty further rows had more than one possible displacement and were left
  unmatched by that source.
- `engine_cc_consensus_candidate` is present in 1,254 rows. It keeps a value
  where the sources agree or only one source yielded a candidate. Its
  `engine_cc_source_status` distinguishes cross-source agreement, a single
  source candidate, a disagreement, and no match. Twenty-five rows have
  conflicting source values and deliberately have no consolidated candidate;
  for example, BMW 318i N42B20 is shown as 1,995 cc by BimmerArchive and 1,996
  cc by Otoba.
- `engine_cc_slug_candidate` is still retained for audit, not as a trusted
  displacement. For example, BimmerArchive's slug mapping associates BMW Z3
  2.2 with M54B30 (2,979 cc), while its model power and Otoba's M54 data point
  to M54B22 (2,171 cc).

These are reference candidates, not VIN-level verification. Every row remains
`REFERENCE_ONLY_UNVERIFIED` and none is loaded into the calculator's automatic
specification matching.

## Calculator selector

The calculator's BMW version dialog reads the 1,590 BimmerArchive rows,
six BMW PressClub records for the 2016 M6, and user-supplied catalog rows from
`backend/app/data/vehicle_catalog.json` under `bmw_variants`. The M6 supplement is also preserved
in `backend/app/data/references/bmw-official-2016-m6-variants.csv`. The dialog
filters by model and production year, then lets the user choose chassis,
engine code, displacement, power, and drive. Applying a row fills the year,
engine displacement, power, and powertrain type. The selected BMW model label
is saved with the calculation, which also allows correcting a generic or
incorrect model from a MyAuto listing.

The dialog marks entries that have not been confirmed as reference data. The
user-supplied rows are marked confirmed in the calculator catalog per the
owner's instruction; they are still selected manually and are not used for
automatic VIN-level matching. The 2016
M6 supplement gives the three body styles as 4,395 cc and 412 kW (560 PS), or
441 kW (600 PS) with the Competition Package. 336 BimmerArchive rows currently
have no consolidated displacement candidate. Auto-Data and Autoevolution data
were not bulk-added; see `Source and limits` above.

## Other supplied catalogs

Auto-Data's page-level catalogue was not bulk-copied. Its [site terms](https://www.auto-data.net/en/terms-of-use)
prohibit bulk extraction and automated collection without prior written
permission. Its [One-Call API](https://api.auto-data.net/get-a-quote/?source=auto-data-menu)
provides the desired variant, year, power, engine-code and displacement fields
for local storage under a suitable license. No data from it is included here.

Autoevolution's `robots.txt` disallows GPTBot access to the site, so its catalog
was not crawled for bulk extraction. The supplied links remain useful for
individual, attributed cross-checks. No Autoevolution records were added to the
CSV.

Before promoting rows into `vehicle_catalog.json`'s `vehicle_specifications` section, verify displacement and power
against a BMW technical document for the exact chassis, year, version, and
market. The current runtime catalog is limited to 500 records and requires
explicit US/EU market identity, so bulk integration needs a separate reviewed
catalog or a deliberate API/catalog redesign.

The upstream BimmerArchive dataset snapshot was generated 2026-09-18. Its
metadata records the Internet Archive capture IDs. The BimmerArchive and Otoba
source URLs are preserved in the CSV files for traceability. Otoba's
`robots.txt` allows general crawling; the engine-family pages were fetched
sequentially, not concurrently.

## User-Supplied Model Catalogs

The separate `backend/app/data/references/bmw_user_reference_catalog.json`
preserves all 727 rows from the 19 user-supplied model CSVs, together with
their original columns, source filename, source row, and Library file
identity. The rows are also available as manual choices in
`backend/app/data/vehicle_catalog.json`; selecting one fills calculator
inputs. They are not used for automatic vehicle matching. Per the owner's
instruction, the 727 user-supplied entries are treated as confirmed for
calculator use; the `verified` status field is not stored. Production ranges embedded in `Model/Trim` are parsed
into the picker’s year filter. The corrected `bmw_catalog.csv` adds
`Production_Years` for the 124 rows that previously lacked a range; those
periods now constrain the picker by year, with `present` treated as the
current year. The calculator catalog omits `market_region`, `source_title`,
`source_url`, `engine_source_url`, `engine_cc_status`, and `verified` as
requested. The
separate raw reference archive continues to preserve the original submitted
rows and their import provenance.
