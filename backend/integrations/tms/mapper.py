from __future__ import annotations

from integrations.common.contracts import NormalizedTask


def map_tms_record(record: dict) -> dict:
    source_id = str(record["task_id"])
    return NormalizedTask(
        task_id=f"TMS-{source_id}",
        source_system="TMS",
        source_record_id=source_id,
        department="Engineering",
        asset_id=str(record.get("asset_id", f"TRK-{source_id}")),
        corridor_id=str(record["corridor_id"]),
        defect_type=str(record.get("defect_type", "TRACK_DEFECT")),
        defect_severity=str(record["defect_severity"]),
        days_overdue=int(record.get("days_overdue", 0)),
        estimated_hours=float(record["estimated_hours"]),
        asset_age_years=int(record.get("asset_age_years", 0)),
    ).as_dict()
