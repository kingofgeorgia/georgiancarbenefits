# VIN Decoder

MileON Import Calculator can prefill vehicle characteristics from a 17-character VIN using the public **NHTSA vPIC** API.

## Provider

Official NHTSA vPIC documentation:

- https://vpic.nhtsa.dot.gov/api/
- https://vpic.nhtsa.dot.gov/api/Home/Index/FAQ
- https://vpic.nhtsa.dot.gov/

The integration uses:

```text
GET /api/vehicles/DecodeVinValuesExtended/{VIN}?format=json
```

No API key or registration is required.

## MileON endpoint

```text
POST /cars/from-vin
```

Request:

```json
{
  "vin": "5YJ3E1EA0SF004091"
}
```

The response normalizes available NHTSA fields such as:

- make and model;
- model year;
- manufacturer;
- body / vehicle type;
- fuel type and electrification level;
- engine displacement and cylinder count;
- engine power when reported;
- drive type and transmission;
- manufacturing country/city;
- inferred MileON powertrain kind.

## Calculator behavior

Decoded values are used only when NHTSA actually provides them. The VIN workflow can prefill year, engine displacement, horsepower and powertrain type, while purchase price, mileage and any missing fields remain editable.

If a myauto.ge listing is also loaded, listing data keeps priority for the Russia-market comparison because it contains the concrete vehicle price, mileage and source URL. VIN make/model can still supply market-comparison identity when no myauto.ge listing is loaded.

## Limitations

vPIC is intended for vehicles from model year 1981 onward. NHTSA notes that data is strongest for vehicles intended for sale/import in the United States; vehicles not intended for the US market may return limited information.

NHTSA also describes vPIC as a public shared resource and applies automated traffic controls. MileON therefore uses it for interactive single-VIN decoding rather than bulk crawling.

VIN data is a convenience input, not authoritative customs evidence. Users should verify exact manufacture date, engine/power specifications and other customs-critical values against vehicle documents before relying on a final import calculation.
