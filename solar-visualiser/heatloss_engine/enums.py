"""
Enums used across the heat loss engine.

The top section (WallType … AirChangeRateCategory) are internal engine enums.
The GBR survey enums below (BuildYear … RoomPipeSpacing) correspond 1-to-1 with
the selections captured in the Heatpump Survey V2 fieldset; their string values
are the canonical survey component values.
"""

from __future__ import annotations

import logging
from enum import Enum, StrEnum, auto


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal engine enums
# ---------------------------------------------------------------------------

class WallType(StrEnum):
    PARTY = "party"
    HEATLOSS = "heat_loss"


class RoomType(Enum):
    WETROOM = auto()
    HALLWAY = auto()
    LIVING_ROOM = auto()
    LOUNGE = auto()
    BREAKFAST = auto()
    DINING = auto()
    KITCHEN = auto()
    FAMILY = auto()
    HALL = auto()
    CLOAK = auto()
    TOILET = auto()
    STUDY = auto()
    UTILITY = auto()
    GAMES = auto()
    BEDROOM = auto()
    BEDSITTING = auto()
    ENSUITE = auto()
    INTERNAL = auto()
    BED_STUDY = auto()
    LANDING = auto()
    BATH = auto()
    SHOWER = auto()
    DRESSING = auto()
    STORE = auto()
    GARAGE = auto()
    CONSERVATORY = auto()
    UNHEATED = auto()

    @classmethod
    def from_planup(cls, type: str) -> RoomType:
        if type not in PLANUP_TYPES:
            logger.error(f"Received an unknown RoomType {type}, defaulting to Living room type")
            return RoomType.LIVING_ROOM
        return PLANUP_TYPES[type]


class ItemType(StrEnum):
    SHOWER = "shower"
    BATH_HORIZONTAL = "bath_horizontal"
    TOILET = "toilet"
    FLUE = "energy_flue"
    DOOR = "door"
    DOUBLE_DOOR = "double_door"
    PATIO_DOOR = "patio_door"
    FOLDING_DOOR = "folding_door"
    BIFOLD_DOOR = "bifold_door"
    SLIDING_DOOR = "sliding_door"
    UP_AND_OVER_DOOR = "up_and_over_door"
    SKYLIGHT = "skylight"
    WINDOW = "window"
    BOW_WINDOW = "bow_window"
    BOX_WINDOW = "box_window"
    BAY_WINDOW = "bay_window"


PLANUP_TYPES: dict[str, RoomType] = {
    "balcony": RoomType.UNHEATED,
    "basement": RoomType.STORE,
    "bathroom": RoomType.BATH,
    "bedroom": RoomType.BEDROOM,
    "bedroom_area": RoomType.BEDROOM,
    "bedroom_1": RoomType.BEDROOM,
    "bedroom_2": RoomType.BEDROOM,
    "bedroom_3": RoomType.BEDROOM,
    "bedroom_4": RoomType.BEDROOM,
    "bedroom_5": RoomType.BEDROOM,
    "bedroom_6": RoomType.BEDROOM,
    "boot_room": RoomType.LANDING,
    "breakfast_area": RoomType.BREAKFAST,
    "breakfast_room": RoomType.BREAKFAST,
    "cellar": RoomType.UTILITY,
    "cloakroom": RoomType.CLOAK,
    "closet": RoomType.CLOAK,
    "conservatory": RoomType.CONSERVATORY,
    "cupboard": RoomType.STORE,
    "dining_area": RoomType.DINING,
    "dining_room": RoomType.DINING,
    "double_garage": RoomType.GARAGE,
    "downstairs_shower": RoomType.SHOWER,
    "drawing_room": RoomType.GAMES,
    "dressing_area": RoomType.DRESSING,
    "dressing_room": RoomType.DRESSING,
    "eaves": RoomType.STORE,
    "entrance_hall": RoomType.LANDING,
    "entrance_vestibule": RoomType.LANDING,
    "en_suite": RoomType.ENSUITE,
    "en_suite_bathroom": RoomType.ENSUITE,
    "en_suite_shower_room": RoomType.ENSUITE,
    "family_bathroom": RoomType.BATH,
    "family_room": RoomType.FAMILY,
    "fitted_kitchen": RoomType.KITCHEN,
    "galleried_landing": RoomType.LANDING,
    "garage": RoomType.GARAGE,
    "garden_room": RoomType.UNHEATED,
    "garden_room_extension": RoomType.UNHEATED,
    "hall": RoomType.HALL,
    "hallway": RoomType.HALLWAY,
    "inner_hallway": RoomType.HALLWAY,
    "inner_porch": RoomType.LANDING,
    "jack_and_jill_bathroom": RoomType.BATH,
    "jack_and_jill_en_suite": RoomType.BATH,
    "kitchen": RoomType.KITCHEN,
    "kitchen_area": RoomType.KITCHEN,
    "kitchen_breakfast_room": RoomType.BREAKFAST,
    "kitchen_diner": RoomType.DINING,
    "kitchen_dining_room": RoomType.DINING,
    "landing": RoomType.LANDING,
    "laundry_room": RoomType.UTILITY,
    "lean_to": RoomType.UNHEATED,
    "living_room": RoomType.LIVING_ROOM,
    "lobby": RoomType.HALLWAY,
    "loft_room": RoomType.INTERNAL,
    "lounge": RoomType.LOUNGE,
    "lounge_area": RoomType.LOUNGE,
    "lounge_diner": RoomType.LOUNGE,
    "lounge_dining_room": RoomType.LOUNGE,
    "main_bedroom": RoomType.BEDROOM,
    "master_bedroom": RoomType.BEDROOM,
    "office": RoomType.STUDY,
    "open_plan_living": RoomType.LIVING_ROOM,
    "pantry": RoomType.STORE,
    "plant_room": RoomType.UTILITY,
    "play_room": RoomType.GAMES,
    "porch": RoomType.LANDING,
    "rear_lobby": RoomType.HALLWAY,
    "rear_porch": RoomType.LANDING,
    "reception": RoomType.LANDING,
    "reception_hall": RoomType.LANDING,
    "reception_room": RoomType.LANDING,
    "separate_toilet": RoomType.TOILET,
    "separate_wc": RoomType.TOILET,
    "shed": RoomType.STORE,
    "shower_room": RoomType.SHOWER,
    "sitting_dining_room": RoomType.DINING,
    "sitting_room": RoomType.LIVING_ROOM,
    "snug": RoomType.LIVING_ROOM,
    "storage": RoomType.STORE,
    "store": RoomType.STORE,
    "store_room": RoomType.STORE,
    "study": RoomType.STUDY,
    "sun_room": RoomType.CONSERVATORY,
    "toilet": RoomType.TOILET,
    "utility": RoomType.UTILITY,
    "utility_area": RoomType.UTILITY,
    "utility_room": RoomType.UTILITY,
    "walk_in_wardrobe": RoomType.STORE,
    "wc": RoomType.TOILET,
    "wet_room": RoomType.WETROOM,
    "workshop": RoomType.UTILITY,
}


class AirChangeRateCategory(Enum):
    CATEGORY_A = auto()
    CATEGORY_B = auto()
    CATEGORY_C = auto()


# ---------------------------------------------------------------------------
# GBR survey selection enums
# These correspond to the Heatpump Survey V2 component selections.
# Values are the canonical survey component string identifiers.
# ---------------------------------------------------------------------------

class BuildYear(StrEnum):
    FROM_2012_ONWARDS = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_FROM_2012_ONWARDS"
    BETWEEN_2007_AND_2011 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_2007_AND_2011"
    BETWEEN_2003_AND_2006 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_2003_AND_2006"
    BETWEEN_1996_AND_2002 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1996_AND_2002"
    BETWEEN_1991_AND_1995 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1991_AND_1995"
    BETWEEN_1983_AND_1990 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1983_AND_1990"
    BETWEEN_1976_AND_1982 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1976_AND_1982"
    BETWEEN_1967_AND_1975 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1967_AND_1975"
    BETWEEN_1950_AND_1966 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1950_AND_1966"
    BETWEEN_1930_AND_1949 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1930_AND_1949"
    BETWEEN_1900_AND_1929 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BETWEEN_1900_AND_1929"
    BEFORE_1900 = "HEAT_PUMP_SURVEY_V2_PROPERTY_BUILD_YEAR_BEFORE_1900"


class ExternalWallType(StrEnum):
    STONE_GRANITE_OR_WHINSTONE = "HEAT_PUMP_SURVEY_V2_EXTERNAL_WALL_TYPE_STONE_GRANITE_OR_WHINSTONE"
    STONE_SANDSTONE_OR_LIMESTONE = "HEAT_PUMP_SURVEY_V2_EXTERNAL_WALL_TYPE_STONE_SANDSTONE_OR_LIMESTONE"
    SOLID_BRICK = "HEAT_PUMP_SURVEY_V2_EXTERNAL_WALL_TYPE_SOLID_BRICK"
    COB = "HEAT_PUMP_SURVEY_V2_EXTERNAL_WALL_TYPE_COB"
    CAVITY = "HEAT_PUMP_SURVEY_V2_EXTERNAL_WALL_TYPE_CAVITY"
    TIMBER_FRAME = "HEAT_PUMP_SURVEY_V2_EXTERNAL_WALL_TYPE_TIMBER_FRAME"
    SYSTEM_BUILD = "HEAT_PUMP_SURVEY_V2_EXTERNAL_WALL_TYPE_SYSTEM_BUILD"


class InternalExternalWallInsulation(StrEnum):
    AS_BUILT = "AS_BUILT"
    NONE = "HEAT_PUMP_SURVEY_V2_INTERNAL_EXTERNAL_WALL_INSULATION_0MM"
    FIFTY_MM = "HEAT_PUMP_SURVEY_V2_INTERNAL_EXTERNAL_WALL_INSULATION_50MM"
    ONE_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_INTERNAL_EXTERNAL_WALL_INSULATION_100MM"
    ONE_HUNDRED_FIFTY_MM = "HEAT_PUMP_SURVEY_V2_INTERNAL_EXTERNAL_WALL_INSULATION_150MM"
    TWO_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_INTERNAL_EXTERNAL_WALL_INSULATION_200MM"


class FloorType(StrEnum):
    SUSPENDED_TIMBER = "HEAT_PUMP_SURVEY_V2_FLOOR_TYPE_SUSPENDED_TIMBER"
    SOLID = "HEAT_PUMP_SURVEY_V2_FLOOR_TYPE_SOLID"
    BLOCK_AND_BEAM = "HEAT_PUMP_SURVEY_V2_FLOOR_TYPE_BLOCK_AND_BEAM"


class AdditionalFloorInsulation(StrEnum):
    NONE = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_FLOOR_INSULATION_NONE"
    TWENTY_FIVE_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_FLOOR_INSULATION_25mm"
    FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_FLOOR_INSULATION_50mm"
    SEVENTY_FIVE_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_FLOOR_INSULATION_75mm"
    ONE_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_FLOOR_INSULATION_100mm"
    ONE_HUNDRED_FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_FLOOR_INSULATION_150mm"


class RoofType(StrEnum):
    PITCHED_TILE = "HEAT_PUMP_SURVEY_V2_ROOF_TYPE_PITCHED_TILE"
    FLAT_ROOF = "HEAT_PUMP_SURVEY_V2_ROOF_TYPE_FLAT_ROOF"
    THATCHED_ROOF = "HEAT_PUMP_SURVEY_V2_ROOF_TYPE_THATCHED_ROOF"


class RoofInsulationThickness(StrEnum):
    AS_BUILT = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_AS_BUILT"
    NONE = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_NONE"
    TWELVE_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_12MM"
    TWENTY_FIVE_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_25MM"
    FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_50MM"
    SEVENTY_FIVE_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_75MM"
    ONE_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_100MM"
    ONE_HUNDRED_FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_150MM"
    TWO_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_200MM"
    TWO_HUNDRED_FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_250MM"
    TWO_HUNDRED_SEVENTY_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_270MM"
    THREE_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_300MM"
    THREE_HUNDRED_FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_350MM"
    GTE_FOUR_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_ROOF_INSULATION_THICKNESS_GTE_400MM"


class InternalWallType(StrEnum):
    STUD_PARTITION = "HEAT_PUMP_SURVEY_V2_INTERNAL_WALL_TYPE_STUD_PARTITION"
    SOLID_BRICK_OR_BLOCK = "HEAT_PUMP_SURVEY_V2_INTERNAL_WALL_TYPE_SOLID_BRICK_OR_BLOCK"


class WindowType(StrEnum):
    SINGLE_GLAZED = "HEAT_PUMP_SURVEY_V2_WINDOW_TYPE_SINGLE_GLAZED"
    SINGLE_GLAZED_WITH_SECONDARY_GLAZING = "HEAT_PUMP_SURVEY_V2_WINDOW_TYPE_SINGLE_GLAZED_WITH_SECONDARY_GLAZING"
    DOUBLE_GLAZED_6MM = "HEAT_PUMP_SURVEY_V2_WINDOW_TYPE_DOUBLED_GLAZED_UNIT_6MM_GAP"
    DOUBLE_GLAZED_12MM = "HEAT_PUMP_SURVEY_V2_WINDOW_TYPE_DOUBLED_GLAZED_UNIT_12MM_GAP"
    DOUBLE_GLAZED_GTE_16MM = "HEAT_PUMP_SURVEY_V2_WINDOW_TYPE_DOUBLED_GLAZED_UNIT_GTE_16MM_GAP"
    TRIPLE_GLAZED = "HEAT_PUMP_SURVEY_V2_WINDOW_TYPE_TRIPLE_GLAZED"


class ExternalDoorType(StrEnum):
    SINGLE_GLAZED_TIMBER = "HEAT_PUMP_SURVEY_V2_EXTERNAL_DOOR_TYPE_SINGLE_GLAZED"
    SOLID_TIMBER = "HEAT_PUMP_SURVEY_V2_EXTERNAL_DOOR_TYPE_SOLID_TIMBER"
    SINGLE_GLAZED_TIMBER_WITH_SECONDARY_GLAZING = "HEAT_PUMP_SURVEY_V2_EXTERNAL_DOOR_TYPE_SINGLE_GLAZED_TIMBER_WITH_SECONDARY_GLAZING"
    DOUBLE_GLAZED_6MM = "HEAT_PUMP_SURVEY_V2_EXTERNAL_DOOR_TYPE_DOUBLED_GLAZED_UNIT_6MM_GAP"
    DOUBLE_GLAZED_12MM = "HEAT_PUMP_SURVEY_V2_EXTERNAL_DOOR_TYPE_DOUBLED_GLAZED_UNIT_12MM_GAP"
    DOUBLE_GLAZED_GTE_16MM = "HEAT_PUMP_SURVEY_V2_EXTERNAL_DOOR_TYPE_DOUBLED_GLAZED_UNIT_GTE_16MM_GAP"
    TRIPLE_GLAZED = "HEAT_PUMP_SURVEY_V2_EXTERNAL_DOOR_TYPE_TRIPLE_GLAZED"


class IntermediateFloorType(StrEnum):
    TIMBER_FLOOR = "HEAT_PUMP_SURVEY_V2_INTERMEDIATE_FLOOR_TYPE_TIMBER_FLOOR"
    CONCRETE_FLOOR = "HEAT_PUMP_SURVEY_V2_INTERMEDIATE_FLOOR_TYPE_CONCRETE_FLOOR"
    TIMBER_INTERMEDIATE_FLOOR_HEAT_FLOW_UPWARDS = "HEAT_PUMP_SURVEY_V2_INTERMEDIATE_FLOOR_TYPE_TIMBER_INTERMEDIATE_FLOOR_HEAT_FLOW_UPWARDS"
    TIMBER_INTERMEDIATE_FLOOR_HEAT_FLOW_DOWNWARDS = "HEAT_PUMP_SURVEY_V2_INTERMEDIATE_FLOOR_TYPE_TIMBER_INTERMEDIATE_FLOOR_HEAT_FLOW_DOWNWARDS"


class AdditionalIntermediateFloorInsulation(StrEnum):
    NONE = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_INTERMEDIATE_FLOOR_INSULATION_NONE"
    FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_INTERMEDIATE_FLOOR_INSULATION_50mm"
    ONE_HUNDRED_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_INTERMEDIATE_FLOOR_INSULATION_100mm"
    ONE_HUNDRED_FIFTY_MM = "HEAT_PUMP_SURVEY_V2_ADDITIONAL_INTERMEDIATE_FLOOR_INSULATION_150mm"


class RoomFloorCovering(StrEnum):
    TILE_STONE = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_TILE_STONE"
    VINYL_LVT = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_VINYL_LVT"
    LAMINATE_FLOORING = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_LAMINATE_FLOORING"
    HARDWOOD_FLOORING = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_HARDWOOD_FLOORING"
    LOW_TOG_CARPET = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_LOW_TOG_CARPET"
    THICK_PILE_CARPET = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_THICK_PILE_CARPET"
    PARQUET_BLOCKS = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_PARQUET_BLOCKS"
    SOLID_WOOD = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_COVERING_SOLID_WOOD"


class RoomPipeType(StrEnum):
    PIPE_10MM_PLASTIC = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_10MM_PLASTIC"
    PIPE_12MM_PLASTIC = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_12MM_PLASTIC"
    PIPE_15MM_PLASTIC = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_15MM_PLASTIC"
    PIPE_12MM_MLCP = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_12MM_MLCP"
    PIPE_16MM_MLCP = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_16MM_MLCP"
    PIPE_20MM_MLCP = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_20MM_MLCP"
    PIPE_12MM_PEX = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_12MM_PEX"
    PIPE_14MM_PEX = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_14MM_PEX"
    PIPE_16MM_PEX = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_16MM_PEX"
    PIPE_17MM_PEX = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_TYPE_17MM_PEX"


class RoomFloorConstruction(StrEnum):
    SCREED = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_CONSTRUCTION_SCREED"
    OVERLAY_BOARDS = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_CONSTRUCTION_OVERLAY_BOARDS"
    STRUCTURAL_CHIPBOARD = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_CONSTRUCTION_STRUCTURAL_CHIPBOARD"
    SPREADER_PLATES = "HEAT_PUMP_SURVEY_V2_ROOM_FLOOR_CONSTRUCTION_SPREADER_PLATES"


class RoomNumLoops(StrEnum):
    UNKNOWN = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_UNKNOWN"
    FED_FROM_ANOTHER_ROOM = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_FED_FROM_ANOTHER_ROOM"
    ONE_LOOP = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_ONE_LOOP"
    TWO_LOOPS = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_TWO_LOOPS"
    THREE_LOOPS = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_THREE_LOOPS"
    FOUR_LOOPS = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_FOUR_LOOPS"
    FIVE_LOOPS = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_FIVE_LOOPS"
    SIX_LOOPS = "HEAT_PUMP_SURVEY_V2_ROOM_NUM_LOOPS_SIX_LOOPS"


class RoomPipeSpacing(StrEnum):
    SPACING_100MM = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_SPACING_100MM"
    SPACING_150MM = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_SPACING_150MM"
    SPACING_200MM = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_SPACING_200MM"
    SPACING_250MM = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_SPACING_250MM"
    SPACING_300MM = "HEAT_PUMP_SURVEY_V2_ROOM_PIPE_SPACING_300MM"

    @property
    def integer(self) -> int:
        mapping = {
            RoomPipeSpacing.SPACING_100MM: 100,
            RoomPipeSpacing.SPACING_150MM: 150,
            RoomPipeSpacing.SPACING_200MM: 200,
            RoomPipeSpacing.SPACING_250MM: 250,
            RoomPipeSpacing.SPACING_300MM: 300,
        }
        return mapping[self]


class RadiatorPanel(StrEnum):
    SINGLE = "single_panel_radiator"
    DOUBLE = "double_panel_radiator"
    TRIPLE = "triple_panel_radiator"
    COLUMN = "column_radiator"
    DESIGNER = "designer_radiator"
    CAST_IRON = "old_cast_iron_radiator"
    SCHOOL_STYLE = "school_style_radiator"
    TOWEL_RAIL = "heated_towel_rail"


class RadiatorType(StrEnum):
    P1 = "P1"
    P2 = "P2"
    K1 = "K1"
    P_PLUS = "P_PLUS"
    K2 = "K2"
    K2V = "K2V"
    K3 = "K3"
    SCHOOL_STYLE = "SCHOOL_STYLE"
    CAST_IRON = "CAST_IRON"
    DESIGNER = "DESIGNER"
    TOWEL_RAIL = "TOWEL_RAIL"
    COLUMN_2 = "COLUMN_2"
    COLUMN_3 = "COLUMN_3"
    COLUMN_4 = "COLUMN_4"

    @classmethod
    def from_panel(cls, panel: RadiatorPanel, convectors: int) -> RadiatorType:
        lookup: dict[RadiatorPanel, dict[str, RadiatorType]] = {
            RadiatorPanel.SINGLE: {"0": cls.P1, "1": cls.K1, "other": cls.K1},
            RadiatorPanel.DOUBLE: {"0": cls.P2, "1": cls.P_PLUS, "2": cls.K2, "other": cls.P_PLUS},
            RadiatorPanel.TRIPLE: {"other": cls.K3},
            RadiatorPanel.DESIGNER: {"other": cls.DESIGNER},
            RadiatorPanel.TOWEL_RAIL: {"other": cls.TOWEL_RAIL},
            RadiatorPanel.CAST_IRON: {"other": cls.CAST_IRON},
            RadiatorPanel.SCHOOL_STYLE: {"other": cls.SCHOOL_STYLE},
            RadiatorPanel.COLUMN: {"2": cls.COLUMN_2, "3": cls.COLUMN_3, "4": cls.COLUMN_4, "other": cls.COLUMN_2},
        }
        options = lookup[panel]
        return options.get(str(convectors), options["other"])
