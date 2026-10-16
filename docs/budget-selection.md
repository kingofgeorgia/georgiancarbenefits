# Budget Selection

The home page and `/[locale]/catalog` provide independent budget selection using
MyAuto listings. This flow never calls Drom or performs a market comparison.

## Budget Modes

- `GEORGIA_PURCHASE`: filter the listing purchase price only. Russian import,
  delivery and registration are excluded. A USD budget does not require CBR.
- `RUSSIA_TOTAL`: purchase plus existing personal M1 import calculation,
  recycling fee, explicitly entered logistics and registration/other costs.
  Registration is required even when the user deliberately chooses zero; no
  universal registration or transport quote is invented.

The registration-cost input and result breakdown are labelled "Broker, documents
and registration". This is the user's quoted sum, not an automatically calculated
statutory charge. The input explicitly excludes delivery, customs payments and
the recycling fee, which are separate components. This wording does not assert
that every named service is required or set a standard price.

Both modes support USD, RUB and GEL. Converted searches use one CBR snapshot per
request and return its date/source/staleness. Costs are rounded upward to cents
for budget eligibility. Tariff rules themselves are unchanged.

Year-only Russian estimates calculate both ends of the possible manufacture
date interval and use the higher total. Current rules change at the 3/5-year
boundaries, so an unknown month cannot silently select a cheaper age band.
The response includes the lower total and rule version for transparency.

EV/series-hybrid regulatory power is never inferred from peak/listing horsepower.
Missing regulatory power, engine data, horsepower or mileage required by a
filter puts a listing in `needs_details`, with no within-budget claim or balance.
Invalid/non-finite/zero prices, duplicate IDs and explicitly flagged rental,
sold/deleted/auction rows are excluded. Explicit non-passenger vehicle types and
locations outside the source's Georgia parent group are excluded. The provider's
`price_usd` takes precedence over its original-currency `price`. Model-year and price constraints are
checked locally as well as sent upstream; make filtering uses the source ID.

## API And Limits

`POST /cars/budget` accepts finite bounded input, optional make/year/mileage
filters and a page in 1..100. Each request fetches at most one MyAuto page and
evaluates at most 100 rows. It shares the protected lookup quota; no unbounded
background crawl or per-listing detail fan-out is introduced. Provider search,
including its directory enrichment, has a total 25-second deadline.

Results describe checked listings, not a guarantee of exhaustively searching
the entire market or confirming condition, availability or physical location.
The provider's public listing data still requires vehicle/seller verification.
Provider errors return 503 `MYAUTO_UNAVAILABLE`, not an empty success. CBR
failures return 503 `RATES_UNAVAILABLE`. Existing catalog callers retain their
previous error behavior. Provider redirects remain disabled.

The client only searches on submission. Changing scope, currency or filters
invalidates old results; scope/currency changes clear the amount to avoid
reinterpreting a USD purchase budget as a RUB import budget. Requests support
cancellation, pagination and sorting. Home tabs preserve entered calculator and
budget state. Financial estimates and entered costs are not binding quotes.

## Verification

Backend tests cover both modes, currency conversion, exact budget boundaries,
registration/logistics, age bands, missing EV power, input safety, provider
failure and a forbidden Drom stub. Browser E2E adds both modes, mode changes,
pagination, recovery, tab-state preservation and RU/EN/KA mobile layouts.
External providers use deterministic E2E fixtures; no live-provider availability
is implied by a passing CI run. The larger E2E suite uses a higher per-minute
lookup and overall allowances only in CI; production limits are unchanged.
