"""
Property plan and heat loss result models.

All models are plain Python dataclasses or pydantic dataclasses — no Django dependency.
"""

from __future__ import annotations

import enum
import random
from dataclasses import dataclass
from functools import cached_property
from typing import Any

from pydantic import ValidationError
from pydantic.dataclasses import dataclass as pydantic_dataclass

from heatloss_engine import exceptions
from heatloss_engine.enums import ItemType, RadiatorPanel, RadiatorType, RoomType, WallType


# ---------------------------------------------------------------------------
# Area / temperature data
# ---------------------------------------------------------------------------

@dataclass
class AreaTemperature:
    postcode: str
    air_temperature: float
    degree_days: int
    area_name: str
    ground_temperature: float


# ---------------------------------------------------------------------------
# Radiator
# ---------------------------------------------------------------------------

@pydantic_dataclass
class Radiator:
    id: str
    type: RadiatorType
    height: int  # mm
    width: int   # mm
    description: str
    n_coefficient: float
    delta_temperature: int
    display_name: str = ""
    output: int = 0
    is_active: bool = True

    def __post_init__(self) -> None:
        if not isinstance(self.type, enum.Enum):
            self.type = RadiatorType(self.type)
        if self.output == 0:
            self._calculate_output()
        if not self.description:
            self.description = self.display_name or f"{self.type.value} H{self.height} x L{self.width}"

    def _calculate_output(self) -> None:
        # DT50 radiator output formula: Q = C * (ΔT/50)^n
        # Coefficients per radiator type at DT50
        _DT50_OUTPUTS: dict[RadiatorType, dict[str, float]] = {
            RadiatorType.P1:          {"c": 554,  "n": 1.33},
            RadiatorType.K1:          {"c": 869,  "n": 1.33},
            RadiatorType.P2:          {"c": 1108, "n": 1.33},
            RadiatorType.P_PLUS:      {"c": 1423, "n": 1.33},
            RadiatorType.K2:          {"c": 1738, "n": 1.33},
            RadiatorType.K2V:         {"c": 1738, "n": 1.33},
            RadiatorType.K3:          {"c": 2169, "n": 1.33},
            RadiatorType.SCHOOL_STYLE: {"c": 600,  "n": 1.30},
            RadiatorType.CAST_IRON:   {"c": 580,  "n": 1.25},
            RadiatorType.DESIGNER:    {"c": 600,  "n": 1.30},
            RadiatorType.TOWEL_RAIL:  {"c": 300,  "n": 1.30},
            RadiatorType.COLUMN_2:    {"c": 600,  "n": 1.30},
            RadiatorType.COLUMN_3:    {"c": 780,  "n": 1.30},
            RadiatorType.COLUMN_4:    {"c": 960,  "n": 1.30},
        }
        coeff = _DT50_OUTPUTS.get(self.type, {"c": 600, "n": 1.33})
        area_factor = (self.height / 600) * (self.width / 1000)
        self.output = int(coeff["c"] * area_factor)

    def output_calculation(self) -> Radiator:
        return Radiator(
            id=self.id,
            type=self.type,
            width=self.width,
            height=self.height,
            output=self.output,
            delta_temperature=50,
            n_coefficient=0.0,
            description="",
            is_active=True,
        )

    @classmethod
    def create(cls, id: str, panel: RadiatorPanel, convectors: int, height: int, width: int) -> Radiator:
        radiator_type = RadiatorType.from_panel(panel, convectors)
        return Radiator(
            id=id,
            type=radiator_type,
            width=width,
            height=height,
            description="",
            n_coefficient=0.0,
            delta_temperature=50,
        )


# ---------------------------------------------------------------------------
# Calculation result models
# ---------------------------------------------------------------------------

@pydantic_dataclass
class ObjectCalculation:
    heatloss: int
    energy_usage: int
    u_value: float
    temperature_difference: float
    identifier: str
    area: float
    adjacent_id: int | None

    @classmethod
    def empty(cls) -> ObjectCalculation:
        return ObjectCalculation(0, 0, 0, 0, "", 0, 0)


@pydantic_dataclass
class RoomCalculations:
    type: int
    id: str
    name: str
    radiators: list[Radiator]
    items: list[ObjectCalculation]
    walls: list[ObjectCalculation]
    ceiling: list[ObjectCalculation]
    floor: list[ObjectCalculation]
    fabric_heatloss: int
    fabric_energy_usage: int
    ventilation_heatloss: int
    ventilation_energy_usage: int
    total_heatloss: int
    total_radiator_output: int
    total_energy_usage: int
    design_temperature: int
    air_change_rate: float
    volume: float
    area: float
    has_flue: bool
    has_external_floor: bool
    has_exposed_ceiling: bool
    is_heated: bool
    is_habitable: bool
    is_included: bool
    has_ufh: bool
    ufh_spacing: int | None

    @classmethod
    def create_unheated(cls, id: str, name: str, room_type: RoomType, design_temperature: float) -> RoomCalculations:
        return cls(
            type=room_type.value,
            id=id,
            name=name,
            radiators=[],
            items=[],
            walls=[],
            ceiling=[],
            floor=[],
            fabric_heatloss=0,
            fabric_energy_usage=0,
            ventilation_heatloss=0,
            ventilation_energy_usage=0,
            total_heatloss=0,
            total_radiator_output=0,
            total_energy_usage=0,
            design_temperature=int(design_temperature),
            air_change_rate=0,
            volume=0,
            area=0,
            has_flue=False,
            has_external_floor=False,
            has_exposed_ceiling=False,
            is_heated=False,
            is_habitable=False,
            is_included=False,
            has_ufh=False,
            ufh_spacing=None,
        )

    def get_radiator_by_id(self, radiator_id: str) -> Radiator:
        try:
            return next(r for r in self.radiators if r.id == radiator_id)
        except StopIteration:
            raise exceptions.RadiatorNotFound(f"Radiator {radiator_id} not found")


@pydantic_dataclass
class HeatlossCalculation:
    rooms: list[RoomCalculations]
    total_heatloss: int
    total_energy_usage: int
    degree_days: int
    external_temperature: float
    ground_temperature: float
    air_change_factor: float
    total_floor_sqm: float

    def get_room(self, room_id: str) -> RoomCalculations:
        try:
            return next(r for r in self.rooms if r.id == room_id)
        except StopIteration:
            raise exceptions.RoomNotFound(f"Room {room_id} not found")


# ---------------------------------------------------------------------------
# Property plan models (input to the calculator)
# ---------------------------------------------------------------------------

@dataclass
class HeatLossObject:
    adjacent_room_id: int | None

    @property
    def identifier(self) -> str:
        raise NotImplementedError


@dataclass
class Item(HeatLossObject):
    id: int
    height: int
    width: int
    wall_id: int | None
    type: ItemType

    @property
    def identifier(self) -> str:
        return f"{self.identifier_prefix()}:{self.id}"

    @classmethod
    def create(
        cls,
        item_type: ItemType,
        id: int,
        height: int,
        width: int,
        adjacent_room_id: int | None = None,
        wall_id: int | None = None,
    ) -> Item:
        item_type_cls: type[Item]
        match item_type:
            case ItemType.SHOWER:
                item_type_cls = ShowerItem
            case ItemType.BATH_HORIZONTAL:
                item_type_cls = BathItem
            case ItemType.TOILET:
                item_type_cls = ToiletItem
            case ItemType.FLUE:
                item_type_cls = Flue
            case (
                ItemType.DOOR
                | ItemType.DOUBLE_DOOR
                | ItemType.PATIO_DOOR
                | ItemType.FOLDING_DOOR
                | ItemType.SLIDING_DOOR
                | ItemType.UP_AND_OVER_DOOR
            ):
                item_type_cls = DoorItem
            case ItemType.SKYLIGHT:
                item_type_cls = Skylight
            case (
                ItemType.WINDOW | ItemType.BIFOLD_DOOR | ItemType.BOW_WINDOW | ItemType.BOX_WINDOW | ItemType.BAY_WINDOW
            ):
                item_type_cls = WindowItem
            case _:
                raise NotImplementedError

        return item_type_cls(
            id=id,
            width=width,
            height=height,
            adjacent_room_id=adjacent_room_id,
            wall_id=wall_id,
            type=item_type,
        )

    @classmethod
    def identifier_prefix(cls) -> str:
        return cls.__name__


@dataclass
class DoorItem(Item): ...


@dataclass
class ShowerItem(Item): ...


@dataclass
class BathItem(Item): ...


@dataclass
class ToiletItem(Item): ...


@dataclass
class Flue(Item): ...


@dataclass
class WindowItem(Item): ...


@dataclass
class Skylight(Item):
    ceil_section: CeilSection | None = None


@dataclass
class WallEPCArea:
    length_mm: int
    type: WallType | None


@dataclass
class Wall(HeatLossObject):
    id: int
    length: int
    height: int

    @property
    def identifier(self) -> str:
        return f"{self.__class__.__name__}:{self.id}"

    @classmethod
    def create(
        cls,
        id: int,
        adjacent_room_id: int | None,
        length: int,
        height: int,
        wall_type: WallType | None,
    ) -> Wall:
        kwargs: dict[str, Any] = {
            "id": id,
            "length": length,
            "height": height,
            "adjacent_room_id": adjacent_room_id,
        }
        if adjacent_room_id:
            return InternalWall(**kwargs)
        if wall_type == WallType.PARTY:
            return PartyWall(**kwargs)
        return ExternalWall(**kwargs)


@dataclass
class InternalWall(Wall): ...


@dataclass
class ExternalWall(Wall): ...


@dataclass
class PartyWall(ExternalWall): ...


@dataclass
class ShelteredWall(ExternalWall): ...


@dataclass
class FloorSection(HeatLossObject):
    area_: float

    @property
    def is_external(self) -> bool:
        return self.adjacent_room_id is None

    @property
    def identifier(self) -> str:
        return "ExternalFloorSection" if self.is_external else "IntermediateFloorSection"

    @property
    def area(self) -> float:
        return self.area_


@dataclass
class CeilSection(HeatLossObject):
    area_: float

    @property
    def identifier(self) -> str:
        return "RoofSection" if self.is_exposed else "CeilingSection"

    @property
    def is_exposed(self) -> bool:
        return self.adjacent_room_id is None


@dataclass
class Room:
    id: int
    name: str
    type: RoomType
    is_heated: bool
    is_habitable: bool
    is_included: bool
    floor: list[FloorSection]
    walls: list[Wall]
    items: list[Item]
    radiators: list[Radiator]
    ceiling: list[CeilSection]

    @cached_property
    def floor_area(self) -> float:
        return sum(floor.area / 1_000_000 for floor in self.floor)

    @classmethod
    def empty(cls) -> Room:
        return Room(
            id=random.randint(1, 10000),
            name="",
            type=RoomType.UNHEATED,
            is_heated=False,
            is_habitable=False,
            is_included=True,
            floor=[],
            walls=[],
            items=[],
            radiators=[],
            ceiling=[],
        )

    @cached_property
    def has_flue(self) -> bool:
        return any(isinstance(item, Flue) for item in self.items)

    @cached_property
    def has_exposed_ceiling_section(self) -> bool:
        return any(ceil.is_exposed for ceil in self.ceiling)

    @cached_property
    def has_external_floor(self) -> bool:
        exposed = sum(floor.area for floor in self.floor if floor.is_external)
        non_exposed = sum(floor.area for floor in self.floor if not floor.is_external)
        return exposed > non_exposed

    @cached_property
    def volume(self) -> float:
        assert self.walls and self.floor
        wall_height = self.walls[0].height
        return sum(floor.area for floor in self.floor) * wall_height / 1_000_000_000


@dataclass
class Level:
    id: int
    name: str
    rooms: list[Room]


@dataclass
class PropertyPlan:
    levels: list[Level]

    @cached_property
    def total_floor_area(self) -> float:
        total = sum(room.floor_area for level in self.levels for room in level.rooms if room.is_habitable)
        return round(total, 1)
