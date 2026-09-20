from __future__ import annotations

VALID_SEVERITIES = {"A", "B", "C"}
VALID_TASK_SOURCES = {"TMS", "SMMS", "TDMS"}


def validate_task(record: dict) -> None:
    required = {
        "task_id", "source_system", "source_record_id", "department", "asset_id",
        "corridor_id", "defect_type", "defect_severity", "days_overdue", "estimated_hours",
        "asset_age_years",
    }
    missing = required - record.keys()
    if missing:
        raise ValueError(f"Task missing required fields: {sorted(missing)}")
    if record["source_system"] not in VALID_TASK_SOURCES:
        raise ValueError(f"Invalid task source_system: {record['source_system']}")
    if record["defect_severity"] not in VALID_SEVERITIES:
        raise ValueError(f"Invalid defect severity: {record['defect_severity']}")
    if int(record["days_overdue"]) < 0:
        raise ValueError("days_overdue cannot be negative")
    if float(record["estimated_hours"]) <= 0:
        raise ValueError("estimated_hours must be greater than zero")


def validate_window(record: dict) -> None:
    required = {
        "window_id", "source_system", "source_record_id", "corridor_id", "window_date",
        "start_time", "end_time", "available_hours",
    }
    missing = required - record.keys()
    if missing:
        raise ValueError(f"Window missing required fields: {sorted(missing)}")
    if record["source_system"] != "COA":
        raise ValueError("Block windows must come from COA")
    if float(record["available_hours"]) <= 0:
        raise ValueError("available_hours must be greater than zero")
