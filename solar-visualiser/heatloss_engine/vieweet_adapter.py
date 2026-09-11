"""Translate Vieweet measurement/geometry responses into the heat-loss model."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from typing import Any

from heatloss_engine import models
from heatloss_engine.calculator import PropertyData, PropertyValues, RoomValues, UValues
from heatloss_engine.enums import AirChangeRateCategory, ItemType, PLANUP_TYPES, RoomType, WallType
from heatloss_engine.gbr import temperatures
from heatloss_engine.vieweet_config import property_config, room_config


POSTCODE_PATTERN = re.compile(
    r"\b(?:GIR ?0AA|[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]? ?\d[ABD-HJLNP-UW-Z]{2})\b",
    re.IGNORECASE,
)


@dataclass
class AdapterResult:
    property_data: PropertyData
    postcode: str
    room_ids: dict[str, int]
    room_metadata: dict[str, dict[str, Any]]
    assumptions_by_room: dict[str, dict[str, Any]]
    vertical_assignments: dict[str, dict[str, Any]]
    warnings: list[str] = field(default_factory=list)


def extract_postcode(*values: str | None) -> str | None:
    for value in values:
        if value and (match := POSTCODE_PATTERN.search(value)):
            postcode = match.group(0).upper().replace(" ", "")
            return f"{postcode[:-3]} {postcode[-3:]}"
    return None


def _normalise(value: str) -> str:
    value = re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", value)
    value = re.sub(r"[^a-zA-Z0-9]+", "_", value).strip("_").lower()
    return re.sub(r"_\d+$", "", value)


ROOM_TYPE_ALIASES: dict[str, RoomType] = {
    "living": RoomType.LIVING_ROOM,
    "living_area": RoomType.LIVING_ROOM,
    "dining": RoomType.DINING,
    "kitchen_dining": RoomType.DINING,
    "kitchen_living": RoomType.LIVING_ROOM,
    "bathroom": RoomType.BATH,
    "bedroom": RoomType.BEDROOM,
    "corridor": RoomType.HALLWAY,
    "stairs": RoomType.HALL,
    "staircase": RoomType.HALL,
    "office": RoomType.STUDY,
    "other": RoomType.LIVING_ROOM,
}


def _room_type(raw_type: str | None, name: str, override: str | None) -> tuple[RoomType, bool]:
    if override:
        try:
            return RoomType[override.upper()], True
        except KeyError:
            normalised = _normalise(override)
            if normalised in PLANUP_TYPES:
                return PLANUP_TYPES[normalised], True
            raise ValueError(f"Unknown room_type override: {override}")

    for candidate in (raw_type or "", name):
        normalised = _normalise(candidate)
        if normalised in PLANUP_TYPES:
            return PLANUP_TYPES[normalised], True
        if normalised in ROOM_TYPE_ALIASES:
            return ROOM_TYPE_ALIASES[normalised], True
        for token, result in (
            ("bedroom", RoomType.BEDROOM),
            ("kitchen", RoomType.KITCHEN),
            ("bath", RoomType.BATH),
            ("shower", RoomType.SHOWER),
            ("toilet", RoomType.TOILET),
            ("wc", RoomType.TOILET),
            ("garage", RoomType.GARAGE),
            ("utility", RoomType.UTILITY),
            ("landing", RoomType.LANDING),
            ("hall", RoomType.HALL),
            ("lounge", RoomType.LOUNGE),
            ("living", RoomType.LIVING_ROOM),
            ("dining", RoomType.DINING),
            ("study", RoomType.STUDY),
            ("office", RoomType.STUDY),
            ("store", RoomType.STORE),
            ("cupboard", RoomType.STORE),
            ("eaves", RoomType.STORE),
            ("porch", RoomType.UNHEATED),
        ):
            if token in normalised:
                return result, True
    return RoomType.LIVING_ROOM, False


def _polygon_area_m2(points: list[list[float]]) -> float:
    if len(points) < 3:
        return 0.0
    twice_area = sum(
        points[index][0] * points[(index + 1) % len(points)][1]
        - points[(index + 1) % len(points)][0] * points[index][1]
        for index in range(len(points))
    )
    return abs(twice_area) / 2 / 10_000


def _wall_length_mm(wall: dict[str, Any]) -> int:
    points = wall.get("points") or []
    if len(points) < 2:
        return 0
    return int(round(math.dist(points[0][:2], points[-1][:2]) * 10))


def _wall_height_mm(wall: dict[str, Any], room: dict[str, Any], measurement: dict[str, Any]) -> int:
    heights = [wall.get("heightStart"), wall.get("heightEnd")]
    heights = [float(height) for height in heights if isinstance(height, int | float) and height > 0]
    if heights:
        return int(round(sum(heights) / len(heights) * 10))
    if room.get("ceilingHeight"):
        return int(round(float(room["ceilingHeight"]) * 10))
    return int(round(float(measurement.get("ceilingHeightM") or 2.4) * 1000))


def _segment_key(wall: dict[str, Any]) -> tuple[tuple[int, int], tuple[int, int]] | None:
    points = wall.get("points") or []
    if len(points) < 2:
        return None
    ends = (
        (round(float(points[0][0])), round(float(points[0][1]))),
        (round(float(points[-1][0])), round(float(points[-1][1]))),
    )
    return tuple(sorted(ends))  # type: ignore[return-value]


def _wall_adjacency(
    room_geometry: dict[str, dict[str, Any]], room_ids: dict[str, int]
) -> dict[tuple[str, str], int]:
    owners_by_wall_id: dict[str, set[str]] = {}
    owners_by_segment: dict[tuple[tuple[int, int], tuple[int, int]], set[str]] = {}
    for room_id, room in room_geometry.items():
        for wall in room.get("walls", []):
            wall_id = str(wall.get("id", ""))
            if wall_id:
                owners_by_wall_id.setdefault(wall_id, set()).add(room_id)
            if (segment := _segment_key(wall)) is not None:
                owners_by_segment.setdefault(segment, set()).add(room_id)

    adjacency: dict[tuple[str, str], int] = {}
    for room_id, room in room_geometry.items():
        for wall in room.get("walls", []):
            wall_id = str(wall.get("id", ""))
            candidates = set(owners_by_wall_id.get(wall_id, set()))
            if (segment := _segment_key(wall)) is not None:
                candidates.update(owners_by_segment.get(segment, set()))
            candidates.discard(room_id)
            if candidates:
                adjacent_raw = sorted(candidates)[0]
                if adjacent_raw in room_ids:
                    adjacency[(room_id, wall_id)] = room_ids[adjacent_raw]

        for door in room.get("doors", []):
            destination = str(door.get("roomDestinationId", ""))
            wall_id = str(door.get("wallId", ""))
            if destination in room_ids and wall_id:
                adjacency[(room_id, wall_id)] = room_ids[destination]
    return adjacency


def audit_vieweet(measurements: dict[str, Any], geometry: dict[str, Any]) -> dict[str, Any]:
    geometry_rooms = [
        room
        for floor in (geometry.get("floors") or [])
        for room in (floor.get("rooms") or [])
    ]
    measurement_rooms = measurements.get("roomMeasurements") or []
    measured_ids = {str(room.get("roomId")) for room in measurement_rooms}
    matched_rooms = sum(str(room.get("id")) in measured_ids for room in geometry_rooms)
    walls = [wall for room in geometry_rooms for wall in (room.get("walls") or [])]
    global_wall_ids = {str(wall.get("id")) for wall in walls if wall.get("id")}
    role_walls = sum(bool(wall.get("role")) for wall in walls)
    openings = [
        opening
        for room in geometry_rooms
        for key in ("doors", "windows")
        for opening in (room.get(key) or [])
    ]
    linked_openings = sum(
        (
            str(opening.get("wallId")) in global_wall_ids
            or str(opening.get("wallId") or "").startswith("roof:")
        )
        for room in geometry_rooms
        for key in ("doors", "windows")
        for opening in (room.get(key) or [])
    )
    measured_area = sum(float(room.get("areaM2") or 0) for room in measurement_rooms)
    overview = (measurements.get("propertySummary") or {}).get("propertyOverview") or {}
    total_areas = overview.get("totalAreas") or {}
    nia = float(total_areas.get("netInternalAreaM2") or 0)
    area_delta_pct = abs(measured_area - nia) / nia * 100 if nia else None
    relations = (measurements.get("floorRelations") or {}).get("verticalRelations") or []
    return {
        "geometry_room_count": len(geometry_rooms),
        "measurement_room_count": len(measurement_rooms),
        "room_match_coverage_pct": round(matched_rooms / len(geometry_rooms) * 100, 1) if geometry_rooms else 0,
        "wall_count": len(walls),
        "wall_role_coverage_pct": round(role_walls / len(walls) * 100, 1) if walls else 0,
        "opening_count": len(openings),
        "opening_wall_link_coverage_pct": round(linked_openings / len(openings) * 100, 1) if openings else 100,
        "measured_room_area_m2": round(measured_area, 2),
        "net_internal_area_m2": nia or None,
        "room_area_vs_nia_delta_pct": round(area_delta_pct, 1) if area_delta_pct is not None else None,
        "vertical_relation_count": len(relations),
        "floor_count": len(geometry.get("floors") or []),
    }


def adapt_vieweet_property(
    *,
    tour_code: str,
    csv_address: str,
    measurements: dict[str, Any],
    geometry: dict[str, Any],
    config: dict[str, Any],
) -> AdapterResult:
    warnings: list[str] = []
    prop_config = property_config(config, tour_code)
    measurement_by_room = {
        str(room.get("roomId")): room for room in (measurements.get("roomMeasurements") or [])
    }
    floors = geometry.get("floors") or []
    geometry_rooms = [room for floor in floors for room in (floor.get("rooms") or [])]
    if not geometry_rooms:
        raise ValueError(f"Vieweet returned no room geometry for {tour_code}")
    room_ids = {str(room.get("id")): index for index, room in enumerate(geometry_rooms, start=1)}
    room_geometry = {str(room.get("id")): room for room in geometry_rooms}
    room_levels = {
        str(room.get("id")): int(floor.get("level", 0))
        for floor in floors
        for room in (floor.get("rooms") or [])
    }
    adjacency = _wall_adjacency(room_geometry, room_ids)

    relation_by_room = {
        str(relation.get("roomId")): relation
        for relation in ((measurements.get("floorRelations") or {}).get("verticalRelations") or [])
    }
    roof_glazing_room_ids = {
        str(item.get("roomId"))
        for item in (measurements.get("roofGlazingMeasurements") or [])
        if item.get("roomId")
    }
    minimum_level = min((int(floor.get("level", 0)) for floor in floors), default=0)

    room_objects: dict[str, models.Room] = {}
    room_metadata: dict[str, dict[str, Any]] = {}
    assumptions_by_room: dict[str, dict[str, Any]] = {}
    unresolved_internal_walls = 0

    for raw_room_id, engine_room_id in room_ids.items():
        geometry_room = room_geometry[raw_room_id]
        measurement = measurement_by_room.get(raw_room_id, {})
        if not measurement:
            warnings.append(f"Room {raw_room_id} has geometry but no room measurement")
        name = str(measurement.get("roomName") or geometry_room.get("name") or raw_room_id)
        values = room_config(prop_config, raw_room_id)
        room_type, recognised_type = _room_type(
            measurement.get("roomType"), name, values.get("room_type")
        )
        if not recognised_type:
            warnings.append(f"Room {name} ({raw_room_id}) has an unknown type; using LIVING_ROOM")

        unheated_types = {str(value).upper() for value in values.get("unheated_room_types", [])}
        default_heated = room_type.name not in unheated_types
        heated = bool(values.get("heated", default_heated))
        habitable = bool(values.get("habitable", heated))
        included = bool(values.get("included", True))

        area_m2 = float(measurement.get("areaM2") or 0)
        if area_m2 <= 0:
            area_m2 = _polygon_area_m2(geometry_room.get("polygon", []))
        if area_m2 <= 0:
            area_m2 = 1.0
            warnings.append(f"Room {name} ({raw_room_id}) has no usable area; using 1.0 m²")

        relation = relation_by_room.get(raw_room_id, {})
        floor_sections: list[models.FloorSection] = []
        allocated_area = 0.0
        for below in relation.get("roomsBelow", []) or []:
            below_id = str(below.get("roomId"))
            if below_id not in room_ids:
                continue
            common_area = min(float(below.get("commonAreaM2") or 0), area_m2 - allocated_area)
            if common_area > 0:
                floor_sections.append(
                    models.FloorSection(adjacent_room_id=room_ids[below_id], area_=common_area * 1_000_000)
                )
                allocated_area += common_area
        if allocated_area < area_m2:
            floor_sections.append(
                models.FloorSection(adjacent_room_id=None, area_=(area_m2 - allocated_area) * 1_000_000)
            )
        has_exposed_floor_default = room_levels[raw_room_id] > minimum_level and allocated_area < area_m2

        wall_id_map: dict[str, int] = {}
        walls: list[models.Wall] = []
        for wall_index, wall in enumerate(geometry_room.get("walls", []), start=1):
            raw_wall_id = str(wall.get("id") or f"wall-{wall_index}")
            wall_id_map[raw_wall_id] = wall_index
            role = _normalise(str(wall.get("role") or ""))
            adjacent_id = adjacency.get((raw_room_id, raw_wall_id))
            wall_type: WallType | None = None
            if role == "party":
                wall_type = WallType.PARTY
                adjacent_id = None
            elif role in {"sheltered_wall", "sheltered"}:
                adjacent_id = None
            elif role == "internal" or (not role and not wall.get("exterior", False)):
                if adjacent_id is None:
                    adjacent_id = engine_room_id
                    unresolved_internal_walls += 1
            else:
                adjacent_id = None

            length_mm = _wall_length_mm(wall)
            if length_mm <= 0:
                continue
            wall_kwargs = {
                "id": wall_index,
                "adjacent_room_id": adjacent_id,
                "length": length_mm,
                "height": _wall_height_mm(wall, geometry_room, measurement),
            }
            if role in {"sheltered_wall", "sheltered"}:
                walls.append(models.ShelteredWall(**wall_kwargs))
            else:
                walls.append(
                    models.Wall.create(
                        **wall_kwargs,
                        wall_type=wall_type,
                    )
                )

        if not walls:
            synthetic_length = max(1000, int(round(math.sqrt(area_m2) * 1000)))
            height = int(round(float(measurement.get("ceilingHeightM") or 2.4) * 1000))
            walls.append(
                models.InternalWall(
                    id=1,
                    adjacent_room_id=engine_room_id,
                    length=synthetic_length,
                    height=height,
                )
            )
            warnings.append(f"Room {name} ({raw_room_id}) has no usable walls; added a zero-loss synthetic wall")

        wall_by_id = {wall.id: wall for wall in walls}
        items: list[models.Item] = []
        next_item_id = 1
        for item_type, source_key in ((ItemType.WINDOW, "windows"), (ItemType.DOOR, "doors")):
            for opening in (geometry_room.get(source_key) or []):
                raw_wall_id = str(opening.get("wallId") or "")
                if item_type == ItemType.WINDOW and raw_wall_id.startswith("roof:"):
                    if raw_room_id in roof_glazing_room_ids:
                        continue
                    opening_item_type = ItemType.SKYLIGHT
                else:
                    opening_item_type = item_type
                wall_id = wall_id_map.get(raw_wall_id)
                parent_wall = wall_by_id.get(wall_id) if wall_id is not None else None
                adjacent_id = parent_wall.adjacent_room_id if parent_wall else None
                if item_type == ItemType.DOOR:
                    destination = str(opening.get("roomDestinationId") or "")
                    adjacent_id = room_ids.get(destination, adjacent_id)
                width_mm = int(round(float(opening.get("width") or 0) * 10))
                height_mm = int(round(float(opening.get("height") or 0) * 10))
                if width_mm <= 0 or height_mm <= 0:
                    warnings.append(f"Ignored zero-sized {item_type.value} in {name} ({raw_room_id})")
                    continue
                items.append(
                    models.Item.create(
                        item_type=opening_item_type,
                        id=next_item_id,
                        height=height_mm,
                        width=width_mm,
                        adjacent_room_id=adjacent_id,
                        wall_id=wall_id,
                    )
                )
                next_item_id += 1

        room_objects[raw_room_id] = models.Room(
            id=engine_room_id,
            name=name,
            type=room_type,
            is_heated=heated,
            is_habitable=habitable,
            is_included=included,
            floor=floor_sections,
            walls=walls,
            items=items,
            radiators=[],
            ceiling=[],
        )
        room_metadata[raw_room_id] = {
            "engine_room_id": engine_room_id,
            "name": name,
            "floor_level": room_levels[raw_room_id],
            "area_m2": round(area_m2, 3),
            "vieweet_room_type": measurement.get("roomType"),
            "engine_room_type": room_type.name,
            "direct_url": measurement.get("directUrl"),
            "heated": heated,
            "habitable": habitable,
        }
        assumptions_by_room[raw_room_id] = {
            "u_values": values["u_values"],
            "has_solid_floor": bool(values.get("has_solid_floor", True)),
            "has_exposed_floor": bool(values.get("has_exposed_floor", has_exposed_floor_default)),
            "has_ufh": bool(values.get("has_ufh", False)),
            "air_change_category": str(values.get("air_change_category", "B")).upper(),
        }

    if unresolved_internal_walls:
        warnings.append(
            f"{unresolved_internal_walls} internal wall(s) had no resolvable neighbour and were treated as zero-loss"
        )

    rir_by_room = {
        str(item.get("roomId")): item
        for item in (
            measurements.get("roomInRoofHeatEngineer")
            or measurements.get("roomInRoof")
            or []
        )
    }
    for raw_room_id, room in room_objects.items():
        floor_area_m2 = sum(section.area_ for section in room.floor) / 1_000_000
        rir = rir_by_room.get(raw_room_id, {})
        target_ceiling_m2 = float(rir.get("roofAreaM2") or 0) or floor_area_m2
        relation = relation_by_room.get(raw_room_id, {})
        allocated_area = 0.0
        for above in relation.get("roomsAbove", []) or []:
            above_id = str(above.get("roomId"))
            if above_id not in room_ids:
                continue
            common_area = min(float(above.get("commonAreaM2") or 0), target_ceiling_m2 - allocated_area)
            if common_area > 0:
                room.ceiling.append(
                    models.CeilSection(adjacent_room_id=room_ids[above_id], area_=common_area * 1_000_000)
                )
                allocated_area += common_area
        if allocated_area < target_ceiling_m2:
            room.ceiling.append(
                models.CeilSection(adjacent_room_id=None, area_=(target_ceiling_m2 - allocated_area) * 1_000_000)
            )

    for roof_index, roof_window in enumerate(measurements.get("roofGlazingMeasurements") or [], start=1):
        raw_room_id = str(roof_window.get("roomId") or "")
        room = room_objects.get(raw_room_id)
        if room is None:
            warnings.append(f"Roof glazing {roof_index} has no matching room")
            continue
        width_mm = int(round(float(roof_window.get("widthM") or 0) * 1000))
        height_mm = int(round(float(roof_window.get("heightM") or 0) * 1000))
        if width_mm > 0 and height_mm > 0:
            room.items.append(
                models.Item.create(
                    item_type=ItemType.SKYLIGHT,
                    id=10_000 + roof_index,
                    height=height_mm,
                    width=width_mm,
                )
            )

    level_objects = [
        models.Level(
            id=int(floor.get("level", 0)),
            name=str(floor.get("name") or f"Floor {floor.get('level', 0)}"),
            rooms=[room_objects[str(room.get("id"))] for room in (floor.get("rooms") or [])],
        )
        for floor in floors
    ]

    summary_address = (measurements.get("propertySummary") or {}).get("propertyAddress")
    postcode = prop_config.get("postcode") or extract_postcode(csv_address, summary_address, geometry.get("address"))
    if postcode:
        climate = temperatures.get_area_temperature_for_postcode(str(postcode))
    else:
        climate = temperatures.get_fallback_area_temperature()
        postcode = climate.postcode
        warnings.append(f"No postcode found for {tour_code}; using climate fallback {postcode}")

    room_values = []
    for raw_room_id, room in room_objects.items():
        assumptions = assumptions_by_room[raw_room_id]
        u = assumptions["u_values"]
        room_values.append(
            RoomValues(
                room_id=str(room.id),
                u_values=UValues(
                    external_wall=float(u["external_wall"]),
                    internal_wall=float(u["internal_wall"]),
                    external_floor=float(u["external_floor"]),
                    intermediate_floor=float(u["intermediate_floor"]),
                    roof=float(u["roof"]),
                    window=float(u["window"]),
                    internal_door=float(u["internal_door"]),
                    external_door=float(u["external_door"]),
                ),
                has_exposed_floor=bool(assumptions["has_exposed_floor"]),
                has_solid_floor=bool(assumptions["has_solid_floor"]),
                has_ufh=bool(assumptions["has_ufh"]),
            )
        )

    category_name = str(prop_config.get("air_change_category", "B")).upper().removeprefix("CATEGORY_")
    try:
        air_category = AirChangeRateCategory[f"CATEGORY_{category_name}"]
    except KeyError as error:
        raise ValueError(f"Unknown air_change_category: {category_name}") from error

    property_data = PropertyData(
        property_plan=models.PropertyPlan(levels=level_objects),
        property_values=PropertyValues(
            air_change_rate_category=air_category,
            external_temperature=float(prop_config.get("external_temperature", climate.air_temperature)),
            ground_temperature=float(prop_config.get("ground_temperature", climate.ground_temperature)),
            degree_days=int(prop_config.get("degree_days", climate.degree_days)),
            room_values=tuple(room_values),
        ),
    )
    raw_room_id_by_engine_id = {engine_id: raw_id for raw_id, engine_id in room_ids.items()}
    vertical_assignments: dict[str, dict[str, Any]] = {}
    for raw_room_id, room in room_objects.items():
        level = room_levels[raw_room_id]
        floor_assignments = []
        for section in room.floor:
            adjacent_raw_id = raw_room_id_by_engine_id.get(section.adjacent_room_id)
            floor_assignments.append(
                {
                    "boundary": (
                        "adjacent_room"
                        if adjacent_raw_id
                        else "ground"
                        if level == minimum_level
                        else "exposed_floor"
                    ),
                    "adjacent_room_id": adjacent_raw_id,
                    "area_m2": round(section.area_ / 1_000_000, 3),
                }
            )
        ceiling_assignments = []
        for section in room.ceiling:
            adjacent_raw_id = raw_room_id_by_engine_id.get(section.adjacent_room_id)
            ceiling_assignments.append(
                {
                    "boundary": "adjacent_room" if adjacent_raw_id else "roof",
                    "adjacent_room_id": adjacent_raw_id,
                    "area_m2": round(section.area_ / 1_000_000, 3),
                }
            )
        vertical_assignments[raw_room_id] = {
            "floor_level": level,
            "floor": floor_assignments,
            "ceiling": ceiling_assignments,
        }
    return AdapterResult(
        property_data=property_data,
        postcode=str(postcode),
        room_ids=room_ids,
        room_metadata=room_metadata,
        assumptions_by_room=assumptions_by_room,
        vertical_assignments=vertical_assignments,
        warnings=warnings,
    )


def audit_vertical_assignments(assignments: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Summarise the exact floor/ceiling sections passed to the calculator."""
    if not assignments:
        return {
            "vertical_pair_count": 0,
            "vertical_pair_balance_pct": 100.0,
            "lower_level_roof_area_m2": 0.0,
            "upper_level_exposed_floor_area_m2": 0.0,
        }

    levels = [int(value["floor_level"]) for value in assignments.values()]
    minimum_level = min(levels)
    maximum_level = max(levels)
    ceiling_pairs: dict[tuple[str, str], float] = {}
    floor_pairs: dict[tuple[str, str], float] = {}
    lower_level_roof_area = 0.0
    upper_level_exposed_floor_area = 0.0

    for room_id, value in assignments.items():
        level = int(value["floor_level"])
        for section in value["ceiling"]:
            adjacent_id = section.get("adjacent_room_id")
            if adjacent_id:
                key = (room_id, str(adjacent_id))
                ceiling_pairs[key] = ceiling_pairs.get(key, 0.0) + float(section["area_m2"])
            elif level < maximum_level:
                lower_level_roof_area += float(section["area_m2"])
        for section in value["floor"]:
            adjacent_id = section.get("adjacent_room_id")
            if adjacent_id:
                key = (str(adjacent_id), room_id)
                floor_pairs[key] = floor_pairs.get(key, 0.0) + float(section["area_m2"])
            elif level > minimum_level:
                upper_level_exposed_floor_area += float(section["area_m2"])

    pair_keys = set(ceiling_pairs) | set(floor_pairs)
    balanced = sum(
        abs(ceiling_pairs.get(key, 0.0) - floor_pairs.get(key, 0.0)) <= 0.05
        for key in pair_keys
    )
    return {
        "vertical_pair_count": len(pair_keys),
        "vertical_pair_balance_pct": round(balanced / len(pair_keys) * 100, 1) if pair_keys else 100.0,
        "lower_level_roof_area_m2": round(lower_level_roof_area, 2),
        "upper_level_exposed_floor_area_m2": round(upper_level_exposed_floor_area, 2),
    }
