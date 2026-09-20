from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time


@dataclass(frozen=True)
class NormalizedTask:
    task_id: str
    source_system: str
    source_record_id: str
    department: str
    asset_id: str
    corridor_id: str
    defect_type: str
    defect_severity: str
    days_overdue: int
    estimated_hours: float
    asset_age_years: int
    status: str = "PENDING"
    criticality_score: float | None = None
    source_updated_at: datetime | None = None

    def as_dict(self) -> dict:
        return self.__dict__.copy()


@dataclass(frozen=True)
class NormalizedBlockWindow:
    window_id: str
    source_system: str
    source_record_id: str
    corridor_id: str
    window_date: date
    start_time: time
    end_time: time
    available_hours: float
    status: str = "AVAILABLE"
    source_updated_at: datetime | None = None

    def as_dict(self) -> dict:
        return self.__dict__.copy()
