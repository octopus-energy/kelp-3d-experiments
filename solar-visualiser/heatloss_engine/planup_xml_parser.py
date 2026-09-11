"""
PlanUp XML Parser

Parses PlanUp property plan XML documents into a PropertyPlan which can be passed
to HeatLossCalculator.
"""

from typing import cast
from xml.etree import ElementTree

from heatloss_engine import exceptions
from heatloss_engine.enums import ItemType, RadiatorPanel, WallType
from heatloss_engine.models import (
    CeilSection,
    DoorItem,
    FloorSection,
    Item,
    Level,
    PropertyPlan,
    Radiator,
    Room,
    Wall,
    WallEPCArea,
)
from heatloss_engine.enums import RoomType


class MissingRequiredAttribute(exceptions.PropertyPlanError):
    def __init__(self, attribute: str, element: ElementTree.Element) -> None:
        self.attribute = attribute
        self.element = element

    def __str__(self) -> str:
        return f"Missing required attribute {self.attribute} from node: {self.element.tag}"


class MissingExpectedRoomTypeInfo(exceptions.PropertyPlanError):
    def __init__(self, room_name: str) -> None:
        self.room_name = room_name

    def __str__(self) -> str:
        detail = "Please make sure room title is selected for all rooms"
        if self.room_name:
            detail = (
                f"Please ensure room title for '{self.room_name}' is selected "
                f"from the available options before editing"
            )
        return f"Missing expected room type information. {detail}"


def _extract_node_text(
    element: ElementTree.Element,
    node: str,
    default: str | None = None,
    error: str | None = None,
) -> str:
    node_ = element.find(node)
    if node_ is None or not node_.text:
        if default is not None:
            return default
        if not error:
            error = f"{node} missing from element: {element}"
        raise exceptions.PropertyPlanError(error)
    return node_.text


def _parse_room_radiators(room_element: ElementTree.Element) -> list[Radiator]:
    radiators = room_element.findall("./ROOMEPC/RADIATORS/RADIATOR")
    items = room_element.findall("./ITEMS/ITEM")
    item_lookup = {rad_id: item for item in items if (rad_id := _get_optional_int_attribute(item, "id")) is not None}
    radiator_list = []
    for radiator in radiators:
        rad_id = _get_required_int_attribute(radiator, "id")
        rad_type = _get_required_str_attribute(radiator, "rad_type")
        try:
            item = item_lookup[rad_id]
            panel = RadiatorPanel(rad_type)
        except (KeyError, ValueError):
            continue

        convectors_attr = "columns" if rad_type == "column_radiator" else "convectors"
        convectors = _get_optional_int_attribute(radiator, convectors_attr) or 0
        width = _get_required_int_attribute(item, "width")
        height = _get_required_int_attribute(item, "height")
        radiator_list.append(Radiator.create(str(rad_id), panel, convectors, height, width))

    return radiator_list


def _extract_room_type(room_element: ElementTree.Element, room_name: str) -> RoomType:
    if (room_type := _get_optional_str_attribute(room_element, "underlying_room_type")) is None:
        raise MissingExpectedRoomTypeInfo(room_name=room_name)
    return RoomType.from_planup(room_type)


def sqm_to_sqmm(sqm: float) -> float:
    return sqm * 1_000_000


def _extract_room_area(room_element: ElementTree.Element) -> float:
    sqm = float(_extract_node_text(room_element, "./ROOMEPC/INTERNALAREA", None, "Missing room floor area information"))
    return sqm_to_sqmm(sqm)


def _extract_coversrooms(room_element: ElementTree.Element) -> list[FloorSection]:
    sections = []
    adjacent_sections = room_element.findall("./ROOMEPC/COVERSROOMS/ROOMBELOW")
    empty_sections = room_element.findall("./ROOMEPC/COVERSROOMS/OVERHANG")

    for section in [*adjacent_sections, *empty_sections]:
        adjacent_id = _get_optional_int_attribute(section, "id")
        sqm = _get_required_str_attribute(section, "sqm")
        sqmm = sqm_to_sqmm(float(sqm))
        sections.append(FloorSection(adjacent_room_id=adjacent_id, area_=sqmm))

    if not sections:
        floor_area_sqmm = _extract_room_area(room_element)
        sections.append(FloorSection(adjacent_room_id=None, area_=floor_area_sqmm))

    return sections


def _extract_room_height(room_element: ElementTree.Element, room_name: str) -> int:
    meters = float(
        _extract_node_text(
            room_element,
            "./ROOMEPC/CEILINGHEIGHT",
            None,
            f"Missing room ceiling height measurement for {room_name}",
        )
    )
    return int(meters * 1000)


def _extract_room_name(room_element: ElementTree.Element) -> str:
    return _extract_node_text(room_element, "ROOMTITLE", "")


def _extract_room_is_heated(room_element: ElementTree.Element) -> bool:
    habitable_type = _extract_node_text(room_element, "./ROOMEPC/HABITABLE", "unheated")
    return habitable_type.strip() == "heated"


def _extract_room_is_habitable(room_element: ElementTree.Element) -> bool:
    is_habitable = _extract_node_text(room_element, "./ROOMEPC/HABITABLE", "other")
    return is_habitable.strip() in ["heated", "unheated"]


def _extract_room_is_included(room_element: ElementTree.Element) -> bool:
    extension_name = _extract_node_text(room_element, "./ROOMEPC/EXTENSION", "Other")
    return extension_name.strip().lower() == "main"


def _room_is_excluded(room_element: ElementTree.Element) -> bool:
    extension_name = _extract_node_text(room_element, "./ROOMEPC/EXTENSION", "Other")
    return extension_name.strip().lower() == "excl"


def _extract_wall_type(heatloss_element: ElementTree.Element) -> WallType | None:
    wall_type = _get_optional_str_attribute(heatloss_element, "type")
    try:
        return WallType(wall_type)  # type: ignore[arg-type]
    except ValueError:
        return None


def _extract_wall_epc_areas(wall_element: ElementTree.Element) -> list[WallEPCArea]:
    total_length_mm = _get_required_int_attribute(wall_element, "mm")
    heatloss_nodes = wall_element.findall("./HEATLOSS")
    if not heatloss_nodes:
        return [WallEPCArea(length_mm=total_length_mm, type=None)]

    wall_epc_areas = [
        WallEPCArea(
            length_mm=_get_required_int_attribute(heatloss_node, "length"),
            type=_extract_wall_type(heatloss_node),
        )
        for heatloss_node in heatloss_nodes
    ]
    covered_length_mm = sum(w.length_mm for w in wall_epc_areas)

    if covered_length_mm > total_length_mm:
        difference = covered_length_mm - total_length_mm
        new_areas = []
        for wall_area in sorted(wall_epc_areas, key=lambda a: a.type or ""):
            wall_area.length_mm -= difference
            if wall_area.length_mm <= 0:
                difference = abs(wall_area.length_mm)
            else:
                new_areas.append(wall_area)
        wall_epc_areas = new_areas
    elif covered_length_mm < total_length_mm:
        wall_epc_areas.append(WallEPCArea(length_mm=total_length_mm - covered_length_mm, type=None))

    return wall_epc_areas


def _get_optional_int_attribute(element: ElementTree.Element, key: str) -> int | None:
    str_int = _get_optional_str_attribute(element, key)
    return int(str_int) if str_int is not None and str_int.isdigit() else None


def _get_required_int_attribute(element: ElementTree.Element, key: str) -> int:
    if (value := _get_optional_int_attribute(element, key)) is None:
        raise MissingRequiredAttribute(attribute=key, element=element)
    return value


def _get_optional_str_attribute(element: ElementTree.Element, key: str) -> str | None:
    return element.get(key, None)


def _get_required_str_attribute(element: ElementTree.Element, key: str) -> str:
    if (value := _get_optional_str_attribute(element, key)) is None:
        raise MissingRequiredAttribute(attribute=key, element=element)
    return value


def _parse_room_item(
    item: ElementTree.Element,
    wall_lookup: dict[int, Wall],
    wall_ids: dict[tuple[int, int], int],
) -> Item | None:
    item_id = _get_required_int_attribute(item, "id")

    if not (item_type_primitive := item.get("type")):
        return None

    try:
        item_type = ItemType(item_type_primitive)
    except ValueError:
        return None

    wall_id = _get_optional_int_attribute(item, "wallId")
    wall_index = _get_optional_int_attribute(item, "wallIndex")
    lookup = (wall_id, wall_index)
    try:
        item_wall_id = wall_ids[lookup]  # type: ignore[index]
        item_wall = wall_lookup[item_wall_id]
    except KeyError:
        item_wall = None

    width = _get_required_int_attribute(item, "width")
    height = _get_required_int_attribute(item, "height")
    adjacent_room_id = item_wall.adjacent_room_id if item_wall else None
    if item_type == ItemType.SKYLIGHT:
        height = _get_required_int_attribute(item, "depth")
        adjacent_room_id = None

    return Item.create(
        id=item_id,
        item_type=item_type,
        height=height,
        width=width,
        adjacent_room_id=adjacent_room_id,
        wall_id=item_wall.id if item_wall else None,
    )


def _parse_room_items(
    room_element: ElementTree.Element,
    walls: list[Wall],
    wall_ids: dict[tuple[int, int], int],
) -> list[Item]:
    wall_lookup = {wall.id: wall for wall in walls}
    return [
        item_instance
        for xml_item in room_element.findall("./ITEMS/ITEM")
        if (item_instance := _parse_room_item(xml_item, wall_lookup, wall_ids))
    ]


def _parse_room_walls(
    room_element: ElementTree.Element,
    room_obj: Room,
) -> tuple[list[Wall], dict[tuple[int, int], int]]:
    walls = []
    wall_height = _extract_room_height(room_element, room_obj.name)
    wall_ids: dict[tuple[int, int], int] = {}
    next_wall_id = 1

    for wall in room_element.findall("./ROOMEPC/WALLS/WALL"):
        wall_index = _get_required_int_attribute(wall, "index")
        wall_id = _get_required_int_attribute(wall, "id")
        lookup = (wall_id, wall_index)

        if lookup not in wall_ids:
            wall_ids[lookup] = next_wall_id
            next_wall_id += 1

        adjacent_room_id = _get_optional_int_attribute(wall, "oppositeRoom")

        for wall_epc_area in _extract_wall_epc_areas(wall_element=wall):
            wall_obj = Wall.create(
                id=wall_ids[lookup],
                adjacent_room_id=adjacent_room_id,
                length=wall_epc_area.length_mm,
                height=wall_height,
                wall_type=wall_epc_area.type,
            )
            walls.append(wall_obj)

    return walls, wall_ids


def _parse_level_rooms(level_element: ElementTree.Element) -> list[Room]:
    rooms: dict[int, Room] = {}
    level_rooms = level_element.findall("ROOM")
    filtered_rooms = [r for r in level_rooms if not _room_is_excluded(r)]

    for room in filtered_rooms:
        if not (room_id := _get_optional_int_attribute(room, "id")):
            continue
        name = _extract_room_name(room)
        room_type = _extract_room_type(room, name)
        if not name:
            name = f"{room_type.name.title()} ({room_id})"
        room_obj = Room(
            id=room_id,
            name=name,
            ceiling=[],
            floor=[],
            type=room_type,
            walls=[],
            items=[],
            radiators=[],
            is_heated=_extract_room_is_heated(room),
            is_habitable=_extract_room_is_habitable(room),
            is_included=_extract_room_is_included(room),
        )
        room_obj.floor = _extract_coversrooms(room)
        rooms[room_id] = room_obj

    for room in filtered_rooms:
        room_id = _get_required_int_attribute(room, "id")
        room_obj = rooms[room_id]
        room_walls, wall_ids = _parse_room_walls(room, room_obj)
        room_obj.walls += room_walls
        room_obj.items += _parse_room_items(room, room_walls, wall_ids)
        room_obj.radiators += _parse_room_radiators(room)

    return list(rooms.values())


def _generate_ceil_sections(levels: list[Level]) -> None:
    room_map: dict[int, Room] = {room.id: room for level in levels for room in level.rooms}

    for room in room_map.values():
        for floor_section in (fs for fs in room.floor if fs.adjacent_room_id is not None):
            adjacent_room_id = cast(int, floor_section.adjacent_room_id)
            if not (adjacent_room := room_map.get(adjacent_room_id)):
                floor_section.adjacent_room_id = None
            else:
                adjacent_room.ceiling.append(CeilSection(adjacent_room_id=room.id, area_=floor_section.area))

    for room in room_map.values():
        floor_area = sum(fs.area_ for fs in room.floor)
        ceiling_area = sum(cs.area_ for cs in room.ceiling)
        if ceiling_area < floor_area:
            room.ceiling.append(CeilSection(adjacent_room_id=None, area_=floor_area - ceiling_area))


def _parse_property(property_element: ElementTree.Element) -> list[Level]:
    levels = []
    for level in property_element.findall("FLOOR"):
        level_id = _get_required_int_attribute(level, "id")
        name = _extract_node_text(level, "FLOORTITLE")
        level_obj = Level(id=level_id, rooms=[], name=name)
        level_obj.rooms += _parse_level_rooms(level)
        levels.append(level_obj)

    _generate_ceil_sections(levels)
    return levels


def parse_file(file_path: str) -> PropertyPlan:
    with open(file_path) as f:
        xml_str = f.read()
    return parse_string(xml_str)


def parse_string(xml_string: str) -> PropertyPlan:
    prop = PropertyPlan(levels=[])
    root = ElementTree.fromstring(xml_string)
    prop.levels += _parse_property(root)
    return prop
