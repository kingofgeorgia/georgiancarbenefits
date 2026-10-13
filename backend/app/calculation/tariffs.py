from __future__ import annotations

from functools import lru_cache
import json
from pathlib import Path
from typing import Any


_TARIFF_DIR = Path(__file__).resolve().parent.parent / "data" / "tariffs" / "ru"


class TariffDataError(RuntimeError):
    pass


def _load_json(name: str) -> dict[str, Any]:
    path = _TARIFF_DIR / name
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise TariffDataError(f"Failed to load tariff data: {path}") from exc

    required_metadata = {"version", "country", "effective_from", "effective_to", "updated_at"}
    missing = sorted(required_metadata.difference(data))
    if missing:
        raise TariffDataError(f"Tariff data {name} is missing metadata: {', '.join(missing)}")
    if data["country"] != "RU":
        raise TariffDataError(f"Unexpected tariff country in {name}: {data['country']}")
    return data


@lru_cache(maxsize=1)
def get_customs_2026() -> dict[str, Any]:
    return _load_json("customs_2026.json")


@lru_cache(maxsize=1)
def get_recycling_2026() -> dict[str, Any]:
    return _load_json("recycling_2026.json")


def get_calculation_rule_version() -> str:
    customs = get_customs_2026()["version"]
    recycling = get_recycling_2026()["version"]
    return f"{customs}+{recycling}"
