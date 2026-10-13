# EV calculation power

MileON treats electric-vehicle power as two different concepts:

1. **Reference/peak power** — manufacturer, marketplace or VIN-decoder output. This is useful for vehicle identification and display.
2. **Regulatory calculation power** — the maximum 30-minute traction power used by Russian recycling-fee and EV excise rules.

For calculations from 1 December 2025, the regulatory value should be taken from vehicle technical/registration documentation such as OTTS, SBKTS, ZOETS or EPTS. For vehicles with more than one traction motor, the relevant 30-minute motor powers are summed.

The public API field is `electric_power_kw`. It is intentionally separate from `horse_power`. VIN or marketplace integrations must not populate `electric_power_kw` from peak horsepower or generic motor kW unless the source explicitly represents the required 30-minute value.

The calculator result exposes:

- `power_kw_used` — the kW value actually used in power bands;
- `power_basis` — `MAX_30_MINUTE_ELECTRIC_POWER_KW` for EV/series-hybrid calculations or `HORSEPOWER_CONVERTED_TO_KW` for ICE/ordinary hybrids.

## Tesla example

A VIN can reliably identify a Tesla Model Y Performance while public specifications still disagree on peak-output conventions. That identification is useful, but it does not establish the Russian regulatory 30-minute value. The calculator therefore keeps the EV calculation incomplete until a suitable `electric_power_kw` value is supplied.

## Legal references

- Russian Government Resolution No. 1291 as amended by Resolution No. 1713 of 1 November 2025.
- Ministry of Finance / Federal Tax Service guidance on determining electric-vehicle excise power from maximum 30-minute traction power.
