"""Configuration and override resolution for the Vieweet adapter."""

from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml


DEFAULT_CONFIG: dict[str, Any] = {
    "defaults": {
        "air_change_category": "B",
        "has_solid_floor": True,
        "has_ufh": False,
        "unheated_room_types": ["GARAGE", "STORE", "UNHEATED"],
        "u_values": {
            "external_wall": 1.60,
            "internal_wall": 1.92,
            "external_floor": 1.05,
            "intermediate_floor": 1.75,
            "roof": 0.40,
            "window": 2.80,
            "internal_door": 1.72,
            "external_door": 4.00,
        },
    },
    "properties": {},
}


def _merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(base)
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = _merge(result[key], value)
        else:
            result[key] = deepcopy(value)
    return result


def load_config(path: Path | None = None) -> dict[str, Any]:
    """Load YAML configuration over the built-in conservative defaults."""
    if path is None:
        return deepcopy(DEFAULT_CONFIG)
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {path}")
    loaded = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(loaded, dict):
        raise ValueError("The configuration root must be a mapping")
    return _merge(DEFAULT_CONFIG, loaded)


def property_config(config: dict[str, Any], tour_code: str) -> dict[str, Any]:
    defaults = config.get("defaults") or {}
    properties = config.get("properties") or {}
    if not isinstance(defaults, dict):
        raise ValueError("Configuration defaults must be a mapping")
    if not isinstance(properties, dict):
        raise ValueError("Configuration properties must be a mapping")
    override = properties.get(tour_code) or {}
    if not isinstance(override, dict):
        raise ValueError(f"Property override for {tour_code} must be a mapping")
    return _merge(defaults, override)


def room_config(property_values: dict[str, Any], room_id: str) -> dict[str, Any]:
    room_overrides = property_values.get("rooms") or {}
    if not isinstance(room_overrides, dict):
        raise ValueError("Property rooms must be a mapping")
    override = room_overrides.get(room_id) or {}
    if not isinstance(override, dict):
        raise ValueError(f"Room override for {room_id} must be a mapping")
    base = {key: value for key, value in property_values.items() if key != "rooms"}
    return _merge(base, override)
