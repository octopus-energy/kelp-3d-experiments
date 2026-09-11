"""
Heat Loss Calculator

Takes a PropertyData (property plan + pre-resolved U-values and temperatures) and
produces a HeatlossCalculation with per-room fabric and ventilation heat loss.
"""

from collections.abc import Iterable
from functools import cached_property
from itertools import chain

import attrs

from heatloss_engine import mapping, models
from heatloss_engine.enums import AirChangeRateCategory, RoomType


type RoomID = str


class HeatLossCalculatorError(Exception): ...


class MissingValuesForRoom(HeatLossCalculatorError): ...


class DuplicateRoomValue(HeatLossCalculatorError): ...


@attrs.frozen
class UValues:
    external_wall: float
    internal_wall: float
    external_floor: float
    intermediate_floor: float
    roof: float
    window: float
    internal_door: float
    external_door: float


@attrs.frozen
class RoomValues:
    room_id: str
    u_values: UValues
    has_exposed_floor: bool
    has_solid_floor: bool
    has_ufh: bool
    ufh_spacing: int | None = None
    has_throat_restrictor: bool | None = None


@attrs.frozen
class PropertyValues:
    air_change_rate_category: AirChangeRateCategory
    external_temperature: float
    ground_temperature: float
    degree_days: int
    room_values: tuple[RoomValues, ...] = attrs.field(factory=tuple)

    @room_values.validator
    def _validate_room_values(self, attribute: attrs.Attribute, value: Iterable[RoomValues]) -> None:
        seen: set[str] = set()
        for rv in value:
            if rv.room_id in seen:
                raise DuplicateRoomValue(f"Duplicate room value for room id: {rv.room_id}")
            seen.add(rv.room_id)


@attrs.frozen
class PropertyData:
    property_plan: models.PropertyPlan
    property_values: PropertyValues


class HeatLossCalculator:
    def __init__(self, property_data: PropertyData):
        self._property_data = property_data

    @property
    def _property_plan(self) -> models.PropertyPlan:
        return self._property_data.property_plan

    @property
    def _property_values(self) -> PropertyValues:
        return self._property_data.property_values

    @cached_property
    def _room_map(self) -> dict[int, models.Room]:
        return {room.id: room for level in self._property_plan.levels for room in level.rooms}

    @cached_property
    def _room_wall_map(self) -> dict[int, dict[int, models.Wall]]:
        return {room.id: {wall.id: wall for wall in room.walls} for room in self._room_map.values()}

    @cached_property
    def _room_values_map(self) -> dict[str, RoomValues]:
        return {rv.room_id: rv for rv in self._property_values.room_values}

    @cached_property
    def _room_air_change_rates(self) -> dict[RoomType, dict[AirChangeRateCategory, float]]:
        return {
            RoomType.WETROOM:     {AirChangeRateCategory.CATEGORY_A: 3.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.LIVING_ROOM: {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.LOUNGE:      {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.BREAKFAST:   {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.DINING:      {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.KITCHEN:     {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.FAMILY:      {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.HALL:        {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.CLOAK:       {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 1.5},
            RoomType.TOILET:      {AirChangeRateCategory.CATEGORY_A: 3.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 1.5},
            RoomType.STUDY:       {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.UTILITY:     {AirChangeRateCategory.CATEGORY_A: 3.0, AirChangeRateCategory.CATEGORY_B: 2.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.GAMES:       {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.BEDROOM:     {AirChangeRateCategory.CATEGORY_A: 1.0, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.BEDSITTING:  {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.ENSUITE:     {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 1.0},
            RoomType.INTERNAL:    {AirChangeRateCategory.CATEGORY_A: 0.0, AirChangeRateCategory.CATEGORY_B: 0.0, AirChangeRateCategory.CATEGORY_C: 0.0},
            RoomType.BED_STUDY:   {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.LANDING:     {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.BATH:        {AirChangeRateCategory.CATEGORY_A: 3.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.SHOWER:      {AirChangeRateCategory.CATEGORY_A: 3.0, AirChangeRateCategory.CATEGORY_B: 1.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.DRESSING:    {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.STORE:       {AirChangeRateCategory.CATEGORY_A: 1.5, AirChangeRateCategory.CATEGORY_B: 0.5, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.HALLWAY:     {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.GARAGE:      {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.CONSERVATORY:{AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
            RoomType.UNHEATED:    {AirChangeRateCategory.CATEGORY_A: 2.0, AirChangeRateCategory.CATEGORY_B: 1.0, AirChangeRateCategory.CATEGORY_C: 0.5},
        }

    def _get_design_temperature_for_room_type(self, room_type: RoomType) -> float:
        return mapping.get_design_temperature_for_room_type(room_type)

    def _get_rooms_connected_to_room(self, room: models.Room) -> Iterable[models.Room]:
        doors = (item for item in room.items if isinstance(item, models.DoorItem))
        connected_room_ids = (door.adjacent_room_id for door in doors if door.adjacent_room_id)
        yield from (self._room_map[room_id] for room_id in connected_room_ids)

    def _get_design_temperature_for_room(self, room: models.Room) -> float:
        if not room.is_habitable or not room.is_heated:
            return self._get_design_temperature_for_room_type(RoomType.UNHEATED)

        if len(room.items) == 1:
            item = room.items[0]
            if any(isinstance(item, t) for t in {models.BathItem, models.ShowerItem}):
                return self._get_design_temperature_for_room_type(RoomType.WETROOM)

        if room.type == RoomType.BEDROOM:
            ensuite_types = {RoomType.SHOWER, RoomType.BATH, RoomType.TOILET}
            if any(r.type in ensuite_types for r in self._get_rooms_connected_to_room(room)):
                return self._get_design_temperature_for_room_type(RoomType.ENSUITE)

        return self._get_design_temperature_for_room_type(room.type)

    def _get_room_is_top_level(self, room: models.Room) -> bool:
        num_levels = len(self._property_plan.levels)
        for level in self._property_plan.levels:
            if room in level.rooms:
                return self._property_plan.levels.index(level) == num_levels - 1
        assert False, "unreachable"

    def _get_values_for_room(self, room: models.Room) -> RoomValues:
        try:
            return self._room_values_map[str(room.id)]
        except KeyError:
            raise MissingValuesForRoom(f"Missing values for room id: {room.id}")

    def _get_u_value_for_object(self, obj: models.HeatLossObject, room: models.Room) -> float:
        room_u_values = self._get_values_for_room(room).u_values

        if isinstance(obj, models.ExternalWall):
            return room_u_values.external_wall
        if isinstance(obj, models.InternalWall):
            return room_u_values.internal_wall
        if isinstance(obj, models.FloorSection):
            return room_u_values.external_floor if obj.is_external else room_u_values.intermediate_floor
        if isinstance(obj, models.CeilSection):
            if obj.adjacent_room_id:
                adjacent_room_values = self._get_values_for_room(self._room_map[obj.adjacent_room_id])
                return adjacent_room_values.u_values.intermediate_floor
            return room_u_values.roof
        if isinstance(obj, models.WindowItem | models.Skylight):
            return room_u_values.window
        if isinstance(obj, models.DoorItem):
            is_external = (
                obj.wall_id is not None
                and self._room_wall_map[room.id][obj.wall_id].adjacent_room_id is None
            )
            return room_u_values.external_door if is_external else room_u_values.internal_door

        return 0.0

    def _get_party_wall_temperature(self) -> float:
        return self._get_design_temperature_for_room_type(RoomType.UNHEATED)

    def _get_temperature_difference_for_object(self, obj: models.HeatLossObject, room: models.Room) -> float:
        if isinstance(obj, models.ShowerItem | models.BathItem | models.ToiletItem | models.Flue):
            return 0.0
        if isinstance(obj, models.ShelteredWall):
            room_temperature = self._get_design_temperature_for_room(room)
            return room_temperature - self._get_design_temperature_for_room_type(RoomType.UNHEATED)
        if isinstance(obj, models.PartyWall):
            return self._get_party_wall_temperature()

        room_temperature = self._get_design_temperature_for_room(room)
        room_values = self._get_values_for_room(room)

        if obj.adjacent_room_id:
            external_temperature = self._get_design_temperature_for_room(self._room_map[obj.adjacent_room_id])
        else:
            external_temperature = self._property_values.external_temperature
            if isinstance(obj, models.FloorSection) and room_values.has_solid_floor and not room_values.has_exposed_floor:
                external_temperature = self._property_values.ground_temperature

        return room_temperature - external_temperature

    def _get_subtract_from_wall(self, item: models.Item, room: models.Room) -> bool:
        if isinstance(item, models.DoorItem):
            is_external = (
                item.wall_id is not None
                and self._room_wall_map[room.id][item.wall_id].adjacent_room_id is None
            )
            return is_external
        return isinstance(item, models.WindowItem)

    def _get_area_for_object(self, obj: models.HeatLossObject, room: models.Room) -> float:
        if isinstance(obj, models.Item):
            return obj.height * obj.width
        if isinstance(obj, models.Wall):
            wall_items_area = sum(
                item.height * item.width
                for item in room.items
                if item.wall_id == obj.id and self._get_subtract_from_wall(item, room)
            )
            return (obj.length * obj.height) - wall_items_area
        if isinstance(obj, models.FloorSection):
            return obj.area
        if isinstance(obj, models.CeilSection):
            skylights = (item for item in room.items if isinstance(item, models.Skylight) and item.ceil_section is None)
            remaining_area = obj.area_
            for skylight in skylights:
                skylight_area = self._get_area_for_object(skylight, room)
                if obj.adjacent_room_id is None and remaining_area > skylight_area:
                    skylight.ceil_section = obj
                    remaining_area -= skylight_area
            return remaining_area
        raise NotImplementedError

    def _get_has_energy_usage_for_object(self, obj: models.HeatLossObject, room: models.Room) -> bool:
        if isinstance(obj, models.DoorItem | models.WindowItem):
            return obj.wall_id is not None and self._get_has_energy_usage_for_object(
                self._room_wall_map[room.id][obj.wall_id], room
            )
        if isinstance(obj, models.ExternalWall | models.Skylight):
            return True
        if isinstance(obj, models.FloorSection):
            return obj.adjacent_room_id is None
        if isinstance(obj, models.CeilSection):
            return self._get_room_is_top_level(room)
        return False

    def _get_heat_loss_calculation_for_object(
        self,
        obj: models.HeatLossObject,
        room: models.Room,
    ) -> models.ObjectCalculation:
        u_value = self._get_u_value_for_object(obj, room)
        temperature_difference = self._get_temperature_difference_for_object(obj, room)
        obj_area_sqm = self._get_area_for_object(obj, room) / 1_000_000

        heatloss = u_value * obj_area_sqm * temperature_difference
        heatloss = max(0.0, heatloss)

        degree_days = self._property_values.degree_days
        energy_usage = u_value * obj_area_sqm * degree_days * 24
        if not self._get_has_energy_usage_for_object(obj, room) or temperature_difference == 0:
            energy_usage = 0.0

        return models.ObjectCalculation(
            heatloss=int(heatloss),
            energy_usage=int(energy_usage),
            u_value=u_value,
            temperature_difference=temperature_difference,
            identifier=obj.identifier,
            area=obj_area_sqm,
            adjacent_id=obj.adjacent_room_id,
        )

    def _get_air_change_factor(self) -> float:
        return 0.33

    def _get_air_change_rate_for_room(self, room: models.Room) -> float:
        room_values = self._get_values_for_room(room)
        has_throat_restrictor = room_values.has_throat_restrictor

        if room.has_flue:
            if has_throat_restrictor is None:
                return 3.5
            if room.volume <= 40:
                return 3.0 if has_throat_restrictor else 5.0
            return 2.0 if has_throat_restrictor else 4.0

        return self._room_air_change_rates[room.type][self._property_values.air_change_rate_category]

    def _calculate_ventilation_heat_loss_for_room(self, room: models.Room) -> int:
        external_temperature = self._property_values.external_temperature
        temperature_difference = self._get_design_temperature_for_room(room) - external_temperature
        return int(room.volume * self._get_air_change_rate_for_room(room) * self._get_air_change_factor() * temperature_difference)

    def _calculate_ventilation_energy_usage_for_room(self, room: models.Room) -> int:
        return int(room.volume * self._get_air_change_factor() * self._property_values.degree_days * 24)

    def _calculate_heat_loss_for_room(self, room: models.Room) -> models.RoomCalculations:
        if not room.is_habitable:
            return models.RoomCalculations.create_unheated(
                str(room.id), room.name, room.type, self._get_design_temperature_for_room(room)
            )

        room_values = self._get_values_for_room(room)

        floor = [self._get_heat_loss_calculation_for_object(fs, room) for fs in room.floor]
        walls = [self._get_heat_loss_calculation_for_object(w, room) for w in room.walls]
        items = [self._get_heat_loss_calculation_for_object(i, room) for i in room.items]
        ceiling = [self._get_heat_loss_calculation_for_object(cs, room) for cs in room.ceiling]
        radiators = [r.output_calculation() for r in room.radiators]

        fabric_heat_loss = sum(c.heatloss for c in chain(floor, walls, items, ceiling))
        fabric_energy_usage = sum(c.energy_usage for c in chain(floor, walls, items, ceiling))
        ventilation_heatloss = self._calculate_ventilation_heat_loss_for_room(room)
        ventilation_energy_usage = self._calculate_ventilation_energy_usage_for_room(room)

        return models.RoomCalculations(
            id=str(room.id),
            type=room.type.value,
            name=room.name,
            radiators=radiators,
            items=items,
            walls=walls,
            ceiling=ceiling,
            floor=floor,
            fabric_heatloss=fabric_heat_loss,
            fabric_energy_usage=fabric_energy_usage,
            ventilation_heatloss=ventilation_heatloss,
            ventilation_energy_usage=ventilation_energy_usage,
            total_heatloss=ventilation_heatloss + fabric_heat_loss,
            total_energy_usage=ventilation_energy_usage + fabric_energy_usage,
            total_radiator_output=int(sum(r.output for r in radiators)),
            design_temperature=int(self._get_design_temperature_for_room(room)),
            air_change_rate=self._get_air_change_rate_for_room(room),
            volume=room.volume,
            area=room.floor_area,
            has_flue=room.has_flue,
            has_external_floor=room.has_external_floor,
            has_exposed_ceiling=room.has_exposed_ceiling_section,
            is_heated=room.is_heated,
            is_habitable=room.is_habitable,
            is_included=room.is_included,
            has_ufh=room_values.has_ufh,
            ufh_spacing=room_values.ufh_spacing,
        )

    def calculate_heat_loss(self) -> models.HeatlossCalculation:
        rooms = (room for level in self._property_plan.levels for room in level.rooms)
        room_calculations = [self._calculate_heat_loss_for_room(room) for room in rooms]

        return models.HeatlossCalculation(
            rooms=room_calculations,
            total_heatloss=sum(c.total_heatloss for c in room_calculations),
            total_energy_usage=sum(c.total_energy_usage for c in room_calculations),
            degree_days=self._property_values.degree_days,
            external_temperature=self._property_values.external_temperature,
            ground_temperature=self._property_values.ground_temperature,
            air_change_factor=self._get_air_change_factor(),
            total_floor_sqm=self._property_plan.total_floor_area,
        )
