from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from xml.etree import ElementTree

import httpx


@dataclass(frozen=True)
class CbrDailyRates:
    rates_to_rub: dict[str, float]
    effective_date: date


class CbrRateError(RuntimeError):
    pass


def parse_cbr_daily_xml(xml_text: str) -> CbrDailyRates:
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as exc:
        raise CbrRateError("CBR returned invalid XML") from exc

    raw_date = root.attrib.get("Date")
    if not raw_date:
        raise CbrRateError("CBR response does not contain an effective date")

    try:
        effective_date = datetime.strptime(raw_date, "%d.%m.%Y").date()
    except ValueError as exc:
        raise CbrRateError(f"Unexpected CBR date format: {raw_date}") from exc

    rates: dict[str, float] = {}
    for valute in root.findall("Valute"):
        code = (valute.findtext("CharCode") or "").strip().upper()
        nominal_text = (valute.findtext("Nominal") or "").strip()
        value_text = (valute.findtext("Value") or "").strip().replace(",", ".")
        if not code or not nominal_text or not value_text:
            continue
        try:
            nominal = float(nominal_text)
            value = float(value_text)
        except ValueError:
            continue
        if nominal <= 0:
            continue
        rates[code] = value / nominal

    required = {"USD", "EUR", "GEL"}
    missing = sorted(required.difference(rates))
    if missing:
        raise CbrRateError(f"CBR response is missing required currencies: {', '.join(missing)}")

    return CbrDailyRates(
        rates_to_rub={code: rates[code] for code in sorted(required)},
        effective_date=effective_date,
    )


async def fetch_cbr_daily_rates(
    api_url: str,
    *,
    requested_date: date | None = None,
    timeout_seconds: float = 10.0,
) -> CbrDailyRates:
    params = None
    if requested_date is not None:
        params = {"date_req": requested_date.strftime("%d/%m/%Y")}

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.get(api_url, params=params)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise CbrRateError("Failed to fetch official exchange rates from the Bank of Russia") from exc

    return parse_cbr_daily_xml(response.text)
