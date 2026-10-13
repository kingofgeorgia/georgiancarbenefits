from __future__ import annotations

import asyncio
from dataclasses import dataclass, replace
from datetime import date, datetime, timezone

from app.core.config import settings
from app.integrations.cbr import CbrRateError, fetch_cbr_daily_rates


@dataclass(frozen=True)
class CurrencySnapshot:
    rates: dict[str, float]
    source: str
    effective_date: date
    fetched_at: datetime
    is_stale: bool = False


class CurrencyUnavailableError(RuntimeError):
    pass


_cache: CurrencySnapshot | None = None
_lock = asyncio.Lock()


def _cache_is_fresh(snapshot: CurrencySnapshot) -> bool:
    age_seconds = (datetime.now(timezone.utc) - snapshot.fetched_at).total_seconds()
    return age_seconds < settings.exchange_cache_ttl_seconds


async def get_rate_snapshot() -> CurrencySnapshot:
    """Return official CBR rates, using only a previously fetched snapshot as fallback."""
    global _cache

    async with _lock:
        if _cache is not None and _cache_is_fresh(_cache):
            return _cache

        try:
            cbr_rates = await fetch_cbr_daily_rates(settings.exchange_api_url)
            snapshot = CurrencySnapshot(
                rates=cbr_rates.rates_to_rub,
                source="CBR",
                effective_date=cbr_rates.effective_date,
                fetched_at=datetime.now(timezone.utc),
                is_stale=False,
            )
            _cache = snapshot
            return snapshot
        except CbrRateError as exc:
            if _cache is not None:
                return replace(_cache, is_stale=True)
            raise CurrencyUnavailableError(
                "Official Bank of Russia exchange rates are temporarily unavailable"
            ) from exc


async def get_rates() -> dict[str, float]:
    return (await get_rate_snapshot()).rates


async def get_usd_to_rub() -> float:
    return (await get_rate_snapshot()).rates["USD"]


async def get_eur_to_rub() -> float:
    return (await get_rate_snapshot()).rates["EUR"]


async def get_gel_to_rub() -> float:
    return (await get_rate_snapshot()).rates["GEL"]


async def get_usd_to_eur() -> float:
    snapshot = await get_rate_snapshot()
    return snapshot.rates["EUR"] / snapshot.rates["USD"]
