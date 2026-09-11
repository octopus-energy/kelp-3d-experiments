"""Command-line proof of concept joining Vieweet data to the heat-loss engine."""

from __future__ import annotations

import argparse
import csv
import dataclasses
import enum
import json
import os
import sys
from pathlib import Path
from typing import Any

from heatloss_engine.calculator import HeatLossCalculator
from heatloss_engine.vieweet_adapter import (
    adapt_vieweet_property,
    audit_vertical_assignments,
    audit_vieweet,
)
from heatloss_engine.vieweet_client import VieweetClient
from heatloss_engine.vieweet_config import load_config
from heatloss_engine.vieweet_report import write_property_report, write_summary_report


TOUR_CODE_COLUMN = "Vieweet Tour Code "
ADDRESS_COLUMN = "Property Address"
REFERENCE_COLUMN = "Vieweet Ref Num #"


def _jsonable(value: Any) -> Any:
    if dataclasses.is_dataclass(value):
        return {field.name: _jsonable(getattr(value, field.name)) for field in dataclasses.fields(value)}
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, list | tuple):
        return [_jsonable(item) for item in value]
    return value


def _load_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open(newline="", encoding="utf-8-sig") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        raise ValueError(f"No data rows found in {csv_path}")
    missing = [column for column in (TOUR_CODE_COLUMN, ADDRESS_COLUMN) if column not in rows[0]]
    if missing:
        raise ValueError(f"CSV is missing required column(s): {', '.join(missing)}")
    return rows


def _area(row: dict[str, str], *columns: str) -> float | None:
    values = []
    for column in columns:
        try:
            values.append(float((row.get(column) or "").strip()))
        except ValueError:
            continue
    return sum(values) if values else None


def _add_audit_warnings(audit: dict[str, Any], warnings: list[str]) -> None:
    checks = (
        ("room_match_coverage_pct", 100, "room measurement match coverage"),
        ("wall_role_coverage_pct", 95, "wall-role coverage"),
        ("opening_wall_link_coverage_pct", 100, "opening-to-wall link coverage"),
    )
    for key, threshold, label in checks:
        value = float(audit.get(key) or 0)
        if value < threshold:
            warnings.append(f"API quality: {label} is {value:.1f}% (target {threshold}%)")
    delta = audit.get("room_area_vs_nia_delta_pct")
    if delta is not None and float(delta) > 10:
        warnings.append(f"API quality: summed room area differs from NIA by {float(delta):.1f}%")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Fetch Vieweet geometry and run the local heat-loss engine.",
    )
    parser.add_argument("--csv", type=Path, required=True, help="Survey CSV containing Vieweet tour codes")
    parser.add_argument("--config", type=Path, help="YAML assumptions/overrides file")
    parser.add_argument("--tour-code", action="append", help="Process only this code; repeat for several")
    parser.add_argument("--limit", type=int, help="Process at most this many selected rows")
    parser.add_argument("--output-dir", type=Path, default=Path("output"))
    parser.add_argument("--cache-dir", type=Path, default=Path(".vieweet-cache"))
    parser.add_argument("--refresh", action="store_true", help="Ignore cached Vieweet responses")
    parser.add_argument(
        "--environment",
        choices=("staging", "production"),
        default=os.environ.get("VIEWEET_ENVIRONMENT", "production"),
    )
    parser.add_argument(
        "--request-interval",
        type=float,
        default=0.65,
        help="Minimum seconds between API calls (default stays below 100/min)",
    )
    return parser


def run(args: argparse.Namespace) -> int:
    rows = _load_rows(args.csv)
    selected_codes = set(args.tour_code or [])
    selected = [row for row in rows if not selected_codes or row[TOUR_CODE_COLUMN].strip() in selected_codes]
    if args.limit is not None:
        selected = selected[: args.limit]
    if not selected:
        raise ValueError("No CSV rows matched the requested tour code(s)")

    config = load_config(args.config)
    client = VieweetClient.from_environment(
        environment=args.environment,
        cache_dir=args.cache_dir,
        refresh=args.refresh,
        min_request_interval=args.request_interval,
    )

    summary_rows: list[dict[str, Any]] = []
    succeeded = 0
    for index, row in enumerate(selected, start=1):
        tour_code = row[TOUR_CODE_COLUMN].strip()
        address = row[ADDRESS_COLUMN].strip()
        print(f"[{index}/{len(selected)}] {tour_code}: fetching", flush=True)
        try:
            measurements = client.get_measurements(tour_code)
            geometry = client.get_geometry(tour_code)
            audit = audit_vieweet(measurements, geometry)
            adapted = adapt_vieweet_property(
                tour_code=tour_code,
                csv_address=address,
                measurements=measurements,
                geometry=geometry,
                config=config,
            )
            audit.update(audit_vertical_assignments(adapted.vertical_assignments))
            warnings = list(adapted.warnings)
            _add_audit_warnings(audit, warnings)
            calculation = HeatLossCalculator(adapted.property_data).calculate_heat_loss()
            calculation_payload = _jsonable(calculation)
            payload = {
                "source": {
                    "csv_reference": row.get(REFERENCE_COLUMN),
                    "tour_code": tour_code,
                    "address": address,
                    "postcode": adapted.postcode,
                    "environment": args.environment,
                },
                "calculation": calculation_payload,
                "mapping": {
                    "room_ids": adapted.room_ids,
                    "room_metadata": adapted.room_metadata,
                    "assumptions_by_room": adapted.assumptions_by_room,
                    "vertical_assignments": adapted.vertical_assignments,
                },
                "api_audit": audit,
                "warnings": warnings,
                "disclaimer": "Proof of concept using assumed fabric values; not a surveyed fabric assessment.",
            }
            property_output = args.output_dir / tour_code
            json_path, report_path = write_property_report(property_output, payload, geometry)
            succeeded += 1
            print(
                f"[{index}/{len(selected)}] {tour_code}: {calculation.total_heatloss/1000:.2f} kW -> {report_path}",
                flush=True,
            )
            summary_rows.append(
                {
                    "csv_reference": row.get(REFERENCE_COLUMN),
                    "tour_code": tour_code,
                    "address": address,
                    "status": "ok",
                    "postcode": adapted.postcode,
                    "room_count": len(calculation.rooms),
                    "modelled_floor_area_m2": calculation.total_floor_sqm,
                    "vieweet_csv_floor_area_m2": _area(
                        row,
                        "Vieweet - Ground Floor Area",
                        "Vieweet - 1st Floor Area",
                        "Vieweet - 2nd Floor Area (could be loft)",
                        "Vieweet - 3rd Floor Area",
                    ),
                    "planup_csv_floor_area_m2": _area(
                        row,
                        "Plan Up - Ground Floor Area ",
                        "Plan Up - 1st Floor Area",
                        "Plan Up - 2nd Floor area (RIR - do not include loft)",
                    ),
                    "total_heatloss_w": calculation.total_heatloss,
                    "warning_count": len(warnings),
                    "report": report_path.relative_to(args.output_dir).as_posix(),
                    "json": json_path.relative_to(args.output_dir).as_posix(),
                    "error": "",
                }
            )
        except Exception as error:  # batch mode intentionally records per-property failures
            print(f"[{index}/{len(selected)}] {tour_code}: ERROR {error}", file=sys.stderr, flush=True)
            summary_rows.append(
                {
                    "csv_reference": row.get(REFERENCE_COLUMN),
                    "tour_code": tour_code,
                    "address": address,
                    "status": "error",
                    "postcode": "",
                    "room_count": "",
                    "modelled_floor_area_m2": "",
                    "vieweet_csv_floor_area_m2": "",
                    "planup_csv_floor_area_m2": "",
                    "total_heatloss_w": "",
                    "warning_count": "",
                    "report": "",
                    "json": "",
                    "error": str(error),
                }
            )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = args.output_dir / "summary.csv"
    with summary_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(summary_rows[0]))
        writer.writeheader()
        writer.writerows(summary_rows)
    summary_report_path = write_summary_report(args.output_dir, summary_rows)
    print(
        f"Completed {succeeded}/{len(selected)} properties. Summary: {summary_path}; visual: {summary_report_path}",
        flush=True,
    )
    return 0 if succeeded else 1


def main() -> None:
    try:
        raise SystemExit(run(_parser().parse_args()))
    except (FileNotFoundError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2) from error


if __name__ == "__main__":
    main()
