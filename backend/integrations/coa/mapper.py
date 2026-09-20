from __future__ import annotations

from datetime import date, datetime, time, timedelta

from integrations.common.contracts import NormalizedBlockWindow


def _parse_time(value: str) -> time:
    return datetime.strptime(value, "%H:%M").time()


def map_coa_record(record: dict, base_date: date | None = None) -> dict:
    source_id = str(record["window_id"])
    day = str(record.get("day", "Mon"))
    day_offsets = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}
    anchor = base_date or date.today()
    monday = anchor - timedelta(days=anchor.weekday())
    window_date = monday + timedelta(days=day_offsets.get(day, 0))
    available_hours = float(record["available_hours"])
    start_hour = int(record.get("start_hour", 1))
    start = time(start_hour, 0)
    end = time((start_hour + int(available_hours)) % 24, 0)
    if start_hour + int(available_hours) >= 24:
        raise ValueError("Sample COA windows cannot cross midnight")

    return NormalizedBlockWindow(
        window_id=f"COA-{source_id}",
        source_system="COA",
        source_record_id=source_id,
        corridor_id=str(record["corridor_id"]),
        window_date=window_date,
        start_time=start,
        end_time=end,
        available_hours=available_hours,
    ).as_dict()
