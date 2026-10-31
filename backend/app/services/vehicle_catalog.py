"""Single source for vehicle makes, models, variants, and specifications."""

import json
from pathlib import Path
from typing import Any


_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "vehicle_catalog.json"
CATALOG: dict[str, Any] = json.loads(_DATA_FILE.read_text(encoding="utf-8"))


def get_catalog() -> dict[str, Any]:
    return CATALOG
