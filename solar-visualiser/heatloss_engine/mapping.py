from heatloss_engine.enums import RoomType


_ROOM_TYPE_DESIGN_TEMPERATURE_MAP: dict[RoomType, float] = {
    RoomType.WETROOM: 22.0,
    RoomType.LIVING_ROOM: 21.0,
    RoomType.LOUNGE: 21.0,
    RoomType.BREAKFAST: 21.0,
    RoomType.DINING: 21.0,
    RoomType.KITCHEN: 18.0,
    RoomType.FAMILY: 21.0,
    RoomType.HALL: 18.0,
    RoomType.CLOAK: 18.0,
    RoomType.TOILET: 18.0,
    RoomType.STUDY: 21.0,
    RoomType.UTILITY: 18.0,
    RoomType.GAMES: 21.0,
    RoomType.BEDROOM: 18.0,
    RoomType.BEDSITTING: 21.0,
    RoomType.ENSUITE: 21.0,
    RoomType.INTERNAL: 18.0,
    RoomType.BED_STUDY: 21.0,
    RoomType.LANDING: 18.0,
    RoomType.BATH: 22.0,
    RoomType.SHOWER: 22.0,
    RoomType.DRESSING: 18.0,
    RoomType.STORE: 16.0,
    RoomType.HALLWAY: 18.0,
    RoomType.GARAGE: 10.0,
    RoomType.CONSERVATORY: 16.0,
    RoomType.UNHEATED: 11.0,
}


def get_design_temperature_for_room_type(room_type: RoomType) -> float:
    return _ROOM_TYPE_DESIGN_TEMPERATURE_MAP[room_type]
