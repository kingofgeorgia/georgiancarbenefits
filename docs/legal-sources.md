# Legal and data sources

This project is an estimation tool, not a customs declaration system. Regulatory data must be reviewed whenever legislation changes.

## Exchange rates

- Bank of Russia XML daily exchange rates: https://www.cbr.ru/scripts/XML_daily.asp
- Bank of Russia XML interface documentation: https://cbr.ru/development/SXML/

The calculator uses CBR rates and exposes the effective date in every result.

## Personal-use customs rules

- Decision of the Council of the Eurasian Economic Commission No. 107 of 20 December 2017, Appendix 2, Table 2: https://www.alta.ru/tamdoc/17sr0107/
- 2026 Russian customs-processing fee bands: Government Resolution No. 1638 of 23 October 2025 (amending the customs-fee schedule): https://www.alta.ru/tamdoc/25ps1638/

For ICE passenger cars imported for personal use, the engine uses the unified rates in Decision No. 107. Pure electric vehicles are treated separately as goods subject to an aggregate customs payment rather than the ordinary EUR/cc unified-rate path.

## Pure electric vehicles

- EEC Decision No. 107, Appendix 2, Table 2, item 4: pure EV passenger vehicles under heading 8703 80 are subject to aggregate customs payment.
- EAEU import-duty schedule for relevant 8703 80 positions: 15%: https://www.alta.ru/tamdoc/25kr0081/
- Russian Ministry of Finance letter No. 03-07-08/34068 of 12 April 2024 confirms VAT is included in aggregate customs payment for personal EV import: https://www.alta.ru/tamdoc/24a34068/
- Federal Tax Service 2026 changes: standard VAT rate is 22% from 1 January 2026: https://www.nalog.gov.ru/new2026/
- Russian Tax Code Article 193 contains 2026 passenger-car excise rates by horsepower: https://www.consultant.ru/document/cons_doc_LAW_28165/22201a65e4f59a582714243c15b655989bd57066/

## Recycling fee

- Government Resolution No. 1291 of 26 December 2013, as amended by Resolution No. 1713 of 1 November 2025: https://www.alta.ru/tamdoc/25ps1713/

The 2026 data set accounts for displacement, power, age and powertrain. It also keeps the preferential personal-use coefficients where the regulation provides them.

## Verification policy

Before changing a tariff data file:

1. verify the effective date;
2. compare the legal act with at least one established customs reference source such as Alta or TKS when possible;
3. update the tariff data `version`, source metadata and `updated_at`;
4. add or update regression tests for the affected boundary;
5. record the change in `CHANGELOG.md`.
