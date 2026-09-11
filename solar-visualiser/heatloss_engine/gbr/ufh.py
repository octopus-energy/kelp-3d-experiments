"""
Underfloor heating calculation.

UFHInputs → UFH.compute_outputs() → UFHOutputs

The hydraulic model uses Darcy-Weisbach friction with Swamee-Jain approximation.
The thermal model uses the SAM factor (a polynomial of floor resistance and pipe spacing
per floor construction type).
"""

from __future__ import annotations

import math
from functools import cached_property
from typing import assert_never

import attrs

from heatloss_engine.enums import (
    RoomFloorConstruction,
    RoomFloorCovering,
    RoomNumLoops,
    RoomPipeSpacing,
    RoomPipeType,
)


def convert_number_of_loops(raw: RoomNumLoops | None) -> int | None:
    """
    Map a RoomNumLoops survey value to an integer loop count.
    Returns None when the count is unknown or fed from another room.
    """
    if raw is None:
        return None
    match raw:
        case RoomNumLoops.UNKNOWN:
            return None
        case RoomNumLoops.FED_FROM_ANOTHER_ROOM:
            return None
        case RoomNumLoops.ONE_LOOP:
            return 1
        case RoomNumLoops.TWO_LOOPS:
            return 2
        case RoomNumLoops.THREE_LOOPS:
            return 3
        case RoomNumLoops.FOUR_LOOPS:
            return 4
        case RoomNumLoops.FIVE_LOOPS:
            return 5
        case RoomNumLoops.SIX_LOOPS:
            return 6
        case _:
            assert_never(raw)


@attrs.frozen
class UFHInputs:
    pipe_type: RoomPipeType
    required_total_power: float         # W — from room-specific heat loss calculation
    room_temp: float                    # °C — design temperature for the room
    room_area: float                    # m²
    unheated_area: float                # m²
    additional_active_area: float       # m²
    pipe_spacing: RoomPipeSpacing
    service_pipe_length: float          # m
    number_of_loops: int | None         # None → inferred from geometry
    floor_construction: RoomFloorConstruction
    floor_covering: RoomFloorCovering
    remaining_head_primary: float = 69.0  # kPa — available head after primary circuit losses


@attrs.frozen
class UFHOutputs:
    """
    Outputs from the UFH calculation.

    Attributes:
        final_mass_flow: mass flow per loop (kg/s)
        total_output_power: W
        floor_intensity: W/m² (heat output per unit floor area, known as q)
        room_flow_rate: total mass flow across all loops (kg/s)
        delta_temp: flow/return temperature difference (°C)
        pressure_drop: kPa
        mean_temp: mean water temperature (°C)
        power_coverage: ratio of output to required power (1.0 = exactly meets demand)
        is_pressure_limited: True when output is constrained by available head
        max_flow_temp: maximum allowable flow temperature (°C), or None when unconstrained
    """

    final_mass_flow: float
    total_output_power: float
    floor_intensity: float
    room_flow_rate: float
    delta_temp: float
    pressure_drop: float
    mean_temp: float
    power_coverage: float
    is_pressure_limited: bool = True
    max_flow_temp: float | None = None


@attrs.frozen
class PipeData:
    wall_thickness: float
    inner_diameter_m: float
    litre_per_meter: float
    roughness: float
    spacing: int


class UFHError(Exception): ...


@attrs.frozen
class UFH:
    inputs: UFHInputs
    flow_temp: float = 50.0    # °C — fixed flow temperature
    cp: float = 4180.0         # J/kg·K — specific heat capacity of water
    efficiency: float = 1.0    # system efficiency (assumed 100%)
    max_over_output: float = 1.4  # maximum allowable output as a multiple of required power
    max_iterations_power: int = 50

    @cached_property
    def _pipe_data(self) -> PipeData:
        pipe_type = self.inputs.pipe_type
        match pipe_type:
            case RoomPipeType.PIPE_10MM_PLASTIC:
                thickness, inner_mm, lpm = 1.75, 6.5, 0.033
            case RoomPipeType.PIPE_12MM_PLASTIC:
                thickness, inner_mm, lpm = 1.75, 8.5, 0.057
            case RoomPipeType.PIPE_15MM_PLASTIC:
                thickness, inner_mm, lpm = 1.75, 11.5, 0.1
            case RoomPipeType.PIPE_12MM_MLCP:
                thickness, inner_mm, lpm = 1.6, 8.8, 0.06
            case RoomPipeType.PIPE_16MM_MLCP:
                thickness, inner_mm, lpm = 2.0, 12.0, 0.11
            case RoomPipeType.PIPE_20MM_MLCP:
                thickness, inner_mm, lpm = 2.25, 15.5, 0.19
            case RoomPipeType.PIPE_12MM_PEX:
                thickness, inner_mm, lpm = 2.0, 8.0, 0.0503
            case RoomPipeType.PIPE_14MM_PEX:
                thickness, inner_mm, lpm = 2.0, 10.0, 0.079
            case RoomPipeType.PIPE_16MM_PEX:
                thickness, inner_mm, lpm = 2.0, 12.0, 0.11
            case RoomPipeType.PIPE_17MM_PEX:
                thickness, inner_mm, lpm = 2.0, 13.0, 0.133
            case _:
                assert_never(pipe_type)

        match self.inputs.pipe_spacing:
            case RoomPipeSpacing.SPACING_100MM:
                spacing = 100
            case RoomPipeSpacing.SPACING_150MM:
                spacing = 150
            case RoomPipeSpacing.SPACING_200MM:
                spacing = 200
            case RoomPipeSpacing.SPACING_250MM:
                spacing = 250
            case RoomPipeSpacing.SPACING_300MM:
                spacing = 300
            case _:
                assert_never(self.inputs.pipe_spacing)

        return PipeData(
            wall_thickness=thickness,
            inner_diameter_m=inner_mm / 1000,
            litre_per_meter=lpm,
            roughness=0.000007,
            spacing=spacing,
        )

    @property
    def _density(self) -> float:
        return 1000.0 + -0.0661 * self.flow_temp + -0.00361 * (self.flow_temp ** 2)

    @property
    def _viscosity(self) -> float:
        t = self.flow_temp
        return (
            0.00000179
            + -0.0000000556 * t
            + 0.000000000998 * t ** 2
            + -9.21e-12 * t ** 3
            + 3.3e-14 * t ** 4
        )

    @property
    def _number_of_loops(self) -> int:
        if self.inputs.number_of_loops is not None:
            return self.inputs.number_of_loops
        spacing_factor = 80.0 if self._pipe_data.inner_diameter_m < 0.0115 else 115.0
        effective_spacing = (
            spacing_factor - (self.inputs.service_pipe_length * 2.0)
        ) / (1000.0 / self._pipe_data.spacing)
        active_area = self.inputs.room_area - self.inputs.unheated_area
        return math.ceil(active_area / effective_spacing)

    @property
    def _active_floor_area(self) -> float:
        return self.inputs.room_area - self.inputs.unheated_area

    @property
    def _floor_area(self) -> float:
        return self._active_floor_area / self._number_of_loops

    @property
    def _pipe_length(self) -> float:
        return (
            (self._active_floor_area + self.inputs.additional_active_area)
            / self._number_of_loops
            * (1000.0 / self._pipe_data.spacing)
            + (2.0 * self.inputs.service_pipe_length)
        )

    @cached_property
    def _floor_resistance(self) -> float:
        match self.inputs.floor_covering:
            case RoomFloorCovering.TILE_STONE:
                return 0.01
            case RoomFloorCovering.VINYL_LVT:
                return 0.05
            case (
                RoomFloorCovering.LAMINATE_FLOORING
                | RoomFloorCovering.HARDWOOD_FLOORING
                | RoomFloorCovering.LOW_TOG_CARPET
            ):
                return 0.1
            case (
                RoomFloorCovering.THICK_PILE_CARPET
                | RoomFloorCovering.PARQUET_BLOCKS
                | RoomFloorCovering.SOLID_WOOD
            ):
                return 0.15
            case _:
                assert_never(self.inputs.floor_covering)

    @cached_property
    def _sam_factor(self) -> float:
        r = self._floor_resistance
        s = self._pipe_data.spacing
        match self.inputs.floor_construction:
            case RoomFloorConstruction.SCREED:
                return (
                    9.7341
                    - 85.5219 * r
                    - 0.0311 * s
                    + 462.6164 * r ** 2
                    + 0.00005635 * s ** 2
                    + 0.2231 * r * s
                    - 1029.6825 * r ** 3
                    - 0.5566 * r ** 2 * s
                    - 0.000163 * r * s ** 2
                    - 0.0000000567 * s ** 3
                )
            case RoomFloorConstruction.SPREADER_PLATES:
                return (
                    20.2129461
                    - 0.193370592 * s
                    - 12.2285716 * r
                    + 0.0157142867 * s * r
                    + 0.000532548666 * s ** 2
                    + 18.1904764 * r ** 2
                )
            case RoomFloorConstruction.STRUCTURAL_CHIPBOARD:
                return 3.51 + -19.1 * r + 114 * r ** 2 + -320 * r ** 3
            case RoomFloorConstruction.OVERLAY_BOARDS:
                if s == 150:
                    return 4 * 2.718 ** (-4.35 * r)
                return 3.47 * 2.718 ** (-4.01 * r)
            case _:
                assert_never(self.inputs.floor_construction)

    def _calculate_velocity(self, mass_flow: float) -> float:
        return (4 * mass_flow) / (self._density * math.pi * self._pipe_data.inner_diameter_m ** 2)

    def _compute_pressure_loss(self, mass_flow: float) -> float:
        """Returns pressure loss in Pa (Darcy-Weisbach with Swamee-Jain friction factor)."""
        pipe_id = self._pipe_data.inner_diameter_m
        velocity = self._calculate_velocity(mass_flow)
        reynolds_number = velocity * pipe_id / self._viscosity
        friction_factor = 0.25 / (
            math.log10((self._pipe_data.roughness / pipe_id / 3.7) + 5.74 / reynolds_number ** 0.9) ** 2
        )
        delta_pl = friction_factor * (self._density / 2) * (velocity ** 2 / pipe_id)
        return delta_pl * self._pipe_length

    def _compute_max_mass_flow(self) -> float:
        """Bisection solver: finds max mass flow within available head (1000 iterations)."""
        flow_min = 0.0001
        flow_max = 100.0
        initial_guess = 0.03
        tolerance = 1e-6

        flow_mid = initial_guess
        pressure_mid = self._compute_pressure_loss(flow_mid)
        total_pressure_loss = self.inputs.remaining_head_primary * 1000.0  # kPa → Pa

        if pressure_mid < total_pressure_loss:
            flow_min = flow_mid
            flow_max = flow_mid * 10.0
        else:
            flow_max = flow_mid
            flow_min = flow_mid / 10.0

        for _ in range(1000):
            flow_mid = (flow_min + flow_max) / 2.0
            pressure_mid = self._compute_pressure_loss(flow_mid)

            if abs(pressure_mid - total_pressure_loss) < tolerance or (flow_max - flow_min) < tolerance:
                return flow_mid

            if pressure_mid < total_pressure_loss:
                flow_min = flow_mid
            else:
                flow_max = flow_mid

        raise UFHError("Could not converge on max mass flow within 1000 iterations")

    def compute_outputs(self) -> UFHOutputs:
        """
        Main UFH calculation.

        Computes outputs at max available flow, then reduces delta-T to avoid
        over-sizing when the system can deliver more than required.
        """
        max_mass_flow = self._compute_max_mass_flow()

        df = self.flow_temp - self.inputs.room_temp
        k = self._sam_factor * self._floor_area / (max_mass_flow * self.cp * self.efficiency)
        delta_t = (2 * k * df) / (2 + k)
        t_mean = self.flow_temp - delta_t / 2
        q = self._sam_factor * (t_mean - self.inputs.room_temp)
        total_power = q * self._floor_area * self._number_of_loops

        max_outputs = UFHOutputs(
            final_mass_flow=max_mass_flow,
            total_output_power=total_power,
            floor_intensity=q,
            room_flow_rate=max_mass_flow * self._number_of_loops,
            delta_temp=delta_t,
            pressure_drop=self._compute_pressure_loss(max_mass_flow) / 1000,
            mean_temp=t_mean,
            power_coverage=total_power / self.inputs.required_total_power,
            is_pressure_limited=True,
        )

        if total_power < self.inputs.required_total_power:
            return max_outputs

        ideal_delta_t_mean = (
            self.inputs.room_temp
            + self.inputs.required_total_power / self._number_of_loops / self._floor_area / self._sam_factor
        )
        ideal_delta_t = 2 * (self.flow_temp - ideal_delta_t_mean)

        min_dt = 2
        max_dt = min(25, self.flow_temp - self.inputs.room_temp - 1)

        over_total_power = self.max_over_output * self.inputs.required_total_power
        over_q = over_total_power / self._floor_area / self._number_of_loops
        over_t_mean = self.inputs.room_temp + over_q / self._sam_factor
        over_delta_t = 2 * (self.flow_temp - over_t_mean)

        if ideal_delta_t <= 10:
            delta_t = max(min_dt, min(ideal_delta_t, max_dt))
            max_flow_temp: float | None = math.floor(over_t_mean + 5)
        else:
            target_dt = min(10, max_dt)
            return_temp_at_target = self.flow_temp - target_dt
            t_mean_at_target = (self.flow_temp + return_temp_at_target) / 2
            q_at_target = self._sam_factor * (t_mean_at_target - self.inputs.room_temp)
            total_power_at_target = q_at_target * self._floor_area * self._number_of_loops

            if total_power_at_target <= over_total_power:
                delta_t = target_dt
                max_flow_temp = None
            else:
                delta_t = max(10, min(over_delta_t, max_dt))
                max_flow_temp = math.floor(over_t_mean + 5)

        return_temp = self.flow_temp - delta_t
        t_mean = (self.flow_temp + return_temp) / 2
        q = self._sam_factor * (t_mean - self.inputs.room_temp)
        total_power = q * self._floor_area * self._number_of_loops
        final_mass_flow = q * self._floor_area / (self.cp * delta_t * self.efficiency)

        if final_mass_flow > max_mass_flow:
            return max_outputs

        return UFHOutputs(
            final_mass_flow=final_mass_flow,
            total_output_power=total_power,
            floor_intensity=q,
            room_flow_rate=final_mass_flow * self._number_of_loops,
            delta_temp=delta_t,
            pressure_drop=self._compute_pressure_loss(final_mass_flow) / 1000,
            mean_temp=t_mean,
            power_coverage=total_power / self.inputs.required_total_power,
            is_pressure_limited=False,
            max_flow_temp=max_flow_temp,
        )
