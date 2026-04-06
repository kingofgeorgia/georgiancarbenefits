"""
Сервис курсов валют с кэшированием в памяти.
Использует exchangerate.host (бесплатный, без API-ключа).
Fallback: fixer.io публичный endpoint.
"""

import asyncio
import time
from dataclasses import dataclass, field

import httpx

from app.core.config import settings


@dataclass
class _Cache:
    data: dict = field(default_factory=dict)
    fetched_at: float = 0.0


_cache = _Cache()
_lock = asyncio.Lock()


async def get_rates() -> dict[str, float]:
    """
    Возвращает словарь {currency_code: rate_to_rub}.
    Поддерживаемые коды: USD, EUR, GEL.
    """
    async with _lock:
        if _cache.data and (time.time() - _cache.fetched_at) < settings.exchange_cache_ttl_seconds:
            return _cache.data

        rates = await _fetch_rates()
        _cache.data = rates
        _cache.fetched_at = time.time()
        return rates


async def _fetch_rates() -> dict[str, float]:
    try:
        # exchangerate.host — base=RUB, get 1 RUB expressed in other currencies,
        # then invert to get X_to_RUB
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.exchangerate.host/latest",
                params={"base": "USD", "symbols": "RUB,EUR,GEL"},
            )
            resp.raise_for_status()
            data = resp.json()
            r = data["rates"]
            usd_to_rub = float(r["RUB"])
            eur_to_rub = usd_to_rub / float(r["EUR"])
            gel_to_rub = usd_to_rub / float(r["GEL"])
            return {"USD": usd_to_rub, "EUR": eur_to_rub, "GEL": gel_to_rub}
    except Exception:
        # Fallback: использовать приблизительные значения, если API недоступен
        return {"USD": 91.0, "EUR": 98.0, "GEL": 33.0}


async def get_usd_to_rub() -> float:
    return (await get_rates())["USD"]


async def get_eur_to_rub() -> float:
    return (await get_rates())["EUR"]


async def get_gel_to_rub() -> float:
    return (await get_rates())["GEL"]


async def get_usd_to_eur() -> float:
    rates = await get_rates()
    return rates["EUR"] / rates["USD"]
